import { useState } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { Bell, ChevronDown, LogOut, User, Settings, ChevronRight, Building2, Check, Loader2 } from 'lucide-react'
import { useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import { selectAuth } from '../../store/slices/authSlice'
import { useLogout, useSwitchTenant } from '../../hooks/useAuth'
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

// ── Tenant switcher ───────────────────────────────────────────────────────────

/**
 * Renders only when the identity holds more than one membership — which today
 * means an external auditor with their own firm plus client tenants. Everyone
 * else sees exactly what they saw before.
 *
 * Showing the membership type next to each name is the point of this control,
 * not decoration: the same person records test results in several client
 * tenants, and "which organization am I acting in, and as what" has to be
 * answerable at a glance before they click anything.
 */
function TenantSwitcher({ memberships, activeTenantId }) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside(() => setOpen(false), open)
  const { mutate: switchTenant, isPending } = useSwitchTenant()

  if (!memberships || memberships.length < 2) return null

  const active = memberships.find(m => m.tenantId === activeTenantId)
  const isGuest = active?.membershipType === 'GUEST'

  const pick = (m) => {
    setOpen(false)
    if (m.tenantId !== activeTenantId) switchTenant(m.tenantId)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={isPending}
        title="Switch organization"
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors',
          isGuest
            ? 'border-status-warn-bd bg-status-warn-bg text-status-warn-fg'
            : 'border-border bg-surface-overlay text-text-secondary hover:text-text-primary',
        )}
      >
        {isPending
          ? <Loader2 size={11} className="animate-spin shrink-0" />
          : <Building2 size={11} className="shrink-0" />}
        <span className="text-[11px] font-semibold max-w-[10rem] truncate">
          {active?.tenantName || 'Organization'}
        </span>
        {isGuest && (
          <span className="text-[9px] uppercase tracking-wide font-medium shrink-0">
            External
          </span>
        )}
        <ChevronDown size={11} className="shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 mt-1.5 w-72 rounded-card border border-border bg-surface-raised shadow-elevated py-1 z-50">
          <p className="px-3 py-1.5 text-[9px] uppercase tracking-wide text-text-muted">
            Switch organization
          </p>
          {memberships.map(m => (
            <button
              key={m.tenantId}
              onClick={() => pick(m)}
              className="w-full flex items-start gap-2 px-3 py-2 hover:bg-surface-overlay text-left transition-colors"
            >
              <span className="w-4 shrink-0 pt-0.5">
                {m.tenantId === activeTenantId && <Check size={12} className="text-status-pass-fg" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-text-primary truncate">
                  {m.tenantName}
                </span>
                <span className="block text-[10px] text-text-muted truncate">
                  {m.membershipType === 'GUEST'
                    ? `External auditor${m.firmName ? ` · ${m.firmName}` : ''}`
                    : 'Your organization'}
                  {m.accessExpiresAt
                    ? ` · until ${new Date(m.accessExpiresAt).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric' })}`
                    : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TopNav ────────────────────────────────────────────────────────────────────
export function TopNav({ onMenuToggle }) {
  const { fullName, email, roles, vendorId, tenantName, vendorName, tenantId, memberships } = useSelector(selectAuth)
  const { mutate: doLogout }    = useLogout()
  const navigate                = useNavigate()
  const [showUser, setShowUser] = useState(false)
  const userMenuRef = useClickOutside(() => setShowUser(false), showUser)
  const { data: notifData }     = useNotifications({ read: false })
  const { data: navItems = [] } = useNavigation()
  const notifications           = notifData?.items || []
  const unread                  = notifications.filter(n => !n.readAt).length
  const crumbs                  = useBreadcrumb(navItems)

  const primaryRole  = roles?.[0]
  const isVendor     = vendorId != null || roles?.some(r => r.side === 'VENDOR')
  const roleName     = primaryRole?.roleName?.replace(/_/g, ' ')?.replace(/\b\w/g, c => c.toUpperCase()) || ''
  const primarySide  = primaryRole?.side || (isVendor ? 'VENDOR' : 'ORGANIZATION')
  const sideLabel    = { ORGANIZATION: 'Organization', VENDOR: 'Vendor', AUDITOR: 'Auditor', AUDITEE: 'Auditee', SYSTEM: 'System' }[primarySide] ?? 'Organization'

  return (
    <header className="relative z-40 h-12 flex items-center justify-between px-4 glass-chrome rounded-card shadow-elevated mt-2 mx-2 shrink-0 gap-4">

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
                <span className="text-base font-semibold text-status-warn-fg truncate">
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

        {/* Organization switcher — renders only for multi-tenant identities */}
        <TenantSwitcher memberships={memberships} activeTenantId={tenantId} />

        {/* Side + role badge pill — exactly as before */}
        {roles?.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-surface-overlay">
            <span className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              { VENDOR: 'bg-status-warn-fg', AUDITOR: 'bg-status-pass-fg', AUDITEE: 'bg-status-tag-fg', SYSTEM: 'bg-status-info-fg' }[primarySide] ?? 'bg-brand-600'
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
          className="relative h-8 w-8 flex items-center justify-center rounded-ctl text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
        >
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 h-4 w-4 bg-brand-500 text-brand-900 text-[9px] font-bold rounded-full flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {/* User dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUser(o => !o)}
            className="flex items-center gap-2 h-8 px-2 rounded-ctl hover:bg-surface-overlay transition-colors"
          >
            <div className="h-6 w-6 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-[10px] font-bold text-brand-ink">
              {initials(fullName)}
            </div>
            <span className="text-xs text-text-secondary hidden sm:block">{fullName}</span>
            <ChevronDown size={12} className="text-text-muted" />
          </button>

          {showUser && (
            <div className="absolute right-0 top-11 w-56 bg-surface-raised border border-border rounded-card shadow-overlay z-[100] py-1 animate-slide-up">
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-xs font-semibold text-text-primary truncate">{fullName}</p>
                <p className="text-[11px] text-text-muted truncate">{email}</p>
                {(tenantName || vendorName) && (
                  <p className="text-[10px] text-brand-ink mt-1 font-medium truncate">
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
                    item.danger ? 'text-status-fail-fg hover:text-status-fail-fg' : 'text-text-secondary hover:text-text-primary'
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