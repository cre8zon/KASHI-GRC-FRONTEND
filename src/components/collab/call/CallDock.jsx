import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minimize2, Maximize2, PhoneOff, Loader2, FileText, MonitorUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCall, endCall, setMinimized } from './callStore'
import { cn } from '../../../lib/cn'

// The LiveKit packages load only when a call starts.
const CallRoom = lazy(() => import('./CallRoom'))

/**
 * The in-app call window. Mounted once in the app shell, so a call keeps
 * running while you move around the app: full size, or minimised to a small
 * window in the corner. Leave ends it.
 *
 * Presenting your screen: the window steps aside at once — it shrinks to a
 * slim bar (Stop presenting / Bigger / Leave) with no video, so it neither
 * covers what you are showing nor shows up inside your own share.
 *
 * Minimised, the window can be dragged anywhere by its title bar; the spot is
 * remembered for next time (this browser only).
 */
const POS_KEY = 'kashi-call-pos'
const readPos = () => { try { return JSON.parse(localStorage.getItem(POS_KEY)) || null } catch { return null } }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export function CallDock() {
  const call = useCall()
  const navigate = useNavigate()
  const [share, setShare] = useState({ on: false, stop: null, track: null })
  const sharing = useRef(false)
  const box = useRef(null)
  const drag = useRef(null)
  const [pos, setPos] = useState(readPos)             // { left, top } of the minimised window
  const onShareState = useCallback((on, stop, track) => {
    if (on && !sharing.current) setMinimized(true)     // just started presenting
    sharing.current = on
    setShare({ on, stop, track: on ? track : null })
  }, [])
  if (!call.active) return null
  const mini = call.minimized
  const presenting = mini && share.on

  // Drag the minimised window by its title bar (buttons still click as usual).
  const onPointerDown = (e) => {
    if (!mini || e.button !== 0 || e.target.closest('button')) return
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
  // Keep a remembered spot on screen if the window got smaller since.
  const placed = mini && pos ? {
    left: clamp(pos.left, 8, Math.max(8, window.innerWidth - 200)),
    top: clamp(pos.top, 8, Math.max(8, window.innerHeight - (presenting ? (share.track ? 320 : 90) : 268))),
    right: 'auto', bottom: 'auto',
  } : undefined

  return createPortal(
    <div ref={box} style={placed}
      className={cn('fixed z-[70] flex flex-col overflow-hidden rounded-card border border-border shadow-overlay bg-on-dark-inv',
        presenting ? 'bottom-4 right-4 w-[360px]' : mini ? 'bottom-4 right-4 w-[380px] h-[260px]' : 'inset-3 md:inset-6')}>
      <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        title={mini ? 'Drag to move' : undefined}
        className={cn('relative z-10 flex items-center gap-2 px-3 h-9 shrink-0 bg-on-dark-inv text-on-dark',
          mini && 'cursor-move select-none touch-none')}>
        <span className="w-2 h-2 rounded-full bg-status-fail-fg animate-pulse shrink-0" />
        <p className="text-xs font-medium truncate flex-1">{call.title || 'Call'}</p>
        {call.meetingId && (
          <button type="button" title="Open this call's record — agenda, minutes, decisions, follow-ups"
            onClick={() => { setMinimized(true); navigate(`/collaboration/meetings/${call.meetingId}`) }}
            className="flex items-center gap-1 px-2 h-6 rounded hover:bg-on-dark/10 text-[11px]">
            <FileText size={12} /> Notes
          </button>
        )}
        <button type="button" onClick={() => setMinimized(!mini)} title={mini ? 'Bigger' : 'Minimise — keep the call while you work'}
          className="p-1 rounded hover:bg-on-dark/10">{mini ? <Maximize2 size={13} /> : <Minimize2 size={13} />}</button>
        <button type="button" onClick={endCall} title="Leave the call"
          className="flex items-center gap-1 px-2 h-6 rounded bg-status-fail-fg hover:opacity-90 text-[11px] font-medium">
          <PhoneOff size={12} /> Leave
        </button>
      </div>
      {presenting && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-on-dark/10 text-on-dark">
          <MonitorUp size={14} className="shrink-0 text-status-pass-fg" />
          <p className="text-[11px] flex-1">You are presenting your screen</p>
          <button type="button" onClick={() => share.stop?.()}
            className="px-2 h-6 rounded bg-on-dark/15 hover:bg-on-dark/25 text-[11px] font-medium">Stop presenting</button>
        </div>
      )}
      {presenting && share.track && <SharePreview track={share.track} />}
      {/* transform makes this box the containing block for LiveKit's fixed-position
          toasts ("Reconnecting…"), so they stay inside the video area and never
          cover Leave / Minimise. While presenting the call stays connected
          (sound keeps playing) but takes no room on screen. */}
      <div className={cn('relative [transform:translateZ(0)]', presenting ? 'h-0 overflow-hidden' : 'flex-1 min-h-0')}>
        <Suspense fallback={<div className="h-full flex items-center justify-center text-on-dark/70 text-xs gap-2"><Loader2 size={14} className="animate-spin" /> Connecting…</div>}>
          <CallRoom key={call.key} url={call.url} token={call.token} compact={mini} onLeave={endCall} onShareState={onShareState} />
        </Suspense>
      </div>
    </div>,
    document.body,
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