/**
 * AuditProjectDashboardPage — /audit/projects/:projectId/dashboard
 *
 * Project-level compliance dashboard showing all engagements under a project,
 * their individual compliance scores, findings, and overall programme health.
 *
 * BACKEND ENDPOINTS:
 *   GET /v1/audit/projects/:id              — project header
 *   GET /v1/audit/projects/:id/templates    — planned templates + engagement links
 *   GET /v1/audit/engagements/:id           — per-engagement stats (fetched for each)
 *   GET /v1/audit/engagements/:id/findings  — per-engagement findings
 *   GET /v1/workflow-instances/:wfId/progress — project workflow progress
 */

import { useState, useMemo }    from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery }             from '@tanstack/react-query'
import {
  ArrowLeft, BookOpen, CheckCircle2, XCircle, AlertTriangle,
  Clock, Shield, BarChart2, ChevronRight, Activity,
  FolderKanban, Calendar, User, TrendingUp, FileText,
  Loader2, ExternalLink, Circle, RefreshCw,
} from 'lucide-react'
import { cn }        from '../../lib/cn'
import { auditApi }  from '../../api/audit.api'
import api           from '../../config/axios.config'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (dt) => dt
  ? new Date(dt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—'

const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : 0

const STATUS_CFG = {
  PLANNING:    { label: 'Planning',    color: 'text-text-muted', dot: 'bg-text-muted/40'  },
  FIELDWORK:   { label: 'Fieldwork',  color: 'text-brand-400',  dot: 'bg-brand-400'       },
  DRAFT_REPORT:{ label: 'Draft',      color: 'text-amber-400',  dot: 'bg-amber-400'       },
  CLOSED:      { label: 'Closed',     color: 'text-green-400',  dot: 'bg-green-400'       },
  COMPLETED:   { label: 'Completed',  color: 'text-green-400',  dot: 'bg-green-400'       },
  IN_PROGRESS: { label: 'In progress',color: 'text-brand-400',  dot: 'bg-brand-400'       },
}

const RATING_CFG = {
  EFFECTIVE:           { label: 'Effective',           color: 'text-green-400',  bg: 'bg-green-500/10  border-green-500/30'  },
  PARTIALLY_EFFECTIVE: { label: 'Partially Effective', color: 'text-amber-400',  bg: 'bg-amber-500/10  border-amber-500/30'  },
  INEFFECTIVE:         { label: 'Ineffective',         color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/30'    },
  NOT_RATED:           { label: 'Not Rated',           color: 'text-text-muted', bg: 'bg-surface-overlay border-border'      },
}

// ── Data hooks ────────────────────────────────────────────────────────────────
const useProject = (id) => useQuery({
  queryKey: ['audit-project', id],
  queryFn:  () => auditApi.projects.get(id),
  enabled:  !!id,
})

const useProjectTemplates = (id) => useQuery({
  queryKey: ['audit-project-templates', id],
  queryFn:  () => auditApi.projects.templates.list(id),
  enabled:  !!id,
  select:   d => Array.isArray(d) ? d : (d?.items ?? d?.data ?? []),
})

const useEngagement = (id) => useQuery({
  queryKey: ['audit-engagement', id],
  queryFn:  () => auditApi.engagements.get(id),
  enabled:  !!id,
  staleTime: 60_000,
})

const useEngagementFindings = (id) => useQuery({
  queryKey: ['audit-engagement-findings', id],
  queryFn:  () => api.get(`/v1/audit/engagements/${id}/findings`)
    .then(r => Array.isArray(r) ? r : (r?.data ?? [])),
  enabled:  !!id,
  staleTime: 60_000,
})

// ── Shared components ─────────────────────────────────────────────────────────
function ComplianceRing({ pct: value, size = 64 }) {
  const r     = (size - 8) / 2
  const circ  = 2 * Math.PI * r
  const fill  = circ * (1 - (value ?? 0) / 100)
  const color = (value ?? 0) >= 80 ? '#22c55e' : (value ?? 0) >= 60 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="currentColor" strokeWidth={6}
          className="text-surface-overlay"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={6}
          strokeDasharray={circ}
          strokeDashoffset={fill}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}/>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold tabular-nums"
          style={{ color }}>
          {value != null ? `${value}%` : '—'}
        </span>
      </div>
    </div>
  )
}

