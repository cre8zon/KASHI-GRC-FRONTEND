import { useEffect, useRef } from 'react'
import { LiveKitRoom, VideoConference, useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { MediaDeviceFailure, RoomEvent, Track } from 'livekit-client'
import '@livekit/components-styles'
import toast from 'react-hot-toast'

/**
 * The call itself — LiveKit's ready-made conference: participant grid,
 * speaker view, screen sharing, camera / microphone choice, in-call chat.
 * You join with the microphone on and the camera off; both are in the
 * control bar. Leaving (or losing the connection for good) ends the call.
 *
 * If the browser cannot use the microphone or camera (permission blocked, no
 * device, or another app holding it) we say which and what to do — LiveKit
 * would otherwise just leave the button off with no explanation.
 */
const DEVICE_HELP = {
  [MediaDeviceFailure.PermissionDenied]: (what) =>
    `The browser is blocking your ${what}. Click the icon at the left of the address bar, allow ${what === 'camera' ? 'Camera' : 'Microphone'}, then try again.`,
  [MediaDeviceFailure.NotFound]: (what) => `No ${what} found. Plug one in or check Windows Settings → Privacy → ${what === 'camera' ? 'Camera' : 'Microphone'}.`,
  [MediaDeviceFailure.DeviceInUse]: (what) => `Your ${what} is being used by another app or tab (Teams, Zoom, another call). Close it and try again.`,
}
/**
 * Screen sharing: the browser's picker opens on "Entire screen", and this
 * KashiGRC tab is left out of the choices — sharing the tab you are calling
 * from only shows the call itself (a mirror). You can switch what you share
 * mid-call from the browser's bar.
 *
 * The presenter gets the shared picture back (onShareState's third argument,
 * a MediaStreamTrack) for a small "what they see" preview. And if sharing
 * stops without you asking — the browser or Windows ended it, or the call
 * reconnected — you are told why instead of it silently disappearing.
 */
function ShareSetup({ onShareState }) {
  const room = useRoomContext()
  const { isScreenShareEnabled, localParticipant } = useLocalParticipant()
  const asked = useRef(false)          // we (Stop presenting / the control bar) turned it off
  const ended = useRef(false)          // the browser ended the capture itself
  const reconnecting = useRef(false)
  const was = useRef(false)

  useEffect(() => {
    const lp = room?.localParticipant
    if (!lp || lp.__kashiShare) return
    const original = lp.setScreenShareEnabled.bind(lp)
    lp.setScreenShareEnabled = (enabled, options, publishOptions) => {
      if (!enabled) asked.current = true
      return original(enabled, !enabled ? options : {
        video: { displaySurface: 'monitor' },
        ...(options || {}),
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      }, publishOptions)
    }
    lp.__kashiShare = true
  }, [room])

  useEffect(() => {
    if (!room) return undefined
    const on = () => { reconnecting.current = true }
    const off = () => { setTimeout(() => { reconnecting.current = false }, 3000) }
    room.on(RoomEvent.Reconnecting, on).on(RoomEvent.Reconnected, off)
    return () => { room.off(RoomEvent.Reconnecting, on); room.off(RoomEvent.Reconnected, off) }
  }, [room])

  useEffect(() => {
    const track = isScreenShareEnabled
      ? localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track?.mediaStreamTrack || null
      : null
    if (isScreenShareEnabled) {
      asked.current = false
      ended.current = false
    } else if (was.current && !asked.current) {
      toast(ended.current
        ? 'Screen sharing was stopped by the browser — "Stop sharing" was clicked, the shared window was closed, or the screen locked. Click Share screen to start again.'
        : reconnecting.current
          ? 'Screen sharing stopped while the call reconnected. Click Share screen to start again.'
          : 'Screen sharing stopped. Click Share screen to start again.',
      { id: 'call-share-stopped', duration: 10000, icon: '🖥️' })
    }
    was.current = isScreenShareEnabled
    const onEnded = () => { ended.current = true }
    track?.addEventListener('ended', onEnded)
    onShareState?.(isScreenShareEnabled, () => localParticipant.setScreenShareEnabled(false).catch(() => {}), track)
    return () => track?.removeEventListener('ended', onEnded)
  }, [isScreenShareEnabled, localParticipant, onShareState])
  return null
}

export default function CallRoom({ url, token, compact, onLeave, onShareState }) {
  return (
    <LiveKitRoom serverUrl={url} token={token} connect audio video={false}
      data-lk-theme="default" style={{ height: '100%' }}
      className={compact ? 'kashi-call-compact' : undefined}
      onDisconnected={onLeave}
      onMediaDeviceFailure={(failure, kind) => {
        const what = kind === 'videoinput' ? 'camera' : kind === 'audioinput' ? 'microphone' : 'camera or microphone'
        const help = DEVICE_HELP[failure]
        toast.error(help ? help(what) : `Could not start your ${what}.`, { id: `call-device-${what}`, duration: 10000 })
      }}
      onError={(e) => {
        const msg = e?.message || ''
        // The browser could not reach the call server at all — say where it looked, and close the window.
        if (/signal connection|failed to fetch|websocket/i.test(msg)) {
          toast.error(`Can't reach the call server at ${url}. Check that the LiveKit server is running and that livekit.url in the backend points to it.`,
            { id: 'call-unreachable', duration: 10000 })
          onLeave()
          return
        }
        toast.error(`Call problem: ${msg || 'connection failed'}`, { id: 'call-error' })
      }}>
      {/* Minimised: just the picture — the controls come back when you expand it. */}
      {/* Minimised, someone presenting: the shared screen fills the window (no thumbnail strip). */}
      <style>{`.kashi-call-compact .lk-control-bar{display:none}.kashi-call-compact .lk-video-conference-inner{height:100%}`
        + `.kashi-call-compact .lk-focus-layout{grid-template-columns:1fr}.kashi-call-compact .lk-focus-layout .lk-carousel{display:none}`}</style>
      <ShareSetup onShareState={onShareState} />
      <VideoConference />
    </LiveKitRoom>
  )
}