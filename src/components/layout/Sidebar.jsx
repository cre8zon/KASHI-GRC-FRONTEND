import { useState, useEffect, useRef, useMemo, useSyncExternalStore, createContext, useContext } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, PanelLeft, PanelRight,
  LogOut, Settings, User, ShieldCheck, WifiOff, RefreshCw, Search, X,
} from 'lucide-react'
import * as Icons from 'lucide-react'
import { cn } from '../../lib/cn'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useNavigation } from '../../hooks/useUIConfig'
import { resolveNav } from '../../lib/navRoute'
import { useSelector } from 'react-redux'
import { useDispatch } from 'react-redux'
import { openTab } from '../../store/slices/tabsSlice'
import { selectBranding } from '../../store/slices/uiConfigSlice'
import { selectAuth } from '../../store/slices/authSlice'
import { useTheme } from '../../hooks/useTheme'
import { useLogout } from '../../hooks/useAuth'
import { Skeleton } from '../ui/EmptyState'
import { initials } from '../../utils/format'
import api from '../../config/axios.config'
import { useQuery, useQueryClient } from '@tanstack/react-query'

function NavIcon({ name, size = 16, ...props }) {
  const Icon = Icons[name] || Icons.Circle
  return <Icon size={size} strokeWidth={1.75} {...props} />
}

function useBadgeCount(endpoint) {
  const { data } = useQuery({
    queryKey: ['nav-badge', endpoint],
    queryFn:  () => api.get(endpoint),
    enabled:  !!endpoint,
    refetchInterval: 60_000,
    // Two unwraps, not one. queryFn returns the axios RESPONSE, so d.data is
    // the ApiResponse envelope and d.data.data is the value. Checking only
    // d.data meant every badge fell through to 0 — including the ones already
    // configured, which is why /v1/tenants?take=1 and the action-item counts
    // have never shown a number.
    select: (d) => {
      const body    = d?.data ?? d       // axios response -> ApiResponse
      const payload = body?.data ?? body // ApiResponse    -> the value
      if (typeof payload === 'number') return payload
      if (typeof payload?.count === 'number') return payload.count
      if (typeof payload?.total === 'number') return payload.total
      // ?take=1 list endpoints: the count is in the pagination block.
      if (typeof payload?.pagination?.totalItems === 'number') return payload.pagination.totalItems
      if (Array.isArray(payload)) return payload.length
      return 0
    },
  })
  return data ?? 0
}

