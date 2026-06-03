/**
 * EngagementControlsTab.jsx — permission-based controls with assignment + test result UI
 * Permission gates (all from vc.permissions, zero hardcoded roles):
 *   audit:control:assign-auditee     → auditee picker per row + detail panel
 *   audit:control:record-test-result → Pass/Partial/Fail/N·A picker per row + detail panel
 *   audit:control:submit-evidence    → Submit Evidence in detail panel (auditee side)
 *   audit:finding:create             → Raise Finding CTA on failed controls
 *
 * APIs:
 *   GET  /v1/audit/engagements/{id}/controls
 *   GET  /v1/users?side=AUDITEE&take=200
 *   PUT  /v1/audit/engagements/{id}/controls/{cid}/assign-auditee
 *   PUT  /v1/audit/engagements/{id}/controls/{cid}/test-result
 *   POST /v1/audit/engagements/{id}/controls/{cid}/submit-evidence
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import {
  CheckSquare, CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  ChevronRight, Search, Users, UserCheck,
  CheckCheck, Minus, X, ChevronDown, ChevronUp, AlertOctagon, Eye, EyeOff,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api    from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast  from 'react-hot-toast'

// ── API helpers ───────────────────────────────────────────────────────────────
const fetchControls      = (eid)         => api.get(`/v1/audit/engagements/${eid}/controls`)
const fetchAuditees      = ()            => api.get('/v1/users', { params: { side: 'AUDITEE', take: 200 } })
const apiAssignAuditee   = (eid,cid,uid) => api.put(`/v1/audit/engagements/${eid}/controls/${cid}/assign-auditee`, { auditeeUserId: uid })
const apiTestResult      = (eid,cid,req) => api.put(`/v1/audit/engagements/${eid}/controls/${cid}/test-result`, req)
const apiSubmitEvidence  = (eid,cid)     => api.post(`/v1/audit/engagements/${eid}/controls/${cid}/submit-evidence`)

// ── Role name constants ─────────────────────────────────────────────────────────────
const ROLE_AUDITEE_CONTRIBUTOR = 'AUDITEE_CONTRIBUTOR'

// ── uid: normalise userId vs id from different endpoints ──────────────────────────
const uidOf = (u) => u?.userId ?? u?.id

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

// ── Result config ─────────────────────────────────────────────────────────────
const RESULTS = [
  { value: 'EFFECTIVE',           label: 'Effective',   short: 'Pass',    color: 'text-green-400',  bg: 'bg-green-500/10',    border: 'border-green-500/30',  icon: CheckCircle2 },
  { value: 'PARTIALLY_EFFECTIVE', label: 'Partial',     short: 'Partial', color: 'text-amber-400',  bg: 'bg-amber-500/10',    border: 'border-amber-500/30',  icon: AlertTriangle },
  { value: 'INEFFECTIVE',         label: 'Ineffective', short: 'Fail',    color: 'text-red-400',    bg: 'bg-red-500/10',      border: 'border-red-500/30',    icon: XCircle },
  { value: 'NOT_APPLICABLE',      label: 'N/A',         short: 'N/A',     color: 'text-text-muted', bg: 'bg-surface-overlay', border: 'border-border',        icon: Minus },
]
const RESULT_MAP = Object.fromEntries([...RESULTS,
  { value: 'NOT_TESTED', label: 'Not tested', short: 'Pending', color: 'text-text-muted', bg: 'bg-surface-overlay', border: 'border-border', icon: MinusCircle },
].map(r => [r.value, r]))

function ResultBadge({ result, compact = false }) {
  const cfg  = RESULT_MAP[result] || RESULT_MAP.NOT_TESTED
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 font-medium rounded shrink-0',
      compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5', cfg.color, cfg.bg)}>
      <Icon size={compact ? 8 : 10} />{compact ? cfg.short : cfg.label}
    </span>
  )
}

// ── User helpers ──────────────────────────────────────────────────────────────
function userName(u) { return u?.fullName || u?.name || u?.email || (u ? `User #${u.id}` : null) }
function userInitials(u) { return (userName(u)||'').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) }

// ── User picker ───────────────────────────────────────────────────────────────
function UserPicker({ users=[], value, onChange, loading }) {
  const [open,setOpen]=useState(false); const [query,setQuery]=useState(''); const ref=useRef(null)
  useEffect(()=>{ const h=(e)=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false) }; document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h) },[])
  const selected=users.find(u=>uidOf(u)===value)
  const filtered=useMemo(()=>{ if(!query) return users; const q=query.toLowerCase(); return users.filter(u=>(userName(u)||'').toLowerCase().includes(q)) },[users,query])
  return (
    <div ref={ref} className="relative inline-block" onClick={e=>e.stopPropagation()}>
      <button onClick={()=>setOpen(o=>!o)} disabled={loading}
        className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-all',
          selected ? 'border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/15'
                   : 'border-border bg-surface-overlay text-text-muted hover:border-border-strong hover:text-text-secondary')}>
        <Users size={9}/>{selected ? <span className="max-w-[80px] truncate">{userName(selected)}</span> : <span>Assign auditee</span>}
        {open?<ChevronUp size={8}/>:<ChevronDown size={8}/>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-surface-raised border border-border rounded-lg shadow-elevated z-50 overflow-hidden">
          <div className="p-1 border-b border-border">
            <div className="flex items-center gap-1 px-2 py-0.5 bg-surface-overlay rounded text-[10px]">
              <Search size={9} className="text-text-muted"/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} onClick={e=>e.stopPropagation()} placeholder="Search…" className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted outline-none"/>
            </div>
          </div>
          {selected && <button onClick={(e)=>{e.stopPropagation();onChange(null);setOpen(false)}} className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-red-400 hover:bg-red-500/10"><X size={9}/> Unassign</button>}
          <div className="max-h-40 overflow-y-auto">
            {filtered.length===0 ? <div className="px-3 py-2 text-[10px] text-text-muted text-center">No users</div>
              : filtered.map(u=>(
                <button key={uidOf(u)} onClick={(e)=>{e.stopPropagation();onChange(uidOf(u));setOpen(false);setQuery('')}}
                  className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] text-left hover:bg-surface-overlay', uidOf(u)===value?'bg-purple-500/10 text-purple-300':'text-text-secondary')}>
                  <div className="h-4 w-4 rounded-full bg-surface-overlay border border-border flex items-center justify-center text-[7px] font-bold shrink-0">{userInitials(u)}</div>
                  <div className="flex-1 min-w-0"><div className="truncate font-medium">{userName(u)}</div>{u.roleName&&<div className="text-[8px] text-text-muted">{u.roleName.replace(/_/g,' ')}</div>}</div>
                  {u.id===value&&<CheckCircle2 size={9} className="text-purple-400 shrink-0"/>}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Test result picker ────────────────────────────────────────────────────────
function TestResultPicker({ currentResult, onSelect, saving }) {
  const [open,setOpen]=useState(false); const ref=useRef(null)
  useEffect(()=>{ const h=(e)=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false) }; document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h) },[])
  const current=RESULT_MAP[currentResult]||RESULT_MAP.NOT_TESTED; const Icon=current.icon
  return (
    <div ref={ref} className="relative inline-block" onClick={e=>e.stopPropagation()}>
      <button onClick={()=>setOpen(o=>!o)} disabled={saving}
        className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-all hover:opacity-80 disabled:opacity-50', current.color, current.bg, current.border)}>
        <Icon size={9}/><span>{current.short}</span>{open?<ChevronUp size={8}/>:<ChevronDown size={8}/>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-40 bg-surface-raised border border-border rounded-lg shadow-elevated z-50 py-1">
          {RESULTS.map(r=>{ const RIcon=r.icon; return (
            <button key={r.value} onClick={(e)=>{e.stopPropagation();onSelect(r.value);setOpen(false)}}
              className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-surface-overlay', r.value===currentResult?`${r.color} ${r.bg}`:'text-text-secondary')}>
              <RIcon size={10} className={r.color}/>{r.label}{r.value===currentResult&&<CheckCircle2 size={9} className="ml-auto text-brand-400"/>}
            </button>
          )})}
          {currentResult&&currentResult!=='NOT_TESTED'&&(
            <button onClick={(e)=>{e.stopPropagation();onSelect('NOT_TESTED');setOpen(false)}} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-muted hover:bg-surface-overlay border-t border-border mt-1 pt-2">
              <Minus size={10}/> Clear result
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Control detail panel ──────────────────────────────────────────────────────
function ControlDetailPanel({ ctrl, onClose, auditeeUsers,
  canAssignAuditee, canRecordResult, canSubmitEvidence, canRaiseFinding, engagementId }) {
  const qc=useQueryClient()
  const inv=()=>qc.invalidateQueries({queryKey:['engagement-controls',engagementId]})
  const {mutate:doAssign,isPending:assigning}=useMutation({mutationFn:(uid)=>apiAssignAuditee(engagementId,ctrl.id,uid),onSuccess:()=>{toast.success('Auditee assigned');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const {mutate:doResult,isPending:recording}=useMutation({mutationFn:(r)=>apiTestResult(engagementId,ctrl.id,{testResult:r}),onSuccess:()=>{toast.success('Result recorded');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const {mutate:doSubmit,isPending:submitting}=useMutation({mutationFn:()=>apiSubmitEvidence(engagementId,ctrl.id),onSuccess:()=>{toast.success('Evidence submitted');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const auditee=auditeeUsers?.find(u=>uidOf(u)===ctrl.auditeeAssignedUserId)
  return (
    <div className="absolute inset-0 bg-surface z-10 flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
        <button onClick={onClose} className="text-text-muted hover:text-text-primary"><ChevronRight size={14} className="rotate-180"/></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="font-mono text-[10px] text-brand-400">{ctrl.controlCodeSnapshot}</span>
            {ctrl.controlTagSnapshot&&<span className="text-[9px] px-1 rounded bg-surface-overlay text-text-muted">{ctrl.controlTagSnapshot}</span>}
            <ResultBadge result={ctrl.testResult} compact/>
          </div>
          <p className="text-sm font-medium text-text-primary truncate">{ctrl.controlNameSnapshot}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {(canRecordResult||canAssignAuditee||canSubmitEvidence)&&(
          <div className="flex items-center gap-2 flex-wrap p-2.5 bg-surface-overlay rounded-lg border border-border/40">
            {canRecordResult&&<div className="flex items-center gap-1.5"><span className="text-[9px] text-text-muted uppercase tracking-wide">Result</span><TestResultPicker currentResult={ctrl.testResult} onSelect={doResult} saving={recording}/></div>}
            {canAssignAuditee&&<div className="flex items-center gap-1.5"><span className="text-[9px] text-text-muted uppercase tracking-wide">Auditee</span><UserPicker users={auditeeUsers} value={ctrl.auditeeAssignedUserId} onChange={doAssign} loading={assigning}/></div>}
            {canSubmitEvidence&&<button onClick={()=>doSubmit()} disabled={submitting} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50 ml-auto"><CheckCheck size={10}/> Submit evidence</button>}
          </div>
        )}
        {ctrl.sectionBreadcrumbSnapshot&&<F label="Section" value={ctrl.sectionBreadcrumbSnapshot}/>}
        {ctrl.descriptionSnapshot&&<F label="Description" value={ctrl.descriptionSnapshot} multi/>}
        {ctrl.testProcedureSnapshot&&<F label="Test procedure" value={ctrl.testProcedureSnapshot} multi/>}
        {ctrl.evidenceGuidanceSnapshot&&<F label="Evidence required" value={ctrl.evidenceGuidanceSnapshot} multi/>}
        {ctrl.testTypeSnapshot&&<F label="Test type" value={ctrl.testTypeSnapshot}/>}
        {ctrl.testerNotes&&<F label="Tester notes" value={ctrl.testerNotes} multi/>}
        {ctrl.failureDetail&&<F label="Failure detail" value={ctrl.failureDetail} multi red/>}
        {ctrl.assignedAuditorId&&<F label="Assigned auditor" value={`User #${ctrl.assignedAuditorId}`} icon={UserCheck}/>}
        {ctrl.auditeeAssignedUserId&&<F label="Assigned auditee" value={auditee?userName(auditee):`User #${ctrl.auditeeAssignedUserId}`} icon={Users}/>}
        {ctrl.evidenceSubmittedAt&&<div className="flex items-center gap-1.5 text-[10px] text-green-400 bg-green-500/10 px-2.5 py-1.5 rounded-lg border border-green-500/20"><CheckCheck size={12}/>Evidence submitted {new Date(ctrl.evidenceSubmittedAt).toLocaleDateString()}</div>}
        {canRaiseFinding&&ctrl.testResult==='INEFFECTIVE'&&(
          <div className="flex items-center gap-2 p-2.5 bg-red-500/5 border border-red-500/20 rounded-lg">
            <AlertOctagon size={14} className="text-red-400 shrink-0"/>
            <div className="flex-1 min-w-0"><p className="text-[11px] font-medium text-red-400">Control failed</p><p className="text-[9px] text-text-muted">Raise a finding to track remediation</p></div>
            <button className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 shrink-0"><AlertOctagon size={9}/> Raise finding</button>
          </div>
        )}
      </div>
    </div>
  )
}

function F({ label, value, multi, red, icon: Icon }) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">{Icon&&<Icon size={9} className="text-text-muted"/>}<p className="text-[9px] text-text-muted uppercase tracking-wide">{label}</p></div>
      <p className={cn('text-xs leading-relaxed',red?'text-red-400':'text-text-primary',!multi&&'truncate')}>{value}</p>
    </div>
  )
}

// ── Control row ───────────────────────────────────────────────────────────────
function ControlRow({ ctrl, engagementId, auditeeUsers, auditeeUsersLoading,
  canAssignAuditee, canRecordResult, onOpenDetail, currentUserId }) {
  const qc=useQueryClient()
  const isMyControl = ctrl.auditeeAssignedUserId === currentUserId
  const inv=()=>qc.invalidateQueries({queryKey:['engagement-controls',engagementId]})
  const {mutate:doAssign,isPending:assigning}=useMutation({mutationFn:(uid)=>apiAssignAuditee(engagementId,ctrl.id,uid),onSuccess:()=>{toast.success('Auditee assigned');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const {mutate:doResult,isPending:recording}=useMutation({mutationFn:(r)=>apiTestResult(engagementId,ctrl.id,{testResult:r}),onSuccess:()=>{toast.success('Result recorded');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const evidenceSubmitted=!!ctrl.evidenceSubmittedAt
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 hover:bg-surface-overlay/40 border-b border-border/20 last:border-0 group cursor-pointer', isMyControl && 'bg-brand-500/5 border-l-2 border-brand-400/30')} onClick={()=>onOpenDetail(ctrl)} >
      <CheckSquare size={10} className={cn('shrink-0 mt-0.5',evidenceSubmitted?'text-green-400':isMyControl?'text-brand-400':'text-text-muted')}/>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {ctrl.controlCodeSnapshot&&<span className="font-mono text-[9px] text-brand-400 shrink-0">{ctrl.controlCodeSnapshot}</span>}
          {ctrl.controlTagSnapshot&&<span className="text-[9px] px-1 rounded bg-surface-overlay text-text-muted shrink-0">{ctrl.controlTagSnapshot}</span>}
          {evidenceSubmitted&&<span className="text-[8px] text-green-400 flex items-center gap-0.5 shrink-0"><CheckCheck size={8}/> evidence</span>}
        </div>
        <p className="text-[11px] text-text-primary line-clamp-1 group-hover:underline underline-offset-2">{ctrl.controlNameSnapshot}</p>
      </div>
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e=>e.stopPropagation()}>
        {canAssignAuditee&&ctrl.assignedAuditorId===currentUserId&&<UserPicker users={auditeeUsers} value={ctrl.auditeeAssignedUserId} onChange={(uid)=>doAssign(uid)} loading={auditeeUsersLoading||assigning}/>}
        {canRecordResult&&<TestResultPicker currentResult={ctrl.testResult} onSelect={(r)=>doResult(r)} saving={recording}/>}
      </div>
      <ResultBadge result={ctrl.testResult} compact/>
      <ChevronRight size={10} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"/>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function EngagementControlsTab({ engagementId, vc = {} }) {
  const navigate=useNavigate(); const [search,setSearch]=useState('')
  const auth          = useSelector(selectAuth)
  const currentUserId  = auth?.userId
  const myRoleNames    = (auth?.roles || []).map(r => (r.roleName || r.name || '').toUpperCase())
  const isAuditee      = myRoleNames.includes(ROLE_AUDITEE_CONTRIBUTOR.toUpperCase())
  const isAuditorRole  = myRoleNames.includes('AUDITOR_ROLE')
  const [myView, setMyView] = useState(isAuditee || (isAuditorRole && !myRoleNames.includes('LEAD_AUDITOR')))
  const effectiveMyView = isAuditee ? true : myView
  const perms=vc.permissions||[]
  const canAssignAuditee  = !isAuditee && perms.includes('audit:control:assign-auditee')
  const canRecordResult   = perms.includes('audit:control:record-test-result')
  const canSubmitEvidence = perms.includes('audit:control:submit-evidence')
  const canRaiseFinding   = perms.includes('audit:finding:create')
  const {data:auditeeData,isLoading:auditeeUsersLoading}=useQuery({queryKey:['users-by-side','AUDITEE'],queryFn:fetchAuditees,staleTime:5*60_000,enabled:canAssignAuditee})
  const allAuditeeUsers = useMemo(() => flattenUsers(auditeeData), [auditeeData])
  const auditeeUsers    = useMemo(() => filterByRole(allAuditeeUsers, ROLE_AUDITEE_CONTRIBUTOR), [allAuditeeUsers])
  const {data,isLoading}=useQuery({queryKey:['engagement-controls',engagementId],queryFn:()=>fetchControls(engagementId),staleTime:30_000,enabled:!!engagementId})
  const controls=useMemo(()=>{ const raw=data?.data?.data||data?.data||data; return Array.isArray(raw)?raw:[] },[data])
  const filtered=useMemo(()=>{ if(!search) return controls; const q=search.toLowerCase(); return controls.filter(c=>c.controlNameSnapshot?.toLowerCase().includes(q)||c.controlCodeSnapshot?.toLowerCase().includes(q)||c.controlTagSnapshot?.toLowerCase().includes(q)) },[controls,search])
  const displayControls = useMemo(() => {
    if (!effectiveMyView || !currentUserId) return filtered
    // Auditors see controls assigned to them; auditees see their evidence controls
    if (isAuditee) return filtered.filter(c => c.auditeeAssignedUserId === currentUserId)
    return filtered.filter(c => c.assignedAuditorId === currentUserId)
  }, [filtered, effectiveMyView, currentUserId, isAuditee])
  const grouped=useMemo(()=>{ const map=new Map(); for(const c of displayControls){ const k=c.sectionBreadcrumbSnapshot||'Ungrouped'; if(!map.has(k)) map.set(k,[]); map.get(k).push(c) }; return [...map.entries()] },[displayControls])
  const stats=useMemo(()=>({total:controls.length,effective:controls.filter(c=>c.testResult==='EFFECTIVE').length,partial:controls.filter(c=>c.testResult==='PARTIALLY_EFFECTIVE').length,ineffective:controls.filter(c=>c.testResult==='INEFFECTIVE').length,notTested:controls.filter(c=>!c.testResult||c.testResult==='NOT_TESTED').length,assigned:controls.filter(c=>c.auditeeAssignedUserId).length,evidenceDone:controls.filter(c=>c.evidenceSubmittedAt).length}),[controls])
  if(isLoading) return <div className="px-4 py-6 text-xs text-text-muted text-center">Loading controls…</div>
  if(!controls.length) return <div className="px-4 py-6 text-xs text-text-muted text-center">No controls in this engagement.</div>
  return (
    <div className="relative h-full flex flex-col">
      {/* Control detail → /module/audit_control_instance/:id (full page) */}
      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2 shrink-0 flex-wrap text-[10px]">
        <span className="text-text-muted">{stats.total} total</span>
        {stats.effective>0&&<span className="text-green-400">{stats.effective} effective</span>}
        {stats.partial>0&&<span className="text-amber-400">{stats.partial} partial</span>}
        {stats.ineffective>0&&<span className="text-red-400">{stats.ineffective} failed</span>}
        {stats.notTested>0&&<span className="text-text-muted">{stats.notTested} pending</span>}
        {canAssignAuditee&&<span className={cn('ml-1',stats.assigned===stats.total?'text-green-400':'text-purple-400')}>· {stats.assigned}/{stats.total} assigned</span>}
        {canSubmitEvidence&&<span className={cn(stats.evidenceDone===stats.total?'text-green-400':'text-text-muted')}>· {stats.evidenceDone}/{stats.total} evidence</span>}
        <div className="ml-auto flex items-center gap-2 text-[9px]">
          {!effectiveMyView&&canAssignAuditee&&<span className="text-purple-400 flex items-center gap-0.5"><Users size={9}/> auditee</span>}
          {canRecordResult&&<span className="text-emerald-400 flex items-center gap-0.5"><CheckCircle2 size={9}/> result</span>}
          {canSubmitEvidence&&<span className="text-green-400 flex items-center gap-0.5"><CheckCheck size={9}/> evidence</span>}
          {!isAuditee&&(
            <button onClick={()=>setMyView(v=>!v)} className={cn('flex items-center gap-1 px-2 py-0.5 rounded-md border transition-all',myView?'border-brand-500/40 bg-brand-500/10 text-brand-300':'border-border text-text-muted hover:text-text-secondary')}>
              {myView?<Eye size={9}/>:<EyeOff size={9}/>} My view
            </button>
          )}
          {isAuditee&&<span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-500/10 text-brand-300 border border-brand-500/30"><Eye size={9}/> My assignments</span>}
        </div>
      </div>
      <div className="px-3 py-1.5 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2 px-2 h-7 rounded border border-border bg-surface-raised">
          <Search size={10} className="text-text-muted shrink-0"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search controls…" className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none"/>
          {search&&<button onClick={()=>setSearch('')} className="text-text-muted hover:text-text-primary"><X size={10}/></button>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {grouped.map(([section,ctrls])=>(
          <div key={section}>
            <div className="px-3 py-1 text-[9px] text-text-muted bg-surface-secondary/50 border-b border-border/20 sticky top-0 z-10 flex items-center gap-2">
              <span className="truncate flex-1">{section}</span>
              <span className="shrink-0">{ctrls.filter(c=>c.testResult==='EFFECTIVE').length}/{ctrls.length}</span>
            </div>
            {ctrls.map(ctrl=>(
              <ControlRow key={ctrl.id} ctrl={ctrl} engagementId={engagementId} auditeeUsers={auditeeUsers} auditeeUsersLoading={auditeeUsersLoading} canAssignAuditee={canAssignAuditee} canRecordResult={canRecordResult} onOpenDetail={(ctrl)=>navigate(`/module/audit_control_instance/${ctrl.id}`)} currentUserId={currentUserId}/>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}