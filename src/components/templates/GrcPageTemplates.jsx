/**
 * GRC Page Templates — remaining templates
 *
 * Contents:
 *   ListPageTemplate        — standard list/table with filters, search, bulk select
 *   CalendarTimelineTemplate — cross-entity deadline + SLA calendar
 *   DashboardWidgetTemplate — pluggable stat/chart card any module can register
 *   BulkActionToolbar       — floating toolbar for multi-select bulk operations
 *   SplitReviewTemplate     — left-panel item + right-panel action (evidence review, gap review)
 *   ApprovalQueueTemplate   — cross-module pending approvals with inline record preview
 */

import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search, Filter, Plus, Download, RefreshCw, ChevronDown,
  ChevronLeft, ChevronRight, CheckSquare, Square, Calendar,
  BarChart2, TrendingUp, CheckCircle2, Clock, AlertTriangle,
  Eye, Pencil, Trash2, MoreVertical, User, Flag, X, Zap,
  ArrowRight, Inbox, Loader2, ListFilter,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Progress, Callout, DateRangePicker, MultiSelect } from '../ui/ui-primitives'
import { DataTable } from '../ui/DataTable'
import { DashboardWidgetCard } from '../charts/DashboardWidget'
import { cn } from '../../lib/cn'
import { formatDate } from '../../utils/format'
import api from '../../config/axios.config'
import toast from 'react-hot-toast'

// ═══════════════════════════════════════════════════════════════════════════════
// 1. LIST PAGE TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standard list/table page for any GRC module.
 *
 * USAGE:
 *   <ListPageTemplate
 *     title="Risks"
 *     entityType="RISK"
 *     apiBasePath="/v1/risks"
 *     columns={[...]}            // DataTable column defs (or from screen config)
 *     filters={[...]}            // [{ key, label, type, options }]
 *     onRowClick={(row) => navigate(`/module/risk/${row.id}`)}
 *     onCreateClick={() => setCreateOpen(true)}
 *     viewContext={viewContext}
 *     viewToggle                 // show list/board toggle button
 *     onViewChange={(v) => setView(v)}
 *     bulkActions={[             // enables row selection
 *       { key: 'assign', label: 'Assign owner', icon: User },
 *       { key: 'close',  label: 'Close selected', variant: 'danger' },
 *     ]}
 *     onBulkAction={(actionKey, selectedIds) => handleBulk(actionKey, selectedIds)}
 *   />
 */
