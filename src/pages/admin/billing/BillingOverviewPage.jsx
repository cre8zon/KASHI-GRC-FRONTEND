/**
 * Billing Overview — the B2B SaaS numbers, from your own database.
 *
 * Tabs: Metrics · Acquisition spend · Snapshots.
 *
 * Every period number (NRR, GRR, movements, churn) comes from immutable monthly
 * snapshots; "now" numbers come from live contracts. Where history is missing
 * the page says so instead of showing a made-up zero. Mixpanel / PostHog are
 * untouched — product usage lives there, money lives here.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { BarChart3, Wallet, Camera, RefreshCw, AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button } from '../../../components/ui/Button'
import { Callout } from '../../../components/ui/ui-primitives'
import { billingApi } from '../../../api/billing.api'
import { formatMoney, pct, toMinor, CURRENCIES } from '../../../lib/money'
import {
  DetailTabs, useUrlTab, Kpi, SectionTitle, StatusPill, Table, Td, Empty, FormRow, TextIn, SelectIn,
  errMsg, fmtDate, daysUntil, humanize,
} from '../../../components/billing/billingShared'

const TABS = [
  { key: 'metrics',     label: 'Metrics',           icon: BarChart3 },
  { key: 'acquisition', label: 'Acquisition spend', icon: Wallet },
  { key: 'snapshots',   label: 'Snapshots',         icon: Camera },
]

export default function BillingOverviewPage() {
  const [tab, setTab] = useUrlTab(TABS)
  const qc = useQueryClient()
  const sweep = useMutation({
    mutationFn: billingApi.runSweep,
    onSuccess: (r) => { toast.success(`Sweep done: ${Object.entries(r || {}).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing to do'}`); qc.invalidateQueries({ queryKey: ['billing-overview'] }) },
    onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <PageLayout title="Billing Overview" subtitle="Revenue, retention and unit economics from contracts and monthly snapshots"
      actions={<Button size="sm" variant="ghost" icon={RefreshCw} loading={sweep.isPending} onClick={() => sweep.mutate()}>Run renewal sweep</Button>}>
      <DetailTabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab === 'metrics' && <MetricsTab />}
        {tab === 'acquisition' && <AcquisitionTab />}
        {tab === 'snapshots' && <SnapshotsTab />}
      </div>
    </PageLayout>
  )
}

// ─── Metrics ────────────────────────────────────────────────────────────────

function MetricsTab() {
  const navigate = useNavigate()
  const { data: o, isLoading } = useQuery({ queryKey: ['billing-overview'], queryFn: billingApi.overview })
  if (isLoading || !o) return <p className="text-sm text-text-muted">Loading…</p>
  const cur = o.reportingCurrency
  const m = (v) => formatMoney(v, cur, { compact: true })
  const mv = o.movements || {}
  const r = o.retention || {}

  return (
    <div className="space-y-6">
      {(o.warnings || []).length > 0 && (
        <Callout variant="warning" title="Data gaps">
          <ul className="list-disc pl-4 space-y-0.5">{o.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Callout>
      )}

      <section>
        <SectionTitle>Now</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi label="ARR" value={m(o.now.arrMinor)} sub={`MRR ${m(o.now.mrrMinor)}`} />
          <Kpi label="Paying customers" value={o.now.payingCustomers} sub={`${o.now.trials} in trial`} />
          <Kpi label="ARPA (monthly)" value={o.now.arpaMinor === null ? '—' : m(o.now.arpaMinor)} />
          <Kpi label="Top-5 concentration" value={pct(o.now.top5ConcentrationPct)} sub="share of ARR"
            tone={o.now.top5ConcentrationPct > 60 ? 'warn' : undefined} />
          <Kpi label="Past due" value={o.now.pastDue} tone={o.now.pastDue > 0 ? 'bad' : undefined} />
          <Kpi label="Cancelling" value={o.now.cancelling} sub="runs to term end" tone={o.now.cancelling > 0 ? 'warn' : undefined} />
        </div>
      </section>

      <section>
        <SectionTitle>Retention (12-month fixed cohort)</SectionTitle>
        {r.available ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="NRR" value={pct(r.nrrPct)} sub={`cohort of ${r.cohortSize} from ${r.cohortMonth}`} tone={r.nrrPct >= 100 ? 'good' : 'warn'}
              hint="What last year's customers pay now ÷ what they paid then. New customers never enter it." />
            <Kpi label="GRR" value={pct(r.grrPct)} sub="expansion excluded, ≤ 100%" tone={r.grrPct >= 90 ? 'good' : r.grrPct < 80 ? 'bad' : 'warn'} />
            <Kpi label="Logo retention" value={pct(r.logoRetentionPct)} />
            <Kpi label="Avg monthly logo churn" value={pct(o.trailingLogoChurn?.avgMonthlyLogoChurnPct)} sub={`over ${o.trailingLogoChurn?.monthsUsed || 0} months`} />
          </div>
        ) : (
          <p className="text-xs text-text-muted rounded-card border border-dashed border-border p-3">{r.reason}</p>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section>
          <SectionTitle>MRR — last 12 closed months</SectionTitle>
          <MrrTrend trend={o.trend} cur={cur} />
        </section>
        <section>
          <SectionTitle>Movements {mv.available ? `${mv.from} → ${mv.to}` : ''}</SectionTitle>
          {mv.available ? <Movements mv={mv} cur={cur} /> : <p className="text-xs text-text-muted rounded-card border border-dashed border-border p-3">{mv.reason}</p>}
        </section>
      </div>

      <section>
        <SectionTitle>Renewals in the next 90 days</SectionTitle>
        {o.renewals.length === 0 ? <p className="text-xs text-text-muted">None due.</p> : (
          <Table head={['Customer', 'Plan', 'Term ends', 'Status', 'Auto-renew', { label: 'MRR', align: 'right' }]}>
            {o.renewals.map(x => {
              const d = daysUntil(x.termEnd)
              return (
                <tr key={x.subscriptionId} className="cursor-pointer hover:bg-surface-overlay/40" onClick={() => navigate(`/tenants/${x.tenantId}?tab=subscription`)}>
                  <Td className="font-medium">{x.tenantName}</Td>
                  <Td mono>{x.planCode}</Td>
                  <Td className="text-xs">{fmtDate(x.termEnd)} <span className={d <= 30 ? 'text-status-warn-fg' : 'text-text-muted'}>({d}d)</span></Td>
                  <Td><StatusPill status={x.status} /></Td>
                  <Td className="text-xs">{x.autoRenew ? 'Yes' : <span className="text-status-warn-fg">No</span>}</Td>
                  <Td right mono>{formatMoney(x.mrrMinor, cur)}</Td>
                </tr>
              )
            })}
          </Table>
        )}
      </section>

      <section>
        <SectionTitle>Utilisation — leading indicators</SectionTitle>
        <Table head={['Customer', 'Plan', 'Seats active (30d)', 'Vendors vs bought', 'AI cost / MRR', 'Signal', { label: 'MRR', align: 'right' }]}>
          {o.utilisation.length === 0 && <tr><Td colSpan={7} className="text-center text-text-muted py-6">No live subscriptions.</Td></tr>}
          {o.utilisation.map(u => (
            <tr key={u.tenantId} className="cursor-pointer hover:bg-surface-overlay/40" onClick={() => navigate(`/tenants/${u.tenantId}?tab=usage`)}>
              <Td className="font-medium">{u.tenantName}</Td>
              <Td mono>{u.planCode}</Td>
              <Td className="text-xs">{u.seatsActive30d} / {u.seatsTotal} <span className="text-text-muted">({pct(u.seatActivityPct)})</span></Td>
              <Td className="text-xs">{u.vendors} / {u.vendorsPurchased ?? '∞'} <span className="text-text-muted">({pct(u.vendorUtilisationPct)})</span></Td>
              <Td className="text-xs">{formatMoney(u.aiCostMinor, cur)} <span className={u.aiCostPctOfMrr > 20 ? 'text-status-fail-fg' : 'text-text-muted'}>({pct(u.aiCostPctOfMrr)})</span></Td>
              <Td>{u.signal ? <StatusPill status={u.signal} /> : <span className="text-xs text-text-muted">—</span>}</Td>
              <Td right mono>{formatMoney(u.mrrMinor, cur)}</Td>
            </tr>
          ))}
        </Table>
        <p className="text-[11px] text-text-muted mt-1.5">Under 40% active or a single user predicts churn at renewal; vendors at 90%+ of the purchased limit is an upgrade conversation.</p>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section>
          <SectionTitle>MRR by plan</SectionTitle>
          <Split data={o.now.mrrByPlan} cur={cur} total={o.now.mrrMinor} />
        </section>
        <section>
          <SectionTitle>MRR by sales motion</SectionTitle>
          <Split data={o.now.mrrBySalesMotion} cur={cur} total={o.now.mrrMinor} />
        </section>
        <section>
          <SectionTitle>CAC — {o.cac.window}</SectionTitle>
          <div className="rounded-card border border-border p-4 bg-surface-raised space-y-2 text-xs">
            <Row k="Fully loaded spend" v={formatMoney(o.cac.spendMinor, cur)} />
            <Row k="Customers won" v={o.cac.customersWon} />
            <Row k="CAC" v={o.cac.cacMinor === null ? '—' : formatMoney(o.cac.cacMinor, cur)} />
            <Row k="Avg new MRR" v={o.cac.avgNewMrrMinor === null ? '—' : formatMoney(o.cac.avgNewMrrMinor, cur)} />
            <Row k="Payback (revenue basis)" v={o.cac.paybackMonths === null ? '—' : `${o.cac.paybackMonths} months`} />
            {o.cac.note && <p className="text-text-muted pt-1">{o.cac.note}</p>}
          </div>
        </section>
      </div>
    </div>
  )
}

function Row({ k, v }) {
  return <div className="flex justify-between"><span className="text-text-secondary">{k}</span><span className="font-mono text-text-primary">{v}</span></div>
}

function Split({ data = {}, cur, total }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  if (!entries.length) return <p className="text-xs text-text-muted">No revenue yet.</p>
  return (
    <div className="rounded-card border border-border p-4 bg-surface-raised space-y-2.5">
      {entries.map(([k, v]) => {
        const p = total ? Math.round((v / total) * 100) : 0
        return (
          <div key={k}>
            <div className="flex justify-between text-xs"><span className="text-text-secondary">{humanize(k)}</span>
              <span className="font-mono text-text-primary">{formatMoney(v, cur, { compact: true })} <span className="text-text-muted">· {p}%</span></span></div>
            <div className="mt-1 h-1.5 rounded-full bg-surface-overlay overflow-hidden"><div className="h-full rounded-full bg-brand-500" style={{ width: `${p}%` }} /></div>
          </div>
        )
      })}
    </div>
  )
}

const TOOLTIP = {
  contentStyle: {
    background: 'rgb(var(--color-surface-raised))', border: '1px solid rgb(var(--color-border))',
    borderRadius: '8px', fontSize: 12, boxShadow: '0 4px 16px rgb(0 0 0 / 0.08)',
  },
  labelStyle: { color: 'rgb(var(--color-text-muted))' },
}

function MrrTrend({ trend = [], cur }) {
  const data = trend.map(p => ({ month: p.month, mrr: p.mrrMinor === null ? null : p.mrrMinor, customers: p.payingCustomers }))
  if (!data.some(d => d.mrr !== null)) {
    return <p className="text-xs text-text-muted rounded-card border border-dashed border-border p-3">No snapshots yet — the first one is written on the 1st of next month, or run it from Snapshots.</p>
  }
  return (
    <div className="rounded-card border border-border p-3 bg-surface-raised h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border) / 0.5)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgb(var(--color-text-muted))' }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v) => formatMoney(v, cur, { compact: true })} tick={{ fontSize: 10, fill: 'rgb(var(--color-text-muted))' }} tickLine={false} axisLine={false} width={64} />
          <Tooltip {...TOOLTIP} formatter={(v, _n, p) => [`${formatMoney(v, cur)} · ${p.payload.customers ?? '—'} paying`, 'MRR']} />
          <Line type="monotone" dataKey="mrr" stroke="rgb(var(--color-brand-500))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function Movements({ mv, cur }) {
  const rows = [
    ['New', mv.newMinor, mv.newCount, 'good'],
    ['Reactivation', mv.reactivationMinor, mv.reactivationCount, 'good'],
    ['Expansion', mv.expansionMinor, null, 'good'],
    ['Contraction', -mv.contractionMinor, null, 'bad'],
    ['Churned', -mv.churnedMinor, mv.churnedCount, 'bad'],
  ]
  return (
    <div className="rounded-card border border-border p-4 bg-surface-raised space-y-2 text-xs">
      {rows.map(([k, v, n, t]) => (
        <div key={k} className="flex justify-between">
          <span className="text-text-secondary">{k}{n !== null ? <span className="text-text-muted"> · {n}</span> : ''}</span>
          <span className={'font-mono ' + (v === 0 ? 'text-text-muted' : t === 'good' ? 'text-status-pass-fg' : 'text-status-fail-fg')}>
            {v > 0 ? '+' : ''}{formatMoney(v, cur)}</span>
        </div>
      ))}
      <div className="border-t border-border pt-2 flex justify-between font-semibold">
        <span>Net new MRR</span><span className="font-mono">{formatMoney(mv.netNewMinor, cur)}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 text-text-secondary">
        <Row k="Quick ratio" v={mv.quickRatio ?? '—'} />
        <Row k="Logo churn" v={pct(mv.logoChurnPct)} />
        <Row k="Revenue churn" v={pct(mv.revenueChurnPct)} />
        <Row k="Expansion share" v={pct(mv.expansionShareOfNetNewPct)} />
      </div>
    </div>
  )
}

// ─── Acquisition spend ─────────────────────────────────────────────────────

const lastMonth = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) }

function AcquisitionTab() {
  const qc = useQueryClient()
  const { data: rows = [], isLoading } = useQuery({ queryKey: ['billing-costs'], queryFn: billingApi.costs })
  const { data: cfg } = useQuery({ queryKey: ['billing-config'], queryFn: billingApi.config, staleTime: 300_000 })
  const [f, setF] = useState({ periodMonth: lastMonth(), channel: 'OUTBOUND', costType: 'FOUNDER_TIME', amount: '', currency: 'INR', notes: '' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const add = useMutation({
    mutationFn: () => billingApi.addCost({ periodMonth: f.periodMonth, channel: f.channel, costType: f.costType, spendMinor: toMinor(f.amount), currency: f.currency, notes: f.notes }),
    onSuccess: () => { toast.success('Spend recorded'); set('amount', ''); set('notes', ''); qc.invalidateQueries({ queryKey: ['billing-costs'] }); qc.invalidateQueries({ queryKey: ['billing-overview'] }) },
    onError: (e) => toast.error(errMsg(e)),
  })
  const del = useMutation({
    mutationFn: billingApi.deleteCost,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-costs'] }); qc.invalidateQueries({ queryKey: ['billing-overview'] }) },
  })
  const byMonth = useMemo(() => {
    const m = {}
    for (const r of rows) m[r.periodMonth] = (m[r.periodMonth] || 0) + (r.currency === 'INR' ? r.spendMinor : 0)
    return m
  }, [rows])

  return (
    <div className="max-w-5xl space-y-5">
      <Callout variant="info">
        Fully loaded: salaries, commissions, ads, events, tools — and founder time spent selling, at an honest hourly value.
        CAC that counts ad spend alone makes every channel look profitable.
      </Callout>
      <div className="rounded-card border border-border p-4 bg-surface-raised grid grid-cols-6 gap-3 items-end">
        <FormRow label="Month"><TextIn type="month" value={f.periodMonth} onChange={e => set('periodMonth', e.target.value)} /></FormRow>
        <FormRow label="Channel"><SelectIn value={f.channel} onChange={e => set('channel', e.target.value)} options={cfg?.acquisitionChannels || []} /></FormRow>
        <FormRow label="Cost type"><SelectIn value={f.costType} onChange={e => set('costType', e.target.value)} options={cfg?.costTypes || []} /></FormRow>
        <FormRow label="Amount"><TextIn inputMode="decimal" value={f.amount} onChange={e => set('amount', e.target.value)} /></FormRow>
        <FormRow label="Currency"><SelectIn value={f.currency} onChange={e => set('currency', e.target.value)} options={CURRENCIES.map(c => ({ value: c, label: c }))} /></FormRow>
        <Button size="md" icon={Plus} disabled={toMinor(f.amount) === null} loading={add.isPending} onClick={() => add.mutate()}>Add</Button>
        <FormRow label="Notes" className="col-span-6"><TextIn value={f.notes} onChange={e => set('notes', e.target.value)} /></FormRow>
      </div>
      {isLoading ? <p className="text-sm text-text-muted">Loading…</p> : rows.length === 0 ? (
        <Empty icon={Wallet} title="No spend recorded">Enter monthly sales & marketing cost per channel. CAC appears on Metrics once customers are won in the same window.</Empty>
      ) : (
        <Table head={['Month', 'Channel', 'Type', 'Notes', { label: 'Spend', align: 'right' }, '']}>
          {rows.map(r => (
            <tr key={r.id}>
              <Td mono>{r.periodMonth}</Td>
              <Td className="text-xs">{humanize(r.channel)}</Td>
              <Td className="text-xs">{humanize(r.costType)}</Td>
              <Td className="text-xs text-text-muted">{r.notes}</Td>
              <Td right mono>{formatMoney(r.spendMinor, r.currency)}</Td>
              <Td><button onClick={() => del.mutate(r.id)} className="text-text-muted hover:text-status-fail-fg p-1" aria-label="Delete"><Trash2 size={13} /></button></Td>
            </tr>
          ))}
        </Table>
      )}
      {Object.keys(byMonth).length > 0 && (
        <p className="text-[11px] text-text-muted">INR totals: {Object.entries(byMonth).map(([k, v]) => `${k} ${formatMoney(v, 'INR')}`).join(' · ')}</p>
      )}
    </div>
  )
}

// ─── Snapshots ─────────────────────────────────────────────────────────────

function SnapshotsTab() {
  const qc = useQueryClient()
  const { data: months = [] } = useQuery({ queryKey: ['billing-snapshot-months'], queryFn: billingApi.snapshotMonths })
  const [month, setMonth] = useState(lastMonth())
  const { data: rows = [], isLoading } = useQuery({ queryKey: ['billing-snapshot-rows', month], queryFn: () => billingApi.snapshotRows(month), enabled: !!month })
  const run = useMutation({
    mutationFn: () => billingApi.runSnapshot(month),
    onSuccess: (r) => {
      toast.success(`${r.periodMonth}: ${r.written} written, ${r.alreadyPresent} already present`)
      ;(r.warnings || []).forEach(w => toast(w, { icon: '⚠️' }))
      qc.invalidateQueries({ queryKey: ['billing-snapshot-months'] })
      qc.invalidateQueries({ queryKey: ['billing-snapshot-rows', month] })
      qc.invalidateQueries({ queryKey: ['billing-overview'] })
    },
    onError: (e) => toast.error(errMsg(e)),
  })
  const total = rows.reduce((s, r) => s + (r.mrrReportingMinor || 0), 0)

  return (
    <div className="max-w-5xl space-y-5">
      <Callout variant="info">
        One row per customer per month, written on the 1st for the month that closed. Rows are never overwritten:
        running a month again only fills in customers that are missing. That is what keeps NRR from changing when you look at it twice.
      </Callout>
      <div className="flex items-end gap-3">
        <FormRow label="Month"><TextIn type="month" value={month} onChange={e => setMonth(e.target.value)} /></FormRow>
        <Button size="md" icon={Camera} loading={run.isPending} onClick={() => run.mutate()}>Write snapshot</Button>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {months.slice(0, 13).map(m => (
            <button key={m.periodMonth} onClick={() => setMonth(m.periodMonth)}
              className={'px-2 py-0.5 rounded-full text-[11px] border ' + (m.periodMonth === month ? 'border-brand-500 text-brand-ink' : 'border-border text-text-muted')}>
              {m.periodMonth} · {m.tenants}
            </button>
          ))}
        </div>
      </div>
      {!months.some(m => m.periodMonth === month) && (
        <p className="text-xs text-status-warn-fg flex items-center gap-1.5"><AlertTriangle size={12} /> No snapshot for {month}.</p>
      )}
      {isLoading ? null : rows.length > 0 && (
        <Table head={['Customer', 'Plan', 'Status', 'Seats active', 'Vendors', { label: 'MRR', align: 'right' }, { label: `MRR (${rows[0]?.reportingCurrency})`, align: 'right' }]}>
          {rows.map(r => (
            <tr key={r.id}>
              <Td className="font-medium">{r.tenantName}</Td>
              <Td mono>{r.planCode || '—'}</Td>
              <Td><StatusPill status={r.status} /></Td>
              <Td className="text-xs">{r.seatsActive}{r.seatsPurchased ? ` / ${r.seatsPurchased}` : ''}</Td>
              <Td className="text-xs">{r.vendorsActive}{r.vendorsPurchased ? ` / ${r.vendorsPurchased}` : ''}</Td>
              <Td right mono>{formatMoney(r.mrrMinor, r.currency)}</Td>
              <Td right mono>{formatMoney(r.mrrReportingMinor, r.reportingCurrency)}</Td>
            </tr>
          ))}
          <tr className="font-semibold"><Td colSpan={6}>Total</Td><Td right mono>{formatMoney(total, rows[0]?.reportingCurrency)}</Td></tr>
        </Table>
      )}
    </div>
  )
}
