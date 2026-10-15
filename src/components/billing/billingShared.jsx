/**
 * Shared bits for the billing pages and the Tenant Detail tabs.
 *
 * DetailTabs reproduces the Universal Module Page's detail tab strip exactly
 * (sticky, glass-chrome, brand underline, ?tab= in the URL) so the Tenant
 * Detail page reads like the Vendor Detail page without importing the 250 KB
 * module page.
 */
import { useSearchParams } from 'react-router-dom'
import { useCallback } from 'react'
import { cn } from '../../lib/cn'

// ─── Tabs, URL-backed ────────────────────────────────────────────────────────

export function useUrlTab(tabs, param = 'tab') {
  const [params, setParams] = useSearchParams()
  const keys = tabs.map(t => t.key)
  const raw = params.get(param)
  const active = keys.includes(raw) ? raw : keys[0]
  const setTab = useCallback((key) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (key === keys[0]) next.delete(param); else next.set(param, key)
      return next
    }, { replace: true })
  }, [setParams, param, keys.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  return [active, setTab]
}

export function DetailTabs({ tabs, active, onChange, className }) {
  return (
    <div
      className={cn('sticky top-0 z-10 glass-chrome flex items-center gap-1 px-6 border-b border-border overflow-x-auto scrollbar-none', className)}
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      role="tablist"
    >
      {tabs.map(t => (
        <button key={t.key} role="tab" aria-selected={active === t.key} onClick={() => onChange(t.key)}
          className={cn(
            'shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 -mb-px',
            active === t.key
              ? 'border-brand-500 text-brand-ink bg-brand-500/5'
              : 'border-transparent text-text-muted hover:text-text-secondary hover:bg-surface-overlay'
          )}>
          {t.icon && <t.icon size={12} />} {t.label}
          {t.count !== undefined && t.count !== null && (
            <span className="ml-0.5 text-[10px] px-1.5 rounded-full bg-surface-overlay text-text-muted">{t.count}</span>
          )}
          {t.dot && <span className="w-1.5 h-1.5 rounded-full bg-status-warn-fg" />}
        </button>
      ))}
    </div>
  )
}

// ─── Status pill ────────────────────────────────────────────────────────────

const TONE = {
  pass:  'text-status-pass-fg bg-status-pass-bg',
  warn:  'text-status-warn-fg bg-status-warn-bg',
  fail:  'text-status-fail-fg bg-status-fail-bg',
  info:  'text-status-info-fg bg-status-info-bg',
  tag:   'text-status-tag-fg bg-status-tag-bg',
  muted: 'text-text-muted bg-surface-overlay',
}

const STATUS_TONE = {
  // subscriptions
  ACTIVE: 'pass', TRIAL: 'info', PAST_DUE: 'fail', CANCELLED: 'warn', CHURNED: 'fail',
  REPLACED: 'muted', EXPIRED: 'muted',
  // invoices
  DRAFT: 'muted', ISSUED: 'info', PAID: 'pass', OVERDUE: 'fail', VOID: 'muted',
  // firm verification
  SUBMITTED: 'info', UNDER_REVIEW: 'tag', INFO_REQUESTED: 'warn', APPROVED: 'pass',
  REJECTED: 'fail', REVOKED: 'fail', SUPERSEDED: 'muted',
  // tenants
  SUSPENDED: 'warn', INACTIVE: 'muted',
  // signals
  EXPANSION: 'pass', CHURN_RISK: 'warn',
  // change types
  NEW: 'info', RENEWAL: 'muted', UPGRADE: 'pass', DOWNGRADE: 'warn', REACTIVATION: 'tag',
  // website enquiries (NEW shared with change types above)
  IN_PROGRESS: 'tag', QUALIFIED: 'warn', CONVERTED: 'pass', CLOSED: 'muted',
}

export function StatusPill({ status, label, tone, className }) {
  if (!status && !label) return null
  const t = TONE[tone || STATUS_TONE[status] || 'muted']
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-badge text-[11px] font-medium leading-5 whitespace-nowrap', t, className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {label || humanize(status)}
    </span>
  )
}

export const humanize = (s) => s ? String(s).replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) : '—'

// ─── KPI tile ───────────────────────────────────────────────────────────────

export function Kpi({ label, value, sub, tone, hint, className }) {
  return (
    <div className={cn('rounded-card border border-border bg-surface-raised px-4 py-3 min-w-0', className)} title={hint}>
      <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide truncate">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold font-mono tabular-nums truncate',
        tone === 'good' ? 'text-status-pass-fg' : tone === 'bad' ? 'text-status-fail-fg' : tone === 'warn' ? 'text-status-warn-fg' : 'text-text-primary')}>
        {value ?? '—'}
      </p>
      {sub && <p className="text-[11px] text-text-muted mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

// ─── Read-only field row ────────────────────────────────────────────────────

export function Field({ label, children, mono, className }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide">{label}</p>
      <div className={cn('mt-0.5 text-sm text-text-primary break-words', mono && 'font-mono text-xs')}>
        {children === null || children === undefined || children === '' ? <span className="text-text-muted">—</span> : children}
      </div>
    </div>
  )
}

export function SectionTitle({ children, actions, className }) {
  return (
    <div className={cn('flex items-center justify-between mb-3', className)}>
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">{children}</h3>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 border border-dashed border-border rounded-card">
      {Icon && <Icon size={22} className="text-text-muted mb-2" strokeWidth={1.5} />}
      <p className="text-sm font-medium text-text-primary">{title}</p>
      {children && <p className="text-xs text-text-muted mt-1 max-w-md leading-relaxed">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

// ─── Form controls, styled like components/ui/Input ─────────────────────────

const CTRL = 'h-8 w-full rounded-ctl border border-border bg-surface-raised px-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60'

export function FormRow({ label, hint, children, className }) {
  return (
    <label className={cn('flex flex-col gap-1 min-w-0', className)}>
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-text-muted leading-snug">{hint}</span>}
    </label>
  )
}

export function TextIn(props) {
  return <input {...props} className={cn(CTRL, props.className)} />
}

export function SelectIn({ options = [], placeholder, ...props }) {
  return (
    <select {...props} className={cn(CTRL, 'pr-7', props.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(o => typeof o === 'string'
        ? <option key={o} value={o}>{humanize(o)}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function TextArea(props) {
  return <textarea rows={3} {...props}
    className={cn('w-full rounded-ctl border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500', props.className)} />
}

// ─── Misc ───────────────────────────────────────────────────────────────────

export function errMsg(err, fallback = 'Something went wrong') {
  return err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || fallback
}

export function fmtDate(v) {
  if (!v) return '—'
  try { return new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return String(v) }
}

export function daysUntil(v) {
  if (!v) return null
  const then = new Date(v)
  if (Number.isNaN(then.getTime())) return null
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const now = new Date()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((a - b) / 86400000)
}

export const today = () => new Date().toISOString().slice(0, 10)

/** Table shell with the house styling. */
export function Table({ head, children, className }) {
  return (
    <div className={cn('rounded-card border border-border overflow-x-auto bg-surface-raised', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-overlay/50">
            {head.map((h, i) => (
              <th key={i} className={cn('px-3 py-2 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wide whitespace-nowrap',
                typeof h === 'object' && h?.align === 'right' && 'text-right')}>
                {typeof h === 'object' ? h?.label : h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">{children}</tbody>
      </table>
    </div>
  )
}

export function Td({ children, className, right, mono, ...rest }) {
  return <td {...rest} className={cn('px-3 py-2 align-middle text-text-primary', right && 'text-right', mono && 'font-mono text-xs tabular-nums', className)}>{children}</td>
}
