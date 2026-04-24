import { forwardRef } from 'react'
import { cn } from '../../lib/cn'
import { ChevronDown } from 'lucide-react'

/**
 * DynamicSelect — options come from DB via screenConfig.components[componentKey].options
 */
export const DynamicSelect = forwardRef(function DynamicSelect(
  { componentKey, config, label, error, className, placeholder, ...props }, ref
) {
  const component = config?.components?.[componentKey]
  const options   = component?.options?.filter(o => o.isActive !== false) || []

  return (
    <div className="flex flex-col gap-1">
      {(label || component?.label) && (
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          {label || component?.label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'h-8 w-full appearance-none rounded-md border border-border',
            'bg-surface-raised px-3 pr-8 text-sm text-text-primary',
            'focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500',
            'disabled:opacity-50 transition-colors duration-150',
            error && 'border-red-500/50',
            className
          )}
          {...props}
        >
          <option value="">{placeholder || `Select ${component?.label || componentKey}…`}</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
})

export const Select = forwardRef(function Select({ label, error, options = [], className, placeholder, ...props }, ref) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</label>}
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'h-8 w-full appearance-none rounded-md border border-border',
            'bg-surface-raised px-3 pr-8 text-sm text-text-primary',
            'focus:outline-none focus:ring-1 focus:ring-brand-500',
            error && 'border-red-500/50',
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
})
