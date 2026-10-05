import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, List, CheckCircle2, RotateCcw, X, Send, Pencil } from 'lucide-react'
import { collabApi, unwrapList, unwrapOne, errMsg } from '../../api/collab.api'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Modal } from '../ui/Modal'
import EvidenceUploader from '../ui/EvidenceUploader'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

/**
 * Workspace › Requests — what one side asks the other for: a document, an
 * answer, a sign-off. Each request is an action item, so it also sits in the
 * assignee's inbox. Files answering it are attached to the request itself
 * (COLLAB_REQUEST). Raise one, or paste a whole information request list.
 *
 * Who may raise, answer, accept, send back or withdraw comes from the server
 * (canRaise / canAnswer / canDecide).
 */
export const REQUEST_STATUS = {
  OPEN:        { label: 'Open',      color: 'blue' },
  IN_PROGRESS: { label: 'Open',      color: 'blue' },
  SUBMITTED:   { label: 'Answered',  color: 'amber' },
  RESOLVED:    { label: 'Accepted',  color: 'green' },
  DISMISSED:   { label: 'Withdrawn', color: 'gray' },
}
const FILTERS = [
  ['open', 'Open'], ['answered', 'Answered'], ['closed', 'Closed'], ['all', 'All'],
]
const inFilter = (r, f) => f === 'all'
  || (f === 'open' && (r.status === 'OPEN' || r.status === 'IN_PROGRESS'))
  || (f === 'answered' && r.status === 'SUBMITTED')
  || (f === 'closed' && (r.status === 'RESOLVED' || r.status === 'DISMISSED'))

export const fmtDue = (s) => s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const input = 'w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary'

export function WorkspaceRequestsTab({ workspaceId, archived, programmes = [], openRequestId, onOpenRequest }) {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('open')
  const [mine, setMine] = useState('')
  const [raising, setRaising] = useState(false)
  const [bulk, setBulk] = useState(false)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['collab-requests', workspaceId],
    queryFn: () => collabApi.requests(workspaceId),
  })
  const data = unwrapOne(raw) || {}
  const all = Array.isArray(data.requests) ? data.requests : []
  const canRaise = !!data.canRaise && !archived
  const progName = Object.fromEntries(programmes.map(p => [p.id, p.name]))
  const refresh = () => qc.invalidateQueries({ queryKey: ['collab-requests', workspaceId] })

  const shown = all.filter(r => inFilter(r, filter))
    .filter(r => !mine || (mine === 'for' ? r.canAnswer : r.canDecide))
  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, all.filter(r => inFilter(r, k)).length]))
  const open = all.find(r => String(r.id) === String(openRequestId)) || null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={cn('px-2.5 h-7 rounded-ctl text-xs', filter === k ? 'bg-surface-overlay text-text-primary font-medium' : 'text-text-secondary hover:text-text-primary')}>
              {label} <span className="text-text-muted">{counts[k]}</span>
            </button>
          ))}
          <select value={mine} onChange={e => setMine(e.target.value)}
            className="ml-2 h-7 rounded-ctl border border-border bg-surface-raised px-1.5 text-xs text-text-secondary">
            <option value="">Everyone</option>
            <option value="for">For me</option>
            <option value="by">I can review</option>
          </select>
        </div>
        {canRaise && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={List} onClick={() => setBulk(true)}>Paste a list</Button>
            <Button size="sm" icon={Plus} onClick={() => setRaising(true)}>Request</Button>
          </div>
        )}
      </div>

      <div className="rounded-card border border-border bg-surface-raised">
        {isLoading ? <p className="p-4 text-xs text-text-muted">Loading…</p>
          : shown.length === 0 ? <p className="px-4 py-6 text-xs text-text-muted text-center">No requests here.</p>
          : shown.map(r => {
            const st = REQUEST_STATUS[r.status] || REQUEST_STATUS.OPEN
            return (
              <button key={r.id} type="button" onClick={() => onOpenRequest(r.id)}
                className="w-full text-left px-4 py-2.5 border-b border-border-subtle last:border-0 hover:bg-surface-overlay/50 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary truncate">{r.title}</p>
                  <p className="text-[11px] text-text-muted truncate">
                    {r.requestedByName} → {r.assigneeName}
                    {r.programmeId ? ` · ${progName[r.programmeId] || 'Programme'}` : ''}
                  </p>
                </div>
                <span className={cn('text-xs shrink-0', r.overdue ? 'text-status-fail-fg font-medium' : 'text-text-secondary')}>
                  {r.dueAt ? `${r.overdue ? 'Overdue · ' : 'Due '}${fmtDue(r.dueAt)}` : ''}
                </span>
                <Badge label={st.label} colorTag={st.color} />
              </button>
            )
          })}
      </div>

      <RaiseRequestModal open={raising} onClose={() => setRaising(false)} workspaceId={workspaceId}
        programmes={programmes} onDone={refresh} />
      <BulkRequestsModal open={bulk} onClose={() => setBulk(false)} workspaceId={workspaceId}
        programmes={programmes} onDone={refresh} />
      <RequestModal request={open} workspaceId={workspaceId} archived={archived} programmes={programmes}
        onClose={() => onOpenRequest(null)} onDone={refresh} />
    </div>
  )
}

