/**
 * TestInstanceEvidenceTab — work papers and automated evidence for a test instance.
 *
 * Auditors upload test documentation here (sampling sheets, walkthrough notes,
 * screenshots) BEFORE or WHILE recording the test result. The test result
 * then cascades to all controls mapped to this test.
 *
 * Permissions:
 *   audit:control:record-test-result → can upload work papers
 *   audit:evidence:review            → can accept/reject automated checks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap, CheckCircle2, Clock, XCircle, RefreshCw,
  FlaskConical, Info,
} from 'lucide-react'
import api            from '../../config/axios.config'
import EvidenceUploader from '../ui/EvidenceUploader'
import { cn }         from '../../lib/cn'
import toast          from 'react-hot-toast'

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_CFG = {
  AUTOMATION_VERIFIED: { icon: CheckCircle2, color: 'text-status-pass-fg',   bg: 'bg-status-pass-bg',    label: 'Verified'       },
  ACCEPTED:            { icon: CheckCircle2, color: 'text-status-pass-fg',   bg: 'bg-status-pass-bg',    label: 'Accepted'       },
  PENDING_REVIEW:      { icon: Clock,        color: 'text-status-warn-fg',   bg: 'bg-status-warn-bg',    label: 'Pending review' },
  REJECTED:            { icon: XCircle,      color: 'text-status-fail-fg',     bg: 'bg-status-fail-bg',      label: 'Rejected'       },
  EXPIRED:             { icon: RefreshCw,    color: 'text-text-muted',  bg: 'bg-surface-overlay', label: 'Expired'        },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.PENDING_REVIEW
  const Icon = cfg.icon
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium',
      cfg.color, cfg.bg
    )}>
      <Icon size={8} />{cfg.label}
    </span>
  )
}

function Section({ icon: Icon, label, accent, badge, children }) {
  return (
    <div className={cn(
      'border rounded-card overflow-hidden',
      accent ? 'border-brand-500/25' : 'border-border'
    )}>
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 border-b',
        accent ? 'bg-brand-500/5 border-brand-500/20' : 'bg-surface-overlay/40 border-border/40'
      )}>
        <div className={cn(
          'flex items-center justify-center w-5 h-5 rounded',
          accent ? 'bg-brand-500/15 text-brand-ink' : 'bg-surface text-text-secondary border border-border'
        )}>
          <Icon size={10} />
        </div>
        <span className={cn(
          'text-[11px] font-semibold',
          accent ? 'text-brand-ink' : 'text-text-secondary'
        )}>
          {label}
        </span>
        {badge != null && (
          <span className={cn(
            'ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-medium',
            accent ? 'bg-brand-500/15 text-brand-ink' : 'bg-surface-overlay text-text-muted'
          )}>
            {badge}
          </span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function AutomatedRow({ link, onAccept, onReject, canReview }) {
  const record = link.record || {}
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/20 last:border-0">
      <Zap size={12} className="shrink-0 mt-0.5 text-brand-ink" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-primary truncate">
          {record.title || `Integration check #${link.evidenceRecordId}`}
        </p>
        {record.automationMessage && (
          <p className="text-[10px] text-text-muted mt-0.5">{record.automationMessage}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <StatusBadge status={link.status} />
          {record.collectedAt && (
            <span className="text-[9px] text-text-muted">
              {new Date(record.collectedAt).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
            </span>
          )}
        </div>
      </div>
      {canReview && link.status === 'PENDING_REVIEW' && (
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <button onClick={() => onAccept(link.id)}
            className="text-[9px] px-2 py-0.5 rounded-ctl bg-status-pass-bg text-status-pass-fg hover:bg-status-pass-bg font-medium">
            Accept
          </button>
          <button onClick={() => onReject(link.id)}
            className="text-[9px] px-2 py-0.5 rounded-ctl bg-status-fail-bg text-status-fail-fg hover:bg-status-fail-bg font-medium">
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

export function TestInstanceEvidenceTab({ testInstanceId, vc = {} }) {
  const qc = useQueryClient()
  const perms     = vc.permissions || []
  const canUpload = perms.includes('audit:control:record-test-result')
  const canReview = perms.includes('audit:evidence:review')
  const isAuditee = !canUpload && perms.includes('audit:control:submit-evidence')

  // Auditees should not see test work papers — these are auditor-internal documents.
  // Show a clear message explaining this is auditor-side content.
  if (isAuditee) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-card border border-border/40 bg-surface-overlay/30 px-4 py-8 flex flex-col items-center gap-2 text-center">
          <FlaskConical size={20} className="text-text-muted opacity-40" />
          <p className="text-sm font-medium text-text-secondary">Test work papers</p>
          <p className="text-xs text-text-muted max-w-xs leading-relaxed">
            Test documentation is maintained by the audit team and is not visible to auditees.
            To understand what's being tested, see the <span className="font-medium text-text-primary">Mapped Controls</span> tab.
          </p>
        </div>
      </div>
    )
  }

  const { data: linksData } = useQuery({
    queryKey: ['test-inst-evidence-links', testInstanceId],
    queryFn: () => api.get('/v1/evidence/links', {
      params: { entityType: 'AUDIT_TEST_INSTANCE', entityId: testInstanceId },
    }),
    enabled: !!testInstanceId,
    staleTime: 30 * 1000,
  })

  const { mutate: review } = useMutation({
    mutationFn: ({ linkId, action }) =>
      api.put(`/v1/evidence/links/${linkId}/review`, { action }),
    onSuccess: () => {
      toast.success('Updated')
      qc.invalidateQueries({ queryKey: ['test-inst-evidence-links', testInstanceId] })
    },
    onError: e => toast.error(e?.message || 'Failed'),
  })

  const links     = Array.isArray(linksData) ? linksData : []
  const automated = links.filter(l => l.collectionType === 'AUTOMATED' || l.automationVerified)

  return (
    <div className="flex flex-col gap-3 pb-6 max-w-2xl">

      {/* Guide */}
      <div className="rounded-card border border-status-warn-bd bg-status-warn-bg p-3.5">
        <div className="flex items-start gap-2.5">
          <FlaskConical size={13} className="shrink-0 text-status-warn-fg mt-0.5" />
          <div className="space-y-1.5 text-[11px] text-text-secondary leading-relaxed">
            <p className="font-medium text-text-primary">Test work papers</p>
            <p>
              Upload your test documentation here before recording the result.
              Files attached here serve as your audit evidence for how this test was performed.
            </p>
            <p className="text-text-muted">
              Recording <span className="font-medium text-status-pass-fg">PASS</span> will mark all
              {' '}<span className="font-medium text-text-primary">required</span> mapped controls as
              {' '}<span className="font-medium text-status-pass-fg">Effective</span>.
              Recording <span className="font-medium text-status-fail-fg">FAIL</span> marks them
              {' '}<span className="font-medium text-status-fail-fg">Ineffective</span> and raises findings.
            </p>
          </div>
        </div>
      </div>

      {/* Work papers upload */}
      <Section icon={FlaskConical} label="Work papers">
        <EvidenceUploader
          entityType="AUDIT_TEST_INSTANCE"
          entityId={testInstanceId}
          readOnly={!canUpload}
        />
      </Section>

      {/* Automated evidence */}
      {automated.length > 0 ? (
        <Section icon={Zap} label="Automated checks" accent badge={automated.length}>
          <div className="divide-y divide-border/20 -mx-3 -mb-3">
            {automated.map(l => (
              <AutomatedRow
                key={l.id}
                link={l}
                onAccept={() => review({ linkId: l.id, action: 'ACCEPT' })}
                onReject={() => review({ linkId: l.id, action: 'REJECT' })}
                canReview={canReview}
              />
            ))}
          </div>
        </Section>
      ) : (
        <div className="border border-dashed border-border/50 rounded-card px-4 py-4 flex items-center gap-3 text-[11px] text-text-muted">
          <Zap size={13} className="shrink-0 text-border" />
          <span>
            <span className="font-medium text-text-secondary">No automated evidence yet.</span>
            {' '}Integration checks will appear here once configured for this test.
          </span>
        </div>
      )}

    </div>
  )
}