/**
 * One modal for the three subscription verbs: create, renew, change plan.
 *
 * Each verb writes a NEW chained row on the server (see SubscriptionService),
 * so this form never edits a contract in place. Values are entered in major
 * units (rupees) and sent as minor units.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Callout } from '../ui/ui-primitives'
import { billingApi } from '../../api/billing.api'
import { formatMoney, toMinor, toMajorInput, CURRENCIES } from '../../lib/money'
import { FormRow, TextIn, SelectIn, TextArea, errMsg, today, humanize } from './billingShared'

const TITLES = {
  create: 'New subscription',
  renew:  'Renew subscription',
  change: 'Change plan',
}

function addMonths(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

function monthsBetween(a, b) {
  if (!a || !b) return 12
  const x = new Date(a + 'T00:00:00'), y = new Date(b + 'T00:00:00')
  return Math.max(1, Math.round((y - x) / (1000 * 60 * 60 * 24 * 30.4375)))
}

export default function SubscriptionFormModal({ open, onClose, mode = 'create', tenantId, tenantName, current }) {
  const qc = useQueryClient()
  const { data: plans = [] } = useQuery({ queryKey: ['billing-plans'], queryFn: billingApi.plans, enabled: open })
  const { data: cfg } = useQuery({ queryKey: ['billing-config'], queryFn: billingApi.config, enabled: open, staleTime: 300_000 })
  const sellable = useMemo(() => (plans || []).filter(p => p.isActive), [plans])

  const initial = useMemo(() => {
    const start = mode === 'renew' && current?.termEnd ? current.termEnd : today()
    const term = current ? monthsBetween(current.termStart, current.termEnd) : 12
    return {
      planCode:          current?.planCode || '',
      status:            'ACTIVE',
      termStart:         start,
      termEnd:           mode === 'change' && current ? current.termEnd : addMonths(start, mode === 'renew' ? term : 12),
      currency:          current?.currency || 'INR',
      billingInterval:   current?.billingInterval || 'ANNUAL',
      value:             mode === 'renew' && current ? toMajorInput(current.contractValueMinor) : '',
      vendorsPurchased:  current?.vendorsPurchased ?? '',
      seatsPurchased:    current?.seatsPurchased ?? '',
      salesMotion:       current?.salesMotion || '',
      autoRenew:         current ? current.autoRenew : true,
      poReference:       '',
      notes:             '',
      applyEntitlements: true,
      entitlementMode:   'ADD_ONLY',
      allowZeroValue:    false,
    }
  }, [mode, current, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const [f, setF] = useState(initial)
  useEffect(() => { if (open) setF(initial) }, [open, initial])
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  const plan = sellable.find(p => p.code === f.planCode)

  // Suggested value from the price list: annual price × years, or monthly × months.
  const suggestion = useMemo(() => {
    if (!plan || f.status === 'TRIAL') return null
    const months = monthsBetween(f.termStart, f.termEnd)
    const annual = plan.prices?.find(p => p.currency === f.currency && p.billingInterval === 'ANNUAL' && p.isActive)
    const monthly = plan.prices?.find(p => p.currency === f.currency && p.billingInterval === 'MONTHLY' && p.isActive)
    let base = null
    if (annual) base = Math.round(annual.unitAmountMinor * months / 12)
    else if (monthly) base = monthly.unitAmountMinor * months
    if (base === null) return null
    // Vendor overage above the plan's included vendors.
    const price = annual || monthly
    const extra = plan.includedVendors && f.vendorsPurchased && Number(f.vendorsPurchased) > plan.includedVendors && price.overageUnitMinor
      ? (Number(f.vendorsPurchased) - plan.includedVendors) * price.overageUnitMinor * (annual ? months / 12 : months)
      : 0
    return Math.round(base + extra)
  }, [plan, f.currency, f.termStart, f.termEnd, f.status, f.vendorsPurchased])

  // When the plan changes, carry its included limits into the form.
  useEffect(() => {
    if (!plan || mode === 'renew') return
    setF(prev => ({
      ...prev,
      vendorsPurchased: prev.vendorsPurchased === '' || prev.vendorsPurchased === null ? (plan.includedVendors ?? '') : prev.vendorsPurchased,
      seatsPurchased:   prev.seatsPurchased === '' || prev.seatsPurchased === null ? (plan.includedUsers ?? '') : prev.seatsPurchased,
    }))
  }, [plan?.code]) // eslint-disable-line react-hooks/exhaustive-deps

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const body = {
        planCode: f.planCode || undefined,
        status: mode === 'create' ? f.status : undefined,
        termStart: f.termStart || undefined,
        termEnd: f.termEnd || undefined,
        currency: f.currency,
        billingInterval: f.billingInterval,
        contractValueMinor: f.status === 'TRIAL' ? 0 : toMinor(f.value),
        vendorsPurchased: f.vendorsPurchased === '' ? null : Number(f.vendorsPurchased),
        seatsPurchased: f.seatsPurchased === '' ? null : Number(f.seatsPurchased),
        salesMotion: f.salesMotion || undefined,
        autoRenew: f.autoRenew,
        poReference: f.poReference || undefined,
        notes: f.notes || undefined,
        applyEntitlements: f.applyEntitlements,
        entitlementMode: f.entitlementMode,
        allowZeroValue: f.allowZeroValue || undefined,
      }
      if (mode === 'create') return billingApi.createSubscription(tenantId, body)
      if (mode === 'renew')  return billingApi.renew(current.id, body)
      return billingApi.changePlan(current.id, body)
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? 'Subscription created' : mode === 'renew' ? 'Renewal booked' : 'Plan changed')
      qc.invalidateQueries({ queryKey: ['tenant-subscriptions', String(tenantId)] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
      qc.invalidateQueries({ queryKey: ['tenant-features', tenantId] })
      qc.invalidateQueries({ queryKey: ['billing-subscriptions'] })
      onClose()
    },
    onError: (e) => toast.error(errMsg(e, 'Could not save the subscription')),
  })

  const isTrial = mode === 'create' && f.status === 'TRIAL'

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={TITLES[mode]}
      subtitle={tenantName}
      footer={
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-text-muted">
            {mode === 'change' ? 'The current row is replaced from the effective date; the chain is kept for NRR.'
              : mode === 'renew' ? 'The next term starts when the current one ends unless you change the start.'
              : 'Writes a new subscription and updates the tenant plan and limits.'}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={isPending} disabled={!f.planCode} onClick={() => mutate()}>
              {mode === 'create' ? 'Create' : mode === 'renew' ? 'Book renewal' : 'Change plan'}
            </Button>
          </div>
        </div>
      }>
      <div className="grid grid-cols-2 gap-3">
        <FormRow label="Plan">
          <SelectIn value={f.planCode} onChange={e => set('planCode', e.target.value)} placeholder="Select a plan"
            options={sellable.map(p => ({ value: p.code, label: `${p.name} (${p.code})` }))} />
        </FormRow>
        {mode === 'create' ? (
          <FormRow label="Starts as">
            <SelectIn value={f.status} onChange={e => {
              const st = e.target.value
              setF(prev => ({ ...prev, status: st,
                termEnd: st === 'TRIAL' ? addMonths(prev.termStart, 1) : addMonths(prev.termStart, 12) }))
            }} options={[{ value: 'ACTIVE', label: 'Paid (active)' }, { value: 'TRIAL', label: 'Free trial' }]} />
          </FormRow>
        ) : <div />}

        <FormRow label={mode === 'change' ? 'Effective from' : 'Term start'}>
          <TextIn type="date" value={f.termStart} onChange={e => set('termStart', e.target.value)} />
        </FormRow>
        <FormRow label="Term end (exclusive)" hint="A 12-month term from 1 Apr ends on 1 Apr next year.">
          <TextIn type="date" value={f.termEnd} onChange={e => set('termEnd', e.target.value)} />
        </FormRow>

        {!isTrial && (
          <>
            <FormRow label="Currency">
              <SelectIn value={f.currency} onChange={e => set('currency', e.target.value)} options={CURRENCIES.map(c => ({ value: c, label: c }))} />
            </FormRow>
            <FormRow label="Invoiced">
              <SelectIn value={f.billingInterval} onChange={e => set('billingInterval', e.target.value)}
                options={(cfg?.billingIntervals || ['MONTHLY', 'QUARTERLY', 'ANNUAL', 'MULTI_YEAR'])} />
            </FormRow>
            <FormRow label={`Contract value for the whole term (${f.currency})`}
              hint={suggestion !== null
                ? <>List price for this term: <button type="button" className="underline text-brand-ink" onClick={() => set('value', toMajorInput(suggestion))}>{formatMoney(suggestion, f.currency)}</button></>
                : 'No list price for this plan in this currency — enter the negotiated value.'}
              className="col-span-2">
              <TextIn inputMode="decimal" placeholder="e.g. 360000" value={f.value} onChange={e => set('value', e.target.value)} />
            </FormRow>
          </>
        )}

        <FormRow label="Vendors under management" hint={plan ? `Plan includes ${plan.includedVendors ?? 'unlimited'}` : 'Blank = unlimited'}>
          <TextIn type="number" min="0" value={f.vendorsPurchased} onChange={e => set('vendorsPurchased', e.target.value)} />
        </FormRow>
        <FormRow label="Seats" hint="Blank = unlimited (recommended)">
          <TextIn type="number" min="0" value={f.seatsPurchased} onChange={e => set('seatsPurchased', e.target.value)} />
        </FormRow>

        <FormRow label="Sales motion">
          <SelectIn value={f.salesMotion} onChange={e => set('salesMotion', e.target.value)} placeholder="—"
            options={cfg?.salesMotions || []} />
        </FormRow>
        <FormRow label="PO / order form ref">
          <TextIn value={f.poReference} onChange={e => set('poReference', e.target.value)} />
        </FormRow>

        <FormRow label="Notes" className="col-span-2">
          <TextArea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} />
        </FormRow>

        <div className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-secondary">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={f.autoRenew} onChange={e => set('autoRenew', e.target.checked)} /> Auto-renew
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={f.applyEntitlements} onChange={e => set('applyEntitlements', e.target.checked)} /> Apply plan features
          </label>
          {f.applyEntitlements && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={f.entitlementMode === 'EXACT'}
                onChange={e => set('entitlementMode', e.target.checked ? 'EXACT' : 'ADD_ONLY')} />
              Also remove features the plan doesn't include
            </label>
          )}
          {!isTrial && toMinor(f.value) === 0 && (
            <label className="flex items-center gap-1.5 text-status-warn-fg">
              <input type="checkbox" checked={f.allowZeroValue} onChange={e => set('allowZeroValue', e.target.checked)} />
              Complimentary account (counts as a customer at ₹0)
            </label>
          )}
        </div>

        {plan && plan.featureKeys?.length > 0 && f.applyEntitlements && (
          <Callout variant="info" className="col-span-2">
            {humanize(plan.code)} includes: <span className="font-mono">{plan.featureKeys.join(', ')}</span>
          </Callout>
        )}
      </div>
    </Modal>
  )
}
