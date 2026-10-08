/**
 * UnifiedInbox — the All tab: every kind of work, newest first, in one list.
 *
 * Both sources are fetched here and merged by arrival time. There is no
 * grouping by kind, deliberately: a list split into "your tasks" and "your
 * action items" makes the reader do the merge, and they do it badly, because
 * the thing that arrived an hour ago is below the fold of the other section.
 *
 * Day headers (Today / Yesterday / Earlier this week / Older) are the only
 * structure, and they come from time rather than from type.
 *
 * ── TWO CALLS, NOT ONE ENDPOINT ──────────────────────────────────────────
 * Tasks and action items have different permissions, different scoping and
 * different lifecycles. A merged server endpoint would be one query that has to
 * be right about both, and the first time one of them gained a rule the other
 * would quietly not get it. Two calls the client already makes, normalised
 * through one resolver, keeps each answer owned by the service that
 * understands it.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOpenInTab } from '../../hooks/useOpenInTab'
import { useSelector } from 'react-redux'
import { Inbox as InboxIcon } from 'lucide-react'
import api from '../../config/axios.config'
import { uiConfigApi } from '../../api/uiConfig.api'
import { selectAuth } from '../../store/slices/authSlice'
import {
  normaliseTask, normaliseActionItem, sortInbox, groupInboxByDay, isOverdue,
} from '../../lib/inboxRoute'
import { InboxRow } from './InboxRow'

const unwrap = (d) => {
  const body = d?.data ?? d
  const list = body?.data ?? body
  if (Array.isArray(list)) return list
  if (Array.isArray(list?.content)) return list.content
  if (Array.isArray(list?.items))   return list.items
  return []
}

// Same table the task inbox falls back to. Kept here rather than in the shared
// resolver for the reason given there: it is a list of modules whose steps
// predate nav_key, which is knowledge about consumers.
const ENTITY_ROUTES = {
  AUDIT_PROJECT:    '/module/audit_project/:id',
  AUDIT_ENGAGEMENT: '/module/audit_engagement/:id',
  AUDIT_POLICY:     '/module/audit_policy/:id',
  ISSUE:            '/module/issue/:id',
  RISK:             '/module/risk/:id',
  // ── VENDOR, not VENDOR_ASSESSMENT ─────────────────────────────────────
  //
  // A TPRM workflow instance is filed under ('VENDOR', vendorId), so that is
  // the entityType its tasks carry — while artifactId is resolved to the
  // ASSESSMENT, which is why the route takes :id straight from it. The old
  // TaskInbox had a VENDOR special case directly above its own copy of this
  // table; UnifiedInbox replaced that resolver and the case did not come with
  // it.
  //
  // The effect: any TPRM task whose step has no nav_key fell through to
  // nothing and the row printed "No destination configured" instead of
  // clicking. Steps 8, 9, 12, 13 and 15 of workflow 12 are exactly those —
  // the six seeded nav keys cover steps 2, 4, 5, 6, 7 and 10/11 and stop
  // there.
  //
  // This is the net, not the fix: a nav_key still wins when present and still
  // carries the right ?tab=, which this cannot. sql/99 gives those five steps
  // a key. But a task that opens on the wrong tab is recoverable and one that
  // cannot be opened at all is not, so the net belongs here regardless.
  VENDOR:           '/module/vendor_assessment/:id',
}

/**
 * Both sources, normalised and merged. Exported because the page needs the
 * counts for its tab labels and header, and refetching them separately would
 * mean two components disagreeing about how many things are waiting.
 */
