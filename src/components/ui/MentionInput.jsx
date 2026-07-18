/**
 * MentionInput — a textarea with @mention autocomplete.
 *
 * Features:
 *   - Type @ anywhere to open a user dropdown (searches by name)
 *   - Click or Enter to insert @FirstName into the text
 *   - Tracks mentionedUserIds[] separately so the API can notify them
 *   - Supports all visibility levels (Shared / Vendor notes / Org notes)
 *   - Used identically in SharedTab, VendorNotesTab, ActionItemThread, and
 *     any future comment box — drop in as a replacement for plain <textarea>
 *
 * Props:
 *   value          string        — controlled text value
 *   onChange       (text, mentionedIds) => void  — called on every change
 *   onSubmit       () => void    — called on Ctrl+Enter
 *   placeholder    string
 *   rows           number (default 3)
 *   disabled       bool
 *   autoFocus      bool
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal }  from 'react-dom'
import { useQuery }       from '@tanstack/react-query'
import { AtSign, User }   from 'lucide-react'
import { cn }             from '../../lib/cn'
import { usersApi }       from '../../api/users.api'

// Debounce helper — avoid hammering the API on every keystroke
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Add a comment… (Ctrl+Enter to send)',
  rows = 3,
  disabled = false,
  autoFocus = false,
  className,
}) {
  const textareaRef = useRef(null)
  const dropdownRef = useRef(null)

  // Which inline panel is open: null = closed
  const [mentionQuery, setMentionQuery] = useState(null)
  const [mentionStart, setMentionStart] = useState(0)
  const [selectedIdx,  setSelectedIdx]  = useState(0)
  const [mentionedIds, setMentionedIds] = useState([])

  // Portal dropdown position — computed from textarea's bounding rect
  const [dropdownPos, setDropdownPos]   = useState({ top: 0, left: 0, width: 0 })

  // Recompute position whenever dropdown opens or window scrolls/resizes
  useEffect(() => {
    if (mentionQuery === null || !textareaRef.current) return
    const update = () => {
      const rect = textareaRef.current?.getBoundingClientRect()
      if (rect) setDropdownPos({ top: rect.top - 4, left: rect.left, width: rect.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [mentionQuery])

  const debouncedQuery = useDebounce(mentionQuery || '', 200)

  // User search — only fires when there's an active @query
  const { data: searchResult } = useQuery({
    queryKey: ['mention-users', debouncedQuery],
    queryFn: () => usersApi.list({
      // Backend CriteriaQueryHelper format: "field=value;field2=value2" with OR matching
      // Search by firstname OR lastname so typing either works
      search: debouncedQuery
        ? `firstname=${debouncedQuery};lastname=${debouncedQuery}`
        : undefined,
      take: 50,  // fetch more so we can show a useful list even without a query
      skip: 0,
    }),
    enabled: mentionQuery !== null,
    select: (d) => {
      const items = Array.isArray(d) ? d : (d?.items || d?.data || [])
      return items.map(u => ({
        id:    u.id || u.userId,
        name:  [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
        email: u.email,
      }))
    },
    staleTime: 10_000,
  })

  const suggestions = searchResult || []

  // When text changes, detect @ mentions
  const handleChange = useCallback((e) => {
    const text    = e.target.value
    const caret   = e.target.selectionStart

    // Find the nearest @ before the caret (not preceded by alphanumeric = new mention)
    const beforeCaret = text.slice(0, caret)
    const atMatch     = beforeCaret.match(/@(\w*)$/)

    if (atMatch) {
      setMentionQuery(atMatch[1])      // empty string = show all, word = search
      setMentionStart(caret - atMatch[0].length)
      setSelectedIdx(0)
    } else {
      setMentionQuery(null)
    }

    onChange(text, mentionedIds.map(m => m.id))
  }, [mentionedIds, onChange])

  // Insert selected mention into text
  const insertMention = useCallback((user) => {
    if (!textareaRef.current) return
    const text   = value
    const before = text.slice(0, mentionStart)
    const after  = text.slice(textareaRef.current.selectionStart)
    const insert = `@${user.name} `
    const newText = before + insert + after

    // Track mentioned user
    setMentionedIds(prev => {
      if (prev.find(m => m.id === user.id)) return prev
      return [...prev, user]
    })
    setMentionQuery(null)

    const newIds = mentionedIds.find(m => m.id === user.id)
      ? mentionedIds.map(m => m.id)
      : [...mentionedIds.map(m => m.id), user.id]
    onChange(newText, newIds)

    // Restore focus + move caret after inserted name
    setTimeout(() => {
      const pos = before.length + insert.length
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(pos, pos)
    }, 0)
  }, [value, mentionStart, mentionedIds, onChange])

  // Keyboard navigation in dropdown
  const handleKeyDown = useCallback((e) => {
    if (mentionQuery !== null && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (suggestions[selectedIdx]) { e.preventDefault(); insertMention(suggestions[selectedIdx]); return }
      }
      if (e.key === 'Escape') { setMentionQuery(null) }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSubmit) {
      e.preventDefault()
      onSubmit()
    }
  }, [mentionQuery, suggestions, selectedIdx, insertMention, onSubmit])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!dropdownRef.current?.contains(e.target) && !textareaRef.current?.contains(e.target)) {
        setMentionQuery(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Clear mentioned ids when value is cleared (after submit)
  useEffect(() => {
    if (!value) setMentionedIds([])
  }, [value])

  const showDropdown = mentionQuery !== null && suggestions.length > 0

  return (
    <div className={cn('relative', className)}>
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none disabled:opacity-50"
      />

      {/* @mention indicator when active */}
      {mentionQuery !== null && (
        <span className="absolute right-2 top-2 text-[10px] text-brand-400/60 flex items-center gap-0.5 pointer-events-none">
          <AtSign size={10} />
          {mentionQuery || 'mention someone'}
        </span>
      )}

      {/* Dropdown — rendered in a portal at document.body to escape overflow:auto clipping.
          Position: fixed, placed just above the textarea using getBoundingClientRect(). */}
      {showDropdown && createPortal(
        <div ref={dropdownRef}
          style={{
            position: 'fixed',
            top:      dropdownPos.top,
            left:     dropdownPos.left,
            width:    dropdownPos.width,
            transform: 'translateY(-100%)',
            zIndex:   9999,
          }}
          className="bg-surface-raised border border-border rounded-card shadow-elevated overflow-hidden">
          <div className="max-h-52 overflow-y-auto">
            {suggestions.map((user, i) => (
              <button
                key={user.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(user) }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  i === selectedIdx
                    ? 'bg-brand-500/15 text-brand-300'
                    : 'text-text-secondary hover:bg-surface-overlay'
                )}>
                <div className="w-6 h-6 rounded-full bg-surface-overlay border border-border flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-text-muted">
                  {user.name[0]?.toUpperCase() || <User size={10} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate">{user.name}</p>
                  {user.email && <p className="text-[10px] text-text-muted truncate">{user.email}</p>}
                </div>
              </button>
            ))}
          </div>
          <div className="px-3 py-1 border-t border-border">
            <p className="text-[9px] text-text-muted/50">↑↓ navigate · Enter to select · Esc to close</p>
          </div>
        </div>,
        document.body
      )}

      {/* Mentioned users chips */}
      {mentionedIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {mentionedIds.map(m => (
            <span key={m.id}
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 text-brand-400">
              <AtSign size={8} />
              {m.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}