/**
 * ProjectFindingsTab — shows all AuditFindings across every engagement in a project.
 *
 * Data:
 *   GET /v1/audit/findings?projectId={projectId}          ← preferred (if backend supports)
 *   GET /v1/audit/projects/{projectId}/templates          ← to get engagementIds
 *   GET /v1/audit/engagements/{id}/findings               ← per-engagement fallback
 *
 * Groups findings by framework (engagementRef / frameworkRef) so auditors can
 * see cross-framework themes at a glance.
 *
 * Mirrors EngagementFindingsTab exactly — same severity/status config,
 * same row layout, same filter chip pattern — just aggregated across engagements.
 */

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, CheckCircle2, Shield, Clock,
  Link, ChevronRight, RefreshCw, FolderKanban,
} from 'lucide-react'
import api  from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

// ── Config — identical to EngagementFindingsTab ───────────────────────────────

const SEVERITY = {
  CRITICAL:      { label: 'Critical', color: 'text-status-fail-fg',    bg: 'bg-status-fail-bg',    border: 'border-status-fail-bd'    },
  HIGH:          { label: 'High',     color: 'text-status-warn-fg', bg: 'bg-status-warn-bg', border: 'border-status-warn-bd' },
  MEDIUM:        { label: 'Medium',   color: 'text-status-warn-fg',  bg: 'bg-status-warn-bg',  border: 'border-status-warn-bd'  },
  LOW:           { label: 'Low',      color: 'text-status-info-fg',   bg: 'bg-status-info-bg',   border: 'border-status-info-bd'   },
  INFORMATIONAL: { label: 'Info',     color: 'text-text-muted', bg: 'bg-surface-overlay',border: 'border-border'       },
}

const STATUS = {
  OPEN:               { label: 'Open',               icon: AlertTriangle, color: 'text-status-warn-fg'  },
  IN_REMEDIATION:     { label: 'In remediation',     icon: RefreshCw,     color: 'text-status-info-fg'   },
  PENDING_VALIDATION: { label: 'Pending validation', icon: Clock,         color: 'text-status-tag-fg' },
  CLOSED:             { label: 'Closed',             icon: CheckCircle2,  color: 'text-status-pass-fg'  },
  ACCEPTED_RISK:      { label: 'Risk accepted',      icon: Shield,        color: 'text-text-muted' },
}

const FINDING_TYPE_LABEL = {
  CONTROL_DEFICIENCY:     'Control deficiency',
  MATERIAL_WEAKNESS:      'Material weakness',
  SIGNIFICANT_DEFICIENCY: 'Significant deficiency',
  OBSERVATION:            'Observation',
  BEST_PRACTICE:          'Best practice',
}

// ── Shared badge components ───────────────────────────────────────────────────

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

function StatusChip({ status }) {
  const s = STATUS[status]
  if (!s) return null
  const Icon = s.icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-[9px]', s.color)}>
      <Icon size={9} />{s.label}
    </span>
  )
}

// ── Escalate button — identical to EngagementFindingsTab ─────────────────────

function EscalateButton({ findingId, linkedIssueId, projectId }) {
  const qc       = useQueryClient()
  const navigate = useNavigate()

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post(`/v1/audit/findings/${findingId}/escalate-to-issue`),
    onSuccess: (res) => {
      const issueId = res?.data?.data?.linkedIssueId || res?.data?.linkedIssueId
      toast.success(`Issue created${issueId ? ` — ISS #${issueId}` : ''}`)
      qc.invalidateQueries({ queryKey: ['project-findings', projectId] })
      qc.invalidateQueries({ queryKey: ['project-findings-agg', projectId] })
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Escalation failed'),
  })

  if (linkedIssueId) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); navigate(`/module/issue/${linkedIssueId}`) }}
        className="flex items-center gap-1 text-[9px] text-brand-400 hover:underline"
      >
        <Link size={9} />ISS #{linkedIssueId}
      </button>
    )
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); mutate() }}
      disabled={isPending}
      className={cn(
        'flex items-center gap-1 text-[9px] px-2 py-0.5 rounded border',
        'border-brand-500/40 text-brand-400 bg-brand-500/5 hover:bg-brand-500/10',
        'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
      )}
    >
      {isPending ? <RefreshCw size={9} className="animate-spin" /> : <Link size={9} />}
      Escalate
    </button>
  )
}

