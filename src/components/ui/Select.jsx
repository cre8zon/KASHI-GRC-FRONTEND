import { forwardRef } from 'react'
import { cn } from '../../lib/cn'
import { GlassSelect } from './GlassSelect'

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
      <GlassSelect
        ref={ref}
        className={cn('h-9 w-full', error && '!border-status-fail-fg/70 ring-2 ring-status-fail-fg/25', className)}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        <option value="">{placeholder || `Select ${component?.label || componentKey}…`}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </GlassSelect>
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
      <GlassSelect
        ref={ref}
        className={cn('h-8 w-full', error && '!border-status-fail-fg/70 ring-2 ring-status-fail-fg/25', className)}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </GlassSelect>
      {error && <p className="text-xs text-status-fail-fg">{error}</p>}
    </div>
  )
})