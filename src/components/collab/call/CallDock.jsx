import { lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { Minimize2, Maximize2, PhoneOff, Loader2, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCall, endCall, setMinimized } from './callStore'
import { cn } from '../../../lib/cn'

// The LiveKit packages load only when a call starts.
const CallRoom = lazy(() => import('./CallRoom'))

/**
 * The in-app call window. Mounted once in the app shell, so a call keeps
 * running while you move around the app: full size, or minimised to a small
 * window in the corner. Leave ends it.
 */
export function CallDock() {
  const call = useCall()
  const navigate = useNavigate()
  if (!call.active) return null
  const mini = call.minimized
  return createPortal(
    <div className={cn('fixed z-[70] flex flex-col overflow-hidden rounded-card border border-border shadow-overlay bg-[#111]',
      mini ? 'bottom-4 right-4 w-[380px] h-[260px]' : 'inset-3 md:inset-6')}>
      <div className="relative z-10 flex items-center gap-2 px-3 h-9 shrink-0 bg-[#1b1b1b] text-white">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
        <p className="text-xs font-medium truncate flex-1">{call.title || 'Call'}</p>
        {call.meetingId && (
          <button type="button" title="Open this call's record — agenda, minutes, decisions, follow-ups"
            onClick={() => { setMinimized(true); navigate(`/collaboration/meetings/${call.meetingId}`) }}
            className="flex items-center gap-1 px-2 h-6 rounded hover:bg-white/10 text-[11px]">
            <FileText size={12} /> Notes
          </button>
        )}
        <button type="button" onClick={() => setMinimized(!mini)} title={mini ? 'Bigger' : 'Minimise — keep the call while you work'}
          className="p-1 rounded hover:bg-white/10">{mini ? <Maximize2 size={13} /> : <Minimize2 size={13} />}</button>
        <button type="button" onClick={endCall} title="Leave the call"
          className="flex items-center gap-1 px-2 h-6 rounded bg-red-600 hover:bg-red-700 text-[11px] font-medium">
          <PhoneOff size={12} /> Leave
        </button>
      </div>
      {/* transform makes this box the containing block for LiveKit's fixed-position
          toasts ("Reconnecting…"), so they stay inside the video area and never
          cover Leave / Minimise. */}
      <div className="relative flex-1 min-h-0 [transform:translateZ(0)]">
        <Suspense fallback={<div className="h-full flex items-center justify-center text-white/70 text-xs gap-2"><Loader2 size={14} className="animate-spin" /> Connecting…</div>}>
          <CallRoom key={call.key} url={call.url} token={call.token} compact={mini} onLeave={endCall} />
        </Suspense>
      </div>
    </div>,
    document.body,
  )
}
