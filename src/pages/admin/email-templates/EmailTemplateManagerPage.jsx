import { useState, useEffect } from 'react'
import { Mail, Plus, Eye, Edit3, Trash2, ToggleLeft, ToggleRight, Code, Send, Search, RefreshCw, ChevronRight } from 'lucide-react'
import { useEmailTemplates, useCreateEmailTemplate, useUpdateEmailTemplate, useDeleteEmailTemplate, usePreviewTemplate } from '../../../hooks/useEmailTemplates'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Card, CardHeader, CardBody } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Skeleton } from '../../../components/ui/EmptyState'
import { Badge } from '../../../components/ui/Badge'
import { cn } from '../../../lib/cn'
import { emailTemplatesApi } from '../../../api/emailTemplates.api'
import toast from 'react-hot-toast'
import { useMutation } from '@tanstack/react-query'

// ── Variable chip ──────────────────────────────────────────────────────────
function VariableChip({ variable, onClick }) {
  return (
    <button
      onClick={() => onClick(variable)}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-mono hover:bg-blue-500/20 transition-colors"
    >
      {`{{${variable}}}`}
    </button>
  )
}

// ── Live HTML preview ──────────────────────────────────────────────────────
function LivePreview({ subject, content, mimeType }) {
  if (!content) return (
    <div className="h-full flex items-center justify-center text-text-muted text-xs">
      Preview will appear here
    </div>
  )
  if (mimeType === 'text/html') {
    return (
      <iframe
        className="w-full h-full rounded border-0"
        srcDoc={`<style>body{font-family:system-ui,sans-serif;font-size:13px;padding:16px;margin:0;color:#1e293b}</style>${content}`}
        title="Email Preview"
        sandbox="allow-same-origin allow-scripts"
      />
    )
  }
  return <pre className="text-xs text-text-secondary whitespace-pre-wrap p-3 overflow-auto h-full">{content}</pre>
}