// ── Fixed color tokens per sidebar theme ─────────────────────────────────────
// Completely independent of app theme CSS vars so they never clash.
function getSidebarTokens(theme) {
  // ── Two-tone panel design ──────────────────────────────────────────────
  // panelBg = the muted nav backdrop (recessed). cardBg = the top zone
  // (workspace + search) and footer, which float above it. Active item is a
  // PILL in the brand colour in every theme.

  if (theme === 'light') return {
    // Nav panel carries a faint brand wash so the whole light sidebar hints the
    // selected theme (not just the active pill).
    // Frosted chrome over the wash; the theme hue shows through the glass.
    panelBg:   'glass-chrome',
    cardBg:    'bg-surface-raised',
    textBase:  'text-text-secondary', textActive: 'text-brand-on',
    textHover: 'text-text-primary',   bgActive:   'bg-brand-500',
    bgHover:   'hover:bg-surface-raised', iconBase: 'text-text-muted',
    iconActive:'text-brand-on',       indicator:  'bg-brand-fill',
    badge:     'bg-brand-500/15 text-brand-ink',
    section:   'text-text-muted',     divider:    'border-border-subtle',
    toggle:    'text-text-muted hover:text-text-primary hover:bg-surface-raised',
    name:      'text-text-primary',   subtext:    'text-text-muted',
    searchBg:  'bg-surface-overlay',
    searchField: 'glass-field',
    wsGlass:   true,
    wsCard:    'bg-brand-500/15 border-brand-500/25',
    border:    'border-border-subtle',
  }
  // Brand sidebar in LIGHT app mode: painted brand-500. Its ink is
  // --color-brand-on, which the theme engine solves per colour — white on the
  // Kashi purple, a deep same-hue ink on the pastels. The active item is a
  // near-white pill, so its ink is the deep brand-900 in every theme.
  if (theme === 'brand') return {
    panelBg:   '',
    cardBg:    'bg-on-dark/15',
    textBase:  'text-brand-on',       textActive: 'text-brand-900',
    textHover: 'text-brand-on',       bgActive:   'bg-on-dark/90',
    bgHover:   'hover:bg-on-dark/20', iconBase:   'text-brand-on/90',
    iconActive:'text-brand-900',      indicator:  'bg-brand-900',
    badge:     'bg-on-dark/90 text-brand-900',
    section:   'text-brand-on',       divider:    'border-brand-on/15',
    toggle:    'text-brand-on/90 hover:text-brand-on hover:bg-on-dark/20',
    name:      'text-brand-on',       subtext:    'text-brand-on/85',
    searchBg:  'bg-on-dark/20',
    searchField: 'bg-on-dark/15 border border-brand-on/20 focus-within:bg-on-dark/25',
    wsCard:    'bg-on-dark/15 border-brand-on/15',
    border:    'border-brand-on/15',
  }
  // Brand sidebar in DARK app mode: deep brand-800 background with the LIGHT
  // end of the scale (brand-100) as ink. In dark mode themeEngine builds the
  // scale so 800 is a deep tone and 100 a light tint of the SAME hue (≥ 7.6:1
  // across every preset).
  if (theme === 'brand-dark') return {
    panelBg:   '',
    cardBg:    'bg-brand-100/10',
    // Active item is a soft tint + white-ish ink + indicator bar, not a
    // light tile — a bright pill was the loudest thing on a dark screen.
    textBase:  'text-brand-100',      textActive: 'text-brand-50',
    textHover: 'text-brand-50',       bgActive:   'bg-brand-100/15',
    bgHover:   'hover:bg-brand-100/10', iconBase:  'text-brand-100/85',
    iconActive:'text-brand-50',       indicator:  'bg-brand-100',
    badge:     'bg-brand-100/15 text-brand-100',
    section:   'text-brand-100/80',   divider:    'border-brand-100/12',
    toggle:    'text-brand-100/80 hover:text-brand-50 hover:bg-brand-100/10',
    name:      'text-brand-50',       subtext:    'text-brand-100/80',
    searchBg:  'bg-brand-100/10',
    searchField: 'bg-brand-100/8 border border-brand-100/15 focus-within:bg-brand-100/12',
    wsCard:    'bg-brand-100/10 border-brand-100/15',
    border:    'border-brand-100/12',
  }
  // Dark sidebar. It is dark in BOTH app themes, so its ink must be the
  // constant on-dark white — the app's text tokens are dark-on-light in light
  // mode and measured ~3:1 on this panel.
  return {
    panelBg:   'bg-[var(--sidebar-dark)]',
    cardBg:    'bg-on-dark/5',
    textBase:  'text-on-dark/80',     textActive: 'text-brand-on',
    textHover: 'text-on-dark',        bgActive:   'bg-brand-500',
    bgHover:   'hover:bg-on-dark/8',  iconBase:   'text-on-dark/65',
    iconActive:'text-brand-on',       indicator:  'bg-brand-fill',
    badge:     'bg-status-warn-bg text-status-warn-fg',
    section:   'text-on-dark/60',     divider:    'border-on-dark/8',
    toggle:    'text-on-dark/65 hover:text-on-dark hover:bg-on-dark/8',
    name:      'text-on-dark',        subtext:    'text-on-dark/60',
    searchBg:  'bg-on-dark/8',
    searchField: 'bg-on-dark/8 border border-on-dark/10 focus-within:bg-on-dark/12',
    wsCard:    'bg-on-dark/8 border-on-dark/10',
    border:    'border-on-dark/8',
  }
}

// ── KashiGuard Logo Mark ────────────────────────────────────────────────────────
function KashiLogo({ size = 28, className }) {
  return (
    <div className={cn(
      'flex items-center justify-center rounded-card shrink-0',
      'bg-brand-500 text-brand-on font-black ring-1 ring-brand-ink/25 shadow-elevated',
      className
    )} style={{ width: size, height: size, fontSize: size * 0.45 }}>
      K
    </div>
  )
}

// ── NavItem ───────────────────────────────────────────────────────────────────
/**
 * Which nav groups are expanded, remembered across reloads.
 *
 * ── WHY OPEN BY DEFAULT ────────────────────────────────────
 * The old default was routeMatches(item.route), which reads as "open the group
 * you are inside". But the group rows that have children mostly carry route: ''
 * — 'compliance' and 'audit_config' both do — so the match was never true and
 * they collapsed on every single load. Closed-by-default hides the whole
 * information architecture behind a click nobody wants to repeat.
 *
 * ── WHY undefined AND false ARE DIFFERENT ──────────────────────
 * Only keys the user has actually toggled are stored. An absent key means
 * "never touched" and opens; an explicit false stays shut. Writing every group
 * on first render would freeze today's defaults into the browser and make a
 * future change to them invisible to existing users.
 */
const NAV_OPEN_KEY = 'kashi_nav_open'

function readNavOpen() {
  try { return JSON.parse(localStorage.getItem(NAV_OPEN_KEY)) || {} } catch { return {} }
}

/**
 * ── WHY A STORE AND NOT useState ────────────────────────────
 * Each NavItem used to hold its own useState seeded from localStorage. That is
 * fine while the only thing that opens a group is a click on that same group.
 * It stops working the moment something OUTSIDE the item needs to open it —
 * which is exactly what revealing the active route after a search requires:
 * writing to localStorage from the Sidebar would change nothing on screen,
 * because every NavItem already read its value at mount and nothing tells it to
 * look again.
 *
 * One module-level object with subscribers, read through useSyncExternalStore.
 * Every NavItem sees the same state, and anyone can open a group.
 */
let navOpenState = readNavOpen()
const navOpenListeners = new Set()

function subscribeNavOpen(listener) {
  navOpenListeners.add(listener)
  return () => navOpenListeners.delete(listener)
}

