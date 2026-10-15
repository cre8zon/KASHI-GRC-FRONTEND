/**
 * Create Tenant — modal, like every other create form in the tool.
 *
 * The steps, fields, labels, help text, required flags and dropdown options
 * come from ui_forms / ui_form_fields (form_key = tenant_create) and
 * ui_components / ui_options, rendered by DynamicForm. This file supplies only
 * what the tables cannot hold:
 *
 *   code      generated from the organisation name and checked live; the
 *             operator can override it, but never has to invent one
 *   plan      the plan cards, read live from the billing catalogue
 *   startAs   trial vs paid, with the plan's trial length on the button
 *   checks    name / code / admin email availability before leaving a step
 *   submit    one call to POST /v1/tenants/provision — tenant, administrator,
 *             subscription and the plan's features in a single transaction
 *
 * After a successful submit the modal shows the result in place (code, owner,
 * plan) instead of navigating to a separate page outside the app shell.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, CreditCard, Check, CheckCircle2, Copy, Mail, ArrowRight, Plus, Pencil, RotateCcw, Loader2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { DynamicForm } from '../forms/DynamicForm'
import { tenantsApi } from '../../api/tenants.api'
import { billingApi } from '../../api/billing.api'
import { formatMoney } from '../../lib/money'
import { cn } from '../../lib/cn'

const FORM_KEY = 'tenant_create'
const EMPTY_DEFAULTS = {}

// ─── Tenant code (custom control for the `code` field) ───────────────────────
//
// Auto mode: follows the organisation name. The server proposes the first free
// code (ACME_FINANCIAL, ACME_FINANCIAL_2 …) so two operators typing the same
// name cannot be handed the same code by the browser.
// Manual mode: the operator types their own; it is normalised as they type and
// checked against the server after a short pause.

const normalise = (s) => String(s || '').toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z0-9_]/g, '')
const CODE_RE = /^[A-Z][A-Z0-9_]{2,19}$/

function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

function TenantCodeField({ value, onChange, onBlur, values }) {
  const [manual, setManual] = useState(false)
  const [status, setStatus] = useState({ state: 'idle' })   // idle | checking | ok | taken | invalid
  const name = useDebounced(values?.name?.trim() || '')
  const typed = useDebounced(value || '')
  const seq = useRef(0)

  // Auto: derive from the name.
  useEffect(() => {
    if (manual) return
    if (name.length < 2) { onChange(''); setStatus({ state: 'idle' }); return }
    const n = ++seq.current
    setStatus({ state: 'checking' })
    tenantsApi.availability({ name }).then(r => {
      if (n !== seq.current) return
      if (r?.suggestedCode) { onChange(r.suggestedCode); setStatus({ state: 'ok' }) }
      else setStatus({ state: 'idle' })
    }).catch(() => n === seq.current && setStatus({ state: 'idle' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, manual])

  // Manual: check what was typed.
  useEffect(() => {
    if (!manual) return
    const c = normalise(typed)
    if (!c) { setStatus({ state: 'idle' }); return }
    if (!CODE_RE.test(c)) { setStatus({ state: 'invalid' }); return }
    const n = ++seq.current
    setStatus({ state: 'checking' })
    tenantsApi.availability({ code: c }).then(r => {
      if (n !== seq.current) return
      const err = r?.fieldErrors?.code
      setStatus(err ? { state: 'taken', msg: err, suggestion: r?.suggestedCode } : { state: 'ok' })
    }).catch(() => n === seq.current && setStatus({ state: 'idle' }))
  }, [typed, manual])

  return (
    <div className="space-y-1.5">
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <input
            value={value || ''}
            readOnly={!manual}
            onChange={e => onChange(normalise(e.target.value))}
            onBlur={onBlur}
            placeholder={manual ? 'ACME_FS' : 'Generated from the organisation name'}
            maxLength={20}
            className={cn('w-full h-9 rounded-md border border-border px-3 pr-8 text-sm font-mono tracking-wide focus:outline-none focus:ring-1 focus:ring-brand-500',
              manual ? 'bg-surface-raised text-text-primary' : 'bg-surface-overlay text-text-secondary cursor-default')}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            {status.state === 'checking' && <Loader2 size={13} className="animate-spin text-text-muted" />}
            {status.state === 'ok' && value && <CheckCircle2 size={13} className="text-status-pass-fg" />}
            {(status.state === 'taken' || status.state === 'invalid') && <AlertCircle size={13} className="text-status-fail-fg" />}
          </span>
        </div>
        {manual
          ? <button type="button" onClick={() => { setManual(false); seq.current++ }}
              className="flex items-center gap-1 px-2.5 rounded-md border border-border text-xs text-text-secondary hover:bg-surface-overlay">
              <RotateCcw size={12} /> Auto
            </button>
          : <button type="button" onClick={() => setManual(true)}
              className="flex items-center gap-1 px-2.5 rounded-md border border-border text-xs text-text-secondary hover:bg-surface-overlay">
              <Pencil size={12} /> Edit
            </button>}
      </div>
      {status.state === 'ok' && value && (
        <p className="text-[11px] text-status-pass-fg">{value} is available{manual ? '' : ' — generated from the name'}.</p>
      )}
      {status.state === 'invalid' && (
        <p className="text-[11px] text-status-fail-fg">Start with a letter; letters, digits or _ (3–20 characters).</p>
      )}
      {status.state === 'taken' && (
        <p className="text-[11px] text-status-fail-fg">
          {status.msg}{' '}
          {status.suggestion && (
            <button type="button" className="underline font-medium" onClick={() => onChange(status.suggestion)}>
              Use {status.suggestion}
            </button>
          )}
        </p>
      )}
    </div>
  )
}

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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" onBlur={onBlur}>
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
                {selected && <Check size={10} className="text-white" strokeWidth={3} />}
              </span>
            </div>
            <p className="text-sm font-mono text-text-primary">
              {p.priceDisplay === 'FREE' ? <span className="text-sm text-status-pass-fg">Free</span>
                : price ? <>{formatMoney(price.minor, price.currency)}<span className="text-[11px] text-text-muted"> / {price.per}</span></>
                : <span className="text-xs text-text-muted">Negotiated</span>}
              {p.audience === 'AUDIT_FIRM' && <span className="ml-2 text-[10px] font-sans px-1.5 py-0.5 rounded bg-status-tag-bg text-status-tag-fg align-middle">Audit firms</span>}
            </p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
              <span className="text-text-muted">Vendors</span><span className="text-text-primary text-right">{p.includedVendors ?? 'Unlimited'}</span>
              <span className="text-text-muted">Seats</span><span className="text-text-primary text-right">{p.includedUsers ?? 'Unlimited'}</span>
              <span className="text-text-muted">Modules</span><span className="text-text-primary text-right">{p.featureKeys?.length || '—'}</span>
              <span className="text-text-muted">Trial</span><span className="text-text-primary text-right">{p.trialDays ? `${p.trialDays} days` : '—'}</span>
            </div>
            {p.highlights?.length > 0 && (
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
  // A FREE plan (the audit-firm partner tier) starts ACTIVE at zero value on the
  // server; there is no trial and no contract to record. Keep the field on
  // TRIAL so the contract fields (shown only for ACTIVE) stay hidden.
  useEffect(() => { if (plan?.priceDisplay === 'FREE' && value !== 'TRIAL') onChange('TRIAL') }, [plan?.priceDisplay]) // eslint-disable-line react-hooks/exhaustive-deps
  if (plan?.priceDisplay === 'FREE') {
    return (
      <p className="text-xs text-text-secondary rounded-card border border-border bg-surface-overlay px-3 py-2.5">
        {plan.name} is free — the subscription starts active at zero value, with no trial and no contract to record.
      </p>
    )
  }
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

// ─── Result (shown in the modal after a successful create) ───────────────────

function CopyRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border-subtle last:border-0">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="flex items-center gap-2 min-w-0">
        <span className={cn('text-sm text-text-primary truncate', mono && 'font-mono')}>{value || '—'}</span>
        {value && (
          <button type="button" aria-label={`Copy ${label}`}
            onClick={() => { navigator.clipboard.writeText(String(value)); toast.success(`${label} copied`) }}
            className="p-1 rounded hover:bg-surface-overlay text-text-muted hover:text-text-primary">
            <Copy size={12} />
          </button>
        )}
      </span>
    </div>
  )
}

function CreatedResult({ result, onOpen, onWelcome, onAnother }) {
  const admin = result.admin || {}
  const adminName = admin.fullName || [admin.firstName, admin.lastName].filter(Boolean).join(' ')
  const trial = result.status === 'TRIAL'
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-status-pass-bg flex items-center justify-center shrink-0">
          <CheckCircle2 size={18} className="text-status-pass-fg" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{result.tenantName} is ready</p>
          <p className="text-xs text-text-muted">
            {trial ? 'Started on a free trial' : 'Started on a paid subscription'} of {result.planName || result.plan}.
            The plan’s modules are switched on.
          </p>
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface-raised px-4 py-1">
        <CopyRow label="Tenant code" value={result.code} mono />
        <CopyRow label="Owner" value={adminName} />
        <CopyRow label="Owner email" value={admin.email} />
        <CopyRow label="Login URL" value={`${window.location.origin}/auth/login`} mono />
      </div>

      <div className="flex items-start gap-2 p-3 rounded-card bg-status-warn-bg border border-status-warn-bd">
        <Mail size={14} className="text-status-warn-fg mt-0.5 shrink-0" />
        <p className="text-xs text-status-warn-fg">
          No email has been sent yet. Send the welcome email when the customer is ready to log in —
          it carries the temporary password.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        {onAnother ? <Button variant="ghost" size="md" icon={Plus} onClick={onAnother}>Create another</Button> : <span />}
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" icon={Mail} onClick={onWelcome}>Send welcome email</Button>
          <Button variant="primary" size="md" onClick={onOpen}>Open tenant <ArrowRight size={14} /></Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────

/**
 * initialValues  pre-fills the wizard (the Enquiries inbox passes the enquiry's
 *                provisionDefaults: company, contact, plan, channel …)
 * enquiryId      posted with the provision call; the enquiry is marked
 *                converted inside the same transaction
 * onCreated      called with the provision result after success
 */
