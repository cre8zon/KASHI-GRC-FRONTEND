/**
 * ReportsPage — /reports
 *
 * Module-agnostic GRC reports hub.
 * Architecture: each GRC module registers a descriptor object (MODULE_REGISTRY).
 * Adding a new module = adding one entry. The hub renders it automatically.
 *
 * Live today:    TPRM (Third-Party Risk Management)
 * Coming soon:   Audit, Issues, Controls, Risk Management
 *
 * Route structure:
 *   /reports                      ← this hub
 *   /reports/assessments/:id      ← TPRM report detail (AssessmentReportPage)
 */

import { useState } from 'react'
import { useNavigate }     from 'react-router-dom'
import { useQuery }        from '@tanstack/react-query'
import {
  Shield, BookOpen, AlertTriangle, Lock, BarChart3,
  ChevronRight, CheckCircle2, Clock, XCircle,
  Download, Search, Filter, TrendingUp, TrendingDown,
  Minus, Building2, FileText, Activity, Sparkles,
  ArrowUpRight, Circle
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../config/axios.config'

// ── Design tokens (match existing app CSS vars) ────────────────────────────────
const STATUS_COLOR = {
  COMPLETED: 'text-green-400',
  IN_PROGRESS: 'text-brand-400',
  PENDING: 'text-text-muted',
  CANCELLED: 'text-red-400',
}

const RISK_CONFIG = {
  LOW:      { color: 'text-green-400',  bg: 'bg-green-500/10  border-green-500/30',  dot: 'bg-green-400',  trend: TrendingDown },
  MEDIUM:   { color: 'text-amber-400',  bg: 'bg-amber-500/10  border-amber-500/30',  dot: 'bg-amber-400',  trend: Minus },
  HIGH:     { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', dot: 'bg-orange-400', trend: TrendingUp },
  CRITICAL: { color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/30',    dot: 'bg-red-400',    trend: TrendingUp },
}

// ── Module registry — the ONLY place to add a new module ──────────────────────
const MODULE_REGISTRY = [
  {
    id:          'tprm',
    label:       'Third-Party Risk',
    sublabel:    'Vendor assessments & compliance',
    icon:        Shield,
    color:       'text-brand-400',
    bg:          'bg-brand-500/10 border-brand-500/20',
    activeBg:    'bg-brand-500/15 border-brand-500/40',
    status:      'live',
    detailRoute: (id) => `/reports/assessments/${id}`,
  },
  {
    id:       'audit',
    label:    'Audit Management',
    sublabel: 'Internal audits & findings',
    icon:     BookOpen,
    color:    'text-purple-400',
    bg:       'bg-purple-500/10 border-purple-500/20',
    activeBg: 'bg-purple-500/15 border-purple-500/40',
    status:   'coming_soon',
  },
  {
    id:       'issues',
    label:    'Issue Tracking',
    sublabel: 'Remediation & issue management',
    icon:     AlertTriangle,
    color:    'text-amber-400',
    bg:       'bg-amber-500/10 border-amber-500/20',
    activeBg: 'bg-amber-500/15 border-amber-500/40',
    status:   'coming_soon',
  },
  {
    id:       'controls',
    label:    'Controls Library',
    sublabel: 'Control assessments & gaps',
    icon:     Lock,
    color:    'text-cyan-400',
    bg:       'bg-cyan-500/10 border-cyan-500/20',
    activeBg: 'bg-cyan-500/15 border-cyan-500/40',
    status:   'coming_soon',
  },
  {
    id:       'risk',
    label:    'Risk Register',
    sublabel: 'Risk identification & treatment',
    icon:     BarChart3,
    color:    'text-rose-400',
    bg:       'bg-rose-500/10 border-rose-500/20',
    activeBg: 'bg-rose-500/15 border-rose-500/40',
    status:   'coming_soon',
  },
]

// ── Data hooks ────────────────────────────────────────────────────────────────
const useTPRMReports = () => useQuery({
  queryKey: ['reports-tprm'],
  // axios interceptor already unwraps: response.data?.data ?? response.data
  // so api.get() returns the array directly — no further unwrapping needed
  queryFn:  () => api.get('/v1/assessments').then(r => Array.isArray(r) ? r : (r?.items ?? r?.content ?? [])),
  // NOTE: /v1/assessments returns PaginatedResponse { items: [...], pagination: {...} }
  staleTime: 30_000,
})

// ── TPRM helpers ──────────────────────────────────────────────────────────────
function RiskBadge({ rating, size = 'sm' }) {
  if (!rating) return (
    <span className={cn('inline-flex items-center gap-1 font-mono border rounded',
      size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
      'text-text-muted border-border bg-surface-overlay')}>
      Unrated
    </span>
  )
  const cfg = RISK_CONFIG[rating] || {}
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono font-bold border rounded',
      size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
      cfg.bg, cfg.color)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)}/>
      {rating}
    </span>
  )
}

