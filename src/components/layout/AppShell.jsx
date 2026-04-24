import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'
import { useBootstrap } from '../../hooks/useUIConfig'
import { PageSkeleton } from '../ui/EmptyState'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const { isLoading } = useBootstrap()

  if (isLoading) return <PageSkeleton />

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(o => !o)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopNav onMenuToggle={() => setCollapsed(o => !o)} />
        <main id="main-scroll" className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}