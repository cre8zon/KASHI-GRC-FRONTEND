/**
 * navRoute.js — which nav row does this URL belong to?
 *
 * One answer, used by everything that needs it: the sidebar highlight, the
 * group that opens, and the tab's title and icon.
 *
 * ── WHY THIS IS NOT A PER-ROW TEST ────────────────────────────────────────
 *
 * Each place used to decide for itself, and each got it wrong differently.
 *
 * The sidebar matched the pathname EXACTLY, so the moment you opened anything
 * — /module/vendor_assessment/74, /chat/5, /collaboration/rooms/3 — the row
 * you were plainly inside went dark. The obvious repair, prefix matching, was
 * rejected in a comment there, and rightly: /workflow would then light up next
 * to /workflow/inbox, and two things would look selected at once.
 *
 * RouteSync had its own copy, `pathname.startsWith(item.route)`, which has
 * three faults the sidebar's did not: it compares against the route WITH its
 * query string, so every framework-scoped row (`?frameworkRef=`) never matches
 * anything; it does not stop at a segment boundary, so /module/risk claims
 * /module/risk-register; and when nothing matches it humanises the last path
 * segment, which is how tabs end up titled "74" and "7".
 *
 * Both are the same gap: "is this row active" is not a question a row can
 * answer alone. It is a comparison BETWEEN rows — the most specific match
 * wins and the rest lose. That needs the whole tree, so it is computed once,
 * here, and handed to whoever asked.
 *
 * ── THE NAV TABLE ALREADY KNOWS THE DETAIL ROUTES ─────────────────────────
 *
 * ui_navigation holds ~40 rows whose route carries a :param — "Assessment
 * Detail" /assessments/:id, "Engagement Detail" /audit/engagements/:id,
 * "Vendor Detail" /tprm/vendors/:id, "Policy Editor" /audit/policies/:id/edit
 * and so on. They are is_active = 0 so the sidebar does not render them, and
 * the backend deliberately returns them anyway (UiConfigServiceImpl: "Filter
 * by side/permission only — NOT by isActive"), because task routing needs
 * them.
 *
 * So the mapping from a detail URL to its sidebar row is already in your data,
 * as parent_key. This resolver uses it: match against EVERY row including the
 * hidden ones, then climb parent_key until it reaches a row the sidebar
 * actually renders. No alias table in JavaScript, and a new detail route is a
 * seed row rather than a code change.
 *
 * A row whose chain ends at a group with no route of its own still returns
 * that group as `openKey`, so the group expands and nothing is highlighted —
 * which is the honest outcome when the URL does not say which child it is.
 */

const segments = (p) => String(p || '').split('/').filter(Boolean)

/**
 * Does this nav route cover this pathname, and how specifically?
 *
 * Segment by segment, which is what makes :param rows usable and what stops
 * /module/risk from claiming /module/risk-register — a `startsWith` check has
 * to bolt a trailing slash on to get that right, and still cannot handle a
 * param in the middle (/audit/engagements/:engagementId/tests).
 *
 * Returns null for no match, otherwise how deep the route is, how much of it
 * was literal rather than a placeholder, and whether it consumed the whole
 * pathname.
 */
function matchPath(routePath, pathname) {
  const r = segments(routePath)
  const u = segments(pathname)
  if (r.length === 0 || r.length > u.length) return null
  let literals = 0
  for (let i = 0; i < r.length; i++) {
    if (r[i].charAt(0) === ':') continue      // :id, :taskId — matches any one segment
    if (r[i] !== u[i]) return null
    literals++
  }
  return { depth: r.length, literals, exact: r.length === u.length }
}

/** Every param in the row's query must be present and equal in the URL's. */
function queryMatches(routeQuery, search) {
  const want = new URLSearchParams(routeQuery)
  const have = new URLSearchParams(search || '')
  for (const [k, v] of want) if (have.get(k) !== v) return false
  return true
}

const isHidden = (item) => item.isActive === false || item.isActive === 0

/**
 * Flatten the nested nav tree, keeping each row's parent so the chain can be
 * climbed. parentKey comes from the backend, but children are also nested, so
 * the nesting is used as the fallback for a row whose parentKey is not set.
 */
function flatten(items, parent = null, out = [], byKey = new Map()) {
  for (const item of items || []) {
    const row = { ...item, _parent: item.parentKey || parent?.navKey || null }
    out.push(row)
    if (row.navKey) byKey.set(row.navKey, row)
    if (item.children?.length) flatten(item.children, item, out, byKey)
  }
  return { rows: out, byKey }
}

/**
 * Score a row against the URL. Higher is more specific.
 *
 * depth dominates, so /workflow/inbox beats /workflow and the double-highlight
 * the old comment warned about cannot happen. Then literals, so
 * /tprm/vendors/onboard beats /tprm/vendors/:id on the onboard URL. Then an
 * exact match over a prefix, then a matched query, then a visible row over a
 * hidden one at the same specificity.
 */
