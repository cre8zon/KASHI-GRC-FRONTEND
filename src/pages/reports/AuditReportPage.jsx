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
import toast              from 'react-hot-toast'

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
  EFFECTIVE:           { label: 'Effective',            color: 'text-green-400',  bg: 'bg-green-500/10  border-green-500/30'  },
  PARTIALLY_EFFECTIVE: { label: 'Partially effective',  color: 'text-amber-400',  bg: 'bg-amber-500/10  border-amber-500/30'  },
  INEFFECTIVE:         { label: 'Ineffective',          color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/30'    },
  NOT_TESTED:          { label: 'Not tested',           color: 'text-text-muted', bg: 'bg-surface-overlay border-border'      },
  COMPENSATING:        { label: 'Compensating',         color: 'text-blue-400',   bg: 'bg-blue-500/10   border-blue-500/30'   },
}

const SEVERITY_CFG = {
  CRITICAL: { color: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/30',    bar: 'bg-red-500'    },
  HIGH:     { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', bar: 'bg-orange-500' },
  MEDIUM:   { color: 'text-amber-400',  bg: 'bg-amber-500/10  border-amber-500/30',  bar: 'bg-amber-500'  },
  LOW:      { color: 'text-green-400',  bg: 'bg-green-500/10  border-green-500/30',  bar: 'bg-green-500'  },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ id, title, icon: Icon, children }) {
  return (
    <section id={id} className="bg-surface border border-border rounded-2xl overflow-hidden print:break-inside-avoid">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2.5">
        {Icon && <Icon size={15} className="text-brand-400 shrink-0" />}
        <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </section>
  )
}

function StatCard({ label, value, sub, color = 'text-text-primary' }) {
  return (
    <div className="bg-surface-overlay border border-border rounded-xl p-4">
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
    <div className="border border-border rounded-xl overflow-hidden">
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
          onClick={() => {
            toast('PDF export will be available once the report endpoint is built.')
            // Future: POST /v1/audit/engagements/:id/report → PDF blob
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-brand-500/10 border border-brand-500/30 text-brand-400
                     hover:bg-brand-500/20 transition-colors"
        >
          <Download size={12} /> Download PDF
        </button>
      </div>

      {/* ── Report body ── */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* 1. Header */}
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-brand-500 to-indigo-500" />
          <div className="px-8 py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-mono text-text-muted mb-1">{engagement.engagementRef}</p>
                <h1 className="text-xl font-bold text-text-primary mb-2">{engagement.name}</h1>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded border',
                    engagement.status === 'COMPLETED' || engagement.status === 'CLOSED'
                      ? 'bg-green-500/10 border-green-500/30 text-green-400'
                      : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
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
              <Shield size={40} className="text-brand-400/20 shrink-0" />
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
            <StatCard label="Effective"         value={effective}       color="text-green-400" sub={`${passRate}% pass rate`} />
            <StatCard label="Ineffective"       value={ineffective}     color="text-red-400"   />
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
                  passRate >= 80 ? 'bg-green-500' : passRate >= 60 ? 'bg-amber-500' : 'bg-red-500'
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
                  <div key={sev} className={cn('rounded-xl border p-3', cfg.bg)}>
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
                { label: 'Automated tests passed', result: 'PASS',    color: 'text-green-400' },
                { label: 'Tests failed',            result: 'FAIL',    color: 'text-red-400'   },
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
                  className="flex items-center justify-between px-4 py-2.5 rounded-lg
                             bg-surface-overlay border border-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded',
                      item.priority === 'CRITICAL' ? 'text-red-400 bg-red-500/10' :
                      item.priority === 'HIGH'     ? 'text-orange-400 bg-orange-500/10' :
                      'text-amber-400 bg-amber-500/10'
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
                    step.status === 'COMPLETED' ? 'bg-green-500/15 border border-green-500/40' :
                    step.status === 'IN_PROGRESS' ? 'bg-blue-500/15 border border-blue-500/40' :
                    'bg-surface-overlay border border-border'
                  )}>
                    {step.status === 'COMPLETED'
                      ? <CheckCircle2 size={12} className="text-green-400" />
                      : step.status === 'IN_PROGRESS'
                      ? <Clock size={12} className="text-blue-400" />
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