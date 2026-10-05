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
import { Link } from 'react-router-dom'
import {
  CheckCircle2, Clock, CornerDownLeft, CheckCheck,
  AlertTriangle, Shield, MessageSquare, ChevronDown, ArrowUpRight,
} from 'lucide-react'
import { cn }             from '../../lib/cn'
import { formatDate }     from '../../utils/format'
import { useEntityActionItems } from '../../hooks/useActionItems'
import { reviewApi }      from '../../api/review.api'
import { commentsApi }    from '../../api/comments.api'
import { MentionInput }   from '../ui/MentionInput'
import toast              from 'react-hot-toast'

/**
 * What a reviewer sees instead of Validate / Accept risk once a finding has
 * become an Issue.
 *
 * ── WHY THE BUTTONS HAVE TO GO, NOT JUST MOVE ────────────────────────────
 *
 * validateRemediation and acceptRisk both land in
 * AssessmentRemediationService.close(), which resolves the action item and
 * adjusts the assessment's counters. It does not touch the Issue. So on an
 * escalated finding, pressing Validate marked the finding resolved and left the
 * Issue open behind it — with a live workflow instance and a task still sitting
 * on the vendor for work that had just been accepted. The count dropped, the
 * report regenerated, and nothing in the product said the Issue was orphaned.
 *
 * That was reachable before and rare, because only hand-escalated findings had
 * an Issue. Now every finding escalates on being raised, so it would have been
 * the default path.
 *
 * The server refuses it too — close() rejects an item carrying linkedIssueId
 * and names the issue. This is the UI matching that guard rather than guessing
 * at it: a button that can only fail is worse than no button.
 */
