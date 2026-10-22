import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * GlassSelect — a styled, frosted drop-in replacement for the native <select>.
 *
 *   <GlassSelect value={v} onChange={e => setV(e.target.value)} className="h-8 w-full">
 *     <option value="">Pick one…</option>
 *     {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
 *   </GlassSelect>
 *
 * Same API as <select> on purpose, so every existing call site (144 of them —
 * user pickers, filters, form fields) converts by renaming the tag:
 *
 *   • A real <select> stays in the DOM, visually hidden, holding the options,
 *     value, name and ref. onChange fires from a REAL change event on it, so
 *     controlled state, react-hook-form `register`, `e.target.value`,
 *     `e.target.name`, form submit and `required` all behave exactly as before.
 *   • The visible part is a button + a portalled listbox (never clipped by a
 *     table or modal's overflow), with search for long lists, keyboard
 *     navigation, type-ahead, optgroup headings and disabled options.
 *   • `multiple` / `size` fall back to the native element — they are list
 *     boxes, not dropdowns.
 */

const HIDDEN_NATIVE = {
  position: 'fixed', top: 0, left: 0, width: 1, height: 1, margin: -1, padding: 0,
  opacity: 0, pointerEvents: 'none', overflow: 'hidden', clip: 'rect(0 0 0 0)', border: 0,
}
const SEARCH_THRESHOLD = 8      // show the search box when there are more options than this
const LIST_MAX_HEIGHT  = 288

// Classes that would paint over the frosted field. Layout/size/text classes pass through.
const STRIP = /^(?:bg-(?:surface|white|transparent|brand)[\w/-]*|appearance-none|cursor-pointer)$/

function readOptions(selectEl) {
  if (!selectEl) return []
  return Array.from(selectEl.options).map((o, index) => ({
    index,
    value: o.value,
    label: o.text,
    disabled: o.disabled,
    group: o.parentElement?.tagName === 'OPTGROUP' ? o.parentElement.label : null,
  }))
}

export const GlassSelect = forwardRef(function GlassSelect(props, forwardedRef) {
  const {
    className, style, children, disabled, multiple, size,
    id, title, autoFocus, placeholder,
    onBlur, onFocus,
    'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    ...selectProps   // value, defaultValue, onChange, name, required, form, …
  } = props

  // Native fallback for list-box modes.
  if (multiple || (size && Number(size) > 1)) {
    return (
      <select ref={forwardedRef} className={cn('glass-field rounded-ctl', className)} style={style}
              multiple={multiple} size={size} disabled={disabled} id={id} title={title}
              onBlur={onBlur} onFocus={onFocus} aria-label={ariaLabel} {...selectProps}>
        {children}
      </select>
    )
  }

  /* eslint-disable react-hooks/rules-of-hooks -- the early return above is
     decided by props that never change for a given element in practice. */
  const nativeRef  = useRef(null)
  const buttonRef  = useRef(null)
  const listRef    = useRef(null)
  const searchRef  = useRef(null)
  const [open, setOpen]       = useState(false)
  const [label, setLabel]     = useState('')
  const [isEmpty, setIsEmpty] = useState(true)
  const [options, setOptions] = useState([])
  const [active, setActive]   = useState(-1)
  const [query, setQuery]     = useState('')
  const [pos, setPos]         = useState(null)
  const typeahead = useRef({ text: '', at: 0 })

  // The forwarded ref is the native <select> — what register()/callers expect.
  useImperativeHandle(forwardedRef, () => nativeRef.current, [])

  // Mirror the native element's current selection into the button.
  const sync = useCallback(() => {
    const el = nativeRef.current
    if (!el) return
    const opt = el.options[el.selectedIndex]
    setLabel(opt ? opt.text : '')
    setIsEmpty(!opt || opt.value === '')
  })
  useLayoutEffect(() => { sync() })   // every render: value or options may have changed

  const commit = (opt) => {
    const el = nativeRef.current
    if (!el || opt.disabled) return
    if (el.value !== opt.value) {
      // Set through the prototype setter so React's value tracker sees the
      // change, then fire a real bubbling change event → props.onChange runs
      // with a genuine event whose target is the <select>.
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(el, opt.value)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    sync()
    close(true)
  }

  const place = () => {
    const r = buttonRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const up = below < Math.min(LIST_MAX_HEIGHT + 60, 260) && r.top > below
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 220) - 8)),
      width: Math.max(r.width, 220),
      top: up ? undefined : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : undefined,
      maxHeight: Math.max(160, Math.min(LIST_MAX_HEIGHT, (up ? r.top : below) - 16)),
    })
  }

  const openList = () => {
    if (disabled) return
    const opts = readOptions(nativeRef.current)
    setOptions(opts)
    setQuery('')
    const sel = nativeRef.current?.selectedIndex ?? -1
    setActive(sel >= 0 ? sel : opts.findIndex(o => !o.disabled))
    place()
    setOpen(true)
    onFocus?.({ target: nativeRef.current, type: 'focus' })
  }

  const close = (refocus) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
    onBlur?.({ target: nativeRef.current, type: 'blur' })
  }

  // Outside click / scroll / resize while open.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (buttonRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return
      close(false)
    }
    const onScroll = (e) => { if (!listRef.current?.contains(e.target)) place() }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase()
  const visible = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options
  const showSearch = options.length > SEARCH_THRESHOLD

  // Keep the active row in view; focus search when shown.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector(`[data-opt="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])
  useEffect(() => {
    if (open && showSearch) requestAnimationFrame(() => searchRef.current?.focus())
    else if (open) requestAnimationFrame(() => listRef.current?.focus())
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const move = (dir) => {
    const idxs = visible.filter(o => !o.disabled).map(o => o.index)
    if (!idxs.length) return
    const at = idxs.indexOf(active)
    const next = at === -1 ? idxs[0] : idxs[Math.max(0, Math.min(idxs.length - 1, at + dir))]
    setActive(next)
  }

  const onListKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(visible.find(o => !o.disabled)?.index ?? -1) }
    else if (e.key === 'End') { e.preventDefault(); setActive([...visible].reverse().find(o => !o.disabled)?.index ?? -1) }
    else if (e.key === 'Enter') { e.preventDefault(); const o = options[active]; if (o) commit(o) }
    else if (e.key === 'Escape') { e.preventDefault(); close(true) }
    else if (e.key === 'Tab') { close(false) }
    else if (!showSearch && e.key.length === 1) {
      const now = Date.now()
      typeahead.current.text = (now - typeahead.current.at < 700 ? typeahead.current.text : '') + e.key.toLowerCase()
      typeahead.current.at = now
      const hit = options.find(o => !o.disabled && o.label.toLowerCase().startsWith(typeahead.current.text))
      if (hit) setActive(hit.index)
    }
  }

  const onButtonKey = (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList() }
  }

  const passClasses = String(className || '').split(/\s+/).filter(c => c && !STRIP.test(c)).join(' ')

  let lastGroup = null
  return (
    <>
      <select
        ref={nativeRef}
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        // position:fixed, not .sr-only (absolute): an absolutely positioned
        // element with no positioned ancestor escapes its scroll container and
        // makes the whole document scrollable — the page would jump.
        style={HIDDEN_NATIVE}
        onChange={() => {}}   // overwritten by selectProps.onChange when supplied
        {...selectProps}
      >
        {children}
      </select>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        title={title}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onButtonKey}
        style={style}
        className={cn(
          'glass-field inline-flex items-center justify-between gap-2 rounded-ctl px-2.5 text-left text-sm text-text-primary',
          'h-9 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open && 'ring-2 ring-brand-ink/25',
          passClasses
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', isEmpty && 'text-text-muted')}>
          {label || placeholder || ' '}
        </span>
        <ChevronDown size={14} aria-hidden className={cn('shrink-0 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && pos && createPortal(
        <div
          className="glass-overlay fixed z-[400] flex flex-col overflow-hidden rounded-card animate-fade-in"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          onKeyDown={onListKey}
        >
          {showSearch && (
            <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-2.5 py-2">
              <Search size={13} className="shrink-0 text-text-muted" aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  const ql = e.target.value.trim().toLowerCase()
                  const first = options.find(o => !o.disabled && (!ql || o.label.toLowerCase().includes(ql)))
                  setActive(first ? first.index : -1)
                }}
                placeholder="Search…"
                aria-label="Search options"
                className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-faint focus:outline-none"
              />
            </div>
          )}
          <ul ref={listRef} role="listbox" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto py-1 focus:outline-none">
            {visible.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-text-muted">No match for “{query}”</li>
            )}
            {visible.map((o) => {
              const header = o.group && o.group !== lastGroup ? o.group : null
              lastGroup = o.group
              const selected = nativeRef.current?.selectedIndex === o.index
              return [
                header && (
                  <li key={`g-${o.index}`} role="presentation"
                      className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    {header}
                  </li>
                ),
                <li
                  key={o.index}
                  data-opt={o.index}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={o.disabled || undefined}
                  onMouseEnter={() => !o.disabled && setActive(o.index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(o)}
                  className={cn(
                    'mx-1 flex cursor-pointer items-center gap-2 rounded-ctl px-2.5 py-1.5 text-sm',
                    o.disabled ? 'cursor-not-allowed text-text-faint' : 'text-text-primary',
                    active === o.index && !o.disabled && 'bg-brand-500/12',
                    o.value === '' && !o.disabled && 'text-text-muted'
                  )}
                >
                  <span className="w-4 shrink-0">{selected && <Check size={14} className="text-brand-ink" />}</span>
                  <span className={cn('min-w-0 flex-1 truncate', selected && 'font-semibold')}>{o.label || ' '}</span>
                </li>,
              ]
            })}
          </ul>
        </div>,
        document.body
      )}
    </>
  )
})

export default GlassSelect
