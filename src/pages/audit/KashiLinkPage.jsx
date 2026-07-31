/**
 * KashiLinkPage — evidence reuse coverage and tag health.
 *
 * Route: /audit/kashilink
 *
 * The engine fails silently: a mistyped tag returns nothing and logs nothing
 * useful. This page is the only place that difference becomes visible, so the
 * hero is the reuse ratio — the number the whole "collect once, comply many"
 * claim rests on — and everything else is arranged as evidence for or against it.
 *
 * Uses Calm v3 tokens throughout. No hardcoded colours.
 */

import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Link2, AlertTriangle, Clock, FileWarning, CheckCircle2,
  XCircle, TagIcon, Layers, ArrowRight,
} from 'lucide-react'
import api    from '../../config/axios.config'
import { cn } from '../../lib/cn'
import toast  from 'react-hot-toast'

// ─── Health pill ──────────────────────────────────────────────────────────────

const HEALTH = {
  OK:     { label: 'Linked',      cls: 'bg-status-pass-bg text-status-pass-fg border-status-pass-bd' },
  DRIFT:  { label: 'Drift',       cls: 'bg-status-fail-bg text-status-fail-fg border-status-fail-bd' },
  UNUSED: { label: 'No evidence', cls: 'bg-status-warn-bg text-status-warn-fg border-status-warn-bd' },
  EMPTY:  { label: 'Unused',      cls: 'bg-surface-overlay text-text-muted border-border' },
}

