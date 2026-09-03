import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { contentApi } from '../../../api/content.api'
import { useContentTaxonomy } from '../../../hooks/useContent'
import { Card, CardHeader, CardBody } from '../../../components/ui/Card'
import { Input, Textarea } from '../../../components/ui/Input'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/cn'

/**
 * Categories, tags and authors.
 *
 * ── seoIntroCopy IS NOT A NICE-TO-HAVE ───────────────────────────────────────
 * A category page with a heading and a grid of cards is a thin page — and it is
 * linked from every article in the category, so it has authority pointed at it
 * and nothing to say. The intro copy is the whole reason
 * /blog/category/soc-2 is worth ranking on its own.
 *
 * ── AUTHORS ARE NOT USERS ────────────────────────────────────────────────────
 * An external contributor — a partner auditor, a customer CISO writing a guest
 * piece — needs a byline and a credentials line and must never get a login.
 * That is why this is its own table.
 */
export default function TaxonomyPage() {
  const { categories, tags, authors } = useContentTaxonomy()
  const client = useQueryClient()
  const [tab, setTab] = useState('categories')

  const invalidate = (key) => () => {
    client.invalidateQueries({ queryKey: [key] })
    toast.success('Saved')
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Taxonomy</h1>
        <p className="text-[13px] text-text-secondary">Categories, tags and bylines.</p>
      </div>

      <div className="flex gap-1">
        {['categories', 'tags', 'authors'].map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
                  className={cn('rounded-badge px-3 py-1.5 text-[12.5px] capitalize transition-colors',
                    tab === t ? 'bg-brand-500 text-brand-900'
                              : 'text-text-secondary hover:bg-surface-overlay')}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'categories' && (
        <EditableList
          items={categories.data || []}
          labelOf={(c) => c.name}
          onSave={(v) => (v.id ? contentApi.updateCategory(v.id, v) : contentApi.createCategory(v))
            .then(invalidate('content-categories'))}
          blank={{ name: '', slug: '', seoIntroCopy: '', metaDescription: '', sortOrder: 0 }}
          render={(draft, set) => (
            <>
              <Input label="Name" value={draft.name || ''} onChange={(e) => set({ name: e.target.value })} />
              <Input label="Slug" value={draft.slug || ''} onChange={(e) => set({ slug: e.target.value })}
                     helperText="Generated from the name if left blank" />
              <Textarea
                label="Intro copy"
                rows={4}
                value={draft.seoIntroCopy || ''}
                onChange={(e) => set({ seoIntroCopy: e.target.value })}
                helperText="Rendered above the article grid. Without it this page is a thin duplicate with authority pointed at it."
              />
              <Textarea label="Meta description" rows={2} value={draft.metaDescription || ''}
                        onChange={(e) => set({ metaDescription: e.target.value })} />
            </>
          )}
        />
      )}

      {tab === 'tags' && (
        <EditableList
          items={tags.data || []}
          labelOf={(t) => t.name}
          onSave={(v) => contentApi.createTag(v).then(invalidate('content-tags'))}
          blank={{ name: '', slug: '', description: '' }}
          render={(draft, set) => (
            <>
              <Input label="Name" value={draft.name || ''} onChange={(e) => set({ name: e.target.value })} />
              <Input label="Description" value={draft.description || ''}
                     onChange={(e) => set({ description: e.target.value })} />
              <p className="text-[11px] text-text-faint">
                Tag pages become indexable automatically once four published posts carry the tag.
                Below that they are thin duplicates of the category page.
              </p>
            </>
          )}
        />
      )}

      {tab === 'authors' && (
        <EditableList
          items={authors.data || []}
          labelOf={(a) => a.displayName}
          onSave={(v) => (v.id ? contentApi.updateAuthor(v.id, v) : contentApi.createAuthor(v))
            .then(invalidate('content-authors'))}
          blank={{ displayName: '', slug: '', role: '', credentials: '', bio: '', linkedinUrl: '' }}
          render={(draft, set) => (
            <>
              <Input label="Display name" value={draft.displayName || ''}
                     onChange={(e) => set({ displayName: e.target.value })} />
              <Input label="Role" value={draft.role || ''} onChange={(e) => set({ role: e.target.value })}
                     placeholder="Head of Compliance Research" />
              <Input label="Credentials" value={draft.credentials || ''}
                     onChange={(e) => set({ credentials: e.target.value })}
                     placeholder="CISA, ISO 27001 LA"
                     helperText="Shown in the byline. For this audience it is the line that decides whether they keep reading." />
              <Textarea label="Bio" rows={4} value={draft.bio || ''} onChange={(e) => set({ bio: e.target.value })} />
              <Input label="LinkedIn" value={draft.linkedinUrl || ''}
                     onChange={(e) => set({ linkedinUrl: e.target.value })} />
            </>
          )}
        />
      )}
    </div>
  )
}

function EditableList({ items, labelOf, render, onSave, blank }) {
  const [draft, setDraft] = useState(null)
  const set = (changes) => setDraft((d) => ({ ...d, ...changes }))

  const save = useMutation({
    mutationFn: () => onSave(draft),
    onSuccess: () => setDraft(null),
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Could not save'),
  })

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_22rem] gap-5">
      <Card>
        <CardHeader
          title={`${items.length} ${items.length === 1 ? 'entry' : 'entries'}`}
          actions={<Button size="sm" variant="secondary" icon={Plus}
                           onClick={() => setDraft({ ...blank })}>New</Button>}
        />
        <CardBody>
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setDraft({ ...item })}
                        className={cn('flex w-full items-center gap-2 rounded-ctl px-2 py-2 text-left transition-colors',
                          draft?.id === item.id ? 'bg-surface-overlay' : 'hover:bg-surface-overlay')}>
                  <span className="flex-1 truncate text-[13px] text-text-primary">{labelOf(item)}</span>
                  <span className="reg-code font-mono text-[11px] text-text-faint">{item.slug}</span>
                </button>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {draft && (
        <Card>
          <CardHeader title={draft.id ? 'Edit' : 'New'} />
          <CardBody>
            <div className="flex flex-col gap-4">
              {render(draft, set)}
              <div className="flex gap-2">
                <Button size="sm" variant="primary" icon={Check}
                        loading={save.isPending} onClick={() => save.mutate()}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}