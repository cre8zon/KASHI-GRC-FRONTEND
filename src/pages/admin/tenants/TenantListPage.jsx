import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, RefreshCw, Building2, CheckCircle2, Clock, PauseCircle } from 'lucide-react'
import { useTenantList } from '../../../hooks/useTenants'
import { useScreenConfig } from '../../../hooks/useUIConfig'
import { DataTable } from '../../../components/ui/DataTable'
import { Button } from '../../../components/ui/Button'
import { PageLayout } from '../../../components/layout/PageLayout'
import { EmptyState } from '../../../components/ui/DynamicState'
import { Skeleton } from '../../../components/ui/EmptyState'
import { cn } from '../../../lib/cn'

function StatCard({ icon: Icon, label, value, sub, color, onClick }) {
  return (
    <div onClick={onClick} className={cn('bg-surface-raised border border-border rounded-xl p-4 flex items-start gap-3', onClick && 'cursor-pointer hover:border-brand-500/30 transition-colors')}>
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', color)}>
        <Icon size={18} strokeWidth={1.75} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-text-muted font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-text-primary font-mono mt-0.5">{value ?? '—'}</p>
        {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

const FILTER_TABS = [
  { key: '',          label: 'All Tenants' },
  { key: 'ACTIVE',    label: 'Active'      },
  { key: 'TRIAL',     label: 'Trial'       },
  { key: 'SUSPENDED', label: 'Suspended'   },
]

const COLUMNS = [
  { key: 'name',      label: 'Organization', sortable: true,  width: 220 },
  { key: 'code',      label: 'Code',         sortable: false, width: 120, type: 'mono' },
  { key: 'status',    label: 'Status',       sortable: true,  width: 110, type: 'badge', componentKey: 'tenant_status' },
  { key: 'plan',      label: 'Plan',         sortable: true,  width: 120, type: 'badge', componentKey: 'tenant_plan' },
  { key: 'maxUsers',  label: 'Max Users',    sortable: false, width: 100, type: 'mono' },
  { key: 'createdAt', label: 'Created',      sortable: true,  width: 130, type: 'date' },
]

export default function TenantListPage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const [sortBy, setSortBy]   = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')

  const { data: screenConfig } = useScreenConfig('tenant_list')
  const { data, isLoading, refetch } = useTenantList({
    skip:     (page - 1) * 20, take: 20,
    search:   search ? `name=${search};code=${search}` : undefined,
    filterBy: statusFilter ? `status=${statusFilter}` : undefined,
    sortBy:   `${sortBy}=${sortDir}`,
  })
  const { data: allData } = useTenantList({ take: 999 })
  const all       = allData?.items || []
  const active    = all.filter(t => t.status === 'ACTIVE').length
  const trial     = all.filter(t => t.status === 'TRIAL').length
  const suspended = all.filter(t => t.status === 'SUSPENDED').length

  const handleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
  }

  const columns = (() => { try { return screenConfig?.layout?.columnsJson ? JSON.parse(screenConfig.layout.columnsJson) : null } catch { return null } })() || COLUMNS

  return (
    <PageLayout
      title="Tenant Management"
      subtitle="Manage all organization tenants with centralized control"
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search tenants…"
              className="h-8 pl-8 pr-3 w-52 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button size="sm" icon={Plus} onClick={() => navigate('/tenants/new')}>Create Tenant</Button>
        </div>
      }
    >
      <div className="flex flex-col h-full">
        <div className="grid grid-cols-4 gap-4 px-6 pt-5 pb-4">
          {isLoading
            ? [1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)
            : <>
              <StatCard icon={Building2}    label="Total Tenants" value={all.length} sub="All organizations" color="bg-blue-500"  onClick={() => setStatusFilter('')} />
              <StatCard icon={CheckCircle2} label="Active"        value={active}     sub="Live tenants"      color="bg-green-500" onClick={() => setStatusFilter('ACTIVE')} />
              <StatCard icon={Clock}        label="Trial Period"  value={trial}       sub="30-day trial"      color="bg-amber-500" onClick={() => setStatusFilter('TRIAL')} />
              <StatCard icon={PauseCircle}  label="Suspended"     value={suspended}   sub="Access restricted" color="bg-red-500"   onClick={() => setStatusFilter('SUSPENDED')} />
            </>
          }
        </div>
        <div className="flex items-center gap-2 px-6 pb-3 border-b border-border">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide mr-1">Filter by:</span>
          {FILTER_TABS.map(tab => (
            <button key={tab.key} onClick={() => { setStatusFilter(tab.key); setPage(1) }}
              className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                statusFilter === tab.key ? 'bg-brand-500 text-white' : 'bg-surface-overlay text-text-secondary hover:text-text-primary')}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {!isLoading && (data?.items || []).length === 0
            ? <EmptyState screenKey="tenant_list" fallbackTitle="No tenants found"
                fallbackDescription="Create your first organization tenant to get started."
                fallbackCtaLabel="Create Tenant" onCta={() => navigate('/tenants/new')} />
            : <DataTable columns={columns} data={data?.items || []} config={screenConfig}
                pagination={data?.pagination} onPageChange={setPage} onSort={handleSort}
                sortBy={sortBy} sortDir={sortDir} loading={isLoading}
                onRowClick={row => navigate(`/tenants/${row.tenantId}`)}
                emptyMessage="No tenants match your filters." />
          }
        </div>
      </div>
    </PageLayout>
  )
}