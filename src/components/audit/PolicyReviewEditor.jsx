/**
 * PolicyReviewEditor — THE policy-review editor: adequacy result + auditor
 * notes. One component for every place a policy is reviewed:
 *
 *   • the control's Fieldwork tab (one row per mapped policy)
 *   • the policy's own detail / drawer (Policy content tab)
 *
 * Same endpoint (PUT /v1/audit/policy-instances/{id}/review → AuditFieldworkService,
 * which also raises the policy-gap finding on INADEQUATE), same values, same
 * cache refresh — so a review typed on one screen is what the other shows.
 *
 * WHY SHARED: the two screens had their own option lists. Fieldwork could set
 * NOT_APPLICABLE, which the policy screen's list did not contain — and that
 * screen read `currentOption.icon` off the lookup, so a policy marked N/A in
 * Fieldwork crashed its own Policy content tab.
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle, Clock, Loader2, Save } from 'lucide-react'
import api   from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast  from 'react-hot-toast'
import { invalidateFieldwork } from './TestResultEditor'

/** Choosable conclusions — every ReviewResult except the initial NOT_REVIEWED. */
export const POLICY_RESULTS = [
  { value:'ADEQUATE',           label:'Adequate',           icon:CheckCircle2,  fg:'text-status-pass-fg', bg:'bg-status-pass-bg', bd:'border-status-pass-bd' },
  { value:'ADEQUATE_WITH_GAPS', label:'Adequate with gaps', icon:AlertTriangle, fg:'text-status-warn-fg', bg:'bg-status-warn-bg', bd:'border-status-warn-bd' },
  { value:'INADEQUATE',         label:'Inadequate',         icon:XCircle,       fg:'text-status-fail-fg', bg:'bg-status-fail-bg', bd:'border-status-fail-bd' },
  { value:'NOT_APPLICABLE',     label:'Not applicable',     icon:MinusCircle,   fg:'text-text-muted',     bg:'bg-surface-overlay', bd:'border-border' },
]
export const POLICY_NOT_REVIEWED = {
  value:'NOT_REVIEWED', label:'Not reviewed', icon:Clock, fg:'text-text-muted', bg:'bg-surface-overlay', bd:'border-border',
}
/** Any ReviewResult → its display config (never undefined). */
export function policyResultCfg(value) {
  return POLICY_RESULTS.find(r => r.value === value) || POLICY_NOT_REVIEWED
}

export function PolicyResultBadge({ value }) {
  const cfg = policyResultCfg(value)
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium border shrink-0',
      cfg.fg, cfg.bg, cfg.bd)}>
      <Icon size={8} />{cfg.label}
    </span>
  )
}

/**
 * @param policyInstanceId the policy instance
 * @param policy           server values: reviewResult, auditorNotes, reviewedAt
 * @param canReview        server's answer (ControlAccessGuard) — read-only when false
 * @param renderExtraActions ({ save, dirty, isPending }) => node
 */
export function PolicyReviewEditor({ policyInstanceId, policy = {}, canReview, renderExtraActions }) {
  const qc = useQueryClient()
  const server = {
    review: policy.reviewResult || 'NOT_REVIEWED',
    notes:  policy.auditorNotes ?? '',
  }
  const [review, setReview] = useState(server.review)
  const [notes,  setNotes]  = useState(server.notes)
  const dirty = review !== server.review || notes !== server.notes

  // Follow a save made on the other screen while open — never over typing.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    if (dirtyRef.current) return
    setReview(server.review); setNotes(server.notes)
  }, [server.review, server.notes]) // eslint-disable-line react-hooks/exhaustive-deps

  const { mutate: save, isPending } = useMutation({
    // Notes always sent ('' clears them); the server writes only what it is sent.
    mutationFn: () => api.put(`/v1/audit/policy-instances/${policyInstanceId}/review`, {
      reviewResult: review,
      auditorNotes: notes ?? '',
    }),
    onSuccess: () => {
      toast.success(review === 'INADEQUATE' ? 'Review saved — a policy finding was raised' : 'Review saved')
      invalidateFieldwork(qc)
    },
    onError: e => toast.error(e?.response?.data?.message || e?.message || 'Could not save the review'),
  })

  if (!canReview) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-text-secondary">Review result</span>
          <PolicyResultBadge value={server.review} />
        </div>
        {server.notes && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-text-secondary">Auditor notes</span>
            <p className="text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed">{server.notes}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium text-text-secondary">Policy review result</label>
        <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Review result">
          {POLICY_RESULTS.map(opt => {
            const Icon = opt.icon
            const active = opt.value === review
            return (
              <button key={opt.value} type="button" role="radio" aria-checked={active}
                disabled={isPending} onClick={() => setReview(opt.value)}
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border font-medium transition-colors',
                  'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  active ? cn(opt.fg, opt.bg, opt.bd)
                         : 'text-text-muted bg-surface border-border hover:bg-surface-overlay')}>
                <Icon size={9} />{opt.label}
              </button>
            )
          })}
        </div>
        <p className="text-[9px] text-text-muted">
          Recorded on the policy — applies to every control it covers. Inadequate raises a policy finding.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium text-text-secondary">
          Auditor notes
          {review === 'INADEQUATE' && (
            <span className="ml-1 text-status-fail-fg font-normal">— document the gaps for the finding</span>
          )}
        </label>
        <textarea
          value={notes}
          rows={3}
          disabled={isPending}
          onChange={e => setNotes(e.target.value)}
          placeholder={review === 'INADEQUATE'
            ? 'Describe the specific gaps or deficiencies…'
            : review === 'ADEQUATE_WITH_GAPS'
              ? 'Describe the minor gaps noted…'
              : 'Whether the policy is current and satisfies the requirement…'}
          className={cn(
            'w-full text-[11px] leading-relaxed rounded-ctl border border-border bg-surface',
            'px-2 py-1.5 text-text-primary placeholder:text-text-muted resize-y',
            'focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50')}
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button type="button" disabled={isPending || !dirty || review === 'NOT_REVIEWED'} onClick={() => save()}
          className={cn(
            'inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-ctl',
            'bg-brand-500/15 text-brand-ink border border-brand-500/30 hover:bg-brand-500/25',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500',
            'disabled:opacity-40 disabled:cursor-not-allowed')}>
          {isPending ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
          Save review
        </button>
        {policy.reviewedAt && (
          <span className="text-[9px] text-text-muted">
            Last saved {new Date(policy.reviewedAt).toLocaleString()}
          </span>
        )}
        {renderExtraActions?.({ save, dirty, isPending })}
      </div>
    </div>
  )
}

export default PolicyReviewEditor