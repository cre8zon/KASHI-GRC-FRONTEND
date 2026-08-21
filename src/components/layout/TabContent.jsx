import { Outlet } from 'react-router-dom'
import { RouteSync } from './RouteSync'
import { ScrollRestore } from './ScrollRestore'
import { TenantSync } from './TenantSync'

export function TabContentRenderer() {
  // Transparent scroll container: the pastel wash on <body> must show through.
  // An opaque fill here covers the whole viewport (this div is flex-1) and was
  // hiding the gradient after load. Pages provide their own frosted cards.
  return (
    <div className="flex-1 min-h-0 overflow-y-auto" id="main-scroll">
      <RouteSync />
      <ScrollRestore />
      {/* Wraps Outlet, not a sibling: a route asking for another tenant must not
          render its page until the switch lands, or child queries fire against
          the outgoing tenant and cache their failures. */}
      <TenantSync>
        <Outlet />
      </TenantSync>
    </div>
  )
}