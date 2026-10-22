/**
 * themeEngine.js — the ONE place a brand colour becomes design tokens.
 *
 * Before this file, four separate copies of a "lerp toward white / toward
 * navy" scale generator lived in index.html, useTheme.js, brandPresets.js and
 * uiConfigSlice.js. Each wrote --color-brand-* and --mesh-* as INLINE styles
 * on <html>. Inline styles beat every stylesheet rule, so:
 *
 *   • the dark theme's dim mesh (defined in index.html) was always overridden
 *     by the LIGHT pastel mesh → the bright blobs behind dark-mode glass;
 *   • the brand scale was identical in both themes → pastel buttons and pastel
 *     sidebar pills glowing on dark surfaces;
 *   • the text colour on a brand button was hard-wired to brand-900, which is
 *     only readable when the seed is a pastel. A mid-tone seed such as the
 *     Kashi purple (#936EC8) gave 3.3:1.
 *
 * Now a seed hex produces two complete token sets — light and dark — written
 * into a single <style id="kashi-theme-vars"> element, scoped by data-theme.
 * Switching light/dark is pure CSS; nothing has to be recomputed.
 *
 * Contrast is solved here, not in components:
 *   --color-brand-on    text/icons ON a solid brand-500 surface  (≥ 4.5:1)
 *   --color-brand-ink   brand-coloured text on neutral surfaces  (≥ 4.5:1)
 *   --color-brand-fill  progress fills / dots / indicators       (≥ 3:1 vs track)
 *
 * The generated CSS is cached in localStorage so the inline script in
 * index.html can paint it before the bundle loads (no flash on reload).
 */

export const THEME_STYLE_ID   = 'kashi-theme-vars'
export const THEME_CSS_CACHE  = 'kashi_theme_css'
export const THEME_SEED_CACHE = 'kashi_theme_seed'

// ── Colour maths ──────────────────────────────────────────────────────────────
const WHITE = { r: 255, g: 255, b: 255 }
const DEEP  = { r: 10,  g: 15,  b: 30  }   // the historical "dark" anchor

export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim())
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null
}

export function isValidHex(hex) { return !!hexToRgb(hex) }

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const round   = (c) => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) })
const mix     = (a, b, t) => round({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t })
const trip    = (c) => `${c.r} ${c.g} ${c.b}`

function channel(v) {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
export function luminance(c) {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
}
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function rgbToHsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === R)      h = (G - B) / d + (G < B ? 6 : 0)
  else if (max === G) h = (B - R) / d + 2
  else                h = (R - G) / d + 4
  return { h: h * 60, s, l }
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360
  s = clamp01(s); l = clamp01(l)
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60)       { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else              { r = c; b = x }
  return round({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 })
}

/** Composite a colour at `alpha` over a background (for tint checks). */
const over = (fg, bg, alpha) => mix(bg, fg, alpha)

// Light-theme neutrals the brand has to read against (mirrors index.html).
const L_SURFACE_RAISED  = { r: 255, g: 255, b: 255 }
const L_SURFACE_OVERLAY = { r: 241, g: 244, b: 248 }
const L_SURFACE_INSET   = { r: 237, g: 241, b: 245 }