function ComplianceBar({ pct, size = 'sm' }) {
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className={cn('rounded-full bg-surface-overlay overflow-hidden',
        size === 'sm' ? 'h-1.5 w-20' : 'h-2 w-28')}>
        <div className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${Math.min(pct ?? 0, 100)}%` }}/>
      </div>
      <span className={cn('font-mono font-semibold tabular-nums',
        size === 'sm' ? 'text-[11px]' : 'text-xs', textColor)}>
        {pct != null ? `${pct}%` : '—'}
      </span>
    </div>
  )
}

// ── TPRM summary stats ─────────────────────────────────────────────────────────
function TPRMStats({ assessments }) {
  const total    = assessments.length
  const byRisk   = ['CRITICAL','HIGH','MEDIUM','LOW'].reduce((a,r) => {
    a[r] = assessments.filter(x => x.riskRating === r).length; return a
  }, {})
  const openRem  = assessments.reduce((s,a) => s + (a.openRemediationCount ?? 0), 0)
  const avgPct   = assessments.length > 0
    ? Math.round(assessments.reduce((s,a) => {
        const earned = a.totalEarnedScore ?? 0
        const poss   = a.totalPossibleScore ?? 0
        return s + (poss > 0 ? earned/poss*100 : 0)
      }, 0) / assessments.length)
    : null

  const stats = [
    { label: 'Assessments',     value: total,              color: 'text-brand-400',  icon: FileText },
    { label: 'Critical',        value: byRisk.CRITICAL,    color: 'text-red-400',    icon: XCircle },
    { label: 'High risk',       value: byRisk.HIGH,        color: 'text-orange-400', icon: AlertTriangle },
    { label: 'Low / Medium',    value: (byRisk.LOW||0)+(byRisk.MEDIUM||0), color: 'text-green-400', icon: CheckCircle2 },
    { label: 'Avg compliance',  value: avgPct != null ? `${avgPct}%` : '—', color: 'text-brand-400', icon: Activity },
    { label: 'Open remediations', value: openRem, color: openRem > 0 ? 'text-amber-400' : 'text-green-400', icon: Clock },
  ]

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {stats.map(s => (
        <div key={s.label} className="bg-surface border border-border rounded-xl px-3 py-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <s.icon size={11} className={s.color}/>
            <span className="text-[9px] text-text-muted uppercase tracking-wide leading-none">{s.label}</span>
          </div>
          <p className={cn('text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── TPRM report card ───────────────────────────────────────────────────────────
function TPRMReportCard({ assessment, detailRoute }) {
  const navigate = useNavigate()
  const earned   = assessment.totalEarnedScore ?? 0
  const possible = assessment.totalPossibleScore
  const pct      = possible > 0 ? Math.round(earned / possible * 100) : null
  const remed    = assessment.openRemediationCount ?? 0

  return (
    <div
      onClick={() => navigate(detailRoute(assessment.assessmentId))}
      className="group bg-surface border border-border rounded-xl overflow-hidden
        hover:border-brand-500/40 hover:shadow-lg hover:shadow-brand-500/5
        transition-all duration-200 cursor-pointer"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Building2 size={12} className="text-text-muted shrink-0"/>
            <p className="text-sm font-semibold text-text-primary truncate">
              {assessment.vendorName || `Vendor #${assessment.vendorId}`}
            </p>
            <span className="text-[9px] text-text-muted font-mono shrink-0">
              #{assessment.assessmentId}
            </span>
          </div>
          <p className="text-[11px] text-text-muted truncate pl-[20px]">
            {assessment.templateName}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RiskBadge rating={assessment.riskRating}/>
          <ArrowUpRight size={13} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"/>
        </div>
      </div>

      {/* Compliance bar */}
      <div className="px-4 pb-3">
        <ComplianceBar pct={pct}/>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border/60 bg-surface-overlay/30
        flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('flex items-center gap-1 text-[10px]',
            remed > 0 ? 'text-amber-400' : 'text-green-400')}>
            {remed > 0
              ? <><AlertTriangle size={9}/>{remed} open</>
              : <><CheckCircle2 size={9}/>Clean</>}
          </span>
          <span className={cn('text-[10px]', STATUS_COLOR[assessment.status] || 'text-text-muted')}>
            {assessment.status}
          </span>
        </div>
        {assessment.cycle && (
          <span className="text-[10px] text-text-muted font-mono">
            {assessment.cycle}
          </span>
        )}
      </div>
    </div>
  )
}

