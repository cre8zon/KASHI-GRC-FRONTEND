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
 *   GET  /v1/audit/engagements/{id}/assignable-auditors   (hold audit:control:record-test-result)
 *   GET  /v1/audit/engagements/{id}/assignable-auditees   (hold audit:control:submit-evidence)
 *   PUT  /v1/audit/engagements/{id}/controls/{cid}/assign-auditor   ← NEW
 *   PUT  /v1/audit/engagements/{id}/controls/{cid}/assign-auditee
 *   PUT  /v1/audit/engagements/{id}/controls/{cid}/test-result
 *   POST /v1/audit/engagements/{id}/controls/{cid}/submit-evidence
 *   GET  /v1/kashilink/engagements/{id}/pull/preview                ← NEW (dry run)
 *   POST /v1/kashilink/engagements/{id}/pull                        ← NEW (execute)
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import {
  CheckSquare, CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  ChevronRight, Search, Users, UserCheck,
  CheckCheck, Minus, X, ChevronDown, ChevronUp, AlertOctagon, Eye, EyeOff, FileText, Link2, FlaskConical, RefreshCw, ShieldCheck, Zap } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useOpenEntityDrawer, readDrawerLevels } from '../../hooks/useEntityDrawer'
import api    from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast  from 'react-hot-toast'
import { Modal } from '../ui/Modal'

// ── API helpers ───────────────────────────────────────────────────────────────
const fetchControls      = (eid)         => api.get(`/v1/audit/engagements/${eid}/controls`)
// People pickers choose by PERMISSION, not by role name or side: the backend
// lists whoever holds the permission the work is checked against, scoped to
// the right membership (client staff / the engagement's audit firm).
const fetchAssignableAuditors = (eid) => api.get(`/v1/audit/engagements/${eid}/assignable-auditors`)
    .then(r => Array.isArray(r) ? r : (r?.data?.data || r?.data || r || []))
const fetchAssignableAuditees = (eid) => api.get(`/v1/audit/engagements/${eid}/assignable-auditees`)
    .then(r => Array.isArray(r) ? r : (r?.data?.data || r?.data || r || []))
const apiAssignAuditor   = (eid,cid,uid) => api.put(`/v1/audit/engagements/${eid}/controls/${cid}/assign-auditor`, { auditorUserId: uid })
const apiAssignAuditee   = (eid,cid,uid) => api.put(`/v1/audit/engagements/${eid}/controls/${cid}/assign-auditee`, { auditeeUserId: uid })
const apiBulkAssign      = (eid,body)    => api.post(`/v1/audit/engagements/${eid}/controls/bulk-assign`, body)
const apiTestResult      = (eid,cid,req) => api.put(`/v1/audit/engagements/${eid}/controls/${cid}/test-result`, req)
const apiSubmitEvidence  = (eid,cid)     => api.post(`/v1/audit/engagements/${eid}/controls/${cid}/submit-evidence`)
const apiPreviewPull     = (eid)         => api.get(`/v1/kashilink/engagements/${eid}/pull/preview`)
const apiPull            = (eid)         => api.post(`/v1/kashilink/engagements/${eid}/pull`)
const apiSubmitLinked    = (eid,ids)     => api.post(`/v1/audit/engagements/${eid}/controls/submit-linked-evidence`, { controlIds: ids })


// ── uid: normalise userId vs id from different endpoints ──────────────────────────
const uidOf = (u) => u?.userId ?? u?.id

