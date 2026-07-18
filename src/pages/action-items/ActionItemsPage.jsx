/**
 * ActionItemsPage — /action-items
 *
 * KashiTrack — cross-module obligation inbox.
 * Shows all open action items assigned to the current user.
 * Filterable by source type. Real-time via WebSocket.
 */
import { useState }                      from 'react'
import { useNavigate }                   from 'react-router-dom'
import {
  AlertTriangle, CheckCircle2, Clock, ChevronRight,
  Flag, Shield, FileText, Loader2, TriangleAlert,
} from 'lucide-react'
import { PageLayout }                    from '../../components/layout/PageLayout'
import { Badge }                         from '../../components/ui/Badge'
import { Button }                        from '../../components/ui/Button'
import { cn }                            from '../../lib/cn'
import { formatDate, formatDateTime }    from '../../utils/format'
import { useMyActionItems, useUpdateActionItemStatus } from '../../hooks/useActionItems'

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  OPEN:           { label: 'Open',           color: 'amber',  icon: AlertTriangle },
  IN_PROGRESS:    { label: 'In Progress',    color: 'blue',   icon: Clock },
  PENDING_REVIEW: { label: 'Pending Review', color: 'purple', icon: Clock },
  RESOLVED:       { label: 'Resolved',       color: 'green',  icon: CheckCircle2 },
  DISMISSED:      { label: 'Dismissed',      color: 'gray',   icon: null },
}

