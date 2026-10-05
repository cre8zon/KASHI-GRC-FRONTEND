/**
 * inboxRoute — one resolver for everything that lands in somebody's inbox.
 *
 * ── THE PROBLEM THIS REPLACES ─────────────────────────────────────────────
 *
 * A workflow task and an action item are the same shape to the person looking
 * at them: a thing to do, an entity it is about, a screen to go to and some
 * buttons when you get there. They were resolved two completely different ways.
 *
 *   TaskInbox          task.navKey → ui_navigation row → route → replace :id
 *                      → append ?taskId=&stepInstanceId=
 *
 *   ActionItemsPage    JSON.parse(item.navContext) → assigneeRoute /
 *                      reviewerRoute, each a full path written into a Java
 *                      string literal by whichever controller raised the item
 *
 * The second one cannot be maintained. Changing where vendor assessments open
 * meant editing ui_navigation for tasks (sql/84) AND rewriting Java string
 * literals AND backfilling every row already written (sql/86) — two mechanisms,
 * two migrations, for one decision. And a combined inbox built on top would
 * have had to keep both rules inside it forever.
 *
 * So action items gained nav_key and assigner_nav_key: the same two columns
 * workflow_steps already carries, with the same meaning. This module is the one
 * resolver that reads them, and both inboxes call it.
 *
 * ── WHAT IS STILL DIFFERENT, AND WHY IT SHOULD BE ────────────────────────
 *
 * nav_context does not go away. A nav row answers "which screen"; it cannot
 * answer "which question, opened, with the openWork bypass, for THIS item".
 * Those are per-item facts and they belong on the item. So:
 *
 *   route   comes from nav_key when there is one, else from nav_context
 *   params  always come from the item
 *
 * An item written before nav_key existed has none, falls through to
 * nav_context, and behaves exactly as it does today. Nothing has to be migrated
 * for anything to keep working — which is the only reason it is safe to change
 * a routing rule that every module's inbox depends on.
 *
 * ── WHICH OF THE TWO SCREENS ─────────────────────────────────────────────
 *
 * Both kinds have two audiences: the person doing the work and the person
 * checking it. The choice is made on WHO THE VIEWER IS, never on whether they
 * could close the item — a distinction that was already learned the hard way
 * here. canResolve is also true for someone doing group-assigned work, because
 * KashiGuard writes a resolutionRole on everything it raises, so using it to
 * pick the screen sent vendor contributors to the organisation's review page
 * and a dead end that read "Assessment not found".
 */

/** Join a route that may already carry a query string with more params. */
export function appendParams(route, params = {}) {
  if (!route) return route
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    // Never add a parameter the route already names — a nav row may bake one in.
    .filter(([k]) => !new RegExp(`[?&]${k}=`).test(route))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  if (!pairs.length) return route
  return route + (route.includes('?') ? '&' : '?') + pairs.join('&')
}

/** ui_navigation row → path, with :id filled in. Null when there is no row. */
function routeForNavKey(navKey, artifactId, navItems) {
  if (!navKey) return null
  const nav = (navItems || []).find(n => n.navKey === navKey)
  if (!nav?.route) return null
  return artifactId != null ? nav.route.replace(':id', artifactId) : nav.route
}

/**
 * Nav keys that might carry the issue module's route, most specific first.
 *
 * Tried before the literal below so a ui_navigation row still wins — the whole
 * reason nav_key exists is that a route change should be one row and not a code
 * change. None of these is guaranteed to be seeded, which is why the fallback
 * is here rather than this returning null.
 */
const ISSUE_NAV_KEYS = ['issue_detail', 'issue', 'issues']

