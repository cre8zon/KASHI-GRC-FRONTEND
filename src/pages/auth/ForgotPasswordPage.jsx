import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { Mail, ArrowLeft, MailCheck, KeyRound, ArrowRight } from 'lucide-react'
import { authApi } from '../../api/auth.api'
import { AuthLayout, AuthHeading } from '../../components/auth/AuthLayout'
import { TextField, FormAlert, SubmitButton } from '../../components/auth/AuthFields'
import { parseApiError } from '../../lib/passwordPolicy'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your work email').email('Enter a valid email address'),
})

const RESEND_COOLDOWN = 30

/**
 * ForgotPasswordPage — step 1 of reset: enter email, we send a reset link.
 *
 * The response is the same whether or not the email has an account (the
 * server no longer 404s on unknown emails), so this form cannot be used to
 * find out who has an account. Only network/server failures show an error.
 */
export default function ForgotPasswordPage() {
  const [sentTo, setSentTo]     = useState(null)
  const [cooldown, setCooldown] = useState(0)

  const { register, handleSubmit, setFocus, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
    mode: 'onTouched',
  })
  useEffect(() => { setFocus('email') }, [setFocus])

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: (email) => authApi.requestReset(email),
    onSuccess: (_, email) => { setSentTo(email); setCooldown(RESEND_COOLDOWN) },
    // A pre-fix backend still 404s on an unknown email — treat it as success
    // so the page never reveals whether an account exists.
    onError: (err, email) => {
      if (err?.status === 404 || err?.code === 'RESOURCE_NOT_FOUND') { setSentTo(email); setCooldown(RESEND_COOLDOWN) }
    },
  })

  const apiErr = useMemo(() => {
    if (!error || error?.status === 404 || error?.code === 'RESOURCE_NOT_FOUND') return { form: null, fields: {} }
    return parseApiError(error, "We couldn't send the reset link. Please try again.")
  }, [error])

  const onSubmit = ({ email }) => mutate(email.trim())

  if (sentTo) {
    return (
      <AuthLayout headline="Check your inbox." sub="The link in the email lets you choose a new password.">
        <AuthHeading icon={MailCheck} tone="pass" title="Check your email">
          If an account exists for <span className="font-semibold text-text-primary">{sentTo}</span>, we've sent it a password reset link.
        </AuthHeading>
        <ul className="mb-6 space-y-2 text-[13px] text-text-secondary">
          <li>• The link works once and expires in 15 minutes.</li>
          <li>• Not there? Check spam or quarantine, then resend.</li>
        </ul>
        <button
          type="button"
          disabled={cooldown > 0 || isPending}
          onClick={() => mutate(sentTo)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-ctl border border-border-strong bg-surface-raised text-sm font-semibold text-text-primary transition-colors hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-ink/30"
        >
          {isPending ? 'Sending…' : cooldown > 0 ? `Resend link in ${cooldown}s` : 'Resend link'}
        </button>
        <BackToSignIn />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout headline="Locked out? It happens." sub="We'll email you a secure, single-use link to set a new password.">
      <AuthHeading icon={KeyRound} title="Reset your password">
        Enter the work email for your account and we'll send you a reset link.
      </AuthHeading>

      {apiErr.form && <FormAlert tone="fail">{apiErr.form}</FormAlert>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4" onChange={() => error && reset()}>
        <TextField
          label="Work email"
          type="email"
          icon={Mail}
          autoComplete="email"
          inputMode="email"
          placeholder="you@company.com"
          error={errors.email?.message || apiErr.fields.email}
          {...register('email')}
        />
        <SubmitButton loading={isPending} loadingText="Sending link…">
          Send reset link <ArrowRight size={15} />
        </SubmitButton>
      </form>

      <BackToSignIn />
    </AuthLayout>
  )
}

function BackToSignIn() {
  return (
    <Link to="/auth/login"
      className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:underline">
      <ArrowLeft size={14} /> Back to sign in
    </Link>
  )
}