// ── rolesOf: the distinct roles held by a list of users (for the role filter) ─────
function rolesOf(users) {
  const map = new Map()
  for (const u of users) for (const r of (u.roles || [])) {
    const id = r.id ?? r.roleId
    if (id != null && !map.has(id)) map.set(id, { id, name: r.name || r.roleName || `Role ${id}` })
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// ── flattenUsers: unwrap paginated API response to plain array ────────────────────
function flattenUsers(raw) {
  const arr = raw?.data?.data?.items || raw?.data?.items || raw?.items
                || raw?.data?.data   || raw?.data        || raw
  return Array.isArray(arr) ? arr : []
}

// ── PullEvidenceModal ────────────────────────────────────────────────────────
// Two-step: preview (dry run, writes nothing) → confirm → execute. Every link
// created lands as PENDING_REVIEW on the backend — the auditor still decides,
// per link, whether prior-period evidence actually satisfies this period. This
// is deliberately NOT automatic (see KashiLinkController) — a peer reviewer of
// the audit firm's own process would flag silent evidence carry-forward, so
// pulling it in has to be an explicit, visible action taken by a person.
function PullEvidenceModal({ open, onClose, engagementId, onPulled }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['kashilink-pull-preview', engagementId],
    queryFn:  () => apiPreviewPull(engagementId),
    enabled:  open,
    staleTime: 0, // always fresh — evidence pool changes between opens
  })
  const preview = data?.data?.data || data?.data || data || {}

  const { mutate: doPull, isPending: pulling } = useMutation({
    mutationFn: () => apiPull(engagementId),
    onSuccess: (r) => {
      const linked = r?.data?.data?.linksCreated ?? r?.data?.linksCreated ?? r?.linksCreated ?? 0
      toast.success(linked > 0
        ? `${linked} evidence link(s) created — pending your review`
        : 'No new evidence to link')
      onPulled?.()
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Pull failed'),
  })

  return (
    <Modal open={open} onClose={onClose} size="sm"
      title="Pull existing evidence into this engagement"
      subtitle="Matches evidence already on file for this tenant against this engagement's controls, tests, and policies by tag.">
      {isLoading ? (
        <div className="px-5 py-8 text-xs text-text-muted text-center">Checking for matching evidence…</div>
      ) : isError ? (
        <div className="px-5 py-8 text-xs text-status-fail-fg text-center">Couldn't load preview. Try again.</div>
      ) : (
        <div className="px-5 py-4 space-y-3">
          {(preview.candidateRecords ?? 0) === 0 ? (
            <p className="text-xs text-text-muted">
              No matching evidence found on file for this engagement's control tags
              {preview.distinctTags != null && ` (checked ${preview.distinctTags} tag${preview.distinctTags === 1 ? '' : 's'})`}.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-ctl border border-border bg-surface-overlay py-2">
                  <div className="text-lg font-semibold text-text-primary">{preview.candidateRecords}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">on file</div>
                </div>
                <div className="rounded-ctl border border-status-pass-bd bg-status-pass-bg py-2">
                  <div className="text-lg font-semibold text-status-pass-fg">{preview.linksCreated}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">would link</div>
                </div>
                <div className="rounded-ctl border border-border bg-surface-overlay py-2">
                  <div className="text-lg font-semibold text-text-secondary">{preview.skippedOutOfPeriod ?? 0}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">out of period</div>
                </div>
              </div>
              {Array.isArray(preview.tags) && preview.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {preview.tags.map(t => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-overlay border border-border text-text-muted">{t}</span>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-text-muted">
                Every link is created as pending review — nothing counts as submitted
                until an auditor confirms it satisfies this period.
              </p>
            </>
          )}
        </div>
      )}
      <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-end gap-2">
        <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-ctl border border-border text-text-secondary hover:bg-surface-overlay">
          Cancel
        </button>
        <button
          onClick={() => doPull()}
          disabled={pulling || isLoading || (preview.candidateRecords ?? 0) === 0}
          className="text-xs px-3 py-1.5 rounded-ctl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
          {pulling ? 'Linking…' : <><Link2 size={11}/> Pull evidence</>}
        </button>
      </div>
    </Modal>
  )
}


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
  const [coords,setCoords]=useState(null)
  const ref=useRef(null)
  const btnRef=useRef(null)
  const menuRef=useRef(null)
  useEffect(()=>{ const h=(e)=>{ const inBtn=ref.current&&ref.current.contains(e.target); const inMenu=menuRef.current&&menuRef.current.contains(e.target); if(!inBtn&&!inMenu) setOpen(false) }; document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h) },[])
  const handleToggle=(e)=>{ e.stopPropagation(); if(!open&&btnRef.current){ const rect=btnRef.current.getBoundingClientRect(); setFlipUp(window.innerHeight-rect.bottom<220); setCoords({right:window.innerWidth-rect.right, top:rect.bottom, bottom:window.innerHeight-rect.top}) }; setOpen(o=>!o) }
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
      {open && coords && createPortal(
        <div ref={menuRef}
          style={{ position:'fixed', right:coords.right, ...(flipUp?{bottom:coords.bottom+4}:{top:coords.top+4}) }}
          className="w-48 bg-surface-raised border border-border rounded-card shadow-elevated z-[9999] overflow-hidden">
          <div className="p-1 border-b border-border">
            <div className="flex items-center gap-1 px-2 py-0.5 bg-surface-overlay rounded text-[10px]">
              <Search size={9} className="text-text-muted"/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} onClick={e=>e.stopPropagation()} placeholder="Search…" className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted outline-none"/>
            </div>
          </div>
          {selected && <button onClick={(e)=>{e.stopPropagation();onChange(null);setOpen(false)}} className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-status-fail-fg hover:bg-status-fail-bg"><X size={9}/> Unassign</button>}
          <div className="max-h-40 overflow-y-auto">
            {filtered.length===0 ? (
              <div className="px-3 py-2 text-center">
                <p className="text-[10px] text-text-muted">No users found</p>
                {/* Same reason as the sections tab: a membership-scoped picker
                    returns nothing for a firm that has not staffed this client. */}
                <p className="mt-1 text-[9px] text-text-muted leading-relaxed max-w-[16rem] mx-auto">
                  Internal auditors need an auditor-side role in this organization.
                  External auditors appear only after their firm has assigned them here.
                </p>
              </div>
            )
              : filtered.map(u=>(
                <button key={uidOf(u)} onClick={(e)=>{e.stopPropagation();onChange(uidOf(u));setOpen(false);setQuery('')}}
                  className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] text-left hover:bg-surface-overlay', uidOf(u)===value?'bg-status-tag-bg text-status-tag-fg':'text-text-secondary')}>
                  <div className="h-4 w-4 rounded-full bg-surface-overlay border border-border flex items-center justify-center text-[7px] font-bold shrink-0">{userInitials(u)}</div>
                  <div className="flex-1 min-w-0"><div className="truncate font-medium">{userName(u)}</div>{u.roleName&&<div className="text-[8px] text-text-muted">{u.roleName.replace(/_/g,' ')}</div>}</div>
                  {uidOf(u)===value&&<CheckCircle2 size={9} className="text-status-tag-fg shrink-0"/>}
                </button>
              ))}
          </div>
        </div>,
        document.body
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
  const {mutate:doAssignAuditor,isPending:assigningAuditor}=useMutation({mutationFn:(uid)=>apiAssignAuditor(engagementId,ctrl.id,uid),onSuccess:(_r,uid)=>{toast.success(uid?'Auditor assigned':'Auditor unassigned');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const {mutate:doAssign,isPending:assigning}=useMutation({mutationFn:(uid)=>apiAssignAuditee(engagementId,ctrl.id,uid),onSuccess:(_r,uid)=>{toast.success(uid?'Auditee assigned':'Auditee unassigned');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
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
// ── Section headers ───────────────────────────────────────────────────────────
// Controls are grouped under their TOP-LEVEL section (collapsible, expanded by
// default), and inside it under the section each control sits in, with the
// path between the two. Each section shows whether it is SUBMITTED, so section
// auto-submission can be watched from here: a section auto-submits when every
// control in it has its evidence submitted; a parent then auto-submits once
// all of its child sections (and any controls of its own) are submitted.
// Sending a control back reopens the chain.
//
//   ✓ = submitted   ○ = open
//   "x/y submitted" counts controls whose evidence the auditee SUBMITTED — the
//   same rule auto-submission uses. Evidence that is only linked (pulled from
//   an integration, reused) is not a submission until the auditee submits it.
const isSectionSubmitted = (s) => !!(s && (s.submittedAt || s.auditeeSubmittedAt))
// The server's own flag — what bulk submit, checklists and section roll-up go by.
const isFlagSubmitted = (c) => !!(c.auditeeEvidenceSubmitted || c.evidenceSubmittedAt)
// What the cards and counts show. Accepted, reused and integration-verified
// evidence now sets the server's flag itself (recordAcceptedEvidence), so the
// flag is the answer. evidenceAccepted used to count too — which kept a control
// showing "Evidence accepted" after the evidence side asked for a resubmit.
// It is only a fallback for a backend that does not send the flag at all.
const isEvidenceSubmitted = (c) => c.auditeeEvidenceSubmitted !== undefined
  ? isFlagSubmitted(c)
  : (isFlagSubmitted(c) || c.evidenceAccepted === true)

/** Root-first chain of sections for a section id: [root, …, the section]. */
function sectionChain(sectionId, sectionsById) {
  const chain = []
  let cur = sectionId != null ? sectionsById.get(sectionId) : null
  for (let hops = 0; cur && hops < 64; hops++) {
    chain.unshift(cur)
    cur = cur.parentInstanceId != null ? sectionsById.get(cur.parentInstanceId) : null
  }
  return chain
}

const sectionLabel = (s) => [s.sectionCodeSnapshot, s.sectionNameSnapshot].filter(Boolean).join(' ')

function SubmittedMark({ done }) {
  return done
    ? <CheckCircle2 size={9} className="shrink-0 text-status-pass-fg" aria-label="Submitted"/>
    : <span className="w-[7px] h-[7px] rounded-full border border-text-muted/60 shrink-0" aria-label="Open"/>
}

function SectionStatusChip({ section }) {
  if (!section) return null
  const done = isSectionSubmitted(section)
  return (
    <span className={cn('shrink-0 px-1.5 py-px rounded-full border font-medium',
      done ? 'bg-status-pass-bg text-status-pass-fg border-status-pass-bd' : 'border-border text-text-muted')}>
      {done ? 'Submitted' : 'Open'}
    </span>
  )
}

function SectionCounts({ ctrls }) {
  const submitted = ctrls.filter(isEvidenceSubmitted).length
  const effective = ctrls.filter(c => c.testResult === 'EFFECTIVE').length
  return (
    <>
      <span className="shrink-0" title="Controls with evidence submitted by the auditee — what section auto-submission counts">{submitted}/{ctrls.length} submitted</span>
      <span className="shrink-0" title="Controls tested effective">{effective}/{ctrls.length} effective</span>
    </>
  )
}

/** Top-level section: collapsible, sticky. */
function TopSectionHeader({ root, label, ctrls, collapsed, onToggle }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={!collapsed}
      className="w-full px-3 py-1.5 text-[10px] text-text-secondary bg-surface-secondary border-b border-border/40 sticky top-0 z-10 flex items-center gap-2 text-left hover:bg-surface-overlay/60 transition-colors">
      {collapsed ? <ChevronRight size={11} className="shrink-0"/> : <ChevronDown size={11} className="shrink-0"/>}
      {root && <SubmittedMark done={isSectionSubmitted(root)}/>}
      <span className="truncate flex-1 font-semibold">{root ? sectionLabel(root) : label}</span>
      <SectionStatusChip section={root}/>
      <span className="text-[9px] text-text-muted flex items-center gap-2">
        <span className="shrink-0">{ctrls.length} control{ctrls.length === 1 ? '' : 's'}</span>
        <SectionCounts ctrls={ctrls}/>
      </span>
    </button>
  )
}

/** The section the controls below sit in, with the path below the top level. */
function SubSectionHeader({ path, ctrls }) {
  const own = path[path.length - 1]
  return (
    <div className="pl-7 pr-3 py-1 text-[9px] text-text-muted bg-surface-secondary/40 border-b border-border/20 flex items-center gap-2">
      <span className="truncate flex-1 flex items-center gap-1 min-w-0">
        {path.map((s, i) => (
          <span key={s.id} className={cn('flex items-center gap-0.5 min-w-0', i === path.length - 1 ? 'text-text-secondary font-medium' : '')}>
            {i > 0 && <ChevronRight size={8} className="shrink-0 opacity-60"/>}
            <SubmittedMark done={isSectionSubmitted(s)}/>
            <span className="truncate" title={`${sectionLabel(s)} — ${isSectionSubmitted(s) ? 'submitted' : 'open'}`}>{sectionLabel(s)}</span>
          </span>
        ))}
      </span>
      <SectionStatusChip section={own}/>
      <SectionCounts ctrls={ctrls}/>
    </div>
  )
}

// Delegations on a control arrive newest first, live and finished (live=false;
// an older backend sent only live ones and no flag). Shown: every live one, plus
// the latest finished one per person and side that has no live one — so the
// card keeps saying who did the work after it was submitted.
const isLiveDelegation = d => d.live !== false
const shownDelegations = (list) => {
  const all = Array.isArray(list) ? list : []
  const liveKeys = new Set(all.filter(isLiveDelegation).map(d => `${d.assignedTo}|${d.side}`))
  const seen = new Set()
  return all.filter(d => {
    if (isLiveDelegation(d)) return true
    const k = `${d.assignedTo}|${d.side}`
    if (liveKeys.has(k) || seen.has(k)) return false
    seen.add(k); return true
  })
}

const EV_BADGE='text-[9px] font-medium px-1.5 py-0.5 rounded-full border flex items-center gap-1 shrink-0 cursor-pointer hover:brightness-95 hover:ring-1 hover:ring-current/30'

function ControlRow({ ctrl, engagementId, auditorUsers, auditeeUsers, auditeeUsersLoading,
  canAssignAuditor, canAssignAuditee, canRecordResult, onOpenDetail, currentUserId,
  isSelected, onToggleSelect, mySectionIds, isActive, wasActive }) {
  const qc=useQueryClient()
  const inv=()=>qc.invalidateQueries({queryKey:['engagement-controls',engagementId]})
  const {mutate:doAssignAuditor,isPending:assigningAuditor}=useMutation({mutationFn:(uid)=>apiAssignAuditor(engagementId,ctrl.id,uid),onSuccess:(_r,uid)=>{toast.success(uid?'Auditor assigned':'Auditor unassigned');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const {mutate:doAssign,isPending:assigning}=useMutation({mutationFn:(uid)=>apiAssignAuditee(engagementId,ctrl.id,uid),onSuccess:(_r,uid)=>{toast.success(uid?'Auditee assigned':'Auditee unassigned');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  const {mutate:doResult,isPending:recording}=useMutation({mutationFn:(r)=>apiTestResult(engagementId,ctrl.id,{testResult:r}),onSuccess:()=>{toast.success('Result recorded');inv()},onError:(e)=>toast.error(e?.response?.data?.message||'Failed')})
  // Two different things, shown differently:
  //   submitted — the auditee submitted the evidence (what reviews and section
  //               auto-submission go by)
  //   linked    — evidence is attached (pulled from an integration, reused,
  //               auto-tagged: hasEvidence from the backend) but nobody has
  //               submitted it yet
  // Both used to show as "Evidence submitted", so a control with only pulled
  // evidence looked done while its section stayed open.
  const evidenceSubmitted=isEvidenceSubmitted(ctrl)
  // Evidence attached but not (or no longer) submitted — also after "Ask to resubmit".
  const evidenceLinked=!evidenceSubmitted&&!!ctrl.hasEvidence
  // Any evidence badge opens this control on its Evidence tab.
  const openEvidence=(e)=>{e.stopPropagation();onOpenDetail(ctrl,'evidence')}

  // Assignment-scoped action gating — role gives capability, assignment gives scope.
  // Auditor II can only record results on controls assigned to them.
  // Auditee Contributor can only submit evidence on controls assigned to them.
  // Section-level assigners (canAssignAuditor/canAssignAuditee) are exempt —
  // they manage assignments, not individual control work.
  //
  // WAS a client-side rule — "unassigned controls are open to any role holder"
  // — which is exactly the hole the server guard closes. The row now carries
  // canRecordResult / canSubmitEvidence from GET /engagements/{id}/controls,
  // computed by ControlAccessGuard (assignee, section owner, delegate,
  // override), so the list cannot offer what the endpoint will refuse.
  const effectiveCanRecordResult   = canRecordResult && ctrl.canRecordResult === true
  const effectiveCanSubmitEvidence = ctrl.canSubmitEvidence === true

  const auditor=auditorUsers?.find(u=>uidOf(u)===ctrl.assignedAuditorId)
  const auditee=auditeeUsers?.find(u=>uidOf(u)===ctrl.auditeeAssignedUserId)
  return (
    <div data-control-id={ctrl.id} aria-current={isActive ? 'true' : undefined}
      className={cn('flex items-center gap-2 px-3 py-2 hover:bg-surface-overlay/40 border-b border-border/20 last:border-0 group cursor-pointer scroll-mt-16 transition-colors', isSelected && 'bg-brand-500/5', ctrl.assignedAuditorId===currentUserId && 'bg-brand-500/5 border-l-2 border-brand-400/30',
        // The control open in the drawer — and, once the drawer closes, the one
        // that was last open, so you come back to where you were.
        isActive && 'bg-brand-500/15 border-l-[3px] border-l-brand-500 ring-1 ring-inset ring-brand-500/40',
        !isActive && wasActive && 'bg-brand-500/[0.07] border-l-[3px] border-l-brand-500/50')}
      onClick={()=>onOpenDetail(ctrl)} >
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
          {/* Evidence state and SOURCE. Every evidence badge opens the control on
              its Evidence tab. Sources stay after submission: what came from an
              integration check, and what was reused (KashiLink — controls the UCF
              maps to the same requirement — or a document reused by reference).
              Reused evidence needs no review, so it has one badge. */}
          {evidenceSubmitted&&(isFlagSubmitted(ctrl)
            ? <span onClick={openEvidence} role="button" className={cn(EV_BADGE,'bg-status-pass-bg text-status-pass-fg border-status-pass-bd')} title="Open the evidence"><CheckCheck size={9}/> Evidence submitted</span>
            : <span onClick={openEvidence} role="button" className={cn(EV_BADGE,'bg-status-pass-bg text-status-pass-fg border-status-pass-bd')} title="Linked evidence that was accepted, reused or verified by an integration — counts as submitted"><ShieldCheck size={9}/> Evidence accepted</span>)}
          {ctrl.integrationEvidenceCount != null
            ? (ctrl.integrationEvidenceCount>0&&<span onClick={openEvidence} role="button" className={cn(EV_BADGE,'bg-status-info-bg text-status-info-fg border-status-info-bd')} title={`${ctrl.integrationEvidenceCount} piece${ctrl.integrationEvidenceCount===1?'':'s'} of evidence from an integration check${ctrl.evidenceVerifiedCount>0?` · ${ctrl.evidenceVerifiedCount} verified`:''}`}><Zap size={9}/> {ctrl.integrationEvidenceCount} from integration</span>)
            : (ctrl.evidenceVerifiedCount>0&&<span onClick={openEvidence} role="button" className={cn(EV_BADGE,'bg-status-pass-bg text-status-pass-fg border-status-pass-bd')} title="Evidence an integration check verified"><ShieldCheck size={9}/> {ctrl.evidenceVerifiedCount} verified</span>)}
          {(ctrl.failedCheckCount ?? ctrl.evidencePendingCount)>0&&<span onClick={openEvidence} role="button" className={cn(EV_BADGE,'bg-status-warn-bg text-status-warn-fg border-status-warn-bd')} title="An integration check did not pass on its latest run — the auditor reviews it on the Evidence tab. A later passing run clears it."><Zap size={9}/> {ctrl.failedCheckCount ?? ctrl.evidencePendingCount} failed check</span>}
          {ctrl.reusedEvidenceCount>0&&<span onClick={openEvidence} role="button" className={cn(EV_BADGE,'bg-status-tag-bg text-status-tag-fg border-status-tag-bd')} title="Evidence reused from a control linked to the same requirement (KashiLink), or a document reused by reference"><RefreshCw size={9}/> {ctrl.reusedEvidenceCount} reused</span>}
          {evidenceLinked&&<span onClick={openEvidence} role="button" className={cn(EV_BADGE,'bg-surface-overlay text-text-secondary border-border')} title="Evidence is attached but has not been submitted yet. Submit it from the control to hand it to the auditor."><Link2 size={9}/> Evidence linked · not submitted</span>}
          {/* Tests / policies attached to this control, with counts (testCount /
              policyCount from the controls list). Shown only when there are any.
              A backend without the counts still gets the old "Policy" flag. */}
          {ctrl.testCount > 0 && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-status-tag-bg text-status-tag-fg border border-status-tag-bd flex items-center gap-1 shrink-0" title={`${ctrl.testCount} test${ctrl.testCount === 1 ? '' : 's'} attached to this control`}><FlaskConical size={9}/> {ctrl.testCount} {ctrl.testCount === 1 ? 'Test' : 'Tests'}</span>}
          {ctrl.policyCount != null
            ? (ctrl.policyCount > 0 && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-status-tag-bg text-status-tag-fg border border-status-tag-bd flex items-center gap-1 shrink-0" title={`${ctrl.policyCount} polic${ctrl.policyCount === 1 ? 'y' : 'ies'} attached to this control`}><FileText size={9}/> {ctrl.policyCount} {ctrl.policyCount === 1 ? 'Policy' : 'Policies'}</span>)
            : (ctrl.hasPolicy && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-status-tag-bg text-status-tag-fg border border-status-tag-bd flex items-center gap-1 shrink-0" title="At least one policy is attached to this control"><FileText size={9}/> Policy</span>)}
          {/* Delegations (action items) on this control: who holds each and who
              handed it out. Finished ones stay, muted with a tick, so you can find
              the work someone did after it was submitted. Falls back to the old
              flag on an older backend. */}
          {Array.isArray(ctrl.delegations) ? shownDelegations(ctrl.delegations).map(d => {
            const toMe = d.assignedTo === currentUserId, byMe = d.delegatedBy === currentUserId
            const live = isLiveDelegation(d)
            return (
              <span key={d.id}
                className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 flex items-center gap-1',
                  !live ? 'bg-transparent text-text-muted border-border/60 border-dashed'
                    : toMe ? 'bg-brand-500/15 text-brand-ink border-brand-500/30' : 'bg-surface-overlay text-text-secondary border-border')}
                title={`${d.type === 'CONTROL_REOPEN' ? 'Sent back' : 'Delegated'} to ${d.assignedToName || 'someone'}${d.delegatedByName ? ` by ${d.delegatedByName}` : ''} · ${live ? (d.status || 'OPEN') : `done${d.resolvedAt ? ' ' + new Date(d.resolvedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}`}`}>
                {!live && <CheckCheck size={9}/>}
                {d.type === 'CONTROL_REOPEN' ? 'Sent back' : d.side === 'TESTING' ? 'Testing' : 'Evidence'} → {toMe ? 'you' : (d.assignedToName || 'someone')}
                {d.delegatedByName && <span className="font-normal opacity-70">· by {byMe ? 'you' : d.delegatedByName}</span>}
              </span>
            )
          }) : ctrl.hasMyObligation && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-ink border border-brand-500/30 shrink-0" title="Delegated to you — open the control to do the work">Delegated to you</span>}
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
  // Rows open the control in a drawer over this tab — the full control screen,
  // embedded — so the list stays where it is. "Full page" is in the drawer.
  const openDrawer = useOpenEntityDrawer()
  const [selectedControlIds, setSelectedControlIds] = useState(new Set())
  const [showBulkPanel, setShowBulkPanel]           = useState(false)
  const [bulkAuditorId, setBulkAuditorId]           = useState(null)
  const [bulkAuditeeId, setBulkAuditeeId]           = useState(null)
  const [showPullModal, setShowPullModal]           = useState(false)
  const auth           = useSelector(selectAuth)
  const currentUserId  = auth?.userId
  const tenantId       = auth?.tenantId

  // My View: show only controls in sections the user is assigned to.
  // null = not chosen yet → ON when the user has sections or controls of their
  // own (see myViewOn below), OFF otherwise. The toggle then remembers the choice.
  const [myView, setMyView] = useState(null)
  const [resultFilter, setResultFilter] = useState('')
  // Delegation filter: '' all · ANY delegated (open) · MINE to me · BYME by me
  // · NONE not delegated · u:<id> delegated to that person.
  const [delegationFilter, setDelegationFilter] = useState('')

  // Fetch sections to determine which sections this user is assigned to.
  const {data:sectionsData} = useQuery({
    queryKey:['engagement-sections', engagementId],
    queryFn:()=>api.get(`/v1/audit/engagements/${engagementId}/sections`),
    staleTime:30_000, enabled:!!engagementId,
  })
  // Sections I own, PLUS every section beneath them — controls hang on leaf
  // sections, so owning "Annex A" must cover the controls under A.5, A.6 …
  const mySectionIds = useMemo(() => {
    const raw = sectionsData?.data?.data || sectionsData?.data || sectionsData
    const sections = Array.isArray(raw) ? raw : []
    const ids = new Set(sections
      .filter(s => s.assignedAuditorId === currentUserId || s.auditeeAssignedUserId === currentUserId)
      .map(s => s.id))
    let grew = ids.size > 0
    while (grew) {
      grew = false
      for (const s of sections) {
        if (s.parentInstanceId != null && ids.has(s.parentInstanceId) && !ids.has(s.id)) { ids.add(s.id); grew = true }
      }
    }
    return ids
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
  //
  // A task counts only on an ASSIGN step — the same rule as the sections tab.
  // It used to be any task, so an evidence owner holding the assign permission
  // became an "assigner" on their EVIDENCE task and saw every control.
  const isAssignStep = (vc.stepAction || '').toUpperCase() === 'ASSIGN'
  //
  // Section owners no longer get the per-control picker outside an assign
  // step: during the work they hand a control on by DELEGATING it (an action
  // item — the owner stays accountable and the control's checklist item stays
  // on the owner's task). Re-pointing the control's owner mid-step moved the
  // work off the owner's checklist onto someone with no task for it, and the
  // owner's evidence/testing gate could then never close.
  const canAssignAuditor = perms.includes('audit:control:assign-auditor') && !!taskId && isAssignStep
  const canAssignAuditee = perms.includes('audit:control:assign-auditee') && !!taskId && isAssignStep

  const canRecordResult   = perms.includes('audit:control:record-test-result')

  // Role filter bar — only for users with assign permissions. An optional
  // narrowing of the eligible people by one of the roles they hold; the roles
  // offered are the ones those people actually have (no side lookup).
  const [auditorRoleFilter, setAuditorRoleFilter] = useState(null)
  const [auditeeRoleFilter, setAuditeeRoleFilter] = useState(null)
  const canSubmitEvidence = perms.includes('audit:control:submit-evidence')
  // Engagement-wide evidence actions — each its own permission:
  //   audit:evidence:pull         Pull evidence (links into every control)
  //   audit:evidence:bulk-submit  submit all LINKED-but-not-submitted at once
  //                               (server scopes it: lead auditee → all;
  //                               section owner → their sections; else the
  //                               controls they may submit)
  const canPullEvidence   = perms.includes('audit:evidence:pull')
  const canBulkSubmit     = perms.includes('audit:evidence:bulk-submit')
  const canRaiseFinding   = perms.includes('audit:finding:create')

  const qc = useQueryClient()
  const bulkMut = useMutation({
    mutationFn: (body) => apiBulkAssign(engagementId, body),
    onSuccess: (r, body) => {
      const updated = r?.data?.data?.updated ?? r?.data?.updated ?? r?.updated ?? '?'
      const unassigning = body?.unassignAuditor || body?.unassignAuditee
      toast.success(updated + (unassigning ? ' control(s) unassigned' : ' control(s) assigned'))
      setSelectedControlIds(new Set())
      setBulkAuditorId(null); setBulkAuditeeId(null)
      setShowBulkPanel(false)
      qc.invalidateQueries({queryKey:['engagement-controls', engagementId]})
    },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || 'Bulk assign failed'),
  })
  // Unassign one side on every selected control. Same authority as assigning
  // (the server checks every control) — the pickers can't express "nobody".
  const doBulkUnassign = (side) => {
    if (selectedControlIds.size === 0) return
    const n = selectedControlIds.size
    if (!window.confirm(`Remove the ${side === 'auditor' ? 'auditor' : 'evidence owner'} from ${n} control${n !== 1 ? 's' : ''}? Open delegations on that side will be closed.`)) return
    bulkMut.mutate({
      controlIds: Array.from(selectedControlIds),
      ...(side === 'auditor' ? { unassignAuditor: true } : { unassignAuditee: true }),
    })
  }
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
  // Engagement-scoped, no USER_VIEW needed. Auditors: hold
  // audit:control:record-test-result. Auditees: hold audit:control:submit-evidence.
  const {data:auditorData,isLoading:auditorUsersLoading}=useQuery({
    queryKey:['assignable-auditors',engagementId],
    queryFn:()=>fetchAssignableAuditors(engagementId),
    staleTime:60*1000, enabled:!!engagementId && canAssignAuditor,
  })
  const {data:assignableRaw=[],isLoading:auditeeUsersLoading}=useQuery({
    queryKey:['assignable-auditees',engagementId],
    queryFn:()=>fetchAssignableAuditees(engagementId),
    staleTime:60*1000, enabled:!!engagementId && canAssignAuditee,
  })
  const allAuditorUsers = useMemo(() => flattenUsers(auditorData), [auditorData])
  const allAuditeeUsers = useMemo(() => flattenUsers(assignableRaw), [assignableRaw])
  const auditorRoles = useMemo(() => rolesOf(allAuditorUsers), [allAuditorUsers])
  const auditeeRoles = useMemo(() => rolesOf(allAuditeeUsers), [allAuditeeUsers])
  // Apply the role filter when set — otherwise everyone eligible
  const auditorUsers    = useMemo(() => {
    if (!auditorRoleFilter) return allAuditorUsers
    return allAuditorUsers.filter(u => (u.roles||[]).some(r => (r.id??r.roleId) === auditorRoleFilter))
  }, [allAuditorUsers, auditorRoleFilter])
  const auditeeUsers    = useMemo(() => {
    if (!auditeeRoleFilter) return allAuditeeUsers
    return allAuditeeUsers.filter(u => (u.roles||[]).some(r => (r.id??r.roleId) === auditeeRoleFilter))
  }, [allAuditeeUsers, auditeeRoleFilter])
  const {data,isLoading,dataUpdatedAt}=useQuery({queryKey:['engagement-controls',engagementId],queryFn:()=>fetchControls(engagementId),staleTime:30_000,enabled:!!engagementId})
  // The group headers show each section's submitted state, and submitting the
  // last control's evidence is what auto-submits a section (and rolls up to its
  // parents). Every refresh of the controls list — after an evidence submit, a
  // send-back, a drawer action — therefore refreshes the sections as well, so
  // the header flips to Submitted / reopens without waiting out its staleTime.
  const lastControlsUpdate = useRef(0)
  useEffect(() => {
    if (!dataUpdatedAt) return
    if (lastControlsUpdate.current && lastControlsUpdate.current !== dataUpdatedAt) {
      qc.invalidateQueries({ queryKey: ['engagement-sections', engagementId] })
    }
    lastControlsUpdate.current = dataUpdatedAt
  }, [dataUpdatedAt, engagementId, qc])
  const controls=useMemo(()=>{ const raw=data?.data?.data||data?.data||data; return Array.isArray(raw)?raw:[] },[data])

  const filtered=useMemo(()=>{
    const q=search.toLowerCase()
    let out=!search?controls:controls.filter(c=>c.controlNameSnapshot?.toLowerCase().includes(q)||c.controlCodeSnapshot?.toLowerCase().includes(q)||c.controlTagSnapshot?.toLowerCase().includes(q))
    if(resultFilter) out=out.filter(c=>c.testResult===resultFilter)
    if(delegationFilter){
      // ds = every delegation (live and finished); live = still open.
      // Person / mine / by-me filters keep finished ones, so the controls
      // delegated to someone stay findable after they (or anyone) submitted.
      const ds=c=>Array.isArray(c.delegations)?c.delegations:[]
      const live=c=>ds(c).filter(isLiveDelegation)
      if(delegationFilter==='ANY')   out=out.filter(c=>live(c).length>0)
      else if(delegationFilter==='DONE')  out=out.filter(c=>ds(c).length>0&&live(c).length===0)
      else if(delegationFilter==='NONE')  out=out.filter(c=>ds(c).length===0)
      else if(delegationFilter==='MINE')  out=out.filter(c=>ds(c).some(d=>d.assignedTo===currentUserId)||c.hasMyObligation===true)
      else if(delegationFilter==='BYME')  out=out.filter(c=>ds(c).some(d=>d.delegatedBy===currentUserId))
      else if(delegationFilter.startsWith('u:')){ const uid=Number(delegationFilter.slice(2)); out=out.filter(c=>ds(c).some(d=>d.assignedTo===uid)) }
    }
    return out
  },[controls,search,resultFilter,delegationFilter,currentUserId])
  // Everyone delegated something in this engagement (open or done) — for "delegated to …".
  const delegatees=useMemo(()=>{
    const m=new Map()
    for(const c of controls) for(const d of (Array.isArray(c.delegations)?c.delegations:[])) if(d.assignedTo!=null&&d.assignedTo!==currentUserId) m.set(d.assignedTo,d.assignedToName||`User #${d.assignedTo}`)
    return [...m.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1])))
  },[controls,currentUserId])
  // A control is "mine" for My view when it is delegated TO me — open or
  // finished, so a delegate keeps the work they did after submitting it.
  // Delegated BY me is deliberately not "mine": handing out (or sending back)
  // one control turned My view into just that control and hid everything else.
  // The delegation filter's "Delegated by me" covers that instead.
  const delegationMine = useCallback(c => c.hasMyObligation === true
    || (Array.isArray(c.delegations) && c.delegations.some(d => d.assignedTo === currentUserId)),
    [currentUserId])
  // Default for My View: on when I have anything of my own here.
  const hasOwnControls = useMemo(() => controls.some(c =>
    c.assignedAuditorId === currentUserId || c.auditeeAssignedUserId === currentUserId || delegationMine(c)),
    [controls, currentUserId, delegationMine])
  const myViewOn = myView ?? (hasAnySectionAssignment || hasOwnControls)
  const effectiveMyView = (canAssignAuditor || canAssignAuditee)
    ? myViewOn                    // assigners: user-controlled toggle
    : hasAnySectionAssignment     // others: My View only when assigned
  const displayControls = useMemo(() => {
    if (!currentUserId) return filtered
    if (canAssignAuditor || canAssignAuditee) {
      // Assigners: My View toggle controls filtering
      if (!myViewOn) return filtered
      // My View on: my sections, plus controls assigned or delegated to me directly
      const mine = filtered.filter(c => (c.sectionInstanceId && mySectionIds.has(c.sectionInstanceId))
        || c.assignedAuditorId === currentUserId || c.auditeeAssignedUserId === currentUserId
        || delegationMine(c))
      return mine.length > 0 ? mine : filtered
    }

    // Non-assigners: three-tier scope resolution
    // Tier 1: Section-level assignment (Lead Auditor delegated this section to me)
    // — plus any single control delegated to me elsewhere, which would otherwise
    // vanish from the list of someone who also owns a section.
    if (mySectionIds.size > 0) {
      return filtered.filter(c => (c.sectionInstanceId && mySectionIds.has(c.sectionInstanceId))
        || delegationMine(c))
    }

    // Tier 2: Control-level assignment (I was assigned to this specific control)
    // This is the Auditor II / Auditee Contributor case — per-control workers
    const myControls = filtered.filter(c =>
      c.assignedAuditorId === currentUserId || c.auditeeAssignedUserId === currentUserId
      // A control delegated to me through an action item is mine to work too.
      || delegationMine(c)
    )
    if (myControls.length > 0) return myControls

    // Tier 3: No assignments at all — show everything read-only
    // (CISO, reviewer, someone browsing)
    return filtered
  }, [filtered, myViewOn, currentUserId, mySectionIds, canAssignAuditor, canAssignAuditee, delegationMine])
  // Sections by id — for the group headers (name, parents, submitted state).
  const sectionsById = useMemo(() => {
    const raw = sectionsData?.data?.data || sectionsData?.data || sectionsData
    return new Map((Array.isArray(raw) ? raw : []).map(s => [s.id, s]))
  }, [sectionsData])
  // Grouped by the control's OWN section (the closest one — what auto-submits
  // first), keyed by section id. The breadcrumb snapshot alone was only codes
  // ("C.4.4") and two sections can share one; it stays as the fallback label
  // when the sections list has not loaded or the control has no section.
  //
  // Two levels: the top-level section (collapsible) → the control's own section.
  // When the sections list is not loaded yet, or a control has no section, the
  // breadcrumb snapshot is the group label instead.
  const grouped=useMemo(()=>{
    const tops=new Map()
    for(const c of displayControls){
      const chain=sectionChain(c.sectionInstanceId, sectionsById)
      const root=chain[0]||null
      const topKey=root?`s:${root.id}`:`b:${c.sectionBreadcrumbSnapshot||'Ungrouped'}`
      if(!tops.has(topKey)) tops.set(topKey,{key:topKey,root,label:c.sectionBreadcrumbSnapshot||'Ungrouped',ctrls:[],subs:new Map()})
      const top=tops.get(topKey)
      top.ctrls.push(c)
      const own=chain[chain.length-1]
      const subKey=own?`s:${own.id}`:'none'
      if(!top.subs.has(subKey)) top.subs.set(subKey,{key:subKey,path:chain.slice(1),ctrls:[]})
      top.subs.get(subKey).ctrls.push(c)
    }
    return [...tops.values()].map(t=>({...t,subs:[...t.subs.values()]}))
  },[displayControls, sectionsById])
  // Collapsed top-level sections — expanded by default.
  const [collapsedTops,setCollapsedTops]=useState(()=>new Set())
  const toggleTop=(key)=>setCollapsedTops(prev=>{ const n=new Set(prev); if(n.has(key)) n.delete(key); else n.add(key); return n })

  // ── The control open in the drawer ──────────────────────────────────────
  // Read from the URL (?drawerType=AUDIT_CONTROL_INSTANCE&drawerId=…, or the
  // inbox's entityType/entityId form), so it is right on a fresh load, on
  // back/forward, and whether the drawer was opened from here, a notification
  // or the inbox. Its card is highlighted and brought into view; the last one
  // opened stays marked after the drawer closes (kept per engagement for the
  // session), so you come back to where you were.
  const [searchParams] = useSearchParams()
  const activeControlId = useMemo(() => {
    const top = readDrawerLevels(searchParams)[0]
    return top && top.type === 'AUDIT_CONTROL_INSTANCE' && Number.isFinite(Number(top.id)) ? Number(top.id) : null
  }, [searchParams])
  const lastKey = `kashi.controls.last.${engagementId}`
  const [lastOpenedId, setLastOpenedId] = useState(() => {
    try { const v = sessionStorage.getItem(lastKey); return v ? Number(v) : null } catch { return null }
  })
  useEffect(() => {
    if (activeControlId == null) return
    setLastOpenedId(activeControlId)
    try { sessionStorage.setItem(lastKey, String(activeControlId)) } catch { /* storage off */ }
  }, [activeControlId, lastKey])
  // Make sure the active card is visible: open its collapsed top section, then
  // scroll it into view — "nearest", so a card already on screen does not move
  // and the list keeps its place when the drawer opens or closes.
  const scrolledFor = useRef(null)
  useEffect(() => {
    const target = activeControlId ?? (scrolledFor.current == null ? lastOpenedId : null)
    if (target == null || scrolledFor.current === target) return
    const top = grouped.find(t => t.ctrls.some(c => c.id === target))
    if (!top) return
    if (collapsedTops.has(top.key)) { setCollapsedTops(prev => { const n = new Set(prev); n.delete(top.key); return n }); return }
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-control-id="${target}"]`)
      if (el) { el.scrollIntoView({ block: activeControlId != null ? 'nearest' : 'center', behavior: 'smooth' }); scrolledFor.current = target }
    })
    return () => cancelAnimationFrame(raf)
  }, [activeControlId, lastOpenedId, grouped, collapsedTops])
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
    evidenceDone:controls.filter(isEvidenceSubmitted).length,
    evidenceLinked:controls.filter(c=>!isEvidenceSubmitted(c)&&c.hasEvidence).length
  }),[controls])
  // Bulk submit of LINKED evidence: the selected controls when any are
  // selected, otherwise every control — in both cases only those whose
  // evidence is linked and not yet submitted. The server applies the scope
  // (whose controls the caller may submit) and reports what it skipped.
  const [showBulkSubmit,setShowBulkSubmit]=useState(false)
  const bulkLinkedTargets=useMemo(()=>{
    const pool=selectedControlIds.size>0?controls.filter(c=>selectedControlIds.has(c.id)):controls
    return pool.filter(c=>!isFlagSubmitted(c)&&c.hasEvidence)
  },[controls,selectedControlIds])
  const bulkSubmitMut=useMutation({
    mutationFn:()=>apiSubmitLinked(engagementId, selectedControlIds.size>0?bulkLinkedTargets.map(c=>c.id):[]),
    onSuccess:(r)=>{
      const res=r?.data?.data||r?.data||r||{}
      const n=res.submitted??0
      const skipped=Array.isArray(res.skipped)?res.skipped:[]
      const notYours=skipped.filter(x=>x.reason==='NOT_YOURS').length
      toast.success(`${n} control${n===1?'':'s'} submitted`+(notYours?` · ${notYours} skipped (not in your scope)`:''))
      setShowBulkSubmit(false)
      qc.invalidateQueries({queryKey:['engagement-controls',engagementId]})
      qc.invalidateQueries({queryKey:['engagement-sections',engagementId]})
    },
    onError:(e)=>toast.error(e?.response?.data?.message||'Bulk submit failed'),
  })
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
          {stats.evidenceLinked>0&&<span className="flex items-center gap-1 text-text-muted" title="Evidence attached (pulled or reused) but not submitted yet"><Link2 size={9}/>{stats.evidenceLinked} linked, not submitted</span>}
          {canBulkSubmit&&bulkLinkedTargets.length>0&&(
            <button onClick={()=>setShowBulkSubmit(true)}
              title="Submit the linked evidence of these controls in one go — you are confirming it will do. The auditor still reviews it."
              className="flex items-center gap-1 px-2 py-0.5 rounded-ctl bg-status-pass-bg border border-status-pass-bd text-status-pass-fg hover:opacity-90 transition-all font-medium text-[10px]">
              <CheckCheck size={10}/> Submit linked evidence ({bulkLinkedTargets.length}{selectedControlIds.size>0?' selected':''})
            </button>
          )}
          {/* Test results track */}
          {(stats.effective>0||stats.ineffective>0||stats.partial>0)&&<span className="text-border">·</span>}
          {stats.effective>0&&<span className="text-status-pass-fg">{stats.effective} effective</span>}
          {stats.partial>0&&<span className="text-status-warn-fg">{stats.partial} partial</span>}
          {stats.ineffective>0&&<span className="text-status-fail-fg">{stats.ineffective} failed</span>}
          {stats.notTested>0&&stats.total>0&&(stats.effective>0||stats.ineffective>0)&&<span className="text-text-muted">{stats.notTested} not tested</span>}
          {/* Assignment track — only show when relevant */}
          {canAssignAuditor&&<><span className="text-border">·</span><span className={cn(stats.auditorAssigned===stats.total?'text-status-pass-fg':'text-status-pass-fg')}>{stats.auditorAssigned}/{stats.total} auditors</span></>}
          {canAssignAuditee&&<><span className="text-border">·</span><span className={cn(stats.auditeeAssigned===stats.total?'text-status-pass-fg':'text-status-tag-fg')}>{stats.auditeeAssigned}/{stats.total} auditees</span></>}
          {/* Pull existing evidence — deliberately manual (see PullEvidenceModal comment).
              Open to auditees too, not just auditors: Pull only creates
              PENDING_REVIEW links — the auditor still decides accept/reject —
              so there's no risk in letting the auditee (who's usually first
              to start on evidence) check what's already on file before
              re-uploading something that already exists. Solid background,
              not just a bordered outline — this is a real action, not a
              passive status label like the ones in the row below. */}
          {canPullEvidence && (
            <button onClick={()=>setShowPullModal(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-ctl bg-brand-500/10 border border-brand-500/30 text-brand-ink hover:bg-brand-500/20 transition-all font-medium text-[10px]">
              <Link2 size={11}/> Pull evidence
            </button>
          )}
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
            {/* Delegation filter */}
            <select value={delegationFilter} onChange={e=>setDelegationFilter(e.target.value)}
              className={cn('text-[9px] bg-surface border rounded px-1.5 py-0.5 focus:outline-none focus:border-brand-500/50 cursor-pointer',
                delegationFilter?'border-brand-500/40 text-brand-ink':'border-border text-text-secondary')}>
              <option value="">All delegations</option>
              <option value="ANY">Delegated (open)</option>
              <option value="DONE">Delegated (done)</option>
              <option value="MINE">Delegated to me</option>
              <option value="BYME">Delegated by me</option>
              <option value="NONE">Never delegated</option>
              {delegatees.length>0 && <optgroup label="Delegated to">
                {delegatees.map(([id,name])=><option key={id} value={`u:${id}`}>{name}</option>)}
              </optgroup>}
            </select>
            {/* My view / My sections toggle — inline in the stats row */}
            {(canAssignAuditor || canAssignAuditee) ? (
              <button onClick={()=>setMyView(!myViewOn)} className={cn('flex items-center gap-1 px-2 py-0.5 rounded-ctl border transition-all',myViewOn?'border-brand-500/40 bg-brand-500/10 text-brand-ink':'border-border text-text-muted hover:text-text-secondary')}>
                {myViewOn?<Eye size={9}/>:<EyeOff size={9}/>} My view
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
              Assign {selectedControlIds.size} control{selectedControlIds.size !== 1 ? 's' : ''}…
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
                <button onClick={() => doBulkUnassign('auditor')} disabled={bulkMut.isPending}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-border text-text-muted hover:text-status-fail-fg hover:border-status-fail-bd disabled:opacity-40 whitespace-nowrap">
                  Unassign
                </button>
              </div>
            )}
            {canAssignAuditee && (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-text-muted">Auditee:</span>
                <UserPicker
                  value={bulkAuditeeId} users={auditeeUsers}
                  onChange={setBulkAuditeeId}
                  placeholder="Pick auditee"/>
                <button onClick={() => doBulkUnassign('auditee')} disabled={bulkMut.isPending}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-border text-text-muted hover:text-status-fail-fg hover:border-status-fail-bd disabled:opacity-40 whitespace-nowrap">
                  Unassign
                </button>
              </div>
            )}
            <button
              onClick={doBulkAssign}
              disabled={bulkMut.isPending || (!bulkAuditorId && !bulkAuditeeId)}
              className="ml-auto text-[10px] px-3 py-1 rounded bg-brand-500 text-brand-900 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
              {bulkMut.isPending ? 'Assigning…' : `Assign to ${selectedControlIds.size} control${selectedControlIds.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {grouped.map(top=>(
          <div key={top.key}>
            <TopSectionHeader root={top.root} label={top.label} ctrls={top.ctrls}
              collapsed={collapsedTops.has(top.key)} onToggle={()=>toggleTop(top.key)}/>
            {!collapsedTops.has(top.key) && top.subs.map(sub=>(
            <div key={sub.key}>
            {sub.path.length>0 && <SubSectionHeader path={sub.path} ctrls={sub.ctrls}/>}
            {sub.ctrls.map(ctrl=>(
              <ControlRow key={ctrl.id} ctrl={ctrl} engagementId={engagementId}
                auditorUsers={auditorUsers} auditeeUsers={auditeeUsers} auditeeUsersLoading={auditeeUsersLoading}
                canAssignAuditor={canAssignAuditor} canAssignAuditee={canAssignAuditee}
                canRecordResult={canRecordResult}
                onOpenDetail={(ctrl, tab)=>openDrawer('AUDIT_CONTROL_INSTANCE', ctrl.id, tab ? { tab } : undefined)}
                currentUserId={currentUserId}
                isSelected={selectedControlIds.has(ctrl.id)}
                onToggleSelect={(canAssignAuditor || canAssignAuditee) ? toggleSelect : null}
                mySectionIds={mySectionIds}
                isActive={activeControlId===ctrl.id}
                wasActive={lastOpenedId===ctrl.id}/>
            ))}
            </div>
            ))}
          </div>
        ))}
      </div>
      <Modal open={showBulkSubmit} onClose={()=>!bulkSubmitMut.isPending&&setShowBulkSubmit(false)} size="sm"
        title="Submit linked evidence"
        subtitle="For controls whose evidence is linked (pulled from an integration or reused) but not submitted yet.">
        <div className="space-y-3 text-xs text-text-secondary">
          <p>
            <span className="font-medium text-text-primary">{bulkLinkedTargets.length} control{bulkLinkedTargets.length===1?'':'s'}</span>
            {selectedControlIds.size>0?' from your selection':' in this engagement'} will be submitted with the evidence already linked to them.
            The auditor still reviews that evidence and can send any control back.
          </p>
          <p className="text-text-muted">
            Only controls you may submit are included — all of them if you are the lead auditee, the controls in your sections if you own sections,
            otherwise the controls assigned to you. Anything else is skipped and reported.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setShowBulkSubmit(false)} disabled={bulkSubmitMut.isPending}
              className="text-xs px-3 py-1.5 rounded-ctl border border-border text-text-secondary hover:bg-surface-overlay disabled:opacity-40">Cancel</button>
            <button onClick={()=>bulkSubmitMut.mutate()} disabled={bulkSubmitMut.isPending||bulkLinkedTargets.length===0}
              className="text-xs px-3 py-1.5 rounded-ctl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 flex items-center gap-1.5">
              <CheckCheck size={11}/>{bulkSubmitMut.isPending?'Submitting…':'Submit'}
            </button>
          </div>
        </div>
      </Modal>
      <PullEvidenceModal
        open={showPullModal}
        onClose={()=>setShowPullModal(false)}
        engagementId={engagementId}
        onPulled={()=>qc.invalidateQueries({queryKey:['engagement-controls', engagementId]})}
      />
    </div>
  )
}