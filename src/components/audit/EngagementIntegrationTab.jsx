/**
 * EngagementIntegrationTab — shows automated check status for this engagement.
 *
 * Data: GET /v1/integrations/engagements/{engagementId}/snapshots
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
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  Zap, RefreshCw, Clock, ChevronRight, Play,
} from 'lucide-react'
import api from '../../config/axios.config'
import { integrationApi } from '../../api/integration.api'
import { cn } from '../../lib/cn'
import { AutomationPayloadView } from './AutomationPayloadView'
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
  ZOHO:             'text-[#E42527]',
  MICROSOFT:        'text-[#00A4EF]',
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
      // Poll a couple of times: the check runs async, then the engagement
      // snapshot is updated. Invalidate at 2s and 6s so the result appears
      // without waiting for the 30s refetch interval.
      const inv = () => qc.invalidateQueries({ queryKey: ['engagement-integration-snapshots', engagementId] })
      setTimeout(inv, 2000)
      setTimeout(inv, 6000)
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

// ── Run all button ────────────────────────────────────────────────────────────

/**
 * The hourly scheduler already runs every check without anyone clicking, but it
 * skips a check whose nextRunAt has not elapsed — so a DAILY check that ran this
 * morning stays "Not run" against a snapshot created afterwards. This button
 * ignores nextRunAt and runs the lot, which is what someone setting up an
 * engagement actually wants.
 */
function RunAllButton({ integrationKeys, engagementId }) {
  const qc = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        integrationKeys.map(k => integrationApi.checks.runAll(k)),
      )
      const failed = results.filter(r => r.status === 'rejected')
      // `failed.length === integrationKeys.length` is also true when BOTH are
      // zero, and then failed[0] is undefined — so an empty key list threw
      // `undefined`, producing an error with no message, no status and nothing
      // to report. Guard the empty case explicitly.
      if (integrationKeys.length === 0) {
        throw new Error('No integrations are linked to this engagement')
      }
      if (failed.length === integrationKeys.length) throw failed[0].reason
      return results
    },
    onSuccess: (results) => {
      // A run-all can succeed at the HTTP level and still have every check fail
      // inside it — triggerRunAll catches per-check exceptions so one bad check
      // cannot roll back the rest, and reports them in the body. Announcing
      // "triggered" regardless is how a completely failed run looks like a
      // working one until someone reads the rows.
      const bodies = (results || [])
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value?.data?.data || r.value?.data || {})
      const ok     = bodies.reduce((n, b) => n + (b.succeeded ?? 0), 0)
      const failedChecks = bodies.reduce((n, b) => n + (b.failed ?? 0), 0)

      if (failedChecks > 0 && ok === 0) {
        const first = bodies.flatMap(b => b.results || [])
          .find(r => r.result === 'ERROR')
        toast.error(`All ${failedChecks} checks failed${first?.resultSummary ? ` — ${first.resultSummary}` : ''}`)
      } else if (failedChecks > 0) {
        toast.success(`${ok} check${ok === 1 ? '' : 's'} run, ${failedChecks} failed`)
      } else {
        toast.success('All checks triggered — results will appear shortly')
      }
      const inv = () => qc.invalidateQueries({ queryKey: ['engagement-integration-snapshots', engagementId] })
      setTimeout(inv, 3000)
      setTimeout(inv, 10000)
    },
    // ApiResponse puts the message at data.error.message. Reading data.message
    // meant every real reason — not connected, no permission, bad credentials —
    // was discarded and replaced by a guess that is often wrong.
    // No response at all means the request never left the browser — a bad
    // handler reference, a thrown TypeError. Saying "Run failed" for that sends
    // you looking at the server for something that never reached it, so name it.
    onError: (e) => toast.error(
      e?.response?.data?.error?.message
        || e?.response?.data?.message
        || (e?.response?.status === 403
              ? 'You do not have permission to run integration checks'
              : e?.response?.status === 404
                ? 'This integration is not connected for this organization'
                : e?.response
                  ? `Run failed (${e.response.status})`
                  : `Run failed before sending — ${e?.message || 'client error'}`)
    ),
  })

  if (integrationKeys.length === 0) return null

  return (
    <button
      onClick={() => mutate()}
      disabled={isPending}
      title="Run every check for this engagement now"
      className={cn(
        'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border',
        'border-border text-text-secondary hover:text-text-primary hover:border-brand-500/40',
        'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
      )}
    >
      {isPending ? <RefreshCw size={9} className="animate-spin" /> : <Play size={9} />}
      Run all
    </button>
  )
}

