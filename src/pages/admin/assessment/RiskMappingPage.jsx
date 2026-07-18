import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save, AlertCircle, CheckCircle2,
  XCircle, RefreshCw, Info, Plus, Trash2, Layers,
} from 'lucide-react'
import { assessmentsApi } from '../../../api/assessments.api'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'
import toast from 'react-hot-toast'

// ─── Tier style map (purely visual — no score ranges) ────────────────────────

const TIER_STYLE = {
  LOW:      { accent: 'text-status-pass-fg',  bg: 'bg-status-pass-bg',  border: 'border-status-pass-bd',  dot: 'bg-status-pass-fg',  badge: 'bg-status-pass-bg text-status-pass-fg border border-status-pass-bd',  bar: 'bg-status-pass-fg',  ring: 'focus:ring-status-pass-bd'  },
  MEDIUM:   { accent: 'text-status-warn-fg', bg: 'bg-status-warn-bg', border: 'border-status-warn-bd', dot: 'bg-status-warn-fg', badge: 'bg-status-warn-bg text-status-warn-fg border border-status-warn-bd', bar: 'bg-status-warn-fg', ring: 'focus:ring-status-warn-bd' },
  HIGH:     { accent: 'text-status-warn-fg',  bg: 'bg-status-warn-bg',  border: 'border-status-warn-bd',  dot: 'bg-status-warn-fg',  badge: 'bg-status-warn-bg text-status-warn-fg border border-status-warn-bd',  bar: 'bg-status-fail-fg/75',  ring: 'focus:ring-status-warn-bd'  },
  CRITICAL: { accent: 'text-status-fail-fg',    bg: 'bg-status-fail-bg',    border: 'border-status-fail-bd',    dot: 'bg-status-fail-fg',    badge: 'bg-status-fail-bg text-status-fail-fg border border-status-fail-bd',         bar: 'bg-status-fail-fg',    ring: 'focus:ring-status-fail-bd'    },
}
const DEFAULT_STYLE = { accent: 'text-brand-ink', bg: 'bg-brand-500/5', border: 'border-brand-500/20', dot: 'bg-brand-400', badge: 'bg-brand-500/15 text-brand-ink border border-brand-500/25', bar: 'bg-brand-500', ring: 'focus:ring-brand-500/40' }
const tierStyle = (label) => TIER_STYLE[label] || DEFAULT_STYLE

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useMappings = () => useQuery({
  queryKey: ['risk-mappings'],
  queryFn:  () => assessmentsApi.riskMappings.list(),
})

const usePublishedTemplates = () => useQuery({
  queryKey: ['assessment-templates-published'],
  queryFn:  () => assessmentsApi.templates.list({ skip: 0, take: 100, status: 'PUBLISHED' }),
})

const useSaveMappings = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => assessmentsApi.riskMappings.save(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['risk-mappings'] })
      const v = res?.validation || res?.data?.validation
      if (!v || (v.coversFullRange && v.noGaps && v.noOverlaps)) {
        toast.success('Mappings saved')
      } else {
        const issues = []
        if (!v.noGaps)          issues.push('gaps in score range')
        if (!v.noOverlaps)      issues.push('overlapping ranges')
        if (!v.coversFullRange) issues.push('does not cover full 0–100 range')
        toast(`Saved with warnings: ${issues.join(', ')}`, { icon: '⚠️' })
      }
    },
    onError: () => toast.error('Failed to save mappings'),
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveTiers(rows) {
  const map = {}
  rows.forEach(m => {
    const label = m.tierLabel
    if (!label) return
    if (!map[label]) {
      map[label] = { label, minScore: parseFloat(m.minScore), maxScore: parseFloat(m.maxScore), templateIds: [] }
    }
    map[label].minScore = Math.min(map[label].minScore, parseFloat(m.minScore))
    map[label].maxScore = Math.max(map[label].maxScore, parseFloat(m.maxScore))
    if (m.templateId && !map[label].templateIds.includes(String(m.templateId)))
      map[label].templateIds.push(String(m.templateId))
  })
  return Object.values(map).sort((a, b) => a.minScore - b.minScore)
}

// Validate tiers cover 0–100 with no gaps or overlaps.
function validateRanges(tiers) {
  const sorted   = [...tiers].sort((a, b) => a.minScore - b.minScore)
  const errors   = {}
  let noGaps     = true
  let noOverlaps = true

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    if (isNaN(t.minScore) || isNaN(t.maxScore)) {
      errors[t.label] = 'Invalid number'; noGaps = false; continue
    }
    if (t.minScore >= t.maxScore) {
      errors[t.label] = 'Min must be less than max'; noGaps = false; continue
    }
    if (i > 0) {
      const prev = sorted[i - 1]
      const gap  = +(t.minScore - prev.maxScore).toFixed(2)
      if (gap !== 0.01) { noGaps = false; errors[t.label] = `Gap or overlap with ${prev.label}` }
      if (t.minScore <= prev.maxScore) noOverlaps = false
    }
  }
  const coversFullRange = sorted.length > 0
    && sorted[0].minScore === 0
    && sorted[sorted.length - 1].maxScore === 100

  return { noGaps, noOverlaps, coversFullRange, rangeErrors: errors }
}

