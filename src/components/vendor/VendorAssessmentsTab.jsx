/**
 * VendorAssessmentsTab.jsx
 *
 * Every assessment ever run against this vendor, newest first, with the one
 * action the hardcoded page offers: cancel a stale one.
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────
 * VendorDetailPage's AssessmentsTab (lines 976-1049) plus its two helper
 * components. Kept from it: the endpoint, the row shape, the expandable
 * detail, and the cancel action with its status gate.
 *
 * Deliberately not kept: the 7-phase ASSESSMENT_PHASES tracker (lines
 * 597-647). It maps workflow step ORDER RANGES to phase labels —
 * `setup: [1,2]`, `org_review: [9,13]` — so renaming or reordering a step in
 * the TPRM blueprint silently mislabels every assessment, and adding one
 * shifts everything after it. The Workflow tab shows the real step from the
 * workflow instance and cannot drift. If you want the phase tracker back it
 * belongs in `status_flow_json` on the blueprint, not in a JSX constant.
 *
 * ── TWO FIELDS THE ENDPOINT DOES NOT RETURN ───────────────────────────────
 * The hardcoded page reads `assessment.templateId` (line 864) and
 * `progress.mandatoryQuestions` (line 947). GET /v1/vendors/{id}/assessments
 * returns neither — its builder emits assessmentId, vendorId, templateName,
 * status, submittedAt and a progress map of exactly totalQuestions, answered
 * and percentComplete. So the risk-tier chip that depended on templateId has
 * never rendered, and the mandatory count has always read 0. Neither is
 * reproduced here; a number that is always zero is worse than no number.
 */

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck, ChevronRight, ChevronDown, XCircle, Clock, CheckCircle2,
  RotateCcw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { vendorsApi } from '../../api/vendors.api'
import { assessmentsApi } from '../../api/assessments.api'
import api from '../../config/axios.config'
import TemplateSelectionPanel from './TemplateSelectionPanel'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'
import { useStanding, unwrapList } from './vendorShared'

// One map. The hardcoded app carries three copies of this with different
// wording; when these move to ui_options as an assessment_status component,
// delete it and read from the screen config.
const STATUS = {
  ASSIGNED:     { label: 'Assigned',     tone: 'muted' },
  IN_PROGRESS:  { label: 'In progress',  tone: 'info'  },
  SUBMITTED:    { label: 'Submitted',    tone: 'info'  },
  UNDER_REVIEW: { label: 'Under review', tone: 'warn'  },
  COMPLETED:    { label: 'Completed',    tone: 'pass'  },
  CANCELLED:    { label: 'Cancelled',    tone: 'muted' },
}

const TONE = {
  pass:  'text-status-pass-fg bg-status-pass-bg',
  warn:  'text-status-warn-fg bg-status-warn-bg',
  info:  'text-brand-ink bg-brand-500/10',
  muted: 'text-text-muted bg-surface-overlay',
}

// The two statuses the cancel endpoint accepts. A SUBMITTED assessment is not
// cancellable — the endpoint would take it, but the workflow instance does not
// unwind, leaving a cancelled assessment driving a live workflow.
const CANCELLABLE = ['ASSIGNED', 'IN_PROGRESS']

function fmtDate(v) {
  if (!v) return null
  try { return new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return String(v) }
}

