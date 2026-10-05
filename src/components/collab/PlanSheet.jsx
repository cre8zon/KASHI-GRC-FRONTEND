import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  History, Trash2, SlidersHorizontal, Link2, MoreVertical, Plus, Settings, ChevronDown,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, EyeOff, Pencil, Bold, Italic, Underline, Palette, Highlighter, RotateCcw,
} from 'lucide-react'
import { collabApi, errMsg } from '../../api/collab.api'
import { Modal, ConfirmDialog } from '../ui/Modal'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { STATUS_LABEL, KIND_LABEL, health, useRows } from './PlanBoard'
import toast from 'react-hot-toast'

/**
 * PlanSheet — the plan as a spreadsheet you configure like one.
 *
 * CELLS   Click and type; saves when you leave the cell (Enter moves down,
 *         Esc undoes). Dropdowns and checkboxes save at once.
 * ROWS    The blank last row of a section adds a task (or paste rows from
 *         Excel). The ⋮ in a row's # cell: insert a row below, move up/down,
 *         indent (put under the row above) / outdent, details, history,
 *         remove.
 * COLUMNS Per workspace (CollabPlanColumnsService). Drag a header's right
 *         edge to resize; the ▾ on a header renames, moves, hides or deletes
 *         it; + adds a column (text, number, date, dropdown, person,
 *         checkbox); ⚙ shows hidden columns again and reorders them all. The
 *         built-in columns can be renamed, moved and hidden but not deleted —
 *         the timeline, My week and reminders read them.
 *
 * Who: plan editors change everything, including the layout. An item's owner
 * fills status, %, notes and the custom columns of their rows. Items linked
 * to an engagement take status and % from it.
 */
