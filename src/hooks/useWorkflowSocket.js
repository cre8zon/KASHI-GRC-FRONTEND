import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectAuth } from '../store/slices/authSlice'
import toast from 'react-hot-toast'

/**
 * Low-level WebSocket connection hook using native browser WebSocket + STOMP protocol.
 * Uses SockJS + @stomp/stompjs for reliability and fallback support.
 *
 * NOTE: Install required packages:
 *   npm install @stomp/stompjs sockjs-client
 *
 * The hook is lazy — it connects only when called with at least one subscription.
 * It reconnects automatically on disconnect (handled by STOMP client).
 */
function useStompClient() {
  const clientRef = useRef(null)
  const { token } = useSelector(selectAuth)

  useEffect(() => {
    // Dynamically import to avoid SSR issues and keep bundle lean
    Promise.all([
      import('@stomp/stompjs'),
      import('sockjs-client'),
    ]).then(([{ Client }, { default: SockJS }]) => {
      const client = new Client({
        webSocketFactory: () => new SockJS(
          `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/ws`
        ),
        connectHeaders: {
          Authorization: `Bearer ${token}`,
        },
        reconnectDelay: 5000,
        onConnect:    () => { clientRef.current = client },
        onDisconnect: () => { clientRef.current = null },
        onStompError: (frame) => {
          console.warn('[WS] STOMP error:', frame.headers?.message)
        },
      })
      client.activate()

      return () => client.deactivate()
    }).catch(err => {
      console.warn('[WS] STOMP client not available:', err.message)
    })
  }, [token])

  return clientRef
}

/**
 * Subscribe to workflow instance events.
 *
 * Automatically invalidates relevant React Query caches when events arrive,
 * keeping all UI components in sync without polling.
 *
 * @param {number|null} workflowInstanceId - subscribe when non-null
 * @param {object} options
 * @param {boolean} options.showToasts - show toast notifications for key events (default true)
 */
export function useWorkflowInstanceSocket(workflowInstanceId, { showToasts = true } = {}) {
  const qc = useQueryClient()
  const clientRef = useStompClient()

  useEffect(() => {
    if (!workflowInstanceId) return

    const subscribe = () => {
      const client = clientRef.current
      if (!client?.connected) return null

      return client.subscribe(
        `/topic/instance/${workflowInstanceId}`,
        (message) => {
          try {
            const event = JSON.parse(message.body)
            handleInstanceEvent(event, workflowInstanceId, qc, showToasts)
          } catch (e) {
            console.warn('[WS] Failed to parse event:', e)
          }
        }
      )
    }

    // Retry subscription until client connects
    let sub = null
    let retries = 0
    const interval = setInterval(() => {
      sub = subscribe()
      if (sub || retries++ > 20) clearInterval(interval)
    }, 500)

    return () => {
      clearInterval(interval)
      sub?.unsubscribe()
    }
  }, [workflowInstanceId, qc, showToasts]) // eslint-disable-line
}

/**
 * Subscribe to a user's personal task channel.
 * Invalidates inbox queries when a new task arrives.
 *
 * @param {number|null} userId
 */
export function useUserTaskSocket(userId) {
  const qc = useQueryClient()
  const clientRef = useStompClient()

  useEffect(() => {
    if (!userId) return

    let sub = null
    let retries = 0
    const interval = setInterval(() => {
      const client = clientRef.current
      if (client?.connected) {
        sub = client.subscribe(`/topic/user/${userId}`, (message) => {
          try {
            const event = JSON.parse(message.body)
            if (event.type === 'TASK_ASSIGNED') {
              // Refresh inbox immediately
              qc.invalidateQueries({ queryKey: ['my-tasks'] })
              toast.success(`New task: ${event.stepName || 'Workflow step'}`, {
                icon: '📋',
                duration: 5000,
              })
            }
          } catch (e) {
            console.warn('[WS] Failed to parse user event:', e)
          }
        })
        clearInterval(interval)
      } else if (retries++ > 20) {
        clearInterval(interval)
      }
    }, 500)

    return () => {
      clearInterval(interval)
      sub?.unsubscribe()
    }
  }, [userId, qc])
}

/**
 * Subscribe to artifact-level events.
 * Used by assessment pages, engagement pages, etc.
 *
 * @param {string|null} entityType - e.g. "VENDOR", "AUDIT"
 * @param {number|null} artifactId - the artifact ID
 */
export function useArtifactSocket(entityType, artifactId) {
  const qc = useQueryClient()
  const clientRef = useStompClient()

  useEffect(() => {
    if (!entityType || !artifactId) return
    const room = `/topic/artifact/${entityType.toLowerCase()}/${artifactId}`

    let sub = null
    let retries = 0
    const interval = setInterval(() => {
      const client = clientRef.current
      if (client?.connected) {
        sub = client.subscribe(room, (message) => {
          try {
            const event = JSON.parse(message.body)
            // Invalidate all queries related to this artifact
            qc.invalidateQueries({ queryKey: ['vendor-assessment', artifactId] })
            qc.invalidateQueries({ queryKey: ['workflow-progress'] })
          } catch (e) {
            console.warn('[WS] Failed to parse artifact event:', e)
          }
        })
        clearInterval(interval)
      } else if (retries++ > 20) {
        clearInterval(interval)
      }
    }, 500)

    return () => {
      clearInterval(interval)
      sub?.unsubscribe()
    }
  }, [entityType, artifactId, qc])
}

// ── Event handler ─────────────────────────────────────────────────────────────

function handleInstanceEvent(event, workflowInstanceId, qc, showToasts) {
  // Always invalidate progress for any event on this instance
  qc.invalidateQueries({ queryKey: ['workflow-progress', workflowInstanceId] })
  qc.invalidateQueries({ queryKey: ['workflow-instance', workflowInstanceId] })

  switch (event.type) {
    case 'TASK_ASSIGNED':
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      if (showToasts) {
        toast.success(`Task assigned: ${event.stepName}`, { icon: '📋', duration: 4000 })
      }
      break

    case 'STEP_ADVANCED':
      if (showToasts) {
        toast(`Step advanced: ${event.stepName}`, { icon: '→', duration: 3000 })
      }
      break

    case 'STEP_COMPLETED':
      if (showToasts) {
        const icon = event.outcome === 'APPROVED' ? '✅' : '❌'
        toast(`${event.stepName}: ${event.outcome}`, { icon, duration: 3000 })
      }
      break

    case 'WORKFLOW_COMPLETED':
      qc.invalidateQueries({ queryKey: ['vendors'] })
      qc.invalidateQueries({ queryKey: ['vendor-assessments'] })
      if (showToasts) {
        toast.success('Workflow completed!', { icon: '🎉', duration: 5000 })
      }
      break

    case 'WORKFLOW_CANCELLED':
      qc.invalidateQueries({ queryKey: ['vendors'] })
      if (showToasts) {
        toast('Workflow cancelled', { icon: '⚠️', duration: 4000 })
      }
      break

    default:
      break
  }
}