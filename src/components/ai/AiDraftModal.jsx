import { useEffect, useState } from 'react'
import { Sparkles, ChevronRight, AlertTriangle, Loader2, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { aiApi } from '../../api/ai.api'
import { cn } from '../../lib/cn'

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
 * Output quality is bounded by AiOrgProfile. Below 50% complete the modal says
 * so before generating rather than after, because the alternative is a customer
 * concluding the AI is weak when the real answer is that nobody filled in the
 * form.
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
}) {
  const [instructions, setInstr]  = useState('')
  const [quick, setQuick]         = useState(false)
  const [busy, setBusy]           = useState(false)
  const [stage, setStage]         = useState(0)
  const [result, setResult]       = useState(null)
  const [profile, setProfile]     = useState(null)

  useEffect(() => {
    if (!open) return
    setResult(null); setStage(0); setBusy(false); setInstr('')
    aiApi.completeness().then(r => setProfile(r.data?.data ?? r.data)).catch(() => {})
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
      const body = res.data?.data ?? res.data
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

  const low = profile && profile.score < 50

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title="Draft content with AI"
      subtitle={controlCodes.length
        ? `Grounded in this policy and ${controlCodes.length} linked control${controlCodes.length === 1 ? '' : 's'}`
        : 'No controls linked yet — the draft will be general'}
      footer={result ? (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Discard</Button>
          <Button variant="secondary" size="sm" onClick={generate}>Regenerate</Button>
          <Button variant="primary" size="sm" icon={Check} onClick={accept}>
            Use this draft
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
          {low && (
            <div className="flex gap-2 rounded-ctl border border-status-warn-bd bg-status-warn-bg p-2.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-status-warn-fg" />
              <div className="text-xs text-status-warn-fg">
                Your organisation profile is {profile.score}% complete. The draft will
                be generic until it's filled in — it's what tells the AI your company
                name, cloud provider and who owns security.
                <a href="/settings/ai-profile" className="ml-1 underline">Complete it</a>
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
              i < stage ? 'text-text-muted' : i === stage ? 'text-text-primary' : 'text-text-muted/40',
            )}>
              {i < stage
                ? <Check size={13} className="text-brand-600" />
                : i === stage
                  ? <Loader2 size={13} className="animate-spin text-brand-500" />
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

          <div className="policy-content max-h-[45vh] overflow-y-auto rounded-ctl border border-border bg-surface p-4"
            dangerouslySetInnerHTML={{ __html: result.contentHtml }} />
        </div>
      )}
    </Modal>
  )
}