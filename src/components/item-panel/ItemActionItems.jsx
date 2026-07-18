/**
 * ItemActionItems — inline action items panel for ItemPanel.
 *
 * Renders remediations and clarifications with proper API calls:
 *   - validateRemediation → ReviewController.validateRemediation()
 *     (triggers decrementAndMaybeReport — not generic status PATCH)
 *   - acceptRisk          → ReviewController.acceptRisk()
 *     (same decrement + report logic)
 *
 * This is what was missing in the original AssessmentDetailPage.QuestionActionItems
 * which called generic updateStatus, bypassing all the report-triggering logic.
 *
 * mode controls which actions are shown:
 *   reviewer    — Validate + Accept Risk + Send back (org side)
 *   responder   — Read-only view of remediations the org raised (vendor side)
 *   contributor — Read-only (should not see org-internal clarifications)
 *   readonly    — No actions
 */

import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, Clock, CornerDownLeft, CheckCheck,
  AlertTriangle, Shield, MessageSquare, ChevronDown,
} from 'lucide-react'
import { cn }             from '../../lib/cn'
import { formatDate }     from '../../utils/format'
import { useEntityActionItems } from '../../hooks/useActionItems'
import { reviewApi }      from '../../api/review.api'
import { commentsApi }    from '../../api/comments.api'
import { MentionInput }   from '../ui/MentionInput'
import toast              from 'react-hot-toast'

const SEVERITY_CLS = {
  CRITICAL: 'text-status-fail-fg bg-status-fail-bg border-status-fail-bd',
  HIGH:     'text-status-warn-fg bg-status-warn-bg border-status-warn-bd',
  MEDIUM:   'text-status-warn-fg bg-status-warn-bg border-status-warn-bd',
  LOW:      'text-status-info-fg bg-status-info-bg border-status-info-bd',
}

const STATUS_LABEL = {
  OPEN:               'Open',
  IN_PROGRESS:        'In progress',
  PENDING_REVIEW:     'Vendor submitted',
  PENDING_VALIDATION: 'Awaiting validation',
  RESOLVED:           'Resolved',
}

/**
 * ActionItemThread — collapsible inline discussion thread for ANY action item.
 *
 * Posts VENDOR_INTERNAL comments for revision threads, ALL for org-facing items.
 * Uses MentionInput so participants can @tag each other for notifications.
 * Thread is anchored to the question entity (entityType=QUESTION_RESPONSE,
 * entityId=questionInstanceId) and filtered by a creation-time window so each
 * item's thread shows only comments posted after that action item was created.
 */
