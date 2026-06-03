/**
 * useServerStatus.js
 *
 * Detects whether the backend API is reachable.
 * Combines three signals:
 *   1. browser navigator.onLine (catches pure network loss)
 *   2. React Query's onlineManager (catches fetch-level failures)
 *   3. A lightweight health-check ping to /actuator/health every 15s
 *      when the app believes it might be offline
 *
 * Status values:
 *   'online'     — everything healthy
 *   'offline'    — browser reports no network
 *   'server_down'— browser online but API not responding (server stopped,
 *                  deploy in progress, Aiven sleep, etc.)
 *   'degraded'   — API responding slowly (>3s) — warns but doesn't block
 *
 * Usage:
 *   const { status, lastOnline, retryNow } = useServerStatus()
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient }  from '@tanstack/react-query'
import { serverStatusStore } from '../store/serverStatusStore'

const HEALTH_ENDPOINT  = '/actuator/health'
const PING_INTERVAL_MS = 15_000   // re-check every 15s when suspected down
const SLOW_THRESHOLD   = 3_000    // >3s response = degraded
const BASE_URL         = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

async function pingServer() {
  const start = Date.now()
  try {
    const res = await fetch(`${BASE_URL}${HEALTH_ENDPOINT}`, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
      cache: 'no-store',
    })
    const elapsed = Date.now() - start
    if (!res.ok) return 'server_down'
    if (elapsed > SLOW_THRESHOLD) return 'degraded'
    return 'online'
  } catch {
    return 'server_down'
  }
}

export function useServerStatus() {
  const [status,     setStatus]     = useState('online')
  const [lastOnline, setLastOnline] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const [nextRetryIn, setNextRetryIn] = useState(0)
  const intervalRef  = useRef(null)
  const countdownRef = useRef(null)
  const qc = useQueryClient()

  const updateStatus = useCallback((next) => {
    setStatus(prev => {
      if (prev === next) return prev
      if (next === 'online') {
        setLastOnline(new Date())
        setRetryCount(0)
        setNextRetryIn(0)
        // Back online — refetch all stale queries
        qc.invalidateQueries()
      }
      // Publish to the store so axios interceptor can read it
      serverStatusStore.set(next)
      return next
    })
  }, [qc])

  const runPing = useCallback(async () => {
    if (!navigator.onLine) { updateStatus('offline'); return }
    const result = await pingServer()
    updateStatus(result)
    if (result !== 'online') {
      setRetryCount(c => c + 1)
    }
  }, [updateStatus])

  // Countdown timer shown in the banner
  const startCountdown = useCallback((seconds) => {
    setNextRetryIn(seconds)
    clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setNextRetryIn(s => {
        if (s <= 1) { clearInterval(countdownRef.current); return 0 }
        return s - 1
      })
    }, 1_000)
  }, [])

  const retryNow = useCallback(async () => {
    clearInterval(intervalRef.current)
    clearInterval(countdownRef.current)
    setNextRetryIn(0)
    await runPing()
    // Schedule next auto-retry
    const delay = Math.min(PING_INTERVAL_MS, 5_000 + retryCount * 5_000)
    startCountdown(Math.round(delay / 1000))
    intervalRef.current = setInterval(runPing, delay)
  }, [runPing, retryCount, startCountdown])

  useEffect(() => {
    // Listen to browser online/offline events immediately
    const handleOffline = () => updateStatus('offline')
    const handleOnline  = () => runPing()  // browser says online, verify with ping
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online',  handleOnline)

    // Initial ping — check on mount
    runPing()

    // Start polling only if down
    intervalRef.current = setInterval(async () => {
      if (status !== 'online') {
        await runPing()
        startCountdown(Math.round(PING_INTERVAL_MS / 1000))
      }
    }, PING_INTERVAL_MS)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online',  handleOnline)
      clearInterval(intervalRef.current)
      clearInterval(countdownRef.current)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Re-start polling interval when status changes
  useEffect(() => {
    clearInterval(intervalRef.current)
    if (status !== 'online') {
      const delay = Math.min(PING_INTERVAL_MS, 5_000 + retryCount * 5_000)
      startCountdown(Math.round(delay / 1000))
      intervalRef.current = setInterval(runPing, delay)
    }
    return () => clearInterval(intervalRef.current)
  }, [status])  // eslint-disable-line react-hooks/exhaustive-deps

  return { status, lastOnline, retryNow, nextRetryIn, retryCount }
}