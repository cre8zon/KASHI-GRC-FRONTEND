/**
 * useActionItems — KashiTrack hooks.
 *
 * Real-time via WebSocket: /topic/user/{userId}
 * Listens for ACTION_ITEM_CREATED and ACTION_ITEM_UPDATED events.
 * Appends/updates cache without refetch — same pattern as useComments.
 */
import { useEffect, createContext, useContext, useMemo, createElement } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSelector }        from 'react-redux'
import { selectAuth }         from '../store/slices/authSlice'
import { actionItemsApi }     from '../api/actionItems.api'
import toast                  from 'react-hot-toast'

// ── WebSocket subscription (reuses module-level client from useComments) ──────
// We subscribe to /topic/user/{userId} which already exists in WorkflowSocket.
// Action item events are pushed on the same personal channel.

const QUERY_KEY_MY    = ['action-items-my']
const QUERY_KEY_COUNT = ['action-items-count']

/**
 * useMyActionItems — full list for Action Items page.
 * Real-time: WS events append/update cache.
 */
export function useMyActionItems() {
  const qc         = useQueryClient()
  const { userId, token } = useSelector(selectAuth)

  const { data: items = [], isLoading } = useQuery({
    queryKey: QUERY_KEY_MY,
    queryFn:  () => actionItemsApi.my(),
    select:   (d) => Array.isArray(d) ? d : (d?.data || []),
    staleTime: 60_000,
  })

  // Subscribe to user's personal WS topic for action item events
  useEffect(() => {
    if (!userId || !token) return
    let sub = null
    let retries = 0

    const subscribe = async () => {
      try {
        const [{ Client }, { default: SockJS }] = await Promise.all([
          import('@stomp/stompjs'),
          import('sockjs-client'),
        ])
        // Try to reuse existing client from window if available
        if (window._kashiStompClient?.connected) {
          sub = window._kashiStompClient.subscribe(
            `/topic/user/${userId}`,
            (msg) => handleUserEvent(msg, qc)
          )
          return
        }
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
          connectHeaders: { Authorization: `Bearer ${token}` },
          reconnectDelay: 5000,
          onConnect: () => {
            window._kashiStompClient = client
            sub = client.subscribe(`/topic/user/${userId}`, (msg) =>
              handleUserEvent(msg, qc)
            )
          },
        })
        client.activate()
      } catch (e) {
        if (retries++ < 20) setTimeout(subscribe, 500)
      }
    }

    subscribe()
    return () => { sub?.unsubscribe() }
  }, [userId, token, qc])

  return { items, isLoading }
}

function handleUserEvent(msg, qc) {
  try {
    const event = JSON.parse(msg.body)
    if (!['ACTION_ITEM_CREATED', 'ACTION_ITEM_UPDATED'].includes(event.type)) return
    const item = event.actionItem
    if (!item) return

    // Update the list
    qc.setQueryData(QUERY_KEY_MY, (prev) => {
      const arr = Array.isArray(prev) ? prev : []
      const idx = arr.findIndex(x => x.id === item.id)
      if (idx >= 0) {
        // Update existing
        const next = [...arr]
        next[idx] = item
        return next
      }
      // Add new
      return [...arr, item]
    })

    // Update individual item cache if it was already fetched
    qc.setQueryData(['action-item', item.id], item)

    // Update badge count
    qc.invalidateQueries({ queryKey: QUERY_KEY_COUNT })

    // Toast on new creation
    if (event.type === 'ACTION_ITEM_CREATED') {
      toast(`New action required: ${item.title}`, { icon: '⚑', duration: 5000 })
    }
  } catch (e) { /* ignore */ }
}

/**
 * useActionItemCount — badge count for sidebar.
 * Polls every 60s + invalidated by WS events.
 */