const DEFAULT_WIDTH = { title: 280, kind: 110, parent: 150, owner: 160, start: 130, end: 130, status: 130, progress: 64, notes: 220 }
const TYPE_LABEL = { TEXT: 'Text', NUMBER: 'Number', DATE: 'Date', SELECT: 'Dropdown', PERSON: 'Person', CHECKBOX: 'Checkbox' }
const HEALTH_TEXT = { done: 'text-status-pass-fg', late: 'text-status-fail-fg', blocked: 'text-status-warn-fg', open: 'text-text-primary' }
// ── formatting ──
const TEXT_COLOURS = ['#111827', '#6b7280', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777']
const FILL_COLOURS = ['#fee2e2', '#ffedd5', '#fef9c3', '#dcfce7', '#cffafe', '#dbeafe', '#ede9fe', '#fce7f3', '#f3f4f6', '#e5e7eb']
const SIZE_PX = { s: '11px', l: '14px' }
/** The row's style with the cell's own style on top. */
const styleOf = (item, key) => ({ ...(item?.format?.row || {}), ...((key && item?.format?.cells?.[key]) || {}) })
const cssOf = (st) => ({
  ...(st.color ? { color: st.color } : st.bg ? { color: '#111827' } : {}),   // a light fill keeps dark text in dark mode
  ...(st.bg ? { backgroundColor: st.bg } : {}),
  ...(st.b ? { fontWeight: 700 } : {}),
  ...(st.i ? { fontStyle: 'italic' } : {}),
  ...(st.u ? { textDecoration: 'underline' } : {}),
  ...(st.size ? { fontSize: SIZE_PX[st.size] } : {}),
})

const widthOf = (c) => c.width || DEFAULT_WIDTH[c.key] || 150
const layoutBody = (cols) => cols.map(c => ({
  ...(String(c.key).startsWith('tmp_') ? {} : { key: c.key }), label: c.label, ...(c.builtIn ? {} : { type: c.type, options: c.options || [] }),
  ...(c.width ? { width: c.width } : {}), ...(c.hidden ? { hidden: true } : {}),
}))

/** Patch the cached plan in place, so edits show before the server answers. */
function patchCache(qc, workspaceId, fn) {
  qc.setQueryData(['collab-plan', workspaceId], (old) => {
    const plan = old?.data?.data ?? old?.data ?? old
    if (!plan || !Array.isArray(plan.items)) return old
    const next = fn(plan)
    return old?.data?.data ? { ...old, data: { ...old.data, data: next } } : old?.data?.items ? { ...old, data: next } : next
  })
}

export function PlanSheet({ workspaceId, items, allItems, programmes, members, columns = [], today, canEditPlan,
                            programmeFilter, ownerFilter, onDetails, onHistory, onChanged }) {
  const treeGroups = useRows(items, programmes)
  const [deleting, setDeleting] = useState(null)
  const [colEdit, setColEdit] = useState(null)        // null | {} new | column
  const [colDelete, setColDelete] = useState(null)
  const [managing, setManaging] = useState(false)
  const [menu, setMenu] = useState(null)              // { kind: 'col'|'row', key }
  const [sel, setSel] = useState(null)                // { id, col } — col null = the whole row (formatting)
  const [widths, setWidths] = useState({})            // live widths while dragging
  const [focusId, setFocusId] = useState(null)
  const root = useRef(null)
  const qc = useQueryClient()

  const visible = columns.filter(c => !c.hidden)
  const w = (c) => widths[c.key] ?? widthOf(c)
  const tableWidth = 44 + visible.reduce((s, c) => s + w(c), 0) + (canEditPlan ? 72 : 0)

  // Every programme gets a section — even an empty one, so its plan can be started here.
  const groups = useMemo(() => {
    const byId = new Map(treeGroups.map(g => [g.programme.id ?? null, g.rows]))
    return [{ id: null, name: 'Workspace-wide' }, ...programmes]
      .filter(p => programmeFilter === '' || String(p.id ?? 'ws') === programmeFilter)
      .map(p => ({ programme: p, rows: byId.get(p.id ?? null) || [] }))
      .filter(g => g.rows.length > 0 || (canEditPlan && !ownerFilter))
  }, [treeGroups, programmes, programmeFilter, ownerFilter, canEditPlan])

  // Focus the title of a row just inserted, ready to type over.
  useEffect(() => {
    if (!focusId || !root.current) return
    const el = root.current.querySelector(`[data-item="${focusId}"][data-col="title"]`)
    if (el) { el.focus(); el.select?.(); setFocusId(null) }
  })

  // ── mutations ──────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: ({ id, body }) => collabApi.updateItem(workspaceId, id, body),
    onMutate: ({ id, body }) => patchCache(qc, workspaceId, (plan) => ({
      ...plan, items: plan.items.map(i => i.id !== id ? i
        : { ...i, ...body, custom: body.custom ? { ...(i.custom || {}), ...body.custom } : i.custom }),
    })),
    onError: (e) => toast.error(errMsg(e, 'Could not save that change')),
    onSettled: onChanged,
  })
  const remove = useMutation({
    mutationFn: (item) => collabApi.deleteItem(workspaceId, item.id),
    onSuccess: () => { toast.success('Row removed'); setDeleting(null) },
    onError: (e) => toast.error(errMsg(e, 'Could not remove the row')),
    onSettled: onChanged,
  })
  const layout = useMutation({
    mutationFn: (cols) => collabApi.savePlanColumns(workspaceId, layoutBody(cols)),
    onMutate: (cols) => patchCache(qc, workspaceId, (plan) => ({ ...plan, columns: cols })),
    onSuccess: () => setWidths({}),
    onError: (e) => toast.error(errMsg(e, 'Could not save the columns')),
    onSettled: onChanged,
  })
  const saveLayout = (cols) => layout.mutate(cols)

  const [drafting, setDrafting] = useState(false)
  /**
   * The blank row at the end of a section is a draft (id "new-…"): the first
   * value typed into ANY of its cells creates the row. Without a name yet it is
   * called "New task", with the name selected so you can type over it.
   */
  const createFromDraft = async (draft, body) => {
    if (drafting) return
    const { status, progress, ...rest } = body
    const named = !!rest.title?.trim()
    setDrafting(true)
    try {
      const created = await collabApi.createItem(workspaceId, {
        kind: 'TASK', ...rest, title: named ? rest.title.trim() : 'New task',
        programmeId: draft.programmeId, sortOrder: nextOrder(),
      })
      if (created?.id && (status || progress != null)) {
        await collabApi.updateItem(workspaceId, created.id, {
          ...(status ? { status } : {}), ...(progress != null ? { progress } : {}),
        })
      }
      if (created?.id && !named) setFocusId(created.id)
    } catch (e) {
      toast.error(errMsg(e, 'Could not add the row'))
    } finally {
      setDrafting(false)
      onChanged()
    }
  }
  const patch = (item, body) => typeof item.id === 'string'
    ? createFromDraft(item, body)
    : save.mutate({ id: item.id, body })
  const nextOrder = () => Math.max(0, ...allItems.map(i => i.sortOrder || 0)) + 10
  const ownersFor = (programmeId) => members.filter(m => m.side !== 'FIRM' || programmeId == null
    || (m.programmeIds || []).includes(programmeId))

  /** Enter: same column, next row. */
  const moveDown = (el) => {
    const cells = [...root.current.querySelectorAll(`[data-col="${el.dataset.col}"]`)]
    const next = cells[cells.indexOf(el) + 1]
    if (next) next.focus()
  }

  // ── row operations (siblings in the order shown) ──────────────────────────
  const siblingsOf = (rows, parentId) => rows.filter(r => (r.item.parentId ?? null) === (parentId ?? null)).map(r => r.item)
  const rowOp = async (op, item, rows, progId) => {
    setMenu(null)
    try {
      const sibs = siblingsOf(rows, item.parentId)
      const at = sibs.findIndex(s => s.id === item.id)
      if (op === 'up' || op === 'down') {
        const to = op === 'up' ? at - 1 : at + 1
        if (to < 0 || to >= sibs.length) return
        const ids = sibs.map(s => s.id);[ids[at], ids[to]] = [ids[to], ids[at]]
        await collabApi.reorderPlan(workspaceId, ids)
      } else if (op === 'insert') {
        const created = await collabApi.createItem(workspaceId, {
          title: 'New task', kind: 'TASK', programmeId: progId, parentId: item.parentId ?? null, sortOrder: nextOrder(),
        })
        if (created?.id) {
          const ids = sibs.map(s => s.id); ids.splice(at + 1, 0, created.id)
          await collabApi.reorderPlan(workspaceId, ids)
          setFocusId(created.id)
        }
      } else if (op === 'indent') {
        const prev = sibs[at - 1]
        if (!prev) return
        await collabApi.updateItem(workspaceId, item.id, { parentId: prev.id })
        const kids = siblingsOf(rows, prev.id).map(s => s.id)
        await collabApi.reorderPlan(workspaceId, [...kids, item.id])
      } else if (op === 'outdent') {
        const parent = allItems.find(i => i.id === item.parentId)
        if (!parent) return
        await collabApi.updateItem(workspaceId, item.id, { parentId: parent.parentId ?? null })
        const up = siblingsOf(rows, parent.parentId).map(s => s.id).filter(id => id !== item.id)
        up.splice(up.indexOf(parent.id) + 1, 0, item.id)
        await collabApi.reorderPlan(workspaceId, up)
      }
    } catch (e) {
      toast.error(errMsg(e, 'Could not change the rows'))
    } finally {
      onChanged()
    }
  }

  // ── column operations ─────────────────────────────────────────────────────
  const colOp = (op, col) => {
    setMenu(null)
    const cols = [...columns]
    const i = cols.findIndex(c => c.key === col.key)
    if (op === 'hide') cols[i] = { ...col, hidden: true }
    if (op === 'left' || op === 'right') {
      // Move past the next VISIBLE column, so hidden ones never make a click do nothing.
      let j = i
      do { j += op === 'left' ? -1 : 1 } while (j >= 0 && j < cols.length && cols[j].hidden)
      if (j < 0 || j >= cols.length) return
      const [x] = cols.splice(i, 1); cols.splice(j, 0, x)
    }
    saveLayout(cols)
  }
  const startResize = (e, col) => {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, w0 = w(col)
    let last = w0
    const onMove = (ev) => { last = Math.max(60, Math.min(600, w0 + ev.clientX - x0)); setWidths(s => ({ ...s, [col.key]: last })) }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
      if (last !== w0) saveLayout(columns.map(c => c.key === col.key ? { ...c, width: Math.round(last) } : c))
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  // ── paste from Excel ──────────────────────────────────────────────────────
  const pasteRows = async (text, programmeId) => {
    const lines = text.split(/\r?\n/).map(l => l.split('\t')).filter(c => c.some(x => x.trim()))
    if (lines.length && /^(task|title|item|name)$/i.test((lines[0][0] || '').trim())) lines.shift()
    if (!lines.length) return
    const owners = ownersFor(programmeId)
    let order = nextOrder(), ok = 0
    const problems = []
    for (const [n, c] of lines.entries()) {
      const [title, type, owner, start, end, status] = c.map(x => (x || '').trim())
      if (!title) continue
      const o = owner ? owners.find(m => m.email?.toLowerCase() === owner.toLowerCase()
        || m.name?.toLowerCase() === owner.toLowerCase()) : null
      if (owner && !o) problems.push(`row ${n + 1}: owner "${owner}" is not in this workspace`)
      const kind = /mile/i.test(type) ? 'MILESTONE' : /phase|stage/i.test(type) ? 'PHASE' : 'TASK'
      const body = {
        title, kind, programmeId, ownerUserId: o?.userId ?? null,
        plannedStart: toIso(start), plannedEnd: toIso(end) || (kind === 'MILESTONE' ? toIso(start) : null),
        sortOrder: order,
      }
      order += 10
      try {
        const created = await collabApi.createItem(workspaceId, body)
        const st = toStatus(status)
        if (st && st !== 'NOT_STARTED' && created?.id) await collabApi.updateItem(workspaceId, created.id, { status: st })
        ok++
      } catch (e) {
        problems.push(`row ${n + 1}: ${errMsg(e, 'not added')}`)
      }
    }
    onChanged()
    if (ok) toast.success(`${ok} ${ok === 1 ? 'row' : 'rows'} added`)
    if (problems.length) toast.error(problems.slice(0, 5).join('\n'), { duration: 8000 })
  }

  // ── one cell ──────────────────────────────────────────────────────────────
  const renderCell = (col, item, depth, owners, phases) => {
    const full = !!item.canEdit
    const own = full || !!item.canUpdateStatus
    const linked = item.progressMode === 'LINKED'
    const ms = item.kind === 'MILESTONE'
    const h = health(item, today)
    const common = { col: col.key, item: item.id, onEnter: moveDown }
    const coloured = !!styleOf(item, col.key).color || !!styleOf(item, col.key).bg   // formatting wins over status colours
    switch (col.key) {
      case 'title':
        if (item.draft) {
          return (
            <TextCell {...common} value="" disabled={drafting}
              placeholder="+ New task — type here, or paste rows from Excel"
              className="italic placeholder:text-text-muted"
              onPaste={(e) => {
                const text = e.clipboardData.getData('text')
                if (/[\t\n]/.test(text.trim())) { e.preventDefault(); pasteRows(text, item.programmeId) }
              }}
              onEnter={(el) => setTimeout(() => el.focus(), 0)}
              onCommit={(v) => { if (v.trim()) patch(item, { title: v.trim() }) }} />
          )
        }
        return (
          <div className="flex items-center" style={{ paddingLeft: depth * 16 }}>
            <TextCell {...common} value={item.title} disabled={!full}
              className={item.kind === 'PHASE' && !styleOf(item, 'title').b ? 'font-semibold' : ''}
              onCommit={(v) => v.trim() ? patch(item, { title: v.trim() }) : toast.error('A task needs a name')} />
            {item.linked && <Link2 size={11} className="shrink-0 text-brand-ink mr-1" aria-label="Linked to an engagement" />}
          </div>
        )
      case 'kind':
        return <SelectCell {...common} value={item.kind} disabled={!full} options={Object.entries(KIND_LABEL)}
          onCommit={(v) => patch(item, v === 'MILESTONE'
            ? { kind: v, plannedStart: item.plannedEnd || item.plannedStart, plannedEnd: item.plannedEnd || item.plannedStart }
            : { kind: v })} />
      case 'parent':
        return <SelectCell {...common} value={item.parentId ?? ''} disabled={!full}
          options={[['', '—'], ...phases.filter(p => p.id !== item.id).map(p => [p.id, p.title]),
            ...(item.parentId && !phases.some(p => p.id === item.parentId)
              ? [[item.parentId, allItems.find(i => i.id === item.parentId)?.title || 'Row above']] : [])]}
          onCommit={(v) => patch(item, { parentId: v === '' ? null : Number(v) })} />
      case 'owner':
        return <SelectCell {...common} value={item.ownerUserId ?? ''} disabled={!full}
          options={[['', '—'], ...owners.map(m => [m.userId, m.name + (m.side === 'FIRM' ? ' (firm)' : '')]),
            ...(item.ownerUserId && !owners.some(m => m.userId === item.ownerUserId) ? [[item.ownerUserId, item.ownerName || 'Unknown']] : [])]}
          onCommit={(v) => patch(item, { ownerUserId: v === '' ? null : Number(v) })} />
      case 'start':
        return ms ? <span className="px-2 text-text-muted">—</span>
          : <DateCell {...common} value={item.plannedStart} disabled={!full} onCommit={(v) => patch(item, { plannedStart: v || null })} />
      case 'end':
        return <DateCell {...common} value={item.plannedEnd} disabled={!full}
          className={h === 'late' && !coloured ? 'text-status-fail-fg font-medium' : ''}
          onCommit={(v) => patch(item, ms ? { plannedStart: v || null, plannedEnd: v || null } : { plannedEnd: v || null })} />
      case 'status':
        return linked
          ? <span className={cn('px-2', !coloured && HEALTH_TEXT[h])} title="From the linked engagement">{STATUS_LABEL[item.status]}</span>
          : <SelectCell {...common} value={item.status} disabled={!own} className={coloured ? '' : HEALTH_TEXT[h]} options={Object.entries(STATUS_LABEL)}
              onCommit={(v) => patch(item, { status: v, ...(v === 'DONE' ? { progress: 100 } : {}) })} />
      case 'progress':
        return linked ? <span className="block px-2 text-right text-text-secondary">{item.progress ?? 0}</span>
          : <TextCell {...common} value={String(item.progress ?? 0)} disabled={!own} className="text-right" inputMode="numeric"
              onCommit={(v) => {
                const n = Math.round(Number(v))
                if (!Number.isFinite(n) || n < 0 || n > 100) { toast.error('% must be 0–100'); onChanged(); return }
                patch(item, { progress: n })
              }} />
      case 'notes':
        return <TextCell {...common} value={item.description || ''} disabled={!own} onCommit={(v) => patch(item, { description: v || null })} />
      default: {
        const val = item.custom?.[col.key]
        const set = (v) => patch(item, { custom: { [col.key]: v } })
        switch (col.type) {
          case 'NUMBER':
            return <TextCell {...common} value={val == null ? '' : String(val)} disabled={!own} className="text-right" inputMode="decimal"
              onCommit={(v) => { if (v.trim() && !Number.isFinite(Number(v.replace(/,/g, '')))) { toast.error(`${col.label} takes a number`); onChanged(); return } set(v.trim() || null) }} />
          case 'DATE':
            return <DateCell {...common} value={val || ''} disabled={!own} onCommit={(v) => set(v || null)} />
          case 'SELECT':
            return <SelectCell {...common} value={val ?? ''} disabled={!own}
              options={[['', '—'], ...(col.options || []).map(o => [o, o]), ...(val && !(col.options || []).includes(val) ? [[val, val]] : [])]}
              onCommit={(v) => set(v || null)} />
          case 'PERSON':
            return <SelectCell {...common} value={val ?? ''} disabled={!own}
              options={[['', '—'], ...members.map(m => [m.userId, m.name])]}
              onCommit={(v) => set(v === '' ? null : Number(v))} />
          case 'CHECKBOX':
            return (
              <div className="h-8 flex items-center justify-center">
                <input type="checkbox" checked={!!val} disabled={!own} data-col={col.key} data-item={item.id}
                  onChange={(e) => set(e.target.checked)} />
              </div>
            )
          default:
            return <TextCell {...common} value={val ?? ''} disabled={!own} onCommit={(v) => set(v || null)} />
        }
      }
    }
  }

  const th = 'relative text-left px-2 py-1.5 font-medium border-r border-border/60 whitespace-nowrap select-none'
  // ── formatting ─────────────────────────────────────────────────────────────
  const selItem = sel ? allItems.find(i => i.id === sel.id) : null
  const canFormat = !!selItem?.canEdit
  const applyFormat = (change) => {
    if (!canFormat) return
    const cur = selItem.format || {}
    const target = { ...((sel.col ? cur.cells?.[sel.col] : cur.row) || {}), ...change }
    Object.keys(target).forEach(k => { if (target[k] == null || target[k] === false || target[k] === 'm') delete target[k] })
    const next = { ...cur }
    if (sel.col) {
      const cells = { ...(cur.cells || {}) }
      if (Object.keys(target).length) cells[sel.col] = target; else delete cells[sel.col]
      next.cells = cells
    } else {
      if (Object.keys(target).length) next.row = target; else delete next.row
    }
    patch(selItem, { format: next })
  }
  const clearFormat = () => {
    if (!canFormat) return
    const cur = selItem.format || {}
    if (sel.col) { const cells = { ...(cur.cells || {}) }; delete cells[sel.col]; patch(selItem, { format: { ...cur, cells } }) }
    else patch(selItem, { format: {} })            // the whole row, cells included
  }
  const onKeys = (e) => {
    if (!(e.ctrlKey || e.metaKey) || !canFormat) return
    const k = e.key.toLowerCase()
    const st = sel.col ? (selItem.format?.cells?.[sel.col] || {}) : (selItem.format?.row || {})
    if (k === 'b' || k === 'i' || k === 'u') { e.preventDefault(); applyFormat({ [k]: !st[k] }) }
  }

  return (
    <div className="space-y-2">
    {canEditPlan && (
      <FormatBar sel={sel} item={selItem} columns={columns} canFormat={canFormat}
        current={sel && selItem ? (sel.col ? (selItem.format?.cells?.[sel.col] || {}) : (selItem.format?.row || {})) : {}}
        onApply={applyFormat} onClear={clearFormat} />
    )}
    <div ref={root} onKeyDownCapture={onKeys} className="rounded-card border border-border overflow-x-auto bg-surface-raised">
      <table className="text-xs text-text-primary border-collapse table-fixed" style={{ width: Math.max(tableWidth, 600) }}>
        <colgroup>
          <col style={{ width: 44 }} />
          {visible.map(c => <col key={c.key} style={{ width: w(c) }} />)}
          {canEditPlan && <col style={{ width: 72 }} />}
        </colgroup>
        <thead className="bg-surface-secondary/60 text-[10px] uppercase tracking-wide text-text-muted sticky top-0 z-[2]">
          <tr>
            <th className={cn(th, 'text-center')}>#</th>
            {visible.map(c => (
              <th key={c.key} className={cn(th, c.key === 'progress' && 'text-right', 'group/th')}>
                <div className="flex items-center gap-1 min-w-0">
                  <span className="truncate" title={c.builtIn ? c.label : `${c.label} · ${TYPE_LABEL[c.type] || c.type}`}>{c.label}</span>
                  {canEditPlan && (
                    <button type="button" aria-label={`${c.label} options`} onClick={(e) => setMenu({ kind: 'col', key: c.key, rect: e.currentTarget.getBoundingClientRect() })}
                      className="ml-auto shrink-0 p-0.5 rounded opacity-0 group-hover/th:opacity-100 hover:bg-surface-overlay text-text-muted">
                      <ChevronDown size={11} />
                    </button>
                  )}
                </div>
                {menu?.kind === 'col' && menu.key === c.key && (
                  <Popover onClose={() => setMenu(null)} rect={menu.rect}>
                    <MenuItem icon={Pencil} onClick={() => { setMenu(null); setColEdit(c) }}>{c.builtIn ? 'Rename' : 'Edit column'}</MenuItem>
                    <MenuItem icon={ArrowLeft} onClick={() => colOp('left', c)}>Move left</MenuItem>
                    <MenuItem icon={ArrowRight} onClick={() => colOp('right', c)}>Move right</MenuItem>
                    {c.key !== 'title' && <MenuItem icon={EyeOff} onClick={() => colOp('hide', c)}>Hide</MenuItem>}
                    {!c.builtIn && <MenuItem icon={Trash2} danger onClick={() => { setMenu(null); setColDelete(c) }}>Delete column</MenuItem>}
                  </Popover>
                )}
                {canEditPlan && (
                  <span onMouseDown={(e) => startResize(e, c)} title="Drag to resize"
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-brand-500/40 z-[1]" />
                )}
              </th>
            ))}
            {canEditPlan && (
              <th className="px-1 whitespace-nowrap text-right normal-case">
                <button type="button" onClick={() => setColEdit({})} title="Add a column"
                  className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay"><Plus size={13} /></button>
                <button type="button" onClick={() => setManaging(true)} title="Show, hide and order columns"
                  className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay"><Settings size={13} /></button>
              </th>
            )}
          </tr>
        </thead>
        {groups.map(g => {
          const progId = g.programme.id ?? null
          const phases = allItems.filter(i => i.kind === 'PHASE' && (i.programmeId ?? null) === progId)
          const owners = ownersFor(progId)
          const span = visible.length + 1 + (canEditPlan ? 1 : 0)
          return (
            <tbody key={progId ?? 'ws'}>
              <tr>
                <td colSpan={span} className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted bg-surface-secondary/30 border-y border-border/60">
                  {g.programme.name}
                </td>
              </tr>
              {g.rows.map(({ item, depth }, idx) => {
                const full = !!item.canEdit
                const sibs = siblingsOf(g.rows, item.parentId)
                const at = sibs.findIndex(s => s.id === item.id)
                const open = menu?.kind === 'row' && menu.key === item.id
                return (
                  <tr key={item.id} className="group border-b border-border/40 hover:bg-surface-overlay/30">
                    <td className={cn('relative px-0 text-[10px] text-text-muted border-r border-border/40',
                      sel?.id === item.id && sel.col == null && 'bg-brand-500/15')}>
                      <div className="flex items-center justify-between pl-1.5">
                        <button type="button" title="Select the row (to format it)" onClick={() => setSel({ id: item.id, col: null })}
                          className="flex-1 text-left hover:text-text-primary">{idx + 1}</button>
                        <button type="button" aria-label="Row options" onClick={(e) => setMenu({ kind: 'row', key: item.id, rect: e.currentTarget.getBoundingClientRect() })}
                          className={cn('p-0.5 rounded hover:bg-surface-overlay text-text-secondary', open ? 'visible' : 'invisible group-hover:visible')}>
                          <MoreVertical size={12} />
                        </button>
                      </div>
                      {open && (
                        <Popover onClose={() => setMenu(null)} rect={menu.rect} align="left">
                          {full && <MenuItem icon={Plus} onClick={() => rowOp('insert', item, g.rows, progId)}>Insert row below</MenuItem>}
                          {full && <MenuItem icon={ArrowUp} disabled={at <= 0} onClick={() => rowOp('up', item, g.rows, progId)}>Move up</MenuItem>}
                          {full && <MenuItem icon={ArrowDown} disabled={at >= sibs.length - 1} onClick={() => rowOp('down', item, g.rows, progId)}>Move down</MenuItem>}
                          {full && <MenuItem icon={ArrowRight} disabled={at <= 0} onClick={() => rowOp('indent', item, g.rows, progId)}>Indent (under the row above)</MenuItem>}
                          {full && <MenuItem icon={ArrowLeft} disabled={!item.parentId} onClick={() => rowOp('outdent', item, g.rows, progId)}>Outdent</MenuItem>}
                          {(full || item.canUpdateStatus) && <MenuItem icon={SlidersHorizontal} onClick={() => { setMenu(null); onDetails(item) }}>All details…</MenuItem>}
                          <MenuItem icon={History} onClick={() => { setMenu(null); onHistory(item) }}>History</MenuItem>
                          {full && <MenuItem icon={Trash2} danger onClick={() => { setMenu(null); setDeleting(item) }}>Remove row</MenuItem>}
                        </Popover>
                      )}
                    </td>
                    {visible.map(c => {
                      const css = cssOf(styleOf(item, c.key))
                      const picked = sel?.id === item.id && (sel.col === c.key || sel.col == null)
                      return (
                        <td key={c.key} onFocusCapture={() => setSel({ id: item.id, col: c.key })}
                          style={css.backgroundColor ? { backgroundColor: css.backgroundColor } : undefined}
                          className={cn('p-0 border-r border-border/40 align-middle overflow-hidden',
                            picked && sel.col == null && 'shadow-[inset_0_0_0_9999px_rgba(99,102,241,0.06)]')}>
                          <div style={{ ...css, backgroundColor: undefined }}>{renderCell(c, item, depth, owners, phases)}</div>
                        </td>
                      )
                    })}
                    {canEditPlan && <td />}
                  </tr>
                )
              })}
              {canEditPlan && !ownerFilter && (() => {
                const draft = {
                  id: `new-${progId ?? 'ws'}`, draft: true, programmeId: progId, parentId: null, kind: 'TASK', title: '',
                  status: 'NOT_STARTED', progress: 0, custom: {}, canEdit: !drafting, canUpdateStatus: !drafting,
                }
                return (
                  <tr className="border-b border-border/40 bg-surface-secondary/10">
                    <td className="px-1 text-center text-[10px] text-text-muted border-r border-border/40">{g.rows.length + 1}</td>
                    {visible.map(c => (
                      <td key={c.key} className="p-0 border-r border-border/40 align-middle overflow-hidden">
                        {renderCell(c, draft, 0, owners, phases)}
                      </td>
                    ))}
                    {canEditPlan && <td />}
                  </tr>
                )
              })()}
            </tbody>
          )
        })}
      </table>
      {canEditPlan && (
        <p className="px-3 py-2 text-[11px] text-text-muted border-t border-border/60">
          Type in the last row of a section and press Enter to add a task, or paste rows from Excel there (Task, Type,
          Owner, Start, End, Status). ⋮ on a row inserts, moves and indents it. Hover a header for its options; drag its
          edge to resize; + adds a column.
        </p>
      )}

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onCancel={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting)} loading={remove.isPending}
        title={`Remove "${deleting?.title || ''}"?`}
        message="It disappears from the plan. Rows under it move up a level. The removal is kept in the history."
        confirmLabel="Remove" />
      <ConfirmDialog open={!!colDelete} onClose={() => setColDelete(null)} onCancel={() => setColDelete(null)}
        onConfirm={() => { saveLayout(columns.filter(c => c.key !== colDelete.key)); setColDelete(null) }}
        title={`Delete the "${colDelete?.label || ''}" column?`}
        message="Its values disappear from every row. To keep them but not show them, hide the column instead."
        confirmLabel="Delete column" />
      <ColumnModal column={colEdit} onClose={() => setColEdit(null)} saving={layout.isPending}
        onSave={(c) => {
          const cols = colEdit?.key ? columns.map(x => x.key === colEdit.key ? { ...x, ...c } : x)
            : [...columns, { ...c, key: `tmp_${Date.now()}`, builtIn: false }]
          saveLayout(cols); setColEdit(null)
        }} />
      <ManageColumnsModal open={managing} onClose={() => setManaging(false)} columns={columns}
        saving={layout.isPending} onSave={(cols) => { saveLayout(cols); setManaging(false) }} />
    </div>
    </div>
  )
}

