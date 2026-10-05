/**
 * AssessmentReviewTab.jsx
 *
 * Org-side evaluation of the vendor's answers. Step 11 of TPRM Tier-1 —
 * "Reviewers Evaluate Assigned Questions", ORGANIZATION, ASSIGNMENT_SCOPED.
 *
 * ── REVIEWER ASSIGNMENT BELONGS HERE, NOT ON THE SECTIONS TAB ─────────────
 * The backend has reviewerAssignQuestion and its batch, and nothing at section
 * level. The sections tab therefore shows reviewer ownership read-only and the
 * editable control lives here, where the endpoint actually is.
 *
 * Step 11 has assignable_side = ORGANIZATION after seed 53. Before it, this
 * picker resolved through eligible-users mode 2 — the next step's actor roles —
 * and step 12 is ASSIGNMENT_SCOPED, which has none, so the list came back
 * empty. The seed is what makes the control work.
 *
 * ── A VERDICT IS NOT A SCORE ──────────────────────────────────────────────
 * The reviewer records whether an answer is acceptable. The score was computed
 * when the answer was saved, from the option weights, and nothing here changes
 * it. Letting a verdict move the number would make two different things look
 * like one, and the compliance percentage would stop meaning what the template
 * says it means.
 *
 * ── THE TAB ALSO HAS TO SHOW WHAT WAS REVIEWED ────────────────────────────
 * Until now this was a place to RECORD verdicts and not a place to READ them.
 * Someone arriving at a half-reviewed assessment saw a list of questions with
 * three buttons each and no answer to the only question they had: what is
 * already done, by whom, and what came out of it.
 *
 * Three things were missing, and all three had the same cause — the data
 * stopped at a boundary rather than being absent.
 *
 *   1. Per-section review state. AssessmentSectionInstance has carried
 *      reviewer_submitted_at / _by and reviewer_reopened_at / _by since the
 *      reviewer flow was written, and SectionInstanceResponse exposed none of
 *      them. The DTO now does, and the section header reads them.
 *
 *   2. Per-question outcome. Already on the wire as
 *      currentResponse.reviewerStatus — just never tallied. The strip at the
 *      top and each section header now count them.
 *
 *   3. Escalations. An action item that became an Issue carries linkedIssueId
 *      (added to ActionItem earlier in this migration), and the bulk
 *      action-item response already includes it. So "which questions have been
 *      escalated" needed no new endpoint, only someone to look.
 *
 * A REOPENED SECTION IS NOT AN UNREVIEWED ONE, and the difference matters:
 * reviewer-reopen does NOT clear reviewer_submitted_at, so a section that has
 * been reviewed and sent back still has a submission timestamp. Reading that
 * timestamp alone would report it as reviewed. Every check here compares the
 * pair — see sectionReviewState.
 */

import { useState, useMemo } from 'react'
// useEffect and useRef are already imported further down, next to the
// item-panel imports. Adding them here as well is what broke the build.
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import {
  CheckCircle2, XCircle, AlertTriangle, Layers, MessageSquare,
  Paperclip, Loader2, ShieldAlert,
  UserCheck, Clock, ArrowUpRight, Filter, MinusCircle, Users, Eye,
  ChevronDown, ChevronRight, CheckCheck,
} from 'lucide-react'
import { assessmentsApi } from '../../api/assessments.api'
import { actionItemsApi } from '../../api/actionItems.api'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'
import {
  UserPicker, useEligibleUsers, useStanding, P, unwrapList,
  useSectionCollapse, useQuestionSelection, SelectBox,
  ListToolbar, BulkAssignBar, EvidenceRequiredBadge,
  resolveDrawerMode, GuardTagBadge, QuestionObligationChip, hasLiveObligation,
  VERDICTS, VerdictChip, isEvaluated,
  QuestionActionBar, invalidateAssessment, useOwedAssignmentIds,
} from './vendorShared'
// The org-side review endpoints live here, not on assessmentsApi.vendor.
import { reviewApi } from '../../api/review.api'
// Discuss and Evidence open the drawer on those tabs now, so this tab no longer
// renders either inline. QuestionItemsButton moved to QuestionItemCard, where
// the fill tab reads the same one — it existed here and there, and the two had
// already drifted.
import { QuestionItemsButton } from './QuestionItemCard'
import { QuestionDrawer } from '../item-panel'
import { ActionItemsBulkProvider, useEntityActionItems } from '../../hooks/useActionItems'
import { useEffect, useRef } from 'react'

/**
 * The verdicts — PASS / PARTIAL / FAIL, from vendorShared.
 *
 * ── CORRECTION ───────────────────────────────────────────────────────────
 * This file previously declared ACCEPTED / NEEDS_CLARIFICATION / REJECTED
 * locally. Those are the vendor-INTERNAL responder verdicts
 * (VendorItemActionController), not the org reviewer's. saveReviewerEval
 * validates against Set.of("PASS","PARTIAL","FAIL") and throws a
 * ValidationException on anything else, so every verdict click returned a 400,
 * showed "Could not save the verdict", and left the row pending.
 *
 * The three values are also what the scoring CASE reads — FAIL scores 0,
 * PARTIAL scores half the weight — so this is not a labelling choice. The
 * vocabulary now lives in one place; see the long note on VERDICTS there.
 */
const VERDICT_ICON = { PASS: CheckCircle2, PARTIAL: MinusCircle, FAIL: XCircle }
const VERDICT_BUTTONS = VERDICTS.map(v => ({
  key: v.key, label: v.label, icon: VERDICT_ICON[v.key] || CheckCircle2,
  color: `text-status-${v.tone}-fg`, bg: `bg-status-${v.tone}-bg`,
}))

function AnswerText({ question }) {
  const r = question.currentResponse || {}
  if (question.responseType === 'SINGLE_CHOICE') {
    const opt = (question.options || [])
      .find(o => o.optionInstanceId === r.selectedOptionInstanceId)
    return <span>{opt?.optionValue || <em className="text-text-muted">Not answered</em>}</span>
  }
  if (question.responseType === 'MULTI_CHOICE') {
    let ids = Array.isArray(r.selectedOptionInstanceIds) ? r.selectedOptionInstanceIds : []
    if (!ids.length && typeof r.responseText === 'string' && r.responseText.startsWith('[')) {
      try { ids = JSON.parse(r.responseText) } catch { ids = [] }
    }
    const vals = (question.options || [])
      .filter(o => ids.includes(o.optionInstanceId))
      .map(o => o.optionValue)
    return vals.length
      ? <span>{vals.join(', ')}</span>
      : <em className="text-text-muted">Not answered</em>
  }
  return r.responseText
    ? <span className="whitespace-pre-wrap">{r.responseText}</span>
    : <em className="text-text-muted">Not answered</em>
}

