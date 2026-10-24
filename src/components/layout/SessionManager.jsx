import { useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Clock, LogOut } from 'lucide-react'
import { selectAuth } from '../../store/slices/authSlice'
import { jwtExpiryMs } from '../../lib/jwt'
import {
  canRefresh, refreshSession, endSession, isRefreshRefused, SESSION_BROADCAST_KEY,
} from '../../lib/session'
import { Button } from '../ui/Button'

/**
 * SessionManager — keeps a signed-in session healthy, and ends it cleanly.
 *
 *   1. Renews the access token shortly BEFORE it expires (while the user is
 *      active), so nobody is ever bounced mid-task by a token that ran out.
 *   2. Signs the user out after IDLE_MINUTES of no interaction, with a
 *      WARNING_SECONDS countdown first. Activity in any tab counts for all
 *      tabs. "Keep me signed in" sessions are exempt from the idle limit.
 *   3. Signs this tab out when another tab signs out.
 *   4. Re-checks everything when a background tab becomes visible again —
 *      browsers throttle timers in hidden tabs, so they cannot be trusted alone.
 *
 * Renders nothing except the idle warning dialog.
 */

// Sign-out after this many minutes without any activity (in any tab).
// 4 hours by default: long enough that chat left open through meetings keeps
// its notifications, still a cap for an unattended computer. Closing the
// browser ends the session anyway, unless "Keep me signed in" was ticked
// (those sessions are exempt from this limit). VITE_SESSION_IDLE_MINUTES in
// .env overrides it — set at build time, so rebuild after changing it.
const DEFAULT_IDLE_MINUTES = 240
const IDLE_MINUTES = Number(import.meta.env.VITE_SESSION_IDLE_MINUTES) || DEFAULT_IDLE_MINUTES
const WARNING_SECONDS  = 60
const RENEW_BEFORE_MS  = 2 * 60 * 1000     // renew 2 min before expiry
const RETRY_AFTER_MS   = 30_000            // server not answering: try again in 30 s
const TICK_MS          = 5_000
const ACTIVITY_KEY     = 'kashi_last_activity'
const ACTIVITY_WRITE_THROTTLE_MS = 10_000

const IDLE_MS = IDLE_MINUTES * 60 * 1000

