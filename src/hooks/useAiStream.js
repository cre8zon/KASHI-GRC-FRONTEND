import { useCallback, useRef, useState } from 'react'
import { store } from '../store'

/**
 * useAiStream — consumes the SSE rewrite endpoint.
 *
 * ── WHY fetch AND NOT EventSource ────────────────────────────────────────────
 * EventSource cannot send a request body and cannot set an Authorization header.
 * Both are non-negotiable here: the rewrite needs the selected passage in a POST
 * body, and every route in this platform is JWT-authenticated. Putting a token
 * in a query string to satisfy EventSource would write it into every access log
 * between the browser and the server.
 *
 * fetch + ReadableStream gives full control over headers, body and cancellation.
 *
 * ── WHY STREAM AT ALL ────────────────────────────────────────────────────────
 * The user has text selected and is watching the spot where it will change. Six
 * seconds of spinner reads as broken; six seconds of text arriving reads as
 * fast. It is the same six seconds.
 *
 * Only the rewrite streams. The draft pipeline validates and repairs after
 * generation, so streaming it would show text a later step then rewrites, which
 * reads as the system changing its mind.
 */
export function useAiStream() {
  const [text, setText]           = useState('')
  const [isStreaming, setStreaming] = useState(false)
  const [error, setError]         = useState(null)
  const abortRef                  = useRef(null)

  const start = useCallback(async (path, payload, { onToken, onDone, onError } = {}) => {
    setText('')
    setError(null)
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    const { auth } = store.getState()
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

    let assembled = ''

    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth.token    ? { Authorization: `Bearer ${auth.token}` } : {}),
          ...(auth.tenantId ? { 'X-Tenant-ID': auth.tenantId }          : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (!res.ok) {
        // The server sends a normal ApiResponse error before the stream opens —
        // a budget block or a guardrail refusal arrives here, not as a frame.
        let message = `Request failed (${res.status})`
        try {
          const body = await res.json()
          message = body?.error?.message || message
        } catch { /* non-JSON error body */ }
        throw new Error(message)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // SSE frames are separated by a blank line. A frame may span two reads,
        // so keep the trailing partial in the buffer rather than parsing it.
        const frames = buffer.split('\n\n')
        buffer = frames.pop()

        for (const frame of frames) {
          const lines = frame.split('\n')
          let event = 'message'
          let data  = ''

          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) data += line.slice(5).trim()
          }

          if (event === 'token' && data) {
            assembled += data
            setText(assembled)
            onToken?.(data, assembled)
          } else if (event === 'done') {
            onDone?.(assembled)
          } else if (event === 'error') {
            let message = 'Generation failed'
            try { message = JSON.parse(data)?.message || message } catch { /* plain text */ }
            throw new Error(message)
          }
        }
      }

      onDone?.(assembled)
      return assembled

    } catch (e) {
      // An abort is a user action, not a failure — do not surface it as an error.
      if (e.name === 'AbortError') return assembled
      setError(e.message)
      onError?.(e)
      return null
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [])

  /** Cancel in flight. The server-side call still completes and is still billed. */
  const stop = useCallback(() => {
    abortRef.current?.abort()
    setStreaming(false)
  }, [])

  const reset = useCallback(() => {
    setText('')
    setError(null)
  }, [])

  return { text, isStreaming, error, start, stop, reset }
}

export default useAiStream
