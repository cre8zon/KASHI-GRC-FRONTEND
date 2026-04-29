/**
 * QuestionDrawer — right-side slide-in panel for full per-question context.
 *
 * This is the primary collaboration surface for KashiGRC, matching how
 * ServiceNow IRM and OneTrust handle per-item detail panels.
 *
 * Layout:
 *   ┌───────────────────────────────────┐
 *   │ Header: question + type + verdict │
 *   ├───────────────────────────────────┤
 *   │ Answer section (read-only)        │
 *   ├───────────────────────────────────┤
 *   │ Tabs: Shared | Internal | Actions │
 *   │        Evidence | Activity        │
 *   ├───────────────────────────────────┤
 *   │ Tab content (scrollable)          │
 *   └───────────────────────────────────┘
 *
 * Comment channels (fully isolated):
 *   Shared           → visibility: ALL          (both vendor + org see)
 *   Vendor internal  → visibility: VENDOR_INTERNAL (vendor only, org never sees)
 *   Org internal     → visibility: INTERNAL     (org only, vendor never sees)
 *
 * Tab visibility by side:
 *   Vendor side: Shared | Vendor internal | Action items | Evidence | Activity
 *   Org side:    Shared | Org internal    | Action items | Evidence | Activity
 *
 * Usage:
 *   const [drawerQ, setDrawerQ] = useState(null)
 *   <QuestionDrawer
 *     question={drawerQ}
 *     assessmentId={id}
 *     userSide="VENDOR"          // "VENDOR" | "ORGANIZATION"
 *     userRole="VENDOR_RESPONDER" // for CISO_ONLY gating
 *     mode="responder"           // "responder"|"contributor"|"reviewer"|"readonly"
 *     onClose={() => setDrawerQ(null)}
 *   />
 */

import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient }  from '@tanstack/react-query'
import {
  X, MessageSquare, Flag, Activity, Paperclip,
  CheckCircle2, Clock, AlertTriangle, Lock,
  Shield, ChevronRight,
} from 'lucide-react'
import { cn }                  from '../../lib/cn'
import { formatDate }          from '../../utils/format'
import { useSelector }         from 'react-redux'
import { selectRoles, selectAuth } from '../../store/slices/authSlice'
import { useQuestionComments } from '../../hooks/useComments'
import { useEntityActionItems } from '../../hooks/useActionItems'
import { CommentFeed }         from '../comments/CommentFeed'
import EvidenceUploader        from '../ui/EvidenceUploader'
import { ItemActionItems }     from './ItemActionItems'
import { ResponderActions }    from './ResponderActions'
import { commentsApi }         from '../../api/comments.api'
import toast                   from 'react-hot-toast'

// ── Verdict badge ──────────────────────────────────────────────────────────────

const VERDICT_CFG = {
  PASS:    { cls: 'bg-green-500/10 text-green-400 border-green-500/30',  label: 'Pass'    },
  PARTIAL: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: 'Partial' },
  FAIL:    { cls: 'bg-red-500/10 text-red-400 border-red-500/30',       label: 'Fail'    },
  ACCEPTED:           { cls: 'bg-green-500/10 text-green-400 border-green-500/30',  label: 'Accepted'           },
  OVERRIDDEN:         { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30',     label: 'Overridden'         },
  REVISION_REQUESTED: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: 'Revision requested' },
}

const VISIBILITY_ICON = {
  INTERNAL:        { Icon: Lock,   color: 'text-purple-400', label: 'Org internal' },
  VENDOR_INTERNAL: { Icon: Lock,   color: 'text-teal-400',   label: 'Vendor internal' },
  CISO_ONLY:       { Icon: Shield, color: 'text-indigo-400', label: 'CISO only' },
}

// ── Main drawer ────────────────────────────────────────────────────────────────

