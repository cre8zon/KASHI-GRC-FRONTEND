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

// Same keys ChatPage uses. Duplicated rather than imported because importing
// from a page into an app-wide hook would pull the whole chat page — and
// everything it imports — into the shell's bundle.
const KEY_LIST = ['chat-conversations']
const keyMsgs  = (id) => ['chat-messages', String(id)]

/**
 * A chat message arrived. Mark the chat caches stale, wherever the person is.
 *
 * ── WHY THIS IS MORE THAN THE BADGE ───────────────────────────────────────
 *
 * This used to invalidate BADGE alone, so the unread count was live
 * everywhere and nothing else was. ChatPage has its own, fuller listener —
 * but it only exists while ChatPage is MOUNTED. Off the chat page there was
 * nobody to hear the event, so the conversation and its messages stayed as
 * they were last fetched.
 *
 * The symptom: a notification toast arrives for a chat message, you click it,
 * the chat opens — and the message that brought you there is not in it. It
 * turns up on the next 15-second poll, or immediately on a hard refresh,
 * which is what makes it look like the toast raced the page. It did not; the
 * cache was simply never told.
 *
 * ── WHY INVALIDATING WHILE OFF-PAGE IS FREE ───────────────────────────────
 *
 * invalidateQueries marks a query stale; it only REFETCHES if something is
 * observing it. With ChatPage unmounted nothing is, so this costs one cache
 * flag and no request — and the fetch then happens on arrival, which is
 * exactly when the data is wanted.
 *
 * Deliberately narrower than ChatPage's listener, which also invalidates
 * pins, members and shared files. Those matter while reading a conversation
 * and ChatPage refreshes them itself on mount; repeating them here would be
 * flags nobody reads.
 */
function onChatEvent(qc, ev) {
  qc.invalidateQueries({ queryKey: BADGE })        // live unread badge everywhere
  qc.invalidateQueries({ queryKey: KEY_LIST })     // last message + unread per row
  if (ev?.conversationId != null) {
    qc.invalidateQueries({ queryKey: keyMsgs(ev.conversationId) })
    qc.invalidateQueries({ queryKey: ['chat-conversation', String(ev.conversationId)] })
  }
}

/**
 * Report delivery — the second tick.
 *
 * ── WHY IT LIVES HERE AND NOT IN ChatPage ─────────────────────────────────
 *
 * This hook is mounted ONCE, app-wide, by the sidebar. That makes it the only
 * thing in the product that hears a chat push on every page, which is exactly
 * what "delivered" means: the message reached this person's browser, whether or
 * not they are looking at chat. ChatPage's listener only exists while ChatPage
 * is mounted, so putting it there would mean a message is only ever "delivered"
 * to someone who already has the conversation open — at which point the read
 * receipt is a moment away and the delivered tick tells nobody anything.
 *
 * ── WHY IT IS NOT A WRITE ON EVERY EVENT ──────────────────────────────────
 *
 * `send` is the only thing that pushes a messageId, so an edit, a reaction or a
 * pin never reaches this. Within that:
 *
 *   - my own message is skipped; the server already marks the sender caught up
 *   - an id at or behind what this tab has already reported is skipped, which
 *     is what makes a socket reconnect replaying events free
 *   - the server is advance-only too, so two tabs racing costs one UPDATE
 *
 * `_reported` is per tab and resets on reload. That is deliberate: a fresh tab
 * reporting once per conversation is one request, and the alternative —
 * persisting it — would let a stale entry suppress a report the server needs.
 */
const _reported = new Map()   // conversationId -> highest messageId reported from this tab

function reportDelivered(ev, myUserId) {
  const cid = ev?.conversationId
  const mid = ev?.messageId
  if (cid == null || mid == null) return
  // My own message. The server marks the sender delivered+read on send, so
  // reporting it back would be a write that changes nothing.
  if (myUserId != null && String(ev.senderId) === String(myUserId)) return

  const key = String(cid)
  const seen = _reported.get(key)
  if (seen != null && Number(mid) <= Number(seen)) return
  _reported.set(key, mid)

  // Fire and forget. A failed receipt must never surface to the person reading
  // the message, and the next message — or opening the conversation, which
  // advances the same watermark server-side — will carry it.
  chatApi.delivered(cid, mid).catch(() => { _reported.delete(key) })
}

let mounts = 0
let closeTimer = null

export function useChatPresenceFeed() {
  const qc = useQueryClient()
  const { token, userId } = useSelector(selectAuth)

  useChatSocket((ev) => {
    if (ev?.type === '__connected') load()
    else if (ev?.type === 'presence') apply(ev)
    else if (ev?.type === 'chat') { onChatEvent(qc, ev); reportDelivered(ev, userId) }
    // A receipt moving is not new content, so it does not touch the message
    // cache — only the conversation, which is where the watermarks live. On the
    // chat page that repaints the ticks; off it, it costs one cache flag and no
    // request, because nothing is observing that query.
    else if (ev?.type === 'read' || ev?.type === 'delivered') {
      if (ev.conversationId != null) {
        qc.invalidateQueries({ queryKey: ['chat-conversation', String(ev.conversationId)] })
      }
      // An open info panel should move while you are looking at it. This is a
      // prefix match over every message's receipts, but only a MOUNTED query
      // refetches — and at most one panel is ever open — so in practice it is
      // one request when a panel is open and none at all when it is not.
      qc.invalidateQueries({ queryKey: ['chat-receipts'] })
    }
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