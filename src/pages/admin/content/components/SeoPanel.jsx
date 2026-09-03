import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, X, AlertCircle, Link as LinkIcon, RefreshCw } from 'lucide-react'
import { contentApi } from '../../../../api/content.api'
import { Input, Textarea } from '../../../../components/ui/Input'
import { Select } from '../../../../components/ui/Select'
import { cn } from '../../../../lib/cn'

/**
 * The SEO tab. Everything here is visible while writing, not on a separate
 * screen — an SEO panel you have to navigate to is an SEO panel that gets
 * filled in at the end, badly, by whoever is publishing.
 */

/** Rendered lengths, not policy. Past these, search engines truncate mid-word. */
const TITLE_IDEAL = [50, 60]
const DESC_IDEAL = [140, 158]

function Counter({ value = '', range }) {
  const n = value.length
  const [min, max] = range
  const tone = n === 0 ? 'text-text-faint'
    : n < min ? 'text-status-warn-fg'
    : n > max ? 'text-status-fail-fg'
    : 'text-status-pass-fg'
  return (
    <span className={cn('reg-code font-mono text-[11px] tabular-nums', tone)}>
      {n}/{max}
    </span>
  )
}

/**
 * A live SERP preview.
 *
 * Worth the space: everyone writes a title that fits the field and nobody
 * writes one that fits the result. Seeing it truncate is the only feedback that
 * reliably changes the writing.
 */
function SerpPreview({ title, description, slug }) {
  const shownTitle = (title || 'Untitled').slice(0, 62)
  const shownDesc = (description || 'No meta description set — search engines will write their own from the page body.').slice(0, 160)
  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <p className="mb-1 text-[11px] text-text-faint">www.digiosec.com › blog › {slug || 'slug'}</p>
      <p className="text-[15px] leading-snug text-brand-900 hover:underline">
        {shownTitle}{(title || '').length > 62 && '…'}
      </p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-secondary">
        {shownDesc}{(description || '').length > 160 && '…'}
      </p>
    </div>
  )
}

