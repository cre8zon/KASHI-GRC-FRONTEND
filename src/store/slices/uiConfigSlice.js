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
      // force: this is an explicit admin/user action (live preview, save),
      // not the passive org-branding repaint that setBootstrap performs.
      applyBranding({ ...state.branding, ...payload }, { force: true })
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
/**
 * True when this user has a personal brand colour (a pastel preset click, or a
 * Settings colour). Org branding must not repaint over a personal choice.
 * Mirrors the sidebarTheme precedence rule already used below.
 */
function hasPersonalBrandChoice() {
  try {
    return !!localStorage.getItem('kashi_brand_preset') ||
           !!localStorage.getItem('kashi_sidebar_color')
  } catch { return false }
}

export function applyBranding(branding, { force = false } = {}) {
  const root = document.documentElement

  // setBootstrap() calls this with ORG branding on every load. Without this
  // guard a tenant's stored primaryColor repaints --color-brand-* a few
  // hundred ms after boot and stomps the user's pastel preset.
  const skipBrandColor = !force && hasPersonalBrandChoice()

  if (branding.primaryColor && !skipBrandColor) {
    const rgb = hexToRgb(branding.primaryColor)
    if (rgb) {
      // Cache the winning colour so the boot-time script in index.html can
      // paint it before React on the NEXT reload — eliminating the flash of
      // the default sidebar/mesh. (Previously only cached under a narrow
      // sidebarTheme condition below, so most users never got the cache.)
      try { localStorage.setItem('kashi_sidebar_color', branding.primaryColor) } catch {}
      const scale = generateScale(rgb)
      Object.entries(scale).forEach(([shade, value]) => {
        root.style.setProperty(`--color-brand-${shade}`, value)
      })
      // Derive the LIGHT mesh from the brand scale so the background follows
      // whatever colour is applied (preset, tenant branding, live preview).
      // Previously this set --wash-a/b/c, which no longer exist since the move
      // to the 4-blob mesh — so the mesh never updated. Dark theme keeps its
      // own fixed dim mesh via [data-theme="dark"] body in index.html.
      root.style.setProperty('--mesh-1', `rgb(${scale[400]})`)
      root.style.setProperty('--mesh-2', `rgb(${scale[200]})`)
      root.style.setProperty('--mesh-3', `rgb(${scale[300]})`)
      root.style.setProperty('--mesh-4', `rgb(${scale[100]})`)
    }
  }

  if (branding.accentColor) {
    const rgb = hexToRgb(branding.accentColor)
    if (rgb) root.style.setProperty('--color-accent', `${rgb.r} ${rgb.g} ${rgb.b}`)
  }

  // Apply sidebar theme from branding — only if user has no personal preference.
  // Personal pref (set via Settings Display) always wins over org default.
  const userSidebarPref = (() => {
    try { return localStorage.getItem('kashi_sidebar_theme') } catch { return null }
  })()

  if (branding.sidebarTheme && !userSidebarPref) {
    try { localStorage.setItem('kashi_sidebar_theme', branding.sidebarTheme) } catch {}
    if (branding.primaryColor) {
      try { localStorage.setItem('kashi_sidebar_color', branding.primaryColor) } catch {}
    }
    window.dispatchEvent(new CustomEvent('kashi-sidebar-changed'))
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