function StatusDot({ status }) {
  const cfg = STATUS_CFG[status] || { color: 'text-text-muted', dot: 'bg-text-muted/40' }
  return (
    <span className={cn('flex items-center gap-1.5 text-[11px] font-medium', cfg.color)}>
      <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)}/>
      {cfg.label}
    </span>
  )
}

// ── Programme summary stats ───────────────────────────────────────────────────
function ProgrammeStats({ engagements }) {
  const active    = engagements.filter(e => e.status === 'FIELDWORK' || e.status === 'IN_PROGRESS').length
  const completed = engagements.filter(e => e.status === 'CLOSED' || e.status === 'COMPLETED').length
  const totalCtrl = engagements.reduce((s, e) => s + (e.totalControls ?? 0), 0)
  const passedCtrl= engagements.reduce((s, e) => s + (e.passedControls ?? 0), 0)
  const failedCtrl= engagements.reduce((s, e) => s + (e.failedControls ?? 0), 0)
  const findings  = engagements.reduce((s, e) => s + (e.openFindingCount ?? 0), 0)
  const overallPct= pct(passedCtrl, totalCtrl)

  const stats = [
    { label: 'Engagements',    value: engagements.length,  color: 'text-purple-400', icon: BookOpen },
    { label: 'Active',         value: active,              color: 'text-brand-400',  icon: Activity },
    { label: 'Completed',      value: completed,           color: 'text-green-400',  icon: CheckCircle2 },
    { label: 'Controls passed',value: `${passedCtrl}/${totalCtrl}`, color: 'text-green-400', icon: Shield },
    { label: 'Open findings',  value: findings, color: findings > 0 ? 'text-amber-400' : 'text-green-400', icon: AlertTriangle },
    { label: 'Overall compliance', value: `${overallPct}%`, color: overallPct >= 80 ? 'text-green-400' : overallPct >= 60 ? 'text-amber-400' : 'text-red-400', icon: BarChart2 },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map(s => (
        <div key={s.label} className="bg-surface border border-border rounded-xl px-3 py-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <s.icon size={11} className={s.color}/>
            <span className="text-[9px] text-text-muted uppercase tracking-wide">{s.label}</span>
          </div>
          <p className={cn('text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Single engagement card ────────────────────────────────────────────────────
function EngagementCard({ plannedTemplate }) {
  const navigate = useNavigate()
  const engId    = plannedTemplate.engagementId

  const { data: eng,      isLoading: engLoading  } = useEngagement(engId)
  const { data: findings, isLoading: findLoading } = useEngagementFindings(engId)

  if (!engId) {
    // Not started yet
    return (
      <div className="bg-surface border border-border border-dashed rounded-xl p-4
        flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-surface-overlay border border-border
          flex items-center justify-center shrink-0">
          <BookOpen size={16} className="text-text-muted/50"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">
            {plannedTemplate.templateName}
          </p>
          <p className="text-[11px] text-text-muted mt-0.5">
            {plannedTemplate.frameworkRef || 'Not started'} — engagement not yet created
          </p>
        </div>
        <span className="text-[10px] text-text-muted border border-border px-2 py-1 rounded-full shrink-0">
          Planned
        </span>
      </div>
    )
  }

  if (engLoading) return (
    <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
      <Loader2 size={16} className="text-text-muted animate-spin"/>
      <span className="text-sm text-text-muted">Loading engagement…</span>
    </div>
  )

  const total   = eng?.totalControls ?? 0
  const passed  = eng?.passedControls ?? 0
  const failed  = eng?.failedControls ?? 0
  const compPct = pct(passed, total)
  const testedPct = pct(eng?.testedControls ?? 0, total)
  const openF   = eng?.openFindingCount ?? 0
  const allF    = Array.isArray(findings) ? findings : []
  const bySev   = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  allF.forEach(f => { if (bySev[f.severity] !== undefined) bySev[f.severity]++ })
  const rating  = eng?.overallRating
  const rCfg    = RATING_CFG[rating] || RATING_CFG.NOT_RATED

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden
      hover:border-purple-500/30 transition-colors">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <ComplianceRing pct={compPct}/>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">
                {eng?.name || plannedTemplate.templateName}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] font-mono text-purple-400/70 bg-purple-500/10 px-1.5 py-0.5 rounded">
                  {eng?.frameworkRef || plannedTemplate.frameworkRef || '—'}
                </span>
                <StatusDot status={eng?.status}/>
              </div>
            </div>
            <span className={cn('text-[10px] font-bold border rounded px-1.5 py-0.5 shrink-0', rCfg.bg, rCfg.color)}>
              {rCfg.label}
            </span>
          </div>
        </div>
      </div>

      {/* Progress bars */}
      <div className="px-4 pb-3 space-y-2">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-text-muted">Compliance</span>
            <span className="text-[10px] font-mono text-text-secondary">{passed}/{total} controls</span>
          </div>
          <div className="h-1.5 bg-surface-overlay rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all',
              compPct >= 80 ? 'bg-green-500' : compPct >= 60 ? 'bg-amber-500' : 'bg-red-500')}
              style={{ width: `${compPct}%` }}/>
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-text-muted">Test progress</span>
            <span className="text-[10px] font-mono text-text-secondary">{testedPct}%</span>
          </div>
          <div className="h-1 bg-surface-overlay rounded-full overflow-hidden">
            <div className="h-full bg-brand-500/60 rounded-full transition-all"
              style={{ width: `${testedPct}%` }}/>
          </div>
        </div>
      </div>

      {/* Findings row */}
      {(openF > 0 || allF.length > 0) && (
        <div className="px-4 pb-3 flex items-center gap-3 flex-wrap">
          {['CRITICAL','HIGH','MEDIUM','LOW'].map(sev => bySev[sev] > 0 && (
            <span key={sev} className={cn('text-[10px] font-semibold flex items-center gap-0.5',
              sev === 'CRITICAL' ? 'text-red-400' :
              sev === 'HIGH' ? 'text-orange-400' :
              sev === 'MEDIUM' ? 'text-amber-400' : 'text-text-muted')}>
              {bySev[sev]} {sev.toLowerCase()}
            </span>
          ))}
        </div>
      )}

      {/* Footer links */}
      <div className="px-4 py-2.5 border-t border-border/60 bg-surface-overlay/30
        flex items-center gap-3">
        <button
          onClick={() => navigate(`/audit/engagements/${engId}`)}
          className="text-[10px] text-text-muted hover:text-text-primary flex items-center gap-1 transition-colors">
          <ExternalLink size={10}/>Engagement
        </button>
        <button
          onClick={() => navigate(`/audit/engagements/${engId}/report`)}
          className="text-[10px] text-text-muted hover:text-purple-400 flex items-center gap-1 transition-colors">
          <FileText size={10}/>Report
        </button>
        <span className="text-[10px] text-text-muted ml-auto font-mono">
          {eng?.engagementRef || `ENG-${engId}`}
        </span>
      </div>
    </div>
  )
}

// ── Cross-framework findings matrix ───────────────────────────────────────────
function FindingsMatrix({ plannedTemplates }) {
  const engagements = plannedTemplates.filter(pt => pt.engagementId)
  if (engagements.length === 0) return null

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <h3 className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-2">
        <AlertTriangle size={13} className="text-amber-400"/>
        Cross-Framework Findings Summary
      </h3>
      <div className="space-y-2">
        {engagements.map(pt => (
          <FindingsRow key={pt.engagementId} pt={pt}/>
        ))}
      </div>
    </div>
  )
}

function FindingsRow({ pt }) {
  const { data: eng }      = useEngagement(pt.engagementId)
  const { data: findings } = useEngagementFindings(pt.engagementId)
  const allF  = Array.isArray(findings) ? findings : []
  const open  = allF.filter(f => f.status === 'OPEN' || f.status === 'IN_REMEDIATION').length
  const closed= allF.filter(f => f.status === 'CLOSED').length
  const accepted = allF.filter(f => f.status === 'ACCEPTED_RISK').length

  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-mono text-purple-400/70 w-16 shrink-0">
        {eng?.frameworkRef || pt.frameworkRef || '—'}
      </span>
      <span className="text-[11px] text-text-secondary flex-1 truncate">
        {eng?.name || pt.templateName}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {open > 0 && (
          <span className="text-[10px] text-amber-400 flex items-center gap-1">
            <AlertTriangle size={9}/>{open} open
          </span>
        )}
        {accepted > 0 && (
          <span className="text-[10px] text-text-muted">{accepted} accepted</span>
        )}
        {closed > 0 && (
          <span className="text-[10px] text-green-400">{closed} closed</span>
        )}
        {allF.length === 0 && (
          <span className="text-[10px] text-green-400 flex items-center gap-1">
            <CheckCircle2 size={9}/>No findings
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AuditProjectDashboardPage() {
  const { projectId } = useParams()
  const navigate      = useNavigate()

  const { data: project,   isLoading: projLoading  } = useProject(projectId)
  const { data: templates, isLoading: tmplLoading  } = useProjectTemplates(projectId)

  const planned = templates ?? []

  // Collect engagement stats for programme summary
  const engagementIds = planned.map(pt => pt.engagementId).filter(Boolean)

  // We derive programme stats from engagement cards — each card fetches its own data.
  // For the summary bar, we need aggregated data. Fetch each engagement independently.
  // This is acceptable for project dashboards (typically 2-5 engagements).

  const isLoading = projLoading || tmplLoading

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-text-muted"/>
    </div>
  )

  if (!project) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-text-muted">Project not found</p>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-border bg-surface sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/audit/projects')}
            className="h-8 w-8 flex items-center justify-center rounded-lg
              border border-border hover:border-brand-500/40 text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft size={15}/>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20
              flex items-center justify-center">
              <FolderKanban size={15} className="text-purple-400"/>
            </div>
            <div>
              <h1 className="text-sm font-bold text-text-primary">{project.name}</h1>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-text-muted">{project.projectRef}</span>
                <StatusDot status={project.status}/>
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link to={`/audit/projects/${projectId}`}
              className="text-[11px] text-text-muted hover:text-text-primary flex items-center gap-1
                px-3 py-1.5 rounded-lg border border-border hover:border-brand-500/30 transition-colors">
              <ExternalLink size={11}/>Project detail
            </Link>
          </div>
        </div>

        {/* Project meta */}
        {(project.description || project.plannedStart) && (
          <div className="flex items-center gap-4 mt-2 pl-[44px] flex-wrap">
            {project.description && (
              <p className="text-[11px] text-text-muted max-w-lg truncate">{project.description}</p>
            )}
            {project.plannedStart && (
              <span className="text-[10px] text-text-muted flex items-center gap-1 shrink-0">
                <Calendar size={10}/>{fmt(project.plannedStart)} → {fmt(project.plannedEnd)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">

        {/* ── Programme stats ─────────────────────────────────────────────── */}
        <ProgrammeSummaryStats projectId={projectId} planned={planned}/>

        {/* ── Engagement grid ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-wide">
              Engagements ({planned.length})
            </h2>
            <Link to={`/audit/projects/${projectId}`}
              className="text-[11px] text-text-muted hover:text-brand-400 flex items-center gap-1 transition-colors">
              Manage<ChevronRight size={11}/>
            </Link>
          </div>

          {planned.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center
              border border-dashed border-border rounded-xl">
              <BookOpen size={28} className="text-text-muted/40 mb-3"/>
              <p className="text-sm font-medium text-text-secondary mb-1">No engagements planned</p>
              <p className="text-xs text-text-muted mb-4">Add templates to this project to start engagements</p>
              <Link to={`/audit/projects/${projectId}`}
                className="text-[11px] text-brand-400 hover:text-brand-300 transition-colors">
                Go to project → Add templates
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {planned.map(pt => (
                <EngagementCard key={pt.templateId} plannedTemplate={pt}/>
              ))}
            </div>
          )}
        </div>

        {/* ── Cross-framework findings matrix ─────────────────────────────── */}
        <FindingsMatrix plannedTemplates={planned}/>

      </div>
    </div>
  )
}

// Lazy aggregate stats — fetches each engagement independently
function ProgrammeSummaryStats({ projectId, planned }) {
  const started = planned.filter(pt => pt.engagementId)

  // We render a placeholder stats bar if no engagements started yet
  if (started.length === 0) return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {['Engagements','Active','Completed','Controls','Open findings','Compliance'].map(l => (
        <div key={l} className="bg-surface border border-border rounded-xl px-3 py-3">
          <span className="text-[9px] text-text-muted uppercase tracking-wide block mb-1.5">{l}</span>
          <p className="text-xl font-bold text-text-muted/30">—</p>
        </div>
      ))}
    </div>
  )

  return <ProgrammeStatsLoader engagementIds={started.map(pt => pt.engagementId)}/>
}

function ProgrammeStatsLoader({ engagementIds }) {
  // Fetch all engagements — React Query deduplicates with EngagementCard queries
  const queries = engagementIds.map(id => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useQuery({
      queryKey: ['audit-engagement', id],
      queryFn:  () => auditApi.engagements.get(id),
      staleTime: 60_000,
    })
  })

  const engagements = queries.map(q => q.data).filter(Boolean)

  return <ProgrammeStats engagements={engagements}/>
}