import { cn } from '../../lib/cn'
import { COLOR_MAP } from '../../config/constants'

/**
 * StatusBadge — "Calm" v2. Soft pill: tinted background, leading dot,
 * no border, no uppercase. API unchanged (colorTag from ui_options).
 */
export function Badge({ value, label, colorTag, className }) {
  const cls = COLOR_MAP[colorTag] || COLOR_MAP.gray
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-badge',
        'text-xs font-medium leading-5',
        cls,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
      {label || value || '—'}
    </span>
  )
}

export function DynamicBadge({ value, componentKey, config, className }) {
  const options = config?.components?.[componentKey]?.options || []
  const opt = options.find(o => o.value === value)
  return <Badge value={value} label={opt?.label} colorTag={opt?.colorTag} className={className} />
}

/* COLOR_MAP replacement for src/config/constants.js — no borders now:

export const COLOR_MAP = {
  red:    'bg-status-fail-bg text-status-fail-fg',
  amber:  'bg-status-warn-bg text-status-warn-fg',
  yellow: 'bg-status-warn-bg text-status-warn-fg',
  green:  'bg-status-pass-bg text-status-pass-fg',
  blue:   'bg-status-info-bg text-status-info-fg',
  indigo: 'bg-status-tag-bg  text-status-tag-fg',
  purple: 'bg-status-tag-bg  text-status-tag-fg',
  cyan:   'bg-status-info-bg text-status-info-fg',
  gray:   'bg-status-pending-bg text-status-pending-fg',
}
*/