/**
 * The formatting toolbar — like Excel's: acts on the selected cell (click into
 * it) or the whole row (click its number). Ctrl+B / Ctrl+I / Ctrl+U work in a cell.
 * Only rows the caller may edit can be formatted; everyone sees the result.
 */
function FormatBar({ sel, item, columns, canFormat, current, onApply, onClear }) {
  const [pick, setPick] = useState(null)        // { kind: 'color'|'bg', rect }
  const colLabel = sel?.col ? (columns.find(c => c.key === sel.col)?.label || sel.col) : null
  const what = !sel || !item ? 'Click a cell, or a row number, to format it'
    : !canFormat ? 'You can fill in this row, but not format it'
    : sel.col ? `Cell · ${colLabel} · ${item.title}` : `Whole row · ${item.title}`
  const btn = (on) => cn('h-7 w-7 flex items-center justify-center rounded-ctl border text-text-secondary disabled:opacity-40',
    on ? 'border-brand-500 bg-brand-500/15 text-text-primary' : 'border-border bg-surface-raised hover:bg-surface-overlay')
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-card border border-border bg-surface-raised px-2 py-1.5">
      <button type="button" className={btn(current.b)} disabled={!canFormat} onClick={() => onApply({ b: !current.b })} title="Bold (Ctrl+B)"><Bold size={13} /></button>
      <button type="button" className={btn(current.i)} disabled={!canFormat} onClick={() => onApply({ i: !current.i })} title="Italic (Ctrl+I)"><Italic size={13} /></button>
      <button type="button" className={btn(current.u)} disabled={!canFormat} onClick={() => onApply({ u: !current.u })} title="Underline (Ctrl+U)"><Underline size={13} /></button>
      <select value={current.size || 'm'} disabled={!canFormat} onChange={e => onApply({ size: e.target.value })} title="Text size"
        className="h-7 rounded-ctl border border-border bg-surface-raised px-1.5 text-xs text-text-secondary disabled:opacity-40">
        <option value="s">Small</option><option value="m">Normal</option><option value="l">Large</option>
      </select>
      <button type="button" className={btn(!!current.color)} disabled={!canFormat} title="Text colour"
        onClick={(e) => setPick({ kind: 'color', rect: e.currentTarget.getBoundingClientRect() })}>
        <span className="flex flex-col items-center leading-none"><Palette size={12} />
          <span className="block w-3.5 h-[3px] mt-0.5 rounded" style={{ background: current.color || 'currentColor' }} /></span>
      </button>
      <button type="button" className={btn(!!current.bg)} disabled={!canFormat} title="Fill colour"
        onClick={(e) => setPick({ kind: 'bg', rect: e.currentTarget.getBoundingClientRect() })}>
        <span className="flex flex-col items-center leading-none"><Highlighter size={12} />
          <span className="block w-3.5 h-[3px] mt-0.5 rounded border border-border" style={{ background: current.bg || 'transparent' }} /></span>
      </button>
      <button type="button" className={btn(false)} disabled={!canFormat} onClick={onClear}
        title={sel?.col ? 'Clear this cell\'s formatting' : 'Clear the row\'s formatting (its cells too)'}><RotateCcw size={13} /></button>
      <span className="ml-2 text-[11px] text-text-muted truncate">{what}</span>
      {pick && (
        <Popover rect={pick.rect} align="left" onClose={() => setPick(null)}>
          <div className="px-3 py-2">
            <p className="text-[11px] text-text-muted mb-1.5">{pick.kind === 'color' ? 'Text colour' : 'Fill colour'}</p>
            <div className="grid grid-cols-5 gap-1.5">
              {(pick.kind === 'color' ? TEXT_COLOURS : FILL_COLOURS).map(c => (
                <button key={c} type="button" title={c} onClick={() => { onApply({ [pick.kind]: c }); setPick(null) }}
                  className={cn('w-7 h-7 rounded border', current[pick.kind] === c ? 'border-brand-500 ring-2 ring-brand-500/40' : 'border-border')}
                  style={{ background: c }} />
              ))}
            </div>
            <button type="button" onClick={() => { onApply({ [pick.kind]: null }); setPick(null) }}
              className="mt-2 text-[11px] text-text-secondary hover:text-text-primary">None</button>
          </div>
        </Popover>
      )}
    </div>
  )
}

