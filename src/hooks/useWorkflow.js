import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../config/axios.config'
import { workflowsApi } from '../api/workflows.api'
import { uiConfigApi } from '../api/uiConfig.api'
import { QUERY_KEYS } from '../config/constants'
import { useSelector } from 'react-redux'
import { selectAuth } from '../store/slices/authSlice'
import toast from 'react-hot-toast'

/**
 * useMyTasks — fetches tasks for the logged-in user from the enriched endpoint.
 *
 * Calls GET /v1/workflows/my-tasks which returns enriched TaskInstanceResponse:
 *   taskId, stepInstanceId, assignedUserId, status, stepName, stepOrder,
 *   entityType, entityId, workflowName, workflowId, priority, assignedAt.
 *
 * Polls every 60s. Enabled only when userId is available.
 */
export const useMyTasks = (params = {}) => {
  const { userId } = useSelector(selectAuth)

  return useQuery({
    queryKey: [...QUERY_KEYS.MY_TASKS, userId, params],
    queryFn: () => {
      const queryParams = {}
      if (params.status) queryParams.status = params.status
      // scope=ALL returns tasks from every organization this identity belongs
      // to, not just the active one. Omitted by default so the endpoint keeps
      // its TENANT default — the cross-organization view is a deliberate ask.
      if (params.scope) queryParams.scope = params.scope
      return api.get('/v1/workflows/my-tasks', { params: queryParams })
    },
    refetchInterval: 60 * 1000,
    enabled: !!userId,
    staleTime: 30 * 1000,
  })
}

/**
 * useTaskAction — submits any of the 8 task actions.
 * Guards against null taskInstanceId before calling the API.
 * Invalidates MY_TASKS on success.
 */
export const useTaskAction = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => {
      if (!data?.taskInstanceId) {
        return Promise.reject(new Error(
          'taskInstanceId is required for task action. ' +
          'Please open the task from your inbox instead of navigating directly.'
        ))
      }
      return workflowsApi.tasks.action(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MY_TASKS })
      toast.success('Action submitted')
    },
    onError: (e) => toast.error(e?.message || 'Action failed'),
  })
}

/**
 * useWorkflowList — lists global workflow blueprints.
 * staleTime: 2 minutes — blueprints are admin-only, rarely change.
 */
export const useWorkflowList = (params) => useQuery({
  queryKey: [...QUERY_KEYS.WORKFLOWS, params],
  queryFn: () => workflowsApi.blueprints.list(params),
  staleTime: 2 * 60 * 1000,
  gcTime:    5 * 60 * 1000,
})

/**
 * useWorkflowInstanceStatus — fetches a single instance with full step/task detail.
 */
export const useWorkflowInstanceStatus = (instanceId) => useQuery({
  queryKey: ['workflow-instance', instanceId],
  queryFn: () => workflowsApi.instances.get(instanceId),
  enabled: !!instanceId,
})

/**
 * useWorkflowProgress — fetches per-step progress for a workflow instance.
 * Used by WorkflowTimeline and InstanceDetail.
 */
export const useWorkflowProgress = (instanceId) => useQuery({
  queryKey: ['workflow-progress', instanceId],
  queryFn:  () => workflowsApi.instances.progress(instanceId),
  enabled:  !!instanceId,
  staleTime: 30 * 1000,
})

/**
 * useAccessContext — resolves what the current user can do on a workflow page.
 *
 * ── BACKWARD COMPATIBLE — used by all existing TPRM pages ────────────────────
 * Calls GET /v1/workflow-instances/tasks/access-context (original endpoint).
 * Returns the base AccessContext: mode, canView, canEdit, canAct, reason,
 * stepStatus, workflowStatus.
 *
 * DO NOT change this hook's signature or endpoint — the following pages depend on it:
 *   VendorAssessmentFillPage.jsx    → useAccessContext(stepInstanceId, taskId)
 *   VendorAssessmentAssignPage.jsx  → useAccessContext(stepInstanceId, taskId)
 *   VendorAssessmentResponderReviewPage.jsx → useAccessContext(stepInstanceId, taskId)
 *
 * For new module pages that need the extended AccessContext (permissions, sodViolations,
 * visibleTabs, editableFields, etc.), use useViewContext() instead.
 */
