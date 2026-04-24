import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '../../api/auth.api'
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
  if (passed <= 2) return { level: 'Weak',   color: 'bg-red-500',   width: 'w-1/4' }
  if (passed <= 4) return { level: 'Fair',   color: 'bg-amber-500', width: 'w-2/4' }
  if (passed <= 5) return { level: 'Good',   color: 'bg-blue-500',  width: 'w-3/4' }
  return              { level: 'Strong', color: 'bg-green-500',  width: 'w-full' }
}

export default function ForcePasswordChangePage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const userId    = location.state?.userId
  const tempToken = location.state?.tempToken
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew]         = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  const newPassword = watch('newPassword') || ''
  const strength    = getStrength(newPassword)

  const { mutate: changePassword, isPending, error } = useMutation({
    mutationFn: (data) => authApi.resetPassword(tempToken, data.newPassword),
    onSuccess: () => navigate('/auth/password-changed', { replace: true }),
  })

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-blue-600 via-purple-600 to-purple-800">
      {/* Left panel */}
      <div className="hidden lg:flex w-[420px] flex-col justify-between p-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
            <ShieldCheck size={20} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-base">KashiGRC</p>
            <p className="text-white/60 text-xs">Security First</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/30 flex items-center justify-center shrink-0">
                <ShieldCheck size={16} className="text-amber-300" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">Password Change Required</p>
                <p className="text-white/70 text-xs mt-1 leading-relaxed">For security reasons, you must change your password before accessing the system.</p>
              </div>
            </div>
          </div>

          <h2 className="text-3xl font-bold text-white leading-tight">Secure Your<br />Account</h2>

          {[
            { icon: Key, title: 'Strong Password', desc: 'Use a unique combination of characters, numbers, and symbols' },
            { icon: Lock, title: 'Password Security', desc: 'Your password is encrypted and never stored in plain text' },
            { icon: RefreshCw, title: 'Regular Updates', desc: 'Change your password periodically for enhanced security' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 bg-white/10 rounded-xl p-3">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                <Icon size={15} className="text-white" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">{title}</p>
                <p className="text-white/60 text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div />
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <ShieldCheck size={20} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Change Password</h2>
              <p className="text-xs text-gray-500">First-time login detected</p>
            </div>
          </div>

          {/* Alert */}
          <div className="mb-6 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <ShieldCheck size={15} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">You must set a new password to continue. This is a one-time security requirement.</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error?.message || 'Failed to change password. Please try again.'}
            </div>
          )}

          <form onSubmit={handleSubmit(changePassword)} className="space-y-4">
            {/* Current password */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5">
                <Lock size={12} /> Current Temporary Password
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  placeholder="Enter temporary password"
                  className={cn('w-full h-10 rounded-lg border px-3 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors',
                    errors.currentPassword ? 'border-red-400' : 'border-gray-200')}
                  {...register('currentPassword')}
                />
                <button type="button" onClick={() => setShowCurrent(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.currentPassword && <p className="text-xs text-red-500 mt-1">{errors.currentPassword.message}</p>}
            </div>

            {/* New password */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Create New Password</p>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5">
                <Key size={12} /> New Password
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  className={cn('w-full h-10 rounded-lg border px-3 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors',
                    errors.newPassword ? 'border-red-400' : 'border-gray-200')}
                  {...register('newPassword')}
                />
                <button type="button" onClick={() => setShowNew(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.newPassword && <p className="text-xs text-red-500 mt-1">{errors.newPassword.message}</p>}

              {/* Strength bar */}
              <div className="mt-2 flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500">Password Strength</span>
                <span className={cn('font-semibold', newPassword ? 'text-gray-800' : 'text-gray-400')}>
                  {newPassword ? strength.level : 'Not Set'}
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-500', strength.color, newPassword ? strength.width : 'w-0')} />
              </div>

              {/* Requirements checklist */}
              <div className="mt-3 bg-gray-50 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-600 mb-2">Password Requirements:</p>
                {RULES.map(rule => {
                  const passed = newPassword ? rule.test(newPassword) : false
                  return (
                    <div key={rule.id} className="flex items-center gap-2">
                      {passed
                        ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                        : <XCircle size={13} className="text-gray-300 shrink-0" />
                      }
                      <span className={cn('text-xs', passed ? 'text-green-700' : 'text-gray-500')}>{rule.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1.5">
                <CheckCircle2 size={12} /> Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter your new password"
                  className={cn('w-full h-10 rounded-lg border px-3 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors',
                    errors.confirmPassword ? 'border-red-400' : 'border-gray-200')}
                  {...register('confirmPassword')}
                />
                <button type="button" onClick={() => setShowConfirm(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-xs text-red-500 mt-1">{errors.confirmPassword.message}</p>}
            </div>

            {/* Security tip */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-white text-[10px] font-bold">i</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-700">Security Tip</p>
                <p className="text-xs text-blue-600 mt-0.5">Use a passphrase with random words, numbers, and symbols. Avoid personal information like names, birthdays, or common words.</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full h-10 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isPending
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><ShieldCheck size={15} /> Change Password & Continue</>
              }
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-4">
            Need assistance? <a href="#" className="text-blue-500 hover:text-blue-600">Contact IT Support</a>
          </p>
        </div>
      </div>
    </div>
  )
}
