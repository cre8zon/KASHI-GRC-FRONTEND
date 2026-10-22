/**
 * Tenant Detail — platform admin.
 *
 * Laid out like the Vendor Detail screen (UniversalModulePage detail view):
 * back arrow + "Tenants / <name>" breadcrumb with a status pill in the header,
 * actions on the right, a sticky tab strip, and ?tab= in the URL so every tab
 * deep-links (a notification can open straight onto Audit firm).
 *
 * Each tab is its own component under components/tenant, so this file is the
 * frame only. Everything a tab needs comes from /v1/tenants/** and
 * /v1/admin/** — both SIDE_SYSTEM at the filter layer.
 */
import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Mail, PauseCircle, CheckCircle2, Eye, CreditCard, Activity, Users, Sparkles, Receipt, BadgeCheck,
} from 'lucide-react'
import { useTenant, useUpdateTenant } from '../../../hooks/useTenants'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button } from '../../../components/ui/Button'
import { PageSkeleton } from '../../../components/ui/EmptyState'
import { ConfirmDialog } from '../../../components/ui/Modal'
import { tenantsApi } from '../../../api/tenants.api'
import { authApi } from '../../../api/auth.api'
import { DetailTabs, StatusPill, useUrlTab } from '../../../components/billing/billingShared'
import TenantOverviewTab     from '../../../components/tenant/TenantOverviewTab'
import TenantSubscriptionTab from '../../../components/tenant/TenantSubscriptionTab'
import TenantUsageTab        from '../../../components/tenant/TenantUsageTab'
import TenantUsersTab        from '../../../components/tenant/TenantUsersTab'
import TenantFeaturesTab     from '../../../components/tenant/TenantFeaturesTab'
import TenantInvoicesTab     from '../../../components/tenant/TenantInvoicesTab'
import FirmApplicationPanel, { useFirmApplications } from '../../../components/firm/FirmApplicationPanel'

const TABS = [
  { key: 'overview',     label: 'Overview',     icon: Eye },
  { key: 'subscription', label: 'Subscription', icon: CreditCard },
  { key: 'usage',        label: 'Usage',        icon: Activity },
  { key: 'users',        label: 'Users',        icon: Users },
  { key: 'features',     label: 'Features',     icon: Sparkles },
  { key: 'invoices',     label: 'Invoices',     icon: Receipt },
  { key: 'audit-firm',   label: 'Audit firm',   icon: BadgeCheck },
]

export default function TenantDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { data: tenant, isLoading } = useTenant(id)
  const { mutate: updateTenant, isPending } = useUpdateTenant()
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const [confirmResend, setConfirmResend] = useState(false)

  const { data: tenantOwner } = useQuery({
    queryKey: ['tenant-owner', id],
    queryFn:  () => tenantsApi.getOwner(id),
    enabled:  !!id,
  })

  // An application waiting on someone puts a dot on the Audit firm tab.
  const { data: firm } = useFirmApplications(id)
  const firmPending = (firm?.applications || []).some(a => ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED'].includes(a.status))
  // The Audit firm tab exists only for a tenant with an application (or the
  // flag): verifications are started from Audit-firm verifications, never by
  // stumbling onto a tab. A tenant whose only application was withdrawn
  // loses the tab again.
  const hasFirmRecord = !!firm?.isAuditFirm || (firm?.applications || []).some(a => a.status !== 'WITHDRAWN')
  const tabs = TABS
    .filter(t => t.key !== 'audit-firm' || hasFirmRecord)
    .map(t => t.key === 'audit-firm' ? { ...t, dot: firmPending } : t)
  const [tab, setTab] = useUrlTab(tabs)

  // Reset password + send welcome email in one shot (unchanged behaviour).
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

  const title = (
    <div className="flex items-center gap-2 min-w-0">
      <button onClick={() => navigate('/tenants')} aria-label="Back to tenants"
        className="text-text-muted hover:text-text-primary transition-colors shrink-0">
        <ArrowLeft size={15} />
      </button>
      <button onClick={() => navigate('/tenants')} className="text-xs text-text-muted hover:text-brand-ink transition-colors shrink-0">
        Tenants
      </button>
      <span className="text-text-faint shrink-0">/</span>
      <span className="truncate font-medium">{tenant.name}</span>
      <StatusPill status={tenant.status} />
      {tenant.isAuditFirm && <StatusPill status="APPROVED" label="Audit firm" tone="tag" />}
      {tenant.plan && <span className="text-[11px] text-text-muted font-mono shrink-0">{tenant.plan}</span>}
    </div>
  )

  const actions = (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="secondary" size="sm" icon={Mail}
        onClick={() => setConfirmResend(true)} loading={resending} disabled={!tenantOwner?.userId}>
        Send welcome email
      </Button>
      {tenant.status === 'SUSPENDED'
        ? <Button size="sm" icon={CheckCircle2} loading={isPending}
            onClick={() => updateTenant({ id: tenant.tenantId, data: { status: 'ACTIVE' } })}>Activate</Button>
        : <Button variant="warning" size="sm" icon={PauseCircle} onClick={() => setConfirmSuspend(true)}>Suspend</Button>}
    </div>
  )

  return (
    <PageLayout title={title} actions={actions}>
      <DetailTabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="p-6">
        {tab === 'overview'     && <TenantOverviewTab tenant={tenant} owner={tenantOwner} />}
        {tab === 'subscription' && <TenantSubscriptionTab tenant={tenant} />}
        {tab === 'usage'        && <TenantUsageTab tenantId={tenant.tenantId} />}
        {tab === 'users'        && <TenantUsersTab tenantId={tenant.tenantId} />}
        {tab === 'features'     && <div className="max-w-5xl"><TenantFeaturesTab tenantId={tenant.tenantId} /></div>}
        {tab === 'invoices'     && <TenantInvoicesTab tenantId={tenant.tenantId} />}
        {tab === 'audit-firm'   && <FirmApplicationPanel tenantId={tenant.tenantId} tenantName={tenant.name} focusId={params.get('app')} />}
      </div>

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
