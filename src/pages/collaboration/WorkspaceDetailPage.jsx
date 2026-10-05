import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Building2, Users, Layers, UserMinus, Pencil, Archive, RotateCcw, Calendar, X } from 'lucide-react'
import { collabApi, unwrapList, unwrapOne, errMsg } from '../../api/collab.api'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { Skeleton } from '../../components/ui/EmptyState'
import toast from 'react-hot-toast'
import { useUrlState } from '../../hooks/useUrlState'
import { WorkspacePlanTab } from '../../components/collab/WorkspacePlanTab'
import { WorkspaceMeetingsTab } from '../../components/collab/Meetings'
import { WorkspaceRequestsTab } from '../../components/collab/WorkspaceRequestsTab'
import EvidenceUploader from '../../components/ui/EvidenceUploader'
import { cn } from '../../lib/cn'

/**
 * Collaboration › Workspace — who is in it and its programmes (overview), the
 * plan, meetings, requests between the two sides, and shared documents.
 *
 * What the caller may change comes from the server (canManage): workspace
 * owners, or the organisation's staff holding collab:workspace:manage. The
 * firm's people only ever receive the programmes they are on, so nothing here
 * filters by side.
 */
const SIDE_LABEL = { CLIENT: 'Organisation', FIRM: 'Audit firm' }
const ROLE_LABEL = { OWNER: 'Owner', MEMBER: 'Member', VIEWER: 'Viewer' }
const PROG_STATUS = { PLANNED: 'gray', ACTIVE: 'blue', COMPLETED: 'green', ARCHIVED: 'gray' }

