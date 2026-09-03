import { useState } from 'react'
import { Sparkles, Loader2, Plus, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { aiApi } from '../../api/ai.api'
import { cn } from '../../lib/cn'

/**
 * Gap analysis — what a framework expects that the policy does not say.
 *
 * ── WHERE THIS BELONGS IN THE FLOW ──────────────────────────────────────────
 * On the send-for-review action, not on the editor toolbar. A gap list is most
 * useful at the moment someone is about to hand the document to a reviewer —
 * that is when they still care about finding problems and have not yet spent
 * someone else's attention.
 *
 * ── SUGGESTED TEXT IS INSERTABLE, NOT AUTO-INSERTED ─────────────────────────
 * Each gap carries drop-in remediation text. Inserting it is one click and one
 * decision, per gap. Bulk-applying a list of AI-written clauses into a document
 * heading for approval is exactly the shortcut that makes the approval
 * meaningless.
 */
const SEV = {
  MISSING:   { label: 'Missing',   cls: 'bg-status-fail-bg text-status-fail-fg' },
  PARTIAL:   { label: 'Partial',   cls: 'bg-status-warn-bg text-status-warn-fg' },
  AMBIGUOUS: { label: 'Ambiguous', cls: 'bg-surface-overlay text-text-secondary' },
}

export default function AiGapPanel({ policyId, framework, controlCodes = [], onInsert }) {
  const [busy, setBusy]     = useState(false)
  const [result, setResult] = useState(null)
  const [open, setOpen]     = useState({})

  const run = async () => {
    setBusy(true)
    try {
      const res = await aiApi.gapAnalysis({ policyId, framework, controlCodes })
      setResult(res.data?.data ?? res.data)
    } catch (e) {
      toast.error(e?.response?.data?.error?.message || 'Gap analysis failed')
    } finally { setBusy(false) }
  }

  const cov = result?.coverageScore != null ? Math.round(result.coverageScore * 100) : null

  return (
    <div className="rounded-ctl border border-border bg-surface-raised">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
          <Sparkles size={13} className="text-brand-500" />
          Coverage against {framework}
        </div>
        <button onClick={run} disabled={busy}
          className="flex h-6 items-center gap-1 rounded-ctl px-2 text-[11px] text-brand-800 hover:bg-brand-500/10 disabled:opacity-50">
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          {result ? 'Re-check' : 'Check'}
        </button>
      </div>

      {busy && (
        <div className="flex items-center gap-2 px-3 py-6 text-xs text-text-secondary">
          <Loader2 size={13} className="animate-spin text-brand-500" />
          Comparing the policy against the control requirements…
        </div>
      )}

      {result && (
        <>
          {cov != null && (
            <div className="border-b border-border px-3 py-2.5">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[11px] text-text-secondary">Estimated coverage</span>
                <span className="text-sm font-semibold text-text-primary">{cov}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-inset">
                <div className={cn('h-full rounded-full transition-all',
                    cov >= 80 ? 'bg-status-pass-fg' : cov >= 50 ? 'bg-status-warn-fg' : 'bg-status-fail-fg')}
                  style={{ width: `${cov}%` }} />
              </div>
              {result.summary && (
                <p className="mt-2 text-[11px] leading-relaxed text-text-muted">{result.summary}</p>
              )}
            </div>
          )}

          {result.gaps?.length === 0 && (
            <p className="px-3 py-4 text-xs text-text-muted">No gaps found against the controls in scope.</p>
          )}

          <div className="divide-y divide-border">
            {result.gaps?.map((g, i) => {
              const sev = SEV[g.severity] || SEV.PARTIAL
              const isOpen = open[i]
              return (
                <div key={i} className="px-3 py-2.5">
                  <button onClick={() => setOpen(o => ({ ...o, [i]: !o[i] }))}
                    className="flex w-full items-start justify-between gap-2 text-left">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn('rounded-ctl px-1.5 py-px text-[9px] font-medium', sev.cls)}>
                          {sev.label}
                        </span>
                        <span className="reg-code text-xs font-medium text-text-primary">{g.controlCode}</span>
                      </div>
                      {g.controlTitle && (
                        <div className="mt-0.5 truncate text-[11px] text-text-secondary">{g.controlTitle}</div>
                      )}
                    </div>
                    <ChevronDown size={13} className={cn('mt-0.5 shrink-0 text-text-muted transition-transform',
                      isOpen && 'rotate-180')} />
                  </button>

                  {isOpen && (
                    <div className="mt-2 space-y-2 text-[11px] leading-relaxed">
                      {g.whatIsExpected && (
                        <div><span className="text-text-muted">Expected: </span>
                          <span className="text-text-secondary">{g.whatIsExpected}</span></div>
                      )}
                      {g.whatIsMissing && (
                        <div><span className="text-text-muted">Missing: </span>
                          <span className="text-text-secondary">{g.whatIsMissing}</span></div>
                      )}
                      {g.suggestedText && (
                        <div className="rounded-ctl bg-surface p-2">
                          <p className="text-text-primary">{g.suggestedText}</p>
                          <button onClick={() => onInsert?.(g.suggestedText, g)}
                            className="mt-1.5 flex h-6 items-center gap-1 rounded-ctl bg-brand-500 px-2 text-[10px] font-medium text-brand-ink hover:bg-brand-600">
                            <Plus size={10} /> Insert into policy
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}