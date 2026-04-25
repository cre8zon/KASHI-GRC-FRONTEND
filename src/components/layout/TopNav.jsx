import { useState } from 'react'
import { Bell, ChevronDown, LogOut, User, Settings, ChevronRight } from 'lucide-react'
import { useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import { selectAuth } from '../../store/slices/authSlice'
import { useLogout } from '../../hooks/useAuth'
import { useNotifications } from '../../hooks/useNotifications'
import { useNavigation } from '../../hooks/useUIConfig'
import { initials } from '../../utils/format'
import { ThemeSwitcher } from '../ui/ThemeSwitcher'
import { cn } from '../../lib/cn'

// ── Breadcrumb — built from nav tree matching current route ──────────────────
function useBreadcrumb(navItems) {
  const location = useLocation()
  const routeMap = {}

  function flatten(items) {
    for (const item of items) {
      if (item.route) routeMap[item.route] = item.label
      if (item.children?.length) flatten(item.children)
    }
  }
  flatten(navItems)

  let best = null, bestLen = 0
  for (const [route, label] of Object.entries(routeMap)) {
    if (location.pathname.startsWith(route) && route.length > bestLen) {
      best = { route, label }
      bestLen = route.length
    }
  }

  const crumbs = []
  if (best) {
    crumbs.push({ label: best.label })
    const tail = location.pathname.slice(best.route.length).replace(/^\//, '')
    if (tail && isNaN(Number(tail))) {
      crumbs.push({ label: humanize(tail) })
    }
  } else {
    const segs = location.pathname.split('/').filter(Boolean)
    if (segs.length) crumbs.push({ label: humanize(segs[segs.length - 1]) })
  }
  return crumbs
}

function humanize(str) {
  return str.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── TopNav ────────────────────────────────────────────────────────────────────
export function TopNav({ onMenuToggle }) {
  const { fullName, email, roles, vendorId, tenantName, vendorName } = useSelector(selectAuth)
  const { mutate: doLogout }    = useLogout()
  const navigate                = useNavigate()
  const [showUser, setShowUser] = useState(false)
  const { data: notifData }     = useNotifications({ read: false })
  const { data: navItems = [] } = useNavigation()
  const notifications           = notifData?.items || []
  const unread                  = notifications.filter(n => !n.readAt).length
  const crumbs                  = useBreadcrumb(navItems)

  const primaryRole  = roles?.[0]
  const isVendor     = vendorId != null || roles?.some(r => r.side === 'VENDOR')
  const roleName     = primaryRole?.roleName?.replace(/_/g, ' ')?.replace(/\b\w/g, c => c.toUpperCase()) || ''
  const sideLabel    = isVendor ? 'Vendor' : 'Organization'

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-surface shrink-0 gap-4">

      {/* Left — org/vendor context where page title used to be */}
      <div className="flex items-center gap-2 min-w-0">
        {(tenantName || vendorName) ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base font-semibold text-text-primary truncate">
              {tenantName || ''}
            </span>
            {isVendor && vendorName && (
              <>
                <ChevronRight size={16} className="text-border shrink-0" />
                <span className="text-base font-semibold text-amber-400 truncate">
                  {vendorName}
                </span>
              </>
            )}
          </div>
        ) : (
          /* Fallback breadcrumb while names load */
          crumbs.length > 0 && (
            <nav className="flex items-center gap-2 min-w-0">
              {crumbs.map((crumb, i) => (
                <div key={i} className="flex items-center gap-2 min-w-0">
                  {i > 0 && <ChevronRight size={14} className="text-border shrink-0" />}
                  <span className={cn(
                    'truncate',
                    i === crumbs.length - 1
                      ? 'text-base font-semibold text-text-primary'
                      : 'text-sm font-medium text-text-muted'
                  )}>
                    {crumb.label}
                  </span>
                </div>
              ))}
            </nav>
          )
        )}
      </div>

      {/* Right — badge pill + theme + notifications + user */}
      <div className="flex items-center gap-2 shrink-0">

        {/* Side + role badge pill — exactly as before */}
        {roles?.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-surface-overlay">
            <span className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              isVendor ? 'bg-amber-400' : 'bg-brand-400'
            )} />
            <span className="text-[11px] font-medium text-text-muted">{sideLabel}</span>
            <ChevronRight size={10} className="text-border" />
            <span className="text-[11px] font-semibold text-text-secondary">{roleName}</span>
          </div>
        )}

        {/* Theme switcher */}
        <ThemeSwitcher />

        {/* Notifications */}
        <button
          onClick={() => navigate('/notifications')}
          className="relative h-8 w-8 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
        >
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 h-4 w-4 bg-brand-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUser(o => !o)}
            className="flex items-center gap-2 h-8 px-2 rounded-md hover:bg-surface-overlay transition-colors"
          >
            <div className="h-6 w-6 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-[10px] font-bold text-brand-300">
              {initials(fullName)}
            </div>
            <span className="text-xs text-text-secondary hidden sm:block">{fullName}</span>
            <ChevronDown size={12} className="text-text-muted" />
          </button>

          {showUser && (
            <div className="absolute right-0 top-10 w-56 bg-surface-raised border border-border rounded-lg shadow-elevated z-50 py-1 animate-slide-up">
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-xs font-semibold text-text-primary truncate">{fullName}</p>
                <p className="text-[11px] text-text-muted truncate">{email}</p>
                {(tenantName || vendorName) && (
                  <p className="text-[10px] text-brand-400 mt-1 font-medium truncate">
                    {tenantName}{vendorName ? ` · ${vendorName}` : ''}
                  </p>
                )}
                {roleName && (
                  <p className="text-[10px] text-text-muted mt-0.5">{roleName}</p>
                )}
              </div>
              {[
                { icon: User,     label: 'Settings',  action: () => navigate('/settings') },
                { icon: Settings, label: 'Display',   action: () => navigate('/settings?tab=display') },
                { icon: LogOut,   label: 'Sign out',  action: doLogout, danger: true },
              ].map(item => (
                <button key={item.label}
                  onClick={() => { item.action(); setShowUser(false) }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-surface-overlay',
                    item.danger ? 'text-red-400 hover:text-red-300' : 'text-text-secondary hover:text-text-primary'
                  )}>
                  <item.icon size={14} />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}