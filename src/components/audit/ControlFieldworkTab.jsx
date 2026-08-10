/**
 * ControlFieldworkTab — single auditor work surface for a control instance.
 *
 * Replaces the Tests → open test → upload → back → Policies loop with one
 * accordion. Every write still lands on the TEST or POLICY instance, so the
 * test/policy detail screens remain the complete, self-contained record.
 *
 * Nothing here is a new endpoint. All calls already exist:
 *   GET  /v1/audit/control-instances/{id}/tests
 *   GET  /v1/audit/control-instances/{id}/policies
 *   GET  /v1/audit/test-instances/{id}                  (lazy, on row expand)
 *   GET  /v1/audit/policy-instances/{id}                (lazy, on row expand)
 *   PUT  /v1/audit/test-instances/{id}/result           { testResult, testerNotes, failureDetail, exceptionReason }
 *   PUT  /v1/audit/policy-instances/{id}/review         { reviewResult, auditorNotes }
 *   PUT  /v1/audit/policy-instances/{id}/controls/{controlId}/contribution
 *   PUT  /v1/audit/control-instances/{id}/test-result   { testResult, testNotes }
 *   EvidenceUploader entityType="AUDIT_TEST_INSTANCE"   (same store as TestInstanceEvidenceTab)
 *
 * Permission gates (vc.permissions):
 *   audit:control:record-test-result → record test results, upload work papers
 *   audit:policy:review              → set policy review result + contribution
 *
 * CASCADE WARNING: PUT /test-instances/{id}/result runs cascadeDeriveControlResults,
 * so a result set from this control also moves every other control mapped to that
 * test. Each row shows the blast radius before you save.
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, AlertTriangle, MinusCircle, FileText, FlaskConical,
  Zap, ChevronDown, ChevronRight, ExternalLink, Loader2, Users, Save,
  CornerDownRight, Info, Lock,
} from 'lucide-react'
import api              from '../../config/axios.config'
import EvidenceUploader from '../ui/EvidenceUploader'
import { cn }           from '../../lib/cn'
import toast            from 'react-hot-toast'

// ── Result vocabularies ───────────────────────────────────────────────────────
const TEST_RESULTS = [
  { value:'PASS',      label:'Pass',      icon:CheckCircle2,  fg:'text-status-pass-fg', bg:'bg-status-pass-bg', bd:'border-status-pass-bd' },
  { value:'FAIL',      label:'Fail',      icon:XCircle,       fg:'text-status-fail-fg', bg:'bg-status-fail-bg', bd:'border-status-fail-bd' },
  { value:'EXCEPTION', label:'Exception', icon:AlertTriangle, fg:'text-status-warn-fg', bg:'bg-status-warn-bg', bd:'border-status-warn-bd' },
  { value:'NOT_RUN',   label:'Not run',   icon:MinusCircle,   fg:'text-text-muted',     bg:'bg-surface-overlay', bd:'border-border' },
]
const TR = Object.fromEntries(TEST_RESULTS.map(r => [r.value, r]))

/**
 * The CONTROL conclusion is a different enum from the TEST result:
 *   AuditControlInstance.TestResult = EFFECTIVE | PARTIALLY_EFFECTIVE |
 *                                     INEFFECTIVE | NOT_APPLICABLE | NOT_TESTED
 *   AuditTestInstance.TestResult    = NOT_RUN | PASS | FAIL | EXCEPTION
 * NOT_TESTED is the initial state, not something you conclude, so it isn't
 * offered as a choice - it only appears as the current-state badge.
 */
