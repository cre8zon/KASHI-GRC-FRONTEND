/**
 * CompoundSectionRenderer — generic compound task section + item renderer.
 *
 * Replaces hardcoded section rendering in new modules.
 * TPRM (VendorAssessmentFillPage) is completely untouched — it stays hardcoded.
 *
 * HOW IT WORKS:
 *   1. Receives sections from useCompoundTaskProgress() — each section now has
 *      sectionScreenKey, itemScreenKey, itemRefType, sectionUiJson, itemUiJson, items[]
 *
 *   2. For each section:
 *      a. Fetches GET /v1/ui-config/screen/:sectionScreenKey → section container config
 *      b. Merges sectionUiJson on top of that config
 *      c. Renders: header, assignment controls, item cards, submit button
 *
 *   3. For each item inside a section:
 *      a. Fetches GET /v1/ui-config/screen/:itemScreenKey → item card config (once, cached)
 *      b. Merges itemUiJson on top of that config
 *      c. Renders: DynamicForm fields, action buttons, ItemPanel (comments/evidence/action items)
 *
 *   4. Item-level action item creation:
 *      "Assign to…" button creates an action item with navContext pointing back to this task
 *
 * BACKWARD COMPAT:
 *   When section.sectionScreenKey is null → renders CompoundTaskProgress (existing behavior).
 *   This means all existing TPRM tasks keep working exactly as before.
 *
 * INTEGRATION in TaskDetailPage.jsx:
 *   Replace:
 *     <CompoundTaskProgress sections={sections} />
 *   With:
 *     {sections.some(s => s.sectionScreenKey)
 *       ? <CompoundSectionRenderer
 *           taskInstanceId={task.id}
 *           sections={sections}
 *           viewContext={accessContext}
 *           entityType={task.entityType}
 *           entityId={task.entityId}
 *         />
 *       : <CompoundTaskProgress sections={sections} />
 *     }
 */

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, Circle, ChevronDown, ChevronRight,
  Users, Plus, AlertTriangle, Loader2, Check,
  Lock, Send, RefreshCw, UserPlus, Flag,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Progress, Callout } from '../ui/ui-primitives'
import { CompoundTaskProgress } from './CompoundTaskProgress'
import { ItemPanel } from '../item-panel/ItemPanel'
import { DynamicForm } from '../forms/DynamicForm'
import { cn } from '../../lib/cn'
import { actionItemsApi } from '../../api/actionItems.api'
import api from '../../config/axios.config'
import toast from 'react-hot-toast'

// ─── Screen config hook ───────────────────────────────────────────────────────

function useScreenConfig(screenKey) {
  return useQuery({
    queryKey: ['screen-config', screenKey],
    queryFn: () => api.get(`/v1/ui-config/screen/${screenKey}`).then(r => r.data?.data || r.data),
    enabled: !!screenKey,
    staleTime: 5 * 60 * 1000,  // screen configs are stable — cache 5 minutes
  })
}

// ─── Merge screen config with inline UI JSON override ────────────────────────

