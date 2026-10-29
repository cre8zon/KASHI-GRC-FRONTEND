/**
 * GuidesAdminPage — /admin/guides (Platform Admin)
 *
 * One place for every walkthrough and guide customers see:
 *   - per module: "How this module works" — summary, connections to other
 *     modules, the module video and its chapters
 *   - per workflow of that module: walkthrough video, chapter time per step and
 *     the "what to do" line for whoever acts on each step
 *
 * Saved on the platform blueprint / platform workflow, so one edit reaches
 * every organisation. Customers see it on the module's list (guide band or
 * workflow band), on /guide/{module}, in the workflow catalogue, and in a
 * task's action bar and workflow guide drawer.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, Eye, GitBranch, Plus, Save, Search, Trash2, Upload, Video } from 'lucide-react'
import api from '../../../config/axios.config'
import { cn } from '../../../lib/cn'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button } from '../../../components/ui/Button'
import { useWorkflowCatalogue, guideRoute } from '../../../components/list/ListBands'
import { DemoSettings, ModuleGuideSection, StepWizard } from '../../workflow/WorkflowCataloguePage'
import { Modal } from '../../../components/ui/Modal'

const mmss = (s) => (s == null || s === '' ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`)
const toSeconds = (v) => {
  const s = String(v || '').trim()
  if (!s) return null
  if (s.includes(':')) { const [m, sec] = s.split(':'); return (Number(m) || 0) * 60 + (Number(sec) || 0) }
  return Number(s) || 0
}

export default function GuidesAdminPage() {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)
  const [preview, setPreview] = useState(false)

  const { data: listRes, isLoading } = useQuery({
    queryKey: ['guides-admin-modules'],
    queryFn: () => api.get('/v1/admin/module-blueprints', { params: { take: 200 } }),
    staleTime: 5 * 60_000,
  })
  const modules = useMemo(() => {
    const items = listRes?.items || listRes?.data?.items || (Array.isArray(listRes) ? listRes : [])
    // Platform blueprints only — guides are written once, for everyone.
    return items
      .filter(m => m.tenantId == null && m.isActive !== false)
      .sort((a, b) => String(a.displayName || a.entityType).localeCompare(String(b.displayName || b.entityType)))
  }, [listRes])
  const shown = modules.filter(m => !q || `${m.displayName} ${m.entityType}`.toLowerCase().includes(q.toLowerCase()))
  const current = modules.find(m => m.entityType === selected) || null

  useEffect(() => { if (!selected && modules.length) setSelected(modules[0].entityType) }, [modules, selected])

  return (
    <PageLayout title="Guides & demos"
      subtitle="Walkthrough videos and guidance that every organisation sees — per module and per workflow step">
      {/* Two columns that scroll on their own (large screens): the module
          list and the selected module's editor. The page itself stays put. */}
      <div className="px-6 pb-4 flex gap-4 items-start flex-wrap lg:flex-nowrap lg:h-full lg:min-h-0 lg:items-stretch">
        {/* Modules */}
        <aside className="flex-[0_0_260px] min-w-0 rounded-card border border-border bg-surface-raised overflow-hidden flex flex-col lg:min-h-0">
          <div className="p-2 border-b border-border">
            <label className="relative block">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a module…" aria-label="Find a module"
                className="w-full h-8 pl-7 pr-2 text-xs glass-field border border-border rounded-ctl text-text-primary" />
            </label>
          </div>
          <div className="max-h-[70vh] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto scroll-quiet py-1">
            {isLoading && <p className="px-3 py-2 text-xs text-text-muted">Loading…</p>}
            {shown.map(m => (
              <button key={m.entityType} type="button" onClick={() => setSelected(m.entityType)}
                className={cn('w-full text-left px-3 py-2 flex items-center gap-2 text-xs transition-colors',
                  selected === m.entityType ? 'bg-brand-500/10 text-brand-ink font-semibold' : 'text-text-secondary hover:bg-surface-overlay')}>
                <span className="flex-1 truncate">{m.displayNamePlural || m.displayName || m.entityType}</span>
                {m.supportsWorkflow && <GitBranch size={11} className="text-text-muted shrink-0" aria-label="Runs workflows" />}
              </button>
            ))}
          </div>
        </aside>

        {/* Selected module */}
        <div className="flex-[1_1_640px] min-w-0 flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto scroll-quiet lg:pr-1 pb-4">
          {current && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-text-primary flex-1">{current.displayNamePlural || current.displayName}</h2>
                {/* Preview in place: a new browser tab starts signed out (the
                    session is per tab), so the old "open in new tab" link
                    landed on the login page. */}
                <Button size="sm" variant="secondary" icon={Eye} onClick={() => setPreview(true)}>
                  Preview as customers see it
                </Button>
                <Link to={guideRoute(current.entityType)}
                  className="text-xs font-semibold text-brand-ink hover:underline inline-flex items-center gap-1">
                  Open the full page <ExternalLink size={11} />
                </Link>
              </div>
              <ModuleGuideSettings key={current.entityType} entityType={current.entityType} modules={modules} />
              <ModuleWorkflows entityType={current.entityType} supportsWorkflow={!!current.supportsWorkflow} />
            </>
          )}
        </div>
      </div>
      {current && (
        <Modal open={preview} onClose={() => setPreview(false)} size="full"
          title={`How ${(current.displayNamePlural || current.displayName || '').toLowerCase()} work`}
          subtitle="Exactly what organisation users see — saved changes show here straight away">
          {preview && <GuidePreview entityType={current.entityType} supportsWorkflow={!!current.supportsWorkflow} />}
        </Modal>
      )}
    </PageLayout>
  )
}

