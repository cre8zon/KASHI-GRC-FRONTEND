import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, UserPlus, UserMinus, LogIn, RefreshCw, Users, CalendarClock, Plus, X } from 'lucide-react'
import { auditorAccessApi } from '../../api/auditorAccess.api'
import { usersApi } from '../../api/users.api'
import { rolesApi } from '../../api/roles.api'
import { useAuth, useSwitchTenant } from '../../hooks/useAuth'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { Skeleton } from '../../components/ui/EmptyState'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

/**
 * Clients — the FIRM side.
 *
 * Shows every client that has admitted this firm, and who from this firm is
 * staffed on each. Assigning is the firm's decision; the client granted the firm
 * and can revoke it, but does not pick individuals.
 *
 * "Open" switches the session into the client's tenant rather than rendering the
 * client's data here. That is deliberate: a cross-tenant read screen would have
 * to bypass tenant scoping, whereas switching re-points a single-tenant token
 * and reuses the client's own engagement screens with no new access path.
 */
export default function FirmClientsPage() {
  const qc = useQueryClient()
  const [assignTo, setAssignTo]   = useState(null)   // grant row
  const [withdraw, setWithdraw]   = useState(null)   // { clientTenantId, user }
  const { mutate: switchTenant, isPending: switching } = useSwitchTenant()
  const { userId: myUserId } = useAuth()

  const [showRequest, setShowRequest] = useState(false)

  const { data: raw, isLoading, refetch } = useQuery({
    queryKey: ['firm-clients'],
    queryFn:  () => auditorAccessApi.clients(),
  })
  const clients = unwrap(raw)

  const { data: reqRaw } = useQuery({
    queryKey: ['firm-access-requests'],
    queryFn:  () => auditorAccessApi.requests(),
  })
  const outgoing = ((reqRaw?.data?.data || reqRaw?.data || reqRaw)?.outgoing || [])
    .filter(r => r.status !== 'APPROVED')

  const { mutate: doWithdraw } = useMutation({
    mutationFn: ({ clientTenantId, userId }) =>
      auditorAccessApi.withdrawAuditor(clientTenantId, userId),
    onSuccess: () => {
      toast.success('Auditor withdrawn')
      qc.invalidateQueries({ queryKey: ['firm-clients'] })
      setWithdraw(null)
    },
    onError: (e) => toast.error(msg(e, 'Could not withdraw auditor')),
  })

  return (
    <PageLayout
      title="Clients"
      subtitle="Organizations that have admitted this firm, and who is staffed on each"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button size="sm" icon={Plus} onClick={() => setShowRequest(true)}>Request access</Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">

        {/* Outstanding asks, so a firm can see what it is waiting on rather than
            re-requesting or chasing by email. Declined ones stay visible with
            the client's reason — a refusal you cannot see is indistinguishable
            from one that was never answered. */}
        {outgoing.length > 0 && (
          <Card>
            <CardBody>
              <p className="text-[10px] uppercase tracking-wide text-text-muted mb-2">
                Requests awaiting a decision
              </p>
              <div className="divide-y divide-border/30">
                {outgoing.map(r => (
                  <div key={r.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary truncate">{r.clientName}</p>
                      <p className="text-[11px] text-text-muted truncate">
                        Requested {r.createdAt ? fmt(r.createdAt) : ''}
                        {r.decisionNote ? ` · ${r.clientName} said: ${r.decisionNote}` : ''}
                      </p>
                    </div>
                    <Badge value={r.status} label={r.status === 'PENDING' ? 'Awaiting decision'
                      : r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      colorTag={r.status === 'PENDING' ? 'amber' : 'gray'} />
                    {r.status === 'PENDING' && (
                      <Button variant="ghost" size="sm" icon={X}
                        title="Withdraw this request"
                        onClick={() => auditorAccessApi.withdrawRequest(r.id)
                          .then(() => { toast.success('Request withdrawn'); qc.invalidateQueries({ queryKey: ['firm-access-requests'] }) })
                          .catch(e => toast.error(msg(e, 'Could not withdraw')))} />
                    )}
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {isLoading
          ? [1, 2].map(i => <Skeleton key={i} className="h-32 rounded-card" />)
          : clients.length === 0
            ? (
              <Card>
                <CardBody>
                  <div className="py-10 text-center">
                    <Building2 size={22} className="text-text-muted mx-auto mb-2" />
                    <p className="text-sm font-medium text-text-primary">No clients yet</p>
                    <p className="text-xs text-text-muted mt-1 max-w-md mx-auto leading-relaxed">
                      Either the client admits your firm from their own External Auditors
                      screen, or you request access with their organization code. Once
                      admitted, they appear here and you can assign the auditors who will
                      work on the engagement.
                    </p>
                  </div>
                </CardBody>
              </Card>
            )
            : clients.map(c => (
              <Card key={c.id}>
                <CardBody>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-card bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                      <Building2 size={16} className="text-brand-ink" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text-primary truncate">{c.clientName}</p>
                      <p className="text-[11px] text-text-muted">
                        {c.expiresAt ? `Access until ${fmt(c.expiresAt)}` : 'No end date'}
                        {c.note ? ` · ${c.note}` : ''}
                      </p>
                    </div>
                    <Badge value={c.status} colorTag={c.usable ? 'green' : 'gray'}
                      label={c.usable ? 'Active' : 'No access'} />
                    <Button variant="secondary" size="sm" icon={UserPlus}
                      disabled={!c.usable}
                      onClick={() => setAssignTo(c)}>Assign</Button>
                    {/* Open switches YOUR session into the client, so it needs
                        YOUR membership there — not just anyone's. A firm admin
                        who has staffed four auditors but not themselves has no
                        membership, and switchTenant correctly refuses with
                        "You do not have access to that organization". Checking
                        the assigned list for the current user makes that legible
                        before the click rather than after it. */}
                    {(() => {
                      const iAmStaffed = (c.assigned || [])
                        .some(a => String(a.userId) === String(myUserId) && a.usable)
                      // A firm ADMIN holds ORGANIZATION-side roles, and a user's
                      // roles all come from one side — so they can never be
                      // assigned as an auditor and can never open a client. A
                      // permanently disabled button is worse than none, so hide
                      // it and say why once, at the foot of the card.
                      if (!iAmStaffed) return null
                      return (
                        <Button size="sm" icon={LogIn} loading={switching}
                          disabled={!c.usable}
                          title="Work inside this client"
                          onClick={() => switchTenant(c.clientTenantId)}>Open</Button>
                      )
                    })()}
                  </div>

                  <div className="mt-3 pl-12">
                    <p className="text-[9px] uppercase tracking-wide text-text-muted mb-1.5 flex items-center gap-1">
                      <Users size={9} /> Assigned auditors ({(c.assigned || []).length})
                    </p>
                    {(c.assigned || []).length === 0
                      ? <p className="text-[11px] text-text-muted">Nobody assigned yet.</p>
                      : (
                        <div className="divide-y divide-border/30">
                          {c.assigned.map(a => (
                            <div key={a.membershipId} className="flex items-center gap-2 py-1.5">
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs text-text-primary truncate">
                                  {a.fullName || a.email}
                                </span>
                                <span className="block text-[10px] text-text-muted truncate">
                                  {a.roleName ? `${a.roleName.replace(/_/g, ' ')} · ` : ''}
                                  {a.email}
                                  {a.accessExpiresAt ? ` · until ${fmt(a.accessExpiresAt)}` : ''}
                                </span>
                              </span>
                              <Badge value={a.status} colorTag={a.usable ? 'green' : 'gray'}
                                label={a.usable ? 'Active' : 'No access'} />
                              <Button variant="ghost" size="sm" icon={UserMinus}
                                onClick={() => setWithdraw({ clientTenantId: c.clientTenantId, user: a })} />
                            </div>
                          ))}
                        </div>
                      )}
                    {!(c.assigned || []).some(a => String(a.userId) === String(myUserId) && a.usable) && (
                      <p className="mt-2 text-[10px] text-text-muted">
                        You staff this client but do not work in it. Only auditors assigned
                        here can open it — administrators hold organization-side roles and
                        cannot be assigned as auditors.
                      </p>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
      </div>

      {showRequest && (
        <RequestAccessModal
          onClose={() => setShowRequest(false)}
          onDone={() => {
            setShowRequest(false)
            qc.invalidateQueries({ queryKey: ['firm-access-requests'] })
          }} />
      )}

      {assignTo && (
        <AssignAuditorModal
          client={assignTo}
          onClose={() => setAssignTo(null)}
          onDone={() => {
            setAssignTo(null)
            qc.invalidateQueries({ queryKey: ['firm-clients'] })
          }} />
      )}

      <ConfirmDialog
        open={!!withdraw}
        title={`Withdraw ${withdraw?.user?.fullName || 'auditor'}?`}
        message="They lose access to this client immediately. Work they have already recorded is kept."
        confirmLabel="Withdraw"
        onConfirm={() => doWithdraw({
          clientTenantId: withdraw.clientTenantId,
          userId: withdraw.user.userId,
        })}
        onCancel={() => setWithdraw(null)} />
    </PageLayout>
  )
}

// ── Assign ───────────────────────────────────────────────────────────────────

/**
 * Staff a client, one role at a time.
 *
 * Role first, then everyone who holds it.
 *
 * The earlier shape — a user picker beside a role picker, one pair per person —
 * asked the same question twice. An auditor already carries their grade at the
 * firm; re-declaring it per client invited a mismatch where someone graded
 * AUDITOR_II at DigiOSec was placed as LEAD_AUDITOR at a client. And with a
 * hundred-plus controls in an engagement no single reviewer covers them all, so
 * the natural unit is "these four are the auditors on this job", not four
 * separate dialogs.
 *
 * So each block is one role and any number of its holders. The role still
 * travels to the client's tenant as their role there — it just defaults to the
 * one they already hold rather than being asked again.
 */
function AssignAuditorModal({ client, onClose, onDone }) {
  const [blocks, setBlocks] = useState([{ key: 1, roleId: '', userIds: [] }])
  const [results, setResults] = useState(null)

  const { data: usersRaw, isLoading: loadingUsers } = useQuery({
    queryKey: ['firm-auditor-users'],
    queryFn:  () => usersApi.list({ side: 'AUDITOR', membershipType: 'HOME', take: 200 }),
  })

  const { tenantId: firmTenantId } = useAuth()
  const { data: rolesRaw } = useQuery({
    queryKey: ['auditor-roles', firmTenantId],
    queryFn:  () => rolesApi.list(firmTenantId, 'AUDITOR'),
    enabled:  !!firmTenantId,
  })

  const users = unwrapItems(usersRaw)
  // Suspended roles are excluded here rather than by a hardcoded name list: the
  // hierarchy endpoint reports status but does not filter on it, so a role
  // retired in the RBAC screen would otherwise keep appearing.
  const roles = (() => {
    const body = rolesRaw?.data?.data || rolesRaw?.data || rolesRaw
    const tree = body?.hierarchy || {}
    const all  = tree.AUDITOR || Object.values(tree).flat() || []
    return all.filter(r => (r.status || 'ACTIVE') === 'ACTIVE')
  })()

  const roleIdOf = (r) => String(r.role_id ?? r.roleId ?? r.id)
  const roleName = (r) => (r.name || r.roleName || '').replace(/_/g, ' ')
  const uidOf    = (u) => String(u.userId || u.id)
  const nameOf   = (u) => (u.fullName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email)

  // Only holders of the chosen role. This is the point of the reshape: the list
  // answers "who at this firm is a lead auditor" rather than "everyone, pick
  // one and tell us their grade again".
  const holdersOf = (roleId) => users.filter(u =>
    (u.roles || []).some(r => String(r.roleId ?? r.role_id ?? r.id) === String(roleId)))

  const alreadyAssigned = new Set((client.assigned || []).map(a => String(a.userId)))
  const usedRoles = new Set(blocks.map(b => b.roleId).filter(Boolean))

  const setBlock  = (key, patch) =>
    setBlocks(bs => bs.map(b => (b.key === key ? { ...b, ...patch } : b)))
  const addBlock  = () => setBlocks(bs => [...bs, { key: Date.now(), roleId: '', userIds: [] }])
  const dropBlock = (key) => setBlocks(bs => bs.filter(b => b.key !== key))

  const toggleUser = (key, userId) => setBlocks(bs => bs.map(b => {
    if (b.key !== key) return b
    const has = b.userIds.includes(userId)
    return { ...b, userIds: has ? b.userIds.filter(x => x !== userId) : [...b.userIds, userId] }
  }))

  // Flattened to one assignment per (user, role) pair.
  const pairs = blocks.flatMap(b => b.roleId
    ? b.userIds.map(userId => ({ userId, roleId: b.roleId }))
    : [])

  const { mutate: assignAll, isPending } = useMutation({
    mutationFn: async () => {
      const settled = await Promise.allSettled(
        pairs.map(pr => auditorAccessApi.assignAuditor(client.clientTenantId, {
          userId: Number(pr.userId),
          roleId: Number(pr.roleId),
        })),
      )
      return settled.map((s, i) => ({
        userId: pairs[i].userId,
        ok: s.status === 'fulfilled',
        error: s.status === 'rejected'
          ? (s.reason?.response?.data?.error?.message || 'Failed')
          : null,
      }))
    },
    onSuccess: (res) => {
      const ok = res.filter(r => r.ok).length
      const failed = res.filter(r => !r.ok)
      if (failed.length === 0) {
        toast.success(`${ok} auditor${ok === 1 ? '' : 's'} assigned`)
        onDone()
      } else {
        // Partial success is worth showing rather than closing and leaving the
        // user to work out who actually landed.
        toast.error(`${ok} assigned, ${failed.length} failed`)
        setResults(res)
      }
    },
    onError: (e) => toast.error(msg(e, 'Could not assign auditors')),
  })

  const selectCls = 'h-10 w-full rounded-card border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <Modal open onClose={onClose} title={`Assign auditors to ${client.clientName}`} size="lg">
      <div className="space-y-4">

        {loadingUsers ? (
          <Skeleton className="h-10 rounded-card" />
        ) : users.length === 0 ? (
          <div className="p-3 rounded-card border border-status-warn-bd bg-status-warn-bg/30">
            <p className="text-xs text-text-primary">No auditor-side users in this firm yet.</p>
            <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
              Create them under Users with an AUDITOR-side role. Only auditor-side staff can be
              placed with a client; administrators and back-office users cannot.
            </p>
          </div>
        ) : (
          <>
            {blocks.map((block, i) => {
              const holders = block.roleId ? holdersOf(block.roleId) : []
              return (
                <div key={block.key} className="rounded-card border border-border p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide block mb-1.5">
                        Role *
                      </label>
                      <select value={block.roleId} className={selectCls}
                        onChange={e => setBlock(block.key, { roleId: e.target.value, userIds: [] })}>
                        <option value="">Select a role…</option>
                        {roles.map(r => {
                          const id = roleIdOf(r)
                          const n  = holdersOf(id).length
                          return (
                            <option key={id} value={id}
                              disabled={usedRoles.has(id) && block.roleId !== id}>
                              {roleName(r)} ({n} {n === 1 ? 'auditor' : 'auditors'})
                            </option>
                          )
                        })}
                      </select>
                    </div>
                    {blocks.length > 1 && (
                      <div className="pt-[26px]">
                        <Button variant="ghost" size="sm" icon={X}
                          onClick={() => dropBlock(block.key)} />
                      </div>
                    )}
                  </div>

                  {block.roleId && (
                    holders.length === 0 ? (
                      <p className="text-[11px] text-text-muted">
                        Nobody at this firm holds that role.
                      </p>
                    ) : (
                      <div>
                        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                          Auditors — pick as many as the engagement needs
                        </p>
                        <div className="max-h-44 overflow-y-auto rounded-ctl border border-border divide-y divide-border/30">
                          {holders.map(u => {
                            const id = uidOf(u)
                            const taken = alreadyAssigned.has(id)
                            return (
                              <label key={id}
                                className={cn('flex items-center gap-2 px-3 py-2 cursor-pointer',
                                  taken ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-overlay')}>
                                <input type="checkbox" disabled={taken}
                                  checked={block.userIds.includes(id)}
                                  onChange={() => toggleUser(block.key, id)}
                                  className="h-3.5 w-3.5 rounded border-border accent-brand-500" />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-xs text-text-primary truncate">{nameOf(u)}</span>
                                  <span className="block text-[10px] text-text-muted truncate">{u.email}</span>
                                </span>
                                {taken && (
                                  <span className="text-[9px] uppercase tracking-wide text-text-muted shrink-0">
                                    already assigned
                                  </span>
                                )}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )
            })}

            <Button variant="secondary" size="sm" icon={Plus} onClick={addBlock}>
              Add another role
            </Button>

            <p className="text-[11px] text-text-muted leading-relaxed">
              Staff the whole engagement team now. The lead auditor can only assign sections and
              controls to auditors already placed here, so anyone missing will not appear to them
              during fieldwork.
            </p>

            <div className="flex items-start gap-2 p-3 rounded-card bg-surface-overlay border border-border">
              <CalendarClock size={13} className="text-text-muted shrink-0 mt-0.5" />
              <p className="text-[11px] text-text-muted leading-relaxed">
                {client.expiresAt
                  ? `Access runs until ${fmt(client.expiresAt)}, set by ${client.clientName}. Ask them to extend it if the engagement runs longer.`
                  : `${client.clientName} has not set an end date, so access continues until they revoke it.`}
              </p>
            </div>
          </>
        )}

        {results && (
          <div className="rounded-card border border-border divide-y divide-border/40">
            {results.map(r => {
              const u = users.find(x => uidOf(x) === String(r.userId))
              return (
                <div key={r.userId} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-xs text-text-primary flex-1 truncate">
                    {u ? nameOf(u) : `User ${r.userId}`}
                  </span>
                  <span className={cn('text-[10px]',
                    r.ok ? 'text-status-pass-fg' : 'text-status-fail-fg')}>
                    {r.ok ? 'Assigned' : r.error}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {results ? 'Close' : 'Cancel'}
          </Button>
          <Button size="sm" loading={isPending} disabled={pairs.length === 0}
            onClick={() => assignAll()}>
            {pairs.length > 1 ? `Assign ${pairs.length} auditors` : 'Assign'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Ask a client for access, identified by their organization code.
 *
 * A code the client hands over, not a picker. Letting a firm browse every
 * organisation on the platform to find someone to ask would turn this screen
 * into a directory of who uses the product — and the server enforces the same
 * rule, so this is not merely a UI choice.
 */
function RequestAccessModal({ onClose, onDone }) {
  const [clientCode, setClientCode] = useState('')
  const [until, setUntil]           = useState('')
  const [message, setMessage]       = useState('')

  const { mutate: send, isPending } = useMutation({
    mutationFn: () => auditorAccessApi.requestAccess({
      clientCode: clientCode.trim(),
      requestedUntil: until || null,
      message: message || null,
    }),
    // The server answers identically whether or not the code matched — it must
    // not reveal which organizations exist — so the toast says what was done,
    // not what was found.
    onSuccess: () => {
      toast.success('Request sent. You will be told when they decide.')
      onDone()
    },
    onError: (e) => toast.error(msg(e, 'Could not send request')),
  })

  const inputCls = 'h-10 w-full rounded-card border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <Modal open onClose={onClose} title="Request client access">
      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide block mb-1.5">
            Client organization code *
          </label>
          <input value={clientCode} onChange={e => setClientCode(e.target.value)}
            className={inputCls} placeholder="e.g. ISO27001" autoFocus />
          <p className="text-[10px] text-text-muted mt-1">
            Ask your client for their organization code — it is on their tenant settings.
            Check it carefully: for privacy we cannot confirm whether a code exists, so a
            typo looks the same as a request that was sent.
          </p>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide block mb-1.5">
            Suggested end date
          </label>
          <input type="date" value={until} onChange={e => setUntil(e.target.value)}
            min={new Date().toISOString().slice(0, 10)} className={inputCls} />
          <p className="text-[10px] text-text-muted mt-1">
            A suggestion only. The client sets the date that actually applies.
          </p>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide block mb-1.5">
            Message
          </label>
          <input value={message} onChange={e => setMessage(e.target.value)} className={inputCls}
            placeholder="e.g. FY26 SOC 2 Type II, engagement letter signed 12 Aug" />
          <p className="text-[10px] text-text-muted mt-1">
            Give them something to recognise. An unexplained request from an unfamiliar
            firm is one that gets declined.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isPending} disabled={!clientCode.trim()}
            onClick={() => send()}>Send request</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

const unwrap      = (r) => Array.isArray(r) ? r : (r?.data?.data || r?.data || [])
const unwrapItems = (r) => r?.items || r?.data?.items || (Array.isArray(r?.data) ? r.data : []) || []
const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const msg = (e, fallback) => e?.response?.data?.error?.message || e?.message || fallback