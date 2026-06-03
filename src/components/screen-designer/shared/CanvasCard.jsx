import { cn } from '../../../lib/cn'

function CanvasCard({ children, className, selected, onClick, label, hint }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-lg border transition-all',
        onClick ? 'cursor-pointer' : '',
        selected
          ? 'border-brand-500 ring-2 ring-brand-500/20 bg-brand-500/3'
          : onClick ? 'border-border hover:border-brand-500/50 bg-background' : 'border-border bg-background',
        className
      )}
    >
      {(label || hint) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-secondary rounded-t-lg">
          {label && <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{label}</span>}
          {hint  && <span className="text-[10px] text-text-muted font-mono italic">{hint}</span>}
        </div>
      )}
      {children}
    </div>
  )
}


export { CanvasCard }
