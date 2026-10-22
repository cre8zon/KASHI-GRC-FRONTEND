/**
 * One enquiry: who, what they asked, where they came from, the timeline, and
 * the actions — status, owner, priority, notes, Convert to tenant.
 *
 * Every change is saved as it is made (PATCH) and written to the timeline by
 * the server, so there is no Save button to forget.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Building2, Mail, Phone, Globe2, UserPlus, UserMinus, Link2, ArrowRight, MessageSquare, Send, AlertTriangle, Sparkles, Check } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, SectionTitle, StatusPill, SelectIn, TextArea, errMsg, fmtDate, humanize } from '../billing/billingShared'
import { CreateTenantModal } from '../tenant/CreateTenantModal'
import { enquiriesApi } from '../../api/enquiries.api'
import { tenantsApi } from '../../api/tenants.api'
import { cn } from '../../lib/cn'
import { usePermission } from '../../hooks/usePermission'

/** Platform permission codes — must match EnquiryService.PERM_* on the server. */
export const ENQUIRY_PERMS = { VIEW: 'platform:enquiries:view', MANAGE: 'platform:enquiries:manage' }

export const TYPE_LABEL = {
  DEMO: 'Demo', TRIAL: 'Free trial', CONTACT_SALES: 'Contact sales', AUDIT_FIRM: 'Audit firm',
  PARTNERSHIP: 'Partnership', SUPPORT: 'Support', GENERAL: 'General',
}
export const typeTone = (t) => ({ DEMO: 'info', TRIAL: 'pass', CONTACT_SALES: 'tag', AUDIT_FIRM: 'tag', SUPPORT: 'warn' }[t] || 'muted')

const STATUS_CHOICES = [
  { value: 'NEW', label: 'New' }, { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'QUALIFIED', label: 'Qualified' }, { value: 'CLOSED', label: 'Closed' },
]

