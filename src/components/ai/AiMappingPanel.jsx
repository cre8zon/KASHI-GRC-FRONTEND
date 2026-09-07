import { useState } from 'react'
import { Sparkles, Check, X, Flag, Loader2, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { aiApi } from '../../api/ai.api'
import { cn } from '../../lib/cn'

/**
 * Suggested control mappings for a policy.
 *
 * ── EVERY SUGGESTION IS ACCEPTED INDIVIDUALLY ───────────────────────────────
 * A bulk "accept all" would be faster and is the wrong control. A mapping is a
 * compliance assertion that flows into coverage reporting and audit evidence;
 * the value of this feature is a human confirming each one, and a single button
 * that confirms twelve at once quietly removes the confirmation while keeping
 * the appearance of it.
 *
 * ── CONFIDENCE IS SHOWN, NOT HIDDEN ─────────────────────────────────────────
 * A suggestion with no confidence invites uniform trust. A visible 0.62 makes
 * the reviewer read it properly, which is the behaviour you want from someone
 * signing off a compliance claim.
 *
 * ── FLAG IS SEPARATE FROM REJECT ────────────────────────────────────────────
 * "Not applicable" and "this is factually wrong" are different signals. Keeping
 * them apart is what lets you find hallucinations in the feedback data rather
 * than inferring them from a rejection rate.
 */
export default function AiMappingPanel({ policyId, templateId, frameworks = [], onAccept, existingCodes = [] }) {
  const [busy, setBusy]         = useState(false)
  const [result, setResult]     = useState(null)
  const [decided, setDecided]   = useState({})

  const run = async () => {
    setBusy(true); setDecided({})
    try {
      const res = await aiApi.suggestMappings({ policyId, templateId, frameworks, maxSuggestions: 12 })
      setResult(res.data?.data ?? res.data)
    } catch (e) {
      toast.error(e?.response?.data?.error?.message || 'Could not suggest mappings')
    } finally { setBusy(false) }
  }

  const decide = (s, decision, reasonCode) => {
    setDecided(d => ({ ...d, [s.controlCode]: decision }))
    aiApi.feedback({
      interactionId: result.interactionId,
      suggestionType: 'CONTROL_MAPPING',
      suggestionKey: s.controlCode,
      decision, reasonCode,
      originalValue: `${s.controlCode} — ${s.rationale ?? ''}`,
    }).catch(() => {})
    if (decision === 'ACCEPTED') onAccept?.(s.controlCode, s)
  }

  const pending = (result?.suggestions ?? []).filter(
    s => !decided[s.controlCode] && !existingCodes.includes(s.controlCode))

  return (
    <div className="rounded-ctl border border-border bg-surface-raised">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
          <Sparkles size={13} className="text-brand-500" />
          Suggested control mappings
        </div>
        <button onClick={run} disabled={busy}
          className="flex h-6 items-center gap-1 rounded-ctl px-2 text-[11px] text-brand-800 hover:bg-brand-500/10 disabled:opacity-50">
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          {result ? 'Re-run' : 'Suggest'}
        </button>
      </div>

      {!result && !busy && (
        <p className="px-3 py-4 text-xs leading-relaxed text-text-muted">
          Reads the policy text and proposes controls from your library that it
          satisfies. Only codes that exist in your catalogue can be returned —
          anything else is rejected before you see it.
        </p>
      )}

      {busy && (
        <div className="flex items-center gap-2 px-3 py-6 text-xs text-text-secondary">
          <Loader2 size={13} className="animate-spin text-brand-500" />
          Reading the policy and comparing against your controls…
        </div>
      )}

      {result && (
        <>
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-[10px] text-text-muted">
            <ShieldCheck size={11} className="text-brand-600" />
            {result.candidatesConsidered} controls considered
            {templateId && ' from this audit template'}
          </div>

          {pending.length === 0 && (
            <p className="px-3 py-4 text-xs text-text-muted">
              {result.suggestions?.length
                ? 'All suggestions reviewed.'
                : 'No confident mappings found. That usually means the policy is broader than the controls in scope, not that something is wrong.'}
            </p>
          )}

          <div className="divide-y divide-border">
            {pending.map(s => (
              <div key={s.controlCode} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="reg-code text-xs font-medium text-text-primary">{s.controlCode}</span>
                      {typeof s.confidence === 'number' && (
                        <span className={cn(
                          'rounded-ctl px-1.5 py-px text-[9px] font-medium',
                          s.confidence >= 0.8 ? 'bg-status-pass-bg text-status-pass-fg'
                            : s.confidence >= 0.6 ? 'bg-status-warn-bg text-status-warn-fg'
                            : 'bg-surface-overlay text-text-muted',
                        )}>{Math.round(s.confidence * 100)}%</span>
                      )}
                    </div>
                    {s.controlTitle && (
                      <div className="mt-0.5 truncate text-[11px] text-text-secondary">{s.controlTitle}</div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button onClick={() => decide(s, 'ACCEPTED')} title="Accept"
                      className="flex h-6 w-6 items-center justify-center rounded-ctl text-brand-800 hover:bg-brand-500/10">
                      <Check size={13} />
                    </button>
                    <button onClick={() => decide(s, 'REJECTED', 'NOT_APPLICABLE')} title="Not applicable"
                      className="flex h-6 w-6 items-center justify-center rounded-ctl text-text-muted hover:bg-surface-overlay">
                      <X size={13} />
                    </button>
                    <button onClick={() => decide(s, 'FLAGGED_WRONG', 'HALLUCINATED')} title="This is wrong"
                      className="flex h-6 w-6 items-center justify-center rounded-ctl text-text-muted hover:bg-status-fail-bg hover:text-status-fail-fg">
                      <Flag size={12} />
                    </button>
                  </div>
                </div>

                {s.rationale && (
                  <p className="mt-1.5 border-l-2 border-border pl-2 text-[11px] leading-relaxed text-text-muted">
                    {s.rationale}
                  </p>
                )}
                {s.evidenceSection && (
                  <p className="mt-1 text-[10px] text-text-muted">Satisfied in: {s.evidenceSection}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}