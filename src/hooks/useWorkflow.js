import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../config/axios.config'
import { workflowsApi } from '../api/workflows.api'
import { QUERY_KEYS } from '../config/constants'
import { useSelector } from 'react-redux'
import { selectAuth } from '../store/slices/authSlice'
import toast from 'react-hot-toast'

/**
 * useMyTasks — fetches tasks for the logged-in user from the enriched endpoint.
 *
 * FIXED: Previously called workflowsApi.tasks.pending(userId) which resolves to
 *   GET /v1/workflow-instances/tasks/user/:id
 *   This endpoint returns flat TaskInstanceResponse objects with no stepName,
 *   entityType, entityId, or priority. The TaskInbox component needs all of
 *   these fields to render cards and for resolveTaskRoute() to build URLs.
 *   Every "Open task" button was silently a no-op because resolveTaskRoute()
 *   always returned null (stepName was undefined).
 *
 * NOW: Calls GET /v1/workflows/my-tasks which is served by
 *   AssessmentController.getMyTasks() and delegates to
 *   WorkflowEngineService.getPendingTasksForUser() — returning enriched
 *   TaskInstanceResponse objects that include:
 *     taskId, stepInstanceId, assignedUserId, status, stepName, stepOrder,
 *     entityType, entityId, workflowName, workflowId, priority, assignedAt.
 *
 * The optional `status` param filters by TaskStatus. Defaults to PENDING
 * (the user's active inbox) when omitted.
 *
 * Polls every 60s so the badge count stays fresh. Enabled only when userId
 * is available (i.e. user is authenticated).
 *
 * @param {object} params - optional: { status: 'PENDING' | 'APPROVED' | ... }
 */
export const useMyTasks = (params = {}) => {
  const { userId } = useSelector(selectAuth)

  return useQuery({
    queryKey: [...QUERY_KEYS.MY_TASKS, userId, params],
    queryFn: () => {
      // Build query params — only include status if explicitly provided
      const queryParams = {}
      if (params.status) queryParams.status = params.status

      // The axios interceptor (axios.config.js) unwraps ApiResponse<List<TaskInstanceResponse>>:
      //   interceptor: response.data?.data ?? response.data
      // For ApiResponse<List>: { success: true, data: [...] }
      //   → interceptor returns the array directly.
      // No select() transformation needed — adding one would double-unwrap.
      return api.get('/v1/workflows/my-tasks', { params: queryParams })
    },
    // No select() — axios interceptor already returns TaskInstanceResponse[].
    // Consumers use: Array.isArray(data) ? data : []
    // NOT data?.items (that was the old PaginatedResponse shape — no longer applies).
    refetchInterval: 60 * 1000,  // poll every 60s for fresh badge count
    enabled: !!userId,
    staleTime: 30 * 1000,
  })
}

/**
 * useTaskAction — submits any of the 8 task actions.
 *
 * FIXED: Added a null-guard before calling the API. If taskInstanceId is
 *   undefined or null (which happens when the inbox renders with stale data
 *   and resolveTaskRoute returns null), the mutation now throws a local error
 *   instead of building a URL like /tasks/undefined/action which Spring
 *   cannot cast to Long and returns a 400.
 *
 * Invalidates MY_TASKS so the inbox badge count updates immediately on success.
 */
