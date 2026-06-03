/**
 * AuditPoliciesTab.jsx — Policies tab for the AuditControlDrawer.
 *
 * NEW FILE — drop into AuditControlDrawer as the Policies tab.
 *
 * ── WHAT IT SHOWS ─────────────────────────────────────────────────────────────
 *
 * Lists all AuditPolicyInstance rows linked to the current AuditControlInstance.
 * For each policy:
 *   - Policy title + ref + version + status badge
 *   - Content type (Rich text / PDF / External link)
 *   - Owner + next review date (with overdue warning)
 *   - Mapping type: DIRECT / PARTIAL / REFERENCE
 *   - Auditor's review result (ADEQUATE / ADEQUATE_WITH_GAPS / INADEQUATE / N/A)
 *   - "View policy" button → opens policy content in a modal
 *   - Auditor review form (inline) — AUDITOR/ORGANIZATION only
 *
 * ── VANTA COMPARISON ─────────────────────────────────────────────────────────
 * Vanta's Documents tab shows policies AND evidence files together.
 * In KashiGRC:
 *   - AuditPoliciesTab = structured policies with review result
 *   - Evidence tab = uploaded files (EvidenceRecord + EvidenceLink)
 *   - These are intentionally separate — policies have a lifecycle + approval
 *     whereas evidence files are point-in-time uploads
 *
 * ── ROLE BEHAVIOUR ────────────────────────────────────────────────────────────
 * AUDITOR:     Can record review result (ADEQUATE / INADEQUATE / etc.)
 * AUDITEE:     Read-only — sees which policies cover this control
 * ORGANIZATION: Read-only — sees review results, policy status
 * SYSTEM:      Full access
 */
import { useState }                              from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, ExternalLink, Calendar, User,
  CheckCircle2, AlertCircle, XCircle, Minus,
  ChevronDown, AlertTriangle, Eye,
} from 'lucide-react'
import { auditTestsApi } from '../../api/auditTestsApi'
import { Button }        from '../../components/ui/Button'
import { Badge }         from '../../components/ui/Badge'
import { Modal }         from '../../components/ui/Modal'
import { cn }            from '../../lib/cn'
import { formatDate }    from '../../utils/format'
import toast             from 'react-hot-toast'

// ── Config ────────────────────────────────────────────────────────────────────

const REVIEW_CFG = {
  NOT_REVIEWED:       { label: 'Not reviewed',      color: 'gray',   icon: Minus        },
  ADEQUATE:           { label: 'Adequate',          color: 'green',  icon: CheckCircle2 },
  ADEQUATE_WITH_GAPS: { label: 'Adequate with gaps',color: 'amber',  icon: AlertCircle  },
  INADEQUATE:         { label: 'Inadequate',        color: 'red',    icon: XCircle      },
  NOT_APPLICABLE:     { label: 'Not applicable',    color: 'gray',   icon: Minus        },
}

const MAPPING_TYPE_LABEL = {
  DIRECT:    { label: 'Direct coverage',   color: 'green'  },
  PARTIAL:   { label: 'Partial coverage',  color: 'amber'  },
  REFERENCE: { label: 'Reference only',    color: 'gray'   },
}

const STATUS_COLOR = {
  DRAFT:        'gray',
  UNDER_REVIEW: 'amber',
  APPROVED:     'green',
  DEPRECATED:   'red',
}

// ── Policy content modal ──────────────────────────────────────────────────────

