import { useMemo, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Pencil, History, Link2, ChevronRight } from 'lucide-react'
import { collabApi, unwrapList, errMsg } from '../../api/collab.api'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

/**
 * PlanBoard — the workspace plan as a Gantt chart or a list. (Editing happens
 * in PlanSheet; the timeline only opens something when given onEdit.)
 *
 * Shared by the workspace Plan tab, the engagement Timeline tab and nothing
 * else, so both always draw the plan the same way. It renders what the server
 * returned; who may change what is in each item (canEdit / canUpdateStatus).
 *
 * Health colours:
 *   done                    → green
 *   late (end passed, open) → red
 *   blocked                 → amber
 *   otherwise               → brand
 */
export const STATUS_LABEL = { NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', BLOCKED: 'Blocked', DONE: 'Done' }
export const KIND_LABEL = { PHASE: 'Phase', TASK: 'Task', MILESTONE: 'Milestone' }
const DAY = 86400000

const parse = (d) => (d ? Date.parse(d + 'T00:00:00') : null)
export const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'

export function health(item, today) {
  if (item.status === 'DONE') return 'done'
  if (item.plannedEnd && item.plannedEnd < today) return 'late'
  if (item.status === 'BLOCKED') return 'blocked'
  return 'open'
}
const HEALTH_BAR = {
  done:    'bg-status-pass-fg',
  late:    'bg-status-fail-fg',
  blocked: 'bg-status-warn-fg',
  open:    'bg-brand-500',
}
// Milestone marker — a small rotated square in the health colour.
const MsMark = ({ h }) => <span className={cn('inline-block w-2 h-2 rotate-45 shrink-0', HEALTH_BAR[h])} />

const HEALTH_TEXT = {
  done: 'text-status-pass-fg', late: 'text-status-fail-fg', blocked: 'text-status-warn-fg', open: 'text-text-secondary',
}

/** Items as a tree, flattened in display order, grouped by programme. */
export function useRows(items, programmes) {
  return useMemo(() => {
    const ids = new Set(items.map(i => i.id))
    const kids = new Map()
    for (const i of items) {
      const p = i.parentId && ids.has(i.parentId) ? i.parentId : null
      if (!kids.has(p)) kids.set(p, [])
      kids.get(p).push(i)
    }
    const groups = []
    const progOrder = [{ id: null, name: 'Workspace-wide' }, ...programmes]
    for (const prog of progOrder) {
      const roots = (kids.get(null) || []).filter(i => (i.programmeId ?? null) === prog.id)
      if (roots.length === 0) continue
      const rows = []
      const walk = (i, depth) => {
        rows.push({ item: i, depth })
        for (const k of kids.get(i.id) || []) walk(k, depth + 1)
      }
      roots.forEach(r => walk(r, 0))
      groups.push({ programme: prog, rows })
    }
    return groups
  }, [items, programmes])
}

export function PlanBoard({ items, programmes = [], today, view = 'gantt', onEdit, onHistory, onStatus }) {
  const groups = useRows(items, programmes)
  if (items.length === 0) return null
  return view === 'list'
    ? <PlanList groups={groups} today={today} onEdit={onEdit} onHistory={onHistory} onStatus={onStatus} />
    : <PlanGantt groups={groups} items={items} today={today} onEdit={onEdit} onHistory={onHistory} />
}

function PlanGantt({ groups, items, today, onEdit, onHistory }) {
  const { lo, hi, months } = useMemo(() => {
    const ds = [parse(today)]
    for (const i of items) { if (i.plannedStart) ds.push(parse(i.plannedStart)); if (i.plannedEnd) ds.push(parse(i.plannedEnd)) }
    const min = Math.min(...ds) - 7 * DAY, max = Math.max(...ds) + 7 * DAY
    const ms = []
    const d = new Date(min); d.setDate(1); d.setHours(0, 0, 0, 0)
    while (d.getTime() <= max) {
      if (d.getTime() >= min) ms.push(d.getTime())
      d.setMonth(d.getMonth() + 1)
    }
    return { lo: min, hi: max, months: ms }
  }, [items, today])
  const pct = (t) => `${((t - lo) / (hi - lo)) * 100}%`
  const todayT = parse(today)

  return (
    <div className="rounded-card border border-border overflow-hidden">
      {/* axis */}
      <div className="flex border-b border-border bg-surface-secondary/50 text-[10px] text-text-muted">
        <div className="w-72 shrink-0 px-3 py-1.5 border-r border-border">Item</div>
        <div className="relative flex-1 h-7">
          {months.map(t => (
            <span key={t} className="absolute top-1.5 -translate-x-1/2 whitespace-nowrap" style={{ left: pct(t) }}>
              {new Date(t).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
            </span>
          ))}
        </div>
      </div>
      {groups.map(g => (
        <div key={g.programme.id ?? 'ws'}>
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted bg-surface-secondary/30 border-b border-border/50">
            {g.programme.name}
          </div>
          {g.rows.map(({ item, depth }) => {
            const h = health(item, today)
            const s = parse(item.plannedStart), e = parse(item.plannedEnd)
            const isMs = item.kind === 'MILESTONE'
            return (
              <div key={item.id} className="flex border-b border-border/40 hover:bg-surface-overlay/40 group">
                <button type="button" onClick={() => onEdit?.(item)} disabled={!onEdit}
                  className={cn('w-72 shrink-0 px-3 py-1.5 border-r border-border text-left min-w-0', !onEdit && 'cursor-default')}>
                  <span className="flex items-center gap-1 min-w-0" style={{ paddingLeft: depth * 14 }}>
                    {isMs ? <MsMark h={h} />
                      : depth > 0 ? <ChevronRight size={10} className="shrink-0 text-text-muted" /> : null}
                    <span className={cn('text-xs truncate', item.kind === 'PHASE' ? 'font-semibold text-text-primary' : 'text-text-primary')}>{item.title}</span>
                    {item.linked && <Link2 size={10} className="shrink-0 text-brand-ink" />}
                  </span>
                  <span className="block text-[10px] text-text-muted truncate" style={{ paddingLeft: depth * 14 }}>
                    {item.ownerName || 'No owner'} · <span className={HEALTH_TEXT[h]}>{h === 'late' ? 'Late' : STATUS_LABEL[item.status]}</span>
                  </span>
                </button>
                <div className="relative flex-1 min-h-[38px]">
                  {months.map(t => <span key={t} className="absolute top-0 bottom-0 border-l border-border/30" style={{ left: pct(t) }} />)}
                  <span className="absolute top-0 bottom-0 border-l border-dashed border-status-fail-fg/60" style={{ left: pct(todayT) }} />
                  {isMs && e != null ? (
                    <span title={`${item.title} · ${fmtDate(item.plannedEnd)}`}
                      className={cn('absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rotate-45', HEALTH_BAR[h])}
                      style={{ left: pct(e) }} />
                  ) : s != null && e != null ? (
                    <span title={`${item.title} · ${fmtDate(item.plannedStart)} – ${fmtDate(item.plannedEnd)} · ${item.progress}%`}
                      className={cn('absolute top-1/2 -translate-y-1/2 rounded-full bg-surface-overlay overflow-hidden',
                        item.kind === 'PHASE' ? 'h-3.5' : 'h-2.5')}
                      style={{ left: pct(s), width: `max(4px, calc(${pct(e + DAY)} - ${pct(s)}))` }}>
                      <span className={cn('block h-full', HEALTH_BAR[h])} style={{ width: `${Math.max(item.progress || 0, h === 'done' ? 100 : 6)}%` }} />
                    </span>
                  ) : (
                    <span className="absolute top-1/2 -translate-y-1/2 left-2 text-[10px] text-text-muted">No dates</span>
                  )}
                  {onHistory && (
                    <button type="button" onClick={() => onHistory(item)} aria-label="History"
                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay">
                      <History size={12} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function PlanList({ groups, today, onEdit, onHistory, onStatus }) {
  return (
    <div className="rounded-card border border-border overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-surface-secondary/50 text-[10px] uppercase tracking-wide text-text-muted">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Item</th>
            <th className="text-left px-2 py-2 font-medium">Owner</th>
            <th className="text-left px-2 py-2 font-medium">Start</th>
            <th className="text-left px-2 py-2 font-medium">End</th>
            <th className="text-left px-2 py-2 font-medium">Status</th>
            <th className="text-right px-2 py-2 font-medium">Progress</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        {groups.map(g => (
          <tbody key={g.programme.id ?? 'ws'}>
            <tr><td colSpan={7} className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted bg-surface-secondary/30">{g.programme.name}</td></tr>
            {g.rows.map(({ item, depth }) => {
              const h = health(item, today)
              const manual = item.progressMode !== 'LINKED'
              return (
                <tr key={item.id} className="border-t border-border/40 hover:bg-surface-overlay/40">
                  <td className="px-3 py-1.5">
                    <span className="flex items-center gap-1" style={{ paddingLeft: depth * 14 }}>
                      {item.kind === 'MILESTONE' && <MsMark h={h} />}
                      <span className={item.kind === 'PHASE' ? 'font-semibold' : ''}>{item.title}</span>
                      {item.linked && (
                        <span className="text-[10px] text-brand-ink flex items-center gap-0.5 ml-1">
                          <Link2 size={10} /> {item.linked.ref || item.linked.name}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-text-secondary">{item.ownerName || '—'}</td>
                  <td className="px-2 py-1.5 text-text-secondary whitespace-nowrap">{fmtDate(item.plannedStart)}</td>
                  <td className={cn('px-2 py-1.5 whitespace-nowrap', h === 'late' ? 'text-status-fail-fg font-medium' : 'text-text-secondary')}>{fmtDate(item.plannedEnd)}</td>
                  <td className="px-2 py-1.5">
                    {item.canUpdateStatus && manual && onStatus ? (
                      <select value={item.status} onChange={e => onStatus(item, e.target.value)}
                        className="text-[11px] h-6 rounded border border-border bg-surface-raised px-1 text-text-secondary">
                        {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    ) : (
                      <span className={HEALTH_TEXT[h]}>{h === 'late' ? `Late · ${STATUS_LABEL[item.status]}` : STATUS_LABEL[item.status]}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right text-text-secondary">{item.progress ?? 0}%</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right">
                    {(item.canEdit || item.canUpdateStatus) && onEdit && (
                      <button type="button" onClick={() => onEdit(item)} className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay" aria-label="Edit"><Pencil size={12} /></button>
                    )}
                    {onHistory && (
                      <button type="button" onClick={() => onHistory(item)} className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay" aria-label="History"><History size={12} /></button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </div>
  )
}

// ── Item editor ──────────────────────────────────────────────────────────────

/**
 * Create or edit an item. Full editors see every field; an owner without
 * plan-edit permission sees status, progress and description only (the server
 * enforces the same split).
 */
export function PlanItemModal({ open, onClose, workspaceId, item, items = [], programmes = [], members = [],
                                defaultProgrammeId = null, canEditPlan, onSaved }) {
  const isNew = !item?.id
  const full = isNew ? canEditPlan : !!item?.canEdit
  const [form, setForm] = useState(null)
  const [key, setKey] = useState(null)
  const token = open ? (item?.id ?? 'new') : null
  if (token !== key) {
    setKey(token)
    setForm(open ? {
      title: item?.title || '', kind: item?.kind || 'TASK', description: item?.description || '',
      programmeId: item ? (item.programmeId ?? '') : (defaultProgrammeId ?? ''),
      parentId: item?.parentId ?? '', ownerUserId: item?.ownerUserId ?? '',
      plannedStart: item?.plannedStart || '', plannedEnd: item?.plannedEnd || '',
      status: item?.status || 'NOT_STARTED', progress: item?.progress ?? 0,
      linkedEngagementId: item?.linked?.id ?? '', dependsOn: item?.dependsOn || [], reason: '',
    } : null)
  }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const { data: engRaw } = useQuery({
    queryKey: ['collab-linkable', workspaceId],
    queryFn: () => collabApi.linkableEngagements(workspaceId),
    enabled: open && full,
    staleTime: 60_000,
  })
  const engagements = unwrapList(engRaw)

  const linked = item?.progressMode === 'LINKED' || (form?.linkedEngagementId ?? '') !== ''
  const datesChanged = !isNew && form && (form.plannedStart !== (item.plannedStart || '') || form.plannedEnd !== (item.plannedEnd || ''))
  const progId = form?.programmeId === '' ? null : Number(form?.programmeId)
  // A firm member can own an item only on a programme they are on.
  const owners = members.filter(m => m.side !== 'FIRM' || progId == null || (m.programmeIds || []).includes(progId))
  const phases = items.filter(i => i.kind === 'PHASE' && i.id !== item?.id)
  const others = items.filter(i => i.id !== item?.id)

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const body = full ? {
        title: form.title, kind: form.kind, description: form.description,
        programmeId: form.programmeId === '' ? null : form.programmeId,
        parentId: form.parentId === '' ? null : form.parentId,
        ownerUserId: form.ownerUserId === '' ? null : form.ownerUserId,
        plannedStart: form.plannedStart || null, plannedEnd: form.plannedEnd || null,
        linkedEngagementId: form.linkedEngagementId === '' ? null : form.linkedEngagementId,
        dependsOn: form.dependsOn,
        ...(linked ? {} : { status: form.status, progress: form.progress }),
        ...(form.reason ? { reason: form.reason } : {}),
      } : {
        description: form.description,
        ...(linked ? {} : { status: form.status, progress: form.progress }),
      }
      return isNew ? collabApi.createItem(workspaceId, body) : collabApi.updateItem(workspaceId, item.id, body)
    },
    onSuccess: () => { toast.success(isNew ? 'Item added' : 'Item updated'); onSaved?.(); onClose() },
    onError: (e) => toast.error(errMsg(e, 'Could not save the item')),
  })

  const { mutate: remove, isPending: removing } = useMutation({
    mutationFn: () => collabApi.deleteItem(workspaceId, item.id, form?.reason),
    onSuccess: () => { toast.success('Item removed'); onSaved?.(); onClose() },
    onError: (e) => toast.error(errMsg(e, 'Could not remove the item')),
  })

  if (!form) return null
  const input = 'w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary disabled:opacity-60'
  const label = 'text-xs font-medium text-text-secondary'

  return (
    <Modal open={open} onClose={onClose} size="md" title={isNew ? 'New plan item' : (full ? 'Edit plan item' : item.title)}
      subtitle={!full && !isNew ? 'As its owner you can update the status, progress and notes. Dates and other fields are set by whoever edits the plan.' : undefined}>
      <div className="space-y-3">
        {full && (
          <>
            <input value={form.title} onChange={set('title')} placeholder="Title" className={input} />
            <div className="grid grid-cols-3 gap-2">
              <label className="block"><span className={label}>Kind</span>
                <select value={form.kind} onChange={set('kind')} className={input}>
                  {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="block col-span-2"><span className={label}>Programme</span>
                <select value={form.programmeId} onChange={set('programmeId')} className={input}>
                  <option value="">Workspace-wide (everyone sees it)</option>
                  {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className={label}>Under phase</span>
                <select value={form.parentId} onChange={set('parentId')} className={input}>
                  <option value="">None</option>
                  {phases.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </label>
              <label className="block"><span className={label}>Owner</span>
                <select value={form.ownerUserId} onChange={set('ownerUserId')} className={input}>
                  <option value="">No owner</option>
                  {owners.map(m => <option key={m.userId} value={m.userId}>{m.name}{m.side === 'FIRM' ? ' (audit firm)' : ''}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className={label}>{form.kind === 'MILESTONE' ? 'Date' : 'Planned start'}</span>
                <input type="date" value={form.plannedStart} onChange={set('plannedStart')} className={input} />
              </label>
              {form.kind !== 'MILESTONE' && (
                <label className="block"><span className={label}>Planned end</span>
                  <input type="date" value={form.plannedEnd} onChange={set('plannedEnd')} className={input} />
                </label>
              )}
            </div>
            {datesChanged && (
              <input value={form.reason} onChange={set('reason')} placeholder="Why are the dates moving? (recorded in the history)" className={input} />
            )}
            <label className="block"><span className={label}>Linked engagement (progress comes from it)</span>
              <select value={form.linkedEngagementId} onChange={set('linkedEngagementId')} className={input}>
                <option value="">Not linked — progress set by hand</option>
                {engagements.map(e => <option key={e.id} value={e.id}>{e.ref ? `${e.ref} · ` : ''}{e.name}</option>)}
              </select>
            </label>
            {others.length > 0 && (
              <details className="rounded-ctl border border-border px-3 py-2">
                <summary className="text-xs text-text-secondary cursor-pointer">Depends on ({form.dependsOn.length})</summary>
                <div className="max-h-36 overflow-y-auto mt-2 space-y-1">
                  {others.map(o => (
                    <label key={o.id} className="flex items-center gap-2 text-xs text-text-primary">
                      <input type="checkbox" checked={form.dependsOn.includes(o.id)}
                        onChange={e => setForm(f => ({ ...f, dependsOn: e.target.checked ? [...f.dependsOn, o.id] : f.dependsOn.filter(x => x !== o.id) }))} />
                      {o.title}
                    </label>
                  ))}
                </div>
              </details>
            )}
          </>
        )}

        {linked ? (
          <p className="text-xs text-text-muted">
            Status and progress come from the linked engagement{item?.linked ? ` (${item.linked.evidenceSubmitted}/${item.linked.controls} evidence submitted, ${item.linked.tested}/${item.linked.controls} tested)` : ''}.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className={label}>Status</span>
              <select value={form.status} onChange={set('status')} className={input}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block"><span className={label}>Progress (%)</span>
              <input type="number" min={0} max={100} value={form.progress} onChange={set('progress')} className={input} />
            </label>
          </div>
        )}
        <textarea value={form.description} onChange={set('description')} rows={3} placeholder="Notes"
          className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary" />

        <div className="flex items-center justify-between gap-2 pt-1">
          <div>
            {!isNew && full && (
              <Button variant="ghost" size="sm" onClick={() => remove()} loading={removing}>Remove</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button size="sm" onClick={() => mutate()} disabled={full && !form.title.trim()} loading={isPending}>{isNew ? 'Add' : 'Save'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

const FIELD_LABEL = {
  created: 'Created', deleted: 'Removed', title: 'Title', plannedStart: 'Planned start', plannedEnd: 'Planned end',
  owner: 'Owner', status: 'Status', programme: 'Programme', link: 'Linked engagement',
}

export function PlanHistoryModal({ open, onClose, workspaceId, item, members = [] }) {
  const { data: raw, isLoading } = useQuery({
    queryKey: ['collab-item-history', workspaceId, item?.id],
    queryFn: () => collabApi.itemHistory(workspaceId, item.id),
    enabled: open && !!item?.id,
    staleTime: 0,
  })
  const rows = unwrapList(raw)
  const nameOf = (v) => members.find(m => String(m.userId) === String(v))?.name || v
  const show = (field, v) => v == null || v === '' ? '—' : field === 'owner' ? nameOf(v) : field === 'status' ? (STATUS_LABEL[v] || v) : v
  return (
    <Modal open={open} onClose={onClose} size="md" title={`History · ${item?.title || ''}`}>
      {isLoading ? <p className="text-xs text-text-muted">Loading…</p>
        : rows.length === 0 ? <p className="text-xs text-text-muted">No changes recorded yet.</p>
        : (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {rows.map((r, i) => (
              <li key={i} className="text-xs border-b border-border-subtle pb-2 last:border-0">
                <p className="text-text-primary">
                  <span className="font-medium">{FIELD_LABEL[r.field] || r.field}</span>
                  {r.field !== 'created' && r.field !== 'deleted' && <>: {show(r.field, r.oldValue)} → {show(r.field, r.newValue)}</>}
                </p>
                <p className="text-text-muted">
                  {r.changedByName} · {r.changedAt ? new Date(r.changedAt).toLocaleString() : ''}
                  {r.reason && <> · “{r.reason}”</>}
                </p>
              </li>
            ))}
          </ul>
        )}
    </Modal>
  )
}