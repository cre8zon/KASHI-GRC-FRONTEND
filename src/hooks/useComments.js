/**
 * useComments — real-time comment system using WebSocket + React Query.
 *
 * WebSocket topic: /topic/comments/{entityType}/{entityId}
 * REST fallback:   GET /v1/comments?entityType=X&entityId=Y
 *
 * New comments arrive via WebSocket and are appended to the cache
 * without a full refetch — same pattern as the compound task progress hook.
 */

import { useEffect }                 from 'react'
import { useQuery, useMutation,
         useQueryClient }            from '@tanstack/react-query'
import { useSelector }               from 'react-redux'
import { selectAuth }                from '../store/slices/authSlice'
import toast                         from 'react-hot-toast'
import { commentsApi }               from '../api/comments.api'

// ── Shared STOMP client — ONE connection for the entire app ──────────────────
// Key invariant: only one Client is ever created at a time.
// _connectingPromise prevents concurrent getStompClient() calls from each
// spawning their own Client (the root cause of N WebSocket connections when
// N AnswerCards each call useQuestionComments simultaneously).
let _stompClient = null
let _connectingPromise = null        // in-flight connect promise
let _wsAvailable = true              // flip to false after repeated failures
const _subscribers = new Map()       // topic → Set<callback>

async function getStompClient(token) {
  if (_stompClient?.connected) return _stompClient
  if (!_wsAvailable) return null      // server unreachable — stop trying
  if (_connectingPromise) return _connectingPromise  // reuse in-flight promise

  _connectingPromise = (async () => {
    try {
      const [{ Client }, { default: SockJS }] = await Promise.all([
        import('@stomp/stompjs'),
        import('sockjs-client'),
      ])
      const client = new Client({
        webSocketFactory: () => new SockJS(
          `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/ws`
        ),
        connectHeaders: { Authorization: `Bearer ${token}` },
        reconnectDelay: 10000,   // slower retry to reduce log noise
        onConnect: () => {
          _stompClient = client
          _connectingPromise = null
          // Re-subscribe all pending topics after reconnect
          _subscribers.forEach((callbacks, topic) => {
            if (callbacks.size > 0) {
              client.subscribe(topic, (msg) => {
                try {
                  const event = JSON.parse(msg.body)
                  callbacks.forEach(cb => cb(event))
                } catch (e) { /* ignore */ }
              })
            }
          })
        },
        onDisconnect: () => {
          _stompClient = null
          _connectingPromise = null
        },
        onStompError: () => {
          _stompClient = null
          _connectingPromise = null
        },
        onWebSocketError: () => {
          _stompClient = null
          _connectingPromise = null
        },
      })
      client.activate()
      return client
    } catch (e) {
      _connectingPromise = null
      return null
    }
  })()

  return _connectingPromise
}

function subscribeToTopic(topic, callback, token) {
  if (!_subscribers.has(topic)) _subscribers.set(topic, new Set())
  _subscribers.get(topic).add(callback)

  let sub = null
  let retries = 0
  // Cap retries at 6 (~3 seconds). If backend is down, stop hammering.
  const MAX_RETRIES = 6
  const interval = setInterval(async () => {
    try {
      const client = await getStompClient(token)
      if (client?.connected) {
        sub = client.subscribe(topic, (msg) => {
          try {
            const event = JSON.parse(msg.body)
            callback(event)
          } catch (e) { /* ignore */ }
        })
        clearInterval(interval)
      } else if (retries++ > MAX_RETRIES) {
        clearInterval(interval)  // backend down — give up gracefully
      }
    } catch (e) {
      if (retries++ > 30) clearInterval(interval)
    }
  }, 500)

  return () => {
    clearInterval(interval)
    sub?.unsubscribe()
    _subscribers.get(topic)?.delete(callback)
  }
}

// ── Main hook ─────────────────────────────────────────────────────────────────

/**
 * useComments — load + subscribe to real-time comments for any entity.
 *
 * @param {'TASK'|'ASSESSMENT'|'QUESTION_RESPONSE'} entityType
 * @param {number|null} entityId
 * @param {object} options
 * @param {boolean} options.enabled
 */
