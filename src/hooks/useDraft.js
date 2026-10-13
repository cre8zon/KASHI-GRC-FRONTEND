import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Text that survives leaving the page.
 *
 * ── WHY ───────────────────────────────────────────────────────────────────────
 *
 * A half-written chat message lives in a useState inside Composer. Switch to
 * the Workspaces tab and ChatPage unmounts, so the state goes with it: you come
 * back to an empty box with no sign there was ever anything in it. The same is
 * true of a plan cell you were part-way through typing.
 *
 * Nothing about that is a chat problem or a plan problem — it is "this text is
 * not finished yet, and the component holding it is about to be thrown away".
 * One hook, used in both places.
 *
 * ── WHY localStorage AND NOT THE SERVER ───────────────────────────────────────
 *
 * A draft is not a message. Sending it to the server would mean deciding what
 * happens when the same person has one conversation open on a laptop and a
 * phone, and the honest answer is that nobody wants their phone's half-sentence
 * appearing on their laptop. Per-browser is the behaviour people expect from
 * every chat app, and it costs no request.
 *
 * ── WHY EVERY ACCESS IS WRAPPED ───────────────────────────────────────────────
 *
 * localStorage throws rather than returning null in a private window, with
 * site data blocked, or when the quota is full. A draft is a convenience; it
 * must never be able to break the box it is helping. Every read and write is
 * guarded and failure is silent.
 *
 * ── SWITCHING KEYS ────────────────────────────────────────────────────────────
 *
 * The key is the conversation or the cell. Changing it mid-life — picking
 * another conversation — flushes what is pending under the OLD key before
 * loading the new one, so a fast switch does not drop the sentence you just
 * stopped typing.
 *
 * @param key    stable id for this box, e.g. `chat-draft:42`. Null disables.
 * @param options.debounceMs how long to wait before writing. 300ms is below
 *               the gap between keystrokes in normal typing but far above the
 *               rate at which they arrive, so a paragraph costs a handful of
 *               writes rather than one per character.
 * @returns [value, setValue, clear] — clear() forgets the draft, for the
 *               moment the text stops being a draft because it was sent.
 */
export function useDraft(key, { debounceMs = 300 } = {}) {
  const read = (k) => {
    if (!k) return ''
    try { return window.localStorage.getItem(k) ?? '' } catch { return '' }
  }

  const [value, setValue] = useState(() => read(key))

  // What is on screen, readable from a cleanup that must not re-run on every
  // keystroke. A ref rather than a dependency: the flush below has to see the
  // latest text, and listing `value` as a dependency would make the effect tear
  // down and rebuild on every character typed.
  const latest = useRef(value)
  latest.current = value

  const prevKey = useRef(key)
  const timer = useRef(null)

  const write = useCallback((k, v) => {
    if (!k) return
    try {
      if (v) window.localStorage.setItem(k, v)
      else window.localStorage.removeItem(k)   // an empty draft is not a draft
    } catch { /* private window, blocked, or full — the box still works */ }
  }, [])

  // Key change: flush the old, load the new.
  if (prevKey.current !== key) {
    write(prevKey.current, latest.current)
    prevKey.current = key
    const next = read(key)
    latest.current = next
    // Safe during render: React re-renders immediately rather than committing
    // the stale value, which is the documented way to adjust state when a prop
    // changes. Doing it in an effect would paint the previous conversation's
    // draft for one frame.
    setValue(next)
  }

  // Debounced write.
  useEffect(() => {
    if (!key) return undefined
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => write(key, latest.current), debounceMs)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value, key, debounceMs, write])

  // Leaving the page entirely — tab close, reload, navigation away — does not
  // give the debounce time to fire. pagehide rather than beforeunload: it is
  // the one that fires on mobile Safari when the app is backgrounded, which is
  // exactly when a draft is most likely to be lost.
  useEffect(() => {
    if (!key) return undefined
    const flush = () => write(key, latest.current)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()                     // unmount: the tab switch this exists for
    }
  }, [key, write])

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    latest.current = ''
    setValue('')
    write(key, '')
  }, [key, write])

  return [value, setValue, clear]
}

export default useDraft