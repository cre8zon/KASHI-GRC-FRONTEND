/** Invoices — every invoice across tenants. Draft from a tenant's Subscription tab. */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Receipt, Search } from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { billingApi } from '../../../api/billing.api'
import { formatMoney } from '../../../lib/money'
import InvoiceModal from '../../../components/billing/InvoiceModal'
import { Table, Td, StatusPill, Empty, Kpi, fmtDate } from '../../../components/billing/billingShared'
import { cn } from '../../../lib/cn'

const FILTERS = ['', 'DRAFT', 'ISSUED', 'OVERDUE', 'PAID', 'VOID']

export default function InvoicesPage() {
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  const { data: all = [], isLoading } = useQuery({ queryKey: ['billing-invoices', 'all'], queryFn: () => billingApi.invoices() })

  const rows = useMemo(() => (all || [])
    .filter(i => !status || i.status === status)
    .filter(i => !q || `${i.tenantName} ${i.invoiceNumber || ''}`.toLowerCase().includes(q.toLowerCase())), [all, status, q])

  // Totals per currency — never summed across currencies.
  const sums = useMemo(() => {
    const out = {}
    for (const i of all || []) {
      const k = i.currency
      out[k] = out[k] || { outstanding: 0, overdue: 0, paid: 0 }
      if (i.status === 'ISSUED' || i.status === 'OVERDUE') out[k].outstanding += i.totalMinor
      if (i.status === 'OVERDUE') out[k].overdue += i.totalMinor
      if (i.status === 'PAID') out[k].paid += i.totalMinor
    }
    return out
  }, [all])
  const curs = Object.keys(sums)
  const fmt = (key) => curs.length ? curs.map(c => formatMoney(sums[c][key], c, { compact: true })).join(' + ') : '—'

  return (
    <PageLayout title="Invoices" subtitle="Draft from a subscription, issue to number it, record payment"
      actions={
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customer or number…"
            className="h-8 pl-8 pr-3 w-60 rounded-ctl border border-border bg-surface-raised text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>}>
      <div className="px-6 pt-2 pb-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Outstanding" value={fmt('outstanding')} />
          <Kpi label="Overdue" value={fmt('overdue')} tone={curs.some(c => sums[c].overdue > 0) ? 'bad' : undefined} />
          <Kpi label="Collected (all time)" value={fmt('paid')} />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button key={f || 'all'} onClick={() => setStatus(f)} className={cn('px-3 py-1 rounded-ctl text-xs font-medium',
              status === f ? 'bg-brand-500 text-brand-900' : 'bg-surface-overlay text-text-secondary hover:text-text-primary')}>
              {f ? f.charAt(0) + f.slice(1).toLowerCase() : 'All'}
            </button>
          ))}
        </div>
        {isLoading ? <p className="text-sm text-text-muted">Loading…</p> : rows.length === 0 ? (
          <Empty icon={Receipt} title="No invoices">Open a tenant → Subscription → Draft invoice.</Empty>
        ) : (
          <Table head={['Number', 'Customer', 'Status', 'Period', 'Issued', 'Due', { label: 'Total', align: 'right' }]}>
            {rows.map(i => (
              <tr key={i.id} className="cursor-pointer hover:bg-surface-overlay/40" onClick={() => setOpenId(i.id)}>
                <Td mono>{i.invoiceNumber || <span className="text-text-muted">Draft #{i.id}</span>}</Td>
                <Td className="font-medium">{i.tenantName}</Td>
                <Td><StatusPill status={i.status} /></Td>
                <Td className="text-xs">{i.periodStart ? `${fmtDate(i.periodStart)} – ${fmtDate(i.periodEnd)}` : '—'}</Td>
                <Td className="text-xs">{i.issueDate ? fmtDate(i.issueDate) : '—'}</Td>
                <Td className="text-xs">{i.dueDate ? fmtDate(i.dueDate) : '—'}</Td>
                <Td right mono>{formatMoney(i.totalMinor, i.currency)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      <InvoiceModal open={!!openId} invoiceId={openId} onClose={() => setOpenId(null)} />
    </PageLayout>
  )
}
