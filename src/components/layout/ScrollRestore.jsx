/**
 * ScrollRestore — puts the scroll position back where it was.
 *
 * ── WHICH ELEMENT ACTUALLY SCROLLS ──────────────────────────────────────────
 * Not the window: the browser's own scroll restoration never applies, because
 * the document never moves. Not #main-scroll either, despite that being the
 * obvious candidate — on any page built on PageLayout it measures 634/634 and
 * never moves, because PageLayout's root is h-full/overflow-hidden and its
 * content div takes the overflow instead. That content div is the real
 * container, and it carries data-scroll-restore="page".
 *
 * So containers are found by attribute, not by id. Any other scrollable pane
 * opts in the same way — one attribute, no other wiring. #main-scroll is still
 * tracked for the routes that do scroll it.
 *
 * ── KEYED BY HISTORY INDEX, NOT location.key ────────────────────────────────
 * location.key is unique per history entry, which sounds right, but a REPLACE
 * mints a NEW key for the SAME entry — and this app replaces constantly:
 * RouteSync re-navigates to the active app tab with { replace: true }, and
 * useUrlState writes ?tab= the same way. Back restored against key B, a replace
 * fired, and the effect re-ran against key B' with nothing saved.
 *
 * window.history.state.idx survives a replace, increments on push, and returns
 * to its previous value on Back. The pathname is stored alongside the offset
 * because pushing after Back REUSES an index for a different page; without the
 * check that page would inherit an offset belonging to whatever was there
 * before.
 *
 * ── sessionStorage, NOT MEMORY ──────────────────────────────────────────────
 * So a refresh keeps the position, and so it dies with the tab rather than
 * accumulating forever. Per-tab isolation is a property of sessionStorage and
 * is what we want: two browser tabs on the same screen scroll independently.
 *
 * ── WHY RESTORING IS A LOOP AND NOT ONE ASSIGNMENT ──────────────────────────
 * Content arrives from react-query after the route renders, so at first paint
 * the container is a few hundred pixels tall and scrollTop = 4000 clamps to the
 * bottom of nothing. The loop retries each frame until the content is tall
 * enough to hold the target. It reads up front which containers this entry has
 * offsets for, so it keeps waiting for one that mounts late instead of exiting
 * as soon as the containers present on frame 1 are done. It also gives up after
 * a budget, so a screen that never grows that tall settles wherever it can
 * instead of spinning.
 *
 * PUSH navigations deliberately go to the top: arriving somewhere new mid-page
 * is disorienting. Only POP — Back/Forward — restores. REPLACE does nothing at
 * all: same entry, and re-running would cancel an in-flight restore.
 */
import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

const KEY_PREFIX = 'kashi:scroll:'
const RESTORE_BUDGET_MS = 3000

const MAIN_ID = 'main'

/**
 * Every container we track: #main-scroll plus anything opting in with
 * data-scroll-restore="<id>". Re-queried each frame during restore, because
 * inner containers mount after their data arrives - long after the route does.
 */
function containers() {
  const out = []
  const main = document.getElementById('main-scroll')
  if (main) out.push([MAIN_ID, main])
  document.querySelectorAll('[data-scroll-restore]').forEach(el => {
    const id = el.getAttribute('data-scroll-restore')
    if (id) out.push([id, el])
  })
  return out
}

/**
 * Keyed by HISTORY INDEX, not location.key.
 *
 * location.key looked right - unique per entry, so two visits to the same list
 * keep separate offsets - but a REPLACE mints a NEW key for the SAME entry, and
 * this app replaces constantly: RouteSync re-navigates to the active app tab
 * with { replace: true }, and useUrlState writes ?tab= the same way. So Back
 * restored against key B, a replace fired, the effect re-ran against key B' with
 * nothing saved, and the restore silently became a no-op. It worked exactly once
 * - before the stored tab route had drifted enough to trigger a replace.
 *
 * history.state.idx survives a replace (same entry, same index), increments on
 * push and returns to its old value on Back. That is precisely the identity we
 * want. The pathname is stored alongside because a push after Back REUSES an
 * index for a different page - without the check, that page would inherit an
 * offset belonging to whatever used to live there.
 */
function historyIndex() {
  const idx = window.history.state?.idx
  return typeof idx === 'number' && idx >= 0 ? idx : 0
}

function storageKey(id) {
  return `${KEY_PREFIX}${historyIndex()}:${id}`
}

function readSaved(id, pathname) {
  try {
    const raw = sessionStorage.getItem(storageKey(id))
    if (!raw) return 0
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.p !== pathname) return 0   // index reused by another page
    return Number(parsed.t) || 0
  } catch {
    return 0
  }
}

