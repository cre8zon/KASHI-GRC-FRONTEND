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
import { ConfirmDialog, Modal } from '../../../components/ui/Modal'
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
  const [suspendReason,  setSuspendReason]  = useState('')
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
      {tenant.status === 'SUSPENDED' && tenant.readOnlyUntil && (
        <span className="text-[11px] text-status-warn-fg shrink-0"
          title="Its people can view and export until then; after that access is blocked">
          read-only until {new Date(tenant.readOnlyUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      )}
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

      {/* Suspending an organisation: a reason is required (kept in its status
          history). Its people get a read-only grace period — they can view
          and export, not change — then access is blocked. Data is kept. */}
      <Modal open={confirmSuspend} onClose={() => { setConfirmSuspend(false); setSuspendReason('') }} size="sm"
        title="Suspend organisation"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setConfirmSuspend(false); setSuspendReason('') }}>Cancel</Button>
            <Button variant="danger" size="sm" loading={isPending} disabled={!suspendReason.trim()}
              onClick={() => updateTenant(
                { id: tenant.tenantId, data: { status: 'SUSPENDED', statusReason: suspendReason.trim() } },
                { onSuccess: () => { setConfirmSuspend(false); setSuspendReason('') } }
              )}>Suspend</Button>
          </div>
        }>
        <div className="space-y-3 text-sm text-text-secondary">
          <p>
            Suspend <span className="font-semibold text-text-primary">{tenant.name}</span>? Its people can still sign in,
            view and export for a grace period, but can't change anything. After that, access is blocked until you
            activate it again. No data is deleted.
          </p>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Reason <span className="text-status-fail-fg">*</span></span>
            <textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)} rows={3}
              placeholder="e.g. Invoice INV-2026-014 unpaid for 60 days"
              className="mt-1 w-full rounded-ctl border border-border glass-field px-3 py-2 text-sm text-text-primary" />
          </label>
        </div>
      </Modal>

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
