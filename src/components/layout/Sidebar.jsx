import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import * as Icons from 'lucide-react'
import { cn } from '../../lib/cn'
import { useNavigation } from '../../hooks/useUIConfig'
import { useSelector } from 'react-redux'
import { selectBranding } from '../../store/slices/uiConfigSlice'
import { Skeleton }           from '../ui/EmptyState'
import api                    from '../../config/axios.config'
import { useQuery }           from '@tanstack/react-query'

function NavIcon({ name, size = 16, ...props }) {
  const Icon = Icons[name] || Icons.Circle
  return <Icon size={size} strokeWidth={1.75} {...props} />
}

/**
 * useBadgeCount — fetches a badge count from an endpoint defined on the nav item.
 * Used for: Inbox task count, Action Items count, Issues count, etc.
 * The endpoint is stored in ui_navigation_items.badge_count_endpoint (DB-driven).
 */
function useBadgeCount(endpoint) {
  const { data } = useQuery({
    queryKey: ['nav-badge', endpoint],
    queryFn:  () => api.get(endpoint),
    enabled:  !!endpoint,
    refetchInterval: 60_000,
    select: (d) => {
      // Handle various response shapes: number, { count }, { data: number }, { total }
      if (typeof d === 'number') return d
      if (typeof d?.data === 'number') return d.data
      if (typeof d?.count === 'number') return d.count
      if (typeof d?.total === 'number') return d.total
      // Array response — count items
      if (Array.isArray(d)) return d.length
      return 0
    },
  })
  return data ?? 0
}

function NavItem({ item, depth = 0, collapsed = false }) {
  const location = useLocation()
  const [open, setOpen] = useState(() => location.pathname.startsWith(item.route || ''))
  const hasChildren = item.children?.length > 0

  if (hasChildren) {
    const isActive = location.pathname.startsWith(item.route || '')
    return (
      <div>
        <button
          onClick={() => setOpen(o => !o)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150 group',
            isActive ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary hover:bg-white/5',
            depth > 0 && 'pl-8'
          )}
        >
          {item.icon && <NavIcon name={item.icon} className={cn(isActive ? 'text-brand-400' : 'text-text-muted group-hover:text-text-secondary')} />}
          <span className="flex-1 text-left font-medium">{item.label}</span>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {open && (
          <div className="ml-2 border-l border-border/40 pl-2 my-1 space-y-0.5">
            {item.children.map(child => <NavItem key={child.navKey} item={child} depth={depth + 1} />)}
          </div>
        )}
      </div>
    )
  }

  const badgeCount = useBadgeCount(item.badgeCountEndpoint || null)

  return (
    <NavLink
      to={item.route}
      className={({ isActive }) => cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150 group relative',
        isActive
          ? 'bg-brand-500/10 text-brand-300 font-medium'
          : 'text-text-muted hover:text-text-secondary hover:bg-white/5',
        depth > 0 && 'pl-6'
      )}
    >
      {({ isActive }) => <>
        {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-brand-400 rounded-r" />}
        {item.icon && <NavIcon name={item.icon} size={15}
          className={cn(isActive ? 'text-brand-400' : 'text-text-muted group-hover:text-text-secondary')} />}
        <span className="flex-1">{item.label}</span>
        {badgeCount > 0 && !collapsed && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 min-w-[18px] text-center">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </>}
    </NavLink>
  )
}

export function Sidebar({ collapsed, onToggle }) {
  const { data: navItems = [], isLoading } = useNavigation()
  const branding = useSelector(selectBranding)

  const grouped = groupByModule(navItems)

  return (
    <aside className={cn(
      'flex flex-col h-screen border-r border-border bg-sidebar',
      'transition-all duration-300',
      collapsed ? 'w-14' : 'w-56'
    )}>
      {/* Logo */}
      <div className="h-12 flex items-center px-4 border-b border-border shrink-0">
        {branding?.logoUrl
          ? <img src={branding.logoUrl} alt={branding.companyName} className="h-6 object-contain" />
          : <span className={cn('font-bold tracking-tight transition-all', collapsed ? 'text-xs' : 'text-sm')}>
              {collapsed ? 'K' : (branding?.companyName || 'KashiGRC')}
            </span>
        }
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {isLoading && (
          <div className="space-y-2 px-1">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className={cn('h-8', collapsed ? 'w-8' : 'w-full')} />)}
          </div>
        )}
        {!isLoading && Object.entries(grouped).map(([module, items]) => (
          <div key={module}>
            {!collapsed && module !== '_root' && (
              <p className="px-3 pb-1 text-[10px] font-semibold text-text-muted uppercase tracking-widest">{module}</p>
            )}
            <div className="space-y-0.5">
              {items.map(item => <NavItem key={item.navKey} item={item} collapsed={collapsed} />)}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}

function groupByModule(items) {
  const groups = {}
  for (const item of items) {
    // isActive=false items are routing-only entries (task pages, detail pages).
    // They are returned by the backend for route resolution (TaskInbox navKey lookup)
    // but must NOT appear in the sidebar — that's what isActive=false means.
    if (!item.isActive) continue
    const key = item.module || '_root'
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return groups
}