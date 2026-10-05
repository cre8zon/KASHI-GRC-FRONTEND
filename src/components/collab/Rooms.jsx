import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Video, Plus, Pencil, Users, Archive } from 'lucide-react'
import { collabApi, unwrapList, unwrapOne, errMsg } from '../../api/collab.api'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { cn } from '../../lib/cn'
import { joinRoomCall } from './call/callStore'
import { PeopleMultiSelect } from './PeopleMultiSelect'
import toast from 'react-hot-toast'

/**
 * Standing call rooms — always open, join any time ("Audit team daily",
 * "ISO war room"). Only members can join; whoever created a room (or a
 * workspace owner) changes its members or archives it. Shows who is in each
 * room right now when the call server can be asked.
 *
 * workspaceId: show only that workspace's rooms and create rooms there.
 * Without it: every room I am in, workspace and internal.
 */
export function RoomsPanel({ workspaceId, archived, compact }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(null)        // null | {} new | room
  const { data: raw, isLoading } = useQuery({
    queryKey: ['collab-rooms'],
    queryFn: () => collabApi.rooms(),
    refetchInterval: 30_000,          // keep "who is in it" fresh
  })
  const data = unwrapOne(raw) || {}
  const rooms = (Array.isArray(data.rooms) ? data.rooms : [])
    .filter(r => workspaceId == null || r.workspaceId === workspaceId)
  const canCreate = !!data.canCreate && !archived
  const refresh = () => qc.invalidateQueries({ queryKey: ['collab-rooms'] })

  if (!data.enabled && !isLoading) {
    return compact ? null : (
      <p className="text-xs text-text-muted">In-app calls are not set up on this server yet.</p>
    )
  }
  if (compact && rooms.length === 0 && !canCreate) return null

  return (
    <div className="rounded-card border border-border bg-surface-raised">
      <div className="px-4 py-2 border-b border-border-subtle flex items-center justify-between">
        <p className="text-xs font-medium text-text-secondary flex items-center gap-1.5"><Video size={12} /> Rooms</p>
        {canCreate && <Button variant="ghost" size="xs" icon={Plus} onClick={() => setEditing({})}>Room</Button>}
      </div>
      {isLoading ? <p className="px-4 py-4 text-xs text-text-muted">Loading…</p>
        : rooms.length === 0 ? (
          <p className="px-4 py-5 text-xs text-text-muted text-center">
            No rooms yet. A room is a call that is always there — for a team's daily stand-up or a project's war room.
          </p>
        ) : (
          <div className={cn('grid gap-px bg-border-subtle', compact ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-3')}>
            {rooms.map(r => {
              const live = Array.isArray(r.live) ? r.live : null
              return (
                <div key={r.id} role="button" tabIndex={0} onClick={() => navigate(`/collaboration/rooms/${r.id}`)}
                  onKeyDown={e => { if (e.key === 'Enter') navigate(`/collaboration/rooms/${r.id}`) }}
                  className="bg-surface-raised px-4 py-3 flex flex-col gap-2 cursor-pointer hover:bg-surface-overlay/40">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">{r.name}</p>
                      <p className="text-[11px] text-text-muted truncate">
                        {workspaceId == null ? (r.workspaceName || 'Internal') + ' · ' : ''}
                        <Users size={10} className="inline -mt-0.5" /> {(r.members || []).length}
                      </p>
                    </div>
                    {r.canManage && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(r) }} aria-label="Edit room"
                        className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay"><Pencil size={12} /></button>
                    )}
                  </div>
                  {r.description && <p className="text-xs text-text-secondary line-clamp-2">{r.description}</p>}
                  <div className="flex items-center justify-between gap-2 mt-auto">
                    <span className={cn('text-[11px] truncate', live?.length ? 'text-status-pass-fg font-medium' : 'text-text-muted')}>
                      {live == null ? '' : live.length === 0 ? 'Nobody in it' : `In it now: ${live.join(', ')}`}
                    </span>
                    <Button size="xs" icon={Video} onClick={(e) => { e.stopPropagation(); joinRoomCall(r.id).then(refresh) }}>Join</Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      <RoomModal room={editing} workspaceId={workspaceId} onClose={() => setEditing(null)} onDone={refresh} />
    </div>
  )
}

export function RoomModal({ room, workspaceId, onClose, onDone }) {
  const isNew = room && !room.id
  const [form, setForm] = useState(null)
  const [key, setKey] = useState(null)
  const token = room ? (room.id ?? 'new') : null
  if (token !== key) {
    setKey(token)
    setForm(room ? {
      name: room.name || '', description: room.description || '',
      workspaceId: room.id ? (room.workspaceId ?? '') : (workspaceId ?? ''),
      memberUserIds: (room.members || []).map(m => m.userId),
    } : null)
  }
  const f = form || {}
  const { data: optRaw } = useQuery({ queryKey: ['collab-meeting-options'], queryFn: () => collabApi.meetingOptions(), enabled: !!room })
  const opts = unwrapOne(optRaw) || {}
  const workspaces = Array.isArray(opts.workspaces) ? opts.workspaces : []
  const { data: peopleRaw, isLoading } = useQuery({
    queryKey: ['collab-eligible-attendees', f.workspaceId ? String(f.workspaceId) : 'internal', ''],
    queryFn: () => collabApi.eligibleAttendees(f.workspaceId || null, null),
    enabled: !!room && !!form,
  })
  const people = unwrapList(peopleRaw)
  const save = useMutation({
    mutationFn: (extra = {}) => isNew
      ? collabApi.createRoom({ name: f.name, description: f.description, workspaceId: f.workspaceId || null, memberUserIds: f.memberUserIds })
      : collabApi.updateRoom(room.id, { name: f.name, description: f.description, memberUserIds: f.memberUserIds, ...extra }),
    onSuccess: (_r, extra) => { toast.success(extra?.archived ? 'Room archived' : isNew ? 'Room created' : 'Room updated'); onDone(); onClose() },
    onError: (e) => toast.error(errMsg(e, 'Could not save the room')),
  })
  if (!room || !form) return null
  const input = 'w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary'
  return (
    <Modal open={!!room} onClose={onClose} size="md" title={isNew ? 'New room' : 'Edit room'}
      subtitle="A call room that is always open. Only its members can join."
      footer={
        <div className="flex justify-between gap-2">
          <div>{!isNew && <Button variant="ghost" size="sm" icon={Archive} onClick={() => save.mutate({ archived: true })} disabled={save.isPending}>Archive</Button>}</div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={save.isPending}>Cancel</Button>
            <Button size="sm" onClick={() => save.mutate({})} loading={save.isPending} disabled={!f.name.trim()}>{isNew ? 'Create' : 'Save'}</Button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        {isNew && workspaceId == null && (
          <select value={f.workspaceId} onChange={e => setForm(x => ({ ...x, workspaceId: e.target.value, memberUserIds: [] }))} className={input}>
            {opts.canScheduleInternal && <option value="">Internal — my organisation only</option>}
            {!opts.canScheduleInternal && <option value="" disabled>Choose a workspace</option>}
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        <input value={f.name} onChange={e => setForm(x => ({ ...x, name: e.target.value }))} placeholder="Name, e.g. Audit team daily" className={input} />
        <input value={f.description} onChange={e => setForm(x => ({ ...x, description: e.target.value }))} placeholder="What it is for (optional)" className={input} />
        <div>
          <span className="text-xs font-medium text-text-secondary">Members</span>
          <div className="mt-1">
            <PeopleMultiSelect people={people} loading={isLoading} value={f.memberUserIds}
              onChange={(ids) => setForm(x => ({ ...x, memberUserIds: ids }))}
              placeholder="Search people to add…" />
          </div>
          {isNew && <p className="text-[11px] text-text-muted mt-1">You are always a member of rooms you create.</p>}
        </div>
      </div>
    </Modal>
  )
}
