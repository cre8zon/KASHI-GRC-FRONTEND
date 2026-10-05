/**
 * AssessmentFindingsTab.jsx
 *
 * Every remediation raised on this assessment, in one place, with the three
 * things a reviewer can do about one: validate it, accept the risk, or escalate
 * it into a tracked Issue.
 *
 * ── WHY THIS TAB DID NOT EXIST BEFORE ─────────────────────────────────────
 * Because the query it needs returned nothing. ReviewController's remediation
 * builder set entityType/entityId to the QUESTION INSTANCE and never set
 * parentEntityType/parentEntityId, so
 *
 *     GET /v1/action-items?entityType=ASSESSMENT&entityId={id}
 *
 * came back empty on every assessment, however many remediations it had. The
 * three lines added to that builder are what make this tab possible; without
 * them it renders its empty state and looks broken.
 *
 * Rows created before that change carry null parents, so the fallback below
 * asks by question instance as well and merges. That fallback is not permanent
 * — once historic rows are backfilled or aged out, delete it.
 *
 * ── THE THREE RESOLUTION PATHS, AND THE TWO WRONG ONES ────────────────────
 * The hardcoded app has six ways to resolve a remediation and three of them
 * call the wrong endpoint:
 *
 *   AssessmentDetailPage QuestionActionItems → PATCH /v1/action-items/{id}/status
 *   AssessmentDetailPage FindingsTab         → PATCH /v1/action-items/{id}/status
 *   QuestionDrawer Actions "Send back"       → toast(), no endpoint at all
 *
 * The generic PATCH sets the status and nothing else. It does not decrement
 * openRemediationCount and does not trigger the next report version, so an
 * assessment resolved that way keeps claiming open items forever. This tab uses
 * validate-remediation and accept-risk only.
 *
 * ── GATING IS PERMISSIONS, NOT ROLE NAMES ─────────────────────────────────
 * Nothing here asks whether the user is a CISO. Two independent gates, and both
 * have to pass:
 *
 *   standing.has(P.…)  — the permission, from vc.permissions
 *   item.canResolve    — a backend-computed flag answering a different
 *                        question: is THIS item this person's to close. The UI
 *                        has no mirror of it and should not invent one.
 *
 * Escalate is deliberately narrower than validate: creating an Issue starts a
 * workflow and puts a task in someone's inbox, which is a heavier act than
 * closing a remediation. The audit equivalent has no gate at all, which is not
 * a reason to copy it.
 */

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CheckCircle2, ShieldCheck, ArrowUpRight, ExternalLink,
  Clock, Paperclip, ChevronRight, ChevronDown, User,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { assessmentsApi } from '../../api/assessments.api'
import { actionItemsApi } from '../../api/actionItems.api'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'
import { useStanding, P, unwrapList } from './vendorShared'

// ═══════════════════════════════════════════════════════════════════════════
// PRESENTATION
// ═══════════════════════════════════════════════════════════════════════════

// One map, here. The hardcoded app has three copies of this with different
// wording in AssessmentReviewPage, AssessmentDetailPage and ItemActionItems —
// the same item reads "Vendor submitted" on one screen and "Pending review" on
// another. When these move to ui_options as an action_item_status component,
// delete this and read them from the screen config.
const STATUS = {
  OPEN:               { label: 'Open',                tone: 'warn' },
  IN_PROGRESS:        { label: 'In progress',         tone: 'info' },
  PENDING_REVIEW:     { label: 'Vendor submitted',    tone: 'info' },
  PENDING_VALIDATION: { label: 'Awaiting validation', tone: 'info' },
  SUBMITTED:          { label: 'Submitted',           tone: 'info' },
  RESOLVED:           { label: 'Resolved',            tone: 'pass' },
  DISMISSED:          { label: 'Dismissed',           tone: 'muted' },
}

const SEVERITY = {
  CRITICAL: 'text-status-fail-fg bg-status-fail-bg',
  HIGH:     'text-status-fail-fg bg-status-fail-bg',
  MEDIUM:   'text-status-warn-fg bg-status-warn-bg',
  LOW:      'text-text-muted bg-surface-overlay',
}

