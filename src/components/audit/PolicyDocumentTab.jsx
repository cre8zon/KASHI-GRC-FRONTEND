/**
 * PolicyDocumentTab — the policy document, rendered as written.
 *
 * The library policy detail screen was showing contentBody as an Overview
 * field, which meant a tenant read the raw markup — "<h1>Acceptable Use
 * Policy</h1><p><strong>Policy Reference:</strong>…" — instead of the document.
 * A policy is the artefact an auditor asks to see, so it needs to render.
 *
 * Distinct from PolicyContentTab, which serves AUDIT_POLICY_INSTANCE: that one
 * reads *Snapshot fields and carries the auditor review panel. This is the
 * LIBRARY policy — no snapshot, no review, read-only for everyone including the
 * owning tenant (edits go through the policy editor, not here).
 *
 * SANITISING: policy HTML is authored by platform admins or the tenant's own
 * admins through the policy editor — the same trust level as the rest of the
 * admin surface, and PolicyContentTab already renders it the same way. If you
 * ever accept policy content from a less trusted source (CSV import from a
 * vendor, an API integration), this needs DOMPurify before it renders.
 */
import { FileText, ExternalLink, Globe, Download } from 'lucide-react'
import { Button } from '../ui/Button'

export function PolicyDocumentTab({ entity }) {
  const contentType = entity?.contentType || 'RICH_TEXT'
  const body        = entity?.contentBody
  const url         = entity?.externalUrl
  const evidenceId  = entity?.evidenceRecordId

  const Empty = ({ icon: Icon, text }) => (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <Icon size={22} className="text-text-muted" strokeWidth={1.5} />
      <p className="text-sm text-text-secondary">{text}</p>
    </div>
  )

  return (
    <div className="rounded-card border border-border bg-surface-raised overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface-overlay/40">
        <FileText size={13} className="text-text-muted" />
        <span className="text-xs font-medium text-text-secondary">
          {entity?.policyRef ? `${entity.policyRef} · ` : ''}{entity?.title || 'Policy document'}
        </span>
        {entity?.version != null && (
          <span className="ml-auto text-[10px] font-mono text-text-muted">v{entity.version}</span>
        )}
      </div>

      {contentType === 'RICH_TEXT' && body && (
        // .policy-content is the same class PolicyContentTab uses, so library
        // and instance views of the same document look identical.
        <div className="px-5 py-5 policy-content" dangerouslySetInnerHTML={{ __html: body }} />
      )}
      {contentType === 'RICH_TEXT' && !body && (
        <Empty icon={FileText} text="This policy has no content yet." />
      )}

      {contentType === 'EXTERNAL_URL' && (
        url ? (
          <div className="px-5 py-6 flex flex-col items-start gap-3">
            <p className="text-xs text-text-secondary">This policy is maintained outside KashiGRC.</p>
            <Button size="sm" variant="secondary" icon={ExternalLink}
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
              Open policy
            </Button>
            <span className="text-[10px] font-mono text-text-muted break-all">{url}</span>
          </div>
        ) : <Empty icon={Globe} text="No external link recorded for this policy." />
      )}

      {/* PDF_UPLOAD, not DOCUMENT. AuditPolicy.ContentType is RICH_TEXT |
          PDF_UPLOAD | EXTERNAL_URL — there is no DOCUMENT value, so this branch
          never fired and an uploaded policy rendered as blank space. Copied the
          mistake from PolicyContentTab, which has the same bug. */}
      {contentType === 'PDF_UPLOAD' && (
        evidenceId ? (
          <div className="px-5 py-6 flex flex-col items-start gap-3">
            <p className="text-xs text-text-secondary">This policy is stored as an uploaded document.</p>
            <Button size="sm" variant="secondary" icon={Download}
              onClick={() => window.open(`/v1/evidence/${evidenceId}/download`, '_blank', 'noopener,noreferrer')}>
              Download document
            </Button>
          </div>
        ) : <Empty icon={FileText} text="No document attached to this policy." />
      )}
    </div>
  )
}