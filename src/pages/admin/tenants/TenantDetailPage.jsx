import { useParams, useNavigate } from 'react-router-dom'
import { useTenant, useUpdateTenant } from '../../../hooks/useTenants'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Card, CardHeader, CardBody } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { PageSkeleton } from '../../../components/ui/EmptyState'
import { formatDate } from '../../../utils/format'
import { Building2, Users, Shield, Settings, Mail, PauseCircle, CheckCircle2 } from 'lucide-react'
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
                <div className="w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                  <Building2 size={22} className="text-brand-400" />
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
                    <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center text-xs font-bold text-brand-400 shrink-0">
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
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-semibold shrink-0 ml-auto">
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
                    className="text-left p-4 border border-border rounded-xl hover:border-brand-500/30 hover:bg-surface-overlay transition-all group"
                  >
                    <item.icon size={18} className="text-brand-400 mb-2" strokeWidth={1.75} />
                    <p className="text-sm font-semibold text-text-primary group-hover:text-brand-300 transition-colors">
                      {item.label}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">{item.desc}</p>
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>
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