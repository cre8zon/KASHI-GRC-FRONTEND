/**
 * AuditTestsTab.jsx — Tests tab for the AuditControlDrawer.
 *
 * NEW FILE — drop into AuditControlDrawer as the Tests tab.
 *
 * ── WHAT IT SHOWS ─────────────────────────────────────────────────────────────
 *
 * Lists all AuditTestInstance rows linked to a specific AuditControlInstance.
 * For each test instance:
 *   - Test name + ref + automation type badge
 *   - Current result (PASS / FAIL / NOT_RUN / EXCEPTION) with colored badge
 *   - Last run timestamp + who ran it (or "Automated by KashiGuard")
 *   - Frequency badge (CONTINUOUS / QUARTERLY / ANNUAL etc.)
 *   - Inline result selector (AUDITOR only — for MANUAL/HYBRID tests)
 *   - Evidence guidance hint
 *   - Impact: "Affects N controls in this engagement"
 *
 * ── DERIVED STATUS ────────────────────────────────────────────────────────────
 * At the bottom shows the derived control result based on all tests:
 *   All required pass → EFFECTIVE
 *   Any required fail → INEFFECTIVE
 *   Mixed → PARTIALLY_EFFECTIVE
 *   None run → NOT_TESTED
 *
 * ── ROLE BEHAVIOUR ────────────────────────────────────────────────────────────
 * AUDITOR:     Can record result for MANUAL / HYBRID tests. Read-only for AUTOMATED.
 * AUDITEE:     Sees tests (transparency about what is being tested). Read-only.
 * ORGANIZATION: Read-only view of all tests.
 * SYSTEM:      Full access.
 */
import { useState }                     from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap, User, Clock, CheckCircle2, XCircle,
  Minus, AlertCircle, Calendar, RefreshCw,
  ChevronDown, Shield,
} from 'lucide-react'
import { auditTestsApi } from '../../api/auditTestsApi'
import { Button }        from '../../components/ui/Button'
import { Badge }         from '../../components/ui/Badge'
import { cn }            from '../../lib/cn'
import { formatDateTime } from '../../utils/format'
import toast             from 'react-hot-toast'

// ── Config ────────────────────────────────────────────────────────────────────

const RESULT_CFG = {
  PASS:      { label: 'Pass',      color: 'green',  icon: CheckCircle2 },
  FAIL:      { label: 'Fail',      color: 'red',    icon: XCircle      },
  NOT_RUN:   { label: 'Not run',   color: 'gray',   icon: Minus        },
  EXCEPTION: { label: 'Exception', color: 'amber',  icon: AlertCircle  },
}

const AUTO_COLOR = {
  AUTOMATED: 'blue',
  MANUAL:    'gray',
  HYBRID:    'purple',
}

const FREQ_LABEL = {
  CONTINUOUS: 'Continuous',
  DAILY:      'Daily',
  WEEKLY:     'Weekly',
  MONTHLY:    'Monthly',
  QUARTERLY:  'Quarterly',
  SEMI_ANNUAL:'Semi-annual',
  ANNUAL:     'Annual',
}

// ── Derived control result ────────────────────────────────────────────────────

function DerivedResultBanner({ tests }) {
  if (!tests?.length) return null

  const required = tests.filter(t => t.isRequired)
  if (!required.length) return null

  const anyFail   = required.some(t => t.testResult === 'FAIL')
  const anyNotRun = required.some(t => t.testResult === 'NOT_RUN')
  const allPass   = required.every(t => t.testResult === 'PASS')

  const { label, color } = anyFail   ? { label: 'Control → INEFFECTIVE (required test failed)',         color: 'red'   }
                         : allPass   ? { label: 'Control → EFFECTIVE (all required tests pass)',         color: 'green' }
                         : anyNotRun ? { label: 'Control → NOT_TESTED (required tests not yet run)',     color: 'gray'  }
                                     : { label: 'Control → PARTIALLY_EFFECTIVE (mixed results)',         color: 'amber' }

  const borderColor = {
    red:   'border-red-500/30 bg-red-500/5 text-red-400',
    green: 'border-green-500/30 bg-green-500/5 text-green-400',
    amber: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
    gray:  'border-border bg-surface-overlay text-text-muted',
  }[color]

  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-xs', borderColor)}>
      <Shield size={12} className="shrink-0" />
      <span className="font-medium">{label}</span>
    </div>
  )
}

