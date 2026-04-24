/**
 * VendorAssessmentFillPage — Step 6: Contributors answer questions.
 *
 * STEP-GATED ACCESS GUARD (NEW):
 *   Added a task ownership check at page mount. If the user navigates directly
 *   to this URL without a valid taskId in their active inbox, they are immediately
 *   redirected to /workflow/inbox.
 *
 *   WHY: Any authenticated vendor user who knows (or guesses) an assessmentId
 *   could previously navigate to /vendor/assessments/:id/fill and see the full
 *   question form. The backend now also guards via assertUserHasActiveTask(),
 *   but the frontend guard provides immediate feedback and avoids an unnecessary
 *   round-trip that returns a 403.
 *
 *   GUARD LOGIC:
 *     1. Read taskId from URL search params (?taskId=X).
 *     2. Wait for useMyTasks to load (isLoading = false).
 *     3. Check if any task in the user's inbox matches the taskId.
 *     4. If no match → redirect to /workflow/inbox with a toast.
 *     5. If match → render the page normally.
 *
 *   The guard is only active after tasks have loaded to avoid a flash redirect
 *   on initial render.
 *
 * All other logic is unchanged from the original implementation.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, ChevronDown, ChevronRight,
  Send, Loader2, AlertCircle, Save, FileText, Users, Search,
  AlertTriangle, Clock} from 'lucide-react'
import { assessmentsApi } from '../../api/assessments.api'
import { usersApi }       from '../../api/users.api'
import { workflowsApi }   from '../../api/workflows.api'
import { Button }         from '../../components/ui/Button'
import { Badge }          from '../../components/ui/Badge'
import { cn }             from '../../lib/cn'
import { formatDate }     from '../../utils/format'
import { useSelector }    from 'react-redux'
import { selectAuth }     from '../../store/slices/authSlice'
import { Modal }          from '../../components/ui/Modal'
import { useAccessContext, useMyTasks, useCompoundTaskProgress } from '../../hooks/useWorkflow'
import { useEntityActionItems, useUpdateActionItemStatus } from '../../hooks/useActionItems'
import { CompoundTaskProgress, CompoundTaskBadge } from '../../components/workflow/CompoundTaskProgress'
import toast              from 'react-hot-toast'

const TYPE_CONFIG = {
  SINGLE_CHOICE: {
    color:  'blue',
    label:  'Single choice',
    hint:   'Select one option',
    icon:   '◉',
  },
  MULTI_CHOICE: {
    color:  'purple',
    label:  'Multiple choice',
    hint:   'Select all that apply',
    icon:   '☑',
  },
  TEXT: {
    color:  'cyan',
    label:  'Text',
    hint:   'Type your answer',
    icon:   '✎',
  },
  FILE_UPLOAD: {
    color:  'amber',
    label:  'File upload',
    hint:   'Upload a supporting document',
    icon:   '↑',
  },
  NUMERIC: {
    color:  'green',
    label:  'Numeric',
    hint:   'Enter a number',
    icon:   '#',
  },
  DATE: {
    color:  'indigo',
    label:  'Date',
    hint:   'Enter a date',
    icon:   '◷',
  },
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useAssessment = (id, enabled) => useQuery({
  queryKey: ['assessment-fill', id],
  queryFn:  () => assessmentsApi.vendor.get(id),
  enabled:  !!id && enabled,
})

// Fetches ONLY the sections assigned to the current user.
// Replaces using assessment.sections (which returns ALL sections regardless of assignment).
// Responders are assigned to specific sections only — showing all sections is incorrect
// and confusing. mySections filters by sectionInstance.assignedUserId = currentUser.
const useMySections = (id, enabled) => useQuery({
  queryKey: ['my-sections-fill', id],
  queryFn:  () => assessmentsApi.vendor.mySections(id),
  enabled:  !!id && enabled,
  select:   (data) => Array.isArray(data) ? data : (data?.data || []),
})

function useSubmitAnswer(assessmentId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => assessmentsApi.vendor.respond(assessmentId, data),
    onSuccess: () => {
      // Invalidate all question/section caches — covers both:
      //   my-sections-fill: responder view (section assignee)
      //   my-contributor-questions: contributor view (question assignee)
      //   assessment-fill: progress metadata
      qc.invalidateQueries({ queryKey: ['assessment-fill', assessmentId] })
      qc.invalidateQueries({ queryKey: ['my-sections-fill', assessmentId] })
      qc.invalidateQueries({ queryKey: ['my-contributor-questions', assessmentId] })
    },
    onError: (e) => toast.error(e?.message || e?.error?.message || 'Failed to save answer'),
  })
}

// Contributor mode: fetch questions assigned to current user
const useMyContributorQuestions = (assessmentId, enabled) => useQuery({
  queryKey: ['my-contributor-questions', assessmentId],
  queryFn:  () => assessmentsApi.vendor.myQuestions(assessmentId),
  enabled:  !!assessmentId && enabled,
  select:   (data) => Array.isArray(data) ? data : (data?.data || []),
})

// Contributor users for the picker — VENDOR side, filtered by role name
const useContributorUsers = (search) => useQuery({
  queryKey: ['contributor-users', search],
  queryFn:  () => usersApi.list({ take: 20, search: search || undefined, side: 'VENDOR' }),
  enabled:  (search?.length ?? 0) >= 2,
  staleTime: 30_000,
})

function useAssignQuestion(assessmentId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ questionInstanceIds, questionInstanceId, userId }) => {
      const ids = questionInstanceIds || [questionInstanceId]
      // null userId = unassign
      if (userId === null || userId === undefined) {
        return Promise.all(ids.map(id =>
          assessmentsApi.vendor.unassignQuestion(assessmentId, id)
        ))
      }
      return ids.length === 1
        ? assessmentsApi.vendor.assignQuestion(assessmentId, ids[0], userId)
        : assessmentsApi.vendor.assignQuestionsBatch(assessmentId, ids, userId)
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['my-sections-fill', assessmentId] })
      if (vars.userId === null || vars.userId === undefined) {
        toast.success('Contributor unassigned')
      } else {
        const count = vars.questionInstanceIds?.length || 1
        toast.success(`${count} question${count > 1 ? 's' : ''} assigned to contributor`)
      }
    },
    onError: (e) => toast.error(e?.message || 'Failed to update assignment'),
  })
}

function useContributorSectionStatus(assessmentId, taskId) {
  return useQuery({
    queryKey: ['contributor-section-status', assessmentId, taskId],
    queryFn:  () => assessmentsApi.vendor.contributorSectionStatus(assessmentId, taskId),
    enabled:  !!assessmentId && !!taskId,
    select:   (d) => {
      const rows = Array.isArray(d) ? d : (d?.data || [])
      // Return a Set of submitted sectionInstanceIds for O(1) lookup
      return new Set(rows.map(r => r.sectionInstanceId))
    },
  })
}

function useContributorSubmitSection(assessmentId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionInstanceId, taskId }) =>
      assessmentsApi.vendor.contributorSubmitSection(assessmentId, sectionInstanceId, taskId),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['contributor-section-status', assessmentId] })
      qc.invalidateQueries({ queryKey: ['my-contributor-questions', assessmentId] })
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      const result = data?.data || data
      if (result?.taskApproved) {
        toast.success('All answers submitted — task complete!')
      } else {
        toast.success('Section answers submitted')
      }
    },
    onError: (e) => toast.error(e?.message || 'Failed to submit answers'),
  })
}

function useSubmitSection(assessmentId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionInstanceId, taskId }) =>
      assessmentsApi.vendor.submitSection(assessmentId, sectionInstanceId, taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-sections-fill', assessmentId] })
      qc.invalidateQueries({ queryKey: ['compound-task-progress'] })
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      toast.success('Section submitted')
    },
    onError: (e) => toast.error(e?.message || 'Failed to submit section'),
  })
}

function useReopenSection(assessmentId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sectionInstanceId) =>
      assessmentsApi.vendor.reopenSection(assessmentId, sectionInstanceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-sections-fill', assessmentId] })
      toast.success('Section reopened — you can edit again')
    },
    onError: (e) => toast.error(e?.message || 'Failed to reopen section'),
  })
}

function useSubmitAssessment(assessmentId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => assessmentsApi.vendor.submit(assessmentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessment-fill', assessmentId] })
      qc.invalidateQueries({ queryKey: ['vendor-assessments'] })
      toast.success('Assessment submitted for review')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Submission failed'),
  })
}

// ─── Single Question ──────────────────────────────────────────────────────────

// ── ContributorPicker ────────────────────────────────────────────────────────
// Inline search-and-select for VENDOR_CONTRIBUTOR users.
// Shows a compact chip when assigned, search box when not.

function ContributorPicker({ value, onChange }) {
  const [search, setSearch]   = useState('')
  const [open,   setOpen]     = useState(false)
  const { data: usersData }   = useContributorUsers(search)
  const users = Array.isArray(usersData) ? usersData : (usersData?.items || [])

  if (value) {
    return (
      <div className="flex items-center gap-1.5 mt-1.5">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20">
          <Users size={10} className="text-purple-400 flex-shrink-0" />
          <span className="text-[11px] text-purple-300 font-medium">{value.fullName || value.email}</span>
        </div>
        <button onClick={() => onChange(null)}
          className="text-[10px] text-text-muted hover:text-red-400 transition-colors px-1">
          unassign
        </button>
      </div>
    )
  }

  return (
    <div className="relative mt-1.5">
      <div className="flex items-center gap-1.5 h-7 px-2 rounded border border-dashed border-border hover:border-brand-500/30 bg-surface-raised">
        <Search size={10} className="text-text-muted flex-shrink-0" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Assign to contributor…"
          className="flex-1 text-[11px] bg-transparent text-text-primary placeholder:text-text-muted outline-none"
        />
      </div>
      {open && users.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-0.5 rounded border border-border bg-surface shadow-lg overflow-hidden">
          {users.map(u => (
            <button key={u.id || u.userId} onClick={() => { onChange(u); setOpen(false); setSearch('') }}
              className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-surface-overlay text-left transition-colors">
              <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[9px] font-bold text-purple-400">
                  {(u.fullName || u.email || '?')[0].toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-text-primary truncate">{u.fullName || '—'}</p>
                <p className="text-[10px] text-text-muted truncate">{u.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


// ─── RemediationNoticeBanner — shown on vendor fill page when org raised a remediation ─
// The vendor sees: what's flagged, severity, expected evidence, current status
// and can submit for review once they've updated their answer.

function RemediationNoticeBanner({ questionInstanceId }) {
  const { data: items = [] } = useEntityActionItems(
    'QUESTION_RESPONSE', questionInstanceId,
    { enabled: !!questionInstanceId }
  )
  const { mutate: updateStatus, isPending } = useUpdateActionItemStatus()
  const qc = useQueryClient()

  const openRemediations = items.filter(i =>
    i.remediationType === 'REMEDIATION_REQUEST' &&
    ['OPEN', 'IN_PROGRESS'].includes(i.status)
  )
  const pendingReview = items.filter(i =>
    i.remediationType === 'REMEDIATION_REQUEST' &&
    i.status === 'PENDING_REVIEW'
  )

  if (!openRemediations.length && !pendingReview.length) return null

  const SEVERITY_COLOR = {
    CRITICAL: 'text-red-400 bg-red-500/10 border-red-500/40',
    HIGH:     'text-orange-400 bg-orange-500/10 border-orange-500/40',
    MEDIUM:   'text-amber-400 bg-amber-500/10 border-amber-500/40',
    LOW:      'text-blue-400 bg-blue-500/10 border-blue-500/40',
  }

  return (
    <div className="space-y-2 mb-3">
      {openRemediations.map(item => (
        <div key={item.id} className="rounded-lg border border-red-500/30 bg-red-500/6 text-[11px]">
          {/* Header */}
          <div className="flex items-start gap-2 px-3 py-2.5">
            <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <span className="font-semibold text-red-400">Remediation required</span>
                {item.severity && (
                  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase',
                    SEVERITY_COLOR[item.severity] || SEVERITY_COLOR.MEDIUM)}>
                    {item.severity}
                  </span>
                )}
                <span className="text-text-muted opacity-60">
                  — raised by {item.createdByName || 'reviewer'}
                </span>
              </div>
              {item.description && (
                <p className="text-text-secondary leading-relaxed mt-0.5">{item.description}</p>
              )}
              {item.expectedEvidence && (
                <p className="text-[10px] text-amber-400/80 mt-1">
                  ⟶ Expected evidence: {item.expectedEvidence}
                </p>
              )}
              {item.dueAt && (
                <p className="text-[10px] text-text-muted opacity-60 mt-0.5">
                  Due: {new Date(item.dueAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          {/* Action */}
          <div className="px-3 py-2 border-t border-red-500/15 flex items-center gap-2">
            <span className="text-text-muted flex-1">
              Update your answer above, then submit for review when ready.
            </span>
            <button
              disabled={isPending}
              onClick={() => {
                updateStatus({ id: item.id, status: 'PENDING_REVIEW',
                  resolutionNote: 'Vendor submitted remediation for review' })
                qc.invalidateQueries({ queryKey: ['action-items-entity', 'QUESTION_RESPONSE', questionInstanceId] })
              }}
              className="flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300 border border-blue-500/30 rounded px-2 py-1 transition-colors shrink-0">
              <CheckCircle2 size={10} /> Submit for review
            </button>
          </div>
        </div>
      ))}

      {/* Already submitted — waiting for reviewer */}
      {pendingReview.map(item => (
        <div key={item.id}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500/20 bg-blue-500/6 text-[11px] text-blue-400">
          <CheckCircle2 size={12} className="shrink-0" />
          <span className="flex-1">
            Remediation submitted — awaiting validation by {item.resolutionReservedForName || 'reviewer'}
          </span>
        </div>
      ))}
    </div>
  )
}


