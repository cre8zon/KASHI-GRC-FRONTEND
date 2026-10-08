import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Calendar, ExternalLink, Users, Plus, X, Video, Phone } from 'lucide-react'
import { collabApi, unwrapList, unwrapOne, errMsg } from '../../api/collab.api'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Modal } from '../ui/Modal'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'
import { joinMeetingCall, startCall } from './call/callStore'
import { RoomsPanel } from './Rooms'
import { PeopleMultiSelect } from './PeopleMultiSelect'

/**
 * Collaboration meetings — shared pieces: the list row, the schedule / edit
 * form, and labels. The call itself is a link (Teams, Zoom, Meet …) for now.
 * Who may schedule, who can be invited and who runs a meeting are decided by
 * the server (CollabMeetingService); the UI shows what it is told.
 */
export const KIND_LABEL = {
  OPENING: 'Opening', WALKTHROUGH: 'Walkthrough', STATUS: 'Status',
  CLOSING: 'Closing', INTERNAL: 'Internal', OTHER: 'Meeting',
}
export const PROVIDER_LABEL = { EMBEDDED: 'KashiGRC call', NONE: 'No link', TEAMS: 'Teams', ZOOM: 'Zoom', MEET: 'Google Meet', OTHER: 'Link' }
/**
 * Can this call be joined right now? The SERVER decides; this just reads it.
 *
 * -- WHY THIS STOPPED BEING CLOCK ARITHMETIC -----------------------------
 *
 * It used to be:
 *
 *   m.inApp && m.status === 'SCHEDULED'
 *     && new Date(m.endsAt || m.startsAt).getTime() + 2h >= Date.now()
 *
 * which compares a time the SERVER wrote against the BROWSER's clock, using a
 * value that carries no timezone. startsAt/endsAt are LocalDateTime on the
 * backend, so they arrive as a bare "2026-10-08T10:52:00" and new Date() reads
 * that as browser-local.
 *
 * A meeting you scheduled yourself survives this, because your own browser
 * wrote that wall-clock string and reads the same one back. An ad-hoc call does
 * not: callNow stamps it with the server's clock. On a UTC server with IST
 * users, endsAt looks 5h30m in the past, blows straight through the two-hour
 * grace, and this returned false the instant the "join now" notification was
 * clicked — no button, no error, nothing. Exactly the reported symptom, and
 * exactly why scheduled meetings seemed fine.
 *
 * The server compares its own now against its own endsAt, which is arithmetic
 * that cannot be wrong, and it applies the same rule it uses when actually
 * issuing the LiveKit token — so the button and the endpoint can no longer
 * disagree about whether you may join.
 *
 * The fallback keeps old cached payloads working until `joinable` is present,
 * and is deliberately permissive: a wrongly shown Join button gets a clear
 * error from the server, while a wrongly hidden one is a dead end.
 */
export const callOpen = (m) => (m?.joinable !== undefined
  ? !!m.joinable
  : !!m?.inApp && m?.status !== 'CANCELLED')
/** Whether in-app calls are available here, and whether the caller may start one. */
export function useCallOptions() {
  const { data } = useQuery({ queryKey: ['collab-call-options'], queryFn: () => collabApi.callOptions(), staleTime: 5 * 60e3 })
  return unwrapOne(data) || {}
}
export const MEETING_STATUS = {
  SCHEDULED: { label: 'Scheduled', color: 'blue' },
  HELD:      { label: 'Held',      color: 'green' },
  CANCELLED: { label: 'Cancelled', color: 'gray' },
}

export const fmtDateTime = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d)) return s
  return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
