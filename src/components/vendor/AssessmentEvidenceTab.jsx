/**
 * AssessmentEvidenceTab.jsx
 *
 * The documents backing one answer — upload, list, detach, preview.
 *
 * ── THE PREVIOUS VERSION TOLD THE USER TO GO SOMEWHERE ELSE ───────────────
 *
 * It rendered the list and then this, under a link icon:
 *
 *   "Upload through the document library, then link it here with entity type
 *    QUESTION_RESPONSE. Uploading is deliberately not duplicated in this tab —
 *    storage, virus scanning and filename sanitisation all live in the document
 *    module, and a second upload path would be a second place for each to go
 *    wrong."
 *
 * Two things wrong with that, and I wrote both.
 *
 * It is unusable. A vendor responder answering a questionnaire is told to leave
 * the questionnaire, find the document library, upload, come back, and then
 * perform a "link" with an entity type they have no reason to have heard of.
 * QUESTION_RESPONSE is a column value. Putting it in front of the person
 * answering a security question is an implementation detail escaping into the
 * product.
 *
 * And the reasoning was answering a question nobody asked. "A second upload
 * path" would indeed be a second place for storage and scanning to go wrong —
 * but reusing the platform's own uploader is not a second path, it is the SAME
 * path rendered here. EvidenceUploader wraps useDocumentUpload, which does
 * presign → PUT → confirm (or the multipart image route) and nothing else. One
 * implementation, mounted in one more place.
 *
 * It was already mounted in one more place, in fact: QuestionDrawer's Evidence
 * tab has rendered EvidenceUploader against exactly this entityType and
 * entityId all along. So the capability existed, the drawer had it, and this
 * inline panel — the one on the actual answering screen — was the only surface
 * that sent people away. Every audit evidence tab does the same thing this file
 * now does: ControlInstanceEvidenceTab, TestInstanceEvidenceTab,
 * FindingEvidenceTab, IssueEvidenceTab.
 *
 * ── WHAT THIS IS NOW ──────────────────────────────────────────────────────
 * A thin wrapper: a header saying what the panel is, then EvidenceUploader.
 * The list, the drag-and-drop zone, per-file progress, the preview drawer, the
 * download and the detach-with-confirm are all its, not restated here.
 *
 * That also fixes a live bug in passing. The download button here read
 *   res?.data?.data?.url
 * on a response the axios interceptor has already unwrapped, for a field
 * actually named downloadUrl — so it could never produce a link and always fell
 * through to "No download link came back". EvidenceUploader's openDocument is
 * the correct path and is what runs now.
 *
 * ── UNLINKING NEVER DELETES THE FILE ──────────────────────────────────────
 * Detach drops the document_links row. The document belongs to the document
 * store and may be attached to an audit, a policy, the assessment itself.
 * Deleting it because somebody detached it from one question would destroy
 * evidence on sight. EvidenceUploader's remove is removeLink, and its confirm
 * copy says so.
 */

import { Paperclip } from 'lucide-react'
import { cn } from '../../lib/cn'
import EvidenceUploader from '../ui/EvidenceUploader'
import { useStanding, EvidenceRequiredBadge } from './vendorShared'

export default function AssessmentEvidenceTab({
  questionInstanceId, assessmentId, vc = {}, compact = false,
  // Both optional. The Fill and Review cards pass them so the panel can say
  // whether this question's evidence requirement is met; the drawer does not,
  // and then the badge simply does not render.
  requiresEvidence = false,
  readOnly,
  onUploadSuccess,
}) {
  const standing = useStanding(vc)

  // ── STANDING, NOT A LOCAL PERMISSION CODE ────────────────────────────────
  //
  // Unchanged from before and still deliberate. The document module enforces
  // link and unlink on the server, so a second local gate in front of a working
  // one fails the wrong way: an unseeded permission row would hide a control
  // the server would have allowed, and that reads as a broken feature rather
  // than a missing grant.
  //
  // readOnly is the one override, and it is a fact rather than a permission:
  // an org-side reviewer looking at a vendor's evidence, or anyone on a
  // submitted section, is not being denied — there is nothing for them to
  // attach here.
  const canAttach = standing.hasStanding && !readOnly

  if (!questionInstanceId) {
    return (
      <div className="px-4 py-6 text-center text-[11px] text-text-muted">
        Select a question to see its evidence.
      </div>
    )
  }

  return (
    <div className={cn(compact ? 'py-1' : 'px-4 py-3')}>
      {!compact && (
        <div className="flex items-center gap-2 mb-2">
          <Paperclip size={12} className="text-text-muted" />
          <span className="text-[11px] font-medium text-text-primary">
            Evidence for this answer
          </span>
          <EvidenceRequiredBadge required={requiresEvidence} />
          <span className="flex-1" />
          {/* Kept from the old copy, minus the instructions. The assessment
              almost certainly HAS documents attached one level up, and "nothing
              here" beside a full assessment document list is confusing without
              saying so. */}
          <span className="text-[9px] text-text-muted">
            Attached to this answer only
          </span>
        </div>
      )}

      <EvidenceUploader
        entityType="QUESTION_RESPONSE"
        entityId={questionInstanceId}
        canUpload={canAttach}
        canRemove={canAttach}
        compact={compact}
        emptyLabel={canAttach
          ? 'No evidence attached to this answer yet.'
          : 'No evidence attached to this answer.'}
        onUploadSuccess={onUploadSuccess}
      />
    </div>
  )
}