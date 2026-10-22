# KashiGuard Design System — "Calm" v4 (brand + pastel, engine-generated themes)

The design contract. Every UI change — human or AI — must comply.
CI enforces it: `npm run lint:design` (runs automatically on `prebuild`).

## Direction

Calm, soft, pastel, smooth. A pastel gradient wash behind floating solid
cards; glass chrome (sidebar, top nav, drawers, menus, modals); generous
radii; pill statuses with dots; gentle 150–200ms motion; quiet mono codes
for the audit vernacular. Trustworthy without being stiff.

Font: **Albert Sans** (IBM Plex Mono for codes). Default theme: **light**,
default colour: **Kashi Purple `#936EC8`** for every user who has not chosen one.

**Glass law (v4)** — glass everywhere, readable everywhere. Six layers in
`src/index.css` (`@layer components`, so utilities on the same element win):
`.glass-chrome` (sidebar, top nav, tab bars) · `.glass-card` (cards, panels,
tiles — the default for `<Card>` and any `rounded-card` container) ·
`.glass-inset` (panel nested in a card) · `.glass-overlay` (modals, drawers,
menus, popovers) · `.glass-field` (inputs) · `.glass-button` (secondary
buttons). Each = translucent fill + blur + saturation + 1px rim + specular top
highlight. Fill opacity per theme is set so text keeps AA over the brightest
part of the wash (audited per preset). Solid fallback without backdrop-filter,
with `prefers-reduced-transparency`, and in print. Use `<Card solid>` only for
very dense data tables.

**Theme engine** — `src/lib/themeEngine.js` is the ONLY place a colour becomes
tokens. A seed hex produces a full LIGHT and DARK token set (brand scale, ink,
on-brand ink, fill, wash, and — in dark — every neutral tinted with the theme's
own hue), injected as `<style id="kashi-theme-vars">`. Never write
`--color-brand-*` / `--mesh-*` as inline styles: inline styles outrank
`[data-theme="dark"]` and freeze the light palette in dark mode.

**Contrast is solved by the engine, not by components.**
| Token | Use | Guarantee |
|---|---|---|
| `bg-brand-500` + `text-brand-on` | solid buttons, active pills, avatars | ≥ 4.5:1 every preset, both themes |
| `text-brand-ink` | links, brand text/icons on neutral or `bg-brand-500/10–20` tints | ≥ 4.5:1 |
| `bg-brand-fill` | progress fills, dots, indicators | ≥ 3:1 vs the track |
Never `text-white` / `text-brand-900` / `text-on-dark` on `bg-brand-500` —
white is right for Kashi Purple and invisible on the pastels; the engine knows
which. Status fills (bars, dots, solid buttons) use `-fg`; `-bg` is for chips.

**Dark theme** — tinted dark glass (cards 62%, chrome 74%, overlays 90%) over
four dim glows in the theme's own hue. Every composite stays dark, so light
text keeps ≥ 7:1. No light blobs behind content, no pastel pills.

## Hard Rules

1. **No raw palette colours, hexes, or rgb() literals in JSX.** Use tokens:
   surfaces `bg-surface|-raised|-overlay|-inset`; text `text-text-primary|
   -secondary|-muted|-faint`; borders `border-border|-subtle|-strong`;
   action `brand-*`; state `status-{pass|fail|warn|info|pending|tag}-{bg|fg|bd}`.
2. **Statuses are soft pills**: tinted bg + saturated readable text + leading
   dot + full radius, no border. Use `<Badge colorTag=…>` or `status-*`.
3. **No gradients.**
4. **Radii**: `rounded-badge` (pill) / `rounded-ctl` (8px) / `rounded-card`
   (12px) / `rounded-modal` (16px). Never `rounded-lg|md|xl`.
5. **Depth is shadow-first**: `shadow-elevated` on cards, lifting to
   `shadow-hover`; `shadow-overlay` on modals/drawers. Borders recede.
   `prefers-reduced-motion` respected.
6. **Typography**: Albert Sans everywhere (tabular figures global). IBM Plex
   Mono ONLY for control codes / evidence IDs / hashes — wrap in `.reg-code`.
7. **Semantic mapping** — choose by meaning, never hue:
   | Meaning | Token |
   |---|---|
   | Compliant / pass / complete | `status-pass` |
   | Non-compliant / fail / overdue | `status-fail` |
   | At-risk / pending review | `status-warn` |
   | Informational / in-progress | `status-info` |
   | Not started / draft | `status-pending` |
   | Framework & entity tags | `status-tag` |
8. **Dark theme chips are solid** — never `/10` alpha translucency.
9. **Colour strategy**: GRC brand space is saturated with blue/indigo/purple
   (Drata, Sprinto, Secureframe, Hyperproof), green (OneTrust, ServiceNow,
   Wrike), orange (AuditBoard), purple (Vanta). The pastel wheel + tonal
   pairing is unclaimed. 12 presets in `src/config/brandPresets.js`.
10. **Status is never colour alone** — colour + label (icon where space
    allows). Screens must survive greyscale: auditors print evidence.
11. **Charts use `--chart-1..8` only.** Status tokens never appear in charts;
    chart colours never appear in badges.
12. **Reports use `--rpt-*` only** — print-stable and theme-INDEPENDENT. A
    printed report must look identical for every user's theme.
13. **`on-dark` tokens** (`text-on-dark`, `bg-on-dark/10`) are constant white
    in BOTH themes — for the dark sidebar, which stays dark in light mode.
    Never use `text-white` directly.

## Token layers

| Layer | Tokens | Follows theme? |
|---|---|---|
| UI | `--color-brand-*` (+ `-on`, `-ink`, `-fill`), surface/text/border/status | ✅ Kashi Purple + 12 pastels, generated per theme |
| Charts | `--chart-1..8` | ✅ (light/dark variants) |
| Reports / PDF | `--rpt-*` | ❌ deliberately fixed |
| Dark chrome | `--sidebar-dark`, `--color-on-dark` | ❌ constant |

All defined in `index.html` as RGB triplets, consumed via
`rgb(var(--x) / <alpha-value>)`. Short aliases (`--surface`, `--text-primary`)
exist for inline styles and `.policy-content`.

## Legitimate hardcoding (guard allowlist)

- `EngagementIntegrationTab.jsx` — Okta/AWS/Azure/Google logo colours.
- `BrandingAdminPage.jsx` — the colour picker's swatch data (content).
- `config/brandPresets.js` — the Kashi Purple + 12 pastel seeds.

## Tools

- `tools/check-design-system.mjs` — CI guard (`npm run lint:design`).
- `tools/migrate_theme_v2.py` — the codemod, idempotent, CRLF-safe.
  `python3 tools/migrate_theme_v2.py` (dry-run) / `--apply`.

## Verify

Token contrast for every preset × theme is checked by the audit described in
the v4 change notes (793 pairs, 0 failures at release).

`/admin/design-system` renders every primitive in the live theme. Check it
after any token change, in light AND dark, across a few presets.
