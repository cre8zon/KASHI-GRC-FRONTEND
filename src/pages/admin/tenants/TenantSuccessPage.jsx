import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CheckCircle2, Copy, Shield, Building2, Mail, BarChart2, Plus, ArrowRight } from 'lucide-react'
import { formatDate } from '../../../utils/format'
import { cn } from '../../../lib/cn'
import toast from 'react-hot-toast'

function CopyField({ label, value }) {
  return (
    <div className="flex items-center justify-between p-3 bg-surface-raised border border-border-subtle rounded-card">
      <div><p className="text-[10px] font-bold text-text-muted uppercase tracking-wide mb-0.5">{label}</p><p className="text-sm font-medium text-text-faint font-mono">{value || '—'}</p></div>
      <button onClick={() => { navigator.clipboard.writeText(value || ''); toast.success(`${label} copied`) }} className="p-1.5 rounded-ctl hover:bg-surface-overlay transition-colors text-text-muted hover:text-text-faint"><Copy size={14} /></button>
    </div>
  )
}

function DeployStep({ icon: Icon, label, sub, done = true }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border-subtle last:border-0">
      <div className="flex items-center gap-3">
        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', done ? 'bg-status-pass-bg' : 'bg-surface-overlay')}><Icon size={15} className={done ? 'text-status-pass-fg' : 'text-text-muted'} /></div>
        <div><p className="text-sm font-medium text-text-faint">{label}</p><p className="text-xs text-text-muted">{sub}</p></div>
      </div>
      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', done ? 'bg-status-pass-bg text-status-pass-fg' : 'bg-surface-overlay text-text-muted')}>{done ? 'Completed' : 'Pending'}</span>
    </div>
  )
}

