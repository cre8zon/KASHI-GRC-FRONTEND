import { Toaster, ToastBar, toast } from 'react-hot-toast'
import { Check, X, AlertTriangle, Info } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * The app's toast surface — every "Saved", every error, one place.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The Toaster in main.jsx styled its toasts with a hand-copied list of CSS
 * variables: opaque --surface-raised, a 1px border, 14px type. That is the
 * same flat slab the notification toast had, and for the same reason — it was
 * written before the glass layer and never revisited. In an app where Modal,
 * the dropdowns and every other floating surface are `glass-overlay`, the
 * toast was the one thing landing as an opaque rectangle on the mesh wash.
 *
 * Pulling it out of main.jsx also means the notification toast and the
 * ordinary ones are now two components with one vocabulary, instead of a
 * component and an inline style object in the entry file.
 *
 * ── WHY THE STYLING IS SPLIT THE WAY IT IS ────────────────────────────────
 *
 * This is the one place where "just use the Tailwind class" does not work.
 *
 * ToastBar renders `style={{ ...itsOwnDefaults, ...toast.style }}` on the
 * animated wrapper, and its defaults include `background: '#fff'`. An inline
 * background beats any class, so `className="glass-overlay"` on the Toaster
 * would be painted over by that white — and `background: 'transparent'` in
 * style would beat the class in the other direction and paint nothing.
 *
 * So the wrapper is deliberately stripped to NOTHING — transparent, no border,
 * no shadow, no padding — and the glass is a real div inside it, built from
 * the same classes as every other surface. react-hot-toast keeps what it is
 * good at (enter/exit animation, stacking, timing); the look comes from the
 * design system rather than from a copy of it.
 *
 * ── WHY NOT THE LIBRARY'S ICONS ───────────────────────────────────────────
 *
 * They are animated SVG ticks and crosses with their own colours, which is one
 * more palette in a product that has tokens for exactly this. lucide in a
 * `rounded-card bg-*` chip is the motif the settings rows, empty states and the
 * notification toast all use, so a toast now reads as part of the set. The
 * loading spinner IS kept — it is a spinner, it is animated, and a static
 * lucide icon would be a worse one.
 */

// Per-type chip + icon, from the status tokens. 'blank' is toast('…') with no
// type — informational, so it gets the brand chip rather than a status colour.
const KIND = {
  success: { Icon: Check,         chip: 'bg-status-pass-bg', fg: 'text-status-pass-fg' },
  error:   { Icon: X,             chip: 'bg-status-fail-bg', fg: 'text-status-fail-fg' },
  warning: { Icon: AlertTriangle, chip: 'bg-status-warn-bg', fg: 'text-status-warn-fg' },
  blank:   { Icon: Info,          chip: 'bg-brand-500/10',   fg: 'text-brand-ink' },
}

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 5000,
        // The wrapper carries nothing but the animation. See the note above —
        // ToastBar's own inline background would otherwise beat the glass class.
        style: {
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
          padding: 0,
          margin: 0,
          maxWidth: 'none',
          color: 'inherit',
        },
      }}
    >
      {(t) => (
        <ToastBar toast={t} style={{ background: 'transparent', boxShadow: 'none', padding: 0 }}>
          {({ icon, message }) => {
            const kind = KIND[t.type] || KIND.blank
            const { Icon, chip, fg } = kind
            return (
              <div
                className={cn(
                  'glass-overlay rounded-card shadow-overlay',
                  'flex items-start gap-2.5 p-3',
                  'w-[320px] max-w-[92vw]',
                )}
                role={t.type === 'error' ? 'alert' : 'status'}
                aria-live={t.type === 'error' ? 'assertive' : 'polite'}
              >
                {/* loading keeps the library's spinner; everything else gets the
                    chip. The spinner is wrapped so it sits on the same baseline
                    and at the same size as a chip would. */}
                {t.type === 'loading' ? (
                  <span className="shrink-0 flex items-center justify-center w-[30px] h-[30px]">
                    {icon}
                  </span>
                ) : (
                  <span className={cn('shrink-0 p-2 rounded-card', chip)}>
                    <Icon size={14} className={fg} />
                  </span>
                )}

                {/* 12px, not 14px: dense type in this product is 10–12px, and a
                    14px toast next to an 11px table reads as a different app.
                    min-w-0 is what lets a long message wrap instead of pushing
                    the dismiss button out of the surface. */}
                <div className="min-w-0 flex-1 pt-1 text-[12px] leading-snug text-text-primary [&>div]:m-0">
                  {message}
                </div>

                {t.type !== 'loading' && (
                  <button
                    type="button"
                    onClick={() => toast.dismiss(t.id)}
                    aria-label="Dismiss"
                    className="shrink-0 mt-0.5 h-6 w-6 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )
          }}
        </ToastBar>
      )}
    </Toaster>
  )
}