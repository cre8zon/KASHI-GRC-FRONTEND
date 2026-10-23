/**
 * tabsSlice.js — Redux state for the in-app tab system.
 * Place at: src/store/slices/tabsSlice.js
 */
import { createSlice } from '@reduxjs/toolkit'

// Use timestamp + random suffix — survives HMR reloads and sessionStorage rehydration
// Incrementing counter resets on every hot reload causing duplicate key collisions
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const HOME_TAB = {
  id:    'home',
  title: 'Dashboard',
  route: '/dashboard',
  icon:  'LayoutDashboard',
  isPinned: true,   // home tab cannot be closed
}

const initialState = {
  tabs:        [HOME_TAB],
  activeTabId: 'home',
  // True while an in-app call runs (set by the call store). The call has its
  // own tab ("/call"); while it is on, nothing may navigate THAT tab away —
  // a nav click from it opens the page in another tab instead. Never
  // persisted: after a reload it is set again only if the call rejoins.
  callLock:    false,
  // Who these tabs belong to. Tabs survive signing out (sessionStorage), so
  // the same person signing back in returns to where they were — but a
  // DIFFERENT person signing in on this browser tab must not inherit them.
  owner:       null,
}

const CALL_ROUTE = '/call'
const pathOf = (route) => (route || '').split('?')[0]

const tabsSlice = createSlice({
  name: 'tabs',
  initialState,
  reducers: {
    // Open a new tab (or activate if same route already open)
    openTab: (state, { payload: { route, title, icon } }) => {
      const existing = state.tabs.find(t => t.route === route)
      if (existing) {
        state.activeTabId = existing.id
        return
      }
      const id = newId()
      state.tabs.push({ id, title: title || route, route, icon: icon || null, subTab: null })
      state.activeTabId = id
    },

    // Always create a NEW tab, even if that route is already open.
    // openTab() de-dupes by route (correct for nav clicks — you don't want five
    // "Audit Library" tabs). The "+" button needs the opposite behaviour, and
    // using openTab there made it silently re-activate the existing tab, so it
    // looked like the button did nothing.
    newTab: (state, { payload: { route, title, icon } = {} }) => {
      const id = newId()
      state.tabs.push({
        id,
        title: title || route,
        route,
        icon: icon || null,
        subTab: null,
      })
      state.activeTabId = id
    },

    // Navigate the active tab to a new route (updates its route + title)
    navigateActiveTab: (state, { payload: { route, title, icon } }) => {
      const tab = state.tabs.find(t => t.id === state.activeTabId)
      if (!tab) return
      // The running call's tab keeps the call: leaving it means going to
      // another tab — the one already showing that page, or a new one.
      if (state.callLock && pathOf(tab.route) === CALL_ROUTE && pathOf(route) !== CALL_ROUTE) {
        const existing = state.tabs.find(t => t.route === route) || state.tabs.find(t => pathOf(t.route) === pathOf(route) && pathOf(route) !== '/dashboard')
        if (existing) {
          existing.route = route
          if (title) existing.title = title
          if (icon) existing.icon = icon
          state.activeTabId = existing.id
          return
        }
        const id = newId()
        state.tabs.push({ id, title: title || route, route, icon: icon || null, subTab: null })
        state.activeTabId = id
        return
      }
      tab.route = route
      tab.title = title || route
      if (icon) tab.icon = icon
    },

    // Save the active sub-tab key for an app tab (called when user clicks a sub-tab)
    saveSubTab: (state, { payload: { tabId, subTab } }) => {
      const tab = state.tabs.find(t => t.id === tabId)
      if (tab) tab.subTab = subTab
    },

    // Switch active tab
    activateTab: (state, { payload: id }) => {
      if (state.tabs.find(t => t.id === id)) state.activeTabId = id
    },

    // Close a tab
    closeTab: (state, { payload: id }) => {
      const tab = state.tabs.find(t => t.id === id)
      if (!tab || tab.isPinned) return
      // The running call's tab closes only when the call ends (Leave).
      if (state.callLock && pathOf(tab.route) === CALL_ROUTE) return
      const idx = state.tabs.findIndex(t => t.id === id)
      state.tabs.splice(idx, 1)
      // If closing the active tab, activate the nearest one
      if (state.activeTabId === id) {
        const next = state.tabs[Math.min(idx, state.tabs.length - 1)]
        state.activeTabId = next?.id || 'home'
      }
    },

    // Correct a tab's label and icon (nav data arriving after the tab opened),
    // without touching its route — unlike navigateActiveTab.
    refreshTabMeta: (state, { payload: { id, title, icon } }) => {
      const tab = state.tabs.find(t => t.id === id)
      if (!tab) return
      if (title) tab.title = title
      if (icon) tab.icon = icon
    },

    setCallLock: (state, { payload }) => { state.callLock = !!payload },

    // Signed in as `userId`: keep the tabs if they are theirs, otherwise start
    // from a clean Dashboard (tabs from before ownership was recorded are
    // kept — they can only be from this browser tab's own session).
    claimTabs: (state, { payload: userId }) => {
      if (userId == null) return
      if (state.owner != null && String(state.owner) !== String(userId)) {
        state.tabs = [HOME_TAB]
        state.activeTabId = 'home'
      }
      state.owner = userId
    },

    // Update a tab's title (called when page resolves entity name)
    updateTabTitle: (state, { payload: { id, title } }) => {
      const tab = state.tabs.find(t => t.id === id)
      if (tab) tab.title = title
    },

    // Close all tabs except pinned + active
    closeOtherTabs: (state, { payload: id }) => {
      state.tabs = state.tabs.filter(t => t.isPinned || t.id === id
        || (state.callLock && pathOf(t.route) === CALL_ROUTE))
      state.activeTabId = id
    },

    // Close all tabs to the right of the given tab
    closeTabsToRight: (state, { payload: id }) => {
      const idx = state.tabs.findIndex(t => t.id === id)
      state.tabs = state.tabs.filter((t, i) => i <= idx || t.isPinned
        || (state.callLock && pathOf(t.route) === CALL_ROUTE))
      if (!state.tabs.find(t => t.id === state.activeTabId)) {
        state.activeTabId = id
      }
    },
  },
})

