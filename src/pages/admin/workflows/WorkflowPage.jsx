import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, RefreshCw, Search, ChevronRight, ChevronDown,
  GitBranch, Play, Pause, Trash2, Pencil,
  CheckCircle2, XCircle, Clock, Loader2,
  ArrowLeft, Users, Zap, History, RotateCcw, Activity} from 'lucide-react'
import { workflowsApi }   from '../../../api/workflows.api'
import { assessmentsApi } from '../../../api/assessments.api'
import { PageLayout }   from '../../../components/layout/PageLayout'
import { DataTable }    from '../../../components/ui/DataTable'
import { Button }       from '../../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Input }        from '../../../components/ui/Input'
import { Badge }        from '../../../components/ui/Badge'
import { cn }           from '../../../lib/cn'
import { formatDate }   from '../../../utils/format'
import toast            from 'react-hot-toast'
import { StepForm, stepsToFormState, stepsToPayload } from './StepForm'
import { useWorkflowProgress } from '../../../hooks/useWorkflow'
import { WorkflowTimeline } from '../../../components/workflow/WorkflowTimeline'

// ─── Constants (unchanged) ────────────────────────────────────────────────────

const STATUS_COLOR = {
  DRAFT: 'amber', ACTIVE: 'green', IN_PROGRESS: 'blue',
  COMPLETED: 'green', REJECTED: 'red', CANCELLED: 'gray',
  ON_HOLD: 'amber', PENDING: 'purple',
}
const TASK_STATUS_COLOR = {
  PENDING: 'amber', APPROVED: 'green', REJECTED: 'red',
  REASSIGNED: 'blue', DELEGATED: 'purple', EXPIRED: 'gray',
}
const APPROVAL_TYPES = [
  { value: 'ANY_ONE',   label: 'Any One' },
  { value: 'ALL',       label: 'All Must Approve' },
  { value: 'MAJORITY',  label: 'Majority' },
  { value: 'THRESHOLD', label: 'Threshold (N)' },
]
const ACTION_TYPES = ['APPROVE','REJECT','SEND_BACK','REASSIGN','DELEGATE','ESCALATE','COMMENT','WITHDRAW']
const ACTION_COLOR = {
  APPROVE: 'text-green-400', REJECT: 'text-red-400', SEND_BACK: 'text-amber-400',
  REASSIGN: 'text-blue-400', DELEGATE: 'text-purple-400', ESCALATE: 'text-orange-400',
  COMMENT: 'text-text-muted', WITHDRAW: 'text-red-400',
}

// ─── Hooks (unchanged except useCancelAndRestart — NEW) ───────────────────────

const useBlueprints = (params) => useQuery({
  queryKey: ['workflow-blueprints', params],
  queryFn:  () => workflowsApi.blueprints.list(params),
  keepPreviousData: true,
})
const useInstances = (params) => useQuery({
  queryKey: ['workflow-instances', params],
  queryFn:  () => workflowsApi.instances.list(params),
  keepPreviousData: true,
})
const useInstance = (id) => useQuery({
  queryKey: ['workflow-instance', id],
  queryFn:  () => workflowsApi.instances.get(id),
  enabled:  !!id,
})
const useHistory = (id) => useQuery({
  queryKey: ['workflow-history', id],
  queryFn:  () => workflowsApi.history.forInstance(id),
  enabled:  !!id,
})
const useBlueprintDetail = (id) => useQuery({
  queryKey: ['workflow-blueprint', id],
  queryFn:  () => workflowsApi.blueprints.get(id),
  enabled:  !!id,
})

function useCreateBlueprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: workflowsApi.blueprints.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflow-blueprints'] }); toast.success('Blueprint created') },
    onError: (e) => toast.error(e?.message || 'Failed to create blueprint'),
  })
}
function useUpdateBlueprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => workflowsApi.blueprints.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflow-blueprints'] }); toast.success('Blueprint updated') },
    onError: (e) => toast.error(e?.message || 'Failed to update blueprint'),
  })
}
function useActivate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => workflowsApi.blueprints.activate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflow-blueprints'] }); toast.success('Workflow activated') },
    onError: (e) => toast.error(e?.message || 'Activation failed'),
  })
}
function useDeactivate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => workflowsApi.blueprints.deactivate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflow-blueprints'] }); toast.success('Workflow deactivated') },
    onError: (e) => toast.error(e?.message || 'Deactivation failed'),
  })
}
function useDeleteBlueprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => workflowsApi.blueprints.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflow-blueprints'] }); toast.success('Blueprint deleted') },
    onError: (e) => toast.error(e?.message || 'Delete failed'),
  })
}
function useCreateVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => workflowsApi.blueprints.createVersion(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflow-blueprints'] }); toast.success('New version created') },
    onError: (e) => toast.error(e?.message || 'Failed to create version'),
  })
}
function usePerformAction(instanceId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: workflowsApi.tasks.action,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-instance', instanceId] })
      qc.invalidateQueries({ queryKey: ['workflow-instances'] })
      toast.success('Action performed')
    },
    onError: (e) => toast.error(e?.message || 'Action failed'),
  })
}
function useCancelInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, remarks }) => workflowsApi.instances.cancel(id, remarks),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-instances'] })
      qc.invalidateQueries({ queryKey: ['workflow-instance'] })
      toast.success('Instance cancelled')
    },
    onError: (e) => toast.error(e?.message || 'Cancel failed'),
  })
}
function useHoldInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, remarks }) => workflowsApi.instances.hold(id, remarks),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflow-instances'] }); toast.success('Instance on hold') },
    onError: (e) => toast.error(e?.message || 'Hold failed'),
  })
}
function useResumeInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => workflowsApi.instances.resume(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflow-instances'] }); toast.success('Instance resumed') },
    onError: (e) => toast.error(e?.message || 'Resume failed'),
  })
}

/**
 * useCancelAndRestart — NEW
 *
 * Cancels a stale workflow instance (and its linked assessment + cycle) then
 * immediately starts a fresh instance for the same entity.
 *
 * Used to migrate instances created before the step-gated architecture was
 * deployed. Those instances have:
 *   - WorkflowInstance:       IN_PROGRESS (stale)
 *   - VendorAssessment:       ASSIGNED    (stale, shows in list)
 *   - VendorAssessmentCycle:  ACTIVE      (stale, blocks new cycle creation)
 *   - AssessmentTemplateInstance: exists  (snapshot preserved for audit)
 *
 * Flow:
 *   1. PATCH /v1/workflow-instances/:id/cancel
 *      → WorkflowInstance becomes CANCELLED
 *
 *   2. PATCH /v1/assessments/:assessmentId/cancel  (if assessmentId known)
 *      → VendorAssessment becomes CANCELLED
 *      → VendorAssessmentCycle becomes CLOSED
 *      → Both disappear from the default list view
 *      → Snapshot data (AssessmentTemplateInstance etc.) preserved for audit
 *
 *   3. POST /v1/workflow-instances
 *      → Fresh WorkflowInstance created
 *      → Step 1 starts as AWAITING_ASSIGNMENT (new architecture)
 *      → executeAssessment() on the new system step will create a fresh
 *        AssessmentTemplateInstance snapshot and a new cycle
 *
 * The assessmentId must be passed in from the instance row. The instance list
 * endpoint returns entityId (vendorId) which can be used to look it up, but
 * since the row already has the context, we pass it directly from the confirm dialog.
 */
