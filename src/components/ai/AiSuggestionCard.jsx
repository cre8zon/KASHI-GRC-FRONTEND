import { useEffect, useRef, useState } from 'react'
import { Check, X, Pencil, Flag, Sparkles } from 'lucide-react'
import { aiApi } from '../../api/ai.api'
import { cn } from '../../lib/cn'

/**
 * AiSuggestionCard — renders one suggestion and captures the verdict.
 *
 * ── THIS COMPONENT IS THE FLYWHEEL'S INTAKE ──────────────────────────────────
 * Every AI surface in the product should render suggestions through this, not
 * through bespoke markup, because this is what guarantees the verdict is
 * recorded. Four things are captured that cannot be reconstructed afterwards:
 *
 *   1. ACCEPT / REJECT — the acceptance rate, the headline quality metric
 *   2. THE EDIT — what the human changed it to. The highest-signal data in the
 *      system: the model was wanted but wrong, and the delta is the correction.
 *   3. TIME TO DECIDE — an instant reject reads very differently from a
 *      considered one, and the difference tells you whether the suggestion was
 *      wrong or merely unconvincing.
 *   4. DISMISSAL — a suggestion nobody engaged with failed quietly, which is
 *      worse than one that was rejected. IGNORED is reported on unmount.
 *
 * None of this can be added retroactively. That is the whole argument for
 * building it before the volume justifies it.
 */
export default function AiSuggestionCard({
  interactionId,
  suggestionType,
  suggestionKey,
  title,
  value,
  rationale,
  confidence,
  editable = false,
  onAccept,
  onReject,
  className,
}) {
  const [decided, setDecided]   = useState(false)
  const [editing, setEditing]   = useState(false)
  const [draft, setDraft]       = useState(value ?? '')
  const shownAt                 = useRef(Date.now())
  const decidedRef              = useRef(false)

  /*
   * Dismissal tracking. If the card unmounts undecided, the user navigated away
   * — record IGNORED. Excluding these from the denominator is the standard way
   * an acceptance dashboard ends up reporting 90% on a feature nobody uses.
   */
  useEffect(() => {
    return () => {
      if (decidedRef.current || !interactionId) return
      aiApi.feedback({
        interactionId,
        suggestionType,
        suggestionKey,
        decision: 'IGNORED',
        originalValue: value,
        timeToDecideSeconds: Math.round((Date.now() - shownAt.current) / 1000),
      }).catch(() => { /* never block navigation on telemetry */ })
    }
  }, [interactionId, suggestionType, suggestionKey, value])

  const send = (decision, finalValue) => {
    decidedRef.current = true
    setDecided(true)
    aiApi.feedback({
      interactionId,
      suggestionType,
      suggestionKey,
      decision,
      originalValue: value,
      finalValue,
      timeToDecideSeconds: Math.round((Date.now() - shownAt.current) / 1000),
    }).catch(() => { /* the user's action already succeeded locally */ })
  }

  const accept = () => {
    // The service reclassifies to ACCEPTED_WITH_EDIT when the text differs, and
    // computes the edit ratio. Send both values and let it decide.
    const changed = editing && draft !== value
    send('ACCEPTED', changed ? draft : undefined)
    onAccept?.(changed ? draft : value)
  }

  const reject = (reasonCode) => {
    decidedRef.current = true
    setDecided(true)
    aiApi.feedback({
      interactionId,
      suggestionType,
      suggestionKey,
      decision: reasonCode === 'HALLUCINATED' ? 'FLAGGED_WRONG' : 'REJECTED',
      originalValue: value,
      reasonCode,
      timeToDecideSeconds: Math.round((Date.now() - shownAt.current) / 1000),
    }).catch(() => {})
    onReject?.(reasonCode)
  }

  if (decided) return null

  return (
    <div className={cn(
      'rounded-ctl border border-border bg-surface-raised p-3 shadow-elevated',
      className,
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
          <Sparkles className="h-3.5 w-3.5 text-brand-500" />
          {title}
        </div>

        {/*
          Confidence is shown because a suggestion presented without one invites
          uniform trust. A visible 0.6 makes a reviewer read it properly, which
          is the behaviour you want.
        */}
        {typeof confidence === 'number' && (
          <span className={cn(
            'rounded-ctl px-1.5 py-0.5 text-[10px] font-medium',
            confidence >= 0.8 ? 'bg-status-pass-bg text-status-pass-fg'
              : confidence >= 0.6 ? 'bg-status-warn-bg text-status-warn-fg'
              : 'bg-surface-overlay text-text-secondary',
          )}>
            {Math.round(confidence * 100)}% confident
          </span>
        )}
      </div>

      {editing ? (
        <textarea
          className="mt-2 w-full rounded-ctl border border-border bg-surface p-2 text-sm text-text-primary"
          rows={5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <div className="mt-2 whitespace-pre-wrap text-sm text-text-primary">{value}</div>
      )}

      {rationale && (
        <div className="mt-2 border-l-2 border-border pl-2 text-xs text-text-secondary">
          {rationale}
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5">
        <button
          onClick={accept}
          className="inline-flex h-7 items-center gap-1.5 rounded-ctl bg-brand-500 px-3 text-xs font-medium text-brand-900 hover:bg-brand-600"
        >
          <Check className="h-3.5 w-3.5" />
          {editing ? 'Accept edit' : 'Accept'}
        </button>

        {editable && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex h-7 items-center gap-1.5 rounded-ctl border border-border px-3 text-xs text-text-secondary hover:bg-surface-overlay"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        )}

        <button
          onClick={() => reject('NOT_APPLICABLE')}
          className="inline-flex h-7 items-center gap-1.5 rounded-ctl border border-border px-3 text-xs text-text-secondary hover:bg-surface-overlay"
        >
          <X className="h-3.5 w-3.5" />
          Reject
        </button>

        {/*
          A distinct control for "this is factually wrong". Separating it from an
          ordinary reject is what lets you find hallucinations in the data rather
          than inferring them from a rejection rate — and in a compliance product
          that distinction is the one that matters.
        */}
        <button
          onClick={() => reject('HALLUCINATED')}
          title="This is factually incorrect"
          className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-ctl px-2 text-xs text-text-secondary hover:bg-status-fail-bg hover:text-status-fail-fg"
        >
          <Flag className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
