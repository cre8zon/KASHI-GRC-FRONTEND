import { forwardRef, useId, useState } from 'react'
import { Eye, EyeOff, AlertCircle, CheckCircle2, Info, Circle, Check, Loader2, ArrowBigUp } from 'lucide-react'
import { cn } from '../../lib/cn'
import { PASSWORD_RULES, passwordStrength } from '../../lib/passwordPolicy'

/**
 * Form primitives for the auth screens and the Settings → Security tab.
 *
 * Every field: a real <label for>, aria-invalid, and its error/hint wired via
 * aria-describedby, so a screen reader announces "Password, invalid entry,
 * Password needs a symbol" instead of nothing. Errors use the status tokens on
 * solid surfaces (never translucent), which keeps them ≥ 4.5:1 in both themes.
 */

const fieldBase =
  'h-11 w-full rounded-ctl border bg-surface-raised px-3.5 text-sm text-text-primary ' +
  'placeholder:text-text-faint transition-[border-color,box-shadow] duration-150 ' +
  'focus:outline-none focus:ring-[3px] disabled:opacity-60 disabled:cursor-not-allowed'

const fieldOk  = 'border-border-strong hover:border-text-faint focus:border-brand-ink focus:ring-brand-ink/20'
const fieldBad = 'border-status-fail-fg focus:border-status-fail-fg focus:ring-status-fail-fg/20'

function FieldMessage({ id, error, hint }) {
  if (error) {
    return (
      <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-status-fail-fg">
        <AlertCircle size={13} className="mt-px shrink-0" />{error}
      </p>
    )
  }
  if (hint) return <p id={id} className="mt-1.5 text-xs text-text-muted">{hint}</p>
  return null
}

export const TextField = forwardRef(function TextField(
  { label, error, hint, icon: Icon, className, labelAside, ...props }, ref
) {
  const id = useId()
  const msgId = `${id}-msg`
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-text-primary">{label}</label>
        {labelAside}
      </div>
      <div className="relative">
        {Icon && <Icon size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />}
        <input
          id={id}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          className={cn(fieldBase, error ? fieldBad : fieldOk, Icon && 'pl-10')}
          {...props}
        />
      </div>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  )
})

/**
 * Password input with a show/hide toggle and a Caps Lock warning — the single
 * most common reason a correct password "doesn't work".
 */
export const PasswordField = forwardRef(function PasswordField(
  { label, error, hint, className, labelAside, onKeyUp, onKeyDown, onBlur, ...props }, ref
) {
  const id = useId()
  const msgId = `${id}-msg`
  const [show, setShow] = useState(false)
  const [caps, setCaps] = useState(false)
  const checkCaps = (e) => { try { setCaps(!!e.getModifierState?.('CapsLock')) } catch { /* */ } }

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-text-primary">{label}</label>
        {labelAside}
      </div>
      <div className="relative">
        <input
          id={id}
          ref={ref}
          type={show ? 'text' : 'password'}
          spellCheck={false}
          autoCapitalize="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint || caps ? msgId : undefined}
          className={cn(fieldBase, error ? fieldBad : fieldOk, 'pr-11')}
          onKeyUp={(e) => { checkCaps(e); onKeyUp?.(e) }}
          onKeyDown={(e) => { checkCaps(e); onKeyDown?.(e) }}
          onBlur={(e) => { setCaps(false); onBlur?.(e) }}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-ctl text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/40"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {caps && !error && (
        <p id={msgId} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-status-warn-fg">
          <ArrowBigUp size={13} className="shrink-0" /> Caps Lock is on
        </p>
      )}
      {(!caps || error) && <FieldMessage id={msgId} error={error} hint={hint} />}
    </div>
  )
})

/** Banner for form-level outcomes. tone: fail | warn | info | pass */
export function FormAlert({ tone = 'fail', title, children, className }) {
  if (!title && !children) return null
  const map = {
    fail: { box: 'bg-status-fail-bg text-status-fail-fg', Icon: AlertCircle },
    warn: { box: 'bg-status-warn-bg text-status-warn-fg', Icon: AlertCircle },
    info: { box: 'bg-status-info-bg text-status-info-fg', Icon: Info },
    pass: { box: 'bg-status-pass-bg text-status-pass-fg', Icon: CheckCircle2 },
  }[tone]
  const { Icon } = map
  return (
    <div role={tone === 'fail' || tone === 'warn' ? 'alert' : 'status'}
         className={cn('mb-5 flex items-start gap-2.5 rounded-ctl px-3.5 py-3 text-[13px] leading-snug', map.box, className)}>
      <Icon size={16} className="mt-px shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
    </div>
  )
}

/** Strength meter — four segments in saturated status colours (visible on any track). */
export function PasswordStrength({ value = '' }) {
  const s = passwordStrength(value)
  const fill = { fail: 'bg-status-fail-fg', warn: 'bg-status-warn-fg', info: 'bg-status-info-fg', pass: 'bg-status-pass-fg', none: '' }[s.tone]
  const ink  = { fail: 'text-status-fail-fg', warn: 'text-status-warn-fg', info: 'text-status-info-fg', pass: 'text-status-pass-fg', none: 'text-text-muted' }[s.tone]
  return (
    <div className="mt-2.5" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map(i => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-200', i <= s.score ? fill : 'bg-surface-inset')} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-text-muted">
        Strength: <span className={cn('font-semibold', ink)}>{s.label}</span>
      </p>
    </div>
  )
}

/** Live requirement checklist — met items turn green with a tick. */
export function PasswordChecklist({ value = '', className }) {
  return (
    <ul className={cn('mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-ctl bg-surface-inset px-3.5 py-3 sm:grid-cols-2', className)}
        aria-label="Password requirements">
      {PASSWORD_RULES.map(r => {
        const ok = value ? r.test(value) : false
        return (
          <li key={r.id} className={cn('flex items-center gap-2 text-xs', ok ? 'text-status-pass-fg font-medium' : 'text-text-secondary')}>
            {ok
              ? <Check size={13} className="shrink-0" aria-hidden />
              : <Circle size={11} className="shrink-0 text-text-faint" aria-hidden />}
            <span>{r.label}</span>
            <span className="sr-only">{ok ? '(met)' : '(not met)'}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function SubmitButton({ loading, loadingText, children, className, ...props }) {
  return (
    <button
      type="submit"
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
      className={cn(
        'flex h-11 w-full items-center justify-center gap-2 rounded-ctl bg-brand-500 px-4 text-sm font-semibold text-brand-on',
        'shadow-elevated transition-all duration-150 hover:bg-brand-600 hover:shadow-hover active:bg-brand-700',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-ink/35',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      {...props}
    >
      {loading ? <><Loader2 size={16} className="animate-spin" />{loadingText || children}</> : children}
    </button>
  )
}
