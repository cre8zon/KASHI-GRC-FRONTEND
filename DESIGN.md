# KashiGRC Design System — "Calm" v3 (pastel + glass)

The design contract. Every UI change — human or AI — must comply.
CI enforces it: `npm run lint:design` (runs automatically on `prebuild`).

## Direction

Calm, soft, pastel, smooth. A pastel gradient wash behind floating solid
cards; glass chrome (sidebar, top nav, drawers, menus, modals); generous
radii; pill statuses with dots; gentle 150–200ms motion; quiet mono codes
for the audit vernacular. Trustworthy without being stiff.

Font: **Albert Sans** (IBM Plex Mono for codes). Default theme: **light**.

**Glass law** — glass is for chrome and overlays; content is always solid.
`.glass-chrome` = sidebar + top nav (light sidebar mode only; dark/brand
sidebars stay solid). `.glass-overlay` = modals, drawers, dropdown menus.
Tables, cards, forms, reports = opaque. Solid fallback ships via `@supports`;
`@media print` forces solid + white (audit evidence must print clean).

**Pastel law** — the palette IS pastel; contrast comes from **tonal pairing**.
Buttons are `bg-brand-500 text-brand-900` (pastel surface + deep same-hue ink).
Links/rings/indicators use brand-800/900. **Never white text on pastel**
(the guard has a dedicated `white-on-brand` rule). Never a saturated CTA.

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
| UI | `--color-brand-*`, surface/text/border/status | ✅ all 12 presets |
| Charts | `--chart-1..8` | ✅ (light/dark variants) |
| Reports / PDF | `--rpt-*` | ❌ deliberately fixed |
| Dark chrome | `--sidebar-dark`, `--color-on-dark` | ❌ constant |

All defined in `index.html` as RGB triplets, consumed via
`rgb(var(--x) / <alpha-value>)`. Short aliases (`--surface`, `--text-primary`)
exist for inline styles and `.policy-content`.

## Legitimate hardcoding (guard allowlist)

- `EngagementIntegrationTab.jsx` — Okta/AWS/Azure/Google logo colours.
- `BrandingAdminPage.jsx` — the colour picker's swatch data (content).
- `config/brandPresets.js` — the 12 pastel seeds.

## Tools

- `tools/check-design-system.mjs` — CI guard (`npm run lint:design`).
- `tools/migrate_theme_v2.py` — the codemod, idempotent, CRLF-safe.
  `python3 tools/migrate_theme_v2.py` (dry-run) / `--apply`.

## Verify

`/admin/design-system` renders every primitive in the live theme. Check it
after any token change, in light AND dark, across a few presets.
