import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, Plus, Trash2, Eye, EyeOff, ExternalLink, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../config/axios.config'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { cn } from '../../lib/cn'

/**
 * The trust page editor.
 *
 * ── WHY THIS IS NOT A UniversalModulePage SCREEN ──────────────────────────
 * There is exactly ONE trust centre per tenant. Running it through the generic
 * renderer would give a list view that always contains a single row, and a
 * detail drawer for a record nobody navigates to. The nav entry pointed at
 * /trust-center and nothing served it, which is the shape of the problem.
 */
export default function TrustCenterPage() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['trust-admin'],
    queryFn: () => api.get('/v1/trust/admin'),
  })

  const center    = draft ?? data?.center ?? null
  const sections  = data?.sections ?? []
  const documents = data?.documents ?? []
  const exists    = Boolean(data?.center?.id)

  const refresh = () => { setDraft(null); qc.invalidateQueries({ queryKey: ['trust-admin'] }) }

  const save = useMutation({
    mutationFn: (body) => api.put('/v1/trust', body),
    onSuccess: () => { toast.success('Saved'); refresh() },
    onError: e => toast.error(e?.message || 'Could not save'),
  })

  const publish = useMutation({
    mutationFn: () => api.post('/v1/trust/publish'),
    onSuccess: () => { toast.success('Your trust page is live'); refresh() },
    // The service refuses an empty page on purpose, and the message explains
    // why. Surfacing it verbatim beats a generic failure toast.
    onError: e => toast.error(e?.message || 'Could not publish', { duration: 8000 }),
  })

  const unpublish = useMutation({
    mutationFn: () => api.post('/v1/trust/unpublish'),
    onSuccess: () => { toast.success('Taken down'); refresh() },
  })

  const saveSection = useMutation({
    mutationFn: (body) => api.put('/v1/trust/sections', body),
    onSuccess: refresh,
    onError: e => toast.error(e?.message || 'Could not save the section'),
  })

  const removeSection = useMutation({
    mutationFn: (id) => api.delete(`/v1/trust/sections/${id}`),
    onSuccess: refresh,
  })

  const saveDocument = useMutation({
    mutationFn: (body) => api.put('/v1/trust/documents', body),
    onSuccess: refresh,
    onError: e => toast.error(e?.message || 'Could not save the document'),
  })

  const removeDocument = useMutation({
    mutationFn: (id) => api.delete(`/v1/trust/documents/${id}`),
    onSuccess: refresh,
  })

  const set = (k, v) => setDraft({ ...(center || {}), [k]: v })

  if (isLoading) {
    return <div className="p-6 text-sm text-text-muted">Loading…</div>
  }

  const publicUrl = center?.slug ? `${window.location.origin}/trust/${center.slug}` : null

  return (
    <div className="p-6 space-y-5 animate-fade-in max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Trust page</h1>
          <p className="text-sm text-text-muted mt-0.5">
            What prospects see when they ask how you protect their data.
          </p>
        </div>

        {exists && (
          <div className="flex items-center gap-2 shrink-0">
            {publicUrl && data.center.isPublished && (
              <a href={publicUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-ctl
                           border border-border text-text-secondary hover:bg-surface-overlay">
                <ExternalLink size={12} /> View
              </a>
            )}
            {data.center.isPublished ? (
              <button onClick={() => unpublish.mutate()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-ctl
                           border border-border text-text-muted hover:text-text-primary">
                <EyeOff size={12} /> Take down
              </button>
            ) : (
              <button onClick={() => publish.mutate()} disabled={publish.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-ctl
                           bg-brand-500 text-white disabled:opacity-60">
                <Eye size={12} /> {publish.isPending ? 'Publishing…' : 'Publish'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* State, stated plainly. "Published" and "not published" are the two
          things somebody opening this page wants to know first, and the public
          address is the thing they will paste into a sales email. */}
      {exists && (
        <div className={cn('rounded-card border px-4 py-3 text-xs flex items-center gap-2',
          data.center.isPublished
            ? 'bg-status-pass-bg/40 border-status-pass-fg/20 text-status-pass-fg'
            : 'bg-surface-raised border-border text-text-muted')}>
          <Globe size={14} />
          {data.center.isPublished
            ? <span>Live at <span className="font-mono">{publicUrl}</span></span>
            : <span>Not published. Nothing is publicly visible yet.</span>}
        </div>
      )}

      {/* ── The page itself ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader title={exists ? 'Page details' : 'Set up your trust page'}
          subtitle={exists ? null : 'Pick a web address. It has to be unique across the platform.'} />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Web address" hint={center?.slug ? `/trust/${center.slug}` : 'e.g. acme'}>
              <input value={center?.slug || ''} onChange={e => set('slug', e.target.value)}
                placeholder="acme" className={INPUT} />
            </Field>
            <Field label="Page title">
              <input value={center?.title || ''} onChange={e => set('title', e.target.value)}
                placeholder="Acme — Trust Center" className={INPUT} />
            </Field>
          </div>
          <Field label="Headline">
            <input value={center?.headline || ''} onChange={e => set('headline', e.target.value)}
              placeholder="How we protect the data you trust us with" className={INPUT} />
          </Field>
          <Field label="Introduction">
            <textarea rows={4} value={center?.introMd || ''} onChange={e => set('introMd', e.target.value)}
              className={INPUT} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact email" hint="Shown to anyone who wants to ask something else">
              <input value={center?.contactEmail || ''} onChange={e => set('contactEmail', e.target.value)}
                placeholder="security@acme.com" className={INPUT} />
            </Field>
            <Field label="Custom domain" hint="Optional. Point a CNAME here to host it on your own domain.">
              <input value={center?.customDomain || ''} onChange={e => set('customDomain', e.target.value)}
                placeholder="trust.acme.com" className={INPUT} />
            </Field>
          </div>

          <label className="flex items-start gap-2 pt-1">
            <input type="checkbox" className="mt-0.5"
              checked={Boolean(center?.autoApproveEmailGated)}
              onChange={e => set('autoApproveEmailGated', e.target.checked)} />
            <span className="text-xs text-text-secondary">
              Release email-gated documents automatically
              <span className="block text-[11px] text-text-muted">
                A work email is enough, no waiting. Documents marked NDA required are never
                auto-released regardless of this setting.
              </span>
            </span>
          </label>

          <div className="pt-1">
            <button onClick={() => save.mutate(center || {})} disabled={save.isPending || !center?.slug}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-ctl
                         bg-brand-500 text-white disabled:opacity-50">
              <Save size={12} /> {save.isPending ? 'Saving…' : exists ? 'Save changes' : 'Create page'}
            </button>
          </div>
        </CardBody>
      </Card>

      {exists && (
        <>
          <SectionEditor
            sections={sections}
            onSave={b => saveSection.mutate(b)}
            onDelete={id => removeSection.mutate(id)} />

          <DocumentEditor
            documents={documents}
            onSave={b => saveDocument.mutate(b)}
            onDelete={id => removeDocument.mutate(id)} />
        </>
      )}
    </div>
  )
}

const INPUT = 'w-full px-2.5 py-1.5 text-sm rounded-ctl border border-border bg-surface-raised ' +
              'text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500'

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-text-muted mt-1">{hint}</p>}
    </div>
  )
}

function SectionEditor({ sections, onSave, onDelete }) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState('CUSTOM')
  const [body, setBody] = useState('')

  const submit = () => {
    if (!title.trim()) return
    onSave({ title, sectionType: type, bodyMd: body, sortOrder: (sections.length + 1) * 10 })
    setTitle(''); setBody(''); setAdding(false)
  }

  return (
    <Card>
      <CardHeader title="Sections" subtitle="Certifications, subprocessors, FAQ, or anything else"
        actions={
          <button onClick={() => setAdding(!adding)}
            className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
            <Plus size={12} /> Add
          </button>
        } />
      <CardBody className="space-y-2">
        {sections.length === 0 && !adding && (
          <p className="text-xs text-text-muted py-3">
            Nothing yet. A page with no sections cannot be published.
          </p>
        )}

        {sections.map(s => (
          <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-ctl border border-border">
            <span className="text-[10px] font-mono text-text-muted w-32 shrink-0 truncate">
              {String(s.sectionType).replace(/_/g, ' ').toLowerCase()}
            </span>
            <span className="flex-1 text-sm text-text-primary truncate">{s.title}</span>
            <button onClick={() => onDelete(s.id)}
              className="text-text-muted hover:text-status-fail-fg"><Trash2 size={13} /></button>
          </div>
        ))}

        {adding && (
          <div className="rounded-ctl border border-brand-500/40 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Section title" className={INPUT} />
              <select value={type} onChange={e => setType(e.target.value)} className={INPUT}>
                <option value="CERTIFICATIONS">Certifications</option>
                <option value="CONTROLS">Controls</option>
                <option value="SUBPROCESSORS">Subprocessors</option>
                <option value="FAQ">FAQ</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <textarea rows={3} value={body} onChange={e => setBody(e.target.value)}
              placeholder="Body text (Markdown)" className={INPUT} />
            <div className="flex gap-2">
              <button onClick={submit} className="px-3 py-1 text-xs rounded-ctl bg-brand-500 text-white">Add</button>
              <button onClick={() => setAdding(false)} className="px-3 py-1 text-xs rounded-ctl border border-border text-text-muted">Cancel</button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function DocumentEditor({ documents, onSave, onDelete }) {
  return (
    <Card>
      <CardHeader title="Documents"
        subtitle="Files already in your document store. Publishing a copy is how a page ends up serving last year's report." />
      <CardBody className="space-y-2">
        {documents.length === 0 && (
          <p className="text-xs text-text-muted py-3">
            No documents on the page yet.
          </p>
        )}
        {documents.map(d => (
          <div key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-ctl border border-border">
            <span className="flex-1 min-w-0">
              <span className="block text-sm text-text-primary truncate">{d.title}</span>
              {d.validUntil && (
                <span className="block text-[11px] text-text-muted">Valid until {d.validUntil}</span>
              )}
            </span>
            {/* The gate, changeable in place. It is the field people revisit —
                a report that was NDA-only during a deal often becomes email-
                gated afterwards. */}
            <select
              value={d.accessLevel}
              onChange={e => onSave({ id: d.id, accessLevel: e.target.value })}
              className="text-[11px] rounded-ctl border border-border bg-surface-raised px-1.5 py-1">
              <option value="PUBLIC">Public</option>
              <option value="EMAIL_GATED">Email required</option>
              <option value="NDA_REQUIRED">NDA required</option>
              <option value="ON_REQUEST">On request only</option>
            </select>
            <button onClick={() => onDelete(d.id)}
              className="text-text-muted hover:text-status-fail-fg"><Trash2 size={13} /></button>
          </div>
        ))}
      </CardBody>
    </Card>
  )
}
