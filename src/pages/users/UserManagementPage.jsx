import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, RefreshCw, Send, Shield, UserCheck,
  UserX, Check, Loader2, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react'
import { usersApi } from '../../api/users.api'
import { rolesApi } from '../../api/roles.api'
import { authApi }            from '../../api/auth.api'
import { PageLayout }         from '../../components/layout/PageLayout'
import { DataTable }          from '../../components/ui/DataTable'
import { Button }             from '../../components/ui/Button'
import { Badge }              from '../../components/ui/Badge'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { Input }              from '../../components/ui/Input'
import { cn }                 from '../../lib/cn'
import { formatDate, initials } from '../../utils/format'
import { useSelector }        from 'react-redux'
import { selectAuth, selectVendorId } from '../../store/slices/authSlice'
import { usePermission }      from '../../hooks/usePermission'
import toast                  from 'react-hot-toast'

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useUsers = (params) => useQuery({
  queryKey: ['users', params],
  queryFn:  () => usersApi.list(params),
  keepPreviousData: true,
})

const useRoles = (tenantId, side) => useQuery({
  queryKey: ['roles', tenantId, side],
  queryFn:  () => rolesApi.list(tenantId, side),
  enabled:  !!tenantId,
  staleTime: 5 * 60 * 1000,
})

function useInviteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: usersApi.invite,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('Invitation sent') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Invite failed'),
  })
}

function useSuspendUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => usersApi.suspend(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User suspended') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

function useActivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => usersApi.activate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User activated') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

function useAssignRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tenantId, userId, roleIds }) =>
      rolesApi.assignToUser(tenantId, userId, roleIds),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('Role assigned') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

function useRemoveRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tenantId, userId, roleId }) =>
      rolesApi.removeFromUser(tenantId, userId, roleId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('Role removed') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

// ─── Roles Cell ───────────────────────────────────────────────────────────────

function RolesCell({ roles = [] }) {
  const [expanded, setExpanded] = useState(false)

  if (!roles.length) return (
    <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
      <AlertTriangle size={10} /> No roles
    </span>
  )

  const visible = expanded ? roles : roles.slice(0, 2)
  const extra   = roles.length - 2

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map(r => (
        <span key={r.id || r.roleId}
          className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-mono">
          {r.roleName || r.name}
        </span>
      ))}
      {!expanded && extra > 0 && (
        <button onClick={e => { e.stopPropagation(); setExpanded(true) }}
          className="text-[10px] text-text-muted hover:text-text-primary flex items-center gap-0.5">
          +{extra} <ChevronDown size={9} />
        </button>
      )}
      {expanded && extra > 0 && (
        <button onClick={e => { e.stopPropagation(); setExpanded(false) }}
          className="text-[10px] text-text-muted hover:text-text-primary flex items-center gap-0.5">
          less <ChevronUp size={9} />
        </button>
      )}
    </div>
  )
}

// ─── Role Assignment Panel ────────────────────────────────────────────────────

