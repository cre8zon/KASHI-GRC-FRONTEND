import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, RefreshCw, Pencil, Trash2, Search, Globe, Lock,
  ToggleLeft, ToggleRight, Copy, CheckSquare, Square, AlertTriangle,
  ChevronDown, Zap, Shield, X, Check,
} from 'lucide-react'
import { uiAdminApi }  from '../../../api/uiConfig.api'
import { rbacApi }     from '../../../api/rbac.api'
import { PageLayout }  from '../../../components/layout/PageLayout'
import { DataTable }   from '../../../components/ui/DataTable'
import { Button }      from '../../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Input }       from '../../../components/ui/Input'
import { cn }          from '../../../lib/cn'
import toast           from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────

const HTTP_METHODS  = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const VARIANTS      = ['primary', 'secondary', 'danger', 'warning', 'ghost', 'outline']
const SIDES         = ['ORGANIZATION', 'SYSTEM', 'AUDITOR', 'AUDITEE', 'VENDOR']
const ALL_SIDES_VAL = 'ORGANIZATION,SYSTEM,AUDITOR,AUDITEE,VENDOR'

const SIDE_STYLE = {
  ORGANIZATION: 'bg-blue-500/15 text-blue-400',
  SYSTEM:       'bg-purple-500/15 text-purple-400',
  AUDITOR:      'bg-teal-500/15 text-teal-400',
  AUDITEE:      'bg-green-500/15 text-green-400',
  VENDOR:       'bg-orange-500/15 text-orange-400',
}

const METHOD_STYLE = {
  GET:    'text-green-400  bg-green-500/10',
  POST:   'text-blue-400   bg-blue-500/10',
  PUT:    'text-amber-400  bg-amber-500/10',
  PATCH:  'text-orange-400 bg-orange-500/10',
  DELETE: 'text-red-400    bg-red-500/10',
}

const VARIANT_STYLE = {
  primary:   'bg-brand-500/15 text-brand-400 border-brand-500/20',
  secondary: 'bg-surface-overlay text-text-secondary border-border',
  danger:    'bg-red-500/15 text-red-400 border-red-500/20',
  warning:   'bg-amber-500/15 text-amber-400 border-amber-500/20',
  ghost:     'bg-transparent text-text-muted border-border',
  outline:   'bg-transparent text-text-primary border-border',
}

// ─── JSON Validator ────────────────────────────────────────────────────────────

function JsonTextarea({ label, value, onChange, placeholder, helperText }) {
  const [error, setError] = useState('')

  const handleChange = (val) => {
    onChange(val)
    if (!val.trim()) { setError(''); return }
    try { JSON.parse(val); setError('') }
    catch (e) { setError(e.message) }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
        {label}
      </label>
      <textarea
        value={value}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={cn(
          'w-full rounded-md border bg-surface-raised px-3 py-2 text-xs font-mono text-text-primary',
          'placeholder:text-text-muted focus:outline-none focus:ring-1 resize-y',
          error
            ? 'border-red-500/50 focus:ring-red-500/50'
            : 'border-border focus:ring-brand-500'
        )}
      />
      {error && <p className="text-[10px] text-red-400">⚠ Invalid JSON: {error}</p>}
      {!error && helperText && <p className="text-[10px] text-text-muted">{helperText}</p>}
    </div>
  )
}

// ─── Side Selector ─────────────────────────────────────────────────────────────

