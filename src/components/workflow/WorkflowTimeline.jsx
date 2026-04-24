import { useState } from 'react'
import { Check, Clock, Circle, X, Zap, ChevronDown, ChevronRight,
         Users, AlertTriangle, RotateCcw } from 'lucide-react'
import { cn } from '../../lib/cn'

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
  APPROVED:            { icon: Check,        color: 'text-green-400',  ring: 'border-green-500/40  bg-green-500/10'  },
  REJECTED:            { icon: X,            color: 'text-red-400',    ring: 'border-red-500/40    bg-red-500/10'    },
  IN_PROGRESS:         { icon: Clock,        color: 'text-brand-400',  ring: 'border-brand-500/40  bg-brand-500/10'  },
  AWAITING_ASSIGNMENT: { icon: Users,        color: 'text-amber-400',  ring: 'border-amber-500/40  bg-amber-500/10'  },
  REASSIGNED:          { icon: RotateCcw,    color: 'text-purple-400', ring: 'border-purple-500/40 bg-purple-500/10' },
  PENDING:             { icon: Circle,       color: 'text-text-muted', ring: 'border-border        bg-surface-overlay'},
}

const TASK_STATUS_COLOR = {
  PENDING:    'text-amber-400',
  APPROVED:   'text-green-400',
  REJECTED:   'text-red-400',
  DELEGATED:  'text-purple-400',
  REASSIGNED: 'text-blue-400',
  EXPIRED:    'text-text-muted',
}

// ── TaskRow ───────────────────────────────────────────────────────────────────

function TaskRow({ task, isAssigner }) {
  const statusColor = TASK_STATUS_COLOR[task.status] || 'text-text-muted'
  const name = task.assignedUserName || `User #${task.assignedUserId}`

  return (
    <div className={cn(
      'flex items-start gap-2.5 py-2 px-3 border-t border-border/50 first:border-t-0',
      isAssigner && 'opacity-60'
    )}>
      <div className={cn(
        'w-6 h-6 rounded-full border flex items-center justify-center shrink-0 mt-0.5',
        isAssigner
          ? 'bg-purple-500/10 border-purple-500/30'
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
            <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400 font-mono">
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
      </div>
    </div>
  )
}

// ── StepRow ───────────────────────────────────────────────────────────────────

function StepRow({ step, isLast }) {
  const latestIter = step.iterations?.[step.iterations.length - 1]
  const status = step.visited ? (latestIter?.status || 'PENDING') : 'PENDING'
  const cfg = STEP_STATUS[status] || STEP_STATUS.PENDING
  const Icon = cfg.icon
  const isSystem = step.side === 'SYSTEM'
  const slaBreached = latestIter?.slaBreached

  const [expanded, setExpanded] = useState(step.isCurrentStep)
  const allTasks    = latestIter?.tasks || []
  const actorTasks  = allTasks.filter(t => t.taskRole !== 'ASSIGNER')
  const assignerTasks = allTasks.filter(t => t.taskRole === 'ASSIGNER')
  // Show actor count in header — coordinators are noise, not progress indicators
  const taskCount   = actorTasks.length

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
        'flex-1 mb-3 rounded-lg border overflow-hidden',
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
                <span className="text-[10px] text-amber-400 font-medium">
                  ×{step.timesVisited} revisits
                </span>
              )}
              {slaBreached && (
                <span className="flex items-center gap-1 text-[10px] text-red-400">
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
              <div className="px-3 py-2 flex items-center gap-2">
                <Zap size={10} className="text-brand-400 shrink-0" />
                <span className="text-[10px] text-brand-400 font-mono">{step.automatedAction}</span>
                <span className="text-[10px] text-text-muted">fired automatically</span>
              </div>
            )}
            {/* Actor tasks — the people doing real work */}
            {actorTasks.length > 0
              ? actorTasks.map((t, i) => <TaskRow key={i} task={t} isAssigner={false} />)
              : !isSystem && (
                  <p className="px-3 py-2 text-[10px] text-text-muted italic">No tasks yet.</p>
                )
            }
            {/* Assigner/coordinator tasks — shown dimmed at bottom */}
            {assignerTasks.length > 0 && (
              <div className="border-t border-border/30">
                {assignerTasks.map((t, i) => <TaskRow key={i} task={t} isAssigner={true} />)}
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

export function WorkflowTimeline({ progress }) {
  if (!progress) return null

  // progress is an array; first element is the summary with steps
  const summary = Array.isArray(progress) ? progress[0] : progress
  if (!summary) return null

  const { steps = [], instanceStatus, stepsCompleted, totalSteps } = summary
  const pct = totalSteps > 0 ? Math.round((stepsCompleted / totalSteps) * 100) : 0

  return (
    <div className="flex flex-col gap-3">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-surface-overlay rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              instanceStatus === 'COMPLETED' ? 'bg-green-500' :
              instanceStatus === 'CANCELLED' ? 'bg-text-muted' :
              instanceStatus === 'REJECTED'  ? 'bg-red-500' : 'bg-brand-500'
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
          <StepRow key={step.stepId} step={step} isLast={i === steps.length - 1} />
        ))}
      </div>

      {/* Terminal state banner */}
      {instanceStatus === 'COMPLETED' && (
        <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-green-500/5 border border-green-500/20">
          <Check size={12} className="text-green-400" />
          <span className="text-xs text-green-400 font-medium">Workflow completed</span>
        </div>
      )}
      {instanceStatus === 'CANCELLED' && (
        <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-surface-overlay border border-border">
          <X size={12} className="text-text-muted" />
          <span className="text-xs text-text-muted">Workflow cancelled</span>
        </div>
      )}
      {instanceStatus === 'REJECTED' && (
        <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-red-500/5 border border-red-500/20">
          <X size={12} className="text-red-400" />
          <span className="text-xs text-red-400 font-medium">Workflow rejected</span>
        </div>
      )}
    </div>
  )
}