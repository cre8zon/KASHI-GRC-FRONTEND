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
 */
let client = null
let connecting = null
let topic = null
const listeners = new Set()

async function connect(token) {
  if (client?.connected || connecting) return connecting
  connecting = (async () => {
    try {
      const me = one(await chatApi.me())
      if (!me?.canUse || !me.pushTopic) return
      topic = me.pushTopic
      const [{ Client }, { default: SockJS }] = await Promise.all([import('@stomp/stompjs'), import('sockjs-client')])
      const c = new Client({
        webSocketFactory: () => new SockJS(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/ws`, null, { transports: ['websocket'] }),
        connectHeaders: { Authorization: `Bearer ${token}` },
        reconnectDelay: 10000,
        onConnect: async () => {
          // The topic changes when the server restarts — ask again on every (re)connect.
          try { const fresh = one(await chatApi.me()); if (fresh?.pushTopic) topic = fresh.pushTopic } catch { /* keep the old one */ }
          c.subscribe(topic, (msg) => {
            try { const ev = JSON.parse(msg.body); listeners.forEach(l => l(ev)) } catch { /* ignore */ }
          })
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
