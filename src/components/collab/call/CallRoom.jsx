import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'
import toast from 'react-hot-toast'

/**
 * The call itself — LiveKit's ready-made conference: participant grid,
 * speaker view, screen sharing, camera / microphone choice, in-call chat.
 * You join with the microphone on and the camera off; both are in the
 * control bar. Leaving (or losing the connection for good) ends the call.
 */
export default function CallRoom({ url, token, compact, onLeave }) {
  return (
    <LiveKitRoom serverUrl={url} token={token} connect audio video={false}
      data-lk-theme="default" style={{ height: '100%' }}
      className={compact ? 'kashi-call-compact' : undefined}
      onDisconnected={onLeave}
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
      <style>{`.kashi-call-compact .lk-control-bar{display:none}.kashi-call-compact .lk-video-conference-inner{height:100%}`}</style>
      <VideoConference />
    </LiveKitRoom>
  )
}