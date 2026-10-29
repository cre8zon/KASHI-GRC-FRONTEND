/**
 * ListBands — what sits above a module's list table.
 *
 *   WorkflowBand  the workflows this module runs, prominently: steps by side,
 *                 in use or available, a demo marker, and the way into the
 *                 catalogue ("Explore workflows") and to "Request a custom one".
 *   KpiBand       KPI_CARD widgets of the dashboard keyed
 *                 {entity_type lower}_list_kpis, drawn compact. Clicking a tile
 *                 filters the list: drill_through_json keys starting "f." become
 *                 list filters (f.status=OPEN → ?status=OPEN on the list call).
 *   FilterChips   the filters in force, each removable.
 *
 * All three render nothing when there is nothing to show, so a module without
 * workflows or a KPI dashboard looks exactly as before.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { GitBranch, Play, X, BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../config/axios.config'
import { useWidgetData, resolveThresholdColor, formatValue } from '../charts/DashboardWidget'
import { TILE_TONE, SEMANTIC_COLORS } from '../detail/DetailChrome'

/** Colour per workflow side — the same four everywhere a step is drawn. */
export const SIDE_COLOR = {
  ORGANIZATION: '#7c5cd6',
  VENDOR:       '#2f6fd6',
  AUDITOR:      '#d9822b',
  AUDITEE:      '#3f9a8a',
  SYSTEM:       '#9aa1ad',
}
export const SIDE_LABEL = {
  ORGANIZATION: 'Organisation', VENDOR: 'Vendor', AUDITOR: 'Auditor', AUDITEE: 'Auditee', SYSTEM: 'System',
}

export const useWorkflowCatalogue = (entityType) => useQuery({
  queryKey: ['workflow-catalogue', entityType],
  queryFn: () => api.get('/v1/workflow-catalogue', { params: { entityType } }),
  enabled: !!entityType,
  staleTime: 5 * 60_000,
  retry: false,
  select: (d) => (Array.isArray(d) ? d : (d?.data || [])),
})

export function catalogueRoute(entityType, extra = '') {
  return `/workflow-catalogue/${String(entityType || '').toLowerCase()}${extra}`
}

/** The module guide page — how the module works, then its workflows. */
export function guideRoute(entityType) {
  return `/guide/${String(entityType || '').toLowerCase()}`
}

/** "How this module works": lifecycle, actions and roles, guide text, video. */
export const useModuleGuide = (entityType) => useQuery({
  queryKey: ['module-guide', entityType],
  queryFn: () => api.get(`/v1/module-guide/${entityType}`),
  enabled: !!entityType,
  staleTime: 5 * 60_000,
  retry: false,
  select: (d) => d?.data || d,
})

// ─── Guide band shell ────────────────────────────────────────────────────────

/**
 * The dark band both list guides use — workflow modules and modules without a
 * workflow look the same. Colours come from the tenant's theme (.guide-band in
 * index.css: brand-900 → brand-800 with brand-200 text), so a tenant's brand
 * and dark mode carry through while the band stays the darkest, most visible
 * thing above the table. Collapsible; remembered per module in this browser.
 */
function useBandCollapse(storeKey) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(storeKey) === 'collapsed' } catch { return false }
  })
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(storeKey, next ? 'collapsed' : 'open') } catch { /* no storage — session only */ }
  }
  return [collapsed, toggle]
}

const BandCta = ({ to, children }) => (
  <Link to={to} className="guide-band-cta text-xs font-bold px-2.5 h-7 inline-flex items-center gap-1.5 rounded-ctl whitespace-nowrap">{children}</Link>
)
const BandGhost = ({ to, children }) => (
  <Link to={to} className="guide-band-ghost text-xs font-semibold px-2.5 h-7 inline-flex items-center rounded-ctl border whitespace-nowrap">{children}</Link>
)
const BandLink = ({ to, children }) => (
  <Link to={to} className="guide-band-muted text-xs font-semibold hover:underline underline-offset-2 whitespace-nowrap">{children}</Link>
)

