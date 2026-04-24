/**
 * TaskDetailPage — /workflow/tasks/:taskId
 *
 * Full-page detail view for a single task.
 * Shows complete context: step info, workflow position, compound sections,
 * full history log, and actions if the task is still active.
 *
 * Navigated to from AllTasksPage or directly via URL.
 */

import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, AlertTriangle,
  CornerDownLeft, ArrowRight, Users, UserCheck, Loader2,
  Shield, FileText, Calendar, Flag,
} from 'lucide-react'
import { workflowsApi } from '../../api/workflows.api'
import { PageLayout } from '../../components/layout/PageLayout'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { cn } from '../../lib/cn'
import { formatDate, formatDateTime } from '../../utils/format'
import { useMyTasks, useCompoundTaskProgress, useTaskAction } from '../../hooks/useWorkflow'
import { CompoundTaskProgress } from '../../components/workflow/CompoundTaskProgress'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import toast from 'react-hot-toast'
import api              from '../../config/axios.config'
import { useComments } from '../../hooks/useComments'
import { CommentFeed } from '../../components/comments/CommentFeed'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  PENDING:    { label: 'Pending',     color: 'blue',   icon: Clock },
  IN_PROGRESS:{ label: 'In Progress', color: 'amber',  icon: Clock },
  APPROVED:   { label: 'Approved',    color: 'green',  icon: CheckCircle2 },
  REJECTED:   { label: 'Rejected',    color: 'red',    icon: XCircle },
  DELEGATED:  { label: 'Delegated',   color: 'purple', icon: CornerDownLeft },
  EXPIRED:    { label: 'Expired',     color: 'gray',   icon: AlertTriangle },
}

const PRIORITY_COLORS = {
  CRITICAL: 'text-red-400 bg-red-500/10',
  HIGH:     'text-amber-400 bg-amber-500/10',
  MEDIUM:   'text-text-muted bg-surface-overlay',
  LOW:      'text-text-muted bg-surface-overlay/50',
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useTaskById = (taskId) => useQuery({
  queryKey: ['task-by-id', taskId],
  queryFn:  () => api.get('/v1/workflows/my-tasks', { params: { status: 'ALL' } })
    .then(tasks => {
      const arr = Array.isArray(tasks) ? tasks : (tasks?.items || [])
      return arr.find(t => String(t.id) === String(taskId)) || null
    }),
  enabled: !!taskId,
  staleTime: 30 * 1000,
})

const useInstanceStatus = (instanceId) => useQuery({
  queryKey: ['instance-status', instanceId],
  queryFn:  () => api.get(`/v1/workflows/instances/${instanceId}/status`),
  enabled:  !!instanceId,
})

// ─── Detail Section ───────────────────────────────────────────────────────────

function MetaGrid({ items }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {items.map(({ label, value, mono }) => (
        <div key={label} className="p-3 rounded-lg border border-border bg-surface-raised">
          <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-0.5">{label}</p>
          <p className={cn('text-sm text-text-primary truncate', mono && 'font-mono')}>{value || '—'}</p>
        </div>
      ))}
    </div>
  )
}

