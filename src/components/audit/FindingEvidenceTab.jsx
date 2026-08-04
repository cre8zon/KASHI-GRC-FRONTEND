/**
 * FindingEvidenceTab — evidence management for an audit finding.
 *
 * Two purpose buckets (persisted via document_links.link_type, a free-string
 * column — no backend change needed):
 *   DEFICIENCY  — proof the gap exists (often the failing control's evidence)
 *   REMEDIATION — proof the gap was fixed (uploaded during remediation)
 *
 * This mirrors how audit tools (e.g. Vanta) split "scan/finding evidence" from
 * "sample of remediated" — and, unlike a screenshot dump, every file here is
 * tenant-scoped and timestamped via the shared EvidenceUploader / document_links
 * backbone, which is what makes remediation closure auditable.
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

export function FindingEvidenceTab({ entityId, vc = {} }) {
  // Anyone with edit rights on the finding (owner / auditor) can attach evidence.
  const canUpload = vc.canEdit || (vc.permissions || []).includes('audit:finding:create')
                 || (vc.permissions || []).includes('audit:finding:remediate')

  return (
    <div className="max-w-2xl space-y-4">
      <Section
        icon={AlertTriangle}
        label="Deficiency evidence"
        accent="warn"
        hint="Files that document the gap — e.g. the failing control's evidence, screenshots, or scan output that show why this finding was raised."
      >
        <EvidenceUploader
          entityType="AUDIT_FINDING"
          entityId={entityId}
          linkType="DEFICIENCY"
          canUpload={canUpload}
          canRemove={canUpload}
          emptyLabel="No deficiency evidence attached yet"
        />
      </Section>

      <Section
        icon={Wrench}
        label="Remediation evidence"
        accent="pass"
        hint="Proof the gap was fixed — updated configs, re-run reports, sign-off. Attach these before the finding is closed so remediation is auditable."
      >
        <EvidenceUploader
          entityType="AUDIT_FINDING"
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

export default FindingEvidenceTab
