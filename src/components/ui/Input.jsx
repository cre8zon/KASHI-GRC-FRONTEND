import { cn } from '../../lib/cn'
import { forwardRef } from 'react'

export const Input = forwardRef(function Input({ label, error, helperText, className, ...props }, ref) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</label>}
      <input
        ref={ref}
        className={cn(
          'h-8 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary',
          'placeholder:text-text-muted',
          'focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors duration-150',
          error && 'border-red-500/50 focus:ring-red-500/50',
          className
        )}
        {...props}
      />
      {(error || helperText) && (
        <p className={cn('text-xs', error ? 'text-red-400' : 'text-text-muted')}>{error || helperText}</p>
      )}
    </div>
  )
})

export const Textarea = forwardRef(function Textarea({ label, error, helperText, className, ...props }, ref) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</label>}
      <textarea
        ref={ref}
        rows={3}
        className={cn(
          'w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary',
          'placeholder:text-text-muted resize-none',
          'focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500',
          error && 'border-red-500/50',
          className
        )}
        {...props}
      />
      {(error || helperText) && (
        <p className={cn('text-xs', error ? 'text-red-400' : 'text-text-muted')}>{error || helperText}</p>
      )}
    </div>
  )
})
