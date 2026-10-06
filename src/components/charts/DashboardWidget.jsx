import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../config/axios.config'
import { Card, CardHeader } from '../ui/Card'
import { Skeleton } from '../ui/EmptyState'
import { cn } from '../../lib/cn'
import { useNavigate } from 'react-router-dom'
import * as Icons from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

// Categorical data-viz palette — never status colours (see DESIGN.md rule 11)
// One tooltip style, defined once. It was repeated inline at every chart, so
// changing it meant changing it four times and missing one.
const TOOLTIP = {
  cursor: { fill: 'rgb(var(--color-surface-overlay))', fillOpacity: 0.4 },
  contentStyle: {
    background: 'rgb(var(--color-surface-raised))',
    border: '1px solid rgb(var(--color-border))',
    borderRadius: '8px',
    fontSize: 12,
    boxShadow: '0 4px 16px rgb(0 0 0 / 0.08)',
  },
}

const CHART_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
  'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)',
]

function useWidgetData(widget, userSides) {
  // Check if user's sides match widget's allowedSidesJson
  const sideAllowed = !widget.allowedSidesJson ||
    (userSides || []).some(s => widget.allowedSidesJson.includes(`"${s}"`))

  // filtersJson lets two widgets share one endpoint at different scopes, e.g.
  // {"severity": "CRITICAL"} — so "critical incidents" needs no new endpoint.
  let filters = null
  try { filters = widget.filtersJson ? JSON.parse(widget.filtersJson) : null } catch {}

  return useQuery({
    // ── KEYED ON THE REQUEST, NOT THE WIDGET ────────────────────────────
    // This was ['widget-data', widget.widgetKey, filters], so six widgets
    // reading /v1/incidents/stats fired SIX identical requests — react-query
    // deduplicates by key, and every widget had a different one. The incident
    // dashboard alone was six full-table scans to render one page.
    //
    // Keyed on endpoint plus filters instead, those six become one shared
    // request. dataPath is deliberately NOT in the key: it selects a field out
    // of the response the widgets already share.
    //
    // ...so the CACHE must hold the whole response, and each widget picks its
    // field in `select` (run per widget, on the shared data). The queryFn used
    // to apply dataPath itself: whichever widget fetched first stored ITS field
    // under the shared key, and every other widget on that endpoint rendered
    // it — KPI cards showing a chart's array, charts left blank holding a
    // number — until a refetch by another widget swapped which one was right.
    queryKey: ['widget-data', widget.dataEndpoint, widget.filtersJson || ''],
    queryFn: async () => {
      if (!widget.dataEndpoint) return null
      const data = await api.get(widget.dataEndpoint, filters ? { params: filters } : undefined)
      return data ?? null
    },
    select: (data) => {
      if (data == null || !widget.dataPath) return data ?? null
      const result = widget.dataPath.split('.').reduce((obj, key) => obj?.[key], data)
      return result ?? null
    },
    refetchInterval: (widget.refreshIntervalSeconds || 300) * 1000,
    enabled: !!widget.dataEndpoint && sideAllowed,  // don't fetch if side doesn't match
  })
}

/**
 * Colour a number by its VALUE, from thresholds_json.
 *
 *   [{"gte": 1, "colorTag": "red"}, {"gte": 0, "colorTag": "green"}]
 *
 * Evaluated top down, first match wins, so order the rules worst-first.
 * Supports gte, gt, lte, lt and eq.
 *
 * This is what separates a dashboard from a table of numbers: "3 people left
 * without revocation evidence" and "0 people did" must not be the same colour,
 * and which of them is bad is a property of the metric, not of the component.
 */
