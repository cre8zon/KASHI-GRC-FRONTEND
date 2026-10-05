/**
 * InboxRow — one row in the merged, time-ordered inbox.
 *
 * ── WHY ONE ROW COMPONENT AND NOT TWO ────────────────────────────────────
 *
 * The All tab is a timeline. A timeline where every other entry is a different
 * height, with a different set of buttons, is not a timeline — it is two lists
 * interleaved, which is the segregation this tab exists to remove. So every
 * entry renders the same shape, and what differs is a chip saying which kind it
 * is and where clicking takes you.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────
 *
 * A workflow task in TaskInbox carries inline Approve / Reject / Send back,
 * wired to the workflow action endpoint with SoD checks and a remarks prompt
 * behind them. Those are NOT here.
 *
 * That is a real trade and worth being plain about: the All tab is for seeing
 * what arrived and opening it; the Tasks tab still renders TaskInbox unchanged,
 * with every inline action it has always had. Putting approval buttons on a
 * timeline row would mean approving a step from a list that does not show you
 * the step — and it would force this component to branch on kind for its
 * buttons, its status words and its confirmations, which is two components
 * wearing one name.
 *
 * One click from the row reaches the full surface either way.
 */

import { GitBranch, ClipboardCheck, AlertTriangle, ChevronRight } from 'lucide-react'
import { isOverdue } from '../../lib/inboxRoute'
import { cn } from '../../lib/cn'

const KIND = {
  TASK: {
    label: 'Task',
    Icon:  GitBranch,
    chip:  'bg-brand-500/10 text-brand-ink border-brand-500/25',
  },
  ACTION_ITEM: {
    label: 'Action item',
    Icon:  ClipboardCheck,
    chip:  'bg-surface-overlay text-text-secondary border-border',
  },
}

const PRIORITY_TONE = {
  CRITICAL: 'bg-status-fail-bg text-status-fail-fg border-status-fail-bd',
  HIGH:     'bg-status-warn-bg text-status-warn-fg border-status-warn-bd',
}

// Same vocabulary the action items page uses, so a row and the card it opens
// do not describe the same item with different words.
const STATUS_TONE = {
  OPEN:           'bg-status-warn-bg text-status-warn-fg border-status-warn-bd',
  IN_PROGRESS:    'bg-status-info-bg text-status-info-fg border-status-info-bd',
  PENDING:        'bg-status-info-bg text-status-info-fg border-status-info-bd',
  PENDING_REVIEW: 'bg-status-tag-bg text-status-tag-fg border-status-tag-bd',
}
const statusLabel = (v) =>
  (v || '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase())

function timeLabel(at) {
  if (!at) return null
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function InboxRow({ entry, onOpen }) {
  const kind    = KIND[entry.kind] || KIND.ACTION_ITEM
  const Icon    = kind.Icon
  const overdue = isOverdue(entry)
  const clickable = !!entry.route

  return (
    <button
      onClick={() => clickable && onOpen?.(entry)}
      disabled={!clickable}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors border-b border-border last:border-b-0',
        clickable ? 'hover:bg-surface-overlay/60' : 'opacity-60 cursor-not-allowed'
      )}
    >
      {/* Overdue is marked, not sorted. See lib/inboxRoute — moving it off the
          sort order is what lets the list stay a timeline. */}
      <span className="w-1 self-stretch rounded-full shrink-0"
            style={{ background: overdue ? 'var(--status-fail-fg, #b91c1c)' : 'transparent' }} />

      <Icon size={13} className="text-text-muted shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-text-primary truncate">{entry.title}</span>
          <span className={cn('text-[9px] px-1.5 py-0.5 rounded border shrink-0', kind.chip)}>
            {kind.label}
          </span>
          {STATUS_TONE[entry.status] && (
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded border shrink-0',
              STATUS_TONE[entry.status])}>
              {statusLabel(entry.status)}
            </span>
          )}
          {PRIORITY_TONE[entry.priority] && (
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded border shrink-0',
              PRIORITY_TONE[entry.priority])}>
              {entry.priority}
            </span>
          )}
        </div>

        {/* A row carried the title and almost nothing else, which made the
            All tab thinner than the action items page it replaces for most
            people. The meta line below is built by the normalisers — each kind
            decides what is worth a reader's attention, this just lays it out. */}
        {entry.description && (
          <p className="text-[10px] text-text-muted truncate mt-0.5">{entry.description}</p>
        )}

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {entry.subtitle && (
            <span className="text-[9px] text-text-muted capitalize truncate max-w-[18rem]">
              {entry.subtitle}
            </span>
          )}

          {(entry.meta || []).map(m => (
            <span key={m.label} className="text-[9px] text-text-muted whitespace-nowrap">
              {m.label}: <span className="text-text-secondary">{m.value}</span>
            </span>
          ))}

          {entry.dueAt && !overdue && (
            <span className="text-[9px] text-text-muted whitespace-nowrap">
              Due {new Date(entry.dueAt).toLocaleDateString()}
            </span>
          )}
          {overdue && (
            <span className="flex items-center gap-1 text-[9px] text-status-fail-fg shrink-0">
              <AlertTriangle size={8} />
              Overdue {new Date(entry.dueAt).toLocaleDateString()}
            </span>
          )}

          {/* Says why the row does not click rather than looking broken. An
              entry with no route is a module that raised work without saying
              where it happens — see sql/87 C1's `unroutable`. */}
          {!clickable && (
            <span className="text-[9px] text-text-muted italic shrink-0">
              No destination configured
            </span>
          )}
        </div>
      </div>

      <span className="text-[9px] text-text-muted shrink-0 tabular-nums mt-0.5">
        {timeLabel(entry.at)}
      </span>
      {clickable && <ChevronRight size={13} className="text-text-muted shrink-0 mt-0.5" />}
    </button>
  )
}

export default InboxRow