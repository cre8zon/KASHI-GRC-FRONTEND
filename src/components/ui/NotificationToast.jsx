import { Bell, X, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '../../lib/cn'

/**
 * The notification toast.
 *
 * ── WHAT WAS WRONG WITH THE OLD ONE ───────────────────────────────────────
 *
 * Not the CSS — the alias layer in index.html does define --surface-raised,
 * --border and --text-primary on :root, so the inline styles resolved. The
 * problem is that they resolved to a flat opaque white rectangle in an app
 * whose entire visual language is translucent glass floating over a mesh
 * wash. Every other floating surface in the product — Modal, and the twelve
 * other users of shadow-overlay — is `glass-overlay`: 82% surface, 22px blur,
 * saturate 1.5, with a real fallback for browsers without backdrop-filter.
 * The toast was the one thing that opted out.
 *
 * It also carried an emoji bell in a codebase that uses lucide everywhere,
 * at 14px in an app whose dense type is 10–12px, with no structure beyond a
 * single run of text and no way to act on it.
 *
 * ── WHY CLASSES AND NOT INLINE STYLE ──────────────────────────────────────
 *
 * Tailwind utilities are how every other surface here is built, so the toast
 * now inherits the design system by construction rather than by a hand-copied
 * list of variables that can drift from it. glass-overlay also brings its own
 * @supports fallback, which an inline background cannot.
 *
 * ── THE SHAPE ─────────────────────────────────────────────────────────────
 *
 * rounded-card, not rounded-modal: this is a card-scale surface, and 12px is
 * what cards use. The brand chip is the same `p-2 rounded-card bg-brand-500/10`
 * motif the settings rows and empty states use, so the toast reads as part of
 * the set rather than as a visitor.
 *
 * brand-ink rather than brand-500 for the icon: on a pastel sage scale, 500 is
 * nearly invisible as a foreground on a light surface. brand-ink is the token
 * that exists for exactly this and flips per theme.
 */
export function NotificationToast({ t, message, onOpen }) {
  const clickable = typeof onOpen === 'function'

  return (
    <div
      className={cn(
        'glass-overlay rounded-card shadow-overlay',
        'w-[340px] max-w-[92vw] overflow-hidden',
        // react-hot-toast drives t.visible; animating on it means the toast
        // slides rather than appearing, which at 5s duration is most of what
        // makes it feel like part of the app.
        'transition-all duration-200 ease-out',
        t?.visible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 -translate-y-1 scale-[0.98]',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5 p-3">
        <div className="p-2 rounded-card bg-brand-500/10 shrink-0">
          <Bell size={14} className="text-brand-ink" />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Notification
          </p>
          {/* line-clamp-3, not truncate: a remediation message is a sentence,
              and one clipped line of it tells nobody anything. Three lines is
              the most that reads at a glance. */}
          <p className="mt-0.5 text-[12px] leading-snug text-text-primary line-clamp-3">
            {message}
          </p>

          {clickable && (
            <button
              type="button"
              onClick={() => { onOpen(); toast.dismiss(t.id) }}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium
                         text-brand-ink hover:underline underline-offset-2"
            >
              Open
              <ArrowRight size={11} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => toast.dismiss(t.id)}
          aria-label="Dismiss"
          className="p-1 -m-0.5 rounded-ctl text-text-faint hover:text-text-primary
                     hover:bg-surface-overlay transition-colors shrink-0"
        >
          <X size={13} />
        </button>
      </div>

      {/* The 5-second life, drawn. Without it a toast that vanishes mid-read
          feels like a glitch; with it, it is visibly a timer running out.
          Brand-tinted so the accent appears once, at the edge, rather than as
          a slab of colour competing with the text. */}
      <div className="h-[2px] bg-brand-500/15">
        <div
          className="h-full bg-brand-500/70"
          style={{
            animation: t?.visible
              ? 'kashi-toast-timer 5000ms linear forwards'
              : 'none',
          }}
        />
      </div>

      {/* Scoped here rather than in index.css: this keyframe exists for this
          component only, and a global stylesheet entry for it would be one
          more thing to find when the toast changes. */}
      <style>{`
        @keyframes kashi-toast-timer {
          from { transform: scaleX(1); transform-origin: left }
          to   { transform: scaleX(0); transform-origin: left }
        }
      `}</style>
    </div>
  )
}