/**
 * PolicyInstanceMappedControlsTab — all controls this policy covers.
 *
 * Per-control reviewContribution is set inline: SATISFIES / GAPS / PENDING.
 * This is different from the overall policy review (set in Overview tab).
 *
 * Data: GET /v1/audit/policy-instances/{id}/controls → AuditControlInstance rows
 *       Each row includes: reviewContribution, mappingType, testResult
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  CheckSquare, CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  ChevronRight, ChevronDown, ChevronUp, Info,
} from 'lucide-react'
import api  from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

const CTRL_RESULT = {
  EFFECTIVE:           { color:'text-status-pass-fg',  bg:'bg-status-pass-bg',   icon:CheckCircle2,  label:'Effective' },
  PARTIALLY_EFFECTIVE: { color:'text-status-warn-fg',  bg:'bg-status-warn-bg',   icon:AlertTriangle, label:'Partial' },
  INEFFECTIVE:         { color:'text-status-fail-fg',    bg:'bg-status-fail-bg',     icon:XCircle,       label:'Fail' },
  NOT_TESTED:          { color:'text-text-muted', bg:'bg-surface-overlay',icon:MinusCircle,   label:'Not tested' },
  NOT_APPLICABLE:      { color:'text-text-muted', bg:'bg-surface-overlay',icon:MinusCircle,   label:'N/A' },
}

const CONTRIBUTION = {
  SATISFIES:{ label:'Satisfies',color:'text-status-pass-fg', bg:'bg-status-pass-bg' },
  GAPS:     { label:'Gaps',     color:'text-status-warn-fg', bg:'bg-status-warn-bg' },
  PENDING:  { label:'Pending',  color:'text-text-muted',bg:'bg-surface-overlay' },
}

function ContributionPicker({ policyInstanceId, controlInstanceId, current, canEdit }) {
  const [open,setOpen] = useState(false)
  const qc = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: c => api.put(
      `/v1/audit/policy-instances/${policyInstanceId}/controls/${controlInstanceId}/contribution`,
      { contribution: c }),
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({queryKey:['policy-inst-controls',policyInstanceId]}) },
    onError: e => toast.error(e?.response?.data?.message||'Failed'),
  })
  const cfg = CONTRIBUTION[current] || CONTRIBUTION.PENDING
  if (!canEdit) return <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium',cfg.color,cfg.bg)}>{cfg.label}</span>
  return (
    <div className="relative" onClick={e=>e.stopPropagation()}>
      <button onClick={()=>setOpen(o=>!o)} disabled={isPending}
        className={cn('flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border border-transparent hover:border-border disabled:opacity-50',cfg.color,cfg.bg)}>
        {cfg.label}{open?<ChevronUp size={7}/>:<ChevronDown size={7}/>}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-28 bg-surface-raised border border-border rounded-card shadow-elevated z-50 py-1">
          {Object.entries(CONTRIBUTION).map(([k,v]) => (
            <button key={k} onClick={()=>{mutate(k);setOpen(false)}}
              className={cn('w-full text-left px-3 py-1.5 text-[11px] hover:bg-surface-overlay',k===current?`${v.color} ${v.bg}`:'text-text-secondary')}>
              {v.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function PolicyInstanceMappedControlsTab({ policyInstanceId, vc = {} }) {
  const navigate = useNavigate()
  const canEdit  = (vc.permissions||[]).includes('audit:policy:review') || (vc.permissions||[]).includes('audit:policy:read')

  const { data, isLoading } = useQuery({
    queryKey: ['policy-inst-controls', policyInstanceId],
    queryFn: () => api.get(`/v1/audit/policy-instances/${policyInstanceId}/controls`),
    enabled: !!policyInstanceId,
  })
  const controls = Array.isArray(data) ? data : (data?.data?.data || data?.data || [])

  if (isLoading) return <div className="px-4 py-6 text-xs text-text-muted text-center">Loading mapped controls…</div>
  if (!controls.length) return <div className="px-4 py-6 text-xs text-text-muted text-center">No controls mapped to this policy.</div>

  const satisfies = controls.filter(c => c.reviewContribution === 'SATISFIES').length

  return (
    <div className="flex flex-col h-full">
      <div className="mx-3 mt-3 mb-1 flex items-start gap-2 px-3 py-2 bg-brand-500/5 border border-brand-500/20 rounded-card text-[10px] text-text-secondary">
        <Info size={12} className="text-brand-ink shrink-0 mt-0.5"/>
        <span>
          This policy covers <strong className="text-text-primary">{controls.length} controls</strong>.
          Set the contribution for each to indicate how well this policy satisfies the requirement.
        </span>
      </div>

      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-3 text-[10px] text-text-muted">
        <span>{controls.length} controls</span>
        <span>·</span>
        <span className={satisfies===controls.length?'text-status-pass-fg':''}>{satisfies} satisfy · {controls.filter(c=>c.reviewContribution==='GAPS').length} gaps</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {controls.map(c => {
          const res = CTRL_RESULT[c.testResult] || CTRL_RESULT.NOT_TESTED
          return (
            <div key={c.controlInstanceId}
              className="flex items-center gap-2 px-3 py-2.5 border-b border-border/20 hover:bg-surface-overlay/40 group cursor-pointer"
              onClick={() => navigate(`/module/audit_control_instance/${c.controlInstanceId}`)}>
              <CheckSquare size={10} className="text-text-muted shrink-0"/>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-mono text-[9px] text-brand-ink shrink-0">{c.controlCodeSnapshot}</span>
                  {c.mappingTypeSnapshot && (
                    <span className="text-[8px] text-text-muted px-1 rounded bg-surface-overlay">{c.mappingTypeSnapshot}</span>
                  )}
                </div>
                <p className="text-[11px] text-text-primary truncate group-hover:underline">{c.controlNameSnapshot}</p>
                {c.sectionBreadcrumb && <p className="text-[9px] text-text-muted truncate">{c.sectionBreadcrumb}</p>}
              </div>
              <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium',res.color,res.bg)}>{res.label}</span>
              <ContributionPicker
                policyInstanceId={policyInstanceId}
                controlInstanceId={c.controlInstanceId}
                current={c.reviewContribution || 'PENDING'}
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