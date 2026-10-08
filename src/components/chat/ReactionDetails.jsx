import { useState } from 'react'
import { X } from 'lucide-react'
import { initials } from '../../utils/format'
import { cn } from '../../lib/cn'

/**
 * Who reacted, and with what.
 *
 * ── WHAT WAS THERE BEFORE ─────────────────────────────────────────────────
 *
 * A native `title` tooltip on each chip: names.join(', '). It technically
 * answered the question, and it was the worst possible way to — it waits a
 * second to appear, vanishes if you move, cannot be read on touch at all, has
 * no avatars, no grouping, and on a channel where fifteen people thumbs-upped
 * something it is an unreadable grey ribbon that runs off the screen.
 *
 * ── THE SHAPE ─────────────────────────────────────────────────────────────
 *
 * WhatsApp's sheet: everyone who reacted in one list, with tabs to narrow to a
 * single emoji, and your own row marked so you can take it back. The counts in
 * the tabs are what people actually scan — "did the whole team see this" is a
 * number, not a list of names.
 *
 * ── WHY THIS DOES NOT STEAL THE CHIP CLICK ────────────────────────────────
 *
 * On a phone a reaction chip opens the sheet, because there is nowhere else to
 * put the gesture. Here, clicking a chip toggles your own reaction, which is
 * the far more common action and which people already rely on. So the panel
 * gets its own opener and the chips keep doing exactly what they did — no
 * relearning, and no accidental un-reacting while trying to read a name.
 */
export function ReactionDetails({ reactions, onClose, onToggle, canAct, align = 'right' }) {
  const groups = (reactions || []).filter(r => (r.people?.length || r.count))
  const [tab, setTab] = useState('ALL')

  // Flatten for the All tab, keeping which emoji each person used — that pairing
  // is the whole point of the list, and losing it would make All useless on a
  // message with several different reactions.
  //
  // The `names` fallback is for a payload from before `people` existed — a
  // cached response, or a backend not yet restarted. Without it the panel opens
  // completely empty, which looks broken rather than merely older. `names`
  // already says "You" where people[].you would have, so the row still reads
  // correctly; it just has no id, hence the index in the key.
  const all = groups.flatMap(r => (
    r.people?.length
      ? r.people.map(p => ({ ...p, emoji: r.emoji }))
      : (r.names || []).map((name, i) => ({
          userId: `n${i}`, name, you: name === 'You', emoji: r.emoji,
        }))
  ))
  const shown = tab === 'ALL' ? all : all.filter(p => p.emoji === tab)

  if (groups.length === 0) return null

  return (
    <>
      {/* Full-screen catcher rather than onBlur: the list scrolls, and
          blur-to-close shuts it the moment someone drags the scrollbar. */}
      <span className="fixed inset-0 z-[40]" onClick={onClose} />
      {/* Anchored to the side the message sits on.
          It was always right-0, which is correct for your own messages — they
          are right-aligned, so the panel opens inwards. On a RECEIVED message
          the chip row is at the left edge, so right-0 made the panel open
          leftwards, straight off the edge of the chat pane: the avatars and
          names were clipped away and only the emoji column survived, which is
          what made it look broken. */}
      <div className={cn(
        // Below the chips, not above them. Opening upwards put the panel on top
        // of the message you were asking about — and on top of the hover
        // toolbar, so the quick-reaction row and the panel fought for the same
        // few pixels. Downwards, the message stays readable while you read who
        // reacted to it.
        'absolute top-full mt-1 z-[41] glass-overlay rounded-card shadow-overlay text-left overflow-hidden',
        // Never wider than the viewport allows, for a narrow window or a phone.
        'w-64 max-w-[calc(100vw-2rem)]',
        align === 'left' ? 'left-0' : 'right-0',
      )}>
        <div className="flex items-center justify-between px-2 pt-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Reactions
          </span>
          <button type="button" onClick={onClose} aria-label="Close"
            className="h-5 w-5 inline-flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-surface-overlay">
            <X size={11} />
          </button>
        </div>

        {/* Tabs. Only when there is more than one emoji — with a single kind of
            reaction, "All" and that emoji are the same list and the row would
            be decoration. */}
        {groups.length > 1 && (
          <div className="flex items-center gap-1 px-2 pt-1.5 pb-1 overflow-x-auto">
            {[['ALL', null, all.length], ...groups.map(r => [r.emoji, r.emoji, r.people?.length || r.count])]
              .map(([key, emoji, n]) => (
                <button key={key} type="button" onClick={() => setTab(key)}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-badge text-[11px] transition-colors',
                    tab === key
                      ? 'bg-brand-500/15 text-brand-ink font-semibold'
                      : 'text-text-secondary hover:bg-surface-overlay',
                  )}>
                  {emoji ? <span className="text-sm leading-none">{emoji}</span> : 'All'}
                  <span className="text-text-muted">{n}</span>
                </button>
              ))}
          </div>
        )}

        <div className="max-h-56 overflow-y-auto px-1 pb-1.5">
          {shown.map(p => (
            <div key={`${p.emoji}:${p.userId}`}
              className="flex items-center gap-2 px-1.5 py-1 rounded-ctl">
              <span className="w-6 h-6 shrink-0 rounded-full bg-brand-500/20 text-[9px] font-semibold flex items-center justify-center text-brand-ink">
                {initials(p.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-text-primary truncate">
                  {p.you ? 'You' : p.name}
                </span>
                {/* Only your own row says how to undo it. Everyone else's is
                    information, and a hint under a colleague's name would read
                    as if you could remove theirs. */}
                {p.you && canAct && (
                  <button type="button"
                    onClick={() => { onToggle?.(p.emoji); onClose?.() }}
                    className="block text-[10px] text-text-muted hover:text-text-primary transition-colors">
                    Click to remove
                  </button>
                )}
              </span>
              <span className="text-base leading-none shrink-0">{p.emoji}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}