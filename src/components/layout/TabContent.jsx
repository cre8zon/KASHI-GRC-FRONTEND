import { Outlet } from 'react-router-dom'
import { RouteSync } from './RouteSync'

export function TabContentRenderer() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto" id="main-scroll">
      <RouteSync />
      <Outlet />
    </div>
  )
}