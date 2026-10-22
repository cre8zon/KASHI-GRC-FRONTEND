/**
 * Create Tenant — a DB-driven wizard, the same way vendor onboarding is.
 *
 * The steps, fields, labels, help text, required flags and dropdown options
 * all come from ui_forms / ui_form_fields (form_key = tenant_create) and
 * ui_components / ui_options, rendered by DynamicForm. This page supplies only
 * what the tables cannot hold:
 *
 *   plan      the plan cards, read live from the billing catalogue
 *   startAs   trial vs paid, with the plan's trial length on the button
 *   checks    name / code / admin email availability before leaving a step
 *   submit    one call to POST /v1/tenants/provision — tenant, administrator,
 *             subscription and the plan's features in a single transaction,
 *             so a failure never leaves a half-created tenant behind
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, X, Building2, UserCog, CreditCard, ShieldCheck, Sparkles, Clock, BadgeCheck, Check } from 'lucide-react'
import { DynamicForm } from '../../../components/forms/DynamicForm'
import { tenantsApi } from '../../../api/tenants.api'
import { billingApi } from '../../../api/billing.api'
import { formatMoney } from '../../../lib/money'
import { cn } from '../../../lib/cn'

const FORM_KEY = 'tenant_create'

// ─── Plan picker (custom control for the `plan` field) ───────────────────────

function listPrice(plan, currency = 'INR') {
  const annual = plan.prices?.find(p => p.isActive && p.currency === currency && p.billingInterval === 'ANNUAL')
  if (annual) return { minor: annual.unitAmountMinor, per: 'year', currency }
  const monthly = plan.prices?.find(p => p.isActive && p.currency === currency && p.billingInterval === 'MONTHLY')
  if (monthly) return { minor: monthly.unitAmountMinor, per: 'month', currency }
  return null
}

function PlanPicker({ value, onChange, onBlur, plans, loading }) {
  if (loading) return <p className="text-xs text-text-muted py-4">Loading plans…</p>
  if (!plans.length) {
    return (
      <p className="text-xs text-status-warn-fg py-3">
        No sellable plans in the catalogue. Add one under Subscription &amp; Billing → Pricing Plans.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3" onBlur={onBlur}>
      {plans.map(p => {
        const selected = value === p.code
        const price = listPrice(p)
        return (
          <button key={p.code} type="button" onClick={() => onChange(p.code)}
            className={cn('text-left rounded-card border p-4 transition-all flex flex-col gap-2',
              selected ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                       : 'border-border bg-surface-raised hover:border-brand-500/40')}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-text-primary">{p.name}</p>
                {p.tagline && <p className="text-[11px] text-text-muted leading-snug">{p.tagline}</p>}
              </div>
              <span className={cn('w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5',
                selected ? 'bg-brand-500 border-brand-500' : 'border-border')}>
                {selected && <Check size={10} className="text-brand-on" strokeWidth={3} />}
              </span>
            </div>
            <p className="text-sm font-mono text-text-primary">
              {price ? <>{formatMoney(price.minor, price.currency)}<span className="text-[11px] text-text-muted"> / {price.per}</span></>
                     : <span className="text-xs text-text-muted">Negotiated</span>}
            </p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
              <span className="text-text-muted">Vendors</span><span className="text-text-primary text-right">{p.includedVendors ?? 'Unlimited'}</span>
              <span className="text-text-muted">Seats</span><span className="text-text-primary text-right">{p.includedUsers ?? 'Unlimited'}</span>
              <span className="text-text-muted">Modules</span><span className="text-text-primary text-right">{p.featureKeys.length || '—'}</span>
              <span className="text-text-muted">Trial</span><span className="text-text-primary text-right">{p.trialDays ? `${p.trialDays} days` : '—'}</span>
            </div>
            {p.highlights.length > 0 && (
              <ul className="text-[11px] text-text-secondary space-y-0.5 pt-1 border-t border-border/60">
                {p.highlights.slice(0, 4).map((h, i) => <li key={i} className="flex gap-1.5"><Check size={11} className="text-status-pass-fg mt-0.5 shrink-0" />{h}</li>)}
              </ul>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Trial vs paid (custom control for the `startAs` field) ──────────────────

function StartAsPicker({ value, onChange, plan }) {
  const opts = [
    { v: 'TRIAL',  icon: Clock,      title: 'Free trial', sub: plan?.trialDays ? `${plan.trialDays} days on ${plan.name}` : 'Trial length from the plan' },
    { v: 'ACTIVE', icon: CreditCard, title: 'Paid subscription', sub: 'Record the signed contract value and term' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {opts.map(o => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={cn('flex items-start gap-3 rounded-card border p-3 text-left transition-all',
            value === o.v ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500' : 'border-border bg-surface-raised hover:border-brand-500/40')}>
          <o.icon size={16} className={value === o.v ? 'text-brand-ink mt-0.5' : 'text-text-muted mt-0.5'} />
          <span><span className="block text-sm font-medium text-text-primary">{o.title}</span>
            <span className="block text-[11px] text-text-muted">{o.sub}</span></span>
        </button>
      ))}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CreateTenantPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: plans = [], isLoading: plansLoading } = useQuery({ queryKey: ['billing-plans'], queryFn: billingApi.plans })
  const sellable = useMemo(() => (plans || []).filter(p => p.isActive), [plans])
  const planByCode = useMemo(() => Object.fromEntries(sellable.map(p => [p.code, p])), [sellable])

  const customFields = useMemo(() => ({
    plan: (ctx) => <PlanPicker {...ctx} plans={sellable} loading={plansLoading} />,
    startAs: (ctx) => <StartAsPicker {...ctx} plan={planByCode[ctx.values?.plan]} />,
  }), [sellable, plansLoading, planByCode])

  // Server checks before leaving a step. Keys match the form's field keys.
  const onStepValidate = async (step, values) => {
    const params = {}
    if (values?.name) params.name = values.name
    if (values?.code) params.code = values.code
    if (values?.admin?.email) params.adminEmail = values.admin.email
    if (!Object.keys(params).length) return null
    const r = await tenantsApi.availability(params)
    const errs = r?.fieldErrors || {}
    // Only report problems for fields that are on, or before, the current step:
    // an admin email typed later must not block step 1.
    const onStep1 = ['name', 'code']
    return Object.fromEntries(Object.entries(errs).filter(([k]) => step > 1 || onStep1.includes(k)))
  }

  const formatReviewValue = (key, raw, values) => {
    if (key === 'plan') return planByCode[raw]?.name ?? raw
    if (key === 'startAs') return raw === 'ACTIVE' ? 'Paid subscription' : raw === 'TRIAL' ? 'Free trial' : raw
    if (key === 'code' && raw) return String(raw).trim().toUpperCase()
    if (key === 'contractValue' && raw !== '' && raw != null) return formatMoney(Math.round(Number(raw) * 100), 'INR')
    return undefined
  }

  const onSubmit = async (v) => {
    const truthy = (x) => x === true || x === 'true' || x === 1 || x === '1'
    const payload = {
      name: v.name, code: String(v.code || '').trim().toUpperCase(),
      legalName: v.legalName, description: v.description,
      country: v.country, industry: v.industry, employeeBand: v.employeeBand,
      admin: {
        firstName: v.admin?.firstName, lastName: v.admin?.lastName,
        email: v.admin?.email, jobTitle: v.admin?.jobTitle,
      },
      plan: v.plan, startAs: v.startAs || 'TRIAL',
      contractValue: v.startAs === 'ACTIVE' && v.contractValue !== '' && v.contractValue != null ? Number(v.contractValue) : null,
      termMonths: v.startAs === 'ACTIVE' && v.termMonths ? Number(v.termMonths) : null,
      billingInterval: v.startAs === 'ACTIVE' ? (v.billingInterval || 'ANNUAL') : null,
      currency: 'INR',
      salesMotion: v.salesMotion || null,
      acquisitionChannel: v.acquisitionChannel || null,
      isAuditFirm: truthy(v.isAuditFirm),
    }
    try {
      const r = await tenantsApi.provision(payload)
      qc.invalidateQueries({ queryKey: ['tenants'] })
      const plan = planByCode[r.plan]
      const price = plan ? listPrice(plan) : null
      navigate('/tenants/success', {
        state: {
          tenant: { tenantId: r.tenantId, name: r.tenantName, code: r.code, plan: r.plan, status: r.status,
                    maxUsers: r.maxUsers, maxVendors: r.maxVendors, createdAt: r.createdAt },
          admin: r.admin,
          plan: { label: r.planName, price: price ? formatMoney(price.minor, price.currency) : null,
                  period: price ? ` / ${price.per}` : '', maxUsers: r.maxUsers },
        },
      })
    } catch (err) {
      // DynamicForm pins fieldErrors to their inputs and shows `message` on top.
      throw { fieldErrors: err?.details?.fieldErrors || err?.fieldErrors, message: err?.message }
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-surface-raised">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/tenants')} aria-label="Back to tenants"
            className="h-7 w-7 flex items-center justify-center rounded-card hover:bg-surface-overlay transition-colors">
            <ArrowLeft size={15} className="text-text-muted" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-text-primary">Create tenant</h1>
            <p className="text-[11px] text-text-muted">Provision an organisation, its first administrator and its subscription</p>
          </div>
        </div>
        <button onClick={() => navigate('/tenants')} aria-label="Close"
          className="h-7 w-7 flex items-center justify-center rounded-card hover:bg-surface-overlay transition-colors">
          <X size={15} className="text-text-muted" />
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-card border border-border glass-card p-6 shadow-elevated">
          <DynamicForm
            formKey={FORM_KEY}
            onSubmit={onSubmit}
            customFields={customFields}
            onStepValidate={onStepValidate}
            formatReviewValue={formatReviewValue}
            submitLabel={(vals) => vals?.startAs === 'ACTIVE' ? 'Create tenant & subscription' : 'Create tenant with free trial'}
          />
        </div>

        <aside className="lg:col-span-4 space-y-4">
          <div className="rounded-card border border-border glass-card p-4">
            <p className="text-xs font-semibold text-text-primary mb-3">What happens when you create</p>
            <ol className="space-y-3">
              {[
                { icon: Building2,  t: 'Organisation is created', d: 'With a permanent tenant code. Audit firms use this code to request access.' },
                { icon: UserCog,    t: 'First administrator is added', d: 'One login per email across KashiGRC. Credentials appear on the next screen.' },
                { icon: CreditCard, t: 'Subscription is recorded', d: 'Trial or paid, from the plan catalogue. Revenue metrics start from this row.' },
                { icon: Sparkles,   t: "Plan's modules are switched on", d: 'Every licensed module the plan includes. Extras can be granted later on the tenant.' },
                { icon: BadgeCheck, t: 'Audit-firm verification (optional)', d: 'Opens a draft only. Audit-firm access needs evidence and the firm’s email confirmation.' },
              ].map((s, i) => (
                <li key={i} className="flex gap-2.5">
                  <s.icon size={14} className="text-brand-ink mt-0.5 shrink-0" />
                  <span><span className="block text-xs font-medium text-text-primary">{s.t}</span>
                    <span className="block text-[11px] text-text-muted leading-snug">{s.d}</span></span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-card border border-border glass-card p-4 flex gap-2.5">
            <ShieldCheck size={14} className="text-status-pass-fg mt-0.5 shrink-0" />
            <p className="text-[11px] text-text-muted leading-snug">
              All-or-nothing: if any part fails — a code or email already in use — nothing is created and the field is highlighted.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}