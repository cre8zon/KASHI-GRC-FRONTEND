import { cn } from '../../lib/cn'

export function PageLayout({ title, subtitle, actions, children, className }) {
  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Page header */}
      {(title || actions) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            {title && <h1 className="text-base font-semibold text-text-primary">{title}</h1>}
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

export function PageSection({ title, children, className }) {
  return (
    <div className={cn('px-6 py-4', className)}>
      {title && <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{title}</h2>}
      {children}
    </div>
  )
}