const TONE = {
  pass:  'text-status-pass-fg bg-status-pass-bg',
  warn:  'text-status-warn-fg bg-status-warn-bg',
  fail:  'text-status-fail-fg bg-status-fail-bg',
  info:  'text-brand-ink bg-brand-500/10',
  muted: 'text-text-muted bg-surface-overlay',
}

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'PENDING_VALIDATION', 'SUBMITTED']
const isOpen       = (s) => OPEN_STATUSES.includes(s)
/** The vendor has done something and is waiting on us — validate is only honest then. */
const vendorActed  = (s) => ['PENDING_REVIEW', 'PENDING_VALIDATION', 'SUBMITTED'].includes(s)

// Assignment bookkeeping is stored as action items too. They are not findings,
// and listing them here would bury the real ones under one row per assigned
// question. QuestionDrawer excludes the same two from its badge count.
const ASSIGNMENT_TYPES = ['CONTRIBUTOR_ASSIGNMENT', 'REVIEWER_ASSIGNMENT']

// Never shown to the vendor, whatever their permissions say.
//
// A CLARIFICATION is a note between the reviewer and their review assistant —
// AssessmentIssueEscalationService calls it exactly that, and refuses to
// escalate one for the same reason. It lives on the same action_items table as
// a finding and would arrive in the same query, so opening this tab to the
// vendor side without this filter would hand them the organisation's internal
// review chatter about their own answers.
//
// Filtered by side rather than by permission: there is no permission that means
// "may read the org's private notes", and inventing one to hang this on would
// be a control that exists only to be granted.
const ORG_INTERNAL_TYPES = ['CLARIFICATION']

function Chip({ tone = 'muted', children, className }) {
  return (
    <span className={cn(
      'text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0',
      TONE[tone], className)}>
      {children}
    </span>
  )
}

