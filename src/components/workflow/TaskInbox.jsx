import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, CornerDownLeft, ArrowRight, Loader2, Users, UserCheck, AlertTriangle } from 'lucide-react'
import { useMyTasks, useTaskAction } from '../../hooks/useWorkflow'
import { useNavigation } from '../../hooks/useUIConfig'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import { formatDateTime } from '../../utils/format'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { cn } from '../../lib/cn'
import { Modal } from '../ui/Modal'
import { Skeleton } from '../ui/EmptyState'

/**
 * Step actions where the actor must open a dedicated page to do real work.
 * These must NEVER be approved inline from the inbox — the user has to go
 * to the page, do the work (fill answers, upload evidence, review, generate
 * a report), and submit/approve from there.
 *
 * APPROVE and ASSIGN are intentionally excluded:
 *   APPROVE — pure sign-off, no content work, inline is fine
 *   ASSIGN  — actor picks someone via DELEGATE, handled by the assign page
 *             BUT the inbox route button still opens the assign page
 */
const WORK_STEP_ACTIONS = new Set(['FILL', 'REVIEW', 'EVALUATE', 'GENERATE', 'ACKNOWLEDGE'])

/**
 * Resolves the navigation URL for a task.
 *
 * Primary: navKey on the task → look up in nav table → replace :id with artifactId
 * Fallback: resolvedStepSide + resolvedStepAction → scan nav table by route pattern
 *           This handles the case where the blueprint step was saved before navKey
 *           was configured, or the DB migration hasn't run yet.
 *
 * Returns null only when no route can be determined at all.
 * Null → inline buttons shown (safe only for APPROVE/ASSIGN steps).
 */
function resolveTaskRoute(task, navItems) {
  if (!task.artifactId) return null
  const qp = `?taskId=${task.id}&stepInstanceId=${task.stepInstanceId}`

  // ── Primary: navKey lookup ────────────────────────────────────────────────
  if (task.navKey) {
    const nav = (navItems || []).find(n => n.navKey === task.navKey)
    if (nav?.route) return nav.route.replace(':id', task.artifactId) + qp
  }

  // No navKey → blueprint step is misconfigured.
  // activateWorkflow() now hard-blocks blueprints missing navKey (Gap 10),
  // so this path should never be hit in production. Return null — the inbox
  // renders a disabled "Open Task" button with a misconfiguration warning.
  return null
}

/**
 * Returns true when this task requires the user to open the work page
 * before they can approve — i.e. they cannot approve inline from the inbox.
 *
 * Rule: ACTOR tasks on work steps (FILL/REVIEW/GENERATE/EVALUATE/ACKNOWLEDGE)
 * must always open the dedicated page. The page is where the real work happens
 * (filling answers, uploading evidence, reviewing submissions, generating reports).
 * Approving inline would skip all that and falsely advance the workflow.
 *
 * ASSIGNER tasks, APPROVE tasks, and ASSIGN tasks may use inline buttons
 * because their "work" is a decision (acknowledge/sign-off/pick someone),
 * not content creation.
 */
function requiresPageOpen(task) {
  if (task.taskRole === 'ASSIGNER') return false
  return WORK_STEP_ACTIONS.has(task.resolvedStepAction)
}

const priorityConfig = {
  CRITICAL: 'text-red-400 bg-red-500/10',
  HIGH:     'text-amber-400 bg-amber-500/10',
  MEDIUM:   'text-text-muted bg-surface-overlay',
  LOW:      'text-text-muted bg-surface-overlay/50',
}

const TASK_ROLE_CONFIG = {
  ASSIGNER: { label: 'Coordinator', icon: UserCheck, color: 'text-purple-400 bg-purple-500/10' },
  ACTOR:    { label: 'Actor',       icon: Users,     color: 'text-brand-400 bg-brand-500/10'   },
}

