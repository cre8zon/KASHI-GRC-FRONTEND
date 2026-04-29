/**
 * ResponderActions — the three command buttons the responder gets when a
 * contributor has submitted an answer.
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  [✓ Accept answer]  [↩ Request revision]  [✎ Override] │
 * └──────────────────────────────────────────────────────┘
 *
 * ROUTING:
 *   Accept        → PUT /v1/assessments/{id}/questions/{qi}/accept-contributor
 *                   (VendorItemActionController — new isolated file)
 *
 *   Request Rev.  → POST /v1/comments  { commentType: 'REVISION_REQUEST' }
 *                   (CommentController — centralized, already exists)
 *                   CommentService.handleRevisionRequest() auto-creates ActionItem.
 *                   RevisionBanner on fill page reads the ActionItem automatically.
 *                   NO new endpoint needed.
 *
 *   Override      → POST /v1/assessments/{id}/questions/{qi}/override-answer
 *                   (VendorItemActionController)
 *
 * Shown only in responder view when:
 *   - A contributor is assigned (q.assignedUserId != null)
 *   - Contributor has submitted an answer (q.currentResponse != null)
 *   - Section is not yet submitted (editable)
 *
 * Status badge shows current state (ACCEPTED / OVERRIDDEN / REVISION_REQUESTED)
 * derived from q.currentResponse.reviewerStatus.
 */

import { useState }     from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, CornerDownLeft, Edit3, AlertTriangle, CheckCheck,
} from 'lucide-react'
import { cn }           from '../../lib/cn'
import { assessmentsApi } from '../../api/assessments.api'
import { commentsApi }  from '../../api/comments.api'
import { Modal }        from '../ui/Modal'
import { Button }       from '../ui/Button'
import toast            from 'react-hot-toast'

const STATUS_BADGE = {
  ACCEPTED:           { cls: 'bg-green-500/10 text-green-400 border-green-500/30',  label: '✓ Accepted',          Icon: CheckCheck    },
  OVERRIDDEN:         { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30',     label: '✎ Overridden',        Icon: Edit3         },
  REVISION_REQUESTED: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: '↩ Revision requested', Icon: CornerDownLeft },
}

/**
 * @param {number}  assessmentId
 * @param {number}  questionInstanceId
 * @param {number}  assignedUserId      - contributor's userId
 * @param {string}  responderStatus     - from q.currentResponse.reviewerStatus
 * @param {string}  responseType        - 'TEXT'|'SINGLE_CHOICE'|'MULTI_CHOICE'|etc.
 */