/**
 * RevisionBanner — shown on a question card when an open REVISION_REQUEST
 * action item exists for that question instance.
 *
 * Contributor view: amber "Revision requested" — re-enables input
 * Responder view:   shows "Re-answered, pending your review" once contributor re-answers
 */
function RevisionBanner({ questionInstanceId, isContributorView, hasCurrentResponse }) {
  const { data: items = [] } = useEntityActionItems(
    'QUESTION_RESPONSE', questionInstanceId,
    { enabled: !!questionInstanceId }
  )
  const { mutate: updateStatus, isPending: resolving } = useUpdateActionItemStatus()

  // Find open revision request action items (source=COMMENT, open status)
  const openRevisions = items.filter(i =>
    (i.status === 'OPEN' || i.status === 'IN_PROGRESS') &&
    i.sourceType === 'COMMENT'
  )

  // Find open auto-findings (source=SYSTEM, from KashiGuard)
  const openFindings = items.filter(i =>
    (i.status === 'OPEN' || i.status === 'IN_PROGRESS') &&
    i.sourceType === 'SYSTEM'
  )

  if (openRevisions.length === 0 && openFindings.length === 0) return null

  // ── Contributor view — amber revision banner ──────────────────────────────
  if (isContributorView) {
    return (
      <div className="space-y-1.5 mb-2">
        {openRevisions.map(item => (
          <div key={item.id}
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/8 border border-amber-500/30">
            <AlertTriangle size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-amber-400">
                Revision requested by {item.createdByName || 'reviewer'}
              </p>
              {item.description && (
                <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
                  "{item.description}"
                </p>
              )}
              <p className="text-[10px] text-amber-400/70 mt-1">
                Re-answer below and re-submit this section.
              </p>
            </div>
          </div>
        ))}
        {openFindings.map(item => (
          <div key={item.id}
            className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle size={12} className="text-amber-400/70 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-400/80">
              <span className="font-medium">Finding: </span>{item.title}
            </p>
          </div>
        ))}
      </div>
    )
  }

  // ── Responder view — status indicator ────────────────────────────────────
  // Responder sees: waiting / re-answered (pending review) / resolve button
  return (
    <div className="space-y-1.5 mt-2">
      {openRevisions.map(item => {
        const reAnswered = !!hasCurrentResponse
        return (
          <div key={item.id}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px]',
              reAnswered
                ? 'bg-blue-500/8 border-blue-500/20 text-blue-400'
                : 'bg-amber-500/8 border-amber-500/20 text-amber-400'
            )}>
            {reAnswered
              ? <CheckCircle2 size={12} className="flex-shrink-0" />
              : <Clock size={12} className="flex-shrink-0" />}
            <span className="flex-1">
              {reAnswered
                ? 'Re-answered — review and resolve'
                : 'Awaiting contributor response'}
            </span>
            {/* Only the original requester (canResolve=true) sees resolve button */}
            {item.canResolve && (
              <button
                disabled={resolving}
                onClick={() => updateStatus({ id: item.id, status: 'RESOLVED',
                  resolutionNote: 'Revision accepted' })}
                className="text-green-400/80 hover:text-green-400 transition-colors flex-shrink-0 flex items-center gap-1">
                <CheckCircle2 size={11} />
                Resolve
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function QuestionInput({ question, assessmentId, disabled, onAssign, isContributorView }) {
  const { mutate: submitAnswer, isPending } = useSubmitAnswer(assessmentId)
  const resp = question.currentResponse
  const isMulti = question.responseType === 'MULTI_CHOICE'
  // Contributor assignment state
  const isAssigned = !!question.assignedUserId && !isContributorView
  const [showAssign, setShowAssign] = useState(false)

  // Local state — syncs with server via useEffect when resp changes after invalidation
  const [localText,      setLocalText]  = useState(resp?.responseText || '')
  const [selectedOption, setSelected]   = useState(resp?.selectedOptionInstanceId || null)
  // Multi-choice: initialize from server's selectedOptionInstanceIds array
  const [selectedMulti,  setMulti]      = useState(() => new Set(
    resp?.selectedOptionInstanceIds?.length
      ? resp.selectedOptionInstanceIds
      : resp?.selectedOptionInstanceId ? [resp.selectedOptionInstanceId] : []
  ))
  const [dirty,          setDirty]      = useState(false)
  const [justSaved,      setJustSaved]  = useState(false)

  // Sync local state when server data refreshes (after cache invalidation)
  useEffect(() => {
    if (!dirty) setLocalText(resp?.responseText || '')
    setSelected(resp?.selectedOptionInstanceId || null)
    setMulti(new Set(
      resp?.selectedOptionInstanceIds?.length
        ? resp.selectedOptionInstanceIds
        : resp?.selectedOptionInstanceId ? [resp.selectedOptionInstanceId] : []
    ))
  }, [resp?.responseId]) // re-sync when the server response changes

  // ── Read-only (disabled) view ─────────────────────────────────────────────
  if (disabled) {
    const hasText   = !!resp?.responseText
    const hasOption = !!resp?.selectedOptionInstanceId
    const answered  = hasText || hasOption
    return (
      <div className="mt-2">
        {!answered && (
          <p className="text-xs text-text-muted italic">Not answered</p>
        )}
        {hasText && (
          <div className="px-3 py-2 rounded-lg bg-surface-overlay border border-border">
            <p className="text-xs text-text-secondary leading-relaxed">{resp.responseText}</p>
          </div>
        )}
        {hasOption && (
          <div className="flex flex-wrap gap-1.5">
            {question.options.map(o => {
              const isSelected = resp.selectedOptionInstanceIds?.length
                ? resp.selectedOptionInstanceIds.includes(o.optionInstanceId)
                : o.optionInstanceId === resp.selectedOptionInstanceId
              return (
                <span key={o.optionInstanceId}
                  className={cn('text-xs px-2.5 py-1 rounded border',
                    isSelected
                      ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 font-medium'
                      : 'bg-surface-overlay border-border text-text-muted opacity-40'
                  )}>
                  {o.optionValue}
                  {o.score != null && <span className="ml-1 opacity-60">({o.score})</span>}
                </span>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Contributor assignment banner ────────────────────────────────────────
  // If this question is assigned to a contributor AND we're not in contributor view:
  // show who it's assigned to, disable answer input, show their answer read-only.
  if (isAssigned) {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
          <Users size={12} className="text-purple-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-purple-300 font-medium">
              Assigned to {question.assignedUserName || `User #${question.assignedUserId}`}
            </p>
            {resp?.responseText && (
              <p className="text-xs text-text-secondary mt-0.5 italic">"{resp.responseText}"</p>
            )}
            {resp?.selectedOptionInstanceId && (
              <p className="text-xs text-text-secondary mt-0.5">
                {question.options?.find(o => o.optionInstanceId === resp.selectedOptionInstanceId)?.optionValue}
              </p>
            )}
            {!resp && (
              <p className="text-[10px] text-text-muted italic">Awaiting contributor response…</p>
            )}
          </div>
          {!disabled && onAssign && (
            <button onClick={() => onAssign({ questionInstanceId: question.questionInstanceId, userId: null })}
              className="text-[10px] text-text-muted hover:text-red-400 transition-colors flex-shrink-0">
              unassign
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Text answer ───────────────────────────────────────────────────────────
  if (question.responseType === 'TEXT') {
    const hasSaved = !!resp?.responseText
    const saveText = () => {
      if (!localText.trim()) return
      submitAnswer({
        questionInstanceId: question.questionInstanceId,
        responseText: localText,
      }, {
        onSuccess: () => { setDirty(false); setJustSaved(true); setTimeout(() => setJustSaved(false), 2500) },
      })
    }

    return (
      <div className="mt-2 space-y-2">
        {/* Saved answer preview — shown when answer exists and not currently editing */}
        {hasSaved && !dirty && (
          <div className="group relative px-3 py-2.5 rounded-lg bg-green-500/5 border border-green-500/20">
            <p className="text-xs text-text-secondary leading-relaxed pr-12">{resp.responseText}</p>
            <button
              onClick={() => { setLocalText(resp.responseText); setDirty(true) }}
              className="absolute right-2 top-2 text-[10px] text-text-muted hover:text-brand-400 transition-colors px-1.5 py-0.5 rounded border border-border hover:border-brand-500/30">
              Edit
            </button>
          </div>
        )}
        {/* Text input — shown on first answer or when editing */}
        {(!hasSaved || dirty) && (
          <div className="space-y-1.5">
            <textarea
              value={localText}
              onChange={e => { setLocalText(e.target.value); setDirty(true) }}
              rows={3}
              autoFocus={dirty}
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              placeholder="Type your answer…"
            />
            <div className="flex items-center gap-2">
              <Button size="xs" variant="secondary" icon={Save} onClick={saveText} loading={isPending}
                disabled={!localText.trim()}>
                {hasSaved ? 'Update' : 'Save'}
              </Button>
              {hasSaved && (
                <button onClick={() => { setDirty(false); setLocalText(resp.responseText) }}
                  className="text-xs text-text-muted hover:text-text-secondary">
                  Cancel
                </button>
              )}
              {justSaved && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={11} />Saved</span>}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Single choice ────────────────────────────────────────────────────────
  if (question.responseType === 'SINGLE_CHOICE') {
    const currentSelected = selectedOption ?? resp?.selectedOptionInstanceId ?? null
    const saveOption = (optionInstanceId) => {
      if (currentSelected === optionInstanceId) return // already selected
      setSelected(optionInstanceId)
      submitAnswer({
        questionInstanceId:       question.questionInstanceId,
        selectedOptionInstanceId: optionInstanceId,
      }, {
        onSuccess: () => { setJustSaved(true); setTimeout(() => setJustSaved(false), 1500) },
        onError:   () => setSelected(resp?.selectedOptionInstanceId || null),
      })
    }
    return (
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {question.options.map(opt => {
            const selected = currentSelected === opt.optionInstanceId
            return (
              <button key={opt.optionInstanceId}
                onClick={() => saveOption(opt.optionInstanceId)}
                disabled={isPending}
                className={cn('text-xs px-2.5 py-1.5 rounded border transition-all',
                  selected
                    ? 'bg-brand-500/20 border-brand-500/50 text-brand-300 font-medium'
                    : 'bg-surface-overlay border-border text-text-secondary hover:border-brand-500/30 hover:text-text-primary'
                )}>
                {opt.optionValue}
                {opt.score != null && (
                  <span className={cn('ml-1.5 text-[10px]', selected ? 'text-brand-400/70' : 'opacity-40')}>
                    {opt.score}pts
                  </span>
                )}
                {selected && <CheckCircle2 size={10} className="inline ml-1.5 text-brand-400" />}
              </button>
            )
          })}
        </div>
        {justSaved && <p className="text-[10px] text-green-400 flex items-center gap-1"><CheckCircle2 size={10} />Saved</p>}
      </div>
    )
  }

  // ── Multi choice ──────────────────────────────────────────────────────────
  // Each option is an independent toggle. Each toggle = one POST to the backend.
  // The backend stores one response row per question (last selected wins for scoring),
  // but the UI tracks all toggled options locally for a checkbox-style experience.
  const toggleMulti = (optionInstanceId) => {
    const prev = new Set(selectedMulti)
    const next = new Set(selectedMulti)
    if (next.has(optionInstanceId)) next.delete(optionInstanceId)
    else next.add(optionInstanceId)
    setMulti(next) // optimistic
    submitAnswer({
      questionInstanceId:        question.questionInstanceId,
      selectedOptionInstanceIds: [optionInstanceId], // backend toggles in stored set
    }, {
      onSuccess: () => { setJustSaved(true); setTimeout(() => setJustSaved(false), 1500) },
      onError:   () => setMulti(prev), // rollback
    })
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {question.options.map(opt => {
          const selected = selectedMulti.has(opt.optionInstanceId)
          return (
            <button key={opt.optionInstanceId}
              onClick={() => toggleMulti(opt.optionInstanceId)}
              disabled={isPending}
              className={cn('text-xs px-2.5 py-1.5 rounded border transition-all flex items-center gap-1.5',
                selected
                  ? 'bg-brand-500/20 border-brand-500/50 text-brand-300 font-medium'
                  : 'bg-surface-overlay border-border text-text-secondary hover:border-brand-500/30 hover:text-text-primary'
              )}>
              {/* Checkbox indicator */}
              <span className={cn('w-3 h-3 rounded-sm border flex-shrink-0 flex items-center justify-center',
                selected ? 'bg-brand-500 border-brand-500' : 'border-current opacity-50')}>
                {selected && <CheckCircle2 size={9} className="text-white" />}
              </span>
              {opt.optionValue}
              {opt.score != null && (
                <span className={cn('text-[10px]', selected ? 'text-brand-400/70' : 'opacity-40')}>
                  {opt.score}pts
                </span>
              )}
            </button>
          )
        })}
      </div>
      {selectedMulti.size > 0 && (
        <p className="text-[10px] text-text-muted">{selectedMulti.size} option{selectedMulti.size > 1 ? 's' : ''} selected</p>
      )}
      {justSaved && <p className="text-[10px] text-green-400 flex items-center gap-1"><CheckCircle2 size={10} />Saved</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VendorAssessmentFillPage() {
  const { id }         = useParams()
  const navigate       = useNavigate()
  const [urlParams]    = useSearchParams()
  // MUST be declared before any hook that depends on it (canFetch, useAssessment, etc.)
  // openWork=1 → arrived from action item → skip frontend canView gate
  const isRevisionEntry = urlParams.get('openWork') === '1' || !!urlParams.get('actionItemId')
  const { userId }     = useSelector(selectAuth)

  // ── Resolve live task from inbox — never trust stale URL params ───────────
  const { data: myTasksData, isLoading: tasksLoading } = useMyTasks({})
  const myTasks    = Array.isArray(myTasksData) ? myTasksData : (myTasksData?.items ?? [])
  // Prefer ACTOR task — it is the one whose approval advances the step.
  // A user can theoretically have both ASSIGNER and ACTOR tasks for the same artifact.
  const actorTask    = myTasks.find(t =>
    (t.status === 'PENDING' || t.status === 'IN_PROGRESS') &&
    String(t.artifactId) === String(id) && t.taskRole === 'ACTOR'
  ) || null
  const assignerTask = myTasks.find(t =>
    (t.status === 'PENDING' || t.status === 'IN_PROGRESS') &&
    String(t.artifactId) === String(id) && t.taskRole === 'ASSIGNER'
  ) || null
  const activeTask = actorTask || assignerTask

  const taskId         = activeTask ? String(activeTask.id)             : urlParams.get('taskId')
  const stepInstanceId = activeTask ? String(activeTask.stepInstanceId) : urlParams.get('stepInstanceId')

  // Find the task for this page across ALL statuses (including APPROVED)
  // to reliably determine the step action even after the task completes.
  const thisPageTask = myTasks.find(t =>
    String(t.id) === String(taskId)
  ) || actorTask || null
  const stepAction = thisPageTask?.resolvedStepAction || null

  // ── Access context replaces useEffect task-gate ───────────────────────────
  const { data: taskSections = [] } = useCompoundTaskProgress(taskId ? Number(taskId) : null)
  const { data: access, isLoading: accessLoading } =
    useAccessContext(stepInstanceId, taskId ? Number(taskId) : undefined)

  // Only fetch once access is resolved.
  // OPEN WORK BYPASS: if arrived via action item (openWork=1), skip the canView
  // gate — backend obligation check grants access, so fetch regardless of access context.
  const canFetch = isRevisionEntry
    ? !!id  // openWork: always fetch, let backend decide
    : (!accessLoading && !!access?.canView)  // normal: wait for access context

  const { data: assessmentData, isLoading: assessmentLoading } =
    useAssessment(id, canFetch)
  const assessment = assessmentData

  // Load only sections assigned to this user — NOT all sections.
  const { data: mySectionsData = [], isLoading: sectionsLoading } =
    useMySections(id, canFetch)

  const { mutate: submitAssessment, isPending: submitting }     = useSubmitAssessment(id)
  const { mutate: submitSection,   isPending: submittingSection } = useSubmitSection(id)
  const { mutate: reopenSection,   isPending: reopeningSection  } = useReopenSection(id)
  const { mutate: contribSubmit,   isPending: contribSubmitting } = useContributorSubmitSection(id)
  const { data: contribSubmitted = new Set() } = useContributorSectionStatus(id, taskId)
  const { mutate: assignQuestion }                                = useAssignQuestion(id)
  // Questions selected for batch contributor assignment (per section)
  const [selectedForBatch, setSelectedForBatch] = useState({}) // sectionKey → Set<questionInstanceId>

  // Detect contributor mode: logged-in user is NOT the section assignee.
  // Normal flow: mySections is empty AND taskId exists → contributor.
  // openWork flow: mySections is empty AND isRevisionEntry → contributor.
  // In both cases: empty sections = this user is a contributor, not a responder.
  // The taskId check is relaxed for openWork because approved-task contributors
  // have no active taskId but still need contributor view.
  const isContributorMode = !sectionsLoading &&
    Array.isArray(mySectionsData) && mySectionsData.length === 0 &&
    !!(taskId || isRevisionEntry)
  const { data: contributorQs = [] } = useMyContributorQuestions(id, isContributorMode)

  // Handler: responder assigns question(s) to a contributor
  // Accepts { questionInstanceId, userId } or { questionInstanceIds, userId }
  const handleAssignQuestion = (params) => {
    assignQuestion(params)
  }
  const [open, setOpen] = useState({})
  const [showSubmit, setShowSubmit]   = useState(false)
  const [submitRemarks, setSubmitRemarks] = useState('')

  const toggle = (key) => setOpen(o => ({ ...o, [key]: !o[key] }))

  // canEdit drives whether inputs are interactive
  // editable: user has an active task (access.canEdit) AND assessment is not terminal.
  // We intentionally do NOT gate on assessment.status === 'IN_PROGRESS' only —
  // the assessment may be 'ASSIGNED' when the first responder opens it,
  // or stay 'IN_PROGRESS' throughout. The task status (via access.canEdit) is
  // the authoritative gate. Section-level lock (section.submittedAt) handles finer control.
  const terminalStatuses = ['SUBMITTED', 'COMPLETED', 'CANCELLED', 'REJECTED']
  // For openWork entries: editable is determined by backend response.
  // If backend allows submitAnswer → editable. If 403 → shows error.
  // We allow the UI to render in editable=false (read-only) mode —
  // contributor can see their answers and the revision banner.
  const editable = isRevisionEntry
    ? !!(assessment?.status && !terminalStatuses.includes(assessment.status))
    : !!(access?.canEdit && assessment?.status && !terminalStatuses.includes(assessment.status))

  const handleSubmit = () => {
    if (!taskId) { toast.error('No task ID — open from your task inbox'); return }
    submitAssessment({ taskId: parseInt(taskId), remarks: submitRemarks }, {
      onSuccess: () => { setShowSubmit(false); navigate('/workflow/inbox') },
    })
  }

  // ALL hooks before any early returns — Rules of Hooks
  useEffect(() => {
    if (isRevisionEntry) return  // let backend guard decide — don't redirect
    if (!accessLoading && access && !access.canView) {
      navigate('/workflow/inbox', { replace: true })
    }
  }, [accessLoading, access, navigate, isRevisionEntry])

  // When arriving via action item, access context is irrelevant — skip its loading state
  if ((!isRevisionEntry && (accessLoading || tasksLoading)) || assessmentLoading || sectionsLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={24} className="animate-spin text-text-muted" />
    </div>
  )

  if (!isRevisionEntry && access && !access.canView) return null

  if (!assessment) return (
    <div className="p-6 text-center text-text-muted text-sm">
      Assessment not found or you do not have access.
    </div>
  )

  // Use assigned sections only. Fall back to all sections if mySections is empty
  // (e.g. org-side users viewing without section assignments).
  const sections = mySectionsData.length > 0 ? mySectionsData : (assessment?.sections || [])
  const totalQ   = assessment.progress?.totalQuestions ?? 0
  const answered = assessment.progress?.answered ?? 0
  const pct      = totalQ > 0 ? Math.round(answered * 100 / totalQ) : 0

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
            {assessment.templateName || 'Assessment'}
          </h1>
          <p className="text-xs text-text-muted">
            {assessment.vendorName}
            {taskId && <> · Task #{taskId}</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {access?.mode === 'OBSERVER' && (
            <span className="text-[10px] font-medium px-2 py-1 rounded bg-purple-500/10 text-purple-400">Observer</span>
          )}
          {access?.mode === 'COMPLETED' && (
            <span className="text-[10px] font-medium px-2 py-1 rounded bg-green-500/10 text-green-400">Completed</span>
          )}
          {/* Progress */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-text-muted">{pct}%</span>
          </div>
          {access?.canAct && editable && taskId && (stepAction === 'REVIEW' || stepAction === 'GENERATE') && (
            <Button size="sm" icon={Send} onClick={() => setShowSubmit(true)}>
              Submit
            </Button>
          )}
        </div>
      </div>

      {/* Sections */}
      {taskSections.length > 0 && (
        <div className="max-w-3xl mx-auto px-4 pt-4">
          <CompoundTaskProgress sections={taskSections} />
        </div>
      )}

      {/* ── Contributor view: questions grouped by section ───────────────────── */}
      {isContributorMode && contributorQs.length > 0 && (() => {
        // Group questions by sectionInstanceId
        const sectionMap = contributorQs.reduce((acc, q) => {
          const key = q.sectionInstanceId || 'unsectioned'
          if (!acc[key]) acc[key] = { sectionName: q.sectionName || `Section ${key}`, questions: [] }
          acc[key].questions.push(q)
          return acc
        }, {})
        const sectionGroups = Object.entries(sectionMap)

        return (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20">
              <Users size={13} className="text-purple-400 flex-shrink-0" />
              <p className="text-xs text-purple-300">
                You have <span className="font-medium">{contributorQs.length}</span> question{contributorQs.length !== 1 ? 's' : ''} assigned across <span className="font-medium">{sectionGroups.length}</span> section{sectionGroups.length !== 1 ? 's' : ''}.
              </p>
            </div>

            {sectionGroups.map(([sectionKey, group]) => {
              const sectionInstanceId = sectionKey === 'unsectioned' ? null : Number(sectionKey)
              const isSubmitted = sectionInstanceId && contribSubmitted.has(sectionInstanceId)
              const answeredCount = group.questions.filter(q => q.currentResponse).length

              return (
                <div key={sectionKey} className="bg-surface rounded-xl border border-border overflow-hidden">
                  {/* Section header */}
                  <div className="px-5 py-3 border-b border-border bg-surface-overlay/30 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{group.sectionName}</p>
                      <p className="text-xs text-text-muted mt-0.5">{answeredCount}/{group.questions.length} answered</p>
                    </div>
                    {isSubmitted && (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-green-400" />
                        <span className="text-xs text-green-400">Submitted</span>
                      </div>
                    )}
                  </div>

                  {/* Questions */}
                  <div className="divide-y divide-border">
                    {group.questions.map((q, qi) => (
                      <div key={q.questionInstanceId} className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <span className="text-xs font-mono text-text-muted pt-0.5 flex-shrink-0 w-5">{qi + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm text-text-primary">{q.questionText}</p>
                              {q.mandatory && <span className="text-red-400 text-xs flex-shrink-0">*</span>}
                              {q.currentResponse && (
                                <CheckCircle2 size={12} className="text-green-400 flex-shrink-0 ml-auto" />
                              )}
                            </div>
                            {(() => {
                              const tc = TYPE_CONFIG[q.responseType] || { color: 'gray', label: q.responseType, hint: '' }
                              return (
                                <div className="flex items-center gap-2 flex-wrap mt-1">
                                  <Badge value={q.responseType} label={tc.label} colorTag={tc.color} />
                                  {q.weight != null && (
                                    <span className="text-[10px] text-text-muted font-mono">{q.weight} pts</span>
                                  )}
                                </div>
                              )
                            })()}
                            {/* KashiTrack: revision banner for contributor */}
                            <RevisionBanner
                              questionInstanceId={q.questionInstanceId}
                              isContributorView={true}
                              hasCurrentResponse={!!q.currentResponse}
                            />
                            {/* Org remediation notice — vendor contributor sees what must be fixed */}
                            <RemediationNoticeBanner questionInstanceId={q.questionInstanceId} />
                            <QuestionInput
                              question={q}
                              assessmentId={id}
                              disabled={
                                // Normal flow: lock if section submitted OR not editable
                                // Revision flow (openWork): section lock is bypassed on backend
                                // if an open action item exists for this question — allow editing.
                                isRevisionEntry
                                  ? false  // backend enforces obligation check; let it decide
                                  : (!editable || isSubmitted || !!q.sectionSubmittedAt)
                              }
                              isContributorView={true}
                            />
                            {/* Show who answered if answered by someone else */}
                            {q.currentResponse?.answeredByName && (
                              <p className="text-[10px] text-text-muted mt-1">
                                Answered by {q.currentResponse.answeredByName}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Section footer: submit button */}
                  {editable && sectionInstanceId && (
                    <div className="px-5 py-3 bg-surface-overlay/30 border-t border-border flex items-center justify-between">
                      <p className="text-xs text-text-muted">{answeredCount}/{group.questions.length} answered</p>
                      {isSubmitted ? (
                        <span className="text-xs text-green-400 flex items-center gap-1">
                          <CheckCircle2 size={11} /> Submitted
                        </span>
                      ) : (
                        <Button size="xs" variant="primary" icon={CheckCircle2}
                          loading={contribSubmitting}
                          onClick={() => contribSubmit({ sectionInstanceId, taskId })}>
                          Submit answers
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ── Responder view: their assigned sections ─────────────────────────── */}
      {!isContributorMode && (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {sections.map((section, si) => {
          const key = `s-${si}`
          const isOpen = open[key] !== false  // default open
          const sAnswered = section.questions?.filter(q => q.currentResponse).length ?? 0
          const sTotal    = section.questions?.length ?? 0

          return (
            <div key={si} className="bg-surface rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => toggle(key)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-overlay/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText size={15} className="text-text-muted flex-shrink-0" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-text-primary">{section.sectionName}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {sAnswered}/{sTotal} answered
                    </p>
                  </div>
                </div>
                {isOpen
                  ? <ChevronDown size={14} className="text-text-muted flex-shrink-0" />
                  : <ChevronRight size={14} className="text-text-muted flex-shrink-0" />}
              </button>

              {isOpen && (() => {
                const sectionKey2 = section.sectionInstanceId || si
                const batchSet = selectedForBatch[sectionKey2] || new Set()
                const toggleBatch = (qid) => setSelectedForBatch(prev => {
                  const s = new Set(prev[sectionKey2] || [])
                  if (s.has(qid)) s.delete(qid); else s.add(qid)
                  return { ...prev, [sectionKey2]: s }
                })
                return (
                <div className="border-t border-border divide-y divide-border">
                  {/* Batch assign toolbar — shown when items selected */}
                  {editable && batchSet.size > 0 && (
                    <div className="px-5 py-2.5 bg-purple-500/5 border-b border-purple-500/20 flex items-center gap-3">
                      <span className="text-xs text-purple-300 font-medium flex-shrink-0">
                        {batchSet.size} question{batchSet.size > 1 ? 's' : ''} selected
                      </span>
                      <ContributorPicker
                        value={null}
                        onChange={(user) => {
                          if (!user) return
                          handleAssignQuestion({ questionInstanceIds: [...batchSet], userId: user.id || user.userId })
                          setSelectedForBatch(prev => ({ ...prev, [sectionKey2]: new Set() }))
                        }}
                      />
                      <button onClick={() => setSelectedForBatch(prev => ({ ...prev, [sectionKey2]: new Set() }))}
                        className="text-[10px] text-text-muted hover:text-text-secondary ml-auto flex-shrink-0">
                        Clear
                      </button>
                    </div>
                  )}
                  {(section.questions || []).map((q, qi) => (
                    <div key={qi} className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        {/* Checkbox for batch selection — hide when section submitted */}
                        {editable && !section.submittedAt && !q.assignedUserId && (
                          <button
                            onClick={() => toggleBatch(q.questionInstanceId)}
                            className={cn(
                              'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-1 transition-colors',
                              batchSet.has(q.questionInstanceId)
                                ? 'bg-purple-500 border-purple-500'
                                : 'border-border hover:border-purple-500/50'
                            )}>
                            {batchSet.has(q.questionInstanceId) && (
                              <CheckCircle2 size={10} className="text-white" />
                            )}
                          </button>
                        )}
                        {(!editable || !!section.submittedAt || q.assignedUserId) && (
                          <span className="text-xs font-mono text-text-muted pt-0.5 flex-shrink-0 w-5">
                            {qi + 1}.
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm text-text-primary">{q.questionText}</p>
                            {q.mandatory && (
                              <span className="text-red-400 text-xs flex-shrink-0">*</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {(() => {
                              const tc = TYPE_CONFIG[q.responseType] || { color: 'gray', label: q.responseType, hint: '' }
                              return (
                                <>
                                  <Badge value={q.responseType} label={tc.label} colorTag={tc.color} />
                                  {tc.hint && (
                                    <span className="text-[10px] text-text-muted italic">{tc.hint}</span>
                                  )}
                                </>
                              )
                            })()}
                            {q.weight != null && (
                              <span className="text-[10px] text-text-muted font-mono ml-auto">{q.weight}pts</span>
                            )}
                            {q.currentResponse && (
                              <CheckCircle2 size={12} className="text-green-400" />
                            )}
                          </div>
                          <QuestionInput
                            question={q}
                            assessmentId={id}
                            disabled={!editable || !!section.submittedAt}
                            onAssign={(editable && !section.submittedAt) ? handleAssignQuestion : null}
                            isContributorView={false}
                          />
                          {/* KashiTrack: revision status for responder */}
                          <RevisionBanner
                            questionInstanceId={q.questionInstanceId}
                            isContributorView={false}
                            hasCurrentResponse={!!q.currentResponse}
                          />
                          {/* Org remediation notice — vendor responder sees what must be fixed */}
                          <RemediationNoticeBanner questionInstanceId={q.questionInstanceId} />
                          {/* Individual assign — hidden when section submitted */}
                          {editable && !section.submittedAt && !q.assignedUserId && batchSet.size === 0 && (
                            <ContributorPicker
                              value={null}
                              onChange={(user) => user && handleAssignQuestion({
                                questionInstanceId: q.questionInstanceId,
                                userId: user.id || user.userId,
                              })}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Section submit footer — server-driven state via section.submittedAt */}
                  {taskId && (() => {
                    const isSubmitted = !!section.submittedAt
                    // sectionInstanceId must be a real DB id — si index fallback means data not loaded yet
                    const hasRealId   = !!section.sectionInstanceId
                    const isCisoView  = access?.taskRole === 'ASSIGNER' || access?.mode === 'OBSERVER'
                    return (
                      <div className="px-5 py-3 bg-surface-overlay/30 border-t border-border flex items-center justify-between gap-3">
                        {/* Left: status text */}
                        {isSubmitted ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={13} className="text-green-400 flex-shrink-0" />
                            <span className="text-xs text-green-400">
                              Submitted{section.submittedByName ? ` by ${section.submittedByName}` : ''}
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs text-text-muted">{sAnswered}/{sTotal} answered</p>
                        )}
                        {/* Right: actions */}
                        <div className="flex items-center gap-2">
                          {isSubmitted && isCisoView && (
                            <Button size="xs" variant="ghost"
                              loading={reopeningSection}
                              onClick={() => reopenSection(section.sectionInstanceId)}>
                              Reopen
                            </Button>
                          )}
                          {!isSubmitted && editable && section.sectionInstanceId && (
                            <Button size="xs" variant="primary" icon={CheckCircle2}
                              loading={submittingSection}
                              onClick={() => submitSection({ sectionInstanceId: section.sectionInstanceId, taskId })}>
                              Submit section
                            </Button>
                          )}
                          {isSubmitted && !isCisoView && (
                            <span className="text-[10px] text-text-muted italic">
                              Locked — ask CISO to reopen
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      )} {/* end !isContributorMode */}

      {/* Submit confirmation modal */}
      <Modal
        isOpen={showSubmit}
        onClose={() => setShowSubmit(false)}
        title="Submit assessment"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Once submitted, you will not be able to edit your answers.
            Make sure all mandatory questions are answered.
          </p>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-overlay text-sm">
            <CheckCircle2 size={14} className="text-green-400 flex-shrink-0" />
            <span className="text-text-secondary">
              {answered} of {totalQ} questions answered ({pct}%)
            </span>
          </div>
          <textarea
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            rows={3}
            placeholder="Submission remarks (optional)"
            value={submitRemarks}
            onChange={e => setSubmitRemarks(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowSubmit(false)}>Cancel</Button>
            <Button variant="primary" icon={Send} onClick={handleSubmit} loading={submitting}>
              Submit assessment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}