export function TaskInbox({ filterFn } = {}) {
  const { data, isLoading }  = useMyTasks({})
  const { mutate: actOnTask, isPending } = useTaskAction()
  const { userId } = useSelector(selectAuth)
  const { data: navItems = [] } = useNavigation()
  const navigate = useNavigate()
  const [activeTask, setActiveTask] = useState(null)
  const [action, setAction]         = useState(null)
  const [remarks, setRemarks]       = useState('')

  const rawTasks = Array.isArray(data) ? data : (data?.items || data?.data || [])
  const tasks = filterFn ? rawTasks.filter(filterFn) : rawTasks

  const handleAct = (task, actionType) => {
    setActiveTask(task)
    setAction(actionType)
    setRemarks('')
  }

  const confirmAct = () => {
    actOnTask({
      taskInstanceId: activeTask.id,
      actionType: action,
      remarks,
    }, {
      onSuccess: () => { setActiveTask(null); setAction(null) },
    })
  }

  const openTask = (task) => {
    const route = resolveTaskRoute(task, navItems)
    if (route) navigate(route)
  }

  if (isLoading) return (
    <div className="space-y-2 p-4">
      {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
    </div>
  )

  if (!tasks.length) return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <CheckCircle size={28} className="text-green-400 mb-3" strokeWidth={1.5} />
      <p className="text-sm font-medium text-text-primary">All clear!</p>
      <p className="text-xs text-text-muted mt-1">No pending tasks</p>
    </div>
  )

  return (
    <>
      <div className="divide-y divide-border">
        {tasks.map(task => {
          const tid        = task.id
          const stepName   = task.stepName || `Step ${task.stepOrder || '?'}`
          const route      = resolveTaskRoute(task, navItems)
          const roleConf   = TASK_ROLE_CONFIG[task.taskRole] || TASK_ROLE_CONFIG.ACTOR
          const RoleIcon   = roleConf.icon
          const isAssigner = task.taskRole === 'ASSIGNER'
          // Must the user open the work page before they can act?
          const mustOpen   = requiresPageOpen(task)
          // If mustOpen but no route found — misconfigured blueprint (navKey missing + no fallback)
          const isMisconfigured = mustOpen && !route

          return (
            <div key={tid}
              className="px-4 py-3 hover:bg-surface-overlay/50 transition-colors cursor-pointer"
              onClick={(e) => { if (e.target.closest("button")) return; navigate(`/workflow/tasks/${tid}`) }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Priority + entity + role + action badges */}
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {task.priority && (
                      <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded',
                        priorityConfig[task.priority] || priorityConfig.MEDIUM)}>
                        {task.priority}
                      </span>
                    )}
                    <span className="text-xs text-text-muted font-mono">
                      {task.entityType} #{task.entityId}
                    </span>
                    <span className={cn('flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium', roleConf.color)}>
                      <RoleIcon size={9} />
                      {roleConf.label}
                    </span>
                    {task.resolvedStepAction && task.resolvedStepAction !== 'APPROVE' && (
                      <span className="text-[10px] text-text-muted font-mono bg-surface-overlay px-1.5 py-0.5 rounded">
                        {task.resolvedStepAction}
                      </span>
                    )}
                  </div>

                  {/* Step name */}
                  <p className="text-sm text-text-primary font-medium">{stepName}</p>
                  {task.workflowName && (
                    <p className="text-xs text-text-muted">{task.workflowName}</p>
                  )}
                  <p className="text-xs text-text-muted mt-0.5 font-mono">
                    Task #{tid} · {formatDateTime(task.assignedAt || task.createdAt)}
                  </p>

                  {/* Context hints */}
                  {isAssigner && !route && (
                    <p className="text-[10px] text-purple-400/80 mt-0.5">
                      You are coordinating this step. Actors must complete their work first.
                    </p>
                  )}
                  {isMisconfigured && (
                    <p className="text-[10px] text-amber-400/80 mt-0.5 flex items-center gap-1">
                      <AlertTriangle size={9} />
                      Open the page to complete this task — contact admin if the link is missing.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {route ? (
                    // Always show "Open Task" when a route exists — the page handles submit/approve
                    <Button variant="primary" size="xs" icon={ArrowRight}
                      onClick={() => openTask(task)}>
                      Open Task
                    </Button>
                  ) : mustOpen ? (
                    // Work step but no route — show disabled Open Task so it's clear something is wrong
                    // Don't offer inline Approve — that would skip the actual work
                    <Button variant="ghost" size="xs" icon={ArrowRight} disabled>
                      Open Task
                    </Button>
                  ) : (
                    // ASSIGNER acknowledgement or pure APPROVE step — inline is fine
                    <>
                      <Button variant="ghost" size="xs" icon={CornerDownLeft}
                        onClick={() => handleAct(task, 'SEND_BACK')}>Back</Button>
                      <Button variant="danger" size="xs" icon={XCircle}
                        onClick={() => handleAct(task, 'REJECT')}>Reject</Button>
                      <Button variant="primary" size="xs" icon={CheckCircle}
                        onClick={() => handleAct(task, 'APPROVE')}>
                        {isAssigner ? 'Acknowledge' : 'Approve'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Confirmation modal */}
      <Modal
        open={!!activeTask && !!action}
        onClose={() => setActiveTask(null)}
        title={action === 'APPROVE'
          ? (activeTask?.taskRole === 'ASSIGNER' ? 'Acknowledge Coordination' : 'Approve Task')
          : action === 'REJECT' ? 'Reject Task'
          : 'Send Back'}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setActiveTask(null)}>Cancel</Button>
            <Button variant={action === 'APPROVE' ? 'primary' : 'danger'}
              size="sm" loading={isPending} onClick={confirmAct}>
              Confirm {action === 'APPROVE' && activeTask?.taskRole === 'ASSIGNER' ? 'acknowledgement' : action?.toLowerCase()}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            {action === 'APPROVE' && activeTask?.taskRole === 'ASSIGNER'
              ? 'Acknowledge that you have reviewed and coordinated this step. This does not advance the workflow — actors must complete their work first.'
              : action === 'APPROVE' ? 'Confirm approval of this task.'
              : action === 'REJECT' ? 'This will reject the task and may block the workflow.'
              : 'Send this task back for revision.'}
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              Remarks (optional)
            </label>
            <textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)}
              placeholder="Add a note…"
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
          </div>
        </div>
      </Modal>
    </>
  )
}