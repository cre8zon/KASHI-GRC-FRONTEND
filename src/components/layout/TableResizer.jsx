/**
 * TableResizer — column resizing for every plain <table> in the app.
 *
 * DataTable has its own column controls (resize, show/hide, reorder). The
 * app also has many hand-built tables — admin pages, plans, billing, the tree
 * view. Rather than edit each one, this is mounted once in AppShell: it
 * watches the page, and gives every suitable table a drag edge on each header
 * cell, saving the widths per user on the server (/v1/me/table-preferences)
 * under a key made from the page path and the table's header labels.
 *
 *   drag a header's right edge  → resize that column (saved), the last one too
 *   double-click the edge       → back to its natural width
 *
 * Left alone:
 *   - DataTable's own table ([data-kg-table])
 *   - anything opted out with [data-no-resize]
 *   - tables in editable content (the policy editor's tables, rich text)
 *   - tables with no header row, one column, or merged header cells
 *
 * How a resize works: the first time a table is resized (or a saved layout is
 * applied), every header cell's current width is written onto it and the table
 * switches to a fixed layout, so each column then holds exactly the width it
 * is given. Only inline styles and a few small elements are added; React's
 * own nodes are never moved or removed.
 */
import { useEffect } from 'react'
import { tablePrefsApi } from '../../api/tablePrefs.api'
import { autoTableKey } from '../../lib/tableKey'

const MIN_W = 48
const MAX_W = 1000
const SKIP = '[data-kg-table], [data-no-resize], [contenteditable], .ProseMirror, .prose'

const saved = new Map()     // tableKey → { widths } | null   (fetched once per key)
const fetching = new Map()  // tableKey → Promise
const timers = new Map()    // tableKey → pending save timer

function headerRow(table) {
  const thead = table.tHead
  const row = thead ? thead.rows[thead.rows.length - 1] : table.rows[0]
  if (!row) return null
  const cells = Array.from(row.cells)
  if (cells.length < 2) return null
  if (!thead && !cells.every(c => c.tagName === 'TH')) return null
  if (cells.some(c => c.colSpan > 1)) return null
  return cells
}

const labelOf = (th, i) => (th.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) || `#${i}`

function keyFor(cells) {
  return autoTableKey('t:' + cells.map(labelOf).join('|'))
}

/** Pin every column at its current width and switch to a fixed layout. */
function freeze(table, cells) {
  if (table.dataset.kgFrozen) return
  const widths = cells.map(c => c.getBoundingClientRect().width)
  cells.forEach((c, i) => { c.style.width = `${Math.round(widths[i])}px` })
  table.style.tableLayout = 'fixed'
  table.classList.add('kg-resized')
  table.dataset.kgFrozen = '1'
  syncMinWidth(table, cells)
}

function unfreeze(table, cells) {
  cells.forEach(c => { c.style.width = '' })
  table.style.tableLayout = ''
  table.style.minWidth = ''
  table.classList.remove('kg-resized')
  delete table.dataset.kgFrozen
}

function syncMinWidth(table, cells) {
  const total = cells.reduce((s, c) => s + (parseFloat(c.style.width) || c.getBoundingClientRect().width), 0)
  table.style.minWidth = `${Math.round(total)}px`
}

function save(key, widths) {
  saved.set(key, Object.keys(widths).length ? { widths } : null)
  clearTimeout(timers.get(key))
  timers.set(key, setTimeout(() => {
    timers.delete(key)
    const p = Object.keys(widths).length
      ? tablePrefsApi.save(key, { widths })
      : tablePrefsApi.reset(key)
    p.catch(() => { /* a lost save only costs the layout, never the page */ })
  }, 500))
}

function applySaved(table, cells, prefs) {
  const widths = prefs?.widths
  if (!widths || typeof widths !== 'object') return
  const labels = cells.map(labelOf)
  if (!labels.some(l => widths[l] > 0)) return
  freeze(table, cells)
  cells.forEach((c, i) => {
    const w = Number(widths[labels[i]])
    if (w > 0) c.style.width = `${Math.min(MAX_W, Math.max(MIN_W, w))}px`
  })
  syncMinWidth(table, cells)
}

