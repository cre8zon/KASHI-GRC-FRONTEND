/**
 * ControlInstanceTabsTab.jsx
 *
 * Tests tab and Policies tab for AUDIT_CONTROL_INSTANCE drawer.
 * Uses engagement-scoped instance endpoints (not library endpoints).
 *
 * Tests:    GET /v1/audit/engagements/{engagementId}/controls/{controlInstanceId}/tests
 * Policies: GET /v1/audit/engagements/{engagementId}/controls/{controlInstanceId}/policies
 */

import { useState, useMemo }  from 'react'
import { useQuery }           from '@tanstack/react-query'
import { Zap, FileText, ChevronRight,
         CheckCircle2, XCircle, MinusCircle, AlertTriangle } from 'lucide-react'
import api                    from '../../config/axios.config'
import { cn }                 from '../../lib/cn'

const fetchTests    = (eid, cid) => api.get(`/v1/audit/engagements/${eid}/controls/${cid}/tests`)
const fetchPolicies = (eid, cid) => api.get(`/v1/audit/engagements/${eid}/controls/${cid}/policies`)

// ── Result badge ──────────────────────────────────────────────────────────────
const TEST_RESULT_CFG = {
  PASS:        { label: 'Pass',       color: 'text-green-400', bg: 'bg-green-500/10',   icon: CheckCircle2 },
  FAIL:        { label: 'Fail',       color: 'text-red-400',   bg: 'bg-red-500/10',     icon: XCircle },
  EXCEPTION:   { label: 'Exception',  color: 'text-amber-400', bg: 'bg-amber-500/10',   icon: AlertTriangle },
  NOT_RUN:     { label: 'Not run',    color: 'text-text-muted',bg: 'bg-surface-overlay', icon: MinusCircle },
}

