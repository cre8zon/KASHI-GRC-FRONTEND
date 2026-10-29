/**
 * PageTabs — a page's own tabs, above the page: Vendors | Vendor dashboard |
 * Offboarding …
 *
 * Which rows are tabs of which page is set on the Navigation admin page
 * ("Show as tab of"), stored in ui_navigation.tab_parent_key — see
 * lib/pageTabs. Shown on the tab pages themselves (lists, dashboards), not on
 * a record opened from them, where the record's own tabs take over.
 * Ctrl/⌘-click opens a tab's page in a new app tab, as the sidebar does.
 */
import { useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import * as Icons from 'lucide-react'
import { cn } from '../../lib/cn'
import { useNavigation } from '../../hooks/useUIConfig'
import { pageTabsFor } from '../../lib/pageTabs'
import { openTab } from '../../store/slices/tabsSlice'

export function PageTabs() {
  const { data: navItems = [] } = useNavigation()
  const location = useLocation()
  const dispatch = useDispatch()
  const info = useMemo(() => pageTabsFor(navItems, location),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navItems, location.pathname, location.search])

  if (!info || !info.listLevel) return null
  return (
    <div role="tablist" aria-label={info.parent.label}
      className="shrink-0 mt-1 px-4 flex items-end gap-0.5 overflow-x-auto detail-band"
      style={{ scrollbarWidth: 'none' }}>
      {info.tabs.map(t => {
        const on = t.navKey === info.activeKey
        const Icon = (t.icon && Icons[t.icon]) || null
        return (
          <NavLink key={t.navKey} to={t.route} end role="tab" aria-selected={on}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault()
                dispatch(openTab({ route: t.route, title: t.label, icon: t.icon }))
              }
            }}
            className={cn('relative shrink-0 flex items-center gap-1.5 px-3 h-10 text-[13px] whitespace-nowrap transition-colors',
              on ? 'text-brand-ink font-semibold' : 'text-text-muted font-medium hover:text-text-primary')}>
            {Icon && <Icon size={14} strokeWidth={1.9} />} {t.label}
            {on && <span className="absolute left-2 right-2 -bottom-px h-[2.5px] rounded-full bg-brand-500" />}
          </NavLink>
        )
      })}
    </div>
  )
}
