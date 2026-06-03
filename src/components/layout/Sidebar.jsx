import { useState, useEffect, useRef } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen,
  LogOut, Settings, User, ShieldCheck, WifiOff, RefreshCw,
} from 'lucide-react'
import * as Icons from 'lucide-react'
import { cn } from '../../lib/cn'
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
  if (theme === 'light') return {
    textBase:  'text-gray-500',   textActive: 'text-gray-900',
    textHover: 'text-gray-700',   bgActive:   'bg-gray-100',
    bgHover:   'hover:bg-gray-100', iconBase:  'text-gray-400',
    iconActive:'text-brand-600',  indicator:  'bg-brand-600',
    badge:     'bg-gray-200 text-gray-600',
    section:   'text-gray-400',   divider:    'border-gray-200',
    toggle:    'text-gray-400 hover:text-gray-900 hover:bg-gray-100',
    name:      'text-gray-900',   subtext:    'text-gray-500',
    userBg:    'bg-gray-50 border-t border-gray-200',
    userHover: 'hover:bg-gray-100',
    border:    'border-gray-200',
  }
  if (theme === 'brand') return {
    textBase:  'text-white/70',   textActive: 'text-white',
    textHover: 'text-white',      bgActive:   'bg-white/20',
    bgHover:   'hover:bg-white/10', iconBase:  'text-white/50',
    iconActive:'text-white',      indicator:  'bg-white',
    badge:     'bg-white/20 text-white',
    section:   'text-white/40',   divider:    'border-white/15',
    toggle:    'text-white/60 hover:text-white hover:bg-white/10',
    name:      'text-white',      subtext:    'text-white/60',
    userBg:    'bg-black/20 border-t border-white/10',
    userHover: 'hover:bg-white/10',
    border:    'border-white/10',
  }
  // dark (default)
  return {
    textBase:  'text-slate-400',  textActive: 'text-slate-100',
    textHover: 'text-slate-200',  bgActive:   'bg-white/10',
    bgHover:   'hover:bg-white/5', iconBase:  'text-slate-500',
    iconActive:'text-brand-400',  indicator:  'bg-brand-400',
    badge:     'bg-amber-500/20 text-amber-400',
    section:   'text-slate-600',  divider:    'border-white/8',
    toggle:    'text-slate-500 hover:text-slate-200 hover:bg-white/5',
    name:      'text-slate-100',  subtext:    'text-slate-500',
    userBg:    'bg-black/20 border-t border-white/8',
    userHover: 'hover:bg-white/5',
    border:    'border-white/8',
  }
}

