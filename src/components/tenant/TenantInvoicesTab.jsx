/** Tenant Detail → Invoices. */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { billingApi } from '../../api/billing.api'
import { formatMoney } from '../../lib/money'
import InvoiceModal from '../billing/InvoiceModal'
import { Table, Td, StatusPill, Empty, fmtDate } from '../billing/billingShared'

export default function TenantInvoicesTab({ tenantId }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['billing-invoices', { tenantId }],
    queryFn: () => billingApi.invoices({ tenantId }),
  })
  const [openId, setOpenId] = useState(null)
  const outstanding = (data || []).filter(i => ['ISSUED', 'OVERDUE'].includes(i.status))

  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>
  if (!data.length) return (
    <Empty icon={Receipt} title="No invoices yet">Draft one from the Subscription tab — it is pro-rated to the billing period automatically.</Empty>
  )
  return (
    <div className="max-w-5xl space-y-3">
      {outstanding.length > 0 && (
        <p className="text-xs text-text-secondary">
          Outstanding: {outstanding.map(i => formatMoney(i.totalMinor, i.currency)).join(' + ')}
          {outstanding.some(i => i.status === 'OVERDUE') && <span className="text-status-fail-fg"> · includes overdue</span>}
        </p>
      )}
      <Table head={['Number', 'Status', 'Period', 'Issued', 'Due', { label: 'Total', align: 'right' }]}>
        {data.map(i => (
          <tr key={i.id} className="cursor-pointer hover:bg-surface-overlay/40" onClick={() => setOpenId(i.id)}>
            <Td mono>{i.invoiceNumber || <span className="text-text-muted">Draft #{i.id}</span>}</Td>
            <Td><StatusPill status={i.status} /></Td>
            <Td className="text-xs">{i.periodStart ? `${fmtDate(i.periodStart)} – ${fmtDate(i.periodEnd)}` : '—'}</Td>
            <Td className="text-xs">{i.issueDate ? fmtDate(i.issueDate) : '—'}</Td>
            <Td className="text-xs">{i.dueDate ? fmtDate(i.dueDate) : '—'}</Td>
            <Td right mono>{formatMoney(i.totalMinor, i.currency)}</Td>
          </tr>
        ))}
      </Table>
      <InvoiceModal open={!!openId} invoiceId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}
