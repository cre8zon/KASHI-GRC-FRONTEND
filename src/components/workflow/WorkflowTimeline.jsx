import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Clock, Circle, X, Zap, ChevronDown, ChevronRight,
         Users, AlertTriangle, RotateCcw, RefreshCw, RotateCw, AlertCircle, GitBranch, Info } from 'lucide-react'
import { cn } from '../../lib/cn'
import { workflowsApi } from '../../api/workflows.api'
import { assessmentsApi } from '../../api/assessments.api'
import toast from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dt) {
  if (!dt) return null
  try {
    return new Date(dt).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    })
  } catch { return dt }
}

function duration(mins) {
  if (mins == null) return null
  if (mins < 60)   return `${mins}m`
  if (mins < 1440) return `${Math.round(mins / 60)}h`
  return `${Math.round(mins / 1440)}d`
}

// ── Status config ─────────────────────────────────────────────────────────────

const STEP_STATUS = {
  APPROVED:            { icon: Check,        color: 'text-status-pass-fg',  ring: 'border-status-pass-bd  bg-status-pass-bg'  },
  REJECTED:            { icon: X,            color: 'text-status-fail-fg',    ring: 'border-status-fail-bd    bg-status-fail-bg'    },
  IN_PROGRESS:         { icon: Clock,        color: 'text-brand-400',  ring: 'border-brand-500/40  bg-brand-500/10'  },
  AWAITING_ASSIGNMENT: { icon: Users,        color: 'text-status-warn-fg',  ring: 'border-status-warn-bd  bg-status-warn-bg'  },
  REASSIGNED:          { icon: RotateCcw,    color: 'text-status-tag-fg', ring: 'border-status-tag-bd bg-status-tag-bg' },
  PENDING:             { icon: Circle,       color: 'text-text-muted', ring: 'border-border        bg-surface-overlay'},
}

const TASK_STATUS_COLOR = {
  PENDING:    'text-status-warn-fg',
  APPROVED:   'text-status-pass-fg',
  REJECTED:   'text-status-fail-fg',
  DELEGATED:  'text-status-tag-fg',
  REASSIGNED: 'text-status-info-fg',
  EXPIRED:    'text-text-muted',
}

// ── TaskRow ───────────────────────────────────────────────────────────────────