export function EnquiryDetailModal({ id, onClose, config }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const myId = useSelector(s => s.auth.userId)
  // Read-only for a platform user with view but not manage; the server enforces it either way.
  const canManage = usePermission().hasPermission(ENQUIRY_PERMS.MANAGE)
  const [note, setNote] = useState('')
  const [closing, setClosing] = useState(null)       // close reason being chosen
  const [converting, setConverting] = useState(false)
  const [linking, setLinking] = useState(false)

  const { data: e, isLoading } = useQuery({
    queryKey: ['enquiry', id], queryFn: () => enquiriesApi.get(id), enabled: !!id,
  })

  const refresh = (fresh) => {
    if (fresh) qc.setQueryData(['enquiry', id], fresh)
    qc.invalidateQueries({ queryKey: ['enquiries'] })
    qc.invalidateQueries({ queryKey: ['enquiries-stats'] })
    qc.invalidateQueries({ queryKey: ['nav-badge'] })
  }
  const patch = useMutation({
    mutationFn: (body) => enquiriesApi.update(id, body),
    onSuccess: (fresh) => { refresh(fresh); setClosing(null) },
    onError: (err) => toast.error(errMsg(err)),
  })
  const addNote = useMutation({
    mutationFn: () => enquiriesApi.addNote(id, note),
    onSuccess: (fresh) => { refresh(fresh); setNote('') },
    onError: (err) => toast.error(errMsg(err)),
  })

  const convertible = e && (config?.convertibleTypes || ['DEMO', 'TRIAL', 'CONTACT_SALES', 'AUDIT_FIRM', 'PARTNERSHIP', 'GENERAL']).includes(e.type)
  const converted = e?.status === 'CONVERTED'
  const closeReasons = config?.closeReasons || ['RESOLVED', 'NOT_A_FIT', 'NO_RESPONSE', 'DUPLICATE', 'SPAM', 'LOST_TO_COMPETITOR', 'BUDGET', 'OTHER']

  return (
    <>
      <Modal open={!!id && !converting} onClose={onClose} size="full"
        title={e ? `${e.fullName}${e.company ? ` · ${e.company}` : ''}` : 'Enquiry'}
        subtitle={e ? `${e.reference} · ${TYPE_LABEL[e.type] || e.type} · received ${fmtDate(e.createdAt)}` : null}>
        {isLoading || !e ? <p className="text-sm text-text-muted">Loading…</p> : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── Left: the request and its history ── */}
            <div className="lg:col-span-2 space-y-5 min-w-0">
              {(e.matchedTenantName || e.duplicateOfId || e.otherEnquiries?.length > 0) && (
                <div className="flex flex-wrap gap-2">
                  {e.matchedTenantName && (
                    <button onClick={() => { onClose(); navigate(`/tenants/${e.matchedTenantId}`) }}
                      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-ctl bg-status-info-bg text-status-info-fg">
                      <Building2 size={12} /> Existing customer: {e.matchedTenantName}
                    </button>
                  )}
                  {e.otherEnquiries?.length > 0 && (
                    <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-ctl bg-status-warn-bg text-status-warn-fg">
                      <AlertTriangle size={12} /> {e.otherEnquiries.length} other enquir{e.otherEnquiries.length === 1 ? 'y' : 'ies'} from this email:
                      {e.otherEnquiries.slice(0, 3).map(o => <span key={o.id} className="font-mono">{o.reference}</span>)}
                    </span>
                  )}
                </div>
              )}

              <div>
                <SectionTitle>{e.subject || (e.type === 'SUPPORT' ? 'Request' : 'Message')}</SectionTitle>
                <div className="rounded-card border border-border glass-card p-4 text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                  {e.message || <span className="text-text-muted">No message — they only filled in the form fields.</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 rounded-card border border-border glass-card p-4">
                <Field label="Email"><a href={`mailto:${e.email}?subject=${encodeURIComponent(`Re: your ${TYPE_LABEL[e.type]?.toLowerCase() || 'enquiry'} (${e.reference})`)}`} className="text-brand-ink hover:underline inline-flex items-center gap-1"><Mail size={12} />{e.email}</a></Field>
                <Field label="Phone">{e.phone && <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1"><Phone size={12} />{e.phone}</a>}</Field>
                <Field label="Job title">{e.jobTitle}</Field>
                <Field label="Company">{e.company}</Field>
                <Field label="Country">{e.country}</Field>
                <Field label="Employees">{e.employeeBand}</Field>
                <Field label="Vendors assessed">{e.vendorCount}</Field>
                <Field label="Interested in">{e.topic && humanize(e.topic)}</Field>
                <Field label="Heard about us" className="col-span-2">{e.heardAbout}</Field>
                <Field label="Marketing consent" className="col-span-2">
                  {e.marketingConsent ? `Yes · ${fmtDate(e.consentAt)}` : 'No — reply to this request only'}
                </Field>
              </div>

              <div>
                <SectionTitle>Where they came from</SectionTitle>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 rounded-card border border-border glass-card p-4">
                  <Field label="Form page" className="col-span-2" mono>{e.source?.sourcePage}</Field>
                  <Field label="First landed on" className="col-span-2" mono>{e.source?.landingPage}</Field>
                  <Field label="Referrer" className="col-span-2" mono>{e.source?.referrer}</Field>
                  <Field label="Audit-firm referral">
                    {e.source?.referralCode && <>{e.source.referralCode}{e.source.referralTenant && <span className="text-text-muted"> · {e.source.referralTenant}</span>}</>}
                  </Field>
                  <Field label="UTM source / medium">{[e.source?.utmSource, e.source?.utmMedium].filter(Boolean).join(' / ')}</Field>
                  <Field label="Campaign">{e.source?.utmCampaign}</Field>
                  <Field label="Term / content">{[e.source?.utmTerm, e.source?.utmContent].filter(Boolean).join(' / ')}</Field>
                </div>
              </div>

              <div>
                <SectionTitle>Timeline</SectionTitle>
                <ol className="space-y-3">
                  {(e.activities || []).map(a => <ActivityRow key={a.id} a={a} />)}
                </ol>
                {canManage && <div className="mt-3 rounded-card border border-border glass-card p-3 space-y-2">
                  <TextArea rows={3} value={note} onChange={ev => setNote(ev.target.value)}
                    placeholder="Add a note — call summary, what they need, next step. Visible to the platform team only." />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-text-muted">The first note on a New enquiry moves it to In progress and starts the response clock.</p>
                    <Button size="sm" icon={Send} disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()}>Add note</Button>
                  </div>
                </div>}
              </div>
            </div>

            {/* ── Right: state and actions ── */}
            <aside className="space-y-4">
              {converted ? (
                <div className="rounded-card border border-status-pass-bd bg-status-pass-bg p-4 space-y-2">
                  <p className="text-sm font-semibold text-status-pass-fg flex items-center gap-1.5"><Check size={14} /> Converted</p>
                  <p className="text-xs text-status-pass-fg">
                    {e.convertedTenantName} · {fmtDate(e.convertedAt)}{e.convertedByName ? ` by ${e.convertedByName}` : ''}
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => { onClose(); navigate(`/tenants/${e.convertedTenantId}`) }}>
                    Open tenant <ArrowRight size={13} />
                  </Button>
                </div>
              ) : convertible && canManage ? (
                <div className="rounded-card border border-brand-500/40 bg-brand-500/5 p-4 space-y-2">
                  <p className="text-sm font-semibold text-text-primary flex items-center gap-1.5"><Sparkles size={14} className="text-brand-ink" /> Ready to onboard?</p>
                  <p className="text-[11px] text-text-secondary leading-snug">
                    Opens Create Tenant filled in from this enquiry — company, contact as owner, plan, and the acquisition channel
                    {e.provisionDefaults?.acquisitionChannel ? ` (${humanize(e.provisionDefaults.acquisitionChannel)})` : ''}.
                    The enquiry is marked converted only if the tenant is created.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" icon={Building2} onClick={() => setConverting(true)}>Convert to tenant</Button>
                    <Button size="sm" variant="ghost" icon={Link2} onClick={() => setLinking(v => !v)}>Link existing</Button>
                  </div>
                  {linking && <TenantLinker enquiryId={e.id} onLinked={(fresh) => { refresh(fresh); setLinking(false) }} />}
                </div>
              ) : null}

              <div className="rounded-card border border-border glass-card p-4 space-y-3">
                <div>
                  <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Status</p>
                  {converted ? <StatusPill status="CONVERTED" /> : (
                    <SelectIn value={closing ? 'CLOSED' : e.status} disabled={patch.isPending || !canManage}
                      onChange={ev => ev.target.value === 'CLOSED' ? setClosing(e.type === 'SUPPORT' ? 'RESOLVED' : '') : patch.mutate({ status: ev.target.value })}
                      options={STATUS_CHOICES} />
                  )}
                  {e.status === 'CLOSED' && !closing && e.closedReason && (
                    <p className="text-[11px] text-text-muted mt-1">Reason: {humanize(e.closedReason)} · {fmtDate(e.closedAt)}</p>
                  )}
                  {closing !== null && (
                    <div className="mt-2 space-y-2 rounded-ctl border border-border p-2">
                      <SelectIn value={closing} onChange={ev => setClosing(ev.target.value)} placeholder="Why is this closed?"
                        options={closeReasons.map(r => ({ value: r, label: humanize(r) }))} />
                      <div className="flex gap-2 justify-end">
                        <Button size="xs" variant="ghost" onClick={() => setClosing(null)}>Cancel</Button>
                        <Button size="xs" disabled={!closing} loading={patch.isPending}
                          onClick={() => patch.mutate({ status: 'CLOSED', closedReason: closing })}>Close enquiry</Button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Owner</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-text-primary">{e.assignedToName || <span className="text-text-muted">Unassigned</span>}</span>
                    {!canManage ? null : e.assignedTo === myId
                      ? <Button size="xs" variant="ghost" icon={UserMinus} onClick={() => patch.mutate({ assignedTo: null })}>Unassign</Button>
                      : <Button size="xs" variant="secondary" icon={UserPlus} onClick={() => patch.mutate({ assignedTo: myId })}>Assign to me</Button>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Priority</span>
                    <SelectIn value={e.priority} disabled={!canManage} onChange={ev => patch.mutate({ priority: ev.target.value })}
                      options={(config?.priorities || ['LOW', 'NORMAL', 'HIGH'])} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Type</span>
                    <SelectIn value={e.type} disabled={converted || !canManage} onChange={ev => patch.mutate({ enquiryType: ev.target.value })}
                      options={(config?.types || Object.keys(TYPE_LABEL)).map(t => ({ value: t, label: TYPE_LABEL[t] || t }))} />
                  </label>
                </div>
                <Field label="Plan clicked on the website" mono>{e.planCode}</Field>
                <Field label="First response">{e.firstResponseAt ? fmtDate(e.firstResponseAt) : <span className="text-status-warn-fg text-xs">Not yet</span>}</Field>
              </div>
            </aside>
          </div>
        )}
      </Modal>

      {e && (
        <CreateTenantModal
          open={converting}
          onClose={() => setConverting(false)}
          enquiryId={e.id}
          initialValues={e.provisionDefaults}
          onCreated={() => refresh()}
        />
      )}
    </>
  )
}

