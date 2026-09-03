import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { contentApi } from '../../../../api/content.api'
import { Modal } from '../../../../components/ui/Modal'
import { Input, Textarea } from '../../../../components/ui/Input'
import { Button } from '../../../../components/ui/Button'

/**
 * Create a category, tag or author from inside the editor.
 *
 * ── WHY NOT JUST LINK TO THE TAXONOMY PAGE ───────────────────────────────────
 *
 * Because leaving costs the writer their place. Choosing an author is a step in
 * publishing, and the moment it requires a navigation away from a half-written
 * draft it stops being a step and becomes an interruption — you go, you create
 * the thing, and then you have to find your way back to the post you were in.
 * Autosave means nothing is lost, but attention is.
 *
 * The Taxonomy screen still exists and is still the right place to edit an
 * existing category's intro copy or an author's bio. This is the other half:
 * making the one you need right now, in the two fields that actually block you.
 *
 * ── WHY THE FIELDS ARE FEWER HERE ────────────────────────────────────────────
 *
 * A category has intro copy, meta title, meta description and a sort order; an
 * author has a bio, a headshot and three social links. None of that is needed
 * to attach one to a draft, and asking for it here would rebuild the Taxonomy
 * page inside a modal — which is how a shortcut ends up slower than the path it
 * was meant to replace.
 *
 * Two exceptions, both deliberate:
 *
 *   - An author's ROLE and CREDENTIALS are offered, because they render in the
 *     byline and in the reviewed-by line. An author profile created without
 *     them is one somebody has to come back and finish before publishing, and
 *     the person who knows what they say is the person creating it.
 *   - Slugs are not offered at all. The server derives one from the name and
 *     guarantees uniqueness; a slug typed in a hurry is a slug someone has to
 *     live with.
 */

const KINDS = {
  category: {
    title: 'New category',
    subtitle: 'The primary grouping. It becomes a URL and a breadcrumb.',
    blank: { name: '', description: '' },
    create: (v) => contentApi.createCategory(v),
    queryKey: 'content-categories',
    valid: (v) => (v.name || '').trim().length > 1,
    fields: (v, set) => (
      <>
        <Input
          label="Name"
          value={v.name || ''}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Indian regulation"
          autoFocus
          helperText="The URL is generated from this — /blog/category/indian-regulation"
        />
        <Input
          label="Description (optional)"
          value={v.description || ''}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="One line on what belongs in here"
        />
      </>
    ),
  },

  tag: {
    title: 'New tag',
    subtitle: 'Secondary grouping. A post can carry several.',
    blank: { name: '' },
    create: (v) => contentApi.createTag(v),
    queryKey: 'content-tags',
    valid: (v) => (v.name || '').trim().length > 1,
    fields: (v, set) => (
      <Input
        label="Name"
        value={v.name || ''}
        onChange={(e) => set({ name: e.target.value })}
        placeholder="CERT-In"
        autoFocus
        helperText="Tag pages become indexable once four published posts carry the tag."
      />
    ),
  },

  author: {
    title: 'New author',
    subtitle: 'A byline with a profile page. Not a platform login.',
    blank: { displayName: '', role: '', credentials: '' },
    create: (v) => contentApi.createAuthor(v),
    queryKey: 'content-authors',
    // Every accessor tolerates undefined. The reset above makes that
    // unnecessary in theory; in practice a field added to `blank` later should
    // not be able to crash the editor from inside a modal.
    valid: (v) => (v.displayName || '').trim().length > 1,
    fields: (v, set) => (
      <>
        <Input
          label="Display name"
          value={v.displayName || ''}
          onChange={(e) => set({ displayName: e.target.value })}
          placeholder="Aparna Iyer"
          autoFocus
        />
        <Input
          label="Role"
          value={v.role || ''}
          onChange={(e) => set({ role: e.target.value })}
          placeholder="Head of Compliance Research"
        />
        <Input
          label="Credentials"
          value={v.credentials || ''}
          onChange={(e) => set({ credentials: e.target.value })}
          placeholder="CISA, ISO 27001 LA"
          helperText="Shown in the byline. For this audience it is the line that decides whether they keep reading."
        />
        <p className="text-[11px] text-text-faint">
          Add a bio and links later in Categories &amp; Authors.
        </p>
      </>
    ),
  },
}

/**
 * @param kind       'category' | 'tag' | 'author' | null — null means closed
 * @param onCreated  receives the created record, so the caller can select it
 */
export function QuickCreateModal({ kind, onClose, onCreated }) {
  const config = kind ? KINDS[kind] : null
  const client = useQueryClient()

  /**
   * The draft resets DURING render when `kind` changes, not in an effect.
   *
   * This component is always mounted — SettingsPanel renders it with kind=null
   * and flips the prop to open it. useState only reads its initialiser on the
   * first render, so the draft was seeded as {} and an effect was supposed to
   * fill it in when a kind arrived. But effects run after render: the first
   * render with kind='category' still saw {}, and config.valid() reached for
   * draft.name.trim() on undefined.
   *
   * Comparing against the previous kind during render is React's documented
   * pattern for deriving state from a prop. React discards this render and
   * re-runs immediately, so nothing is painted from the stale draft and no
   * extra commit happens — which an effect cannot promise.
   */
  const [draft, setDraft] = useState({})
  const [lastKind, setLastKind] = useState(kind)
  if (kind !== lastKind) {
    setLastKind(kind)
    setDraft(config ? { ...config.blank } : {})
  }

  const save = useMutation({
    mutationFn: () => config.create(draft),
    onSuccess: (created) => {
      // The axios interceptor unwraps ApiResponse, so `created` is the record.
      client.invalidateQueries({ queryKey: [config.queryKey] })
      onCreated?.(created)
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Could not save'),
  })

  if (!config) return null

  const set = (changes) => setDraft((d) => ({ ...d, ...changes }))
  const ready = config.valid(draft)

  return (
    <Modal open onClose={onClose} title={config.title} subtitle={config.subtitle} size="sm">
      {/* Enter submits. A three-field modal that needs a mouse to close is a
          three-field modal people stop using. */}
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => { e.preventDefault(); if (ready && !save.isPending) save.mutate() }}
      >
        {config.fields(draft, set)}

        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" size="sm" variant="primary" loading={save.isPending} disabled={!ready}>
            Create
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  )
}