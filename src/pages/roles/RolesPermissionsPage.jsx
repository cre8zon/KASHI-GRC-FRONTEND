import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, RefreshCw, Trash2, Pencil, Shield, ShieldCheck,
  Lock, Search, Check, X, ChevronDown, ChevronRight,
  Users, Key,
} from 'lucide-react'
import api from '../../config/axios.config'
import { PageLayout }   from '../../components/layout/PageLayout'
import { Button }       from '../../components/ui/Button'
import { Badge }        from '../../components/ui/Badge'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { Input, Textarea } from '../../components/ui/Input'
import { cn }           from '../../lib/cn'
import { useSelector }  from 'react-redux'
import { selectAuth }   from '../../store/slices/authSlice'
import { usePermission } from '../../hooks/usePermission'
import toast            from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDES  = ['ORGANIZATION', 'VENDOR', 'SYSTEM', 'AUDITOR', 'AUDITEE']
const LEVELS = ['L1', 'L2', 'L3', 'L4']

const SIDE_COLOR = {
  ORGANIZATION: 'blue', VENDOR: 'purple', SYSTEM: 'green',
  AUDITOR: 'cyan', AUDITEE: 'amber',
}

// ─── API ──────────────────────────────────────────────────────────────────────

const permissionsApi = {
  list:   ()           => api.get('/v1/permissions'),
  create: (data)       => api.post('/v1/permissions', data),
  update: (id, data)   => api.put(`/v1/permissions/${id}`, data),
  delete: (id)         => api.delete(`/v1/permissions/${id}`),
}

const rolesApi = {
  hierarchy:         (tenantId, side) => api.get(`/v1/tenants/${tenantId}/roles/hierarchy`, { params: { side } }),
  create:            (tenantId, data) => api.post(`/v1/tenants/${tenantId}/roles`, data),
  delete:            (tenantId, id)   => api.delete(`/v1/tenants/${tenantId}/roles/${id}`),
  updatePermissions: (roleId, data)   => api.put(`/v1/roles/${roleId}/permissions`, data),
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

const usePermissions = () => useQuery({
  queryKey: ['permissions'],
  queryFn:  permissionsApi.list,
  staleTime: 5 * 60 * 1000,
})

const useRoleHierarchy = (tenantId, side) => useQuery({
  queryKey: ['roles-hierarchy', tenantId, side],
  queryFn:  () => rolesApi.hierarchy(tenantId, side),
  enabled:  !!tenantId,
  staleTime: 2 * 60 * 1000,
})

function useCreatePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: permissionsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['permissions'] }); toast.success('Permission created') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

function useDeletePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: permissionsApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['permissions'] }); toast.success('Permission deleted') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tenantId, data }) => rolesApi.create(tenantId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles-hierarchy'] }); toast.success('Role created') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tenantId, roleId }) => rolesApi.delete(tenantId, roleId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles-hierarchy'] }); toast.success('Role deleted') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

function useUpdateRolePermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ roleId, addIds, removeIds }) =>
      rolesApi.updatePermissions(roleId, { addPermissionIds: addIds, removePermissionIds: removeIds }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles-hierarchy'] }); toast.success('Permissions updated') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

// ─── Permission Form ──────────────────────────────────────────────────────────

function PermissionForm({ onSubmit, isPending, onClose }) {
  const [form, setForm] = useState({ code: '', name: '', resourceType: '' })
  const [errors, setErrors] = useState({})
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e = {}
    if (!form.code.trim()) e.code = 'Required'
    if (!form.name.trim()) e.name = 'Required'
    setErrors(e)
    return !Object.keys(e).length
  }

  return (
    <div className="flex flex-col gap-4">
      <Input label="Permission Code *" value={form.code}
        onChange={e => set('code', e.target.value.toUpperCase().replace(/\s/g, '_'))}
        placeholder="e.g. VENDOR_VIEW" error={errors.code}
        helperText="Uppercase snake_case — used in code checks" />
      <Input label="Display Name *" value={form.name}
        onChange={e => set('name', e.target.value)}
        placeholder="e.g. View Vendors" error={errors.name} />
      <Input label="Resource Type" value={form.resourceType}
        onChange={e => set('resourceType', e.target.value.toUpperCase())}
        placeholder="e.g. VENDOR, ASSESSMENT (optional)" />
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending}
          onClick={() => validate() && onSubmit(form)}>
          Create Permission
        </Button>
      </div>
    </div>
  )
}

