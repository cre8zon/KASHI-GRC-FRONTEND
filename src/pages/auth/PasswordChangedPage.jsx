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
    <div className="min-h-screen bg-gradient-to-br from-emerald-400 via-green-500 to-green-600 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-8">
          {/* Success icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full border-4 border-green-500 flex items-center justify-center bg-green-50">
              <CheckCircle2 size={40} className="text-green-500" strokeWidth={2} />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Password Changed Successfully!</h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Your password has been updated and your account is now secure. You will be redirected to the dashboard shortly.
          </p>

          {/* 3 stat cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { icon: Shield,      label: 'Encrypted',  sub: '256-bit encryption', bg: 'bg-green-50',  icon_color: 'text-green-600',  border: 'border-green-200'  },
              { icon: Clock,       label: 'Updated',    sub: time,                bg: 'bg-blue-50',   icon_color: 'text-blue-600',   border: 'border-blue-200'   },
              { icon: BadgeCheck,  label: 'Verified',   sub: 'Strong password',   bg: 'bg-purple-50', icon_color: 'text-purple-600', border: 'border-purple-200' },
            ].map(({ icon: Icon, label, sub, bg, icon_color, border }) => (
              <div key={label} className={`rounded-xl border p-3 text-center ${bg} ${border}`}>
                <div className="flex justify-center mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>
                    <Icon size={18} className={icon_color} />
                  </div>
                </div>
                <p className="text-xs font-bold text-gray-800">{label}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* What happens next */}
          <div className="border border-gray-100 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={16} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">What Happens Next</span>
            </div>
            <div className="space-y-3">
              {[
                { n: 1, title: 'Automatic Redirect', desc: `You'll be taken to your dashboard in `, highlight: `${countdown} second${countdown !== 1 ? 's' : ''}`, color: 'bg-green-500'  },
                { n: 2, title: 'Access Your Workspace', desc: 'Start managing your GRC activities and compliance workflows', color: 'bg-blue-500' },
                { n: 3, title: 'Explore Features', desc: "Familiarize yourself with the platform's capabilities and tools", color: 'bg-purple-500' },
              ].map(({ n, title, desc, highlight, color }) => (
                <div key={n} className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-lg ${color} flex items-center justify-center shrink-0`}>
                    <span className="text-white text-xs font-bold">{n}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {desc}{highlight && <strong className="text-green-600"> {highlight}</strong>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security tips */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={16} className="text-blue-600" />
              <span className="text-sm font-semibold text-blue-700">Security Best Practices</span>
            </div>
            {[
              'Never share your password with anyone, including IT support',
              "Use a unique password for this account — don't reuse passwords",
              'Enable multi-factor authentication in your profile settings',
              'Report any suspicious activity immediately to security@kashigrc.com',
            ].map(tip => (
              <div key={tip} className="flex items-start gap-2 mb-1.5">
                <CheckCircle2 size={12} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-600">{tip}</p>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex-1 h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
            >
              Go to Dashboard Now <ArrowRight size={14} />
            </button>
            <button className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
              <BookOpen size={14} /> View User Guide
            </button>
          </div>

          {/* Support links */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <p className="text-xs text-gray-400">Need help getting started?</p>
            {['Contact Support', 'Help Center', 'Video Tutorials'].map(link => (
              <a key={link} href="#" className="text-xs text-blue-500 hover:text-blue-600">{link}</a>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-8 py-4 flex items-center justify-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-green-500 flex items-center justify-center">
            <ShieldCheck size={13} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-800">KashiGRC</p>
            <p className="text-[10px] text-gray-400">Enterprise Governance Platform</p>
          </div>
        </div>
      </div>
    </div>
  )
}
