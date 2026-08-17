import { useState, useMemo } from 'react'
import { useMyTasks } from '../../hooks/useWorkflow'
import { useUserTaskSocket } from '../../hooks/useWorkflowSocket'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import { useScreenConfig } from '../../hooks/useUIConfig'
import { DataTable } from '../../components/ui/DataTable'
import { TaskInbox } from '../../components/workflow/TaskInbox'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { List, LayoutGrid, Filter, X, Building2 } from 'lucide-react'
import { cn } from '../../lib/cn'

// ─── Filter bar ───────────────────────────────────────────────────────────────

const ROLE_OPTS   = ['ALL', 'ACTOR', 'ASSIGNER']
const ACTION_OPTS = ['ALL', 'ACKNOWLEDGE', 'ASSIGN', 'FILL', 'REVIEW', 'EVALUATE']
const PRIORITY_OPTS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

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

  const columns = parseColumns(screenConfig?.layout?.columnsJson) || DEFAULT_COLUMNS

  return (
    <PageLayout
      title="Task Inbox"
      subtitle={`${tasks.length}${hasActiveFilter ? ` of ${allTasks.length}` : ''} task${tasks.length !== 1 ? 's' : ''} pending`
        + (allOrgs && multiTenant ? ` across ${grouped?.length ?? 0} organizations` : '')}
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
          <Card>
            <TaskInbox scope={allOrgs && multiTenant ? 'ALL' : 'TENANT'} filterFn={t => {
              if (roleFilter   !== 'ALL' && t.taskRole           !== roleFilter)   return false
              if (actionFilter !== 'ALL' && t.resolvedStepAction !== actionFilter) return false
              if (priorityFilter !== 'ALL' && t.priority         !== priorityFilter) return false
              return true
            }} />
          </Card>
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