import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Video, Pencil, Calendar, Users, Plus, X } from 'lucide-react'
import { collabApi, unwrapOne, errMsg } from '../../api/collab.api'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Skeleton } from '../../components/ui/EmptyState'
import { MeetingRow, Section } from '../../components/collab/Meetings'
import { RoomModal } from '../../components/collab/Rooms'
import { joinRoomCall } from '../../components/collab/call/callStore'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

/**
 * Collaboration › Room — a standing call room: who is in it now, its members,
 * what is scheduled in it and its past sessions. Every call here leaves a
 * record — a scheduled meeting, or a drop-in session created when someone
 * joins an empty room — with agenda, minutes, decisions, attendance and
 * follow-ups like any meeting.
 */
export default function RoomPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [scheduling, setScheduling] = useState(false)

  const { data: raw, isLoading, isError, refetch } = useQuery({
    queryKey: ['collab-room', id], queryFn: () => collabApi.room(id), refetchInterval: 30_000,
  })
  const r = unwrapOne(raw)
  const refresh = () => { refetch(); qc.invalidateQueries({ queryKey: ['collab-rooms'] }) }
  const open = (mid) => navigate(`/collaboration/meetings/${mid}`)

  if (isLoading) return <PageLayout title="Room"><div className="px-6 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div></PageLayout>
  if (isError || !r?.id) {
    return (
      <PageLayout title="Room" onBack={() => navigate('/collaboration/meetings?range=rooms')}>
        <p className="px-6 text-sm text-text-muted">This room does not exist or you are not a member of it.</p>
      </PageLayout>
    )
  }
  const live = Array.isArray(r.live) ? r.live : null
  const upcoming = Array.isArray(r.upcoming) ? r.upcoming : []
  const past = Array.isArray(r.past) ? r.past : []

  return (
    <PageLayout title={r.name} subtitle={`${r.workspaceName || 'Internal room'}${r.description ? ` · ${r.description}` : ''}`}
      onBack={() => navigate('/collaboration/meetings?range=rooms')}
      actions={
        <div className="flex items-center gap-2">
          {r.canManage && <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
          {r.canSchedule && !r.archived && <Button variant="secondary" size="sm" icon={Calendar} onClick={() => setScheduling(true)}>Schedule</Button>}
          {r.enabled && !r.archived && (
            <Button size="sm" icon={Video} onClick={() => joinRoomCall(r.id).then(refresh)}>Join room</Button>
          )}
        </div>
      }>
      <div className="px-6 pb-6 overflow-y-auto grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <div className={cn('rounded-card border px-4 py-3 text-sm',
            live?.length ? 'border-status-pass-bd bg-status-pass-bg text-status-pass-fg' : 'border-border bg-surface-raised text-text-secondary')}>
            {live == null ? 'Join any time — the room is always open.'
              : live.length === 0 ? 'Nobody is in the room right now.'
              : `In the room now: ${live.join(', ')}`}
          </div>
          <Section title="Scheduled in this room" empty={r.canSchedule ? 'Nothing scheduled — use Schedule for a one-off or a repeating meeting (e.g. a weekday stand-up).' : 'Nothing scheduled.'}>
            {upcoming.map(m => <MeetingRow key={m.id} m={m} onOpen={() => open(m.id)} />)}
          </Section>
          <Section title="Past sessions" empty="No calls in this room yet. Joining it starts a session with its own notes.">
            {past.map(m => <MeetingRow key={m.id} m={m} onOpen={() => open(m.id)} />)}
          </Section>
        </div>
        <Card>
          <CardHeader title="Members" subtitle={`${(r.members || []).length} people can join`} />
          <CardBody className="p-0 max-h-[420px] overflow-y-auto">
            {(r.members || []).map(p => (
              <div key={p.userId} className="px-4 py-2 border-b border-border-subtle last:border-0 flex items-center gap-2">
                <Users size={12} className="text-text-muted" />
                <span className="text-sm text-text-primary truncate">{p.name}</span>
                {live?.includes(p.name) && <span className="ml-auto text-[10px] font-medium text-status-pass-fg">in the room</span>}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <RoomModal room={editing ? r : null} onClose={() => setEditing(false)}
        onDone={() => { refresh(); qc.invalidateQueries({ queryKey: ['collab-room', id] }) }} />
      <ScheduleModal open={scheduling} room={r} onClose={() => setScheduling(false)}
        onDone={(x) => { refresh(); if (x?.created === 1 && x.firstMeetingId) open(x.firstMeetingId) }} />
    </PageLayout>
  )
}

const REPEATS = [['NONE', 'Does not repeat'], ['WEEKDAYS', 'Every weekday (Mon–Fri)'], ['DAILY', 'Every day'], ['WEEKLY', 'Every week']]

function ScheduleModal({ open, room, onClose, onDone }) {
  const pad = (n) => String(n).padStart(2, '0')
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
  const inMonth = () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
  const blank = () => ({ title: room?.name || '', date: tomorrow(), start: '10:00', end: '10:15', repeat: 'NONE', until: inMonth(), agenda: [], point: '' })
  const [f, setF] = useState(blank)
  const [was, setWas] = useState(false)
  if (open !== was) { setWas(open); if (open) setF(blank()) }
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))

  const save = useMutation({
    mutationFn: () => collabApi.scheduleInRoom(room.id, {
      title: f.title, startsAt: `${f.date}T${f.start}`, endsAt: f.end ? `${f.date}T${f.end}` : null,
      repeat: f.repeat, repeatUntil: f.repeat === 'NONE' ? null : f.until,
      agenda: f.agenda.map(text => ({ text })),
    }),
    onSuccess: (r) => {
      const x = unwrapOne(r)
      toast.success(x?.created > 1 ? `${x.created} meetings scheduled — members told once` : 'Meeting scheduled')
      onDone(x); onClose()
    },
    onError: (e) => toast.error(errMsg(e, 'Could not schedule'), { duration: 8000 }),
  })
  const input = 'w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary'
  const addPoint = () => { if (f.point.trim()) setF(x => ({ ...x, agenda: [...x.agenda, x.point.trim()], point: '' })) }

  return (
    <Modal open={open} onClose={onClose} size="md" title={`Schedule in ${room?.name || 'room'}`}
      subtitle="Runs on the room's call. All members are invited, and each occurrence gets its own notes."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!f.date || !f.start}>Schedule</Button>
        </div>
      }>
      <div className="space-y-3">
        <input value={f.title} onChange={set('title')} placeholder="Title" className={input} />
        <div className="grid grid-cols-3 gap-2">
          <label className="block"><span className="text-xs text-text-secondary">Date</span>
            <input type="date" value={f.date} onChange={set('date')} className={cn(input, 'mt-1 px-2')} /></label>
          <label className="block"><span className="text-xs text-text-secondary">From</span>
            <input type="time" value={f.start} onChange={set('start')} className={cn(input, 'mt-1 px-2')} /></label>
          <label className="block"><span className="text-xs text-text-secondary">To</span>
            <input type="time" value={f.end} onChange={set('end')} className={cn(input, 'mt-1 px-2')} /></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={f.repeat} onChange={set('repeat')} className={input}>
            {REPEATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {f.repeat !== 'NONE' && (
            <label className="flex items-center gap-2"><span className="text-xs text-text-secondary whitespace-nowrap">until</span>
              <input type="date" value={f.until} onChange={set('until')} className={cn(input, 'px-2')} /></label>
          )}
        </div>
        <div>
          <span className="text-xs font-medium text-text-secondary">Agenda (copied into every occurrence)</span>
          <div className="mt-1 space-y-1">
            {f.agenda.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-text-primary">
                <span className="text-text-muted">•</span><span className="flex-1">{a}</span>
                <button type="button" onClick={() => setF(x => ({ ...x, agenda: x.agenda.filter((_, j) => j !== i) }))} className="text-text-muted hover:text-status-fail-fg"><X size={12} /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={f.point} onChange={set('point')} placeholder="e.g. Yesterday · Today · Blockers"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPoint() } }} className={cn(input, 'h-8')} />
              <Button variant="secondary" size="sm" icon={Plus} onClick={addPoint} disabled={!f.point.trim()}>Add</Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
