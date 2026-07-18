/**
 * AuditProjectTemplatesPanel — /audit/projects/:projectId
 *
 * Manages the PLANNING layer: which audit templates are planned for this project.
 * Drop this panel into AuditEngagementListPage (or wherever the project detail lives).
 *
 * TWO LAYERS displayed side by side:
 *
 *   PLANNED TEMPLATES (library references)
 *     — Add PUBLISHED templates to the plan
 *     — Preview full structure (sections + controls) before starting
 *     — Remove if not yet started
 *
 *   START → ENGAGEMENTS (isolated instances)
 *     — "Start engagement" fires POST .../start → snapshotTemplate() backend
 *     — After start: AuditEngagementTemplateInstance + AuditSectionInstance + AuditControlInstance
 *     — 100% isolation: future library changes don't affect running engagements
 *
 * API calls:
 *   GET  /v1/audit/projects/:id/templates           → planned list
 *   POST /v1/audit/projects/:id/templates/:tplId    → add to plan
 *   DEL  /v1/audit/projects/:id/templates/:tplId    → remove from plan
 *   POST /v1/audit/projects/:id/templates/:tplId/start → create engagement (instance)
 *   GET  /v1/audit/library/templates?status=PUBLISHED  → template picker
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, Play, Eye, ChevronDown, ChevronRight,
  Shield, Layers, LayoutTemplate, Globe, Lock, RefreshCw,
  CheckCircle2, Clock, AlertCircle,
} from 'lucide-react'
import { auditApi }    from '../../api/audit.api'
import { Button }      from '../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { Badge }       from '../../components/ui/Badge'
import { cn }          from '../../lib/cn'
import toast           from 'react-hot-toast'

// ─── hooks ───────────────────────────────────────────────────────────────────

const useProjectTemplates = (projectId) => useQuery({
  queryKey: ['audit-project-templates', projectId],
  queryFn:  () => auditApi.projects.templates.list(projectId),
  enabled:  !!projectId,
})

const usePublishedTemplates = () => useQuery({
  queryKey: ['audit-library-templates-published'],
  queryFn:  () => auditApi.library.templates.list({ status: 'PUBLISHED', take: 100 }),
})

const useTemplateTree = (templateId) => useQuery({
  queryKey: ['audit-library-template-full', templateId],
  queryFn:  () => auditApi.library.templates.full(templateId),
  enabled:  !!templateId,
})

function useProjectTemplateMutations(projectId) {
  const qc  = useQueryClient()
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['audit-project-templates', projectId] })
    qc.invalidateQueries({ queryKey: ['audit-engagements'] })
  }
  return {
    add:    useMutation({ mutationFn: ({ templateId, note }) =>
                auditApi.projects.templates.add(projectId, templateId, { note }),
              onSuccess: () => { inv(); toast.success('Template added to plan') },
              onError: e => toast.error(e?.response?.data?.error?.message || 'Failed') }),
    remove: useMutation({ mutationFn: (templateId) =>
                auditApi.projects.templates.remove(projectId, templateId),
              onSuccess: () => { inv(); toast.success('Removed from plan') },
              onError: e => toast.error(e?.response?.data?.error?.message || 'Failed') }),
    start:  useMutation({ mutationFn: ({ templateId, req }) =>
                auditApi.projects.templates.start(projectId, templateId, req),
              onSuccess: () => { inv(); toast.success('Engagement started — instances created') },
              onError: e => toast.error(e?.response?.data?.error?.message || 'Failed') }),
  }
}

// ─── Template tree preview (read-only, mirrors AuditLibraryPage TemplatePreviewModal) ──

function TreeNode({ node, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children?.length > 0
  const hasControls = node.controls?.length > 0

  return (
    <div>
      <div
        className="flex items-start gap-1.5 py-1 hover:bg-surface-overlay rounded px-2 cursor-pointer"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => setOpen(o => !o)}
      >
        <span className="shrink-0 text-text-muted mt-0.5">
          {(hasChildren || hasControls)
            ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
            : <span className="w-3 block" />}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {node.section.sectionCode && (
              <span className="font-mono text-[10px] text-text-muted">{node.section.sectionCode}</span>
            )}
            <span className={cn('text-sm', depth === 0 && 'font-medium')}>{node.section.name}</span>
            {node.controls.length > 0 && (
              <span className="text-[10px] text-text-muted font-mono">
                ({node.controls.length} control{node.controls.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>
        </div>
      </div>
      {open && (
        <>
          {hasControls && node.controls.map(ctrl => (
            <div key={ctrl.controlId}
              className="flex items-start gap-2 py-0.5"
              style={{ paddingLeft: `${22 + depth * 14}px` }}
            >
              <Shield size={11} className="text-text-muted mt-0.5 shrink-0" />
              <div className="flex items-center gap-1.5 flex-wrap">
                {ctrl.controlCode && (
                  <span className="font-mono text-[10px] text-text-muted">{ctrl.controlCode}</span>
                )}
                <span className="text-xs text-text-secondary">{ctrl.name}</span>
                {ctrl.controlTag && (
                  <span className="font-mono text-[10px] bg-brand-500/10 text-brand-400 px-1.5 py-0.5 rounded">
                    {ctrl.controlTag}
                  </span>
                )}
              </div>
            </div>
          ))}
          {hasChildren && node.children.map(child => (
            <TreeNode key={child.section.id} node={child} depth={depth + 1} />
          ))}
        </>
      )}
    </div>
  )
}

function TemplatePreviewModal({ templateId, onClose }) {
  const { data, isLoading } = useTemplateTree(templateId)
  const template = data?.template

  return (
    <Modal open={!!templateId} onClose={onClose} title="Template structure" wide>
      {isLoading ? (
        <div className="flex flex-col gap-2 py-4">
          {[1,2,3].map(i => <div key={i} className="h-8 rounded bg-surface-overlay animate-pulse" />)}
        </div>
      ) : (
        <>
          {template && (
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">{template.name}</p>
                <p className="text-xs text-text-muted">
                  {template.frameworkRef} · {template.auditType} · v{template.version}
                </p>
              </div>
              <Badge colorTag="teal" size="sm" className="ml-auto">{template.status}</Badge>
            </div>
          )}
          {!data?.rootSections?.length ? (
            <p className="text-sm text-text-muted py-4">No sections in this template yet.</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
              {data.rootSections.map(node => (
                <TreeNode key={node.section.id} node={node} />
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

// ─── Start engagement modal ───────────────────────────────────────────────────

function StartEngagementModal({ projectId, plannedTemplate, onClose }) {
  const [name, setName]   = useState(plannedTemplate?.templateName
    ? `${plannedTemplate.templateName} — ${new Date().getFullYear()}` : '')
  const [leadAuditorId, setLeadAuditorId] = useState('')
  const M = useProjectTemplateMutations(projectId)

  if (!plannedTemplate) return null

  const handleStart = () => {
    if (!name.trim()) { toast.error('Engagement name is required'); return }
    M.start.mutate({
      templateId: plannedTemplate.templateId,
      req: {
        projectId,
        templateId: plannedTemplate.templateId,
        name: name.trim(),
        leadAuditorId: leadAuditorId ? Number(leadAuditorId) : undefined,
      },
    }, { onSuccess: onClose })
  }

  return (
    <Modal open={!!plannedTemplate} onClose={onClose} title="Start engagement">
      <div className="flex flex-col gap-4">
        {/* Isolation notice */}
        <div className="rounded-card border border-border bg-surface-overlay p-3 text-xs text-text-secondary">
          <p className="font-medium text-text-primary mb-1">100% isolated snapshot</p>
          <p>Starting creates a frozen copy of <strong>{plannedTemplate.templateName}</strong> —
          all sections and controls are snapshotted at this moment.
          Future edits to the template library will not affect this engagement.</p>
        </div>

        <div>
          <label className="block text-xs text-text-secondary mb-1">Engagement name *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>

        <div>
          <label className="block text-xs text-text-secondary mb-1">Lead auditor ID (optional)</label>
          <input value={leadAuditorId} onChange={e => setLeadAuditorId(e.target.value)}
            placeholder="User ID"
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>

        <Button variant="primary" icon={Play} loading={M.start.isPending}
          disabled={!name.trim()} onClick={handleStart}>
          Start engagement
        </Button>
      </div>
    </Modal>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AuditProjectTemplatesPanel({ projectId }) {
  const qc = useQueryClient()

  const { data: plannedData, isLoading: plannedLoading } = useProjectTemplates(projectId)
  const { data: libraryData } = usePublishedTemplates()

  const planned  = Array.isArray(plannedData) ? plannedData
               : plannedData?.items ?? plannedData?.data ?? []
  const library  = libraryData?.items ?? libraryData  ?? []

  const M = useProjectTemplateMutations(projectId)

  const [showPicker,  setShowPicker]  = useState(false)
  const [previewId,   setPreviewId]   = useState(null)
  const [startTarget, setStartTarget] = useState(null) // planned template to start
  const [removeTarget,setRemoveTarget]= useState(null)
  const [addNote,     setAddNote]     = useState('')

  // Already-planned templateIds — used to grey out in picker
  const plannedIds = new Set(planned.map(p => p.templateId))

  const handleAdd = (templateId) => {
    M.add.mutate({ templateId, note: addNote || undefined }, {
      onSuccess: () => { setShowPicker(false); setAddNote('') },
    })
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Planned templates</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Library references — no instances created until you start each one
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={RefreshCw}
            onClick={() => qc.invalidateQueries({ queryKey: ['audit-project-templates', projectId] })} />
          <Button size="sm" icon={Plus} onClick={() => setShowPicker(true)}>
            Add template
          </Button>
        </div>
      </div>

      {/* Planned templates list */}
      {plannedLoading ? (
        <div className="flex flex-col gap-2">
          {[1,2].map(i => <div key={i} className="h-16 rounded-card bg-surface-overlay animate-pulse" />)}
        </div>
      ) : !planned.length ? (
        <div className="rounded-card border border-border border-dashed p-8 text-center">
          <LayoutTemplate size={24} className="mx-auto text-text-muted mb-2" />
          <p className="text-sm text-text-muted">No templates planned yet.</p>
          <p className="text-xs text-text-muted mt-1">Add published templates to define the scope of this audit project.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {planned.map(pt => (
            <div key={pt.id}
              className="rounded-card border border-border p-4 flex items-start gap-3"
            >
              {/* Status icon */}
              <div className="mt-0.5 shrink-0">
                {pt.started
                  ? <CheckCircle2 size={16} className="text-status-pass-fg" />
                  : <Clock size={16} className="text-text-muted" />}
              </div>

              {/* Template info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{pt.templateName}</span>
                  {pt.templateFramework && (
                    <span className="text-[10px] font-mono text-text-muted">{pt.templateFramework}</span>
                  )}
                  <Badge colorTag={pt.templateAuditType === 'INTERNAL' ? 'blue' : 'purple'} size="sm">
                    {pt.templateAuditType}
                  </Badge>
                  {pt.started && (
                    <Badge colorTag="teal" size="sm">Started</Badge>
                  )}
                </div>
                {pt.note && (
                  <p className="text-xs text-text-muted mt-0.5">{pt.note}</p>
                )}
                {pt.started && pt.engagementId && (
                  <p className="text-[10px] text-text-muted mt-1 font-mono">
                    engagement id={pt.engagementId}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setPreviewId(pt.templateId)} title="Preview structure"
                  className="h-7 px-2 text-[10px] rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
                  Preview
                </button>
                {!pt.started && (
                  <>
                    <Button size="xs" icon={Play} variant="secondary"
                      onClick={() => setStartTarget(pt)}>
                      Start
                    </Button>
                    <button onClick={() => setRemoveTarget(pt)} title="Remove from plan"
                      className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Picker modal ───────────────────────────────────────────────── */}
      <Modal open={showPicker} onClose={() => setShowPicker(false)} title="Add template to plan">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Planning note (optional)</label>
            <input value={addNote} onChange={e => setAddNote(e.target.value)}
              placeholder="e.g. Q1 2026, External auditor, Surveillance only"
              className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>

          <p className="text-xs text-text-muted -mt-2">
            Only PUBLISHED templates can be planned. Select one below.
          </p>

          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
            {library.map(t => {
              const alreadyPlanned = plannedIds.has(t.id)
              return (
                <button key={t.id}
                  disabled={alreadyPlanned || M.add.isPending}
                  onClick={() => handleAdd(t.id)}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-card border text-left transition-colors',
                    alreadyPlanned
                      ? 'border-border opacity-40 cursor-not-allowed'
                      : 'border-border hover:border-brand-500/40 hover:bg-brand-500/5 cursor-pointer'
                  )}
                >
                  <LayoutTemplate size={14} className="text-text-muted mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{t.name}</span>
                      {t.frameworkRef && (
                        <span className="font-mono text-[10px] text-text-muted">{t.frameworkRef}</span>
                      )}
                      <Badge colorTag={t.auditType === 'INTERNAL' ? 'blue' : 'purple'} size="sm">
                        {t.auditType}
                      </Badge>
                      {alreadyPlanned && (
                        <Badge colorTag="teal" size="sm">Already planned</Badge>
                      )}
                    </div>
                  </div>
                  <div role="button" tabIndex={0}
                    className="ml-auto shrink-0 opacity-60 hover:opacity-100 cursor-pointer p-1"
                    onClick={e => { e.stopPropagation(); setPreviewId(t.id) }}>
                    <Eye size={13} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </Modal>

      {/* ── Preview modal ────────────────────────────────────────────────── */}
      <TemplatePreviewModal
        templateId={previewId}
        onClose={() => setPreviewId(null)}
      />

      {/* ── Start engagement modal ───────────────────────────────────────── */}
      <StartEngagementModal
        projectId={projectId}
        plannedTemplate={startTarget}
        onClose={() => setStartTarget(null)}
      />

      {/* ── Remove confirmation ──────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!removeTarget}
        title="Remove from plan"
        description={`Remove "${removeTarget?.templateName}" from this project's plan? The template itself is not affected.`}
        confirmLabel="Remove"
        variant="destructive"
        loading={M.remove.isPending}
        onConfirm={() => M.remove.mutate(removeTarget.templateId, {
          onSuccess: () => setRemoveTarget(null),
        })}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  )
}