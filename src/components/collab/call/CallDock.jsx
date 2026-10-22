import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PhoneOff, Loader2, MonitorUp, Maximize2, EyeOff, Mic, MicOff } from 'lucide-react'
import { useSelector } from 'react-redux'
import { useCall, endCall, setMiniHidden, showCallTab, rejoinAfterReload, setParkHandler, noteMic } from './callStore'
import { LobbyWatcher, LobbyBadge } from './CallControls'
import { cn } from '../../../lib/cn'

// The LiveKit packages load only when a call starts.
const CallRoom = lazy(() => import('./CallRoom'))

/**
 * Owns the one LiveKit connection, mounted once in the app shell.
 *
 * The call's DOM lives in a single host element that is MOVED — never
 * re-rendered — between three places:
 *   1. the call tab's page (CallPage registers a slot)  → full size, in-tab;
 *   2. a small card in the corner, while you work in another tab;
 *   3. an off-screen holder, once you hide that card.
 * Moving an element keeps its React tree and its media alive, so none of
 * this reconnects: hide the card while presenting and the call carries on,
 * with a live dot on the call tab to bring it back.
 *
 * While you present from another tab, the card shows a slim "You are
 * presenting" bar and a small preview of what the others see, instead of the
 * call video (which would otherwise appear inside your own share).
 */
