import { useSyncExternalStore } from 'react'
import toast from 'react-hot-toast'
import { collabApi, unwrapOne, errMsg } from '../../../api/collab.api'
import { store } from '../../../store'
import { openTab, closeTab, activateTab, setCallLock } from '../../../store/slices/tabsSlice'

/**
 * The one call this browser tab is in.
 *
 * ── WHERE THE CALL LIVES ─────────────────────────────────────────────────────
 * A call has its own app tab ("/call"), like Google Meet has its own browser
 * tab: the call fills that tab's page area and floats over nothing. Starting
 * a call opens (or focuses) the tab. CallDock, mounted once in the app shell,
 * owns the single LiveKit connection and moves its element between:
 *   • the call tab's page          — when that tab is showing (CallPage);
 *   • a small card in the corner   — while you work in another tab;
 *   • nowhere visible              — after you hide the card (e.g. to present
 *                                    without it in the way). The call carries
 *                                    on; the call tab shows a live dot.
 * Moving the element never reconnects, so hiding, showing, switching tabs and
 * presenting never drop the call. Only Leave does.
 *
 * ── REFRESH ──────────────────────────────────────────────────────────────────
 * The call (its meeting id and title) is kept in sessionStorage — this browser
 * tab only, like the sign-in — and the shell rejoins on load. A browser cannot
 * keep a WebRTC connection through a reload, so the others see you drop and
 * come back within a second or two; screen sharing has to be started again
 * (browsers only allow it on a click).
 *
 *   startCall({ url, token, room, title, meetingId }, { focus })
 *   endCall()                       leave
 *   joinMeetingCall(meetingId)      ask the server for a token, then join
 *   joinRoomCall(roomId)
 *   openCallLink(code, navigate)    a /join/… link clicked inside the app
 */
const CALL_ROUTE = '/call'
const PERSIST_KEY = 'kashi_call'

let state = { active: false, slot: null, miniHidden: false, rejoining: false }
const listeners = new Set()
const emit = () => listeners.forEach(l => l())
const set = (patch) => { state = { ...state, ...patch }; emit() }

export const callStore = {
  get: () => state,
  subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) },
}
export const useCall = () => useSyncExternalStore(callStore.subscribe, callStore.get)

// ── persistence (survives F5 in this browser tab only) ──────────────────────
let unloading = false
if (typeof window !== 'undefined') {
  // A reload disconnects LiveKit, which fires onDisconnected → endCall. That
  // must not forget the call, or there would be nothing to rejoin.
  // beforeunload, not only pagehide: LiveKit disconnects on beforeunload, and
  // these listeners are registered first (module load), so they run first.
  // It also fires for things that do not unload (some downloads), hence the
  // reset if the page is still alive a moment later.
  window.addEventListener('pagehide', () => { unloading = true })
  window.addEventListener('beforeunload', () => {
    unloading = true
    setTimeout(() => { unloading = false }, 1500)
  })
}
const persist = (v) => {
  try { v ? sessionStorage.setItem(PERSIST_KEY, JSON.stringify(v)) : sessionStorage.removeItem(PERSIST_KEY) } catch { /* storage off — no rejoin */ }
}
export const persistedCall = () => {
  try { return JSON.parse(sessionStorage.getItem(PERSIST_KEY)) || null } catch { return null }
}

// ── the call tab ─────────────────────────────────────────────────────────────
const findCallTab = () => store.getState().tabs.tabs.find(t => (t.route || '').split('?')[0] === CALL_ROUTE)
export const hasCallTab = () => !!findCallTab()

/** Show the call: focus its tab, or open one if it was closed. */
export function showCallTab() {
  const t = findCallTab()
  if (t) store.dispatch(activateTab(t.id))
  else store.dispatch(openTab({ route: CALL_ROUTE, title: state.title || 'Call', icon: 'PhoneCall' }))
}

// ── start / end ──────────────────────────────────────────────────────────────
export function startCall({ url, token, room, title, meetingId }, { focus = true, micOn = false } = {}) {
  if (!url || !token) { toast.error('The call could not be started'); return }
  set({
    active: true, url, token, room, title, meetingId: meetingId ?? null,
    key: Date.now(), miniHidden: false, rejoining: false, micOn,
  })
  if (meetingId != null) persist({ meetingId, title, micOn })
  if (focus || !hasCallTab()) showCallTab()
  store.dispatch(setCallLock(true))          // the call tab now stays put until Leave
}

