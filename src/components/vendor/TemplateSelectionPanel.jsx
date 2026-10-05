/**
 * TemplateSelectionPanel.jsx
 *
 * The choice that starts an assessment: which questionnaire this vendor gets.
 *
 * ── WHERE THIS SITS IN THE WORKFLOW ───────────────────────────────────────
 * QueueAssessmentCandidatesAction computes the vendor's risk score, looks it
 * up in risk_template_mappings, writes the matching template ids onto a
 * vendor_template_selections row and PAUSES the step. Nothing moves until
 * somebody picks. Once they do, the QUEUE step completes, the Select
 * Assessment Template step completes behind it, and EXECUTE_ASSESSMENT
 * instantiates the chosen template.
 *
 * So this panel is not a convenience. Without it a restarted workflow parks on
 * a paused step and the vendor never receives a questionnaire — which is
 * exactly what "how do I start a new assessment for the same vendor" runs into.
 *
 * ── THE MAPPED BAND IS A DEFAULT, NOT A RULE ──────────────────────────────
 * The score picks the band and the band picks the candidates, and that is
 * right almost always — the mapping exists so nobody has to judge it by hand.
 *
 * But almost always is not always. A vendor scoring LOW may still be handling
 * regulated data, and the assessor who knows that should be able to reach the
 * CRITICAL questionnaire without an admin editing score bands underneath a
 * running workflow. So: candidates by default, every band behind an explicit
 * override, and the override costs a permission and a written reason — both
 * enforced server-side, not just hidden here.
 *
 * The reason is recorded in the workflow step remarks rather than a log line,
 * because "why was this vendor assessed with the critical questionnaire" is a
 * question someone asks six months later, looking at the workflow.
 */

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, ShieldAlert, Check, Loader2, ChevronDown, ChevronRight, Info,
} from 'lucide-react'
import api from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

const TIER_TONE = {
  LOW:      'bg-status-pass-bg border-status-pass-bd text-status-pass-fg',
  MEDIUM:   'bg-status-warn-bg border-status-warn-bd text-status-warn-fg',
  HIGH:     'bg-status-fail-bg border-status-fail-bd text-status-fail-fg',
  CRITICAL: 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg',
}

function TierChip({ label, className }) {
  if (!label) return null
  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wide',
      TIER_TONE[String(label).toUpperCase()] || 'bg-surface-overlay border-border text-text-muted',
      className)}>
      {label}
    </span>
  )
}

function TemplateRow({ tpl, selected, onSelect, showTier }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tpl.templateId)}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 rounded-card border text-left transition-colors',
        selected
          ? 'border-brand-500 bg-brand-500/10'
          : 'border-border hover:bg-surface-overlay')}>
      <span className={cn(
        'w-4 h-4 rounded-full border flex items-center justify-center shrink-0',
        selected ? 'bg-brand-500 border-brand-500' : 'border-border')}>
        {selected && <Check size={10} className="text-white" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-medium text-text-primary truncate">
          {tpl.name}
        </span>
        <span className="block text-[10px] text-text-muted">
          v{tpl.version}
          {tpl.minScore != null && tpl.maxScore != null && (
            <> · score {tpl.minScore}–{tpl.maxScore}</>
          )}
        </span>
      </span>
      {showTier && <TierChip label={tpl.tierLabel} />}
      {tpl.mapped && showTier && (
        <span className="text-[9px] text-brand-ink font-medium shrink-0">recommended</span>
      )}
    </button>
  )
}

