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
 *
 * BASELINE — existing debt does not block the build, new debt does.
 *   tools/design-baseline.json holds how many violations each file has per
 *   rule today. A file/rule over its baseline count fails the build (that is
 *   new hardcoded styling); at or under it passes. Counts, not line numbers,
 *   so editing a file elsewhere does not trip it.
 *
 *   node tools/check-design-system.mjs --update-baseline
 *     rewrites the baseline from the current code. Run it once to adopt the
 *     baseline, and again after cleaning a file up, so the lower count becomes
 *     the new ceiling (the guard tells you when that is possible). Never run it
 *     to make a NEW violation pass.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs'
import { join, relative, sep } from 'path'

const SRC = 'src'
const BASELINE_FILE = 'tools/design-baseline.json'
// No baseline yet (first run after adopting it): record today's code as the
// baseline instead of failing on all of it. Every later run compares against it.
const FIRST_RUN = !existsSync(BASELINE_FILE)
const UPDATE = FIRST_RUN || process.argv.includes('--update-baseline')
const baseline = !UPDATE
  ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  : {}

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

let violations = 0     // over the baseline — these fail the build
let known = 0          // within the baseline — existing debt, reported as a count
const counts = {}      // "file|rule" → count, for --update-baseline and the ratchet hint
const files = walk(SRC)

for (const file of files) {
  const rel = toPosix(relative('.', file))
  const allowed = ALLOWLIST.find(a => rel.includes(a.match))
  const text = readFileSync(file, 'utf8')

  for (const rule of RULES) {
    // Allowlisted files are exempt from colour-value rules only, never from
    // structural rules like gradients or radii.
    if (allowed && ['raw-hex', 'palette-classes', 'white-black'].includes(rule.name)) continue

    const hits = []
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return   // skip comments
      const m = line.match(rule.re)
      if (m) hits.push({ line: i + 1, m })
    })
    if (!hits.length) continue

    const key = `${rel}|${rule.name}`
    counts[key] = hits.length
    const allowedCount = baseline[key] || 0
    if (UPDATE || hits.length <= allowedCount) { known += hits.length; continue }

    // Over the baseline: we cannot tell which lines are the new ones, so list
    // them all for this file and rule.
    violations += hits.length - allowedCount
    console.error(`✗ ${rel}  [${rule.name}]  ${hits.length} found, baseline allows ${allowedCount}`)
    console.error(`    ${rule.desc}`)
    for (const h of hits) console.error(`      :${h.line}  ${h.m.slice(0, 3).join(', ')}`)
  }
}

if (UPDATE) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(BASELINE_FILE, JSON.stringify(sorted, null, 2) + '\n')
  const total = Object.values(sorted).reduce((a, b) => a + b, 0)
  console.log(`✓ Baseline written to ${BASELINE_FILE} — ${total} existing violation(s) in ${Object.keys(sorted).length} file/rule pair(s).`)
  if (FIRST_RUN) console.log('  First run: no baseline existed, so today\'s code was recorded as the baseline. Commit it.')
  process.exit(0)
}

if (violations) {
  console.error(`\n✗ Design-system guard FAILED — ${violations} new violation(s) above the baseline.`)
  console.error('  See DESIGN.md. Use semantic tokens; do not hardcode colours or radii.')
  process.exit(1)
}

// Ratchet hint: debt went down somewhere, so the ceiling can come down too.
const improved = Object.keys(baseline).filter(k => (counts[k] || 0) < baseline[k])
console.log(`✓ Design-system guard passed — ${files.length} files, no new hardcoded styles`
  + (known ? ` (${known} existing, in the baseline).` : '.'))
if (improved.length) {
  console.log(`  ${improved.length} file/rule pair(s) now below the baseline — run with --update-baseline to lock that in.`)
}
