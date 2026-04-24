import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, RefreshCw, Pencil, Trash2, Search,
  ToggleLeft, ToggleRight, ChevronRight, Menu,
} from 'lucide-react'
import { uiAdminApi } from '../../../api/uiConfig.api'
import { PageLayout }   from '../../../components/layout/PageLayout'
import { DataTable }    from '../../../components/ui/DataTable'
import { Button }       from '../../../components/ui/Button'
import { Badge }        from '../../../components/ui/Badge'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Input }        from '../../../components/ui/Input'
import { cn }           from '../../../lib/cn'
import toast            from 'react-hot-toast'

// ─── Icon quick-picks (free text also accepted) ───────────────────────────────
const COMMON_ICONS = [
  'LayoutDashboard','Users','Shield','Building2','FileText','Settings','GitBranch',
  'Play','Pause','BarChart2','ClipboardList','ClipboardCheck','Search','Bell',
  'Mail','Lock','Zap','Globe','Database','Activity','TrendingUp','Package',
  'PlusCircle','Eye','Edit3','Trash2','Download','Upload','Link','Flag',
  'CheckCircle2','XCircle','AlertCircle','Clock','Calendar','Book','Folder',
  'ToggleRight','Palette','Menu','Layers','FormInput','UserPlus','FileEdit',
  'ShieldCheck','Inbox','FolderOpen','AlertTriangle','FileUp','Paperclip',
  'CreditCard','Tag','BookOpen','LayoutTemplate','GitMerge','CheckSquare',
]

// Sides are a fixed backend enum — always a closed select.
const SIDES = ['SYSTEM','ORGANIZATION','VENDOR','AUDITOR','AUDITEE']

// ─── Hooks ────────────────────────────────────────────────────────────────────
// Fetch ALL nav items (large take) so we can derive modules + keys for datalists
const useAllNavItems = () => useQuery({
  queryKey: ['admin-nav-all'],
  queryFn:  () => uiAdminApi.navigation.list({ skip: 0, take: 500 }),
  staleTime: 60 * 1000,
})

const useNavItems = (params) => useQuery({
  queryKey: ['admin-nav', params],
  queryFn:  () => uiAdminApi.navigation.list(params),
  keepPreviousData: true,
})

function useCreateNav() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: uiAdminApi.navigation.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-nav'] })
      qc.invalidateQueries({ queryKey: ['admin-nav-all'] })
      toast.success('Nav item created')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}
function useUpdateNav() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => uiAdminApi.navigation.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-nav'] })
      qc.invalidateQueries({ queryKey: ['admin-nav-all'] })
      toast.success('Updated')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}
function useDeleteNav() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => uiAdminApi.navigation.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-nav'] })
      qc.invalidateQueries({ queryKey: ['admin-nav-all'] })
      toast.success('Deleted')
    },
    onError: (e) => toast.error(e?.message || 'Failed'),
  })
}

