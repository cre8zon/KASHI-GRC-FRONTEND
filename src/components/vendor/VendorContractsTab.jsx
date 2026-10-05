/**
 * VendorContractsTab.jsx
 *
 * The vendor's contracts, with expiry surfaced rather than buried in a date
 * column.
 *
 * Replaces VendorDetailPage's ContractsTab (lines 1346-1390), which is
 * read-only. Kept read-only here too, with one difference worth naming: the
 * API layer has had `contracts.create` and `contracts.update` since the
 * beginning and nothing has ever called them, so the endpoints exist and no UI
 * reaches them. That is a gap to close deliberately, with a form that knows
 * which fields the server requires — not by bolting a modal onto a list.
 *
 * ── WHAT THIS ADDS OVER THE HARDCODED TAB ─────────────────────────────────
 * Expiry. A contract list whose whole job is telling you when cover lapses
 * should say "expires in 12 days" rather than printing a date and leaving the
 * arithmetic to the reader. Expired and expiring-soon rows are called out at
 * the top, because that is the only reason anyone opens this tab.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Package, AlertTriangle, CalendarClock } from 'lucide-react'
import { vendorsApi } from '../../api/vendors.api'
import { cn } from '../../lib/cn'

const STATUS_TONE = {
  ACTIVE:     'text-status-pass-fg bg-status-pass-bg',
  EXPIRED:    'text-status-fail-fg bg-status-fail-bg',
  PENDING:    'text-status-warn-fg bg-status-warn-bg',
  TERMINATED: 'text-text-muted bg-surface-overlay',
}

const SOON_DAYS = 60

function fmtDate(v) {
  if (!v) return null
  try { return new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return String(v) }
}

/** Whole days from today. Negative means already past. */
function daysUntil(v) {
  if (!v) return null
  const then = new Date(v)
  if (Number.isNaN(then.getTime())) return null
  // Both floored to midnight, so "tomorrow" is 1 rather than 0.7.
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const now = new Date()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((a - b) / 86400000)
}

function ExpiryChip({ endDate, status }) {
  // A terminated contract's end date is history, not a deadline.
  if (status === 'TERMINATED') return null
  const d = daysUntil(endDate)
  if (d === null) return null

  if (d < 0) {
    return (
      <span className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded text-status-fail-fg bg-status-fail-bg shrink-0">
        <AlertTriangle size={8} /> Expired {Math.abs(d)}d ago
      </span>
    )
  }
  if (d <= SOON_DAYS) {
    return (
      <span className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded text-status-warn-fg bg-status-warn-bg shrink-0">
        <CalendarClock size={8} /> {d === 0 ? 'Expires today' : `Expires in ${d}d`}
      </span>
    )
  }
  return null
}

export default function VendorContractsTab({ entity }) {
  const vendorId = entity?.id ?? entity?.vendorId

  const { data: raw, isLoading } = useQuery({
    queryKey: ['vendor-contracts', vendorId],
    queryFn:  () => vendorsApi.contracts.list(vendorId),
    enabled:  !!vendorId,
    staleTime: 5 * 60 * 1000,
  })

  // Three shapes, because this endpoint has been seen returning all three and
  // the hardcoded tab already guards the same way (VendorDetailPage:1348).
  const contracts = useMemo(() => {
    const d = raw
    if (Array.isArray(d)) return d
    if (Array.isArray(d?.data)) return d.data
    if (Array.isArray(d?.items)) return d.items
    if (Array.isArray(d?.data?.items)) return d.data.items
    return []
  }, [raw])

  const sorted = useMemo(() => {
    // Soonest to expire first, undated last. The list exists to answer "what
    // lapses next", so that is the order it should arrive in.
    return [...contracts].sort((a, b) => {
      const da = daysUntil(a.endDate)
      const db = daysUntil(b.endDate)
      if (da === null && db === null) return 0
      if (da === null) return 1
      if (db === null) return -1
      return da - db
    })
  }, [contracts])

  const expiringOrExpired = sorted.filter(c => {
    if (c.status === 'TERMINATED') return false
    const d = daysUntil(c.endDate)
    return d !== null && d <= SOON_DAYS
  }).length

  if (isLoading) {
    return (
      <div className="px-4 py-8 text-center text-[11px] text-text-muted">
        Loading contracts…
      </div>
    )
  }

  if (!contracts.length) {
    return (
      <div className="px-4 py-8 text-center">
        <Package size={16} className="mx-auto text-text-muted" />
        <p className="mt-2 text-[11px] text-text-muted">
          No contracts recorded for this vendor.
        </p>
        <p className="mt-1 text-[10px] text-text-muted opacity-70">
          {/* Honest about why there is no button here. */}
          POST /v1/vendors/&#123;id&#125;/contracts exists but no screen calls
          it yet — contracts are recorded outside the platform today.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-overlay/40">
        <span className="text-[10px] text-text-muted">
          {contracts.length} contract{contracts.length === 1 ? '' : 's'}
        </span>
        {expiringOrExpired > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-status-warn-fg">
            <AlertTriangle size={9} />
            {expiringOrExpired} expiring within {SOON_DAYS} days or already expired
          </span>
        )}
      </div>

      <div>
        {sorted.map(c => {
          const id     = c.contractId ?? c.id
          const status = c.status || 'ACTIVE'
          return (
            <div
              key={id}
              className="flex items-start gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-surface-overlay/50 transition-colors"
            >
              <Package size={13} className="text-text-muted shrink-0 mt-0.5" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-medium text-text-primary truncate">
                    {c.contractType || 'Contract'}
                  </span>
                  {c.contractNumber && (
                    <span className="text-[9px] font-mono text-text-muted">
                      {c.contractNumber}
                    </span>
                  )}
                  <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0',
                    STATUS_TONE[status] || 'text-text-muted bg-surface-overlay')}>
                    {status}
                  </span>
                  <ExpiryChip endDate={c.endDate} status={status} />
                </div>

                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {(c.startDate || c.endDate) && (
                    <span className="text-[9px] text-text-muted">
                      {fmtDate(c.startDate) || '—'} → {fmtDate(c.endDate) || '—'}
                    </span>
                  )}
                  {c.renewalDate && (
                    <span className="text-[9px] text-text-muted">
                      Renews {fmtDate(c.renewalDate)}
                    </span>
                  )}
                  {c.contractValue != null && (
                    <span className="text-[9px] text-text-muted">
                      Value {c.contractValue}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}