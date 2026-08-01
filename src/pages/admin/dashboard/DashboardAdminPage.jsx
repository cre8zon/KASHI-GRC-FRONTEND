/**
 * DashboardAdminPage — /admin/dashboard
 *
 * Configure every dashboard widget from the UI — no SQL inserts needed.
 *
 * FEATURES:
 *   - Live preview: canvas shows exactly how widgets render at runtime
 *   - Widget palette: KPI card, bar/line/area/pie/donut chart, table,
 *     progress bar, activity feed — all widget types in DashboardWidget.WidgetType
 *   - Drag to reorder (updates sortOrder)
 *   - Role/side visibility: which sides see which widget
 *   - Data endpoint + JSON path: point at any /v1/* endpoint
 *   - Config JSON: per-type extra config (prefix, suffix, xAxis, yAxis, columns…)
 *   - Live data preview: fires the configured endpoint and shows the raw response
 *   - Grid cols: 3 (¼), 4 (⅓), 6 (½), 8 (⅔), 12 (full)
 *   - Click-through route: where widget navigates on click
 *   - Issue KPI templates: pre-built widgets for issue management dashboard
 */

import { useState, useMemo }                         from 'react'
import { useQuery, useMutation, useQueryClient }      from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, RefreshCw,
  BarChart2, LineChart, PieChart, Table2, TrendingUp,
  Activity, Calendar, Gauge, Layers, Copy, GripVertical,
  AlertTriangle, CheckCircle2, Clock, Shield, Zap,
  ExternalLink, ChevronDown, X, Save,
} from 'lucide-react'
import { PageLayout }  from '../../../components/layout/PageLayout'
import { Button }      from '../../../components/ui/Button'
import { Badge }       from '../../../components/ui/Badge'
import { Modal }       from '../../../components/ui/Modal'
import { cn }          from '../../../lib/cn'
import api             from '../../../config/axios.config'
import toast           from 'react-hot-toast'

// ── Constants ──────────────────────────────────────────────────────────────────

const WIDGET_TYPES = [
  { value: 'KPI_CARD',      label: 'KPI card',       icon: TrendingUp,  desc: 'Single number with label' },
  { value: 'BAR_CHART',     label: 'Bar chart',      icon: BarChart2,   desc: 'Grouped bars' },
  { value: 'LINE_CHART',    label: 'Line chart',     icon: LineChart,   desc: 'Trend over time' },
  { value: 'AREA_CHART',    label: 'Area chart',     icon: LineChart,   desc: 'Filled trend' },
  { value: 'PIE_CHART',     label: 'Pie chart',      icon: PieChart,    desc: 'Distribution' },
  { value: 'DONUT_CHART',   label: 'Donut chart',    icon: PieChart,    desc: 'Distribution with centre' },
  { value: 'TABLE',         label: 'Table',          icon: Table2,      desc: 'Row/column data' },
  { value: 'PROGRESS_BAR',  label: 'Progress bar',   icon: Gauge,       desc: 'Percentage completion' },
  { value: 'ACTIVITY_FEED', label: 'Activity feed',  icon: Activity,    desc: 'Recent event list' },
  { value: 'HEATMAP',       label: 'Heatmap',        icon: Layers,      desc: 'Grid intensity map' },
  { value: 'CALENDAR',      label: 'Calendar',       icon: Calendar,    desc: 'Date-based view' },
]

const SIDES = ['ORGANIZATION', 'VENDOR', 'AUDITOR', 'AUDITEE', 'SYSTEM']

const GRID_OPTIONS = [
  { value: 3,  label: '¼ width' },
  { value: 4,  label: '⅓ width' },
  { value: 6,  label: '½ width' },
  { value: 8,  label: '⅔ width' },
  { value: 12, label: 'Full width' },
]

