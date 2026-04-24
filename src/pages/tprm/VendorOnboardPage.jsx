import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowsApi } from '../../api/workflows.api'
import {
  ArrowLeft, Building2, Shield, User, ChevronRight,
  CheckCircle2, AlertCircle, Loader2, Info,
} from 'lucide-react'
import { vendorsApi } from '../../api/vendors.api'
import { Button }    from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Input'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

// ─── Risk factor options ──────────────────────────────────────────────────────
const RISK_CLASSIFICATIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const CRITICALITY_OPTIONS   = ['LOW', 'MEDIUM', 'HIGH', 'MISSION_CRITICAL']
const DATA_ACCESS_OPTIONS   = ['NONE', 'PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']
const INDUSTRIES = [
  'Technology', 'Finance', 'Healthcare', 'Manufacturing', 'Retail',
  'Logistics', 'Legal', 'Consulting', 'Telecommunications', 'Energy', 'Other',
]
const WORKFLOW_ENTITY_TYPE = 'VENDOR'

// ─── Step indicator ───────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Vendor Details',  icon: Building2 },
  { id: 2, label: 'Risk Assessment', icon: Shield },
  { id: 3, label: 'Primary Contact', icon: User },
  { id: 4, label: 'Review',          icon: CheckCircle2 },
]

