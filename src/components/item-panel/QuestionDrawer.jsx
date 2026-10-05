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
 *   │ Answer section (interactive or RO)│
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

import { useState, useEffect }      from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSelector }           from 'react-redux'
import {
  X, MessageSquare, Flag, Activity, Paperclip, Lock,
} from 'lucide-react'
import { cn }                    from '../../lib/cn'
import { formatDate }            from '../../utils/format'
import { selectAuth }            from '../../store/slices/authSlice'
import { useQuestionComments }   from '../../hooks/useComments'
import { useEntityActionItems }  from '../../hooks/useActionItems'
import { CommentFeed }           from '../comments/CommentFeed'
import EvidenceUploader          from '../ui/EvidenceUploader'
import { ItemActionItems }       from './ItemActionItems'
import { ResponderActions }      from './ResponderActions'
import { QuestionItemCard }      from '../vendor/QuestionItemCard'
import { invalidateAssessment }  from '../vendor/vendorShared'
import { assessmentsApi }        from '../../api/assessments.api'
import toast                     from 'react-hot-toast'

// ── Verdict badge ──────────────────────────────────────────────────────────────

const VERDICT_CFG = {
  PASS:    { cls: 'bg-status-pass-bg text-status-pass-fg border-status-pass-bd',  label: 'Pass'    },
  PARTIAL: { cls: 'bg-status-warn-bg text-status-warn-fg border-status-warn-bd', label: 'Partial' },
  FAIL:    { cls: 'bg-status-fail-bg text-status-fail-fg border-status-fail-bd',       label: 'Fail'    },
  ACCEPTED:           { cls: 'bg-status-pass-bg text-status-pass-fg border-status-pass-bd',  label: 'Accepted by responder' },
  OVERRIDDEN:         { cls: 'bg-status-info-bg text-status-info-fg border-status-info-bd',     label: 'Overridden'            },
  REVISION_REQUESTED: { cls: 'bg-status-warn-bg text-status-warn-fg border-status-warn-bd', label: 'Revision requested'    },
  // PENDING is the default server value before any verdict action — never show it as a badge
}

// ── Main drawer ────────────────────────────────────────────────────────────────

