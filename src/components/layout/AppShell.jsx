import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useNotificationToast, useReadOnVisit } from '../../hooks/useNotifications'
import { useNotificationSocket } from '../../hooks/useNotificationSocket'
import { NotificationPermissionPrompt } from '../ui/NotificationPermissionPrompt'
import { Sidebar }            from './Sidebar'
import { TopNav }             from './TopNav'
import { TabBar }             from './TabBar'
import { PageTabs }           from './PageTabs'
import { TabContentRenderer } from './TabContent'
import { useBootstrap }       from '../../hooks/useUIConfig'
import { PageSkeleton }       from '../ui/EmptyState'
import { useServerStatus }    from '../../hooks/useServerStatus'
import { ServerStatusBanner } from '../ui/ServerStatusBanner'
import { ReadOnlyBanner }     from '../ui/ReadOnlyBanner'
import { useChatPresenceFeed } from '../../hooks/useChatPresence'
import { AgentPanel }         from '../ai/AgentPanel'
import { TableResizer } from './TableResizer'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const { isLoading } = useBootstrap()
  // Order matters only for readability — the socket refetches, the toast
  // watches the result. Both are app-wide because a notification must reach
  // the person on whatever screen they are on.
  useNotificationSocket()  // Push: refetch the instant the server saves one
  useNotificationToast()   // Toast + chime + desktop banner on anything new
  const location = useLocation()
  useReadOnVisit(location.pathname, location.search)   // seen the page → its notifications are read
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

      {/* Suspended organisation, within its read-only grace period. */}
      <ReadOnlyBanner />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(o => !o)} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopNav onMenuToggle={() => setCollapsed(o => !o)} />
          <TabBar />
          {/* The page: one rounded surface under the app tabs, like the top
              bar and the sidebar beside it. The page area used to be a
              borderless region with square ends, so the band under the
              active tab started on a hard corner. mr-2, no left margin:
              the sidebar's own 8px margin is the gap, so every gap in the
              shell is 8px instead of 16px beside the sidebar. No backdrop-filter here:
              it would become the containing block for every position:fixed
              modal and drawer inside a page. */}
          <div className="page-surface flex-1 min-h-0 flex flex-col mr-2 mb-2 rounded-card overflow-hidden">
            {/* A page's own tabs (Navigation → "Show as tab of") — on that page only. */}
            {!isLoading && <PageTabs />}
            {isLoading ? <PageSkeleton /> : <TabContentRenderer serverStatus={status} onRetry={retryNow} nextRetryIn={nextRetryIn} />}
          </div>
        </div>
      </div>

      {/* KashiGuard AI side panel — renders nothing unless the user's menu has it. */}
      {!isLoading && <AgentPanel />}

      {/* Drag-to-resize columns on every plain table in the app, saved per
          user. DataTable has its own column controls and is skipped. */}
      <TableResizer />
    </div>
  )
}