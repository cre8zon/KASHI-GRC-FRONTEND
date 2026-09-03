import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, ShieldCheck, Image as ImageIcon, Plus } from 'lucide-react'
import { QuickCreateModal } from './QuickCreateModal'
import { Input } from '../../../../components/ui/Input'
import { Select } from '../../../../components/ui/Select'
import { Button } from '../../../../components/ui/Button'
import { cn } from '../../../../lib/cn'

/**
 * Type, taxonomy, people, images, freshness. Everything that is about the post
 * rather than in it.
 */
/**
 * Shown in place of an empty dropdown. Opens the create modal rather than
 * navigating: a select with one disabled placeholder is a dead end, and a link
 * out of the editor costs the writer their place.
 */
function EmptyPicker({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-1.5 rounded-ctl border border-dashed border-border px-2.5 py-2 text-left text-[12.5px] text-text-secondary transition-colors hover:border-brand-500 hover:text-brand-900"
    >
      <Plus size={12} className="shrink-0" />
      {children}
    </button>
  )
}

/**
 * A populated select plus a way to add one more.
 *
 * The empty state is the obvious case, but the second category is created just
 * as often as the first — and once the dropdown has something in it, the only
 * route to adding another was the sidebar. Same button either way.
 */
function PickerWithAdd({ children, onAdd, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onAdd}
        aria-label={label}
        title={label}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl border border-border text-text-secondary transition-colors hover:border-brand-500 hover:text-brand-900"
      >
        <Plus size={13} />
      </button>
    </div>
  )
}