function TaskRow({ task, isAssigner, stepInstanceId, workflowInstanceId, isAdmin, assessmentId }) {
  const statusColor = TASK_STATUS_COLOR[task.status] || 'text-text-muted'
  const name = task.assignedUserName || `User #${task.assignedUserId}`
  const [confirmReset,    setConfirmReset]    = useState(false)
  const [confirmRollback, setConfirmRollback] = useState(false)
  const [confirmTaskOnly, setConfirmTaskOnly] = useState(false)
  const qc = useQueryClient()

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['wf-progress', workflowInstanceId] })
    qc.invalidateQueries({ queryKey: ['my-tasks'] })
    qc.invalidateQueries({ queryKey: ['reviewer-my-sections-v2', assessmentId] })
  }

  // Re-evaluate: just re-check the gate without touching task state
  const { mutate: reEvaluate, isPending: reEvaluating } = useMutation({
    mutationFn: () => workflowsApi.instances.reEvaluateStep(workflowInstanceId, stepInstanceId),
    onSuccess: (data) => {
      const r = data?.data ?? data
      if (r?.advanced) {
        toast.success(`Step advanced → ${r.nextStep || 'next step'}`)
        invalidate()
      } else {
        toast(`Gate not satisfied — ${r?.reason || 'some tasks still pending'}`, { icon: '⚠️' })
      }
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Re-evaluate failed'),
  })

  // Reset task: full reopen — task status + section gates + reviewer section submissions
  const { mutate: resetTask, isPending: resetting } = useMutation({
    mutationFn: async ({ rollbackDownstream }) => {
      await workflowsApi.instances.resetTask(workflowInstanceId, task.taskId, rollbackDownstream)
      if (assessmentId) {
        await assessmentsApi.resetReviewerSections(assessmentId, task.assignedUserId)
      }
    },
    onSuccess: (_, { rollbackDownstream }) => {
      toast.success(rollbackDownstream
        ? `Task reopened — downstream steps rolled back`
        : `Task reopened — ${name} can re-work`)
      setConfirmReset(false)
      setConfirmRollback(false)
      setConfirmTaskOnly(false)
      invalidate()
    },
    onError: (e) => {
      toast.error(e?.response?.data?.error?.message || 'Reset failed')
      setConfirmReset(false)
      setConfirmRollback(false)
      setConfirmTaskOnly(false)
    },
  })

  const showActions = isAdmin && !isAssigner && !!stepInstanceId && !!workflowInstanceId
  const showReEvaluate = showActions && task.status === 'IN_PROGRESS'
  const showReset = showActions  // available for any status

  return (
    <div className={cn(
      'flex items-start gap-2.5 py-2 px-3 border-t border-border/50 first:border-t-0',
      isAssigner && 'opacity-60'
    )}>
      <div className={cn(
        'w-6 h-6 rounded-full border flex items-center justify-center shrink-0 mt-0.5',
        isAssigner
          ? 'bg-status-tag-bg border-status-tag-bd'
          : 'bg-surface-overlay border-border'
      )}>
        <span className="text-[9px] font-bold text-text-muted">
          {name[0]?.toUpperCase() || '?'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-text-primary">{name}</span>
          {isAssigner && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-status-tag-bg text-status-tag-fg font-mono">
              coordinator
            </span>
          )}
          <span className={cn('text-[10px] font-mono', statusColor)}>{task.status}</span>
          {task.delegatedToName && (
            <span className="text-[10px] text-text-muted">
              → delegated to <span className="text-text-secondary">{task.delegatedToName}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {task.assignedAt && (
            <span className="text-[10px] text-text-muted">Assigned {fmt(task.assignedAt)}</span>
          )}
          {task.actedAt && task.actedAt !== '' && (
            <span className="text-[10px] text-text-muted">Acted {fmt(task.actedAt)}</span>
          )}
        </div>
        {task.remarks && task.remarks !== '' && (
          <p className="text-[10px] text-text-muted mt-0.5 italic truncate">"{task.remarks}"</p>
        )}

        {/* Admin action buttons */}
        {(showReset || showReEvaluate) && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {/* Re-evaluate — gate check only, no state change */}
            {showReEvaluate && (
              <button
                onClick={() => reEvaluate()}
                disabled={reEvaluating || resetting}
                className="flex items-center gap-1 text-[10px] font-medium text-brand-400 hover:text-brand-300 border border-brand-500/30 hover:bg-brand-500/10 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
              >
                <RefreshCw size={9} className={reEvaluating ? 'animate-spin' : ''}/>
                {reEvaluating ? 'Checking…' : 'Re-evaluate'}
              </button>
            )}

            {/* Reset task — full reopen with confirmation */}
            {showReset && !confirmReset && (
              <button
                onClick={() => setConfirmReset(true)}
                disabled={resetting || reEvaluating}
                className="flex items-center gap-1 text-[10px] font-medium text-status-warn-fg hover:text-status-warn-fg border border-status-warn-bd hover:bg-status-warn-bg px-2 py-0.5 rounded transition-colors disabled:opacity-50"
              >
                <RotateCw size={9}/>
                Reopen task
              </button>
            )}

            {/* Two-option reopen modal */}
            {confirmReset && (
              <div className="mt-1 w-full rounded-card border border-status-warn-bd bg-status-warn-bg p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <AlertCircle size={11} className="text-status-warn-fg shrink-0" />
                  <span className="text-[10px] font-semibold text-status-warn-fg">How do you want to reopen?</span>
                </div>
                {/* Option 1 — task only, with confirmation */}
                {!confirmTaskOnly ? (
                  <button
                    onClick={() => setConfirmTaskOnly(true)}
                    disabled={resetting}
                    className="w-full text-left rounded-ctl border border-border hover:border-brand-500/40 bg-surface-raised hover:bg-brand-500/5 px-2.5 py-2 transition-colors disabled:opacity-50"
                  >
                    <p className="text-[10px] font-semibold text-text-primary">Reopen this task only</p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {name} re-does their work. Other tasks and downstream steps are unaffected.
                    </p>
                  </button>
                ) : (
                  <div className="rounded-ctl border border-brand-500/30 bg-brand-500/5 p-2.5 space-y-2">
                    <div className="flex items-start gap-1.5">
                      <AlertCircle size={11} className="text-brand-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-bold text-brand-400">Confirm: reopen this task only</p>
                        <p className="text-[10px] text-text-muted mt-0.5">
                          {name}'s task will return to In Progress. All other tasks and downstream steps remain untouched.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => resetTask({ rollbackDownstream: false })}
                        disabled={resetting}
                        className="flex-1 text-[10px] font-bold text-brand-900 bg-brand-600 hover:bg-brand-700 rounded px-2 py-1 transition-colors disabled:opacity-50"
                      >
                        {resetting ? 'Reopening…' : 'Yes, reopen task'}
                      </button>
                      <button
                        onClick={() => setConfirmTaskOnly(false)}
                        className="text-[10px] text-text-muted hover:text-text-secondary px-2 py-1"
                      >
                        Go back
                      </button>
                    </div>
                  </div>
                )}
                {/* Option 2 — opens final disclaimer before firing */}
                {!confirmRollback ? (
                  <button
                    onClick={() => setConfirmRollback(true)}
                    disabled={resetting}
                    className="w-full text-left rounded-ctl border border-status-warn-bd hover:border-status-warn-bd bg-status-warn-bg hover:bg-status-warn-bg px-2.5 py-2 transition-colors disabled:opacity-50"
                  >
                    <p className="text-[10px] font-semibold text-status-warn-fg">Reopen + roll back downstream</p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      Reverts this step and expires all tasks on subsequent steps. Use when the work here was fundamentally wrong.
                    </p>
                  </button>
                ) : (
                  <div className="rounded-ctl border border-status-fail-bd bg-status-fail-bg p-2.5 space-y-2">
                    <div className="flex items-start gap-1.5">
                      <AlertCircle size={11} className="text-status-fail-fg shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-bold text-status-fail-fg">This cannot be undone</p>
                        <p className="text-[10px] text-text-muted mt-0.5">
                          All tasks on every step after this one will be permanently expired. Responders will lose access to their in-progress work. The CISO will need to reassign sections from scratch.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { resetTask({ rollbackDownstream: true }); setConfirmRollback(false) }}
                        disabled={resetting}
                        className="flex-1 text-[10px] font-bold text-on-dark bg-status-fail-bg hover:bg-status-fail-bg rounded px-2 py-1 transition-colors disabled:opacity-50"
                      >
                        {resetting ? 'Rolling back…' : 'Yes, roll back downstream'}
                      </button>
                      <button
                        onClick={() => setConfirmRollback(false)}
                        className="text-[10px] text-text-muted hover:text-text-secondary px-2 py-1"
                      >
                        Go back
                      </button>
                    </div>
                  </div>
                )}
                {!confirmRollback && !confirmTaskOnly && (
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="text-[10px] text-text-muted hover:text-text-secondary"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── StepRow ───────────────────────────────────────────────────────────────────

function StepRow({ step, isLast, workflowInstanceId, isAdmin, assessmentId }) {
  const latestIter = step.iterations?.[step.iterations.length - 1]
  const status = step.visited ? (latestIter?.status || 'PENDING') : 'PENDING'
  const cfg = STEP_STATUS[status] || STEP_STATUS.PENDING
  const Icon = cfg.icon
  const isSystem = step.side === 'SYSTEM'
  const slaBreached = latestIter?.slaBreached

  const [expanded, setExpanded] = useState(step.isCurrentStep)
  const allTasks      = latestIter?.tasks || []
  const actorTasks    = allTasks.filter(t => t.taskRole !== 'ASSIGNER')
  const assignerTasks = allTasks.filter(t => t.taskRole === 'ASSIGNER')
  const taskCount     = actorTasks.length
  const stepInstanceId = latestIter?.stepInstanceId

  return (
    <div className="flex gap-3">
      {/* Timeline spine */}
      <div className="flex flex-col items-center shrink-0">
        <div className={cn(
          'w-7 h-7 rounded-full border-2 flex items-center justify-center',
          cfg.ring,
          step.isCurrentStep && 'ring-2 ring-brand-500/30 ring-offset-1 ring-offset-transparent'
        )}>
          {isSystem
            ? <Zap size={12} className={cfg.color} />
            : <Icon size={12} className={cfg.color} strokeWidth={2.5} />
          }
        </div>
        {!isLast && <div className="w-px flex-1 bg-border/50 my-1 min-h-[12px]" />}
      </div>

      {/* Card */}
      <div className={cn(
        'flex-1 mb-3 rounded-card border overflow-hidden',
        step.isCurrentStep
          ? 'border-brand-500/30 bg-brand-500/3'
          : step.visited
            ? 'border-border/60 bg-surface-raised'
            : 'border-border/30 bg-surface-raised/50 opacity-60'
      )}>
        {/* Header */}
        <button
          onClick={() => step.visited && setExpanded(e => !e)}
          disabled={!step.visited}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2.5 text-left',
            step.visited ? 'hover:bg-surface-overlay transition-colors cursor-pointer' : 'cursor-default'
          )}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-text-primary">
                {step.stepOrder}. {step.stepName}
              </span>
              {isSystem && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 font-mono">
                  auto
                </span>
              )}
              {step.timesVisited > 1 && (
                <span className="text-[10px] text-status-warn-fg font-medium">
                  ×{step.timesVisited} revisits
                </span>
              )}
              {slaBreached && (
                <span className="flex items-center gap-1 text-[10px] text-status-fail-fg">
                  <AlertTriangle size={9} /> SLA breached
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className={cn('text-[10px] font-mono', cfg.color)}>
                {step.visited ? status : 'NOT YET REACHED'}
              </span>
              {latestIter?.durationMinutes != null && (
                <span className="text-[10px] text-text-muted">
                  {duration(latestIter.durationMinutes)}
                </span>
              )}
              {taskCount > 0 && (
                <span className="text-[10px] text-text-muted">{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
              )}
              {step.side && step.side !== 'SYSTEM' && (
                <span className="text-[10px] text-text-muted">{step.side}</span>
              )}
            </div>
          </div>
          {step.visited && (
            expanded
              ? <ChevronDown size={12} className="text-text-muted shrink-0" />
              : <ChevronRight size={12} className="text-text-muted shrink-0" />
          )}
        </button>

        {/* Expanded tasks */}
        {expanded && step.visited && (
          <div className="border-t border-border/50">
            {isSystem && step.automatedAction && (
              <div className="px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Zap size={10} className="text-brand-400 shrink-0" />
                  <span className="text-[10px] text-brand-400 font-mono">{step.automatedAction}</span>
                  <span className="text-[10px] text-text-muted">fires automatically</span>
                </div>
                {status === 'IN_PROGRESS' && isAdmin && (
                  <div className="flex items-start gap-2 bg-status-warn-bg border border-status-warn-bd rounded-card px-2.5 py-2 mt-1">
                    <Info size={10} className="shrink-0 text-status-warn-fg mt-0.5" />
                    <p className="text-[10px] text-status-warn-fg leading-relaxed">
                      This step auto-completes when all required items are done.
                      If you're satisfied with progress, you can manually advance
                      using <span className="font-medium text-status-warn-fg">Re-evaluate</span> → approve on any task above, or the APPROVE action.
                    </p>
                  </div>
                )}
              </div>
            )}
            {/* Actor tasks — the people doing real work */}
            {actorTasks.length > 0
              ? actorTasks.map((t, i) => <TaskRow key={i} task={t} isAssigner={false}
                  stepInstanceId={stepInstanceId} workflowInstanceId={workflowInstanceId} isAdmin={isAdmin} assessmentId={assessmentId}/>)
              : !isSystem && (
                  <p className="px-3 py-2 text-[10px] text-text-muted italic">No tasks yet.</p>
                )
            }
            {/* Assigner/coordinator tasks — shown dimmed at bottom */}
            {assignerTasks.length > 0 && (
              <div className="border-t border-border/30">
                {assignerTasks.map((t, i) => <TaskRow key={i} task={t} isAssigner={true}
                  stepInstanceId={stepInstanceId} workflowInstanceId={workflowInstanceId} isAdmin={isAdmin} assessmentId={assessmentId}/>)}
              </div>
            )}
            {/* Show previous iterations if step was revisited */}
            {step.iterations?.length > 1 && (
              <div className="px-3 py-2 border-t border-border/30">
                <p className="text-[10px] text-text-muted">
                  + {step.iterations.length - 1} earlier iteration{step.iterations.length > 2 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── WorkflowTimeline ──────────────────────────────────────────────────────────
//
// Props:
//   progress — the array returned by GET /v1/workflow-instances/{id}/progress
//              (the first element is the summary object with a `steps` array)
//
// Used by:
//   VendorDetailPage → WorkflowInstancePanel (org side view)
//   WorkflowPage     → InstanceDetail progress tab (admin view)

// Props:
//   progress           — array from GET /v1/workflow-instances/{id}/progress
//   workflowInstanceId — needed for the re-evaluate API call
//   isAdmin            — if true, shows "Re-evaluate step" button on IN_PROGRESS steps
//                        pass true for ORG_ADMIN / ORG_OWNER / PLATFORM_ADMIN users

export function WorkflowTimeline({ progress, workflowInstanceId, isAdmin = false, assessmentId }) {
  if (!progress) return null

  const summary = Array.isArray(progress) ? progress[0] : progress
  if (!summary) return null

  const { steps = [], instanceStatus, stepsCompleted, totalSteps, workflowName } = summary
  const pct = totalSteps > 0 ? Math.round((stepsCompleted / totalSteps) * 100) : 0

  return (
    <div className="flex flex-col gap-3">
      {/* Workflow name + instance ID */}
      {workflowName && (
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <GitBranch size={11} className="text-brand-400 shrink-0" />
          <span className="font-medium text-text-secondary">{workflowName}</span>
          {workflowInstanceId && (
            <span className="text-text-muted/50">· Instance #{workflowInstanceId}</span>
          )}
        </div>
      )}
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-surface-overlay rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              instanceStatus === 'COMPLETED' ? 'bg-status-pass-bg' :
              instanceStatus === 'CANCELLED' ? 'bg-text-muted' :
              instanceStatus === 'REJECTED'  ? 'bg-status-fail-bg' : 'bg-brand-500'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-text-muted shrink-0">
          {stepsCompleted}/{totalSteps} steps
        </span>
      </div>

      {/* Step timeline */}
      <div>
        {steps.map((step, i) => (
          <StepRow
            key={step.stepId}
            step={step}
            isLast={i === steps.length - 1}
            workflowInstanceId={workflowInstanceId}
            isAdmin={isAdmin}
            assessmentId={assessmentId}
          />
        ))}
      </div>

      {/* Terminal state banner */}
      {instanceStatus === 'COMPLETED' && (
        <div className="flex items-center gap-2 py-2 px-3 rounded-ctl bg-status-pass-bg border border-status-pass-bd">
          <Check size={12} className="text-status-pass-fg" />
          <span className="text-xs text-status-pass-fg font-medium">Workflow completed</span>
        </div>
      )}
      {instanceStatus === 'CANCELLED' && (
        <div className="flex items-center gap-2 py-2 px-3 rounded-ctl bg-surface-overlay border border-border">
          <X size={12} className="text-text-muted" />
          <span className="text-xs text-text-muted">Workflow cancelled</span>
        </div>
      )}
      {instanceStatus === 'REJECTED' && (
        <div className="flex items-center gap-2 py-2 px-3 rounded-ctl bg-status-fail-bg border border-status-fail-bd">
          <X size={12} className="text-status-fail-fg" />
          <span className="text-xs text-status-fail-fg font-medium">Workflow rejected</span>
        </div>
      )}
    </div>
  )
}