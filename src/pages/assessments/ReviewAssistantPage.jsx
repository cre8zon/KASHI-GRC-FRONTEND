/**
 * ReviewAssistantPage — Step 11 sub-role: Review Assistants evaluate assigned questions.
 *
 * ANALOGY: This page mirrors VendorAssessmentFillPage (contributor mode) exactly.
 *
 *   Vendor contributor                      Review Assistant
 *   ─────────────────────────────────────   ──────────────────────────────────────
 *   assignedUserId on QuestionInstance      reviewerAssignedUserId on QuestionInstance
 *   GET /my-questions                       GET /my-questions (same — filtered by reviewerAssignedUserId)
 *   Answers questions (text/choice)         Evaluates questions (PASS/PARTIAL/FAIL)
 *   POST /contributor-submit                POST /sections/:sid/assistant-submit
 *   Section lock via submittedAt            Section lock via assistant submission
 *   RevisionBanner (amber)                  ClarificationBanner (purple)
 *   Re-answers on REVISION_REQUEST          Re-evaluates on REVIEW_CLARIFICATION
 *
 * NAVKEY: org_assessment_review (same as reviewer — taskId in URL param distinguishes)
 * Route: /assessments/:id/assistant-review?taskId=X
 *
 * ACCESS GUARD:
 *   - Task must exist in user's inbox (taskId param check)
 *   - Backend: assertUserHasActiveTask() guards the underlying /my-questions endpoint
 *   - REVIEW_CLARIFICATION obligation bypass: if clarification item is open,
 *     assistant can still access even without active task
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, ChevronDown, ChevronRight,
  Loader2, FileText, ThumbsUp, ThumbsDown, Minus,
  AlertTriangle, MessageSquare, Send,
} from 'lucide-react'
import { assessmentsApi } from '../../api/assessments.api'
import { reviewApi }      from '../../api/review.api'
import { workflowsApi }   from '../../api/workflows.api'
import { Button }         from '../../components/ui/Button'
import { Badge }          from '../../components/ui/Badge'
import { cn }             from '../../lib/cn'
import { formatDate }     from '../../utils/format'
import { useSelector }    from 'react-redux'
import { selectAuth }     from '../../store/slices/authSlice'
import { useMyTasks }     from '../../hooks/useWorkflow'
import { useEntityActionItems, useUpdateActionItemStatus } from '../../hooks/useActionItems'
import { useQuestionComments } from '../../hooks/useComments'
import toast from 'react-hot-toast'

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useAssessment = (id) => useQuery({
  queryKey: ['assessment-review', id],
  queryFn:  () => assessmentsApi.vendor.review(id),
  enabled:  !!id,
})

// Reuse the same /my-questions endpoint — backend filters by reviewerAssignedUserId
const useMyAssistantQuestions = (assessmentId, enabled) => useQuery({
  queryKey: ['my-assistant-questions', assessmentId],
  queryFn:  () => assessmentsApi.vendor.myQuestions(assessmentId),
  enabled:  !!assessmentId && enabled,
  select:   (data) => Array.isArray(data) ? data : (data?.data || []),
})

const useAssistantSectionStatus = (assessmentId, taskId) => useQuery({
  queryKey: ['assistant-section-status', assessmentId, taskId],
  queryFn:  () => reviewApi.assistantSectionStatus(assessmentId),
  enabled:  !!assessmentId,
  select:   (d) => {
    const rows = Array.isArray(d) ? d : (d?.data || [])
    return new Set(rows.map(r => r.sectionInstanceId))
  },
})

const useSaveEval = (assessmentId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ questionInstanceId, verdict }) =>
      assessmentsApi.vendor.saveReviewerEval(assessmentId, questionInstanceId, verdict),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-assistant-questions', assessmentId] }),
    onError: () => toast.error('Failed to save evaluation'),
  })
}

const useAssistantSubmitSection = (assessmentId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionInstanceId, taskId }) =>
      reviewApi.assistantSubmitSection(assessmentId, sectionInstanceId, taskId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['assistant-section-status', assessmentId] })
      qc.invalidateQueries({ queryKey: ['my-assistant-questions', assessmentId] })
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      const result = data?.data || data
      if (result?.taskApproved) {
        toast.success('All evaluations submitted — task complete!')
      } else {
        toast.success('Section evaluations submitted')
      }
    },
    onError: (e) => toast.error(e?.message || 'Failed to submit'),
  })
}

// ─── ClarificationBanner ─────────────────────────────────────────────────────
// Purple equivalent of RevisionBanner (vendor side amber).
// Shows when a REVIEW_CLARIFICATION action item is open on this question.
// Assistant re-evaluates and submits → item moves to PENDING_REVIEW.
// Reviewer then resolves.

function ClarificationBanner({ questionInstanceId, hasCurrentEval }) {
  const { data: items = [] } = useEntityActionItems('QUESTION_RESPONSE', questionInstanceId,
    { enabled: !!questionInstanceId })

  const openClarifications = items.filter(i =>
    (i.status === 'OPEN' || i.status === 'IN_PROGRESS') &&
    i.remediationType === 'CLARIFICATION'
  )

  if (openClarifications.length === 0) return null

  return (
    <div className="space-y-1.5 mb-2">
      {openClarifications.map(item => (
        <div key={item.id}
          className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-purple-500/8 border border-purple-500/30">
          <AlertTriangle size={13} className="text-purple-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-purple-400">
              Clarification requested by {item.createdByName || 'reviewer'}
            </p>
            {item.description && (
              <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
                "{item.description}"
              </p>
            )}
            <p className="text-[10px] text-purple-400/70 mt-1">
              Re-evaluate below and re-submit this section.
            </p>
          </div>
          {item.status === 'PENDING_REVIEW' && (
            <span className="text-[10px] text-blue-400 flex items-center gap-1 shrink-0">
              <CheckCircle2 size={10} /> Submitted for review
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── EvalButtons ─────────────────────────────────────────────────────────────

const EVAL_OPTIONS = [
  { value: 'PASS',    label: 'Pass',    Icon: ThumbsUp,   cls: 'bg-green-500/10 border-green-500/40 text-green-400' },
  { value: 'PARTIAL', label: 'Partial', Icon: Minus,      cls: 'bg-amber-500/10 border-amber-500/40 text-amber-400' },
  { value: 'FAIL',    label: 'Fail',    Icon: ThumbsDown, cls: 'bg-red-500/10   border-red-500/40   text-red-400'   },
]

function EvalButtons({ value, onChange, disabled }) {
  return (
    <div className="flex gap-1.5 mt-2">
      {EVAL_OPTIONS.map(({ value: v, label, Icon, cls }) => (
        <button key={v} type="button" disabled={disabled}
          onClick={() => onChange(v)}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[11px] font-medium transition-colors',
            value === v ? cls : 'border-border text-text-muted hover:border-brand-500/30',
            disabled && 'opacity-40 cursor-not-allowed'
          )}>
          <Icon size={11} />
          {label}
        </button>
      ))}
    </div>
  )
}

// ─── QuestionEvalCard ─────────────────────────────────────────────────────────

function QuestionEvalCard({ question, assessmentId, evaluation, onEvaluate, taskId, sectionSubmitted }) {
  const resp        = question.currentResponse
  const [showNote, setShowNote] = useState(false)
  const { mutate: saveEval } = useSaveEval(assessmentId)

  const { comments, addComment, adding } = useQuestionComments(
    question.questionInstanceId, { enabled: !!question.questionInstanceId })
  const [noteText, setNoteText] = useState('')

  const handleEval = (verdict) => {
    onEvaluate(question.questionInstanceId, verdict)
    saveEval({ questionInstanceId: question.questionInstanceId, verdict })
  }

  const handleNote = () => {
    if (!noteText.trim()) return
    addComment({
      commentText:        noteText.trim(),
      commentType:        'REVIEW_COMMENT',
      visibility:         'ALL',
      questionInstanceId: question.questionInstanceId,
    }, {
      onSuccess: () => { setNoteText(''); setShowNote(false); toast.success('Note saved') },
      onError:   () => toast.error('Failed to save note'),
    })
  }

  const allComments = Array.isArray(comments) ? comments : (resp?.comments || [])

  return (
    <div data-qid={question.questionInstanceId} className={cn(
      'py-3.5 border-b border-border last:border-0 rounded transition-all duration-500',
      evaluation === 'FAIL'    && 'bg-red-500/3',
      evaluation === 'PARTIAL' && 'bg-amber-500/3',
      evaluation === 'PASS'    && 'bg-green-500/3',
    )}>
      {/* Clarification banner (purple — reviewer sent this back to me) */}
      <ClarificationBanner questionInstanceId={question.questionInstanceId} hasCurrentEval={!!evaluation} />

      <div className="flex items-start gap-2 mb-2">
        <span className="text-xs font-mono text-text-muted pt-0.5 shrink-0 w-5">{question.orderNo}.</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap mb-1.5">
            <p className="text-sm text-text-primary flex-1">{question.questionText}</p>
            {question.mandatory && <span className="text-red-400 text-xs shrink-0">*</span>}
            {evaluation && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0',
                evaluation === 'PASS'    && 'bg-green-500/10 border-green-500/30 text-green-400',
                evaluation === 'PARTIAL' && 'bg-amber-500/10 border-amber-500/30 text-amber-400',
                evaluation === 'FAIL'    && 'bg-red-500/10   border-red-500/30   text-red-400',
              )}>
                {evaluation}
              </span>
            )}
          </div>

          {/* Answer display */}
          {resp ? (
            <div className="p-2.5 rounded-md bg-surface-overlay border border-border mb-2">
              {resp.responseText && (
                <p className="text-xs text-text-secondary leading-relaxed">{resp.responseText}</p>
              )}
              {resp.selectedOptionInstanceId && (
                <div className="flex flex-wrap gap-1.5">
                  {(question.options || []).map(o => (
                    <span key={o.optionInstanceId}
                      className={cn('text-xs px-2 py-0.5 rounded border',
                        o.optionInstanceId === resp.selectedOptionInstanceId
                          ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 font-medium'
                          : 'border-border text-text-muted opacity-40')}>
                      {o.optionValue}
                    </span>
                  ))}
                </div>
              )}
              {resp.submittedAt && (
                <p className="text-[10px] text-text-muted mt-1">
                  Answered {formatDate(resp.submittedAt)}
                  {resp.answeredByName && ` by ${resp.answeredByName}`}
                </p>
              )}
            </div>
          ) : (
            <div className="p-2 rounded-md bg-red-500/5 border border-red-500/15 mb-2">
              <p className="text-[11px] text-red-400">No response — auto-evaluated as FAIL</p>
            </div>
          )}

          {/* Eval buttons */}
          <EvalButtons
            value={evaluation}
            onChange={handleEval}
            disabled={sectionSubmitted}
          />

          {/* Comments */}
          {allComments.length > 0 && (
            <div className="mt-2 space-y-1">
              {allComments.map((c, i) => (
                <div key={c.id ?? i}
                  className="flex gap-1.5 px-2 py-1 rounded text-[11px] bg-blue-500/5 border border-blue-500/10 text-blue-300">
                  <MessageSquare size={9} className="mt-0.5 shrink-0" />
                  <span className="flex-1">{c.commentedByName && <strong className="mr-1">{c.commentedByName}:</strong>}{c.commentText}</span>
                </div>
              ))}
            </div>
          )}

          {/* Add note */}
          {!sectionSubmitted && (
            !showNote ? (
              <button onClick={() => setShowNote(true)}
                className="flex items-center gap-1 text-[11px] text-text-muted hover:text-blue-400 transition-colors mt-2">
                <MessageSquare size={10} /> Add evaluation note
              </button>
            ) : (
              <div className="mt-2 space-y-1.5">
                <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2}
                  autoFocus placeholder="Add your evaluation note…"
                  className="w-full rounded-md border border-blue-500/20 bg-blue-500/5 px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
                <div className="flex gap-1">
                  <Button size="xs" variant="secondary" onClick={handleNote} loading={adding} disabled={!noteText.trim()}>Save note</Button>
                  <Button size="xs" variant="ghost" onClick={() => { setShowNote(false); setNoteText('') }}>Cancel</Button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ─── SectionGroup ─────────────────────────────────────────────────────────────

function SectionGroup({ sectionInstanceId, sectionName, questions, assessmentId, taskId, evaluations, onEvaluate, submittedSections }) {
  const [open, setOpen] = useState(true)
  const isSubmitted = submittedSections.has(sectionInstanceId)
  const { mutate: submitSection, isPending: submitting } = useAssistantSubmitSection(assessmentId)

  const evaluated   = questions.filter(q => !!evaluations[q.questionInstanceId]).length
  const allEvaluated = evaluated >= questions.length && questions.length > 0

  const handleSubmit = () => {
    submitSection({ sectionInstanceId, taskId })
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden mb-3">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-overlay/40 transition-colors">
        <div className="flex items-center gap-2.5 flex-wrap">
          <FileText size={14} className="text-text-muted shrink-0" />
          <span className="text-sm font-medium text-text-primary">{sectionName}</span>
          <span className="text-xs text-text-muted">{evaluated}/{questions.length} evaluated</span>
          {isSubmitted && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
              <CheckCircle2 size={9} /> Submitted
            </span>
          )}
        </div>
        {open ? <ChevronDown size={13} className="text-text-muted shrink-0" /> : <ChevronRight size={13} className="text-text-muted shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="px-5">
            {questions.map(q => (
              <QuestionEvalCard
                key={q.questionInstanceId}
                question={q}
                assessmentId={assessmentId}
                evaluation={evaluations[q.questionInstanceId]}
                onEvaluate={onEvaluate}
                taskId={taskId}
                sectionSubmitted={isSubmitted}
              />
            ))}
          </div>

          {!isSubmitted && (
            <div className="px-5 py-3 border-t border-border bg-surface-overlay/30">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                loading={submitting}
                disabled={!allEvaluated}
                className="w-full">
                {allEvaluated
                  ? 'Submit section evaluations'
                  : `Evaluate ${questions.length - evaluated} remaining question(s) to submit`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReviewAssistantPage() {
  const { id }         = useParams()
  const navigate       = useNavigate()
  const [urlParams]    = useSearchParams()
  const taskId         = urlParams.get('taskId')
  const targetQId      = urlParams.get('questionInstanceId')
  const { user }       = useSelector(selectAuth)
  const qc             = useQueryClient()

  // Task guard — same pattern as VendorAssessmentFillPage
  const { data: myTasks = [], isLoading: tasksLoading } = useMyTasks()
  const [guardChecked, setGuardChecked] = useState(false)

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

  useEffect(() => {
    if (tasksLoading || guardChecked) return
    if (taskId) {
      const hasTask = myTasks.some(t => String(t.id) === String(taskId))
      if (!hasTask) {
        toast.error('No active task for this review — redirecting to inbox')
        navigate('/workflow/inbox', { replace: true })
        return
      }
    }
    setGuardChecked(true)
  }, [tasksLoading, guardChecked, myTasks, taskId, navigate])

  const { data: assessment } = useAssessment(id)
  const { data: questions = [], isLoading: qLoading } =
    useMyAssistantQuestions(id, !!id && guardChecked)
  const { data: submittedSections = new Set() } =
    useAssistantSectionStatus(id, taskId)

  // Group questions by section
  const sectionMap = {}
  questions.forEach(q => {
    const sid  = q.sectionInstanceId
    const name = q.sectionName || 'Section'
    if (!sectionMap[sid]) sectionMap[sid] = { sectionInstanceId: sid, sectionName: name, questions: [] }
    sectionMap[sid].questions.push(q)
  })
  const sections = Object.values(sectionMap).sort((a, b) => {
    const aOrder = a.questions[0]?.orderNo ?? 0
    const bOrder = b.questions[0]?.orderNo ?? 0
    return aOrder - bOrder
  })

  // Evaluation state — seeded from persisted reviewerStatus
  const [evaluations, setEvaluations] = useState({})
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    if (!seeded && questions.length > 0) {
      const seed = {}
      questions.forEach(q => {
        const rv = q.currentResponse?.reviewerStatus
        if (rv && rv !== 'PENDING') seed[q.questionInstanceId] = rv
        else if (!q.currentResponse) seed[q.questionInstanceId] = 'FAIL'
      })
      setEvaluations(seed)
      setSeeded(true)
    }
  }, [questions, seeded])

  const handleEvaluate = (questionInstanceId, value) =>
    setEvaluations(prev => ({ ...prev, [questionInstanceId]: value }))

  const totalQs     = questions.length
  const evaluatedQs = Object.keys(evaluations).length
  const allDone     = sections.every(s => submittedSections.has(s.sectionInstanceId))

  if (!guardChecked || tasksLoading || qLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={24} className="animate-spin text-text-muted" />
    </div>
  )

  return (
    <div className="min-h-screen bg-background-tertiary">
      {/* Header */}
      <div className="bg-surface border-b border-border px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-text-primary truncate">
            Review Assistant — {assessment?.templateName || 'Assessment'}
          </h1>
          <p className="text-xs text-text-muted">
            {assessment?.vendorName}
            {taskId && <> · Task #{taskId}</>}
            {' · '}{evaluatedQs}/{totalQs} evaluated
          </p>
        </div>
        {allDone && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium">
            <CheckCircle2 size={13} />
            All sections submitted
          </div>
        )}
      </div>

      {/* Body */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {questions.length === 0 ? (
          <div className="py-16 text-center">
            <FileText size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">No questions assigned to you yet.</p>
            <p className="text-xs text-text-muted mt-1">The reviewer will assign questions for your evaluation.</p>
          </div>
        ) : (
          <>
            {/* Progress */}
            <div className="mb-4 flex items-center gap-3 text-xs text-text-muted">
              <div className="flex-1 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full transition-all"
                  style={{ width: totalQs > 0 ? `${(evaluatedQs / totalQs) * 100}%` : '0%' }} />
              </div>
              <span className="shrink-0">{evaluatedQs}/{totalQs} evaluated</span>
            </div>

            {sections.map(sec => (
              <SectionGroup
                key={sec.sectionInstanceId}
                sectionInstanceId={sec.sectionInstanceId}
                sectionName={sec.sectionName}
                questions={sec.questions}
                assessmentId={id}
                taskId={taskId}
                evaluations={evaluations}
                onEvaluate={handleEvaluate}
                submittedSections={submittedSections}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}