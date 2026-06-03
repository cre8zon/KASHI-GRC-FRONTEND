/**
 * WorkflowBlueprintDesigner — replaces the modal-based WorkflowPage blueprint editor.
 *
 * WHAT CHANGES vs current WorkflowPage:
 *   BEFORE: Blueprints list → click row → opens EditBlueprintModal (modal)
 *           Steps only visible inside the modal while editing
 *           Published blueprints show nothing beyond the row
 *           Creating a blueprint requires finishing it in one session (modal closes = lost)
 *
 *   AFTER:  Blueprints list (left panel, always visible)
 *           Click blueprint → full detail panel (right, always visible)
 *           Detail panel: Overview tab, Steps tab (inline editor, no modal), Settings tab
 *           Published view: all steps visible read-only inline, no deactivate needed
 *           DRAFT auto-saves via debounce (no "Save" anxiety on complex blueprints)
 *           Step editor: click step in timeline → step editor slides open in-panel (not modal)
 *           UI override editor per step (visibleTabs, editableFields, availableActions)
 *
 * BACKWARD COMPAT:
 *   WorkflowPage.jsx is NOT deleted. It still handles the Instances tab and non-admin views.
 *   This component replaces only the Blueprint designer portion.
 *   Add route: /admin/workflows/blueprints → WorkflowBlueprintDesigner
 *   Keep route: /admin/workflows → WorkflowPage (instances tab, org-user view)
 *
 * IMPORTS NEEDED IN APP.JSX:
 *   import WorkflowBlueprintDesigner from './pages/admin/workflows/WorkflowBlueprintDesigner'
 *   <Route path="/admin/workflows/blueprints" element={<WorkflowBlueprintDesigner />} />
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  GitBranch, Plus, Search, ChevronRight, ChevronDown,
  CheckCircle2, Clock, Users, Zap, Circle, X, Eye,
  Pencil, Trash2, Copy, ArrowUp, ArrowDown, Lock,
  Unlock, Settings, Info, AlertTriangle, Play, Pause,
  RefreshCw, Download, Upload, Save, MoreVertical,
  Shield, Flag, Tag, Link2, Layers, Activity,
  ChevronLeft, GripVertical, Hash,
} from 'lucide-react'
import { StepUiOverrideModal } from '../../../components/workflow/StepUiOverrideModal'
import { workflowsApi } from '../../../api/workflows.api'
import { PageLayout }   from '../../../components/layout/PageLayout'
import { Button }       from '../../../components/ui/Button'
import { Badge }        from '../../../components/ui/Badge'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Input }        from '../../../components/ui/Input'
import { cn }           from '../../../lib/cn'
import toast            from 'react-hot-toast'
import { StepForm, StepFormCard, stepsToFormState, stepsToPayload } from './StepForm'
import { WorkflowBlueprintImportModal } from './WorkflowBlueprintImportModal'

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useBlueprints = (params) => useQuery({
  queryKey: ['wf-blueprints', params],
  queryFn: () => workflowsApi.blueprints.list(params),
  keepPreviousData: true,
})
const useBlueprintDetail = (id) => useQuery({
  queryKey: ['wf-blueprint', id],
  queryFn: () => workflowsApi.blueprints.get(id),
  enabled: !!id,
})

function useCreate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: workflowsApi.blueprints.create,
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['wf-blueprints'] }); toast.success('Blueprint created') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
}
function useUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => workflowsApi.blueprints.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['wf-blueprints'] })
      qc.invalidateQueries({ queryKey: ['wf-blueprint', id] })
      toast.success('Saved')
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to save'),
  })
}
function useActivate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => workflowsApi.blueprints.activate(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['wf-blueprints'] })
      qc.invalidateQueries({ queryKey: ['wf-blueprint', id] })
      toast.success('Blueprint activated')
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Activation failed'),
  })
}
function useDeactivate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => workflowsApi.blueprints.deactivate(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['wf-blueprints'] })
      qc.invalidateQueries({ queryKey: ['wf-blueprint', id] })
      toast.success('Deactivated')
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
}
function useDelete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => workflowsApi.blueprints.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wf-blueprints'] }); toast.success('Deleted') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
}
function useCreateVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => workflowsApi.blueprints.createVersion(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wf-blueprints'] }); toast.success('New version created') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDE_COLOR = {
  ORGANIZATION: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
  VENDOR:       'text-purple-400 bg-purple-500/10 border-purple-500/25',
  AUDITOR:      'text-amber-400 bg-amber-500/10 border-amber-500/25',
  AUDITEE:      'text-teal-400 bg-teal-500/10 border-teal-500/25',
  SYSTEM:       'text-gray-400 bg-gray-500/10 border-gray-500/25',
}
const ACTION_COLOR = {
  FILL:        'text-blue-400',
  REVIEW:      'text-purple-400',
  APPROVE:     'text-green-400',
  ASSIGN:      'text-amber-400',
  ACKNOWLEDGE: 'text-teal-400',
  EVALUATE:    'text-orange-400',
  GENERATE:    'text-pink-400',
  CUSTOM:      'text-gray-400',
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkflowBlueprintDesigner() {
  const [search, setSearch]       = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useBlueprints({ search, take: 200 })
  const blueprints = data?.items || data?.data || data || []

  return (
    <PageLayout
      title="Workflow blueprints"
      subtitle="Design, version, and publish workflow blueprints"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={RefreshCw}
            onClick={() => {}} />
          <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
            New blueprint
          </Button>
        </div>
      }
    >
      <div className="flex h-full overflow-hidden">

        {/* ── Left: Blueprint list ─────────────────────────────────────── */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search blueprints…"
                className="w-full pl-8 pr-3 h-7 text-xs bg-surface-overlay border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading && <p className="p-4 text-xs text-text-muted">Loading…</p>}
            {!isLoading && blueprints.length === 0 && (
              <div className="p-6 text-center flex flex-col items-center gap-3">
                <GitBranch size={24} className="text-text-muted" />
                <div>
                  <p className="text-xs font-medium text-text-secondary">No blueprints yet</p>
                  <p className="text-[11px] text-text-muted mt-0.5">Create your first workflow</p>
                </div>
                <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>Create</Button>
              </div>
            )}
            {blueprints.map(bp => (
              <BlueprintListItem
                key={bp.id}
                bp={bp}
                selected={selectedId === bp.id}
                onClick={() => setSelectedId(bp.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Right: Detail panel ──────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          {!selectedId
            ? <EmptyDetail onNew={() => setCreateOpen(true)} />
            : <BlueprintDesignerPanel
                key={selectedId}
                blueprintId={selectedId}
                onDeleted={() => setSelectedId(null)}
              />
          }
        </div>
      </div>

      {/* Create modal — kept as modal because it's just 3 fields before the step canvas opens */}
      <CreateBlueprintModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(id) => { setCreateOpen(false); setSelectedId(id) }}
      />
    </PageLayout>
  )
}

// ─── Blueprint list item ──────────────────────────────────────────────────────

function BlueprintListItem({ bp, selected, onClick }) {
  return (
    <button onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
        'border-b border-border/50 border-l-2',
        selected
          ? 'bg-brand-500/8 border-l-brand-500'
          : 'border-l-transparent hover:bg-surface-overlay'
      )}
    >
      <div className={cn(
        'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold border',
        bp.isActive ? 'bg-green-500/10 text-green-400 border-green-500/25' : 'bg-surface-overlay text-text-muted border-border'
      )}>
        {bp.isActive ? <Play size={11} /> : <GitBranch size={11} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text-primary truncate">{bp.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] font-mono text-text-muted">{bp.entityType}</span>
          <span className="text-[10px] text-text-muted">v{bp.version}</span>
          {bp.steps?.length > 0 && (
            <span className="text-[10px] text-text-muted">{bp.steps.length} steps</span>
          )}
        </div>
      </div>
      <div className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-2',
        bp.isActive ? 'bg-green-400' : 'bg-amber-400')} />
    </button>
  )
}