function AssigneeSelect({ workspaceId, programmeId, value, onChange, enabled }) {
  const { data: raw, isLoading } = useQuery({
    queryKey: ['collab-eligible-attendees', String(workspaceId), programmeId || ''],
    queryFn: () => collabApi.eligibleAttendees(workspaceId, programmeId || null),
    enabled,
  })
  const people = unwrapList(raw)
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} className={input} disabled={isLoading}>
      <option value="">{isLoading ? 'Loading…' : 'Who is it for?'}</option>
      {people.map(p => (
        <option key={p.userId} value={p.userId}>{p.name}{p.side === 'FIRM' ? ' (audit firm)' : ''}</option>
      ))}
    </select>
  )
}

function RaiseRequestModal({ open, onClose, workspaceId, programmes, onDone }) {
  const blank = { title: '', description: '', assigneeUserId: '', dueDate: '', programmeId: '' }
  const [form, setForm] = useState(blank)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const { mutate, isPending } = useMutation({
    mutationFn: () => collabApi.raiseRequest(workspaceId, { ...form, programmeId: form.programmeId || null, dueDate: form.dueDate || null }),
    onSuccess: () => { toast.success('Request sent'); setForm(blank); onDone(); onClose() },
    onError: (e) => toast.error(errMsg(e, 'Could not raise the request')),
  })
  return (
    <Modal open={open} onClose={onClose} size="md" title="New request"
      subtitle="It goes to the person's inbox. They answer here, with a note and files."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button size="sm" icon={Send} onClick={() => mutate()} loading={isPending}
            disabled={!form.title.trim() || !form.assigneeUserId}>Send</Button>
        </div>
      }>
      <div className="space-y-3">
        <input value={form.title} onChange={set('title')} placeholder="What do you need? e.g. Access review for Q2" className={input} />
        <textarea value={form.description} onChange={set('description')} rows={3} placeholder="Details (optional)"
          className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary" />
        <div className="grid grid-cols-2 gap-2">
          {programmes.length > 0 && (
            <select value={form.programmeId} onChange={e => setForm(f => ({ ...f, programmeId: e.target.value, assigneeUserId: '' }))} className={input}>
              <option value="">Whole workspace</option>
              {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <AssigneeSelect workspaceId={workspaceId} programmeId={form.programmeId} enabled={open}
            value={form.assigneeUserId} onChange={v => setForm(f => ({ ...f, assigneeUserId: v }))} />
          <label className="block">
            <span className="text-xs text-text-secondary">Due</span>
            <input type="date" value={form.dueDate} onChange={set('dueDate')} className={cn(input, 'mt-1 px-2')} />
          </label>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Paste rows straight from a spreadsheet: Title, Assignee email, Due date
 * (YYYY-MM-DD), Description — tab-separated, one request per row. All rows go
 * in, or none (the server lists what is wrong).
 */
function BulkRequestsModal({ open, onClose, workspaceId, programmes, onDone }) {
  const [text, setText] = useState('')
  const [programmeId, setProgrammeId] = useState('')
  const rows = useMemo(() => text.split(/\r?\n/).map(l => l.trim() ? l.split('\t') : null).filter(Boolean)
    .filter((c, i) => !(i === 0 && /^title$/i.test((c[0] || '').trim())))
    .map(c => ({
      title: (c[0] || '').trim(),
      assigneeEmail: (c[1] || '').trim(),
      dueDate: (c[2] || '').trim() || null,
      description: (c[3] || '').trim() || null,
      programmeId: programmeId || null,
    })), [text, programmeId])
  const { mutate, isPending } = useMutation({
    mutationFn: () => collabApi.raiseRequests(workspaceId, rows),
    onSuccess: (r) => {
      toast.success(`${unwrapOne(r)?.created ?? rows.length} requests sent`)
      setText(''); onDone(); onClose()
    },
    onError: (e) => toast.error(errMsg(e, 'Could not raise the requests'), { duration: 8000 }),
  })
  return (
    <Modal open={open} onClose={onClose} size="xl" title="Paste an information request list"
      subtitle="Copy the rows from Excel: Title · Assignee email · Due date (YYYY-MM-DD) · Description. A header row is skipped."
      footer={
        <div className="flex justify-between items-center gap-2">
          <span className="text-xs text-text-muted">{rows.length} {rows.length === 1 ? 'request' : 'requests'}</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button size="sm" icon={Send} onClick={() => mutate()} loading={isPending}
              disabled={rows.length === 0 || rows.length > 500}>Send all</Button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        {programmes.length > 0 && (
          <select value={programmeId} onChange={e => setProgrammeId(e.target.value)} className={cn(input, 'w-64')}>
            <option value="">Whole workspace</option>
            {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
          placeholder={'Title\tAssignee email\tDue date\tDescription\nAccess review Q2\tjane@client.com\t2026-11-15\tExport from the IAM tool'}
          className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-xs font-mono text-text-primary" />
        {rows.length > 0 && (
          <div className="max-h-56 overflow-y-auto rounded-ctl border border-border text-xs">
            <table className="w-full">
              <thead className="bg-surface-overlay text-text-muted">
                <tr><th className="text-left px-2 py-1">Title</th><th className="text-left px-2 py-1">Assignee</th><th className="text-left px-2 py-1">Due</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className="border-t border-border-subtle">
                    <td className={cn('px-2 py-1', !r.title && 'text-status-fail-fg')}>{r.title || 'missing'}</td>
                    <td className={cn('px-2 py-1', !r.assigneeEmail && 'text-status-fail-fg')}>{r.assigneeEmail || 'missing'}</td>
                    <td className="px-2 py-1">{r.dueDate || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}

function RequestModal({ request: r, workspaceId, archived, programmes, onClose, onDone }) {
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState({})
  const after = (msg) => () => { toast.success(msg); setNote(''); setEditing(false); onDone() }

  const answer = useMutation({
    mutationFn: () => collabApi.answerRequest(workspaceId, r.id, note || null),
    onSuccess: after('Answer sent'),
    onError: (e) => toast.error(errMsg(e, 'Could not send the answer')),
  })
  const decide = useMutation({
    mutationFn: (decision) => collabApi.decideRequest(workspaceId, r.id, decision, note || null),
    onSuccess: (_x, d) => after(d === 'accept' ? 'Accepted' : d === 'reopen' ? 'Sent back' : 'Withdrawn')(),
    onError: (e) => toast.error(errMsg(e, 'Could not update the request')),
  })
  const save = useMutation({
    mutationFn: () => collabApi.updateRequest(workspaceId, r.id, edit),
    onSuccess: after('Request updated'),
    onError: (e) => toast.error(errMsg(e, 'Could not update the request')),
  })

  if (!r) return null
  const st = REQUEST_STATUS[r.status] || REQUEST_STATUS.OPEN
  const closed = r.status === 'RESOLVED' || r.status === 'DISMISSED'
  const busy = answer.isPending || decide.isPending || save.isPending
  const progName = programmes.find(p => p.id === r.programmeId)?.name

  return (
    <Modal open={!!r} onClose={onClose} size="lg" title={r.title}
      subtitle={`${r.requestedByName} → ${r.assigneeName}${progName ? ` · ${progName}` : ''}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge label={st.label} colorTag={st.color} />
          {r.dueAt && <span className={cn('text-xs', r.overdue ? 'text-status-fail-fg font-medium' : 'text-text-secondary')}>
            {r.overdue ? 'Overdue · ' : 'Due '}{fmtDue(r.dueAt)}</span>}
          {r.canDecide && !closed && !archived && !editing && (
            <Button variant="ghost" size="xs" icon={Pencil} className="ml-auto"
              onClick={() => { setEdit({ title: r.title, description: r.description || '', dueDate: r.dueAt ? String(r.dueAt).slice(0, 10) : '' }); setEditing(true) }}>
              Edit
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-2">
            <input value={edit.title} onChange={e => setEdit(x => ({ ...x, title: e.target.value }))} className={input} />
            <textarea value={edit.description} onChange={e => setEdit(x => ({ ...x, description: e.target.value }))} rows={3}
              className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary" />
            <div className="flex items-center gap-2">
              <input type="date" value={edit.dueDate} onChange={e => setEdit(x => ({ ...x, dueDate: e.target.value }))} className={cn(input, 'w-44 px-2')} />
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!edit.title?.trim()}>Save</Button>
              </div>
            </div>
          </div>
        ) : (
          r.description && <p className="text-sm text-text-secondary whitespace-pre-wrap">{r.description}</p>
        )}

        {r.answer && (
          <div className="rounded-ctl bg-surface-overlay px-3 py-2">
            <p className="text-[11px] text-text-muted mb-0.5">{r.status === 'DISMISSED' ? 'Note' : 'Answer'}</p>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{r.answer}</p>
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-text-secondary mb-1">Files</p>
          <EvidenceUploader entityType="COLLAB_REQUEST" entityId={r.id} documentType="EVIDENCE"
            canUpload={!closed && !archived && (r.canAnswer || r.canDecide)}
            canRemove={!closed && !archived && (r.canAnswer || r.canDecide)}
            compact emptyLabel="No files yet" />
        </div>

        {!closed && !archived && (r.canAnswer || r.canDecide) && (
          <div className="space-y-2 border-t border-border-subtle pt-3">
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder={r.canAnswer ? 'Your answer (attach files above)' : 'A note (optional)'}
              className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary" />
            <div className="flex flex-wrap justify-end gap-2">
              {r.canDecide && (
                <Button variant="ghost" size="sm" icon={X} disabled={busy} onClick={() => decide.mutate('withdraw')}>Withdraw</Button>
              )}
              {r.canDecide && r.status === 'SUBMITTED' && (
                <Button variant="secondary" size="sm" icon={RotateCcw} disabled={busy}
                  onClick={() => decide.mutate('reopen')}>Send back</Button>
              )}
              {r.canDecide && (
                <Button variant="success" size="sm" icon={CheckCircle2} disabled={busy}
                  onClick={() => decide.mutate('accept')}>Accept</Button>
              )}
              {r.canAnswer && (
                <Button size="sm" icon={Send} disabled={busy} loading={answer.isPending}
                  onClick={() => answer.mutate()}>{r.status === 'SUBMITTED' ? 'Update answer' : 'Answer'}</Button>
              )}
            </div>
          </div>
        )}
        {closed && r.canDecide && !archived && (
          <div className="flex justify-end border-t border-border-subtle pt-3">
            <Button variant="secondary" size="sm" icon={RotateCcw} disabled={busy} onClick={() => decide.mutate('reopen')}>Reopen</Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
