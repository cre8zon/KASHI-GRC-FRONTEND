import { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { DynamicBadge, Badge } from './Badge'
import { COLOR_MAP } from '../../config/constants'

// Semantic color fallback for values that don't have a configured componentKey
const SEMANTIC_COLORS = {
  CRITICAL:'red', HIGH:'amber', MEDIUM:'yellow', LOW:'green',
  OPEN:'blue', IN_PROGRESS:'indigo', PENDING_REVIEW:'purple',
  TRIAGED:'cyan', RESOLVED:'green', CLOSED:'gray',
  ACCEPTED_RISK:'amber', PENDING_VALIDATION:'yellow',
  INTERNAL:'blue', EXTERNAL:'purple', AUTOMATED:'cyan', REGULATORY:'indigo',
  ACTIVE:'green', INACTIVE:'gray', DRAFT:'gray', APPROVED:'green',
  REJECTED:'red', CANCELLED:'gray', COMPLETED:'green',
}
import { cn } from '../../lib/cn'
import { formatDate, truncate } from '../../utils/format'
import api from '../../config/axios.config'

/**
 * DataTable — fully DB-driven.
 * columns array comes from UiLayout.columnsJson via screenConfig.layout.columns (parsed JSON).
 * Supports: text, badge, date, mono, number column types.
 */
// LookupCell — resolves a numeric user ID to a display name.
// Used by the 'lookup' column type in DataTable. Fetches once per unique id value,
// shows initials avatar + name, falls back to the raw id while loading.
const lookupCache = {}  // module-level cache — survives re-renders, cleared on page refresh
function LookupCell({ id }) {
  const [label, setLabel] = useState(() => lookupCache[id] || null)
  useEffect(() => {
    if (!id || label) return
    if (lookupCache[id]) { setLabel(lookupCache[id]); return }
    api.get(`/v1/users/${id}`)
      .then(r => {
        const u = r?.data?.data || r?.data || r
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || String(id)
        lookupCache[id] = name
        setLabel(name)
      })
      .catch(() => { lookupCache[id] = ''; setLabel('') })
  }, [id]) // eslint-disable-line

  if (!id) return <span className="text-text-muted">—</span>
  if (label === '') return <span className="text-text-muted">—</span>
  const display = label || String(id)
  const initials = display.split(' ').map(p => p[0]).filter(Boolean).join('').toUpperCase().slice(0, 2)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-ink text-[9px] font-semibold flex items-center justify-center shrink-0">
        {initials}
      </span>
      <span className={cn('text-xs truncate max-w-24', label ? 'text-text-primary' : 'text-text-muted')}>{display}</span>
    </span>
  )
}

