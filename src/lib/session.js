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
import { accountAccessStore } from '../store/accountAccessStore'
import axios from 'axios'
import { store } from '../store'
import { logout, sessionRefreshed, sessionAdopted } from '../store/slices/authSlice'
import { queryClient } from '../config/queryClient'
import { isJwtExpired } from './jwt'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

const REASON_KEY    = 'kashi_session_end_reason'
const RETURN_KEY    = 'kashi_return_to'
const BROADCAST_KEY = 'kashi_logout_broadcast'

/** 401 codes that mean "this session is over" (vs. a wrong password etc.). */
export const SESSION_CODES = new Set(['AUTH_SESSION_EXPIRED', 'AUTH_TOKEN_INVALID', 'AUTH_REQUIRED'])

/**
 * 401 codes meaning "this account may not be used any more" — the user, their
 * organisation or their vendor was suspended (AccountAccessService on the
 * server). No refresh is attempted: a new token would be refused just the same.
 * The value is the reason shown on the sign-in page.
 */
export const BLOCKED_CODES = {
  AUTH_ACCOUNT_SUSPENDED: 'account_suspended',
  AUTH_TENANT_SUSPENDED:  'tenant_suspended',
  AUTH_VENDOR_SUSPENDED:  'vendor_suspended',
}

/** The sign-in page reason for an error that ended the session. */
export function endReasonFor(err, fallback = 'expired') {
  const code = err?.response?.data?.error?.code || err?.code
  return BLOCKED_CODES[code] || fallback
}

/** Endpoints whose 401 is about the credentials in the body, not the session. */
const AUTH_ENDPOINT = /\/v1\/auth\/(login|refresh|logout|request-password-reset|reset-password)\b/

export function isAuthEndpoint(url = '') { return AUTH_ENDPOINT.test(url) }

// ── Tabs of this browser share one session ───────────────────────────────────
//
// Why: each tab used to keep its own copy of the tokens. Renewing rotates the
// refresh token (the old one stops working a minute later), so when tab A
// renewed, tab B's copy went stale; B's next renewal was refused, B signed
// out and broadcast "sign out" to every tab — everyone was logged out about
// once an hour with two tabs open. And a new tab started signed out.
//
// Now, over a BroadcastChannel (same browser, same origin only):
//   'rotated' — "I renewed the session you also hold; here are the new
//               tokens." Only a tab holding exactly the old refresh token
//               takes them, so tabs signed in to another organisation, or as
//               someone else, are never touched.
//   'ask'     — a tab without a session (just opened), or one whose renewal
//               was refused, asks whether another tab holds a live one;
//   'answer'  — a signed-in tab replies with its session.
// Closing the browser still ends a session that was not "Keep me signed in":
// it lives only in open tabs (sessionStorage), never on disk.
const CHANNEL = 'kashi_session'
const TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36)
let channel = null
try { if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(CHANNEL) } catch { channel = null }
const post = (msg) => { try { channel?.postMessage({ ...msg, tabId: TAB_ID }) } catch { /* closed */ } }
const waiters = new Map()

const liveAuth = (a) => !!(a?.isAuthenticated && a.token && a.refreshToken && !isJwtExpired(a.refreshToken))

if (channel) {
  channel.onmessage = (e) => {
    const msg = e?.data || {}
    if (!msg.type || msg.tabId === TAB_ID) return
    const auth = store.getState().auth
    if (msg.type === 'rotated') {
      if (auth.isAuthenticated && auth.refreshToken && auth.refreshToken === msg.from && liveAuth(msg.auth)) {
        store.dispatch(sessionAdopted(msg.auth))
      }
    } else if (msg.type === 'ask') {
      if (!liveAuth(auth) || ending) return
      if (msg.userId != null && String(msg.userId) !== String(auth.userId)) return
      if (msg.tenantId != null && String(msg.tenantId) !== String(auth.tenantId)) return
      post({ type: 'answer', nonce: msg.nonce, auth })
    } else if (msg.type === 'answer') {
      waiters.get(msg.nonce)?.(msg.auth)
    }
  }
}

/**
 * Ask the other open tabs for a live session (optionally: this user, this
 * organisation). Resolves to their auth state, or null after timeoutMs.
 */
export function askPeers({ userId, tenantId, timeoutMs = 500 } = {}) {
  if (!channel) return Promise.resolve(null)
  const nonce = Math.random().toString(36).slice(2)
  return new Promise((resolve) => {
    const timer = setTimeout(() => { waiters.delete(nonce); resolve(null) }, timeoutMs)
    waiters.set(nonce, (auth) => {
      if (!liveAuth(auth)) return
      clearTimeout(timer); waiters.delete(nonce); resolve(auth)
    })
    post({ type: 'ask', nonce, userId: userId ?? null, tenantId: tenantId ?? null })
  })
}

/**
 * Every live session held by the other open tabs, one per person+organisation,
 * for the sign-in page's "Continue as …". Collects answers for timeoutMs.
 */