// ── column dialogs ───────────────────────────────────────────────────────────

function ColumnModal({ column, onClose, onSave, saving }) {
  const isNew = column && !column.key
  const [form, setForm] = useState(null)
  const [key, setKey] = useState(null)
  const token = column ? (column.key ?? 'new') : null
  if (token !== key) {
    setKey(token)
    setForm(column ? { label: column.label || '', type: column.type || 'TEXT', options: (column.options || []).join('\n') } : null)
    return null   // re-renders at once with the new form; this pass still holds the old one
  }
  if (!form || !column) return null
  const builtIn = column?.builtIn
  const input = 'w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary'
  const submit = () => onSave(builtIn ? { label: form.label.trim() } : {
    label: form.label.trim(), type: form.type,
    options: form.type === 'SELECT' ? form.options.split('\n').map(s => s.trim()).filter(Boolean) : [],
  })
  return (
    <Modal open={!!column} onClose={onClose} size="sm" title={isNew ? 'Add a column' : builtIn ? 'Rename column' : 'Edit column'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} loading={saving}
            disabled={!form.label.trim() || (form.type === 'SELECT' && !builtIn && !form.options.trim())}>{isNew ? 'Add' : 'Save'}</Button>
        </div>
      }>
      <div className="space-y-3">
        <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} autoFocus
          placeholder="Column name, e.g. Evidence ref" maxLength={60} className={input}
          onKeyDown={e => { if (e.key === 'Enter' && form.label.trim() && form.type !== 'SELECT') submit() }} />
        {!builtIn && (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <button key={k} type="button" onClick={() => setForm(f => ({ ...f, type: k }))}
                  className={cn('h-8 rounded-ctl border text-xs', form.type === k ? 'border-brand-500 bg-brand-500/10 text-text-primary font-medium' : 'border-border text-text-secondary hover:bg-surface-overlay')}>
                  {v}
                </button>
              ))}
            </div>
            {form.type === 'SELECT' && (
              <textarea value={form.options} onChange={e => setForm(f => ({ ...f, options: e.target.value }))} rows={5}
                placeholder={'One option per line\nHigh\nMedium\nLow'}
                className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary" />
            )}
            {!isNew && column.type !== form.type && (
              <p className="text-[11px] text-status-warn-fg">Values that don't fit the new type are kept but may show oddly until edited.</p>
            )}
          </>
        )}
        {builtIn && <p className="text-[11px] text-text-muted">A standard column — you can rename, move and hide it, not delete it.</p>}
      </div>
    </Modal>
  )
}