function AssessmentRow({ row, expanded, onToggle, onOpen, onCancel, canCancel, busy }) {
  const id     = row.assessmentId ?? row.id
  const status = STATUS[row.status] || { label: row.status, tone: 'muted' }
  const prog   = row.progress || {}
  const total  = prog.totalQuestions ?? 0
  const done   = prog.answered ?? 0
  const pct    = prog.percentComplete ?? (total > 0 ? Math.round((done / total) * 100) : 0)

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border hover:bg-surface-overlay/50 transition-colors">
        <button
          onClick={onToggle}
          className="text-text-muted hover:text-text-secondary shrink-0"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        <ClipboardCheck size={13} className="text-text-muted shrink-0" />

        <button
          onClick={() => onOpen(id)}
          className="flex-1 min-w-0 text-left group"
          title="Open this assessment"
        >
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-text-primary truncate group-hover:text-brand-ink transition-colors">
              {row.templateName || `Assessment #${id}`}
            </span>
            <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0', TONE[status.tone])}>
              {status.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[9px] text-text-muted">#{id}</span>
            {total > 0 && (
              <span className="text-[9px] text-text-muted">{done}/{total} answered</span>
            )}
            {row.submittedAt && (
              <span className="flex items-center gap-1 text-[9px] text-text-muted">
                <CheckCircle2 size={8} /> Submitted {fmtDate(row.submittedAt)}
              </span>
            )}
          </div>
        </button>

        {total > 0 && (
          <div className="w-24 shrink-0" title={`${pct}% answered`}>
            <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all',
                  pct >= 100 ? 'bg-status-pass-fg' : 'bg-brand-500')}
                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
              />
            </div>
          </div>
        )}

        {canCancel && CANCELLABLE.includes(row.status) && (
          <button
            onClick={() => onCancel(row)}
            disabled={busy === id}
            title="Cancel this assessment — it has not been submitted"
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border border-border bg-surface-overlay text-text-secondary hover:border-status-fail-bd hover:text-status-fail-fg transition-colors disabled:opacity-50"
          >
            <XCircle size={10} /> Cancel
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-12 py-3 bg-surface-overlay/30 border-b border-border">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[9px] uppercase tracking-wide text-text-muted">Questions</p>
              <p className="text-[12px] text-text-primary mt-0.5">{total || '—'}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wide text-text-muted">Answered</p>
              <p className="text-[12px] text-text-primary mt-0.5">{done}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wide text-text-muted">Complete</p>
              <p className="text-[12px] text-text-primary mt-0.5">{pct}%</p>
            </div>
          </div>
          <button
            onClick={() => onOpen(id)}
            className="mt-2 flex items-center gap-1 text-[10px] text-brand-ink hover:underline"
          >
            Open the assessment <ChevronRight size={10} />
          </button>
        </div>
      )}
    </>
  )
}