export const useTaskAction = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => {
      // Guard: taskInstanceId must be a valid number before calling the API
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
 * Logic unchanged.
 */
export const useWorkflowList = (params) => useQuery({
  queryKey: [...QUERY_KEYS.WORKFLOWS, params],
  queryFn: () => workflowsApi.blueprints.list(params),
})

/**
 * useWorkflowInstanceStatus — fetches a single instance with full step/task detail.
 * Logic unchanged.
 */
export const useWorkflowInstanceStatus = (instanceId) => useQuery({
  queryKey: ['workflow-instance', instanceId],
  queryFn: () => workflowsApi.instances.get(instanceId),
  enabled: !!instanceId,
})

/**
 * useWorkflowProgress — fetches per-step progress for a workflow instance.
 * Returns the rich progress data from GET /v1/workflow-instances/{id}/progress:
 * every step with assigned user names, task history, SLA status, duration.
 *
 * Used by WorkflowTimeline (VendorDetailPage) and InstanceDetail (WorkflowPage).
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
 * Replaces the scattered useEffect task-gate pattern in every workflow page.
 * Called on page mount with the stepInstanceId from URL params and optionally
 * the taskId the user navigated from.
 *
 * Returns AccessContext:
 *   mode         "EDIT" | "OBSERVER" | "COMPLETED" | "DENIED"
 *   canView      false → redirect to /workflow/inbox
 *   canEdit      false → all form inputs disabled
 *   canAct       false → action buttons hidden
 *   reason       human-readable explanation (shown in observer/completed banners)
 *   stepStatus   current step status
 *   workflowStatus current workflow status
 *
 * Usage in every workflow page:
 *   const { data: access, isLoading } = useAccessContext(stepInstanceId, taskId)
 *   if (!access?.canView) return <Navigate to="/workflow/inbox" />
 *   <MyForm mode={access.mode} canAct={access.canAct} />
 */
export const useAccessContext = (stepInstanceId, taskId) => useQuery({
  queryKey: ['access-context', stepInstanceId, taskId],
  queryFn:  () => workflowsApi.tasks.accessContext(stepInstanceId, taskId),
  enabled:  !!stepInstanceId,
  staleTime: 30 * 1000,
  retry: false,  // don't retry on DENIED — redirect immediately
})
// ══════════════════════════════════════════════════════════════════════════════
// COMPOUND TASK HOOKS
// ══════════════════════════════════════════════════════════════════════════════
// compoundTaskApi is imported via the already-loaded api instance
const _cta = {
  progress:      (tid) => api.get(`/v1/compound-tasks/${tid}/progress`),
  saveDraft:     (tid, d) => api.post(`/v1/compound-tasks/${tid}/draft`, d, { headers: { 'Content-Type': 'application/json' } }),
  getDraft:      (tid) => api.get(`/v1/compound-tasks/${tid}/draft`),
  assignSection: (tid, skey, uids, notes) => api.post(`/v1/compound-tasks/${tid}/sections/${skey}/assign`, { assigneeUserIds: uids, notes }),
  completeItem:  (tid, skey, iid, payload) => api.post(`/v1/compound-tasks/${tid}/sections/${skey}/items/${iid}/complete`, payload),
}

/**
 * useCompoundTaskProgress — fetches section checklist for a compound task.
 * Returns TaskSectionProgressResponse[] — each item has:
 *   sectionKey, label, required, completed, completedAt,
 *   tracksItems, itemsTotal, itemsCompleted,
 *   requiresAssignment, assigneesTotal, assigneesCompleted
 *
 * Used by every work page to render CompoundTaskProgress.
 * Auto-refreshes every 10s so the bar stays live.
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
 * Call saveDraft(formState) on any field change or on a 30s timer.
 * Call loadDraft() on mount to restore unsaved work.
 */
export const useDraftSave = (taskId) => {
  const { mutate } = useMutation({
    mutationFn: (draftData) =>
      _cta.saveDraft(taskId, JSON.stringify(draftData)),
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
 * Used on ASSIGN steps (steps 3, 8) — creates sub-tasks for each assignee
 * and fires TaskSectionAssignedEvent → WebSocket push to their inboxes.
 */
export const useSectionAssign = (taskId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionKey, assigneeUserIds, notes }) =>
      _cta.assignSection(taskId, sectionKey, assigneeUserIds, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compound-progress', taskId] })
    },
  })
}

/**
 * useCompleteItem — Case 3: mark one item (question/control) done.
 * When all items for a section are marked, the backend auto-fires
 * the section's completionEvent → section completes → gate rechecks.
 */
export const useCompleteItem = (taskId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionKey, itemId, outcome, notes, artifactType, artifactId }) =>
      _cta.completeItem(taskId, sectionKey, itemId, { outcome, notes, artifactType, artifactId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compound-progress', taskId] })
    },
  })
}