export function useActionItemCount() {
  const { data: count = 0 } = useQuery({
    queryKey: QUERY_KEY_COUNT,
    queryFn:  () => actionItemsApi.myCount(),
    select:   (d) => (typeof d === 'number' ? d : (d?.data ?? 0)),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  return count
}

// ── Bulk action-item context ────────────────────────────────────────────────
//
// Pages that render a per-row action-item banner (assessment fill / review, with
// a banner per question) were making one request per row — two, since both
// RevisionBanner and RemediationNoticeBanner call useEntityActionItems. On a
// 90-question assessment that is ~180 requests, serialised behind the browser's
// 6-connection limit, which is most of the page's load time.
//
// Wrap such a page in ActionItemsBulkProvider and useEntityActionItems will read
// from the single bulk response instead of fetching per id. Outside a provider it
// behaves exactly as before, so no call site has to change.

const ActionItemsBulkContext = createContext(null)

export function ActionItemsBulkProvider({ entityType, entityIds, enabled = true, children }) {
  // Stable primitive key so a fresh array identity each render doesn't refetch.
  const idKey = useMemo(
    () => (entityIds || []).filter(Boolean).map(String).sort().join(','),
    [entityIds],
  )

  const { data = [], isLoading } = useQuery({
    queryKey: ['action-items-entities', entityType, idKey],
    queryFn:  () => actionItemsApi.forEntities(entityType, idKey.split(',')),
    select:   (d) => (Array.isArray(d) ? d : (d?.data || [])),
    enabled:  !!entityType && !!idKey && enabled,
    staleTime: 30_000,
  })

  const value = useMemo(() => {
    const byEntity = new Map()
    for (const item of data) {
      const key = String(item.entityId)
      if (!byEntity.has(key)) byEntity.set(key, [])
      byEntity.get(key).push(item)
    }
    return { entityType, byEntity, isLoading, ready: !!idKey }
  }, [data, entityType, isLoading, idKey])

  // createElement rather than JSX: this file is .js, and Vite/esbuild only enable
  // the JSX syntax extension for .jsx. JSX here fails the transform with a 500,
  // which takes down every module that imports this hook.
  return createElement(ActionItemsBulkContext.Provider, { value }, children)
}

/**
 * useEntityActionItems — for entity oversight views (CISO, coordinator).
 *
 * Reads from ActionItemsBulkProvider when one is mounted for the same entityType;
 * otherwise falls back to its own per-id request.
 */
export function useEntityActionItems(entityType, entityId, { enabled = true } = {}) {
  const bulk = useContext(ActionItemsBulkContext)
  const servedByBulk = !!bulk && bulk.ready && bulk.entityType === entityType

  const query = useQuery({
    queryKey: ['action-items-entity', entityType, entityId],
    queryFn:  () => actionItemsApi.forEntity(entityType, entityId),
    select:   (d) => Array.isArray(d) ? d : (d?.data || []),
    // Disabled entirely when the bulk provider already has this data.
    enabled:  !servedByBulk && !!entityType && !!entityId && enabled,
    staleTime: 30_000,
  })

  if (servedByBulk) {
    return {
      ...query,
      data: bulk.byEntity.get(String(entityId)) || [],
      isLoading: bulk.isLoading,
      isFetching: bulk.isLoading,
    }
  }
  return query
}

/**
 * useGetActionItem — fetch a single action item by ID.
 *
 * Used by CompoundSectionRenderer and item detail drawers to load a specific
 * action item for display or editing.
 *
 * GET /v1/action-items/:id
 */
export function useGetActionItem(id, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['action-item', id],
    queryFn:  () => actionItemsApi.getById(id),
    select:   (d) => d?.data ?? d,
    enabled:  !!id && enabled,
    staleTime: 30_000,
  })
}

/**
 * useUpdateActionItem — update an action item's details.
 *
 * Used by action item edit forms in new module pages.
 * Invalidates the my-items list and the individual item cache on success.
 * Real-time WS events will also update both caches if the backend pushes them.
 *
 * PUT /v1/action-items/:id
 * Body: { title?, description?, dueAt?, priority?, assignedTo?, navContext?, itemScreenKey? }
 */
export function useUpdateActionItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => actionItemsApi.update(id, data),
    onSuccess: (result) => {
      const item = result?.data ?? result
      if (!item?.id) return
      // Update individual item cache
      qc.setQueryData(['action-item', item.id], item)
      // Update in my-items list if present
      qc.setQueryData(QUERY_KEY_MY, (prev) => {
        const arr = Array.isArray(prev) ? prev : []
        const idx = arr.findIndex(x => x.id === item.id)
        if (idx < 0) return prev
        const next = [...arr]
        next[idx] = item
        return next
      })
    },
    onError: (e) => toast.error(e?.message || 'Failed to update action item'),
  })
}

/**
 * useUpdateActionItemStatus — PATCH status mutation.
 */
export function useUpdateActionItemStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, resolutionNote }) =>
      actionItemsApi.updateStatus(id, status, resolutionNote),
    onSuccess: (updated) => {
      const item = Array.isArray(updated) ? updated[0] : (updated?.data || updated)
      if (!item?.id) return
      // Update in my-items list
      qc.setQueryData(QUERY_KEY_MY, (prev) => {
        const arr = Array.isArray(prev) ? prev : []
        return arr.map(x => x.id === item.id ? item : x)
      })
      // Update individual item cache
      qc.setQueryData(['action-item', item.id], item)
      qc.invalidateQueries({ queryKey: QUERY_KEY_COUNT })
    },
    onError: (e) => toast.error(e?.message || 'Failed to update action item'),
  })
}