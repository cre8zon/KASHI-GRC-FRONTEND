/**
 * The two score dialogs of the vendor assessment review, as action components.
 *
 * The hand-built review page (AssessmentReviewPage) closed these steps with a
 * panel that showed the score first:
 *
 *   Consolidate findings   answered / sections / compliance score, the
 *                          findings box, Recalculate; one submit that
 *                          consolidates the scores and then saves the findings.
 *   Final approval         the rating suggested from the score, pre-selected,
 *                          which the CISO may override; one submit that
 *                          assigns the rating and approves.
 *
 * As plain ui_actions — a DynamicForm with a blank select and a separate
 * "Approve review" button — the score was nowhere on screen, the suggestion
 * was gone, and the rating could be saved without the approval. These bring
 * the panels back on the module page. A ui_actions row opens one with
 *
 *     payload_template_json = {"__component": "AssessmentRiskRatingDialog"}
 *     payload_template_json = {"__component": "AssessmentConsolidateDialog"}
 *
 * The score and suggestion come from GET /score-summary, computed live from
 * the responses, so they are right before anything has been consolidated.
 * Assigning the rating also approves on the server (POST /risk-rating fires
 * CISO_APPROVED), so a rating can never be left without its approval.
 */

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Send, RefreshCw, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { assessmentsApi } from '../../api/assessments.api'

