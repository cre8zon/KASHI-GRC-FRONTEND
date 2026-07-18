/**
 * AuditProjectListPage — /audit/projects
 *
 * Lists audit projects for the current tenant.
 * Each project links to its engagements.
 * CAE / Audit Manager can create new projects.
 */
import { useState }                               from 'react'
import { useNavigate }                             from 'react-router-dom'
import { useQuery, useMutation, useQueryClient }   from '@tanstack/react-query'
import { Plus, FolderKanban, Calendar, ChevronRight, RefreshCw } from 'lucide-react'
import { auditApi }       from '../../api/audit.api'
import { PageLayout }     from '../../components/layout/PageLayout'
import { Button }         from '../../components/ui/Button'
import { Badge }          from '../../components/ui/Badge'
import { Modal }          from '../../components/ui/Modal'
import { EmptyState }     from '../../components/ui/EmptyState'
import { cn }             from '../../lib/cn'
import { formatDate }     from '../../utils/format'
import toast              from 'react-hot-toast'

const STATUS_COLOR = {
  PLANNING:    'gray',
  IN_PROGRESS: 'blue',
  ON_HOLD:     'amber',
  COMPLETED:   'green',
  CANCELLED:   'red',
}

const useProjects = () => useQuery({
  queryKey: ['audit-projects'],
  queryFn:  () => auditApi.projects.list({ take: 100 }),
  select:   d => d?.items ?? d ?? [],
})

function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: auditApi.projects.create,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['audit-projects'] }); toast.success('Project created') },
    onError:    e  => toast.error(e?.message || 'Failed to create project'),
  })
}

// ─── Project form ─────────────────────────────────────────────────────────────

function ProjectForm({ onSubmit, loading }) {
  const [form, setForm] = useState({ name: '', description: '', plannedStart: '', plannedEnd: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-sm text-text-secondary mb-1">Project name *</label>
        <input
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="e.g. Cloud Security Programme 2026"
          className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-sm text-text-secondary mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={e => set('description', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
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
        Create project
      </Button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AuditProjectListPage() {
  const navigate             = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const { data: projects, isLoading, refetch } = useProjects()
  const createMutation       = useCreateProject()

  const handleCreate = (form) => {
    createMutation.mutate(form, {
      onSuccess: () => setShowCreate(false),
    })
  }

  return (
    <PageLayout
      title="Audit projects"
      subtitle="Group audit engagements by programme or annual plan"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
            New project
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="px-6 py-4 grid gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-card bg-surface-overlay animate-pulse" />)}
        </div>
      ) : !projects?.length ? (
        <EmptyState
          icon={FolderKanban}
          title="No audit projects yet"
          description="Create a project to group your audit engagements."
          action={<Button variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>New project</Button>}
        />
      ) : (
        <div className="px-6 py-4 flex flex-col gap-3">
          {projects.map(project => (
            <button
              key={project.id}
              onClick={() => navigate(`/audit/projects/${project.id}`)}
              className="w-full text-left rounded-card border border-border bg-surface-raised hover:bg-surface-overlay transition-colors p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <FolderKanban size={18} className="text-text-muted mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-text-primary text-sm">{project.name}</span>
                      <span className="text-xs text-text-muted">{project.projectRef}</span>
                      <Badge color={STATUS_COLOR[project.status] ?? 'gray'} size="sm">
                        {project.status?.replace('_', ' ')}
                      </Badge>
                    </div>
                    {project.description && (
                      <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{project.description}</p>
                    )}
                    {(project.plannedStart || project.plannedEnd) && (
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-text-muted">
                        <Calendar size={11} />
                        {project.plannedStart && <span>{formatDate(project.plannedStart)}</span>}
                        {project.plannedStart && project.plannedEnd && <span>–</span>}
                        {project.plannedEnd && <span>{formatDate(project.plannedEnd)}</span>}
                      </div>
                    )}
                  </div>
                </div>
                <ChevronRight size={16} className="text-text-muted shrink-0 mt-0.5" />
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New audit project">
        <ProjectForm onSubmit={handleCreate} loading={createMutation.isPending} />
      </Modal>
    </PageLayout>
  )
}
