import { useState, useMemo, useCallback } from 'react'
import { useMyTasks } from '../../hooks/useWorkflow'
import { useUserTaskSocket } from '../../hooks/useWorkflowSocket'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import { useScreenConfig } from '../../hooks/useUIConfig'
import { DataTable } from '../../components/ui/DataTable'
import { TaskInbox } from '../../components/workflow/TaskInbox'
import { ActionItemInbox } from '../../components/workflow/ActionItemInbox'
import { UnifiedInbox, useInboxEntries } from '../../components/workflow/UnifiedInbox'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { List, LayoutGrid, Filter, X, Building2, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/cn'

// ─── Filter bar ───────────────────────────────────────────────────────────────

const ROLE_OPTS   = ['ALL', 'ACTOR', 'ASSIGNER']
const ACTION_OPTS = ['ALL', 'ACKNOWLEDGE', 'ASSIGN', 'FILL', 'REVIEW', 'EVALUATE']
const PRIORITY_OPTS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

// All first and All default. A tabbed inbox whose default is a category is a
// filing cabinet — the point of the tabs is that you rarely need them.
const TABS = [
  { key: 'all',    label: 'All' },
  { key: 'tasks',  label: 'Workflow tasks' },
  { key: 'items',  label: 'Action items' },
  // Last, and opt-in. An inbox is what is waiting; finished work belongs where
  // you can look it up, not where it inflates the count.
  { key: 'done',   label: 'Done' },
]

function FilterChip({ label, value, options, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-text-muted uppercase tracking-wide shrink-0">{label}</span>
      <div className="flex gap-0.5">
        {options.map(opt => (
          <button key={opt} type="button"
            onClick={() => onChange(opt)}
            className={cn(
              'text-[11px] px-2 py-0.5 rounded transition-colors',
              value === opt
                ? 'bg-brand-500/20 text-brand-ink font-medium'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay'
            )}>
            {opt === 'ALL' ? 'All' : opt.charAt(0) + opt.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkflowInboxPage() {
  const [view, setView]           = useState('cards')
  const [showFilters, setShowFilters] = useState(false)
  const [roleFilter, setRoleFilter]       = useState('ALL')
  const [actionFilter, setActionFilter]   = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')

  // Cross-organization view.
  //
  // Gated on membership COUNT, not on whether the tenant is an audit firm. The
  // toggle only means something to someone who belongs to more than one
  // organization, and that set is wider than audit firms: a fractional CISO
  // across two clients, a group GRC lead with subsidiary access. It is also
  // narrower in the right way — a firm ADMIN has one membership, their own
  // firm, and would otherwise get a control that does nothing.
  const [allOrgs, setAllOrgs] = useState(false)
  const { userId, memberships = [] } = useSelector(selectAuth)
  const multiTenant = (memberships || []).length > 1

  const { data, isLoading } = useMyTasks(allOrgs && multiTenant ? { scope: 'ALL' } : {})

  useUserTaskSocket(userId)
  const { data: screenConfig } = useScreenConfig('task_inbox')

  const allTasks = Array.isArray(data) ? data : (data?.items || data?.data || [])

  // Apply filters in memory — no extra API calls
  const tasks = useMemo(() => {
    return allTasks.filter(t => {
      if (roleFilter   !== 'ALL' && t.taskRole           !== roleFilter)   return false
      if (actionFilter !== 'ALL' && t.resolvedStepAction !== actionFilter) return false
      if (priorityFilter !== 'ALL' && t.priority         !== priorityFilter) return false
      return true
    })
  }, [allTasks, roleFilter, actionFilter, priorityFilter])

  // Grouped by organization, but only in the cross-org view — inside a single
  // tenant every task shares the same heading, which is noise.
  const grouped = useMemo(() => {
    if (!allOrgs || !multiTenant) return null
    const by = new Map()
    for (const t of tasks) {
      const key = t.tenantName || 'Unknown organization'
      if (!by.has(key)) by.set(key, [])
      by.get(key).push(t)
    }
    // The active organization first — it is where the person is working — then
    // the rest alphabetically so the order does not shift between loads.
    const activeName = (memberships.find(m => m.active) || {}).tenantName
    return [...by.entries()].sort(([a], [b]) => {
      if (a === activeName) return -1
      if (b === activeName) return 1
      return a.localeCompare(b)
    })
  }, [tasks, allOrgs, multiTenant, memberships])

  const hasActiveFilter = roleFilter !== 'ALL' || actionFilter !== 'ALL' || priorityFilter !== 'ALL'

  const clearFilters = () => {
    setRoleFilter('ALL')
    setActionFilter('ALL')
    setPriorityFilter('ALL')
  }

  const [tab, setTab]                 = useState('all')
  const [overdueOnly, setOverdueOnly] = useState(false)

  // One definition of each filter, used by all three tabs. Declared with
  // useCallback so the memo inside useInboxEntries does not re-run on every
  // render and re-sort a list the user is reading.
  const taskFilter = useCallback((t) => {
    if (roleFilter     !== 'ALL' && t.taskRole           !== roleFilter)     return false
    if (actionFilter   !== 'ALL' && t.resolvedStepAction !== actionFilter)   return false
    if (priorityFilter !== 'ALL' && t.priority           !== priorityFilter) return false
    return true
  }, [roleFilter, actionFilter, priorityFilter])

  // Role and action are workflow-step concepts. An action item has neither, so
  // those filters do not apply to it — silently emptying this half when
  // somebody filters by ASSIGN would read as "nothing assigned to me" rather
  // than "that filter is about steps".
  const itemFilter = useCallback((i) =>
    priorityFilter === 'ALL' || i.priority === priorityFilter,
  [priorityFilter])

  // Counts for the tab labels, the overdue chip and the page subtitle, from one
  // place — three components computing "how many things are waiting" is three
  // chances to disagree in front of the person waiting.
  const inbox = useInboxEntries({ overdueOnly: false, filterTask: taskFilter, filterItem: itemFilter })

  const columns = parseColumns(screenConfig?.layout?.columnsJson) || DEFAULT_COLUMNS

  return (
    <PageLayout
      title="Task Inbox"
      /* Counts BOTH kinds. It said "0 tasks pending" over a page listing seven
         action items, because it counted only half of what it was showing. */
      subtitle={`${inbox.total} item${inbox.total !== 1 ? 's' : ''} waiting`
        + (inbox.overdueCount ? ` · ${inbox.overdueCount} overdue` : '')
        + (allOrgs && multiTenant ? ` · ${grouped?.length ?? 0} organizations` : '')}
      actions={
        <div className="flex items-center gap-2">
          {multiTenant && (
            <button
              onClick={() => setAllOrgs(v => !v)}
              title={allOrgs
                ? 'Showing tasks from every organization you belong to'
                : 'Show tasks from every organization you belong to'}
              className={cn(
                'flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-medium transition-colors',
                allOrgs
                  ? 'border-brand-500 bg-brand-500/15 text-brand-ink'
                  : 'border-border bg-surface-overlay text-text-secondary hover:text-text-primary',
              )}
            >
              <Building2 size={11} />
              All organizations
            </button>
          )}

          {/* Filter toggle */}
          <Button
            variant={showFilters ? 'secondary' : 'ghost'}
            size="xs"
            icon={Filter}
            onClick={() => setShowFilters(f => !f)}
            className={hasActiveFilter ? 'text-brand-ink' : ''}>
            {hasActiveFilter ? `Filtered (${[roleFilter, actionFilter, priorityFilter].filter(f => f !== 'ALL').length})` : 'Filter'}
          </Button>
          {hasActiveFilter && (
            <Button variant="ghost" size="xs" icon={X} onClick={clearFilters}>
              Clear
            </Button>
          )}
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-surface-overlay rounded-ctl p-0.5">
            <Button variant={view === 'cards' ? 'secondary' : 'ghost'} size="xs" icon={LayoutGrid} onClick={() => setView('cards')} />
            <Button variant={view === 'table' ? 'secondary' : 'ghost'} size="xs" icon={List} onClick={() => setView('table')} />
          </div>
        </div>
      }
    >
      {/* Filter bar */}
      {showFilters && (
        <div className="px-6 py-3 border-b border-border bg-surface-raised flex flex-wrap items-center gap-4">
          <FilterChip label="Role"     value={roleFilter}     options={ROLE_OPTS}     onChange={setRoleFilter} />
          <FilterChip label="Action"   value={actionFilter}   options={ACTION_OPTS}   onChange={setActionFilter} />
          <FilterChip label="Priority" value={priorityFilter} options={PRIORITY_OPTS} onChange={setPriorityFilter} />
        </div>
      )}

      <div className="p-6">
        {view === 'cards' ? (
          /* ── ONE INBOX, ORDERED BY TIME ───────────────────────────────
             All is the default and is a genuine merge: both kinds of work in
             one list, newest arrival first, with day headers as the only
             structure. No grouping by source — a reader faced with two
             sections does the merge themselves, and does it badly, because the
             thing that arrived an hour ago sits below the fold of the other
             one.

             Urgency has moved off the sort and onto the row. An overdue entry
             carries a red marker and the Overdue chip above filters to them,
             rather than being hoisted to the top — reordering by urgency is
             the same segregation as grouping by source, just on a different
             axis, and it costs you the ability to see what is new.

             The two narrow tabs still exist because they are working views,
             not categories: Tasks renders TaskInbox with its inline Approve /
             Reject / Send back, which a timeline row deliberately does not
             carry. */
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1 border-b border-border">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={cn(
                    'relative px-3 py-2 text-[12px] transition-colors',
                    tab === t.key
                      ? 'text-text-primary font-medium'
                      : 'text-text-muted hover:text-text-secondary'
                  )}>
                  {t.label}
                  {/* No count on Done — it is capped and historical, so a
                      number there would imply a backlog rather than a record. */}
                  {t.key !== 'done' && (
                    <span className="ml-1.5 text-[10px] text-text-muted tabular-nums">
                      {t.key === 'all' ? inbox.total
                        : t.key === 'tasks' ? inbox.taskCount : inbox.itemCount}
                    </span>
                  )}
                  {tab === t.key && (
                    <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand-500 rounded-full" />
                  )}
                </button>
              ))}

              <span className="flex-1" />

              {/* Filters, not a sort. Pressing it narrows the same timeline. */}
              {tab !== 'done' && inbox.overdueCount > 0 && (
                <button onClick={() => setOverdueOnly(v => !v)}
                  className={cn(
                    'flex items-center gap-1 text-[11px] px-2 py-1 rounded-ctl border transition-colors mb-1',
                    overdueOnly
                      ? 'border-status-fail-bd bg-status-fail-bg text-status-fail-fg'
                      : 'border-border bg-surface-overlay text-text-muted hover:text-text-secondary'
                  )}>
                  <AlertTriangle size={10} />
                  {inbox.overdueCount} overdue
                </button>
              )}
            </div>

            <Card>
              {tab === 'done' ? (
                <UnifiedInbox done filterItem={itemFilter} />
              ) : tab === 'all' ? (
                <UnifiedInbox
                  overdueOnly={overdueOnly}
                  filterTask={taskFilter}
                  filterItem={itemFilter}
                />
              ) : tab === 'tasks' ? (
                <TaskInbox scope={allOrgs && multiTenant ? 'ALL' : 'TENANT'} filterFn={taskFilter} />
              ) : (
                <ActionItemInbox filterFn={itemFilter} />
              )}
            </Card>
          </div>
        ) : (
          <DataTable
            columns={allOrgs && multiTenant
              ? [{ key: 'tenantName', label: 'Organization', width: 160 }, ...columns]
              : columns}
            data={tasks}
            config={screenConfig}
            loading={isLoading}
            emptyMessage="No tasks match the current filters"
          />
        )}
      </div>
    </PageLayout>
  )
}

function parseColumns(json) { try { return json ? JSON.parse(json) : null } catch { return null } }
const DEFAULT_COLUMNS = [
  { key: 'taskId',     label: 'Task ID',    type: 'mono', width: 80 },
  { key: 'entityType', label: 'Type',       width: 120 },
  { key: 'entityId',   label: 'Entity ID',  type: 'mono', width: 100 },
  { key: 'status',     label: 'Status',     type: 'badge', componentKey: 'task_status', width: 100 },
  { key: 'priority',   label: 'Priority',   type: 'badge', componentKey: 'task_priority', width: 100 },
  { key: 'assignedAt', label: 'Assigned',   type: 'date', width: 130 },
]