const ASSIGNMENT_TYPES = ['CONTRIBUTOR_ASSIGNMENT', 'REVIEWER_ASSIGNMENT']
const OPEN_STATUSES    = ['OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'PENDING_VALIDATION', 'SUBMITTED']

function fmtWhen(v) {
  if (!v) return null
  try {
    return new Date(v).toLocaleDateString(undefined,
      { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return String(v) }
}

/**
 * What state is this section's review in?
 *
 * The four columns tell a small story and only the pair reads correctly:
 *
 *   reviewerSubmittedAt null                    → not reviewed
 *   submitted, never reopened                   → reviewed
 *   submitted, then reopened (reopen is later)  → sent back, under review again
 *   reopened BEFORE the latest submit           → reviewed again after a send-back
 *
 * That third case is the one a naive `!!reviewerSubmittedAt` gets wrong, and it
 * is also the most common one on a real assessment: a reviewer rejects, the
 * vendor fixes, the reviewer signs off again.
 */
function sectionReviewState(section) {
  const submitted = section.reviewerSubmittedAt ? new Date(section.reviewerSubmittedAt) : null
  const reopened  = section.reviewerReopenedAt  ? new Date(section.reviewerReopenedAt)  : null

  if (!submitted) {
    return reopened
      ? { key: 'reopened', label: 'Sent back', tone: 'warn',
          by: section.reviewerReopenedByName, at: section.reviewerReopenedAt }
      : { key: 'pending', label: 'Not reviewed', tone: 'muted' }
  }
  if (reopened && reopened > submitted) {
    return { key: 'reopened', label: 'Sent back', tone: 'warn',
             by: section.reviewerReopenedByName, at: section.reviewerReopenedAt }
  }
  return { key: 'reviewed', label: 'Reviewed', tone: 'pass',
           by: section.reviewerSubmittedByName, at: section.reviewerSubmittedAt }
}

const STATE_TONE = {
  pass:  'text-status-pass-fg bg-status-pass-bg',
  warn:  'text-status-warn-fg bg-status-warn-bg',
  fail:  'text-status-fail-fg bg-status-fail-bg',
  muted: 'text-text-muted bg-surface-overlay',
}

/**
 * Verdict counts for a set of questions, plus how many are still untouched and
 * how many have no answer at all.
 *
 * `unanswered` is tracked separately from `pending` because they are different
 * problems with different owners: pending means the reviewer has not got to it,
 * unanswered means the vendor never filled it in — and an unanswered question
 * scores zero whatever the reviewer does, which is what the hardcoded page
 * calls "auto-FAIL".
 */
function tally(questions) {
  const t = { PASS: 0, PARTIAL: 0, FAIL: 0, pending: 0, unanswered: 0, total: questions.length }
  for (const q of questions) {
    const r = q.currentResponse
    const v = r?.reviewerStatus
    if (isEvaluated(v) && v in t) t[v] += 1
    else t.pending += 1
    const answered = !!r && (
      (typeof r.responseText === 'string' && r.responseText.trim() !== '')
      || r.selectedOptionInstanceId != null
      || (Array.isArray(r.selectedOptionInstanceIds) && r.selectedOptionInstanceIds.length > 0))
    if (!answered) t.unanswered += 1
  }
  return t
}

/**
 * Small inline verdict counts. Zero counts are dropped rather than rendered as
 * "0 rejected" — a row of zeroes reads as a problem that isn't there.
 */
function TallyChips({ t, escalated = 0 }) {
  const parts = [
    t.PASS       && { k: 'a', tone: 'pass',  label: `${t.PASS} pass` },
    t.PARTIAL    && { k: 'c', tone: 'warn',  label: `${t.PARTIAL} partial` },
    t.FAIL       && { k: 'r', tone: 'fail',  label: `${t.FAIL} fail` },
    t.pending    && { k: 'p', tone: 'muted', label: `${t.pending} not evaluated` },
    t.unanswered && { k: 'u', tone: 'warn',  label: `${t.unanswered} unanswered` },
    escalated    && { k: 'e', tone: 'fail',  label: `${escalated} escalated` },
  ].filter(Boolean)

  if (!parts.length) return null
  return (
    <span className="flex items-center gap-1 flex-wrap">
      {parts.map(p => (
        <span key={p.k}
          className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0', STATE_TONE[p.tone])}>
          {p.label}
        </span>
      ))}
    </span>
  )
}

/**
 * Section heading with its review verdict.
 *
 * Replaces the bare name-and-icon strip. Everything here came off the wire
 * already except the four reviewer columns, which the DTO change exposes.
 */
function SectionReviewHeader({
  section, escalated, open = true, onToggle,
  selectableIds = [], selectedCount = 0, onSelectAll,
}) {
  const state = sectionReviewState(section)
  const t     = tally(section.questions || [])
  const some  = selectedCount > 0 && selectedCount < selectableIds.length
  const all   = selectableIds.length > 0 && selectedCount === selectableIds.length

  return (
    <div className="px-4 py-2 bg-surface-overlay/60 border-y border-border">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onToggle}
          aria-label={open ? 'Collapse section' : 'Expand section'}
          className="text-text-muted hover:text-text-secondary shrink-0"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {onSelectAll && selectableIds.length > 0 && (
          <SelectBox
            checked={all}
            some={some}
            onChange={onSelectAll}
            title={all ? 'Clear this section' : 'Select every question in this section'}
          />
        )}
        <Layers size={11} className="text-text-muted shrink-0" />
        <span className="text-[11px] font-medium text-text-primary">
          {section.sectionName}
        </span>
        <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0', STATE_TONE[state.tone])}>
          {state.label}
        </span>
        <span className="flex-1" />
        <TallyChips t={t} escalated={escalated} />
      </div>

      {/* Who owns it and what has happened to it. One line, and only the parts
          that exist — an unassigned, unreviewed section prints nothing here
          rather than three em-dashes. */}
      {(section.reviewerAssignedUserName || state.by) && (
        <div className="flex items-center gap-3 mt-1 pl-[19px] flex-wrap">
          {section.reviewerAssignedUserName && (
            <span className="flex items-center gap-1 text-[9px] text-text-muted">
              <UserCheck size={8} /> Reviewer: {section.reviewerAssignedUserName}
            </span>
          )}
          {state.by && (
            <span className="flex items-center gap-1 text-[9px] text-text-muted">
              <Clock size={8} />
              {state.key === 'reviewed' ? 'Reviewed by' : 'Sent back by'} {state.by}
              {state.at && <> · {fmtWhen(state.at)}</>}
            </span>
          )}
          {/* A section reviewed and then sent back keeps BOTH timestamps, and
              the earlier one is worth showing — it is the evidence that this is
              a second pass rather than a first. */}
          {state.key === 'reopened' && section.reviewerSubmittedByName && (
            <span className="flex items-center gap-1 text-[9px] text-text-muted opacity-70">
              <CheckCircle2 size={8} />
              First reviewed by {section.reviewerSubmittedByName}
              {section.reviewerSubmittedAt && <> · {fmtWhen(section.reviewerSubmittedAt)}</>}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

const FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'pending',   label: 'Not evaluated' },
  { key: 'partial',   label: 'Partial' },
  { key: 'failed',    label: 'Fail' },
  { key: 'escalated', label: 'Escalated' },
]

function matchesFilter(q, filter, escalatedIds) {
  if (filter === 'all')       return true
  const v = q.currentResponse?.reviewerStatus
  if (filter === 'pending')   return !isEvaluated(v)
  if (filter === 'partial')   return v === 'PARTIAL'
  if (filter === 'failed')    return v === 'FAIL'
  if (filter === 'escalated') return escalatedIds.has(String(q.questionInstanceId))
  return true
}

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

/**
 * Raise a remediation against one question.
 *
 * Inline, not a Modal portal. Two of the three existing in-page modals in this
 * module had to be rewritten as inline panels because an ancestor carries a CSS
 * transform, which makes position:fixed resolve against that ancestor rather
 * than the viewport — see the note at the top of ResponderActions. This is the
 * third; it starts inline.
 *
 * Four fields, matching what ReviewController.requestRemediation reads:
 * description (required), severity, expectedEvidence, dueDate. The endpoint
 * also increments the assessment's openRemediationCount and notifies the
 * vendor CISO, which is why this is its own call rather than a comment.
 */
function RemediationPanel({ onCancel, onSubmit, busy }) {
  const [description, setDescription]           = useState('')
  const [severity, setSeverity]                 = useState('MEDIUM')
  const [expectedEvidence, setExpectedEvidence] = useState('')
  const [dueDate, setDueDate]                   = useState('')

  return (
    <div className="mt-2 p-2.5 rounded-ctl border border-status-warn-bd bg-status-warn-bg/30 space-y-2">
      <p className="text-[10px] font-medium text-status-warn-fg">
        Request remediation from the vendor
      </p>
      <textarea
        rows={3}
        autoFocus
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="What has to change, and why this answer is not acceptable as it stands…"
        className="w-full bg-surface-overlay border border-border rounded-ctl px-2 py-1.5 text-[11px] text-text-primary placeholder:text-text-muted outline-none focus:border-border-strong resize-y"
      />
      <input
        value={expectedEvidence}
        onChange={e => setExpectedEvidence(e.target.value)}
        placeholder="Evidence you expect back (optional)"
        className="w-full bg-surface-overlay border border-border rounded-ctl px-2 py-1.5 text-[11px] text-text-primary placeholder:text-text-muted outline-none focus:border-border-strong"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {SEVERITIES.map(sv => (
            <button
              key={sv}
              onClick={() => setSeverity(sv)}
              className={cn('text-[9px] px-1.5 py-0.5 rounded border transition-colors',
                severity === sv
                  ? 'border-status-warn-bd bg-status-warn-bg text-status-warn-fg font-medium'
                  : 'border-border text-text-muted hover:border-border-strong')}
            >
              {sv}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          title="Due date (optional)"
          className="bg-surface-overlay border border-border rounded-ctl px-2 py-1 text-[10px] text-text-primary outline-none focus:border-border-strong"
        />
        <span className="flex-1" />
        <button
          onClick={onCancel}
          className="text-[10px] px-2 py-1 rounded-ctl border border-border text-text-muted hover:border-border-strong transition-colors"
        >
          Cancel
        </button>
        <button
          disabled={!description.trim() || busy}
          onClick={() => onSubmit({
            description: description.trim(),
            severity,
            expectedEvidence: expectedEvidence.trim(),
            dueDate: dueDate || undefined,
          })}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border border-status-warn-bd bg-status-warn-bg text-status-warn-fg hover:opacity-80 transition-opacity disabled:opacity-40"
        >
          <ShieldAlert size={10} /> {busy ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </div>
  )
}

function ReviewCard({
  question, assessmentId, vc, standing, canEvaluate,
  reviewers, reviewersLoading, onVerdict, onAssignReviewer, busy,
  onOpenDrawer, onRequestRemediation, remediating, assigningReviewer, mineOnly,
  selectable, selected, onToggleSelect, focused, viewerId,
}) {
  const qi = question.questionInstanceId
  const r  = question.currentResponse || {}
  // `panel` is gone with the inline Discuss and Evidence views — both now open
  // the drawer on that tab. remediationOpen stays: raising a remediation is an
  // action this row owns, not a view of something that lives elsewhere.
  const [remediationOpen, setRemediationOpen] = useState(false)

  // The org-side mirror of the fill tab's unlock. A CLARIFICATION raised on a
  // question in a section the assistant has already locked is exactly the case
  // the server's open-obligation bypass exists for; locking the UI anyway means
  // reading the request and being unable to answer it.
  const { data: myItems = [] } = useEntityActionItems('QUESTION_RESPONSE', qi, {
    enabled: !!qi,
  })
  const owedHere   = hasLiveObligation(myItems, viewerId)
  const mayEvaluate = canEvaluate || owedHere

  const current = VERDICT_BUTTONS.find(v => v.key === r.reviewerStatus)

  return (
    // Scroll target for useDrawerFromUrl, and the mark that says which row the
    // open panel is about.
    <div
      id={`question-${qi}`}
      className={cn(
        'border-b border-border last:border-b-0 transition-colors',
        focused && 'bg-brand-500/5 ring-1 ring-inset ring-brand-500/40'
      )}
    >
      <div className="px-4 py-3">
        <div className="flex items-start gap-2">
          {selectable && (
            <div className="pt-1 shrink-0">
              <SelectBox
                checked={!!selected}
                onChange={() => onToggleSelect?.(qi)}
                title="Select this question for a bulk reviewer assignment"
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
              </p>
              {/* The org-side mirror: a review assistant sees "Assigned to
                  you" until their verdict resolves it, at which point it reads
                  "Evaluated · reported". Same component, same record — the
                  only difference is which assignment type is theirs. */}
              <QuestionObligationChip questionInstanceId={qi} className="mt-0.5" />
              {/* Same marker the vendor sees while answering, shown here so a
                  reviewer knows an empty Evidence tab is a gap rather than a
                  question that never wanted a file. */}
              <EvidenceRequiredBadge
                required={question.requiresEvidence}
                satisfied={(r.documents?.length || question.evidenceCount || 0) > 0}
                className="mt-0.5"
              />
              {/* A tagged question is one KashiGuard rules can fire on. Seeing
                  the tag while judging the answer explains why a finding is
                  sitting in the drawer. */}
              <GuardTagBadge tag={question.questionTag} className="mt-0.5" />
            </div>

            <div className="mt-1.5 px-2 py-1.5 rounded-ctl bg-surface-overlay/60 border border-border">
              <p className="text-[9px] text-text-muted mb-0.5">
                Vendor answer
                {r.answeredByName && <> · {r.answeredByName}</>}
              </p>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                <AnswerText question={question} />
              </p>
            </div>

            <div className="flex items-center gap-2 mt-2">
              {mayEvaluate ? (
                <div className="flex items-center gap-1">
                  {VERDICT_BUTTONS.map(v => {
                    const Icon = v.icon
                    const on = r.reviewerStatus === v.key
                    return (
                      <button
                        key={v.key}
                        onClick={() => onVerdict(qi, v.key)}
                        disabled={busy === qi}
                        className={cn(
                          'flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border transition-colors disabled:opacity-40',
                          on ? cn('border-transparent', v.bg, v.color)
                             : 'border-border bg-surface-overlay text-text-muted hover:border-border-strong'
                        )}
                      >
                        <Icon size={10} /> {v.label}
                      </button>
                    )
                  })}
                </div>
              ) : current ? (
                <span className={cn('flex items-center gap-1 text-[10px] px-2 py-1 rounded', current.bg, current.color)}>
                  <current.icon size={10} /> {current.label}
                </span>
              ) : (
                <span className="text-[10px] text-text-muted">Not yet evaluated</span>
              )}

              {/* ── DISCUSS AND EVIDENCE OPEN THE DRAWER ──────────────────
                  Same change as the vendor side. These were inline panels that
                  duplicated two of the drawer's five tabs, which meant two
                  places to read the same conversation and two to keep in step.
                  The drawer has the real controls — and on this side it has the
                  Org notes channel, which the inline chat never offered, so a
                  reviewer talking to a review assistant had nowhere private to
                  do it from the row. */}
              <button
                onClick={() => onOpenDrawer?.(question, 'shared')}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-text-muted hover:text-text-secondary transition-colors"
                title="Open the discussion for this question"
              >
                <MessageSquare size={10} /> Discuss
              </button>
              <button
                onClick={() => onOpenDrawer?.(question, 'evidence')}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-text-muted hover:text-text-secondary transition-colors"
                title="Open the evidence for this question"
              >
                <Paperclip size={10} /> Evidence
              </button>

              {/* Remediation, the thing this screen was missing. A verdict
                  records a judgement; a remediation asks the vendor to fix it,
                  increments openRemediationCount, notifies their CISO, and is
                  what the Findings tab then manages and escalates. */}
              {mayEvaluate && (
                <button
                  onClick={() => setRemediationOpen(o => !o)}
                  className={cn('flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors',
                    remediationOpen
                      ? 'text-status-warn-fg bg-status-warn-bg'
                      : 'text-text-muted hover:text-status-warn-fg')}
                >
                  <ShieldAlert size={10} /> Remediate
                </button>
              )}

              <QuestionItemsButton
                questionInstanceId={qi}
                onClick={() => onOpenDrawer?.(question, 'actions')}
              />

              <span className="flex-1" />

              {busy === qi && <Loader2 size={10} className="animate-spin text-text-muted" />}

              {/* Same rule as the tab-level canAssignReviewer — computed from
                  the standing prop because this row is a separate component
                  and cannot see the tab's local. */}
              {!mineOnly && standing.hasStanding && standing.has(P.ASSIGN_REVIEWER) ? (
                <UserPicker
                  users={reviewers}
                  loading={reviewersLoading}
                  value={question.reviewerAssignedUserId}
                  onChange={(userId) => onAssignReviewer(qi, userId)}
                  placeholder="Reviewer…"
                  saving={assigningReviewer === qi}
                  savingLabel="Assigning…"
                  emptyHint="No organisation-side user is eligible on this step yet. Check that step 11 has an assignable side (seed 53)."
                />
              ) : question.reviewerAssignedUserName ? (
                <span className="text-[9px] text-text-muted">
                  {question.reviewerAssignedUserName}
                </span>
              ) : null}
            </div>

            {remediationOpen && (
              <RemediationPanel
                busy={remediating === qi}
                onCancel={() => setRemediationOpen(false)}
                onSubmit={(payload) => {
                  onRequestRemediation(qi, payload)
                  setRemediationOpen(false)
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * ── WHAT EVERY REVIEWER HAS DONE, NOT JUST ME ────────────────────────────
 *
 * The list below this panel is fed by /my-reviewer-sections, which answers
 * "which sections am I working on". For a reviewer at a task that is exactly
 * right. For the CISO or the org admin it is exactly wrong: that endpoint
 * filters on reviewerAssignedUserId = me, and for a caller with no assignment
 * and no active EVALUATE task it returns an empty list — so the Review tab was
 * blank for the two people most likely to ask "how is the review going".
 *
 * /review-summary is a separate read-only endpoint that walks every section of
 * the assessment regardless of who is asking, gated on
 * assessment.sections.view_all. It returns the verdict distribution per
 * section, who the section is assigned to, who signed it off and when, and
 * per question the verdict, the reviewer of record and any linked Issue.
 *
 * It is deliberately NOT a flag on my-reviewer-sections: widening that would
 * change what an in-flight reviewer sees mid-assessment, and the two have
 * different audiences and different shapes.
 */
function ReviewerRollup({ assessmentId, onOpenSection }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['assessment-review-summary', assessmentId],
    queryFn:  () => assessmentsApi.vendor.reviewSummary(assessmentId),
    enabled:  !!assessmentId,
    staleTime: 15 * 1000,
    retry: false,
    select: (r) => r?.data ?? r,
  })

  if (isLoading) return (
    <div className="flex items-center gap-2 px-4 py-6 text-[11px] text-text-muted">
      <Loader2 size={12} className="animate-spin" /> Loading review progress…
    </div>
  )

  // A 403 here means the caller does not hold assessment.sections.view_all.
  // That is a normal state, not a fault — say so plainly rather than showing a
  // red error, which would read as a broken screen.
  if (isError) {
    const status = error?.response?.status
    return (
      <div className="px-4 py-6 text-[11px] text-text-muted">
        {status === 403
          ? 'You do not have permission to see the review across all reviewers.'
          : (error?.message || 'Could not load the review summary.')}
      </div>
    )
  }
  if (!data) return null

  const sections = Array.isArray(data.sections) ? data.sections : []
  const pct = data.totalQuestions > 0
    ? Math.round((data.evaluated / data.totalQuestions) * 100) : 0

  return (
    <div>
      {/* Header: the whole assessment in one line, then the bar. */}
      <div className="px-4 py-3 border-b border-border bg-surface-overlay/40 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Users size={11} className="text-text-muted shrink-0" />
          <span className="text-[11px] font-medium text-text-primary">
            {data.evaluated} of {data.totalQuestions} evaluated
          </span>
          <span className="text-text-muted opacity-40">·</span>
          <span className="text-[10px] text-text-muted">
            {data.sectionsSubmitted} of {data.sectionsTotal} section
            {data.sectionsTotal === 1 ? '' : 's'} signed off
          </span>
          <span className="flex-1" />
          <TallyChips
            t={{
              PASS: data.passCount, PARTIAL: data.partialCount, FAIL: data.failCount,
              pending: data.pendingCount, unanswered: data.unansweredCount,
              total: data.totalQuestions,
            }}
            escalated={data.escalatedCount}
          />
        </div>
        <div className="h-1 rounded-full bg-border overflow-hidden">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {sections.length === 0 && (
        <div className="px-4 py-6 text-center text-[11px] text-text-muted">
          This assessment has no sections yet.
        </div>
      )}

      {sections.map(s => {
        const state = sectionReviewState(s)
        const t = {
          PASS: s.passCount, PARTIAL: s.partialCount, FAIL: s.failCount,
          pending: s.pendingCount, unanswered: s.unansweredCount, total: s.totalQuestions,
        }
        const escalated = (s.questions || []).filter(q => q.linkedIssueId).length
        return (
          <div key={s.sectionInstanceId} className="border-b border-border-subtle last:border-b-0">
            <div className="px-4 py-2 bg-surface-overlay/30">
              <div className="flex items-center gap-2 flex-wrap">
                <Layers size={11} className="text-text-muted shrink-0" />
                <span className="text-[11px] font-medium text-text-primary">{s.sectionName}</span>
                <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0',
                  STATE_TONE[state.tone])}>
                  {state.label}
                </span>
                <span className="flex-1" />
                <TallyChips t={t} escalated={escalated} />
              </div>
              <div className="flex items-center gap-3 mt-1 pl-[19px] flex-wrap">
                <span className="flex items-center gap-1 text-[9px] text-text-muted">
                  <UserCheck size={8} />
                  {/* An unassigned section is the single most useful thing this
                      panel says — it is why a review stalls, and nothing else
                      on any screen reports it. */}
                  {s.reviewerAssignedUserName
                    ? <>Reviewer: {s.reviewerAssignedUserName}</>
                    : <span className="text-status-warn-fg">No reviewer assigned</span>}
                </span>
                {s.reviewerSubmittedByName && (
                  <span className="flex items-center gap-1 text-[9px] text-text-muted">
                    <Clock size={8} />
                    Signed off by {s.reviewerSubmittedByName}
                    {s.reviewerSubmittedAt && <> · {fmtWhen(s.reviewerSubmittedAt)}</>}
                  </span>
                )}
              </div>
            </div>

            {/* Per question: verdict, who evaluated it, and whether it left the
                module as an Issue. No answer text — that is the question
                drawer's job, and it has comment-visibility rules this panel has
                no business reimplementing. */}
            <div className="divide-y divide-border-subtle">
              {(s.questions || []).map(q => (
                <div key={q.questionInstanceId}
                     className="flex items-start gap-2 px-4 py-1.5 pl-[35px]">
                  <span className="text-[9px] text-text-muted font-mono w-6 shrink-0 pt-0.5">
                    {q.orderNo != null ? `Q${q.orderNo}` : ''}
                  </span>
                  <span className="flex-1 min-w-0 text-[10px] text-text-secondary leading-snug">
                    {q.questionText}
                    {q.questionTag && <GuardTagBadge tag={q.questionTag} className="ml-1.5" />}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {!q.answered && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-status-warn-bg text-status-warn-fg">
                        Unanswered
                      </span>
                    )}
                    {q.linkedIssueId && (
                      <span title={`Escalated as issue #${q.linkedIssueId}`}
                            className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-status-fail-bg text-status-fail-fg">
                        <ArrowUpRight size={8} /> #{q.linkedIssueId}
                      </span>
                    )}
                    {isEvaluated(q.reviewerStatus)
                      ? <VerdictChip verdict={q.reviewerStatus} />
                      : <span className="text-[9px] text-text-muted">Pending</span>}
                    {q.reviewerAssignedUserName && (
                      <span className="text-[9px] text-text-muted hidden sm:inline">
                        {q.reviewerAssignedUserName}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}


/**
 * Open the question drawer from the URL.
 *
 * An action item's nav_context now points at
 *   /module/vendor_assessment/{id}?tab=fill&questionInstanceId=4106
 * and landing on the tab with the question somewhere in a long list is not
 * "opening" it. This finds it and opens the drawer on it, once.
 *
 * Once, deliberately: the ref means closing the drawer does not immediately
 * reopen it on the next render, and removing the param from the URL afterwards
 * would fight the back button. The user closes it and it stays closed.
 */
// `open` is the tab's openDrawer(question, tab). It used to be handed the raw
// state setter, which is how the drawer ended up holding a stale snapshot of
// the question — see the note on drawerQuestionId below.
function useDrawerFromUrl(sections, open) {
  const [params] = useSearchParams()
  const wanted   = params.get('questionInstanceId')
  const doneRef  = useRef(null)

  useEffect(() => {
    if (!wanted || doneRef.current === wanted) return
    if (!sections || sections.length === 0) return
    const id = Number(wanted)
    for (const s of sections) {
      const hit = (s.questions || []).find(q => q.questionInstanceId === id)
      if (hit) {
        doneRef.current = wanted
        open(hit)
        // Opening a panel over a list scrolled somewhere else leaves the
        // question it is about off screen, so the two halves describe
        // different things. rAF because the row only exists after this render
        // — and the section may still be collapsed, which is why the card
        // carries the id rather than the section.
        requestAnimationFrame(() => {
          const el = document.getElementById(`question-${id}`)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
        return
      }
    }
  }, [wanted, sections, open])

  // The id, so the list can mark the row the drawer is about. Returned rather
  // than applied here: this hook knows the intent, the rows know their markup.
  return wanted ? Number(wanted) : null
}

/**
 * @param scope  'all' (default) — every section, the organisation's full
 *               evaluation surface: assign reviewers, evaluate, remediate.
 *               'mine' — only the questions reviewer-assigned to the viewer.
 *
 * ── WHY A PROP AND NOT A SECOND COMPONENT ────────────────────────────────
 * A review assistant evaluates with the same verdicts, the same remediation
 * modal, the same drawer and the same guard badges as a reviewer — the ONLY
 * difference is which questions are theirs. A second component would be this
 * file minus a filter, and the day somebody changes how a verdict is saved
 * they would change it in one of the two.
 *
 * The filter is a post-filter on entity.sections rather than a new endpoint:
 * every question already carries reviewerAssignedUserId, and
 * assertUserHasParticipated lets any ORGANIZATION user load the assessment. So
 * "my questions to evaluate" needed no backend at all.
 */
export default function AssessmentReviewTab({
  assessmentId, entity, vc = {}, userSide, userRole,
  stepInstanceId, taskId, onTaskComplete, scope = 'all',
}) {
  const qc = useQueryClient()
  const mineOnly = scope === 'mine'
  const { userId: viewerId } = useSelector(selectAuth)
  const [busy, setBusy] = useState(null)
  const [remediating, setRemediating] = useState(null)
  const [assigningReviewer, setAssigningReviewer] = useState(null)
  // ── THE DRAWER HOLDS AN ID, NOT A QUESTION ────────────────────────────
  //
  // It held the question object captured at click time, so every verdict,
  // remediation and clarification that invalidated the list left the drawer
  // showing the copy taken before the change. It read as "only updates on
  // refresh". Holding the id and looking it up means the drawer and the list
  // read the same cache entry.
  const [drawerQuestionId, setDrawerQuestionId] = useState(null)
  // Which tab the drawer lands on, so Discuss and Evidence on a row can say
  // where they are going. Null means the drawer's own default.
  const [drawerTab, setDrawerTab] = useState(null)
  const openDrawer = (q, tab = null) => {
    setDrawerQuestionId(q?.questionInstanceId ?? null)
    setDrawerTab(tab)
  }
  const [filter, setFilter] = useState('all')

  // 'mine' is the working view — the sections this reviewer owns, with the
  // verdict buttons. 'all' is the read-only roll-up across every reviewer.
  const [view, setView] = useState('mine')

  // ── WHERE THE SECTIONS COME FROM, AND WHY NOT FROM /review ──────────────
  //
  // This tab rendered blank for everyone, and there were two reasons stacked
  // on top of each other.
  //
  //   1. unwrapList was the wrong reader. /review returns a
  //      VendorAssessmentResponse — an OBJECT with a .sections array on it —
  //      not a list. unwrapList does
  //          const arr = raw?.data?.data || raw?.data || raw
  //          return Array.isArray(arr) ? arr : []
  //      so `arr` ended up as the response object, Array.isArray said no, and
  //      it returned []. On a SUCCESSFUL call. Every time, for every user.
  //
  //   2. /review is the one endpoint that refuses this page.
  //      reviewAssessment calls assertUserHasActiveTask — an ACTIVE task on
  //      the review step, or a 403. An org admin opening the assessment from
  //      the list has no task, so the fetch failed as well as being misread.
  //
  // The fix for both is to stop fetching. GET /v1/assessments/{id} — the call
  // the module page has ALREADY made to render this page at all — returns
  // .sections(buildSectionInstances(assessmentId)) on the same payload, and
  // its guard is assertUserHasParticipated, which returns early for any
  // SYSTEM or ORGANIZATION user. The data was already in `entity`.
  //
  // This is the same pattern AssessmentSectionsTab uses, for the same reason,
  // and it is the mistake I fixed there and did not carry across.
  const hasEntitySections = Array.isArray(entity?.sections)
  const { data: raw, isLoading, isError, error } = useQuery({
    queryKey: ['assessment-detail-sections', assessmentId],
    queryFn:  () => assessmentsApi.vendor.get(assessmentId),
    enabled:  !!assessmentId && !hasEntitySections,
    staleTime: 30 * 1000,
  })

  const sections = useMemo(() => {
    // The axios interceptor unwraps ApiResponse.data, but a caller that gets
    // the envelope would silently render nothing, so both shapes are read.
    const all = hasEntitySections
      ? entity.sections
      : (raw?.sections || raw?.data?.sections || [])
    if (!mineOnly) return all

    // Sections with nothing of mine in them are dropped entirely rather than
    // shown empty: an assistant with three questions across forty sections
    // should see three rows, not forty headers to scroll past.
    return all
      .map(sec => ({
        ...sec,
        questions: (sec.questions || []).filter(
          q => String(q.reviewerAssignedUserId ?? '') === String(viewerId ?? '\u0000')),
      }))
      .filter(sec => sec.questions.length > 0)
  }, [hasEntitySections, entity?.sections, raw, mineOnly, viewerId])

  // ── THE ASSISTANT'S MIRROR OF THE CONTRIBUTOR FIX ───────────────────────
  // A review assistant holds no workflow task either — reviewer-assigning a
  // question creates a REVIEWER_ASSIGNMENT action item and nothing else. So
  // standing from canAct alone made the whole evaluation surface read-only for
  // the one person My review exists for, exactly as it did on the vendor side.
  //
  // Owning reviewer-assigned questions IS the obligation the server's
  // assertUserHasActiveTask bypass looks for.
  const myReviewCount = useMemo(() => {
    const all = hasEntitySections
      ? (entity?.sections || [])
      : (raw?.sections || raw?.data?.sections || [])
    return all.reduce((n, sec) => n + (sec.questions || []).filter(
      q => String(q.reviewerAssignedUserId ?? '') === String(viewerId ?? '\u0000')).length, 0)
  }, [hasEntitySections, entity?.sections, raw, viewerId])

  // ── WHAT THIS ASSISTANT HAS ALREADY LOCKED ─────────────────────────────
  // The org-side mirror of contributor-section-status, and it has existed all
  // along. Only queried on the "mine" tab: a reviewer or CISO looking at the
  // whole assessment has no assistant submissions of their own, and asking
  // would be a request that can only come back empty.
  const { data: assistantSubmitted = new Set() } = useQuery({
    queryKey: ['assistant-section-status', assessmentId],
    queryFn:  () => assessmentsApi.vendor.assistantSectionStatus(assessmentId),
    enabled:  !!assessmentId && mineOnly,
    select:   (d) => {
      const rows = Array.isArray(d) ? d : (d?.data || [])
      return new Set(rows.map(r => r.sectionInstanceId))
    },
  })

  // ── MY OWN LOCK YIELDS TO MY OWN NEW WORK ───────────────────────────────
  //
  // The org-side mirror of the contributor case on the fill tab, and the same
  // dead end: a review assistant who locked a section and is then assigned
  // another question in it can evaluate that question, but the Lock control
  // had vanished — so the REVIEWER_ASSIGNMENT item it created had no way to
  // close and stayed in their inbox for good.
  //
  // useOwedAssignmentIds reads the viewer's own action-item list, which the app
  // already fetches for the inbox badge and keeps fresh over the user's WS
  // topic. No request, and ASSIGNMENT_TYPES covers both sides, so this is the
  // same hook the fill tab uses rather than an org-side copy of it.
  const owedAssignmentIds = useOwedAssignmentIds(viewerId)

  const hasObligation = myReviewCount > 0
  const standing = useStanding(vc, 'EVALUATE', { obligation: hasObligation })


  // ── THE MIRROR OF THE SECTIONS-TAB BUG ──────────────────────────────────
  //
  // standing is useStanding(vc, 'EVALUATE'), so can() additionally requires
  // vc.stepAction === 'EVALUATE'. That is right for evaluating — the reviewer
  // does that on step 11 — and wrong for ASSIGNING reviewers, which the ORG
  // CISO does one step earlier, on the ASSIGN step. On that step `can()` was
  // false for them, so the reviewer picker and the bulk-assign bar were hidden
  // from the only person whose job it is, exactly as Submit was hidden from the
  // responder on the vendor side.
  //
  // Assignment is therefore gated on standing plus the permission, with no
  // step-action check: you hold the live task on this assessment, and you hold
  // assessment.question.assign_reviewer. Evaluating keeps its step gate —
  // recording a verdict genuinely belongs to the evaluate step.
  const canAssignReviewer = standing.hasStanding && standing.has(P.ASSIGN_REVIEWER)

  const { data: reviewers = [], isLoading: reviewersLoading } =
    useEligibleUsers(stepInstanceId, 'ORGANIZATION', canAssignReviewer)

  // Locked sections are read-only to the assistant who locked them, the same
  // way a contributor's are. Computed per section in the loop below; this is
  // the tab-wide half.
  const canEvaluate = standing.can(P.REVIEW_EVALUATE)

  // Both are hooks, so they sit above the isLoading early return. Sections open
  // by default — see useSectionCollapse.
  const focusedQuestionId = useDrawerFromUrl(sections, openDrawer)
  const collapse  = useSectionCollapse(sections)
  const selection = useQuestionSelection()
  // Not on the 'mine' tab, whatever the viewer holds. A reviewer who also has
  // questions of their own still assigns from the full Review tab; offering it
  // here would mean reassigning your own work away from a list defined as
  // "yours", which reads as a bug the moment the row disappears.
  const canBulkAssign = !mineOnly && canAssignReviewer

  const allQuestionIds = useMemo(
    () => sections.flatMap(s => (s.questions || []).map(q => q.questionInstanceId)).filter(Boolean),
    [sections])

  // ── ESCALATIONS, WITHOUT A SECOND REQUEST ───────────────────────────────
  // ActionItemsBulkProvider is mounted INSIDE this component's own return, so
  // its context is not readable from here. But its query key is deterministic,
  // and react-query dedupes by key — so declaring the identical query here
  // reads the very same cache entry the provider fills. No extra round trip,
  // and no change to useActionItems.js to export a context it had no reason to.
  //
  // Must match ActionItemsBulkProvider exactly: the same key shape, the same
  // sorted comma-joined ids, the same select and staleTime. If that hook's key
  // changes, this goes stale silently — which is the cost of reading someone
  // else's cache, and the reason it is spelled out rather than hidden in a
  // helper.
  const idKey = useMemo(
    () => allQuestionIds.filter(Boolean).map(String).sort().join(','),
    [allQuestionIds])

  const { data: allItems = [] } = useQuery({
    queryKey: ['action-items-entities', 'QUESTION_RESPONSE', idKey],
    queryFn:  () => actionItemsApi.forEntities('QUESTION_RESPONSE', idKey.split(',')),
    select:   (d) => (Array.isArray(d) ? d : (d?.data || [])),
    enabled:  !!idKey,
    staleTime: 30_000,
  })

  // Question ids with at least one escalated finding. String keys, because
  // entityId comes back as a string from the API and the question ids are
  // numbers — a Set of mixed types matches nothing.
  const escalatedIds = useMemo(() => {
    const s = new Set()
    for (const it of allItems) if (it.linkedIssueId) s.add(String(it.entityId))
    return s
  }, [allItems])

  const escalatedBySection = useMemo(() => {
    const m = new Map()
    for (const sec of sections) {
      const n = (sec.questions || [])
        .filter(q => escalatedIds.has(String(q.questionInstanceId))).length
      m.set(sec.sectionInstanceId, n)
    }
    return m
  }, [sections, escalatedIds])

  // The live question behind the open drawer, re-derived from the list on
  // every render. Null also closes the drawer when the question leaves the
  // list — the 'mine only' filter can do that — which beats showing a row
  // that is no longer in view behind it.
  const drawerQuestion = useMemo(() => {
    if (drawerQuestionId == null) return null
    for (const s of sections || []) {
      const hit = (s.questions || []).find(q => q.questionInstanceId === drawerQuestionId)
      if (hit) return hit
    }
    return null
  }, [drawerQuestionId, sections])

  const drawerMode = resolveDrawerMode(userSide, vc, drawerQuestion, false, hasObligation)

  // ── THE CHECKPOINT NOBODY CLICKS ────────────────────────────────────────
  // VendorAssessmentResponderReviewPage fires this on mount, with no button and
  // nothing on screen: useAssessmentPageSetup calls
  //
  //     POST /v1/assessments/{id}/mark-section-complete?taskId=
  //
  // which publishes ANSWERS_REVIEWED and ticks the "Review all answers"
  // checkpoint of the compound task. Without it that step's compound gate never
  // closes and the workflow stalls with everything apparently done.
  //
  // It is idempotent server-side — the endpoint swallows a repeat — but the ref
  // keeps it to one call per mount anyway, and resets on failure so a transient
  // error can retry on the next render rather than stranding the step.
  const markedRef = useRef(false)
  useEffect(() => {
    if (markedRef.current) return
    if (!assessmentId || !taskId) return
    if (!sections.length) return          // nothing reviewed yet; too early to claim it
    markedRef.current = true
    assessmentsApi.vendor.markSectionComplete(assessmentId, parseInt(taskId, 10))
      .then(() => qc.refetchQueries({ queryKey: ['compound-progress'] }))
      .catch(() => { markedRef.current = false })
  }, [assessmentId, taskId, sections.length, qc])

  // Sections now come off `entity`, which the module page owns, so refreshing
  // after a verdict means invalidating ITS query — not the one this tab used to
  // make. ['module-detail'] is the key UniversalModulePage uses for the detail
  // fetch; the second is the fallback this tab makes when entity has no
  // sections, and the third is the all-reviewers roll-up.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['module-detail'] })
    qc.invalidateQueries({ queryKey: ['assessment-detail-sections', assessmentId] })
    qc.invalidateQueries({ queryKey: ['assessment-review-summary', assessmentId] })
  }

  const verdict = useMutation({
    mutationFn: ({ questionInstanceId, value }) =>
      assessmentsApi.vendor.saveReviewerEval(
        assessmentId, questionInstanceId, value, taskId),
    onSuccess: () => {
      invalidate()
      // Evaluating the last assigned question can complete the task, which
      // changes the page's standing. The parent owns that refresh.
      onTaskComplete?.()
    },
    onError:   (e) => toast.error(e?.message || 'Could not save the verdict'),
    onSettled: () => setBusy(null),
  })

  const requestRemediation = useMutation({
    mutationFn: ({ questionInstanceId, payload }) =>
      assessmentsApi.vendor.requestRemediation(assessmentId, questionInstanceId, payload),
    onSuccess: () => {
      toast.success('Remediation requested — the vendor has been notified')
      invalidate()
      // The Findings tab lists these, and its query is keyed separately.
      qc.invalidateQueries({ queryKey: ['assessment-findings', assessmentId] })
      qc.invalidateQueries({ queryKey: ['action-items-entities'] })
      qc.invalidateQueries({ queryKey: ['module-detail'] })
    },
    onError:   (e) => toast.error(e?.message || 'Could not request the remediation'),
    onSettled: () => setRemediating(null),
  })

  // Reviewer assignment had no in-flight state at all: the chip kept the old
  // name, the dropdown stayed live, and the only feedback was a toast once the
  // round trip finished. On a section with twenty questions that is twenty
  // chances to click twice.
  const assignReviewer = useMutation({
    mutationFn: ({ questionInstanceId, userId }) =>
      assessmentsApi.vendor.reviewerAssignQuestion(assessmentId, questionInstanceId, userId),
    onSuccess: () => { toast.success('Reviewer assigned'); invalidate() },
    onError:   (e) => toast.error(e?.message || 'Could not assign the reviewer'),
    onSettled: () => setAssigningReviewer(null),
  })

  // The org-side mirror of the vendor tab's bulk assign. Different endpoint on
  // purpose: this writes reviewerAssignedUserId and must never touch
  // assignedUserId, which is the vendor's contributor field.
  // Mirrors contributorSubmit exactly, including what it does NOT close: a
  // clarification raised on a question in this section survives the lock, and
  // the open obligation is what lets the assistant back in to answer it.
  const assistantSubmit = useMutation({
    mutationFn: (sectionInstanceId) =>
      assessmentsApi.vendor.assistantSubmitSection(assessmentId, sectionInstanceId, taskId),
    onSuccess: () => {
      toast.success('Evaluations locked')
      qc.invalidateQueries({ queryKey: ['assistant-section-status', assessmentId] })
      qc.invalidateQueries({ queryKey: ['assessment-detail-sections', assessmentId] })
      qc.invalidateQueries({ queryKey: ['module-detail'] })
      qc.invalidateQueries({ queryKey: ['inbox-action-items'] })
      onTaskComplete?.()
    },
    onError: (e) => toast.error(e?.message || 'Could not lock the evaluations'),
  })

  /**
   * The reviewer's own submit — the org-side mirror of the responder's.
   *
   * The endpoint existed, the API method did not, and nothing rendered a
   * control for it, so the gesture this tab's own comment calls "the
   * equivalent" was unreachable. A reviewer could evaluate every question in a
   * section and had no way to say they were finished.
   */
  const reviewerSubmit = useMutation({
    mutationFn: (sectionInstanceId) =>
      reviewApi.reviewerSubmitSection(assessmentId, sectionInstanceId, taskId),
    onSuccess: () => {
      toast.success('Section submitted')
      invalidateAssessment(qc, assessmentId)
      qc.invalidateQueries({ queryKey: ['assessment-detail-sections', assessmentId] })
      qc.invalidateQueries({ queryKey: ['assessment-reviewer-sections', assessmentId] })
      // Submitting can satisfy the step's section gate, which decides what the
      // step's own controls offer next.
      qc.invalidateQueries({ queryKey: ['view-context'] })
      onTaskComplete?.()
    },
    onError: (e) => toast.error(
      e?.response?.data?.error?.message || e?.message || 'Could not submit the section'),
  })

  const reviewerAssignBatch = useMutation({
    mutationFn: ({ userId, questionInstanceIds }) =>
      assessmentsApi.vendor.reviewerAssignQuestionsBatch(assessmentId, questionInstanceIds, userId),
    onSuccess: (_d, v) => {
      toast.success(`${v.questionInstanceIds.length} question${v.questionInstanceIds.length === 1 ? '' : 's'} assigned`)
      selection.clear()
      invalidate()
    },
    onError: (e) => toast.error(e?.message || 'Could not assign the selected questions'),
  })

  if (isLoading) {
    return <div className="px-4 py-8 text-center text-[11px] text-text-muted">Loading answers…</div>
  }

  const all       = sections.flatMap(s => s.questions || [])
  // isEvaluated, not a bare truthiness check: reviewerStatus defaults to the
  // string "PENDING" on the entity, so `q.currentResponse?.reviewerStatus`
  // alone counted every untouched question as evaluated.
  const evaluated = all.filter(q => isEvaluated(q.currentResponse?.reviewerStatus)).length
  const overall   = tally(all)

  // ── has(), NOT can() ────────────────────────────────────────────────────
  //
  // can() is `hasStanding && onStep && perms.includes(code)` — an active task,
  // on the EVALUATE step, holding the permission. Reading the roll-up is none
  // of those things: it is a read, and the server gates it on the permission
  // alone (@PreAuthorize("hasAuthority('assessment.sections.view_all')")).
  //
  // With can(), an org admin browsing the assessment has canAct = false — no
  // task — so the toggle never rendered and the roll-up could not be opened by
  // the one person it exists for. That is the UI being STRICTER than the
  // server, which is the mirror image of the assertAssignable hole and just as
  // wrong: it hides a control the server would have allowed, and it fails
  // silently, so it reads as a missing feature rather than a bug.
  const canSeeAll = standing.has(P.SECTIONS_VIEW_ALL)

  // ── WHICH VIEW OPENS ────────────────────────────────────────────────────
  //
  // The early returns for "loading / error / nothing to review" used to sit
  // ABOVE the toggle, which meant the all-reviewers roll-up was unreachable in
  // exactly the situation it was built for: an org admin with no sections of
  // their own saw "Nothing to review yet" and no way to get past it. The
  // feature existed and could not be opened.
  //
  // So the toggle renders first, and the empty state is now scoped to the
  // 'mine' pane rather than to the tab. And when the caller can see everything
  // and has nothing of their own, 'all' is the view that opens — defaulting to
  // an empty pane and making them find the other one is a worse answer than
  // just showing them the thing they have permission to see.
  const effectiveView = (canSeeAll && view === 'mine' && !sections.length) ? 'all' : view

  // Section-level review progress, from the four columns the DTO now carries.
  const reviewedSections = sections
    .filter(s => sectionReviewState(s).key === 'reviewed').length
  const sentBackSections = sections
    .filter(s => sectionReviewState(s).key === 'reopened').length

  // A filter that hides everything is worse than no filter — it looks like the
  // data failed to load. The count is shown beside each chip so nobody picks an
  // empty one by accident, and an empty result says so in words.
  const visibleCount = all.filter(q => matchesFilter(q, filter, escalatedIds)).length

  const filterCount = (key) =>
    key === 'all' ? all.length : all.filter(q => matchesFilter(q, key, escalatedIds)).length

  // Plain const rather than useMemo: it is computed after the isLoading early
  // return, where a hook cannot go, and it is a filter over a list already in
  // memory. "All" means everything the active filter is showing.
  const assignableIds = canBulkAssign
    ? all.filter(q => matchesFilter(q, filter, escalatedIds))
         .map(q => q.questionInstanceId).filter(Boolean)
    : []

  return (
    <ActionItemsBulkProvider
      entityType="QUESTION_RESPONSE"
      entityIds={allQuestionIds}
      enabled={allQuestionIds.length > 0}
    >
    <div>
      {/* ── MY REVIEW vs ALL REVIEWERS ───────────────────────────────────
          Only rendered for someone who holds assessment.sections.view_all —
          for a reviewer with one assigned section, a toggle offering a view
          they will be refused is noise. */}
      {canSeeAll && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border">
          {[
            { key: 'mine', label: 'My review',     Icon: UserCheck },
            { key: 'all',  label: 'All reviewers', Icon: Users },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors',
                effectiveView === key
                  ? 'border-brand-500 bg-brand-500/10 text-brand-ink font-medium'
                  : 'border-border text-text-muted hover:border-border-strong')}>
              <Icon size={9} /> {label}
              {key === 'mine' && !sections.length && (
                <span className="opacity-60">(0)</span>
              )}
            </button>
          ))}
          <span className="flex-1" />
          {effectiveView === 'all' && (
            <span className="inline-flex items-center gap-1 text-[9px] text-text-muted">
              <Eye size={9} /> Read-only
            </span>
          )}
        </div>
      )}

      {/* The whole-tab error state. Only reachable now when entity carried no
          sections AND the fallback fetch failed — and even then, only shown in
          the 'mine' pane, because the roll-up is a different request with a
          different permission and may well succeed where this one did not. */}
      {effectiveView === 'all' ? (
        <ReviewerRollup assessmentId={assessmentId} />
      ) : isError ? (
        <div className="px-4 py-8 text-center">
          <AlertTriangle size={16} className="mx-auto text-status-fail-fg" />
          <p className="mt-2 text-[11px] text-status-fail-fg">
            {error?.message || 'Could not load the review.'}
          </p>
        </div>
      ) : !sections.length ? (
        <div className="px-4 py-8 text-center">
          <Layers size={16} className="mx-auto text-text-muted" />
          <p className="mt-2 text-[11px] text-text-muted">
            {canSeeAll
              ? 'No sections are assigned to you on this assessment.'
              : 'Nothing to review yet — the vendor has not submitted.'}
          </p>
          {canSeeAll && (
            <button
              onClick={() => setView('all')}
              className="mt-2 text-[10px] text-brand-ink underline underline-offset-2">
              See what every reviewer has done
            </button>
          )}
        </div>
      ) : (
      <>
      {/* ── WHERE THIS REVIEW STANDS ─────────────────────────────────────
          Answers "what is done" before the list answers "what is next". The
          section line and the question line are separate on purpose: a section
          can be fully evaluated question-by-question and still not submitted by
          its reviewer, and those two look identical if you only count
          verdicts. */}
      <div className="px-4 py-2.5 border-b border-border bg-surface-overlay/40 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-text-muted">
            {evaluated} of {all.length} answer{all.length === 1 ? '' : 's'} evaluated
          </span>
          <span className="text-text-muted opacity-40">·</span>
          <span className="text-[10px] text-text-muted">
            {reviewedSections} of {sections.length} section{sections.length === 1 ? '' : 's'} signed off
            {sentBackSections > 0 && (
              <span className="text-status-warn-fg"> · {sentBackSections} sent back</span>
            )}
          </span>
          <span className="flex-1" />
          {!standing.hasStanding && (
            <span className="text-[9px] text-text-muted">
              View only — you do not hold an active task on this assessment.
            </span>
          )}
        </div>
        <TallyChips t={overall} escalated={escalatedIds.size} />
      </div>

      {/* The filter earns its place on a 90-question assessment, where the four
          questions still needing a verdict are scattered across nine sections.
          Chips with counts, not a dropdown: the counts ARE the summary. */}
      <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border flex-wrap">
        <Filter size={10} className="text-text-muted shrink-0" />
        {FILTERS.map(f => {
          const n = filterCount(f.key)
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              disabled={n === 0 && f.key !== 'all'}
              className={cn('text-[9px] px-1.5 py-0.5 rounded border transition-colors',
                filter === f.key
                  ? 'border-brand-500 bg-brand-500/10 text-brand-ink font-medium'
                  : 'border-border text-text-muted hover:border-border-strong',
                n === 0 && f.key !== 'all' && 'opacity-30 cursor-not-allowed')}
            >
              {f.label} {n > 0 && <span className="opacity-70">({n})</span>}
            </button>
          )
        })}
      </div>

      {filter !== 'all' && visibleCount === 0 && (
        <div className="px-4 py-6 text-center text-[11px] text-text-muted">
          No question matches that filter.
        </div>
      )}

      <ListToolbar
        allOpen={collapse.allOpen}
        onToggleAll={collapse.toggleAll}
        totalQuestions={canBulkAssign ? assignableIds.length : 0}
        selectedCount={selection.count}
        onSelectAllQuestions={canBulkAssign
          ? () => selection.toggleMany(assignableIds)
          : undefined}
        left={
          <span className="text-[10px] text-text-muted">
            {/* Counts the questions the FILTER is showing, not the whole
                assessment — selecting "all" while a filter is on must mean
                what is on screen, or the bar and the list disagree. */}
            {visibleCount} of {all.length} question{all.length === 1 ? '' : 's'} shown
          </span>
        }
      />

      {sections.map(section => {
        const questions = (section.questions || [])
          .filter(q => matchesFilter(q, filter, escalatedIds))
        // A section with nothing matching drops out entirely rather than
        // printing a heading over empty space.
        if (!questions.length) return null
        const sid  = section.sectionInstanceId
        const open = collapse.isOpen(sid)
        // Only the questions currently visible in this section are selectable,
        // for the same reason as the count above.
        const sectionIds = canBulkAssign
          ? questions.map(q => q.questionInstanceId).filter(Boolean)
          : []
        const sectionSelected = sectionIds.filter(id => selection.isSelected(id)).length
        // reviewerSubmittedAt is deliberately still absolute: the reviewer's
        // lock is the one the server honours, and being assigned a question is
        // not a reason to lift it. Only this person's OWN lock yields.
        // section.questions, not the filtered `questions` above: a filter is a
        // view of the list and must not be able to hide the control that closes
        // an obligation. The fill tab reads the unfiltered list for the same
        // reason.
        const owedInSection = !section.reviewerSubmittedAt
          && (section.questions || []).some(q => owedAssignmentIds.has(q.questionInstanceId))
        return (
        <div key={sid}>
          <SectionReviewHeader
            section={section}
            escalated={escalatedBySection.get(sid) || 0}
            open={open}
            onToggle={() => collapse.toggle(sid)}
            selectableIds={sectionIds}
            selectedCount={sectionSelected}
            onSelectAll={sectionIds.length ? () => selection.toggleMany(sectionIds) : undefined}
          />
          {/* ── THE REVIEWER'S SUBMIT, WHICH WAS NEVER RENDERED ──────────
              The comment below has always said reviewer-submit is "the
              equivalent gesture" on the full Review tab. Nothing rendered it:
              no control, no API method, only the endpoint. A reviewer could
              evaluate every question in a section and had no way to say so.

              Gated the way the vendor side's now is — standing, the
              permission, and whose section it is. reviewer_assigned_user_id is
              the org-side owner; an unassigned section stays open because that
              is the state before the org CISO has allocated anything, and the
              endpoint's own fallback already reads "no explicit assignments"
              as "all sections". The server refuses the rest with
              SECTION_NOT_YOURS, so this mirrors it rather than guessing. */}
          {!mineOnly && open && !section.reviewerSubmittedAt
            && standing.hasStanding && standing.has(P.REVIEW_EVALUATE)
            && (section.reviewerAssignedUserId == null
                || String(section.reviewerAssignedUserId) === String(viewerId ?? '\u0000')) && (
            <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-border bg-surface-overlay/30">
              <span className="text-[10px] text-text-muted">
                {questions.filter(q => isEvaluated(q.currentResponse?.reviewerStatus)).length}
                {' of '}{questions.length} evaluated
              </span>
              <button
                onClick={() => reviewerSubmit.mutate(sid)}
                disabled={reviewerSubmit.isPending}
                title="Signs off this section. It stops further evaluation until it is reopened."
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border border-border bg-surface-raised text-text-secondary hover:border-border-strong transition-colors disabled:opacity-50"
              >
                <CheckCheck size={10} />
                {reviewerSubmit.isPending ? 'Submitting…' : 'Submit section'}
              </button>
            </div>
          )}

          {/* Assistant lock, mirroring the contributor's on the fill tab.
              Only on the "mine" tab: on the full Review tab the equivalent
              gesture is reviewer-submit, above. */}
          {mineOnly && open && (
            <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-border bg-surface-overlay/30">
              {/* owedInSection, not assistantSubmitted alone — see its
                  derivation above. Without this the assistant can evaluate the
                  question they were newly assigned and has nothing to close the
                  obligation with. The endpoint now handles a second call
                  correctly; this is the button that reaches it. */}
              {assistantSubmitted.has(sid) && !owedInSection ? (
                <span className="flex items-center gap-1 text-[10px] text-status-pass-fg">
                  <CheckCheck size={10} />
                  Locked — reopens if the reviewer asks for a clarification
                </span>
              ) : section.reviewerSubmittedAt ? (
                <span className="text-[10px] text-text-muted">
                  Section locked by the reviewer
                </span>
              ) : (
                <>
                  <span className="text-[10px] text-text-muted">
                    {questions.filter(q => isEvaluated(q.currentResponse?.reviewerStatus)).length}
                    {' of '}{questions.length} evaluated
                    {assistantSubmitted.has(sid)
                      ? <>{' · '}you were assigned more work here after locking</>
                      : <>{' · '}each saved verdict is already reported</>}
                  </span>
                  <button
                    onClick={() => assistantSubmit.mutate(sid)}
                    disabled={assistantSubmit.isPending}
                    title={assistantSubmitted.has(sid)
                      ? 'Locks the question you were newly assigned and clears it from your inbox. Your earlier verdicts in this section stay locked.'
                      : 'Stops further editing of your verdicts in this section. It reopens if the reviewer asks for a clarification.'}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border border-border bg-surface-raised text-text-secondary hover:border-border-strong transition-colors disabled:opacity-50"
                  >
                    <CheckCheck size={10} />
                    {assistantSubmit.isPending ? 'Locking…' : 'Lock my evaluations'}
                  </button>
                </>
              )}
            </div>
          )}

          {open && questions.map(q => (
            <ReviewCard
              key={q.questionInstanceId}
              selectable={sectionIds.length > 0}
              selected={selection.isSelected(q.questionInstanceId)}
              onToggleSelect={selection.toggle}
              question={q}
              assessmentId={assessmentId}
              vc={vc}
              standing={standing}
              // Per question, not per section: only the question they were
              // newly assigned reopens, and only when the lock in the way is
              // their OWN assistant lock rather than the reviewer's. Their
              // earlier verdicts in this section stay locked, which is the
              // point — a reviewer adding one question must not silently
              // reopen evaluations the assistant had already finished.
              // The mirror of the fill tab's `editable` override.
              canEvaluate={canEvaluate
                && !section.reviewerSubmittedAt
                && (!(mineOnly && assistantSubmitted.has(sid))
                    || owedAssignmentIds.has(q.questionInstanceId))}
              reviewers={reviewers}
              reviewersLoading={reviewersLoading}
              busy={busy}
              onVerdict={(questionInstanceId, value) => {
                setBusy(questionInstanceId)
                verdict.mutate({ questionInstanceId, value })
              }}
              assigningReviewer={assigningReviewer}
              mineOnly={mineOnly}
              viewerId={viewerId}
              focused={focusedQuestionId === q.questionInstanceId}
              onAssignReviewer={(questionInstanceId, userId) => {
                setAssigningReviewer(questionInstanceId)
                assignReviewer.mutate({ questionInstanceId, userId })
              }}
              onOpenDrawer={openDrawer}
              remediating={remediating}
              onRequestRemediation={(questionInstanceId, payload) => {
                setRemediating(questionInstanceId)
                requestRemediation.mutate({ questionInstanceId, payload })
              }}
            />
          ))}
        </div>
        )
      })}

      <BulkAssignBar
        count={selection.count}
        users={reviewers}
        loading={reviewersLoading}
        saving={reviewerAssignBatch.isPending}
        label="Assign reviewer…"
        emptyHint="No organisation-side review assistant is eligible on this step yet."
        onAssign={(userId) =>
          reviewerAssignBatch.mutate({ userId, questionInstanceIds: selection.asArray() })}
        onClear={selection.clear}
      />
      </>
      )}

      <QuestionDrawer
        question={drawerQuestion}
        assessmentId={assessmentId}
        userSide={userSide}
        userRole={userRole}
        mode={drawerMode}
        initialTab={drawerTab}
        // The organisation never edits the vendor's answer. It evaluates it —
        // and the verdict controls for that are on the row, not in here. A
        // clarification raised on a reviewer is an obligation about their
        // EVALUATION, so it must not be allowed to open the answer; false here
        // is what stops the card's obligation bypass doing exactly that.
        canAnswer={false}
        onClose={() => { setDrawerQuestionId(null); setDrawerTab(null) }}
        // Per-question buttons from ui_actions, screen_key
        // 'vendor_assessment_question'. Renders nothing until sql/72 seeds
        // rows, and nothing for a user the server filters them away from.
        actionsSlot={drawerQuestion ? (
          <QuestionActionBar
            question={drawerQuestion}
            assessmentId={assessmentId}
            taskId={taskId}
            stepInstanceId={stepInstanceId}
            // Organisation side: the reviewer assignment, not the answering
            // one. reviewerAssignedUserId is also what the My review tab
            // filters on, so the two agree by construction.
            assignedToViewer={
              String(drawerQuestion?.reviewerAssignedUserId ?? '') === String(viewerId ?? '\u0000')}
            hasSections={vc?.hasSections === true}
            stepAction={vc?.stepAction}
            onDone={() => { invalidate(); onTaskComplete?.() }}
          />
        ) : null}
      />
    </div>
    </ActionItemsBulkProvider>
  )
}