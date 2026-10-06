import { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { selectAuth } from '../store/slices/authSlice'
import { chatApi, one } from '../api/chat.api'

/**
 * Live chat updates. The server pushes only "conversation N changed" to a
 * per-user topic whose name it hands out from /v1/chat/me (an HMAC — nobody
 * can guess another person's), and the page refetches through the API. One
 * STOMP connection per tab, shared by every caller of this hook. If the
 * socket is down, the chat page still polls, so nothing is lost.
 *
 * The connection is opened app-wide (useChatPresenceFeed, in the sidebar), so
 * the server can tell who is online. Each (re)connect sends the CURRENT access
 * token — the server ties the socket to that user — and tells listeners
 * { type: '__connected' } so they can catch up on anything missed.
 */
let client = null
let connecting = null
let topic = null
let currentToken = null
let identity = null          // "user:tenant" the open socket was made for
const listeners = new Set()

/** "user:tenant" from a JWT — a different one needs a new socket. */
function who(token) {
  try {
    const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return `${p.sub}:${p.tenant_id ?? ''}`
  } catch { return null }
}

/** Close the socket (sign-out, or another user / organisation in this tab). */
export function disconnectChatSocket() {
  const c = client
  client = null
  identity = null
  topic = null
  if (c) { try { c.deactivate() } catch { /* ignore */ } }
}

async function connect(token) {
  currentToken = token
  const id = who(token)
  if (client && id && identity && id !== identity) disconnectChatSocket()
  // An existing client reconnects by itself — never start a second one.
  if (client || connecting) return connecting
  identity = id
  connecting = (async () => {
    try {
      const me = one(await chatApi.me())
      if (!me?.canUse || !me.pushTopic) return
      topic = me.pushTopic
      const [{ Client }, { default: SockJS }] = await Promise.all([import('@stomp/stompjs'), import('sockjs-client')])
      const c = new Client({
        webSocketFactory: () => new SockJS(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/ws`, null, { transports: ['websocket'] }),
        connectHeaders: { Authorization: `Bearer ${token}` },
        // A token refreshed since the first connect is the one to send on a reconnect.
        beforeConnect: () => { if (currentToken) c.connectHeaders = { Authorization: `Bearer ${currentToken}` } },
        reconnectDelay: 10000,
        onConnect: async () => {
          // The topic changes when the server restarts — ask again on every (re)connect.
          try { const fresh = one(await chatApi.me()); if (fresh?.pushTopic) topic = fresh.pushTopic } catch { /* keep the old one */ }
          c.subscribe(topic, (msg) => {
            try { const ev = JSON.parse(msg.body); listeners.forEach(l => l(ev)) } catch { /* ignore */ }
          })
          listeners.forEach(l => { try { l({ type: '__connected' }) } catch { /* ignore */ } })
        },
      })
      c.activate()
      client = c
    } catch {
      client = null
    } finally {
      connecting = null
    }
  })()
  return connecting
}

/** Whether the shared chat socket is connected right now. */
export const chatSocketConnected = () => !!client?.connected

/** Try again if the first attempt never got a socket going (e.g. a failed /me call). */
export function retryChatSocket() {
  if (!client && !connecting && currentToken) connect(currentToken)
}

export function useChatSocket(onEvent) {
  const { token } = useSelector(selectAuth)
  const ref = useRef(onEvent)
  ref.current = onEvent
  useEffect(() => {
    if (!token) return undefined
    const l = (ev) => ref.current?.(ev)
    listeners.add(l)
    connect(token)
    return () => { listeners.delete(l) }
  }, [token])
}
