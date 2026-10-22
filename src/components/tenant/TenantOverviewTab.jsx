/**
 * Tenant Detail → Overview. Identity, owner, commercial profile and bill-to.
 *
 * The commercial profile (acquisition channel, industry, size, country) is what
 * every revenue metric is later segmented by; it cannot be reconstructed a year
 * on, so it is edited here rather than buried in a settings page.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Pencil, Building2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { tenantsApi } from '../../api/tenants.api'
import { Field, FormRow, TextIn, SelectIn, TextArea, SectionTitle, StatusPill, errMsg, fmtDate, humanize } from '../billing/billingShared'

export const INDUSTRIES = ['BFSI', 'FINTECH', 'HEALTHCARE', 'SAAS', 'IT_SERVICES', 'MANUFACTURING', 'GOVERNMENT', 'AUDIT_ADVISORY', 'EDUCATION', 'RETAIL', 'OTHER']
export const EMPLOYEE_BANDS = ['1-50', '51-200', '201-1000', '1001-5000', '5000+']
export const CHANNELS = ['OUTBOUND', 'INBOUND', 'REFERRAL', 'PARTNER', 'AUDIT_FIRM_CHANNEL', 'VENDOR_CHANNEL', 'EVENTS', 'PAID_ADS', 'OTHER']

const KEYS = ['name', 'description', 'industry', 'employeeBand', 'country', 'acquisitionChannel', 'legalName', 'billingEmail', 'billingAddress', 'taxId']

export default function TenantOverviewTab({ tenant, owner }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const pick = () => Object.fromEntries(KEYS.map(k => [k, tenant?.[k] ?? '']))
  const [f, setF] = useState(pick)
  useEffect(() => { if (!editing) setF(pick()) }, [tenant, editing]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = useMutation({
    mutationFn: () => tenantsApi.update(tenant.tenantId, f),
    onSuccess: () => {
      toast.success('Tenant updated')
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setEditing(false)
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const ownerName = owner?.fullName || [owner?.firstName, owner?.lastName].filter(Boolean).join(' ') || owner?.email

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-card bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
          <Building2 size={20} className="text-brand-ink" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary truncate">{tenant.name}</p>
          <p className="text-xs text-text-muted font-mono">TNT-{String(tenant.tenantId).padStart(4, '0')} · {tenant.code}</p>
        </div>
        {!editing
          ? <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit profile</Button>
          : <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
            </div>}
      </div>

      <section>
        <SectionTitle>Account</SectionTitle>
        <div className="grid grid-cols-4 gap-4 rounded-card border border-border p-4 glass-card">
          <Field label="Status"><StatusPill status={tenant.status} /></Field>
          <Field label="Plan">{tenant.plan}</Field>
          <Field label="Organisation type">{tenant.isAuditFirm ? <StatusPill status="APPROVED" label="Verified audit firm" /> : 'Customer'}</Field>
          <Field label="Created">{fmtDate(tenant.createdAt)}</Field>
          <Field label="First paid">{tenant.firstPaidAt ? fmtDate(tenant.firstPaidAt) : null}</Field>
          <Field label="Max users">{tenant.maxUsers ?? 'Unlimited'}</Field>
          <Field label="Max vendors">{tenant.maxVendors ?? 'Unlimited'}</Field>
          <Field label="Owner">
            {owner?.email ? <><span className="block truncate">{ownerName}</span><span className="block text-xs font-mono text-text-muted truncate">{owner.email}</span></> : null}
          </Field>
        </div>
      </section>

      <section>
        <SectionTitle>Profile</SectionTitle>
        {editing ? (
          <div className="grid grid-cols-2 gap-3 rounded-card border border-border p-4 glass-card">
            <FormRow label="Display name"><TextIn value={f.name} onChange={e => set('name', e.target.value)} /></FormRow>
            <FormRow label="Industry"><SelectIn value={f.industry} onChange={e => set('industry', e.target.value)} placeholder="—" options={INDUSTRIES} /></FormRow>
            <FormRow label="Employees"><SelectIn value={f.employeeBand} onChange={e => set('employeeBand', e.target.value)} placeholder="—" options={EMPLOYEE_BANDS.map(b => ({ value: b, label: b }))} /></FormRow>
            <FormRow label="Country (ISO)" hint="Decides the default tax on invoices."><TextIn maxLength={2} placeholder="IN" value={f.country} onChange={e => set('country', e.target.value.toUpperCase())} /></FormRow>
            <FormRow label="Acquisition channel" hint="How this customer found you — drives CAC by channel." className="col-span-2">
              <SelectIn value={f.acquisitionChannel} onChange={e => set('acquisitionChannel', e.target.value)} placeholder="—" options={CHANNELS} />
            </FormRow>
            <FormRow label="Description" className="col-span-2"><TextArea rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></FormRow>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4 rounded-card border border-border p-4 glass-card">
            <Field label="Industry">{tenant.industry && humanize(tenant.industry)}</Field>
            <Field label="Employees">{tenant.employeeBand}</Field>
            <Field label="Country">{tenant.country}</Field>
            <Field label="Acquisition channel">{tenant.acquisitionChannel ? humanize(tenant.acquisitionChannel)
              : <span className="text-status-warn-fg text-xs">Not set</span>}</Field>
            {tenant.description && <Field label="Description" className="col-span-4">{tenant.description}</Field>}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Bill to</SectionTitle>
        {editing ? (
          <div className="grid grid-cols-2 gap-3 rounded-card border border-border p-4 glass-card">
            <FormRow label="Legal name"><TextIn value={f.legalName} onChange={e => set('legalName', e.target.value)} /></FormRow>
            <FormRow label="GSTIN / tax ID"><TextIn value={f.taxId} onChange={e => set('taxId', e.target.value.toUpperCase())} /></FormRow>
            <FormRow label="Billing email" className="col-span-2"><TextIn type="email" value={f.billingEmail} onChange={e => set('billingEmail', e.target.value)} /></FormRow>
            <FormRow label="Billing address" className="col-span-2"><TextArea rows={3} value={f.billingAddress} onChange={e => set('billingAddress', e.target.value)} /></FormRow>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 rounded-card border border-border p-4 glass-card">
            <Field label="Legal name">{tenant.legalName}</Field>
            <Field label="GSTIN / tax ID" mono>{tenant.taxId}</Field>
            <Field label="Billing email">{tenant.billingEmail}</Field>
            <Field label="Address" className="col-span-3"><span className="whitespace-pre-line">{tenant.billingAddress}</span></Field>
          </div>
        )}
        <p className="text-[11px] text-text-muted mt-1.5">Copied onto each invoice when it is issued — editing here never changes an invoice already sent.</p>
      </section>
    </div>
  )
}
