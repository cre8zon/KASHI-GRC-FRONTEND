/**
 * PolicyContentTab — renders the policy document content.
 *
 * Supports three content types (snapshotted from library):
 *   RICH_TEXT   → rendered HTML (from contentBodySnapshot)
 *   EXTERNAL_URL → link-out button + embedded iframe (when allowed)
 *   DOCUMENT    → link to the evidence record (PDF, DOCX etc.)
 */
import { FileText, ExternalLink, Globe, AlertTriangle } from 'lucide-react'

export function PolicyContentTab({ entity }) {
  const contentType = entity?.contentTypeSnapshot
  const contentBody = entity?.contentBodySnapshot
  const externalUrl = entity?.externalUrlSnapshot

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
      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-3 text-[10px] text-text-muted shrink-0 flex-wrap">
        <span>Version {entity?.versionSnapshot || 1}</span>
        {entity?.effectiveDateSnapshot && (
          <><span>·</span><span>Effective {new Date(entity.effectiveDateSnapshot).toLocaleDateString()}</span></>
        )}
        {entity?.nextReviewDateSnapshot && (
          <><span>·</span><span>Next review {new Date(entity.nextReviewDateSnapshot).toLocaleDateString()}</span></>
        )}
        {entity?.policyStatusSnapshot && (
          <span className="ml-auto px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[9px] font-medium">
            {entity.policyStatusSnapshot}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* RICH_TEXT */}
        {contentType === 'RICH_TEXT' && contentBody && (
          <div className="px-4 py-4 prose prose-sm max-w-none
            prose-headings:text-text-primary prose-p:text-text-secondary
            prose-strong:text-text-primary prose-li:text-text-secondary"
            dangerouslySetInnerHTML={{ __html: contentBody }}
          />
        )}

        {/* EXTERNAL_URL */}
        {contentType === 'EXTERNAL_URL' && externalUrl && (
          <div className="px-4 py-4">
            <div className="flex items-start gap-3 p-3 bg-surface-overlay rounded-lg border border-border mb-4">
              <Globe size={14} className="text-brand-400 shrink-0 mt-0.5"/>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-text-primary mb-1">External Policy Document</p>
                <p className="text-[10px] text-text-muted truncate">{externalUrl}</p>
              </div>
              <a href={externalUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 shrink-0">
                <ExternalLink size={10}/> Open
              </a>
            </div>
            {/* Embedded preview (if CORS allows) */}
            <div className="relative rounded-lg border border-border overflow-hidden bg-white" style={{height:'60vh'}}>
              <iframe
                src={externalUrl}
                title="Policy document preview"
                className="w-full h-full"
                sandbox="allow-same-origin allow-scripts"
                onError={(e) => { e.target.style.display='none' }}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-surface pointer-events-none opacity-0 hover:opacity-0">
                <span className="text-xs text-text-muted">Preview unavailable — open the link above</span>
              </div>
            </div>
          </div>
        )}

        {/* DOCUMENT (evidence record) */}
        {contentType === 'DOCUMENT' && entity?.evidenceRecordIdSnapshot && (
          <div className="px-4 py-4">
            <div className="flex items-center gap-3 p-3 bg-surface-overlay rounded-lg border border-border">
              <FileText size={14} className="text-brand-400 shrink-0"/>
              <div className="flex-1">
                <p className="text-[11px] font-medium text-text-primary">Policy Document</p>
                <p className="text-[10px] text-text-muted">Evidence record #{entity.evidenceRecordIdSnapshot}</p>
              </div>
              <a href={`/v1/evidence/${entity.evidenceRecordIdSnapshot}`} target="_blank"
                className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20">
                <ExternalLink size={10}/> View
              </a>
            </div>
          </div>
        )}

        {/* Fallback */}
        {!contentBody && !externalUrl && !entity?.evidenceRecordIdSnapshot && (
          <div className="px-4 py-8 text-center text-xs text-text-muted">
            <AlertTriangle size={18} className="mx-auto mb-2 text-amber-400 opacity-70"/>
            Policy content type is <strong>{contentType}</strong> but no content was found in the snapshot.
          </div>
        )}
      </div>
    </div>
  )
}