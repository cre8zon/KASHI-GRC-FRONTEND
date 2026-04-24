/**
 * AllTasksPage — /workflow/tasks
 *
 * Full task history across all statuses with drill-down detail panel.
 * Complements the inbox (active only) with a searchable, filterable audit trail.
 */

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Clock, AlertTriangle,
  CornerDownLeft, Search, SlidersHorizontal, X,
  ArrowRight, ChevronDown, ChevronRight, Users, UserCheck,
  Loader2,
} from 'lucide-react'
import { workflowsApi } from '../../api/workflows.api'
import { PageLayout } from '../../components/layout/PageLayout'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { cn } from '../../lib/cn'
import { formatDateTime, formatDate } from '../../utils/format'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import api from '../../config/axios.config'

// ─── Constants ────────────────────────────────────────────────────────────────

const TASK_STATUS_CONFIG = {
  PENDING:    { label: 'Pending',    color: 'blue',   icon: Clock },
  IN_PROGRESS:{ label: 'In Progress',color: 'amber',  icon: Clock },
  APPROVED:   { label: 'Approved',   color: 'green',  icon: CheckCircle2 },
  REJECTED:   { label: 'Rejected',   color: 'red',    icon: XCircle },
  DELEGATED:  { label: 'Delegated',  color: 'purple', icon: CornerDownLeft },
  EXPIRED:    { label: 'Expired',    color: 'gray',   icon: AlertTriangle },
}

const ROLE_CONFIG = {
  ACTOR:    { label: 'Actor',       icon: Users,     color: 'text-brand-400 bg-brand-500/10' },
  ASSIGNER: { label: 'Coordinator', icon: UserCheck, color: 'text-purple-400 bg-purple-500/10' },
}

