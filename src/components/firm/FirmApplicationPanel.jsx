/**
 * Audit-firm verification for ONE tenant — prepare, confirm, review, decide.
 *
 * Platform users only. The firm emails its details and evidence; a platform
 * user records them here and uploads the evidence; the system mails the firm's
 * contact a one-time link on the firm's own domain; a platform reviewer
 * approves (a different one when four-eyes is switched on server-side). Approval is the only thing that turns on
 * tenants.is_audit_firm, and it expires.
 *
 * Used by Tenant Detail → Audit firm, and by the Firm Verifications queue.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  BadgeCheck, Mail, FileCheck2, ClipboardCheck, ShieldOff, Send, Download, ShieldCheck,
  AlertTriangle, CircleDot, CheckCircle2, Info, XCircle,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Callout } from '../ui/ui-primitives'
import EvidenceUploader from '../ui/EvidenceUploader'
import { firmVerificationAdminApi as api } from '../../api/firmVerification.api'
import {
  StatusPill, Field, FormRow, TextIn, SelectIn, TextArea, SectionTitle, Empty, errMsg, fmtDate, daysUntil,
} from '../billing/billingShared'
import { cn } from '../../lib/cn'

const ENTITY = 'AUDIT_FIRM_APPLICATION'
const FIRM_TYPES = [
  { value: 'CA_FIRM', label: 'Chartered Accountants firm (ICAI)' },
  { value: 'CPA_FIRM', label: 'CPA firm' },
  { value: 'CERTIFICATION_BODY', label: 'Certification body (ISO)' },
  { value: 'CERT_IN_EMPANELLED', label: 'CERT-In empanelled auditor' },
  { value: 'PCI_QSA', label: 'PCI QSA company' },
  { value: 'INTERNAL_AUDIT_PRACTICE', label: 'Internal audit / advisory practice' },
  { value: 'OTHER', label: 'Other' },
]
const BODIES = ['ICAI', 'AICPA', 'PCAOB', 'State Board of Accountancy', 'NABCB', 'ANAB', 'UKAS', 'CERT-In', 'PCI SSC', 'IAF member AB', 'Other']
const FRAMEWORKS = ['SOC2', 'ISO27001', 'ISO27701', 'ISO22301', 'PCI_DSS', 'HIPAA', 'GDPR', 'DPDPA', 'RBI', 'SEBI_CSCRF', 'IRDAI', 'CERT_IN_AUDIT', 'NIST_CSF']
const EDITABLE = ['DRAFT', 'INFO_REQUESTED']

export function useFirmApplications(tenantId) {
  return useQuery({
    queryKey: ['firm-verification', 'tenant', String(tenantId)],
    queryFn: () => api.forTenant(tenantId),
    enabled: !!tenantId,
  })
}

export default function FirmApplicationPanel({ tenantId, tenantName, focusId }) {
  const qc = useQueryClient()
  const { data, isLoading } = useFirmApplications(tenantId)
  const apps = data?.applications || []
  const current = useMemo(() => {
    if (focusId) return apps.find(a => a.id === Number(focusId)) || apps[0]
    return apps.find(a => ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED'].includes(a.status))
      || apps.find(a => a.status !== 'WITHDRAWN') || apps[0]
  }, [apps, focusId])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['firm-verification'] })
    qc.invalidateQueries({ queryKey: ['tenants'] })
  }

  const open = useMutation({
    mutationFn: () => api.openOnBehalf(tenantId),
    onSuccess: () => { toast.success('Verification opened'); refresh() },
    onError: (e) => toast.error(errMsg(e)),
  })

  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>

  const approved = apps.find(a => a.status === 'APPROVED')
  const canRenew = approved && daysUntil(approved.verifiedUntil) !== null && daysUntil(approved.verifiedUntil) <= 60
  const hasOpen = apps.some(a => EDITABLE.includes(a.status) || ['SUBMITTED', 'UNDER_REVIEW'].includes(a.status))

  return (
    <div className="max-w-4xl space-y-6">
      <FlagBanner isAuditFirm={data?.isAuditFirm} approved={approved} />

      {!current && (
        <Empty icon={BadgeCheck} title={`${tenantName || 'This tenant'} has no audit-firm application`}>
          Verifications are started from Tenant Management → Audit-firm verifications → New verification,
          once the firm has emailed its registration details and certificates.
        </Empty>
      )}

      {current && (!hasOpen && (canRenew || ['REJECTED', 'REVOKED', 'EXPIRED', 'WITHDRAWN'].includes(current.status))) && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" icon={ShieldCheck} loading={open.isPending} onClick={() => open.mutate()}>
            {approved ? 'Start re-verification' : 'Start a new application'}
          </Button>
        </div>
      )}

      {current && <Application key={current.id} app={current} onChanged={refresh} />}

      {apps.length > 1 && (
        <div>
          <SectionTitle>History</SectionTitle>
          <div className="rounded-card border border-border divide-y divide-border/60 bg-surface-raised">
            {apps.filter(a => a.id !== current?.id).map(a => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span className="font-mono text-text-muted">#{a.id}</span>
                <StatusPill status={a.status} />
                <span className="text-text-secondary truncate flex-1">{a.firmLegalName}</span>
                <span className="text-text-muted">{a.verifiedUntil ? `until ${fmtDate(a.verifiedUntil)}` : fmtDate(a.decidedAt || a.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FlagBanner({ isAuditFirm, approved }) {
  if (isAuditFirm && approved) {
    const d = daysUntil(approved.verifiedUntil)
    return (
      <Callout variant={d !== null && d <= 30 ? 'warning' : 'success'} title="Verified audit firm">
        Clients can admit this firm's auditors. Verification runs until {fmtDate(approved.verifiedUntil)}
        {d !== null && d <= 60 ? ` (${d} days) — ask the firm for current evidence and start re-verification.` : '.'}
      </Callout>
    )
  }
  return null
}

// ─── One application ────────────────────────────────────────────────────────

function Application({ app, onChanged }) {
  const editable = EDITABLE.includes(app.status)
  const inReview = ['SUBMITTED', 'UNDER_REVIEW'].includes(app.status)
  const people = app.people || {}

  const steps = [
    { key: 'details',  label: 'Firm details',        done: !(app.problems || []).some(p => !/document|certificate|confirmation|click/i.test(p)) },
    { key: 'evidence', label: 'Evidence',            done: !(app.problems || []).some(p => /document|certificate/i.test(p)) },
    { key: 'email',    label: 'Email confirmation',  done: !!app.emailConfirmedAt },
    { key: 'review',   label: 'Review & decision',   done: ['APPROVED', 'REJECTED', 'REVOKED', 'EXPIRED', 'SUPERSEDED'].includes(app.status) },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Application #{app.id}</h2>
        <StatusPill status={app.status} />
        {app.verifiedUntil && <span className="text-xs text-text-muted">verified until {fmtDate(app.verifiedUntil)}</span>}
        <span className="ml-auto text-[11px] text-text-muted">
          {people.createdBy && <>Opened by {people.createdBy}</>}
          {people.submittedBy && <> · submitted by {people.submittedBy}</>}
          {people.decidedBy && <> · decided by {people.decidedBy}</>}
        </span>
        {editable && <WithdrawButton app={app} onChanged={onChanged} />}
      </div>

      <ol className="grid grid-cols-4 gap-2">
        {steps.map((s, i) => (
          <li key={s.key} className={cn('flex items-center gap-2 rounded-card border px-3 py-2 text-xs',
            s.done ? 'border-status-pass-bd bg-status-pass-bg/40 text-status-pass-fg' : 'border-border text-text-secondary')}>
            {s.done ? <CheckCircle2 size={13} /> : <CircleDot size={13} className="text-text-muted" />}
            <span className="font-medium">{i + 1}. {s.label}</span>
          </li>
        ))}
      </ol>

      {app.status === 'INFO_REQUESTED' && app.infoRequest && (
        <Callout variant="warning" title="Reviewer asked for more">{app.infoRequest}</Callout>
      )}
      {app.status === 'REJECTED' && <Callout variant="error" title="Rejected">{app.decisionNote}</Callout>}
      {app.status === 'REVOKED' && <Callout variant="error" title={`Revoked ${fmtDate(app.revokedAt)}`}>{app.revokeReason}</Callout>}
      {app.status === 'WITHDRAWN' && <Callout variant="info" title={`Withdrawn ${fmtDate(app.decidedAt)}`}>{app.decisionNote}</Callout>}

      <DetailsSection app={app} editable={editable} onChanged={onChanged} />
      <EvidenceSection app={app} editable={editable} onChanged={onChanged} />
      <EmailSection app={app} editable={editable} onChanged={onChanged} />

      {editable && <SubmitSection app={app} onChanged={onChanged} />}
      {inReview && <ReviewSection app={app} onChanged={onChanged} />}
      {app.status === 'APPROVED' && <ApprovedSection app={app} onChanged={onChanged} />}
    </div>
  )
}

// ─── Withdraw (opened by mistake, or the firm went quiet) ───────────────────

function WithdrawButton({ app, onChanged }) {
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const withdraw = useMutation({
    mutationFn: () => api.withdraw(app.id, reason),
    onSuccess: () => { toast.success('Application withdrawn'); setAsking(false); onChanged() },
    onError: (e) => toast.error(errMsg(e)),
  })
  if (!asking) {
    return <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setAsking(true)}>Withdraw</Button>
  }
  return (
    <div className="w-full flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface-overlay px-3 py-2">
      <span className="text-xs text-text-secondary">Withdraw application #{app.id}? It stays in the history; any confirmation link sent to the firm stops working.</span>
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional) — e.g. opened by mistake"
        className="h-7 flex-1 min-w-[200px] rounded-ctl border border-border bg-surface-raised px-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
      <Button size="xs" variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
      <Button size="xs" variant="danger" loading={withdraw.isPending} onClick={() => withdraw.mutate()}>Withdraw</Button>
    </div>
  )
}

// ─── 1. Details ─────────────────────────────────────────────────────────────

const DETAIL_KEYS = ['firmLegalName', 'firmType', 'registrationBody', 'registrationNumber', 'registrationValidUntil',
  'jurisdiction', 'website', 'contactName', 'contactEmail', 'contactDesignation', 'frameworks', 'partnerCount', 'statement']

function DetailsSection({ app, editable, onChanged }) {
  const pick = () => Object.fromEntries(DETAIL_KEYS.map(k => [k, app[k] ?? (k === 'frameworks' ? [] : '')]))
  const [f, setF] = useState(pick)
  useEffect(() => { setF(pick()) }, [app]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const dirty = JSON.stringify(f) !== JSON.stringify(pick())

  const save = useMutation({
    mutationFn: () => api.save(app.id, f),
    onSuccess: () => { toast.success('Details saved'); onChanged() },
    onError: (e) => toast.error(errMsg(e)),
  })

  if (!editable) {
    return (
      <section>
        <SectionTitle>Firm details</SectionTitle>
        <div className="grid grid-cols-3 gap-4 rounded-card border border-border p-4 bg-surface-raised">
          <Field label="Legal name">{app.firmLegalName}</Field>
          <Field label="Type">{FIRM_TYPES.find(t => t.value === app.firmType)?.label || app.firmType}</Field>
          <Field label="Jurisdiction">{app.jurisdiction}</Field>
          <Field label="Registered with">{app.registrationBody}</Field>
          <Field label="Registration no." mono>{app.registrationNumber}</Field>
          <Field label="Registration valid until">{app.registrationValidUntil ? fmtDate(app.registrationValidUntil) : null}</Field>
          <Field label="Website">{app.website && <a href={/^https?:/.test(app.website) ? app.website : `https://${app.website}`} target="_blank" rel="noreferrer" className="text-brand-ink hover:underline">{app.domain}</a>}</Field>
          <Field label="Authorised contact">{app.contactName}{app.contactDesignation ? `, ${app.contactDesignation}` : ''}</Field>
          <Field label="Contact email" mono>{app.contactEmail}</Field>
          <Field label="Frameworks" className="col-span-2">{(app.frameworks || []).join(', ')}</Field>
          <Field label="Partners">{app.partnerCount}</Field>
          {app.statement && <Field label="Notes from the firm" className="col-span-3">{app.statement}</Field>}
        </div>
      </section>
    )
  }

  return (
    <section>
      <SectionTitle actions={<Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save details</Button>}>
        1 · Firm details (as emailed by the firm)
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 rounded-card border border-border p-4 bg-surface-raised">
        <FormRow label="Firm legal name"><TextIn value={f.firmLegalName} onChange={e => set('firmLegalName', e.target.value)} /></FormRow>
        <FormRow label="Firm type"><SelectIn value={f.firmType} onChange={e => set('firmType', e.target.value)} placeholder="Select" options={FIRM_TYPES} /></FormRow>
        <FormRow label="Registered / accredited with"><SelectIn value={f.registrationBody} onChange={e => set('registrationBody', e.target.value)} placeholder="Select" options={BODIES.map(b => ({ value: b, label: b }))} /></FormRow>
        <FormRow label="Registration / accreditation number" hint="ICAI FRN, CPA licence, accreditation certificate no."><TextIn value={f.registrationNumber} onChange={e => set('registrationNumber', e.target.value)} /></FormRow>
        <FormRow label="Registration valid until" hint="Approval can't outlast this."><TextIn type="date" value={f.registrationValidUntil || ''} onChange={e => set('registrationValidUntil', e.target.value)} /></FormRow>
        <FormRow label="Jurisdiction (ISO country)"><TextIn maxLength={2} placeholder="IN" value={f.jurisdiction} onChange={e => set('jurisdiction', e.target.value.toUpperCase())} /></FormRow>
        <FormRow label="Firm website" hint="The contact email must be on this domain."><TextIn placeholder="https://examplefirm.com" value={f.website} onChange={e => set('website', e.target.value)} /></FormRow>
        <FormRow label="Partners (approx.)"><TextIn type="number" min="1" value={f.partnerCount} onChange={e => set('partnerCount', e.target.value)} /></FormRow>
        <FormRow label="Authorised contact name"><TextIn value={f.contactName} onChange={e => set('contactName', e.target.value)} /></FormRow>
        <FormRow label="Designation"><TextIn placeholder="Partner" value={f.contactDesignation} onChange={e => set('contactDesignation', e.target.value)} /></FormRow>
        <FormRow label="Contact email" hint="Free-mail (Gmail, Outlook…) is refused." className="col-span-2"><TextIn type="email" value={f.contactEmail} onChange={e => set('contactEmail', e.target.value)} /></FormRow>
        <div className="col-span-2">
          <p className="text-xs font-medium text-text-secondary mb-1.5">Frameworks the firm audits</p>
          <div className="flex flex-wrap gap-1.5">
            {FRAMEWORKS.map(fw => {
              const on = (f.frameworks || []).includes(fw)
              return (
                <button key={fw} type="button" onClick={() => set('frameworks', on ? f.frameworks.filter(x => x !== fw) : [...(f.frameworks || []), fw])}
                  className={cn('px-2 py-0.5 rounded-full text-[11px] border transition-colors',
                    on ? 'border-brand-500 bg-brand-500/10 text-brand-ink' : 'border-border text-text-muted hover:text-text-primary')}>
                  {fw.replace(/_/g, ' ')}
                </button>
              )
            })}
          </div>
        </div>
        <FormRow label="Notes from the firm's email" className="col-span-2"><TextArea rows={2} value={f.statement} onChange={e => set('statement', e.target.value)} /></FormRow>
      </div>
      {app.emailConfirmedAt && dirty && (
        <p className="mt-2 text-[11px] text-status-warn-fg flex items-center gap-1"><AlertTriangle size={11} />
          The firm confirmed the current details. Changing them withdraws that confirmation and a new email must be sent.</p>
      )}
    </section>
  )
}

// ─── 2. Evidence ────────────────────────────────────────────────────────────

function EvidenceSection({ app, editable, onChanged }) {
  if (editable) {
    return (
      <section>
        <SectionTitle>2 · Evidence (upload what the firm emailed)</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-card border border-border p-3 bg-surface-raised">
            <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5 mb-1"><FileCheck2 size={13} /> Registration or accreditation certificate</p>
            <p className="text-[11px] text-text-muted mb-2">ICAI firm registration, CPA licence / peer-review letter, NABCB / ANAB / UKAS accreditation, CERT-In empanelment letter, PCI SSC QSA listing.</p>
            <EvidenceUploader entityType={ENTITY} entityId={app.id} linkType="REGISTRATION" documentType="FIRM_VERIFICATION" compact onUploadSuccess={onChanged} />
          </div>
          <div className="rounded-card border border-border p-3 bg-surface-raised">
            <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5 mb-1"><FileCheck2 size={13} /> Supporting documents</p>
            <p className="text-[11px] text-text-muted mb-2">Peer-review report, professional indemnity cover, authorisation letter on firm letterhead, the firm's covering email (saved as PDF).</p>
            <EvidenceUploader entityType={ENTITY} entityId={app.id} linkType="OTHER" documentType="FIRM_VERIFICATION" compact onUploadSuccess={onChanged} />
          </div>
        </div>
      </section>
    )
  }
  return (
    <section>
      <SectionTitle>Evidence</SectionTitle>
      <EvidenceList app={app} />
    </section>
  )
}

function EvidenceList({ app }) {
  const [busy, setBusy] = useState(null)
  const download = async (docId) => {
    setBusy(docId)
    try {
      const r = await api.downloadUrl(app.id, docId)
      window.open(r.downloadUrl, '_blank', 'noopener')
    } catch (e) { toast.error(errMsg(e, 'Could not open the file')) }
    finally { setBusy(null) }
  }
  const ev = app.evidence || []
  if (!ev.length) return <p className="text-xs text-text-muted">No evidence attached.</p>
  return (
    <div className="rounded-card border border-border divide-y divide-border/60 bg-surface-raised">
      {ev.map(d => (
        <div key={d.linkId} className="flex items-center gap-3 px-3 py-2 text-xs">
          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
            d.category === 'REGISTRATION' || d.category === 'ACCREDITATION' ? 'bg-brand-500/10 text-brand-ink' : 'bg-surface-overlay text-text-muted')}>
            {d.category === 'REGISTRATION' ? 'Registration' : d.category === 'OTHER' ? 'Supporting' : d.category}
          </span>
          <span className="flex-1 truncate text-text-primary">{d.title}</span>
          <span className="text-text-muted">{fmtDate(d.createdAt)}</span>
          <Button size="xs" variant="ghost" icon={Download} loading={busy === d.documentId} onClick={() => download(d.documentId)}>Open</Button>
        </div>
      ))}
    </div>
  )
}

// ─── 3. Email confirmation ──────────────────────────────────────────────────

function EmailSection({ app, editable, onChanged }) {
  const send = useMutation({
    mutationFn: () => api.sendConfirmation(app.id),
    onSuccess: () => { toast.success(`Confirmation link sent to ${app.contactEmail}`); onChanged() },
    onError: (e) => toast.error(errMsg(e)),
  })
  const expired = app.emailExpiresAt && new Date(app.emailExpiresAt) < new Date()

  return (
    <section>
      <SectionTitle>{editable ? '3 · ' : ''}Email confirmation</SectionTitle>
      <div className="rounded-card border border-border p-4 bg-surface-raised flex items-start gap-3">
        <Mail size={16} className={app.emailConfirmedAt ? 'text-status-pass-fg mt-0.5' : 'text-text-muted mt-0.5'} />
        <div className="flex-1 text-xs text-text-secondary space-y-1">
          {app.emailConfirmedAt ? (
            <p className="text-status-pass-fg font-medium">Confirmed by the firm on {fmtDate(app.emailConfirmedAt)} via {app.emailSentTo}.</p>
          ) : app.emailSentAt ? (
            <p>
              Link sent to <span className="font-mono">{app.emailSentTo}</span> on {fmtDate(app.emailSentAt)}
              {expired ? <span className="text-status-fail-fg"> — expired, send a new one.</span> : <> · expires {fmtDate(app.emailExpiresAt)}. Waiting for the firm.</>}
            </p>
          ) : (
            <p>When the details and evidence are in, send the firm a one-time link. It shows them the details above;
              clicking <em>Confirm</em> proves they control a mailbox on their own domain and attests the details are accurate.</p>
          )}
          {app.emailSendCount > 0 && <p className="text-text-muted">Sent {app.emailSendCount} time(s).</p>}
        </div>
        {editable && !app.emailConfirmedAt && (
          <Button size="sm" variant={app.emailSentAt && !expired ? 'secondary' : 'primary'} icon={Send} loading={send.isPending} onClick={() => send.mutate()}>
            {app.emailSentAt ? 'Resend link' : 'Send confirmation'}
          </Button>
        )}
      </div>
    </section>
  )
}

// ─── 4. Submit ──────────────────────────────────────────────────────────────

function SubmitSection({ app, onChanged }) {
  const submit = useMutation({
    mutationFn: () => api.submit(app.id),
    onSuccess: () => { toast.success('Submitted for review'); onChanged() },
    onError: (e) => toast.error(errMsg(e)),
  })
  const problems = app.problems || []
  return (
    <section className="rounded-card border border-border p-4 bg-surface-raised space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">Ready for review?</p>
        <Button size="sm" icon={ClipboardCheck} disabled={problems.length > 0} loading={submit.isPending} onClick={() => submit.mutate()}>Submit for review</Button>
      </div>
      {problems.length > 0 ? (
        <ul className="space-y-1">
          {problems.map((p, i) => <li key={i} className="text-xs text-text-secondary flex gap-1.5"><AlertTriangle size={12} className="text-status-warn-fg shrink-0 mt-0.5" />{p}</li>)}
        </ul>
      ) : (
        <p className="text-xs text-text-muted flex items-center gap-1.5"><Info size={12} />
          Review and approval follow from the Review section once submitted.</p>
      )}
    </section>
  )
}

// ─── Review ─────────────────────────────────────────────────────────────────

function ReviewSection({ app, onChanged }) {
  const [c, setC] = useState({ registryChecked: false, registryNote: '', evidenceAuthentic: false, sanctionsChecked: false, independenceChecked: false })
  const [until, setUntil] = useState('')
  const [note, setNote] = useState('')
  const [question, setQuestion] = useState('')
  const [rejectNote, setRejectNote] = useState('')
  const set = (k, v) => setC(p => ({ ...p, [k]: v }))

  const m = (fn, ok) => ({ mutationFn: fn, onSuccess: () => { toast.success(ok); onChanged() }, onError: (e) => toast.error(errMsg(e)) })
  const start   = useMutation(m(() => api.startReview(app.id), 'Review started'))
  const approve = useMutation(m(() => api.approve(app.id, { checklist: c, verifiedUntil: until || undefined, note }), 'Approved — the tenant is now a verified audit firm'))
  const ask     = useMutation(m(() => api.requestInfo(app.id, question), 'Sent back for more information'))
  const reject  = useMutation(m(() => api.reject(app.id, rejectNote), 'Application rejected'))

  if (app.selfReviewBlocked) {
    return (
      <Callout variant="info" title="Waiting for another reviewer">
        You opened or submitted this application, so a different platform user must review it.
      </Callout>
    )
  }

  const ready = c.registryChecked && c.registryNote.trim() && c.evidenceAuthentic && c.sanctionsChecked

  return (
    <section className="space-y-4">
      <SectionTitle actions={app.status === 'SUBMITTED' &&
        <Button size="sm" variant="secondary" loading={start.isPending} onClick={() => start.mutate()}>Pick up review</Button>}>
        Review
      </SectionTitle>
      <div className="rounded-card border border-border p-4 bg-surface-raised space-y-3">
        <Check label="Registration verified on the public register" checked={c.registryChecked} onChange={v => set('registryChecked', v)}
          hint="ICAI member/firm search, state CPA board lookup, NABCB/ANAB/UKAS directory, CERT-In empanelled list, PCI SSC QSA list." />
        <FormRow label="What the register showed (URL, reference, date)">
          <TextIn value={c.registryNote} onChange={e => set('registryNote', e.target.value)} placeholder="ICAI FRN 012345S active as of 13 Oct 2026 — icai.org lookup" />
        </FormRow>
        <Check label="Evidence reviewed — names, numbers and dates are consistent" checked={c.evidenceAuthentic} onChange={v => set('evidenceAuthentic', v)} />
        <Check label="Sanctions / adverse-media check done on the firm and contact" checked={c.sanctionsChecked} onChange={v => set('sanctionsChecked', v)} />
        <Check label="No conflict with KashiGRC (not a related party)" checked={c.independenceChecked} onChange={v => set('independenceChecked', v)} />
        <div className="grid grid-cols-2 gap-3 pt-1">
          <FormRow label="Verified until (optional)" hint="Defaults to 12 months, capped at the registration expiry.">
            <TextIn type="date" value={until} onChange={e => setUntil(e.target.value)} />
          </FormRow>
          <FormRow label="Decision note"><TextIn value={note} onChange={e => setNote(e.target.value)} /></FormRow>
        </div>
        <div className="flex justify-end">
          <Button size="sm" variant="success" icon={BadgeCheck} disabled={!ready} loading={approve.isPending} onClick={() => approve.mutate()}>Approve as audit firm</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-card border border-border p-3 bg-surface-raised space-y-2">
          <p className="text-xs font-semibold text-text-primary">Need more from the firm?</p>
          <TextArea rows={2} value={question} onChange={e => setQuestion(e.target.value)} placeholder="What should the firm send?" />
          <Button size="sm" variant="secondary" disabled={!question.trim()} loading={ask.isPending} onClick={() => ask.mutate()}>Request information</Button>
          <p className="text-[11px] text-text-muted">Returns it to the preparer, who follows up with the firm by email.</p>
        </div>
        <div className="rounded-card border border-border p-3 bg-surface-raised space-y-2">
          <p className="text-xs font-semibold text-text-primary">Reject</p>
          <TextArea rows={2} value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Reason (kept on record)" />
          <Button size="sm" variant="danger" disabled={!rejectNote.trim()} loading={reject.isPending} onClick={() => reject.mutate()}>Reject</Button>
        </div>
      </div>
    </section>
  )
}

function Check({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-start gap-2 text-xs text-text-primary cursor-pointer">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}{hint && <span className="block text-[11px] text-text-muted">{hint}</span>}</span>
    </label>
  )
}

// ─── Approved ───────────────────────────────────────────────────────────────

function ApprovedSection({ app, onChanged }) {
  const [reason, setReason] = useState('')
  const revoke = useMutation({
    mutationFn: () => api.revoke(app.id, reason),
    onSuccess: () => { toast.success('Verification revoked — the audit-firm flag is off'); onChanged() },
    onError: (e) => toast.error(errMsg(e)),
  })
  let checklist = null
  try { checklist = app.checklistJson ? JSON.parse(app.checklistJson) : null } catch { /* shown raw below */ }
  return (
    <section className="space-y-3">
      {checklist && (
        <div className="rounded-card border border-border p-3 bg-surface-raised text-xs space-y-1">
          <p className="font-semibold text-text-primary">Reviewer record</p>
          <p className="text-text-secondary">Register: {checklist.registryNote}</p>
          <p className="text-text-secondary">Mailbox confirmed: {fmtDate(checklist.mailboxConfirmedAt)} via {checklist.mailboxConfirmedTo}</p>
          {app.decisionNote && <p className="text-text-secondary">Note: {app.decisionNote}</p>}
        </div>
      )}
      <div className="rounded-card border border-status-fail-bd/50 p-3 space-y-2">
        <p className="text-xs font-semibold text-status-fail-fg flex items-center gap-1.5"><ShieldOff size={13} /> Revoke verification</p>
        <p className="text-[11px] text-text-muted">Turns the audit-firm flag off immediately. Clients can no longer admit this firm, and it can't request access. Existing client grants are not removed.</p>
        <div className="flex gap-2">
          <TextIn value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (kept on record and emailed to the firm)" />
          <Button size="sm" variant="danger" disabled={!reason.trim()} loading={revoke.isPending} onClick={() => revoke.mutate()}>Revoke</Button>
        </div>
      </div>
    </section>
  )
}
