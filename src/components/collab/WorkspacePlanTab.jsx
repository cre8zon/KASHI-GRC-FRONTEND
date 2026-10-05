import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Upload, Table2, BarChart3 } from 'lucide-react'
import { collabApi, unwrapList, unwrapOne, errMsg } from '../../api/collab.api'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Skeleton } from '../ui/EmptyState'
import { cn } from '../../lib/cn'
import { PlanBoard, PlanItemModal, PlanHistoryModal, health } from './PlanBoard'
import { PlanSheet } from './PlanSheet'
import { useUrlState } from '../../hooks/useUrlState'
import toast from 'react-hot-toast'

/**
 * Workspace › Plan — one plan per workspace, one timeline per programme.
 *
 * Sheet (default) — the plan as a spreadsheet you type into, rows added in
 * place, rows pasted from Excel, columns configured per workspace. Timeline — the same plan drawn as a Gantt
 * chart, read-only. Both filter by programme and owner. Editors change any
 * cell; an item's owner updates its status, % and notes. Export downloads the
 * plan as .xlsx; Import reads a spreadsheet into one programme after a
 * preview.
 */
export function WorkspacePlanTab({ workspaceId, archived }) {
  const qc = useQueryClient()
  const [rawView, setView] = useUrlState('view', 'sheet')
  const view = rawView === 'gantt' ? 'gantt' : 'sheet'
  const [progParam, setProgParam] = useUrlState('prog', '')     // '' = not chosen yet → remembered / first
  const [owner, setOwner] = useState('')
  const [editing, setEditing] = useState(null)      // null | {} | item
  const [historyOf, setHistoryOf] = useState(null)
  const [importing, setImporting] = useState(false)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['collab-plan', workspaceId],
    queryFn: () => collabApi.plan(workspaceId),
  })
  const plan = unwrapOne(raw) || {}
  const allItems = Array.isArray(plan.items) ? plan.items : []
  const programmes = Array.isArray(plan.programmes) ? plan.programmes : []

  // One programme at a time. Tabs: each programme · Workspace-wide · All. The
  // choice is in the URL (?prog=) and remembered per workspace in this browser,
  // so the plan opens where you left it; first time, on the first programme.
  const memoKey = `kashi-plan-prog-${workspaceId}`
  const valid = (k) => k === 'all' || k === 'ws' || programmes.some(p => String(p.id) === k)
  let remembered = null
  try { remembered = window.localStorage.getItem(memoKey) } catch { /* storage blocked — fine */ }
  const tab = valid(progParam) ? progParam
    : remembered && valid(remembered) ? remembered
    : programmes.length ? String(programmes[0].id) : 'ws'
  const chooseTab = (k) => {
    setProgParam(k)
    try { window.localStorage.setItem(memoKey, k) } catch { /* ignore */ }
  }
  const programmeId = tab === 'all' ? '' : tab      // '' all · 'ws' workspace-wide · id
  const members = Array.isArray(plan.members) ? plan.members : []
  const today = plan.today || new Date().toISOString().slice(0, 10)
  const canEditPlan = !!plan.canEditPlan && !archived

  const items = useMemo(() => allItems.filter(i =>
    (programmeId === '' || String(i.programmeId ?? 'ws') === programmeId)
    && (owner === '' || String(i.ownerUserId ?? '') === owner)
  ), [allItems, programmeId, owner])

  const counts = useMemo(() => ({
    late: allItems.filter(i => health(i, today) === 'late').length,
    done: allItems.filter(i => i.status === 'DONE').length,
  }), [allItems, today])

  const refresh = () => qc.invalidateQueries({ queryKey: ['collab-plan', workspaceId] })

  const doExport = async () => {
    try {
      const blob = await collabApi.exportPlan(workspaceId, programmeId && programmeId !== 'ws' ? programmeId : null)
      const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]))
      const a = document.createElement('a')
      a.href = url; a.download = `plan-${workspaceId}.xlsx`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { toast.error(errMsg(e, 'Could not export the plan')) }
  }

  if (isLoading) return <Skeleton className="h-64" />

  const tabs = [...programmes.map(p => [String(p.id), p.name]), ['ws', 'Workspace-wide'], ['all', 'All']]
  const countIn = (k) => allItems.filter(i => k === 'all' || String(i.programmeId ?? 'ws') === k).length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" onClick={() => chooseTab(k)}
            className={cn('shrink-0 px-3 py-1.5 text-xs -mb-px border-b-2 transition-colors whitespace-nowrap',
              tab === k ? 'border-brand-500 text-text-primary font-medium' : 'border-transparent text-text-secondary hover:text-text-primary')}>
            {label} <span className="text-text-muted">{countIn(k)}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-ctl border border-border overflow-hidden">
          {[['sheet', Table2, 'Sheet'], ['gantt', BarChart3, 'Timeline']].map(([k, Icon, label]) => (
            <button key={k} type="button" onClick={() => setView(k)}
              className={cn('flex items-center gap-1 px-2.5 h-7 text-xs', view === k ? 'bg-brand-500/15 text-text-primary font-medium' : 'text-text-secondary hover:bg-surface-overlay')}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
        <select value={owner} onChange={e => setOwner(e.target.value)}
          className="h-7 rounded-ctl border border-border bg-surface-raised px-2 text-xs text-text-secondary">
          <option value="">Any owner</option>
          {members.map(m => <option key={m.userId} value={String(m.userId)}>{m.name}</option>)}
        </select>
        <span className="text-[11px] text-text-muted">
          {allItems.length} items · {counts.done} done{counts.late > 0 && <> · <span className="text-status-fail-fg font-medium">{counts.late} late</span></>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={Download} onClick={doExport} disabled={allItems.length === 0}>Export</Button>
          {canEditPlan && <Button variant="secondary" size="sm" icon={Upload} onClick={() => setImporting(true)}>Import</Button>}
        </div>
      </div>

      {view === 'sheet' && (canEditPlan || allItems.length > 0) ? (
        <PlanSheet workspaceId={workspaceId} items={items} allItems={allItems} programmes={programmes}
          members={members} columns={Array.isArray(plan.columns) ? plan.columns : []} today={today} canEditPlan={canEditPlan}
          programmeFilter={programmeId} ownerFilter={owner}
          onDetails={setEditing} onHistory={setHistoryOf} onChanged={refresh} />
      ) : allItems.length === 0 ? (
        <div className="rounded-card border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm text-text-primary">No plan yet</p>
          <p className="text-xs text-text-muted mt-1">
            Items appear here once the plan is set up.
          </p>
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-text-muted">Nothing matches these filters.</p>
      ) : (
        <PlanBoard items={items} programmes={programmes} today={today} view="gantt"
          onHistory={setHistoryOf} />
      )}

      <PlanItemModal open={!!editing} onClose={() => setEditing(null)} workspaceId={workspaceId}
        item={editing?.id ? editing : null} items={allItems} programmes={programmes} members={members}
        defaultProgrammeId={programmeId && programmeId !== 'ws' ? Number(programmeId) : null}
        canEditPlan={canEditPlan} onSaved={refresh} />
      <PlanHistoryModal open={!!historyOf} onClose={() => setHistoryOf(null)} workspaceId={workspaceId}
        item={historyOf} members={members} />
      <ImportModal open={importing} onClose={() => setImporting(false)} workspaceId={workspaceId}
        programmes={programmes} onDone={refresh} initialProgrammeId={programmeId && programmeId !== 'ws' ? programmeId : ''} />
    </div>
  )
}

function ImportModal({ open, onClose, workspaceId, programmes, onDone, initialProgrammeId = '' }) {
  const [programmeId, setProgrammeId] = useState(initialProgrammeId)
  const [was, setWas] = useState(false)
  if (open !== was) { setWas(open); if (open) setProgrammeId(initialProgrammeId) }
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)

  const reset = () => { setFile(null); setPreview(null) }
  const close = () => { reset(); onClose() }

  const { mutate: doPreview, isPending: previewing } = useMutation({
    mutationFn: () => collabApi.importPreview(workspaceId, programmeId || null, file),
    onSuccess: (r) => setPreview(unwrapOne(r)),
    onError: (e) => toast.error(errMsg(e, 'Could not read the spreadsheet')),
  })
  const { mutate: doImport, isPending: importing } = useMutation({
    mutationFn: () => collabApi.importCommit(workspaceId, programmeId || null, file),
    onSuccess: (r) => { toast.success(`${unwrapOne(r)?.created ?? 0} items imported`); onDone(); close() },
    onError: (e) => toast.error(errMsg(e, 'Import failed')),
  })

  const rows = unwrapList(preview?.rows)
  const errors = preview?.errorCount ?? 0

  return (
    <Modal open={open} onClose={close} size="lg" title="Import a plan from Excel"
      subtitle="Columns read: Kind, Title, Parent, Owner email, Planned start, Planned end, Status. A plan exported from here imports back as is.">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Into programme</span>
            <select value={programmeId} onChange={e => { setProgrammeId(e.target.value); setPreview(null) }}
              className="mt-1 w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary">
              <option value="">Workspace-wide</option>
              {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Spreadsheet (.xlsx)</span>
            <input type="file" accept=".xlsx" onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null) }}
              className="mt-1 block w-full text-xs text-text-secondary" />
          </label>
        </div>

        {preview && (
          <div className="rounded-ctl border border-border max-h-80 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-surface-secondary/50 text-text-muted sticky top-0">
                <tr>{['Row', 'Kind', 'Title', 'Parent', 'Owner', 'Start', 'End', 'Status', 'Problems'].map(h => <th key={h} className="text-left px-2 py-1 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.row} className={cn('border-t border-border/40', r.errors?.length ? 'bg-status-fail-bg/40' : '')}>
                    <td className="px-2 py-1">{r.row}</td>
                    <td className="px-2 py-1">{r.kind}</td>
                    <td className="px-2 py-1">{r.title}</td>
                    <td className="px-2 py-1">{r.parent || ''}</td>
                    <td className="px-2 py-1">{r.ownerEmail || ''}</td>
                    <td className="px-2 py-1">{r.plannedStart || ''}</td>
                    <td className="px-2 py-1">{r.plannedEnd || ''}</td>
                    <td className="px-2 py-1">{r.status}</td>
                    <td className="px-2 py-1 text-status-fail-fg">{(r.errors || []).join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {preview && (
          <p className={cn('text-xs', errors ? 'text-status-fail-fg' : 'text-text-secondary')}>
            {errors ? `${errors} row(s) need fixing in the spreadsheet before importing.` : `${preview.rowCount} items will be added.`}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={close} disabled={previewing || importing}>Cancel</Button>
          {!preview || errors
            ? <Button size="sm" onClick={() => doPreview()} disabled={!file} loading={previewing}>Preview</Button>
            : <Button size="sm" onClick={() => doImport()} loading={importing}>Import {preview.rowCount} items</Button>}
        </div>
      </div>
    </Modal>
  )
}
