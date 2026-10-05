import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * PeopleMultiSelect — pick several people from a list the server already
 * limited to who is allowed (workspace members, or the organisation's staff).
 *
 * Same behaviour as DynamicForm's MULTI_LOOKUP (MultiEntityLookupField):
 * chosen people as chips with ×, a search box, and a list that STAYS OPEN with
 * a tick per row so choosing five people is five clicks. That field cannot be
 * reused here: it searches /v1/users (everyone, vendors and guests included)
 * and resolves chip labels from /v1/users/{id}, while these pickers must offer
 * only the eligible list.
 *
 * The list opens inline (not floating), so it is never clipped inside a modal.
 *
 * people:  [{ userId, name, email?, side? }]
 * value:   [userId]
 * lockedIds: ids that are always in and cannot be removed (e.g. the organiser)
 */
export function PeopleMultiSelect({ people = [], value = [], onChange, loading, placeholder = 'Search people…',
                                    sideLabel, lockedIds = [], emptyText = 'Nobody can be added here.' }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const input = useRef(null)
  const selected = useMemo(() => new Set((value || []).map(String)), [value])
  const locked = useMemo(() => new Set(lockedIds.map(String)), [lockedIds])
  const byId = useMemo(() => Object.fromEntries(people.map(p => [String(p.userId), p])), [people])

  useEffect(() => {
    if (!open) return undefined
    // Close on CLICK, not mousedown: closing on mousedown shrinks the dialog
    // before the mouse is released, so a click on a button below (Create,
    // Save) would land on empty space and need a second try.
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [open])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? people.filter(p => `${p.name} ${p.email || ''}`.toLowerCase().includes(s)) : people
  }, [people, q])

  const toggle = (uid) => {
    const k = String(uid)
    if (locked.has(k)) return
    onChange(selected.has(k) ? (value || []).filter(v => String(v) !== k) : [...(value || []), uid])
  }
  const allShownOn = shown.length > 0 && shown.every(p => selected.has(String(p.userId)))
  const toggleShown = () => {
    if (allShownOn) {
      const off = new Set(shown.map(p => String(p.userId)).filter(k => !locked.has(k)))
      onChange((value || []).filter(v => !off.has(String(v))))
    } else {
      const add = shown.map(p => p.userId).filter(id => !selected.has(String(id)))
      onChange([...(value || []), ...add])
    }
  }

  return (
    <div ref={box} className="flex flex-col gap-1.5">
      {(value || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(value || []).map(id => {
            const p = byId[String(id)]
            const fixed = locked.has(String(id))
            return (
              <span key={id} title={p?.email || undefined}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-ctl bg-brand-500/10 border border-brand-500/30 text-xs text-text-primary">
                {p?.name || `User ${id}`}
                {!fixed && (
                  <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${p?.name || id}`}
                    className="text-text-muted hover:text-text-primary transition-colors"><X size={11} /></button>
                )}
              </span>
            )
          })}
        </div>
      )}

      <div className={cn('flex items-center gap-2 h-9 rounded-ctl border bg-surface-raised px-2.5',
        open ? 'border-brand-500 ring-1 ring-brand-500' : 'border-border')}
        onClick={() => { setOpen(true); input.current?.focus() }}>
        <Search size={13} className="text-text-muted shrink-0" />
        <input ref={input} value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); e.stopPropagation() }
            if (e.key === 'Enter') { e.preventDefault(); if (shown.length === 1) toggle(shown[0].userId) }
          }}
          placeholder={(value || []).length ? 'Add another…' : placeholder}
          className="flex-1 min-w-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted" />
        <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }} aria-label={open ? 'Close list' : 'Open list'}
          className="text-text-muted"><ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} /></button>
      </div>

      {open && (
        <div className="rounded-ctl border border-border bg-surface-raised max-h-56 overflow-y-auto">
          {loading ? <p className="px-3 py-2 text-xs text-text-muted">Loading…</p>
            : shown.length === 0 ? <p className="px-3 py-2 text-xs text-text-muted">{people.length ? 'Nobody matches.' : emptyText}</p>
            : (
              <>
                {shown.length > 1 && (
                  <button type="button" onClick={toggleShown}
                    className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-brand-900 hover:bg-surface-overlay border-b border-border-subtle">
                    {allShownOn ? 'Clear these' : `Select all ${q.trim() ? 'matching' : ''} (${shown.length})`}
                  </button>
                )}
                {shown.map(p => {
                  const on = selected.has(String(p.userId))
                  const fixed = locked.has(String(p.userId))
                  return (
                    <button key={p.userId} type="button" onClick={() => toggle(p.userId)} disabled={fixed}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-overlay border-b border-border-subtle last:border-0 disabled:cursor-default">
                      <span className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                        on ? 'bg-brand-500 border-brand-500 text-brand-900' : 'border-border')}>
                        {on && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span className="text-sm text-text-primary flex-1 truncate">{p.name}{fixed ? ' (always in)' : ''}</span>
                      <span className="text-[11px] text-text-muted truncate max-w-[45%]">
                        {sideLabel && p.side ? sideLabel(p.side) : p.email}
                      </span>
                    </button>
                  )
                })}
              </>
            )}
        </div>
      )}
      <span className="text-[11px] text-text-muted">
        {(value || []).length > 0 ? `${(value || []).length} selected` : 'Nobody selected yet'}
      </span>
    </div>
  )
}