function ManageColumnsModal({ open, onClose, columns, onSave, saving }) {
  const [cols, setCols] = useState([])
  const [was, setWas] = useState(false)
  if (open !== was) { setWas(open); if (open) setCols(columns.map(c => ({ ...c }))); return null }
  const move = (i, d) => setCols(cs => { const n = [...cs]; const j = i + d; if (j < 0 || j >= n.length) return cs; [n[i], n[j]] = [n[j], n[i]]; return n })
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Columns" subtitle="Tick to show. Use the arrows to change the order."
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCols(cs => cs.map(c => ({ ...c, width: undefined })))}>Reset widths</Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => onSave(cols)} loading={saving}>Save</Button>
          </div>
        </div>
      }>
      <div className="rounded-ctl border border-border max-h-96 overflow-y-auto">
        {cols.map((c, i) => (
          <div key={c.key} className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle last:border-0">
            <input type="checkbox" checked={!c.hidden} disabled={c.key === 'title'}
              onChange={e => setCols(cs => cs.map(x => x.key === c.key ? { ...x, hidden: !e.target.checked } : x))} />
            <span className={cn('text-sm flex-1 truncate', c.hidden ? 'text-text-muted' : 'text-text-primary')}>{c.label}</span>
            <span className="text-[10px] text-text-muted">{c.builtIn ? 'Standard' : TYPE_LABEL[c.type]}</span>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Up"
              className="p-1 rounded text-text-muted hover:bg-surface-overlay disabled:opacity-30"><ArrowUp size={12} /></button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === cols.length - 1} aria-label="Down"
              className="p-1 rounded text-text-muted hover:bg-surface-overlay disabled:opacity-30"><ArrowDown size={12} /></button>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ── small pieces ─────────────────────────────────────────────────────────────

/** A small menu pinned under the button that opened it (fixed, so the sheet's scroll box never clips it). */
function Popover({ children, onClose, rect, align = 'right' }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', k)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])
  const W = 210
  const left = !rect ? 0 : align === 'left' ? Math.min(rect.left, window.innerWidth - W - 8) : Math.max(8, rect.right - W)
  const below = !rect || rect.bottom + 300 < window.innerHeight
  const style = !rect ? {} : below ? { left, top: rect.bottom + 4, width: W } : { left, bottom: window.innerHeight - rect.top + 4, width: W }
  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} onWheel={onClose} />
      <div style={style} className="fixed z-[61] rounded-ctl border border-border bg-surface-raised shadow-overlay py-1 normal-case tracking-normal text-left font-normal">
        {children}
      </div>
    </>
  )
}

