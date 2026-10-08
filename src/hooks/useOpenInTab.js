import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { openTab, activateTab, selectTabs, selectActiveTabId } from '../store/slices/tabsSlice'

/**
 * Go to a route — in the tab that already has it, if there is one.
 *
 * ── THE PROBLEM ───────────────────────────────────────────────────────────
 *
 * There is ONE BrowserRouter and a set of tabs that mirror it (RouteSync).
 * `navigate()` therefore always rewrites whichever tab is ACTIVE, whatever is
 * open elsewhere. So clicking a notification for assessment 74 while
 * assessment 74 is already open in the third tab points the current tab at it
 * too, and you end up looking at the same entity twice — once with the
 * sub-tab, scroll position and filters you had built up, once fresh.
 *
 * That is the "it opens the same tab again" symptom. The tab that had the
 * entity is not reused and not closed; it is just no longer where you are.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 *
 * Match on PATHNAME, ignoring the query.
 *
 *   target /module/vendor_assessment/74
 *   tab    /module/vendor_assessment/74?tab=sections   → same thing, focus it
 *
 *   target /module/vendor_assessment/74
 *   tab    /module/vendor_assessment                   → list vs detail,
 *                                                        different screens,
 *                                                        new tab
 *
 * The query is view state, not identity — which sub-tab is open, which filter
 * is applied. Two URLs differing only there are the same screen.
 *
 * ── WHOSE QUERY WINS ──────────────────────────────────────────────────────
 *
 * If the TARGET carries a query, it is saying something: ?tab=comments on a
 * mention means "the comment is over here". That beats whatever the tab was
 * showing, so navigate to the target as given.
 *
 * If the target has no query, the tab's own route stands, and you arrive back
 * where you left off instead of being reset to the default sub-tab.
 *
 * ── WHY THIS DOESN'T FIGHT RouteSync ──────────────────────────────────────
 *
 * RouteSync navigates when the active tab changes AND its stored route's
 * pathname differs from the URL. Here the pathname always ends up equal — we
 * navigate to either the tab's own route or a route with the same pathname —
 * so that effect is a no-op and only RouteSync's URL→tab direction runs,
 * stamping the final route onto the tab we focused. No race, no double
 * navigation.
 *
 * Use this anywhere a LINK TO ELSEWHERE is followed — notifications, the
 * inbox, task lists, action items. Ordinary in-page navigation (a row in the
 * list you are looking at) should stay plain `navigate()`: that genuinely is
 * "this tab moves on".
 *
 * @returns {(route: string, meta?: {title?: string, icon?: string}) => void}
 */
export function useOpenInTab() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const tabs = useSelector(selectTabs)
  const activeTabId = useSelector(selectActiveTabId)

  return useCallback((route, meta = {}) => {
    if (!route) return

    const pathOf = (r) => String(r || '').split('?')[0]
    const targetPath = pathOf(route)
    const hasQuery = route.includes('?')

    const existing = tabs.find(t => pathOf(t.route) === targetPath)

    if (existing) {
      // Already where we want to be — just make sure the query intent lands.
      if (existing.id !== activeTabId) dispatch(activateTab(existing.id))
      navigate(hasQuery ? route : existing.route)
      return
    }

    // Nowhere open: a new tab, which openTab also activates. The navigate
    // keeps the URL and the tab in step; RouteSync fills in the real title and
    // icon from the nav tree once it has them.
    dispatch(openTab({ route, title: meta.title, icon: meta.icon }))
    navigate(route)
  }, [tabs, activeTabId, dispatch, navigate])
}