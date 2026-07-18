/**
 * EngagementControlsTab.jsx — permission-based controls with assignment + test result UI
 * Permission gates (all from vc.permissions, zero hardcoded roles):
 *   audit:control:assign-auditor     → auditor picker per row + detail panel
 *   audit:control:assign-auditee     → auditee picker per row + detail panel
 *   audit:control:record-test-result → Pass/Partial/Fail/N·A picker per row + detail panel
 *   audit:control:submit-evidence    → Submit Evidence in detail panel (auditee side)
 *   audit:finding:create             → Raise Finding CTA on failed controls
 *
 * APIs:
 *   GET  /v1/audit/engagements/{id}/controls
 *   GET  /v1/users?side=AUDITOR&take=200
 *   GET  /v1/users?side=AUDITEE&take=200
 *   PUT  /v1/audit/engagements/{id}/controls/{cid}/assign-auditor   ← NEW
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
const fetchAuditors      = ()            => api.get('/v1/users', { params: { side: 'AUDITOR', take: 200 } })
const fetchAuditees      = ()            => api.get('/v1/users', { params: { side: 'AUDITEE', take: 200 } })
const fetchAssignableAuditees = (eid) => api.get(`/v1/audit/engagements/${eid}/assignable-auditees`)
    .then(r => Array.isArray(r) ? r : (r?.data?.data || r?.data || r || []))
const apiAssignAuditor   = (eid,cid,uid) => api.put(`/v1/audit/engagements/${eid}/controls/${cid}/assign-auditor`, { auditorUserId: uid })
const apiAssignAuditee   = (eid,cid,uid) => api.put(`/v1/audit/engagements/${eid}/controls/${cid}/assign-auditee`, { auditeeUserId: uid })
const apiBulkAssign      = (eid,body)    => api.post(`/v1/audit/engagements/${eid}/controls/bulk-assign`, body)
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
  { value: 'EFFECTIVE',           label: 'Effective',   short: 'Pass',    color: 'text-status-pass-fg',  bg: 'bg-status-pass-bg',    border: 'border-status-pass-bd',  icon: CheckCircle2 },
  { value: 'PARTIALLY_EFFECTIVE', label: 'Partial',     short: 'Partial', color: 'text-status-warn-fg',  bg: 'bg-status-warn-bg',    border: 'border-status-warn-bd',  icon: AlertTriangle },
  { value: 'INEFFECTIVE',         label: 'Ineffective', short: 'Fail',    color: 'text-status-fail-fg',    bg: 'bg-status-fail-bg',      border: 'border-status-fail-bd',    icon: XCircle },
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
function UserPicker({ users=[], value, onChange, loading, placeholder }) {
  const [open,setOpen]=useState(false)
  const [query,setQuery]=useState('')
  const [flipUp,setFlipUp]=useState(false)
  const ref=useRef(null)
  const btnRef=useRef(null)
  useEffect(()=>{ const h=(e)=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false) }; document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h) },[])
  const handleToggle=(e)=>{ e.stopPropagation(); if(!open&&btnRef.current){ const rect=btnRef.current.getBoundingClientRect(); setFlipUp(window.innerHeight-rect.bottom<220) }; setOpen(o=>!o) }
  const selected=users.find(u=>uidOf(u)===value)
  const filtered=useMemo(()=>{ if(!query) return users; const q=query.toLowerCase(); return users.filter(u=>(userName(u)||'').toLowerCase().includes(q)) },[users,query])
  return (
    <div ref={ref} className="relative inline-block" onClick={e=>e.stopPropagation()}>
      <button ref={btnRef} onClick={handleToggle} disabled={loading}
        className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-all',
          selected ? 'border-status-tag-bd bg-status-tag-bg text-status-tag-fg hover:bg-status-tag-bg'
                   : 'border-border bg-surface-overlay text-text-muted hover:border-border-strong hover:text-text-secondary')}>
        <Users size={9}/>{selected ? <span className="max-w-[80px] truncate">{userName(selected)}</span> : <span>{placeholder||'Assign'}</span>}
        {open?<ChevronUp size={8}/>:<ChevronDown size={8}/>}
      </button>
      {open && (
        <div className={cn("absolute right-0 w-48 bg-surface-raised border border-border rounded-card shadow-elevated z-50 overflow-hidden", flipUp?"bottom-full mb-1":"top-full mt-1")}>
          <div className="p-1 border-b border-border">
            <div className="flex items-center gap-1 px-2 py-0.5 bg-surface-overlay rounded text-[10px]">
              <Search size={9} className="text-text-muted"/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} onClick={e=>e.stopPropagation()} placeholder="Search…" className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted outline-none"/>
            </div>
          </div>
          {selected && <button onClick={(e)=>{e.stopPropagation();onChange(null);setOpen(false)}} className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-status-fail-fg hover:bg-status-fail-bg"><X size={9}/> Unassign</button>}
          <div className="max-h-40 overflow-y-auto">
            {filtered.length===0 ? <div className="px-3 py-2 text-[10px] text-text-muted text-center">No users found</div>
              : filtered.map(u=>(
                <button key={uidOf(u)} onClick={(e)=>{e.stopPropagation();onChange(uidOf(u));setOpen(false);setQuery('')}}
                  className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] text-left hover:bg-surface-overlay', uidOf(u)===value?'bg-status-tag-bg text-status-tag-fg':'text-text-secondary')}>
                  <div className="h-4 w-4 rounded-full bg-surface-overlay border border-border flex items-center justify-center text-[7px] font-bold shrink-0">{userInitials(u)}</div>
                  <div className="flex-1 min-w-0"><div className="truncate font-medium">{userName(u)}</div>{u.roleName&&<div className="text-[8px] text-text-muted">{u.roleName.replace(/_/g,' ')}</div>}</div>
                  {uidOf(u)===value&&<CheckCircle2 size={9} className="text-status-tag-fg shrink-0"/>}
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
  const [open,setOpen]=useState(false)
  const [flipUp,setFlipUp]=useState(false)
  const ref=useRef(null)
  const btnRef=useRef(null)
  useEffect(()=>{ const h=(e)=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false) }; document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h) },[])
  const handleToggle=(e)=>{ e.stopPropagation(); if(!open&&btnRef.current){ const rect=btnRef.current.getBoundingClientRect(); setFlipUp(window.innerHeight-rect.bottom<200) }; setOpen(o=>!o) }
  const current=RESULT_MAP[currentResult]||RESULT_MAP.NOT_TESTED; const Icon=current.icon
  return (
    <div ref={ref} className="relative inline-block" onClick={e=>e.stopPropagation()}>
      <button ref={btnRef} onClick={handleToggle} disabled={saving}
        className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-all hover:opacity-80 disabled:opacity-50', current.color, current.bg, current.border)}>
        <Icon size={9}/><span>{current.short}</span>{open?<ChevronUp size={8}/>:<ChevronDown size={8}/>}
      </button>
      {open && (
        <div className={cn("absolute right-0 w-40 bg-surface-raised border border-border rounded-card shadow-elevated z-50 py-1", flipUp?"bottom-full mb-1":"top-full mt-1")}>
          {RESULTS.map(r=>{ const RIcon=r.icon; return (
            <button key={r.value} onClick={(e)=>{e.stopPropagation();onSelect(r.value);setOpen(false)}}
              className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-surface-overlay', r.value===currentResult?`${r.color} ${r.bg}`:'text-text-secondary')}>
              <RIcon size={10} className={r.color}/>{r.label}{r.value===currentResult&&<CheckCircle2 size={9} className="ml-auto text-brand-ink"/>}
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
function ControlDetailPanel({ ctrl, onClose, auditorUsers, auditeeUsers,
  canAssignAuditor, canAssignAuditee, canRecordResult, canSubmitEvidence, canRaiseFinding, engagementId }) {
  const qc=useQueryClient()
  const inv=()=>qc.invalidateQueries({queryKey:['engagement-controls',engagementId]})
  const {mutate:doAssignAuditor,isPending:assigningAuditor}=useMutation({mutationFn:(uid)=>apiAssignAuditor(engagementId,ctrl.id,uid),onSuccess:()=>{toast.success('Auditor assigned');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const {mutate:doAssign,isPending:assigning}=useMutation({mutationFn:(uid)=>apiAssignAuditee(engagementId,ctrl.id,uid),onSuccess:()=>{toast.success('Auditee assigned');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const {mutate:doResult,isPending:recording}=useMutation({mutationFn:(r)=>apiTestResult(engagementId,ctrl.id,{testResult:r}),onSuccess:()=>{toast.success('Result recorded');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const {mutate:doSubmit,isPending:submitting}=useMutation({mutationFn:()=>apiSubmitEvidence(engagementId,ctrl.id),onSuccess:()=>{toast.success('Evidence submitted');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const auditor=auditorUsers?.find(u=>uidOf(u)===ctrl.assignedAuditorId)
  const auditee=auditeeUsers?.find(u=>uidOf(u)===ctrl.auditeeAssignedUserId)
  return (
    <div className="absolute inset-0 bg-surface z-10 flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
        <button onClick={onClose} className="text-text-muted hover:text-text-primary"><ChevronRight size={14} className="rotate-180"/></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="font-mono text-[10px] text-brand-ink">{ctrl.controlCodeSnapshot}</span>
            {ctrl.controlTagSnapshot&&<span className="text-[9px] px-1 rounded bg-surface-overlay text-text-muted">{ctrl.controlTagSnapshot}</span>}
            <ResultBadge result={ctrl.testResult} compact/>
          </div>
          <p className="text-sm font-medium text-text-primary truncate">{ctrl.controlNameSnapshot}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {(canRecordResult||canAssignAuditor||canAssignAuditee||canSubmitEvidence)&&(
          <div className="flex flex-col gap-2 p-2.5 bg-surface-overlay rounded-card border border-border/40">
            {canAssignAuditor && mySectionIds.has(ctrl.sectionInstanceId) && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-text-muted uppercase tracking-wide w-14 shrink-0">Auditor</span>
                <UserPicker users={auditorUsers} value={ctrl.assignedAuditorId} onChange={doAssignAuditor} loading={assigningAuditor} placeholder="Assign auditor…"/>
              </div>
            )}
            {canAssignAuditee && mySectionIds.has(ctrl.sectionInstanceId) && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-text-muted uppercase tracking-wide w-14 shrink-0">Auditee</span>
                <UserPicker users={auditeeUsers} value={ctrl.auditeeAssignedUserId} onChange={doAssign} loading={assigning} placeholder="Assign auditee…"/>
              </div>
            )}
            {canRecordResult&&ctrl.testResult&&ctrl.testResult!=='NOT_TESTED'&&(
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-text-muted uppercase tracking-wide w-14 shrink-0">Result</span>
                <ResultBadge result={ctrl.testResult}/>
                <span className="text-[9px] text-text-muted">derived from tests</span>
              </div>
            )}
            {canSubmitEvidence&&(
              <button onClick={()=>doSubmit()} disabled={submitting} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-status-pass-bg text-status-pass-fg border border-status-pass-bd hover:bg-status-pass-bg disabled:opacity-50 self-start ml-auto">
                <CheckCheck size={10}/> Submit evidence
              </button>
            )}
          </div>
        )}
        {ctrl.sectionBreadcrumbSnapshot&&<F label="Section" value={ctrl.sectionBreadcrumbSnapshot}/>}
        {ctrl.descriptionSnapshot&&<F label="Description" value={ctrl.descriptionSnapshot} multi/>}
        {ctrl.testProcedureSnapshot&&<F label="Test procedure" value={ctrl.testProcedureSnapshot} multi/>}
        {ctrl.evidenceGuidanceSnapshot&&<F label="Evidence required" value={ctrl.evidenceGuidanceSnapshot} multi/>}
        {ctrl.testTypeSnapshot&&<F label="Test type" value={ctrl.testTypeSnapshot}/>}
        {ctrl.testerNotes&&<F label="Tester notes" value={ctrl.testerNotes} multi/>}
        {ctrl.failureDetail&&<F label="Failure detail" value={ctrl.failureDetail} multi red/>}
        {ctrl.assignedAuditorId&&<F label="Assigned auditor" value={auditor?userName(auditor):`User #${ctrl.assignedAuditorId}`} icon={UserCheck}/>}
        {ctrl.auditeeAssignedUserId&&<F label="Assigned auditee" value={auditee?userName(auditee):`User #${ctrl.auditeeAssignedUserId}`} icon={Users}/>}
        {ctrl.evidenceSubmittedAt&&<div className="flex items-center gap-1.5 text-[10px] text-status-pass-fg bg-status-pass-bg px-2.5 py-1.5 rounded-card border border-status-pass-bd"><CheckCheck size={12}/>Evidence submitted {new Date(ctrl.evidenceSubmittedAt).toLocaleDateString()}</div>}
        {canRaiseFinding&&ctrl.testResult==='INEFFECTIVE'&&(
          <div className="flex items-center gap-2 p-2.5 bg-status-fail-bg border border-status-fail-bd rounded-card">
            <AlertOctagon size={14} className="text-status-fail-fg shrink-0"/>
            <div className="flex-1 min-w-0"><p className="text-[11px] font-medium text-status-fail-fg">Control failed</p><p className="text-[9px] text-text-muted">Raise a finding to track remediation</p></div>
            <button className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-status-fail-bg text-status-fail-fg border border-status-fail-bd hover:bg-status-fail-bg shrink-0"><AlertOctagon size={9}/> Raise finding</button>
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
      <p className={cn('text-xs leading-relaxed',red?'text-status-fail-fg':'text-text-primary',!multi&&'truncate')}>{value}</p>
    </div>
  )
}

// ── Control row ───────────────────────────────────────────────────────────────
function ControlRow({ ctrl, engagementId, auditorUsers, auditeeUsers, auditeeUsersLoading,
  canAssignAuditor, canAssignAuditee, canRecordResult, onOpenDetail, currentUserId,
  isSelected, onToggleSelect, mySectionIds }) {
  const qc=useQueryClient()
  const inv=()=>qc.invalidateQueries({queryKey:['engagement-controls',engagementId]})
  const {mutate:doAssignAuditor,isPending:assigningAuditor}=useMutation({mutationFn:(uid)=>apiAssignAuditor(engagementId,ctrl.id,uid),onSuccess:()=>{toast.success('Auditor assigned');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const {mutate:doAssign,isPending:assigning}=useMutation({mutationFn:(uid)=>apiAssignAuditee(engagementId,ctrl.id,uid),onSuccess:()=>{toast.success('Auditee assigned');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const {mutate:doResult,isPending:recording}=useMutation({mutationFn:(r)=>apiTestResult(engagementId,ctrl.id,{testResult:r}),onSuccess:()=>{toast.success('Result recorded');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const evidenceSubmitted=!!ctrl.evidenceSubmittedAt||!!ctrl.auditeeEvidenceSubmitted

  // Assignment-scoped action gating — role gives capability, assignment gives scope.
  // Auditor II can only record results on controls assigned to them.
  // Auditee Contributor can only submit evidence on controls assigned to them.
  // Section-level assigners (canAssignAuditor/canAssignAuditee) are exempt —
  // they manage assignments, not individual control work.
  const isAssignedAuditor = ctrl.assignedAuditorId === currentUserId
  const isAssignedAuditee = ctrl.auditeeAssignedUserId === currentUserId
  // Unassigned controls (no auditor set yet) are open to any role holder — until assigned
  const isUnassignedAuditor = !ctrl.assignedAuditorId
  const isUnassignedAuditee = !ctrl.auditeeAssignedUserId

  const effectiveCanRecordResult = canRecordResult && (canAssignAuditor || isAssignedAuditor || isUnassignedAuditor)
  const effectiveCanSubmitEvidence = canAssignAuditee || isAssignedAuditee || isUnassignedAuditee

  const auditor=auditorUsers?.find(u=>uidOf(u)===ctrl.assignedAuditorId)
  const auditee=auditeeUsers?.find(u=>uidOf(u)===ctrl.auditeeAssignedUserId)
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 hover:bg-surface-overlay/40 border-b border-border/20 last:border-0 group cursor-pointer', isSelected && 'bg-brand-500/5', ctrl.assignedAuditorId===currentUserId && 'bg-brand-500/5 border-l-2 border-brand-400/30')} onClick={()=>onOpenDetail(ctrl)} >
      {onToggleSelect && (
        <div onClick={e=>{e.stopPropagation();onToggleSelect(ctrl.id)}} className="shrink-0 flex items-center pr-1">
          <input type="checkbox" checked={!!isSelected}
            onChange={()=>onToggleSelect(ctrl.id)}
            onClick={e=>e.stopPropagation()}
            className="w-3 h-3 accent-brand-500 cursor-pointer"/>
        </div>
      )}
      <CheckSquare size={10} className={cn('shrink-0 mt-0.5',evidenceSubmitted?'text-status-pass-fg':ctrl.assignedAuditorId===currentUserId?'text-brand-ink':'text-text-muted')}/>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {ctrl.controlCodeSnapshot&&<span className="font-mono text-[9px] text-brand-ink shrink-0">{ctrl.controlCodeSnapshot}</span>}
          {ctrl.controlTagSnapshot&&<span className="text-[9px] px-1 rounded bg-surface-overlay text-text-muted shrink-0">{ctrl.controlTagSnapshot}</span>}
          {evidenceSubmitted&&<span className="text-[8px] text-status-pass-fg flex items-center gap-0.5 shrink-0"><CheckCheck size={8}/> evidence</span>}
        </div>
        <p className="text-[11px] text-text-primary line-clamp-1 group-hover:underline underline-offset-2">{ctrl.controlNameSnapshot}</p>
        {/* Assignment summary — visible always */}
        <div className="flex items-center gap-2 mt-0.5">
          {ctrl.assignedAuditorId
            ? <span className="text-[9px] text-text-muted flex items-center gap-0.5">
                <UserCheck size={8} className="text-brand-ink"/>
                {auditor?userName(auditor):`#${ctrl.assignedAuditorId}`}
              </span>
            : <span className="text-[9px] text-text-muted/40 flex items-center gap-0.5 italic">
                <UserCheck size={8} className="text-text-muted/30"/>
                inherited
              </span>}
          {ctrl.auditeeAssignedUserId
            ? <span className="text-[9px] text-text-muted flex items-center gap-0.5">
                <Users size={8} className="text-status-warn-fg"/>
                {auditee?userName(auditee):`#${ctrl.auditeeAssignedUserId}`}
              </span>
            : <span className="text-[9px] text-text-muted/40 flex items-center gap-0.5 italic">
                <Users size={8} className="text-text-muted/30"/>
                inherited
              </span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e=>e.stopPropagation()}>
        {canAssignAuditor && mySectionIds.has(ctrl.sectionInstanceId) && <UserPicker users={auditorUsers} value={ctrl.assignedAuditorId} onChange={(uid)=>doAssignAuditor(uid)} loading={assigningAuditor} placeholder="Auditor…"/>}
        {canAssignAuditee && mySectionIds.has(ctrl.sectionInstanceId) && (
          <UserPicker users={auditeeUsers} value={ctrl.auditeeAssignedUserId} onChange={(uid)=>doAssign(uid)} loading={auditeeUsersLoading||assigning} placeholder="Auditee…"/>
        )}
      </div>
      <ResultBadge result={ctrl.testResult} compact/>
      <ChevronRight size={10} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"/>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function EngagementControlsTab({ engagementId, vc = {}, taskId }) {
  const navigate=useNavigate(); const [search,setSearch]=useState('')
  const [selectedControlIds, setSelectedControlIds] = useState(new Set())
  const [showBulkPanel, setShowBulkPanel]           = useState(false)
  const [bulkAuditorId, setBulkAuditorId]           = useState(null)
  const [bulkAuditeeId, setBulkAuditeeId]           = useState(null)
  const auth           = useSelector(selectAuth)
  const currentUserId  = auth?.userId
  const tenantId       = auth?.tenantId

  // My View: show only controls in sections the user is assigned to.
  // Default false (show all) — flips to true automatically when user has section assignments.
  const [myView, setMyView] = useState(false)
  const [resultFilter, setResultFilter] = useState('')

  // Fetch sections to determine which sections this user is assigned to.
  const {data:sectionsData} = useQuery({
    queryKey:['engagement-sections', engagementId],
    queryFn:()=>api.get(`/v1/audit/engagements/${engagementId}/sections`),
    staleTime:30_000, enabled:!!engagementId,
  })
  const mySectionIds = useMemo(() => {
    const raw = sectionsData?.data?.data || sectionsData?.data || sectionsData
    const sections = Array.isArray(raw) ? raw : []
    const owned = sections.filter(s =>
      s.assignedAuditorId === currentUserId || s.auditeeAssignedUserId === currentUserId
    )
    return new Set(owned.map(s => s.id))
  }, [sectionsData, currentUserId])

  const hasAnySectionAssignment = mySectionIds.size > 0

  // Assign permissions gate:
  // 1. Active task (step-driven): step config controls which picker shows via permissionOverrides
  //    - Step 3 task: auditor picker only (auditee assign removed)
  //    - Step 4 task: auditee picker only (auditor assign removed)
  const perms             = vc.permissions || []

  // 2. Section owner (no task): section owners assign individual control owners
  //    within their sections outside of a formal step.
  //    - Auditor-side section owner: sees auditor picker only
  //    - Auditee-side section owner: sees auditee picker only
  //    Role permission (audit:control:assign-auditor/auditee) determines which
  //    side the section owner can assign to.
  const canAssignAuditor = perms.includes('audit:control:assign-auditor') &&
    (!!taskId || hasAnySectionAssignment)
  const canAssignAuditee = perms.includes('audit:control:assign-auditee') &&
    (!!taskId || hasAnySectionAssignment)

  const canRecordResult   = perms.includes('audit:control:record-test-result')

  // Role filter bar — only for users with assign permissions
  const [auditorRoleFilter, setAuditorRoleFilter] = useState(null)
  const [auditeeRoleFilter, setAuditeeRoleFilter] = useState(null)
  const { data: rolesData } = useQuery({
    queryKey: ['tenant-roles-hierarchy', tenantId],
    queryFn:  () => api.get(`/v1/tenants/${tenantId}/roles/hierarchy`),
    staleTime: 5 * 60_000,
    enabled:  !!(tenantId && (canAssignAuditor || canAssignAuditee)),
  })
  const { auditorRoles, auditeeRoles } = useMemo(() => {
    const payload   = rolesData?.data?.data || rolesData?.data || rolesData
    const hierarchy = payload?.hierarchy || {}
    const flatten   = (side) => (Array.isArray(hierarchy[side]) ? hierarchy[side] : [])
      .map(r => ({ id: r.role_id ?? r.id, name: r.name }))
    return { auditorRoles: flatten('AUDITOR'), auditeeRoles: flatten('AUDITEE') }
  }, [rolesData])
  const canSubmitEvidence = perms.includes('audit:control:submit-evidence')
  const canRaiseFinding   = perms.includes('audit:finding:create')

  const effectiveMyView = (canAssignAuditor || canAssignAuditee)
    ? myView                      // assigners: user-controlled toggle
    : hasAnySectionAssignment     // others: My View only when assigned
  const qc = useQueryClient()
  const bulkMut = useMutation({
    mutationFn: (body) => apiBulkAssign(engagementId, body),
    onSuccess: (r) => {
      const updated = r?.data?.data?.updated || r?.data?.updated || '?'
      toast.success(updated + ' control(s) assigned')
      setSelectedControlIds(new Set())
      setBulkAuditorId(null); setBulkAuditeeId(null)
      setShowBulkPanel(false)
      qc.invalidateQueries({queryKey:['engagement-controls', engagementId]})
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Bulk assign failed'),
  })
  const doBulkAssign = () => {
    if (selectedControlIds.size === 0) return
    if (!bulkAuditorId && !bulkAuditeeId) { toast.error('Select a user to assign'); return }
    bulkMut.mutate({
      controlIds: Array.from(selectedControlIds),
      auditorUserId: bulkAuditorId || undefined,
      auditeeUserId: bulkAuditeeId || undefined,
    })
  }
  const toggleSelect = (id) => setSelectedControlIds(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const toggleSelectAll = () => setSelectedControlIds(prev =>
    prev.size === displayControls.length
      ? new Set()
      : new Set(displayControls.map(c => c.id))
  )
  const {data:auditorData,isLoading:auditorUsersLoading}=useQuery({queryKey:['users-by-side','AUDITOR'],queryFn:fetchAuditors,staleTime:5*60_000,enabled:canAssignAuditor})

  const {data:auditeeData,isLoading:auditeeUsersLoading}=useQuery({queryKey:['users-by-side','AUDITEE'],queryFn:fetchAuditees,staleTime:5*60_000,enabled:canAssignAuditee})
  // assignable-auditees: engagement-scoped, no USER_VIEW needed — returns AUDITEE_CONTRIBUTOR users
  const {data:assignableRaw=[],isLoading:assignableLoading}=useQuery({
    queryKey:['assignable-auditees',engagementId],
    queryFn:()=>fetchAssignableAuditees(engagementId),
    staleTime:60*1000, enabled:canAssignAuditee,
  })
  const allAuditeeUsers = useMemo(() => {
    if (assignableRaw.length > 0) return assignableRaw
    return flattenUsers(auditeeData)
  }, [assignableRaw, auditeeData])
  // Apply role filter when set — otherwise show all users on that side
  const auditorUsers    = useMemo(() => {
    const all = flattenUsers(auditorData)
    if (!auditorRoleFilter) return all
    return all.filter(u => (u.roles||[]).some(r => (r.id||r.roleId) === auditorRoleFilter))
  }, [auditorData, auditorRoleFilter])
  const auditeeUsers    = useMemo(() => {
    if (!auditeeRoleFilter) return filterByRole(allAuditeeUsers, ROLE_AUDITEE_CONTRIBUTOR)
    return allAuditeeUsers.filter(u => (u.roles||[]).some(r => (r.id||r.roleId) === auditeeRoleFilter))
  }, [allAuditeeUsers, auditeeRoleFilter])
  const {data,isLoading}=useQuery({queryKey:['engagement-controls',engagementId],queryFn:()=>fetchControls(engagementId),staleTime:30_000,enabled:!!engagementId})
  const controls=useMemo(()=>{ const raw=data?.data?.data||data?.data||data; return Array.isArray(raw)?raw:[] },[data])

  const filtered=useMemo(()=>{ const q=search.toLowerCase(); const bySearch=!search?controls:controls.filter(c=>c.controlNameSnapshot?.toLowerCase().includes(q)||c.controlCodeSnapshot?.toLowerCase().includes(q)||c.controlTagSnapshot?.toLowerCase().includes(q)); return !resultFilter?bySearch:bySearch.filter(c=>c.testResult===resultFilter) },[controls,search,resultFilter])
  const displayControls = useMemo(() => {
    if (!currentUserId) return filtered
    if (canAssignAuditor || canAssignAuditee) {
      // Assigners: My View toggle controls filtering
      if (!myView) return filtered
      // My View on: show controls in their assigned sections
      if (mySectionIds.size > 0)
        return filtered.filter(c => c.sectionInstanceId && mySectionIds.has(c.sectionInstanceId))
      return filtered
    }

    // Non-assigners: three-tier scope resolution
    // Tier 1: Section-level assignment (Lead Auditor delegated this section to me)
    if (mySectionIds.size > 0) {
      return filtered.filter(c => c.sectionInstanceId && mySectionIds.has(c.sectionInstanceId))
    }

    // Tier 2: Control-level assignment (I was assigned to this specific control)
    // This is the Auditor II / Auditee Contributor case — per-control workers
    const myControls = filtered.filter(c =>
      c.assignedAuditorId === currentUserId || c.auditeeAssignedUserId === currentUserId
    )
    if (myControls.length > 0) return myControls

    // Tier 3: No assignments at all — show everything read-only
    // (CISO, reviewer, someone browsing)
    return filtered
  }, [filtered, myView, currentUserId, mySectionIds, canAssignAuditor, canAssignAuditee])
  const grouped=useMemo(()=>{ const map=new Map(); for(const c of displayControls){ const k=c.sectionBreadcrumbSnapshot||'Ungrouped'; if(!map.has(k)) map.set(k,[]); map.get(k).push(c) }; return [...map.entries()] },[displayControls])
  const stats=useMemo(()=>({
    total:controls.length,
    effective:controls.filter(c=>c.testResult==='EFFECTIVE').length,
    partial:controls.filter(c=>c.testResult==='PARTIALLY_EFFECTIVE').length,
    ineffective:controls.filter(c=>c.testResult==='INEFFECTIVE').length,
    notTested:controls.filter(c=>!c.testResult||c.testResult==='NOT_TESTED').length,
    auditorAssigned:controls.filter(c=>c.assignedAuditorId).length,
    auditorInherited:controls.filter(c=>!c.assignedAuditorId).length,
    auditeeAssigned:controls.filter(c=>c.auditeeAssignedUserId).length,
    auditeeInherited:controls.filter(c=>!c.auditeeAssignedUserId).length,
    evidenceDone:controls.filter(c=>c.auditeeEvidenceSubmitted||c.evidenceSubmittedAt).length
  }),[controls])
  if(isLoading) return <div className="px-4 py-6 text-xs text-text-muted text-center">Loading controls…</div>
  if(!controls.length) return <div className="px-4 py-6 text-xs text-text-muted text-center">No controls in this engagement.</div>
  return (
    <div className="relative h-full flex flex-col">
      {/* ── Progress tracker ── */}
      <div className="px-3 pt-2.5 pb-2 border-b border-border/40 shrink-0 space-y-2">
        {/* Pill stats row */}
        <div className="flex items-center gap-2 flex-wrap text-[10px]">
          <span className="font-medium text-text-secondary">{stats.total} controls</span>
          <span className="text-border">·</span>
          {/* Evidence track */}
          <span className={cn('flex items-center gap-1', stats.evidenceDone===stats.total&&stats.total>0?'text-status-pass-fg':'text-text-muted')}>
            <CheckCheck size={9}/>{stats.evidenceDone}/{stats.total} evidence submitted
          </span>
          {/* Test results track */}
          {(stats.effective>0||stats.ineffective>0||stats.partial>0)&&<span className="text-border">·</span>}
          {stats.effective>0&&<span className="text-status-pass-fg">{stats.effective} effective</span>}
          {stats.partial>0&&<span className="text-status-warn-fg">{stats.partial} partial</span>}
          {stats.ineffective>0&&<span className="text-status-fail-fg">{stats.ineffective} failed</span>}
          {stats.notTested>0&&stats.total>0&&(stats.effective>0||stats.ineffective>0)&&<span className="text-text-muted">{stats.notTested} not tested</span>}
          {/* Assignment track — only show when relevant */}
          {canAssignAuditor&&<><span className="text-border">·</span><span className={cn(stats.auditorAssigned===stats.total?'text-status-pass-fg':'text-status-pass-fg')}>{stats.auditorAssigned}/{stats.total} auditors</span></>}
          {canAssignAuditee&&<><span className="text-border">·</span><span className={cn(stats.auditeeAssigned===stats.total?'text-status-pass-fg':'text-status-tag-fg')}>{stats.auditeeAssigned}/{stats.total} auditees</span></>}
          <div className="ml-auto flex items-center gap-2 text-[9px]">
            {canAssignAuditor&&<span className="text-status-pass-fg flex items-center gap-0.5"><UserCheck size={9}/> assign auditor</span>}
            {canAssignAuditee&&<span className="text-status-tag-fg flex items-center gap-0.5"><Users size={9}/> assign auditee</span>}
            {canRecordResult&&<span className="text-status-pass-fg flex items-center gap-0.5"><CheckCircle2 size={9}/> result</span>}
            {canSubmitEvidence&&<span className="text-status-pass-fg flex items-center gap-0.5"><CheckCheck size={9}/> evidence</span>}
            {/* Result filter */}
            <select value={resultFilter} onChange={e=>setResultFilter(e.target.value)}
              className="text-[9px] bg-surface border border-border rounded px-1.5 py-0.5 text-text-secondary focus:outline-none focus:border-brand-500/50 cursor-pointer">
              <option value="">All results</option>
              <option value="NOT_TESTED">Pending</option>
              <option value="EFFECTIVE">Effective</option>
              <option value="PARTIALLY_EFFECTIVE">Partial</option>
              <option value="INEFFECTIVE">Failed</option>
              <option value="NOT_APPLICABLE">N/A</option>
            </select>
            {/* My view / My sections toggle — inline in the stats row */}
            {(canAssignAuditor || canAssignAuditee) ? (
              <button onClick={()=>setMyView(v=>!v)} className={cn('flex items-center gap-1 px-2 py-0.5 rounded-ctl border transition-all',myView?'border-brand-500/40 bg-brand-500/10 text-brand-ink':'border-border text-text-muted hover:text-text-secondary')}>
                {myView?<Eye size={9}/>:<EyeOff size={9}/>} My view
              </button>
            ) : hasAnySectionAssignment ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-ctl bg-brand-500/10 text-brand-ink border border-brand-500/30">
                <Eye size={9}/> My sections
              </span>
            ) : displayControls.length < filtered.length && displayControls.length > 0 ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-ctl bg-brand-500/10 text-brand-ink border border-brand-500/30">
                <Eye size={9}/> My controls ({displayControls.length})
              </span>
            ) : null}
          </div>
        </div>
        {/* Dual progress bars */}
        {stats.total > 0 && (
          <div className="space-y-1">
            {/* Evidence bar */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-text-muted w-20 shrink-0">Evidence</span>
              <div className="flex-1 h-1.5 bg-surface-overlay rounded-full overflow-hidden">
                <div className="h-full bg-status-pass-bg rounded-full transition-all"
                  style={{width:`${Math.round(stats.evidenceDone/stats.total*100)}%`}}/>
              </div>
              <span className="text-[9px] text-text-muted w-8 text-right">{Math.round(stats.evidenceDone/stats.total*100)}%</span>
            </div>
            {/* Test results bar — only show when any testing has happened */}
            {(stats.effective+stats.partial+stats.ineffective)>0 && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-text-muted w-20 shrink-0">Evaluated</span>
                <div className="flex-1 h-1.5 bg-surface-overlay rounded-full overflow-hidden flex">
                  <div className="h-full bg-status-pass-bg" style={{width:`${Math.round(stats.effective/stats.total*100)}%`}}/>
                  <div className="h-full bg-status-warn-bg" style={{width:`${Math.round(stats.partial/stats.total*100)}%`}}/>
                  <div className="h-full bg-status-fail-bg" style={{width:`${Math.round(stats.ineffective/stats.total*100)}%`}}/>
                </div>
                <span className="text-[9px] text-text-muted w-8 text-right">{Math.round((stats.effective+stats.partial+stats.ineffective)/stats.total*100)}%</span>
              </div>
            )}
          </div>
        )}
      </div>
      {/* ── Role filter bar — only for users with assign permissions ── */}
      {(canAssignAuditor || canAssignAuditee) && (auditorRoles.length > 0 || auditeeRoles.length > 0) && (
        <div className="px-3 py-1.5 border-b border-border/30 shrink-0 flex items-center gap-3 flex-wrap bg-surface-raised/30">
          <span className="text-[9px] text-text-muted font-medium uppercase tracking-wide shrink-0">Filter assignable:</span>
          {canAssignAuditor && auditorRoles.length > 0 && (
            <div className="flex items-center gap-1.5">
              <UserCheck size={9} className="text-brand-ink shrink-0"/>
              <select
                value={auditorRoleFilter ?? ''}
                onChange={e => setAuditorRoleFilter(e.target.value ? Number(e.target.value) : null)}
                className="text-[10px] bg-surface border border-border rounded px-1.5 py-0.5 text-text-secondary focus:outline-none focus:border-brand-500/50 cursor-pointer">
                <option value="">All auditors</option>
                {auditorRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          {canAssignAuditee && auditeeRoles.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Users size={9} className="text-status-warn-fg shrink-0"/>
              <select
                value={auditeeRoleFilter ?? ''}
                onChange={e => setAuditeeRoleFilter(e.target.value ? Number(e.target.value) : null)}
                className="text-[10px] bg-surface border border-border rounded px-1.5 py-0.5 text-text-secondary focus:outline-none focus:border-status-warn-bd cursor-pointer">
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
      <div className="px-3 py-1.5 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2">
          {/* Select-all checkbox — only shown when bulk assignment is available */}
          {(canAssignAuditor || canAssignAuditee) && (
            <div className="flex items-center gap-1.5 shrink-0">
              <input type="checkbox"
                checked={displayControls.length > 0 && selectedControlIds.size === displayControls.length}
                ref={el => { if (el) el.indeterminate = selectedControlIds.size > 0 && selectedControlIds.size < displayControls.length }}
                onChange={toggleSelectAll}
                className="w-3 h-3 accent-brand-500 cursor-pointer"/>
              {selectedControlIds.size > 0 && (
                <span className="text-[9px] text-brand-ink font-medium whitespace-nowrap">
                  {selectedControlIds.size} selected
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 px-2 h-7 rounded border border-border bg-surface-raised flex-1">
            <Search size={10} className="text-text-muted shrink-0"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search controls…" className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none"/>
            {search&&<button onClick={()=>setSearch('')} className="text-text-muted hover:text-text-primary"><X size={10}/></button>}
          </div>
          {selectedControlIds.size > 0 && (
            <button onClick={()=>setShowBulkPanel(p=>!p)}
              className="shrink-0 text-[10px] px-2 py-1 rounded bg-brand-500/15 text-brand-ink border border-brand-500/30 hover:bg-brand-500/25 whitespace-nowrap">
              Assign {selectedControlIds.size}…
            </button>
          )}
        </div>
      </div>
      {/* ── Bulk assign panel — slides in when "Assign N…" is clicked ── */}
      {showBulkPanel && selectedControlIds.size > 0 && (
        <div className="px-3 py-2 border-b border-brand-500/30 bg-brand-500/5 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-brand-ink">
              Bulk assign {selectedControlIds.size} control{selectedControlIds.size !== 1 ? 's' : ''}
            </span>
            <button onClick={()=>setShowBulkPanel(false)} className="text-text-muted hover:text-text-primary"><X size={10}/></button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canAssignAuditor && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-text-muted">Auditor:</span>
                <UserPicker
                  value={bulkAuditorId} users={auditorUsers}
                  onChange={setBulkAuditorId}
                  placeholder="Pick auditor"/>
              </div>
            )}
            {canAssignAuditee && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-text-muted">Auditee:</span>
                <UserPicker
                  value={bulkAuditeeId} users={auditeeUsers}
                  onChange={setBulkAuditeeId}
                  placeholder="Pick auditee"/>
              </div>
            )}
            <button
              onClick={doBulkAssign}
              disabled={bulkMut.isPending || (!bulkAuditorId && !bulkAuditeeId)}
              className="ml-auto text-[10px] px-3 py-1 rounded bg-brand-500 text-brand-900 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
              {bulkMut.isPending ? 'Assigning…' : 'Assign'}
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {grouped.map(([section,ctrls])=>(
          <div key={section}>
            <div className="px-3 py-1 text-[9px] text-text-muted bg-surface-secondary/50 border-b border-border/20 sticky top-0 z-10 flex items-center gap-2">
              <span className="truncate flex-1">{section}</span>
              <span className="shrink-0">{ctrls.filter(c=>c.testResult==='EFFECTIVE').length}/{ctrls.length}</span>
            </div>
            {ctrls.map(ctrl=>(
              <ControlRow key={ctrl.id} ctrl={ctrl} engagementId={engagementId}
                auditorUsers={auditorUsers} auditeeUsers={auditeeUsers} auditeeUsersLoading={auditeeUsersLoading}
                canAssignAuditor={canAssignAuditor} canAssignAuditee={canAssignAuditee}
                canRecordResult={canRecordResult}
                onOpenDetail={(ctrl)=>navigate(`/module/audit_control_instance/${ctrl.id}`)}
                currentUserId={currentUserId}
                isSelected={selectedControlIds.has(ctrl.id)}
                onToggleSelect={(canAssignAuditor || canAssignAuditee) ? toggleSelect : null}
                mySectionIds={mySectionIds}/>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}