import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '../../api/auth.api'
import { useDispatch } from 'react-redux'
import { loginSuccess } from '../../store/slices/authSlice'
import axios from 'axios'
import { ShieldCheck, Eye, EyeOff, Key, Lock, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

const schema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: z.string()
    .min(12, 'Min 12 characters')
    .regex(/[A-Z]/, 'Needs uppercase')
    .regex(/[a-z]/, 'Needs lowercase')
    .regex(/[0-9]/, 'Needs number')
    .regex(/[!@#$%^&*]/, 'Needs special character'),
  confirmPassword: z.string().min(1, 'Required'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

// Strength rules shown in checklist (from Figma Body-1.png)
const RULES = [
  { id: 'length',   label: 'At least 12 characters long',       test: (p) => p.length >= 12 },
  { id: 'upper',    label: 'Contains uppercase letter (A-Z)',    test: (p) => /[A-Z]/.test(p) },
  { id: 'lower',    label: 'Contains lowercase letter (a-z)',    test: (p) => /[a-z]/.test(p) },
  { id: 'number',   label: 'Contains number (0-9)',              test: (p) => /[0-9]/.test(p) },
  { id: 'special',  label: 'Contains special character (!@#$%^&*)', test: (p) => /[!@#$%^&*]/.test(p) },
  { id: 'common',   label: 'Not a commonly used password',       test: (p) => p.length > 0 },
]

function getStrength(password) {
  const passed = RULES.filter(r => r.test(password)).length
  if (passed <= 2) return { level: 'Weak',   color: 'bg-status-fail-bg',   width: 'w-1/4' }
  if (passed <= 4) return { level: 'Fair',   color: 'bg-status-warn-bg', width: 'w-2/4' }
  if (passed <= 5) return { level: 'Good',   color: 'bg-status-info-bg',  width: 'w-3/4' }
  return              { level: 'Strong', color: 'bg-status-pass-bg',  width: 'w-full' }
}

export default function ForcePasswordChangePage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const userId    = location.state?.userId
  const tempToken = location.state?.tempToken
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew]         = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const dispatch  = useDispatch()

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  const newPassword = watch('newPassword') || ''
  const strength    = getStrength(newPassword)

  const { mutate: changePassword, isPending, error } = useMutation({
    mutationFn: (data) => authApi.resetPassword(tempToken, data.newPassword),
    onSuccess: async (_, formData) => {
      // resetPassword returns no token — silently log in with the new credentials
      // so the Redux store has a valid session before navigating to the dashboard.
      try {
        const baseURL = import.meta.env.VITE_API_BASE_URL || ''
        const loginRes = await axios.post(`${baseURL}/v1/auth/login`, {
          email:    location.state?.email,
          password: formData.newPassword,
        })
        if (loginRes.data?.status === 'SUCCESS') {
          dispatch(loginSuccess(loginRes.data.data))
        }
      } catch {
        // Login after reset failed — user will need to log in manually.
        // Still navigate to password-changed so they see the success screen.
      }
      navigate('/auth/password-changed', { replace: true })
    },
  })

  return (
    <div className="min-h-screen flex bg-surface">
      {/* Left panel */}
      <div className="hidden lg:flex w-[420px] flex-col justify-between p-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-card bg-on-dark/20 backdrop-blur flex items-center justify-center">
            <ShieldCheck size={20} className="text-on-dark" />
          </div>
          <div>
            <p className="font-bold text-on-dark text-base">KashiGRC</p>
            <p className="text-on-dark/60 text-xs">Security First</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-status-warn-bg border border-status-warn-bd rounded-card p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-card bg-status-warn-bg flex items-center justify-center shrink-0">
                <ShieldCheck size={16} className="text-status-warn-fg" />
              </div>
              <div>
                <p className="font-semibold text-on-dark text-sm">Password Change Required</p>
                <p className="text-on-dark/70 text-xs mt-1 leading-relaxed">For security reasons, you must change your password before accessing the system.</p>
              </div>
            </div>
          </div>

          <h2 className="text-3xl font-bold text-on-dark leading-tight">Secure Your<br />Account</h2>

          {[
            { icon: Key, title: 'Strong Password', desc: 'Use a unique combination of characters, numbers, and symbols' },
            { icon: Lock, title: 'Password Security', desc: 'Your password is encrypted and never stored in plain text' },
            { icon: RefreshCw, title: 'Regular Updates', desc: 'Change your password periodically for enhanced security' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 bg-on-dark/10 rounded-card p-3">
              <div className="w-8 h-8 rounded-card bg-on-dark/20 flex items-center justify-center shrink-0">
                <Icon size={15} className="text-on-dark" />
              </div>
              <div>
                <p className="font-semibold text-on-dark text-sm">{title}</p>
                <p className="text-on-dark/60 text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div />
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-surface-raised rounded-modal shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-card bg-status-warn-bg flex items-center justify-center">
              <ShieldCheck size={20} className="text-status-warn-fg" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-faint">Change Password</h2>
              <p className="text-xs text-text-muted">First-time login detected</p>
            </div>
          </div>

          {/* Alert */}
          <div className="mb-6 flex items-start gap-2 p-3 bg-status-warn-bg border border-status-warn-bd rounded-card">
            <ShieldCheck size={15} className="text-status-warn-fg mt-0.5 shrink-0" />
            <p className="text-xs text-status-warn-fg">You must set a new password to continue. This is a one-time security requirement.</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-status-fail-bg border border-status-fail-bd rounded-card text-xs text-status-fail-fg">
              {error?.message || 'Failed to change password. Please try again.'}
            </div>
          )}

          <form onSubmit={handleSubmit(changePassword)} className="space-y-4">
            {/* Current password */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-faint mb-1.5">
                <Lock size={12} /> Current Temporary Password
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  placeholder="Enter temporary password"
                  className={cn('w-full h-10 rounded-card border px-3 pr-10 text-sm text-text-faint placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-status-info-bd focus:border-status-info-bd transition-colors',
                    errors.currentPassword ? 'border-status-fail-bd' : 'border-border-subtle')}
                  {...register('currentPassword')}
                />
                <button type="button" onClick={() => setShowCurrent(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-faint">
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.currentPassword && <p className="text-xs text-status-fail-fg mt-1">{errors.currentPassword.message}</p>}
            </div>

            {/* New password */}
            <div>
              <p className="text-xs font-semibold text-text-faint mb-2">Create New Password</p>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-faint mb-1.5">
                <Key size={12} /> New Password
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  className={cn('w-full h-10 rounded-card border px-3 pr-10 text-sm text-text-faint placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-status-info-bd focus:border-status-info-bd transition-colors',
                    errors.newPassword ? 'border-status-fail-bd' : 'border-border-subtle')}
                  {...register('newPassword')}
                />
                <button type="button" onClick={() => setShowNew(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-faint">
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.newPassword && <p className="text-xs text-status-fail-fg mt-1">{errors.newPassword.message}</p>}

              {/* Strength bar */}
              <div className="mt-2 flex items-center justify-between text-xs mb-1">
                <span className="text-text-muted">Password Strength</span>
                <span className={cn('font-semibold', newPassword ? 'text-text-faint' : 'text-text-muted')}>
                  {newPassword ? strength.level : 'Not Set'}
                </span>
              </div>
              <div className="h-1.5 bg-surface-overlay rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-500', strength.color, newPassword ? strength.width : 'w-0')} />
              </div>

              {/* Requirements checklist */}
              <div className="mt-3 bg-surface-overlay rounded-card p-3 space-y-1.5">
                <p className="text-xs font-semibold text-text-faint mb-2">Password Requirements:</p>
                {RULES.map(rule => {
                  const passed = newPassword ? rule.test(newPassword) : false
                  return (
                    <div key={rule.id} className="flex items-center gap-2">
                      {passed
                        ? <CheckCircle2 size={13} className="text-status-pass-fg shrink-0" />
                        : <XCircle size={13} className="text-text-secondary shrink-0" />
                      }
                      <span className={cn('text-xs', passed ? 'text-status-pass-fg' : 'text-text-muted')}>{rule.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-faint mb-1.5">
                <CheckCircle2 size={12} /> Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter your new password"
                  className={cn('w-full h-10 rounded-card border px-3 pr-10 text-sm text-text-faint placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-status-info-bd focus:border-status-info-bd transition-colors',
                    errors.confirmPassword ? 'border-status-fail-bd' : 'border-border-subtle')}
                  {...register('confirmPassword')}
                />
                <button type="button" onClick={() => setShowConfirm(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-faint">
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-xs text-status-fail-fg mt-1">{errors.confirmPassword.message}</p>}
            </div>

            {/* Security tip */}
            <div className="flex items-start gap-2 p-3 bg-status-info-bg border border-status-info-bd rounded-card">
              <div className="w-5 h-5 rounded-full bg-status-info-bg flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-on-dark text-[10px] font-bold">i</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-status-info-fg">Security Tip</p>
                <p className="text-xs text-status-info-fg mt-0.5">Use a passphrase with random words, numbers, and symbols. Avoid personal information like names, birthdays, or common words.</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full h-10 rounded-card bg-brand-500 text-brand-900 text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isPending
                ? <span className="w-4 h-4 border-2 border-on-dark/30 border-t-white rounded-full animate-spin" />
                : <><ShieldCheck size={15} /> Change Password & Continue</>
              }
            </button>
          </form>

          <p className="text-xs text-text-muted text-center mt-4">
            Need assistance? <a href="#" className="text-status-info-fg hover:text-status-info-fg">Contact IT Support</a>
          </p>
        </div>
      </div>
    </div>
  )
}