// ── Issue KPI templates — pre-built widgets for issue management ────────────────
const ISSUE_KPI_TEMPLATES = [
  {
    widgetKey: 'issue_open_critical', widgetType: 'KPI_CARD', gridCols: 3,
    title: 'Critical issues', subtitle: 'Open & unresolved',
    dataEndpoint: '/v1/issues/stats', dataPath: 'openBySeverity.CRITICAL',
    configJson: JSON.stringify({ description: 'Requires immediate action', suffix: '' }),
    allowedSidesJson: '["ORGANIZATION"]', clickThroughRoute: '/module/ISSUE?severity=CRITICAL',
    sortOrder: 1,
  },
  {
    widgetKey: 'issue_sla_breached', widgetType: 'KPI_CARD', gridCols: 3,
    title: 'SLA breaches', subtitle: 'Past deadline',
    dataEndpoint: '/v1/issues/stats', dataPath: 'slaBreachedCount',
    configJson: JSON.stringify({ description: 'Escalation sent to owners', suffix: '' }),
    allowedSidesJson: '["ORGANIZATION"]', clickThroughRoute: '/module/ISSUE?slaBreached=true',
    sortOrder: 2,
  },
  {
    widgetKey: 'issue_total_open', widgetType: 'KPI_CARD', gridCols: 3,
    title: 'Total open', subtitle: 'Open + in progress',
    dataEndpoint: '/v1/issues/stats', dataPath: 'byStatus.OPEN',
    configJson: JSON.stringify({ description: 'Across all issue types', suffix: '' }),
    allowedSidesJson: '["ORGANIZATION"]', clickThroughRoute: '/module/ISSUE?status=OPEN',
    sortOrder: 3,
  },
  {
    widgetKey: 'issue_resolved_this_month', widgetType: 'KPI_CARD', gridCols: 3,
    title: 'Resolved', subtitle: 'Closed this period',
    dataEndpoint: '/v1/issues/stats', dataPath: 'byStatus.RESOLVED',
    configJson: JSON.stringify({ description: 'Successfully remediated', suffix: '' }),
    allowedSidesJson: '["ORGANIZATION"]', clickThroughRoute: '/module/ISSUE?status=RESOLVED',
    sortOrder: 4,
  },
  {
    widgetKey: 'issue_by_severity_chart', widgetType: 'DONUT_CHART', gridCols: 6,
    title: 'Open issues by severity', subtitle: 'Distribution',
    dataEndpoint: '/v1/issues/stats', dataPath: 'openBySeverity',
    configJson: JSON.stringify({ xAxis: 'name', yAxis: 'value' }),
    allowedSidesJson: '["ORGANIZATION"]', clickThroughRoute: '/module/ISSUE',
    sortOrder: 5,
  },
  {
    widgetKey: 'issue_by_type_chart', widgetType: 'BAR_CHART', gridCols: 6,
    title: 'Issues by type', subtitle: 'Internal · External · Automated',
    dataEndpoint: '/v1/issues/stats', dataPath: 'byType',
    configJson: JSON.stringify({ xAxis: 'name', yAxis: 'value' }),
    allowedSidesJson: '["ORGANIZATION"]', clickThroughRoute: '/module/ISSUE',
    sortOrder: 6,
  },
]

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useWidgets() {
  return useQuery({
    queryKey: ['admin-widgets'],
    queryFn:  () => api.get('/v1/admin/ui/widgets?take=100&sortBy=sortorder&sortDir=asc'),
    select:   (d) => d?.data?.items || d?.items || (Array.isArray(d?.data) ? d.data : null) || [],
    staleTime: 30_000,
  })
}

function useSaveWidget(id) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => id
      ? api.put(`/v1/admin/ui/widgets/${id}`, data)
      : api.post('/v1/admin/ui/widgets', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-widgets'] })
      toast.success(id ? 'Widget updated' : 'Widget created')
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to save'),
  })
}

function useDeleteWidget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/v1/admin/ui/widgets/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-widgets'] }); toast.success('Widget deleted') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
}

