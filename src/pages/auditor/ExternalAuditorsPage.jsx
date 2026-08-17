import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck, UserMinus, Building2, RefreshCw, AlertTriangle } from 'lucide-react'
import { auditorAccessApi } from '../../api/auditorAccess.api'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { Skeleton } from '../../components/ui/EmptyState'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

/**
 * External Auditors — the CLIENT side.
 *
 * A client admin admits an audit firm and sets an end date. They never enter an
 * auditor's email: identities belong to the firm, and creating one here would
 * mean holding another company's employee credentials. Who actually staffs the
 * engagement is chosen by the firm, and shows up in the lower card once done.
 */
export default function ExternalAuditorsPage() {
  const qc = useQueryClient()
  const [showGrant, setShowGrant]   = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(null)   // grant row
  const [confirmGuest,  setConfirmGuest]  = useState(null)   // guest row

  const { data: grantsRaw, isLoading: loadingGrants, refetch } = useQuery({
    queryKey: ['auditor-access-grants'],
    queryFn:  () => auditorAccessApi.grants(),
  })
  const { data: guestsRaw, isLoading: loadingGuests } = useQuery({
    queryKey: ['auditor-access-guests'],
    queryFn:  () => auditorAccessApi.guests(),
  })

  const grants = unwrap(grantsRaw)
  const guests = unwrap(guestsRaw)

  const { data: reqRaw } = useQuery({
    queryKey: ['auditor-access-requests'],
    queryFn:  () => auditorAccessApi.requests(),
  })
  const pending = ((reqRaw?.data?.data || reqRaw?.data || reqRaw)?.incoming || [])
    .filter(r => r.status === 'PENDING')

  const { mutate: revokeGrant, isPending: revoking } = useMutation({
    mutationFn: (id) => auditorAccessApi.revokeGrant(id),
    onSuccess: (res) => {
      const n = unwrapOne(res)?.membershipsRevoked ?? 0
      toast.success(n > 0
        ? `Firm revoked — ${n} auditor${n === 1 ? '' : 's'} lost access`
        : 'Firm revoked')
      qc.invalidateQueries({ queryKey: ['auditor-access-grants'] })
      qc.invalidateQueries({ queryKey: ['auditor-access-guests'] })
      setConfirmRevoke(null)
    },
    onError: (e) => toast.error(msg(e, 'Could not revoke firm')),
  })

  const { mutate: revokeGuest } = useMutation({
    mutationFn: (membershipId) => auditorAccessApi.revokeGuest(membershipId),
    onSuccess: () => {
      toast.success('Auditor access revoked')
      qc.invalidateQueries({ queryKey: ['auditor-access-guests'] })
      setConfirmGuest(null)
    },
    onError: (e) => toast.error(msg(e, 'Could not revoke auditor')),
  })

  return (
    <PageLayout
      title="External Auditors"
      subtitle="Audit firms permitted to work in this organization"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button size="sm" icon={Plus} onClick={() => setShowGrant(true)}>Add audit firm</Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">

        {/* Pending requests come first: a firm is waiting on a decision, and
            burying that under the list of firms already admitted is how it ends
            up chased by email instead. Renders nothing when there are none. */}
        {pending.length > 0 && (
          <Card>
            <CardHeader
              title={`Access requests (${pending.length})`}
              subtitle="Audit firms asking to work in this organization" />
            <CardBody>
              <div className="divide-y divide-border/40">
                {pending.map(r => (
                  <PendingRequestRow key={r.id} req={r} qc={qc} />
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* ── Firms ─────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader title="Audit firms" subtitle="Each firm chooses which of its auditors work here" />
          <CardBody>
            {loadingGrants
              ? <Skeleton className="h-20 rounded-card" />
              : grants.length === 0
                ? <Empty
                    icon={ShieldCheck}
                    title="No audit firms admitted"
                    body="Add a firm to let its auditors work inside this organization. You choose the firm and the end date; the firm chooses which of its people staff the engagement." />
                : (
                  <div className="divide-y divide-border/40">
                    {grants.map(g => (
                      <div key={g.id} className="flex items-center gap-3 py-3">
                        <div className="w-8 h-8 rounded-card bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                          <Building2 size={15} className="text-brand-ink" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary truncate">{g.firmName}</p>
                          <p className="text-[11px] text-text-muted">
                            {g.expiresAt
                              ? `Access until ${fmt(g.expiresAt)}`
                              : 'No end date set'}
                            {g.note ? ` · ${g.note}` : ''}
                          </p>
                        </div>
                        <Badge
                          value={g.status}
                          colorTag={g.usable ? 'green' : 'gray'}
                          label={g.usable ? 'Active' : (g.status === 'REVOKED' ? 'Revoked' : 'Expired')} />
                        {g.usable && (
                          <Button variant="ghost" size="sm" icon={UserMinus}
                            onClick={() => setConfirmRevoke(g)}>Revoke</Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
          </CardBody>
        </Card>

        {/* ── People ────────────────────────────────────────────────────── */}
        {/* The people list lives on User Management: "who can see our data" is
            the question that page answers, and answering it with employees only
            is incomplete. This page keeps the firms — the commercial grant and
            its end date — which is a different question. */}
        <Card>
          <CardHeader
            title="Auditors with access"
            subtitle="Assigned by their firm. Also listed on User Management, alongside your own staff." />
          <CardBody>
            {loadingGuests
              ? <Skeleton className="h-20 rounded-card" />
              : guests.length === 0
                ? <Empty
                    icon={ShieldCheck}
                    title="No external auditors yet"
                    body="Once a firm has been admitted, its administrator assigns the auditors who will work here. They appear in this list." />
                : (
                  <div className="divide-y divide-border/40">
                    {guests.map(u => (
                      <div key={u.membershipId} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {u.fullName || u.email}
                          </p>
                          <p className="text-[11px] text-text-muted truncate">
                            {u.email}{u.firmName ? ` · ${u.firmName}` : ''}
                            {u.accessExpiresAt ? ` · until ${fmt(u.accessExpiresAt)}` : ''}
                          </p>
                        </div>
                        <Badge
                          value={u.status}
                          colorTag={u.usable ? 'green' : 'gray'}
                          label={u.usable ? 'Active' : 'No access'} />
                        {u.usable && (
                          <Button variant="ghost" size="sm" icon={UserMinus}
                            onClick={() => setConfirmGuest(u)}>Revoke</Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
          </CardBody>
        </Card>
      </div>

      {showGrant && (
        <GrantFirmModal
          onClose={() => setShowGrant(false)}
          onDone={() => {
            setShowGrant(false)
            qc.invalidateQueries({ queryKey: ['auditor-access-grants'] })
          }} />
      )}

      <ConfirmDialog
        open={!!confirmRevoke}
        title={`Revoke ${confirmRevoke?.firmName || 'firm'}?`}
        message="Every auditor this firm placed here loses access immediately. Engagements, evidence and recorded results are kept — the firm's people simply can no longer open them."
        confirmLabel="Revoke access"
        loading={revoking}
        onConfirm={() => revokeGrant(confirmRevoke.id)}
        onCancel={() => setConfirmRevoke(null)} />

      <ConfirmDialog
        open={!!confirmGuest}
        title={`Revoke ${confirmGuest?.fullName || 'auditor'}?`}
        message="This person loses access to your organization. Their firm keeps its access and can assign someone else."
        confirmLabel="Revoke access"
        onConfirm={() => revokeGuest(confirmGuest.membershipId)}
        onCancel={() => setConfirmGuest(null)} />
    </PageLayout>
  )
}

// ── Pending request ──────────────────────────────────────────────────────────

/**
 * One incoming request, with the decision attached.
 *
 * Approving asks for an end date rather than accepting the firm's suggestion
 * silently: the firm proposes, the client decides, and the server enforces that
 * by requiring expiresAt. Declining asks for a reason, which is sent to the
 * firm — a silent refusal leaves them chasing by email, which is the situation
 * this flow exists to remove.
 */
function PendingRequestRow({ req, qc }) {
  const [mode, setMode]   = useState(null)      // 'approve' | 'decline' | null
  const [until, setUntil] = useState(req.requestedUntil ? String(req.requestedUntil).slice(0, 10) : '')
  const [note, setNote]   = useState('')

  const done = () => {
    qc.invalidateQueries({ queryKey: ['auditor-access-requests'] })
    qc.invalidateQueries({ queryKey: ['auditor-access-grants'] })
    setMode(null)
  }

  const { mutate: approve, isPending: approving } = useMutation({
    mutationFn: () => auditorAccessApi.approveRequest(req.id, { expiresAt: until }),
    onSuccess: () => { toast.success(`${req.firmName} admitted`); done() },
    onError: (e) => toast.error(msg(e, 'Could not approve')),
  })

  const { mutate: decline, isPending: declining } = useMutation({
    mutationFn: () => auditorAccessApi.declineRequest(req.id, { note }),
    onSuccess: () => { toast.success('Request declined'); done() },
    onError: (e) => toast.error(msg(e, 'Could not decline')),
  })

  const inputCls = 'h-9 w-full rounded-card border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="py-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-card bg-status-warn-bg border border-status-warn-bd flex items-center justify-center shrink-0">
          <Building2 size={15} className="text-status-warn-fg" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary truncate">{req.firmName}</p>
          <p className="text-[11px] text-text-muted">
            Requested {req.createdAt ? fmt(req.createdAt) : ''}
            {req.requestedUntil ? ` · suggests access until ${fmt(req.requestedUntil)}` : ''}
          </p>
          {req.message && (
            <p className="text-[11px] text-text-secondary mt-1 italic">"{req.message}"</p>
          )}
        </div>
        {mode === null && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setMode('decline')}>Decline</Button>
            <Button size="sm" onClick={() => setMode('approve')}>Review & admit</Button>
          </>
        )}
      </div>

      {mode === 'approve' && (
        <div className="mt-3 ml-11 space-y-2">
          <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide block">
            Access until *
          </label>
          <input type="date" value={until} onChange={e => setUntil(e.target.value)}
            min={new Date().toISOString().slice(0, 10)} className={inputCls} />
          <p className="text-[10px] text-text-muted">
            Your date, not theirs. Caps every auditor {req.firmName} assigns.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMode(null)}>Cancel</Button>
            <Button size="sm" loading={approving} disabled={!until}
              onClick={() => approve()}>Admit firm</Button>
          </div>
        </div>
      )}

      {mode === 'decline' && (
        <div className="mt-3 ml-11 space-y-2">
          <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide block">
            Reason (sent to the firm)
          </label>
          <input value={note} onChange={e => setNote(e.target.value)} className={inputCls}
            placeholder="e.g. Engagement not yet approved internally" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMode(null)}>Cancel</Button>
            <Button size="sm" loading={declining} onClick={() => decline()}>Decline request</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add firm ─────────────────────────────────────────────────────────────────

function GrantFirmModal({ onClose, onDone }) {
  const [firmTenantId, setFirmTenantId] = useState('')
  const [expiresAt, setExpiresAt]       = useState('')
  const [note, setNote]                 = useState('')

  const { data: firmsRaw, isLoading } = useQuery({
    queryKey: ['auditor-access-firms'],
    queryFn:  () => auditorAccessApi.firms(),
  })
  const firms = unwrap(firmsRaw)

  const { mutate: grant, isPending } = useMutation({
    mutationFn: () => auditorAccessApi.grantFirm({
      firmTenantId: Number(firmTenantId),
      expiresAt: expiresAt || null,
      note: note || null,
    }),
    onSuccess: () => { toast.success('Audit firm added'); onDone() },
    onError: (e) => toast.error(msg(e, 'Could not add firm')),
  })

  const inputCls = 'h-10 w-full rounded-card border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <Modal open onClose={onClose} title="Add audit firm">
      <div className="space-y-4">

        <div>
          <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide block mb-1.5">
            Audit firm *
          </label>
          {isLoading
            ? <Skeleton className="h-10 rounded-card" />
            : firms.length === 0
              ? <p className="text-xs text-text-muted">
                  No audit firms are registered on the platform yet.
                </p>
              : (
                <select value={firmTenantId} onChange={e => setFirmTenantId(e.target.value)} className={inputCls}>
                  <option value="">Select a firm…</option>
                  {firms.map(f => <option key={f.tenantId} value={f.tenantId}>{f.name}</option>)}
                </select>
              )}
        </div>

        <div>
          <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide block mb-1.5">
            Access until *
          </label>
          <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
            min={new Date().toISOString().slice(0, 10)} className={inputCls} />
          <p className="text-[10px] text-text-muted mt-1">
            Caps every auditor this firm assigns — none can be given access beyond this date.
            Required: an open-ended grant is the one nobody revisits, and it would outlast
            both the engagement and the firm's own staff changes.
          </p>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide block mb-1.5">
            Note
          </label>
          <input value={note} onChange={e => setNote(e.target.value)} className={inputCls}
            placeholder="e.g. FY26 SOC 2 Type II" />
        </div>

        <div className="flex items-start gap-2 p-3 rounded-card bg-surface-overlay border border-border">
          <AlertTriangle size={13} className="text-text-muted shrink-0 mt-0.5" />
          <p className="text-[11px] text-text-muted leading-relaxed">
            The firm's administrator decides which of their auditors work here. You can
            revoke any individual, or the whole firm, at any time.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isPending} disabled={!firmTenantId || !expiresAt}
            onClick={() => grant()}>Add firm</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

function Empty({ icon: Icon, title, body }) {
  return (
    <div className="py-8 text-center">
      <Icon size={22} className="text-text-muted mx-auto mb-2" />
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="text-xs text-text-muted mt-1 max-w-md mx-auto leading-relaxed">{body}</p>
    </div>
  )
}

const unwrap    = (r) => Array.isArray(r) ? r : (r?.data?.data || r?.data || [])
const unwrapOne = (r) => r?.data?.data || r?.data || r
const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const msg = (e, fallback) => e?.response?.data?.error?.message || e?.message || fallback