export function CreateTenantModal({ open, onClose, initialValues = null, enquiryId = null, onCreated }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [result, setResult] = useState(null)
  const [formKey, setFormKey] = useState(0)   // bump to remount DynamicForm with a clean state

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['billing-plans'], queryFn: billingApi.plans, enabled: open,
  })
  const sellable = useMemo(() => (plans || []).filter(p => p.isActive), [plans])
  const planByCode = useMemo(() => Object.fromEntries(sellable.map(p => [p.code, p])), [sellable])

  // Fresh form every time the modal opens.
  useEffect(() => { if (open) { setResult(null); setFormKey(k => k + 1) } }, [open])

  const customFields = useMemo(() => ({
    code: (ctx) => <TenantCodeField {...ctx} />,
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
    // Only report problems for fields on, or before, the current step:
    // an admin email typed later must not block step 1.
    const onStep1 = ['name', 'code']
    return Object.fromEntries(Object.entries(errs).filter(([k]) => step > 1 || onStep1.includes(k)))
  }

  const formatReviewValue = (key, raw) => {
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
      enquiryId: enquiryId || null,
    }
    try {
      const r = await tenantsApi.provision(payload)
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setResult(r)
      onCreated?.(r)
    } catch (err) {
      // DynamicForm pins fieldErrors to their inputs and shows `message` on top.
      throw { fieldErrors: err?.details?.fieldErrors || err?.fieldErrors, message: err?.message }
    }
  }

  // Pre-fill: drop empty values so the form's own defaults (country IN, term 12 …) still apply.
  const defaults = useMemo(() => {
    if (!initialValues) return EMPTY_DEFAULTS
    const clean = (o) => Object.fromEntries(Object.entries(o)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? clean(v) : v]))
    return clean(initialValues)
  }, [initialValues])

  const tenantState = result && {
    tenantId: result.tenantId, name: result.tenantName, code: result.code, plan: result.plan,
    status: result.status, maxUsers: result.maxUsers, maxVendors: result.maxVendors, createdAt: result.createdAt,
  }

  return (
    <Modal open={open} onClose={onClose} size="xl"
      title={result ? 'Tenant created' : 'Create tenant'}
      subtitle={result ? null : 'Organisation, owner, subscription and the plan’s modules — created together or not at all'}>
      {result
        ? <CreatedResult
            result={result}
            onOpen={() => { onClose(); navigate(`/tenants/${result.tenantId}`) }}
            onWelcome={() => { onClose(); navigate(`/tenants/${result.tenantId}/welcome-email`, { state: { tenant: tenantState, admin: result.admin } }) }}
            onAnother={enquiryId ? null : () => { setResult(null); setFormKey(k => k + 1) }}
          />
        : <DynamicForm
            key={formKey}
            formKey={FORM_KEY}
            defaultValues={defaults}
            onSubmit={onSubmit}
            customFields={customFields}
            onStepValidate={onStepValidate}
            formatReviewValue={formatReviewValue}
            submitLabel={(vals) => vals?.startAs === 'ACTIVE' ? 'Create tenant & subscription' : 'Create tenant with free trial'}
          />}
    </Modal>
  )
}

export default CreateTenantModal