function score(item, pathname, search) {
  const route = item.route
  if (!route || route === '/') return -1

  const qIdx = route.indexOf('?')
  const path = qIdx === -1 ? route : route.slice(0, qIdx)

  const m = matchPath(path, pathname)
  if (!m) return -1

  if (qIdx !== -1) {
    if (!queryMatches(route.slice(qIdx + 1), search)) return -1
  } else if (new URLSearchParams(search || '').get('frameworkRef')) {
    // A framework-scoped URL belongs to the framework-specific sibling, which
    // is the row that carries ?frameworkRef= itself. A query-less row must not
    // claim it, or the unscoped list lights up while you are inside one
    // framework's.
    return -1
  }

  return m.depth * 1000
    + m.literals * 100
    + (m.exact ? 50 : 0)
    + (qIdx !== -1 ? 10 : 0)
    + (isHidden(item) ? 0 : 1)
}

/**
 * Last resort: nothing matched the URL's query, but some rows match its PATH.
 *
 * This is the framework/scope case. /module/audit_finding has two visible rows,
 * ?frameworkRef=ISO27001 and ?frameworkRef=SOC2, and /module/risk has
 * ?origin=GLOBAL and ?origin=ORG. On a URL that carries no scope — a detail
 * page that dropped it — the honest answer is that we do not know which one you
 * came from, so NOTHING is highlighted. But the group they live in can still be
 * opened, which at least shows you the neighbourhood.
 *
 * Only when exactly ONE visible row shares the path is it safe to highlight it;
 * two or more and a highlight would be a coin toss, and a confidently wrong
 * highlight is worse than none.
 */
function pathOnlyFallback(rows, byKey, pathname) {
  let depth = -1
  let hits = []
  for (const row of rows) {
    if (isHidden(row) || !row.route) continue
    const path = row.route.split('?')[0]
    const m = matchPath(path, pathname)
    if (!m) continue
    if (m.depth > depth) { depth = m.depth; hits = [row] }
    else if (m.depth === depth) hits.push(row)
  }
  if (hits.length === 0) return null

  const unique = new Set(hits.map(h => h.route))
  if (unique.size === 1) {
    const node = hits[0]
    return { navKey: node.navKey, route: node.route, label: node.label,
             icon: node.icon || null, openKey: node._parent || null, matchedKey: node.navKey }
  }

  // Ambiguous: open the group, highlight nothing. The label still gives the tab
  // a real name instead of a humanised id.
  const parent = hits[0]._parent ? byKey.get(hits[0]._parent) : null
  return { navKey: parent?.navKey || hits[0].navKey, route: null,
           label: parent?.label || hits[0].label, icon: parent?.icon || hits[0].icon || null,
           openKey: parent?.navKey || hits[0]._parent || null, matchedKey: hits[0].navKey }
}

/**
 * Resolve a URL to the nav row that owns it.
 *
 * @param {Array} items  the nav tree from useNavigation()
 * @param {{pathname: string, search?: string}} location
 * @returns {{navKey: string, route: string|null, label: string, icon: string|null,
 *            openKey: string|null, matchedKey: string} | null}
 *          `route` is what the sidebar compares against — null when the owning
 *          row is a group with no route of its own. `openKey` is the group to
 *          expand. `matchedKey` is the row that actually matched, which may be
 *          a hidden detail row.
 */
export function resolveNav(items, location) {
  const { pathname, search } = location || {}
  if (!pathname) return null

  const { rows, byKey } = flatten(items)

  // Two winners, tracked separately. The overall winner may be a hidden detail
  // row, which is usually the better answer — but only if its chain reaches
  // something visible. Many of those rows have parent_key = NULL, so the chain
  // goes nowhere, and without a second candidate to fall back to a URL like
  // /module/vendor_assessment/74 resolves to NOTHING even though the plain
  // /module/vendor_assessment row matched it perfectly well by prefix. The
  // hidden row outscored it and then led off a cliff.
  let best = null, bestScore = -1
  let bestVisible = null, bestVisibleScore = -1
  for (const row of rows) {
    const s = score(row, pathname, search)
    if (s < 0) continue
    if (s > bestScore) { best = row; bestScore = s }
    if (!isHidden(row) && row.route && s > bestVisibleScore) { bestVisible = row; bestVisibleScore = s }
  }
  if (!best) return pathOnlyFallback(rows, byKey, pathname)

  const matchedKey = best.navKey

  // Climb out of the hidden detail rows to something the sidebar renders. The
  // seen-set is not paranoia: parent_key is free text in the table, and one
  // row pointing at its own ancestor would otherwise spin here forever.
  let node = best
  const seen = new Set()
  while (node && isHidden(node)) {
    if (seen.has(node.navKey)) { node = null; break }
    seen.add(node.navKey)
    node = node._parent ? byKey.get(node._parent) || null : null
  }
  if (!node) node = bestVisible
  if (!node) return pathOnlyFallback(rows, byKey, pathname)

  return {
    navKey: node.navKey,
    route: node.route || null,
    label: node.label,
    icon: node.icon || null,
    // A group with no route is its own openKey — there is nothing to highlight
    // inside it, but the group should still be open.
    openKey: node.route ? (node._parent || null) : node.navKey,
    matchedKey,
  }
}

/**
 * Just the route string, for the sidebar's highlight comparison.
 * Separate so the sidebar does not have to care about the rest.
 */
export function activeNavRoute(items, location) {
  return resolveNav(items, location)?.route || null
}