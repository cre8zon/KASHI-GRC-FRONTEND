import { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { useLocation } from 'react-router-dom'
import { selectAuth } from '../../store/slices/authSlice'
import { initAnalytics, identify, resetAnalytics, trackPage } from '../../lib/analytics'

/**
 * Connects analytics to auth and routing, in one place.
 *
 * ── WHY A COMPONENT RATHER THAN CALLS IN useAuth ──────────────────────────
 * Putting identify() inside the login handler and reset() inside logout means
 * two files change whenever the analytics contract does, and — the real
 * problem — a session restored from a stored token on page refresh never logs
 * in again, so it would never be identified. Reacting to auth STATE covers
 * both the login and the refresh, because both end with the same state.
 *
 * Mount it once, inside the Router and the Redux Provider.
 */
export default function AnalyticsBridge() {
  const auth = useSelector(selectAuth)
  const location = useLocation()
  const identified = useRef(null)

  useEffect(() => { initAnalytics() }, [])

  useEffect(() => {
    const user = auth?.user
    if (user?.userId) {
      // Only on change. React re-renders often and identify() on every one
      // burns quota and rewrites the person record for nothing.
      const key = `${user.userId}:${user.tenantId}`
      if (identified.current !== key) {
        identified.current = key
        identify({
          userId: user.userId,
          tenantId: user.tenantId,
          tenantName: user.tenantName,
          roles: user.roles,
          sides: [...new Set((user.roles || []).map(r => r.side).filter(Boolean))],
        })
      }
    } else if (identified.current) {
      // Logged out. Reset so the next person on a shared machine is a separate
      // person rather than a continuation of the last one.
      identified.current = null
      resetAnalytics()
    }
  }, [auth?.user])

  // Tenant switching changes the group without a fresh login, and the effect
  // above catches it because tenantId is part of the key.
  useEffect(() => {
    if (auth?.user?.userId) trackPage(location.pathname)
  }, [location.pathname, auth?.user?.userId])

  return null
}