// ── LIGHT token set ───────────────────────────────────────────────────────────
function lightTokens(seed) {
  // 1. The solid brand surface and the ink that sits on it.
  //    Pastels pair with a deep same-hue ink (the "tonal" look); mid/dark
  //    seeds pair with white. Whichever reads better wins, then the solid is
  //    nudged — never more than needed — until it clears AA 4.5:1.
  let solid = seed
  let deepInk = mix(seed, DEEP, 0.78)
  const useWhite = contrast(seed, WHITE) > contrast(seed, deepInk)
  let on = useWhite ? WHITE : deepInk
  for (let i = 0; i < 40 && contrast(solid, on) < 4.5; i++) {
    if (useWhite) solid = mix(solid, DEEP, 0.02)
    else { solid = mix(solid, WHITE, 0.03); deepInk = mix(deepInk, DEEP, 0.06); on = deepInk }
  }

  const scale = {
    50:  mix(solid, WHITE, 0.92),
    100: mix(solid, WHITE, 0.80),
    200: mix(solid, WHITE, 0.65),
    300: mix(solid, WHITE, 0.45),
    400: mix(solid, WHITE, 0.22),
    500: solid,
    600: mix(solid, DEEP, 0.18),
    700: mix(solid, DEEP, 0.36),
    800: mix(solid, DEEP, 0.54),
    900: mix(solid, DEEP, 0.72),
  }

  // 2. Brand ink for text on white AND on the common brand-500/15 tint.
  //    Use the LIGHTEST of 600/700/800 that passes, so a saturated seed keeps
  //    a clearly-branded link colour instead of collapsing to near-black.
  const tint = over(solid, L_SURFACE_RAISED, 0.15)
  const inkOk = (c) => contrast(c, L_SURFACE_RAISED) >= 5 && contrast(c, tint) >= 4.5
  let ink = [scale[600], scale[700], scale[800]].find(inkOk) || scale[800]
  for (let i = 0; i < 30 && !inkOk(ink); i++) ink = mix(ink, DEEP, 0.08)

  // 3. Fill for progress bars / dots — must separate from the track (≥ 3:1).
  let fill = solid
  for (let i = 0; i < 30 && Math.min(contrast(fill, L_SURFACE_OVERLAY), contrast(fill, L_SURFACE_INSET)) < 3; i++) fill = mix(fill, DEEP, 0.06)

  const t = {}
  Object.entries(scale).forEach(([k, v]) => { t[`--color-brand-${k}`] = trip(v) })
  t['--color-brand-on']   = trip(on)
  t['--color-brand-ink']  = trip(ink)
  t['--color-brand-fill'] = trip(fill)
  t['--color-accent']     = trip(fill)
  // Light wash: one shade softer than before (300/100/200/50, was
  // 400/200/300/100). The frosted cards sit on it, and with a saturated seed
  // the old wash pulled muted text under 4.5:1 at the blob centres.
  t['--mesh-1'] = `rgb(${trip(scale[300])})`
  t['--mesh-2'] = `rgb(${trip(scale[100])})`
  t['--mesh-3'] = `rgb(${trip(scale[200])})`
  t['--mesh-4'] = `rgb(${trip(scale[50])})`
  return t
}

// ── DARK token set ────────────────────────────────────────────────────────────
// Every neutral is built from the theme's own hue at low saturation, so Sage
// dark is a deep green-grey, Kashi purple dark is a deep aubergine-grey, etc.
// Nothing is translucent enough to let a bright wash bleed through.
function darkTokens(seed) {
  const { h, s } = rgbToHsl(seed)
  const ns = Math.min(0.2, Math.max(0.08, s * 0.32))   // neutral saturation
  // Brand saturation. A near-grey seed stays grey — lifting it to 0.28 would
  // invent a hue (hsl hue 0 = red) the tenant never chose.
  const bs = s < 0.1 ? s : Math.min(0.55, Math.max(0.28, s))
  const N  = (l, sat = ns) => hslToRgb(h, sat, l)

  const surface = N(0.075)
  const raised  = N(0.105)
  const overlay = N(0.14)
  const inset   = N(0.06)

  // Solid brand surface for dark: a calm, deeper tone with near-white ink.
  const on = hslToRgb(h, 0.45, 0.97)
  let sl = 0.52
  let solid = hslToRgb(h, bs, sl)
  while (contrast(solid, on) < 4.6 && sl > 0.2) { sl -= 0.01; solid = hslToRgb(h, bs, sl) }

  const scale = {
    50:  hslToRgb(h, bs, 0.93),
    100: hslToRgb(h, bs, 0.86),
    200: hslToRgb(h, bs, 0.77),
    300: hslToRgb(h, bs, 0.69),
    400: hslToRgb(h, bs, Math.max(sl + 0.08, 0.6)),
    500: solid,
    600: hslToRgb(h, bs, sl - 0.06),
    700: hslToRgb(h, bs, Math.max(0.24, sl - 0.13)),
    800: hslToRgb(h, bs * 0.9, 0.2),
    900: hslToRgb(h, bs * 0.85, 0.14),
  }

  let inkL = 0.8
  let ink = hslToRgb(h, Math.min(0.7, bs + 0.12), inkL)
  while (contrast(ink, raised) < 7 && inkL < 0.95) { inkL += 0.01; ink = hslToRgb(h, Math.min(0.7, bs + 0.12), inkL) }

  const t = {}
  Object.entries(scale).forEach(([k, v]) => { t[`--color-brand-${k}`] = trip(v) })
  t['--color-brand-on']   = trip(on)
  t['--color-brand-ink']  = trip(ink)
  t['--color-brand-fill'] = trip(scale[400])
  t['--color-accent']     = trip(scale[400])

  t['--color-surface']         = trip(surface)
  t['--color-surface-raised']  = trip(raised)
  t['--color-surface-overlay'] = trip(overlay)
  t['--color-surface-inset']   = trip(inset)
  t['--color-sidebar']         = trip(N(0.055))
  t['--color-border']          = trip(N(0.2))
  t['--color-border-subtle']   = trip(N(0.15))
  t['--color-border-strong']   = trip(N(0.3))
  t['--color-text-primary']    = trip(N(0.94, 0.18))
  t['--color-text-secondary']  = trip(N(0.81, 0.14))
  t['--color-text-muted']      = trip(N(0.68, 0.11))
  t['--color-text-faint']      = trip(N(0.58, 0.09))
  t['--color-text-inverse']    = trip(surface)
  t['--scrollbar-color']       = trip(N(0.27))
  t['--sidebar-dark']          = `rgb(${trip(N(0.05))})`

  // A whisper of the hue in the corners — never a light blob.
  // Dim enough to never glare, present enough for frosted glass to read.
  t['--mesh-1'] = `rgb(${trip(hslToRgb(h, 0.44, 0.19))})`
  t['--mesh-2'] = `rgb(${trip(hslToRgb(h, 0.3, 0.135))})`
  t['--mesh-3'] = `rgb(${trip(hslToRgb(h + 28, 0.32, 0.155))})`
  t['--mesh-4'] = `rgb(${trip(hslToRgb(h - 24, 0.26, 0.125))})`
  return t
}

