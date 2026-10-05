/**
 * AssessmentFillTab.jsx
 *
 * Answering the questionnaire. Step 6 of TPRM Tier-1 — "Responders Fill
 * Questionnaires", VENDOR side, ASSIGNMENT_SCOPED.
 *
 * ── MULTI-CHOICE USES REPLACE SEMANTICS. DO NOT CHANGE THIS. ──────────────
 * Every toggle sends the COMPLETE set of selected option ids, and the backend
 * replaces the stored set wholesale. It does not send a delta and the server
 * does not toggle.
 *
 * That is not a style preference. Per-id toggling is a read-modify-write, and
 * rapid clicks produce concurrent requests that each read stale state and
 * overwrite the other — the "always 2 selected" bug. The comment in
 * AssessmentScoringService.scoreMultiChoice says the same thing from the other
 * end.
 *
 * ── EVERY RESPONSE TYPE HAS ITS OWN WIDGET ────────────────────────────────
 * SINGLE_CHOICE, MULTI_CHOICE, TEXT, NUMERIC, DATE and FILE_UPLOAD.
 *
 * Before this, anything that was not one of the two choice types fell through
 * to a textarea. That was inherited from the hardcoded page, where the same
 * gap is worse: VendorAssessmentFillPage declares NUMERIC and DATE in its
 * TYPE_CONFIG (lines 80-91, with badge labels and hints) and then has no input
 * branch for either, so they fall through to the MULTI_CHOICE return and
 * render "No options available" — a question the vendor cannot answer at all.
 *
 * NUMERIC and DATE both store into responseText, so they go through the same
 * debounced pushText as free text. The widget is the only difference, and it
 * is the difference between a date picker and a box someone types 3rd of March
 * into.
 *
 * FILE_UPLOAD has no text answer by design — the answer IS the attachment. It
 * now opens the evidence panel instead of offering a textarea nobody should
 * type in.
 *
 * ── CONTRIBUTOR ASSIGNMENT LIVES ON THIS TAB ──────────────────────────────
 * Step 6 has assignable_side = VENDOR (seed 53), so eligible-users answers in
 * mode 1 and the picker offers vendor-side users. Before that seed it answered
 * in mode 2 — the next step's actor roles — and step 7 is ASSIGNMENT_SCOPED, so
 * it returned an empty list. An empty picker, not a wrong one; the seed is what
 * makes this control work at all.
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import {
  Layers, AlertTriangle, CheckCheck,
} from 'lucide-react'
import { assessmentsApi } from '../../api/assessments.api'
import toast from 'react-hot-toast'
// The icon set, cn, and the per-question badges that used to be imported here
// moved with QuestionCard into ./QuestionItemCard.jsx. What is left is what
// this tab draws itself: the section list and its toolbars.
import {
  useEligibleUsers, useStanding, P, unwrapList,
  resolveDrawerMode, QuestionActionBar,
  useSectionCollapse, useQuestionSelection,
  SectionHeader, ListToolbar, BulkAssignBar,
  invalidateAssessment, useOwedAssignmentIds,
  AssignmentFilter, matchesAssignment, assigneesInSections, ASSIGN_ALL,
} from './vendorShared'
import { QuestionItemCard } from './QuestionItemCard'
import { QuestionDrawer } from '../item-panel'
import { ActionItemsBulkProvider } from '../../hooks/useActionItems'

const CHOICE  = new Set(['SINGLE_CHOICE', 'MULTI_CHOICE'])

// ═══════════════════════════════════════════════════════════════════════════
// ONE QUESTION — see ./QuestionItemCard.jsx
//
// QuestionCard and QuestionItemsButton used to live here, and QuestionDrawer
// carried its own second copy of the same thing (DrawerAnswerInput plus
// AnswerPreview). Both are now QuestionItemCard, which this tab renders as a
// row and the drawer renders as a panel. AssessmentChatTab and
// AssessmentEvidenceTab are no longer imported: Discuss and Evidence open the
// drawer on those tabs instead of expanding panels inside the row.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// TAB
// ═══════════════════════════════════════════════════════════════════════════


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
// `open` is the tab's openDrawer(question, tab) — the hook finds the question,
// the caller decides what holding it open means. It used to be handed the raw
// state setter, which is why the drawer ended up holding a stale snapshot.
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

export default function AssessmentFillTab({
  assessmentId, entity, vc = {}, userSide, userRole,
  stepInstanceId, taskId, onTaskComplete,
}) {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  // Who is looking. QuestionCard needs it to decide whether an obligation on a
  // question is THIS person's — hasLiveObligation(myItems, viewerId) — which is
  // what unlocks one question on an otherwise locked section.
  //
  // It was declared inside useDrawerFromUrl, which does not use it, so every
  // render of the question list threw "viewerId is not defined". Declared here,
  // in the component that passes it down.
  const { userId: viewerId } = useSelector(selectAuth)
  const [saving, setSaving] = useState(null)
  // ── THE DRAWER HOLDS AN ID, NOT A QUESTION ──────────────────────────────
  //
  // It used to hold the question object itself, captured when the row was
  // clicked. That object is a snapshot: when Accept, Override or a saved answer
  // invalidated the section query, the list behind the drawer refetched and
  // re-rendered with the new data while the drawer went on showing the copy
  // taken at click time. The verdict badge, the answer and the "Accepted"
  // state all stayed as they were until the page was reloaded — which is
  // exactly the "it only shows on refresh" you saw, and it was true of every
  // action, not just Accept.
  //
  // Holding the id and looking the question up on every render means the drawer
  // reads the same data the list does, from the same cache entry, always.
  const [drawerQuestionId, setDrawerQuestionId] = useState(null)
  // Which tab the drawer should land on. Discuss and Evidence on a row are now
  // this drawer opening on that tab rather than panels inside the row, so the
  // row has to be able to say where it is going. Null means the drawer's own
  // default (Actions, or Evidence for a FILE_UPLOAD question).
  const [drawerTab, setDrawerTab] = useState(null)
  // ── THE OPEN QUESTION LIVES IN THE URL ──────────────────────────────────
  //
  // A reload used to land back at the top of the list with the drawer shut,
  // which on a forty-question assessment means finding your place again by
  // hand. useDrawerFromUrl already reopens and scrolls to ?questionInstanceId
  // — it was only ever written there by an action item's deep link, never by
  // opening a question here. Now both do it, so a refresh comes back to the
  // same place and a question is a link somebody can send.
  //
  // replace, not push: opening and closing a drawer a few times would
  // otherwise bury the page you arrived from under a pile of history entries.
  const syncQuestionParam = (questionInstanceId) => {
    const next = new URLSearchParams(params)
    if (questionInstanceId == null) next.delete('questionInstanceId')
    else next.set('questionInstanceId', String(questionInstanceId))
    setParams(next, { replace: true })
  }

  const openDrawer = (q, tab = null) => {
    const id = q?.questionInstanceId ?? null
    setDrawerQuestionId(id)
    setDrawerTab(tab)
    syncQuestionParam(id)
  }

  const closeDrawer = () => {
    setDrawerQuestionId(null)
    setDrawerTab(null)
    syncQuestionParam(null)
  }
  const { data: raw, isLoading, isError, error } = useQuery({
    queryKey: ['assessment-my-sections', assessmentId],
    queryFn:  () => assessmentsApi.vendor.mySections(assessmentId),
    enabled:  !!assessmentId,
    staleTime: 10 * 1000,
  })
  const mySections = useMemo(() => unwrapList(raw), [raw])

  // ── CONTRIBUTOR MODE ────────────────────────────────────────────────────
  // /my-sections answers "sections assigned to me". A contributor owns no
  // section — they own individual questions — so it comes back empty and this
  // tab rendered "Nothing is assigned to you" at them, on the one screen they
  // are supposed to work in.
  //
  // The hardcoded page resolves this the same way (VendorAssessmentFillPage:1010):
  // an empty my-sections plus a reason to be here means read /my-questions
  // instead. The reason is a task, or a deep link carrying one.
  //
  // ── THE GATE WAS `&& !!taskId`, AND THAT WAS THE BUG ─────────────────────
  //
  // A contributor has NO workflow task. That is the entire point of the
  // contributor pattern: the responder holds the task, the contributor holds
  // individual questions through an action item. So requiring a taskId to
  // enter contributor mode meant the one person this mode exists for could
  // never reach it — they arrived from their action item, my-sections came back
  // empty, my-questions was never requested, and the Questionnaire tab rendered
  // nothing at them.
  //
  // It worked on the hardcoded page because that page IS the contributor's
  // screen; there was nothing else it could render. The module page serves
  // everyone, so it needs a real signal instead of a proxy for one.
  //
  // The signal is now: my-sections is empty AND there is any reason to believe
  // this person has work here —
  //   taskId             a responder opening it from their task
  //   actionItemId       a contributor opening it from their action item
  //   questionInstanceId a deep link to one question
  //   openWork           a reopened question's bypass
  //   VENDOR side        a vendor user who simply navigated here, which is the
  //                      path that had no deep link at all and was equally
  //                      broken
  //
  // The cost of being wrong in the permissive direction is one request that
  // returns an empty list. The cost of being wrong the other way is what you
  // just saw.
  const hasReasonToLoadQuestions =
    !!taskId
    || !!params.get('actionItemId')
    || !!params.get('questionInstanceId')
    || !!params.get('openWork')
    || String(userSide || '').toUpperCase() === 'VENDOR'

  const isContributorMode = !isLoading
    && Array.isArray(mySections) && mySections.length === 0
    && hasReasonToLoadQuestions

  const { data: myQuestionsRaw, isLoading: myQuestionsLoading } = useQuery({
    queryKey: ['assessment-my-questions', assessmentId],
    queryFn:  () => assessmentsApi.vendor.myQuestions(assessmentId),
    enabled:  !!assessmentId && isContributorMode,
    staleTime: 10 * 1000,
  })

  // /my-questions returns a flat list. Grouping by section here rather than
  // asking the server for a second shape — the questions already carry
  // sectionInstanceId and sectionName.
  const contributorSections = useMemo(() => {
    const qs = unwrapList(myQuestionsRaw)
    if (!qs.length) return []
    const bySection = new Map()
    for (const q of qs) {
      const sid = q.sectionInstanceId ?? 0
      if (!bySection.has(sid)) {
        bySection.set(sid, {
          sectionInstanceId: sid,
          sectionName: q.sectionName || 'Assigned questions',
          submittedAt: q.sectionSubmittedAt || null,
          questions: [],
        })
      }
      bySection.get(sid).questions.push(q)
    }
    return [...bySection.values()]
  }, [myQuestionsRaw])

  const sections = isContributorMode ? contributorSections : mySections

  // ── STANDING CAN COME FROM AN OBLIGATION, NOT ONLY A TASK ───────────────
  // Owning questions in this assessment IS the open action item — assigning a
  // question to a contributor creates exactly one, and that is what the
  // server's own "open obligation bypass" checks before letting them answer.
  // Derived from data already on the page rather than a fourth request.
  //
  // Declared here, below `sections`, because it needs them. useStanding is a
  // plain function with no hooks of its own, so its position is free.
  // ── WHAT THE CONTRIBUTOR HAS ALREADY SUBMITTED ─────────────────────────
  // contributor-submit writes a row to contributor_section_submissions and the
  // server happily accepted a second one — it is idempotent, so nothing broke,
  // but the button kept offering to do it again and the answers stayed
  // editable. The page simply never asked whether it was done:
  // /my-questions says nothing about submission state, and this endpoint is
  // where that state lives.
  //
  // Not gated on taskId. On a revision the contributor's task is already
  // approved so taskId is null — gating on it is what made the hardcoded page
  // revert to "Submit answers" on every refresh mid-revision, and the endpoint
  // keys off the logged-in user anyway.
  const { data: contribSubmitted = new Set() } = useQuery({
    queryKey: ['contributor-section-status', assessmentId],
    queryFn:  () => assessmentsApi.vendor.contributorSectionStatus(assessmentId, taskId),
    enabled:  !!assessmentId && isContributorMode,
    select:   (d) => {
      const rows = Array.isArray(d) ? d : (d?.data || [])
      return new Set(rows.map(r => r.sectionInstanceId))
    },
  })

  const hasObligation = isContributorMode && contributorSections.length > 0
  const standing = useStanding(vc, 'FILL', { obligation: hasObligation })

  // Which questions this viewer still owes an ASSIGNMENT on — from their own
  // action-item list, which the app already keeps fresh over the user's WS
  // topic, so a newly assigned question appears here without a reload.
  //
  // Needed at section level, where no hook per question can be called, so the
  // Lock control can reappear for a contributor who locked a section and was
  // then given another question in it.
  const owedAssignmentIds = useOwedAssignmentIds(viewerId)


  // One request for every badge on the page, instead of one per question.
  const allQuestionIds = useMemo(
    () => sections.flatMap(s => (s.questions || []).map(q => q.questionInstanceId)).filter(Boolean),
    [sections])

  // The live question behind the open drawer. Re-derived from the list on every
  // render — see the note on drawerQuestionId. Null when the drawer is closed,
  // and also when the question has left the list (filtered away, or the section
  // reloaded without it), which closes the drawer rather than leaving it
  // showing something that is no longer there.
  const drawerQuestion = useMemo(() => {
    if (drawerQuestionId == null) return null
    for (const s of sections || []) {
      const hit = (s.questions || []).find(q => q.questionInstanceId === drawerQuestionId)
      if (hit) return hit
    }
    return null
  }, [drawerQuestionId, sections])

  const drawerMode = resolveDrawerMode(userSide, vc, drawerQuestion, isContributorMode, hasObligation)

  // ── IS THE DRAWER'S QUESTION STILL OPEN FOR EDITS ───────────────────────
  //
  // The same two locks the rows apply, found for whichever question the drawer
  // is showing. Derived rather than captured when the drawer opens, because the
  // drawer is also opened from the URL by useDrawerFromUrl — an action item
  // deep-linking straight to one question never passes through a row, so a
  // value stashed on click would be missing exactly when a revision is being
  // answered.
  //
  // standing.hasStanding is NOT folded in here. It is the "may this person act
  // at all" half, and QuestionItemCard already resolves that against the
  // viewer's own obligation; folding it in would lock out the contributor
  // case, where the obligation is the only authority they hold.
  const drawerSectionOpen = useMemo(() => {
    if (!drawerQuestion) return false
    const qid = drawerQuestion.questionInstanceId
    const section = (sections || []).find(s =>
      (s.questions || []).some(q => q.questionInstanceId === qid))
    if (!section) return false
    return !section.submittedAt && !contribSubmitted.has(section.sectionInstanceId)
  }, [drawerQuestion, sections, contribSubmitted])

  const { data: contributors = [], isLoading: contributorsLoading } =
    useEligibleUsers(stepInstanceId, 'VENDOR', standing.can(P.ASSIGN_CONTRIBUTOR))

  // Sections open by default; the closed set is what is tracked. See
  // useSectionCollapse for why that direction and not the other.
  // The hook hands back the question it found; the drawer only needs its id.
  const focusedQuestionId = useDrawerFromUrl(sections, openDrawer)
  const collapse  = useSectionCollapse(sections)
  const selection = useQuestionSelection()

  // Selection only exists for somebody who can act on it. Without the
  // permission there are no checkboxes at all rather than checkboxes leading to
  // a bar with a picker nobody may use.
  const canBulkAssign = standing.hasStanding && standing.can(P.ASSIGN_CONTRIBUTOR)
  // ── WHO IS ANSWERING WHAT ───────────────────────────────────────────────
  //
  // A responder who has delegated across three contributors had no way to see
  // which questions went to whom, or which ones are still theirs to answer,
  // short of reading every row.
  //
  // One control rather than two, because the three questions people actually
  // ask — "what did I delegate", "what is still mine", "what did I give to
  // her" — are one dimension, not two. The per-contributor options are built
  // from the loaded sections, so the list is exactly the people who hold
  // something here and no request is added to produce it.
  const [assignFilter, setAssignFilter] = useState(ASSIGN_ALL)

  // assignedUserId is the vendor side's assignment — who ANSWERS the question.
  // The organisation side passes reviewerAssignedUserId to the same helpers, so
  // the two tabs filter through one predicate rather than two that drift.
  const contributorsInUse = useMemo(() => assigneesInSections(sections), [sections])

  // Sections with nothing matching drop out entirely rather than printing a
  // heading over empty space — the same rule the review tab's verdict filter
  // follows.
  const visibleSections = useMemo(() => {
    if (assignFilter === ASSIGN_ALL) return sections
    return (sections || [])
      .map(s => ({ ...s, questions: (s.questions || []).filter(q => matchesAssignment(q, assignFilter)) }))
      .filter(s => s.questions.length > 0)
  }, [sections, assignFilter])

  const visibleCount = useMemo(
    () => visibleSections.reduce((n, s) => n + (s.questions || []).length, 0),
    [visibleSections])

  // Select-all means what is on screen. Computed from the filtered list, or the
  // bar and the list disagree about what "all" is.
  const assignableIds = useMemo(
    () => (canBulkAssign ? visibleSections : [])
      .filter(sec => !sec.submittedAt)
      .flatMap(sec => (sec.questions || []).map(q => q.questionInstanceId))
      .filter(Boolean),
    [visibleSections, canBulkAssign])

  const save = useMutation({
    mutationFn: (payload) => assessmentsApi.vendor.respond(assessmentId, payload),
    // The shared list, not this one key. Saving an answer can resolve the
    // contributor's assignment item and move the section's progress, and this
    // refreshed neither — so a contributor answered, the obligation chip went
    // on saying "Assigned to you", and the only way to see it register was a
    // reload.
    onSuccess: (_d, payload) =>
      invalidateAssessment(qc, assessmentId, payload?.questionInstanceId),
    onError:   (e) => toast.error(e?.message || 'Could not save the answer'),
    onSettled: () => setSaving(null),
  })

  const assign = useMutation({
    mutationFn: ({ questionInstanceId, userId }) =>
      assessmentsApi.vendor.assignQuestion(assessmentId, questionInstanceId, userId),
    onSuccess: () => {
      toast.success('Question assigned')
      qc.invalidateQueries({ queryKey: ['assessment-my-sections', assessmentId] })
    },
    onError: (e) => toast.error(e?.message || 'Could not assign the question'),
  })

  // One round trip for the whole selection, not one per question. The endpoint
  // already existed (PUT .../questions/assign-batch) and validates every id
  // belongs to this assessment before writing anything, so a bad id fails the
  // batch rather than leaving half of it assigned.
  // ── THE CONTRIBUTOR'S SUBMIT ────────────────────────────────────────────
  // Answers save as you go — every radio and every blur fires `save`. What was
  // missing was the gesture that says "I am done with this section", which is
  // what closes the contributor's action items and lets their work roll up to
  // the responder. The endpoint has existed all along:
  //   POST /assessments/{id}/sections/{sid}/contributor-submit
  // It is idempotent and, once every section holding this contributor's
  // questions is submitted, auto-resolves their obligation.
  const contributorSubmit = useMutation({
    mutationFn: (sectionInstanceId) =>
      assessmentsApi.vendor.contributorSubmitSection(assessmentId, sectionInstanceId, taskId),
    onSuccess: () => {
      toast.success('Answers locked')
      invalidateAssessment(qc, assessmentId)
      // Two this tab needs on top of the shared list: its own contributor-lock
      // query, and the inbox badge, which counts the obligations this closes.
      qc.invalidateQueries({ queryKey: ['contributor-section-status', assessmentId] })
      qc.invalidateQueries({ queryKey: ['inbox-action-items'] })
      onTaskComplete?.()
    },
    onError: (e) => toast.error(e?.message || 'Could not lock your answers'),
  })

  /**
   * The responder's submit — the same endpoint the Sections tab calls.
   *
   * Deliberately the same call and not a variant: one act, one endpoint, two
   * places it can be reached from. The Sections tab remains the place to submit
   * a section you are tracking rather than answering; this is the place to
   * submit the one you have just finished.
   */
  const responderSubmit = useMutation({
    mutationFn: (sectionInstanceId) =>
      assessmentsApi.vendor.submitSection(assessmentId, sectionInstanceId, taskId),
    onSuccess: () => {
      toast.success('Section submitted')
      invalidateAssessment(qc, assessmentId)
      qc.invalidateQueries({ queryKey: ['assessment-detail-sections', assessmentId] })
      // Submitting can satisfy a task section and change what the step allows,
      // which is what decides whether the step's own controls appear.
      qc.invalidateQueries({ queryKey: ['view-context'] })
      onTaskComplete?.()
    },
    onError: (e) => toast.error(e?.message || 'Could not submit the section'),
  })

  const assignBatch = useMutation({
    mutationFn: ({ userId, questionInstanceIds }) =>
      assessmentsApi.vendor.assignQuestionsBatch(assessmentId, questionInstanceIds, userId),
    onSuccess: (_d, v) => {
      toast.success(`${v.questionInstanceIds.length} question${v.questionInstanceIds.length === 1 ? '' : 's'} assigned`)
      selection.clear()
      qc.invalidateQueries({ queryKey: ['assessment-my-sections', assessmentId] })
      qc.invalidateQueries({ queryKey: ['assessment-my-questions', assessmentId] })
    },
    onError: (e) => toast.error(e?.message || 'Could not assign the selected questions'),
  })

  if (isLoading || (isContributorMode && myQuestionsLoading)) {
    return <div className="px-4 py-8 text-center text-[11px] text-text-muted">Loading questions…</div>
  }
  if (isError) {
    return (
      <div className="px-4 py-8 text-center">
        <AlertTriangle size={16} className="mx-auto text-status-fail-fg" />
        <p className="mt-2 text-[11px] text-status-fail-fg">
          {error?.message || 'Could not load your questions.'}
        </p>
      </div>
    )
  }
  if (!sections.length) {
    return (
      <div className="px-4 py-8 text-center">
        <Layers size={16} className="mx-auto text-text-muted" />
        <p className="mt-2 text-[11px] text-text-muted">
          Nothing is assigned to you on this assessment yet.
        </p>
        <p className="mt-1 text-[10px] text-text-muted opacity-70">
          {/* Both reads came back empty. Saying which was checked is the
              difference between "wait for an assignment" and "this is broken". */}
          Neither a section nor an individual question is assigned to you.
          Sections are assigned by the vendor CISO; questions by the responder.
        </p>
      </div>
    )
  }

  return (
    <ActionItemsBulkProvider
      entityType="QUESTION_RESPONSE"
      entityIds={allQuestionIds}
      enabled={allQuestionIds.length > 0}
    >
    <div>
      {isContributorMode && (
        <p className="px-4 py-2 text-[10px] text-brand-ink border-b border-border bg-brand-500/5">
          You have {allQuestionIds.length} question{allQuestionIds.length === 1 ? '' : 's'} assigned
          across {sections.length} section{sections.length === 1 ? '' : 's'}.
        </p>
      )}
      {/* Only when there is genuinely no standing. It used to fire for every
          contributor, because standing meant "holds a workflow task" and a
          contributor never holds one. */}
      {!standing.hasStanding && (
        <p className="px-4 py-2 text-[9px] text-text-muted border-b border-border bg-surface-overlay/40">
          View only — you do not hold an active task on this assessment.
        </p>
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
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-text-muted">
              {assignFilter === ASSIGN_ALL
                ? <>{allQuestionIds.length} question{allQuestionIds.length === 1 ? '' : 's'} across{' '}
                    {sections.length} section{sections.length === 1 ? '' : 's'}</>
                : <>{visibleCount} of {allQuestionIds.length} question
                    {allQuestionIds.length === 1 ? '' : 's'} shown</>}
            </span>
            {/* Hidden until something has actually been delegated — a filter
                whose only useful option is "all" teaches people it does
                nothing. */}
            {contributorsInUse.length > 0 && (
              <AssignmentFilter
                value={assignFilter}
                onChange={setAssignFilter}
                people={contributorsInUse}
                selfLabel="Not delegated — mine to answer"
                delegatedLabel="Delegated to a contributor"
              />
            )}
          </div>
        }
      />

      {visibleSections.map(section => {
        // A submitted section is locked. The exception is a question carrying an
        // open obligation — a revision request — which the server unlocks per
        // question. The tab cannot know that from here, so it shows the section
        // as locked and lets the server allow the specific save; a refusal is
        // surfaced as the toast rather than pre-empted with a guess.
        const sid = section.sectionInstanceId
        // Two different locks, and the second one was missing.
        //
        //   section.submittedAt   the RESPONDER submitted the section. Nobody
        //                         edits it until the vendor CISO reopens.
        //   mySubmitted           I, the contributor, submitted MY answers for
        //                         this section. It reopens when the responder
        //                         requests a revision — which arrives as an
        //                         action item on the specific question and
        //                         lifts the lock through the server's open
        //                         obligation bypass, not by unlocking the whole
        //                         section.
        //
        // Without the second, submitting did nothing visible: the button still
        // said "Submit my answers" and every radio stayed live.
        const mySubmitted = contribSubmitted.has(sid)
        const locked = !!section.submittedAt || mySubmitted
        // ── MY OWN LOCK YIELDS TO MY OWN NEW WORK ───────────────────────────
        //
        // The two locks are different records and the server only enforces one
        // of them. submitAnswer checks assessment_section_instances.submitted_at
        // — the RESPONDER's lock — and nothing anywhere checks the
        // contributor_section_submissions row, which is this person's own.
        //
        // So when the responder assigns a contributor a second question in a
        // section the contributor had already locked, the server accepts the
        // answer and only this page was refusing to let them type it. Worse,
        // the Lock control below had vanished, so the obligation it created had
        // no way to close and sat in their inbox permanently.
        //
        // owedAssignmentIds is a cache read off the ActionItemsBulkProvider
        // already wrapping this tab — no request, and it is the same question
        // the server's bypass asks.
        //
        // section.submittedAt is deliberately still absolute: the responder's
        // lock is the one the server honours, and an assignment is not a reason
        // to lift it. That needs a revision request, which is what
        // hasLiveObligation already covers inside QuestionItemCard.
        const owedInSection = !section.submittedAt
          && (section.questions || []).some(q => owedAssignmentIds.has(q.questionInstanceId))
        const editable = standing.hasStanding && !locked
        const open = collapse.isOpen(sid)
        const qs = section.questions || []
        // A locked section cannot be reassigned, so its questions are not
        // offered for selection — a bulk assign that silently skipped them
        // would be worse than not offering them.
        const sectionIds = (canBulkAssign && editable)
          ? qs.map(q => q.questionInstanceId).filter(Boolean)
          : []
        const sectionSelected = sectionIds.filter(id => selection.isSelected(id)).length

        return (
          <div key={sid}>
            <SectionHeader
              name={section.sectionName}
              open={open}
              onToggle={() => collapse.toggle(sid)}
              locked={locked}
              total={sectionIds.length ? sectionIds.length : qs.length}
              selectedCount={sectionSelected}
              onSelectAll={sectionIds.length
                ? () => selection.toggleMany(sectionIds)
                : undefined}
            />

            {/* ── THE RESPONDER'S SUBMIT, WHICH WAS ONLY ON THE OTHER TAB ──
                This block used to be contributor-only, on the reasoning that a
                responder submits from Sections and two buttons under one word
                would confuse. The reasoning was half right and the outcome was
                wrong: this tab already shows a responder the "Submitted" chip
                on a section, so it reports the OUTCOME of an act it gives them
                no way to perform. They answer here and then have to find
                another tab to say they are done.
                The two acts are genuinely different, so they are labelled
                differently rather than hidden: a contributor LOCKS their own
                answers, a responder SUBMITS the section to the organisation. */}
            {!isContributorMode && open && !section.submittedAt
              && standing.hasStanding && standing.has(P.SECTION_SUBMIT) && (
              <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-border bg-surface-overlay/30">
                <span className="text-[10px] text-text-muted">
                  {qs.filter(q => q.currentResponse).length} of {qs.length} answered
                </span>
                <button
                  onClick={() => responderSubmit.mutate(sid)}
                  disabled={responderSubmit.isPending}
                  title="Submits this section to the organisation. It stops further editing until the vendor CISO reopens it."
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border border-border bg-surface-raised text-text-secondary hover:border-border-strong transition-colors disabled:opacity-50"
                >
                  <CheckCheck size={10} />
                  {responderSubmit.isPending ? 'Submitting…' : 'Submit section'}
                </button>
              </div>
            )}

            {/* Lock, for a contributor. */}
            {isContributorMode && open && (
              <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-border bg-surface-overlay/30">
                {/* owedInSection, not mySubmitted alone. This is the condition
                    the whole fix turns on: a contributor who locked the section
                    and was then assigned another question in it must get the
                    control back, or the new obligation has nothing that closes
                    it and sits in their inbox for good. The endpoint now does
                    the right thing on a second call — it closes the obligations
                    and re-evaluates the gate instead of returning early — but
                    only if there is a button to reach it with. */}
                {mySubmitted && !owedInSection ? (
                  <span className="flex items-center gap-1 text-[10px] text-status-pass-fg">
                    <CheckCheck size={10} />
                    Locked — reopens if the responder requests a revision
                  </span>
                ) : section.submittedAt ? (
                  <span className="text-[10px] text-text-muted">
                    Section locked by the responder
                  </span>
                ) : (
                  <>
                    {/* "Lock", not "Submit". Each answer is already reported
                        the moment it is saved — the chip on every question says
                        so. What this does is stop further editing, which is a
                        different act and was being described as the first one.
                        That mislabel is what sent people looking for a
                        per-question submit: they were told their work was not
                        in yet. */}
                    <span className="text-[10px] text-text-muted">
                      {qs.filter(q => q.currentResponse).length} of {qs.length} answered
                      {mySubmitted
                        ? <>{' · '}you were assigned more work here after locking</>
                        : <>{' · '}each saved answer is already reported</>}
                    </span>
                    <button
                      onClick={() => contributorSubmit.mutate(sid)}
                      disabled={contributorSubmit.isPending}
                      title={mySubmitted
                        ? 'Locks the question you were newly assigned and clears it from your inbox. Your earlier answers in this section stay locked.'
                        : 'Stops further editing of your answers in this section. It reopens if the responder requests a revision.'}
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border border-border bg-surface-raised text-text-secondary hover:border-border-strong transition-colors disabled:opacity-50"
                    >
                      <CheckCheck size={10} />
                      {contributorSubmit.isPending ? 'Locking…' : 'Lock my answers'}
                    </button>
                  </>
                )}
              </div>
            )}

            {open && qs.map(q => (
              <QuestionItemCard
                key={q.questionInstanceId}
                variant="row"
                focused={focusedQuestionId === q.questionInstanceId}
                viewerId={viewerId}
                question={q}
                assessmentId={assessmentId}
                // Per question, not per section: only the question they were
                // newly assigned reopens, and only when the lock in the way is
                // their own rather than the responder's. Their earlier answers
                // in the same section stay locked, which is the point — a
                // responder adding one question must not silently reopen work
                // the contributor had already finished.
                editable={editable
                  || (mySubmitted && !section.submittedAt
                      && owedAssignmentIds.has(q.questionInstanceId))}
                standing={standing}
                contributors={contributors}
                contributorsLoading={contributorsLoading}
                saving={saving}
                selectable={sectionIds.length > 0}
                selected={selection.isSelected(q.questionInstanceId)}
                onToggleSelect={selection.toggle}
                onSave={(payload) => {
                  setSaving(payload.questionInstanceId)
                  save.mutate(payload)
                }}
                onAssign={(questionInstanceId, userId) =>
                  assign.mutate({ questionInstanceId, userId })}
                onOpenDrawer={openDrawer}
              />
            ))}
          </div>
        )
      })}

      <BulkAssignBar
        count={selection.count}
        users={contributors}
        loading={contributorsLoading}
        saving={assignBatch.isPending}
        label="Assign to…"
        emptyHint="No vendor-side contributor is eligible on this step yet."
        onAssign={(userId) => assignBatch.mutate({ userId, questionInstanceIds: selection.asArray() })}
        onClear={selection.clear}
      />

      <QuestionDrawer
        question={drawerQuestion}
        assessmentId={assessmentId}
        userSide={userSide}
        userRole={userRole}
        mode={drawerMode}
        initialTab={drawerTab}
        // The lock the rows apply, applied here too. Without it the drawer let
        // a contributor edit answers in a section they had already locked.
        canAnswer={drawerSectionOpen}
        onClose={closeDrawer}
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
            // Vendor side: "assigned to me" is the answering assignment.
            // Passed rather than derived inside the bar — see the note on the
            // prop — so a vendor assignment can never satisfy an
            // organisation-side action's gate on the review tab.
            assignedToViewer={
              String(drawerQuestion?.assignedUserId ?? '') === String(viewerId ?? '\u0000')}
            hasSections={vc?.hasSections === true}
            stepAction={vc?.stepAction}
            onDone={() => qc.invalidateQueries({ queryKey: ['module-detail'] })}
          />
        ) : null}
      />
    </div>
    </ActionItemsBulkProvider>
  )
}