/**
 * PolicyContentTab — renders the policy document content for an engagement
 * policy instance, plus the auditor review panel.
 *
 * Supports three content types (snapshotted from library):
 *   RICH_TEXT    → rendered HTML (from contentBodySnapshot)
 *   EXTERNAL_URL → link-out button + embedded iframe (when allowed)
 *   PDF_UPLOAD   → link to the evidence record (PDF, DOCX etc.)
 *
 * Auditor review panel (below content):
 *   - PolicyReviewEditor — the SAME editor as the control's Fieldwork tab:
 *     adequacy result + auditor notes, saved through
 *     PUT /v1/audit/policy-instances/:id/review (AuditFieldworkService), so a
 *     review typed here is what Fieldwork shows and vice versa, and INADEQUATE
 *     raises the policy-gap finding from either screen.
 *   - Read-only summary for everyone else who can open the policy, once it has
 *     been reviewed. Results are meant to be visible on the record itself; only
 *     the control's Fieldwork tab (the auditors' work surface) is auditor-only.
 */
import { useState }                                  from 'react'
import { FileText, ExternalLink, Globe, AlertTriangle,
         ChevronDown, ChevronUp }                    from 'lucide-react'
import { PolicyReviewEditor, PolicyResultBadge, policyResultCfg } from './PolicyReviewEditor'

// ── Component ───────────────────────────────────────────────────────────────

