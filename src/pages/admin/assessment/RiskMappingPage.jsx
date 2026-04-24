import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GitMerge, Plus, Trash2, Save, AlertCircle,
  CheckCircle2, XCircle, RefreshCw, ChevronRight, Info
} from 'lucide-react'
import { assessmentsApi } from '../../../api/assessments.api'
import { vendorsApi } from '../../../api/vendors.api'
import { PageLayout, PageSection } from '../../../components/layout/PageLayout'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Card, CardHeader, CardBody } from '../../../components/ui/Card'
import { cn } from '../../../lib/cn'
import toast from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────
const TIER_PRESETS = [
  { label: 'LOW',      color: 'green',  minScore: '0',     maxScore: '25',  icon: '●' },
  { label: 'MEDIUM',   color: 'yellow', minScore: '25.01', maxScore: '60',  icon: '●' },
  { label: 'HIGH',     color: 'amber',  minScore: '60.01', maxScore: '85',  icon: '●' },
  { label: 'CRITICAL', color: 'red',    minScore: '85.01', maxScore: '100', icon: '●' },
]

const TIER_COLOR = { LOW: 'green', MEDIUM: 'yellow', HIGH: 'amber', CRITICAL: 'red' }

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
      if (v?.coversFullRange && v?.noGaps && v?.noOverlaps) {
        toast.success('Risk mappings saved — full 0–100 coverage confirmed')
      } else {
        const issues = []
        if (!v?.noGaps)          issues.push('gaps in score range')
        if (!v?.noOverlaps)      issues.push('overlapping ranges')
        if (!v?.coversFullRange) issues.push('does not cover full 0–100 range')
        toast(`Saved with warnings: ${issues.join(', ')}`, { icon: '⚠️' })
      }
    },
    onError: () => toast.error('Failed to save mappings'),
  })
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RiskMappingPage() {
  const { data: existing, isLoading: loadingMappings } = useMappings()
  const { data: tplData,  isLoading: loadingTemplates } = usePublishedTemplates()
  const { mutate: save, isPending: saving }             = useSaveMappings()

  // Local editable rows: { tierLabel, minScore, maxScore, templateId }
  const [rows, setRows]         = useState([])
  const [dirty, setDirty]       = useState(false)
  const [validation, setValidation] = useState(null)

  const publishedTemplates = tplData?.items || []

  // Seed rows from existing mappings on load
  useEffect(() => {
    if (existing && existing.length > 0) {
      setRows(existing.map(m => ({
        id:         m.mappingId,
        tierLabel:  m.tierLabel || '',
        minScore:   String(m.minScore),
        maxScore:   String(m.maxScore),
        templateId: String(m.templateId),
      })))
    }
  }, [existing])

  // Live validation
  useEffect(() => {
    if (!rows.length) { setValidation(null); return }
    const sorted = [...rows].sort((a, b) => parseFloat(a.minScore) - parseFloat(b.minScore))
    let noGaps = true, noOverlaps = true
    for (let i = 1; i < sorted.length; i++) {
      const prevMax = parseFloat(sorted[i - 1].maxScore)
      const currMin = parseFloat(sorted[i].minScore)
      const gap = +(currMin - prevMax).toFixed(2)
      if (gap !== 0.01) noGaps = false
      if (currMin <= prevMax) noOverlaps = false
    }
    const coversFullRange = sorted.length > 0
      && parseFloat(sorted[0].minScore) === 0
      && parseFloat(sorted[sorted.length - 1].maxScore) === 100
    const allTemplatesSet = rows.every(r => r.templateId)
    setValidation({ noGaps, noOverlaps, coversFullRange, allTemplatesSet })
  }, [rows])

  const addRow = () => {
    setDirty(true)
    setRows(r => [...r, { id: Date.now(), tierLabel: '', minScore: '', maxScore: '', templateId: '' }])
  }

  const removeRow = (id) => { setDirty(true); setRows(r => r.filter(x => x.id !== id)) }

  const updateRow = (id, field, value) => {
    setDirty(true)
    setRows(r => r.map(x => x.id === id ? { ...x, [field]: value } : x))
  }

  const applyPresets = () => {
    setDirty(true)
    setRows(TIER_PRESETS.map((p, i) => ({
      id: i + 1, tierLabel: p.label,
      minScore: p.minScore, maxScore: p.maxScore, templateId: '',
    })))
  }

  const handleSave = () => {
    save({
      mappings: rows.map(r => ({
        minScore:   parseFloat(r.minScore),
        maxScore:   parseFloat(r.maxScore),
        templateId: parseInt(r.templateId),
        tierLabel:  r.tierLabel || undefined,
        tierId:     undefined,
      })),
    }, { onSuccess: () => setDirty(false) })
  }

  const isValid = validation?.noGaps && validation?.noOverlaps
    && validation?.coversFullRange && validation?.allTemplatesSet

  return (
    <PageLayout
      title="Risk → Template Mapping"
      subtitle="Define which assessment template is assigned based on a vendor's risk score"
      actions={
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-400">Unsaved changes</span>}
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => { setDirty(false) }} />
          <Button
            size="sm" icon={Save}
            loading={saving}
            disabled={!dirty || !rows.length}
            onClick={handleSave}
          >
            Save Mappings
          </Button>
        </div>
      }
    >
      <div className="px-6 py-4 flex flex-col gap-6 max-w-4xl">

        {/* How it works */}
        <div className="flex items-start gap-3 p-4 bg-surface-overlay rounded-lg border border-border">
          <Info size={15} className="text-brand-400 mt-0.5 shrink-0" />
          <div className="text-xs text-text-muted leading-relaxed">
            <span className="text-text-secondary font-medium">How this works: </span>
            When a vendor assessment is triggered, the system checks the vendor's current risk score and looks up this table to determine which assessment template to assign. Each range must map to exactly one published template. The ranges must cover the full 0–100 scale with no gaps or overlaps.
          </div>
        </div>

        {/* Quick presets */}
        {rows.length === 0 && !loadingMappings && (
          <div className="flex items-center justify-between p-4 bg-surface-overlay rounded-lg border border-dashed border-border">
            <div>
              <p className="text-sm font-medium text-text-primary">Start with standard risk tiers</p>
              <p className="text-xs text-text-muted mt-0.5">Low (0–25) · Medium (25.01–60) · High (60.01–85) · Critical (85.01–100)</p>
            </div>
            <Button variant="secondary" size="sm" onClick={applyPresets}>Use Presets</Button>
          </div>
        )}

        {/* Mapping rows */}
        {rows.length > 0 && (
          <div className="flex flex-col gap-2">
            {/* Column headers */}
            <div className="grid grid-cols-[120px_1fr_1fr_1fr_36px] gap-3 px-2">
              {['Tier Label', 'Min Score', 'Max Score', 'Template', ''].map(h => (
                <span key={h} className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{h}</span>
              ))}
            </div>

            {rows.map((row, idx) => {
              const templateName = publishedTemplates.find(t => String(t.templateId) === String(row.templateId))?.name
              return (
                <div key={row.id} className={cn(
                  'grid grid-cols-[120px_1fr_1fr_1fr_36px] gap-3 items-center p-3 rounded-lg border transition-colors',
                  'bg-surface-raised border-border hover:border-border-subtle'
                )}>
                  {/* Tier label */}
                  <div className="relative">
                    <select
                      value={row.tierLabel}
                      onChange={e => updateRow(row.id, 'tierLabel', e.target.value)}
                      className="h-8 w-full appearance-none pl-3 pr-6 rounded-md border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="">Custom…</option>
                      {TIER_PRESETS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                    </select>
                    {row.tierLabel && TIER_COLOR[row.tierLabel] && (
                      <span className={cn(
                        'absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none',
                        { 'bg-green-400': TIER_COLOR[row.tierLabel] === 'green',
                          'bg-yellow-400': TIER_COLOR[row.tierLabel] === 'yellow',
                          'bg-amber-400': TIER_COLOR[row.tierLabel] === 'amber',
                          'bg-red-400': TIER_COLOR[row.tierLabel] === 'red' }
                      )} />
                    )}
                  </div>

                  {/* Min score */}
                  <input
                    type="number"
                    step="0.01" min="0" max="100"
                    value={row.minScore}
                    onChange={e => updateRow(row.id, 'minScore', e.target.value)}
                    placeholder="0.00"
                    className="h-8 w-full rounded-md border border-border bg-surface-raised px-3 text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />

                  {/* Max score */}
                  <input
                    type="number"
                    step="0.01" min="0" max="100"
                    value={row.maxScore}
                    onChange={e => updateRow(row.id, 'maxScore', e.target.value)}
                    placeholder="100.00"
                    className="h-8 w-full rounded-md border border-border bg-surface-raised px-3 text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />

                  {/* Template */}
                  <select
                    value={row.templateId}
                    onChange={e => updateRow(row.id, 'templateId', e.target.value)}
                    className={cn(
                      'h-8 w-full appearance-none pl-3 pr-6 rounded-md border text-xs text-text-primary',
                      'bg-surface-raised focus:outline-none focus:ring-1 focus:ring-brand-500',
                      !row.templateId ? 'border-red-500/40' : 'border-border'
                    )}
                  >
                    <option value="">Select template…</option>
                    {publishedTemplates.map(t => (
                      <option key={t.templateId} value={t.templateId}>{t.name}</option>
                    ))}
                  </select>

                  {/* Delete */}
                  <button
                    onClick={() => removeRow(row.id)}
                    className="h-8 w-8 flex items-center justify-center rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}

            <button
              onClick={addRow}
              className="flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-border rounded-lg text-xs text-text-muted hover:text-text-secondary hover:border-border-subtle transition-colors"
            >
              <Plus size={13} /> Add Row
            </button>
          </div>
        )}

        {rows.length === 0 && !loadingMappings && (
          <button
            onClick={addRow}
            className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border rounded-lg text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            <Plus size={14} /> Add Mapping Row
          </button>
        )}

        {/* Validation panel */}
        {validation && rows.length > 0 && (
          <div className="p-4 rounded-lg border border-border bg-surface-overlay">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Validation</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'noGaps',          label: 'No gaps between ranges' },
                { key: 'noOverlaps',      label: 'No overlapping ranges' },
                { key: 'coversFullRange', label: 'Covers full 0–100 range' },
                { key: 'allTemplatesSet', label: 'All rows have a template' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  {validation[key]
                    ? <CheckCircle2 size={13} className="text-green-400 shrink-0" />
                    : <XCircle size={13} className="text-red-400 shrink-0" />
                  }
                  <span className={cn('text-xs', validation[key] ? 'text-text-secondary' : 'text-red-400')}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
            {isValid && (
              <p className="text-xs text-green-400 mt-3 flex items-center gap-1.5">
                <CheckCircle2 size={12} /> All checks passed — ready to save
              </p>
            )}
            {!isValid && (
              <p className="text-xs text-amber-400 mt-3 flex items-center gap-1.5">
                <AlertCircle size={12} /> Fix the issues above before saving
              </p>
            )}
          </div>
        )}

        {/* Visual range bar */}
        {rows.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Score Range Preview</p>
            <div className="h-8 w-full rounded-lg overflow-hidden flex">
              {[...rows]
                .filter(r => r.minScore !== '' && r.maxScore !== '')
                .sort((a, b) => parseFloat(a.minScore) - parseFloat(b.minScore))
                .map((row, i) => {
                  const min  = parseFloat(row.minScore)
                  const max  = parseFloat(row.maxScore)
                  const pct  = ((max - min) / 100) * 100
                  const color = {
                    LOW: 'bg-green-500', MEDIUM: 'bg-yellow-500',
                    HIGH: 'bg-amber-500', CRITICAL: 'bg-red-500',
                  }[row.tierLabel] || 'bg-brand-500'
                  return (
                    <div
                      key={row.id}
                      style={{ width: `${pct}%` }}
                      className={cn('flex items-center justify-center text-[10px] font-bold text-white transition-all', color)}
                      title={`${row.tierLabel || 'Custom'}: ${min}–${max}`}
                    >
                      {pct > 10 ? (row.tierLabel || `${min}–${max}`) : ''}
                    </div>
                  )
                })}
              {/* Gray fill for uncovered ranges */}
              {rows.filter(r => r.minScore !== '' && r.maxScore !== '').length === 0 && (
                <div className="flex-1 bg-surface-overlay" />
              )}
            </div>
            <div className="flex justify-between text-[10px] text-text-muted mt-1">
              <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
            </div>
          </div>
        )}

        {/* No published templates warning */}
        {publishedTemplates.length === 0 && !loadingTemplates && (
          <div className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
            <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-400">No published templates</p>
              <p className="text-xs text-amber-400/70 mt-0.5">
                You need to publish at least one assessment template before configuring mappings.
                Go to Assessment Templates and publish a template first.
              </p>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}