/**
 * Audit-firm verifications — the platform queue.
 *
 * Left: applications by status. Right: the selected tenant's application, the
 * same panel as Tenant Detail → Audit firm. ?id= deep-links (notifications).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { BadgeCheck, ExternalLink, Plus, Search } from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { tenantsApi } from '../../../api/tenants.api'
import { usePermission } from '../../../hooks/usePermission'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button } from '../../../components/ui/Button'
import { firmVerificationAdminApi } from '../../../api/firmVerification.api'
import FirmApplicationPanel from '../../../components/firm/FirmApplicationPanel'
import { StatusPill, Empty, fmtDate, daysUntil, errMsg } from '../../../components/billing/billingShared'
import { cn } from '../../../lib/cn'

const VIEWS = [
  { key: 'queue',    label: 'Needs review', statuses: ['SUBMITTED', 'UNDER_REVIEW'] },
  { key: 'progress', label: 'In preparation', statuses: ['DRAFT', 'INFO_REQUESTED'] },
  { key: 'verified', label: 'Verified', statuses: ['APPROVED'] },
  { key: 'closed',   label: 'Closed', statuses: ['REJECTED', 'REVOKED', 'EXPIRED', 'SUPERSEDED', 'WITHDRAWN'] },
]

export default function FirmVerificationsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState('queue')
  const [starting, setStarting] = useState(false)
  // Must match FirmVerificationAdminController.PERM_PREPARE on the server.
  const canPrepare = usePermission().hasPermission('platform.firm_verification.prepare')
  const { data = [], isLoading } = useQuery({ queryKey: ['firm-verification', 'list'], queryFn: () => firmVerificationAdminApi.list() })

  const selectedId = params.get('id') ? Number(params.get('id')) : null
  const selected = (data || []).find(a => a.id === selectedId)

  // A deep link to an application in another bucket switches the bucket.
  useEffect(() => {
    if (!selected) return
    const v = VIEWS.find(x => x.statuses.includes(selected.status))
    if (v && v.key !== view) setView(v.key)
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const st = VIEWS.find(v => v.key === view).statuses
    return (data || []).filter(a => st.includes(a.status))
  }, [data, view])
  const count = (v) => (data || []).filter(a => v.statuses.includes(a.status)).length

  const select = (id) => setParams(prev => { const n = new URLSearchParams(prev); n.set('id', String(id)); return n }, { replace: true })

  return (
    <PageLayout title="Audit-firm verifications" subtitle="Prepared by platform users from what the firm emails, confirmed by the firm, decided by a platform reviewer"
      actions={canPrepare && <Button size="sm" icon={Plus} onClick={() => setStarting(true)}>New verification</Button>}>
      <div className="px-6 pt-2 pb-6 grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {VIEWS.map(v => (
              <button key={v.key} onClick={() => setView(v.key)} className={cn('px-2.5 py-1 rounded-ctl text-xs font-medium',
                view === v.key ? 'bg-brand-500 text-brand-900' : 'bg-surface-overlay text-text-secondary hover:text-text-primary')}>
                {v.label} <span className="opacity-70">{count(v)}</span>
              </button>
            ))}
          </div>
          {isLoading ? <p className="text-sm text-text-muted">Loading…</p> : rows.length === 0 ? (
            <p className="text-xs text-text-muted py-6 text-center">Nothing here.</p>
          ) : (
            <div className="rounded-card border border-border divide-y divide-border/60 bg-surface-raised">
              {rows.map(a => {
                const d = daysUntil(a.verifiedUntil)
                return (
                  <button key={a.id} onClick={() => select(a.id)}
                    className={cn('w-full text-left px-3 py-2.5 hover:bg-surface-overlay/50', a.id === selectedId && 'bg-brand-500/5')}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate flex-1">{a.firmLegalName || a.tenantName}</span>
                      <StatusPill status={a.status} />
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      {a.tenantName} · {a.registrationBody || '—'} {a.registrationNumber || ''}
                      {a.status === 'APPROVED' && d !== null && <> · <span className={d <= 30 ? 'text-status-warn-fg' : ''}>until {fmtDate(a.verifiedUntil)}</span></>}
                      {a.submittedAt && a.status !== 'APPROVED' && <> · submitted {fmtDate(a.submittedAt)}</>}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="col-span-12 lg:col-span-8">
          {selected ? (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => navigate(`/tenants/${selected.tenantId}?tab=audit-firm`)}>Open tenant</Button>
              </div>
              <FirmApplicationPanel tenantId={selected.tenantId} tenantName={selected.tenantName} focusId={selected.id} />
            </div>
          ) : (
            <Empty icon={BadgeCheck} title="Select an application">
              To verify a firm, use <b>New verification</b> and pick its tenant (create the tenant first if it does not exist).
              The tenant then shows an Audit firm tab with the same application.
            </Empty>
          )}
        </div>
      </div>
      <StartVerificationModal open={starting} onClose={() => setStarting(false)}
        onStarted={(app) => { setStarting(false); setView('progress'); select(app.id) }} />
    </PageLayout>
  )
}

/**
 * Pick the firm's tenant and open its application. If the tenant already has
 * one in progress, the server returns that instead of opening a second.
 */
function StartVerificationModal({ open, onClose, onStarted }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const params = useMemo(() => ({ take: 10, search: q ? `name=${q};code=${q}` : undefined }), [q])
  const { data, isFetching } = useQuery({
    queryKey: ['tenants', 'firm-start', params], queryFn: () => tenantsApi.list(params), enabled: open && q.trim().length >= 2,
  })
  const start = useMutation({
    mutationFn: (tenantId) => firmVerificationAdminApi.openOnBehalf(tenantId),
    onSuccess: (app) => {
      toast.success('Verification opened')
      qc.invalidateQueries({ queryKey: ['firm-verification'] })
      setQ('')
      onStarted(app)
    },
    onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <Modal open={open} onClose={onClose} size="md" title="New audit-firm verification"
      subtitle="Choose the firm's tenant. Its details and evidence are entered from what the firm emails.">
      <div className="space-y-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search tenant name or code…"
            className="h-9 w-full pl-8 pr-3 rounded-ctl border border-border bg-surface-raised text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        {q.trim().length < 2 ? <p className="text-xs text-text-muted px-1">Type at least two characters.</p>
          : isFetching ? <p className="text-xs text-text-muted px-1">Searching…</p>
          : (data?.items || []).length === 0 ? <p className="text-xs text-text-muted px-1">No tenant matches. Create the firm's tenant first.</p>
          : (data.items).map(t => (
            <button key={t.tenantId} disabled={start.isPending} onClick={() => start.mutate(t.tenantId)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-ctl hover:bg-surface-overlay text-left">
              <span className="text-sm text-text-primary">{t.name} <span className="text-[11px] font-mono text-text-muted">{t.code}</span></span>
              <span className="text-xs text-brand-ink">Start →</span>
            </button>
          ))}
      </div>
    </Modal>
  )
}
