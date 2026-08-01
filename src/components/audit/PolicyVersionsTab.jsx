import { useMemo }        from 'react'
import { useNavigate }    from 'react-router-dom'
import { useQuery }       from '@tanstack/react-query'
import { FileText }       from 'lucide-react'
import api                from '../../config/axios.config'

/**
 * PolicyVersionsTab
 *
 * Shows all versions of a policy by fetching every record that shares the
 * same policyRef, sorted descending by version number so the latest is always
 * at the top. Renders in the "Versions" tab of the audit_policy_detail screen
 * (both the drawer and the full-page detail view).
 *
 * Edit button appears on DRAFT / UNDER_REVIEW versions → navigates to the
 * TipTap policy editor.
 */

const STATUS_STYLE = {
  DRAFT:        'bg-surface-inset  text-text-muted  border-border',
  UNDER_REVIEW: 'bg-status-info-bg   text-status-info-fg   border-status-info-bd',
  APPROVED:     'bg-status-pass-bg text-status-pass-fg border-status-pass-bd',
  DEPRECATED:   'bg-status-fail-bg    text-status-fail-fg    border-status-fail-bd',
}

export function PolicyVersionsTab({ entity }) {
  const navigate = useNavigate()

  const { data: res, isLoading } = useQuery({
    queryKey: ['policy-versions', entity?.policyRef],
    queryFn:  () => api.get('/v1/audit/library/policies', {
      params: { policyRef: entity?.policyRef, pageSize: 50 },
    }),
    enabled:  !!entity?.policyRef,
    staleTime: 30_000,
  })

  const versions = useMemo(() => {
    const raw = res?.data?.content || res?.data?.data || res?.data || []
    return [...(Array.isArray(raw) ? raw : [])]
      .sort((a, b) => (b.version || 1) - (a.version || 1))
  }, [res])

  if (isLoading) return (
    <div className="space-y-2 p-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-12 rounded-card bg-surface-overlay animate-pulse" />
      ))}
    </div>
  )

  if (!versions.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-text-muted text-sm gap-1">
      <FileText size={28} className="opacity-30 mb-1" />
      <p>No version history found</p>
    </div>
  )

  return (
    <div className="divide-y divide-border">
      {versions.map((v, i) => (
        <div key={v.id}
          className="flex items-center gap-3 px-5 py-3 hover:bg-surface-overlay/50 transition-colors">

          {/* Version badge */}
          <div className="w-9 h-9 rounded-full bg-surface-overlay flex items-center justify-center
                          shrink-0 text-xs font-bold text-text-secondary border border-border">
            v{v.version || 1}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary truncate">{v.title}</span>
              {i === 0 && (
                <span className="text-[10px] bg-brand-500/10 text-brand-ink border border-brand-500/20
                                 rounded px-1.5 py-0.5 font-medium shrink-0">
                  Latest
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] font-semibold border rounded px-1.5 py-0.5
                                ${STATUS_STYLE[v.status] || STATUS_STYLE.DRAFT}`}>
                {v.status?.replace('_', ' ')}
              </span>
              {v.approvedAt && (
                <span className="text-[11px] text-text-muted">
                  Approved {new Date(v.approvedAt).toLocaleDateString()}
                </span>
              )}
              {v.updatedAt && !v.approvedAt && (
                <span className="text-[11px] text-text-muted">
                  Updated {new Date(v.updatedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* Action */}
          {(v.status === 'DRAFT' || v.status === 'UNDER_REVIEW') && (
            <button
              onClick={() => navigate(`/audit/policies/${v.id}/edit`)}
              className="text-[11px] text-brand-ink hover:text-brand-ink border border-brand-500/25
                         hover:border-brand-500/50 rounded px-2 py-1 transition-colors shrink-0">
              Edit
            </button>
          )}
          {v.status === 'APPROVED' && (
            <span className="text-[11px] text-text-muted shrink-0">Active</span>
          )}
        </div>
      ))}
    </div>
  )
}