export function useInboxEntries({ overdueOnly = false, done = false, filterTask, filterItem } = {}) {
  const { userId } = useSelector(selectAuth)

  const tasksQ = useQuery({
    queryKey: ['inbox-tasks', userId],
    queryFn:  () => api.get(`/v1/workflow-instances/tasks/user/${userId}`),
    select:   unwrap,
    enabled:  !!userId && !done,
    staleTime: 60 * 1000,
  })

  // Done: the person's finished tasks — the /all history endpoint, minus what
  // is still waiting, newest first, capped like the closed action items.
  const doneTasksQ = useQuery({
    queryKey: ['inbox-tasks-done', userId],
    queryFn:  () => api.get(`/v1/workflow-instances/tasks/user/${userId}/all`),
    select:   (d) => (unwrap(d) || [])
      .filter(t => t.status && !['PENDING', 'IN_PROGRESS'].includes(String(t.status).toUpperCase()))
      .sort((a, b) => String(b.actedAt || b.assignedAt || '').localeCompare(String(a.actedAt || a.assignedAt || '')))
      .slice(0, 100),
    enabled:  !!userId && done,
    staleTime: 60 * 1000,
  })

  // ── DONE IS A SEPARATE QUERY, NOT A CLIENT-SIDE FILTER ─────────────────
  // /action-items/my is filtered server-side, so finished work is not in the
  // open response to filter out of. ?status=closed is the other half.
  //
  // The tasks half comes from the task history endpoint (doneTasksQ above).
  const itemsQ = useQuery({
    queryKey: ['inbox-action-items', done ? 'closed' : 'open'],
    queryFn:  () => api.get('/v1/action-items/my', done ? { params: { status: 'closed' } } : undefined),
    select:   unwrap,
    staleTime: 60 * 1000,
  })

  const navQ = useQuery({
    queryKey: ['ui-navigation'],
    queryFn:  () => uiConfigApi.navigation(),
    select:   unwrap,
    staleTime: 5 * 60 * 1000,
  })

  const tasks    = (done ? doneTasksQ.data : tasksQ.data) || []
  const items    = itemsQ.data || []
  const navItems = navQ.data   || []

  return useMemo(() => {
    const taskEntries = (filterTask ? tasks.filter(filterTask) : tasks)
      .map(t => normaliseTask(t, navItems, (x) => ENTITY_ROUTES[x.entityType] || null))
    const itemEntries = (filterItem ? items.filter(filterItem) : items)
      .map(i => normaliseActionItem(i, navItems, userId))

    const all = sortInbox([...taskEntries, ...itemEntries])
    const visible = overdueOnly ? all.filter(isOverdue) : all

    return {
      isLoading:    (done ? doneTasksQ.isLoading : tasksQ.isLoading) || itemsQ.isLoading,
      entries:      visible,
      groups:       groupInboxByDay(visible),
      taskCount:    taskEntries.length,
      itemCount:    itemEntries.length,
      total:        all.length,
      overdueCount: all.filter(isOverdue).length,
    }
  }, [tasks, items, navItems, userId, overdueOnly, done, filterTask, filterItem,
      tasksQ.isLoading, doneTasksQ.isLoading, itemsQ.isLoading])
}

export function UnifiedInbox({ overdueOnly, done, filterTask, filterItem }) {
  // useOpenInTab, not useNavigate: every row here is a link OUT of the inbox.
  // When the entity is already open in another tab, go to that tab rather
  // than pointing the inbox's own tab at a second copy of it.
  const openInTab = useOpenInTab()
  const { isLoading, groups, entries } =
    useInboxEntries({ overdueOnly, done, filterTask, filterItem })

  if (isLoading) {
    return <div className="px-4 py-8 text-center text-xs text-text-muted">Loading your inbox…</div>
  }

  if (!entries.length) {
    return (
      <div className="px-4 py-10 text-center">
        <InboxIcon size={18} className="mx-auto text-text-muted" />
        <p className="text-xs text-text-muted mt-2">
          {done ? 'Nothing finished yet'
            : overdueOnly ? 'Nothing is overdue' : 'Nothing waiting for you'}
        </p>
      </div>
    )
  }

  return (
    <div>
      {done && (
        <p className="px-4 py-2 text-[10px] text-text-muted border-b border-border bg-surface-overlay/30">
          Action items you have completed, newest first. Finished workflow tasks
          are not here yet — the task endpoint returns pending work only.
        </p>
      )}
      {groups.map(g => (
        <div key={g.key}>
          <div className="sticky top-0 z-10 px-4 py-1.5 bg-surface-overlay/90 backdrop-blur border-b border-border">
            <span className="text-[9px] uppercase tracking-wide text-text-muted">
              {g.label}
            </span>
            <span className="text-[9px] text-text-muted ml-2">{g.items.length}</span>
          </div>
          {g.items.map(e => (
            <InboxRow key={e.key} entry={e} onOpen={(x) => openInTab(x.route)} />
          ))}
        </div>
      ))}
    </div>
  )
}

export default UnifiedInbox