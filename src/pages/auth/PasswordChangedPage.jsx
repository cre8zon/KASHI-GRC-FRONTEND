import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { CheckCircle2, ArrowRight, ShieldCheck } from 'lucide-react'
import { selectIsAuthenticated } from '../../store/slices/authSlice'
import { AuthLayout, AuthHeading } from '../../components/auth/AuthLayout'

const REDIRECT_SECONDS = 5

/**
 * Shown after the first-login password change. Signed in → counts down to the
 * dashboard. Not signed in (the silent sign-in failed) → sends them to sign in.
 *
 * The old version rendered its headings in text-faint, put white numbers on
 * pale status tints, and had a "Go to dashboard" button with white text on the
 * page background — most of it was unreadable in light mode.
 */
export default function PasswordChangedPage() {
  const navigate = useNavigate()
  const authed   = useSelector(selectIsAuthenticated)
  const target   = authed ? '/dashboard' : '/auth/login'
  const [left, setLeft] = useState(REDIRECT_SECONDS)

  useEffect(() => {
    if (left <= 0) { navigate(target, { replace: true, state: authed ? undefined : { reason: 'password_changed' } }); return }
    const id = setTimeout(() => setLeft(s => s - 1), 1000)
    return () => clearTimeout(id)
  }, [left, navigate, target, authed])

  return (
    <AuthLayout headline="You're all set." sub="Your account is secured with a password only you know.">
      <AuthHeading icon={CheckCircle2} tone="pass" title="Password saved">
        {authed
          ? <>Taking you to your dashboard in <span className="font-semibold text-text-primary tabular-nums">{left}s</span>.</>
          : <>Sign in with your new password to continue.</>}
      </AuthHeading>

      <div className="mb-6 rounded-ctl bg-surface-inset px-4 py-3.5">
        <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-text-primary">
          <ShieldCheck size={15} className="text-brand-ink" /> Keep it safe
        </p>
        <ul className="space-y-1.5 text-[13px] text-text-secondary">
          <li>• Never share your password — our team will never ask for it.</li>
          <li>• Use it only for KashiGRC.</li>
          <li>• Change it from Settings → Security at any time.</li>
        </ul>
      </div>

      <button
        type="button"
        onClick={() => navigate(target, { replace: true, state: authed ? undefined : { reason: 'password_changed' } })}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-ctl bg-brand-500 text-sm font-semibold text-brand-on shadow-elevated transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-ink/35"
      >
        {authed ? 'Go to dashboard now' : 'Sign in'} <ArrowRight size={15} />
      </button>
    </AuthLayout>
  )
}
