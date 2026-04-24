import { cn } from '../../lib/cn'
import { COLOR_MAP } from '../../config/constants'

/**
 * StatusBadge — color driven by DB colorTag from ui_options.
 * Falls back to gray if colorTag not in map.
 */
export function Badge({ value, label, colorTag, className }) {
  const cls = COLOR_MAP[colorTag] || COLOR_MAP.gray
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium', cls, className)}>
      {label || value || '—'}
    </span>
  )
}

/**
 * DynamicBadge — reads its color from screenConfig options by componentKey + value.
 */
export function DynamicBadge({ value, componentKey, config, className }) {
  const options = config?.components?.[componentKey]?.options || []
  const opt = options.find(o => o.value === value)
  return <Badge value={value} label={opt?.label} colorTag={opt?.colorTag} className={className} />
}
