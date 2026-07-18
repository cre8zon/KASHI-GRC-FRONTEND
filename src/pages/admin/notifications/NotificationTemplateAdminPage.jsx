import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell, Plus, Pencil, Trash2, Search, Eye, RefreshCw,
  CheckCircle2, XCircle, Info, Zap, Link2, Palette,
  ChevronRight, AlertCircle, Hash,
} from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { cn } from '../../../lib/cn'
import toast from 'react-hot-toast'
import { notificationTemplatesApi as notifApi } from '../../../api/notificationTemplates.api'


// ─── Hooks ───────────────────────────────────────────────────────────────────

const useTemplates = (params) => useQuery({
  queryKey: ['notif-templates', params],
  queryFn: () => notifApi.list(params),
  keepPreviousData: true,
})

// ─── Constants ───────────────────────────────────────────────────────────────

const COLOR_TAGS = [
  { value: 'blue',   label: 'Blue',   cls: 'bg-status-info-bg text-status-info-fg border-status-info-bd' },
  { value: 'green',  label: 'Green',  cls: 'bg-status-pass-bg text-status-pass-fg border-status-pass-bd' },
  { value: 'amber',  label: 'Amber',  cls: 'bg-status-warn-bg text-status-warn-fg border-status-warn-bd' },
  { value: 'red',    label: 'Red',    cls: 'bg-status-fail-bg text-status-fail-fg border-status-fail-bd' },
  { value: 'purple', label: 'Purple', cls: 'bg-status-tag-bg text-status-tag-fg border-status-tag-bd' },
  { value: 'gray',   label: 'Gray',   cls: 'bg-surface-overlay text-text-muted border-border' },
]

const COMMON_ICONS = [
  'Bell','CheckCheck','Flag','ListTodo','Shield','Clock','AlertTriangle',
  'GitBranch','FileText','Upload','MessageSquare','Users','Zap','Info',
  'CheckCircle2','XCircle','RefreshCw','ArrowRight','Lock',
]

// Built-in placeholders — frontend TYPE_CONFIG currently hardcodes these.
// After NotificationService is upgraded to use templates, all types become DB-driven.
const WELL_KNOWN_EVENT_KEYS = [
  { key: 'TASK_ASSIGNED',            label: 'Task assigned',           module: 'Workflow' },
  { key: 'TASK_APPROVED',            label: 'Task approved',           module: 'Workflow' },
  { key: 'TASK_REJECTED',            label: 'Task rejected',           module: 'Workflow' },
  { key: 'TASK_DELEGATED',           label: 'Task delegated',          module: 'Workflow' },
  { key: 'TASK_ESCALATED',           label: 'Task escalated',          module: 'Workflow' },
  { key: 'WORKFLOW_STARTED',         label: 'Workflow started',        module: 'Workflow' },
  { key: 'WORKFLOW_COMPLETED',       label: 'Workflow completed',      module: 'Workflow' },
  { key: 'WORKFLOW_CANCELLED',       label: 'Workflow cancelled',      module: 'Workflow' },
  { key: 'ACTION_ITEM_CREATED',      label: 'Action item created',     module: 'Action Items' },
  { key: 'ACTION_ITEM_RESOLVED',     label: 'Action item resolved',    module: 'Action Items' },
  { key: 'ACTION_ITEM_REWORK',       label: 'Action item rework',      module: 'Action Items' },
  { key: 'NEW_COMMENT',              label: 'New comment',             module: 'Comments' },
  { key: 'MENTIONED_IN_COMMENT',     label: 'Mentioned in comment',    module: 'Comments' },
  { key: 'VENDOR_APPROVED',          label: 'Vendor approved',         module: 'TPRM' },
  { key: 'SOD_VIOLATION_DETECTED',   label: 'SoD violation detected',  module: 'RBAC' },
  { key: 'PERMISSION_OVERRIDE_ADDED',label: 'Permission override added',module: 'RBAC' },
]

// Common available placeholders per context
const AVAILABLE_PLACEHOLDERS = [
  '{{userName}}', '{{userEmail}}', '{{stepName}}', '{{workflowName}}',
  '{{entityType}}', '{{entityId}}', '{{taskId}}', '{{stepInstanceId}}',
  '{{workflowInstanceId}}', '{{vendorName}}', '{{riskName}}',
  '{{actionItemTitle}}', '{{commenterName}}', '{{tenantName}}',
]

