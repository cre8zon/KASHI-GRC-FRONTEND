import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, createElement } from 'react'
import { notificationsApi } from '../api/notifications.api'
import { QUERY_KEYS } from '../config/constants'
import { useOpenInTab } from './useOpenInTab'
import toast from 'react-hot-toast'
import { NotificationToast } from '../components/ui/NotificationToast'

export const useNotifications = (params) => useQuery({
  queryKey: [...QUERY_KEYS.NOTIFICATIONS, params],
  queryFn:  () => notificationsApi.list(params),
  refetchInterval: 30 * 1000,
})

export const useMarkRead = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS }),
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// SOUND
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A short two-note chime, synthesised rather than loaded.
 *
 * No audio file: an asset would be one more thing to ship, cache-bust and get
 * the volume wrong on, for a sound that is two sine waves. Web Audio is in
 * every browser this app supports.
 *
 * ── THE AUTOPLAY RULE ─────────────────────────────────────────────────────
 * A browser refuses to start audio until the user has interacted with the
 * page, and an AudioContext created before that starts 'suspended'. So the
 * context is created LAZILY, on the first sound we actually try to play —
 * by which time the person has signed in and clicked something, and it starts
 * 'running'. Creating it at module load would leave it suspended forever on a
 * tab the user has not touched yet.
 *
 * Every call is wrapped: a browser that blocks audio must not take the toast
 * down with it.
 */
let _audioCtx = null

function chime() {
  try {
    if (typeof window === 'undefined') return
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return

    if (!_audioCtx) _audioCtx = new Ctx()
    // Suspended happens when the tab has had no interaction yet. resume()
    // returns a promise that rejects in exactly that case — ignore it, the
    // next notification will land after the person has clicked something.
    if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {})

    const now = _audioCtx.currentTime
    // Two notes, a fifth apart, 90ms each. Short and soft on purpose: this
    // fires while somebody is working, and a long or bright sound in an
    // enterprise tool gets the whole feature muted within a day.
    ;[[880, 0], [1318.5, 0.09]].forEach(([freq, offset]) => {
      const osc  = _audioCtx.createOscillator()
      const gain = _audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      // Ramp rather than a hard start/stop — a square-edged gain change is
      // audible as a click.
      gain.gain.setValueAtTime(0.0001, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.09, now + offset + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.12)
      osc.connect(gain).connect(_audioCtx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.14)
    })
  } catch {
    // Audio is a nicety. Never let it break the notification.
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PER-DEVICE PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════
//
// localStorage, not the account's notification preferences.
//
// Whether THIS laptop makes a noise is a property of the laptop, not of the
// person: the same user on a shared machine, in a meeting room, or on a second
// screen wants different answers, and a server-side setting would follow them
// everywhere. useNotificationPreferences stays the right home for "do I get
// emailed about remediations" — that IS an account fact.

const SOUND_KEY   = 'kashi.notifications.sound'
const DESKTOP_KEY = 'kashi.notifications.desktop'

const readFlag = (key, dflt) => {
  try {
    const v = localStorage.getItem(key)
    return v === null ? dflt : v === '1'
  } catch { return dflt }   // private mode, blocked storage
}
const writeFlag = (key, on) => {
  try { localStorage.setItem(key, on ? '1' : '0') } catch { /* ignore */ }
}

export const isNotificationSoundOn = () => readFlag(SOUND_KEY, true)
export const setNotificationSound  = (on) => writeFlag(SOUND_KEY, on)

export const isDesktopNotificationOn = () => readFlag(DESKTOP_KEY, false)

/**
 * Turn desktop notifications on for this browser.
 *
 * MUST be called from a real click. Chrome ignores — and Firefox rejects —
 * Notification.requestPermission() that is not user-initiated, and a prompt
 * fired on page load is the fastest way to get permanently denied. So this is
 * exported for a settings toggle to call, and nothing asks on its own.
 *
 * Returns the resulting permission string so the caller can show the right
 * state, including 'denied', which only the browser's own site settings can
 * undo — the app cannot ask again.
 */
export async function enableDesktopNotifications() {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
    let perm = Notification.permission
    if (perm === 'default') perm = await Notification.requestPermission()
    writeFlag(DESKTOP_KEY, perm === 'granted')
    return perm
  } catch { return 'unsupported' }
}

export function disableDesktopNotifications() { writeFlag(DESKTOP_KEY, false) }

/**
 * The OS-level notification.
 *
 * Only when the tab is NOT the one being looked at. If the person is already
 * on the page, the in-app toast has told them — a desktop banner on top of it
 * is the same news twice, and that is what makes people switch notifications
 * off.
 *
 * tag = the notification id, so a re-render or a double poll replaces the
 * banner rather than stacking a second copy of it.
 */
