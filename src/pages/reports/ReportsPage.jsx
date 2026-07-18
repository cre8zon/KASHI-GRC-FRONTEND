/**
 * ReportsPage — /reports
 *
 * Module-agnostic GRC reports hub.
 * Architecture: each GRC module registers a descriptor object (MODULE_REGISTRY).
 * Adding a new module = adding one entry. The hub renders it automatically.
 *
 * Live today:    TPRM (Third-Party Risk Management), Audit Management
 * Coming soon:   Issues, Controls, Risk Management
 *
 * Route structure:
 *   /reports                        ← this hub
 *   /reports/assessments/:id        ← TPRM report detail (AssessmentReportPage)
 *   /audit/engagements/:id/report   ← Audit report detail (AuditReportPage)
 */

import { useState }       from 'react'
import { useNavigate }    from 'react-router-dom'
import { useQuery }       from '@tanstack/react-query'
import {
  Shield, BookOpen, AlertTriangle, Lock, BarChart3,
  ChevronRight, CheckCircle2, Clock, XCircle,
  Download, Search, Filter, TrendingUp, TrendingDown,
  Minus, Building2, FileText, Activity, Sparkles,
  ArrowUpRight, Circle, FolderKanban, BarChart2,
} from 'lucide-react'
import { cn }          from '../../lib/cn'
import api             from '../../config/axios.config'
import { auditApi }    from '../../api/audit.api'

// ── Design tokens ─────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  COMPLETED:   'text-status-pass-fg',
  IN_PROGRESS: 'text-brand-ink',
  PENDING:     'text-text-muted',
  CANCELLED:   'text-status-fail-fg',
  PLANNING:    'text-text-muted',
  FIELDWORK:   'text-brand-ink',
  CLOSED:      'text-status-pass-fg',
}

const RATING_CONFIG = {
  EFFECTIVE:           { label: 'Effective',           color: 'text-status-pass-fg',  bg: 'bg-status-pass-bg  border-status-pass-bd'  },
  PARTIALLY_EFFECTIVE: { label: 'Partially Effective', color: 'text-status-warn-fg',  bg: 'bg-status-warn-bg  border-status-warn-bd'  },
  INEFFECTIVE:         { label: 'Ineffective',         color: 'text-status-fail-fg',    bg: 'bg-status-fail-bg    border-status-fail-bd'    },
  NOT_RATED:           { label: 'Not Rated',           color: 'text-text-muted', bg: 'bg-surface-overlay border-border'      },
}

const RISK_CONFIG = {
  LOW:      { color: 'text-status-pass-fg',  bg: 'bg-status-pass-bg  border-status-pass-bd',  dot: 'bg-status-pass-bg',  trend: TrendingDown },
  MEDIUM:   { color: 'text-status-warn-fg',  bg: 'bg-status-warn-bg  border-status-warn-bd',  dot: 'bg-status-warn-bg',  trend: Minus },
  HIGH:     { color: 'text-status-warn-fg', bg: 'bg-status-warn-bg border-status-warn-bd', dot: 'bg-status-warn-bg', trend: TrendingUp },
  CRITICAL: { color: 'text-status-fail-fg',    bg: 'bg-status-fail-bg    border-status-fail-bd',    dot: 'bg-status-fail-bg',    trend: TrendingUp },
}

