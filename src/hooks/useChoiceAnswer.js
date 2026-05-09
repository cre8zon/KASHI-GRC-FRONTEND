/**
 * useChoiceAnswer — race-safe, optimistic choice selection.
 *
 * WHY THIS EXISTS
 * ───────────────
 * React batches state updates. Rapid multi-clicks read stale state — so B sees
 * the set before A was applied, C sees it before B, and the last save wins with
 * wrong data. This hook fixes that with a ref as the synchronous source of truth.
 *
 * ARCHITECTURE
 * ────────────
 *  selectionRef   — updated synchronously on every click (no batching, no stale closure)
 *  displaySet     — React state derived from ref, used only for rendering
 *  timerRef       — debounce handle; cleared/reset on every click
 *  inFlightRef    — true from click until server responds; blocks server resync
 *                   during the full debounce+network window (not just debounce)
 *  seqRef (multi) — sequence number; superseded flushes bail without touching state
 *
 * KEY DESIGN DECISIONS
 * ────────────────────
 * 1. Full-set replace, not toggle delta — backend receives the complete selection
 *    on every save. Concurrent requests are idempotent; last writer wins correctly.
 *
 * 2. Don't invalidate the answer cache on save — only invalidate progress counters.
 *    Invalidating answer data triggers a refetch that can return stale server data
 *    and revert what the user just clicked (same pattern as Notion/Linear/Google Forms).
 *    The hook owns display state for the session; server data is fresh on page load.
 *
 * 3. inFlightRef covers the FULL window — timerRef.current is null once the debounce
 *    fires, but the network request is still in-flight. Without inFlightRef, a fast
 *    refetch arriving after debounce-but-before-response would revert the display.
 *
 * USAGE — SINGLE CHOICE
 * ─────────────────────
 *   const { selectedSingle, saveSingle, isSaving, justSaved } = useSingleChoiceAnswer({
 *     initialId:  resp?.selectedOptionInstanceId ?? null,
 *     serverKey:  String(resp?.selectedOptionInstanceId ?? ''),
 *     onSave:     (id) => submitAnswer({ questionInstanceId, selectedOptionInstanceId: id }),
 *     debounceMs: 200,   // optional, default 200
 *   })
 *
 * USAGE — MULTI CHOICE
 * ────────────────────
 *   const { selectedMulti, toggleMulti, isSaving, justSaved } = useMultiChoiceAnswer({
 *     initialIds: resp?.selectedOptionInstanceIds ?? [],
 *     serverKey:  JSON.stringify(resp?.selectedOptionInstanceIds ?? []),
 *     onSave:     (ids) => submitAnswer({ questionInstanceId, selectedOptionInstanceIds: ids }),
 *     debounceMs: 300,   // optional, default 300
 *   })
 *
 * NOTE: onSave must return a Promise (use mutateAsync, not mutate).
 *
 * USAGE IN FUTURE MODULES
 * ───────────────────────
 * Same pattern — wire initialId/initialIds from the server response, serverKey from
 * a stable JSON string of that response, and onSave to your mutateAsync call.
 * The hook handles all debounce, race, resync, rollback, and status state.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Single choice ────────────────────────────────────────────────────────────

export function useSingleChoiceAnswer({
  initialId  = null,
  serverKey  = '',     // stable string — changes when server answer changes → re-sync
  onSave,              // (id: number) => Promise  ← must be mutateAsync, not mutate
  onSaveError,         // () => void  — optional, called after rollback on error
  debounceMs = 200,
}) {
  const selectionRef  = useRef(initialId != null ? Number(initialId) : null)
  const [display,    setDisplay]   = useState(selectionRef.current)
  const [isSaving,   setIsSaving]  = useState(false)
  const [justSaved,  setJustSaved] = useState(false)
  const timerRef      = useRef(null)
  const latestRef     = useRef(null)   // latest clicked id — debounce bails if superseded
  const inFlightRef   = useRef(false)  // blocks server resync during debounce+network

  // Re-sync from server ONLY when nothing is pending or in-flight.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (timerRef.current || inFlightRef.current) return
    const id = initialId != null ? Number(initialId) : null
    selectionRef.current = id
    setDisplay(id)
  }, [serverKey]) // intentionally only serverKey

  const saveSingle = useCallback((optionInstanceId) => {
    const id = Number(optionInstanceId)
    if (selectionRef.current === id) return  // already selected — no-op

    const prev           = selectionRef.current
    selectionRef.current = id
    latestRef.current    = id
    inFlightRef.current  = true
    setDisplay(id)      // optimistic
    setIsSaving(true)
    setJustSaved(false)

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      timerRef.current = null
      if (latestRef.current !== id) {
        // A newer click superseded this one — don't send stale request
        inFlightRef.current = false
        setIsSaving(false)
        return
      }
      try {
        await onSave(id)
        inFlightRef.current = false
        setIsSaving(false)
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 1500)
      } catch {
        inFlightRef.current  = false
        selectionRef.current = prev
        setDisplay(prev)
        setIsSaving(false)
        onSaveError?.()
      }
    }, debounceMs)
  }, [onSave, onSaveError, debounceMs])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return { selectedSingle: display, saveSingle, isSaving, justSaved }
}

// ─── Multi choice ─────────────────────────────────────────────────────────────

export function useMultiChoiceAnswer({
  initialIds = [],
  serverKey  = '',     // stable string — changes when server answer changes → re-sync
  onSave,              // (ids: number[]) => Promise  ← must be mutateAsync, not mutate
  onSaveError,         // (prevIds: number[]) => void  — optional, called after rollback
  debounceMs = 300,
}) {
  const selectionRef  = useRef(new Set(initialIds.map(Number)))
  const [displaySet, setDisplaySet] = useState(() => new Set(initialIds.map(Number)))
  const [isSaving,   setIsSaving]   = useState(false)
  const [justSaved,  setJustSaved]  = useState(false)
  const timerRef      = useRef(null)
  const seqRef        = useRef(0)      // sequence — superseded flushes bail immediately
  const inFlightRef   = useRef(false)  // blocks server resync during debounce+network

  // Re-sync from server ONLY when nothing is pending or in-flight.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (timerRef.current || inFlightRef.current) return
    const fresh = new Set(initialIds.map(Number))
    selectionRef.current = fresh
    setDisplaySet(new Set(fresh))
  }, [serverKey]) // intentionally only serverKey

  const toggleMulti = useCallback((optionInstanceId) => {
    const id = Number(optionInstanceId)

    // Update ref synchronously — immune to React batching, no stale closure
    const next = new Set(selectionRef.current)
    if (next.has(id)) next.delete(id)
    else              next.add(id)
    selectionRef.current = next
    setDisplaySet(new Set(next))  // optimistic display

    inFlightRef.current = true
    setIsSaving(true)
    setJustSaved(false)

    if (timerRef.current) clearTimeout(timerRef.current)
    seqRef.current += 1
    const mySeq = seqRef.current

    timerRef.current = setTimeout(async () => {
      timerRef.current = null
      if (seqRef.current !== mySeq) {
        // A newer toggle superseded this burst — it will send the correct final state
        inFlightRef.current = false
        setIsSaving(false)
        return
      }
      // Send the FULL current set — replace semantics, not toggle delta.
      // Concurrent or out-of-order requests are idempotent: last writer wins
      // with the correct complete selection.
      const fullSet = [...selectionRef.current]
      try {
        await onSave(fullSet)
        inFlightRef.current = false
        setIsSaving(false)
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 1500)
      } catch {
        inFlightRef.current = false
        setIsSaving(false)
        // Rollback to last server-confirmed state
        const rolled = new Set(initialIds.map(Number))
        selectionRef.current = rolled
        setDisplaySet(new Set(rolled))
        onSaveError?.(fullSet)
      }
    }, debounceMs)
  }, [onSave, onSaveError, debounceMs, initialIds])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return { selectedMulti: displaySet, toggleMulti, isSaving, justSaved }
}

/**
 * Convenience wrapper for runtime type dispatch.
 *
 *   const { saveSingle, selectedSingle, isSaving, justSaved } =
 *     useChoiceAnswer({ type: 'single', initialId, serverKey, onSave })
 *
 *   const { toggleMulti, selectedMulti, isSaving, justSaved } =
 *     useChoiceAnswer({ type: 'multi', initialIds, serverKey, onSave })
 */
export function useChoiceAnswer({ type, ...opts }) {
  const single = useSingleChoiceAnswer(
    type === 'single' ? opts : { initialId: null, serverKey: '', onSave: async () => {} }
  )
  const multi = useMultiChoiceAnswer(
    type === 'multi'  ? opts : { initialIds: [],  serverKey: '', onSave: async () => {} }
  )
  return type === 'single' ? single : multi
}