/**
 * AssessmentSectionsTab.jsx
 *
 * The read-only view of the whole questionnaire: every section, every question,
 * every answer, with the per-question side panel behind each row.
 *
 * ── WHY THIS WAS EMPTY, AND WHAT CHANGED ──────────────────────────────────
 * The previous version called
 *
 *     GET /v1/assessments/{id}/sections/status
 *
 * which exists to answer "who owns each section and has it been submitted".
 * AssessmentController.getSectionsStatus builds its rows with
 *
 *     .questions(null) // status view only — no questions loaded
 *
 * so section.questions was always null and every section printed "No questions
 * in this section." That was my mistake, not a data problem.
 *
 * The questions were already on the page. UniversalModulePage fetches
 * GET /v1/assessments/{id} to populate `entity`, and that response carries the
 * full tree — buildSectionInstances (AssessmentController:1337) issues five
 * bulk queries and returns sections → questions → options, plus currentResponse
 * and its comments per question. So this tab now reads entity.sections and
 * makes no request of its own. One fewer round trip, and the section rows carry
 * exactly the same assignment and submission fields they did before
 * (assignedUserName, submittedAt, submittedByName, reopenedAt).
 *
 * ── WHAT THIS TAB IS FOR ──────────────────────────────────────────────────
 * This is the both-sides read surface, the counterpart of AssessmentDetailPage's
 * "Sections & Answers" tab. It shows the questionnaire as it stands. It does NOT
 * answer questions (that is the Questionnaire tab, vendor side) and does NOT set
 * reviewer verdicts (that is the Review tab, org side).
 *
 * What it does carry, because the hardcoded page carries it:
 *   • per-role answer visibility — scores and reviewer verdicts are org-side
 *   • the per-question drawer, with its five tabs and three comment channels
 *   • section assign / submit / reopen, gated on vc permissions
 *
 * ── PER-ROLE FILTERS, FROM AssessmentDetailPage:695-714 ───────────────────
 * The hardcoded page derives these from a viewMode resolved out of role names.
 * Here they come from the caller's side plus vc permissions, so a workflow
 * rewrite does not need a frontend change:
 *
 *   showScores   org side        — option scores and scoreEarned
 *   showReviewer org side        — reviewer verdict badges
 *   showAll      everyone but a contributor — a contributor sees only their own
 *
 * ── STILL NOT HERE ────────────────────────────────────────────────────────
 * Section-level reviewer assignment. The backend has reviewerAssignQuestion and
 * its batch, but no section-level reviewer assign, so the reviewer name is shown
 * read-only. A picker here would have to fan out per question and call that a
 * section assignment.
 */

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import {
  Layers, CheckCircle2, Clock, RefreshCw, CheckCheck,
  User, ChevronRight, ChevronDown, Paperclip, Asterisk, PanelRight,
} from 'lucide-react'
import { assessmentsApi } from '../../api/assessments.api'
import { QuestionDrawer } from '../item-panel'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'
import {
  UserPicker, useEligibleUsers, useStanding, P,
  resolveDrawerMode, GuardTagBadge,
  QuestionActionBar,
  useSectionCollapse, useQuestionSelection, SelectBox, ListToolbar, BulkAssignBar,
  invalidateAssessment,
} from './vendorShared'

// ═══════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════

function SectionStatusChip({ section }) {
  const submitted = !!section.submittedAt
  const reopened  = !!section.reopenedAt && !submitted

  const cfg = submitted
    ? { label: 'Submitted', icon: CheckCircle2, color: 'text-status-pass-fg', bg: 'bg-status-pass-bg' }
    : reopened
      ? { label: 'Reopened', icon: RefreshCw,   color: 'text-status-warn-fg', bg: 'bg-status-warn-bg' }
      : { label: 'Open',     icon: Clock,       color: 'text-text-muted',     bg: 'bg-surface-overlay' }

  const Icon = cfg.icon
  return (
    <span className={cn(
      'flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0',
      cfg.color, cfg.bg)}>
      <Icon size={8} />{cfg.label}
    </span>
  )
}

