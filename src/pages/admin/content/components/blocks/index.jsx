import { useState } from 'react'
import {
  Plus, Trash2, GripVertical, Image as ImageIcon, Download, Youtube,
  AlertTriangle, Info, Lightbulb, ChevronDown,
} from 'lucide-react'
import { RichText } from '../RichText'
import { Input, Textarea } from '../../../../../components/ui/Input'
import { Select } from '../../../../../components/ui/Select'
import { Button } from '../../../../../components/ui/Button'
import { cn } from '../../../../../lib/cn'

/**
 * One editor component per block type.
 *
 * ── EACH ONE EDITS THE SHAPE IT WILL BE PUBLISHED AS ─────────────────────────
 * No block here is a rich-text box that happens to look like a table. The table
 * editor edits headers and rows; the FAQ editor edits question and answer
 * pairs. That is the whole reason blocks are JSON rather than HTML: an `faq`
 * block becomes an accordion AND a FAQPage schema entry, and you cannot recover
 * that from a <div>.
 *
 * The temptation is always to let an editor paste HTML into a generic block and
 * move on. That works until someone asks why the FAQ isn't showing in search.
 *
 * ── THE FOUR THAT EARN THEIR KEEP ────────────────────────────────────────────
 * tldr, callout, table and faq. Those are what get extracted into featured
 * snippets and AI search summaries, because they are self-contained answers
 * rather than prose that only makes sense in sequence. They get the most
 * careful editors here.
 */

const label = 'text-[11px] font-medium uppercase tracking-wide text-text-faint'
const fieldRow = 'flex flex-col gap-1.5'

/* ── shared bits ───────────────────────────────────────────────────────────── */

function ItemList({ items, onChange, placeholder, min = 1, renderItem }) {
  const set = (i, v) => onChange(items.map((it, n) => (n === i ? v : it)))
  const add = () => onChange([...items, typeof items[0] === 'string' ? '' : { ...items[0] }])
  const del = (i) => items.length > min && onChange(items.filter((_, n) => n !== i))

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="group flex items-start gap-2">
          <span className="mt-2 select-none font-mono text-[11px] text-text-faint reg-code">
            {String(i + 1).padStart(2, '0')}
          </span>
          <div className="flex-1">
            {renderItem
              ? renderItem(item, (v) => set(i, v), i)
              : <Input value={item} placeholder={placeholder} onChange={(e) => set(i, e.target.value)} />}
          </div>
          <button
            type="button"
            onClick={() => del(i)}
            disabled={items.length <= min}
            className="mt-1.5 text-text-faint opacity-0 transition-opacity hover:text-status-fail-fg group-hover:opacity-100 disabled:opacity-0"
            aria-label="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex w-fit items-center gap-1.5 text-xs text-text-secondary hover:text-brand-900"
      >
        <Plus size={13} /> Add
      </button>
    </div>
  )
}

/* ── the blocks ────────────────────────────────────────────────────────────── */

function ParagraphBlock({ block, patch, onAiRewrite, flow = {} }) {
  return (
    <RichText
      value={block.html}
      onChange={(html) => patch({ html })}
      onAiRewrite={onAiRewrite}
      placeholder="Write, or press / for a block"
      autoFocus={flow.autoFocus}
      onEnterAtEnd={flow.onEnterAtEnd}
      onDeleteEmpty={flow.onDeleteEmpty}
      onSlash={flow.onSlash}
      onConvert={flow.onConvert}
    />
  )
}

/**
 * Level 1 is not offered. Exactly one H1 per page and it is the title, which is
 * not a block. The server demotes a stray level-1 anyway; not showing it here
 * means nobody has to be told.
 */