export function QuestionDrawer({
  question,     // full question object from the page's data
  assessmentId,
  userSide,     // 'VENDOR' | 'ORGANIZATION'
  userRole,     // e.g. 'VENDOR_RESPONDER', 'VENDOR_CISO', 'ORG_REVIEWER'
  mode,         // 'responder' | 'contributor' | 'reviewer' | 'readonly'
  // Which tab to land on, from the caller. The question card's Discuss and
  // Evidence buttons now open this drawer instead of expanding panels of their
  // own, so they need to say where they are going. Null means the default,
  // which is still Actions.
  initialTab,
  // ── WHETHER THE SECTION IS OPEN FOR EDITS, FROM THE CALLER ──────────────
  //
  // This drawer has never known about section locks. It decided answerability
  // from `mode` alone, so a contributor who had locked their answers — or whose
  // responder had submitted the whole section — could still edit every question
  // from here, with no revision having been requested. The list behind it was
  // read-only at the same moment.
  //
  // The lock is per section and this component is handed one question, so it
  // cannot work it out; the caller can and now does.
  //
  // undefined keeps the old mode-only behaviour, deliberately: the hardcoded
  // pages still mount this drawer and have not been taught to pass it, and
  // changing them is not part of this.
  canAnswer,
  onClose,
}) {
  const open = !!question
  const qiId = question?.questionInstanceId
  const resp = question?.currentResponse
  const { userId: viewerId } = useSelector(selectAuth)

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

  // Highlight the question card in the background
  useEffect(() => {
    if (!qiId) return
    const el = document.querySelector(`[data-qi="${qiId}"]`)
    if (el) {
      el.classList.add('bg-brand-500/5', 'border-l-2', 'border-brand-500/50')
    }
    return () => {
      if (el) el.classList.remove('bg-brand-500/5', 'border-l-2', 'border-brand-500/50')
    }
  }, [qiId])

  // ── Tab definitions — vary by side ──────────────────────────────────────────
  const isVendorSide = userSide === 'VENDOR'
  const isOrgSide    = userSide === 'ORGANIZATION'

  const { data: actionItems = [] } = useEntityActionItems('QUESTION_RESPONSE', qiId, {
    enabled: !!qiId,
  })
  // Exclude assignment-tracking items from badge — they are not user-facing work items
  const ASSIGNMENT_TYPES = ['CONTRIBUTOR_ASSIGNMENT', 'REVIEWER_ASSIGNMENT']
  const openActionCount = actionItems.filter(
    i => ['OPEN','IN_PROGRESS','PENDING_REVIEW','PENDING_VALIDATION'].includes(i.status)
      && !ASSIGNMENT_TYPES.includes(i.remediationType)
  ).length

  // ── ACTIONS FIRST, AND THE DEFAULT ──────────────────────────────────────
  //
  // Shared was first and default, which put a conversation ahead of the state
  // of the work. Actions is what HAPPENED on this question — assigned to whom,
  // answered, locked, revision requested, finding raised, remediation
  // validated — and that is what somebody opening a question needs before they
  // need anybody's remarks.
  //
  // It is also the tab that is now never empty on a question that has been
  // assigned, because the assignment item itself renders there. Before that it
  // was often blank, which is the usual reason a panel like this does not get
  // promoted.
  //
  // An empty Actions tab still beats landing on Shared: "No action items" says
  // nothing has happened here, which is information. A fixed default is also
  // predictable in a way that "whichever tab has content" is not.
  const tabs = [
    { id: 'actions',  label: 'Actions',  Icon: Flag,         badge: openActionCount || null },
    { id: 'shared',   label: 'Shared',   Icon: MessageSquare, badge: null },
    isVendorSide
      ? { id: 'internal', label: 'Vendor notes', Icon: Lock, badge: null }
      : { id: 'internal', label: 'Org notes',    Icon: Lock, badge: null },
    { id: 'evidence', label: 'Evidence', Icon: Paperclip,    badge: null },
    { id: 'activity', label: 'Activity', Icon: Activity,     badge: null },
  ]

  const [activeTab, setActiveTab] = useState(initialTab || 'actions')

  // Which tab to land on, in priority order:
  //
  //   1. initialTab — the caller asked. Discuss and Evidence on the question
  //      card are now this drawer opening on a tab rather than panels of their
  //      own, and ignoring what they asked for would send somebody who pressed
  //      Evidence to Actions.
  //   2. Evidence for a FILE_UPLOAD question on the vendor side, because the
  //      attachment IS the answer and landing anywhere else is a detour.
  //   3. Actions.
  //
  // Keyed on qiId AND initialTab so pressing Evidence and then Discuss on the
  // same question moves the tab the second time too — qiId alone would make
  // the second press do nothing.
  useEffect(() => {
    if (!open || !question) return
    if (initialTab) {
      setActiveTab(initialTab)
    } else if (question.responseType === 'FILE_UPLOAD'
               && (mode === 'contributor' || mode === 'responder')) {
      setActiveTab('evidence')
    } else {
      setActiveTab('actions')
    }
  }, [qiId, initialTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── MAY THIS VIEWER ANSWER ──────────────────────────────────────────────
  //
  // Contributor: their assigned questions. Responder: only questions NOT
  // delegated to a contributor.
  //
  // FILE_UPLOAD is no longer excluded here. It used to be, because the drawer's
  // own input could not render an uploader — the card can, and it sends the
  // viewer to the Evidence tab, which is the same answer arrived at through one
  // path instead of three special cases.
  //
  // Two gates, and they are not the same question.
  //
  //   modeAllowsAnswer  is this viewer on the side that answers this question.
  //                     Never lifted by anything — an organisation reviewer
  //                     does not get to edit the vendor's answer because they
  //                     hold a clarification.
  //   editableNow       is it open for editing right now, lock included. An
  //                     open obligation on the question lifts THIS one, inside
  //                     QuestionItemCard, exactly as the list row does — which
  //                     is new behaviour here and the bug the refactor was
  //                     worth doing for: a contributor sent a revision on a
  //                     locked section could previously read the request in
  //                     this drawer and had no way to answer it.
  const modeAllowsAnswer =
    mode === 'contributor' ||
    (mode === 'responder' && !question?.assignedUserId)

  const editableNow = canAnswer === undefined
    ? modeAllowsAnswer
    : (canAnswer && modeAllowsAnswer)

  // The answer save, lifted out of the deleted DrawerAnswerInput so the card
  // stays presentational and every surface keeps its own invalidation list.
  //
  // Both sets of keys, not a swap: the hardcoded pages are still deployed and a
  // stale key invalidates nothing, so carrying all six costs nothing and loses
  // nobody.
  const qc = useQueryClient()
  // One list, in vendorShared. It used to be written out here, in
  // ResponderActions and in the fill tab's save, and the three had already
  // drifted — which is how two different "the button does nothing" reports
  // turned out to be the same missing key.
  const invalidateAssessmentLists = () => invalidateAssessment(qc, assessmentId, qiId)

  const { mutate: saveAnswer, isPending: savingAnswer } = useMutation({
    mutationFn: (data) => assessmentsApi.vendor.respond(assessmentId, data),
    onSuccess: invalidateAssessmentLists,
    onError: (e) => toast.error(e?.message || 'Failed to save'),
  })

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 bg-on-dark-inv/30 z-40 transition-opacity duration-200',
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
                    <span className="text-[9px] text-status-fail-fg font-semibold">Required</span>
                  )}
                  {question.weight > 0 && (
                    <span className="text-[10px] text-text-muted font-mono">{question.weight} pts</span>
                  )}
                  {resp?.reviewerStatus && resp.reviewerStatus !== 'PENDING' && VERDICT_CFG[resp.reviewerStatus] && (
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
                className="shrink-0 p-1.5 rounded-card hover:bg-surface-overlay text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Answer section ──────────────────────────────────────────
                One component, the same one the list rows use. It was three
                branches and two bespoke components here — an interactive
                input, a read-only preview, and two FILE_UPLOAD notices —
                which is how the drawer and the list drifted into disagreeing
                about what "answered" meant and which is why the obligation
                unlock only ever worked in one of them.

                onOpenDrawer is the drawer switching its OWN tab. The card
                calls it to send someone to Evidence; out in a list the same
                call opens this drawer. Same prop, same meaning — "take me to
                that tab" — implemented by whoever owns the tabs. */}
            {/* max-h + overflow: this block is flex-shrink-0 inside a column
                whose only scrolling child is the tab content below. A question
                with a dozen options, or an override panel expanded under it,
                grew past the drawer's height and was CLIPPED — no scrollbar,
                no indication, and the controls at the bottom of it simply did
                not exist on screen. That is what "I selected an option and
                nothing happened" was: the Override answer button was below the
                cut. Bounded and scrollable, so whatever is in here is always
                reachable. */}
            <div className="px-5 py-3 border-b border-border bg-surface-overlay/30 flex-shrink-0 max-h-[45vh] overflow-y-auto">
              {!resp && !editableNow && question.responseType !== 'FILE_UPLOAD' ? (
                <p className="text-xs text-text-muted italic">Not answered yet.</p>
              ) : (
                <QuestionItemCard
                  variant="panel"
                  question={question}
                  assessmentId={assessmentId}
                  editable={editableNow}
                  answerable={modeAllowsAnswer}
                  viewerId={viewerId}
                  saving={savingAnswer ? qiId : null}
                  onSave={(payload) => saveAnswer(payload)}
                  onOpenDrawer={(_q, tab) => setActiveTab(tab)}
                />
              )}
            </div>

            {/* ── Responder command actions (vendor side only) ─────────── */}
            {mode === 'responder' && question.assignedUserId && resp && (
              // Same bound as the answer block above, and for the same reason:
              // the revision and override panels expand inside here.
              <div className="px-5 py-3 border-b border-border flex-shrink-0 max-h-[55vh] overflow-y-auto">
                <p className="text-[10px] text-text-muted mb-2 font-medium uppercase tracking-wide">
                  Responder actions
                </p>
                <ResponderActions
                  assessmentId={assessmentId}
                  questionInstanceId={qiId}
                  assignedUserId={question.assignedUserId}
                  responderStatus={resp?.reviewerStatus}
                  responseType={question.responseType}
                  options={question.options || []}
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
                      ? 'border-brand-500 text-brand-ink'
                      : 'border-transparent text-text-muted hover:text-text-secondary'
                  )}>
                  <Icon size={12} />
                  {label}
                  {badge != null && badge > 0 && (
                    <span className="text-[9px] font-bold px-1 rounded-full bg-status-warn-bg text-status-warn-fg">
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
                    // Only vendor side can upload — org reviewers see evidence read-only
                    canUpload={isVendorSide && mode !== 'readonly'}
                    canRemove={isVendorSide && (mode === 'responder' || mode === 'contributor')}
                    emptyLabel="No evidence attached yet."
                    // ── THE LISTS BEHIND THE DRAWER HAVE TO MOVE TOO ────────
                    // useUploadDocument invalidates the DOCUMENT keys only, so
                    // without this an upload here left the section payload
                    // stale — and that payload is where evidenceCount comes
                    // from, which decides whether a FILE_UPLOAD question reads
                    // as answered and whether the evidence-required badge turns
                    // green. The row's old inline evidence panel passed the
                    // same callback; this drawer never did, which did not show
                    // while the row had its own uploader and would have started
                    // showing the moment it lost it.
                    onUploadSuccess={invalidateAssessmentLists}
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

// ── Shared tab — visibility: ALL ───────────────────────────────────────────────

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
        questionInstanceId={qiId}
      />
    </div>
  )
}

// ── Internal tab — VENDOR_INTERNAL (vendor) or INTERNAL (org) ─────────────────

function InternalTab({ qiId, assessmentId, canComment, userSide, userRole }) {
  const isVendorSide = userSide === 'VENDOR'
  const myVisibility = isVendorSide ? 'VENDOR_INTERNAL' : 'INTERNAL'

  const { comments, isLoading, addComment, adding } = useQuestionComments(
    qiId, { enabled: !!qiId }
  )

  const privateComments = comments.filter(c => c.visibility === myVisibility)

  const handleAddComment = (data) => addComment({
    ...data,
    questionInstanceId: qiId,
    visibility: myVisibility,
  })

  return (
    <div className="space-y-3">
      <ChannelLabel
        color={isVendorSide ? 'text-brand-ink' : 'text-status-tag-fg'}
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
        questionInstanceId={qiId}
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
    <div className="flex items-start gap-2 px-3 py-2 rounded-card bg-surface-overlay/50 border border-border/60">
      {Icon && <Icon size={12} className={cn('shrink-0 mt-0.5', color)} />}
      <div>
        <p className={cn('text-[10px] font-semibold', color)}>{label}</p>
        {description && <p className="text-[10px] text-text-muted mt-0.5">{description}</p>}
      </div>
    </div>
  )
}