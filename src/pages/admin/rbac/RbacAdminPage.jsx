import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield, Plus, Pencil, Trash2, Search, ChevronDown, ChevronRight,
  Users, Key, AlertTriangle, CheckCircle2, XCircle, Clock,
  RefreshCw, Info, Lock, Unlock, UserCheck, Layers, GitMerge,
} from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { cn } from '../../../lib/cn'
import { useSelector } from 'react-redux'
import { selectTenantId } from '../../../store/slices/authSlice'
import toast from 'react-hot-toast'
import { rbacApi } from '../../../api/rbac.api'


// ─── Hooks ───────────────────────────────────────────────────────────────────

const usePermissions = (params) => useQuery({
  queryKey: ['rbac-permissions', params],
  // Always fetch all permissions (take=500) — the paginated endpoint defaults to take=10
  queryFn: () => rbacApi.permissions.list({ take: 500, skip: 0, ...params }),
  keepPreviousData: true,
})
const useRoles = (tenantId, includeSuspended = false) => useQuery({
  queryKey: ['rbac-roles', tenantId, includeSuspended],
  queryFn: () => rbacApi.roles.list(tenantId, includeSuspended),
  enabled: !!tenantId,
  staleTime: 60000,
})
const useGrants = (roleId) => useQuery({
  queryKey: ['rbac-grants', roleId],
  queryFn: () => rbacApi.grants.list(roleId),
  enabled: !!roleId,
})
const useSodRules = () => useQuery({
  queryKey: ['rbac-sod'],
  queryFn: () => rbacApi.sod.list(),
})
const useOverrides = (params) => useQuery({
  queryKey: ['rbac-overrides', params],
  queryFn: () => rbacApi.overrides.list(params),
  keepPreviousData: true,
})
const useSummary = () => useQuery({
  queryKey: ['rbac-summary'],
  queryFn: () => rbacApi.summary.get(),
  staleTime: 30000,
})

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = [
  { key: 'permissions', label: 'Permissions', icon: Key },
  { key: 'grants',      label: 'Role grants', icon: Shield },
  { key: 'overrides',   label: 'User overrides', icon: UserCheck },
  { key: 'sod',         label: 'SoD rules', icon: GitMerge },
]

const MODULES = ['AUDIT','ASSESSMENT','DOCUMENT','ISSUE','REPORT','SYSTEM','USER_MGMT','VENDOR','WORKFLOW']
const CONFLICT_TYPES = [
  { value: 'HARD', label: 'Hard block' },
  { value: 'SOFT', label: 'Soft warn (exception required)' },
]
const SOD_SCOPES = [
  { value: 'INSTANCE', label: 'Per instance (same record)' },
  { value: 'GLOBAL',   label: 'Global (any record)' },
]
const FRAMEWORKS = ['SOX','PCI-DSS','ISO27001','HIPAA','SOC2','GDPR','NIST']

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RbacAdminPage() {
  const [tab, setTab] = useState('permissions')
  const tenantId = useSelector(selectTenantId)
  const { data: summary } = useSummary()

  const counts = {
    permissions: summary?.permissions ?? null,
    grants:      summary?.roles       ?? null,
    overrides:   summary?.overrides   ?? null,
    sod:         summary?.sodRules    ?? null,
  }

  return (
    <PageLayout
      title="RBAC & Access Control"
      subtitle="Manage permissions, role grants, user overrides, and SoD rules"
    >
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 pt-4 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 -mb-px',
              tab === t.key
                ? 'border-brand-500 text-brand-ink bg-brand-500/5'
                : 'border-transparent text-text-muted hover:text-text-secondary hover:bg-surface-overlay'
            )}
          >
            <t.icon size={13} />
            {t.label}
            {counts[t.key] != null && (
              <span className={cn(
                'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums',
                tab === t.key ? 'bg-brand-500/20 text-brand-ink' : 'bg-surface-overlay text-text-muted'
              )}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-6">
        {tab === 'permissions' && <PermissionsTab />}
        {tab === 'grants'      && <GrantsTab tenantId={tenantId} />}
        {tab === 'overrides'   && <OverridesTab />}
        {tab === 'sod'         && <SodTab tenantId={tenantId} />}
      </div>
    </PageLayout>
  )
}

// ─── Permissions Tab ──────────────────────────────────────────────────────────

function PermissionsTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [expandedModule, setExpandedModule] = useState('__ALL__')  // '__ALL__' = all expanded

  const { data, isLoading } = usePermissions({ search, module: moduleFilter || undefined })
  const permissions = data?.data?.items || data?.items || (Array.isArray(data?.data) ? data.data : null) || (Array.isArray(data) ? data : null) || []

  // Group by module (normalize empty/null strings from backend)
  const grouped = useMemo(() => {
    const g = {}
    for (const p of permissions) {
      const mod = (p.module && p.module !== 'NULL' && p.module !== '') ? p.module : null
      const rtype = (p.resourceType && p.resourceType !== 'NULL' && p.resourceType !== '') ? p.resourceType : null
      const m = mod || rtype || 'GENERAL'
      if (!g[m]) g[m] = []
      g[m].push(p)
    }
    // Sort: named modules first (alphabetically), then GENERAL last
    return Object.fromEntries(
      Object.entries(g).sort(([a], [b]) => {
        if (a === 'GENERAL') return 1
        if (b === 'GENERAL') return -1
        return a.localeCompare(b)
      })
    )
  }, [permissions])

  const createMut = useMutation({
    mutationFn: rbacApi.permissions.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac-permissions'] })
      qc.invalidateQueries({ queryKey: ['permissions'] })  // also refresh Roles & Permissions page
      qc.invalidateQueries({ queryKey: ['rbac-summary'] })
      toast.success('Permission created'); setModalOpen(false)
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => rbacApi.permissions.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rbac-permissions'] }); toast.success('Updated'); setModalOpen(false); setEditing(null) },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => rbacApi.permissions.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac-permissions'] })
      qc.invalidateQueries({ queryKey: ['permissions'] })  // also refresh Roles & Permissions page
      qc.invalidateQueries({ queryKey: ['rbac-summary'] })
      toast.success('Deleted'); setDeleteTarget(null)
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search permissions…"
            className="w-full pl-8 pr-3 h-8 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <select
          value={moduleFilter}
          onChange={e => setModuleFilter(e.target.value)}
          className="h-8 px-2 text-xs bg-surface-overlay border border-border rounded-ctl text-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All modules</option>
          {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {permissions.length > 0 && (
          <span className="text-xs text-text-muted shrink-0">
            <span className="font-semibold text-text-primary">{permissions.length}</span> permissions
          </span>
        )}
        <div className="ml-auto">
          <Button icon={Plus} size="sm" onClick={() => { setEditing(null); setModalOpen(true) }}>
            New permission
          </Button>
        </div>
      </div>

      {/* Grouped permission list */}
      {isLoading
        ? <div className="text-xs text-text-muted">Loading…</div>
        : Object.entries(grouped).map(([module, perms]) => (
          <div key={module} className="border border-border rounded-card overflow-hidden">
            <button
              onClick={() => setExpandedModule(expandedModule === module ? '__ALL__' : module)}
              className="w-full flex items-center justify-between px-4 py-3 bg-surface-overlay hover:bg-surface-raised transition-colors"
            >
              <div className="flex items-center gap-2">
                <Layers size={13} className="text-brand-ink" />
                <span className="text-xs font-semibold text-text-primary">{module}</span>
                <Badge variant="gray" size="xs">{perms.length}</Badge>
              </div>
              {(expandedModule === '__ALL__' || expandedModule === module) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            {(expandedModule === '__ALL__' || expandedModule === module) && (
              <div className="divide-y divide-border">
                {perms.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-overlay/50 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <code className="text-xs font-mono text-brand-ink shrink-0">{p.code}</code>
                      <span className="text-xs text-text-secondary truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditing(p); setModalOpen(true) }}
                        className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => setDeleteTarget(p)}
                        className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      }

      {/* Create / Edit modal */}
      <PermissionModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        initial={editing}
        onSave={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)}
        loading={createMut.isPending || updateMut.isPending}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        loading={deleteMut.isPending}
        title="Delete permission"
        message={`Delete "${deleteTarget?.code}"? All role grants referencing this permission will also be removed.`}
      />
    </div>
  )
}

function PermissionModal({ open, onClose, initial, onSave, loading }) {
  const [form, setForm] = useState({ code: '', name: '', module: '', resourceType: '' })
  useEffect(() => { if (initial) setForm(initial) }, [initial])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit permission' : 'New permission'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={() => onSave(form)}>Save</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Permission code <span className="text-status-fail-fg">*</span></label>
          <input value={form.code} onChange={e => set('code', e.target.value)}
            placeholder="risk.approve"
            className="w-full h-8 px-3 text-xs font-mono bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          <p className="text-xs text-text-muted mt-1">Use dot notation: module.action — e.g. risk.approve, vendor.edit</p>
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Display name <span className="text-status-fail-fg">*</span></label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="Approve risk treatment"
            className="w-full h-8 px-3 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Module</label>
            <select value={form.module} onChange={e => set('module', e.target.value)}
              className="w-full h-8 px-2 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Select…</option>
              {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Resource type</label>
            <input value={form.resourceType} onChange={e => set('resourceType', e.target.value)}
              placeholder="RISK_RECORD"
              className="w-full h-8 px-3 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Grants Tab ───────────────────────────────────────────────────────────────

function GrantsTab({ tenantId }) {
  const qc = useQueryClient()
  // includeSuspended — this IS the admin screen, so parked roles must be
  // visible here to be reactivated. Assignment pickers elsewhere call the
  // same endpoint without it and never see them.
  const { data: rolesData, isLoading: rolesLoading } = useRoles(tenantId, true)
  const roles = rolesData?.data?.items || rolesData?.items
    || (Array.isArray(rolesData?.data) ? rolesData.data : null)
    || (Array.isArray(rolesData) ? rolesData : null) || []

  // Store the ID, not the object. Holding the object meant `selectedRole`
  // was a snapshot taken at click time: after suspending, the roles query
  // refetched with the new status but this copy kept the old one, so the
  // button stayed on "Suspend" and the parked banner never appeared until
  // you clicked a different role and back. Deriving from the live list
  // keeps it in sync with whatever the server last returned.
  const [selectedRoleId, setSelectedRoleId] = useState(null)
  const selectedRole = useMemo(
    () => roles.find(r => r.id === selectedRoleId) || null,
    [roles, selectedRoleId]
  )
  const setSelectedRole = (r) => setSelectedRoleId(r?.id ?? null)
  const [activeSide, setActiveSide] = useState('ORGANIZATION')

  const { data: grantsData, isLoading: loadingGrants } = useGrants(selectedRole?.id)
  const { data: permsData } = usePermissions({})
  const permissions = permsData?.data?.items || permsData?.items
    || (Array.isArray(permsData?.data) ? permsData.data : null)
    || (Array.isArray(permsData) ? permsData : null) || []
  const grants = grantsData?.data?.items || grantsData?.items
    || (Array.isArray(grantsData?.data) ? grantsData.data : null)
    || (Array.isArray(grantsData) ? grantsData : null) || []

  const SIDES = ['ORGANIZATION', 'VENDOR', 'SYSTEM', 'AUDITOR', 'AUDITEE']
  const SIDE_COLOR = {
    ORGANIZATION: 'text-status-info-fg', VENDOR: 'text-status-tag-fg', SYSTEM: 'text-status-pass-fg',
    AUDITOR: 'text-status-info-fg', AUDITEE: 'text-status-warn-fg',
  }

  // Group roles by side
  const bySide = useMemo(() => {
    const g = {}
    for (const r of roles) {
      const side = r.side || 'ORGANIZATION'
      if (!g[side]) g[side] = []
      g[side].push(r)
    }
    return g
  }, [roles])

  const sideRoles = bySide[activeSide] || []

  // Group permissions by module/resourceType for grant matrix
  const grouped = useMemo(() => {
    const g = {}
    for (const p of permissions) {
      const mod = (p.module && p.module !== 'NULL' && p.module !== '') ? p.module : null
      const rtype = (p.resourceType && p.resourceType !== 'NULL' && p.resourceType !== '') ? p.resourceType : null
      const m = mod || rtype || 'GENERAL'
      if (!g[m]) g[m] = []
      g[m].push(p)
    }
    return g
  }, [permissions])

  const grantedIds = useMemo(
    () => new Set(grants.filter(g => g.granted).map(g => g.permissionId)),
    [grants]
  )

  const upsertMut = useMutation({
    mutationFn: ({ roleId, data }) => rbacApi.grants.upsert(roleId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rbac-grants', selectedRole?.id] }); toast.success('Saved') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  // Suspend / reactivate. Parks a role out of the assignable catalogue
  // without deleting it — users who already hold it keep it (see
  // RoleServiceImpl.setRoleStatus), which is why the holder count is shown
  // on the button so the blast radius is visible before acting.
  const statusMut = useMutation({
    mutationFn: ({ roleId, status }) => rbacApi.roles.setStatus(roleId, status),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['rbac-roles'] })
      toast.success(vars.status === 'SUSPENDED' ? 'Role suspended' : 'Role reactivated')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || e?.response?.data?.message || 'Failed'),
  })

  const createMut = useMutation({
    mutationFn: (data) => rbacApi.roles.create(tenantId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac-roles'] })
      setShowCreate(false)
      toast.success('Role created')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || e?.response?.data?.message || 'Failed'),
  })

  const [showCreate, setShowCreate] = useState(false)

  const toggle = (permission) => {
    if (!selectedRole) return
    const currently = grantedIds.has(permission.id)
    upsertMut.mutate({ roleId: selectedRole.id, data: { permissionId: permission.id, granted: !currently } })
  }

  // Bulk grant/revoke every permission in one module. The grants endpoint
  // is per-permission, so this fires one upsert each — but only for the
  // permissions whose state actually differs, and sequentially rather than
  // in a burst, so a 40-permission module doesn't hit the API with 40
  // simultaneous writes. Invalidates once at the end instead of per call.
  const [bulkPending, setBulkPending] = useState(false)
  const toggleModule = async (perms, granted) => {
    if (!selectedRole || bulkPending) return
    const changing = perms.filter(p => grantedIds.has(p.id) !== granted)
    if (changing.length === 0) return
    setBulkPending(true)
    try {
      for (const p of changing) {
        await rbacApi.grants.upsert(selectedRole.id, { permissionId: p.id, granted })
      }
      toast.success(`${granted ? 'Granted' : 'Revoked'} ${changing.length} permission${changing.length !== 1 ? 's' : ''}`)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Bulk update failed')
    } finally {
      qc.invalidateQueries({ queryKey: ['rbac-grants', selectedRole.id] })
      setBulkPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        {/* Role selector — side tabs + role list */}
        <div className="w-64 shrink-0">
          {/* Side tabs.
              Previously: SIDES.filter(s => bySide[s].length > 0 || rolesLoading).
              `useRoles` is `enabled: !!tenantId`, so before tenantId is
              available the query is DISABLED — not loading — which means
              rolesLoading is false while roles is still []. Every tab then
              filtered out, including ORGANIZATION, leaving the default
              activeSide pointing at a tab that wasn't rendered and an empty
              list underneath. Clicking another side and back re-selected a
              side that by then had data, which is exactly the "works only
              after clicking away and back" symptom. Keeping the active side
              always visible makes the list follow the data whenever it
              arrives. flex-wrap instead of overflow-x-auto removes the
              horizontal scrollbar. */}
          <div className="flex flex-wrap items-center gap-0.5 mb-3">
            {SIDES.filter(s => (bySide[s] || []).length > 0 || s === activeSide).map(s => (
              <button key={s} onClick={() => { setActiveSide(s); setSelectedRole(null) }}
                className={cn(
                  'px-2.5 py-1 text-[10px] font-medium rounded-ctl whitespace-nowrap transition-colors',
                  activeSide === s
                    ? 'bg-brand-500/15 text-brand-ink border border-brand-500/30'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay border border-transparent'
                )}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* Roles for active side */}
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              {activeSide} ROLES ({sideRoles.length})
            </p>
            <button onClick={() => setShowCreate(true)}
              className="text-[10px] font-medium text-brand-ink hover:underline">
              + New
            </button>
          </div>
          {/* max-h + overflow-y-auto: the list has no height cap otherwise,
              so with 13+ roles it just ran past the bottom of the viewport
              with nothing to scroll. Capped relative to viewport height so
              it adapts rather than being a fixed pixel guess. */}
          <div className="border border-border rounded-card overflow-y-auto max-h-[calc(100vh-22rem)]">
            {rolesLoading && <div className="px-3 py-3 text-xs text-text-muted text-center">Loading roles…</div>}
            {!rolesLoading && sideRoles.length === 0 && (
              <div className="px-3 py-3 text-xs text-text-muted italic text-center">No {activeSide.toLowerCase()} roles</div>
            )}
            {sideRoles.map(r => (
              <button key={r.id}
                onClick={() => setSelectedRole(r)}
                className={cn(
                  'w-full text-left px-3 py-2.5 text-xs transition-colors border-b border-border last:border-0',
                  selectedRole?.id === r.id
                    ? 'bg-brand-500/10 text-brand-ink font-medium'
                    : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
                )}
              >
                <div className="font-medium font-mono flex items-center gap-1.5">
                  <span className={cn(r.status === 'SUSPENDED' && 'opacity-50 line-through')}>{r.name}</span>
                  {r.status === 'SUSPENDED' && (
                    <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-status-warn-bg text-status-warn-fg shrink-0">
                      PARKED
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1.5">
                  <span className={cn('font-medium', SIDE_COLOR[r.side] || 'text-text-muted')}>{r.side}</span>
                  {r.level && <span>· {r.level}</span>}
                  {/* Global vs tenant-scoped — previously invisible, so
                      there was no way to tell whether editing a role would
                      affect every tenant or just this one. */}
                  <span className={cn(
                    'px-1 py-0.5 rounded text-[9px] font-semibold',
                    r.isGlobal
                      ? 'bg-brand-500/15 text-brand-ink'
                      : 'bg-surface-overlay text-text-muted'
                  )}>
                    {r.isGlobal ? 'GLOBAL' : 'TENANT'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Permission grant matrix */}
        <div className="flex-1 min-w-0">
          {!selectedRole ? (
            <div className="flex flex-col items-center justify-center h-64 text-center border border-dashed border-border rounded-card gap-2">
              <Shield size={24} className="text-text-muted opacity-40" />
              <p className="text-xs text-text-muted">Select a role on the left to manage its permissions</p>
            </div>
          ) : loadingGrants ? (
            <div className="text-xs text-text-muted py-4 text-center">Loading grants…</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary font-mono">{selectedRole.name}</h3>
                  <p className="text-xs text-text-muted">
                    <span className={cn('font-medium', SIDE_COLOR[selectedRole.side] || '')}>{selectedRole.side}</span>
                    {selectedRole.level && <span> · {selectedRole.level}</span>}
                    <span className="ml-2">{grantedIds.size} of {permissions.length} permissions granted</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Explicit state pill — the button alone only implied the
                      current status by its action label. */}
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-semibold',
                    selectedRole.status === 'SUSPENDED'
                      ? 'bg-status-warn-bg text-status-warn-fg border border-status-warn-bd'
                      : 'bg-status-pass-bg text-status-pass-fg border border-status-pass-bd'
                  )}>
                    {selectedRole.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'}
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {selectedRole.userCount ?? 0} user{(selectedRole.userCount ?? 0) !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => statusMut.mutate({
                      roleId: selectedRole.id,
                      status: selectedRole.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
                    })}
                    disabled={statusMut.isPending}
                    title={selectedRole.status === 'SUSPENDED'
                      ? 'Make this role assignable again'
                      : 'Park this role — hidden from all role pickers. Users who already hold it keep it.'}
                    className={cn(
                      'px-2.5 py-1 rounded-ctl text-[11px] font-medium border transition-colors',
                      selectedRole.status === 'SUSPENDED'
                        ? 'border-status-pass-bd text-status-pass-fg hover:bg-status-pass-bg'
                        : 'border-status-warn-bd text-status-warn-fg hover:bg-status-warn-bg'
                    )}>
                    {selectedRole.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                  </button>
                </div>
              </div>
              {selectedRole.status === 'SUSPENDED' && (
                <div className="px-3 py-2 rounded-card bg-status-warn-bg border border-status-warn-bd">
                  <p className="text-[11px] text-status-warn-fg">
                    This role is parked — it won't appear in any role picker and can't be newly
                    assigned. The {selectedRole.userCount ?? 0} user{(selectedRole.userCount ?? 0) !== 1 ? 's' : ''} who
                    already hold it keep their access; remove it from them individually to revoke.
                  </p>
                </div>
              )}
              {Object.entries(grouped).map(([module, perms]) => {
                const grantedInModule = perms.filter(p => grantedIds.has(p.id)).length
                const allGranted  = grantedInModule === perms.length && perms.length > 0
                const noneGranted = grantedInModule === 0
                return (
                <div key={module} className="border border-border rounded-card overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-surface-overlay border-b border-border">
                    <Layers size={12} className="text-brand-ink" />
                    <span className="text-xs font-semibold text-text-primary">{module}</span>
                    {/* Bulk select for the whole module — toggling 40 audit
                        permissions one click at a time was the only option
                        before. Only the permissions that actually need to
                        change are sent, so this won't re-write grants that
                        are already in the desired state. */}
                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        onClick={() => toggleModule(perms, true)}
                        disabled={allGranted || bulkPending}
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                          allGranted || bulkPending
                            ? 'border-border/50 text-text-muted/40 cursor-not-allowed'
                            : 'border-border text-text-muted hover:text-status-pass-fg hover:bg-status-pass-bg'
                        )}>
                        Select all
                      </button>
                      <button
                        onClick={() => toggleModule(perms, false)}
                        disabled={noneGranted || bulkPending}
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                          noneGranted || bulkPending
                            ? 'border-border/50 text-text-muted/40 cursor-not-allowed'
                            : 'border-border text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg'
                        )}>
                        Clear
                      </button>
                      <span className="text-xs text-text-muted tabular-nums ml-1">
                        {grantedInModule}/{perms.length}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-0 divide-y divide-border">
                    {perms.map(p => {
                      const granted = grantedIds.has(p.id)
                      return (
                        <button key={p.id} onClick={() => toggle(p)}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                            granted ? 'hover:bg-status-pass-bg' : 'hover:bg-surface-overlay'
                          )}
                        >
                          <div className={cn(
                            'w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0',
                            granted ? 'bg-status-pass-bg border border-status-pass-bd' : 'border border-border bg-surface-overlay'
                          )}>
                            {granted && <CheckCircle2 size={10} className="text-status-pass-fg" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-mono text-brand-ink truncate">{p.code}</div>
                            <div className="text-[10px] text-text-muted truncate">{p.name}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <RoleCreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        defaultSide={activeSide}
        isSystemTenant={tenantId === 1}
        loading={createMut.isPending}
        onSave={(data) => createMut.mutate(data)}
      />
    </div>
  )
}

// ─── Role create modal (migrated from RolesPermissionsPage) ───────────────────
// Carries the Scope toggle: global roles (tenant_id = NULL) are usable by
// every tenant, tenant-scoped roles only by this one. The backend only
// honours global=true for a SYSTEM-side caller (RoleServiceImpl
// .buildAndSaveRole), so the toggle is hidden for anyone else rather than
// offering a choice that would be silently ignored.
function RoleCreateModal({ open, onClose, defaultSide, isSystemTenant, loading, onSave }) {
  const [form, setForm] = useState({
    name: '', description: '', side: defaultSide || 'ORGANIZATION',
    level: 'L3', global: false,
  })
  useEffect(() => {
    if (open) setForm(f => ({ ...f, side: defaultSide || 'ORGANIZATION' }))
  }, [open, defaultSide])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const submit = () => {
    if (!form.name.trim()) { toast.error('Role name is required'); return }
    onSave({ ...form, name: form.name.trim().toUpperCase().replace(/\s+/g, '_') })
  }

  return (
    <Modal open={open} onClose={onClose} title="New Role"
      subtitle="Roles group permissions and are assigned to users on one side"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={submit}>Create Role</Button>
        </div>
      }>
      <div className="flex flex-col gap-4">
        <Input label="Role Name *" value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="e.g. COMPLIANCE_REVIEWER" />
        <Input label="Description" value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="What is this role for?" />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Side</label>
            <select value={form.side} onChange={e => set('side', e.target.value)}
              className="h-8 px-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              {/* SYSTEM only offered on the Kashi System Tenant — the
                  backend rejects it anywhere else. */}
              {(isSystemTenant
                ? ['SYSTEM']
                : ['ORGANIZATION', 'VENDOR', 'AUDITEE', 'AUDITOR']
              ).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Level</label>
            <select value={form.level} onChange={e => set('level', e.target.value)}
              className="h-8 px-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              {['L1', 'L2', 'L3', 'L4'].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Scope</label>
          <button type="button" onClick={() => set('global', !form.global)}
            className={cn(
              'h-8 w-fit flex items-center gap-2 px-3 rounded-ctl border text-xs font-medium transition-colors',
              form.global
                ? 'bg-brand-500/15 border-brand-500/40 text-brand-ink'
                : 'border-border text-text-muted hover:bg-surface-overlay'
            )}>
            {form.global ? 'Global — every tenant can use this' : 'This tenant only'}
          </button>
          <p className="text-[10px] text-text-muted mt-0.5">
            Global roles form the shared catalogue every organisation assigns from.
            Only a platform administrator can create them.
          </p>
        </div>
      </div>
    </Modal>
  )
}

// ─── User Overrides Tab ───────────────────────────────────────────────────────

function OverridesTab() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data, isLoading } = useOverrides({ search })
  const overrides = data?.data?.items || data?.items || (Array.isArray(data?.data) ? data.data : null) || (Array.isArray(data) ? data : null) || []

  const revokeMut = useMutation({
    mutationFn: rbacApi.overrides.revoke,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rbac-overrides'] }); toast.success('Override revoked') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
  const createMut = useMutation({
    mutationFn: rbacApi.overrides.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rbac-overrides'] }); toast.success('Override created'); setModalOpen(false) },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by user or permission…"
            className="w-full pl-8 pr-3 h-8 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <Button icon={Plus} size="sm" onClick={() => setModalOpen(true)}>New override</Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-card bg-status-info-bg border border-status-info-bd">
        <Info size={13} className="text-status-info-fg mt-0.5 shrink-0" />
        <p className="text-xs text-status-info-fg">
          User overrides win over role grants. A granted override adds a permission the role doesn't have.
          A denied override removes a permission the role does have. Overrides are bounded by the role ceiling — Platform Admins can exceed this.
        </p>
      </div>

      {/* Table */}
      <div className="border border-border rounded-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-surface-overlay">
              <th className="text-left px-4 py-2.5 font-medium text-text-muted">User</th>
              <th className="text-left px-4 py-2.5 font-medium text-text-muted">Permission</th>
              <th className="text-left px-4 py-2.5 font-medium text-text-muted">Type</th>
              <th className="text-left px-4 py-2.5 font-medium text-text-muted">Reason</th>
              <th className="text-left px-4 py-2.5 font-medium text-text-muted">Expires</th>
              <th className="text-left px-4 py-2.5 font-medium text-text-muted">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading
              ? <tr><td colSpan={7} className="px-4 py-6 text-center text-text-muted">Loading…</td></tr>
              : overrides.length === 0
                ? <tr><td colSpan={7} className="px-4 py-6 text-center text-text-muted">No user overrides found</td></tr>
                : overrides.map(o => (
                  <tr key={o.id} className="hover:bg-surface-overlay/40 group">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-text-primary">{o.userName || o.userId}</div>
                      <div className="text-text-muted">{o.userEmail}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-brand-ink">{o.permissionCode}</td>
                    <td className="px-4 py-2.5">
                      {o.granted
                        ? <span className="inline-flex items-center gap-1 text-status-pass-fg"><Unlock size={11} /> Grant</span>
                        : <span className="inline-flex items-center gap-1 text-status-fail-fg"><Lock size={11} /> Deny</span>
                      }
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary max-w-xs truncate">{o.reason || '—'}</td>
                    <td className="px-4 py-2.5 text-text-muted">{o.expiresAt ? new Date(o.expiresAt).toLocaleDateString() : 'Permanent'}</td>
                    <td className="px-4 py-2.5">
                      {o.isActive
                        ? <Badge variant="green" size="xs">Active</Badge>
                        : <Badge variant="gray" size="xs">Revoked</Badge>
                      }
                    </td>
                    <td className="px-4 py-2.5">
                      {o.isActive && (
                        <button onClick={() => revokeMut.mutate(o.id)}
                          className="opacity-0 group-hover:opacity-100 text-xs text-status-fail-fg hover:underline transition-opacity">
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>

      <OverrideModal open={modalOpen} onClose={() => setModalOpen(false)}
        onSave={(d) => createMut.mutate(d)} loading={createMut.isPending} />
    </div>
  )
}

function OverrideModal({ open, onClose, onSave, loading }) {
  const [form, setForm] = useState({ userId: '', permissionCode: '', granted: true, reason: '', expiresAt: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal open={open} onClose={onClose} title="New user permission override"
      subtitle="Grants or denies a specific permission for one user, overriding their role"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={() => onSave(form)}>Create override</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">User ID or email <span className="text-status-fail-fg">*</span></label>
          <input value={form.userId} onChange={e => set('userId', e.target.value)}
            placeholder="user@company.com or user ID"
            className="w-full h-8 px-3 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Permission code <span className="text-status-fail-fg">*</span></label>
          <input value={form.permissionCode} onChange={e => set('permissionCode', e.target.value)}
            placeholder="risk.approve"
            className="w-full h-8 px-3 text-xs font-mono bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Override type</label>
          <div className="flex gap-3">
            {[{ v: true, label: 'Grant (add permission)', icon: Unlock, color: 'text-status-pass-fg' },
              { v: false, label: 'Deny (remove permission)', icon: Lock, color: 'text-status-fail-fg' }].map(o => (
              <button key={String(o.v)} onClick={() => set('granted', o.v)}
                className={cn(
                  'flex-1 flex items-center gap-2 px-3 py-2.5 text-xs rounded-card border transition-colors',
                  form.granted === o.v ? 'border-brand-500 bg-brand-500/10 text-text-primary' : 'border-border text-text-muted hover:border-border-strong'
                )}>
                <o.icon size={13} className={o.color} /> {o.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Justification <span className="text-status-fail-fg">*</span></label>
          <textarea value={form.reason} onChange={e => set('reason', e.target.value)}
            rows={2} placeholder="Why is this override needed?"
            className="w-full px-3 py-2 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Expiry date (leave blank for permanent)</label>
          <input type="date" value={form.expiresAt} onChange={e => set('expiresAt', e.target.value)}
            className="w-full h-8 px-3 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
    </Modal>
  )
}

// ─── SoD Rules Tab ────────────────────────────────────────────────────────────

function SodTab({ tenantId }) {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading } = useSodRules()
  // Load roles for the ROLE_PAIR rule selector
  const { data: rolesData } = useRoles(tenantId)
  const allRoles = rolesData?.data?.items || rolesData?.items || (Array.isArray(rolesData?.data) ? rolesData.data : null) || (Array.isArray(rolesData) ? rolesData : null) || []
  const rules = data?.data?.items || data?.items || (Array.isArray(data?.data) ? data.data : null) || (Array.isArray(data) ? data : null) || []

  const createMut = useMutation({
    mutationFn: rbacApi.sod.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rbac-sod'] }); toast.success('SoD rule created'); setModalOpen(false) },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => rbacApi.sod.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rbac-sod'] }); toast.success('Updated'); setModalOpen(false); setEditing(null) },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => rbacApi.sod.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rbac-sod'] }); toast.success('Deleted'); setDeleteTarget(null) },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-card bg-status-warn-bg border border-status-warn-bd flex-1 mr-4">
          <AlertTriangle size={13} className="text-status-warn-fg mt-0.5 shrink-0" />
          <p className="text-xs text-status-warn-fg">
            SoD rules are evaluated at task assignment time, scoped to the same workflow instance.
            HARD rules block assignment entirely. SOFT rules allow with a documented exception.
          </p>
        </div>
        <Button icon={Plus} size="sm" onClick={() => { setEditing(null); setModalOpen(true) }}>New SoD rule</Button>
      </div>

      {isLoading
        ? <div className="text-xs text-text-muted">Loading…</div>
        : (
          <div className="space-y-2">
            {rules.length === 0 && (
              <div className="flex items-center justify-center h-32 border border-dashed border-border rounded-card text-xs text-text-muted">
                No SoD rules defined yet
              </div>
            )}
            {rules.map(rule => (
              <div key={rule.id}
                className="flex items-start gap-4 p-4 border border-border rounded-card hover:border-border-strong transition-colors group">
                <div className={cn(
                  'h-6 px-2 rounded text-[10px] font-bold flex items-center shrink-0 mt-0.5',
                  rule.conflictType === 'HARD'
                    ? 'bg-status-fail-bg text-status-fail-fg border border-status-fail-bd'
                    : 'bg-status-warn-bg text-status-warn-fg border border-status-warn-bd'
                )}>
                  {rule.conflictType}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-text-primary">{rule.ruleName}</span>
                    {rule.frameworkRef && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-tag-bg text-status-tag-fg border border-status-tag-bd">
                        {rule.frameworkRef}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <code className="font-mono text-brand-ink bg-brand-500/10 px-1.5 py-0.5 rounded">{rule.permissionA}</code>
                    <span className="text-text-muted">conflicts with</span>
                    <code className="font-mono text-brand-ink bg-brand-500/10 px-1.5 py-0.5 rounded">{rule.permissionB}</code>
                  </div>
                  {rule.description && <p className="text-xs text-text-muted mt-1">{rule.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
                    <span>Scope: {rule.scope}</span>
                    {rule.entityTypes && <span>Entities: {rule.entityTypes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => { setEditing(rule); setModalOpen(true) }}
                    className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => setDeleteTarget(rule)}
                    className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      }

      <SodRuleModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        initial={editing}
        allRoles={allRoles}
        onSave={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)}
        loading={createMut.isPending || updateMut.isPending}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        loading={deleteMut.isPending}
        title="Delete SoD rule"
        message={`Delete rule "${deleteTarget?.ruleName}"? This will no longer block conflicting assignments.`}
      />
    </div>
  )
}

function SodRuleModal({ open, onClose, initial, onSave, loading, allRoles }) {
  const empty = { ruleName: '', description: '', ruleType: 'ROLE_PAIR',
    permissionA: '', permissionB: '', role1Id: '', role2Id: '',
    conflictType: 'HARD', scope: '', entityTypes: '', frameworkRef: '' }
  const [form, setForm] = useState(empty)
  useEffect(() => {
    if (initial) {
      setForm({
        ...empty, ...initial,
        ruleType:  initial.ruleType  || (initial.role1Name ? 'ROLE_PAIR' : 'PERMISSION_PAIR'),
        role1Id:   initial.conflictingRole1Id || '',
        role2Id:   initial.conflictingRole2Id || '',
      })
    } else { setForm(empty) }
  }, [initial, open])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const isRolePair = form.ruleType === 'ROLE_PAIR'

  return (
    <Modal open={open} onClose={onClose}
      title={initial ? 'Edit SoD rule' : 'New SoD rule'}
      subtitle="Define who cannot hold conflicting roles or exercise conflicting permissions"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={() => onSave(form)}>Save rule</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Rule name <span className="text-status-fail-fg">*</span></label>
          <input value={form.ruleName} onChange={e => set('ruleName', e.target.value)}
            placeholder="Auditor cannot be Control Owner"
            className="w-full h-8 px-3 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        {/* Rule type toggle */}
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Rule type</label>
          <div className="flex gap-2">
            {[{ v: 'ROLE_PAIR', label: 'Role conflict' }, { v: 'PERMISSION_PAIR', label: 'Permission conflict' }].map(opt => (
              <button key={opt.v} type="button" onClick={() => set('ruleType', opt.v)}
                className={cn(
                  'flex-1 py-2 text-xs rounded-ctl border transition-colors',
                  form.ruleType === opt.v
                    ? 'border-brand-500 bg-brand-500/10 text-brand-ink font-medium'
                    : 'border-border text-text-muted hover:border-border-strong'
                )}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {/* Role pair fields */}
        {isRolePair ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Role 1 <span className="text-status-fail-fg">*</span></label>
              <select value={form.role1Id} onChange={e => set('role1Id', e.target.value)}
                className="w-full h-8 px-2 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">Select role…</option>
                {(allRoles || []).map(r => <option key={r.id} value={r.id}>{r.name} ({r.side})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Role 2 <span className="text-status-fail-fg">*</span></label>
              <select value={form.role2Id} onChange={e => set('role2Id', e.target.value)}
                className="w-full h-8 px-2 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">Select role…</option>
                {(allRoles || []).map(r => <option key={r.id} value={r.id}>{r.name} ({r.side})</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Permission A <span className="text-status-fail-fg">*</span></label>
              <input value={form.permissionA} onChange={e => set('permissionA', e.target.value)}
                placeholder="risk.create"
                className="w-full h-8 px-3 text-xs font-mono bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Permission B <span className="text-status-fail-fg">*</span></label>
              <input value={form.permissionB} onChange={e => set('permissionB', e.target.value)}
                placeholder="risk.approve"
                className="w-full h-8 px-3 text-xs font-mono bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Description</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            rows={2} placeholder="Why this conflict matters…"
            className="w-full px-3 py-2 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Conflict type</label>
            <select value={form.conflictType} onChange={e => set('conflictType', e.target.value)}
              className="w-full h-8 px-2 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              {CONFLICT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Framework reference</label>
            <select value={form.frameworkRef} onChange={e => set('frameworkRef', e.target.value)}
              className="w-full h-8 px-2 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">None</option>
              {FRAMEWORKS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      </div>
    </Modal>
  )
}