export function listPeerSessions(timeoutMs = 600) {
  if (!channel) return Promise.resolve([])
  const nonce = Math.random().toString(36).slice(2)
  const found = new Map()
  return new Promise((resolve) => {
    waiters.set(nonce, (auth) => {
      if (!liveAuth(auth)) return
      const key = `${auth.userId}@${auth.tenantId}`
      if (!found.has(key)) found.set(key, auth)
    })
    setTimeout(() => { waiters.delete(nonce); resolve([...found.values()]) }, timeoutMs)
    post({ type: 'ask', nonce, userId: null, tenantId: null })
  })
}

/** Take over a session another tab offered (the sign-in page's "Continue as …"). */
export function adoptPeerSession(auth) {
  if (liveAuth(auth)) store.dispatch(sessionAdopted(auth))
}

// ── A new tab picks up the session of a tab already open ─────────────────────
// No longer called at start-up (see App.jsx); kept for an explicit join.
// RequireAuth waits for this (a moment) before sending anyone to sign in.
let joinPending = false
const joinListeners = new Set()
export const isJoinPending = () => joinPending
export const subscribeJoin = (l) => { joinListeners.add(l); return () => joinListeners.delete(l) }
export function joinOpenSession() {
  if (store.getState().auth.isAuthenticated || !channel) return
  // Not straight after a sign-out: that tab is on the sign-in page on purpose.
  try { if (sessionStorage.getItem(REASON_KEY)) return } catch { /* */ }
  joinPending = true
  joinListeners.forEach(l => l())
  askPeers({ timeoutMs: 600 }).then((auth) => {
    if (auth && !store.getState().auth.isAuthenticated) store.dispatch(sessionAdopted(auth))
  }).finally(() => {
    joinPending = false
    joinListeners.forEach(l => l())
  })
}

// ── Refresh (single-flight, one tab at a time) ────────────────────────────────
let inFlight = null

/**
 * True when the server REFUSED the renewal (the session really is over), as
 * opposed to not answering: a restart, a dropped connection, a laptop waking
 * up offline. Only a refusal may sign anyone out — a failure to reach the
 * server is retried, and the session carries on once it answers.
 */
export function isRefreshRefused(err) {
  if (err?.message === 'NO_REFRESH_TOKEN') return true
  const s = err?.response?.status
  return s === 400 || s === 401 || s === 403
}

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

  const startedWith = store.getState().auth.refreshToken
  const run = async () => {
    // Another tab may have renewed this very session while we waited for the
    // lock — its new tokens are already here ('rotated'). Nothing to do.
    const now = store.getState().auth
    if (now.refreshToken !== startedWith && now.token && !isJwtExpired(now.token)) return now.token

    const { refreshToken, tenantId, userId } = now
    try {
      // Raw axios on purpose: the app instance's interceptors would treat a
      // 401 here as yet another expired call and recurse.
      const res = await axios.post(`${BASE_URL}/v1/auth/refresh`, { refreshToken, tenantId }, { timeout: 20_000 })
      const payload = res.data?.data
      if (!payload?.session?.token) throw new Error('REFRESH_EMPTY')
      store.dispatch(sessionRefreshed(payload))
      post({ type: 'rotated', from: refreshToken, auth: store.getState().auth })
      return payload.session.token
    } catch (err) {
      if (isRefreshRefused(err)) {
        // Refused — most often because another tab renewed it while this one
        // was asleep in the background and missed the message. Ask before
        // giving up.
        //
        // First: the renewal may have landed here while our request was out
        // (a 'rotated' message from the tab that won).
        const cur = store.getState().auth
        if (cur.isAuthenticated && cur.refreshToken !== refreshToken && cur.token && !isJwtExpired(cur.token)) {
          return cur.token
        }
        // Then ask the other tabs. Just after the laptop wakes they are all
        // thawing at once, so give them a proper moment, twice.
        const peer = (await askPeers({ userId, tenantId, timeoutMs: 1500 }))
                  || (await askPeers({ userId, tenantId, timeoutMs: 2500 }))
        if (peer && peer.refreshToken !== refreshToken) {
          store.dispatch(sessionAdopted(peer))
          return peer.token
        }
      }
      throw err
    }
  }
  // Web Locks: one renewal at a time across every tab of this browser, so two
  // tabs never rotate the same refresh token against each other.
  const locked = typeof navigator !== 'undefined' && navigator.locks?.request
    ? navigator.locks.request('kashi_session_refresh', run)
    : run()
  inFlight = Promise.resolve(locked).finally(() => { inFlight = null })
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
  const endingUserId = store.getState().auth.userId

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
  accountAccessStore.reset()

  if (broadcast) {
    // Other tabs listen for this (SessionManager) and sign out too, so a shared
    // computer is never left with a live tab after "Sign out".
    // Carries who signed out: only that person's other tabs follow, so a
    // colleague signed in next door in the same browser stays signed in.
    try { localStorage.setItem(BROADCAST_KEY, `${Date.now()}:${reason}:${endingUserId ?? ''}`) } catch { /* */ }
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