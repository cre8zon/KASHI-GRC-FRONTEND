/**
 * ItemActionItems — inline action items panel for ItemPanel.
 *
 * Renders remediations and clarifications with proper API calls:
 *   - validateRemediation → ReviewController.validateRemediation()
 *     (triggers decrementAndMaybeReport — not generic status PATCH)
 *   - acceptRisk          → ReviewController.acceptRisk()
 *     (same decrement + report logic)
 *
 * This is what was missing in the original AssessmentDetailPage.QuestionActionItems
 * which called generic updateStatus, bypassing all the report-triggering logic.
 *
 * mode controls which actions are shown:
 *   reviewer    — Validate + Accept Risk + Send back (org side)
 *   responder   — Read-only view of remediations the org raised (vendor side)
 *   contributor — Read-only (should not see org-internal clarifications)
 *   readonly    — No actions
 */

import { useState }       from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, Clock, CornerDownLeft, CheckCheck,
  AlertTriangle, Shield,
} from 'lucide-react'
import { cn }             from '../../lib/cn'
import { formatDate }     from '../../utils/format'
import { useEntityActionItems } from '../../hooks/useActionItems'
import { reviewApi }      from '../../api/review.api'
import toast              from 'react-hot-toast'

const SEVERITY_CLS = {
  CRITICAL: 'text-red-400 bg-red-500/10 border-red-500/30',
  HIGH:     'text-orange-400 bg-orange-500/10 border-orange-500/30',
  MEDIUM:   'text-amber-400 bg-amber-500/10 border-amber-500/30',
  LOW:      'text-blue-400 bg-blue-500/10 border-blue-500/30',
}

const STATUS_LABEL = {
  OPEN:               'Open',
  IN_PROGRESS:        'In progress',
  PENDING_REVIEW:     'Vendor submitted',
  PENDING_VALIDATION: 'Awaiting validation',
  RESOLVED:           'Resolved',
}

