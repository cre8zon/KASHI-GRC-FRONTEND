import { useSyncExternalStore } from 'react'
import toast from 'react-hot-toast'
import { collabApi, unwrapOne, errMsg } from '../../../api/collab.api'

/**
 * The one call this browser tab is in. A module-level store so a call
 * survives navigating around the app: CallDock (mounted once in the shell)
 * renders it, anything can start or end it.
 *
 *   startCall({ url, token, room, title, meetingId })   join (replaces any current call);
 *                                       meetingId = the record the call belongs to
 *   endCall()                                 leave
 *   joinMeetingCall(meetingId)                ask the server for a token, then join
 *   joinRoomCall(roomId)
 */
let state = { active: false, minimized: false }
const listeners = new Set()
const emit = () => listeners.forEach(l => l())
const set = (patch) => { state = { ...state, ...patch }; emit() }

export const callStore = {
  get: () => state,
  subscribe: (l) => { listeners.add(l); return () => listeners.delete(l) },
}
export const useCall = () => useSyncExternalStore(callStore.subscribe, callStore.get)

export function startCall({ url, token, room, title, meetingId }) {
  if (!url || !token) { toast.error('The call could not be started'); return }
  set({ active: true, minimized: false, url, token, room, title, meetingId: meetingId ?? null, key: Date.now() })
}
export const endCall = () => set({ active: false, minimized: false, url: null, token: null, room: null, title: null, meetingId: null })
export const setMinimized = (minimized) => set({ minimized })

async function join(fn, fallback) {
  try {
    const r = unwrapOne(await fn())
    startCall(r)
    return r
  } catch (e) {
    toast.error(errMsg(e, fallback))
    return null
  }
}
export const joinMeetingCall = (meetingId) => join(() => collabApi.joinMeeting(meetingId), 'Could not join the call')
export const joinRoomCall = (roomId) => join(() => collabApi.joinRoom(roomId), 'Could not join the room')