// ─── Blueprint Designer Panel ─────────────────────────────────────────────────

const DETAIL_TABS = [
  { key: 'steps',    label: 'Steps',    icon: GitBranch },
  { key: 'overview', label: 'Overview', icon: Eye },
  { key: 'settings', label: 'Settings', icon: Settings },
]

function BlueprintDesignerPanel({ blueprintId, onDeleted }) {
  const [tab, setTab]           = useState('steps')
  const [selectedStep, setSelectedStep] = useState(null)  // step index being edited
  const [editMode, setEditMode]  = useState(false)
  const [localSteps, setLocalSteps] = useState(null)   // null = not editing
  const [deleteTarget, setDeleteTarget] = useState(false)
  const [importOpen,   setImportOpen]   = useState(false)

  const { data: res, isLoading } = useBlueprintDetail(blueprintId)
  const bp = res?.data || res

  const qc           = useQueryClient()
  const updateMut    = useUpdate()
  const activateMut  = useActivate()
  const deactivateMut= useDeactivate()
  const deleteMut    = useDelete()
  const versionMut   = useCreateVersion()

  // When blueprint loads, sync local steps (used for editing)
  useEffect(() => {
    if (bp?.steps) setLocalSteps(stepsToFormState(bp.steps))
  }, [bp?.id])

  const isPublished = bp?.isActive
  const isDraft     = !isPublished

  const handleSave = useCallback(() => {
    if (!bp || !localSteps) return
    updateMut.mutate({
      id: bp.id,
      data: {
        name:        bp.name,
        entityType:  bp.entityType,
        description: bp.description,
        steps:       stepsToPayload(localSteps),
      }
    }, {
      onSuccess: () => { setEditMode(false); setSelectedStep(null) }
    })
  }, [bp, localSteps, updateMut])

  if (isLoading) return <div className="flex items-center justify-center h-full text-xs text-text-muted">Loading…</div>
  if (!bp) return null

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-text-primary">{bp.name}</h2>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium',
              isPublished ? 'bg-green-500/10 text-green-400 border-green-500/25' : 'bg-amber-500/10 text-amber-400 border-amber-500/25')}>
              {isPublished ? 'Published' : 'Draft'}
            </span>
            <span className="text-[10px] font-mono text-text-muted px-1.5 py-0.5 rounded bg-surface-overlay border border-border">
              v{bp.version}
            </span>
            <span className="text-[10px] font-mono text-brand-400 px-1.5 py-0.5 rounded bg-brand-500/10">
              {bp.entityType}
            </span>
          </div>
          {bp.description && (
            <p className="text-xs text-text-muted mt-0.5 truncate max-w-xl">{bp.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {editMode && isDraft && (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setEditMode(false); setSelectedStep(null) }}>
                Cancel
              </Button>
              <Button size="sm" icon={Save} loading={updateMut.isPending} onClick={handleSave}>
                Save draft
              </Button>
            </>
          )}
          {isDraft && (
            <Button variant="secondary" size="sm" icon={Upload}
              onClick={() => setImportOpen(true)}>
              Import steps
            </Button>
          )}
          {!editMode && isDraft && (
            <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditMode(true)}>
              Edit
            </Button>
          )}
          {isPublished && (
            <Button variant="secondary" size="sm" icon={Pause}
              loading={deactivateMut.isPending}
              onClick={() => deactivateMut.mutate(bp.id)}>
              Unpublish
            </Button>
          )}
          {isDraft && (
            <Button size="sm" icon={Play}
              loading={activateMut.isPending}
              onClick={() => activateMut.mutate(bp.id)}>
              Publish
            </Button>
          )}
          {isPublished && (
            <Button variant="secondary" size="sm" icon={Copy}
              loading={versionMut.isPending}
              onClick={() => versionMut.mutate(bp.id)}>
              New version
            </Button>
          )}
          <button
            onClick={() => setDeleteTarget(true)}
            className="h-8 w-8 flex items-center justify-center rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-6 border-b border-border shrink-0">
        {DETAIL_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}>
            <t.icon size={12} /> {t.label}
          </button>
        ))}
        {/* Step count pill */}
        <span className="ml-auto text-[10px] text-text-muted pr-2">
          {(localSteps || bp.steps || []).length} steps
          {editMode && isDraft && <span className="text-amber-400 ml-2">· editing</span>}
        </span>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {tab === 'steps' && (
          <StepsTab
            bp={bp}
            localSteps={localSteps}
            setLocalSteps={setLocalSteps}
            selectedStep={selectedStep}
            setSelectedStep={setSelectedStep}
            editMode={editMode && isDraft}
            isPublished={isPublished}
          />
        )}
        {tab === 'overview' && <OverviewTab bp={bp} />}
        {tab === 'settings' && <SettingsTab bp={bp} onSave={(data) => updateMut.mutate({ id: bp.id, data })} saving={updateMut.isPending} />}
      </div>

      <WorkflowBlueprintImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        blueprintId={bp.id}
        blueprintName={bp.name}
        onImported={() => {
          setImportOpen(false)
          qc.invalidateQueries({ queryKey: ['wf-blueprint', bp.id] })
          qc.invalidateQueries({ queryKey: ['wf-blueprints'] })
        }}
      />
      <ConfirmDialog
        open={deleteTarget}
        onClose={() => setDeleteTarget(false)}
        onConfirm={() => deleteMut.mutate(bp.id, { onSuccess: onDeleted })}
        loading={deleteMut.isPending}
        title="Delete blueprint"
        message={`Delete "${bp.name}" v${bp.version}? This cannot be undone. Active workflow instances are unaffected.`}
      />
    </div>
  )
}