export function QuestionDrawer({
  question,     // full question object from the page's data
  assessmentId,
  userSide,     // 'VENDOR' | 'ORGANIZATION'
  userRole,     // e.g. 'VENDOR_RESPONDER', 'VENDOR_CISO', 'ORG_REVIEWER'
  mode,         // 'responder' | 'contributor' | 'reviewer' | 'readonly'
  onClose,
}) {
  const open = !!question
  const qiId = question?.questionInstanceId
  const resp = question?.currentResponse
  const qc = useQueryClient()

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // ADD this useEffect inside QuestionDrawer, right after the existing state declarations:

  useEffect(() => {
    const qId = question?.questionInstanceId
    if (!qId) return

    // Find the card and highlight it
    const el = document.querySelector(`[data-qi="${qId}"]`)
    if (el) {
      el.classList.add(
        'bg-brand-500/5',
        'border-l-2',
        'border-brand-500/50',
        '!pl-[calc(1.25rem-2px)]'  // compensate for the 2px border so text doesn't shift
      )
    }

    // Clean up when drawer closes or question changes
    return () => {
      if (el) {
        el.classList.remove(
          'bg-brand-500/5',
          'border-l-2',
          'border-brand-500/50',
          '!pl-[calc(1.25rem-2px)]'
        )
      }
    }
  }, [question?.questionInstanceId])
  
  // ── Tab definitions — vary by side ──────────────────────────────────────────
  const isVendorSide = userSide === 'VENDOR'
  const isOrgSide    = userSide === 'ORGANIZATION'
  const isCiso       = ['VENDOR_CISO','VENDOR_VRM'].includes(userRole)

  const { data: actionItems = [] } = useEntityActionItems('QUESTION_RESPONSE', qiId, {
    enabled: !!qiId,
  })
  const openActionCount = actionItems.filter(
    i => ['OPEN','IN_PROGRESS','PENDING_REVIEW','PENDING_VALIDATION'].includes(i.status)
  ).length

  const tabs = [
    { id: 'shared',   label: 'Shared',   Icon: MessageSquare, badge: null },
    isVendorSide
      ? { id: 'internal', label: 'Vendor notes', Icon: Lock, badge: null }
      : { id: 'internal', label: 'Org notes',    Icon: Lock, badge: null },
    { id: 'actions',  label: 'Actions',  Icon: Flag,         badge: openActionCount || null },
    { id: 'evidence', label: 'Evidence', Icon: Paperclip,    badge: null },
    { id: 'activity', label: 'Activity', Icon: Activity,     badge: null },
  ]

  const [activeTab, setActiveTab] = useState('shared')

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 bg-black/30 z-40 transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      />

      {/* Drawer panel */}
      <div className={cn(
        'fixed top-0 right-0 h-full z-50 flex flex-col',
        'bg-surface border-l border-border shadow-2xl',
        'w-full sm:w-[520px] lg:w-[560px]',
        'transition-transform duration-250 ease-out',
        open ? 'translate-x-0' : 'translate-x-full'
      )}>
        {open && question && (
          <>
            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="flex items-start gap-3 px-5 py-4 border-b border-border bg-surface flex-shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[10px] bg-surface-overlay border border-border px-1.5 py-0.5 rounded text-text-muted uppercase tracking-wide">
                    {question.responseType?.replace(/_/g,' ')}
                  </span>
                  {question.mandatory && (
                    <span className="text-[9px] text-red-400 font-semibold">Required</span>
                  )}
                  {question.weight > 0 && (
                    <span className="text-[10px] text-text-muted font-mono">{question.weight} pts</span>
                  )}
                  {/* Verdict / responder status badges */}
                  {resp?.reviewerStatus && VERDICT_CFG[resp.reviewerStatus] && (
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                      VERDICT_CFG[resp.reviewerStatus].cls
                    )}>
                      {VERDICT_CFG[resp.reviewerStatus].label}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-text-primary leading-snug">
                  {question.questionText}
                </p>
                {question.assignedUserName && (
                  <p className="text-[11px] text-text-muted mt-1">
                    Assigned to {question.assignedUserName}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="shrink-0 p-1.5 rounded-lg hover:bg-surface-overlay text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Answer section ──────────────────────────────────────── */}
            {resp && (
              <div className="px-5 py-3 border-b border-border bg-surface-overlay/30 flex-shrink-0">
                <AnswerPreview question={question} resp={resp} />
              </div>
            )}

            {/* ── Responder command actions (vendor side only) ─────────── */}
            {mode === 'responder' && question.assignedUserId && resp && (
              <div className="px-5 py-3 border-b border-border flex-shrink-0">
                <p className="text-[10px] text-text-muted mb-2 font-medium uppercase tracking-wide">
                  Responder actions
                </p>
                <ResponderActions
                  assessmentId={assessmentId}
                  questionInstanceId={qiId}
                  assignedUserId={question.assignedUserId}
                  responderStatus={resp?.reviewerStatus}
                  responseType={question.responseType}
                />
              </div>
            )}

            {/* ── Tab bar ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-0 border-b border-border flex-shrink-0 overflow-x-auto px-2">
              {tabs.map(({ id, label, Icon, badge }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
                    activeTab === id
                      ? 'border-brand-500 text-brand-400'
                      : 'border-transparent text-text-muted hover:text-text-secondary'
                  )}>
                  <Icon size={12} />
                  {label}
                  {badge != null && badge > 0 && (
                    <span className="text-[9px] font-bold px-1 rounded-full bg-amber-500/20 text-amber-400">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Tab content (scrollable) ─────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-5 py-4">
                {activeTab === 'shared' && (
                  <SharedTab
                    qiId={qiId}
                    assessmentId={assessmentId}
                    canComment={mode !== 'readonly'}
                    userSide={userSide}
                  />
                )}
                {activeTab === 'internal' && (
                  <InternalTab
                    qiId={qiId}
                    assessmentId={assessmentId}
                    canComment={mode !== 'readonly'}
                    userSide={userSide}
                    userRole={userRole}
                  />
                )}
                {activeTab === 'actions' && (
                  <ItemActionItems
                    entityType="QUESTION_RESPONSE"
                    entityId={qiId}
                    assessmentId={assessmentId}
                    mode={mode}
                  />
                )}
                {activeTab === 'evidence' && (
                  <EvidenceUploader
                    entityType="QUESTION_RESPONSE"
                    entityId={qiId}
                    canUpload={mode !== 'readonly'}
                    canRemove={mode === 'responder' || mode === 'reviewer'}
                    emptyLabel="No evidence attached yet."
                  />
                )}
                {activeTab === 'activity' && (
                  <ActivityTab qiId={qiId} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ── Answer preview ─────────────────────────────────────────────────────────────

function AnswerPreview({ question, resp }) {
  const isMulti  = question.responseType === 'MULTI_CHOICE'
  const isSingle = question.responseType === 'SINGLE_CHOICE'
  const isText   = !isMulti && !isSingle && question.responseType !== 'FILE_UPLOAD'

  const multiIds = (() => {
    if (resp?.selectedOptionInstanceIds?.length) return resp.selectedOptionInstanceIds.map(Number)
    if (resp?.responseText?.startsWith('[')) {
      try { return JSON.parse(resp.responseText).map(Number) } catch { return [] }
    }
    return []
  })()

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={12} className="text-green-400 shrink-0" />
        <span className="text-[10px] text-text-muted">
          {resp.answeredByName ? `Answered by ${resp.answeredByName}` : 'Answered'}
          {resp.submittedAt && ` · ${formatDate(resp.submittedAt)}`}
        </span>
        {resp.scoreEarned != null && question.weight > 0 && (
          <span className="text-[10px] font-mono text-green-400 ml-auto">
            {resp.scoreEarned}/{question.weight} pts
          </span>
        )}
      </div>

      {isText && resp.responseText && (
        <div className="px-3 py-2 rounded-lg bg-surface border border-border">
          <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
            {resp.responseText}
          </p>
        </div>
      )}

      {(isSingle || isMulti) && question.options?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {question.options.map(opt => {
            const sel = isSingle
              ? Number(opt.optionInstanceId) === Number(resp.selectedOptionInstanceId)
              : multiIds.includes(Number(opt.optionInstanceId))
            return (
              <span key={opt.optionInstanceId}
                className={cn(
                  'text-xs px-2 py-0.5 rounded border',
                  sel
                    ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 font-medium'
                    : 'border-border text-text-muted opacity-40'
                )}>
                {opt.optionValue}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Shared tab — visibility: ALL ───────────────────────────────────────────────
// Both vendor and org sides see this channel. Used for:
//   - Revision requests (responder → contributor)
//   - Formal notices visible to both parties
//   - Resolution acknowledgements

function SharedTab({ qiId, assessmentId, canComment, userSide }) {
  const { comments, isLoading, addComment, adding } = useQuestionComments(
    qiId, { enabled: !!qiId }
  )

  const sharedComments = comments.filter(c =>
    c.visibility === 'ALL' || !c.visibility
  ).filter(c => c.commentType !== 'SYSTEM')

  const handleAddComment = (data) => addComment({
    ...data,
    questionInstanceId: qiId,
    visibility: 'ALL',
  })

  const handleResolveRevision = (parentCommentId) => addComment({
    commentText: 'Marked as resolved.',
    commentType: 'RESOLVED',
    visibility: 'ALL',
    parentCommentId,
    questionInstanceId: qiId,
  })

  return (
    <div className="space-y-3">
      <ChannelLabel
        color="text-text-secondary"
        label="Visible to both sides"
        description="Use this channel for revision requests and formal notices."
      />
      <CommentFeed
        comments={sharedComments}
        isLoading={isLoading}
        addComment={handleAddComment}
        adding={adding}
        canEdit={canComment}
        onResolve={handleResolveRevision}
        showVisibility={false}
        showType={true}
        emptyMessage="No shared discussion yet."
      />
    </div>
  )
}

// ── Internal tab — VENDOR_INTERNAL (vendor) or INTERNAL (org) ─────────────────
// Private to one side. The other side never sees these comments.

function InternalTab({ qiId, assessmentId, canComment, userSide, userRole }) {
  const isVendorSide = userSide === 'VENDOR'
  const myVisibility = isVendorSide ? 'VENDOR_INTERNAL' : 'INTERNAL'

  const { comments, isLoading, addComment, adding } = useQuestionComments(
    qiId, { enabled: !!qiId }
  )

  // Filter to only this side's private comments
  const privateComments = comments.filter(c => c.visibility === myVisibility)

  const handleAddComment = (data) => addComment({
    ...data,
    questionInstanceId: qiId,
    visibility: myVisibility,
  })

  return (
    <div className="space-y-3">
      <ChannelLabel
        color={isVendorSide ? 'text-teal-400' : 'text-purple-400'}
        label={isVendorSide ? 'Vendor-only · never visible to org reviewer' : 'Org-only · never visible to vendor'}
        description={isVendorSide
          ? 'Responder ↔ contributor internal notes. Org reviewers cannot see this.'
          : 'Reviewer ↔ assistant internal notes. Vendor cannot see this.'}
        Icon={Lock}
      />
      <CommentFeed
        comments={privateComments}
        isLoading={isLoading}
        addComment={handleAddComment}
        adding={adding}
        canEdit={canComment}
        showVisibility={false}
        showType={false}
        emptyMessage={`No ${isVendorSide ? 'vendor-internal' : 'org-internal'} notes yet.`}
      />
    </div>
  )
}

// ── Activity tab — SYSTEM events ──────────────────────────────────────────────

function ActivityTab({ qiId }) {
  const { comments, isLoading } = useQuestionComments(qiId, { enabled: !!qiId })
  const systemEvents = comments.filter(c => c.commentType === 'SYSTEM')

  if (isLoading) return <div className="h-3 w-24 bg-surface-overlay rounded animate-pulse" />

  if (!systemEvents.length)
    return <p className="text-xs text-text-muted italic">No activity recorded yet.</p>

  return (
    <div className="space-y-0">
      {systemEvents.map((ev, i) => (
        <div key={ev.id || i} className="flex items-start gap-2.5 py-2.5 border-b border-border/40 last:border-0">
          <div className="w-1.5 h-1.5 rounded-full bg-border mt-2 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-secondary leading-relaxed">{ev.commentText}</p>
            <p className="text-[10px] text-text-muted mt-0.5">
              {ev.createdByName && <span>{ev.createdByName} · </span>}
              {formatDate(ev.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── ChannelLabel — describes what a tab is for ─────────────────────────────────

function ChannelLabel({ color, label, description, Icon }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-overlay/50 border border-border/60">
      {Icon && <Icon size={12} className={cn('shrink-0 mt-0.5', color)} />}
      <div>
        <p className={cn('text-[10px] font-semibold', color)}>{label}</p>
        {description && <p className="text-[10px] text-text-muted mt-0.5">{description}</p>}
      </div>
    </div>
  )
}
