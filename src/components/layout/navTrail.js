/**
 * NavTrail — remembers which page each history entry holds.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 * The in-app Back button is not the browser's Back. It navigates UP to the
 * parent entity, which is deliberate: a detail page opened from a notification,
 * a bookmark or a new tab has nothing behind it in history, and navigate(-1)
 * would leave the app.
 *
 * But that push costs two things whenever history DOES hold the parent:
 *   - the pushed URL carries no ?tab=, so the parent opens on its default tab
 *   - it is a new location.key, so ScrollRestore has no offset saved for it and
 *     the list opens at the top
 * Browser Back has neither problem, which is exactly the difference people
 * notice: "browser back keeps my tab, the app's back button doesn't".
 *
 * So the Back button needs to answer one question — "would Back land where I am
 * about to push?" — and POP when the answer is yes. React Router does not
 * expose the previous entry, so we record the trail ourselves.
 *
 * ── KEYED BY history.state.idx ──────────────────────────────────────────────
 * React Router maintains a monotonic idx on each history entry. Writing the
 * trail at that index makes it a true array of the session's history, so the
 * entry Back would reach is simply idx - 1 — no guessing, and Forward works too.
 *
 * Truncating at idx on every write matters: pushing after going Back discards
 * the forward entries in the real history, and the trail has to discard them in
 * step or it would report a stale page that is no longer reachable.
 *
 * sessionStorage for the same reasons ScrollRestore uses it: survives a
 * refresh, dies with the tab, isolated per tab.
 */

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const KEY = 'kashi:nav:trail'
const MAX_ENTRIES = 50

function currentIndex() {
  const idx = window.history.state?.idx
  return typeof idx === 'number' && idx >= 0 ? idx : 0
}

function readTrail() {
  try {
    const raw = sessionStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Private mode, quota, or corrupted JSON. A missing trail only means the
    // Back button falls back to pushing the parent, which is the old behaviour.
    return []
  }
}

function writeTrail(trail) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-MAX_ENTRIES)))
  } catch {
    // Not worth an error: see above.
  }
}

/**
 * The entry the browser's Back button would land on, or null when this is the
 * first entry in the tab's history (or the trail is unavailable).
 *
 * @returns {{ pathname: string, search: string } | null}
 */
export function previousEntry() {
  const idx = currentIndex()
  if (idx <= 0) return null
  return readTrail()[idx - 1] ?? null
}

/** Mount once, next to ScrollRestore. Renders nothing. */
export function NavTrail() {
  const location = useLocation()

  useEffect(() => {
    const idx = currentIndex()
    const trail = readTrail()
    // Drop anything past this entry: a push after Back makes those unreachable.
    const next = trail.slice(0, idx)
    next[idx] = { pathname: location.pathname, search: location.search }
    writeTrail(next)
  }, [location.key, location.pathname, location.search])

  return null
}