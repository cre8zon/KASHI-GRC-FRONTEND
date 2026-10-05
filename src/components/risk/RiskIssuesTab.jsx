/**
 * RiskIssuesTab — issues raised against this risk.
 *
 * WHY THIS COMPONENT HAS TO EXIST
 *   'issues' is NOT in CustomTabContent's CUSTOM_RENDERED_TABS set, so without
 *   an entityType branch the generic path fetches a form key that does not
 *   exist (risk_detail_tab_issues), 404s, and falls through to the
 *   "No fields configured" panel. Adding a form would be the wrong fix: this
 *   tab lists other records, it does not edit fields on this one.
 *
 * DATA
 *   GET /v1/risks/{id}/issues — issues whose source_entity_type = 'RISK' and
 *   source_entity_id = this risk. Issue.linked_risk_ids (a JSON array) is
 *   deliberately not searched server-side; see RiskService.listLinkedIssues.
 *
 * Rows navigate to the issue's own module page rather than opening anything
 * inline — the issue detail screen already exists and duplicating a slice of
 * it here would drift from it within a release.
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, RefreshCw, ChevronRight } from 'lucide-react'
import api from '../../config/axios.config'

const SEVERITY = {
  CRITICAL: 'bg-status-fail-bg text-status-fail-fg',
  HIGH:     'bg-status-fail-bg text-status-fail-fg',
  MEDIUM:   'bg-status-warn-bg text-status-warn-fg',
  LOW:      'bg-surface-overlay text-text-muted',
}

export function RiskIssuesTab({ riskId }) {
  const navigate = useNavigate()

  const { data: res, isLoading } = useQuery({
    queryKey: ['risk-linked-issues', riskId],
    queryFn: () => api.get(`/v1/risks/${riskId}/issues`),
    enabled: !!riskId,
  })
  const issues = res || []

  if (isLoading) return (
    <div className="py-8 flex items-center justify-center">
      <RefreshCw size={16} className="animate-spin text-text-muted" />
    </div>
  )

  if (issues.length === 0) return (
    <div className="py-12 text-center">
      <AlertTriangle size={18} className="mx-auto text-text-muted opacity-50" />
      <p className="text-sm text-text-muted mt-2">No issues raised against this risk.</p>
      <p className="text-xs text-text-muted mt-1 opacity-60">
        Issues created with this risk as their source appear here.
      </p>
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      {issues.map(i => (
        <button
          key={i.id}
          onClick={() => navigate(`/module/issue/${i.id}`)}
          className="text-left flex items-center gap-3 p-3 rounded-card border border-border bg-surface-secondary hover:border-border-strong transition-colors">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-text-primary">
                {i.issueRef || `#${i.id}`}
              </span>
              {i.severity && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SEVERITY[i.severity] || SEVERITY.LOW}`}>
                  {i.severity}
                </span>
              )}
              {i.status && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-ink">
                  {i.status}
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted mt-0.5 truncate">{i.title || '—'}</p>
          </div>
          <ChevronRight size={13} className="text-text-muted shrink-0" />
        </button>
      ))}
    </div>
  )
}

export default RiskIssuesTab