// ── Module registry ────────────────────────────────────────────────────────────
const MODULE_REGISTRY = [
  {
    id:          'tprm',
    label:       'Third-Party Risk',
    sublabel:    'Vendor assessments & compliance',
    icon:        Shield,
    color:       'text-brand-ink',
    bg:          'bg-brand-500/10 border-brand-500/20',
    activeBg:    'bg-brand-500/15 border-brand-500/40',
    status:      'live',
    detailRoute: (id) => `/reports/assessments/${id}`,
  },
  {
    id:          'audit',
    label:       'Audit Management',
    sublabel:    'Internal audits & findings',
    icon:        BookOpen,
    color:       'text-status-tag-fg',
    bg:          'bg-status-tag-bg border-status-tag-bd',
    activeBg:    'bg-status-tag-bg border-status-tag-bd',
    status:      'live',
    detailRoute: (id) => `/audit/engagements/${id}/report`,
  },
  {
    id:          'programmes',
    label:       'Audit Programmes',
    sublabel:    'Project instances & programme health',
    icon:        FolderKanban,
    color:       'text-status-tag-fg',
    bg:          'bg-status-tag-bg border-status-tag-bd',
    activeBg:    'bg-status-tag-bg border-status-tag-bd',
    status:      'live',
    dashboardRoute: (instanceId) => `/audit/programme/${instanceId}/dashboard`,
    reportRoute:    (instanceId) => `/audit/programme/${instanceId}/report`,
  },
  {
    id:       'issues',
    label:    'Issue Tracking',
    sublabel: 'Remediation & issue management',
    icon:     AlertTriangle,
    color:    'text-status-warn-fg',
    bg:       'bg-status-warn-bg border-status-warn-bd',
    activeBg: 'bg-status-warn-bg border-status-warn-bd',
    status:   'coming_soon',
  },
  {
    id:       'controls',
    label:    'Controls Library',
    sublabel: 'Control assessments & gaps',
    icon:     Lock,
    color:    'text-status-info-fg',
    bg:       'bg-status-info-bg border-status-info-bd',
    activeBg: 'bg-status-info-bg border-status-info-bd',
    status:   'coming_soon',
  },
  {
    id:       'risk',
    label:    'Risk Register',
    sublabel: 'Risk identification & treatment',
    icon:     BarChart3,
    color:    'text-status-fail-fg',
    bg:       'bg-status-fail-bg border-status-fail-bd',
    activeBg: 'bg-status-fail-bg border-status-fail-bd',
    status:   'coming_soon',
  },
]

