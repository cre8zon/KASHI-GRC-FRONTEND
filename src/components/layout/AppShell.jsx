import { useState } from 'react'
import { Sidebar }            from './Sidebar'
import { TopNav }             from './TopNav'
import { TabBar }             from './TabBar'
import { TabContentRenderer } from './TabContent'
import { useBootstrap }       from '../../hooks/useUIConfig'
import { PageSkeleton }       from '../ui/EmptyState'
import { useServerStatus }    from '../../hooks/useServerStatus'
import { ServerStatusBanner } from '../ui/ServerStatusBanner'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const { isLoading } = useBootstrap()
  const { status, retryNow, nextRetryIn, retryCount } = useServerStatus()

  if (isLoading) return <PageSkeleton />

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface">
      {/* Server status banner — slides in above everything when server is down */}
      <ServerStatusBanner
        status={status}
        retryNow={retryNow}
        nextRetryIn={nextRetryIn}
        retryCount={retryCount}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(o => !o)} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopNav onMenuToggle={() => setCollapsed(o => !o)} />
          <TabBar />
          <TabContentRenderer />
        </div>
      </div>
    </div>
  )
}