function resolveThresholdColor(thresholdsJson, value) {
  if (thresholdsJson == null || value == null) return null
  let rules
  try { rules = JSON.parse(thresholdsJson) } catch { return null }
  if (!Array.isArray(rules)) return null

  const n = Number(value)
  if (!Number.isFinite(n)) return null

  for (const r of rules) {
    if (r.gte !== undefined && n >= r.gte) return r.colorTag
    if (r.gt  !== undefined && n >  r.gt)  return r.colorTag
    if (r.lte !== undefined && n <= r.lte) return r.colorTag
    if (r.lt  !== undefined && n <  r.lt)  return r.colorTag
    if (r.eq  !== undefined && n === r.eq) return r.colorTag
  }
  return null
}

/** Formatting is a property of the metric, so it comes from the row. */
function formatValue(value, valueFormat) {
  if (value == null) return '—'
  const n = Number(value)
  switch (valueFormat) {
    case 'PERCENT':
      return Number.isFinite(n) ? `${Math.round(n)}%` : String(value)
    case 'DURATION_HOURS': {
      if (!Number.isFinite(n)) return String(value)
      if (n < 1) return `${Math.round(n * 60)}m`
      if (n < 48) return `${n.toFixed(1)}h`
      return `${Math.round(n / 24)}d`
    }
    case 'CURRENCY':
      return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : String(value)
    case 'DATE': {
      const d = new Date(value)
      return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString()
    }
    default:
      return Number.isFinite(n) ? n.toLocaleString() : String(value)
  }
}

/**
 * Normalises whatever an endpoint returns into a chart-ready array.
 *
 * ── WHY THIS IS NEEDED ────────────────────────────────────────────────────
 * The /stats endpoints disagree about shape, and both shapes are reasonable:
 *   IssueService   openBySeverity  →  {"CRITICAL": 3, "HIGH": 5}
 *   RiskService    byStatus        →  [{"key": "OPEN", "value": 12}]
 * A chart fed the first crashed with "series.map is not a function",
 * taking the whole dashboard down with it.
 *
 * Rather than rewrite every endpoint to agree — which would break the older
 * widgets pointing at them — the CHART accepts either. A dashboard whose
 * widgets are configured in the database will eventually be pointed at an
 * endpoint nobody checked, and it should degrade rather than white-screen.
 *
 * Each row carries BOTH `key` and `name`, and both `value` and `count`,
 * because the seeded widgets disagree about that too: the older ones set
 * xAxis "name", the newer ones labelKey "key". Emitting both means either
 * configuration works.
 */
function toChartSeries(data) {
  if (data == null) return []
  if (Array.isArray(data)) {
    return data.map(row => {
      if (row == null || typeof row !== 'object') return { key: String(row), name: String(row), value: 0, count: 0 }
      const k = row.key ?? row.name ?? row.label ?? ''
      const v = row.value ?? row.count ?? row.total ?? 0
      return { ...row, key: k, name: k, value: v, count: v }
    })
  }
  if (typeof data === 'object') {
    // A plain map of label -> number.
    return Object.entries(data)
      .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
      .map(([k, v]) => ({ key: k, name: k, value: Number(v) || 0, count: Number(v) || 0 }))
  }
  return []
}

const THRESHOLD_TEXT = {
  red:   'text-status-fail-fg',
  amber: 'text-status-warn-fg',
  green: 'text-status-pass-fg',
  blue:  'text-brand-ink',
  gray:  'text-text-muted',
}

/**
 * Colour families for the KPI tile. Each is a background wash, a border and a
 * foreground — so the tile itself carries the signal rather than only the
 * digits, which is what makes a row of numbers scannable at a glance.
 */
const TILE = {
  red:   { wrap: 'bg-status-fail-bg/40 border-status-fail-fg/20',  fg: 'text-status-fail-fg',  icon: 'bg-status-fail-fg/15 text-status-fail-fg' },
  amber: { wrap: 'bg-status-warn-bg/40 border-status-warn-fg/20',  fg: 'text-status-warn-fg',  icon: 'bg-status-warn-fg/15 text-status-warn-fg' },
  green: { wrap: 'bg-status-pass-bg/40 border-status-pass-fg/20',  fg: 'text-status-pass-fg',  icon: 'bg-status-pass-fg/15 text-status-pass-fg' },
  blue:  { wrap: 'bg-brand-500/8 border-brand-500/20',             fg: 'text-brand-ink',       icon: 'bg-brand-500/15 text-brand-ink' },
  gray:  { wrap: 'bg-surface-raised border-border',                fg: 'text-text-primary',    icon: 'bg-surface-overlay text-text-muted' },
}

