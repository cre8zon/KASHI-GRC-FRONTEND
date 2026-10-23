import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { PageSkeleton } from '../ui/EmptyState'
import { ServerDownState } from '../ui/ServerDownState'
import { RouteSync } from './RouteSync'
import { ScrollRestore } from './ScrollRestore'
import { NavTrail } from './navTrail'
import { TenantSync } from './TenantSync'

export function TabContentRenderer({ serverStatus = 'online', onRetry, nextRetryIn = 0 }) {
  const unreachable = serverStatus === 'server_down' || serverStatus === 'offline'
  // Transparent scroll container: the pastel wash on <body> must show through.
  // An opaque fill here covers the whole viewport (this div is flex-1) and was
  // hiding the gradient after load. Pages provide their own frosted cards.
  return (
    <div className="flex-1 min-h-0 overflow-y-auto" id="main-scroll">
      <RouteSync />
      <ScrollRestore />
      <NavTrail />
      {/* Wraps Outlet, not a sibling: a route asking for another tenant must not
          render its page until the switch lands, or child queries fire against
          the outgoing tenant and cache their failures. */}
      <TenantSync>
        {/* The page's own loading boundary. Pages are lazy-loaded; with only
            the app-level boundary, opening a page whose code had not loaded
            yet replaced the WHOLE app — sidebar, top bar, tabs — with a
            spinner. Here only the page area waits, on a page-shaped skeleton.
            (Navigations run in a transition — see main.jsx — so after the
            first load the current page simply stays until the next is ready.)

            Server unreachable: the page is not rendered at all. Every list
            would fail and say "No data", which reads as data lost. A calm
            skeleton (the banner above says why) says what is true; the
            page comes back by itself when the server does. */}
        {unreachable
          ? <ServerDownState />
          : (
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          )}
      </TenantSync>
    </div>
  )
}