function useCancelAndRestart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, workflowId, entityId, entityType, priority, assessmentId }) => {
      // Step 1: cancel the stale workflow instance (terminal)
      await workflowsApi.instances.cancel(id, 'Cancelled to restart under step-gated architecture')

      // Step 2: cancel the stale assessment + close its cycle (if linked)
      // This removes it from the default assessment list view.
      // Snapshot data is preserved — nothing is deleted.
      if (assessmentId) {
        try {
          await assessmentsApi.vendor.cancel(
            assessmentId,
            'Cancelled — workflow instance restarted under step-gated architecture'
          )
        } catch (e) {
          // Non-fatal — assessment may already be terminal or not yet created
          // (e.g. executeAssessment step hadn't fired yet). Log and continue.
          console.warn('[CancelAndRestart] Assessment cancel skipped:', e?.message)
        }
      }

      // Step 3: start a fresh instance for the same entity
      // Only send StartWorkflowRequest fields to avoid @Valid 400s
      return workflowsApi.instances.start({
        workflowId,
        entityId,
        entityType,
        priority: priority || 'MEDIUM',
      })
    },
    onSuccess: (newInstance) => {
      qc.invalidateQueries({ queryKey: ['workflow-instances'] })
      qc.invalidateQueries({ queryKey: ['workflow-instance'] })
      qc.invalidateQueries({ queryKey: ['vendor-assessments'] })
      toast.success(
        `Restarted — new instance #${newInstance?.id ?? ''} created. ` +
        `Step 1 is now AWAITING_ASSIGNMENT. Stale assessment closed.`
      )
    },
    onError: (e) => toast.error(e?.message || 'Cancel & restart failed'),
  })
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkflowPage({ isPlatformAdmin = false, defaultTab }) {
  const initialTab = defaultTab || (isPlatformAdmin ? 'blueprints' : 'instances')
  const [tab, setTab]           = useState(initialTab)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [activeInstance, setActiveInstance] = useState(null)
  const [showCreate, setShowCreate]         = useState(false)
  const [editTarget, setEditTarget]         = useState(null)
  const [deleteTarget, setDeleteTarget]     = useState(null)
  const [confirmAction, setConfirmAction]   = useState(null)
  // NEW: tracks which instance row is pending a Cancel & Restart confirmation
  const [restartTarget, setRestartTarget]   = useState(null)

  const { mutate: activate,          isPending: activating }       = useActivate()
  const { mutate: deactivate,        isPending: deactivating }     = useDeactivate()
  const { mutate: deleteBlueprint,   isPending: deleting }         = useDeleteBlueprint()
  const { mutate: createVersion }                                  = useCreateVersion()
  const { mutate: cancelInstance,    isPending: cancelling }       = useCancelInstance()
  const { mutate: holdInstance }                                   = useHoldInstance()
  const { mutate: resumeInstance }                                 = useResumeInstance()
  // NEW
  const { mutate: cancelAndRestart,  isPending: restarting }       = useCancelAndRestart()

  const bpParams   = { skip: (page - 1) * 20, take: 20, ...(search ? { search: `name=${search}` } : {}) }
  const instParams = { skip: (page - 1) * 20, take: 20 }

  const { data: bpData,   isLoading: bpLoading,   refetch: bpRefetch }   = useBlueprints(bpParams)
  const { data: instData, isLoading: instLoading, refetch: instRefetch } = useInstances(instParams)

  if (activeInstance) {
    return <InstanceDetail instanceId={activeInstance}
      onBack={() => setActiveInstance(null)} isPlatformAdmin={isPlatformAdmin} />
  }

  // ── Blueprint columns (unchanged) ─────────────────────────────
  const bpItems = (bpData?.items || []).map(r => ({ ...r, id: r.id }))
  const bpColumns = [
    { key: 'id',         label: 'ID',          sortable: true,  width: 60,  type: 'mono' },
    { key: 'name',       label: 'Name',         sortable: true,  width: 200 },
    { key: 'entityType', label: 'Entity Type',  sortable: true,  width: 110 },
    { key: 'version',    label: 'Ver',          sortable: false, width: 50,  type: 'mono' },
    { key: 'isActive',   label: 'Status',       sortable: false, width: 100, type: 'custom',
      render: (row) => <Badge value={row.isActive ? 'ACTIVE' : 'DRAFT'}
        label={row.isActive ? 'Active' : 'Draft'}
        colorTag={row.isActive ? 'green' : 'amber'} />
    },
    { key: 'steps',      label: 'Steps',        sortable: false, width: 55,  type: 'custom',
      render: (row) => <span className="text-xs font-mono text-text-muted">{row.steps?.length ?? '—'}</span>
    },
    // Trigger column — shows automated actions declared on SYSTEM steps in this blueprint.
    // Clicking the chip opens the edit modal so Platform Admin can change the action.
    { key: '__triggers', label: 'Triggers',     sortable: false, width: 200, type: 'custom',
      render: (row) => {
        const systemSteps = (row.steps || []).filter(s => s.side === 'SYSTEM' && s.automatedAction)
        if (systemSteps.length === 0)
          return <span className="text-[10px] text-text-muted italic">none</span>
        return (
          <div className="flex flex-wrap gap-1">
            {systemSteps.map(s => (
              <span key={s.id}
                title={`Step ${s.stepOrder}: ${s.name}`}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 text-brand-400 font-mono cursor-default">
                <Zap size={8} />
                {s.automatedAction}
              </span>
            ))}
          </div>
        )
      }
    },
    { key: 'createdAt',  label: 'Created',      sortable: true,  width: 110, type: 'date' },
    { key: '__actions',  label: '',             width: 180,       type: 'custom',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {!row.isActive && isPlatformAdmin && (
            <Button size="xs" variant="ghost" icon={Play}
              loading={activating} onClick={() => activate(row.id)}>Activate</Button>
          )}
          {row.isActive && isPlatformAdmin && (
            <Button size="xs" variant="ghost" icon={Pause}
              loading={deactivating} onClick={() => deactivate(row.id)}>Deactivate</Button>
          )}
          {isPlatformAdmin && (
            <>
              {!row.isActive && (
                <button onClick={() => setEditTarget(row)} title="Edit blueprint"
                  className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
                  <Pencil size={12} />
                </button>
              )}
              <button onClick={() => createVersion(row.id)} title="Create new version"
                className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
                <GitBranch size={12} />
              </button>
              <button onClick={() => setDeleteTarget(row)} title="Delete"
                className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      )
    },
  ]

  // ── Instance columns — Cancel & Restart button added ──────────
  const instItems = (instData?.items || []).map(r => ({ ...r, id: r.id }))
  const instColumns = [
    { key: 'id',              label: 'ID',           sortable: true,  width: 60,  type: 'mono' },
    { key: 'workflowName',    label: 'Workflow',      sortable: false, width: 180 },
    { key: 'entityType',      label: 'Entity',        sortable: false, width: 100 },
    { key: 'entityId',        label: 'Entity ID',     sortable: false, width: 80,  type: 'mono' },
    { key: 'currentStepName', label: 'Current Step',  sortable: false, width: 140 },
    { key: '__progress',      label: 'Progress',      sortable: false, width: 110, type: 'custom',
      render: (row) => <InstanceProgressBar instanceId={row.id} status={row.status} />
    },
    { key: 'status',          label: 'Status',        sortable: true,  width: 110, type: 'custom',
      render: (row) => <Badge value={row.status} label={row.status}
        colorTag={STATUS_COLOR[row.status] || 'gray'} />
    },
    { key: 'priority',        label: 'Priority',      sortable: false, width: 90,  type: 'custom',
      render: (row) => <span className={cn('text-xs font-medium',
        row.priority === 'CRITICAL' ? 'text-red-400' :
        row.priority === 'HIGH' ? 'text-amber-400' : 'text-text-muted')}>{row.priority}</span>
    },
    { key: 'startedAt',       label: 'Started',       sortable: true,  width: 110, type: 'date' },
    { key: '__actions',       label: '',              width: 160,       type: 'custom',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <Button size="xs" variant="ghost" icon={ChevronRight}
            onClick={() => setActiveInstance(row.id)}>View</Button>

          {(isPlatformAdmin || row.status === 'IN_PROGRESS') && (
            <>
              {row.status === 'IN_PROGRESS' && (
                <button onClick={() => holdInstance({ id: row.id })} title="Hold"
                  className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-amber-400 hover:bg-amber-500/10 transition-colors">
                  <Pause size={12} />
                </button>
              )}
              {row.status === 'ON_HOLD' && (
                <button onClick={() => resumeInstance(row.id)} title="Resume"
                  className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-green-400 hover:bg-green-500/10 transition-colors">
                  <Play size={12} />
                </button>
              )}
              {!['COMPLETED','CANCELLED','REJECTED'].includes(row.status) && (
                <button onClick={() => setConfirmAction({ type: 'cancel', row })} title="Cancel"
                  className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <XCircle size={12} />
                </button>
              )}
            </>
          )}

          {/*
            NEW — Cancel & Restart button.
            Only shown for IN_PROGRESS instances (the ones that need migration).
            Requires the workflow to still be active so a new instance can be
            started immediately. The workflowId, entityId, entityType, and
            priority are read directly from the row — no extra inputs needed.
          */}
          {isPlatformAdmin && row.status === 'IN_PROGRESS' && (
            <button
              onClick={() => setRestartTarget(row)}
              title="Cancel this instance and start a fresh one for the same entity"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      )
    },
  ]

  return (
    <PageLayout
      title="Workflows"
      subtitle={tab === 'blueprints'
        ? `${bpData?.pagination?.totalItems ?? 0} blueprints`
        : `${instData?.pagination?.totalItems ?? 0} instances`}
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search…"
              className="h-8 pl-8 pr-3 w-48 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw}
            onClick={tab === 'blueprints' ? bpRefetch : instRefetch} />
          {isPlatformAdmin && tab === 'blueprints' && (
            <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>New Blueprint</Button>
          )}
        </div>
      }
    >
      {/* Tabs (unchanged) */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-border">
        {[
          { key: 'blueprints', label: 'Blueprints', icon: GitBranch },
          { key: 'instances',  label: 'Instances',  icon: Play },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => { setTab(key); setPage(1); setSearch('') }}
            className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key ? 'border-brand-500 text-brand-400' : 'border-transparent text-text-muted hover:text-text-secondary')}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'blueprints' ? (
          <DataTable columns={bpColumns} data={bpItems}
            pagination={bpData?.pagination} onPageChange={setPage}
            loading={bpLoading} onRowClick={() => {}}
            emptyMessage={isPlatformAdmin ? 'No blueprints yet. Create the first one.' : 'No active workflows.'} />
        ) : (
          <DataTable columns={instColumns} data={instItems}
            pagination={instData?.pagination} onPageChange={setPage}
            loading={instLoading} onRowClick={row => setActiveInstance(row.id)}
            emptyMessage="No workflow instances yet." />
        )}
      </div>

      {/* Existing modals (unchanged) */}
      {isPlatformAdmin && (
        <CreateBlueprintModal open={showCreate} onClose={() => setShowCreate(false)} />
      )}
      {isPlatformAdmin && editTarget && (
        <EditBlueprintModal blueprint={editTarget} onClose={() => setEditTarget(null)} />
      )}

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteBlueprint(deleteTarget?.id, { onSuccess: () => setDeleteTarget(null) })}
        loading={deleting} title="Delete Blueprint" variant="danger" confirmLabel="Delete"
        message={`Delete "${deleteTarget?.name}" v${deleteTarget?.version}? This cannot be undone.`}
      />
      <ConfirmDialog open={confirmAction?.type === 'cancel'} onClose={() => setConfirmAction(null)}
        onConfirm={() => cancelInstance(
          { id: confirmAction?.row?.id, remarks: 'Cancelled by admin' },
          { onSuccess: () => setConfirmAction(null) })}
        loading={cancelling} title="Cancel Instance" variant="danger" confirmLabel="Cancel"
        message={`Cancel workflow instance #${confirmAction?.row?.id}? This is a terminal action.`}
      />

      {/*
        NEW — Cancel & Restart confirmation dialog.
        Shows what will happen: instance X cancelled, stale assessment closed,
        new instance started for the same entity using the same workflow blueprint.
        Requires isPlatformAdmin so regular org users cannot trigger it.

        assessmentId is resolved here by finding the most recent non-terminal
        VendorAssessment for the entity from the instance list context.
        It is passed to useCancelAndRestart which calls PATCH /v1/assessments/:id/cancel
        to mark the stale assessment CANCELLED and close its cycle.
      */}
      {restartTarget && (
        <RestartConfirmDialog
          target={restartTarget}
          restarting={restarting}
          onClose={() => setRestartTarget(null)}
          onConfirm={(assessmentId) =>
            cancelAndRestart(
              {
                id:           restartTarget.id,
                workflowId:   restartTarget.workflowId,
                entityId:     restartTarget.entityId,
                entityType:   restartTarget.entityType,
                priority:     restartTarget.priority,
                assessmentId, // may be null if executeAssessment hadn't fired yet
              },
              { onSuccess: () => setRestartTarget(null) }
            )
          }
        />
      )}
    </PageLayout>
  )
}

