/**
 * session.js — one place that decides what happens when a session ends or
 * needs renewing. Used by the axios interceptor (reactive: a 401 came back)
 * and by SessionManager (proactive: the token is about to expire, or the user
 * has been idle too long).
 *
 * THE BUG THIS REPLACES
 *   The backend answered an expired token with a bare 403 (no entry point was
 *   configured), so the client's 401 → logout path never ran. Every query on
 *   the page failed, the UI showed empty states and "server unreachable"
 *   banners, and the user had no idea they simply needed to sign in again.
 *   Now: the server says 401 + AUTH_SESSION_EXPIRED, we try ONE silent refresh,
 *   and if that fails the user lands on the sign-in page with a message that
 *   says what happened and is returned to where they were afterwards.
 */
import axios from 'axios'
import { store } from '../store'
import { logout, sessionRefreshed } from '../store/slices/authSlice'
import { queryClient } from '../config/queryClient'
import { isJwtExpired } from './jwt'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

const REASON_KEY    = 'kashi_session_end_reason'
const RETURN_KEY    = 'kashi_return_to'
const BROADCAST_KEY = 'kashi_logout_broadcast'

/** 401 codes that mean "this session is over" (vs. a wrong password etc.). */
export const SESSION_CODES = new Set(['AUTH_SESSION_EXPIRED', 'AUTH_TOKEN_INVALID', 'AUTH_REQUIRED'])

/** Endpoints whose 401 is about the credentials in the body, not the session. */
const AUTH_ENDPOINT = /\/v1\/auth\/(login|refresh|logout|request-password-reset|reset-password)\b/

export function isAuthEndpoint(url = '') { return AUTH_ENDPOINT.test(url) }

// ── Refresh (single-flight) ───────────────────────────────────────────────────
let inFlight = null

/** True when a refresh is possible at all (a refresh token that hasn't expired). */
export function canRefresh() {
  const { refreshToken, isAuthenticated } = store.getState().auth
  return !!(isAuthenticated && refreshToken && !isJwtExpired(refreshToken))
}

/**
 * Exchanges the refresh token for a new session. Concurrent callers share one
 * request — ten queries failing at once must not fire ten refreshes (each would
 * rotate the refresh token and invalidate the others' result).
 * Resolves to the new access token; rejects if the session cannot be renewed.
 */
export function refreshSession() {
  if (inFlight) return inFlight
  if (!canRefresh()) return Promise.reject(new Error('NO_REFRESH_TOKEN'))

  const { refreshToken, tenantId } = store.getState().auth
  inFlight = axios
    // Raw axios on purpose: the app instance's interceptors would treat a 401
    // here as yet another expired call and recurse.
    .post(`${BASE_URL}/v1/auth/refresh`, { refreshToken, tenantId }, { timeout: 20_000 })
    .then((res) => {
      const payload = res.data?.data
      if (!payload?.session?.token) throw new Error('REFRESH_EMPTY')
      store.dispatch(sessionRefreshed(payload))
      return payload.session.token
    })
    .finally(() => { inFlight = null })
  return inFlight
}

// ── End of session ────────────────────────────────────────────────────────────
let ending = false

/**
 * Ends the session locally and sends the user to sign in.
 *
 * reason: 'expired' | 'idle' | 'invalid' | 'signed_out' | 'signed_out_elsewhere'
 *
 * Navigation is a side effect of the logout itself: RequireAuth sees
 * isAuthenticated=false and redirects to /auth/login with the current
 * location in state, so the login page can return the user there. The hard
 * redirect below is only a safety net for a render that never happens.
 */
export function endSession(reason = 'expired', { broadcast = true } = {}) {
  if (ending) return
  if (!store.getState().auth.isAuthenticated) return
  ending = true

  // Revoke the refresh token server-side (fire-and-forget). Without this a
  // copied refresh token kept minting sessions for its full lifetime after
  // the user had "signed out". Raw axios: no interceptors, no retries.
  const { refreshToken } = store.getState().auth
  if (refreshToken) {
    axios.post(`${BASE_URL}/v1/auth/logout`, { refreshToken }, { timeout: 10_000 }).catch(() => {})
  }

  try {
    sessionStorage.setItem(REASON_KEY, reason)
    const { pathname, search } = window.location
    if (!pathname.startsWith('/auth')) sessionStorage.setItem(RETURN_KEY, pathname + search)
  } catch { /* storage unavailable */ }

  store.dispatch(logout())
  queryClient.clear()

  if (broadcast) {
    // Other tabs listen for this (SessionManager) and sign out too, so a shared
    // computer is never left with a live tab after "Sign out".
    try { localStorage.setItem(BROADCAST_KEY, `${Date.now()}:${reason}`) } catch { /* */ }
  }

  setTimeout(() => {
    ending = false
    if (!window.location.pathname.startsWith('/auth/')) window.location.assign('/auth/login')
  }, 400)
}

/** Read-and-clear the reason the last session ended (for the login banner). */
export function consumeSessionEndReason() {
  try {
    const r = sessionStorage.getItem(REASON_KEY)
    sessionStorage.removeItem(REASON_KEY)
    return r
  } catch { return null }
}

/** Read-and-clear where to send the user after they sign in again. */
export function consumeReturnTo() {
  try {
    const r = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    // Same-origin paths only — never an absolute URL from storage.
    return r && r.startsWith('/') && !r.startsWith('//') ? r : null
  } catch { return null }
}

export const SESSION_BROADCAST_KEY = BROADCAST_KEY

// ── Where to land after signing in ────────────────────────────────────────────
// The login route is wrapped in RedirectIfAuthed, which sends a signed-in user
// to /dashboard the instant the store flips — racing the login page's own
// navigate(). Holding the intended target here lets RedirectIfAuthed send the
// user back to the page their session ended on instead.
let postLoginTarget = null
export function setPostLoginTarget(path) {
  postLoginTarget = path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/auth') ? path : null
  if (postLoginTarget) setTimeout(() => { postLoginTarget = null }, 5_000)
}
export function peekPostLoginTarget() { return postLoginTarget }
