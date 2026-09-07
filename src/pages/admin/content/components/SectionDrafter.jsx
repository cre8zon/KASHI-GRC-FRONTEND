import { useState } from 'react'
import { Sparkles, Check, X, RefreshCw } from 'lucide-react'
import { aiApi } from '../../../../api/ai.api'
import { blocks as factories } from '../../../../api/content.api'
import { useAiProposal } from '../../../../hooks/useContent'
import { Button } from '../../../../components/ui/Button'
import { cn } from '../../../../lib/cn'

/**
 * Allowlist the model's HTML before it is shown or stored.
 *
 * The draft goes into a paragraph block, and paragraph blocks are rendered with
 * dangerouslySetInnerHTML — here in the preview, and again on the public site.
 * So a <script> or an onerror= in the model's output would be stored and served
 * to readers. The prompt asks for six tags and nothing else; a prompt is not an
 * enforcement mechanism.
 *
 * Parsed with DOMParser rather than matched with regex: an allowlist walked
 * over a real DOM cannot be defeated by nesting or malformed markup, and regex
 * over HTML always can.
 *
 * NOTE: this guards the path this component opens. It is NOT a general
 * sanitiser for everything stored in contentBlocks — pasted content still
 * reaches the same renderer. That belongs server-side in BlockService, with a
 * real library rather than anything hand-rolled.
 */
const ALLOWED_TAGS = new Set(['P', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'A', 'BR', 'CODE'])
const ALLOWED_ATTRS = { A: new Set(['href']) }

// Dropped with their contents. Unwrapping these would spill the body of a
// <script> into the article as visible text — not an injection, but the reader
// would be looking at alert(1) in the middle of a paragraph.
const DROP_WITH_CONTENTS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG',
])

function sanitize(html) {
  if (typeof window === 'undefined' || !html) return ''
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstChild

  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) continue
      if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); continue }

      if (DROP_WITH_CONTENTS.has(child.tagName)) { child.remove(); continue }

      if (!ALLOWED_TAGS.has(child.tagName)) {
        // Unwrap rather than delete: a <div> around a paragraph should lose the
        // div, not the paragraph.
        child.replaceWith(...child.childNodes)
        continue
      }
      const allowed = ALLOWED_ATTRS[child.tagName] || new Set()
      for (const attr of [...child.attributes]) {
        if (!allowed.has(attr.name.toLowerCase())) { child.removeAttribute(attr.name); continue }
        // javascript: and data: survive an href allowlist otherwise.
        if (attr.name.toLowerCase() === 'href' && !/^(https?:|mailto:|\/)/i.test(attr.value.trim())) {
          child.removeAttribute('href')
        }
      }
      walk(child)
    }
  }

  walk(root)
  return root.innerHTML
}

/**
 * Draft the prose under one heading.
 *
 * ── WHY THIS LIVES ON THE HEADING AND NOT IN THE AI PANEL ────────────────────
 *
 * CONTENT_DRAFT_SECTION takes an outline and ONE heading and returns that
 * section only. Everything about it is per-section: the input is a heading, the
 * output belongs directly beneath that heading, and you will run it a dozen
 * times on a dozen different headings while writing a single article.
 *
 * Putting it in the right-hand panel would mean choosing a heading from a
 * dropdown, every time, for a task whose whole context is "this one, here" —
 * and then reading the result three hundred pixels away from where it will
 * land. The panel is the right home for the tasks that act on the whole
 * document. This is not one of them.
 *
 * It was also, until now, the one task with no UI at all: prompt template,
 * service method, controller case, all shipped and unreachable.
 *
 * ── STILL A PROPOSAL ─────────────────────────────────────────────────────────
 *
 * Nothing is written on click. The draft appears under the heading with Accept,
 * Reject and Try again, and Accept fills the empty paragraph that is already
 * there rather than inserting a second one — an outline leaves exactly that gap
 * and filling it is what "draft this section" means.
 *
 * The model is told not to invent specifics and to mark gaps as [VERIFY: …].
 * Those markers are meant to survive into the draft; they are the honest form
 * of a fact it does not have.
 */
export function SectionDrafter({ postId, heading, outline, onAccept, className }) {
  const [open, setOpen] = useState(false)
  const { run, running, proposal, clear } = useAiProposal('CONTENT_DRAFT_SECTION')

  const draft = () => {
    setOpen(true)
    run({ postId, heading: heading.text, outline: JSON.stringify(outline) })
  }

  const verdict = (v) => {
    if (!proposal?.interactionId) return
    // Dismissals count. A suggestion shown and quietly abandoned is the most
    // informative outcome there is, and it can only be caught here.
    aiApi.feedback({
      interactionId: proposal.interactionId,
      suggestionType: 'CONTENT_DRAFT_SECTION',
      verdict: v,
    }).catch(() => {})
  }

  const close = () => { setOpen(false); clear() }

  const html = sanitize(proposal?.payload?.text)

  return (
    <>
      <button
        type="button"
        onClick={open ? close : draft}
        aria-label="Draft this section"
        title="Draft this section"
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-badge transition-colors',
          open
            ? 'bg-brand-500 text-brand-900'
            : 'text-text-faint hover:bg-surface-overlay hover:text-text-primary',
          className
        )}
      >
        <Sparkles size={12} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full z-20 mt-1 rounded-card border border-border bg-surface p-3 shadow-elevated">
          {running && (
            <p className="flex items-center gap-2 text-[12.5px] text-text-secondary">
              <RefreshCw size={12} className="animate-spin" />
              Drafting “{heading.text || 'this section'}”…
            </p>
          )}

          {!running && html && (
            <>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-text-faint">
                Suggested — nothing is written until you accept
              </p>
              <div
                className="prose-content max-h-64 overflow-y-auto rounded-ctl border border-border-subtle bg-surface-inset p-2.5 text-[13px] leading-relaxed text-text-primary"
                dangerouslySetInnerHTML={{ __html: html }}
              />
              <p className="mt-2 text-[11px] text-text-faint">
                Anything it could not source is marked [VERIFY: …]. Those are
                gaps for you to fill, not text to leave in.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="primary" icon={Check}
                        onClick={() => { onAccept(html); verdict('ACCEPTED'); close() }}>
                  Accept
                </Button>
                <Button size="sm" variant="ghost" icon={RefreshCw}
                        onClick={() => { verdict('REJECTED'); draft() }}>
                  Try again
                </Button>
                <Button size="sm" variant="ghost" icon={X}
                        onClick={() => { verdict('REJECTED'); close() }}>
                  Reject
                </Button>
              </div>
            </>
          )}

          {!running && !html && (
            <p className="text-[12.5px] text-text-secondary">
              Nothing came back. Try again, or write the section yourself.
            </p>
          )}
        </div>
      )}
    </>
  )
}