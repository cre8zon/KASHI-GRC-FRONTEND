/**
 * DetailChrome — the parts of a module detail screen above and around the tab
 * body: breadcrumb trail, action bar, header zone (with tab summary tiles) and
 * the card renderer used for Overview and every Screen Designer form tab.
 *
 * ── WHAT DRIVES IT ──────────────────────────────────────────────────────────
 * Nothing here is laid out per module. Everything comes from what Screen
 * Designer already stores:
 *   - header zone      → {screen}_header form fields
 *   - a tab's header   → {screen}_tab_{key}_header (only when tabs_json marks
 *                        the tab "header": true)
 *   - Overview / tabs  → {screen}_tab_{key} form fields, SECTION_HEADER rows
 *                        start a new card
 *   - summary tiles    → tabs_json entries with "headerKpi": true|false
 * Field TYPE decides the look: SELECT → coloured badge, LOOKUP → person tile,
 * DATE → date tile (due-date aware), TEXTAREA → paragraph, TAG → chips. Empty
 * fields collapse into one "Not set" strip instead of a grid of "Empty".
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ChevronRight, MoreHorizontal, BookOpen, Pencil, Play, Eye, CheckSquare, Calendar, User,
  GitBranch, Paperclip, AlertTriangle, MessageSquare, Clock, FileText, Tag, Hash, Gauge, LayoutList,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../config/axios.config'
import { COLOR_MAP } from '../../config/constants'
import { commentsApi } from '../../api/comments.api'
import { useEntityDocuments } from '../../hooks/useDocuments'

// ─── Colour ──────────────────────────────────────────────────────────────────

/**
 * Semantic colour fallback for common GRC values that have no configured
 * option colour yet. Moved here from UniversalModulePage so the header zone,
 * the field cards and DrawerProperty read ONE map.
 */
export const SEMANTIC_COLORS = {
  // Severity
  CRITICAL: 'red', HIGH: 'amber', MEDIUM: 'yellow', LOW: 'green',
  // Status
  OPEN: 'blue', IN_PROGRESS: 'indigo', PENDING_REVIEW: 'purple',
  TRIAGED: 'cyan', RESOLVED: 'green', CLOSED: 'gray',
  ACCEPTED_RISK: 'amber', PENDING_VALIDATION: 'yellow',
  // Issue type
  INTERNAL: 'blue', EXTERNAL: 'purple', AUTOMATED: 'cyan', REGULATORY: 'indigo',
  // Generic
  ACTIVE: 'green', INACTIVE: 'gray', DRAFT: 'gray', APPROVED: 'green',
  REJECTED: 'red', CANCELLED: 'gray', COMPLETED: 'green',
  IN_REVIEW: 'purple', PASS: 'green', FAIL: 'red', PARTIAL: 'amber',
  EFFECTIVE: 'green', INEFFECTIVE: 'red',
  true: 'green', false: 'gray',
}

/** Tinted tile surfaces per colour tag — the badge palette, a shade lighter. */
export const TILE_TONE = {
  red:    { tile: 'bg-status-fail-bg/50 border-status-fail-bg',       fg: 'text-status-fail-fg' },
  amber:  { tile: 'bg-status-warn-bg/50 border-status-warn-bg',       fg: 'text-status-warn-fg' },
  yellow: { tile: 'bg-status-warn-bg/50 border-status-warn-bg',       fg: 'text-status-warn-fg' },
  green:  { tile: 'bg-status-pass-bg/50 border-status-pass-bg',       fg: 'text-status-pass-fg' },
  blue:   { tile: 'bg-status-info-bg/50 border-status-info-bg',       fg: 'text-status-info-fg' },
  cyan:   { tile: 'bg-status-info-bg/50 border-status-info-bg',       fg: 'text-status-info-fg' },
  indigo: { tile: 'bg-status-tag-bg/50 border-status-tag-bg',         fg: 'text-status-tag-fg' },
  purple: { tile: 'bg-status-tag-bg/50 border-status-tag-bg',         fg: 'text-status-tag-fg' },
  gray:   { tile: 'bg-status-pending-bg/50 border-status-pending-bg', fg: 'text-status-pending-fg' },
}
const tone = (tag) => TILE_TONE[tag] || TILE_TONE.gray

