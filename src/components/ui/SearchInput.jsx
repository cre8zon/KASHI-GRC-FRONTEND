import { useRef } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * SearchInput — the app's one search box for page toolbars and list headers.
 *
 *   <SearchInput value={q} onChange={setQ} placeholder="Search incidents…" />
 *
 * - Compact: 32px tall, narrow at rest, wider while focused or holding a term
 *   (pass `width` — the resting classes incl. its focus width, written out
 *   in full so Tailwind sees them, e.g. "w-40 focus:w-56" — and
 *   `activeWidth` for when it holds a term; or `fluid` to fill its container).
 * - Magnifier icon that is always visible. It sits ABOVE the field: the
 *   field's frosted glass (backdrop-filter) is painted over anything before it
 *   that has no z-index, which is why hand-built boxes showed no icon and
 *   just an empty left gap.
 * - A clear (×) button while it holds text, and Esc clears it.
 *
 * onChange receives the string, not the event.
 */
export function SearchInput({
  value, onChange, placeholder = 'Search…', className,
  width = 'w-44 focus:w-60', activeWidth = 'w-60', fluid = false,
  autoFocus, onKeyDown, 'aria-label': ariaLabel, ...rest
}) {
  const ref = useRef(null)
  const has = !!value
  const clear = () => { onChange?.(''); ref.current?.focus() }
  return (
    <div className={cn('relative group/search shrink-0', fluid && 'w-full', className)}>
      <Search size={13} aria-hidden="true"
        className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-text-muted group-focus-within/search:text-brand-ink transition-colors" />
      <input ref={ref} type="search" value={value ?? ''} autoFocus={autoFocus}
        onChange={e => onChange?.(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape' && has) { e.preventDefault(); clear() }
          onKeyDown?.(e)
        }}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder.replace(/…$/, '')}
        className={cn(
          'h-8 pl-8 pr-7 text-xs rounded-ctl glass-field border border-border text-text-primary placeholder:text-text-muted',
          'focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20',
          'transition-[width,border-color,box-shadow] duration-200',
          '[&::-webkit-search-cancel-button]:appearance-none',
          fluid ? 'w-full' : has ? activeWidth : width,
        )}
        {...rest} />
      {has && (
        <button type="button" onClick={clear} aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 h-5 w-5 flex items-center justify-center rounded-ctl text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
          <X size={12} />
        </button>
      )}
    </div>
  )
}