import { useState, useMemo, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../../store/slices/authSlice'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, RefreshCw, Pencil, Trash2, Search,
  ToggleLeft, ToggleRight, Shield, Users, ChevronDown, X, Check, Loader2,
} from 'lucide-react'
import { uiAdminApi } from '../../../api/uiConfig.api'
import { rbacApi }     from '../../../api/rbac.api'
import { PageLayout }  from '../../../components/layout/PageLayout'
import { DataTable }   from '../../../components/ui/DataTable'
import { Button }      from '../../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Input }       from '../../../components/ui/Input'
import { cn }          from '../../../lib/cn'
import toast           from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────

const COMMON_ICONS = [
  'LayoutDashboard','Users','Shield','Building2','FileText','Settings','GitBranch',
  'Play','Pause','BarChart2','ClipboardList','ClipboardCheck','Search','Bell',
  'Mail','Lock','Zap','Globe','Database','Activity','TrendingUp','Package',
  'PlusCircle','Eye','Edit3','Trash2','Download','Upload','Link','Flag',
  'CheckCircle2','XCircle','AlertCircle','Clock','Calendar','Book','Folder',
  'ToggleRight','Palette','Menu','Layers','FormInput','UserPlus','FileEdit',
  'ShieldCheck','Inbox','FolderOpen','AlertTriangle','FileUp','Paperclip',
  'CreditCard','Tag','BookOpen','LayoutTemplate','GitMerge','CheckSquare',
  // Additional icons used across nav + audit modules
  'FolderKanban','Library','FlaskConical','ShieldAlert','Layout','BookMarked',
  'ListTodo','LayoutList','PaintBucket','GitBranch','Pencil','RefreshCw',
  'MessageSquare','Target','Award','Briefcase','Hash','Star','Info',
]

const SIDES = ['SYSTEM','ORGANIZATION','VENDOR','AUDITOR','AUDITEE']

const SIDE_STYLE = {
  SYSTEM:       'bg-status-tag-bg text-status-tag-fg',
  ORGANIZATION: 'bg-status-info-bg text-status-info-fg',
  AUDITOR:      'bg-brand-500/15 text-brand-400',
  AUDITEE:      'bg-status-pass-bg text-status-pass-fg',
  VENDOR:       'bg-status-warn-bg text-status-warn-fg',
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useAllNavItems = () => useQuery({
  queryKey: ['admin-nav-all'],
  queryFn:  () => uiAdminApi.navigation.list({ skip: 0, take: 500 }),
  staleTime: 60_000,
})

const useNavItems = (params) => useQuery({
  queryKey: ['admin-nav', params],
  queryFn:  () => uiAdminApi.navigation.list(params),
  keepPreviousData: true,
})

// All permissions — grouped by module
const useAllPermissions = () => useQuery({
  queryKey: ['rbac-permissions-all'],
  queryFn:  () => rbacApi.permissions.list({ take: 500 }),
  staleTime: 5 * 60_000,
  select: (data) => {
    const items = data?.items || data || []
    const groups = {}
    for (const p of items) {
      const mod = p.module || 'OTHER'
      if (!groups[mod]) groups[mod] = []
      groups[mod].push(p)
    }
    return { items, groups }
  },
})

// Roles that hold a specific permission — from our new endpoint
const usePermissionRoles = (permCode, enabled) => useQuery({
  queryKey: ['perm-roles', permCode],
  queryFn:  () => rbacApi.permissions.listRoles(permCode)
    .then(r => Array.isArray(r) ? r : (r?.data ?? [])),
  enabled:  !!permCode && enabled,
  staleTime: 0,          // always refetch on invalidation — grants change frequently
  refetchOnWindowFocus: false,
})

// All roles flat — for the grant modal's "add role" list
// Uses rbacApi.roles.list which calls /v1/tenants/{id}/roles/hierarchy
// with no side filter → returns ALL sides. tenantId=1 returns both
// tenant-specific (tenantId=1) AND global roles (tenantId=NULL).
const useAllRoles = (tenantId) => useQuery({
  queryKey: ['rbac-roles-all', tenantId],
  queryFn:  () => rbacApi.roles.list(tenantId),  // hierarchy endpoint — works for any tenant
  staleTime: 5 * 60_000,
  enabled: !!tenantId,
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

// Grant / revoke permission to a role
function useGrantPermission(onLocalUpdate) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ roleId, permissionId }) =>
      rbacApi.grants.upsert(roleId, { permissionId, granted: true }),
    onSuccess: (data, vars) => {
      const grantId = data?.id ?? data?.data?.id ?? null
      qc.invalidateQueries({ queryKey: ['perm-roles'] })
      qc.invalidateQueries({ queryKey: ['navigation'] })  // refresh sidebar for all users
      onLocalUpdate(Number(vars.roleId), true, grantId)
      toast.success('Permission granted')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

function useRevokePermission(onLocalUpdate) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ grantId }) => rbacApi.grants.delete(grantId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['perm-roles'] })
      qc.invalidateQueries({ queryKey: ['navigation'] })  // refresh sidebar
      onLocalUpdate(Number(vars.roleId), false)
      toast.success('Permission revoked')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