export function ItemActionItems({ entityType, entityId, assessmentId, mode }) {
  const qc = useQueryClient()
  const { data: items = [], isLoading } = useEntityActionItems(entityType, entityId, {
    enabled: !!entityId,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['action-items-entity', entityType, entityId] })
    if (assessmentId)
      qc.invalidateQueries({ queryKey: ['assessment', assessmentId] })
  }

  const { mutate: validate,   isPending: validating  } = useMutation({
    mutationFn: (itemId) => reviewApi.validateRemediation(assessmentId, itemId, 'Remediation validated'),
    onSuccess: () => { toast.success('Remediation validated'); invalidate() },
    onError:   (e) => toast.error(e?.message || 'Failed to validate'),
  })

  const { mutate: acceptRisk, isPending: acceptingRisk } = useMutation({
    mutationFn: (itemId) => reviewApi.acceptRisk(assessmentId, itemId, 'Risk accepted'),
    onSuccess: () => { toast.success('Risk accepted'); invalidate() },
    onError:   (e) => toast.error(e?.message || 'Failed to accept risk'),
  })

  if (isLoading) return <div className="h-3 w-24 bg-surface-overlay rounded animate-pulse my-2" />

  const remediations   = items.filter(i => i.remediationType === 'REMEDIATION_REQUEST')
  const clarifications = items.filter(i => i.remediationType === 'CLARIFICATION')

  if (!remediations.length && !clarifications.length)
    return <p className="text-[11px] text-text-muted italic py-2">No action items.</p>

  const isOpen = (s) => ['OPEN','IN_PROGRESS','PENDING_REVIEW','PENDING_VALIDATION'].includes(s)
  const vendorActed = (s) => ['PENDING_REVIEW','PENDING_VALIDATION'].includes(s)

  return (
    <div className="space-y-2">
      {/* Remediation requests */}
      {remediations.map(item => (
        <div key={item.id}
          className={cn(
            'rounded-lg border text-[11px]',
            item.status === 'RESOLVED'
              ? 'bg-green-500/5 border-green-500/20 text-green-400'
              : vendorActed(item.status)
                ? 'bg-blue-500/5 border-blue-500/20 text-blue-400'
                : 'bg-amber-500/5 border-amber-500/20 text-amber-400'
          )}>
          {/* Header */}
          <div className="flex items-start gap-2 px-3 py-2">
            {item.status === 'RESOLVED'
              ? <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
              : vendorActed(item.status)
                ? <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
                : <Clock size={12} className="shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold">Remediation required</span>
                {item.severity && (
                  <span className={cn(
                    'text-[9px] font-bold px-1 py-0.5 rounded border uppercase',
                    SEVERITY_CLS[item.severity] || SEVERITY_CLS.MEDIUM
                  )}>{item.severity}</span>
                )}
                <span className="opacity-60">— {STATUS_LABEL[item.status] || item.status}</span>
              </div>
              {item.description && (
                <p className="text-[10px] opacity-80 mt-0.5">{item.description}</p>
              )}
              {item.dueAt && (
                <p className={cn(
                  'text-[10px] mt-0.5 flex items-center gap-0.5',
                  item.isOverdue ? 'text-red-400' : 'opacity-50'
                )}>
                  <Clock size={9} />Due {formatDate(item.dueAt)}{item.isOverdue && ' — overdue'}
                </p>
              )}
            </div>
          </div>

          {/* Party info */}
          <div className="px-3 py-1 border-t border-white/5 flex flex-wrap gap-x-4 text-[10px] opacity-60">
            {item.createdByName  && <span>Raised by: <strong>{item.createdByName}</strong></span>}
            {item.assignedToName && <span>Assigned: <strong>{item.assignedToName}</strong></span>}
            {item.createdAt      && <span>{formatDate(item.createdAt)}</span>}
          </div>

          {/* Resolution note */}
          {item.status === 'RESOLVED' && item.resolutionNote && (
            <div className="px-3 py-1.5 border-t border-white/5 text-[10px] text-green-300">
              ✓ {item.resolutionNote}
              {item.resolvedByName && <span className="ml-1 opacity-70">by {item.resolvedByName}</span>}
            </div>
          )}

          {/* Reviewer actions — only for reviewer mode + canResolve */}
          {isOpen(item.status) && mode === 'reviewer' && item.canResolve && (
            <div className="px-3 py-1.5 border-t border-white/5 flex gap-3">
              {vendorActed(item.status) && (
                <button
                  disabled={validating}
                  onClick={() => validate(item.id)}
                  className="text-[10px] text-green-400 hover:text-green-300 flex items-center gap-1 font-medium disabled:opacity-50">
                  <CheckCircle2 size={10} />
                  {validating ? 'Validating…' : 'Validate'}
                </button>
              )}
              <button
                disabled={acceptingRisk}
                onClick={() => acceptRisk(item.id)}
                className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:opacity-50">
                <CheckCheck size={10} />
                {acceptingRisk ? '…' : 'Accept risk'}
              </button>
              {!vendorActed(item.status) && (
                <button
                  onClick={() => toast('Send back functionality via action item page')}
                  className="text-[10px] text-text-muted hover:text-text-secondary flex items-center gap-1">
                  <CornerDownLeft size={10} /> Send back
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Clarifications */}
      {clarifications.map(item => (
        <div key={item.id}
          className={cn(
            'rounded-lg border text-[11px] px-3 py-2',
            item.status === 'RESOLVED'
              ? 'bg-green-500/5 border-green-500/20 text-green-400'
              : 'bg-purple-500/5 border-purple-500/20 text-purple-400'
          )}>
          <div className="flex items-start gap-2">
            {item.status === 'RESOLVED'
              ? <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
              : <Clock size={12} className="shrink-0 mt-0.5" />}
            <div>
              <span className="font-semibold">Clarification</span>
              <span className="opacity-60 ml-1">— {STATUS_LABEL[item.status] || item.status}</span>
              {item.description && <p className="text-[10px] opacity-80 mt-0.5">{item.description}</p>}
            </div>
          </div>
          {item.status === 'RESOLVED' && item.resolutionNote && (
            <p className="text-[10px] text-green-300 mt-1 pl-5">✓ {item.resolutionNote}</p>
          )}
        </div>
      ))}
    </div>
  )
}