// ── TPRM panel ────────────────────────────────────────────────────────────────
function TPRMPanel({ module }) {
  const { data: assessments = [], isLoading } = useTPRMReports()
  const [search,    setSearch]    = useState('')
  const [riskFilter, setRisk]     = useState('all')

  const filtered = assessments.filter(a => {
    const matchSearch = !search ||
      (a.vendorName || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.templateName || '').toLowerCase().includes(search.toLowerCase())
    const matchRisk = riskFilter === 'all' ||
      (riskFilter === 'unrated' ? !a.riskRating : a.riskRating === riskFilter)
    return matchSearch && matchRisk
  })

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin"/>
        <p className="text-sm text-text-muted">Loading assessments…</p>
      </div>
    </div>
  )

  return (
    <div>
      <TPRMStats assessments={assessments}/>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vendor or template…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-surface border border-border rounded-lg
              text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500/50"
          />
        </div>
        <div className="flex items-center gap-1">
          {['all','CRITICAL','HIGH','MEDIUM','LOW','unrated'].map(r => (
            <button key={r}
              onClick={() => setRisk(r)}
              className={cn('text-[10px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors capitalize',
                riskFilter === r
                  ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                  : 'border-border text-text-muted hover:text-text-secondary hover:border-brand-500/20')}>
              {r === 'all' ? 'All' : r.charAt(0) + r.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-text-muted ml-auto shrink-0">
          {filtered.length} of {assessments.length}
        </span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Shield size={32} className="text-text-muted/40 mb-3"/>
          <p className="text-sm font-medium text-text-secondary mb-1">No reports found</p>
          <p className="text-xs text-text-muted">Try adjusting your search or filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(a => (
            <TPRMReportCard key={a.assessmentId} assessment={a} detailRoute={module.detailRoute}/>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Coming soon panel ─────────────────────────────────────────────────────────
function ComingSoonPanel({ module }) {
  const Icon = module.icon
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className={cn('w-16 h-16 rounded-2xl border flex items-center justify-center mb-4', module.bg)}>
        <Icon size={28} className={module.color}/>
      </div>
      <p className="text-base font-semibold text-text-primary mb-1">{module.label}</p>
      <p className="text-sm text-text-muted mb-4 max-w-xs">{module.sublabel}</p>
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
        bg-surface-overlay border border-border text-[11px] text-text-muted">
        <Sparkles size={10} className="text-brand-400"/>
        Coming soon — module in development
      </div>
    </div>
  )
}

// ── Module tab ─────────────────────────────────────────────────────────────────
function ModuleTab({ module, active, onClick }) {
  const Icon = module.icon
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all duration-150',
        active ? module.activeBg : 'border-transparent hover:border-border hover:bg-surface-overlay/50'
      )}
    >
      <div className={cn('w-8 h-8 rounded-lg border flex items-center justify-center shrink-0',
        active ? module.activeBg : module.bg)}>
        <Icon size={15} className={module.color}/>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn('text-xs font-semibold truncate',
            active ? 'text-text-primary' : 'text-text-secondary')}>
            {module.label}
          </span>
          {module.status === 'coming_soon' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-overlay border border-border
              text-text-muted font-medium shrink-0">
              Soon
            </span>
          )}
          {module.status === 'live' && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0"/>
          )}
        </div>
        <p className="text-[10px] text-text-muted truncate">{module.sublabel}</p>
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [activeModule, setActiveModule] = useState('tprm')
  const mod = MODULE_REGISTRY.find(m => m.id === activeModule) || MODULE_REGISTRY[0]
  const Icon = mod.icon

  return (
    <div className="flex h-full overflow-hidden">

      {/* Left sidebar — module switcher */}
      <aside className="w-72 shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="px-4 py-4 border-b border-border">
          <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest">Reports</h2>
          <p className="text-[10px] text-text-muted mt-0.5">GRC modules</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {MODULE_REGISTRY.map(m => (
            <ModuleTab
              key={m.id}
              module={m}
              active={activeModule === m.id}
              onClick={() => setActiveModule(m.id)}
            />
          ))}
        </div>
        <div className="px-4 py-3 border-t border-border">
          <p className="text-[9px] text-text-muted/60 uppercase tracking-wide">KashiGRC Platform</p>
        </div>
      </aside>

      {/* Right content */}
      <main className="flex-1 overflow-y-auto">
        {/* Module header */}
        <div className="px-6 py-5 border-b border-border bg-surface sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center', mod.bg)}>
              <Icon size={17} className={mod.color}/>
            </div>
            <div>
              <h1 className="text-base font-bold text-text-primary">{mod.label} Reports</h1>
              <p className="text-xs text-text-muted">{mod.sublabel}</p>
            </div>
            {mod.status === 'live' && (
              <div className="ml-auto flex items-center gap-1.5 text-[10px] text-green-400 font-medium">
                <Circle size={6} className="fill-green-400"/>Live data
              </div>
            )}
          </div>
        </div>

        {/* Panel */}
        <div className="p-6">
          {mod.status === 'live'
            ? <TPRMPanel module={mod}/>
            : <ComingSoonPanel module={mod}/>}
        </div>
      </main>
    </div>
  )
}