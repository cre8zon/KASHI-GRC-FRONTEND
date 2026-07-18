import { useState, useRef, useEffect } from 'react'
import { cn } from '../../lib/cn'
import { Loader2, ChevronDown } from 'lucide-react'

/**
 * Button — "Calm" v3 restyle. API identical to the original Button
 * (variant, size, icon, loading, loadingText) so it's a drop-in file swap.
 *
 * What changed:
 *  - danger/warning/success are now SOLID or outlined-on-paper,
 *    not the bg-X-500/10 text-X-400 tinted-glow pattern
 *  - radius tightened to 4px (rounded-ctl)
 *  - secondary is a true paper button with a hairline border
 *  - focus ring uses brand at full contrast
 */

const variants = {
  primary:   'bg-brand-500 text-brand-900 hover:bg-brand-600 active:bg-brand-700 shadow-elevated hover:shadow-hover focus-visible:ring-brand-800/40',
  secondary: 'bg-surface-raised text-text-primary border border-border hover:bg-surface-overlay shadow-elevated',
  danger:    'bg-status-fail-bg text-status-fail-fg hover:brightness-[0.97]',
  warning:   'bg-status-warn-bg text-status-warn-fg hover:brightness-[0.97]',
  success:   'bg-status-pass-bg text-status-pass-fg hover:brightness-[0.97]',
  ghost:     'text-text-secondary hover:text-text-primary hover:bg-surface-overlay',
  link:      'text-brand-900 hover:text-brand-800 hover:underline underline-offset-2 p-0 h-auto',
}

const sizes = {
  xs: 'h-6 px-2 text-xs gap-1',
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-9 px-4 text-sm gap-2',
  'icon-xs': 'h-6 w-6 p-0',
  'icon-sm': 'h-7 w-7 p-0',
  'icon-md': 'h-8 w-8 p-0',
  'icon-lg': 'h-9 w-9 p-0',
}

const iconSize = { xs: 12, sm: 13, md: 14, lg: 15, 'icon-xs': 12, 'icon-sm': 13, 'icon-md': 14, 'icon-lg': 15 }

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
        'inline-flex items-center justify-center rounded-ctl font-medium select-none',
        'transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2',
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
          <Loader2 size={iSize} className="animate-spin shrink-0" />
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
 * v3: soft radii, glass-overlay menu, tonal divider (no hardcoded white).
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
    <div ref={ref} className="relative inline-flex rounded-ctl overflow-visible">
      {/* Primary action */}
      <button
        onClick={onClick}
        disabled={loading || disabled}
        className={cn(
          'inline-flex items-center rounded-l-ctl rounded-r-none border-r border-border-subtle font-medium',
          'transition-all duration-150 ease-out focus-visible:outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size]
        )}
      >
        {loading
          ? <Loader2 size={iSize} className="animate-spin shrink-0" />
          : label
        }
      </button>

      {/* Dropdown toggle */}
      <button
        onClick={() => setOpen(!open)}
        disabled={loading || disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-r-ctl rounded-l-none px-1.5 font-medium',
          'transition-all duration-150 ease-out focus-visible:outline-none border-l border-border-subtle',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant]
        )}
      >
        <ChevronDown size={iSize} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown menu — overlay surface, so glass applies */}
      {open && actions.length > 0 && (
        <div className="absolute top-full right-0 mt-1 z-50 min-w-[160px] glass-overlay rounded-ctl shadow-overlay overflow-hidden">
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
