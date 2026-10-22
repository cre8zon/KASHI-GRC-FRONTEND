import { useEffect, useRef } from 'react'
import { LiveKitRoom, VideoConference, StartAudio, useConnectionState, useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { ConnectionState, MediaDeviceFailure, RoomEvent, Track } from 'livekit-client'
import '@livekit/components-styles'
import toast from 'react-hot-toast'

/**
 * The call itself — LiveKit's ready-made conference: participant grid,
 * speaker view, screen sharing, camera / microphone choice, in-call chat.
 * You join with the microphone and the camera off; both are in the
 * control bar (and the microphone on the small call window too). Leaving (or losing the connection for good) ends the call.
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
 * KashiGuard tab is left out of the choices — sharing the tab you are calling
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

/**
 * Reports the microphone to whoever shows controls outside the conference
 * (the small call window): whether it is on, and a function to flip it.
 */
function MicBridge({ onMicState }) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant()
  const connected = useConnectionState() === ConnectionState.Connected
  useEffect(() => {
    // Not before the call is connected: until then "off" only means "not yet".
    if (!connected) return
    onMicState?.(isMicrophoneEnabled, () =>
      localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled).catch(() => {}))
  }, [connected, isMicrophoneEnabled, localParticipant, onMicState])
  return null
}

/**
 * micOn — whether to join with the microphone on. Off by default, like the
 * camera: you unmute when you are ready. After a refresh the call passes the
 * state you had, so a reload does not unmute or mute you.
 */
export default function CallRoom({ url, token, compact, onLeave, onShareState, onMicState, micOn = false }) {
  return (
    <LiveKitRoom serverUrl={url} token={token} connect audio={!!micOn} video={false}
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
        + `.kashi-call-compact .lk-focus-layout{grid-template-columns:1fr}.kashi-call-compact .lk-focus-layout .lk-carousel{display:none}`
        // LiveKit sizes the video area as 100% minus the control bar; with the
        // bar hidden that left an empty strip under the picture.
        + `.kashi-call-compact .lk-grid-layout-wrapper,.kashi-call-compact .lk-focus-layout-wrapper{height:100%}`}</style>
      <ShareSetup onShareState={onShareState} />
      <MicBridge onMicState={onMicState} />
      <VideoConference />
      {/* After a page refresh the browser may block sound until a click —
          this appears only then, so the call is never silently mute. */}
      <StartAudio label="Click to turn on the call's sound"
        className="lk-button absolute left-1/2 top-3 -translate-x-1/2 z-20 !bg-status-warn-bg !text-status-warn-fg font-medium" />
    </LiveKitRoom>
  )
}