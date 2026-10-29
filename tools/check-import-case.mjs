#!/usr/bin/env node
/**
 * Import-case guard — fails if an import's spelling does not match the file on disk.
 *
 * WHY: Windows and macOS file systems ignore case, so
 *   import { X } from './PeopleMultiSelect'
 * happily loads "Peoplemultiselect.jsx" on a laptop, and then fails with
 * "Could not resolve" on a Linux build server, in CI or in Docker. This
 * script checks every relative import (and the '@/' alias) letter for letter
 * against the real directory listing, on every OS, so the mismatch is caught
 * where it is written.
 *
 *   node tools/check-import-case.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname, resolve, relative, sep } from 'path'

const SRC = 'src'
const EXTS = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.json', '.css']
const IMPORT_RE = /(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g

const toPosix = (p) => p.split(sep).join('/')
const listing = new Map()
const namesIn = (dir) => {
  if (!listing.has(dir)) listing.set(dir, existsSync(dir) ? readdirSync(dir) : [])
  return listing.get(dir)
}

/**
 * Real on-disk spelling of p, matching each segment case-insensitively (as
 * Windows/macOS do), or null if nothing matches. Works the same on Linux.
 */
function ciResolve(p) {
  const parts = toPosix(relative(process.cwd(), p)).split('/')
  let dir = process.cwd()
  const out = []
  for (const part of parts) {
    if (part === '..' || part === '.') { dir = resolve(dir, part); out.push(part); continue }
    const names = namesIn(dir)
    const hit = names.includes(part) ? part : names.find(n => n.toLowerCase() === part.toLowerCase())
    if (!hit) return null
    out.push(hit)
    dir = join(dir, hit)
  }
  return statSync(dir).isFile() ? out.join('/') : null
}

/** [what the import spells, what is really on disk] for the file it would load, or null. */
function findTarget(base) {
  const candidates = [
    ...EXTS.map(e => base + e),
    ...EXTS.slice(1).map(e => join(base, 'index' + e)),
  ]
  for (const c of candidates) {
    const real = ciResolve(c)
    if (real) return [toPosix(relative(process.cwd(), c)), real]
  }
  return null
}

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?|mjs)$/.test(f)) out.push(p)
  }
  return out
}

let bad = 0
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2] || m[3]
    let base
    if (spec.startsWith('.')) base = resolve(dirname(file), spec)
    else if (spec.startsWith('@/')) base = resolve(SRC, spec.slice(2))
    else continue                                   // package import
    const hit = findTarget(base)
    if (!hit) continue                              // genuinely missing: vite reports that itself
    const [spelled, real] = hit
    if (spelled !== real) {
      bad++
      const line = text.slice(0, m.index).split('\n').length
      console.error(`✗ ${toPosix(file)}:${line}  imports '${spec}'`)
      console.error(`    but the file on disk is ${real} — match the case exactly`)
    }
  }
}

if (bad) {
  console.error(`\n✗ Import-case guard FAILED — ${bad} import(s) whose case differs from the file name.`)
  console.error('  These load on Windows/macOS but break the build on Linux. Rename the file or fix the import.')
  process.exit(1)
}
console.log('✓ Import-case guard passed — every import matches its file name exactly.')