// ── Finding row ───────────────────────────────────────────────────────────────

function FindingRow({ finding, projectId, canEscalate }) {
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
          {/* Framework badge — key differentiator vs EngagementFindingsTab */}
          {finding.frameworkRef && (
            <span className="text-[9px] font-mono text-status-tag-fg bg-status-tag-bg px-1.5 py-0.5 rounded">
              {finding.frameworkRef}
            </span>
          )}
          {finding.controlRefSnapshot && (
            <span className="text-[9px] font-mono text-text-muted">
              ctrl: {finding.controlRefSnapshot}
            </span>
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
            projectId={projectId}
          />
        </div>
      )}

      <ChevronRight size={10} className="text-text-muted opacity-0 group-hover:opacity-100 shrink-0" />
    </div>
  )
}

// ── Framework group header ─────────────────────────────────────────────────────

function FrameworkGroup({ framework, findings, projectId, canEscalate, filter }) {
  const filtered = filter === 'ALL' ? findings : findings.filter(f => f.status === filter)
  if (filtered.length === 0) return null

  return (
    <div>
      <div className="px-4 py-1.5 bg-surface-overlay/50 border-b border-border/40 flex items-center gap-2">
        <span className="text-[10px] font-mono font-semibold text-status-tag-fg">
          {framework}
        </span>
        <span className="text-[9px] text-text-muted">
          {filtered.length} finding{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>
      {filtered.map(f => (
        <FindingRow key={f.id} finding={f} projectId={projectId} canEscalate={canEscalate} />
      ))}
    </div>
  )
}

// ── Data hooks ────────────────────────────────────────────────────────────────

/** Try GET /v1/audit/findings?projectId={id} first */
const useProjectFindingsDirect = (projectId) => useQuery({
  queryKey: ['project-findings', projectId],
  queryFn:  () => api.get('/v1/audit/findings', { params: { projectId } })
    .then(r => Array.isArray(r) ? r : (r?.items ?? r?.data?.items ?? r?.data ?? [])),
  enabled:  !!projectId,
  retry:    false,
})

/** GET project templates to collect engagementIds */
const useProjectTemplates = (projectId) => useQuery({
  queryKey: ['project-templates-for-findings', projectId],
  queryFn:  () => api.get(`/v1/audit/projects/${projectId}/templates`)
    .then(r => Array.isArray(r) ? r : (r?.items ?? r?.data ?? [])),
  enabled:  !!projectId,
})

/** GET findings per engagement (fallback) */
const useEngagementFindings = (engagementId, enabled) => useQuery({
  queryKey: ['engagement-findings-proj', engagementId],
  queryFn:  () => api.get(`/v1/audit/engagements/${engagementId}/findings`)
    .then(r => Array.isArray(r) ? r : (r?.data ?? [])),
  enabled:  !!engagementId && enabled,
  staleTime: 60_000,
})

// ── Main tab ──────────────────────────────────────────────────────────────────

export function ProjectFindingsTab({ projectId, canEscalate = true }) {
  const [filter,    setFilter]    = useState('ALL')
  const [groupMode, setGroupMode] = useState(true)  // group by framework

  // Try direct project-level endpoint first
  const { data: directFindings, isError: directFailed, isLoading: directLoading } =
    useProjectFindingsDirect(projectId)

  // Fallback: fetch per engagement
  const { data: templates } = useProjectTemplates(projectId)
  const engagementIds = (templates ?? []).map(t => t.engagementId).filter(Boolean)

  // Per-engagement queries — only run if direct endpoint failed
  const eng0 = useEngagementFindings(engagementIds[0], directFailed)
  const eng1 = useEngagementFindings(engagementIds[1], directFailed)
  const eng2 = useEngagementFindings(engagementIds[2], directFailed)
  const eng3 = useEngagementFindings(engagementIds[3], directFailed)
  const eng4 = useEngagementFindings(engagementIds[4], directFailed)
  // Supports up to 5 concurrent engagements without violating hooks rules

  const qc = useQueryClient()

  const all = useMemo(() => {
    if (!directFailed && directFindings) {
      return Array.isArray(directFindings) ? directFindings : []
    }
    // Aggregate from per-engagement queries, injecting frameworkRef from template plan
    const engQueries  = [eng0, eng1, eng2, eng3, eng4]
    const tmplById    = Object.fromEntries((templates ?? []).map(t => [t.engagementId, t]))
    return engQueries.flatMap((q, i) => {
      const engId = engagementIds[i]
      if (!engId || !q.data) return []
      const tmpl = tmplById[engId]
      return (Array.isArray(q.data) ? q.data : []).map(f => ({
        ...f,
        frameworkRef: f.frameworkRef || tmpl?.frameworkRef,
      }))
    })
  }, [directFailed, directFindings, eng0.data, eng1.data, eng2.data, eng3.data, eng4.data, templates])

  const isLoading = directLoading && !directFailed

  // Stats
  const openCount      = all.filter(f => f.status === 'OPEN').length
  const remCount       = all.filter(f => f.status === 'IN_REMEDIATION').length
  const closedCount    = all.filter(f => ['CLOSED', 'ACCEPTED_RISK'].includes(f.status)).length
  const escalatedCount = all.filter(f => f.linkedIssueId).length

  // Group by framework
  const byFramework = useMemo(() => {
    const map = {}
    all.forEach(f => {
      const key = f.frameworkRef || 'Unspecified'
      if (!map[key]) map[key] = []
      map[key].push(f)
    })
    return map
  }, [all])

  const filteredFlat = filter === 'ALL' ? all : all.filter(f => f.status === filter)

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
        {openCount > 0      && <span className="text-status-warn-fg">{openCount} open</span>}
        {remCount > 0       && <span className="text-status-info-fg">{remCount} in remediation</span>}
        {closedCount > 0    && <span className="text-status-pass-fg">{closedCount} closed</span>}
        {escalatedCount > 0 && <span className="text-brand-400">{escalatedCount} escalated</span>}

        {/* Group toggle */}
        <button
          onClick={() => setGroupMode(m => !m)}
          className={cn(
            'ml-auto text-[9px] px-2 py-0.5 rounded border transition-colors',
            groupMode
              ? 'border-status-tag-bd bg-status-tag-bg text-status-tag-fg'
              : 'border-border text-text-muted hover:text-text-primary',
          )}
        >
          <FolderKanban size={9} className="inline mr-1" />
          Group by framework
        </button>

        <button
          onClick={() => {
            qc.invalidateQueries({ queryKey: ['project-findings', projectId] })
            qc.invalidateQueries({ queryKey: ['project-findings-agg', projectId] })
          }}
          className="text-text-muted hover:text-text-primary"
        >
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
                  ? 'border-brand-500/60 bg-brand-500/10 text-brand-400'
                  : 'border-border text-text-muted hover:text-text-primary',
              )}
            >
              {f === 'ALL' ? `All (${all.length})` : STATUS[f]?.label || f}
            </button>
          ))}
        </div>
      )}

      {/* Findings */}
      <div className="flex-1 overflow-y-auto">
        {all.length === 0 ? (
          <div className="py-10 text-center">
            <AlertTriangle size={24} className="mx-auto text-text-muted mb-2 opacity-40" />
            <p className="text-sm text-text-muted">No findings across all engagements in this project.</p>
            <p className="text-xs text-text-muted mt-1 opacity-60">
              Findings are raised during control evaluation in each engagement.
            </p>
          </div>

        ) : groupMode ? (
          // Grouped by framework
          Object.entries(byFramework).map(([fw, findings]) => (
            <FrameworkGroup
              key={fw}
              framework={fw}
              findings={findings}
              projectId={projectId}
              canEscalate={canEscalate}
              filter={filter}
            />
          ))

        ) : (
          // Flat list
          filteredFlat.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-text-muted">No findings match this filter.</p>
            </div>
          ) : (
            filteredFlat.map(f => (
              <FindingRow key={f.id} finding={f} projectId={projectId} canEscalate={canEscalate} />
            ))
          )
        )}
      </div>
    </div>
  )
}