export function ScrollRestore() {
  const location = useLocation()
  const navType = useNavigationType()      // 'POP' | 'PUSH' | 'REPLACE'
  const frame = useRef(0)

  // Save on scroll. One capture-phase listener on document rather than one per
  // element: scroll does not bubble but it does capture, and this way a
  // container that mounts later is covered without re-binding anything.
  // rAF-coalesced, since writing to sessionStorage on every scroll event janks
  // the list on a trackpad.
  useEffect(() => {
    const dirty = new Map()
    let scheduled = false

    const flush = () => {
      scheduled = false
      dirty.forEach((el, id) => {
        try {
          sessionStorage.setItem(storageKey(id),
            JSON.stringify({ p: window.location.pathname, t: el.scrollTop }))
        } catch {
          // Private mode / quota. Losing scroll position is not worth an error.
        }
      })
      dirty.clear()
    }

    const onScroll = (e) => {
      const el = e.target
      if (!el || el.nodeType !== 1) return          // document / window scrolls
      const id = el.id === 'main-scroll'
        ? MAIN_ID
        : el.getAttribute('data-scroll-restore')
      if (!id) return
      dirty.set(id, el)                             // per container, so two
      if (scheduled) return                         // scrolling at once is fine
      scheduled = true
      requestAnimationFrame(flush)
    }

    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [location.key])

  // Restore (or reset) when the history entry changes.
  useEffect(() => {
    cancelAnimationFrame(frame.current)

    // REPLACE keeps the same history entry, so there is nothing to restore or
    // reset - and re-running here is what used to cancel an in-flight restore.
    if (navType === 'REPLACE') return

    if (navType === 'PUSH') {
      containers().forEach(([, el]) => { el.scrollTop = 0 })
      return
    }

    const deadline = performance.now() + RESTORE_BUDGET_MS
    const settled = new Set()

    // Which containers this history entry actually has an offset for. Without
    // this the loop exited on frame 1: only #main-scroll is mounted that early,
    // it settles, and "everything present is done" looked like "everything is
    // done" - so a nested list that mounts once its query resolves was never
    // reached. Reading the saved keys up front means we know to keep waiting.
    const expected = new Set()
    try {
      const prefix = `${KEY_PREFIX}${historyIndex()}:`
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)
        if (!k || !k.startsWith(prefix)) continue
        const id = k.slice(prefix.length)
        if (readSaved(id, location.pathname) > 0) expected.add(id)
      }
    } catch {
      // No trail available: the loop just runs to its deadline instead.
    }


    // If the user scrolls while we are still waiting for content, stop: fighting
    // them is worse than landing in the wrong place.
    let aborted = false
    const abort = () => { aborted = true }
    window.addEventListener('wheel', abort, { passive: true, once: true })
    window.addEventListener('touchstart', abort, { passive: true, once: true })
    window.addEventListener('keydown', abort, { once: true })

    const attempt = () => {
      const list = containers()

      for (const [id, el] of list) {
        if (settled.has(id)) continue

        const saved = readSaved(id, location.pathname)

        if (saved <= 0) {
          if (navType !== 'REPLACE') el.scrollTop = 0
          settled.add(id)
          continue
        }

        // Content arrives from react-query after the route renders, so at first
        // paint the container is short and scrollTop = 4000 clamps to nothing.
        const reachable = el.scrollHeight - el.clientHeight
        if (reachable >= saved) {
          el.scrollTop = saved
          settled.add(id)
        }
      }

      // Done only when every container we SAVED an offset for has been put
      // back - not merely when the ones mounted so far have.
      const allExpectedSettled = [...expected].every(id => settled.has(id))
      if (allExpectedSettled && list.every(([id]) => settled.has(id))) return

      if (performance.now() > deadline) {
        // Give up gracefully: a screen that never grew that tall (fewer rows
        // this time) settles as close as it can rather than spinning.
        for (const [id, el] of list) {
          if (settled.has(id)) continue
          const reachable = el.scrollHeight - el.clientHeight
          el.scrollTop = reachable > 0 ? reachable : 0
        }
        return
      }

      frame.current = requestAnimationFrame(attempt)
    }

    frame.current = requestAnimationFrame(attempt)
    return () => {
      cancelAnimationFrame(frame.current)
      window.removeEventListener('wheel', abort)
      window.removeEventListener('touchstart', abort)
      window.removeEventListener('keydown', abort)
    }
  }, [location.key, navType])

  return null
}