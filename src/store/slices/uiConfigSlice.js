import { createSlice } from '@reduxjs/toolkit'

// Stores the bootstrap response for fast synchronous access
// (React Query handles the async fetch; this is the committed cache)
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
      // Inject CSS variables from branding
      if (payload.branding) {
        applyBranding(payload.branding)
      }
    },
  },
})

function applyBranding(branding) {
  const root = document.documentElement
  if (branding.primaryColor) {
    // Convert hex to RGB triplet for CSS variable usage
    const rgb = hexToRgb(branding.primaryColor)
    if (rgb) {
      root.style.setProperty('--color-brand-500', `${rgb.r} ${rgb.g} ${rgb.b}`)
    }
  }
  if (branding.accentColor) {
    const rgb = hexToRgb(branding.accentColor)
    if (rgb) {
      root.style.setProperty('--color-accent', `${rgb.r} ${rgb.g} ${rgb.b}`)
    }
  }
  // Update document title
  if (branding.companyName) {
    document.title = branding.companyName
  }
  // Update favicon if provided
  if (branding.faviconUrl) {
    const link = document.getElementById('favicon-link')
    if (link) link.href = branding.faviconUrl
  }
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? {
    r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16),
  } : null
}

export const { setBootstrap } = uiConfigSlice.actions
export default uiConfigSlice.reducer

export const selectBranding     = (s) => s.uiConfig.branding
export const selectFeatureFlags = (s) => s.uiConfig.featureFlags
export const selectBootstrapped = (s) => s.uiConfig.bootstrapped
export const selectFlag         = (key) => (s) => s.uiConfig.featureFlags[key] ?? false
