/**
 * ResponderActions — Accept / Request revision / Override for contributor answers.
 *
 * WHY INLINE PANELS (not Modal portals):
 *   This component renders inside both the page question cards AND inside the
 *   QuestionDrawer panel (which has `translate-x-0` CSS transform when open).
 *   CSS transforms create a new containing block for position:fixed descendants
 *   in many browsers, causing portal-based Modals to render or intercept clicks
 *   incorrectly. Inline expansion panels avoid all z-index / stacking context
 *   issues entirely and are guaranteed to work in every context.
 *
 * ROUTING:
 *   Accept        → PUT /v1/assessments/{id}/questions/{qi}/accept-contributor
 *   Request Rev.  → POST /v1/comments { commentType: 'REVISION_REQUEST' }
 *   Override      → POST /v1/assessments/{id}/questions/{qi}/override-answer
 */

import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, CornerDownLeft, Edit3, AlertTriangle, CheckCheck, X,
} from 'lucide-react'
import { cn }             from '../../lib/cn'
import { assessmentsApi } from '../../api/assessments.api'
import { commentsApi }    from '../../api/comments.api'
import { Button }         from '../ui/Button'
import toast              from 'react-hot-toast'

const STATUS_BADGE = {
  ACCEPTED:           { cls: 'bg-green-500/10 text-green-400 border-green-500/30',  label: '✓ Accepted',           Icon: CheckCheck    },
  OVERRIDDEN:         { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30',     label: '✎ Overridden',         Icon: Edit3         },
  REVISION_REQUESTED: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: '↩ Revision requested',  Icon: CornerDownLeft },
}