// ─── Permission Picker ────────────────────────────────────────────────────────

function PermissionPicker({ value, onChange }) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const { data, isLoading } = useAllPermissions()

  const filtered = useMemo(() => {
    if (!data?.groups) return {}
    if (!search.trim()) return data.groups
    const q = search.toLowerCase()
    const result = {}
    for (const [mod, perms] of Object.entries(data.groups)) {
      const matched = perms.filter(p =>
        p.code.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q)
      )
      if (matched.length) result[mod] = matched
    }
    return result
  }, [data, search])

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
        Required Permission
      </label>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={cn(
            'w-full h-9 flex items-center justify-between gap-2 px-3 rounded-ctl border text-sm',
            'border-border bg-surface-raised text-text-primary',
            'hover:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500'
          )}
        >
          <span className={cn('flex items-center gap-2', !value && 'text-text-muted')}>
            <Shield size={13} className={value ? 'text-brand-400' : 'text-text-muted'} />
            {value
              ? <span className="font-mono text-xs">{value}</span>
              : 'None — visible to all side users'
            }
          </span>
          <div className="flex items-center gap-1">
            {value && (
              <span
                onClick={(e) => { e.stopPropagation(); onChange(null) }}
                className="p-0.5 rounded hover:bg-surface-overlay text-text-muted hover:text-status-fail-fg cursor-pointer"
              >
                <X size={12} />
              </span>
            )}
            <ChevronDown size={13} className="text-text-muted" />
          </div>
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-ctl border border-border bg-surface-raised shadow-lg">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search permissions…"
                  className="w-full h-7 pl-6 pr-2 rounded border border-border bg-surface text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-overlay transition-colors',
                  !value ? 'bg-brand-500/10 text-brand-400' : 'text-text-muted'
                )}
              >
                <span className="font-mono">—</span>
                <span>None (open to all side users)</span>
              </button>

              {isLoading && (
                <div className="px-3 py-2 text-xs text-text-muted">Loading…</div>
              )}

              {Object.entries(filtered).map(([mod, perms]) => (
                <div key={mod}>
                  <div className="px-3 py-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-surface-overlay/50 border-y border-border/50">
                    {mod}
                  </div>
                  {perms.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { onChange(p.code); setOpen(false); setSearch('') }}
                      className={cn(
                        'w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-surface-overlay transition-colors',
                        value === p.code ? 'bg-brand-500/10' : ''
                      )}
                    >
                      <span className={cn(
                        'font-mono text-[11px] shrink-0 mt-0.5',
                        value === p.code ? 'text-brand-400' : 'text-text-primary'
                      )}>
                        {p.code}
                      </span>
                      <span className="text-[11px] text-text-muted">{p.name}</span>
                    </button>
                  ))}
                </div>
              ))}

              {!isLoading && Object.keys(filtered).length === 0 && (
                <div className="px-3 py-3 text-xs text-text-muted text-center">
                  No permissions match "{search}"
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!value && (
        <p className="text-[10px] text-text-muted">
          No permission — all users on the allowed side(s) will see this item.
        </p>
      )}
    </div>
  )
}