// ── Template editor modal ──────────────────────────────────────────────────
function TemplateEditor({ template, onClose, onSaved }) {
  const isEdit = !!template?.id
  const [form, setForm] = useState({
    name:        template?.name        || '',
    description: template?.description || '',
    subject:     template?.subject     || '',
    content:     template?.content     || '',
    mimeType:    template?.mimeType    || 'text/html',
  })
  const [activeTab, setActiveTab]       = useState('edit')   // 'edit' | 'preview'
  const [previewVars, setPreviewVars]   = useState({})
  const [variables, setVariables]       = useState(template?.variables || [])
  const [previewData, setPreviewData]   = useState(null)
  const { mutate: create, isPending: creating } = useCreateEmailTemplate()
  const { mutate: update, isPending: updating } = useUpdateEmailTemplate()
  const { mutate: preview, isPending: previewing } = usePreviewTemplate()

  // Extract variables live as user types
  useEffect(() => {
    const matches = [...(form.subject + form.content).matchAll(/\{\{(\w+)\}\}/g)]
    const unique  = [...new Set(matches.map(m => m[1]))]
    setVariables(unique)
  }, [form.subject, form.content])

  const insertVariable = (variable) => {
    const cursor = '{{' + variable + '}}'
    setForm(f => ({ ...f, content: f.content + cursor }))
  }

  const handlePreview = () => {
    if (!template?.id && !form.content) return
    // For new templates, use current form content merged client-side
    const rendered = Object.entries(previewVars).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v),
      form.content
    )
    const subject = Object.entries(previewVars).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v),
      form.subject
    )
    setPreviewData({ renderedBody: rendered, renderedSubject: subject, mimeType: form.mimeType })
  }

  const handleSave = () => {
    if (isEdit) {
      update({ id: template.id, data: form }, { onSuccess: () => { onSaved?.(); onClose() } })
    } else {
      create(form, { onSuccess: () => { onSaved?.(); onClose() } })
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex gap-1 bg-surface-overlay rounded-lg p-0.5 w-fit mb-4">
        {['edit', 'preview'].map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); if (tab === 'preview') handlePreview() }}
            className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize',
              activeTab === tab ? 'bg-surface-raised text-text-primary' : 'text-text-muted hover:text-text-secondary')}
          >
            {tab === 'preview' ? <><Eye size={11} className="inline mr-1" />Preview</> : <><Edit3 size={11} className="inline mr-1" />Edit</>}
          </button>
        ))}
      </div>

      {activeTab === 'edit' && (
        <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
          {/* Left: form */}
          <div className="overflow-y-auto space-y-3">
            {!isEdit && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">Template Key</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. user-invitation"
                  className="h-8 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
                <p className="text-[10px] text-text-muted">Used in code: <code className="font-mono">mailService.send("user-invitation", email)</code></p>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="When is this email sent?"
                className="h-8 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">Subject Line</label>
              <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Welcome to KashiGRC — {{firstName}}"
                className="h-8 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">Email Body</label>
              <select value={form.mimeType} onChange={e => setForm(f => ({ ...f, mimeType: e.target.value }))}
                className="h-6 rounded border border-border bg-surface-raised px-2 text-xs text-text-secondary focus:outline-none">
                <option value="text/html">HTML</option>
                <option value="text/plain">Plain text</option>
              </select>
            </div>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={10}
              placeholder={`Hello {{firstName}},\n\nWelcome to KashiGRC...`}
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
          </div>

          {/* Right: variables + live preview */}
          <div className="flex flex-col gap-3 overflow-hidden">
            {variables.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Detected Variables</p>
                <div className="flex flex-wrap gap-1.5">
                  {variables.map(v => <VariableChip key={v} variable={v} onClick={insertVariable} />)}
                </div>
                <p className="text-[10px] text-text-muted mt-2">Click a variable to insert at cursor position</p>
              </div>
            )}
            <div className="flex-1 flex flex-col gap-2 min-h-0">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Live Preview</p>
              {variables.length > 0 && (
                <div className="space-y-1.5">
                  {variables.map(v => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-brand-400 w-28 truncate">{`{{${v}}}`}</span>
                      <input
                        value={previewVars[v] || ''}
                        onChange={e => {
                          setPreviewVars(pv => ({ ...pv, [v]: e.target.value }))
                        }}
                        placeholder={`Sample ${v}`}
                        className="flex-1 h-6 rounded border border-border bg-surface-raised px-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex-1 bg-white rounded-lg border border-border/50 overflow-hidden min-h-[120px]">
                <LivePreview
                  subject={Object.entries(previewVars).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v || `{{${k}}}`), form.subject)}
                  content={Object.entries(previewVars).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v || `<span style="background:#fef3c7;padding:0 2px">{{${k}}}</span>`), form.content)}
                  mimeType={form.mimeType}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'preview' && previewData && (
        <div className="flex-1 overflow-hidden flex flex-col gap-3">
          <div className="bg-surface-overlay rounded-md px-3 py-2 text-sm">
            <span className="text-text-muted text-xs">Subject: </span>
            <span className="text-text-primary">{previewData.renderedSubject}</span>
          </div>
          <div className="flex-1 bg-white rounded-lg border border-border/50 overflow-hidden">
            <LivePreview content={previewData.renderedBody} mimeType={previewData.mimeType} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={creating || updating} onClick={handleSave}>
          {isEdit ? 'Save Changes' : 'Create Template'}
        </Button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function EmailTemplateManagerPage() {
  const [search, setSearch]               = useState('')
  const [showCreate, setShowCreate]       = useState(false)
  const [editTemplate, setEditTemplate]   = useState(null)
  const [deleteId, setDeleteId]           = useState(null)
  const { data, isLoading, refetch }      = useEmailTemplates({ search: search || undefined })
  const { mutate: deleteTemplate, isPending: deleting } = useDeleteEmailTemplate()
  const { mutate: toggle }                = useMutation({
    mutationFn: emailTemplatesApi.toggle,
    onSuccess: () => { refetch(); toast.success('Status updated') },
  })

  const templates = data?.items || []

  return (
    <PageLayout
      title="Email Templates"
      subtitle="DB-stored templates — edit subject, body, and variables without code changes"
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
              className="h-8 pl-8 pr-3 w-48 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>New Template</Button>
        </div>
      }
    >
      <div className="p-6 space-y-3">
        {isLoading && [1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}

        {!isLoading && templates.length === 0 && (
          <div className="text-center py-16 text-text-muted text-sm">
            No templates yet. Create your first email template.
          </div>
        )}

        {templates.map(template => (
          <Card key={template.id} className="animate-fade-in">
            <CardBody className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                <Mail size={16} className="text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-text-primary font-mono">{template.name}</span>
                  <Badge
                    value={template.isActive ? 'ACTIVE' : 'INACTIVE'}
                    colorTag={template.isActive ? 'green' : 'gray'}
                    label={template.isActive ? 'Active' : 'Inactive'}
                  />
                  {template.variables?.length > 0 && (
                    <span className="text-[10px] text-text-muted font-mono bg-surface-overlay px-1.5 py-0.5 rounded">
                      {template.variables.length} variable{template.variables.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-secondary mb-1">{template.description}</p>
                <p className="text-xs text-text-muted truncate font-mono">Subject: {template.subject}</p>
                {template.variables?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {template.variables.map(v => (
                      <span key={v} className="text-[10px] font-mono text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded">
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="ghost" size="xs" icon={template.isActive ? ToggleRight : ToggleLeft}
                  onClick={() => toggle(template.id)}
                  className={template.isActive ? 'text-green-400' : 'text-text-muted'}
                />
                <Button variant="ghost" size="xs" icon={Edit3} onClick={() => setEditTemplate(template)} />
                <Button variant="ghost" size="xs" icon={Trash2} onClick={() => setDeleteId(template.id)}
                  className="text-red-400 hover:text-red-300" />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={showCreate || !!editTemplate}
        onClose={() => { setShowCreate(false); setEditTemplate(null) }}
        title={editTemplate ? `Edit: ${editTemplate.name}` : 'Create Email Template'}
        subtitle={editTemplate ? 'Modify template subject, body, and variables' : 'Create a new DB-stored email template'}
        size="xl"
      >
        <TemplateEditor
          template={editTemplate}
          onClose={() => { setShowCreate(false); setEditTemplate(null) }}
          onSaved={refetch}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteTemplate(deleteId, { onSuccess: () => setDeleteId(null) })}
        title="Delete Template"
        message="This will permanently delete the email template. Any system features using this template name will fall back to no-op silently."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </PageLayout>
  )
}
