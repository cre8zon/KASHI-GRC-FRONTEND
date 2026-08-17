/**
 * ControlInstanceEvidenceTab
 *
 * Two-track evidence model with role-aware layout:
 *
 * AUDITEE (audit:control:submit-evidence):
 *   - Sees WHAT to upload, derived from the tests mapped to this control
 *   - Uploads manual evidence files
 *   - Sees automated integration checks (read-only)
 *
 * AUDITOR (audit:control:record-test-result):
 *   - Reviews auditee evidence (read-only)
 *   - Uploads own test documentation / work papers
 *   - Sees automated integration checks
 *   - Can accept/reject automated evidence
 *   - Records results and work papers from the Fieldwork tab
 *
 * Evidence requirements
 * ---------------------
 * AuditControlInstance has no evidence-guidance column. The guidance lives on
 * each mapped AuditTestInstance as evidenceGuidanceSnapshot, so AuditeeGuide
 * reads GET /v1/audit/control-instances/{id}/tests and lists one line per test
 * that carries guidance.
 *
 * Deliberately NOT shown to auditees:
 *   testProcedureSnapshot - auditor methodology (sampling, reperformance).
 *     Handing it over invites evidence assembled to satisfy the procedure
 *     rather than reflecting what happened. Flip AUDITEE_SEES_TEST_PROCEDURE
 *     below if your internal-audit practice differs.
 *   testResult / testerNotes - auditor conclusions, mid-fieldwork.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap, Paperclip, CheckCircle2, Clock, XCircle,
  RefreshCw, FlaskConical, Info, Lock, ExternalLink, Link2,
  ListChecks, CalendarClock,
} from 'lucide-react'
import api            from '../../config/axios.config'
import EvidenceUploader from '../ui/EvidenceUploader'
import { DocumentPreviewDrawer } from '../ui/DocumentPreviewDrawer'
import { cn }         from '../../lib/cn'
import { AutomationPayloadView } from './AutomationPayloadView'
import toast          from 'react-hot-toast'

/** Show auditors' test procedures to auditees. Off - see the header comment. */
const AUDITEE_SEES_TEST_PROCEDURE = false

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_CFG = {
  AUTOMATION_VERIFIED: { icon: CheckCircle2, color: 'text-status-pass-fg',   bg: 'bg-status-pass-bg',    label: 'Verified'        },
  ACCEPTED:            { icon: CheckCircle2, color: 'text-status-pass-fg',   bg: 'bg-status-pass-bg',    label: 'Accepted'        },
  PENDING_REVIEW:      { icon: Clock,        color: 'text-status-warn-fg',   bg: 'bg-status-warn-bg',    label: 'Pending review'  },
  REJECTED:            { icon: XCircle,      color: 'text-status-fail-fg',     bg: 'bg-status-fail-bg',      label: 'Rejected'        },
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
      'border rounded-card overflow-hidden',
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
          accent ? 'bg-brand-500/15 text-brand-ink'
                 : locked ? 'bg-surface-overlay text-text-muted border border-border/50'
                 : 'bg-surface text-text-secondary border border-border'
        )}>
          {locked ? <Lock size={9} /> : <Icon size={10} />}
        </div>
        <span className={cn(
          'text-[11px] font-semibold',
          accent ? 'text-brand-ink' : locked ? 'text-text-muted' : 'text-text-secondary'
        )}>
          {label}
        </span>
        {locked && (
          <span className="text-[9px] text-text-muted ml-1">— read only</span>
        )}
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