const EMPTY_TEMPLATE = {
  eventKey: '', titleTemplate: '', bodyTemplate: '',
  icon: 'Bell', colorTag: 'blue', actionUrl: '', isActive: true,
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NotificationTemplateAdminPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [previewVars, setPreviewVars] = useState({})

  const { data, isLoading } = useTemplates({ search, isActive: undefined })
  const templates = data?.data?.items || data?.items || (Array.isArray(data?.data) ? data.data : null) || (Array.isArray(data) ? data : null) || []

  // Group by module derived from event key prefix or well-known list
  const grouped = useMemo(() => {
    const g = {}
    for (const t of templates) {
      const known = WELL_KNOWN_EVENT_KEYS.find(k => k.key === t.eventKey)
      const module = known?.module || guessModule(t.eventKey)
      if (!g[module]) g[module] = []
      g[module].push(t)
    }
    return g
  }, [templates])

  const modules = [...new Set([
    ...Object.keys(grouped),
    ...WELL_KNOWN_EVENT_KEYS.map(k => k.module),
  ])].sort()

  const createMut = useMutation({
    mutationFn: notifApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notif-templates'] }); toast.success('Template created'); setModalOpen(false) },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => notifApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notif-templates'] }); toast.success('Updated'); setModalOpen(false); setEditing(null) },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => notifApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-templates'] })
      toast.success('Deleted')
      setDeleteTarget(null)
      if (selected?.id === deleteTarget?.id) setSelected(null)
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  const filteredTemplates = moduleFilter
    ? templates.filter(t => {
        const known = WELL_KNOWN_EVENT_KEYS.find(k => k.key === t.eventKey)
        return (known?.module || guessModule(t.eventKey)) === moduleFilter
      })
    : templates

  return (
    <PageLayout
      title="Notification templates"
      subtitle="Manage in-app notification content, icons, and deep-link routing"
      actions={
        <Button icon={Plus} size="sm" onClick={() => { setEditing(null); setModalOpen(true) }}>
          New template
        </Button>
      }
    >
      {/* Info banner explaining the upgrade path */}
      <div className="mx-6 mt-4 flex items-start gap-2 px-3 py-2.5 rounded-card bg-status-info-bg border border-status-info-bd">
        <Info size={13} className="text-status-info-fg mt-0.5 shrink-0" />
        <div className="text-xs text-status-info-fg">
          <span className="font-medium">How this works:</span>{' '}
          Templates are matched by <code className="font-mono bg-status-info-bg px-1 rounded">eventKey</code> when{' '}
          <code className="font-mono bg-status-info-bg px-1 rounded">NotificationService.send()</code> is called.
          Placeholders like <code className="font-mono bg-status-info-bg px-1 rounded">{'{{stepName}}'}</code> are
          replaced at send time. <code className="font-mono bg-status-info-bg px-1 rounded">actionUrl</code> supports
          the same placeholders for deep-link routing.
        </div>
      </div>

      <div className="flex h-full overflow-hidden mt-4">
        {/* Left: template list */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="p-3 space-y-2 border-b border-border">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search templates…"
                className="w-full pl-8 pr-3 h-7 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}
              className="w-full h-7 px-2 text-xs bg-surface-overlay border border-border rounded-ctl text-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">All modules</option>
              {modules.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading
              ? <div className="p-4 text-xs text-text-muted">Loading…</div>
              : filteredTemplates.length === 0
                ? (
                  <div className="p-6 flex flex-col items-center gap-3 text-center">
                    <Bell size={24} className="text-text-muted" />
                    <div>
                      <p className="text-xs font-medium text-text-secondary">No templates</p>
                      <p className="text-[11px] text-text-muted mt-0.5">Create your first notification template</p>
                    </div>
                  </div>
                )
                : filteredTemplates.map(t => {
                  const colorCls = COLOR_TAGS.find(c => c.value === t.colorTag)?.cls || COLOR_TAGS[0].cls
                  return (
                    <button key={t.id}
                      onClick={() => setSelected(t)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-border/50',
                        selected?.id === t.id
                          ? 'bg-brand-500/8 border-l-2 border-l-brand-500'
                          : 'hover:bg-surface-overlay border-l-2 border-l-transparent'
                      )}
                    >
                      <div className={cn('w-7 h-7 rounded-card flex items-center justify-center text-xs shrink-0 border', colorCls)}>
                        <Bell size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-text-primary truncate">{t.titleTemplate}</div>
                        <div className="text-[10px] font-mono text-text-muted truncate mt-0.5">{t.eventKey}</div>
                      </div>
                      <div className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-1.5', t.isActive ? 'bg-status-pass-bg' : 'bg-surface-overlay border border-border')} />
                    </button>
                  )
                })
            }
          </div>
          {/* Well-known event keys not yet configured */}
          <div className="border-t border-border p-3">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
              Unconfigured events ({WELL_KNOWN_EVENT_KEYS.filter(k => !templates.find(t => t.eventKey === k.key)).length})
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {WELL_KNOWN_EVENT_KEYS
                .filter(k => !templates.find(t => t.eventKey === k.key))
                .map(k => (
                  <button key={k.key}
                    onClick={() => { setEditing({ ...EMPTY_TEMPLATE, eventKey: k.key }); setModalOpen(true) }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded hover:bg-surface-overlay transition-colors group">
                    <AlertCircle size={11} className="text-status-warn-fg shrink-0" />
                    <span className="text-[10px] font-mono text-text-muted truncate flex-1">{k.key}</span>
                    <Plus size={10} className="text-text-muted opacity-0 group-hover:opacity-100 shrink-0" />
                  </button>
                ))
              }
            </div>
          </div>
        </div>

        {/* Right: detail / preview */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!selected
            ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
                <Bell size={28} className="text-text-muted" />
                <div>
                  <p className="text-sm font-medium text-text-secondary">Select a template</p>
                  <p className="text-xs text-text-muted mt-1 max-w-xs">
                    Click a template to preview it, or click an unconfigured event below to create one.
                  </p>
                </div>
              </div>
            )
            : <TemplateDetail
                template={selected}
                onEdit={() => { setEditing(selected); setModalOpen(true) }}
                onDelete={() => setDeleteTarget(selected)}
              />
          }
        </div>
      </div>

      {/* Create / Edit modal */}
      <TemplateFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        initial={editing}
        onSave={(d) => editing?.id ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)}
        loading={createMut.isPending || updateMut.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        loading={deleteMut.isPending}
        title="Delete template"
        message={`Delete template for "${deleteTarget?.eventKey}"? Notifications for this event will fall back to raw message strings until a new template is created.`}
      />
    </PageLayout>
  )
}

