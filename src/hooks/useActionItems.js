/**
 * useActionItems — KashiTrack hooks.
 *
 * Real-time via WebSocket: /topic/user/{userId}
 * Listens for ACTION_ITEM_CREATED and ACTION_ITEM_UPDATED events.
 * Appends/updates cache without refetch — same pattern as useComments.
 */
import { useEffect }          from 'react'
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
            `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/ws`
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

/**
 * useEntityActionItems — for entity oversight views (CISO, coordinator).
 */
export function useEntityActionItems(entityType, entityId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['action-items-entity', entityType, entityId],
    queryFn:  () => actionItemsApi.forEntity(entityType, entityId),
    select:   (d) => Array.isArray(d) ? d : (d?.data || []),
    enabled:  !!entityType && !!entityId && enabled,
    staleTime: 30_000,
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
      qc.invalidateQueries({ queryKey: QUERY_KEY_COUNT })
    },
    onError: (e) => toast.error(e?.message || 'Failed to update action item'),
  })
}
