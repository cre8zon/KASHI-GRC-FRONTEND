/**
 * KashiGRC pastel brand presets — v3.
 * Wire into ThemeSwitcher / Settings. Each preset = pastel family:
 * the seed hex generates the full --color-brand-* scale via the SAME
 * lerp logic already in useTheme.js, and data-brand switches the
 * matching pastel wash (defined in tokens.css).
 *
 * Tonal-button note: seeds are TRUE pastels. Primary buttons render
 * pastel bg (brand-500) with deep same-hue text (brand-900); links,
 * focus rings, and indicators use brand-800/900. Nothing renders
 * white-on-pastel.
 */

export const BRAND_PRESETS = [
  { key: 'sage', name: 'Sage', hex: '#AFD8C0' },   // default
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

const BRAND_KEY = 'kashi_brand_preset'

/** Mirrors the scale generator in useTheme.js (RGB triplets). */
function scaleFromHex(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return null
  const base  = { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
  const white = { r: 255, g: 255, b: 255 }
  const dark  = { r: 10,  g: 15,  b: 30  }
  const lerp  = (a, b, t) => Math.round(a + (b - a) * t)
  const mix   = (c1, c2, t) => `${lerp(c1.r, c2.r, t)} ${lerp(c1.g, c2.g, t)} ${lerp(c1.b, c2.b, t)}`
  return {
    50:  mix(base, white, 0.92), 100: mix(base, white, 0.80),
    200: mix(base, white, 0.65), 300: mix(base, white, 0.45),
    400: mix(base, white, 0.22), 500: `${base.r} ${base.g} ${base.b}`,
    600: mix(base, dark, 0.18),  700: mix(base, dark, 0.36),
    800: mix(base, dark, 0.54),  900: mix(base, dark, 0.70),
  }
}

/** Apply a preset now + persist. Also keeps kashi_sidebar_color in sync
 *  so the existing boot-time injector paints the right color pre-React. */
export function applyBrandPreset(key, { persist = true } = {}) {
  const preset = BRAND_PRESETS.find(p => p.key === key) || BRAND_PRESETS[0]
  const scale = scaleFromHex(preset.hex)
  if (!scale) return
  const root = document.documentElement
  Object.entries(scale).forEach(([shade, v]) =>
    root.style.setProperty(`--color-brand-${shade}`, v))
  root.setAttribute('data-brand', preset.key)

  // Derive the LIGHT mesh wash from the brand scale so the background follows
  // the chosen preset. mesh-1 leans full brand; the others are lighter tints
  // of the same hue plus one neutral cool note, kept subtle. Dark theme has
  // its own fixed dim mesh (see [data-theme="dark"] body in index.html), so we
  // only set these — the dark body rule ignores them.
  root.style.setProperty('--mesh-1', `rgb(${scale[400]})`)
  root.style.setProperty('--mesh-2', `rgb(${scale[200]})`)
  root.style.setProperty('--mesh-3', `rgb(${scale[300]})`)
  root.style.setProperty('--mesh-4', `rgb(${scale[100]})`)
  // Persist ONLY on an explicit user choice. Defaulting must stay silent, or
  // tenant white-label branding can never apply (it checks for a chosen preset).
  if (persist) {
    try {
      localStorage.setItem(BRAND_KEY, preset.key)
      localStorage.setItem('kashi_sidebar_color', preset.hex) // boot-injector compat
    } catch {}
  }
}

/** Call once on module load (alongside applyAppTheme in useTheme.js). */
export function applySavedBrandPreset() {
  let key = null
  try { key = localStorage.getItem(BRAND_KEY) } catch {}
  // No saved choice -> paint the sage default WITHOUT persisting it.
  applyBrandPreset(key || 'sage', { persist: !!key })
}

/** True only when the user explicitly picked a preset (BrandPicker click). */
export function hasUserChosenPreset() {
  try { return !!localStorage.getItem(BRAND_KEY) } catch { return false }
}

/** Current saved preset key (defaults to sage). */
export function getSavedBrandPreset() {
  try { return localStorage.getItem(BRAND_KEY) || 'sage' } catch { return 'sage' }
}