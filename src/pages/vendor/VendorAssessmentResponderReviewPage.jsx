/**
 * VendorAssessmentResponderReviewPage — Step 7: Responders review contributor answers.
 *
 * STEP-GATED ACCESS GUARD (NEW):
 *   Identical task ownership guard as VendorAssessmentFillPage and
 *   VendorAssessmentAssignPage. If the user navigates directly without a
 *   valid taskId in their inbox, they are redirected to /workflow/inbox.
 *
 * All other logic is unchanged from the original implementation.
 */

import { useState, useEffect, useLayoutEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, XCircle, ChevronDown, ChevronRight,
  Send, Loader2, MessageSquare, FileText, AlertTriangle, RotateCcw,
} from 'lucide-react'
import { assessmentsApi } from '../../api/assessments.api'
import { workflowsApi }   from '../../api/workflows.api'
import { Button }         from '../../components/ui/Button'
import { Badge }          from '../../components/ui/Badge'
import { cn }             from '../../lib/cn'
import { useSelector }    from 'react-redux'
import { selectAuth }     from '../../store/slices/authSlice'
import { Modal }          from '../../components/ui/Modal'
import { useAccessContext, useMyTasks, useCompoundTaskProgress } from '../../hooks/useWorkflow'
import { useQuestionComments }   from '../../hooks/useComments'
import { useAssessmentPageSetup } from '../../hooks/useAssessmentPageSetup'
import { CommentFeed }            from '../../components/comments/CommentFeed'
import { CompoundTaskProgress } from '../../components/workflow/CompoundTaskProgress'
import toast              from 'react-hot-toast'

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useAssessment = (id, enabled) => useQuery({
  queryKey: ['assessment-responder-review', id],
  queryFn:  () => assessmentsApi.vendor.get(id),
  enabled:  !!id && enabled,
})

const useMySections = (id, enabled) => useQuery({
  queryKey: ['my-sections-review', id],
  queryFn:  () => assessmentsApi.vendor.mySections(id),
  enabled:  !!id && !!enabled,
  select:   (d) => Array.isArray(d) ? d : (d?.data || []),
})

function useResponderAction(assessmentId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => workflowsApi.tasks.action(data),
    onSuccess: () => {
      qc.refetchQueries({ queryKey: ['compound-progress'] })
      qc.refetchQueries({ queryKey: ['my-sections-review'] })
      qc.invalidateQueries({ queryKey: ['assessment-responder-review'] })
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      qc.invalidateQueries({ queryKey: ['access-context'] })
      toast.success('Action submitted')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Action failed'),
  })
}

function useAddComment(assessmentId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ responseId, commentText }) =>
      assessmentsApi.vendor.comment(responseId, { commentText }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessment-responder-review', assessmentId] })
      qc.invalidateQueries({ queryKey: ['my-sections-review', assessmentId] })
      toast.success('Comment added')
    },
    onError: () => toast.error('Failed to add comment'),
  })
}

// Maps response type to display config
const TYPE_CONFIG = {
  SINGLE_CHOICE: { color: 'blue',   label: 'Single choice'   },
  MULTI_CHOICE:  { color: 'purple', label: 'Multiple choice' },
  TEXT:          { color: 'cyan',   label: 'Text'            },
  FILE_UPLOAD:   { color: 'amber',  label: 'File upload'     },
  NUMERIC:       { color: 'green',  label: 'Numeric'         },
  DATE:          { color: 'indigo', label: 'Date'            },
}

// ─── Answer card ─────────────────────────────────────────────────────────────

