import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectRoleSides, selectAuth } from '../../store/slices/authSlice'
import { tenantsApi } from '../../api/tenants.api'
import { vendorsApi } from '../../api/vendors.api'
import { SYSTEM_TENANT_ID } from '../../utils/permissions'
import { cn } from '../../lib/cn'
import UserManagementPage from './UserManagementPage'

// The four tenant-scoped sides, for any normal organisation tenant.
const SIDE_TABS = [
  { key: 'ORGANIZATION', label: 'Organisation' },
  { key: 'VENDOR',       label: 'Vendor' },
  { key: 'AUDITEE',      label: 'Auditee' },
  { key: 'AUDITOR',      label: 'Auditor' },
]

// The Kashi System Tenant holds platform-admin staff, not org/vendor/
// auditee/auditor users — its only meaningful side is SYSTEM. Showing the
// other four there gave a permanently-empty "0 users" table (which is
// exactly what the Organisation tab showed for it), and SYSTEM users had
// nowhere to be listed or onboarded from at all.
const SYSTEM_TENANT_TABS = [
  { key: 'SYSTEM', label: 'System' },
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
        {tenants.map(t => (
          <option key={t.tenantId} value={t.tenantId}>{t.name}</option>
        ))}
      </select>
    </div>
  )
}

function VendorPicker({ value, onChange, vendors, loading }) {
  return (
    <div className="flex items-center gap-2 px-6 py-3 border-b border-border">
      <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
        Vendor
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="h-8 px-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary
                   focus:outline-none focus:ring-1 focus:ring-brand-500 min-w-[220px]">
        <option value="">
          {loading ? 'Loading vendors…' : 'All vendors'}
        </option>
        {vendors.map(v => (
          <option key={v.id || v.vendorId} value={v.id || v.vendorId}>
            {v.name || v.vendorName}
          </option>
        ))}
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
  //
  // Default the tenant picker to the admin's OWN tenant (Kashi System
  // Tenant, id=1 for a correctly-provisioned platform admin) instead of
  // null. A blank "select a tenant" state with nothing shown by default
  // reads as broken — even for a correctly set-up SYSTEM user, landing on
  // Users should show something (their own platform-tenant's users) rather
  // than an empty picker every single time.
  const { tenantId: ownTenantId } = useSelector(selectAuth)
  const [selectedTenantId, setSelectedTenantId] = useState(ownTenantId ?? null)
  // Start on SYSTEM when the admin's own tenant IS the system tenant, so
  // the first render doesn't land on Organisation and show 0 users.
  const [systemActiveSide, setSystemActiveSide] = useState(
    ownTenantId === SYSTEM_TENANT_ID ? 'SYSTEM' : 'ORGANIZATION'
  )
  const [orgActiveSide, setOrgActiveSide]       = useState('ORGANIZATION')
  // Vendor filter for the Vendor tab — an org (or system) admin can drill
  // into one vendor's team, or leave it on "All vendors" to see everyone.
  // Vendor-side users never see this; the backend pins them to their own
  // vendorId regardless of what's passed.
  const [selectedVendorId, setSelectedVendorId] = useState(null)

  const { data: tenantsData, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants-picker-for-users'],
    queryFn:  () => tenantsApi.list({ take: 200 }),
    enabled:  isSystem,
    staleTime: 60 * 1000,
  })
  const tenants = tenantsData?.items || []

  // Vendors for the picker, scoped to whichever tenant is in view (its own
  // for an org admin, the selected one for a system admin).
  const vendorScopeTenantId = isSystem ? selectedTenantId : ownTenantId
  const activeSideForVendors = isSystem ? systemActiveSide : orgActiveSide
  const { data: vendorsData, isLoading: vendorsLoading } = useQuery({
    queryKey: ['vendors-picker', vendorScopeTenantId],
    queryFn:  () => vendorsApi.list({ take: 200 }),
    enabled:  activeSideForVendors === 'VENDOR' && !!vendorScopeTenantId,
    staleTime: 60 * 1000,
  })
  const vendors = vendorsData?.items || (Array.isArray(vendorsData) ? vendorsData : []) || []

  // Reset the vendor filter when leaving the Vendor tab or switching
  // tenants, so a stale vendor from a previous context doesn't silently
  // keep filtering the list.
  useEffect(() => {
    if (activeSideForVendors !== 'VENDOR') setSelectedVendorId(null)
  }, [activeSideForVendors])
  useEffect(() => { setSelectedVendorId(null) }, [selectedTenantId])

  // Which tabs apply depends on WHICH tenant is selected, not on who's
  // logged in: the system tenant gets the SYSTEM tab, every other tenant
  // gets the usual four. Keep the active side valid whenever the selection
  // changes, or you'd be left on e.g. "Vendor" while viewing the system
  // tenant and see a permanently empty table.
  const isSystemTenantSelected = selectedTenantId === SYSTEM_TENANT_ID
  const activeTabs = isSystemTenantSelected ? SYSTEM_TENANT_TABS : SIDE_TABS

  useEffect(() => {
    if (!isSystem) return
    const valid = activeTabs.some(t => t.key === systemActiveSide)
    if (!valid) setSystemActiveSide(activeTabs[0].key)
  }, [selectedTenantId, isSystem]) // eslint-disable-line react-hooks/exhaustive-deps

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
        vendorId={systemActiveSide === 'VENDOR' ? (selectedVendorId ?? undefined) : undefined}
        subheader={
          <>
            <TenantPicker
              value={selectedTenantId}
              onChange={setSelectedTenantId}
              tenants={tenants}
              loading={tenantsLoading}
            />
            <SideTabBar active={systemActiveSide} onChange={setSystemActiveSide} tabs={activeTabs} />
            {systemActiveSide === 'VENDOR' && (
              <VendorPicker
                value={selectedVendorId}
                onChange={setSelectedVendorId}
                vendors={vendors}
                loading={vendorsLoading}
              />
            )}
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
        vendorId={orgActiveSide === 'VENDOR' ? (selectedVendorId ?? undefined) : undefined}
        subheader={
          <>
            <SideTabBar active={orgActiveSide} onChange={setOrgActiveSide} />
            {orgActiveSide === 'VENDOR' && (
              <VendorPicker
                value={selectedVendorId}
                onChange={setSelectedVendorId}
                vendors={vendors}
                loading={vendorsLoading}
              />
            )}
          </>
        }
      />
    )
  }

  // ── VENDOR / AUDITEE / AUDITOR: only their own side, no tabs at all ──────
  const mySide = roleSides[0] || 'ORGANIZATION'
  return <UserManagementPage side={mySide} />
}