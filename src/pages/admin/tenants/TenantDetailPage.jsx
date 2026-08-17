import { useParams, useNavigate } from 'react-router-dom'
import { useTenant, useUpdateTenant } from '../../../hooks/useTenants'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Card, CardHeader, CardBody } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { PageSkeleton } from '../../../components/ui/EmptyState'
import { formatDate } from '../../../utils/format'
import { Building2, Users, Shield, Settings, Mail, PauseCircle, CheckCircle2, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ConfirmDialog } from '../../../components/ui/Modal'
import { useMutation, useQuery } from '@tanstack/react-query'
import { tenantsApi } from '../../../api/tenants.api'
import { authApi } from '../../../api/auth.api'
import toast from 'react-hot-toast'

export default function TenantDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: tenant, isLoading } = useTenant(id)
  const { mutate: updateTenant, isPending } = useUpdateTenant()
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const [confirmResend, setConfirmResend]   = useState(false)

  // Fetch tenant owner
  const { data: tenantOwner } = useQuery({
    queryKey: ['tenant-owner', id],
    queryFn:  () => tenantsApi.getOwner(id),
    enabled:  !!id,
  })

  // Reset password + send welcome email in one shot
  const { mutate: resendWelcome, isPending: resending } = useMutation({
    mutationFn: () => authApi.resendInvitation({
      userId:    tenantOwner?.userId,
      email:     tenantOwner?.email,
      sendEmail: true,
    }),
    onSuccess: () => {
      setConfirmResend(false)
      toast.success(`Welcome email sent to ${tenantOwner?.email}`)
    },
    onError: (err) => {
      setConfirmResend(false)
      toast.error(err?.response?.data?.error?.message || 'Failed to send welcome email')
    },
  })

  if (isLoading) return <PageSkeleton />
  if (!tenant) return <div className="p-6 text-text-muted">Tenant not found</div>

  const statusColor = { ACTIVE: 'green', TRIAL: 'blue', SUSPENDED: 'amber', INACTIVE: 'gray' }[tenant.status] || 'gray'

  return (
    <PageLayout
      title={tenant.name}
      subtitle={`TNT-${String(tenant.tenantId).padStart(4, '0')} · ${tenant.code}`}
      onBack={() => navigate('/tenants')}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary" size="sm" icon={Mail}
            onClick={() => setConfirmResend(true)}
            loading={resending}
            disabled={!tenantOwner?.userId}
          >
            Send Welcome Email
          </Button>
          {tenant.status === 'SUSPENDED'
            ? <Button size="sm" icon={CheckCircle2}
                onClick={() => updateTenant({ id: tenant.tenantId, data: { status: 'ACTIVE' } })}
                loading={isPending}>Activate</Button>
            : <Button variant="warning" size="sm" icon={PauseCircle}
                onClick={() => setConfirmSuspend(true)}>Suspend</Button>
          }
        </div>
      }
    >
      <div className="p-6 grid grid-cols-12 gap-4">
        <div className="col-span-4">
          <Card>
            <CardBody>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-card bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                  <Building2 size={22} className="text-brand-ink" />
                </div>
                <div>
                  <p className="font-bold text-text-primary">{tenant.name}</p>
                  <p className="text-xs font-mono text-text-muted">{tenant.code}</p>
                </div>
              </div>

              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Status</span>
                  <Badge value={tenant.status} colorTag={statusColor} label={tenant.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Plan</span>
                  <Badge value={tenant.plan} colorTag="blue" label={tenant.plan} />
                </div>
                {/* An audit firm is an ordinary tenant in every other respect —
                    the flag only means its people can be assigned into client
                    tenants as external auditors. Saying so beats a bare badge
                    an admin has to guess the meaning of. */}
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Organization Type</span>
                  <Badge
                    value={tenant.isAuditFirm ? 'AUDIT_FIRM' : 'CUSTOMER'}
                    colorTag={tenant.isAuditFirm ? 'purple' : 'gray'}
                    label={tenant.isAuditFirm ? 'Audit firm' : 'Customer'} />
                </div>
                {tenant.isAuditFirm && (
                  <p className="text-[10px] text-text-muted leading-relaxed pt-0.5">
                    Auditors from this organization can be assigned into client tenants
                    once a client grants the firm access.
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Max Users</span>
                  <span className="font-mono text-xs text-text-primary">{tenant.maxUsers ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Max Vendors</span>
                  <span className="font-mono text-xs text-text-primary">{tenant.maxVendors ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Created</span>
                  <span className="text-xs text-text-primary">{formatDate(tenant.createdAt)}</span>
                </div>
              </div>

              {/* Organization Owner */}
              {tenantOwner?.email && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                    Organization Owner
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center text-xs font-bold text-brand-ink shrink-0">
                      {(tenantOwner.firstName || tenantOwner.email)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {tenantOwner.fullName ||
                          [tenantOwner.firstName, tenantOwner.lastName].filter(Boolean).join(' ') ||
                          tenantOwner.email}
                      </p>
                      <p className="text-xs text-text-muted font-mono truncate">{tenantOwner.email}</p>
                    </div>
                    <span className="text-[10px] bg-status-warn-bg text-status-warn-fg border border-status-warn-bd px-1.5 py-0.5 rounded-full font-semibold shrink-0 ml-auto">
                      Owner
                    </span>
                  </div>
                </div>
              )}

              {tenant.description && (
                <p className="text-xs text-text-muted mt-4 pt-4 border-t border-border leading-relaxed">
                  {tenant.description}
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="col-span-8">
          <Card>
            <CardHeader title="Quick Actions" />
            <CardBody>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    icon: Users,
                    label: 'Manage Users',
                    desc: 'View and manage tenant users',
                    action: () => navigate('/users'),
                  },
                  {
                    icon: Shield,
                    label: 'Branding & Config',
                    desc: 'Customize tenant appearance',
                    action: () => {},
                  },
                  {
                    icon: Mail,
                    label: 'Resend Welcome Email',
                    desc: tenantOwner?.email
                      ? `Send to owner: ${tenantOwner.email}`
                      : 'No owner found for this tenant',
                    action: () => tenantOwner?.userId
                      ? setConfirmResend(true)
                      : toast.error('No owner found for this tenant'),
                  },
                  {
                    icon: Settings,
                    label: 'Subscription',
                    desc: 'View or change subscription plan',
                    action: () => {},
                  },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="text-left p-4 border border-border rounded-card hover:border-brand-500/30 hover:bg-surface-overlay transition-all group"
                  >
                    <item.icon size={18} className="text-brand-ink mb-2" strokeWidth={1.75} />
                    <p className="text-sm font-semibold text-text-primary group-hover:text-brand-ink transition-colors">
                      {item.label}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">{item.desc}</p>
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Feature entitlements — what this tenant has licensed */}
        <div className="col-span-12">
          <TenantFeaturesCard tenantId={tenant.tenantId} />
        </div>
      </div>

      {/* Suspend confirm */}
      <ConfirmDialog
        open={confirmSuspend}
        onClose={() => setConfirmSuspend(false)}
        onConfirm={() => updateTenant(
          { id: tenant.tenantId, data: { status: 'SUSPENDED' } },
          { onSuccess: () => setConfirmSuspend(false) }
        )}
        title="Suspend Tenant"
        confirmLabel="Suspend"
        variant="danger"
        loading={isPending}
        message={`This will suspend ${tenant.name} and restrict their access. All data will be preserved.`}
      />

      {/* Resend welcome email confirm */}
      <ConfirmDialog
        open={confirmResend}
        onClose={() => setConfirmResend(false)}
        onConfirm={() => resendWelcome()}
        title="Resend Welcome Email"
        confirmLabel="Reset & Send"
        variant="primary"
        loading={resending}
        message={
          tenantOwner?.email
            ? `This will generate a new temporary password for ${tenantOwner.fullName || tenantOwner.email} (Organization Owner) and send a fresh welcome email to ${tenantOwner.email}. Their current password will be invalidated immediately.`
            : 'No owner found for this tenant.'
        }
      />
    </PageLayout>
  )
}

// ─── Feature Entitlements ─────────────────────────────────────────────────────
// Model B: a tenant HAS a feature iff an explicit enabled row exists. The
// catalogue (global rows) defines what's licensable; toggling here writes the
// tenant-scoped row. This is the one place to see and manage what a tenant owns.

function TenantFeaturesCard({ tenantId }) {
  const qc = useQueryClient()

  const { data: features, isLoading } = useQuery({
    queryKey: ['tenant-features', tenantId],
    queryFn:  () => tenantsApi.getFeatures(tenantId),
    enabled:  !!tenantId,
  })

  const { mutate: toggle, isPending } = useMutation({
    mutationFn: ({ flagKey, enabled }) => tenantsApi.setFeature(tenantId, flagKey, enabled),
    onMutate: async ({ flagKey, enabled }) => {
      await qc.cancelQueries({ queryKey: ['tenant-features', tenantId] })
      const prev = qc.getQueryData(['tenant-features', tenantId])
      qc.setQueryData(['tenant-features', tenantId], (old) =>
        (old || []).map(f => f.flagKey === flagKey ? { ...f, enabled } : f))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(['tenant-features', tenantId], ctx?.prev)
      toast.error('Could not update feature')
    },
    onSuccess: ({ flagKey, enabled }) =>
      toast.success(`${flagKey} ${enabled ? 'enabled' : 'disabled'} for this tenant`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['tenant-features', tenantId] }),
  })

  const list = Array.isArray(features) ? features : []
  const activeCount = list.filter(f => f.enabled).length

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles size={15} className="text-brand-ink" />
            Features & Entitlements
            <span className="text-xs font-normal text-text-muted">
              {activeCount} of {list.length} active
            </span>
          </span>
        }
      />
      <CardBody>
        {isLoading ? (
          <p className="text-sm text-text-muted py-4">Loading features…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-text-muted py-4">
            No features in the catalogue. Define them on the Feature Flags page first.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {list.map(f => {
              // Only LICENSED features are per-tenant togglable. GLOBAL features
              // are on/off for everyone (managed on the Feature Flags page) and
              // shown here read-only for visibility.
              const togglable = f.togglable !== false && f.mode === 'LICENSED'
              return (
              <button
                key={f.flagKey}
                type="button"
                disabled={isPending || !togglable}
                onClick={() => togglable && toggle({ flagKey: f.flagKey, enabled: !f.enabled })}
                title={togglable
                  ? undefined
                  : 'Global feature — on/off for all tenants. Change on the Feature Flags page, or switch it to Licensed to manage per tenant.'}
                className={
                  'flex items-center justify-between gap-3 px-3 py-2.5 rounded-ctl border text-left transition-colors ' +
                  (!togglable ? 'opacity-70 cursor-default ' : '') +
                  (f.enabled
                    ? 'border-status-pass-bd bg-status-pass-bg/40'
                    : 'border-border ' + (togglable ? 'hover:bg-surface-overlay/60' : ''))
                }
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-mono text-text-primary truncate">{f.flagKey}</span>
                    <span className={
                      'text-[9px] font-medium px-1 py-0.5 rounded shrink-0 ' +
                      (f.mode === 'LICENSED'
                        ? 'bg-brand-500/12 text-brand-ink'
                        : 'bg-surface-overlay text-text-muted')
                    }>
                      {f.mode === 'LICENSED' ? 'LICENSED' : 'GLOBAL'}
                    </span>
                  </span>
                  {f.description && (
                    <span className="block text-[11px] text-text-muted truncate">{f.description}</span>
                  )}
                </span>
                {f.enabled
                  ? <ToggleRight size={22} className={(togglable ? 'text-status-pass-fg' : 'text-text-muted') + ' shrink-0'} />
                  : <ToggleLeft  size={22} className="text-text-muted shrink-0" />}
              </button>
            )})}
          </div>
        )}
      </CardBody>
    </Card>
  )
}