export const {
  openTab, newTab, navigateActiveTab, activateTab, closeTab,
  updateTabTitle, closeOtherTabs, closeTabsToRight, saveSubTab,
  refreshTabMeta, setCallLock, claimTabs,
} = tabsSlice.actions

export const selectTabs        = s => s.tabs.tabs
export const selectActiveTabId = s => s.tabs.activeTabId
export const selectActiveTab   = s => s.tabs.tabs.find(t => t.id === s.tabs.activeTabId)
export const selectActiveSubTab = s => {
  const active = s.tabs.tabs.find(t => t.id === s.tabs.activeTabId)
  return active?.subTab || null
}

export default tabsSlice.reducer

// ── Tab persistence across browser refreshes ─────────────────────────────────
// Saves open tabs to sessionStorage so they survive F5/refresh.
// Called from store/index.js subscribe (same pattern as auth persistence).

const TABS_KEY = 'kashi_tabs'

export function loadTabs() {
  try {
    const raw = sessionStorage.getItem(TABS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Discard persisted tabs if any have old short numeric IDs (from before the fix)
    // that could collide with newly generated IDs
    const hasStaleIds = parsed?.tabs?.some(t => t.id !== 'home' && !t.id.includes('-'))
    if (hasStaleIds) {
      sessionStorage.removeItem(TABS_KEY)
      return null
    }
    return parsed ? { ...parsed, callLock: false } : parsed
  } catch { return null }
}

export function saveTabs(state) {
  try {
    sessionStorage.setItem(TABS_KEY, JSON.stringify(state))
  } catch {}
}