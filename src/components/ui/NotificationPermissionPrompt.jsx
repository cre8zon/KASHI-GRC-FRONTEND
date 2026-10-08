import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from './Button'
import {
  enableDesktopNotifications,
  isDesktopNotificationOn,
} from '../../hooks/useNotifications'

/**
 * The soft ask for desktop notifications.
 *
 * ── WHY A BANNER AND NOT THE BROWSER PROMPT ───────────────────────────────
 *
 * Calling Notification.requestPermission() on page load is the fastest way to
 * get permanently denied: the person has no idea what the site is yet, clicks
 * Block, and the browser records that for the origin. Nothing in the app can
 * ask again — only the browser's own site settings can undo it.
 *
 * So this is the two-stage pattern every site that cares uses: an in-app ask
 * the person can decline harmlessly, and the real browser prompt only after
 * they say yes. Declining here costs nothing and can be re-offered; declining
 * the browser is permanent.
 *
 * ── WHEN IT APPEARS ───────────────────────────────────────────────────────
 *
 *   • only when permission is still 'default' — never after granted or denied
 *   • only once the person has been in the app for a moment, not on arrival
 *   • never again once dismissed, on this browser
 *
 * ── WHY localStorage AND NOT THE ACCOUNT ──────────────────────────────────
 *
 * Permission is per-browser, so the dismissal must be too. The same person on
 * a second laptop has not been asked there and should be.
 */

const DISMISS_KEY = 'kashi.notifications.promptDismissed'

const wasDismissed = () => {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}
const dismissForever = () => {
  try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
}

export function NotificationPermissionPrompt() {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy]       = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    // 'granted' and 'denied' are both final as far as this banner is
    // concerned: one needs no asking, the other cannot be asked again.
    if (Notification.permission !== 'default') return
    if (isDesktopNotificationOn()) return
    if (wasDismissed()) return

    // Eight seconds. Long enough that the person has landed, looked at their
    // tasks and understands what the app is; short enough that it is still
    // part of arriving rather than an interruption later.
    const t = setTimeout(() => setVisible(true), 8000)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  const onEnable = async () => {
    setBusy(true)
    // This runs inside a real click, which is the requirement — Chrome ignores
    // and Firefox rejects a permission request that is not user-initiated.
    const result = await enableDesktopNotifications()
    setBusy(false)
    // Hide either way. Granted needs no banner; denied cannot be re-asked, and
    // leaving it up would offer something that can no longer happen.
    dismissForever()
    setVisible(false)
  }

  const onDismiss = () => {
    dismissForever()
    setVisible(false)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-brand-500/5">
      <Bell size={15} className="text-brand-ink shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-text-primary font-medium">
          Get notified when something needs you
        </p>
        <p className="text-[11px] text-text-muted">
          Desktop alerts for assignments, revisions and findings — only when
          this tab is in the background. You can turn them off any time in
          Settings → Notifications.
        </p>
      </div>
      <Button size="sm" onClick={onEnable} loading={busy} disabled={busy}>
        Enable
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        title="Not now"
        aria-label="Dismiss"
        className="p-1 rounded-ctl text-text-muted hover:bg-surface-overlay transition-colors shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
}