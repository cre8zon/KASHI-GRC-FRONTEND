import { useState } from 'react'
import { Sparkles, Check, X, RotateCw, StopCircle } from 'lucide-react'
import { aiApi } from '../../api/ai.api'
import { useAiStream } from '../../hooks/useAiStream'
import { cn } from '../../lib/cn'

/**
 * AI action inside the TipTap bubble menu.
 *
 * ── WHY IN THE BUBBLE MENU AND NOT A SIDEBAR ────────────────────────────────
 * The bubble menu already appears exactly when text is selected, which is the
 * only moment a rewrite makes sense. A sidebar button would need the user to
 * select text, look away, click, and look back — and the whole reason to stream
 * this action is that the user is watching the spot where the text changes.
 *
 * ── THE PREVIEW IS NOT OPTIONAL ─────────────────────────────────────────────
 * Output renders in a panel and replaces the selection only on Apply. Auto-
 * applying would mean the document changed under someone in a workflow that
 * ends in a formal approval — the edit has to be theirs, not something that
 * happened to them.
 *
 * Wire into PolicyEditorPage's existing <BubbleMenu>:
 *
 *   <BubbleMenu editor={editor} options={{ placement: 'top', offset: 6 }}>
 *     ...existing bold / italic / underline / link buttons...
 *     <AiBubbleAction editor={editor} policyId={policyId} disabled={isReadOnly} />
 *   </BubbleMenu>
 */
export default function AiBubbleAction({ editor, policyId, disabled }) {
  const [open, setOpen]       = useState(false)
  const [mode, setMode]       = useState(null)
  const [custom, setCustom]   = useState('')
  const [interactionId, setInteractionId] = useState(null)
  const { text, isStreaming, error, start, stop, reset } = useAiStream()

  if (!editor) return null

  const { from, to } = editor.state.selection
  const selected = editor.state.doc.textBetween(from, to, ' ')
  const tooShort = selected.trim().length < 15

  const MODES = [
    { key: 'SIMPLIFY',    label: 'Simplify',   hint: 'Plain English, same obligations' },
    { key: 'EXPAND',      label: 'Expand',     hint: 'More specific, no new obligations' },
    { key: 'FORMALISE',   label: 'Formalise',  hint: 'Register suited to an audited document' },
    { key: 'SHORTEN',     label: 'Shorten',    hint: 'Fewer words, every requirement kept' },
    { key: 'FIX_GRAMMAR', label: 'Fix grammar',hint: 'Grammar only, meaning untouched' },
    { key: 'CUSTOM',      label: 'Custom',     hint: 'Tell it what to change' },
  ]

  const run = (m) => {
    setMode(m)
    reset()
    // Two paragraphs either side is enough for tone matching; more is tokens
    // spent on context the model will not use.
    const doc = editor.state.doc
    const ctx = doc.textBetween(Math.max(0, from - 600), Math.min(doc.content.size, to + 600), ' ')

    start('/v1/ai/policies/rewrite/stream', {
      policyId,
      selectedText: selected,
      mode: m,
      customInstruction: m === 'CUSTOM' ? custom : undefined,
      surroundingContext: ctx,
    }, {
      onDone: () => {},
    })
  }

  const apply = () => {
    editor.chain().focus().deleteRange({ from, to }).insertContent(text).run()
    if (interactionId) {
      aiApi.feedback({
        interactionId, suggestionType: 'REWRITE', suggestionKey: mode,
        decision: 'ACCEPTED', originalValue: selected, finalValue: text,
      }).catch(() => {})
    }
    close()
  }

  const discard = () => {
    if (interactionId) {
      aiApi.feedback({
        interactionId, suggestionType: 'REWRITE', suggestionKey: mode,
        decision: 'REJECTED', originalValue: selected,
      }).catch(() => {})
    }
    close()
  }

  const close = () => { setOpen(false); setMode(null); setCustom(''); reset() }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled || tooShort}
        onClick={() => setOpen(o => !o)}
        title={tooShort ? 'Select a sentence or more' : 'Rewrite with AI'}
        className={cn(
          'flex h-7 items-center gap-1 rounded-ctl px-2 text-xs font-medium transition-colors',
          disabled || tooShort
            ? 'text-text-muted cursor-not-allowed'
            : 'text-brand-800 hover:bg-brand-500/10',
        )}
      >
        <Sparkles size={13} strokeWidth={2} />
        AI
      </button>

      {open && (
        <div className="glass-overlay absolute left-0 top-9 z-50 w-80 rounded-ctl p-2 shadow-elevated">
          {!mode && (
            <div className="space-y-0.5">
              {MODES.map(m => (
                <button
                  key={m.key}
                  onClick={() => m.key === 'CUSTOM' ? setMode('CUSTOM') : run(m.key)}
                  className="flex w-full flex-col items-start rounded-ctl px-2 py-1.5 text-left hover:bg-surface-overlay"
                >
                  <span className="text-xs font-medium text-text-primary">{m.label}</span>
                  <span className="text-[10px] text-text-muted">{m.hint}</span>
                </button>
              ))}
            </div>
          )}

          {mode === 'CUSTOM' && !text && !isStreaming && (
            <div className="space-y-2">
              <input
                autoFocus
                value={custom}
                onChange={e => setCustom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && custom.trim() && run('CUSTOM')}
                placeholder="e.g. make this specific to our AWS environment"
                className="glass-field h-8 w-full rounded-ctl px-2 text-xs text-text-primary"
              />
              <button
                onClick={() => custom.trim() && run('CUSTOM')}
                disabled={!custom.trim()}
                className="h-7 w-full rounded-ctl bg-brand-500 text-xs font-medium text-brand-ink disabled:opacity-40"
              >
                Rewrite
              </button>
            </div>
          )}

          {(text || isStreaming) && (
            <div className="space-y-2">
              <div className="max-h-56 overflow-y-auto rounded-ctl bg-surface p-2 text-xs leading-relaxed text-text-primary">
                {text}
                {isStreaming && (
                  <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-brand-500 align-middle" />
                )}
              </div>

              <div className="flex items-center gap-1">
                {isStreaming ? (
                  <button onClick={stop}
                    className="flex h-7 items-center gap-1 rounded-ctl border border-border px-2 text-xs text-text-secondary">
                    <StopCircle size={12} /> Stop
                  </button>
                ) : (
                  <>
                    <button onClick={apply}
                      className="flex h-7 items-center gap-1 rounded-ctl bg-brand-500 px-2.5 text-xs font-medium text-brand-ink hover:bg-brand-600">
                      <Check size={12} /> Apply
                    </button>
                    <button onClick={() => run(mode)}
                      className="flex h-7 items-center gap-1 rounded-ctl border border-border px-2 text-xs text-text-secondary hover:bg-surface-overlay">
                      <RotateCw size={12} /> Retry
                    </button>
                    <button onClick={discard}
                      className="ml-auto flex h-7 items-center rounded-ctl px-2 text-xs text-text-muted hover:bg-surface-overlay">
                      Discard
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {error && <div className="px-2 py-1 text-[11px] text-status-fail-fg">{error}</div>}

          {!text && !isStreaming && mode !== 'CUSTOM' && (
            <button onClick={close}
              className="mt-1 flex h-6 w-full items-center justify-center rounded-ctl text-[10px] text-text-muted hover:bg-surface-overlay">
              <X size={11} className="mr-1" /> Close
            </button>
          )}
        </div>
      )}
    </div>
  )
}