export function ResponderActions({
  assessmentId,
  questionInstanceId,
  assignedUserId,
  responderStatus,
  responseType,
}) {
  const qc = useQueryClient()

  // Which inline panel is open: null | 'revision' | 'override'
  const [panel,        setPanel]        = useState(null)
  const [revisionNote, setRevisionNote] = useState('')
  const [overrideText, setOverrideText] = useState('')
  const [overrideNote, setOverrideNote] = useState('')

  // Reset when the question changes (component reused for different questions)
  useEffect(() => {
    setPanel(null)
    setRevisionNote('')
    setOverrideText('')
    setOverrideNote('')
  }, [questionInstanceId])

  const revRef = useRef(null)
  const ovrRef = useRef(null)
  useEffect(() => {
    if (panel === 'revision') revRef.current?.focus()
    if (panel === 'override') ovrRef.current?.focus()
  }, [panel])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['my-sections-fill',      assessmentId] })
    qc.invalidateQueries({ queryKey: ['my-sections-review',    assessmentId] })
    qc.invalidateQueries({ queryKey: ['assessment-responder-review', assessmentId] })
    qc.invalidateQueries({ queryKey: ['action-items-entity', 'QUESTION_RESPONSE', questionInstanceId] })
    qc.invalidateQueries({ queryKey: ['q-comments', questionInstanceId] })
  }

  const { mutate: accept, isPending: accepting } = useMutation({
    mutationFn: () => assessmentsApi.acceptContributorAnswer(assessmentId, questionInstanceId),
    onSuccess:  () => { toast.success('Answer accepted'); invalidate() },
    onError:    (e) => toast.error(e?.message || 'Failed to accept'),
  })

  const { mutate: requestRevision, isPending: requesting } = useMutation({
    mutationFn: (text) => commentsApi.add({
      entityType: 'QUESTION_RESPONSE', entityId: questionInstanceId,
      questionInstanceId, commentText: text,
      commentType: 'REVISION_REQUEST',
      // VENDOR_INTERNAL: responder→contributor revision is internal vendor workflow.
      // The Shared tab (visibility: ALL) is for org-facing notices.
      // This comment goes in Vendor notes, visible only to vendor-side users.
      visibility: 'VENDOR_INTERNAL',
    }),
    onSuccess: () => {
      toast.success('Revision requested — contributor notified')
      setPanel(null); setRevisionNote('')
      invalidate()
    },
    onError: (e) => toast.error(e?.message || 'Failed to request revision'),
  })

  const { mutate: override, isPending: overriding } = useMutation({
    mutationFn: (body) => assessmentsApi.overrideContributorAnswer(assessmentId, questionInstanceId, body),
    onSuccess:  () => {
      toast.success('Answer overridden')
      setPanel(null); setOverrideText(''); setOverrideNote('')
      invalidate()
    },
    onError: (e) => toast.error(e?.message || 'Failed to override'),
  })

  const badge      = STATUS_BADGE[responderStatus]
  const isTextType = !['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(responseType)

  const closePanel = () => { setPanel(null); setRevisionNote(''); setOverrideText(''); setOverrideNote('') }

  return (
    <div className="mt-2.5 space-y-2">

      {/* Status badge */}
      {badge && (
        <div className={cn(
          'inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg border',
          badge.cls
        )}>
          <badge.Icon size={10} />
          {badge.label}
        </div>
      )}

      {/* Action buttons — hidden while a panel is open */}
      {responderStatus !== 'ACCEPTED' && panel === null && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            disabled={accepting}
            onClick={() => accept()}
            className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50">
            <CheckCircle2 size={11} />
            {accepting ? 'Accepting…' : 'Accept answer'}
          </button>

          <button
            type="button"
            onClick={() => setPanel('revision')}
            className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">
            <CornerDownLeft size={11} />
            Request revision
          </button>

          <button
            type="button"
            onClick={() => setPanel('override')}
            className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-border bg-surface-overlay/30 text-text-secondary hover:text-text-primary hover:border-brand-500/40 transition-colors">
            <Edit3 size={11} />
            Override
          </button>
        </div>
      )}

      {/* ── Request revision panel ─────────────────────────────────────────── */}
      {panel === 'revision' && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center justify-between px-3 py-2 border-b border-amber-500/15">
            <div className="flex items-center gap-1.5">
              <CornerDownLeft size={11} className="text-amber-400" />
              <span className="text-[11px] font-semibold text-amber-300">Request revision from contributor</span>
            </div>
            <button type="button" onClick={closePanel}
              className="text-text-muted hover:text-text-secondary transition-colors p-0.5">
              <X size={13} />
            </button>
          </div>
          <div className="p-3 space-y-2.5">
            <p className="text-[11px] text-text-secondary">
              Describe exactly what needs to change. The contributor will receive an inbox task.
            </p>
            <textarea
              ref={revRef}
              rows={3}
              value={revisionNote}
              onChange={e => setRevisionNote(e.target.value)}
              placeholder="e.g. The answer is incomplete — please specify which controls are implemented."
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closePanel}
                className="text-xs text-text-muted hover:text-text-secondary px-2.5 py-1.5 rounded-md hover:bg-surface-overlay transition-colors">
                Cancel
              </button>
              <Button size="xs" variant="primary" icon={CornerDownLeft}
                disabled={!revisionNote.trim()} loading={requesting}
                onClick={() => requestRevision(revisionNote.trim())}>
                Send revision request
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Override panel ─────────────────────────────────────────────────── */}
      {panel === 'override' && (
        <div className="rounded-lg border border-border bg-surface-overlay/20">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              <Edit3 size={11} className="text-text-secondary" />
              <span className="text-[11px] font-semibold text-text-primary">Override contributor's answer</span>
            </div>
            <button type="button" onClick={closePanel}
              className="text-text-muted hover:text-text-secondary transition-colors p-0.5">
              <X size={13} />
            </button>
          </div>
          <div className="p-3 space-y-2.5">
            <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400">
              <AlertTriangle size={12} className="shrink-0 mt-px" />
              <span>
                Original answer is preserved in the Activity trail.
                {!isTextType && ' For choice questions, describe the correct option.'}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted block">
                Your answer (override) <span className="text-red-400">*</span>
              </label>
              <textarea
                ref={ovrRef}
                rows={3}
                value={overrideText}
                onChange={e => setOverrideText(e.target.value)}
                placeholder={isTextType ? 'Enter the correct answer…' : 'Describe the correct answer or explain the correction…'}
                className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted block">
                Reason for override <span className="text-text-muted/40">(optional)</span>
              </label>
              <input
                value={overrideNote}
                onChange={e => setOverrideNote(e.target.value)}
                placeholder="e.g. Answer did not reflect the updated policy dated March 2025."
                className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={closePanel}
                className="text-xs text-text-muted hover:text-text-secondary px-2.5 py-1.5 rounded-md hover:bg-surface-overlay transition-colors">
                Cancel
              </button>
              <Button size="xs" variant="primary" icon={Edit3}
                disabled={!overrideText.trim()} loading={overriding}
                onClick={() => override({ responseText: overrideText.trim(), overrideReason: overrideNote.trim() })}>
                Override answer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}