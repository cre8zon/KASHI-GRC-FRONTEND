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
  ACCEPTED:           { cls: 'bg-status-pass-bg text-status-pass-fg border-status-pass-bd',  label: '✓ Accepted',           Icon: CheckCheck    },
  OVERRIDDEN:         { cls: 'bg-status-info-bg text-status-info-fg border-status-info-bd',     label: '✎ Overridden',         Icon: Edit3         },
  REVISION_REQUESTED: { cls: 'bg-status-warn-bg text-status-warn-fg border-status-warn-bd', label: '↩ Revision requested',  Icon: CornerDownLeft },
}

export function ResponderActions({
  assessmentId,
  questionInstanceId,
  assignedUserId,
  responderStatus,
  responseType,
  options = [],
}) {
  const qc = useQueryClient()

  // Which inline panel is open: null | 'revision' | 'override'
  const [panel,        setPanel]        = useState(null)
  const [revisionNote, setRevisionNote] = useState('')
  const [overrideText, setOverrideText] = useState('')
  const [overrideNote, setOverrideNote] = useState('')
  // Chosen option(s) when overriding a choice question. An override replaces the
  // answer, so for SINGLE/MULTI_CHOICE it has to BE a selection — prose describing
  // the right option doesn't display, doesn't score, and doesn't reach the org side.
  const [overrideOpts, setOverrideOpts] = useState([])

  // Reset when the question changes (component reused for different questions)
  useEffect(() => {
    setPanel(null)
    setRevisionNote('')
    setOverrideText('')
    setOverrideNote('')
    setOverrideOpts([])
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
      setPanel(null); setOverrideText(''); setOverrideNote(''); setOverrideOpts([])
      invalidate()
    },
    onError: (e) => toast.error(e?.message || 'Failed to override'),
  })

  const badge      = STATUS_BADGE[responderStatus]
  const isTextType = !['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(responseType)

  const closePanel = () => {
    setPanel(null); setRevisionNote(''); setOverrideText(''); setOverrideNote(''); setOverrideOpts([])
  }

  // Statuses where the responder has already settled this answer. Both are
  // terminal: accepting takes the contributor's answer as-is, overriding
  // replaces it with the responder's own. Neither leaves anything to act on, so
  // the buttons collapse to the badge — previously only ACCEPTED did, and an
  // overridden question still offered Accept / Request revision / Override,
  // which would have re-opened an answer the responder had just written.
  // REVISION_REQUESTED deliberately stays actionable: it is pending, not settled.
  const SETTLED_STATUSES = ['ACCEPTED', 'OVERRIDDEN']
  const isSettled = SETTLED_STATUSES.includes(responderStatus)

  const isSingle = responseType === 'SINGLE_CHOICE'
  const isMulti  = responseType === 'MULTI_CHOICE'

  const toggleOpt = (optId) => setOverrideOpts(prev => {
    if (isSingle) return prev[0] === optId ? [] : [optId]
    return prev.includes(optId) ? prev.filter(x => x !== optId) : [...prev, optId]
  })

  // What counts as a complete override, by question type.
  const overrideReady = isTextType ? !!overrideText.trim() : overrideOpts.length > 0

  const submitOverride = () => {
    if (isSingle) {
      override({ selectedOptionInstanceId: overrideOpts[0], overrideReason: overrideNote.trim() })
    } else if (isMulti) {
      override({ selectedOptionInstanceIds: overrideOpts, overrideReason: overrideNote.trim() })
    } else {
      override({ responseText: overrideText.trim(), overrideReason: overrideNote.trim() })
    }
  }

  return (
    <div className="mt-2.5 space-y-2">

      {/* Status badge */}
      {badge && (
        <div className={cn(
          'inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-card border',
          badge.cls
        )}>
          <badge.Icon size={10} />
          {badge.label}
        </div>
      )}

      {/* Action buttons — hidden while a panel is open */}
      {!isSettled && panel === null && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            disabled={accepting}
            onClick={() => accept()}
            className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-card border border-status-pass-bd bg-status-pass-bg text-status-pass-fg hover:bg-status-pass-bg transition-colors disabled:opacity-50">
            <CheckCircle2 size={11} />
            {accepting ? 'Accepting…' : 'Accept answer'}
          </button>

          <button
            type="button"
            onClick={() => setPanel('revision')}
            className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-card border border-status-warn-bd bg-status-warn-bg text-status-warn-fg hover:bg-status-warn-bg transition-colors">
            <CornerDownLeft size={11} />
            Request revision
          </button>

          <button
            type="button"
            onClick={() => setPanel('override')}
            className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-card border border-border bg-surface-overlay/30 text-text-secondary hover:text-text-primary hover:border-brand-500/40 transition-colors">
            <Edit3 size={11} />
            Override
          </button>
        </div>
      )}

      {/* ── Request revision panel ─────────────────────────────────────────── */}
      {panel === 'revision' && (
        <div className="rounded-card border border-status-warn-bd bg-status-warn-bg">
          <div className="flex items-center justify-between px-3 py-2 border-b border-status-warn-bd">
            <div className="flex items-center gap-1.5">
              <CornerDownLeft size={11} className="text-status-warn-fg" />
              <span className="text-[11px] font-semibold text-status-warn-fg">Request revision from contributor</span>
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
              className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closePanel}
                className="text-xs text-text-muted hover:text-text-secondary px-2.5 py-1.5 rounded-ctl hover:bg-surface-overlay transition-colors">
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
        <div className="rounded-card border border-border bg-surface-overlay/20">
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
            <div className="flex items-start gap-2 p-2 rounded-ctl bg-status-warn-bg border border-status-warn-bd text-[11px] text-status-warn-fg">
              <AlertTriangle size={12} className="shrink-0 mt-px" />
              <span>
                Original answer is preserved in the Activity trail.
                {!isTextType && ` Pick the correct option — an override replaces the answer, so it is scored like one.`}
              </span>
            </div>

            {isTextType ? (
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-text-muted block">
                  Your answer (override) <span className="text-status-fail-fg">*</span>
                </label>
                <textarea
                  ref={ovrRef}
                  rows={3}
                  value={overrideText}
                  onChange={e => setOverrideText(e.target.value)}
                  placeholder="Enter the correct answer…"
                  className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-text-muted block">
                  Correct {isMulti ? 'options' : 'option'} <span className="text-status-fail-fg">*</span>
                </label>
                {options.length === 0 ? (
                  <p className="text-[11px] text-status-fail-fg italic">
                    Options unavailable — reload the page before overriding this question.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {options.map(o => {
                      const oid = o.optionInstanceId
                      const sel = overrideOpts.includes(oid)
                      return (
                        <button key={oid} type="button" onClick={() => toggleOpt(oid)}
                          className={cn('text-xs px-2.5 py-1 rounded-ctl border transition-colors',
                            sel
                              ? 'bg-brand-500/15 border-brand-500/40 text-brand-ink font-medium'
                              : 'bg-surface-raised border-border text-text-secondary hover:border-brand-500/30')}>
                          {o.optionValue}
                          {o.score != null && <span className="ml-1 opacity-60">({o.score})</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted block">
                Reason for override <span className="text-text-muted/40">(optional)</span>
              </label>
              <input
                value={overrideNote}
                onChange={e => setOverrideNote(e.target.value)}
                placeholder="e.g. Answer did not reflect the updated policy dated March 2025."
                className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={closePanel}
                className="text-xs text-text-muted hover:text-text-secondary px-2.5 py-1.5 rounded-ctl hover:bg-surface-overlay transition-colors">
                Cancel
              </button>
              <Button size="xs" variant="primary" icon={Edit3}
                disabled={!overrideReady} loading={overriding}
                onClick={submitOverride}>
                Override answer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}