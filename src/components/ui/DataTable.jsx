import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Columns3, Check, RotateCcw } from 'lucide-react'
import { useTablePrefs } from '../../hooks/useTablePrefs'
import { autoTableKey } from '../../lib/tableKey'
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
  NEW:'blue', INVESTIGATING:'indigo', CONTAINED:'amber', ERADICATED:'cyan',
  RECOVERED:'green', FALSE_POSITIVE:'gray', UNDER_REVIEW:'purple', DEPRECATED:'gray',
  OVERDUE:'red', BLOCKED:'red', MITIGATED:'green', ACCEPTED:'amber', NOT_STARTED:'gray',
}
import { cn } from '../../lib/cn'
import { formatDate, truncate } from '../../utils/format'
import api from '../../config/axios.config'
import { getUserLabel } from '../../lib/userLookup'

// ── Plain-cell formatting ─────────────────────────────────────────────────
// Most module columns are configured as plain text, so the raw API value was
// printed as-is: "2026-09-18T22:23:41", "UNAUTHORISED_ACCESS", and a ref cut
// to "INC-DEMO-…" by a width that never fit it. The plain cell now formats by
// what the value IS, and the same reading drives the column's width.
const ISO_DT   = /^\d{4}-\d{2}-\d{2}(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
const ENUM_VAL = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/
const ENUM_KEY = /(status|severity|priority|criticality|level|type|category|state|tier|class|source|likelihood|impact|treatment|stage|phase|rating|kind|origin)$/i
const CHIP_KEY = /(status|severity|priority|criticality|rating|state|level)$/i
const REF_KEY  = /(ref|code|number|key)$/i
const REF_VAL  = /^[A-Z][A-Z0-9]*(?:[-.][A-Z0-9]+)+$/i
const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function cellKind(col, val) {
  if (val === null || val === undefined || val === '') return 'empty'
  if (typeof val === 'boolean') return 'bool'
  if (typeof val !== 'string') return 'text'
  if (ISO_DT.test(val)) return val.length > 10 ? 'datetime' : 'date'
  // Codes and keys stay exactly as stored (AUDIT_CREATE is a code, not a phrase).
  if (REF_KEY.test(col.key) && /^[\w.-]+$/.test(val)) return 'ref'
  if (ENUM_VAL.test(val) && val.length >= 3 && (val.includes('_') || ENUM_KEY.test(col.key))) {
    return CHIP_KEY.test(col.key) ? 'chip' : 'enum'
  }
  if (REF_VAL.test(val) && /\d/.test(val) && !val.includes(' ')) return 'ref'
  return 'text'
}
const humanise = (v) => {
  const t = String(v).replace(/_/g, ' ').toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}
// Local date as "18 Sep 2026" plus "22:23" — short, unambiguous, and the
// same width on every row (Intl's en-IN gives "18 Sept 2026, 10:23 pm").
function splitDate(val) {
  const d = new Date(val.length === 10 ? val + 'T00:00:00' : val)
  if (isNaN(d)) return { day: val, time: '' }
  const day = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  const time = val.length > 10 ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''
  return { day, time }
}
// What the cell will show, as text — used to size the column.
function cellText(col, val) {
  switch (cellKind(col, val)) {
    case 'empty':    return '—'
    case 'bool':     return val ? 'Yes' : 'No'
    case 'datetime': { const d = splitDate(val); return `${d.day}  ${d.time}` }
    case 'date':     return splitDate(val).day
    case 'chip':     return humanise(val) + '    '
    case 'enum':     return humanise(val)
    default:         return String(val)
  }
}

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
    // Everything that sits below the table's scroll area inside the page's
    // scroll container: following siblings (the pagination footer among them)
    // and each ancestor's bottom padding, border and margin, up to the
    // container. Measured, not guessed — a fixed allowance went stale the
    // moment a page's padding changed and the whole page grew a scrollbar.
    const spaceBelow = () => {
      let total = 0
      for (let node = el; node && node !== sp; node = node.parentElement) {
        const cs = getComputedStyle(node)
        total += parseFloat(cs.marginBottom) || 0
        for (let sib = node.nextElementSibling; sib; sib = sib.nextElementSibling) {
          const ss = getComputedStyle(sib)
          if (ss.position === 'absolute' || ss.position === 'fixed' || ss.display === 'none') continue
          total += sib.offsetHeight + (parseFloat(ss.marginTop) || 0) + (parseFloat(ss.marginBottom) || 0)
        }
        const parent = node.parentElement
        if (parent && parent !== sp) {
          const ps = getComputedStyle(parent)
          total += (parseFloat(ps.paddingBottom) || 0) + (parseFloat(ps.borderBottomWidth) || 0)
        }
      }
      return total
    }
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
        available = sp.clientHeight - topInSp - spaceBelow() - padBottom - 1
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

// ── Columns menu ─────────────────────────────────────────────────────────────
// Opened from the header's last cell. Rendered in a portal: the table sits in
// an overflow-hidden card, which would clip a menu drawn inside it.
function ColumnsMenu({ anchor, columns, hidden, onToggle, onReset, onClose, customised }) {
  const ref = useRef(null)
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor.contains(e.target)) onClose() }
    const key  = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [anchor, onClose])
  const r = anchor.getBoundingClientRect()
  const shownCount = columns.filter(c => !hidden.has(c.key)).length
  // Open downward when there is room, upward when the button sits low on the
  // screen (always downward cut the menu off at the window's bottom edge),
  // and never taller than the space on the chosen side: the column list
  // scrolls inside it instead.
  const GAP = 6, EDGE = 12
  const below = window.innerHeight - r.bottom - GAP - EDGE
  const above = r.top - GAP - EDGE
  const up = below < 320 && above > below
  const pos = up
    ? { bottom: window.innerHeight - r.top + GAP, maxHeight: above }
    : { top: r.bottom + GAP, maxHeight: below }
  return createPortal(
    <div ref={ref} role="menu" aria-label="Columns"
      className="fixed z-[200] w-60 flex flex-col rounded-card border border-border glass-overlay shadow-elevated p-1.5 text-xs"
      style={{ ...pos, right: Math.max(8, window.innerWidth - r.right) }}>
      <div className="shrink-0 px-2 pt-1 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">Show columns</div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-quiet">
        {columns.map(c => {
          const on = !hidden.has(c.key)
          // The last visible column cannot be hidden — an empty table helps nobody.
          const locked = on && shownCount <= 1
          return (
            <button key={c.key} type="button" role="menuitemcheckbox" aria-checked={on} disabled={locked}
              onClick={() => onToggle(c.key)}
              className="w-full flex items-center gap-2 px-2 h-8 rounded-ctl text-left text-text-primary hover:bg-surface-overlay disabled:opacity-50 disabled:cursor-not-allowed">
              <span className={cn('w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors',
                on ? 'bg-brand-500 border-brand-500 text-brand-on' : 'border-border')}>
                {on && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="truncate">{c.label || c.key}</span>
            </button>
          )
        })}
      </div>
      <div className="shrink-0 mt-1 pt-1 border-t border-border">
        <button type="button" onClick={onReset} disabled={!customised}
          className="w-full flex items-center gap-2 px-2 h-8 rounded-ctl text-text-secondary hover:bg-surface-overlay hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed">
          <RotateCcw size={12} /> Reset to default
        </button>
        <p className="px-2 pt-1 pb-0.5 text-[10.5px] leading-snug text-text-muted">
          Drag a header to move it, or its edge to resize. Double-click the edge to fit.
        </p>
      </div>
    </div>,
    document.body
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
  /**
   * Turns on per-user column layout — resize, show/hide, reorder, reset —
   * saved on the server under this key (e.g. "list.audit_policy_list").
   * Without it a key is made from the page path and the columns.
   */
  prefsKey,
}) {
  const [hoveredRow,  setHoveredRow]  = useState(null)
  const [dragColIdx,  setDragColIdx]  = useState(null)  // column drag-to-reorder
  const [localCols,   setLocalCols]   = useState(null)  // null = use prop columns
  // Defined once rather than inline, so the header checkbox and the row
  // checkboxes cannot drift apart in what they consider selectable.
  const selectableRow  = (row) => (isRowSelectable ? isRowSelectable(row) : true)
  const selectableCount = selectable ? data.filter(selectableRow).length : 0

  // ── Saved layout ──────────────────────────────────────────────────────────
  // Every table is customisable. A caller may name its key; otherwise one is
  // made from the page path and the column keys (row-action columns left
  // out, since some pages add those only once rows arrive).
  const columnSig = columns.filter(c => !String(c.key).startsWith('__')).map(c => c.key).join('|')
  const tableKey = useMemo(() => prefsKey || autoTableKey(columnSig), [prefsKey, columnSig])
  const custom = !!tableKey
  const { prefs, update: updatePrefs, reset: resetPrefs } = useTablePrefs(tableKey)
  const [liveWidth, setLiveWidth] = useState(null)   // { key, w } while dragging an edge
  const [menuAnchor, setMenuAnchor] = useState(null)
  const resizingRef = useRef(false)
  const suppressClickRef = useRef(false)
  const isAction = (c) => String(c.key).startsWith('__')

  // All columns in the user's order (hidden ones included — the menu lists
  // them). Saved keys first in saved order; columns added since go after,
  // in their configured order; row-action columns always stay last.
  const orderedCols = useMemo(() => {
    if (!custom) return localCols || columns
    const order = Array.isArray(prefs?.order) ? prefs.order : []
    const rank = (c, i) => { const at = order.indexOf(c.key); return at >= 0 ? at : order.length + i }
    const main = columns.map((c, i) => ({ c, r: rank(c, i), i })).filter(x => !isAction(x.c))
      .sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.c)
    return [...main, ...columns.filter(isAction)]
  }, [custom, columns, localCols, prefs?.order]) // eslint-disable-line react-hooks/exhaustive-deps
  const hiddenSet = useMemo(() => {
    const h = new Set(custom && Array.isArray(prefs?.hidden) ? prefs.hidden : [])
    // Never hide everything: a saved layout from an older column set could.
    return orderedCols.some(c => !isAction(c) && !h.has(c.key)) ? h : new Set()
  }, [custom, prefs?.hidden, orderedCols]) // eslint-disable-line react-hooks/exhaustive-deps
  const displayCols = custom ? orderedCols.filter(c => isAction(c) || !hiddenSet.has(c.key)) : orderedCols
  const savedWidths = (custom && prefs?.widths && typeof prefs.widths === 'object') ? prefs.widths : {}
  const customised = custom && !!prefs && (Object.keys(savedWidths).length > 0
    || (prefs.hidden || []).length > 0 || (prefs.order || []).length > 0)
  const scrollRef = useRef(null)
  const footerRef = useRef(null)
  const maxHeight = useFitToViewport(scrollRef, footerRef, [loading, data.length, !!pagination])

  // The table area's width, so the default layout can fit it exactly.
  const [boxW, setBoxW] = useState(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const read = () => setBoxW(Math.floor(el.clientWidth))
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
          // Same pill as a status in a plain column, so two tables never show
          // one status in two styles.
          <span className={cn('inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-medium whitespace-nowrap', cls)}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            {typeof val === 'boolean' ? boolLabel : humanise(val ?? '—')}
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
      default: {
        // Formatted by what the value is (see cellKind above). Two lines at
        // most for the primary column, one for the rest; full text on hover.
        const kind = cellKind(col, val)
        if (kind === 'empty') return <span className="text-text-muted">—</span>
        if (kind === 'bool')  return <span className="text-text-secondary">{val ? 'Yes' : 'No'}</span>
        if (kind === 'datetime' || kind === 'date') {
          const d = splitDate(val)
          return (
            <span className="tabular-nums whitespace-nowrap" title={val}>
              <span className="text-text-primary">{d.day}</span>
              {d.time && <span className="ml-1.5 text-text-muted text-[11px]">{d.time}</span>}
            </span>
          )
        }
        if (kind === 'chip') {
          const cls = COLOR_MAP[SEMANTIC_COLORS[val]] || COLOR_MAP.gray
          return (
            <span className={cn('inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-medium whitespace-nowrap', cls)}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />{humanise(val)}
            </span>
          )
        }
        if (kind === 'enum') return <span className="text-text-secondary" title={val}>{humanise(val)}</span>
        if (kind === 'ref')  return <span className="font-mono text-[11.5px] text-text-secondary" title={val}>{val}</span>
        return <span title={typeof val === 'string' && val.length > 24 ? val : undefined}>{val}</span>
      }
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
    // Plain columns are sized to what they actually hold on this page (a
    // formatted date, a humanised enum, a full ref) and to their header, within
    // the type's range. A configured width is a floor, not a cap, so a stale
    // 100px no longer cuts every ref to "INC-DEMO-…".
    const sample = data.slice(0, 50)
    const fitWidth = (c) => {
      const mono = sample.some(r => cellKind(c, r?.[c.key]) === 'ref')
      const longest = sample.reduce((m, r) => Math.max(m, cellText(c, r?.[c.key]).length), 0)
      const content = Math.ceil(longest * (mono ? 7.2 : 6.9)) + 26
      const header  = Math.ceil(String(c.label || '').length * 7.4) + (c.sortable ? 42 : 28)
      return Math.max(content, header)
    }
    for (const c of displayCols) {
      if (c.key === primaryKey) continue
      let w
      if (c.type === 'custom') w = Number(c.width) || 140
      else if (!c.type || c.type === 'text') {
        w = Math.min(240, Math.max(72, Number(c.width) || 0, sample.length ? fitWidth(c) : 130))
      } else if (c.type === 'badge') {
        // Pills carry a dot and padding, so a configured 90px clipped even
        // "Custom". Sized to the longest label (a configured label may be
        // longer than the stored value, hence the 112px floor).
        // Measured from the label the pill SHOWS (a configured option label,
        // e.g. ORG → "Custom"), not the stored value, so no blanket floor is
        // needed — a fixed 112px floor on every pill column pushed the table
        // past the page edge.
        const opts = config?.components?.[c.componentKey || c.key]?.options || []
        const shown = (v) => String(opts.find(o => o.value === v)?.label ?? humanise(v ?? '—'))
        const longest = sample.reduce((m, r) => Math.max(m, shown(r?.[c.key]).length), 0)
        const header  = Math.ceil(String(c.label || '').length * 7.4) + (c.sortable ? 42 : 28)
        w = Math.min(170, Math.max(Number(c.width) || 0, Math.ceil(longest * 6.8) + 50, header))
      } else {
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
    // The user's own widths win. Once any is set, the primary column — unless
    // it was itself sized — takes no width and absorbs the spare room, so the
    // widths the user dragged stay exactly as dragged instead of being
    // stretched in proportion to fill the table.
    let minTableWidth = fixedTotal + primaryMin + (custom ? 36 : 0)
    const userKeys = Object.keys(savedWidths).filter(k => displayCols.some(c => c.key === k))

    // ── Default layout fits the table's width: no sideways scroll ──────────
    // Applies until the user sizes a column themselves (then their widths
    // stand and the table may scroll). When the columns want more room than
    // there is: the title column first gives up its spare room (down to
    // 200px), then every other column shrinks in proportion toward its floor.
    // Text that no longer fits is cut with an ellipsis, full text on hover.
    if (!userKeys.length && boxW > 0) {
      const extras = (selectable ? 40 : 0) + (custom ? 36 : 0)
      // 2px slack: sub-pixel borders and rounding must not tip it into a scroll.
      const room = boxW - extras - 2
      const others = displayCols.filter(c => c.key !== primaryKey)
      const sumOf = () => others.reduce((t, c) => t + (widths[c.key] || 0), 0)
      const pFloor = primaryKey ? Math.min(primaryMin, 200) : 0
      const want = sumOf() + (primaryKey ? widths[primaryKey] : 0)
      if (want > room) {
        const floorOf = (c) => {
          const w = widths[c.key] || 0
          if (c.type === 'custom') return Math.min(w, Math.max(64, Math.round(w * 0.7)))
          if (c.type === 'badge')  return Math.min(w, 88)
          if (c.type === 'date')   return Math.min(w, 96)
          if (c.type === 'user' || c.type === 'lookup') return Math.min(w, 110)
          return Math.min(w, 80)
        }
        const S = sumOf()
        if (S + pFloor > room) {
          const mins = others.reduce((t, c) => t + floorOf(c), 0)
          const f = S > mins ? Math.max(0, Math.min(1, (room - pFloor - mins) / (S - mins))) : 0
          for (const c of others) {
            const lo = floorOf(c)
            widths[c.key] = Math.floor(lo + ((widths[c.key] || 0) - lo) * f)
          }
        }
        const S2 = sumOf()
        if (primaryKey) widths[primaryKey] = Math.max(pFloor, room - S2)
        minTableWidth = extras + S2 + (primaryKey ? widths[primaryKey] : 0)
      }
    }
    if (userKeys.length) {
      let total = (selectable ? 40 : 0) + (custom ? 36 : 0)
      for (const c of displayCols) {
        const u = Number(savedWidths[c.key])
        if (u > 0) widths[c.key] = u
        else if (c.key === primaryKey) widths[c.key] = undefined
        total += c.key === primaryKey && !(u > 0) ? primaryMin : widths[c.key]
      }
      minTableWidth = total
    }
    return { primaryKey, widths, minTableWidth }
  }, [displayCols, selectable, data, config, savedWidths, custom, boxW]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resize: drag a header's right edge; double-click it to fit ─────────────
  const startResize = (e, key) => {
    e.preventDefault(); e.stopPropagation()
    const th = e.currentTarget.parentElement
    const startX = e.clientX
    const startW = th.getBoundingClientRect().width
    let w = startW
    resizingRef.current = true
    const move = (ev) => {
      w = Math.round(Math.min(900, Math.max(60, startW + ev.clientX - startX)))
      setLiveWidth({ key, w })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      resizingRef.current = false
      // The pointerup lands on the header too; its click must not sort.
      suppressClickRef.current = true
      setTimeout(() => { suppressClickRef.current = false }, 0)
      setLiveWidth(null)
      if (Math.abs(w - startW) >= 2) updatePrefs({ widths: { ...savedWidths, [key]: w } })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const fitColumn = (key) => {
    if (!(key in savedWidths)) return
    const rest = { ...savedWidths }; delete rest[key]
    updatePrefs({ widths: rest })
  }
  const toggleColumn = (key) => {
    const h = new Set(hiddenSet)
    h.has(key) ? h.delete(key) : h.add(key)
    updatePrefs({ hidden: [...h] })
  }
  const colWidth = (key) => (liveWidth?.key === key ? liveWidth.w : layout.widths[key])

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null
    if (sortBy !== col.key) return <ChevronsUpDown size={11} className="text-text-muted" />
    return sortDir === 'asc'
      ? <ChevronUp size={11} className="text-brand-ink" />
      : <ChevronDown size={11} className="text-brand-ink" />
  }

  return (
    // kg-table-card: lets a page body that puts the table straight in (with
    // no padded wrapper of its own) give it the page's side margins — see
    // index.css.
    <div className="kg-table-card flex flex-col h-full min-h-0 rounded-card border border-border-subtle overflow-hidden glass-card">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto overscroll-contain scroll-quiet"
           style={maxHeight ? { maxHeight } : undefined}>
        {/* border-separate, not collapse: with collapse, sticky header cells
            lose their borders and rows show through the seam while scrolling. */}
        {/* data-kg-table: this table manages its own columns, so the shell's
            generic column resizer (TableResizer) leaves it alone. */}
        <table data-kg-table="" className="w-full text-[13px] border-separate border-spacing-0 table-fixed"
          style={{ minWidth: layout.minTableWidth }}>
          <colgroup>
            {selectable && <col style={{ width: 40 }} />}
            {displayCols.map(col => (
              <col key={col.key} style={{ width: colWidth(col.key) }} />
            ))}
            {custom && <col style={{ width: 36 }} />}
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              {selectable && (
                <th className="w-10 px-3 py-2 bg-surface-raised/90 backdrop-blur-md border-b border-border">
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
                  title={col.sortable ? `Sort by ${col.label}` : col.label}
                  aria-sort={col.sortable && sortBy === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  draggable={!isAction(col)}
                  onDragStart={(e) => { if (resizingRef.current) { e.preventDefault(); return } setDragColIdx(ci) }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => {
                    if (dragColIdx === null || dragColIdx === ci || isAction(col)) return
                    const next = [...displayCols]
                    const [moved] = next.splice(dragColIdx, 1)
                    next.splice(ci, 0, moved)
                    if (custom) {
                      // Saved with the hidden columns kept in place after the
                      // visible ones, so showing one again does not lose it.
                      const keys = next.filter(c => !isAction(c)).map(c => c.key)
                      updatePrefs({ order: [...keys, ...orderedCols.filter(c => !isAction(c) && !keys.includes(c.key)).map(c => c.key)] })
                    } else {
                      setLocalCols(next)
                    }
                    setDragColIdx(null)
                  }}
                  onDragEnd={() => setDragColIdx(null)}
                  className={cn(
                    'relative px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide transition-colors',
                    'bg-surface-raised/90 backdrop-blur-md border-b border-border',
                    'whitespace-nowrap select-none',
                    // Sortable headers look clickable and the sorted one is
                    // brand-coloured; the rest keep the drag cursor (columns
                    // can be reordered by dragging either way).
                    col.sortable ? 'cursor-pointer hover:text-text-primary hover:bg-surface-overlay/70' : 'cursor-grab active:cursor-grabbing',
                    col.sortable && sortBy === col.key ? 'text-brand-ink' : 'text-text-secondary',
                    dragColIdx === ci && 'opacity-40'
                  )}
                  onClick={() => { if (suppressClickRef.current) return; col.sortable && onSort?.(col.key) }}
                >
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="truncate">{col.label}</span> <SortIcon col={col} />
                  </span>
                  {/* Every column resizes — the Actions column and the last
                      data column included. */}
                  {custom && (
                    <span role="separator" aria-orientation="vertical" aria-label={`Resize ${col.label || col.key}`}
                      title="Drag to resize · double-click to fit"
                      onPointerDown={(e) => startResize(e, col.key)}
                      onDoubleClick={(e) => { e.stopPropagation(); fitColumn(col.key) }}
                      onClick={(e) => e.stopPropagation()}
                      className="group/rz absolute top-0 right-0 h-full w-2 cursor-col-resize z-10 touch-none">
                      <span className={cn('absolute right-[3px] top-1/4 h-1/2 w-px rounded-full transition-colors',
                        liveWidth?.key === col.key ? 'bg-brand-500' : 'bg-border group-hover/rz:bg-brand-500')} />
                    </span>
                  )}
                </th>
              ))}
              {custom && (
                <th className="px-1 py-1 bg-surface-raised/90 backdrop-blur-md border-b border-border text-right">
                  <button type="button" aria-label="Choose columns" title="Columns"
                    aria-haspopup="menu" aria-expanded={!!menuAnchor}
                    onClick={(e) => { const el = e.currentTarget; setMenuAnchor(a => (a ? null : el)) }}
                    className={cn('h-7 w-7 inline-flex items-center justify-center rounded-ctl transition-colors',
                      menuAnchor || customised ? 'text-brand-ink bg-brand-500/10' : 'text-text-muted hover:text-text-primary hover:bg-surface-overlay')}>
                    <Columns3 size={14} />
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, r) => (
              <tr key={r} className="[&>td]:border-b [&>td]:border-border/50">
                {selectable && (
                  <td className="pl-3 py-2.5">
                    <div className="h-4 w-4 rounded bg-surface-overlay animate-pulse" />
                  </td>
                )}
                {displayCols.map((col, c) => (
                  <td key={c} className="px-3 py-2.5">
                    {c === 1
                      ? <div className="h-3 bg-surface-overlay rounded animate-pulse" style={{ width: `${60 + (r * 13 + c * 7) % 30}%` }} />
                      : c === 2
                      ? <div className="h-5 w-16 rounded-full bg-surface-overlay animate-pulse" />
                      : <div className="h-3 bg-surface-overlay rounded animate-pulse" style={{ width: `${40 + (r * 7 + c * 11) % 25}%` }} />
                    }
                  </td>
                ))}
                {custom && <td />}
              </tr>
            ))}
            {!loading && data.length === 0 && (
              <tr><td colSpan={displayCols.length + (selectable ? 1 : 0) + (custom ? 1 : 0)} className="py-16 text-center text-text-muted text-sm">
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
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
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
                    className={cn('px-3 py-2 text-text-primary align-middle',
                      col.key === layout.primaryKey ? 'text-[13px] leading-snug' : 'text-[12.5px]',
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
                {custom && <td />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {custom && menuAnchor && (
        <ColumnsMenu anchor={menuAnchor}
          columns={orderedCols.filter(c => !isAction(c))}
          hidden={hiddenSet} customised={customised}
          onToggle={toggleColumn}
          onReset={() => { resetPrefs(); setMenuAnchor(null) }}
          onClose={() => setMenuAnchor(null)} />
      )}

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