function SideSelector({ value, onChange }) {
  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : []

  const toggle = (side) => {
    const next = selected.includes(side)
      ? selected.filter(s => s !== side)
      : [...selected, side]
    onChange(next.join(','))
  }

  const allSelected = SIDES.every(s => selected.includes(s))

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Allowed Sides
        </label>
        <button
          onClick={() => onChange(allSelected ? '' : ALL_SIDES_VAL)}
          className="text-[10px] text-text-muted hover:text-brand-400 transition-colors"
        >
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SIDES.map(s => (
          <button
            key={s}
            onClick={() => toggle(s)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold uppercase tracking-wide transition-colors',
              selected.includes(s)
                ? SIDE_STYLE[s] + ' border-current/30'
                : 'border-border text-text-muted hover:text-text-secondary'
            )}
          >
            {selected.includes(s) ? <Check size={9} /> : null}
            {s.slice(0, 3)}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Permission Picker (inline searchable select) ──────────────────────────────

function PermissionSelect({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data } = useQuery({
    queryKey: ['rbac-perms-for-actions'],
    queryFn:  () => rbacApi.permissions.list({ take: 500 }),
    staleTime: 5 * 60_000,
    select: d => {
      const items = d?.items || d || []
      const groups = {}
      items.forEach(p => {
        const mod = p.module || 'OTHER'
        if (!groups[mod]) groups[mod] = []
        groups[mod].push(p)
      })
      return { items, groups }
    },
  })

  const filtered = useMemo(() => {
    if (!data?.groups) return {}
    if (!search.trim()) return data.groups
    const q = search.toLowerCase()
    const out = {}
    Object.entries(data.groups).forEach(([mod, perms]) => {
      const m = perms.filter(p => p.code.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q))
      if (m.length) out[mod] = m
    })
    return out
  }, [data, search])

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
        Required Permission
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full h-8 flex items-center justify-between gap-2 px-3 rounded-md border border-border bg-surface-raised text-sm hover:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <span className={cn('flex items-center gap-1.5 text-xs', !value && 'text-text-muted')}>
            <Shield size={11} className={value ? 'text-brand-400' : 'text-text-muted'} />
            <span className="font-mono">{value || 'None — side-gated only'}</span>
          </span>
          <div className="flex items-center gap-1">
            {value && (
              <span onClick={e => { e.stopPropagation(); onChange('') }}
                className="p-0.5 rounded hover:text-red-400 text-text-muted cursor-pointer">
                <X size={11} />
              </span>
            )}
            <ChevronDown size={11} className="text-text-muted" />
          </div>
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-surface-raised shadow-xl">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search permissions…"
                  className="w-full h-6 pl-6 pr-2 rounded border border-border bg-surface text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              <button onClick={() => { onChange(''); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted hover:bg-surface-overlay transition-colors">
                <span className="font-mono">—</span> None
              </button>
              {Object.entries(filtered).map(([mod, perms]) => (
                <div key={mod}>
                  <div className="px-3 py-1 text-[9px] font-bold text-text-muted uppercase tracking-widest bg-surface-overlay/60 border-y border-border/40">
                    {mod}
                  </div>
                  {perms.map(p => (
                    <button key={p.id} onClick={() => { onChange(p.code); setOpen(false); setSearch('') }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-overlay transition-colors',
                        value === p.code ? 'bg-brand-500/10' : ''
                      )}>
                      <span className={cn('font-mono text-[11px]', value === p.code ? 'text-brand-400' : 'text-text-primary')}>
                        {p.code}
                      </span>
                      <span className="text-[10px] text-text-muted truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Action Form ───────────────────────────────────────────────────────────────

function ActionForm({ item, allActions, onSubmit, isPending, onClose }) {
  const isEdit = !!item && item !== true

  const [form, setForm] = useState({
    actionKey:           isEdit ? item.actionKey           : '',
    label:               isEdit ? item.label               : '',
    screenKey:           isEdit ? item.screenKey           : '',
    allowedSides:        isEdit ? item.allowedSides        : 'ORGANIZATION,SYSTEM',
    httpMethod:          isEdit ? item.httpMethod          : 'POST',
    apiEndpoint:         isEdit ? (item.apiEndpoint || '') : '',
    icon:                isEdit ? (item.icon || '')        : '',
    variant:             isEdit ? (item.variant || 'primary') : 'primary',
    sortOrder:           isEdit ? item.sortOrder           : '',
    requiredPermission:  isEdit ? (item.requiredPermission || '') : '',
    allowedStatusesJson: isEdit ? (item.allowedStatusesJson || '') : '',
    payloadTemplateJson: isEdit ? (item.payloadTemplateJson || '') : '',
    confirmationMessage: isEdit ? (item.confirmationMessage || '') : '',
    requiresConfirmation: isEdit ? item.requiresConfirmation : false,
    requiresRemarks:     isEdit ? item.requiresRemarks     : false,
    isActive:            isEdit ? item.isActive            : true,
    isGlobal:            isEdit ? !item.tenantId           : true,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Derive distinct screen keys for autocomplete
  const screenKeys = [...new Set(allActions.map(a => a.screenKey).filter(Boolean))].sort()

  const isJsonValid = (str) => {
    if (!str?.trim()) return true
    try { JSON.parse(str); return true } catch { return false }
  }

  const handleSubmit = () => {
    if (!form.actionKey.trim()) { toast.error('Action key required'); return }
    if (!form.label.trim())     { toast.error('Label required'); return }
    if (!form.screenKey.trim()) { toast.error('Screen key required'); return }
    if (!isJsonValid(form.payloadTemplateJson)) { toast.error('Payload JSON is invalid'); return }
    if (!isJsonValid(form.allowedStatusesJson)) { toast.error('Statuses JSON is invalid'); return }

    onSubmit({
      ...form,
      sortOrder:    form.sortOrder !== '' ? parseInt(form.sortOrder) : 0,
      apiEndpoint:  form.apiEndpoint  || null,
      payloadTemplateJson: form.payloadTemplateJson || null,
      allowedStatusesJson: form.allowedStatusesJson || null,
      confirmationMessage: form.confirmationMessage || null,
      requiredPermission:  form.requiredPermission  || null,
      tenantId:     form.isGlobal ? null : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Row 1 — key + label */}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Action Key *" value={form.actionKey}
          onChange={e => set('actionKey', e.target.value.toUpperCase().replace(/\s/g,'_'))}
          placeholder="CREATE_ISSUE" disabled={isEdit}
          helperText="SCREAMING_SNAKE — cannot change after creation" />
        <Input label="Label *" value={form.label}
          onChange={e => set('label', e.target.value)} placeholder="New Issue" />
      </div>

      {/* Row 2 — screen key + icon + sort */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Screen Key *
          </label>
          <input
            list="screen-key-options"
            value={form.screenKey}
            onChange={e => set('screenKey', e.target.value)}
            placeholder="issue_list"
            className="h-8 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <datalist id="screen-key-options">
            {screenKeys.map(k => <option key={k} value={k} />)}
          </datalist>
        </div>
        <Input label="Icon" value={form.icon}
          onChange={e => set('icon', e.target.value)} placeholder="Plus, Trash2…" />
        <Input label="Sort Order" type="number" value={form.sortOrder}
          onChange={e => set('sortOrder', e.target.value)} placeholder="10" />
      </div>

      {/* Row 3 — method + endpoint */}
      <div className="grid grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            HTTP Method
          </label>
          <select value={form.httpMethod} onChange={e => set('httpMethod', e.target.value)}
            className="h-8 rounded-md border border-border bg-surface-raised px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="col-span-3">
          <Input label="API Endpoint" value={form.apiEndpoint}
            onChange={e => set('apiEndpoint', e.target.value)}
            placeholder="/v1/issues/{id}/close  (blank = form-opening action)"
            helperText="Use {id}, {entityId}, {taskId} as path params. Leave blank for __formKey actions." />
        </div>
      </div>

      {/* Row 4 — variant + permission */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Variant
          </label>
          <div className="flex flex-wrap gap-1.5">
            {VARIANTS.map(v => (
              <button key={v} onClick={() => set('variant', v)}
                className={cn(
                  'px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors',
                  form.variant === v
                    ? VARIANT_STYLE[v] || 'bg-brand-500/15 text-brand-400 border-brand-500/20'
                    : 'border-border text-text-muted hover:text-text-secondary'
                )}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <PermissionSelect value={form.requiredPermission} onChange={v => set('requiredPermission', v)} />
      </div>

      {/* Row 5 — sides */}
      <SideSelector value={form.allowedSides} onChange={v => set('allowedSides', v)} />

      {/* Row 6 — JSON fields */}
      <div className="grid grid-cols-2 gap-3">
        <JsonTextarea
          label="Payload / Form Key JSON"
          value={form.payloadTemplateJson}
          onChange={v => set('payloadTemplateJson', v)}
          placeholder={'{\n  "__formKey": "issue_create_form"\n}'}
          helperText='__formKey → opens DynamicForm modal. __navRoute → client nav. Omit → direct API call.'
        />
        <JsonTextarea
          label="Allowed Statuses JSON"
          value={form.allowedStatusesJson}
          onChange={v => set('allowedStatusesJson', v)}
          placeholder={'["OPEN", "TRIAGED"]'}
          helperText="Action only shows when entity status is in this list. Empty = always show."
        />
      </div>

      {/* Row 7 — confirmation */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-4">
          <button onClick={() => set('requiresConfirmation', !form.requiresConfirmation)}
            className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors',
              form.requiresConfirmation
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'border-border text-text-muted hover:text-text-secondary')}>
            {form.requiresConfirmation ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
            Requires confirmation dialog
          </button>
          <button onClick={() => set('requiresRemarks', !form.requiresRemarks)}
            className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors',
              form.requiresRemarks
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'border-border text-text-muted hover:text-text-secondary')}>
            {form.requiresRemarks ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
            Requires remarks/notes
          </button>
        </div>
        {form.requiresConfirmation && (
          <Input label="Confirmation Message"
            value={form.confirmationMessage}
            onChange={e => set('confirmationMessage', e.target.value)}
            placeholder="Are you sure you want to close this issue?" />
        )}
      </div>

      {/* Row 8 — active + global toggles */}
      <div className="flex items-center gap-3 p-3 bg-surface-overlay rounded-lg border border-border">
        <button onClick={() => set('isActive', !form.isActive)}
          className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors',
            form.isActive
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'border-border text-text-muted')}>
          {form.isActive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
          {form.isActive ? 'Active' : 'Inactive'}
        </button>

        <button onClick={() => set('isGlobal', !form.isGlobal)}
          className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors',
            form.isGlobal
              ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
              : 'border-amber-500/10 border-amber-500/30 text-amber-400')}>
          {form.isGlobal ? <Globe size={13} /> : <Lock size={13} />}
          {form.isGlobal ? 'Global (tenant_id = NULL)' : 'Tenant-scoped'}
        </button>

        <span className="text-[10px] text-text-muted ml-auto">
          {form.isGlobal
            ? 'Visible to all tenants — recommended for all platform actions'
            : 'Only visible to the current tenant — use for tenant customisations'}
        </span>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={handleSubmit}>
          {isEdit ? 'Save Changes' : 'Create Action'}
        </Button>
      </div>
    </div>
  )
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useActions = (params) => useQuery({
  queryKey: ['admin-actions', params],
  queryFn:  () => uiAdminApi.actions.list
    ? uiAdminApi.actions.list(params)
    : import('../../../config/axios.config').then(m =>
        m.default.get('/v1/admin/ui/actions', { params })),
  keepPreviousData: true,
  select: d => {
    const raw = d?.data ?? d
    return { items: raw?.items || raw || [], pagination: raw?.pagination }
  },
})

const useAllActions = () => useQuery({
  queryKey: ['admin-actions-all'],
  queryFn:  () => import('../../../config/axios.config').then(m =>
    m.default.get('/v1/admin/ui/actions', { params: { take: 500 } })),
  staleTime: 60_000,
  select: d => {
    const raw = d?.data ?? d
    return raw?.items || raw || []
  },
})

function useSaveAction(mode) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mode === 'create'
      ? (data) => uiAdminApi.actions.create(data)
      : ({ id, data }) => uiAdminApi.actions.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-actions'] })
      qc.invalidateQueries({ queryKey: ['admin-actions-all'] })
      toast.success(mode === 'create' ? 'Action created' : 'Action updated')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

function useDeleteAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => uiAdminApi.actions.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-actions'] })
      qc.invalidateQueries({ queryKey: ['admin-actions-all'] })
      toast.success('Deleted')
    },
    onError: (e) => toast.error(e?.message || 'Failed'),
  })
}

function useBulkGlobalise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids) => {
      const api = (await import('../../../config/axios.config')).default
      return Promise.all(ids.map(id => api.put(`/v1/admin/ui/actions/${id}`, { tenantId: null })))
    },
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: ['admin-actions'] })
      qc.invalidateQueries({ queryKey: ['admin-actions-all'] })
      toast.success(`${ids.length} action${ids.length > 1 ? 's' : ''} made global`)
    },
    onError: () => toast.error('Bulk update failed'),
  })
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UiActionsAdminPage() {
  const [page,          setPage]          = useState(1)
  const [search,        setSearch]        = useState('')
  const [screenFilter,  setScreenFilter]  = useState('')
  const [sideFilter,    setSideFilter]    = useState('')
  const [activeFilter,  setActiveFilter]  = useState('')
  const [globalFilter,  setGlobalFilter]  = useState('')
  const [editTarget,    setEditTarget]    = useState(null)
  const [deleteTarget,  setDeleteTarget]  = useState(null)
  const [selected,      setSelected]      = useState(new Set())

  const params = {
    skip: (page - 1) * 50, take: 50,
    ...(search       ? { search }                      : {}),
    ...(screenFilter ? { screenKey: screenFilter }     : {}),
    ...(sideFilter   ? { allowedSides: sideFilter }    : {}),
    ...(activeFilter ? { isActive: activeFilter }      : {}),
    ...(globalFilter ? { isGlobal: globalFilter }      : {}),
  }

  const { data, isLoading, refetch }  = useActions(params)
  const { data: allActions = [] }     = useAllActions()
  const { mutate: save, isPending: saving } = useSaveAction(editTarget === true ? 'create' : 'update')
  const { mutate: remove, isPending: deleting } = useDeleteAction()
  const { mutate: bulkGlobalise, isPending: globalising } = useBulkGlobalise()

  const items = data?.items || []

  // Distinct screen keys for filter dropdown
  const screenKeys = useMemo(() =>
    [...new Set(allActions.map(a => a.screenKey).filter(Boolean))].sort()
  , [allActions])

  // Selection helpers
  const allPageSelected = items.length > 0 && items.every(r => selected.has(r.id))
  const toggleSelectAll = () => {
    if (allPageSelected) setSelected(prev => { const n = new Set(prev); items.forEach(r => n.delete(r.id)); return n })
    else setSelected(prev => { const n = new Set(prev); items.forEach(r => n.add(r.id)); return n })
  }
  const toggleSelect = (id) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const handleSubmit = (formData) => {
    if (editTarget === true) {
      save(formData, { onSuccess: () => setEditTarget(null) })
    } else {
      save({ id: editTarget.id, data: formData }, { onSuccess: () => setEditTarget(null) })
    }
  }

  const problemCount = items.filter(r =>
    !r.screenKey || !r.isActive === undefined || (r.tenantId && r.tenantId !== null)
  ).length

  const columns = [
    // Checkbox
    {
      key: '__check', label: () => (
        <button onClick={toggleSelectAll} className="text-text-muted hover:text-text-primary">
          {allPageSelected ? <CheckSquare size={13} /> : <Square size={13} />}
        </button>
      ), width: 36, type: 'custom',
      render: (r) => (
        <button onClick={e => { e.stopPropagation(); toggleSelect(r.id) }}
          className="text-text-muted hover:text-text-primary">
          {selected.has(r.id) ? <CheckSquare size={13} className="text-brand-400" /> : <Square size={13} />}
        </button>
      ),
    },
    // ID
    { key: 'id', label: 'ID', width: 42, type: 'mono' },
    // Action key + label
    {
      key: 'actionKey', label: 'Action', width: 210, type: 'custom',
      render: (r) => (
        <div className="min-w-0">
          <p className="text-xs font-mono text-text-primary truncate">{r.actionKey}</p>
          <p className="text-[10px] text-text-muted truncate">{r.label}</p>
        </div>
      ),
    },
    // Screen key
    {
      key: 'screenKey', label: 'Screen', width: 180, type: 'custom',
      render: (r) => (
        <span className={cn(
          'text-[11px] font-mono',
          !r.screenKey ? 'text-red-400' : 'text-text-secondary'
        )}>
          {r.screenKey || '⚠ MISSING'}
        </span>
      ),
    },
    // Method + endpoint
    {
      key: 'apiEndpoint', label: 'Method / Endpoint', width: 220, type: 'custom',
      render: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {r.httpMethod && (
              <span className={cn('text-[9px] font-bold px-1 py-0.5 rounded uppercase',
                METHOD_STYLE[r.httpMethod] || 'bg-gray-500/15 text-gray-400')}>
                {r.httpMethod}
              </span>
            )}
            <span className="text-[10px] font-mono text-text-muted truncate">
              {r.apiEndpoint || (r.payloadTemplateJson?.includes('__formKey') ? '(form)' :
               r.payloadTemplateJson?.includes('__navRoute') ? '(nav)' : '—')}
            </span>
          </div>
        </div>
      ),
    },
    // Permission
    {
      key: 'requiredPermission', label: 'Permission', width: 160, type: 'custom',
      render: (r) => r.requiredPermission
        ? <span className="text-[10px] font-mono text-brand-400">{r.requiredPermission}</span>
        : <span className="text-[10px] text-text-muted">—</span>,
    },
    // Sides
    {
      key: 'allowedSides', label: 'Sides', width: 110, type: 'custom',
      render: (r) => {
        if (!r.allowedSides) return <span className="text-[10px] text-amber-400">⚠ none</span>
        return (
          <div className="flex flex-wrap gap-0.5">
            {r.allowedSides.split(',').map(s => (
              <span key={s} className={cn('text-[8px] font-bold px-1 py-0.5 rounded uppercase',
                SIDE_STYLE[s.trim()] || 'bg-gray-500/15 text-gray-400')}>
                {s.trim().slice(0, 3)}
              </span>
            ))}
          </div>
        )
      },
    },
    // Variant
    {
      key: 'variant', label: 'Variant', width: 80, type: 'custom',
      render: (r) => r.variant
        ? <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', VARIANT_STYLE[r.variant] || 'border-border text-text-muted')}>
            {r.variant}
          </span>
        : null,
    },
    // Global / tenant badge + inline toggle
    {
      key: 'tenantId', label: 'Scope', width: 80, type: 'custom',
      render: (r) => (
        <button
          title={r.tenantId ? `tenant_id=${r.tenantId} — click to globalise` : 'Global'}
          onClick={e => {
            e.stopPropagation()
            if (r.tenantId) bulkGlobalise([r.id])
          }}
          className={cn(
            'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors',
            r.tenantId
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
              : 'bg-purple-500/10 border-purple-500/20 text-purple-400 cursor-default'
          )}>
          {r.tenantId ? <Lock size={9} /> : <Globe size={9} />}
          {r.tenantId ? `t=${r.tenantId}` : 'global'}
        </button>
      ),
    },
    // Active toggle
    {
      key: 'isActive', label: 'On', width: 45, type: 'custom',
      render: (r) => (
        <button
          onClick={e => {
            e.stopPropagation()
            uiAdminApi.actions.update(r.id, { isActive: !r.isActive })
              .then(() => refetch())
              .catch(() => toast.error('Failed'))
          }}
          className={cn('flex items-center gap-1 text-[11px] px-1 py-0.5 rounded transition-colors',
            r.isActive ? 'text-green-400 hover:bg-green-500/10' : 'text-text-muted hover:bg-surface-overlay')}>
          {r.isActive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
        </button>
      ),
    },
    // Row actions
    {
      key: '__actions', label: '', width: 60, type: 'custom',
      render: (r) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => setEditTarget(r)}
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
            <Pencil size={11} />
          </button>
          <button onClick={() => setDeleteTarget(r)}
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={11} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <PageLayout
      title="Actions"
      subtitle={`${data?.pagination?.totalItems ?? items.length} actions`}
      actions={
        <div className="flex items-center gap-2">

          {/* Problem indicator */}
          {problemCount > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px]">
              <AlertTriangle size={11} /> {problemCount} need attention
            </div>
          )}

          {/* Bulk globalise */}
          {selected.size > 0 && (
            <Button size="sm" variant="secondary" icon={Globe}
              loading={globalising}
              onClick={() => bulkGlobalise([...selected], { onSuccess: () => setSelected(new Set()) })}>
              Make {selected.size} global
            </Button>
          )}

          {/* Filters */}
          <select value={screenFilter} onChange={e => { setScreenFilter(e.target.value); setPage(1) }}
            className="h-8 rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 max-w-[140px]">
            <option value="">All screens</option>
            {screenKeys.map(k => <option key={k} value={k}>{k}</option>)}
          </select>

          <select value={sideFilter} onChange={e => { setSideFilter(e.target.value); setPage(1) }}
            className="h-8 rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="">All sides</option>
            {SIDES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select value={globalFilter} onChange={e => { setGlobalFilter(e.target.value); setPage(1) }}
            className="h-8 rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="">Global + tenant</option>
            <option value="true">Global only</option>
            <option value="false">Tenant-scoped</option>
          </select>

          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search key or label…"
              className="h-8 pl-7 pr-3 w-44 rounded-md border border-border bg-surface-raised text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>

          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button size="sm" icon={Plus} onClick={() => setEditTarget(true)}>New Action</Button>
        </div>
      }
    >
      <DataTable
        columns={columns}
        data={items}
        pagination={data?.pagination}
        onPageChange={setPage}
        loading={isLoading}
        emptyMessage="No actions found."
        onRowClick={r => setEditTarget(r)}
        rowClassName={r => cn(
          !r.isActive && 'opacity-50',
          r.tenantId && 'border-l-2 border-amber-500/40'
        )}
      />

      {/* Edit / Create modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={editTarget === true ? 'New Action' : `Edit — ${editTarget?.actionKey}`}
        subtitle={editTarget !== true
          ? `screen: ${editTarget?.screenKey || '⚠ missing'}`
          : 'Configure a new UI action button'}
        size="lg"
      >
        {editTarget && (
          <ActionForm
            item={editTarget}
            allActions={allActions}
            onSubmit={handleSubmit}
            isPending={saving}
            onClose={() => setEditTarget(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove(deleteTarget?.id, { onSuccess: () => setDeleteTarget(null) })}
        loading={deleting}
        title="Delete Action"
        variant="danger"
        confirmLabel="Delete"
        message={`Delete action "${deleteTarget?.actionKey}" on screen "${deleteTarget?.screenKey}"? This will remove the button from all users immediately.`}
      />
    </PageLayout>
  )
}