function writeNavOpen(navKey, value) {
  if (navOpenState[navKey] === value) return   // no-op: don't wake every subscriber
  navOpenState = { ...navOpenState, [navKey]: value }
  try { localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(navOpenState)) } catch { /* private mode */ }
  navOpenListeners.forEach((fn) => fn())
}

function useNavOpen(navKey, forceOpen, defaultOpen = true) {
  // Returns the raw stored value — boolean or undefined — so the snapshot is a
  // primitive and useSyncExternalStore never sees a new object identity.
  const stored = useSyncExternalStore(
    subscribeNavOpen,
    () => navOpenState[navKey],
    () => undefined,
  )
  // defaultOpen only decides the UNTOUCHED case. Row groups pass nothing and
  // keep opening, as they always have; modules pass whether they are the one
  // being worked in. Either way an explicit toggle outranks it — the stored
  // boolean is checked first, so a module you closed stays closed even when
  // you are standing inside it.
  const open = stored === undefined ? defaultOpen : stored

  const setOpen = (next) =>
    writeNavOpen(navKey, typeof next === 'function' ? next(open) : next)

  // Search forces every matching group open without touching what was saved,
  // so clearing the box restores exactly the shape the user left behind.
  return [forceOpen || open, setOpen]
}

/**
 * Module headers share the nav-open store, under their own key space.
 *
 * A module is a LABEL, not a nav row, so it has no navKey of its own and
 * nothing stops a module being called the same thing as one. The prefix keeps
 * the two from ever writing over each other in one localStorage object, and
 * makes a stored key readable when you are staring at it in devtools.
 *
 * Open by default, for the same reason groups are: an absent key means "never
 * touched". Only a module the user has actually collapsed is written down, so
 * changing which modules ship open stays possible later.
 */
const MODULE_KEY_PREFIX = 'module:'
const moduleKey = (module) => MODULE_KEY_PREFIX + module

/**
 * The module containing the row that is currently lit up, or null.
 *
 * Walks children too, because the active row is often nested — a Policies row
 * two levels down still belongs to the 'compliance' module at the top. Matches
 * on navKey first (the resolver's own answer) and falls back to route, which
 * covers the scope-less URLs where resolveNav returns an openKey but no single
 * winning row.
 */
function moduleOfActive(grouped, openKey, route) {
  const hits = (item) =>
    (openKey && item.navKey === openKey)
    || (route && item.route === route)
    || (item.children || []).some(hits)

  for (const [module, items] of Object.entries(grouped)) {
    if (module === '_root') continue
    if (items.some(hits)) return module
  }
  return null
}

/**
 * The navKey of the group containing the route currently being viewed.
 *
 * Compares pathname AND the query string, because two nav rows can share a path
 * and differ only by ?frameworkRef= — matching on pathname alone would reveal
 * whichever of them happened to come first.
 */
/**
 * The ONE nav route that is active, and the group to open — both from
 * lib/navRoute, which is shared with RouteSync so the highlight and the tab
 * title can never disagree.
 *
 * What used to live here was a local copy of that logic, and before that a
 * per-row EXACT pathname match. The exact match is why nothing highlighted the
 * moment you opened anything: /module/vendor_assessment/74 and /chat/5 match no
 * nav row. Prefix matching was deliberately rejected in the old comment,
 * because /workflow would then light up next to /workflow/inbox — correct
 * reasoning, wrong place for the fix. A row cannot tell on its own whether a
 * longer row also matches; only something looking at the whole tree can, which
 * is what the resolver does.
 *
 * It also reads the hidden (is_active = 0) detail rows the backend returns on
 * purpose, so /audit/policies/7/edit finds "Policy Editor" and climbs its
 * parent_key to the Policies row. See lib/navRoute for the whole rule set.
 */
const ActiveNavRouteContext = createContext(null)

