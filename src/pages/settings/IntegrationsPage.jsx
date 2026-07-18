/**
 * IntegrationsPage — /settings/integrations
 *
 * Manage connected integrations and their automated compliance checks.
 *
 * LEFT PANEL: catalog of available integrations (Okta, AWS, GitHub, Azure, Google Workspace)
 *   Connect / Disconnect buttons per integration
 *   Shows check count and last run status for connected integrations
 *
 * RIGHT PANEL (when integration selected):
 *   Connection form — auth config fields per integration type
 *   Checks list — TenantIntegrationCheck rows with:
 *     last result, last run time, run frequency, "Run now" button
 *     Expand row → customise checkConfigJson / passCriteriaJson / runFrequency
 *
 * Run history section at the bottom — recent IntegrationRun rows
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, XCircle, AlertTriangle, MinusCircle,
  RefreshCw, Play, Link2, Link2Off, ChevronDown, ChevronUp,
  Settings, Clock, Zap, AlertCircle,
} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Button }     from '../../components/ui/Button'
import { cn }         from '../../lib/cn'
import { integrationApi } from '../../api/integration.api'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────

const RESULT_CFG = {
  PASS:    { label: 'Pass',    icon: CheckCircle2, color: 'text-status-pass-fg', bg: 'bg-status-pass-bg',    border: 'border-status-pass-bd' },
  FAIL:    { label: 'Fail',    icon: XCircle,      color: 'text-status-fail-fg',   bg: 'bg-status-fail-bg',      border: 'border-status-fail-bd'   },
  ERROR:   { label: 'Error',   icon: AlertTriangle, color: 'text-status-warn-fg',bg: 'bg-status-warn-bg',    border: 'border-status-warn-bd' },
  NOT_RUN: { label: 'Not run', icon: MinusCircle,  color: 'text-text-muted',bg: 'bg-surface-overlay', border: 'border-border'       },
}

// Auth config field schemas per integration key
const AUTH_FIELDS = {
  OKTA: [
    { key: 'apiToken', label: 'API Token', type: 'password', placeholder: '00K...', required: true },
    { key: 'domain',   label: 'Okta Domain', type: 'text',  placeholder: 'company.okta.com', required: true },
  ],
  AWS: [
    { key: 'accessKeyId',     label: 'Access Key ID',     type: 'text',     placeholder: 'AKIA...', required: true },
    { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: '...', required: true },
    { key: 'region',          label: 'Region',            type: 'text',     placeholder: 'us-east-1', required: true },
  ],
  GITHUB: [
    { key: 'token', label: 'Personal Access Token', type: 'password', placeholder: 'ghp_...', required: true },
    { key: 'org',   label: 'Organisation',          type: 'text',     placeholder: 'my-company', required: true },
  ],
  AZURE: [
    { key: 'tenantId',     label: 'Azure Tenant ID',   type: 'text',     placeholder: 'xxxxxxxx-...', required: true },
    { key: 'clientId',     label: 'Client ID',         type: 'text',     placeholder: 'xxxxxxxx-...', required: true },
    { key: 'clientSecret', label: 'Client Secret',     type: 'password', placeholder: '...', required: true },
  ],
  GOOGLE_WORKSPACE: [
    { key: 'serviceAccountJson', label: 'Service Account JSON', type: 'textarea', placeholder: '{"type":"service_account",...}', required: true },
    { key: 'adminEmail',         label: 'Admin Email',          type: 'text',     placeholder: 'admin@company.com', required: true },
  ],
}

const INTEGRATION_LOGOS = {
  OKTA:             '🔐',
  AWS:              '☁️',
  GITHUB:           '🐙',
  AZURE:            '🔷',
  GOOGLE_WORKSPACE: '🟦',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ResultBadge({ result }) {
  const r = RESULT_CFG[result] || RESULT_CFG.NOT_RUN
  return (
    <span className={cn('inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium border', r.color, r.bg, r.border)}>
      <r.icon size={8} />{r.label}
    </span>
  )
}

// ── Auth connect form ─────────────────────────────────────────────────────────

function ConnectForm({ integrationKey, displayName, onSuccess }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({})

  const fields = AUTH_FIELDS[integrationKey] || []

  const { mutate, isPending } = useMutation({
    mutationFn: () => integrationApi.connect(integrationKey, {
      displayName: `${displayName} Integration`,
      authConfig: form,
    }),
    onSuccess: () => {
      toast.success(`${displayName} connected`)
      qc.invalidateQueries({ queryKey: ['integrations-connected'] })
      qc.invalidateQueries({ queryKey: ['integration-checks', integrationKey] })
      onSuccess?.()
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Connection failed'),
  })

  return (
    <div className="p-4 bg-surface-raised rounded-card border border-border space-y-3">
      <h3 className="text-sm font-medium text-text-primary">Connect {displayName}</h3>
      {fields.map(f => (
        <div key={f.key}>
          <label className="block text-xs text-text-muted mb-1">
            {f.label}{f.required && <span className="text-status-fail-fg ml-0.5">*</span>}
          </label>
          {f.type === 'textarea' ? (
            <textarea
              rows={4}
              placeholder={f.placeholder}
              value={form[f.key] || ''}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-border bg-surface-overlay text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono resize-none"
            />
          ) : (
            <input
              type={f.type}
              placeholder={f.placeholder}
              value={form[f.key] || ''}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-border bg-surface-overlay text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => mutate()} loading={isPending}>
          Connect
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onSuccess?.()}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ── Check row ─────────────────────────────────────────────────────────────────

function CheckRow({ check, integrationKey }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [overrides, setOverrides] = useState({})

  const { mutate: runNow, isPending: running } = useMutation({
    mutationFn: () => integrationApi.checks.run(integrationKey, check.checkKey),
    onSuccess: () => {
      toast.success('Check triggered')
      setTimeout(() => qc.invalidateQueries({ queryKey: ['integration-checks', integrationKey] }), 3000)
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Run failed'),
  })

  const { mutate: saveCustom, isPending: saving } = useMutation({
    mutationFn: () => integrationApi.checks.customise(integrationKey, check.checkKey, overrides),
    onSuccess: () => {
      toast.success('Saved')
      qc.invalidateQueries({ queryKey: ['integration-checks', integrationKey] })
      setExpanded(false)
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Save failed'),
  })

  return (
    <div className="border-b border-border/20 last:border-0">
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-overlay/40 transition-colors group"
      >
        <Zap size={12} className="text-brand-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-[11px] text-text-primary font-medium">{check.displayName}</span>
            <span className="font-mono text-[9px] text-text-muted">{check.checkKey}</span>
            {check.hasCustomConfig && (
              <span className="text-[8px] text-brand-400 bg-brand-500/10 px-1 rounded">custom config</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[9px] text-text-muted">
            <span>tag: {check.controlTag}</span>
            <span>·</span>
            <span>{check.runFrequency}</span>
            {check.lastRunAt && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <Clock size={8} />{new Date(check.lastRunAt).toLocaleString()}
                </span>
              </>
            )}
            {check.totalRunCount > 0 && (
              <span>· {check.totalRunCount}× run</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => runNow()}
            disabled={running}
            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[9px] px-2 py-0.5 rounded border border-border text-text-muted hover:text-text-primary hover:border-brand-500/40 disabled:opacity-40 transition-all"
          >
            {running ? <RefreshCw size={9} className="animate-spin" /> : <Play size={9} />}
            Run
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-surface-overlay text-text-muted"
            title="Customise"
          >
            {expanded ? <ChevronUp size={12} /> : <Settings size={12} />}
          </button>
          <ResultBadge result={check.lastRunStatus || 'NOT_RUN'} />
        </div>
      </div>

      {/* Customise panel */}
      {expanded && (
        <div className="mx-4 mb-3 p-3 bg-surface-overlay rounded-card border border-border space-y-2.5">
          <p className="text-[10px] text-text-muted font-medium">Customise check settings</p>
          <div>
            <label className="block text-[10px] text-text-muted mb-1">Run frequency</label>
            <select
              value={overrides.runFrequency || check.runFrequency}
              onChange={e => setOverrides(p => ({ ...p, runFrequency: e.target.value }))}
              className="w-full px-2 py-1.5 rounded border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY'].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-text-muted mb-1">
              Check config JSON <span className="opacity-60">(overrides global default)</span>
            </label>
            <textarea
              rows={3}
              placeholder={`{"scope":"ADMINS"}`}
              defaultValue={check.hasCustomConfig ? '[custom]' : ''}
              onChange={e => setOverrides(p => ({ ...p, checkConfigJson: e.target.value }))}
              className="w-full px-2 py-1.5 rounded border border-border bg-surface-raised text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="xs" onClick={() => saveCustom()} loading={saving}>Save</Button>
            <Button size="xs" variant="ghost" onClick={() => setExpanded(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Integration card (left panel) ─────────────────────────────────────────────

function IntegrationCard({ catalog, connected, onSelect, isSelected }) {
  const isConnected = !!connected
  const stats = connected?.checksStats

  return (
    <button
      onClick={() => onSelect(catalog.key)}
      className={cn(
        'w-full text-left p-3 rounded-card border transition-colors',
        isSelected
          ? 'border-brand-500/60 bg-brand-500/5'
          : 'border-border hover:border-brand-500/30 bg-surface-raised',
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg">{INTEGRATION_LOGOS[catalog.key] || '🔌'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-text-primary">{catalog.name}</span>
            {isConnected && (
              <span className="text-[8px] text-status-pass-fg bg-status-pass-bg px-1 rounded border border-status-pass-bd">
                connected
              </span>
            )}
          </div>
          <p className="text-[9px] text-text-muted">{catalog.category}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[9px] text-text-muted">
        <span>{catalog.checksCount} checks</span>
        {stats && (
          <>
            <span>·</span>
            <span className="text-status-pass-fg">{stats.passing} passing</span>
            {stats.failing > 0 && <><span>·</span><span className="text-status-fail-fg">{stats.failing} failing</span></>}
            {stats.neverRun > 0 && <><span>·</span><span className="text-status-warn-fg">{stats.neverRun} not run</span></>}
          </>
        )}
      </div>
    </button>
  )
}

// ── Right panel — detail view ─────────────────────────────────────────────────

function IntegrationDetail({ catalogItem, connected }) {
  const qc = useQueryClient()
  const [showConnectForm, setShowConnectForm] = useState(false)
  const integrationKey = catalogItem.key

  const { data: checksData, isLoading: checksLoading } = useQuery({
    queryKey: ['integration-checks', integrationKey],
    queryFn: () => integrationApi.checks.list(integrationKey),
    enabled: !!connected,
  })
  const checks = Array.isArray(checksData) ? checksData : (checksData?.data?.data || checksData?.data || [])

  const { mutate: disconnect, isPending: disconnecting } = useMutation({
    mutationFn: () => integrationApi.disconnect(integrationKey),
    onSuccess: () => {
      toast.success(`${catalogItem.name} disconnected`)
      qc.invalidateQueries({ queryKey: ['integrations-connected'] })
      qc.invalidateQueries({ queryKey: ['integration-checks', integrationKey] })
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Disconnect failed'),
  })

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">{INTEGRATION_LOGOS[integrationKey] || '🔌'}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-medium text-text-primary">{catalogItem.name}</h2>
          <p className="text-xs text-text-muted">{catalogItem.category} · {catalogItem.checksCount} checks</p>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <span className="text-[10px] text-status-pass-fg flex items-center gap-1">
                <CheckCircle2 size={11} />Connected
              </span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => disconnect()}
                loading={disconnecting}
                className="text-status-fail-fg hover:text-status-fail-fg"
              >
                <Link2Off size={12} />Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setShowConnectForm(true)}>
              <Link2 size={12} />Connect
            </Button>
          )}
        </div>
      </div>

      {/* Connect form */}
      {!connected && showConnectForm && (
        <ConnectForm
          integrationKey={integrationKey}
          displayName={catalogItem.name}
          onSuccess={() => setShowConnectForm(false)}
        />
      )}

      {/* Not connected state */}
      {!connected && !showConnectForm && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center py-10">
            <Link2 size={32} className="mx-auto text-text-muted mb-3 opacity-40" />
            <p className="text-sm text-text-muted">Not connected</p>
            <p className="text-xs text-text-muted mt-1 opacity-60">
              Connect this integration to enable automated compliance evidence collection.
            </p>
            <Button size="sm" className="mt-3" onClick={() => setShowConnectForm(true)}>
              Connect {catalogItem.name}
            </Button>
          </div>
        </div>
      )}

      {/* Connected: checks list */}
      {connected && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">
              Automated Checks ({checks.length})
            </h3>
            <div className="flex items-center gap-2 text-[9px] text-text-muted">
              {connected.lastRunAt && (
                <span className="flex items-center gap-1">
                  <Clock size={9} />Last run: {new Date(connected.lastRunAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {checksLoading ? (
            <div className="py-6 flex items-center justify-center">
              <RefreshCw size={14} className="animate-spin text-text-muted" />
            </div>
          ) : checks.length === 0 ? (
            <div className="py-6 text-center text-xs text-text-muted">
              No checks available. The global library may not have checks for this integration.
            </div>
          ) : (
            <div className="rounded-card border border-border bg-surface-raised overflow-hidden flex-1 overflow-y-auto">
              {checks.map(c => (
                <CheckRow key={c.checkKey} check={c} integrationKey={integrationKey} />
              ))}
            </div>
          )}

          {/* Recent runs */}
          <RunHistory integrationKey={integrationKey} />
        </div>
      )}
    </div>
  )
}

// ── Recent run history ────────────────────────────────────────────────────────

function RunHistory({ integrationKey }) {
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['integration-runs', integrationKey],
    queryFn: () => integrationApi.runs.list({ checkKey: integrationKey }),
    enabled: open,
  })
  const runs = Array.isArray(data) ? data : (data?.data?.data || data?.data || [])

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[10px] text-text-muted hover:text-text-primary"
      >
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        Run history
      </button>
      {open && (
        <div className="mt-2 rounded-card border border-border bg-surface-raised overflow-hidden max-h-40 overflow-y-auto">
          {isLoading ? (
            <div className="py-4 flex justify-center"><RefreshCw size={12} className="animate-spin text-text-muted" /></div>
          ) : runs.length === 0 ? (
            <p className="p-3 text-[10px] text-text-muted">No runs yet.</p>
          ) : (
            runs.slice(0, 20).map(r => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-b border-border/20 last:border-0">
                <ResultBadge result={r.result} />
                <span className="font-mono text-[9px] text-text-muted">{r.checkKey}</span>
                <span className="text-[9px] text-text-muted flex-1 truncate">{r.resultSummary}</span>
                <span className="text-[9px] text-text-muted shrink-0">
                  {r.runAt ? new Date(r.runAt).toLocaleString() : ''}
                </span>
                <span className="text-[9px] text-text-muted shrink-0">{r.durationMs}ms</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [selectedKey, setSelectedKey] = useState(null)

  const { data: catalogData, isLoading: catalogLoading } = useQuery({
    queryKey: ['integrations-catalog'],
    queryFn: () => integrationApi.catalog(),
    staleTime: 10 * 60_000,
  })
  const catalog = Array.isArray(catalogData) ? catalogData : (catalogData?.data?.data || catalogData?.data || [])

  const { data: connectedData } = useQuery({
    queryKey: ['integrations-connected'],
    queryFn: () => integrationApi.connected(),
  })
  const connected = Array.isArray(connectedData) ? connectedData : (connectedData?.data?.data || connectedData?.data || [])
  const connectedMap = Object.fromEntries(connected.map(c => [c.integrationKey, c]))

  const selectedCatalog = catalog.find(c => c.key === selectedKey)

  return (
    <PageLayout title="Integrations" subtitle="Connect your tools to collect automated compliance evidence">
      <div className="flex h-full min-h-[500px] divide-x divide-border">

        {/* Left — catalog */}
        <div className="w-64 shrink-0 p-4 flex flex-col gap-2 overflow-y-auto">
          <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-1">
            Available integrations
          </p>
          {catalogLoading ? (
            <div className="py-6 flex justify-center"><RefreshCw size={14} className="animate-spin text-text-muted" /></div>
          ) : catalog.map(c => (
            <IntegrationCard
              key={c.key}
              catalog={c}
              connected={connectedMap[c.key]}
              onSelect={setSelectedKey}
              isSelected={selectedKey === c.key}
            />
          ))}
        </div>

        {/* Right — detail */}
        <div className="flex-1 p-5 overflow-y-auto">
          {!selectedKey ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Zap size={32} className="mx-auto text-text-muted mb-3 opacity-40" />
                <p className="text-sm text-text-muted">Select an integration to get started</p>
                <p className="text-xs text-text-muted mt-1 opacity-60">
                  Connect Okta, AWS, GitHub and others to automate compliance evidence collection.
                </p>
              </div>
            </div>
          ) : selectedCatalog ? (
            <IntegrationDetail
              catalogItem={selectedCatalog}
              connected={connectedMap[selectedKey]}
            />
          ) : null}
        </div>

      </div>
    </PageLayout>
  )
}