/**
 * useModuleSocket — blueprint-driven WebSocket live-update hook.
 *
 * NEW FILE — does not modify useWorkflowSocket.js.
 *
 * Reads `bp.wsTopicPattern` from the ModuleBlueprint and subscribes to that
 * STOMP topic. When any event arrives, it auto-invalidates the relevant
 * React Query caches so the UI updates without polling.
 *
 * CONFIGURATION (zero code per module):
 *   In Module Blueprints UI, set wsTopicPattern:
 *     "/topic/module/audit_engagement/{id}"
 *     "/topic/module/issue/{id}"
 *     "/topic/module/risk/{id}"
 *
 *   The {id} placeholder is replaced with the actual entity ID at runtime.
 *   If wsTopicPattern is null/empty, this hook does nothing (backwards compatible).
 *
 * BACKEND REQUIREMENT:
 *   The Spring backend must publish to this topic via SimpMessagingTemplate
 *   whenever the entity is mutated. This hook only handles the subscription.
 *   Publishing is a one-time addition per module's service class.
 *
 * USAGE (in UniversalModulePage — already wired):
 *   useModuleSocket(bp, entityId, apiBasePath)
 *
 * EVENT SHAPE (what the backend should publish):
 *   {
 *     "type": "ENTITY_UPDATED" | "ENTITY_DELETED" | "STATUS_CHANGED" | "COMMENT_ADDED",
 *     "entityId": 42,
 *     "entityType": "AUDIT_ENGAGEMENT",
 *     "changedBy": "user@org.com",
 *     "changedAt": "2026-05-19T10:30:00Z",
 *     "payload": {}   // optional additional data
 *   }
 */
import { useEffect, useRef } from 'react'
import { useQueryClient }    from '@tanstack/react-query'
import { useSelector }       from 'react-redux'
import { selectAuth }        from '../store/slices/authSlice'
import toast                 from 'react-hot-toast'

// ── Shared STOMP client (singleton per page, same pattern as useWorkflowSocket) ──

function useStompClient() {
  const clientRef        = useRef(null)
  const { token }        = useSelector(selectAuth)
  const activatingRef    = useRef(false)

  useEffect(() => {
    if (activatingRef.current) return
    activatingRef.current = true

    Promise.all([
      import('@stomp/stompjs'),
      import('sockjs-client'),
    ]).then(([{ Client }, { default: SockJS }]) => {
      const client = new Client({
        webSocketFactory: () => new SockJS(
          `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/ws`,
          null,
          // Native WebSocket only — SockJS's older XHR-based fallback
          // transports register an `unload` listener for cleanup, which
          // Chrome now blocks under its default Permissions-Policy and
          // logs as a console violation. Every browser this app targets
          // supports native WebSocket, so those fallbacks are never
          // actually needed here.
          { transports: ['websocket'] }
        ),
        connectHeaders:  { Authorization: `Bearer ${token}` },
        reconnectDelay:  5000,
        onConnect:       () => { clientRef.current = client },
        onDisconnect:    () => { clientRef.current = null },
        onStompError:    (frame) => {
          console.warn('[MODULE-WS] STOMP error:', frame.headers?.message)
        },
      })
      client.activate()
      return () => { client.deactivate(); activatingRef.current = false }
    }).catch(err => {
      console.warn('[MODULE-WS] STOMP not available:', err.message)
      activatingRef.current = false
    })
  }, [token])

  return clientRef
}

/**
 * Subscribe to blueprint-driven live updates for a specific entity.
 *
 * @param {object|null} bp           - ModuleBlueprint object (needs wsTopicPattern, apiBasePath, entityType)
 * @param {string|number|null} entityId - ID of the entity being viewed
 * @param {object} [options]
 * @param {boolean} [options.showToasts=true] - show toast notifications on events
 */
