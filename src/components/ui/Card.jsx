import { cn } from '../../lib/cn'

export function Card({ children, className, onClick, hover = false }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface-raised',
        hover && 'transition-all duration-200 hover:border-border-subtle hover:shadow-elevated cursor-pointer',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, actions, className }) {
  return (
    <div className={cn('flex items-start justify-between px-4 py-3 border-b border-border', className)}>
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ children, className }) {
  return <div className={cn('p-4', className)}>{children}</div>
}