// ─── Role Form ────────────────────────────────────────────────────────────────

function RoleForm({ side: defaultSide, onSubmit, isPending, onClose }) {
  const [form, setForm] = useState({
    name: '', description: '', side: defaultSide || 'ORGANIZATION',
    level: 'L3', isSystem: false, permissionIds: [],
  })
  const [errors, setErrors] = useState({})
  const { data: permsData } = usePermissions()
  const permissions = permsData?.data || permsData || []
  const [permSearch, setPermSearch] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const togglePerm = (id) => set('permissionIds',
    form.permissionIds.includes(id)
      ? form.permissionIds.filter(x => x !== id)
      : [...form.permissionIds, id]
  )

  const filteredPerms = permissions.filter(p =>
    !permSearch ||
    p.code?.toLowerCase().includes(permSearch.toLowerCase()) ||
    p.name?.toLowerCase().includes(permSearch.toLowerCase())
  )

  // Group by resourceType
  const grouped = filteredPerms.reduce((acc, p) => {
    const key = p.resourceType || 'GENERAL'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Required'
    setErrors(e)
    return !Object.keys(e).length
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Role Name *" value={form.name}
          onChange={e => set('name', e.target.value.toUpperCase().replace(/\s/g, '_'))}
          placeholder="e.g. ORG_MANAGER" error={errors.name} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Side *</label>
          <select value={form.side} onChange={e => set('side', e.target.value)}
            className="h-8 rounded-md border border-border bg-surface-raised px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            {SIDES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Level</label>
          <select value={form.level} onChange={e => set('level', e.target.value)}
            className="h-8 rounded-md border border-border bg-surface-raised px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Type</label>
          <button onClick={() => set('isSystem', !form.isSystem)} type="button"
            className={cn(
              'h-8 flex items-center gap-2 px-3 rounded-md border text-xs font-medium transition-colors',
              form.isSystem
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'border-border text-text-muted hover:bg-surface-overlay'
            )}>
            <Lock size={12} />
            {form.isSystem ? 'System Role (protected)' : 'Custom Role'}
          </button>
        </div>
      </div>

      <Input label="Description" value={form.description}
        onChange={e => set('description', e.target.value)}
        placeholder="Brief description of this role's purpose" />

      {/* Permission picker */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Permissions
            {form.permissionIds.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 text-[10px]">
                {form.permissionIds.length} selected
              </span>
            )}
          </label>
          {form.permissionIds.length > 0 && (
            <button onClick={() => set('permissionIds', [])}
              className="text-[10px] text-text-muted hover:text-red-400 transition-colors">
              Clear all
            </button>
          )}
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input value={permSearch} onChange={e => setPermSearch(e.target.value)}
            placeholder="Search permissions…"
            className="h-7 w-full pl-7 pr-3 rounded-md border border-border bg-surface-raised text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div className="border border-border rounded-lg overflow-hidden max-h-52 overflow-y-auto">
          {Object.entries(grouped).map(([group, perms]) => (
            <div key={group}>
              <div className="px-3 py-1.5 bg-surface-overlay border-b border-border/50 sticky top-0">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{group}</span>
              </div>
              {perms.map(p => {
                const selected = form.permissionIds.includes(p.id)
                return (
                  <button key={p.id} onClick={() => togglePerm(p.id)} type="button"
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-left border-b border-border/30 transition-colors',
                      selected ? 'bg-brand-500/8 text-brand-400' : 'hover:bg-surface-overlay text-text-secondary'
                    )}>
                    <div>
                      <span className="text-xs font-mono">{p.code}</span>
                      <span className="text-[10px] text-text-muted ml-2">{p.name}</span>
                    </div>
                    {selected && <Check size={11} className="shrink-0 text-brand-400" />}
                  </button>
                )
              })}
            </div>
          ))}
          {Object.keys(grouped).length === 0 && (
            <p className="text-xs text-text-muted text-center py-4">No permissions found</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending}
          onClick={() => validate() && onSubmit(form)}>
          Create Role
        </Button>
      </div>
    </div>
  )
}

