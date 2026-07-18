/**
 * AuditReportPage — /audit/engagements/:id/report
 *
 * Read-only, stakeholder-friendly audit engagement report.
 * Mirrors AssessmentReportPage structure and design tokens.
 *
 * SECTIONS:
 *   1. Header — engagement name, ref, type, framework, dates, auditor
 *   2. Executive Summary — overall result, control pass rate, finding counts by severity
 *   3. Control Results — section-by-section breakdown with EFFECTIVE/INEFFECTIVE/NOT_TESTED
 *   4. Findings — all findings grouped by severity with status and remediation info
 *   5. Test Results — test execution summary (passed/failed/not run per automation type)
 *   6. Open Action Items — unresolved action items linked to this engagement
 *   7. Workflow Audit Trail — step history with actors, timestamps, remarks
 *   8. Sign-off chain — lead auditor, approvers, closure date
 *
 * BACKEND ENDPOINTS USED:
 *   GET /v1/audit/engagements/:id                          — engagement header data
 *   GET /v1/audit/engagements/:id/controls                 — all control instances
 *   GET /v1/audit/engagements/:id/findings                 — all findings (NOT YET BUILT — graceful empty)
 *   GET /v1/workflow-instances/:workflowInstanceId/progress — step timeline
 *   GET /v1/action-items?entityType=AUDIT_ENGAGEMENT&entityId=:id — open action items
 *
 * HOW TO TRIGGER PDF EXPORT:
 *   The "Download PDF" button calls window.print() after applying print-optimised styles.
 *   For server-side PDF, replace the onClick with:
 *     POST /v1/audit/engagements/:id/report → returns PDF blob → window.open(blobUrl)
 *   The server endpoint does not exist yet — placeholder button is included.
 *
 * DESIGN:
 *   Follows the same design tokens as AssessmentReportPage.
 *   bg-surface, border-border, text-text-primary, text-brand-400.
 *   Print CSS collapses sidebar and adds page-break hints.
 */

import { useState }       from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery }       from '@tanstack/react-query'
import {
  ArrowLeft, Download, Shield, CheckCircle2, XCircle,
  AlertTriangle, Clock, FileText, Activity, ChevronDown,
  ChevronRight, User, Calendar, Hash, BarChart2, Zap,
  Loader2, Info,
} from 'lucide-react'
import { cn }             from '../../lib/cn'
import api                from '../../config/axios.config'

// ─── Data fetching ────────────────────────────────────────────────────────────

const fetchEngagement  = (id) => api.get(`/v1/audit/engagements/${id}`)
const fetchControls    = (id) => api.get(`/v1/audit/engagements/${id}/controls`)
  .then(r => Array.isArray(r) ? r : (r?.items ?? r?.data?.items ?? r?.data ?? []))
  .catch(() => [])
const fetchFindings    = (id) => api.get(`/v1/audit/findings`, { params: { engagementId: id } })
  .then(r => Array.isArray(r) ? r : (r?.items ?? r?.data?.items ?? r?.data?.data ?? r?.data ?? []))
  .catch(() => [])   // graceful empty
const fetchProgress    = (instanceId) => instanceId
  ? api.get(`/v1/workflow-instances/${instanceId}/steps`)
      .then(r => { const d = r?.data?.steps || r?.steps || r?.data || r; return Array.isArray(d) ? d : [] })
      .catch(() => [])
  : Promise.resolve([])
