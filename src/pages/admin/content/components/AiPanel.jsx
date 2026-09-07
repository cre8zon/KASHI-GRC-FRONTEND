import { useState } from 'react'
import {
  Sparkles, ListTree, PenLine, Tags, HelpCircle, Link2, Share2, Check, X, Loader2,
  Heading2, TextCursorInput,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { aiApi } from '../../../../api/ai.api'
import { blocks as factories } from '../../../../api/content.api'
import { useAiProposal } from '../../../../hooks/useContent'
import { Button } from '../../../../components/ui/Button'
import { cn } from '../../../../lib/cn'

/**
 * The AI tab.
 *
 * ── EVERY OUTPUT IS A PROPOSAL ───────────────────────────────────────────────
 * Nothing here writes to the post. Each task returns something rendered with
 * Accept and Reject, and accepting is an ordinary block insert. That is what
 * makes it safe to point a model at content published under a named byline —
 * an AI that can edit the document directly is an AI whose mistakes are
 * indistinguishable from the author's.
 *
 * ── DISMISS REPORTS TOO ──────────────────────────────────────────────────────
 * accept, reject AND dismiss all post to /v1/ai/feedback. The instinct is to
 * wire the first two and skip the third, because dismissing feels like nothing
 * happened. It is the opposite: a suggestion shown and quietly abandoned is the
 * most informative outcome there is, and it can only be captured at the instant
 * it happens.
 */

/** Is this occurrence of `text` already inside an anchor? */
function alreadyLinked(html, text) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<a[^>]*>[^<]*${escaped}`, 'i').test(html)
}

const TASKS = [
  { key: 'CONTENT_TLDR',  label: 'Key takeaways', icon: Sparkles,
    hint: 'Three to five extractable bullets', needsBody: true },
  { key: 'CONTENT_META',  label: 'Meta title & description', icon: Tags,
    hint: 'Within the lengths that actually render', needsBody: true },
  { key: 'CONTENT_FAQ',   label: 'FAQ block', icon: HelpCircle,
    hint: 'Feeds FAQPage structured data', needsBody: true },
  { key: 'CONTENT_INTERNAL_LINKS', label: 'Internal links', icon: Link2,
    hint: 'Only real slugs — fabrication rejects the response', needsBody: true },
  { key: 'CONTENT_OUTLINE', label: 'Outline a new article', icon: ListTree,
    hint: 'From a topic and a target search', needsBody: false },
  { key: 'CONTENT_SOCIAL',  label: 'Social draft', icon: Share2,
    hint: 'LinkedIn post or X thread', needsBody: true },
]

/**
 * Where each proposal lands in the document.
 *
 * ── THE PROBLEM THIS FIXES ───────────────────────────────────────────────────
 * "Accept" used to mean "append every piece of this at the end", for every
 * task. Accepting an outline appended fourteen consecutive headings with
 * nothing between them — not an article skeleton, a wall of headings you then
 * have to click into fourteen times to make room to write. And a TL;DR box
 * landed at the BOTTOM of the article, which is the one place it does nothing:
 * its whole job is to be read before the body.
 *
 * Every task now states where its output goes and what shape it goes in.
 */
export function AiPanel({
  postId, post, blocks, hasBody,
  onAppendBlocks, onPrependBlock, onTransformBlocks, onPatchPost,
}) {
  const [active, setActive] = useState(null)
  const [topic, setTopic] = useState('')

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-[11px] text-text-faint">
        Everything below is a suggestion. Nothing is written until you accept it.
      </p>

      {/*
        Two tasks act on a selection or a heading rather than the whole post, so
        they live in the document instead of here. Listed anyway, because a
        feature nobody can find is indistinguishable from one that does not
        exist — which is what both of these were.
      */}
      <div className="flex flex-col gap-2 rounded-card border border-dashed border-border p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-faint">
          In the document
        </p>

        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-ctl bg-surface-inset text-text-secondary">
            <TextCursorInput size={11} />
          </span>
          <span className="min-w-0">
            <span className="block text-[12.5px] text-text-primary">Rewrite a selection</span>
            <span className="block text-[11px] text-text-faint">
              Select any text, then press <Sparkles size={9} className="inline" /> in the
              toolbar that appears. It replaces the selection, not the block.
            </span>
          </span>
        </div>

        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-ctl bg-surface-inset text-text-secondary">
            <Heading2 size={11} />
          </span>
          <span className="min-w-0">
            <span className="block text-[12.5px] text-text-primary">Draft a section</span>
            <span className="block text-[11px] text-text-faint">
              Hover any heading and press <Sparkles size={9} className="inline" /> in its
              left margin. Writes the prose under that one heading.
            </span>
          </span>
        </div>
      </div>

      {TASKS.map((task) => (
        <TaskRow
          key={task.key}
          task={task}
          postId={postId}
          post={post}
          blocks={blocks}
          disabled={task.needsBody && !hasBody}
          expanded={active === task.key}
          onToggle={() => setActive(active === task.key ? null : task.key)}
          topic={topic}
          setTopic={setTopic}
          onAppendBlocks={onAppendBlocks}
          onPrependBlock={onPrependBlock}
          onTransformBlocks={onTransformBlocks}
          onPatchPost={onPatchPost}
        />
      ))}
    </div>
  )
}

function TaskRow({
  task, postId, post, blocks, disabled, expanded, onToggle,
  topic, setTopic, onAppendBlocks, onPrependBlock, onTransformBlocks, onPatchPost,
}) {
  const { run, running, proposal, warnings, clear } = useAiProposal(task.key)
  const Icon = task.icon

  const feedback = (verdict) => {
    if (!proposal?.interactionId) return
    aiApi.feedback({
      interactionId: proposal.interactionId,
      suggestionType: task.key,
      verdict,
    }).catch(() => {})
  }

  const accept = () => {
    const payload = proposal?.payload
    if (!payload) return

    switch (task.key) {
      // Above the body, not below it. A key-takeaways box appended to the end
      // of an article is a summary nobody reaches.
      case 'CONTENT_TLDR':
        onPrependBlock({ ...factories.tldr(), items: payload.items || [] })
        break

      // At the end, which is where an FAQ belongs and where the FAQPage schema
      // expects to find it.
      case 'CONTENT_FAQ':
        onAppendBlocks([{ ...factories.faq(), items: payload.items || [] }])
        break

      case 'CONTENT_META':
        onPatchPost({ metaTitle: payload.metaTitle, metaDescription: payload.metaDescription })
        break

      case 'CONTENT_OUTLINE': {
        // A heading followed by somewhere to write. Headings alone are not a
        // skeleton — they are a list, and turning a list into a draft means
        // making room under every one of them by hand.
        const out = []
        for (const section of payload.sections || []) {
          const level = Math.min(Math.max(Number(section.level) || 2, 2), 4)
          out.push(factories.heading(section.heading, level))
          out.push(factories.paragraph(''))
          for (const sub of section.subheadings || []) {
            out.push(factories.heading(sub, Math.min(level + 1, 4)))
            out.push(factories.paragraph(''))
          }
        }
        if (!out.length) { toast.error('That outline had no sections'); return }
        onAppendBlocks(out)

        // The outline also proposes a title and an angle. Taking the title only
        // when there is not one already: overwriting a headline somebody wrote
        // is not what "accept the outline" means.
        const untitled = !post?.title?.trim() || post.title.trim() === 'Untitled'
        if (untitled && payload.workingTitle) onPatchPost({ title: payload.workingTitle })
        toast.success(`Added ${out.length / 2} sections`)
        break
      }

      // Applied inline, in place, where the anchor text actually appears —
      // which is the only form in which an internal link is worth anything.
      // Accepting this used to do nothing at all: the case was missing and it
      // fell through to `default: break`.
      case 'CONTENT_INTERNAL_LINKS': {
        const applied = []
        const missed = []
        onTransformBlocks((current) => {
          const next = current.map((b) => ({ ...b }))
          for (const link of payload.links || []) {
            if (!link.slug || !link.anchorText) continue
            const target = next.find((b) =>
              b.type === 'paragraph' &&
              typeof b.html === 'string' &&
              b.html.includes(link.anchorText) &&
              // Never nest an anchor inside an anchor.
              !alreadyLinked(b.html, link.anchorText))
            if (!target) { missed.push(link.anchorText); continue }
            target.html = target.html.replace(
              link.anchorText,
              `<a href="/blog/${link.slug}">${link.anchorText}</a>`)
            applied.push(link.anchorText)
          }
          return next
        })
        // Say what did not happen. A silent partial apply is worse than a
        // refusal, because the author believes all five links are in.
        if (applied.length) toast.success(`Linked ${applied.length} of ${(payload.links || []).length}`)
        if (missed.length) toast.error(`Could not place: ${missed.join(', ')}`)
        if (!applied.length && !missed.length) toast.error('No links to apply')
        break
      }

      case 'CONTENT_SOCIAL':
        navigator.clipboard?.writeText((payload.posts || []).join('\n\n'))
        toast.success('Copied')
        break

      default:
        break
    }
    feedback('ACCEPTED')
    clear()
  }

  const reject = () => { feedback('REJECTED'); clear() }

  const start = () => {
    if (task.key === 'CONTENT_OUTLINE') {
      if (!topic.trim()) return toast.error('Give it a topic first')
      return run({ topic, targetKeyword: post.focusKeyword })
    }
    run({ postId })
  }

  return (
    <div className={cn(
      'rounded-card border transition-colors',
      expanded ? 'border-border bg-surface-inset' : 'border-border-subtle'
    )}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="flex w-full items-start gap-3 p-3 text-left disabled:opacity-50"
      >
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-ctl bg-brand-500 text-brand-900">
          <Icon size={13} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-text-primary">{task.label}</span>
          <span className="block text-[11px] text-text-faint">
            {disabled ? 'Write something first' : task.hint}
          </span>
        </span>
      </button>

      {expanded && !disabled && (
        <div className="flex flex-col gap-3 border-t border-border-subtle p-3">
          {task.key === 'CONTENT_OUTLINE' && (
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What is the article about?"
              className="h-8 w-full rounded-ctl border border-border bg-surface px-2.5 text-[13px] text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-800/40"
            />
          )}

          {!proposal && (
            <Button size="sm" variant="secondary" onClick={start} loading={running}
                    loadingText="Thinking…" icon={Sparkles}>
              Suggest
            </Button>
          )}

          {warnings.length > 0 && (
            <div className="rounded-ctl bg-status-warn-bg p-2.5 text-[11.5px] text-status-warn-fg">
              {warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          )}

          {proposal && (
            <>
              <ProposalPreview taskKey={task.key} payload={proposal.payload} />
              <div className="flex gap-2">
                <Button size="sm" variant="primary" icon={Check} onClick={accept}>
                  {task.key === 'CONTENT_SOCIAL' ? 'Copy'
                    : task.key === 'CONTENT_INTERNAL_LINKS' ? 'Apply links'
                    : 'Accept'}
                </Button>
                <Button size="sm" variant="ghost" icon={X} onClick={reject}>Reject</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ProposalPreview({ taskKey, payload }) {
  if (!payload) return null
  const box = 'rounded-ctl border border-border bg-surface p-2.5 text-[12.5px] leading-relaxed text-text-primary'

  switch (taskKey) {
    case 'CONTENT_TLDR':
      return (
        <ul className={cn(box, 'list-disc space-y-1 pl-6')}>
          {(payload.items || []).map((i, n) => <li key={n}>{i}</li>)}
        </ul>
      )
    case 'CONTENT_META':
      return (
        <div className={cn(box, 'space-y-2')}>
          <p className="text-brand-900">{payload.metaTitle}</p>
          <p className="text-text-secondary">{payload.metaDescription}</p>
        </div>
      )
    case 'CONTENT_FAQ':
      return (
        <div className={cn(box, 'space-y-2.5')}>
          {(payload.items || []).map((i, n) => (
            <div key={n}>
              <p className="font-medium">{i.q}</p>
              <p className="text-text-secondary">{i.a}</p>
            </div>
          ))}
        </div>
      )
    case 'CONTENT_INTERNAL_LINKS':
      return (
        <div className={cn(box, 'space-y-2')}>
          {(payload.links || []).map((l, n) => (
            <div key={n}>
              <p><span className="text-brand-900">{l.anchorText}</span>
                <span className="reg-code ml-1.5 font-mono text-[11px] text-text-faint">/blog/{l.slug}</span></p>
              <p className="text-[11px] text-text-faint">{l.rationale}</p>
            </div>
          ))}
        </div>
      )
    case 'CONTENT_OUTLINE':
      return (
        <div className={cn(box, 'space-y-1')}>
          <p className="font-medium">{payload.workingTitle}</p>
          <p className="mb-2 text-[11px] text-text-faint">{payload.angle}</p>
          {(payload.sections || []).map((s, n) => (
            <p key={n} className="text-text-secondary">{s.heading}</p>
          ))}
        </div>
      )
    case 'CONTENT_SOCIAL':
      return (
        <div className={cn(box, 'space-y-2 whitespace-pre-wrap')}>
          {(payload.posts || []).map((p, n) => <p key={n}>{p}</p>)}
        </div>
      )
    default:
      return <pre className={cn(box, 'overflow-x-auto')}>{JSON.stringify(payload, null, 2)}</pre>
  }
}