/**
 * Pricing Plans — the catalogue. Packaging (what a tier includes) and price
 * (what it costs, per currency and interval) are edited together here but
 * stored apart, so a price experiment never touches entitlements.
 *
 * Three tabs:
 *   Plans       the plan cards and the plan editor (incl. how it shows on the website)
 *   Features    the buyer-facing feature catalogue and the plan × feature matrix —
 *               ticking a cell edits the plan's feature keys, the same list that
 *               grants modules to new subscriptions
 *   Website     exactly what www.kashiguard.com/pricing receives right now
 *
 * Plans are never deleted — subscriptions point at them. Retire instead.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pencil, Tags, Trash2, ExternalLink, Check, LayoutGrid, Globe2, ListChecks, AlertTriangle } from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Callout } from '../../../components/ui/ui-primitives'
import { billingApi } from '../../../api/billing.api'
import { formatMoney, toMinor, toMajorInput, CURRENCIES } from '../../../lib/money'
import { FormRow, TextIn, SelectIn, TextArea, StatusPill, Empty, errMsg, humanize, DetailTabs, useUrlTab, SectionTitle } from '../../../components/billing/billingShared'
import { cn } from '../../../lib/cn'
import { usePermission } from '../../../hooks/usePermission'

/** Must match BillingAccess.PERM_MANAGE on the server. */
const BILLING_MANAGE = 'platform:billing:manage'

const WEBSITE_PRICING_URL = 'https://www.kashiguard.com/pricing.html'

const TABS = [
  { key: 'plans', label: 'Plans', icon: LayoutGrid },
  { key: 'features', label: 'Features & comparison', icon: ListChecks },
  { key: 'website', label: 'Website preview', icon: Globe2 },
]

export default function PricingPlansPage() {
  const { data: plans = [], isLoading } = useQuery({ queryKey: ['billing-plans'], queryFn: billingApi.plans })
  const { data: features = [] } = useQuery({ queryKey: ['billing-features'], queryFn: billingApi.features })
  const [edit, setEdit] = useState(null)   // plan object, or {} for new
  const [tab, setTab] = useUrlTab(TABS)
  const canManage = usePermission().hasPermission(BILLING_MANAGE)

  return (
    <PageLayout title="Pricing Plans" subtitle="Tiers, what each includes, list prices — and how they appear on kashiguard.com"
      actions={
        <div className="flex items-center gap-2">
          <a href={WEBSITE_PRICING_URL} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-7 px-3 text-xs rounded-ctl text-text-secondary hover:text-text-primary hover:bg-surface-overlay">
            <ExternalLink size={12} /> Website pricing page
          </a>
          {canManage && <Button size="sm" icon={Plus} onClick={() => setEdit({})}>New plan</Button>}
        </div>
      }>
      <DetailTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'features' && <FeatureMatrix plans={plans} features={features} canManage={canManage} />}
      {tab === 'website' && <WebsitePreview />}
      {tab === 'plans' && <div className="px-6 pt-4 pb-6 space-y-5">
        <Callout variant="info">
          Prices here are list prices — a subscription records the negotiated contract value. What a plan shows on the website
          (price or "Contact sales", button, badge) is set in each plan's <b>Public price list</b> section; changes appear on
          kashiguard.com within five minutes.
        </Callout>
        {isLoading ? <p className="text-sm text-text-muted">Loading…</p> : plans.length === 0 ? (
          <Empty icon={Tags} title="No plans yet" action={<Button size="sm" icon={Plus} onClick={() => setEdit({})}>Create the first plan</Button>}>
            Start with Starter, Growth and Enterprise. Run the seed SQL to create them with empty prices.
          </Empty>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {plans.map(p => <PlanCard key={p.id} plan={p} onEdit={canManage ? () => setEdit(p) : null} labels={labelMap(features)} />)}
          </div>
        )}
      </div>}
      <PlanModal open={!!edit} plan={edit} onClose={() => setEdit(null)} features={features} />
    </PageLayout>
  )
}

const labelMap = (features) => Object.fromEntries((features || []).map(f => [f.featureKey, f.label]))

