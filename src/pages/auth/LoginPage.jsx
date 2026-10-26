import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, ArrowRight } from 'lucide-react'
import { useLoginWithRedirect } from '../../hooks/useAuth'
import { AuthLayout, AuthHeading } from '../../components/auth/AuthLayout'
import { TextField, PasswordField, FormAlert, SubmitButton } from '../../components/auth/AuthFields'
import { consumeSessionEndReason, consumeReturnTo, listPeerSessions, adoptPeerSession, setPostLoginTarget } from '../../lib/session'
import { parseApiError } from '../../lib/passwordPolicy'

const schema = z.object({
  email:      z.string().trim().min(1, 'Enter your work email').email('Enter a valid email address'),
  password:   z.string().min(1, 'Enter your password'),
  rememberMe: z.boolean().optional(),
})

/** Why the user is looking at the sign-in page, if a session just ended. */
const REASON_COPY = {
  expired:              { tone: 'warn', title: 'Your session expired',  body: 'Sign in again to pick up where you left off.' },
  idle:                 { tone: 'info', title: 'Signed out for inactivity', body: 'You were inactive for a while, so we signed you out to protect your account.' },
  invalid:              { tone: 'warn', title: 'Please sign in again',  body: 'Your session is no longer valid.' },
  signed_out:           { tone: 'pass', title: "You've signed out",     body: null },
  signed_out_elsewhere: { tone: 'info', title: 'Signed out',            body: 'You signed out in another tab.' },
  password_changed:     { tone: 'pass', title: 'Password updated',      body: 'Sign in with your new password.' },
  account_suspended:    { tone: 'fail', title: 'Your account was suspended', body: 'An administrator of your organisation suspended this account. Contact them to restore it.' },
  tenant_suspended:     { tone: 'fail', title: "Your organisation's access is suspended", body: 'Contact Kashiguard support to restore access.' },
  vendor_suspended:     { tone: 'fail', title: "Your company's access is suspended", body: 'The organisation you work with suspended your company. Contact them to restore it.' },
}

export default function LoginPage() {
  const location = useLocation()
  // Read once: these are one-shot notes left by endSession().
  const [reason]   = useState(() => location.state?.reason || consumeSessionEndReason())
  const [returnTo] = useState(() => {
    const from = location.state?.from
    const fromPath = from?.pathname ? from.pathname + (from.search || '') : null
    return consumeReturnTo() || fromPath
  })
  const notice = reason ? REASON_COPY[reason] : null

  const { mutate: login, isPending, error, reset } = useLoginWithRedirect()

  const { register, handleSubmit, setFocus, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: location.state?.email || '', password: '', rememberMe: false },
    // Checked on submit, then live while correcting. 'onTouched' flagged an
    // empty email the moment focus left it — before Chrome's autofill, which
    // only hands its value over on the first click, had filled it in — and
    // left "Enter your work email" under a filled-in address.
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  // Sessions open in this browser's other tabs. Each tab signs in on its own
  // (several people can work side by side); this only OFFERS to continue as
  // one of them, so nobody's tab is taken over without asking.
  const [peers, setPeers] = useState([])
  useEffect(() => {
    let live = true
    listPeerSessions().then(list => { if (live) setPeers(list) })
    return () => { live = false }
  }, [])
  const continueAs = (auth) => {
    setPostLoginTarget(returnTo)
    adoptPeerSession(auth)
  }

  useEffect(() => { setFocus(location.state?.email ? 'password' : 'email') }, [setFocus]) // eslint-disable-line react-hooks/exhaustive-deps

  const apiErr = useMemo(() => parseApiError(error, 'Sign-in failed. Please try again.'), [error])
  const locked = apiErr.code === 'AUTH_ACCOUNT_LOCKED'

  const onSubmit = (data) => login({ ...data, redirectTo: returnTo })

  return (
    <AuthLayout
      footer={<>Trouble signing in? Contact your workspace administrator.</>}
    >
      <AuthHeading title="Sign in to KashiGuard">
        Welcome back. Use your work email and password.
      </AuthHeading>

      {notice && !error && (
        <FormAlert tone={notice.tone} title={notice.title}>{notice.body}</FormAlert>
      )}

      {apiErr.form && (
        <FormAlert tone={locked ? 'warn' : 'fail'} title={locked ? 'Account temporarily locked' : null}>
          {apiErr.form}
          {locked && (
            <> {' '}<Link to="/auth/forgot-password" className="font-semibold underline underline-offset-2">Reset password</Link></>
          )}
        </FormAlert>
      )}

      {peers.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs text-text-muted">Signed in in another tab</p>
          {peers.map(p => (
            <button key={`${p.userId}@${p.tenantId}`} type="button" onClick={() => continueAs(p)}
              className="w-full flex items-center gap-3 rounded-ctl border border-border px-3 py-2.5 text-left hover:bg-surface-overlay transition-colors">
              <span className="w-8 h-8 shrink-0 rounded-full bg-brand-500 text-brand-on text-xs font-bold flex items-center justify-center">
                {(p.fullName || p.email || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text-primary truncate">Continue as {p.fullName || p.email}</span>
                <span className="block text-xs text-text-muted truncate">{p.tenantName || p.email}</span>
              </span>
              <ArrowRight size={15} className="shrink-0 text-text-muted" />
            </button>
          ))}
          <p className="pt-1 text-xs text-text-muted">Or sign in as someone else:</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4" onChange={() => error && reset()}>
        <TextField
          label="Work email"
          type="email"
          icon={Mail}
          autoComplete="username"
          inputMode="email"
          placeholder="you@company.com"
          error={errors.email?.message || apiErr.fields.email}
          {...register('email')}
        />

        <PasswordField
          label="Password"
          autoComplete="current-password"
          placeholder="Your password"
          error={errors.password?.message || apiErr.fields.password}
          labelAside={
            <Link to="/auth/forgot-password"
              className="text-xs font-medium text-brand-ink underline-offset-2 hover:underline focus-visible:underline">
              Forgot password?
            </Link>
          }
          {...register('password')}
        />

        <label className="flex cursor-pointer select-none items-start gap-2.5 pt-0.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border-strong accent-brand-500"
            {...register('rememberMe')}
          />
          <span className="text-[13px] leading-snug text-text-secondary">
            Keep me signed in
            <span className="block text-xs text-text-muted">Only on a device you trust — you won't be signed out for inactivity.</span>
          </span>
        </label>

        <SubmitButton loading={isPending} loadingText="Signing in…">
          Sign in <ArrowRight size={15} />
        </SubmitButton>
      </form>

      <p className="mt-6 border-t border-border-subtle pt-4 text-xs leading-relaxed text-text-muted">
        This system is for authorised users only. Sign-in attempts are monitored and logged.
      </p>
    </AuthLayout>
  )
}