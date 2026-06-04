import { useState, useEffect, useCallback } from 'react'

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

// Apply saved brand color immediately — before React renders and before bootstrap resolves.
// Mirrors the applyAppTheme pattern above. Reads kashi_sidebar_color (the user's personal
// brand color saved by useUIConfig after the first successful bootstrap) and sets the full
// --color-brand-* CSS var scale so every brand-colored element (buttons, tabs, indicators)
// shows the correct color even on server-unreachable or slow-boot.
;(() => {
  try {
    const hex = localStorage.getItem('kashi_sidebar_color')
    if (!hex) return
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!m) return
    const base  = { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    const white = { r: 255, g: 255, b: 255 }
    const dark  = { r: 10,  g: 15,  b: 30  }
    const lerp  = (a, b, t) => Math.round(a + (b - a) * t)
    const mix   = (c1, c2, t) => `${lerp(c1.r,c2.r,t)} ${lerp(c1.g,c2.g,t)} ${lerp(c1.b,c2.b,t)}`
    const scale = {
      50:  mix(base, white, 0.92),
      100: mix(base, white, 0.80),
      200: mix(base, white, 0.65),
      300: mix(base, white, 0.45),
      400: mix(base, white, 0.22),
      500: `${base.r} ${base.g} ${base.b}`,
      600: mix(base, dark,  0.18),
      700: mix(base, dark,  0.36),
      800: mix(base, dark,  0.54),
      900: mix(base, dark,  0.70),
    }
    const root = document.documentElement
    Object.entries(scale).forEach(([shade, value]) => {
      root.style.setProperty(`--color-brand-${shade}`, value)
    })
  } catch {}
})()

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