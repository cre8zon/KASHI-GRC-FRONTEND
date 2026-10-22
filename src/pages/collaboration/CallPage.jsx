import { useLayoutEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { PhoneOff, FileText, UserPlus, Loader2, PhoneCall, X } from 'lucide-react'
import { useCall, endCall, setCallSlot } from '../../components/collab/call/callStore'
import { CallSharePanel, useCallLobby } from '../../components/collab/call/CallControls'
import { openTab, closeTab, selectActiveTabId } from '../../store/slices/tabsSlice'
import { store } from '../../store'
import { Button } from '../../components/ui/Button'
import { cn } from '../../lib/cn'

/**
 * The call tab (/call). The call fills this tab's page area — nothing floats
 * over the rest of the app. Switch to another tab and the call carries on in
 * a small card you can hide; come back here for the full view.
 *
 * The page only provides the space: CallDock (app shell) owns the connection
 * and moves the call's element into the slot below while this page is shown.
 */
export default function CallPage() {
  const call = useCall()
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const slot = useRef(null)
  const [sharing, setSharing] = useState(false)
  const { canAdmit, waiting } = useCallLobby(call.active ? call.meetingId : null)

  useLayoutEffect(() => {
    if (!call.active) return undefined
    setCallSlot(slot.current)
    return () => setCallSlot(null)
  }, [call.active])

  const openNotes = () => dispatch(openTab({
    route: `/collaboration/meetings/${call.meetingId}`, title: call.title || 'Meeting', icon: 'FileText',
  }))
  const closeThisTab = () => {
    const id = selectActiveTabId(store.getState())
    if (id) dispatch(closeTab(id))
    else navigate('/collaboration/meetings')
  }

  if (!call.active) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="glass-card rounded-card px-8 py-10 text-center max-w-sm">
          {call.rejoining ? (
            <>
              <Loader2 size={22} className="mx-auto text-brand-ink animate-spin" />
              <p className="mt-3 text-sm font-medium text-text-primary">Getting you back into the call…</p>
              {call.title && <p className="text-xs text-text-muted mt-1">{call.title}</p>}
            </>
          ) : (
            <>
              <PhoneCall size={22} className="mx-auto text-text-muted" />
              <p className="mt-3 text-sm font-medium text-text-primary">No call in progress</p>
              <p className="text-xs text-text-muted mt-1">Start or join one from Meetings, a room, or a chat.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => navigate('/collaboration/meetings')}>Go to Meetings</Button>
                <Button size="sm" variant="ghost" icon={X} onClick={closeThisTab}>Close tab</Button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-2 px-4 pb-4 pt-2 min-h-0">
      <div className="flex items-center gap-2 shrink-0">
        <span className="w-2 h-2 rounded-full bg-status-fail-fg animate-pulse shrink-0" aria-hidden />
        <h1 className="text-sm font-semibold text-text-primary truncate flex-1">{call.title || 'Call'}</h1>
        <div className="relative">
          <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setSharing(s => !s)} aria-expanded={sharing}>
            Invite
            {canAdmit && waiting.length > 0 && <span className="count-badge-alert ml-1.5">{waiting.length}</span>}
          </Button>
          {sharing && (
            <div className="absolute right-0 top-full mt-2 z-50">
              <CallSharePanel meetingId={call.meetingId} title={call.title} onClose={() => setSharing(false)} />
            </div>
          )}
        </div>
        {call.meetingId && (
          <Button size="sm" variant="ghost" icon={FileText} onClick={openNotes}
            title="Agenda, minutes, decisions and follow-ups — opens in a new tab">Notes</Button>
        )}
        <button type="button" onClick={endCall}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-ctl bg-status-fail-fg text-text-inverse text-xs font-semibold hover:opacity-90">
          <PhoneOff size={13} /> Leave
        </button>
      </div>
      {/* CallDock moves the live call in here. transform makes this the
          containing block for LiveKit's fixed-position toasts. */}
      <div ref={slot} className={cn('flex-1 min-h-0 rounded-card overflow-hidden border border-border bg-on-dark-inv',
        '[transform:translateZ(0)]')} />
    </div>
  )
}
