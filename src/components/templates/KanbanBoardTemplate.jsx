/**
 * KanbanBoardTemplate — status-driven board view for any GRC module.
 *
 * Works for: Risk treatment pipeline, Issue tracking, Audit findings,
 *            Policy review states, Control compliance status.
 *
 * Columns driven by ModuleBlueprint.statusFlowJson statuses.
 * Records drag between columns to trigger status transitions
 * (validates against allowed transitions before calling API).
 *
 * USAGE:
 *   <KanbanBoardTemplate
 *     entityType="RISK"
 *     apiBasePath="/v1/risks"
 *     statusField="status"           // which field drives column placement
 *     statuses={[
 *       { key: 'DRAFT',     label: 'Draft',     colorTag: 'gray' },
 *       { key: 'OPEN',      label: 'Open',      colorTag: 'amber' },
 *       { key: 'IN_REVIEW', label: 'In review', colorTag: 'blue' },
 *       { key: 'APPROVED',  label: 'Approved',  colorTag: 'green' },
 *       { key: 'CLOSED',    label: 'Closed',    colorTag: 'gray' },
 *     ]}
 *     transitions={[                 // from statusFlowJson.transitions
 *       { from: 'DRAFT', to: 'OPEN' },
 *       { from: 'OPEN', to: 'IN_REVIEW' },
 *       { from: 'IN_REVIEW', to: 'APPROVED', permission: 'risk.approve' },
 *     ]}
 *     renderCard={(record) => <RiskKanbanCard record={record} />}
 *     onCardClick={(record) => navigate(`/module/risk/${record.id}`)}
 *     viewContext={viewContext}
 *   />
 */

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, MoreVertical, Search, Filter,
  AlertTriangle, Loader2, GripVertical,
  User, Calendar, Flag,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Progress } from '../ui/ui-primitives'
import { cn } from '../../lib/cn'
import { formatDate } from '../../utils/format'
import api from '../../config/axios.config'
import toast from 'react-hot-toast'

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORITY_DOT = {
  CRITICAL: 'bg-red-400',
  HIGH:     'bg-amber-400',
  MEDIUM:   'bg-blue-400',
  LOW:      'bg-gray-400',
}

// ─── Main component ───────────────────────────────────────────────────────────

