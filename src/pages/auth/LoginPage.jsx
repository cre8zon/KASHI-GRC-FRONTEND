import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLoginWithRedirect } from '../../hooks/useAuth'
import { useSelector } from 'react-redux'
import { selectIsAuthenticated } from '../../store/slices/authSlice'
import { ShieldCheck, ArrowRight, Eye, EyeOff, Mail, Lock } from 'lucide-react'

const schema = z.object({
  email:      z.string().email('Invalid email address'),
  password:   z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
})

export default function LoginPage() {
  const navigate   = useNavigate()
  const isAuth     = useSelector(selectIsAuthenticated)
  const [showPwd, setShowPwd] = useState(false)
  const { mutate: login, isPending, error } = useLoginWithRedirect()

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', rememberMe: false },
  })

  useEffect(() => { if (isAuth) navigate('/dashboard') }, [isAuth, navigate])

  const onSubmit = (data) => login({ email: data.email, password: data.password })

  const errorMsg = error?.response?.data?.error?.message
    || error?.message
    || (error ? 'Login failed. Check your credentials.' : null)

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 bg-sidebar border-r border-border relative overflow-hidden">
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle, rgb(14 165 233) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-9 h-9 rounded-lg bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
              <ShieldCheck size={18} className="text-brand-400" />
            </div>
            <span className="text-lg font-bold text-text-primary tracking-tight">KashiGRC</span>
          </div>
          <h1 className="text-4xl font-bold text-text-primary leading-tight mb-4">
            Governance.<br />Risk.<br />Compliance.
          </h1>
          <p className="text-text-secondary text-base leading-relaxed max-w-sm">
            Enterprise-grade TPRM and GRC platform. Manage vendor risk, assessments, workflows and compliance from a single source of truth.
          </p>
        </div>

        <div className="relative z-10">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Vendors', value: '2,400+' },
              { label: 'Assessments', value: '14k' },
              { label: 'Risk Score', value: '99.2%' },
            ].map(stat => (
              <div key={stat.label} className="bg-white/5 rounded-lg p-3 border border-border/40">
                <p className="font-mono text-xl font-bold text-brand-300">{stat.value}</p>
                <p className="text-xs text-text-muted mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <ShieldCheck size={20} className="text-brand-400" />
            <span className="font-bold text-text-primary">KashiGRC</span>
          </div>

          <h2 className="text-2xl font-bold text-text-primary mb-1">Sign in</h2>
          <p className="text-sm text-text-muted mb-8">Enter your credentials to continue</p>

          {/* Error state */}
          {errorMsg && (
            <div className="mb-4 px-3 py-2.5 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide">
                <Mail size={11} /> Email Address
              </label>
              <input
                type="email"
                placeholder="admin@kashigrc.com"
                autoComplete="email"
                className="h-10 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide">
                  <Lock size={11} /> Password
                </label>
                <a href="/auth/forgot-password" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="h-10 w-full rounded-md border border-border bg-surface-raised px-3 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            </div>

            {/* Remember me — from Figma */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="rememberMe"
                className="w-3.5 h-3.5 rounded border-border bg-surface-raised accent-brand-500"
                {...register('rememberMe')}
              />
              <label htmlFor="rememberMe" className="text-xs text-text-secondary cursor-pointer select-none">
                Remember me
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full h-10 rounded-md bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 active:bg-brand-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
            >
              {isPending
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><span>Sign In</span><ArrowRight size={15} /></>
              }
            </button>
          </form>

          {/* Admin access notice — from Figma */}
          <div className="mt-6 px-3 py-2.5 rounded-md bg-blue-500/5 border border-blue-500/15 flex items-start gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-white text-[9px] font-bold">i</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-blue-400">Admin Access Required</p>
              <p className="text-[11px] text-text-muted mt-0.5">
                This portal is restricted to authorized administrators only. All login attempts are monitored and logged.
              </p>
            </div>
          </div>

          <p className="text-xs text-text-muted text-center mt-6">
            Need help? <a href="#" className="text-brand-400 hover:text-brand-300">Contact Support</a>
          </p>
          <p className="text-[10px] text-text-muted/50 text-center mt-2">
            Secured by <span className="text-brand-400/70">KashiGRC</span> · Enterprise GRC Platform
          </p>
        </div>
      </div>
    </div>
  )
}
