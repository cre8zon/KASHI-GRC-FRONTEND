import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { ArrowRight, ArrowLeft, CheckCircle2, LinkIcon, KeyRound } from 'lucide-react'
import { authApi } from '../../api/auth.api'
import { AuthLayout, AuthHeading } from '../../components/auth/AuthLayout'
import {
  PasswordField, FormAlert, SubmitButton, PasswordStrength, PasswordChecklist,
} from '../../components/auth/AuthFields'
import { newPasswordSchema, parseApiError } from '../../lib/passwordPolicy'

const schema = z.object({
  newPassword: newPasswordSchema,
  confirm:     z.string().min(1, 'Re-enter the new password'),
}).refine(d => d.newPassword === d.confirm, { message: "Passwords don't match", path: ['confirm'] })

const LINK_DEAD = new Set(['AUTH_RESET_TOKEN_INVALID', 'AUTH_RESET_TOKEN_EXPIRED'])

/**
 * ResetPasswordPage — step 2 of reset: the user arrives from the emailed link
 * with ?token=… in the URL.
 *
 * Validation now matches the server exactly (it asked for 8 characters while
 * the server required 12 with a narrower symbol set, so valid-looking
 * passwords failed with a generic error). A dead link gets its own screen
 * with a one-click way to request a new one.
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token    = params.get('token')
  const [done, setDone] = useState(false)

  const { register, handleSubmit, watch, setFocus, setError, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirm: '' },
    mode: 'onTouched',
  })
  const pwd = watch('newPassword') || ''
  useEffect(() => { if (token) setFocus('newPassword') }, [token, setFocus])

  const { mutate, isPending, error } = useMutation({
    mutationFn: ({ newPassword }) => authApi.resetPassword(token, newPassword),
    onSuccess: () => {
      setDone(true)
      setTimeout(() => navigate('/auth/login', { replace: true, state: { reason: 'password_changed' } }), 2500)
    },
    onError: (err) => {
      const { fields } = parseApiError(err)
      if (fields.newPassword) setError('newPassword', { type: 'server', message: fields.newPassword })
      if (err?.code === 'AUTH_PASSWORD_REUSED') setError('newPassword', { type: 'server', message: err.message })
    },
  })

  const apiErr = useMemo(() => {
    if (!error || error.code === 'AUTH_PASSWORD_REUSED') return { form: null, fields: {} }
    return parseApiError(error, "We couldn't reset your password. Please try again.")
  }, [error])

  if (!token || LINK_DEAD.has(error?.code)) {
    const expired = error?.code === 'AUTH_RESET_TOKEN_EXPIRED'
    return (
      <AuthLayout headline="Links expire for your safety." sub="Reset links work once and only for 15 minutes.">
        <AuthHeading icon={LinkIcon} tone="warn" title={!token ? 'This link is incomplete' : expired ? 'This link has expired' : 'This link has already been used'}>
          {!token
            ? 'The reset link is missing its security code — it may have been cut off when copied.'
            : 'Request a fresh link and use it within 15 minutes.'}
        </AuthHeading>
        <Link to="/auth/forgot-password"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-ctl bg-brand-500 text-sm font-semibold text-brand-on shadow-elevated transition-colors hover:bg-brand-600">
          Request a new link <ArrowRight size={15} />
        </Link>
        <BackToSignIn />
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout headline="You're all set." sub="Your new password is active.">
        <AuthHeading icon={CheckCircle2} tone="pass" title="Password updated">
          Taking you to sign in with your new password…
        </AuthHeading>
        <Link to="/auth/login" state={{ reason: 'password_changed' }}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-ctl bg-brand-500 text-sm font-semibold text-brand-on shadow-elevated transition-colors hover:bg-brand-600">
          Sign in now <ArrowRight size={15} />
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout wide headline="Almost there." sub="Choose a strong password you don't use anywhere else.">
      <AuthHeading icon={KeyRound} title="Set a new password">
        It must meet every requirement below.
      </AuthHeading>

      {apiErr.form && <FormAlert tone="fail">{apiErr.form}</FormAlert>}

      <form onSubmit={handleSubmit(mutate)} noValidate className="space-y-4">
        <div>
          <PasswordField
            label="New password"
            autoComplete="new-password"
            placeholder="At least 12 characters"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <PasswordStrength value={pwd} />
          <PasswordChecklist value={pwd} />
        </div>
        <PasswordField
          label="Confirm new password"
          autoComplete="new-password"
          placeholder="Re-enter the new password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <SubmitButton loading={isPending} loadingText="Updating password…">
          Update password <ArrowRight size={15} />
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
