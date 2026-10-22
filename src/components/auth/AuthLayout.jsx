import { ShieldCheck, Lock, FileCheck2, Activity } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * AuthLayout — the shared shell for sign-in, forgot/reset password, first-login
 * password change and the success screen.
 *
 * Left: a solid brand panel (bg-brand-500 + text-brand-on), so it follows the
 * user's theme and stays readable on every preset — white ink on Kashi Purple,
 * deep same-hue ink on the pastels — because the theme engine solves that pair.
 * Right: the form on a frosted card over the app's wash.
 *
 * Replaces four hand-copied shells whose left panel used the sidebar colour
 * (white) with text-on-dark (white) — invisible — on two of the pages.
 */
const DEFAULT_POINTS = [
  { icon: ShieldCheck, title: 'Built for audit',        desc: 'Every sign-in is logged and attributable.' },
  { icon: Lock,        title: 'Encrypted end to end',   desc: 'Passwords are hashed; sessions expire automatically.' },
  { icon: FileCheck2,  title: 'One source of truth',    desc: 'Vendors, assessments and evidence in one place.' },
]

export function AuthLayout({
  eyebrow = 'KashiGRC',
  headline = 'Governance, risk and compliance — calmly.',
  sub = 'Third-party risk, audits and policies for teams that have to prove it.',
  points = DEFAULT_POINTS,
  children,
  footer,
  wide = false,
}) {
  return (
    <div className="min-h-screen flex">
      {/* Brand panel */}
      <aside className="relative hidden lg:flex w-[44%] max-w-[560px] shrink-0 flex-col justify-between overflow-hidden bg-brand-500 p-10 xl:p-12 text-brand-on">
        {/* Decorative rings — outlines only, no gradients (DESIGN.md rule 3). */}
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border border-brand-on/15" />
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full border border-brand-on/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full border border-brand-on/10" />

        <div className="relative flex items-center gap-3">
          <BrandMark className="bg-brand-on text-brand-500" />
          <span className="text-lg font-bold tracking-tight">KashiGRC</span>
        </div>

        <div className="relative max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.14em]">{eyebrow}</p>
          <h1 className="mt-3 text-[2.15rem] font-bold leading-[1.15] tracking-tight">{headline}</h1>
          {sub && <p className="mt-4 text-[15px] leading-relaxed">{sub}</p>}

          {points?.length > 0 && (
            <ul className="mt-9 space-y-4">
              {points.map(({ icon: Icon = Activity, title, desc }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl bg-brand-on/15">
                    <Icon size={15} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-[13px] leading-snug">{desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="relative text-xs">
          © {new Date().getFullYear()} KashiGRC · Authorised users only
        </p>
      </aside>

      {/* Form column */}
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className={cn('w-full', wide ? 'max-w-[480px]' : 'max-w-[420px]')}>
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <BrandMark className="bg-brand-500 text-brand-on" />
            <span className="text-base font-bold tracking-tight text-text-primary">KashiGRC</span>
          </div>

          <div className="glass-card rounded-modal shadow-elevated p-6 sm:p-8">
            {children}
          </div>

          {footer && <div className="mt-5 text-center text-xs text-text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

function BrandMark({ className }) {
  return (
    <span className={cn('flex h-9 w-9 items-center justify-center rounded-card text-base font-black shadow-elevated', className)}>
      K
    </span>
  )
}

/** Page heading inside the card. */
export function AuthHeading({ icon: Icon, tone = 'brand', title, children }) {
  const chip = {
    brand: 'bg-brand-500/15 text-brand-ink',
    pass:  'bg-status-pass-bg text-status-pass-fg',
    warn:  'bg-status-warn-bg text-status-warn-fg',
    fail:  'bg-status-fail-bg text-status-fail-fg',
  }[tone]
  return (
    <div className="mb-6">
      {Icon && (
        <span className={cn('mb-4 flex h-11 w-11 items-center justify-center rounded-card', chip)}>
          <Icon size={20} />
        </span>
      )}
      <h2 className="text-[1.45rem] font-bold leading-tight tracking-tight text-text-primary">{title}</h2>
      {children && <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{children}</p>}
    </div>
  )
}