const PRIORITY_COLORS = {
  CRITICAL: 'text-red-400 bg-red-500/10',
  HIGH:     'text-amber-400 bg-amber-500/10',
  MEDIUM:   'text-text-muted bg-surface-overlay',
  LOW:      'text-text-muted bg-surface-overlay/50',
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useAllTasks = (userId) => useQuery({
  queryKey: ['all-tasks', userId],
  queryFn:  () => api.get('/v1/workflows/my-tasks', { params: { status: 'ALL' } }),
  enabled:  !!userId,
  staleTime: 30 * 1000,
})

const useTaskHistory = (instanceId) => useQuery({
  queryKey: ['task-history', instanceId],
  queryFn:  () => workflowsApi.history.forInstance(instanceId),
  enabled:  !!instanceId,
})

// ─── Task Detail Drawer ───────────────────────────────────────────────────────

function TaskDetailDrawer({ task, onClose }) {
  const navigate = useNavigate()
  const { data: history } = useTaskHistory(task?.workflowInstanceId)

  if (!task) return null

  const statusMeta   = TASK_STATUS_CONFIG[task.status] || { label: task.status, color: 'gray' }
  const roleMeta     = ROLE_CONFIG[task.taskRole] || ROLE_CONFIG.ACTOR
  const RoleIcon     = roleMeta.icon
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM

  const canOpen = (task.status === 'PENDING' || task.status === 'IN_PROGRESS') && task.navKey && task.artifactId

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-surface border-l border-border shadow-2xl z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4 border-b border-border">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{task.stepName}</p>
          <p className="text-xs text-text-muted">{task.workflowName}</p>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors shrink-0">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Status + role */}
        <div className="px-5 py-4 flex items-center gap-3 border-b border-border">
          <Badge value={task.status} label={statusMeta.label} colorTag={statusMeta.color} />
          <span className={cn('flex items-center gap-1 text-[11px] px-2 py-1 rounded font-medium', roleMeta.color)}>
            <RoleIcon size={10} />
            {roleMeta.label}
          </span>
          {task.priority && (
            <span className={cn('text-[11px] px-2 py-0.5 rounded font-mono', priorityColor)}>
              {task.priority}
            </span>
          )}
        </div>

        {/* Details grid */}
        <div className="px-5 py-4 grid grid-cols-2 gap-3 border-b border-border">
          {[
            { label: 'Task #',      value: task.id },
            { label: 'Step',        value: `${task.stepOrder ?? '—'}` },
            { label: 'Entity',      value: `${task.entityType} #${task.entityId}` },
            { label: 'Assigned',    value: task.assignedAt ? formatDate(task.assignedAt) : '—' },
            { label: 'Due',         value: task.dueAt ? formatDate(task.dueAt) : '—' },
            { label: 'Acted',       value: task.actedAt ? formatDateTime(task.actedAt) : '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] text-text-muted font-medium uppercase tracking-wide mb-0.5">{label}</p>
              <p className="text-xs text-text-primary font-mono">{value}</p>
            </div>
          ))}
        </div>

        {/* Remarks */}
        {task.remarks && (
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[10px] text-text-muted font-medium uppercase tracking-wide mb-1">Remarks</p>
            <p className="text-xs text-text-secondary italic">"{task.remarks}"</p>
          </div>
        )}

        {/* Workflow history */}
        <div className="px-5 py-4">
          <p className="text-[10px] text-text-muted font-medium uppercase tracking-wide mb-3">Workflow History</p>
          {!history ? (
            <p className="text-xs text-text-muted">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-text-muted">No history available.</p>
          ) : (
            <div className="space-y-2">
              {history.slice(0, 20).map((entry, i) => {
                const action = entry.action || entry.eventType || ''
                const color = action.includes('APPROVED') || action.includes('COMPLETED') ? 'bg-green-400' :
                              action.includes('REJECTED') || action.includes('CANCELLED') ? 'bg-red-400' : 'bg-brand-400'
                return (
                  <div key={entry.id ?? i} className="flex items-start gap-2">
                    <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs text-text-primary">{entry.stepName || 'Workflow'}</p>
                        <span className="text-[10px] font-mono text-brand-400">{action}</span>
                      </div>
                      {entry.performedByName && (
                        <p className="text-[10px] text-text-muted">by {entry.performedByName}</p>
                      )}
                      <p className="text-[10px] text-text-muted font-mono">
                        {entry.createdAt ? formatDateTime(entry.createdAt) : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      {canOpen && (
        <div className="px-5 py-4 border-t border-border">
          <Button variant="primary" size="sm" icon={ArrowRight} className="w-full"
            onClick={() => navigate(`/workflow/inbox`)}>
            Open in Inbox
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ['ALL', ...Object.keys(TASK_STATUS_CONFIG)]
const ROLE_FILTERS   = ['ALL', 'ACTOR', 'ASSIGNER']

export default function AllTasksPage() {
  const { userId } = useSelector(selectAuth)
  const navigate   = useNavigate()
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatus]     = useState('ALL')
  const [roleFilter, setRole]         = useState('ALL')
  const [showFilters, setFilters]     = useState(false)
  const [selectedTask, setSelected]   = useState(null)

  const { data: rawData, isLoading } = useAllTasks(userId)
  const allTasks = useMemo(() => {
    const arr = Array.isArray(rawData) ? rawData : (rawData?.items || rawData?.data || [])
    return arr
  }, [rawData])

  const tasks = useMemo(() => {
    return allTasks.filter(t => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false
      if (roleFilter   !== 'ALL' && t.taskRole !== roleFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!t.stepName?.toLowerCase().includes(q) &&
            !t.workflowName?.toLowerCase().includes(q) &&
            !String(t.entityId).includes(q)) return false
      }
      return true
    })
  }, [allTasks, statusFilter, roleFilter, search])

  const counts = useMemo(() => allTasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {}), [allTasks])

  const hasFilter = statusFilter !== 'ALL' || roleFilter !== 'ALL' || !!search

  return (
    <>
      <PageLayout
        title="All Tasks"
        subtitle={`${tasks.length}${allTasks.length > tasks.length ? ` of ${allTasks.length}` : ''} tasks`}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search step or workflow…"
                className="h-8 pl-8 pr-3 w-48 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <Button variant={showFilters ? 'secondary' : 'ghost'} size="sm" icon={SlidersHorizontal}
              onClick={() => setFilters(f => !f)}>
              {hasFilter ? 'Filtered' : 'Filter'}
            </Button>
            {hasFilter && (
              <Button variant="ghost" size="sm" icon={X}
                onClick={() => { setStatus('ALL'); setRole('ALL'); setSearch('') }}>
                Clear
              </Button>
            )}
          </div>
        }
      >
        {/* Filter bar */}
        {showFilters && (
          <div className="px-6 py-3 border-b border-border bg-surface-raised space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-text-muted uppercase tracking-wide font-medium w-12">Status</span>
              {STATUS_FILTERS.map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                    statusFilter === s
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-border text-text-muted hover:text-text-secondary')}>
                  {s === 'ALL' ? 'All' : TASK_STATUS_CONFIG[s]?.label || s}
                  {s !== 'ALL' && counts[s] ? ` (${counts[s]})` : ''}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted uppercase tracking-wide font-medium w-12">Role</span>
              {ROLE_FILTERS.map(r => (
                <button key={r} onClick={() => setRole(r)}
                  className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                    roleFilter === r
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-border text-text-muted hover:text-text-secondary')}>
                  {r === 'ALL' ? 'All' : ROLE_CONFIG[r]?.label || r}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Column headers */}
        <div className="hidden md:grid grid-cols-[1fr_140px_120px_100px_80px] gap-4 px-5 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-widest border-b border-border">
          <span>Task / Workflow</span>
          <span>Role</span>
          <span>Status</span>
          <span>Priority</span>
          <span>Date</span>
        </div>

        {/* Task list */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden mx-6 mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-text-muted" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <CheckCircle2 size={28} className="text-text-muted" strokeWidth={1.5} />
              <p className="text-sm text-text-muted">{hasFilter ? 'No tasks match filters' : 'No tasks found'}</p>
            </div>
          ) : tasks.map(task => {
            const sm = TASK_STATUS_CONFIG[task.status] || { label: task.status, color: 'gray' }
            const rm = ROLE_CONFIG[task.taskRole] || ROLE_CONFIG.ACTOR
            const RoleIcon = rm.icon
            const pc = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM
            const isActive = task.status === 'PENDING' || task.status === 'IN_PROGRESS'

            return (
              <div key={task.id}
                onClick={() => setSelected(task)}
                className={cn(
                  'flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0 cursor-pointer group transition-colors',
                  selectedTask?.id === task.id ? 'bg-brand-500/5' : 'hover:bg-surface-overlay/40'
                )}>
                {/* Active indicator */}
                <div className={cn('w-1 h-8 rounded-full shrink-0',
                  isActive ? 'bg-amber-400' : 'bg-transparent')} />

                <div className="flex-1 min-w-0 grid grid-cols-[1fr_140px_120px_100px_80px] gap-4 items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{task.stepName || `Task #${task.id}`}</p>
                    <p className="text-xs text-text-muted truncate">{task.workflowName} · #{task.id}</p>
                  </div>

                  <span className={cn('flex items-center gap-1 text-[11px] px-2 py-1 rounded w-fit font-medium', rm.color)}>
                    <RoleIcon size={10} />
                    {rm.label}
                  </span>

                  <Badge value={task.status} label={sm.label} colorTag={sm.color} />

                  <span className={cn('text-[11px] px-2 py-0.5 rounded font-mono w-fit', pc)}>
                    {task.priority || 'MEDIUM'}
                  </span>

                  <p className="text-xs font-mono text-text-muted">
                    {task.actedAt ? formatDate(task.actedAt) :
                     task.assignedAt ? formatDate(task.assignedAt) : '—'}
                  </p>
                </div>

                <ChevronRight size={13} className="text-text-muted shrink-0 group-hover:text-text-secondary transition-colors" />
              </div>
            )
          })}
        </div>
      </PageLayout>

      {/* Side drawer */}
      {selectedTask && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30" onClick={() => setSelected(null)} />
          <TaskDetailDrawer task={selectedTask} onClose={() => setSelected(null)} />
        </>
      )}
    </>
  )
}