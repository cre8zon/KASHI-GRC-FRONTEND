/**
 * RestartWorkflowWizard.jsx
 *
 * Restarting a vendor's TPRM workflow, end to end, in one modal:
 *
 *   1. Pick the workflow blueprint      → POST /v1/vendors/{id}/restart-workflow
 *   2. Pick the assessment template     → POST /v1/workflows/instances/{iid}/template-selection
 *      (mapped risk band by default, any band behind an override)
 *   3. The assessment starts
 *
 * ── WHY THIS IS A WIZARD AND NOT ONE FORM ─────────────────────────────────
 * It has to be two requests, because step 2's options do not exist until step
 * 1 has run.
 *
 * restart-workflow starts the instance. The engine then runs
 * QueueAssessmentCandidatesAction, which reads the vendor's risk score, looks
 * it up in risk_template_mapping, writes the matching template ids onto a
 * vendor_template_selections row, and PAUSES. Only at that point is there a
 * candidate list to choose from.
 *
 * So a single DynamicForm cannot do this, which is what the earlier
 * "Restart workflow" action tried to be — one form, one POST, and then the
 * workflow parked on a paused step with nothing on screen saying so. The
 * vendor never received a questionnaire and nothing indicated why.
 *
 * ── STEP 2 MAY TAKE A MOMENT TO EXIST ─────────────────────────────────────
 * The QUEUE step runs inside the workflow engine after restart-workflow
 * returns, so the selection row can lag the response by a beat. The wizard
 * polls for it rather than assuming, and says what it is waiting for. If it
 * never appears, that is reported as the real outcome — the workflow HAS
 * restarted, and the template can still be chosen from the vendor's
 * Assessments tab — rather than as a failure, because the restart genuinely
 * succeeded.
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GitBranch, ClipboardList, ShieldAlert, Check, Loader2,
  ChevronDown, ChevronRight, Info, AlertTriangle,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import api from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

const TIER_TONE = {
  LOW:      'bg-status-pass-bg border-status-pass-bd text-status-pass-fg',
  MEDIUM:   'bg-status-warn-bg border-status-warn-bd text-status-warn-fg',
  HIGH:     'bg-status-fail-bg border-status-fail-bd text-status-fail-fg',
  CRITICAL: 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg',
}

function TierChip({ label }) {
  if (!label) return null
  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wide shrink-0',
      TIER_TONE[String(label).toUpperCase()] || 'bg-surface-overlay border-border text-text-muted')}>
      {label}
    </span>
  )
}

function Stepper({ step }) {
  const steps = ['Workflow', 'Questionnaire']
  return (
    <div className="flex items-center gap-0 pb-3 mb-3 border-b border-border">
      {steps.map((label, i) => {
        const n = i + 1
        const done = step > n
        const active = step === n
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 border',
                done   && 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg',
                active && 'bg-brand-500 border-brand-500 text-white',
                !done && !active && 'bg-surface-raised border-border text-text-muted')}>
                {done ? <Check size={12} /> : n}
              </span>
              <span className={cn('text-[11px] font-medium truncate',
                active ? 'text-text-primary' : 'text-text-muted')}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('h-px flex-1 mx-2', done ? 'bg-status-pass-bd' : 'bg-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function TemplateRow({ tpl, selected, onSelect, showTier }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tpl.templateId)}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 rounded-card border text-left transition-colors',
        selected ? 'border-brand-500 bg-brand-500/10' : 'border-border hover:bg-surface-overlay')}>
      <span className={cn('w-4 h-4 rounded-full border flex items-center justify-center shrink-0',
        selected ? 'bg-brand-500 border-brand-500' : 'border-border')}>
        {selected && <Check size={10} className="text-white" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-medium text-text-primary truncate">{tpl.name}</span>
        <span className="block text-[10px] text-text-muted">
          v{tpl.version}
          {tpl.minScore != null && tpl.maxScore != null && <> · score {tpl.minScore}–{tpl.maxScore}</>}
        </span>
      </span>
      {showTier && <TierChip label={tpl.tierLabel} />}
      {tpl.mapped && showTier && (
        <span className="text-[9px] text-brand-ink font-medium shrink-0">recommended</span>
      )}
    </button>
  )
}

export default function RestartWorkflowWizard({ vendorId, vendorName, onClose, onDone }) {
  const qc = useQueryClient()

  const [step, setStep]                 = useState(1)
  const [workflowId, setWorkflowId]     = useState('')
  const [instanceId, setInstanceId]     = useState(null)
  const [chosen, setChosen]             = useState(null)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [reason, setReason]             = useState('')
  const [waiting, setWaiting]           = useState(false)
  const [queueTimedOut, setQueueTimedOut] = useState(false)

  // ── STEP 1: the blueprints ──────────────────────────────────────────────
  // entityType=VENDOR, because the endpoint hardcodes entityType "VENDOR" when
  // it starts the instance — an ISSUE or AUDIT_POLICY blueprint picked here
  // would produce an instance whose steps reference an entity type it was
  // never designed for.
  const { data: workflowsRaw, isLoading: loadingWorkflows } = useQuery({
    queryKey: ['vendor-workflows-for-restart'],
    queryFn:  () => api.get('/v1/workflows', { params: { entityType: 'VENDOR', skip: 0, take: 100 } }),
    staleTime: 5 * 60 * 1000,
  })
  const workflows = useMemo(() => {
    const r = workflowsRaw
    const rows = Array.isArray(r?.items) ? r.items
      : Array.isArray(r?.data?.items) ? r.data.items
      : Array.isArray(r?.data) ? r.data
      : Array.isArray(r) ? r : []
    return rows.filter(w => (w.isActive ?? w.active) !== false)
  }, [workflowsRaw])

  const restart = useMutation({
    // Body, not query param. The endpoint now accepts either; the body is what
    // a JSON client can express without building a URL by hand.
    mutationFn: () => api.post(`/v1/vendors/${vendorId}/restart-workflow`,
                               { workflowId: Number(workflowId) }),
    onSuccess: (res) => {
      const iid = res?.workflowInstanceId ?? res?.data?.workflowInstanceId
      setInstanceId(iid ?? null)
      setStep(2)
      setWaiting(true)
      qc.invalidateQueries({ queryKey: ['module-list'] })
      qc.invalidateQueries({ queryKey: ['module-detail'] })
    },
    onError: (e) => toast.error(
      e?.response?.data?.error?.message || e?.message || 'Could not restart the workflow'),
  })

  // ── STEP 2: the candidates, once the QUEUE step has written them ────────
  //
  // Polled rather than fetched once. QueueAssessmentCandidatesAction runs
  // inside the engine after restart-workflow returns, so the row can lag the
  // response. refetchInterval stops as soon as the row appears.
  const pollCount = useRef(0)
  const { data: selection } = useQuery({
    queryKey: ['template-selection', instanceId],
    queryFn:  () => api.get(`/v1/workflows/instances/${instanceId}/template-selection`),
    enabled:  step === 2 && !!instanceId && !queueTimedOut,
    retry: false,
    select: (r) => r?.data ?? r,
    refetchInterval: (q) => (q.state.data ? false : 1200),
  })

  useEffect(() => {
    if (step !== 2 || !waiting) return
    if (selection) { setWaiting(false); return }
    const t = setInterval(() => {
      pollCount.current += 1
      // ~18s. Long enough for a slow engine pass, short enough that nobody
      // sits watching a spinner wondering whether it is stuck.
      if (pollCount.current > 15) { setQueueTimedOut(true); setWaiting(false) }
    }, 1200)
    return () => clearInterval(t)
  }, [step, waiting, selection])

  const candidates = useMemo(() => selection?.candidates || [], [selection])
  const allBands   = useMemo(() => selection?.allBands || [], [selection])
  const otherBands = useMemo(() => allBands.filter(b => !b.mapped), [allBands])
  const isOverride = useMemo(
    () => chosen != null && !candidates.some(c => c.templateId === chosen),
    [chosen, candidates])

  const confirmTemplate = useMutation({
    mutationFn: () => api.post(`/v1/workflows/instances/${instanceId}/template-selection`,
      isOverride
        ? { templateId: chosen, override: true, overrideReason: reason.trim() }
        : { templateId: chosen }),
    onSuccess: () => {
      toast.success(isOverride
        ? 'Workflow restarted and the assessment started with an overridden template'
        : 'Workflow restarted and the assessment started')
      qc.invalidateQueries({ queryKey: ['module-list'] })
      qc.invalidateQueries({ queryKey: ['module-detail'] })
      qc.invalidateQueries({ queryKey: ['vendor-assessments'] })
      qc.invalidateQueries({ queryKey: ['template-selection'] })
      onDone?.()
      onClose?.()
    },
    onError: (e) => toast.error(
      e?.response?.data?.error?.message || e?.message || 'Could not select the template'),
  })

  const canConfirm = chosen != null && (!isOverride || reason.trim().length > 0)

  return (
    <Modal
      open
      onClose={onClose}
      title="Restart workflow"
      subtitle={vendorName || undefined}
      size="xl">
      <Stepper step={step} />

      {/* ── STEP 1 ────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-text-secondary uppercase tracking-wide mb-1">
              TPRM workflow <span className="text-status-fail-fg">*</span>
            </label>
            {loadingWorkflows ? (
              <div className="flex items-center gap-2 text-[11px] text-text-muted py-2">
                <Loader2 size={12} className="animate-spin" /> Loading blueprints…
              </div>
            ) : workflows.length === 0 ? (
              <div className="flex items-start gap-2 px-3 py-2 rounded-card bg-status-fail-bg border border-status-fail-bd">
                <AlertTriangle size={11} className="text-status-fail-fg mt-0.5 shrink-0" />
                <p className="text-[11px] text-status-fail-fg">
                  No active workflow blueprint exists for the VENDOR entity type.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {workflows.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setWorkflowId(String(w.id))}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-card border text-left transition-colors',
                      String(workflowId) === String(w.id)
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-border hover:bg-surface-overlay')}>
                    <span className={cn('w-4 h-4 rounded-full border flex items-center justify-center shrink-0',
                      String(workflowId) === String(w.id) ? 'bg-brand-500 border-brand-500' : 'border-border')}>
                      {String(workflowId) === String(w.id) && <Check size={10} className="text-white" />}
                    </span>
                    <GitBranch size={12} className="text-text-muted shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-medium text-text-primary truncate">{w.name}</span>
                      {w.version && <span className="block text-[10px] text-text-muted">v{w.version}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[10px] text-text-muted">
              Blueprints designed for the VENDOR entity type. An inactive blueprint is not listed.
            </p>
          </div>

          <div className="flex items-start gap-2 px-3 py-2 rounded-card bg-status-warn-bg/40 border border-status-warn-bd">
            <Info size={11} className="text-status-warn-fg mt-0.5 shrink-0" />
            <p className="text-[11px] text-status-warn-fg leading-relaxed">
              Any workflow currently running for this vendor is cancelled and a new
              cycle begins. You choose the questionnaire on the next step — nothing
              reaches the vendor until then.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-3 py-1.5 rounded-ctl border border-border text-[11px] font-medium text-text-secondary hover:bg-surface-overlay transition-colors">
              Cancel
            </button>
            <button
              type="button"
              disabled={!workflowId || restart.isPending}
              onClick={() => restart.mutate()}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ctl text-[11px] font-medium transition-colors',
                workflowId ? 'bg-brand-500 text-white hover:opacity-90'
                           : 'bg-surface-overlay text-text-muted cursor-not-allowed',
                restart.isPending && 'opacity-60 cursor-wait')}>
              {restart.isPending ? <Loader2 size={11} className="animate-spin" /> : null}
              {restart.isPending ? 'Restarting…' : 'Next'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2 ────────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-3">
          {waiting && !selection && (
            <div className="flex items-center gap-2 px-3 py-6 justify-center text-[11px] text-text-muted">
              <Loader2 size={12} className="animate-spin" />
              Workflow restarted — waiting for the risk score to select candidate questionnaires…
            </div>
          )}

          {queueTimedOut && !selection && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-card bg-status-warn-bg border border-status-warn-bd">
              <AlertTriangle size={11} className="text-status-warn-fg mt-0.5 shrink-0" />
              <div className="text-[11px] text-status-warn-fg leading-relaxed">
                <p className="font-medium">The workflow restarted, but no questionnaire choice appeared.</p>
                <p className="mt-0.5">
                  Either the blueprint has no Queue Assessment Candidates step, or no
                  template is mapped to this vendor&rsquo;s risk band. You can close this
                  and pick a questionnaire from the vendor&rsquo;s Assessments tab once
                  it appears — the restart itself succeeded.
                </p>
              </div>
            </div>
          )}

          {selection && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <ClipboardList size={12} className="text-brand-ink shrink-0" />
                <span className="text-xs font-semibold text-text-primary">
                  Choose the assessment questionnaire
                </span>
                <TierChip label={selection.riskTierLabel} />
              </div>

              <div className="space-y-1.5">
                {candidates.map(c => (
                  <TemplateRow
                    key={c.templateId}
                    tpl={allBands.find(b => b.templateId === c.templateId) || c}
                    selected={chosen === c.templateId}
                    onSelect={setChosen}
                  />
                ))}
                {candidates.length === 0 && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-card bg-status-warn-bg border border-status-warn-bd">
                    <Info size={11} className="text-status-warn-fg mt-0.5 shrink-0" />
                    <p className="text-[11px] text-status-warn-fg">
                      No template is mapped to this vendor&rsquo;s risk band. Pick one from
                      another band below.
                    </p>
                  </div>
                )}
              </div>

              {otherBands.length > 0 && (
                <div className="border-t border-border pt-2">
                  <button
                    type="button"
                    onClick={() => setOverrideOpen(o => !o)}
                    className="w-full flex items-center gap-2 py-1 text-left">
                    {overrideOpen ? <ChevronDown size={12} className="text-text-muted" />
                                  : <ChevronRight size={12} className="text-text-muted" />}
                    <ShieldAlert size={11} className="text-status-warn-fg" />
                    <span className="text-[11px] font-medium text-text-secondary">
                      Use a template from another risk band
                    </span>
                    <span className="text-[10px] text-text-muted">({otherBands.length})</span>
                  </button>
                  {overrideOpen && (
                    <div className="space-y-1.5 mt-1.5">
                      <p className="text-[10px] text-text-muted leading-relaxed">
                        This ignores the vendor&rsquo;s calculated score. The reason you give is
                        recorded against the workflow step, not just logged.
                      </p>
                      {otherBands.map(b => (
                        <TemplateRow key={b.templateId} tpl={b}
                          selected={chosen === b.templateId} onSelect={setChosen} showTier />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isOverride && (
                <div>
                  <label className="block text-[10px] font-medium text-text-secondary uppercase tracking-wide mb-1">
                    Why this band? <span className="text-status-fail-fg">*</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="e.g. Vendor scores LOW but processes cardholder data under our PCI scope."
                    className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            {/* No Back. Step 1 already cancelled the old workflow and started a
                new one — there is nothing to go back TO, and offering it would
                imply the restart could be undone. */}
            <span className="text-[10px] text-text-muted">
              {selection ? 'The workflow has restarted. Choosing a questionnaire starts the assessment.' : ''}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose}
                className="px-3 py-1.5 rounded-ctl border border-border text-[11px] font-medium text-text-secondary hover:bg-surface-overlay transition-colors">
                {selection ? 'Later' : 'Close'}
              </button>
              {selection && (
                <button
                  type="button"
                  disabled={!canConfirm || confirmTemplate.isPending}
                  onClick={() => confirmTemplate.mutate()}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ctl text-[11px] font-medium transition-colors',
                    canConfirm ? 'bg-brand-500 text-white hover:opacity-90'
                               : 'bg-surface-overlay text-text-muted cursor-not-allowed',
                    confirmTemplate.isPending && 'opacity-60 cursor-wait')}>
                  {confirmTemplate.isPending
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Check size={11} />}
                  {isOverride ? 'Override and start' : 'Start assessment'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}