function ActionItemThread({ entityId, item, visibility = 'ALL' }) {
  const qc = useQueryClient()
  const [open,  setOpen]  = useState(false)
  const [draft, setDraft] = useState('')
  const [mentionedIds, setMentionedIds] = useState([])
  const endRef = useRef(null)

  const queryKey = ['ai-thread', entityId, item.id]
  const { data: allComments = [] } = useQuery({
    queryKey,
    queryFn: () => commentsApi.list('QUESTION_RESPONSE', entityId),
    enabled: open && !!entityId,
    select: (d) => Array.isArray(d) ? d : (d?.data || []),
    staleTime: 0,
  })

  // Only show COMMENT-type messages created after this action item, matching visibility
  const itemCreatedAt = item.createdAt ? new Date(item.createdAt) : null
  const thread = allComments.filter(c =>
    (c.commentType === 'COMMENT' || c.commentType === null) &&
    c.visibility !== 'SYSTEM' &&
    c.commentType !== 'REVISION_REQUEST' &&
    c.commentType !== 'SYSTEM' &&
    (!itemCreatedAt || new Date(c.createdAt) >= itemCreatedAt)
  )

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread.length, open])

  const { mutate: post, isPending } = useMutation({
    mutationFn: () => commentsApi.add({
      entityType: 'QUESTION_RESPONSE',
      entityId,
      commentText: draft.trim(),
      commentType: 'COMMENT',
      visibility,
      mentionedUserIds: mentionedIds,
    }),
    onSuccess: () => {
      setDraft('')
      setMentionedIds([])
      qc.invalidateQueries({ queryKey })
      qc.invalidateQueries({ queryKey: ['q-comments', entityId] })
    },
    onError: (e) => toast.error(e?.message || 'Failed to send'),
  })

  return (
    <div className="border-t border-on-dark/8 mt-1">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-text-muted hover:text-text-secondary transition-colors">
        <MessageSquare size={10} />
        <span>{thread.length > 0 ? `${thread.length} reply${thread.length > 1 ? 's' : ''}` : 'Discuss'}</span>
        <ChevronDown size={9} className={cn('ml-auto transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5">
          {thread.length === 0 && (
            <p className="text-[10px] text-text-muted/50 italic">No replies yet.</p>
          )}
          {thread.map(c => (
            <div key={c.id || c.commentId} className="flex gap-2">
              <div className="w-5 h-5 rounded-full bg-surface-overlay border border-border flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-text-muted">
                {(c.createdByName || '?')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] font-medium text-text-secondary">{c.createdByName}</span>
                  <span className="text-[9px] text-text-muted/40">{c.createdAt ? formatDate(c.createdAt) : ''}</span>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">{c.commentText}</p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
          {/* Reply box with @mention support */}
          <MentionInput
            value={draft}
            onChange={(text, ids) => { setDraft(text); setMentionedIds(ids) }}
            onSubmit={() => { if (draft.trim()) post() }}
            placeholder="Reply… (@ to mention, Ctrl+Enter to send)"
            rows={2}
            className="mt-1"
          />
          <div className="flex justify-end">
            <button type="button"
              disabled={!draft.trim() || isPending}
              onClick={() => post()}
              className="text-[11px] font-medium px-2.5 py-1 rounded bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 transition-colors disabled:opacity-40">
              {isPending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ItemActionItems({ entityType, entityId, assessmentId, mode, userSide = 'VENDOR' }) {
  const qc = useQueryClient()
  const { data: items = [], isLoading } = useEntityActionItems(entityType, entityId, {
    enabled: !!entityId,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['action-items-entity', entityType, entityId] })
    if (assessmentId)
      qc.invalidateQueries({ queryKey: ['assessment', assessmentId] })
  }

  const { mutate: validate,   isPending: validating  } = useMutation({
    mutationFn: (itemId) => reviewApi.validateRemediation(assessmentId, itemId, 'Remediation validated'),
    onSuccess: () => { toast.success('Remediation validated'); invalidate() },
    onError:   (e) => toast.error(e?.message || 'Failed to validate'),
  })

  const { mutate: acceptRisk, isPending: acceptingRisk } = useMutation({
    mutationFn: (itemId) => reviewApi.acceptRisk(assessmentId, itemId, 'Risk accepted'),
    onSuccess: () => { toast.success('Risk accepted'); invalidate() },
    onError:   (e) => toast.error(e?.message || 'Failed to accept risk'),
  })

  if (isLoading) return <div className="h-3 w-24 bg-surface-overlay rounded animate-pulse my-2" />

  const remediations   = items.filter(i => i.remediationType === 'REMEDIATION_REQUEST')
  const clarifications = items.filter(i => i.remediationType === 'CLARIFICATION')
  // Vendor-internal revision requests (responder → contributor): sourceType=COMMENT, remediationType=null
  const revisions      = items.filter(i => i.sourceType === 'COMMENT' && !i.remediationType)

  if (!remediations.length && !clarifications.length && !revisions.length)
    return <p className="text-[11px] text-text-muted italic py-2">No action items.</p>

  const isOpen = (s) => ['OPEN','IN_PROGRESS','PENDING_REVIEW','PENDING_VALIDATION'].includes(s)
  const vendorActed = (s) => ['PENDING_REVIEW','PENDING_VALIDATION'].includes(s)

  return (
    <div className="space-y-2">
      {/* Vendor-internal revision requests (responder → contributor) */}
      {revisions.map(item => (
        <div key={item.id}
          className={cn(
            'rounded-card border text-[11px]',
            item.status === 'RESOLVED'
              ? 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg'
              : 'bg-status-warn-bg border-status-warn-bd text-status-warn-fg'
          )}>
          <div className="flex items-start gap-2 px-3 py-2">
            {item.status === 'RESOLVED'
              ? <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
              : <Clock size={12} className="shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold">Revision requested</span>
                <span className="opacity-60">— {STATUS_LABEL[item.status] || item.status}</span>
              </div>
              {item.description && (
                <p className="text-[10px] opacity-80 mt-0.5">"{item.description}"</p>
              )}
              {item.createdByName && (
                <p className="text-[10px] opacity-50 mt-0.5">By {item.createdByName} · {item.createdAt ? formatDate(item.createdAt) : ''}</p>
              )}
            </div>
          </div>
          {item.status === 'RESOLVED' && item.resolutionNote && (
            <p className="text-[10px] text-status-pass-fg px-3 pb-2 pl-7">✓ {item.resolutionNote}</p>
          )}
          {item.status !== 'RESOLVED' && entityType === 'QUESTION_RESPONSE' && (
            <ActionItemThread entityId={entityId} item={item}
              visibility={userSide === 'VENDOR' ? 'VENDOR_INTERNAL' : 'ALL'} />
          )}
        </div>
      ))}

      {/* Remediation requests */}
      {remediations.map(item => (
        <div key={item.id}
          className={cn(
            'rounded-card border text-[11px]',
            item.status === 'RESOLVED'
              ? 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg'
              : vendorActed(item.status)
                ? 'bg-status-info-bg border-status-info-bd text-status-info-fg'
                : 'bg-status-warn-bg border-status-warn-bd text-status-warn-fg'
          )}>
          {/* Header */}
          <div className="flex items-start gap-2 px-3 py-2">
            {item.status === 'RESOLVED'
              ? <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
              : vendorActed(item.status)
                ? <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
                : <Clock size={12} className="shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold">Remediation required</span>
                {item.severity && (
                  <span className={cn(
                    'text-[9px] font-bold px-1 py-0.5 rounded border uppercase',
                    SEVERITY_CLS[item.severity] || SEVERITY_CLS.MEDIUM
                  )}>{item.severity}</span>
                )}
                <span className="opacity-60">— {STATUS_LABEL[item.status] || item.status}</span>
              </div>
              {item.description && (
                <p className="text-[10px] opacity-80 mt-0.5">{item.description}</p>
              )}
              {item.dueAt && (
                <p className={cn(
                  'text-[10px] mt-0.5 flex items-center gap-0.5',
                  item.isOverdue ? 'text-status-fail-fg' : 'opacity-50'
                )}>
                  <Clock size={9} />Due {formatDate(item.dueAt)}{item.isOverdue && ' — overdue'}
                </p>
              )}
            </div>
          </div>

          {/* Party info */}
          <div className="px-3 py-1 border-t border-on-dark/5 flex flex-wrap gap-x-4 text-[10px] opacity-60">
            {item.createdByName  && <span>Raised by: <strong>{item.createdByName}</strong></span>}
            {item.assignedToName && <span>Assigned: <strong>{item.assignedToName}</strong></span>}
            {item.createdAt      && <span>{formatDate(item.createdAt)}</span>}
          </div>

          {/* Resolution note */}
          {item.status === 'RESOLVED' && item.resolutionNote && (
            <div className="px-3 py-1.5 border-t border-on-dark/5 text-[10px] text-status-pass-fg">
              ✓ {item.resolutionNote}
              {item.resolvedByName && <span className="ml-1 opacity-70">by {item.resolvedByName}</span>}
            </div>
          )}

          {/* Reviewer actions — only for reviewer mode + canResolve */}
          {isOpen(item.status) && mode === 'reviewer' && item.canResolve && (
            <div className="px-3 py-1.5 border-t border-on-dark/5 flex gap-3">
              {vendorActed(item.status) && (
                <button
                  disabled={validating}
                  onClick={() => validate(item.id)}
                  className="text-[10px] text-status-pass-fg hover:text-status-pass-fg flex items-center gap-1 font-medium disabled:opacity-50">
                  <CheckCircle2 size={10} />
                  {validating ? 'Validating…' : 'Validate'}
                </button>
              )}
              <button
                disabled={acceptingRisk}
                onClick={() => acceptRisk(item.id)}
                className="text-[10px] text-status-info-fg hover:text-status-info-fg flex items-center gap-1 disabled:opacity-50">
                <CheckCheck size={10} />
                {acceptingRisk ? '…' : 'Accept risk'}
              </button>
              {!vendorActed(item.status) && (
                <button
                  onClick={() => toast('Send back functionality via action item page')}
                  className="text-[10px] text-text-muted hover:text-text-secondary flex items-center gap-1">
                  <CornerDownLeft size={10} /> Send back
                </button>
              )}
            </div>
          )}
          {/* Thread discussion for this remediation */}
          {entityType === 'QUESTION_RESPONSE' && (
            <ActionItemThread entityId={entityId} item={item} visibility="ALL" />
          )}
        </div>
      ))}
      {clarifications.map(item => (
        <div key={item.id}
          className={cn(
            'rounded-card border text-[11px] px-3 py-2',
            item.status === 'RESOLVED'
              ? 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg'
              : 'bg-status-tag-bg border-status-tag-bd text-status-tag-fg'
          )}>
          <div className="flex items-start gap-2">
            {item.status === 'RESOLVED'
              ? <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
              : <Clock size={12} className="shrink-0 mt-0.5" />}
            <div>
              <span className="font-semibold">Clarification</span>
              <span className="opacity-60 ml-1">— {STATUS_LABEL[item.status] || item.status}</span>
              {item.description && <p className="text-[10px] opacity-80 mt-0.5">{item.description}</p>}
            </div>
          </div>
          {item.status === 'RESOLVED' && item.resolutionNote && (
            <p className="text-[10px] text-status-pass-fg mt-1 pl-5">✓ {item.resolutionNote}</p>
          )}
          {/* Thread discussion for this clarification */}
          {entityType === 'QUESTION_RESPONSE' && (
            <ActionItemThread entityId={entityId} item={item} visibility="ALL" />
          )}
        </div>
      ))}
    </div>
  )
}