export function useModuleSocket(bp, entityId, { showToasts = true } = {}) {
  const qc        = useQueryClient()
  const clientRef = useStompClient()

  useEffect(() => {
    // Bail out if blueprint has no ws config or no entity context
    if (!bp?.wsTopicPattern || !entityId) return

    const topic = bp.wsTopicPattern
      .replace('{id}', entityId)
      .replace('{entityId}', entityId)

    let sub      = null
    let retries  = 0
    const interval = setInterval(() => {
      const client = clientRef.current
      if (client?.connected) {
        sub = client.subscribe(topic, (message) => {
          try {
            const event = JSON.parse(message.body)
            handleModuleEvent(event, bp, entityId, qc, showToasts)
          } catch (e) {
            console.warn('[MODULE-WS] Failed to parse event:', e)
          }
        })
        clearInterval(interval)
      } else if (retries++ > 30) {
        // Give up after ~15 seconds
        clearInterval(interval)
      }
    }, 500)

    return () => {
      clearInterval(interval)
      sub?.unsubscribe()
    }
  }, [bp?.wsTopicPattern, entityId, qc, showToasts]) // eslint-disable-line
}

/**
 * Subscribe to a list-level topic for live list updates.
 * Used when viewing the list page for a module that has a list-level topic.
 * Topic pattern: bp.wsTopicPattern with {id} replaced with "list"
 *
 * @param {object|null} bp
 */
export function useModuleListSocket(bp) {
  const qc        = useQueryClient()
  const clientRef = useStompClient()

  useEffect(() => {
    if (!bp?.wsTopicPattern || !bp?.apiBasePath) return

    // Derive a list-level topic by replacing {id} with "list"
    const topic = bp.wsTopicPattern
      .replace('{id}', 'list')
      .replace('{entityId}', 'list')

    // Don't subscribe if topic looks wrong (e.g. still has braces)
    if (topic.includes('{')) return

    let sub     = null
    let retries = 0
    const interval = setInterval(() => {
      const client = clientRef.current
      if (client?.connected) {
        sub = client.subscribe(topic, () => {
          // Any list-level event → invalidate the list cache
          qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
        })
        clearInterval(interval)
      } else if (retries++ > 30) {
        clearInterval(interval)
      }
    }, 500)

    return () => {
      clearInterval(interval)
      sub?.unsubscribe()
    }
  }, [bp?.wsTopicPattern, bp?.apiBasePath, qc]) // eslint-disable-line
}

// ── Event handler ──────────────────────────────────────────────────────────────

function handleModuleEvent(event, bp, entityId, qc, showToasts) {
  const apiBase   = bp.apiBasePath
  const entityKey = bp.entityType

  // Always invalidate this entity's detail
  qc.invalidateQueries({ queryKey: ['module-detail',   apiBase, String(entityId)] })
  qc.invalidateQueries({ queryKey: ['view-context',    entityKey, String(entityId)] })
  qc.invalidateQueries({ queryKey: ['drawer-entity',   apiBase, String(entityId)] })

  switch (event.type) {
    case 'ENTITY_UPDATED':
      if (showToasts && event.changedBy) {
        toast(`Updated by ${event.changedBy}`, { icon: '✏️', duration: 3000 })
      }
      break

    case 'STATUS_CHANGED':
      // Invalidate list too — status changes affect list badges
      qc.invalidateQueries({ queryKey: ['module-list', apiBase] })
      if (showToasts) {
        toast(`Status → ${event.payload?.newStatus || 'changed'}`, { icon: '🔄', duration: 3000 })
      }
      break

    case 'COMMENT_ADDED':
      qc.invalidateQueries({ queryKey: ['drawer-comments', entityKey, String(entityId)] })
      if (showToasts && event.changedBy) {
        toast(`Comment from ${event.changedBy}`, { icon: '💬', duration: 3000 })
      }
      break

    case 'ENTITY_DELETED':
      qc.invalidateQueries({ queryKey: ['module-list', apiBase] })
      if (showToasts) {
        toast('Record deleted', { icon: '🗑️', duration: 3000 })
      }
      break

    default:
      // Unknown event type — still invalidate to be safe
      qc.invalidateQueries({ queryKey: ['module-detail', apiBase, String(entityId)] })
      break
  }
}