// ─── TierCard ─────────────────────────────────────────────────────────────────

function TierCard({ tier, rangeError, publishedTemplates, onChange, isFirst, isLast }) {
  const style     = tierStyle(tier.label)
  const filledIds = tier.templateIds.filter(Boolean)

  const set        = (field, val) => onChange({ ...tier, [field]: val })
  const addSlot    = () => set('templateIds', [...tier.templateIds, ''])
  const removeSlot = (idx) => set('templateIds', tier.templateIds.filter((_, i) => i !== idx))
  const updateSlot = (idx, val) => set('templateIds', tier.templateIds.map((v, i) => i === idx ? val : v))
  const usedElsewhere = (idx) => tier.templateIds.filter((v, i) => i !== idx && v !== '')

  return (
    <div className={cn('rounded-card border overflow-hidden', rangeError ? 'border-status-fail-bd' : style.border, style.bg)}>
      {/* Header — label + editable range */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap gap-y-1 min-w-0">
          <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', style.dot)} />
          <span className={cn('text-sm font-bold', style.accent)}>{tier.label}</span>

          {/* Editable score range */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-text-muted">score</span>
            {/* Min — first tier locked to 0 */}
            {isFirst ? (
              <span className="font-mono text-text-muted px-1.5 py-0.5 rounded bg-surface-overlay border border-border">
                {tier.minScore}
              </span>
            ) : (
              <input
                type="number" step="0.01" min="0" max="99.99"
                value={tier.minScore}
                onChange={e => set('minScore', parseFloat(e.target.value))}
                className={cn(
                  'w-16 h-6 text-center font-mono text-xs rounded border bg-surface-raised text-text-primary',
                  'focus:outline-none focus:ring-1 focus:ring-brand-500/50',
                  rangeError ? 'border-status-fail-bd' : 'border-border'
                )}
              />
            )}
            <span className="text-text-muted">–</span>
            {/* Max — last tier locked to 100 */}
            {isLast ? (
              <span className="font-mono text-text-muted px-1.5 py-0.5 rounded bg-surface-overlay border border-border">
                {tier.maxScore}
              </span>
            ) : (
              <input
                type="number" step="0.01" min="0.01" max="100"
                value={tier.maxScore}
                onChange={e => set('maxScore', parseFloat(e.target.value))}
                className={cn(
                  'w-16 h-6 text-center font-mono text-xs rounded border bg-surface-raised text-text-primary',
                  'focus:outline-none focus:ring-1 focus:ring-brand-500/50',
                  rangeError ? 'border-status-fail-bd' : 'border-border'
                )}
              />
            )}
          </div>

          {rangeError && (
            <span className="text-[10px] text-status-fail-fg flex items-center gap-1">
              <AlertCircle size={10} /> {rangeError}
            </span>
          )}
          {!rangeError && filledIds.length > 1 && (
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', style.badge)}>
              {filledIds.length} options · admin chooses at runtime
            </span>
          )}
        </div>
        <Button variant="ghost" size="xs" icon={Plus} onClick={addSlot}
          title="Add another template option for this tier">
          Add option
        </Button>
      </div>

      {/* Template slots */}
      <div className="px-4 py-3 flex flex-col gap-2">
        {tier.templateIds.length === 0 && (
          <button onClick={addSlot}
            className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border rounded-card text-xs text-text-muted hover:text-text-secondary hover:border-border-subtle transition-colors">
            <Plus size={12} /> Assign a template to this tier
          </button>
        )}
        {tier.templateIds.map((tplId, idx) => {
          const taken = usedElsewhere(idx)
          return (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-text-muted w-16 shrink-0 text-right pr-1">
                Option {idx + 1}
              </span>
              <select value={tplId} onChange={e => updateSlot(idx, e.target.value)}
                className={cn(
                  'flex-1 h-8 appearance-none pl-3 pr-2 rounded-ctl border text-xs text-text-primary',
                  'bg-surface-raised focus:outline-none focus:ring-1 transition-colors',
                  !tplId ? 'border-status-fail-bd' : 'border-border', style.ring,
                )}>
                <option value="">Select template…</option>
                {publishedTemplates.map(t => (
                  <option key={t.templateId} value={String(t.templateId)}
                    disabled={taken.includes(String(t.templateId))}>
                    {t.name}{taken.includes(String(t.templateId)) ? ' (already added)' : ''}
                  </option>
                ))}
              </select>
              <button onClick={() => removeSlot(idx)}
                className="h-8 w-8 flex items-center justify-center rounded-ctl text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors shrink-0"
                title="Remove this option">
                <Trash2 size={12} />
              </button>
            </div>
          )
        })}
        {tier.templateIds.length > 0 && (
          <p className="text-[10px] mt-0.5 pl-[4.75rem] flex items-center gap-1 text-text-muted">
            <Info size={10} className={cn('shrink-0', style.accent)} />
            {filledIds.length > 1
              ? 'Org owner / admin will pick one of these when this tier is triggered.'
              : 'Single template — auto-assigned when this tier is triggered.'}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RiskMappingPage() {
  const { data: existing, isLoading: loadingMappings } = useMappings()
  const { data: tplData,  isLoading: loadingTemplates } = usePublishedTemplates()
  const { mutate: save, isPending: saving }             = useSaveMappings()

  const [tiers, setTiers] = useState([])
  const [dirty, setDirty] = useState(false)

  const publishedTemplates = tplData?.items || []

  useEffect(() => {
    if (!existing || existing.length === 0) return
    setTiers(deriveTiers(existing))
    setDirty(true)
  }, [existing])

  const handleTierChange = (updatedTier) => {
    setDirty(true)
    setTiers(prev => prev.map(t => t.label === updatedTier.label ? updatedTier : t))
  }

  const { noGaps, noOverlaps, coversFullRange, rangeErrors } = validateRanges(tiers)
  const allTiersHaveAtLeastOne = tiers.every(t => t.templateIds.filter(Boolean).length > 0)
  const noEmptySlots           = tiers.every(t => t.templateIds.every(v => v !== ''))
  const rangesValid            = noGaps && noOverlaps && coversFullRange && Object.keys(rangeErrors).length === 0
  const isValid                = allTiersHaveAtLeastOne && noEmptySlots && rangesValid

  const handleReset = () => {
    if (existing?.length) { setTiers(deriveTiers(existing)); setDirty(false) }
  }

  const handleSave = () => {
    const mappings = []
    tiers.forEach(tier => {
      tier.templateIds.filter(Boolean).forEach(templateId => {
        mappings.push({ tierLabel: tier.label, minScore: tier.minScore, maxScore: tier.maxScore, templateId: parseInt(templateId) })
      })
    })
    save({ mappings }, { onSuccess: () => setDirty(false) })
  }

  const loading    = loadingMappings || loadingTemplates
  const totalRange = tiers.length ? tiers[tiers.length - 1].maxScore - tiers[0].minScore : 100

  return (
    <PageLayout
      title="Risk → Template Mapping"
      subtitle="Configure score boundaries and templates for each risk tier. Changes take effect on the next vendor assessment."
      actions={
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-status-warn-fg">Unsaved changes</span>}
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={handleReset} title="Discard unsaved changes" />
          <Button size="sm" icon={Save} loading={saving}
            disabled={(!dirty && !isValid) || !publishedTemplates.length}
            onClick={handleSave}>
            Save Mappings
          </Button>
        </div>
      }
    >
      <div className="px-6 py-4 flex flex-col gap-6 max-w-3xl">

        {/* Explainer */}
        <div className="flex items-start gap-3 p-4 bg-surface-overlay rounded-card border border-border">
          <Layers size={15} className="text-brand-ink mt-0.5 shrink-0" />
          <div className="text-xs text-text-muted leading-relaxed space-y-1.5">
            <p>
              <span className="text-text-secondary font-medium">Score-based assignment — </span>
              the system computes a 0–100 risk score per vendor and matches it to the tier whose range contains that score.
              Edit the boundary numbers directly on each tier card — ranges must cover 0–100 with no gaps or overlaps.
              The first tier always starts at 0 and the last always ends at 100.
            </p>
            <p>
              <span className="text-text-secondary font-medium">1 template → </span>auto-assigned.
              &nbsp;<span className="text-text-secondary font-medium">2+ templates → </span>
              the <span className="text-brand-ink font-medium">Org Owner / Org Admin</span> picks one before the assessment starts.
            </p>
          </div>
        </div>

        {/* Live score bar */}
        {tiers.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Range preview</p>
            <div className="h-6 w-full rounded-card overflow-hidden flex text-[10px] font-bold text-on-dark">
              {tiers.map(tier => {
                const style = tierStyle(tier.label)
                const width = Math.max(0, ((tier.maxScore - tier.minScore) / totalRange) * 100)
                return (
                  <div key={tier.label} style={{ width: `${width}%` }}
                    className={cn('flex items-center justify-center transition-all', style.bar)}
                    title={`${tier.label}: ${tier.minScore}–${tier.maxScore}`}>
                    {width > 8 ? tier.label : ''}
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-[10px] text-text-muted mt-1 px-0.5">
              {tiers.map(t => <span key={t.label}>{t.minScore}</span>)}
              <span>{tiers[tiers.length - 1]?.maxScore}</span>
            </div>
          </div>
        )}

        {/* Tier cards */}
        {loading ? (
          <div className="flex flex-col gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-card bg-surface-overlay animate-pulse" />)}
          </div>
        ) : tiers.length === 0 ? (
          <div className="flex items-start gap-3 p-3 bg-status-warn-bg border border-status-warn-bd rounded-card">
            <AlertCircle size={14} className="text-status-warn-fg mt-0.5 shrink-0" />
            <p className="text-xs text-status-warn-fg">No mappings saved yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {tiers.map((tier, idx) => (
              <TierCard
                key={tier.label}
                tier={tier}
                rangeError={rangeErrors[tier.label]}
                publishedTemplates={publishedTemplates}
                onChange={handleTierChange}
                isFirst={idx === 0}
                isLast={idx === tiers.length - 1}
              />
            ))}
          </div>
        )}

        {/* Validation panel */}
        {!loading && tiers.length > 0 && (
          <div className="p-4 rounded-card border border-border bg-surface-overlay">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Validation</p>
            <div className="flex flex-col gap-2">
              {[
                { pass: coversFullRange,        label: 'Ranges cover the full 0–100 scale' },
                { pass: noGaps,                 label: 'No gaps between tier boundaries' },
                { pass: noOverlaps,             label: 'No overlapping ranges' },
                { pass: allTiersHaveAtLeastOne, label: 'Every tier has at least one template' },
                { pass: noEmptySlots,           label: 'No empty template slots' },
              ].map(({ pass, label }, i) => (
                <div key={i} className="flex items-center gap-2">
                  {pass
                    ? <CheckCircle2 size={13} className="text-status-pass-fg shrink-0" />
                    : <XCircle     size={13} className="text-status-fail-fg shrink-0" />}
                  <span className={cn('text-xs', pass ? 'text-text-secondary' : 'text-status-fail-fg')}>{label}</span>
                </div>
              ))}
            </div>
            <p className={cn('text-xs mt-3 flex items-center gap-1.5', isValid ? 'text-status-pass-fg' : 'text-status-warn-fg')}>
              {isValid
                ? <><CheckCircle2 size={12} /> All checks passed — ready to save</>
                : <><AlertCircle  size={12} /> Fix the issues above before saving</>}
            </p>
          </div>
        )}

        {/* Summary table */}
        {!loading && tiers.some(t => t.templateIds.filter(Boolean).length > 0) && (
          <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Summary</p>
            <div className="rounded-card border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-overlay">
                    {['Tier', 'Score range', 'Templates', 'Selection mode'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((tier, i) => {
                    const style = tierStyle(tier.label)
                    const names = tier.templateIds.filter(Boolean).map(id =>
                      publishedTemplates.find(t => String(t.templateId) === id)?.name || `#${id}`
                    )
                    return (
                      <tr key={tier.label} className={cn('border-b last:border-0 border-border', i % 2 === 0 ? 'bg-surface-raised' : 'bg-surface-overlay')}>
                        <td className="px-3 py-2"><span className={cn('font-bold', style.accent)}>{tier.label}</span></td>
                        <td className="px-3 py-2 font-mono text-text-muted">{tier.minScore}–{tier.maxScore}</td>
                        <td className="px-3 py-2 text-text-secondary">
                          {names.length === 0
                            ? <span className="text-status-fail-fg italic">Not configured</span>
                            : names.map((n, ni) => <span key={ni}>{ni > 0 && <span className="text-text-muted mx-1">·</span>}{n}</span>)}
                        </td>
                        <td className="px-3 py-2">
                          {names.length === 0 ? <span className="text-text-muted">—</span>
                            : names.length === 1 ? <span className="text-text-muted">Auto-assigned</span>
                            : <span className="text-brand-ink font-medium">Admin selects</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {publishedTemplates.length === 0 && !loadingTemplates && (
          <div className="flex items-start gap-3 p-3 bg-status-warn-bg border border-status-warn-bd rounded-card">
            <AlertCircle size={14} className="text-status-warn-fg mt-0.5 shrink-0" />
            <p className="text-xs text-status-warn-fg">Publish at least one assessment template before configuring mappings.</p>
          </div>
        )}
      </div>
    </PageLayout>
  )
}