const PRIORITY_CONFIG = {
  CRITICAL: { label: 'Critical', class: 'text-status-fail-fg bg-status-fail-bg border-status-fail-bd' },
  HIGH:     { label: 'High',     class: 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd' },
  MEDIUM:   { label: 'Medium',   class: 'text-status-info-fg bg-status-info-bg border-status-info-bd' },
  LOW:      { label: 'Low',      class: 'text-text-muted bg-surface-overlay border-border' },
}

const SOURCE_FILTERS = [
  { key: 'ALL',           label: 'All' },
  { key: 'COMMENT',       label: 'Revision Requests' },
  { key: 'SYSTEM',        label: 'Auto-Findings' },
  { key: 'AUDIT_FINDING', label: 'Audit Findings' },
  { key: 'CONTROL_GAP',   label: 'Control Gaps' },
  { key: 'RISK_ESCALATION',label: 'Risk Escalations' },
]

const STATUS_FILTERS = [
  { key: 'OPEN,IN_PROGRESS,PENDING_REVIEW', label: 'Open' },
  { key: 'RESOLVED',                         label: 'Resolved' },
  { key: 'ALL',                              label: 'All' },
]

// ── Action Item Card ──────────────────────────────────────────────────────────

function ActionItemCard({ item, onUpdateStatus }) {
  const navigate           = useNavigate()
  const sc = STATUS_CONFIG[item.status]   || STATUS_CONFIG.OPEN
  const pc = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.MEDIUM
  const [expanding, setExpanding] = useState(false)

  const handleNavigate = () => {
    try {
      const ctx = item.navContext ? JSON.parse(item.navContext) : null
      if (!ctx) return

      // navContext routing contract:
      //   assigneeRoute  → where the person doing the work goes (vendor, assistant)
      //   reviewerRoute  → where the reviewer/validator goes (org reviewer, CISO)
      //   route          → legacy single-route (backward compat)
      //   questionInstanceId → scroll to specific question on the destination page
      //
      // Routing decision:
      //   canResolve=true  → user is the reviewer/validator → reviewerRoute
      //   canResolve=false → user is the assignee doing the work → assigneeRoute

      const qParam = ctx.questionInstanceId ? `questionInstanceId=${ctx.questionInstanceId}` : ''
      const addParam = (url) => {
        if (!qParam) return url
        // Don't add questionInstanceId if it's already baked into the navContext URL
        if (url.includes('questionInstanceId=')) return url
        return url + (url.includes('?') ? '&' : '?') + qParam
      }

      if (item.canResolve && ctx.reviewerRoute) {
        navigate(addParam(ctx.reviewerRoute))
        return
      }

      const assigneeRoute = ctx.assigneeRoute || ctx.route
      if (assigneeRoute) {
        // CONTRIBUTOR_ASSIGNMENT and REVIEWER_ASSIGNMENT: no openWork bypass.
        // Section lock must still apply for assignment entries.
        // openWork=1 is only added for REVISION_REQUEST and REMEDIATION_REQUEST.
        const isAssignment = ['CONTRIBUTOR_ASSIGNMENT', 'REVIEWER_ASSIGNMENT']
          .includes(item.remediationType)
        const hasOpenWork = assigneeRoute.includes('openWork')
        const sep = assigneeRoute.includes('?') ? '&' : '?'
        const withWork = (isAssignment || hasOpenWork)
          ? assigneeRoute
          : assigneeRoute + `${sep}openWork=1`
        navigate(addParam(withWork))
        return
      }

      // Last resort: if only reviewerRoute exists (legacy clarification items), use it
      if (ctx.reviewerRoute) {
        navigate(addParam(ctx.reviewerRoute))
      }
    } catch (e) { /* invalid json */ }
  }

  const isOpen = ['OPEN','IN_PROGRESS','PENDING_REVIEW'].includes(item.status)

  return (
    <div className={cn(
      'rounded-card border bg-surface-raised p-4 space-y-3 transition-all',
      item.status === 'OPEN' ? 'border-status-warn-bd' :
      item.status === 'IN_PROGRESS' ? 'border-status-info-bd' :
      item.status === 'PENDING_REVIEW' ? 'border-status-tag-bd' :
      'border-border opacity-70'
    )}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-8 h-8 rounded-card flex items-center justify-center flex-shrink-0',
          item.status === 'OPEN' ? 'bg-status-warn-bg' :
          item.status === 'IN_PROGRESS' ? 'bg-status-info-bg' : item.status === 'PENDING_REVIEW' ? 'bg-status-tag-bg' : 'bg-surface-overlay'
        )}>
          {sc.icon && (
            <sc.icon size={14} className={cn(
              item.status === 'OPEN' ? 'text-status-warn-fg' :
              item.status === 'IN_PROGRESS' ? 'text-status-info-fg' : item.status === 'PENDING_REVIEW' ? 'text-status-tag-fg' : 'text-text-muted'
            )} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', pc.class)}>
              {pc.label}
            </span>
            <span className="text-[10px] text-text-muted bg-surface-overlay px-1.5 py-0.5 rounded">
              {item.sourceType?.replace('_', ' ')}
            </span>
            {item.isOverdue && (
              <span className="text-[10px] text-status-fail-fg flex items-center gap-0.5">
                <TriangleAlert size={9} /> Overdue
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-text-primary leading-snug">{item.title}</p>
          {item.description && (
            <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{item.description}</p>
          )}
        </div>

        <Badge value={item.status} label={sc.label} colorTag={sc.color} />
      </div>

      {/* Meta — parties involved + context */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted pl-11">
        {item.createdByName && (
          <span>Raised by: <strong className="text-text-secondary">{item.createdByName}</strong></span>
        )}
        {item.assignedToName && (
          <span>Assigned to: <strong className="text-text-secondary">{item.assignedToName}</strong></span>
        )}
        {item.assignedGroupRole && !item.assignedToName && (
          <span>Group: <strong className="text-text-secondary">{item.assignedGroupRole}</strong></span>
        )}
        {item.resolutionReservedForName && (
          <span>Validator: <strong className="text-text-secondary">{item.resolutionReservedForName}</strong></span>
        )}
        {item.severity && (
          <span className={cn('font-semibold uppercase',
            item.severity === 'CRITICAL' && 'text-status-fail-fg',
            item.severity === 'HIGH'     && 'text-status-warn-fg',
            item.severity === 'MEDIUM'   && 'text-status-warn-fg',
            item.severity === 'LOW'      && 'text-status-info-fg',
          )}>{item.severity}</span>
        )}
        {item.dueAt && (
          <span className={cn(item.isOverdue && 'text-status-fail-fg font-medium')}>
            Due: {formatDate(item.dueAt)}
          </span>
        )}
        {item.resolvedAt && item.resolvedByName && (
          <span className="text-status-pass-fg">
            {item.acceptedRisk ? '⚠ Risk accepted' : '✓ Resolved'} by {item.resolvedByName}
          </span>
        )}
        <span className="font-mono opacity-50">#{item.id}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pl-11">
        {/* Navigate to the item */}
        {item.navContext && (
          <Button size="xs" variant="secondary" icon={ChevronRight}
            onClick={handleNavigate}>
            Go to item
          </Button>
        )}

      {/* Status transitions — based on role */}
        {isOpen && item.status === 'OPEN' && !item.canResolve && (
          <Button size="xs" variant="ghost"
            onClick={() => onUpdateStatus(item.id, 'IN_PROGRESS')}>
            Start working
          </Button>
        )}
        {isOpen && item.status === 'IN_PROGRESS' && !item.canResolve && (
          <Button size="xs" variant="ghost"
            className="text-status-tag-fg hover:text-status-tag-fg"
            onClick={() => onUpdateStatus(item.id, 'PENDING_REVIEW')}>
            Submit for review
          </Button>
        )}
        {isOpen && item.status === 'PENDING_REVIEW' && item.canResolve && (
          <span className="text-[11px] text-status-warn-fg italic flex items-center gap-1">
            <Clock size={11} /> Awaiting your review
          </span>
        )}
        {isOpen && item.status === 'PENDING_REVIEW' && !item.canResolve && (
          <span className="text-[11px] text-status-tag-fg italic flex items-center gap-1">
            <Clock size={11} /> Submitted — pending review
          </span>
        )}

        {/* Resolve — only validator (canResolve) AND item is PENDING_REVIEW or higher */}
        {isOpen && item.canResolve && item.status === 'PENDING_REVIEW' && (
          <Button size="xs" variant="ghost"
            className="text-status-pass-fg hover:text-status-pass-fg"
            onClick={() => onUpdateStatus(item.id, 'RESOLVED')}>
            <CheckCircle2 size={12} className="mr-1" />
            Mark resolved
          </Button>
        )}

        {/* Dismiss */}
        {isOpen && (
          <button
            onClick={() => onUpdateStatus(item.id, 'DISMISSED')}
            className="text-[10px] text-text-muted hover:text-text-secondary ml-auto">
            Dismiss
          </button>
        )}

        {/* Reopen */}
        {item.status === 'RESOLVED' && item.canResolve && (
          <Button size="xs" variant="ghost"
            onClick={() => onUpdateStatus(item.id, 'OPEN')}>
            Reopen
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ActionItemsPage() {
  const { items, isLoading }            = useMyActionItems()
  const { mutate: updateStatus, isPending } = useUpdateActionItemStatus()
  const [sourceFilter, setSourceFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('OPEN,IN_PROGRESS,PENDING_REVIEW')

  const filtered = items.filter(item => {
    const matchSource = sourceFilter === 'ALL' || item.sourceType === sourceFilter
    const matchStatus = statusFilter === 'ALL' || statusFilter.includes(item.status)
    return matchSource && matchStatus
  })

  const openCount     = items.filter(i => ['OPEN','IN_PROGRESS','PENDING_REVIEW'].includes(i.status)).length
  const resolvedCount = items.filter(i => i.status === 'RESOLVED').length

  const handleUpdateStatus = (id, status, note) => {
    updateStatus({ id, status, resolutionNote: note })
  }

  return (
    <PageLayout
      title="Action Items"
      subtitle={`${openCount} open · ${resolvedCount} resolved`}
    >
      <div className="p-6 max-w-3xl mx-auto space-y-4">

        {/* Filter bar */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Status filter */}
          <div className="flex items-center gap-1 bg-surface-raised border border-border rounded-card p-1">
            {STATUS_FILTERS.map(f => (
              <button key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  'text-xs px-3 py-1 rounded-ctl transition-colors',
                  statusFilter === f.key
                    ? 'bg-brand-500/10 text-brand-ink font-medium'
                    : 'text-text-muted hover:text-text-secondary'
                )}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Source filter */}
          <div className="flex items-center gap-1 flex-wrap">
            {SOURCE_FILTERS.map(f => (
              <button key={f.key}
                onClick={() => setSourceFilter(f.key)}
                className={cn(
                  'text-[11px] px-2.5 py-1 rounded-ctl border transition-colors',
                  sourceFilter === f.key
                    ? 'border-brand-500/40 bg-brand-500/10 text-brand-ink'
                    : 'border-border text-text-muted hover:text-text-secondary'
                )}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Items */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <CheckCircle2 size={32} className="text-status-pass-fg mx-auto" />
            <p className="text-sm font-medium text-text-primary">All clear</p>
            <p className="text-xs text-text-muted">No action items match the current filter.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Items pending my review — show first */}
            {filtered.filter(i => i.status === 'PENDING_REVIEW' && i.canResolve).length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-status-tag-fg uppercase tracking-widest px-1">
                  Pending Your Review
                </p>
                {filtered.filter(i => i.status === 'PENDING_REVIEW' && i.canResolve).map(item => (
                  <ActionItemCard key={item.id} item={item} onUpdateStatus={handleUpdateStatus} />
                ))}
                {filtered.filter(i => !(i.status === 'PENDING_REVIEW' && i.canResolve)).length > 0 && (
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest px-1 pt-2">
                    My Work
                  </p>
                )}
              </>
            )}
            {/* My work items */}
            {filtered.filter(i => !(i.status === 'PENDING_REVIEW' && i.canResolve)).map(item => (
              <ActionItemCard key={item.id} item={item} onUpdateStatus={handleUpdateStatus} />
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  )
}