// ── Automated evidence row ────────────────────────────────────────────────────
function AutomatedRow({ link, onAccept, onReject, canReview }) {
  const [open, setOpen] = useState(false)

  // Evidence fields are flat on the link (EvidenceLinkResponse), not nested
  // under `record` — the nested shape was never sent by the API.
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/20 last:border-0">
      <Zap size={12} className="shrink-0 mt-0.5 text-brand-ink" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-primary truncate">
          {link.evidenceTitle || `Integration check #${link.evidenceRecordId}`}
        </p>
        {link.automationMessage && (
          <p className="text-[10px] text-text-muted mt-0.5">{link.automationMessage}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <StatusBadge status={link.status} />
          {link.collectedAt && (
            <span className="text-[9px] text-text-muted">
              {new Date(link.collectedAt).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
            </span>
          )}
          {link.integrationKey && (
            <span className="text-[9px] text-text-muted uppercase tracking-wide">
              via {link.integrationKey.replace('_', ' ')}
            </span>
          )}
          {link.rawPayload && (
            <button
              onClick={() => setOpen(v => !v)}
              className="text-[9px] text-brand-ink hover:underline"
            >
              {open ? 'Hide collected evidence' : 'View collected evidence'}
            </button>
          )}
        </div>

        {open && link.rawPayload && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <AutomationPayloadView payload={link.rawPayload} />
          </div>
        )}
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

// ── How-it-works guide ────────────────────────────────────────────────────────
function AuditeeGuide({ controlInstanceId, control }) {
  // Shares the ['ctrl-inst-tests', id] key with ControlInstanceTestsTab and the
  // Fieldwork tab, so switching tabs hits cache instead of refetching.
  const { data, isLoading } = useQuery({
    queryKey: ['ctrl-inst-tests', controlInstanceId],
    queryFn: () => api.get(`/v1/audit/control-instances/${controlInstanceId}/tests`),
    enabled: !!controlInstanceId,
    staleTime: 60 * 1000,
  })

  const rows = Array.isArray(data) ? data : (data?.data?.data || data?.data || [])
  const requirements = rows.filter(r =>
    (r.evidenceGuidanceSnapshot && r.evidenceGuidanceSnapshot.trim()) ||
    (AUDITEE_SEES_TEST_PROCEDURE && r.testProcedureSnapshot))

  const dueDate = control?.evidenceDueDate

  const HowTo = () => (
    <div className="space-y-1.5">
      {[
        ['1', 'Upload evidence', 'Attach files that prove this control is operating effectively — policies, screenshots, reports, sign-off logs.'],
        ['2', 'Submit evidence', 'Once all files are ready, click "Submit evidence" at the top of the page to hand this control to the auditor for review.'],
        ['3', 'Automated checks', 'If integrations are configured, real-time evidence may also appear below automatically.'],
      ].map(([n, title, desc]) => (
        <div key={n} className="flex items-start gap-2">
          <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-brand-500/15 text-brand-ink text-[8px] font-bold flex items-center justify-center">{n}</span>
          <span><span className="font-medium text-text-primary">{title}</span> — {desc}</span>
        </div>
      ))}
    </div>
  )

  // No published guidance yet — keep the original how-to so the panel is never
  // emptier than it was before.
  if (isLoading || !requirements.length) {
    return (
      <div className="rounded-card border border-brand-500/20 bg-brand-500/5 p-3.5 mb-4">
        <div className="flex items-start gap-2.5">
          <Info size={13} className="shrink-0 text-brand-ink mt-0.5" />
          <div className="space-y-2 text-[11px] text-text-secondary leading-relaxed">
            <p className="font-medium text-text-primary">How to submit evidence for this control</p>
            {control?.descriptionSnapshot && (
              <p className="text-text-secondary">{control.descriptionSnapshot}</p>
            )}
            <HowTo />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-card border border-brand-500/20 bg-brand-500/5 p-3.5 mb-4">
      <div className="flex items-start gap-2.5">
        <ListChecks size={13} className="shrink-0 text-brand-ink mt-0.5" />
        <div className="flex-1 min-w-0 space-y-2 text-[11px] text-text-secondary leading-relaxed">

          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-text-primary">What to upload for this control</p>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-ink font-medium">
              {requirements.length} {requirements.length === 1 ? 'requirement' : 'requirements'}
            </span>
            {dueDate && (
              <span className="inline-flex items-center gap-1 text-[9px] text-status-warn-fg ml-auto">
                <CalendarClock size={9} />
                due {new Date(dueDate).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
            )}
          </div>

          <ul className="space-y-2">
            {requirements.map(r => (
              <li key={r.testInstanceId} className="flex items-start gap-2">
                <span className="shrink-0 mt-[5px] w-1.5 h-1.5 rounded-full bg-brand-500/50" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {r.testRefSnapshot && (
                      <span className="font-mono text-[9px] text-brand-ink shrink-0">{r.testRefSnapshot}</span>
                    )}
                    {r.isRequired === false && (
                      <span className="text-[8px] text-text-muted">optional</span>
                    )}
                  </div>
                  <p className="text-text-primary font-medium">{r.testNameSnapshot}</p>
                  {r.evidenceGuidanceSnapshot && (
                    <p className="whitespace-pre-wrap mt-0.5">{r.evidenceGuidanceSnapshot}</p>
                  )}
                  {AUDITEE_SEES_TEST_PROCEDURE && r.testProcedureSnapshot && (
                    <p className="whitespace-pre-wrap mt-1 text-text-muted">{r.testProcedureSnapshot}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="pt-2 border-t border-brand-500/15">
            <HowTo />
          </div>
        </div>
      </div>
    </div>
  )
}

function AuditorGuide() {
  return (
    <div className="rounded-card border border-status-warn-bd bg-status-warn-bg p-3.5 mb-4">
      <div className="flex items-start gap-2.5">
        <FlaskConical size={13} className="shrink-0 text-status-warn-fg mt-0.5" />
        <div className="space-y-2 text-[11px] text-text-secondary leading-relaxed">
          <p className="font-medium text-text-primary">Evidence Review — Auditor actions</p>
          <div className="space-y-1.5">
            {[
              ['1', 'Review auditee evidence', 'Check the uploaded files below confirm the control is operating effectively.'],
              ['2', 'Test the control', 'Open the Fieldwork tab — procedure, work papers, result and tester notes for every mapped test, without leaving this control. A result cascades to all controls that test covers.'],
              ['3', 'Review linked policies', 'Same Fieldwork tab — check each linked policy is current, record its contribution to this control, and set the review result.'],
              ['4', 'Send back if needed', 'Use "Send back" at the top if evidence is insufficient — the auditee will be notified to re-upload before you can evaluate.'],
            ].map(([n, title, desc]) => (
              <div key={n} className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-status-warn-bg text-status-warn-fg text-[8px] font-bold flex items-center justify-center">{n}</span>
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
export function ControlInstanceEvidenceTab({ controlInstanceId, entity, vc = {} }) {
  const qc = useQueryClient()
  const perms       = vc.permissions || []
  const canSubmit   = perms.includes('audit:control:submit-evidence')
  const canReview   = perms.includes('audit:evidence:review')
  const isAuditor   = perms.includes('audit:control:record-test-result')
  // Auditee = can submit but NOT record test result
  const isAuditee   = canSubmit && !isAuditor

  // Reused-evidence preview — same drawer EvidenceUploader uses for manual
  // uploads, so a reused link opens identically to a manually attached file
  // instead of being plain unclickable text.
  const [previewLink, setPreviewLink] = useState(null)

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
      api.patch(`/v1/evidence/links/${linkId}/review`, { action }),
    onSuccess: () => {
      toast.success('Updated')
      qc.invalidateQueries({ queryKey: ['ctrl-inst-evidence-links', controlInstanceId] })
    },
    onError: e => toast.error(e?.message || 'Failed'),
  })

  const links     = Array.isArray(linksData) ? linksData : []
  // collectionType now comes through on the link; the old `automationVerified`
  // field never existed, so this filter always returned [].
  const automated = links.filter(l =>
    l.collectionType === 'AUTOMATED' || l.status === 'AUTOMATION_VERIFIED')
  // Evidence the engine pulled in from another control that shares this tag.
  const reused    = links.filter(l =>
    l.autoLinked && l.collectionType !== 'AUTOMATED' && l.status !== 'AUTOMATION_VERIFIED')

  return (
    <div className="flex flex-col gap-3 pb-6 max-w-2xl">

      {/* ── Role-specific guide ── */}
      {isAuditee  && <AuditeeGuide controlInstanceId={controlInstanceId} control={entity} />}
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

      {/* ── Reused evidence (KashiLink) ── */}
      {reused.length > 0 && (
        <Section icon={Link2} label="Reused evidence" badge={reused.length}>
          <div className="divide-y divide-border/20 -mx-3 -mb-3">
            {reused.map(l => (
              <div key={l.id}
                onClick={() => l.evidenceFileUrl && setPreviewLink(l)}
                className={cn(
                  'flex items-start gap-3 py-2.5 px-3 transition-colors',
                  l.evidenceFileUrl && 'cursor-pointer hover:bg-brand-500/5'
                )}>
                <Link2 size={12} className="shrink-0 mt-0.5 text-text-muted" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">
                    {l.evidenceTitle || `Evidence #${l.evidenceRecordId}`}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <StatusBadge status={l.status} />
                    {l.matchedTagSnapshot && (
                      <span className="font-mono text-[9px] px-1 py-0.5 rounded bg-status-tag-bg text-status-tag-fg">
                        {l.matchedTagSnapshot}
                      </span>
                    )}
                  </div>
                </div>
                {canReview && l.status === 'PENDING_REVIEW' && (
                  <div className="flex items-center gap-1 shrink-0 mt-0.5" onClick={e => e.stopPropagation()}>
                    <button onClick={() => review({ linkId: l.id, action: 'ACCEPT' })}
                      className="text-[9px] px-2 py-0.5 rounded-ctl bg-status-pass-bg text-status-pass-fg hover:bg-status-pass-bg font-medium">
                      Accept
                    </button>
                    <button onClick={() => review({ linkId: l.id, action: 'REJECT' })}
                      className="text-[9px] px-2 py-0.5 rounded-ctl bg-status-fail-bg text-status-fail-fg hover:bg-status-fail-bg font-medium">
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

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
        <div className="border border-dashed border-border/50 rounded-card px-4 py-4 flex items-center gap-3 text-[11px] text-text-muted">
          <Zap size={13} className="shrink-0 text-border" />
          <span>
            <span className="font-medium text-text-secondary">No automated evidence yet.</span>
            {' '}Integration checks will appear here once configured for this control.
          </span>
        </div>
      )}

      <DocumentPreviewDrawer
        document={previewLink ? {
          documentId: previewLink.evidenceFileUrl, // holds documentId, not a raw URL — see EvidenceRecordRepository
          fileName:   previewLink.evidenceFileName || previewLink.evidenceTitle,
          mimeType:   previewLink.evidenceMimeType,
        } : null}
        open={!!previewLink}
        onClose={() => setPreviewLink(null)}
      />
    </div>
  )
}