/** Sensible default glyph per metric, so a widget need not configure one. */
function pickIcon(widget, tag) {
  let cfg = {}
  try { cfg = widget.configJson ? JSON.parse(widget.configJson) : {} } catch {}
  if (cfg.icon && Icons[cfg.icon]) return Icons[cfg.icon]
  if (tag === 'red')   return Icons.AlertTriangle
  if (tag === 'amber') return Icons.Clock
  if (tag === 'green') return Icons.CheckCircle2
  return Icons.Activity
}

export function DashboardWidgetCard({ widget }) {
  const { data, isLoading } = useWidgetData(widget)
  const navigate = useNavigate()
  let config = {}
  try { config = widget.configJson ? JSON.parse(widget.configJson) : {} } catch {}

  /**
   * Click-through, optionally carrying filters.
   *
   * drillThroughJson maps query params onto the target route, and {clicked} is
   * replaced by whichever slice or bar was clicked — so clicking CRITICAL on
   * the severity donut lands on the incident list already filtered. A dashboard
   * you cannot click into is a poster.
   */
  const handleClick = (clicked) => {
    if (!widget.clickThroughRoute) return
    let params = null
    try { params = widget.drillThroughJson ? JSON.parse(widget.drillThroughJson) : null } catch {}
    if (!params) { navigate(widget.clickThroughRoute); return }

    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      const resolved = v === '{clicked}' ? clicked : v
      if (resolved != null && resolved !== '') qs.set(k, String(resolved))
    }
    const sep = widget.clickThroughRoute.includes('?') ? '&' : '?'
    navigate(qs.toString() ? `${widget.clickThroughRoute}${sep}${qs}` : widget.clickThroughRoute)
  }

  // ── KPI TILES ARE NOT CARDS WITH A HEADER ────────────────────────────────
  // A CardHeader plus a min-height body made every number a tall, mostly empty
  // box, and eight of them filled the screen before a single chart appeared.
  // A KPI is one figure and its label: icon, value, title, caption, done.
  if (widget.widgetType === 'KPI_CARD') {
    const tag = resolveThresholdColor(widget.thresholdsJson, data) || config.colorTag || 'gray'
    const t = TILE[tag] || TILE.gray
    const Icon = pickIcon(widget, tag)

    return (
      <div
        onClick={widget.clickThroughRoute ? () => handleClick(null) : undefined}
        className={cn('rounded-card border p-4 transition-colors', t.wrap,
          widget.clickThroughRoute && 'cursor-pointer hover:brightness-[0.98]')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {isLoading
              ? <div className="h-8 w-16 rounded bg-surface-overlay animate-pulse" />
              : <p className={cn('text-[28px] leading-none font-semibold tabular-nums tracking-tight', t.fg)}>
                  {config.prefix}{formatValue(data ?? 0, widget.valueFormat)}{config.suffix}
                </p>}
            <p className="text-xs font-medium text-text-primary mt-2 truncate">{widget.title}</p>
            {widget.subtitle && (
              <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{widget.subtitle}</p>
            )}
          </div>
          <span className={cn('shrink-0 w-8 h-8 rounded-ctl flex items-center justify-center', t.icon)}>
            <Icon size={15} />
          </span>
        </div>
      </div>
    )
  }

  // Everything else keeps the Card shell — charts genuinely want a title bar.
  return (
    <Card
      className={cn('flex flex-col overflow-hidden h-full',
        widget.clickThroughRoute && 'cursor-pointer hover:border-brand-500/30')}
    >
      <CardHeader title={widget.title} subtitle={widget.subtitle} />
      <div className="flex-1 p-4 pt-2 min-h-0">
        {isLoading
          ? <Skeleton className="h-full w-full min-h-[180px]" />
          : <WidgetContent widget={widget} data={data} config={config} onSliceClick={handleClick} />
        }
      </div>
    </Card>
  )
}