function RoleAssignPanel({ user, tenantId, side }) {
  const [selectedSide, setSelectedSide] = useState(side)
  const { data: rolesData, isLoading } = useRoles(tenantId, selectedSide)
  const { mutate: assign, isPending: assigning } = useAssignRole()
  const { mutate: remove, isPending: removing  } = useRemoveRole()

  const flatRoles = (() => {
    const raw = rolesData?.data || rolesData
    if (!raw) return []
    if (raw.hierarchy) return Object.values(raw.hierarchy).flat()
    if (Array.isArray(raw)) return raw.flatMap(r => r.children?.length ? [r, ...r.children] : [r])
    return []
  })()

  const userRoleIds = new Set((user.roles || []).map(r => r.id || r.roleId))
  const busy = assigning || removing

  const toggleRole = (roleId) => {
    if (busy) return
    if (userRoleIds.has(roleId)) {
      remove({ tenantId, userId: user.id || user.userId, roleId })
    } else {
      assign({ tenantId, userId: user.id || user.userId, roleIds: [roleId] })
    }
  }

  const SIDES = ['ORGANIZATION', 'VENDOR', 'AUDITEE', 'AUDITOR', 'SYSTEM']

  return (
    <div className="flex flex-col gap-3">
      {/* User pill */}
      <div className="flex items-center gap-3 p-3 bg-surface-overlay rounded-lg border border-border">
        <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-brand-400">{initials(user.fullName || user.email)}</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{user.fullName || '—'}</p>
          <p className="text-xs text-text-muted truncate">{user.email}</p>
          {(!user.roles || user.roles.length === 0) && (
            <p className="text-[10px] text-amber-400 mt-0.5 flex items-center gap-1">
              <AlertTriangle size={9} /> No roles assigned yet
            </p>
          )}
        </div>
      </div>

      {/* Currently assigned roles as removable chips */}
      {user.roles && user.roles.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">
            Currently Assigned
          </p>
          <div className="flex flex-wrap gap-1.5">
            {user.roles.map(r => {
              const id = r.id || r.roleId
              return (
                <span key={id}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-brand-500/10 border border-brand-500/20 text-brand-400 font-mono">
                  {r.roleName || r.name}
                  <button onClick={() => toggleRole(id)} disabled={busy}
                    className="hover:text-red-400 transition-colors ml-0.5 leading-none"
                    title="Remove role">
                    ×
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Side selector */}
      <div>
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">
          Add Roles From
        </p>
        <div className="flex flex-wrap gap-1">
          {SIDES.map(s => (
            <button key={s} onClick={() => setSelectedSide(s)}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                selectedSide === s
                  ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                  : 'border-border text-text-muted hover:text-text-secondary'
              )}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Role list for selected side */}
      {isLoading && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 size={13} className="text-brand-400 animate-spin" />
          <span className="text-xs text-text-muted">Loading {selectedSide} roles…</span>
        </div>
      )}

      {!isLoading && flatRoles.length === 0 && (
        <p className="text-xs text-text-muted italic">
          No {selectedSide.toLowerCase()} roles defined.
        </p>
      )}

      <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
        {flatRoles.map(role => {
          const id       = role.role_id || role.id || role.roleId
          const assigned = userRoleIds.has(id)
          return (
            <button key={id} onClick={() => toggleRole(id)} disabled={busy}
              className={cn(
                'flex items-center justify-between px-3 py-2 rounded-md border text-left transition-colors',
                assigned
                  ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
                  : 'bg-surface-raised border-border text-text-secondary hover:bg-surface-overlay',
                busy && 'opacity-50 cursor-not-allowed'
              )}>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{role.name || role.roleName}</p>
                {role.level && <p className="text-[10px] text-text-muted">{role.level}</p>}
              </div>
              {assigned
                ? <Check size={13} className="shrink-0 ml-2" />
                : <span className="text-[10px] text-text-muted shrink-0 ml-2">+ Add</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Invite User Modal ────────────────────────────────────────────────────────

function InviteUserModal({ open, onClose, side, tenantId, vendorId }) {
  const { data: rolesData } = useRoles(tenantId, side)
  const { mutate: invite, isPending } = useInviteUser()
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', jobTitle: '', roleIds: [],
  })
  const [errors, setErrors] = useState({})

  const flatRoles = (() => {
    const raw = rolesData?.data || rolesData
    if (!raw) return []
    if (raw.hierarchy) return Object.values(raw.hierarchy).flat()
    if (Array.isArray(raw)) return raw.flatMap(r => r.children?.length ? [r, ...r.children] : [r])
    return []
  })()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleRole = (id) => setForm(f => ({
    ...f,
    roleIds: f.roleIds.includes(id)
      ? f.roleIds.filter(x => x !== id)
      : [...f.roleIds, id],
  }))

  const validate = () => {
    const e = {}
    if (!form.firstName.trim()) e.firstName = 'Required'
    if (!form.lastName.trim())  e.lastName  = 'Required'
    if (!form.email.trim())     e.email     = 'Required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email'
    if (form.roleIds.length === 0) e.roleIds = 'Select at least one role'
    setErrors(e)
    return !Object.keys(e).length
  }

  const handleSubmit = () => {
    if (!validate()) return
    invite({
      firstName: form.firstName, lastName: form.lastName,
      email: form.email, jobTitle: form.jobTitle || undefined,
      tenantId,
      vendorId: side === 'VENDOR' ? vendorId : undefined,
      roleIds: form.roleIds, sendWelcomeEmail: true,
    }, {
      onSuccess: () => {
        onClose()
        setForm({ firstName: '', lastName: '', email: '', jobTitle: '', roleIds: [] })
        setErrors({})
      },
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite User"
      subtitle="Creates account and sends welcome email with temporary password"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isPending} onClick={handleSubmit}>
            Send Invitation
          </Button>
        </div>
      }>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="First Name *" value={form.firstName}
            onChange={e => set('firstName', e.target.value)} error={errors.firstName} />
          <Input label="Last Name *" value={form.lastName}
            onChange={e => set('lastName', e.target.value)} error={errors.lastName} />
        </div>
        <Input label="Work Email *" type="email" value={form.email}
          onChange={e => set('email', e.target.value)} error={errors.email} />
        <Input label="Job Title" value={form.jobTitle}
          onChange={e => set('jobTitle', e.target.value)}
          placeholder="e.g. Security Analyst" />

        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-2">
            Assign Role <span className="text-red-400">*</span>
          </label>
          {flatRoles.length === 0
            ? <p className="text-xs text-text-muted italic">No roles available for {side}</p>
            : (
              <div className="flex flex-wrap gap-2">
                {flatRoles.map(role => {
                  const id  = role.role_id || role.id || role.roleId
                  const sel = form.roleIds.includes(id)
                  return (
                    <button key={id} onClick={() => toggleRole(id)} type="button"
                      className={cn(
                        'flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors',
                        sel
                          ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                          : 'border-border text-text-muted hover:text-text-primary hover:bg-surface-overlay'
                      )}>
                      {sel && <Check size={10} />}
                      {role.name || role.roleName}
                    </button>
                  )
                })}
              </div>
            )
          }
          {errors.roleIds && (
            <p className="text-xs text-red-400 mt-1.5">{errors.roleIds}</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UserManagementPage({ side = 'ORGANIZATION' }) {
  const { tenantId } = useSelector(selectAuth)
  const vendorId     = useSelector(selectVendorId)
  const { hasPermission } = usePermission()

  const canInvite      = hasPermission('USER_CREATE')
  const canEdit        = hasPermission('USER_EDIT')
  const canManageRoles = hasPermission('ROLE_MANAGE')

  const [page,           setPage]           = useState(1)
  const [search,         setSearch]         = useState('')
  const [sortBy,         setSortBy]         = useState('createdAt')
  const [sortDir,        setSortDir]        = useState('desc')
  const [showInvite,     setShowInvite]     = useState(false)
  const [roleTarget,     setRoleTarget]     = useState(null)
  const [confirmSuspend, setConfirmSuspend] = useState(null)
  const [resendTarget,   setResendTarget]   = useState(null)

  const { data, isLoading, refetch } = useUsers({
    skip:   (page - 1) * 20,
    take:   20,
    search: search || undefined,
    sortBy: `${sortBy}=${sortDir}`,
    side,
  })

  const { mutate: suspend,  isPending: suspending  } = useSuspendUser()
  const { mutate: activate, isPending: activating  } = useActivateUser()
  const { mutate: resend,   isPending: resending   } = useMutation({
    mutationFn: (target) => authApi.resendInvitation({
      userId: target.id, email: target.email, sendEmail: true,
    }),
    onSuccess: () => { setResendTarget(null); toast.success('Invitation resent') },
    onError:   () => toast.error('Failed to resend'),
  })

  const handleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
  }

  const users = (data?.items || []).map(u => ({ ...u, id: u.userId || u.id }))

  const columns = [
    {
      key: '__avatar', label: '', width: 36, type: 'custom',
      render: (row) => (
        <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-brand-400">
            {initials(row.fullName || row.email)}
          </span>
        </div>
      ),
    },
    { key: 'fullName',  label: 'Name',    sortable: true,  width: 180 },
    { key: 'email',     label: 'Email',   sortable: true,  width: 220, type: 'mono' },
    {
      key: 'roles', label: 'Roles', width: 240, type: 'custom',
      render: (row) => <RolesCell roles={row.roles || []} />,
    },
    {
      key: 'status', label: 'Status', sortable: true, width: 90, type: 'custom',
      render: (row) => (
        <Badge value={row.status} label={row.status}
          colorTag={
            row.status === 'ACTIVE'    ? 'green' :
            row.status === 'SUSPENDED' ? 'red'   : 'amber'
          } />
      ),
    },
    { key: 'createdAt', label: 'Invited', sortable: true, width: 110, type: 'date' },
    {
      key: '__actions', label: '', width: 120, type: 'custom',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {canManageRoles && (
            <button onClick={() => setRoleTarget(row)} title="Manage roles"
              className={cn(
                'h-6 w-6 flex items-center justify-center rounded transition-colors',
                (!row.roles || row.roles.length === 0)
                  ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                  : 'text-text-muted hover:text-brand-400 hover:bg-brand-500/10'
              )}>
              <Shield size={12} />
            </button>
          )}
          <button onClick={() => setResendTarget(row)} title="Resend invitation"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
            <Send size={12} />
          </button>
          {canEdit && row.status === 'ACTIVE' && (
            <button onClick={() => setConfirmSuspend(row)} title="Suspend"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <UserX size={12} />
            </button>
          )}
          {canEdit && row.status === 'SUSPENDED' && (
            <button onClick={() => activate(row.id)} title="Activate"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-green-400 hover:bg-green-500/10 transition-colors">
              <UserCheck size={12} />
            </button>
          )}
        </div>
      ),
    },
  ]

  const pageTitle   = side === 'VENDOR'   ? 'Vendor Team'        :
                      side === 'SYSTEM'   ? 'System Users'       :
                      side === 'AUDITOR'  ? 'Auditors'           :
                      side === 'AUDITEE'  ? 'Auditees'           : 'Users'
  const inviteLabel = side === 'VENDOR'   ? 'Invite Vendor User' :
                      side === 'SYSTEM'   ? 'Invite System User' : 'Invite User'

  return (
    <PageLayout
      title={pageTitle}
      subtitle={data?.pagination ? `${data.pagination.totalItems} users` : undefined}
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search users…"
              className="h-8 pl-8 pr-3 w-48 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          {canInvite && (
            <Button size="sm" icon={Plus} onClick={() => setShowInvite(true)}>
              {inviteLabel}
            </Button>
          )}
        </div>
      }
    >
      <DataTable
        columns={columns}
        data={users}
        pagination={data?.pagination}
        onPageChange={setPage}
        onSort={handleSort}
        sortBy={sortBy}
        sortDir={sortDir}
        loading={isLoading}
        emptyMessage={`No ${pageTitle.toLowerCase()} found`}
      />

      <InviteUserModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        side={side}
        tenantId={tenantId}
        vendorId={vendorId}
      />

      <Modal open={!!roleTarget} onClose={() => setRoleTarget(null)}
        title="Manage Roles" size="sm">
        {roleTarget && (
          <RoleAssignPanel
            user={roleTarget}
            tenantId={tenantId}
            side={side}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmSuspend}
        onClose={() => setConfirmSuspend(null)}
        onConfirm={() => suspend(confirmSuspend?.id, { onSuccess: () => setConfirmSuspend(null) })}
        loading={suspending}
        title="Suspend User"
        variant="danger"
        confirmLabel="Suspend"
        message={`Suspend ${confirmSuspend?.fullName || confirmSuspend?.email}? They will lose access immediately.`}
      />

      <ConfirmDialog
        open={!!resendTarget}
        onClose={() => setResendTarget(null)}
        onConfirm={() => resend(resendTarget)}
        loading={resending}
        title="Resend Invitation"
        variant="primary"
        confirmLabel="Resend"
        message={`Resend welcome email to ${resendTarget?.email}? Their current password will be invalidated.`}
      />
    </PageLayout>
  )
}