const CONTROL_RESULTS = [
  { value:'EFFECTIVE',           label:'Effective',           icon:CheckCircle2,  fg:'text-status-pass-fg', bg:'bg-status-pass-bg', bd:'border-status-pass-bd' },
  { value:'PARTIALLY_EFFECTIVE', label:'Partially effective', icon:AlertTriangle, fg:'text-status-warn-fg', bg:'bg-status-warn-bg', bd:'border-status-warn-bd' },
  { value:'INEFFECTIVE',         label:'Ineffective',         icon:XCircle,       fg:'text-status-fail-fg', bg:'bg-status-fail-bg', bd:'border-status-fail-bd' },
  { value:'NOT_APPLICABLE',      label:'Not applicable',      icon:MinusCircle,   fg:'text-text-muted',     bg:'bg-surface-overlay', bd:'border-border' },
]
const CR = Object.fromEntries(CONTROL_RESULTS.map(r => [r.value, r]))
const CR_UNTESTED = { value:'NOT_TESTED', label:'Not tested', icon:MinusCircle, fg:'text-text-muted', bg:'bg-surface-overlay', bd:'border-border' }

const POLICY_RESULTS = [
  { value:'ADEQUATE',           label:'Adequate',   icon:CheckCircle2,  fg:'text-status-pass-fg', bg:'bg-status-pass-bg', bd:'border-status-pass-bd' },
  { value:'ADEQUATE_WITH_GAPS', label:'With gaps',  icon:AlertTriangle, fg:'text-status-warn-fg', bg:'bg-status-warn-bg', bd:'border-status-warn-bd' },
  { value:'INADEQUATE',         label:'Inadequate', icon:XCircle,       fg:'text-status-fail-fg', bg:'bg-status-fail-bg', bd:'border-status-fail-bd' },
  { value:'NOT_APPLICABLE',     label:'N/A',        icon:MinusCircle,   fg:'text-text-muted',     bg:'bg-surface-overlay', bd:'border-border' },
]
const PR = Object.fromEntries(POLICY_RESULTS.map(r => [r.value, r]))
const PR_FALLBACK = { label:'Not reviewed', icon:MinusCircle, fg:'text-text-muted', bg:'bg-surface-overlay', bd:'border-border' }

const CONTRIBUTIONS = [
  { value:'SATISFIES', label:'Satisfies', fg:'text-status-pass-fg', bg:'bg-status-pass-bg' },
  { value:'GAPS',      label:'Gaps',      fg:'text-status-warn-fg', bg:'bg-status-warn-bg' },
  { value:'PENDING',   label:'Pending',   fg:'text-text-muted',     bg:'bg-surface-overlay' },
]
const CB = Object.fromEntries(CONTRIBUTIONS.map(c => [c.value, c]))

// ── Small shared pieces ───────────────────────────────────────────────────────
function ResultBadge({ cfg }) {
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium border shrink-0',
      cfg.fg, cfg.bg, cfg.bd)}>
      <Icon size={8} />{cfg.label}
    </span>
  )
}

/**
 * Segmented result selector. Deliberately always visible — the old picker was
 * opacity-0 until hover, which made the fastest path in the product invisible.
 */
function ResultSegmented({ options, value, onChange, disabled, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Result">
        {options.map(opt => {
          const Icon = opt.icon
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={cn(
                'inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-ctl border font-medium transition-colors',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                active ? cn(opt.fg, opt.bg, opt.bd)
                       : 'text-text-muted bg-surface border-border hover:bg-surface-overlay'
              )}
            >
              <Icon size={9} />{opt.label}
            </button>
          )
        })}
      </div>
      {hint && <p className="text-[9px] text-text-muted">{hint}</p>}
    </div>
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

/** Read-only snapshot text (procedure, evidence guidance) — collapses long bodies. */
function SnapshotBlock({ icon: Icon, label, body }) {
  if (!body) return null
  return (
    <div className="rounded-ctl border border-border/50 bg-surface-overlay/30 px-2.5 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={9} className="text-text-muted shrink-0" />
        <span className="text-[9px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      </div>
      <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  )
}

function RowShell({ open, onToggle, badge, children, header, disabled }) {
  return (
    <div className={cn(
      'border-b border-border/20 last:border-0',
      open && 'bg-surface-overlay/20'
    )}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={open}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2.5 text-left group',
          'hover:bg-surface-overlay/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500',
          'disabled:cursor-default'
        )}
      >
        {open
          ? <ChevronDown  size={11} className="text-text-muted shrink-0" />
          : <ChevronRight size={11} className="text-text-muted shrink-0" />}
        <div className="flex-1 min-w-0">{header}</div>
        {badge}
      </button>
      {open && <div className="px-3 pb-4 pt-1 pl-8">{children}</div>}
    </div>
  )
}