const fetchActionItems = (id) =>
  api.get('/v1/action-items', { params: { entityType: 'AUDIT_ENGAGEMENT', entityId: id } })
    .then(r => Array.isArray(r) ? r : (r?.items ?? []))
    .catch(() => [])

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (dt) => dt
  ? new Date(dt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—'

const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : 0

// ─── Config ───────────────────────────────────────────────────────────────────

const RESULT_CFG = {
  EFFECTIVE:           { label: 'Effective',            color: 'text-status-pass-fg',  bg: 'bg-status-pass-bg  border-status-pass-bd'  },
  PARTIALLY_EFFECTIVE: { label: 'Partially effective',  color: 'text-status-warn-fg',  bg: 'bg-status-warn-bg  border-status-warn-bd'  },
  INEFFECTIVE:         { label: 'Ineffective',          color: 'text-status-fail-fg',    bg: 'bg-status-fail-bg    border-status-fail-bd'    },
  NOT_TESTED:          { label: 'Not tested',           color: 'text-text-muted', bg: 'bg-surface-overlay border-border'      },
  COMPENSATING:        { label: 'Compensating',         color: 'text-status-info-fg',   bg: 'bg-status-info-bg   border-status-info-bd'   },
}

const SEVERITY_CFG = {
  CRITICAL: { color: 'text-status-fail-fg',    bg: 'bg-status-fail-bg    border-status-fail-bd',    bar: 'bg-status-fail-bg'    },
  HIGH:     { color: 'text-status-warn-fg', bg: 'bg-status-warn-bg border-status-warn-bd', bar: 'bg-status-warn-bg' },
  MEDIUM:   { color: 'text-status-warn-fg',  bg: 'bg-status-warn-bg  border-status-warn-bd',  bar: 'bg-status-warn-bg'  },
  LOW:      { color: 'text-status-pass-fg',  bg: 'bg-status-pass-bg  border-status-pass-bd',  bar: 'bg-status-pass-bg'  },
}

// ─── PDF Generator ────────────────────────────────────────────────────────────
async function generatePDF(engagement, controls = [], findings = [], progress = [], actionItems = []) {
  const fmtDate  = (dt) => dt ? new Date(dt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long',  year: 'numeric' }) : '—'
  const fmtShort = (dt) => dt ? new Date(dt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  const totalControls = controls.length
  const effective     = controls.filter(c => c.testResult === 'EFFECTIVE').length
  const ineffective   = controls.filter(c => c.testResult === 'INEFFECTIVE').length
  const partiallyEff  = controls.filter(c => c.testResult === 'PARTIALLY_EFFECTIVE').length
  const notTested     = controls.filter(c => !c.testResult || c.testResult === 'NOT_TESTED').length
  const passRate      = totalControls > 0 ? Math.round((effective / totalControls) * 100) : 0
  const openFindings  = findings.filter(f => f.status === 'OPEN' || f.status === 'IN_REMEDIATION').length

  const pctColor = passRate >= 80 ? 'var(--rpt-pass-fg)' : passRate >= 60 ? 'var(--rpt-warn-bd)' : 'var(--rpt-crit-bd)'
  const pctBg    = passRate >= 80 ? 'var(--rpt-pass-bg)'  : passRate >= 60 ? 'var(--rpt-warn-bg)'  : 'var(--rpt-crit-bg)'

  // ── Section-grouped control rows ───────────────────────────────────────────
  const sectionMap = {}
  controls.forEach(c => {
    const sec = c.sectionPath || c.sectionNameSnapshot || 'Ungrouped'
    if (!sectionMap[sec]) sectionMap[sec] = []
    sectionMap[sec].push(c)
  })

  const controlSections = Object.entries(sectionMap).map(([secName, ctrls]) => {
    const secEff  = ctrls.filter(c => c.testResult === 'EFFECTIVE').length
    const secIneff= ctrls.filter(c => c.testResult === 'INEFFECTIVE').length
    const secNT   = ctrls.filter(c => !c.testResult || c.testResult === 'NOT_TESTED').length
    const secPct  = ctrls.length > 0 ? Math.round((secEff / ctrls.length) * 100) : 0
    const secColor= secPct >= 80 ? 'var(--rpt-pass-fg)' : secPct >= 60 ? 'var(--rpt-warn-bd)' : 'var(--rpt-crit-bd)'

    const passW = Math.round(secEff   / Math.max(ctrls.length, 1) * 160)
    const failW = Math.round(secIneff / Math.max(ctrls.length, 1) * 160)
    const ntW   = 160 - passW - failW
    const barSvg = `<svg width="160" height="7" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="160" height="7" rx="3" fill="var(--rpt-border)"/>
      <rect x="0" y="0" width="${passW}" height="7" rx="3" fill="var(--rpt-pass-bd)"/>
      <rect x="${passW}" y="0" width="${failW}" height="7" fill="var(--rpt-crit-bd)"/>
      <rect x="${passW+failW}" y="0" width="${ntW}" height="7" rx="3" fill="var(--rpt-border)"/>
    </svg>`

    const ctrlRows = ctrls.map((c, i) => {
      const rc = c.testResult === 'EFFECTIVE' ? 'var(--rpt-pass-fg)'
               : c.testResult === 'INEFFECTIVE' ? 'var(--rpt-crit-bd)'
               : c.testResult === 'PARTIALLY_EFFECTIVE' ? 'var(--rpt-warn-bd)' : 'var(--rpt-muted)'
      const rb = c.testResult === 'EFFECTIVE' ? 'var(--rpt-pass-bg)'
               : c.testResult === 'INEFFECTIVE' ? 'var(--rpt-crit-bg)'
               : c.testResult === 'PARTIALLY_EFFECTIVE' ? 'var(--rpt-warn-bg)' : 'var(--rpt-bg-soft)'
      return `<tr style="background:${i%2===0?'var(--rpt-white)':'var(--rpt-paper)'}">
        <td style="padding:7px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:11px;font-weight:600;color:var(--rpt-ink)">${c.controlCodeSnapshot||c.controlRef||'—'}</td>
        <td style="padding:7px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:11px">${(c.controlNameSnapshot||c.name||'').replace(/</g,'&lt;')}</td>
        <td style="padding:7px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:11px;color:var(--rpt-muted)">${c.frameworkRefSnapshot||c.frameworkRef||'—'}</td>
        <td style="padding:7px 14px;border-bottom:1px solid var(--rpt-bg-soft);text-align:center">
          <span style="padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;background:${rb};color:${rc}">
            ${c.testResult||'NOT TESTED'}
          </span>
        </td>
      </tr>`
    }).join('')

    return `
    <tr style="background:var(--rpt-paper)">
      <td colspan="4" style="padding:10px 14px;font-weight:700;font-size:12px;color:var(--rpt-accent);border-top:2px solid var(--rpt-accent-bg);border-bottom:1px solid var(--rpt-accent-bg)">
        ${secName}
        <span style="font-size:10px;font-weight:400;color:var(--rpt-muted);margin-left:12px">
          ${ctrls.length} controls · ${barSvg} <span style="vertical-align:middle;font-weight:700;color:${secColor}">${secPct}%</span>
        </span>
      </td>
    </tr>
    ${ctrlRows}`
  }).join('')

  // ── Findings rows ──────────────────────────────────────────────────────────
  const findingRows = findings.slice(0, 50).map((f, i) => {
    const sc = f.severity === 'CRITICAL' ? 'var(--rpt-crit-bd)' : f.severity === 'HIGH' ? 'var(--rpt-high-bd)' : f.severity === 'MEDIUM' ? 'var(--rpt-warn-bd)' : 'var(--rpt-muted)'
    const sb = f.severity === 'CRITICAL' ? 'var(--rpt-crit-bg)' : f.severity === 'HIGH' ? 'var(--rpt-high-bg)' : f.severity === 'MEDIUM' ? 'var(--rpt-warn-bg)' : 'var(--rpt-bg-soft)'
    const stc = f.status === 'CLOSED' || f.status === 'RESOLVED' ? 'var(--rpt-pass-fg)' : f.status === 'IN_REMEDIATION' ? 'var(--rpt-accent)' : 'var(--rpt-crit-bd)'
    const stb = f.status === 'CLOSED' || f.status === 'RESOLVED' ? 'var(--rpt-pass-bg)'  : f.status === 'IN_REMEDIATION' ? 'var(--rpt-accent-bg)'  : 'var(--rpt-crit-bg)'
    return `<tr style="background:${i%2===0?'var(--rpt-white)':'var(--rpt-paper)'}">
      <td style="padding:9px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:12px;font-weight:600">${(f.title||'').replace(/</g,'&lt;')}</td>
      <td style="padding:9px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:11px;color:var(--rpt-ink)">${(f.description||'—').slice(0,120).replace(/</g,'&lt;')}</td>
      <td style="padding:9px 14px;border-bottom:1px solid var(--rpt-bg-soft);text-align:center">
        ${f.severity ? `<span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${sb};color:${sc}">${f.severity}</span>` : '—'}
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid var(--rpt-bg-soft);text-align:center">
        <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${stb};color:${stc}">${f.status||'OPEN'}</span>
      </td>
    </tr>`
  }).join('')

  // ── Action items ───────────────────────────────────────────────────────────
  const openItems = actionItems.filter(a => ['OPEN','IN_PROGRESS','PENDING_REVIEW'].includes(a.status))
  const actionRows = openItems.slice(0, 30).map((a, i) => {
    const pc = a.priority === 'CRITICAL' ? 'var(--rpt-crit-bd)' : a.priority === 'HIGH' ? 'var(--rpt-high-bd)' : a.priority === 'MEDIUM' ? 'var(--rpt-warn-bd)' : 'var(--rpt-muted)'
    const pb = a.priority === 'CRITICAL' ? 'var(--rpt-crit-bg)' : a.priority === 'HIGH' ? 'var(--rpt-high-bg)' : a.priority === 'MEDIUM' ? 'var(--rpt-warn-bg)' : 'var(--rpt-bg-soft)'
    return `<tr style="background:${i%2===0?'var(--rpt-white)':'var(--rpt-paper)'}">
      <td style="padding:9px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:12px">${(a.title||'').replace(/</g,'&lt;')}</td>
      <td style="padding:9px 14px;border-bottom:1px solid var(--rpt-bg-soft);text-align:center">
        ${a.priority ? `<span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${pb};color:${pc}">${a.priority}</span>` : '—'}
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid var(--rpt-bg-soft);text-align:center;font-size:11px;color:${a.dueAt && new Date(a.dueAt) < new Date() ? 'var(--rpt-crit-bd)' : 'var(--rpt-ink)'}">
        ${a.dueAt ? fmtShort(a.dueAt) : '—'}
      </td>
    </tr>`
  }).join('')

  // ── Sign-off chain ─────────────────────────────────────────────────────────
  const signOffRows = progress
    .filter(s => s.status === 'APPROVED' || s.completedAt)
    .map(s => `<tr>
      <td style="padding:8px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:12px;font-weight:600">${s.stepName||s.name||'—'}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:11px;color:var(--rpt-muted)">${s.completedByName||s.actor||'—'}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--rpt-bg-soft);font-size:11px;color:var(--rpt-muted)">${fmtShort(s.completedAt||s.actedAt)}</td>
      <td style="padding:8px 14px;border-bottom:1px solid var(--rpt-bg-soft);text-align:center">
        <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:var(--rpt-pass-bg);color:var(--rpt-pass-fg)">APPROVED</span>
      </td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>${engagement.name||'Audit Report'} — ${engagement.engagementRef||''}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;color:var(--rpt-ink)}
  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page-break{page-break-before:always}
    @page{margin:15mm;size:A4}
  }
  .header{background:linear-gradient(135deg,var(--rpt-ink) 0%,var(--rpt-accent) 100%);color:#fff;padding:32px 40px}
  .header-meta{font-size:11px;opacity:.7;margin-bottom:8px;letter-spacing:.05em;text-transform:uppercase}
  .header-title{font-size:26px;font-weight:800;margin-bottom:6px}
  .header-sub{font-size:13px;opacity:.8;margin-bottom:16px}
  .header-pills{display:flex;gap:10px;flex-wrap:wrap}
  .pill{font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;border:1px solid rgb(var(--color-on-dark) / .3);color:#fff}
  .kpi-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--rpt-border)}
  .kpi{background:#fff;padding:20px 16px;text-align:center}
  .kpi-val{font-size:28px;font-weight:800;line-height:1}
  .kpi-lbl{font-size:10px;color:var(--rpt-muted);margin-top:4px;text-transform:uppercase;letter-spacing:.05em}
  .section-label{font-size:11px;font-weight:700;color:var(--rpt-muted);text-transform:uppercase;letter-spacing:.08em;padding:20px 24px 10px;border-top:2px solid var(--rpt-border);margin-top:8px}
  table{width:100%;border-collapse:collapse}
  thead th{padding:10px 14px;background:var(--rpt-bg-soft);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--rpt-muted);text-align:left;border-bottom:2px solid var(--rpt-border)}
  .compliance-bar-wrap{padding:16px 24px}
  .compliance-bar-track{width:100%;height:12px;background:var(--rpt-border);border-radius:6px;overflow:hidden}
  .compliance-bar-fill{height:100%;border-radius:6px;background:${passRate>=80?'var(--rpt-pass-bd)':passRate>=60?'var(--rpt-warn-bd)':'var(--rpt-crit-bd)'};width:${passRate}%}
  .footer{padding:24px 40px;text-align:center;font-size:10px;color:var(--rpt-muted);border-top:1px solid var(--rpt-border);margin-top:32px}
</style></head><body>

<div class="header">
  <div class="header-meta">Audit Engagement Report · Generated ${fmtDate(new Date())}</div>
  <div class="header-title">${engagement.name||'Audit Report'}</div>
  <div class="header-sub">${engagement.engagementRef||''} · ${engagement.frameworkRef||'—'}</div>
  <div class="header-pills">
    ${engagement.auditType ? `<span class="pill">${engagement.auditType}</span>` : ''}
    ${engagement.plannedStart ? `<span class="pill">${fmtDate(engagement.plannedStart)} – ${fmtDate(engagement.plannedEnd)}</span>` : ''}
    ${engagement.status ? `<span class="pill">${engagement.status}</span>` : ''}
  </div>
</div>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val" style="color:${pctColor};background:${pctBg};padding:6px 10px;border-radius:8px;display:inline-block">${passRate}%</div><div class="kpi-lbl">Compliance</div></div>
  <div class="kpi"><div class="kpi-val" style="color:var(--rpt-pass-fg)">${effective}</div><div class="kpi-lbl">Effective of ${totalControls}</div></div>
  <div class="kpi"><div class="kpi-val" style="color:var(--rpt-crit-bd)">${ineffective}</div><div class="kpi-lbl">Ineffective</div></div>
  <div class="kpi"><div class="kpi-val" style="color:var(--rpt-muted)">${notTested}</div><div class="kpi-lbl">Not Tested</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${openFindings>0?'var(--rpt-crit-bd)':'var(--rpt-pass-fg)'}">${openFindings}</div><div class="kpi-lbl">Open Findings</div></div>
</div>

<div class="compliance-bar-wrap">
  <div class="compliance-bar-track"><div class="compliance-bar-fill"></div></div>
</div>

<div class="section-label">Control Results by Section</div>
<table>
  <thead><tr><th>Ref</th><th>Control</th><th>Framework</th><th style="text-align:center">Result</th></tr></thead>
  <tbody>${controlSections}</tbody>
</table>

${findings.length > 0 ? `
<div class="section-label page-break">Findings (${findings.length} total · ${openFindings} open)</div>
<table>
  <thead><tr><th>Finding</th><th>Description</th><th style="text-align:center">Severity</th><th style="text-align:center">Status</th></tr></thead>
  <tbody>${findingRows}</tbody>
</table>
` : `<div style="padding:16px 24px;margin:16px 24px;background:var(--rpt-pass-bg);border:1px solid var(--rpt-pass-bd);border-radius:8px;font-size:12px;color:var(--rpt-pass-fg)">✓ No findings recorded for this engagement.</div>`}

${openItems.length > 0 ? `
<div class="section-label">Open Action Items</div>
<table>
  <thead><tr><th>Title</th><th style="text-align:center">Priority</th><th style="text-align:center">Due</th></tr></thead>
  <tbody>${actionRows}</tbody>
</table>` : ''}

${signOffRows ? `
<div class="section-label page-break">Workflow Sign-off Chain</div>
<table>
  <thead><tr><th>Step</th><th>Completed By</th><th>Date</th><th style="text-align:center">Status</th></tr></thead>
  <tbody>${signOffRows}</tbody>
</table>` : ''}

<div class="footer">
  ${engagement.name||'Audit Engagement'} · ${engagement.engagementRef||''} · Generated ${fmtDate(new Date())} · KashiGRC
</div>
</body></html>`

  const win = window.open('', '_blank', 'width=1000,height=800')
  if (!win) { alert('Please allow popups for PDF generation'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 700)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ id, title, icon: Icon, children }) {
  return (
    <section id={id} className="bg-surface border border-border rounded-modal overflow-hidden print:break-inside-avoid">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2.5">
        {Icon && <Icon size={15} className="text-brand-ink shrink-0" />}
        <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </section>
  )
}

function StatCard({ label, value, sub, color = 'text-text-primary' }) {
  return (
    <div className="bg-surface-overlay border border-border rounded-card p-4">
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', color)}>{value ?? '—'}</p>
      {sub && <p className="text-[11px] text-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function ResultChip({ result }) {
  const cfg = RESULT_CFG[result] || RESULT_CFG.NOT_TESTED
  return (
    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', cfg.bg, cfg.color)}>
      {cfg.label}
    </span>
  )
}

function CollapsibleSection({ title, count, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border border-border rounded-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3
                   bg-surface-overlay hover:bg-surface-secondary transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={13} className="text-text-muted" /> : <ChevronRight size={13} className="text-text-muted" />}
          <span className="text-xs font-semibold text-text-secondary">{title}</span>
          {count != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface text-text-muted border border-border">
              {count}
            </span>
          )}
        </div>
      </button>
      {open && <div className="divide-y divide-border/50">{children}</div>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AuditReportPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const [generatingPDF, setGeneratingPDF] = useState(false)

  const handleDownloadPDF = async () => {
    setGeneratingPDF(true)
    try { await generatePDF(engagement, controls, findings, progress, actionItems) }
    catch (e) { console.error('PDF generation failed', e) }
    finally { setGeneratingPDF(false) }
  }

  const { data: engRes, isLoading } = useQuery({
    queryKey: ['audit-report-engagement', id],
    queryFn:  () => fetchEngagement(id),
    enabled:  !!id,
  })
  const engagement = engRes?.data || engRes

  const { data: controls = [] } = useQuery({
    queryKey: ['audit-report-controls', id],
    queryFn:  () => fetchControls(id),
    enabled:  !!id,
  })

  const { data: findings = [] } = useQuery({
    queryKey: ['audit-report-findings', id],
    queryFn:  () => fetchFindings(id),
    enabled:  !!id,
  })

  const { data: progress = [] } = useQuery({
    queryKey: ['audit-report-progress', engagement?.workflowInstanceId],
    queryFn:  () => fetchProgress(engagement?.workflowInstanceId),
    enabled:  !!engagement?.workflowInstanceId,
  })

  const { data: actionItems = [] } = useQuery({
    queryKey: ['audit-report-actions', id],
    queryFn:  () => fetchActionItems(id),
    enabled:  !!id,
  })

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalControls   = controls.length
  const effective       = controls.filter(c => c.testResult === 'EFFECTIVE').length
  const ineffective     = controls.filter(c => c.testResult === 'INEFFECTIVE').length
  const partiallyEff    = controls.filter(c => c.testResult === 'PARTIALLY_EFFECTIVE').length
  const notTested       = controls.filter(c => !c.testResult || c.testResult === 'NOT_TESTED').length
  const passRate        = pct(effective, totalControls)

  const findingsBySev   = ['CRITICAL','HIGH','MEDIUM','LOW'].map(sev => ({
    sev,
    items: findings.filter(f => f.severity === sev),
  })).filter(g => g.items.length > 0)

  const openActionItems = actionItems.filter(a =>
    ['OPEN','IN_PROGRESS','PENDING_REVIEW'].includes(a.status)
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={20} className="animate-spin text-text-muted" />
      </div>
    )
  }

  if (!engagement) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Info size={24} className="text-text-muted" />
        <p className="text-sm text-text-muted">Engagement not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">

      {/* ── Page header ── */}
      <div className="sticky top-0 z-10 bg-surface border-b border-border px-6 py-3
                      flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={15} />
          </button>
          <div>
            <p className="text-xs font-semibold text-text-primary">{engagement.name}</p>
            <p className="text-[10px] text-text-muted font-mono">{engagement.engagementRef}</p>
          </div>
        </div>
        <button
          onClick={handleDownloadPDF}
          disabled={generatingPDF}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-card text-xs font-medium
                     bg-brand-500/10 border border-brand-500/30 text-brand-ink
                     hover:bg-brand-500/20 transition-colors disabled:opacity-50"
        >
          <Download size={12} className={generatingPDF ? 'animate-pulse' : ''} />
          {generatingPDF ? 'Generating…' : 'Download PDF'}
        </button>
      </div>

      {/* ── Report body ── */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* 1. Header */}
        <div className="bg-surface border border-border rounded-modal overflow-hidden">
          <div className="h-1.5 bg-brand-500" />
          <div className="px-8 py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-mono text-text-muted mb-1">{engagement.engagementRef}</p>
                <h1 className="text-xl font-bold text-text-primary mb-2">{engagement.name}</h1>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded border',
                    engagement.status === 'COMPLETED' || engagement.status === 'CLOSED'
                      ? 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg'
                      : 'bg-status-info-bg border-status-info-bd text-status-info-fg'
                  )}>
                    {engagement.status?.replace(/_/g,' ')}
                  </span>
                  {engagement.auditType && (
                    <span className="text-[10px] font-semibold text-text-muted">
                      {engagement.auditType} AUDIT
                    </span>
                  )}
                  {engagement.frameworkRef && (
                    <span className="text-[10px] font-mono text-text-muted border border-border
                                     rounded px-1.5 py-0.5">
                      {engagement.frameworkRef}
                    </span>
                  )}
                </div>
              </div>
              <Shield size={40} className="text-brand-ink/20 shrink-0" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-4 pt-5 border-t border-border">
              {[
                { label: 'Planned start', value: fmt(engagement.plannedStart), icon: Calendar },
                { label: 'Planned end',   value: fmt(engagement.plannedEnd),   icon: Calendar },
                { label: 'Report date',   value: fmt(new Date()),              icon: Clock },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label}>
                  <p className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-0.5">{label}</p>
                  <div className="flex items-center gap-1.5">
                    <Icon size={11} className="text-text-muted" />
                    <span className="text-xs text-text-primary font-medium">{value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Executive summary */}
        <Section id="summary" title="Executive Summary" icon={BarChart2}>
          <div className="grid grid-cols-4 gap-3 mb-6">
            <StatCard label="Total controls"   value={totalControls}  />
            <StatCard label="Effective"         value={effective}       color="text-status-pass-fg" sub={`${passRate}% pass rate`} />
            <StatCard label="Ineffective"       value={ineffective}     color="text-status-fail-fg"   />
            <StatCard label="Not tested"        value={notTested}       color="text-text-muted" />
          </div>
          {/* Pass rate bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-text-muted">Overall control effectiveness</span>
              <span className="text-xs font-semibold text-text-secondary">{passRate}%</span>
            </div>
            <div className="h-2 bg-surface-overlay rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all',
                  passRate >= 80 ? 'bg-status-pass-bg' : passRate >= 60 ? 'bg-status-warn-bg' : 'bg-status-fail-bg'
                )}
                style={{ width: `${passRate}%` }}
              />
            </div>
          </div>
          {findings.length > 0 && (
            <div className="mt-5 grid grid-cols-4 gap-2">
              {['CRITICAL','HIGH','MEDIUM','LOW'].map(sev => {
                const count = findings.filter(f => f.severity === sev).length
                const cfg   = SEVERITY_CFG[sev]
                return (
                  <div key={sev} className={cn('rounded-card border p-3', cfg.bg)}>
                    <p className={cn('text-[10px] font-bold uppercase tracking-wide', cfg.color)}>{sev}</p>
                    <p className={cn('text-xl font-bold tabular-nums', cfg.color)}>{count}</p>
                    <p className="text-[10px] text-text-muted">finding{count !== 1 ? 's' : ''}</p>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* 3. Control results */}
        <Section id="controls" title="Control Results" icon={Shield}>
          {controls.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-6">No controls in this engagement</p>
          ) : (
            <div className="space-y-2">
              {/* Group by section path */}
              {Object.entries(
                controls.reduce((acc, c) => {
                  const section = c.sectionBreadcrumbSnapshot || c.sectionPath || 'General'
                  if (!acc[section]) acc[section] = []
                  acc[section].push(c)
                  return acc
                }, {})
              ).map(([section, sectionControls]) => (
                <CollapsibleSection
                  key={section}
                  title={String(section)}
                  count={sectionControls.length}
                >
                  {sectionControls.map(ctrl => (
                    <div key={ctrl.id}
                      className="flex items-center justify-between px-4 py-2.5
                                 hover:bg-surface-overlay transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[10px] font-mono text-text-muted shrink-0">
                          {ctrl.controlCodeSnapshot || ctrl.controlRefSnapshot || `#${ctrl.id}`}
                        </span>
                        <span className="text-xs text-text-primary truncate">
                          {ctrl.controlNameSnapshot || ctrl.nameSnapshot || '—'}
                        </span>
                      </div>
                      <ResultChip result={ctrl.testResult} />
                    </div>
                  ))}
                </CollapsibleSection>
              ))}
            </div>
          )}
        </Section>

        {/* 4. Findings */}
        {findings.length > 0 && (
          <Section id="findings" title="Findings" icon={AlertTriangle}>
            <div className="space-y-3">
              {findingsBySev.map(({ sev, items }) => {
                const cfg = SEVERITY_CFG[sev]
                return (
                  <CollapsibleSection key={sev} title={sev} count={items.length}>
                    {items.map(f => (
                      <div key={f.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-text-muted">
                              {f.findingRef || `F-${f.id}`}
                            </span>
                            <span className="text-xs font-medium text-text-primary">{f.title}</span>
                          </div>
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border shrink-0',
                            cfg.bg, cfg.color)}>
                            {f.status?.replace(/_/g,' ')}
                          </span>
                        </div>
                        {f.description && (
                          <p className="text-[11px] text-text-muted leading-relaxed ml-0">
                            {f.description}
                          </p>
                        )}
                        {f.remediationPlan && (
                          <p className="text-[10px] text-text-muted mt-1 italic">
                            Remediation: {f.remediationPlan}
                          </p>
                        )}
                      </div>
                    ))}
                  </CollapsibleSection>
                )
              })}
            </div>
          </Section>
        )}

        {/* 5. Test results */}
        {controls.some(c => c.testResult) && (
          <Section id="tests" title="Test Execution Summary" icon={Zap}>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Automated tests passed', result: 'PASS',    color: 'text-status-pass-fg' },
                { label: 'Tests failed',            result: 'FAIL',    color: 'text-status-fail-fg'   },
                { label: 'Not run',                 result: 'NOT_RUN', color: 'text-text-muted' },
              ].map(({ label, result, color }) => {
                // Count test instances across all controls
                const count = controls.reduce((sum, c) => {
                  if (!Array.isArray(c.testInstances)) return sum
                  return sum + c.testInstances.filter(t => t.testResult === result).length
                }, 0)
                return (
                  <StatCard key={result} label={label} value={count} color={color} />
                )
              })}
            </div>
          </Section>
        )}

        {/* 6. Open action items */}
        {openActionItems.length > 0 && (
          <Section id="actions" title="Open Action Items" icon={Activity}>
            <div className="space-y-2">
              {openActionItems.map(item => (
                <div key={item.id}
                  className="flex items-center justify-between px-4 py-2.5 rounded-card
                             bg-surface-overlay border border-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded',
                      item.priority === 'CRITICAL' ? 'text-status-fail-fg bg-status-fail-bg' :
                      item.priority === 'HIGH'     ? 'text-status-warn-fg bg-status-warn-bg' :
                      'text-status-warn-fg bg-status-warn-bg'
                    )}>
                      {item.priority}
                    </span>
                    <span className="text-xs text-text-primary truncate">{item.title}</span>
                  </div>
                  <span className="text-[10px] text-text-muted shrink-0">
                    {item.dueAt ? fmt(item.dueAt) : 'No due date'}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* 7. Workflow audit trail */}
        {progress.length > 0 && (
          <Section id="trail" title="Workflow Audit Trail" icon={Activity}>
            <div className="space-y-3">
              {progress.map((step, i) => (
                <div key={step.stepId || i} className="flex items-start gap-3">
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                    step.status === 'COMPLETED' ? 'bg-status-pass-bg border border-status-pass-bd' :
                    step.status === 'IN_PROGRESS' ? 'bg-status-info-bg border border-status-info-bd' :
                    'bg-surface-overlay border border-border'
                  )}>
                    {step.status === 'COMPLETED'
                      ? <CheckCircle2 size={12} className="text-status-pass-fg" />
                      : step.status === 'IN_PROGRESS'
                      ? <Clock size={12} className="text-status-info-fg" />
                      : <Hash size={12} className="text-text-muted" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-text-secondary">
                        {step.snapStepName || step.stepName || `Step ${i + 1}`}
                      </span>
                      {step.completedAt && (
                        <span className="text-[10px] text-text-muted">{fmt(step.completedAt)}</span>
                      )}
                    </div>
                    {step.actorName && (
                      <p className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1">
                        <User size={9} /> {step.actorName}
                      </p>
                    )}
                    {step.remarks && (
                      <p className="text-[10px] text-text-muted italic mt-0.5">"{step.remarks}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-[10px] text-text-muted">
          <p>Generated by DigiOSec GRC · {new Date().toLocaleString()}</p>
          <p className="mt-0.5">Confidential — for authorised recipients only</p>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}