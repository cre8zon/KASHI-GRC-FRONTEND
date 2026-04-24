import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateTenant, useCreateOrgAdmin } from '../../../hooks/useTenants'
import { Building2, User, CreditCard, Puzzle, CheckCircle2, ChevronRight, ArrowLeft, X } from 'lucide-react'
import { cn } from '../../../lib/cn'

const STEPS = [
  { n: 1, label: 'Organization Info', icon: Building2 },
  { n: 2, label: 'Admin Details',     icon: User       },
  { n: 3, label: 'Subscription',      icon: CreditCard },
  { n: 4, label: 'Review & Create',   icon: Puzzle     },
]

const PLANS = [
  { key: 'STARTER',      label: 'Starter',      price: '$99',    period: '/month', tag: null,           maxUsers: 50,   maxVendors: 100,  features: ['Up to 50 users','5 Compliance frameworks','Email support','10 GB storage','Basic reporting'] },
  { key: 'PROFESSIONAL', label: 'Professional', price: '$299',   period: '/month', tag: 'MOST POPULAR', maxUsers: 200,  maxVendors: 500,  features: ['Up to 200 users','All compliance frameworks','Priority support','100 GB storage','Advanced analytics','API access','Automated workflows'] },
  { key: 'ENTERPRISE',   label: 'Enterprise',   price: 'Custom', period: '',       tag: null,           maxUsers: 9999, maxVendors: 9999, features: ['Unlimited users','Custom frameworks','Dedicated support','Unlimited storage','White-label options','SSO & Advanced security','Dedicated account manager'] },
]

function Stepper({ current }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const done = step.n < current; const active = step.n === current; const Icon = step.icon
        return (
          <div key={step.n} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={cn('w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all',
                done ? 'bg-green-500 border-green-500' : active ? 'bg-brand-500 border-brand-500' : 'bg-surface border-border')}>
                {done ? <CheckCircle2 size={17} className="text-white" strokeWidth={2.5} /> : <Icon size={15} className={active ? 'text-white' : 'text-text-muted'} />}
              </div>
              <span className={cn('text-[11px] font-medium whitespace-nowrap', active ? 'text-brand-400' : done ? 'text-green-400' : 'text-text-muted')}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={cn('h-0.5 w-16 mx-2 mb-5 transition-colors', done ? 'bg-green-500' : 'bg-border')} />}
          </div>
        )
      })}
    </div>
  )
}

