/**
 * TestResultEditor — THE test-result editor: result, tester notes, failure
 * detail, exception reason. One component, used everywhere a test is worked:
 *
 *   • the control's Fieldwork tab (one row per mapped test)
 *   • the test's own detail / drawer (Evidence tab, under the work papers)
 *
 * Same fields, same endpoint (PUT /v1/audit/test-instances/{id}/result →
 * AuditFieldworkService on the server), same cache refresh — so a result typed
 * in Fieldwork is exactly what the test screen shows, and vice versa.
 *
 * The server writes only the fields it is sent; this editor always sends all
 * four, clearing failure detail / exception reason when the result no longer
 * calls for them (the behaviour Fieldwork already had).
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, Info, Loader2, Save } from 'lucide-react'
import api   from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast  from 'react-hot-toast'

export const TEST_RESULTS = [
  { value:'PASS',      label:'Pass',      icon:CheckCircle2,  fg:'text-status-pass-fg', bg:'bg-status-pass-bg', bd:'border-status-pass-bd' },
  { value:'FAIL',      label:'Fail',      icon:XCircle,       fg:'text-status-fail-fg', bg:'bg-status-fail-bg', bd:'border-status-fail-bd' },
  { value:'EXCEPTION', label:'Exception', icon:AlertTriangle, fg:'text-status-warn-fg', bg:'bg-status-warn-bg', bd:'border-status-warn-bd' },
  { value:'NOT_RUN',   label:'Not run',   icon:MinusCircle,   fg:'text-text-muted',     bg:'bg-surface-overlay', bd:'border-border' },
]
const TR = Object.fromEntries(TEST_RESULTS.map(r => [r.value, r]))

/**
 * Everything that shows a test or policy result, refreshed together after any
 * fieldwork write. Prefix keys, so every control's Fieldwork / Tests / Policies
 * list refreshes (a test result cascades to all its controls), plus every
 * open detail screen or drawer. ('module-entity', which Fieldwork used to
 * invalidate, is not a key anything reads — an open test drawer never
 * refreshed.)
 */
export function invalidateFieldwork(qc) {
  ;['fieldwork-tests', 'fieldwork-policies', 'ctrl-inst-tests', 'ctrl-inst-policies',
    'module-detail', 'drawer-entity', 'engagement-controls', 'test-inst-evidence-links']
    .forEach(k => qc.invalidateQueries({ queryKey: [k] }))
}

function ResultBadge({ value }) {
  const cfg = TR[value] || TR.NOT_RUN
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium border shrink-0',
      cfg.fg, cfg.bg, cfg.bd)}>
      <Icon size={8} />{cfg.label}
    </span>
  )
}

function Field({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-text-secondary">{label}</label>
      {children}
      {hint && <p className="text-[9px] text-text-muted">{hint}</p>}
    </div>
  )
}

function Notes({ value, onChange, placeholder, rows = 3, disabled }) {
  return (
    <textarea
      value={value ?? ''}
      rows={rows}
      disabled={disabled}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={cn(
        'w-full text-[11px] leading-relaxed rounded-ctl border border-border bg-surface',
        'px-2 py-1.5 text-text-primary placeholder:text-text-muted resize-y',
        'focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500',
        'disabled:opacity-50'
      )}
    />
  )
}

/**
 * @param testInstanceId  the test
 * @param test            server values: testResult, testerNotes, failureDetail,
 *                        exceptionReason, affectedControlCount, hasEvidence
 * @param canRecord       server's answer (ControlAccessGuard) — read-only when false
 * @param renderExtraActions ({ save, dirty, isPending }) => node — extra buttons
 *                        beside Save (Fieldwork adds "Save and next test")
 */