function ActivityRow({ a }) {
  const isNote = a.kind === 'NOTE'
  const text = a.kind === 'RECEIVED' ? a.body
    : a.kind === 'STATUS' ? (a.body ? `${a.body}${a.fromValue || a.toValue ? ` (${humanize(a.fromValue)} → ${humanize(a.toValue)})` : ''}` : `Status ${humanize(a.fromValue)} → ${humanize(a.toValue)}`)
    : a.kind === 'ASSIGNED' ? `Owner ${a.fromValue || '—'} → ${a.toValue || '—'}`
    : a.kind === 'PRIORITY' ? `Priority ${humanize(a.fromValue)} → ${humanize(a.toValue)}`
    : a.body
  return (
    <li className="flex gap-3">
      <span className={cn('mt-1 w-6 h-6 rounded-full flex items-center justify-center shrink-0',
        isNote ? 'bg-brand-500/10 text-brand-ink' : a.kind === 'CONVERTED' ? 'bg-status-pass-bg text-status-pass-fg' : 'bg-surface-overlay text-text-muted')}>
        {isNote ? <MessageSquare size={11} /> : a.kind === 'RECEIVED' ? <Globe2 size={11} /> : <Check size={11} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-text-muted">{a.authorName} · {fmtDate(a.createdAt)} {a.createdAt && new Date(a.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</p>
        <p className={cn('text-sm whitespace-pre-wrap', isNote ? 'text-text-primary' : 'text-text-secondary')}>{text}</p>
      </div>
    </li>
  )
}

/** Search tenants by name/code and link the enquiry to one. */
function TenantLinker({ enquiryId, onLinked }) {
  const [q, setQ] = useState('')
  const params = useMemo(() => ({ take: 8, search: q ? `name=${q};code=${q}` : undefined }), [q])
  const { data } = useQuery({ queryKey: ['tenants', 'link', params], queryFn: () => tenantsApi.list(params), enabled: q.length >= 2 })
  const link = useMutation({
    mutationFn: (tenantId) => enquiriesApi.linkTenant(enquiryId, tenantId),
    onSuccess: (fresh) => { toast.success('Linked'); onLinked(fresh) },
    onError: (err) => toast.error(errMsg(err)),
  })
  return (
    <div className="space-y-1.5 pt-1">
      <input value={q} onChange={ev => setQ(ev.target.value)} placeholder="Search tenant name or code…" autoFocus
        className="h-8 w-full rounded-ctl border border-border glass-field px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
      {(data?.items || []).map(t => (
        <button key={t.tenantId} onClick={() => link.mutate(t.tenantId)} disabled={link.isPending}
          className="w-full text-left flex items-center justify-between px-2 py-1.5 rounded-ctl hover:bg-surface-overlay text-sm">
          <span>{t.name} <span className="text-[11px] font-mono text-text-muted">{t.code}</span></span>
          <Link2 size={12} className="text-text-muted" />
        </button>
      ))}
    </div>
  )
}

export default EnquiryDetailModal