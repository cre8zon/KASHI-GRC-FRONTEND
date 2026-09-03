import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { contentApi } from '../api/content.api'

/**
 * Content hooks. The interesting one is useAutosave.
 */

export const usePosts = (params) =>
  useQuery({
    queryKey: ['content-posts', params],
    queryFn: () => contentApi.listPosts(params),
  })

export const usePost = (id) =>
  useQuery({
    queryKey: ['content-post', id],
    queryFn: () => contentApi.getPost(id),
    enabled: !!id,
  })

export const useContentTaxonomy = () => {
  const categories = useQuery({
    queryKey: ['content-categories'],
    queryFn: () => contentApi.categories(),
  })
  const tags = useQuery({
    queryKey: ['content-tags'],
    queryFn: () => contentApi.tags(),
  })
  const authors = useQuery({
    queryKey: ['content-authors'],
    queryFn: () => contentApi.authors(),
  })
  return { categories, tags, authors }
}

/**
 * Autosave.
 *
 * ── WHY THE QUEUE ────────────────────────────────────────────────────────────
 * A naive debounce fires a request two seconds after typing stops, and if the
 * user keeps typing while that request is in flight, the next one starts before
 * the first returns. Responses arrive out of order and the older one wins,
 * silently reverting a few seconds of writing. That bug is nearly impossible to
 * reproduce deliberately and infuriating to hit.
 *
 * So: one request in flight at a time. Anything typed while a save is running
 * is held and sent when it lands.
 *
 * ── NEVER BLOCK TYPING ───────────────────────────────────────────────────────
 * The editor state is local. This syncs it. A failed save shows a status and
 * retries on the next change; it does not roll back what is on screen, because
 * the thing on screen is what the person wrote.
 */
export const useAutosave = (postId, { delay = 2000 } = {}) => {
  // 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  const [status, setStatus] = useState('idle')
  const [savedAt, setSavedAt] = useState(null)

  const timer   = useRef(null)
  const inFlight = useRef(false)
  const queued  = useRef(null)
  const client  = useQueryClient()

  const flush = useCallback(async () => {
    if (inFlight.current || !queued.current || !postId) return

    const payload = queued.current
    queued.current = null
    inFlight.current = true
    setStatus('saving')

    try {
      await contentApi.updatePost(postId, payload)
      setSavedAt(new Date())
      setStatus('saved')
      client.invalidateQueries({ queryKey: ['content-posts'] })
    } catch (err) {
      setStatus('error')
      // A 409 means the slug was taken between typing it and saving. Worth a
      // toast — the rest is transient and the next save will carry it.
      const code = err?.response?.data?.error?.code
      if (code === 'SLUG_TAKEN' || code === 'SLUG_INVALID') {
        toast.error(err.response.data.error.message)
      }
    } finally {
      inFlight.current = false
      if (queued.current) flush()
    }
  }, [postId, client])

  const save = useCallback((patch) => {
    // Merge rather than replace: two fields changed inside one debounce window
    // must both survive.
    queued.current = { ...(queued.current || {}), ...patch }
    setStatus('pending')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }, [flush, delay])

  /** Call before navigating away. Sends immediately rather than waiting out the debounce. */
  const saveNow = useCallback(() => {
    clearTimeout(timer.current)
    return flush()
  }, [flush])

  useEffect(() => () => clearTimeout(timer.current), [])

  return { save, saveNow, status, savedAt }
}

/**
 * Publish, with the full problem list surfaced.
 *
 * The server returns every failure at once in error.details.problems. Render
 * all of them. Showing the first one and making the author click publish again
 * to discover the second is the interaction that makes people give up on a CMS.
 */
export const usePublish = (postId) => {
  const client = useQueryClient()
  const [problems, setProblems] = useState([])

  const mutation = useMutation({
    mutationFn: () => contentApi.publish(postId),
    onSuccess: () => {
      setProblems([])
      toast.success('Published')
      client.invalidateQueries({ queryKey: ['content-post', postId] })
      client.invalidateQueries({ queryKey: ['content-posts'] })
    },
    onError: (err) => {
      const details = err?.response?.data?.error?.details
      if (details?.problems?.length) {
        setProblems(details.problems)
      } else {
        toast.error(err?.response?.data?.error?.message || 'Could not publish')
      }
    },
  })

  return { publish: mutation.mutate, publishing: mutation.isPending, problems, setProblems }
}

/**
 * One AI task, as a proposal the user accepts or rejects.
 *
 * ── THE FEEDBACK CALL IS NOT OPTIONAL ────────────────────────────────────────
 * accept, reject AND dismiss all report to /v1/ai/feedback. A suggestion that
 * was shown and quietly abandoned is the most informative outcome there is, and
 * it cannot be reconstructed after the fact. Wire dismiss even though it feels
 * like the one that does not matter.
 */
/**
 * Is the AI panel worth showing? A tab that is present but throws on click is
 * worse than one that is absent, and "absent" is the correct state whenever the
 * platform has no provider configured.
 *
 * Fails closed on error: if health cannot be read, assume unavailable.
 */
export const useAiEnabled = () => {
  const { data } = useQuery({
    queryKey: ['ai-health'],
    queryFn: () => contentApi.aiHealth(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  return (data?.providers?.length ?? 0) > 0
}

export const useAiProposal = (taskType) => {
  const [proposal, setProposal] = useState(null)
  const [warnings, setWarnings] = useState([])

  const mutation = useMutation({
    mutationFn: (payload) => contentApi.ai(taskType, payload),
    onSuccess: (res) => {
      // The axios interceptor unwraps ApiResponse, so `res` IS the Proposal.
      // That also means the envelope's status is no longer reachable here —
      // warnings travel on the payload itself, which is where the AI panel
      // reads them from anyway.
      setProposal(res)
      setWarnings(res?.warnings || [])
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error?.message || 'The model could not complete that')
    },
  })

  const clear = () => { setProposal(null); setWarnings([]) }

  return {
    run: mutation.mutate,
    running: mutation.isPending,
    proposal,
    warnings,
    clear,
  }
}