function addGrips(table, cells, key) {
  cells.forEach((th, i) => {
    if (th.querySelector(':scope > .kg-col-grip')) return
    if (getComputedStyle(th).position === 'static') th.style.position = 'relative'
    const grip = document.createElement('span')
    // The last column resizes too; its grip sits just inside the table's
    // edge so a scroll container or rounded card cannot clip it.
    grip.className = i === cells.length - 1 ? 'kg-col-grip kg-col-grip-last' : 'kg-col-grip'
    grip.setAttribute('role', 'separator')
    grip.setAttribute('aria-orientation', 'vertical')
    grip.title = 'Drag to resize · double-click to reset'
    grip.addEventListener('pointerdown', (e) => startDrag(e, table, key))
    grip.addEventListener('dblclick', (e) => {
      e.preventDefault(); e.stopPropagation()
      const cur = headerRow(table); if (!cur) return
      const label = labelOf(cur[cur.indexOf(th)] || th, cur.indexOf(th))
      const widths = { ...(saved.get(key)?.widths || {}) }
      delete widths[label]
      save(key, widths)
      if (!Object.keys(widths).length) unfreeze(table, cur)
      else { th.style.width = ''; syncMinWidth(table, cur) }
    })
    // A click on the edge must never reach the header (which may sort).
    grip.addEventListener('click', (e) => e.stopPropagation())
    th.appendChild(grip)
  })
}

function startDrag(e, table, key) {
  e.preventDefault(); e.stopPropagation()
  const cells = headerRow(table); if (!cells) return
  const th = e.currentTarget.parentElement
  const idx = cells.indexOf(th); if (idx < 0) return
  freeze(table, cells)
  const startX = e.clientX
  const startW = th.getBoundingClientRect().width
  let w = startW
  const grip = e.currentTarget
  grip.classList.add('kg-col-grip-active')
  document.body.classList.add('kg-col-resizing')
  const move = (ev) => {
    w = Math.round(Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX)))
    th.style.width = `${w}px`
    syncMinWidth(table, cells)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    grip.classList.remove('kg-col-grip-active')
    document.body.classList.remove('kg-col-resizing')
    // The release lands on the header too: swallow that one click so a
    // sortable header does not sort.
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault() }
    window.addEventListener('click', stop, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
    if (Math.abs(w - startW) < 2) return
    const widths = { ...(saved.get(key)?.widths || {}) }
    widths[labelOf(th, idx)] = w
    save(key, widths)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function enhance(table) {
  if (table.closest(SKIP)) return
  const cells = headerRow(table)
  if (!cells) return
  const key = keyFor(cells)
  // Headers can change (another page reusing the component): re-key then.
  if (table.dataset.kgKey !== key) {
    if (table.dataset.kgFrozen) unfreeze(table, cells)
    table.dataset.kgKey = key
    if (saved.has(key)) applySaved(table, cells, saved.get(key))
    else if (!fetching.has(key)) {
      const p = tablePrefsApi.get(key)
        .then(r => r?.prefs ?? r?.data?.prefs ?? null)
        .catch(() => null)
        .then(prefs => {
          fetching.delete(key)
          saved.set(key, prefs)
          if (table.isConnected && table.dataset.kgKey === key) {
            const cur = headerRow(table)
            if (cur) applySaved(table, cur, prefs)
          }
        })
      fetching.set(key, p)
    }
  }
  addGrips(table, cells, key)
}

export function TableResizer() {
  useEffect(() => {
    let frame = 0
    const scan = () => {
      frame = 0
      document.querySelectorAll('table').forEach(t => { try { enhance(t) } catch { /* never break a page */ } })
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(scan) }
    const mo = new MutationObserver(schedule)
    mo.observe(document.body, { childList: true, subtree: true })
    schedule()
    return () => { mo.disconnect(); if (frame) cancelAnimationFrame(frame) }
  }, [])
  return null
}