export const useAccessContext = (stepInstanceId, taskId) => useQuery({
  queryKey: ['access-context', stepInstanceId, taskId],
  queryFn:  () => workflowsApi.tasks.accessContext(stepInstanceId, taskId),
  enabled:  !!stepInstanceId,
  staleTime: 30 * 1000,
  retry: false,
})

/**
 * useViewContext — resolves the full 3-layer access context for new module pages.
 *
 * Calls GET /v1/ui-config/view-context (new ViewContextController endpoint).
 * Returns the extended AccessContext with all new fields:
 *   mode, canView, canEdit, canAct        — base (same as useAccessContext)
 *   permissions[]                          — resolved permission codes for this user
 *   sodViolations[]                        — SoD conflicts detected on this instance
 *   visibleTabs[], hiddenTabs[]            — tab visibility from step UI override
 *   editableFields[], readOnlyFields[], hiddenFields[]  — field-level access
 *   availableActions[]                     — allowed workflow task actions
 *   stepLabel                              — display name for current step
 *
 * ── CALL PATTERNS ────────────────────────────────────────────────────────────
 *   List page:   useViewContext('RISK')             — role permissions only
 *   Detail page: useViewContext('RISK', riskId)     — + SoD if active instance exists
 *   Task page:   useViewContext('RISK', riskId, stepInstanceId) — full resolution
 *
 * Used by: UniversalModulePage, RecordDetailTemplate, WorkflowBlueprintDesigner,
 *          and all future GRC module pages.
 */
export const useViewContext = (entityType, entityId, stepInstanceId) => useQuery({
  queryKey: ['view-context', entityType, entityId, stepInstanceId],
  queryFn:  () => uiConfigApi.viewContext(entityType, entityId, stepInstanceId),
  enabled:  !!entityType,
  staleTime: 30 * 1000,
  retry: false,
})

// ══════════════════════════════════════════════════════════════════════════════
// COMPOUND TASK HOOKS
// ══════════════════════════════════════════════════════════════════════════════

// Internal API — not exported (consumers use the hooks below)
const _cta = {
  progress:       (tid)              => api.get(`/v1/compound-tasks/${tid}/progress`),
  saveDraft:      (tid, d)           => api.post(`/v1/compound-tasks/${tid}/draft`, d, { headers: { 'Content-Type': 'application/json' } }),
  getDraft:       (tid)              => api.get(`/v1/compound-tasks/${tid}/draft`),
  assignSection:  (tid, skey, uids, notes) => api.post(`/v1/compound-tasks/${tid}/sections/${skey}/assign`, { assigneeUserIds: uids, notes }),
  registerItems:  (tid, skey, items) => api.post(`/v1/compound-tasks/${tid}/sections/${skey}/items`, items),
  assignItems:    (tid, skey, itemIds, assignedToUserId) =>
                    api.post(`/v1/compound-tasks/${tid}/sections/${skey}/items/assign`, { itemIds, assignedToUserId }),
  completeItem:   (tid, skey, iid, payload) => api.post(`/v1/compound-tasks/${tid}/sections/${skey}/items/${iid}/complete`, payload),
  completeSection:(tid, skey)        => api.post(`/v1/compound-tasks/${tid}/sections/${skey}/complete`),
  completeSubTask:(subTaskId)        => api.post(`/v1/compound-tasks/sub-tasks/${subTaskId}/complete`),
}

/**
 * useCompoundTaskProgress — fetches section checklist for a compound task.
 *
 * Returns TaskSectionProgressResponse[] — UPDATED shape now includes:
 *   sectionKey, label, required, completed, completedAt
 *   tracksItems, itemsTotal, itemsCompleted
 *   requiresAssignment, assigneesTotal, assigneesCompleted
 *   [NEW] sectionScreenKey — screen config for section container UI
 *   [NEW] itemScreenKey    — screen config for each item card
 *   [NEW] itemRefType      — CONTROL | QUESTION_RESPONSE | FINDING | etc.
 *   [NEW] sectionUiJson    — inline override for section container
 *   [NEW] itemUiJson       — inline override for item cards
 *   [NEW] items[]          — SectionItemResponse[] when tracksItems=true
 *     each: { id, itemRefType, itemRefId, itemLabel, status, assignedToUserId, hasOpenActionItem }
 *
 * Auto-refreshes every 15s so progress bars stay live.
 */