function ExpandSkeleton() {
  return (
    <div className="flex items-center gap-2 py-4 text-[11px] text-text-muted">
      <Loader2 size={11} className="animate-spin" />Loading…
    </div>
  )
}

// ── Test row ──────────────────────────────────────────────────────────────────
function TestRow({ row, controlInstanceId, open, onToggle, onSaveNext, canRecord, isLast }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const testInstanceId = row.testInstanceId

  // /control-instances/{id}/tests now carries the procedure, guidance, notes and
  // affected-control count, so expanding a row costs nothing. The previous lazy
  // GET /v1/audit/test-instances/{id} was measured at 1.6-1.8s per open.
  const detail = row
  const isLoading = false

  const [result,    setResult]    = useState(null)
  const [notes,     setNotes]     = useState(null)
  const [failure,   setFailure]   = useState(null)
  const [exception, setException] = useState(null)

  // Seed local draft from the server once the detail lands, without clobbering
  // edits the user has already made in this session.
  useEffect(() => {
    if (!open || isLoading) return
    setResult(p    => p ?? (detail.testResult || 'NOT_RUN'))
    setNotes(p     => p ?? (detail.testerNotes ?? ''))
    setFailure(p   => p ?? (detail.failureDetail ?? ''))
    setException(p => p ?? (detail.exceptionReason ?? ''))
  }, [open, isLoading, detail.testResult, detail.testerNotes, detail.failureDetail, detail.exceptionReason])

  const affected = row.affectedControlCount ?? null
  const cfg      = TR[row.testResult] || TR.NOT_RUN
  const automated = row.automationTypeSnapshot === 'AUTOMATED'

  const dirty =
    result    !== (detail.testResult     || 'NOT_RUN') ||
    notes     !== (detail.testerNotes    ?? '')        ||
    failure   !== (detail.failureDetail  ?? '')        ||
    exception !== (detail.exceptionReason?? '')

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => api.put(`/v1/audit/test-instances/${testInstanceId}/result`, {
      testResult:      result,
      testerNotes:     notes ?? '',
      failureDetail:   result === 'FAIL'      ? (failure   ?? '') : '',
      exceptionReason: result === 'EXCEPTION' ? (exception ?? '') : '',
    }),
    onSuccess: (res) => {
      const n = res?.data?.data?.affectedControls ?? res?.data?.affectedControls ?? affected
      toast.success(n > 1 ? `Result saved — ${n} controls updated` : 'Result saved')
      qc.invalidateQueries({ queryKey: ['ctrl-inst-tests', controlInstanceId] })
      qc.invalidateQueries({ queryKey: ['fieldwork-tests', controlInstanceId] })
      qc.invalidateQueries({ queryKey: ['module-entity'] })
    },
    onError: e => toast.error(e?.response?.data?.message || 'Could not save the result'),
  })

  const header = (
    <>
      <div className="flex items-center gap-1.5 mb-0.5">
        {automated && <Zap size={9} className="text-brand-ink shrink-0" aria-label="Automated test" />}
        <span className="font-mono text-[9px] text-brand-ink shrink-0">{row.testRefSnapshot}</span>
        {row.isRequired
          ? <span className="text-[8px] text-status-fail-fg shrink-0">required</span>
          : <span className="text-[8px] text-text-muted shrink-0">advisory</span>}
      </div>
      <p className="text-[11px] text-text-primary truncate">{row.testNameSnapshot}</p>
      {row.runAt && (
        <p className="text-[9px] text-text-muted mt-0.5">
          {row.runBySystem ? 'automated' : `recorded by user #${row.runByUserId}`}
          {' · '}{new Date(row.runAt).toLocaleDateString()}
        </p>
      )}
    </>
  )

  return (
    <RowShell open={open} onToggle={onToggle} badge={<ResultBadge cfg={cfg} />} header={header}>
      {isLoading ? <ExpandSkeleton /> : (
        <div className="flex flex-col gap-3 max-w-2xl">

          <SnapshotBlock icon={FlaskConical} label="Test procedure"  body={detail.testProcedureSnapshot} />
          <SnapshotBlock icon={Info}         label="Evidence required" body={detail.evidenceGuidanceSnapshot} />

          {detail.automationRawResult && (
            <SnapshotBlock icon={Zap} label="Automation output" body={detail.automationRawResult} />
          )}

          {/* Work papers — identical entity binding to TestInstanceEvidenceTab,
              so anything attached here appears on the test detail screen. */}
          <Field
            label="Work papers"
            hint="Stored on the test — visible on the test detail screen, not to auditees."
          >
            <EvidenceUploader
              entityType="AUDIT_TEST_INSTANCE"
              entityId={testInstanceId}
              canUpload={canRecord}
              canRemove={canRecord}
              compact
              emptyLabel="No work papers attached yet"
            />
          </Field>

          {canRecord ? (
            <>
              <Field label="Result">
                <ResultSegmented
                  options={TEST_RESULTS}
                  value={result}
                  onChange={setResult}
                  disabled={isPending}
                  hint={affected > 1
                    ? `Applies to ${affected} controls covered by this test.`
                    : undefined}
                />
              </Field>

              <Field
                label="Tester notes"
                hint="Recorded on the test — shared across every control it covers."
              >
                <Notes
                  value={notes}
                  onChange={setNotes}
                  disabled={isPending}
                  placeholder="What you tested, sample size, how you concluded…"
                />
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
                <button
                  type="button"
                  disabled={isPending || !dirty}
                  onClick={() => save()}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-ctl',
                    'bg-brand-500/15 text-brand-ink border border-brand-500/30 hover:bg-brand-500/25',
                    'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500',
                    'disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                >
                  {isPending ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                  Save
                </button>

                {!isLast && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => { if (dirty) save(); onSaveNext() }}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-ctl',
                      'bg-surface border border-border text-text-secondary hover:bg-surface-overlay',
                      'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500',
                      'disabled:opacity-40'
                    )}
                  >
                    <CornerDownRight size={10} />Save and next test
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => navigate(`/module/audit_test_instance/${testInstanceId}`)}
                  className="ml-auto inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-brand-ink"
                >
                  Open test<ExternalLink size={9} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <Field label="Result"><ResultBadge cfg={cfg} /></Field>
              {detail.testerNotes && (
                <SnapshotBlock icon={Info} label="Tester notes" body={detail.testerNotes} />
              )}
            </div>
          )}
        </div>
      )}
    </RowShell>
  )
}