function GuideBandShell({ icon: Icon, title, subtitle, links, strip, collapsed, onToggle, cards, cardCount }) {
  const collapseBtn = (
    <button type="button" onClick={onToggle} aria-expanded={!collapsed}
      aria-label={collapsed ? 'Expand' : 'Collapse'}
      className="guide-band-muted w-7 h-7 rounded-ctl flex items-center justify-center hover:bg-white/10 shrink-0">
      {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
    </button>
  )
  const badge = (
    <span className="guide-band-cta w-6 h-6 rounded-ctl flex items-center justify-center shrink-0">
      <Icon size={13} strokeWidth={2.4} />
    </span>
  )
  if (collapsed) {
    return (
      <section className="guide-band rounded-card px-2.5 py-1.5 flex items-center gap-2.5 flex-wrap">
        {badge}
        <strong className="text-[13px] whitespace-nowrap">{title}</strong>
        <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden" aria-hidden="true">{strip}</div>
        <div className="flex items-center gap-2 flex-wrap">{links}</div>
        {collapseBtn}
      </section>
    )
  }
  return (
    <section className="guide-band rounded-card p-2 flex flex-wrap gap-2 items-stretch">
      <div className="flex flex-col justify-center gap-1.5 px-1.5 flex-[1_1_260px] min-w-0">
        <div className="flex items-center gap-2">
          {badge}
          <strong className="text-[13px] flex-1 min-w-0 truncate">{title}</strong>
          {collapseBtn}
        </div>
        <p className="guide-band-muted text-[11.5px] leading-snug line-clamp-2">{subtitle}</p>
        <div className="flex gap-1.5 flex-wrap items-center">{links}</div>
      </div>
      <div className="grid gap-1.5 flex-[3_1_620px] min-w-0"
        style={{ gridTemplateColumns: `repeat(${cardCount}, minmax(0, 1fr))` }}>
        {cards}
      </div>
    </section>
  )
}

const bandCard = 'flex flex-col justify-center gap-1.5 px-2.5 py-1.5 rounded-ctl bg-surface-raised text-text-primary hover:brightness-[0.98] min-w-0'

// ─── Workflow band ───────────────────────────────────────────────────────────

export function WorkflowBand({ entityType, moduleLabel }) {
  const { data: workflows = [], isLoading } = useWorkflowCatalogue(entityType)
  // Collapsed to one line once someone has closed it. Opens expanded the first time.
  const [collapsed, toggle] = useBandCollapse(`kashi:wf-band:${entityType}`)
  // A workflow-capable module with no workflow yet still gets its guide.
  if (!workflows.length) return isLoading ? null : <ModuleGuideBand entityType={entityType} moduleLabel={moduleLabel} />
  const shown = workflows.slice(0, 4)
  const noun = (moduleLabel || 'records').toLowerCase()
  const title = `${moduleLabel || 'This module'} run${moduleLabel ? '' : 's'} on ${workflows.length} workflow${workflows.length === 1 ? '' : 's'}`
  return (
    <GuideBandShell
      icon={GitBranch} title={title} collapsed={collapsed} onToggle={toggle}
      subtitle={`See every step and the roles it needs before you start new ${noun}.`}
      links={<>
        <BandCta to={catalogueRoute(entityType)}>Explore workflows →</BandCta>
        <BandGhost to={catalogueRoute(entityType, '?request=1')}>Request a custom one</BandGhost>
        <BandLink to={guideRoute(entityType)}>How this module works</BandLink>
      </>}
      strip={shown.map(w => <span key={w.id} className="w-14 shrink-0"><StepBar steps={w.steps} height={4} /></span>)}
      cardCount={shown.length}
      cards={shown.map(w => (
        <Link key={w.id} to={catalogueRoute(entityType, `?workflow=${w.id}`)} className={bandCard}>
          <div className="flex items-center justify-between gap-1.5">
            <strong className="text-xs truncate" title={w.name}>{w.name}</strong>
            {w.usage?.total > 0
              ? <span className="text-[10px] font-semibold px-1.5 rounded-badge bg-status-pass-bg text-status-pass-fg shrink-0">In use</span>
              : <span className="text-[10px] font-semibold px-1.5 rounded-badge bg-status-pending-bg text-status-pending-fg shrink-0">Available</span>}
          </div>
          <StepBar steps={w.steps} height={5} />
          <div className="text-[10.5px] text-text-muted truncate">
            {w.stepCount} steps · {(w.sides || []).filter(s => s !== 'SYSTEM').map(s => SIDE_LABEL[s] || s).join(' + ') || 'System'}
            {w.roleCount ? ` · ${w.roleCount} role${w.roleCount === 1 ? '' : 's'}` : ''}
            {w.hasDemo && <span className="text-brand-ink font-semibold"> · <Play size={8} className="inline -mt-0.5" fill="currentColor" /> demo</span>}
          </div>
        </Link>
      ))}
    />
  )
}

// ─── "Your part" band — vendors, auditors, auditees ──────────────────────────

/**
 * For the sides that work INSIDE someone else's workflow: not "which workflow
 * should we pick" but "which steps are mine, and how do I do them". No
 * request button, no organisation role coverage.
 */
export function YourPartBand({ entityType, viewerSides = [] }) {
  const { data: workflows = [] } = useWorkflowCatalogue(entityType)
  const mine = workflows
    .map(w => ({ w, steps: (w.steps || []).filter(s => viewerSides.includes(String(s.side).toUpperCase())) }))
    .filter(x => x.steps.length > 0)
  if (!mine.length) return null
  return (
    <section className="rounded-card border border-brand-500/30 bg-brand-500/5 px-3 py-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-7 h-7 rounded-ctl bg-brand-500 text-brand-on flex items-center justify-center shrink-0"><GitBranch size={14} /></span>
        <strong className="text-[13px] text-text-primary">Your part in the workflow</strong>
        <span className="text-xs text-text-muted">what you do, and what happens before and after</span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {mine.map(({ w, steps }) => (
          <Link key={w.id} to={catalogueRoute(entityType, `?workflow=${w.id}`)}
            className="rounded-ctl bg-surface-raised border border-border px-3 py-2 flex flex-col gap-1.5 hover:border-brand-500/40 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-[12.5px] text-text-primary truncate">{w.name}</strong>
              {w.hasDemo && <span className="text-[11px] font-semibold text-brand-ink shrink-0"><Play size={9} className="inline -mt-0.5" fill="currentColor" /> demo</span>}
            </div>
            <div className="flex gap-[3px]" aria-hidden="true">
              {(w.steps || []).map(s => (
                <span key={s.id} className="flex-1 rounded-full" style={{ height: 6,
                  background: SIDE_COLOR[s.side] || SIDE_COLOR.ORGANIZATION,
                  opacity: steps.some(m => m.id === s.id) ? 1 : 0.25 }} />
              ))}
            </div>
            <p className="text-[11.5px] text-text-secondary truncate">
              Your step{steps.length === 1 ? '' : 's'}: {steps.map(s => `${s.order}. ${s.name}`).join(' · ')}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ─── Module guide band — modules without a workflow ──────────────────────────

/** A lifecycle drawn like a StepBar: one segment per stage, in its own colour. */
function StageBar({ states = [], height = 5 }) {
  return (
    <div className="flex gap-[3px]" role="img" aria-label={`${states.length} stages`}>
      {states.map((s, i) => {
        const tag = s.colorTag || SEMANTIC_COLORS[String(s.key || '').toUpperCase()]
        return (
          <span key={s.key ?? i} className="flex-1 rounded-full"
            style={{ height, background: SEMANTIC_DOT[tag] || 'rgb(var(--color-brand-400))' }} />
        )
      })}
    </div>
  )
}
const SEMANTIC_DOT = {
  green: 'rgb(var(--color-status-pass-fg))', red: 'rgb(var(--color-status-fail-fg))',
  amber: 'rgb(var(--color-status-warn-fg))', yellow: 'rgb(var(--color-status-warn-fg))',
  blue: 'rgb(var(--color-status-info-fg))', cyan: 'rgb(var(--color-status-info-fg))',
  purple: 'rgb(var(--color-status-pending-fg))', indigo: 'rgb(var(--color-status-pending-fg))',
  gray: '#9aa1ad', teal: '#3f9a8a',
}

/**
 * "How assets work" — for a module that runs no workflow. Same band, same
 * collapse, same place as the workflow band; its cards are the module's
 * lifecycle, what can be done on it, and its walkthrough.
 */
export function ModuleGuideBand({ entityType, moduleLabel }) {
  const { data: guide } = useModuleGuide(entityType)
  const [collapsed, toggle] = useBandCollapse(`kashi:guide-band:${entityType}`)
  if (!guide) return null
  const states = guide.lifecycle?.states || []
  const actions = guide.actions || []
  if (!guide.summary && !guide.hasDemo && states.length < 2 && !actions.length) return null
  const label = moduleLabel || guide.displayNamePlural || 'this module'
  const roles = [...new Set(actions.flatMap(a => (a.roles || []).map(r => r.name)))]
  const cards = []
  if (states.length) {
    cards.push(
      <Link key="life" to={guideRoute(entityType)} className={bandCard}>
        <div className="flex items-center justify-between gap-1.5">
          <strong className="text-xs truncate">Lifecycle</strong>
          <span className="text-[10px] font-semibold px-1.5 rounded-badge bg-status-tag-bg text-status-tag-fg shrink-0">{states.length} stages</span>
        </div>
        <StageBar states={states} />
        <div className="text-[10.5px] text-text-muted truncate" title={states.map(s => s.label).join(' → ')}>
          {states.map(s => s.label).join(' → ')}
        </div>
      </Link>
    )
  }
  if (actions.length) {
    cards.push(
      <Link key="act" to={guideRoute(entityType)} className={bandCard}>
        <div className="flex items-center justify-between gap-1.5">
          <strong className="text-xs truncate">Who can do what</strong>
          <span className="text-[10px] font-semibold px-1.5 rounded-badge bg-status-pending-bg text-status-pending-fg shrink-0">{actions.length} actions</span>
        </div>
        <div className="text-[10.5px] text-text-secondary truncate">{actions.slice(0, 4).map(a => a.label).join(' · ')}</div>
        <div className="text-[10.5px] text-text-muted truncate">
          {roles.length ? `${roles.length} role${roles.length === 1 ? '' : 's'}: ${roles.slice(0, 3).join(', ')}${roles.length > 3 ? '…' : ''}` : 'Open to anyone with access'}
        </div>
      </Link>
    )
  }
  cards.push(
    <Link key="demo" to={guideRoute(entityType)} className={bandCard}>
      <div className="flex items-center justify-between gap-1.5">
        <strong className="text-xs truncate">Walkthrough</strong>
        {guide.hasDemo
          ? <span className="text-[10px] font-semibold px-1.5 rounded-badge bg-status-pass-bg text-status-pass-fg shrink-0">Video</span>
          : <span className="text-[10px] font-semibold px-1.5 rounded-badge bg-surface-overlay text-text-muted shrink-0">Guide</span>}
      </div>
      <div className="text-[10.5px] text-text-secondary leading-snug line-clamp-2">
        {guide.hasDemo
          ? <><Play size={8} className="inline -mt-0.5 text-brand-ink" fill="currentColor" /> {(guide.chapters || []).length ? `${guide.chapters.length} chapters` : 'Watch it end to end'}</>
          : 'Stages, actions and how records connect'}
      </div>
    </Link>
  )
  return (
    <GuideBandShell
      icon={BookOpen} title={`How ${String(label).toLowerCase()} work`} collapsed={collapsed} onToggle={toggle}
      subtitle={guide.summary || 'What each stage means, who can do what, and how records connect.'}
      links={<>
        {guide.hasDemo
          ? <BandCta to={guideRoute(entityType)}><Play size={10} fill="currentColor" /> Watch the demo</BandCta>
          : <BandCta to={guideRoute(entityType)}>Open the guide →</BandCta>}
        {guide.hasDemo && <BandGhost to={guideRoute(entityType)}>Open the guide</BandGhost>}
      </>}
      strip={states.length ? <span className="w-40 shrink-0"><StageBar states={states} height={4} /></span> : null}
      cardCount={cards.length}
      cards={cards}
    />
  )
}

export function StepBar({ steps = [], current = null, height = 6 }) {
  return (
    <div className="flex gap-[3px]" role="img"
      aria-label={`${steps.length} steps: ${steps.map(s => SIDE_LABEL[s.side] || s.side).join(', ')}`}>
      {steps.map((s, i) => (
        <span key={s.id ?? i} className="flex-1 rounded-full"
          style={{ height, background: SIDE_COLOR[s.side] || SIDE_COLOR.ORGANIZATION,
            opacity: current != null && i + 1 > current ? 0.35 : 1 }} />
      ))}
    </div>
  )
}

// ─── KPI band ────────────────────────────────────────────────────────────────

/** "f.status" → "status": the list filters a widget's drill-through carries. */
function filtersOf(widget) {
  let drill = null
  try { drill = widget.drillThroughJson ? JSON.parse(widget.drillThroughJson) : null } catch { /* malformed */ }
  if (!drill) return null
  const out = {}
  for (const [k, v] of Object.entries(drill)) {
    if (k.startsWith('f.') && v != null && v !== '' && v !== '{clicked}') out[k] = String(v)
  }
  return Object.keys(out).length ? out : null
}

export function KpiBand({ entityType, activeFilters = {}, onFilter }) {
  const key = `${String(entityType || '').toLowerCase()}_list_kpis`
  const { data } = useQuery({
    queryKey: ['dashboard', key],
    queryFn: () => api.get(`/v1/dashboards/${key}`),
    enabled: !!entityType,
    retry: false,              // most modules have no list KPIs — a 404 means "none"
    staleTime: 5 * 60_000,
  })
  const dash = data?.data || data
  const widgets = useMemo(() => (dash?.widgets || []).filter(w => w.widgetType === 'KPI_CARD'), [dash])
  if (!widgets.length) return null
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))` }}>
      {widgets.map(w => <KpiTile key={w.widgetKey || w.id} widget={w} activeFilters={activeFilters} onFilter={onFilter} />)}
    </div>
  )
}

function KpiTile({ widget, activeFilters, onFilter }) {
  const { data, isLoading } = useWidgetData(widget)
  const navigate = useNavigate()
  let cfg = {}
  try { cfg = widget.configJson ? JSON.parse(widget.configJson) : {} } catch { /* default look */ }
  const tag = resolveThresholdColor(widget.thresholdsJson, data ?? 0) || cfg.colorTag || 'gray'
  const t = TILE_TONE[tag] || TILE_TONE.gray
  const filters = filtersOf(widget)
  const active = filters && Object.entries(filters).every(([k, v]) => String(activeFilters[k] ?? '') === v)
  const click = filters
    ? () => onFilter?.(active ? Object.fromEntries(Object.keys(filters).map(k => [k, null])) : filters)
    : widget.clickThroughRoute ? () => navigate(widget.clickThroughRoute) : null
  return (
    <button type="button" onClick={click || undefined} disabled={!click} aria-pressed={!!active}
      className={cn('flex items-center gap-3 px-3 py-1.5 rounded-card border text-left transition-all min-w-0', t.tile,
        click && 'hover:brightness-[0.98] cursor-pointer', active && 'ring-2 ring-offset-1 ring-brand-500/50')}>
      {isLoading
        ? <span className="h-6 w-8 rounded bg-surface-overlay animate-pulse" />
        : <span className={cn('text-[20px] font-bold leading-none tabular-nums', t.fg)}>
            {cfg.prefix}{formatValue(data ?? 0, widget.valueFormat)}{cfg.suffix}
          </span>}
      <span className="min-w-0">
        <span className={cn('block text-[10.5px] font-semibold uppercase tracking-wide truncate', t.fg)}>{widget.title}</span>
        {widget.subtitle && <span className="block text-[11px] text-text-muted truncate">{widget.subtitle}</span>}
      </span>
    </button>
  )
}

// ─── Filter chips ────────────────────────────────────────────────────────────

export function FilterChips({ filters = {}, onRemove, onClear }) {
  const entries = Object.entries(filters).filter(([, v]) => v != null && v !== '')
  if (!entries.length) return null
  const nice = (s) => String(s).replace(/^f\./, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">Filter</span>
      {entries.map(([k, v]) => (
        <button key={k} type="button" onClick={() => onRemove?.(k)}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-badge text-xs font-semibold bg-brand-500/10 text-brand-ink hover:bg-brand-500/20">
          {nice(k)}: {nice(String(v).toLowerCase())} <X size={11} aria-label="Remove filter" />
        </button>
      ))}
      {entries.length > 1 && (
        <button type="button" onClick={onClear} className="text-xs text-text-muted hover:text-text-primary">Clear all</button>
      )}
    </div>
  )
}