// ─── Restart Confirm Dialog — NEW ─────────────────────────────────────────────
//
// Fetches the most recent non-terminal VendorAssessment for the entity so the
// Cancel & Restart flow can also close the stale assessment and its cycle.
// If no assessment is found (executeAssessment hadn't fired yet), the restart
// proceeds without the assessment cancel step — not an error.

function RestartConfirmDialog({ target, restarting, onClose, onConfirm }) {
  // Fetch assessments for this entity to find the stale one to close
  const { data: assessmentData } = useQuery({
    queryKey: ['restart-assessment-lookup', target?.entityId],
    queryFn: () => assessmentsApi.vendor.list({
      // Filter by vendorId via entityId — backend uses tenantId from JWT
      take: 10,
    }),
    enabled: !!target,
    staleTime: 0, // always fresh for this lookup
  })

  // Find the most recent ASSIGNED or IN_PROGRESS assessment for this vendor
  const staleAssessment = (assessmentData?.items || []).find(a =>
    String(a.vendorId) === String(target?.entityId) &&
    ['ASSIGNED', 'IN_PROGRESS'].includes(a.status)
  )

  const assessmentId = staleAssessment?.assessmentId ?? null

  return (
    <ConfirmDialog
      open={!!target}
      onClose={onClose}
      loading={restarting}
      title="Cancel & Restart Instance"
      variant="danger"
      confirmLabel="Cancel & Restart"
      message={
        target
          ? `This will cancel instance #${target.id} ` +
            `(${target.entityType} #${target.entityId}) ` +
            `and immediately start a fresh instance using workflow "${target.workflowName}". ` +
            (assessmentId
              ? `The stale assessment #${assessmentId} will be marked CANCELLED and its cycle closed. `
              : `No active assessment found — only the workflow instance will be cancelled. `) +
            `The AssessmentTemplateInstance snapshot is preserved for audit. ` +
            `The new instance follows the step-gated architecture — Step 1 starts as AWAITING_ASSIGNMENT. ` +
            `This cannot be undone.`
          : ''
      }
      onConfirm={() => onConfirm(assessmentId)}
    />
  )
}