export function ListPageTemplate({
  title,
  subtitle,
  entityType,
  apiBasePath,
  columns = [],
  filters = [],
  defaultParams = {},
  onRowClick,
  onCreateClick,
  createLabel,
  viewContext,
  viewToggle = false,
  currentView = 'list',
  onViewChange,
  bulkActions = [],
  onBulkAction,
  extraActions,
  emptyMessage,
}) {
  const [page, setPage]             = useState(1)
  const [search, setSearch]         = useState('')
  const [activeFilters, setFilters] = useState({})
  const [selectedIds, setSelectedIds] = useState([])
  const [showFilters, setShowFilters] = useState(false)
  const qc = useQueryClient()

  const params = { skip: (page - 1) * 20, take: 20, search: search || undefined, ...defaultParams, ...activeFilters }

  const { data, isLoading, refetch } = useQuery({
    queryKey: [entityType, 'list', params],
    queryFn: () => api.get(apiBasePath, { params }),
    keepPreviousData: true,
  })

  const items = data?.data?.data || data?.data?.items || data?.data || []
  const pagination = data?.data?.pagination || { totalItems: items.length, page, pageSize: 20 }
  const canCreate = !viewContext || viewContext.permissions?.includes(`${entityType.toLowerCase()}.create`)

  const toggleSelect = (id) => setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll = () => setSelectedIds(s => s.length === items.length ? [] : items.map(i => i.id))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-base font-semibold text-text-primary">{title}</h1>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search…"
              className="h-7 pl-8 pr-3 w-44 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          {filters.length > 0 && (
            <button onClick={() => setShowFilters(f => !f)}
              className={cn('h-7 px-2.5 flex items-center gap-1.5 text-xs rounded-ctl border transition-colors',
                showFilters || Object.keys(activeFilters).length > 0
                  ? 'border-brand-500 text-brand-400 bg-brand-500/10'
                  : 'border-border text-text-muted hover:border-brand-500/40')}>
              <ListFilter size={12} />
              Filters
              {Object.keys(activeFilters).length > 0 && (
                <span className="text-[10px] bg-brand-500 text-brand-900 rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {Object.keys(activeFilters).length}
                </span>
              )}
            </button>
          )}
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          {extraActions}
          {canCreate && onCreateClick && (
            <Button size="sm" icon={Plus} onClick={onCreateClick}>
              {createLabel || `New ${title.slice(0, -1)}`}
            </Button>
          )}
        </div>
      </div>

      {/* Filters row */}
      {showFilters && filters.length > 0 && (
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0 bg-surface-overlay/50 flex-wrap">
          {filters.map(f => (
            <FilterControl key={f.key} filter={f}
              value={activeFilters[f.key]}
              onChange={(v) => setFilters(prev => v ? { ...prev, [f.key]: v } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== f.key)))}
            />
          ))}
          {Object.keys(activeFilters).length > 0 && (
            <button onClick={() => setFilters({})} className="text-xs text-text-muted hover:text-status-fail-fg transition-colors flex items-center gap-1">
              <X size={12} /> Clear all
            </button>
          )}
        </div>
      )}

      {/* Bulk action toolbar */}
      {selectedIds.length > 0 && bulkActions.length > 0 && (
        <BulkActionToolbar
          selectedCount={selectedIds.length}
          actions={bulkActions}
          onAction={(key) => { onBulkAction?.(key, selectedIds); setSelectedIds([]) }}
          onClear={() => setSelectedIds([])}
        />
      )}

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={bulkActions.length > 0
            ? [{ key: '__select', label: '', width: 36, type: 'custom',
                headerRender: () => (
                  <button onClick={toggleAll} className="text-text-muted hover:text-text-primary transition-colors">
                    {selectedIds.length === items.length ? <CheckSquare size={13} /> : <Square size={13} />}
                  </button>
                ),
                render: (row) => (
                  <button onClick={(e) => { e.stopPropagation(); toggleSelect(row.id) }}
                    className="text-text-muted hover:text-text-primary transition-colors">
                    {selectedIds.includes(row.id) ? <CheckSquare size={13} className="text-brand-400" /> : <Square size={13} />}
                  </button>
                )
              }, ...columns]
            : columns
          }
          data={items}
          pagination={pagination}
          onPageChange={setPage}
          loading={isLoading}
          onRowClick={onRowClick}
          selectedIds={selectedIds}
          emptyMessage={emptyMessage || `No ${title?.toLowerCase()} found`}
        />
      </div>
    </div>
  )
}

