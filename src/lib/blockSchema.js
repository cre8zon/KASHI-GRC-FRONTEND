import {
  Type, Heading2, List, Quote, Image, Code2, Lightbulb, Info, Table2,
  MessageCircleQuestion, ListOrdered, Megaphone, Download, Youtube, Columns3,
} from 'lucide-react'

/**
 * The block registry. One entry per type, and the only place a block type is
 * described.
 *
 * The outline, the canvas, the picker, the keyboard shortcuts and the paste
 * handler all read this. Adding a block type means adding one entry here and
 * one editor component — not touching five files and forgetting the sixth.
 *
 * `group` drives the picker's sections. The order below is the order in the
 * picker, and it is not alphabetical on purpose: the blocks an author reaches
 * for constantly come first, and the four that actually earn reach —
 * tldr, callout, faq, comparison — sit at the top of their own group rather
 * than buried under "advanced", because a block nobody finds is a block nobody
 * uses.
 */

export const BLOCK_GROUPS = [
  { key: 'text',       label: 'Writing' },
  { key: 'extract',    label: 'Extractable', hint: 'What gets pulled into search summaries' },
  { key: 'structure',  label: 'Structure' },
  { key: 'convert',    label: 'Conversion' },
]

export const BLOCK_TYPES = {
  paragraph: {
    label: 'Paragraph', group: 'text', icon: Type, shortcut: 'p',
    create: () => ({ type: 'paragraph', html: '' }),
    summary: (b) => stripTags(b.html) || 'Empty paragraph',
    isEmpty: (b) => !stripTags(b.html).trim(),
  },
  heading: {
    label: 'Heading', group: 'text', icon: Heading2, shortcut: 'h',
    create: () => ({ type: 'heading', level: 2, text: '', anchor: '' }),
    summary: (b) => b.text || 'Untitled heading',
    isEmpty: (b) => !b.text?.trim(),
  },
  list: {
    label: 'List', group: 'text', icon: List, shortcut: 'l',
    create: () => ({ type: 'list', ordered: false, items: [''] }),
    summary: (b) => `${b.items?.length || 0} items — ${b.items?.[0] || ''}`,
    isEmpty: (b) => !(b.items || []).some((i) => i.trim()),
  },
  quote: {
    label: 'Pull quote', group: 'text', icon: Quote,
    create: () => ({ type: 'quote', text: '', attribution: '' }),
    summary: (b) => b.text || 'Empty quote',
    isEmpty: (b) => !b.text?.trim(),
  },

  tldr: {
    label: 'Key takeaways', group: 'extract', icon: Lightbulb,
    hint: 'Three to five conclusions. Each must make sense on its own — this is what AI search quotes.',
    create: () => ({ type: 'tldr', items: ['', '', ''] }),
    summary: (b) => `${(b.items || []).filter(Boolean).length} takeaways`,
    isEmpty: (b) => !(b.items || []).some((i) => i.trim()),
  },
  faq: {
    label: 'FAQ', group: 'extract', icon: MessageCircleQuestion,
    hint: 'Becomes FAQPage structured data. Each answer can appear in a result with nothing around it.',
    create: () => ({ type: 'faq', items: [{ q: '', a: '' }] }),
    summary: (b) => `${b.items?.length || 0} questions`,
    isEmpty: (b) => !(b.items || []).some((i) => i.q?.trim()),
  },
  callout: {
    label: 'Callout', group: 'extract', icon: Info,
    hint: 'A note, warning or tip. Visually distinct, and self-contained enough to be quoted.',
    create: () => ({ type: 'callout', variant: 'note', title: '', html: '' }),
    summary: (b) => b.title || stripTags(b.html) || 'Empty callout',
    isEmpty: (b) => !b.title?.trim() && !stripTags(b.html).trim(),
  },
  comparison: {
    label: 'Comparison table', group: 'extract', icon: Columns3,
    hint: 'Driven by structured competitor records, so updating one record updates every page using it.',
    create: () => ({ type: 'comparison', comparisonDataIds: [], attributes: [] }),
    summary: (b) => `${b.comparisonDataIds?.length || 0} competitors`,
    isEmpty: (b) => !(b.comparisonDataIds || []).length,
  },

  table: {
    label: 'Table', group: 'structure', icon: Table2,
    create: () => ({ type: 'table', headers: ['', ''], rows: [['', '']], stickyHeader: true }),
    summary: (b) => `${b.rows?.length || 0} × ${b.headers?.length || 0} table`,
    isEmpty: (b) => !(b.headers || []).some((h) => h.trim()),
  },
  steps: {
    label: 'Steps', group: 'structure', icon: ListOrdered,
    create: () => ({ type: 'steps', items: [{ heading: '', html: '' }] }),
    summary: (b) => `${b.items?.length || 0} steps`,
    isEmpty: (b) => !(b.items || []).some((i) => i.heading?.trim()),
  },
  image: {
    label: 'Image', group: 'structure', icon: Image,
    create: () => ({ type: 'image', mediaId: null, caption: '', fullWidth: false }),
    summary: (b) => b.caption || (b.mediaId ? 'Image' : 'No image chosen'),
    isEmpty: (b) => !b.mediaId,
  },
  code: {
    label: 'Code', group: 'structure', icon: Code2,
    create: () => ({ type: 'code', language: 'sql', code: '' }),
    summary: (b) => `${b.language} — ${(b.code || '').split('\n')[0] || 'empty'}`,
    isEmpty: (b) => !b.code?.trim(),
  },
  embed: {
    label: 'Embed', group: 'structure', icon: Youtube,
    create: () => ({ type: 'embed', provider: 'youtube', url: '' }),
    summary: (b) => b.url || 'No URL',
    isEmpty: (b) => !b.url?.trim(),
  },

  cta: {
    label: 'Call to action', group: 'convert', icon: Megaphone,
    hint: 'One inline nudge mid-article, one block at the end. More than that reads as a pitch.',
    create: () => ({ type: 'cta', variant: 'inline', heading: '', body: '', buttonText: '', buttonHref: '' }),
    summary: (b) => b.heading || b.buttonText || 'Empty CTA',
    isEmpty: (b) => !b.heading?.trim() && !b.buttonText?.trim(),
  },
  download: {
    label: 'Download', group: 'convert', icon: Download,
    hint: 'A checklist or template. The strongest conversion mechanism in this category.',
    create: () => ({ type: 'download', mediaId: null, title: '', description: '', gated: false }),
    summary: (b) => b.title || 'Untitled download',
    isEmpty: (b) => !b.title?.trim(),
  },
}

export const CALLOUT_VARIANTS = [
  { value: 'note',    label: 'Note',    token: 'info' },
  { value: 'tip',     label: 'Tip',     token: 'pass' },
  { value: 'warning', label: 'Warning', token: 'warn' },
]

/** Map a callout variant to a status token. Meaning, never hue — DESIGN.md rule 7. */
export const calloutToken = (variant) =>
  CALLOUT_VARIANTS.find((v) => v.value === variant)?.token || 'info'

export const blockDef = (type) => BLOCK_TYPES[type] || null

export const createBlock = (type) => BLOCK_TYPES[type]?.create() || null

export const blockSummary = (block) => {
  const def = blockDef(block?.type)
  if (!def) return `Unknown block: ${block?.type}`
  try { return def.summary(block) } catch { return def.label }
}

export const blockIsEmpty = (block) => {
  const def = blockDef(block?.type)
  if (!def) return false
  try { return def.isEmpty(block) } catch { return false }
}

/**
 * Anchor slug for a heading. Must match SlugService.anchorFor on the server and
 * anchorFor in the website repo, or a table-of-contents link scrolls nowhere.
 */
export const anchorFor = (text = '') =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)

function stripTags(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