const DISPLAY_LABEL = { FIXED: 'Price shown', STARTING_AT: '"From" price', CONTACT_SALES: 'Contact sales', FREE: 'Free' }

function PlanCard({ plan, onEdit, labels = {} }) {
  const annual = plan.prices.filter(x => x.billingInterval === 'ANNUAL' && x.isActive)
  const monthly = plan.prices.filter(x => x.billingInterval === 'MONTHLY' && x.isActive)
  return (
    <div className={cn('rounded-card border glass-card p-4 flex flex-col gap-3', plan.isActive ? 'border-border' : 'border-dashed border-border opacity-70')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-text-primary">{plan.name} <span className="font-mono text-[11px] text-text-muted">{plan.code}</span></p>
          {plan.tagline && <p className="text-xs text-text-muted">{plan.tagline}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {!plan.isActive && <StatusPill status="RETIRED" label="Retired" tone="muted" />}
          {!plan.isPublic && plan.isActive && <StatusPill status="PRIVATE" label="Not on website" tone="tag" />}
          {plan.isPublic && plan.isActive && <StatusPill status="PUBLIC" label={DISPLAY_LABEL[plan.priceDisplay] || 'Contact sales'} tone="info" />}
          {plan.audience === 'AUDIT_FIRM' && <StatusPill status="AF" label="Audit firms" tone="tag" />}
          {onEdit && <Button size="icon-sm" variant="ghost" icon={Pencil} onClick={onEdit} aria-label="Edit plan" />}
        </div>
      </div>
      <div className="space-y-0.5">
        {annual.length === 0 && monthly.length === 0 && <p className="text-xs text-status-warn-fg">No list price set</p>}
        {annual.map(x => <p key={x.id} className="text-sm font-mono text-text-primary">{formatMoney(x.unitAmountMinor, x.currency)} <span className="text-xs text-text-muted">/ year</span></p>)}
        {monthly.map(x => <p key={x.id} className="text-xs font-mono text-text-secondary">{formatMoney(x.unitAmountMinor, x.currency)} / month</p>)}
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Limit k="Priced on" v={humanize(plan.pricingMetric)} />
        <Limit k="Vendors" v={plan.includedVendors ?? 'Unlimited'} />
        <Limit k="Seats" v={plan.includedUsers ?? 'Unlimited'} />
        <Limit k="AI tokens / mo" v={plan.aiMonthlyTokens == null ? 'None' : Number(plan.aiMonthlyTokens).toLocaleString()} />
        <Limit k="Trial" v={`${plan.trialDays ?? 0} days`} />
        <Limit k="Support" v={plan.supportLevel ? humanize(plan.supportLevel) : '—'} />
        <Limit k="Frameworks" v={plan.includedFrameworks ?? 'Unlimited'} />
      </div>
      {plan.highlights.length > 0 && (
        <ul className="text-xs text-text-secondary list-disc pl-4 space-y-0.5">{plan.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
      )}
      {plan.featureKeys.length > 0 && (
        <div className="flex flex-wrap gap-1">{plan.featureKeys.map(k => (
          <span key={k} title={k} className={cn('px-1.5 py-0.5 rounded text-[10px]', labels[k] ? 'bg-brand-500/10 text-brand-ink' : 'bg-status-warn-bg text-status-warn-fg font-mono')}>{labels[k] || k}</span>
        ))}</div>
      )}
    </div>
  )
}

function Limit({ k, v }) {
  return <div><p className="text-text-muted">{k}</p><p className="text-text-primary font-medium">{v}</p></div>
}

const EMPTY = {
  code: '', name: '', tagline: '', description: '', tierRank: 1, pricingMetric: 'VENDORS',
  includedVendors: '', includedUsers: '', includedEntities: '', aiMonthlyTokens: '', featureKeys: [],
  highlights: '', supportLevel: 'EMAIL', isPublic: true, isActive: true, trialDays: 30, sortOrder: 0, prices: [],
  audience: 'ORGANISATION', priceDisplay: 'CONTACT_SALES', ctaType: 'DEMO', ctaLabel: '', badge: '',
  includedFrameworks: '', publicNote: '',
}

function PlanModal({ open, plan, onClose, features = [] }) {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['billing-config'], queryFn: billingApi.config, enabled: open, staleTime: 300_000 })
  const isNew = !plan?.id
  const [f, setF] = useState(EMPTY)
  useEffect(() => {
    if (!open) return
    setF(isNew ? EMPTY : {
      ...EMPTY, ...plan,
      includedVendors: plan.includedVendors ?? '', includedUsers: plan.includedUsers ?? '',
      includedEntities: plan.includedEntities ?? '', aiMonthlyTokens: plan.aiMonthlyTokens ?? '',
      includedFrameworks: plan.includedFrameworks ?? '', audience: plan.audience || 'ORGANISATION',
      priceDisplay: plan.priceDisplay || 'CONTACT_SALES', ctaType: plan.ctaType || 'DEMO',
      ctaLabel: plan.ctaLabel || '', badge: plan.badge || '', publicNote: plan.publicNote || '',
      highlights: (plan.highlights || []).join('\n'),
      prices: (plan.prices || []).map(x => ({ ...x, amount: toMajorInput(x.unitAmountMinor), overage: toMajorInput(x.overageUnitMinor) })),
    })
  }, [open, plan]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const num = (v) => v === '' || v === null || v === undefined ? null : Number(v)

  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: f.code, name: f.name, tagline: f.tagline, description: f.description,
        tierRank: Number(f.tierRank) || 1, pricingMetric: f.pricingMetric,
        includedVendors: num(f.includedVendors), includedUsers: num(f.includedUsers),
        includedEntities: num(f.includedEntities), aiMonthlyTokens: num(f.aiMonthlyTokens),
        featureKeys: f.featureKeys, highlights: f.highlights.split('\n').map(s => s.trim()).filter(Boolean),
        supportLevel: f.supportLevel, isPublic: f.isPublic, isActive: f.isActive,
        trialDays: Number(f.trialDays) || 0, sortOrder: Number(f.sortOrder) || 0,
        audience: f.audience, priceDisplay: f.priceDisplay, ctaType: f.ctaType, ctaLabel: f.ctaLabel,
        badge: f.badge, includedFrameworks: num(f.includedFrameworks), publicNote: f.publicNote,
        prices: f.prices.filter(x => toMinor(x.amount) !== null).map(x => ({
          currency: x.currency, billingInterval: x.billingInterval,
          unitAmountMinor: toMinor(x.amount), overageUnitMinor: toMinor(x.overage), isActive: x.isActive !== false,
        })),
      }
      return isNew ? billingApi.createPlan(body) : billingApi.updatePlan(plan.id, body)
    },
    onSuccess: () => {
      toast.success('Plan saved')
      qc.invalidateQueries({ queryKey: ['billing-plans'] })
      qc.invalidateQueries({ queryKey: ['public-pricing'] })
      onClose()
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  // Choosable keys: every catalogue row that is not core, plus LICENSED flags
  // that have no catalogue label yet (shown by key, so the gap is visible).
  const catalogue = features.filter(x => !x.includedInAll).map(x => ({ flagKey: x.featureKey, label: x.label, description: x.description }))
  const known = new Set(catalogue.map(x => x.flagKey))
  const licensed = [...catalogue, ...(cfg?.licensedFeatures || []).filter(l => !known.has(l.flagKey)).map(l => ({ ...l, label: null }))]
  const toggleKey = (k) => set('featureKeys', f.featureKeys.includes(k) ? f.featureKeys.filter(x => x !== k) : [...f.featureKeys, k])
  const setPrice = (i, k, v) => set('prices', f.prices.map((x, j) => j === i ? { ...x, [k]: v } : x))

  return (
    <Modal open={open} onClose={onClose} size="xl" title={isNew ? 'New plan' : `Edit ${plan?.name}`}
      footer={<div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={save.isPending} disabled={!f.code || !f.name} onClick={() => save.mutate()}>Save plan</Button>
      </div>}>
      <div className="grid grid-cols-4 gap-3">
        <FormRow label="Code" hint="Immutable once created"><TextIn value={f.code} disabled={!isNew} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="GROWTH" /></FormRow>
        <FormRow label="Name"><TextIn value={f.name} onChange={e => set('name', e.target.value)} /></FormRow>
        <FormRow label="Tier rank" hint="1 = entry"><TextIn type="number" min="1" value={f.tierRank} onChange={e => set('tierRank', e.target.value)} /></FormRow>
        <FormRow label="Sort order"><TextIn type="number" value={f.sortOrder} onChange={e => set('sortOrder', e.target.value)} /></FormRow>
        <FormRow label="Tagline" className="col-span-4"><TextIn value={f.tagline} onChange={e => set('tagline', e.target.value)} /></FormRow>

        <FormRow label="Priced on"><SelectIn value={f.pricingMetric} onChange={e => set('pricingMetric', e.target.value)} options={cfg?.pricingMetrics || ['VENDORS', 'SEATS', 'ENTITIES', 'FLAT']} /></FormRow>
        <FormRow label="Vendors included" hint="Blank = unlimited"><TextIn type="number" min="0" value={f.includedVendors} onChange={e => set('includedVendors', e.target.value)} /></FormRow>
        <FormRow label="Seats included" hint="Blank = unlimited"><TextIn type="number" min="0" value={f.includedUsers} onChange={e => set('includedUsers', e.target.value)} /></FormRow>
        <FormRow label="Entities in scope" hint="Enterprise only"><TextIn type="number" min="0" value={f.includedEntities} onChange={e => set('includedEntities', e.target.value)} /></FormRow>
        <FormRow label="AI tokens / month" hint="Blank = none"><TextIn type="number" min="0" value={f.aiMonthlyTokens} onChange={e => set('aiMonthlyTokens', e.target.value)} /></FormRow>
        <FormRow label="Trial days"><TextIn type="number" min="0" value={f.trialDays} onChange={e => set('trialDays', e.target.value)} /></FormRow>
        <FormRow label="Support"><SelectIn value={f.supportLevel} onChange={e => set('supportLevel', e.target.value)}
          options={[{ value: 'EMAIL', label: 'Email' }, { value: 'ONBOARDING', label: 'Email + onboarding' }, { value: 'NAMED_CONTACT_SLA', label: 'Named contact, SLA' }]} /></FormRow>
        <div className="flex flex-col justify-end gap-1.5 text-xs text-text-secondary">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.isPublic} onChange={e => set('isPublic', e.target.checked)} /> On public price list</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.isActive} onChange={e => set('isActive', e.target.checked)} /> Sellable (untick to retire)</label>
        </div>

        <div className="col-span-4">
          <p className="text-xs font-medium text-text-secondary mb-1.5">List prices</p>
          <div className="space-y-2">
            {f.prices.map((x, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <FormRow label="Currency" className="col-span-2"><SelectIn value={x.currency} onChange={e => setPrice(i, 'currency', e.target.value)} options={CURRENCIES.map(c => ({ value: c, label: c }))} /></FormRow>
                <FormRow label="Interval" className="col-span-2"><SelectIn value={x.billingInterval} onChange={e => setPrice(i, 'billingInterval', e.target.value)} options={['ANNUAL', 'MONTHLY']} /></FormRow>
                <FormRow label="Price per interval" className="col-span-3"><TextIn inputMode="decimal" value={x.amount} onChange={e => setPrice(i, 'amount', e.target.value)} /></FormRow>
                <FormRow label="Per extra vendor / interval" className="col-span-4"><TextIn inputMode="decimal" value={x.overage} onChange={e => setPrice(i, 'overage', e.target.value)} placeholder="optional" /></FormRow>
                <button onClick={() => set('prices', f.prices.filter((_, j) => j !== i))} className="col-span-1 h-8 flex items-center justify-center text-text-muted hover:text-status-fail-fg" aria-label="Remove price"><Trash2 size={14} /></button>
              </div>
            ))}
            <Button size="xs" variant="ghost" icon={Plus} onClick={() => set('prices', [...f.prices, { currency: 'INR', billingInterval: 'ANNUAL', amount: '', overage: '' }])}>Add price</Button>
          </div>
        </div>

        <div className="col-span-4">
          <p className="text-xs font-medium text-text-secondary mb-1.5">Included modules <span className="text-text-muted font-normal">— granted to new subscriptions on this plan, and ticked in the website comparison</span></p>
          {licensed.length === 0 ? <p className="text-[11px] text-text-muted">No LICENSED features in the catalogue — switch flags to Licensed on the Feature Flags page.</p> : (
            <div className="flex flex-wrap gap-1.5">
              {licensed.map(l => {
                const on = f.featureKeys.includes(l.flagKey)
                return (
                  <button key={l.flagKey} type="button" title={`${l.flagKey}${l.description ? ' — ' + l.description : ''}`} onClick={() => toggleKey(l.flagKey)}
                    className={cn('px-2 py-0.5 rounded-full text-[11px] border', !l.label && 'font-mono', on ? 'border-brand-500 bg-brand-500/10 text-brand-ink' : 'border-border text-text-muted hover:text-text-primary')}>
                    {l.label || l.flagKey}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="col-span-4 pt-2 border-t border-border">
          <p className="text-xs font-semibold text-text-secondary">Public price list <span className="font-normal text-text-muted">— how this plan appears on kashiguard.com/pricing (needs "On public price list")</span></p>
        </div>
        <FormRow label="Audience"><SelectIn value={f.audience} onChange={e => set('audience', e.target.value)}
          options={[{ value: 'ORGANISATION', label: 'Organisations' }, { value: 'AUDIT_FIRM', label: 'Audit firms (partner tier)' }]} /></FormRow>
        <FormRow label="Price shown as" hint="FREE also provisions at zero value"><SelectIn value={f.priceDisplay} onChange={e => set('priceDisplay', e.target.value)}
          options={[{ value: 'STARTING_AT', label: 'From ₹… (starting at)' }, { value: 'FIXED', label: 'Exact list price' }, { value: 'CONTACT_SALES', label: 'Contact sales (no number)' }, { value: 'FREE', label: 'Free' }]} /></FormRow>
        <FormRow label="Button" hint="Becomes the enquiry type"><SelectIn value={f.ctaType} onChange={e => set('ctaType', e.target.value)}
          options={[{ value: 'TRIAL', label: 'Start free trial' }, { value: 'DEMO', label: 'Book a demo' }, { value: 'CONTACT_SALES', label: 'Talk to sales' }, { value: 'APPLY', label: 'Apply (audit firms)' }]} /></FormRow>
        <FormRow label="Button text" hint="Blank = default"><TextIn value={f.ctaLabel} onChange={e => set('ctaLabel', e.target.value)} maxLength={60} /></FormRow>
        <FormRow label="Badge" hint="e.g. Most teams start here"><TextIn value={f.badge} onChange={e => set('badge', e.target.value)} maxLength={40} /></FormRow>
        <FormRow label="Frameworks included" hint="Blank = unlimited"><TextIn type="number" min="0" value={f.includedFrameworks} onChange={e => set('includedFrameworks', e.target.value)} /></FormRow>
        <FormRow label="Small print under the price" className="col-span-2"><TextIn value={f.publicNote} onChange={e => set('publicNote', e.target.value)} maxLength={255} placeholder="billed annually · excl. GST" /></FormRow>

        <FormRow label="Highlights (one per line, shown on the plan card)" className="col-span-4"><TextArea rows={3} value={f.highlights} onChange={e => set('highlights', e.target.value)} /></FormRow>
        <FormRow label="Internal description" className="col-span-4"><TextArea rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></FormRow>
      </div>
    </Modal>
  )
}


// ─── Features & comparison ──────────────────────────────────────────────────

const FEATURE_EMPTY = { featureKey: '', label: '', description: '', groupName: '', sortOrder: 100, includedInAll: false, addonAvailable: false, isPublic: true }

function FeatureMatrix({ plans, features, canManage }) {
  const qc = useQueryClient()
  const [edit, setEdit] = useState(null)
  const cols = plans.filter(p => p.isActive && (p.audience || 'ORGANISATION') === 'ORGANISATION')
  const groups = useMemo(() => {
    const m = new Map()
    for (const f of features) { if (!m.has(f.groupName)) m.set(f.groupName, []); m.get(f.groupName).push(f) }
    return [...m.entries()]
  }, [features])
  const known = new Set(features.map(f => f.featureKey))
  const orphans = [...new Set(cols.flatMap(p => p.featureKeys).filter(k => !known.has(k)))]

  const toggle = useMutation({
    mutationFn: ({ plan, key, on }) => billingApi.setPlanFeature(plan.id, key, on),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-plans'] }); qc.invalidateQueries({ queryKey: ['public-pricing'] }) },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <div className="px-6 pt-4 pb-6 space-y-4">
      <Callout variant="info">
        Each row is a buyer-facing name for a feature key. Ticking a cell adds the key to that plan — the same list that switches
        modules on for <b>new</b> subscriptions (existing tenants are re-synced from their Subscription tab). <b>Core</b> rows are on every
        plan and are not licensed modules. <b>Add-on</b> rows read "Add-on" on plans that do not include them.
      </Callout>
      {orphans.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs rounded-card border border-status-warn-bd bg-status-warn-bg px-3 py-2 text-status-warn-fg">
          <AlertTriangle size={13} /> Plans include keys with no label, so the website cannot show them:
          {orphans.map(k => (
            <button key={k} disabled={!canManage} onClick={() => setEdit({ ...FEATURE_EMPTY, featureKey: k })} className="font-mono underline">{k}</button>
          ))}
        </div>
      )}
      {canManage && <div className="flex justify-end"><Button size="sm" icon={Plus} onClick={() => setEdit({ ...FEATURE_EMPTY })}>Add feature</Button></div>}
      {features.length === 0 ? (
        <Empty icon={ListChecks} title="No features in the catalogue">Run the pricing seed, or add rows here. The website comparison table is built from them.</Empty>
      ) : (
        <div className="rounded-card border border-border overflow-x-auto glass-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-overlay/50">
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide">Feature</th>
                {cols.map(p => <th key={p.id} className="px-3 py-2 text-center text-[11px] font-semibold text-text-muted uppercase tracking-wide whitespace-nowrap">{p.name}</th>)}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {groups.map(([g, rows]) => (
                <FragmentRows key={g} title={g} span={cols.length + 2}>
                  {rows.map(f => (
                    <tr key={f.id} className={cn('border-t border-border/60', !f.isPublic && 'opacity-60')}>
                      <td className="px-3 py-2">
                        <p className="text-sm text-text-primary">{f.label}
                          {f.includedInAll && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted">Core</span>}
                          {f.addonAvailable && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-status-tag-bg text-status-tag-fg">Add-on</span>}
                          {!f.isPublic && <span className="ml-1.5 text-[10px] text-text-muted">hidden</span>}
                        </p>
                        <p className="text-[10px] font-mono text-text-muted">{f.featureKey}</p>
                      </td>
                      {cols.map(p => {
                        const on = f.includedInAll || p.featureKeys.includes(f.featureKey)
                        return (
                          <td key={p.id} className="px-3 py-2 text-center">
                            {f.includedInAll ? <Check size={14} className="inline text-text-muted" /> : (
                              <button type="button" aria-label={`${on ? 'Remove' : 'Include'} ${f.label} ${on ? 'from' : 'in'} ${p.name}`}
                                disabled={toggle.isPending || !canManage} onClick={() => toggle.mutate({ plan: p, key: f.featureKey, on: !on })}
                                className={cn('w-6 h-6 rounded border inline-flex items-center justify-center transition-colors',
                                  on ? 'bg-brand-500 border-brand-500 text-brand-on' : 'border-border hover:border-brand-500/60 text-transparent')}>
                                <Check size={13} strokeWidth={3} />
                              </button>
                            )}
                            {!on && f.addonAvailable && <p className="text-[10px] text-text-muted">add-on</p>}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-right">{canManage && <Button size="icon-sm" variant="ghost" icon={Pencil} onClick={() => setEdit(f)} aria-label="Edit feature" />}</td>
                    </tr>
                  ))}
                </FragmentRows>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <FeatureModal open={!!edit} feature={edit} groups={groups.map(([g]) => g)} onClose={() => setEdit(null)} />
    </div>
  )
}

function FragmentRows({ title, span, children }) {
  return (
    <>
      <tr className="bg-surface-overlay/40 border-t border-border">
        <td colSpan={span} className="px-3 py-1.5 text-[11px] font-semibold text-text-secondary uppercase tracking-wide">{title}</td>
      </tr>
      {children}
    </>
  )
}

function FeatureModal({ open, feature, groups, onClose }) {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['billing-config'], queryFn: billingApi.config, enabled: open, staleTime: 300_000 })
  const isNew = !feature?.id
  const [f, setF] = useState(FEATURE_EMPTY)
  useEffect(() => { if (open) setF({ ...FEATURE_EMPTY, ...feature, description: feature?.description || '' }) }, [open, feature])
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const done = (msg) => { toast.success(msg); qc.invalidateQueries({ queryKey: ['billing-features'] }); qc.invalidateQueries({ queryKey: ['public-pricing'] }); onClose() }
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, sortOrder: Number(f.sortOrder) || 0, groupName: f.groupName || 'Platform' }
      return isNew ? billingApi.createFeature(body) : billingApi.updateFeature(feature.id, body)
    },
    onSuccess: () => done('Feature saved'),
    onError: (e) => toast.error(errMsg(e)),
  })
  const del = useMutation({
    mutationFn: () => billingApi.deleteFeature(feature.id),
    onSuccess: () => done('Removed from the catalogue — plans keep the key'),
    onError: (e) => toast.error(errMsg(e)),
  })
  const flagKeys = (cfg?.licensedFeatures || []).map(l => l.flagKey)

  return (
    <Modal open={open} onClose={onClose} size="lg" title={isNew ? 'Add feature' : `Edit ${feature?.label}`}
      footer={<div className="flex justify-between gap-2">
        {!isNew ? <Button size="sm" variant="ghost" icon={Trash2} loading={del.isPending} onClick={() => del.mutate()}>Remove label</Button> : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={save.isPending} disabled={!f.featureKey || !f.label} onClick={() => save.mutate()}>Save</Button>
        </div>
      </div>}>
      <div className="grid grid-cols-2 gap-3">
        <FormRow label="Feature key" hint={isNew ? 'A LICENSED flag key, or a new key for a module not gated yet' : 'Immutable'}>
          <TextIn value={f.featureKey} disabled={!isNew} list="feature-flag-keys" onChange={e => set('featureKey', e.target.value.trim())} placeholder="module.risk_register" />
          <datalist id="feature-flag-keys">{flagKeys.map(k => <option key={k} value={k} />)}</datalist>
        </FormRow>
        <FormRow label="Label (what buyers read)"><TextIn value={f.label} onChange={e => set('label', e.target.value)} maxLength={150} placeholder="Risk register" /></FormRow>
        <FormRow label="Description" hint="One line, shown as help text on the website" className="col-span-2"><TextIn value={f.description} onChange={e => set('description', e.target.value)} maxLength={500} /></FormRow>
        <FormRow label="Comparison section">
          <TextIn value={f.groupName} list="feature-groups" onChange={e => set('groupName', e.target.value)} placeholder="Third-party risk" />
          <datalist id="feature-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
        </FormRow>
        <FormRow label="Order" hint="Lower first; sections follow their first row"><TextIn type="number" value={f.sortOrder} onChange={e => set('sortOrder', e.target.value)} /></FormRow>
        <div className="col-span-2 flex flex-wrap gap-4 text-xs text-text-secondary">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.includedInAll} onChange={e => set('includedInAll', e.target.checked)} /> Core — on every plan</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.addonAvailable} onChange={e => set('addonAvailable', e.target.checked)} /> Sold as an add-on where not included</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.isPublic} onChange={e => set('isPublic', e.target.checked)} /> Show on the website</label>
        </div>
      </div>
    </Modal>
  )
}

// ─── Website preview ────────────────────────────────────────────────────────

function WebsitePreview() {
  const { data, isLoading, refetch, isFetching } = useQuery({ queryKey: ['public-pricing'], queryFn: () => billingApi.publicPricing('INR') })
  if (isLoading) return <p className="px-6 pt-4 text-sm text-text-muted">Loading…</p>
  const plans = data?.plans || []
  const cmp = data?.comparison
  return (
    <div className="px-6 pt-4 pb-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">The exact response kashiguard.com receives from <span className="font-mono">GET /v1/billing/public/plans</span>. The site caches it for up to five minutes.</p>
        <Button size="sm" variant="secondary" loading={isFetching} onClick={() => refetch()}>Refresh</Button>
      </div>
      {plans.length === 0 ? <Empty icon={Globe2} title="Nothing is published">Mark plans active and "On public price list" to show them.</Empty> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.map(p => (
            <div key={p.code} className={cn('rounded-card border p-4 flex flex-col gap-2 glass-card', p.badge ? 'border-brand-500' : 'border-border')}>
              {p.badge && <span className="self-start text-[10px] px-2 py-0.5 rounded-full bg-brand-500 text-brand-on font-semibold">{p.badge}</span>}
              <p className="text-sm font-semibold text-text-primary">{p.name}</p>
              {p.tagline && <p className="text-xs text-text-muted">{p.tagline}</p>}
              <p className="text-lg font-semibold text-text-primary">
                {p.priceDisplay === 'FREE' ? 'Free'
                  : p.price ? <>{p.price.startingAt && <span className="text-xs text-text-muted font-normal">from </span>}
                      {formatMoney(p.price.perMonthBilledAnnuallyMinor ?? p.price.monthlyMinor, p.price.currency)}
                      <span className="text-xs text-text-muted font-normal"> / month</span></>
                  : 'Talk to us'}
              </p>
              {p.publicNote && <p className="text-[11px] text-text-muted">{p.publicNote}</p>}
              <div className="flex flex-wrap gap-1 text-[10px]">
                {p.limits?.frameworks !== undefined && <span className="px-1.5 py-0.5 rounded bg-surface-overlay">{p.limits.frameworks ?? 'Unlimited'} frameworks</span>}
                {p.audience === 'ORGANISATION' && <span className="px-1.5 py-0.5 rounded bg-surface-overlay">{p.limits?.vendors ?? 'Unlimited'} vendors</span>}
                {p.audience === 'ORGANISATION' && <span className="px-1.5 py-0.5 rounded bg-surface-overlay">{p.limits?.seats ?? 'Unlimited'} admin seats</span>}
              </div>
              <ul className="text-xs text-text-secondary space-y-0.5">
                {p.inherits && <li className="font-medium">Everything in {p.inherits.name}, plus</li>}
                {[...(p.features || []), ...(p.highlights || [])].map((x, i) => <li key={i} className="flex gap-1.5"><Check size={11} className="mt-0.5 text-status-pass-fg shrink-0" />{x}</li>)}
              </ul>
              <span className="mt-auto self-start text-xs px-3 py-1.5 rounded-ctl bg-brand-500/10 text-brand-ink">{p.cta?.label}</span>
            </div>
          ))}
        </div>
      )}
      {cmp?.plans?.length > 0 && (
        <div>
          <SectionTitle>Comparison table</SectionTitle>
          <div className="rounded-card border border-border overflow-x-auto glass-card">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-surface-overlay/50">
                <th className="px-3 py-2 text-left text-[11px] text-text-muted uppercase">Feature</th>
                {cmp.plans.map(p => <th key={p.code} className="px-3 py-2 text-center text-[11px] text-text-muted uppercase">{p.name}</th>)}
              </tr></thead>
              <tbody>
                {cmp.groups.map(g => (
                  <FragmentRows key={g.name} title={g.name} span={cmp.plans.length + 1}>
                    {g.rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className="px-3 py-1.5 text-text-primary">{r.label}</td>
                        {cmp.plans.map(p => {
                          const v = r.cells[p.code]
                          return <td key={p.code} className="px-3 py-1.5 text-center text-xs">
                            {v === 'INCLUDED' ? <Check size={14} className="inline text-status-pass-fg" /> : v === 'ADDON' ? <span className="text-text-muted">Add-on</span> : v ?? <span className="text-text-muted">—</span>}
                          </td>
                        })}
                      </tr>
                    ))}
                  </FragmentRows>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}