function mergeConfig(screenConfig, uiJson) {
  if (!screenConfig && !uiJson) return {}
  const base = screenConfig || {}
  if (!uiJson) return base
  try {
    const override = typeof uiJson === 'string' ? JSON.parse(uiJson) : uiJson
    return { ...base, ...override }
  } catch {
    return base
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CompoundSectionRenderer({
  taskInstanceId,
  sections = [],
  viewContext,
  entityType,
  entityId,
}) {
  const qc = useQueryClient()

  // For sections without a screenKey, fall back to CompoundTaskProgress
  const hasGenericSections = sections.some(s => !s.sectionScreenKey)
  const configuredSections = sections.filter(s => !!s.sectionScreenKey)
  const fallbackSections   = sections.filter(s => !s.sectionScreenKey)

  return (
    <div className="space-y-4">
      {/* Fallback: CompoundTaskProgress for sections without screenKey (TPRM compat) */}
      {fallbackSections.length > 0 && (
        <CompoundTaskProgress sections={fallbackSections} />
      )}

      {/* Generic renderer for sections with screenKey */}
      {configuredSections.map(section => (
        <SectionCard
          key={section.sectionKey}
          section={section}
          taskInstanceId={taskInstanceId}
          viewContext={viewContext}
          entityType={entityType}
          entityId={entityId}
          onRefresh={() => qc.invalidateQueries({ queryKey: ['compound-progress', taskInstanceId] })}
        />
      ))}
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ section, taskInstanceId, viewContext, entityType, entityId, onRefresh }) {
  const [expanded, setExpanded] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const { data: rawScreenConfig } = useScreenConfig(section.sectionScreenKey)
  const sectionConfig = useMemo(
    () => mergeConfig(rawScreenConfig, section.sectionUiJson),
    [rawScreenConfig, section.sectionUiJson]
  )

  const submitMut = useMutation({
    mutationFn: () => api.post(
      `/v1/compound-tasks/${taskInstanceId}/sections/${section.sectionKey}/complete`
    ),
    onSuccess: () => { toast.success('Section submitted'); onRefresh?.() },
    onError: (e) => toast.error(e?.response?.data?.message || 'Submit failed'),
  })

  const canEdit  = viewContext?.canEdit !== false && !section.completed
  const canSubmit = canEdit && section.itemsTotal === section.itemsCompleted

  const pct = section.itemsTotal > 0
    ? Math.round((section.itemsCompleted / section.itemsTotal) * 100)
    : section.completed ? 100 : 0

  return (
    <div className={cn(
      'rounded-xl border transition-colors',
      section.completed ? 'border-green-500/25 bg-green-500/3' : 'border-border bg-surface-raised'
    )}>
      {/* Section header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        {section.completed
          ? <CheckCircle2 size={16} className="text-green-400 shrink-0" />
          : <Circle size={16} className={cn('shrink-0', section.required ? 'text-text-muted' : 'text-text-muted/40')} />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={cn('text-sm font-medium',
              section.completed ? 'text-text-muted line-through' : 'text-text-primary')}>
              {section.label}
            </p>
            {!section.required && (
              <span className="text-[10px] text-text-muted bg-surface-overlay px-1.5 py-0.5 rounded">optional</span>
            )}
            {section.completed && (
              <Badge value="DONE" label="Done" colorTag="green" />
            )}
          </div>
          {section.description && (
            <p className="text-xs text-text-muted mt-0.5">{section.description}</p>
          )}
        </div>

        {/* Mini progress */}
        {section.tracksItems && section.itemsTotal > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-text-muted">
              {section.itemsCompleted}/{section.itemsTotal}
            </span>
            <div className="w-16 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {expanded
          ? <ChevronDown size={14} className="text-text-muted shrink-0" />
          : <ChevronRight size={14} className="text-text-muted shrink-0" />
        }
      </button>

      {/* Section body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">

          {/* Assignment panel (Case 2) */}
          {sectionConfig.showAssignmentPanel && section.requiresAssignment && !section.completed && (
            <SectionAssignmentPanel
              taskInstanceId={taskInstanceId}
              sectionKey={section.sectionKey}
              sectionLabel={section.label}
              assigneesTotal={section.assigneesTotal}
              assigneesCompleted={section.assigneesCompleted}
              canEdit={canEdit}
              onAssigned={onRefresh}
            />
          )}

          {/* Item list (Case 3) */}
          {section.tracksItems && (section.items || []).length > 0 && (
            <div className="space-y-2">
              {(section.items || []).map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  section={section}
                  taskInstanceId={taskInstanceId}
                  viewContext={viewContext}
                  entityType={entityType}
                  canEdit={canEdit}
                  onComplete={onRefresh}
                />
              ))}
            </div>
          )}

          {/* Submit button */}
          {!section.completed && canEdit && (
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              {section.tracksItems && section.itemsTotal > 0 && !canSubmit && (
                <p className="text-xs text-text-muted">
                  Complete all items before submitting
                </p>
              )}
              <Button
                size="sm"
                icon={Send}
                loading={submitMut.isPending}
                disabled={section.tracksItems && !canSubmit}
                onClick={() => submitMut.mutate()}
                className="ml-auto"
              >
                {sectionConfig.submitLabel || 'Submit section'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function ItemCard({ item, section, taskInstanceId, viewContext, entityType, canEdit, onComplete }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const qc = useQueryClient()

  const { data: rawItemConfig } = useScreenConfig(section.itemScreenKey)
  const itemConfig = useMemo(
    () => mergeConfig(rawItemConfig, section.itemUiJson),
    [rawItemConfig, section.itemUiJson]
  )

  const completeMut = useMutation({
    mutationFn: () => api.post(
      `/v1/compound-tasks/${taskInstanceId}/sections/${section.sectionKey}/items/${item.id}/complete`,
      { outcome: 'COMPLETED' }
    ),
    onSuccess: () => { toast.success('Item completed'); onComplete?.() },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  const createActionItemMut = useMutation({
    mutationFn: (assigneeId) => actionItemsApi.create({
      entityType:       section.itemRefType,
      entityId:         item.itemRefId,
      parentEntityType: entityType,
      parentEntityId:   null,   // caller sets if needed
      sourceType:       'WORKFLOW_STEP',
      sourceId:         taskInstanceId,
      assignedTo:       assigneeId,
      title:            `Complete: ${item.itemLabel}`,
      itemScreenKey:    section.itemScreenKey,
      itemUiJson:       section.itemUiJson,
      navContext:       JSON.stringify({
        route:       `/workflow/tasks/${taskInstanceId}`,
        sectionKey:  section.sectionKey,
        itemId:      item.id,
        itemRefType: section.itemRefType,
        itemRefId:   item.itemRefId,
      }),
    }),
    onSuccess: () => { toast.success('Action item created'); setAssignOpen(false) },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  const isComplete = item.status === 'COMPLETED'
  const canDelegate = itemConfig.canDelegate !== false && canEdit
  const showItemPanel = itemConfig.showItemPanel !== false
  const itemPanelMode = itemConfig.itemPanelMode || 'responder'

  return (
    <div className={cn(
      'rounded-lg border transition-colors',
      isComplete ? 'border-green-500/20 bg-green-500/3 opacity-70' : 'border-border bg-surface-overlay'
    )}>
      {/* Item header row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {isComplete
          ? <CheckCircle2 size={14} className="text-green-400 shrink-0" />
          : <Circle size={14} className="text-text-muted shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className={cn('text-xs font-medium truncate',
            isComplete ? 'text-text-muted line-through' : 'text-text-primary')}>
            {item.itemLabel}
          </p>
          {item.assignedToUserName && (
            <p className="text-[10px] text-text-muted flex items-center gap-1 mt-0.5">
              <Users size={10} /> {item.assignedToUserName}
            </p>
          )}
        </div>

        {/* Action item badge */}
        {item.hasOpenActionItem && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center gap-1 shrink-0">
            <Flag size={9} /> Open item
          </span>
        )}

        {/* Actions — from itemConfig.actions (Screen Designer) or fallback to hardcoded */}
        <div className="flex items-center gap-1 shrink-0">
          {showItemPanel && (
            <button onClick={() => setPanelOpen(p => !p)}
              className="h-6 px-2 text-[10px] text-text-muted hover:text-text-primary hover:bg-surface-raised rounded transition-colors">
              {panelOpen ? 'Hide' : 'Details'}
            </button>
          )}
          {canDelegate && !isComplete && !itemConfig.actions?.length && (
            <button onClick={() => setAssignOpen(a => !a)}
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
              <UserPlus size={12} />
            </button>
          )}
          {/* Dynamic action buttons from Screen Designer */}
          {canEdit && !isComplete && itemConfig.actions?.length > 0 && itemConfig.actions.map(action => {
            const isComplete_ = action.actionKey === 'SUBMIT_ANSWER' || action.actionKey === 'COMPLETE'
            const isDelegate  = action.actionKey === 'DELEGATE_ITEM' || action.actionKey === 'DELEGATE'
            return (
              <button key={action.actionKey}
                disabled={isComplete_ && completeMut.isPending}
                onClick={() => {
                  if (isComplete_) { completeMut.mutate(); return }
                  if (isDelegate)  { setAssignOpen(a => !a); return }
                  // Generic: call apiEndpoint if provided
                  if (action.apiEndpoint) {
                    const url = action.apiEndpoint
                      .replace('{taskId}', taskInstanceId)
                      .replace('{id}', item.id)
                      .replace('{sectionKey}', section.sectionKey)
                      .replace('{itemId}', item.id)
                    api[action.httpMethod?.toLowerCase?.() || 'post'](url, action.payloadTemplateJson ? JSON.parse(action.payloadTemplateJson) : {})
                      .then(() => { toast.success(action.label + ' ✓'); onComplete?.() })
                      .catch(e => toast.error(e?.response?.data?.message || 'Failed'))
                  }
                }}
                className={cn(
                  'h-6 px-2 text-[10px] font-medium rounded border transition-colors',
                  {
                    primary:   'bg-brand-500/10 border-brand-500/30 text-brand-400 hover:bg-brand-500/20',
                    secondary: 'bg-surface-overlay border-border text-text-secondary hover:bg-surface-raised',
                    danger:    'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20',
                  }[action.variant] || 'bg-surface-overlay border-border text-text-secondary'
                )}>
                {isComplete_ && completeMut.isPending ? '…' : action.label}
              </button>
            )
          })}
          {/* Fallback: hardcoded Done when no actions configured */}
          {canEdit && !isComplete && !itemConfig.actions?.length && (
            <Button size="xs" loading={completeMut.isPending}
              onClick={() => completeMut.mutate()}>
              Done
            </Button>
          )}
        </div>
      </div>

      {/* Item form fields (from itemScreenKey) */}
      {panelOpen && !isComplete && section.itemScreenKey && (itemConfig.fields || []).length > 0 && (
        <div className="px-3 pb-3 border-t border-border/50 pt-2">
          <DynamicForm
            fields={itemConfig.fields}
            editableFields={viewContext?.editableFields || itemConfig.editableFields}
            readOnlyFields={viewContext?.readOnlyFields || itemConfig.readOnlyFields}
            onSubmit={(data) => {
              // Module-specific save endpoint — caller provides via itemConfig.saveEndpoint
              if (itemConfig.saveEndpoint) {
                api.patch(
                  itemConfig.saveEndpoint
                    .replace(':taskInstanceId', taskInstanceId)
                    .replace(':itemId', item.id),
                  data
                ).then(() => { toast.success('Saved'); onComplete?.() })
                .catch(e => toast.error(e?.response?.data?.message || 'Save failed'))
              }
            }}
            submitLabel="Save"
            size="sm"
          />
        </div>
      )}

      {/* ItemPanel: discussion, action items, evidence */}
      {panelOpen && showItemPanel && (
        <div className="border-t border-border/50">
          <ItemPanel
            entityType={section.itemRefType}
            entityId={item.itemRefId}
            mode={itemPanelMode}
            defaultOpen={true}
          />
        </div>
      )}

      {/* Assign to action item panel */}
      {assignOpen && (
        <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-2">
          <p className="text-xs font-medium text-text-secondary">Create action item — assign to user</p>
          <UserSearchInput
            onSelect={(userId) => createActionItemMut.mutate(userId)}
            loading={createActionItemMut.isPending}
            onCancel={() => setAssignOpen(false)}
          />
        </div>
      )}
    </div>
  )
}

// ─── Section Assignment Panel (Case 2) ───────────────────────────────────────

function SectionAssignmentPanel({
  taskInstanceId, sectionKey, sectionLabel,
  assigneesTotal, assigneesCompleted, canEdit, onAssigned,
}) {
  const [open, setOpen] = useState(false)

  const assignMut = useMutation({
    mutationFn: (userIds) => api.post(
      `/v1/compound-tasks/${taskInstanceId}/sections/${sectionKey}/assign`,
      { assigneeUserIds: userIds }
    ),
    onSuccess: () => { toast.success('Section assigned'); setOpen(false); onAssigned?.() },
    onError: (e) => toast.error(e?.response?.data?.message || 'Assignment failed'),
  })

  return (
    <div className="p-3 rounded-lg bg-surface-overlay border border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-text-secondary">Section assignment</p>
        <span className="text-xs text-text-muted">{assigneesCompleted}/{assigneesTotal} done</span>
      </div>

      {assigneesTotal > 0 && (
        <Progress value={assigneesCompleted} max={assigneesTotal} color="brand" className="mb-2" />
      )}

      {canEdit && (
        <Button size="xs" variant="secondary" icon={UserPlus} onClick={() => setOpen(o => !o)}>
          Assign users
        </Button>
      )}

      {open && (
        <div className="mt-2">
          <UserSearchInput
            onSelect={(userId) => assignMut.mutate([userId])}
            loading={assignMut.isPending}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  )
}

// ─── User search input ─────────────────────────────────────────────────────────

function UserSearchInput({ onSelect, loading, onCancel }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  const search = async (q) => {
    setQuery(q)
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await api.get('/v1/users/search', { params: { q, take: 10 } })
      setResults(res.data?.data || res.data || [])
    } catch { setResults([]) }
    setSearching(false)
  }

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={e => search(e.target.value)}
        placeholder="Search users…"
        autoFocus
        className="w-full h-7 px-2.5 text-xs bg-surface-raised border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {searching && <Loader2 size={13} className="animate-spin text-text-muted" />}
      {results.map(u => (
        <button key={u.id}
          onClick={() => { onSelect(u.id); setQuery(''); setResults([]) }}
          disabled={loading}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left hover:bg-surface-raised transition-colors">
          <div className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center text-[9px] font-bold text-brand-400 shrink-0">
            {(u.firstName?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-text-primary">{u.firstName} {u.lastName}</p>
            <p className="text-text-muted">{u.email}</p>
          </div>
        </button>
      ))}
      <button onClick={onCancel} className="text-xs text-text-muted hover:text-text-primary transition-colors">
        Cancel
      </button>
    </div>
  )
}