// ─── Nav Form ─────────────────────────────────────────────────────────────────
// allItems — full nav list used to populate datalists for module and parentKey.
// Both are free-text with suggestions — no hardcoded list anywhere.
function NavForm({ item, onSubmit, isPending, onClose, allItems = [] }) {
  const [form, setForm] = useState({
    navKey:             item?.navKey             || '',
    label:              item?.label              || '',
    icon:               item?.icon               || '',
    route:              item?.route              || '',
    parentKey:          item?.parentKey          || null,
    sortOrder:          item?.sortOrder          ?? '',
    module:             item?.module             || '',
    allowedSides:       item?.allowedSides       || '',
    minLevel:           item?.minLevel           || null,
    requiredPermission: item?.requiredPermission || null,
    badgeCountEndpoint: item?.badgeCountEndpoint || null,
    isActive:           item?.isActive           ?? true,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Unique sorted module values from actual DB rows — no hardcoding
  const existingModules = [...new Set(
    allItems.map(n => n.module).filter(Boolean)
  )].sort()

  // Existing nav keys for parent key suggestion — excluding self
  const existingKeys = allItems
    .filter(n => n.navKey !== item?.navKey)
    .map(n => ({ key: n.navKey, label: `${n.navKey}  (${n.label})` }))
    .sort((a, b) => a.key.localeCompare(b.key))

  const handleSubmit = () => {
    if (!form.navKey.trim()) { toast.error('Nav key required'); return }
    if (!form.label.trim())  { toast.error('Label required');  return }
    if (!form.route.trim())  { toast.error('Route required');  return }
    onSubmit({
        ...form,
        sortOrder:          form.sortOrder !== '' ? parseInt(form.sortOrder) : undefined,
        parentKey:          form.parentKey          || null,
        requiredPermission: form.requiredPermission || null,
        badgeCountEndpoint: form.badgeCountEndpoint || null,
        minLevel:           form.minLevel           || null,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Nav Key + Label */}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Nav Key *" value={form.navKey}
          onChange={e => set('navKey', e.target.value)}
          placeholder="org_vendors" disabled={!!item}
          helperText="snake_case — cannot change after creation" />
        <Input label="Label *" value={form.label}
          onChange={e => set('label', e.target.value)} placeholder="Vendors" />
      </div>

      {/* Route + Parent Key */}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Route *" value={form.route}
          onChange={e => set('route', e.target.value)} placeholder="/tprm/vendors" />

        {/* Parent Key — datalist of existing nav keys */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Parent Key
          </label>
          <input
            list="parent-key-options"
            value={form.parentKey}
            onChange={e => set('parentKey', e.target.value)}
            placeholder="Blank = top-level item"
            className="h-8 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <datalist id="parent-key-options">
            <option value="" />
            {existingKeys.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </datalist>
          <p className="text-[10px] text-text-muted">Type or pick an existing nav key</p>
        </div>
      </div>

      {/* Icon — free text + quick-pick chips */}
      <div>
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-2">
          Icon <span className="text-text-muted font-normal normal-case">(Lucide icon name)</span>
        </label>
        <Input value={form.icon} onChange={e => set('icon', e.target.value)}
          placeholder="e.g. Shield, Users, BarChart2" />
        <div className="flex flex-wrap gap-1.5 mt-2 max-h-28 overflow-y-auto">
          {COMMON_ICONS.map(ic => (
            <button key={ic} onClick={() => set('icon', ic)} type="button"
              className={cn('px-2 py-0.5 rounded text-[10px] font-mono border transition-colors',
                form.icon === ic
                  ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                  : 'border-border text-text-muted hover:text-text-primary hover:bg-surface-overlay')}>
              {ic}
            </button>
          ))}
        </div>
      </div>

      {/* Sides + Module + Sort Order */}
      <div className="grid grid-cols-3 gap-3">

        {/* Allowed Sides — fixed backend enum, closed select */}
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">
            Allowed Sides
          </label>
          <select value={form.allowedSides} onChange={e => set('allowedSides', e.target.value)}
            className="w-full h-8 rounded-md border border-border bg-surface-raised px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="">All sides</option>
            {SIDES.map(s => <option key={s} value={s}>{s}</option>)}
            <option value="ORGANIZATION,SYSTEM">ORG + SYSTEM</option>
          </select>
        </div>

        {/* Module — datalist: existing values as suggestions, free text allowed */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Module Group
          </label>
          <input
            list="module-options"
            value={form.module}
            onChange={e => set('module', e.target.value)}
            placeholder="e.g. THIRD-PARTY RISK"
            className="h-8 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <datalist id="module-options">
            {existingModules.map(m => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <p className="text-[10px] text-text-muted">Pick existing or type a new group name</p>
        </div>

        <Input label="Sort Order" type="number" value={form.sortOrder}
          onChange={e => set('sortOrder', e.target.value)} placeholder="100" />
      </div>

      {/* Permission + Badge */}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Required Permission" value={form.requiredPermission}
          onChange={e => set('requiredPermission', e.target.value)}
          placeholder="MANAGE_VENDORS (optional)" />
        <Input label="Badge Count Endpoint" value={form.badgeCountEndpoint}
          onChange={e => set('badgeCountEndpoint', e.target.value)}
          placeholder="/v1/vendors?take=1 (optional)" />
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-3">
        <button onClick={() => set('isActive', !form.isActive)} type="button"
          className={cn('flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors',
            form.isActive
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-surface-overlay border-border text-text-muted')}>
          {form.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          {form.isActive ? 'Active — visible in sidebar' : 'Inactive — hidden from sidebar'}
        </button>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={handleSubmit}>
          {item ? 'Save Changes' : 'Create'}
        </Button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NavigationAdminPage() {
  const [page, setPage]               = useState(1)
  const [search, setSearch]           = useState('')
  const [editTarget, setEditTarget]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading, refetch }  = useNavItems({
    skip: (page - 1) * 50, take: 50,
    ...(search ? { search: `label=${search}` } : {}),
  })
  // Full list for datalist population — fetched separately with large take
  const { data: allData } = useAllNavItems()
  const allItems = allData?.items || []

  const { mutate: create, isPending: creating } = useCreateNav()
  const { mutate: update, isPending: updating } = useUpdateNav()
  const { mutate: remove, isPending: deleting } = useDeleteNav()

  const items = data?.items || []

  const columns = [
    { key: 'id',           label: 'ID',      width: 55,  type: 'mono' },
    { key: 'navKey',       label: 'Key',      width: 180, type: 'custom',
      render: (r) => <span className="text-xs font-mono text-text-secondary">{r.navKey}</span> },
    { key: 'label',        label: 'Label',    width: 150 },
    { key: 'icon',         label: 'Icon',     width: 110, type: 'custom',
      render: (r) => <span className="text-xs font-mono text-text-muted">{r.icon || '—'}</span> },
    { key: 'route',        label: 'Route',    width: 200, type: 'custom',
      render: (r) => <span className="text-xs font-mono text-brand-400">{r.route}</span> },
    { key: 'module',       label: 'Module',   width: 140, type: 'custom',
      render: (r) => <span className="text-[11px] text-text-muted">{r.module || '—'}</span> },
    { key: 'allowedSides', label: 'Sides',    width: 120, type: 'custom',
      render: (r) => r.allowedSides
        ? <Badge value={r.allowedSides} label={r.allowedSides} colorTag="blue" />
        : <span className="text-[11px] text-text-muted">All</span> },
    { key: 'sortOrder',    label: 'Order',    width: 60,  type: 'mono' },
    { key: 'isActive',     label: 'Active',   width: 70,  type: 'custom',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); update({ id: r.id, data: { isActive: !r.isActive } }) }}
          className={cn('flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded transition-colors',
            r.isActive ? 'text-green-400 hover:bg-green-500/10' : 'text-text-muted hover:bg-surface-overlay')}>
          {r.isActive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
        </button>
      )
    },
    { key: '__actions',    label: '',         width: 70,  type: 'custom',
      render: (r) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => setEditTarget(r)}
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
            <Pencil size={12} />
          </button>
          <button onClick={() => setDeleteTarget(r)}
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      )
    },
  ]

  const handleSubmit = (formData) => {
    if (editTarget === true) {
      create(formData, { onSuccess: () => setEditTarget(null) })
    } else {
      update({ id: editTarget.id, data: formData }, { onSuccess: () => setEditTarget(null) })
    }
  }

  return (
    <PageLayout
      title="Navigation"
      subtitle={`${data?.pagination?.totalItems ?? items.length} items`}
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search label…"
              className="h-8 pl-8 pr-3 w-44 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button size="sm" icon={Plus} onClick={() => setEditTarget(true)}>Add Item</Button>
        </div>
      }
    >
      <DataTable columns={columns} data={items}
        pagination={data?.pagination} onPageChange={setPage}
        loading={isLoading} emptyMessage="No navigation items." />

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)}
        title={editTarget === true ? 'New Navigation Item' : `Edit — ${editTarget?.label}`}
        subtitle={editTarget !== true ? `navKey: ${editTarget?.navKey}` : undefined}
        size="lg">
        {editTarget && (
          <NavForm
            item={editTarget === true ? null : editTarget}
            onSubmit={handleSubmit}
            isPending={creating || updating}
            onClose={() => setEditTarget(null)}
            allItems={allItems}
          />
        )}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove(deleteTarget?.id, { onSuccess: () => setDeleteTarget(null) })}
        loading={deleting} title="Delete Nav Item" variant="danger" confirmLabel="Delete"
        message={`Delete "${deleteTarget?.label}" (${deleteTarget?.navKey})? This removes it from all user sidebars.`} />
    </PageLayout>
  )
}