// ── Test row ──────────────────────────────────────────────────────────────────

function TestRow({ test, engagementId, access }) {
  const qc              = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [saving,   setSaving]   = useState(false)

  const cfg  = RESULT_CFG[test.testResult ?? 'NOT_RUN'] ?? RESULT_CFG.NOT_RUN
  const Icon = cfg.icon
  const isAutomated   = test.automationTypeSnapshot === 'AUTOMATED'
  const canRecord     = access.canRecordTestResult && !isAutomated

  const handleResultChange = async (newResult) => {
    setSaving(true)
    try {
      await auditTestsApi.engagements.tests.recordResult(engagementId, test.id, {
        testResult: newResult,
      })
      qc.invalidateQueries({ queryKey: ['audit-control-tests', engagementId] })
      qc.invalidateQueries({ queryKey: ['audit-controls', engagementId] })
      qc.invalidateQueries({ queryKey: ['audit-stats',   engagementId] })
      toast.success(`Test result → ${newResult}`)
    } catch { toast.error('Failed to save test result') }
    finally  { setSaving(false) }
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 p-3 hover:bg-surface-overlay transition-colors text-left"
      >
        {/* Result icon */}
        <Icon size={15} className={cn('mt-0.5 shrink-0', {
          'text-green-400': test.testResult === 'PASS',
          'text-red-400':   test.testResult === 'FAIL',
          'text-amber-400': test.testResult === 'EXCEPTION',
          'text-text-muted': !test.testResult || test.testResult === 'NOT_RUN',
        })} />

        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {test.testRefSnapshot && (
              <span className="font-mono text-[10px] text-text-muted">{test.testRefSnapshot}</span>
            )}
            <span className="text-sm font-medium text-text-primary">{test.testNameSnapshot}</span>
            {test.isRequired && (
              <span className="text-[10px] text-red-400 font-medium">Required</span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge colorTag={AUTO_COLOR[test.automationTypeSnapshot] ?? 'gray'} size="sm">
              {test.automationTypeSnapshot === 'AUTOMATED' ? (
                <span className="flex items-center gap-1"><Zap size={9} /> Automated</span>
              ) : test.automationTypeSnapshot}
            </Badge>
            {test.frequencySnapshot && (
              <span className="text-[10px] text-text-muted">
                {FREQ_LABEL[test.frequencySnapshot] ?? test.frequencySnapshot}
              </span>
            )}
            <Badge colorTag={cfg.color} size="sm">{cfg.label}</Badge>
          </div>

          {/* Last run */}
          {test.runAt && (
            <p className="text-[10px] text-text-muted mt-1 flex items-center gap-1">
              <Clock size={9} />
              {test.runBySystem ? 'Automated' : 'Manual'} run {formatDateTime(test.runAt)}
              {!test.runBySystem && test.runByUserId && ` by user #${test.runByUserId}`}
            </p>
          )}
        </div>

        <ChevronDown size={13} className={cn(
          'text-text-muted shrink-0 transition-transform mt-0.5',
          expanded && 'rotate-180'
        )} />
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border p-3 flex flex-col gap-3 bg-surface-overlay/30">
          {/* Evidence guidance */}
          {test.evidenceGuidanceSnapshot && (
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                Evidence required
              </p>
              <p className="text-xs text-text-secondary leading-relaxed">
                {test.evidenceGuidanceSnapshot}
              </p>
            </div>
          )}

          {/* Test procedure */}
          {test.testProcedureSnapshot && (
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                Test procedure
              </p>
              <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
                {test.testProcedureSnapshot}
              </p>
            </div>
          )}

          {/* Failure detail */}
          {test.failureDetail && test.testResult === 'FAIL' && (
            <div className="p-2 rounded border border-red-500/30 bg-red-500/5">
              <p className="text-[10px] font-semibold text-red-400 mb-1">Failure detail</p>
              <p className="text-xs text-red-400/80">{test.failureDetail}</p>
            </div>
          )}

          {/* Tester notes */}
          {test.testerNotes && (
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                Tester notes
              </p>
              <p className="text-xs text-text-secondary">{test.testerNotes}</p>
            </div>
          )}

          {/* Automation raw result */}
          {test.automationRawResult && (
            <div className="p-2 rounded border border-border bg-surface-raised font-mono">
              <p className="text-[10px] font-semibold text-text-muted mb-1">Automation output</p>
              <p className="text-[10px] text-text-secondary whitespace-pre-wrap">
                {test.automationRawResult}
              </p>
            </div>
          )}

          {/* Result selector — AUDITOR only, MANUAL/HYBRID tests */}
          {canRecord && (
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                Record result
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(RESULT_CFG).filter(([v]) => v !== 'NOT_RUN').map(([value, c]) => {
                  const Ic = c.icon
                  return (
                    <button
                      key={value}
                      disabled={saving}
                      onClick={() => handleResultChange(value)}
                      className={cn(
                        'flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all',
                        test.testResult === value
                          ? { PASS: 'border-green-500/40 bg-green-500/10 text-green-400',
                              FAIL: 'border-red-500/40 bg-red-500/10 text-red-400',
                              EXCEPTION: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
                            }[value]
                          : 'border-border bg-surface-overlay text-text-muted hover:opacity-80',
                      )}
                    >
                      <Ic size={12} className="shrink-0" />
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Automated — read-only notice */}
          {isAutomated && (
            <div className="flex items-center gap-2 text-xs text-blue-400/80">
              <Zap size={11} />
              Result set automatically by KashiGuard — cannot be manually overridden
            </div>
          )}

          {/* Impact */}
          {test.affectedControlCount > 0 && (
            <p className="text-[10px] text-text-muted">
              This test affects {test.affectedControlCount} control{test.affectedControlCount !== 1 ? 's' : ''} in this engagement
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * @param {object}  props
 * @param {object}  props.control       AuditControlInstance
 * @param {string}  props.engagementId
 * @param {object}  props.access        from useAuditAccess
 */
export default function AuditTestsTab({ control, engagementId, access }) {
  const qc = useQueryClient()

  const { data: tests, isLoading } = useQuery({
    queryKey: ['audit-control-tests', engagementId, control?.id],
    queryFn:  () => auditTestsApi.engagements.tests.listForControl(engagementId, control?.id),
    enabled:  !!engagementId && !!control?.id,
    select:   d => d?.data ?? d ?? [],
  })

  const testList = Array.isArray(tests) ? tests : []

  return (
    <div className="flex flex-col gap-4">

      {/* Derived result banner */}
      <DerivedResultBanner tests={testList} />

      {/* Test list */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-lg bg-surface-overlay animate-pulse" />
          ))}
        </div>
      ) : testList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="w-10 h-10 rounded-full bg-surface-overlay flex items-center justify-center">
            <Zap size={16} className="text-text-muted" />
          </div>
          <div>
            <p className="text-sm text-text-muted">No tests linked to this control</p>
            <p className="text-xs text-text-muted mt-1">
              Tests are defined in the audit template library and linked to controls.
              Test result is recorded manually until KashiGuard automation is configured.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {testList.map(test => (
            <TestRow
              key={test.id}
              test={test}
              engagementId={engagementId}
              access={access}
            />
          ))}
        </div>
      )}

      {/* Summary counts */}
      {testList.length > 0 && (
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
          {[
            { label: 'Pass',    value: testList.filter(t => t.testResult === 'PASS').length,    color: 'text-green-400' },
            { label: 'Fail',    value: testList.filter(t => t.testResult === 'FAIL').length,    color: 'text-red-400'   },
            { label: 'Not run', value: testList.filter(t => t.testResult === 'NOT_RUN').length, color: 'text-text-muted' },
          ].map(s => (
            <div key={s.label} className="text-center p-2 rounded-lg border border-border bg-surface-overlay">
              <div className={cn('text-lg font-bold font-mono', s.color)}>{s.value}</div>
              <div className="text-[10px] text-text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Refresh */}
      <button
        onClick={() => qc.invalidateQueries({ queryKey: ['audit-control-tests', engagementId, control?.id] })}
        className="text-[10px] text-text-muted hover:text-text-secondary flex items-center gap-1 self-end transition-colors"
      >
        <RefreshCw size={10} /> Refresh
      </button>
    </div>
  )
}
