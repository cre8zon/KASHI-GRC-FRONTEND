/**
 * PolicyContentTab — renders the policy document content for an engagement
 * policy instance, plus the auditor review panel.
 *
 * Supports three content types (snapshotted from library):
 *   RICH_TEXT    → rendered HTML (from contentBodySnapshot)
 *   EXTERNAL_URL → link-out button + embedded iframe (when allowed)
 *   DOCUMENT     → link to the evidence record (PDF, DOCX etc.)
 *
 * Auditor review panel (below content):
 *   - ReviewResult: NOT_REVIEWED / ADEQUATE / ADEQUATE_WITH_GAPS / INADEQUATE
 *   - Auditor notes (free text)
 *   - Saved via PUT /v1/audit/engagements/:engagementId/policies/:policyInstanceId/review
 *   - Read-only when already reviewed (auditor can still override)
 */
import { useState }                                  from 'react'
import { useMutation, useQueryClient }               from '@tanstack/react-query'
import { FileText, ExternalLink, Globe, AlertTriangle,
         CheckCircle2, XCircle, AlertCircle, Clock,
         ChevronDown, ChevronUp }                    from 'lucide-react'
import { Button }                                    from '../ui/Button'
import { cn }                                        from '../../lib/cn'
import api                                           from '../../config/axios.config'
import toast                                         from 'react-hot-toast'

// ── Review result config ────────────────────────────────────────────────────

const REVIEW_OPTIONS = [
  {
    value:  'ADEQUATE',
    label:  'Adequate',
    desc:   'Policy fully addresses the control requirement',
    icon:   CheckCircle2,
    color:  'text-status-pass-fg',
    bg:     'bg-status-pass-bg border-status-pass-bd hover:bg-status-pass-bg',
    active: 'bg-status-pass-bg border-status-pass-bd ring-1 ring-status-pass-bd',
  },
  {
    value:  'ADEQUATE_WITH_GAPS',
    label:  'Adequate with gaps',
    desc:   'Policy is adequate but has minor gaps noted',
    icon:   AlertCircle,
    color:  'text-status-warn-fg',
    bg:     'bg-status-warn-bg border-status-warn-bd hover:bg-status-warn-bg',
    active: 'bg-status-warn-bg border-status-warn-bd ring-1 ring-status-warn-bd',
  },
  {
    value:  'INADEQUATE',
    label:  'Inadequate',
    desc:   'Policy does not adequately address the requirement',
    icon:   XCircle,
    color:  'text-status-fail-fg',
    bg:     'bg-status-fail-bg border-status-fail-bd hover:bg-status-fail-bg',
    active: 'bg-status-fail-bg border-status-fail-bd ring-1 ring-status-fail-bd',
  },
  {
    value:  'NOT_REVIEWED',
    label:  'Not reviewed',
    desc:   'No conclusion recorded yet',
    icon:   Clock,
    color:  'text-text-muted',
    bg:     'bg-surface-overlay border-border hover:bg-surface-overlay/80',
    active: 'bg-surface border-border ring-1 ring-border',
  },
]

// ── Component ───────────────────────────────────────────────────────────────

