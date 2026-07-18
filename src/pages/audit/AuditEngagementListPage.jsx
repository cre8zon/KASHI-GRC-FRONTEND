/**
 * AuditEngagementListPage — /audit/projects/:projectId
 *
 * Shows all engagements under a project.
 * Allows creating new engagements (picks template, type, lead auditor).
 * Progress bar computed from testedControls / totalControls.
 */
import { useState }                               from 'react'
import { useParams, useNavigate }                  from 'react-router-dom'
import { useQuery, useMutation, useQueryClient }   from '@tanstack/react-query'
import { Plus, ClipboardList, AlertTriangle, Calendar, ChevronRight, ArrowLeft } from 'lucide-react'
import { auditApi }       from '../../api/audit.api'
import { PageLayout }     from '../../components/layout/PageLayout'
import { Button }         from '../../components/ui/Button'
import { Badge }          from '../../components/ui/Badge'
import { Modal }          from '../../components/ui/Modal'
import { EmptyState }     from '../../components/ui/EmptyState'
import AuditProjectTemplatesPanel from './AuditProjectTemplatesPanel'
import { formatDate }     from '../../utils/format'
import toast              from 'react-hot-toast'

const STATUS_COLOR = {
  PLANNING:            'gray',
  FIELDWORK:           'blue',
  EVIDENCE_REVIEW:     'indigo',
  DRAFT_REPORT:        'purple',
  MANAGEMENT_RESPONSE: 'amber',
  FINAL_REPORT:        'teal',
  CLOSED:              'green',
  CANCELLED:           'red',
}

const AUDIT_TYPE_COLOR = { INTERNAL: 'blue', EXTERNAL: 'purple' }

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useProject   = (id) => useQuery({
  queryKey: ['audit-project', id],
  queryFn:  () => auditApi.projects.get(id),
  enabled:  !!id,
})

const useEngagements = (projectId) => useQuery({
  queryKey: ['audit-engagements', projectId],
  queryFn:  () => auditApi.engagements.list({ projectId, take: 100 }),
  enabled:  !!projectId,
  select:   d => d?.items ?? d ?? [],
})

const useTemplates = () => useQuery({
  queryKey: ['audit-templates-published'],
  queryFn:  () => auditApi.library.templates.list({ status: 'PUBLISHED', take: 100 }),
  select:   d => d?.items ?? d ?? [],
})

function useCreateEngagement(projectId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: auditApi.engagements.create,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['audit-engagements', projectId] })
      toast.success('Engagement created — template is being snapshotted')
    },
    onError: e => toast.error(e?.message || 'Failed to create engagement'),
  })
}

// ─── Create form ──────────────────────────────────────────────────────────────

