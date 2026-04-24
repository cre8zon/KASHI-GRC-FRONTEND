/**
 * AssessmentReviewPage — all org-side steps (7–13)
 *
 * navKey: org_assessment_review → /assessments/:id/review
 *
 * ── PANEL DISPATCH ────────────────────────────────────────────────────────────
 * Unchanged from original. Driven by resolveOrgPanel(actorRoleName, stepAction).
 *
 * ── FIXES (2026-04) ──────────────────────────────────────────────────────────
 *   1. TASK MATCHING: was matching by entityId (vendorId) — fixed to artifactId
 *      (assessmentId). VendorAssessmentEntityResolver maps artifactId = assessment.id.
 *      This caused actorTask=undefined → stepAction='APPROVE' → flat read-only panel.
 *   2. COLLAPSIBLE SECTIONS: APPROVE panel now has accordion open/close state.
 *   3. APPROVE PANEL: shows full answer (text, options, eval badge) not just responseText.
 *   4. EVALUATE FALLBACK moved to backend: /my-reviewer-sections now returns all
 *      sections when no explicit assignment exists but caller has an active EVALUATE task.
 *      Frontend stays clean — empty = genuinely not your assessment.
 *
 * ── WHAT CHANGED ─────────────────────────────────────────────────────────────
 *   1. EvaluateQuestionsPanel now uses useMyReviewerSections (reviewerAssignedUserId)
 *      instead of useMySections (assignedUserId).
 *   2. Per-section reviewer-submit button replaces the single "Submit evaluation" button.
 *   3. ReviewerQuestionCard has two new action buttons:
 *      - "Clarify with assistant" → ClarificationModal
 *      - "Request vendor remediation" → RemediationModal
 *   4. AssignReviewersPanel now calls reviewerAssignSection (new endpoint) so the
 *      section gets reviewerAssignedUserId rather than assignedUserId.
 *   5. AssignReviewersPanel also allows per-question assignment to assistants
 *      via the reviewer-assign-v2 endpoint (creates sub-task in inbox).
 *   6. ReportVersionPanel added — shown on COMPLETED assessments.
 *   7. RemediationActionBanner shown on each question — reviewer sees status of
 *      open remediation / clarification items and can validate or accept-risk.
 */

import { useState, useEffect }    from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, XCircle, CornerDownLeft, MessageSquare,
  ChevronDown, ChevronRight, Loader2, FileText,
  Users, ThumbsUp, ThumbsDown, Minus, Send, AlertTriangle,
  Flag, UserPlus, Eye, RefreshCw, Download, Clock,
} from 'lucide-react'
import { assessmentsApi } from '../../api/assessments.api'
import { reviewApi }      from '../../api/review.api'
import { workflowsApi }   from '../../api/workflows.api'
import { usersApi }       from '../../api/users.api'
import { actionItemsApi } from '../../api/actionItems.api'
import { Button }         from '../../components/ui/Button'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Modal }          from '../../components/ui/Modal'
import { cn }             from '../../lib/cn'
import { formatDate }     from '../../utils/format'
import { useMyTasks, useCompoundTaskProgress } from '../../hooks/useWorkflow'
import { CompoundTaskProgress, CompoundTaskBadge } from '../../components/workflow/CompoundTaskProgress'
import { useEntityActionItems, useUpdateActionItemStatus } from '../../hooks/useActionItems'
import { useQuestionComments } from '../../hooks/useComments'
import toast from 'react-hot-toast'

// ─── Data hooks ───────────────────────────────────────────────────────────────

const useAssessment = (id) => useQuery({
  queryKey: ['assessment-review', id],
  queryFn:  () => assessmentsApi.vendor.review(id),
  enabled:  !!id,
})

// Reviewer's sections — filtered by reviewerAssignedUserId (NEW endpoint)
const useMyReviewerSections = (id, taskId, enabled) => useQuery({
  queryKey: ['reviewer-my-sections-v2', id, taskId],
  queryFn:  () => reviewApi.myReviewerSections(id, taskId),
  enabled:  !!id && !!enabled,
  staleTime: 30_000,
  select: (d) => Array.isArray(d) ? d : (d?.data || []),
})

const useOrgUsers = (search) => useQuery({
  queryKey: ['org-users-search', search],
  queryFn:  () => usersApi.list({ take: 20, search: search || undefined, side: 'ORGANIZATION' }),
  enabled:  (search?.length ?? 0) >= 2,
  staleTime: 30_000,
})

const useReportVersions = (assessmentId) => useQuery({
  queryKey: ['report-versions', assessmentId],
  queryFn:  async () => {
    const res = await reviewApi.getReports(assessmentId)
    const raw = res?.data ?? res
    if (Array.isArray(raw)) return raw
    if (Array.isArray(raw?.data)) return raw.data
    return []
  },
  enabled:  !!assessmentId,
  staleTime: 60_000,
  select: (d) => Array.isArray(d) ? d : (d?.data || []),
})

// ─── Panel resolver ───────────────────────────────────────────────────────────
// Unchanged from original

function resolveOrgPanel(actorRoleName, stepAction) {
  const action = (stepAction || '').toUpperCase()
  if (action === 'ASSIGN') {
    if (actorRoleName === 'ORG_CISO') return { panel: 'ASSIGN_CISO', title: 'Assign Org CISO to lead review' }
    return { panel: 'ASSIGN_SECTIONS', title: 'Assign questionnaire sections to reviewers' }
  }
  if (action === 'EVALUATE') {
    if (actorRoleName === 'ORG_CISO') return { panel: 'CISO_APPROVE', title: 'Final approval & risk rating' }
    return { panel: 'EVALUATE', title: 'Evaluate assigned questions' }
  }
  if (action === 'REVIEW')      return { panel: 'REVIEW',      title: 'Consolidate findings'   }
  if (action === 'ACKNOWLEDGE') return { panel: 'ACKNOWLEDGE',  title: 'Final sign-off'         }
  return { panel: 'APPROVE', title: 'Assessment review' }
}

function isCISOApprovalStep(actorRoleName, stepAction) {
  return (stepAction || '').toUpperCase() === 'EVALUATE' && actorRoleName === 'ORG_CISO'
}

// ─── Reviewer flag types (unchanged from original) ────────────────────────────

const REVIEWER_FLAG_TYPES = [
  { code: 'CG_FRAMEWORK_GAP',       label: 'Control Gap',         icon: '⚠',  color: 'text-amber-400',  bg: 'bg-amber-500/8  border-amber-500/25'  },
  { code: 'RE_HIGH_RESIDUAL',        label: 'Risk Escalation',     icon: '🔺',  color: 'text-red-400',    bg: 'bg-red-500/8    border-red-500/25'    },
  { code: 'AF_EVIDENCE_MISSING',     label: 'Evidence Missing',    icon: '📄',  color: 'text-orange-400', bg: 'bg-orange-500/8 border-orange-500/25' },
  { code: 'AF_CONTROL_PARTIAL',      label: 'Partial Control',     icon: '◑',  color: 'text-yellow-400', bg: 'bg-yellow-500/8 border-yellow-500/25' },
  { code: 'AQ_INSUFFICIENT_DETAIL',  label: 'Needs More Detail',   icon: '💬', color: 'text-blue-400',   bg: 'bg-blue-500/8   border-blue-500/25'   },
  { code: 'AQ_OUTDATED_DOC',         label: 'Outdated Document',   icon: '🕐',  color: 'text-purple-400', bg: 'bg-purple-500/8 border-purple-500/25' },
]

// ─── CommentBox (unchanged from original) ────────────────────────────────────

const VENDOR_THREAD_TYPES = new Set(['REVISION_REQUEST', 'RESOLVED'])

function CommentBox({ questionInstanceId }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const { comments, addComment, adding } = useQuestionComments(questionInstanceId, { enabled: !!questionInstanceId })
  const allComments   = Array.isArray(comments) ? comments : []
  const vendorThreads = allComments.filter(c => VENDOR_THREAD_TYPES.has(c.commentType))
  const reviewerNotes = allComments.filter(c => !VENDOR_THREAD_TYPES.has(c.commentType))

  const handleAdd = () => {
    if (!text.trim()) return
    addComment({ commentText: text.trim(), commentType: 'COMMENT', visibility: 'ALL', questionInstanceId },
      { onSuccess: () => { setText(''); setOpen(false); toast.success('Comment saved') },
        onError:   () => toast.error('Failed to save comment') })
  }

  return (
    <div className="mt-2 space-y-1.5">
      {vendorThreads.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] text-text-muted uppercase tracking-wide">Vendor thread</p>
          {vendorThreads.map((c, i) => (
            <div key={c.id ?? i} className={cn('flex gap-1.5 px-2 py-1 rounded text-[11px]',
              c.commentType === 'RESOLVED' ? 'bg-surface-overlay text-text-muted line-through opacity-50' : 'bg-surface-overlay text-text-muted')}>
              <MessageSquare size={9} className="mt-0.5 shrink-0 opacity-60" />
              <span>{c.commentedByName && <span className="opacity-70 mr-1 font-medium">{c.commentedByName}:</span>}{c.commentText}</span>
            </div>
          ))}
        </div>
      )}
      {reviewerNotes.length > 0 && (
        <div className="space-y-1">
          {reviewerNotes.map((c, i) => (
            <div key={c.id ?? i} className="flex gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-500/6 border border-blue-500/15 text-[11px] text-blue-300">
              <MessageSquare size={10} className="mt-0.5 shrink-0" />
              <span>{c.commentedByName && <span className="font-medium text-blue-200 mr-1">{c.commentedByName}:</span>}{c.commentText}</span>
            </div>
          ))}
        </div>
      )}
      {!open
        ? <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-[11px] text-text-muted hover:text-blue-400 transition-colors">
            <MessageSquare size={10} /> Add review note
          </button>
        : <div className="space-y-1.5">
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2} autoFocus
              placeholder="Add your review note…"
              className="w-full rounded-md border border-blue-500/20 bg-blue-500/5 px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
            <div className="flex gap-1">
              <Button size="xs" variant="secondary" onClick={handleAdd} loading={adding} disabled={!text.trim()}>Save note</Button>
              <Button size="xs" variant="ghost" onClick={() => { setOpen(false); setText('') }}>Cancel</Button>
            </div>
          </div>
      }
    </div>
  )
}