const useActiveWorkflows = () => useQuery({
  queryKey: ['active-workflows'],
  queryFn:  () => workflowsApi.blueprints.list({ skip: 0, take: 100 }),
  staleTime: 5 * 60 * 1000,
})

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const done   = current > step.id
        const active = current === step.id
        const Icon   = step.icon
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors',
                done   ? 'bg-green-500/20 border-green-500/40 text-green-400' :
                active ? 'bg-brand-500/20 border-brand-500/40 text-brand-400' :
                         'bg-surface-overlay border-border text-text-muted'
              )}>
                {done ? <CheckCircle2 size={14} /> : <Icon size={14} />}
              </div>
              <span className={cn('text-[10px] font-medium whitespace-nowrap',
                active ? 'text-brand-400' : done ? 'text-text-secondary' : 'text-text-muted')}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('h-px flex-1 mx-2 mb-5 transition-colors',
                current > step.id ? 'bg-green-500/40' : 'bg-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Field helpers ────────────────────────────────────────────────────────────
function SelectField({ label, value, onChange, options, error, required }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className={cn(
          'h-8 w-full rounded-md border bg-surface-raised px-3 text-sm text-text-primary',
          'focus:outline-none focus:ring-1 focus:ring-brand-500 appearance-none',
          error ? 'border-red-500/50' : 'border-border'
        )}>
        <option value="">Select…</option>
        {options.map(o => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VendorOnboardPage() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState({})
  const { data: workflowData } = useActiveWorkflows()

  // Filter to only active workflows matching VENDOR entity type
  const activeWorkflows = (workflowData?.items || [])
    .filter(w => (w.isActive ?? w.active) && w.entityType === 'VENDOR')

  // Form state
  const [form, setForm] = useState({
    // Step 1 — Vendor Details
    name:               '',
    legalName:          '',
    registrationNumber: '',
    website:            '',
    industry:           '',
    country:            '',
    servicesProvided:   '',

    // Step 2 — Risk
    riskClassification: '',
    criticality:        '',
    dataAccessLevel:    '',
    workflowId:         '',   // which TPRM workflow to use

    // Step 3 — Primary Contact (becomes VENDOR_VRM)
    contactFirstName:   '',
    contactLastName:    '',
    contactEmail:       '',
    contactJobTitle:    '',
  })

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const { mutate: onboard, isPending } = useMutation({
    mutationFn: (payload) => vendorsApi.onboard(payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      toast.success('Vendor onboarded — welcome email sent to primary contact')
      navigate(`/tprm/vendors/${data?.data?.vendorId || data?.vendorId}`)
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Onboarding failed'),
  })

  // ── Validation per step ──────────────────────────────────────────────────
  const validate = (stepNum) => {
    const e = {}
    if (stepNum === 1) {
      if (!form.name.trim())     e.name     = 'Required'
      if (!form.industry)        e.industry = 'Required'
      if (!form.country.trim())  e.country  = 'Required'
    }
    if (stepNum === 2) {
      if (!form.riskClassification) e.riskClassification = 'Required'
      if (!form.criticality)        e.criticality        = 'Required'
      if (!form.dataAccessLevel)    e.dataAccessLevel    = 'Required'
    }
    if (stepNum === 3) {
      if (!form.contactFirstName.trim()) e.contactFirstName = 'Required'
      if (!form.contactLastName.trim())  e.contactLastName  = 'Required'
      if (!form.contactEmail.trim())     e.contactEmail     = 'Required'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail))
        e.contactEmail = 'Invalid email'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = () => { if (validate(step)) setStep(s => s + 1) }
  const back = () => { setErrors({}); setStep(s => s - 1) }

  const submit = () => {
    if (!validate(3)) return
    onboard({
      name:               form.name,
      legalName:          form.legalName || form.name,
      registrationNumber: form.registrationNumber,
      website:            form.website,
      industry:           form.industry,
      country:            form.country,
      servicesProvided:   form.servicesProvided,
      riskClassification: form.riskClassification,
      criticality:        form.criticality,
      dataAccessLevel:    form.dataAccessLevel,
      workflowId:         form.workflowId ? parseInt(form.workflowId) : undefined,
      primaryContactEmail: form.contactEmail,
      // Primary contact details — backend creates VENDOR_VRM user and sends invite
      primaryContact: {
        firstName: form.contactFirstName,
        lastName:  form.contactLastName,
        email:     form.contactEmail,
        jobTitle:  form.contactJobTitle,
      },
    })
  }

  return (
    <div className="min-h-full bg-surface p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" icon={ArrowLeft}
            onClick={() => navigate('/tprm/vendors')}>Vendors</Button>
          <div>
            <h1 className="text-lg font-bold text-text-primary">Onboard New Vendor</h1>
            <p className="text-xs text-text-muted">
              Creates vendor, calculates risk score, assigns assessment, starts TPRM workflow
            </p>
          </div>
        </div>

        <StepIndicator current={step} />

        {/* ── Step 1: Vendor Details ─────────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <CardHeader title="Vendor Details" subtitle="Basic company information" icon={Building2} />
            <CardBody className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Company Name *" value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Acme Corp" error={errors.name} />
                <Input label="Legal Name" value={form.legalName}
                  onChange={e => set('legalName', e.target.value)}
                  placeholder="Acme Corporation Ltd." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Registration Number" value={form.registrationNumber}
                  onChange={e => set('registrationNumber', e.target.value)}
                  placeholder="CIN / Company No." />
                <Input label="Website" value={form.website}
                  onChange={e => set('website', e.target.value)}
                  placeholder="https://acme.com" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Industry" required value={form.industry}
                  onChange={v => set('industry', v)}
                  options={INDUSTRIES} error={errors.industry} />
                <Input label="Country *" value={form.country}
                  onChange={e => set('country', e.target.value)}
                  placeholder="India" error={errors.country} />
              </div>
              <Textarea label="Services Provided" value={form.servicesProvided}
                onChange={e => set('servicesProvided', e.target.value)}
                placeholder="Describe what services this vendor provides…" rows={2} />
            </CardBody>
          </Card>
        )}

        {/* ── Step 2: Risk Assessment ────────────────────────────────────── */}
        {step === 2 && (
          <Card>
            <CardHeader title="Risk Assessment" subtitle="Risk factors used to calculate risk score and assign template" icon={Shield} />
            <CardBody className="flex flex-col gap-4">
              <div className="p-3 bg-surface-overlay rounded-lg border border-border flex items-start gap-2">
                <Info size={13} className="text-brand-400 shrink-0 mt-0.5" />
                <p className="text-xs text-text-muted">
                  Risk score is calculated from these factors. The score determines which assessment template is assigned.
                  Higher data access and criticality = higher score.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <SelectField label="Risk Classification *" required value={form.riskClassification}
                  onChange={v => set('riskClassification', v)}
                  options={RISK_CLASSIFICATIONS} error={errors.riskClassification} />
                <SelectField label="Criticality *" required value={form.criticality}
                  onChange={v => set('criticality', v)}
                  options={CRITICALITY_OPTIONS} error={errors.criticality} />
                <SelectField label="Data Access Level *" required value={form.dataAccessLevel}
                  onChange={v => set('dataAccessLevel', v)}
                  options={DATA_ACCESS_OPTIONS} error={errors.dataAccessLevel} />
              </div>
              <SelectField
                label="TPRM Workflow"
                value={form.workflowId}
                onChange={v => set('workflowId', v)}
                options={activeWorkflows.map(w => ({
                  value: String(w.id),
                  label: `${w.name} (v${w.version})`,
                }))}
                helperText="The TPRM workflow blueprint to trigger on onboarding"
              />
            </CardBody>
          </Card>
        )}

        {/* ── Step 3: Primary Contact ────────────────────────────────────── */}
        {step === 3 && (
          <Card>
            <CardHeader title="Primary Contact" subtitle="This person becomes the Vendor Risk Manager (VENDOR_VRM) and receives a welcome email" icon={User} />
            <CardBody className="flex flex-col gap-4">
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg flex items-start gap-2">
                <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-text-muted">
                  A user account will be created for this contact with the <span className="text-amber-400 font-medium">VENDOR_VRM</span> role.
                  They will receive an email with a temporary password to join the platform and begin the assessment.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="First Name *" value={form.contactFirstName}
                  onChange={e => set('contactFirstName', e.target.value)}
                  placeholder="Rahul" error={errors.contactFirstName} />
                <Input label="Last Name *" value={form.contactLastName}
                  onChange={e => set('contactLastName', e.target.value)}
                  placeholder="Sharma" error={errors.contactLastName} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Work Email *" type="email" value={form.contactEmail}
                  onChange={e => set('contactEmail', e.target.value)}
                  placeholder="rahul@acme.com" error={errors.contactEmail} />
                <Input label="Job Title" value={form.contactJobTitle}
                  onChange={e => set('contactJobTitle', e.target.value)}
                  placeholder="Head of Risk & Compliance" />
              </div>
            </CardBody>
          </Card>
        )}

        {/* ── Step 4: Review ─────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader title="Review — Vendor Details" />
              <CardBody className="grid grid-cols-2 gap-3">
                {[
                  ['Company Name',   form.name],
                  ['Legal Name',     form.legalName || form.name],
                  ['Industry',       form.industry],
                  ['Country',        form.country],
                  ['Registration',   form.registrationNumber || '—'],
                  ['Website',        form.website || '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{label}</p>
                    <p className="text-sm text-text-primary mt-0.5">{value}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Review — Risk Factors" />
              <CardBody className="grid grid-cols-3 gap-3">
                {[
                  ['Risk Classification', form.riskClassification],
                  ['Criticality',         form.criticality],
                  ['Data Access',         form.dataAccessLevel],
                  // In Step 4 Review — Vendor Details, add workflow to the grid:
['Workflow', activeWorkflows.find(w => String(w.id) === form.workflowId)?.name || '— (default)'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-medium text-text-primary mt-0.5">{value}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Review — Primary Contact (VENDOR_VRM)" />
              <CardBody className="grid grid-cols-2 gap-3">
                {[
                  ['Name',      `${form.contactFirstName} ${form.contactLastName}`],
                  ['Email',     form.contactEmail],
                  ['Job Title', form.contactJobTitle || '—'],
                  ['Role',      'VENDOR_VRM (auto-assigned)'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{label}</p>
                    <p className="text-sm text-text-primary mt-0.5">{value}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
            <div className="p-3 bg-brand-500/5 border border-brand-500/20 rounded-lg flex items-start gap-2">
              <CheckCircle2 size={13} className="text-brand-400 shrink-0 mt-0.5" />
              <p className="text-xs text-text-muted">
                On submit: vendor is created, risk score calculated, assessment template assigned,
                TPRM workflow started (Step 1 auto-executed), and welcome email sent to {form.contactEmail}.
              </p>
            </div>
          </div>
        )}

        {/* ── Navigation ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mt-6">
          <Button variant="ghost" size="md" icon={ArrowLeft}
            onClick={step === 1 ? () => navigate('/tprm/vendors') : back}
            disabled={isPending}>
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Step {step} of {STEPS.length}</span>
            {step < 4 ? (
              <Button size="md" icon={ChevronRight} onClick={next}>Next</Button>
            ) : (
              <Button size="md" loading={isPending} onClick={submit}>
                {isPending ? 'Onboarding…' : 'Onboard Vendor'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