/** seed hex → { light, dark } token maps. Returns null for an invalid hex. */
export function buildTheme(seedHex) {
  const seed = hexToRgb(seedHex)
  if (!seed) return null
  return { light: lightTokens(seed), dark: darkTokens(seed) }
}

const block = (sel, tokens) =>
  `${sel}{${Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';')}}`

/** The full stylesheet for a seed — light, dark and both "system" branches. */
export function buildThemeCss(seedHex) {
  const t = buildTheme(seedHex)
  if (!t) return null
  return [
    block(':root,[data-theme="light"]', t.light),
    block('[data-theme="dark"]', t.dark),
    `@media (prefers-color-scheme: dark){${block('[data-theme="system"]', t.dark)}}`,
    `@media (prefers-color-scheme: light){${block('[data-theme="system"]', t.light)}}`,
  ].join('\n')
}

const LEGACY_INLINE_PROPS = [
  ...[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(s => `--color-brand-${s}`),
  '--color-brand-ink', '--color-brand-on', '--color-brand-fill', '--color-accent',
  '--mesh-1', '--mesh-2', '--mesh-3', '--mesh-4',
]

/**
 * Paint a seed colour across the whole app (both themes) and cache the CSS for
 * the pre-React boot script. Safe to call repeatedly — it replaces, not adds.
 */
export function applyThemeColor(seedHex) {
  const css = buildThemeCss(seedHex)
  if (!css || typeof document === 'undefined') return false
  const root = document.documentElement
  // Old builds wrote these as inline styles, which outrank any stylesheet —
  // they would freeze the brand scale and the LIGHT mesh in dark mode.
  LEGACY_INLINE_PROPS.forEach(p => root.style.removeProperty(p))

  let el = document.getElementById(THEME_STYLE_ID)
  if (!el) {
    el = document.createElement('style')
    el.id = THEME_STYLE_ID
    document.head.appendChild(el)
  }
  if (el.textContent !== css) el.textContent = css
  try {
    localStorage.setItem(THEME_CSS_CACHE, css)
    localStorage.setItem(THEME_SEED_CACHE, seedHex)
  } catch { /* storage unavailable — boot falls back to index.html defaults */ }
  return true
}

/** The seed currently painted (for pickers that show the active colour). */
export function getAppliedSeed() {
  try { return localStorage.getItem(THEME_SEED_CACHE) } catch { return null }
}

/**
 * Contrast-solved swatches for a colour that is NOT (necessarily) the one
 * painted — e.g. the branding admin's preview of an unsaved colour. Light-mode
 * values, as CSS colour strings: { solid, on, ink }.
 */
export function previewColors(seedHex) {
  const t = buildTheme(seedHex)
  if (!t) return { solid: 'rgb(var(--color-brand-500))', on: 'rgb(var(--color-brand-on))', ink: 'rgb(var(--color-brand-ink))' }
  return {
    solid: `rgb(${t.light['--color-brand-500']})`,
    on:    `rgb(${t.light['--color-brand-on']})`,
    ink:   `rgb(${t.light['--color-brand-ink']})`,
  }
}