export const fmtTime = (s) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
/** A Date as the "YYYY-MM-DDTHH:MM" a datetime-local input wants, in LOCAL time. */
const pad2 = (n) => String(n).padStart(2, '0')
export const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`

/**
 * Server timestamp -> the value a datetime-local input shows.
 *
 * It used to be String(s).slice(0, 16) — pure string truncation, which worked
 * only because the server sent a bare wall clock and the browser posted one
 * back. Now that timestamps carry their offset, slicing would show the SERVER's
 * wall clock in the box: edit a 2pm meeting from Delhi and the field would read
 * 08:30. Parse it to a real instant and render it where the viewer is.
 *
 * The slice is kept as the fallback for a value with no offset, so the form
 * still behaves if it meets an older payload.
 */
const toInput = (s) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d) ? String(s).slice(0, 16) : toLocalInput(d)
}

/**
 * The value from a datetime-local input -> what we send.
 *
 * The input gives a bare wall clock with no zone. Sending it as-is meant the
 * server read those digits in ITS zone, so "2pm" became 2pm UTC — 19:30 for an
 * IST user. Converting to an ISO instant first states the moment the person
 * actually picked, and the server converts it to its own clock on arrival.
 */
const fromInput = (v) => {
  if (!v) return null
  const d = new Date(v)        // a bare wall clock is parsed as LOCAL — what the person meant
  return isNaN(d) ? v : d.toISOString()
}
const SIDE_LABEL = { CLIENT: 'Organisation', FIRM: 'Audit firm' }

/** One meeting in a list. */
const RULE_LABEL = { DAILY: 'Every day', WEEKDAYS: 'Every weekday', WEEKLY: 'Every week' }
/** "Every weekday until 5 Nov" — from seriesRule "WEEKDAYS|2026-11-05"; "Repeats" for older series. */
export function seriesLabel(m) {
  if (!m?.repeats) return ''
  const [rule, until] = String(m.seriesRule || '').split('|')
  const base = RULE_LABEL[rule] || 'Repeats'
  return until ? `${base} until ${new Date(until + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : base
}
/**
 * A repeating meeting as ONE row: keep its next occurrence (the list must be
 * in date order) and note how many are left. Non-repeating meetings pass through.
 */
export function collapseSeries(list) {
  const left = {}
  list.forEach(m => { if (m.seriesRef) left[m.seriesRef] = (left[m.seriesRef] || 0) + 1 })
  const seen = new Set()
  return list.filter(m => !m.seriesRef || (!seen.has(m.seriesRef) && seen.add(m.seriesRef)))
    .map(m => (m.seriesRef && m.seriesLeft == null ? { ...m, seriesLeft: left[m.seriesRef] } : m))
}

export function MeetingRow({ m, onOpen, showWorkspace }) {
  const st = MEETING_STATUS[m.status] || MEETING_STATUS.SCHEDULED
  const upcoming = m.status === 'SCHEDULED' && new Date(m.endsAt || m.startsAt) >= new Date()
  const series = m.repeats && m.seriesLeft != null
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen() }}
      className="w-full text-left px-4 py-2.5 border-b border-border-subtle last:border-0 hover:bg-surface-overlay/50 flex items-center gap-3 cursor-pointer">
      <div className="w-14 shrink-0 text-center">
        {series && <p className="text-[9px] uppercase tracking-wide text-brand-900 font-semibold">Next</p>}
        <p className="text-[10px] uppercase text-text-muted">{new Date(m.startsAt).toLocaleDateString(undefined, { month: 'short' })}</p>
        <p className="text-lg leading-5 font-semibold text-text-primary">{new Date(m.startsAt).getDate()}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm truncate', m.status === 'CANCELLED' ? 'line-through text-text-muted' : 'text-text-primary')}>{m.title}</p>
        <p className="text-[11px] text-text-muted truncate">
          {fmtTime(m.startsAt)}{m.endsAt ? `–${fmtTime(m.endsAt)}` : ''} · {KIND_LABEL[m.kind] || m.kind}
          {showWorkspace ? ` · ${m.workspaceName || 'Internal'}` : ''}
          {m.roomName ? ` · ${m.roomName} room` : ''}
          {m.repeats ? ` · ${seriesLabel(m)}${series ? ` · ${m.seriesLeft} to go` : ''}` : ''}
          {' · '}<Users size={10} className="inline -mt-0.5" /> {(m.attendees || []).length}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {callOpen(m) && (
          <button type="button" onClick={e => { e.stopPropagation(); joinMeetingCall(m.id) }}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-900 hover:underline">
            <Video size={12} /> Join
          </button>
        )}
        {!m.inApp && upcoming && m.joinUrl && (
          <a href={m.joinUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-brand-900 hover:underline">
            <ExternalLink size={12} /> Join
          </a>
        )}
        <Badge label={st.label} colorTag={st.color} />
      </div>
    </div>
  )
}

/**
 * Schedule a meeting, or edit one (meeting = existing record).
 * workspaceId fixes the workspace (from a workspace tab); without it the
 * caller picks a workspace or "Internal" from the options the server returns.
 */