export function ResponderActions({
  assessmentId,
  questionInstanceId,
  assignedUserId,
  responderStatus,
  responseType,
}) {
  const qc = useQueryClient()

  const [showRevModal,  setShowRevModal]  = useState(false)
  const [showOvrModal,  setShowOvrModal]  = useState(false)
  const [revisionNote,  setRevisionNote]  = useState('')
  const [overrideText,  setOverrideText]  = useState('')
  const [overrideNote,  setOverrideNote]  = useState('')

  const invalidate = () => {
    // 'my-sections-fill' is the query key used by VendorAssessmentFillPage (useMySections hook)
    qc.invalidateQueries({ queryKey: ['my-sections-fill', assessmentId] })
    // 'my-sections-review' is used by VendorAssessmentResponderReviewPage
    qc.invalidateQueries({ queryKey: ['my-sections-review', assessmentId] })
    // 'assessment-responder-review' is used by useAssessment in responder review page
    qc.invalidateQueries({ queryKey: ['assessment-responder-review', assessmentId] })
    // action items for this question — refreshes RevisionBanner and ItemPanel Actions tab
    qc.invalidateQueries({ queryKey: ['action-items-entity', 'QUESTION_RESPONSE', questionInstanceId] })
    // discussion thread — refreshes after REVISION_REQUEST comment is posted
    qc.invalidateQueries({ queryKey: ['q-comments', questionInstanceId] })
  }


  // Accept
  const { mutate: accept, isPending: accepting } = useMutation({
    mutationFn: () => assessmentsApi.acceptContributorAnswer(assessmentId, questionInstanceId),
    onSuccess:  () => { toast.success('Answer accepted'); invalidate() },
    onError:    (e) => toast.error(e?.message || 'Failed to accept'),
  })

  // Request revision — goes through centralized CommentController
  // CommentService.handleRevisionRequest() automatically creates the ActionItem.
  const { mutate: requestRevision, isPending: requesting } = useMutation({
    mutationFn: (text) => commentsApi.add({
      entityType:        'QUESTION_RESPONSE',
      entityId:          questionInstanceId,
      questionInstanceId,
      commentText:       text,
      commentType:       'REVISION_REQUEST',
      visibility:        'ALL',
    }),
    onSuccess: () => {
      toast.success('Revision requested — contributor notified')
      setShowRevModal(false)
      setRevisionNote('')
      invalidate()
    },
    onError: (e) => toast.error(e?.message || 'Failed to request revision'),
  })

  // Override
  const { mutate: override, isPending: overriding } = useMutation({
    mutationFn: (body) => assessmentsApi.overrideContributorAnswer(assessmentId, questionInstanceId, body),
    onSuccess:  () => {
      toast.success('Answer overridden')
      setShowOvrModal(false)
      setOverrideText('')
      setOverrideNote('')
      invalidate()
    },
    onError: (e) => toast.error(e?.message || 'Failed to override'),
  })

  const badge = STATUS_BADGE[responderStatus]
  const alreadyActed = !!badge
  const isTextBased = !['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(responseType)

  return (
    <div className="mt-2.5 space-y-2">
      {/* Status badge — when action already taken */}
      {badge && (
        <div className={cn(
          'inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg border',
          badge.cls
        )}>
          <badge.Icon size={10} />
          {badge.label}
        </div>
      )}

      {/* Action buttons — show unless already fully accepted */}
      {responderStatus !== 'ACCEPTED' && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            disabled={accepting}
            onClick={() => accept()}
            className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-green-500/30 bg-green-500/8 text-green-400 hover:bg-green-500/15 transition-colors disabled:opacity-50">
            <CheckCircle2 size={11} />
            {accepting ? 'Accepting…' : 'Accept answer'}
          </button>

          <button
            onClick={() => setShowRevModal(true)}
            className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/8 text-amber-400 hover:bg-amber-500/15 transition-colors">
            <CornerDownLeft size={11} />
            Request revision
          </button>

          <button
            onClick={() => setShowOvrModal(true)}
            className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-border bg-surface-overlay/30 text-text-secondary hover:text-text-primary hover:border-brand-500/40 transition-colors">
            <Edit3 size={11} />
            Override
          </button>
        </div>
      )}

      {/* ── Request Revision modal ────────────────────────────────────────────── */}
      <Modal
        isOpen={showRevModal}
        onClose={() => setShowRevModal(false)}
        title="Request revision from contributor"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            The contributor will receive an inbox task to re-answer this question.
            Provide a clear reason so they know exactly what needs to change.
          </p>
          <div>
            <label className="text-xs font-medium text-text-muted mb-1.5 block">
              Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              autoFocus
              value={revisionNote}
              onChange={e => setRevisionNote(e.target.value)}
              placeholder="e.g. The answer is incomplete — please specify which controls are implemented and provide the policy reference."
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowRevModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon={CornerDownLeft}
              disabled={!revisionNote.trim()}
              loading={requesting}
              onClick={() => requestRevision(revisionNote.trim())}>
              Send revision request
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Override modal ────────────────────────────────────────────────────── */}
      <Modal
        isOpen={showOvrModal}
        onClose={() => setShowOvrModal(false)}
        title="Override contributor's answer"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/8 border border-amber-500/20 text-xs text-amber-400">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              The contributor's original answer will be preserved in the Activity trail.
              {!isTextBased && ' For choice questions, enter the correct text answer or the option text.'}
            </span>
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted mb-1.5 block">
              Your answer (override) <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={4}
              value={overrideText}
              onChange={e => setOverrideText(e.target.value)}
              placeholder={isTextBased
                ? 'Enter the correct answer…'
                : 'Describe the correct answer or explain the correction…'}
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-muted mb-1.5 block">
              Reason for override <span className="text-text-muted/50">(optional)</span>
            </label>
            <input
              value={overrideNote}
              onChange={e => setOverrideNote(e.target.value)}
              placeholder="e.g. Answer did not reflect the updated policy dated March 2025."
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowOvrModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon={Edit3}
              disabled={!overrideText.trim()}
              loading={overriding}
              onClick={() => override({
                responseText:   overrideText.trim(),
                overrideReason: overrideNote.trim(),
              })}>
              Override answer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
