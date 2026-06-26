/**
 * ControlInstanceEvidenceTab
 *
 * Two-track evidence model with role-aware layout:
 *
 * AUDITEE (audit:control:submit-evidence):
 *   - Uploads manual evidence files
 *   - Sees automated integration checks (read-only)
 *
 * AUDITOR (audit:control:record-test-result):
 *   - Reviews auditee evidence (read-only)
 *   - Uploads own test documentation / work papers
 *   - Sees automated integration checks
 *   - Can accept/reject automated evidence
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap, Paperclip, CheckCircle2, Clock, XCircle,
  RefreshCw, FlaskConical, Info, Lock, ExternalLink,
} from 'lucide-react'
import api            from '../../config/axios.config'
import EvidenceUploader from '../ui/EvidenceUploader'
import { cn }         from '../../lib/cn'
import toast          from 'react-hot-toast'

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_CFG = {
  AUTOMATION_VERIFIED: { icon: CheckCircle2, color: 'text-green-400',   bg: 'bg-green-500/10',    label: 'Verified'        },
  ACCEPTED:            { icon: CheckCircle2, color: 'text-green-400',   bg: 'bg-green-500/10',    label: 'Accepted'        },
  PENDING_REVIEW:      { icon: Clock,        color: 'text-amber-400',   bg: 'bg-amber-500/10',    label: 'Pending review'  },
  REJECTED:            { icon: XCircle,      color: 'text-red-400',     bg: 'bg-red-500/10',      label: 'Rejected'        },
  EXPIRED:             { icon: RefreshCw,    color: 'text-text-muted',  bg: 'bg-surface-overlay', label: 'Expired'         },
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

// ── Section card wrapper ──────────────────────────────────────────────────────
function Section({ icon: Icon, label, accent, badge, locked, children }) {
  return (
    <div className={cn(
      'border rounded-xl overflow-hidden',
      accent ? 'border-brand-500/25' : locked ? 'border-border/40' : 'border-border'
    )}>
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 border-b',
        accent ? 'bg-brand-500/5 border-brand-500/20'
               : locked ? 'bg-surface-overlay/30 border-border/30'
               : 'bg-surface-overlay/40 border-border/40'
      )}>
        <div className={cn(
          'flex items-center justify-center w-5 h-5 rounded',
          accent ? 'bg-brand-500/15 text-brand-400'
                 : locked ? 'bg-surface-overlay text-text-muted border border-border/50'
                 : 'bg-surface text-text-secondary border border-border'
        )}>
          {locked ? <Lock size={9} /> : <Icon size={10} />}
        </div>
        <span className={cn(
          'text-[11px] font-semibold',
          accent ? 'text-brand-400' : locked ? 'text-text-muted' : 'text-text-secondary'
        )}>
          {label}
        </span>
        {locked && (
          <span className="text-[9px] text-text-muted ml-1">— read only</span>
        )}
        {badge != null && (
          <span className={cn(
            'ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-medium',
            accent ? 'bg-brand-500/15 text-brand-400' : 'bg-surface-overlay text-text-muted'
          )}>
            {badge}
          </span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

// ── Automated evidence row ────────────────────────────────────────────────────
function AutomatedRow({ link, onAccept, onReject, canReview }) {
  const record = link.record || {}
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/20 last:border-0">
      <Zap size={12} className="shrink-0 mt-0.5 text-brand-400" />
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
            className="text-[9px] px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 hover:bg-green-500/20 font-medium">
            Accept
          </button>
          <button onClick={() => onReject(link.id)}
            className="text-[9px] px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 font-medium">
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

// ── How-it-works guide ────────────────────────────────────────────────────────
function AuditeeGuide() {
  return (
    <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-3.5 mb-4">
      <div className="flex items-start gap-2.5">
        <Info size={13} className="shrink-0 text-brand-400 mt-0.5" />
        <div className="space-y-2 text-[11px] text-text-secondary leading-relaxed">
          <p className="font-medium text-text-primary">How to submit evidence for this control</p>
          <div className="space-y-1.5">
            {[
              ['1', 'Upload evidence', 'Attach files that prove this control is operating effectively — policies, screenshots, reports, sign-off logs.'],
              ['2', 'Submit evidence', 'Once all files are ready, click "Submit evidence" at the top of the page to hand this control to the auditor for review.'],
              ['3', 'Automated checks', 'If integrations are configured, real-time evidence may also appear below automatically.'],
            ].map(([n, title, desc]) => (
              <div key={n} className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-brand-500/15 text-brand-400 text-[8px] font-bold flex items-center justify-center">{n}</span>
                <span><span className="font-medium text-text-primary">{title}</span> — {desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AuditorGuide() {
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 mb-4">
      <div className="flex items-start gap-2.5">
        <FlaskConical size={13} className="shrink-0 text-amber-400 mt-0.5" />
        <div className="space-y-2 text-[11px] text-text-secondary leading-relaxed">
          <p className="font-medium text-text-primary">Evidence Review — Auditor actions</p>
          <div className="space-y-1.5">
            {[
              ['1', 'Review auditee evidence', 'Check the uploaded files below confirm the control is operating effectively.'],
              ['2', 'Test the control', 'Go to the Tests tab → open the linked test → upload your work papers and record the test result (PASS/FAIL). The result cascades to all controls covered by that test.'],
              ['3', 'Review linked policies', 'Go to the Policies tab → check the linked policy is current and satisfies the requirement. Record contribution (DIRECT/PARTIAL/GAP).'],
              ['4', 'Send back if needed', 'Use "Send back" at the top if evidence is insufficient — the auditee will be notified to re-upload before you can evaluate.'],
            ].map(([n, title, desc]) => (
              <div key={n} className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-amber-500/15 text-amber-400 text-[8px] font-bold flex items-center justify-center">{n}</span>
                <span><span className="font-medium text-text-primary">{title}</span> — {desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function ControlInstanceEvidenceTab({ controlInstanceId, vc = {} }) {
  const qc = useQueryClient()
  const perms       = vc.permissions || []
  const canSubmit   = perms.includes('audit:control:submit-evidence')
  const canReview   = perms.includes('audit:evidence:review')
  const isAuditor   = perms.includes('audit:control:record-test-result')
  // Auditee = can submit but NOT record test result
  const isAuditee   = canSubmit && !isAuditor

  // Automated evidence from integration checks
  const { data: linksData } = useQuery({
    queryKey: ['ctrl-inst-evidence-links', controlInstanceId],
    queryFn: () => api.get('/v1/evidence/links', {
      params: { entityType: 'AUDIT_CONTROL_INSTANCE', entityId: controlInstanceId },
    }),
    enabled: !!controlInstanceId,
    staleTime: 30 * 1000,
  })

  const { mutate: review } = useMutation({
    mutationFn: ({ linkId, action }) =>
      api.put(`/v1/evidence/links/${linkId}/review`, { action }),
    onSuccess: () => {
      toast.success('Updated')
      qc.invalidateQueries({ queryKey: ['ctrl-inst-evidence-links', controlInstanceId] })
    },
    onError: e => toast.error(e?.message || 'Failed'),
  })

  const links     = Array.isArray(linksData) ? linksData : []
  const automated = links.filter(l => l.collectionType === 'AUTOMATED' || l.automationVerified)

  return (
    <div className="flex flex-col gap-3 pb-6 max-w-2xl">

      {/* ── Role-specific guide ── */}
      {isAuditee  && <AuditeeGuide />}
      {isAuditor  && <AuditorGuide />}

      {/* ── Auditee evidence ── */}
      <Section
        icon={Paperclip}
        label={isAuditor ? 'Auditee evidence' : 'Your evidence'}
        locked={isAuditor}   // auditors see it read-only
      >
        <EvidenceUploader
          entityType="AUDIT_CONTROL_INSTANCE"
          entityId={controlInstanceId}
          canUpload={!isAuditor}   // auditors can't upload here
          canRemove={!isAuditor}
        />
      </Section>

      {/* Test documentation lives on the Test detail page, not here.
           Auditors navigate: Control → Tests tab → Test detail → Evidence tab → upload work papers */}

      {/* ── Automated evidence ── */}
      {automated.length > 0 ? (
        <Section icon={Zap} label="Integration checks" accent badge={automated.length}>
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
        <div className="border border-dashed border-border/50 rounded-xl px-4 py-4 flex items-center gap-3 text-[11px] text-text-muted">
          <Zap size={13} className="shrink-0 text-border" />
          <span>
            <span className="font-medium text-text-secondary">No automated evidence yet.</span>
            {' '}Integration checks will appear here once configured for this control.
          </span>
        </div>
      )}

    </div>
  )
}