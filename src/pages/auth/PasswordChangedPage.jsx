import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Shield, Clock, BadgeCheck, ArrowRight, BookOpen, ShieldCheck } from 'lucide-react'

export default function PasswordChangedPage() {
  const navigate  = useNavigate()
  const [countdown, setCountdown] = useState(5)
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  // Auto-redirect countdown — matches "You'll be taken to dashboard in 2 seconds" from Figma
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(interval); navigate('/dashboard', { replace: true }) }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [navigate])

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-surface-raised rounded-modal shadow-2xl overflow-hidden">
        <div className="p-8">
          {/* Success icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full border-4 border-status-pass-bd flex items-center justify-center bg-status-pass-bg">
              <CheckCircle2 size={40} className="text-status-pass-fg" strokeWidth={2} />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-text-faint text-center mb-2">Password Changed Successfully!</h2>
          <p className="text-sm text-text-muted text-center mb-6">
            Your password has been updated and your account is now secure. You will be redirected to the dashboard shortly.
          </p>

          {/* 3 stat cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { icon: Shield,      label: 'Encrypted',  sub: '256-bit encryption', bg: 'bg-status-pass-bg',  icon_color: 'text-status-pass-fg',  border: 'border-status-pass-bd'  },
              { icon: Clock,       label: 'Updated',    sub: time,                bg: 'bg-status-info-bg',   icon_color: 'text-status-info-fg',   border: 'border-status-info-bd'   },
              { icon: BadgeCheck,  label: 'Verified',   sub: 'Strong password',   bg: 'bg-status-tag-bg', icon_color: 'text-status-tag-fg', border: 'border-status-tag-bd' },
            ].map(({ icon: Icon, label, sub, bg, icon_color, border }) => (
              <div key={label} className={`rounded-card border p-3 text-center ${bg} ${border}`}>
                <div className="flex justify-center mb-2">
                  <div className={`w-8 h-8 rounded-card flex items-center justify-center ${bg}`}>
                    <Icon size={18} className={icon_color} />
                  </div>
                </div>
                <p className="text-xs font-bold text-text-faint">{label}</p>
                <p className="text-[11px] text-text-muted mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* What happens next */}
          <div className="border border-border-subtle rounded-card p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={16} className="text-text-muted" />
              <span className="text-sm font-semibold text-text-faint">What Happens Next</span>
            </div>
            <div className="space-y-3">
              {[
                { n: 1, title: 'Automatic Redirect', desc: `You'll be taken to your dashboard in `, highlight: `${countdown} second${countdown !== 1 ? 's' : ''}`, color: 'bg-status-pass-bg'  },
                { n: 2, title: 'Access Your Workspace', desc: 'Start managing your GRC activities and compliance workflows', color: 'bg-status-info-bg' },
                { n: 3, title: 'Explore Features', desc: "Familiarize yourself with the platform's capabilities and tools", color: 'bg-status-tag-bg' },
              ].map(({ n, title, desc, highlight, color }) => (
                <div key={n} className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-card ${color} flex items-center justify-center shrink-0`}>
                    <span className="text-on-dark text-xs font-bold">{n}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-faint">{title}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {desc}{highlight && <strong className="text-status-pass-fg"> {highlight}</strong>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security tips */}
          <div className="bg-status-info-bg border border-status-info-bd rounded-card p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={16} className="text-status-info-fg" />
              <span className="text-sm font-semibold text-status-info-fg">Security Best Practices</span>
            </div>
            {[
              'Never share your password with anyone, including IT support',
              "Use a unique password for this account — don't reuse passwords",
              'Enable multi-factor authentication in your profile settings',
              'Report any suspicious activity immediately to security@kashigrc.com',
            ].map(tip => (
              <div key={tip} className="flex items-start gap-2 mb-1.5">
                <CheckCircle2 size={12} className="text-status-info-fg mt-0.5 shrink-0" />
                <p className="text-xs text-status-info-fg">{tip}</p>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex-1 h-10 rounded-card bg-surface text-on-dark text-sm font-semibold hover:bg-surface-raised transition-colors flex items-center justify-center gap-2"
            >
              Go to Dashboard Now <ArrowRight size={14} />
            </button>
            <button className="flex-1 h-10 rounded-card border border-border-subtle text-text-faint text-sm font-semibold hover:bg-surface-overlay transition-colors flex items-center justify-center gap-2">
              <BookOpen size={14} /> View User Guide
            </button>
          </div>

          {/* Support links */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <p className="text-xs text-text-muted">Need help getting started?</p>
            {['Contact Support', 'Help Center', 'Video Tutorials'].map(link => (
              <a key={link} href="#" className="text-xs text-status-info-fg hover:text-status-info-fg">{link}</a>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border-subtle px-8 py-4 flex items-center justify-center gap-2">
          <div className="w-6 h-6 rounded-card bg-status-pass-bg flex items-center justify-center">
            <ShieldCheck size={13} className="text-on-dark" />
          </div>
          <div>
            <p className="text-xs font-bold text-text-faint">KashiGRC</p>
            <p className="text-[10px] text-text-muted">Enterprise Governance Platform</p>
          </div>
        </div>
      </div>
    </div>
  )
}
