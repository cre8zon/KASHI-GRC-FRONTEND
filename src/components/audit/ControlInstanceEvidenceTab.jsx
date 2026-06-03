/**
 * ControlInstanceEvidenceTab — shows evidence for a control instance.
 * Split into two sections:
 *   AUTOMATED  — from integration checks (AUTOMATION_VERIFIED or PENDING_REVIEW on fail)
 *   MANUAL     — human-uploaded files (ACCEPTED, PENDING_REVIEW, REJECTED)
 *
 * Data: GET /v1/evidence/links?entityType=AUDIT_CONTROL_INSTANCE&entityId={id}
 * Permission gates:
 *   audit:control:submit-evidence → Upload button visible
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap, Paperclip, CheckCircle2, Clock, XCircle, RefreshCw,
  Upload, ExternalLink, Eye,
} from 'lucide-react'
import api  from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

const STATUS_CFG = {
  AUTOMATION_VERIFIED: { icon:CheckCircle2, color:'text-green-400',  bg:'bg-green-500/10',  label:'Verified by automation' },
  ACCEPTED:            { icon:CheckCircle2, color:'text-green-400',  bg:'bg-green-500/10',  label:'Accepted' },
  PENDING_REVIEW:      { icon:Clock,        color:'text-amber-400',  bg:'bg-amber-500/10',  label:'Pending review' },
  REJECTED:            { icon:XCircle,      color:'text-red-400',    bg:'bg-red-500/10',    label:'Rejected' },
  EXPIRED:             { icon:RefreshCw,    color:'text-text-muted', bg:'bg-surface-overlay',label:'Expired' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.PENDING_REVIEW
  return (
    <span className={cn('inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium', cfg.color, cfg.bg)}>
      <cfg.icon size={8}/>{cfg.label}
    </span>
  )
}

function EvidenceCard({ link, record, onAccept, onReject, canReview }) {
  const isAuto = record?.collectionType === 'AUTOMATED'
  const Icon   = isAuto ? Zap : Paperclip
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 border-b border-border/20 hover:bg-surface-overlay/30 group">
      <Icon size={12} className={cn('shrink-0 mt-0.5', isAuto?'text-brand-400':'text-text-muted')}/>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-text-primary truncate">{record?.title || `Evidence #${link.evidenceRecordId}`}</p>
        {isAuto && record?.automationMessage && (
          <p className="text-[9px] text-text-muted mt-0.5 truncate">{record.automationMessage}</p>
        )}
        {!isAuto && record?.fileName && (
          <p className="text-[9px] text-text-muted mt-0.5 truncate">{record.fileName}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <StatusBadge status={link.status}/>
          {record?.collectedAt && (
            <span className="text-[9px] text-text-muted">{new Date(record.collectedAt).toLocaleDateString()}</span>
          )}
          {record?.controlTag && (
            <span className="text-[9px] text-text-muted font-mono">{record.controlTag}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
        {record?.fileUrl && (
          <a href={record.fileUrl} target="_blank" rel="noopener noreferrer"
            className="p-1 rounded hover:bg-surface-overlay text-text-muted hover:text-text-primary">
            <ExternalLink size={11}/>
          </a>
        )}
        {isAuto && record?.rawPayload && (
          <button title="View raw evidence payload"
            className="p-1 rounded hover:bg-surface-overlay text-text-muted hover:text-text-primary">
            <Eye size={11}/>
          </button>
        )}
        {canReview && link.status === 'PENDING_REVIEW' && (
          <>
            <button onClick={() => onAccept(link.id)}
              className="text-[9px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20">✓</button>
            <button onClick={() => onReject(link.id)}
              className="text-[9px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20">✗</button>
          </>
        )}
      </div>
    </div>
  )
}

export function ControlInstanceEvidenceTab({ controlInstanceId, vc = {} }) {
  const qc = useQueryClient()
  const canSubmit = (vc.permissions||[]).includes('audit:control:submit-evidence')
  const canReview = (vc.permissions||[]).includes('audit:evidence:review')

  const { data, isLoading } = useQuery({
    queryKey: ['ctrl-inst-evidence', controlInstanceId],
    queryFn: () => api.get('/v1/evidence/links', {
      params: { entityType: 'AUDIT_CONTROL_INSTANCE', entityId: controlInstanceId }
    }),
    enabled: !!controlInstanceId,
  })

  const links = data?.data?.data || data?.data || []

  const { mutate: review } = useMutation({
    mutationFn: ({ linkId, action }) =>
      api.put(`/v1/evidence/links/${linkId}/review`, { action }),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({queryKey:['ctrl-inst-evidence',controlInstanceId]}) },
    onError: e => toast.error(e?.response?.data?.message || 'Failed'),
  })

  const automated = links.filter(l => l.collectionType === 'AUTOMATED' || l.automationVerified)
  const manual    = links.filter(l => l.collectionType !== 'AUTOMATED' && !l.automationVerified)

  if (isLoading) return <div className="px-4 py-6 text-xs text-text-muted text-center">Loading evidence…</div>

  return (
    <div className="flex flex-col h-full">
      {/* Actions */}
      {canSubmit && (
        <div className="px-3 py-2 border-b border-border/40 flex items-center justify-between">
          <span className="text-[10px] text-text-muted">{links.length} evidence items</span>
          <button className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20">
            <Upload size={10}/> Upload evidence
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {/* Automated section */}
        {automated.length > 0 && (
          <>
            <div className="px-3 py-1.5 flex items-center gap-1.5 text-[9px] text-brand-400 bg-brand-500/5 border-b border-border/30">
              <Zap size={9}/> AUTOMATED EVIDENCE ({automated.length})
            </div>
            {automated.map(l => (
              <EvidenceCard key={l.id} link={l} record={l.record}
                onAccept={() => review({linkId:l.id, action:'ACCEPT'})}
                onReject={() => review({linkId:l.id, action:'REJECT'})}
                canReview={canReview}/>
            ))}
          </>
        )}
        {/* Manual section */}
        {manual.length > 0 && (
          <>
            <div className="px-3 py-1.5 flex items-center gap-1.5 text-[9px] text-text-muted bg-surface-overlay/40 border-b border-border/30">
              <Paperclip size={9}/> MANUAL EVIDENCE ({manual.length})
            </div>
            {manual.map(l => (
              <EvidenceCard key={l.id} link={l} record={l.record}
                onAccept={() => review({linkId:l.id, action:'ACCEPT'})}
                onReject={() => review({linkId:l.id, action:'REJECT'})}
                canReview={canReview}/>
            ))}
          </>
        )}
        {!links.length && (
          <div className="px-4 py-8 text-xs text-text-muted text-center">
            <Paperclip size={20} className="mx-auto mb-2 opacity-30"/>
            No evidence linked yet.
            {canSubmit && <p className="mt-1">Upload evidence above to get started.</p>}
          </div>
        )}
      </div>
    </div>
  )
}