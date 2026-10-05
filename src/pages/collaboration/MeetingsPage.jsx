import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, RefreshCw, Phone } from 'lucide-react'
import { collabApi, unwrapList, unwrapOne } from '../../api/collab.api'
import { PageLayout } from '../../components/layout/PageLayout'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/EmptyState'
import { MeetingFormModal, MeetingRow, Section, CallNowModal, useCallOptions, collapseSeries } from '../../components/collab/Meetings'
import { RoomsPanel } from '../../components/collab/Rooms'
import { useUrlState } from '../../hooks/useUrlState'
import { cn } from '../../lib/cn'

/**
 * Collaboration › Meetings — every meeting I organise or am invited to in this
 * organisation: workspace meetings with the audit firm, and internal ones.
 * "New meeting" schedules either kind (holders of collab:meeting:manage;
 * internal meetings are for the organisation's own staff).
 */
const RANGES = [['upcoming', 'Upcoming'], ['past', 'Past 90 days'], ['rooms', 'Rooms']]

export default function MeetingsPage() {
  const navigate = useNavigate()
  const [range, setRange] = useUrlState('range', 'upcoming')
  const [creating, setCreating] = useState(false)
  const [calling, setCalling] = useState(false)
  const calls = useCallOptions()

  const iso = (d) => d.toISOString().slice(0, 10)
  const today = new Date()
  const from = range === 'past' ? iso(new Date(today.getTime() - 90 * 864e5)) : iso(today)
  const to = range === 'past' ? iso(today) : null

  const { data: raw, isLoading, refetch } = useQuery({
    queryKey: ['collab-my-meetings', range],
    queryFn: () => collabApi.myMeetings(from, to),
  })
  const { data: optRaw } = useQuery({ queryKey: ['collab-meeting-options'], queryFn: () => collabApi.meetingOptions() })
  const canSchedule = !!unwrapOne(optRaw)?.canSchedule

  const now = new Date()
  let list = unwrapList(raw)
  list = range === 'past'
    ? list.filter(m => new Date(m.endsAt || m.startsAt) < now || m.status !== 'SCHEDULED').reverse()
    : collapseSeries(list.filter(m => new Date(m.endsAt || m.startsAt) >= now && m.status !== 'CANCELLED'))

  // Group by day.
  const days = []
  for (const m of list) {
    const key = new Date(m.startsAt).toDateString()
    const last = days[days.length - 1]
    if (last && last.key === key) last.items.push(m)
    else days.push({ key, label: new Date(m.startsAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), items: [m] })
  }

  return (
    <PageLayout title="Meetings" subtitle="Meetings you organise or are invited to — with audit firms and internal"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refetch()} />
          {calls.canStart && <Button variant="secondary" size="sm" icon={Phone} onClick={() => setCalling(true)}>Call now</Button>}
          {canSchedule && <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>New meeting</Button>}
        </div>
      }>
      <div className="px-6 pb-6 space-y-4 overflow-y-auto">
        <div className="flex gap-1 border-b border-border">
          {RANGES.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setRange(k)}
              className={cn('px-3 py-2 text-sm -mb-px border-b-2 transition-colors',
                range === k ? 'border-brand-500 text-text-primary font-medium' : 'border-transparent text-text-secondary hover:text-text-primary')}>
              {label}
            </button>
          ))}
        </div>
        {range === 'rooms' ? <RoomsPanel />
          : isLoading ? <Skeleton className="h-48" />
          : days.length === 0
            ? <Section title={range === 'past' ? 'Past meetings' : 'Upcoming'} empty={range === 'past' ? 'No meetings in the last 90 days.' : 'Nothing scheduled.'} />
            : days.map(d => (
              <Section key={d.key} title={d.label}>
                {d.items.map(m => <MeetingRow key={m.id} m={m} showWorkspace onOpen={() => navigate(`/collaboration/meetings/${m.id}`)} />)}
              </Section>
            ))}
      </div>
      <CallNowModal open={calling} onClose={() => setCalling(false)} onStarted={(x) => { refetch(); if (x?.meetingId) navigate(`/collaboration/meetings/${x.meetingId}`) }} />
      <MeetingFormModal open={creating} onClose={() => setCreating(false)}
        onSaved={(m) => { refetch(); if (m?.id) navigate(`/collaboration/meetings/${m.id}`) }} />
    </PageLayout>
  )
}
