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
 * @param {object} options
 * @param {string}   options.watchEntityType  - if set, only trigger onTaskAssigned for this entity type
 * @param {number}   options.watchEntityId    - if set, only trigger onTaskAssigned for this entity id
 * @param {function} options.onTaskAssigned   - called with { taskId, stepInstanceId, stepName, stepAction }
 *                                              when a new task arrives for the watched entity.
 *                                              Use this for seamless step transitions — no polling needed.
 */
export function useUserTaskSocket(userId, { watchEntityType, watchEntityId, watchParentProjectId, onTaskAssigned } = {}) {
  const qc = useQueryClient()
  const clientRef = useStompClient()
  // Stable ref so the subscription closure always calls the latest callback
  const onTaskAssignedRef = useRef(onTaskAssigned)
  useEffect(() => { onTaskAssignedRef.current = onTaskAssigned }, [onTaskAssigned])

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
              // Always refresh inbox badge
              qc.invalidateQueries({ queryKey: ['my-tasks'] })

              // Seamless transition: if this task is for the entity the user
              // is currently viewing, call the callback instead of showing
              // a generic "go to inbox" toast.
              const isCurrentEntity = watchEntityType && watchEntityId && (
                // Same-entity match: entityType + entityId matches current page
                (event.entityType === watchEntityType &&
                 String(event.entityId) === String(watchEntityId)) ||
                // Cross-entity match: artifactId matches current page's entity ID
                // e.g. WF16 task assigned with artifactId=engagementId, user is on engagement page
                (event.artifactId && String(event.artifactId) === String(watchEntityId)) ||
                // Parent-project match: user is on an engagement page, new task is on the parent project
                // e.g. Step 3 completes → Step 4 task assigned on AUDIT_PROJECT
                (watchParentProjectId &&
                 event.entityType === 'AUDIT_PROJECT' &&
                 String(event.entityId) === String(watchParentProjectId))
              )

              if (isCurrentEntity && onTaskAssignedRef.current) {
                onTaskAssignedRef.current({
                  taskId:         event.taskId,
                  stepInstanceId: event.stepInstanceId,
                  stepName:       event.stepName,
                  stepAction:     event.resolvedStepAction,
                  navKey:         event.navKey,
                  artifactId:     event.artifactId,
                })
              } else {
                // Different entity or no watch — show inbox toast as before
                toast.success(`New task: ${event.stepName || 'Workflow step'}`, {
                  icon: '📋',
                  duration: 5000,
                })
              }
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
  }, [userId, watchEntityType, watchEntityId, qc]) // eslint-disable-line
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
      // Invalidate workflow-related queries so UI updates without manual refresh
      qc.invalidateQueries({ queryKey: ['workflow-progress', workflowInstanceId] })
      qc.invalidateQueries({ queryKey: ['workflow-instance', workflowInstanceId] })
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      qc.invalidateQueries({ queryKey: ['view-context'] })
      if (showToasts) {
        toast(`Step advanced: ${event.stepName}`, { icon: '→', duration: 3000 })
      }
      break

    case 'STEP_COMPLETED':
      // Also invalidate on step completion so workflow timeline refreshes
      qc.invalidateQueries({ queryKey: ['workflow-progress', workflowInstanceId] })
      qc.invalidateQueries({ queryKey: ['workflow-instance', workflowInstanceId] })
      qc.invalidateQueries({ queryKey: ['view-context'] })
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