// ── Policy row ────────────────────────────────────────────────────────────────
function PolicyRow({ row, controlInstanceId, open, onToggle, onSaveNext, canReview, isLast }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const policyInstanceId = row.policyInstanceId

  // Served entirely from /control-instances/{id}/policies — no detail fetch.
  const detail = row
  const isLoading = false

  const [review,       setReview]       = useState(null)
  const [auditorNotes, setAuditorNotes] = useState(null)
  const [contribution, setContribution] = useState(null)

  useEffect(() => {
    if (!open || isLoading) return
    setReview(p       => p ?? (detail.reviewResult || 'NOT_APPLICABLE'))
    setAuditorNotes(p => p ?? (detail.auditorNotes ?? ''))
    setContribution(p => p ?? (row.reviewContribution || 'PENDING'))
  }, [open, isLoading, detail.reviewResult, detail.auditorNotes, row.reviewContribution])

  const cfg = PR[row.reviewResult] || PR_FALLBACK

  const { mutate: saveReview, isPending: savingReview } = useMutation({
    mutationFn: () => api.put(`/v1/audit/policy-instances/${policyInstanceId}/review`, {
      reviewResult: review,
      auditorNotes: auditorNotes ?? '',
    }),
    onSuccess: () => {
      toast.success(review === 'INADEQUATE'
        ? 'Review saved — a policy finding was raised'
        : 'Review saved')
      qc.invalidateQueries({ queryKey: ['ctrl-inst-policies', controlInstanceId] })
      qc.invalidateQueries({ queryKey: ['fieldwork-policies', controlInstanceId] })
    },
    onError: e => toast.error(e?.response?.data?.message || 'Could not save the review'),
  })

  const { mutate: saveContribution, isPending: savingContribution } = useMutation({
    mutationFn: (c) => api.put(
      `/v1/audit/policy-instances/${policyInstanceId}/controls/${controlInstanceId}/contribution`,
      { contribution: c }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ctrl-inst-policies', controlInstanceId] })
      qc.invalidateQueries({ queryKey: ['fieldwork-policies', controlInstanceId] })
    },
    onError: e => toast.error(e?.response?.data?.message || 'Could not save the contribution'),
  })

  const busy = savingReview || savingContribution
  const reviewDirty =
    review       !== (detail.reviewResult || 'NOT_APPLICABLE') ||
    auditorNotes !== (detail.auditorNotes ?? '')

  const header = (
    <>
      <div className="flex items-center gap-1.5 mb-0.5">
        <FileText size={9} className="text-text-muted shrink-0" />
        <span className="font-mono text-[9px] text-brand-ink shrink-0">{row.policyRefSnapshot}</span>
        {row.versionSnapshot && (
          <span className="text-[9px] text-text-muted shrink-0">v{row.versionSnapshot}</span>
        )}
      </div>
      <p className="text-[11px] text-text-primary truncate">{row.titleSnapshot}</p>
    </>
  )

  const badge = (
    <div className="flex items-center gap-1.5 shrink-0">
      {(() => {
        const c = CB[row.reviewContribution] || CB.PENDING
        return <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', c.fg, c.bg)}>{c.label}</span>
      })()}
      <ResultBadge cfg={cfg} />
    </div>
  )

  return (
    <RowShell open={open} onToggle={onToggle} badge={badge} header={header}>
      {isLoading ? <ExpandSkeleton /> : (
        <div className="flex flex-col gap-3 max-w-2xl">

          <SnapshotBlock icon={FileText} label="Policy content" body={detail.contentBodySnapshot} />
          {detail.externalUrlSnapshot && (
            <a href={detail.externalUrlSnapshot} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-brand-ink hover:underline w-fit">
              Open the policy document<ExternalLink size={9} />
            </a>
          )}

          {canReview ? (
            <>
              <Field
                label="Contribution to this control"
                hint="Scoped to this control only — other controls this policy covers are unaffected."
              >
                <div className="flex flex-wrap items-center gap-1">
                  {CONTRIBUTIONS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      disabled={busy}
                      onClick={() => { setContribution(c.value); saveContribution(c.value) }}
                      className={cn(
                        'text-[10px] px-2 py-1 rounded-ctl border font-medium transition-colors',
                        'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 disabled:opacity-40',
                        c.value === contribution
                          ? cn(c.fg, c.bg, 'border-transparent')
                          : 'text-text-muted bg-surface border-border hover:bg-surface-overlay'
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field
                label="Policy review result"
                hint="Recorded on the policy — applies to every control it covers. Inadequate raises a policy finding."
              >
                <ResultSegmented
                  options={POLICY_RESULTS}
                  value={review}
                  onChange={setReview}
                  disabled={busy}
                />
              </Field>

              <Field label="Auditor notes">
                <Notes
                  value={auditorNotes}
                  onChange={setAuditorNotes}
                  disabled={busy}
                  placeholder="Whether the policy is current and satisfies the requirement…"
                />
              </Field>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy || !reviewDirty}
                  onClick={() => saveReview()}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-ctl',
                    'bg-brand-500/15 text-brand-ink border border-brand-500/30 hover:bg-brand-500/25',
                    'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500',
                    'disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                >
                  {savingReview ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                  Save review
                </button>

                {!isLast && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { if (reviewDirty) saveReview(); onSaveNext() }}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-ctl',
                      'bg-surface border border-border text-text-secondary hover:bg-surface-overlay',
                      'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 disabled:opacity-40'
                    )}
                  >
                    <CornerDownRight size={10} />Save and next policy
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => navigate(`/module/audit_policy_instance/${policyInstanceId}`)}
                  className="ml-auto inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-brand-ink"
                >
                  Open policy<ExternalLink size={9} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <Field label="Review result"><ResultBadge cfg={cfg} /></Field>
              {detail.auditorNotes && (
                <SnapshotBlock icon={Info} label="Auditor notes" body={detail.auditorNotes} />
              )}
            </div>
          )}
        </div>
      )}
    </RowShell>
  )
}

