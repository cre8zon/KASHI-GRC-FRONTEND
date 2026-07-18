import { cn } from '../../../lib/cn'

function InspectorSection({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[10px]">
      <span className="text-text-muted shrink-0">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  )
}

function IField({ label, children }) {
  return (
    <div>
      <label className="text-[9px] text-text-muted uppercase tracking-wide block mb-0.5">{label}</label>
      {children}
    </div>
  )
}

function IInp({ value, onChange, placeholder, mono, accent }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={cn('w-full h-7 px-2 bg-surface-overlay border border-border rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-brand-500', mono && 'font-mono', accent ? 'text-brand-ink' : 'text-text-primary')} />
  )
}

function ISel({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full h-7 px-2 bg-surface-overlay border border-border rounded text-[10px] text-text-primary focus:outline-none">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}


export { InspectorSection, Row, IField, IInp, ISel }