// ─── RemediationActionBanner — ALL action items on a question, full context ───

const STATUS_COLOR = {
  OPEN:             'bg-red-500/8    border-red-500/25    text-red-400',
  IN_PROGRESS:      'bg-amber-500/8  border-amber-500/25  text-amber-400',
  PENDING_REVIEW:   'bg-blue-500/8   border-blue-500/25   text-blue-400',
  PENDING_VALIDATION:'bg-blue-500/8  border-blue-500/25   text-blue-400',
  RESOLVED:         'bg-green-500/8  border-green-500/25  text-green-400',
  DISMISSED:        'bg-surface-overlay border-border      text-text-muted',
  RISK_ACCEPTED:    'bg-amber-500/6  border-amber-500/20  text-amber-300',
}
const STATUS_LABEL = {
  OPEN:              'Open — pending action',
  IN_PROGRESS:       'In progress',
  PENDING_REVIEW:    'Submitted — awaiting review',
  PENDING_VALIDATION:'Awaiting validation',
  RESOLVED:          'Resolved',
  DISMISSED:         'Dismissed',
  RISK_ACCEPTED:     'Risk accepted',
}

function RemediationActionBanner({ questionInstanceId, assessmentId }) {
  const qc = useQueryClient()
  const { data: items = [] } = useEntityActionItems('QUESTION_RESPONSE', questionInstanceId)

  const { mutate: validate, isPending: validating } = useMutation({
    mutationFn: ({ actionItemId, note }) => reviewApi.validateRemediation(assessmentId, actionItemId, note),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['action-items-entity', 'QUESTION_RESPONSE', questionInstanceId] })
      const r = data?.data || data
      if (r?.reportTriggered) toast.success('Validated — new report version generated!')
      else toast.success(`Validated — ${r?.openRemediations ?? 0} open item(s) remaining`)
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed to validate'),
  })
  const { mutate: acceptRisk, isPending: accepting } = useMutation({
    mutationFn: ({ actionItemId, note }) => reviewApi.acceptRisk(assessmentId, actionItemId, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-items-entity', 'QUESTION_RESPONSE', questionInstanceId] })
      toast.success('Risk accepted')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
  const { mutate: updateStatus } = useUpdateActionItemStatus()

  // Split by type — show ALL statuses so history is visible
  const remediations   = items.filter(i => i.remediationType === 'REMEDIATION_REQUEST')
  const clarifications = items.filter(i => i.remediationType === 'CLARIFICATION')
  const systemFindings = items.filter(i => i.sourceType === 'SYSTEM')

  if (!remediations.length && !clarifications.length && !systemFindings.length) return null

  const isOpen = (s) => ['OPEN','IN_PROGRESS','PENDING_REVIEW','PENDING_VALIDATION'].includes(s)

  return (
    <div className="space-y-2 mt-2">

      {/* ── REMEDIATIONS ─────────────────────────────────────────────── */}
      {remediations.map(item => {
        const colorCls = STATUS_COLOR[item.status] || STATUS_COLOR.OPEN
        const isResolved  = item.status === 'RESOLVED'
        const isAccepted  = item.acceptedRisk
        const vendorActed = ['PENDING_REVIEW','PENDING_VALIDATION'].includes(item.status)
        return (
          <div key={item.id} className={cn('rounded-lg border text-[11px]', colorCls)}>
            {/* Header row */}
            <div className="flex items-start gap-2 px-3 py-2">
              {isResolved   ? <CheckCircle2 size={12} className="shrink-0 mt-0.5"/>
               : vendorActed ? <CheckCircle2 size={12} className="shrink-0 mt-0.5"/>
               : <Clock size={12} className="shrink-0 mt-0.5"/>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold">Vendor remediation</span>
                  {item.severity && (
                    <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                      item.severity === 'CRITICAL' && 'bg-red-500/20 text-red-300',
                      item.severity === 'HIGH'     && 'bg-orange-500/20 text-orange-300',
                      item.severity === 'MEDIUM'   && 'bg-amber-500/20 text-amber-300',
                      item.severity === 'LOW'      && 'bg-blue-500/20 text-blue-300',
                    )}>{item.severity}</span>
                  )}
                  <span className="opacity-60">— {STATUS_LABEL[item.status] || item.status}</span>
                </div>
                {item.description && <p className="text-[10px] opacity-80 mt-0.5 leading-relaxed">{item.description}</p>}
                {item.expectedEvidence && (
                  <p className="text-[10px] opacity-60 mt-0.5">Expected evidence: {item.expectedEvidence}</p>
                )}
                {item.dueAt && !isResolved && (
                  <p className={cn('text-[10px] mt-0.5 flex items-center gap-1', item.isOverdue ? 'text-red-400' : 'opacity-50')}>
                    <Clock size={9}/> Due {formatDate(item.dueAt)}{item.isOverdue && ' — overdue'}
                  </p>
                )}
              </div>
            </div>

            {/* Parties involved */}
            <div className="px-3 py-1.5 border-t border-white/5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] opacity-70">
              {item.createdByName && <span>Raised by: <strong>{item.createdByName}</strong></span>}
              {item.assignedToName && <span>Assigned to: <strong>{item.assignedToName}</strong></span>}
              {item.assignedGroupRole && !item.assignedToName && <span>Group: <strong>{item.assignedGroupRole}</strong></span>}
              {item.resolutionReservedForName && <span>Validator: <strong>{item.resolutionReservedForName}</strong></span>}
              {item.createdAt && <span>Raised {formatDate(item.createdAt)}</span>}
            </div>

            {/* Resolution info */}
            {isResolved && (
              <div className="px-3 py-1.5 border-t border-white/5 text-[10px]">
                {isAccepted
                  ? <span className="text-amber-300">⚠ Risk accepted by {item.acceptedRiskByName || item.resolvedByName} — {item.acceptedRiskNote || item.resolutionNote}</span>
                  : <span className="text-green-300">✓ Validated by {item.resolvedByName} — {item.resolutionNote}</span>}
                {item.resolvedAt && <span className="ml-1.5 opacity-50">{formatDate(item.resolvedAt)}</span>}
              </div>
            )}

            {/* Actions */}
            {isOpen(item.status) && item.canResolve && (
              <div className="px-3 py-1.5 border-t border-white/5 flex gap-3 flex-wrap">
                {vendorActed && (
                  <button disabled={validating}
                    onClick={() => validate({ actionItemId: item.id, note: 'Remediation validated' })}
                    className="text-[10px] text-green-400 hover:text-green-300 flex items-center gap-1 font-medium">
                    <CheckCircle2 size={10}/> Validate remediation
                  </button>
                )}
                {vendorActed && (
                  <button
                    onClick={() => {
                      updateStatus({ id: item.id, status: 'IN_PROGRESS',
                        resolutionNote: 'Reviewer sent back for rework' })
                      qc.invalidateQueries({ queryKey: ['action-items-entity', 'QUESTION_RESPONSE', questionInstanceId] })
                    }}
                    className="text-[10px] text-orange-400/80 hover:text-orange-400 flex items-center gap-1">
                    <CornerDownLeft size={10}/> Send back for rework
                  </button>
                )}
                <button disabled={accepting}
                  onClick={() => acceptRisk({ actionItemId: item.id, note: 'Risk accepted' })}
                  className="text-[10px] text-amber-400/80 hover:text-amber-400 flex items-center gap-1">
                  <XCircle size={10}/> Accept risk
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* ── CLARIFICATIONS ───────────────────────────────────────────── */}
      {clarifications.map(item => {
        const colorCls  = STATUS_COLOR[item.status] || 'bg-purple-500/8 border-purple-500/25 text-purple-400'
        const isResolved = item.status === 'RESOLVED'
        return (
          <div key={item.id} className={cn('rounded-lg border text-[11px]',
            isResolved ? colorCls : 'bg-purple-500/8 border-purple-500/20 text-purple-400')}>
            <div className="flex items-start gap-2 px-3 py-2">
              {isResolved ? <CheckCircle2 size={12} className="shrink-0 mt-0.5"/>
                : item.status === 'PENDING_REVIEW' ? <CheckCircle2 size={12} className="shrink-0 mt-0.5"/>
                : <Clock size={12} className="shrink-0 mt-0.5"/>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold">Clarification request</span>
                  <span className="opacity-60">— {STATUS_LABEL[item.status] || item.status}</span>
                </div>
                {item.description && <p className="text-[10px] opacity-80 mt-0.5">{item.description}</p>}
              </div>
              {!isResolved && item.status === 'PENDING_REVIEW' && item.canResolve && (
                <button onClick={() => {
                  updateStatus({ id: item.id, status: 'RESOLVED', resolutionNote: 'Clarification accepted' })
                  qc.invalidateQueries({ queryKey: ['action-items-entity', 'QUESTION_RESPONSE', questionInstanceId] })
                }} className="text-[10px] text-green-400/80 hover:text-green-400 flex items-center gap-0.5 shrink-0">
                  <CheckCircle2 size={10}/> Resolve
                </button>
              )}
            </div>
            <div className="px-3 py-1.5 border-t border-white/5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] opacity-70">
              {item.createdByName && <span>Raised by: <strong>{item.createdByName}</strong></span>}
              {item.assignedToName && <span>Assigned to: <strong>{item.assignedToName}</strong></span>}
              {item.createdAt && <span>{formatDate(item.createdAt)}</span>}
            </div>
            {isResolved && item.resolutionNote && (
              <div className="px-3 py-1.5 border-t border-white/5 text-[10px] text-green-300">
                ✓ {item.resolutionNote}
                {item.resolvedByName && <span className="ml-1 opacity-70">by {item.resolvedByName}</span>}
              </div>
            )}
          </div>
        )
      })}

      {/* ── SYSTEM FINDINGS ──────────────────────────────────────────── */}
      {systemFindings.map(item => (
        <div key={item.id} className="rounded-lg border border-amber-500/20 bg-amber-500/6 text-[11px] text-amber-400">
          <div className="flex items-start gap-2 px-3 py-2">
            <AlertTriangle size={11} className="shrink-0 mt-0.5"/>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{item.title}</p>
              {item.description && <p className="text-[10px] opacity-70 mt-0.5">{item.description}</p>}
            </div>
            {item.canResolve && (
              <button onClick={() => updateStatus({ id: item.id, status: 'RESOLVED', resolutionNote: 'KashiGuard finding resolved' })}
                className="text-[10px] text-green-400/70 hover:text-green-400 shrink-0 flex items-center gap-0.5">
                <CheckCircle2 size={10}/> Resolve
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── ClarificationModal ───────────────────────────────────────────────────────

function ClarificationModal({ questionText, questionInstanceId, assessmentId, onClose }) {
  const [description, setDesc] = useState('')
  const qc = useQueryClient()
  const { mutate: request, isPending } = useMutation({
    mutationFn: () => reviewApi.requestClarification(assessmentId, questionInstanceId, description.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-items-entity', 'QUESTION_RESPONSE', questionInstanceId] })
      toast.success('Clarification requested — assistant notified')
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })

  return (
    <Modal open={true} onClose={onClose} title="Request clarification from review assistant">
      <div className="space-y-4 p-1">
        <div className="px-3 py-2.5 rounded-lg bg-purple-500/8 border border-purple-500/25 text-[11px]">
          <p className="font-medium text-purple-400 mb-0.5">Question</p>
          <p className="text-text-secondary">{questionText}</p>
        </div>
        <p className="text-xs text-text-muted">Internal only — the vendor is NOT notified. The assistant will re-evaluate and re-submit.</p>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">What needs clarification? *</label>
          <textarea value={description} onChange={e => setDesc(e.target.value)} rows={3} autoFocus
            placeholder="Explain what the assistant should re-examine…"
            className="w-full rounded-md border border-purple-500/20 bg-purple-500/5 px-2.5 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"/>
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" icon={CornerDownLeft} disabled={!description.trim()} loading={isPending} onClick={() => request()}>Send to assistant</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── RemediationModal ─────────────────────────────────────────────────────────

const SEVERITY_OPTIONS = [
  { value: 'LOW',      cls: 'bg-blue-500/10 border-blue-500/40 text-blue-400'     },
  { value: 'MEDIUM',   cls: 'bg-amber-500/10 border-amber-500/40 text-amber-400'  },
  { value: 'HIGH',     cls: 'bg-orange-500/10 border-orange-500/40 text-orange-400'},
  { value: 'CRITICAL', cls: 'bg-red-500/10   border-red-500/40   text-red-400'    },
]

function RemediationModal({ questionText, questionInstanceId, assessmentId, onClose }) {
  const [severity, setSeverity]   = useState('MEDIUM')
  const [description, setDesc]    = useState('')
  const [expected,   setExpected] = useState('')
  const [dueDate,    setDueDate]  = useState('')
  const qc = useQueryClient()

  const { mutate: request, isPending } = useMutation({
    mutationFn: () => reviewApi.requestRemediation(assessmentId, questionInstanceId, {
      severity, description: description.trim(),
      expectedEvidence: expected.trim() || undefined,
      dueDate: dueDate || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-items-entity', 'QUESTION_RESPONSE', questionInstanceId] })
      qc.invalidateQueries({ queryKey: ['assessment-review', assessmentId] })
      toast.success('Remediation requested — vendor and CISO notified')
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })

  return (
    <Modal open={true} onClose={onClose} title="Request vendor remediation">
      <div className="space-y-4 p-1">
        <div className="px-3 py-2.5 rounded-lg bg-red-500/8 border border-red-500/25 text-[11px]">
          <p className="font-medium text-red-400 mb-0.5">Question</p>
          <p className="text-text-secondary">{questionText}</p>
        </div>
        <p className="text-xs text-text-muted">Creates a tracked remediation obligation. Vendor contributor and CISO are notified. You validate closure.</p>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Severity *</label>
          <div className="flex gap-2">
            {SEVERITY_OPTIONS.map(({ value, cls }) => (
              <button key={value} type="button" onClick={() => setSeverity(value)}
                className={cn('flex-1 py-1.5 rounded-md border text-xs font-medium transition-colors',
                  severity === value ? cls : 'border-border text-text-muted hover:border-brand-500/30')}>
                {value}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">What must the vendor remediate? *</label>
          <textarea value={description} onChange={e => setDesc(e.target.value)} rows={3} autoFocus
            placeholder="Describe the gap, deficiency, or non-compliance…"
            className="w-full rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"/>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Expected evidence (optional)</label>
          <textarea value={expected} onChange={e => setExpected(e.target.value)} rows={2}
            placeholder="e.g. Updated MFA policy, SOC 2 addendum, pen test report…"
            className="w-full rounded-md border border-border bg-surface-raised px-2.5 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"/>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Due date (optional)</label>
          <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"/>
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="danger" icon={Flag} disabled={!description.trim()} loading={isPending} onClick={() => request()}>Send remediation request</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── FlagQuestionModal (unchanged from original) ──────────────────────────────

function FlagQuestionModal({ questionInstanceId, assessmentId, onClose }) {
  const [selected, setSelected] = useState(null)
  const [description, setDesc]  = useState('')
  const qc = useQueryClient()
  const { mutate: createItem, isPending } = useMutation({
    mutationFn: () => {
      const ft = REVIEWER_FLAG_TYPES.find(f => f.code === selected)
      return actionItemsApi.create({
        blueprintCode: selected, sourceType: 'COMMENT', sourceId: questionInstanceId,
        entityType: 'QUESTION_RESPONSE', entityId: questionInstanceId,
        title: ft?.label || selected, description: description.trim() || undefined,
        navContext: JSON.stringify({ reviewerRoute: `/assessments/${assessmentId}/review`, questionInstanceId }),
      })
    },
    onSuccess: () => {
      toast.success('Finding flagged — action item created')
      qc.invalidateQueries({ queryKey: ['action-items-entity', 'QUESTION_RESPONSE', questionInstanceId] })
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
  return (
    <Modal open={true} onClose={onClose} title="Flag question — internal finding">
      <div className="space-y-4 p-1">
        <p className="text-xs text-text-muted">Select the finding type. An internal action item will be created for tracking (not sent to vendor).</p>
        <div className="grid grid-cols-2 gap-2">
          {REVIEWER_FLAG_TYPES.map(ft => (
            <button key={ft.code} type="button" onClick={() => setSelected(ft.code)}
              className={cn('flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-xs transition-colors',
                selected === ft.code ? ft.bg + ' ' + ft.color + ' font-medium' : 'border-border text-text-secondary hover:border-brand-500/30')}>
              <span className="text-sm">{ft.icon}</span>{ft.label}
            </button>
          ))}
        </div>
        {selected && (
          <div>
            <label className="block text-xs text-text-muted mb-1">Additional context (optional)</label>
            <textarea value={description} onChange={e => setDesc(e.target.value)} rows={2}
              placeholder="Describe the specific concern…"
              className="w-full rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"/>
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" icon={Flag} disabled={!selected} loading={isPending} onClick={() => createItem()}>Flag question</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── AssignToAssistantInline (updated: uses reviewer-assign-v2) ──────────────

function AssignToAssistantInline({ question, assessmentId, onAssigned }) {
  const [search, setSearch] = useState('')
  const [show,   setShow]   = useState(false)
  const { data: usersData } = useOrgUsers(search)
  const users = usersData?.items || usersData?.data || []
  const qc = useQueryClient()

  const { mutate: assign, isPending } = useMutation({
    mutationFn: (userId) => reviewApi.reviewerAssignQuestionWithTask(assessmentId, question.questionInstanceId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviewer-my-sections-v2', assessmentId] })
      toast.success('Assigned — assistant inbox task created')
      setShow(false)
      onAssigned?.()
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
  const { mutate: unassign } = useMutation({
    mutationFn: () => assessmentsApi.vendor.reviewerUnassignQuestion(assessmentId, question.questionInstanceId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reviewer-my-sections-v2', assessmentId] }); toast.success('Unassigned') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })

  const isAssigned = !!question.reviewerAssignedUserId
  const assignedName = question.reviewerAssignedUserName || (question.reviewerAssignedUserId ? `User #${question.reviewerAssignedUserId}` : null)

  if (isAssigned && !show) return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-purple-500/8 border border-purple-500/20 text-[11px] text-purple-300">
        <Users size={10}/><span>{assignedName}</span>
      </div>
      <button onClick={() => unassign()} className="text-[10px] text-text-muted hover:text-red-400 transition-colors">remove</button>
    </div>
  )
  if (!show) return (
    <button onClick={() => setShow(true)} className="flex items-center gap-1 text-[11px] text-text-muted hover:text-purple-400 transition-colors mt-1.5">
      <UserPlus size={10}/> Assign to assistant (creates inbox task)
    </button>
  )
  return (
    <div className="mt-2 p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20 space-y-2">
      <p className="text-[10px] text-purple-300 font-medium">Assign to review assistant — inbox task created automatically</p>
      <input value={search} onChange={e => setSearch(e.target.value)} autoFocus
        placeholder="Search by name or email (min 2 chars)…"
        className="w-full rounded border border-border bg-surface-raised px-2.5 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none"/>
      <div className="flex flex-wrap gap-1.5">
        {users.map(u => {
          const uid = u.id || u.userId; const name = u.fullName || u.email
          return <button key={uid} type="button" disabled={isPending} onClick={() => assign(uid)}
            className="text-[11px] px-2.5 py-1 rounded-md border border-border text-text-secondary hover:border-purple-500/40 hover:text-purple-300 transition-colors">{name}</button>
        })}
      </div>
      <Button size="xs" variant="ghost" onClick={() => { setShow(false); setSearch('') }}>Cancel</Button>
    </div>
  )
}

// ─── ReviewerQuestionCard (updated: adds clarify + remediate buttons) ─────────

const TYPE_CONFIG = {
  SINGLE_CHOICE: { color: 'blue',   label: 'Single choice'   },
  MULTI_CHOICE:  { color: 'purple', label: 'Multiple choice' },
  TEXT:          { color: 'cyan',   label: 'Text'            },
  FILE_UPLOAD:   { color: 'amber',  label: 'File upload'     },
  NUMERIC:       { color: 'green',  label: 'Numeric'         },
  DATE:          { color: 'indigo', label: 'Date'            },
}

const EVAL_OPTIONS = [
  { value: 'PASS',    label: 'Pass',    Icon: ThumbsUp,   bg: 'bg-green-500/10 border-green-500/40 text-green-400' },
  { value: 'PARTIAL', label: 'Partial', Icon: Minus,      bg: 'bg-amber-500/10 border-amber-500/40 text-amber-400' },
  { value: 'FAIL',    label: 'Fail',    Icon: ThumbsDown, bg: 'bg-red-500/10   border-red-500/40   text-red-400'   },
]

function ReviewerQuestionCard({ question, assessmentId, taskId, evaluation, onEvaluate, canAct, sectionSubmitted }) {
  const resp = question.currentResponse
  const [showClarify,   setShowClarify]   = useState(false)
  const [showRemediate, setShowRemediate] = useState(false)
  const qc = useQueryClient()
  const tc = TYPE_CONFIG[question.responseType] || { label: question.responseType, color: 'gray' }

  const { mutate: persistEval } = useMutation({
    mutationFn: (verdict) => assessmentsApi.vendor.saveReviewerEval(assessmentId, question.questionInstanceId, verdict, taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviewer-my-sections-v2', assessmentId] }),
    onError: () => toast.error('Failed to save evaluation'),
  })

  const handleEval = (value) => { onEvaluate(question.questionInstanceId, value); persistEval(value) }

  return (
    <div data-qid={question.questionInstanceId}
      className={cn('py-3.5 border-b border-border last:border-0 rounded transition-all duration-500',
      evaluation === 'FAIL'    && 'bg-red-500/3',
      evaluation === 'PARTIAL' && 'bg-amber-500/3',
    )}>
      <div className="flex items-start gap-2 mb-2">
        <span className="text-xs font-mono text-text-muted pt-0.5 shrink-0 w-5">{question.orderNo}.</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap mb-1.5">
            <p className="text-sm text-text-primary flex-1">{question.questionText}</p>
            {question.mandatory && <span className="text-red-400 text-xs shrink-0">*</span>}
            {evaluation && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0',
                evaluation === 'PASS'    && 'bg-green-500/10 border-green-500/30 text-green-400',
                evaluation === 'PARTIAL' && 'bg-amber-500/10 border-amber-500/30 text-amber-400',
                evaluation === 'FAIL'    && 'bg-red-500/10   border-red-500/30   text-red-400',
              )}>{evaluation}</span>
            )}
          </div>

          <div className="flex items-center gap-2 mb-2 flex-wrap text-[10px] text-text-muted">
            <span className="px-1.5 py-0.5 rounded bg-surface-overlay border border-border">{tc.label}</span>
            {question.weight != null && <span>{question.weight} pts</span>}
            {question.reviewerAssignedUserId && (
              <span className="flex items-center gap-1 text-purple-300">
                <Users size={9}/> {question.reviewerAssignedUserName || `User #${question.reviewerAssignedUserId}`}
              </span>
            )}
          </div>

          {/* Answer display — handles all response types */}
          {resp ? (
            <div className="p-2.5 rounded-md bg-surface-overlay border border-border mb-2 space-y-1.5">
              {/* SINGLE_CHOICE / MULTI_CHOICE — render options with highlight */}
              {(question.responseType === 'SINGLE_CHOICE' || question.responseType === 'MULTI_CHOICE') && (
                <div className="flex flex-wrap gap-1.5">
                  {(question.options || []).length > 0 ? (question.options || []).map(o => {
                    const multiIds = (resp.selectedOptionInstanceIds || []).map(Number)
                    const sel = multiIds.length > 0
                      ? multiIds.includes(Number(o.optionInstanceId))
                      : Number(o.optionInstanceId) === Number(resp.selectedOptionInstanceId)
                    return (
                      <span key={o.optionInstanceId}
                        className={cn('text-xs px-2.5 py-1 rounded border transition-colors',
                          sel ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 font-medium'
                              : 'border-border text-text-muted opacity-40')}>
                        {o.optionValue}
                      </span>
                    )
                  }) : (
                    /* Fallback: responseText contains raw IDs when options not loaded */
                    resp.responseText && <p className="text-xs text-text-secondary">{resp.responseText}</p>
                  )}
                </div>
              )}
              {/* TEXT / NUMERIC / DATE — plain text */}
              {(question.responseType === 'TEXT' || question.responseType === 'NUMERIC' || question.responseType === 'DATE') && (
                resp.responseText
                  ? <p className="text-xs text-text-secondary leading-relaxed">{resp.responseText}</p>
                  : <p className="text-xs text-text-muted italic">No text entered</p>
              )}
              {/* FILE_UPLOAD — indicate file was submitted */}
              {question.responseType === 'FILE_UPLOAD' && (
                resp.responseText
                  ? <p className="text-xs text-brand-400 flex items-center gap-1">
                      <FileText size={11}/> {resp.responseText}
                    </p>
                  : <p className="text-xs text-text-muted italic">File uploaded</p>
              )}
              {/* Submitted by */}
              {resp.submittedAt && (
                <p className="text-[10px] text-text-muted">
                  Submitted {formatDate(resp.submittedAt)}
                  {resp.answeredByName && ` by ${resp.answeredByName}`}
                </p>
              )}
            </div>
          ) : (
            <div className="p-2 rounded-md bg-red-500/5 border border-red-500/15 mb-2 text-[11px] text-red-400">No response — auto-FAIL</div>
          )}

          {/* Assistant evaluation note — shown when question is assigned to assistant */}
          {question.reviewerAssignedUserId && resp?.reviewerStatus && resp.reviewerStatus !== 'PENDING' && (
            <div className="flex items-center gap-2 mb-1.5 text-[11px] text-purple-300">
              <Users size={10}/>
              <span>
                {question.reviewerAssignedUserName || 'Assistant'} evaluated:
                <span className={cn('ml-1 font-medium',
                  resp.reviewerStatus === 'PASS'    && 'text-green-400',
                  resp.reviewerStatus === 'PARTIAL' && 'text-amber-400',
                  resp.reviewerStatus === 'FAIL'    && 'text-red-400',
                )}>{resp.reviewerStatus}</span>
              </span>
              <span className="text-text-muted opacity-60">— reviewer can override below</span>
            </div>
          )}

          {/* Eval buttons */}
          {canAct && !sectionSubmitted && (
            <div className="flex gap-1.5 mb-2">
              {EVAL_OPTIONS.map(({ value, label, Icon, bg }) => (
                <button key={value} type="button" onClick={() => handleEval(value)}
                  className={cn('flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[11px] font-medium transition-colors',
                    evaluation === value ? bg : 'border-border text-text-muted hover:border-brand-500/30')}>
                  <Icon size={11}/>{label}
                </button>
              ))}
            </div>
          )}

          {/* Remediation / clarification status banners */}
          <RemediationActionBanner questionInstanceId={question.questionInstanceId} assessmentId={assessmentId}/>

          {/* Action buttons row */}
          {canAct && !sectionSubmitted && (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {/* Assign to assistant */}
              <AssignToAssistantInline question={question} assessmentId={assessmentId}/>
              {/* Flag finding removed — use "Vendor remediation" for tracked issues */}
              {/* Clarify with assistant — only if assistant assigned */}
              {question.reviewerAssignedUserId && (
                <button onClick={() => setShowClarify(true)}
                  className="flex items-center gap-1 text-[11px] text-text-muted hover:text-purple-400 transition-colors">
                  <CornerDownLeft size={10}/> Clarify with assistant
                </button>
              )}
              {/* Request vendor remediation */}
              <button onClick={() => setShowRemediate(true)}
                className="flex items-center gap-1 text-[11px] text-text-muted hover:text-red-400 transition-colors">
                <Flag size={10}/> Vendor remediation
              </button>
            </div>
          )}

          <CommentBox questionInstanceId={question.questionInstanceId}/>
        </div>
      </div>

      {showClarify   && <ClarificationModal   questionText={question.questionText} questionInstanceId={question.questionInstanceId} assessmentId={assessmentId} onClose={() => setShowClarify(false)}/>}
      {showRemediate && <RemediationModal     questionText={question.questionText} questionInstanceId={question.questionInstanceId} assessmentId={assessmentId} onClose={() => setShowRemediate(false)}/>}
    </div>
  )
}

// ─── ReviewerSectionAccordion (updated: per-section submit button) ────────────

function ReviewerSectionAccordion({ section, assessmentId, taskId, evaluations, onEvaluate, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const questions       = section.questions || []
  const evaluated       = questions.filter(q => !!evaluations[q.questionInstanceId]).length
  const answered        = questions.filter(q => !!q.currentResponse).length
  const unanswered      = questions.length - answered
  const isSubmitted     = !!section.reviewerSubmittedAt
  const qc              = useQueryClient()

  const { mutate: submitSection, isPending: submitting } = useMutation({
    mutationFn: () => reviewApi.reviewerSubmitSection(assessmentId, section.sectionInstanceId, taskId ? parseInt(taskId) : null),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['reviewer-my-sections-v2', assessmentId] })
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      const r = data?.data || data
      if (r?.openRemediations > 0) {
        toast.success(`Section submitted — ${r.openRemediations} open remediation(s) still tracked`)
      } else {
        toast.success('Section submitted')
      }
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed to submit section'),
  })

  const allEvaluated = evaluated >= questions.length && questions.length > 0

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-overlay/40 transition-colors">
        <div className="flex items-center gap-2.5 flex-wrap">
          <FileText size={14} className="text-text-muted shrink-0"/>
          <span className="text-sm font-medium text-text-primary">{section.sectionName}</span>
          <span className="text-xs text-text-muted">{answered}/{questions.length} answered</span>
          {unanswered > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{unanswered} auto-FAIL</span>
          )}
          {evaluated > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">{evaluated}/{questions.length} evaluated</span>
          )}
          {isSubmitted && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
              <CheckCircle2 size={9}/> Submitted
            </span>
          )}
        </div>
        {open ? <ChevronDown size={13} className="text-text-muted shrink-0"/> : <ChevronRight size={13} className="text-text-muted shrink-0"/>}
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="px-5">
            {questions.map(q => (
              <ReviewerQuestionCard
                key={q.questionInstanceId}
                question={q}
                assessmentId={assessmentId}
                taskId={taskId}
                evaluation={evaluations[q.questionInstanceId]}
                onEvaluate={onEvaluate}
                canAct={true}
                sectionSubmitted={isSubmitted}
              />
            ))}
          </div>

          {/* Per-section submit — mirrors responder submitSection */}
          {!isSubmitted && (
            <div className="px-5 py-3 border-t border-border bg-surface-overlay/30 space-y-1">
              <Button variant="primary" size="sm" onClick={() => submitSection()}
                loading={submitting} disabled={!allEvaluated} className="w-full">
                {allEvaluated
                  ? `Submit section review`
                  : `Evaluate ${questions.length - evaluated} more question(s) to submit`}
              </Button>
              <p className="text-[10px] text-text-muted text-center">
                Open remediation items are tracked separately — they don't block section submission.
              </p>
            </div>
          )}
          {isSubmitted && section.reviewerSubmittedAt && (
            <div className="px-5 py-2 border-t border-border bg-green-500/3">
              <p className="text-[11px] text-green-400 flex items-center gap-1.5">
                <CheckCircle2 size={11}/>Submitted {formatDate(section.reviewerSubmittedAt)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── PANEL 0: AssignOrgCisoPanel (unchanged) ─────────────────────────────────
// (keep existing implementation from original AssessmentReviewPage)

// ─── PANEL 1: AssignReviewersPanel (updated: uses reviewerAssignSection) ─────

function AssignReviewersPanel({ assessment, taskId, onDone }) {
  const id = assessment?.assessmentId
  const [assignments, setAssignments] = useState({})
  const [search, setSearch] = useState('')
  const { data: usersData } = useOrgUsers(search)
  const users = usersData?.items || usersData?.data || []
  const qc = useQueryClient()

  const { mutate: assignSection } = useMutation({
    // NEW: uses reviewerAssignSection (writes reviewerAssignedUserId, not assignedUserId)
    mutationFn: ({ sectionInstanceId, userId }) =>
      reviewApi.reviewerAssignSection(id, sectionInstanceId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-review', id] }),
    onError: () => toast.error('Assignment failed'),
  })

  const { mutate: confirm, isPending } = useMutation({
    mutationFn: () => assessmentsApi.vendor.confirmReviewerAssignment(id, parseInt(taskId)),
    onSuccess: () => { toast.success('Reviewer assignments confirmed'); onDone?.() },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })

  const sections = assessment?.sections || []
  const allAssigned = sections.length > 0 && sections.every(s => assignments[s.sectionInstanceId])

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">Assign each section to a reviewer. Reviewers will see only their assigned sections and can further assign questions to review assistants.</p>
      <div className="rounded-md border border-border bg-surface-raised px-3 py-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search reviewers by name or email (min 2 chars)…"
          className="w-full text-sm bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none"/>
      </div>
      {sections.map(sec => (
        <div key={sec.sectionInstanceId} className="rounded-md border border-border overflow-hidden">
          <div className="px-4 py-3 bg-surface-overlay flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">{sec.sectionName}</p>
              <p className="text-xs text-text-muted">{sec.questions?.length || 0} questions</p>
            </div>
            {assignments[sec.sectionInstanceId] && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <CheckCircle2 size={11}/> {assignments[sec.sectionInstanceId].name}
              </span>
            )}
          </div>
          <div className="px-4 py-2">
            {users.length === 0 && search.length < 2 && <p className="text-xs text-text-muted italic">Type at least 2 chars to search</p>}
            <div className="flex flex-wrap gap-1.5">
              {users.map(u => {
                const uid = u.id || u.userId; const selected = assignments[sec.sectionInstanceId]?.id === uid
                return (
                  <button key={uid} type="button"
                    onClick={() => {
                      setAssignments(a => ({ ...a, [sec.sectionInstanceId]: { id: uid, name: u.fullName || u.email } }))
                      assignSection({ sectionInstanceId: sec.sectionInstanceId, userId: uid })
                    }}
                    className={cn('text-xs px-2.5 py-1 rounded-md border transition-colors',
                      selected ? 'bg-brand-500/15 border-brand-500/40 text-brand-400' : 'border-border text-text-secondary hover:border-brand-500/30')}>
                    {u.fullName || u.email}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ))}
      <Button variant="primary" onClick={confirm} loading={isPending} disabled={!allAssigned} className="w-full">
        {allAssigned ? 'Confirm all reviewer assignments' : `Assign ${sections.filter(s => !assignments[s.sectionInstanceId]).length} remaining section(s)`}
      </Button>
    </div>
  )
}

// ─── PANEL 2: EvaluateQuestionsPanel (updated: useMyReviewerSections, per-section submit) ──

const RISK_RATINGS = [
  { value: 'LOW',      color: 'bg-green-500/10 border-green-500/40 text-green-400'   },
  { value: 'MEDIUM',   color: 'bg-amber-500/10 border-amber-500/40 text-amber-400'  },
  { value: 'HIGH',     color: 'bg-orange-500/10 border-orange-500/40 text-orange-400'},
  { value: 'CRITICAL', color: 'bg-red-500/10   border-red-500/40   text-red-400'    },
]

function EvaluateQuestionsPanel({ assessment, taskId, activeTask, onDone, targetQId }) {
  const id         = assessment?.assessmentId
  const isCISOStep = isCISOApprovalStep(activeTask?.actorRoleName, activeTask?.resolvedStepAction)
  const qc         = useQueryClient()

  // CHANGED: uses useMyReviewerSections (reviewerAssignedUserId) instead of useMySections (assignedUserId)
  const { data: mySections = [], isLoading: sectionsLoading } = useMyReviewerSections(id, taskId, !isCISOStep)

  const [evaluations, setEvaluations] = useState({})
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    if (!seeded && mySections.length > 0) {
      const seed = {}
      mySections.forEach(sec => {
        (sec.questions || []).forEach(q => {
          const rv = q.currentResponse?.reviewerStatus
          if (rv && rv !== 'PENDING') seed[q.questionInstanceId] = rv
          else if (!q.currentResponse) seed[q.questionInstanceId] = 'FAIL'
        })
      })
      setEvaluations(seed)
      setSeeded(true)
      // Persist auto-FAILs
      const autoFails = Object.entries(seed).filter(([,v]) => v === 'FAIL')
      if (autoFails.length > 0 && id) {
        const allQs = mySections.flatMap(s => s.questions || [])
        autoFails.forEach(([qiId]) => {
          const q = allQs.find(q => String(q.questionInstanceId) === String(qiId))
          if (q && !q.currentResponse) assessmentsApi.vendor.saveReviewerEval(id, Number(qiId), 'FAIL').catch(() => {})
        })
      }
    }
  }, [mySections, seeded, id])

  const handleEvaluate = (qiId, value) => setEvaluations(prev => ({ ...prev, [qiId]: value }))

  const allQs      = mySections.flatMap(s => s.questions || [])
  const unanswered = allQs.filter(q => !q.currentResponse).length

  // ── CISO view (unchanged) ─────────────────────────────────────────────────
  if (isCISOStep) {
    const secs = assessment?.sections || []
    const totalEarned   = assessment?.progress?.totalEarnedScore || 0
    const totalPossible = secs.flatMap(s => s.questions || []).reduce((a, q) => a + (q.weight || 1), 0)
    const pct = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0

    // Auto-suggest risk rating based on compliance score
    // CISO can override — suggestion is just a starting point
    const suggestRating = (score) => {
      if (score >= 80) return 'LOW'
      if (score >= 60) return 'MEDIUM'
      if (score >= 40) return 'HIGH'
      return 'CRITICAL'
    }
    const suggested = suggestRating(pct)

    const [riskRating, setRiskRating] = useState(suggested)
    const [submitting, setSubmitting] = useState(false)

    // Single submit: save rating + approve in sequence
    const handleApprove = async () => {
      if (!riskRating) { toast.error('Please select a risk rating'); return }
      setSubmitting(true)
      try {
        await assessmentsApi.vendor.assignRiskRating(id, parseInt(taskId), riskRating)
        await assessmentsApi.vendor.cisoApprove(id, parseInt(taskId))
        toast.success(`Assessment approved — Risk: ${riskRating}`)
        onDone?.()
      } catch (e) {
        toast.error(e?.response?.data?.error?.message || 'Failed to approve')
      } finally {
        setSubmitting(false)
      }
    }

    return (
      <div className="space-y-4">
        {/* Compliance score hidden until option scoring is configured */}

        {/* Risk rating — auto-suggested, CISO can override */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-text-primary">Assign overall risk rating</p>
            {suggested && (
              <span className="text-[10px] text-text-muted bg-surface-overlay px-2 py-0.5 rounded">
                Suggested: <strong className={cn(
                  suggested === 'LOW' ? 'text-green-400' :
                  suggested === 'MEDIUM' ? 'text-amber-400' :
                  suggested === 'HIGH' ? 'text-orange-400' : 'text-red-400'
                )}>{suggested}</strong> based on score
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {RISK_RATINGS.map(r => (
              <button key={r.value} type="button"
                onClick={() => setRiskRating(r.value)}
                className={cn('py-2 rounded-md border text-xs font-medium transition-colors relative',
                  riskRating === r.value ? r.color : 'border-border text-text-muted hover:border-brand-500/30')}>
                {r.value}
                {r.value === suggested && riskRating !== r.value && (
                  <span className="absolute -top-1.5 -right-1.5 text-[8px] bg-brand-500 text-white rounded-full w-3 h-3 flex items-center justify-center">✓</span>
                )}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-text-muted mt-1.5">
            Auto-suggested from score. Override if needed based on findings and context.
          </p>
        </div>

        <Button variant="primary" icon={CheckCircle2}
          onClick={handleApprove}
          loading={submitting}
          disabled={!riskRating}
          className="w-full">
          Approve consolidated review
        </Button>
      </div>
    )
  }

  if (sectionsLoading) return <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-text-muted"/></div>

  // mySections is populated by the backend's smart fallback:
  //   - If sections are explicitly assigned to this reviewer → returns only those.
  //   - If none assigned but reviewer has an active EVALUATE task → returns ALL sections.
  //   - If neither → returns empty (not a reviewer for this assessment).
  // So empty here genuinely means "not your assessment to review."
  if (mySections.length === 0) return (
    <div className="py-8 text-center">
      <Eye size={28} className="text-text-muted mx-auto mb-2"/>
      <p className="text-sm text-text-muted">No sections assigned to you yet.</p>
      <p className="text-xs text-text-muted mt-1">The Org CISO will assign sections to you before you can evaluate.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-text-muted px-0.5">
        <span>{mySections.length} section(s) assigned to you</span>
        <div className="flex items-center gap-2">
          {unanswered > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400">{unanswered} auto-FAIL</span>
          )}
          <span className="font-medium text-text-muted">{Object.keys(evaluations).length}/{allQs.length} evaluated</span>
        </div>
      </div>
      {mySections.map((section, idx) => {
        // Auto-open section containing the target question from URL param
        const containsTarget = targetQId
          ? (section.questions || []).some(q => String(q.questionInstanceId) === String(targetQId))
          : false
        return (
          <ReviewerSectionAccordion
            key={section.sectionInstanceId}
            section={section}
            assessmentId={id}
            taskId={taskId}
            evaluations={evaluations}
            onEvaluate={handleEvaluate}
            defaultOpen={idx === 0 || containsTarget}
          />
        )
      })}
    </div>
  )
}

// ─── PANEL 3: ConsolidateFindingsPanel (unchanged) ───────────────────────────
// (keep existing implementation from original AssessmentReviewPage)
function ConsolidateFindingsPanel({ assessment, taskId, onDone }) {
  const id = assessment?.assessmentId
  const [findings, setFindings] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const secs = assessment?.sections || []
  const totalQs = secs.flatMap(s => s.questions || []).length
  const answeredQs = secs.flatMap(s => s.questions || []).filter(q => q.currentResponse).length
  const score = assessment?.progress?.totalEarnedScore || 0

  // Submit in sequence: consolidate scores → document findings → task auto-approves
  const handleSubmit = async () => {
    if (!findings.trim()) { toast.error('Please document your findings before submitting'); return }
    setSubmitting(true)
    try {
      await assessmentsApi.vendor.consolidateScores(id, parseInt(taskId))
      await assessmentsApi.vendor.documentFindings(id, parseInt(taskId), findings)
      toast.success('Consolidated findings submitted')
      onDone?.()
    } catch (e) {
      toast.error(e?.response?.data?.error?.message || 'Failed to submit findings')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Questions answered', value: `${answeredQs}/${totalQs}` },
          { label: 'Sections',           value: secs.length },
          { label: 'Total score',        value: score.toFixed(1) },
        ].map(s => (
          <div key={s.label} className="rounded-md border border-border p-3 text-center">
            <p className="text-lg font-semibold text-text-primary">{s.value}</p>
            <p className="text-xs text-text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Consolidated findings *
        </label>
        <textarea
          value={findings}
          onChange={e => setFindings(e.target.value)}
          rows={6}
          placeholder="Document key findings, risk observations, deficiencies, and recommendations…"
          className="w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
        />
        <p className="text-[11px] text-text-muted">
          Submitting will consolidate all section scores and document your findings.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          icon={Send}
          onClick={handleSubmit}
          loading={submitting}
          disabled={!findings.trim()}
          className="flex-1">
          Submit consolidated findings
        </Button>
        <Button
          variant="secondary"
          icon={RefreshCw}
          onClick={async () => {
            try {
              await assessmentsApi.vendor.consolidateScores(id, parseInt(taskId))
              toast.success('Scores recalculated')
            } catch (e) {
              toast.error('Failed to recalculate')
            }
          }}
          title="Recalculate scores">
          Recalculate
        </Button>
      </div>
    </div>
  )
}

// ─── PANEL 4: FinalSignOffPanel ──────────────────────────────────────────────
function FinalSignOffPanel({ assessment, taskId, onApprove, onSendBack, acting }) {
  const [remarks, setRemarks] = useState('')
  const riskRating   = assessment?.riskRating
  const openRemed    = assessment?.openRemediationCount ?? 0
  const secs         = assessment?.sections || []

  const RISK_COLOR = {
    LOW:      'text-green-400  bg-green-500/10  border-green-500/25',
    MEDIUM:   'text-amber-400  bg-amber-500/10  border-amber-500/25',
    HIGH:     'text-orange-400 bg-orange-500/10 border-orange-500/25',
    CRITICAL: 'text-red-400    bg-red-500/10    border-red-500/25',
  }

  return (
    <div className="space-y-4">
      {/* Summary before final sign-off */}
      <div className="rounded-lg border border-border bg-surface-raised overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Assessment summary</p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Risk Rating</p>
            {riskRating
              ? <span className={cn('text-xs font-bold px-2.5 py-1 rounded border uppercase', RISK_COLOR[riskRating] || 'border-border text-text-muted')}>{riskRating}</span>
              : <span className="text-xs text-text-muted italic">Not rated</span>}
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Open Remediations</p>
            <p className={cn('text-lg font-semibold', openRemed > 0 ? 'text-amber-400' : 'text-green-400')}>{openRemed}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Sections reviewed</p>
            <p className="text-lg font-semibold text-text-primary">{secs.length}</p>
          </div>
        </div>
      </div>

      {openRemed > 0 && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/6 border border-amber-500/20 text-[11px] text-amber-400">
          <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
          <span>{openRemed} open remediation item{openRemed !== 1 ? 's' : ''} — sign-off is non-blocking but these should be tracked.</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Remarks (optional)</label>
        <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3}
          placeholder="Add any final sign-off remarks…"
          className="w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"/>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" icon={CornerDownLeft} onClick={() => onSendBack(remarks)} loading={acting} className="flex-1">Send back</Button>
        <Button variant="primary" icon={CheckCircle2} onClick={() => onApprove(remarks)} loading={acting} className="flex-1">Final sign-off</Button>
      </div>
    </div>
  )
}

// ─── AssignOrgCisoPanel (unchanged from original) ────────────────────────────
function AssignOrgCisoPanel({ assessment, taskId, onDone }) {
  const id = assessment?.assessmentId
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const { data: usersData } = useOrgUsers(search)
  const users = usersData?.items || usersData?.data || []
  const qc = useQueryClient()
  const { mutate: confirm, isPending } = useMutation({
    mutationFn: () => assessmentsApi.vendor.assignOrgCiso(id, parseInt(taskId)),
    onSuccess: () => { toast.success('Org CISO assigned'); qc.invalidateQueries({ queryKey: ['my-tasks'] }); onDone?.() },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">Select the Org CISO who will lead the review.</p>
      <div className="rounded-md border border-border bg-surface-raised px-3 py-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email (min 2 chars)…"
          className="w-full text-sm bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none"/>
      </div>
      <div className="flex flex-wrap gap-2">
        {users.map(u => {
          const uid = u.id || u.userId; const name = u.fullName || u.email
          return (
            <button key={uid} type="button" onClick={() => setSelected({ id: uid, name })}
              className={cn('text-xs px-3 py-1.5 rounded-md border transition-colors',
                selected?.id === uid ? 'bg-brand-500/15 border-brand-500/40 text-brand-400 font-medium' : 'border-border text-text-secondary hover:border-brand-500/30')}>
              {name}
            </button>
          )
        })}
      </div>
      {selected && <div className="flex items-center gap-2 p-2.5 rounded-md bg-green-500/5 border border-green-500/20"><CheckCircle2 size={13} className="text-green-400"/><span className="text-xs text-green-400">{selected.name} selected</span></div>}
      <Button variant="primary" onClick={confirm} loading={isPending} disabled={!selected} className="w-full">Confirm Org CISO assignment</Button>
    </div>
  )
}

// ─── ReportVersionPanel ───────────────────────────────────────────────────────

function ReportVersionPanel({ assessmentId, assessment }) {
  const { data: reports = [], isLoading } = useReportVersions(assessmentId)
  const qc = useQueryClient()
  const { mutate: generate, isPending: generating } = useMutation({
    mutationFn: (remarks) => reviewApi.generateReport(assessmentId, remarks),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-versions', assessmentId] }); toast.success('New report version generated') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })

  // Compute summary from live assessment data (always available, even before PDF is generated)
  const secs        = assessment?.sections || []
  const totalPoss   = secs.flatMap(s => s.questions || []).reduce((a, q) => a + (q.weight || 1), 0)
  const totalEarned = assessment?.progress?.totalEarnedScore || 0
  const pct         = totalPoss > 0 ? Math.round((totalEarned / totalPoss) * 100) : 0
  const riskRating  = assessment?.riskRating || null
  const openRemed   = assessment?.openRemediationCount || 0

  const RISK_COLOR = {
    LOW:      'text-green-400 bg-green-500/10 border-green-500/20',
    MEDIUM:   'text-amber-400 bg-amber-500/10 border-amber-500/20',
    HIGH:     'text-orange-400 bg-orange-500/10 border-orange-500/20',
    CRITICAL: 'text-red-400   bg-red-500/10   border-red-500/20',
  }

  if (isLoading) return <div className="py-4 flex justify-center"><Loader2 size={14} className="animate-spin text-text-muted"/></div>

  return (
    <div className="space-y-4">
      {/* Live assessment summary — always shown so CISO can review before sign-off */}
      <div className="rounded-lg border border-border bg-surface-raised overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-text-primary">Assessment summary</p>
          <span className="text-[10px] text-text-muted">Live data</span>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border">
          {/* Compliance score — hidden until scoring is configured
          <div className="bg-surface-raised px-4 py-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Compliance score</p>
            <div className="flex items-baseline gap-1.5">
              <span className={cn('text-2xl font-bold',
                pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400')}>
                {pct}%
              </span>
              <span className="text-xs text-text-muted">{totalEarned.toFixed(1)} / {totalPoss} pts</span>
            </div>
          </div> */}
          {/* Risk rating */}
          <div className="bg-surface-raised px-4 py-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Risk rating</p>
            {riskRating
              ? <span className={cn('inline-block mt-1 text-sm font-bold px-3 py-1 rounded border uppercase',
                  RISK_COLOR[riskRating] || 'text-text-secondary border-border')}>{riskRating}</span>
              : <span className="text-sm text-text-muted italic">Not yet assigned</span>
            }
          </div>
          {/* Open items */}
          <div className="bg-surface-raised px-4 py-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Open remediations</p>
            <p className={cn('text-xl font-semibold mt-0.5',
              openRemed > 0 ? 'text-amber-400' : 'text-green-400')}>
              {openRemed}
              <span className="text-xs font-normal text-text-muted ml-1">{openRemed === 0 ? 'All clear' : 'pending'}</span>
            </p>
          </div>
          {/* Status */}
          <div className="bg-surface-raised px-4 py-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Assessment status</p>
            <p className="text-sm font-medium text-text-primary mt-0.5 capitalize">
              {assessment?.status?.toLowerCase().replace('_', ' ') || '—'}
            </p>
          </div>
        </div>
      </div>

      {/* PDF report versions — shown when real PDFs exist */}
      {reports.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-primary">{reports.length} PDF report version{reports.length !== 1 ? 's' : ''}</p>
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => generate('')} loading={generating}>Re-generate</Button>
          </div>
          {reports.map(r => (
            <div key={r.reportId} className="rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-mono bg-surface px-2 py-0.5 rounded border border-border text-text-secondary">v{r.reportVersion}</span>
                  <div>
                    <p className="text-xs font-medium text-text-primary">
                      {r.triggerEvent === 'INITIAL' ? 'Initial report' : r.triggerEvent === 'REMEDIATION_CLOSED' ? 'Post-remediation' : 'Manual'}
                    </p>
                    <p className="text-[10px] text-text-muted">{formatDate(r.generatedAt)} · {r.generatedByName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs font-medium text-text-primary">{r.compliancePct?.toFixed(1)}%</p>
                    <p className="text-[10px] text-text-muted">{r.riskRating || '—'}</p>
                  </div>
                  {r.openRemediationCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">{r.openRemediationCount} open</span>
                  )}
                  {r.downloadUrl
                    ? <a href={r.downloadUrl} target="_blank" rel="noopener noreferrer"><Button size="xs" variant="ghost" icon={Download}>PDF</Button></a>
                    : <Button size="xs" variant="ghost" icon={Download} disabled>PDF pending</Button>
                  }
                </div>
              </div>
              {r.remarks && <div className="px-4 py-2 border-t border-border text-[10px] text-text-muted bg-surface-overlay/30">{r.remarks}</div>}
            </div>
          ))}
        </div>
      )}

      {/* PDF versions appear here once a PDF generator is wired into GenerateAssessmentReportAction */}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AssessmentReviewPage() {
  const { id }         = useParams()
  const navigate       = useNavigate()
  const [urlParams]    = useSearchParams()
  const targetQId      = urlParams.get('questionInstanceId')
  const isReadonly     = urlParams.get('readonly') === '1'
  const qc             = useQueryClient()

  const { data: myTasks = [], isLoading: tasksLoading } = useMyTasks({})

  // FIX: match by artifactId (= assessmentId, the value in the URL) NOT entityId (= vendorId).
  // entityId on a VENDOR workflow task is the vendor's ID, not the assessment ID.
  // artifactId is resolved by VendorAssessmentEntityResolver → VendorAssessment.id.
  const isActiveStatus = (s) => s === 'PENDING' || s === 'IN_PROGRESS'
  // readonly=1: skip task resolution so read-only APPROVE panel always shows
  // (used when navigating from Reports page to avoid showing active sign-off panel)
  const actorTask  = isReadonly ? null : (myTasks.find(t =>
    isActiveStatus(t.status) &&
    String(t.artifactId) === String(id) &&
    t.taskRole === 'ACTOR'
  ) || null)
  const assignerTask = isReadonly ? null : (myTasks.find(t =>
    isActiveStatus(t.status) &&
    String(t.artifactId) === String(id) &&
    t.taskRole === 'ASSIGNER'
  ) || null)
  const activeTask = actorTask || assignerTask

  // Prefer live-resolved taskId from inbox; fall back to URL param
  const taskId      = activeTask?.id ? String(activeTask.id) : urlParams.get('taskId')
  const stepAction  = actorTask?.resolvedStepAction || 'APPROVE'
  const panelConfig = resolveOrgPanel(actorTask?.actorRoleName, stepAction)

  const { data: assessment, isLoading } = useAssessment(id)
  const { data: sections = [] }         = useCompoundTaskProgress(taskId ? Number(taskId) : null)

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

  const [actionModal, setActionModal]   = useState(null)
  const [modalRemarks, setModalRemarks] = useState('')
  const [showReports, setShowReports]   = useState(false)
  // Accordion open/close for the read-only APPROVE/observer panel
  const [openSections, setOpenSections] = useState({})
  const toggleSection = (key) => setOpenSections(s => ({ ...s, [key]: !s[key] }))

  const { mutate: performAction, isPending: acting } = useMutation({
    mutationFn: (data) => workflowsApi.tasks.action(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-tasks'] }); toast.success('Action submitted'); navigate('/workflow/inbox') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Action failed'),
  })

  const doAction = (type, remarks) => {
    if (!taskId) { toast.error('Open from your task inbox'); return }
    performAction({ taskInstanceId: parseInt(taskId), actionType: type, remarks })
  }

  const onPanelDone = () => {
    qc.invalidateQueries({ queryKey: ['my-tasks'] })
    qc.invalidateQueries({ queryKey: ['compound-progress', taskId ? Number(taskId) : null] })
    toast.success('Section complete')
  }

  if (isLoading || tasksLoading) return <div className="flex items-center justify-center min-h-screen"><Loader2 size={24} className="animate-spin text-text-muted"/></div>
  if (!assessment) return <div className="p-6 text-center text-text-muted text-sm">Assessment not found.</div>

  const canAct = !!actorTask && !!taskId
  const isCompleted = assessment.status === 'COMPLETED'

  return (
    <div className="min-h-screen bg-background-tertiary">
      {/* Header */}
      <div className="bg-surface border-b border-border px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-text-muted hover:text-text-primary transition-colors"><ArrowLeft size={18}/></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base font-semibold text-text-primary truncate">{panelConfig.title} — {assessment.templateName || 'Assessment'}</h1>
            {sections.length > 0 && <CompoundTaskBadge sections={sections}/>}
            {isCompleted && <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400 font-medium">COMPLETED</span>}
          </div>
          <p className="text-xs text-text-muted">
            {assessment.vendorName}
            {taskId && <> · Task #{taskId}</>}
            {assessment.openRemediationCount > 0 && <span className="ml-2 text-amber-400">{assessment.openRemediationCount} open remediation(s)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Report summary — always visible to org users so CISO can review before sign-off */}
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => setShowReports(s => !s)}>
            {showReports ? 'Hide report' : 'Assessment report'}
          </Button>
          {canAct && panelConfig.panel === 'APPROVE' && (
            <>
              <Button size="sm" variant="ghost" icon={CornerDownLeft} onClick={() => { setModalRemarks(''); setActionModal('send_back') }}>Send back</Button>
              <Button size="sm" variant="danger" icon={XCircle} onClick={() => { setModalRemarks(''); setActionModal('reject') }}>Reject</Button>
              <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => { setModalRemarks(''); setActionModal('approve') }}>Approve</Button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {sections.length > 0 && <CompoundTaskProgress sections={sections}/>}

        {/* Report versions panel */}
        {showReports && (
          <Card><CardHeader title="Assessment report"/><CardBody><ReportVersionPanel assessmentId={id} assessment={assessment}/></CardBody></Card>
        )}

        {/* Step panel */}
        {canAct && panelConfig.panel !== 'APPROVE' && (
          <Card>
            <CardHeader title={panelConfig.title}/>
            <CardBody>
              {panelConfig.panel === 'ASSIGN_CISO'     && <AssignOrgCisoPanel    assessment={assessment} taskId={taskId} onDone={onPanelDone}/>}
              {panelConfig.panel === 'ASSIGN_SECTIONS' && <AssignReviewersPanel  assessment={assessment} taskId={taskId} onDone={onPanelDone}/>}
              {(panelConfig.panel === 'EVALUATE' || panelConfig.panel === 'CISO_APPROVE') && (
                <EvaluateQuestionsPanel assessment={assessment} taskId={taskId} activeTask={actorTask} onDone={onPanelDone} targetQId={targetQId}/>
              )}
              {panelConfig.panel === 'REVIEW'      && <ConsolidateFindingsPanel assessment={assessment} taskId={taskId} onDone={onPanelDone}/>}
              {panelConfig.panel === 'ACKNOWLEDGE' && (
                <FinalSignOffPanel assessment={assessment} taskId={taskId} acting={acting}
                  onApprove={(r) => doAction('APPROVE', r)} onSendBack={(r) => doAction('SEND_BACK', r)}/>
              )}
            </CardBody>
          </Card>
        )}

        {/* Read-only assessment view for APPROVE / observer steps — collapsible */}
        {panelConfig.panel === 'APPROVE' && (assessment.sections || []).map((sec, i) => {
          const secKey = sec.sectionInstanceId ?? i
          const isOpen = openSections[secKey] !== false  // default open
          const answered = (sec.questions || []).filter(q => q.currentResponse).length
          const total    = (sec.questions || []).length
          return (
            <div key={secKey} className="bg-surface rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => toggleSection(secKey)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-overlay/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText size={14} className="text-text-muted flex-shrink-0"/>
                  <div className="text-left">
                    <p className="text-sm font-medium text-text-primary">{sec.sectionName}</p>
                    <p className="text-xs text-text-muted mt-0.5">{answered}/{total} answered</p>
                  </div>
                </div>
                {isOpen
                  ? <ChevronDown size={14} className="text-text-muted flex-shrink-0"/>
                  : <ChevronRight size={14} className="text-text-muted flex-shrink-0"/>}
              </button>
              {isOpen && (
                <div className="border-t border-border px-5 divide-y divide-border">
                  {(sec.questions || []).map(q => {
                    const resp = q.currentResponse
                    const multiIds = (resp?.selectedOptionInstanceIds?.length
                      ? resp.selectedOptionInstanceIds : []).map(Number)
                    return (
                      <div key={q.questionInstanceId} data-qid={q.questionInstanceId}
                        className="py-3.5 rounded transition-all duration-500">
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-mono text-text-muted pt-0.5 flex-shrink-0 w-5">{q.orderNo}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text-primary mb-1.5">{q.questionText}</p>
                            {resp ? (
                              <div className="space-y-1">
                                {resp.responseText && !resp.responseText.startsWith('[') && (
                                  <div className="px-3 py-2 rounded-md bg-surface-overlay border border-border">
                                    <p className="text-xs text-text-secondary leading-relaxed">{resp.responseText}</p>
                                  </div>
                                )}
                                {(resp.selectedOptionInstanceId || multiIds.length > 0) && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {(q.options || []).map(o => {
                                      const sel = multiIds.length
                                        ? multiIds.includes(Number(o.optionInstanceId))
                                        : Number(o.optionInstanceId) === Number(resp.selectedOptionInstanceId)
                                      return (
                                        <span key={o.optionInstanceId}
                                          className={cn('text-xs px-2.5 py-1 rounded border',
                                            sel ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 font-medium'
                                                : 'border-border text-text-muted opacity-40')}>
                                          {o.optionValue}
                                        </span>
                                      )
                                    })}
                                  </div>
                                )}
                                {resp.answeredByName && (
                                  <p className="text-[10px] text-text-muted">Answered by {resp.answeredByName}</p>
                                )}
                                {resp.reviewerStatus && resp.reviewerStatus !== 'PENDING' && (
                                  <span className={cn(
                                    'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium',
                                    resp.reviewerStatus === 'PASS'    && 'bg-green-500/10 border-green-500/30 text-green-400',
                                    resp.reviewerStatus === 'PARTIAL' && 'bg-amber-500/10 border-amber-500/30 text-amber-400',
                                    resp.reviewerStatus === 'FAIL'    && 'bg-red-500/10 border-red-500/30 text-red-400',
                                  )}>{resp.reviewerStatus}</span>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-text-muted italic">Not answered</p>
                            )}
                          </div>
                        </div>
                        {/* Action items (remediations/clarifications) for this question */}
                        <RemediationActionBanner questionInstanceId={q.questionInstanceId} assessmentId={id}/>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Approve/Reject/SendBack modal */}
      <Modal open={!!actionModal} onClose={() => setActionModal(null)}
        title={actionModal === 'approve' ? 'Approve review' : actionModal === 'reject' ? 'Reject assessment' : 'Send back'}>
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            {actionModal === 'approve' ? 'This will advance the workflow to the next step.'
              : actionModal === 'reject' ? 'This will reject the assessment. The vendor will need to resubmit.'
              : 'Send this assessment back for revision.'}
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              Remarks {actionModal !== 'approve' && <span className="text-red-400">*</span>}
            </label>
            <textarea rows={3} value={modalRemarks} onChange={e => setModalRemarks(e.target.value)}
              placeholder="Add remarks…"
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"/>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setActionModal(null)}>Cancel</Button>
            <Button variant={actionModal === 'approve' ? 'primary' : 'danger'} loading={acting}
              disabled={actionModal !== 'approve' && !modalRemarks.trim()}
              onClick={() => { doAction(actionModal === 'approve' ? 'APPROVE' : actionModal === 'reject' ? 'REJECT' : 'SEND_BACK', modalRemarks); setActionModal(null) }}>
              {actionModal === 'approve' ? 'Approve' : actionModal === 'reject' ? 'Reject' : 'Send back'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}