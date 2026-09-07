import { Heading2, Type, Sparkles, Info, Table2, HelpCircle } from 'lucide-react'
import { cn } from '../../../../lib/cn'

/**
 * The left rail: the article's shape at a glance.
 *
 * ── WHY IT SHOWS EVERY BLOCK, NOT JUST HEADINGS ──────────────────────────────
 * A heading-only outline is a table of contents, which the reader gets on the
 * public page. The writer needs to see that the TL;DR is missing, or that there
 * are eleven paragraphs between two headings. That is a structural problem you
 * can only see from a distance.
 */
const ICONS = {
  heading: Heading2, paragraph: Type, tldr: Sparkles,
  callout: Info, table: Table2, faq: HelpCircle,
}

export function BlockOutline({ outline, activeId, onJump, stats }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border-subtle px-4 py-3">
        <p className="text-xs font-medium text-text-secondary">Outline</p>
        <p className="reg-code mt-0.5 font-mono text-[11px] tabular-nums text-text-faint">
          {stats.words} words · {stats.readTime} min
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {outline.map((item) => {
          const Icon = ICONS[item.type] || Type
          const isHeading = item.type === 'heading'
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onJump(item.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-ctl px-2 py-1.5 text-left transition-colors',
                activeId === item.id ? 'bg-surface-overlay' : 'hover:bg-surface-overlay',
                item.level === 3 && 'pl-5',
                item.level === 4 && 'pl-8'
              )}
            >
              <Icon size={12} className={cn('shrink-0',
                isHeading ? 'text-brand-900' : 'text-text-faint')} />
              <span className={cn(
                'truncate text-[12px]',
                isHeading ? 'font-medium text-text-primary' : 'text-text-secondary'
              )}>
                {item.label}
              </span>
            </button>
          )
        })}

        {outline.length === 0 && (
          <p className="px-2 py-4 text-[12px] text-text-faint">Nothing written yet.</p>
        )}
      </nav>
    </div>
  )
}