export function MeetingFormModal({ open, onClose, meeting, workspaceId, onSaved }) {
  const isNew = !meeting?.id
  const calls = useCallOptions()
  const [form, setForm] = useState(null)
  const [key, setKey] = useState(null)
  const token = open ? (meeting?.id ?? 'new') : null
  if (token !== key) {
    setKey(token)
    const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(10, 0, 0, 0)
    const pad = (n) => String(n).padStart(2, '0')
    const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    setForm(meeting?.id ? {
      workspaceId: meeting.workspaceId ? String(meeting.workspaceId) : '',
      programmeId: meeting.programmeId ? String(meeting.programmeId) : '',
      title: meeting.title || '', kind: meeting.kind || 'OTHER',
      startsAt: toInput(meeting.startsAt), endsAt: toInput(meeting.endsAt),
      provider: meeting.provider || 'NONE', joinUrl: meeting.joinUrl || '',
      attendeeUserIds: (meeting.attendees || []).map(a => a.userId),
    } : {
      workspaceId: workspaceId ? String(workspaceId) : '',
      programmeId: '', title: '', kind: workspaceId ? 'STATUS' : 'INTERNAL',
      startsAt: local(start), endsAt: local(end), provider: calls.enabled ? 'EMBEDDED' : 'NONE', joinUrl: '', attendeeUserIds: [],
    })
  }
  const f = form || {}
  const set = (k) => (e) => setForm(x => ({ ...x, [k]: e.target.value }))

  const { data: optRaw } = useQuery({
    queryKey: ['collab-meeting-options'],
    queryFn: () => collabApi.meetingOptions(),
    enabled: open,
  })
  const opts = unwrapOne(optRaw) || {}
  const workspaces = Array.isArray(opts.workspaces) ? opts.workspaces : []
  const ws = workspaces.find(w => String(w.id) === String(f.workspaceId))
  const programmes = ws?.programmes || []

  const { data: peopleRaw, isLoading: loadingPeople } = useQuery({
    queryKey: ['collab-eligible-attendees', f.workspaceId || 'internal', f.programmeId || ''],
    queryFn: () => collabApi.eligibleAttendees(f.workspaceId || null, f.programmeId || null),
    enabled: open && !!form,
  })
  const people = unwrapList(peopleRaw)

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const body = {
        title: f.title, kind: f.kind, startsAt: fromInput(f.startsAt), endsAt: fromInput(f.endsAt),
        provider: f.provider, joinUrl: f.provider === 'NONE' || f.provider === 'EMBEDDED' ? null : (f.joinUrl || null),
        attendeeUserIds: f.attendeeUserIds,
      }
      if (isNew) {
        body.workspaceId = f.workspaceId || null
        body.programmeId = f.workspaceId && f.programmeId ? f.programmeId : null
        return collabApi.createMeeting(body)
      }
      return collabApi.updateMeeting(meeting.id, body)
    },
    onSuccess: (r) => {
      toast.success(isNew ? 'Meeting scheduled — invitations sent' : 'Meeting updated')
      onSaved?.(unwrapOne(r)); onClose()
    },
    onError: (e) => toast.error(errMsg(e, 'Could not save the meeting')),
  })

  const input = 'w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary'
  const kinds = f.workspaceId ? Object.keys(KIND_LABEL).filter(k => k !== 'INTERNAL') : Object.keys(KIND_LABEL)

  return (
    <Modal open={open} onClose={onClose} size="lg" title={isNew ? 'Schedule a meeting' : 'Edit meeting'}
      subtitle={isNew ? 'Invitees are notified. Paste the Teams, Zoom or Meet link if there is one.' : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button size="sm" onClick={() => mutate()} loading={isPending}
            disabled={!f.title?.trim() || !f.startsAt}>{isNew ? 'Schedule' : 'Save'}</Button>
        </div>
      }>
      {form && (
        <div className="space-y-3">
          {isNew && !workspaceId && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-text-secondary">Where</span>
                <select value={f.workspaceId} onChange={e => setForm(x => ({ ...x, workspaceId: e.target.value, programmeId: '', attendeeUserIds: [],
                    kind: e.target.value ? (x.kind === 'INTERNAL' ? 'STATUS' : x.kind) : 'INTERNAL' }))}
                  className={cn(input, 'mt-1')}>
                  {opts.canScheduleInternal && <option value="">Internal — my organisation only</option>}
                  {!opts.canScheduleInternal && <option value="" disabled>Choose a workspace</option>}
                  {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              {f.workspaceId && programmes.length > 0 && (
                <label className="block">
                  <span className="text-xs text-text-secondary">Programme</span>
                  <select value={f.programmeId} onChange={e => setForm(x => ({ ...x, programmeId: e.target.value, attendeeUserIds: [] }))}
                    className={cn(input, 'mt-1')}>
                    <option value="">Whole workspace</option>
                    {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
          {isNew && workspaceId && programmes.length > 0 && (
            <label className="block">
              <span className="text-xs text-text-secondary">Programme</span>
              <select value={f.programmeId} onChange={e => setForm(x => ({ ...x, programmeId: e.target.value, attendeeUserIds: [] }))}
                className={cn(input, 'mt-1')}>
                <option value="">Whole workspace</option>
                {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          <div className="grid grid-cols-3 gap-2">
            <input value={f.title} onChange={set('title')} placeholder="Title, e.g. Opening meeting" className={cn(input, 'col-span-2')} />
            <select value={f.kind} onChange={set('kind')} className={input}>
              {kinds.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-text-secondary">Starts</span>
              <input type="datetime-local" value={f.startsAt} onChange={set('startsAt')} className={cn(input, 'mt-1 px-2')} />
            </label>
            <label className="block">
              <span className="text-xs text-text-secondary">Ends</span>
              <input type="datetime-local" value={f.endsAt} onChange={set('endsAt')} className={cn(input, 'mt-1 px-2')} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <select value={f.provider} onChange={set('provider')} className={input}>
              {Object.entries(PROVIDER_LABEL).filter(([k]) => k !== 'EMBEDDED' || calls.enabled || f.provider === 'EMBEDDED')
                .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {f.provider === 'EMBEDDED' && (
              <p className="col-span-2 self-center text-[11px] text-text-muted">Invitees join from the meeting — no link needed.</p>
            )}
            {f.provider !== 'NONE' && f.provider !== 'EMBEDDED' && (
              <input value={f.joinUrl} onChange={set('joinUrl')} placeholder="https://…" className={cn(input, 'col-span-2')} />
            )}
          </div>

          <div>
            <span className="text-xs font-medium text-text-secondary">Invite</span>
            <div className="mt-1">
              <PeopleMultiSelect people={people} loading={loadingPeople} value={f.attendeeUserIds || []}
                onChange={(ids) => setForm(x => ({ ...x, attendeeUserIds: ids }))}
                sideLabel={f.workspaceId ? (s) => SIDE_LABEL[s] || s : undefined}
                placeholder="Search people to invite…" emptyText="Nobody can be invited here." />
            </div>
            {f.workspaceId && f.programmeId && (
              <p className="text-[11px] text-text-muted mt-1">The audit firm's people can be invited when they are on this programme.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Small chip list of attendees. */
export function AttendeeChips({ attendees = [], onRemove }) {
  return (
    <div className="flex flex-wrap gap-1">
      {attendees.map(a => (
        <span key={a.userId} className="text-[11px] px-1.5 py-0.5 rounded-full bg-surface-overlay text-text-secondary inline-flex items-center gap-1">
          {a.name}
          {onRemove && <button type="button" onClick={() => onRemove(a.userId)} aria-label="Remove"><X size={10} /></button>}
        </span>
      ))}
    </div>
  )
}

/** Workspace › Meetings tab. */
export function WorkspaceMeetingsTab({ workspaceId, archived, onOpen }) {
  const [creating, setCreating] = useState(false)
  const [calling, setCalling] = useState(false)
  const calls = useCallOptions()
  const { data: raw, isLoading, refetch } = useQuery({
    queryKey: ['collab-ws-meetings', workspaceId],
    queryFn: () => collabApi.workspaceMeetings(workspaceId),
  })
  const { data: optRaw } = useQuery({ queryKey: ['collab-meeting-options'], queryFn: () => collabApi.meetingOptions() })
  const canSchedule = !!unwrapOne(optRaw)?.canSchedule && !archived
  const all = unwrapList(raw)
  const now = new Date()
  const upcoming = collapseSeries(all.filter(m => m.status === 'SCHEDULED' && new Date(m.endsAt || m.startsAt) >= now)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)))
  const past = all.filter(m => !(m.status === 'SCHEDULED' && new Date(m.endsAt || m.startsAt) >= now))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">Meetings in this workspace, with their agenda, minutes, decisions and follow-ups.</p>
        <div className="flex items-center gap-2">
          {calls.canStart && !archived && <Button variant="secondary" size="sm" icon={Phone} onClick={() => setCalling(true)}>Call now</Button>}
          {canSchedule && <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>Meeting</Button>}
        </div>
      </div>
      {calls.enabled && <RoomsPanel workspaceId={Number(workspaceId)} archived={archived} compact />}
      {isLoading ? <p className="text-xs text-text-muted">Loading…</p> : (
        <>
          <Section title="Upcoming" empty="Nothing scheduled.">
            {upcoming.map(m => <MeetingRow key={m.id} m={m} onOpen={() => onOpen(m.id)} />)}
          </Section>
          <Section title="Earlier" empty="No earlier meetings.">
            {past.map(m => <MeetingRow key={m.id} m={m} onOpen={() => onOpen(m.id)} />)}
          </Section>
        </>
      )}
      <MeetingFormModal open={creating} onClose={() => setCreating(false)} workspaceId={workspaceId}
        onSaved={(m) => { refetch(); if (m?.id) onOpen(m.id) }} />
      <CallNowModal open={calling} onClose={() => setCalling(false)} workspaceId={workspaceId} onStarted={() => refetch()} />
    </div>
  )
}

/**
 * Call now — pick people, start an in-app call at once. It is saved as a
 * meeting (kind Call) so it gets a record: minutes, decisions, follow-ups.
 * Without workspaceId the caller picks a workspace or an internal call.
 */
export function CallNowModal({ open, onClose, workspaceId, onStarted }) {
  const [wsId, setWsId] = useState(workspaceId ? String(workspaceId) : '')
  const [programmeId, setProgrammeId] = useState('')
  const [title, setTitle] = useState('')
  const [picked, setPicked] = useState([])
  const [was, setWas] = useState(false)
  if (open !== was) {
    setWas(open)
    if (open) { setWsId(workspaceId ? String(workspaceId) : ''); setProgrammeId(''); setTitle(''); setPicked([]) }
  }
  const { data: optRaw } = useQuery({ queryKey: ['collab-meeting-options'], queryFn: () => collabApi.meetingOptions(), enabled: open })
  const opts = unwrapOne(optRaw) || {}
  const workspaces = Array.isArray(opts.workspaces) ? opts.workspaces : []
  const programmes = workspaces.find(w => String(w.id) === String(wsId))?.programmes || []
  const { data: peopleRaw, isLoading } = useQuery({
    queryKey: ['collab-eligible-attendees', wsId || 'internal', programmeId || ''],
    queryFn: () => collabApi.eligibleAttendees(wsId || null, programmeId || null),
    enabled: open,
  })
  const people = unwrapList(peopleRaw)
  const { mutate, isPending } = useMutation({
    mutationFn: () => collabApi.callNow({ workspaceId: wsId || null, programmeId: wsId && programmeId ? programmeId : null,
      title: title.trim() || null, attendeeUserIds: picked }),
    onSuccess: (r) => { const x = unwrapOne(r); startCall(x); onStarted?.(x); onClose() },
    onError: (e) => toast.error(errMsg(e, 'Could not start the call')),
  })
  const input = 'w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary'
  return (
    <Modal open={open} onClose={onClose} size="md" title="Call now"
      subtitle="The people you pick are told to join. The call is saved as a meeting, so you can keep minutes and follow-ups."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button size="sm" icon={Phone} onClick={() => mutate()} loading={isPending} disabled={picked.length === 0}>
            Start call
          </Button>
        </div>
      }>
      <div className="space-y-3">
        {!workspaceId && (
          <select value={wsId} onChange={e => { setWsId(e.target.value); setProgrammeId(''); setPicked([]) }} className={input}>
            {opts.canScheduleInternal && <option value="">Internal — my organisation only</option>}
            {!opts.canScheduleInternal && <option value="" disabled>Choose a workspace</option>}
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        {wsId && programmes.length > 0 && (
          <select value={programmeId} onChange={e => { setProgrammeId(e.target.value); setPicked([]) }} className={input}>
            <option value="">Whole workspace</option>
            {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What about? (optional)" className={input} />
        <div>
          <span className="text-xs font-medium text-text-secondary">Who</span>
          <div className="mt-1">
            <PeopleMultiSelect people={people} loading={isLoading} value={picked} onChange={setPicked}
              sideLabel={wsId ? (s) => SIDE_LABEL[s] || s : undefined}
              placeholder="Search people to call…" emptyText="Nobody to call here." />
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function Section({ title, empty, children, actions }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <div className="rounded-card border border-border bg-surface-raised">
      <div className="px-4 py-2 border-b border-border-subtle flex items-center justify-between">
        <p className="text-xs font-medium text-text-secondary flex items-center gap-1.5"><Calendar size={12} /> {title}</p>
        {actions}
      </div>
      {has ? children : <p className="px-4 py-5 text-xs text-text-muted text-center">{empty}</p>}
    </div>
  )
}