// ─── Module guide editor ─────────────────────────────────────────────────────

function ModuleGuideSettings({ entityType, modules }) {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['module-guide-settings', entityType],
    queryFn: () => api.get(`/v1/module-guide/${entityType}/settings`),
    staleTime: 0,
  })
  const settings = data?.data || data
  const [summary, setSummary] = useState('')
  const [connections, setConnections] = useState([])
  const [chapters, setChapters] = useState([])
  const [actionItems, setActionItems] = useState([])
  const [link, setLink] = useState('')

  useEffect(() => {
    if (!settings) return
    const g = settings.guide || {}
    setSummary(g.summary || '')
    setConnections(Array.isArray(g.connections) ? g.connections : [])
    setChapters((Array.isArray(g.chapters) ? g.chapters : []).map(c => ({ label: c.label || '', time: mmss(c.seconds) })))
    setActionItems(Array.isArray(g.actionItems) ? g.actionItems : [])
    setLink(settings.demoVideoUrl || '')
  }, [settings])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['module-guide-settings', entityType] })
    qc.invalidateQueries({ queryKey: ['module-guide', entityType] })
    qc.invalidateQueries({ queryKey: ['module-demo', entityType] })
  }
  const save = useMutation({
    mutationFn: (body) => api.put(`/v1/module-guide/${entityType}`, body),
    onSuccess: () => { refresh(); toast.success('Module guide saved') },
    onError: (e) => toast.error(e?.message || 'Could not save'),
  })

  const upload = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const r = await api.post(`/v1/module-guide/${entityType}/demo/upload-url`, {
        fileName: file.name, mimeType: file.type, fileSizeBytes: file.size,
      })
      const u = r?.data || r
      const put = await fetch(u.presignedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': u.mimeType || file.type } })
      if (!put.ok) throw new Error(`Upload failed (${put.status})`)
      await save.mutateAsync({ demoVideoKey: u.s3Key })
    } catch (e) {
      toast.error(e?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>
  const states = settings?.lifecycle?.states || []

  return (
    <section className="rounded-card border border-border bg-surface-raised p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BookOpen size={15} className="text-brand-ink" />
        <h3 className="text-sm font-semibold text-text-primary">How this module works</h3>
      </div>

      <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">
        Summary
        <textarea rows={4} value={summary} onChange={e => setSummary(e.target.value)} maxLength={4000}
          placeholder="What this module is for, what a record goes through, and what people do in it."
          className="px-3 py-2 text-sm font-normal glass-field border border-border rounded-ctl text-text-primary resize-y" />
      </label>

      {states.length > 0 && (
        <p className="text-xs text-text-muted">
          Lifecycle shown from the blueprint's status flow: {states.map(s => s.label).join(' → ')}
        </p>
      )}

      {/* Connections */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-text-secondary flex-1">How it connects to other modules</p>
          <button type="button" onClick={() => setConnections(c => [...c, { entityType: '', label: '', text: '' }])}
            className="text-xs font-semibold text-brand-ink hover:underline inline-flex items-center gap-1"><Plus size={11} /> Add</button>
        </div>
        {connections.length === 0 && <p className="text-xs text-text-muted">None yet — e.g. "Assets feed risks: a risk names the assets it threatens."</p>}
        {connections.map((c, i) => (
          <div key={i} className="grid gap-2 items-start" style={{ gridTemplateColumns: '180px 1fr 1.6fr 28px' }}>
            <select value={c.entityType || ''} aria-label="Linked module"
              onChange={e => setConnections(cs => cs.map((x, j) => j === i ? { ...x, entityType: e.target.value || null } : x))}
              className="h-8 px-2 text-xs glass-field border border-border rounded-ctl text-text-primary">
              <option value="">No link</option>
              {modules.filter(m => m.entityType !== entityType).map(m => (
                <option key={m.entityType} value={m.entityType}>{m.displayNamePlural || m.displayName}</option>
              ))}
            </select>
            <input value={c.label || ''} placeholder="e.g. Feeds risks" aria-label="Connection title"
              onChange={e => setConnections(cs => cs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
              className="h-8 px-2 text-xs glass-field border border-border rounded-ctl text-text-primary" />
            <input value={c.text || ''} placeholder="One sentence on how" aria-label="Connection description"
              onChange={e => setConnections(cs => cs.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
              className="h-8 px-2 text-xs glass-field border border-border rounded-ctl text-text-primary" />
            <button type="button" aria-label="Remove connection" onClick={() => setConnections(cs => cs.filter((_, j) => j !== i))}
              className="h-8 w-7 flex items-center justify-center text-text-muted hover:text-status-fail-fg"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      {/* Action items — the per-question / per-control obligations people
          receive inside a record, beyond the workflow's own tasks. */}
      <div className="flex flex-col gap-2 pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-text-secondary flex-1">Action items in this module</p>
          <button type="button" onClick={() => setActionItems(a => [...a, { label: '', raisedWhen: '', goesTo: '', closesWhen: '' }])}
            className="text-xs font-semibold text-brand-ink hover:underline inline-flex items-center gap-1"><Plus size={11} /> Add</button>
        </div>
        {actionItems.length === 0 && <p className="text-xs text-text-muted">None — add one for each kind of action item people receive in this module (e.g. "Question assignment").</p>}
        {actionItems.map((a, i) => (
          <div key={i} className="grid gap-2 items-start" style={{ gridTemplateColumns: '160px 1fr 1fr 1fr 28px' }}>
            {[['label', 'Name, e.g. Revision request'], ['raisedWhen', 'Raised when…'], ['goesTo', 'Goes to…'], ['closesWhen', 'Closes when…']].map(([k, ph]) => (
              <input key={k} value={a[k] || ''} placeholder={ph} aria-label={ph}
                onChange={e => setActionItems(as => as.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x))}
                className="h-8 px-2 text-xs glass-field border border-border rounded-ctl text-text-primary" />
            ))}
            <button type="button" aria-label="Remove action item" onClick={() => setActionItems(as => as.filter((_, j) => j !== i))}
              className="h-8 w-7 flex items-center justify-center text-text-muted hover:text-status-fail-fg"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      {/* Video */}
      <div className="flex flex-col gap-2 pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <Video size={14} className="text-brand-ink" />
          <p className="text-xs font-semibold text-text-secondary flex-1">Module walkthrough video</p>
          {settings?.demoVideoKey && <span className="text-[11px] font-semibold px-2 rounded-badge bg-status-pass-bg text-status-pass-fg">File uploaded</span>}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
            onChange={e => upload(e.target.files?.[0])} />
          <Button size="sm" variant="secondary" icon={Upload} loading={uploading} loadingText="Uploading…"
            onClick={() => fileRef.current?.click()}>
            {settings?.demoVideoKey ? 'Replace video file' : 'Upload video file'}
          </Button>
          <span className="text-xs text-text-muted">or link</span>
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://… (YouTube, Vimeo, Loom)"
            aria-label="Video link"
            className="flex-1 min-w-[220px] h-8 px-2 text-xs glass-field border border-border rounded-ctl text-text-primary" />
          {settings?.demoVideoKey && (
            <button type="button" className="text-xs text-status-fail-fg hover:underline"
              onClick={() => save.mutate({ demoVideoKey: '' })}>Remove file</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted flex-1">Chapters (m:ss)</p>
          <button type="button" onClick={() => setChapters(c => [...c, { label: '', time: '' }])}
            className="text-xs font-semibold text-brand-ink hover:underline inline-flex items-center gap-1"><Plus size={11} /> Add chapter</button>
        </div>
        {chapters.map((c, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input value={c.time} placeholder="0:00" aria-label="Chapter start"
              onChange={e => setChapters(cs => cs.map((x, j) => j === i ? { ...x, time: e.target.value } : x))}
              className="w-16 h-8 px-2 text-xs font-mono glass-field border border-border rounded-ctl text-text-primary" />
            <input value={c.label} placeholder={states[i]?.label || 'e.g. Adding an asset'} aria-label="Chapter title"
              onChange={e => setChapters(cs => cs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
              className="flex-1 h-8 px-2 text-xs glass-field border border-border rounded-ctl text-text-primary" />
            <button type="button" aria-label="Remove chapter" onClick={() => setChapters(cs => cs.filter((_, j) => j !== i))}
              className="h-8 w-7 flex items-center justify-center text-text-muted hover:text-status-fail-fg"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button size="sm" icon={Save} loading={save.isPending} loadingText="Saving…"
          onClick={() => save.mutate({
            // Keep every guide key this form does not edit (the save replaces
            // guide_json as a whole).
            guide: {
              ...(settings?.guide || {}),
              summary: summary.trim() || null,
              connections: connections.filter(c => (c.label || '').trim()).map(c => ({
                entityType: c.entityType || null, label: c.label.trim(), text: (c.text || '').trim() || null,
              })),
              chapters: chapters.filter(c => c.label.trim() && toSeconds(c.time) != null)
                .map(c => ({ label: c.label.trim(), seconds: toSeconds(c.time) }))
                .sort((a, b) => a.seconds - b.seconds),
              actionItems: actionItems.filter(a => (a.label || '').trim()).map(a => ({
                label: a.label.trim(), raisedWhen: (a.raisedWhen || '').trim() || null,
                goesTo: (a.goesTo || '').trim() || null, closesWhen: (a.closesWhen || '').trim() || null,
                ...(a.type ? { type: a.type } : {}),
              })),
            },
            demoVideoUrl: link.trim(),
          })}>
          Save module guide
        </Button>
      </div>
    </section>
  )
}

// ─── The module's workflows ──────────────────────────────────────────────────

function ModuleWorkflows({ entityType, supportsWorkflow }) {
  const { data: workflows = [], isLoading } = useWorkflowCatalogue(entityType)
  const [open, setOpen] = useState(null)
  if (!supportsWorkflow && !workflows.length) return null
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <GitBranch size={15} className="text-brand-ink" />
        <h3 className="text-sm font-semibold text-text-primary">Workflows</h3>
        <span className="text-xs text-text-muted">video, chapter per step, and "what to do" per step</span>
      </div>
      {isLoading && <p className="text-xs text-text-muted">Loading…</p>}
      {!isLoading && workflows.length === 0 && <p className="text-xs text-text-muted">No active workflows for this module.</p>}
      {workflows.map(w => {
        const isOpen = open === w.id
        const guided = (w.steps || []).filter(s => s.guideText).length
        return (
          <div key={w.id} className="rounded-card border border-border bg-surface-raised">
            <button type="button" onClick={() => setOpen(isOpen ? null : w.id)} aria-expanded={isOpen}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <strong className="text-[13px] text-text-primary flex-1 truncate">{w.name}</strong>
              <span className="text-[11px] text-text-muted">{w.stepCount} steps · guidance on {guided}/{w.stepCount}</span>
              {w.hasDemo
                ? <span className="text-[11px] font-semibold px-2 rounded-badge bg-status-pass-bg text-status-pass-fg">Video</span>
                : <span className="text-[11px] font-semibold px-2 rounded-badge bg-status-pending-bg text-status-pending-fg">No video</span>}
            </button>
            {isOpen && (
              <div className="px-3 pb-3">
                <DemoSettings workflow={w} entityType={entityType} />
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

/** The customer view of a module: its guide, then each workflow's steps with
 *  the "what to do" lines — the same components the catalogue page uses. */
function GuidePreview({ entityType, supportsWorkflow }) {
  const { data: workflows = [] } = useWorkflowCatalogue(supportsWorkflow ? entityType : null)
  return (
    <div className="flex flex-col gap-4">
      <ModuleGuideSection entityType={entityType} isOrgSide />
      {workflows.map(w => <StepWizard key={w.id} workflow={w} />)}
    </div>
  )
}
