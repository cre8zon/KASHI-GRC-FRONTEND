/**
 * EngagementSectionsTab.jsx
 *
 * Shows section instances as a collapsible tree for an engagement.
 * Assignment UI is driven purely by vc.permissions — no hardcoded roles.
 *
 * Permission gates:
 *   audit:section:assign-auditor   → show Assign Auditor on section rows
 *   audit:section:assign-auditee   → show Assign Auditee on section rows
 *   audit:control:assign-auditee   → show Assign Auditee on control rows
 *   audit:section:submit           → show Submit on section rows
 *   audit:section:reopen           → show Reopen on submitted sections
 *
 * APIs used:
 *   GET  /v1/audit/engagements/{id}/sections
 *   GET  /v1/audit/engagements/{id}/controls
 *   GET  /v1/users?side=AUDITOR&take=200      (for auditor picker)
 *   GET  /v1/users?side=AUDITEE&take=200      (for auditee picker)
 *   PUT  /v1/audit/engagements/{id}/sections/{sid}/assign
 *   PUT  /v1/audit/engagements/{id}/sections/{sid}/assign-auditee
 *   PUT  /v1/audit/engagements/{id}/controls/{cid}/assign-auditee
 *   POST /v1/audit/engagements/{id}/sections/{sid}/submit
 *   POST /v1/audit/engagements/{id}/sections/{sid}/reopen
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import {
  ChevronRight, ChevronDown, Layers, CheckSquare,
  CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  User, Calendar, UserPlus, UserCheck, Users,
  RefreshCw, CheckCheck, X, Search, ChevronUp, Eye, EyeOff,
} from 'lucide-react'
import api    from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast  from 'react-hot-toast'

// ── API helpers ───────────────────────────────────────────────────────────────
const fetchSections   = (id)   => api.get(`/v1/audit/engagements/${id}/sections`)
const fetchControls   = (id)   => api.get(`/v1/audit/engagements/${id}/controls`)
const fetchUsers      = (side) => api.get(`/v1/users`, { params: { side, take: 200 } })

const assignAuditor        = (eid, sid, body) => api.put(`/v1/audit/engagements/${eid}/sections/${sid}/assign`, body)
const assignSectionAuditee = (eid, sid, body) => api.put(`/v1/audit/engagements/${eid}/sections/${sid}/assign-auditee`, body)
const assignControlAuditee = (eid, cid, body) => api.put(`/v1/audit/engagements/${eid}/controls/${cid}/assign-auditee`, body)
const submitSection        = (eid, sid, body) => api.post(`/v1/audit/engagements/${eid}/sections/${sid}/submit`, body)
const reopenSection        = (eid, sid)       => api.post(`/v1/audit/engagements/${eid}/sections/${sid}/reopen`)

// ── Role name constants ─────────────────────────────────────────────────────────────
const ROLE_AUDITOR_ROLE        = 'AUDITOR_ROLE'
const ROLE_AUDITEE_CONTRIBUTOR = 'AUDITEE_CONTRIBUTOR'

// ── uid: normalise userId vs id from different endpoints ──────────────────────────
const uid = (u) => u?.userId ?? u?.id

// ── filterByRole: keep only users whose roles[] includes targetRoleName ──────────────
// Falls back to full list if nobody matches (prevents empty picker on bad data)
function filterByRole(users, targetRoleName) {
  if (!targetRoleName || !users.length) return users
  const target = targetRoleName.toUpperCase()
  const filtered = users.filter(u =>
    (u.roles || []).some(r => (r.roleName || r.name || '').toUpperCase() === target)
  )
  return filtered.length > 0 ? filtered : users
}

// ── flattenUsers: unwrap paginated API response to plain array ────────────────────
function flattenUsers(raw) {
  const arr = raw?.data?.data?.items || raw?.data?.items || raw?.items
                || raw?.data?.data   || raw?.data        || raw
  return Array.isArray(arr) ? arr : []
}

// ── Result badge ──────────────────────────────────────────────────────────────
const RESULT_CFG = {
  EFFECTIVE:           { label: 'Effective',   color: 'text-green-400',  bg: 'bg-green-500/10',    icon: CheckCircle2 },
  PARTIALLY_EFFECTIVE: { label: 'Partial',     color: 'text-amber-400',  bg: 'bg-amber-500/10',    icon: AlertTriangle },
  INEFFECTIVE:         { label: 'Ineffective', color: 'text-red-400',    bg: 'bg-red-500/10',      icon: XCircle },
  NOT_TESTED:          { label: 'Not tested',  color: 'text-text-muted', bg: 'bg-surface-overlay', icon: MinusCircle },
  NOT_APPLICABLE:      { label: 'N/A',         color: 'text-text-muted', bg: 'bg-surface-overlay', icon: MinusCircle },
}

function ResultBadge({ result }) {
  const c    = RESULT_CFG[result] || RESULT_CFG.NOT_TESTED
  const Icon = c.icon
  return (
    <span className={cn('flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0', c.color, c.bg)}>
      <Icon size={8} />{c.label}
    </span>
  )
}

// ── Build tree from flat section list ────────────────────────────────────────
function buildTree(sections) {
  const byId = {}
  for (const s of sections) byId[s.id] = { ...s, _children: [] }
  const roots = []
  for (const s of sections) {
    if (s.parentInstanceId && byId[s.parentInstanceId]) {
      byId[s.parentInstanceId]._children.push(byId[s.id])
    } else {
      roots.push(byId[s.id])
    }
  }
  return roots
}

// ── User display name helper ──────────────────────────────────────────────────
function userName(user) {
  if (!user) return null
  const firstLast = user.firstName ? `${user.firstName} ${user.lastName||''}`.trim() : null
  return user.fullName || user.name || firstLast || user.email || `User #${user.id}`
}

function userInitials(user) {
  const n = userName(user) || ''
  return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ── Inline user picker dropdown ───────────────────────────────────────────────
function UserPicker({ users = [], value, onChange, placeholder = 'Assign…', loading, excludeUserId }) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const ref                 = useRef(null)

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = useMemo(() => {
    let list = excludeUserId ? users.filter(u => uid(u) !== excludeUserId) : users
    if (!query) return list
    const q = query.toLowerCase()
    return list.filter(u => (userName(u) || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
  }, [users, query, excludeUserId])

  const selected = users.find(u => uid(u) === value)

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        disabled={loading}
        className={cn(
          'flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md border transition-all',
          selected
            ? 'border-brand-500/40 bg-brand-500/10 text-brand-300 hover:bg-brand-500/15'
            : 'border-border bg-surface-overlay text-text-muted hover:text-text-secondary hover:border-border-strong'
        )}
      >
        {selected ? (
          <>
            <div className="h-3.5 w-3.5 rounded-full bg-brand-500/30 flex items-center justify-center text-[7px] font-bold text-brand-300 shrink-0">
              {userInitials(selected)}
            </div>
            <span className="max-w-[100px] truncate">{userName(selected)}</span>
          </>
        ) : (
          <>
            <UserPlus size={10} />
            <span>{placeholder}</span>
          </>
        )}
        {open ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-surface-raised border border-border rounded-lg shadow-elevated z-50 overflow-hidden">
          {/* Search */}
          <div className="p-1.5 border-b border-border">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-surface-overlay rounded-md">
              <Search size={10} className="text-text-muted shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                onClick={e => e.stopPropagation()}
                placeholder="Search…"
                className="flex-1 bg-transparent text-[11px] text-text-primary placeholder:text-text-muted outline-none"
              />
            </div>
          </div>

          {/* Unassign option */}
          {selected && (
            <button
              onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X size={10} /> Unassign
            </button>
          )}

          {/* User list */}
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-3 text-[10px] text-text-muted text-center">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-text-muted text-center">No users found</div>
            ) : filtered.map(u => (
              <button
                key={uid(u)}
                onClick={(e) => { e.stopPropagation(); onChange(uid(u)); setOpen(false); setQuery('') }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-surface-overlay text-left',
                  uid(u) === value ? 'bg-brand-500/10 text-brand-300' : 'text-text-secondary'
                )}
              >
                <div className="h-4 w-4 rounded-full bg-surface-overlay border border-border flex items-center justify-center text-[8px] font-bold shrink-0">
                  {userInitials(u)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{userName(u)}</div>
                  {u.roleName && <div className="text-[9px] text-text-muted truncate">{u.roleName.replace(/_/g, ' ')}</div>}
                </div>
                {uid(u) === value && <CheckCircle2 size={10} className="text-brand-400 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Cascade toggle ────────────────────────────────────────────────────────────
function CascadeToggle({ value, onChange }) {
  return (
    <label
      onClick={e => e.stopPropagation()}
      className="flex items-center gap-1 text-[9px] text-text-muted cursor-pointer hover:text-text-secondary select-none"
    >
      <div
        onClick={() => onChange(!value)}
        className={cn(
          'w-5 h-2.5 rounded-full transition-colors relative shrink-0',
          value ? 'bg-brand-500' : 'bg-surface-overlay border border-border'
        )}
      >
        <span className={cn(
          'absolute top-0.5 h-1.5 w-1.5 rounded-full bg-white transition-transform',
          value ? 'translate-x-2.5' : 'translate-x-0.5'
        )} />
      </div>
      cascade
    </label>
  )
}

// ── Assignment row (auditor or auditee) ───────────────────────────────────────
function AssignmentCell({ label, icon: Icon, color, users, usersLoading, currentUserId,
  onAssign, saving, excludeUserId }) {
  const [cascade, setCascade] = useState(true)

  return (
    <div
      onClick={e => e.stopPropagation()}
      className="flex items-center gap-1.5 shrink-0"
    >
      <Icon size={9} className={color} />
      <UserPicker
        users={users}
        value={currentUserId}
        onChange={(userId) => onAssign(userId, cascade)}
        placeholder={label}
        loading={usersLoading || saving}
        excludeUserId={excludeUserId}
      />
      <CascadeToggle value={cascade} onChange={setCascade} />
    </div>
  )
}

// ── Detail panel ─────────────────────────────────────────────────────────────
function DetailPanel({ item, type, onClose, auditorUsers, auditeeUsers }) {
  if (!item) return null
  const isSection = type === 'section'
  const title     = isSection ? item.sectionNameSnapshot : item.controlNameSnapshot
  const code      = isSection ? item.sectionCodeSnapshot : item.controlCodeSnapshot
  const desc      = isSection ? item.descriptionSnapshot : item.descriptionSnapshot
  const tag       = isSection ? null                     : item.controlTagSnapshot

  const auditor = auditorUsers?.find(u => u.id === item.assignedAuditorId)
  const auditee = auditeeUsers?.find(u => u.id === item.auditeeAssignedUserId)

  return (
    <div className="absolute inset-0 bg-surface z-20 flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
        <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors p-1 rounded hover:bg-surface-overlay">
          <ChevronRight size={13} className="rotate-180" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            {code && <span className="font-mono text-[10px] text-brand-400">{code}</span>}
            {tag  && <span className="text-[9px] px-1 rounded bg-surface-overlay text-text-muted">{tag}</span>}
            {!isSection && <ResultBadge result={item.testResult} />}
            {isSection && item.submittedAt && (
              <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">Submitted</span>
            )}
          </div>
          <p className="text-sm font-medium text-text-primary truncate">{title}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {desc && <F label="Description" value={desc} multi />}
        {!isSection && item.testProcedureSnapshot    && <F label="Test procedure"    value={item.testProcedureSnapshot}    multi />}
        {!isSection && item.evidenceGuidanceSnapshot && <F label="Evidence required" value={item.evidenceGuidanceSnapshot} multi />}
        {!isSection && item.testerNotes              && <F label="Tester notes"      value={item.testerNotes}              multi />}
        {!isSection && item.failureDetail            && <F label="Failure detail"    value={item.failureDetail}            multi red />}

        {/* Assignment info */}
        {item.assignedAuditorId && (
          <F label="Assigned auditor"
            value={auditor ? userName(auditor) : `User #${item.assignedAuditorId}`}
            icon={UserCheck} />
        )}
        {item.auditeeAssignedUserId && (
          <F label="Assigned auditee"
            value={auditee ? userName(auditee) : `User #${item.auditeeAssignedUserId}`}
            icon={Users} />
        )}
        {isSection && item.submittedAt && (
          <F label="Submitted at" value={new Date(item.submittedAt).toLocaleString()} icon={Calendar} />
        )}
        {!isSection && item.testTypeSnapshot     && <F label="Test type"  value={item.testTypeSnapshot} />}
        {!isSection && item.frameworkRefSnapshot && <F label="Framework"  value={item.frameworkRefSnapshot} />}
        {isSection  && item.frameworkRefSnapshot && <F label="Framework"  value={item.frameworkRefSnapshot} />}
      </div>
    </div>
  )
}

function F({ label, value, multi, red, icon: Icon }) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        {Icon && <Icon size={9} className="text-text-muted" />}
        <p className="text-[9px] text-text-muted uppercase tracking-wide">{label}</p>
      </div>
      <p className={cn('text-xs leading-relaxed', red ? 'text-red-400' : 'text-text-primary', !multi && 'truncate')}>
        {value}
      </p>
    </div>
  )
}

// ── Section tree node ─────────────────────────────────────────────────────────
function SectionNode({
  node, controlsBySection,
  onSelectSection, onSelectControl,
  engagementId,
  canAssignAuditor, canAssignAuditee, canSubmit, canReopen,
  auditorUsers, auditeeUsers, auditorUsersLoading, auditeeUsersLoading,
  currentUserId,
  depth = 0,
}) {
  const [open, setOpen]   = useState(depth < 1)
  const qc                = useQueryClient()
  const controls          = controlsBySection[node.id] || []
  const hasChildren       = node._children?.length > 0
  const isMySection        = node.assignedAuditorId === currentUserId || node.auditeeAssignedUserId === currentUserId

  const effectiveCount = controls.filter(c => c.testResult === 'EFFECTIVE').length
  const totalCount     = controls.length

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['eng-sections', engagementId] })
    qc.invalidateQueries({ queryKey: ['eng-controls', engagementId] })
  }

  const { mutate: doAssignAuditor, isPending: assigningAuditor } = useMutation({
    mutationFn: ({ userId, cascade }) =>
      assignAuditor(engagementId, node.id, { auditorId: userId, cascadeToChildren: cascade }),
    onSuccess: () => { toast.success('Auditor assigned'); invalidate() },
    onError:   (e) => toast.error(e?.response?.data?.message || 'Assignment failed'),
  })

  const { mutate: doAssignAuditee, isPending: assigningAuditee } = useMutation({
    mutationFn: ({ userId, cascade }) =>
      assignSectionAuditee(engagementId, node.id, { auditeeUserId: userId, cascadeToChildren: cascade }),
    onSuccess: () => { toast.success('Auditee assigned'); invalidate() },
    onError:   (e) => toast.error(e?.response?.data?.message || 'Assignment failed'),
  })

  const { mutate: doSubmit, isPending: submitting } = useMutation({
    mutationFn: () => submitSection(engagementId, node.id, { cascadeToChildren: true }),
    onSuccess: () => { toast.success('Section submitted'); invalidate() },
    onError:   (e) => toast.error(e?.response?.data?.message || 'Submit failed'),
  })

  const { mutate: doReopen, isPending: reopening } = useMutation({
    mutationFn: () => reopenSection(engagementId, node.id),
    onSuccess: () => { toast.success('Section reopened'); invalidate() },
    onError:   (e) => toast.error(e?.response?.data?.message || 'Reopen failed'),
  })

  const isSubmitted = !!node.submittedAt

  return (
    <div>
      {/* Section row */}
      <div
        className={cn('flex items-center gap-1.5 py-1.5 pr-3 hover:bg-surface-overlay/40 group', isMySection && 'border-l-2 border-brand-500/40')}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
      >
        {/* Expand/collapse */}
        <span
          onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
          className="shrink-0 text-text-muted hover:text-text-primary cursor-pointer"
        >
          {(hasChildren || controls.length > 0)
            ? open ? <ChevronDown size={11} /> : <ChevronRight size={11} />
            : <span className="w-[11px]" />}
        </span>

        {/* Section label — click → detail */}
        <span
          onClick={() => onSelectSection(node)}
          className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
        >
          <Layers size={10} className={cn('shrink-0', isSubmitted ? 'text-green-400' : isMySection ? 'text-brand-400' : 'text-text-muted')} />
          {node.sectionCodeSnapshot && (
            <span className="font-mono text-[10px] text-brand-400 shrink-0">{node.sectionCodeSnapshot}</span>
          )}
          <span className="text-[11px] text-text-primary truncate group-hover:underline underline-offset-2">
            {node.sectionNameSnapshot}
          </span>
        </span>

        {/* Stats pill */}
        {totalCount > 0 && (
          <span className="text-[9px] text-text-muted shrink-0">{effectiveCount}/{totalCount}</span>
        )}
        {isSubmitted && (
          <span className="text-[9px] text-green-400 shrink-0 flex items-center gap-0.5">
            <CheckCheck size={9} /> submitted
          </span>
        )}

        {/* ── Assignment controls (permission-gated) ── */}
        <div
          className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={e => e.stopPropagation()}
        >
          {canAssignAuditor && !isSubmitted && (
            <AssignmentCell
              label="Assign auditor"
              icon={UserCheck}
              color="text-emerald-400"
              users={auditorUsers}
              usersLoading={auditorUsersLoading}
              currentUserId={node.assignedAuditorId}
              onAssign={(uid, cascade) => doAssignAuditor({ userId: uid, cascade })}
              saving={assigningAuditor}
            />
          )}

          {canAssignAuditee && !isSubmitted && node.assignedAuditorId === currentUserId && (
            <AssignmentCell
              label="Assign auditee"
              icon={Users}
              color="text-purple-400"
              users={auditeeUsers}
              usersLoading={auditeeUsersLoading}
              currentUserId={node.auditeeAssignedUserId}
              onAssign={(uid, cascade) => doAssignAuditee({ userId: uid, cascade })}
              saving={assigningAuditee}
            />
          )}

          {canSubmit && !isSubmitted && (
            <button
              onClick={() => doSubmit()}
              disabled={submitting}
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
            >
              <CheckCheck size={9} /> Submit
            </button>
          )}

          {canReopen && isSubmitted && (
            <button
              onClick={() => doReopen()}
              disabled={reopening}
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={9} /> Reopen
            </button>
          )}
        </div>
      </div>

      {/* Controls under this section */}
      {open && controls.map(ctrl => (
        <ControlRow
          key={ctrl.id}
          ctrl={ctrl}
          engagementId={engagementId}
          depth={depth}
          onSelect={onSelectControl}
          canAssignAuditee={canAssignAuditee}
          auditeeUsers={auditeeUsers}
          auditeeUsersLoading={auditeeUsersLoading}
          sectionAssignedAuditorId={node.assignedAuditorId}
          currentUserId={currentUserId}
        />
      ))}

      {/* Child sections */}
      {open && node._children?.map(child => (
        <SectionNode
          key={child.id}
          node={child}
          controlsBySection={controlsBySection}
          onSelectSection={onSelectSection}
          onSelectControl={onSelectControl}
          engagementId={engagementId}
          canAssignAuditor={canAssignAuditor}
          canAssignAuditee={canAssignAuditee}
          canSubmit={canSubmit}
          canReopen={canReopen}
          auditorUsers={auditorUsers}
          auditeeUsers={auditeeUsers}
          auditorUsersLoading={auditorUsersLoading}
          auditeeUsersLoading={auditeeUsersLoading}
          depth={depth + 1}
        />
      ))}
    </div>
  )
}

