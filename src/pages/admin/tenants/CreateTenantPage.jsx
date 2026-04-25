import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateTenant, useCreateOrgAdmin } from '../../../hooks/useTenants'
import {
  Building2, User, CreditCard, Puzzle, CheckCircle2,
  ChevronRight, ArrowLeft, X, Shield, Zap, Globe,
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { Card, CardBody } from '../../../components/ui/Card'
import { Input }          from '../../../components/ui/Input'
import { Button }         from '../../../components/ui/Button'

const STEPS = [
  { n: 1, label: 'Organization', icon: Building2 },
  { n: 2, label: 'Admin',        icon: User       },
  { n: 3, label: 'Subscription', icon: CreditCard },
  { n: 4, label: 'Modules',      icon: Puzzle     },
]

const PLANS = [
  {
    key: 'STARTER', label: 'Starter', price: '$99', period: '/mo',
    tag: null, maxUsers: 50, maxVendors: 100,
    features: ['Up to 50 users', '5 Compliance frameworks', 'Email support', '10 GB storage', 'Basic reporting'],
  },
  {
    key: 'PROFESSIONAL', label: 'Professional', price: '$299', period: '/mo',
    tag: 'Most Popular', maxUsers: 200, maxVendors: 500,
    features: ['Up to 200 users', 'All frameworks', 'Priority support', '100 GB storage', 'Advanced analytics', 'API access', 'Automated workflows'],
  },
  {
    key: 'ENTERPRISE', label: 'Enterprise', price: 'Custom', period: '',
    tag: null, maxUsers: 9999, maxVendors: 9999,
    features: ['Unlimited users', 'Custom frameworks', 'Dedicated support', 'Unlimited storage', 'White-label', 'SSO & Security', 'Dedicated manager'],
  },
]

const MODULES = [
  { key: 'moduleCompliance', label: 'Compliance Management',       icon: Shield,  required: true,  desc: 'Framework tracking, control mapping, evidence collection' },
  { key: 'moduleTprm',       label: 'Third-Party Risk Management', icon: Globe,   required: true,  desc: 'Vendor assessments, risk scoring, dependency tracking'     },
  { key: 'modulePolicy',     label: 'Policy Management',           icon: Puzzle,  required: false, desc: 'Policy creation, approval workflows, acknowledgment'       },
  { key: 'moduleIncident',   label: 'Incident Management',         icon: Zap,     required: false, desc: 'Incident tracking, investigation, root cause analysis'     },
]

// ─── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ current }) {
  return (
    <div className="flex items-center mb-8">
      {STEPS.map((step, i) => {
        const done   = step.n < current
        const active = step.n === current
        const Icon   = step.icon
        return (
          <div key={step.n} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all',
                done   ? 'bg-green-500 border-green-500'
                : active ? 'bg-brand-500 border-brand-500'
                : 'bg-surface-raised border-border'
              )}>
                {done
                  ? <CheckCircle2 size={16} className="text-white" strokeWidth={2.5} />
                  : <Icon size={15} className={active ? 'text-white' : 'text-text-muted'} />}
              </div>
              <span className={cn(
                'text-[11px] font-medium whitespace-nowrap',
                active ? 'text-brand-400' : done ? 'text-green-400' : 'text-text-muted'
              )}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn(
                'h-0.5 w-16 mx-2 mb-5 transition-colors',
                done ? 'bg-green-500' : 'bg-border'
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Summary sidebar ──────────────────────────────────────────────────────────
function ConfigSummary({ form, step }) {
  const plan = PLANS.find(p => p.key === form.plan)
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4 sticky top-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={14} className="text-brand-400" />
        <span className="text-xs font-bold text-text-primary">Configuration Summary</span>
      </div>

      <SummarySection title="Organization">
        <SummaryRow label="Name"     value={form.name     || '—'} />
        <SummaryRow label="Code"     value={form.code     || '—'} mono />
        <SummaryRow label="Industry" value={form.industry || '—'} />
      </SummarySection>

      {(form.adminEmail || form.adminFirstName) && (
        <SummarySection title="Administrator">
          <SummaryRow label="Name"  value={[form.adminFirstName, form.adminLastName].filter(Boolean).join(' ') || '—'} />
          <SummaryRow label="Email" value={form.adminEmail || '—'} truncate />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-muted">Access</span>
            <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px] font-medium border border-green-500/20">
              Full Admin
            </span>
          </div>
        </SummarySection>
      )}

      {form.plan && (
        <SummarySection title="Subscription">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-muted">Plan</span>
            <span className="px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 text-[10px] font-semibold border border-brand-500/20">
              {plan?.label}
            </span>
          </div>
          <SummaryRow label="Billing" value={`${plan?.price}${plan?.period}`} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-muted">Trial</span>
            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-medium border border-amber-500/20">
              30 Days Free
            </span>
          </div>
        </SummarySection>
      )}

      {step === 4 && (
        <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 size={12} className="text-green-400" />
            <span className="text-xs font-semibold text-green-400">Ready to Deploy</span>
          </div>
          <p className="text-[11px] text-text-muted">
            Tenant will be immediately active with a 30-day trial.
          </p>
        </div>
      )}
    </div>
  )
}

function SummarySection({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">{title}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function SummaryRow({ label, value, mono, truncate }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-text-muted shrink-0">{label}</span>
      <span className={cn(
        'text-[11px] text-text-primary font-medium text-right',
        mono && 'font-mono',
        truncate && 'truncate max-w-[130px]'
      )}>
        {value}
      </span>
    </div>
  )
}

// ─── Plan card ────────────────────────────────────────────────────────────────
function PlanCard({ plan, selected, onSelect }) {
  return (
    <div onClick={() => onSelect(plan.key)}
      className={cn(
        'relative rounded-xl border-2 p-4 cursor-pointer transition-all flex flex-col',
        selected
          ? 'border-brand-500 bg-brand-500/5'
          : 'border-border bg-surface-raised hover:border-brand-500/40'
      )}>
      {plan.tag && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-brand-500 text-white text-[10px] font-bold whitespace-nowrap">
          ★ {plan.tag}
        </div>
      )}
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-bold text-sm text-text-primary">{plan.label}</h3>
        {selected && <CheckCircle2 size={16} className="text-brand-400 shrink-0" />}
      </div>
      <div className="mb-3">
        <span className="text-2xl font-bold text-text-primary">{plan.price}</span>
        <span className="text-xs text-text-muted">{plan.period}</span>
      </div>
      <ul className="flex flex-col gap-1.5 flex-1">
        {plan.features.map(f => (
          <li key={f} className="flex items-start gap-1.5 text-xs text-text-secondary">
            <CheckCircle2 size={11} className="text-green-400 shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={e => { e.stopPropagation(); onSelect(plan.key) }}
        className={cn(
          'w-full mt-4 py-2 rounded-lg text-xs font-semibold transition-colors',
          selected
            ? 'bg-brand-500 text-white'
            : 'border border-border text-text-secondary hover:text-text-primary hover:bg-surface-overlay'
        )}>
        {selected ? '✓ Selected' : `Select ${plan.label}`}
      </button>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CreateTenantPage() {
  const navigate = useNavigate()
  const [step,   setStep]   = useState(1)
  const [errors, setErrors] = useState({})
  const [form,   setForm]   = useState({
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
      else if (!/^[A-Z0-9_]+$/.test(form.code)) errs.code = 'Uppercase, numbers, underscores only'
    }
    if (n === 2) {
      if (!form.adminFirstName.trim()) errs.adminFirstName = 'First name is required'
      if (!form.adminLastName.trim())  errs.adminLastName  = 'Last name is required'
      if (!form.adminEmail.trim())     errs.adminEmail     = 'Email is required'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) errs.adminEmail = 'Invalid email'
    }
    setErrors(errs)
    return !Object.keys(errs).length
  }

  const next = () => { if (validateStep(step)) setStep(s => s + 1) }
  const back = () => setStep(s => s - 1)

  const handleCreate = () => {
    const plan = PLANS.find(p => p.key === form.plan)
    createTenant(
      { name: form.name, code: form.code, description: form.description, plan: form.plan, maxUsers: plan?.maxUsers, maxVendors: plan?.maxVendors },
      {
        onSuccess: (tenant) => {
          createAdmin(
            { tenantId: tenant.tenantId, firstName: form.adminFirstName, lastName: form.adminLastName, email: form.adminEmail, jobTitle: form.adminJobTitle || 'Organization Admin', sendWelcomeEmail: false, defaultRoleName: 'ORG_OWNER' },
            {
              onSuccess: (adminResponse) => {
                const admin = { ...(adminResponse?.userId ? adminResponse : {}), email: adminResponse?.email || form.adminEmail, firstName: adminResponse?.firstName || form.adminFirstName, lastName: adminResponse?.lastName || form.adminLastName, fullName: adminResponse?.fullName || `${form.adminFirstName} ${form.adminLastName}`.trim(), temporaryPassword: adminResponse?.temporaryPassword || null }
                navigate('/tenants/success', { state: { tenant, admin, plan } })
              },
              onError: () => navigate('/tenants/success', { state: { tenant, plan, admin: { email: form.adminEmail, firstName: form.adminFirstName, lastName: form.adminLastName, fullName: `${form.adminFirstName} ${form.adminLastName}`.trim() } } }),
            }
          )
        },
      }
    )
  }

  const selectCls = 'h-10 w-full rounded-lg border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500'

  return (
    <div className="min-h-screen bg-surface">
      {/* Top bar — matches app chrome */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-surface-raised">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/tenants')}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-surface-overlay transition-colors">
            <ArrowLeft size={15} className="text-text-muted" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-text-primary">Create New Tenant</h1>
            <p className="text-[11px] text-text-muted">Set up a new organization with custom configuration</p>
          </div>
        </div>
        <button onClick={() => navigate('/tenants')}
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-surface-overlay transition-colors">
          <X size={15} className="text-text-muted" />
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <Stepper current={step} />

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">

            {/* Step 1 — Organization */}
            {step === 1 && (
              <Card>
                <CardBody>
                  <div className="mb-5">
                    <h2 className="text-base font-bold text-text-primary">Organization Details</h2>
                    <p className="text-xs text-text-muted mt-0.5">Basic information about the organization tenant</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Input label="Organization Name *" value={form.name}
                        onChange={e => { set('name', e.target.value); clearE('name') }}
                        placeholder="e.g. Acme Corporation" error={errors.name} />
                    </div>
                    <Input label="Tenant Code *" value={form.code}
                      onChange={e => { set('code', e.target.value.toUpperCase()); clearE('code') }}
                      placeholder="ACME_CORP" error={errors.code}
                      hint="Uppercase, numbers, underscores only" />
                    <div>
                      <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide block mb-1.5">Industry</label>
                      <select value={form.industry} onChange={e => set('industry', e.target.value)} className={selectCls}>
                        <option value="">Select industry</option>
                        {['Technology','Finance','Healthcare','Retail','Manufacturing','Consulting','Legal','Logistics'].map(i => <option key={i}>{i}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide block mb-1.5">Region</label>
                      <select value={form.region} onChange={e => set('region', e.target.value)} className={selectCls}>
                        <option value="">Select region</option>
                        {['United States','India','United Kingdom','Europe','Asia Pacific','Middle East','Africa'].map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide block mb-1.5">Description</label>
                      <textarea value={form.description} onChange={e => set('description', e.target.value)}
                        placeholder="Brief description…" rows={3}
                        className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
                    </div>
                  </div>
                </CardBody>
              </Card>
            )}

            {/* Step 2 — Admin */}
            {step === 2 && (
              <Card>
                <CardBody>
                  <div className="mb-5">
                    <h2 className="text-base font-bold text-text-primary">Primary Administrator</h2>
                    <p className="text-xs text-text-muted mt-0.5">This person will be the Org Admin for <strong className="text-text-secondary">{form.name}</strong></p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="First Name *" value={form.adminFirstName}
                      onChange={e => { set('adminFirstName', e.target.value); clearE('adminFirstName') }}
                      placeholder="John" error={errors.adminFirstName} />
                    <Input label="Last Name *" value={form.adminLastName}
                      onChange={e => { set('adminLastName', e.target.value); clearE('adminLastName') }}
                      placeholder="Smith" error={errors.adminLastName} />
                    <div className="col-span-2">
                      <Input label="Work Email *" type="email" value={form.adminEmail}
                        onChange={e => { set('adminEmail', e.target.value); clearE('adminEmail') }}
                        placeholder="john.smith@acme.com" error={errors.adminEmail} />
                    </div>
                    <Input label="Job Title" value={form.adminJobTitle}
                      onChange={e => set('adminJobTitle', e.target.value)}
                      placeholder="IT Director / CISO" />
                  </div>
                  <div className="mt-4 p-3 rounded-lg bg-brand-500/5 border border-brand-500/20">
                    <p className="text-xs text-text-secondary">
                      <span className="text-brand-400 font-semibold">Note:</span> A temporary password will be auto-generated. The admin will be required to change it on first login.
                    </p>
                  </div>
                </CardBody>
              </Card>
            )}

            {/* Step 3 — Subscription */}
            {step === 3 && (
              <div>
                <div className="mb-4">
                  <h2 className="text-base font-bold text-text-primary">Subscription Plan</h2>
                  <p className="text-xs text-text-muted mt-0.5">Choose the right plan for <strong className="text-text-secondary">{form.name}</strong></p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {PLANS.map(plan => (
                    <PlanCard key={plan.key} plan={plan}
                      selected={form.plan === plan.key}
                      onSelect={v => set('plan', v)} />
                  ))}
                </div>
              </div>
            )}

            {/* Step 4 — Modules */}
            {step === 4 && (
              <div>
                <div className="mb-4">
                  <h2 className="text-base font-bold text-text-primary">Core Modules</h2>
                  <p className="text-xs text-text-muted mt-0.5">Enable modules for this tenant</p>
                </div>
                <div className="flex flex-col gap-3">
                  {MODULES.map(mod => {
                    const Icon = mod.icon
                    return (
                      <div key={mod.key}
                        className={cn(
                          'rounded-xl border-2 p-4 transition-colors',
                          form[mod.key]
                            ? 'border-brand-500/40 bg-brand-500/5'
                            : 'border-border bg-surface-raised'
                        )}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                              form[mod.key] ? 'bg-brand-500/15' : 'bg-surface-overlay'
                            )}>
                              <Icon size={15} className={form[mod.key] ? 'text-brand-400' : 'text-text-muted'} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-text-primary">{mod.label}</p>
                              <p className="text-xs text-text-muted mt-0.5">{mod.desc}</p>
                              {mod.required && (
                                <span className="text-[10px] text-brand-400 font-medium">Required</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => mod.required ? null : set(mod.key, !form[mod.key])}
                            className={cn(
                              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 mt-1',
                              form[mod.key] ? 'bg-brand-500' : 'bg-border',
                              mod.required && 'cursor-default opacity-70'
                            )}>
                            <span className={cn(
                              'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm',
                              form[mod.key] ? 'translate-x-4' : 'translate-x-0.5'
                            )} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-6 pt-5 border-t border-border">
              <Button variant="ghost" size="sm" icon={ArrowLeft}
                onClick={back} disabled={step === 1}>
                Back
              </Button>
              {step < 4
                ? <Button size="sm" onClick={next}>
                    Continue <ChevronRight size={14} className="ml-1" />
                  </Button>
                : <Button size="sm" loading={creatingTenant || creatingAdmin}
                    onClick={handleCreate}
                    className="bg-green-600 hover:bg-green-700">
                    <CheckCircle2 size={14} className="mr-1.5" />
                    Create Tenant
                  </Button>
              }
            </div>
          </div>

          {/* Summary */}
          <ConfigSummary form={form} step={step} />
        </div>
      </div>
    </div>
  )
}