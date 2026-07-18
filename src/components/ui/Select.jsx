import { forwardRef } from 'react'
import { cn } from '../../lib/cn'
import { ChevronDown } from 'lucide-react'

/**
 * DynamicSelect — options come from DB via screenConfig.components[componentKey].options
 *
 * label prop behaviour:
 *   undefined (not passed) → fall back to component?.label from DB config
 *   null                   → suppress label entirely; caller owns it (e.g. DynamicForm's FieldWrapper)
 *   "some string"          → render that string as label
 *
 * This distinction matters because component?.label is always populated from the DB,
 * so a simple falsy check (label || component?.label) can never be suppressed by
 * passing label={null} — null is falsy and the fallback would still win.
 * The explicit === null guard fixes that.
 */
export const DynamicSelect = forwardRef(function DynamicSelect(
  { componentKey, config, label, error, className, placeholder, ...props }, ref
) {
  const component = config?.components?.[componentKey]
  const options   = component?.options?.filter(o => o.isActive !== false) || []

  // null  → caller is rendering the label (FieldWrapper in DynamicForm) — render nothing
  // undef → not passed → use DB component label as fallback
  // str   → use the provided string
  const resolvedLabel = label === null ? null : (label || component?.label || null)

  return (
    <div className="flex flex-col gap-1">
      {resolvedLabel && (
        <label className="text-xs font-medium text-text-secondary">
          {resolvedLabel}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'h-9 w-full appearance-none rounded-ctl border border-transparent',
            'bg-surface-inset px-3 pr-8 text-sm text-text-primary',
            'focus:outline-none focus:bg-surface-raised focus:ring-2 focus:ring-brand-800/30 focus:border-brand-700/50',
            'disabled:opacity-50 transition-all duration-150',
            error && 'ring-2 ring-status-fail-fg/25',
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
      {error && <p className="text-xs text-status-fail-fg">{error}</p>}
    </div>
  )
})

export const Select = forwardRef(function Select({ label, error, options = [], className, placeholder, ...props }, ref) {
  return (
    <div className="flex flex-col gap-1">
      {label && label !== null && (
        <label className="text-xs font-medium text-text-secondary">{label}</label>
      )}
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'h-8 w-full appearance-none rounded-ctl border border-border',
            'bg-surface-raised px-3 pr-8 text-sm text-text-primary',
            'focus:outline-none focus:ring-1 focus:ring-brand-500',
            error && 'border-status-fail-bd',
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      </div>
      {error && <p className="text-xs text-status-fail-fg">{error}</p>}
    </div>
  )
})