// ─── Steps Tab — the main designer ───────────────────────────────────────────

function StepsTab({ bp, localSteps, setLocalSteps, selectedStep, setSelectedStep, editMode, isPublished }) {
  const steps = localSteps || stepsToFormState(bp.steps || [])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Step list / timeline */}
      <div className={cn(
        'overflow-y-auto flex flex-col',
        selectedStep !== null ? 'w-80 shrink-0 border-r border-border' : 'flex-1'
      )}>
        {/* Published read-only banner */}
        {isPublished && !editMode && (
          <div className="flex items-center gap-2 mx-4 mt-4 mb-2 px-3 py-2 rounded-lg bg-green-500/5 border border-green-500/20 text-xs text-green-300">
            <Lock size={12} /> Published — unpublish to edit steps
          </div>
        )}

        {/* Step list */}
        <div className="p-4 space-y-0">
          {steps.map((step, idx) => (
            <StepTimelineRow
              key={idx}
              step={step}
              index={idx}
              total={steps.length}
              selected={selectedStep === idx}
              editMode={editMode}
              onClick={() => setSelectedStep(selectedStep === idx ? null : idx)}
              onMoveUp={editMode ? () => {
                const s = [...steps]
                ;[s[idx - 1], s[idx]] = [s[idx], s[idx - 1]]
                setLocalSteps(s)
              } : null}
              onMoveDown={editMode ? () => {
                const s = [...steps]
                ;[s[idx], s[idx + 1]] = [s[idx + 1], s[idx]]
                setLocalSteps(s)
              } : null}
              onDelete={editMode ? () => {
                setLocalSteps(steps.filter((_, i) => i !== idx))
                if (selectedStep === idx) setSelectedStep(null)
              } : null}
            />
          ))}

          {/* Add step button (edit mode only) */}
          {editMode && (
            <button
              onClick={() => {
                const newStep = {
                  name: '', stepOrder: steps.length + 1,
                  side: 'ORGANIZATION', approvalType: 'ANY_ONE',
                  minApprovalsRequired: 1, slaHours: '',
                  roleIds: [], users: [], userIds: [],
                  automatedAction: null, stepAction: null,
                }
                setLocalSteps([...steps, newStep])
                setSelectedStep(steps.length)
              }}
              className="flex items-center gap-2 w-full px-4 py-3 text-xs text-text-muted hover:text-brand-400 hover:bg-brand-500/5 rounded-lg border border-dashed border-border hover:border-brand-500/30 transition-colors mt-3"
            >
              <Plus size={13} /> Add step
            </button>
          )}
        </div>
      </div>

      {/* Step editor panel */}
      {selectedStep !== null && steps[selectedStep] && (
        <div className="flex-1 overflow-y-auto">
          <StepEditorPanel
            step={steps[selectedStep]}
            index={selectedStep}
            editMode={editMode}
            isPublished={isPublished}
            blueprintEntityType={bp.entityType}
            onChange={editMode ? (updated) => {
              const s = [...steps]
              s[selectedStep] = updated
              setLocalSteps(s)
            } : null}
            onClose={() => setSelectedStep(null)}
          />
        </div>
      )}
    </div>
  )
}