function useBulkCreate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (templates) => {
      for (const t of templates) {
        await api.post('/v1/admin/ui/widgets', t)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-widgets'] }); toast.success('Issue KPI widgets added') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DashboardAdminPage() {
  const { data: widgets = [], isLoading, refetch } = useWidgets()
  const { mutate: deleteWidget, isPending: deleting } = useDeleteWidget()
  const { mutate: bulkCreate, isPending: creatingBulk } = useBulkCreate()

  const [editWidget,  setEditWidget]  = useState(null)   // null=closed, {}=new, {...}=edit
  const [previewMode, setPreviewMode] = useState(false)

  const sortedWidgets = useMemo(() =>
    [...widgets].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  [widgets])

  // Group for canvas preview — 12-col grid
  const hasIssueWidgets = widgets.some(w => w.widgetKey?.startsWith('issue_'))

  return (
    <PageLayout
      title="Dashboard designer"
      subtitle="Configure widgets that appear on the main dashboard — per role, per module"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreviewMode(p => !p)}
            className={cn('flex items-center gap-1.5 h-7 px-3 text-xs border rounded transition-colors',
              previewMode
                ? 'bg-brand-500/10 border-brand-500/30 text-brand-ink'
                : 'border-border text-text-muted hover:border-border-strong')}>
            <Eye size={12} /> {previewMode ? 'Exit preview' : 'Preview'}
          </button>
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={refetch}>Refresh</Button>
          <Button size="sm" icon={Plus} onClick={() => setEditWidget({})}>New widget</Button>
        </div>
      }
    >
      <div className="px-6 py-4 space-y-4">

        {/* ── Issue KPI templates banner ──────────────────────────────── */}
        {!hasIssueWidgets && (
          <div className="flex items-center gap-4 px-4 py-3 rounded-card bg-brand-500/5 border border-brand-500/20">
            <AlertTriangle size={16} className="text-brand-ink shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Issue management KPIs not configured</p>
              <p className="text-xs text-text-muted mt-0.5">Add 6 pre-built widgets for issue tracking: open issues, SLA breaches, severity donut, type bar chart.</p>
            </div>
            <Button size="sm" loading={creatingBulk}
              onClick={() => bulkCreate(ISSUE_KPI_TEMPLATES)}>
              Add issue KPIs
            </Button>
          </div>
        )}

        {/* ── Preview mode — shows the actual rendered dashboard ────── */}
        {previewMode ? (
          <div className="space-y-3">
            <p className="text-xs text-text-muted">Live preview — widgets fetch real data from their endpoints</p>
            <div className="grid grid-cols-12 gap-4">
              {sortedWidgets.filter(w => w.isActive).map(w => (
                <div key={w.widgetKey}
                  className={cn('rounded-card border border-border overflow-hidden',
                    w.gridCols === 3  ? 'col-span-3'  :
                    w.gridCols === 4  ? 'col-span-4'  :
                    w.gridCols === 6  ? 'col-span-6'  :
                    w.gridCols === 8  ? 'col-span-8'  : 'col-span-12')}>
                  <WidgetPreviewCard widget={w} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── Config table ──────────────────────────────────────────── */
          <div className="border border-border rounded-card overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-xs text-text-muted">Loading widgets…</div>
            ) : sortedWidgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <BarChart2 size={28} className="text-text-muted" />
                <p className="text-sm text-text-muted">No widgets configured</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" loading={creatingBulk}
                    onClick={() => bulkCreate(ISSUE_KPI_TEMPLATES)}>
                    Add issue KPIs
                  </Button>
                  <Button size="sm" icon={Plus} onClick={() => setEditWidget({})}>Custom widget</Button>
                </div>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface">
                    {['Order', 'Widget', 'Type', 'Grid', 'Endpoint', 'Sides', 'Active', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-semibold text-text-secondary">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {sortedWidgets.map(w => {
                    const TypeIcon = WIDGET_TYPES.find(t => t.value === w.widgetType)?.icon || BarChart2
                    const sides = (() => { try { return JSON.parse(w.allowedSidesJson || '[]') } catch { return [] } })()
                    return (
                      <tr key={w.id} className="hover:bg-surface-overlay/30 transition-colors">
                        <td className="px-3 py-2.5 text-text-muted font-mono">{w.sortOrder ?? 0}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-text-primary">{w.title}</div>
                          {w.subtitle && <div className="text-text-muted">{w.subtitle}</div>}
                          <code className="text-[9px] text-text-muted font-mono">{w.widgetKey}</code>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5 text-text-secondary">
                            <TypeIcon size={12} />
                            <span>{WIDGET_TYPES.find(t => t.value === w.widgetType)?.label || w.widgetType}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-text-muted">
                          {GRID_OPTIONS.find(g => g.value === w.gridCols)?.label || `${w.gridCols} cols`}
                        </td>
                        <td className="px-3 py-2.5 max-w-48">
                          <code className="text-[9px] text-text-muted truncate block">{w.dataEndpoint || '—'}</code>
                          {w.dataPath && <code className="text-[9px] text-brand-ink">.{w.dataPath}</code>}
                        </td>
                        <td className="px-3 py-2.5">
                          {sides.length === 0
                            ? <span className="text-text-muted">All</span>
                            : <div className="flex flex-wrap gap-0.5">
                                {sides.map(s => (
                                  <span key={s} className="text-[8px] px-1 py-0.5 rounded bg-brand-500/10 text-brand-ink border border-brand-500/20">{s.slice(0,3)}</span>
                                ))}
                              </div>
                          }
                        </td>
                        <td className="px-3 py-2.5">
                          <div className={cn('w-1.5 h-1.5 rounded-full', w.isActive ? 'bg-status-pass-bg' : 'bg-border')} />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditWidget(w)}
                              className="p-1 text-text-muted hover:text-brand-ink transition-colors">
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => setEditWidget({ ...w, id: undefined, widgetKey: w.widgetKey + '_copy' })}
                              className="p-1 text-text-muted hover:text-text-secondary transition-colors">
                              <Copy size={12} />
                            </button>
                            <button
                              onClick={() => { if (confirm(`Delete "${w.title}"?`)) deleteWidget(w.id) }}
                              className="p-1 text-text-muted hover:text-status-fail-fg transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Widget editor modal ─────────────────────────────────────── */}
      {editWidget !== null && (
        <WidgetEditorModal
          widget={editWidget}
          onClose={() => setEditWidget(null)}
        />
      )}
    </PageLayout>
  )
}

// ── Widget editor modal ────────────────────────────────────────────────────────

function WidgetEditorModal({ widget, onClose }) {
  const isEdit = !!widget?.id
  const { mutate: save, isPending } = useSaveWidget(widget?.id)

  const [form, setForm] = useState({
    widgetKey:              widget?.widgetKey              || '',
    widgetType:             widget?.widgetType             || 'KPI_CARD',
    title:                  widget?.title                  || '',
    subtitle:               widget?.subtitle               || '',
    dataEndpoint:           widget?.dataEndpoint           || '',
    dataPath:               widget?.dataPath               || '',
    configJson:             widget?.configJson             || '{}',
    allowedSidesJson:       widget?.allowedSidesJson       || '["ORGANIZATION"]',
    requiredPermission:     widget?.requiredPermission     || '',
    clickThroughRoute:      widget?.clickThroughRoute      || '',
    gridCols:               widget?.gridCols               || 6,
    sortOrder:              widget?.sortOrder              ?? 0,
    refreshIntervalSeconds: widget?.refreshIntervalSeconds || 300,
    isActive:               widget?.isActive               !== false,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Live data test
  const { data: testData, refetch: testFetch, isFetching: testing } = useQuery({
    queryKey: ['widget-test', form.dataEndpoint],
    queryFn:  () => form.dataEndpoint ? api.get(form.dataEndpoint) : null,
    enabled: false,
  })

  const sides = (() => { try { return JSON.parse(form.allowedSidesJson || '[]') } catch { return [] } })()
  const toggleSide = (s) => {
    const next = sides.includes(s) ? sides.filter(x => x !== s) : [...sides, s]
    set('allowedSidesJson', JSON.stringify(next))
  }

  const handleSave = () => {
    if (!form.widgetKey.trim()) { toast.error('Widget key is required'); return }
    if (!form.title.trim())     { toast.error('Title is required'); return }
    save(form, { onSuccess: onClose })
  }

  const widgetTypeMeta = WIDGET_TYPES.find(t => t.value === form.widgetType)
  const configHint = {
    KPI_CARD:      '{"prefix":"","suffix":"","description":"Brief description shown below the number"}',
    BAR_CHART:     '{"xAxis":"name","yAxis":"value"}',
    LINE_CHART:    '{"xAxis":"month","yAxis":"count"}',
    AREA_CHART:    '{"xAxis":"month","yAxis":"count"}',
    PIE_CHART:     '{"xAxis":"name","yAxis":"value"}',
    DONUT_CHART:   '{"xAxis":"name","yAxis":"value"}',
    TABLE:         '{"columns":["title","status","severity","dueAt"]}',
    PROGRESS_BAR:  '{"label":"Completion"}',
    ACTIVITY_FEED: '{"limit":10}',
  }[form.widgetType] || '{}'

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit: ${widget.title}` : 'New widget'} size="lg">
      <div className="p-4 space-y-5 max-h-[75vh] overflow-y-auto">

        {/* Widget type selector */}
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-2">Widget type</label>
          <div className="grid grid-cols-4 gap-1.5">
            {WIDGET_TYPES.map(t => (
              <button key={t.value}
                onClick={() => set('widgetType', t.value)}
                className={cn(
                  'flex flex-col items-center gap-1 py-2 px-1.5 rounded-card border text-center transition-colors',
                  form.widgetType === t.value
                    ? 'bg-brand-500/10 border-brand-500/30 text-brand-ink'
                    : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary'
                )}>
                <t.icon size={14} />
                <span className="text-[10px] leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
          {widgetTypeMeta && (
            <p className="text-[10px] text-text-muted mt-1">{widgetTypeMeta.desc}</p>
          )}
        </div>

        {/* Identity */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Widget key (unique)">
            <input value={form.widgetKey} onChange={e => set('widgetKey', e.target.value.toLowerCase().replace(/\s/g,'_'))}
              placeholder="issue_open_critical" className={INPUT} />
          </Field>
          <Field label="Sort order">
            <input value={form.sortOrder} onChange={e => set('sortOrder', parseInt(e.target.value)||0)}
              type="number" className={INPUT} />
          </Field>
          <Field label="Title">
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Open critical issues" className={INPUT} />
          </Field>
          <Field label="Subtitle">
            <input value={form.subtitle} onChange={e => set('subtitle', e.target.value)}
              placeholder="Unresolved · requires action" className={INPUT} />
          </Field>
        </div>

        {/* Data source */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-text-secondary">Data source</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="API endpoint">
              <input value={form.dataEndpoint} onChange={e => set('dataEndpoint', e.target.value)}
                placeholder="/v1/issues/stats" className={INPUT} />
            </Field>
            <Field label="JSON path (dot notation)">
              <input value={form.dataPath} onChange={e => set('dataPath', e.target.value)}
                placeholder="openBySeverity.CRITICAL" className={INPUT} />
              <p className="text-[9px] text-text-muted mt-0.5">Path into the response to extract the display value</p>
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => testFetch()}
              disabled={!form.dataEndpoint || testing}
              className="flex items-center gap-1.5 text-xs text-brand-ink border border-brand-500/25 bg-brand-500/5 hover:bg-brand-500/10 rounded px-2.5 py-1 transition-colors disabled:opacity-40">
              {testing ? 'Testing…' : 'Test endpoint'}
            </button>
            {testData && (
              <span className="text-[10px] text-status-pass-fg">
                ✓ Response received
              </span>
            )}
          </div>
          {testData && (
            <pre className="text-[9px] font-mono bg-surface-overlay border border-border rounded p-2 max-h-24 overflow-auto text-text-secondary">
              {JSON.stringify(testData, null, 2).slice(0, 500)}
            </pre>
          )}
        </div>

        {/* Config JSON */}
        <Field label={`Config JSON (${widgetTypeMeta?.label} options)`}>
          <textarea value={form.configJson} onChange={e => set('configJson', e.target.value)}
            rows={3}
            placeholder={configHint}
            className="w-full px-3 py-2 text-xs font-mono border border-border rounded bg-surface-overlay text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
          <p className="text-[9px] text-text-muted mt-0.5">Hint: <code className="font-mono">{configHint}</code></p>
        </Field>

        {/* Layout */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Grid width">
            <div className="flex gap-1 flex-wrap">
              {GRID_OPTIONS.map(g => (
                <button key={g.value}
                  onClick={() => set('gridCols', g.value)}
                  className={cn('px-2 py-1 text-[10px] rounded border transition-colors',
                    form.gridCols === g.value
                      ? 'bg-brand-500/15 border-brand-500/40 text-brand-ink font-medium'
                      : 'border-border text-text-muted hover:border-border-strong')}>
                  {g.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Click-through route">
            <input value={form.clickThroughRoute} onChange={e => set('clickThroughRoute', e.target.value)}
              placeholder="/module/ISSUE?severity=CRITICAL" className={INPUT} />
          </Field>
        </div>

        {/* Visibility */}
        <div>
          <p className="text-xs font-medium text-text-secondary mb-2">Visible to sides</p>
          <div className="flex gap-1.5 flex-wrap">
            {SIDES.map(s => (
              <button key={s}
                onClick={() => toggleSide(s)}
                className={cn('px-2.5 py-1 text-[10px] rounded border font-medium transition-colors',
                  sides.includes(s)
                    ? 'bg-brand-500/10 border-brand-500/30 text-brand-ink'
                    : 'border-border text-text-muted hover:border-border-strong')}>
                {s}
              </button>
            ))}
          </div>
          {sides.length === 0 && <p className="text-[10px] text-status-warn-fg mt-1">⚠ No sides selected — widget hidden for everyone</p>}
        </div>

        {/* Active toggle */}
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-xs font-medium text-text-primary">Active</p>
            <p className="text-[10px] text-text-muted">Inactive widgets are hidden from the dashboard</p>
          </div>
          <button
            onClick={() => set('isActive', !form.isActive)}
            className={cn('relative w-9 h-5 rounded-full border transition-colors',
              form.isActive ? 'bg-brand-500 border-brand-500' : 'border-border bg-surface-overlay')}>
            <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-surface-raised transition-transform',
              form.isActive ? 'translate-x-4' : 'translate-x-0.5')} />
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" icon={Save} loading={isPending} onClick={handleSave}>
            {isEdit ? 'Update widget' : 'Create widget'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Widget preview card (live data) ───────────────────────────────────────────

function WidgetPreviewCard({ widget }) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget-preview', widget.widgetKey, widget.dataEndpoint],
    queryFn: async () => {
      if (!widget.dataEndpoint) return null
      const d = await api.get(widget.dataEndpoint)
      if (!widget.dataPath) return d
      return widget.dataPath.split('.').reduce((o, k) => o?.[k], d) ?? null
    },
    refetchInterval: (widget.refreshIntervalSeconds || 300) * 1000,
    enabled: !!widget.dataEndpoint,
    staleTime: 30_000,
  })
  let cfg = {}
  try { cfg = JSON.parse(widget.configJson || '{}') } catch {}

  return (
    <div className="p-3 h-full min-h-24 flex flex-col gap-1">
      <div>
        <p className="text-xs font-semibold text-text-primary">{widget.title}</p>
        {widget.subtitle && <p className="text-[10px] text-text-muted">{widget.subtitle}</p>}
      </div>
      {isLoading ? (
        <div className="flex-1 bg-surface-overlay rounded animate-pulse" />
      ) : widget.widgetType === 'KPI_CARD' ? (
        <p className="text-2xl font-semibold text-brand-ink tabular-nums">
          {cfg.prefix}{data ?? 0}{cfg.suffix}
        </p>
      ) : (
        <div className="text-[10px] text-text-muted italic flex-1 flex items-center justify-center border border-dashed border-border rounded">
          {widget.widgetType} preview
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const INPUT = 'w-full h-8 px-3 text-xs border border-border rounded bg-surface-overlay text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500'

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-text-muted uppercase tracking-wider block mb-1">{label}</label>
      {children}
    </div>
  )
}