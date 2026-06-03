// src/store/index.js — ADD tabsReducer (only change from original)
import { configureStore } from '@reduxjs/toolkit'
import authReducer     from './slices/authSlice'
import uiConfigReducer from './slices/uiConfigSlice'
import tabsReducer, { loadTabs, saveTabs } from './slices/tabsSlice'   // ← NEW

const AUTH_KEY = 'kashi_auth'

function loadAuth() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

function saveAuth(state) {
  try {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(state))
  } catch {}
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

let lastAuth = store.getState().auth
let lastTabs = store.getState().tabs
store.subscribe(() => {
  const currentAuth = store.getState().auth
  if (currentAuth !== lastAuth) {
    lastAuth = currentAuth
    if (currentAuth.isAuthenticated) {
      saveAuth(currentAuth)
    } else {
      sessionStorage.removeItem(AUTH_KEY)
    }
  }
  const currentTabs = store.getState().tabs
  if (currentTabs !== lastTabs) {
    lastTabs = currentTabs
    saveTabs(currentTabs)
  }
})