export default function TemplateSelectionPanel({ vendor, workflowInstanceId, onStarted }) {
  const qc = useQueryClient()
  const instanceId = workflowInstanceId || vendor?.activeWorkflowInstanceId

  const [chosen, setChosen]           = useState(null)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [reason, setReason]           = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['template-selection', instanceId],
    queryFn:  () => api.get(`/v1/workflows/instances/${instanceId}/template-selection`),
    enabled:  !!instanceId,
    // A 404 here is the normal state for a workflow that is not sitting on the
    // selection step. It must not retry and must not surface as an error.
    retry: false,
    select: (r) => r?.data ?? r,
  })

  const candidates = useMemo(() => data?.candidates || [], [data])
  const allBands   = useMemo(() => data?.allBands || [], [data])

  // Everything outside the mapped band — the override list proper. Showing the
  // mapped ones again under "all bands" would just be the same rows twice.
  const otherBands = useMemo(
    () => allBands.filter(b => !b.mapped),
    [allBands])

  const isOverride = useMemo(
    () => chosen != null && !candidates.some(c => c.templateId === chosen),
    [chosen, candidates])

  const confirm = useMutation({
    mutationFn: () => api.post(`/v1/workflows/instances/${instanceId}/template-selection`,
      isOverride
        ? { templateId: chosen, override: true, overrideReason: reason.trim() }
        : { templateId: chosen }),
    onSuccess: () => {
      toast.success(isOverride
        ? 'Template selected outside the mapped band — the assessment is starting'
        : 'Template selected — the assessment is starting')
      qc.invalidateQueries({ queryKey: ['template-selection', instanceId] })
      qc.invalidateQueries({ queryKey: ['module-detail'] })
      qc.invalidateQueries({ queryKey: ['vendor-assessments'] })
      onStarted?.()
    },
    onError: (e) => toast.error(
      e?.response?.data?.error?.message || e?.message || 'Could not select the template'),
  })

  if (!instanceId) return null
  if (isLoading) return null
  // No pending row, or somebody already picked. Either way there is nothing to
  // decide, and a panel explaining that is noise on a page about assessments.
  if (!data || data.alreadySelected) return null
  if (!candidates.length && !allBands.length) return null

  const canSubmit = chosen != null && (!isOverride || reason.trim().length > 0)

  return (
    <div className="mb-3 rounded-card border border-brand-500/30 bg-brand-500/[0.04] overflow-hidden">
      <div className="flex items-start gap-2.5 px-4 py-3 border-b border-brand-500/20">
        <ClipboardList size={14} className="text-brand-ink mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-text-primary">
              Choose the assessment questionnaire
            </span>
            <TierChip label={data.riskTierLabel} />
          </div>
          <p className="mt-0.5 text-[11px] text-text-muted leading-relaxed">
            The workflow is waiting on this. {candidates.length === 1
              ? 'One template is mapped to this vendor’s risk band.'
              : `${candidates.length} templates are mapped to this vendor’s risk band.`}
            {' '}Nothing is sent to the vendor until you confirm.
          </p>
        </div>
      </div>

      <div className="px-4 py-3 space-y-1.5">
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
              another band below, or map one in the risk-template settings.
            </p>
          </div>
        )}
      </div>

      {/* ── The override ──────────────────────────────────────────────────
          Collapsed by default and deliberately not styled as an equal option:
          the mapped band is the answer unless somebody has a reason, and a
          flat list of every template invites picking by name recognition. */}
      {otherBands.length > 0 && (
        <div className="border-t border-brand-500/20">
          <button
            type="button"
            onClick={() => setOverrideOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-surface-overlay/50 transition-colors">
            {overrideOpen ? <ChevronDown size={12} className="text-text-muted" />
                          : <ChevronRight size={12} className="text-text-muted" />}
            <ShieldAlert size={11} className="text-status-warn-fg" />
            <span className="text-[11px] font-medium text-text-secondary">
              Use a template from another risk band
            </span>
            <span className="text-[10px] text-text-muted">({otherBands.length})</span>
          </button>

          {overrideOpen && (
            <div className="px-4 pb-3 space-y-1.5">
              <p className="text-[10px] text-text-muted leading-relaxed">
                This ignores the vendor&rsquo;s calculated score. The reason you give is
                recorded against the workflow step, not just logged.
              </p>
              {otherBands.map(b => (
                <TemplateRow
                  key={b.templateId}
                  tpl={b}
                  selected={chosen === b.templateId}
                  onSelect={setChosen}
                  showTier
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-3 border-t border-brand-500/20 space-y-2">
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canSubmit || confirm.isPending}
            onClick={() => confirm.mutate()}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ctl text-[11px] font-medium transition-colors',
              canSubmit
                ? 'bg-brand-500 text-white hover:opacity-90'
                : 'bg-surface-overlay text-text-muted cursor-not-allowed',
              confirm.isPending && 'opacity-60 cursor-wait')}>
            {confirm.isPending
              ? <Loader2 size={11} className="animate-spin" />
              : <Check size={11} />}
            {isOverride ? 'Override and start' : 'Start assessment'}
          </button>
          {chosen == null && (
            <span className="text-[10px] text-text-muted">Pick a template to continue</span>
          )}
          {isOverride && !reason.trim() && (
            <span className="text-[10px] text-status-warn-fg">A reason is required</span>
          )}
        </div>
      </div>
    </div>
  )
}