export function DataTable({
  columns = [],
  data = [],
  config,
  pagination,
  onPageChange,
  onSort,
  sortBy,
  sortDir,
  onRowClick,
  loading,
  emptyMessage = 'No records found',
  selectable = false,
  selectedIds = [],
  onSelectionChange,
}) {
  const [hoveredRow,  setHoveredRow]  = useState(null)
  const [dragColIdx,  setDragColIdx]  = useState(null)  // column drag-to-reorder
  const [localCols,   setLocalCols]   = useState(null)  // null = use prop columns
  const displayCols = localCols || columns

  const renderCell = (row, col) => {
    const val = row[col.key]
    switch (col.type) {
      case 'custom':
        return col.render ? col.render(row) : <span>{val ?? '—'}</span>
      case 'badge': {
        // Try DynamicBadge first (reads colorTag from screenConfig.components)
        // If no componentKey or config, fall back to semantic color map
        const hasConfig = config?.components?.[col.componentKey || col.key]?.options?.length > 0
        if (hasConfig) {
          return <DynamicBadge value={val} componentKey={col.componentKey || col.key} config={config} />
        }
        const colorTag = SEMANTIC_COLORS[String(val).toUpperCase()] ||
          // Boolean fallback — true = bad (breached), false = good (on track) for SLA-type fields
          (val === true  ? 'red'   :
           val === false ? 'green' : 'gray')
        const cls = COLOR_MAP[colorTag] || COLOR_MAP.gray
        // Human-friendly label for boolean badge columns
        const boolLabel = typeof val === 'boolean'
          ? (val ? 'Breached' : 'On track')
          : String(val ?? '—').replace(/_/g,' ')
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold whitespace-nowrap ${cls}`}>
            {boolLabel}
          </span>
        )
      }
      case 'date':
        return <span className="font-mono text-xs text-text-secondary">{formatDate(val)}</span>
      case 'mono':
        return <span className="font-mono text-xs">{val ?? '—'}</span>
      case 'number':
        return <span className="font-mono text-xs tabular-nums">{val ?? '—'}</span>
      case 'truncate':
        return <span title={val}>{truncate(val, col.truncateLen || 40)}</span>
      // FIX: 'user' type — render ownerName / assigneeName alongside the id field.
      // Screen designer sets key: 'ownerId' but the API often returns ownerName as a companion field.
      // Try {key}Name, {key}Email, or the raw value (which may already be a name string).
      case 'lookup':
        return <LookupCell id={val} />
      case 'user': {
        const nameKey = col.key.replace(/Id$/, 'Name').replace(/id$/, 'Name')
        const companion = row[nameKey]
        if (companion) {
          const initials = String(companion).split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
          return (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-ink text-[9px] font-semibold flex items-center justify-center shrink-0">
                {initials}
              </span>
              <span className="text-xs text-text-primary truncate max-w-24">{companion}</span>
            </span>
          )
        }
        // No companion name field — resolve via fetch
        return <LookupCell id={val} />
      }
      default:
        return <span>{val ?? '—'}</span>
    }
  }

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null
    if (sortBy !== col.key) return <ChevronsUpDown size={11} className="text-text-muted" />
    return sortDir === 'asc'
      ? <ChevronUp size={11} className="text-brand-ink" />
      : <ChevronDown size={11} className="text-brand-ink" />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-raised">
            <tr className="border-b border-border">
              {selectable && (
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    className="rounded border-border bg-surface-raised accent-brand-500"
                    onChange={e => onSelectionChange?.(e.target.checked ? data.map(r => r.id) : [])}
                    checked={selectedIds.length === data.length && data.length > 0}
                  />
                </th>
              )}
              {displayCols.map((col, ci) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  draggable
                  onDragStart={() => setDragColIdx(ci)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => {
                    if (dragColIdx === null || dragColIdx === ci) return
                    const next = [...displayCols]
                    const [moved] = next.splice(dragColIdx, 1)
                    next.splice(ci, 0, moved)
                    setLocalCols(next)
                    setDragColIdx(null)
                  }}
                  onDragEnd={() => setDragColIdx(null)}
                  className={cn(
                    'px-3 py-2 text-left text-xs font-semibold text-text-muted uppercase tracking-wider',
                    'whitespace-nowrap select-none cursor-grab active:cursor-grabbing',
                    col.sortable && 'hover:text-text-secondary',
                    dragColIdx === ci && 'opacity-40'
                  )}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label} <SortIcon col={col} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, r) => (
              <tr key={r} className="border-b border-border/50">
                {selectable && (
                  <td className="pl-4 py-3">
                    <div className="h-4 w-4 rounded bg-surface-overlay animate-pulse" />
                  </td>
                )}
                {columns.map((col, c) => (
                  <td key={c} className="px-4 py-3">
                    {c === 1
                      ? <div className="h-3 bg-surface-overlay rounded animate-pulse" style={{ width: `${60 + (r * 13 + c * 7) % 30}%` }} />
                      : c === 2
                      ? <div className="h-5 w-16 rounded-full bg-surface-overlay animate-pulse" />
                      : <div className="h-3 bg-surface-overlay rounded animate-pulse" style={{ width: `${40 + (r * 7 + c * 11) % 25}%` }} />
                    }
                  </td>
                ))}
              </tr>
            ))}
            {!loading && data.length === 0 && (
              <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="py-16 text-center text-text-muted text-sm">
                {emptyMessage}
              </td></tr>
            )}
            {!loading && data.map((row, i) => (
              <tr
                key={row.id || i}
                className={cn(
                  'border-b border-border/50 data-row transition-colors',
                  onRowClick && 'cursor-pointer',
                  hoveredRow === i && 'bg-surface-overlay'
                )}
                onClick={() => onRowClick?.(row)}
                onMouseEnter={() => setHoveredRow(i)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                {selectable && (
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-border bg-surface-raised accent-brand-500"
                      checked={selectedIds.includes(row.id)}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...selectedIds, row.id]
                          : selectedIds.filter(id => id !== row.id)
                        onSelectionChange?.(next)
                      }}
                    />
                  </td>
                )}
                {displayCols.map(col => (
                  <td key={col.key} className="px-3 py-2.5 text-text-primary">
                    {renderCell(row, col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-text-secondary">
          <span className="font-mono">
            {pagination.totalItems} record{pagination.totalItems !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <span>Page <span className="font-mono text-text-primary">{pagination.currentPage}</span> of <span className="font-mono text-text-primary">{pagination.totalPages}</span></span>
            <div className="flex gap-1">
              <button
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface-overlay disabled:opacity-30 transition-colors"
                disabled={!pagination.hasPrevious}
                onClick={() => onPageChange?.(pagination.currentPage - 1)}
              ><ChevronLeft size={13} /></button>
              <button
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface-overlay disabled:opacity-30 transition-colors"
                disabled={!pagination.hasNext}
                onClick={() => onPageChange?.(pagination.currentPage + 1)}
              ><ChevronRight size={13} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}