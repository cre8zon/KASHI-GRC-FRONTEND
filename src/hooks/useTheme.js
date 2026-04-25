import { useState, useEffect, useCallback } from 'react'

const APP_KEY     = 'kashi_theme'
const SIDEBAR_KEY = 'kashi_sidebar_theme'
const VALID_APP     = ['dark', 'light', 'system']
const VALID_SIDEBAR = ['dark', 'light', 'brand']

export function getSavedApp() {
  try { const v = localStorage.getItem(APP_KEY); return VALID_APP.includes(v) ? v : 'dark' } catch { return 'dark' }
}
export function getSavedSidebar() {
  try { const v = localStorage.getItem(SIDEBAR_KEY); return VALID_SIDEBAR.includes(v) ? v : null } catch { return null }
}

export function applyAppTheme(t) {
  document.documentElement.setAttribute('data-theme', t)
}

// Apply immediately on module load — before React renders
applyAppTheme(getSavedApp())

export function useTheme() {
  const [theme, setThemeState] = useState(getSavedApp)

  const setTheme = useCallback((next) => {
    if (!VALID_APP.includes(next)) return
    setThemeState(next)
    applyAppTheme(next)
    try { localStorage.setItem(APP_KEY, next) } catch {}
  }, [])

  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return { theme, setTheme, isDark }
}