function StepTimeline({ steps }) {
  if (!steps?.length) return null
  return (
    <div className="space-y-0.5">
      {steps.map((step, i) => {
        const isApproved = step.status === 'APPROVED'
        const isCurrent  = step.status === 'IN_PROGRESS' || step.status === 'AWAITING_ASSIGNMENT'
        return (
          <div key={step.stepInstanceId ?? i} className="flex items-start gap-3 py-1.5">
            <div className="flex flex-col items-center shrink-0 mt-1">
              <div className={cn('w-2.5 h-2.5 rounded-full shrink-0 border',
                isApproved ? 'bg-green-400 border-green-400' :
                isCurrent  ? 'bg-amber-400 border-amber-400 ring-2 ring-amber-400/30 ring-offset-1 ring-offset-surface-primary' :
                             'bg-surface border-border'
              )} />
              {i < steps.length - 1 && (
                <div className={cn('w-px mt-1 min-h-[14px]', isApproved ? 'bg-green-400/40' : 'bg-border')} />
              )}
            </div>
            <div className={cn('flex-1 px-3 py-1.5 rounded-lg -mt-1',
              isCurrent ? 'bg-amber-500/10' : 'bg-transparent')}>
              <div className="flex items-center gap-2">
                <p className={cn('text-xs',
                  isCurrent  ? 'text-amber-400 font-medium' :
                  isApproved ? 'text-text-secondary' : 'text-text-muted')}>
                  {step.stepOrder}. {step.stepName || step.name}
                </p>
                {isCurrent && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium">Current</span>
                )}
              </div>
              {step.startedAt && isApproved && (
                <p className="text-[10px] text-text-muted mt-0.5">{formatDate(step.startedAt)}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TaskActivityFeed({ taskId }) {
  const { comments, isLoading, addComment, adding } = useComments(
    'TASK', taskId, { enabled: !!taskId }
  )
  return (
    <CommentFeed
      comments={comments}
      isLoading={isLoading}
      addComment={addComment}
      adding={adding}
      canEdit={true}
      showVisibility={true}
      emptyMessage="No activity yet. Leave a note for collaborators."
    />
  )
}

export default function TaskDetailPage() {
  const { taskId } = useParams()
  const navigate   = useNavigate()
  const { mutate: actOnTask, isPending: acting } = useTaskAction()

  const { data: task, isLoading } = useTaskById(taskId)
  const { data: sections = [] }   = useCompoundTaskProgress(taskId ? Number(taskId) : null)
  const { data: instanceStatus }  = useInstanceStatus(task?.workflowInstanceId)

  const isActive = task?.status === 'PENDING' || task?.status === 'IN_PROGRESS'
  const steps    = instanceStatus?.stepHistory || []

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={24} className="animate-spin text-text-muted" />
    </div>
  )

  if (!task) return (
    <div className="p-8 text-center text-text-muted text-sm">
      Task #{taskId} not found. It may belong to a different user or have expired.
    </div>
  )

  const statusMeta = STATUS_CONFIG[task.status] || { label: task.status, color: 'gray' }
  const pc = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM
  const isActor = task.taskRole === 'ACTOR'

  const handleAction = (actionType) => {
    actOnTask({ taskInstanceId: Number(taskId), actionType }, {
      onSuccess: () => {
        toast.success(actionType === 'APPROVE' ? 'Task approved' : 'Action completed')
        navigate('/workflow/tasks')
      }
    })
  }

  return (
    <PageLayout
      title={task.stepName || `Task #${taskId}`}
      subtitle={`${task.workflowName}  ·  Task #${taskId}`}
      actions={
        <div className="flex items-center gap-2">
          <Badge value={task.status} label={statusMeta.label} colorTag={statusMeta.color} />
          {isActive && !isActor && (
            <Button size="sm" variant="primary" icon={CheckCircle2}
              loading={acting}
              onClick={() => handleAction('APPROVE')}>
              Approve
            </Button>
          )}
        </div>
      }
    >
      <div className="p-6 max-w-4xl mx-auto space-y-6">

        {/* Compound sections progress bar */}
        {sections.length > 0 && (
          <div>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Section Progress</p>
            <CompoundTaskProgress sections={sections} />
          </div>
        )}

        {/* Task metadata */}
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Task Details</p>
          <MetaGrid items={[
            { label: 'Task ID',      value: `#${task.id}`,                  mono: true },
            { label: 'Step',         value: `${task.stepOrder ?? '—'}. ${task.stepName}` },
            { label: 'Role',         value: task.taskRole === 'ACTOR' ? 'Actor (does the work)' : 'Coordinator' },
            { label: 'Action',       value: task.resolvedStepAction },
            { label: 'Priority',     value: task.priority || 'MEDIUM' },
            { label: 'Entity',       value: `${task.entityType} #${task.entityId}`, mono: true },
            { label: 'Assigned',     value: task.assignedAt ? formatDateTime(task.assignedAt) : '—' },
            { label: 'Due',          value: task.dueAt ? formatDateTime(task.dueAt) : '—' },
            { label: 'Completed',    value: task.actedAt ? formatDateTime(task.actedAt) : '—' },
          ]} />
        </div>

        {/* Remarks */}
        {task.remarks && (
          <div className="p-4 rounded-xl border border-border bg-surface-raised">
            <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-1.5">Remarks</p>
            <p className="text-sm text-text-secondary italic">"{task.remarks}"</p>
          </div>
        )}

        {/* Workflow position */}
        {steps.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Workflow Position</p>
              <p className="text-xs font-mono text-text-muted">
                {steps.filter(s => s.status === 'APPROVED').length} / {steps.length} steps
              </p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-surface">
              <StepTimeline steps={steps} />
            </div>
          </div>
        )}

        {/* Active task actions */}
        {isActive && isActor && task.navKey && (
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
            <p className="text-sm font-medium text-amber-400 mb-1">This task requires action</p>
            <p className="text-xs text-text-muted mb-3">
              Open the task page to complete your work, then submit from there.
            </p>
            <Button size="sm" variant="primary" icon={ArrowRight}
              onClick={() => navigate('/workflow/inbox')}>
              Open in Inbox
            </Button>
          </div>
        )}

        {/* Activity — real-time comments */}
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Activity</p>
          <div className="bg-surface border border-border rounded-xl p-4">
            <TaskActivityFeed taskId={taskId} />
          </div>
        </div>
      </div>
    </PageLayout>
  )
}