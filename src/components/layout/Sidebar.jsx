import { useState, useEffect, useRef } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, PanelLeft, PanelRight,
  LogOut, Settings, User, ShieldCheck, WifiOff, RefreshCw,
} from 'lucide-react'
import * as Icons from 'lucide-react'
import { cn } from '../../lib/cn'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useNavigation } from '../../hooks/useUIConfig'
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
    select: (d) => {
      if (typeof d === 'number') return d
      if (typeof d?.data === 'number') return d.data
      if (typeof d?.count === 'number') return d.count
      if (typeof d?.total === 'number') return d.total
      if (Array.isArray(d)) return d.length
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
    // selected preset (not just the active pill).
    panelBg:   'bg-brand-500/8',
    cardBg:    'bg-surface-raised',
    textBase:  'text-text-secondary', textActive: 'text-brand-900',
    textHover: 'text-text-primary',   bgActive:   'bg-brand-500',
    bgHover:   'hover:bg-surface-raised', iconBase: 'text-text-muted',
    iconActive:'text-brand-900',      indicator:  'bg-brand-900',
    badge:     'bg-brand-500/30 text-brand-900',
    section:   'text-text-muted',     divider:    'border-border-subtle',
    toggle:    'text-text-muted hover:text-text-primary hover:bg-surface-raised',
    name:      'text-text-primary',   subtext:    'text-text-muted',
    searchBg:  'bg-surface-overlay',
    wsCard:    'bg-brand-500/15 border-brand-500/25',
    border:    'border-border-subtle',
  }
  if (theme === 'brand') return {
    panelBg:   '',
    cardBg:    'bg-on-dark/20',
    textBase:  'text-brand-900/85',   textActive: 'text-brand-900',
    textHover: 'text-brand-900',      bgActive:   'bg-on-dark/80',
    bgHover:   'hover:bg-on-dark/30',  iconBase:  'text-brand-900/72',
    iconActive:'text-brand-900',      indicator:  'bg-brand-900',
    badge:     'bg-on-dark/70 text-brand-900',
    section:   'text-brand-900/72',   divider:    'border-brand-900/10',
    toggle:    'text-brand-900/72 hover:text-brand-900 hover:bg-on-dark/30',
    name:      'text-brand-900',      subtext:    'text-brand-900/75',
    searchBg:  'bg-on-dark/25',
    wsCard:    'bg-on-dark/25 border-on-dark/20',
    border:    'border-brand-900/10',
  }
  // Brand sidebar in DARK app mode: deep brand-800 background, so ink is the
  // LIGHT end of the scale (brand-100) — the mirror of the pastel variant.
  // Backgrounds use brand-100 at low alpha (a light tint that reads on the deep
  // bg) instead of on-dark/white, so hover/active/cards stay in-hue.
  if (theme === 'brand-dark') return {
    panelBg:   '',
    cardBg:    'bg-brand-100/10',
    // Nav text is LIGHT (brand-100) on the deep brand-800 sidebar. But the
    // ACTIVE pill is a light brand-100 tile, so its ink flips back to DARK
    // (brand-900) — contrast 7.0+ across all presets.
    textBase:  'text-brand-100/85',   textActive: 'text-brand-900',
    textHover: 'text-brand-50',       bgActive:   'bg-brand-100/90',
    bgHover:   'hover:bg-brand-100/12', iconBase:  'text-brand-100/75',
    iconActive:'text-brand-900',      indicator:  'bg-brand-100',
    badge:     'bg-brand-100/15 text-brand-100',
    section:   'text-brand-100/65',   divider:    'border-brand-100/12',
    toggle:    'text-brand-100/75 hover:text-brand-50 hover:bg-brand-100/12',
    name:      'text-brand-50',       subtext:    'text-brand-100/70',
    searchBg:  'bg-brand-100/10',
    wsCard:    'bg-brand-100/12 border-brand-100/20',
    border:    'border-brand-100/12',
  }
  return {
    panelBg:   'bg-[var(--sidebar-dark)]',
    cardBg:    'bg-on-dark/5',
    textBase:  'text-text-muted',     textActive: 'text-brand-900',
    textHover: 'text-text-primary',   bgActive:   'bg-brand-500',
    bgHover:   'hover:bg-on-dark/8',   iconBase:  'text-text-muted',
    iconActive:'text-brand-900',      indicator:  'bg-brand-900',
    badge:     'bg-status-warn-bg text-status-warn-fg',
    section:   'text-text-faint',     divider:    'border-on-dark/8',
    toggle:    'text-text-muted hover:text-text-primary hover:bg-on-dark/8',
    name:      'text-text-primary',   subtext:    'text-text-muted',
    searchBg:  'bg-on-dark/8',
    wsCard:    'bg-brand-500/15 border-brand-500/25',
    border:    'border-on-dark/8',
  }
}

