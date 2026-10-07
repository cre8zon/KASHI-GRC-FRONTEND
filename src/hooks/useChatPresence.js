import { useEffect, useSyncExternalStore } from 'react'
import { useSelector } from 'react-redux'
import { useQueryClient } from '@tanstack/react-query'
import { selectAuth } from '../store/slices/authSlice'
import { chatApi, one } from '../api/chat.api'
import { useChatSocket, disconnectChatSocket, retryChatSocket } from './useChatSocket'

/**
 * Who is online in chat — live.
 *
 * The server knows from the WebSocket itself (ChatPresenceService): a person
 * is online while one of their tabs holds the chat socket. On every
 * (re)connect this loads the full picture from /v1/chat/presence, then keeps
 * it current from "presence" pushes — no polling, no lag.
 *
 *   useChatPresenceFeed()   mount ONCE, app-wide (the sidebar) — opens the
 *                           socket on every page and keeps the store fed
 *   usePresence()           read: { isOnline(userId), lastSeen(userId) }
 */
let state = { online: new Set(), lastSeen: {} }
const subs = new Set()
const emit = () => subs.forEach(f => f())
const set = (next) => { state = next; emit() }

function apply(ev) {
  const uid = String(ev.userId)
  const online = new Set(state.online)
  const lastSeen = { ...state.lastSeen }
  if (ev.online) { online.add(uid); delete lastSeen[uid] }
  else { online.delete(uid); if (ev.lastSeenAt) lastSeen[uid] = ev.lastSeenAt }
  set({ online, lastSeen })
}

async function load() {
  try {
    const p = one(await chatApi.presence()) || {}
    set({ online: new Set((p.online || []).map(String)), lastSeen: { ...(p.lastSeen || {}) } })
  } catch { /* keep what we have */ }
}

const BADGE = ['nav-badge', '/v1/chat/unread']
let mounts = 0
let closeTimer = null

export function useChatPresenceFeed() {
  const qc = useQueryClient()
  const { token } = useSelector(selectAuth)

  useChatSocket((ev) => {
    if (ev?.type === '__connected') load()
    else if (ev?.type === 'presence') apply(ev)
    else if (ev?.type === 'chat') qc.invalidateQueries({ queryKey: BADGE })   // live unread badge everywhere
  })

  useEffect(() => {
    if (!token) return undefined
    const t = setInterval(retryChatSocket, 60_000)
    return () => clearInterval(t)
  }, [token])

  // Leaving the signed-in app (sign-out) closes the socket, so nobody stays
  // "online" after it. A quick unmount/remount (layout change) keeps it.
  useEffect(() => {
    mounts += 1
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
    return () => {
      mounts -= 1
      if (mounts === 0) {
        closeTimer = setTimeout(() => {
          closeTimer = null
          if (mounts === 0) { disconnectChatSocket(); set({ online: new Set(), lastSeen: {} }) }
        }, 3000)
      }
    }
  }, [])
}

const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const snapshot = () => state

export function usePresence() {
  const s = useSyncExternalStore(subscribe, snapshot)
  return {
    isOnline: (userId) => userId != null && s.online.has(String(userId)),
    lastSeen: (userId) => (userId == null ? null : s.lastSeen[String(userId)] || null),
    onlineCount: (userIds) => (userIds || []).filter(u => s.online.has(String(u))).length,
  }
}

/** "Online", "Last seen 5 min ago", "Last seen yesterday at 18:40", or "Offline". */
export function presenceLabel(online, lastSeenAt) {
  if (online) return 'Online'
  if (!lastSeenAt) return 'Offline'
  const d = new Date(lastSeenAt)
  const mins = Math.round((Date.now() - d.getTime()) / 60e3)
  if (mins < 1) return 'Last seen just now'
  if (mins < 60) return `Last seen ${mins} min ago`
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const today = new Date(); const y = new Date(today); y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return `Last seen today at ${time}`
  if (d.toDateString() === y.toDateString()) return `Last seen yesterday at ${time}`
  return `Last seen ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}