export default function WorkspaceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editWs, setEditWs] = useState(false)
  const [progEdit, setProgEdit] = useState(null)          // null | {} (new) | programme
  const [progMembersId, setProgMembersId] = useState(null) // programme id
  const [removing, setRemoving] = useState(null)          // member
  const [tab, setTab] = useUrlState('tab', 'overview')
  const [requestId, setRequestId] = useUrlState('request', '')

  const { data: raw, isLoading, isError } = useQuery({
    queryKey: ['collab-workspace', id],
    queryFn:  () => collabApi.overview(id),
  })
  const ws = unwrapOne(raw)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['collab-workspace', id] })
    qc.invalidateQueries({ queryKey: ['collab-workspaces'] })
  }

  const { mutate: changeRole } = useMutation({
    mutationFn: ({ mid, role }) => collabApi.changeRole(id, mid, role),
    onSuccess: () => { toast.success('Role updated'); refresh() },
    onError: (e) => toast.error(errMsg(e, 'Could not change the role')),
  })
  const { mutate: removeMember, isPending: removingNow } = useMutation({
    mutationFn: (mid) => collabApi.removeMember(id, mid),
    onSuccess: () => { toast.success('Removed from the workspace'); setRemoving(null); refresh() },
    onError: (e) => toast.error(errMsg(e, 'Could not remove this person')),
  })
  const { mutate: setStatus } = useMutation({
    mutationFn: (status) => collabApi.update(id, { status }),
    onSuccess: (_r, status) => { toast.success(status === 'ARCHIVED' ? 'Workspace archived' : 'Workspace reopened'); refresh() },
    onError: (e) => toast.error(errMsg(e, 'Could not change the workspace')),
  })

  if (isLoading) {
    return <PageLayout title="Workspace"><div className="px-6 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div></PageLayout>
  }
  if (isError || !ws?.id) {
    return (
      <PageLayout title="Workspace" onBack={() => navigate('/collaboration/workspaces')}>
        <p className="px-6 text-sm text-text-muted">This workspace does not exist or you are not a member of it.</p>
      </PageLayout>
    )
  }

  const members = Array.isArray(ws.members) ? ws.members : []
  const programmes = Array.isArray(ws.programmes) ? ws.programmes : []
  const byUser = Object.fromEntries(members.map(m => [m.userId, m]))
  const archived = ws.status === 'ARCHIVED'

  return (
    <PageLayout
      title={ws.name}
      subtitle={ws.internal ? 'Internal audit workspace' : `With ${ws.firmName || 'audit firm'}`}
      onBack={() => navigate('/collaboration/workspaces')}
      actions={ws.canManage && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditWs(true)}>Edit</Button>
          {archived
            ? <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => setStatus('ACTIVE')}>Reopen</Button>
            : <Button variant="ghost" size="sm" icon={Archive} onClick={() => setStatus('ARCHIVED')}>Archive</Button>}
        </div>
      )}
    >
      <div className="px-6 pb-6 space-y-4 overflow-y-auto">
        {!ws.firmAccessActive && (
          <div className="text-xs rounded-card border border-status-warn-bd bg-status-warn-bg text-status-warn-fg px-3 py-2">
            The organisation's access grant for this audit firm has ended, so the firm's people can no longer open this workspace.
          </div>
        )}
        {ws.description && <p className="text-sm text-text-secondary max-w-3xl">{ws.description}</p>}

        <div className="flex gap-1 border-b border-border">
          {[['overview', 'Overview'], ['plan', 'Plan'], ['meetings', 'Meetings'], ['requests', 'Requests'], ['documents', 'Documents']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={cn('px-3 py-2 text-sm -mb-px border-b-2 transition-colors',
                tab === k ? 'border-brand-500 text-text-primary font-medium' : 'border-transparent text-text-secondary hover:text-text-primary')}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'plan' && <WorkspacePlanTab workspaceId={id} archived={archived} />}

        {tab === 'meetings' && (
          <WorkspaceMeetingsTab workspaceId={id} archived={archived}
            onOpen={(mid) => navigate(`/collaboration/meetings/${mid}`)} />
        )}

        {tab === 'requests' && (
          <WorkspaceRequestsTab workspaceId={id} archived={archived} programmes={programmes}
            openRequestId={requestId} onOpenRequest={(rid) => setRequestId(rid ? String(rid) : '')} />
        )}

        {tab === 'documents' && (
          <Card>
            <CardHeader title="Documents"
              subtitle="Shared with everyone in the workspace. Files for one request or meeting are kept on that request or meeting." />
            <CardBody>
              <EvidenceUploader entityType="COLLAB_WORKSPACE" entityId={Number(id)} documentType="EVIDENCE"
                canUpload={!archived} canRemove={!!ws.canManage && !archived} emptyLabel="No documents yet" />
            </CardBody>
          </Card>
        )}

        {tab === 'overview' && (
        <div className="grid gap-4 xl:grid-cols-5">
          {/* ── Programmes ── */}
          <Card className="xl:col-span-3">
            <CardHeader title="Programmes"
              subtitle={ws.mySide === 'FIRM'
                ? 'The programmes you are on'
                : 'Each programme has its own plan. The firm sees only programmes its people are on.'}
              actions={ws.canManage && !archived && (
                <Button size="xs" icon={Plus} onClick={() => setProgEdit({})}>Programme</Button>
              )} />
            <CardBody className="p-0">
              {programmes.length === 0 ? (
                <p className="px-4 py-6 text-xs text-text-muted text-center">
                  No programmes yet. Add one per piece of work, for example "FY27 ISO 27001" or "Q1 pen test".
                </p>
              ) : programmes.map(p => (
                <div key={p.id} className="px-4 py-3 border-b border-border-subtle last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary flex items-center gap-2">
                        <Layers size={13} className="text-text-muted shrink-0" /> {p.name}
                        <Badge label={p.status?.charAt(0) + p.status?.slice(1).toLowerCase()} colorTag={PROG_STATUS[p.status] || 'gray'} />
                      </p>
                      {(p.plannedStart || p.plannedEnd) && (
                        <p className="text-[11px] text-text-muted mt-1 flex items-center gap-1">
                          <Calendar size={11} /> {fmt(p.plannedStart)} – {fmt(p.plannedEnd)}
                        </p>
                      )}
                      {p.description && <p className="text-xs text-text-secondary mt-1">{p.description}</p>}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(p.memberUserIds || []).map(uid => (
                          <span key={uid} className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-overlay text-text-secondary">
                            {byUser[uid]?.name || `User ${uid}`}
                          </span>
                        ))}
                      </div>
                    </div>
                    {ws.canManage && !archived && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="xs" icon={Users} onClick={() => setProgMembersId(p.id)}>People</Button>
                        <Button variant="ghost" size="icon-xs" icon={Pencil} onClick={() => setProgEdit(p)} aria-label="Edit programme" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          {/* ── Members ── */}
          <Card className="xl:col-span-2">
            <CardHeader title="Members" subtitle={`${members.length} ${members.length === 1 ? 'person' : 'people'}`}
              actions={ws.canManage && !archived && (
                <Button size="xs" icon={Plus} onClick={() => setShowAdd(true)}>Add</Button>
              )} />
            <CardBody className="p-0">
              {['CLIENT', 'FIRM'].map(side => {
                const list = members.filter(m => m.side === side)
                if (list.length === 0) return null
                return (
                  <div key={side}>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-text-muted flex items-center gap-1.5">
                      <Building2 size={10} /> {side === 'FIRM' ? (ws.firmName || SIDE_LABEL.FIRM) : SIDE_LABEL.CLIENT}
                    </p>
                    {list.map(m => (
                      <div key={m.id} className="px-4 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-text-primary truncate">{m.name}</p>
                          <p className="text-[11px] text-text-muted truncate">{m.email}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {ws.canManage && !archived ? (
                            <select value={m.role} onChange={e => changeRole({ mid: m.id, role: e.target.value })}
                              className="text-[11px] h-7 rounded-ctl border border-border bg-surface-raised px-1.5 text-text-secondary">
                              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          ) : (
                            <Badge label={ROLE_LABEL[m.role] || m.role} colorTag={m.role === 'OWNER' ? 'indigo' : 'gray'} />
                          )}
                          {ws.canManage && !archived && (
                            <Button variant="ghost" size="icon-xs" icon={UserMinus} onClick={() => setRemoving(m)} aria-label="Remove" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </CardBody>
          </Card>
        </div>
        )}
      </div>

      <AddMemberModal open={showAdd} onClose={() => setShowAdd(false)} workspaceId={id} onDone={refresh} />
      <EditWorkspaceModal key={editWs ? 'edit-open' : 'edit-closed'} open={editWs} onClose={() => setEditWs(false)} ws={ws} onDone={refresh} />
      <ProgrammeModal programme={progEdit} onClose={() => setProgEdit(null)} workspaceId={id} onDone={refresh} />
      <ProgrammeMembersModal programme={programmes.find(p => p.id === progMembersId) || null}
        onClose={() => setProgMembersId(null)} workspaceId={id}
        members={members} onDone={refresh} />
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} onCancel={() => setRemoving(null)}
        onConfirm={() => removeMember(removing.id)} loading={removingNow}
        title={`Remove ${removing?.name || 'this person'}?`}
        message="They lose access to this workspace and are taken off its programmes."
        confirmLabel="Remove" />
    </PageLayout>
  )
}

function AddMemberModal({ open, onClose, workspaceId, onDone }) {
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState('MEMBER')
  const [q, setQ] = useState('')
  const { data: raw, isLoading } = useQuery({
    queryKey: ['collab-eligible', workspaceId],
    queryFn:  () => collabApi.eligibleMembers(workspaceId),
    enabled:  open,
    staleTime: 0,
  })
  const people = unwrapList(raw)
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? people.filter(p => `${p.name} ${p.email}`.toLowerCase().includes(s)) : people
  }, [people, q])

  const { mutate, isPending } = useMutation({
    mutationFn: () => collabApi.addMember(workspaceId, { userId, role }),
    onSuccess: () => { toast.success('Added to the workspace'); setUserId(''); setQ(''); onDone(); onClose() },
    onError: (e) => toast.error(errMsg(e, 'Could not add this person')),
  })

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Add a member"
      subtitle="People from your organisation, and from this workspace's audit firm.">
      <div className="space-y-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or email"
          className="w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary" />
        <div className="max-h-64 overflow-y-auto rounded-ctl border border-border">
          {isLoading ? <p className="p-3 text-xs text-text-muted">Loading…</p>
            : shown.length === 0 ? <p className="p-3 text-xs text-text-muted">Nobody else can be added.</p>
            : shown.map(p => (
              <button key={p.userId} type="button" onClick={() => setUserId(p.userId)}
                className={`w-full text-left px-3 py-2 border-b border-border-subtle last:border-0 hover:bg-surface-overlay ${String(userId) === String(p.userId) ? 'bg-brand-500/10' : ''}`}>
                <p className="text-sm text-text-primary">{p.name}</p>
                <p className="text-[11px] text-text-muted">{p.email} · {SIDE_LABEL[p.side] || p.side}</p>
              </button>
            ))}
        </div>
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Workspace role</span>
          <select value={role} onChange={e => setRole(e.target.value)}
            className="mt-1 w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary">
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="text-[11px] text-text-muted">Owners manage members and programmes. What else someone can do follows their permissions.</span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button size="sm" onClick={() => mutate()} disabled={!userId} loading={isPending}>Add</Button>
        </div>
      </div>
    </Modal>
  )
}

function EditWorkspaceModal({ open, onClose, ws, onDone }) {
  const [name, setName] = useState(ws.name || '')
  const [description, setDescription] = useState(ws.description || '')
  const { mutate, isPending } = useMutation({
    mutationFn: () => collabApi.update(ws.id, { name, description }),
    onSuccess: () => { toast.success('Workspace updated'); onDone(); onClose() },
    onError: (e) => toast.error(errMsg(e, 'Could not update the workspace')),
  })
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Edit workspace">
      <div className="space-y-3">
        <input value={name} onChange={e => setName(e.target.value)}
          className="w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary" />
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Description"
          className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button size="sm" onClick={() => mutate()} disabled={!name.trim()} loading={isPending}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}

function ProgrammeModal({ programme, onClose, workspaceId, onDone }) {
  const isNew = programme && !programme.id
  const open = !!programme
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form, setForm] = useState({})
  const [key, setKey] = useState(null)
  // Reset the form whenever a different programme (or a new one) is opened.
  const token = programme ? (programme.id ?? 'new') : null
  if (token !== key) {
    setKey(token)
    setForm({
      name: programme?.name || '', description: programme?.description || '',
      plannedStart: programme?.plannedStart || '', plannedEnd: programme?.plannedEnd || '',
      status: programme?.status || 'PLANNED',
    })
  }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const { mutate, isPending } = useMutation({
    mutationFn: () => isNew
      ? collabApi.createProgramme(workspaceId, form)
      : collabApi.updateProgramme(workspaceId, programme.id, form),
    onSuccess: () => { toast.success(isNew ? 'Programme added' : 'Programme updated'); onDone(); onClose() },
    onError: (e) => toast.error(errMsg(e, 'Could not save the programme')),
  })

  const { mutate: remove, isPending: removing } = useMutation({
    mutationFn: () => collabApi.deleteProgramme(workspaceId, programme.id),
    onSuccess: (r) => {
      const x = unwrapOne(r) || {}
      toast.success(`Programme deleted — ${x.movedPlanItems ?? 0} plan item(s), ${x.movedMeetings ?? 0} meeting(s) and ${x.movedRequests ?? 0} request(s) moved to Workspace-wide`, { duration: 7000 })
      setConfirmDelete(false)
      qc.invalidateQueries({ queryKey: ['collab-plan', workspaceId] })
      onDone(); onClose()
    },
    onError: (e) => toast.error(errMsg(e, 'Could not delete the programme')),
  })

  return (
    <>
    <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onCancel={() => setConfirmDelete(false)}
      onConfirm={() => remove()} loading={removing} title={`Delete ${programme?.name || 'this programme'}?`}
      message="Its plan items, meetings and requests are kept and move to Workspace-wide — so everyone in the workspace, including the audit firm's people, will see them. Its member list is removed."
      confirmLabel="Delete programme" />
    <Modal open={open} onClose={onClose} size="sm" title={isNew ? 'New programme' : 'Edit programme'}
      subtitle="A programme is one piece of work with its own timeline, e.g. one standard or one subsidiary.">
      <div className="space-y-3">
        <input value={form.name || ''} onChange={set('name')} placeholder="Name"
          className="w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary" />
        <textarea value={form.description || ''} onChange={set('description')} rows={2} placeholder="Description (optional)"
          className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary" />
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-text-secondary">Planned start</span>
            <input type="date" value={form.plannedStart || ''} onChange={set('plannedStart')}
              className="mt-1 w-full h-9 rounded-ctl border border-border bg-surface-raised px-2 text-sm text-text-primary" />
          </label>
          <label className="block">
            <span className="text-xs text-text-secondary">Planned end</span>
            <input type="date" value={form.plannedEnd || ''} onChange={set('plannedEnd')}
              className="mt-1 w-full h-9 rounded-ctl border border-border bg-surface-raised px-2 text-sm text-text-primary" />
          </label>
        </div>
        {!isNew && (
          <select value={form.status} onChange={set('status')}
            className="w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary">
            {['PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'].map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
          </select>
        )}
        <div className="flex justify-between gap-2">
          <div>{!isNew && <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} disabled={isPending}>Delete</Button>}</div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button size="sm" onClick={() => mutate()} disabled={!form.name?.trim()} loading={isPending}>{isNew ? 'Add' : 'Save'}</Button>
          </div>
        </div>
      </div>
    </Modal>
    </>
  )
}

function ProgrammeMembersModal({ programme, onClose, workspaceId, members, onDone }) {
  const on = new Set(programme?.memberUserIds || [])
  const { mutate: add, isPending: adding } = useMutation({
    mutationFn: (uid) => collabApi.addProgrammeMember(workspaceId, programme.id, uid),
    onSuccess: onDone,
    onError: (e) => toast.error(errMsg(e, 'Could not add to the programme')),
  })
  const { mutate: remove, isPending: removing } = useMutation({
    mutationFn: (uid) => collabApi.removeProgrammeMember(workspaceId, programme.id, uid),
    onSuccess: onDone,
    onError: (e) => toast.error(errMsg(e, 'Could not remove from the programme')),
  })
  return (
    <Modal open={!!programme} onClose={onClose} size="sm" title={`People on ${programme?.name || 'programme'}`}
      subtitle="The audit firm's people see this programme only when they are on it.">
      <div className="max-h-80 overflow-y-auto rounded-ctl border border-border">
        {members.map(m => {
          const isOn = on.has(m.userId)
          return (
            <div key={m.id} className="px-3 py-2 flex items-center justify-between border-b border-border-subtle last:border-0">
              <div className="min-w-0">
                <p className="text-sm text-text-primary truncate">{m.name}</p>
                <p className="text-[11px] text-text-muted">{SIDE_LABEL[m.side] || m.side}</p>
              </div>
              {isOn
                ? <Button variant="ghost" size="xs" icon={X} disabled={adding || removing} onClick={() => remove(m.userId)}>Remove</Button>
                : <Button variant="secondary" size="xs" icon={Plus} disabled={adding || removing} onClick={() => add(m.userId)}>Add</Button>}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

const fmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