export function useComments(entityType, entityId, { enabled = true } = {}) {
  const qc              = useQueryClient()
  const { token }       = useSelector(selectAuth)
  const queryKey        = ['comments', entityType, entityId]
  const topic           = `/topic/comments/${entityType?.toLowerCase()}/${entityId}`

  // ── REST fetch ──────────────────────────────────────────────────────────────
  const { data: comments = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => commentsApi.list(entityType, entityId),
    enabled: !!entityType && !!entityId && enabled,
    select:  (d) => Array.isArray(d) ? d : (d?.data || []),
    staleTime: 60_000,
  })

  // ── WebSocket subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!entityType || !entityId || !enabled || !token) return

    const handleEvent = (event) => {
      if (event.type !== 'COMMENT_ADDED') return
      const newComment = event.comment
      if (!newComment) return

      // Append to cache without refetch
      qc.setQueryData(queryKey, (prev) => {
        const arr = Array.isArray(prev) ? prev : []
        // Deduplicate by id
        if (arr.some(c => c.id === newComment.id)) return arr
        return [...arr, newComment]
      })
    }

    return subscribeToTopic(topic, handleEvent, token)
  }, [entityType, entityId, enabled, token, topic]) // eslint-disable-line

  // ── Add comment mutation ────────────────────────────────────────────────────
  const { mutate: addComment, isPending: adding } = useMutation({
    mutationFn: (data) => commentsApi.add({
      entityType,
      entityId,
      ...data,
    }),
    onSuccess: (newComment) => {
      // Optimistically append (WS will deduplicate if it also arrives)
      qc.setQueryData(queryKey, (prev) => {
        const arr = Array.isArray(prev) ? prev : []
        const c = Array.isArray(newComment) ? newComment[0] : (newComment?.data || newComment)
        if (!c?.id || arr.some(x => x.id === c.id)) return arr
        return [...arr, c]
      })
    },
    onError: (e) => toast.error(e?.message || 'Failed to add comment'),
  })

  return { comments, isLoading, addComment, adding }
}

/**
 * useQuestionComments — real-time comments for a specific question instance.
 * Used on fill/review pages.
 */
export function useQuestionComments(questionInstanceId, { enabled = true } = {}) {
  const qc        = useQueryClient()
  const { token } = useSelector(selectAuth)
  const queryKey  = ['q-comments', questionInstanceId]
  // Question comments broadcast on the QUESTION_RESPONSE entity topic
  // using questionInstanceId as entity_id
  const topic = `/topic/comments/question_response/${questionInstanceId}`

  const { data: comments = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => commentsApi.listQuestion(questionInstanceId),
    enabled: !!questionInstanceId && enabled,
    select:  (d) => Array.isArray(d) ? d : (d?.data || []),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!questionInstanceId || !enabled || !token) return
    const handleEvent = (event) => {
      if (event.type !== 'COMMENT_ADDED') return
      const c = event.comment
      if (!c) return
      qc.setQueryData(queryKey, (prev) => {
        const arr = Array.isArray(prev) ? prev : []
        if (arr.some(x => x.id === c.id)) return arr
        return [...arr, c]
      })
    }
    return subscribeToTopic(topic, handleEvent, token)
  }, [questionInstanceId, enabled, token, topic]) // eslint-disable-line

  const { mutate: addComment, isPending: adding } = useMutation({
    mutationFn: (data) => commentsApi.add({
      entityType: 'QUESTION_RESPONSE',
      entityId:   questionInstanceId,
      questionInstanceId,
      ...data,
    }),
    onSuccess: (newComment) => {
      qc.setQueryData(queryKey, (prev) => {
        const arr = Array.isArray(prev) ? prev : []
        const c = Array.isArray(newComment) ? newComment[0] : (newComment?.data || newComment)
        if (!c?.id || arr.some(x => x.id === c.id)) return arr
        return [...arr, c]
      })
    },
    onError: (e) => toast.error(e?.message || 'Failed to add comment'),
  })

  return { comments, isLoading, addComment, adding }
}