function FilterControl({ filter, value, onChange }) {
  if (filter.type === 'select') {
    return (
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] text-text-muted">{filter.label}</label>
        <select value={value || ''} onChange={e => onChange(e.target.value || undefined)}
          className="h-6 px-2 text-xs bg-surface-raised border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
          <option value="">All</option>
          {(filter.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    )
  }
  if (filter.type === 'daterange') {
    return (
      <DateRangePicker value={value || {}} onChange={onChange} label={filter.label} />
    )
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. BULK ACTION TOOLBAR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Floating toolbar shown when rows are selected in a list.
 *
 * USAGE:
 *   <BulkActionToolbar
 *     selectedCount={selectedIds.length}
 *     actions={[
 *       { key: 'assign',   label: 'Assign owner', icon: User },
 *       { key: 'export',   label: 'Export', icon: Download },
 *       { key: 'close',    label: 'Close', variant: 'danger', icon: X },
 *     ]}
 *     onAction={(key) => handleBulk(key)}
 *     onClear={() => setSelectedIds([])}
 *   />
 */
export function BulkActionToolbar({ selectedCount, actions = [], onAction, onClear }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-brand-500/10 border-b border-brand-500/20 shrink-0">
      <span className="text-xs font-medium text-brand-400">{selectedCount} selected</span>
      <div className="w-px h-4 bg-brand-500/30" />
      {actions.map(action => (
        <Button key={action.key}
          size="xs"
          variant={action.variant || 'secondary'}
          icon={action.icon}
          onClick={() => onAction(action.key)}
        >
          {action.label}
        </Button>
      ))}
      <button onClick={onClear}
        className="ml-auto text-xs text-text-muted hover:text-text-primary transition-colors flex items-center gap-1">
        <X size={12} /> Deselect all
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CALENDAR / TIMELINE TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cross-entity deadline and SLA calendar.
 * Shows upcoming due dates for any entities that have a dueDate/slaDueAt field.
 *
 * USAGE:
 *   <CalendarTimelineTemplate
 *     sources={[
 *       { entityType: 'RISK',           apiPath: '/v1/risks',           dateField: 'dueDate',   label: 'Risk treatment', colorTag: 'red' },
 *       { entityType: 'AUDIT',          apiPath: '/v1/audits',          dateField: 'endDate',   label: 'Audit end', colorTag: 'blue' },
 *       { entityType: 'POLICY_REVIEW',  apiPath: '/v1/policy-reviews',  dateField: 'reviewDate',label: 'Policy review', colorTag: 'purple' },
 *       { entityType: 'WORKFLOW_TASK',  apiPath: '/v1/tasks/my',        dateField: 'slaDueAt',  label: 'Task SLA', colorTag: 'amber' },
 *     ]}
 *     onItemClick={(item) => navigate(`/module/${item.entityType.toLowerCase()}/${item.id}`)}
 *   />
 */
export function CalendarTimelineTemplate({ sources = [], onItemClick }) {
  const [dateRange, setDateRange] = useState({
    from: new Date().toISOString().split('T')[0],
    to:   new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
  })
  const [activeTypes, setActiveTypes] = useState(sources.map(s => s.entityType))

  // Fetch all sources in parallel
  const queries = sources.map(source => useQuery({
    queryKey: ['calendar', source.entityType, dateRange],
    queryFn: () => api.get(source.apiPath, {
      params: { dueBefore: dateRange.to, dueAfter: dateRange.from, take: 200 }
    }),
    enabled: activeTypes.includes(source.entityType),
    staleTime: 60 * 1000,
  }))

  // Flatten and sort all items
  const allItems = useMemo(() => {
    const items = []
    sources.forEach((source, i) => {
      const data = queries[i].data?.data?.data || queries[i].data?.data?.items || queries[i].data?.data || []
      data.forEach(record => {
        const date = record[source.dateField]
        if (!date) return
        items.push({
          id: record.id,
          title: record.title || record.name || `${source.label} #${record.id}`,
          date,
          entityType: source.entityType,
          colorTag: source.colorTag,
          label: source.label,
          status: record.status,
          priority: record.priority,
          overdue: new Date(date) < new Date(),
        })
      })
    })
    return items.sort((a, b) => new Date(a.date) - new Date(b.date))
  }, [queries, sources])

  // Group by week
  const weeks = useMemo(() => {
    const groups = {}
    allItems.forEach(item => {
      const d = new Date(item.date)
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - d.getDay())
      const key = weekStart.toISOString().split('T')[0]
      if (!groups[key]) groups[key] = { weekStart, items: [] }
      groups[key].items.push(item)
    })
    return Object.values(groups).sort((a, b) => a.weekStart - b.weekStart)
  }, [allItems])

  const isLoading = queries.some(q => q.isLoading)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border shrink-0 flex-wrap">
        <DateRangePicker value={dateRange} onChange={setDateRange} label="Period" />
        <div className="flex flex-wrap gap-1.5">
          {sources.map(s => (
            <button key={s.entityType}
              onClick={() => setActiveTypes(prev =>
                prev.includes(s.entityType) ? prev.filter(x => x !== s.entityType) : [...prev, s.entityType]
              )}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] border transition-colors',
                activeTypes.includes(s.entityType)
                  ? `text-${s.colorTag}-400 bg-${s.colorTag}-500/10 border-${s.colorTag}-500/25`
                  : 'text-text-muted border-border'
              )}>
              <span className={cn('w-2 h-2 rounded-full', `bg-${s.colorTag}-400`)} />
              {s.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-text-muted">{allItems.length} items</span>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 size={13} className="animate-spin" /> Loading…
          </div>
        )}
        {!isLoading && allItems.length === 0 && (
          <Callout variant="info">No items due in this period across selected modules.</Callout>
        )}
        {weeks.map((week, wi) => (
          <div key={wi}>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                Week of {formatDate(week.weekStart.toISOString())}
              </p>
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-text-muted">{week.items.length} items</span>
            </div>
            <div className="space-y-1.5">
              {week.items.map((item, i) => (
                <button key={i} onClick={() => onItemClick?.(item)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-card border border-border hover:border-brand-500/30 hover:bg-surface-overlay transition-colors text-left group">
                  <div className={cn('w-2 h-2 rounded-full shrink-0', `bg-${item.colorTag}-400`)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">{item.title}</p>
                    <p className="text-[10px] text-text-muted">{item.label}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.priority && (
                      <span className={cn('text-[10px]',
                        item.priority === 'CRITICAL' ? 'text-status-fail-fg' :
                        item.priority === 'HIGH' ? 'text-status-warn-fg' : 'text-text-muted')}>
                        {item.priority}
                      </span>
                    )}
                    <span className={cn('text-[10px] font-medium',
                      item.overdue ? 'text-status-fail-fg' : 'text-text-muted')}>
                      {item.overdue ? 'Overdue' : formatDate(item.date)}
                    </span>
                  </div>
                  <ChevronRight size={13} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SPLIT REVIEW TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Left-panel item list + right-panel action area.
 * Used for: audit finding review, policy gap review, control evidence review,
 *           assessment question review (already used in VendorAssessmentFillPage).
 *
 * USAGE:
 *   <SplitReviewTemplate
 *     items={findings}
 *     renderItem={(item, selected) => <FindingRow item={item} selected={selected} />}
 *     renderPanel={(item) => <FindingReviewPanel item={item} onSave={handleSave} />}
 *     title="Audit findings"
 *     emptyMessage="No findings to review"
 *     filterOptions={[{ value: 'OPEN', label: 'Open' }, { value: 'CLOSED', label: 'Closed' }]}
 *   />
 */
export function SplitReviewTemplate({
  items = [],
  renderItem,
  renderPanel,
  title,
  subtitle,
  emptyMessage = 'No items to review',
  filterOptions = [],
  statusField = 'status',
  loading = false,
  leftWidth = 320,
}) {
  const [selected, setSelected] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const filtered = items.filter(item => {
    const matchStatus = !statusFilter || item[statusField] === statusFilter
    const matchSearch = !search || JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const selectedItem = selected !== null ? filtered[selected] : null

  // Progress
  const completed = items.filter(i => ['CLOSED','RESOLVED','APPROVED','COMPLETED'].includes(i[statusField])).length

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="flex flex-col border-r border-border overflow-hidden" style={{ width: leftWidth, minWidth: leftWidth }}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-text-primary">{title}</p>
            <span className="text-[10px] text-text-muted">{filtered.length} items</span>
          </div>
          {items.length > 0 && (
            <Progress value={completed} max={items.length} color="green" showLabel label={`${completed}/${items.length}`} />
          )}
        </div>
        {/* Filters */}
        {(filterOptions.length > 0 || true) && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
            <div className="relative flex-1">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                className="w-full h-6 pl-6 pr-2 text-[11px] bg-surface-overlay border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            {filterOptions.length > 0 && (
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="h-6 px-1.5 text-[11px] bg-surface-overlay border border-border rounded text-text-primary focus:outline-none">
                <option value="">All</option>
                {filterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>
        )}
        {/* Item list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {loading && <p className="p-4 text-xs text-text-muted">Loading…</p>}
          {!loading && filtered.length === 0 && (
            <p className="p-4 text-xs text-text-muted italic">{emptyMessage}</p>
          )}
          {filtered.map((item, i) => (
            <div key={item.id || i}
              onClick={() => setSelected(i)}
              className={cn('cursor-pointer transition-colors border-l-2',
                selected === i ? 'border-l-brand-500 bg-brand-500/5' : 'border-l-transparent hover:bg-surface-overlay')}>
              {renderItem ? renderItem(item, selected === i) : <DefaultReviewItem item={item} selected={selected === i} />}
            </div>
          ))}
        </div>
        {/* Navigation */}
        {selected !== null && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-border shrink-0">
            <button disabled={selected === 0}
              onClick={() => setSelected(s => Math.max(0, s - 1))}
              className="text-xs text-text-muted hover:text-text-primary disabled:opacity-30 flex items-center gap-1">
              <ChevronLeft size={12} /> Prev
            </button>
            <span className="text-[10px] text-text-muted">{selected + 1} / {filtered.length}</span>
            <button disabled={selected >= filtered.length - 1}
              onClick={() => setSelected(s => Math.min(filtered.length - 1, s + 1))}
              className="text-xs text-text-muted hover:text-text-primary disabled:opacity-30 flex items-center gap-1">
              Next <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto">
        {!selectedItem
          ? <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
              <Eye size={28} className="text-text-muted" />
              <p className="text-sm font-medium text-text-secondary">Select an item to review</p>
            </div>
          : renderPanel
            ? renderPanel(selectedItem)
            : <DefaultReviewPanel item={selectedItem} />
        }
      </div>
    </div>
  )
}

function DefaultReviewItem({ item, selected }) {
  return (
    <div className={cn('px-4 py-3', selected && 'bg-brand-500/5')}>
      <p className="text-xs font-medium text-text-primary truncate">{item.title || item.name || `#${item.id}`}</p>
      {item.status && <Badge value={item.status} label={item.status} colorTag="gray" />}
    </div>
  )
}

function DefaultReviewPanel({ item }) {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-base font-semibold text-text-primary">{item.title || item.name}</h2>
      {item.description && <p className="text-sm text-text-secondary">{item.description}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. APPROVAL QUEUE TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cross-module pending approvals with inline record preview.
 * Different from Task Inbox (workflow-task-centric) — this is
 * approval-centric and shows the record content so approvers
 * don't need to navigate away.
 *
 * USAGE:
 *   <ApprovalQueueTemplate
 *     entityTypes={['RISK', 'POLICY', 'AUDIT']}
 *     onApprove={(taskId, remarks) => act({ taskInstanceId: taskId, actionType: 'APPROVE', remarks })}
 *     onReject={(taskId, remarks) => act({ taskInstanceId: taskId, actionType: 'REJECT', remarks })}
 *     acting={acting}
 *   />
 */
export function ApprovalQueueTemplate({
  entityTypes = [],
  onApprove,
  onReject,
  acting = false,
}) {
  const [selected, setSelected]   = useState(null)
  const [remarks, setRemarks]     = useState('')
  const [action, setAction]       = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['approval-queue', entityTypes],
    // FIX: /v1/tasks/my does not exist — correct endpoint is /v1/workflows/my-tasks
    // (same one used by useMyTasks in useWorkflow.js for the Task Inbox).
    // Filtered to ASSIGNER role tasks only, which are the approval-queue entries.
    queryFn: () => api.get('/v1/workflows/my-tasks', {
      params: { taskRole: 'ASSIGNER', status: 'PENDING', entityTypes: entityTypes.join(',') }
    }),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })

  const tasks = data?.data?.data || data?.data?.items || data?.data || []

  const handleAct = () => {
    if (!selected) return
    if (action === 'APPROVE') onApprove?.(selected.id, remarks)
    if (action === 'REJECT')  onReject?.(selected.id, remarks)
    setAction(null)
    setRemarks('')
    setSelected(null)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Task list */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <p className="text-xs font-semibold text-text-primary">Pending approvals</p>
          <p className="text-[10px] text-text-muted mt-0.5">{tasks.length} awaiting your action</p>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {isLoading && <p className="p-4 text-xs text-text-muted">Loading…</p>}
          {!isLoading && tasks.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 size={24} className="text-status-pass-fg" />
              <p className="text-xs text-text-muted">All clear — no pending approvals</p>
            </div>
          )}
          {tasks.map(task => (
            <button key={task.id} onClick={() => setSelected(task)}
              className={cn(
                'w-full text-left px-4 py-3 transition-colors border-l-2',
                selected?.id === task.id
                  ? 'border-l-brand-500 bg-brand-500/5'
                  : 'border-l-transparent hover:bg-surface-overlay'
              )}>
              <div className="flex items-start gap-2">
                <div className={cn('w-2 h-2 rounded-full mt-1 shrink-0',
                  task.priority === 'CRITICAL' ? 'bg-status-fail-bg' :
                  task.priority === 'HIGH' ? 'bg-status-warn-bg' : 'bg-status-info-bg')} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">{task.stepName || task.workflowName}</p>
                  <p className="text-[10px] text-text-muted">{task.entityType} #{task.entityId}</p>
                  {task.slaDueAt && (
                    <p className={cn('text-[10px] mt-0.5',
                      new Date(task.slaDueAt) < new Date() ? 'text-status-fail-fg' : 'text-text-muted')}>
                      <Clock size={9} className="inline mr-0.5" />
                      {formatDate(task.slaDueAt)}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Approval panel */}
      <div className="flex-1 overflow-y-auto">
        {!selected
          ? <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
              <Inbox size={28} className="text-text-muted" />
              <p className="text-sm font-medium text-text-secondary">Select a task to review and approve</p>
            </div>
          : (
            <div className="p-6 space-y-6">
              {/* Task context */}
              <div className="p-4 rounded-card bg-surface-overlay border border-border">
                <p className="text-xs font-semibold text-text-primary">{selected.stepName}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{selected.workflowName} · {selected.entityType} #{selected.entityId}</p>
              </div>

              {/* Remarks */}
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1">Remarks (optional for approval, required for rejection)</label>
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
                  rows={3} placeholder="Add context for your decision…"
                  className="w-full px-3 py-2 text-xs bg-surface-overlay border border-border rounded-card text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <Button size="sm" icon={CheckCircle2} loading={acting && action === 'APPROVE'}
                  onClick={() => { setAction('APPROVE'); setTimeout(handleAct, 0) }}>
                  Approve
                </Button>
                <Button size="sm" variant="danger" icon={X} loading={acting && action === 'REJECT'}
                  onClick={() => { setAction('REJECT'); setTimeout(handleAct, 0) }}>
                  Reject
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                  Skip
                </Button>
              </div>
            </div>
          )
        }
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. DASHBOARD WIDGET SLOT — module contribution helper
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Thin wrapper to let any module contribute a widget to the dashboard.
 * The widget definition lives in the DB (ui_dashboard_widgets table).
 * This component just renders it consistently.
 *
 * USAGE: Same as DashboardWidgetCard — no change needed.
 * The DB-driven DashboardGrid already handles this.
 *
 * For new modules to appear on the dashboard, Platform Admin adds a row to
 * ui_dashboard_widgets with the appropriate dataEndpoint and widgetType.
 * No code change needed. DashboardGrid renders it automatically.
 *
 * Supported widgetTypes (already in DashboardWidget.jsx):
 *   KPI_CARD, BAR_CHART, LINE_CHART, PIE_CHART, AREA_CHART
 *
 * New module widgets are registered via:
 *   INSERT INTO ui_dashboard_widgets (widget_key, title, subtitle, widget_type,
 *     data_endpoint, config_json, grid_col_span, sort_order, allowed_sides, is_active)
 *   VALUES
 *     ('risk_open_count', 'Open Risks', 'Currently open', 'KPI_CARD',
 *      '/v1/risks/count?status=OPEN', '{"description":"Requires treatment"}', 1, 10, 'ORGANIZATION', true),
 *     ('risk_by_category', 'Risks by Category', '', 'PIE_CHART',
 *      '/v1/risks/by-category', '{"nameKey":"category","valueKey":"count"}', 2, 11, 'ORGANIZATION', true);
 */
export { DashboardWidgetCard }