function desktopNotify(n, navigateTo) {
  try {
    if (!isDesktopNotificationOn()) return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return

    const notif = new Notification('KashiGRC', {
      body: n.message || 'New notification',
      tag:  `kashi-notif-${n.notificationId}`,
      icon: '/favicon.ico',
    })
    notif.onclick = () => {
      try {
        window.focus()
        if (navigateTo) window.location.assign(navigateTo)
        notif.close()
      } catch { /* ignore */ }
    }
  } catch {
    // Same contract as the chime: never break the notification over its garnish.
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// THE WATCHER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Watches for new unread notifications and shows a branded toast, a sound and
 * — when the tab is in the background — a desktop notification.
 *
 * ── WHY IT NEVER FIRED ────────────────────────────────────────────────────
 *
 * It tracked seen rows by `n.id`. NotificationResponse has no `id` field; the
 * builder is `.notificationId(n.getId())`, which is what NotificationsPage
 * reads everywhere (`n.notificationId` for the key, the mark-read call and the
 * click). So every row's `n.id` was undefined:
 *
 *     _seenIds = new Set(rows.map(n => n.id))      →  Set { undefined }
 *     newOnes  = rows.filter(n => !_seenIds.has(n.id))
 *                → _seenIds.has(undefined) is true for EVERY row
 *                → newOnes is always empty
 *
 * One Set entry, shared by every notification that would ever arrive. After
 * the first poll nothing could ever be new again, which is exactly the
 * reported symptom: the page lists them, nothing ever pops.
 *
 * ── AND A SECOND, QUIETER ONE ─────────────────────────────────────────────
 *
 * The old code returned early when the list came back EMPTY, before the
 * `_seenIds === null` initialisation. Sign in with nothing unread — the normal
 * case — and _seenIds stayed null. The first notification to arrive then hit
 * the initialisation branch, was recorded silently and never toasted. So even
 * with the id fixed, the FIRST notification of a session would still be
 * swallowed. Initialisation now happens on the first successful response,
 * empty or not.
 */

// Module-level Set — survives re-renders, resets only on hard page load.
let _seenIds = null  // null = not initialised yet this session

export const useNotificationToast = () => {
  const { data, isSuccess } = useNotifications({ read: false, take: 20 })
  const initialized = useRef(false)
  // AppShell is inside BrowserRouter, so this is safe here — and it keeps the
  // toast a plain presentational component with no router dependency of its own.
  //
  // useOpenInTab, not useNavigate: a notification is a link to ELSEWHERE. If
  // the thing it points at is already open in another tab, that tab is where
  // the person should land — not a second copy of it in whatever tab they
  // happened to be sitting in.
  const openInTab = useOpenInTab()

  // Held in a ref so it stays OUT of the effect's dependencies. openInTab is
  // rebuilt whenever the tab list changes — which is on every navigation, since
  // RouteSync stamps the URL onto the active tab — and a dependency on it would
  // re-run this effect on every page change in the app. Harmless (the seen-set
  // makes the body a no-op) but pointless work on a hot path. The toast's click
  // handler reads the ref, so it always calls the current one.
  const openInTabRef = useRef(openInTab)
  openInTabRef.current = openInTab

  useEffect(() => {
    if (!isSuccess) return

    const notifications = data?.data?.items || data?.items || data?.data || []
    if (!Array.isArray(notifications)) return

    // Initialise on the FIRST SUCCESSFUL RESPONSE, including an empty one —
    // see the second bug in the block above. An empty inbox is the normal way
    // to start a session and must not leave the watcher uninitialised.
    if (_seenIds === null) {
      _seenIds = new Set(notifications.map(n => n.notificationId))
      initialized.current = true
      return
    }

    if (notifications.length === 0) return

    // notificationId, not id. The whole bug.
    const newOnes = notifications.filter(n => !_seenIds.has(n.notificationId))
    if (newOnes.length === 0) return

    // Mark everything seen BEFORE doing anything that can throw, so a failure
    // in the toast or the chime cannot replay the same notification on the
    // next poll, every 30 seconds, forever.
    newOnes.forEach(n => _seenIds.add(n.notificationId))

    // One sound for the batch, not one per notification. A poll that returns
    // five at once should chime once — five overlapping chimes is an alarm.
    if (isNotificationSoundOn()) chime()

    newOnes.forEach(n => {
      // toast.custom, not toast(): the default renderer wraps its child in its
      // own white pill, so a themed component inside it sits on an unthemed
      // slab. custom() hands the whole surface over, which is what lets the
      // toast be glass like every other floating surface in the app.
      // createElement, not JSX: this file is .js, and the project does not
      // transform JSX outside .jsx — useActionItems.js imports createElement
      // for exactly this reason. Renaming the file would churn three import
      // sites for no gain.
      toast.custom(
        (t) => createElement(NotificationToast, {
          t,
          message: n.message || 'New notification',
          onOpen: n.actionUrl ? () => openInTabRef.current(n.actionUrl) : undefined,
        }),
        { duration: 5000 },
      )

      // actionUrl is already resolved server-side by the route contributors,
      // so the desktop banner lands on the same screen the in-app click does.
      desktopNotify(n, n.actionUrl)
    })
  }, [data, isSuccess])
}