/**
 * Where an ESCALATED item opens: the record it was escalated INTO.
 *
 * ── WHY THIS IS NOT A nav_key ON THE ITEM ────────────────────────────────
 * It cannot be. routeForNavKey fills ':id' from artifactId, and artifactId is
 * `parentEntityId ?? entityId` — the ASSESSMENT for a finding raised on one of
 * its questions. Point a finding's nav_key at an issue route and you get
 * /module/issue/{assessmentId}: a valid-looking URL that opens a different
 * record, silently. The id has to come from linkedIssueId, so the rule lives
 * here where that field is in hand.
 *
 * ── WHY IT IS A GENERAL RULE AND NOT AN ASSESSMENT ONE ───────────────────
 * "Escalated work opens where it was escalated to" is true of anything that
 * escalates. The resolver already refuses to know what QUESTION_RESPONSE means;
 * it does not need to know what a vendor assessment is either. Any module that
 * writes linkedIssueId gets this for free.
 */
function routeForLinkedIssue(issueId, navItems) {
  if (issueId == null) return null
  for (const key of ISSUE_NAV_KEYS) {
    const r = routeForNavKey(key, issueId, navItems)
    if (r) return r
  }
  return `/module/issue/${issueId}`
}

/**
 * Where a WORKFLOW TASK opens.
 *
 * `fallback(task)` lets the caller keep its own entityType-based fallbacks
 * (TaskInbox has a table of them for steps saved before nav_key existed)
 * without this module knowing about any particular module's entity types.
 */
export function resolveTaskRoute(task, navItems, fallback) {
  if (!task?.artifactId) return null
  const params = { taskId: task.id, stepInstanceId: task.stepInstanceId }

  const byNav = routeForNavKey(task.navKey, task.artifactId, navItems)
  if (byNav) return appendParams(byNav, params)

  const fb = typeof fallback === 'function' ? fallback(task) : null
  return fb ? appendParams(fb.replace(':id', task.artifactId), params) : null
}

/**
 * Where an ACTION ITEM opens.
 *
 * viewerId decides the screen: the assignee (or a member of the assigned group)
 * gets nav_key, anyone else who may resolve it gets assigner_nav_key.
 *
 * The artifact is parentEntityId when the item has one — a remediation on a
 * question belongs to an assessment, and the assessment is what opens — and
 * entityId otherwise, for an item raised directly on the thing it is about.
 *
 * entityType and entityId are always appended so the destination can focus the
 * right row. The module reading them knows what its own entity types mean;
 * this resolver does not need to.
 */
export function resolveActionItemRoute(item, navItems, viewerId) {
  if (!item) return null

  let ctx = null
  try { ctx = item.navContext ? JSON.parse(item.navContext) : null } catch { ctx = null }

  const isMine = item.assignedTo != null
    ? String(item.assignedTo) === String(viewerId)
    : !!item.assignedGroupRole

  const artifactId = item.parentEntityId ?? item.entityId

  // openWork lifts the section lock so a reopened question can be answered
  // again. An ASSIGNMENT is not a reopen — the section lock must still apply,
  // or a contributor could edit a section their responder already submitted.
  const isAssignment = ['CONTRIBUTOR_ASSIGNMENT', 'REVIEWER_ASSIGNMENT']
    .includes(item.remediationType)

  const params = {
    actionItemId: item.id,
    entityType:   item.entityType,
    entityId:     item.entityId,
    // Kept alongside entityId rather than replaced by it: the destination
    // screens already read this name, and an item written before nav_key
    // existed carries it inside nav_context where only this can find it.
    questionInstanceId: ctx?.questionInstanceId
      ?? (item.entityType === 'QUESTION_RESPONSE' ? item.entityId : undefined),
  }

  const asAssignee = () => {
    // ── ESCALATED WORK MOVED ────────────────────────────────────────────
    //
    // Once a finding carries linkedIssueId, the Issue is where the work
    // happens: it holds the remediation workflow, the evidence and the
    // validate-and-close steps. The questionnaire is deliberately NOT the
    // destination any more — the submitted answer is the point-in-time record
    // of what was found, and clearing a finding by editing it would overwrite
    // the evidence of the gap with the fix for it.
    //
    // nav_key stays on the item as the destination for a finding that never
    // escalated (no owner, or escalation failed), so this overtakes it rather
    // than replacing it.
    //
    // openWork is not appended here: it exists to lift the assessment's
    // section lock so one question can be answered again, and that is not what
    // this route is for.
    const escalated = routeForLinkedIssue(item.linkedIssueId, navItems)
    if (escalated) return appendParams(escalated, { actionItemId: item.id })

    const byNav = routeForNavKey(item.navKey, artifactId, navItems)
    const route = byNav || ctx?.assigneeRoute || ctx?.route
    if (!route) return null
    return appendParams(route, isAssignment ? params : { ...params, openWork: 1 })
  }

  const asReviewer = () => {
    // Deliberately NOT redirected to the Issue the way the assignee side is.
    // The two audiences want different screens: the vendor needs the
    // remediation record, the reviewer needs to see the answer that was found
    // wanting, in its section, with the rest of their review around it. Sending
    // them to the Issue would show them the fix with none of the context that
    // made it a finding. The asymmetry is the point, not an oversight.
    const byNav = routeForNavKey(item.assignerNavKey, artifactId, navItems)
    const route = byNav || ctx?.reviewerRoute
    if (!route) return null
    return appendParams(route, params)
  }

  if (isMine) {
    const r = asAssignee()
    if (r) return r
  }
  if (item.canResolve) {
    const r = asReviewer()
    if (r) return r
  }
  return asAssignee() || asReviewer()
}