function HeadingBlock({ block, patch }) {
  return (
    <div className="flex items-center gap-3">
      <select
        value={block.level || 2}
        onChange={(e) => patch({ level: Number(e.target.value) })}
        className="h-8 rounded-ctl border border-border bg-surface px-2 text-xs text-text-secondary"
        aria-label="Heading level"
      >
        <option value={2}>H2</option>
        <option value={3}>H3</option>
        <option value={4}>H4</option>
      </select>
      <input
        value={block.text || ''}
        onChange={(e) => patch({ text: e.target.value })}
        placeholder="A heading that works as an answer on its own"
        className={cn(
          'flex-1 border-0 bg-transparent p-0 font-semibold text-text-primary placeholder:font-normal placeholder:text-text-faint focus:outline-none focus:ring-0',
          (block.level || 2) === 2 ? 'text-[22px]' : (block.level === 3 ? 'text-[18px]' : 'text-[16px]')
        )}
      />
      {block.anchor && (
        <span className="reg-code shrink-0 font-mono text-[11px] text-text-faint">#{block.anchor}</span>
      )}
    </div>
  )
}

function ListBlock({ block, patch }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={!!block.ordered}
          onChange={(e) => patch({ ordered: e.target.checked })}
          className="rounded-ctl border-border"
        />
        Numbered
      </label>
      <ItemList
        items={block.items || ['']}
        onChange={(items) => patch({ items })}
        placeholder="List item"
      />
    </div>
  )
}

function QuoteBlock({ block, patch }) {
  return (
    <div className="flex flex-col gap-3 border-l-2 border-brand-500 pl-4">
      <Textarea
        value={block.text || ''}
        onChange={(e) => patch({ text: e.target.value })}
        placeholder="The most quotable line in the piece"
        rows={2}
        className="text-[17px] leading-relaxed"
      />
      <Input
        value={block.attribution || ''}
        onChange={(e) => patch({ attribution: e.target.value })}
        placeholder="Attribution"
      />
    </div>
  )
}

/**
 * The key-takeaways box.
 *
 * The hint text is doing real work: the single most common failure is bullets
 * that only make sense having read the article, which defeats the entire point
 * of a block whose value is being extractable.
 */
function TldrBlock({ block, patch }) {
  const items = block.items || ['', '', '']
  return (
    <div className="rounded-card border border-brand-500 bg-brand-50 p-4">
      <p className="mb-1 text-sm font-semibold text-brand-900">Key takeaways</p>
      <p className="mb-3 text-xs text-text-secondary">
        Each bullet has to survive on its own — in a search result, in an AI summary,
        in a screenshot. State a conclusion, not a topic.
      </p>
      <ItemList
        items={items}
        min={3}
        onChange={(next) => patch({ items: next })}
        placeholder="A conclusion that stands alone"
      />
    </div>
  )
}

/**
 * Class strings are written out in full, never composed as `bg-${tone}-bg`.
 * Tailwind scans source text for literal class names; an interpolated one is
 * not in the built stylesheet, so the callout silently renders unstyled — and
 * only in the production build, where the JIT has nothing to match.
 */
const CALLOUT_VARIANTS = [
  { value: 'note',    label: 'Note',    icon: Info,
    surface: 'bg-status-info-bg', ink: 'text-status-info-fg', chip: 'bg-status-info-fg text-surface' },
  { value: 'tip',     label: 'Tip',     icon: Lightbulb,
    surface: 'bg-status-pass-bg', ink: 'text-status-pass-fg', chip: 'bg-status-pass-fg text-surface' },
  { value: 'warning', label: 'Warning', icon: AlertTriangle,
    surface: 'bg-status-warn-bg', ink: 'text-status-warn-fg', chip: 'bg-status-warn-fg text-surface' },
]

