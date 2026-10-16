/**
 * One invoice: edit while DRAFT, then issue → mark paid, or void.
 * Used from the Invoices page and the Tenant Detail → Invoices tab.
 *
 * The PDF is rendered on the server (GET /v1/admin/billing/invoices/{id}/pdf),
 * with the logo and seller details from application.properties. Drafts and
 * void invoices carry a watermark. It reflects what is SAVED — save a draft
 * before previewing it.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Trash2, Send, CheckCircle2, Ban, FileDown, Eye } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Callout } from '../ui/ui-primitives'
import { billingApi } from '../../api/billing.api'
import { formatMoney, toMinor, toMajorInput } from '../../lib/money'
import { StatusPill, Field, TextIn, TextArea, FormRow, errMsg, fmtDate, today } from './billingShared'

export default function InvoiceModal({ invoiceId, open, onClose }) {
  const qc = useQueryClient()
  const { data: inv, isLoading } = useQuery({
    queryKey: ['billing-invoice', invoiceId],
    queryFn: () => billingApi.invoice(invoiceId),
    enabled: open && !!invoiceId,
  })

  const [lines, setLines] = useState([])
  const [taxPct, setTaxPct] = useState('')
  const [taxLabel, setTaxLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [paidRef, setPaidRef] = useState('')
  const [paidOn, setPaidOn] = useState(today())
  const [voidReason, setVoidReason] = useState('')

  useEffect(() => {
    if (!inv) return
    setLines((inv.lines || []).map(l => ({ description: l.description, quantity: l.quantity, unit: toMajorInput(l.unitPriceMinor) })))
    setTaxPct(inv.taxRateBp != null ? String(inv.taxRateBp / 100) : '')
    setTaxLabel(inv.taxLabel || '')
    setNotes(inv.notes || '')
  }, [inv])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['billing-invoice', invoiceId] })
    qc.invalidateQueries({ queryKey: ['billing-invoices'] })
  }
  const act = (fn, ok) => ({
    mutationFn: fn,
    onSuccess: () => { toast.success(ok); refresh() },
    onError: (e) => toast.error(errMsg(e)),
  })

  const save    = useMutation(act(() => billingApi.updateInvoice(invoiceId, {
    lines: lines.map(l => ({ description: l.description, quantity: Number(l.quantity) || 1, unitPriceMinor: toMinor(l.unit) ?? 0 })),
    taxRateBp: taxPct === '' ? 0 : Math.round(Number(taxPct) * 100),
    taxLabel, notes,
  }), 'Draft saved'))
  const issue   = useMutation(act(() => billingApi.issueInvoice(invoiceId), 'Invoice issued and numbered'))
  const paid    = useMutation(act(() => billingApi.markPaid(invoiceId, { paidAt: paidOn, reference: paidRef }), 'Marked as paid'))
  const voidIt  = useMutation(act(() => billingApi.voidInvoice(invoiceId, voidReason), 'Invoice voided'))
  const remove  = useMutation({
    mutationFn: () => billingApi.deleteInvoice(invoiceId),
    onSuccess: () => { toast.success('Draft deleted'); qc.invalidateQueries({ queryKey: ['billing-invoices'] }); onClose() },
    onError: (e) => toast.error(errMsg(e)),
  })

  const isDraft = inv?.storedStatus === 'DRAFT'
  const cur = inv?.currency || 'INR'
  const draftSubtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (toMinor(l.unit) || 0), 0)
  const draftTax = Math.round(draftSubtotal * (Number(taxPct) || 0) / 100)

  return (
    <Modal open={open} onClose={onClose} size="xl"
      title={inv?.invoiceNumber || (isDraft ? 'Draft invoice' : 'Invoice')}
      subtitle={inv ? `${inv.tenantName || ''}${inv.periodStart ? ` · ${fmtDate(inv.periodStart)} – ${fmtDate(inv.periodEnd)}` : ''}` : ''}
      footer={inv && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" icon={Eye} onClick={() => openPdf(inv, 'preview')}>Preview PDF</Button>
            <Button variant="ghost" size="sm" icon={FileDown} onClick={() => openPdf(inv, 'download')}>Download PDF</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {isDraft && <Button variant="danger" size="sm" icon={Trash2} loading={remove.isPending} onClick={() => remove.mutate()}>Delete draft</Button>}
            {isDraft && <Button variant="secondary" size="sm" loading={save.isPending} onClick={() => save.mutate()}>Save draft</Button>}
            {isDraft && <Button size="sm" icon={Send} loading={issue.isPending} onClick={() => issue.mutate()}>Issue</Button>}
          </div>
        </div>
      )}>
      {isLoading || !inv ? <p className="text-sm text-text-muted py-6">Loading…</p> : (
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-3">
            <Field label="Status"><StatusPill status={inv.status} /></Field>
            <Field label="Issued">{inv.issueDate ? fmtDate(inv.issueDate) : null}</Field>
            <Field label="Due">{inv.dueDate ? fmtDate(inv.dueDate) : null}</Field>
            <Field label="Total"><span className="font-mono">{formatMoney(isDraft ? draftSubtotal + draftTax : inv.totalMinor, cur)}</span></Field>
          </div>

          {isDraft && (
            <Callout variant="info">
              Bill-to details and the invoice number are fixed when you issue. Numbers run consecutively within the financial year.
            </Callout>
          )}

          {/* Lines */}
          <div className="rounded-card border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-overlay/50 border-b border-border text-[11px] uppercase tracking-wide text-text-muted">
                <th className="text-left px-3 py-2">Description</th>
                <th className="text-right px-3 py-2 w-20">Qty</th>
                <th className="text-right px-3 py-2 w-36">Unit ({cur})</th>
                <th className="text-right px-3 py-2 w-36">Amount</th>
                {isDraft && <th className="w-8" />}
              </tr></thead>
              <tbody className="divide-y divide-border/60">
                {isDraft ? lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5"><TextIn value={l.description} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} /></td>
                    <td className="px-2 py-1.5"><TextIn type="number" min="1" className="text-right" value={l.quantity} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} /></td>
                    <td className="px-2 py-1.5"><TextIn inputMode="decimal" className="text-right" value={l.unit} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} /></td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">{formatMoney((Number(l.quantity) || 0) * (toMinor(l.unit) || 0), cur)}</td>
                    <td className="px-1"><button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="text-text-muted hover:text-status-fail-fg p-1" aria-label="Remove line"><Trash2 size={13} /></button></td>
                  </tr>
                )) : (inv.lines || []).map(l => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{l.quantity}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{formatMoney(l.unitPriceMinor, cur)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{formatMoney(l.amountMinor, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isDraft && (
              <button onClick={() => setLines(ls => [...ls, { description: '', quantity: 1, unit: '' }])}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-brand-ink hover:bg-surface-overlay border-t border-border">
                <Plus size={12} /> Add line
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              {isDraft ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <FormRow label="Tax %"><TextIn inputMode="decimal" value={taxPct} onChange={e => setTaxPct(e.target.value)} /></FormRow>
                    <FormRow label="Tax label" className="col-span-2"><TextIn value={taxLabel} onChange={e => setTaxLabel(e.target.value)} /></FormRow>
                  </div>
                  <FormRow label="Notes on invoice"><TextArea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></FormRow>
                </>
              ) : (
                <>
                  <Field label="Bill to">{inv.billToName}{inv.billToTaxId && <span className="block text-xs text-text-muted font-mono">Tax ID {inv.billToTaxId}</span>}</Field>
                  {inv.billToAddress && <p className="text-xs text-text-muted whitespace-pre-line">{inv.billToAddress}</p>}
                  {inv.notes && <Field label="Notes">{inv.notes}</Field>}
                </>
              )}
            </div>
            <div className="rounded-card border border-border p-3 space-y-1.5 text-sm self-start">
              <Row k="Subtotal" v={formatMoney(isDraft ? draftSubtotal : inv.subtotalMinor, cur)} />
              <Row k={isDraft ? (taxLabel || 'Tax') : (inv.taxLabel || 'Tax')} v={formatMoney(isDraft ? draftTax : inv.taxMinor, cur)} />
              <div className="border-t border-border pt-1.5"><Row k="Total" v={formatMoney(isDraft ? draftSubtotal + draftTax : inv.totalMinor, cur)} strong /></div>
            </div>
          </div>

          {inv.storedStatus === 'ISSUED' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-card border border-border p-3 space-y-2">
                <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5"><CheckCircle2 size={13} className="text-status-pass-fg" /> Record payment</p>
                <div className="grid grid-cols-2 gap-2">
                  <FormRow label="Received on"><TextIn type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} /></FormRow>
                  <FormRow label="UTR / reference"><TextIn value={paidRef} onChange={e => setPaidRef(e.target.value)} /></FormRow>
                </div>
                <Button size="sm" variant="success" loading={paid.isPending} onClick={() => paid.mutate()}>Mark paid</Button>
              </div>
              <div className="rounded-card border border-border p-3 space-y-2">
                <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5"><Ban size={13} className="text-status-fail-fg" /> Void</p>
                <FormRow label="Reason (kept on record)"><TextIn value={voidReason} onChange={e => setVoidReason(e.target.value)} /></FormRow>
                <Button size="sm" variant="danger" disabled={!voidReason.trim()} loading={voidIt.isPending} onClick={() => voidIt.mutate()}>Void invoice</Button>
              </div>
            </div>
          )}
          {inv.storedStatus === 'PAID' && (
            <Callout variant="success">Paid {fmtDate(inv.paidAt)}{inv.paymentReference ? ` · ref ${inv.paymentReference}` : ''}</Callout>
          )}
          {inv.storedStatus === 'VOID' && (
            <Callout variant="warning">Voided {fmtDate(inv.voidedAt)} — {inv.voidReason}</Callout>
          )}
        </div>
      )}
    </Modal>
  )
}

function Row({ k, v, strong }) {
  return (
    <div className={'flex items-center justify-between ' + (strong ? 'font-semibold text-text-primary' : 'text-text-secondary')}>
      <span>{k}</span><span className="font-mono text-xs tabular-nums">{v}</span>
    </div>
  )
}

/**
 * Server-rendered PDF. Preview opens it in a new tab; download saves it under
 * the invoice number. The tab is opened before the request so pop-up blockers
 * treat it as a direct result of the click.
 */
async function openPdf(inv, mode) {
  const tab = mode === 'preview' ? window.open('', '_blank') : null
  try {
    const blob = await billingApi.invoicePdf(inv.id)
    const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: 'application/pdf' }))
    if (mode === 'preview') {
      if (tab) tab.location.href = url
      else window.open(url, '_blank')
    } else {
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${(inv.invoiceNumber || `draft-${inv.id}`).replace(/[^A-Za-z0-9_-]/g, '-')}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (e) {
    if (tab) tab.close()
    toast.error(errMsg(e, 'Could not generate the PDF'))
  }
}
