/**
 * Tenant Detail → Subscription. The contract in force, and the chain of terms
 * behind it (renewals, upgrades, downgrades) — the chain is what NRR is built on.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CreditCard, RefreshCw, ArrowUpDown, XCircle, Sparkles, FileText, Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Callout } from '../ui/ui-primitives'
import { billingApi } from '../../api/billing.api'
import { formatMoney } from '../../lib/money'
import SubscriptionFormModal from '../billing/SubscriptionFormModal'
import InvoiceModal from '../billing/InvoiceModal'
import { Field, StatusPill, SectionTitle, Empty, FormRow, SelectIn, TextArea, errMsg, fmtDate, daysUntil, humanize } from '../billing/billingShared'
import { cn } from '../../lib/cn'

export default function TenantSubscriptionTab({ tenant }) {
  const qc = useQueryClient()
  const tid = tenant.tenantId
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-subscriptions', String(tid)],
    queryFn: () => billingApi.tenantSubscriptions(tid),
  })
  const history = data?.history || []
  const current = history.find(s => s.id === data?.currentId)
  // A renewal booked ahead of time is the head of the chain but not yet in force.
  const upcoming = current ? history.find(s => s.previousSubscriptionId === current.id) : null
  const actionable = upcoming || current

  const [form, setForm] = useState(null)       // 'create' | 'renew' | 'change'
  const [cancelOpen, setCancelOpen] = useState(false)
  const [invoiceId, setInvoiceId] = useState(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['tenant-subscriptions', String(tid)] })

  const entitlements = useMutation({
    mutationFn: (mode) => billingApi.applyEntitlements(actionable.id, mode),
    onSuccess: (r) => {
      toast.success(`Features applied — ${r?.granted?.length || 0} granted, ${r?.revoked?.length || 0} removed`)
      qc.invalidateQueries({ queryKey: ['tenant-features', tid] })
    },
    onError: (e) => toast.error(errMsg(e)),
  })
  const draftInvoice = useMutation({
    mutationFn: () => billingApi.draftFromSubscription(current.id, {}),
    onSuccess: (inv) => { toast.success('Draft invoice created'); qc.invalidateQueries({ queryKey: ['billing-invoices'] }); setInvoiceId(inv.id) },
    onError: (e) => toast.error(errMsg(e)),
  })

  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>

  return (
    <div className="max-w-4xl space-y-6">
      {!current ? (
        <Empty icon={CreditCard} title="No subscription in force"
          action={<Button size="sm" icon={Plus} onClick={() => setForm('create')}>{history.length ? 'Start a new subscription' : 'Create subscription'}</Button>}>
          {history.length
            ? 'This tenant has had subscriptions before. A new one is recorded as a reactivation.'
            : 'Record the plan, term and contract value. Every revenue metric starts from this row.'}
        </Empty>
      ) : (
        <>
          <CurrentCard sub={current} upcoming={upcoming} />
          <div className="flex flex-wrap gap-2">
            {!upcoming && current.status !== 'CHURNED' && <Button size="sm" icon={RefreshCw} onClick={() => setForm('renew')}>Renew</Button>}
            {!upcoming && <Button size="sm" variant="secondary" icon={ArrowUpDown} onClick={() => setForm('change')}>Change plan</Button>}
            {['ACTIVE', 'PAST_DUE', 'TRIAL'].includes(current.status) && !upcoming &&
              <Button size="sm" variant="secondary" icon={XCircle} onClick={() => setCancelOpen(true)}>Cancel</Button>}
            {current.status !== 'TRIAL' &&
              <Button size="sm" variant="secondary" icon={FileText} loading={draftInvoice.isPending} onClick={() => draftInvoice.mutate()}>Draft invoice</Button>}
            <Button size="sm" variant="ghost" icon={Sparkles} loading={entitlements.isPending} onClick={() => entitlements.mutate('ADD_ONLY')}>Re-apply plan features</Button>
          </div>
        </>
      )}

      {history.length > 0 && (
        <section>
          <SectionTitle>Contract history</SectionTitle>
          <ol className="relative border-l border-border ml-2 space-y-3">
            {history.map(s => (
              <li key={s.id} className="ml-4">
                <span className={cn('absolute -left-[5px] mt-2 w-2.5 h-2.5 rounded-full border-2 border-surface-raised',
                  s.id === data?.currentId ? 'bg-brand-500' : 'bg-border')} />
                <div className={cn('rounded-card border p-3 bg-surface-raised', s.id === data?.currentId ? 'border-brand-500/40' : 'border-border')}>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-text-muted">#{s.id}</span>
                    <span className="font-semibold text-text-primary">{s.planCode}</span>
                    <StatusPill status={s.status} />
                    <StatusPill status={s.changeType} />
                    <span className="text-text-muted">{fmtDate(s.termStart)} → {fmtDate(s.termEnd)}</span>
                    <span className="ml-auto font-mono text-text-primary">{formatMoney(s.contractValueMinor, s.currency)}</span>
                    <span className="font-mono text-text-muted">{formatMoney(s.mrrMinor, s.currency)}/mo</span>
                  </div>
                  {(s.lines?.length > 1 || s.churnReason || s.notes || s.poReference) && (
                    <div className="mt-2 text-[11px] text-text-muted space-y-0.5">
                      {s.lines?.length > 1 && s.lines.map(l => (
                        <p key={l.id}>{humanize(l.lineType)} · {l.description || l.itemCode} × {l.quantity} — {formatMoney(l.unitPriceMinor * l.quantity, s.currency)}{!l.recurring && ' (one-off)'}</p>
                      ))}
                      {s.churnReason && <p className="text-status-fail-fg">Churn: {humanize(s.churnReason)}{s.churnNote ? ` — ${s.churnNote}` : ''}</p>}
                      {s.poReference && <p>PO {s.poReference}</p>}
                      {s.notes && <p>{s.notes}</p>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <SubscriptionFormModal open={!!form} mode={form || 'create'} onClose={() => { setForm(null); refresh() }}
        tenantId={tid} tenantName={tenant.name} current={form === 'create' ? null : actionable} />
      <CancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} sub={current} onDone={refresh} />
      <InvoiceModal open={!!invoiceId} invoiceId={invoiceId} onClose={() => setInvoiceId(null)} />
    </div>
  )
}

function CurrentCard({ sub, upcoming }) {
  const d = daysUntil(sub.termEnd)
  return (
    <div className="rounded-card border border-border bg-surface-raised p-4 space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard size={15} className="text-brand-ink" />
        <span className="text-sm font-semibold text-text-primary">{sub.planCode}</span>
        <StatusPill status={sub.status} />
        {sub.salesMotion && <span className="text-[11px] text-text-muted">{humanize(sub.salesMotion)}</span>}
        <span className="ml-auto text-xs text-text-muted">{sub.autoRenew ? 'Auto-renews' : 'Does not auto-renew'}</span>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <Field label="MRR"><span className="font-mono">{formatMoney(sub.mrrMinor, sub.currency)}</span></Field>
        <Field label="Contract value"><span className="font-mono">{formatMoney(sub.contractValueMinor, sub.currency)}</span></Field>
        <Field label="Term">{fmtDate(sub.termStart)} → {fmtDate(sub.termEnd)}</Field>
        <Field label="Ends in">{d === null ? null : <span className={d <= 30 ? 'text-status-warn-fg' : ''}>{d} days</span>}</Field>
        <Field label="Vendors bought">{sub.vendorsPurchased ?? 'Unlimited'}</Field>
        <Field label="Seats bought">{sub.seatsPurchased ?? 'Unlimited'}</Field>
        <Field label="Invoiced">{humanize(sub.billingInterval)}</Field>
        <Field label="PO">{sub.poReference}</Field>
      </div>
      {upcoming && (
        <Callout variant="info">
          Next term booked: {upcoming.planCode}, {fmtDate(upcoming.termStart)} → {fmtDate(upcoming.termEnd)} ({formatMoney(upcoming.contractValueMinor, upcoming.currency)}).
        </Callout>
      )}
      {sub.status === 'CANCELLED' && (
        <Callout variant="warning">Cancelled — runs to {fmtDate(sub.termEnd)}, then churns. Reason: {humanize(sub.churnReason)}</Callout>
      )}
      {sub.status === 'PAST_DUE' && <Callout variant="error">An invoice on this subscription is overdue.</Callout>}
    </div>
  )
}

function CancelModal({ open, onClose, sub, onDone }) {
  const { data: cfg } = useQuery({ queryKey: ['billing-config'], queryFn: billingApi.config, enabled: open, staleTime: 300_000 })
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [immediate, setImmediate] = useState(false)
  const m = useMutation({
    mutationFn: () => billingApi.cancel(sub.id, { reason, note, immediate }),
    onSuccess: () => { toast.success(sub.status === 'TRIAL' ? 'Trial ended' : immediate ? 'Ended today and recorded as churn' : 'Cancelled — runs to term end'); onDone(); onClose() },
    onError: (e) => toast.error(errMsg(e)),
  })
  if (!sub) return null
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Cancel subscription"
      footer={<div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>Keep</Button>
        <Button size="sm" variant="danger" disabled={!reason} loading={m.isPending} onClick={() => m.mutate()}>Cancel subscription</Button>
      </div>}>
      <div className="space-y-3">
        <p className="text-sm text-text-secondary">
          {sub.status === 'TRIAL'
            ? 'Ends the trial. A trial that does not convert is not counted as churn.'
            : `By default it stays live until ${fmtDate(sub.termEnd)} and is recorded as churn then.`}
        </p>
        <FormRow label="Reason (one per customer, used in churn analysis)">
          <SelectIn value={reason} onChange={e => setReason(e.target.value)} placeholder="Select" options={cfg?.churnReasons || []} />
        </FormRow>
        <FormRow label="What they said"><TextArea rows={2} value={note} onChange={e => setNote(e.target.value)} /></FormRow>
        {sub.status !== 'TRIAL' && (
          <label className="flex items-center gap-2 text-xs text-status-fail-fg">
            <input type="checkbox" checked={immediate} onChange={e => setImmediate(e.target.checked)} /> End today (refund cases)
          </label>
        )}
      </div>
    </Modal>
  )
}
