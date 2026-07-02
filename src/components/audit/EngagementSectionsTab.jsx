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

const fetchSections   = (id)   => api.get(`/v1/audit/engagements/${id}/sections`)
const fetchControls   = (id)   => api.get(`/v1/audit/engagements/${id}/controls`)
const fetchUsers      = (side) => api.get(`/v1/users`, { params: { side, take: 200 } })
const fetchEligibleUsers = (stepInstanceId) =>
  api.get(`/v1/workflow-instances/steps/${stepInstanceId}/eligible-users`)
    .then(r => Array.isArray(r) ? r : (r?.data?.data || r?.data || r || []))

const assignAuditor        = (eid, sid, body) => api.put(`/v1/audit/engagements/${eid}/sections/${sid}/assign`, body)
const assignSectionAuditee = (eid, sid, body) => api.put(`/v1/audit/engagements/${eid}/sections/${sid}/assign-auditee`, body)
const assignControlAuditee = (eid, cid, body) => api.put(`/v1/audit/engagements/${eid}/controls/${cid}/assign-auditee`, body)
const submitSection        = (eid, sid, body) => api.post(`/v1/audit/engagements/${eid}/sections/${sid}/submit`, body)
const reopenSection        = (eid, sid)       => api.post(`/v1/audit/engagements/${eid}/sections/${sid}/reopen`)

const ROLE_AUDITOR_ROLE        = 'AUDITOR_ROLE'
const ROLE_AUDITEE_CONTRIBUTOR = 'AUDITEE_CONTRIBUTOR'

const uid = (u) => u?.userId ?? u?.id

function filterByRole(users, targetRoleName) {
  if (!targetRoleName || !users.length) return users
  const target = targetRoleName.toUpperCase()
  const filtered = users.filter(u =>
    (u.roles || []).some(r => (r.roleName || r.name || '').toUpperCase() === target)
  )
  return filtered.length > 0 ? filtered : users
}

function flattenUsers(raw) {
  const arr = raw?.data?.data?.items || raw?.data?.items || raw?.items
                || raw?.data?.data   || raw?.data        || raw
  return Array.isArray(arr) ? arr : []
}

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

function userName(user) {
  if (!user) return null
  const firstLast = user.firstName ? `${user.firstName} ${user.lastName||''}`.trim() : null
  return user.fullName || user.name || firstLast || user.email || `User #${user.id}`
}