/** 239 → "3 h 59 min", 120 → "2 hours", 29 → "29 minutes". */
function idleLabel(min) {
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`
  const h = Math.floor(min / 60), m = min % 60
  if (!m) return `${h} hour${h === 1 ? '' : 's'}`
  return `${h} h ${m} min`
}

function readLastActivity() {
  try { return Number(localStorage.getItem(ACTIVITY_KEY)) || Date.now() } catch { return Date.now() }
}

export function SessionManager() {
  const { isAuthenticated, token, rememberMe } = useSelector(selectAuth)
  const [warnLeft, setWarnLeft] = useState(null)   // seconds left, or null when no warning
  const lastWrite = useRef(0)
  const renewing  = useRef(false)
  const retryAt   = useRef(0)
  const warnLeftRef = useRef(null)
  useEffect(() => { warnLeftRef.current = warnLeft }, [warnLeft])

  // ── Activity tracking (shared across tabs via localStorage) ──────────────
  const markActive = useCallback((force = false) => {
    const now = Date.now()
    if (!force && now - lastWrite.current < ACTIVITY_WRITE_THROTTLE_MS) return
    lastWrite.current = now
    try { localStorage.setItem(ACTIVITY_KEY, String(now)) } catch { /* */ }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    markActive(true)
    // While the warning is up, only the dialog's buttons count as "I'm here" —
    // otherwise moving the mouse toward "Sign out" would silently cancel it.
    const onActivity = () => { if (warnLeftRef.current == null) markActive() }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove']
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, onActivity))
  }, [isAuthenticated, markActive])

  // ── Token renewal ────────────────────────────────────────────────────────
  const renewIfNeeded = useCallback(async () => {
    if (renewing.current) return
    const exp = jwtExpiryMs(token)
    if (!exp) return
    const left = exp - Date.now()
    if (left > RENEW_BEFORE_MS) return
    if (Date.now() < retryAt.current) return

    if (!canRefresh()) {
      if (left <= 0) endSession('expired')
      return
    }
    renewing.current = true
    try { await refreshSession(); retryAt.current = 0 }
    catch (err) {
      // Only a refusal ends the session. A server that is restarting or a
      // connection that dropped is not the user's session ending — keep it,
      // and try again shortly (the top banner already says the server is
      // unreachable).
      if (isRefreshRefused(err)) endSession('expired')
      else retryAt.current = Date.now() + RETRY_AFTER_MS
    }
    finally { renewing.current = false }
  }, [token])

  // ── The heartbeat: renew + idle check ────────────────────────────────────
  const tick = useCallback(() => {
    if (!isAuthenticated) return
    renewIfNeeded()

    if (rememberMe) { if (warnLeftRef.current != null) setWarnLeft(null); return }

    const idleFor = Date.now() - readLastActivity()
    if (idleFor >= IDLE_MS) {
      setWarnLeft(null)
      endSession('idle')
    } else if (idleFor >= IDLE_MS - WARNING_SECONDS * 1000) {
      setWarnLeft(Math.max(1, Math.ceil((IDLE_MS - idleFor) / 1000)))
    } else if (warnLeftRef.current != null) {
      setWarnLeft(null)       // activity in another tab cleared the warning
    }
  }, [isAuthenticated, rememberMe, renewIfNeeded])

  useEffect(() => {
    if (!isAuthenticated) return
    tick()
    const id = setInterval(tick, TICK_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [isAuthenticated, tick])

  // Per-second countdown while the warning is visible.
  useEffect(() => {
    if (warnLeft == null) return
    const id = setInterval(() => {
      setWarnLeft(s => (s == null ? null : Math.max(0, s - 1)))
    }, 1000)
    return () => clearInterval(id)
  }, [warnLeft == null]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (warnLeft === 0) { setWarnLeft(null); endSession('idle') }
  }, [warnLeft])

  // ── Sign-out in another tab ──────────────────────────────────────────────
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== SESSION_BROADCAST_KEY || !e.newValue) return
      const reason = e.newValue.split(':')[1] || 'signed_out'
      endSession(reason === 'signed_out' ? 'signed_out_elsewhere' : reason, { broadcast: false })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const staySignedIn = async () => {
    markActive(true)
    setWarnLeft(null)
    renewIfNeeded()
  }

  const signOutNow = () => {
    setWarnLeft(null)
    endSession('signed_out')   // also revokes the refresh token server-side
  }

  if (warnLeft == null) return null

  const mm = Math.floor(warnLeft / 60)
  const ss = String(warnLeft % 60).padStart(2, '0')

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-on-dark-inv/45 backdrop-blur-[2px] animate-fade-in" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-desc"
        className="relative w-full max-w-sm rounded-modal glass-overlay shadow-overlay p-6 animate-slide-up"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-card bg-status-warn-bg flex items-center justify-center shrink-0">
            <Clock size={18} className="text-status-warn-fg" />
          </div>
          <div>
            <h2 id="idle-title" className="text-base font-semibold text-text-primary">Are you still there?</h2>
            <p className="text-xs text-text-muted">Inactive for {idleLabel(IDLE_MINUTES - 1)}</p>
          </div>
        </div>
        <p id="idle-desc" className="text-sm text-text-secondary leading-relaxed">
          For your security you'll be signed out in{' '}
          <span className="font-semibold text-text-primary tabular-nums" aria-live="polite">{mm}:{ss}</span>.
          Unsaved changes may be lost.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" size="md" icon={LogOut} onClick={signOutNow}>Sign out</Button>
          <Button variant="primary" size="md" onClick={staySignedIn} autoFocus>Stay signed in</Button>
        </div>
      </div>
    </div>
  )
}

export default SessionManager