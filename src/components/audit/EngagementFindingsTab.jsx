/**
 * EngagementFindingsTab — shows all AuditFindings for an engagement.
 *
 * Data: GET /v1/audit/engagements/{engagementId}/findings
 *
 * Per row:
 *   findingRef · title · severity · status · controlRefSnapshot
 *   "Escalate to Issue" button — POST /v1/audit/findings/{id}/escalate-to-issue
 *   → disabled and shows linked issue ID once escalated (linkedIssueId set)
 *
 * AUDITOR: can raise findings, see all findings
 * ORGANIZATION: can escalate to issue, see remediation status
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, CheckCircle2, XCircle, Clock, Info,
  Shield, Link, ChevronRight, RefreshCw, Plus, ArrowUpRight,
} from 'lucide-react'
import api from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

// ── Config ────────────────────────────────────────────────────────────────────

const SEVERITY = {
  CRITICAL:      { label: 'Critical',     color: 'text-status-fail-fg',    bg: 'bg-status-fail-bg',    border: 'border-status-fail-bd' },
  HIGH:          { label: 'High',         color: 'text-status-warn-fg', bg: 'bg-status-warn-bg', border: 'border-status-warn-bd' },
  MEDIUM:        { label: 'Medium',       color: 'text-status-warn-fg',  bg: 'bg-status-warn-bg',  border: 'border-status-warn-bd' },
  LOW:           { label: 'Low',          color: 'text-status-info-fg',   bg: 'bg-status-info-bg',   border: 'border-status-info-bd' },
  INFORMATIONAL: { label: 'Info',         color: 'text-text-muted', bg: 'bg-surface-overlay',border: 'border-border' },
}

const STATUS = {
  OPEN:               { label: 'Open',              icon: AlertTriangle, color: 'text-status-warn-fg'  },
  IN_REMEDIATION:     { label: 'In remediation',    icon: RefreshCw,     color: 'text-status-info-fg'   },
  PENDING_VALIDATION: { label: 'Pending validation',icon: Clock,         color: 'text-status-tag-fg' },
  CLOSED:             { label: 'Closed',            icon: CheckCircle2,  color: 'text-status-pass-fg'  },
  ACCEPTED_RISK:      { label: 'Risk accepted',     icon: Shield,        color: 'text-text-muted' },
}

const FINDING_TYPE_LABEL = {
  CONTROL_DEFICIENCY:   'Control deficiency',
  MATERIAL_WEAKNESS:    'Material weakness',
  SIGNIFICANT_DEFICIENCY: 'Significant deficiency',
  OBSERVATION:          'Observation',
  BEST_PRACTICE:        'Best practice',
}

// ── Severity badge ─────────────────────────────────────────────────────────────

function SevBadge({ severity }) {
  const s = SEVERITY[severity] || SEVERITY.LOW
  return (
    <span className={cn(
      'inline-flex items-center text-[9px] px-1.5 py-0.5 rounded font-semibold border',
      s.color, s.bg, s.border,
    )}>
      {s.label}
    </span>
  )
}

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status }) {
  const s = STATUS[status] || STATUS.OPEN
  const Icon = s.icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-[9px] font-medium', s.color)}>
      <Icon size={9} />{s.label}
    </span>
  )
}

// ── Escalate button ───────────────────────────────────────────────────────────

function EscalateButton({ findingId, linkedIssueId, engagementId, source }) {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post(`/v1/audit/findings/${findingId}/escalate-to-issue`),
    onSuccess: (res) => {
      const issueId = res?.data?.data?.linkedIssueId || res?.data?.linkedIssueId
      toast.success(`Issue created${issueId ? ` — ISS #${issueId}` : ''}`)
      qc.invalidateQueries({ queryKey: ['engagement-findings', engagementId] })
      qc.invalidateQueries({ queryKey: ['audit-engagement', engagementId] })
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Escalation failed'),
  })

  // Already escalated — a link to the issue, styled as a link rather than an
  // action so it does not compete with the button on neighbouring rows.
  if (linkedIssueId) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); navigate(`/module/issue/${linkedIssueId}`) }}
        title="Open the linked issue"
        className="flex items-center gap-1 text-[10px] font-medium text-brand-ink hover:underline whitespace-nowrap"
      >
        <Link size={11} />ISS #{linkedIssueId}
      </button>
    )
  }

  // Automation raised this and could not finish escalating it. Say so: an
  // unescalated AUTOMATED finding means something failed, while an unescalated
  // MANUAL one just has not been actioned yet, and the two are identical on
  // screen without this. The reason lives in the server log
  // ([AUDIT-DERIVE] Not escalating / Auto-escalate failed).
  const automationStalled = source === 'AUTOMATED'

  // Not escalated. This is deliberately still offered on auto-created findings:
  // automatic escalation is skipped when no owner can be resolved, and this is
  // the only route those findings have into remediation. Hiding it by source
  // would strand exactly the findings that need attention most.
  return (
    <span className="flex items-center gap-2">
      {automationStalled && (
        <span
          title="Raised automatically, but escalation did not complete. Escalate it here."
          className="shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-status-warn-bd bg-status-warn-bg text-status-warn-fg whitespace-nowrap">
          Not escalated
        </span>
      )}
    <button
      onClick={(e) => { e.stopPropagation(); mutate() }}
      disabled={isPending}
      title="Create a remediation issue for this finding and assign it to the control owner"
      className={cn(
        'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-ctl whitespace-nowrap',
        'text-[11px] font-medium border transition-colors',
        'border-brand-500/50 text-brand-ink bg-brand-500/10',
        'hover:bg-brand-500/20 hover:border-brand-500',
        'focus:outline-none focus:ring-1 focus:ring-brand-500',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
    >
      {isPending
        ? <RefreshCw size={11} className="animate-spin" />
        : <ArrowUpRight size={11} />}
      {isPending ? 'Escalating…' : 'Escalate to issue'}
    </button>
    </span>
  )
}

// ── Finding row ───────────────────────────────────────────────────────────────

function FindingRow({ finding, engagementId, canEscalate }) {
  const navigate = useNavigate()

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-border/20 hover:bg-surface-overlay/40 transition-colors group cursor-pointer"
      onClick={() => navigate(`/module/audit_finding/${finding.id}`)}
    >
      {/* Severity + ref */}
      <div className="shrink-0 flex flex-col items-center gap-1 w-16">
        <SevBadge severity={finding.severity} />
        <span className="font-mono text-[8px] text-text-muted">{finding.findingRef}</span>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <span className="text-[11px] text-text-primary font-medium truncate group-hover:underline">
            {finding.title}
          </span>
          {finding.findingType && (
            <span className="text-[8px] text-text-muted bg-surface-overlay px-1.5 py-0.5 rounded">
              {FINDING_TYPE_LABEL[finding.findingType] || finding.findingType}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusChip status={finding.status} />
          {finding.controlRefSnapshot && (
            <span className="text-[9px] font-mono text-text-muted">
              ctrl: {finding.controlRefSnapshot}
            </span>
          )}
          {finding.frameworkRef && (
            <span className="text-[9px] text-text-muted">{finding.frameworkRef}</span>
          )}
          {finding.dueAt && (
            <span className="text-[9px] text-text-muted">
              due {new Date(finding.dueAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Escalate / linked issue */}
      {canEscalate && (
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <EscalateButton
            findingId={finding.id}
            linkedIssueId={finding.linkedIssueId}
            source={finding.source}
            engagementId={engagementId}
          />
        </div>
      )}

      <ChevronRight size={10} className="text-text-muted opacity-0 group-hover:opacity-100 shrink-0" />
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function EngagementFindingsTab({ engagementId, canEscalate = true }) {
  const [filter, setFilter] = useState('ALL')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['engagement-findings', engagementId],
    queryFn: () => api.get(`/v1/audit/engagements/${engagementId}/findings`),
    enabled: !!engagementId,
  })

  const all = Array.isArray(data) ? data : (data?.data?.data || data?.data || [])

  const filtered = filter === 'ALL'
    ? all
    : all.filter(f => f.status === filter)

  const openCount     = all.filter(f => f.status === 'OPEN').length
  const remCount      = all.filter(f => f.status === 'IN_REMEDIATION').length
  const closedCount   = all.filter(f => ['CLOSED', 'ACCEPTED_RISK'].includes(f.status)).length
  const escalatedCount = all.filter(f => f.linkedIssueId).length

  if (isLoading) return (
    <div className="py-8 flex items-center justify-center">
      <RefreshCw size={16} className="animate-spin text-text-muted" />
    </div>
  )

  return (
    <div className="flex flex-col h-full">

      {/* Stats bar */}
      <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-4 text-[10px] text-text-muted flex-wrap">
        <span className="font-medium text-text-primary">{all.length} findings</span>
        {openCount > 0 && <span className="text-status-warn-fg">{openCount} open</span>}
        {remCount > 0  && <span className="text-status-info-fg">{remCount} in remediation</span>}
        {closedCount > 0 && <span className="text-status-pass-fg">{closedCount} closed</span>}
        {escalatedCount > 0 && <span className="text-brand-ink">{escalatedCount} escalated to issue</span>}
        <button onClick={() => refetch()} className="ml-auto text-text-muted hover:text-text-primary">
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Filter chips */}
      {all.length > 0 && (
        <div className="px-4 py-2 border-b border-border/20 flex items-center gap-1.5 overflow-x-auto">
          {['ALL', 'OPEN', 'IN_REMEDIATION', 'PENDING_VALIDATION', 'CLOSED', 'ACCEPTED_RISK'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap',
                filter === f
                  ? 'border-brand-500/60 bg-brand-500/10 text-brand-ink'
                  : 'border-border text-text-muted hover:text-text-primary',
              )}
            >
              {f === 'ALL' ? `All (${all.length})` : STATUS[f]?.label || f}
            </button>
          ))}
        </div>
      )}

      {/* Compliance score hint */}
      {all.length > 0 && (
        <div className="px-4 py-2 border-b border-border/20 flex items-start gap-2 bg-status-warn-bg">
          <Info size={11} className="text-status-warn-fg shrink-0 mt-0.5" />
          <p className="text-[10px] text-text-muted leading-relaxed">
            Open findings reduce the compliance score. Each finding escalated to an Issue follows the
            <span className="text-text-secondary"> Issue Remediation workflow</span> — once the Issue
            is closed, the linked finding closes automatically and the score improves.
            {closedCount > 0 && <span className="text-status-pass-fg"> {closedCount} finding{closedCount > 1 ? 's' : ''} resolved.</span>}
          </p>
        </div>
      )}

      {/* Findings list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <AlertTriangle size={24} className="mx-auto text-text-muted mb-2 opacity-40" />
            <p className="text-sm text-text-muted">
              {all.length === 0 ? 'No findings raised for this engagement.' : 'No findings match this filter.'}
            </p>
            {all.length === 0 && (
              <p className="text-xs text-text-muted mt-1 opacity-60">
                Use the "Raise Finding" action on a control to create one.
              </p>
            )}
          </div>
        ) : (
          filtered.map(f => (
            <FindingRow
              key={f.id}
              finding={f}
              engagementId={engagementId}
              canEscalate={canEscalate}
            />
          ))
        )}
      </div>
    </div>
  )
}