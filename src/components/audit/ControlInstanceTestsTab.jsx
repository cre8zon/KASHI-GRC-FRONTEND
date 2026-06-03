/**
 * ControlInstanceTestsTab — shows all test instances mapped to a control instance.
 *
 * Data: GET /v1/audit/control-instances/{id}/controls → AuditTestInstance rows
 *       All rows are instance-level — zero library FK joins.
 *
 * Permission gates (from vc.permissions):
 *   audit:control:record-test-result → show result picker per test
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, AlertTriangle, MinusCircle, Minus,
  Zap, User, ChevronRight, ChevronDown, ChevronUp,
} from 'lucide-react'
import api  from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

const RESULTS = [
  { value:'PASS',      label:'Pass',      icon:CheckCircle2, color:'text-green-400', bg:'bg-green-500/10',   border:'border-green-500/30' },
  { value:'FAIL',      label:'Fail',      icon:XCircle,      color:'text-red-400',   bg:'bg-red-500/10',     border:'border-red-500/30' },
  { value:'EXCEPTION', label:'Exception', icon:AlertTriangle, color:'text-amber-400', bg:'bg-amber-500/10',  border:'border-amber-500/30' },
  { value:'NOT_RUN',   label:'Not run',   icon:MinusCircle,  color:'text-text-muted',bg:'bg-surface-overlay',border:'border-border' },
]
const RES = Object.fromEntries(RESULTS.map(r => [r.value, r]))

function ResultBadge({ result }) {
  const r = RES[result] || RES.NOT_RUN
  return (
    <span className={cn('inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium border', r.color, r.bg, r.border)}>
      <r.icon size={8}/>{r.label}
    </span>
  )
}

function ResultPicker({ current, onSelect, saving }) {
  const [open, setOpen] = useState(false)
  const r = RES[current] || RES.NOT_RUN
  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)} disabled={saving}
        className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border disabled:opacity-50 hover:opacity-80',r.color,r.bg,r.border)}>
        <r.icon size={9}/>{r.label}{open?<ChevronUp size={8}/>:<ChevronDown size={8}/>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-32 bg-surface-raised border border-border rounded-lg shadow-elevated z-50 py-1">
          {RESULTS.map(opt => (
            <button key={opt.value} onClick={() => { onSelect(opt.value); setOpen(false) }}
              className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-surface-overlay',
                opt.value===current ? `${opt.color} ${opt.bg}` : 'text-text-secondary')}>
              <opt.icon size={10} className={opt.color}/>{opt.label}
              {opt.value===current && <CheckCircle2 size={9} className="ml-auto text-brand-400"/>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ControlInstanceTestsTab({ controlInstanceId, vc = {} }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canRecord = (vc.permissions||[]).includes('audit:control:record-test-result')

  const { data, isLoading } = useQuery({
    queryKey: ['ctrl-inst-tests', controlInstanceId],
    queryFn: () => api.get(`/v1/audit/control-instances/${controlInstanceId}/tests`),
    enabled: !!controlInstanceId,
  })

  const tests = Array.isArray(data) ? data : (data?.data?.data || data?.data || [])

  const { mutate: setResult, isPending } = useMutation({
    mutationFn: ({ testInstanceId, result }) =>
      api.put(`/v1/audit/test-instances/${testInstanceId}/result`, { testResult: result }),
    onSuccess: () => { toast.success('Result saved'); qc.invalidateQueries({queryKey:['ctrl-inst-tests',controlInstanceId]}) },
    onError: e => toast.error(e?.response?.data?.message || 'Failed'),
  })

  if (isLoading) return <div className="px-4 py-6 text-xs text-text-muted text-center">Loading tests…</div>
  if (!tests.length) return <div className="px-4 py-6 text-xs text-text-muted text-center">No tests linked to this control.</div>

  const passed    = tests.filter(t => t.testResult === 'PASS').length
  const required  = tests.filter(t => t.isRequired).length

  return (
    <div className="flex flex-col h-full">
      {/* Stats */}
      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-3 text-[10px] text-text-muted">
        <span>{tests.length} tests</span>
        <span>·</span>
        <span className={passed===tests.length?'text-green-400':''}>{passed}/{tests.length} passed</span>
        <span>·</span>
        <span>{required} required</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tests.map(t => (
          <div key={t.testInstanceId}
            className="flex items-center gap-2 px-3 py-2.5 border-b border-border/20 hover:bg-surface-overlay/40 group cursor-pointer"
            onClick={() => navigate(`/module/audit_test_instance/${t.testInstanceId}`)}>
            {/* Automation badge */}
            {t.automationTypeSnapshot === 'AUTOMATED' && (
              <Zap size={10} className="text-brand-400 shrink-0" title="Automated test"/>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-mono text-[9px] text-brand-400 shrink-0">{t.testRefSnapshot}</span>
                {t.isRequired
                  ? <span className="text-[8px] text-red-400 shrink-0">required</span>
                  : <span className="text-[8px] text-text-muted shrink-0">advisory</span>}
              </div>
              <p className="text-[11px] text-text-primary truncate group-hover:underline">{t.testNameSnapshot}</p>
              {t.runAt && (
                <p className="text-[9px] text-text-muted mt-0.5">
                  {t.runBySystem ? '⚡ automated' : `by user #${t.runByUserId}`} · {new Date(t.runAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 shrink-0" onClick={e=>e.stopPropagation()}>
              {canRecord && <ResultPicker current={t.testResult} onSelect={r => setResult({testInstanceId:t.testInstanceId, result:r})} saving={isPending}/>}
            </div>
            <ResultBadge result={t.testResult}/>
            <ChevronRight size={10} className="text-text-muted opacity-0 group-hover:opacity-100 shrink-0"/>
          </div>
        ))}
      </div>
    </div>
  )
}