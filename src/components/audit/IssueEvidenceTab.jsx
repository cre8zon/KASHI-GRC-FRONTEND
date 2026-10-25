/**
 * IssueEvidenceTab — evidence management for a remediation issue.
 *
 * Same two-bucket model as findings (persisted via document_links.link_type):
 *   DEFICIENCY  — proof the issue/gap exists. On an issue raised from an audit
 *                 finding or a vendor assessment question, the source's files
 *                 are linked here automatically (IssueService.linkSourceEvidence)
 *                 — the same documents, not copies, so nothing is uploaded twice.
 *   REMEDIATION — proof it was fixed. Required before "Submit for Review".
 *
 * ── REMEDIATION EVIDENCE IS REVIEWED FILE BY FILE ─────────────────────────
 * At the validation step the validator accepts or rejects each remediation
 * file (a reason is required to reject). "Validate & Resolve" is refused until
 * every file has a decision and at least one is accepted; "Request changes"
 * sends the fix back to the owner. Each decision records who and when, and a
 * reviewed file can no longer be removed — it is the record of that decision.
 *
 * Who may review: the holder of the validation step's task. The page reads it
 * from the step's buttons (vc.transitions includes ISSUE_VALIDATE); on a
 * workflow without per-step buttons, from the issue being at review/validation.
 * The server makes the same check.
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Wrench, CheckCircle2, XCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import EvidenceUploader from '../ui/EvidenceUploader'
import { cn } from '../../lib/cn'
import api from '../../config/axios.config'
import { docKeys, useEntityDocuments } from '../../hooks/useDocuments'

function Section({ icon: Icon, label, hint, accent, right, children }) {
  return (
    <div className="rounded-card border border-border glass-card overflow-hidden">
      <div className={cn('flex items-center gap-2 px-3 py-2 border-b border-border/60',
        accent === 'warn' ? 'bg-status-warn-bg/40' : accent === 'pass' ? 'bg-status-pass-bg/40' : 'bg-surface-inset')}>
        <Icon size={13} className={cn('shrink-0',
          accent === 'warn' ? 'text-status-warn-fg' : accent === 'pass' ? 'text-status-pass-fg' : 'text-text-muted')} />
        <span className="text-xs font-medium text-text-primary">{label}</span>
        <span className="flex-1" />
        {right}
      </div>
      {hint && <p className="px-3 pt-2 text-[11px] text-text-muted">{hint}</p>}
      <div className="p-3">{children}</div>
    </div>
  )
}

const fmtWhen = (v) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const errMsg = (e, fallback) =>
  e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || fallback

/** Review state and, for the validator, Accept / Reject — under one file's row. */
function EvidenceReview({ doc, issueId, canReview }) {
  const qc = useQueryClient()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')

  const review = useMutation({
    mutationFn: ({ decision, note }) =>
      api.post(`/v1/issues/${issueId}/evidence/${doc.linkId}/review`, { decision, note }),
    onSuccess: (_d, v) => {
      toast.success(v.decision === 'ACCEPTED' ? 'Evidence accepted' : 'Evidence rejected')
      setRejecting(false); setNote('')
      qc.invalidateQueries({ queryKey: docKeys.byEntity('ISSUE', issueId, 'REMEDIATION') })
    },
    onError: (e) => toast.error(errMsg(e, 'Could not save the review')),
  })

  const status = doc.reviewStatus
  const when = fmtWhen(doc.reviewedAt)

  return (
    <div className="ml-2 mt-1 mb-2 pl-3 border-l-2 border-border/70 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {status === 'ACCEPTED' && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-status-pass-bg text-status-pass-fg">
            <CheckCircle2 size={10} /> Accepted
          </span>
        )}
        {status === 'REJECTED' && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-status-fail-bg text-status-fail-fg">
            <XCircle size={10} /> Rejected
          </span>
        )}
        {!status && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted border border-border">
            <Clock size={10} /> Awaiting review
          </span>
        )}
        {status && (doc.reviewedByName || when) && (
          <span className="text-[10px] text-text-muted">
            {doc.reviewedByName ? `by ${doc.reviewedByName}` : ''}{when ? ` · ${when}` : ''}
          </span>
        )}
        <span className="flex-1" />
        {canReview && !rejecting && (
          <>
            {status !== 'ACCEPTED' && (
              <button type="button" disabled={review.isPending}
                onClick={() => review.mutate({ decision: 'ACCEPTED', note: null })}
                className="text-[11px] font-medium px-2 py-0.5 rounded-ctl border border-status-pass-bd text-status-pass-fg hover:bg-status-pass-bg transition-colors disabled:opacity-50">
                Accept
              </button>
            )}
            {status !== 'REJECTED' && (
              <button type="button" disabled={review.isPending}
                onClick={() => setRejecting(true)}
                className="text-[11px] font-medium px-2 py-0.5 rounded-ctl border border-status-fail-bd text-status-fail-fg hover:bg-status-fail-bg transition-colors disabled:opacity-50">
                Reject
              </button>
            )}
          </>
        )}
      </div>
      {doc.reviewNote && (
        <p className="text-[11px] text-text-secondary whitespace-pre-wrap">“{doc.reviewNote}”</p>
      )}
      {rejecting && (
        <div className="space-y-1.5">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} autoFocus
            placeholder="What is wrong with this file? The owner sees this."
            className="w-full rounded-ctl border border-border glass-field px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
          <div className="flex items-center gap-2">
            <button type="button" disabled={!note.trim() || review.isPending}
              onClick={() => review.mutate({ decision: 'REJECTED', note: note.trim() })}
              className="text-[11px] font-medium px-2.5 py-1 rounded-ctl bg-status-fail-bg border border-status-fail-bd text-status-fail-fg disabled:opacity-50">
              Reject file
            </button>
            <button type="button" onClick={() => { setRejecting(false); setNote('') }}
              className="text-[11px] text-text-muted hover:text-text-primary">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** "2 accepted · 1 rejected · 1 awaiting review" */
function ReviewSummary({ issueId }) {
  const { data: docs = [] } = useEntityDocuments('ISSUE', issueId, 'REMEDIATION', { staleTime: 0 })
  if (!docs.length) return null
  const accepted = docs.filter(d => d.reviewStatus === 'ACCEPTED').length
  const rejected = docs.filter(d => d.reviewStatus === 'REJECTED').length
  const pending  = docs.length - accepted - rejected
  const parts = [
    accepted && `${accepted} accepted`,
    rejected && `${rejected} rejected`,
    pending  && `${pending} awaiting review`,
  ].filter(Boolean)
  return <span className="text-[10px] text-text-muted">{parts.join(' · ')}</span>
}

export function IssueEvidenceTab({ entityId, vc = {}, entity = {} }) {
  // The remediation owner (whoever holds an active task / edit rights) attaches
  // evidence. Falls back to canEdit — the standard issue-workflow gate.
  const canUpload = vc.canEdit || vc.canAct || false

  const stepButtons = Array.isArray(vc.transitions) ? vc.transitions : []
  const atValidation = ['PENDING_REVIEW', 'PENDING_VALIDATION'].includes(entity?.status)
  const canReview = vc.canAct === true && atValidation
    && (stepButtons.length === 0 || stepButtons.includes('ISSUE_VALIDATE'))
  // Nobody adds or swaps files while they are being judged — the owner gets
  // them back with Request changes.
  const canUploadRemediation = canUpload && !atValidation

  return (
    <div className="max-w-2xl space-y-4">
      <Section
        icon={AlertTriangle}
        label="Issue evidence"
        accent="warn"
        hint="Files documenting the issue. On an issue raised from an audit finding or a vendor assessment question, that source's files appear here automatically."
      >
        <EvidenceUploader
          entityType="ISSUE"
          entityId={entityId}
          linkType="DEFICIENCY"
          canUpload={canUpload}
          canRemove={canUpload}
          emptyLabel="No issue evidence attached yet"
        />
      </Section>

      <Section
        icon={Wrench}
        label="Remediation evidence"
        accent="pass"
        right={<ReviewSummary issueId={entityId} />}
        hint={canReview
          ? 'Accept or reject each file. Validate & Resolve needs every file decided and at least one accepted; use Request changes to send the fix back.'
          : 'Proof the issue was resolved — updated configs, re-run reports, approvals. Required before Submit for Review; the validator accepts or rejects each file.'}
      >
        <EvidenceUploader
          entityType="ISSUE"
          entityId={entityId}
          linkType="REMEDIATION"
          canUpload={canUploadRemediation}
          canRemove={canUploadRemediation}
          emptyLabel="No remediation evidence attached yet"
          renderRowExtra={(doc) => <EvidenceReview doc={doc} issueId={entityId} canReview={canReview} />}
        />
      </Section>
    </div>
  )
}

export default IssueEvidenceTab