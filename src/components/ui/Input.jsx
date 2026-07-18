import { cn } from '../../lib/cn'
import { forwardRef } from 'react'

/** Input — v3 soft: 8px radius, inset fill, gentle 2px focus ring. */
export const Input = forwardRef(function Input({ label, error, helperText, className, ...props }, ref) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-text-secondary">{label}</label>}
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-ctl border border-transparent bg-surface-inset px-3 text-sm text-text-primary',
          'placeholder:text-text-muted',
          'focus:outline-none focus:bg-surface-raised focus:ring-2 focus:ring-brand-800/30 focus:border-brand-700/50',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-all duration-150',
          error && 'ring-2 ring-status-fail-fg/25 border-status-fail-fg/40',
          className
        )}
        {...props}
      />
      {(error || helperText) && (
        <p className={cn('text-xs', error ? 'text-status-fail-fg' : 'text-text-muted')}>{error || helperText}</p>
      )}
    </div>
  )
})

export const Textarea = forwardRef(function Textarea({ label, error, helperText, className, ...props }, ref) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-text-secondary">{label}</label>}
      <textarea
        ref={ref}
        rows={3}
        className={cn(
          'w-full rounded-ctl border border-transparent bg-surface-inset px-3 py-2 text-sm text-text-primary',
          'placeholder:text-text-muted resize-none',
          'focus:outline-none focus:bg-surface-raised focus:ring-2 focus:ring-brand-800/30 focus:border-brand-700/50',
          'transition-all duration-150',
          error && 'ring-2 ring-status-fail-fg/25',
          className
        )}
        {...props}
      />
      {(error || helperText) && (
        <p className={cn('text-xs', error ? 'text-status-fail-fg' : 'text-text-muted')}>{error || helperText}</p>
      )}
    </div>
  )
})
