import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { store } from '../store'
import toast from 'react-hot-toast'

/**
 * ONE shared STOMP connection for the workflow sockets, with subscriptions
 * that survive a reconnect.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────
 * Every hook call opened its own SockJS + STOMP client, and a new one again
 * whenever the access token refreshed — the old client was never shut down,
 * because the cleanup sat inside a .then() where React never saw it. Worse,
 * each hook subscribed ONCE, by polling for a connected client for ten
 * seconds and then giving up. STOMP does not re-subscribe after a reconnect,
 * so the first time the connection dropped — the laptop slept, the backend
 * restarted — every subscription on the page was silently gone. Live task
 * transitions and timeline updates then needed a refresh, which is exactly
 * what "it used to update by itself" describes.
 *
 * Now: one client per tab, the token read fresh on every (re)connect, and a
 * registry of subscriptions that is replayed on every connect. A hook adds
 * its destination to the registry and removes it on unmount; whether the
 * socket is up at that moment no longer matters.
 */
const shared = {
  client:  null,
  starting: false,
  subs:    new Map(),          // id -> { destination, onMessage, handle }
  nextId:  1,
}

function currentToken() {
  try { return store.getState()?.auth?.token || null } catch { return null }
}

function subscribeLive(entry) {
  const c = shared.client
  if (!c?.connected) return
  try { entry.handle?.unsubscribe() } catch { /* stale handle from a dead connection */ }
  entry.handle = c.subscribe(entry.destination, entry.onMessage)
}

function ensureClient() {
  if (shared.client || shared.starting) return
  shared.starting = true
  Promise.all([
    import('@stomp/stompjs'),
    import('sockjs-client'),
  ]).then(([{ Client }, { default: SockJS }]) => {
    const client = new Client({
      webSocketFactory: () => new SockJS(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/ws`,
        null,
        // Native WebSocket only — SockJS's XHR fallbacks register an `unload`
        // listener Chrome now blocks; every target browser has WebSocket.
        { transports: ['websocket'] }
      ),
      // Read on every attempt, so a reconnect after a token refresh does not
      // present the expired one.
      beforeConnect: () => {
        const token = currentToken()
        // Signed out: stop instead of retrying every five seconds with no
        // credentials. The next subscription after sign-in starts a new one.
        if (!token) { stopClient(); return }
        client.connectHeaders = { Authorization: `Bearer ${token}` }
      },
      reconnectDelay: 5000,
      // Replay every registered subscription — on the first connect and on
      // every reconnect after it.
      onConnect: () => { shared.subs.forEach(subscribeLive) },
      onStompError: (frame) => {
        console.warn('[WS] STOMP error:', frame.headers?.message)
      },
    })
    shared.starting = false
    // Everything unsubscribed while the library was loading — nothing to start.
    if (shared.subs.size === 0) return
    shared.client = client
    client.activate()
  }).catch(err => {
    shared.starting = false
    console.warn('[WS] STOMP client not available:', err.message)
  })
}

function stopClient() {
  const c = shared.client
  shared.client = null
  shared.subs.forEach(e => { e.handle = null })
  try { c?.deactivate() } catch { /* already down */ }
}

/** Register a durable subscription; returns the function that removes it. */
function subscribeDurable(destination, onMessage) {
  ensureClient()
  const id = shared.nextId++
  const entry = { destination, onMessage, handle: null }
  shared.subs.set(id, entry)
  subscribeLive(entry)
  return () => {
    shared.subs.delete(id)
    try { entry.handle?.unsubscribe() } catch { /* connection already gone */ }
    // Nothing left to listen for — close rather than hold an idle socket.
    if (shared.subs.size === 0) stopClient()
  }
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
  const showToastsRef = useRef(showToasts)
  useEffect(() => { showToastsRef.current = showToasts }, [showToasts])

  useEffect(() => {
    if (!workflowInstanceId) return
    return subscribeDurable(`/topic/instance/${workflowInstanceId}`, (message) => {
      try {
        const event = JSON.parse(message.body)
        handleInstanceEvent(event, workflowInstanceId, qc, showToastsRef.current)
      } catch (e) {
        console.warn('[WS] Failed to parse event:', e)
      }
    })
  }, [workflowInstanceId, qc])
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
  // Stable ref so the subscription closure always calls the latest callback
  const onTaskAssignedRef = useRef(onTaskAssigned)
  useEffect(() => { onTaskAssignedRef.current = onTaskAssigned }, [onTaskAssigned])

  useEffect(() => {
    if (!userId) return
    return subscribeDurable(`/topic/user/${userId}`, (message) => {
      try {
        const event = JSON.parse(message.body)
        if (event.type === 'TASK_ASSIGNED') {
          // Always refresh inbox badge
          qc.invalidateQueries({ queryKey: ['my-tasks'] })
          // A task of mine moved: the workflow timeline and the page's own
          // controls are stale too.
          qc.invalidateQueries({ queryKey: ['module-workflow'] })
          qc.invalidateQueries({ queryKey: ['view-context'] })

          // Seamless transition: if this task is for the entity the user
          // is currently viewing, call the callback instead of showing
          // a generic "go to inbox" toast.
          const isCurrentEntity = watchEntityType && watchEntityId && (
            // Same-entity match: entityType + entityId matches current page
            (event.entityType === watchEntityType &&
             String(event.entityId) === String(watchEntityId)) ||
            // Cross-entity match: artifactId matches current page's entity ID
            // e.g. WF16 task assigned with artifactId=engagementId, user is on engagement page
            // Only when the artifact is a different record from the workflow's
            // entity: an issue task carries its own issue as artifact, and
            // Issue 74 is not Vendor Assessment 74 — matching on the bare id
            // sent the assessment page off to the issue screen.
            (event.artifactId && String(event.artifactId) === String(watchEntityId)
              && String(event.artifactId) !== String(event.entityId)) ||
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

  useEffect(() => {
    if (!entityType || !artifactId) return
    return subscribeDurable(`/topic/artifact/${entityType.toLowerCase()}/${artifactId}`, () => {
      // Invalidate all queries related to this artifact
      qc.invalidateQueries({ queryKey: ['vendor-assessment', artifactId] })
      qc.invalidateQueries({ queryKey: ['workflow-progress'] })
      qc.invalidateQueries({ queryKey: ['module-workflow'] })
    })
  }, [entityType, artifactId, qc])
}

// ── Event handler ─────────────────────────────────────────────────────────────

function handleInstanceEvent(event, workflowInstanceId, qc, showToasts) {
  // Always invalidate progress for any event on this instance
  qc.invalidateQueries({ queryKey: ['workflow-progress', workflowInstanceId] })
  qc.invalidateQueries({ queryKey: ['workflow-instance', workflowInstanceId] })
  // The module page's Workflow tab reads instance + progress under one key of
  // its own, and every page's controls hang off view-context. Both move with
  // any event on the instance — a step advancing, completing, or being reset.
  qc.invalidateQueries({ queryKey: ['module-workflow'] })
  qc.invalidateQueries({ queryKey: ['view-context'] })

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