// ── Shared components ─────────────────────────────────────────────────────────
function ComplianceBar({ pct, size = 'sm' }) {
  const color = pct >= 80 ? 'bg-status-pass-bg' : pct >= 60 ? 'bg-status-warn-bg' : 'bg-status-fail-bg'
  const textColor = pct >= 80 ? 'text-status-pass-fg' : pct >= 60 ? 'text-status-warn-fg' : 'text-status-fail-fg'
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

function RatingBadge({ rating }) {
  const cfg = RATING_CONFIG[rating] || RATING_CONFIG.NOT_RATED
  return (
    <span className={cn('inline-flex items-center font-mono font-bold border rounded text-[10px] px-2 py-0.5',
      cfg.bg, cfg.color)}>
      {cfg.label}
    </span>
  )
}

// ── TPRM data + components ────────────────────────────────────────────────────
const useTPRMReports = () => useQuery({
  queryKey: ['reports-tprm'],
  queryFn:  () => api.get('/v1/assessments').then(r => Array.isArray(r) ? r : (r?.items ?? r?.content ?? [])),
  staleTime: 30_000,
})

function TPRMStats({ assessments }) {
  const total   = assessments.length
  const byRisk  = ['CRITICAL','HIGH','MEDIUM','LOW'].reduce((a,r) => {
    a[r] = assessments.filter(x => x.riskRating === r).length; return a
  }, {})
  const openRem = assessments.reduce((s,a) => s + (a.openRemediationCount ?? 0), 0)
  const avgPct  = assessments.length > 0
    ? Math.round(assessments.reduce((s,a) => {
        const earned = a.totalEarnedScore ?? 0
        const poss   = a.totalPossibleScore ?? 0
        return s + (poss > 0 ? earned/poss*100 : 0)
      }, 0) / assessments.length)
    : null

  const stats = [
    { label: 'Assessments',     value: total,           color: 'text-brand-ink',  icon: FileText },
    { label: 'Critical',        value: byRisk.CRITICAL, color: 'text-status-fail-fg',    icon: XCircle },
    { label: 'High risk',       value: byRisk.HIGH,     color: 'text-status-warn-fg', icon: AlertTriangle },
    { label: 'Low / Medium',    value: (byRisk.LOW||0)+(byRisk.MEDIUM||0), color: 'text-status-pass-fg', icon: CheckCircle2 },
    { label: 'Avg compliance',  value: avgPct != null ? `${avgPct}%` : '—', color: 'text-brand-ink', icon: Activity },
    { label: 'Open remediations', value: openRem, color: openRem > 0 ? 'text-status-warn-fg' : 'text-status-pass-fg', icon: Clock },
  ]

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {stats.map(s => (
        <div key={s.label} className="bg-surface border border-border rounded-card px-3 py-3">
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

function TPRMReportCard({ assessment, detailRoute }) {
  const navigate = useNavigate()
  const earned   = assessment.totalEarnedScore ?? 0
  const possible = assessment.totalPossibleScore
  const pct      = possible > 0 ? Math.round(earned / possible * 100) : null
  const remed    = assessment.openRemediationCount ?? 0

  return (
    <div
      onClick={() => navigate(detailRoute(assessment.assessmentId))}
      className="group bg-surface border border-border rounded-card overflow-hidden
        hover:border-brand-500/40 hover:shadow-lg hover:shadow-brand-500/5
        transition-all duration-200 cursor-pointer"
    >
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
      <div className="px-4 pb-3">
        <ComplianceBar pct={pct}/>
      </div>
      <div className="px-4 py-2.5 border-t border-border/60 bg-surface-overlay/30
        flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={cn('flex items-center gap-1 text-[10px]',
            remed > 0 ? 'text-status-warn-fg' : 'text-status-pass-fg')}>
            {remed > 0
              ? <><AlertTriangle size={9}/>{remed} open</>
              : <><CheckCircle2 size={9}/>Clean</>}
          </span>
          <span className={cn('text-[10px]', STATUS_COLOR[assessment.status] || 'text-text-muted')}>
            {assessment.status}
          </span>
        </div>
        {assessment.cycle && (
          <span className="text-[10px] text-text-muted font-mono">{assessment.cycle}</span>
        )}
      </div>
    </div>
  )
}

function TPRMPanel({ module }) {
  const { data: assessments = [], isLoading } = useTPRMReports()
  const [search, setSearch]       = useState('')
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
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search vendor or template…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-surface border border-border rounded-card
              text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500/50"/>
        </div>
        <div className="flex items-center gap-1">
          {['all','CRITICAL','HIGH','MEDIUM','LOW','unrated'].map(r => (
            <button key={r} onClick={() => setRisk(r)}
              className={cn('text-[10px] font-medium px-2.5 py-1.5 rounded-card border transition-colors capitalize',
                riskFilter === r
                  ? 'bg-brand-500/15 border-brand-500/40 text-brand-ink'
                  : 'border-border text-text-muted hover:text-text-secondary hover:border-brand-500/20')}>
              {r === 'all' ? 'All' : r.charAt(0) + r.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-text-muted ml-auto shrink-0">
          {filtered.length} of {assessments.length}
        </span>
      </div>
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

// ── AUDIT data + components ───────────────────────────────────────────────────
const useAuditEngagements = () => useQuery({
  queryKey: ['reports-audit-engagements'],
  queryFn:  () => auditApi.engagements.list({ take: 100 })
    .then(r => Array.isArray(r) ? r : (r?.items ?? r?.data?.items ?? r?.data ?? [])),
  staleTime: 30_000,
})

function AuditStats({ engagements }) {
  const total      = engagements.length
  const active     = engagements.filter(e => e.status === 'FIELDWORK' || e.status === 'IN_PROGRESS').length
  const closed     = engagements.filter(e => e.status === 'CLOSED' || e.status === 'COMPLETED').length
  const findings   = engagements.reduce((s, e) => s + (e.openFindingCount ?? 0), 0)
  const avgPassed  = engagements.length > 0
    ? Math.round(engagements.reduce((s, e) => {
        const t = e.totalControls ?? 0; const p = e.passedControls ?? 0
        return s + (t > 0 ? p / t * 100 : 0)
      }, 0) / engagements.length)
    : null

  const stats = [
    { label: 'Engagements',    value: total,                           color: 'text-status-tag-fg', icon: BookOpen },
    { label: 'Active',         value: active,                          color: 'text-brand-ink',  icon: Activity },
    { label: 'Completed',      value: closed,                          color: 'text-status-pass-fg',  icon: CheckCircle2 },
    { label: 'Open findings',  value: findings,                        color: findings > 0 ? 'text-status-warn-fg' : 'text-status-pass-fg', icon: AlertTriangle },
    { label: 'Avg compliance', value: avgPassed != null ? `${avgPassed}%` : '—', color: 'text-status-tag-fg', icon: BarChart2 },
    { label: 'Frameworks',     value: new Set(engagements.map(e => e.frameworkRef).filter(Boolean)).size, color: 'text-status-info-fg', icon: Shield },
  ]

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {stats.map(s => (
        <div key={s.label} className="bg-surface border border-border rounded-card px-3 py-3">
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

function AuditEngagementCard({ engagement, detailRoute }) {
  const navigate    = useNavigate()
  const total       = engagement.totalControls ?? 0
  const passed      = engagement.passedControls ?? 0
  const failed      = engagement.failedControls ?? 0
  const openFindings= engagement.openFindingCount ?? 0
  const pct         = total > 0 ? Math.round(passed / total * 100) : null

  return (
    <div
      onClick={() => navigate(detailRoute(engagement.id))}
      className="group bg-surface border border-border rounded-card overflow-hidden
        hover:border-status-tag-bd hover:shadow-lg hover:shadow-elevated
        transition-all duration-200 cursor-pointer"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <BookOpen size={12} className="text-text-muted shrink-0"/>
            <p className="text-sm font-semibold text-text-primary truncate">
              {engagement.name || `Engagement #${engagement.id}`}
            </p>
          </div>
          <div className="flex items-center gap-2 pl-[20px]">
            <span className="text-[10px] font-mono text-status-tag-fg bg-status-tag-bg px-1.5 py-0.5 rounded">
              {engagement.frameworkRef || 'UNKNOWN'}
            </span>
            <span className="text-[10px] text-text-muted">{engagement.engagementRef}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {engagement.overallRating && <RatingBadge rating={engagement.overallRating}/>}
          <ArrowUpRight size={13} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"/>
        </div>
      </div>

      {/* Compliance bar */}
      <div className="px-4 pb-3">
        <ComplianceBar pct={pct}/>
      </div>

      {/* Stats row */}
      <div className="px-4 pb-3 flex items-center gap-4">
        <span className="text-[10px] text-text-muted">
          <span className="text-status-pass-fg font-mono font-semibold">{passed}</span>
          <span className="text-text-muted/60">/{total}</span> passed
        </span>
        {failed > 0 && (
          <span className="text-[10px] text-status-fail-fg font-mono font-semibold">{failed} failed</span>
        )}
        {openFindings > 0 && (
          <span className="text-[10px] text-status-warn-fg flex items-center gap-1">
            <AlertTriangle size={9}/>{openFindings} finding{openFindings !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border/60 bg-surface-overlay/30
        flex items-center justify-between">
        <span className={cn('text-[10px]', STATUS_COLOR[engagement.status] || 'text-text-muted')}>
          {engagement.status}
        </span>
        {engagement.auditType && (
          <span className="text-[10px] text-text-muted font-mono">{engagement.auditType}</span>
        )}
      </div>
    </div>
  )
}

function AuditPanel({ module }) {
  const { data: engagements = [], isLoading } = useAuditEngagements()
  const [search,        setSearch]       = useState('')
  const [statusFilter,  setStatus]       = useState('all')
  const [frameworkFilter, setFramework]  = useState('all')

  const frameworks = [...new Set(engagements.map(e => e.frameworkRef).filter(Boolean))]

  const filtered = engagements.filter(e => {
    const matchSearch = !search ||
      (e.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.engagementRef || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.frameworkRef || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || e.status === statusFilter
    const matchFramework = frameworkFilter === 'all' || e.frameworkRef === frameworkFilter
    return matchSearch && matchStatus && matchFramework
  })

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-status-tag-bd border-t-purple-500 animate-spin"/>
        <p className="text-sm text-text-muted">Loading audit reports…</p>
      </div>
    </div>
  )

  return (
    <div>
      <AuditStats engagements={engagements}/>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search engagement or framework…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-surface border border-border rounded-card
              text-text-primary placeholder-text-muted focus:outline-none focus:border-status-tag-bd"/>
        </div>
        {frameworks.length > 0 && (
          <div className="flex items-center gap-1">
            {['all', ...frameworks].map(f => (
              <button key={f} onClick={() => setFramework(f)}
                className={cn('text-[10px] font-medium px-2.5 py-1.5 rounded-card border transition-colors',
                  frameworkFilter === f
                    ? 'bg-status-tag-bg border-status-tag-bd text-status-tag-fg'
                    : 'border-border text-text-muted hover:border-status-tag-bd')}>
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          {['all','PLANNING','FIELDWORK','CLOSED'].map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={cn('text-[10px] font-medium px-2.5 py-1.5 rounded-card border transition-colors capitalize',
                statusFilter === s
                  ? 'bg-status-tag-bg border-status-tag-bd text-status-tag-fg'
                  : 'border-border text-text-muted hover:border-status-tag-bd')}>
              {s === 'all' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-text-muted ml-auto shrink-0">
          {filtered.length} of {engagements.length}
        </span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BookOpen size={32} className="text-text-muted/40 mb-3"/>
          <p className="text-sm font-medium text-text-secondary mb-1">No audit engagements found</p>
          <p className="text-xs text-text-muted">Create an engagement under Compliance → SOC 2 Engagements</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(e => (
            <AuditEngagementCard key={e.id} engagement={e} detailRoute={module.detailRoute}/>
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
      <div className={cn('w-16 h-16 rounded-modal border flex items-center justify-center mb-4', module.bg)}>
        <Icon size={28} className={module.color}/>
      </div>
      <p className="text-base font-semibold text-text-primary mb-1">{module.label}</p>
      <p className="text-sm text-text-muted mb-4 max-w-xs">{module.sublabel}</p>
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
        bg-surface-overlay border border-border text-[11px] text-text-muted">
        <Sparkles size={10} className="text-brand-ink"/>
        Coming soon — module in development
      </div>
    </div>
  )
}

// ── Module tab ────────────────────────────────────────────────────────────────
function ModuleTab({ module, active, onClick }) {
  const Icon = module.icon
  return (
    <button onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2.5 rounded-card border text-left transition-all duration-150',
        active ? module.activeBg : 'border-transparent hover:border-border hover:bg-surface-overlay/50'
      )}>
      <div className={cn('w-8 h-8 rounded-card border flex items-center justify-center shrink-0',
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
            <span className="w-1.5 h-1.5 rounded-full bg-status-pass-bg shrink-0"/>
          )}
        </div>
        <p className="text-[10px] text-text-muted truncate">{module.sublabel}</p>
      </div>
    </button>
  )
}

// ── Panel router ──────────────────────────────────────────────────────────────
// ── AUDIT PROGRAMMES data + components ───────────────────────────────────────
const useProjectInstances = () => useQuery({
  queryKey: ['reports-project-instances'],
  queryFn:  () => api.get('/v1/audit/project-instances')
    .then(r => Array.isArray(r) ? r : (r?.items ?? r?.data?.items ?? r?.data ?? [])),
  staleTime: 30_000,
})

function ProgrammeInstanceCard({ instance, module }) {
  const navigate = useNavigate()
  const engs     = instance.engagementCount ?? instance.engagements?.length ?? 0
  const passed   = instance.passedControls  ?? 0
  const total    = instance.totalControls   ?? 0
  const findings = instance.openFindingCount ?? 0
  const pct      = total > 0 ? Math.round(passed / total * 100) : null
  const status   = instance.status ?? 'IN_PROGRESS'

  const STATUS_COLOR = {
    IN_PROGRESS: 'text-brand-ink bg-brand-500/10 border-brand-500/20',
    COMPLETED:   'text-status-pass-fg bg-status-pass-bg border-status-pass-bd',
    ON_HOLD:     'text-status-warn-fg bg-status-warn-bg border-status-warn-bd',
    CANCELLED:   'text-status-fail-fg bg-status-fail-bg border-status-fail-bd',
  }

  return (
    <div className="bg-surface border border-border rounded-card overflow-hidden hover:border-status-tag-bd hover:shadow-lg hover:shadow-elevated transition-all duration-200">
      <div
        onClick={() => navigate(module.reportRoute(instance.id))}
        className="px-4 pt-4 pb-3 flex items-start justify-between gap-3 cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <FolderKanban size={12} className="text-text-muted shrink-0"/>
            <p className="text-sm font-semibold text-text-primary truncate">
              {instance.projectNameSnapshot || `Programme #${instance.id}`}
            </p>
          </div>
          <div className="flex items-center gap-2 pl-[20px]">
            <span className="text-[10px] font-mono text-status-tag-fg bg-status-tag-bg px-1.5 py-0.5 rounded">
              {instance.instanceRef || instance.projectRefSnapshot || '—'}
            </span>
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border', STATUS_COLOR[status] || STATUS_COLOR.IN_PROGRESS)}>
              {status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
        <ChevronRight size={14} className="text-text-muted shrink-0 mt-0.5"/>
      </div>

      {pct != null && (
        <div className="px-4 pb-2 cursor-pointer" onClick={() => navigate(module.reportRoute(instance.id))}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-text-muted">Control compliance</span>
            <span className={cn('text-[11px] font-bold tabular-nums', pct >= 80 ? 'text-status-pass-fg' : pct >= 50 ? 'text-status-warn-fg' : 'text-status-fail-fg')}>{pct}%</span>
          </div>
          <div className="h-1.5 bg-surface-overlay rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', pct >= 80 ? 'bg-status-pass-bg' : pct >= 50 ? 'bg-status-warn-bg' : 'bg-status-fail-bg')}
              style={{ width: `${pct}%` }}/>
          </div>
        </div>
      )}

      <div className="px-4 py-2.5 border-t border-border/50 flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1 text-[10px] text-text-muted">
          <BookOpen size={10}/>{engs} engagement{engs !== 1 ? 's' : ''}
        </span>
        {total > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-text-muted">
            <CheckCircle2 size={10} className="text-status-pass-fg"/>{passed}/{total}
          </span>
        )}
        {findings > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-status-warn-fg">
            <AlertTriangle size={10}/>{findings}
          </span>
        )}
        {/* Secondary: dashboard link */}
        <button
          onClick={(e) => { e.stopPropagation(); navigate(module.dashboardRoute(instance.id)) }}
          className="ml-auto text-[10px] text-text-muted hover:text-status-tag-fg transition-colors flex items-center gap-0.5"
        >
          <BarChart2 size={9}/> Dashboard
        </button>
      </div>
    </div>
  )
}

function ProgrammesPanel({ module }) {
  const { data: instances = [], isLoading } = useProjectInstances()
  const [search, setSearch] = useState('')

  const filtered = instances.filter(i =>
    !search ||
    (i.projectNameSnapshot || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.instanceRef || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.projectRefSnapshot || '').toLowerCase().includes(search.toLowerCase())
  )

  const active    = instances.filter(i => i.status === 'IN_PROGRESS').length
  const completed = instances.filter(i => i.status === 'COMPLETED').length
  const totalCtrl = instances.reduce((s, i) => s + (i.totalControls ?? 0), 0)
  const passedCtrl= instances.reduce((s, i) => s + (i.passedControls ?? 0), 0)

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-status-tag-bd border-t-indigo-500 animate-spin"/>
        <p className="text-sm text-text-muted">Loading programme reports…</p>
      </div>
    </div>
  )

  return (
    <div>
      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Programmes',   value: instances.length, color: 'text-status-tag-fg', icon: FolderKanban },
          { label: 'Active',       value: active,           color: 'text-brand-ink',  icon: Activity },
          { label: 'Completed',    value: completed,        color: 'text-status-pass-fg',  icon: CheckCircle2 },
          { label: 'Avg compliance', value: totalCtrl > 0 ? `${Math.round(passedCtrl / totalCtrl * 100)}%` : '—', color: 'text-status-tag-fg', icon: BarChart2 },
        ].map(s => (
          <div key={s.label} className="bg-surface border border-border rounded-card px-3 py-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <s.icon size={11} className={s.color}/>
              <span className="text-[9px] text-text-muted uppercase tracking-wide leading-none">{s.label}</span>
            </div>
            <p className={cn('text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search programme…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-surface border border-border rounded-card
              text-text-primary placeholder-text-muted focus:outline-none focus:border-status-tag-bd"/>
        </div>
        <span className="text-[11px] text-text-muted ml-auto shrink-0">
          {filtered.length} of {instances.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FolderKanban size={32} className="text-text-muted/40 mb-3"/>
          <p className="text-sm font-medium text-text-secondary mb-1">No programme instances found</p>
          <p className="text-xs text-text-muted">Start a project from Audit Programmes → Projects</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(i => (
            <ProgrammeInstanceCard key={i.id} instance={i} module={module}/>
          ))}
        </div>
      )}
    </div>
  )
}

function ModulePanel({ module }) {
  if (module.status !== 'live') return <ComingSoonPanel module={module}/>
  switch (module.id) {
    case 'tprm':        return <TPRMPanel        module={module}/>
    case 'audit':       return <AuditPanel       module={module}/>
    case 'programmes':  return <ProgrammesPanel  module={module}/>
    default:            return <ComingSoonPanel  module={module}/>
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [activeModule, setActiveModule] = useState('tprm')
  const mod  = MODULE_REGISTRY.find(m => m.id === activeModule) || MODULE_REGISTRY[0]
  const Icon = mod.icon

  return (
    <div className="flex h-full overflow-hidden">

      {/* Left sidebar */}
      <aside className="w-72 shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="px-4 py-4 border-b border-border">
          <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest">Reports</h2>
          <p className="text-[10px] text-text-muted mt-0.5">GRC modules</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {MODULE_REGISTRY.map(m => (
            <ModuleTab key={m.id} module={m} active={activeModule === m.id}
              onClick={() => setActiveModule(m.id)}/>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-border">
          <p className="text-[9px] text-text-muted/60 uppercase tracking-wide">KashiGRC Platform</p>
        </div>
      </aside>

      {/* Right content */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-6 py-5 border-b border-border bg-surface sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-card border flex items-center justify-center', mod.bg)}>
              <Icon size={17} className={mod.color}/>
            </div>
            <div>
              <h1 className="text-base font-bold text-text-primary">{mod.label} Reports</h1>
              <p className="text-xs text-text-muted">{mod.sublabel}</p>
            </div>
            {mod.status === 'live' && (
              <div className="ml-auto flex items-center gap-1.5 text-[10px] text-status-pass-fg font-medium">
                <Circle size={6} className="fill-status-pass-fg"/>Live data
              </div>
            )}
          </div>
        </div>
        <div className="p-6">
          <ModulePanel module={mod}/>
        </div>
      </main>
    </div>
  )
}