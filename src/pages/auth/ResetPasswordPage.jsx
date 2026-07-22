import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { ShieldCheck, ArrowRight, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react'
import { authApi } from '../../api/auth.api'

const schema = z.object({
  newPassword: z.string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/[a-z]/, 'Include a lowercase letter')
    .regex(/[0-9]/, 'Include a number'),
  confirm: z.string(),
}).refine(d => d.newPassword === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})

/**
 * ResetPasswordPage — step 2 of reset: user arrives from the emailed link with
 * the token in the URL query string (?token=...). This is the key fix: the
 * old flow read the token from React Router location.state, which is empty on
 * a fresh page load, so emailed links never worked.
 */
export default function ResetPasswordPage() {
  const [params]   = useSearchParams()
  const navigate   = useNavigate()
  // The token arrives in the URL query string from the emailed reset link
  // (?token=...). The OLD page read it from location.state, which is empty on a
  // fresh page load — that's why emailed links were dead. Reading the query
  // string is the fix. (First-login force-change is a separate flow on
  // /auth/set-password and is unaffected.)
  const token      = params.get('token')
  const [showPwd, setShowPwd] = useState(false)
  const [done, setDone]       = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirm: '' },
  })

  const { mutate, isPending, error } = useMutation({
    mutationFn: ({ newPassword }) => authApi.resetPassword(token, newPassword),
    onSuccess: () => {
      setDone(true)
      // Send them to login after a moment so they sign in with the new password.
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    },
  })

  const apiError = error?.response?.data?.message
    || (error ? 'This reset link is invalid or has expired. Please request a new one.' : null)

  // No token in the URL → the link is malformed or was opened directly.
  if (!token) {
    return (
      <AuthShell heading="Invalid reset link">
        <div className="w-12 h-12 rounded-card bg-status-fail-bg border border-status-fail-bd flex items-center justify-center mb-5">
          <AlertTriangle size={22} className="text-status-fail-fg" />
        </div>
        <p className="text-sm text-text-muted mb-8 leading-relaxed">
          This password reset link is missing its token. It may have been copied incorrectly.
          Request a fresh link to continue.
        </p>
        <Link to="/auth/forgot-password"
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-ink hover:opacity-80 transition-opacity">
          Request a new link <ArrowRight size={15} />
        </Link>
      </AuthShell>
    )
  }

  if (done) {
    return (
      <AuthShell heading="Password reset">
        <div className="w-12 h-12 rounded-card bg-status-pass-bg border border-status-pass-bd flex items-center justify-center mb-5">
          <CheckCircle2 size={22} className="text-status-pass-fg" />
        </div>
        <p className="text-sm text-text-muted mb-8 leading-relaxed">
          Your password has been updated. Redirecting you to sign in…
        </p>
        <Link to="/login"
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-ink hover:opacity-80 transition-opacity">
          Sign in now <ArrowRight size={15} />
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell heading="Set a new password" sub="Choose a strong password you haven't used before.">
      {apiError && (
        <div className="mb-4 px-3 py-2.5 rounded-ctl bg-status-fail-bg border border-status-fail-bd text-xs text-status-fail-fg">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(mutate)} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide">
            <Lock size={11} /> New Password
          </label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              placeholder="Enter a new password"
              autoComplete="new-password"
              autoFocus
              className="h-10 w-full rounded-ctl border border-border bg-surface-raised px-3 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-colors"
              {...register('newPassword')}
            />
            <button type="button" onClick={() => setShowPwd(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
              {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {errors.newPassword && <p className="text-xs text-status-fail-fg">{errors.newPassword.message}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide">
            <Lock size={11} /> Confirm Password
          </label>
          <input
            type={showPwd ? 'text' : 'password'}
            placeholder="Re-enter your new password"
            autoComplete="new-password"
            className="h-10 w-full rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-colors"
            {...register('confirm')}
          />
          {errors.confirm && <p className="text-xs text-status-fail-fg">{errors.confirm.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="h-10 w-full rounded-ctl bg-brand-500 text-brand-900 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60">
          {isPending ? 'Updating…' : <>Reset password <ArrowRight size={15} /></>}
        </button>
      </form>

      <Link to="/login"
        className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text-secondary transition-colors">
        <ArrowLeft size={15} /> Back to sign in
      </Link>
    </AuthShell>
  )
}

/** Shared two-column auth shell so the reset states match the login look. */
function AuthShell({ heading, sub, children }) {
  return (
    <div className="min-h-screen bg-surface flex">
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 bg-sidebar border-r border-border relative overflow-hidden">
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle, rgb(var(--color-brand-500)) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-9 h-9 rounded-card bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
              <ShieldCheck size={18} className="text-brand-ink" />
            </div>
            <span className="text-lg font-bold text-text-primary tracking-tight">KashiGRC</span>
          </div>
          <h1 className="text-4xl font-bold text-text-primary leading-tight mb-4">
            Almost<br />there.
          </h1>
          <p className="text-text-secondary text-base leading-relaxed max-w-sm">
            Set a new password and you'll be back to managing risk and compliance in seconds.
          </p>
        </div>
        <div className="relative z-10 text-xs text-text-muted">
          Never share your password. KashiGRC staff will never ask for it.
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <ShieldCheck size={20} className="text-brand-ink" />
            <span className="font-bold text-text-primary">KashiGRC</span>
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-1">{heading}</h2>
          {sub && <p className="text-sm text-text-muted mb-8">{sub}</p>}
          {!sub && <div className="mb-8" />}
          {children}
        </div>
      </div>
    </div>
  )
}