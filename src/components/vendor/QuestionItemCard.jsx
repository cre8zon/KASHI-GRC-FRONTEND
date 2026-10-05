/**
 * QuestionItemCard — one assessment question and its answer, rendered once.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * A question was being drawn in two places by two unrelated components:
 *
 *   AssessmentFillTab.QuestionCard          ~343 lines, the list row
 *   QuestionDrawer.DrawerAnswerInput        ~254 lines, the drawer's answer
 *   QuestionDrawer.AnswerPreview            ~67 lines, its read-only form
 *
 * ~660 lines doing one job twice, with two sets of option-selection logic, two
 * debounce strategies, two ideas of what "answered" means and two cache-
 * invalidation lists. Every per-question change this month had to be made in
 * both, and one of them was always missed first: the obligation unlock
 * (`canEdit = editable || owedHere`) landed on the row and never on the drawer,
 * so a contributor sent a revision on a locked section could read the request
 * in the drawer and not answer it there.
 *
 * This is that component, once. The row and the panel are the same code with
 * different chrome.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────
 *
 *   Conversation and evidence. The drawer owns those — it has Shared, Vendor
 *   notes / Org notes, Actions, Evidence and Activity, with the real controls.
 *   The card used to carry inline Discuss and Evidence panels that duplicated
 *   two of those five tabs; they are now buttons that open the drawer ON that
 *   tab. One surface for a conversation, not two that can disagree about what
 *   was said.
 *
 *   Reviewer verdicts and remediation. PASS/PARTIAL/FAIL and the remediation
 *   panel are organisation-side judgements about a question, not part of the
 *   question. They stay in AssessmentReviewTab, which renders this card for the
 *   answer and its own controls around it. Folding them in here would make one
 *   component with two unrelated bodies — which is the thing this file exists
 *   to stop.
 *
 *   ResponderActions. Same reasoning: Accept / Request revision / Override are
 *   commands the responder issues about a contributor's work. They stay in the
 *   drawer.
 *
 * ── THE TWO VARIANTS ──────────────────────────────────────────────────────
 *
 *   row    the list row. Order number, select box, question text, chips, the
 *          answer, and the action line (Discuss · Evidence · Open panel ·
 *          saving/answered · assignment picker).
 *
 *   panel  inside the drawer. Chips, the answer, and who answered it when.
 *          No question text — the drawer header already carries it — and no
 *          action line, because the drawer's own tab bar is that line.
 *
 * Behaviour is identical across both. Only chrome differs, which is the test
 * for whether a variant is honest: if a variant ever needs to change what the
 * component DOES, it wanted to be a different component.
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  CheckCircle2, Circle, CheckSquare, Square,
  MessageSquare, Paperclip, Loader2, Asterisk, PanelRight, ArrowUpRight,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatDate } from '../../utils/format'
import { useEntityActionItems } from '../../hooks/useActionItems'
import {
  UserPicker, P, GuardTagBadge, QuestionObligationChip, hasLiveObligation,
  SelectBox, EvidenceRequiredBadge,
} from './vendorShared'

const SAVE_DEBOUNCE_MS = 600

const ASSIGNMENT_TYPES = ['CONTRIBUTOR_ASSIGNMENT', 'REVIEWER_ASSIGNMENT']
const OPEN_STATUSES    = ['OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'PENDING_VALIDATION', 'SUBMITTED']

/**
 * Opens the drawer, and says whether there is anything in it.
 *
 * The count comes from the bulk provider that wraps the list, so this makes no
 * request of its own — useEntityActionItems reads the shared cache when a
 * provider is above it. Without that, a 90-question section would fire 90
 * requests just to draw badges.
 *
 * Assignment bookkeeping is excluded. CONTRIBUTOR_ASSIGNMENT and
 * REVIEWER_ASSIGNMENT are action items too, and a badge on every assigned
 * question would mean nothing.
 *
 * ── THERE WERE TWO OF THESE ──────────────────────────────────────────────
 * The fill tab and the review tab each carried a copy, and they had already
 * diverged: the review one grew an "escalated" marker and the vendor one never
 * got it, so a vendor looking at a question whose finding had become an Issue
 * saw nothing to say so. This is the union — the review tab's version, which
 * was the fuller of the two — and both tabs now import it.
 */
