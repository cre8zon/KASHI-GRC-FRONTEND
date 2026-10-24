// src/store/index.js — ADD tabsReducer (only change from original)
import { configureStore } from '@reduxjs/toolkit'
import authReducer     from './slices/authSlice'
import uiConfigReducer from './slices/uiConfigSlice'
import tabsReducer, { loadTabs, saveTabs, claimTabs } from './slices/tabsSlice'   // ← NEW

const AUTH_KEY = 'kashi_auth'

/**
 * Where the session lives:
 *   sessionStorage — default. Per tab, gone when the browser closes.
 *   localStorage   — only when the user ticked "Keep me signed in". Survives a
 *                    restart; still bounded by the refresh-token lifetime.
 * Reads prefer the tab's own copy, so an explicit sign-in in this tab always
 * wins over a remembered one.
 */
function loadAuth() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

function saveAuth(state) {
  try {
    const json = JSON.stringify(state)
    sessionStorage.setItem(AUTH_KEY, json)
    if (state.rememberMe) localStorage.setItem(AUTH_KEY, json)
    else localStorage.removeItem(AUTH_KEY)
  } catch {}
}

function clearAuth() {
  try { sessionStorage.removeItem(AUTH_KEY) } catch {}
  try { localStorage.removeItem(AUTH_KEY) } catch {}
}

const preloadedAuth = loadAuth()
const preloadedTabs = loadTabs()

export const store = configureStore({
  reducer: {
    auth:     authReducer,
    uiConfig: uiConfigReducer,
    tabs:     tabsReducer,         // ← NEW
  },
  preloadedState: {
    ...(preloadedAuth ? { auth: preloadedAuth } : {}),
    ...(preloadedTabs ? { tabs: preloadedTabs } : {}),
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: { ignoredActions: ['auth/loginSuccess'] } }),
})

// Already signed in at load (a refresh): record whose tabs these are.
// Tabs are per person AND organisation (see tabsSlice.claimTabs).
const tabOwnerKey = (a) => (a.tenantId != null ? `${a.userId}@${a.tenantId}` : String(a.userId))
if (store.getState().auth.isAuthenticated) {
  const a = store.getState().auth
  store.dispatch(claimTabs({ userId: a.userId, tenantId: a.tenantId }))
  saveTabs(store.getState().tabs)
}

let lastAuth = store.getState().auth
let lastTabs = store.getState().tabs
store.subscribe(() => {
  const currentAuth = store.getState().auth
  if (currentAuth !== lastAuth) {
    const wasSignedIn = !!lastAuth?.isAuthenticated
    lastAuth = currentAuth
    if (currentAuth.isAuthenticated) {
      saveAuth(currentAuth)
      // Tabs belong to whoever opened them, in that organisation. A change
      // while already signed in is an organisation switch: the tab on screen
      // comes along (TenantSync switched under it). A fresh sign-in starts
      // from that organisation's own tabs.
      if (String(store.getState().tabs.owner) !== tabOwnerKey(currentAuth)) {
        store.dispatch(claimTabs({ userId: currentAuth.userId, tenantId: currentAuth.tenantId, keepActive: wasSignedIn }))
      }
    } else {
      clearAuth()
    }
  }
  const currentTabs = store.getState().tabs
  if (currentTabs !== lastTabs) {
    lastTabs = currentTabs
    saveTabs(currentTabs)
  }
})