export const useCompoundTaskProgress = (taskId) => useQuery({
  queryKey:  ['compound-progress', taskId],
  queryFn:   () => _cta.progress(taskId),
  enabled:   !!taskId,
  staleTime: 10 * 1000,
  refetchInterval: 15 * 1000,
  select: (data) => Array.isArray(data) ? data : (data?.data || []),
})

/**
 * useDraftSave — auto-save and restore draft for a compound task.
 * Call saveDraft(formState) on field changes or on a 30s timer.
 * Call loadDraft() on mount to restore unsaved work.
 */
export const useDraftSave = (taskId) => {
  const { mutate } = useMutation({
    mutationFn: (draftData) => _cta.saveDraft(taskId, JSON.stringify(draftData)),
  })
  const loadDraft = async () => {
    if (!taskId) return null
    try {
      const res = await _cta.getDraft(taskId)
      const raw = res?.data ?? res
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }
  return { saveDraft: (data) => taskId && mutate(data), loadDraft }
}

/**
 * useSectionAssign — Case 2: assign a section's work to other users.
 * Creates sub-tasks for each assignee and fires TaskSectionAssignedEvent.
 */
export const useSectionAssign = (taskId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionKey, assigneeUserIds, notes }) =>
      _cta.assignSection(taskId, sectionKey, assigneeUserIds, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compound-progress', taskId] })
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Assignment failed'),
  })
}

/**
 * useCompleteItem — Case 3: mark one item (control/finding/question) done.
 * When all items for a section complete, backend auto-fires the section's
 * completionEvent → section completes → gate rechecks → may auto-approve task.
 */
export const useCompleteItem = (taskId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionKey, itemId, outcome, notes, artifactType, artifactId }) =>
      _cta.completeItem(taskId, sectionKey, itemId, { outcome, notes, artifactType, artifactId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compound-progress', taskId] })
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to complete item'),
  })
}

/**
 * NEW: useRegisterItems — Case 3: register items to track within a section.
 *
 * Called when a module's section first becomes active and the items are known.
 * e.g. when a risk assessment step becomes active, register all controls as items.
 *
 * POST /v1/compound-tasks/:taskId/sections/:sectionKey/items
 * Body: [{ itemRefType: 'CONTROL', itemRefId: 42, label: 'CC6.1 Access Control' }]
 *
 * Idempotent — backend skips already-registered items (same taskId + sectionKey + itemRefType + itemRefId).
 */
export const useRegisterItems = (taskId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionKey, items }) =>
      _cta.registerItems(taskId, sectionKey, items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compound-progress', taskId] })
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to register items'),
  })
}

/**
 * NEW: useAssignItems — Case 3: assign specific items to a user within a section.
 *
 * Used when a ACTOR (e.g. risk analyst) wants to delegate specific controls
 * to another user. Creates action items automatically via CompoundSectionRenderer.
 *
 * POST /v1/compound-tasks/:taskId/sections/:sectionKey/items/assign
 * Body: { itemIds: [88, 89], assignedToUserId: 123 }
 */
export const useAssignItems = (taskId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionKey, itemIds, assignedToUserId }) =>
      _cta.assignItems(taskId, sectionKey, itemIds, assignedToUserId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compound-progress', taskId] })
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Assignment failed'),
  })
}

/**
 * NEW: useCompleteSection — explicitly submit a section as done.
 *
 * Used by the section submit button in CompoundSectionRenderer.
 * Alternative to the event-driven auto-complete path (Case 1).
 *
 * POST /v1/compound-tasks/:taskId/sections/:sectionKey/complete
 */
export const useCompleteSection = (taskId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sectionKey) => _cta.completeSection(taskId, sectionKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compound-progress', taskId] })
      toast.success('Section submitted')
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Submit failed'),
  })
}

/**
 * NEW: useCompleteSubTask — Case 2: mark a sub-task done (after section work is finished).
 *
 * Called by the assignee of a section sub-task when they finish their work.
 * Backend checks if all sub-tasks for that section are done → fires completionEvent.
 *
 * POST /v1/compound-tasks/sub-tasks/:subTaskId/complete
 */
export const useCompleteSubTask = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (subTaskId) => _cta.completeSubTask(subTaskId),
    onSuccess: (_, subTaskId) => {
      // Invalidate all compound progress queries — we don't always know the parent taskId here
      qc.invalidateQueries({ queryKey: ['compound-progress'] })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MY_TASKS })
      toast.success('Work submitted')
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to submit'),
  })
}