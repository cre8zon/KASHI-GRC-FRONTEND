import { useState, useEffect, useCallback } from 'react'
import {
  ThemeContext,
  getSavedApp, getSavedSidebar,
  applyAppTheme,
} from '../hooks/useTheme'
import { usersApi } from '../api/users.api'

// Persist a UI preference to the server (per-user) so the theme follows the
// user across devices. Fire-and-forget: the local apply is instant; the server
// write happens in the background and failures are non-fatal (localStorage still
// holds the value for this device).
function persistPref(patch) {
  try {
    usersApi.preferences.save(patch).catch(() => {})
  } catch { /* ignore */ }
}

const VALID_APP     = ['dark', 'light', 'system']
const VALID_SIDEBAR = ['dark', 'light', 'brand']
const APP_KEY     = 'kashi_theme'
const SIDEBAR_KEY = 'kashi_sidebar_theme'

/**
 * ThemeProvider — wrap AppShell with this.
 * All useTheme() calls inside share the same state so changing
 * sidebar theme in Settings instantly updates the Sidebar.
 * Sidebar background is handled by Sidebar itself via localStorage +
 * kashi-sidebar-changed event — no CSS var needed here.
 */
export function ThemeProvider({ children }) {
  const [theme,        setThemeState]   = useState(getSavedApp)
  const [sidebarTheme, setSidebarState] = useState(getSavedSidebar)

  const setTheme = useCallback((next) => {
    if (!VALID_APP.includes(next)) return
    setThemeState(next)
    applyAppTheme(next)
    try { localStorage.setItem(APP_KEY, next) } catch {}
    // Persist per-user so the choice syncs to other devices (not just this browser).
    persistPref({ ui_app_theme: next })
  }, [])

  const setSidebarTheme = useCallback((next) => {
    if (!VALID_SIDEBAR.includes(next)) return
    setSidebarState(next)
    try { localStorage.setItem(SIDEBAR_KEY, next) } catch {}
    persistPref({ ui_sidebar_theme: next })
  }, [])

  // Sync across browser tabs (storage event) AND with the server prefs that
  // useUIConfig loads on bootstrap (kashi-theme-synced). The latter is what
  // makes the theme follow the user to a fresh device: server value arrives
  // after mount, so we update React state to match it (not just the DOM).
  useEffect(() => {
    const handler = (e) => {
      if (e.key === APP_KEY && VALID_APP.includes(e.newValue)) {
        setThemeState(e.newValue); applyAppTheme(e.newValue)
      }
      if (e.key === SIDEBAR_KEY) {
        const v = VALID_SIDEBAR.includes(e.newValue) ? e.newValue : null
        setSidebarState(v)
      }
    }
    const syncHandler = (e) => {
      const { appTheme, sidebarTheme: sb } = e.detail || {}
      if (VALID_APP.includes(appTheme)) { setThemeState(appTheme); applyAppTheme(appTheme) }
      if (VALID_SIDEBAR.includes(sb))   { setSidebarState(sb) }
    }
    window.addEventListener('storage', handler)
    window.addEventListener('kashi-theme-synced', syncHandler)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('kashi-theme-synced', syncHandler)
    }
  }, [])

  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <ThemeContext.Provider value={{ theme, setTheme, sidebarTheme, setSidebarTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}