export default function VendorAssessmentsTab({ entity, vc = {} }) {
  const qc       = useQueryClient()
  const navigate = useNavigate()
  const standing = useStanding(vc)
  const [expanded, setExpanded] = useState(() => new Set())
  const [busy, setBusy] = useState(null)
  const [showCancelled, setShowCancelled] = useState(false)
  // Set after a successful cancel. The prompt is the whole point of the flow:
  // cancelling is almost never the end of the story — it is what you do before
  // running the assessment again, and leaving the user to find the Workflow tab
  // and work out that Restart is the next step is how a two-click job becomes a
  // support question.
  const [restartPrompt, setRestartPrompt] = useState(null)
  const [restartWorkflowId, setRestartWorkflowId] = useState('')

  const vendorId = entity?.id ?? entity?.vendorId

  const { data: raw, isLoading } = useQuery({
    queryKey: ['vendor-assessments', vendorId],
    queryFn:  () => vendorsApi.assessments(vendorId),
    enabled:  !!vendorId,
    staleTime: 60 * 1000,
  })

  const all = useMemo(() => {
    const rows = unwrapList(raw)
    // Newest first. The endpoint's order is not guaranteed, and an assessment
    // list read top-down should start at the current cycle.
    return [...rows].sort((a, b) =>
      (b.assessmentId ?? b.id ?? 0) - (a.assessmentId ?? a.id ?? 0))
  }, [raw])

  const cancelled = all.filter(a => a.status === 'CANCELLED').length
  const visible   = showCancelled ? all : all.filter(a => a.status !== 'CANCELLED')

  // The same permission that gates every other destructive vendor action. A
  // cancel is not a delete, but it does abandon a workflow instance.
  const canCancel = standing.has('vendor.create')

  const cancel = useMutation({
    mutationFn: (row) => assessmentsApi.vendor.cancel(
      row.assessmentId ?? row.id,
      'Cancelled from the vendor record'),
    onSuccess: (_res, row) => {
      toast.success('Assessment cancelled')
      qc.invalidateQueries({ queryKey: ['vendor-assessments', vendorId] })
      qc.invalidateQueries({ queryKey: ['module-detail'] })
      // Cancelling closes the cycle as well as the assessment, so the vendor
      // now has no live TPRM workflow. Offer the restart here rather than
      // leaving them to discover it.
      setRestartPrompt({ assessmentId: row?.assessmentId ?? row?.id })
    },
    onError:   (e) => toast.error(e?.message || 'Could not cancel the assessment'),
    onSettled: () => setBusy(null),
  })

  // VENDOR-scoped blueprints only. /v1/workflows has always accepted this
  // filter — WorkflowController passes entityType straight through — and no
  // form used it until now, which is why the restart picker once offered
  // ISSUE and AUDIT_POLICY blueprints that cannot drive a vendor.
  const { data: workflowsRaw } = useQuery({
    queryKey: ['vendor-workflows-for-restart'],
    queryFn:  () => api.get('/v1/workflows', { params: { entityType: 'VENDOR', skip: 0, take: 100 } }),
    enabled:  !!restartPrompt,
    staleTime: 5 * 60 * 1000,
  })
  const workflowOptions = useMemo(() => {
    const r = workflowsRaw
    const rows = Array.isArray(r?.items) ? r.items
      : Array.isArray(r?.data?.items) ? r.data.items
      : Array.isArray(r?.data) ? r.data
      : Array.isArray(r) ? r : []
    return rows.filter(w => (w.isActive ?? w.active) !== false)
  }, [workflowsRaw])

  const restart = useMutation({
    mutationFn: (workflowId) =>
      api.post(`/v1/vendors/${vendorId}/restart-workflow`, null, { params: { workflowId } }),
    onSuccess: () => {
      toast.success('Workflow restarted — choose a questionnaire to start the assessment')
      setRestartPrompt(null)
      setRestartWorkflowId('')
      qc.invalidateQueries({ queryKey: ['vendor-assessments', vendorId] })
      qc.invalidateQueries({ queryKey: ['module-detail'] })
      // The template-selection row is created by the QUEUE step the restart
      // kicks off, so the panel below only appears once this refetches.
      qc.invalidateQueries({ queryKey: ['template-selection'] })
    },
    onError: (e) => toast.error(
      e?.response?.data?.error?.message || e?.message || 'Could not restart the workflow'),
  })

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  if (isLoading) {
    return (
      <div className="px-4 py-8 text-center text-[11px] text-text-muted">
        Loading assessments…
      </div>
    )
  }

  if (!all.length) {
    return (
      <div>
      <TemplateSelectionPanel
        vendor={entity}
        workflowInstanceId={entity?.activeWorkflowInstanceId}
        onStarted={() => {
          qc.invalidateQueries({ queryKey: ['vendor-assessments', vendorId] })
          qc.invalidateQueries({ queryKey: ['module-detail'] })
        }}
      />
      {/* ── AFTER A CANCEL: THE NEXT STEP, NAMED ──────────────────────────
          Cancelling an assessment closes its cycle too, so the vendor is left
          with no live workflow. Restarting is what happens next in every case
          worth cancelling for; the only open question is which blueprint, and
          leaving someone to find that on the Workflow tab is how a two-click
          job becomes a support question. */}
      {restartPrompt && (
        <div className="mx-4 mt-3 rounded-card border border-status-warn-bd bg-status-warn-bg/40 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <RotateCcw size={12} className="text-status-warn-fg mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-text-primary">
                Assessment cancelled. Restart the TPRM workflow to run a new one?
              </p>
              <p className="mt-0.5 text-[10px] text-text-muted">
                This cancels any remaining workflow instance for this vendor and
                starts a fresh cycle. You choose the questionnaire next.
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <select
                  value={restartWorkflowId}
                  onChange={(e) => setRestartWorkflowId(e.target.value)}
                  className="h-7 rounded-ctl border border-border bg-surface-raised px-2 text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                  <option value="">Select a workflow…</option>
                  {workflowOptions.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}{w.version ? ` (v${w.version})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!restartWorkflowId || restart.isPending}
                  onClick={() => restart.mutate(restartWorkflowId)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-ctl text-[11px] font-medium transition-colors',
                    restartWorkflowId
                      ? 'bg-brand-500 text-white hover:opacity-90'
                      : 'bg-surface-overlay text-text-muted cursor-not-allowed',
                    restart.isPending && 'opacity-60 cursor-wait')}>
                  {restart.isPending ? 'Restarting…' : 'Restart workflow'}
                </button>
                <button
                  type="button"
                  onClick={() => { setRestartPrompt(null); setRestartWorkflowId('') }}
                  className="text-[10px] text-text-muted hover:text-text-primary transition-colors">
                  Not now
                </button>
              </div>
              {workflowOptions.length === 0 && (
                <p className="mt-1.5 text-[10px] text-status-fail-fg">
                  No active workflow blueprint exists for the VENDOR entity type.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="px-4 py-8 text-center">
        <ClipboardCheck size={16} className="mx-auto text-text-muted" />
        <p className="mt-2 text-[11px] text-text-muted">
          No assessment has been run against this vendor yet.
        </p>
        <p className="mt-1 text-[10px] text-text-muted opacity-70">
          {/* Naming the trigger, because "no assessments" reads as a dead end
              otherwise. */}
          One is created when the TPRM workflow reaches its Execute Assessment
          step — see the Workflow tab for where this vendor currently sits.
        </p>
      </div>
      </div>
    )
  }

  return (
    <div>
      <TemplateSelectionPanel
        vendor={entity}
        workflowInstanceId={entity?.activeWorkflowInstanceId}
        onStarted={() => {
          qc.invalidateQueries({ queryKey: ['vendor-assessments', vendorId] })
          qc.invalidateQueries({ queryKey: ['module-detail'] })
        }}
      />
      {/* ── AFTER A CANCEL: THE NEXT STEP, NAMED ──────────────────────────
          Cancelling an assessment closes its cycle too, so the vendor is left
          with no live workflow. Restarting is what happens next in every case
          worth cancelling for; the only open question is which blueprint, and
          leaving someone to find that on the Workflow tab is how a two-click
          job becomes a support question. */}
      {restartPrompt && (
        <div className="mx-4 mt-3 rounded-card border border-status-warn-bd bg-status-warn-bg/40 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <RotateCcw size={12} className="text-status-warn-fg mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-text-primary">
                Assessment cancelled. Restart the TPRM workflow to run a new one?
              </p>
              <p className="mt-0.5 text-[10px] text-text-muted">
                This cancels any remaining workflow instance for this vendor and
                starts a fresh cycle. You choose the questionnaire next.
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <select
                  value={restartWorkflowId}
                  onChange={(e) => setRestartWorkflowId(e.target.value)}
                  className="h-7 rounded-ctl border border-border bg-surface-raised px-2 text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                  <option value="">Select a workflow…</option>
                  {workflowOptions.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}{w.version ? ` (v${w.version})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!restartWorkflowId || restart.isPending}
                  onClick={() => restart.mutate(restartWorkflowId)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-ctl text-[11px] font-medium transition-colors',
                    restartWorkflowId
                      ? 'bg-brand-500 text-white hover:opacity-90'
                      : 'bg-surface-overlay text-text-muted cursor-not-allowed',
                    restart.isPending && 'opacity-60 cursor-wait')}>
                  {restart.isPending ? 'Restarting…' : 'Restart workflow'}
                </button>
                <button
                  type="button"
                  onClick={() => { setRestartPrompt(null); setRestartWorkflowId('') }}
                  className="text-[10px] text-text-muted hover:text-text-primary transition-colors">
                  Not now
                </button>
              </div>
              {workflowOptions.length === 0 && (
                <p className="mt-1.5 text-[10px] text-status-fail-fg">
                  No active workflow blueprint exists for the VENDOR entity type.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-overlay/40">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-text-muted">
            {visible.length} assessment{visible.length === 1 ? '' : 's'}
          </span>
          {cancelled > 0 && (
            <button
              onClick={() => setShowCancelled(v => !v)}
              className="text-[9px] text-text-muted hover:text-brand-ink transition-colors"
            >
              {showCancelled ? 'Hide cancelled' : `Show cancelled (${cancelled})`}
            </button>
          )}
        </div>
        {all.some(a => CANCELLABLE.includes(a.status)) && !canCancel && (
          <span className="flex items-center gap-1 text-[9px] text-text-muted">
            <Clock size={8} /> View only
          </span>
        )}
      </div>

      <div>
        {visible.map(row => (
          <AssessmentRow
            key={row.assessmentId ?? row.id}
            row={row}
            canCancel={canCancel}
            busy={busy}
            expanded={expanded.has(row.assessmentId ?? row.id)}
            onToggle={() => toggle(row.assessmentId ?? row.id)}
            onOpen={(id) => navigate(`/module/VENDOR_ASSESSMENT/${id}`)}
            onCancel={(r) => {
              setBusy(r.assessmentId ?? r.id)
              cancel.mutate(r)
            }}
          />
        ))}
      </div>
    </div>
  )
}