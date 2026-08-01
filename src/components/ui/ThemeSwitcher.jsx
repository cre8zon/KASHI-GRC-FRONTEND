import { useState } from 'react'
import { useTheme } from '../../hooks/useTheme'
import { BRAND_PRESETS, applyBrandPreset, getSavedBrandPreset } from '../../config/brandPresets'
import { Moon, Sun, Monitor } from 'lucide-react'
import { cn } from '../../lib/cn'

const THEMES = [
  { id: 'dark',   label: 'Dark',   icon: Moon    },
  { id: 'light',  label: 'Light',  icon: Sun     },
  { id: 'system', label: 'System', icon: Monitor },
]

/**
 * ThemeSwitcher — per-user dark/light/system toggle.
 * Drop anywhere: TopNav, SettingsPage, user profile dropdown.
 *
 * Usage:
 *   <ThemeSwitcher />           — icon-only pill (for TopNav)
 *   <ThemeSwitcher showLabel /> — with labels (for Settings page)
 */
export function ThemeSwitcher({ showLabel = false, className }) {
  const { theme, setTheme } = useTheme()

  return (
    <div className={cn(
      'flex items-center gap-0.5 p-0.5 rounded-card bg-surface-overlay border border-border',
      className
    )}>
      {THEMES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setTheme(id)}
          title={label}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded-ctl text-xs font-medium transition-colors',
            theme === id
              ? 'bg-surface-raised text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary'
          )}
        >
          <Icon size={13} />
          {showLabel && <span>{label}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * BrandPicker — the 12 pastel theme presets.
 * Rendered as a swatch grid, never a dropdown: the colour IS the label
 * ("Periwinkle" vs "Lilac" is meaningless as text).
 *
 * Applies instantly and persists to localStorage. Each preset swaps the
 * whole brand scale AND its matching pastel wash (data-brand on <html>).
 *
 *   <BrandPicker />            — swatch grid (Settings)
 *   <BrandPicker compact />    — tighter grid (dropdown/popover)
 */
export function BrandPicker({ compact = false, className }) {
  const [active, setActive] = useState(() => getSavedBrandPreset())

  const pick = (key) => {
    applyBrandPreset(key)
    setActive(key)
  }

  return (
    <div className={cn('flex flex-wrap', compact ? 'gap-1.5' : 'gap-2', className)}>
      {BRAND_PRESETS.map(({ key, name, hex }) => (
        <button
          key={key}
          onClick={() => pick(key)}
          title={name}
          aria-label={name}
          aria-pressed={active === key}
          className={cn(
            'rounded-full transition-all duration-150 ease-out',
            'ring-offset-2 ring-offset-surface-raised',
            compact ? 'w-6 h-6' : 'w-8 h-8',
            active === key
              ? 'ring-2 ring-text-primary scale-110'
              : 'ring-1 ring-border hover:scale-105 hover:ring-border-strong'
          )}
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  )
}