/**
 * Both kinds, in one list, in the shape an inbox renders.
 *
 * Deliberately NOT a merged backend endpoint. Tasks and action items have
 * different permissions, different scoping and different lifecycles, and
 * joining them server-side would mean one query that has to be right about
 * both. Two calls the client already makes, normalised here, keeps each answer
 * owned by the service that understands it.
 */
/**
 * `meta` is a list of {label, value} the row renders as one line.
 *
 * Built per kind rather than in the row component, deliberately. The row stays
 * generic — it knows how to lay out pairs and nothing about workflows or
 * remediations — while each normaliser decides what is worth a reader's
 * attention for its own kind. Adding a field to one never touches the other.
 *
 * Nulls are dropped here so the row never has to test each one.
 */
const meta = (...pairs) =>
  pairs.filter(p => p && p[1] !== undefined && p[1] !== null && p[1] !== '')
       .map(([label, value]) => ({ label, value: String(value) }))

export function normaliseTask(task, navItems, fallback) {
  return {
    kind:        'TASK',
    key:         `T${task.id}`,
    id:          task.id,
    title:       task.stepName || task.workflowName || `Task #${task.id}`,
    subtitle:    task.entityTitle || task.workflowName || null,
    description: null,
    entityType:  task.entityType,
    status:      task.status,
    priority:    task.priority || null,
    dueAt:       task.slaDueAt || task.dueAt || null,
    createdAt:   task.createdAt || null,
    // Arrival, not creation of the workflow: assignedAt is when this landed in
    // front of THIS person, which is what an inbox orders by.
    at:          task.assignedAt || task.createdAt || null,
    route:       resolveTaskRoute(task, navItems, fallback),
    // What a person needs to decide whether to open it: which record, which
    // workflow, and whether they are doing it or watching it.
    meta: meta(
      ['On',       task.entityTitle],
      ['Workflow', task.workflowName],
      ['Step',     task.resolvedStepAction],
      ['As',       task.taskRole],
      ['Org',      task.tenantName],
    ),
    raw:         task,
  }
}

