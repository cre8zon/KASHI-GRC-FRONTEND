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

export function RouteSync() {
  const navigate    = useNavigate()
  const location    = useLocation()
  const dispatch    = useDispatch()
  const tabs        = useSelector(selectTabs)
  const activeTabId = useSelector(selectActiveTabId)
  const { data: navItems = [] } = useNavigation()
  const prevTabId   = useRef(activeTabId)
  const isSyncing   = useRef(false)

  // Look up { title, icon } from the nav tree by best-match route.
  // Uses the actual nav item label and icon — no guessing from path segments.
  // Falls back to humanized path segment if nav not yet loaded.
  const getNavInfo = (pathname) => {
    if (navItems.length > 0) {
      let best = null, bestLen = 0
      const flat = (items) => {
        for (const item of items) {
          if (item.route && item.route !== '/' &&
              pathname.startsWith(item.route) &&
              item.route.length > bestLen) {
            best = item
            bestLen = item.route.length
          }
          if (item.children?.length) flat(item.children)
        }
      }
      flat(navItems)
      if (best) return { title: best.label, icon: best.icon || null }
    }
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
    const { title, icon } = getNavInfo(location.pathname)
    dispatch(navigateActiveTab({ route, title, icon }))
  }, [location.pathname, location.search]) // eslint-disable-line

  // When navItems load → patch ALL tabs with correct label + icon from nav tree.
  // This fires once nav data arrives and corrects any tabs opened before nav loaded
  // (e.g. "Frameworks" → "Control Frameworks", null icon → actual icon).
  useEffect(() => {
    if (navItems.length === 0) return
    tabs.forEach(tab => {
      const { title, icon } = getNavInfo(tab.route.split('?')[0])
      dispatch(navigateActiveTab({ route: tab.route, title, icon }))
    })
  }, [navItems]) // eslint-disable-line

  // On first mount — if current URL is not dashboard, open/activate that route
  useEffect(() => {
    const route = location.pathname + location.search
    if (route === '/dashboard' || route === '/') return
    const { title, icon } = getNavInfo(location.pathname)
    const exists = tabs.find(t => t.route.split('?')[0] === location.pathname)
    if (!exists) {
      dispatch(openTab({ route, title, icon }))
    } else {
      dispatch(navigateActiveTab({ route, title, icon }))
    }
  }, []) // eslint-disable-line

  return null
}