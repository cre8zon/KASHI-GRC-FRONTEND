import { useState, useEffect, useCallback, createContext, useContext } from 'react'

// Shared context — ThemeProvider fills this so all consumers share one state
export const ThemeContext = createContext(null)


const APP_KEY     = 'kashi_theme'
const SIDEBAR_KEY = 'kashi_sidebar_theme'
const VALID_APP     = ['dark', 'light', 'system']
const VALID_SIDEBAR = ['dark', 'light', 'brand']

export function getSavedApp() {
  try { const v = localStorage.getItem(APP_KEY); return VALID_APP.includes(v) ? v : 'light' } catch { return 'light' }
}
export function getSavedSidebar() {
  try { const v = localStorage.getItem(SIDEBAR_KEY); return VALID_SIDEBAR.includes(v) ? v : null } catch { return null }
}

export function applyAppTheme(t) {
  document.documentElement.setAttribute('data-theme', t)
}

// Apply immediately on module load — before React renders
applyAppTheme(getSavedApp())

// The brand colour is painted by applySavedBrandPreset() in main.jsx (and,
// before the bundle loads, by the cached-CSS script in index.html). The old
// inline-style injector that lived here wrote --color-brand-* onto <html>,
// which outranked the dark-theme tokens and froze the light scale in dark
// mode — it is intentionally gone. See lib/themeEngine.js.

export function useTheme() {
  // If ThemeProvider is mounted above us, use its shared state.
  // This ensures changing theme in Settings instantly updates Sidebar and all consumers.
  const ctx = useContext(ThemeContext)
  const [localTheme, setLocalThemeState] = useState(getSavedApp)

  const setLocalTheme = useCallback((next) => {
    if (!VALID_APP.includes(next)) return
    setLocalThemeState(next)
    applyAppTheme(next)
    try { localStorage.setItem(APP_KEY, next) } catch {}
  }, [])

  if (ctx) return ctx

  const theme  = localTheme
  const setTheme = setLocalTheme
  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return { theme, setTheme, isDark }
}