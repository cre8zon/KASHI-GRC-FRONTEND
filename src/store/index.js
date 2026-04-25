import { configureStore } from '@reduxjs/toolkit'
import authReducer     from './slices/authSlice'
import uiConfigReducer from './slices/uiConfigSlice'

// ── Auth persistence ──────────────────────────────────────────────────────────
// On refresh, Redux resets to initialState (token = null → logged out).
// We fix this by saving auth state to sessionStorage on every change and
// rehydrating it as the store's preloadedState on startup.
// No extra packages needed — plain sessionStorage, same approach used by
// Firebase, Supabase, and most SaaS frontends.

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
  } catch {
    // Storage full or private mode — fail silently
  }
}

const preloadedAuth = loadAuth()

export const store = configureStore({
  reducer: {
    auth:     authReducer,
    uiConfig: uiConfigReducer,
  },
  // Rehydrate from sessionStorage on startup — survives browser refresh
  preloadedState: preloadedAuth ? { auth: preloadedAuth } : undefined,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: { ignoredActions: ['auth/loginSuccess'] } }),
})

// Subscribe to store changes and persist auth slice to sessionStorage.
// Only saves when auth state actually changes (reference equality check).
let lastAuth = store.getState().auth
store.subscribe(() => {
  const currentAuth = store.getState().auth
  if (currentAuth !== lastAuth) {
    lastAuth = currentAuth
    if (currentAuth.isAuthenticated) {
      saveAuth(currentAuth)
    } else {
      // User logged out — clear persisted state
      sessionStorage.removeItem(AUTH_KEY)
    }
  }
})