// ── KashiGRC Logo Mark ────────────────────────────────────────────────────────
function KashiLogo({ size = 28, className }) {
  return (
    <div className={cn(
      'flex items-center justify-center rounded-card shrink-0',
      'bg-brand-500 text-brand-900 font-black ring-1 ring-brand-700/25 shadow-elevated',
      className
    )} style={{ width: size, height: size, fontSize: size * 0.45 }}>
      K
    </div>
  )
}

// ── NavItem ───────────────────────────────────────────────────────────────────
function NavItem({ item, depth = 0, collapsed = false, t }) {
  const location = useLocation()
  const routeMatches = (route) => {
    if (!route) return false
    // Routes may disambiguate by query string (e.g. two nav rows share
    // /module/audit_engagement but differ by ?frameworkRef=). When the nav
    // route carries a query, match the query too so only the right row is
    // active; otherwise fall back to pathname matching.
    const qIdx = route.indexOf('?')
    if (qIdx !== -1) {
      const routePath = route.slice(0, qIdx)
      const routeQuery = route.slice(qIdx)   // includes leading '?'
      if (location.pathname !== routePath) return false
      const routeParams = new URLSearchParams(routeQuery)
      const curParams = new URLSearchParams(location.search)
      for (const [k, v] of routeParams) {
        if (curParams.get(k) !== v) return false
      }
      return true
    }
    // No query on the nav route: EXACT pathname match (mirrors NavLink `end`).
    // Prefix matching (startsWith route + '/') is deliberately NOT used — it made
    // a parent-ish route like /workflow light up on /workflow/inbox, double-
    // highlighting alongside the /workflow/inbox row. Each leaf owns exactly its
    // own path.
    if (location.pathname !== route) return false
    // A framework-scoped URL (?frameworkRef=X) belongs to the framework-specific
    // sibling row (handled by the query branch above), so a plain query-less
    // route must NOT match a framework-scoped URL.
    const curFrameworkRef = new URLSearchParams(location.search).get('frameworkRef')
    if (curFrameworkRef) return false
    return true
  }
  const [open, setOpen] = useState(() => routeMatches(item.route))
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
              <NavItem key={child.navKey} item={child} depth={depth + 1} t={t} />
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
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-status-warn-bg" />
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
          'rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-brand-500 text-brand-900 ring-1 ring-brand-700/20',
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
  const grouped        = groupByModule(navItems)
  const displayName    = branding?.companyName || 'KashiGRC'

  // Glass applies ONLY to the light sidebar: over the pastel wash it reads as
  // Two-tone: the nav area sits on the recessed panel colour; the top zone and
  // footer float on t.cardBg above it. Brand mode paints via brandBg instead.
  const sidebarBg = t.panelBg

  // Brand bg — use user's saved color first, fallback to org branding
  // This ensures user's choice persists regardless of org branding changes

  const handleNavRetry = () => qc.invalidateQueries({ queryKey: ['navigation'] })
  const location = useLocation()
  const navRef = useRef(null)

  useEffect(() => {
    // NavLink sets aria-current="page" on the active link — use that instead of
    // class-based selection which also matches parent labels with font-medium
    const active = navRef.current?.querySelector('a[aria-current="page"]')
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [location.pathname])

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
              'flex items-center gap-2.5 p-1.5 rounded-card border glass-chrome',
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

        {!isLoading && !isError && Object.entries(grouped).map(([module, items]) => (
          <div key={module}>
            {!collapsed && module !== '_root' && (
              <p className={cn('px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest', t.section)}>
                {module}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map(item => (
                <NavItem key={item.navKey} item={item} collapsed={collapsed} t={t} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom user panel */}
      <SidebarUserPanel collapsed={collapsed} t={t} auth={auth} branding={branding} />
    </aside>
  )
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