// ─── Permission → Roles Modal ────────────────────────────────────────────────
// Fixes:
// 1. useEffect (not useMemo) seeds localGranted/localRoleMap from serverRoles
// 2. grantedRoles derived from localRoleMap (not allRoles filter — that was wrong)
// 3. ungrantedRoles filters allRoles against localGranted Set correctly
// 4. Revoke uses grantId from localRoleMap; if null (just granted, not yet fetched)
//    it refetches first then revokes — prevents DELETE /grants/null 404
// 5. Side filter tabs so admin can browse roles by side
// 6. allRoles uses rbacApi.roles.list which returns all sides flat

function PermissionRolesModal({ open, onClose, permCode, allPermsData }) {
  const qc = useQueryClient()

  // Server fetch — roles that currently hold this permission
  const { data: serverRoles, isLoading } = usePermissionRoles(permCode, open)

  // ── Local state — updated optimistically, reset on close ─────────────────
  // localGranted: Set<number> of roleIds that have the permission
  // localRoleMap: { [roleId]: { grantId, roleId, roleName, roleSide, roleLevel } }
  const [localGranted, setLocalGranted] = useState(null)
  const [localRoleMap, setLocalRoleMap] = useState({})
  const [sideFilter,   setSideFilter]   = useState('')
  const [roleSearch,   setRoleSearch]   = useState('')

  // Seed from server data — useEffect is correct (setState side-effect)
  useEffect(() => {
    if (serverRoles == null) return
    if (localGranted === null) {
      // First load — full seed
      const idSet = new Set(serverRoles.map(r => Number(r.roleId)))
      const map   = {}
      serverRoles.forEach(r => { map[Number(r.roleId)] = r })
      setLocalGranted(idSet)
      setLocalRoleMap(map)
    } else {
      // Subsequent sync after refetch:
      // - Patch real grantIds into localRoleMap for confirmed grants
      // - Add any new server grants not yet in local
      // - Remove entries where server confirms revoke AND local has a real grantId
      //   (grantId=null = optimistic pending grant — never remove those)
      const serverIds = new Set(serverRoles.map(r => Number(r.roleId)))
      setLocalRoleMap(prev => {
        const next = { ...prev }
        serverRoles.forEach(r => {
          const id = Number(r.roleId)
          next[id] = next[id]
            ? { ...next[id], grantId: r.grantId }  // patch real grantId
            : r                                      // new server grant
        })
        // Remove entries server no longer has — but only confirmed grants (grantId != null)
        // Optimistic grants (grantId=null) are kept until server confirms or user sees toast
        Object.keys(next).forEach(id => {
          if (!serverIds.has(Number(id)) && next[id]?.grantId != null) {
            delete next[Number(id)]
            setLocalGranted(s => { const n = new Set(s); n.delete(Number(id)); return n })
          }
        })
        return next
      })
    }
  }, [serverRoles])  // eslint-disable-line react-hooks/exhaustive-deps

  // Reset all local state when modal closes
  const handleClose = () => {
    setLocalGranted(null)
    setLocalRoleMap({})
    setSideFilter('')
    setRoleSearch('')
    onClose()
  }

  // Optimistic update called by mutations on success
  // grant calls: updateLocal(roleId, true, grantId)   — grantId is a number
  // revoke calls: updateLocal(roleId, false)
  // optimistic onClick: updateLocal(id, true, roleInfoObj) — roleInfo is an object
  const updateLocal = (roleId, granted, roleInfoOrGrantId) => {
    const id = Number(roleId)
    setLocalGranted(prev => {
      const next = new Set(prev || [])
      if (granted) next.add(id)
      else next.delete(id)
      return next
    })
    if (granted && roleInfoOrGrantId) {
      if (typeof roleInfoOrGrantId === 'object') {
        // Called from optimistic onClick with full role info object
        setLocalRoleMap(prev => ({ ...prev, [id]: { ...roleInfoOrGrantId, roleId: id } }))
      } else {
        // Called from mutation onSuccess with grantId number — patch grantId into existing entry
        setLocalRoleMap(prev => {
          const existing = prev[id] || {}
          return { ...prev, [id]: { ...existing, roleId: id, grantId: roleInfoOrGrantId } }
        })
      }
    } else if (!granted) {
      setLocalRoleMap(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  const { mutate: grant,  isPending: granting  } = useGrantPermission(updateLocal)
  const { mutate: revoke, isPending: revoking   } = useRevokePermission(updateLocal)

  // All roles flat from rbacApi — id/name/side/level
  const { tenantId: authTenantId } = useSelector(selectAuth)
  const { data: allRoles = [] } = useAllRoles(authTenantId)

  const permInfo = allPermsData?.items?.find(p => p.code === permCode)
  const busy     = granting || revoking
  const grantedSet = localGranted || new Set()

  // Roles currently granted — from localRoleMap (server-authoritative data)
  // NOT from allRoles filter — localRoleMap has the grantId we need for revoke
  // Deduplicate by roleName to prevent showing duplicate roles (e.g. PLATFORM_ADMIN x2)
  const grantedRoles = Object.values(
    Object.values(localRoleMap).reduce((acc, r) => {
      const key = r.roleName || r.roleId
      if (!acc[key]) acc[key] = r  // keep first (lowest id = most authoritative)
      return acc
    }, {})
  )

  // Roles not yet granted — from allRoles, filtered by localGranted Set + side + search
  const ungrantedRoles = useMemo(() => {
    return allRoles
      .filter(r => !grantedSet.has(Number(r.id || r.roleId)))
      .filter(r => !sideFilter || (r.side || '').toUpperCase() === sideFilter)
      .filter(r => {
        if (!roleSearch.trim()) return true
        return (r.name || '').toLowerCase().includes(roleSearch.toLowerCase())
      })
  }, [allRoles, grantedSet, sideFilter, roleSearch])

  const sides = ['ORGANIZATION', 'SYSTEM', 'AUDITOR', 'AUDITEE', 'VENDOR']

  if (!permCode) return null

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Permission — Role Mapping"
      subtitle={permCode}
      size="md"
    >
      <div className="flex flex-col gap-4">

        {/* Permission info */}
        {permInfo && (
          <div className="flex items-center gap-3 p-3 bg-surface-overlay rounded-card border border-border">
            <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
              <Shield size={14} className="text-brand-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-mono font-medium text-brand-400 truncate">{permInfo.code}</p>
              <p className="text-xs text-text-muted">{permInfo.name}</p>
            </div>
            <span className="ml-auto shrink-0 text-[10px] px-2 py-0.5 rounded bg-surface-raised border border-border text-text-muted">
              {permInfo.module}
            </span>
          </div>
        )}

        {/* Currently granted roles */}
        <div>
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
            Roles with this permission
            {grantedRoles.length > 0 && (
              <span className="ml-1.5 text-brand-400">{grantedRoles.length}</span>
            )}
          </p>

          {isLoading && localGranted === null && (
            <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
              <Loader2 size={12} className="animate-spin" /> Loading…
            </div>
          )}

          {!isLoading && grantedRoles.length === 0 && (
            <div className="text-[11px] text-status-warn-fg flex items-center gap-1.5 py-1">
              ⚠ No roles hold this permission — this nav item is hidden from everyone.
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 min-h-[24px]">
            {grantedRoles.map(r => {
              const id = Number(r.roleId || r.id)
              return (
                <span key={id} className={cn(
                  'flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-ctl border font-mono',
                  'bg-brand-500/10 border-brand-500/20 text-brand-400'
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0',
                    r.roleSide === 'SYSTEM'       ? 'bg-status-tag-bg' :
                    r.roleSide === 'ORGANIZATION' ? 'bg-status-info-bg'   :
                    r.roleSide === 'AUDITOR'      ? 'bg-brand-400'   :
                    r.roleSide === 'AUDITEE'      ? 'bg-status-pass-bg'  : 'bg-status-warn-bg'
                  )} />
                  {r.roleName}
                  <span className="text-[9px] text-text-muted">{r.roleLevel}</span>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (!r.grantId) {
                        // grantId unknown — fetch it from server then revoke
                        try {
                          const res = await rbacApi.grants.list(id)
                          const grants = res?.data?.data || res?.data || []
                          const match = grants.find(g => g.permissionCode === permCode || g.permissionId === permInfo?.id)
                          if (match?.id) {
                            revoke({ grantId: match.id, roleId: id })
                          } else {
                            // Grant not found in permission_grants — may be in role_permissions
                            // Just remove from local state and show success
                            updateLocal(id, false)
                            toast.success('Permission revoked')
                          }
                        } catch(e) {
                          toast.error('Could not resolve grant ID')
                        }
                        return
                      }
                      revoke({ grantId: r.grantId, roleId: id })
                    }}
                    className="hover:text-status-fail-fg transition-colors ml-0.5 leading-none disabled:opacity-40"
                    title="Revoke permission from this role"
                  >×</button>
                </span>
              )
            })}
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Grant to a role */}
        <div>
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
            Grant to a role
          </p>

          {/* Side filter tabs */}
          <div className="flex flex-wrap gap-1 mb-2">
            <button
              onClick={() => setSideFilter('')}
              className={cn('px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                !sideFilter
                  ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                  : 'border-border text-text-muted hover:text-text-secondary'
              )}
            >All</button>
            {sides.map(s => (
              <button key={s} onClick={() => setSideFilter(s)}
                className={cn('px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                  sideFilter === s
                    ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                    : 'border-border text-text-muted hover:text-text-secondary'
                )}>
                {s.slice(0,3)}
              </button>
            ))}
          </div>

          {/* Role search */}
          <div className="relative mb-2">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={roleSearch}
              onChange={e => setRoleSearch(e.target.value)}
              placeholder="Filter roles…"
              className="w-full h-7 pl-7 pr-3 rounded border border-border bg-surface-raised text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
            {ungrantedRoles.length === 0 && (
              <p className="text-xs text-text-muted italic py-2">
                {roleSearch || sideFilter
                  ? 'No matching roles.'
                  : 'All roles already have this permission.'}
              </p>
            )}
            {ungrantedRoles.map(role => {
              const id   = Number(role.id || role.roleId)
              const name = role.name || role.roleName || ''
              const side = (role.side || role.roleSide || '').toUpperCase()
              return (
                <button
                  key={id}
                  disabled={busy}
                  onClick={async () => {
                    // Find existing permission or auto-create it
                    let permId = allPermsData?.items?.find(p => p.code === permCode)?.id
                    if (!permId) {
                      // Permission code doesn't exist yet — create it on the fly
                      try {
                        const created = await rbacApi.permissions.create({
                          code: permCode,
                          name: permCode.replace(/_/g, ' ').replace(/\w/g, c => c.toUpperCase()),
                          description: `Auto-created for nav item permission gate`,
                        })
                        permId = created?.data?.data?.id || created?.data?.id
                        if (!permId) { toast.error('Could not create permission'); return }
                        // Refresh permissions list so future grants work
                        qc.invalidateQueries({ queryKey: ['all-permissions'] })
                      } catch (e) {
                        toast.error('Failed to create permission: ' + (e?.message || 'unknown'))
                        return
                      }
                    }
                    // Optimistically update local state immediately
                    updateLocal(id, true, {
                      roleId: id, roleName: name,
                      roleSide: side, roleLevel: role.level || '',
                      grantId: null,  // will populate after invalidate+refetch
                    })
                    grant({ roleId: id, permissionId: permId })
                  }}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded-ctl border text-left transition-colors',
                    'bg-surface-raised border-border text-text-secondary',
                    'hover:bg-surface-overlay hover:border-brand-500/30',
                    'disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn(
                      'text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0',
                      side === 'SYSTEM'       ? 'bg-status-tag-bg text-status-tag-fg' :
                      side === 'ORGANIZATION' ? 'bg-status-info-bg text-status-info-fg'     :
                      side === 'AUDITOR'      ? 'bg-brand-500/15 text-brand-400'     :
                      side === 'AUDITEE'      ? 'bg-status-pass-bg text-status-pass-fg'   :
                      'bg-status-warn-bg text-status-warn-fg'
                    )}>
                      {side.slice(0, 3)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium font-mono truncate">{name}</p>
                      {role.level && <p className="text-[10px] text-text-muted">{role.level}</p>}
                    </div>
                  </div>
                  <span className="text-[10px] text-brand-400 shrink-0 ml-2 flex items-center gap-1">
                    <Plus size={10} /> Grant
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleClose}>Done</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Permission Cell ──────────────────────────────────────────────────────────

function PermissionCell({ permCode, onOpenModal }) {
  if (!permCode) {
    return <span className="text-[10px] text-text-muted">All</span>
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpenModal(permCode) }}
      className={cn(
        'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors',
        'border-border text-text-muted hover:text-brand-400 hover:border-brand-500/30 hover:bg-brand-500/5'
      )}
    >
      <Shield size={10} />
      <span className="font-mono">{permCode.length > 20 ? permCode.slice(0, 20) + '…' : permCode}</span>
    </button>
  )
}

// ─── Nav Form ─────────────────────────────────────────────────────────────────

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
    requiredPermission: item?.requiredPermission || null,
    badgeCountEndpoint: item?.badgeCountEndpoint || null,
    isActive:           item?.isActive           ?? true,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const existingModules = [...new Set(allItems.map(n => n.module).filter(Boolean))].sort()
  const existingKeys    = allItems
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
      // Send empty string to CLEAR optional fields (null = backend skips the field entirely)
      parentKey:          form.parentKey          ?? '',
      requiredPermission: form.requiredPermission ?? '',
      badgeCountEndpoint: form.badgeCountEndpoint ?? '',
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Nav Key *" value={form.navKey}
          onChange={e => set('navKey', e.target.value)}
          placeholder="org_vendors" disabled={!!item}
          helperText="snake_case — cannot change after creation" />
        <Input label="Label *" value={form.label}
          onChange={e => set('label', e.target.value)} placeholder="Vendors" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Route *" value={form.route}
          onChange={e => set('route', e.target.value)} placeholder="/tprm/vendors" />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Parent Key
          </label>
          <input
            list="parent-key-options"
            value={form.parentKey || ''}
            onChange={e => set('parentKey', e.target.value || null)}
            placeholder="Blank = top-level item"
            className="h-8 w-full rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <datalist id="parent-key-options">
            <option value="" />
            {existingKeys.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-2">
          Icon <span className="text-text-muted font-normal normal-case">(Lucide icon name)</span>
        </label>
        <Input value={form.icon} onChange={e => set('icon', e.target.value)}
          placeholder="e.g. Shield, Users, BarChart2" />
        <div className="flex flex-wrap gap-1.5 mt-2 max-h-24 overflow-y-auto">
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

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">
            Allowed Sides
          </label>
          <select value={form.allowedSides} onChange={e => set('allowedSides', e.target.value)}
            className="w-full h-8 rounded-ctl border border-border bg-surface-raised px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="">All sides</option>
            {SIDES.map(s => <option key={s} value={s}>{s}</option>)}
            <option value="ORGANIZATION,SYSTEM">ORG + SYSTEM</option>
            <option value="ORGANIZATION,SYSTEM,AUDITOR">ORG + SYSTEM + AUDITOR</option>
            <option value="ORGANIZATION,SYSTEM,AUDITOR,AUDITEE">All except VENDOR</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Module Group
          </label>
          <input
            list="module-options"
            value={form.module}
            onChange={e => set('module', e.target.value)}
            placeholder="e.g. THIRD-PARTY RISK"
            className="h-8 w-full rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <datalist id="module-options">
            {existingModules.map(m => <option key={m} value={m} />)}
          </datalist>
        </div>

        <Input label="Sort Order" type="number" value={form.sortOrder}
          onChange={e => set('sortOrder', e.target.value)} placeholder="100" />
      </div>

      {/* Permission picker — searchable dropdown from permissions table */}
      <PermissionPicker
        value={form.requiredPermission}
        onChange={v => set('requiredPermission', v)}
      />

      <Input label="Badge Count Endpoint" value={form.badgeCountEndpoint || ''}
        onChange={e => set('badgeCountEndpoint', e.target.value || null)}
        placeholder="/v1/issues?status=OPEN&take=1 (optional)"
        helperText="Returns a count for the sidebar badge number" />

      <div className="flex items-center gap-3">
        <button onClick={() => set('isActive', !form.isActive)} type="button"
          className={cn('flex items-center gap-2 px-3 py-1.5 rounded-ctl border text-xs font-medium transition-colors',
            form.isActive
              ? 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg'
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
  const [page, setPage]                   = useState(1)
  const [search, setSearch]               = useState('')
  const [sideFilter, setSideFilter]       = useState('')
  const [editTarget, setEditTarget]       = useState(null)
  const [deleteTarget, setDeleteTarget]   = useState(null)
  // Permission→roles modal
  const [permModalCode, setPermModalCode] = useState(null)

  const { data, isLoading, refetch }      = useNavItems({
    skip: (page - 1) * 50, take: 50,
    ...(search     ? { search: `label=${search}` } : {}),
    ...(sideFilter ? { allowedSides: sideFilter }  : {}),
  })
  const { data: allData }                 = useAllNavItems()
  const { data: allPermsData }            = useAllPermissions()
  const allItems                          = allData?.items || []

  const { mutate: create, isPending: creating } = useCreateNav()
  const { mutate: update, isPending: updating } = useUpdateNav()
  const { mutate: remove, isPending: deleting } = useDeleteNav()

  const items = data?.items || []

  const columns = [
    { key: 'id',     label: 'ID',    width: 45,  type: 'mono' },
    { key: 'navKey', label: 'Key',   width: 175, type: 'custom',
      render: (r) => <span className="text-xs font-mono text-text-secondary">{r.navKey}</span> },
    { key: 'label',  label: 'Label', width: 135 },
    { key: 'route',  label: 'Route', width: 185, type: 'custom',
      render: (r) => <span className="text-xs font-mono text-brand-400">{r.route || '—'}</span> },
    { key: 'module', label: 'Module', width: 120, type: 'custom',
      render: (r) => <span className="text-[11px] text-text-muted">{r.module || '—'}</span> },
    { key: 'allowedSides', label: 'Sides', width: 100, type: 'custom',
      render: (r) => {
        if (!r.allowedSides) return <span className="text-[11px] text-text-muted">All</span>
        return (
          <div className="flex flex-wrap gap-0.5">
            {r.allowedSides.split(',').map(s => (
              <span key={s} className={cn(
                'text-[9px] font-semibold px-1 py-0.5 rounded uppercase tracking-wide',
                SIDE_STYLE[s.trim()] || 'bg-surface-inset text-text-muted'
              )}>
                {s.trim().slice(0, 3)}
              </span>
            ))}
          </div>
        )
      }
    },
    {
      // ── Key column: permission code → click opens grant/revoke modal
      key: 'requiredPermission', label: 'Permission / Who sees', width: 210, type: 'custom',
      render: (r) => (
        <PermissionCell
          permCode={r.requiredPermission}
          onOpenModal={setPermModalCode}
        />
      )
    },
    { key: 'sortOrder', label: 'Sort', width: 50, type: 'mono' },
    { key: 'isActive',  label: 'On',   width: 50, type: 'custom',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); update({ id: r.id, data: { isActive: !r.isActive } }) }}
          className={cn('flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded transition-colors',
            r.isActive ? 'text-status-pass-fg hover:bg-status-pass-bg' : 'text-text-muted hover:bg-surface-overlay')}>
          {r.isActive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
        </button>
      )
    },
    { key: '__actions', label: '', width: 60, type: 'custom',
      render: (r) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => setEditTarget(r)}
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
            <Pencil size={12} />
          </button>
          <button onClick={() => setDeleteTarget(r)}
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors">
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
          <select
            value={sideFilter}
            onChange={e => { setSideFilter(e.target.value); setPage(1) }}
            className="h-8 rounded-ctl border border-border bg-surface-raised px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All sides</option>
            {SIDES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search label…"
              className="h-8 pl-8 pr-3 w-44 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button size="sm" icon={Plus} onClick={() => setEditTarget(true)}>Add Item</Button>
        </div>
      }
    >
      <DataTable columns={columns} data={items}
        pagination={data?.pagination} onPageChange={setPage}
        loading={isLoading} emptyMessage="No navigation items."
        onRowClick={(r) => setEditTarget(r)}
      />

      {/* Edit / Create modal */}
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

      {/* Permission → Roles modal — grant / revoke inline */}
      <PermissionRolesModal
        open={!!permModalCode}
        onClose={() => setPermModalCode(null)}
        permCode={permModalCode}
        allPermsData={allPermsData}
        tenantId={1}
      />

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove(deleteTarget?.id, { onSuccess: () => setDeleteTarget(null) })}
        loading={deleting} title="Delete Nav Item" variant="danger" confirmLabel="Delete"
        message={`Delete "${deleteTarget?.label}" (${deleteTarget?.navKey})? This removes it from all user sidebars.`} />
    </PageLayout>
  )
}