export default function TenantSuccessPage() {
  const location = useLocation()
  const navigate  = useNavigate()
  const { tenant, admin, plan } = location.state || {}

  useEffect(() => { if (!tenant) navigate('/tenants') }, [tenant, navigate])
  if (!tenant) return null

  const loginUrl = `${window.location.origin}/auth/login`

  return (
    <div className="min-h-screen bg-surface-overlay py-8 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex w-20 h-20 rounded-full bg-status-pass-bg border-4 border-status-pass-bd items-center justify-center mb-5"><CheckCircle2 size={40} className="text-status-pass-fg" strokeWidth={2} /></div>
          <h1 className="text-2xl font-bold text-text-faint mb-2">Tenant Created Successfully!</h1>
          <p className="text-text-muted text-sm">{tenant.name} is now live and ready to use</p>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <div className="w-2 h-2 rounded-full bg-status-pass-bg animate-pulse" />
            <span className="text-xs text-status-pass-fg font-medium">Created on {formatDate(tenant.createdAt || new Date().toISOString())}</span>
          </div>
        </div>

        <div className="bg-surface-raised rounded-modal border border-border-subtle shadow-sm mb-5">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <h2 className="font-semibold text-text-faint">🚀 Deployment Status</h2>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-status-pass-fg bg-status-pass-bg px-2.5 py-1 rounded-full"><div className="w-1.5 h-1.5 rounded-full bg-status-pass-bg" /> All Systems Ready</span>
          </div>
          <div className="px-5">
            <DeployStep icon={Shield}        label="Database Initialized"  sub="Tenant database created and configured" />
            <DeployStep icon={CheckCircle2}  label="Modules Activated"     sub="4 core modules enabled and ready" />
            <DeployStep icon={Building2}     label="Admin Account Created" sub="Primary administrator credentials generated" />
            <DeployStep icon={Mail}          label="Welcome Email Sent"    sub={admin ? `Onboarding instructions delivered to ${admin.email}` : 'Queued for delivery'} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5 mb-5">
          <div className="bg-surface-raised rounded-modal border border-border-subtle shadow-sm p-5">
            <h2 className="font-semibold text-text-faint flex items-center gap-2 mb-4"><Building2 size={16} className="text-brand-500" /> Tenant Details</h2>
            <div className="space-y-2.5 text-sm">
              {[{ label: 'Organization', value: tenant.name }, { label: 'Tenant ID', value: `TNT-${String(tenant.tenantId).padStart(4, '0')}` }, { label: 'Code', value: tenant.code }].map(({ label, value }) => (
                <div key={label} className="flex justify-between"><span className="text-text-muted">{label}</span><span className="font-medium text-text-faint">{value}</span></div>
              ))}
              <div className="flex justify-between"><span className="text-text-muted">Status</span><span className="px-2 py-0.5 bg-status-pass-bg text-status-pass-fg text-xs rounded-full font-semibold">Active - Trial</span></div>
            </div>
          </div>
          <div className="bg-surface-raised rounded-modal border border-border-subtle shadow-sm p-5">
            <h2 className="font-semibold text-text-faint flex items-center gap-2 mb-4">💳 Subscription Plan</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">Plan</span><span className="px-2 py-0.5 bg-brand-500/10 text-brand-600 text-xs rounded font-semibold">{plan?.label || tenant.plan}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Monthly Cost</span><span className="font-bold text-text-faint">{plan?.price || '—'}{plan?.period || ''}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Trial Period</span><span className="px-2 py-0.5 bg-status-warn-bg text-status-warn-fg text-xs rounded font-semibold">30 Days Free</span></div>
              <div className="flex justify-between"><span className="text-text-muted">User Limit</span><span className="text-text-faint">Up to {tenant.maxUsers || plan?.maxUsers || '—'} users</span></div>
            </div>
          </div>
        </div>

        {admin && (
          <div className="bg-surface-raised rounded-modal border border-border-subtle shadow-sm mb-5">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
              <h2 className="font-semibold text-text-faint">🔑 Administrator Credentials</h2>
              <button onClick={() => { navigator.clipboard.writeText(`Name: ${admin.fullName || [admin.firstName, admin.lastName].filter(Boolean).join(' ')}\nEmail: ${admin.email}\nLogin: ${loginUrl}`); toast.success('All credentials copied') }} className="flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-ink font-medium"><Copy size={12} /> Copy All</button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <CopyField label="Admin Name"    value={admin.fullName || [admin.firstName, admin.lastName].filter(Boolean).join(' ')} />
              <CopyField label="Email Address" value={admin.email} />
              <CopyField label="Login URL"     value={loginUrl} />
              <div className="flex items-center justify-between p-3 bg-surface-overlay border border-border-subtle rounded-card"><div><p className="text-[10px] font-bold text-text-muted uppercase tracking-wide mb-0.5">Temporary Password</p><p className="text-sm font-medium text-text-muted italic">Sent via email</p></div></div>
            </div>
            <div className="px-5 pb-4"><div className="flex items-start gap-2 p-3 bg-status-warn-bg border border-status-warn-bd rounded-card"><Shield size={14} className="text-status-warn-fg mt-0.5 shrink-0" /><p className="text-xs text-status-warn-fg">The administrator will be required to change their temporary password on first login.</p></div></div>
          </div>
        )}

        <div className="bg-surface-raised rounded-modal border border-border-subtle shadow-sm mb-6">
          <div className="px-5 py-4 border-b border-border-subtle"><h2 className="font-semibold text-text-faint">≡ Recommended Next Steps</h2></div>
          <div className="p-5 grid grid-cols-3 gap-3">
            {[
              { icon: Mail,      label: 'Send Welcome Email', desc: 'Notify admin with login credentials', color: 'bg-status-info-bg',   action: () => navigate(`/tenants/${tenant.tenantId}/welcome-email`, { state: { tenant, admin } }) },
              { icon: Shield,    label: 'Configure Settings', desc: 'Customize branding and notifications', color: 'bg-status-tag-bg', action: () => navigate(`/tenants/${tenant.tenantId}`) },
              { icon: BarChart2, label: 'View Tenant',         desc: "Go to tenant dashboard",              color: 'bg-status-pass-bg',  action: () => navigate(`/tenants/${tenant.tenantId}`) },
            ].map(item => (
              <button key={item.label} onClick={item.action} className="text-left p-4 border border-border-subtle rounded-card hover:border-brand-500/30 hover:bg-brand-500/3 transition-all group">
                <div className={cn('w-9 h-9 rounded-card flex items-center justify-center mb-3', item.color)}><item.icon size={16} className="text-on-dark" /></div>
                <p className="text-sm font-semibold text-text-faint group-hover:text-brand-600 transition-colors">{item.label}</p>
                <p className="text-xs text-text-muted mt-0.5">{item.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/tenants/new')} className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-card text-sm text-text-faint hover:bg-surface-overlay transition-colors"><Plus size={15} /> Create Another</button>
          <button onClick={() => navigate('/dashboard')} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-500 text-brand-900 rounded-card text-sm font-semibold hover:bg-brand-600 transition-colors">Go to Platform Dashboard <ArrowRight size={15} /></button>
        </div>
      </div>
    </div>
  )
}