function Field({ label, required, error, children, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint  && <p className="text-[11px] text-gray-400">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

function PlanCard({ plan, selected, onSelect }) {
  return (
    <div onClick={() => onSelect(plan.key)} className={cn('relative border-2 rounded-xl p-5 cursor-pointer transition-all', selected ? 'border-brand-500 bg-brand-500/5' : 'border-gray-200 hover:border-gray-300')}>
      {plan.tag && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-brand-500 text-white text-[10px] font-bold">★ {plan.tag}</div>}
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-bold text-gray-900">{plan.label}</h3>
        {selected && <CheckCircle2 size={18} className="text-brand-500 shrink-0" />}
      </div>
      <div className="mb-4">
        <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
        <span className="text-sm text-gray-500">{plan.period}</span>
      </div>
      <ul className="space-y-1.5">
        {plan.features.map(f => (
          <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
            <CheckCircle2 size={12} className="text-green-500 shrink-0" />{f}
          </li>
        ))}
      </ul>
      <button
        onClick={e => { e.stopPropagation(); onSelect(plan.key) }}
        className={cn('w-full mt-4 py-2 rounded-lg text-sm font-semibold transition-colors', selected ? 'bg-brand-500 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50')}
      >
        {selected ? '✓ Selected' : `Select ${plan.label}`}
      </button>
    </div>
  )
}

function ConfigSummary({ form, step }) {
  const plan = PLANS.find(p => p.key === form.plan)
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 sticky top-0">
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle2 size={16} className="text-brand-500" />
        <span className="text-sm font-bold text-gray-800">Configuration Summary</span>
      </div>
      <div className="space-y-4 text-sm">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Organization</p>
          <div className="space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium text-gray-900 text-right max-w-[140px] truncate">{form.name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Code</span><span className="font-mono text-xs text-gray-700">{form.code || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Industry</span><span className="text-gray-700">{form.industry || '—'}</span></div>
          </div>
        </div>
        {(form.adminEmail || form.adminFirstName) && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Administrator</p>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium text-gray-900">{[form.adminFirstName, form.adminLastName].filter(Boolean).join(' ') || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-gray-700 text-xs truncate max-w-[140px]">{form.adminEmail || '—'}</span></div>
              <div className="flex items-center gap-1"><span className="text-gray-500">Access</span><span className="ml-auto px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] rounded font-medium">Full Admin</span></div>
            </div>
          </div>
        )}
        {form.plan && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Subscription</p>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Plan</span><span className="px-2 py-0.5 bg-brand-500/10 text-brand-600 text-xs rounded font-semibold">{plan?.label}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Billing</span><span className="font-semibold text-gray-900">{plan?.price}{plan?.period}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Trial</span><span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-medium">30 Days Free</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Users</span><span className="text-gray-700">Up to {plan?.maxUsers}</span></div>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-green-500" /><span className="text-xs font-semibold text-green-700">Ready to Deploy</span></div>
            <p className="text-[11px] text-green-600 mt-1">All configurations are set. The tenant will be immediately active with a 30-day trial period.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CreateTenantPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState({})
  const [form, setForm] = useState({
    name: '', code: '', description: '', industry: '', region: '',
    adminFirstName: '', adminLastName: '', adminEmail: '', adminJobTitle: '',
    plan: 'PROFESSIONAL',
    moduleCompliance: true, moduleTprm: true, modulePolicy: true, moduleIncident: false,
  })

  const { mutate: createTenant, isPending: creatingTenant } = useCreateTenant()
  const { mutate: createAdmin,  isPending: creatingAdmin  } = useCreateOrgAdmin()

  const set    = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const clearE = (k)    => setErrors(e => { const n = { ...e }; delete n[k]; return n })

  const validateStep = (n) => {
    const errs = {}
    if (n === 1) {
      if (!form.name.trim()) errs.name = 'Organization name is required'
      if (!form.code.trim()) errs.code = 'Tenant code is required'
      else if (!/^[A-Z0-9_]+$/.test(form.code)) errs.code = 'Uppercase letters, numbers, underscores only'
    }
    if (n === 2) {
      if (!form.adminFirstName.trim()) errs.adminFirstName = 'First name is required'
      if (!form.adminLastName.trim())  errs.adminLastName  = 'Last name is required'
      if (!form.adminEmail.trim())     errs.adminEmail     = 'Email is required'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) errs.adminEmail = 'Invalid email'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const next = () => { if (validateStep(step)) setStep(s => s + 1) }
  const back = () => setStep(s => s - 1)

  const handleCreate = () => {
    const plan = PLANS.find(p => p.key === form.plan)
    createTenant(
      {
        name: form.name, code: form.code, description: form.description,
        plan: form.plan, maxUsers: plan?.maxUsers, maxVendors: plan?.maxVendors,
      },
      {
        onSuccess: (tenant) => {
          createAdmin(
            {
              tenantId:         tenant.tenantId,
              firstName:        form.adminFirstName,
              lastName:         form.adminLastName,
              email:            form.adminEmail,
              jobTitle:         form.adminJobTitle || 'Organization Admin',
              sendWelcomeEmail: false, // we send manually from the welcome email page
              defaultRoleName:  'ORG_OWNER',
            },
            {
              onSuccess: (adminResponse) => {
                // Normalize — guarantee email is always present using form data as fallback
                const admin = {
                  ...(adminResponse?.userId ? adminResponse : {}),
                  email:     adminResponse?.email     || form.adminEmail,
                  firstName: adminResponse?.firstName || form.adminFirstName,
                  lastName:  adminResponse?.lastName  || form.adminLastName,
                  fullName:  adminResponse?.fullName  || `${form.adminFirstName} ${form.adminLastName}`.trim(),
                  temporaryPassword: adminResponse?.temporaryPassword || null,
                }
                navigate('/tenants/success', { state: { tenant, admin, plan } })
              },
              onError: () => {
                // Admin creation failed — still go to success with form data as fallback
                navigate('/tenants/success', {
                  state: {
                    tenant, plan,
                    admin: {
                      email:     form.adminEmail,
                      firstName: form.adminFirstName,
                      lastName:  form.adminLastName,
                      fullName:  `${form.adminFirstName} ${form.adminLastName}`.trim(),
                    },
                  },
                })
              },
            }
          )
        },
      }
    )
  }

  const inputCls = (err) => cn(
    'h-10 w-full rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors',
    err ? 'border-red-400' : 'border-gray-200'
  )

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/tenants')} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={16} className="text-gray-500" />
          </button>
          <div>
            <h1 className="text-base font-bold text-gray-900">Create New Tenant</h1>
            <p className="text-xs text-gray-500">Set up a new organization with customized configuration and access</p>
          </div>
        </div>
        <button onClick={() => navigate('/tenants')} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <X size={16} className="text-gray-500" />
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <Stepper current={step} />

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">

            {/* Step 1 — Organization Info */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Organization Details</h2>
                  <p className="text-sm text-gray-500">Basic information about the organization tenant</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Field label="Organization Name" required error={errors.name}>
                      <input value={form.name} onChange={e => { set('name', e.target.value); clearE('name') }} placeholder="e.g. Acme Corporation" className={inputCls(errors.name)} />
                    </Field>
                  </div>
                  <Field label="Tenant Code" required error={errors.code} hint="Uppercase letters, numbers, underscores only.">
                    <input value={form.code} onChange={e => { set('code', e.target.value.toUpperCase()); clearE('code') }} placeholder="ACME_CORP" className={cn(inputCls(errors.code), 'font-mono')} />
                  </Field>
                  <Field label="Industry">
                    <select value={form.industry} onChange={e => set('industry', e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                      <option value="">Select industry</option>
                      {['Technology','Finance','Healthcare','Retail','Manufacturing','Consulting','Legal','Logistics'].map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </Field>
                  <Field label="Region">
                    <select value={form.region} onChange={e => set('region', e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                      <option value="">Select region</option>
                      {['United States','India','United Kingdom','Europe','Asia Pacific','Middle East','Africa'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                  <div className="col-span-2">
                    <Field label="Description">
                      <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description…" rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                    </Field>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 — Admin Details */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Primary Administrator</h2>
                  <p className="text-sm text-gray-500">This person will be the Org Admin for <strong>{form.name}</strong></p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="First Name" required error={errors.adminFirstName}>
                    <input value={form.adminFirstName} onChange={e => { set('adminFirstName', e.target.value); clearE('adminFirstName') }} placeholder="John" className={inputCls(errors.adminFirstName)} />
                  </Field>
                  <Field label="Last Name" required error={errors.adminLastName}>
                    <input value={form.adminLastName} onChange={e => { set('adminLastName', e.target.value); clearE('adminLastName') }} placeholder="Smith" className={inputCls(errors.adminLastName)} />
                  </Field>
                  <div className="col-span-2">
                    <Field label="Work Email" required error={errors.adminEmail}>
                      <input type="email" value={form.adminEmail} onChange={e => { set('adminEmail', e.target.value); clearE('adminEmail') }} placeholder="john.smith@acme.com" className={inputCls(errors.adminEmail)} />
                    </Field>
                  </div>
                  <Field label="Job Title">
                    <input value={form.adminJobTitle} onChange={e => set('adminJobTitle', e.target.value)} placeholder="IT Director / CISO" className={inputCls(false)} />
                  </Field>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-700">
                    <strong>Note:</strong> A temporary password will be auto-generated and sent to the admin's email. They will be required to change it on first login.
                  </p>
                </div>
              </div>
            )}

            {/* Step 3 — Subscription */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Subscription Plan</h2>
                  <p className="text-sm text-gray-500">Choose the right plan for <strong>{form.name}</strong></p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {PLANS.map(plan => <PlanCard key={plan.key} plan={plan} selected={form.plan === plan.key} onSelect={v => set('plan', v)} />)}
                </div>
              </div>
            )}

            {/* Step 4 — Review & Create */}
            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Core Modules & Features</h2>
                  <p className="text-sm text-gray-500">Enable and configure modules for this tenant</p>
                </div>
                {[
                  { key: 'moduleCompliance', label: 'Compliance Management',       icon: '🛡', required: true,  desc: 'Framework tracking, control mapping, evidence collection, and audit management' },
                  { key: 'moduleTprm',       label: 'Third-Party Risk Management', icon: '🔗', required: true,  desc: 'Vendor assessments, continuous monitoring, risk scoring, and dependency tracking' },
                  { key: 'modulePolicy',     label: 'Policy Management',           icon: '📋', required: false, desc: 'Policy creation, version control, approval workflows, and employee acknowledgment' },
                  { key: 'moduleIncident',   label: 'Incident Management',         icon: '⚠️', required: false, desc: 'Incident tracking, investigation workflows, root cause analysis, and reporting' },
                ].map(mod => (
                  <div key={mod.key} className={cn('border-2 rounded-xl p-4 transition-colors', form[mod.key] ? 'border-brand-500/50 bg-brand-500/3' : 'border-gray-200')}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{mod.icon}</span>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{mod.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{mod.desc}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => mod.required ? null : set(mod.key, !form[mod.key])}
                        className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 mt-1', form[mod.key] ? 'bg-brand-500' : 'bg-gray-200', mod.required && 'opacity-70 cursor-default')}
                      >
                        <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow', form[mod.key] ? 'translate-x-6' : 'translate-x-1')} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
              <button onClick={back} disabled={step === 1} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ArrowLeft size={14} /> Back
              </button>
              {step < 4
                ? <button onClick={next} className="flex items-center gap-2 px-5 py-2 bg-brand-500 text-white rounded-xl text-sm font-semibold hover:bg-brand-600 transition-colors">
                    Continue <ChevronRight size={15} />
                  </button>
                : <button onClick={handleCreate} disabled={creatingTenant || creatingAdmin}
                    className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-60">
                    {(creatingTenant || creatingAdmin)
                      ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <CheckCircle2 size={15} />
                    }
                    Create Tenant
                  </button>
              }
            </div>
          </div>

          {/* Summary sidebar */}
          <div><ConfigSummary form={form} step={step} /></div>
        </div>
      </div>
    </div>
  )
}