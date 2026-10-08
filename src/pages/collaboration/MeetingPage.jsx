import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Pencil, CheckCircle2, X, Plus, RotateCcw, Users, Video } from 'lucide-react'
import { collabApi, unwrapList, unwrapOne, errMsg } from '../../api/collab.api'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { Skeleton } from '../../components/ui/EmptyState'
import EvidenceUploader from '../../components/ui/EvidenceUploader'
import { MeetingFormModal, KIND_LABEL, PROVIDER_LABEL, MEETING_STATUS, fmtDateTime, fmtTime, callOpen, seriesLabel } from '../../components/collab/Meetings'
import { joinMeetingCall } from '../../components/collab/call/callStore'
import { REQUEST_STATUS, fmtDue } from '../../components/collab/WorkspaceRequestsTab'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

/**
 * Collaboration › Meeting — the record of one meeting: when, who, the join
 * link, the agenda, minutes, decisions, attendance, follow-ups (action items
 * in the assignee's inbox) and files. Whoever runs the meeting (canRun from
 * the server) edits; everyone who can see it reads.
 */
const SIDE_LABEL = { CLIENT: 'Organisation', FIRM: 'Audit firm' }

export default function MeetingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const autoJoined = useRef(false)
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [stopSeries, setStopSeries] = useState(false)
  const [who, setWho] = useState('')
  const [followUp, setFollowUp] = useState(false)

  const { data: raw, isLoading, isError } = useQuery({
    queryKey: ['collab-meeting', id],
    queryFn: () => collabApi.meeting(id),
  })
  const m = unwrapOne(raw)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['collab-meeting', id] })
    qc.invalidateQueries({ queryKey: ['collab-my-meetings'] })
    if (m?.workspaceId) qc.invalidateQueries({ queryKey: ['collab-ws-meetings', String(m.workspaceId)] })
  }
  const patch = useMutation({
    mutationFn: (body) => collabApi.updateMeeting(id, body),
    onSuccess: (r) => { qc.setQueryData(['collab-meeting', id], r); refresh() },
    onError: (e) => toast.error(errMsg(e, 'Could not save')),
  })

  // ?join=1 (from a "join now" notification or Call now): open the call once.
  useEffect(() => {
    if (autoJoined.current || !m?.id || search.get('join') !== '1') return
    autoJoined.current = true
    const next = new URLSearchParams(search); next.delete('join'); setSearch(next, { replace: true })
    // Say something when it cannot be joined. This branch used to be silent:
    // the ?join=1 was consumed, callOpen said no, and the page just sat there —
    // which from the outside is a notification that leads nowhere.
    if (callOpen(m)) joinMeetingCall(m.id).then(() => qc.invalidateQueries({ queryKey: ['collab-meeting', id] }))
    else if (m.status === 'CANCELLED') toast.error('This meeting was cancelled')
    else if (!m.inApp) toast('This meeting uses an outside link — open it below')
    else toast('This call has ended')
  }, [m, search, setSearch, id, qc])

  const back = () => m?.workspaceId
    ? navigate(`/collaboration/workspaces/${m.workspaceId}?tab=meetings`)
    : navigate('/collaboration/meetings')

  if (isLoading) {
    return <PageLayout title="Meeting"><div className="px-6 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div></PageLayout>
  }
  if (isError || !m?.id) {
    return (
      <PageLayout title="Meeting" onBack={() => navigate('/collaboration/meetings')}>
        <p className="px-6 text-sm text-text-muted">This meeting does not exist or you are not invited to it.</p>
      </PageLayout>
    )
  }

  const st = MEETING_STATUS[m.status] || MEETING_STATUS.SCHEDULED
  const canRun = !!m.canRun
  const attendees = Array.isArray(m.attendees) ? m.attendees : []
  const followUps = Array.isArray(m.followUps) ? m.followUps : []

  return (
    <PageLayout
      title={m.title}
      subtitle={`${KIND_LABEL[m.kind] || m.kind} · ${m.workspaceName || 'Internal meeting'}${m.roomName ? ` · in the ${m.roomName} room` : ''}${m.repeats ? ` · ${seriesLabel(m)}` : ''} · organised by ${m.organizerName}`}
      onBack={back}
      actions={
        <div className="flex items-center gap-2">
          {callOpen(m) && (
            <Button size="sm" icon={Video}
              onClick={() => joinMeetingCall(m.id).then(() => qc.invalidateQueries({ queryKey: ['collab-meeting', id] }))}>
              Join call
            </Button>
          )}
          {!m.inApp && m.joinUrl && m.status === 'SCHEDULED' && (
            <a href={m.joinUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-ctl bg-brand-500 text-brand-900 text-xs font-medium hover:bg-brand-600">
              <ExternalLink size={13} /> Join{m.provider && m.provider !== 'OTHER' ? ` on ${PROVIDER_LABEL[m.provider]}` : ''}
            </a>
          )}
          {canRun && m.status !== 'CANCELLED' && (
            <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
          )}
          {m.roomId && (
            <Button variant="ghost" size="sm" onClick={() => navigate(`/collaboration/rooms/${m.roomId}`)}>Room</Button>
          )}
          {canRun && m.repeats && m.status === 'SCHEDULED' && (
            <Button variant="ghost" size="sm" icon={X} onClick={() => setStopSeries(true)}>Stop repeating</Button>
          )}
          {canRun && m.status === 'SCHEDULED' && (
            <>
              <Button variant="secondary" size="sm" icon={CheckCircle2} onClick={() => patch.mutate({ status: 'HELD' })}>Mark held</Button>
              <Button variant="ghost" size="sm" icon={X} onClick={() => setCancelling(true)}>Cancel meeting</Button>
            </>
          )}
          {canRun && m.status !== 'SCHEDULED' && (
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => patch.mutate({ status: 'SCHEDULED' })}>Reopen</Button>
          )}
        </div>
      }
    >
      <div className="px-6 pb-6 overflow-y-auto grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Card>
            <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <Badge label={st.label} colorTag={st.color} />
              <span className="text-text-primary">{fmtDateTime(m.startsAt)}{m.endsAt ? ` – ${fmtTime(m.endsAt)}` : ''}</span>
              <span className="text-text-muted text-xs">{m.provider === 'NONE' || !m.provider ? 'No call link' : PROVIDER_LABEL[m.provider] || m.provider}</span>
            </CardBody>
          </Card>

          {Array.isArray(m.series) && m.series.length > 1 && (
            <Card>
              <CardHeader title={seriesLabel(m)} subtitle={`${m.series.length} dates — each has its own notes and attendance`} />
              <CardBody>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {m.series.map(x => {
                    const d = new Date(x.startsAt)
                    const here = x.id === m.id
                    return (
                      <button key={x.id} type="button" onClick={() => !here && navigate(`/collaboration/meetings/${x.id}`)}
                        title={x.status === 'CANCELLED' ? 'Cancelled' : x.hasMinutes ? 'Has minutes' : ''}
                        className={cn('shrink-0 w-12 rounded-ctl border px-1 py-1 text-center',
                          here ? 'border-brand-500 bg-brand-500/15' : 'border-border hover:bg-surface-overlay',
                          x.status === 'CANCELLED' && 'opacity-50 line-through')}>
                        <span className="block text-[9px] uppercase text-text-muted">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
                        <span className="block text-sm font-semibold text-text-primary leading-4">{d.getDate()}</span>
                        <span className={cn('mx-auto mt-0.5 block w-1 h-1 rounded-full', x.hasMinutes ? 'bg-brand-500' : 'bg-transparent')} />
                      </button>
                    )
                  })}
                </div>
              </CardBody>
            </Card>
          )}

          <ListEditor title="Agenda" items={m.agenda} canEdit={canRun} placeholder="Add an agenda point"
            saving={patch.isPending} onSave={(agenda) => patch.mutate({ agenda })} checkable />

          <MinutesCard minutes={m.minutes} canEdit={canRun} saving={patch.isPending}
            onSave={(minutes) => patch.mutate({ minutes }, { onSuccess: () => toast.success('Minutes saved') })} />

          <ListEditor title="Decisions" items={m.decisions} canEdit={canRun} placeholder="Record a decision"
            saving={patch.isPending} onSave={(decisions) => patch.mutate({ decisions })} />

          <Card>
            <CardHeader title="Follow-ups" subtitle="Each one lands in the assignee's inbox"
              actions={canRun && <Button size="xs" icon={Plus} onClick={() => setFollowUp(true)}>Follow-up</Button>} />
            <CardBody className="p-0">
              {followUps.length === 0 ? <p className="px-4 py-5 text-xs text-text-muted text-center">No follow-ups.</p>
                : followUps.map(f => {
                  const fs = REQUEST_STATUS[f.status] || { label: f.status, color: 'gray' }
                  return (
                    <div key={f.id} className="px-4 py-2 border-b border-border-subtle last:border-0 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-text-primary truncate">{f.title}</p>
                        <p className="text-[11px] text-text-muted truncate">{f.assigneeName}{f.dueAt ? ` · due ${fmtDue(f.dueAt)}` : ''}</p>
                      </div>
                      <Badge label={f.status === 'RESOLVED' ? 'Done' : fs.label} colorTag={fs.color} />
                    </div>
                  )
                })}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Attendees"
              subtitle={`${attendees.filter(a => a.attended).length} of ${attendees.length} attended${canRun ? ' — tick who came' : ''}`} />
            {attendees.length > 8 && (
              <div className="px-4 pt-2">
                <input value={who} onChange={e => setWho(e.target.value)} placeholder="Find someone"
                  className="w-full h-8 rounded-ctl border border-border bg-surface-raised px-2.5 text-xs text-text-primary" />
              </div>
            )}
            {/* Fixed height: a meeting with thirty invitees scrolls inside the card, not the page. */}
            <CardBody className="p-0 max-h-[360px] overflow-y-auto">
              {attendees.filter(a => !who.trim() || a.name.toLowerCase().includes(who.trim().toLowerCase())).map(a => (
                <label key={a.userId} className="px-4 py-2 flex items-center gap-2 border-b border-border-subtle last:border-0">
                  {canRun && m.status !== 'CANCELLED' ? (
                    <input type="checkbox" checked={!!a.attended} disabled={patch.isPending}
                      onChange={e => patch.mutate({ attended: { [a.userId]: e.target.checked } })} />
                  ) : (
                    <Users size={12} className="text-text-muted" />
                  )}
                  <span className="text-sm text-text-primary flex-1 truncate">{a.name}</span>
                  {m.workspaceId && <span className="text-[10px] text-text-muted">{SIDE_LABEL[a.side] || a.side}</span>}
                  {a.attended && !canRun && <CheckCircle2 size={12} className="text-status-pass-fg" />}
                </label>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Files" subtitle="Slides, sign-in sheets, anything shared in the meeting" />
            <CardBody>
              <EvidenceUploader entityType="COLLAB_MEETING" entityId={m.id} documentType="EVIDENCE"
                canUpload={m.status !== 'CANCELLED'} canRemove={canRun} compact emptyLabel="No files yet" />
            </CardBody>
          </Card>
        </div>
      </div>

      <MeetingFormModal open={editing} onClose={() => setEditing(false)} meeting={m}
        onSaved={(r) => { if (r?.id) qc.setQueryData(['collab-meeting', id], r); refresh() }} />
      <FollowUpModal open={followUp} onClose={() => setFollowUp(false)} meeting={m}
        onDone={(r) => { qc.setQueryData(['collab-meeting', id], r); refresh() }} />
      <ConfirmDialog open={stopSeries} onClose={() => setStopSeries(false)} onCancel={() => setStopSeries(false)}
        onConfirm={() => collabApi.cancelSeries(m.id).then((r) => {
          toast.success(`${unwrapOne(r)?.cancelled ?? 0} occurrence(s) cancelled`); setStopSeries(false); refresh()
        }).catch(e => toast.error(errMsg(e, 'Could not cancel the series')))}
        title="Stop this meeting repeating?"
        message="This occurrence and every later one are cancelled. Earlier ones, and their notes, stay." confirmLabel="Stop repeating" />
      <ConfirmDialog open={cancelling} onClose={() => setCancelling(false)} onCancel={() => setCancelling(false)}
        onConfirm={() => patch.mutate({ status: 'CANCELLED' }, { onSuccess: () => setCancelling(false) })}
        loading={patch.isPending} title="Cancel this meeting?"
        message="Everyone invited is told it is cancelled. The record stays." confirmLabel="Cancel meeting" />
    </PageLayout>
  )
}

/** A short list of points (agenda, decisions) edited in place. */
function ListEditor({ title, items, canEdit, placeholder, onSave, saving, checkable }) {
  const list = (Array.isArray(items) ? items : []).map(x => (typeof x === 'string' ? { text: x } : x || {}))
  const [draft, setDraft] = useState('')
  const save = (next) => onSave(next)
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="space-y-1.5">
        {list.length === 0 && !canEdit && <p className="text-xs text-text-muted">Nothing recorded.</p>}
        {list.map((x, i) => (
          <div key={i} className="flex items-start gap-2 group">
            {checkable ? (
              <input type="checkbox" className="mt-1" checked={!!x.done} disabled={!canEdit || saving}
                onChange={e => save(list.map((y, j) => j === i ? { ...y, done: e.target.checked } : y))} />
            ) : <span className="text-text-muted text-sm leading-6">•</span>}
            <p className={`text-sm flex-1 whitespace-pre-wrap ${x.done ? 'line-through text-text-muted' : 'text-text-primary'}`}>{x.text}</p>
            {canEdit && (
              <button type="button" className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-status-fail-fg"
                onClick={() => save(list.filter((_, j) => j !== i))} aria-label="Remove" disabled={saving}>
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <form className="flex gap-2 pt-1" onSubmit={e => {
            e.preventDefault()
            if (!draft.trim()) return
            save([...list, { text: draft.trim() }]); setDraft('')
          }}>
            <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={placeholder}
              className="flex-1 h-8 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary" />
            <Button type="submit" size="sm" variant="secondary" icon={Plus} disabled={!draft.trim() || saving}>Add</Button>
          </form>
        )}
      </CardBody>
    </Card>
  )
}

function MinutesCard({ minutes, canEdit, onSave, saving }) {
  const [text, setText] = useState(null)   // null = not editing
  return (
    <Card>
      <CardHeader title="Minutes"
        actions={canEdit && text === null && (
          <Button variant="ghost" size="xs" icon={Pencil} onClick={() => setText(minutes || '')}>{minutes ? 'Edit' : 'Write'}</Button>
        )} />
      <CardBody>
        {text !== null ? (
          <div className="space-y-2">
            <textarea value={text} onChange={e => setText(e.target.value)} rows={10} autoFocus
              className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setText(null)} disabled={saving}>Cancel</Button>
              <Button size="sm" loading={saving} onClick={() => { onSave(text); setText(null) }}>Save</Button>
            </div>
          </div>
        ) : minutes
          ? <p className="text-sm text-text-primary whitespace-pre-wrap">{minutes}</p>
          : <p className="text-xs text-text-muted">No minutes yet.</p>}
      </CardBody>
    </Card>
  )
}

function FollowUpModal({ open, onClose, meeting, onDone }) {
  const blank = { title: '', description: '', assigneeUserId: '', dueDate: '' }
  const [form, setForm] = useState(blank)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const { data: raw } = useQuery({
    queryKey: ['collab-eligible-attendees', meeting.workspaceId ? String(meeting.workspaceId) : 'internal', meeting.programmeId ? String(meeting.programmeId) : ''],
    queryFn: () => collabApi.eligibleAttendees(meeting.workspaceId || null, meeting.programmeId || null),
    enabled: open,
  })
  const people = unwrapList(raw)
  const { mutate, isPending } = useMutation({
    mutationFn: () => collabApi.addFollowUp(meeting.id, { ...form, dueDate: form.dueDate || null }),
    onSuccess: (r) => { toast.success('Follow-up added'); setForm(blank); onDone(r); onClose() },
    onError: (e) => toast.error(errMsg(e, 'Could not add the follow-up')),
  })
  const input = 'w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary'
  return (
    <Modal open={open} onClose={onClose} size="md" title="Add a follow-up"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button size="sm" onClick={() => mutate()} loading={isPending} disabled={!form.title.trim() || !form.assigneeUserId}>Add</Button>
        </div>
      }>
      <div className="space-y-3">
        <input value={form.title} onChange={set('title')} placeholder="What needs doing" className={input} />
        <textarea value={form.description} onChange={set('description')} rows={2} placeholder="Details (optional)"
          className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary" />
        <div className="grid grid-cols-2 gap-2">
          <select value={form.assigneeUserId} onChange={set('assigneeUserId')} className={input}>
            <option value="">Who</option>
            {people.map(p => <option key={p.userId} value={p.userId}>{p.name}</option>)}
          </select>
          <input type="date" value={form.dueDate} onChange={set('dueDate')} className={input} />
        </div>
      </div>
    </Modal>
  )
}