/** Tenant Detail → Users. Org-side seats first, then vendor-portal users. */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { tenantsApi } from '../../api/tenants.api'
import { Table, Td, StatusPill, fmtDate, humanize } from '../billing/billingShared'
import { cn } from '../../lib/cn'

export default function TenantUsersTab({ tenantId }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['tenant-users', tenantId], queryFn: () => tenantsApi.getUsers(tenantId) })
  const [q, setQ] = useState('')
  const [side, setSide] = useState('ORG')
  const rows = useMemo(() => (data || [])
    .filter(u => side === 'ALL' || (side === 'ORG' ? !u.vendorId : !!u.vendorId))
    .filter(u => !q || `${u.fullName} ${u.email}`.toLowerCase().includes(q.toLowerCase())), [data, q, side])
  const orgCount = (data || []).filter(u => !u.vendorId).length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {[['ORG', `Organisation (${orgCount})`], ['VENDOR', `Vendor portal (${(data || []).length - orgCount})`], ['ALL', 'All']].map(([k, l]) => (
          <button key={k} onClick={() => setSide(k)} className={cn('px-3 py-1 rounded-ctl text-xs font-medium',
            side === k ? 'bg-brand-500 text-brand-900' : 'bg-surface-overlay text-text-secondary hover:text-text-primary')}>{l}</button>
        ))}
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search users…"
            className="h-8 pl-8 pr-3 w-56 rounded-ctl border border-border bg-surface-raised text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
      {isLoading ? <p className="text-sm text-text-muted">Loading…</p> : (
        <Table head={['User', 'Roles', 'Status', 'Last login', 'Added']}>
          {rows.length === 0 && <tr><Td colSpan={5} className="text-center text-text-muted py-6">No users.</Td></tr>}
          {rows.map(u => (
            <tr key={u.userId}>
              <Td><p className="font-medium">{u.fullName || '—'}</p><p className="text-xs text-text-muted font-mono">{u.email}</p></Td>
              <Td className="text-xs">{(u.roles || []).map(r => r.name).join(', ') || '—'}
                <span className="block text-[10px] text-text-muted">{[...new Set((u.roles || []).map(r => r.side).filter(Boolean))].map(humanize).join(', ')}</span></Td>
              <Td><StatusPill status={u.status} /></Td>
              <Td className="text-xs">{u.lastLogin ? fmtDate(u.lastLogin) : <span className="text-text-muted">Never</span>}</Td>
              <Td className="text-xs">{fmtDate(u.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}
