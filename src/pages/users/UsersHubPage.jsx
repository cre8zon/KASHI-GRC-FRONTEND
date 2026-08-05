import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectRoleSides } from '../../store/slices/authSlice'
import { tenantsApi } from '../../api/tenants.api'
import { cn } from '../../lib/cn'
import UserManagementPage from './UserManagementPage'

// Same four tenant-scoped sides as everywhere else in the app (RoleAssignPanel,
// RolesPermissionsPage). SYSTEM is handled separately via a tenant picker,
// since a platform admin isn't "part of" any one tenant the way an
// org/vendor/auditee/auditor user is.
const SIDE_TABS = [
  { key: 'ORGANIZATION', label: 'Organisation' },
  { key: 'VENDOR',       label: 'Vendor' },
  { key: 'AUDITEE',      label: 'Auditee' },
  { key: 'AUDITOR',      label: 'Auditor' },
]

// Underline tab bar — same visual language as RolesPermissionsPage's side
// switcher, so Users and Roles & Permissions read as one consistent family
// of admin screens instead of two different UI systems.
function SideTabBar({ active, onChange, tabs = SIDE_TABS }) {
  return (
    <div className="flex items-center gap-1 px-6 border-b border-border">
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={cn(
            'px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
            active === t.key
              ? 'border-brand-500 text-brand-ink'
              : 'border-transparent text-text-muted hover:text-text-secondary'
          )}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function TenantPicker({ value, onChange, tenants, loading }) {
  return (
    <div className="flex items-center gap-2 px-6 py-3 border-b border-border">
      <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
        Tenant
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="h-8 px-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary
                   focus:outline-none focus:ring-1 focus:ring-brand-500 min-w-[220px]">
        <option value="">{loading ? 'Loading tenants…' : 'Select a tenant…'}</option>
        {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  )
}

export default function UsersHubPage() {
  const roleSides = useSelector(selectRoleSides)
  const isSystem  = roleSides.includes('SYSTEM')
  const isOrgSide = roleSides.includes('ORGANIZATION')

  // Hooks called unconditionally every render, per the rules of hooks —
  // only the JSX return below branches on which side is signed in.
  const [selectedTenantId, setSelectedTenantId] = useState(null)
  const [systemActiveSide, setSystemActiveSide] = useState('ORGANIZATION')
  const [orgActiveSide, setOrgActiveSide]       = useState('ORGANIZATION')

  const { data: tenantsData, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants-picker-for-users'],
    queryFn:  () => tenantsApi.list({ take: 200 }),
    enabled:  isSystem,
    staleTime: 60 * 1000,
  })
  const tenants = tenantsData?.items || []

  // ── SYSTEM: tenant picker, then the same 4 side tabs scoped to it ────────
  if (isSystem) {
    // No tenant chosen yet — don't let UserManagementPage silently fall back
    // to the admin's own tenant (it would, since tenantIdOverride would be
    // undefined). Show the picker on its own until one is selected.
    if (!selectedTenantId) {
      return (
        <div className="flex flex-col h-full">
          <div className="px-6 py-4">
            <h1 className="text-base font-semibold text-text-primary">Users</h1>
            <p className="text-xs text-text-muted mt-0.5">Select a tenant to view its users</p>
          </div>
          <TenantPicker
            value={selectedTenantId}
            onChange={setSelectedTenantId}
            tenants={tenants}
            loading={tenantsLoading}
          />
          <p className="px-6 py-8 text-sm text-text-muted">
            Choose a tenant above to see its users, side by side.
          </p>
        </div>
      )
    }
    return (
      <UserManagementPage
        side={systemActiveSide}
        tenantIdOverride={selectedTenantId}
        subheader={
          <>
            <TenantPicker
              value={selectedTenantId}
              onChange={setSelectedTenantId}
              tenants={tenants}
              loading={tenantsLoading}
            />
            <SideTabBar active={systemActiveSide} onChange={setSystemActiveSide} />
          </>
        }
      />
    )
  }

  // ── ORGANIZATION: sees every side for their own tenant, via tabs ─────────
  if (isOrgSide) {
    return (
      <UserManagementPage
        side={orgActiveSide}
        subheader={<SideTabBar active={orgActiveSide} onChange={setOrgActiveSide} />}
      />
    )
  }

  // ── VENDOR / AUDITEE / AUDITOR: only their own side, no tabs at all ──────
  const mySide = roleSides[0] || 'ORGANIZATION'
  return <UserManagementPage side={mySide} />
}