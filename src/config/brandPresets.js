/**
 * KashiGRC brand presets — v4.
 *
 * The first preset, Kashi Purple (#936EC8), is the product's own brand colour
 * and the DEFAULT for every user who has not chosen a theme of their own. The
 * twelve pastels follow it unchanged.
 *
 * A preset is only a seed hex. themeEngine.js turns it into the complete light
 * AND dark token sets (brand scale, on-brand ink, brand ink, fill, wash, and
 * the hue-tinted dark neutrals), with contrast solved there — so a saturated
 * seed like the Kashi purple gets white button text while the pastels keep
 * their deep same-hue ink. Components never pick the text colour themselves:
 * solid brand surfaces use `text-brand-on`.
 */
import { applyThemeColor, isValidHex } from '../lib/themeEngine'

export const DEFAULT_PRESET_KEY = 'kashi'

export const BRAND_PRESETS = [
  { key: 'kashi', name: 'Kashi Purple', hex: '#936EC8' },   // default — brand colour
  { key: 'sage', name: 'Sage', hex: '#AFD8C0' },
  { key: 'mint', name: 'Mint', hex: '#A9E2D2' },
  { key: 'seafoam', name: 'Seafoam', hex: '#A5DDE0' },
  { key: 'sky', name: 'Sky', hex: '#B9D4F0' },
  { key: 'periwinkle', name: 'Periwinkle', hex: '#C0C8F2' },
  { key: 'lilac', name: 'Lilac', hex: '#D3C8F0' },
  { key: 'mauve', name: 'Mauve', hex: '#E2C4E6' },
  { key: 'blush', name: 'Blush', hex: '#F2C3D2' },
  { key: 'coral', name: 'Coral', hex: '#F3C1B8' },
  { key: 'peach', name: 'Peach', hex: '#F5CFA9' },
  { key: 'butter', name: 'Butter', hex: '#F0DFA8' },
  { key: 'pistachio', name: 'Pistachio', hex: '#CFE3A9' },
]

export const DEFAULT_BRAND_HEX = BRAND_PRESETS[0].hex

/**
 * Colours that mean "nobody chose this". The backend has always fallen back to
 * #1e40af when a tenant has no branding row, and the old client cached that
 * fallback into the user's personal colour slot — so it is not a choice and
 * must not block the Kashi default.
 */
const LEGACY_DEFAULT_HEXES = ['#1e40af']

export function isLegacyDefaultHex(hex) {
  return !!hex && LEGACY_DEFAULT_HEXES.includes(String(hex).trim().toLowerCase())
}

/** A hex that represents a real, deliberate colour choice. */
export function isChosenHex(hex) {
  return isValidHex(hex) && !isLegacyDefaultHex(hex)
}

const BRAND_KEY = 'kashi_brand_preset'

/** Apply a preset now + persist. Also keeps kashi_sidebar_color in sync
 *  so the personal colour and the named preset never disagree. */
export function applyBrandPreset(key, { persist = true } = {}) {
  const preset = BRAND_PRESETS.find(p => p.key === key) || BRAND_PRESETS[0]
  if (!applyThemeColor(preset.hex)) return
  document.documentElement.setAttribute('data-brand', preset.key)
  // Persist ONLY on an explicit user choice. Defaulting must stay silent, or
  // tenant white-label branding can never apply (it checks for a chosen preset).
  if (persist) {
    try {
      localStorage.setItem(BRAND_KEY, preset.key)
      localStorage.setItem('kashi_sidebar_color', preset.hex)
    } catch {}
  }
}

/**
 * Paint the theme from a raw hex, without a named preset.
 * Used when the user's colour lives in kashi_sidebar_color (the hex, e.g.
 * synced from the DB or picked with the colour picker).
 */
export function applyBrandScaleFromHex(hex) {
  if (!applyThemeColor(hex)) return
  const match = BRAND_PRESETS.find(p => p.hex.toLowerCase() === String(hex).toLowerCase())
  if (match) document.documentElement.setAttribute('data-brand', match.key)
  else document.documentElement.removeAttribute('data-brand')
}

/** Paint the product default (Kashi Purple) without recording a choice. */
export function applyDefaultBrand() {
  applyBrandPreset(DEFAULT_PRESET_KEY, { persist: false })
}

/** Call once on module load, before first render (main.jsx). */
export function applySavedBrandPreset() {
  let key = null
  let hex = null
  try { key = localStorage.getItem(BRAND_KEY) } catch {}
  try { hex = localStorage.getItem('kashi_sidebar_color') } catch {}

  // Priority: a named preset the user picked > a deliberate saved hex (colour
  // picker / synced from the DB) > the Kashi Purple default.
  if (key && BRAND_PRESETS.some(p => p.key === key)) {
    applyBrandPreset(key, { persist: true })
  } else if (isChosenHex(hex)) {
    applyBrandScaleFromHex(hex)
  } else {
    if (isLegacyDefaultHex(hex)) {
      try { localStorage.removeItem('kashi_sidebar_color') } catch {}
    }
    applyDefaultBrand()
  }
}

/** True only when the user explicitly picked a preset or colour. */
export function hasUserChosenPreset() {
  try {
    return !!localStorage.getItem(BRAND_KEY) || isChosenHex(localStorage.getItem('kashi_sidebar_color'))
  } catch { return false }
}

/** Current saved preset key (defaults to Kashi Purple). */
export function getSavedBrandPreset() {
  try {
    const key = localStorage.getItem(BRAND_KEY)
    if (key && BRAND_PRESETS.some(p => p.key === key)) return key
    const hex = localStorage.getItem('kashi_sidebar_color')
    const match = hex && BRAND_PRESETS.find(p => p.hex.toLowerCase() === hex.toLowerCase())
    return match ? match.key : (isChosenHex(hex) ? null : DEFAULT_PRESET_KEY)
  } catch { return DEFAULT_PRESET_KEY }
}
