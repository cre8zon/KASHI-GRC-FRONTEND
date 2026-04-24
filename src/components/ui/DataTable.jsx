import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { DynamicBadge } from './Badge'
import { cn } from '../../lib/cn'
import { formatDate, truncate } from '../../utils/format'

/**
 * DataTable — fully DB-driven.
 * columns array comes from UiLayout.columnsJson via screenConfig.layout.columns (parsed JSON).
 * Supports: text, badge, date, mono, number column types.
 */
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
  const [hoveredRow, setHoveredRow] = useState(null)

  const renderCell = (row, col) => {
    const val = row[col.key]
    switch (col.type) {
      case 'custom':
        return col.render ? col.render(row) : <span>{val ?? '—'}</span>
      case 'badge':
        return <DynamicBadge value={val} componentKey={col.componentKey || col.key} config={config} />
      case 'date':
        return <span className="font-mono text-xs text-text-secondary">{formatDate(val)}</span>
      case 'mono':
        return <span className="font-mono text-xs">{val ?? '—'}</span>
      case 'number':
        return <span className="font-mono text-xs tabular-nums">{val ?? '—'}</span>
      case 'truncate':
        return <span title={val}>{truncate(val, col.truncateLen || 40)}</span>
      default:
        return <span>{val ?? '—'}</span>
    }
  }

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null
    if (sortBy !== col.key) return <ChevronsUpDown size={11} className="text-text-muted" />
    return sortDir === 'asc'
      ? <ChevronUp size={11} className="text-brand-400" />
      : <ChevronDown size={11} className="text-brand-400" />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
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
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={cn(
                    'px-3 py-2 text-left text-xs font-semibold text-text-muted uppercase tracking-wider',
                    'whitespace-nowrap select-none',
                    col.sortable && 'cursor-pointer hover:text-text-secondary'
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
            {loading && (
              <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="py-16 text-center">
                <span className="inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </td></tr>
            )}
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
                {columns.map(col => (
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
