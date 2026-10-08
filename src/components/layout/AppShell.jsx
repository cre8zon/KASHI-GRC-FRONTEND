import { useState } from 'react'
import { useNotificationToast } from '../../hooks/useNotifications'
import { useNotificationSocket } from '../../hooks/useNotificationSocket'
import { NotificationPermissionPrompt } from '../ui/NotificationPermissionPrompt'
import { Sidebar }            from './Sidebar'
import { TopNav }             from './TopNav'
import { TabBar }             from './TabBar'
import { TabContentRenderer } from './TabContent'
import { useBootstrap }       from '../../hooks/useUIConfig'
import { PageSkeleton }       from '../ui/EmptyState'
import { useServerStatus }    from '../../hooks/useServerStatus'
import { ServerStatusBanner } from '../ui/ServerStatusBanner'
import { useChatPresenceFeed } from '../../hooks/useChatPresence'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const { isLoading } = useBootstrap()
  // Order matters only for readability — the socket refetches, the toast
  // watches the result. Both are app-wide because a notification must reach
  // the person on whatever screen they are on.
  useNotificationSocket()  // Push: refetch the instant the server saves one
  useNotificationToast()   // Toast + chime + desktop banner on anything new
  useChatPresenceFeed()   // Chat socket on every page: who is online, live unread badge
  const { status, retryNow, nextRetryIn, retryCount } = useServerStatus()

  // No background here: the pastel wash lives on <body>. An opaque surface at
  // this level would cover it and leave the glass chrome with nothing to blur.
  //
  // The chrome (sidebar + top bar) renders IMMEDIATELY, even while bootstrap is
  // loading — only the content area shows a skeleton. Previously the whole app
  // was replaced by a bare skeleton on every reload, which flashed blank.
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Server status banner — slides in above everything when server is down */}
      <ServerStatusBanner
        status={status}
        retryNow={retryNow}
        nextRetryIn={nextRetryIn}
        retryCount={retryCount}
      />

      {/* The soft ask for desktop notifications. Renders nothing at all unless
          permission is still 'default' and the person has not dismissed it on
          this browser — so it appears once, briefly, and never again. Below
          the server banner because a server that is down is the more urgent
          news. */}
      <NotificationPermissionPrompt />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(o => !o)} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopNav onMenuToggle={() => setCollapsed(o => !o)} />
          <TabBar />
          {isLoading ? <PageSkeleton /> : <TabContentRenderer />}
        </div>
      </div>
    </div>
  )
}