const MenuItem = ({ icon: Icon, children, onClick, danger, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-surface-overlay disabled:opacity-40 disabled:hover:bg-transparent',
      danger ? 'text-status-fail-fg' : 'text-text-primary')}>
    {Icon && <Icon size={12} className="shrink-0" />} {children}
  </button>
)

// Colour, weight, style and size are inherited from the cell, so formatting applies to every kind of cell.
const cellCls = 'w-full h-8 px-2 bg-transparent outline-none border border-transparent ' +
  'focus:border-brand-500 focus:bg-surface-raised/80 focus:relative focus:z-[1] disabled:cursor-default'

/** Saves on blur when changed. Enter saves and moves down; Esc puts the old value back. */
function TextCell({ value, onCommit, disabled, col, item, onEnter, className, placeholder, inputMode, onPaste }) {
  const [v, setV] = useState(value ?? '')
  const [focused, setFocused] = useState(false)
  const cancel = useRef(false)
  useEffect(() => { if (!focused) setV(value ?? '') }, [value, focused])
  return (
    <input value={v} disabled={disabled} data-col={col} data-item={item} placeholder={placeholder} inputMode={inputMode}
      title={v.length > 30 ? v : undefined}
      onChange={e => setV(e.target.value)}
      onPaste={onPaste}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        if (cancel.current) { cancel.current = false; setV(value ?? ''); return }
        if (v !== (value ?? '')) onCommit(v)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); const el = e.currentTarget; el.blur(); onEnter?.(el) }
        if (e.key === 'Escape') { cancel.current = true; e.currentTarget.blur() }
      }}
      className={cn(cellCls, 'truncate', className)} />
  )
}