export function QuestionItemsButton({ questionInstanceId, onClick }) {
  const { data: items = [] } = useEntityActionItems('QUESTION_RESPONSE', questionInstanceId, {
    enabled: !!questionInstanceId,
  })
  const open = items.filter(i =>
    OPEN_STATUSES.includes(i.status) && !ASSIGNMENT_TYPES.includes(i.remediationType)).length
  // An item that became an Issue carries linkedIssueId. Once it has, the item
  // itself is no longer the thing being worked — the Issue is, under the vendor
  // remediation workflow — so it gets its own marker rather than swelling the
  // open count and looking like unfinished work.
  const escalated = items.filter(i => i.linkedIssueId).length

  return (
    <span className="flex items-center gap-1">
      <button
        onClick={onClick}
        className={cn(
          'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors',
          open > 0
            ? 'text-status-warn-fg bg-status-warn-bg'
            : 'text-text-muted hover:text-text-secondary')}
        title={open > 0
          ? `${open} open item${open === 1 ? '' : 's'} on this question`
          : 'Notes, evidence, KashiGuard findings and remediations'}
      >
        {/* PanelRight, not Flag: the icon has to say "this opens a side panel",
            because a flag says "something is flagged" and people read it as a
            status rather than a control. The count still shows when there is
            one. */}
        <PanelRight size={10} />
        {open > 0 ? `${open} item${open === 1 ? '' : 's'}` : 'Open panel'}
      </button>
      {escalated > 0 && (
        <span
          className="flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded text-status-fail-fg bg-status-fail-bg shrink-0"
          title={`${escalated} finding${escalated === 1 ? '' : 's'} escalated to an issue — tracked under the vendor remediation workflow`}
        >
          <ArrowUpRight size={8} /> {escalated} escalated
        </span>
      )}
    </span>
  )
}


