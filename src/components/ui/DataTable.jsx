import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
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
import { getUserLabel } from '../../lib/userLookup'

/**
 * DataTable — fully DB-driven.
 * columns array comes from UiLayout.columnsJson via screenConfig.layout.columns (parsed JSON).
 * Supports: text, badge, date, mono, number column types.
 */
// LookupCell — resolves a numeric user ID to a display name.
// Used by the 'lookup' column type in DataTable. Ids from every cell on the page
// are resolved together in ONE batched call (lib/userLookup) instead of one full
// GET /v1/users/{id} per cell; shows initials avatar + name, falls back to the
// raw id while loading.
const lookupCache = {}  // module-level cache — survives re-renders, cleared on page refresh
function LookupCell({ id }) {
  const [label, setLabel] = useState(() => lookupCache[id] || null)
  useEffect(() => {
    if (!id || label) return
    if (lookupCache[id]) { setLabel(lookupCache[id]); return }
    let cancelled = false
    getUserLabel(id).then(name => {
      lookupCache[id] = name
      if (!cancelled) setLabel(name)
    })
    return () => { cancelled = true }
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

/**
 * Caps the table's own scroll area to the space left below it inside the page's
 * scroll container, so the BODY scrolls inside the table and the sticky header
 * stays visible.
 *
 * Why this is needed: every page body (PageLayout) is the scroll container, and
 * most callers put the table straight into it. The table's `h-full` therefore
 * resolved to "as tall as the rows", its inner overflow-auto never scrolled,
 * and the sticky header scrolled off with the page. Callers that already give
 * the table a bounded flex parent are unaffected — this is only a ceiling.
 */
const MIN_TABLE_HEIGHT = 280
function findScrollParent(node) {
  let p = node?.parentElement
  while (p && p !== document.body) {
    const oy = getComputedStyle(p).overflowY
    if (oy === 'auto' || oy === 'scroll') return p
    p = p.parentElement
  }
  return null
}
function useFitToViewport(scrollRef, footerRef, deps) {
  const [maxHeight, setMaxHeight] = useState(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const sp = findScrollParent(el)
    const measure = () => {
      const footer = footerRef.current?.offsetHeight || 0
      const elTop = el.getBoundingClientRect().top
      let available
      if (sp) {
        const spRect = sp.getBoundingClientRect()
        // Position as if the page were scrolled to the top, so scrolling the
        // page does not make the table grow and shrink.
        const topInSp = elTop - spRect.top + sp.scrollTop
        const padBottom = parseFloat(getComputedStyle(sp).paddingBottom) || 0
        available = sp.clientHeight - topInSp - footer - padBottom - 24
      } else {
        available = window.innerHeight - elTop - footer - 24
      }
      setMaxHeight(Math.max(MIN_TABLE_HEIGHT, Math.floor(available)))
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro) { if (sp) ro.observe(sp); if (sp?.firstElementChild) ro.observe(sp.firstElementChild) }
    window.addEventListener('resize', measure)
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure) }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return maxHeight
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
  /**
   * Optional (row) => boolean. Rows returning false get a disabled checkbox and
   * are excluded from Select all.
   *
   * Telling the user AFTERWARDS that 8 of their 12 were skipped is a worse
   * experience than not letting them pick those 8 — they have already committed
   * to an action by then. Defaults to everything selectable, so every existing
   * caller is unaffected.
   */
  isRowSelectable,
}) {
  const [hoveredRow,  setHoveredRow]  = useState(null)
  const [dragColIdx,  setDragColIdx]  = useState(null)  // column drag-to-reorder
  const [localCols,   setLocalCols]   = useState(null)  // null = use prop columns
  // Defined once rather than inline, so the header checkbox and the row
  // checkboxes cannot drift apart in what they consider selectable.
  const selectableRow  = (row) => (isRowSelectable ? isRowSelectable(row) : true)
  const selectableCount = selectable ? data.filter(selectableRow).length : 0

  const displayCols = localCols || columns
  const scrollRef = useRef(null)
  const footerRef = useRef(null)
  const maxHeight = useFitToViewport(scrollRef, footerRef, [loading, data.length, !!pagination])

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
      /**
       * A completion bar. Reads the percent from col.key and, if the row
       * supplies one, a companion `{key}Label` for the count behind it — so a
       * training row can read "3/8" rather than "38%", which is the number a
       * learner actually wants.
       *
       * Added because `render` is a function and cannot survive a trip through
       * columns_json, so a bar could not be expressed in config at all. It has
       * to be a type the renderer knows.
       *
       * A null percent renders an em dash, not a 0% bar: "not started" and
       * "started and got nowhere" are different facts, and an empty bar states
       * the second when it means the first.
       */
      case 'progress': {
        if (val === null || val === undefined) return <span className="text-text-muted">—</span>
        const pct = Math.max(0, Math.min(100, Number(val) || 0))
        const label = row[`${col.key}Label`] ?? `${pct}%`
        const done = pct >= 100
        return (
          <div className="flex items-center gap-2 min-w-[90px]">
            <div className="flex-1 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${done ? 'bg-status-pass-fg' : 'bg-brand-fill'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-[10px] tabular-nums text-text-muted whitespace-nowrap">
              {label}
            </span>
          </div>
        )
      }
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
        // Two lines at most — a long title used to wrap to six and make every
        // row as tall as its longest cell. The full text is on hover.
        return <span title={typeof val === 'string' && val.length > 24 ? val : undefined}>{val ?? '—'}</span>
    }
  }

  // ── Column widths: content-aware, one line per row ─────────────────────────
  // The table uses a fixed layout. ONE primary column (the title / name) takes
  // whatever room is left and may wrap to two lines; every other column gets a
  // width suited to what it holds — a configured width is honoured within a
  // sensible range for its type — and its content stays on one line, truncated
  // with the full value on hover. Rows stay one height, columns stop fighting
  // over space, and the table only scrolls sideways when the window really is
  // narrower than the columns need.
  const layout = useMemo(() => {
    // [min, max, default] px per column type. Defaults are deliberately lean:
    // eleven columns must still fit a 1500px table, with the primary column
    // getting the rest.
    const RANGE = {
      mono: [60, 200, 90], number: [56, 110, 80], badge: [88, 160, 110], date: [96, 140, 112],
      user: [130, 220, 160], lookup: [130, 220, 160], progress: [110, 180, 140], truncate: [120, 280, 180],
      text: [100, 220, 130],
    }
    const PRIMARY_KEYS = ['title', 'name', 'label', 'titleSnapshot', 'controlNameSnapshot', 'testNameSnapshot', 'displayName', 'fullName']
    const primaryKey = (displayCols.find(c => PRIMARY_KEYS.includes(c.key))
      || displayCols.find(c => !c.type || c.type === 'text' || c.type === 'truncate'))?.key
    let fixedTotal = selectable ? 40 : 0
    const widths = {}
    for (const c of displayCols) {
      if (c.key === primaryKey) continue
      let w
      if (c.type === 'custom') w = Number(c.width) || 140
      else {
        const [lo, hi, dflt] = RANGE[c.type] || RANGE.text
        w = Math.min(hi, Math.max(lo, Number(c.width) || dflt))
      }
      widths[c.key] = w
      fixedTotal += w
    }
    const primaryMin = primaryKey ? Math.max(260, Number(displayCols.find(c => c.key === primaryKey)?.minWidth) || 0) : 0
    // The primary column gets a width too (its floor, with some weight), and
    // the table is full width: when there is spare room the browser spreads it
    // across ALL columns in proportion, so truncated keys and routes get room
    // as well instead of the title column swallowing everything.
    if (primaryKey) widths[primaryKey] = Math.round(primaryMin * 1.25)
    return { primaryKey, widths, minTableWidth: fixedTotal + primaryMin }
  }, [displayCols, selectable])

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null
    if (sortBy !== col.key) return <ChevronsUpDown size={11} className="text-text-muted" />
    return sortDir === 'asc'
      ? <ChevronUp size={11} className="text-brand-ink" />
      : <ChevronDown size={11} className="text-brand-ink" />
  }

  return (
    <div className="flex flex-col h-full min-h-0 rounded-card border border-border-subtle overflow-hidden glass-card">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto overscroll-contain scroll-quiet"
           style={maxHeight ? { maxHeight } : undefined}>
        {/* border-separate, not collapse: with collapse, sticky header cells
            lose their borders and rows show through the seam while scrolling. */}
        <table className="w-full text-sm border-separate border-spacing-0 table-fixed"
          style={{ minWidth: layout.minTableWidth }}>
          <colgroup>
            {selectable && <col style={{ width: 40 }} />}
            {displayCols.map(col => (
              <col key={col.key} style={{ width: layout.widths[col.key] }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              {selectable && (
                <th className="w-10 px-3 py-2.5 bg-surface-raised/90 backdrop-blur-md border-b border-border">
                  <input
                    type="checkbox"
                    className="rounded border-border bg-surface-raised accent-brand-500"
                    onChange={e => onSelectionChange?.(
                      e.target.checked ? data.filter(selectableRow).map(r => r.id) : [])}
                    // Compared against the SELECTABLE rows, not all rows —
                    // otherwise "select all" could never show as checked on a
                    // page containing anything ineligible.
                    checked={selectableCount > 0 && selectedIds.length === selectableCount}
                    disabled={selectableCount === 0}
                  />
                </th>
              )}
              {displayCols.map((col, ci) => (
                <th
                  key={col.key}
                  title={col.label}
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
                    'px-3 py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider',
                    'bg-surface-raised/90 backdrop-blur-md border-b border-border',
                    'whitespace-nowrap select-none cursor-grab active:cursor-grabbing',
                    col.sortable && 'hover:text-text-secondary',
                    dragColIdx === ci && 'opacity-40'
                  )}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="truncate">{col.label}</span> <SortIcon col={col} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, r) => (
              <tr key={r} className="[&>td]:border-b [&>td]:border-border/50">
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
                  '[&>td]:border-b [&>td]:border-border/50 data-row transition-colors',
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
                      disabled={!selectableRow(row)}
                      title={selectableRow(row) ? undefined
                        : 'This record cannot be included in a bulk action'}
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
                  <td key={col.key}
                    className={cn('px-3 py-2.5 text-text-primary align-middle',
                      // Row-action columns (keys starting "__") may open menus,
                      // so they are never clipped. Every other cell stays inside
                      // its column — custom ones too, which is where long keys
                      // and routes were spilling into the next column.
                      !String(col.key).startsWith('__') && 'overflow-hidden')}>
                    {/* Primary column: up to two lines. Every other column: one
                        line, cut with an ellipsis (full value on hover). */}
                    {String(col.key).startsWith('__')
                      ? renderCell(row, col)
                      : <div className={cn('min-w-0',
                          col.key === layout.primaryKey ? 'line-clamp-2 break-words' : 'truncate whitespace-nowrap')}
                          title={col.type === 'custom' && typeof row[col.key] === 'string' ? row[col.key] : undefined}>
                          {renderCell(row, col)}
                        </div>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div ref={footerRef} className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-border text-xs text-text-secondary">
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