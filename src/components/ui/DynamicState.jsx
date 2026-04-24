import * as Icons from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useScreenStates } from '../../hooks/useUiStates'
import { cn } from '../../lib/cn'

const COLOR_CONFIG = {
  green:  { bg: 'bg-green-500/10',  icon: 'text-green-400',  border: 'border-green-500/20' },
  red:    { bg: 'bg-red-500/10',    icon: 'text-red-400',    border: 'border-red-500/20'   },
  amber:  { bg: 'bg-amber-500/10',  icon: 'text-amber-400',  border: 'border-amber-500/20' },
  blue:   { bg: 'bg-blue-500/10',   icon: 'text-blue-400',   border: 'border-blue-500/20'  },
  purple: { bg: 'bg-purple-500/10', icon: 'text-purple-400', border: 'border-purple-500/20'},
  gray:   { bg: 'bg-slate-500/10',  icon: 'text-slate-400',  border: 'border-slate-500/20' },
}

/**
 * DynamicState — renders a DB-driven state (empty/error/success) for any screen.
 *
 * Usage:
 *   <DynamicState screenKey="vendor_list" stateType="EMPTY" />
 *   <DynamicState screenKey="tenant_create" stateType="SUCCESS" onCta={() => navigate('/tenants')} />
 *
 * Falls back to hardcoded props if DB state not found.
 */
export function DynamicState({
  screenKey,
  stateType,        // 'SUCCESS' | 'ERROR' | 'EMPTY' | 'LOADING' | 'FORBIDDEN' | 'NOT_FOUND'
  // Fallback props (used when DB state not configured yet)
  fallbackTitle,
  fallbackDescription,
  fallbackIcon = 'Circle',
  fallbackColor = 'gray',
  fallbackCtaLabel,
  fallbackCtaAction,
  // Callbacks
  onCta,
  onSecondaryCta,
  className,
}) {
  const { data: states } = useScreenStates(screenKey)
  const navigate = useNavigate()

  // Pick state from DB map, fall back to hardcoded values
  const state = states?.[stateType]

  const title       = state?.title            || fallbackTitle
  const description = state?.description      || fallbackDescription
  const iconName    = state?.icon             || fallbackIcon
  const colorTag    = state?.colorTag         || fallbackColor
  const ctaLabel    = state?.ctaLabel         || fallbackCtaLabel
  const ctaAction   = state?.ctaAction        || fallbackCtaAction
  const secLabel    = state?.secondaryCtaLabel
  const secAction   = state?.secondaryCtaAction

  const colors = COLOR_CONFIG[colorTag] || COLOR_CONFIG.gray
  const Icon = Icons[iconName] || Icons.Circle

  const handleCta = () => {
    if (onCta) return onCta()
    if (ctaAction?.startsWith('/')) navigate(ctaAction)
  }

  const handleSecondaryCta = () => {
    if (onSecondaryCta) return onSecondaryCta()
    if (secAction?.startsWith('/')) navigate(secAction)
  }

  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      {/* Icon circle */}
      <div className={cn(
        'w-16 h-16 rounded-2xl flex items-center justify-center mb-5 border',
        colors.bg, colors.border
      )}>
        <Icon size={28} className={colors.icon} strokeWidth={1.5} />
      </div>

      {title && (
        <h3 className="text-base font-semibold text-text-primary mb-2">{title}</h3>
      )}
      {description && (
        <p className="text-sm text-text-secondary max-w-sm leading-relaxed">{description}</p>
      )}

      {/* CTAs */}
      {(ctaLabel || secLabel) && (
        <div className="flex items-center gap-3 mt-6">
          {ctaLabel && (
            <button
              onClick={handleCta}
              className="h-8 px-4 rounded-md bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
            >
              {ctaLabel}
            </button>
          )}
          {secLabel && (
            <button
              onClick={handleSecondaryCta}
              className="h-8 px-4 rounded-md border border-border text-text-secondary text-sm hover:text-text-primary hover:bg-surface-overlay transition-colors"
            >
              {secLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Inline state variants — convenience wrappers for common patterns.
 */
export const EmptyState = (props) => <DynamicState stateType="EMPTY" fallbackIcon="PackageOpen" fallbackColor="gray" {...props} />
export const ErrorState = (props) => <DynamicState stateType="ERROR" fallbackIcon="AlertTriangle" fallbackColor="red" {...props} />
export const SuccessState = (props) => <DynamicState stateType="SUCCESS" fallbackIcon="CheckCircle2" fallbackColor="green" {...props} />
export const ForbiddenState = (props) => <DynamicState stateType="FORBIDDEN" fallbackIcon="ShieldX" fallbackColor="amber" {...props} />