export function QuestionItemCard({
  question,
  assessmentId,          // eslint-disable-line no-unused-vars -- kept in the signature so callers do not have to learn which variant needs it; see onSave
  variant = 'row',       // 'row' | 'panel'
  editable,              // may this viewer answer right now — lock included
  // ── THE GATE AN OBLIGATION MUST NOT OPEN ────────────────────────────────
  //
  // `editable` is a soft gate: an open obligation on this question lifts it,
  // because the server does the same thing and a revision you cannot answer is
  // not a state anyone wants.
  //
  // `answerable` is a hard one: is this viewer on the side that answers this
  // question at all. It is never lifted. Without it, an organisation-side
  // reviewer holding a CLARIFICATION on a question — which is an obligation
  // about their EVALUATION — would have had the bypass open the vendor's
  // answer for editing. The server would refuse it (respond() is a vendor-side
  // endpoint), so the only thing it could produce is a control that fails.
  //
  // Default true so the list rows, which are already side-correct by virtue of
  // which tab renders them, carry on unchanged.
  answerable = true,
  standing,              // useStanding(...) result, for the assignment picker
  viewerId,
  focused,
  contributors, contributorsLoading, onAssign,
  onSave, saving,
  selectable, selected, onToggleSelect,
  // (question, tab) — tab is one of the drawer's ids: 'actions' | 'shared' |
  // 'internal' | 'evidence' | 'activity'. Omitted in the panel variant, where
  // the drawer is already open.
  onOpenDrawer,
  className,
}) {
  const isPanel = variant === 'panel'
  const qi      = question.questionInstanceId
  const current = question.currentResponse || {}

  // Local text state so typing is not fought by refetches. Seeded from the
  // server value and re-seeded only when the question identity changes —
  // re-seeding on every fetch would discard whatever is being typed.
  const [text, setText] = useState(current.responseText ?? '')
  useEffect(() => { setText(current.responseText ?? '') }, [qi]) // eslint-disable-line react-hooks/exhaustive-deps

  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const multiSelected = useMemo(() => {
    if (Array.isArray(current.selectedOptionInstanceIds)) {
      return new Set(current.selectedOptionInstanceIds)
    }
    // MULTI_CHOICE stores the set as a JSON array in responseText. Parsing it
    // is the read side of the REPLACE contract described in AssessmentFillTab.
    if (typeof current.responseText === 'string' && current.responseText.startsWith('[')) {
      try { return new Set(JSON.parse(current.responseText)) } catch { return new Set() }
    }
    return new Set()
  }, [current.selectedOptionInstanceIds, current.responseText])

  const pushText = (v) => {
    setText(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      onSave?.({ questionInstanceId: qi, responseText: v })
    }, SAVE_DEBOUNCE_MS)
  }

  const pickSingle = (optionInstanceId) =>
    onSave?.({ questionInstanceId: qi, selectedOptionInstanceId: optionInstanceId })

  const toggleMulti = (optionInstanceId) => {
    // Build the COMPLETE next set and send all of it.
    const next = new Set(multiSelected)
    next.has(optionInstanceId) ? next.delete(optionInstanceId) : next.add(optionInstanceId)
    onSave?.({ questionInstanceId: qi, selectedOptionInstanceIds: [...next] })
  }

  // ── A LOCK MUST YIELD TO AN OBLIGATION ──────────────────────────────────
  // The server already does: submitAnswer lifts the section lock for a user
  // with an open action item on that specific question, because being sent a
  // revision and then being unable to answer it is not a state anyone wants.
  // The row honoured this and the drawer never did; now both do, because there
  // is only one of them.
  const { data: myItems = [] } = useEntityActionItems('QUESTION_RESPONSE', qi, {
    enabled: !!qi,
  })
  const owedHere = hasLiveObligation(myItems, viewerId)

  // ── A SETTLED ANSWER IS CLOSED ──────────────────────────────────────────
  //
  // ACCEPTED and OVERRIDDEN are the responder's two terminal verdicts on a
  // contributor's answer: the first takes it as it stands, the second replaces
  // it. Either way the responder has signed off, and a contributor editing it
  // afterwards would silently undo a decision nobody is told was undone.
  //
  // REVISION_REQUESTED is deliberately NOT in this set — that is the responder
  // handing it back, which is the opposite.
  //
  // These share the reviewerStatus column with the organisation's PASS /
  // PARTIAL / FAIL verdicts. Only the two vendor-internal ones lock, because
  // only they say the vendor side is finished with the answer.
  const settled = ['ACCEPTED', 'OVERRIDDEN'].includes(current.reviewerStatus)

  // An obligation always wins, because the server's bypass does: if the
  // responder reopens this question the contributor must be able to answer it,
  // whatever the answer was stamped with before.
  const canEdit = answerable && (owedHere || (editable && !settled))

  // FILE_UPLOAD never writes responseText, so the text-or-option test reads it
  // as unanswered forever. Its documents are the answer.
  const evidenceCount = current.documents?.length || question.evidenceCount || 0
  const answered = question.responseType === 'FILE_UPLOAD'
    ? evidenceCount > 0
    : (current.responseText != null || current.selectedOptionInstanceId != null)
  const canAssign = editable && !isPanel && !!standing?.can?.(P.ASSIGN_CONTRIBUTOR)

  const openEvidence = () => onOpenDrawer?.(question, 'evidence')

  // ── CHIPS ───────────────────────────────────────────────────────────────
  // Identical in both variants. Each one answers a question somebody would
  // otherwise have to open a panel to answer.
  const chips = (
    <>
      {/* What this question is waiting on, for me. The contributor's own
          assignment item is the record — answering resolves it server-side —
          so this is where "did that register?" gets answered without a submit
          button that would do nothing. */}
      <QuestionObligationChip questionInstanceId={qi} className="mt-0.5" />
      {/* The lock is open for this one question only, and saying so is the
          difference between "the app is inconsistent" and "they asked me to
          redo this". Re-answering moves the item to PENDING_REVIEW
          server-side — the responder gets it back without the contributor
          needing another button. */}
      {owedHere && !editable && answerable && (
        <span className="text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap mt-0.5
                         bg-status-warn-bg text-status-warn-fg border-status-warn-bd">
          Reopened for you — answer again to send it back
        </span>
      )}
      {/* requiresEvidence is the question's own requirement, separate from the
          mandatory asterisk (which means the ANSWER is required). satisfied
          flips it green once something is attached, so the page answers "am I
          done here" without opening every panel. */}
      <EvidenceRequiredBadge
        required={question.requiresEvidence}
        satisfied={evidenceCount > 0}
        className="mt-0.5"
      />
      {/* A tag means KashiGuard rules can fire on this answer. Worth seeing
          while answering, not only after something fires. */}
      <GuardTagBadge tag={question.questionTag} className="mt-0.5" />
      {/* Why the controls are dead. Without this the answer simply stops
          responding and the only explanation is in a verdict badge that lives
          in the drawer header, which the row does not have. */}
      {settled && !owedHere && (
        <span className="text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap mt-0.5
                         bg-status-pass-bg text-status-pass-fg border-status-pass-bd">
          {current.reviewerStatus === 'OVERRIDDEN'
            ? 'Overridden by the responder'
            : 'Accepted by the responder'}
        </span>
      )}
    </>
  )

  // ── ANSWER ──────────────────────────────────────────────────────────────
  // One rendering for every response type, editable or not. `disabled` is what
  // differs, not the markup — a read-only answer that looks like a different
  // control is how two screens end up disagreeing about what was answered.
  const answerControl = (
    question.responseType === 'SINGLE_CHOICE' ? (
      <div className="space-y-1">
        {(question.options || []).map(o => {
          const on = Number(current.selectedOptionInstanceId) === Number(o.optionInstanceId)
          return (
            <button
              key={o.optionInstanceId}
              disabled={!canEdit}
              onClick={() => pickSingle(o.optionInstanceId)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-ctl border text-left transition-colors',
                on ? 'border-brand-500/40 bg-brand-500/10' : 'border-border hover:border-border-strong',
                !canEdit && 'opacity-60 cursor-default'
              )}
            >
              {on ? <CheckCircle2 size={12} className="text-brand-ink shrink-0" />
                  : <Circle size={12} className="text-text-muted shrink-0" />}
              <span className="text-[11px] text-text-secondary">{o.optionValue}</span>
            </button>
          )
        })}
      </div>
    ) : question.responseType === 'MULTI_CHOICE' ? (
      <div className="space-y-1">
        {(question.options || []).map(o => {
          const on = multiSelected.has(o.optionInstanceId)
            || multiSelected.has(Number(o.optionInstanceId))
          return (
            <button
              key={o.optionInstanceId}
              disabled={!canEdit}
              onClick={() => toggleMulti(o.optionInstanceId)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-ctl border text-left transition-colors',
                on ? 'border-brand-500/40 bg-brand-500/10' : 'border-border hover:border-border-strong',
                !canEdit && 'opacity-60 cursor-default'
              )}
            >
              {on ? <CheckSquare size={12} className="text-brand-ink shrink-0" />
                  : <Square size={12} className="text-text-muted shrink-0" />}
              <span className="text-[11px] text-text-secondary">{o.optionValue}</span>
            </button>
          )
        })}
      </div>
    ) : question.responseType === 'NUMERIC' ? (
      // type="number" for the keypad and the browser's own numeric validation.
      // The value still travels as responseText — the backend column is a
      // string and coercing here would only move the parsing somewhere less
      // visible.
      <input
        type="number"
        disabled={!canEdit}
        value={text}
        onChange={e => pushText(e.target.value)}
        placeholder={canEdit ? 'Enter a number…' : 'No answer'}
        className="w-full bg-surface-overlay border border-border rounded-ctl px-2 py-1.5 text-[11px] text-text-primary placeholder:text-text-muted outline-none focus:border-border-strong disabled:opacity-60"
      />
    ) : question.responseType === 'DATE' ? (
      // ISO yyyy-mm-dd, which is what <input type="date"> emits and reads. A
      // free-text date is ambiguous across locales and this answer ends up in a
      // compliance report.
      <input
        type="date"
        disabled={!canEdit}
        value={/^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : ''}
        onChange={e => pushText(e.target.value)}
        className="bg-surface-overlay border border-border rounded-ctl px-2 py-1.5 text-[11px] text-text-primary outline-none focus:border-border-strong disabled:opacity-60"
      />
    ) : question.responseType === 'FILE_UPLOAD' ? (
      // The attachment IS the answer, and it lives in the drawer's Evidence
      // tab. This used to say "below", which was true when the card had an
      // inline evidence panel; now it is a control that goes there.
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-ctl border border-status-warn-bd bg-status-warn-bg/40">
        <Paperclip size={11} className="text-status-warn-fg shrink-0" />
        <span className="text-[10px] text-status-warn-fg">
          {canEdit
            ? 'The file is the answer to this question.'
            : 'Evidence only.'}
        </span>
        {onOpenDrawer ? (
          <button
            type="button"
            onClick={openEvidence}
            className="text-[10px] font-medium text-status-warn-fg underline underline-offset-2"
          >
            {canEdit ? 'Attach evidence' : 'See evidence'}
          </button>
        ) : (
          <span className="text-[10px] text-status-warn-fg">
            See the Evidence tab.
          </span>
        )}
      </div>
    ) : (
      <textarea
        rows={3}
        disabled={!canEdit}
        value={text}
        onChange={e => pushText(e.target.value)}
        placeholder={canEdit ? 'Your answer…' : 'No answer'}
        className="w-full bg-surface-overlay border border-border rounded-ctl px-2 py-1.5 text-[11px] text-text-primary placeholder:text-text-muted outline-none focus:border-border-strong resize-y disabled:opacity-60"
      />
    )
  )

  // ══════════════ PANEL ══════════════════════════════════════════════════
  //
  // The drawer's header already carries the question text, the type, the
  // required marker, the weight and the verdict, so repeating any of it here
  // would be the duplication this file removes, one level down.
  if (isPanel) {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex items-center gap-1.5 flex-wrap">{chips}</div>
        {answerControl}
        {/* Who answered it and what it scored — the one thing AnswerPreview
            showed that the row never did, and it is worth keeping. */}
        {answered && (
          <div className="flex items-center gap-2">
            <CheckCircle2 size={12} className="text-status-pass-fg shrink-0" />
            <span className="text-[10px] text-text-muted">
              {current.answeredByName ? `Answered by ${current.answeredByName}` : 'Answered'}
              {current.submittedAt && ` · ${formatDate(current.submittedAt)}`}
            </span>
            {current.scoreEarned != null && question.weight > 0 && (
              <span className="text-[10px] font-mono text-status-pass-fg ml-auto">
                {current.scoreEarned}/{question.weight} pts
              </span>
            )}
          </div>
        )}
        {saving === qi && (
          <span className="flex items-center gap-1 text-[9px] text-text-muted">
            <Loader2 size={9} className="animate-spin" /> Saving
          </span>
        )}
      </div>
    )
  }

  // ══════════════ ROW ════════════════════════════════════════════════════
  return (
    // The id is the scroll target useDrawerFromUrl looks for, and `focused`
    // is the answer to "which of these forty rows is the panel about".
    <div
      id={`question-${qi}`}
      data-qi={qi}
      className={cn(
        'border-b border-border last:border-b-0 transition-colors',
        focused && 'bg-brand-500/5 ring-1 ring-inset ring-brand-500/40',
        className
      )}
    >
      <div className="px-4 py-3">
        <div className="flex items-start gap-2">
          {selectable && (
            <div className="pt-1 shrink-0">
              <SelectBox
                checked={!!selected}
                onChange={() => onToggleSelect?.(qi)}
                title="Select this question for a bulk assignment"
              />
            </div>
          )}
          <span className="text-[10px] text-text-muted w-6 shrink-0 pt-0.5">
            {question.orderNo ?? '—'}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1.5">
              <p className="flex-1 text-[12px] text-text-primary leading-snug">
                {question.questionText}
                {question.mandatory && (
                  <Asterisk size={8} className="inline ml-1 text-status-fail-fg align-super" />
                )}
              </p>
              {chips}
            </div>

            <div className="mt-2">{answerControl}</div>

            {/* ── ROW ACTIONS ──────────────────────────────────────────
                Discuss and Evidence open the DRAWER on that tab rather than
                expanding a panel here. The drawer already holds both, with the
                controls attached and the other three tabs beside them; an
                inline copy was a second place for the same conversation to
                live and a second thing to keep in step. */}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => onOpenDrawer?.(question, 'shared')}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-text-muted hover:text-text-secondary transition-colors"
                title="Open the discussion for this question"
              >
                <MessageSquare size={10} /> Discuss
              </button>
              <button
                onClick={openEvidence}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-text-muted hover:text-text-secondary transition-colors"
                title="Open the evidence for this question"
              >
                <Paperclip size={10} /> Evidence
                {evidenceCount > 0 && (
                  <span className="text-[9px] text-text-secondary">{evidenceCount}</span>
                )}
              </button>

              <QuestionItemsButton
                questionInstanceId={qi}
                onClick={() => onOpenDrawer?.(question, 'actions')}
              />

              <span className="flex-1" />

              {saving === qi && (
                <span className="flex items-center gap-1 text-[9px] text-text-muted">
                  <Loader2 size={9} className="animate-spin" /> Saving
                </span>
              )}
              {saving !== qi && answered && (
                <span className="text-[9px] text-status-pass-fg">Answered</span>
              )}

              {canAssign ? (
                <UserPicker
                  users={contributors}
                  loading={contributorsLoading}
                  value={question.assignedUserId}
                  onChange={(userId) => onAssign?.(qi, userId)}
                  placeholder="Assign…"
                  emptyHint="No vendor-side user is eligible on this step yet. Check that step 6 has an assignable side (seed 53)."
                />
              ) : question.assignedUserName ? (
                <span className="text-[9px] text-text-muted">{question.assignedUserName}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default QuestionItemCard