// ── KashiGRC Logo Mark ────────────────────────────────────────────────────────
function KashiLogo({ size = 28, className }) {
  return (
    <div className={cn(
      'flex items-center justify-center rounded-lg shrink-0',
      'bg-brand-500 text-white font-black',
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
    return location.pathname === route ||
           location.pathname.startsWith(route + '/')
  }
  const [open, setOpen] = useState(() => routeMatches(item.route))
  const hasChildren = item.children?.length > 0

  if (hasChildren) {
    const isActive = routeMatches(item.route)
    if (collapsed) return null
    return (
      <div>
        <div className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all group',
          isActive ? t.textActive : cn(t.textBase, t.bgHover),
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
          <button onClick={() => setOpen(o => !o)} className="shrink-0 p-0.5 rounded hover:bg-white/10">
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        </div>
        {open && (
          <div className={cn('ml-2 pl-2 my-1 space-y-0.5 border-l', t.divider)}>
            {item.children.map(child => (
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

  return (
    <NavLink to={item.route} end title={collapsed ? item.label : undefined}
      onClick={handleClick}
      className={({ isActive }) => cn(
        'flex items-center rounded-lg text-sm transition-all group relative',
        collapsed ? 'justify-center w-9 h-9 mx-auto p-0' : 'gap-2.5 px-3 py-2',
        isActive ? cn(t.bgActive, t.textActive, 'font-medium') : cn(t.textBase, t.bgHover),
        depth > 0 && !collapsed && 'pl-6'
      )}>
      {({ isActive }) => <>
        {isActive && !collapsed && (
          <span className={cn('absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r', t.indicator)} />
        )}
        {item.icon && (
          <NavIcon name={item.icon} size={collapsed ? 18 : 15}
            className={isActive ? t.iconActive : t.iconBase} />
        )}
        {!collapsed && <span className="flex-1">{item.label}</span>}
        {badgeCount > 0 && !collapsed && (
          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center', t.badge)}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
        {badgeCount > 0 && collapsed && (
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
        )}
      </>}
    </NavLink>
  )
}

// ── Bottom user panel ─────────────────────────────────────────────────────────
function SidebarUserPanel({ collapsed, t, auth, branding }) {
  const navigate         = useNavigate()
  const { mutate: doLogout } = useLogout()
  const [open, setOpen]  = useState(false)
  const { fullName, email, tenantName, vendorName, vendorId, roles } = auth
  const primaryRole      = roles?.[0]
  const roleName         = primaryRole?.roleName?.replace(/_/g, ' ') || ''
  const isVendor         = vendorId != null

  return (
    <div className={cn('shrink-0 relative', t.userBg)}>
      {/* Popup menu */}
      {open && !collapsed && (
        <div className={cn(
          'absolute bottom-full left-2 right-2 mb-1 rounded-xl border shadow-elevated z-50 overflow-hidden',
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
                  ? 'text-red-400 hover:bg-red-500/10'
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
          'rounded-lg flex items-center justify-center text-xs font-bold shrink-0 bg-brand-500/20 text-brand-300',
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
          className={cn('w-9 h-9 flex items-center justify-center rounded-lg transition-colors', t.bgHover)}>
          <WifiOff size={16} className="text-red-400/70" />
        </button>
      </div>
    )
  }
  return (
    <div className={cn(
      'mx-3 mt-2 px-3 py-3 rounded-lg border text-xs',
      effectiveTheme === 'light'
        ? 'bg-red-50 border-red-200 text-red-700'
        : 'bg-red-500/10 border-red-500/20 text-red-400'
    )}>
      <div className="flex items-center gap-2 font-semibold mb-1">
        <WifiOff size={12} />
        Server unreachable
      </div>
      <p className={cn('leading-relaxed',
        effectiveTheme === 'light' ? 'text-red-600' : 'text-red-400/70'
      )}>
        Navigation couldn't load. The backend may be starting up.
      </p>
      <button onClick={onRetry}
        className={cn(
          'mt-2.5 flex items-center gap-1.5 text-[11px] font-medium',
          'underline underline-offset-2 hover:no-underline transition-colors',
          effectiveTheme === 'light' ? 'text-red-700' : 'text-red-400'
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

  // If brand theme but branding not loaded yet:
  // - If user has a saved sidebar color in localStorage → keep 'brand' so brandBg renders correctly
  // - If no saved color at all → fall back to 'dark' temporarily
  // This ensures server-down state shows the user's chosen color, not hardcoded dark blue.
  const hasSavedColor = (() => {
    try { const c = localStorage.getItem('kashi_sidebar_color'); return !!c && c.length > 0 } catch { return false }
  })()
  const effectiveTheme = (!branding && sidebarPref === 'brand' && !hasSavedColor)
    ? 'dark'
    : (sidebarPref || branding?.sidebarTheme || 'brand')
  const t              = getSidebarTokens(effectiveTheme)
  const grouped        = groupByModule(navItems)
  const displayName    = branding?.companyName || 'KashiGRC'

  const sidebarBg =
    effectiveTheme === 'light' ? 'bg-white'
    : effectiveTheme !== 'brand' ? 'bg-[#0a0f1e]'
    : ''

  // Brand bg — use user's saved color first, fallback to org branding
  // This ensures user's choice persists regardless of org branding changes
  const brandBg = (() => {
    if (effectiveTheme !== 'brand') return undefined
    // User's saved color takes priority over org branding
    const userColor = (() => { try { return localStorage.getItem('kashi_sidebar_color') } catch { return null } })()
    const hex = (userColor || branding?.primaryColor || '').replace('#', '')
    if (hex.length !== 6) return { backgroundColor: 'rgb(15 23 42)' }
    const r = Math.round(parseInt(hex.slice(0,2), 16) * 0.55)
    const g = Math.round(parseInt(hex.slice(2,4), 16) * 0.55)
    const b = Math.round(parseInt(hex.slice(4,6), 16) * 0.55)
    return { backgroundColor: `rgb(${r} ${g} ${b})` }
  })()

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
        'flex flex-col h-screen transition-all duration-300 ease-in-out',
        'border-r', t.border,
        sidebarBg,
        collapsed ? 'w-14' : 'w-60'
      )}
      style={brandBg}
    >

      {/* Header — KashiGRC logo + toggle */}
      <div className={cn(
        'h-13 flex items-center border-b shrink-0',
        t.border,
        collapsed ? 'justify-center px-2 py-3' : 'px-3 py-3 gap-2.5'
      )}>
        {/* Always show icon */}
        <KashiLogo size={28} className="shrink-0" />

        {/* Name — hidden when collapsed */}
        {!collapsed && (
          branding?.logoUrl
            ? <img src={branding.logoUrl} alt={displayName}
                className="h-5 object-contain flex-1 min-w-0" />
            : <span className={cn('text-sm font-bold tracking-tight flex-1 min-w-0 truncate', t.name)}>
                {displayName}
              </span>
        )}

        {/* Toggle */}
        {!collapsed && (
          <button onClick={onToggle} title="Collapse sidebar"
            className={cn('h-6 w-6 flex items-center justify-center rounded-md transition-colors ml-auto shrink-0', t.toggle)}>
            <PanelLeftClose size={14} />
          </button>
        )}
      </div>

      {/* Collapsed expand button */}
      {collapsed && (
        <button onClick={onToggle} title="Expand sidebar"
          className={cn('mx-auto mt-1 h-7 w-7 flex items-center justify-center rounded-md transition-colors', t.toggle)}>
          <PanelLeftOpen size={14} />
        </button>
      )}

      {/* Nav */}
      <nav ref={navRef} className={cn('flex-1 overflow-y-auto py-3 space-y-4 min-h-0', collapsed ? 'px-1.5' : 'px-2.5')}>
        {isLoading && (
          <div className={cn('space-y-1 px-2', collapsed && 'px-1.5')}>
            {!collapsed && (
              <div className={cn('h-2 w-16 rounded mb-3 mx-1 animate-pulse',
                effectiveTheme === 'brand' ? 'bg-white/10' : effectiveTheme === 'light' ? 'bg-gray-200' : 'bg-white/5'
              )} />
            )}
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className={cn(
                'flex items-center gap-2.5 rounded-lg',
                collapsed ? 'justify-center w-9 h-9 mx-auto' : 'px-3 py-2 h-9'
              )}>
                <div className={cn(
                  'rounded-md shrink-0 animate-pulse',
                  collapsed ? 'w-5 h-5' : 'w-4 h-4',
                  effectiveTheme === 'brand' ? 'bg-white/15' : effectiveTheme === 'light' ? 'bg-gray-200' : 'bg-white/8'
                )} style={{ animationDelay: `${i * 80}ms` }} />
                {!collapsed && (
                  <div className={cn(
                    'h-2.5 rounded-full animate-pulse flex-1',
                    effectiveTheme === 'brand' ? 'bg-white/10' : effectiveTheme === 'light' ? 'bg-gray-100' : 'bg-white/5',
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
    if (!item.isActive) continue
    const key = item.module || '_root'
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return groups
}