export function KanbanBoardTemplate({
  entityType,
  apiBasePath,
  statusField = 'status',
  statuses = [],
  transitions = [],
  renderCard,
  onCardClick,
  onCreateInColumn,
  viewContext,
  extraFilters = {},
  columnWidth = 280,
}) {
  const qc = useQueryClient()
  const [search, setSearch]         = useState('')
  const [dragging, setDragging]     = useState(null)  // { record, fromStatus }
  const [dragOver, setDragOver]     = useState(null)  // target column key

  const { data: res, isLoading } = useQuery({
    queryKey: ['kanban', entityType, apiBasePath, extraFilters],
    queryFn: () => api.get(apiBasePath, { params: { take: 500, ...extraFilters } }),
    staleTime: 30 * 1000,
  })

  const records = res?.data?.data || res?.data?.items || res?.data || []

  const updateMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`${apiBasePath}/${id}`, { [statusField]: status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kanban', entityType] }); toast.success('Status updated') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to update status'),
  })

  // Group records by status
  const columns = statuses.map(col => ({
    ...col,
    records: records.filter(r => {
      const statusMatch = r[statusField] === col.key
      const searchMatch = !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
      return statusMatch && searchMatch
    }),
  }))

  // Validate if drag is allowed
  const canDrop = useCallback((fromStatus, toStatus) => {
    if (fromStatus === toStatus) return false
    if (transitions.length === 0) return true  // no restrictions = free movement
    const allowed = transitions.some(t => t.from === fromStatus && t.to === toStatus)
    if (!allowed) return false
    // Check permission if transition requires one
    const transition = transitions.find(t => t.from === fromStatus && t.to === toStatus)
    if (transition?.permission && viewContext?.permissions) {
      return viewContext.permissions.includes(transition.permission)
    }
    return true
  }, [transitions, viewContext])

  const handleDrop = (toStatus) => {
    if (!dragging) return
    const { record, fromStatus } = dragging
    if (!canDrop(fromStatus, toStatus)) {
      toast.error(`Cannot move from ${fromStatus} to ${toStatus}`)
      setDragging(null)
      setDragOver(null)
      return
    }
    updateMut.mutate({ id: record.id, status: toStatus })
    setDragging(null)
    setDragOver(null)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 size={20} className="animate-spin text-brand-400" />
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search records…"
            className="h-7 pl-8 pr-3 w-48 text-xs bg-surface-overlay border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div className="flex items-center gap-3 ml-auto">
          {statuses.map(s => (
            <span key={s.key} className="flex items-center gap-1.5 text-[10px] text-text-muted">
              <span className="text-text-primary font-mono">
                {columns.find(c => c.key === s.key)?.records.length ?? 0}
              </span>
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 h-full p-4" style={{ minWidth: `${statuses.length * (columnWidth + 12)}px` }}>
          {columns.map(col => (
            <KanbanColumn
              key={col.key}
              col={col}
              width={columnWidth}
              isDragOver={dragOver === col.key}
              canDrop={dragging ? canDrop(dragging.fromStatus, col.key) : true}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col.key) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(col.key)}
              onCreateClick={onCreateInColumn ? () => onCreateInColumn(col.key) : undefined}
              viewContext={viewContext}
            >
              {col.records.map(record => (
                <KanbanCard
                  key={record.id}
                  record={record}
                  renderCard={renderCard}
                  onClick={() => onCardClick?.(record)}
                  onDragStart={() => setDragging({ record, fromStatus: col.key })}
                  onDragEnd={() => { setDragging(null); setDragOver(null) }}
                />
              ))}
            </KanbanColumn>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({ col, width, children, isDragOver, canDrop, onDragOver, onDragLeave, onDrop, onCreateClick }) {
  return (
    <div
      style={{ width, minWidth: width }}
      className="flex flex-col h-full"
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <Badge value={col.key} label={col.label} colorTag={col.colorTag || 'gray'} />
          <span className="text-[10px] font-mono text-text-muted bg-surface-overlay border border-border px-1.5 py-0.5 rounded">
            {Array.isArray(children) ? children.filter(Boolean).length : 0}
          </span>
        </div>
        {onCreateClick && (
          <button onClick={onCreateClick}
            className="h-5 w-5 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
            <Plus size={12} />
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'flex-1 overflow-y-auto rounded-xl border-2 border-dashed transition-all p-1.5 space-y-2',
          isDragOver && canDrop  ? 'border-brand-500 bg-brand-500/5' : '',
          isDragOver && !canDrop ? 'border-red-500/40 bg-red-500/5' : '',
          !isDragOver ? 'border-transparent' : '',
        )}
      >
        {children}
        {isDragOver && !canDrop && (
          <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] text-red-400">
            <AlertTriangle size={10} /> Transition not allowed
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function KanbanCard({ record, renderCard, onClick, onDragStart, onDragEnd }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="bg-surface-raised border border-border rounded-lg cursor-pointer hover:border-brand-500/30 hover:shadow-elevated transition-all active:opacity-60 active:scale-95 select-none"
    >
      {renderCard
        ? renderCard(record)
        : <DefaultKanbanCard record={record} />
      }
    </div>
  )
}

// ─── Default card renderer ────────────────────────────────────────────────────

export function DefaultKanbanCard({ record }) {
  const pri = record.priority ? PRIORITY_DOT[record.priority] : null

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-start gap-2">
        {pri && <span className={cn('w-2 h-2 rounded-full shrink-0 mt-1', pri)} />}
        <p className="text-xs font-medium text-text-primary leading-snug flex-1">
          {record.title || record.name || `#${record.id}`}
        </p>
      </div>
      {record.description && (
        <p className="text-[11px] text-text-muted line-clamp-2">{record.description}</p>
      )}
      <div className="flex items-center gap-2 pt-1">
        {record.ownerName && (
          <div className="flex items-center gap-1 text-[10px] text-text-muted">
            <User size={10} />
            <span>{record.ownerName}</span>
          </div>
        )}
        {record.dueDate && (
          <div className={cn('flex items-center gap-1 text-[10px] ml-auto',
            new Date(record.dueDate) < new Date() ? 'text-red-400' : 'text-text-muted')}>
            <Calendar size={10} />
            <span>{formatDate(record.dueDate)}</span>
          </div>
        )}
      </div>
      {record.actionItemCount > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-text-muted border-t border-border/50 pt-1.5">
          <span>{record.actionItemCount} action item{record.actionItemCount > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  )
}