import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Type, Heading2, List, Quote, Image as ImageIcon, Code2, Sparkles,
  Info, Table2, HelpCircle, ListOrdered, MousePointerClick, Download,
  Youtube, Columns3, Search,
} from 'lucide-react'
import { blocks as factories } from '../../../../api/content.api'
import { cn } from '../../../../lib/cn'

/**
 * The + menu.
 *
 * ── ORDERED BY WHAT PEOPLE REACH FOR, NOT ALPHABETICALLY ─────────────────────
 * Paragraph and heading are ninety per cent of use. Then the four that earn
 * their keep in search — tldr, callout, table, faq. Then everything else.
 * An alphabetical list puts `callout` above `heading`, which is tidy and wrong.
 *
 * Keyboard-first: it opens focused on the filter, arrow keys move, Enter
 * inserts. Someone writing a long article opens this thirty times.
 */
const CATALOGUE = [
  { key: 'paragraph', label: 'Paragraph', icon: Type,       hint: 'Body text',            make: factories.paragraph },
  { key: 'heading',   label: 'Heading',   icon: Heading2,   hint: 'H2, H3 or H4',         make: factories.heading },

  { key: 'tldr',    label: 'Key takeaways', icon: Sparkles, hint: 'Extractable summary — put this near the top', make: factories.tldr, starred: true },
  { key: 'callout', label: 'Callout',       icon: Info,     hint: 'Note, tip or warning',                        make: factories.callout, starred: true },
  { key: 'table',   label: 'Table',         icon: Table2,   hint: 'Structured comparison',                       make: factories.table, starred: true },
  { key: 'faq',     label: 'FAQ',           icon: HelpCircle, hint: 'Becomes FAQPage structured data',           make: factories.faq, starred: true },

  { key: 'list',       label: 'List',       icon: List,       hint: 'Bulleted or numbered', make: factories.list },
  { key: 'steps',      label: 'Steps',      icon: ListOrdered, hint: 'Numbered how-to',     make: factories.steps },
  { key: 'quote',      label: 'Quote',      icon: Quote,      hint: 'Pull quote',           make: factories.quote },
  { key: 'image',      label: 'Image',      icon: ImageIcon,  hint: 'From the library',     make: () => factories.image(null) },
  { key: 'code',       label: 'Code',       icon: Code2,      hint: 'Syntax highlighted',   make: factories.code },
  { key: 'cta',        label: 'Call to action', icon: MousePointerClick, hint: 'Inline nudge or block', make: factories.cta },
  { key: 'download',   label: 'Download',   icon: Download,   hint: 'Checklist or template', make: () => factories.download(null) },
  { key: 'embed',      label: 'Embed',      icon: Youtube,    hint: 'YouTube or Loom',      make: factories.embed },
  { key: 'comparison', label: 'Comparison', icon: Columns3,   hint: 'From competitor records', make: factories.comparison },
]

export function BlockPicker({ onPick, onClose }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CATALOGUE
    return CATALOGUE.filter((c) =>
      c.label.toLowerCase().includes(q) || c.key.includes(q) || c.hint.toLowerCase().includes(q))
  }, [query])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setActive(0) }, [query])

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); results[active] && onPick(results[active].make()) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose?.() }
  }

  return (
    <div className="glass-overlay w-[22rem] overflow-hidden rounded-modal border border-border shadow-overlay">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <Search size={14} className="shrink-0 text-text-faint" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search blocks"
          className="w-full border-0 bg-transparent text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:ring-0"
        />
      </div>

      <div ref={listRef} className="max-h-80 overflow-y-auto p-1">
        {results.map((item, i) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(item.make())}
              className={cn(
                'flex w-full items-center gap-3 rounded-ctl px-2.5 py-2 text-left transition-colors',
                i === active ? 'bg-surface-overlay' : 'hover:bg-surface-overlay'
              )}
            >
              <span className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-ctl',
                item.starred ? 'bg-brand-500 text-brand-900' : 'bg-surface-inset text-text-secondary'
              )}>
                <Icon size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-text-primary">{item.label}</span>
                <span className="block truncate text-xs text-text-faint">{item.hint}</span>
              </span>
            </button>
          )
        })}
        {results.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-text-faint">No block matches that.</p>
        )}
      </div>
    </div>
  )
}