const humanise = (v) => String(v ?? '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())

/** The badge a SELECT-like value should wear: its option colour, else the semantic one. */
export function badgeFor(field, value, screenConfig) {
  const opts = screenConfig?.components?.[field?.optionsComponentKey]?.options || []
  const opt = opts.find(o => String(o.value) === String(value))
  const colorTag = opt?.colorTag || SEMANTIC_COLORS[String(value).toUpperCase()] || SEMANTIC_COLORS[String(value)] || 'gray'
  return { label: opt?.label || humanise(value), colorTag }
}

export function Chip({ colorTag = 'gray', children, className, title }) {
  return (
    <span title={title}
      className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-badge text-xs font-semibold leading-5 whitespace-nowrap',
        COLOR_MAP[colorTag] || COLOR_MAP.gray, className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
      {children}
    </span>
  )
}

// ─── Field classification ────────────────────────────────────────────────────

const LAYOUT_TYPES = new Set(['SECTION_HEADER', 'DIVIDER'])
const BADGE_TYPES  = new Set(['SELECT', 'RADIO'])
const PROSE_TYPES  = new Set(['TEXTAREA', 'RICH_TEXT', 'JSON_EDITOR'])
const LIST_TYPES   = new Set(['TAG', 'MULTI_SELECT', 'MULTILINE_LIST'])
const DATE_TYPES   = new Set(['DATE', 'DATETIME'])

export const isEmptyValue = (v) =>
  v === null || v === undefined || v === ''
  || (Array.isArray(v) && v.length === 0)
  || (typeof v === 'string' && (v.trim() === '' || v.trim() === '[]'))

const isBadgeField = (f) => BADGE_TYPES.has(f.fieldType) || (!!f.optionsComponentKey && !LIST_TYPES.has(f.fieldType))

/** Due-style dates read against today; others are plain dates. */
const DUE_KEY = /due|deadline|nextreview|next_review|expir|enddate|end_date|plannedend|committed/i

function dateInfo(field, value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return { text: String(value), sub: null, colorTag: 'blue' }
  const text = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  if (!DUE_KEY.test(field.fieldKey || '')) return { text, sub: null, colorTag: 'green' }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((d.setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000)
  if (days < 0)  return { text, sub: `${-days} day${days === -1 ? '' : 's'} overdue`, colorTag: 'red' }
  if (days === 0) return { text, sub: 'due today', colorTag: 'amber' }
  if (days <= 7) return { text, sub: `in ${days} day${days === 1 ? '' : 's'}`, colorTag: 'amber' }
  return { text, sub: `in ${days} days`, colorTag: 'green' }
}

function parseList(value) {
  if (Array.isArray(value)) return value
  const s = String(value).trim()
  if (s.startsWith('[')) { try { const a = JSON.parse(s); return Array.isArray(a) ? a : [s] } catch { return [s] } }
  return s.split(/[,\n]/).map(t => t.trim()).filter(Boolean)
}

// ─── Breadcrumb ──────────────────────────────────────────────────────────────

/** items: [{ label, to?, onClick? }] — the last item is the current page. */
export function Breadcrumb({ items = [] }) {
  const shown = items.filter(i => i && i.label)
  if (shown.length === 0) return null
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[11px] text-text-muted min-w-0 flex-wrap">
      {shown.map((it, i) => {
        const last = i === shown.length - 1
        return (
          <span key={`${it.label}-${i}`} className="flex items-center gap-1 min-w-0">
            {last
              ? <span aria-current="page" className="text-text-primary font-semibold truncate max-w-[260px]">{it.label}</span>
              : it.to
                ? <Link to={it.to} className="hover:text-brand-ink truncate max-w-[200px]">{it.label}</Link>
                : it.onClick
                  ? <button type="button" onClick={it.onClick} className="hover:text-brand-ink truncate max-w-[200px]">{it.label}</button>
                  : <span className="truncate max-w-[200px]">{it.label}</span>}
            {!last && <ChevronRight size={11} className="text-text-faint shrink-0" aria-hidden="true" />}
          </span>
        )
      })}
    </nav>
  )
}

/**
 * Menu path to a module, from the navigation tree: the groups above the row
 * whose route is /module/{entityType} (or whose navKey matches).
 * Works on a tree (children) or a flat list (parentKey).
 */
export function navTrailFor(navItems, { navKey, entityType }) {
  const items = Array.isArray(navItems) ? navItems : []
  const route = entityType ? `/module/${String(entityType).toLowerCase()}` : null
  const matches = (n) => (navKey && n.navKey === navKey)
    || (route && typeof n.route === 'string' && n.route.split('?')[0] === route)

  // Tree walk
  const walk = (nodes, path) => {
    for (const n of nodes || []) {
      if (matches(n)) return path
      const hit = walk(n.children, [...path, n])
      if (hit) return hit
    }
    return null
  }
  let path = walk(items, [])
  // Flat list fallback
  if (!path) {
    const byKey = new Map(items.map(n => [n.navKey, n]))
    const leaf = items.find(matches)
    if (leaf) {
      path = []
      let p = leaf.parentKey ? byKey.get(leaf.parentKey) : null
      while (p) { path.unshift(p); p = p.parentKey ? byKey.get(p.parentKey) : null }
    }
  }
  return (path || []).map(n => ({ label: n.label, to: n.route && n.route.startsWith('/') ? n.route : undefined }))
}

// ─── Action bar ──────────────────────────────────────────────────────────────

/**
 * The step's own buttons, first under the title on every tab.
 *
 * mode
 *   'act'   — the viewer holds a live task here: tinted bar, main button large
 *   'view'  — opened from a task they can only view: grey bar, says why
 *   'none'  — no task context: just the record's actions, quietly
 *
 * primary   ReactNode[] — the step's decisions, rendered out front by the page
 *                         (which keeps its label / override / loading logic)
 * more      [{ key, label, icon, onClick, danger, disabled }]
 * onEdit    opens the module's edit form; omitted when editing is not allowed
 * how       { to, seconds } — "How this step works", the walkthrough at this step
 */
export function ActionBar({ mode = 'none', taskId, stepLabel, holderText, viewReason, slaDueAt,
  primary = [], more = [], onEdit, how, guide }) {
  const hasButtons = primary.length > 0 || more.length > 0 || !!onEdit
  const [showAll, setShowAll] = useState(false)
  if (mode === 'none' && !hasButtons && !stepLabel) return null

  const sla = slaDueAt ? slaChip(slaDueAt) : null
  const act = mode === 'act'
  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2 rounded-card flex-wrap',
      act ? 'bg-surface-raised border border-brand-500/35 shadow-[0_2px_8px_rgb(var(--color-brand-500)/0.10)]'
          : mode === 'view' ? 'bg-surface-overlay border border-border'
          : 'bg-surface-raised border border-border/70')}>
      {(mode !== 'none' || stepLabel) && (
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0',
            act ? 'bg-brand-500 text-brand-on' : 'bg-surface-overlay text-text-muted border border-border')}>
            {act ? <CheckSquare size={15} /> : mode === 'view' ? <Eye size={15} /> : <GitBranch size={15} />}
          </span>
          <div className="min-w-0">
            <p className={cn('text-[10px] font-semibold uppercase tracking-wide', act ? 'text-brand-ink' : 'text-text-muted')}>
              {act ? `Your task${taskId ? ` · #${taskId}` : ''}`
                : mode === 'view' ? `Task${taskId ? ` #${taskId}` : ''} · view only`
                : 'Current step'}
            </p>
            <p className="text-sm font-semibold text-text-primary truncate">
              {stepLabel || '—'}
              {(viewReason || holderText) && (
                <span className="font-normal text-xs text-text-muted"> · {viewReason || holderText}</span>
              )}
            </p>
          </div>
          {sla && act && <Chip colorTag={sla.colorTag}>{sla.text}</Chip>}
          {/* With a walkthrough chapter for this step: ▶ jumps to it in the
              video. Without one: the same link opens the step's guide. */}
          {how?.to ? (
            <Link to={how.to}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-ink px-2.5 py-1 rounded-full bg-brand-500/8 hover:bg-brand-500/15 transition-colors">
              <Play size={10} fill="currentColor" /> How this step works
              {Number.isFinite(how.seconds) && <span className="font-mono font-normal opacity-80">· {mmss(how.seconds)}</span>}
            </Link>
          ) : how?.onClick ? (
            <button type="button" onClick={how.onClick}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-ink px-2.5 py-1 rounded-full bg-brand-500/8 hover:bg-brand-500/15 transition-colors">
              <BookOpen size={11} /> How this step works
            </button>
          ) : null}
        </div>
      )}
      {hasButtons && (
        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {more.length > 0 && <MoreMenu items={more} />}
          {onEdit && (
            <button type="button" onClick={onEdit}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-ctl text-xs font-semibold border border-brand-500/30 bg-brand-500/8 text-brand-ink hover:bg-brand-500/15 transition-colors">
              <Pencil size={12} /> Edit details
            </button>
          )}
          {primary}
        </div>
      )}
      {/* Guidance line: what this step expects, what comes after, and the
          whole workflow one click away. guide = { whatToDo, next, onOpen }. */}
      {guide && (guide.whatToDo || guide.next || guide.onOpen) && (
        <div className="basis-full flex items-start gap-3 flex-wrap pt-2 border-t border-border/60">
          {guide.whatToDo && mode !== 'none' && (
            <div className="flex-[1_1_320px] min-w-0 text-[12.5px] leading-relaxed text-text-secondary">
              <span className="font-semibold text-text-primary">{mode === 'act' ? 'What to do: ' : 'This step: '}</span>
              <span className={cn('whitespace-pre-wrap', !showAll && 'line-clamp-2')}>{guide.whatToDo}</span>
              {guide.whatToDo.length > 180 && (
                <button type="button" onClick={() => setShowAll(v => !v)} className="ml-1 text-xs font-medium text-brand-ink hover:underline">
                  {showAll ? 'less' : 'more'}
                </button>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-3 flex-wrap text-xs">
            {guide.next && (
              <span className="text-text-muted">
                Next: <span className="font-semibold text-text-primary">{guide.next.name}</span>
                {guide.next.sideLabel && <span> · {guide.next.sideLabel}</span>}
              </span>
            )}
            {guide.onOpen && (
              <button type="button" onClick={guide.onOpen}
                className="inline-flex items-center gap-1 font-semibold text-brand-ink hover:underline">
                <GitBranch size={12} /> View workflow
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function slaChip(dueAt) {
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return null
  const hours = Math.round((due.getTime() - Date.now()) / 3_600_000)
  if (hours < 0) return { text: `SLA · ${Math.ceil(-hours / 24)}d overdue`, colorTag: 'red' }
  if (hours < 24) return { text: `SLA · ${hours}h left`, colorTag: 'amber' }
  const d = Math.round(hours / 24)
  return { text: `SLA · ${d} day${d === 1 ? '' : 's'} left`, colorTag: d <= 2 ? 'amber' : 'green' }
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function MoreMenu({ items = [], label = 'More' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-ctl text-xs font-medium border border-border bg-surface-raised text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors">
        <MoreHorizontal size={14} /> {label}
      </button>
      {open && (
        <div role="menu"
          className="absolute right-0 mt-1 z-40 min-w-[200px] py-1 rounded-card border border-border bg-surface-raised shadow-lg">
          {items.map(it => {
            const Icon = it.icon
            return (
              <button key={it.key} type="button" role="menuitem" disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick?.() }}
                className={cn('w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors disabled:opacity-40',
                  it.danger ? 'text-status-fail-fg hover:bg-status-fail-bg/50' : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary')}>
                {Icon ? <Icon size={13} /> : <span className="w-[13px]" />}
                <span className="truncate">{it.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Header zone ─────────────────────────────────────────────────────────────

const REF_KEY = /(^|[a-z])(ref|code)(snapshot)?$/i
const PERSON_KEY = /owner|user|assignee|auditor|auditee|lead|manager|custodian|reportedby|approvedby|acceptedby/i

/**
 * fields      header form fields (already filtered for hidden ones)
 * titleValue  the entity's display title — a field holding it is not repeated
 * renderValue (field, value) => ReactNode, for LOOKUP labels and odd types
 * tiles       summary tiles [{ key, label, value, sub, colorTag, icon, onClick }]
 */
export function HeaderZone({ fields = [], entity, titleValue, screenConfig, renderValue, tiles = [], actions = null }) {
  const refs = [], badges = [], cards = []
  for (const f of fields) {
    if (LAYOUT_TYPES.has(f.fieldType)) continue
    const v = entity?.[f.fieldKey]
    if (['title', 'name'].includes(f.fieldKey) || (titleValue && v === titleValue)) continue
    if (isBadgeField(f)) { if (!isEmptyValue(v)) badges.push(f); continue }
    if ((f.fieldType === 'TEXT' || !f.fieldType) && REF_KEY.test(f.fieldKey || '')) { if (!isEmptyValue(v)) refs.push(f); continue }
    cards.push(f)
  }
  if (refs.length + badges.length + cards.length + tiles.length === 0 && !actions) return null

  // Compact: one row — reference and badges, the header cards, and the
  // record's own actions at the end — then one row of summary tiles.
  return (
    <section className="rounded-card border border-border bg-surface-raised px-3 py-2 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 items-center">
        {(refs.length > 0 || badges.length > 0) && (
          <div className="flex items-center gap-1.5 flex-wrap min-w-0 mr-1">
            {refs.map(f => (
              <span key={f.fieldKey} title={f.label}
                className="font-mono text-xs px-2 py-0.5 rounded-ctl bg-brand-500/5 border border-border text-text-secondary">
                {String(entity[f.fieldKey])}
              </span>
            ))}
            {badges.map(f => {
              const b = badgeFor(f, entity[f.fieldKey], screenConfig)
              return <Chip key={f.fieldKey} colorTag={b.colorTag} title={f.label}>{b.label}</Chip>
            })}
          </div>
        )}
        {cards.length > 0 && (
          <div className="flex gap-2 flex-wrap flex-[1_1_360px] min-w-0">
            {cards.map(f => <HeaderCard key={f.fieldKey} field={f} entity={entity} renderValue={renderValue} />)}
          </div>
        )}
        {actions && <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">{actions}</div>}
      </div>
      {tiles.length > 0 && (
        <div className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.min(tiles.length, 4)}, minmax(0, 1fr))` }}>
          {tiles.map(t => <SummaryTile key={t.key} tile={t} />)}
        </div>
      )}
    </section>
  )
}

// ─── Record hero (detail screens) ─────────────────────────────────────────────

const NUMBER_TYPES = new Set(['NUMBER', 'DECIMAL', 'CURRENCY', 'SLIDER', 'PERCENT', 'SCORE'])

/** Header fields split by how the hero shows them. Empty fields are left out. */
export function splitHeaderFields(fields = [], entity, titleValue) {
  const out = { refs: [], badges: [], kpis: [], facts: [] }
  for (const f of fields) {
    if (LAYOUT_TYPES.has(f.fieldType)) continue
    const v = entity?.[f.fieldKey]
    if (['title', 'name'].includes(f.fieldKey) || (titleValue && v === titleValue)) continue
    if (isEmptyValue(v)) continue
    if (isBadgeField(f)) out.badges.push(f)
    else if ((f.fieldType === 'TEXT' || !f.fieldType) && REF_KEY.test(f.fieldKey || '')) out.refs.push(f)
    else if (DATE_TYPES.has(f.fieldType) || NUMBER_TYPES.has(f.fieldType)) out.kpis.push(f)
    else out.facts.push(f)
  }
  return out
}

/**
 * The top of a detail screen, modelled on a record "profile" page:
 *
 *   [icon]  Title                                   [all actions]
 *           REF · Legal name … · Country … · Website …
 *           (status) (Risk tier · Low) (Type · Internal)
 *   [ tinted KPI tiles: dates, numbers, workflow, evidence … ]
 *
 * No card around it — it sits on the page, and the tab strip's rule below it
 * is what separates the record's identity from the tab content.
 */
export function RecordHero({ icon: Icon, title, status, fields = [], entity, titleValue, screenConfig,
  renderValue, tiles = [], actions = null }) {
  const { refs, badges, kpis, facts } = splitHeaderFields(fields, entity, titleValue)
  const kpiTiles = kpis.map(f => {
    const v = entity[f.fieldKey]
    if (DATE_TYPES.has(f.fieldType)) {
      const d = dateInfo(f, v)
      return { key: `f-${f.fieldKey}`, label: f.label, value: d.text, sub: d.sub, colorTag: d.colorTag, icon: Calendar }
    }
    return { key: `f-${f.fieldKey}`, label: f.label, value: renderValue(f, v), colorTag: 'blue', icon: Gauge }
  })
  const allTiles = [...kpiTiles, ...tiles]
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-3 flex-wrap">
        <span className="w-9 h-9 rounded-ctl flex items-center justify-center shrink-0 text-brand-on shadow-sm"
          style={{ background: 'linear-gradient(135deg, rgb(var(--color-brand-500)), rgb(var(--color-brand-700)))' }}>
          {Icon ? <Icon size={17} /> : <FileText size={17} />}
        </span>
        <div className="flex-[1_1_360px] min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <h1 className="text-[17px] font-semibold text-text-primary leading-tight min-w-0 truncate" title={title}>{title}</h1>
            {status}
          </div>
          {(refs.length > 0 || facts.length > 0) && (
            <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[12.5px] min-w-0">
              {refs.map(f => (
                <span key={f.fieldKey} title={f.label} className="font-mono text-[11.5px] px-1.5 rounded bg-surface-overlay text-text-secondary">
                  {String(entity[f.fieldKey])}
                </span>
              ))}
              {facts.map(f => (
                <span key={f.fieldKey} className="inline-flex items-baseline gap-1.5 min-w-0 max-w-[320px]">
                  <span className="text-text-muted whitespace-nowrap">{f.label}</span>
                  <span className="font-medium text-text-primary truncate">{renderValue(f, entity[f.fieldKey])}</span>
                </span>
              ))}
            </div>
          )}
          {badges.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {badges.map(f => {
                const b = badgeFor(f, entity[f.fieldKey], screenConfig)
                return (
                  <Chip key={f.fieldKey} colorTag={b.colorTag} title={`${f.label}: ${b.label}`}>
                    <span className="font-medium opacity-75">{f.label}</span> {b.label}
                  </Chip>
                )
              })}
            </div>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap justify-end ml-auto max-w-full">{actions}</div>}
      </div>
      {allTiles.length > 0 && (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          {allTiles.map(t => <HeroTile key={t.key} tile={t} />)}
        </div>
      )}
    </section>
  )
}

/** A tinted KPI tile — label and icon in the tone colour, the value large. */
function HeroTile({ tile }) {
  const t = tone(tile.colorTag)
  const Icon = tile.icon
  const Tag_ = tile.onClick ? 'button' : 'div'
  return (
    <Tag_ type={tile.onClick ? 'button' : undefined} onClick={tile.onClick}
      className={cn('text-left px-3 py-2 rounded-card border min-w-0 flex flex-col gap-0.5 transition-all', t.tile,
        tile.onClick && 'hover:-translate-y-px hover:shadow-sm cursor-pointer')}>
      <span className="flex items-center gap-2">
        <span className={cn('text-[10px] font-bold uppercase tracking-wider truncate flex-1 min-w-0', t.fg)}>{tile.label}</span>
        {Icon && <Icon size={14} className={cn('shrink-0', t.fg)} />}
      </span>
      <span className={cn('text-[15px] font-bold truncate leading-snug', t.fg)}>{tile.value}</span>
      {tile.sub && <span className={cn('text-[11.5px] truncate', t.fg)}>{tile.sub}</span>}
    </Tag_>
  )
}

/** Action buttons in a row — the way every record action is shown now. */
export function ActionButton({ icon: Icon, label, onClick, tone: kind = 'secondary', disabled, title }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-ctl text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-40',
        kind === 'danger' && 'border border-status-fail-fg/30 text-status-fail-fg hover:bg-status-fail-bg/60',
        kind === 'secondary' && 'border border-border bg-surface-raised text-text-primary hover:bg-surface-overlay',
        kind === 'brand' && 'border border-brand-500/30 bg-brand-500/8 text-brand-ink hover:bg-brand-500/15',
        kind === 'ghost' && 'text-brand-ink hover:bg-brand-500/8')}>
      {Icon && <Icon size={13} />} {label}
    </button>
  )
}

function HeaderCard({ field, entity, renderValue }) {
  const v = entity?.[field.fieldKey]
  const empty = isEmptyValue(v)
  const person = field.fieldType === 'LOOKUP' && (PERSON_KEY.test(field.fieldKey || '')
    || String(field.lookupEntityType || '').toUpperCase() === 'USER')
  if (DATE_TYPES.has(field.fieldType) && !empty) {
    const d = dateInfo(field, v)
    const t = tone(d.colorTag)
    return (
      <div className={cn('flex items-center gap-2 px-2.5 py-1 rounded-ctl border min-w-0 flex-[1_1_180px]', t.tile)}>
        <span className={cn('w-6 h-6 rounded-ctl flex items-center justify-center shrink-0 bg-surface-raised/70', t.fg)}><Calendar size={12} /></span>
        <div className="min-w-0">
          <p className="text-[9.5px] font-semibold uppercase tracking-wide text-text-muted leading-tight">{field.label}</p>
          <p className="text-[13px] font-semibold text-text-primary truncate leading-tight">
            {d.text}{d.sub && <span className={cn('text-[11.5px] font-medium ml-1', t.fg)}>· {d.sub}</span>}
          </p>
        </div>
      </div>
    )
  }
  const t = tone(person ? 'purple' : 'gray')
  return (
    <div className={cn('flex items-center gap-2 px-2.5 py-1 rounded-ctl border min-w-0 flex-[1_1_180px]', t.tile)}>
      <span className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0',
        person ? 'bg-brand-500 text-brand-on' : 'bg-surface-raised/70 text-text-muted')}>
        {person ? <User size={11} /> : <Hash size={11} />}
      </span>
      <div className="min-w-0">
        <p className="text-[9.5px] font-semibold uppercase tracking-wide text-text-muted leading-tight">{field.label}</p>
        <div className="text-[13px] font-semibold text-text-primary truncate leading-tight">
          {empty ? <span className="text-xs font-normal italic text-text-muted">Not set</span> : renderValue(field, v)}
        </div>
      </div>
    </div>
  )
}

function SummaryTile({ tile }) {
  const t = tone(tile.colorTag)
  const Icon = tile.icon
  const Tag_ = tile.onClick ? 'button' : 'div'
  return (
    <Tag_ type={tile.onClick ? 'button' : undefined} onClick={tile.onClick}
      className={cn('text-left px-2.5 py-1.5 rounded-ctl border min-w-0 transition-colors flex items-center gap-2', t.tile,
        tile.onClick && 'hover:brightness-[0.98] cursor-pointer')}>
      {Icon && <Icon size={13} className={cn('shrink-0', t.fg)} />}
      <span className="min-w-0">
        <span className={cn('block text-[9.5px] font-semibold uppercase tracking-wide leading-tight', t.fg)}>{tile.label}</span>
        <span className="block text-[12.5px] text-text-primary truncate leading-tight">
          <span className="font-semibold">{tile.value}</span>
          {tile.sub && <span className="text-text-muted"> · {tile.sub}</span>}
        </span>
      </span>
    </Tag_>
  )
}

// ─── Field cards (Overview and form tabs) ────────────────────────────────────

/**
 * fields       form fields in order, SECTION_HEADER rows included
 * skipKeys     keys shown elsewhere (the header zone) — not repeated here
 * defaultTitle title of the first card when the form starts without a section
 * headerSlot   rendered at the right of the first card's title (e.g. Edit)
 * isHidden     (fieldKey) => bool — step-level hidden fields
 */
export function FieldCards({ fields = [], entity, skipKeys = [], defaultTitle = 'Details', headerSlot,
  screenConfig, renderValue, isHidden }) {
  const skip = useMemo(() => new Set(skipKeys), [skipKeys])

  const sections = useMemo(() => {
    const out = []
    let cur = { title: defaultTitle, fields: [] }
    for (const f of fields) {
      if (f.fieldType === 'SECTION_HEADER') {
        if (cur.fields.length) out.push(cur)
        cur = { title: f.label || 'Details', fields: [] }
        continue
      }
      if (f.fieldType === 'DIVIDER') continue
      if (skip.has(f.fieldKey)) continue
      if (isHidden?.(f.fieldKey)) continue
      if (!dependsOnMet(f, entity)) continue
      cur.fields.push(f)
    }
    if (cur.fields.length) out.push(cur)
    return out
  }, [fields, skip, entity, defaultTitle, isHidden])

  if (sections.length === 0) {
    return headerSlot ? <div className="flex justify-end">{headerSlot}</div> : null
  }

  const many = sections.length > 1
  return (
    <div className="grid gap-3"
      style={{ gridTemplateColumns: many ? 'repeat(auto-fill, minmax(340px, 1fr))' : '1fr' }}>
      {sections.map((s, i) => {
        const card = classify(s.fields, entity)
        const filled = card.tiles.length + card.dates.length + card.lists.length + card.prose.length
        const wide = many && (card.prose.length > 0 || card.tiles.length + card.dates.length > 6)
        const pairs = [...card.tiles, ...card.dates]
        return (
          <section key={`${s.title}-${i}`}
            className={cn('rounded-card border border-border bg-surface-raised p-4 flex flex-col gap-3 min-w-0 shadow-[0_1px_2px_rgb(0_0_0/0.03)]',
              wide && 'lg:col-span-2')}>
            <div className="flex items-center gap-2.5">
              <span className={cn('w-7 h-7 rounded-ctl flex items-center justify-center shrink-0', sectionTone(i))}>
                {sectionIcon(card)}
              </span>
              <h3 className="text-[14.5px] font-semibold text-text-primary">{s.title}</h3>
              {i === 0 && headerSlot && <div className="ml-auto">{headerSlot}</div>}
            </div>

            {pairs.length > 0 && (
              <dl className="grid gap-x-5 gap-y-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
                {pairs.map(f => (
                  <FieldValue key={f.fieldKey} field={f} entity={entity} screenConfig={screenConfig} renderValue={renderValue} />
                ))}
              </dl>
            )}

            {card.lists.map(f => (
              <div key={f.fieldKey} className="flex flex-col gap-1.5">
                <span className={LABEL_CLS}>{f.label}</span>
                {f.fieldType === 'MULTILINE_LIST'
                  ? <ol className="flex flex-col gap-1 w-full">
                      {parseList(entity[f.fieldKey]).map((item, n) => (
                        <li key={n} className="flex gap-2 items-baseline text-[13.5px] text-text-primary">
                          <span className="text-[10px] font-bold px-1.5 rounded bg-status-tag-bg text-status-tag-fg">{n + 1}</span>
                          <span>{String(item)}</span>
                        </li>
                      ))}
                    </ol>
                  : <div className="flex gap-1.5 flex-wrap">
                      {parseList(entity[f.fieldKey]).map(item => (
                        <span key={String(item)} className="px-2 py-0.5 rounded-badge text-[11.5px] font-semibold bg-brand-500/10 text-brand-ink">{String(item)}</span>
                      ))}
                    </div>}
              </div>
            ))}

            {card.prose.length > 0 && (
              <div className={cn('grid gap-3', card.prose.length > 1 && 'md:grid-cols-2')}>
                {card.prose.map(f => <ProseBlock key={f.fieldKey} field={f} value={entity[f.fieldKey]} renderValue={renderValue} />)}
              </div>
            )}

            {/* Empty fields fold into one quiet line rather than a grid of
                "Not set" rows — a card with nothing filled in says so once. */}
            {card.empty.length > 0 && (
              <p className={cn('text-[12px] text-text-muted leading-snug rounded-ctl bg-surface-overlay/70 px-2.5 py-1.5',
                filled > 0 && 'mt-0.5')}>
                <span className="font-semibold text-text-secondary">{filled === 0 ? 'Nothing filled in yet' : 'Not set yet'}:</span>{' '}
                {card.empty.map(f => f.label).join(', ')}
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}

const LABEL_CLS = 'text-[10.5px] font-semibold uppercase tracking-wider text-text-muted'

/** One field as label over value — the value styled by its type. */
function FieldValue({ field, entity, screenConfig, renderValue }) {
  const v = entity?.[field.fieldKey]
  let body
  if (isBadgeField(field)) {
    const b = badgeFor(field, v, screenConfig)
    body = <Chip colorTag={b.colorTag}>{b.label}</Chip>
  } else if (DATE_TYPES.has(field.fieldType)) {
    const d = dateInfo(field, v)
    body = (
      <span className="text-[13.5px] font-medium text-text-primary">
        {d.text}{d.sub && <span className={cn('block text-[11.5px] font-medium', tone(d.colorTag).fg)}>{d.sub}</span>}
      </span>
    )
  } else if (field.fieldType === 'TOGGLE' || field.fieldType === 'CHECKBOX') {
    const on = v === true || v === 'true' || v === 1 || v === '1'
    body = <Chip colorTag={on ? 'green' : 'gray'}>{on ? 'Yes' : 'No'}</Chip>
  } else if (field.fieldType === 'LOOKUP' && (PERSON_KEY.test(field.fieldKey || '')
      || String(field.lookupEntityType || '').toUpperCase() === 'USER')) {
    body = (
      <span className="flex items-center gap-2 min-w-0">
        <span className="w-6 h-6 rounded-full bg-brand-500/15 text-brand-ink flex items-center justify-center shrink-0"><User size={12} /></span>
        <span className="text-[13.5px] font-medium text-text-primary truncate">{renderValue(field, v)}</span>
      </span>
    )
  } else {
    body = <span className="block text-[13.5px] font-medium text-text-primary break-words">{renderValue(field, v)}</span>
  }
  return (
    <div className="min-w-0">
      <dt className={LABEL_CLS}>{field.label}</dt>
      <dd className="m-0 mt-1">{body}</dd>
    </div>
  )
}

function dependsOnMet(field, entity) {
  if (!field.dependsOnJson) return true
  try {
    const dep = typeof field.dependsOnJson === 'string' ? JSON.parse(field.dependsOnJson) : field.dependsOnJson
    const actual = entity?.[dep.field]
    if (dep.operator === 'eq')  return actual === dep.value
    if (dep.operator === 'neq') return actual !== dep.value
    if (dep.operator === 'in')  return Array.isArray(dep.value) && dep.value.includes(actual)
  } catch { /* malformed — show the field */ }
  return true
}

function classify(fields, entity) {
  const c = { tiles: [], dates: [], lists: [], prose: [], empty: [] }
  for (const f of fields) {
    const v = entity?.[f.fieldKey]
    if (f.fieldType === 'TOGGLE' || f.fieldType === 'CHECKBOX') {
      if (v === null || v === undefined) c.empty.push(f); else c.tiles.push(f)
      continue
    }
    if (isEmptyValue(v)) { c.empty.push(f); continue }
    if (PROSE_TYPES.has(f.fieldType)) c.prose.push(f)
    else if (LIST_TYPES.has(f.fieldType)) c.lists.push(f)
    else if (DATE_TYPES.has(f.fieldType)) c.dates.push(f)
    else c.tiles.push(f)
  }
  return c
}

const SECTION_TONES = [
  'bg-status-info-bg text-status-info-fg', 'bg-status-tag-bg text-status-tag-fg',
  'bg-status-pass-bg text-status-pass-fg', 'bg-status-warn-bg text-status-warn-fg',
]
const sectionTone = (i) => SECTION_TONES[i % SECTION_TONES.length]
function sectionIcon(card) {
  if (card.prose.length && !card.tiles.length) return <FileText size={13} />
  if (card.dates.length && !card.tiles.length) return <Clock size={13} />
  if (card.lists.length && !card.tiles.length) return <Tag size={13} />
  return <LayoutList size={13} />
}

function ProseBlock({ field, value, renderValue }) {
  const [open, setOpen] = useState(false)
  const text = typeof value === 'string' ? value : null
  const long = !!text && text.length > 420
  return (
    <div className="rounded-ctl bg-surface-overlay/60 border border-border/60 px-3 py-2.5 min-w-0">
      <p className={cn(LABEL_CLS, 'mb-1')}>{field.label}</p>
      {field.fieldType === 'TEXTAREA' && text
        ? <p className={cn('text-sm leading-relaxed text-text-primary whitespace-pre-wrap', !open && long && 'line-clamp-6')}>{text}</p>
        : renderValue(field, value)}
      {long && field.fieldType === 'TEXTAREA' && (
        <button type="button" onClick={() => setOpen(o => !o)} className="mt-1 text-xs font-medium text-brand-ink hover:underline">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

// ─── Summary tiles for tabs built in code ────────────────────────────────────

/** Tabs that can publish a header tile, in display order. */
export const TILE_TABS = ['workflow', 'evidence', 'linked-findings', 'comments']
const DEFAULT_TILE_TABS = new Set(['workflow', 'evidence', 'linked-findings'])

/**
 * Which tab tiles to show: tabs_json entries with "headerKpi" decide when any
 * entry sets it; otherwise Workflow, Evidence and Linked Findings — whichever
 * of them the record actually has as tabs.
 */
export function tileTabsFor(tabsJson, visibleTabKeys) {
  let explicit = null
  try {
    const parsed = JSON.parse(tabsJson || 'null')
    if (Array.isArray(parsed)) {
      const flagged = parsed.filter(t => t && typeof t === 'object' && typeof t.headerKpi === 'boolean')
      if (flagged.length) explicit = new Map(flagged.map(t => [t.key, t.headerKpi]))
    }
  } catch { /* malformed tabs_json — use the defaults */ }
  return TILE_TABS.filter(k => visibleTabKeys.includes(k)
    && (explicit ? explicit.get(k) === true || (!explicit.has(k) && DEFAULT_TILE_TABS.has(k)) : DEFAULT_TILE_TABS.has(k)))
}

/**
 * The workflow instance and per-step progress for a record. Shared by the
 * Workflow tab and the header tile under ONE query key, so the page fetches
 * it once.
 */
export async function fetchModuleWorkflow({ entityType, entityId, entityWorkflowId, projectInstanceId }) {
  let instanceData
  if (entityWorkflowId) {
    instanceData = await api.get(`/v1/workflow-instances/${entityWorkflowId}`)
  } else if (entityType === 'AUDIT_ENGAGEMENT' && projectInstanceId) {
    instanceData = await api.get('/v1/workflow-instances/active', {
      params: { entityType: 'AUDIT_PROJECT', entityId: projectInstanceId },
    })
  } else {
    instanceData = await api.get('/v1/workflow-instances/active', { params: { entityType, entityId } })
  }
  const inst = instanceData?.data || instanceData
  if (!inst?.id) return { instance: inst, progress: [] }
  const progressData = await api.get(`/v1/workflow-instances/${inst.id}/progress`)
  const prog = progressData?.data || progressData
  return { instance: inst, progress: Array.isArray(prog) ? prog : (prog?.data || []) }
}

// workflowInstanceId: the record's instance as the view context resolved it
// (a vendor assessment's lives on its cycle, filed under the VENDOR) — part of
// the key so the lookup re-runs once it is known.
export const moduleWorkflowKey = (entityType, entityId, projectInstanceId, workflowInstanceId) =>
  ['module-workflow', entityType, entityId, projectInstanceId ?? null, workflowInstanceId ?? null]

/** Current step, who holds it, its SLA — read off the progress rows. */
export function summariseWorkflow(wf) {
  const inst = wf?.instance
  // /progress answers [{ workflowInstanceId, totalSteps, …, steps: [...] }] —
  // the per-step rows sit one level down. Reading the wrapper as the step list
  // gave "1 step", no current step, no holders and no step guidance.
  const raw = wf?.progress || []
  const rows = raw.length === 1 && Array.isArray(raw[0]?.steps) ? raw[0].steps : raw
  const steps = [...rows].sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0))
  if (!inst?.id || steps.length === 0) return null
  const done = ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(String(inst.status || '').toUpperCase())
  const idx = steps.findIndex(s => s.isCurrentStep)
  const cur = idx >= 0 ? steps[idx] : null
  const lastIter = cur?.iterations?.[cur.iterations.length - 1]
  const holders = (lastIter?.tasks || [])
    .filter(t => (t.taskRole || 'ACTOR') === 'ACTOR' && ['PENDING', 'IN_PROGRESS'].includes(String(t.status)))
    .map(t => t.assignedUserName).filter(Boolean)
  return {
    workflowId: inst.workflowId,
    instanceId: inst.id,
    workflowName: inst.workflowName,
    status: inst.status,
    done,
    total: steps.length,
    position: idx >= 0 ? idx + 1 : null,
    stepId: cur?.stepId ?? null,
    stepName: cur?.stepName || inst.currentStepName || null,
    holders: [...new Set(holders)],
    slaDueAt: lastIter?.slaDueAt || null,
  }
}

/**
 * Data for the header tiles. Every query reuses the key its tab already uses,
 * so opening the tab afterwards costs nothing and the two never disagree.
 */
export function useHeaderTiles({ tabs = [], entityType, entityId, entity, enabled = true, withWorkflow = false, workflowInstanceId = null }) {
  const want = (k) => enabled && !!entityId && (tabs.includes(k) || (k === 'workflow' && withWorkflow))
  const projectInstanceId = entity?.projectInstanceId ?? entity?.projectSnapshot?.id ?? null

  const wfQ = useQuery({
    queryKey: moduleWorkflowKey(entityType, entityId, projectInstanceId, entity?.workflowInstanceId ?? workflowInstanceId),
    queryFn: () => fetchModuleWorkflow({ entityType, entityId, entityWorkflowId: entity?.workflowInstanceId ?? workflowInstanceId, projectInstanceId }),
    enabled: want('workflow') && (entityType !== 'AUDIT_ENGAGEMENT' || !!entity),
    staleTime: 15_000,
  })
  const docsQ = useEntityDocuments(entityType, entityId, undefined, { enabled: want('evidence') })
  const findingsQ = useQuery({
    queryKey: ['issue-linked-findings', entityId],
    queryFn: () => api.get(`/v1/issues/${entityId}/linked-findings`),
    enabled: want('linked-findings') && entityType === 'ISSUE',
  })
  const commentsQ = useQuery({
    queryKey: ['comments', entityType, entityId],
    queryFn: () => commentsApi.list(entityType, entityId),
    enabled: want('comments'),
    staleTime: 60_000,
  })

  const workflow = useMemo(() => summariseWorkflow(wfQ.data), [wfQ.data])

  const tiles = useMemo(() => {
    const out = []
    if (tabs.includes('workflow')) {
      const s = workflow
      out.push({
        key: 'workflow', label: 'Workflow', icon: GitBranch, colorTag: s?.done ? 'green' : 'purple',
        value: !s ? (wfQ.isLoading ? '…' : 'Not started') : s.done ? 'Completed' : (s.stepName || s.workflowName || 'In progress'),
        sub: !s ? null : s.done ? s.workflowName
          : `${s.position ? `step ${s.position} of ${s.total}` : `${s.total} step${s.total === 1 ? '' : 's'}`}${s.holders.length ? ` · ${s.holders.join(', ')}` : ''}`,
        summary: s,
      })
    }
    if (tabs.includes('evidence')) {
      const raw = docsQ.data
      const docs = Array.isArray(raw) ? raw : (raw?.data || [])
      const reviewed = docs.filter(d => d.reviewStatus)
      const acc = reviewed.filter(d => d.reviewStatus === 'ACCEPTED').length
      const rej = reviewed.filter(d => d.reviewStatus === 'REJECTED').length
      const pending = docs.filter(d => d.linkType === 'REMEDIATION' && !d.reviewStatus).length
      out.push({
        key: 'evidence', label: 'Evidence', icon: Paperclip,
        colorTag: rej > 0 ? 'red' : pending > 0 ? 'amber' : docs.length ? 'green' : 'gray',
        value: docsQ.isLoading ? '…' : docs.length === 0 ? 'No files' : acc ? `${acc} accepted` : `${docs.length} file${docs.length === 1 ? '' : 's'}`,
        sub: reviewed.length || pending ? `${pending} pending · ${rej} rejected` : null,
      })
    }
    if (tabs.includes('linked-findings') && entityType === 'ISSUE') {
      const raw = findingsQ.data
      const list = Array.isArray(raw) ? raw : (raw?.data || [])
      const vendor = list.filter(f => f.kind === 'VENDOR_QUESTION').length
      out.push({
        key: 'linked-findings', label: 'Linked findings', icon: AlertTriangle, colorTag: 'blue',
        value: findingsQ.isLoading ? '…' : list.length === 0 ? 'None' : `${list.length} linked`,
        sub: vendor ? `${vendor} vendor question${vendor === 1 ? '' : 's'}` : null,
      })
    }
    if (tabs.includes('comments')) {
      const raw = commentsQ.data
      const list = Array.isArray(raw) ? raw : (raw?.data || [])
      const last = list.length ? list[list.length - 1] : null
      out.push({
        key: 'comments', label: 'Comments', icon: MessageSquare, colorTag: 'gray',
        value: commentsQ.isLoading ? '…' : `${list.length} comment${list.length === 1 ? '' : 's'}`,
        sub: last?.createdAt ? `last ${new Date(last.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : null,
      })
    }
    return out
  }, [tabs, workflow, wfQ.isLoading, docsQ.data, docsQ.isLoading, findingsQ.data, findingsQ.isLoading,
      commentsQ.data, commentsQ.isLoading, entityType])

  return { tiles, workflow }
}

/**
 * The walkthrough chapter for the step a record is on — feeds "How this step
 * works". Null when the workflow has no video or the step has no chapter.
 */
export function useStepWalkthrough({ workflowId, stepId, entityType }) {
  const { data } = useQuery({
    queryKey: ['workflow-demo', workflowId],
    queryFn: () => api.get(`/v1/workflow-catalogue/${workflowId}/demo`),
    enabled: !!workflowId,
    staleTime: 10 * 60_000,
    retry: false,
  })
  const demo = data?.data || data
  if (!demo || demo.kind === 'NONE' || !stepId) return null
  const ch = (demo.chapters || []).find(c => String(c.stepId) === String(stepId))
  if (!ch || ch.startSeconds == null) return null
  return {
    seconds: ch.startSeconds,
    to: `/workflow-catalogue/${String(entityType || '').toLowerCase()}?workflow=${workflowId}&t=${ch.startSeconds}`,
  }
}