export function normaliseActionItem(item, navItems, viewerId) {
  return {
    kind:        'ACTION_ITEM',
    key:         `A${item.id}`,
    id:          item.id,
    title:       item.title,
    subtitle:    item.remediationType
      ? item.remediationType.replace(/_/g, ' ').toLowerCase()
      : null,
    description: item.description || null,
    entityType:  item.entityType,
    status:      item.status,
    priority:    item.priority || null,
    severity:    item.severity || null,
    dueAt:       item.dueAt || null,
    createdAt:   item.createdAt || null,
    at:          item.createdAt || null,
    route:       resolveActionItemRoute(item, navItems, viewerId),
    // The same facts the action items page shows on its card, minus the ones a
    // single line cannot carry. "Raised by" is first because on a remediation
    // it is the question a vendor asks before anything else.
    meta: meta(
      ['Raised by', item.createdByName],
      ['Assigned',  item.assignedToName || item.assignedGroupRole],
      ['Validator', item.resolutionReservedForName],
      ['Severity',  item.severity],
      // Says where the row is about to take you. Without it an escalated
      // finding is a row titled "Remediation required" that opens the issue
      // module, and the reader has to click to find out why.
      ['Issue',     item.linkedIssueId ? `#${item.linkedIssueId}` : null],
      ['Ref',       `#${item.id}`],
    ),
    raw:         item,
  }
}

/**
 * ── THE INBOX IS ORDERED BY TIME, NOT BY URGENCY ─────────────────────────
 *
 * The first version of this sorted overdue first, then by due date, then by
 * severity. That is a work QUEUE — the tool deciding what you should look at.
 * An inbox is a record of what arrived, newest first, and everybody already
 * knows how to read one because every mail client works that way.
 *
 * The cost of that choice is real and worth naming: an overdue item can sit
 * below forty newer ones. So urgency is not thrown away, it is moved off the
 * sort and onto the row — an overdue entry carries a red marker, and the page
 * header counts them and can filter to them. Marking beats reordering here,
 * because reordering by overdue is the same segregation as grouping by source,
 * just on a different axis: the list stops being a timeline and you can no
 * longer tell what is new.
 *
 * `at` is the arrival time, which is the only timestamp both kinds share and
 * the only one that means "this appeared in front of you":
 *   task         assignedAt, falling back to createdAt
 *   action item  createdAt
 */
export function inboxTime(entry) {
  return entry?.at ? new Date(entry.at).getTime() : 0
}

/** Newest arrival first. Ties broken by key so the order is stable. */
export function sortInbox(entries) {
  return [...entries].sort((a, b) => {
    const d = inboxTime(b) - inboxTime(a)
    if (d) return d
    return String(a.key).localeCompare(String(b.key))
  })
}

/**
 * Day buckets, in list order, so the merged list reads as a timeline rather
 * than as an undifferentiated scroll.
 *
 * Buckets are computed from the viewer's local midnight, not from a fixed
 * number of hours: something that arrived at 11pm last night is "Yesterday",
 * not "20 hours ago".
 */
export function groupInboxByDay(entries) {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const dayMs    = 86400000
  const today    = startOfToday.getTime()
  const yesterday = today - dayMs
  const weekAgo   = today - 6 * dayMs

  const buckets = [
    { key: 'today',     label: 'Today',       from: today,      items: [] },
    { key: 'yesterday', label: 'Yesterday',   from: yesterday,  items: [] },
    { key: 'week',      label: 'Earlier this week', from: weekAgo, items: [] },
    { key: 'older',     label: 'Older',       from: -Infinity,  items: [] },
  ]

  for (const e of entries) {
    const t = inboxTime(e)
    // No timestamp at all lands in Older rather than Today — an unknown date is
    // not a recent one, and putting it at the top would make the newest section
    // untrustworthy.
    const bucket = buckets.find(b => t >= b.from) || buckets[buckets.length - 1]
    bucket.items.push(e)
  }
  return buckets.filter(b => b.items.length)
}

/** Overdue is a property of the row now, not of its position. */
export function isOverdue(entry) {
  return !!entry?.dueAt && new Date(entry.dueAt).getTime() < Date.now()
}