// Same three verdicts the drawer's VERDICT_CFG uses, and PENDING is deliberately
// absent from both: "not yet reviewed" is the default state of every question
// and a badge saying so on all of them carries no information.
const VERDICT = {
  PASS:    { label: 'Pass',    color: 'text-status-pass-fg', bg: 'bg-status-pass-bg' },
  PARTIAL: { label: 'Partial', color: 'text-status-warn-fg', bg: 'bg-status-warn-bg' },
  FAIL:    { label: 'Fail',    color: 'text-status-fail-fg', bg: 'bg-status-fail-bg' },
}

/**
 * Answered / total.
 *
 * The previous version read q.responseText and q.selectedOptionInstanceId — both
 * live on currentResponse, not on the question, so this counted zero even once
 * the questions arrived. currentResponse truthiness is the same test the fill
 * page uses (VendorAssessmentFillPage:1402).
 */
function progressOf(section) {
  const qs = section.questions || []
  if (!qs.length) return null
  return { answered: qs.filter(q => !!q.currentResponse).length, total: qs.length }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION ROW
// ═══════════════════════════════════════════════════════════════════════════

function QuestionRow({ question: q, index, showScores, showReviewer, onOpenDrawer }) {
  const resp    = q.currentResponse
  const verdict = showReviewer ? VERDICT[resp?.reviewerStatus] : null
  const docs    = resp?.documents?.length || 0

  // Selected option text, resolved against the question's own options. Never
  // inferred from a score match — VendorAssessmentsPage:408 does that and it
  // picks the wrong option whenever two options share a score.
  const selectedIds = resp
    ? (resp.selectedOptionInstanceIds?.length
        ? resp.selectedOptionInstanceIds
        : (resp.selectedOptionInstanceId != null ? [resp.selectedOptionInstanceId] : []))
    : []
  const selectedOptions = (q.options || [])
    .filter(o => selectedIds.includes(o.optionInstanceId))

  return (
    // The whole row opens the panel. A question mark cursor and a hover tint
    // are the only honest way to say "there is more behind this" — an icon
    // three columns to the right is not discoverable, which is why nobody
    // found it.
    //
    // role/tabIndex/onKeyDown rather than a <button>: the row contains its own
    // buttons (the drawer toggle, and on other tabs an assignment picker), and
    // a button inside a button is invalid HTML that browsers silently reflow.
    // stopPropagation on those children keeps the two from fighting.
    <li
      data-qi={q.questionInstanceId}
      role="button"
      tabIndex={0}
      onClick={() => onOpenDrawer(q)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDrawer(q) }
      }}
      title="Open notes, evidence and action items for this question"
      className="flex items-start gap-2 py-2 border-b border-border/40 last:border-0 group cursor-pointer hover:bg-surface-overlay/60 focus:bg-surface-overlay/60 focus:outline-none transition-colors -mx-2 px-2 rounded"
    >
      <span className="text-[9px] text-text-muted w-6 shrink-0 pt-1 text-right">
        {index + 1}.
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5">
          <span className="flex-1 text-[11px] text-text-secondary leading-snug">
            {q.questionText}
          </span>
          <GuardTagBadge tag={q.questionTag} className="mt-0.5" />
          {q.mandatory && (
            <Asterisk size={8} className="text-status-fail-fg shrink-0 mt-0.5" title="Mandatory" />
          )}
          {verdict && (
            <span className={cn(
              'text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0',
              verdict.color, verdict.bg)}>
              {verdict.label}
            </span>
          )}
        </div>

        {/* Answer, read-only. Three shapes, matching AnswerResponse. */}
        <div className="mt-1">
          {!resp ? (
            <span className="text-[10px] text-text-muted italic">Not answered</span>
          ) : selectedOptions.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selectedOptions.map(o => (
                <span key={o.optionInstanceId}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay border border-border text-text-secondary">
                  {o.optionValue}
                  {showScores && o.score != null && (
                    <span className="text-text-muted ml-1">({o.score})</span>
                  )}
                </span>
              ))}
            </div>
          ) : resp.responseText ? (
            <p className="text-[10px] text-text-secondary whitespace-pre-wrap bg-surface-overlay/60 rounded px-2 py-1">
              {resp.responseText}
            </p>
          ) : (
            <span className="text-[10px] text-text-muted italic">
              {q.responseType === 'FILE_UPLOAD' ? 'Evidence only' : 'Not answered'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-1">
          {resp?.answeredByName && (
            <span className="text-[9px] text-text-muted">by {resp.answeredByName}</span>
          )}
          {showScores && resp?.scoreEarned != null && q.weight != null && (
            <span className="text-[9px] text-text-muted">
              {resp.scoreEarned}/{q.weight} pts
            </span>
          )}
          {q.assignedUserName && (
            <span className="flex items-center gap-1 text-[9px] text-text-muted">
              <User size={8} /> {q.assignedUserName}
            </span>
          )}
          {docs > 0 && (
            <span className="flex items-center gap-1 text-[9px] text-text-muted">
              <Paperclip size={8} /> {docs}
            </span>
          )}
          {/* Kept as an explicit target as well as the row click: it names
              what opens, and it is what a keyboard user tabs to. */}
          <span className="flex items-center gap-1 text-[9px] text-text-muted group-hover:text-brand-ink transition-colors">
            <PanelRight size={8} /> Open panel
          </span>
        </div>
      </div>
    </li>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION ROW
// ═══════════════════════════════════════════════════════════════════════════

function SectionRow({
  section, standing, responders, respondersLoading, viewerId,
  showScores, showReviewer, onOpenDrawer,
  onAssign, onSubmit, onReopen, busyId, busyOp, expanded, onToggle,
  selectable, selected, onToggleSelect,
}) {
  const sid       = section.sectionInstanceId
  const submitted = !!section.submittedAt
  const progress  = progressOf(section)
  const busy      = busyId === sid
  // busyId alone said "this row is working"; it did not say at what. The
  // picker needs the difference, because "Assigning…" is only honest while
  // the assign call is the one in flight — not while the row is submitting.
  const assigning = busy && busyOp === 'assign'

  // ── THREE OPERATIONS, AND THEY DO NOT HAPPEN ON THE SAME STEP ───────────
  //
  // standing is useStanding(vc, 'ASSIGN'), and can() is
  //
  //     hasStanding && onStep && perms.includes(code)
  //
  // where onStep means vc.stepAction === 'ASSIGN'. That is right for assigning
  // — the vendor CISO does it on the ASSIGN step — and wrong for the other two.
  // A RESPONDER submits their section while holding the FILL step, so onStep
  // was false for them and the Submit button never rendered at all. There was
  // no way for a responder to submit a section.
  //
  // Submit and reopen are therefore gated on standing plus the permission, with
  // no step-action check:
  //
  //   hasStanding  you hold the live task on this assessment, or an override.
  //   has(code)    you hold the permission itself.
  //
  // That is the rule this product is supposed to follow anyway — gate on the
  // permission, not on a name — and it cannot be wrong about which step action
  // a blueprint happens to use for filling, which the previous version was
  // betting on implicitly. Assign keeps its step gate because assigning
  // responders mid-fill is genuinely a different thing, and it works today.
  // ── AND WHOSE SECTION IT IS ─────────────────────────────────────────────
  //
  // Dropping the step gate was right and left this too loose: Submit appeared
  // on every row, including sections belonging to other responders. Submitting
  // one LOCKS it for its real owner, who is told nothing and cannot reopen it.
  //
  // This mirrors the server, which now refuses the same case with
  // SECTION_NOT_YOURS — an unassigned section stays open, because that is the
  // state before the CISO has allocated anything and somebody has to be able
  // to close it. Read the guard, then mirror it: a button whose only possible
  // outcome is a 403 is worse than no button.
  const mine = section.assignedUserId == null
    || String(section.assignedUserId) === String(viewerId ?? '\u0000')

  const canAssign = standing.can(P.ASSIGN_RESPONDER) && !submitted
  const canSubmit = mine && standing.hasStanding && standing.has(P.SECTION_SUBMIT) && !submitted
  const canReopen = standing.hasStanding && standing.has(P.SECTION_REOPEN) && submitted

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border hover:bg-surface-overlay/50 transition-colors">
        {selectable && (
          <SelectBox
            checked={!!selected}
            onChange={onToggleSelect}
            title="Select this section for a bulk assignment"
          />
        )}

        <button
          onClick={onToggle}
          className="text-text-muted hover:text-text-secondary shrink-0"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        <Layers size={13} className="text-text-muted shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-text-primary truncate">
              {section.sectionName}
            </span>
            <SectionStatusChip section={section} />
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {progress && (
              <span className="text-[9px] text-text-muted">
                {progress.answered}/{progress.total} answered
              </span>
            )}
            {section.submittedByName && (
              <span className="text-[9px] text-text-muted">
                Submitted by {section.submittedByName}
              </span>
            )}
            {section.reviewerAssignedUserName && (
              <span className="flex items-center gap-1 text-[9px] text-text-muted">
                <User size={8} /> Reviewer: {section.reviewerAssignedUserName}
              </span>
            )}
          </div>
        </div>

        {canAssign ? (
          <UserPicker
            users={responders}
            loading={respondersLoading}
            value={section.assignedUserId}
            onChange={(userId) => onAssign(sid, userId)}
            placeholder="Assign responder…"
            saving={assigning}
            savingLabel="Assigning…"
            disabled={busy}
            emptyHint="No one is eligible for this step yet. The step needs an assignable side or role, or the workflow has not reached an assignment step."
          />
        ) : section.assignedUserName ? (
          <span className="flex items-center gap-1 text-[10px] text-text-secondary px-2 py-1 shrink-0">
            <User size={9} /> {section.assignedUserName}
          </span>
        ) : (
          <span className="text-[10px] text-text-muted px-2 py-1 shrink-0">Unassigned</span>
        )}

        {canSubmit && (
          <button
            onClick={() => onSubmit(sid)}
            disabled={busy}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border border-border bg-surface-overlay text-text-secondary hover:border-border-strong transition-colors disabled:opacity-50"
          >
            <CheckCheck size={10} /> Submit
          </button>
        )}
        {canReopen && (
          <button
            onClick={() => onReopen(sid)}
            disabled={busy}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border border-border bg-surface-overlay text-text-secondary hover:border-border-strong transition-colors disabled:opacity-50"
          >
            <RefreshCw size={10} /> Reopen
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-10 py-1 bg-surface-overlay/30 border-b border-border">
          {(section.questions || []).length === 0 ? (
            // Reachable only if the template instance really has an empty
            // section — the endpoint no longer strips them.
            <p className="text-[10px] text-text-muted py-2">
              This section has no questions in the instantiated template.
            </p>
          ) : (
            <ul>
              {section.questions.map((q, i) => (
                <QuestionRow
                  key={q.questionInstanceId}
                  question={q}
                  index={i}
                  showScores={showScores}
                  showReviewer={showReviewer}
                  onOpenDrawer={onOpenDrawer}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB
// ═══════════════════════════════════════════════════════════════════════════

export default function AssessmentSectionsTab({
  assessmentId,
  entity,                 // the assessment, already fetched by the page
  vc = {},
  userSide,               // 'VENDOR' | 'ORGANIZATION'
  userRole,
  stepInstanceId, taskId, onTaskComplete,
}) {
  const qc = useQueryClient()
  // Only for the drawer's action bar: an assignment-scoped ui_action is offered
  // to the question's assignee. This tab is the "everything" view, so the
  // question in the drawer may well belong to someone else, and that is exactly
  // the case the gate exists for.
  const { userId: viewerId } = useSelector(selectAuth)
  const [busyId, setBusyId]     = useState(null)
  // Which operation busyId refers to: 'assign' | 'submit' | 'reopen'. Cleared
  // alongside busyId in every onSettled, so the two can never disagree.
  const [busyOp, setBusyOp]     = useState(null)
  const [drawerQuestion, setDrawerQuestion] = useState(null)

  const standing = useStanding(vc, 'ASSIGN')

  // ── WHY THERE IS A FALLBACK FETCH HERE ──────────────────────────────────
  // The previous version of this file read entity.sections and nothing else,
  // and the sections vanished. That was my fault, not a data problem: the
  // `entity` prop only arrives once UniversalModulePage's CustomTabContent is
  // passing it down, and until that edit lands the prop is undefined, so
  // `entity?.sections || []` is an empty array and the tab renders its
  // empty state.
  //
  // So it now reads entity.sections when the page has them and fetches the
  // same data itself when it does not. GET /v1/assessments/{id} is the request
  // the page already makes — buildSectionInstances (AssessmentController:1337)
  // returns sections -> questions -> options plus currentResponse and its
  // comments — so the fallback returns exactly the same tree, one extra
  // round trip.
  //
  // `enabled` is the whole point: when the prop is present this query never
  // runs, so the good path stays at zero extra requests and the tab cannot
  // break again on a prop that is not wired yet.
  const hasEntitySections = Array.isArray(entity?.sections)
  const { data: fetched, isLoading: fetching } = useQuery({
    queryKey: ['assessment-detail-sections', assessmentId],
    queryFn:  () => assessmentsApi.vendor.get(assessmentId),
    enabled:  !!assessmentId && !hasEntitySections,
    staleTime: 30 * 1000,
  })

  const sections = useMemo(() => {
    if (hasEntitySections) return entity.sections
    // The axios interceptor unwraps ApiResponse.data, but a caller that gets
    // the envelope would silently render nothing, so both shapes are read.
    return fetched?.sections || fetched?.data?.sections || []
  }, [hasEntitySections, entity?.sections, fetched])

  const isOrgSide    = userSide === 'ORGANIZATION'
  const showScores   = isOrgSide
  const showReviewer = isOrgSide

  // The drawer's mode, not a constant.
  //
  // This tab never edits an answer or sets a verdict, and it does not need to:
  // the mode decides what the DRAWER offers, and the drawer is where the
  // per-question work lives. An org reviewer opening a question here gets
  // Validate and Accept risk on its remediations; a vendor responder gets the
  // accept / request-revision / override block on a contributor's answer;
  // anyone without standing on this step gets every tab, read-only.
  //
  // It was hardcoded 'readonly', which silently took those actions away from
  // the people who hold them.
  const drawerMode = resolveDrawerMode(userSide, vc, drawerQuestion)

  const { data: responders = [], isLoading: respondersLoading } =
    useEligibleUsers(stepInstanceId, 'VENDOR', standing.can(P.ASSIGN_RESPONDER))

  // The section tree lives on the assessment, so the assessment query is what
  // has to be invalidated — not a query of this tab's own. UniversalModulePage
  // line 173 keys it ['module-detail', basePath, id]; the prefix alone matches
  // it, which is why no basePath is threaded down here.
  // Was `expanded` — a set of OPEN ids starting empty, so every section
  // arrived collapsed and the first thing anyone did was expand all of them.
  // useSectionCollapse tracks CLOSED ids instead, so "nothing recorded" means
  // "everything open" and a section that appears later (a reopen) is open too,
  // with no effect watching the list.
  //
  // Declared AFTER `sections`, not with the other useState calls at the top:
  // it takes the list as an argument, and const is not hoisted.
  const collapse  = useSectionCollapse(sections)
  // Bulk assignment of whole sections to one responder, the mirror of the
  // question-level bulk assign on the Questionnaire tab. The endpoint has
  // existed all along: PUT /assessments/{id}/sections/assign-batch.
  const selection = useQuestionSelection()

  // The shared list, plus the two this tab needs on top of it.
  //
  // It used to name three keys of its own, and 'assessment-detail-sections' is
  // only this tab's FALLBACK query — when the module page supplies
  // entity.sections the tab renders from module-detail instead, and a submit
  // left every other surface in the module stale. invalidateAssessment is the
  // one place that list lives now; see the note on it in vendorShared.
  //
  // view-context stays here and is not in the shared helper: submitting a
  // section can satisfy a task section and change what the step lets you do,
  // which is this tab's concern and nobody else's.
  const invalidate = () => {
    invalidateAssessment(qc, assessmentId)
    qc.invalidateQueries({ queryKey: ['assessment-detail-sections', assessmentId] })
    qc.invalidateQueries({ queryKey: ['view-context'] })
  }

  const assign = useMutation({
    mutationFn: ({ sectionInstanceId, userId }) =>
      assessmentsApi.vendor.assignSection(assessmentId, sectionInstanceId, userId),
    onSuccess: () => { toast.success('Section assigned'); invalidate() },
    onError:   (e) => toast.error(e?.message || 'Could not assign the section'),
    onSettled: () => { setBusyId(null); setBusyOp(null) },
  })

  // Whole-section bulk assign. Gated on the same permission as the per-row
  // picker, so it can never offer a shortcut past a control the row respects.
  const canBulkAssign = standing.hasStanding && standing.can(P.ASSIGN_RESPONDER)

  const assignBatch = useMutation({
    mutationFn: ({ userId, sectionInstanceIds }) =>
      assessmentsApi.vendor.assignSectionsBatch(assessmentId, sectionInstanceIds, userId),
    onSuccess: (_d, v) => {
      toast.success(`${v.sectionInstanceIds.length} section(s) assigned`)
      selection.clear()
      invalidate()
    },
    onError: (e) => toast.error(e?.message || 'Could not assign the sections'),
  })

  const submit = useMutation({
    mutationFn: (sectionInstanceId) =>
      assessmentsApi.vendor.submitSection(assessmentId, sectionInstanceId, taskId),
    onSuccess: () => {
      toast.success('Section submitted')
      invalidate()
      onTaskComplete?.()
    },
    onError:   (e) => toast.error(e?.message || 'Could not submit the section'),
    onSettled: () => { setBusyId(null); setBusyOp(null) },
  })

  const reopen = useMutation({
    mutationFn: (sectionInstanceId) =>
      assessmentsApi.vendor.reopenSection(assessmentId, sectionInstanceId),
    onSuccess: () => { toast.success('Section reopened'); invalidate() },
    onError:   (e) => toast.error(e?.message || 'Could not reopen the section'),
    onSettled: () => { setBusyId(null); setBusyOp(null) },
  })


  if (fetching && !sections.length) {
    return (
      <div className="px-4 py-8 text-center text-[11px] text-text-muted">
        Loading sections…
      </div>
    )
  }

  if (!sections.length) {
    return (
      <div className="px-4 py-8 text-center">
        <Layers size={16} className="mx-auto text-text-muted" />
        <p className="mt-2 text-[11px] text-text-muted">
          No sections yet. They appear once the assessment has been instantiated
          from its template.
        </p>
      </div>
    )
  }

  const total     = sections.length
  const submitted = sections.filter(s => s.submittedAt).length
  const allQs     = sections.flatMap(s => s.questions || [])
  const answered  = allQs.filter(q => !!q.currentResponse).length

  // ── WHAT COMPLETES THIS STEP ────────────────────────────────────────────
  //
  // A sectioned step has no Complete button, by design: UniversalModulePage
  // hides COMPLETE_STEP and APPROVE when viewContext.hasSections is true,
  // because the step closes through its section events rather than a control.
  // That is correct and completely invisible — somebody holding the task sees
  // no way to finish it and reasonably concludes the button is missing.
  //
  // So the screen says it. Only when there is a live step with sections, only
  // for the sections that are actually this person's, and it disappears the
  // moment the count is met rather than congratulating anyone.
  //
  // stepAction === 'FILL', not hasSections alone. The ASSIGN step (vendor CISO
  // assigns responders) ALSO carries sections — ASSIGN_SECTIONS and
  // CONFIRM_ASSIGNMENT — and on it nothing is assigned yet, so the same line
  // would read "0 of 4 of your sections submitted" to somebody whose step
  // completes with the Confirm button sitting right above it. That step has a
  // control and does not need explaining; this one has none and does.
  //
  // SECTION_SUBMIT too: the sentence says what YOU must do to finish, so it
  // belongs only to the person who holds the gesture it describes.
  //
  // The membership test is the SERVER's, not SectionRow's `mine`. The gate is
  // fired by AssessmentController.fireSectionGateIfAllSubmitted, which loads
  //
  //   findByTemplateInstanceIdAndAssignedUserIdOrderBySectionOrderNo(ti, me)
  //   allSubmitted = !mySections.isEmpty() && every submittedAt != null
  //
  // — strictly assigned_user_id = me. An UNASSIGNED section is not in that set
  // and does not hold the step open. SectionRow's `mine` deliberately includes
  // unassigned ones, because a responder may submit a section nobody was given;
  // that is the right rule for the button and the wrong one for this count.
  // Counting them here would leave the line reading "3 of 5 done" on a step
  // that already advanced on 2 of 2 — a sentence about completion that
  // contradicts the completion.
  //
  // mySections.length > 0 carries the server's !isEmpty() too: with nothing
  // assigned to them, this person's submissions cannot fire the gate at all,
  // and promising that they will would be the same lie in the other direction.
  const mySections = sections.filter(sec =>
    sec.assignedUserId != null
    && String(sec.assignedUserId) === String(viewerId ?? '\u0000'))
  const mineSubmitted = mySections.filter(s => s.submittedAt).length
  const showCompletionHint = vc?.hasSections === true
    && String(vc?.stepAction || '').toUpperCase() === 'FILL'
    && standing.hasStanding
    && standing.has(P.SECTION_SUBMIT)
    && mySections.length > 0
    && mineSubmitted < mySections.length

  return (
    <div>
      {showCompletionHint && (
        <p className="px-4 py-2 text-[10px] text-brand-ink border-b border-border bg-brand-500/5">
          This step completes when all your sections are submitted — {mineSubmitted} of{' '}
          {mySections.length} done. There is no separate button to finish it.
        </p>
      )}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-overlay/40">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-text-muted">
            {submitted} of {total} section{total === 1 ? '' : 's'} submitted
          </span>
          {allQs.length > 0 && (
            <span className="text-[10px] text-text-muted">
              {answered}/{allQs.length} questions answered
            </span>
          )}
          <ListToolbar
            allOpen={collapse.allOpen}
            onToggleAll={collapse.toggleAll}
            selectedCount={selection.count}
            totalQuestions={canBulkAssign ? sections.length : 0}
            onSelectAllQuestions={canBulkAssign
              ? () => selection.toggleMany(sections.map(s => s.sectionInstanceId))
              : undefined}
            selectAllLabel={`Select all ${sections.length} sections`}
          />
        </div>
        {!standing.hasStanding && (
          <span className="text-[9px] text-text-muted">
            View only — you do not hold an active task on this assessment.
          </span>
        )}
      </div>

      <div>
        {sections.map(s => (
          <SectionRow
            key={s.sectionInstanceId}
            section={s}
            standing={standing}
            viewerId={viewerId}
            responders={responders}
            respondersLoading={respondersLoading}
            showScores={showScores}
            showReviewer={showReviewer}
            onOpenDrawer={setDrawerQuestion}
            busyId={busyId}
            busyOp={busyOp}
            expanded={collapse.isOpen(s.sectionInstanceId)}
            onToggle={() => collapse.toggle(s.sectionInstanceId)}
            selectable={canBulkAssign}
            selected={selection.isSelected(s.sectionInstanceId)}
            onToggleSelect={() => selection.toggle(s.sectionInstanceId)}
            onAssign={(sectionInstanceId, userId) => {
              setBusyId(sectionInstanceId); setBusyOp('assign')
              assign.mutate({ sectionInstanceId, userId })
            }}
            onSubmit={(sid) => { setBusyId(sid); setBusyOp('submit'); submit.mutate(sid) }}
            onReopen={(sid) => { setBusyId(sid); setBusyOp('reopen'); reopen.mutate(sid) }}
          />
        ))}
      </div>

      <BulkAssignBar
        count={selection.count}
        users={responders}
        loading={respondersLoading}
        saving={assignBatch.isPending}
        itemNoun="section"
        label="Assign to responder…"
        onClear={selection.clear}
        onAssign={(userId) =>
          assignBatch.mutate({ userId, sectionInstanceIds: selection.asArray() })}
        emptyHint="No responder is eligible on this step yet."
      />

      <QuestionDrawer
        question={drawerQuestion}
        assessmentId={assessmentId}
        userSide={userSide}
        userRole={userRole}
        mode={drawerMode}
        // This tab assigns, submits and tracks; it never edits an answer or
        // sets a verdict — see the header. The drawer opened from here follows
        // the same rule, which it did not before: a responder could edit an
        // answer from this drawer with no lock check of any kind.
        canAnswer={false}
        onClose={() => setDrawerQuestion(null)}
        // Per-question buttons from ui_actions, screen_key
        // 'vendor_assessment_question'. Same rows, same executor and the same
        // server-side side/permission filtering as the Review tab's drawer —
        // one place to configure a question action, three places it appears.
        actionsSlot={drawerQuestion ? (
          <QuestionActionBar
            question={drawerQuestion}
            assessmentId={assessmentId}
            taskId={taskId}
            stepInstanceId={stepInstanceId}
            // This tab shows both sides' questions, so check both assignment
            // fields and let whichever one names the viewer satisfy the gate.
            // Safe here and not on the two working tabs, because this tab
            // records nothing itself — the action's own required_permission and
            // allowed_sides still decide what it may do.
            assignedToViewer={
              String(drawerQuestion?.assignedUserId ?? '') === String(viewerId ?? '\u0000')
              || String(drawerQuestion?.reviewerAssignedUserId ?? '') === String(viewerId ?? '\u0000')}
            hasSections={vc?.hasSections === true}
            stepAction={vc?.stepAction}
            onDone={() => qc.invalidateQueries({ queryKey: ['module-detail'] })}
          />
        ) : null}
      />
    </div>
  )
}