import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { ShieldCheck, ArrowRight, Mail, ArrowLeft, MailCheck } from 'lucide-react'
import { authApi } from '../../api/auth.api'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
})

/**
 * ForgotPasswordPage — step 1 of reset: enter email, we send a reset link.
 *
 * Deliberately shows the SAME success message whether or not the email exists,
 * so the form can't be used to enumerate which emails have accounts.
 */
export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, getValues, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  const { mutate, isPending } = useMutation({
    mutationFn: (email) => authApi.requestReset(email),
    // Always land on the confirmation screen — even on error — to avoid leaking
    // whether an account exists. Real failures are logged server-side.
    onSettled: () => setSent(true),
  })

  const onSubmit = ({ email }) => mutate(email)

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Left panel — branding */}
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
            Reset your<br />password.
          </h1>
          <p className="text-text-secondary text-base leading-relaxed max-w-sm">
            Enter the email associated with your account and we'll send you a secure link to set a new password.
          </p>
        </div>
        <div className="relative z-10 text-xs text-text-muted">
          Reset links expire after 15 minutes for your security.
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <ShieldCheck size={20} className="text-brand-ink" />
            <span className="font-bold text-text-primary">KashiGRC</span>
          </div>

          {sent ? (
            <div>
              <div className="w-12 h-12 rounded-card bg-status-pass-bg border border-status-pass-bd flex items-center justify-center mb-5">
                <MailCheck size={22} className="text-status-pass-fg" />
              </div>
              <h2 className="text-2xl font-bold text-text-primary mb-2">Check your email</h2>
              <p className="text-sm text-text-muted mb-2 leading-relaxed">
                If an account exists for <span className="font-medium text-text-secondary">{getValues('email')}</span>,
                we've sent a link to reset your password.
              </p>
              <p className="text-sm text-text-muted mb-8 leading-relaxed">
                The link expires in 15 minutes. Don't forget to check your spam folder.
              </p>
              <Link to="/login"
                className="inline-flex items-center gap-2 text-sm font-medium text-brand-ink hover:opacity-80 transition-opacity">
                <ArrowLeft size={15} /> Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-text-primary mb-1">Forgot password?</h2>
              <p className="text-sm text-text-muted mb-8">
                No worries — we'll send you reset instructions.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide">
                    <Mail size={11} /> Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    autoFocus
                    className="h-10 w-full rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    {...register('email')}
                  />
                  {errors.email && <p className="text-xs text-status-fail-fg">{errors.email.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="h-10 w-full rounded-ctl bg-brand-500 text-brand-900 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60">
                  {isPending ? 'Sending…' : <>Send reset link <ArrowRight size={15} /></>}
                </button>
              </form>

              <Link to="/login"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text-secondary transition-colors">
                <ArrowLeft size={15} /> Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}