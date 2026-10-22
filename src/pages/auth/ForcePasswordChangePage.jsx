import { useEffect, useMemo } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useDispatch } from 'react-redux'
import axios from 'axios'
import { ShieldCheck, ArrowRight, ArrowLeft, KeyRound, Lock, RefreshCw } from 'lucide-react'
import { authApi } from '../../api/auth.api'
import { loginSuccess } from '../../store/slices/authSlice'
import { AuthLayout, AuthHeading } from '../../components/auth/AuthLayout'
import {
  PasswordField, FormAlert, SubmitButton, PasswordStrength, PasswordChecklist,
} from '../../components/auth/AuthFields'
import { newPasswordSchema, parseApiError } from '../../lib/passwordPolicy'

const schema = z.object({
  newPassword: newPasswordSchema,
  confirm:     z.string().min(1, 'Re-enter the new password'),
}).refine(d => d.newPassword === d.confirm, { message: "Passwords don't match", path: ['confirm'] })

const POINTS = [
  { icon: KeyRound,  title: 'One-time step',      desc: 'Temporary passwords are replaced on first sign-in.' },
  { icon: Lock,      title: 'Never stored in plain text', desc: 'Passwords are hashed before they are saved.' },
  { icon: RefreshCw, title: 'Unique to this account', desc: "Don't reuse a password from another service." },
]

/**
 * First sign-in with a temporary password → choose a permanent one.
 *
 * Arrives from the login response (PASSWORD_RESET_REQUIRED) with a one-time
 * token in router state. The old page also asked for the "current temporary
 * password", which was required by the form but never sent anywhere — the
 * token is the proof. That field is gone.
 *
 * Opened directly (no token, e.g. after a reload) → back to sign-in, where
 * signing in with the temporary password starts this step again.
 */
export default function ForcePasswordChangePage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const dispatch  = useDispatch()
  const tempToken = location.state?.tempToken
  const email     = location.state?.email

  const { register, handleSubmit, watch, setFocus, setError, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirm: '' },
    mode: 'onTouched',
  })
  const pwd = watch('newPassword') || ''
  useEffect(() => { if (tempToken) setFocus('newPassword') }, [tempToken, setFocus])

  const { mutate, isPending, error } = useMutation({
    mutationFn: ({ newPassword }) => authApi.resetPassword(tempToken, newPassword),
    onSuccess: async (_, { newPassword }) => {
      // The reset returns no session — sign in silently with the new password
      // so the user lands in the app, not on another login form.
      try {
        const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
        const res = await axios.post(`${baseURL}/v1/auth/login`, { email, password: newPassword })
        if (res.data?.status === 'SUCCESS') {
          dispatch(loginSuccess({ ...res.data.data, rememberMe: !!location.state?.rememberMe }))
          navigate('/auth/password-changed', { replace: true })
          return
        }
      } catch { /* fall through to manual sign-in */ }
      navigate('/auth/login', { replace: true, state: { reason: 'password_changed', email } })
    },
    onError: (err) => {
      if (err?.code === 'AUTH_PASSWORD_REUSED') {
        setError('newPassword', { type: 'server', message: 'Choose a password different from your temporary one.' })
        return
      }
      const { fields } = parseApiError(err)
      if (fields.newPassword) setError('newPassword', { type: 'server', message: fields.newPassword })
    },
  })

  const apiErr = useMemo(() => {
    if (!error || error.code === 'AUTH_PASSWORD_REUSED' || error.fieldErrors?.newPassword) return { form: null, fields: {} }
    if (error.code === 'AUTH_RESET_TOKEN_EXPIRED' || error.code === 'AUTH_RESET_TOKEN_INVALID') {
      return { form: 'This step timed out. Sign in again with your temporary password to restart it.', fields: {}, dead: true }
    }
    return parseApiError(error, "We couldn't update your password. Please try again.")
  }, [error])

  if (!tempToken) return <Navigate to="/auth/login" replace />

  return (
    <AuthLayout
      wide
      eyebrow="First sign-in"
      headline="Secure your account."
      sub="Replace your temporary password with one only you know."
      points={POINTS}
    >
      <AuthHeading icon={ShieldCheck} tone="warn" title="Set your password">
        {email ? <>Signed in as <span className="font-semibold text-text-primary">{email}</span>. </> : null}
        This is required before you can continue.
      </AuthHeading>

      {apiErr.form && (
        <FormAlert tone={apiErr.dead ? 'warn' : 'fail'}>
          {apiErr.form}
          {apiErr.dead && <> <Link to="/auth/login" state={{ email }} className="font-semibold underline underline-offset-2">Sign in again</Link></>}
        </FormAlert>
      )}

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
        <SubmitButton loading={isPending} loadingText="Saving…">
          Save password and continue <ArrowRight size={15} />
        </SubmitButton>
      </form>

      <Link to="/auth/login"
        className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:underline">
        <ArrowLeft size={14} /> Use a different account
      </Link>
    </AuthLayout>
  )
}