export function endCall() {
  const wasActive = state.active
  set({ active: false, url: null, token: null, room: null, title: null, meetingId: null, miniHidden: false, rejoining: false })
  store.dispatch(setCallLock(false))         // before closing the tab: the lock would refuse it
  if (unloading) return                     // a reload: keep it, the next page rejoins
  persist(null)
  const t = findCallTab()
  if (wasActive && t) store.dispatch(closeTab(t.id))
}

export const setMiniHidden = (miniHidden) => set({ miniHidden })

/**
 * The microphone as it is now (reported by the call). Remembered with the
 * call so a refresh rejoins muted or unmuted exactly as you were — you join
 * muted the first time.
 */
export const noteMic = (on) => {
  // Persist only. state.micOn is what the call CONNECTED with; feeding the
  // live value back into it would make LiveKit re-apply it mid-call.
  if (!state.active) return
  const saved = persistedCall()
  if (saved && saved.micOn !== on) persist({ ...saved, micOn: on })
}

/**
 * CallPage registers the element the call should fill (null when it unmounts).
 *
 * On unmount the call's element is moved out to the off-screen holder FIRST,
 * synchronously: React is about to remove the slot from the page, and a
 * <video>/<audio> that drops out of the document even for a moment can be
 * paused by the browser. CallDock then moves it on to the corner card.
 */
let parkNow = null
export const setParkHandler = (fn) => { parkNow = fn }
export const setCallSlot = (slot) => {
  if (!slot) parkNow?.()
  set(slot ? { slot, miniHidden: false } : { slot: null })
}

async function join(fn, fallback, opts) {
  try {
    const r = unwrapOne(await fn())
    startCall(r, opts)
    return r
  } catch (e) {
    toast.error(errMsg(e, fallback))
    return null
  }
}
export const joinMeetingCall = (meetingId) => {
  // Already in this call (Join pressed again on its page or a chat card):
  // just show it — joining again would reconnect for nothing.
  if (state.active && state.meetingId != null && String(state.meetingId) === String(meetingId)) {
    showCallTab()
    return Promise.resolve({ meetingId })
  }
  return join(() => collabApi.joinMeeting(meetingId), 'Could not join the call')
}
export const joinRoomCall = (roomId) => join(() => collabApi.joinRoom(roomId), 'Could not join the room')

/**
 * After a reload: get back into the call this tab was in. Quietly — no
 * stealing focus if you were looking at another tab.
 */
let rejoinTried = false
export async function rejoinAfterReload() {
  if (rejoinTried || state.active) return
  rejoinTried = true
  const saved = persistedCall()
  if (!saved?.meetingId) return
  set({ rejoining: true, title: saved.title })
  try {
    const r = unwrapOne(await collabApi.joinMeeting(saved.meetingId))
    startCall({ ...r, title: saved.title || r.title, meetingId: r.meetingId ?? saved.meetingId }, { focus: false, micOn: !!saved.micOn })
    toast('Back in the call. Share your screen again if you were presenting.', { id: 'call-rejoined', icon: '📞' })
  } catch (e) {
    persist(null)
    set({ rejoining: false, title: null })
    toast.error(errMsg(e, 'Could not get you back into the call'), { id: 'call-rejoin-failed' })
  }
}

/**
 * A call link (/join/…) clicked inside the app: straight in when you may be
 * in that call; otherwise to the join page, where you ask to be let in.
 */
export async function openCallLink(code, navigate) {
  try {
    const r = unwrapOne(await collabApi.openCallLink(code))
    if (r?.mode === 'DIRECT') {
      if (state.active && String(state.meetingId) === String(r.meetingId)) { showCallTab(); return }
      startCall(r)
      return
    }
    navigate(`/join/${code}`)
  } catch (e) {
    toast.error(errMsg(e, 'This call link does not work any more'))
  }
}

export const CALL_LINK_RE = /\/join\/([a-z2-9]{4}(?:-[a-z2-9]{4}){3})\/?$/