// ─── Step Timeline Row ────────────────────────────────────────────────────────

function StepTimelineRow({ step, index, total, selected, editMode, onClick, onMoveUp, onMoveDown, onDelete }) {
  const isSystem = step.side === 'SYSTEM'
  const sideStyle = SIDE_COLOR[step.side] || SIDE_COLOR.ORGANIZATION
  const actionColor = ACTION_COLOR[step.stepAction] || 'text-text-muted'

  return (
    <div className="relative flex gap-3">
      {/* Connector line */}
      <div className="flex flex-col items-center shrink-0 w-8">
        <div className={cn(
          'w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 mt-1',
          selected ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-border bg-surface-overlay text-text-muted'
        )}>
          {index + 1}
        </div>
        {index < total - 1 && (
          <div className="w-0.5 flex-1 bg-border min-h-4 mt-1 mb-0" />
        )}
      </div>

      {/* Step card */}
      <button
        onClick={onClick}
        className={cn(
          'flex-1 min-w-0 flex items-start gap-3 px-3 py-3 rounded-lg border transition-all mb-3 text-left group',
          selected
            ? 'border-brand-500/40 bg-brand-500/5'
            : 'border-border hover:border-border-strong bg-surface-overlay hover:bg-surface-raised'
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-text-primary truncate">
              {step.name || <span className="text-text-muted italic">Unnamed step</span>}
            </span>
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-medium shrink-0', sideStyle)}>
              {step.side}
            </span>
            {step.stepAction && (
              <span className={cn('text-[10px] font-medium shrink-0', actionColor)}>
                {step.stepAction}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted">
            {step.roleIds?.length > 0 && (
              <span className="flex items-center gap-1">
                <Users size={10} /> {step.roleIds.length} role{step.roleIds.length > 1 ? 's' : ''}
              </span>
            )}
            {step.slaHours && (
              <span className="flex items-center gap-1">
                <Clock size={10} /> {step.slaHours}h SLA
              </span>
            )}
            {isSystem && step.automatedAction && (
              <span className="flex items-center gap-1 text-gray-400">
                <Zap size={10} /> {step.automatedAction}
              </span>
            )}
            {step.sections?.length > 0 && (
              <span className="flex items-center gap-1">
                <Layers size={10} /> {step.sections.length} section{step.sections.length > 1 ? 's' : ''}
              </span>
            )}
            {step.approvalType && step.approvalType !== 'ANY_ONE' && (
              <span>{step.approvalType}</span>
            )}
          </div>
        </div>

        {/* Move / delete controls (edit mode) */}
        {editMode && (
          <div className="flex flex-col gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={e => e.stopPropagation()}>
            <button disabled={index === 0} onClick={onMoveUp}
              className="h-5 w-5 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ArrowUp size={10} />
            </button>
            <button disabled={index === total - 1} onClick={onMoveDown}
              className="h-5 w-5 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ArrowDown size={10} />
            </button>
            <button onClick={onDelete}
              className="h-5 w-5 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 size={10} />
            </button>
          </div>
        )}

        {/* Expand indicator */}
        <ChevronRight size={13} className={cn('shrink-0 text-text-muted transition-transform mt-0.5', selected && 'rotate-90')} />
      </button>
    </div>
  )
}

// ─── Step Editor Panel — uses StepFormCard for full parity with WorkflowPage ──
//
// StepFormCard already has: RoleSelector, UserSelector, NavKeyPicker,
// StepActionSelector, AssignerResolutionSelector, ObserverRolesSelector,
// AutomatedActionSelector, and StepSectionEditor. Rather than reimplementing
// all of that, we embed the same component that WorkflowPage uses.
//
// Read-only mode: when editMode=false, fields are disabled via the errors prop
// being empty and onChange being null. The card still renders all configured
// values clearly for inspection.

function StepEditorPanel({ step, index, editMode, isPublished, onChange, onClose, blueprintEntityType }) {
  const [overrideModalOpen, setOverrideModalOpen] = useState(false)

  // StepFormCard needs total > 1 to show the remove button — pass 2 as sentinel
  // and no-op onRemove when we don't actually want to remove from here
  const handleChange = (updated) => onChange?.(updated)

  return (
    <div className="h-full flex flex-col">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <div>
          <p className="text-xs font-semibold text-text-primary">
            Step {index + 1}: {step.name || 'Untitled'}
          </p>
          <p className="text-[10px] text-text-muted mt-0.5">
            {editMode ? 'Editing — all changes saved when you click "Save draft"' : 'Read-only — unpublish to edit steps'}
          </p>
        </div>
        <button onClick={onClose}
          className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Read-only banner — different message for published vs draft-not-editing */}
      {!editMode && isPublished && (
        <div className="flex items-center gap-2 mx-4 mt-3 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300 shrink-0">
          <Lock size={11} /> Published — click "Unpublish" in the header to edit steps
        </div>
      )}
      {!editMode && !isPublished && (
        <div className="flex items-center gap-2 mx-4 mt-3 px-3 py-2 rounded-lg bg-brand-500/5 border border-brand-500/20 text-xs text-brand-300 shrink-0">
          <Eye size={11} /> Viewing step — click "Edit" in the header to make changes
        </div>
      )}

      {/* StepFormCard renders the full form with roles, nav keys, sections, etc.
          Pass editMode=false by removing onChange → all sub-selectors go read-only */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className={editMode ? '' : 'pointer-events-none opacity-80'}>
          <StepFormCard
            step={step}
            index={index}
            total={2}
            errors={{}}
            onChange={editMode ? handleChange : () => {}}
            onRemove={() => {}}
            dragHandleProps={{}}
          />
        </div>

        {/* UI access override — separate from StepFormCard since it opens a modal */}
        {step.side !== 'SYSTEM' && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Shield size={12} className="text-purple-400" />
                <span className="text-xs font-semibold text-text-secondary">UI access override</span>
                {step.stepUiOverrideJson && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25">
                    Active
                  </span>
                )}
              </div>
              {editMode && (
                <button
                  onClick={() => setOverrideModalOpen(true)}
                  className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors px-2.5 py-1 rounded-md border border-purple-500/30 hover:bg-purple-500/10"
                >
                  <Shield size={11} />
                  {step.stepUiOverrideJson ? 'Edit override' : 'Configure'}
                </button>
              )}
            </div>
            <p className="text-[10px] text-text-muted">
              Restrict which tabs, fields, and actions actors see on this step.
            </p>
            {step.stepUiOverrideJson && (() => {
              let parsed = {}
              try { parsed = JSON.parse(step.stepUiOverrideJson) } catch {}
              return (
                <div className="mt-2 flex flex-wrap gap-1">
                  {parsed.visibleTabs?.length > 0 && <code className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">tabs: {parsed.visibleTabs.join(',')}</code>}
                  {parsed.hiddenTabs?.length > 0 && <code className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">hidden: {parsed.hiddenTabs.join(',')}</code>}
                  {parsed.editableFields?.length > 0 && <code className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">editable: {parsed.editableFields.length} fields</code>}
                  {parsed.readOnlyFields?.length > 0 && <code className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">readonly: {parsed.readOnlyFields.length} fields</code>}
                  {parsed.availableActions?.length > 0 && <code className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">actions: {parsed.availableActions.join(',')}</code>}
                </div>
              )
            })()}

            {editMode && (
              <StepUiOverrideModal
                open={overrideModalOpen}
                onClose={() => setOverrideModalOpen(false)}
                value={step.stepUiOverrideJson}
                entityType={blueprintEntityType}
                onChange={(json) => {
                  onChange?.({ ...step, stepUiOverrideJson: json })
                  setOverrideModalOpen(false)
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Legacy inline helpers — kept for OverviewTab and SettingsTab only ────────

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ bp }) {
  const steps = bp.steps || []
  const sides = [...new Set(steps.map(s => s.side || s.snapSide).filter(Boolean))]
  const totalSteps = steps.length
  const systemSteps = steps.filter(s => (s.side || s.snapSide) === 'SYSTEM').length
  const humanSteps  = totalSteps - systemSteps

  return (
    <div className="p-6 space-y-6 max-w-2xl overflow-y-auto h-full">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total steps', value: totalSteps, icon: GitBranch },
          { label: 'Human steps', value: humanSteps, icon: Users },
          { label: 'Automated', value: systemSteps, icon: Zap },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-overlay">
            <s.icon size={16} className="text-brand-400" />
            <div>
              <div className="text-sm font-semibold text-text-primary">{s.value}</div>
              <div className="text-[10px] text-text-muted">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Sides involved */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Sides involved</p>
        <div className="flex flex-wrap gap-2">
          {sides.map(side => (
            <span key={side} className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', SIDE_COLOR[side] || 'text-text-muted border-border')}>
              {side}
            </span>
          ))}
        </div>
      </div>

      {/* Step action breakdown */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Step actions</p>
        <div className="flex flex-wrap gap-1.5">
          {steps.map((s, i) => {
            const action = s.stepAction || s.snapStepAction
            return action ? (
              <span key={i} className={cn('text-[11px] px-2 py-0.5 rounded border', 'bg-surface-overlay border-border', ACTION_COLOR[action])}>
                {i + 1}. {action}
              </span>
            ) : null
          })}
        </div>
      </div>

      {/* Compliance workflow note */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <Info size={13} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-300">
          This blueprint works for any entity type — including compliance workflows that don't map to a module blueprint
          (e.g. SOC2_CONTROL, ISO_REQUIREMENT). The workflow engine only reads entityType for routing, not for module existence.
        </p>
      </div>
    </div>
  )
}

// ─── Settings Tab ────────────────────────────────────────────────────────────

function SettingsTab({ bp, onSave, saving }) {
  const [form, setForm] = useState({ name: bp.name, entityType: bp.entityType, description: bp.description || '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="p-6 space-y-4 max-w-lg overflow-y-auto h-full">
      <div>
        <label className="text-xs font-medium text-text-secondary block mb-1">Blueprint name</label>
        <input value={form.name} onChange={e => set('name', e.target.value)}
          className={inputCls} />
      </div>
      <div>
        <label className="text-xs font-medium text-text-secondary block mb-1">Entity type</label>
        <input value={form.entityType} onChange={e => set('entityType', e.target.value.toUpperCase().replace(/\s/g, '_'))}
          className={cn(inputCls, 'font-mono')} />
        <p className="text-[10px] text-text-muted mt-0.5">
          Must match WorkflowInstance.entityType. Can be any string — doesn't require a module blueprint.
        </p>
      </div>
      <div>
        <label className="text-xs font-medium text-text-secondary block mb-1">Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
          className={textareaCls} placeholder="What this workflow is for…" />
      </div>
      <Button size="sm" loading={saving} onClick={() => onSave(form)}>Save settings</Button>

      <div className="pt-4 border-t border-border">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Blueprint info</p>
        <div className="space-y-1.5 text-xs">
          {[
            ['ID', bp.id],
            ['Version', `v${bp.version}`],
            ['Status', bp.isActive ? 'Published' : 'Draft'],
            ['Created', bp.createdAt ? new Date(bp.createdAt).toLocaleDateString() : '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="text-text-muted w-20">{k}</span>
              <span className="text-text-secondary font-mono">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Create modal (only 3 fields — small enough for a modal) ─────────────────

function CreateBlueprintModal({ open, onClose, onCreate }) {
  const createMut = useCreate()
  const [form, setForm] = useState({ name: '', entityType: '', description: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handle = () => {
    if (!form.name.trim() || !form.entityType.trim()) return toast.error('Name and entity type are required')
    createMut.mutate(
      { name: form.name, entityType: form.entityType, description: form.description, steps: [] },
      { onSuccess: (res) => {
          const id = res?.data?.id || res?.id
          setForm({ name: '', entityType: '', description: '' })
          onCreate(id)
        }
      }
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="New workflow blueprint" size="sm"
      subtitle="You'll add steps in the designer after creation"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={createMut.isPending} onClick={handle}>Create</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Blueprint name <span className="text-red-400">*</span></label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="e.g. Risk Management Workflow"
            className={inputCls} autoFocus />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Entity type <span className="text-red-400">*</span></label>
          <input value={form.entityType} onChange={e => set('entityType', e.target.value.toUpperCase().replace(/\s/g, '_'))}
            placeholder="RISK"
            className={cn(inputCls, 'font-mono')} />
          <p className="text-[10px] text-text-muted mt-0.5">UPPER_SNAKE_CASE — any string, not required to match a module</p>
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Description</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
            placeholder="Optional — describe what this workflow covers"
            className={textareaCls} />
        </div>
      </div>
    </Modal>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyDetail({ onNew }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
      <div className="w-16 h-16 rounded-2xl border border-dashed border-border flex items-center justify-center bg-surface-overlay">
        <GitBranch size={24} className="text-text-muted" />
      </div>
      <div>
        <p className="text-sm font-medium text-text-secondary">Select a blueprint</p>
        <p className="text-xs text-text-muted mt-1 max-w-xs">
          Click a blueprint in the list to open the designer, or create a new one.
          Published blueprints show all steps in read-only mode — no need to unpublish just to view.
        </p>
      </div>
      <Button size="sm" icon={Plus} onClick={onNew}>New blueprint</Button>
    </div>
  )
}

// ─── Small layout helpers ─────────────────────────────────────────────────────

function Section({ title, hint, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{title}</p>
        {hint && <span className="text-[10px] text-text-muted">— {hint}</span>}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-text-muted block mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        {hint && <span className="ml-1 font-normal opacity-70">— {hint}</span>}
      </label>
      {children}
    </div>
  )
}

function ReadValue({ children, mono, muted }) {
  if (!children) return <span className="text-xs text-text-muted italic">not set</span>
  return (
    <span className={cn('text-xs', mono ? 'font-mono text-brand-400' : muted ? 'text-text-muted' : 'text-text-primary')}>
      {children}
    </span>
  )
}

// CSS class helpers (avoid repetition)
const inputCls = 'w-full h-8 px-3 text-xs bg-surface-overlay border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 placeholder:text-text-muted'
const textareaCls = 'w-full px-3 py-2 text-xs bg-surface-overlay border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none'
const selectCls = 'w-full h-8 px-2 text-xs bg-surface-overlay border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500'