function userInitials(user) {
  const n = userName(user) || ''
  return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ── Inline user picker — absolute right-0 so it never goes off the right edge ──
function UserPicker({ users = [], value, onChange, placeholder = 'Assign…', loading, excludeUserId }) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const [flipUp, setFlipUp] = useState(false)
  const ref                 = useRef(null)
  const btnRef              = useRef(null)

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleToggle = (e) => {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setFlipUp(window.innerHeight - rect.bottom < 260)
    }
    setOpen(o => !o)
  }

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
        ref={btnRef}
        onClick={handleToggle}
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
        <div className={cn(
          'absolute right-0 w-52 bg-surface-raised border border-border rounded-lg shadow-elevated z-[200] overflow-hidden',
          flipUp ? 'bottom-full mb-1' : 'top-full mt-1'
        )}>
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

          {selected && (
            <button
              onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X size={10} /> Unassign
            </button>
          )}

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
        {item.assignedAuditorId && (
          <F label="Assigned auditor" value={auditor ? userName(auditor) : `User #${item.assignedAuditorId}`} icon={UserCheck} />
        )}
        {item.auditeeAssignedUserId && (
          <F label="Assigned auditee" value={auditee ? userName(auditee) : `User #${item.auditeeAssignedUserId}`} icon={Users} />
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
  const isMySection       = node.assignedAuditorId === currentUserId || node.auditeeAssignedUserId === currentUserId

  const effectiveCount = controls.filter(c => c.testResult === 'EFFECTIVE').length
  const totalCount     = controls.length

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['eng-sections', engagementId] })
    qc.invalidateQueries({ queryKey: ['eng-controls', engagementId] })
  }

  const { mutate: doAssignAuditor, isPending: assigningAuditor } = useMutation({
    mutationFn: ({ userId, cascade }) =>
      assignAuditor(engagementId, node.id, { auditorId: userId, cascadeToChildren: cascade }),
    onSuccess: (_, { userId }) => {
      toast[userId ? 'success' : 'info'](userId ? 'Auditor assigned' : 'Auditor removed')
      invalidate()
    },
    onError:   (e) => toast.error(e?.response?.data?.message || 'Assignment failed'),
  })

  const { mutate: doAssignAuditee, isPending: assigningAuditee } = useMutation({
    mutationFn: ({ userId, cascade }) =>
      assignSectionAuditee(engagementId, node.id, { auditeeUserId: userId, cascadeToChildren: cascade }),
    onSuccess: (_, { userId }) => {
      toast[userId ? 'success' : 'info'](userId ? 'Auditee assigned' : 'Auditee removed')
      invalidate()
    },
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
      <div
        className={cn('flex items-center gap-1.5 py-1.5 pr-3 hover:bg-surface-overlay/40 group', isMySection && 'border-l-2 border-brand-500/40')}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
      >
        <span
          onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
          className="shrink-0 text-text-muted hover:text-text-primary cursor-pointer"
        >
          {(hasChildren || controls.length > 0)
            ? open ? <ChevronDown size={11} /> : <ChevronRight size={11} />
            : <span className="w-[11px]" />}
        </span>

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

        {totalCount > 0 && (
          <span className="text-[9px] text-text-muted shrink-0">{effectiveCount}/{totalCount}</span>
        )}
        {isSubmitted && (
          <span className="text-[9px] text-green-400 shrink-0 flex items-center gap-0.5">
            <CheckCheck size={9} /> submitted
          </span>
        )}

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

          {canAssignAuditee && !isSubmitted && (
            // canAssignAuditee without canAssignAuditor = Step 4 (lead auditor assigns evidence owners)
            //   → show on ALL sections regardless of who the auditor is
            // canAssignAuditee with no auditor restriction = auditee-side step
            //   → show only on sections where current user is the assigned auditor
            !canAssignAuditor || node.assignedAuditorId === currentUserId
          ) && (
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

function ControlRow({ ctrl, engagementId, depth, onSelect, canAssignAuditee,
  auditeeUsers, auditeeUsersLoading, sectionAssignedAuditorId, currentUserId }) {
  const qc = useQueryClient()
  const isMyControl = ctrl.assignedAuditorId === currentUserId || ctrl.auditeeAssignedUserId === currentUserId

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

export function EngagementSectionsTab({ engagementId, vc = {}, stepInstanceId, onTaskComplete }) {
  const [selected, setSelected] = useState(null)
  const auth           = useSelector(selectAuth)
  const currentUserId  = auth?.userId
  const [myView, setMyView] = useState(false)

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

  const perms              = vc.permissions || []
  const isAssignStep       = (vc.stepAction || '').toUpperCase() === 'ASSIGN'
  const canAssignAuditor     = isAssignStep && perms.includes('audit:section:assign-auditor')
  const canAssignAuditee     = isAssignStep && perms.includes('audit:section:assign-auditee')
  const canAssignCtrlAuditee = isAssignStep && perms.includes('audit:control:assign-auditee')

  const [auditorRoleFilter, setAuditorRoleFilter] = useState(null)
  const [auditeeRoleFilter, setAuditeeRoleFilter] = useState(null)
  const tenantId = auth?.tenantId
  const { data: rolesData } = useQuery({
    queryKey: ['tenant-roles-hierarchy', tenantId],
    queryFn:  () => api.get(`/v1/tenants/${tenantId}/roles/hierarchy`),
    staleTime: 5 * 60_000,
    enabled:  !!(tenantId && (canAssignAuditor || canAssignAuditee || canAssignCtrlAuditee)),
  })
  const { auditorRoles, auditeeRoles } = useMemo(() => {
    const payload   = rolesData?.data?.data || rolesData?.data || rolesData
    const hierarchy = payload?.hierarchy || {}
    const flatten   = (side) => (Array.isArray(hierarchy[side]) ? hierarchy[side] : [])
      .map(r => ({ id: r.role_id ?? r.id, name: r.name }))
    return { auditorRoles: flatten('AUDITOR'), auditeeRoles: flatten('AUDITEE') }
  }, [rolesData])
  const canSubmit = perms.includes('audit:section:submit')
  const canReopen = perms.includes('audit:section:reopen')

  // eligible-users — gated only on stepInstanceId being present
  const { data: eligibleUsersRaw = [], isLoading: eligibleLoading } = useQuery({
    queryKey: ['step-eligible-users', stepInstanceId],
    queryFn:  () => fetchEligibleUsers(stepInstanceId),
    staleTime: 60 * 1000,
    enabled:  !!stepInstanceId,
  })

  const needsFallback = !stepInstanceId
  const { data: auditorData, isLoading: auditorUsersLoading } = useQuery({
    queryKey: ['users-by-side', 'AUDITOR'],
    queryFn:  () => fetchUsers('AUDITOR'),
    staleTime: 5 * 60_000,
    enabled:  needsFallback && canAssignAuditor,
  })
  const { data: auditeeData, isLoading: auditeeUsersLoading } = useQuery({
    queryKey: ['users-by-side', 'AUDITEE'],
    queryFn:  () => fetchUsers('AUDITEE'),
    staleTime: 5 * 60_000,
    enabled:  needsFallback && (canAssignAuditee || canAssignCtrlAuditee),
  })

  const allAuditorUsers = useMemo(() => flattenUsers(auditorData), [auditorData])
  const allAuditeeUsers = useMemo(() => flattenUsers(auditeeData), [auditeeData])

  // When stepInstanceId is present, eligible-users endpoint returns exactly the right list.
  // Use it directly — no filtering, no fallback logic needed.
  // When not present (direct browse), fall back to side-filtered user lists.
  const auditorUsers = !needsFallback
    ? eligibleUsersRaw
    : (auditorRoleFilter
        ? allAuditorUsers.filter(u => (u.roles||[]).some(r => (r.id||r.roleId) === auditorRoleFilter))
        : filterByRole(allAuditorUsers, ROLE_AUDITOR_ROLE))

  const auditeeUsers = !needsFallback
    ? eligibleUsersRaw
    : (auditeeRoleFilter
        ? allAuditeeUsers.filter(u => (u.roles||[]).some(r => (r.id||r.roleId) === auditeeRoleFilter))
        : filterByRole(allAuditeeUsers, ROLE_AUDITEE_CONTRIBUTOR))

  const sections = useMemo(() => {
    const raw = secData?.data?.data || secData?.data || secData
    return Array.isArray(raw) ? raw : []
  }, [secData])

  const hasAuditorAssignments = sections.some(s => s.assignedAuditorId === currentUserId)
  const hasAuditeeAssignments = sections.some(s => s.auditeeAssignedUserId === currentUserId)
  const hasAnyAssignment      = hasAuditorAssignments || hasAuditeeAssignments

  const effectiveMyView = (canAssignAuditor || canAssignAuditee || canAssignCtrlAuditee)
    ? myView
    : hasAnyAssignment

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

  const nodeHasUser = (node, userId) => {
    if (node.assignedAuditorId === userId || node.auditeeAssignedUserId === userId) return true
    return (node._children || []).some(child => nodeHasUser(child, userId))
  }
  const filterTree = (nodes, userId) => nodes.reduce((acc, node) => {
    if (!nodeHasUser(node, userId)) return acc
    acc.push({ ...node, _children: filterTree(node._children || [], userId) })
    return acc
  }, [])

  const fullTree = useMemo(() => buildTree(sections), [sections])
  const displayTree = useMemo(() => {
    if (!effectiveMyView || !currentUserId) return fullTree
    return filterTree(fullTree, currentUserId)
  }, [fullTree, effectiveMyView, currentUserId])

  const displayControlsBySection = controlsBySection

  const assignedSections  = sections.filter(s => s.assignedAuditorId).length
  const submittedSections = sections.filter(s => s.submittedAt).length
  const testedControls    = controls.filter(c => c.testResult && c.testResult !== 'NOT_TESTED').length

  const prevAssignedRef = useRef(0)
  useEffect(() => {
    if (!onTaskComplete || !sections.length || !canAssignAuditor) return
    if (assignedSections === sections.length && prevAssignedRef.current < sections.length) {
      const timer = setTimeout(() => onTaskComplete(), 1500)
      return () => clearTimeout(timer)
    }
    prevAssignedRef.current = assignedSections
  }, [assignedSections, sections.length, canAssignAuditor, onTaskComplete])

  if (secLoading || ctrlLoading) {
    return <div className="px-4 py-6 text-xs text-text-muted text-center">Loading…</div>
  }
  if (!sections.length) {
    return <div className="px-4 py-6 text-xs text-text-muted text-center">No sections in this engagement.</div>
  }

  return (
    <div className="relative h-full flex flex-col overflow-x-hidden">
      {selected && (
        <DetailPanel
          item={selected.item}
          type={selected.type}
          onClose={() => setSelected(null)}
          auditorUsers={auditorUsers}
          auditeeUsers={auditeeUsers}
        />
      )}

      {canAssignAuditor && sections.length > 0 && assignedSections < sections.length && (
        <div className="mx-3 mt-2 mb-1 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-[11px] text-amber-300 shrink-0">
          <UserCheck size={12} className="shrink-0" />
          {assignedSections}/{sections.length} section{sections.length !== 1 ? 's' : ''} assigned — assign an auditor to each
        </div>
      )}
      {canAssignAuditee && sections.length > 0 && sections.filter(s => s.auditeeAssignedUserId).length < sections.length && (
        <div className="mx-3 mt-2 mb-1 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center gap-2 text-[11px] text-purple-300 shrink-0">
          <Users size={12} className="shrink-0" />
          {sections.filter(s => s.auditeeAssignedUserId).length}/{sections.length} section{sections.length !== 1 ? 's' : ''} have auditee assigned
        </div>
      )}

      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-3 text-[10px] text-text-muted shrink-0 flex-wrap">
        {effectiveMyView ? (
          <span className="text-brand-300">
            {displayTree.length} section{displayTree.length !== 1 ? 's' : ''} ·{' '}
            {Object.values(displayControlsBySection).reduce((n,a)=>n+a.length,0)} controls
            {hasAuditeeAssignments ? ' — my evidence assignments' : ' — my assignments'}
          </span>
        ) : !effectiveMyView && !canAssignAuditor && !canAssignAuditee && !hasAnyAssignment ? (
          <span className="text-text-muted flex items-center gap-1">
            <Eye size={9} /> {sections.length} sections · {controls.length} controls — read only
          </span>
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
          {(canAssignAuditor || canAssignAuditee || canAssignCtrlAuditee) && (
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
          {!(canAssignAuditor || canAssignAuditee || canAssignCtrlAuditee) && effectiveMyView && (
            <span className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-md bg-brand-500/10 text-brand-300 border border-brand-500/30">
              <Eye size={9} /> My assignments
            </span>
          )}
        </div>
      </div>

      {(canAssignAuditor || canAssignAuditee || canAssignCtrlAuditee) &&
       (auditorRoles.length > 0 || auditeeRoles.length > 0) && (
        <div className="px-3 py-1.5 border-b border-border/30 shrink-0 flex items-center gap-3 flex-wrap bg-surface-raised/30">
          <span className="text-[9px] text-text-muted font-medium uppercase tracking-wide shrink-0">Filter assignable:</span>
          {canAssignAuditor && auditorRoles.length > 0 && (
            <div className="flex items-center gap-1.5">
              <UserCheck size={9} className="text-brand-400 shrink-0"/>
              <select
                value={auditorRoleFilter ?? ''}
                onChange={e => setAuditorRoleFilter(e.target.value ? Number(e.target.value) : null)}
                className="text-[10px] bg-surface border border-border rounded px-1.5 py-0.5 text-text-secondary focus:outline-none focus:border-brand-500/50 cursor-pointer">
                <option value="">All auditors</option>
                {auditorRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          {(canAssignAuditee || canAssignCtrlAuditee) && auditeeRoles.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users size={9} className="text-amber-400 shrink-0"/>
              <select
                value={auditeeRoleFilter ?? ''}
                onChange={e => setAuditeeRoleFilter(e.target.value ? Number(e.target.value) : null)}
                className="text-[10px] bg-surface border border-border rounded px-1.5 py-0.5 text-text-secondary focus:outline-none focus:border-amber-500/50 cursor-pointer">
                <option value="">All auditees</option>
                {auditeeRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          {(auditorRoleFilter || auditeeRoleFilter) && (
            <button onClick={() => { setAuditorRoleFilter(null); setAuditeeRoleFilter(null) }}
              className="text-[9px] text-text-muted hover:text-text-primary ml-auto">
              Clear
            </button>
          )}
        </div>
      )}

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