function ResultBadge({ result }) {
  const c = TEST_RESULT_CFG[result] || TEST_RESULT_CFG.NOT_RUN
  const Icon = c.icon
  return (
    <span className={cn('flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0', c.color, c.bg)}>
      <Icon size={8} />{c.label}
    </span>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function DetailPanel({ item, type, onClose }) {
  return (
    <div className="absolute inset-0 bg-surface z-20 flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
        <button onClick={onClose}
          className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface-overlay">
          <ChevronRight size={13} className="rotate-180" />
        </button>
        <div className="flex-1 min-w-0">
          {type === 'test' ? (
            <>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-mono text-[10px] text-brand-400">{item.testRefSnapshot}</span>
                <ResultBadge result={item.testResult} />
                {item.isRequired && (
                  <span className="text-[9px] text-red-400 bg-red-500/10 px-1 rounded">Required</span>
                )}
              </div>
              <p className="text-sm font-medium text-text-primary truncate">{item.testNameSnapshot}</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-mono text-[10px] text-brand-400">{item.policyRefSnapshot}</span>
                {item.reviewContribution && (
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded',
                    item.reviewContribution === 'SATISFIES' ? 'text-green-400 bg-green-500/10' :
                    item.reviewContribution === 'GAPS'      ? 'text-red-400 bg-red-500/10' :
                    'text-text-muted bg-surface-overlay')}>
                    {item.reviewContribution}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-text-primary truncate">{item.policyTitleSnapshot}</p>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {type === 'test' ? (
          <>
            {item.descriptionSnapshot    && <F label="Description"      value={item.descriptionSnapshot} multi />}
            {item.testProcedureSnapshot  && <F label="Test procedure"   value={item.testProcedureSnapshot} multi />}
            {item.evidenceGuidanceSnapshot && <F label="Evidence required" value={item.evidenceGuidanceSnapshot} multi />}
            {item.testerNotes            && <F label="Tester notes"     value={item.testerNotes} multi />}
            {item.failureDetail          && <F label="Failure detail"   value={item.failureDetail} multi red />}
            {item.automationTypeSnapshot && <F label="Automation type"  value={item.automationTypeSnapshot} />}
            {item.frequencySnapshot      && <F label="Frequency"        value={item.frequencySnapshot} />}
            {item.runAt                  && <F label="Last run"         value={new Date(item.runAt).toLocaleString()} />}
          </>
        ) : (
          <>
            {item.descriptionSnapshot    && <F label="Description"      value={item.descriptionSnapshot} multi />}
            {item.mappingType            && <F label="Mapping type"     value={item.mappingType} />}
            {item.mappingNote            && <F label="Note"             value={item.mappingNote} />}
          </>
        )}
      </div>
    </div>
  )
}

function F({ label, value, multi, red }) {
  return (
    <div>
      <p className="text-[9px] text-text-muted uppercase tracking-wide mb-1">{label}</p>
      <p className={cn('text-xs leading-relaxed', red ? 'text-red-400' : 'text-text-primary', !multi && 'truncate')}>
        {value}
      </p>
    </div>
  )
}

// ── Tests tab ─────────────────────────────────────────────────────────────────
export function ControlInstanceTestsTab({ engagementId, controlInstanceId }) {
  const [selected, setSelected] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['ctrl-inst-tests', engagementId, controlInstanceId],
    queryFn:  () => fetchTests(engagementId, controlInstanceId),
    staleTime: 30_000,
    enabled:   !!engagementId && !!controlInstanceId,
  })

  const items = useMemo(() => {
    const raw = data?.data?.data || data?.data || data
    return Array.isArray(raw) ? raw : []
  }, [data])

  if (isLoading) return <div className="px-4 py-6 text-xs text-text-muted text-center">Loading tests…</div>
  if (!items.length) return (
    <div className="px-4 py-8 text-center">
      <Zap size={20} className="text-text-muted mx-auto mb-2" />
      <p className="text-xs text-text-muted">No tests linked to this control</p>
    </div>
  )

  return (
    <div className="relative flex flex-col h-full">
      {selected && <DetailPanel item={selected} type="test" onClose={() => setSelected(null)} />}
      <div className="px-3 py-1.5 text-[10px] text-text-muted border-b border-border/40 shrink-0">
        {items.length} test{items.length !== 1 ? 's' : ''} linked
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.map((item, i) => (
          <div key={item.id || i}
            className="flex items-start gap-2 px-3 py-2 hover:bg-surface-overlay/40 cursor-pointer border-b border-border/20 last:border-0 group"
            onClick={() => setSelected(item)}>
            <Zap size={10} className="text-text-muted shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                {item.testRefSnapshot && (
                  <span className="font-mono text-[9px] text-brand-400">{item.testRefSnapshot}</span>
                )}
                {item.isRequired && (
                  <span className="text-[9px] text-red-400">Required</span>
                )}
              </div>
              <p className="text-[11px] text-text-primary leading-snug truncate">{item.testNameSnapshot}</p>
              {item.frequencySnapshot && (
                <p className="text-[9px] text-text-muted">{item.frequencySnapshot} · {item.automationTypeSnapshot}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <ResultBadge result={item.testResult} />
              <ChevronRight size={10} className="text-text-muted opacity-0 group-hover:opacity-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Policies tab ──────────────────────────────────────────────────────────────
export function ControlInstancePoliciesTab({ engagementId, controlInstanceId }) {
  const [selected, setSelected] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['ctrl-inst-policies', engagementId, controlInstanceId],
    queryFn:  () => fetchPolicies(engagementId, controlInstanceId),
    staleTime: 30_000,
    enabled:   !!engagementId && !!controlInstanceId,
  })

  const items = useMemo(() => {
    const raw = data?.data?.data || data?.data || data
    return Array.isArray(raw) ? raw : []
  }, [data])

  if (isLoading) return <div className="px-4 py-6 text-xs text-text-muted text-center">Loading policies…</div>
  if (!items.length) return (
    <div className="px-4 py-8 text-center">
      <FileText size={20} className="text-text-muted mx-auto mb-2" />
      <p className="text-xs text-text-muted">No policies linked to this control</p>
    </div>
  )

  return (
    <div className="relative flex flex-col h-full">
      {selected && <DetailPanel item={selected} type="policy" onClose={() => setSelected(null)} />}
      <div className="px-3 py-1.5 text-[10px] text-text-muted border-b border-border/40 shrink-0">
        {items.length} polic{items.length !== 1 ? 'ies' : 'y'} linked
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.map((item, i) => (
          <div key={item.id || i}
            className="flex items-start gap-2 px-3 py-2 hover:bg-surface-overlay/40 cursor-pointer border-b border-border/20 last:border-0 group"
            onClick={() => setSelected(item)}>
            <FileText size={10} className="text-text-muted shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {item.policyRefSnapshot && (
                <span className="font-mono text-[9px] text-brand-400 block mb-0.5">{item.policyRefSnapshot}</span>
              )}
              <p className="text-[11px] text-text-primary leading-snug truncate">{item.policyTitleSnapshot}</p>
              {item.mappingType && (
                <p className="text-[9px] text-text-muted">{item.mappingType}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {item.reviewContribution && (
                <span className={cn('text-[9px] px-1 rounded',
                  item.reviewContribution === 'SATISFIES' ? 'text-green-400 bg-green-500/10' :
                  item.reviewContribution === 'GAPS'      ? 'text-red-400 bg-red-500/10' :
                  'text-text-muted bg-surface-overlay')}>
                  {item.reviewContribution}
                </span>
              )}
              <ChevronRight size={10} className="text-text-muted opacity-0 group-hover:opacity-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}