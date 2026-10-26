import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, Search, RefreshCw, Send, Shield, UserCheck,
  UserX, Check, Loader2, ChevronDown, ChevronUp, AlertTriangle, ShieldCheck, UserMinus, Crown } from 'lucide-react'
import { usersApi } from '../../api/users.api'
import { rolesApi } from '../../api/roles.api'
import { vendorsApi } from '../../api/vendors.api'
import { authApi }            from '../../api/auth.api'
import { PageLayout }         from '../../components/layout/PageLayout'
import { auditorAccessApi } from '../../api/auditorAccess.api'
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
import { SYSTEM_TENANT_ID }   from '../../utils/permissions'
import toast                  from 'react-hot-toast'
import { GlassSelect } from '../../components/ui/GlassSelect'

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

function useOnboardUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: usersApi.invite,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User onboarded') },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Onboarding failed'),
  })
}

function useSuspendUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }) => usersApi.suspend(id, reason),
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

// ── FIX: mutations now accept an onLocalUpdate callback ───────────────────────
// Previously both mutations only invalidated ['users'] on success.
// The modal holds a stale `user` prop so the "Currently Assigned" section
// never updated until the modal was closed and reopened.
// Fix: caller passes onLocalUpdate → modal state is updated immediately on
// mutation success, independent of the server cache invalidation.

function useAssignRole(onLocalUpdate) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tenantId, userId, roleIds }) =>
      rolesApi.assignToUser(tenantId, userId, roleIds),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      onLocalUpdate?.(vars.roleIds, 'add')
      toast.success('Role assigned')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