export function SettingsPanel({ post, patch, taxonomy, media, onPickHero, onPickOg }) {
  const categories = taxonomy.categories.data || []
  const tags = taxonomy.tags.data || []
  const authors = taxonomy.authors.data || []
  // Distinguish "still loading" from "genuinely none": showing the create
  // prompt for a second on every open would be its own kind of wrong.
  const loadedAuthors = !taxonomy.authors.isLoading
  const loadedCategories = !taxonomy.categories.isLoading
  const loadedTags = !taxonomy.tags.isLoading

  // Which quick-create modal is open, and what to do with the record it makes.
  // Held as a pair so the same modal can serve Author and Reviewed by without
  // either one guessing which of them asked.
  const [quick, setQuick] = useState(null)   // { kind, apply } | null

  const selectedTags = post.tagIds || []
  const toggleTag = (id) => patch({
    tagIds: selectedTags.includes(id)
      ? selectedTags.filter((t) => t !== id)
      : [...selectedTags, id],
  })

  const hero = media?.[post.heroImageId]
  const og = media?.[post.ogImageId]

  return (
    <div className="flex flex-col gap-6 p-4">
      <Field label="Content type">
        <Select
          value={post.contentType || 'BLOG'}
          onChange={(e) => patch({ contentType: e.target.value })}
          options={[
            { value: 'BLOG', label: 'Blog post' },
            { value: 'COMPARISON', label: 'Comparison' },
            { value: 'GLOSSARY', label: 'Glossary entry' },
            { value: 'CASE_STUDY', label: 'Case study' },
            { value: 'CHANGELOG', label: 'Changelog' },
            { value: 'PILLAR', label: 'Pillar / hub page' },
          ]}
        />
      </Field>

      {/* Only a glossary page has a definition, and burying it in the blocks
          would let an editor put it below the fold — which is exactly what
          loses the featured snippet. */}
      {post.contentType === 'GLOSSARY' && (
        <Field label="Definition" hint="The first two or three sentences. This is what gets pulled into a snippet.">
          <textarea
            rows={3}
            value={post.definitionSummary || ''}
            onChange={(e) => patch({ definitionSummary: e.target.value })}
            className="w-full rounded-ctl border border-border bg-surface p-2.5 text-[13px] text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-800/40"
          />
        </Field>
      )}

      <Field label="Category">
        {loadedCategories && categories.length === 0 ? (
          <EmptyPicker onClick={() => setQuick({
            kind: 'category',
            apply: (c) => patch({ categoryId: c.id }),
          })}>
            Create your first category
          </EmptyPicker>
        ) : (
          <PickerWithAdd
            label="New category"
            onAdd={() => setQuick({ kind: 'category', apply: (c) => patch({ categoryId: c.id }) })}
          >
            <Select
              value={post.categoryId || ''}
              onChange={(e) => patch({ categoryId: e.target.value ? Number(e.target.value) : null })}
              placeholder="No category"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </PickerWithAdd>
        )}
      </Field>

      <Field label="Tags">
        {loadedTags && tags.length === 0 && (
          <EmptyPicker onClick={() => setQuick({
            kind: 'tag',
            // A tag made from here is one you wanted on this post.
            apply: (t) => patch({ tagIds: [...(post.tagIds || []), t.id] }),
          })}>
            Create your first tag
          </EmptyPicker>
        )}
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTag(t.id)}
              className={cn(
                'rounded-badge px-2.5 py-1 text-[11.5px] transition-colors',
                selectedTags.includes(t.id)
                  ? 'bg-status-tag-bg text-status-tag-fg'
                  : 'bg-surface-inset text-text-secondary hover:bg-surface-overlay'
              )}
            >
              {t.name}
            </button>
          ))}
          {tags.length > 0 && (
            <button
              type="button"
              onClick={() => setQuick({
                kind: 'tag',
                apply: (t) => patch({ tagIds: [...(post.tagIds || []), t.id] }),
              })}
              className="flex items-center gap-1 rounded-badge border border-dashed border-border px-2.5 py-1 text-[11.5px] text-text-secondary transition-colors hover:border-brand-500 hover:text-brand-900"
            >
              <Plus size={11} /> New
            </button>
          )}
        </div>
      </Field>

      <Field label="Author" hint="Required to publish.">
        {loadedAuthors && authors.length === 0 ? (
          <EmptyPicker onClick={() => setQuick({
            kind: 'author',
            apply: (a) => patch({ authorId: a.id }),
          })}>
            Create an author profile
          </EmptyPicker>
        ) : (
          <PickerWithAdd
            label="New author"
            onAdd={() => setQuick({ kind: 'author', apply: (a) => patch({ authorId: a.id }) })}
          >
            <Select
              value={post.authorId || ''}
              onChange={(e) => patch({ authorId: e.target.value ? Number(e.target.value) : null })}
              placeholder="Choose an author"
              options={authors.map((a) => ({ value: a.id, label: a.displayName }))}
            />
          </PickerWithAdd>
        )}
      </Field>

      {/* Rendered above the fold as "Reviewed by X, CISA". For compliance
          content this is the cheapest trust signal available, and the buyer is
          a professional skeptic. */}
      <Field
        label={<><ShieldCheck size={12} className="inline text-brand-900" /> Reviewed by</>}
        hint="Shown above the fold. Use it on anything making a regulatory claim."
      >
        {loadedAuthors && authors.length === 0 ? (
          <EmptyPicker onClick={() => setQuick({
            kind: 'author',
            apply: (a) => patch({ reviewedById: a.id }),
          })}>
            Create an author profile
          </EmptyPicker>
        ) : (
          <PickerWithAdd
            label="New author"
            onAdd={() => setQuick({ kind: 'author', apply: (a) => patch({ reviewedById: a.id }) })}
          >
            <Select
              value={post.reviewedById || ''}
              onChange={(e) => patch({ reviewedById: e.target.value ? Number(e.target.value) : null })}
              placeholder="Not reviewed"
              options={authors.map((a) => ({ value: a.id, label: a.displayName }))}
            />
          </PickerWithAdd>
        )}
      </Field>

      <Field label="Hero image" hint="Required to publish. Also the social card fallback.">
        <ImageSlot asset={hero} onPick={onPickHero} />
      </Field>

      <Field label="Social image" hint="Social crops are 1.91:1 — a hero built for a content column loses its subject.">
        <ImageSlot asset={og} onPick={onPickOg} fallbackLabel="Uses the hero image" />
      </Field>

      <Field label="Pillar cluster" hint="Drives prev/next in the series and related posts.">
        <div className="flex gap-2">
          <Input
            type="number"
            value={post.pillarClusterId || ''}
            onChange={(e) => patch({ pillarClusterId: e.target.value ? Number(e.target.value) : null })}
            placeholder="Hub post id"
            className="flex-1"
          />
          <Input
            type="number"
            value={post.clusterOrder ?? ''}
            onChange={(e) => patch({ clusterOrder: e.target.value ? Number(e.target.value) : null })}
            placeholder="Order"
            className="w-20"
          />
        </div>
      </Field>

      {/* Freshness as a maintenance commitment rather than a claim of accuracy.
          Comparison pages carry competitor facts that rot without anyone
          touching the file. */}
      <Field label="Re-verify every" hint="Flags the post for a fact check once this elapses.">
        <div className="flex items-center gap-2">
          <Select
            value={post.reviewIntervalMonths ?? ''}
            onChange={(e) => patch({ reviewIntervalMonths: e.target.value ? Number(e.target.value) : null })}
            placeholder="Never"
            options={[
              { value: 3, label: '3 months' },
              { value: 6, label: '6 months' },
              { value: 12, label: '12 months' },
            ]}
            className="flex-1"
          />
          <Button variant="secondary" size="sm" icon={Calendar}
                  onClick={() => patch({ markVerified: true })}>
            Verified today
          </Button>
        </div>
        {post.lastVerifiedAt && (
          <p className="mt-1 text-[11px] text-text-faint">
            Last verified {new Date(post.lastVerifiedAt).toLocaleDateString('en-GB',
              { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </Field>

      {/* One modal for all three. It selects what it creates, so the field you
          were filling in is filled in when it closes. */}
      <QuickCreateModal
        kind={quick?.kind || null}
        onClose={() => setQuick(null)}
        onCreated={(record) => quick?.apply?.(record)}
      />

      {/* The full screen still exists for editing bios, intro copy and sort
          order — the things you do not need mid-draft. */}
      <Link
        to="/admin/content/taxonomy"
        className="text-[11px] text-text-faint underline-offset-2 hover:text-brand-900 hover:underline"
      >
        Manage all categories, tags and authors
      </Link>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-text-faint">{hint}</p>}
    </div>
  )
}

function ImageSlot({ asset, onPick, fallbackLabel = 'None chosen' }) {
  if (!asset) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="flex h-20 w-full items-center justify-center gap-2 rounded-card border border-dashed border-border text-xs text-text-faint transition-colors hover:border-brand-500 hover:text-brand-900"
      >
        <ImageIcon size={15} /> {fallbackLabel}
      </button>
    )
  }
  return (
    <button type="button" onClick={onPick} className="group relative overflow-hidden rounded-card border border-border">
      <img src={asset.url} alt={asset.altText} className="h-20 w-full object-cover" />
      <span className="absolute inset-0 flex items-center justify-center bg-surface-overlay text-xs text-text-primary opacity-0 transition-opacity group-hover:opacity-95">
        Replace
      </span>
    </button>
  )
}