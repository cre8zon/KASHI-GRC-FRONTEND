import { useTheme } from '../../hooks/useTheme'
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
      'flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-overlay border border-border',
      className
    )}>
      {THEMES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setTheme(id)}
          title={label}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
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