const RATINGS = [
  { value: 'LOW',      on: 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg' },
  { value: 'MEDIUM',   on: 'bg-status-warn-bg border-status-warn-bd text-status-warn-fg' },
  { value: 'HIGH',     on: 'bg-status-warn-bg border-status-warn-bd text-status-warn-fg' },
  { value: 'CRITICAL', on: 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg' },
]
const ratingText = (r) =>
  r === 'LOW' ? 'text-status-pass-fg' : r === 'CRITICAL' ? 'text-status-fail-fg' : 'text-status-warn-fg'

const unwrap = (r) => r?.data?.data ?? r?.data ?? r

function useScoreSummary(assessmentId) {
  return useQuery({
    queryKey: ['assessment-score-summary', String(assessmentId)],
    queryFn: () => assessmentsApi.vendor.scoreSummary(assessmentId).then(unwrap),
    enabled: !!assessmentId,
    staleTime: 0,
  })
}

const errMsg = (e, fallback) =>
  e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || fallback

function Stat({ label, value }) {
  return (
    <div className="rounded-ctl border border-border p-3 text-center">
      <p className="text-lg font-semibold text-text-primary">{value}</p>
      <p className="text-xs text-text-muted mt-0.5">{label}</p>
    </div>
  )
}

const pctText = (s) => (s?.compliancePct == null ? '—' : `${s.compliancePct}%`)

// ─── Risk rating + approval ──────────────────────────────────────────────────

export function AssessmentRiskRatingDialog({ entityId, taskId, onClose, onDone }) {
  const { data: s, isLoading } = useScoreSummary(entityId)
  const suggested = s?.suggestedRiskRating || null
  const [rating, setRating] = useState(null)
  const [saving, setSaving] = useState(false)

  // Pre-select once the score arrives: an existing rating (a reopened step)
  // wins over the suggestion, so reopening never silently changes it.
  useEffect(() => {
    if (rating == null && s) setRating(s.riskRating || suggested || null)
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!rating) { toast.error('Choose a risk rating'); return }
    if (!taskId) { toast.error('Open this from your task to assign the rating'); return }
    setSaving(true)
    try {
      await assessmentsApi.vendor.assignRiskRating(entityId, parseInt(taskId, 10), rating)
      toast.success(`Review approved — risk rated ${rating}`)
      onClose?.()
      onDone?.()
    } catch (e) {
      toast.error(errMsg(e, 'Could not assign the rating'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Approve review and assign risk rating" size="md">
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-text-muted" /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Compliance score" value={pctText(s)} />
            <Stat label="Score"
              value={s?.possibleScore ? `${Math.round(s.earnedScore * 10) / 10} / ${Math.round(s.possibleScore * 10) / 10}` : '—'} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-text-primary">Overall risk rating</p>
              {suggested && (
                <span className="text-[10px] text-text-muted bg-surface-overlay px-2 py-0.5 rounded">
                  Suggested: <strong className={ratingText(suggested)}>{suggested}</strong> from the score
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {RATINGS.map(r => (
                <button key={r.value} type="button" onClick={() => setRating(r.value)}
                  className={cn('py-2 rounded-ctl border text-xs font-medium transition-colors relative',
                    rating === r.value ? r.on : 'border-border text-text-muted hover:border-brand-500/30')}>
                  {r.value}
                  {r.value === suggested && rating !== r.value && (
                    <span className="absolute -top-1.5 -right-1.5 text-[8px] bg-brand-500 text-brand-on rounded-full w-3 h-3 flex items-center justify-center">✓</span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-muted mt-1.5">
              Suggested from the reviewer-adjusted score. Override it if the findings or context call for a different rating.
            </p>
          </div>

          <Button variant="primary" icon={CheckCircle2} onClick={submit} loading={saving}
            disabled={!rating} className="w-full">
            Approve review with {rating || '…'} rating
          </Button>
        </div>
      )}
    </Modal>
  )
}

// ─── Consolidate scores + findings ───────────────────────────────────────────

export function AssessmentConsolidateDialog({ entityId, taskId, onClose, onDone }) {
  const qc = useQueryClient()
  const { data: s, isLoading, refetch } = useScoreSummary(entityId)
  const [findings, setFindings] = useState('')
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  const answered = s?.answeredQuestions
  const total    = s?.totalQuestions

  const submit = async () => {
    if (!findings.trim()) { toast.error('Document your findings before submitting'); return }
    if (!taskId) { toast.error('Open this from your task to consolidate'); return }
    setSaving(true)
    try {
      await assessmentsApi.vendor.consolidateScores(entityId, parseInt(taskId, 10))
      await assessmentsApi.vendor.documentFindings(entityId, parseInt(taskId, 10), findings)
      toast.success('Consolidated findings submitted')
      onClose?.()
      onDone?.()
    } catch (e) {
      toast.error(errMsg(e, 'Could not submit the findings'))
    } finally {
      setSaving(false)
    }
  }

  const recalculate = async () => {
    setRecalculating(true)
    try {
      // No taskId: recalculating re-derives the scores and must not close the
      // consolidation gate on its own — Submit does that, with the findings.
      const r = unwrap(await assessmentsApi.vendor.recalculateScores(entityId, null))
      toast.success(`Scores recalculated — ${r?.compliancePct ?? 0}% compliance`)
      await refetch()
      qc.invalidateQueries({ queryKey: ['assessment-review-summary', entityId] })
    } catch (e) {
      toast.error(errMsg(e, 'Could not recalculate'))
    } finally {
      setRecalculating(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Consolidate findings" size="lg">
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-text-muted" /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Questions answered" value={answered != null && total != null ? `${answered}/${total}` : '—'} />
            <Stat label="Sections" value={s?.sectionsTotal ?? '—'} />
            <Stat label="Compliance score" value={pctText(s)} />
          </div>

          {s?.reviewFindings && (
            <div className="rounded-ctl border border-border p-3 max-h-40 overflow-y-auto">
              <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Findings so far</p>
              <pre className="text-xs text-text-secondary whitespace-pre-wrap font-sans">{s.reviewFindings}</pre>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              Consolidated findings *
            </label>
            <textarea value={findings} onChange={e => setFindings(e.target.value)} rows={6}
              placeholder="Document key findings, risk observations, deficiencies, and recommendations…"
              className="w-full rounded-ctl border border-border glass-field px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
            <p className="text-[11px] text-text-muted">
              Submitting consolidates the section scores and adds your findings to the assessment.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="primary" icon={Send} onClick={submit} loading={saving}
              disabled={!findings.trim()} className="flex-1">
              Submit consolidated findings
            </Button>
            <Button variant="secondary" icon={RefreshCw} onClick={recalculate} loading={recalculating}
              title="Re-derive the score for every answer">
              Recalculate
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}