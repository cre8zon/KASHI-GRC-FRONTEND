import { QueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

/**
 * Query client tuned for a remote DB (Aiven, ~10-30ms RTT per query).
 *
 * Key principles:
 *   1. staleTime by query category — static data (roles, blueprints) stays fresh
 *      for 30 minutes; live data (inbox, vendors) stays fresh for 30-60 seconds.
 *      Eliminates redundant re-fetches on tab focus and component remount.
 *
 *   2. refetchOnWindowFocus OFF — switching browser tabs was re-firing every
 *      mounted query. With Aiven latency this caused noticeable UI freezes.
 *
 *   3. retry: 1 for server errors — 3 retries on a 500 meant waiting 3× the
 *      timeout before the user saw an error. 4xx = no retry (user/auth issue).
 *
 *   4. Better error message extraction from API response body.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 60s default: data is "fresh" for this window — no re-fetch on remount,
      // tab switch, or route change. Override per-query for live/static data.
      staleTime: 60 * 1000,

      // Keep unused data in cache for 15 min before GC.
      // Navigate away and back = instant paint from cache, background refetch.
      gcTime: 15 * 60 * 1000,

      // 4xx = user/auth problem, retry won't help. 5xx = retry once only.
      retry: (failureCount, error) => {
        const status = error?.response?.status || error?.status
        if (status >= 400 && status < 500) return false
        return failureCount < 1
      },

      // Never re-fetch just because the user switched tabs.
      refetchOnWindowFocus: false,

      // Don't re-fetch on reconnect by default.
      refetchOnReconnect: false,
    },
    mutations: {
      onError: (error) => {
        const msg = error?.response?.data?.error?.message
          || error?.response?.data?.message
          || error?.message
          || 'Something went wrong'
        toast.error(msg)
      },
    },
  },
})

/**
 * Named stale times for consistent use across the app.
 *
 * Usage:
 *   staleTime: STALE.STATIC      // roles, blueprints, templates, UI config
 *   staleTime: STALE.SLOW        // vendors list, assessments, users
 *   staleTime: STALE.LIVE        // inbox tasks, notifications, dashboard counts
 *   staleTime: STALE.REALTIME    // step progress during active workflow action
 */
export const STALE = {
  STATIC:   30 * 60 * 1000,   // 30 min
  SLOW:      5 * 60 * 1000,   // 5 min
  LIVE:         30 * 1000,    // 30 sec
  REALTIME:     10 * 1000,    // 10 sec
}