function EscalatedActions({ issueId }) {
  return (
    <div className="px-3 py-1.5 border-t border-on-dark/5 flex items-center gap-3 flex-wrap">
      <Link
        to={`/module/issue/${issueId}`}
        onClick={(e) => e.stopPropagation()}
        className="text-[10px] text-brand-ink flex items-center gap-1 font-medium hover:underline">
        <ArrowUpRight size={10} />
        Open Issue #{issueId}
      </Link>
      <span className="text-[9px] text-text-muted italic">
        Validate and close happen on the Issue — this closes with it
      </span>
    </div>
  )
}

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
              className="text-[11px] font-medium px-2.5 py-1 rounded bg-brand-500/20 text-brand-ink hover:bg-brand-500/30 transition-colors disabled:opacity-40">
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

  const clarifications = items.filter(i => i.remediationType === 'CLARIFICATION')
  // Vendor-internal revision requests (responder → contributor): sourceType=COMMENT, remediationType=null
  const revisions      = items.filter(i => i.sourceType === 'COMMENT' && !i.remediationType)

  // Reviewer-raised remediations only. sourceType SYSTEM is excluded because a
  // guard finding is ALSO a REMEDIATION_REQUEST now — see the guard block
  // below — and without this exclusion every KashiGuard item would render
  // twice, once here and once there.
  const remediations   = items.filter(i =>
    i.remediationType === 'REMEDIATION_REQUEST' && i.sourceType !== 'SYSTEM')

  // ── KashiGuard findings ─────────────────────────────────────────────────
  // GuardEvaluator.handleMatch writes sourceType = SYSTEM, sourceId = the rule
  // id, entityType = QUESTION_RESPONSE, and NEVER sets remediationType —
  // ActionItemRequest has no such field. So a guard item matched none of the
  // three buckets above and was dropped on the floor. Worse: a question whose
  // only item was a guard finding rendered "No action items", which reads as
  // "nothing wrong here" on the one question where something is.
  //
  // It fires for vendor assessments in two places today —
  // AssessmentController:631 on every answer submit, and the ciso-submit sweep
  // at :2254 via ModuleSubmitEvent — so this was live and invisible.
  //
  // Assignment bookkeeping is excluded: CONTRIBUTOR_ASSIGNMENT and
  // REVIEWER_ASSIGNMENT are action items too, and neither is a finding.
  const ASSIGNMENT_TYPES = ['CONTRIBUTOR_ASSIGNMENT', 'REVIEWER_ASSIGNMENT', 'CONTRIBUTOR_REOPEN']
  //
  // ── `!i.remediationType` NO LONGER HOLDS, AND I BROKE IT ────────────────
  // The comment above was accurate when it was written: ActionItemRequest had
  // no remediationType field, so a guard item arrived with null. It has one
  // now — GuardEvaluator sets REMEDIATION_REQUEST, which is what made
  // auto-escalation possible — so filtering on "no type" would have matched
  // nothing and every KashiGuard finding would have vanished from this panel
  // into the remediations bucket, losing the Shield, the "Raised
  // automatically" line and the fact that nobody typed it.
  //
  // sourceType is the durable signal: SYSTEM means the platform raised it, and
  // that is true whatever type it carries.
  const guardFindings = items.filter(i =>
    i.sourceType === 'SYSTEM' && !ASSIGNMENT_TYPES.includes(i.remediationType))

  // ── THE ASSIGNMENT ITSELF ───────────────────────────────────────────────
  // Excluded everywhere as "bookkeeping", and that was the mistake. This row
  // IS the per-question record of who was asked and whether they are done: the
  // server resolves it the moment the work happens — "Question answered by
  // contributor", "Question evaluated by review assistant" — and a
  // reassignment resolves the previous holder's with its own note.
  //
  // Hiding it is why a contributor could answer, have their obligation closed
  // server-side, and still find nothing anywhere saying so. Rendered last,
  // because it is the quiet state; anything raised ON the question is the live
  // work and belongs above it.
  const assignments = items.filter(i => ASSIGNMENT_TYPES.includes(i.remediationType))

  if (!remediations.length && !clarifications.length && !revisions.length
      && !guardFindings.length && !assignments.length)
    return <p className="text-[11px] text-text-muted italic py-2">No action items.</p>

  const isOpen = (s) => ['OPEN','IN_PROGRESS','PENDING_REVIEW','PENDING_VALIDATION'].includes(s)
  const vendorActed = (s) => ['PENDING_REVIEW','PENDING_VALIDATION'].includes(s)

  return (
    <div className="space-y-2">
      {/* ── KashiGuard findings ─────────────────────────────────────────── */}
      {/* First, deliberately: a rule firing on an answer is the reason the other
          items on this question probably exist. */}
      {guardFindings.map(item => (
        <div key={item.id}
          className={cn(
            'rounded-card border text-[11px]',
            item.status === 'RESOLVED'
              ? 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg'
              : 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg'
          )}>
          <div className="flex items-start gap-2 px-3 py-2">
            {item.status === 'RESOLVED'
              ? <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
              : <Shield size={12} className="shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold">KashiGuard</span>
                <span className="opacity-60">— {STATUS_LABEL[item.status] || item.status}</span>
                {item.priority && item.priority !== 'MEDIUM' && (
                  <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-on-dark/10">
                    {item.priority}
                  </span>
                )}
              </div>
              {item.title && <p className="mt-0.5">{item.title}</p>}
              {item.description && (
                <p className="text-[10px] opacity-80 mt-0.5 whitespace-pre-wrap">{item.description}</p>
              )}
              {/* No createdByName: these are raised as SYSTEM_USER_ID = 0, so
                  naming an author would print a user who does not exist. */}
              {item.createdAt && (
                <p className="text-[10px] opacity-50 mt-0.5">
                  Raised automatically · {formatDate(item.createdAt)}
                </p>
              )}
            </div>
          </div>
          {item.status === 'RESOLVED' && item.resolutionNote && (
            // GuardEvaluator.handleNoMatch auto-resolves with
            // "Auto-resolved: answer no longer triggers rule {id}" when the
            // answer changes, so this line usually says the vendor fixed it.
            <p className="text-[10px] text-status-pass-fg px-3 pb-2 pl-7">✓ {item.resolutionNote}</p>
          )}
          {/* A guard finding is a REMEDIATION_REQUEST and escalates to an Issue
              by itself. Once it has, the Issue's workflow owns validate and
              close — see EscalatedActions. Until it has (no owner on the
              finding, or escalation failed) these are still the way to close
              it, which is the same fallback the Findings tab's Escalate is. */}
          {isOpen(item.status) && mode === 'reviewer' && item.canResolve && (
            item.linkedIssueId ? (
              <EscalatedActions issueId={item.linkedIssueId} />
            ) : (
            <div className="px-3 py-1.5 border-t border-on-dark/5 flex gap-3">
              {vendorActed(item.status) && (
                <button
                  disabled={validating}
                  onClick={() => validate(item.id)}
                  className="text-[10px] text-status-pass-fg flex items-center gap-1 font-medium disabled:opacity-50">
                  <CheckCircle2 size={10} />
                  {validating ? 'Validating…' : 'Validate'}
                </button>
              )}
              <button
                disabled={acceptingRisk}
                onClick={() => acceptRisk(item.id)}
                className="text-[10px] text-status-info-fg flex items-center gap-1 disabled:opacity-50">
                <CheckCheck size={10} />
                {acceptingRisk ? '…' : 'Accept risk'}
              </button>
            </div>
            )
          )}
          {item.status !== 'RESOLVED' && entityType === 'QUESTION_RESPONSE' && (
            <ActionItemThread entityId={entityId} item={item}
              visibility={userSide === 'VENDOR' ? 'VENDOR_INTERNAL' : 'ALL'} />
          )}
        </div>
      ))}

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

          {/* Reviewer actions — only for reviewer mode + canResolve.
              An escalated finding closes with its Issue, not from here. */}
          {isOpen(item.status) && mode === 'reviewer' && item.canResolve && (
            item.linkedIssueId ? (
              <EscalatedActions issueId={item.linkedIssueId} />
            ) : (
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
            )
          )}
          {/* Thread discussion for this remediation */}
          {entityType === 'QUESTION_RESPONSE' && (
            <ActionItemThread entityId={entityId} item={item} visibility="ALL" />
          )}
        </div>
      ))}
      {/* ── Assignment trail — who was asked, and whether they are done ─── */}
      {assignments.map(item => {
        const done  = item.status === 'RESOLVED'
        const label = item.remediationType === 'REVIEWER_ASSIGNMENT'
          ? 'Assigned for evaluation'
          : item.remediationType === 'CONTRIBUTOR_REOPEN'
            ? 'Reopened for re-answer'
            : 'Assigned to answer'
        return (
          <div key={item.id}
            className={cn(
              'rounded-card border text-[11px]',
              done
                ? 'bg-surface-overlay border-border text-text-secondary'
                : 'bg-status-info-bg border-status-info-bd text-status-info-fg'
            )}>
            <div className="flex items-start gap-2 px-3 py-2">
              {done
                ? <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
                : <Clock size={12} className="shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold">{label}</span>
                  <span className="opacity-60">— {STATUS_LABEL[item.status] || item.status}</span>
                </div>
                <p className="text-[10px] opacity-60 mt-0.5">
                  {item.assignedToName ? `To ${item.assignedToName}` : ''}
                  {item.createdByName ? `${item.assignedToName ? ' · ' : ''}by ${item.createdByName}` : ''}
                  {item.createdAt ? ` · ${formatDate(item.createdAt)}` : ''}
                </p>
                {/* The resolution note is the audit trail: it says WHY this
                    closed — answered, evaluated, or reassigned away. */}
                {done && (
                  <p className="text-[10px] opacity-80 mt-0.5">
                    ✓ {item.resolutionNote || 'Completed'}
                    {item.resolvedByName ? ` — ${item.resolvedByName}` : ''}
                    {item.resolvedAt ? ` · ${formatDate(item.resolvedAt)}` : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}

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