function DateCell({ value, onCommit, disabled, col, item, onEnter, className }) {
  const [v, setV] = useState(value || '')
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setV(value || '') }, [value, focused])
  return (
    <input type="date" value={v} disabled={disabled} data-col={col} data-item={item}
      onChange={e => setV(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); if (v !== (value || '')) onCommit(v) }}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); const el = e.currentTarget; el.blur(); onEnter?.(el) }
        if (e.key === 'Escape') { setV(value || ''); e.currentTarget.blur() }
      }}
      className={cn(cellCls, !v && 'text-text-muted', className)} />
  )
}

function SelectCell({ value, options, onCommit, disabled, col, item, className }) {
  return (
    <select value={value ?? ''} disabled={disabled} data-col={col} data-item={item}
      onChange={e => onCommit(e.target.value)}
      className={cn(cellCls, 'appearance-none pr-1 truncate', !disabled && 'cursor-pointer', className)}>
      {options.map(([k, label]) => <option key={String(k)} value={k}>{label}</option>)}
    </select>
  )
}

// ── paste helpers ────────────────────────────────────────────────────────────

const pad = (x) => String(x).padStart(2, '0')
/** YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, or anything Date can read ("15 Nov 2026"). */
function toIso(s) {
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`
  const d = new Date(s)
  return isNaN(d) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function toStatus(s) {
  if (!s) return null
  const t = s.toLowerCase()
  if (t.startsWith('done') || t.startsWith('complete')) return 'DONE'
  if (t.includes('progress') || t.startsWith('ongoing') || t.startsWith('started')) return 'IN_PROGRESS'
  if (t.startsWith('block') || t.startsWith('hold')) return 'BLOCKED'
  return 'NOT_STARTED'
}
