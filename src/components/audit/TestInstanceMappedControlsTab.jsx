/**
 * TestInstanceMappedControlsTab — Vanta-style view of all controls this test covers.
 *
 * This is the KEY insight from Vanta: one test can satisfy MULTIPLE controls simultaneously.
 * Marking this test PASS → all mapped control instances re-derive their result.
 *
 * Data: GET /v1/audit/test-instances/{id}/controls → AuditControlInstance rows
 *       Each row includes: isRequired, mappingNote, controlCodeSnapshot, testResult
 *
 * Permission: audit:control:record-test-result → show cascade button
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  CheckSquare, CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  Zap, ChevronRight, Info,
} from 'lucide-react'
import api  from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

const CTRL_RESULT = {
  EFFECTIVE:           { color:'text-green-400',  bg:'bg-green-500/10',   icon:CheckCircle2,  label:'Effective' },
  PARTIALLY_EFFECTIVE: { color:'text-amber-400',  bg:'bg-amber-500/10',   icon:AlertTriangle, label:'Partial' },
  INEFFECTIVE:         { color:'text-red-400',    bg:'bg-red-500/10',     icon:XCircle,       label:'Ineffective' },
  NOT_TESTED:          { color:'text-text-muted', bg:'bg-surface-overlay',icon:MinusCircle,   label:'Not tested' },
  NOT_APPLICABLE:      { color:'text-text-muted', bg:'bg-surface-overlay',icon:MinusCircle,   label:'N/A' },
}

function CtrlResultBadge({ result }) {
  const cfg = CTRL_RESULT[result] || CTRL_RESULT.NOT_TESTED
  return (
    <span className={cn('inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium', cfg.color, cfg.bg)}>
      <cfg.icon size={8}/>{cfg.label}
    </span>
  )
}

export function TestInstanceMappedControlsTab({ testInstanceId, testResult, vc = {} }) {
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const canRecord = (vc.permissions||[]).includes('audit:control:record-test-result')

  const { data, isLoading } = useQuery({
    queryKey: ['test-inst-controls', testInstanceId],
    queryFn: () => api.get(`/v1/audit/test-instances/${testInstanceId}/controls`),
    enabled: !!testInstanceId,
  })
  const controls = Array.isArray(data) ? data : (data?.data?.data || data?.data || [])

  if (isLoading) return <div className="px-4 py-6 text-xs text-text-muted text-center">Loading mapped controls…</div>
  if (!controls.length) return <div className="px-4 py-6 text-xs text-text-muted text-center">No controls mapped to this test.</div>

  const effective  = controls.filter(c => c.testResult === 'EFFECTIVE').length
  const required   = controls.filter(c => c.isRequired).length

  return (
    <div className="flex flex-col h-full">
      {/* Info banner */}
      <div className="mx-3 mt-3 mb-1 flex items-start gap-2 px-3 py-2 bg-brand-500/5 border border-brand-500/20 rounded-lg text-[10px] text-text-secondary">
        <Info size={12} className="text-brand-400 shrink-0 mt-0.5"/>
        <span>
          This test covers <strong className="text-text-primary">{controls.length} controls</strong>.
          {testResult === 'PASS'
            ? <span className="text-green-400"> ✓ All linked controls updated.</span>
            : <span> Setting this test to <strong>PASS</strong> will mark all required controls as Effective.</span>}
        </span>
      </div>

      {/* Stats */}
      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-3 text-[10px] text-text-muted">
        <span>{controls.length} controls</span>
        <span>·</span>
        <span className={effective===controls.length?'text-green-400':''}>{effective}/{controls.length} effective</span>
        <span>·</span>
        <span>{required} required</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {controls.map(c => (
          <div key={c.controlInstanceId}
            className="flex items-center gap-2 px-3 py-2.5 border-b border-border/20 hover:bg-surface-overlay/40 group cursor-pointer"
            onClick={() => navigate(`/module/audit_control_instance/${c.controlInstanceId}`)}>
            <CheckSquare size={10} className="text-text-muted shrink-0"/>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-mono text-[9px] text-brand-400 shrink-0">{c.controlCodeSnapshot}</span>
                {c.isRequired
                  ? <span className="text-[8px] text-red-400 shrink-0">required</span>
                  : <span className="text-[8px] text-text-muted shrink-0">advisory</span>}
                {c.sectionBreadcrumb && (
                  <span className="text-[9px] text-text-muted truncate">{c.sectionBreadcrumb}</span>
                )}
              </div>
              <p className="text-[11px] text-text-primary truncate group-hover:underline">{c.controlNameSnapshot}</p>
              {c.mappingNote && (
                <p className="text-[9px] text-text-muted mt-0.5 italic truncate">{c.mappingNote}</p>
              )}
            </div>
            <CtrlResultBadge result={c.testResult}/>
            <ChevronRight size={10} className="text-text-muted opacity-0 group-hover:opacity-100 shrink-0"/>
          </div>
        ))}
      </div>
    </div>
  )
}