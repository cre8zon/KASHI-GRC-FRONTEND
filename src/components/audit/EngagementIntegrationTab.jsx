/**
 * EngagementIntegrationTab — shows automated check status for this engagement.
 *
 * Data: GET /v1/audit/engagements/{engagementId}/integration-snapshots
 *       → EngagementIntegrationSnapshot rows (one per AUTOMATED test instance)
 *
 * Per row:
 *   checkKey · integrationKey · displayName · controlTagSnapshot
 *   lastResult (PASS / FAIL / ERROR / NOT_RUN) · lastRunAt · runCount
 *   "Run now" button → POST /v1/integrations/{integrationKey}/checks/{checkKey}/run
 *     (requires IntegrationConfig for this tenant to exist)
 *
 * Shows NOT_RUN rows prominently — they mean the integration hasn't run yet for
 * this engagement, which means automated evidence isn't flowing in.
 *
 * Mirrors ControlInstanceTestsTab pattern exactly.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  Zap, RefreshCw, Clock, ChevronRight, Play,
} from 'lucide-react'
import api from '../../config/axios.config'
import { integrationApi } from '../../api/integration.api'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

// ── Result config ─────────────────────────────────────────────────────────────

const RESULT = {
  PASS:    { label: 'Pass',    icon: CheckCircle2, color: 'text-status-pass-fg', bg: 'bg-status-pass-bg',   border: 'border-status-pass-bd' },
  FAIL:    { label: 'Fail',    icon: XCircle,      color: 'text-status-fail-fg',   bg: 'bg-status-fail-bg',     border: 'border-status-fail-bd'   },
  ERROR:   { label: 'Error',   icon: AlertTriangle, color: 'text-status-warn-fg',bg: 'bg-status-warn-bg',   border: 'border-status-warn-bd' },
  NOT_RUN: { label: 'Not run', icon: MinusCircle,  color: 'text-text-muted',bg: 'bg-surface-overlay',border: 'border-border'       },
}

const INTEGRATION_COLOR = {
  OKTA:             'text-[#007DC1]',
  AWS:              'text-[#FF9900]',
  GITHUB:           'text-text-primary',
  AZURE:            'text-[#0078D4]',
  GOOGLE_WORKSPACE: 'text-[#4285F4]',
}

function ResultBadge({ result }) {
  const r = RESULT[result] || RESULT.NOT_RUN
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium border',
      r.color, r.bg, r.border,
    )}>
      <r.icon size={8} />{r.label}
    </span>
  )
}

// ── Run now button ────────────────────────────────────────────────────────────

function RunNowButton({ integrationKey, checkKey, snapshotId, engagementId }) {
  const qc = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: () => integrationApi.checks.run(integrationKey, checkKey),
    onSuccess: () => {
      toast.success('Check triggered — result will appear shortly')
      // Poll: invalidate after 3s to pick up the updated snapshot result
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['engagement-integration-snapshots', engagementId] })
      }, 3000)
    },
    onError: (e) => toast.error(
      e?.response?.data?.message || 'Run failed — is this integration connected?'
    ),
  })

  return (
    <button
      onClick={(e) => { e.stopPropagation(); mutate() }}
      disabled={isPending}
      title="Run this check now"
      className={cn(
        'flex items-center gap-1 text-[9px] px-2 py-0.5 rounded border',
        'border-border text-text-muted hover:text-text-primary hover:border-brand-500/40',
        'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
      )}
    >
      {isPending
        ? <RefreshCw size={9} className="animate-spin" />
        : <Play size={9} />}
      Run
    </button>
  )
}

// ── Snapshot row ──────────────────────────────────────────────────────────────

function SnapshotRow({ snap, engagementId }) {
  const navigate = useNavigate()

  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5 border-b border-border/20 hover:bg-surface-overlay/40 transition-colors group cursor-pointer"
      onClick={() => navigate(`/module/audit_test_instance/${snap.testInstanceId}`)}
    >
      {/* Integration key label */}
      <div className="shrink-0 w-16 text-right">
        <span className={cn('text-[8px] font-semibold uppercase tracking-wide', INTEGRATION_COLOR[snap.integrationKey] || 'text-text-muted')}>
          {snap.integrationKey?.replace('_', ' ')}
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Zap size={9} className="text-brand-ink shrink-0" />
          <span className="text-[11px] text-text-primary truncate group-hover:underline">
            {snap.displayNameSnapshot || snap.checkKey}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[9px] text-brand-ink">{snap.checkKey}</span>
          <span className="text-[9px] text-text-muted">tag: {snap.controlTagSnapshot}</span>
          {snap.lastRunAt && (
            <span className="text-[9px] text-text-muted flex items-center gap-0.5">
              <Clock size={8} />
              {new Date(snap.lastRunAt).toLocaleString()}
            </span>
          )}
          {snap.runCount > 0 && (
            <span className="text-[9px] text-text-muted">{snap.runCount}× run</span>
          )}
          {snap.lastResultSummary && snap.lastResult !== 'PASS' && (
            <span className="text-[9px] text-text-muted italic truncate max-w-[200px]">
              {snap.lastResultSummary}
            </span>
          )}
        </div>
      </div>

      {/* Run now */}
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <RunNowButton
          integrationKey={snap.integrationKey}
          checkKey={snap.checkKey}
          snapshotId={snap.id}
          engagementId={engagementId}
        />
      </div>

      <ResultBadge result={snap.lastResult || 'NOT_RUN'} />
      <ChevronRight size={10} className="text-text-muted opacity-0 group-hover:opacity-100 shrink-0" />
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function EngagementIntegrationTab({ engagementId }) {
  const qc = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['engagement-integration-snapshots', engagementId],
    queryFn: () => api.get(`/v1/audit/engagements/${engagementId}/integration-snapshots`),
    enabled: !!engagementId,
    refetchInterval: 30_000, // poll every 30s — automated runs update results
  })

  const snapshots = Array.isArray(data) ? data : (data?.data?.data || data?.data || [])

  const passing  = snapshots.filter(s => s.lastResult === 'PASS').length
  const failing  = snapshots.filter(s => s.lastResult === 'FAIL').length
  const notRun   = snapshots.filter(s => !s.lastResult || s.lastResult === 'NOT_RUN').length

  if (isLoading) return (
    <div className="py-8 flex items-center justify-center">
      <RefreshCw size={16} className="animate-spin text-text-muted" />
    </div>
  )

  if (snapshots.length === 0) return (
    <div className="py-10 text-center">
      <Zap size={24} className="mx-auto text-text-muted mb-2 opacity-40" />
      <p className="text-sm text-text-muted">No automated checks for this engagement.</p>
      <p className="text-xs text-text-muted mt-1 opacity-60">
        Set <code className="font-mono bg-surface-overlay px-1 rounded">automationKey</code> on
        library tests and connect an integration in Settings to enable automated evidence collection.
      </p>
    </div>
  )

  return (
    <div className="flex flex-col h-full">

      {/* Stats bar */}
      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-4 text-[10px] text-text-muted flex-wrap">
        <span className="font-medium text-text-primary">{snapshots.length} automated checks</span>
        {passing > 0  && <span className="text-status-pass-fg">{passing} passing</span>}
        {failing > 0  && <span className="text-status-fail-fg">{failing} failing</span>}
        {notRun > 0   && <span className="text-status-warn-fg">{notRun} not yet run</span>}
        <button onClick={() => refetch()} className="ml-auto text-text-muted hover:text-text-primary" title="Refresh">
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Warning if checks haven't run yet */}
      {notRun > 0 && (
        <div className="px-4 py-2.5 bg-status-warn-bg border-b border-status-warn-bd flex items-start gap-2">
          <AlertTriangle size={12} className="text-status-warn-fg mt-0.5 shrink-0" />
          <p className="text-[10px] text-status-warn-fg">
            {notRun} check{notRun > 1 ? 's have' : ' has'} not run yet for this engagement.
            Hover a row and click Run to trigger manually, or wait for the hourly scheduler.
            Ensure the integration is connected in Settings → Integrations.
          </p>
        </div>
      )}

      {/* Snapshot rows */}
      <div className="flex-1 overflow-y-auto">
        {snapshots.map(snap => (
          <SnapshotRow key={snap.id} snap={snap} engagementId={engagementId} />
        ))}
      </div>
    </div>
  )
}