function NavItem({ item, depth = 0, collapsed = false, t, forceOpen = false }) {
  // One winner for the whole tree, resolved once in Sidebar and handed down. A
  // row is active when it IS that winner — a string comparison, not a rule, so
  // two rows can never both think they are selected.
  const activeRoute = useContext(ActiveNavRouteContext)
  const routeMatches = (route) => !!route && route === activeRoute
  const [open, setOpen] = useNavOpen(item.navKey, forceOpen)
  const hasChildren = item.children?.length > 0

  if (hasChildren) {
    const isActive = routeMatches(item.route)
    if (collapsed) return null
    return (
      <div>
        <div className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-card text-sm transition-all group',
          isActive ? cn(t.bgActive, t.textActive, 'font-semibold shadow-elevated') : cn(t.textBase, t.bgHover),
          depth > 0 && 'pl-8'
        )}>
          {item.icon && <NavIcon name={item.icon} className={isActive ? t.iconActive : t.iconBase} />}
          {/* Label — navigates to route if one exists, otherwise toggles */}
          {item.route ? (
            <NavLink to={item.route} end className="flex-1 text-left font-medium truncate">
              {item.label}
            </NavLink>
          ) : (
            <button onClick={() => setOpen(o => !o)} className="flex-1 text-left font-medium truncate">
              {item.label}
            </button>
          )}
          {/* Chevron — always toggles submenu */}
          <button onClick={() => setOpen(o => !o)} className="shrink-0 p-0.5 rounded hover:bg-on-dark/10">
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        </div>
        {open && (
          <div className={cn('ml-2 pl-2 my-1 space-y-0.5 border-l', t.divider)}>
            {/* is_active must be honoured at every depth. groupByModule applies
                it to top-level items only, so before this a child with
                is_active = 0 still rendered — which is why hiding a nav entry
                appeared to work for some items and not others. The backend
                deliberately returns inactive items (UiConfigServiceImpl: task
                nav entries rely on it), so the filter has to live here. */}
            {item.children.filter(child => child.isActive !== false).map(child => (
              <NavItem key={child.navKey} item={child} depth={depth + 1} t={t} forceOpen={forceOpen} />
            ))}
          </div>
        )}
      </div>
    )
  }

  const badgeCount = useBadgeCount(item.badgeCountEndpoint || null)

  const dispatch = useDispatch()
  const handleClick = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      dispatch(openTab({ route: item.route, title: item.label, icon: item.icon }))
    }
  }

  // Query-aware active state. React Router's NavLink isActive matches on
  // pathname only, so two rows sharing /module/audit_finding but differing by
  // ?frameworkRef= both light up. Compute active ourselves via routeMatches
  // (which compares the query too) and ignore NavLink's own isActive.
  const active = routeMatches(item.route)
  return (
    <NavLink to={item.route} end title={collapsed ? item.label : undefined}
      onClick={handleClick}
      // Our own marker for "this is the highlighted row". NavLink's
      // aria-current is pathname-only and `end`-exact, so on a sub-route it
      // lands on nothing and on two rows sharing a path it lands on both —
      // neither matches what the person sees. The scroll-into-view below
      // targets this instead.
      data-nav-active={active ? 'true' : undefined}
      className={cn(
        'flex items-center rounded-card text-sm transition-all group relative',
        collapsed ? 'justify-center w-9 h-9 mx-auto p-0' : 'gap-2.5 px-3 py-2',
        active ? cn(t.bgActive, t.textActive, 'font-semibold shadow-elevated') : cn(t.textBase, t.bgHover),
        depth > 0 && !collapsed && 'pl-6'
      )}>
      <>
        {item.icon && (
          <NavIcon name={item.icon} size={collapsed ? 18 : 15}
            className={active ? t.iconActive : t.iconBase} />
        )}
        {!collapsed && <span className="flex-1">{item.label}</span>}
        {badgeCount > 0 && !collapsed && (
          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center', t.badge)}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
        {badgeCount > 0 && collapsed && (
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-status-warn-fg" />
        )}
      </>
    </NavLink>
  )
}

// ── Bottom user panel ─────────────────────────────────────────────────────────
function SidebarUserPanel({ collapsed, t, auth, branding }) {
  const navigate         = useNavigate()
  const { mutate: doLogout } = useLogout()
  const [open, setOpen]  = useState(false)
  const panelRef = useClickOutside(() => setOpen(false), open)
  const { fullName, email, tenantName, vendorName, vendorId, roles } = auth
  const primaryRole      = roles?.[0]
  const roleName         = primaryRole?.roleName?.replace(/_/g, ' ') || ''
  const isVendor         = vendorId != null

  return (
    <div ref={panelRef} className={cn('shrink-0 relative', t.userBg)}>
      {/* Popup menu */}
      {open && !collapsed && (
        <div className={cn(
          'absolute bottom-full left-2 right-2 mb-1 rounded-card border shadow-elevated z-50 overflow-hidden',
          t.border,
          'bg-surface-raised' // menu always uses app theme
        )}>
          {[
            { icon: User,       label: 'Profile',  action: () => navigate('/settings') },
            { icon: Settings,   label: 'Settings', action: () => navigate('/settings?tab=display') },
            { icon: ShieldCheck,label: 'Security', action: () => navigate('/settings?tab=security') },
            { icon: LogOut,     label: 'Sign out', action: doLogout, danger: true },
          ].map(item => (
            <button key={item.label}
              onClick={() => { item.action(); setOpen(false) }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors',
                item.danger
                  ? 'text-status-fail-fg hover:bg-status-fail-bg'
                  : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
              )}>
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center transition-colors',
          collapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-3',
          t.userHover
        )}>
        {/* Avatar */}
        <div className={cn(
          'rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-brand-500 text-brand-900 ring-1 ring-brand-ink/20',
          collapsed ? 'w-8 h-8' : 'w-7 h-7'
        )}>
          {initials(fullName)}
        </div>

        {/* Info — hidden when collapsed */}
        {!collapsed && (
          <div className="flex-1 min-w-0 text-left">
            <p className={cn('text-xs font-semibold truncate', t.name)}>
              {fullName}
            </p>
            <p className={cn('text-[10px] truncate', t.subtext)}>
              {isVendor && vendorName ? vendorName : (tenantName || email)}
            </p>
          </div>
        )}

        {!collapsed && (
          <ChevronDown size={12} className={cn('shrink-0 transition-transform', t.subtext, open && 'rotate-180')} />
        )}
      </button>
    </div>
  )
}

// ── Nav Error State ───────────────────────────────────────────────────────────
// Shown when navigation fails to load (server down, network error).
// Replaces the empty dark sidebar so users know why there's nothing there.
function NavErrorState({ collapsed, t, effectiveTheme, onRetry }) {
  if (collapsed) {
    // Collapsed: just show a WifiOff icon with a click-to-retry tooltip
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <button onClick={onRetry} title="Server unreachable — click to retry"
          className={cn('w-9 h-9 flex items-center justify-center rounded-card transition-colors', t.bgHover)}>
          <WifiOff size={16} className="text-status-fail-fg" />
        </button>
      </div>
    )
  }
  return (
    <div className={cn(
      'mx-3 mt-2 px-3 py-3 rounded-card border text-xs',
      effectiveTheme === 'light'
        ? 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg'
        : 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg'
    )}>
      <div className="flex items-center gap-2 font-semibold mb-1">
        <WifiOff size={12} />
        Server unreachable
      </div>
      <p className={cn('leading-relaxed',
        effectiveTheme === 'light' ? 'text-status-fail-fg' : 'text-status-fail-fg'
      )}>
        Navigation couldn't load. The backend may be starting up.
      </p>
      <button onClick={onRetry}
        className={cn(
          'mt-2.5 flex items-center gap-1.5 text-[11px] font-medium',
          'underline underline-offset-2 hover:no-underline transition-colors',
          effectiveTheme === 'light' ? 'text-status-fail-fg' : 'text-status-fail-fg'
        )}>
        <RefreshCw size={10} />
        Retry
      </button>
    </div>
  )
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────
/**
 * One module and its rows, with the header as the collapse control.
 *
 * ── WHY THE MODULE AND NOT THE ROWS ────────────────────────────
 * NavItem already collapses a row's own children. That does nothing for a
 * tenant with every module switched on, where the long tail is not depth but
 * the number of top-level rows: Risk, Exception and TPRM alone put a dozen
 * links on screen before anything is expanded. Collapsing at the module is the
 * only cut that shortens that list.
 *
 * ── WHY _root AND THE COLLAPSED RAIL ARE UNCHANGED ─────────────
 * _root is the ungrouped set at the top and has no header to click. The
 * collapsed rail is 56px of icons with no room for one, and hiding rows behind
 * an invisible toggle there would lose them entirely. Both render exactly what
 * they rendered before.
 *
 * Search passes forceOpen, so a query reveals matches inside collapsed modules
 * without writing anything; clearing the box restores what the user left.
 */
function ModuleSection({ module, items, collapsed, t, searching, activeModule }) {
  // CLOSED BY DEFAULT, EXCEPT WHERE YOU ARE.
  //
  // Opening everything on first load defeats the point: the nav is long
  // because every module is switched on, and a tenant would have to collapse
  // seven of them by hand before seeing any benefit. Closed by default makes
  // the short list the starting state.
  //
  // The exception is the module holding the row you are on. Without it you
  // land on a page and the sidebar shows no trace of where that page lives.
  //
  // This is a DEFAULT, not a force — unlike search below. Force-opening the
  // active module would make its header refuse to close while you worked in
  // it, which is the one place you are most likely to want the space.
  const [open, setOpen] = useNavOpen(
    moduleKey(module), searching, module === activeModule)

  const rows = (
    <div className="space-y-0.5">
      {items.map(item => (
        <NavItem key={item.navKey} item={item} collapsed={collapsed} t={t} forceOpen={searching} />
      ))}
    </div>
  )

  if (collapsed || module === '_root') return <div>{rows}</div>

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title={open ? `Collapse ${module}` : `Expand ${module}`}
        className={cn(
          'w-full flex items-center gap-1.5 px-3 pb-1 rounded-card',
          'text-[10px] font-semibold uppercase tracking-widest text-left',
          'opacity-80 hover:opacity-100 transition-opacity',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-current',
          t.section
        )}
      >
        <ChevronRight
          size={10}
          className={cn('shrink-0 transition-transform duration-200', open && 'rotate-90')}
        />
        <span className="flex-1 truncate">{module}</span>
        {/* The count only while closed — it says what was put away, and
            disappears when the rows themselves answer the question. */}
        {!open && (
          <span className="shrink-0 tabular-nums font-medium normal-case tracking-normal opacity-70">
            {items.length}
          </span>
        )}
      </button>
      {open && rows}
    </div>
  )
}

export function Sidebar({ collapsed, onToggle }) {
  const qc = useQueryClient()
  const { data: navItems = [], isLoading, isError } = useNavigation()
  const branding       = useSelector(selectBranding)
  const auth           = useSelector(selectAuth)

  // useState so React re-renders when sidebar theme changes
  // useEffect listens for 'kashi-sidebar-changed' custom event fired by:
  //   1. SettingsPage on Save Preferences
  //   2. useUIConfig bootstrap after fetching preferences from DB
  const [sidebarPref, setSidebarPref] = useState(() => {
    const val = (() => { try { return localStorage.getItem('kashi_sidebar_theme') } catch { return null } })()
    // initialized from localStorage
    return val
  })

  useEffect(() => {
    // listening for sidebar theme changes
    const handler = () => {
      const val = (() => { try { return localStorage.getItem('kashi_sidebar_theme') } catch { return null } })()
      // update sidebar theme
      setSidebarPref(val)
    }
    window.addEventListener('kashi-sidebar-changed', handler)
    return () => window.removeEventListener('kashi-sidebar-changed', handler)
  }, [])

  // Track the APP theme (data-theme on <html>) reactively, so the brand sidebar
  // switches to its deep dark variant the instant the user toggles dark mode —
  // not only on next full render. A MutationObserver on the attribute is the
  // reliable cross-path trigger (Settings toggle, system change, boot).
  const [appTheme, setAppTheme] = useState(() => {
    try { return document.documentElement.getAttribute('data-theme') || 'light' } catch { return 'light' }
  })
  useEffect(() => {
    const el = document.documentElement
    const read = () => { try { setAppTheme(el.getAttribute('data-theme') || 'light') } catch {} }
    const obs = new MutationObserver(read)
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    // Also follow OS changes when in 'system' mode.
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener?.('change', read)
    return () => { obs.disconnect(); mq?.removeEventListener?.('change', read) }
  }, [])

  // If brand theme but branding not loaded yet:
  // - If user has a saved sidebar color in localStorage → keep 'brand' so brandBg renders correctly
  // - If no saved color at all → fall back to 'dark' temporarily
  // This ensures server-down state shows the user's chosen color, not hardcoded dark blue.
  const hasSavedColor = (() => {
    try { const c = localStorage.getItem('kashi_sidebar_color'); return !!c && c.length > 0 } catch { return false }
  })()
  const baseTheme = (!branding && sidebarPref === 'brand' && !hasSavedColor)
    ? 'dark'
    : (sidebarPref || branding?.sidebarTheme || 'brand')
  // When the app is in DARK mode and the sidebar is Brand, use a dedicated
  // 'brand-dark' variant: a DEEP brand shade (brand-800) with LIGHT ink, so the
  // sidebar belongs to the dark environment instead of glowing as a bright
  // pastel panel. brand-800 is the deepest shade that still reads as clearly
  // branded while clearing WCAG AA (worst case 4.77 across all 12 presets).
  const appIsDark = (() => {
    if (appTheme === 'dark') return true
    if (appTheme === 'system') {
      try { return window.matchMedia?.('(prefers-color-scheme: dark)').matches } catch { return false }
    }
    return false
  })()
  const effectiveTheme = (baseTheme === 'brand' && appIsDark) ? 'brand-dark' : baseTheme

  // Brand sidebars paint from the LIVE brand scale via CSS vars, so they follow
  // presets / tenant branding / live-preview automatically. Light-brand uses
  // brand-500 (pastel) + dark ink; dark-brand uses brand-800 (deep) + light ink.
  const brandBg =
    effectiveTheme === 'brand'      ? { backgroundColor: 'rgb(var(--color-brand-500))' }
    : effectiveTheme === 'brand-dark' ? { backgroundColor: 'rgb(var(--color-brand-800))' }
    : undefined
  const t              = getSidebarTokens(effectiveTheme)
  // Memoised on navItems because three things now key off its identity: the
  // `visible` memo, the group-open effect, and the active-route memo. Rebuilt
  // every render it defeated all three — `visible` recomputed, and the effect
  // (which has `grouped` in its deps) re-ran and queued a scrollIntoView on
  // every single render of the sidebar. navItems is query data and stable
  // between fetches, so this is the identity the dependents actually wanted.
  const grouped        = useMemo(() => groupByModule(navItems), [navItems])
  const [navQuery, setNavQuery] = useState('')
  const visible        = useMemo(() => filterNav(grouped, navQuery), [grouped, navQuery])
  const searching      = navQuery.trim().length > 0
  const searchRef      = useRef(null)
  const displayName    = branding?.companyName || 'KashiGuard'

  // Glass applies ONLY to the light sidebar: over the pastel wash it reads as
  // Two-tone: the nav area sits on the recessed panel colour; the top zone and
  // footer float on t.cardBg above it. Brand mode paints via brandBg instead.
  const sidebarBg = t.panelBg

  // Brand bg — use user's saved color first, fallback to org branding
  // This ensures user's choice persists regardless of org branding changes

  const handleNavRetry = () => qc.invalidateQueries({ queryKey: ['navigation'] })
  const location = useLocation()
  const navRef = useRef(null)

  // Resolved from navItems — the RAW tree — not from `grouped` or `visible`.
  //
  // That distinction is the whole point. groupByModule drops every is_active = 0
  // row, and those hidden rows are exactly the detail-route registry the
  // resolver needs: "Policy Editor" /audit/policies/:id/edit, "Vendor Detail"
  // /tprm/vendors/:id, "Engagement Detail" /audit/engagements/:id. Resolving
  // against the filtered tree would throw away the only data that maps a detail
  // URL back to its sidebar row.
  //
  // Using navItems rather than `visible` also means filtering the sidebar with
  // the search box cannot change which row is highlighted.
  const nav = useMemo(
    () => resolveNav(navItems, location),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navItems, location.pathname, location.search],
  )
  const activeNavRoute = nav?.route || null

  useEffect(() => {
    // Open the group containing the route we just landed on, then scroll to it.
    //
    // This is what makes searching usable end to end: you type, click a result,
    // and clear the box — and the sidebar shows you where you are rather than
    // snapping back to the shape it had before you searched. The group is
    // genuinely opened (and remembered), not force-opened, because you are now
    // working inside it.
    //
    // openKey comes from the resolver, so the group that opens is by
    // construction the group holding the row that lit up — they cannot drift
    // apart. It is also set when NOTHING is highlighted: on a scope-less URL
    // like /module/audit_engagement/7, where two framework rows both match the
    // path and neither can be proved right, the group opens so you can see the
    // neighbourhood even though no single row is marked.
    if (nav?.openKey) writeNavOpen(nav.openKey, true)

    // After the state write, so the row exists in the DOM before we scroll.
    // data-nav-active is the row we highlighted; aria-current is NavLink's own
    // pathname-only guess and is kept only as a fallback for the group-header
    // links, which are plain NavLinks.
    const raf = requestAnimationFrame(() => {
      const active = navRef.current?.querySelector('[data-nav-active="true"]')
        || navRef.current?.querySelector('a[aria-current="page"]')
      active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, activeNavRoute])

  /**
   * The module holding the active row — ModuleSection opens it by default.
   *
   * Deliberately NOT written to the store. Persisting it would mean every
   * module you ever visited ends up recorded as open, and the nav creeps back
   * to the length this change set out to cut. Derived each render instead, so
   * only the module you are in right now opens itself, and only until you go
   * somewhere else.
   */
  const activeModule = useMemo(
    () => moduleOfActive(grouped, nav?.openKey, activeNavRoute),
    [grouped, nav, activeNavRoute],
  )

  return (
    <aside
      className={cn(
        // Floating chrome: margin + radius + shadow lets the pastel wash run
        // behind and around the bar, which is what makes the glass read.
        'flex flex-col transition-all duration-300 ease-in-out',
        'm-2 rounded-card overflow-hidden shadow-elevated h-[calc(100%-1rem)]',
        sidebarBg,
        collapsed ? 'w-14' : 'w-60'
      )}
      style={brandBg}
    >

      {/* Header — H3 workspace card: frosted, brand-tinted, with the collapse
          toggle inside the same container (one unified block). */}
      <div className={cn('shrink-0', collapsed ? 'px-2 py-2' : 'p-2.5')}>
        {collapsed ? (
          <button onClick={onToggle} title="Expand sidebar"
            className={cn('mx-auto h-9 w-9 flex items-center justify-center rounded-ctl transition-colors', t.toggle)}>
            <PanelLeft size={18} />
          </button>
        ) : (
          <div
            className={cn(
              // Frosted glass only on the LIGHT sidebar. glass-chrome paints a
              // white/78% fill that outranks t.wsCard, which put white
              // workspace text on a near-white card in the dark and brand
              // sidebars.
              'flex items-center gap-2.5 p-1.5 rounded-card border',
              t.wsGlass && 'glass-chrome',
              t.wsCard
            )}
            title={`${displayName} · ${auth?.tenantName || 'Workspace'}`}
          >
            {branding?.logoUrl
              ? <img src={branding.logoUrl} alt={displayName}
                  className="w-7 h-7 rounded-ctl object-contain shrink-0" />
              : <KashiLogo size={28} className="shrink-0" />}
            <div className="flex-1 min-w-0 text-left">
              <div className={cn('text-[12.5px] font-bold leading-tight truncate', t.name)}>
                {displayName}
              </div>
              <div className={cn('text-[9.5px] leading-tight truncate', t.subtext)}>
                {auth?.tenantName || 'Workspace'}
              </div>
            </div>
            <button onClick={onToggle} title="Collapse sidebar"
              className={cn('h-7 w-7 flex items-center justify-center rounded-ctl transition-colors shrink-0', t.toggle)}>
              <PanelLeft size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Search — hidden while collapsed, where there is no room for results */}
      {!collapsed && !isLoading && !isError && (
        <div className="shrink-0 px-2.5 pb-2">
          {/* glass-field rather than the flat t.searchBg. It is the token built
              for inputs — blur, a focus-within state, a solid @supports
              fallback and a solid print rule — and it makes this read as a
              sibling of the workspace card above it instead of a painted
              rectangle sitting on the panel. */}
          <div className={cn('flex items-center gap-2 h-8 px-2.5 rounded-ctl', t.searchField)}>
            <Search size={13} className={cn('shrink-0', t.subtext)} />
            <input
              ref={searchRef}
              /* type="text", NOT type="search". Chrome and Edge render their
                 own clear button inside a search input, which lands next to
                 ours and gives the field two X's doing the same thing. The
                 -webkit-search-cancel-button rule that hides it is a no-op in
                 Firefox and Safari, so the input type carries the fix instead
                 of the stylesheet. */
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setNavQuery(''); e.currentTarget.blur() } }}
              placeholder="Search menu"
              aria-label="Search navigation"
              className={cn(
                'w-full min-w-0 bg-transparent border-0 p-0 text-[12.5px] focus:outline-none focus:ring-0',
                t.textBase, 'placeholder:text-current placeholder:opacity-80'
              )}
            />
            {searching && (
              <button type="button" onClick={() => { setNavQuery(''); searchRef.current?.focus() }}
                      aria-label="Clear search"
                      className={cn('shrink-0 transition-opacity hover:opacity-100 opacity-70', t.subtext)}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav ref={navRef} className={cn('flex-1 overflow-y-auto py-3 space-y-4 min-h-0', collapsed ? 'px-1.5' : 'px-2.5')}>
        {isLoading && (
          <div className={cn('space-y-1 px-2', collapsed && 'px-1.5')}>
            {!collapsed && (
              <div className={cn('h-2 w-16 rounded mb-3 mx-1 animate-pulse',
                (effectiveTheme === 'brand' || effectiveTheme === 'brand-dark') ? 'bg-on-dark/10' : effectiveTheme === 'light' ? 'bg-surface-inset' : 'bg-on-dark/5'
              )} />
            )}
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className={cn(
                'flex items-center gap-2.5 rounded-card',
                collapsed ? 'justify-center w-9 h-9 mx-auto' : 'px-3 py-2 h-9'
              )}>
                <div className={cn(
                  'rounded-ctl shrink-0 animate-pulse',
                  collapsed ? 'w-5 h-5' : 'w-4 h-4',
                  (effectiveTheme === 'brand' || effectiveTheme === 'brand-dark') ? 'bg-on-dark/15' : effectiveTheme === 'light' ? 'bg-surface-inset' : 'bg-on-dark/8'
                )} style={{ animationDelay: `${i * 80}ms` }} />
                {!collapsed && (
                  <div className={cn(
                    'h-2.5 rounded-full animate-pulse flex-1',
                    (effectiveTheme === 'brand' || effectiveTheme === 'brand-dark') ? 'bg-on-dark/10' : effectiveTheme === 'light' ? 'bg-surface-overlay' : 'bg-on-dark/5',
                    i % 3 === 0 ? 'max-w-[60%]' : i % 3 === 1 ? 'max-w-[80%]' : 'max-w-[70%]'
                  )} style={{ animationDelay: `${i * 80 + 40}ms` }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── NEW: server error state — replaces empty dark sidebar ── */}
        {isError && !isLoading && (
          <NavErrorState
            collapsed={collapsed}
            t={t}
            effectiveTheme={effectiveTheme}
            onRetry={handleNavRetry}
          />
        )}

        {!isLoading && !isError && (
          <ActiveNavRouteContext.Provider value={activeNavRoute}>
            {Object.entries(visible).map(([module, items]) => (
              <ModuleSection
                key={module}
                module={module}
                items={items}
                collapsed={collapsed}
                t={t}
                searching={searching}
                activeModule={activeModule}
              />
            ))}
          </ActiveNavRouteContext.Provider>
        )}

        {!isLoading && !isError && searching && Object.keys(visible).length === 0 && (
          <p className={cn('px-3 py-6 text-center text-[12px]', t.subtext)}>
            Nothing matches “{navQuery}”.
          </p>
        )}
      </nav>

      {/* Bottom user panel */}
      <SidebarUserPanel collapsed={collapsed} t={t} auth={auth} branding={branding} />
    </aside>
  )
}

/**
 * Filter the grouped nav by a free-text query.
 *
 * Three things match, in the order someone would expect them to:
 *
 *   the module heading  — "audit" keeps everything under AUDIT CONFIG
 *   a top-level label   — keeps that item and all of its children
 *   a child label       — keeps the parent, narrowed to the matching children
 *
 * The third case is the one that matters. Keeping a matched child but dropping
 * its parent would show a leaf with no context; keeping the parent with all its
 * siblings would bury the thing you searched for. So the parent stays and its
 * children are filtered.
 *
 * Inactive rows are excluded here as well as in NavItem — search must not
 * surface a route that is deliberately hidden.
 */
function filterNav(groups, query) {
  const q = query.trim().toLowerCase()
  if (!q) return groups

  const hit = (text) => (text || '').toLowerCase().includes(q)
  const out = {}

  for (const [module, items] of Object.entries(groups)) {
    const moduleHit = module !== '_root' && hit(module)
    const kept = []

    for (const item of items) {
      const children = (item.children || []).filter(c => c.isActive !== false)
      if (moduleHit || hit(item.label)) { kept.push(item); continue }

      const matchingChildren = children.filter(c => hit(c.label))
      if (matchingChildren.length) kept.push({ ...item, children: matchingChildren })
    }

    if (kept.length) out[module] = kept
  }
  return out
}

function groupByModule(items) {
  const groups = {}
  for (const item of items) {
    // Top level only — children are filtered where they render, in NavItem.
    if (!item.isActive) continue
    const key = item.module || '_root'
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return groups
}