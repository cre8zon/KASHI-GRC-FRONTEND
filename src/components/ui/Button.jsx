import { cn } from '../../lib/cn'

const variants = {
  primary:   'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 focus-visible:ring-brand-500/50',
  secondary: 'bg-surface-overlay text-text-primary hover:bg-surface-raised border border-border',
  danger:    'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20',
  ghost:     'text-text-secondary hover:text-text-primary hover:bg-surface-overlay',
  warning:   'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20',
}
const sizes = {
  xs: 'h-6 px-2 text-xs gap-1',
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-9 px-4 text-sm gap-2',
}

export function Button({ variant = 'primary', size = 'md', icon: Icon, children, className, loading, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium',
        'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant], sizes[size], className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading
        ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : Icon && <Icon size={size === 'xs' ? 12 : size === 'sm' ? 13 : 14} strokeWidth={2} />
      }
      {children}
    </button>
  )
}

/**
 * DynamicActionBar — renders action buttons from DB ui_actions.
 * Filters by entityStatus automatically on server; just pass the actions array.
 */
export function DynamicActionBar({ actions = [], onAction, entityId, className }) {
  if (!actions.length) return null
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {actions.map(action => (
        <Button
          key={action.actionKey}
          variant={action.variant || 'secondary'}
          size="sm"
          onClick={() => onAction?.(action, entityId)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  )
}
