/**
 * ScrollRestore — puts the scroll position back where it was.
 *
 * The app scrolls one element (#main-scroll in TabContentRenderer), not the
 * window, so the browser's own scroll restoration never applied: it restores
 * document scroll, and the document never moves. Every navigation therefore
 * landed at the top, including Back onto a list the user had scrolled halfway
 * down and had to find their place in again.
 *
 * ── KEYED BY HISTORY ENTRY, NOT BY PATH ─────────────────────────────────────
 * location.key is unique per history entry, so two visits to the same list —
 * one before opening a record and one after coming Back — keep separate
 * offsets. Keying by pathname instead would make the second visit inherit the
 * first's position even when arriving fresh from the menu, which feels broken
 * in the opposite direction.
 *
 * ── sessionStorage, NOT MEMORY ──────────────────────────────────────────────
 * So a refresh keeps the position too, and so it dies with the tab rather than
 * accumulating forever. Per-tab isolation is a property of sessionStorage and
 * is what we want: two browser tabs on the same screen scroll independently.
 *
 * ── WHY RESTORING IS A LOOP AND NOT ONE ASSIGNMENT ──────────────────────────
 * Content arrives from react-query after the route renders, so at first paint
 * the container is a few hundred pixels tall and scrollTop = 4000 clamps to the
 * bottom of nothing. The loop retries each frame until the content is tall
 * enough to hold the target, then stops. It also gives up after a budget, so a
 * screen that never grows that tall (a list that returned fewer rows this time)
 * settles wherever it can instead of spinning.
 *
 * PUSH navigations deliberately go to the top: arriving somewhere new mid-page
 * is disorienting. Only POP — Back/Forward — restores.
 */
import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

const KEY_PREFIX = 'kashi:scroll:'
const RESTORE_BUDGET_MS = 1200

function container() {
  return document.getElementById('main-scroll')
}

export function ScrollRestore() {
  const location = useLocation()
  const navType = useNavigationType()      // 'POP' | 'PUSH' | 'REPLACE'
  const frame = useRef(0)

  // Save on scroll. rAF-coalesced: a scroll handler that writes to
  // sessionStorage on every event janks the list on a trackpad.
  useEffect(() => {
    const el = container()
    if (!el) return

    let pending = false
    const onScroll = () => {
      if (pending) return
      pending = true
      requestAnimationFrame(() => {
        pending = false
        try {
          sessionStorage.setItem(KEY_PREFIX + location.key, String(el.scrollTop))
        } catch {
          // Private mode / quota. Losing scroll position is not worth an error.
        }
      })
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [location.key])

  // Restore (or reset) when the history entry changes.
  useEffect(() => {
    const el = container()
    if (!el) return

    cancelAnimationFrame(frame.current)

    if (navType === 'PUSH') {
      el.scrollTop = 0
      return
    }

    let saved = 0
    try {
      saved = Number(sessionStorage.getItem(KEY_PREFIX + location.key)) || 0
    } catch { saved = 0 }

    if (saved <= 0) {
      if (navType !== 'REPLACE') el.scrollTop = 0
      return
    }

    const deadline = performance.now() + RESTORE_BUDGET_MS
    const attempt = () => {
      const reachable = el.scrollHeight - el.clientHeight
      if (reachable >= saved) {
        el.scrollTop = saved
        return                                  // content is tall enough — done
      }
      if (performance.now() > deadline) {
        el.scrollTop = reachable > 0 ? reachable : 0
        return                                  // as close as this screen allows
      }
      frame.current = requestAnimationFrame(attempt)
    }
    frame.current = requestAnimationFrame(attempt)

    return () => cancelAnimationFrame(frame.current)
  }, [location.key, navType])

  return null
}