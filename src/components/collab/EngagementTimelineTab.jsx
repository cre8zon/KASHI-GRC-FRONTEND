import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, List, ExternalLink } from 'lucide-react'
import { collabApi, unwrapOne } from '../../api/collab.api'
import { Skeleton } from '../ui/EmptyState'
import { cn } from '../../lib/cn'
import { PlanBoard, PlanHistoryModal } from './PlanBoard'

/**
 * Engagement › Timeline — this engagement's part of the collaboration plan.
 *
 * Not a second plan: it is the items in each workspace plan that are linked to
 * this engagement, with everything under them, read from the same rows. Edit
 * the plan in its workspace; this tab links there.
 */
export function EngagementTimelineTab({ engagementId }) {
  const [view, setView] = useState('gantt')
  const [historyOf, setHistoryOf] = useState(null)
  const { data: raw, isLoading } = useQuery({
    queryKey: ['collab-engagement-timeline', engagementId],
    queryFn: () => collabApi.engagementTimeline(engagementId),
    enabled: !!engagementId,
  })
  const data = unwrapOne(raw) || {}
  const blocks = Array.isArray(data.workspaces) ? data.workspaces : []
  const today = data.today || new Date().toISOString().slice(0, 10)

  if (isLoading) return <div className="p-4"><Skeleton className="h-48" /></div>

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex rounded-ctl border border-border overflow-hidden">
          {[['gantt', BarChart3, 'Timeline'], ['list', List, 'List']].map(([k, Icon, label]) => (
            <button key={k} type="button" onClick={() => setView(k)}
              className={cn('flex items-center gap-1 px-2.5 h-7 text-xs', view === k ? 'bg-brand-500/15 text-text-primary font-medium' : 'text-text-secondary hover:bg-surface-overlay')}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-text-muted">From the collaboration plan this engagement is linked to.</span>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-card border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm text-text-primary">Not on a plan yet</p>
          <p className="text-xs text-text-muted mt-1">
            Link this engagement to an item in a Collaboration workspace plan, and its timeline shows here.
          </p>
        </div>
      ) : blocks.map(b => (
        <div key={b.workspaceId} className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-text-primary">{b.workspaceName}</p>
            <Link to={`/collaboration/workspaces/${b.workspaceId}?tab=plan`}
              className="text-[11px] text-brand-ink hover:underline flex items-center gap-1">
              Open the plan <ExternalLink size={11} />
            </Link>
          </div>
          <PlanBoard items={b.items || []} programmes={[]} today={today} view={view}
            onEdit={setHistoryOf} onHistory={setHistoryOf} />
          <PlanHistoryModal open={!!historyOf && (b.items || []).some(i => i.id === historyOf.id)}
            onClose={() => setHistoryOf(null)} workspaceId={b.workspaceId} item={historyOf} />
        </div>
      ))}
    </div>
  )
}