function fmtDate(v) {
  if (!v) return null
  try { return new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return String(v) }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROW
// ═══════════════════════════════════════════════════════════════════════════

function FindingRow({
  item, expanded, onToggle, standing, busyId,
  onValidate, onAcceptRisk, onEscalate, onOpenIssue,
}) {
  const busy     = busyId === item.id
  const status   = STATUS[item.status] || { label: item.status, tone: 'muted' }
  const open     = isOpen(item.status)
  const escalated = !!item.linkedIssueId

  // Three separate permissions, and canResolve on top of all of them.
  //
  // ── !escalated ON ALL THREE ──────────────────────────────────────────────
  //
  // It was only on canEscalate, which was right when escalation was a manual
  // step: a finding that had become an Issue could still be validated here.
  //
  // That closes the finding and leaves the Issue open — AssessmentRemediationService
  // .close() resolves the item and adjusts the assessment's counters and never
  // touches the Issue, so the workflow keeps running and the vendor keeps a task
  // for work that has just been accepted. Rare while escalation was manual;
  // the default path now that a raised finding escalates by itself.
  //
  // So all three go behind it. The server refuses the same call (close() rejects
  // a linkedIssueId and names the issue), and this mirrors that rather than
  // being stricter or looser than it. Validate and close live on the Issue.
  const canValidate = open && !escalated && item.canResolve && vendorActed(item.status)
                      && standing.has(P.REMEDIATION_VALIDATE)
  const canAccept   = open && !escalated && item.canResolve && standing.has(P.REMEDIATION_VALIDATE)
  const canEscalate = open && !escalated && standing.has(P.REMEDIATION_ESCALATE)

  const overdue = item.dueAt && open && new Date(item.dueAt) < new Date()

  return (
    <>
      <div className="flex items-start gap-3 px-4 py-2.5 border-b border-border hover:bg-surface-overlay/50 transition-colors">
        <button
          onClick={onToggle}
          className="text-text-muted hover:text-text-secondary shrink-0 mt-0.5"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        <AlertTriangle
          size={13}
          className={cn('shrink-0 mt-0.5',
            item.severity === 'CRITICAL' || item.severity === 'HIGH'
              ? 'text-status-fail-fg' : 'text-text-muted')}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-medium text-text-primary truncate">
              {item.title}
            </span>
            <Chip tone={status.tone}>{status.label}</Chip>
            {item.severity && (
              <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0',
                SEVERITY[item.severity] || SEVERITY.LOW)}>
                {item.severity}
              </span>
            )}
            {escalated && (
              <button
                onClick={() => onOpenIssue(item.linkedIssueId)}
                className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-ink hover:bg-brand-500/20 transition-colors shrink-0"
                title="Open the linked issue"
              >
                <ExternalLink size={8} /> Issue #{item.linkedIssueId}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {item.dueAt && (
              <span className={cn('flex items-center gap-1 text-[9px]',
                overdue ? 'text-status-fail-fg font-medium' : 'text-text-muted')}>
                <Clock size={8} /> {overdue ? 'Overdue — ' : 'Due '}{fmtDate(item.dueAt)}
              </span>
            )}
            {item.assignedToName && (
              <span className="flex items-center gap-1 text-[9px] text-text-muted">
                <User size={8} /> {item.assignedToName}
              </span>
            )}
            {item.expectedEvidence && (
              <span className="flex items-center gap-1 text-[9px] text-text-muted">
                <Paperclip size={8} /> Evidence requested
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canValidate && (
            <button
              onClick={() => onValidate(item)}
              disabled={busy}
              title="Resolve the item, decrement the open count and trigger the next report version when it reaches zero"
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border border-border bg-surface-overlay text-text-secondary hover:border-border-strong transition-colors disabled:opacity-50"
            >
              <CheckCircle2 size={10} /> Validate
            </button>
          )}
          {canAccept && (
            <button
              onClick={() => onAcceptRisk(item)}
              disabled={busy}
              title="Close the item without a vendor fix, recording the acceptance"
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border border-border bg-surface-overlay text-text-secondary hover:border-border-strong transition-colors disabled:opacity-50"
            >
              <ShieldCheck size={10} /> Accept risk
            </button>
          )}
          {/* ── ESCALATE IS NOW A RECOVERY PATH ──────────────────────────
              A raised finding escalates by itself, so this appearing means
              something stopped that: the finding has no named owner (a guard
              rule that assigns by group role produces one, and an Issue with
              no owner sits in OPEN with nobody told), or the escalation threw
              and the listener left the finding standing. Both are cases where
              a person picks up the pieces, so the title says which one rather
              than leaving it looking like a step somebody forgot. */}
          {canEscalate && (
            <button
              onClick={() => onEscalate(item)}
              disabled={busy}
              title={item.assignedToName
                ? 'Escalation did not complete for this finding — create the Issue and start its remediation workflow'
                : 'This finding has no named owner, so it could not escalate by itself. Assign it, then escalate to create the Issue.'}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border border-brand-500/40 bg-brand-500/10 text-brand-ink hover:bg-brand-500/20 transition-colors disabled:opacity-50"
            >
              <ArrowUpRight size={10} /> Escalate
            </button>
          )}
          {/* Where the work went. The chip above links to the Issue; this says
              why there is nothing to press here. */}
          {open && escalated && (
            <span className="text-[9px] text-text-muted italic max-w-[11rem] text-right">
              Tracked as Issue #{item.linkedIssueId} — closes with it
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-12 py-3 bg-surface-overlay/30 border-b border-border space-y-2">
          {item.description && (
            <p className="text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed">
              {item.description}
            </p>
          )}
          {item.expectedEvidence && (
            <div>
              <p className="text-[9px] uppercase tracking-wide text-text-muted mb-0.5">
                Expected evidence
              </p>
              <p className="text-[11px] text-text-secondary whitespace-pre-wrap">
                {item.expectedEvidence}
              </p>
            </div>
          )}
          {item.resolutionNote && (
            <div>
              <p className="text-[9px] uppercase tracking-wide text-text-muted mb-0.5">
                Resolution
              </p>
              <p className="text-[11px] text-text-secondary whitespace-pre-wrap">
                {item.resolutionNote}
              </p>
            </div>
          )}
          {item.acceptedRisk && item.acceptedRiskNote && (
            <div>
              <p className="text-[9px] uppercase tracking-wide text-status-warn-fg mb-0.5">
                Risk accepted
              </p>
              <p className="text-[11px] text-text-secondary whitespace-pre-wrap">
                {item.acceptedRiskNote}
              </p>
            </div>
          )}
          {!item.canResolve && isOpen(item.status) && (
            // Says why the buttons are absent rather than leaving a bare row.
            // "Nothing is clickable" and "this one is not yours to close" look
            // identical otherwise, and the second is not a fault.
            <p className="text-[10px] text-text-muted italic">
              This item is reserved for someone else to resolve.
            </p>
          )}
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB
// ═══════════════════════════════════════════════════════════════════════════

export default function AssessmentFindingsTab({
  assessmentId, entity, vc = {}, userSide, stepInstanceId, taskId, onTaskComplete,
}) {
  const isVendorView = String(userSide || '').toUpperCase() === 'VENDOR'
  const qc       = useQueryClient()
  const navigate = useNavigate()
  const standing = useStanding(vc)          // no step requirement — see below
  const [expanded, setExpanded] = useState(() => new Set())
  const [busyId, setBusyId]     = useState(null)
  const [showResolved, setShowResolved] = useState(false)

  // useStanding without a required step action on purpose: validating a
  // remediation is not tied to one workflow step the way assigning or
  // submitting a section is. The gate is the permission plus canResolve, and
  // standing.has() checks the permission alone.

  // Primary query — works for anything raised after the ReviewController
  // builder change.
  const { data: byAssessment, isLoading } = useQuery({
    queryKey: ['assessment-findings', assessmentId],
    queryFn:  () => actionItemsApi.forEntity('ASSESSMENT', assessmentId),
    enabled:  !!assessmentId,
    staleTime: 30 * 1000,
  })

  // Fallback for rows raised before parentEntityId was stamped. One request per
  // question instance would be absurd, so this uses the bulk endpoint the fill
  // page already relies on — the same one ActionItemsBulkProvider calls.
  const questionIds = useMemo(() => {
    const secs = entity?.sections || []
    return secs.flatMap(s => (s.questions || []).map(q => q.questionInstanceId)).filter(Boolean)
  }, [entity?.sections])

  const { data: byQuestion } = useQuery({
    queryKey: ['assessment-findings-legacy', assessmentId, questionIds.length],
    queryFn:  () => actionItemsApi.forEntities('QUESTION_RESPONSE', questionIds),
    enabled:  !!assessmentId && questionIds.length > 0,
    staleTime: 60 * 1000,
  })

  const items = useMemo(() => {
    const a = unwrapList(byAssessment)
    const b = unwrapList(byQuestion)
    // Merge by id. An item raised after the builder change appears in both
    // lists; taking the first occurrence keeps the assessment-scoped copy,
    // which is the one carrying the parent.
    const seen = new Map()
    for (const it of [...a, ...b]) {
      if (!it || it.id == null) continue
      if (ASSIGNMENT_TYPES.includes(it.remediationType)) continue
      if (isVendorView && ORG_INTERNAL_TYPES.includes(it.remediationType)) continue
      if (!seen.has(it.id)) seen.set(it.id, it)
    }
    return [...seen.values()].sort((x, y) => {
      // Open first, then most severe, then soonest due.
      const ox = isOpen(x.status) ? 0 : 1
      const oy = isOpen(y.status) ? 0 : 1
      if (ox !== oy) return ox - oy
      const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
      const sx = rank[x.severity] ?? 4
      const sy = rank[y.severity] ?? 4
      if (sx !== sy) return sx - sy
      return String(x.dueAt || '').localeCompare(String(y.dueAt || ''))
    })
  }, [byAssessment, byQuestion, isVendorView])

  const visible = showResolved ? items : items.filter(i => isOpen(i.status))
  const openCount = items.filter(i => isOpen(i.status)).length

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['assessment-findings', assessmentId] })
    qc.invalidateQueries({ queryKey: ['assessment-findings-legacy', assessmentId] })
    qc.invalidateQueries({ queryKey: ['module-detail'] })
    qc.invalidateQueries({ queryKey: ['view-context'] })
  }

  const validate = useMutation({
    mutationFn: (item) => assessmentsApi.vendor.validateRemediation(assessmentId, item.id),
    onSuccess: (res) => {
      // The endpoint answers with reportTriggered so the UI can say what
      // actually happened rather than a generic success.
      const triggered = res?.reportTriggered ?? res?.data?.reportTriggered
      toast.success(triggered
        ? 'Remediation validated — a new report version was generated'
        : 'Remediation validated')
      invalidate()
      onTaskComplete?.()
    },
    onError:   (e) => toast.error(e?.message || 'Could not validate the remediation'),
    onSettled: () => setBusyId(null),
  })

  const acceptRisk = useMutation({
    mutationFn: ({ item, note }) =>
      assessmentsApi.vendor.acceptRiskOnRemediation(assessmentId, item.id, note),
    onSuccess: () => { toast.success('Risk accepted — item closed'); invalidate() },
    onError:   (e) => toast.error(e?.message || 'Could not accept the risk'),
    onSettled: () => setBusyId(null),
  })

  const escalate = useMutation({
    mutationFn: (item) => assessmentsApi.vendor.escalateToIssue(assessmentId, item.id),
    onSuccess: (res) => {
      const d = res?.data || res
      toast.success(`Escalated to Issue ${d?.issueRef || ''}`.trim())
      invalidate()
    },
    onError: (e) => {
      // Three errors this endpoint raises deliberately, each with a message
      // worth showing verbatim rather than flattening to "failed":
      //   ALREADY_ESCALATED  — names the issue it is already linked to
      //   NO_OWNER           — the remediation has no assignee
      //   NO_ISSUE_WORKFLOW  — no active ISSUE blueprint was found
      toast.error(e?.message || 'Could not escalate this remediation')
    },
    onSettled: () => setBusyId(null),
  })

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  if (isLoading) {
    return (
      <div className="px-4 py-8 text-center text-[11px] text-text-muted">
        Loading findings…
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="px-4 py-8 text-center">
        <CheckCircle2 size={16} className="mx-auto text-status-pass-fg" />
        <p className="mt-2 text-[11px] text-text-muted">
          No remediations raised on this assessment.
        </p>
        <p className="mt-1 text-[10px] text-text-muted opacity-70">
          They appear here when a reviewer requests one from the Review tab.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-overlay/40">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-text-muted">
            {openCount} open of {items.length}
          </span>
          {items.length > openCount && (
            <button
              onClick={() => setShowResolved(v => !v)}
              className="text-[9px] text-text-muted hover:text-brand-ink transition-colors"
            >
              {showResolved ? 'Hide resolved' : `Show resolved (${items.length - openCount})`}
            </button>
          )}
        </div>
        {isVendorView ? (
          // The vendor does not validate, accept risk or escalate — those are
          // the organisation's calls on the organisation's own finding. What the
          // vendor does is FIX it, and the place that happens is the Issue the
          // finding was escalated into: it carries the workflow, the task and
          // the evidence. So this tab is their read of what was raised, with a
          // link through to the thing they actually work.
          <span className="text-[9px] text-text-muted">
            Raised against this assessment. Fix each one from its issue — the
            issue is where the task and evidence live.
          </span>
        ) : !standing.has(P.REMEDIATION_VALIDATE) && (
          <span className="text-[9px] text-text-muted">
            View only — you do not hold the validate permission.
          </span>
        )}
      </div>

      <div>
        {visible.map(item => (
          <FindingRow
            key={item.id}
            item={item}
            standing={standing}
            busyId={busyId}
            expanded={expanded.has(item.id)}
            onToggle={() => toggle(item.id)}
            onValidate={(i)   => { setBusyId(i.id); validate.mutate(i) }}
            onAcceptRisk={(i) => {
              // window.prompt rather than a modal: this component renders inside
              // a tab that is itself inside a scroll container, and the two
              // existing in-page modals in this module both had to be rewritten
              // as inline panels because of CSS transforms on their ancestors
              // (see the note at the top of ResponderActions). A prompt is
              // plainer than a fourth attempt at that.
              const note = window.prompt(
                'Why is this risk being accepted? This is recorded on the item.', '')
              if (note === null) return
              setBusyId(i.id)
              acceptRisk.mutate({ item: i, note: note.trim() })
            }}
            onEscalate={(i)   => { setBusyId(i.id); escalate.mutate(i) }}
            onOpenIssue={(issueId) => navigate(`/module/ISSUE/${issueId}`)}
          />
        ))}
      </div>
    </div>
  )
}