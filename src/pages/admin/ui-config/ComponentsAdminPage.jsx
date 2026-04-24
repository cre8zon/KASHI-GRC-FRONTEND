import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, RefreshCw, Pencil, Trash2, Search, ChevronRight, X,
} from 'lucide-react'
import { uiAdminApi } from '../../../api/uiConfig.api'
import { PageLayout }  from '../../../components/layout/PageLayout'
import { DataTable }   from '../../../components/ui/DataTable'
import { Button }      from '../../../components/ui/Button'
import { Badge }       from '../../../components/ui/Badge'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Input }       from '../../../components/ui/Input'
import { Card, CardHeader, CardBody } from '../../../components/ui/Card'
import { cn }          from '../../../lib/cn'
import { COLOR_MAP }   from '../../../config/constants'
import toast           from 'react-hot-toast'

const COMPONENT_TYPES = ['BADGE_SET', 'DROPDOWN', 'RADIO_GROUP', 'MULTI_SELECT', 'STATUS_MAP']
const COLOR_TAGS = Object.keys(COLOR_MAP)

// ─── Hooks ────────────────────────────────────────────────────────────────────
const useComponents = (params) => useQuery({
  queryKey: ['admin-components', params],
  queryFn:  () => uiAdminApi.components.list(params),
  keepPreviousData: true,
})
const useOptions = (componentId) => useQuery({
  queryKey: ['admin-options', componentId],
  queryFn:  () => uiAdminApi.options.list(componentId),
  enabled:  !!componentId,
})

function useMutationWithInvalidation(fn, keys, msg) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { keys.forEach(k => qc.invalidateQueries({ queryKey: [k] })); toast.success(msg) },
    onError: (e) => toast.error(e?.message || 'Failed'),
  })
}

// ─── Option row (inline in slide-out panel) ───────────────────────────────────
function OptionRow({ opt, componentId, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    optionLabel: opt.label, colorTag: opt.colorTag || '', sortOrder: opt.sortOrder,
  })
  const { mutate: update, isPending } = useMutationWithInvalidation(
    ({ id, data }) => uiAdminApi.options.update(id, data),
    ['admin-options'], 'Option updated')

  if (!editing) return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-surface-overlay/50 group rounded">
      <div className={cn('w-2 h-2 rounded-full shrink-0',
        form.colorTag ? `bg-${form.colorTag}-400` : 'bg-text-muted')} />
      <span className="text-xs font-mono text-text-muted w-24 shrink-0">{opt.value}</span>
      <Badge value={opt.value} label={opt.label} colorTag={opt.colorTag || 'gray'} />
      <span className="text-[10px] text-text-muted ml-auto">#{opt.sortOrder}</span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)}
          className="h-5 w-5 flex items-center justify-center rounded text-text-muted hover:text-brand-400 transition-colors">
          <Pencil size={10} />
        </button>
        <button onClick={() => onDelete(opt.id)}
          className="h-5 w-5 flex items-center justify-center rounded text-text-muted hover:text-red-400 transition-colors">
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-surface-overlay rounded">
      <input value={form.optionLabel} onChange={e => setForm(f => ({ ...f, optionLabel: e.target.value }))}
        className="h-6 flex-1 rounded border border-border bg-surface-raised px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
      <select value={form.colorTag} onChange={e => setForm(f => ({ ...f, colorTag: e.target.value }))}
        className="h-6 w-24 rounded border border-border bg-surface-raised px-1 text-xs text-text-primary focus:outline-none">
        <option value="">No color</option>
        {COLOR_TAGS.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) }))}
        className="h-6 w-12 rounded border border-border bg-surface-raised px-2 text-xs text-text-primary focus:outline-none" />
      <Button size="xs" loading={isPending} onClick={() => update({ id: opt.id, data: form }, { onSuccess: () => setEditing(false) })}>
        Save
      </Button>
      <button onClick={() => setEditing(false)}><X size={12} className="text-text-muted" /></button>
    </div>
  )
}

