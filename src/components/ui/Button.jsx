import { cn } from '../../lib/cn'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

// ─── Variants & sizes (backward compatible — existing variants unchanged) ─────

const variants = {
  primary:   'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 focus-visible:ring-brand-500/50',
  secondary: 'bg-surface-overlay text-text-primary hover:bg-surface-raised border border-border',
  danger:    'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20',
  ghost:     'text-text-secondary hover:text-text-primary hover:bg-surface-overlay',
  warning:   'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20',
  // NEW
  link:      'text-brand-400 hover:text-brand-300 hover:underline underline-offset-2 p-0 h-auto',
  success:   'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20',
}

const sizes = {
  xs: 'h-6 px-2 text-xs gap-1',
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-9 px-4 text-sm gap-2',
  // NEW: icon-only sizes (square, no horizontal padding)
  'icon-xs': 'h-6 w-6 p-0',
  'icon-sm': 'h-7 w-7 p-0',
  'icon-md': 'h-8 w-8 p-0',
  'icon-lg': 'h-9 w-9 p-0',
}

const iconSize = { xs: 12, sm: 13, md: 14, lg: 15, 'icon-xs': 12, 'icon-sm': 13, 'icon-md': 14, 'icon-lg': 15 }

/**
 * Button — extended, backward compatible.
 *
 * New props:
 *   loadingText  — shown next to spinner instead of hiding children: <Button loading loadingText="Saving…">Save</Button>
 *   size="icon-sm" — square icon-only button (no children text)
 *   variant="link" — inline text link style
 *   variant="success" — green tinted
 */
export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  children,
  className,
  loading,
  loadingText,
  ...props
}) {
  const iSize = iconSize[size] || 14
  const isIconOnly = size.startsWith('icon')

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium',
        'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <>
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
          {loadingText && <span>{loadingText}</span>}
          {!loadingText && !isIconOnly && children}
        </>
      ) : (
        <>
          {Icon && <Icon size={iSize} strokeWidth={2} className="shrink-0" />}
          {!isIconOnly && children}
        </>
      )}
    </button>
  )
}

/**
 * SplitButton — primary action + dropdown of secondary actions.
 *
 * <SplitButton
 *   label="Publish"
 *   onClick={handlePublish}
 *   actions={[
 *     { label: 'Publish & notify', onClick: handlePublishNotify },
 *     { label: 'Save as draft', onClick: handleDraft },
 *   ]}
 * />
 */
export function SplitButton({ label, onClick, actions = [], variant = 'primary', size = 'sm', loading, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const iSize = iconSize[size] || 13

  return (
    <div ref={ref} className="relative inline-flex rounded-md overflow-visible">
      {/* Primary action */}
      <button
        onClick={onClick}
        disabled={loading || disabled}
        className={cn(
          'inline-flex items-center rounded-l-md rounded-r-none border-r border-white/20 font-medium',
          'transition-all duration-150 focus-visible:outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size]
        )}
      >
        {loading
          ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : label
        }
      </button>

      {/* Dropdown toggle */}
      <button
        onClick={() => setOpen(!open)}
        disabled={loading || disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-r-md rounded-l-none px-1.5 font-medium',
          'transition-all duration-150 focus-visible:outline-none border-l border-white/20',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant]
        )}
      >
        <ChevronDown size={iSize} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown menu */}
      {open && actions.length > 0 && (
        <div className="absolute top-full right-0 mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-surface-raised shadow-elevated overflow-hidden">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => { action.onClick?.(); setOpen(false) }}
              disabled={action.disabled}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors text-left disabled:opacity-50"
            >
              {action.icon && <action.icon size={12} />}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * DynamicActionBar — unchanged, backward compatible.
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