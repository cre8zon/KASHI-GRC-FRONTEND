/**
 * RouteSync.jsx
 * Place at: src/components/layout/RouteSync.jsx
 */
import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  selectTabs, selectActiveTabId,
  navigateActiveTab, openTab,
} from '../../store/slices/tabsSlice'
import { useNavigation } from '../../hooks/useUIConfig'
import { resolveNav } from '../../lib/navRoute'

export function RouteSync() {
  const navigate    = useNavigate()
  const location    = useLocation()
  const dispatch    = useDispatch()
  const tabs        = useSelector(selectTabs)
  const activeTabId = useSelector(selectActiveTabId)
  const { data: navItems = [] } = useNavigation()
  const prevTabId   = useRef(activeTabId)
  const isSyncing   = useRef(false)

  /**
   * The tab's title and icon, from the same resolver the sidebar highlights
   * with — so a tab is never labelled something the sidebar disagrees with.
   *
   * ── WHY THE OLD ONE PRODUCED TABS CALLED "74" ─────────────────────────
   *
   * It was `pathname.startsWith(item.route)`, longest wins, and it had three
   * faults the sidebar's copy did not:
   *
   *   1. It compared against item.route WITH its query string, so every
   *      framework-scoped row — /module/audit_finding?frameworkRef=ISO27001 —
   *      could never match any pathname at all.
   *   2. No segment boundary, so /module/risk claimed /module/risk-register.
   *   3. It ignored the hidden (is_active = 0) detail rows the backend returns
   *      on purpose, which are the rows that know what a detail URL is.
   *
   * When nothing matched it humanised the last path segment — which on
   * /module/vendor_assessment/74 or /collaboration/rooms/7 is the id. Hence
   * tabs named "74" and "7".
   *
   * The humanising fallback is kept for the genuinely unknown route and for the
   * moment before nav data has loaded, which is the only thing it was ever
   * right about.
   */
  const getNavInfo = (pathname, search = '') => {
    const hit = navItems.length > 0 ? resolveNav(navItems, { pathname, search }) : null
    if (hit?.label) return { title: hit.label, icon: hit.icon || null }
    // Fallback — humanize last path segment
    const seg = pathname.split('/').filter(Boolean).pop() || 'Page'
    const title = seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return { title, icon: null }
  }

  // When active tab changes → navigate browser to that tab's stored route
  useEffect(() => {
    if (!tabs.find(t => t.id === activeTabId)) return
    if (prevTabId.current === activeTabId) return
    prevTabId.current = activeTabId

    const activeTab = tabs.find(t => t.id === activeTabId)
    const tabPath   = activeTab?.route?.split('?')[0]
    if (tabPath && tabPath !== location.pathname) {
      isSyncing.current = true
      navigate(activeTab.route, { replace: true })
      setTimeout(() => { isSyncing.current = false }, 150)
    }
  }, [activeTabId]) // eslint-disable-line

  // When browser URL changes → update active tab's route + title + icon from nav tree
  useEffect(() => {
    if (isSyncing.current) return
    const route = location.pathname + location.search
    const { title, icon } = getNavInfo(location.pathname, location.search)
    dispatch(navigateActiveTab({ route, title, icon }))
  }, [location.pathname, location.search]) // eslint-disable-line

  // When navItems load → patch ALL tabs with correct label + icon from nav tree.
  // This fires once nav data arrives and corrects any tabs opened before nav loaded
  // (e.g. "Frameworks" → "Control Frameworks", null icon → actual icon).
  useEffect(() => {
    if (navItems.length === 0) return
    tabs.forEach(tab => {
      const [tabPath, tabQuery = ''] = tab.route.split('?')
      const { title, icon } = getNavInfo(tabPath, tabQuery ? `?${tabQuery}` : '')
      dispatch(navigateActiveTab({ route: tab.route, title, icon }))
    })
  }, [navItems]) // eslint-disable-line

  // On first mount — if current URL is not dashboard, open/activate that route
  useEffect(() => {
    const route = location.pathname + location.search
    if (route === '/dashboard' || route === '/') return
    const { title, icon } = getNavInfo(location.pathname, location.search)
    const exists = tabs.find(t => t.route.split('?')[0] === location.pathname)
    if (!exists) {
      dispatch(openTab({ route, title, icon }))
    } else {
      dispatch(navigateActiveTab({ route, title, icon }))
    }
  }, []) // eslint-disable-line

  return null
}