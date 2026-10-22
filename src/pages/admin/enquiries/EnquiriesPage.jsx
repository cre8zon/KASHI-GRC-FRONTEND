/**
 * Enquiries — everything people ask for on www.kashiguard.com: demos, trials,
 * sales conversations, audit-firm applications, partnerships and support.
 *
 * One inbox, filtered by queue. A row opens the enquiry in a modal (also
 * reachable as ?open=<id>, which is the link in the internal alert email).
 * Sales enquiries end with "Convert to tenant": Create Tenant opens pre-filled
 * from the enquiry and the enquiry is marked converted in the same transaction.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Inbox, RefreshCw } from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button } from '../../../components/ui/Button'
import { enquiriesApi } from '../../../api/enquiries.api'
import { Table, Td, StatusPill, Empty, Kpi, SelectIn, fmtDate } from '../../../components/billing/billingShared'
import { EnquiryDetailModal, TYPE_LABEL, typeTone } from '../../../components/enquiry/EnquiryDetailModal'
import { cn } from '../../../lib/cn'

const QUEUES = [
  { key: 'open',      label: 'Open',      params: { status: 'NEW,IN_PROGRESS,QUALIFIED' } },
  { key: 'new',       label: 'New',       params: { status: 'NEW' } },
  { key: 'mine',      label: 'Mine',      params: { status: 'NEW,IN_PROGRESS,QUALIFIED', mine: true } },
  { key: 'converted', label: 'Converted', params: { status: 'CONVERTED' } },
  { key: 'closed',    label: 'Closed',    params: { status: 'CLOSED' } },
  { key: 'all',       label: 'All',       params: {} },
]

function ago(v) {
  if (!v) return ''
  const mins = Math.round((Date.now() - new Date(v).getTime()) / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  if (mins < 60 * 24 * 14) return `${Math.round(mins / 1440)}d ago`
  return fmtDate(v)
}

function minutesLabel(m) {
  if (m === null || m === undefined) return '—'
  if (m < 60) return `${m} min`
  if (m < 60 * 48) return `${Math.round(m / 60)} h`
  return `${Math.round(m / 1440)} d`
}

export default function EnquiriesPage() {
  const [params, setParams] = useSearchParams()
  const [queue, setQueue] = useState('open')
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => { const t = setTimeout(() => { setDebouncedQ(q); setPage(1) }, 300); return () => clearTimeout(t) }, [q])

  const openId = params.get('open') ? Number(params.get('open')) : null
  const setOpen = (id) => setParams(prev => {
    const n = new URLSearchParams(prev)
    if (id) n.set('open', String(id)); else n.delete('open')
    return n
  }, { replace: true })

  const queueParams = QUEUES.find(x => x.key === queue)?.params || {}
  const listParams = { ...queueParams, type: type || undefined, q: debouncedQ || undefined, page, size: 25 }
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['enquiries', listParams],
    queryFn: () => enquiriesApi.list(listParams),
    keepPreviousData: true,
  })
  const { data: stats } = useQuery({ queryKey: ['enquiries-stats'], queryFn: () => enquiriesApi.stats(90), staleTime: 60_000 })
  const { data: cfg } = useQuery({ queryKey: ['enquiries-config'], queryFn: enquiriesApi.config, staleTime: 600_000 })

  const items = data?.items || []
  const counts = data?.countsByStatus || {}
  const openCount = (counts.NEW || 0) + (counts.IN_PROGRESS || 0) + (counts.QUALIFIED || 0)
  const pg = data?.pagination

  const queueCount = useMemo(() => ({
    open: openCount, new: counts.NEW || 0, converted: counts.CONVERTED || 0, closed: counts.CLOSED || 0,
  }), [counts, openCount])

  return (
    <PageLayout title="Enquiries" subtitle="Demo, trial, sales, audit-firm and support requests from kashiguard.com"
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, email, company, ref…"
              className="h-8 pl-8 pr-3 w-56 rounded-ctl border border-border glass-field text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refetch()} loading={isFetching} aria-label="Refresh" />
        </div>
      }>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 pt-2 pb-4">
          <Kpi label="Waiting for a reply" value={counts.NEW ?? 0} tone={(counts.NEW || 0) > 0 ? 'warn' : undefined} sub="Status New" />
          <Kpi label="Received · 90 days" value={stats?.received ?? '—'} sub={stats ? `${stats.salesEnquiries} sales, ${stats.received - stats.salesEnquiries} other` : null} />
          <Kpi label="Converted · 90 days" value={stats?.conversionRate == null ? '—' : `${stats.conversionRate}%`}
            sub={stats ? `${stats.converted} of ${stats.salesEnquiries} sales enquiries` : null} tone={stats?.converted ? 'good' : undefined} />
          <Kpi label="Median first response" value={minutesLabel(stats?.medianFirstResponseMinutes)} sub="Received → first note or status change" />
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 pb-3 border-b border-border">
          {QUEUES.map(x => (
            <button key={x.key} onClick={() => { setQueue(x.key); setPage(1) }}
              className={cn('px-3 py-1 rounded-ctl text-xs font-medium transition-colors flex items-center gap-1.5',
                queue === x.key ? 'bg-brand-500 text-brand-on' : 'bg-surface-overlay text-text-secondary hover:text-text-primary')}>
              {x.label}
              {queueCount[x.key] > 0 && <span className="text-[10px] opacity-75">{queueCount[x.key]}</span>}
            </button>
          ))}
          <div className="ml-auto w-48">
            <SelectIn value={type} onChange={e => { setType(e.target.value); setPage(1) }} placeholder="All types"
              options={(cfg?.types || Object.keys(TYPE_LABEL)).map(t => ({ value: t, label: TYPE_LABEL[t] || t }))} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? <p className="text-sm text-text-muted">Loading…</p> : items.length === 0 ? (
            <Empty icon={Inbox} title={queue === 'open' ? 'Inbox zero' : 'Nothing here'}>
              {queue === 'open'
                ? 'New requests from the website land here — demo, trial, contact sales, audit-firm and support forms all post to this inbox.'
                : 'No enquiries match these filters.'}
            </Empty>
          ) : (
            <>
              <Table head={['Ref', 'Received', 'From', 'Type', 'Plan', 'Source', 'Status', 'Owner']}>
                {items.map(e => (
                  <tr key={e.id} onClick={() => setOpen(e.id)}
                    className={cn('cursor-pointer hover:bg-surface-overlay/60', e.status === 'NEW' && 'font-medium')}>
                    <Td mono>{e.reference}</Td>
                    <Td className="whitespace-nowrap text-xs text-text-secondary" title={fmtDate(e.createdAt)}>{ago(e.createdAt)}</Td>
                    <Td>
                      <div className="min-w-0">
                        <p className="text-sm text-text-primary truncate max-w-[260px]">
                          {e.fullName}{e.company && <span className="text-text-muted font-normal"> · {e.company}</span>}
                        </p>
                        <p className="text-[11px] text-text-muted truncate max-w-[260px]">
                          {e.email}
                          {e.matchedTenantName && <span className="ml-1.5 text-status-info-fg">customer: {e.matchedTenantName}</span>}
                          {e.isDuplicate && <span className="ml-1.5 text-status-warn-fg">repeat</span>}
                        </p>
                      </div>
                    </Td>
                    <Td><StatusPill status={e.type} label={TYPE_LABEL[e.type] || e.type} tone={typeTone(e.type)} /></Td>
                    <Td mono>{e.planCode || '—'}</Td>
                    <Td className="text-xs text-text-secondary">{e.referralCode ? `ref ${e.referralCode}` : e.utmSource || 'Direct'}</Td>
                    <Td>
                      <StatusPill status={e.status}
                        label={e.status === 'CONVERTED' && e.convertedTenantName ? `→ ${e.convertedTenantName}`
                          : e.status === 'CLOSED' && e.closedReason ? `Closed · ${e.closedReason.replace(/_/g, ' ').toLowerCase()}` : undefined} />
                      {e.priority === 'HIGH' && <span className="ml-1 text-[10px] text-status-fail-fg font-semibold">HIGH</span>}
                    </Td>
                    <Td className="text-xs text-text-secondary">{e.assignedToName || <span className="text-text-muted">—</span>}</Td>
                  </tr>
                ))}
              </Table>
              {pg && pg.totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 pt-3 text-xs text-text-muted">
                  <span>Page {pg.page} of {pg.totalPages} · {pg.totalItems} enquiries</span>
                  <Button size="xs" variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <Button size="xs" variant="secondary" disabled={page >= pg.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <EnquiryDetailModal id={openId} onClose={() => setOpen(null)} config={cfg} />
    </PageLayout>
  )
}
