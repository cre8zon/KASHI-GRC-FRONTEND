/**
 * Tenant Detail → Usage. What the customer actually uses against what it bought.
 *
 * Both directions matter: vendors near the purchased limit is an expansion
 * conversation; few active seats is the earliest churn signal there is.
 */
import { useQuery } from '@tanstack/react-query'
import { Users, Building2, ClipboardList, Sparkles } from 'lucide-react'
import { tenantsApi } from '../../api/tenants.api'
import { formatMoney } from '../../lib/money'
import { Kpi, SectionTitle, StatusPill, fmtDate, humanize } from '../billing/billingShared'
import { cn } from '../../lib/cn'

function Meter({ used, limit, label }) {
  const unlimited = limit === null || limit === undefined
  const pct = unlimited || !limit ? null : Math.round((used / limit) * 100)
  const tone = pct === null ? 'bg-brand-fill' : pct >= 100 ? 'bg-status-fail-fg' : pct >= 90 ? 'bg-status-warn-fg' : 'bg-brand-fill'
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="font-mono text-text-primary">{used}{unlimited ? ' / unlimited' : ` / ${limit}`}{pct !== null && <span className="text-text-muted"> ({pct}%)</span>}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct === null ? 0 : Math.min(100, pct)}%` }} />
      </div>
    </div>
  )
}

export default function TenantUsageTab({ tenantId }) {
  const { data: u, isLoading } = useQuery({ queryKey: ['tenant-usage', tenantId], queryFn: () => tenantsApi.getUsage(tenantId) })
  if (isLoading || !u) return <p className="text-sm text-text-muted">Loading…</p>

  const seatActivity = u.seats.total ? Math.round((u.seats.active30d / u.seats.total) * 100) : null
  const vendorPct = u.vendors.limit ? Math.round((u.vendors.total / u.vendors.limit) * 100) : null
  const signal = vendorPct !== null && vendorPct >= 90 ? 'EXPANSION'
    : (u.seats.total <= 1 || (seatActivity !== null && seatActivity < 40)) ? 'CHURN_RISK' : null

  return (
    <div className="max-w-4xl space-y-6">
      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Active seats (30d)" value={`${u.seats.active30d} / ${u.seats.total}`} sub={seatActivity !== null ? `${seatActivity}% of users active` : null}
          tone={seatActivity !== null && seatActivity < 40 ? 'warn' : undefined} />
        <Kpi label="Vendors" value={u.vendors.total} sub={u.vendors.limit ? `of ${u.vendors.limit} purchased` : 'unlimited'}
          tone={vendorPct !== null && vendorPct >= 90 ? 'good' : undefined} />
        <Kpi label="Assessments" value={u.assessments.total} sub={`${u.assessments.submitted} submitted by vendors`} />
        <Kpi label={`AI tokens (${u.ai.period})`} value={Number(u.ai.tokens).toLocaleString()} sub={`${u.ai.requests} requests`} />
      </div>

      {signal && (
        <div className="flex items-center gap-2 text-xs">
          <StatusPill status={signal} />
          <span className="text-text-secondary">
            {signal === 'EXPANSION'
              ? 'Vendors are at 90%+ of the purchased limit — time for an upgrade conversation.'
              : u.seats.total <= 1
                ? 'A single user — one champion and no account. The strongest churn signal there is.'
                : 'Fewer than 40% of users logged in over the last 30 days.'}
          </span>
        </div>
      )}

      <section>
        <SectionTitle>Against the plan</SectionTitle>
        <div className="rounded-card border border-border p-4 glass-card space-y-4">
          <Meter label="Vendors under management (priced metric)" used={u.vendors.total} limit={u.vendors.limit} />
          <Meter label="Seats (org users)" used={u.seats.total} limit={u.seats.limit} />
          {u.subscription && (
            <p className="text-[11px] text-text-muted">
              {u.subscription.planCode} · {humanize(u.subscription.status)} · {formatMoney(u.subscription.mrrMinor, u.subscription.currency)}/mo · ends {fmtDate(u.subscription.termEnd)}
            </p>
          )}
          <p className="text-[11px] text-text-muted">Limits are recorded on the tenant but not yet enforced at vendor/user creation — see TenantLimitService.</p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <Breakdown icon={Building2} title="Vendors by status" data={u.vendors.byStatus} extra={`${u.vendors.portalUsers} vendor portal users`} />
        <Breakdown icon={ClipboardList} title="Assessments by status" data={u.assessments.byStatus} />
        <div className="rounded-card border border-border p-4 glass-card text-xs space-y-1.5">
          <p className="font-semibold text-text-primary flex items-center gap-1.5"><Users size={13} /> People</p>
          <p className="text-text-secondary">{u.seats.neverLoggedIn} invited users have never logged in.</p>
          <p className="text-text-secondary">Last login on this tenant: {u.seats.lastLoginAt ? fmtDate(u.seats.lastLoginAt) : 'never'}.</p>
        </div>
        <div className="rounded-card border border-border p-4 glass-card text-xs space-y-1.5">
          <p className="font-semibold text-text-primary flex items-center gap-1.5"><Sparkles size={13} /> AI cost this month</p>
          <p className="text-text-secondary font-mono">{(Number(u.ai.costMicros) / 1_000_000).toFixed(2)} (provider currency)</p>
          <p className="text-text-muted">Compare against MRR on Billing Overview → Utilisation.</p>
        </div>
      </div>
    </div>
  )
}

function Breakdown({ icon: Icon, title, data = {}, extra }) {
  const entries = Object.entries(data)
  return (
    <div className="rounded-card border border-border p-4 glass-card text-xs">
      <p className="font-semibold text-text-primary flex items-center gap-1.5 mb-2"><Icon size={13} /> {title}</p>
      {entries.length === 0 ? <p className="text-text-muted">None yet.</p> : (
        <ul className="space-y-1">
          {entries.map(([k, v]) => (
            <li key={k} className="flex justify-between"><span className="text-text-secondary">{humanize(k)}</span><span className="font-mono">{v}</span></li>
          ))}
        </ul>
      )}
      {extra && <p className="text-text-muted mt-2">{extra}</p>}
    </div>
  )
}
