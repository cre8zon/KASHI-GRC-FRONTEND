import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectAuth } from '../store/slices/authSlice'
import { QUERY_KEYS } from '../config/constants'

/**
 * Live notifications: refetch the moment the server says there is one, instead
 * of up to 30 seconds later.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * useNotifications polls on a 30s refetchInterval, which was the ONLY way a
 * new notification reached the client — NotificationService was the one
 * service in the product that never pushed. Chat, workflow events, action
 * items and comments all do. So a task assignment appeared in the badge
 * instantly (ActionItemService pushes) while the notification about it took
 * up to half a minute, from the same business operation.
 *
 * The server half of this now publishes to /topic/user/{userId} on save.
 *
 * ── WHY IT REFETCHES RATHER THAN WRITING THE CACHE ────────────────────────
 *
 * The socket payload carries the id, message and route, which is enough to
 * show something — but writing it straight into the list cache would mean two
 * places that know the shape of a notification, and the list's shape comes
 * from NotificationResponse. Invalidating costs one request that was going to
 * happen anyway within 30 seconds, and keeps one source of truth.
 *
 * useNotificationToast then sees the new row on the refetch and does the rest:
 * the toast, the chime, and the desktop banner if the tab is in the background.
 * That is why nothing here touches any of those — one watcher, one place.
 *
 * ── THE SOCKET ────────────────────────────────────────────────────────────
 *
 * Reuses window._kashiStompClient when it is already connected, which is the
 * convention useActionItems established on this same topic. When it is not,
 * this opens one and publishes it back to the window, so whichever hook mounts
 * first pays for the connection and the other rides it. Both subscribe to the
 * same destination; STOMP delivers to each subscription independently, so
 * neither sees the other's events disappear.
 *
 * Mounted once, in AppShell, beside useNotificationToast.
 */
export function useNotificationSocket() {
  const qc = useQueryClient()
  const { userId, token } = useSelector(selectAuth)

  useEffect(() => {
    if (!userId || !token) return

    let sub = null
    let cancelled = false
    let retries = 0

    const onEvent = (msg) => {
      try {
        const event = JSON.parse(msg.body)
        // The same topic carries workflow events and action-item events. Only
        // ours should cost a notifications refetch — the others have their own
        // hooks already invalidating their own queries.
        if (event?.type !== 'NOTIFICATION_CREATED') return
        qc.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS })
      } catch {
        // A malformed frame is not worth taking the subscription down for.
      }
    }

    const subscribe = async () => {
      if (cancelled) return
      try {
        const [{ Client }, { default: SockJS }] = await Promise.all([
          import('@stomp/stompjs'),
          import('sockjs-client'),
        ])
        if (cancelled) return

        if (window._kashiStompClient?.connected) {
          sub = window._kashiStompClient.subscribe(`/topic/user/${userId}`, onEvent)
          return
        }

        const client = new Client({
          webSocketFactory: () => new SockJS(
            `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/ws`,
            null,
            // Native WebSocket only, for the reason useActionItems documents:
            // SockJS's XHR fallbacks register an `unload` listener that Chrome
            // blocks under its default Permissions-Policy.
            { transports: ['websocket'] },
          ),
          connectHeaders: { Authorization: `Bearer ${token}` },
          reconnectDelay: 5000,
          onConnect: () => {
            window._kashiStompClient = client
            if (cancelled) return
            sub = client.subscribe(`/topic/user/${userId}`, onEvent)
            // Catch up on anything that arrived while the socket was down.
            // A reconnect is exactly when the client is most likely to be
            // behind, and the poll could still be 30 seconds away.
            qc.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS })
          },
        })
        client.activate()
      } catch {
        // The import or the connect failed. Retry a bounded number of times,
        // then stop: the 30s poll in useNotifications is still running, so the
        // worst case is the latency this hook exists to remove, not data loss.
        if (retries++ < 20 && !cancelled) setTimeout(subscribe, 500)
      }
    }

    subscribe()
    return () => {
      cancelled = true
      try { sub?.unsubscribe() } catch { /* already gone */ }
    }
  }, [userId, token, qc])
}