function PolicyContentModal({ policyInstance, engagementId, onClose }) {
  const { data: fullPolicy } = useQuery({
    queryKey: ['audit-policy-instance-full', engagementId, policyInstance?.id],
    queryFn:  () => auditTestsApi.engagements.policies.get(engagementId, policyInstance.id),
    enabled:  !!policyInstance?.id,
    select:   d => d?.data ?? d,
  })

  if (!policyInstance) return null

  return (
    <Modal
      open={!!policyInstance}
      onClose={onClose}
      title={policyInstance.titleSnapshot}
      subtitle={`${policyInstance.policyRefSnapshot ?? ''} · v${policyInstance.versionSnapshot} · ${policyInstance.policyStatusSnapshot}`}
      size="xl"
    >
      <div className="flex flex-col gap-4">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-3">
          {policyInstance.approvedAtSnapshot && (
            <div className="p-2 rounded bg-surface-overlay border border-border">
              <p className="text-[10px] text-text-muted">Approved</p>
              <p className="text-xs text-text-primary">{formatDate(policyInstance.approvedAtSnapshot)}</p>
            </div>
          )}
          {policyInstance.nextReviewDateSnapshot && (
            <div className="p-2 rounded bg-surface-overlay border border-border">
              <p className="text-[10px] text-text-muted">Next review</p>
              <p className="text-xs text-text-primary">{formatDate(policyInstance.nextReviewDateSnapshot)}</p>
            </div>
          )}
        </div>

        {/* Content */}
        {policyInstance.contentTypeSnapshot === 'EXTERNAL_URL' ? (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-surface-overlay">
            <ExternalLink size={16} className="text-brand-400 shrink-0" />
            <div>
              <p className="text-sm text-text-primary">External policy document</p>
              <a
                href={fullPolicy?.externalUrlSnapshot ?? policyInstance.externalUrlSnapshot}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-400 hover:underline break-all"
              >
                {fullPolicy?.externalUrlSnapshot ?? policyInstance.externalUrlSnapshot}
              </a>
            </div>
          </div>
        ) : policyInstance.contentTypeSnapshot === 'PDF_UPLOAD' ? (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-surface-overlay">
            <FileText size={16} className="text-brand-400 shrink-0" />
            <div>
              <p className="text-sm text-text-primary">PDF policy document</p>
              <p className="text-xs text-text-muted">View via the Evidence tab</p>
            </div>
          </div>
        ) : (
          /* RICH_TEXT */
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border p-4 bg-surface-raised">
            <div
              className="prose prose-sm prose-invert max-w-none text-sm text-text-secondary leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: fullPolicy?.contentBodySnapshot ?? '<p class="text-text-muted">Content not available</p>',
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Policy row ────────────────────────────────────────────────────────────────

function PolicyRow({ policy, engagementId, access }) {
  const qc                = useQueryClient()
  const [expanded,   setExpanded]   = useState(false)
  const [viewPolicy, setViewPolicy] = useState(false)
  const [reviewResult, setReviewResult] = useState(policy.reviewResult ?? 'NOT_REVIEWED')
  const [auditorNotes,  setAuditorNotes]  = useState(policy.auditorNotes ?? '')
  const [dirty,    setDirty]   = useState(false)

  const reviewCfg = REVIEW_CFG[policy.reviewResult ?? 'NOT_REVIEWED']
  const ReviewIcon = reviewCfg.icon
  const mappingCfg = MAPPING_TYPE_LABEL[policy.mappingType] ?? MAPPING_TYPE_LABEL.DIRECT

  const isOverdue = policy.nextReviewDateSnapshot &&
    new Date(policy.nextReviewDateSnapshot) < new Date()

  const saveMut = useMutation({
    mutationFn: () => auditTestsApi.engagements.policies.review(engagementId, policy.id, {
      reviewResult,
      auditorNotes: auditorNotes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-control-policies', engagementId] })
      setDirty(false)
      toast.success('Policy review saved')
    },
    onError: () => toast.error('Failed to save review'),
  })

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 p-3 hover:bg-surface-overlay transition-colors text-left"
      >
        <ReviewIcon size={15} className={cn('mt-0.5 shrink-0', {
          'text-green-400': policy.reviewResult === 'ADEQUATE',
          'text-amber-400': policy.reviewResult === 'ADEQUATE_WITH_GAPS',
          'text-red-400':   policy.reviewResult === 'INADEQUATE',
          'text-text-muted': !policy.reviewResult || policy.reviewResult === 'NOT_REVIEWED',
        })} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {policy.policyRefSnapshot && (
              <span className="font-mono text-[10px] text-text-muted">{policy.policyRefSnapshot}</span>
            )}
            <span className="text-sm font-medium text-text-primary">{policy.titleSnapshot}</span>
            <span className="text-[10px] text-text-muted">v{policy.versionSnapshot}</span>
            <Badge colorTag={STATUS_COLOR[policy.policyStatusSnapshot] ?? 'gray'} size="sm">
              {policy.policyStatusSnapshot}
            </Badge>
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge colorTag={mappingCfg.color} size="sm">{mappingCfg.label}</Badge>
            <Badge colorTag={reviewCfg.color} size="sm">{reviewCfg.label}</Badge>
            {isOverdue && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400">
                <AlertTriangle size={9} /> Review overdue
              </span>
            )}
          </div>

          {policy.nextReviewDateSnapshot && (
            <p className="text-[10px] text-text-muted mt-1 flex items-center gap-1">
              <Calendar size={9} />
              Next review: {formatDate(policy.nextReviewDateSnapshot)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setViewPolicy(true) }}
            className="flex items-center gap-1 text-[10px] text-brand-400 border border-brand-500/30 rounded px-2 py-1 hover:bg-brand-500/10 transition-colors"
          >
            <Eye size={10} /> View
          </button>
          <ChevronDown size={13} className={cn(
            'text-text-muted transition-transform',
            expanded && 'rotate-180'
          )} />
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border p-3 flex flex-col gap-3 bg-surface-overlay/30">
          {/* Description */}
          {policy.descriptionSnapshot && (
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                Description
              </p>
              <p className="text-xs text-text-secondary leading-relaxed">{policy.descriptionSnapshot}</p>
            </div>
          )}

          {/* Mapping note */}
          {policy.mappingNote && (
            <div className="p-2 rounded bg-surface-raised border border-border">
              <p className="text-[10px] text-text-muted mb-1">How this policy covers the control</p>
              <p className="text-xs text-text-secondary">{policy.mappingNote}</p>
            </div>
          )}

          {/* Existing auditor notes */}
          {policy.auditorNotes && !access.canRecordTestResult && (
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                Auditor notes
              </p>
              <p className="text-xs text-text-secondary">{policy.auditorNotes}</p>
            </div>
          )}

          {/* Auditor review form — AUDITOR/ORGANIZATION only */}
          {access.canViewTestNotes && (
            <div className="flex flex-col gap-3 pt-2 border-t border-border">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                Auditor review
              </p>

              {/* Review result selector */}
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(REVIEW_CFG).filter(([v]) => v !== 'NOT_REVIEWED').map(([value, c]) => {
                  const Ic = c.icon
                  return (
                    <button
                      key={value}
                      onClick={() => { setReviewResult(value); setDirty(true) }}
                      disabled={!access.canRecordTestResult}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1.5 rounded border text-[11px] font-medium transition-all text-left',
                        reviewResult === value
                          ? {
                              ADEQUATE:           'border-green-500/40 bg-green-500/10 text-green-400',
                              ADEQUATE_WITH_GAPS: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
                              INADEQUATE:         'border-red-500/40   bg-red-500/10   text-red-400',
                              NOT_APPLICABLE:     'border-gray-500/30  bg-gray-500/8   text-text-muted',
                            }[value]
                          : 'border-border bg-surface-overlay text-text-muted hover:opacity-80',
                        !access.canRecordTestResult && 'cursor-default opacity-60',
                      )}
                    >
                      <Ic size={11} className="shrink-0" />
                      {c.label}
                    </button>
                  )
                })}
              </div>

              {/* Notes */}
              {access.canRecordTestResult && (
                <textarea
                  value={auditorNotes}
                  onChange={e => { setAuditorNotes(e.target.value); setDirty(true) }}
                  rows={2}
                  placeholder="Notes on policy adequacy…"
                  className="w-full px-3 py-2 rounded-md border border-border bg-surface-raised text-xs
                             text-text-primary placeholder:text-text-muted resize-none
                             focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}

              {/* Save */}
              {dirty && access.canRecordTestResult && (
                <Button size="xs" variant="primary"
                  loading={saveMut.isPending}
                  onClick={() => saveMut.mutate()}>
                  Save review
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Policy content modal */}
      {viewPolicy && (
        <PolicyContentModal
          policyInstance={policy}
          engagementId={engagementId}
          onClose={() => setViewPolicy(false)}
        />
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * @param {object}  props
 * @param {object}  props.control       AuditControlInstance
 * @param {string}  props.engagementId
 * @param {object}  props.access        from useAuditAccess
 */
export default function AuditPoliciesTab({ control, engagementId, access }) {
  const { data: policies, isLoading } = useQuery({
    queryKey: ['audit-control-policies', engagementId, control?.id],
    queryFn:  () => auditTestsApi.engagements.policies.listForControl(engagementId, control?.id),
    enabled:  !!engagementId && !!control?.id,
    select:   d => d?.data ?? d ?? [],
  })

  const policyList = Array.isArray(policies) ? policies : []

  return (
    <div className="flex flex-col gap-4">

      {/* Coverage summary */}
      {policyList.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-surface-overlay text-xs text-text-secondary">
          <FileText size={14} className="text-brand-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-text-primary">{policyList.length} policy{policyList.length !== 1 ? 'ies' : ''}</span>
            {' '}cover this control.{' '}
            {policyList.filter(p => p.mappingType === 'DIRECT').length > 0 && (
              <span>
                {policyList.filter(p => p.mappingType === 'DIRECT').length} direct.{' '}
              </span>
            )}
            <span className="text-text-muted">
              Review each policy to confirm it adequately addresses the control requirement.
            </span>
          </div>
        </div>
      )}

      {/* Policy list */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map(i => (
            <div key={i} className="h-16 rounded-lg bg-surface-overlay animate-pulse" />
          ))}
        </div>
      ) : policyList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="w-10 h-10 rounded-full bg-surface-overlay flex items-center justify-center">
            <FileText size={16} className="text-text-muted" />
          </div>
          <div>
            <p className="text-sm text-text-muted">No policies linked to this control</p>
            <p className="text-xs text-text-muted mt-1">
              Link policies to controls in the Audit Library to track policy coverage per control.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {policyList.map(policy => (
            <PolicyRow
              key={policy.id}
              policy={policy}
              engagementId={engagementId}
              access={access}
            />
          ))}
        </div>
      )}

      {/* Review progress */}
      {policyList.length > 0 && (
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
          {[
            { label: 'Adequate',    value: policyList.filter(p => p.reviewResult === 'ADEQUATE').length,       color: 'text-green-400' },
            { label: 'With gaps',   value: policyList.filter(p => p.reviewResult === 'ADEQUATE_WITH_GAPS').length, color: 'text-amber-400' },
            { label: 'Inadequate',  value: policyList.filter(p => p.reviewResult === 'INADEQUATE').length,     color: 'text-red-400'   },
          ].map(s => (
            <div key={s.label} className="text-center p-2 rounded-lg border border-border bg-surface-overlay">
              <div className={cn('text-lg font-bold font-mono', s.color)}>{s.value}</div>
              <div className="text-[10px] text-text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