// ─── Inline progress bar for instances table ──────────────────────────────────
function InstanceProgressBar({ instanceId, status }) {
  const { data: progress } = useWorkflowProgress(
    // Only fetch for active/recent instances — not every row on mount
    status !== 'PENDING' ? instanceId : null
  )
  const summary = Array.isArray(progress) ? progress[0] : null
  if (!summary) {
    return <span className="text-xs text-text-muted font-mono">—</span>
  }
  const { stepsCompleted, totalSteps } = summary
  const pct = totalSteps > 0 ? Math.round((stepsCompleted / totalSteps) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-overlay rounded-full overflow-hidden w-16">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-text-muted shrink-0">
        {stepsCompleted}/{totalSteps}
      </span>
    </div>
  )
}

// ─── Instance Detail (unchanged) ──────────────────────────────────────────────

function InstanceDetail({ instanceId, onBack, isPlatformAdmin }) {
  const [showHistory,  setShowHistory]  = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [actionModal,  setActionModal]  = useState(null)

  const { data: instance,  isLoading }  = useInstance(instanceId)
  const { data: history }               = useHistory(showHistory ? instanceId : null)
  const { data: progress }              = useWorkflowProgress(showProgress || true ? instanceId : null)
  const { mutate: performAction, isPending: actioning } = usePerformAction(instanceId)

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="text-brand-400 animate-spin" />
    </div>
  )
  if (!instance) return null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            <ArrowLeft size={15} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-text-primary">{instance.workflowName}</h1>
              <Badge value={instance.status} label={instance.status} colorTag={STATUS_COLOR[instance.status] || 'gray'} />
              {instance.priority === 'CRITICAL' && (
                <span className="text-xs font-bold text-red-400 flex items-center gap-1">
                  <Zap size={11} /> CRITICAL
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              {instance.entityType} #{instance.entityId}
              {instance.currentStepName && <> · Step: <span className="text-text-secondary">{instance.currentStepName}</span></>}
              {instance.startedAt && <> · Started {formatDate(instance.startedAt)}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={Activity}
            onClick={() => setShowProgress(s => !s)}>
            {showProgress ? 'Hide' : 'Show'} Progress
          </Button>
          <Button variant="ghost" size="sm" icon={History} onClick={() => setShowHistory(s => !s)}>
            {showHistory ? 'Hide' : 'Show'} History
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl flex flex-col gap-4">
          {/* Progress timeline panel */}
          {showProgress && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-2.5 bg-surface-overlay border-b border-border">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  Step Progress — Assignments & Tasks
                </p>
              </div>
              <div className="p-4">
                <WorkflowTimeline progress={progress} />
              </div>
            </div>
          )}

          {instance.stepInstances?.map((si, idx) => (
            <StepCard key={si.id} stepInstance={si} index={idx}
              isCurrentStep={instance.currentStepId === si.stepId && instance.status === 'IN_PROGRESS'}
              onAction={(taskId) => setActionModal({ taskId, stepInstance: si })}
              isPlatformAdmin={isPlatformAdmin} />
          ))}
          {(!instance.stepInstances || instance.stepInstances.length === 0) && (
            <p className="text-sm text-text-muted text-center py-12">No steps started yet.</p>
          )}

          {showHistory && history && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-2.5 bg-surface-overlay border-b border-border">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  Audit Trail — {history.length} events
                </p>
              </div>
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {history.map(h => (
                  <div key={h.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-overlay">
                    <div className="w-2 h-2 rounded-full bg-brand-400 shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-text-primary">{h.eventType.replace(/_/g, ' ')}</span>
                        {h.stepName && <span className="text-[10px] text-text-muted">@ {h.stepName}</span>}
                      </div>
                      {h.remarks && <p className="text-[10px] text-text-muted mt-0.5">{h.remarks}</p>}
                      {h.fromStatus && <p className="text-[10px] text-text-muted">{h.fromStatus} → {h.toStatus}</p>}
                    </div>
                    <span className="text-[10px] font-mono text-text-muted shrink-0">{formatDate(h.performedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {actionModal && (
        <TaskActionModal taskId={actionModal.taskId} stepInstance={actionModal.stepInstance}
          onClose={() => setActionModal(null)}
          onSubmit={(data) => performAction(data, { onSuccess: () => setActionModal(null) })}
          isPending={actioning} />
      )}
    </div>
  )
}

// ─── Step Card (unchanged) ────────────────────────────────────────────────────

function StepCard({ stepInstance, index, isCurrentStep, onAction }) {
  const [expanded, setExpanded] = useState(isCurrentStep)
  return (
    <div className={cn('rounded-lg border overflow-hidden',
      isCurrentStep ? 'border-brand-500/40 bg-brand-500/3' : 'border-border bg-surface-raised')}>
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-overlay transition-colors text-left">
        <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
          stepInstance.status === 'APPROVED' ? 'bg-green-500/20 text-green-400' :
          stepInstance.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' :
          isCurrentStep ? 'bg-brand-500/20 text-brand-400' : 'bg-surface-overlay text-text-muted')}>
          {stepInstance.status === 'APPROVED' ? <CheckCircle2 size={14} /> :
           stepInstance.status === 'REJECTED' ? <XCircle size={14} /> : index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-primary">{stepInstance.stepName || `Step ${stepInstance.stepOrder}`}</p>
            {stepInstance.iterationCount > 1 && (
              <span className="text-[10px] text-amber-400 font-medium">×{stepInstance.iterationCount}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <Badge value={stepInstance.status} label={stepInstance.status} colorTag={STATUS_COLOR[stepInstance.status] || 'gray'} />
            {stepInstance.slaDueAt && (
              <span className="flex items-center gap-1 text-[10px] text-text-muted">
                <Clock size={9} /> SLA {formatDate(stepInstance.slaDueAt)}
              </span>
            )}
            <span className="text-xs text-text-muted">{stepInstance.taskInstances?.length ?? 0} tasks</span>
          </div>
        </div>
        {expanded ? <ChevronDown size={13} className="text-text-muted shrink-0" /> : <ChevronRight size={13} className="text-text-muted shrink-0" />}
      </button>
      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {(!stepInstance.taskInstances || stepInstance.taskInstances.length === 0)
            ? <p className="px-4 py-4 text-xs text-text-muted text-center">No tasks in this step.</p>
            : stepInstance.taskInstances.map(task => (
                <TaskRow key={task.id} task={task}
                  canAct={isCurrentStep && task.status === 'PENDING'}
                  onAction={() => onAction(task.id)} />
              ))}
        </div>
      )}
    </div>
  )
}

// ─── Task Row (unchanged) ─────────────────────────────────────────────────────

function TaskRow({ task, canAct, onAction }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-overlay/50">
      <Users size={13} className="text-text-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-primary">User #{task.assignedUserId}</p>
        {task.remarks && <p className="text-[10px] text-text-muted truncate">{task.remarks}</p>}
        {task.actedAt && <p className="text-[10px] text-text-muted">{formatDate(task.actedAt)}</p>}
        {task.reassignedFromUserId && <p className="text-[10px] text-text-muted">Reassigned from #{task.reassignedFromUserId}</p>}
        {task.delegatedToUserId && <p className="text-[10px] text-text-muted">Delegated to #{task.delegatedToUserId}</p>}
      </div>
      <Badge value={task.status} label={task.status} colorTag={TASK_STATUS_COLOR[task.status] || 'gray'} />
      {canAct && <Button size="xs" variant="secondary" onClick={onAction}>Act</Button>}
    </div>
  )
}

// ─── Task Action Modal (unchanged) ────────────────────────────────────────────

function TaskActionModal({ taskId, stepInstance, onClose, onSubmit, isPending }) {
  const [actionType, setActionType] = useState('')
  const [remarks, setRemarks]       = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [targetStepId, setTargetStepId] = useState('')

  const needsTargetUser = ['REASSIGN','DELEGATE'].includes(actionType)
  const needsTargetStep = actionType === 'SEND_BACK'
  const requiresRemarks = ['REJECT','SEND_BACK','WITHDRAW','ESCALATE'].includes(actionType)

  const handleSubmit = () => {
    if (!actionType) { toast.error('Select an action'); return }
    if (requiresRemarks && !remarks.trim()) { toast.error('Remarks required for this action'); return }
    if (needsTargetUser && !targetUserId) { toast.error('Target user ID required'); return }
    onSubmit({
      taskInstanceId: taskId, actionType,
      remarks: remarks || undefined,
      targetUserId: targetUserId ? parseInt(targetUserId) : undefined,
      targetStepId: targetStepId ? parseInt(targetStepId) : undefined,
    })
  }

  return (
    <Modal open={true} onClose={onClose} title="Perform Task Action"
      subtitle={`Task #${taskId} · ${stepInstance.stepName || 'Step ' + stepInstance.stepOrder}`}
      size="sm"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} disabled={!actionType} onClick={handleSubmit}>
          {actionType || 'Submit'}
        </Button>
      </div>}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-2">Action</label>
          <div className="grid grid-cols-2 gap-2">
            {ACTION_TYPES.map(a => (
              <button key={a} onClick={() => setActionType(a)}
                className={cn('px-3 py-2 rounded-md border text-xs font-medium text-left transition-colors',
                  actionType === a ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                    : 'border-border text-text-muted hover:text-text-primary hover:bg-surface-overlay',
                  ACTION_COLOR[a])}>
                {a.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">
            Remarks {requiresRemarks && <span className="text-red-400">*</span>}
          </label>
          <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder="Add remarks or justification…"
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        {needsTargetUser && (
          <Input label="Target User ID *" type="number" value={targetUserId}
            onChange={e => setTargetUserId(e.target.value)} placeholder="e.g. 42" />
        )}
        {needsTargetStep && (
          <Input label="Target Step ID (blank = previous step)" type="number" value={targetStepId}
            onChange={e => setTargetStepId(e.target.value)} placeholder="leave blank for previous step" />
        )}
      </div>
    </Modal>
  )
}

// ─── Create Blueprint Modal (unchanged) ───────────────────────────────────────

function CreateBlueprintModal({ open, onClose }) {
  const { mutate: create, isPending } = useCreateBlueprint()
  const [form, setForm]     = useState({ name: '', entityType: '', description: '' })
  const [steps, setSteps]   = useState([{ name: '', stepOrder: 1, side: 'ORGANIZATION', approvalType: 'ANY_ONE', minApprovalsRequired: 1, slaHours: '', roleIds: [], users: [], userIds: [], automatedAction: null }])
  const [errors, setErrors] = useState({})

  const validate = () => {
    const e = {}
    if (!form.name.trim())       e.name = 'Required'
    if (!form.entityType.trim()) e.entityType = 'Required'
    if (steps.length === 0)      e.steps = 'At least one step required'
    steps.forEach((s, i) => { if (!s.name.trim()) e[`step_${i}`] = 'Step name required' })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleCreate = () => {
    if (!validate()) return
    create(
      { name: form.name, entityType: form.entityType, description: form.description, steps: stepsToPayload(steps) },
      {
        onSuccess: () => {
          onClose()
          setForm({ name: '', entityType: '', description: '' })
          setSteps([{ name: '', stepOrder: 1, side: 'ORGANIZATION', approvalType: 'ANY_ONE', minApprovalsRequired: 1, slaHours: '', roleIds: [], users: [], userIds: [], automatedAction: null }])
          setErrors({})
        }
      }
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="New Workflow Blueprint" size="lg"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={handleCreate}>Create Blueprint</Button>
      </div>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Workflow Name *" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Vendor Assessment" error={errors.name} />
          <Input label="Entity Type *" value={form.entityType}
            onChange={e => setForm(f => ({ ...f, entityType: e.target.value }))}
            placeholder="VENDOR | AUDIT | CONTRACT" error={errors.entityType} />
        </div>
        <Input label="Description" value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Optional description" />
        <div>
          <StepForm steps={steps} setSteps={setSteps} errors={errors} workflowId={null} />
        </div>
      </div>
    </Modal>
  )
}

// ─── Edit Blueprint Modal (unchanged) ─────────────────────────────────────────

function EditBlueprintModal({ blueprint, onClose }) {
  const { mutate: update, isPending } = useUpdateBlueprint()

  // Fetch live blueprint data so the step editor updates after CSV import.
  // When CsvImportModal invalidates ['workflow-blueprint', blueprint.id],
  // this query re-fetches and the useEffect below syncs the steps state.
  const { data: liveBlueprint } = useBlueprintDetail(blueprint.id)
  const currentBlueprint = liveBlueprint || blueprint

  const [form, setForm]     = useState({ name: blueprint.name, entityType: blueprint.entityType, description: blueprint.description || '' })
  const [steps, setSteps]   = useState(stepsToFormState(blueprint.steps || []))
  const [errors, setErrors] = useState({})

  // Sync steps whenever the live blueprint re-fetches (e.g. after CSV import)
  useEffect(() => {
    if (liveBlueprint?.steps) {
      setSteps(stepsToFormState(liveBlueprint.steps))
    }
  }, [liveBlueprint])

  const validate = () => {
    const e = {}
    if (!form.name.trim())       e.name = 'Required'
    if (!form.entityType.trim()) e.entityType = 'Required'
    steps.forEach((s, i) => { if (!s.name.trim()) e[`step_${i}`] = 'Step name required' })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleUpdate = () => {
    if (!validate()) return
    update(
      { id: currentBlueprint.id, data: { name: form.name, entityType: form.entityType, description: form.description, steps: stepsToPayload(steps) } },
      { onSuccess: onClose }
    )
  }

  return (
    <Modal open={true} onClose={onClose} title={`Edit Blueprint — ${currentBlueprint.name}`} size="lg"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={handleUpdate}>Save Changes</Button>
      </div>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Workflow Name *" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} error={errors.name} />
          <Input label="Entity Type *" value={form.entityType}
            onChange={e => setForm(f => ({ ...f, entityType: e.target.value }))} error={errors.entityType} />
        </div>
        <Input label="Description" value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <div>
          <StepForm steps={steps} setSteps={setSteps} errors={errors} workflowId={currentBlueprint.id} />
        </div>
      </div>
    </Modal>
  )
}