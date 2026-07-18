/**
 * ui-primitives.jsx — new UI components missing from the existing library.
 *
 * All components:
 *   - Match the existing design system (CSS vars: --color-border, surface-overlay, brand-500, etc.)
 *   - Are backward-safe (no changes to existing components)
 *   - Export named — import { Tooltip, Callout, … } from './ui-primitives'
 *
 * Contents:
 *   Tooltip          — hover tooltip with positioning
 *   Callout          — inline info/warning/error/success block
 *   Progress         — linear + circular progress
 *   Breadcrumb       — path navigation
 *   Stepper          — multi-step form progress indicator
 *   TagInput         — chip/tag input field
 *   MultiSelect      — multi-select with chips display
 *   AsyncSelect      — search-as-you-type select with async options
 *   DateRangePicker  — from/to date range input
 *   FileDropZone     — generic drag-and-drop file input (wraps EvidenceUploader concept)
 */

import {
  useState, useRef, useEffect, useCallback, forwardRef
} from 'react'
import {
  Info, AlertTriangle, CheckCircle2, XCircle, X,
  ChevronRight, ChevronDown, Search, Calendar,
  Upload, File, Loader2,
} from 'lucide-react'
import { cn } from '../../lib/cn'

// ─────────────────────────────────────────────────────────────────────────────
// TOOLTIP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * <Tooltip content="Help text">
 *   <button>Hover me</button>
 * </Tooltip>
 *
 * Props:
 *   content   — string or JSX
 *   side      — 'top' | 'bottom' | 'left' | 'right'  (default 'top')
 *   delay     — ms before showing (default 300)
 */
export function Tooltip({ children, content, side = 'top', delay = 300, className }) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)

  const show = () => { timerRef.current = setTimeout(() => setVisible(true), delay) }
  const hide = () => { clearTimeout(timerRef.current); setVisible(false) }

  const posClass = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left:   'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right:  'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }[side] || 'bottom-full left-1/2 -translate-x-1/2 mb-1.5'

  if (!content) return children

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <span className={cn(
          'absolute z-50 pointer-events-none whitespace-nowrap',
          'px-2 py-1 rounded-ctl text-[11px] font-medium',
          'bg-surface-raised border border-border text-text-primary shadow-elevated',
          'animate-fade-in',
          posClass, className
        )}>
          {content}
        </span>
      )}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CALLOUT — inline info/warning/error/success block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * <Callout variant="warning" title="Note">Your message here</Callout>
 * <Callout variant="error">Something went wrong.</Callout>
 *
 * Props:
 *   variant  — 'info' | 'warning' | 'error' | 'success'  (default 'info')
 *   title    — optional bold heading
 *   icon     — override icon (Lucide component)
 *   onClose  — if set, shows an X button
 */