function useRemoveRole(onLocalUpdate) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tenantId, userId, roleId }) =>
      rolesApi.removeFromUser(tenantId, userId, roleId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      onLocalUpdate?.([vars.roleId], 'remove')
      toast.success('Role removed')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

// ─── Roles Cell ───────────────────────────────────────────────────────────────

function RolesCell({ roles = [] }) {
  const [expanded, setExpanded] = useState(false)

  if (!roles.length) return (
    <span className="flex items-center gap-1 text-[10px] text-status-warn-fg font-medium">
      <AlertTriangle size={10} /> No roles
    </span>
  )

  const visible = expanded ? roles : roles.slice(0, 2)
  const extra   = roles.length - 2

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map(r => (
        <span key={r.id || r.roleId}
          className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-ink border border-brand-500/20 font-mono">
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
//
// FIX — optimistic local role state
//
// Root cause of the bug:
//   `user` is passed as a prop from the parent's `roleTarget` state.
//   When assign/remove mutations succeed they invalidate ['users'], which
//   refetches the table — but the modal is still open with the original
//   `user` prop. React doesn't re-render the modal with the new server data
//   because `roleTarget` in the parent hasn't changed (it still holds the
//   old user object). Result: "Currently Assigned" shows stale roles until
//   the modal is closed and reopened.
//
// Fix:
//   Track assigned roles in `localRoles` state inside the panel, seeded
//   from `user.roles` on mount. Both mutations call `handleLocalUpdate`
//   on success which immediately adds/removes from `localRoles`.
//   The UI reads `localRoles` instead of `user.roles`, so it updates
//   in the same render cycle as the mutation completes — no modal
//   close/reopen needed.

function RoleAssignPanel({ user, tenantId, side }) {
  const [selectedSide, setSelectedSide] = useState(side)

  // ── Local role state — the fix ────────────────────────────────────────────
  // Seeded from user.roles on mount. Updated optimistically on assign/remove.
  const [localRoles, setLocalRoles] = useState(() => user.roles || [])

  // A user's roles all come from exactly one side (enforced server-side in
  // RoleServiceImpl.assignRoleToUser) — once they hold any role, every
  // element of localRoles has the same .side, so the first one tells us
  // which side they're committed to. Lock the tab bar to it so the UI
  // reflects the constraint instead of just failing after a wasted click.
  const committedSide = localRoles[0]?.side || null

  useEffect(() => {
    if (committedSide && selectedSide !== committedSide) setSelectedSide(committedSide)
  }, [committedSide])

  // Also keep a lookup of all role objects we've seen, so when we add a role
  // we can display its name immediately without waiting for a server fetch.
  const { data: rolesData, isLoading } = useRoles(tenantId, selectedSide)

  const flatRoles = (() => {
    const raw = rolesData?.data || rolesData
    if (!raw) return []
    if (raw.hierarchy) return Object.values(raw.hierarchy).flat()
    if (Array.isArray(raw)) return raw.flatMap(r => r.children?.length ? [r, ...r.children] : [r])
    return []
  })()

  // Build a map of roleId → role object from server data so we can enrich
  // newly added roles with their name immediately.
  const roleInfoMap = flatRoles.reduce((acc, r) => {
    const id = r.role_id || r.id || r.roleId
    if (id) acc[id] = r
    return acc
  }, {})

  // Called by both mutations on success — updates local state immediately
  const handleLocalUpdate = (roleIds, action) => {
    setLocalRoles(prev => {
      if (action === 'remove') {
        return prev.filter(r => !roleIds.includes(r.id || r.roleId))
      }
      // action === 'add' — add roles not already in the list
      const existing = new Set(prev.map(r => r.id || r.roleId))
      const toAdd = roleIds
        .filter(id => !existing.has(id))
        .map(id => {
          const info = roleInfoMap[id]
          return info
            ? { id, roleId: id, roleName: info.name || info.roleName, name: info.name || info.roleName }
            : { id, roleId: id, roleName: String(id), name: String(id) }
        })
      return [...prev, ...toAdd]
    })
  }

  const { mutate: assign, isPending: assigning } = useAssignRole(handleLocalUpdate)
  const { mutate: remove, isPending: removing  } = useRemoveRole(handleLocalUpdate)

  const localRoleIds = new Set(localRoles.map(r => r.id || r.roleId))
  const busy = assigning || removing

  const toggleRole = (roleId) => {
    if (busy) return
    if (localRoleIds.has(roleId)) {
      remove({ tenantId, userId: user.id || user.userId, roleId })
    } else {
      assign({ tenantId, userId: user.id || user.userId, roleIds: [roleId] })
    }
  }

  // SYSTEM is only offered when managing a user of the Kashi System Tenant
  // (tenant 1). For every other tenant the backend now rejects a SYSTEM
  // role outright (RoleServiceImpl.assignRoleToUser), so showing the pill
  // there is a dead end that only invites the mistake this rule exists to
  // prevent — it was exactly how PLATFORM_SUPPORT ended up on an org user.
  const SIDES = tenantId === SYSTEM_TENANT_ID
    ? ['SYSTEM']
    : ['ORGANIZATION', 'VENDOR', 'AUDITEE', 'AUDITOR']

  return (
    <div className="flex flex-col gap-3">
      {/* User pill */}
      <div className="flex items-center gap-3 p-3 bg-surface-overlay rounded-card border border-border">
        <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-brand-ink">{initials(user.fullName || user.email)}</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{user.fullName || '—'}</p>
          <p className="text-xs text-text-muted truncate">{user.email}</p>
          {localRoles.length === 0 && (
            <p className="text-[10px] text-status-warn-fg mt-0.5 flex items-center gap-1">
              <AlertTriangle size={9} /> No roles assigned yet
            </p>
          )}
        </div>
      </div>

      {/* Currently assigned roles — reads localRoles, not user.roles */}
      {localRoles.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">
            Currently Assigned
          </p>
          <div className="flex flex-wrap gap-1.5">
            {localRoles.map(r => {
              const id = r.id || r.roleId
              return (
                <span key={id}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-ctl bg-brand-500/10 border border-brand-500/20 text-brand-ink font-mono">
                  {r.roleName || r.name}
                  <button
                    onClick={() => toggleRole(id)}
                    disabled={busy}
                    className="hover:text-status-fail-fg transition-colors ml-0.5 leading-none disabled:opacity-40"
                    title="Remove role"
                  >
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
          {SIDES.map(s => {
            const locked = committedSide && s !== committedSide
            return (
              <button key={s} disabled={locked}
                onClick={() => !locked && setSelectedSide(s)}
                title={locked ? `Locked — this user already holds ${committedSide}-side role(s)` : undefined}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                  locked
                    ? 'border-border/50 text-text-faint cursor-not-allowed'
                    : selectedSide === s
                      ? 'bg-brand-500/15 border-brand-500/40 text-brand-ink'
                      : 'border-border text-text-muted hover:text-text-secondary'
                )}>
                {s}
              </button>
            )
          })}
        </div>
        {committedSide && (
          <p className="text-[10px] text-text-muted mt-1">
            A user's roles all come from one side — this user is on {committedSide}.
          </p>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 size={13} className="text-brand-ink animate-spin" />
          <span className="text-xs text-text-muted">Loading {selectedSide} roles…</span>
        </div>
      )}

      {!isLoading && flatRoles.length === 0 && (
        <p className="text-xs text-text-muted italic">
          No {selectedSide.toLowerCase()} roles defined.
        </p>
      )}

      {/* All available roles — checked state reads localRoleIds */}
      <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
        {flatRoles.map(role => {
          const id       = role.role_id || role.id || role.roleId
          const assigned = localRoleIds.has(id)
          return (
            <button key={id} onClick={() => toggleRole(id)} disabled={busy}
              className={cn(
                'flex items-center justify-between px-3 py-2 rounded-ctl border text-left transition-colors',
                assigned
                  ? 'bg-brand-500/10 border-brand-500/30 text-brand-ink'
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

// ─── Onboard User Modal ───────────────────────────────────────────────────────
// Renamed from "Invite User" to match the existing "Vendor Onboard" language
// used elsewhere in the app — same action (create account + welcome email
// with temp password), just consistent terminology across every side.

function OnboardUserModal({ open, onClose, side, tenantId, vendorId }) {
  const { data: rolesData } = useRoles(tenantId, side)
  const { mutate: invite, isPending } = useOnboardUser()
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', jobTitle: '', roleIds: [], vendorId: '',
  })
  const [errors, setErrors] = useState({})

  // A VENDOR-side user has to belong to an actual vendor. Two cases:
  //  - vendorId already fixed (a vendor-side admin's own vendor, or one
  //    picked in the Vendor filter above) → show it read-only, so it's
  //    always clear who this person is being onboarded for rather than
  //    the field silently vanishing.
  //  - no vendor context (org admin viewing "All vendors") → show a
  //    required picker; without it vendorId went through null and the
  //    user was created orphaned.
  const isVendorSide = side === 'VENDOR'
  const needsVendorPicker = isVendorSide && !vendorId
  const { data: vendorsData, isLoading: vendorsLoading } = useQuery({
    queryKey: ['vendors-picker', tenantId],
    // tenantId so a platform admin onboarding a vendor user into ANOTHER
    // tenant sees that tenant's vendors (ignored server-side for everyone else).
    queryFn:  () => vendorsApi.list({ take: 500, tenantId }),
    // Fetched whenever the modal is open on the vendor side — the fixed
    // case needs it too, to resolve the vendor's NAME for display.
    enabled:  open && isVendorSide,
    staleTime: 60 * 1000,
  })
  const vendors = [...(vendorsData?.items || (Array.isArray(vendorsData) ? vendorsData : []) || [])]
    .sort((a, b) => String(a.name || a.vendorName || '').localeCompare(String(b.name || b.vendorName || ''), undefined, { sensitivity: 'base' }))
  const fixedVendor = vendorId
    ? vendors.find(v => String(v.id ?? v.vendorId) === String(vendorId))
    : null

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
    if (needsVendorPicker && !form.vendorId) e.vendorId = 'Select which vendor this user belongs to'
    setErrors(e)
    return !Object.keys(e).length
  }

  const handleSubmit = () => {
    if (!validate()) return
    invite({
      firstName: form.firstName, lastName: form.lastName,
      email: form.email, jobTitle: form.jobTitle || undefined,
      tenantId,
      // vendorId prop = the creator's own vendor (vendor-side admin).
      // form.vendorId = explicitly picked (org/system admin). Backend
      // overrides with the creator's own vendorId when they have one, and
      // rejects a VENDOR-side user with no vendor at all.
      vendorId: side === 'VENDOR' ? (vendorId || Number(form.vendorId) || undefined) : undefined,
      roleIds: form.roleIds, sendWelcomeEmail: true,
    }, {
      onSuccess: () => {
        onClose()
        setForm({ firstName: '', lastName: '', email: '', jobTitle: '', roleIds: [], vendorId: '' })
        setErrors({})
      },
    })
  }

  const sideLabel = side === 'VENDOR'   ? 'Vendor'   :
                    side === 'SYSTEM'   ? 'System'   :
                    side === 'AUDITOR'  ? 'Auditor'  :
                    side === 'AUDITEE'  ? 'Auditee'  : 'Organisation'

  // Roles grouped by level (L1 = highest authority, down to L4) so the
  // picker reads as an actual hierarchy instead of a flat, unordered bag of
  // chips — the same L1..L4 scale your role catalog already uses
  // (PLATFORM_ADMIN=L1, GRC_MANAGER=L3, EVIDENCE_CONTRIBUTOR=L4, etc.).
  const LEVEL_LABELS = { L1: 'Level 1 — Highest authority', L2: 'Level 2', L3: 'Level 3', L4: 'Level 4 — Contributor' }
  const roleGroups = (() => {
    const byLevel = {}
    for (const role of flatRoles) {
      const lvl = role.level && LEVEL_LABELS[role.level] ? role.level : 'OTHER'
      ;(byLevel[lvl] ||= []).push(role)
    }
    const order = ['L1', 'L2', 'L3', 'L4', 'OTHER']
    return order.filter(l => byLevel[l]?.length).map(l => ({
      level: l, label: LEVEL_LABELS[l] || 'Other', roles: byLevel[l],
    }))
  })()

  return (
    <Modal open={open} onClose={onClose} title={`Onboard ${sideLabel} User`}
      subtitle={fixedVendor
        ? `Creates account and sends welcome email — for ${fixedVendor.name || fixedVendor.vendorName}`
        : `Creates account, sends welcome email, and assigns a ${sideLabel}-side role`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isPending} onClick={handleSubmit}>
            Onboard {sideLabel} User
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

        {isVendorSide && (
          <div>
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-2">
              Vendor <span className="text-status-fail-fg">*</span>
            </label>
            {needsVendorPicker ? (
              <>
                <GlassSelect
                  value={form.vendorId}
                  onChange={e => set('vendorId', e.target.value)}
                  className="h-9 w-full px-2 rounded-ctl border border-border bg-surface-raised text-sm
                             text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                  <option value="">
                    {vendorsLoading ? 'Loading vendors…' : 'Select a vendor…'}
                  </option>
                  {vendors.map(v => (
                    <option key={v.id || v.vendorId} value={v.id || v.vendorId}>
                      {v.name || v.vendorName}
                    </option>
                  ))}
                </GlassSelect>
                <p className="text-[10px] text-text-muted mt-1">
                  Which vendor does this person work for? Vendor users must belong to one.
                </p>
                {errors.vendorId && (
                  <p className="text-xs text-status-fail-fg mt-1.5">{errors.vendorId}</p>
                )}
              </>
            ) : (
              <>
                <div className="h-9 w-full px-3 flex items-center rounded-ctl border border-border
                                bg-surface-overlay text-sm text-text-primary">
                  {fixedVendor
                    ? (fixedVendor.name || fixedVendor.vendorName)
                    : (vendorsLoading ? 'Loading…' : `Vendor #${vendorId}`)}
                </div>
                <p className="text-[10px] text-text-muted mt-1">
                  This user will be onboarded to this vendor. Switch the Vendor filter
                  above to onboard for a different one.
                </p>
              </>
            )}
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-2">
            Assign {sideLabel} Role <span className="text-status-fail-fg">*</span>
          </label>
          {flatRoles.length === 0
            ? <p className="text-xs text-text-muted italic">No roles available for {side}</p>
            : (
              <div className="flex flex-col gap-3">
                {roleGroups.map(group => (
                  <div key={group.level}>
                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.roles.map(role => {
                        const id  = role.role_id || role.id || role.roleId
                        const sel = form.roleIds.includes(id)
                        return (
                          <button key={id} onClick={() => toggleRole(id)} type="button"
                            className={cn(
                              'flex items-center gap-1 px-2.5 py-1 rounded-ctl border text-xs font-medium transition-colors',
                              sel
                                ? 'bg-brand-500/15 border-brand-500/40 text-brand-ink'
                                : 'border-border text-text-muted hover:text-text-primary hover:bg-surface-overlay'
                            )}>
                            {sel && <Check size={10} />}
                            {role.name || role.roleName}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          }
          {errors.roleIds && (
            <p className="text-xs text-status-fail-fg mt-1.5">{errors.roleIds}</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
// Unchanged from original

/**
 * External auditors admitted to this tenant.
 *
 * Shown here because "who can see our data" is the question this page claims to
 * answer, and a list of only employees answers it incompletely. The firms
 * themselves — the commercial grant and its end date — stay on External
 * Auditors; this is the people view.
 *
 * Guests are deliberately NOT rendered as ordinary rows. A DigiOSec auditor
 * displayed identically to your own staff implies they are an employee, and a
 * client admin must not be able to edit the name, email or password of another
 * company's employee — that identity belongs to the firm. Only the membership
 * is theirs to revoke, so revoke is the only action offered.
 */
function ExternalAuditorsSection({ side }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(null)

  // Only the organization view has guests — a vendor or auditor-side listing
  // never does, so skip the request entirely.
  const enabled = side === 'ORGANIZATION'

  const { data: raw } = useQuery({
    queryKey: ['tenant-guest-auditors'],
    queryFn:  () => auditorAccessApi.guests(),
    enabled,
  })
  const guests = Array.isArray(raw) ? raw : (raw?.data?.data || raw?.data || [])

  const { mutate: revoke } = useMutation({
    mutationFn: (membershipId) => auditorAccessApi.revokeGuest(membershipId),
    onSuccess: () => {
      toast.success('Auditor access revoked')
      qc.invalidateQueries({ queryKey: ['tenant-guest-auditors'] })
      setConfirmRevoke(null)
    },
    onError: (e) => toast.error(
      e?.response?.data?.error?.message || 'Could not revoke access'),
  })

  if (!enabled || guests.length === 0) return null

  return (
    <div className="mx-6 mb-6 rounded-card border border-status-warn-bd/50 bg-status-warn-bg/20">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
      >
        <ShieldCheck size={13} className="text-status-warn-fg shrink-0" />
        <span className="text-xs font-semibold text-text-primary">
          External auditors ({guests.length})
        </span>
        <span className="text-[11px] text-text-muted">
          from audit firms — not employees of this organization
        </span>
        <ChevronDown
          size={13}
          className={cn('ml-auto text-text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-4 pb-3 divide-y divide-border/30">
          {guests.map(g => (
            <div key={g.membershipId} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-primary truncate">
                  {g.fullName || g.email}
                </p>
                <p className="text-[11px] text-text-muted truncate">
                  {g.email}
                  {g.firmName ? ` · ${g.firmName}` : ''}
                  {g.accessExpiresAt
                    ? ` · access until ${new Date(g.accessExpiresAt).toLocaleDateString('en-GB',
                        { day: '2-digit', month: 'short', year: 'numeric' })}`
                    : ' · no end date'}
                </p>
              </div>
              <span className="shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-status-warn-bd text-status-warn-fg">
                External
              </span>
              {g.usable && (
                <Button variant="ghost" size="sm" icon={UserMinus}
                  onClick={() => setConfirmRevoke(g)}>Revoke</Button>
              )}
            </div>
          ))}
          <p className="pt-2 text-[10px] text-text-muted">
            Their firm decides who works here. Manage firms on the External Auditors screen.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmRevoke}
        title={`Revoke ${confirmRevoke?.fullName || 'auditor'}?`}
        message="They lose access to this organization immediately. Their account belongs to their firm and is not affected; work they have already recorded is kept."
        confirmLabel="Revoke access"
        onConfirm={() => revoke(confirmRevoke.membershipId)}
        onCancel={() => setConfirmRevoke(null)} />
    </div>
  )
}

export default function UserManagementPage({ side = 'ORGANIZATION', vendorId: vendorIdProp, tenantIdOverride, subheader }) {
  const { tenantId: ownTenantId, userId: meId } = useSelector(selectAuth)
  // SYSTEM callers browsing a specific tenant's users (see UsersHubPage) pass
  // tenantIdOverride; everyone else always uses their own tenant. Backend
  // only honours the override for SYSTEM-side callers regardless, so this
  // is safe even if ever passed incorrectly.
  const tenantId = tenantIdOverride ?? ownTenantId
  const loggedInVendorId  = useSelector(selectVendorId)
  const { hasPermission } = usePermission()

  const [searchParams] = useSearchParams()
  const vendorIdFromUrl = searchParams.get('vendorId')
    ? Number(searchParams.get('vendorId'))
    : null

  const vendorId = vendorIdProp ?? vendorIdFromUrl ?? loggedInVendorId ?? undefined

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
  const [ownerTarget,    setOwnerTarget]    = useState(null)

  // The organisation's one owner: can't be suspended or have the role taken
  // away; only they can hand ownership on. Only for one's own organisation —
  // a platform admin browsing another tenant manages that from the tenant page.
  const ownOrg = side === 'ORGANIZATION' && !tenantIdOverride
  const { data: ownerData } = useQuery({
    queryKey: ['users-owner', ownTenantId],
    queryFn:  () => usersApi.owner(),
    enabled:  ownOrg,
    staleTime: 60_000,
  })
  const ownerId = ownerData?.ownerUserId ?? null
  const iAmOwner = ownerId != null && String(ownerId) === String(meId)
  const qcOwner = useQueryClient()
  const { mutate: makeOwner, isPending: transferring } = useMutation({
    mutationFn: (target) => usersApi.makeOwner(target.id),
    onSuccess: (r) => {
      qcOwner.invalidateQueries({ queryKey: ['users-owner'] })
      qcOwner.invalidateQueries({ queryKey: ['users'] })
      setOwnerTarget(null)
      toast.success(`${r?.ownerName || 'They'} now own${r?.ownerName ? 's' : ''} the organisation`)
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Could not transfer ownership'),
  })

  const { data, isLoading, refetch } = useUsers({
    skip:     (page - 1) * 20,
    take:     20,
    search:   search || undefined,
    sortBy:   `${sortBy}=${sortDir}`,
    side,
    vendorId: side === 'VENDOR' && vendorId ? vendorId : undefined,
    tenantId: tenantIdOverride || undefined,
    // Own staff only. listUsers resolves through memberships, so external
    // auditors were appearing in this table with the full edit, suspend and
    // Manage Roles actions attached — a client admin could change the name,
    // email or roles of another company's employee. They are listed in the
    // External Auditors section above instead, where the only action is
    // revoking their access, which IS the client's to make.
    membershipType: 'HOME',
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
          <span className="text-[10px] font-bold text-brand-ink">
            {initials(row.fullName || row.email)}
          </span>
        </div>
      ),
    },
    {
      key: 'fullName', label: 'Name', sortable: true, width: 180, type: 'custom',
      render: (row) => (
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <span className="truncate">{row.fullName}</span>
          {ownerId != null && String(row.id) === String(ownerId) && (
            <span title="Organisation owner"
              className="inline-flex items-center gap-0.5 shrink-0 h-4 px-1.5 rounded-badge bg-brand-500/15 text-brand-ink text-[10px] font-semibold">
              <Crown size={9} /> Owner
            </span>
          )}
        </span>
      ),
    },
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
    { key: 'createdAt', label: 'Onboarded', sortable: true, width: 110, type: 'date' },
    {
      key: '__actions', label: '', width: 120, type: 'custom',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {canManageRoles && (
            <button onClick={() => setRoleTarget(row)} title="Manage roles"
              className={cn(
                'h-6 w-6 flex items-center justify-center rounded transition-colors',
                (!row.roles || row.roles.length === 0)
                  ? 'text-status-warn-fg bg-status-warn-bg hover:bg-status-warn-bg'
                  : 'text-text-muted hover:text-brand-ink hover:bg-brand-500/10'
              )}>
              <Shield size={12} />
            </button>
          )}
          <button onClick={() => setResendTarget(row)} title="Resend invitation"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-ink hover:bg-brand-500/10 transition-colors">
            <Send size={12} />
          </button>
          {iAmOwner && row.status === 'ACTIVE' && String(row.id) !== String(ownerId) && (
            <button onClick={() => setOwnerTarget(row)} title="Make owner"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-ink hover:bg-brand-500/10 transition-colors">
              <Crown size={12} />
            </button>
          )}
          {canEdit && row.status === 'ACTIVE'
            && String(row.id) !== String(meId)
            && !(ownerId != null && String(row.id) === String(ownerId)) && (
            <button onClick={() => setConfirmSuspend(row)} title="Suspend"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors">
              <UserX size={12} />
            </button>
          )}
          {canEdit && row.status === 'SUSPENDED' && (
            <button onClick={() => activate(row.id)} title="Activate"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-pass-fg hover:bg-status-pass-bg transition-colors">
              <UserCheck size={12} />
            </button>
          )}
        </div>
      ),
    },
  ]

  const sideLabel   = side === 'VENDOR'   ? 'Vendor'   :
                      side === 'SYSTEM'   ? 'System'   :
                      side === 'AUDITOR'  ? 'Auditor'  :
                      side === 'AUDITEE'  ? 'Auditee'  : 'Organisation'
  const pageTitle   = side === 'VENDOR'   ? 'Vendor Team'        :
                      side === 'SYSTEM'   ? 'System Users'       :
                      side === 'AUDITOR'  ? 'Auditors'           :
                      side === 'AUDITEE'  ? 'Auditees'           : 'Users'
  // Onboard label always names the side — no silent fallback to a generic
  // "Onboard User" that hides which side/hierarchy an admin is adding into.
  const inviteLabel = `Onboard ${sideLabel} User`

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
              className="h-8 pl-8 pr-3 w-48 rounded-ctl border border-border glass-field text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
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
      {subheader}

      {/* Guests first: an admin scanning for unexpected access should meet it
          before scrolling a list of their own staff. */}
      <ExternalAuditorsSection side={side} />

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

      <OnboardUserModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        side={side}
        tenantId={tenantId}
        vendorId={vendorId}
      />

      {/* Role modal — key={roleTarget?.id} forces RoleAssignPanel to
          remount with fresh localRoles state each time a different user
          is opened. Without this, switching from user A to user B
          would show user A's cached localRoles until the panel re-seeded. */}
      <Modal open={!!roleTarget} onClose={() => setRoleTarget(null)}
        title="Manage Roles" size="sm">
        {roleTarget && (
          <RoleAssignPanel
            key={roleTarget.id || roleTarget.userId}
            user={roleTarget}
            tenantId={tenantId}
            side={side}
          />
        )}
      </Modal>

      <SuspendUserDialog
        user={confirmSuspend}
        onClose={() => setConfirmSuspend(null)}
        loading={suspending}
        onConfirm={(reason) => suspend({ id: confirmSuspend?.id, reason }, { onSuccess: () => setConfirmSuspend(null) })}
      />

      <ConfirmDialog
        open={!!ownerTarget}
        onClose={() => setOwnerTarget(null)}
        onConfirm={() => makeOwner(ownerTarget)}
        loading={transferring}
        title="Transfer ownership"
        variant="primary"
        confirmLabel="Make owner"
        message={`Make ${ownerTarget?.fullName || ownerTarget?.email} the owner of this organisation? They become the one person who can hand ownership on. You keep administrator access.`}
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

/**
 * Suspend someone: a reason (kept in their status history) and, before
 * confirming, what it affects — their open tasks go back to unassigned for
 * someone to pick up, and their delegations end. They are signed out on their
 * next request.
 */
function SuspendUserDialog({ user, onClose, onConfirm, loading }) {
  const [reason, setReason] = useState('')
  const [was, setWas] = useState(null)
  if ((user?.id ?? null) !== was) { setWas(user?.id ?? null); setReason('') }
  const { data: impact, isLoading } = useQuery({
    queryKey: ['user-responsibilities', user?.id],
    queryFn:  () => usersApi.responsibilities(user.id),
    enabled:  !!user,
    staleTime: 0,
  })
  const tasks = impact?.blocking_responsibilities?.open_tasks ?? 0
  const delegations = impact?.blocking_responsibilities?.active_delegations ?? 0
  const b = impact?.blocking_responsibilities || {}
  const items = b.action_items ?? 0
  const reviews = b.reviews ?? 0
  const assignments = (b.assessment_assignments ?? 0) + (b.audit_assignments ?? 0)
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
  const name = user?.fullName || user?.email
  return (
    <Modal open={!!user} onClose={onClose} size="sm" title="Suspend user"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="danger" size="sm" loading={loading} onClick={() => onConfirm(reason.trim())}>Suspend</Button>
        </div>
      }>
      <div className="space-y-3 text-sm text-text-secondary">
        <p>
          Suspend <span className="font-semibold text-text-primary">{name}</span>? They are signed out straight
          away, and stay suspended until someone activates them again.
        </p>
        <div className="rounded-ctl border border-border-subtle bg-surface-overlay px-3 py-2 text-xs">
          {isLoading ? <span className="text-text-muted">Checking what this affects…</span> : (
            <ul className="space-y-1">
              <li>{tasks === 0 ? 'No open tasks.' : `${tasks} open task${tasks === 1 ? '' : 's'} will go back to unassigned, for someone to pick up.`}</li>
              {items > 0 && <li>{plural(items, 'action item', 'action items')} will go back to whoever handed {items === 1 ? 'it' : 'them'} out.</li>}
              {reviews > 0 && <li>{plural(reviews, 'review', 'reviews')} waiting on them will go back to whoever raised {reviews === 1 ? 'it' : 'them'}.</li>}
              {assignments > 0 && <li>{plural(assignments, 'assessment or audit assignment', 'assessment or audit assignments')} will be cleared, and the people running those will be told.</li>}
              {delegations > 0 && <li>{delegations} delegation{delegations === 1 ? '' : 's'} will end.</li>}
            </ul>
          )}
        </div>
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Reason <span className="text-text-muted font-normal">(kept in their account history)</span></span>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            placeholder="e.g. Left the company on 24 Oct"
            className="mt-1 w-full rounded-ctl border border-border glass-field px-3 py-2 text-sm text-text-primary" />
        </label>
      </div>
    </Modal>
  )
}