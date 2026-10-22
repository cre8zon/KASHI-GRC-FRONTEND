import { applyBrandScaleFromHex, applyDefaultBrand, hasUserChosenPreset, isChosenHex } from '../../config/brandPresets'
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
      state.featureFlags = payload.featureFlags || {}
      state.bootstrapped = true
      // The bootstrap response carries the TENANT branding (default sidebar
      // colour = sage) AND the user's own saved preferences. The user's saved
      // sidebar colour must win on the FIRST paint — otherwise the tenant
      // default repaints --color-brand-* on every load and the sidebar flashes
      // back to sage (the localStorage-only guard in applyBranding fails on a
      // fresh device where the colour isn't cached yet). So merge the user's
      // ui_sidebar_color over the tenant branding before applying, and force it.
      const userColor = payload.userPreferences?.['ui_sidebar_color']
      const branding  = userColor
        ? { ...payload.branding, primaryColor: userColor }
        : payload.branding
      state.branding = branding
      if (branding) applyBranding(branding, { force: !!userColor })
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
 * True when this user has a personal brand colour (a preset click, or a
 * Settings colour). Org branding must not repaint over a personal choice.
 * The legacy #1e40af fallback is NOT a choice — see brandPresets.js.
 */
function hasPersonalBrandChoice() {
  return hasUserChosenPreset()
}

export function applyBranding(branding, { force = false } = {}) {
  // setBootstrap() calls this with ORG branding on every load. Without this
  // guard a tenant's stored primaryColor repaints the theme a few hundred ms
  // after boot and stomps the user's preset.
  const skipBrandColor = !force && hasPersonalBrandChoice()

  if (branding.primaryColor && !skipBrandColor) {
    if (isChosenHex(branding.primaryColor)) {
      // Explicit (force) = the user's own colour → remember it as their
      // choice. Passive org branding is painted but NOT written to the
      // personal slot, otherwise the tenant colour would masquerade as a user
      // choice forever after. Pre-paint on reload is handled by the CSS cache
      // in themeEngine, so nothing else needs caching here.
      if (force) {
        try { localStorage.setItem('kashi_sidebar_color', branding.primaryColor) } catch {}
      }
      applyBrandScaleFromHex(branding.primaryColor)
    } else if (!hasPersonalBrandChoice()) {
      // Backend fallback colour (no tenant branding) → the Kashi default.
      applyDefaultBrand()
    }
  }

  // accentColor is intentionally not painted any more: --color-accent is now
  // derived per theme by themeEngine so it always clears contrast. The value
  // is still stored with the tenant branding and shown in the admin page.

  // Apply sidebar theme from branding — only if user has no personal preference.
  // Personal pref (set via Settings Display) always wins over org default.
  const userSidebarPref = (() => {
    try { return localStorage.getItem('kashi_sidebar_theme') } catch { return null }
  })()

  if (branding.sidebarTheme && !userSidebarPref) {
    try { localStorage.setItem('kashi_sidebar_theme', branding.sidebarTheme) } catch {}
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


export const { setBootstrap, applyBrandingLive } = uiConfigSlice.actions
export default uiConfigSlice.reducer

export const selectBranding     = (s) => s.uiConfig.branding
export const selectFeatureFlags = (s) => s.uiConfig.featureFlags
export const selectBootstrapped = (s) => s.uiConfig.bootstrapped
export const selectFlag         = (key) => (s) => s.uiConfig.featureFlags[key] ?? false