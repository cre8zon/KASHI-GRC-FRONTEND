#!/usr/bin/env node
/**
 * Design-system guard — fails if hardcoded styling creeps back in.
 *
 * Wire into CI and/or package.json:
 *   "lint:design": "node tools/check-design-system.mjs"
 *   "prebuild":    "npm run lint:design"
 *
 * Every rule below maps to a Hard Rule in DESIGN.md. If you need a genuine
 * exception (third-party brand colour, print-stable report value), add the
 * file to ALLOWLIST with a reason — never weaken a rule.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, sep } from 'path'

const SRC = 'src'

// Genuine exceptions, each justified. Keep this list SHORT.
const ALLOWLIST = [
  { match: 'EngagementIntegrationTab', reason: 'third-party vendor logo colours (Okta/AWS/Azure/Google) must not follow the app theme' },
  { match: 'BrandingAdminPage',        reason: 'tenant colour-picker: its hexes are content/data, not styling' },
  { match: 'config/brandPresets',      reason: 'the pastel preset seed definitions themselves' },
]

const RULES = [
  {
    name: 'palette-classes',
    desc: 'Tailwind palette colours (use semantic tokens — DESIGN.md rule 1)',
    re: /(?<![\w-])(bg|text|border|ring|stroke|fill|divide|from|via|to|shadow|outline)-(red|rose|pink|green|emerald|lime|amber|yellow|orange|blue|cyan|sky|purple|indigo|violet|teal|gray|slate|zinc|neutral|stone)-[0-9]{2,3}(?![\w-])/g,
  },
  {
    name: 'raw-hex',
    desc: 'Raw hex colours (use CSS vars / tokens)',
    re: /#[0-9a-fA-F]{6}\b/g,
  },
  {
    name: 'rgb-literal',
    desc: 'Hardcoded rgb()/rgba() literals (use rgb(var(--token)))',
    re: /rgba?\(\s*\d+[\s,]/g,
  },
  {
    name: 'gradient',
    desc: 'Gradients are banned (DESIGN.md rule 3)',
    re: /bg-gradient-to-/g,
  },
  {
    name: 'white-black',
    desc: 'bg-white/text-white/black (use surface, on-dark, or tonal brand ink)',
    re: /(?<![\w-])(bg|text|border|ring|divide)-(white|black)(\/[0-9]{1,3})?(?![\w-])/g,
  },
  {
    name: 'legacy-radius',
    desc: 'Legacy radii (use rounded-badge/ctl/card/modal — DESIGN.md rule 4)',
    re: /(?<![\w-])rounded-(sm|md|lg|xl|2xl|3xl)(?![\w-])/g,
  },
  {
    name: 'white-on-brand',
    desc: 'TONAL RULE: white text on a pastel brand surface is unreadable — use text-brand-900',
    re: /bg-brand-[0-9]{3}[^"'`]*text-white|text-white[^"'`]*bg-brand-[0-9]{3}/g,
  },
]

/** Windows returns "src\config\x.js"; allowlist patterns use "/". Normalise. */
const toPosix = (p) => p.split(sep).join('/')

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(f)) out.push(p)
  }
  return out
}

let violations = 0
const files = walk(SRC)

for (const file of files) {
  const rel = toPosix(relative('.', file))
  const allowed = ALLOWLIST.find(a => rel.includes(a.match))
  const text = readFileSync(file, 'utf8')

  for (const rule of RULES) {
    // Allowlisted files are exempt from colour-value rules only, never from
    // structural rules like gradients or radii.
    if (allowed && ['raw-hex', 'palette-classes', 'white-black'].includes(rule.name)) continue

    const lines = text.split('\n')
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return   // skip comments
      const m = line.match(rule.re)
      if (m) {
        violations++
        console.error(`✗ ${rel}:${i + 1}  [${rule.name}]  ${m.slice(0, 3).join(', ')}`)
        console.error(`    ${rule.desc}`)
      }
    })
  }
}

if (violations) {
  console.error(`\n✗ Design-system guard FAILED — ${violations} violation(s).`)
  console.error('  See DESIGN.md. Use semantic tokens; do not hardcode colours or radii.')
  process.exit(1)
}
console.log(`✓ Design-system guard passed — ${files.length} files, 0 hardcoded styles.`)
