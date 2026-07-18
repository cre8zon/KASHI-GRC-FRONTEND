/**
 * AuditProgrammeReportPage — /audit/programme/:instanceId/report
 *
 * Consolidated multi-framework programme report for an AuditProjectInstance.
 * Unlike AuditReportPage (single engagement, single framework), this page
 * covers ALL engagements under a project instance, providing:
 *
 *  1. Programme Header        — instance ref, project name, period, owner
 *  2. Executive Summary       — cross-framework compliance posture, risk rating
 *  3. Framework Coverage      — one row per engagement: framework, pass rate, controls, findings
 *  4. Cross-Framework Heatmap — control effectiveness grid across all frameworks
 *  5. Findings Consolidated   — all findings across all engagements, severity grouped
 *  6. Per-Engagement Detail   — collapsible section per engagement with full control list
 *  7. Workflow Audit Trail    — project lifecycle step history
 *  8. Sign-off                — executive summary block for print
 *
 * BACKEND:
 *   GET /v1/audit/project-instances/:id/report-data  — all aggregated data in one call
 *   GET /v1/workflow-instances/:wfId/progress        — step timeline
 *
 * ROUTE: /audit/programme/:instanceId/report
 * Register in App.jsx:
 *   <Route path="/audit/programme/:instanceId/report" element={<AuditProgrammeReportPage />} />
 */

import { useState }           from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery }            from '@tanstack/react-query'
import {
  ArrowLeft, Download, Shield, CheckCircle2, XCircle,
  AlertTriangle, Clock, FileText, Activity, ChevronDown,
  ChevronRight, BarChart2, FolderKanban, Calendar,
  Layers, Globe, Loader2, Info, TrendingUp, User,
} from 'lucide-react'
import { cn }                  from '../../lib/cn'
import api                     from '../../config/axios.config'

// ─── Data ────────────────────────────────────────────────────────────────────

const fetchReportData = (id) =>
  api.get(`/v1/audit/project-instances/${id}/report-data`)
    .then(r => r?.data?.data || r?.data || r)

const fetchProgress = (wfId) => wfId
  ? api.get(`/v1/workflow-instances/${wfId}/progress`)
      .then(r => { const d = r?.data?.data || r?.data || r; return d?.stepInstances || d?.steps || [] })
      .catch(() => [])
  : Promise.resolve([])

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (dt) => dt
  ? new Date(dt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—'

const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : 0

const riskRating = (passRate, openFindings) => {
  if (passRate >= 90 && openFindings === 0) return { label: 'Low Risk',      color: 'text-status-pass-fg',  bg: 'bg-status-pass-bg  border-status-pass-bd'  }
  if (passRate >= 75 && openFindings <= 2)  return { label: 'Moderate Risk', color: 'text-status-warn-fg',  bg: 'bg-status-warn-bg  border-status-warn-bd'  }
  if (passRate >= 50)                        return { label: 'Elevated Risk', color: 'text-status-warn-fg', bg: 'bg-status-warn-bg border-status-warn-bd' }
  return                                            { label: 'High Risk',     color: 'text-status-fail-fg',    bg: 'bg-status-fail-bg    border-status-fail-bd'    }
}

const RESULT_CFG = {
  EFFECTIVE:           { label: 'Effective',           color: 'text-status-pass-fg',  bg: 'bg-status-pass-bg'  },
  PARTIALLY_EFFECTIVE: { label: 'Partial',             color: 'text-status-warn-fg',  bg: 'bg-status-warn-bg'  },
  INEFFECTIVE:         { label: 'Ineffective',         color: 'text-status-fail-fg',    bg: 'bg-status-fail-bg'    },
  NOT_TESTED:          { label: 'Not tested',          color: 'text-text-muted', bg: 'bg-surface-overlay'},
}

const SEVERITY_CFG = {
  CRITICAL: { color: 'text-status-fail-fg',    bg: 'bg-status-fail-bg    border-status-fail-bd',    dot: 'bg-status-fail-bg'    },
  HIGH:     { color: 'text-status-warn-fg', bg: 'bg-status-warn-bg border-status-warn-bd', dot: 'bg-status-warn-bg' },
  MEDIUM:   { color: 'text-status-warn-fg',  bg: 'bg-status-warn-bg  border-status-warn-bd',  dot: 'bg-status-warn-bg'  },
  LOW:      { color: 'text-status-pass-fg',  bg: 'bg-status-pass-bg  border-status-pass-bd',  dot: 'bg-status-pass-bg'  },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'text-text-primary', icon: Icon }) {
  return (
    <div className="bg-surface border border-border rounded-card px-4 py-3 flex flex-col gap-1">
      {Icon && <Icon size={14} className={cn('mb-0.5', color)} />}
      <p className={cn('text-2xl font-bold tabular-nums', color)}>{value}</p>
      <p className="text-[10px] text-text-muted uppercase tracking-wide">{label}</p>
      {sub && <p className="text-[10px] text-text-muted">{sub}</p>}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle, className }) {
  return (
    <div className={cn('flex items-center gap-3 mb-4', className)}>
      <div className="w-8 h-8 rounded-card bg-status-tag-bg border border-status-tag-bd flex items-center justify-center shrink-0">
        <Icon size={15} className="text-status-tag-fg" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {subtitle && <p className="text-[11px] text-text-muted">{subtitle}</p>}
      </div>
    </div>
  )
}

