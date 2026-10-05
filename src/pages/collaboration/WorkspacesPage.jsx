import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, Building2, Layers, RefreshCw, Archive } from 'lucide-react'
import { collabApi, unwrapList, unwrapOne, errMsg } from '../../api/collab.api'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Skeleton, EmptyState } from '../../components/ui/EmptyState'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

/**
 * Collaboration › Workspaces — every workspace the caller can see in the active
 * organisation. A workspace is the relationship with one audit firm (or an
 * internal one, with no firm). Creation is offered only when the server says
 * the caller may create, and only with firms the organisation has admitted.
 */
export default function WorkspacesPage() {
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  const { data: listRaw, isLoading, refetch } = useQuery({
    queryKey: ['collab-workspaces'],
    queryFn:  () => collabApi.list(),
  })
  const { data: optRaw } = useQuery({
    queryKey: ['collab-workspace-options'],
    queryFn:  () => collabApi.options(),
  })
  const workspaces = unwrapList(listRaw)
  const options = unwrapOne(optRaw) || {}
  const active   = workspaces.filter(w => w.status !== 'ARCHIVED')
  const archived = workspaces.filter(w => w.status === 'ARCHIVED')

  return (
    <PageLayout
      title="Workspaces"
      subtitle="Shared space with your audit firm: plan, meetings and requests before and during engagements"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => refetch()} />
          {options.canCreate && (
            <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>New workspace</Button>
          )}
        </div>
      }
    >
      <div className="px-6 pb-6 space-y-6 overflow-y-auto">
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : workspaces.length === 0 ? (
          <EmptyState icon={Users} title="No workspaces yet"
            description={options.canCreate
              ? 'Open a workspace with an audit firm your organisation has admitted, or an internal one for your own audit team.'
              : 'You will see a workspace here once someone adds you to it.'}
            action={options.canCreate && (
              <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>New workspace</Button>
            )} />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {active.map(w => <WorkspaceCard key={w.id} ws={w} onOpen={() => navigate(`/collaboration/workspaces/${w.id}`)} />)}
            </div>
            {archived.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted mb-2 flex items-center gap-1.5">
                  <Archive size={11} /> Archived
                </p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 opacity-70">
                  {archived.map(w => <WorkspaceCard key={w.id} ws={w} onOpen={() => navigate(`/collaboration/workspaces/${w.id}`)} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <CreateWorkspaceModal open={showCreate} onClose={() => setShowCreate(false)} options={options}
        onCreated={(ws) => { setShowCreate(false); navigate(`/collaboration/workspaces/${ws.id}`) }} />
    </PageLayout>
  )
}

function WorkspaceCard({ ws, onOpen }) {
  return (
    <Card hover onClick={onOpen} className="p-4 cursor-pointer">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{ws.name}</p>
          <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1.5 truncate">
            <Building2 size={11} className="shrink-0" />
            {ws.internal ? 'Internal audit' : (ws.firmName || 'Audit firm')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {ws.myRole === 'OWNER' && <Badge label="Owner" colorTag="indigo" />}
          {!ws.firmAccessActive && <Badge label="Firm access ended" colorTag="amber" />}
        </div>
      </div>
      {ws.description && <p className="text-xs text-text-secondary mt-2 line-clamp-2">{ws.description}</p>}
      <div className="flex items-center gap-4 mt-3 text-[11px] text-text-muted">
        <span className="flex items-center gap-1"><Users size={11} /> {ws.memberCount} member{ws.memberCount === 1 ? '' : 's'}</span>
        <span className="flex items-center gap-1"><Layers size={11} /> {ws.programmeCount} programme{ws.programmeCount === 1 ? '' : 's'}</span>
      </div>
    </Card>
  )
}

function CreateWorkspaceModal({ open, onClose, options, onCreated }) {
  const qc = useQueryClient()
  const firms = Array.isArray(options.firms) ? options.firms : []
  const [kind, setKind] = useState('firm')          // 'firm' | 'internal'
  const [firmTenantId, setFirmTenantId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const available = firms.filter(f => !f.hasWorkspace)
  const isFirm = kind === 'firm' || !options.canCreateInternal

  const { mutate, isPending } = useMutation({
    mutationFn: () => collabApi.create({
      name, description,
      firmTenantId: isFirm ? (firmTenantId || (options.side === 'FIRM' ? available[0]?.firmTenantId : '')) : null,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['collab-workspaces'] })
      qc.invalidateQueries({ queryKey: ['collab-workspace-options'] })
      toast.success('Workspace created')
      setName(''); setDescription(''); setFirmTenantId('')
      onCreated(unwrapOne(res))
    },
    onError: (e) => toast.error(errMsg(e, 'Could not create the workspace')),
  })

  const firmChosen = !isFirm || firmTenantId || (options.side === 'FIRM' && available.length > 0)
  const canSubmit = name.trim() && firmChosen && !isPending

  return (
    <Modal open={open} onClose={onClose} size="sm" title="New workspace"
      subtitle="One workspace per audit firm. Separate timelines with the same firm become programmes inside it.">
      <div className="space-y-4">
        {options.canCreateInternal && (
          <div className="flex gap-2">
            {[['firm', 'With an audit firm'], ['internal', 'Internal audit']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={cn('flex-1 text-xs px-3 py-2 rounded-ctl border transition-colors',
                  kind === k ? 'border-brand-500 bg-brand-500/10 text-text-primary font-medium'
                             : 'border-border text-text-secondary hover:bg-surface-overlay')}>
                {label}
              </button>
            ))}
          </div>
        )}

        {isFirm && (
          options.side === 'FIRM' ? (
            <p className="text-xs text-text-secondary">
              {available.length > 0
                ? <>With <span className="font-medium text-text-primary">this organisation</span>, for your firm.</>
                : 'Your firm already has a workspace with this organisation. Add a programme to it instead.'}
            </p>
          ) : available.length === 0 ? (
            <p className="text-xs text-text-secondary">
              {firms.length === 0
                ? 'No audit firm has been admitted yet. Admit one under External Auditors first.'
                : 'Every admitted firm already has a workspace. Add a programme to it instead.'}
            </p>
          ) : (
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Audit firm</span>
              <select value={firmTenantId} onChange={e => setFirmTenantId(e.target.value)}
                className="mt-1 w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary">
                <option value="">Choose a firm…</option>
                {available.map(f => <option key={f.firmTenantId} value={f.firmTenantId}>{f.name}</option>)}
              </select>
            </label>
          )
        )}

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme × Digio Security"
            className="mt-1 w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Description (optional)</span>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            className="mt-1 w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary" />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button size="sm" onClick={() => mutate()} disabled={!canSubmit} loading={isPending}>Create</Button>
        </div>
      </div>
    </Modal>
  )
}
