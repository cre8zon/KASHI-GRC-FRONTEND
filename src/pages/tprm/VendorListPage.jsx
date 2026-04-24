import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, RefreshCw } from 'lucide-react'
import { useVendorList } from '../../hooks/useVendors'
import { useScreenConfig } from '../../hooks/useUIConfig'
import { DataTable } from '../../components/ui/DataTable'
import { Button } from '../../components/ui/Button'
import { PageLayout } from '../../components/layout/PageLayout'
import { Modal } from '../../components/ui/Modal'
import { DynamicForm } from '../../components/forms/DynamicForm'
import { useOnboardVendor } from '../../hooks/useVendors'

export default function VendorListPage() {
  const navigate          = useNavigate()
  const [page, setPage]   = useState(1)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')
  const [showCreate, setShowCreate] = useState(false)

  const { data: screenConfig } = useScreenConfig('vendor_list')
  const { data, isLoading, refetch } = useVendorList({
    skip: (page - 1) * 20, take: 20,
    search: search ? `name=${search}` : undefined,
    sortBy: `${sortBy}=${sortDir}`,
  })
  const { mutate: onboard, isPending } = useOnboardVendor()

  // Parse columns from DB layout — fallback to safe defaults
  const columns = parseColumns(screenConfig?.layout?.columnsJson) || DEFAULT_COLUMNS

  const handleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
  }

  return (
    <PageLayout
      title="Vendors"
      subtitle={data?.pagination ? `${data.pagination.totalItems} vendors` : undefined}
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search vendors…"
              className="h-8 pl-8 pr-3 w-52 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>Onboard Vendor</Button>
        </div>
      }
    >
      <DataTable
        columns={columns}
        data={data?.items || []}
        config={screenConfig}
        pagination={data?.pagination}
        onPageChange={setPage}
        onSort={handleSort}
        sortBy={sortBy}
        sortDir={sortDir}
        loading={isLoading}
        onRowClick={row => navigate(`/tprm/vendors/${row.vendorId || row.id}`)}
        emptyMessage="No vendors found. Onboard your first vendor."
      />

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Onboard Vendor"
        subtitle="Complete the form to start the vendor onboarding workflow"
        size="lg"
      >
        <DynamicForm
          formKey="vendor_create"
          loading={isPending}
          submitLabel="Start Onboarding"
          onSubmit={(data) => onboard(data, { onSuccess: () => setShowCreate(false) })}
        />
      </Modal>
    </PageLayout>
  )
}

function parseColumns(json) {
  try { return json ? JSON.parse(json) : null } catch { return null }
}

const DEFAULT_COLUMNS = [
  { key: 'name',                label: 'Vendor Name',   sortable: true, width: 220 },
  { key: 'industry',            label: 'Industry',      sortable: true, width: 130 },
  { key: 'riskClassification',  label: 'Risk Level',    sortable: true, width: 110, type: 'badge', componentKey: 'vendor_risk_classification' },
  { key: 'currentRiskScore',    label: 'Risk Score',    sortable: true, width: 100, type: 'mono' },
  { key: 'status',              label: 'Status',        sortable: true, width: 110, type: 'badge', componentKey: 'vendor_status' },
  { key: 'country',             label: 'Country',       sortable: false, width: 100 },
  { key: 'createdAt',           label: 'Onboarded',     sortable: true, width: 130, type: 'date' },
]
