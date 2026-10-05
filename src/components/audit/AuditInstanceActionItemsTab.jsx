/**
 * AuditInstanceActionItemsTab — the Action items capability tab for audit
 * control, test and policy instances.
 *
 * WHY A SEPARATE PANEL, NOT ItemActionItems
 *   ItemActionItems is written for vendor-assessment remediations: its buttons
 *   call reviewApi.validateRemediation / acceptRisk and its thread is hard-wired
 *   to QUESTION_RESPONSE. Bending it to serve controls would put audit
 *   branches inside the vendor module's most-used component. This panel is
 *   small, audit-scoped, and talks only to the generic action-item read path
 *   plus the audit delegate endpoints.
 *
 * WHAT IT DOES
 *   • lists every delegation / send-back on this instance (live first)
 *   • lets someone who may do a piece of the work hand it to a colleague —
 *     POST /v1/audit/{control|test|policy}-instances/{id}/delegate
 *   • lets the delegator revoke an open delegation (status → DISMISSED; the
 *     server only allows resolutionReservedFor, i.e. the delegator)
 *   • lets the delegator REASSIGN it in one step —
 *     PUT /v1/audit/delegations/{itemId}/reassign (new one raised through the
 *     normal delegate checks first, then the old one closed)
 *   • highlights the item an inbox row opened (?actionItemId=)
 *
 * GATING — MIRRORS THE SERVER, INVENTS NOTHING
 *   Which work can be delegated comes from the entity's own flags, computed by
 *   ControlAccessGuard on the server — the same guard the delegate endpoint
 *   runs. canSubmitEvidence → EVIDENCE, canRecordResult → TESTING,
 *   canReviewPolicy → POLICY_REVIEW. Who can RECEIVE it is decided by the
 *   permission for that work (GET /v1/audit/delegate-candidates?work=), never
 *   by role name or side — the workflow decides sides.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  CheckCircle2, Clock, Send, Undo2, UserPlus, AlertTriangle, ArrowUpRight, X, RefreshCw,
} from 'lucide-react'
import api from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'
import { selectAuth } from '../../store/slices/authSlice'
import { useEntityActionItems } from '../../hooks/useActionItems'
import { actionItemsApi } from '../../api/actionItems.api'

// entityType → the instance endpoint segment.
const KIND = {
  AUDIT_CONTROL_INSTANCE: { path: 'control-instances', label: 'control' },
  AUDIT_TEST_INSTANCE:    { path: 'test-instances',    label: 'test' },
  AUDIT_POLICY_INSTANCE:  { path: 'policy-instances',  label: 'policy' },
}

// remediationType → what a reader should call it.
const TYPE_LABEL = {
  CONTROL_EVIDENCE_ASSIGNMENT: 'Evidence',
  CONTROL_TEST_ASSIGNMENT:     'Testing',
  CONTROL_REOPEN:              'Sent back',
  TEST_ASSIGNMENT:             'Test run',
  POLICY_REVIEW_ASSIGNMENT:    'Policy review',
}

// remediationType → the work kind the delegate-candidates endpoint takes.
const TYPE_WORK = {
  CONTROL_EVIDENCE_ASSIGNMENT: 'EVIDENCE',
  CONTROL_REOPEN:              'EVIDENCE',
  CONTROL_TEST_ASSIGNMENT:     'TESTING',
  TEST_ASSIGNMENT:             'TESTING',
  POLICY_REVIEW_ASSIGNMENT:    'POLICY_REVIEW',
}

const LIVE = new Set(['OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'PENDING_VALIDATION'])

const STATUS_CLS = {
  OPEN:               'bg-status-info-bg text-status-info-fg border-status-info-bd',
  IN_PROGRESS:        'bg-status-warn-bg text-status-warn-fg border-status-warn-bd',
  PENDING_REVIEW:     'bg-status-warn-bg text-status-warn-fg border-status-warn-bd',
  PENDING_VALIDATION: 'bg-status-warn-bg text-status-warn-fg border-status-warn-bd',
  RESOLVED:           'bg-status-pass-bg text-status-pass-fg border-status-pass-bd',
  DISMISSED:          'bg-surface-overlay text-text-muted border-border',
}

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

const unwrap = (d) => (Array.isArray(d) ? d : (d?.data?.data || d?.data || []))
const userLabel = (u) => (u?.fullName && u.fullName.trim() !== 'null null' ? u.fullName.trim() : null)
  || [u?.firstName, u?.lastName].filter(Boolean).join(' ')
  || u?.email
  || (u?.id ? `User #${u.id}` : '')

function fmtDate(v) {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function parseCtx(item) {
  try { return item?.navContext ? JSON.parse(item.navContext) : null } catch { return null }
}

// ── Delegate form ─────────────────────────────────────────────────────────────
function DelegateForm({ kind, entityId, sides, onDone }) {
  const qc = useQueryClient()
  // `sides` holds the work kinds this user may hand on: EVIDENCE | TESTING | POLICY_REVIEW.
  const [side, setSide]         = useState(sides[0])
  const [assignedTo, setAssign] = useState('')
  const [note, setNote]         = useState('')
  const [dueAt, setDueAt]       = useState('')
  const [priority, setPriority] = useState('MEDIUM')

  // Keep the chosen side valid if the entity's flags change underneath us.
  useEffect(() => { if (!sides.includes(side)) setSide(sides[0]) }, [sides, side])
  // A user picked for one side is not necessarily valid for the other.
  useEffect(() => { setAssign('') }, [side])

  const { data: candRes, isLoading: candLoading } = useQuery({
    queryKey: ['audit-delegate-candidates', side],
    queryFn:  () => api.get('/v1/audit/delegate-candidates', { params: { work: side } }),
    enabled:  !!side,
    staleTime: 60_000,
  })
  const candidates = useMemo(() => unwrap(candRes), [candRes])

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post(`/v1/audit/${kind.path}/${entityId}/delegate`, {
      assignedTo: Number(assignedTo),
      work:     side,
      note:     note.trim() || undefined,
      dueAt:    dueAt || undefined,
      priority,
    }),
    onSuccess: () => {
      toast.success('Delegated — it is in their inbox now')
      setAssign(''); setNote(''); setDueAt(''); setPriority('MEDIUM')
      onDone?.()
      qc.invalidateQueries({ queryKey: ['action-items-entity'] })
      qc.invalidateQueries({ queryKey: ['action-items-my'] })
      qc.invalidateQueries({ queryKey: ['action-items-count'] })
    },
    onError: (e) => toast.error(e?.message || 'Could not delegate'),
  })

  const sideLabel = (s) => ({ EVIDENCE: 'Evidence', TESTING: 'Testing', POLICY_REVIEW: 'Policy review' }[s] || s)

  return (
    <div className="rounded-card border border-brand-500/25 bg-brand-500/5 p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <UserPlus size={12} className="text-brand-ink" />
        <span className="text-[11px] font-semibold text-text-primary">Delegate this {kind.label}</span>
        <button onClick={onDone} className="ml-auto text-text-muted hover:text-text-primary" aria-label="Close">
          <X size={12} />
        </button>
      </div>

      {sides.length > 1 && (
        <div className="flex items-center gap-1.5">
          {sides.map(s => (
            <button key={s} onClick={() => setSide(s)}
              className={cn('text-[10px] px-2 py-1 rounded-ctl border transition-colors',
                side === s
                  ? 'border-brand-500/50 bg-brand-500/15 text-brand-ink font-medium'
                  : 'border-border text-text-muted hover:text-text-secondary')}>
              {sideLabel(s)}
            </button>
          ))}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[9px] uppercase tracking-wide text-text-muted">Delegate to</span>
        <select value={assignedTo} onChange={e => setAssign(e.target.value)} disabled={candLoading}
          className="text-xs bg-surface border border-border rounded-ctl px-2 py-1.5 text-text-primary
                     focus:outline-none focus:ring-1 focus:ring-brand-500">
          <option value="">{candLoading ? 'Loading people…' : 'Choose a colleague'}</option>
          {candidates.map(u => (
            <option key={u.id} value={u.id}>
              {userLabel(u)}{u.roleName ? ` — ${String(u.roleName).replace(/_/g, ' ')}` : ''}
            </option>
          ))}
        </select>
        {!candLoading && candidates.length === 0 && (
          <span className="text-[9px] text-text-muted">
            Nobody else here holds the permission for {sideLabel(side).toLowerCase()} work.
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[9px] uppercase tracking-wide text-text-muted">What you need (optional)</span>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          placeholder={side === 'EVIDENCE'
            ? 'e.g. Upload the Q3 access review export and the sign-off email'
            : 'e.g. Re-perform the sample of 25 joiners and record the result'}
          className="text-xs bg-surface border border-border rounded-ctl px-2 py-1.5 text-text-primary
                     placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-wide text-text-muted">Due (optional)</span>
          <input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)}
            className="text-xs bg-surface border border-border rounded-ctl px-2 py-1.5 text-text-primary
                       focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-wide text-text-muted">Priority</span>
          <select value={priority} onChange={e => setPriority(e.target.value)}
            className="text-xs bg-surface border border-border rounded-ctl px-2 py-1.5 text-text-primary
                       focus:outline-none focus:ring-1 focus:ring-brand-500">
            {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-[9px] text-text-muted leading-snug">
          They can work on this {kind.label} until they finish it or you revoke it.
        </span>
        <button onClick={() => mutate()} disabled={!assignedTo || isPending}
          className="shrink-0 flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-ctl bg-brand-500 text-white
                     hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed font-medium">
          <Send size={11} /> {isPending ? 'Delegating…' : 'Delegate'}
        </button>
      </div>
    </div>
  )
}

// ── Reassign (inline, on one live item) ───────────────────────────────────────
function ReassignInline({ item, onDone }) {
  const qc = useQueryClient()
  const work = TYPE_WORK[item.remediationType] || 'TESTING'
  const [assignedTo, setAssign] = useState('')

  const { data: candRes, isLoading: candLoading } = useQuery({
    queryKey: ['audit-delegate-candidates', work],
    queryFn:  () => api.get('/v1/audit/delegate-candidates', { params: { work } }),
    staleTime: 60_000,
  })
  // The current holder is not a choice — reassigning to them is a no-op.
  const candidates = useMemo(
    () => unwrap(candRes).filter(u => String(u.id) !== String(item.assignedTo)),
    [candRes, item.assignedTo])

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.put(`/v1/audit/delegations/${item.id}/reassign`, { assignedTo: Number(assignedTo) }),
    onSuccess: () => {
      toast.success('Reassigned — the new person has it in their inbox')
      onDone?.()
      qc.invalidateQueries({ queryKey: ['action-items-entity'] })
      qc.invalidateQueries({ queryKey: ['action-items-my'] })
      qc.invalidateQueries({ queryKey: ['action-items-count'] })
      qc.invalidateQueries({ queryKey: ['module-detail'] })
    },
    onError: (e) => toast.error(e?.message || 'Could not reassign'),
  })

  return (
    <div className="flex items-center gap-2 pt-1">
      <select value={assignedTo} onChange={e => setAssign(e.target.value)} disabled={candLoading}
        className="flex-1 min-w-0 text-[11px] bg-surface border border-border rounded-ctl px-2 py-1 text-text-primary
                   focus:outline-none focus:ring-1 focus:ring-brand-500">
        <option value="">{candLoading ? 'Loading people…' : 'Reassign to…'}</option>
        {candidates.map(u => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
      </select>
      <button onClick={() => mutate()} disabled={!assignedTo || isPending}
        className="shrink-0 text-[10px] px-2.5 py-1 rounded-ctl bg-brand-500 text-white hover:bg-brand-600
                   disabled:opacity-40 disabled:cursor-not-allowed font-medium">
        {isPending ? 'Reassigning…' : 'Reassign'}
      </button>
      <button onClick={onDone} className="text-text-muted hover:text-text-primary" aria-label="Cancel">
        <X size={11} />
      </button>
    </div>
  )
}

// ── One item ──────────────────────────────────────────────────────────────────
function ItemRow({ item, currentUserId, focused, onRevoke, revoking }) {
  const ref = useRef(null)
  const [reassigning, setReassigning] = useState(false)
  useEffect(() => {
    if (focused && ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focused])

  const live      = LIVE.has(item.status)
  const isMine    = item.assignedTo != null && String(item.assignedTo) === String(currentUserId)
  const ctx       = parseCtx(item)
  const workRoute = isMine && live ? ctx?.assigneeRoute : null
  const due       = fmtDate(item.dueAt)
  // ActionItemResponse's `boolean isOverdue` serialises as `overdue` (Lombok
  // names the getter isOverdue()). Read both, and fall back to the dates.
  const overdue   = item.overdue ?? item.isOverdue
    ?? (live && !!item.dueAt && new Date(item.dueAt).getTime() < Date.now())

  return (
    <div ref={ref}
      className={cn('px-3 py-2.5 border-b border-border/30 last:border-0 flex flex-col gap-1.5',
        focused && 'bg-brand-500/5 ring-1 ring-inset ring-brand-500/40',
        !live && 'opacity-70')}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-overlay border border-border text-text-secondary font-medium">
          {TYPE_LABEL[item.remediationType] || (item.remediationType || 'Action').replace(/_/g, ' ').toLowerCase()}
        </span>
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-medium', STATUS_CLS[item.status] || STATUS_CLS.OPEN)}>
          {String(item.status || '').replace(/_/g, ' ')}
        </span>
        {overdue && live && (
          <span className="text-[9px] px-1.5 py-0.5 rounded border bg-status-fail-bg text-status-fail-fg border-status-fail-bd flex items-center gap-1">
            <AlertTriangle size={8} /> Overdue
          </span>
        )}
        {isMine && live && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-ink border border-brand-500/30 font-medium">
            Yours
          </span>
        )}
        <span className="ml-auto text-[9px] text-text-muted font-mono">#{item.id}</span>
      </div>

      <p className="text-[11px] text-text-primary leading-snug">{item.title}</p>
      {item.description && (
        <p className="text-[10px] text-text-secondary leading-relaxed whitespace-pre-wrap">{item.description}</p>
      )}

      <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[9px] text-text-muted">
        <span>To <span className="text-text-secondary">{item.assignedToName || (item.assignedTo ? `#${item.assignedTo}` : '—')}</span></span>
        <span>From <span className="text-text-secondary">{item.createdByName || `#${item.createdBy}`}</span></span>
        {due && <span className="flex items-center gap-0.5"><Clock size={8} /> Due {due}</span>}
        {!live && item.resolutionNote && (
          <span className="flex items-center gap-0.5"><CheckCircle2 size={8} /> {item.resolutionNote}</span>
        )}
      </div>

      {(workRoute || (live && item.canResolve)) && (
        <div className="flex items-center gap-2 pt-0.5">
          {workRoute && (
            <Link to={workRoute}
              className="text-[10px] flex items-center gap-1 text-brand-ink font-medium hover:underline">
              <ArrowUpRight size={10} /> Go to the work
            </Link>
          )}
          {live && item.canResolve && !reassigning && (
            <button onClick={() => setReassigning(true)}
              className="ml-auto text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-ctl border border-border
                         text-text-muted hover:text-brand-ink hover:border-brand-500/40">
              <RefreshCw size={10} /> Reassign
            </button>
          )}
          {live && item.canResolve && (
            <button onClick={() => onRevoke(item)} disabled={revoking}
              className={cn('text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-ctl border border-border',
                         'text-text-muted hover:text-status-fail-fg hover:border-status-fail-bd disabled:opacity-40',
                         reassigning && 'ml-auto')}>
              <Undo2 size={10} /> Revoke
            </button>
          )}
        </div>
      )}
      {live && item.canResolve && reassigning && (
        <ReassignInline item={item} onDone={() => setReassigning(false)} />
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function AuditInstanceActionItemsTab({ entityType, entityId, entity, focusActionItemId }) {
  const qc   = useQueryClient()
  const auth = useSelector(selectAuth)
  const currentUserId = auth?.userId
  const kind = KIND[entityType]

  const [formOpen, setFormOpen] = useState(false)
  const [showClosed, setShowClosed] = useState(false)

  const { data: items = [], isLoading } = useEntityActionItems(entityType, entityId)

  // Work this user may hand on — the server's own answers, nothing derived here.
  const sides = useMemo(() => {
    const out = []
    if (entityType === 'AUDIT_CONTROL_INSTANCE' && entity?.canSubmitEvidence === true) out.push('EVIDENCE')
    if (entityType === 'AUDIT_CONTROL_INSTANCE' && entity?.canRecordResult === true)   out.push('TESTING')
    if (entityType === 'AUDIT_TEST_INSTANCE'    && entity?.canRecordResult === true)   out.push('TESTING')
    if (entityType === 'AUDIT_POLICY_INSTANCE'  && entity?.canReviewPolicy === true)   out.push('POLICY_REVIEW')
    return out
  }, [entityType, entity?.canSubmitEvidence, entity?.canRecordResult, entity?.canReviewPolicy])

  const sorted = useMemo(() => {
    const arr = Array.isArray(items) ? [...items] : []
    arr.sort((a, b) => {
      const la = LIVE.has(a.status) ? 0 : 1
      const lb = LIVE.has(b.status) ? 0 : 1
      if (la !== lb) return la - lb
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    })
    return arr
  }, [items])
  const live   = sorted.filter(i => LIVE.has(i.status))
  const closed = sorted.filter(i => !LIVE.has(i.status))

  // An inbox row for a closed item should still land on it.
  const focusId = focusActionItemId != null ? String(focusActionItemId) : null
  useEffect(() => {
    if (focusId && closed.some(i => String(i.id) === focusId)) setShowClosed(true)
  }, [focusId, closed.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const { mutate: revoke, isPending: revoking } = useMutation({
    mutationFn: (item) => actionItemsApi.updateStatus(item.id, 'DISMISSED', 'Revoked by delegator'),
    onSuccess: () => {
      toast.success('Delegation revoked')
      qc.invalidateQueries({ queryKey: ['action-items-entity'] })
      qc.invalidateQueries({ queryKey: ['action-items-my'] })
      qc.invalidateQueries({ queryKey: ['action-items-count'] })
      // Access follows the item — the record's own flags change with it.
      qc.invalidateQueries({ queryKey: ['module-detail'] })
    },
    onError: (e) => toast.error(e?.message || 'Could not revoke'),
  })

  if (!kind) return null

  return (
    <div className="flex flex-col gap-3 pb-6 max-w-2xl">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-text-primary">Delegations on this {kind.label}</p>
          <p className="text-[10px] text-text-muted leading-relaxed mt-0.5">
            Work on a {kind.label} belongs to whoever it is assigned to. Hand a piece of it to a
            colleague here — it lands in their inbox and lets them work on this {kind.label} only,
            until they finish it or you revoke it.
          </p>
        </div>
        {sides.length > 0 && !formOpen && (
          <button onClick={() => setFormOpen(true)}
            className="shrink-0 flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-ctl border border-brand-500/40
                       bg-brand-500/10 text-brand-ink hover:bg-brand-500/20 font-medium">
            <UserPlus size={11} /> Delegate
          </button>
        )}
      </div>

      {formOpen && sides.length > 0 && (
        <DelegateForm kind={kind} entityId={entityId} sides={sides} onDone={() => setFormOpen(false)} />
      )}

      <div className="border border-border rounded-card overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-surface-overlay/40">
          <span className="text-[11px] font-semibold text-text-secondary">Open</span>
          <span className="text-[9px] text-text-muted">{live.length}</span>
        </div>
        {isLoading ? (
          <div className="px-3 py-5 text-[11px] text-text-muted text-center">Loading…</div>
        ) : live.length === 0 ? (
          <div className="px-3 py-5 text-[11px] text-text-muted text-center">
            Nothing open. {sides.length > 0 ? `Use Delegate to hand part of this ${kind.label} to a colleague.` : ''}
          </div>
        ) : live.map(item => (
          <ItemRow key={item.id} item={item} currentUserId={currentUserId}
            focused={focusId === String(item.id)} onRevoke={revoke} revoking={revoking} />
        ))}
      </div>

      {closed.length > 0 && (
        <div className="border border-border rounded-card overflow-hidden">
          <button onClick={() => setShowClosed(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-surface-overlay/40 text-left">
            <span className="text-[11px] font-semibold text-text-secondary">Closed</span>
            <span className="text-[9px] text-text-muted">{closed.length}</span>
            <span className="ml-auto text-[9px] text-text-muted">{showClosed ? 'Hide' : 'Show'}</span>
          </button>
          {showClosed && closed.map(item => (
            <ItemRow key={item.id} item={item} currentUserId={currentUserId}
              focused={focusId === String(item.id)} onRevoke={revoke} revoking={revoking} />
          ))}
        </div>
      )}
    </div>
  )
}

export default AuditInstanceActionItemsTab