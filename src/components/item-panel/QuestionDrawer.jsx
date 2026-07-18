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
import {
  X, MessageSquare, Flag, Activity, Paperclip,
  CheckCircle2, Lock, Shield, Save, Loader2,
} from 'lucide-react'
import { cn }                    from '../../lib/cn'
import { formatDate }            from '../../utils/format'
import { useQuestionComments }   from '../../hooks/useComments'
import { useEntityActionItems }  from '../../hooks/useActionItems'
import { CommentFeed }           from '../comments/CommentFeed'
import EvidenceUploader          from '../ui/EvidenceUploader'
import { ItemActionItems }       from './ItemActionItems'
import { ResponderActions }      from './ResponderActions'
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

// ── DrawerAnswerInput — interactive answer for contributor/responder ────────────
// Shows answerable inputs (text, single choice, multi choice) inside the drawer.
// FILE_UPLOAD is excluded — user uploads evidence via the Evidence tab instead.

function DrawerAnswerInput({ question, assessmentId }) {
  const qc = useQueryClient()
  const { mutate: submitAnswer, isPending } = useMutation({
    mutationFn: (data) => assessmentsApi.vendor.respond(assessmentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-sections-fill', assessmentId] })
      qc.invalidateQueries({ queryKey: ['my-contributor-questions', assessmentId] })
      qc.invalidateQueries({ queryKey: ['assessment-fill', assessmentId] })
    },
    onError: (e) => toast.error(e?.message || 'Failed to save'),
  })

  const resp = question.currentResponse

  // ── TEXT state ──────────────────────────────────────────────────────────
  const [localText, setLocalText] = useState(resp?.responseText || '')
  const [dirty, setDirty]         = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  // ── SINGLE_CHOICE: optimistic selection — mirrors VendorAssessmentFillPage ─
  const [selectedOption, setSelectedOption] = useState(
    resp?.selectedOptionInstanceId != null ? Number(resp.selectedOptionInstanceId) : null
  )

  // ── MULTI_CHOICE: optimistic set + per-option pending dedup guard ──────
  const multiIdsKey = JSON.stringify(resp?.selectedOptionInstanceIds ?? [])
  const [selectedMulti, setMulti] = useState(() => new Set(
    resp?.selectedOptionInstanceIds?.map(Number) ??
    (resp?.selectedOptionInstanceId != null ? [Number(resp.selectedOptionInstanceId)] : [])
  ))
  const [pendingOptionIds, setPendingOptionIds] = useState(new Set())

  // Sync all local state when server data refreshes after cache invalidation
  useEffect(() => {
    if (!dirty) setLocalText(resp?.responseText || '')
    setSelectedOption(resp?.selectedOptionInstanceId != null ? Number(resp.selectedOptionInstanceId) : null)
    setMulti(new Set(
      resp?.selectedOptionInstanceIds?.map(Number) ??
      (resp?.selectedOptionInstanceId != null ? [Number(resp.selectedOptionInstanceId)] : [])
    ))
    setPendingOptionIds(new Set())
  }, [resp?.responseId, multiIdsKey])

  // ── TEXT ──────────────────────────────────────────────────────────────────
  if (question.responseType === 'TEXT') {
    const hasSaved = !!resp?.responseText
    const saveText = () => {
      if (!localText.trim()) return
      submitAnswer(
        { questionInstanceId: question.questionInstanceId, responseText: localText },
        { onSuccess: () => { setDirty(false); setJustSaved(true); setTimeout(() => setJustSaved(false), 2000) } }
      )
    }
    return (
      <div className="space-y-2">
        {hasSaved && !dirty ? (
          <div className="group relative px-3 py-2.5 rounded-card bg-status-pass-bg border border-status-pass-bd">
            <p className="text-xs text-text-secondary leading-relaxed pr-12 whitespace-pre-wrap">{resp.responseText}</p>
            <button
              onClick={() => { setLocalText(resp.responseText); setDirty(true) }}
              className="absolute right-2 top-2 text-[10px] text-text-muted hover:text-brand-400 border border-border rounded px-1.5 py-0.5 transition-colors">
              Edit
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <textarea
              value={localText}
              onChange={e => { setLocalText(e.target.value); setDirty(true) }}
              rows={3}
              autoFocus={dirty}
              placeholder="Type your answer…"
              className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                disabled={!localText.trim() || isPending}
                onClick={saveText}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30 hover:bg-brand-500/30 disabled:opacity-40 transition-colors">
                {isPending ? <Loader2 size={10} className="animate-spin"/> : <Save size={10}/>}
                {hasSaved ? 'Update' : 'Save'}
              </button>
              {hasSaved && dirty && (
                <button onClick={() => { setDirty(false); setLocalText(resp.responseText) }}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors">
                  Cancel
                </button>
              )}
              {justSaved && (
                <span className="text-xs text-status-pass-fg flex items-center gap-1">
                  <CheckCircle2 size={10}/> Saved
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── SINGLE CHOICE ─────────────────────────────────────────────────────────
  if (question.responseType === 'SINGLE_CHOICE') {
    const saveOption = (optionInstanceId) => {
      const id = Number(optionInstanceId)
      if (selectedOption === id) return // already selected — no-op
      setSelectedOption(id) // optimistic
      submitAnswer(
        { questionInstanceId: question.questionInstanceId, selectedOptionInstanceId: id },
        {
          onSuccess: () => { setJustSaved(true); setTimeout(() => setJustSaved(false), 1500) },
          onError:   () => setSelectedOption(resp?.selectedOptionInstanceId != null ? Number(resp.selectedOptionInstanceId) : null),
        }
      )
    }
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {question.options?.map(opt => {
            const id       = Number(opt.optionInstanceId)
            const selected = selectedOption === id
            return (
              <button key={opt.optionInstanceId}
                onClick={() => saveOption(opt.optionInstanceId)}
                className={cn(
                  'text-xs px-2.5 py-1.5 rounded border transition-all flex items-center gap-1',
                  selected
                    ? 'bg-brand-500/20 border-brand-500/50 text-brand-300 font-medium'
                    : 'bg-surface-overlay border-border text-text-secondary hover:border-brand-500/30 hover:text-text-primary'
                )}>
                {opt.optionValue}
                {opt.score != null && (
                  <span className={cn('text-[10px]', selected ? 'text-brand-400/70' : 'opacity-40')}>
                    {opt.score}pts
                  </span>
                )}
                {selected && <CheckCircle2 size={10} className="text-brand-400"/>}
              </button>
            )
          })}
        </div>
        {justSaved && (
          <span className="text-xs text-status-pass-fg flex items-center gap-1">
            <CheckCircle2 size={10}/> Saved
          </span>
        )}
      </div>
    )
  }

  // ── MULTI CHOICE ──────────────────────────────────────────────────────────
  if (question.responseType === 'MULTI_CHOICE') {
    const toggleMulti = (optionInstanceId) => {
      const id = Number(optionInstanceId)
      // Dedup guard: ignore double-click while this option's mutation is in-flight
      if (pendingOptionIds.has(id)) return

      const next = new Set(selectedMulti)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setMulti(next) // optimistic
      setPendingOptionIds(p => new Set([...p, id]))

      submitAnswer(
        { questionInstanceId: question.questionInstanceId, selectedOptionInstanceIds: [id] },
        {
          onSuccess: () => {
            setPendingOptionIds(p => { const s = new Set(p); s.delete(id); return s })
            setJustSaved(true); setTimeout(() => setJustSaved(false), 1500)
          },
          onError: () => {
            setMulti(selectedMulti) // rollback
            setPendingOptionIds(p => { const s = new Set(p); s.delete(id); return s })
          },
        }
      )
    }
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {question.options?.map(opt => {
            const id               = Number(opt.optionInstanceId)
            const selected         = selectedMulti.has(id)
            const thisOptPending   = pendingOptionIds.has(id)
            return (
              <button key={opt.optionInstanceId}
                onClick={() => toggleMulti(opt.optionInstanceId)}
                disabled={thisOptPending}
                className={cn(
                  'text-xs px-2.5 py-1.5 rounded border transition-all flex items-center gap-1.5',
                  selected
                    ? 'bg-brand-500/20 border-brand-500/50 text-brand-300 font-medium'
                    : 'bg-surface-overlay border-border text-text-secondary hover:border-brand-500/30 hover:text-text-primary',
                  thisOptPending && 'opacity-60'
                )}>
                <span className={cn(
                  'w-3 h-3 rounded-ctl border flex-shrink-0 flex items-center justify-center',
                  selected ? 'bg-brand-500 border-brand-500' : 'border-current opacity-50'
                )}>
                  {selected && <CheckCircle2 size={9} className="text-on-dark"/>}
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
          <p className="text-[10px] text-text-muted">
            {selectedMulti.size} option{selectedMulti.size > 1 ? 's' : ''} selected
          </p>
        )}
        {justSaved && (
          <span className="text-xs text-status-pass-fg flex items-center gap-1">
            <CheckCircle2 size={10}/> Saved
          </span>
        )}
      </div>
    )
  }

  // ── FILE_UPLOAD — redirect to Evidence tab ────────────────────────────────
  if (question.responseType === 'FILE_UPLOAD') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-card bg-status-warn-bg border border-status-warn-bd">
        <Paperclip size={12} className="text-status-warn-fg shrink-0" />
        <p className="text-xs text-status-warn-fg">
          Upload evidence in the <span className="font-medium">Evidence tab</span> below.
        </p>
      </div>
    )
  }

  // Fallback for other types — show read-only if answered
  if (resp) return <AnswerPreview question={question} resp={resp} />
  return <p className="text-xs text-text-muted italic">Use the question card below to answer.</p>
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

  // Auto-switch to Evidence tab for FILE_UPLOAD questions opened by vendor-side users
  // so they land directly on the upload interface instead of having to discover it
  useEffect(() => {
    if (!open || !question) return
    if (question.responseType === 'FILE_UPLOAD' && (mode === 'contributor' || mode === 'responder')) {
      setActiveTab('evidence')
    } else {
      setActiveTab('shared')
    }
  }, [qiId]) // only when the question changes, not on mode changes

  // Determine if user can answer from drawer
  // Contributor: always can answer their assigned questions
  // Responder: can answer only questions NOT assigned to a contributor
  const canAnswerInDrawer = (
    mode === 'contributor' ||
    (mode === 'responder' && !question?.assignedUserId)
  ) && question?.responseType !== 'FILE_UPLOAD'

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

            {/* ── Answer section ──────────────────────────────────────── */}
            <div className="px-5 py-3 border-b border-border bg-surface-overlay/30 flex-shrink-0">
              {/* FILE_UPLOAD: always redirect to Evidence tab for vendor-side modes */}
              {question.responseType === 'FILE_UPLOAD' && (mode === 'contributor' || mode === 'responder') && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-card bg-status-warn-bg border border-status-warn-bd">
                  <Paperclip size={12} className="text-status-warn-fg shrink-0" />
                  <span className="text-xs text-status-warn-fg">
                    Use the{' '}
                    <button
                      type="button"
                      onClick={() => setActiveTab('evidence')}
                      className="font-semibold underline underline-offset-2 hover:text-status-warn-fg transition-colors"
                    >Evidence tab</button>
                    {' '}below to upload your file.
                  </span>
                </div>
              )}

              {/* FILE_UPLOAD read-only (reviewer or readonly mode) */}
              {question.responseType === 'FILE_UPLOAD' && (mode === 'reviewer' || mode === 'readonly') && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-card bg-surface-overlay/50 border border-border">
                  <Paperclip size={12} className="text-text-muted shrink-0" />
                  <p className="text-xs text-text-muted">See the <span className="font-medium">Evidence tab</span> for uploaded files.</p>
                </div>
              )}

              {/* Interactive answer input for contributor or responder (non-FILE_UPLOAD unassigned questions) */}
              {canAnswerInDrawer && (
                <DrawerAnswerInput question={question} assessmentId={assessmentId} />
              )}

              {/* Read-only answer preview for reviewer/readonly or responder when assigned to contributor */}
              {!canAnswerInDrawer && question.responseType !== 'FILE_UPLOAD' && resp && (
                <AnswerPreview question={question} resp={resp} />
              )}

              {/* Nothing answered yet — read-only viewers, non-FILE_UPLOAD */}
              {!canAnswerInDrawer && question.responseType !== 'FILE_UPLOAD' && !resp && (
                <p className="text-xs text-text-muted italic">Not answered yet.</p>
              )}
            </div>

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

// ── Answer preview (read-only) ─────────────────────────────────────────────────

function AnswerPreview({ question, resp }) {
  const isMulti  = question.responseType === 'MULTI_CHOICE'
  const isSingle = question.responseType === 'SINGLE_CHOICE'
  const isFile   = question.responseType === 'FILE_UPLOAD'
  const isText   = !isMulti && !isSingle && !isFile

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
        <CheckCircle2 size={12} className="text-status-pass-fg shrink-0" />
        <span className="text-[10px] text-text-muted">
          {resp.answeredByName ? `Answered by ${resp.answeredByName}` : 'Answered'}
          {resp.submittedAt && ` · ${formatDate(resp.submittedAt)}`}
        </span>
        {resp.scoreEarned != null && question.weight > 0 && (
          <span className="text-[10px] font-mono text-status-pass-fg ml-auto">
            {resp.scoreEarned}/{question.weight} pts
          </span>
        )}
      </div>

      {isFile && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-card bg-status-warn-bg border border-status-warn-bd">
          <Paperclip size={12} className="text-status-warn-fg shrink-0" />
          <p className="text-xs text-status-warn-fg">See the <span className="font-medium">Evidence tab</span> for uploaded files.</p>
        </div>
      )}

      {isText && resp.responseText && (
        <div className="px-3 py-2 rounded-card bg-surface border border-border">
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
        color={isVendorSide ? 'text-brand-400' : 'text-status-tag-fg'}
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