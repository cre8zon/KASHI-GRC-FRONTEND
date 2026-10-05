import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, CheckCircle2 } from 'lucide-react'
import { collabApi, unwrapOne } from '../../api/collab.api'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/EmptyState'
import { STATUS_LABEL, fmtDate, health } from '../../components/collab/PlanBoard'
import { MeetingRow } from '../../components/collab/Meetings'
import { fmtDue } from '../../components/collab/WorkspaceRequestsTab'
import { cn } from '../../lib/cn'

/**
 * Collaboration › My week — across every workspace I can see in this
 * organisation: the plan items I own that are due in the next 14 days or
 * overdue, the milestones coming up, my meetings in the next 14 days, requests
 * waiting on me and answers waiting for my review.
 */
export default function MyWeekPage() {
  const navigate = useNavigate()
  const { data: raw, isLoading, refetch } = useQuery({
    queryKey: ['collab-my-week'],
    queryFn: () => collabApi.myWeek(),
  })
  const data = unwrapOne(raw) || {}
  const today = data.today || new Date().toISOString().slice(0, 10)
  const mine = Array.isArray(data.myItems) ? data.myItems : []
  const milestones = Array.isArray(data.milestones) ? data.milestones : []
  const open = (i) => navigate(`/collaboration/workspaces/${i.workspaceId}?tab=plan`)

  const { data: xRaw, isLoading: xLoading, refetch: xRefetch } = useQuery({
    queryKey: ['collab-my-week-extras'],
    queryFn: () => collabApi.myWeekExtras(),
  })
  const extras = unwrapOne(xRaw) || {}
  const meetings = (Array.isArray(extras.meetings) ? extras.meetings : []).filter(m => m.status !== 'CANCELLED')
  const assigned = Array.isArray(extras.assigned) ? extras.assigned : []
  const toReview = Array.isArray(extras.toReview) ? extras.toReview : []
  const openRequest = (r) => navigate(`/collaboration/workspaces/${r.workspaceId}?tab=requests&request=${r.id}`)

  return (
    <PageLayout title="My week" subtitle="Your plan items, meetings and requests for the next 14 days, and anything overdue"
      actions={<Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => { refetch(); xRefetch() }} />}>
      <div className="px-6 pb-6 grid gap-4 xl:grid-cols-2 overflow-y-auto">
        {isLoading ? <><Skeleton className="h-48" /><Skeleton className="h-48" /></> : (
          <>
            <Card>
              <CardHeader title="My items" subtitle={`${mine.length} open`} />
              <CardBody className="p-0">
                {mine.length === 0
                  ? <p className="px-4 py-6 text-xs text-text-muted text-center flex items-center justify-center gap-1.5"><CheckCircle2 size={13} /> Nothing due in the next two weeks.</p>
                  : mine.map(i => <Row key={`m${i.id}`} item={i} today={today} onOpen={() => open(i)} />)}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Milestones" subtitle="Next 14 days and overdue" />
              <CardBody className="p-0">
                {milestones.length === 0
                  ? <p className="px-4 py-6 text-xs text-text-muted text-center">No milestones coming up.</p>
                  : milestones.map(i => <Row key={`ms${i.id}`} item={i} today={today} onOpen={() => open(i)} showOwner />)}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Meetings" subtitle="Next 14 days" />
              <CardBody className="p-0">
                {xLoading ? <p className="px-4 py-6 text-xs text-text-muted text-center">Loading…</p>
                  : meetings.length === 0
                    ? <p className="px-4 py-6 text-xs text-text-muted text-center">No meetings coming up.</p>
                    : meetings.map(m => <MeetingRow key={`mt${m.id}`} m={m} showWorkspace onOpen={() => navigate(`/collaboration/meetings/${m.id}`)} />)}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Requests" subtitle={`${assigned.length} for you · ${toReview.length} answered, waiting for your review`} />
              <CardBody className="p-0">
                {xLoading ? <p className="px-4 py-6 text-xs text-text-muted text-center">Loading…</p>
                  : assigned.length + toReview.length === 0
                    ? <p className="px-4 py-6 text-xs text-text-muted text-center flex items-center justify-center gap-1.5"><CheckCircle2 size={13} /> No requests waiting on you.</p>
                    : <>
                        {assigned.map(r => <RequestRow key={`ra${r.id}`} r={r} label="For you" onOpen={() => openRequest(r)} />)}
                        {toReview.map(r => <RequestRow key={`rr${r.id}`} r={r} label="To review" onOpen={() => openRequest(r)} />)}
                      </>}
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </PageLayout>
  )
}

function Row({ item, today, onOpen, showOwner }) {
  const h = health(item, today)
  return (
    <button type="button" onClick={onOpen}
      className="w-full text-left px-4 py-2.5 border-b border-border-subtle last:border-0 hover:bg-surface-overlay/50 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary truncate">{item.title}</p>
        <p className="text-[11px] text-text-muted truncate">
          {item.workspaceName}{showOwner && item.ownerName ? ` · ${item.ownerName}` : ''}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={cn('text-xs', h === 'late' ? 'text-status-fail-fg font-medium' : 'text-text-secondary')}>
          {h === 'late' ? 'Overdue · ' : ''}{fmtDate(item.plannedEnd)}
        </p>
        <p className="text-[10px] text-text-muted">{STATUS_LABEL[item.status]} · {item.progress ?? 0}%</p>
      </div>
    </button>
  )
}

function RequestRow({ r, label, onOpen }) {
  return (
    <button type="button" onClick={onOpen}
      className="w-full text-left px-4 py-2.5 border-b border-border-subtle last:border-0 hover:bg-surface-overlay/50 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary truncate">{r.title}</p>
        <p className="text-[11px] text-text-muted truncate">
          {r.workspaceName} · {label === 'For you' ? `from ${r.requestedByName}` : `answered by ${r.assigneeName}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={cn('text-xs', r.overdue ? 'text-status-fail-fg font-medium' : 'text-text-secondary')}>
          {r.dueAt ? `${r.overdue ? 'Overdue · ' : ''}${fmtDue(r.dueAt)}` : ''}
        </p>
        <p className="text-[10px] text-text-muted">{label}</p>
      </div>
    </button>
  )
}