// ── Snapshot row ──────────────────────────────────────────────────────────────

function SnapshotRow({ snap, engagementId }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  // Payload lives on the IntegrationRun, not the snapshot — fetched only when
  // the row is expanded so the list stays one request.
  const { data: runData, isLoading: runLoading } = useQuery({
    queryKey: ['integration-run', snap.lastIntegrationRunId],
    queryFn: () => integrationApi.runs.get(snap.lastIntegrationRunId),
    enabled: open && !!snap.lastIntegrationRunId,
  })
  const run = runData?.data?.data || runData?.data || runData

  return (
    <div className="border-b border-border/20">
    <div
      className="flex items-center gap-2 px-3 py-2.5 hover:bg-surface-overlay/40 transition-colors group cursor-pointer"
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

      {/* Evidence disclosure — the collected payload, not just the verdict */}
      {snap.lastIntegrationRunId && (
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
          title={open ? 'Hide collected evidence' : 'Show collected evidence'}
          className="shrink-0 text-[9px] px-2 py-0.5 rounded border border-border text-text-muted hover:text-text-primary hover:border-brand-500/40 transition-colors"
        >
          {open ? 'Hide evidence' : 'Evidence'}
        </button>
      )}

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

    {open && (
      <div className="px-3 pb-3 pl-[4.75rem] bg-surface-overlay/20">
        {runLoading ? (
          <div className="py-2 flex items-center gap-2 text-[10px] text-text-muted">
            <RefreshCw size={10} className="animate-spin" /> Loading collected evidence…
          </div>
        ) : run?.rawPayload ? (
          <AutomationPayloadView payload={run.rawPayload} />
        ) : (
          <p className="py-2 text-[10px] text-text-muted">
            This run recorded no payload — checks that end in ERROR return a message only.
            {run?.resultSummary ? ` (${run.resultSummary})` : ''}
          </p>
        )}
      </div>
    )}
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function EngagementIntegrationTab({ engagementId }) {
  const qc = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['engagement-integration-snapshots', engagementId],
    queryFn: () => api.get(`/v1/integrations/engagements/${engagementId}/snapshots`),
    enabled: !!engagementId,
    refetchInterval: 30_000, // poll every 30s — automated runs update results
  })

  const snapshots = Array.isArray(data) ? data : (data?.data?.data || data?.data || [])

  const passing  = snapshots.filter(s => s.lastResult === 'PASS').length
  const failing  = snapshots.filter(s => s.lastResult === 'FAIL').length
  const errored  = snapshots.filter(s => s.lastResult === 'ERROR').length
  const notRun   = snapshots.filter(s => !s.lastResult || s.lastResult === 'NOT_RUN').length
  const integrationKeys = [...new Set(snapshots.map(s => s.integrationKey).filter(Boolean))]

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
        {errored > 0  && <span className="text-status-warn-fg">{errored} errored</span>}
        {notRun > 0   && <span className="text-status-warn-fg">{notRun} not yet run</span>}
        <div className="ml-auto flex items-center gap-2">
          <RunAllButton integrationKeys={integrationKeys} engagementId={engagementId} />
          <button onClick={() => refetch()} className="text-text-muted hover:text-text-primary" title="Refresh">
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* Warning if checks haven't run yet */}
      {notRun > 0 && (
        <div className="px-4 py-2.5 bg-status-warn-bg border-b border-status-warn-bd flex items-start gap-2">
          <AlertTriangle size={12} className="text-status-warn-fg mt-0.5 shrink-0" />
          <p className="text-[10px] text-status-warn-fg">
            {notRun} check{notRun > 1 ? 's have' : ' has'} not run yet for this engagement.
            Use Run all above, or hover a row and click Run. The hourly scheduler also runs them,
            but skips any check whose next run is not yet due.
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