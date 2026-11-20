import { useMemo, useState } from 'react'
import { cn } from '../../lib/cn'

/**
 * Shows what changed between two policy bodies (HTML from the editor).
 *
 * ── HOW IT COMPARES ──────────────────────────────────────────────────────────
 * Policies are read section by section, so the comparison is too: each body is
 * split into blocks (headings, paragraphs, list items, table rows), the blocks
 * are aligned with a longest-common-subsequence match, and a block that was
 * edited rather than added or removed is then compared word by word. That
 * reads like a reviewer's markup: "this paragraph changed, these words" —
 * rather than a character diff of raw HTML, which is unreadable.
 *
 * Runs of unchanged blocks are folded, so a two-word edit in a 3,000-word
 * policy does not mean scrolling past 3,000 words to find it.
 *
 * Pure presentation: no API calls, no state outside the fold toggles.
 */

const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,tr,pre,blockquote'
const HEADING = /^H[1-6]$/

function toBlocks(html) {
  if (!html) return []
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const out = []
  doc.body.querySelectorAll(BLOCK_SELECTOR).forEach(el => {
    // Skip a block nested in another block (a <p> inside an <li> or a table
    // cell) — its text is already part of the outer block.
    if (el.parentElement?.closest(BLOCK_SELECTOR)) return
    const text = el.tagName === 'TR'
      ? [...el.children].map(c => c.textContent.trim()).join('  |  ')
      : el.textContent
    const norm = text.replace(/\s+/g, ' ').trim()
    if (norm) out.push({ text: norm, heading: HEADING.test(el.tagName) })
  })
  return out
}

/** LCS alignment over two sequences, returned as equal / del / ins operations. */
function align(a, b, eq) {
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (eq(a[i], b[j]))               { ops.push({ op: 'eq',  a: a[i], b: b[j] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ op: 'del', a: a[i] }); i++ }
    else                              { ops.push({ op: 'ins', b: b[j] }); j++ }
  }
  while (i < n) ops.push({ op: 'del', a: a[i++] })
  while (j < m) ops.push({ op: 'ins', b: b[j++] })
  return ops
}

/** Word-level marks for one edited block. Long blocks fall back to whole-block. */
function wordDiff(before, after) {
  const a = before.split(' '), b = after.split(' ')
  if (a.length * b.length > 250_000) return null
  return align(a, b, (x, y) => x === y)
}

/** Pair a removed block with the added block that replaced it. */
function toRows(ops) {
  const rows = []
  for (let k = 0; k < ops.length; k++) {
    const cur = ops[k], next = ops[k + 1]
    if (cur.op === 'del' && next?.op === 'ins') {
      rows.push({ kind: 'changed', before: cur.a, after: next.b, words: wordDiff(cur.a.text, next.b.text) })
      k++
    } else if (cur.op === 'eq')  rows.push({ kind: 'same',    block: cur.b })
    else if (cur.op === 'del')   rows.push({ kind: 'removed', block: cur.a })
    else                         rows.push({ kind: 'added',   block: cur.b })
  }
  return rows
}

function Block({ heading, className, children }) {
  return (
    <div className={cn('rounded-ctl px-3 py-1.5 text-sm leading-relaxed',
      heading && 'font-semibold', className)}>
      {children}
    </div>
  )
}

function Words({ ops }) {
  return ops.map((o, i) => {
    const w = o.op === 'eq' ? o.a : o.op === 'del' ? o.a : o.b
    const sep = i < ops.length - 1 ? ' ' : ''
    if (o.op === 'eq')  return <span key={i}>{w}{sep}</span>
    if (o.op === 'del') return <del key={i} className="bg-status-fail-bg text-status-fail-fg">{w}{sep}</del>
    return <ins key={i} className="no-underline bg-status-pass-bg text-status-pass-fg">{w}{sep}</ins>
  })
}

export default function PolicyDiffView({ beforeHtml, afterHtml, beforeLabel, afterLabel, className }) {
  const rows = useMemo(() => {
    const ops = align(toBlocks(beforeHtml), toBlocks(afterHtml), (x, y) => x.text === y.text)
    return toRows(ops)
  }, [beforeHtml, afterHtml])

  const [open, setOpen] = useState({})

  const stats = useMemo(() => rows.reduce((s, r) => {
    if (r.kind !== 'same') s[r.kind] += 1
    return s
  }, { added: 0, removed: 0, changed: 0 }), [rows])

  // Fold runs of 3+ unchanged blocks, keeping one either side for context.
  const items = []
  for (let i = 0; i < rows.length; ) {
    if (rows[i].kind !== 'same') { items.push({ row: rows[i], i }); i++; continue }
    let j = i
    while (j < rows.length && rows[j].kind === 'same') j++
    const run = j - i
    if (run >= 3 && !open[i]) {
      if (i > 0) items.push({ row: rows[i], i })
      items.push({ fold: true, start: i, hidden: run - (i > 0 ? 1 : 0) - (j < rows.length ? 1 : 0) })
      if (j < rows.length) items.push({ row: rows[j - 1], i: j - 1 })
    } else {
      for (let k = i; k < j; k++) items.push({ row: rows[k], i: k })
    }
    i = j
  }

  const nothing = stats.added + stats.removed + stats.changed === 0

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        {beforeLabel && afterLabel && (
          <span className="text-text-secondary">
            <span className="font-medium">{beforeLabel}</span> → <span className="font-medium">{afterLabel}</span>
          </span>
        )}
        {nothing ? <span>No differences</span> : (
          <>
            <span className="text-status-pass-fg">{stats.added} added</span>
            <span className="text-status-fail-fg">{stats.removed} removed</span>
            <span className="text-status-warn-fg">{stats.changed} changed</span>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {items.map((it, idx) => {
          if (it.fold) {
            return (
              <button key={`f${it.start}`} type="button"
                onClick={() => setOpen(o => ({ ...o, [it.start]: true }))}
                className="self-start px-3 py-1 text-xs text-text-muted hover:text-text-secondary">
                ⋯ {Math.max(it.hidden, 1)} unchanged {it.hidden === 1 ? 'section' : 'sections'} — show
              </button>
            )
          }
          const r = it.row
          if (r.kind === 'same') {
            return <Block key={idx} heading={r.block.heading} className="text-text-muted">{r.block.text}</Block>
          }
          if (r.kind === 'added') {
            return (
              <Block key={idx} heading={r.block.heading}
                className="border-l-2 border-status-pass-bd bg-status-pass-bg text-status-pass-fg">
                {r.block.text}
              </Block>
            )
          }
          if (r.kind === 'removed') {
            return (
              <Block key={idx} heading={r.block.heading}
                className="border-l-2 border-status-fail-bd bg-status-fail-bg text-status-fail-fg line-through">
                {r.block.text}
              </Block>
            )
          }
          return (
            <Block key={idx} heading={r.after.heading}
              className="border-l-2 border-status-warn-bd text-text-primary">
              {r.words
                ? <Words ops={r.words} />
                : <>
                    <del className="block bg-status-fail-bg text-status-fail-fg">{r.before.text}</del>
                    <ins className="block no-underline bg-status-pass-bg text-status-pass-fg">{r.after.text}</ins>
                  </>}
            </Block>
          )
        })}
      </div>
    </div>
  )
}