function EngagementForm({ projectId, onSubmit, loading }) {
  const { data: templates } = useTemplates()
  const [form, setForm] = useState({
    projectId,
    name: '', description: '', templateId: '', frameworkRef: '',
    auditType: 'INTERNAL', plannedStart: '', plannedEnd: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedTemplate = templates?.find(t => String(t.id) === String(form.templateId))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-sm text-text-secondary mb-1">Engagement name *</label>
        <input value={form.name} onChange={e => set('name', e.target.value)}
          placeholder="e.g. ISO 27001 Surveillance Audit 2026"
          className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-text-secondary mb-1">Audit type *</label>
          <select value={form.auditType} onChange={e => set('auditType', e.target.value)}
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="INTERNAL">Internal</option>
            <option value="EXTERNAL">External</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Template</label>
          <select value={form.templateId} onChange={e => {
            const t = templates?.find(t => String(t.id) === e.target.value)
            set('templateId', e.target.value)
            if (t?.frameworkRef) set('frameworkRef', t.frameworkRef)
          }}
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="">— no template —</option>
            {(templates || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      {selectedTemplate && (
        <div className="rounded-ctl bg-surface-overlay border border-border px-3 py-2 text-xs text-text-secondary">
          Template: {selectedTemplate.name} · {selectedTemplate.frameworkRef || 'no framework ref'}
        </div>
      )}
      <div>
        <label className="block text-sm text-text-secondary mb-1">Framework reference</label>
        <input value={form.frameworkRef} onChange={e => set('frameworkRef', e.target.value)}
          placeholder="e.g. ISO 27001, SOC 2 Type II, PCI DSS 4.0"
          className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-text-secondary mb-1">Planned start</label>
          <input type="date" value={form.plannedStart} onChange={e => set('plannedStart', e.target.value)}
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Planned end</label>
          <input type="date" value={form.plannedEnd} onChange={e => set('plannedEnd', e.target.value)}
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
      <Button variant="primary" onClick={() => onSubmit(form)} loading={loading}
        disabled={!form.name.trim()}>
        Create engagement
      </Button>
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ tested, total }) {
  const pct = total > 0 ? Math.round((tested / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 h-1.5 rounded-full bg-surface-overlay">
        <div className="h-1.5 rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-text-muted tabular-nums">{pct}%</span>
    </div>
  )
}



// ─── Main page ────────────────────────────────────────────────────────────────

export default function AuditEngagementListPage() {
  const { projectId }       = useParams()
  const navigate             = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  const { data: project }                          = useProject(projectId)
  const { data: engagements, isLoading, refetch }  = useEngagements(projectId)
  const createMutation                             = useCreateEngagement(projectId)

  const handleCreate = (form) => {
    createMutation.mutate(form, { onSuccess: () => setShowCreate(false) })
  }

  return (
    <PageLayout
      title={project?.name ?? 'Audit project'}
      subtitle={`${project?.projectRef ?? ''} · audit engagements`}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate('/audit/projects')}>
            Projects
          </Button>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
            New engagement
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="px-6 py-4 grid gap-3">
          {[1, 2].map(i => <div key={i} className="h-28 rounded-card bg-surface-overlay animate-pulse" />)}
        </div>
      ) : !engagements?.length ? (
        <EmptyState icon={ClipboardList} title="No engagements yet"
          description="Create an engagement to begin the audit. Selecting a template auto-generates the control checklist."
          action={<Button variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>New engagement</Button>}
        />
      ) : (
        <div className="px-6 py-4 flex flex-col gap-3">
          {engagements.map(eng => (
            <button key={eng.id}
              onClick={() => navigate(`/audit/engagements/${eng.id}`)}
              className="w-full text-left rounded-card border border-border bg-surface-raised hover:bg-surface-overlay transition-colors p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <ClipboardList size={18} className="text-text-muted mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-text-primary text-sm">{eng.name}</span>
                      <span className="text-xs text-text-muted">{eng.engagementRef}</span>
                      <Badge color={STATUS_COLOR[eng.status] ?? 'gray'} size="sm">
                        {eng.status?.replace(/_/g, ' ')}
                      </Badge>
                      <Badge color={AUDIT_TYPE_COLOR[eng.auditType] ?? 'gray'} size="sm">
                        {eng.auditType}
                      </Badge>
                    </div>
                    {eng.frameworkRef && (
                      <p className="text-xs text-text-secondary mt-0.5">{eng.frameworkRef}</p>
                    )}
                    {eng.totalControls > 0 && (
                      <ProgressBar tested={eng.testedControls} total={eng.totalControls} />
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                      <span>{eng.totalControls} controls</span>
                      {eng.openFindingCount > 0 && (
                        <span className="flex items-center gap-1 text-status-fail-fg">
                          <AlertTriangle size={11} />{eng.openFindingCount} findings
                        </span>
                      )}
                      {eng.plannedEnd && (
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />Due {formatDate(eng.plannedEnd)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-text-muted shrink-0 mt-0.5" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Template planning panel ────────────────────────────── */}
      <div className="px-6 pb-6 mt-4 pt-6 border-t border-border">
        <AuditProjectTemplatesPanel projectId={Number(projectId)} />
      </div>
      
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New audit engagement">
        <EngagementForm projectId={Number(projectId)} onSubmit={handleCreate}
          loading={createMutation.isPending} />
      </Modal>
    </PageLayout>
  )
}
