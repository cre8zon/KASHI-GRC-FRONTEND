import { Lock } from 'lucide-react'
import { useAccountAccess } from '../../store/accountAccessStore'

/**
 * Shown while the organisation is read-only: suspended, within its grace
 * period. People can still look and export; the server refuses changes. After
 * the date shown, access is blocked and everyone is signed out with a message.
 */
export function ReadOnlyBanner() {
  const { readOnly, until } = useAccountAccess()
  if (!readOnly) return null
  const date = until ? new Date(until) : null
  const when = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  return (
    <div role="status"
      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-status-warn-bg border-b border-status-warn-bd text-status-warn-fg">
      <Lock size={14} className="shrink-0" />
      <span>
        Your organisation's account is suspended — read-only{when ? ` until ${when}` : ''}. You can view and export, but not make changes.
      </span>
    </div>
  )
}

export default ReadOnlyBanner