function WidgetContent({ widget, data, config, onSliceClick }) {
  // Computed once for every branch. Charts read `series`; KPI and progress
  // still read the raw value, which is a number rather than a collection.
  const series = toChartSeries(data)

  if (['BAR_CHART', 'LINE_CHART', 'AREA_CHART', 'PIE_CHART', 'DONUT_CHART'].includes(widget.widgetType)
      && series.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[120px]">
        <p className="text-xs text-text-muted text-center px-4">
          {widget.emptyMessage || 'Nothing to chart yet.'}
        </p>
      </div>
    )
  }

  switch (widget.widgetType) {
    case 'KPI_CARD': {
      // Threshold first, then the static colorTag, then the brand default —
      // so a widget with no thresholds looks exactly as it did before.
      const tag = resolveThresholdColor(widget.thresholdsJson, data) || config.colorTag
      const cls = THRESHOLD_TEXT[tag] || 'text-brand-ink'
      return (
        <div className="flex flex-col justify-between h-full min-h-[80px]">
          <p className={cn('text-3xl font-semibold tabular-nums tracking-tight mt-2', cls)}>
            {config.prefix}{formatValue(data ?? 0, widget.valueFormat)}{config.suffix}
          </p>
          {config.description && (
            <p className="text-xs text-text-muted mt-1">{config.description}</p>
          )}
        </div>
      )
    }

    case 'BAR_CHART':
      return (
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" vertical={false} />
            <XAxis dataKey={config.xAxis || 'name'} tick={{ fontSize: 10, fill: 'rgb(var(--color-text-muted))' }}
                   axisLine={false} tickLine={false} interval={0} angle={series.length > 5 ? -20 : 0}
                   textAnchor={series.length > 5 ? 'end' : 'middle'} height={series.length > 5 ? 48 : 24} />
            <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--color-text-muted))' }}
                   axisLine={false} tickLine={false} allowDecimals={false} width={32} />
            <Tooltip {...TOOLTIP} />
            {/* A bar chart in one colour is a shape; in the categorical palette
                it is a comparison. Same Cell treatment the pie already used. */}
            <Bar onClick={(d) => onSliceClick?.(d?.payload?.[config.labelKey || 'key'])} cursor="pointer"
                 dataKey={config.yAxis || 'value'} radius={[4, 4, 0, 0]} maxBarSize={48}>
              {series.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )

    case 'LINE_CHART': case 'AREA_CHART':
      return (
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgb(var(--color-brand-500))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="rgb(var(--color-brand-500))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border) / 0.5)" />
            <XAxis dataKey={config.xAxis || 'name'} tick={{ fontSize: 10, fill: 'rgb(var(--color-text-muted))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--color-text-muted))' }} />
            <Tooltip {...TOOLTIP} />
            <Area type="monotone" dataKey={config.yAxis || 'value'} stroke="rgb(var(--color-brand-500))" fill="url(#colorGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )

    case 'PIE_CHART': case 'DONUT_CHART': {
      const total = series.reduce((sum, r) => sum + (Number(r.value) || 0), 0)
      const isDonut = widget.widgetType === 'DONUT_CHART'
      return (
        <div className="flex items-center gap-3 h-full">
          <div className="relative flex-1 min-w-0">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie onClick={(d) => onSliceClick?.(d?.payload?.[config.labelKey || 'key'])} cursor="pointer"
                     data={series} dataKey={config.yAxis || 'value'} nameKey={config.xAxis || 'name'}
                     cx="50%" cy="50%" innerRadius={isDonut ? 58 : 0} outerRadius={88} paddingAngle={2}
                     stroke="rgb(var(--color-surface-raised))" strokeWidth={2}>
                  {series.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip {...TOOLTIP} />
              </PieChart>
            </ResponsiveContainer>
            {/* The hole in a donut is wasted unless it carries the total —
                otherwise the reader has to add the slices up themselves. */}
            {isDonut && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-semibold text-text-primary tabular-nums">{total}</span>
                <span className="text-[10px] text-text-muted">total</span>
              </div>
            )}
          </div>
          {/* A legend, because a colour with no label is decoration. Counts sit
              beside each name so the chart does not need to be hovered. */}
          <div className="flex flex-col gap-1.5 shrink-0 max-w-[45%] overflow-y-auto max-h-[210px] pr-1">
            {series.map((r, i) => (
              <button key={i} type="button"
                onClick={() => onSliceClick?.(r.key)}
                className="flex items-center gap-1.5 text-left group">
                <span className="w-2 h-2 rounded-sm shrink-0"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-[10px] text-text-secondary truncate group-hover:text-text-primary">
                  {String(r.name).replace(/_/g, ' ')}
                </span>
                <span className="text-[10px] font-mono text-text-muted ml-auto tabular-nums">{r.value}</span>
              </button>
            ))}
          </div>
        </div>
      )
    }

    case 'PROGRESS_BAR': {
      const pct = typeof data === 'number' ? data : 0
      return (
        <div className="flex flex-col justify-center gap-2 h-full">
          <div className="flex justify-between text-xs text-text-secondary">
            <span>{config.label || 'Progress'}</span>
            <span className="font-mono text-text-primary">{pct}%</span>
          </div>
          <div className="h-2 bg-surface-overlay rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    }

    case 'TABLE': {
      const rows = Array.isArray(data) ? data : []
      const cols = config.columns || []
      if (!rows.length) return (
        <p className="text-xs text-text-muted py-4 text-center">No data available</p>
      )
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {cols.map(col => (
                  <th key={col} className="text-left text-text-muted font-medium pb-2 pr-3 capitalize">
                    {col.replace(/([A-Z])/g, ' $1').trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.slice(0, 5).map((row, i) => (
                <tr key={i} className="hover:bg-surface-overlay/50 transition-colors">
                  {cols.map(col => (
                    <td key={col} className="py-2 pr-3 text-text-secondary truncate max-w-[120px]">
                      {row[col] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    default:
      return <p className="text-xs text-text-muted py-4 text-center">Widget type: {widget.widgetType}</p>
  }
}

// Safe col-span map — dynamic `col-span-${n}` not generated by Tailwind at build time
const COL_SPAN = {
  3: 'col-span-3', 4: 'col-span-4',  6: 'col-span-6',
  8: 'col-span-8', 9: 'col-span-9', 12: 'col-span-12',
}

export function DashboardGrid({
  widgets = [], userSides = [],
  // Edit mode. All optional — a read-only dashboard passes none of these and
  // behaves exactly as before.
  editing = false, onRemove, onResize, onReorder,
}) {
  /**
   * KPI tiles and charts are laid out SEPARATELY.
   *
   * In one grid they interleave: a chart is roughly three times the height of a
   * tile, so a row containing both leaves a tall column of dead space beside
   * the tile. Splitting them gives the shape every dashboard worth reading has
   * — a band of numbers across the top, the analysis beneath — without relying
   * on whoever seeded the rows getting sort_order exactly right.
   */
  // Deduplicate by key before anything else.
  //
  // widgetKey is the React key, so a duplicate is not cosmetic: React warns,
  // then reuses or drops children unpredictably. The server should never send
  // one — and a bug in the customise copy did — but a render path should not
  // depend on that. First occurrence wins, so order is preserved.
  const seen = new Set()
  const unique = widgets.filter(w => !seen.has(w.widgetKey) && seen.add(w.widgetKey))

  const tiles  = unique.filter(w => w.widgetType === 'KPI_CARD')
  const panels = unique.filter(w => w.widgetType !== 'KPI_CARD')

  const [dragFrom, setDragFrom] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const band = (list, defaultSpan, bandId) => (
    <div className="grid grid-cols-12 gap-3 items-stretch">
      {list.map((widget, idx) => {
        const key = `${bandId}:${idx}`
        return (
          <div
            key={widget.widgetKey}
            className={cn(COL_SPAN[widget.gridCols] || defaultSpan, 'relative group/w transition-all',
              dragOver === key && 'ring-2 ring-brand-500 rounded-card scale-[0.99]',
              dragFrom === key && 'opacity-40')}
            onDragOver={e => { if (editing) { e.preventDefault(); setDragOver(key) } }}
            onDragLeave={() => { if (dragOver === key) setDragOver(null) }}
            onDrop={e => {
              if (!editing) return
              e.preventDefault()
              setDragOver(null); setDragFrom(null)
              const payload = e.dataTransfer.getData('text/plain')
              const [fromBand, fromIdx] = payload.split(':')
              // Only within the same band. Dragging a chart up among the KPI
              // tiles would need it to become a tile, which it cannot.
              if (fromBand !== bandId) return
              const from = parseInt(fromIdx, 10)
              if (Number.isInteger(from) && from !== idx) onReorder?.(list, from, idx)
            }}
          >
            {editing && (
              <div className="absolute -top-2 -right-2 z-20 flex items-center gap-1
                              opacity-0 group-hover/w:opacity-100 transition-opacity">
                {/* A dedicated grab handle, not the whole card.
                    
                    Dragging the card itself competes with everything inside it:
                    a KPI tile navigates on click, a chart's ResponsiveContainer
                    captures pointer events for tooltips, and a legend row is a
                    button. A handle has none of those problems and also tells
                    the user where to grab, which a draggable card never does. */}
                <span
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', key)
                    setDragFrom(key)
                  }}
                  onDragEnd={() => { setDragFrom(null); setDragOver(null) }}
                  title="Drag to reorder"
                  className="w-5 h-5 rounded-ctl bg-surface-raised border border-border
                             flex items-center justify-center shadow-sm cursor-grab
                             active:cursor-grabbing text-text-muted hover:text-text-primary"
                >
                  <Icons.GripVertical size={11} />
                </span>

                {/* Width in twelfths, as plain fractions — "8" means nothing
                    without knowing the grid is twelve wide. */}
                <select
                  value={widget.gridCols || 6}
                  onChange={e => onResize?.(widget, Number(e.target.value))}
                  onClick={e => e.stopPropagation()}
                  className="text-[10px] rounded-ctl border border-border bg-surface-raised
                             text-text-muted px-1 py-0.5 shadow-sm"
                >
                  <option value={3}>¼</option>
                  <option value={4}>⅓</option>
                  <option value={6}>½</option>
                  <option value={12}>Full</option>
                </select>

                <button
                  title="Remove from this dashboard"
                  onClick={e => { e.stopPropagation(); onRemove?.(widget) }}
                  className="w-5 h-5 rounded-full bg-status-fail-fg text-white flex items-center
                             justify-center shadow-sm hover:brightness-110"
                >
                  <Icons.X size={11} />
                </button>
              </div>
            )}

            {/* Click-through is suppressed while arranging. Otherwise every
                attempt to grab a card navigates away from the page you are
                editing, losing the unsaved arrangement with it. */}
            <div className={cn(editing && 'ring-1 ring-dashed ring-border rounded-card pointer-events-none')}>
              <DashboardWidgetCard widget={widget} userSides={userSides} />
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4">
      {tiles.length  > 0 && band(tiles,  'col-span-3', 'tiles')}
      {panels.length > 0 && band(panels, 'col-span-6', 'panels')}
    </div>
  )
}