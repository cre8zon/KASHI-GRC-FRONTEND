/**
 * Subscriptions — every contract term across all tenants.
 * "Current" shows one row per customer (the term in force today); "All terms"
 * shows the whole chain, including replaced and churned rows.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, CreditCard } from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { billingApi } from '../../../api/billing.api'
import { formatMoney } from '../../../lib/money'
import { Table, Td, StatusPill, Empty, fmtDate, daysUntil, humanize } from '../../../components/billing/billingShared'
import { cn } from '../../../lib/cn'

const VIEWS = [
  { key: 'current', label: 'Current' },
  { key: 'all', label: 'All terms' },
  { key: 'TRIAL', label: 'Trials' },
  { key: 'PAST_DUE', label: 'Past due' },
  { key: 'CANCELLED', label: 'Cancelling' },
  { key: 'CHURNED', label: 'Churned' },
]

export default function SubscriptionsPage() {
  const navigate = useNavigate()
  const [view, setView] = useState('current')
  const [q, setQ] = useState('')
  const params = view === 'current' ? { current: true } : view === 'all' ? {} : { status: view }
  const { data = [], isLoading } = useQuery({
    queryKey: ['billing-subscriptions', params],
    queryFn: () => billingApi.subscriptions(params),
  })
  const rows = useMemo(() => (data || []).filter(s => !q || `${s.tenantName} ${s.planCode}`.toLowerCase().includes(q.toLowerCase())), [data, q])

  return (
    <PageLayout title="Subscriptions" subtitle="Contract terms across every tenant — create and change them from the tenant's Subscription tab"
      actions={
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customer or plan…"
            className="h-8 pl-8 pr-3 w-60 rounded-ctl border border-border bg-surface-raised text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>}>
      <div className="px-6 pt-2 pb-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {VIEWS.map(v => (
            <button key={v.key} onClick={() => setView(v.key)} className={cn('px-3 py-1 rounded-ctl text-xs font-medium',
              view === v.key ? 'bg-brand-500 text-brand-900' : 'bg-surface-overlay text-text-secondary hover:text-text-primary')}>{v.label}</button>
          ))}
        </div>
        {isLoading ? <p className="text-sm text-text-muted">Loading…</p> : rows.length === 0 ? (
          <Empty icon={CreditCard} title="No subscriptions here">Open a tenant and use its Subscription tab to record a contract.</Empty>
        ) : (
          <Table head={['Customer', 'Plan', 'Status', 'Change', 'Term', 'Motion', { label: 'Contract', align: 'right' }, { label: 'MRR', align: 'right' }]}>
            {rows.map(s => {
              const d = daysUntil(s.termEnd)
              return (
                <tr key={s.id} className="cursor-pointer hover:bg-surface-overlay/40" onClick={() => navigate(`/tenants/${s.tenantId}?tab=subscription`)}>
                  <Td className="font-medium">{s.tenantName}</Td>
                  <Td mono>{s.planCode}</Td>
                  <Td><StatusPill status={s.status} /></Td>
                  <Td><StatusPill status={s.changeType} /></Td>
                  <Td className="text-xs whitespace-nowrap">{fmtDate(s.termStart)} → {fmtDate(s.termEnd)}
                    {['ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIAL'].includes(s.status) && d !== null && d <= 60 &&
                      <span className="text-status-warn-fg"> · {d}d</span>}</Td>
                  <Td className="text-xs">{s.salesMotion ? humanize(s.salesMotion) : '—'}</Td>
                  <Td right mono>{formatMoney(s.contractValueMinor, s.currency)}</Td>
                  <Td right mono>{formatMoney(s.mrrMinor, s.currency)}</Td>
                </tr>
              )
            })}
          </Table>
        )}
      </div>
    </PageLayout>
  )
}