// ─── Template Detail ──────────────────────────────────────────────────────────

function TemplateDetail({ template, onEdit, onDelete }) {
  const [previewData, setPreviewData] = useState({
    userName: 'Alice Chen', stepName: 'Risk Approval',
    workflowName: 'Risk Management', entityType: 'RISK',
    entityId: '42', taskId: '99',
  })

  const colorCls = COLOR_TAGS.find(c => c.value === template.colorTag)?.cls || COLOR_TAGS[0].cls

  const renderPreview = (template) => {
    let title = template.titleTemplate || ''
    let body = template.bodyTemplate || ''
    let url = template.actionUrl || ''
    for (const [k, v] of Object.entries(previewData)) {
      const placeholder = `{{${k}}}`
      title = title.replaceAll(placeholder, v)
      body = body.replaceAll(placeholder, v)
      url = url.replaceAll(placeholder, v)
    }
    return { title, body, url }
  }

  const preview = renderPreview(template)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-card flex items-center justify-center border', colorCls)}>
            <Bell size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-text-primary">{template.titleTemplate}</h2>
              <Badge variant={template.isActive ? 'green' : 'gray'} size="xs">
                {template.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-xs font-mono text-text-muted">{template.eventKey}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>Edit</Button>
          <Button variant="danger" size="sm" icon={Trash2} onClick={onDelete} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-2xl">
        {/* Live preview */}
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Live preview</h3>
          <div className="border border-border rounded-card p-4 bg-surface-overlay space-y-3">
            {/* Notification card mockup */}
            <div className={cn('flex items-start gap-3 p-3 rounded-card border', colorCls)}>
              <Bell size={15} className="mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold">{preview.title || <span className="italic opacity-50">No title</span>}</div>
                {preview.body && <div className="text-[11px] mt-0.5 opacity-75">{preview.body}</div>}
                {preview.url && (
                  <div className="flex items-center gap-1 mt-1.5 text-[10px] opacity-60">
                    <Link2 size={10} /> {preview.url}
                  </div>
                )}
              </div>
            </div>
            {/* Preview variables editor */}
            <div>
              <p className="text-[10px] font-medium text-text-muted mb-2">Preview variables (edit to test placeholders)</p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(previewData).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-text-muted w-28 shrink-0">{`{{${k}}}`}</span>
                    <input value={v} onChange={e => setPreviewData(p => ({ ...p, [k]: e.target.value }))}
                      className="flex-1 h-5 px-1.5 text-[10px] bg-surface-raised border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500/50" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Raw template values */}
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Template definition</h3>
          <div className="space-y-2">
            {[
              { label: 'Event key', value: template.eventKey, mono: true },
              { label: 'Title template', value: template.titleTemplate },
              { label: 'Body template', value: template.bodyTemplate },
              { label: 'Action URL', value: template.actionUrl, mono: true },
              { label: 'Icon', value: template.icon },
              { label: 'Color', value: template.colorTag },
            ].map(r => (
              <div key={r.label} className="flex items-start gap-3 text-xs">
                <span className="text-text-muted w-28 shrink-0 pt-0.5">{r.label}</span>
                <span className={cn('text-text-primary flex-1', r.mono && 'font-mono text-brand-ink')}>
                  {r.value || <span className="text-text-muted italic">not set</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Placeholders reference */}
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Available placeholders</h3>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_PLACEHOLDERS.map(p => (
              <code key={p} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-ink border border-brand-500/20">
                {p}
              </code>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Template Form Modal ──────────────────────────────────────────────────────

function TemplateFormModal({ open, onClose, initial, onSave, loading }) {
  const [form, setForm] = useState(initial || EMPTY_TEMPLATE)
  useEffect(() => { setForm(initial || EMPTY_TEMPLATE) }, [initial, open])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Live preview
  const previewTitle = form.titleTemplate
    ?.replace('{{userName}}', 'Alice Chen')
    .replace('{{stepName}}', 'Risk Approval')
    .replace('{{workflowName}}', 'Risk Management')
    .replace('{{entityType}}', 'RISK') || ''
  const previewBody = form.bodyTemplate
    ?.replace('{{userName}}', 'Alice Chen')
    .replace('{{stepName}}', 'Risk Approval')
    .replace('{{workflowName}}', 'Risk Management')
    .replace('{{entityType}}', 'RISK') || ''

  const colorCls = COLOR_TAGS.find(c => c.value === form.colorTag)?.cls || COLOR_TAGS[0].cls

  return (
    <Modal open={open} onClose={onClose} size="xl"
      title={initial?.id ? 'Edit notification template' : 'New notification template'}
      subtitle="Define what users see when this event fires"
      footer={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Status</span>
            <button onClick={() => set('isActive', !form.isActive)}
              className={cn('w-8 h-4 rounded-full transition-colors relative',
                form.isActive ? 'bg-status-pass-bg' : 'bg-surface-overlay border border-border')}>
              <span className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-surface-raised transition-transform',
                form.isActive ? 'translate-x-4.5' : 'translate-x-0.5')} />
            </button>
            <span className={cn('text-xs', form.isActive ? 'text-status-pass-fg' : 'text-text-muted')}>
              {form.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={loading} icon={Bell} onClick={() => onSave(form)}>Save template</Button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-6">
        {/* Left: form */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Event key <span className="text-status-fail-fg">*</span></label>
            <div className="relative">
              <input value={form.eventKey} onChange={e => set('eventKey', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                placeholder="TASK_ASSIGNED"
                list="event-key-suggestions"
                className="w-full h-8 px-3 text-xs font-mono bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
              <datalist id="event-key-suggestions">
                {WELL_KNOWN_EVENT_KEYS.map(k => <option key={k.key} value={k.key} />)}
              </datalist>
            </div>
            <p className="text-[10px] text-text-muted mt-0.5">Must match what NotificationService.send() uses</p>
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Title template <span className="text-status-fail-fg">*</span></label>
            <input value={form.titleTemplate} onChange={e => set('titleTemplate', e.target.value)}
              placeholder="Task assigned: {{stepName}}"
              className="w-full h-8 px-3 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Body template</label>
            <textarea value={form.bodyTemplate} onChange={e => set('bodyTemplate', e.target.value)}
              rows={3} placeholder="{{workflowName}} requires your attention."
              className="w-full px-3 py-2 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
          </div>

          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Action URL (deep link)</label>
            <input value={form.actionUrl} onChange={e => set('actionUrl', e.target.value)}
              placeholder="/workflow/tasks/{{taskId}}"
              className="w-full h-8 px-3 text-xs font-mono bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
            <p className="text-[10px] text-text-muted mt-0.5">Supports placeholders. Clicking notification navigates here.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Icon (Lucide)</label>
              <select value={form.icon} onChange={e => set('icon', e.target.value)}
                className="w-full h-8 px-2 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                {COMMON_ICONS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Color</label>
              <div className="flex gap-1.5 flex-wrap pt-1">
                {COLOR_TAGS.map(c => (
                  <button key={c.value} onClick={() => set('colorTag', c.value)}
                    className={cn('px-2 py-1 rounded text-[10px] border transition-all',
                      c.cls,
                      form.colorTag === c.value ? 'ring-2 ring-offset-1 ring-brand-500/50 scale-105' : 'opacity-60 hover:opacity-100')}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Placeholder chips */}
          <div>
            <p className="text-xs font-medium text-text-muted mb-1.5">Insert placeholder</p>
            <div className="flex flex-wrap gap-1">
              {AVAILABLE_PLACEHOLDERS.map(p => (
                <button key={p}
                  onClick={() => set('titleTemplate', (form.titleTemplate || '') + p)}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-overlay border border-border text-text-muted hover:text-brand-ink hover:border-brand-500/40 transition-colors">
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: live preview */}
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Live preview</p>
          <div className="sticky top-0 space-y-3">
            {/* In-app notification bell item */}
            <div>
              <p className="text-[10px] text-text-muted mb-1.5">Notification bell item</p>
              <div className={cn('flex items-start gap-3 p-3 rounded-card border', colorCls)}>
                <Bell size={15} className="mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold leading-tight">
                    {previewTitle || <span className="italic opacity-40">Title preview</span>}
                  </div>
                  {previewBody && <div className="text-[11px] mt-1 opacity-70 leading-relaxed">{previewBody}</div>}
                  {form.actionUrl && (
                    <div className="flex items-center gap-1 mt-2 text-[10px] opacity-50">
                      <Link2 size={9} /> {form.actionUrl.replace('{{taskId}}', '99').replace('{{entityId}}', '42')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Notification page row */}
            <div>
              <p className="text-[10px] text-text-muted mb-1.5">Notifications page row</p>
              <div className="flex items-start gap-3 p-3 rounded-card border border-border bg-surface-overlay">
                <div className={cn('w-7 h-7 rounded-card flex items-center justify-center border shrink-0', colorCls)}>
                  <Bell size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary">
                    {previewTitle || <span className="italic text-text-muted">Title preview</span>}
                  </div>
                  {previewBody && <div className="text-[10px] text-text-muted mt-0.5 truncate">{previewBody}</div>}
                </div>
                <span className="text-[10px] text-text-muted shrink-0">Just now</span>
              </div>
            </div>

            {/* Raw values */}
            <div className="p-3 rounded-card bg-surface-overlay border border-border">
              <p className="text-[10px] font-mono text-text-muted mb-2">Template variables</p>
              <div className="space-y-1 text-[10px] font-mono">
                <div><span className="text-text-muted">eventKey: </span><span className="text-brand-ink">{form.eventKey || '…'}</span></div>
                <div><span className="text-text-muted">icon: </span><span className="text-text-secondary">{form.icon}</span></div>
                <div><span className="text-text-muted">colorTag: </span><span className="text-text-secondary">{form.colorTag}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function guessModule(eventKey) {
  if (!eventKey) return 'Other'
  if (eventKey.startsWith('TASK_') || eventKey.startsWith('WORKFLOW_')) return 'Workflow'
  if (eventKey.startsWith('ACTION_ITEM')) return 'Action Items'
  if (eventKey.startsWith('VENDOR_')) return 'TPRM'
  if (eventKey.startsWith('RISK_')) return 'Risk'
  if (eventKey.startsWith('AUDIT_')) return 'Audit'
  if (eventKey.includes('COMMENT')) return 'Comments'
  if (eventKey.includes('SOD') || eventKey.includes('PERMISSION')) return 'RBAC'
  return 'Other'
}