// ── Control conclusion ────────────────────────────────────────────────────────
function ConclusionBar({ controlInstanceId, control, tests, canRecord }) {
  const qc = useQueryClient()

  // NOT_TESTED is the untouched initial state, so it seeds as "nothing chosen"
  // rather than pre-selecting an option. Without this the Record button would
  // post the control's existing value back with no visible selection.
  const seed = (c) => (c?.testResult && c.testResult !== 'NOT_TESTED') ? c.testResult : null

  const [result, setResult] = useState(() => seed(control))
  const [notes,  setNotes]  = useState(control?.testNotes ?? '')
  const [openNotes, setOpenNotes] = useState(false)
  const [override,  setOverride]  = useState(false)

  useEffect(() => {
    setResult(seed(control))
    setNotes(control?.testNotes ?? '')
  }, [control?.testResult, control?.testNotes])

  const current    = CR[control?.testResult] ||
                     (control?.testResult === 'NOT_TESTED' ? CR_UNTESTED : null)
  const required   = tests.filter(t => t.isRequired)
  const outstanding = required.filter(t => !t.testResult || t.testResult === 'NOT_RUN')

  // AuditTestPolicySnapshotService.deriveControlResult() returns null only when a
  // control has NO required tests — that is the case the manual conclusion exists
  // for. When required tests DO exist, cascadeDeriveControlResults() recomputes and
  // saves the control result on every test-result write, so anything recorded here
  // is overwritten the next time any mapped test is touched.
  const isDerived = required.length > 0

  const { mutate: conclude, isPending } = useMutation({
    mutationFn: () => {
      // Guard as well as disable — a keyboard submit or a stale click must not
      // post a null result and silently write NOT_TESTED.
      // Derived controls: send the value already on the control so the note is
      // saved without changing a result that derivation owns.
      const payload = (isDerived && !override)
        ? (control?.testResult || 'NOT_TESTED')
        : result
      if (!payload) return Promise.reject(new Error('Choose a conclusion first'))
      return api.put(`/v1/audit/control-instances/${controlInstanceId}/test-result`, {
        testResult: payload,
        testNotes:  notes ?? '',
      })
    },
    onSuccess: () => {
      toast.success('Control conclusion recorded')
      qc.invalidateQueries({ queryKey: ['module-entity'] })
      qc.invalidateQueries({ queryKey: ['fieldwork-tests', controlInstanceId] })
    },
    onError: e => toast.error(e?.response?.data?.message || 'Could not record the conclusion'),
  })

  if (!canRecord) return null

  return (
    <div className="rounded-card border border-brand-500/25 bg-brand-500/5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[11px] font-semibold text-text-primary">Control conclusion</span>
        {current && (!result || isDerived) && <ResultBadge cfg={current} />}

        {isDerived && !override ? (
          <span className="text-[10px] text-text-muted">
            derived from {required.length} required {required.length === 1 ? 'test' : 'tests'}
          </span>
        ) : (
          <ResultSegmented
            options={CONTROL_RESULTS}
            value={result}
            onChange={setResult}
            disabled={isPending}
          />
        )}

        <button
          type="button"
          onClick={() => setOpenNotes(o => !o)}
          className="text-[10px] text-text-muted hover:text-brand-ink"
        >
          {openNotes ? 'Hide note' : 'Add a note'}
        </button>

        {isDerived && (
          <button
            type="button"
            onClick={() => { setOverride(o => !o); if (override) setResult(null) }}
            className="text-[10px] text-text-muted hover:text-brand-ink"
          >
            {override ? 'Cancel override' : 'Override'}
          </button>
        )}
        <button
          type="button"
          disabled={isPending || (!result && !(isDerived && !override))}
          title={(!result && !(isDerived && !override)) ? 'Choose a conclusion first' : undefined}
          onClick={() => conclude()}
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-ctl',
            'bg-brand-500/20 text-brand-ink border border-brand-500/40 hover:bg-brand-500/30',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          {isPending ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
          {(isDerived && !override) ? 'Save note' : 'Record conclusion'}
        </button>
      </div>

      {openNotes && (
        <div className="mt-2">
          <Notes
            value={notes}
            onChange={setNotes}
            rows={2}
            disabled={isPending}
            placeholder="Note on this control only — not shared with other controls."
          />
        </div>
      )}

      {isDerived && override && (
        <p className="text-[9px] text-status-warn-fg mt-2">
          This control's result is derived from its required tests. An override is
          replaced automatically the next time any mapped test result is recorded.
        </p>
      )}

      {isDerived && !override && (
        <p className="text-[9px] text-text-muted mt-2">
          Any fail makes this Ineffective, all pass makes it Effective. A result
          recorded on a shared test moves every control that test covers.
        </p>
      )}

      {outstanding.length > 0 && (
        <p className="text-[9px] text-text-muted mt-2">
          {outstanding.length} of {required.length} required tests still have no result.
        </p>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function ControlFieldworkTab({ controlInstanceId, entity, vc = {} }) {
  const perms       = vc.permissions || []
  const canRecord   = perms.includes('audit:control:record-test-result')
  const canReview   = perms.includes('audit:policy:review') || canRecord

  // openKey is 'test:{id}' | 'policy:{id}' | null — one row open at a time.
  const [openKey, setOpenKey] = useState(null)
  const containerRef = useRef(null)

  const { data: testsRes, isLoading: testsLoading } = useQuery({
    queryKey: ['fieldwork-tests', controlInstanceId],
    queryFn: () => api.get(`/v1/audit/control-instances/${controlInstanceId}/tests`),
    enabled: !!controlInstanceId,
  })
  const { data: polRes, isLoading: polLoading } = useQuery({
    queryKey: ['fieldwork-policies', controlInstanceId],
    queryFn: () => api.get(`/v1/audit/control-instances/${controlInstanceId}/policies`),
    enabled: !!controlInstanceId,
  })

  const unwrap = (d) => Array.isArray(d) ? d : (d?.data?.data || d?.data || [])
  const tests    = useMemo(() => unwrap(testsRes), [testsRes])
  const policies = useMemo(() => unwrap(polRes),   [polRes])

  const rowKeys = useMemo(() => [
    ...tests.map(t    => `test:${t.testInstanceId}`),
    ...policies.map(p => `policy:${p.policyInstanceId}`),
  ], [tests, policies])

  const step = useCallback((delta) => {
    setOpenKey(cur => {
      if (!rowKeys.length) return cur
      const i = cur ? rowKeys.indexOf(cur) : -1
      const next = i === -1 ? 0 : Math.min(rowKeys.length - 1, Math.max(0, i + delta))
      return rowKeys[next]
    })
  }, [rowKeys])

  // j / k move between rows. Ignored while typing so notes fields stay usable.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT' || e.target?.isContentEditable) return
      if (e.key === 'j') { e.preventDefault(); step(1)  }
      if (e.key === 'k') { e.preventDefault(); step(-1) }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [step])

  const toggle = (key) => setOpenKey(cur => (cur === key ? null : key))
  const advance = (key) => {
    const i = rowKeys.indexOf(key)
    setOpenKey(i >= 0 && i < rowKeys.length - 1 ? rowKeys[i + 1] : null)
  }

  // Tab visibility is configured in ui_layouts.role_access_json, not here.
  // This is only a content guard: test procedures are auditor methodology,
  // so they shouldn't render for someone who holds neither permission even
  // if the tab is reached anyway. Delete this block if you'd rather the
  // layout config be the single source of truth.
  if (!canRecord && !canReview) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-card border border-dashed border-border/60 px-4 py-8 flex flex-col items-center gap-2 text-center">
          <Lock size={18} className="text-text-muted opacity-40" />
          <p className="text-sm font-medium text-text-secondary">Fieldwork is for the audit team</p>
          <p className="text-xs text-text-muted max-w-xs leading-relaxed">
            Test procedures and work papers are prepared by the auditors. Use the{' '}
            <span className="font-medium text-text-primary">Evidence</span> tab to see
            what you need to upload.
          </p>
        </div>
      </div>
    )
  }

  if (testsLoading || polLoading) {
    return <div className="px-4 py-6 text-xs text-text-muted text-center">Loading fieldwork…</div>
  }

  if (!tests.length && !policies.length) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-card border border-dashed border-border/60 px-4 py-8 flex flex-col items-center gap-2 text-center">
          <FlaskConical size={20} className="text-text-muted opacity-40" />
          <p className="text-sm font-medium text-text-secondary">Nothing mapped to this control</p>
          <p className="text-xs text-text-muted max-w-xs leading-relaxed">
            Map tests or policies to this control from the engagement to start fieldwork.
          </p>
        </div>
      </div>
    )
  }

  const passed         = tests.filter(t => t.testResult === 'PASS').length
  const withResult     = tests.filter(t => t.testResult && t.testResult !== 'NOT_RUN').length
  const policyReviewed = policies.filter(p => p.reviewResult && p.reviewResult !== 'NOT_REVIEWED').length

  return (
    <div ref={containerRef} tabIndex={-1} className="flex flex-col gap-3 pb-6 max-w-3xl focus:outline-none">

      <ConclusionBar
        controlInstanceId={controlInstanceId}
        control={entity}
        tests={tests}
        canRecord={canRecord}
      />

      {/* Tests */}
      {tests.length > 0 && (
        <div className="border border-border rounded-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-surface-overlay/40">
            <FlaskConical size={10} className="text-text-secondary shrink-0" />
            <span className="text-[11px] font-semibold text-text-secondary">Tests</span>
            <span className="text-[9px] text-text-muted">
              {withResult}/{tests.length} recorded · {passed} passed
            </span>
            <span className="ml-auto text-[9px] text-text-muted hidden sm:inline">j / k to move</span>
          </div>
          <div>
            {tests.map((t, i) => (
              <TestRow
                key={t.testInstanceId}
                row={t}
                controlInstanceId={controlInstanceId}
                canRecord={canRecord}
                open={openKey === `test:${t.testInstanceId}`}
                onToggle={() => toggle(`test:${t.testInstanceId}`)}
                onSaveNext={() => advance(`test:${t.testInstanceId}`)}
                isLast={i === tests.length - 1 && policies.length === 0}
              />
            ))}
          </div>
        </div>
      )}

      {/* Policies */}
      {policies.length > 0 && (
        <div className="border border-border rounded-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-surface-overlay/40">
            <FileText size={10} className="text-text-secondary shrink-0" />
            <span className="text-[11px] font-semibold text-text-secondary">Policies</span>
            <span className="text-[9px] text-text-muted">
              {policyReviewed}/{policies.length} reviewed
            </span>
          </div>
          <div>
            {policies.map((p, i) => (
              <PolicyRow
                key={p.policyInstanceId}
                row={p}
                controlInstanceId={controlInstanceId}
                canReview={canReview}
                open={openKey === `policy:${p.policyInstanceId}`}
                onToggle={() => toggle(`policy:${p.policyInstanceId}`)}
                onSaveNext={() => advance(`policy:${p.policyInstanceId}`)}
                isLast={i === policies.length - 1}
              />
            ))}
          </div>
        </div>
      )}

      {canReview && !canRecord && (
        <div className="flex items-start gap-2 text-[10px] text-text-muted px-1">
          <Users size={11} className="shrink-0 mt-0.5" />
          <span>You can review policies here. Recording test results needs the assigned auditor role.</span>
        </div>
      )}
    </div>
  )
}

export default ControlFieldworkTab