function CalloutBlock({ block, patch }) {
  const variant = CALLOUT_VARIANTS.find((v) => v.value === (block.variant || 'note')) || CALLOUT_VARIANTS[0]
  const Icon = variant.icon
  return (
    <div className={cn('rounded-card p-4', variant.surface)}>
      <div className="mb-3 flex items-center gap-2">
        <Icon size={15} className={variant.ink} />
        <div className="flex gap-1">
          {CALLOUT_VARIANTS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => patch({ variant: v.value })}
              className={cn(
                'rounded-badge px-2.5 py-0.5 text-[11px] transition-colors',
                block.variant === v.value || (!block.variant && v.value === 'note')
                  ? v.chip
                  : 'text-text-secondary hover:bg-surface-overlay'
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <Input
        value={block.title || ''}
        onChange={(e) => patch({ title: e.target.value })}
        placeholder="Callout title"
        className="mb-2 font-medium"
      />
      <RichText
        value={block.html}
        onChange={(html) => patch({ html })}
        placeholder="The thing a reader would otherwise get wrong"
        minimal
      />
    </div>
  )
}

/**
 * A structured table, not pasted HTML.
 *
 * Column and row operations are on the grid itself rather than in a menu,
 * because the alternative — a "manage columns" dialog — is how table editors
 * become the block nobody uses.
 */
function TableBlock({ block, patch }) {
  const headers = block.headers?.length ? block.headers : ['', '']
  const rows = block.rows?.length ? block.rows : [Array(headers.length).fill('')]

  const setHeader = (i, v) => patch({ headers: headers.map((h, n) => (n === i ? v : h)) })
  const setCell = (r, c, v) => patch({
    rows: rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)),
  })
  const addColumn = () => patch({
    headers: [...headers, ''],
    rows: rows.map((r) => [...r, '']),
  })
  const removeColumn = (i) => headers.length > 1 && patch({
    headers: headers.filter((_, n) => n !== i),
    rows: rows.map((r) => r.filter((_, n) => n !== i)),
  })
  const addRow = () => patch({ rows: [...rows, Array(headers.length).fill('')] })
  const removeRow = (i) => rows.length > 1 && patch({ rows: rows.filter((_, n) => n !== i) })

  const cell = 'h-9 w-full border-0 bg-transparent px-2.5 text-[13px] text-text-primary placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-brand-800/40'

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-inset">
              {headers.map((h, i) => (
                <th key={i} className="group relative border-b border-border p-0 text-left">
                  <input
                    value={h}
                    onChange={(e) => setHeader(i, e.target.value)}
                    placeholder={`Column ${i + 1}`}
                    className={cn(cell, 'font-semibold')}
                  />
                  <button
                    type="button"
                    onClick={() => removeColumn(i)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-text-faint opacity-0 transition-opacity hover:text-status-fail-fg group-hover:opacity-100"
                    aria-label={`Remove column ${i + 1}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </th>
              ))}
              <th className="w-9 border-b border-border">
                <button type="button" onClick={addColumn}
                        className="flex h-9 w-9 items-center justify-center text-text-faint hover:text-brand-900"
                        aria-label="Add column">
                  <Plus size={14} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="group border-b border-border-subtle last:border-0">
                {row.map((c, ci) => (
                  <td key={ci} className="p-0">
                    <input value={c} onChange={(e) => setCell(r, ci, e.target.value)} className={cell} />
                  </td>
                ))}
                <td className="w-9 text-center">
                  <button type="button" onClick={() => removeRow(r)}
                          className="text-text-faint opacity-0 transition-opacity hover:text-status-fail-fg group-hover:opacity-100"
                          aria-label={`Remove row ${r + 1}`}>
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4">
        <button type="button" onClick={addRow}
                className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-brand-900">
          <Plus size={13} /> Add row
        </button>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input type="checkbox" checked={block.stickyHeader !== false}
                 onChange={(e) => patch({ stickyHeader: e.target.checked })}
                 className="rounded-ctl border-border" />
          Sticky header on scroll
        </label>
      </div>
    </div>
  )
}

/** Feeds FAQPage schema, so the hint is about answerability, not phrasing. */
function FaqBlock({ block, patch }) {
  const items = block.items?.length ? block.items : [{ q: '', a: '' }]
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-secondary">
        These become FAQPage structured data — each answer can appear in a search result
        with nothing around it. Only ask what this article actually answers.
      </p>
      <ItemList
        items={items}
        onChange={(next) => patch({ items: next })}
        renderItem={(item, set) => (
          <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-inset p-3">
            <Input
              value={item.q}
              onChange={(e) => set({ ...item, q: e.target.value })}
              placeholder="A question someone would actually type"
            />
            <Textarea
              value={item.a}
              onChange={(e) => set({ ...item, a: e.target.value })}
              placeholder="Lead with the answer, then the qualification. Two to four sentences."
              rows={3}
            />
          </div>
        )}
      />
    </div>
  )
}

function StepsBlock({ block, patch }) {
  const items = block.items?.length ? block.items : [{ heading: '', html: '' }]
  return (
    <ItemList
      items={items}
      onChange={(next) => patch({ items: next })}
      renderItem={(item, set) => (
        <div className="flex flex-col gap-2 rounded-card border border-border-subtle p-3">
          <Input
            value={item.heading}
            onChange={(e) => set({ ...item, heading: e.target.value })}
            placeholder="What this step accomplishes"
            className="font-medium"
          />
          <RichText
            value={item.html}
            onChange={(html) => set({ ...item, html })}
            placeholder="How to do it"
            minimal
          />
        </div>
      )}
    />
  )
}

function CodeBlock({ block, patch }) {
  return (
    <div className="flex flex-col gap-2">
      <Input
        value={block.language || ''}
        onChange={(e) => patch({ language: e.target.value })}
        placeholder="Language (sql, bash, json…)"
        className="w-48"
      />
      <textarea
        value={block.code || ''}
        onChange={(e) => patch({ code: e.target.value })}
        placeholder="Code"
        rows={8}
        spellCheck={false}
        className="reg-code w-full rounded-card border border-border bg-surface-inset p-3 font-mono text-[13px] leading-relaxed text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-800/40"
      />
    </div>
  )
}

function ImageBlock({ block, patch, onPickMedia, media }) {
  const asset = media?.[block.mediaId]
  return (
    <div className="flex flex-col gap-3">
      {asset ? (
        <figure className="flex flex-col gap-2">
          <img
            src={asset.url}
            alt={asset.altText}
            className="max-h-80 w-full rounded-card border border-border object-contain"
          />
          {/* Alt text is shown, not hidden behind a settings panel. It is the
              thing most likely to be wrong and the thing that blocks publish. */}
          <figcaption className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="rounded-badge bg-status-pass-bg px-2 py-0.5 text-status-pass-fg">alt</span>
            {asset.altText}
          </figcaption>
        </figure>
      ) : (
        <button
          type="button"
          onClick={onPickMedia}
          className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border text-text-faint transition-colors hover:border-brand-500 hover:text-brand-900"
        >
          <ImageIcon size={20} />
          <span className="text-sm">Choose an image</span>
        </button>
      )}
      <div className="flex items-center gap-3">
        <Input
          value={block.caption || ''}
          onChange={(e) => patch({ caption: e.target.value })}
          placeholder="Caption (optional — shown under the image)"
          className="flex-1"
        />
        <label className="flex shrink-0 items-center gap-2 text-xs text-text-secondary">
          <input type="checkbox" checked={!!block.fullWidth}
                 onChange={(e) => patch({ fullWidth: e.target.checked })}
                 className="rounded-ctl border-border" />
          Full width
        </label>
        {asset && (
          <Button variant="ghost" size="sm" onClick={onPickMedia}>Replace</Button>
        )}
      </div>
    </div>
  )
}

function CtaBlock({ block, patch }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-brand-500 bg-brand-50 p-4">
      <div className="flex gap-1">
        {['inline', 'block'].map((v) => (
          <button key={v} type="button" onClick={() => patch({ variant: v })}
                  className={cn('rounded-badge px-2.5 py-0.5 text-[11px] capitalize transition-colors',
                    (block.variant || 'inline') === v
                      ? 'bg-brand-500 text-brand-900'
                      : 'text-text-secondary hover:bg-surface-overlay')}>
            {v}
          </button>
        ))}
      </div>
      <Input value={block.heading || ''} onChange={(e) => patch({ heading: e.target.value })}
             placeholder="Heading" className="font-medium" />
      <Textarea value={block.body || ''} onChange={(e) => patch({ body: e.target.value })}
                placeholder="One sentence. This is a nudge, not a pitch." rows={2} />
      <div className="flex gap-3">
        <Input value={block.buttonText || ''} onChange={(e) => patch({ buttonText: e.target.value })}
               placeholder="Button text" className="flex-1" />
        <Input value={block.buttonHref || ''} onChange={(e) => patch({ buttonHref: e.target.value })}
               placeholder="/contact" className="flex-1" />
      </div>
    </div>
  )
}

function DownloadBlock({ block, patch, onPickMedia, media }) {
  const asset = media?.[block.mediaId]
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border p-4">
      <div className="flex items-center gap-3">
        <Download size={16} className="text-text-secondary" />
        <Input value={block.title || ''} onChange={(e) => patch({ title: e.target.value })}
               placeholder="What they are downloading" className="flex-1 font-medium" />
      </div>
      <Textarea value={block.description || ''} onChange={(e) => patch({ description: e.target.value })}
                placeholder="One line on why it is worth having" rows={2} />
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={onPickMedia}>
          {asset ? asset.url.split('/').pop() : 'Attach file'}
        </Button>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input type="checkbox" checked={!!block.gated}
                 onChange={(e) => patch({ gated: e.target.checked })}
                 className="rounded-ctl border-border" />
          Ask for an email first
        </label>
      </div>
    </div>
  )
}

function EmbedBlock({ block, patch }) {
  return (
    <div className="flex items-center gap-3">
      <Youtube size={16} className="shrink-0 text-text-secondary" />
      <Select
        value={block.provider || 'youtube'}
        onChange={(e) => patch({ provider: e.target.value })}
        options={[{ value: 'youtube', label: 'YouTube' }, { value: 'loom', label: 'Loom' }]}
        className="w-32"
      />
      <Input value={block.url || ''} onChange={(e) => patch({ url: e.target.value })}
             placeholder="Paste the URL" className="flex-1" />
    </div>
  )
}

function ComparisonBlock({ block, patch, competitors = [] }) {
  const selected = block.comparisonDataIds || []
  const toggle = (id) => patch({
    comparisonDataIds: selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id],
  })
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-secondary">
        Rendered from the competitor records, not typed here — so updating a price once
        updates every page that quotes it.
      </p>
      <div className="flex flex-wrap gap-2">
        {competitors.map((c) => (
          <button key={c.id} type="button" onClick={() => toggle(c.id)}
                  className={cn('rounded-badge px-3 py-1 text-xs transition-colors',
                    selected.includes(c.id)
                      ? 'bg-brand-500 text-brand-900'
                      : 'bg-surface-inset text-text-secondary hover:bg-surface-overlay')}>
            {c.competitorName}
          </button>
        ))}
        {competitors.length === 0 && (
          <p className="text-xs text-text-faint">No competitor records yet.</p>
        )}
      </div>
      <ItemList
        items={block.attributes?.length ? block.attributes : ['']}
        onChange={(attributes) => patch({ attributes })}
        placeholder="Attribute to compare (e.g. Indian frameworks)"
      />
    </div>
  )
}

/* ── registry ──────────────────────────────────────────────────────────────── */

const EDITORS = {
  paragraph: ParagraphBlock,
  heading: HeadingBlock,
  list: ListBlock,
  quote: QuoteBlock,
  tldr: TldrBlock,
  callout: CalloutBlock,
  table: TableBlock,
  faq: FaqBlock,
  steps: StepsBlock,
  code: CodeBlock,
  image: ImageBlock,
  cta: CtaBlock,
  download: DownloadBlock,
  embed: EmbedBlock,
  comparison: ComparisonBlock,
}

/**
 * An unrecognised type renders a readable placeholder rather than throwing.
 * Same reasoning as the public renderer: the backend must be able to ship a new
 * block type before this app knows about it, and a crash on an unknown type
 * makes those two deploys ordered.
 */
export function BlockEditor({ block, ...rest }) {
  const Component = EDITORS[block.type]
  if (!Component) {
    return (
      <div className="rounded-card border border-dashed border-border p-4 text-sm text-text-secondary">
        <span className="reg-code font-mono text-xs">{block.type}</span> — this block type is
        newer than the editor. It will still render on the site; update the admin to edit it here.
      </div>
    )
  }
  return <Component block={block} {...rest} />
}

export { EDITORS }