// ── Control row ───────────────────────────────────────────────────────────────
function ControlRow({ ctrl, engagementId, depth, onSelect, canAssignAuditee,
  auditeeUsers, auditeeUsersLoading, sectionAssignedAuditorId, currentUserId }) {
  const qc = useQueryClient()

  const { mutate: doAssign, isPending } = useMutation({
    mutationFn: ({ userId }) =>
      assignControlAuditee(engagementId, ctrl.id, { auditeeUserId: userId }),
    onSuccess: () => {
      toast.success('Auditee assigned to control')
      qc.invalidateQueries({ queryKey: ['eng-controls', engagementId] })
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Assignment failed'),
  })

  return (
    <div
      style={{ paddingLeft: `${26 + depth * 14}px` }}
      className={cn('flex items-center gap-1.5 py-1 pr-3 hover:bg-surface-overlay/30 group cursor-pointer', isMyControl && 'bg-brand-500/5 border-l-2 border-brand-400/30')}
      onClick={() => onSelect(ctrl)}
    >
      <CheckSquare size={9} className={cn('shrink-0', isMyControl ? 'text-brand-400' : 'text-text-muted')} />
      {ctrl.controlCodeSnapshot && (
        <span className="font-mono text-[9px] text-text-muted shrink-0">{ctrl.controlCodeSnapshot}</span>
      )}
      <span className="text-[11px] text-text-secondary truncate flex-1">
        {ctrl.controlNameSnapshot}
      </span>
      <ResultBadge result={ctrl.testResult} />

      {/* Auditee assignment on controls — only the auditor assigned to this section */}
      {canAssignAuditee && sectionAssignedAuditorId === currentUserId && (
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-1"
          onClick={e => e.stopPropagation()}
        >
          <UserPicker
            users={auditeeUsers}
            value={ctrl.auditeeAssignedUserId}
            onChange={(uid) => doAssign({ userId: uid })}
            placeholder="Assign auditee"
            loading={auditeeUsersLoading || isPending}
          />
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function EngagementSectionsTab({ engagementId, vc = {} }) {
  const [selected, setSelected] = useState(null)
  const auth          = useSelector(selectAuth)
  const currentUserId  = auth?.userId
  const myRoleNames    = (auth?.roles || []).map(r => (r.roleName || r.name || '').toUpperCase())
  const isAuditee      = myRoleNames.includes(ROLE_AUDITEE_CONTRIBUTOR.toUpperCase())
  const isAuditorRole  = myRoleNames.includes(ROLE_AUDITOR_ROLE.toUpperCase())
  // My View: forced on for auditees, default on for pure AUDITOR_ROLE users,
  // OFF for LEAD_AUDITOR, GRC_MANAGER, ORGANIZATION side — they see everything
  const [myView, setMyView] = useState(isAuditee || (isAuditorRole && !myRoleNames.includes('LEAD_AUDITOR')))
  const effectiveMyView = isAuditee ? true : myView

  // ── Data fetches ───────────────────────────────────────────────────────────
  const { data: secData, isLoading: secLoading } = useQuery({
    queryKey: ['eng-sections', engagementId],
    queryFn:  () => fetchSections(engagementId),
    staleTime: 30_000, enabled: !!engagementId,
  })

  const { data: ctrlData, isLoading: ctrlLoading } = useQuery({
    queryKey: ['eng-controls', engagementId],
    queryFn:  () => fetchControls(engagementId),
    staleTime: 30_000, enabled: !!engagementId,
  })

  // Permission gates — driven purely by vc.permissions
  const perms              = vc.permissions || []
  // stepAction from vc: backend sets this from the active step's snap.
  // Assignment pickers only appear on ASSIGN steps and only for their
  // specific permission — prevents both showing simultaneously.
  const isAssignStep         = (vc.stepAction || '').toUpperCase() === 'ASSIGN'
  const canAssignAuditor     = !isAuditee && isAssignStep && perms.includes('audit:section:assign-auditor')
  const canAssignAuditee     = !isAuditee && isAssignStep && perms.includes('audit:section:assign-auditee')
  const canAssignCtrlAuditee = !isAuditee && isAssignStep && perms.includes('audit:control:assign-auditee')
  const canSubmit            = !isAuditee && perms.includes('audit:section:submit')
  const canReopen            = !isAuditee && perms.includes('audit:section:reopen')

  // Only fetch user lists when the corresponding permission is present
  const { data: auditorData, isLoading: auditorUsersLoading } = useQuery({
    queryKey: ['users-by-side', 'AUDITOR'],
    queryFn:  () => fetchUsers('AUDITOR'),
    staleTime: 5 * 60_000,
    enabled:  canAssignAuditor,
  })

  const { data: auditeeData, isLoading: auditeeUsersLoading } = useQuery({
    queryKey: ['users-by-side', 'AUDITEE'],
    queryFn:  () => fetchUsers('AUDITEE'),
    staleTime: 5 * 60_000,
    enabled:  canAssignAuditee || canAssignCtrlAuditee,
  })

  // All side-users (full pool), then role-filtered subsets for each picker
  const allAuditorUsers = useMemo(() => flattenUsers(auditorData), [auditorData])
  const allAuditeeUsers = useMemo(() => flattenUsers(auditeeData), [auditeeData])
  const auditorUsers    = useMemo(() => filterByRole(allAuditorUsers, ROLE_AUDITOR_ROLE),        [allAuditorUsers])
  const auditeeUsers    = useMemo(() => filterByRole(allAuditeeUsers, ROLE_AUDITEE_CONTRIBUTOR), [allAuditeeUsers])

  // ── Data processing ────────────────────────────────────────────────────────
  const sections = useMemo(() => {
    const raw = secData?.data?.data || secData?.data || secData
    return Array.isArray(raw) ? raw : []
  }, [secData])

  const controls = useMemo(() => {
    const raw = ctrlData?.data?.data || ctrlData?.data || ctrlData
    return Array.isArray(raw) ? raw : []
  }, [ctrlData])

  const controlsBySection = useMemo(() => {
    const map = {}
    for (const c of controls) {
      if (!c.sectionInstanceId) continue
      if (!map[c.sectionInstanceId]) map[c.sectionInstanceId] = []
      map[c.sectionInstanceId].push(c)
    }
    return map
  }, [controls])

  // ── My View filtering helpers ──────────────────────────────────────────────────────────────────
  const nodeHasUser = (node, ctrlMap, userId) => {
    if (node.assignedAuditorId === userId || node.auditeeAssignedUserId === userId) return true
    if ((ctrlMap[node.id] || []).some(c => c.auditeeAssignedUserId === userId)) return true
    return (node._children || []).some(child => nodeHasUser(child, ctrlMap, userId))
  }
  const filterTree = (nodes, ctrlMap, userId) => nodes.reduce((acc, node) => {
    if (!nodeHasUser(node, ctrlMap, userId)) return acc
    acc.push({ ...node, _children: filterTree(node._children || [], ctrlMap, userId) })
    return acc
  }, [])

  const fullTree = useMemo(() => buildTree(sections), [sections])
  const displayTree = useMemo(() => {
    if (!effectiveMyView || !currentUserId) return fullTree
    return filterTree(fullTree, controlsBySection, currentUserId)
  }, [fullTree, controlsBySection, effectiveMyView, currentUserId])

  // For AUDITEE: also narrow each section's controls to only theirs
  const displayControlsBySection = useMemo(() => {
    if (!isAuditee || !currentUserId) return controlsBySection
    const result = {}
    for (const [sid, ctrls] of Object.entries(controlsBySection)) {
      result[Number(sid)] = ctrls.filter(c => c.auditeeAssignedUserId === currentUserId)
    }
    return result
  }, [controlsBySection, isAuditee, currentUserId])

  // ── Assignment summary stats ───────────────────────────────────────────────
  const assignedSections = sections.filter(s => s.assignedAuditorId).length
  const submittedSections = sections.filter(s => s.submittedAt).length
  const testedControls    = controls.filter(c => c.testResult && c.testResult !== 'NOT_TESTED').length

  if (secLoading || ctrlLoading) {
    return <div className="px-4 py-6 text-xs text-text-muted text-center">Loading…</div>
  }
  if (!sections.length) {
    return <div className="px-4 py-6 text-xs text-text-muted text-center">No sections in this engagement.</div>
  }

  return (
    <div className="relative h-full flex flex-col">

      {/* Detail panel overlay */}
      {selected && (
        <DetailPanel
          item={selected.item}
          type={selected.type}
          onClose={() => setSelected(null)}
          auditorUsers={auditorUsers}
          auditeeUsers={auditeeUsers}
        />
      )}

      {/* Stats bar */}
      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-3 text-[10px] text-text-muted shrink-0 flex-wrap">
        {effectiveMyView ? (
          <span className="text-brand-300">{displayTree.length} section{displayTree.length !== 1 ? 's' : ''} · {Object.values(displayControlsBySection).reduce((n,a)=>n+a.length,0)} controls — my assignments</span>
        ) : (
          <>
            <span>{sections.length} sections</span>
            <span>·</span>
            {canAssignAuditor && (
              <><span className={assignedSections === sections.length ? 'text-green-400' : ''}>{assignedSections}/{sections.length} assigned</span><span>·</span></>
            )}
            {canSubmit && (
              <><span className={submittedSections === sections.length ? 'text-green-400' : ''}>{submittedSections}/{sections.length} submitted</span><span>·</span></>
            )}
            <span>{testedControls}/{controls.length} controls tested</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!effectiveMyView && canAssignAuditor && <span className="flex items-center gap-0.5 text-emerald-400"><UserCheck size={9}/> auditor</span>}
          {!effectiveMyView && canAssignAuditee && <span className="flex items-center gap-0.5 text-purple-400"><Users size={9}/> auditee</span>}
          {!effectiveMyView && canSubmit        && <span className="flex items-center gap-0.5 text-green-400"><CheckCheck size={9}/> submit</span>}
          {!effectiveMyView && canReopen        && <span className="flex items-center gap-0.5 text-amber-400"><RefreshCw size={9}/> reopen</span>}
          {/* My View toggle — hidden for auditees (always forced on) */}
          {!isAuditee && (
            <button
              onClick={() => setMyView(v => !v)}
              className={cn(
                'flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-md border transition-all',
                myView ? 'border-brand-500/40 bg-brand-500/10 text-brand-300' : 'border-border text-text-muted hover:text-text-secondary'
              )}
            >
              {myView ? <Eye size={9} /> : <EyeOff size={9} />} My view
            </button>
          )}
          {isAuditee && (
            <span className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-md bg-brand-500/10 text-brand-300 border border-brand-500/30">
              <Eye size={9} /> My assignments
            </span>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
        {displayTree.map(node => (
          <SectionNode
            key={node.id}
            node={node}
            controlsBySection={displayControlsBySection}
            onSelectSection={(item) => setSelected({ item, type: 'section' })}
            onSelectControl={(item) => setSelected({ item, type: 'control' })}
            engagementId={engagementId}
            canAssignAuditor={canAssignAuditor}
            canAssignAuditee={canAssignAuditee || canAssignCtrlAuditee}
            canSubmit={canSubmit}
            canReopen={canReopen}
            auditorUsers={auditorUsers}
            auditeeUsers={auditeeUsers}
            auditorUsersLoading={auditorUsersLoading}
            auditeeUsersLoading={auditeeUsersLoading}
            currentUserId={currentUserId}
            depth={0}
          />
        ))}
      </div>
    </div>
  )
}