function AnswerCard({ question, assessmentId, canAct }) {
  const resp = question.currentResponse
  const { comments, addComment, adding: commenting } = useQuestionComments(
    question.questionInstanceId, { enabled: !!question.questionInstanceId }
  )
  const [showRevision,  setShowRevision]  = useState(false)
  const [revisionNote,  setRevisionNote]  = useState('')

  const tc = TYPE_CONFIG[question.responseType] || { label: question.responseType, color: 'gray' }

  // Parse multi-choice selections
  const multiIds = resp?.selectedOptionInstanceIds?.length
    ? resp.selectedOptionInstanceIds
    : (() => {
        if (resp?.responseText?.startsWith('[')) {
          try { return JSON.parse(resp.responseText) } catch { return [] }
        }
        return []
      })()
  const isMulti  = question.responseType === 'MULTI_CHOICE'
  const isSingle = question.responseType === 'SINGLE_CHOICE'

  const handleRequestRevision = () => {
    if (!revisionNote.trim()) return
    addComment({
      commentText: revisionNote.trim(),
      commentType: 'REVISION_REQUEST',
      visibility: 'ALL',
      questionInstanceId: question.questionInstanceId,
      responseId: resp?.responseId,
    })
    setShowRevision(false)
    setRevisionNote('')
  }

  // Use real-time comments from WS hook; fall back to response comments for initial render
  const allComments = comments.length > 0 ? comments : (resp?.comments || [])
  const hasRevisionFlag = allComments.some(c =>
    c.commentType === 'REVISION_REQUEST' || c.commentText?.startsWith('[REVISION NEEDED]'))

  return (
    <div className={cn(
      "py-3 border-b border-border last:border-0",
      hasRevisionFlag && "bg-amber-500/5"
    )}>
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-xs font-mono text-text-muted pt-0.5 flex-shrink-0 w-5">{question.orderNo}.</span>
        <div className="flex-1 min-w-0">
          {/* Question text + type badge */}
          <div className="flex items-start gap-2 mb-1.5 flex-wrap">
            <p className="text-sm text-text-primary flex-1">{question.questionText}</p>
            {question.mandatory && <span className="text-red-400 text-xs flex-shrink-0">*</span>}
            {hasRevisionFlag && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex-shrink-0">
                Revision requested
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge value={question.responseType} label={tc.label} colorTag={tc.color} />
            {question.assignedUserId && (
              <span className="text-[10px] text-text-muted">
                Assigned to {question.assignedUserName || `User #${question.assignedUserId}`}
              </span>
            )}
            {resp?.answeredByName && (
              <span className="text-[10px] text-text-muted italic">
                · Answered by {resp.answeredByName}
              </span>
            )}
          </div>

          {resp ? (
            <>
              {/* Text answer */}
              {resp.responseText && !isMulti && (
                <div className="p-2.5 rounded-md bg-surface-overlay border border-border mb-2">
                  <p className="text-xs text-text-secondary leading-relaxed">{resp.responseText}</p>
                </div>
              )}
              {/* Single choice */}
              {isSingle && resp.selectedOptionInstanceId && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {question.options?.map(o => {
                    const sel = o.optionInstanceId === resp.selectedOptionInstanceId
                    return (
                      <span key={o.optionInstanceId}
                        className={cn('text-xs px-2 py-0.5 rounded border',
                          sel ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 font-medium'
                              : 'border-border text-text-muted opacity-40')}>
                        {o.optionValue}
                        {o.score != null && <span className="ml-1 opacity-60">({o.score})</span>}
                      </span>
                    )
                  })}
                </div>
              )}
              {/* Multi choice */}
              {isMulti && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {question.options?.map(o => {
                    const sel = multiIds.includes(o.optionInstanceId)
                    return (
                      <span key={o.optionInstanceId}
                        className={cn('text-xs px-2 py-0.5 rounded border',
                          sel ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 font-medium'
                              : 'border-border text-text-muted opacity-40')}>
                        {o.optionValue}
                        {o.score != null && <span className="ml-1 opacity-60">({o.score})</span>}
                      </span>
                    )
                  })}
                  {multiIds.length > 0 && (
                    <span className="text-[10px] text-text-muted self-center">
                      {multiIds.length} selected
                    </span>
                  )}
                </div>
              )}

              {/* Real-time comments + revision request */}
              <div className="mt-3 space-y-2">
                {/* Quick revision request */}
                {canAct && !showRevision && (
                  <button onClick={() => setShowRevision(true)}
                    className="text-[10px] text-amber-400/70 hover:text-amber-400 flex items-center gap-1 transition-colors">
                    <AlertTriangle size={10} /> Request revision
                  </button>
                )}
                {showRevision && (
                  <div className="space-y-1 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <p className="text-[10px] text-amber-400 font-medium">Request revision from contributor</p>
                    <textarea value={revisionNote} onChange={e => setRevisionNote(e.target.value)}
                      rows={2} autoFocus
                      className="w-full rounded-md border border-amber-500/30 bg-surface-raised px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                      placeholder="What needs to be corrected or added?" />
                    <div className="flex gap-1">
                      <Button size="xs" variant="secondary" onClick={handleRequestRevision} loading={commenting}>
                        Send
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => setShowRevision(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
                {/* Real-time comment feed */}
                <CommentFeed
                  comments={allComments}
                  isLoading={false}
                  addComment={(data) => addComment({ ...data,
                    questionInstanceId: question.questionInstanceId,
                    responseId: resp?.responseId,
                  })}
                  adding={commenting}
                  canEdit={canAct}
                  showVisibility={false}
                  showType={false}
                  emptyMessage=""
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-text-muted italic">Not answered</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VendorAssessmentResponderReviewPage() {
  const { id }         = useParams()
  const navigate       = useNavigate()
  const qc             = useQueryClient()
  const [urlParams]    = useSearchParams()

  // Scroll to top immediately on mount — before paint, before data loads.
  // useLayoutEffect fires synchronously after DOM mutations but before the browser
  // paints, so the user never sees the previous page's scroll position.
  useLayoutEffect(() => {
    const el = document.getElementById('main-scroll')
    if (el) el.scrollTop = 0
  }, [])

  // openWork=1: arrived from action item — let backend decide access
  const isOpenWork     = urlParams.get('openWork') === '1'
  const targetQId      = urlParams.get('questionInstanceId')
  const { userId }     = useSelector(selectAuth)

  // ── Resolve live task from inbox — never trust stale URL params ───────────
  const { data: myTasksData, isLoading: tasksLoading } = useMyTasks({})
  const myTasks    = Array.isArray(myTasksData) ? myTasksData : (myTasksData?.items ?? [])
  // Prefer ACTOR task — it is the one whose approval advances the step.
  const isActiveStatus = (s) => s === 'PENDING' || s === 'IN_PROGRESS'
  const actorTask    = myTasks.find(t =>
    isActiveStatus(t.status) && String(t.artifactId) === String(id) && t.taskRole === 'ACTOR'
  ) || null
  const assignerTask = myTasks.find(t =>
    isActiveStatus(t.status) && String(t.artifactId) === String(id) && t.taskRole === 'ASSIGNER'
  ) || null
  const activeTask = actorTask || assignerTask

  const taskId         = activeTask ? String(activeTask.id)             : urlParams.get('taskId')
  const stepInstanceId = activeTask ? String(activeTask.stepInstanceId) : urlParams.get('stepInstanceId')

  // Scroll to specific question when questionInstanceId is in URL (from action item "Go to item")
  useEffect(() => {
    if (!targetQId) return
    const tryScroll = (attempts = 0) => {
      const el = document.querySelector(`[data-qid="${targetQId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-2', 'ring-brand-500/60', 'ring-offset-1')
        setTimeout(() => el.classList.remove('ring-2', 'ring-brand-500/60', 'ring-offset-1'), 3000)
      } else if (attempts < 20) {
        setTimeout(() => tryScroll(attempts + 1), 300)
      }
    }
    tryScroll()
  }, [targetQId])

  // ── Access context replaces useEffect task-gate ───────────────────────────
  const { data: taskSections = [] } = useCompoundTaskProgress(taskId ? Number(taskId) : null)
  const { data: access, isLoading: accessLoading } =
    useAccessContext(stepInstanceId, taskId ? Number(taskId) : undefined)

  const { data: assessmentData, isLoading } = useAssessment(id, !accessLoading && !!access?.canView)
  // canFetch: bypass access gate when arriving via action item
  const canFetch = isOpenWork ? !!id : (!accessLoading && !!access?.canView)
  const { data: mySections = [], isLoading: sectionsLoading } = useMySections(id, canFetch)
  // axios interceptor already unwraps ApiResponse<T> → T directly.
  // assessmentData IS the assessment object — not assessmentData.data.
  const assessment = assessmentData
  const { mutate: performAction, isPending: acting } = useResponderAction(id)
  // Step 5: Responder publishes section → fires SECTION_PUBLISHED
  const { mutate: publishSection, isPending: publishing } = useMutation({
    mutationFn: () => {
      if (!taskId) { throw new Error('No active task — open from your inbox to publish') }
      return assessmentsApi.vendor.publishSection(id, parseInt(taskId))
    },
    onSuccess: () => {
      qc.refetchQueries({ queryKey: ['compound-progress'] })
      qc.refetchQueries({ queryKey: ['my-sections-review'] })
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      qc.invalidateQueries({ queryKey: ['access-context'] })
      toast.success('Section published for CISO review')
    },
    onError: (e) => toast.error(e?.message || e?.response?.data?.error?.message || 'Failed to publish'),
  })

  // Step 6: CISO submits assessment to org → fires CISO_REVIEW_COMPLETE + ASSESSMENT_SUBMITTED
  const { mutate: cisoSubmit, isPending: submitting } = useMutation({
    mutationFn: () => {
      if (!taskId) { throw new Error('No active task — open from your inbox to submit') }
      return assessmentsApi.vendor.cisoSubmit(id, parseInt(taskId))
    },
    onSuccess: () => {
      // Invalidate everything so the workflow state reflects the submission
      qc.invalidateQueries({ queryKey: ['compound-progress'] })
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      qc.invalidateQueries({ queryKey: ['access-context'] })
      qc.invalidateQueries({ queryKey: ['assessment', id] })
      qc.invalidateQueries({ queryKey: ['vendor-assessment', id] })
      toast.success('Assessment submitted to organisation')
      // Navigate back to inbox — the CISO task is now auto-approved,
      // there's nothing left to do on this page
      navigate('/workflow/inbox')
    },
    onError: (e) => toast.error(e?.message || e?.response?.data?.error?.message || 'Failed to submit'),
  })
  const [open, setOpen] = useState({})
  const [showApprove, setShowApprove] = useState(false)
  const [remarks, setRemarks] = useState('')

  const toggle = (key) => setOpen(o => ({ ...o, [key]: !o[key] }))

  // Auto-mark "Review all answers" checkpoint + scroll to top on load.
  // Shared hook — add to any assessment page that needs the same behaviour.
  useAssessmentPageSetup({
    assessmentId: id,
    taskId,
    hasData: mySections.length > 0,
  })

  const handleApprove = () => {
    if (!taskId) { toast.error('Open from your task inbox'); return }
    performAction({
      taskInstanceId: parseInt(taskId),
      actionType: 'APPROVE',
      remarks,
    }, {
      onSuccess: () => { setShowApprove(false); navigate('/workflow/inbox') },
    })
  }

  const handleSendBack = () => {
    if (!taskId) { toast.error('Open from your task inbox'); return }
    performAction({
      taskInstanceId: parseInt(taskId),
      actionType: 'SEND_BACK',
      remarks: remarks || 'Sent back for revision',
    }, {
      onSuccess: () => navigate('/workflow/inbox'),
    })
  }

  // ALL hooks before any early returns — Rules of Hooks
  useEffect(() => {
    if (isOpenWork) return  // arrived via action item — backend decides
    if (!accessLoading && access && !access.canView) {
      navigate('/workflow/inbox', { replace: true })
    }
  }, [accessLoading, access, navigate])

  if ((!isOpenWork && (accessLoading || tasksLoading)) || isLoading || sectionsLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={24} className="animate-spin text-text-muted" />
    </div>
  )

  if (!isOpenWork && access && !access.canView) return null

  if (!assessment) return (
    <div className="p-6 text-center text-text-muted text-sm">
      Assessment not found or you do not have access.
    </div>
  )

  // Use mySections (responder's assigned sections only) for review too.
  // Falls back to all sections for CISO/observer view.
  const sections = mySections.length > 0 ? mySections : (assessment.sections || [])

  return (
    <div className="min-h-screen bg-background-tertiary">
      {/* Header */}
      <div className="bg-surface border-b border-border px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)}
          className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-text-primary truncate">
            Review — {assessment.templateName || 'Assessment'}
          </h1>
          <p className="text-xs text-text-muted">
            {assessment.vendorName}
            {taskId && <> · Task #{taskId}</>}
          </p>
        </div>
        {access?.mode === 'OBSERVER' && (
          <span className="text-[10px] font-medium px-2 py-1 rounded bg-purple-500/10 text-purple-400">Observer</span>
        )}
        {access?.mode === 'COMPLETED' && (
          <span className="text-[10px] font-medium px-2 py-1 rounded bg-green-500/10 text-green-400">Completed</span>
        )}
        {/* Show action buttons when user has an active task for this assessment.
            activeTask is resolved from myTasks (live inbox data) — more reliable
            than access?.canAct which is undefined until accessContext loads.
            taskId is derived from activeTask, so both are truthy together. */}
        {activeTask && taskId && (() => {
          // Step 6 (Vendor CISO final review) uses "Submit assessment" instead of "Publish section".
          // Detect by step name — CISO review step names contain 'CISO' or 'Final'.
          const isCisoStep = activeTask.stepName &&
            (activeTask.stepName.toLowerCase().includes('ciso') ||
             activeTask.stepName.toLowerCase().includes('final'))
          return (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" icon={XCircle}
                className="text-red-400" onClick={handleSendBack}>
                Send back
              </Button>
              {isCisoStep ? (
                <Button size="sm" variant="secondary" onClick={cisoSubmit} loading={submitting}>
                  Submit assessment
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={publishSection} loading={publishing}>
                  Publish section
                </Button>
              )}
            </div>
          )
        })()}
      </div>

      {/* Sections */}
      {taskSections.length > 0 && (
        <div className="max-w-3xl mx-auto px-4 pt-4">
          <CompoundTaskProgress sections={taskSections} />
        </div>
      )}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {sections.map((section, si) => {
          const key = `s-${si}`
          const isOpen = open[key] !== false

          return (
            <div key={si} className="bg-surface rounded-xl border border-border overflow-hidden">
              <button onClick={() => toggle(key)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-overlay/40 transition-colors">
                <div className="flex items-center gap-3">
                  <FileText size={15} className="text-text-muted flex-shrink-0" />
                  <p className="text-sm font-medium text-text-primary text-left">{section.sectionName}</p>
                </div>
                {isOpen
                  ? <ChevronDown size={14} className="text-text-muted" />
                  : <ChevronRight size={14} className="text-text-muted" />}
              </button>

              {isOpen && (
                <div className="border-t border-border px-5">
                  {(section.questions || []).map(q => (
                    <div key={q.questionInstanceId} data-qid={q.questionInstanceId} className="rounded transition-all duration-500">
                      <AnswerCard question={q} assessmentId={id} canAct={!!activeTask} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Approve confirmation modal */}
      <Modal isOpen={showApprove} onClose={() => setShowApprove(false)} title="Approve & publish">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Approve this assessment and publish the reviewed answers to the org team.
          </p>
          <textarea
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            rows={3}
            placeholder="Review remarks (optional)"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowApprove(false)}>Cancel</Button>
            <Button variant="primary" icon={CheckCircle2} onClick={handleApprove} loading={acting}>
              Approve
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}