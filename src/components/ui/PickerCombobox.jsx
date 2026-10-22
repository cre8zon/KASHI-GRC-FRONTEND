import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * PickerCombobox — a searchable single-select for long entity lists
 * (tenants, vendors).
 *
 * Replaces native <select> for these pickers because a native list opens
 * scrolled to the CURRENTLY SELECTED option. With the platform admin's own
 * System tenant pre-selected somewhere in the middle of the list, the picker
 * always opened mid-list. This one always opens at the top, with the newest
 * (or A–Z) entries first, a search box focused, and the current selection
 * marked — not jumped to.
 *
 * items: [{ value, label, sub?, createdAt? }]
 * pinned: values shown first, above the sorted list (e.g. "your own tenant")
 * allOption: optional { label } rendered as the first row with value null
 */
const SORTS = [
  { key: 'newest', label: 'Newest' },
  { key: 'az',     label: 'A–Z' },
]

export function PickerCombobox({
  label,
  value,
  onChange,
  items = [],
  loading = false,
  placeholder = 'Select…',
  allOption,
  pinned = [],
  defaultSort = 'newest',
  sortStorageKey,
  className,
  minWidth = 260,
}) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort]   = useState(() => {
    if (!sortStorageKey) return defaultSort
    try { return localStorage.getItem(sortStorageKey) || defaultSort } catch { return defaultSort }
  })
  const [active, setActive] = useState(0)
  const rootRef  = useRef(null)
  const listRef  = useRef(null)
  const inputRef = useRef(null)

  const selected = items.find(i => String(i.value) === String(value))

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (i) => !q || i.label?.toLowerCase().includes(q) || i.sub?.toLowerCase().includes(q)
    const sorted = [...items].sort((a, b) => {
      if (sort === 'az') return String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' })
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      if (tb !== ta) return tb - ta
      return Number(b.value) - Number(a.value)        // newer id first as a tiebreak
    })
    const pinnedSet = new Set(pinned.map(String))
    const top  = sorted.filter(i => pinnedSet.has(String(i.value)))
    const rest = sorted.filter(i => !pinnedSet.has(String(i.value)))
    const out = [...top, ...rest].filter(match)
    if (allOption && !q) out.unshift({ value: null, label: allOption.label, isAll: true })
    return out
  }, [items, query, sort, pinned, allOption])

  // Always open at the top, search focused.
  useEffect(() => {
    if (!open) return
    setActive(0)
    if (listRef.current) listRef.current.scrollTop = 0
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])
  useEffect(() => { setActive(0); if (listRef.current) listRef.current.scrollTop = 0 }, [query, sort])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const choose = (row) => {
    onChange(row.isAll ? null : row.value)
    setOpen(false)
    setQuery('')
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(rows.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[active]) choose(rows[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const changeSort = (k) => {
    setSort(k)
    if (sortStorageKey) { try { localStorage.setItem(sortStorageKey, k) } catch { /* */ } }
  }

  const buttonLabel = loading
    ? 'Loading…'
    : selected ? selected.label : (value == null && allOption ? allOption.label : placeholder)

  return (
    <div ref={rootRef} className={cn('relative inline-flex items-center gap-2', className)}>
      {label && (
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{label}</span>
      )}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading && !items.length}
        style={{ minWidth }}
        className="glass-field h-8 px-2.5 rounded-ctl inline-flex items-center justify-between gap-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-ink/30 disabled:opacity-60"
      >
        <span className={cn('truncate', !selected && !(value == null && allOption) && 'text-text-muted')}>{buttonLabel}</span>
        <ChevronDown size={14} className={cn('shrink-0 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 glass-overlay rounded-card overflow-hidden"
          style={{ minWidth: Math.max(minWidth, 300) }}
          onKeyDown={onKeyDown}
        >
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border-subtle">
            <Search size={13} className="text-text-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label={`Search ${label || 'options'}`}
              className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-faint focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search"
                className="text-text-muted hover:text-text-primary"><X size={13} /></button>
            )}
            <div className="flex items-center rounded-ctl bg-surface-inset p-0.5" role="group" aria-label="Sort">
              {SORTS.map(s => (
                <button key={s.key} type="button" onClick={() => changeSort(s.key)}
                  aria-pressed={sort === s.key}
                  className={cn('px-1.5 py-0.5 rounded-badge text-[10px] font-semibold transition-colors',
                    sort === s.key ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary')}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <ul ref={listRef} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {rows.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-text-muted">
                {loading ? 'Loading…' : query ? `No match for “${query}”` : 'Nothing to show'}
              </li>
            )}
            {rows.map((row, idx) => {
              const isSel = row.isAll ? value == null : String(row.value) === String(value)
              return (
                <li key={row.isAll ? '__all' : row.value}
                    data-idx={idx}
                    role="option"
                    aria-selected={isSel}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => choose(row)}
                    className={cn('mx-1 px-2.5 py-1.5 rounded-ctl flex items-center gap-2 cursor-pointer text-sm',
                      idx === active ? 'bg-brand-500/12' : '',
                      row.isAll && 'text-text-secondary')}>
                  <span className="w-4 shrink-0">{isSel && <Check size={14} className="text-brand-ink" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate', isSel ? 'font-semibold text-text-primary' : 'text-text-primary')}>{row.label}</span>
                    {row.sub && <span className="block truncate text-[11px] text-text-muted">{row.sub}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export default PickerCombobox