function PassRateBar({ passRate, size = 'md' }) {
  const color = passRate >= 80 ? 'bg-status-pass-bg' : passRate >= 60 ? 'bg-status-warn-bg' : 'bg-status-fail-bg'
  const textColor = passRate >= 80 ? 'text-status-pass-fg' : passRate >= 60 ? 'text-status-warn-fg' : 'text-status-fail-fg'
  return (
    <div className={cn('flex items-center gap-2', size === 'sm' ? 'gap-1.5' : 'gap-2')}>
      <div className={cn('flex-1 bg-surface-overlay rounded-full overflow-hidden', size === 'sm' ? 'h-1' : 'h-1.5')}>
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${passRate}%` }} />
      </div>
      <span className={cn('tabular-nums font-bold shrink-0', textColor, size === 'sm' ? 'text-[10px]' : 'text-xs')}>
        {passRate}%
      </span>
    </div>
  )
}

function EngagementRow({ eng }) {
  const [open, setOpen] = useState(false)
  const risk = riskRating(eng.passRatePct, eng.openFindings)

  return (
    <div className="border border-border rounded-card overflow-hidden">
      {/* Summary row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center gap-4 text-left hover:bg-surface-overlay transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-status-tag-fg bg-status-tag-bg px-1.5 py-0.5 rounded">
              {eng.frameworkRef || 'UNKNOWN'}
            </span>
            <span className="text-sm font-medium text-text-primary truncate">{eng.name}</span>
            <span className="text-[10px] text-text-muted font-mono">{eng.engagementRef}</span>
          </div>
          <div className="mt-1.5 max-w-xs">
            <PassRateBar passRate={eng.passRatePct} size="sm" />
          </div>
        </div>

        <div className="flex items-center gap-6 shrink-0 text-xs tabular-nums">
          <div className="text-center">
            <p className="font-semibold text-text-primary">{eng.totalControls}</p>
            <p className="text-[9px] text-text-muted uppercase">Controls</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-status-pass-fg">{eng.effective}</p>
            <p className="text-[9px] text-text-muted uppercase">Effective</p>
          </div>
          {eng.ineffective > 0 && (
            <div className="text-center">
              <p className="font-semibold text-status-fail-fg">{eng.ineffective}</p>
              <p className="text-[9px] text-text-muted uppercase">Ineffective</p>
            </div>
          )}
          {eng.openFindings > 0 && (
            <div className="text-center">
              <p className="font-semibold text-status-warn-fg">{eng.openFindings}</p>
              <p className="text-[9px] text-text-muted uppercase">Findings</p>
            </div>
          )}
          <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded border', risk.bg, risk.color)}>
            {risk.label}
          </span>
        </div>

        {open ? <ChevronDown size={14} className="text-text-muted shrink-0" />
               : <ChevronRight size={14} className="text-text-muted shrink-0" />}
      </button>

      {/* Expanded: control list + findings */}
      {open && (
        <div className="border-t border-border bg-surface-raised/30 p-4 space-y-4">
          {/* Controls table */}
          {(eng.controls || []).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
                Controls ({eng.controls.length})
              </p>
              <div className="rounded-card border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-overlay text-text-muted">
                      <th className="text-left px-3 py-2 font-medium">Ref</th>
                      <th className="text-left px-3 py-2 font-medium">Control</th>
                      <th className="text-left px-3 py-2 font-medium">Result</th>
                      <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(eng.controls || []).map(c => {
                      const cfg = RESULT_CFG[c.testResult] || RESULT_CFG.NOT_TESTED
                      return (
                        <tr key={c.id} className="border-t border-border/50 hover:bg-surface-overlay/50">
                          <td className="px-3 py-2 font-mono text-text-muted whitespace-nowrap">{c.controlRef || '—'}</td>
                          <td className="px-3 py-2 text-text-primary max-w-[280px] truncate">{c.name}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', cfg.bg, cfg.color)}>
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-muted truncate max-w-[200px] hidden md:table-cell">
                            {c.testNotes || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Findings */}
          {(eng.findings || []).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
                Findings ({eng.findings.length})
              </p>
              <div className="space-y-2">
                {(eng.findings || []).map(f => {
                  const sev = SEVERITY_CFG[f.severity] || SEVERITY_CFG.LOW
                  return (
                    <div key={f.id} className={cn('rounded-card border p-3', sev.bg)}>
                      <div className="flex items-start gap-2">
                        <span className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', sev.dot)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn('text-[10px] font-bold uppercase', sev.color)}>{f.severity}</span>
                            <span className="text-xs font-medium text-text-primary">{f.title}</span>
                            {f.status && (
                              <span className="text-[9px] text-text-muted border border-border px-1 rounded">
                                {f.status.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                          {f.description && (
                            <p className="text-[11px] text-text-muted mt-1 line-clamp-2">{f.description}</p>
                          )}
                          {f.remediation && (
                            <p className="text-[11px] text-text-secondary mt-1">
                              <span className="font-medium">Remediation:</span> {f.remediation}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {(eng.controls || []).length === 0 && (eng.findings || []).length === 0 && (
            <p className="text-xs text-text-muted italic text-center py-4">No detail data available</p>
          )}
        </div>
      )}
    </div>
  )
}

function WorkflowTimeline({ steps }) {
  if (!steps || steps.length === 0) return (
    <p className="text-xs text-text-muted italic">No workflow history available.</p>
  )
  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        const done = step.status === 'COMPLETED' || step.status === 'APPROVED'
        const active = step.status === 'IN_PROGRESS'
        return (
          <div key={step.id || i} className="flex items-start gap-3">
            <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
              done   ? 'border-status-pass-bd bg-status-pass-bg' :
              active ? 'border-status-tag-bd bg-status-tag-bg' :
                       'border-border bg-surface-overlay')}>
              {done && <CheckCircle2 size={10} className="text-status-pass-fg" />}
              {active && <div className="w-1.5 h-1.5 rounded-full bg-status-tag-bg animate-pulse" />}
            </div>
            <div className="flex-1 min-w-0 pb-2 border-b border-border/30 last:border-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-text-primary">{step.stepName || step.name}</span>
                <span className={cn('text-[9px] font-medium uppercase px-1.5 py-0.5 rounded',
                  done   ? 'text-status-pass-fg bg-status-pass-bg' :
                  active ? 'text-status-tag-fg bg-status-tag-bg' :
                           'text-text-muted bg-surface-overlay')}>
                  {step.status === 'APPROVED' ? 'COMPLETED' : step.status}
                </span>
                {step.completedAt && (
                  <span className="text-[10px] text-text-muted">{fmt(step.completedAt)}</span>
                )}
              </div>
              {step.completedByName && (
                <p className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1">
                  <User size={9} />{step.completedByName}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── PDF Generator ────────────────────────────────────────────────────────────
// Opens a styled popup window with the full programme report as print-ready HTML,
// then triggers window.print() — same pattern as AssessmentReportPage.

async function generatePDF(report, steps = []) {
  const fmtDate  = (dt) => dt ? new Date(dt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long',  year: 'numeric' }) : '—'
  const fmtShort = (dt) => dt ? new Date(dt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  const passRate  = report.passRatePct ?? 0
  const riskLabel = passRate >= 90 && (report.openFindings ?? 0) === 0 ? 'Low Risk'
                  : passRate >= 75 && (report.openFindings ?? 0) <= 2  ? 'Moderate Risk'
                  : passRate >= 60 ? 'Elevated Risk' : 'High Risk'
  const riskColor = passRate >= 90 ? 'var(--rpt-pass-fg)' : passRate >= 75 ? 'var(--rpt-warn-fg)' : passRate >= 60 ? 'var(--rpt-high-fg)' : 'var(--rpt-crit-fg)'
  const riskBg    = passRate >= 90 ? 'var(--rpt-pass-bg)'  : passRate >= 75 ? 'var(--rpt-warn-bg)'  : passRate >= 60 ? 'var(--rpt-high-bg)'  : 'var(--rpt-crit-bg)'
  const riskBorder= passRate >= 90 ? 'var(--rpt-pass-bd)'  : passRate >= 75 ? 'var(--rpt-warn-bd)'  : passRate >= 60 ? 'var(--rpt-high-bd)'  : 'var(--rpt-crit-bd)'
  const pctColor  = passRate >= 80 ? 'var(--rpt-pass-fg)' : passRate >= 60 ? 'var(--rpt-warn-bd)' : 'var(--rpt-crit-bd)'
  const pctBg     = passRate >= 80 ? 'var(--rpt-pass-bg)'  : passRate >= 60 ? 'var(--rpt-warn-bg)'  : 'var(--rpt-crit-bg)'

  const engagements = report.engagements || []
  const frameworks  = [...new Set(engagements.map(e => e.frameworkRef).filter(Boolean))]
  const allFindings = engagements.flatMap(e =>
    (e.findings || []).map(f => ({ ...f, frameworkRef: e.frameworkRef, engName: e.name }))
  )

  // ── Per-engagement rows ────────────────────────────────────────────────────
  const engRows = engagements.map((eng, idx) => {
    const passW = Math.round((eng.effective ?? 0) / Math.max(eng.totalControls, 1) * 200)
    const failW = Math.round((eng.ineffective ?? 0) / Math.max(eng.totalControls, 1) * 200)
    const ntW   = 200 - passW - failW
    const barSvg = `<svg width="200" height="8" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="200" height="8" rx="4" fill="var(--rpt-border)"/>
      <rect x="0" y="0" width="${passW}" height="8" rx="4" fill="var(--rpt-pass-bd)"/>
      <rect x="${passW}" y="0" width="${failW}" height="8" fill="var(--rpt-crit-bd)"/>
      <rect x="${passW + failW}" y="0" width="${ntW}" height="8" rx="4" fill="var(--rpt-border)"/>
    </svg>`
    const epct = eng.passRatePct ?? 0
    const epctColor = epct >= 80 ? 'var(--rpt-pass-fg)' : epct >= 60 ? 'var(--rpt-warn-bd)' : 'var(--rpt-crit-bd)'
    const sevCols = [
      eng.criticalFindings > 0 ? `<span style="background:var(--rpt-crit-bg);color:var(--rpt-crit-bd);padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700">${eng.criticalFindings} C</span>` : '',
      eng.highFindings > 0     ? `<span style="background:var(--rpt-high-bg);color:var(--rpt-high-bd);padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700">${eng.highFindings} H</span>` : '',
      eng.mediumFindings > 0   ? `<span style="background:var(--rpt-warn-bg);color:var(--rpt-warn-bd);padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700">${eng.mediumFindings} M</span>` : '',
      eng.lowFindings > 0      ? `<span style="background:var(--rpt-pass-bg);color:var(--rpt-pass-bd);padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700">${eng.lowFindings} L</span>` : '',
    ].filter(Boolean).join(' ') || '<span style="color:var(--rpt-muted)">—</span>'

    return `<tr style="background:${idx % 2 === 0 ? 'var(--rpt-white)' : 'var(--rpt-paper)'}">
      <td style="padding:10px 14px;border-bottom:1px solid var(--rpt-border);font-weight:600;font-size:12px">${eng.name || eng.engagementRef}</td>
      <td style="padding:10px 14px;border-bottom:1px solid var(--rpt-border);font-size:11px;color:var(--rpt-muted)">${eng.frameworkRef || '—'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid var(--rpt-border);text-align:center;font-size:12px">${eng.totalControls ?? 0}</td>
      <td style="padding:10px 14px;border-bottom:1px solid var(--rpt-border);text-align:center;font-size:12px;font-weight:700;color:var(--rpt-pass-fg)">${eng.effective ?? 0}</td>
      <td style="padding:10px 14px;border-bottom:1px solid var(--rpt-border);text-align:center;font-size:12px;font-weight:700;color:var(--rpt-crit-bd)">${eng.ineffective ?? 0}</td>
      <td style="padding:10px 14px;border-bottom:1px solid var(--rpt-border);vertical-align:middle">${barSvg}</td>
      <td style="padding:10px 14px;border-bottom:1px solid var(--rpt-border);text-align:center;font-size:13px;font-weight:800;color:${epctColor}">${epct}%</td>
      <td style="padding:10px 14px;border-bottom:1px solid var(--rpt-border);text-align:center">${sevCols}</td>
    </tr>`
  }).join('')

  // ── All findings table ─────────────────────────────────────────────────────
  const findingRows = allFindings.slice(0, 50).map((f, i) => {
    const sevColor = f.severity === 'CRITICAL' ? 'var(--rpt-crit-bd)' : f.severity === 'HIGH' ? 'var(--rpt-high-bd)' : f.severity === 'MEDIUM' ? 'var(--rpt-warn-bd)' : 'var(--rpt-muted)'
    const sevBg    = f.severity === 'CRITICAL' ? 'var(--rpt-crit-bg)' : f.severity === 'HIGH' ? 'var(--rpt-high-bg)' : f.severity === 'MEDIUM' ? 'var(--rpt-warn-bg)' : 'var(--rpt-bg-soft)'
    const stColor  = f.status === 'CLOSED' || f.status === 'RESOLVED' ? 'var(--rpt-pass-fg)' : f.status === 'IN_REMEDIATION' ? 'var(--rpt-accent)' : 'var(--rpt-crit-bd)'
    const stBg     = f.status === 'CLOSED' || f.status === 'RESOLVED' ? 'var(--rpt-pass-bg)'  : f.status === 'IN_REMEDIATION' ? 'var(--rpt-accent-bg)'  : 'var(--rpt-crit-bg)'
    return `<tr style="background:${i % 2 === 0 ? 'var(--rpt-white)' : 'var(--rpt-paper)'}">
      <td style="padding:9px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:12px">${(f.title || '').replace(/</g,'&lt;')}</td>
      <td style="padding:9px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:11px;color:var(--rpt-muted)">${f.engName || f.frameworkRef || '—'}</td>
      <td style="padding:9px 14px;border-bottom:1px solid var(--rpt-bg-soft);text-align:center">
        ${f.severity ? `<span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${sevBg};color:${sevColor}">${f.severity}</span>` : '—'}
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid var(--rpt-bg-soft);text-align:center">
        <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${stBg};color:${stColor}">${f.status || 'OPEN'}</span>
      </td>
    </tr>`
  }).join('')

  // ── Sign-off chain from workflow steps ─────────────────────────────────────
  const signOffRows = steps
    .filter(s => s.status === 'APPROVED' || s.completedAt)
    .map(s => `<tr>
      <td style="padding:8px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:12px;font-weight:600">${s.stepName || s.name || '—'}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:11px;color:var(--rpt-muted)">${s.completedByName || s.actor || '—'}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:11px;color:var(--rpt-muted)">${fmtShort(s.completedAt || s.actedAt)}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--rpt-bg-soft);text-align:center">
        <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:var(--rpt-pass-bg);color:var(--rpt-pass-fg)">APPROVED</span>
      </td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>${report.projectName || 'Programme Report'} — ${report.instanceRef || ''}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#fff; color:var(--rpt-ink); }
  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .page-break { page-break-before:always; }
    @page { margin:15mm; size:A4; }
  }
  .header { background:linear-gradient(135deg,var(--rpt-ink) 0%,var(--rpt-accent) 100%); color:#fff; padding:32px 40px; }
  .header-meta { font-size:11px; opacity:.7; margin-bottom:8px; letter-spacing:.05em; text-transform:uppercase; }
  .header-title { font-size:26px; font-weight:800; margin-bottom:6px; }
  .header-desc { font-size:12px; opacity:.8; max-width:600px; margin-bottom:16px; line-height:1.5; }
  .header-pills { display:flex; gap:10px; flex-wrap:wrap; }
  .pill { font-size:10px; font-weight:700; padding:3px 10px; border-radius:20px; border:1px solid rgb(var(--color-on-dark) / .3); color:#fff; }
  .kpi-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:1px; background:var(--rpt-border); margin:0; }
  .kpi { background:#fff; padding:20px 16px; text-align:center; }
  .kpi-val { font-size:28px; font-weight:800; line-height:1; }
  .kpi-lbl { font-size:10px; color:var(--rpt-muted); margin-top:4px; text-transform:uppercase; letter-spacing:.05em; }
  .section-label { font-size:11px; font-weight:700; color:var(--rpt-muted); text-transform:uppercase; letter-spacing:.08em; padding:20px 24px 10px; border-top:2px solid var(--rpt-border); margin-top:8px; }
  table { width:100%; border-collapse:collapse; }
  thead th { padding:10px 14px; background:var(--rpt-bg-soft); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--rpt-muted); text-align:left; border-bottom:2px solid var(--rpt-border); }
  .risk-badge { display:inline-block; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:700; border:1px solid ${riskBorder}; background:${riskBg}; color:${riskColor}; }
  .footer { padding:24px 40px; text-align:center; font-size:10px; color:var(--rpt-muted); border-top:1px solid var(--rpt-border); margin-top:32px; }
  .compliance-bar-wrap { padding:16px 24px; }
  .compliance-bar-track { width:100%; height:12px; background:var(--rpt-border); border-radius:6px; overflow:hidden; }
  .compliance-bar-fill { height:100%; border-radius:6px; background:${passRate >= 80 ? 'var(--rpt-pass-bd)' : passRate >= 60 ? 'var(--rpt-warn-bd)' : 'var(--rpt-crit-bd)'}; width:${passRate}%; }
</style></head><body>

<!-- HEADER -->
<div class="header">
  <div class="header-meta">Audit Programme Report · Generated ${fmtDate(report.generatedAt || new Date())}</div>
  <div class="header-title">${report.projectName || 'Audit Programme'}</div>
  ${report.description ? `<div class="header-desc">${report.description}</div>` : ''}
  <div class="header-pills">
    <span class="pill">${report.instanceRef || report.projectRef || '—'}</span>
    <span class="pill">${frameworks.join(' · ') || 'Multi-framework'}</span>
    <span class="pill">${report.engagementCount ?? 0} engagement${(report.engagementCount ?? 0) !== 1 ? 's' : ''}</span>
    ${report.plannedStart ? `<span class="pill">${fmtDate(report.plannedStart)} – ${fmtDate(report.plannedEnd)}</span>` : ''}
    <span class="risk-badge">${riskLabel}</span>
  </div>
</div>

<!-- KPI BAR -->
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val" style="color:${pctColor};background:${pctBg};padding:6px 10px;border-radius:8px;display:inline-block">${passRate}%</div><div class="kpi-lbl">Overall Compliance</div></div>
  <div class="kpi"><div class="kpi-val" style="color:var(--rpt-pass-fg)">${report.effectiveControls ?? 0}</div><div class="kpi-lbl">Effective of ${report.totalControls ?? 0}</div></div>
  <div class="kpi"><div class="kpi-val" style="color:var(--rpt-crit-bd)">${report.ineffectiveControls ?? 0}</div><div class="kpi-lbl">Ineffective</div></div>
  <div class="kpi"><div class="kpi-val" style="color:var(--rpt-muted)">${report.notTestedControls ?? 0}</div><div class="kpi-lbl">Not Tested</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${(report.openFindings ?? 0) > 0 ? 'var(--rpt-crit-bd)' : 'var(--rpt-pass-fg)'}">${report.openFindings ?? 0}</div><div class="kpi-lbl">Open Findings</div></div>
</div>

<!-- Compliance bar -->
<div class="compliance-bar-wrap">
  <div class="compliance-bar-track"><div class="compliance-bar-fill"></div></div>
</div>

<!-- FINDINGS SEVERITY SUMMARY -->
<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
  <div class="kpi"><div class="kpi-val" style="color:var(--rpt-crit-bd)">${report.criticalFindings ?? 0}</div><div class="kpi-lbl">Critical</div></div>
  <div class="kpi"><div class="kpi-val" style="color:var(--rpt-high-bd)">${report.highFindings ?? 0}</div><div class="kpi-lbl">High</div></div>
  <div class="kpi"><div class="kpi-val" style="color:var(--rpt-warn-bd)">${report.mediumFindings ?? 0}</div><div class="kpi-lbl">Medium</div></div>
  <div class="kpi"><div class="kpi-val" style="color:var(--rpt-muted)">${report.lowFindings ?? 0}</div><div class="kpi-lbl">Low</div></div>
</div>

<!-- FRAMEWORK COVERAGE TABLE -->
<div class="section-label">Framework Coverage by Engagement</div>
<table>
  <thead><tr>
    <th>Engagement</th><th>Framework</th><th style="text-align:center">Controls</th>
    <th style="text-align:center">Effective</th><th style="text-align:center">Ineffective</th>
    <th>Progress</th><th style="text-align:center">Compliance</th><th style="text-align:center">Findings</th>
  </tr></thead>
  <tbody>${engRows}</tbody>
</table>

${allFindings.length > 0 ? `
<!-- CONSOLIDATED FINDINGS -->
<div class="section-label page-break">Consolidated Findings (${allFindings.length} total)</div>
<table>
  <thead><tr>
    <th>Finding</th><th>Engagement</th><th style="text-align:center">Severity</th><th style="text-align:center">Status</th>
  </tr></thead>
  <tbody>${findingRows}</tbody>
</table>
${allFindings.length > 50 ? `<p style="font-size:10px;color:var(--rpt-muted);padding:8px 24px">Showing 50 of ${allFindings.length} findings.</p>` : ''}
` : `
<div style="padding:16px 24px;margin:16px 24px;background:var(--rpt-pass-bg);border:1px solid var(--rpt-pass-bd);border-radius:8px;font-size:12px;color:var(--rpt-pass-fg)">
  ✓ No findings recorded across all engagements.
</div>`}

${signOffRows ? `
<!-- WORKFLOW SIGN-OFF CHAIN -->
<div class="section-label page-break">Workflow Audit Trail &amp; Sign-off Chain</div>
<table>
  <thead><tr><th>Step</th><th>Completed By</th><th>Date</th><th style="text-align:center">Status</th></tr></thead>
  <tbody>${signOffRows}</tbody>
</table>
` : ''}

<div class="footer">
  ${report.projectName} · ${report.instanceRef || ''} · Generated ${fmtDate(report.generatedAt || new Date())} · KashiGRC
</div>
</body></html>`

  const win = window.open('', '_blank', 'width=1000,height=800')
  if (!win) { alert('Please allow popups for PDF generation'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 700)
}



export default function AuditProgrammeReportPage() {
  const { instanceId }  = useParams()
  const navigate        = useNavigate()
  const [generatingPDF, setGeneratingPDF] = useState(false)

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ['programme-report', instanceId],
    queryFn:  () => fetchReportData(instanceId),
    enabled:  !!instanceId,
    staleTime: 60_000,
  })

  const { data: steps = [] } = useQuery({
    queryKey: ['programme-wf-progress', report?.workflowInstanceId],
    queryFn:  () => fetchProgress(report?.workflowInstanceId),
    enabled:  !!report?.workflowInstanceId,
    staleTime: 60_000,
  })

  const handleDownloadPDF = async () => {
    setGeneratingPDF(true)
    try { await generatePDF(report, steps) }
    catch (e) { console.error('PDF generation failed', e) }
    finally { setGeneratingPDF(false) }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={24} className="text-status-tag-fg animate-spin" />
        <p className="text-sm text-text-muted">Loading programme report…</p>
      </div>
    </div>
  )

  if (isError || !report) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <AlertTriangle size={32} className="text-status-fail-fg mx-auto mb-3" />
        <p className="text-sm font-medium text-text-primary mb-1">Report data unavailable</p>
        <p className="text-xs text-text-muted mb-4">The programme report could not be loaded.</p>
        <button onClick={() => navigate(-1)} className="text-xs text-status-tag-fg underline">Go back</button>
      </div>
    </div>
  )

  const risk = riskRating(report.passRatePct ?? 0, report.openFindings ?? 0)
  const engagements = report.engagements || []
  const allFindings = engagements.flatMap(e => (e.findings || []).map(f => ({ ...f, frameworkRef: e.frameworkRef, engagementName: e.name })))
  const frameworks  = [...new Set(engagements.map(e => e.frameworkRef).filter(Boolean))]

  return (
    <div className="min-h-full bg-background">
      {/* ── Print header (hidden on screen) ─────────────────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-break { page-break-before: always; }
          body { background: white; color: var(--rpt-ink); }
        }
      `}</style>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="no-print sticky top-0 z-10 bg-surface border-b border-border px-6 py-3 flex items-center gap-4">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-text-primary truncate">
            Programme Report — {report.projectName}
          </h1>
          <p className="text-[10px] text-text-muted">{report.instanceRef} · {frameworks.join(' + ') || 'Multi-framework'}</p>
        </div>
        <button onClick={handleDownloadPDF} disabled={generatingPDF}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-card bg-status-tag-bg border border-status-tag-bd text-status-tag-fg hover:bg-status-tag-bg transition-colors disabled:opacity-50">
          <Download size={12} className={generatingPDF ? 'animate-pulse' : ''}/>{generatingPDF ? 'Generating…' : 'Download PDF'}
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {/* ── 1. Programme Header ─────────────────────────────────────────── */}
        <div className="bg-surface border border-status-tag-bd rounded-modal p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FolderKanban size={18} className="text-status-tag-fg" />
                <span className="text-xs font-mono text-status-tag-fg bg-status-tag-bg px-2 py-0.5 rounded">
                  {report.instanceRef || report.projectRef}
                </span>
                <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border', risk.bg, risk.color)}>
                  {risk.label}
                </span>
              </div>
              <h1 className="text-xl font-bold text-text-primary mb-1">{report.projectName}</h1>
              {report.description && (
                <p className="text-sm text-text-muted max-w-2xl">{report.description}</p>
              )}
              <div className="flex items-center gap-4 mt-3 text-xs text-text-muted flex-wrap">
                <span className="flex items-center gap-1">
                  <Globe size={11} />{frameworks.length} framework{frameworks.length !== 1 ? 's' : ''}: {frameworks.join(', ') || '—'}
                </span>
                <span className="flex items-center gap-1">
                  <Layers size={11} />{report.engagementCount} engagement{report.engagementCount !== 1 ? 's' : ''}
                </span>
                {report.plannedStart && (
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />{fmt(report.plannedStart)} – {fmt(report.plannedEnd)}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-text-muted uppercase tracking-wide">Report generated</p>
              <p className="text-xs text-text-secondary mt-0.5">{fmt(report.generatedAt || new Date())}</p>
            </div>
          </div>
        </div>

        {/* ── 2. Executive Summary ────────────────────────────────────────── */}
        <div>
          <SectionHeader icon={BarChart2} title="Executive Summary"
            subtitle="Cross-framework compliance posture at programme level" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <StatCard label="Overall compliance" value={`${report.passRatePct ?? 0}%`}
              color={report.passRatePct >= 80 ? 'text-status-pass-fg' : report.passRatePct >= 60 ? 'text-status-warn-fg' : 'text-status-fail-fg'}
              icon={TrendingUp} />
            <StatCard label="Controls effective" value={report.effectiveControls ?? 0}
              sub={`of ${report.totalControls ?? 0} total`} color="text-status-pass-fg" icon={CheckCircle2} />
            <StatCard label="Ineffective" value={report.ineffectiveControls ?? 0}
              color={(report.ineffectiveControls ?? 0) > 0 ? 'text-status-fail-fg' : 'text-text-muted'} icon={XCircle} />
            <StatCard label="Open findings" value={report.openFindings ?? 0}
              color={(report.openFindings ?? 0) > 0 ? 'text-status-warn-fg' : 'text-text-muted'} icon={AlertTriangle} />
          </div>

          {/* Findings severity breakdown */}
          {report.totalFindings > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { key: 'criticalFindings', label: 'Critical', ...SEVERITY_CFG.CRITICAL },
                { key: 'highFindings',     label: 'High',     ...SEVERITY_CFG.HIGH     },
                { key: 'mediumFindings',   label: 'Medium',   ...SEVERITY_CFG.MEDIUM   },
                { key: 'lowFindings',      label: 'Low',      ...SEVERITY_CFG.LOW      },
              ].map(s => (
                <div key={s.key} className={cn('rounded-card border px-3 py-2.5 text-center', s.bg)}>
                  <p className={cn('text-xl font-bold tabular-nums', s.color)}>{report[s.key] ?? 0}</p>
                  <p className={cn('text-[9px] uppercase tracking-wide font-medium mt-0.5', s.color)}>{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 3. Framework Coverage Table ─────────────────────────────────── */}
        <div>
          <SectionHeader icon={Globe} title="Framework Coverage"
            subtitle="Pass rate and findings per engagement" />
          <div className="rounded-card border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-overlay text-text-muted">
                  <th className="text-left px-4 py-2.5 font-medium">Framework</th>
                  <th className="text-left px-4 py-2.5 font-medium">Engagement</th>
                  <th className="text-left px-4 py-2.5 font-medium w-36">Compliance</th>
                  <th className="text-center px-3 py-2.5 font-medium">Controls</th>
                  <th className="text-center px-3 py-2.5 font-medium">Effective</th>
                  <th className="text-center px-3 py-2.5 font-medium">Ineffective</th>
                  <th className="text-center px-3 py-2.5 font-medium">Not tested</th>
                  <th className="text-center px-3 py-2.5 font-medium">Findings</th>
                </tr>
              </thead>
              <tbody>
                {engagements.map(eng => (
                  <tr key={eng.engagementId} className="border-t border-border/50 hover:bg-surface-overlay/30">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-status-tag-fg bg-status-tag-bg px-1.5 py-0.5 rounded text-[10px]">
                        {eng.frameworkRef || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-text-primary max-w-[200px] truncate">{eng.name}</td>
                    <td className="px-4 py-2.5 w-36"><PassRateBar passRate={eng.passRatePct} size="sm" /></td>
                    <td className="px-3 py-2.5 text-center text-text-secondary">{eng.totalControls}</td>
                    <td className="px-3 py-2.5 text-center text-status-pass-fg font-medium">{eng.effective}</td>
                    <td className="px-3 py-2.5 text-center text-status-fail-fg font-medium">
                      {eng.ineffective > 0 ? eng.ineffective : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center text-text-muted">{eng.notTested}</td>
                    <td className="px-3 py-2.5 text-center">
                      {eng.openFindings > 0
                        ? <span className="text-status-warn-fg font-medium">{eng.openFindings}</span>
                        : <span className="text-text-muted">—</span>}
                    </td>
                  </tr>
                ))}
                {/* Programme totals row */}
                <tr className="border-t-2 border-border bg-surface-overlay/50 font-semibold">
                  <td className="px-4 py-2.5 text-text-muted text-[10px] uppercase tracking-wide" colSpan={2}>Programme total</td>
                  <td className="px-4 py-2.5 w-36"><PassRateBar passRate={report.passRatePct ?? 0} /></td>
                  <td className="px-3 py-2.5 text-center text-text-primary">{report.totalControls}</td>
                  <td className="px-3 py-2.5 text-center text-status-pass-fg">{report.effectiveControls}</td>
                  <td className="px-3 py-2.5 text-center text-status-fail-fg">
                    {report.ineffectiveControls > 0 ? report.ineffectiveControls : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center text-text-muted">{report.notTestedControls}</td>
                  <td className="px-3 py-2.5 text-center">
                    {report.openFindings > 0
                      ? <span className="text-status-warn-fg">{report.openFindings}</span>
                      : <span className="text-text-muted">—</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 4. Consolidated Findings ─────────────────────────────────────── */}
        {allFindings.length > 0 && (
          <div>
            <SectionHeader icon={AlertTriangle} title="Consolidated Findings"
              subtitle={`${allFindings.length} finding${allFindings.length !== 1 ? 's' : ''} across all frameworks`} />
            <div className="space-y-2">
              {['CRITICAL','HIGH','MEDIUM','LOW'].map(sev => {
                const group = allFindings.filter(f => f.severity === sev)
                if (group.length === 0) return null
                const cfg = SEVERITY_CFG[sev]
                return (
                  <div key={sev}>
                    <p className={cn('text-[10px] font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1.5', cfg.color)}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />{sev} ({group.length})
                    </p>
                    <div className="space-y-1.5 pl-3">
                      {group.map(f => (
                        <div key={f.id} className={cn('rounded-card border p-3', cfg.bg)}>
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-medium text-text-primary">{f.title}</span>
                                <span className="text-[9px] font-mono text-status-tag-fg bg-status-tag-bg px-1 rounded">
                                  {f.frameworkRef}
                                </span>
                                {f.status && (
                                  <span className="text-[9px] text-text-muted border border-border px-1 rounded">
                                    {f.status.replace(/_/g,' ')}
                                  </span>
                                )}
                              </div>
                              {f.description && (
                                <p className="text-[11px] text-text-muted mt-1 line-clamp-2">{f.description}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── 5. Per-Engagement Detail ─────────────────────────────────────── */}
        <div className="print-break">
          <SectionHeader icon={Layers} title="Per-Engagement Detail"
            subtitle="Expand each framework to see full control results" />
          <div className="space-y-3">
            {engagements.map(eng => <EngagementRow key={eng.engagementId} eng={eng} />)}
          </div>
        </div>

        {/* ── 5b. Audit Opinion & Review Narratives ───────────────────────── */}
        {(report.engagementReviews || []).some(r => r.auditOpinion || r.executiveSummary) && (
          <div>
            <SectionHeader icon={FileText} title="Audit Opinion & Review Narratives"
              subtitle="Auditor conclusions per engagement" />
            <div className="space-y-4">
              {(report.engagementReviews || []).map(rev => (
                <div key={rev.engagementId} className="bg-surface border border-border rounded-card p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-mono text-status-tag-fg bg-status-tag-bg px-1.5 py-0.5 rounded">
                      {rev.engagementRef}
                    </span>
                    <span className="text-sm font-semibold text-text-primary">{rev.name}</span>
                    {rev.auditOpinion && (
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border',
                        rev.auditOpinion === 'UNQUALIFIED' ? 'text-status-pass-fg bg-status-pass-bg border-status-pass-bd' :
                        rev.auditOpinion === 'QUALIFIED'   ? 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd' :
                                                             'text-status-fail-fg   bg-status-fail-bg   border-status-fail-bd')}>
                        {rev.auditOpinion.replace(/_/g, ' ')}
                      </span>
                    )}
                    {rev.overallRating && (
                      <span className="text-[10px] text-text-muted border border-border px-2 py-0.5 rounded">
                        {rev.overallRating.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  {rev.executiveSummary && (
                    <div className="mb-2">
                      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Executive Summary</p>
                      <p className="text-xs text-text-secondary leading-relaxed">{rev.executiveSummary}</p>
                    </div>
                  )}
                  {rev.reviewComments && (
                    <div className="mb-2">
                      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Review Comments</p>
                      <p className="text-xs text-text-secondary leading-relaxed">{rev.reviewComments}</p>
                    </div>
                  )}
                  {rev.scopeLimitations && (
                    <div>
                      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Scope Limitations</p>
                      <p className="text-xs text-status-warn-fg leading-relaxed">{rev.scopeLimitations}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 5c. Cross-Framework Consolidation ───────────────────────────── */}
        {(report.crossFrameworkNotes || report.programmeRisk) && (
          <div>
            <SectionHeader icon={Layers} title="Cross-Framework Consolidation"
              subtitle="Programme-level themes and risk assessment" />
            <div className="bg-surface border border-border rounded-card p-5 space-y-4">
              {report.programmeRisk && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Programme Risk:</span>
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded border',
                    report.programmeRisk === 'LOW'      ? 'text-status-pass-fg bg-status-pass-bg border-status-pass-bd' :
                    report.programmeRisk === 'MEDIUM'   ? 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd' :
                    report.programmeRisk === 'HIGH'     ? 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd' :
                                                          'text-status-fail-fg bg-status-fail-bg border-status-fail-bd')}>
                    {report.programmeRisk}
                  </span>
                </div>
              )}
              {report.crossFrameworkNotes && (
                <p className="text-xs text-text-secondary leading-relaxed">{report.crossFrameworkNotes}</p>
              )}
            </div>
          </div>
        )}

        {/* ── 5d. Management Response ──────────────────────────────────────── */}
        {report.managementResponse && (
          <div>
            <SectionHeader icon={Info} title="Management Response"
              subtitle="Formal management response to audit findings" />
            <div className="bg-surface border border-border rounded-card p-5 space-y-4">
              {report.acceptanceOfFindings && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Findings Acceptance:</span>
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded border',
                    report.acceptanceOfFindings === 'ACCEPTED' ? 'text-status-pass-fg bg-status-pass-bg border-status-pass-bd' :
                    report.acceptanceOfFindings === 'PARTIAL'  ? 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd' :
                                                                  'text-status-fail-fg bg-status-fail-bg border-status-fail-bd')}>
                    {report.acceptanceOfFindings}
                  </span>
                </div>
              )}
              <p className="text-xs text-text-secondary leading-relaxed">{report.managementResponse}</p>
              {report.correctiveActions && (
                <div>
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Corrective Actions</p>
                  <p className="text-xs text-text-secondary leading-relaxed">{report.correctiveActions}</p>
                </div>
              )}
              {report.committedClosureDate && (
                <p className="text-[10px] text-text-muted">
                  Committed closure: <span className="text-text-secondary font-medium">{fmt(report.committedClosureDate)}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── 6. Workflow Audit Trail ──────────────────────────────────────── */}
        <div>
          <SectionHeader icon={Activity} title="Workflow Audit Trail"
            subtitle="Project lifecycle step history" />
          <div className="bg-surface border border-border rounded-card p-5">
            <WorkflowTimeline steps={steps} />
          </div>
        </div>

        {/* ── 7. Sign-off block ────────────────────────────────────────────── */}
        <div className="bg-surface border border-border rounded-card p-6">
          <SectionHeader icon={Shield} title="Programme Sign-off" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
            {['Programme Lead', 'Quality Reviewer', 'Executive Sponsor'].map(role => (
              <div key={role} className="border-t border-border pt-4">
                <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">{role}</p>
                <div className="h-8 border-b border-dashed border-border/60 mb-1" />
                <p className="text-[10px] text-text-muted">Name / Date</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-text-muted mt-6 text-center">
            {report.projectName} · {report.instanceRef} · Generated {fmt(report.generatedAt || new Date())} · KashiGRC Platform
          </p>
        </div>

      </div>
    </div>
  )
}