export function PolicyContentTab({ entity, vc = {} }) {
  // SECURITY: recording an adequacy conclusion is an auditor action. Only show
  // the review panel to users who hold audit:policy:review for this engagement.
  // (The backend enforces the same permission; this hides the UI for auditees.)
  const canReview = (vc.permissions || []).includes('audit:policy:review')
    // ...and the policy is this reviewer's: mapped to a control they may act
    // on, delegated to them, or an override. Same guard the review endpoint
    // runs (entity.canReviewPolicy). Undefined keeps the old behaviour.
    && entity?.canReviewPolicy !== false

  const contentType = entity?.contentTypeSnapshot
  const contentBody = entity?.contentBodySnapshot
  const externalUrl = entity?.externalUrlSnapshot

  const reviewed = !!(entity?.reviewResult && entity.reviewResult !== 'NOT_REVIEWED')
  const [reviewOpen, setReviewOpen] = useState(reviewed)
  const currentOption = policyResultCfg(entity?.reviewResult)

  if (!contentType && !contentBody && !externalUrl) {
    return (
      <div className="px-4 py-8 text-center text-xs text-text-muted">
        <FileText size={24} className="mx-auto mb-2 opacity-30"/>
        No policy content available for this snapshot.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Policy metadata bar */}
      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-3
                      text-[10px] text-text-muted shrink-0 flex-wrap">
        <span>Version {entity?.versionSnapshot || 1}</span>
        {entity?.effectiveDateSnapshot && (
          <><span>·</span>
          <span>Effective {new Date(entity.effectiveDateSnapshot).toLocaleDateString()}</span></>
        )}
        {entity?.nextReviewDateSnapshot && (
          <><span>·</span>
          <span>Next review {new Date(entity.nextReviewDateSnapshot).toLocaleDateString()}</span></>
        )}
        {entity?.policyStatusSnapshot && (
          <span className="ml-auto px-1.5 py-0.5 rounded bg-status-pass-bg
                           text-status-pass-fg text-[9px] font-medium">
            {entity.policyStatusSnapshot}
          </span>
        )}
      </div>

      {/* Scrollable content + review area */}
      <div className="flex-1 overflow-y-auto">

        {/* ── RICH_TEXT ── */}
        {contentType === 'RICH_TEXT' && contentBody && (
          <div className="px-4 py-4 policy-content"
            dangerouslySetInnerHTML={{ __html: contentBody }}
          />
        )}

        {/* ── EXTERNAL_URL ── */}
        {contentType === 'EXTERNAL_URL' && externalUrl && (
          <div className="px-4 py-4">
            <div className="flex items-start gap-3 p-3 bg-surface-overlay rounded-card
                            border border-border mb-4">
              <Globe size={14} className="text-brand-ink shrink-0 mt-0.5"/>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-text-primary mb-1">
                  External Policy Document
                </p>
                <p className="text-[10px] text-text-muted truncate">{externalUrl}</p>
              </div>
              <a href={externalUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded
                           bg-brand-500/10 text-brand-ink border border-brand-500/20
                           hover:bg-brand-500/20 shrink-0">
                <ExternalLink size={10}/> Open
              </a>
            </div>
            <div className="relative rounded-card border border-border overflow-hidden bg-surface-raised"
              style={{ height: '60vh' }}>
              <iframe src={externalUrl} title="Policy document preview"
                className="w-full h-full"
                sandbox="allow-same-origin allow-scripts"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            </div>
          </div>
        )}

        {/* ── DOCUMENT (evidence record) ── */}
        {/* PDF_UPLOAD — the enum has no DOCUMENT value, so this branch never
            rendered and an uploaded policy showed nothing at all. */}
        {contentType === 'PDF_UPLOAD' && entity?.evidenceRecordIdSnapshot && (
          <div className="px-4 py-4">
            <div className="flex items-center gap-3 p-3 bg-surface-overlay
                            rounded-card border border-border">
              <FileText size={14} className="text-brand-ink shrink-0"/>
              <div className="flex-1">
                <p className="text-[11px] font-medium text-text-primary">
                  Policy Document
                </p>
                <p className="text-[10px] text-text-muted">
                  Evidence record #{entity.evidenceRecordIdSnapshot}
                </p>
              </div>
              <a href={`/v1/evidence/${entity.evidenceRecordIdSnapshot}`}
                target="_blank"
                className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded
                           bg-brand-500/10 text-brand-ink border border-brand-500/20
                           hover:bg-brand-500/20">
                <ExternalLink size={10}/> View
              </a>
            </div>
          </div>
        )}

        {/* ── Fallback ── */}
        {!contentBody && !externalUrl && !entity?.evidenceRecordIdSnapshot && (
          <div className="px-4 py-8 text-center text-xs text-text-muted">
            <AlertTriangle size={18} className="mx-auto mb-2 text-status-warn-fg opacity-70"/>
            Policy content type is <strong>{contentType}</strong> but no content
            was found in the snapshot.
          </div>
        )}

        {/* ── Auditor review panel ──────────────────────────────────────────
            The policy's reviewer edits; anyone else who can open the policy
            sees the recorded conclusion read-only once it exists. */}
        {(canReview || reviewed) && (
        <div className="mx-4 mb-4 mt-2 border border-border rounded-card overflow-hidden">

          {/* Collapse toggle header — shows the SAVED conclusion */}
          <button
            onClick={() => setReviewOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5
                       bg-surface-overlay hover:bg-surface-overlay/80 transition-colors">
            <div className="flex items-center gap-2">
              <currentOption.icon size={13} className={currentOption.fg} />
              <span className="text-xs font-semibold text-text-primary">
                Auditor Review
              </span>
              {reviewed && <PolicyResultBadge value={entity.reviewResult} />}
              {entity?.reviewedAt && (
                <span className="text-[10px] text-text-muted">
                  · {new Date(entity.reviewedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            {reviewOpen
              ? <ChevronUp size={13} className="text-text-muted" />
              : <ChevronDown size={13} className="text-text-muted" />
            }
          </button>

          {reviewOpen && (
            <div className="px-4 py-4 border-t border-border bg-surface">
              <PolicyReviewEditor
                policyInstanceId={entity?.id}
                policy={entity}
                canReview={canReview}
              />
            </div>
          )}
        </div>
        )}

      </div>
    </div>
  )
}