export function PolicyContentTab({ entity }) {
  const { engagementId } = entity || {}
  const qc = useQueryClient()

  const contentType = entity?.contentTypeSnapshot
  const contentBody = entity?.contentBodySnapshot
  const externalUrl = entity?.externalUrlSnapshot

  // Auditor review state — seeded from entity
  const [reviewResult, setReviewResult] = useState(
    entity?.reviewResult || 'NOT_REVIEWED'
  )
  const [auditorNotes, setAuditorNotes] = useState(entity?.auditorNotes || '')
  const [reviewOpen,   setReviewOpen]   = useState(
    // Auto-expand if already reviewed or if inadequate
    !!(entity?.reviewResult && entity.reviewResult !== 'NOT_REVIEWED')
  )

  const reviewMut = useMutation({
    mutationFn: () => api.put(
      `/v1/audit/engagements/${engagementId}/policies/${entity?.id}/review`,
      { reviewResult, auditorNotes: auditorNotes || null }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drawer-entity'] })
      qc.invalidateQueries({ queryKey: ['module-detail'] })
      toast.success('Review recorded')
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to save review'),
  })

  const isDirty = reviewResult !== (entity?.reviewResult || 'NOT_REVIEWED')
    || auditorNotes !== (entity?.auditorNotes || '')

  const currentOption = REVIEW_OPTIONS.find(o => o.value === reviewResult)

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
              <Globe size={14} className="text-brand-400 shrink-0 mt-0.5"/>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-text-primary mb-1">
                  External Policy Document
                </p>
                <p className="text-[10px] text-text-muted truncate">{externalUrl}</p>
              </div>
              <a href={externalUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded
                           bg-brand-500/10 text-brand-400 border border-brand-500/20
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
        {contentType === 'DOCUMENT' && entity?.evidenceRecordIdSnapshot && (
          <div className="px-4 py-4">
            <div className="flex items-center gap-3 p-3 bg-surface-overlay
                            rounded-card border border-border">
              <FileText size={14} className="text-brand-400 shrink-0"/>
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
                           bg-brand-500/10 text-brand-400 border border-brand-500/20
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

        {/* ── Auditor review panel ─────────────────────────────────────────── */}
        <div className="mx-4 mb-4 mt-2 border border-border rounded-card overflow-hidden">

          {/* Collapse toggle header */}
          <button
            onClick={() => setReviewOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5
                       bg-surface-overlay hover:bg-surface-overlay/80 transition-colors">
            <div className="flex items-center gap-2">
              <currentOption.icon size={13} className={currentOption.color} />
              <span className="text-xs font-semibold text-text-primary">
                Auditor Review
              </span>
              {entity?.reviewResult && entity.reviewResult !== 'NOT_REVIEWED' && (
                <span className={cn(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded border',
                  reviewResult === 'ADEQUATE'            ? 'bg-status-pass-bg text-status-pass-fg border-status-pass-bd' :
                  reviewResult === 'ADEQUATE_WITH_GAPS'  ? 'bg-status-warn-bg text-status-warn-fg border-status-warn-bd' :
                  reviewResult === 'INADEQUATE'          ? 'bg-status-fail-bg text-status-fail-fg border-status-fail-bd' :
                  'bg-surface border-border text-text-muted'
                )}>
                  {currentOption.label}
                </span>
              )}
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

          {/* Review form */}
          {reviewOpen && (
            <div className="px-4 py-4 border-t border-border space-y-4 bg-surface">

              {/* Result selector */}
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase
                               tracking-wide mb-2">
                  Adequacy conclusion
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {REVIEW_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setReviewResult(opt.value)}
                      className={cn(
                        'flex items-start gap-2 p-2.5 rounded-card border text-left transition-all',
                        reviewResult === opt.value ? opt.active : opt.bg
                      )}>
                      <opt.icon size={13} className={cn(opt.color, 'mt-0.5 shrink-0')} />
                      <div>
                        <p className={cn('text-[11px] font-semibold', opt.color)}>
                          {opt.label}
                        </p>
                        <p className="text-[10px] text-text-muted leading-tight mt-0.5">
                          {opt.desc}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Auditor notes */}
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase
                               tracking-wide mb-1.5">
                  Notes
                  {reviewResult === 'INADEQUATE' && (
                    <span className="ml-1 text-status-fail-fg normal-case font-normal">
                      — document gaps for findings
                    </span>
                  )}
                </p>
                <textarea
                  value={auditorNotes}
                  onChange={e => setAuditorNotes(e.target.value)}
                  rows={4}
                  placeholder={
                    reviewResult === 'INADEQUATE'
                      ? 'Describe the specific gaps or deficiencies…'
                      : reviewResult === 'ADEQUATE_WITH_GAPS'
                      ? 'Describe the minor gaps noted…'
                      : 'Optional notes on this policy review…'
                  }
                  className="w-full px-3 py-2 text-xs bg-surface-overlay border border-border
                             rounded-card text-text-primary placeholder:text-text-muted
                             focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                />
              </div>

              {/* Save button */}
              <div className="flex items-center justify-between">
                {entity?.reviewedAt && (
                  <span className="text-[10px] text-text-muted">
                    Last saved {new Date(entity.reviewedAt).toLocaleString()}
                    {entity?.reviewerName && ` by ${entity.reviewerName}`}
                  </span>
                )}
                <Button
                  size="sm"
                  className="ml-auto"
                  loading={reviewMut.isPending}
                  disabled={!isDirty}
                  onClick={() => reviewMut.mutate()}
                >
                  Save review
                </Button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}