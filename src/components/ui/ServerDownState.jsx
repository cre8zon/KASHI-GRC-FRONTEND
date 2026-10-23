import { PageSkeleton } from './EmptyState'

/**
 * The page area while the server cannot be reached: the page's skeleton, as
 * if it were loading — which it is, the moment the server answers.
 *
 * The page itself is not rendered, because every list would fail and say
 * "No data available", which reads as data lost. Nothing else is shown here:
 * the banner at the top (ServerStatusBanner) already says what is wrong and
 * offers Retry, and saying it twice was noise. useServerStatus keeps
 * checking and refetches everything when the server is back.
 */
export function ServerDownState() {
  return (
    <div role="status" aria-live="polite" aria-label="Waiting for the server">
      <PageSkeleton />
    </div>
  )
}

export default ServerDownState