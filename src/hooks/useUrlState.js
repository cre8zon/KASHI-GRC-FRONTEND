/**
 * useUrlState — view state that survives refresh, Back, and app-tab switches.
 *
 * ── WHY THE URL AND NOT REDUX / sessionStorage ──────────────────────────────
 * Screen state (active tab, page number, sort, search) was held in useState, so
 * every refresh dropped it back to defaults and Back landed on the previous
 * screen in its default state. The obvious fix is to park it in Redux, and the
 * detail page already half-does that via saveSubTab — but Redux is memory, so
 * it dies on refresh too, and it is keyed by app tab rather than by history
 * entry, so Back cannot restore what a *previous* entry looked like.
 *
 * The URL is the only store that all three cases already read from:
 *   refresh          — the browser replays the URL
 *   Back / Forward   — the browser replays the URL, per history entry
 *   app tab switches — RouteSync already saves `pathname + search` onto the tab
 *                      and navigates back to it, so search params ride along
 *                      with no extra wiring
 *
 * Putting state here therefore fixes all three at once, and makes every screen
 * linkable and shareable as a side effect: paste a URL, get that exact view.
 *
 * ── WHY replace: true BY DEFAULT ────────────────────────────────────────────
 * Pushing a history entry per tab click or per keystroke turns Back into "undo
 * my last UI fidget" and the user has to press it fifteen times to leave the
 * page. Replacing keeps one entry per screen: Back leaves the screen, and the
 * screen it lands on restores its own state from its own entry. Pass
 * { replace: false } where a change genuinely is a new place worth stepping
 * back through.
 *
 * ── WHY DEFAULTS ARE DELETED FROM THE URL ───────────────────────────────────
 * So the common case stays clean: /module/audit_engagement/12 rather than
 * ...?tab=overview&page=0&sortDir=desc. A param present therefore always means
 * "deliberately not the default", which is also what makes the deep-link
 * priority in the detail page readable.
 */
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useUrlState(key, defaultValue = '', { replace = true } = {}) {
  const [searchParams, setSearchParams] = useSearchParams()

  const raw = searchParams.get(key)
  const value = raw === null ? defaultValue : raw

  const set = useCallback((next) => {
    setSearchParams(prev => {
      // Always start from the live params, never from a captured copy — this
      // page also carries taskId, stepInstanceId and frameworkRef, and a stale
      // snapshot would silently drop the workflow task context on a tab click.
      const p = new URLSearchParams(prev)
      const current = p.get(key) ?? defaultValue
      const resolved = typeof next === 'function' ? next(current) : next

      const isDefault =
        resolved === null || resolved === undefined || resolved === '' ||
        String(resolved) === String(defaultValue)

      if (isDefault) p.delete(key)
      else p.set(key, String(resolved))
      return p
    }, { replace })
  }, [key, defaultValue, replace, setSearchParams])

  return [value, set]
}

/** Same, for params that are naturally numeric (page index, ids). */
export function useUrlNumber(key, defaultValue = 0, opts) {
  const [raw, setRaw] = useUrlState(key, String(defaultValue), opts)
  const parsed = Number(raw)
  const value = Number.isFinite(parsed) ? parsed : defaultValue

  const set = useCallback((next) => {
    setRaw(prevRaw => {
      const prevNum = Number(prevRaw)
      const base = Number.isFinite(prevNum) ? prevNum : defaultValue
      const resolved = typeof next === 'function' ? next(base) : next
      return resolved === null || resolved === undefined ? null : String(resolved)
    })
  }, [setRaw, defaultValue])

  return [value, set]
}

/**
 * Write SEVERAL params in one navigation.
 *
 * ── WHY THIS IS NECESSARY ───────────────────────────────────────────────────
 * setSearchParams(fn) evaluates fn against the CURRENT location, not against a
 * pending update. Two calls in the same event handler therefore both read the
 * original params and the second overwrites the first:
 *
 *   setOrigin("GLOBAL")   // -> ?origin=GLOBAL
 *   setPage(0)            // recomputes from the ORIGINAL params, drops origin
 *
 * The visible symptom is a control that appears completely dead — the URL ends
 * up exactly as it started, so nothing refetches and nothing re-renders. This
 * is not React state; there is no batching to rely on.
 *
 * Anything that changes a filter AND resets paging has to go through here.
 *
 * Pass null/undefined/"" to remove a key.
 */
export function useUrlWriter({ replace = true } = {}) {
  const [, setSearchParams] = useSearchParams()

  return useCallback((updates) => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      Object.entries(updates).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') p.delete(k)
        else p.set(k, String(v))
      })
      return p
    }, { replace })
  }, [setSearchParams, replace])
}