export function TestResultEditor({ testInstanceId, test = {}, canRecord, renderExtraActions }) {
  const qc = useQueryClient()
  const server = {
    result:    test.testResult      || 'NOT_RUN',
    notes:     test.testerNotes     ?? '',
    failure:   test.failureDetail   ?? '',
    exception: test.exceptionReason ?? '',
  }
  const [result,    setResult]    = useState(server.result)
  const [notes,     setNotes]     = useState(server.notes)
  const [failure,   setFailure]   = useState(server.failure)
  const [exception, setException] = useState(server.exception)

  const dirty =
    result !== server.result || notes !== server.notes ||
    failure !== server.failure || exception !== server.exception

  // Saved elsewhere (the other screen, a colleague) while open: follow the
  // server — but never overwrite what the user is typing.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    if (dirtyRef.current) return
    setResult(server.result); setNotes(server.notes)
    setFailure(server.failure); setException(server.exception)
  }, [server.result, server.notes, server.failure, server.exception]) // eslint-disable-line react-hooks/exhaustive-deps

  const affected = test.affectedControlCount ?? null

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => api.put(`/v1/audit/test-instances/${testInstanceId}/result`, {
      testResult:      result,
      testerNotes:     notes ?? '',
      failureDetail:   result === 'FAIL'      ? (failure   ?? '') : '',
      exceptionReason: result === 'EXCEPTION' ? (exception ?? '') : '',
    }),
    onSuccess: (res) => {
      const n = res?.affectedControls ?? res?.data?.affectedControls ?? res?.data?.data?.affectedControls ?? affected
      toast.success(n > 1 ? `Result saved — ${n} controls updated` : 'Result saved')
      invalidateFieldwork(qc)
    },
    onError: e => toast.error(e?.response?.data?.message || e?.message || 'Could not save the result'),
  })

  if (!canRecord) {
    return (
      <div className="flex flex-col gap-2">
        <Field label="Result"><ResultBadge value={server.result} /></Field>
        {server.notes && (
          <Field label="Tester notes">
            <p className="text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed">{server.notes}</p>
          </Field>
        )}
        {server.result === 'FAIL' && server.failure && (
          <Field label="Failure detail">
            <p className="text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed">{server.failure}</p>
          </Field>
        )}
        {server.result === 'EXCEPTION' && server.exception && (
          <Field label="Exception reason">
            <p className="text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed">{server.exception}</p>
          </Field>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The server refuses a PASS with nothing attached — say it before the 400. */}
      {test.hasEvidence === false && (
        <div className="rounded-card border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-start gap-2">
          <Info size={12} className="shrink-0 mt-0.5 text-amber-500" />
          <p className="text-[11px] leading-relaxed text-text-secondary">
            <span className="font-medium text-text-primary">No evidence attached.</span>{' '}
            Upload a work paper, or attach evidence on the control, before recording a pass.
          </p>
        </div>
      )}

      <Field label="Result" hint={affected > 1 ? `Applies to ${affected} controls covered by this test.` : undefined}>
        <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Result">
          {TEST_RESULTS.map(opt => {
            const Icon = opt.icon
            const active = opt.value === result
            return (
              <button key={opt.value} type="button" role="radio" aria-checked={active}
                disabled={isPending} onClick={() => setResult(opt.value)}
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border font-medium transition-colors',
                  'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  active ? cn(opt.fg, opt.bg, opt.bd)
                         : 'text-text-muted bg-surface border-border hover:bg-surface-overlay')}>
                <Icon size={9} />{opt.label}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Tester notes" hint="Recorded on the test — shared across every control it covers.">
        <Notes value={notes} onChange={setNotes} disabled={isPending}
          placeholder="What you tested, sample size, how you concluded…" />
      </Field>

      {result === 'FAIL' && (
        <Field label="Failure detail">
          <Notes value={failure} onChange={setFailure} rows={2} disabled={isPending}
            placeholder="What failed, and on which items…" />
        </Field>
      )}
      {result === 'EXCEPTION' && (
        <Field label="Exception reason">
          <Notes value={exception} onChange={setException} rows={2} disabled={isPending}
            placeholder="Why this is an exception rather than a failure…" />
        </Field>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button type="button" disabled={isPending || !dirty} onClick={() => save()}
          className={cn(
            'inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-ctl',
            'bg-brand-500/15 text-brand-ink border border-brand-500/30 hover:bg-brand-500/25',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500',
            'disabled:opacity-40 disabled:cursor-not-allowed')}>
          {isPending ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
          Save
        </button>
        {renderExtraActions?.({ save, dirty, isPending })}
      </div>
    </div>
  )
}

export default TestResultEditor