export function SeoPanel({ post, patch, postId }) {
  const [slugDraft, setSlugDraft] = useState(post.slug || '')
  const [slugState, setSlugState] = useState(null)

  useEffect(() => { setSlugDraft(post.slug || '') }, [post.slug])

  // Debounced availability check. The endpoint also returns a `warning` when
  // the slug is free but is the source of an active redirect — publishing it
  // would create a URL that redirects away from itself.
  useEffect(() => {
    if (!slugDraft || slugDraft === post.slug) { setSlugState(null); return }
    const t = setTimeout(async () => {
      try {
        const res = await contentApi.slugAvailable(slugDraft, postId)
        setSlugState(res)
      } catch { setSlugState(null) }
    }, 400)
    return () => clearTimeout(t)
  }, [slugDraft, post.slug, postId])

  const checklist = useQuery({
    queryKey: ['content-seo-checklist', postId, post.blocksVersion],
    queryFn: () => contentApi.seoChecklist(postId),
    enabled: !!postId,
    staleTime: 15_000,
  })

  const failing = useMemo(
    () => (checklist.data || []).filter((i) => !i.passed).length,
    [checklist.data]
  )

  return (
    <div className="flex flex-col gap-6 p-4">
      <SerpPreview title={post.metaTitle || post.title} description={post.metaDescription} slug={post.slug} />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-text-secondary">Meta title</label>
          <Counter value={post.metaTitle || post.title || ''} range={TITLE_IDEAL} />
        </div>
        <Input
          value={post.metaTitle || ''}
          onChange={(e) => patch({ metaTitle: e.target.value })}
          placeholder={post.title || 'Defaults to the article title'}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-text-secondary">Meta description</label>
          <Counter value={post.metaDescription || ''} range={DESC_IDEAL} />
        </div>
        <Textarea
          rows={3}
          value={post.metaDescription || ''}
          onChange={(e) => patch({ metaDescription: e.target.value })}
          placeholder="The argument for opening this result rather than the one above it."
        />
        <p className="text-[11px] text-text-faint">Required to publish. Under 50 or over 160 characters is rejected.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-secondary">Slug</label>
        <div className="flex items-center gap-2 rounded-ctl border border-border bg-surface px-2.5">
          <span className="shrink-0 text-[12px] text-text-faint">/blog/</span>
          <input
            value={slugDraft}
            onChange={(e) => setSlugDraft(e.target.value)}
            onBlur={() => slugDraft !== post.slug && slugState?.available && patch({ slug: slugDraft })}
            className="h-8 w-full border-0 bg-transparent p-0 text-[13px] text-text-primary focus:outline-none focus:ring-0"
          />
          {slugState && (
            slugState.available
              ? <Check size={14} className="shrink-0 text-status-pass-fg" />
              : <X size={14} className="shrink-0 text-status-fail-fg" />
          )}
        </div>
        {slugState?.warning && (
          <p className="flex items-start gap-1.5 text-[11px] text-status-warn-fg">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            {slugState.warning}
          </p>
        )}
        {/* The consequence is stated where the decision is made, not in a
            confirmation dialog that gets clicked through. */}
        {post.status === 'PUBLISHED' && slugDraft !== post.slug && (
          <p className="text-[11px] text-text-secondary">
            This URL is live. Changing it creates a 301 from the old address automatically.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-secondary">Focus keyword</label>
        <Input
          value={post.focusKeyword || ''}
          onChange={(e) => patch({ focusKeyword: e.target.value })}
          placeholder="What someone types to find this"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-secondary">Robots</label>
          <Select
            value={post.robotsDirective || 'INDEX_FOLLOW'}
            onChange={(e) => patch({ robotsDirective: e.target.value })}
            options={[
              { value: 'INDEX_FOLLOW', label: 'Index, follow' },
              { value: 'NOINDEX_FOLLOW', label: 'No index, follow' },
              { value: 'NOINDEX_NOFOLLOW', label: 'No index, no follow' },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-secondary">Schema type</label>
          <Select
            value={post.schemaType || 'BlogPosting'}
            onChange={(e) => patch({ schemaType: e.target.value })}
            options={['BlogPosting', 'Article', 'HowTo', 'FAQPage', 'DefinedTerm', 'Review', 'Product']
              .map((v) => ({ value: v, label: v }))}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
          <LinkIcon size={12} /> Canonical URL
        </label>
        <Input
          value={post.canonicalUrl || ''}
          onChange={(e) => patch({ canonicalUrl: e.target.value })}
          placeholder="Self-referencing by default — set only to point elsewhere"
        />
      </div>

      {/* ── the checklist ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-secondary">
            On-page checks {failing > 0 && <span className="text-text-faint">· {failing} open</span>}
          </span>
          <button type="button" onClick={() => checklist.refetch()}
                  className="text-text-faint hover:text-text-secondary" aria-label="Recheck">
            <RefreshCw size={12} className={cn(checklist.isFetching && 'animate-spin')} />
          </button>
        </div>

        <ul className="flex flex-col gap-1.5">
          {(checklist.data || []).map((item) => (
            <li key={item.key} className="flex items-start gap-2">
              <span className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-badge',
                item.passed ? 'bg-status-pass-bg text-status-pass-fg'
                            : item.blocking ? 'bg-status-fail-bg text-status-fail-fg'
                                            : 'bg-status-pending-bg text-status-pending-fg'
              )}>
                {item.passed ? <Check size={10} /> : <X size={10} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-[12.5px]',
                  item.passed ? 'text-text-secondary' : 'text-text-primary')}>
                  {item.label}
                </span>
                {item.detail && !item.passed && (
                  <span className="block text-[11px] text-text-faint">{item.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {/* Stated once, plainly. An editor who thinks the checklist can block
            them stops reading it. */}
        <p className="text-[11px] text-text-faint">
          Advisory. Only the items marked in red also block publishing.
        </p>
      </div>
    </div>
  )
}