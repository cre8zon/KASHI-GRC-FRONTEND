import { useState, useEffect, useCallback } from 'react'
import {
  ThemeContext,
  getSavedApp, getSavedSidebar,
  applyAppTheme,
} from '../hooks/useTheme'

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
  }, [])

  const setSidebarTheme = useCallback((next) => {
    if (!VALID_SIDEBAR.includes(next)) return
    setSidebarState(next)
    try { localStorage.setItem(SIDEBAR_KEY, next) } catch {}
  }, [])

  // Sync across browser tabs
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
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <ThemeContext.Provider value={{ theme, setTheme, sidebarTheme, setSidebarTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}