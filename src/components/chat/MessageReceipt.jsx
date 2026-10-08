import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, CheckCheck, Clock, X, Loader2 } from 'lucide-react'
import { chatApi, list } from '../../api/chat.api'
import { cn } from '../../lib/cn'

/**
 * Sent / delivered / read, per message, with an info panel that gives the real
 * times — for any message, however old, in a DM or a group.
 *
 * ── WHAT WAS THERE BEFORE ─────────────────────────────────────────────────
 *
 * One CheckCheck and the word "Seen", under the LAST message only, and only if
 * it was mine. Scroll up and a read message, a delivered one and one still in
 * flight all looked identical, and there was no delivered state at all.
 *
 * ── AND WHAT THE FIRST ATTEMPT GOT WRONG ──────────────────────────────────
 *
 * Ticks on every message, but the TIME only on the newest one — because a
 * high-water mark knows when somebody last read, not when they read message
 * 137. Since the newest message is usually the other person's reply, that gate
 * meant the time essentially never appeared.
 *
 * The server now keeps a log of pointer ADVANCES (ChatReadMark), so the exact
 * crossing time for any message is a real query rather than a guess. This panel
 * is what asks it — on open, for that one message, which is the only moment
 * anybody wants it.
 *
 * ── THE FOUR STATES ───────────────────────────────────────────────────────
 *
 *   clock        in flight — the optimistic row, before the server has an id
 *   ✓            the server has it; nobody else's client does yet
 *   ✓✓ muted     every other member's client has it
 *   ✓✓ brand     every other member has read it
 *
 * All-or-nothing rather than any-of: in a group, one of nine people opening the
 * channel must not turn your message read while eight have not seen it. The
 * partial state lives in the count and in the panel.
 */

const hasReached = (watermark, messageId) =>
  watermark != null && messageId != null && Number(watermark) >= Number(messageId)

/**
 * A message's state from the member rows — no request, no waiting.
 *
 * Exported because the message list computes this once per message and the
 * panel's header reuses it; two implementations of "has this person seen it"
 * would drift apart within a week.
 */
export function receiptFor(messageId, others) {
  const read = []
  const delivered = []
  const sent = []
  for (const p of others || []) {
    if (hasReached(p.lastReadMessageId, messageId)) read.push(p)
    else if (hasReached(p.lastDeliveredMessageId, messageId)) delivered.push(p)
    else sent.push(p)
  }
  const total = (others || []).length
  const state = total === 0 ? 'sent'
    : read.length === total ? 'read'
    : read.length + delivered.length === total ? 'delivered'
    : 'sent'
  return { state, read, delivered, sent, total }
}

const fmt = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return time
  const y = new Date(today); y.setDate(today.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`
}

/** One person's row in the panel. */
function PersonRow({ p }) {
  const readAt = fmt(p.readAt)
  const deliveredAt = fmt(p.deliveredAt)
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-[11px] text-text-primary truncate min-w-0 flex-1">{p.name}</span>
      <span className="shrink-0 text-right">
        {p.state === 'READ' && (
          <span className="block text-[10px] text-brand-ink">
            {/* A set state with no time is a crossing that happened before the
                advance log existed. Saying "Read" without a time is the honest
                rendering; substituting their last-read time would be an upper
                bound dressed as an exact answer. */}
            Read{readAt ? ` · ${readAt}` : ''}
          </span>
        )}
        {(p.state === 'READ' || p.state === 'DELIVERED') && deliveredAt && (
          <span className="block text-[10px] text-text-muted">Delivered · {deliveredAt}</span>
        )}
        {p.state === 'DELIVERED' && !deliveredAt && (
          <span className="block text-[10px] text-text-muted">Delivered</span>
        )}
        {p.state === 'SENT' && (
          <span className="block text-[10px] text-text-muted">Not delivered yet</span>
        )}
      </span>
    </div>
  )
}

/**
 * @param {object}  receipt    from receiptFor()
 * @param {number}  messageId  what the panel asks about
 * @param {boolean} pending    optimistic row, no server id yet
 * @param {boolean} direct     DIRECT conversation — no counts on the chip
 */
export function MessageReceipt({ receipt, messageId, pending, direct }) {
  const [open, setOpen] = useState(false)

  // enabled: open — the panel is the only thing that needs this, so a
  // conversation of 200 messages makes zero receipt requests until somebody
  // asks about one. staleTime 0 because the interesting case is "did they read
  // it in the last few seconds", which a cached answer would hide.
  const { data, isLoading } = useQuery({
    queryKey: ['chat-receipts', String(messageId)],
    queryFn:  () => chatApi.receipts(messageId),
    enabled:  open && messageId != null && !pending,
    staleTime: 0,
  })
  const people = list(data)

  if (pending) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-text-muted" title="Sending">
        <Clock size={11} /> Sending…
      </span>
    )
  }
  if (!receipt || receipt.total === 0) return null

  const { state, read, delivered, total } = receipt
  const Icon = state === 'sent' ? Check : CheckCheck
  const tone = state === 'read' ? 'text-brand-ink' : 'text-text-muted'

  // A one-to-one conversation needs no arithmetic: "Read by 1 of 1" is the kind
  // of phrasing that makes an app feel like a database.
  let label
  if (direct) {
    label = state === 'read' ? 'Read' : state === 'delivered' ? 'Delivered' : 'Sent'
  } else if (state === 'read') label = 'Read by all'
  else if (read.length > 0) label = `Read by ${read.length} of ${total}`
  else if (state === 'delivered') label = 'Delivered to all'
  else if (delivered.length > 0) label = `Delivered to ${delivered.length} of ${total}`
  else label = 'Sent'

  return (
    <span className="relative mt-0.5 px-1 inline-flex">
      {/* A real button with a hover state and a cursor, in both kinds of
          conversation. The old version made DMs a plain span, so the one place
          people first look for message info was the one place nothing
          happened — and in groups there was no affordance saying it could be
          clicked at all. */}
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn('inline-flex items-center gap-1 text-[10px] rounded px-1 -mx-0.5',
          'hover:bg-surface-overlay/70 transition-colors cursor-pointer', tone)}
        aria-expanded={open}
        title="Message info">
        <Icon size={11} />
        <span>{label}</span>
      </button>

      {open && (
        <>
          {/* A full-screen catcher rather than onBlur: the panel scrolls, and
              blur-to-close shuts it the moment somebody drags the scrollbar. */}
          <span className="fixed inset-0 z-[40]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 mb-1 z-[41] w-64 glass-overlay rounded-card shadow-overlay p-2 text-left">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Message info
              </span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                className="h-5 w-5 inline-flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-surface-overlay">
                <X size={11} />
              </button>
            </div>

            {isLoading && (
              <div className="flex items-center gap-1.5 py-2 text-[11px] text-text-muted">
                <Loader2 size={12} className="animate-spin" /> Loading…
              </div>
            )}

            {!isLoading && people.length === 0 && (
              <p className="py-2 text-[11px] text-text-muted">No one else is in this conversation.</p>
            )}

            {!isLoading && people.length > 0 && (
              <div className="max-h-64 overflow-y-auto divide-y divide-border-subtle">
                {people.map(p => <PersonRow key={p.userId} p={p} />)}
              </div>
            )}
          </div>
        </>
      )}
    </span>
  )
}