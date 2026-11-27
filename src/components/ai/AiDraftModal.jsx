import { useEffect, useState } from 'react'
import { Sparkles, ChevronRight, AlertTriangle, Loader2, Check, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { aiApi } from '../../api/ai.api'
import { cn } from '../../lib/cn'
import PolicyDiffView from '../policies/PolicyDiffView'

/**
 * Generate policy CONTENT for a policy that already exists.
 *
 * ── THIS IS THE EDIT PATH, AND IT ASKS FOR NO METADATA ──────────────────────
 * By the time this opens, the policy row exists: it has a title, an owner team,
 * frameworks, a review cadence. v1 asked for the title again, which put two
 * sources of truth on screen and invited someone to type a third.
 *
 * So this modal now generates the BODY only, grounded in the policy's own
 * metadata. The backend does the same on its side — draft() with a policyId
 * reads title, frameworks and control codes from the persisted policy and
 * treats the request as a fallback, because the saved values were chosen
 * deliberately and the request's were not.
 *
 * The CREATE path lives in AiPolicyCreatePage, where asking for metadata is
 * correct because none of it exists yet.
 *
 * ── WHY THE PROGRESS TEXT IS SPECIFIC ───────────────────────────────────────
 * draft() is a pipeline: assemble grounding, generate, self-critique, revise,
 * validate references. Six to ten model calls, ten to thirty seconds. A single
 * spinner for that long reads as broken.
 *
 * The stage labels are not decoration. "Checking control references" tells the
 * user something is being verified rather than invented, which is the claim the
 * product is making — showing the work is how the claim becomes credible.
 *
 * ── THE PROFILE GATE ────────────────────────────────────────────────────────
 * Output quality is bounded by AiOrgProfile. Below 80% complete (the point the
 * backend calls "well grounded") the modal says so before generating rather
 * than after, with a link to the profile screen, because the alternative is a
 * customer concluding the AI is weak when the real answer is that nobody filled
 * in the form. Below 50% it is a warning; between 50 and 79 a note.
 *
 * ── REGENERATING A DRAFT THAT HAS TEXT ──────────────────────────────────────
 * When currentHtml is not empty this is a regenerate. Nothing is lost: the
 * editor snapshots the current body as a revision (BEFORE_AI) before putting
 * the new draft in, and the result view offers a side-by-side comparison with
 * the current text before the user accepts anything.
 *
 * ── NOTHING IS SAVED HERE ───────────────────────────────────────────────────
 * onAccept hands the HTML back to the caller, which puts it in the editor as an
 * unsaved draft. The write still goes through the normal
 * DRAFT -> UNDER_REVIEW -> APPROVED lifecycle, because that chain is the audit
 * evidence.
 */
const STAGES = [
  'Gathering your organisation profile',
  'Reading the selected controls',
  'Drafting the policy',
  'Reviewing it against the requirements',
  'Checking control references',
]

export default function AiDraftModal({
  open, onClose, onAccept,
  policyId, policyTitle,
  controlCodes = [], frameworks = [], templateId,
  currentHtml = '',
}) {
  const hasCurrent = !!(currentHtml || '').replace(/<[^>]+>/g, '').trim()
  const [view, setView]           = useState('preview')     // preview | compare
  const [instructions, setInstr]  = useState('')
  const [quick, setQuick]         = useState(false)
  const [busy, setBusy]           = useState(false)
  const [stage, setStage]         = useState(0)
  const [result, setResult]       = useState(null)
  const [profile, setProfile]     = useState(null)

  useEffect(() => {
    if (!open) return
    setResult(null); setStage(0); setBusy(false); setInstr(''); setView('preview')
    aiApi.completeness().then(r => setProfile(r?.data?.data ?? r?.data ?? r)).catch(() => {})
  }, [open])

  // Advance the stage label on a timer. The backend does not stream pipeline
  // progress, so this is an honest approximation of elapsed work, not a lie
  // about which step is running — the labels are in true execution order.
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => setStage(s => Math.min(s + 1, STAGES.length - 1)), 4000)
    return () => clearInterval(t)
  }, [busy])

  const generate = async () => {
    setBusy(true); setStage(0)
    try {
      const res = await aiApi.draft({
        // policyId is what makes this the edit path. The backend grounds the
        // draft in the persisted policy and only falls back to these values.
        policyId,
        title: policyTitle,
        controlCodes, frameworks, templateId,
        additionalInstructions: instructions.trim() || undefined,
        quickMode: quick,
      })
      const body = res?.data?.data ?? res?.data ?? res
      setResult(body)
      if (body?.warnings?.length) toast('Generated with notes — see below', { icon: '⚠️' })
    } catch (e) {
      toast.error(e?.response?.data?.error?.message || 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  const accept = () => {
    onAccept?.(result.contentHtml, result)
    if (result.interactionId) {
      aiApi.feedback({
        interactionId: result.interactionId,
        suggestionType: 'DRAFT', suggestionKey: result.title,
        decision: 'ACCEPTED', originalValue: result.contentHtml,
      }).catch(() => {})
    }
    onClose?.()
  }

  const score   = typeof profile?.score === 'number' ? profile.score : null
  const weak    = score != null && score < 50
  const partial = score != null && score >= 50 && score < 80

  return (
    <Modal open={open} onClose={onClose} size={hasCurrent ? 'xl' : 'lg'}
      title={hasCurrent ? 'Regenerate content with AI' : 'Draft content with AI'}
      subtitle={controlCodes.length
        ? `Grounded in this policy and ${controlCodes.length} linked control${controlCodes.length === 1 ? '' : 's'}`
        : 'No controls linked yet — the draft will be general'}
      footer={result ? (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Discard</Button>
          <Button variant="secondary" size="sm" onClick={generate}>Regenerate</Button>
          <Button variant="primary" size="sm" icon={Check} onClick={accept}>
            {hasCurrent ? 'Replace with this draft' : 'Use this draft'}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="sm" icon={Sparkles} loading={busy}
            loadingText="Generating…" onClick={generate}>
            Generate draft
          </Button>
        </div>
      )}
    >
      {/* ── input ── */}
      {!result && !busy && (
        <div className="space-y-3">
          {(weak || partial) && (
            <div className={cn('flex gap-2 rounded-ctl border p-2.5',
              weak ? 'border-status-warn-bd bg-status-warn-bg' : 'border-status-info-bd bg-status-info-bg')}>
              <AlertTriangle size={14} className={cn('mt-0.5 shrink-0',
                weak ? 'text-status-warn-fg' : 'text-status-info-fg')} />
              <div className={cn('text-xs', weak ? 'text-status-warn-fg' : 'text-status-info-fg')}>
                Your AI organisation profile is {score}% complete.{' '}
                {weak
                  ? 'Until it is filled in, the draft will say [[ORGANISATION NAME]] and [[SECURITY OFFICER]] instead of your company, your tools and the people who own security.'
                  : 'A few more details will make the draft name your systems and owners instead of leaving placeholders.'}
                <Link to="/settings?tab=ai-profile" onClick={onClose} className="ml-1 font-medium underline">
                  Complete the profile
                </Link>
              </div>
            </div>
          )}

          {hasCurrent && (
            <div className="flex gap-2 rounded-ctl border border-border bg-surface p-2.5">
              <Info size={14} className="mt-0.5 shrink-0 text-text-muted" />
              <div className="text-xs text-text-secondary">
                This policy already has text. Nothing is lost if you replace it: the current
                draft is kept as a revision, and you can compare or restore it from History.
              </div>
            </div>
          )}

          {/* No title field. The policy already has one — see the class comment. */}
          <div className="rounded-ctl border border-border bg-surface px-3 py-2">
            <span className="block text-[10px] uppercase tracking-wide text-text-muted">Drafting content for</span>
            <span className="block text-sm font-medium text-text-primary">{policyTitle}</span>
            {(controlCodes.length > 0 || frameworks.length > 0) && (
              <span className="mt-0.5 block text-[11px] text-text-muted">
                {frameworks.join(', ')}
                {frameworks.length > 0 && controlCodes.length > 0 && ' · '}
                {controlCodes.length > 0 && `${controlCodes.length} control${controlCodes.length === 1 ? '' : 's'}`}
              </span>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-secondary">
              Anything specific to add <span className="text-text-muted">(optional)</span>
            </span>
            <textarea
              autoFocus rows={3} value={instructions} onChange={e => setInstr(e.target.value)}
              placeholder="e.g. we are fully remote, keep it under three pages"
              className="glass-field w-full rounded-ctl p-2 text-sm text-text-primary"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input type="checkbox" checked={quick} onChange={e => setQuick(e.target.checked)}
              className="accent-brand-500" />
            Quick mode — skip the review pass. Faster and cheaper, slightly rougher.
          </label>
        </div>
      )}

      {/* ── progress ── */}
      {busy && (
        <div className="space-y-2 py-6">
          {STAGES.map((s, i) => (
            <div key={s} className={cn(
              'flex items-center gap-2 text-xs transition-opacity',
              i < stage ? 'text-text-muted' : i === stage ? 'text-text-primary' : 'text-text-faint',
            )}>
              {i < stage
                ? <Check size={13} className="text-brand-ink" />
                : i === stage
                  ? <Loader2 size={13} className="animate-spin text-brand-ink" />
                  : <ChevronRight size={13} />}
              {s}
            </div>
          ))}
        </div>
      )}

      {/* ── result ── */}
      {result && (
        <div className="space-y-3">
          {result.warnings?.length > 0 && (
            <div className="rounded-ctl border border-status-warn-bd bg-status-warn-bg p-2.5">
              {result.warnings.map((w, i) => (
                <div key={i} className="flex gap-2 text-xs text-status-warn-fg">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />{w}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-[11px] text-text-muted">
            <span>{result.sections?.length || 0} sections</span>
            <span>{result.suggestedControls?.length || 0} control mappings</span>
            {result.groundedInRetrieval && <span>Grounded in your policy library</span>}
            {result.model && <span>{result.model}</span>}
          </div>

          {hasCurrent && (
            <div className="flex gap-1">
              {[['preview', 'New draft'], ['compare', 'Compare with current']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setView(k)}
                  className={cn('px-2.5 py-1 rounded-ctl text-xs transition-colors',
                    view === k
                      ? 'bg-brand-500/10 text-brand-ink border border-brand-500/30'
                      : 'text-text-muted hover:text-text-secondary border border-transparent')}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {view === 'compare' && hasCurrent ? (
            <div className="max-h-[45vh] overflow-y-auto rounded-ctl border border-border bg-surface p-3">
              <PolicyDiffView beforeHtml={currentHtml} afterHtml={result.contentHtml}
                beforeLabel="Current draft" afterLabel="New draft" />
            </div>
          ) : (
            <div className="policy-content max-h-[45vh] overflow-y-auto rounded-ctl border border-border bg-surface p-4"
              dangerouslySetInnerHTML={{ __html: result.contentHtml }} />
          )}
        </div>
      )}
    </Modal>
  )
}