// ─── Option Panel (slide-out for a component) ─────────────────────────────────
function OptionPanel({ component, onClose }) {
  const { data: opts, isLoading } = useOptions(component.id)
  const [newOpt, setNewOpt] = useState({ optionValue: '', optionLabel: '', colorTag: '', sortOrder: 0 })
  const qc = useQueryClient()
  const { mutate: createOpt, isPending: creating } = useMutation({
    mutationFn: () => uiAdminApi.options.create({ ...newOpt, componentId: component.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-options', component.id] })
      setNewOpt({ optionValue: '', optionLabel: '', colorTag: '', sortOrder: 0 })
      toast.success('Option added')
    },
    onError: (e) => toast.error(e?.message || 'Failed'),
  })
  const { mutate: deleteOpt } = useMutation({
    mutationFn: (id) => uiAdminApi.options.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-options', component.id] }),
  })

  const options = Array.isArray(opts) ? opts : (opts?.data || [])

  return (
    <div className="flex flex-col gap-4">
      {/* Component info */}
      <div className="p-3 bg-surface-overlay rounded-lg border border-border">
        <p className="text-xs font-mono text-brand-400">{component.componentKey}</p>
        <p className="text-[10px] text-text-muted mt-0.5">{component.componentType} · {component.screen || 'global'}</p>
      </div>

      {/* Options list */}
      <div>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
          Options ({options.length})
        </p>
        {isLoading && <p className="text-xs text-text-muted">Loading…</p>}
        <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
          {options.map(opt => (
            <OptionRow key={opt.id} opt={opt} componentId={component.id} onDelete={deleteOpt} />
          ))}
          {!isLoading && options.length === 0 && (
            <p className="text-xs text-text-muted italic px-3 py-2">No options yet.</p>
          )}
        </div>
      </div>

      {/* Add option */}
      <div className="border-t border-border pt-3">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Add Option</p>
        <div className="grid grid-cols-4 gap-2 mb-2">
          <Input label="Value *" value={newOpt.optionValue}
            onChange={e => setNewOpt(f => ({ ...f, optionValue: e.target.value }))}
            placeholder="ACTIVE" />
          <Input label="Label *" value={newOpt.optionLabel}
            onChange={e => setNewOpt(f => ({ ...f, optionLabel: e.target.value }))}
            placeholder="Active" />
          <div>
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Color</label>
            <select value={newOpt.colorTag}
              onChange={e => setNewOpt(f => ({ ...f, colorTag: e.target.value }))}
              className="w-full h-8 rounded-md border border-border bg-surface-raised px-2 text-sm text-text-primary focus:outline-none">
              <option value="">None</option>
              {COLOR_TAGS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Input label="Sort" type="number" value={newOpt.sortOrder}
            onChange={e => setNewOpt(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
            placeholder="0" />
        </div>
        <Button size="sm" icon={Plus} loading={creating}
          disabled={!newOpt.optionValue.trim() || !newOpt.optionLabel.trim()}
          onClick={() => createOpt()}>
          Add Option
        </Button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ComponentsAdminPage() {
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null)   // component for option panel
  const [editTarget, setEditTarget]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading, refetch } = useComponents({
    skip: (page - 1) * 50, take: 50,
    ...(search ? { search: `componentkey=${search}` } : {}),
  })

  const { mutate: create, isPending: creating } = useMutationWithInvalidation(
    uiAdminApi.components.create, ['admin-components'], 'Component created')
  const { mutate: update, isPending: updating } = useMutationWithInvalidation(
    ({ id, data }) => uiAdminApi.components.update(id, data), ['admin-components'], 'Updated')
  const { mutate: remove, isPending: deleting } = useMutationWithInvalidation(
    (id) => uiAdminApi.components.delete(id), ['admin-components'], 'Deleted')

  const items = data?.items || []

  const columns = [
    { key: 'id',            label: 'ID',       width: 55, type: 'mono' },
    { key: 'componentKey',  label: 'Key',      width: 200, type: 'mono',
      render: (r) => <span className="text-xs font-mono text-text-secondary">{r.componentKey}</span> },
    { key: 'componentType', label: 'Type',     width: 130,
      render: (r) => <Badge value={r.componentType} label={r.componentType} colorTag="blue" /> },
    { key: 'screen',        label: 'Screen',   width: 150,
      render: (r) => <span className="text-xs text-text-muted">{r.screen || 'global'}</span> },
    { key: 'label',         label: 'Label',    width: 150 },
    { key: 'isVisible',     label: 'Visible',  width: 70, type: 'custom',
      render: (r) => <Badge value={r.isVisible ? 'yes' : 'no'} label={r.isVisible ? 'Yes' : 'No'}
        colorTag={r.isVisible ? 'green' : 'gray'} /> },
    { key: '__actions',     label: '',         width: 100, type: 'custom',
      render: (r) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <Button size="xs" variant="ghost" icon={ChevronRight} onClick={() => setSelected(r)}>
            Options
          </Button>
          <button onClick={() => setDeleteTarget(r)}
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      )
    },
  ]

  return (
    <PageLayout
      title="Components"
      subtitle="Badge sets, dropdowns, status maps used across all screens"
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search key…"
              className="h-8 pl-8 pr-3 w-44 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button size="sm" icon={Plus} onClick={() => setEditTarget(true)}>New Component</Button>
        </div>
      }
    >
      <DataTable columns={columns} data={items}
        pagination={data?.pagination} onPageChange={setPage}
        loading={isLoading} emptyMessage="No components." />

      {/* Create modal */}
      <Modal open={editTarget === true} onClose={() => setEditTarget(null)}
        title="New UI Component" size="md"
        footer={null}>
        <ComponentForm onSubmit={(d) => create(d, { onSuccess: () => setEditTarget(null) })}
          isPending={creating} onClose={() => setEditTarget(null)} />
      </Modal>

      {/* Options panel */}
      <Modal open={!!selected} onClose={() => setSelected(null)}
        title={`Options — ${selected?.componentKey}`} size="lg">
        {selected && <OptionPanel component={selected} onClose={() => setSelected(null)} />}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove(deleteTarget?.id, { onSuccess: () => setDeleteTarget(null) })}
        loading={deleting} title="Delete Component" variant="danger" confirmLabel="Delete"
        message={`Delete "${deleteTarget?.componentKey}"? All its options will be deleted too.`} />
    </PageLayout>
  )
}

function ComponentForm({ item, onSubmit, isPending, onClose }) {
  const [form, setForm] = useState({
    componentKey:  item?.componentKey  || '',
    componentType: item?.componentType || 'BADGE_SET',
    screen:        item?.screen        || '',
    module:        item?.module        || '',
    label:         item?.label         || '',
    isVisible:     item?.isVisible     ?? true,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Component Key *" value={form.componentKey}
          onChange={e => set('componentKey', e.target.value)}
          placeholder="vendor_status" disabled={!!item} />
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Type *</label>
          <select value={form.componentType} onChange={e => set('componentType', e.target.value)}
            className="w-full h-8 rounded-md border border-border bg-surface-raised px-2 text-sm text-text-primary focus:outline-none">
            {COMPONENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Screen" value={form.screen}
          onChange={e => set('screen', e.target.value)} placeholder="vendor_list" />
        <Input label="Label" value={form.label}
          onChange={e => set('label', e.target.value)} placeholder="Vendor Status" />
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending}
          onClick={() => { if (!form.componentKey.trim()) { toast.error('Key required'); return } onSubmit(form) }}>
          Create
        </Button>
      </div>
    </div>
  )
}
