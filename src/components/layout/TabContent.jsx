import { Outlet } from 'react-router-dom'
import { RouteSync } from './RouteSync'

export function TabContentRenderer() {
  // Transparent scroll container: the pastel wash on <body> must show through.
  // An opaque fill here covers the whole viewport (this div is flex-1) and was
  // hiding the gradient after load. Pages provide their own frosted cards.
  return (
    <div className="flex-1 min-h-0 overflow-y-auto" id="main-scroll">
      <RouteSync />
      <Outlet />
    </div>
  )
}