/**
 * ControlInstancePoliciesTab — shows all policy instances covering a control instance.
 *
 * Data: GET /v1/audit/control-instances/{id}/policies → AuditPolicyInstance rows
 *       Includes reviewContribution per mapping (SATISFIES / GAPS / PENDING).
 *
 * Permission gates (from vc.permissions):
 *   audit:policy:review → auditor can set contribution on each policy
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  FileText, CheckCircle2, AlertTriangle, XCircle, MinusCircle,
  ChevronRight, ChevronDown, ChevronUp,
} from 'lucide-react'
import api  from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

const REVIEW = {
  ADEQUATE:              { label:'Adequate',          color:'text-status-pass-fg',  bg:'bg-status-pass-bg',   icon:CheckCircle2 },
  ADEQUATE_WITH_GAPS:    { label:'Adequate w/ gaps',  color:'text-status-warn-fg',  bg:'bg-status-warn-bg',   icon:AlertTriangle },
  INADEQUATE:            { label:'Inadequate',        color:'text-status-fail-fg',    bg:'bg-status-fail-bg',     icon:XCircle },
  NOT_APPLICABLE:        { label:'N/A',               color:'text-text-muted', bg:'bg-surface-overlay',icon:MinusCircle },
  NOT_REVIEWED:          { label:'Not reviewed',      color:'text-text-muted', bg:'bg-surface-overlay',icon:MinusCircle },
}
const CONTRIBUTION = {
  SATISFIES: { label:'Satisfies', color:'text-status-pass-fg', bg:'bg-status-pass-bg' },
  GAPS:      { label:'Gaps',      color:'text-status-warn-fg', bg:'bg-status-warn-bg' },
  PENDING:   { label:'Pending',   color:'text-text-muted',bg:'bg-surface-overlay' },
}

function ContributionPicker({ policyInstanceId, controlInstanceId, current, canEdit }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: c => api.put(
      `/v1/audit/policy-instances/${policyInstanceId}/controls/${controlInstanceId}/contribution`,
      { contribution: c }),
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries() },
    onError: e => toast.error(e?.response?.data?.message || 'Failed'),
  })
  const cfg = CONTRIBUTION[current] || CONTRIBUTION.PENDING
  if (!canEdit) return <span className={cn('text-[9px] px-1.5 py-0.5 rounded', cfg.color, cfg.bg)}>{cfg.label}</span>
  return (
    <div className="relative" onClick={e=>e.stopPropagation()}>
      <button onClick={()=>setOpen(o=>!o)} disabled={isPending}
        className={cn('flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border border-transparent hover:border-border disabled:opacity-50',cfg.color,cfg.bg)}>
        {cfg.label}{open?<ChevronUp size={7}/>:<ChevronDown size={7}/>}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-32 bg-surface-raised border border-border rounded-card shadow-elevated z-50 py-1">
          {Object.entries(CONTRIBUTION).map(([k,v]) => (
            <button key={k} onClick={() => { mutate(k); setOpen(false) }}
              className={cn('w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-overlay', k===current?`${v.color} ${v.bg}`:'text-text-secondary')}>
              {v.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ControlInstancePoliciesTab({ controlInstanceId, vc = {} }) {
  const navigate = useNavigate()
  const canEdit  = (vc.permissions||[]).includes('audit:policy:review') || (vc.permissions||[]).includes('audit:policy:read')

  const { data, isLoading } = useQuery({
    queryKey: ['ctrl-inst-policies', controlInstanceId],
    queryFn: () => api.get(`/v1/audit/control-instances/${controlInstanceId}/policies`),
    enabled: !!controlInstanceId,
  })
  const policies = Array.isArray(data) ? data : (data?.data?.data || data?.data || [])

  if (isLoading) return <div className="px-4 py-6 text-xs text-text-muted text-center">Loading policies…</div>
  if (!policies.length) return <div className="px-4 py-6 text-xs text-text-muted text-center">No policies cover this control.</div>

  const satisfies = policies.filter(p => p.reviewContribution === 'SATISFIES').length

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-3 text-[10px] text-text-muted">
        <span>{policies.length} policies</span>
        <span>·</span>
        <span className={satisfies===policies.length?'text-status-pass-fg':''}>{satisfies}/{policies.length} satisfy</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {policies.map(p => {
          const rv = REVIEW[p.reviewResult] || REVIEW.NOT_REVIEWED
          return (
            <div key={p.policyInstanceId}
              className="flex items-center gap-2 px-3 py-2.5 border-b border-border/20 hover:bg-surface-overlay/40 group cursor-pointer"
              onClick={() => navigate(`/module/audit_policy_instance/${p.policyInstanceId}`)}>
              <FileText size={10} className="text-text-muted shrink-0"/>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-mono text-[9px] text-brand-400 shrink-0">{p.policyRefSnapshot}</span>
                  <span className="text-[9px] text-text-muted">v{p.versionSnapshot}</span>
                  <span className={cn('text-[8px] px-1 rounded', rv.color, rv.bg)}>{rv.label}</span>
                </div>
                <p className="text-[11px] text-text-primary truncate group-hover:underline">{p.titleSnapshot}</p>
              </div>
              <ContributionPicker
                policyInstanceId={p.policyInstanceId}
                controlInstanceId={controlInstanceId}
                current={p.reviewContribution || 'PENDING'}
                canEdit={canEdit}
              />
              <ChevronRight size={10} className="text-text-muted opacity-0 group-hover:opacity-100 shrink-0"/>
            </div>
          )
        })}
      </div>
    </div>
  )
}