function HealthPill({ health }) {
  const cfg = HEALTH[health] ?? HEALTH.EMPTY
  return (
    <span className={cn('inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-full border font-medium', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function Stat({ icon: Icon, label, value, sub, tone = 'default' }) {
  return (
    <div className={cn(
      'glass-card rounded-card border p-4 flex flex-col gap-1',
      tone === 'alert' ? 'border-status-fail-bd/40' :
      tone === 'warn'  ? 'border-status-warn-bd/40' : 'border-border'
    )}>
      <div className="flex items-center gap-1.5 text-text-muted">
        <Icon size={11} />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <span className={cn(
        'text-2xl font-semibold tabular-nums leading-none',
        tone === 'alert' ? 'text-status-fail-fg' :
        tone === 'warn'  ? 'text-status-warn-fg' : 'text-text-primary'
      )}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-text-muted">{sub}</span>}
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'coverage', label: 'Tag coverage' },
  { id: 'review',   label: 'Review queue' },
  { id: 'gaps',     label: 'Gaps' },
]

// ─── Coverage table ───────────────────────────────────────────────────────────

function CoverageTable() {
  const { data, isLoading } = useQuery({
    queryKey: ['kashilink-coverage'],
    queryFn:  () => api.get('/v1/kashilink/coverage'),
    staleTime: 60_000,
  })
  const rows = Array.isArray(data) ? data : []

  if (isLoading) return <p className="text-xs text-text-muted py-6 text-center">Loading coverage…</p>
  if (!rows.length) return (
    <div className="border border-dashed border-border/50 rounded-card px-4 py-8 text-center">
      <p className="text-xs font-medium text-text-secondary">No tags in circulation</p>
      <p className="text-[11px] text-text-muted mt-1">
        Tag controls in the audit library to start reusing evidence across frameworks.
      </p>
    </div>
  )

  return (
    <div className="rounded-card border border-border overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-overlay/50 border-b border-border">
          <tr className="text-[10px] uppercase tracking-wide text-text-muted">
            <th className="px-3 py-2 font-medium">Tag</th>
            <th className="px-3 py-2 font-medium text-right">Controls</th>
            <th className="px-3 py-2 font-medium text-right">Tests</th>
            <th className="px-3 py-2 font-medium text-right">Policies</th>
            <th className="px-3 py-2 font-medium text-right">Evidence</th>
            <th className="px-3 py-2 font-medium text-right">Checks</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {rows.map(r => (
            <tr key={r.tag} className={cn(
              'hover:bg-surface-overlay/40 transition-colors',
              r.health === 'DRIFT' && 'bg-status-fail-bg/20'
            )}>
              <td className="px-3 py-2">
                <span className="font-mono text-[11px] text-text-primary">{r.tag}</span>
              </td>
              <td className="px-3 py-2 text-right text-[11px] tabular-nums text-text-secondary">{r.controlInstances}</td>
              <td className="px-3 py-2 text-right text-[11px] tabular-nums text-text-secondary">{r.testInstances}</td>
              <td className="px-3 py-2 text-right text-[11px] tabular-nums text-text-secondary">{r.policyInstances}</td>
              <td className="px-3 py-2 text-right text-[11px] tabular-nums font-medium text-text-primary">{r.evidenceRecords}</td>
              <td className="px-3 py-2 text-right text-[11px] tabular-nums text-text-secondary">{r.integrationChecks}</td>
              <td className="px-3 py-2"><HealthPill health={r.health} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Review queue ─────────────────────────────────────────────────────────────

function ReviewQueue() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['kashilink-pending'],
    queryFn:  () => api.get('/v1/evidence/links/pending'),
    staleTime: 30_000,
  })

  const { mutate: review } = useMutation({
    mutationFn: ({ linkId, action }) =>
      api.patch(`/v1/evidence/links/${linkId}/review`, { action }),
    onSuccess: () => {
      toast.success('Reviewed')
      qc.invalidateQueries({ queryKey: ['kashilink-pending'] })
      qc.invalidateQueries({ queryKey: ['kashilink-stats'] })
    },
    onError: e => toast.error(e?.message || 'Could not save the review'),
  })

  const links = Array.isArray(data) ? data : []

  if (isLoading) return <p className="text-xs text-text-muted py-6 text-center">Loading queue…</p>
  if (!links.length) return (
    <div className="border border-dashed border-border/50 rounded-card px-4 py-8 text-center">
      <CheckCircle2 size={16} className="mx-auto text-status-pass-fg opacity-50 mb-2" />
      <p className="text-xs font-medium text-text-secondary">Nothing waiting for review</p>
      <p className="text-[11px] text-text-muted mt-1">
        Auto-linked evidence appears here when the engine matches a tag.
      </p>
    </div>
  )

  return (
    <div className="rounded-card border border-border divide-y divide-border/30">
      {links.map(l => (
        <div key={l.id} className="flex items-start gap-3 px-3 py-2.5">
          <Link2 size={12} className="shrink-0 mt-1 text-brand-ink" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">
              {l.evidenceTitle || `Evidence #${l.evidenceRecordId}`}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] text-text-muted">
              <span className="font-mono px-1 py-0.5 rounded bg-status-tag-bg text-status-tag-fg">
                {l.matchedTagSnapshot}
              </span>
              <ArrowRight size={9} />
              <span>{l.targetEntityType?.replace(/_/g, ' ').toLowerCase()} #{l.targetEntityId}</span>
              {l.collectionType === 'AUTOMATED' && <span className="text-brand-ink">automated</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => review({ linkId: l.id, action: 'ACCEPT' })}
              className="text-[10px] px-2 py-1 rounded-ctl bg-status-pass-bg text-status-pass-fg font-medium hover:opacity-80"
            >
              Accept
            </button>
            <button
              onClick={() => review({ linkId: l.id, action: 'REJECT' })}
              className="text-[10px] px-2 py-1 rounded-ctl bg-status-fail-bg text-status-fail-fg font-medium hover:opacity-80"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Gaps ─────────────────────────────────────────────────────────────────────

function Gaps() {
  const { data, isLoading } = useQuery({
    queryKey: ['kashilink-gaps'],
    queryFn:  () => api.get('/v1/kashilink/gaps'),
    staleTime: 60_000,
  })

  if (isLoading) return <p className="text-xs text-text-muted py-6 text-center">Loading gaps…</p>

  const engagements = data?.engagementsWithUntaggedControls ?? []
  const orphans     = data?.orphanEvidence ?? []

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-[11px] font-semibold text-text-secondary mb-2">
          Engagements with untagged controls
        </h3>
        <p className="text-[10px] text-text-muted mb-2 leading-relaxed">
          These controls were instantiated before their library rows carried a tag.
          The engine cannot reach them until the snapshot is backfilled.
        </p>
        {engagements.length === 0 ? (
          <p className="text-[11px] text-text-muted italic">Every control instance carries a tag.</p>
        ) : (
          <div className="rounded-card border border-border divide-y divide-border/30">
            {engagements.map(e => (
              <div key={e.engagementId} className="flex items-center gap-3 px-3 py-2">
                <Layers size={11} className="shrink-0 text-status-warn-fg" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary truncate">{e.name}</p>
                  <p className="text-[10px] text-text-muted">{e.frameworkRef}</p>
                </div>
                <span className="text-[11px] tabular-nums text-status-warn-fg font-medium shrink-0">
                  {e.untagged}/{e.total} untagged
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-[11px] font-semibold text-text-secondary mb-2">
          Evidence that matched nothing
        </h3>
        <p className="text-[10px] text-text-muted mb-2 leading-relaxed">
          Filed under a tag no instance carries — usually a typo or a tag that was
          renamed in the library after the evidence was uploaded.
        </p>
        {orphans.length === 0 ? (
          <p className="text-[11px] text-text-muted italic">All tagged evidence found a match.</p>
        ) : (
          <div className="rounded-card border border-border divide-y divide-border/30">
            {orphans.map(o => (
              <div key={o.id} className="flex items-center gap-3 px-3 py-2">
                <FileWarning size={11} className="shrink-0 text-status-fail-fg" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary truncate">{o.title}</p>
                </div>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-status-fail-bg text-status-fail-fg shrink-0">
                  {o.controlTag}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KashiLinkPage() {
  // Tab lives in the URL so each one gets its own nav entry, bookmark and
  // active-state highlight. Sidebar.routeMatches() compares location.pathname,
  // so query params would never highlight — sub-routes do.
  const { tab: tabParam } = useParams()
  const navigate = useNavigate()
  const tab = TABS.some(t => t.id === tabParam) ? tabParam : 'coverage'
  const setTab = id => navigate(id === 'coverage' ? '/audit/kashilink' : `/audit/kashilink/${id}`)

  const { data: stats } = useQuery({
    queryKey: ['kashilink-stats'],
    queryFn:  () => api.get('/v1/kashilink/stats'),
    staleTime: 60_000,
  })

  const ratio = stats?.reuseRatio ?? 0

  return (
    <div className="flex flex-col gap-5 pb-8 max-w-5xl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Link2 size={15} className="text-brand-ink" />
          <h1 className="text-base font-semibold text-text-primary">KashiLink</h1>
        </div>
        <p className="text-[11px] text-text-muted mt-1 max-w-xl leading-relaxed">
          Evidence collected once, matched to every control that needs it. This page shows
          what the engine can reach and where tags have drifted apart.
        </p>
      </div>

      {/* Hero + stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-card rounded-card border border-brand-500/25 bg-brand-500/5 p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-1.5 text-brand-ink">
            <TagIcon size={11} />
            <span className="text-[10px] font-medium uppercase tracking-wide">Reuse ratio</span>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-semibold tabular-nums leading-none text-brand-ink">
              {ratio.toFixed(2)}
            </span>
            <span className="text-[11px] text-text-muted">×</span>
          </div>
          <p className="text-[10px] text-text-muted mt-1">
            {stats ? `${stats.evidenceLinks} links from ${stats.evidenceRecords} uploads` : '—'}
          </p>
        </div>

        <Stat icon={Clock} label="Awaiting review" value={stats?.pendingReview ?? '—'}
              sub="auto-linked, needs a decision"
              tone={stats?.pendingReview > 0 ? 'warn' : 'default'} />

        <Stat icon={AlertTriangle} label="Orphan evidence" value={stats?.orphanEvidence ?? '—'}
              sub="tagged but matched nothing"
              tone={stats?.orphanEvidence > 0 ? 'alert' : 'default'} />

        <Stat icon={XCircle} label="Untagged instances"
              value={(stats?.untaggedControls ?? 0) + (stats?.untaggedTests ?? 0)}
              sub="invisible to the engine"
              tone={(stats?.untaggedControls ?? 0) > 0 ? 'warn' : 'default'} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-brand-500 text-brand-ink'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'coverage' && <CoverageTable />}
      {tab === 'review'   && <ReviewQueue />}
      {tab === 'gaps'     && <Gaps />}
    </div>
  )
}