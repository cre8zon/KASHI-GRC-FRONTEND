/**
 * IssueEvidenceTab — evidence management for a remediation issue.
 *
 * Same two-bucket model as findings (persisted via document_links.link_type):
 *   DEFICIENCY  — proof the issue/gap exists
 *   REMEDIATION — proof it was fixed (attach before closing for auditable closure)
 *
 * Uses the shared EvidenceUploader / document_links backbone, so every file is
 * tenant-scoped and timestamped — the verification-based closure record that a
 * screenshot-in-a-ticket can't provide.
 */
import { AlertTriangle, Wrench } from 'lucide-react'
import EvidenceUploader from '../ui/EvidenceUploader'
import { cn } from '../../lib/cn'

function Section({ icon: Icon, label, hint, accent, children }) {
  return (
    <div className="rounded-card border border-border bg-surface-raised overflow-hidden">
      <div className={cn('flex items-center gap-2 px-3 py-2 border-b border-border/60',
        accent === 'warn' ? 'bg-status-warn-bg/40' : accent === 'pass' ? 'bg-status-pass-bg/40' : 'bg-surface-inset')}>
        <Icon size={13} className={cn('shrink-0',
          accent === 'warn' ? 'text-status-warn-fg' : accent === 'pass' ? 'text-status-pass-fg' : 'text-text-muted')} />
        <span className="text-xs font-medium text-text-primary">{label}</span>
      </div>
      {hint && <p className="px-3 pt-2 text-[11px] text-text-muted">{hint}</p>}
      <div className="p-3">{children}</div>
    </div>
  )
}

export function IssueEvidenceTab({ entityId, vc = {} }) {
  // The remediation owner (whoever holds an active task / edit rights) attaches
  // evidence. Falls back to canEdit — the standard issue-workflow gate.
  const canUpload = vc.canEdit || vc.canAct || false

  return (
    <div className="max-w-2xl space-y-4">
      <Section
        icon={AlertTriangle}
        label="Issue evidence"
        accent="warn"
        hint="Files documenting the issue — the originating finding's evidence, scan output, or context that describes the gap."
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
        hint="Proof the issue was resolved — updated configs, re-run reports, approvals. Attach before closing so the closure is auditable."
      >
        <EvidenceUploader
          entityType="ISSUE"
          entityId={entityId}
          linkType="REMEDIATION"
          canUpload={canUpload}
          canRemove={canUpload}
          emptyLabel="No remediation evidence attached yet"
        />
      </Section>
    </div>
  )
}

export default IssueEvidenceTab
