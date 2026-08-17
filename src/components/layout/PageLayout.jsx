import { ArrowLeft } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * onBack — optional. When supplied, a back arrow is rendered to the left of the
 * title. Purely additive: every existing caller omits it and renders unchanged.
 */
export function PageLayout({ title, subtitle, actions, children, className, onBack }) {
  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Page header */}
      {(title || actions) && (
        <div className="flex items-center justify-between px-6 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Go back"
                className="h-7 w-7 shrink-0 flex items-center justify-center rounded-card hover:bg-surface-overlay transition-colors">
                <ArrowLeft size={15} className="text-text-muted" />
              </button>
            )}
            <div className="min-w-0">
              {title && <h1 className="text-base font-semibold text-text-primary truncate">{title}</h1>}
              {subtitle && <p className="text-xs text-text-muted mt-0.5 truncate">{subtitle}</p>}
            </div>
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