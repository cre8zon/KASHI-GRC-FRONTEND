/**
 * AuditProjectDashboardPage — /audit/programme/:instanceId/dashboard
 *
 * Programme-level dashboard for an AuditProjectInstance.
 * Uses GET /v1/audit/project-instances/:id/report-data — a single endpoint
 * that aggregates all engagement stats — to avoid calling useQuery in a loop
 * (Rules of Hooks violation that caused the original error).
 *
 * Sections:
 *   1. Header — instance ref, project name, status, period
 *   2. Programme stats — compliance %, control counts, findings
 *   3. Framework coverage — one row per engagement with pass bar
 *   4. Engagement cards — per-engagement detail with controls/findings
 *   5. Cross-framework findings matrix
 *
 * ALSO handles the legacy route /audit/projects/:projectId/dashboard —
 * in that case projectId IS the instance id (blueprint 11 uses project-instances API).
 */

import { useState }              from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery }              from '@tanstack/react-query'
import {
  ArrowLeft, BookOpen, CheckCircle2, XCircle, AlertTriangle,
  Shield, BarChart2, ChevronRight, Activity,
  FolderKanban, Calendar, FileText,
  Loader2, ExternalLink, Circle,
} from 'lucide-react'
import { cn }    from '../../lib/cn'
import api       from '../../config/axios.config'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (dt) => dt
  ? new Date(dt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—'

const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : 0

const STATUS_CFG = {
  IN_PROGRESS:  { label: 'In progress', color: 'text-brand-400',  dot: 'bg-brand-400'  },
  COMPLETED:    { label: 'Completed',   color: 'text-status-pass-fg',  dot: 'bg-status-pass-bg'  },
  ON_HOLD:      { label: 'On hold',     color: 'text-status-warn-fg',  dot: 'bg-status-warn-bg'  },
  PLANNING:     { label: 'Planning',    color: 'text-text-muted', dot: 'bg-text-muted/40' },
  FIELDWORK:    { label: 'Fieldwork',   color: 'text-brand-400',  dot: 'bg-brand-400'  },
  DRAFT_REPORT: { label: 'Draft',       color: 'text-status-warn-fg',  dot: 'bg-status-warn-bg'  },
  CLOSED:       { label: 'Closed',      color: 'text-status-pass-fg',  dot: 'bg-status-pass-bg'  },
  FINAL_REPORT: { label: 'Final report',color: 'text-status-tag-fg', dot: 'bg-status-tag-bg' },
}

const RESULT_CFG = {
  EFFECTIVE:           { label: 'Effective',     color: 'text-status-pass-fg', bg: 'bg-status-pass-bg border-status-pass-bd' },
  PARTIALLY_EFFECTIVE: { label: 'Partial',       color: 'text-status-warn-fg', bg: 'bg-status-warn-bg border-status-warn-bd' },
  INEFFECTIVE:         { label: 'Ineffective',   color: 'text-status-fail-fg',   bg: 'bg-status-fail-bg   border-status-fail-bd'  },
  NOT_TESTED:          { label: 'Not tested',    color: 'text-text-muted',bg: 'bg-surface-overlay border-border'   },
}

// ── Single data fetch ─────────────────────────────────────────────────────────
const fetchReportData = (instanceId) =>
  api.get(`/v1/audit/project-instances/${instanceId}/report-data`)
    .then(r => r?.data?.data || r?.data || r)

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, color = 'text-text-primary', icon: Icon, sub }) {
  return (
    <div className="bg-surface border border-border rounded-card px-3 py-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && <Icon size={11} className={color} />}
        <span className="text-[9px] text-text-muted uppercase tracking-wide leading-none">{label}</span>
      </div>
      <p className={cn('text-xl font-bold tabular-nums', color)}>{value}</p>
      {sub && <p className="text-[10px] text-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function PassBar({ value, size = 'md' }) {
  const color = value >= 80 ? 'bg-status-pass-bg' : value >= 60 ? 'bg-status-warn-bg' : 'bg-status-fail-bg'
  const text  = value >= 80 ? 'text-status-pass-fg' : value >= 60 ? 'text-status-warn-fg' : 'text-status-fail-fg'
  return (
    <div className="flex items-center gap-2">
      <div className={cn('flex-1 rounded-full overflow-hidden bg-surface-overlay', size === 'sm' ? 'h-1' : 'h-1.5')}>
        <div className={cn('h-full rounded-full', color)} style={{ width: `${value}%` }} />
      </div>
      <span className={cn('font-bold tabular-nums shrink-0', text, size === 'sm' ? 'text-[10px]' : 'text-xs')}>
        {value}%
      </span>
    </div>
  )
}

function StatusDot({ status }) {
  const cfg = STATUS_CFG[status] || { label: status || '—', color: 'text-text-muted', dot: 'bg-text-muted/40' }
  return (
    <span className={cn('flex items-center gap-1.5 text-[11px] font-medium', cfg.color)}>
      <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

function ComplianceRing({ value, size = 64 }) {
  const r     = (size - 8) / 2
  const circ  = 2 * Math.PI * r
  const fill  = circ * (1 - (value ?? 0) / 100)
  const color = (value ?? 0) >= 80 ? 'var(--status-pass-fg)' : (value ?? 0) >= 60 ? 'var(--status-warn-fg)' : 'var(--status-fail-fg)'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={6}
          className="text-surface-overlay" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={fill} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
          {value != null ? `${value}%` : '—'}
        </span>
      </div>
    </div>
  )
}

function EngagementCard({ eng, navigate }) {
  const [open, setOpen] = useState(false)
  const compPct = Math.round(eng.passRatePct ?? 0)

  return (
    <div className="bg-surface border border-border rounded-card overflow-hidden hover:border-status-tag-bd transition-colors">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <ComplianceRing value={compPct} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{eng.name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {eng.frameworkRef && (
                  <span className="text-[10px] font-mono text-status-tag-fg bg-status-tag-bg px-1.5 py-0.5 rounded">
                    {eng.frameworkRef}
                  </span>
                )}
                <StatusDot status={eng.status} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="px-4 pb-3 space-y-2">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-text-muted">Compliance</span>
            <span className="text-[10px] font-mono text-text-secondary">{eng.effective}/{eng.totalControls} effective</span>
          </div>
          <PassBar value={compPct} />
        </div>
      </div>

      {/* Finding summary */}
      {(eng.openFindings > 0 || eng.totalFindings > 0) && (
        <div className="px-4 pb-3 flex items-center gap-3 text-[10px] flex-wrap">
          {eng.openFindings > 0 && (
            <span className="text-status-warn-fg flex items-center gap-1">
              <AlertTriangle size={9} />{eng.openFindings} open finding{eng.openFindings !== 1 ? 's' : ''}
            </span>
          )}
          {eng.totalFindings > eng.openFindings && (
            <span className="text-text-muted">{eng.totalFindings} total</span>
          )}
        </div>
      )}

      {/* Controls detail — collapsible */}
      {(eng.controls || []).length > 0 && (
        <div className="border-t border-border/60">
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full px-4 py-2 text-[10px] text-text-muted hover:text-text-secondary flex items-center gap-1 transition-colors"
          >
            {open ? <XCircle size={10} /> : <ChevronRight size={10} />}
            {open ? 'Hide' : 'Show'} {eng.controls.length} controls
          </button>
          {open && (
            <div className="px-4 pb-3">
              <div className="rounded-card border border-border overflow-hidden">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="bg-surface-overlay text-text-muted">
                      <th className="text-left px-2 py-1.5 font-medium">Ref</th>
                      <th className="text-left px-2 py-1.5 font-medium">Control</th>
                      <th className="text-left px-2 py-1.5 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eng.controls.map(c => {
                      const cfg = RESULT_CFG[c.testResult] || RESULT_CFG.NOT_TESTED
                      return (
                        <tr key={c.id} className="border-t border-border/50 hover:bg-surface-overlay/50">
                          <td className="px-2 py-1.5 font-mono text-text-muted">{c.controlRef || '—'}</td>
                          <td className="px-2 py-1.5 text-text-primary max-w-[160px] truncate">{c.name}</td>
                          <td className="px-2 py-1.5">
                            <span className={cn('px-1.5 py-0.5 rounded border text-[9px] font-medium', cfg.bg, cfg.color)}>
                              {cfg.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border/60 bg-surface-overlay/30 flex items-center gap-3">
        <button
          onClick={() => navigate(`/module/audit_engagement/${eng.engagementId}`)}
          className="text-[10px] text-text-muted hover:text-text-primary flex items-center gap-1 transition-colors"
        >
          <ExternalLink size={10} />Engagement
        </button>
        <button
          onClick={() => navigate(`/audit/engagements/${eng.engagementId}/report`)}
          className="text-[10px] text-text-muted hover:text-status-tag-fg flex items-center gap-1 transition-colors"
        >
          <FileText size={10} />Report
        </button>
        <span className="text-[10px] text-text-muted ml-auto font-mono">{eng.engagementRef}</span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AuditProjectDashboardPage() {
  // Support both /audit/programme/:instanceId/dashboard and legacy /audit/projects/:projectId/dashboard
  const { instanceId, projectId } = useParams()
  const id       = instanceId || projectId
  const navigate = useNavigate()

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ['project-dashboard', id],
    queryFn:  () => fetchReportData(id),
    enabled:  !!id,
    staleTime: 30_000,
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-text-muted" />
    </div>
  )

  if (isError || !report) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <AlertTriangle size={28} className="text-status-fail-fg mx-auto mb-2" />
        <p className="text-sm text-text-muted">Dashboard data unavailable</p>
        <button onClick={() => navigate(-1)} className="mt-3 text-xs text-brand-400 underline">Go back</button>
      </div>
    </div>
  )

  const engagements  = report.engagements || []
  const overallPct   = Math.round(report.passRatePct ?? 0)
  const frameworks   = [...new Set(engagements.map(e => e.frameworkRef).filter(Boolean))]

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-border bg-surface sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="h-8 w-8 flex items-center justify-center rounded-card border border-border hover:border-brand-500/40 text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft size={15} />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-card bg-status-tag-bg border border-status-tag-bd flex items-center justify-center">
              <FolderKanban size={15} className="text-status-tag-fg" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-text-primary">{report.projectName}</h1>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-text-muted">{report.instanceRef || report.projectRef}</span>
                <StatusDot status={report.status} />
              </div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => navigate(`/audit/programme/${id}/report`)}
              className="text-[11px] text-text-muted hover:text-status-tag-fg flex items-center gap-1 px-3 py-1.5 rounded-card border border-border hover:border-status-tag-bd transition-colors"
            >
              <FileText size={11} />Full Report
            </button>
          </div>
        </div>

        {report.description && (
          <p className="text-[11px] text-text-muted mt-2 pl-[44px] max-w-lg truncate">{report.description}</p>
        )}
        {report.plannedStart && (
          <p className="text-[10px] text-text-muted mt-1 pl-[44px] flex items-center gap-1">
            <Calendar size={10} />{fmt(report.plannedStart)} → {fmt(report.plannedEnd)}
            {frameworks.length > 0 && (
              <span className="ml-3">· {frameworks.join(' + ')}</span>
            )}
          </p>
        )}
      </div>

      <div className="p-6 space-y-6">

        {/* ── Programme stats ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Engagements"    value={report.engagementCount ?? 0}  color="text-status-tag-fg" icon={BookOpen} />
          <StatCard label="Compliance"     value={`${overallPct}%`}
            color={overallPct >= 80 ? 'text-status-pass-fg' : overallPct >= 60 ? 'text-status-warn-fg' : 'text-status-fail-fg'}
            icon={BarChart2} />
          <StatCard label="Effective"      value={report.effectiveControls ?? 0}
            sub={`of ${report.totalControls ?? 0}`} color="text-status-pass-fg" icon={CheckCircle2} />
          <StatCard label="Ineffective"    value={report.ineffectiveControls ?? 0}
            color={(report.ineffectiveControls ?? 0) > 0 ? 'text-status-fail-fg' : 'text-text-muted'} icon={XCircle} />
          <StatCard label="Not tested"     value={report.notTestedControls ?? 0} color="text-text-muted" icon={Activity} />
          <StatCard label="Open findings"  value={report.openFindings ?? 0}
            color={(report.openFindings ?? 0) > 0 ? 'text-status-warn-fg' : 'text-text-muted'} icon={AlertTriangle} />
        </div>

        {/* ── Framework coverage table ─────────────────────────────────────── */}
        {engagements.length > 0 && (
          <div className="bg-surface border border-border rounded-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-wide flex items-center gap-2">
                <Shield size={12} className="text-status-tag-fg" />Framework Coverage
              </h2>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-overlay text-text-muted">
                  <th className="text-left px-4 py-2 font-medium">Framework</th>
                  <th className="text-left px-4 py-2 font-medium">Engagement</th>
                  <th className="text-left px-4 py-2 font-medium w-32">Compliance</th>
                  <th className="text-center px-3 py-2 font-medium">Controls</th>
                  <th className="text-center px-3 py-2 font-medium">Findings</th>
                  <th className="text-center px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {engagements.map(eng => (
                  <tr key={eng.engagementId} className="border-t border-border/50 hover:bg-surface-overlay/30 cursor-pointer"
                    onClick={() => navigate(`/module/audit_engagement/${eng.engagementId}`)}>
                    <td className="px-4 py-2">
                      <span className="font-mono text-status-tag-fg bg-status-tag-bg px-1.5 py-0.5 rounded text-[10px]">
                        {eng.frameworkRef || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-text-primary truncate max-w-[180px]">{eng.name}</td>
                    <td className="px-4 py-2 w-32"><PassBar value={Math.round(eng.passRatePct ?? 0)} size="sm" /></td>
                    <td className="px-3 py-2 text-center text-text-secondary">{eng.totalControls}</td>
                    <td className="px-3 py-2 text-center">
                      {(eng.openFindings ?? 0) > 0
                        ? <span className="text-status-warn-fg">{eng.openFindings}</span>
                        : <span className="text-status-pass-fg text-[10px]">✓</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusDot status={eng.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Engagement cards ─────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-bold text-text-primary uppercase tracking-wide mb-3">
            Engagements ({engagements.length})
          </h2>
          {engagements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-card text-center">
              <BookOpen size={28} className="text-text-muted/40 mb-3" />
              <p className="text-sm font-medium text-text-secondary mb-1">No engagements yet</p>
              <p className="text-xs text-text-muted">Engagements are created when the project is started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {engagements.map(eng => (
                <EngagementCard key={eng.engagementId} eng={eng} navigate={navigate} />
              ))}
            </div>
          )}
        </div>

        {/* ── Findings summary ─────────────────────────────────────────────── */}
        {(report.totalFindings ?? 0) > 0 && (
          <div className="bg-surface border border-border rounded-card p-4">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
              <AlertTriangle size={12} className="text-status-warn-fg" />Cross-Framework Findings
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Critical', value: report.criticalFindings ?? 0, color: 'text-status-fail-fg'    },
                { label: 'High',     value: report.highFindings     ?? 0, color: 'text-status-warn-fg' },
                { label: 'Medium',   value: report.mediumFindings   ?? 0, color: 'text-status-warn-fg'  },
                { label: 'Low',      value: report.lowFindings      ?? 0, color: 'text-text-muted' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wide mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}