const POS_KEY = 'kashi-call-pos'
const readPos = () => { try { return JSON.parse(localStorage.getItem(POS_KEY)) || null } catch { return null } }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export function CallDock() {
  const call = useCall()
  const tabOpen = useSelector(s => s.tabs.tabs.some(t => (t.route || '').split('?')[0] === '/call'))
  const [share, setShare] = useState({ on: false, stop: null, track: null })
  const [park, setPark] = useState(null)
  const [miniBody, setMiniBody] = useState(null)
  const box = useRef(null)
  const drag = useRef(null)
  const [pos, setPos] = useState(readPos)

  // One host element for the whole life of the shell.
  const host = useMemo(() => {
    const d = document.createElement('div')
    d.className = 'kashi-call-host'
    d.style.cssText = 'width:100%;height:100%;position:relative'
    return d
  }, [])

  // After a reload, get back into the call this browser tab was in.
  useEffect(() => { rejoinAfterReload() }, [])

  // Being in a call is activity: an hour-long meeting where nobody touches
  // the mouse must not hit the idle sign-out (SessionManager reads this key),
  // which would end the call with the session.
  useEffect(() => {
    if (!call.active) return undefined
    const touch = () => { try { localStorage.setItem('kashi_last_activity', String(Date.now())) } catch { /* */ } }
    touch()
    const id = setInterval(touch, 30_000)
    return () => clearInterval(id)
  }, [call.active])

  const onShareState = useCallback((on, stop, track) => {
    setShare({ on, stop, track: on ? track : null })
  }, [])
  // The microphone, for the small window's mute button.
  const [mic, setMic] = useState({ on: false, toggle: null })
  const onMicState = useCallback((on, toggle) => {
    setMic({ on, toggle })
    noteMic(on)
  }, [])

  const inTab = !!call.slot
  // The card can only be hidden while the call tab exists to bring it back.
  const showMini = call.active && !inTab && (!call.miniHidden || !tabOpen)
  const presentingMini = showMini && share.on
  const target = !call.active ? null
    : inTab ? call.slot
    : showMini && !presentingMini ? miniBody
    : park

  // Move the host to wherever the call should show. appendChild moves the
  // node in one step, so playing media is never interrupted.
  useLayoutEffect(() => {
    if (target && host.parentNode !== target) target.appendChild(host)
  }, [target, host])
  useEffect(() => () => host.remove(), [host])
  // Lets CallPage hand the call back before its slot leaves the page.
  useLayoutEffect(() => {
    setParkHandler(() => { if (park && host.parentNode !== park) park.appendChild(host) })
    return () => setParkHandler(null)
  }, [park, host])

  if (!call.active) return null

  // Drag the card by its title bar (buttons still click as usual).
  const onPointerDown = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return
    const r = box.current.getBoundingClientRect()
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    setPos({
      left: clamp(e.clientX - d.dx, 8, window.innerWidth - d.w - 8),
      top: clamp(e.clientY - d.dy, 8, window.innerHeight - d.h - 8),
    })
  }
  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)) } catch { /* not remembered — fine */ }
  }
  const placed = pos ? {
    left: clamp(pos.left, 8, Math.max(8, window.innerWidth - 200)),
    top: clamp(pos.top, 8, Math.max(8, window.innerHeight - (presentingMini ? (share.track ? 320 : 90) : 268))),
    right: 'auto', bottom: 'auto',
  } : undefined

  return (
    <>
      {/* The call itself, rendered into the host element wherever it is. */}
      {createPortal(
        <div className={cn('h-full w-full', !inTab && 'kashi-call-compact-wrap')}>
          <Suspense fallback={<div className="h-full flex items-center justify-center text-on-dark/70 text-xs gap-2 bg-on-dark-inv"><Loader2 size={14} className="animate-spin" /> Connecting…</div>}>
            <CallRoom key={call.key} url={call.url} token={call.token} compact={!inTab} micOn={call.micOn}
              onLeave={endCall} onShareState={onShareState} onMicState={onMicState} />
          </Suspense>
        </div>,
        host,
      )}

      {/* Off-screen holder: keeps the call (and its sound) running unseen. */}
      {createPortal(
        <div ref={setPark} aria-hidden="true"
          style={{ position: 'fixed', left: -10000, top: 0, width: 640, height: 360, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }} />,
        document.body,
      )}

      {/* Waiting guests → a toast with Admit / Deny, wherever you are in the app. */}
      {call.meetingId && <LobbyWatcher meetingId={call.meetingId} />}

      {showMini && createPortal(
        <div ref={box} style={placed}
          className={cn('fixed z-[70] flex flex-col overflow-hidden rounded-card border border-border shadow-overlay bg-on-dark-inv',
            !placed && 'bottom-4 right-4',
            presentingMini ? 'w-[360px]' : 'w-[380px] h-[260px]')}>
          <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            title="Drag to move"
            className="relative z-10 flex items-center gap-1.5 px-3 h-9 shrink-0 bg-on-dark-inv text-on-dark cursor-move select-none touch-none">
            <span className="w-2 h-2 rounded-full bg-status-fail-fg animate-pulse shrink-0" />
            <p className="text-xs font-medium truncate flex-1">{call.title || 'Call'}</p>
            {call.meetingId && <LobbyBadge meetingId={call.meetingId} onClick={showCallTab} />}
            <button type="button" onClick={() => mic.toggle?.()} disabled={!mic.toggle}
              aria-pressed={mic.on} title={mic.on ? 'Mute your microphone' : 'Unmute your microphone'}
              className={cn('p-1 rounded disabled:opacity-40',
                mic.on ? 'hover:bg-on-dark/10' : 'bg-status-fail-fg text-text-inverse hover:opacity-90')}>
              {mic.on ? <Mic size={13} /> : <MicOff size={13} />}
            </button>
            <button type="button" onClick={showCallTab} title="Back to the call tab"
              className="p-1 rounded hover:bg-on-dark/10"><Maximize2 size={13} /></button>
            {tabOpen && (
              <button type="button" onClick={() => setMiniHidden(true)}
                title="Hide this window — the call keeps running. Open it again from the Call tab."
                className="p-1 rounded hover:bg-on-dark/10"><EyeOff size={13} /></button>
            )}
            <button type="button" onClick={endCall} title="Leave the call"
              className="flex items-center gap-1 px-2 h-6 rounded bg-status-fail-fg text-text-inverse hover:opacity-90 text-[11px] font-medium">
              <PhoneOff size={12} /> Leave
            </button>
          </div>
          {presentingMini ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border-t border-on-dark/10 text-on-dark">
                <MonitorUp size={14} className="shrink-0 text-status-pass-fg" />
                <p className="text-[11px] flex-1">You are presenting your screen</p>
                <button type="button" onClick={() => share.stop?.()}
                  className="px-2 h-6 rounded bg-on-dark/15 hover:bg-on-dark/25 text-[11px] font-medium">Stop presenting</button>
              </div>
              {share.track && <SharePreview track={share.track} />}
            </>
          ) : (
            // transform makes this box the containing block for LiveKit's
            // fixed-position toasts, so they stay inside the card.
            <div ref={setMiniBody} className="relative flex-1 min-h-0 [transform:translateZ(0)]" />
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

/** What the others see — your shared screen, small, for the presenter. */
function SharePreview({ track }) {
  const video = useRef(null)
  useEffect(() => {
    const el = video.current
    if (!el || !track) return undefined
    el.srcObject = new MediaStream([track])
    el.play?.().catch(() => {})
    return () => { el.srcObject = null }
  }, [track])
  return (
    <div className="px-3 pb-3">
      <p className="text-[10px] text-on-dark/70 mb-1">What everyone sees</p>
      <video ref={video} autoPlay muted playsInline
        className="w-full aspect-video rounded-ctl bg-on-dark-inv border border-on-dark/10 object-contain" />
    </div>
  )
}