// ─── Role Permission Editor ───────────────────────────────────────────────────

function RolePermissionEditor({ role, onClose }) {
  const { data: permsData } = usePermissions()
  const allPerms = permsData?.data || permsData || []
  const { mutate: update, isPending } = useUpdateRolePermissions()
  const [permSearch, setPermSearch] = useState('')

  // Current permission ids on this role
  const currentIds = new Set(
    (role.permissions || []).map(p => p.id || p.permissionId)
  )
  const [selected, setSelected] = useState(new Set(currentIds))

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const filteredPerms = allPerms.filter(p =>
    !permSearch ||
    p.code?.toLowerCase().includes(permSearch.toLowerCase()) ||
    p.name?.toLowerCase().includes(permSearch.toLowerCase())
  )

  const grouped = filteredPerms.reduce((acc, p) => {
    const key = p.resourceType || 'GENERAL'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  const handleSave = () => {
    const addIds    = [...selected].filter(id => !currentIds.has(id))
    const removeIds = [...currentIds].filter(id => !selected.has(id))
    update({ roleId: role.role_id || role.id, addIds, removeIds }, { onSuccess: onClose })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Role info */}
      <div className="flex items-center gap-3 p-3 bg-surface-overlay rounded-lg border border-border">
        <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
          <Shield size={14} className="text-brand-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">{role.name || role.roleName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge value={role.side} label={role.side} colorTag={SIDE_COLOR[role.side] || 'gray'} />
            {role.level && <span className="text-[10px] text-text-muted font-mono">{role.level}</span>}
          </div>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs font-semibold text-brand-400">{selected.size}</p>
          <p className="text-[10px] text-text-muted">selected</p>
        </div>
      </div>

      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input value={permSearch} onChange={e => setPermSearch(e.target.value)}
          placeholder="Search permissions…"
          className="h-7 w-full pl-7 pr-3 rounded-md border border-border bg-surface-raised text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>

      <div className="border border-border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
        {Object.entries(grouped).map(([group, perms]) => (
          <div key={group}>
            <div className="px-3 py-1.5 bg-surface-overlay border-b border-border/50 sticky top-0 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{group}</span>
              <button onClick={() => {
                const ids = perms.map(p => p.id)
                const allSel = ids.every(id => selected.has(id))
                setSelected(prev => {
                  const next = new Set(prev)
                  ids.forEach(id => allSel ? next.delete(id) : next.add(id))
                  return next
                })
              }} className="text-[10px] text-text-muted hover:text-brand-400 transition-colors">
                {perms.every(p => selected.has(p.id)) ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            {perms.map(p => {
              const sel = selected.has(p.id)
              return (
                <button key={p.id} onClick={() => toggle(p.id)} type="button"
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 text-left border-b border-border/30 transition-colors',
                    sel ? 'bg-brand-500/8 text-brand-400' : 'hover:bg-surface-overlay text-text-secondary'
                  )}>
                  <div>
                    <span className="text-xs font-mono">{p.code}</span>
                    <span className="text-[10px] text-text-muted ml-2">{p.name}</span>
                  </div>
                  {sel && <Check size={11} className="shrink-0 text-brand-400" />}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={handleSave}>
          Save Permissions
        </Button>
      </div>
    </div>
  )
}

// ─── Roles Panel ──────────────────────────────────────────────────────────────

function RolesPanel({ tenantId, side, canManage }) {
  const { data, isLoading, refetch } = useRoleHierarchy(tenantId, side)
  const { mutate: deleteRole, isPending: deleting } = useDeleteRole()
  const [showCreate, setShowCreate] = useState(false)
  const [editPerms,  setEditPerms]  = useState(null) // role object
  const [deleteTarget, setDeleteTarget] = useState(null)
  const { mutate: createRole, isPending: creating } = useCreateRole()

  // Flatten hierarchy response
  const roles = (() => {
    const raw = data?.data || data
    if (!raw) return []
    if (raw.hierarchy) return Object.values(raw.hierarchy).flat()
    if (Array.isArray(raw)) return raw
    return []
  })()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          {side} Roles ({roles.length})
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" icon={RefreshCw} onClick={refetch} />
          {canManage && (
            <Button size="xs" icon={Plus} onClick={() => setShowCreate(true)}>New Role</Button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1,2,3].map(i => (
            <div key={i} className="h-14 rounded-lg bg-surface-overlay animate-pulse" />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {roles.map(role => {
          const id       = role.role_id || role.id
          const isSystem = role.is_system || role.isSystem
          return (
            <div key={id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-surface-raised hover:border-border-subtle transition-colors group">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={cn(
                  'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
                  isSystem ? 'bg-amber-500/10' : 'bg-brand-500/10'
                )}>
                  {isSystem
                    ? <Lock size={12} className="text-amber-400" />
                    : <Shield size={12} className="text-brand-400" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-text-primary font-mono truncate">
                      {role.name || role.roleName}
                    </p>
                    {role.level && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-surface-overlay text-text-muted font-mono border border-border/50">
                        {role.level}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-text-muted">
                      {role.permissions_count ?? role.permissionsCount ?? 0} permissions
                    </span>
                    <span className="text-[10px] text-text-muted">·</span>
                    <span className="text-[10px] text-text-muted">
                      {role.user_count ?? role.userCount ?? 0} users
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {canManage && (
                  <button onClick={() => setEditPerms(role)} title="Edit permissions"
                    className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
                    <Key size={11} />
                  </button>
                )}
                {canManage && !isSystem && (
                  <button onClick={() => setDeleteTarget({ id, name: role.name || role.roleName })}
                    title="Delete role"
                    className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {!isLoading && roles.length === 0 && (
          <p className="text-xs text-text-muted italic text-center py-4">
            No {side.toLowerCase()} roles defined yet.
          </p>
        )}
      </div>

      {/* Create role modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}
        title="Create Role" size="lg">
        <RoleForm side={side} isPending={creating}
          onClose={() => setShowCreate(false)}
          onSubmit={(form) => createRole({ tenantId, data: form }, {
            onSuccess: () => setShowCreate(false)
          })} />
      </Modal>

      {/* Edit permissions modal */}
      <Modal open={!!editPerms} onClose={() => setEditPerms(null)}
        title="Edit Role Permissions"
        subtitle={editPerms?.name || editPerms?.roleName}
        size="lg">
        {editPerms && (
          <RolePermissionEditor
            role={editPerms}
            onClose={() => setEditPerms(null)}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteRole(
          { tenantId, roleId: deleteTarget?.id },
          { onSuccess: () => setDeleteTarget(null) }
        )}
        loading={deleting}
        title="Delete Role"
        variant="danger"
        confirmLabel="Delete"
        message={`Delete role "${deleteTarget?.name}"? This cannot be undone. Users with this role will lose it immediately.`}
      />
    </div>
  )
}

// ─── Permissions Panel ────────────────────────────────────────────────────────

function PermissionsPanel({ canManage }) {
  const { data, isLoading, refetch } = usePermissions()
  const { mutate: create, isPending: creating } = useCreatePermission()
  const { mutate: remove, isPending: deleting } = useDeletePermission()
  const [showCreate,   setShowCreate]   = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [search,       setSearch]       = useState('')

  const allPerms = data?.data || data || []

  const filtered = allPerms.filter(p =>
    !search ||
    p.code?.toLowerCase().includes(search.toLowerCase()) ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.resourceType?.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = filtered.reduce((acc, p) => {
    const key = p.resourceType || 'GENERAL'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          Permissions ({allPerms.length})
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" icon={RefreshCw} onClick={refetch} />
          {canManage && (
            <Button size="xs" icon={Plus} onClick={() => setShowCreate(true)}>New</Button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search permissions…"
          className="h-7 w-full pl-7 pr-3 rounded-md border border-border bg-surface-raised text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>

      {isLoading && (
        <div className="space-y-1.5">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-9 rounded bg-surface-overlay animate-pulse" />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
        {Object.entries(grouped).map(([group, perms]) => (
          <div key={group}>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5 px-1">
              {group}
            </p>
            <div className="flex flex-col gap-1">
              {perms.map(p => (
                <div key={p.id}
                  className="flex items-center justify-between px-3 py-2 rounded-md border border-border bg-surface-raised hover:border-border-subtle transition-colors group">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-text-primary truncate">{p.code}</p>
                    <p className="text-[10px] text-text-muted truncate">{p.name}</p>
                  </div>
                  {canManage && (
                    <button onClick={() => setDeleteTarget({ id: p.id, name: p.code })}
                      className="h-5 w-5 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0 ml-2">
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {!isLoading && Object.keys(grouped).length === 0 && (
          <p className="text-xs text-text-muted italic text-center py-4">No permissions found</p>
        )}
      </div>

      {/* Create permission modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}
        title="New Permission" size="sm">
        <PermissionForm isPending={creating}
          onClose={() => setShowCreate(false)}
          onSubmit={(form) => create(form, { onSuccess: () => setShowCreate(false) })} />
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove(deleteTarget?.id, { onSuccess: () => setDeleteTarget(null) })}
        loading={deleting}
        title="Delete Permission"
        variant="danger"
        confirmLabel="Delete"
        message={`Delete permission "${deleteTarget?.name}"? Roles using it will lose this permission immediately.`}
      />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RolesPermissionsPage({ side = 'ORGANIZATION' }) {
  const { tenantId } = useSelector(selectAuth)
  const { hasPermission, isSystem, isOrg } = usePermission()
  const canManage = hasPermission('ROLE_MANAGE') || isSystem()

  // For system users show all sides; for others show their side + a tab switcher
  const availableSides = isSystem()
    ? SIDES                                              // all 5
    : isOrg()
    ? ['ORGANIZATION', 'VENDOR', 'AUDITOR', 'AUDITEE']  // org ecosystem, no SYSTEM
    : [side]                                             // vendor/auditor/auditee — own side only

  const [activeSide, setActiveSide] = useState(availableSides[0])

  return (
    <PageLayout
      title="Roles & Permissions"
      subtitle="Manage roles, assign permissions, control access"
    >
      <div className="flex gap-4 h-full">

        {/* ── Left: Permissions ──────────────────────────────────── */}
        <div className="w-72 shrink-0">
          <Card className="h-full">
            <CardHeader
              title="Permissions"
              subtitle="Global permission codes"
              actions={<ShieldCheck size={14} className="text-text-muted" />}
            />
            <CardBody className="pt-3">
              <PermissionsPanel canManage={canManage} />
            </CardBody>
          </Card>
        </div>

        {/* ── Right: Roles ───────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <Card className="h-full flex flex-col">
            <CardHeader
              title="Roles"
              subtitle="Define roles and map permissions"
              actions={<Shield size={14} className="text-text-muted" />}
            />

            {/* Side tabs — only visible if multiple sides available */}
            {availableSides.length > 1 && (
              <div className="flex items-center gap-1 px-4 pt-3 border-b border-border pb-0">
                {availableSides.map(s => (
                  <button key={s} onClick={() => setActiveSide(s)}
                    className={cn(
                      'px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
                      activeSide === s
                        ? 'border-brand-500 text-brand-400'
                        : 'border-transparent text-text-muted hover:text-text-secondary'
                    )}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <CardBody className="flex-1 overflow-y-auto pt-3">
              <RolesPanel
                key={activeSide}
                tenantId={tenantId}
                side={activeSide}
                canManage={canManage}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </PageLayout>
  )
}