import { createSlice } from '@reduxjs/toolkit'

const uiConfigSlice = createSlice({
  name: 'uiConfig',
  initialState: {
    branding: null,
    featureFlags: {},
    bootstrapped: false,
  },
  reducers: {
    setBootstrap(state, { payload }) {
      state.branding     = payload.branding
      state.featureFlags = payload.featureFlags || {}
      state.bootstrapped = true
      if (payload.branding) applyBranding(payload.branding)
    },
    applyBrandingLive(state, { payload }) {
      state.branding = { ...state.branding, ...payload }
      applyBranding({ ...state.branding, ...payload })
    },
  },
})

/**
 * Applies tenant branding to CSS custom properties.
 *
 * Token layers:
 *   Primitive  — raw RGB values set on :root vars (--color-brand-500 etc.)
 *   Semantic   — surface/text/border vars set via data-theme on <html>
 *   Component  — reads semantic vars, no JS needed (future layer)
 *
 * Tenant branding controls: primaryColor (brand scale), accentColor.
 * Per-user theme (dark/light/system) is handled separately by useTheme hook
 * via data-theme attribute — it is NOT overridden here so user preference wins.
 */
export function applyBranding(branding) {
  const root = document.documentElement

  if (branding.primaryColor) {
    const rgb = hexToRgb(branding.primaryColor)
    if (rgb) {
      const scale = generateScale(rgb)
      Object.entries(scale).forEach(([shade, value]) => {
        root.style.setProperty(`--color-brand-${shade}`, value)
      })
    }
  }

  if (branding.accentColor) {
    const rgb = hexToRgb(branding.accentColor)
    if (rgb) root.style.setProperty('--color-accent', `${rgb.r} ${rgb.g} ${rgb.b}`)
  }

  // Apply sidebar theme from branding — but only if user hasn't set
  // their own personal preference (stored in localStorage).
  // User preference always wins over org branding default.
  const userSidebarPref = (() => {
    try { return localStorage.getItem('kashi_sidebar_theme') } catch { return null }
  })()

  if (branding.sidebarTheme && !userSidebarPref) {
    let sidebarRgb
    if (branding.sidebarTheme === 'brand' && branding.primaryColor) {
      const rgb = hexToRgb(branding.primaryColor)
      // Darken the brand color slightly for sidebar so text is readable
      if (rgb) sidebarRgb = `${Math.round(rgb.r * 0.7)} ${Math.round(rgb.g * 0.7)} ${Math.round(rgb.b * 0.7)}`
    } else if (branding.sidebarTheme === 'light') {
      sidebarRgb = '255 255 255'
    } else {
      sidebarRgb = '10 15 30'   // dark (default)
    }
    if (sidebarRgb) root.style.setProperty('--color-sidebar', sidebarRgb)
  }

  if (branding.companyName) document.title = branding.companyName

  if (branding.faviconUrl) {
    let link = document.getElementById('favicon-link')
    if (!link) {
      link = document.createElement('link')
      link.id = 'favicon-link'; link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = branding.faviconUrl
  }
}

/** Interpolate full 50–900 scale from the 500 base color */
function generateScale(base) {
  const white = { r: 255, g: 255, b: 255 }
  const dark  = { r: 10,  g: 15,  b: 30  }
  const lerp  = (a, b, t) => Math.round(a + (b - a) * t)
  const mix   = (c1, c2, t) => `${lerp(c1.r,c2.r,t)} ${lerp(c1.g,c2.g,t)} ${lerp(c1.b,c2.b,t)}`
  return {
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
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : null
}

export const { setBootstrap, applyBrandingLive } = uiConfigSlice.actions
export default uiConfigSlice.reducer

export const selectBranding     = (s) => s.uiConfig.branding
export const selectFeatureFlags = (s) => s.uiConfig.featureFlags
export const selectBootstrapped = (s) => s.uiConfig.bootstrapped
export const selectFlag         = (key) => (s) => s.uiConfig.featureFlags[key] ?? false