export function Callout({ variant = 'info', title, children, icon: IconOverride, onClose, className }) {
  const config = {
    info:    { Icon: Info,         cls: 'bg-status-info-bg border-status-info-bd text-status-info-fg',    iconCls: 'text-status-info-fg' },
    warning: { Icon: AlertTriangle,cls: 'bg-status-warn-bg border-status-warn-bd text-status-warn-fg', iconCls: 'text-status-warn-fg' },
    error:   { Icon: XCircle,      cls: 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg',       iconCls: 'text-status-fail-fg' },
    success: { Icon: CheckCircle2, cls: 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg', iconCls: 'text-status-pass-fg' },
  }[variant] || {}

  const Icon = IconOverride || config.Icon

  return (
    <div className={cn(
      'flex items-start gap-2.5 px-3 py-2.5 rounded-card border text-xs',
      config.cls, className
    )}>
      {Icon && <Icon size={13} className={cn('mt-0.5 shrink-0', config.iconCls)} />}
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
      {onClose && (
        <button onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
          <X size={13} />
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS — linear + circular
// ─────────────────────────────────────────────────────────────────────────────

/**
 * <Progress value={60} max={100} label="60%" />
 * <Progress variant="circular" value={75} size={48} strokeWidth={4} />
 *
 * Props (linear):
 *   value, max, label, color — 'brand' | 'green' | 'amber' | 'red'
 *   showLabel — show text label at end
 *
 * Props (circular):
 *   variant="circular", value, max, size, strokeWidth, label
 */
export function Progress({
  variant = 'linear',
  value = 0,
  max = 100,
  label,
  color = 'brand',
  showLabel = false,
  size = 40,
  strokeWidth = 4,
  className,
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  const barColor = {
    brand: 'bg-brand-500',
    green: 'bg-status-pass-bg',
    amber: 'bg-status-warn-bg',
    red:   'bg-status-fail-bg',
    blue:  'bg-status-info-bg',
  }[color] || 'bg-brand-500'

  if (variant === 'circular') {
    const r = (size - strokeWidth) / 2
    const circ = 2 * Math.PI * r
    const offset = circ * (1 - pct / 100)
    const strokeColor = { brand: 'rgb(var(--color-brand-600))', green: 'var(--status-pass-fg)', amber: 'var(--status-warn-fg)', red: 'var(--status-fail-fg)', blue: 'var(--status-info-fg)' }[color] || 'rgb(var(--color-brand-600))'

    return (
      <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-border opacity-30" />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={strokeColor} strokeWidth={strokeWidth}
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
        </svg>
        {label && (
          <span className="absolute text-[10px] font-semibold text-text-primary">{label}</span>
        )}
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-1.5 bg-surface-overlay rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {(showLabel || label) && (
        <span className="text-[10px] font-mono text-text-muted shrink-0 w-8 text-right">
          {label || `${Math.round(pct)}%`}
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BREADCRUMB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * <Breadcrumb items={[
 *   { label: 'Admin', href: '/admin' },
 *   { label: 'Workflows' },
 * ]} />
 */
export function Breadcrumb({ items = [], className }) {
  return (
    <nav className={cn('flex items-center gap-1 text-xs', className)}>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={11} className="text-text-muted shrink-0" />}
          {item.href && i < items.length - 1 ? (
            <a href={item.href} className="text-text-muted hover:text-text-primary transition-colors">
              {item.label}
            </a>
          ) : (
            <span className={i === items.length - 1 ? 'text-text-primary font-medium' : 'text-text-muted'}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STEPPER — multi-step form progress
// ─────────────────────────────────────────────────────────────────────────────

/**
 * <Stepper
 *   steps={['Identity', 'Config', 'Schema', 'Status', 'Capabilities']}
 *   current={2}
 *   onChange={setStep}
 * />
 */
export function Stepper({ steps = [], current = 0, onChange, className }) {
  return (
    <div className={cn('flex items-center gap-0', className)}>
      {steps.map((label, i) => {
        const done    = i < current
        const active  = i === current
        const future  = i > current

        return (
          <span key={i} className="flex items-center">
            <button
              onClick={() => onChange?.(i)}
              disabled={future}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-ctl text-xs font-medium transition-colors',
                active  ? 'text-brand-400 bg-brand-500/10' : '',
                done    ? 'text-text-secondary hover:text-text-primary cursor-pointer' : '',
                future  ? 'text-text-muted cursor-default' : '',
              )}
            >
              <span className={cn(
                'w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0',
                active ? 'bg-brand-500 text-brand-900' : done ? 'bg-status-pass-bg text-status-pass-fg' : 'bg-surface-overlay border border-border text-text-muted'
              )}>
                {done ? '✓' : i + 1}
              </span>
              <span className="hidden sm:block">{label}</span>
            </button>
            {i < steps.length - 1 && (
              <span className={cn('w-6 h-px mx-0.5 shrink-0', done ? 'bg-status-pass-bg' : 'bg-border')} />
            )}
          </span>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAG INPUT — chip-style multi-value input
// ─────────────────────────────────────────────────────────────────────────────

/**
 * <TagInput
 *   value={['SOX', 'PCI-DSS']}
 *   onChange={setTags}
 *   placeholder="Add framework…"
 *   suggestions={['SOX', 'PCI-DSS', 'ISO27001', 'HIPAA', 'SOC2', 'GDPR']}
 * />
 */
export function TagInput({ value = [], onChange, placeholder = 'Add…', suggestions = [], label, error, className }) {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)

  const filteredSuggestions = suggestions.filter(
    s => s.toLowerCase().includes(input.toLowerCase()) && !value.includes(s)
  )

  const addTag = (tag) => {
    const trimmed = tag.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInput('')
  }

  const removeTag = (tag) => onChange(value.filter(v => v !== tag))

  const handleKey = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      addTag(input)
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  return (
    <div className={className}>
      {label && <label className="text-xs font-medium text-text-secondary block mb-1">{label}</label>}
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          'relative min-h-8 w-full rounded-ctl border bg-surface-raised px-2 py-1',
          'flex flex-wrap items-center gap-1 cursor-text',
          focused ? 'border-brand-500 ring-1 ring-brand-500' : 'border-border',
          error && 'border-status-fail-bd'
        )}
      >
        {value.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-500/15 border border-brand-500/25 text-brand-400 text-[11px] font-medium">
            {tag}
            <button onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
              className="text-brand-400/60 hover:text-status-fail-fg transition-colors">
              <X size={9} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => { setTimeout(() => setFocused(false), 150); if (input.trim()) addTag(input) }}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-16 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
        />

        {/* Suggestions dropdown */}
        {focused && input && filteredSuggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-ctl border border-border bg-surface-raised shadow-elevated max-h-36 overflow-y-auto">
            {filteredSuggestions.map(s => (
              <button key={s} onMouseDown={() => addTag(s)}
                className="w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-overlay text-left transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-status-fail-fg mt-1">{error}</p>}
      <p className="text-[10px] text-text-muted mt-0.5">Press Enter or comma to add</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-SELECT — chips display
// ─────────────────────────────────────────────────────────────────────────────

/**
 * <MultiSelect
 *   options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]}
 *   value={['a']}
 *   onChange={setSelected}
 *   placeholder="Select…"
 * />
 */
export function MultiSelect({ options = [], value = [], onChange, placeholder = 'Select…', label, error, className, maxDisplay = 3 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const toggle = (v) => {
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  }

  const selected = options.filter(o => value.includes(o.value))

  return (
    <div ref={ref} className={className}>
      {label && <label className="text-xs font-medium text-text-secondary block mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full min-h-8 rounded-ctl border bg-surface-raised px-2 py-1',
          'flex flex-wrap items-center gap-1 text-left',
          open ? 'border-brand-500 ring-1 ring-brand-500' : 'border-border',
          error && 'border-status-fail-bd'
        )}
      >
        {selected.length === 0 && (
          <span className="text-xs text-text-muted">{placeholder}</span>
        )}
        {selected.slice(0, maxDisplay).map(o => (
          <span key={o.value} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-500/15 border border-brand-500/25 text-brand-400 text-[11px]">
            {o.label}
            <span onMouseDown={(e) => { e.stopPropagation(); toggle(o.value) }}
              className="text-brand-400/60 hover:text-status-fail-fg cursor-pointer">
              <X size={9} />
            </span>
          </span>
        ))}
        {selected.length > maxDisplay && (
          <span className="text-[11px] text-text-muted">+{selected.length - maxDisplay} more</span>
        )}
        <ChevronDown size={12} className={cn('ml-auto text-text-muted shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-ctl border border-border bg-surface-raised shadow-elevated max-h-48 overflow-y-auto">
          {options.map(o => {
            const checked = value.includes(o.value)
            return (
              <button key={o.value} type="button" onClick={() => toggle(o.value)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-overlay text-left transition-colors">
                <span className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
                  checked ? 'bg-brand-500 border-brand-500' : 'border-border')}>
                  {checked && <CheckCircle2 size={9} className="text-on-dark" />}
                </span>
                {o.label}
              </button>
            )
          })}
          {options.length === 0 && <p className="px-3 py-2 text-xs text-text-muted">No options</p>}
        </div>
      )}
      {error && <p className="text-xs text-status-fail-fg mt-1">{error}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ASYNC SELECT — search-as-you-type with async option loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * <AsyncSelect
 *   value={selectedUser}
 *   onChange={setSelectedUser}
 *   loadOptions={async (q) => usersApi.search(q).then(r => r.map(u => ({ value: u.id, label: u.name })))}
 *   placeholder="Search users…"
 *   minChars={2}
 * />
 */
export function AsyncSelect({ value, onChange, loadOptions, placeholder = 'Search…', minChars = 2, label, error, className, displayValue }) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const handleInput = (q) => {
    setQuery(q)
    setOpen(true)
    if (q.length < minChars) { setOptions([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try { setOptions(await loadOptions(q)) }
      catch { setOptions([]) }
      finally { setLoading(false) }
    }, 300)
  }

  const select = (opt) => {
    onChange(opt)
    setQuery('')
    setOpen(false)
  }

  const currentLabel = value ? (displayValue?.(value) || value?.label || String(value)) : ''

  return (
    <div ref={ref} className={cn('relative', className)}>
      {label && <label className="text-xs font-medium text-text-secondary block mb-1">{label}</label>}
      <div className={cn('relative flex items-center')}>
        <Search size={13} className="absolute left-2.5 text-text-muted pointer-events-none" />
        <input
          value={open ? query : currentLabel}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => { setOpen(true); setQuery('') }}
          placeholder={placeholder}
          className={cn(
            'w-full h-8 pl-8 pr-3 text-xs bg-surface-raised border rounded-ctl',
            'text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500',
            open ? 'border-brand-500' : 'border-border',
            error && 'border-status-fail-bd'
          )}
        />
        {value && (
          <button onClick={() => { onChange(null); setQuery('') }}
            className="absolute right-2 text-text-muted hover:text-text-primary">
            <X size={12} />
          </button>
        )}
      </div>

      {open && (query.length >= minChars || options.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-ctl border border-border bg-surface-raised shadow-elevated max-h-48 overflow-y-auto">
          {loading && <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted"><Loader2 size={12} className="animate-spin" /> Searching…</div>}
          {!loading && query.length < minChars && <p className="px-3 py-2 text-xs text-text-muted">Type {minChars} characters to search</p>}
          {!loading && query.length >= minChars && options.length === 0 && <p className="px-3 py-2 text-xs text-text-muted">No results</p>}
          {options.map(o => (
            <button key={o.value} onClick={() => select(o)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-overlay text-left transition-colors">
              {o.avatar && <span className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center text-[9px] font-bold text-brand-400 shrink-0">{o.avatar}</span>}
              <div className="flex-1 min-w-0">
                <div className="truncate">{o.label}</div>
                {o.sublabel && <div className="text-[10px] text-text-muted truncate">{o.sublabel}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-status-fail-fg mt-1">{error}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE RANGE PICKER — from/to date range
// ─────────────────────────────────────────────────────────────────────────────

/**
 * <DateRangePicker
 *   value={{ from: '2025-01-01', to: '2025-12-31' }}
 *   onChange={setRange}
 *   label="Date range"
 * />
 */
export function DateRangePicker({ value = {}, onChange, label, error, className, minDate, maxDate }) {
  return (
    <div className={className}>
      {label && <label className="text-xs font-medium text-text-secondary block mb-1">{label}</label>}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="date"
            value={value.from || ''}
            min={minDate}
            max={value.to || maxDate}
            onChange={e => onChange({ ...value, from: e.target.value })}
            className={cn(
              'w-full h-8 pl-8 pr-2 text-xs bg-surface-raised border border-border rounded-ctl',
              'text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500',
              error && 'border-status-fail-bd'
            )}
          />
        </div>
        <span className="text-xs text-text-muted shrink-0">to</span>
        <div className="relative flex-1">
          <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="date"
            value={value.to || ''}
            min={value.from || minDate}
            max={maxDate}
            onChange={e => onChange({ ...value, to: e.target.value })}
            className={cn(
              'w-full h-8 pl-8 pr-2 text-xs bg-surface-raised border border-border rounded-ctl',
              'text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500',
              error && 'border-status-fail-bd'
            )}
          />
        </div>
        {(value.from || value.to) && (
          <button onClick={() => onChange({})} className="text-text-muted hover:text-text-primary shrink-0">
            <X size={13} />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-status-fail-fg mt-1">{error}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE DROP ZONE — generic drag-and-drop (EvidenceUploader is entity-specific)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * <FileDropZone
 *   onFiles={handleFiles}
 *   accept=".pdf,.xlsx,.csv"
 *   multiple
 *   maxSizeMb={10}
 *   label="Drop files here"
 * />
 */
export function FileDropZone({ onFiles, accept, multiple = false, maxSizeMb = 20, label, hint, error, className, disabled }) {
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState([])
  const inputRef = useRef(null)

  const processFiles = (rawFiles) => {
    const arr = Array.from(rawFiles)
    if (maxSizeMb) {
      const oversized = arr.filter(f => f.size > maxSizeMb * 1024 * 1024)
      if (oversized.length > 0) {
        return // caller should handle validation
      }
    }
    const newFiles = multiple ? arr : arr.slice(0, 1)
    setFiles(newFiles)
    onFiles?.(newFiles)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (!disabled) processFiles(e.dataTransfer.files)
  }

  const removeFile = (name) => {
    const updated = files.filter(f => f.name !== name)
    setFiles(updated)
    onFiles?.(updated)
  }

  return (
    <div className={className}>
      {label && <label className="text-xs font-medium text-text-secondary block mb-1">{label}</label>}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-2 p-6 rounded-card border-2 border-dashed cursor-pointer transition-colors',
          dragging ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:border-brand-500/40 hover:bg-brand-500/3',
          disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
          error && 'border-status-fail-bd',
          files.length > 0 && 'pb-3'
        )}
      >
        <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden"
          onChange={e => processFiles(e.target.files)} />
        <Upload size={20} className={cn('transition-colors', dragging ? 'text-brand-400' : 'text-text-muted')} />
        <div className="text-center">
          <p className="text-xs font-medium text-text-secondary">
            {dragging ? 'Drop to upload' : 'Drop files or click to browse'}
          </p>
          {hint && <p className="text-[10px] text-text-muted mt-0.5">{hint}</p>}
          {!hint && accept && <p className="text-[10px] text-text-muted mt-0.5">Accepted: {accept} · Max {maxSizeMb}MB</p>}
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-2 space-y-1">
          {files.map(f => (
            <div key={f.name} className="flex items-center gap-2 px-3 py-2 rounded-card bg-surface-overlay border border-border text-xs">
              <File size={12} className="text-brand-400 shrink-0" />
              <span className="flex-1 truncate text-text-primary">{f.name}</span>
              <span className="text-text-muted shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
              <button onClick={(e) => { e.stopPropagation(); removeFile(f.name) }}
                className="text-text-muted hover:text-status-fail-fg transition-colors shrink-0">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-status-fail-fg mt-1">{error}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP — search-as-you-type reference field (alias for AsyncSelect with entity styling)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * <Lookup
 *   entityType="USER"
 *   value={selectedUser}
 *   onChange={setSelectedUser}
 *   loadOptions={(q) => usersApi.search(q)}
 *   placeholder="Search users…"
 * />
 */
export function Lookup({ entityType, ...props }) {
  return <AsyncSelect {...props} />
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE FIELD TYPES — missing from UiFormField.FieldType
// These are React rendering components for use in DynamicForm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PhoneInput — formatted phone number input
 */
export function PhoneInput({ label, value, onChange, error, placeholder = '+1 (555) 000-0000', ...props }) {
  return (
    <div>
      {label && <label className="text-xs font-medium text-text-secondary block mb-1">{label}</label>}
      <input type="tel" value={value} onChange={onChange} placeholder={placeholder}
        className={cn('w-full h-8 px-3 text-xs bg-surface-raised border rounded-ctl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500',
          error ? 'border-status-fail-bd' : 'border-border')} {...props} />
      {error && <p className="text-xs text-status-fail-fg mt-1">{error}</p>}
    </div>
  )
}

/**
 * CurrencyInput — number input with currency prefix
 */
export function CurrencyInput({ label, value, onChange, error, currency = 'USD', placeholder = '0.00', ...props }) {
  return (
    <div>
      {label && <label className="text-xs font-medium text-text-secondary block mb-1">{label}</label>}
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted font-medium">{currency}</span>
        <input type="number" step="0.01" value={value} onChange={onChange} placeholder={placeholder}
          className={cn('w-full h-8 pl-11 pr-3 text-xs bg-surface-raised border rounded-ctl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500',
            error ? 'border-status-fail-bd' : 'border-border')} {...props} />
      </div>
      {error && <p className="text-xs text-status-fail-fg mt-1">{error}</p>}
    </div>
  )
}

/**
 * RatingInput — star/number rating
 */
export function RatingInput({ label, value, onChange, max = 5, error }) {
  return (
    <div>
      {label && <label className="text-xs font-medium text-text-secondary block mb-1">{label}</label>}
      <div className="flex items-center gap-1">
        {Array.from({ length: max }, (_, i) => i + 1).map(n => (
          <button key={n} type="button" onClick={() => onChange(n)}
            className={cn('text-lg transition-colors', n <= (value || 0) ? 'text-status-warn-fg' : 'text-border hover:text-status-warn-fg')}>
            ★
          </button>
        ))}
        {value > 0 && (
          <button type="button" onClick={() => onChange(0)} className="text-xs text-text-muted hover:text-text-primary ml-2">
            <X size={12} />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-status-fail-fg mt-1">{error}</p>}
    </div>
  )
}

/**
 * SliderInput — range slider
 */
export function SliderInput({ label, value, onChange, min = 0, max = 100, step = 1, error, showValue = true }) {
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-text-secondary">{label}</label>
          {showValue && <span className="text-xs font-mono text-brand-400">{value}</span>}
        </div>
      )}
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-brand-500" />
      <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
        <span>{min}</span><span>{max}</span>
      </div>
      {error && <p className="text-xs text-status-fail-fg mt-1">{error}</p>}
    </div>
  )
}

/**
 * JsonEditor — syntax-highlighted JSON textarea with validation
 */
export function JsonEditor({ label, value, onChange, error, rows = 8, placeholder }) {
  const [localError, setLocalError] = useState('')

  const handleChange = (raw) => {
    onChange(raw)
    try { JSON.parse(raw); setLocalError('') }
    catch (e) { setLocalError('Invalid JSON: ' + e.message) }
  }

  const format = () => {
    try { onChange(JSON.stringify(JSON.parse(value), null, 2)) }
    catch {}
  }

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-text-secondary">{label}</label>
          <button type="button" onClick={format} className="text-[10px] text-text-muted hover:text-brand-400 transition-colors">Format</button>
        </div>
      )}
      <textarea
        value={value || ''}
        onChange={e => handleChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        className={cn(
          'w-full px-3 py-2 text-[11px] font-mono bg-surface-raised border rounded-ctl',
          'text-text-primary placeholder:text-text-muted resize-none',
          'focus:outline-none focus:ring-1 focus:ring-brand-500',
          (error || localError) ? 'border-status-fail-bd' : 'border-border'
        )}
      />
      {(localError || error) && <p className="text-xs text-status-fail-fg mt-1">{localError || error}</p>}
    </div>
  )
}