import api from '../config/axios.config'

/**
 * Workflow API client.
 *
 * CHANGES:
 *   tasks.action() — hardened the URL builder.
 *     BEFORE: api.post(`/v1/workflow-instances/tasks/${data.taskInstanceId}/action`, data)
 *       When data.taskInstanceId was undefined (stale or missing task data from inbox),
 *       this produced the URL /tasks/undefined/action. Spring received "undefined" as
 *       a path variable and threw a MethodArgumentTypeMismatchException (400) because
 *       it could not cast "undefined" to Long.
 *     AFTER: throws a local Error before the fetch if taskInstanceId is falsy.
 *       The error surfaces as a toast in useTaskAction's onError handler instead
 *       of an opaque network 400. The primary null-guard is in useTaskAction;
 *       this is a secondary defence.
 *
 * All other methods are unchanged.
 */
export const workflowsApi = {

  // ─── Blueprints ───────────────────────────────────────────────────────────
  blueprints: {
    list:             (params)   => api.get('/v1/workflows', { params }),
    get:              (id)       => api.get(`/v1/workflows/${id}`),
    create:           (data)     => api.post('/v1/workflows', data),
    update:           (id, data) => api.put(`/v1/workflows/${id}`, data),
    delete:           (id)       => api.delete(`/v1/workflows/${id}`),
    activate:         (id)       => api.put(`/v1/workflows/${id}/activate`),
    deactivate:       (id)       => api.put(`/v1/workflows/${id}/deactivate`),
    createVersion:    (id)       => api.post(`/v1/workflows/${id}/version`),
    /**
     * GET /v1/workflows/automated-actions
     * Returns all registered AutomatedActionHandler keys from the backend registry.
     * Used by StepForm to populate the automated action dropdown for SYSTEM steps.
     */
    automatedActions: ()         => api.get('/v1/workflows/automated-actions'),
    /**
     * POST /v1/workflows/{id}/import-steps
     * Upload a CSV file to bulk-import steps. Returns CsvImportResult with per-row log.
     * Accepts both DB export format and template format — auto-detected from header.
     */
    importSteps: (workflowId, file, tenantId) => {
      const form = new FormData()
      form.append('file', file)
      return api.post(`/v1/workflows/${workflowId}/import-steps`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: tenantId ? { tenantId } : {},
      })
    },
  },

  // ─── Instances ────────────────────────────────────────────────────────────
  instances: {
    /**
     * Start a new workflow instance for a business entity.
     * IMPORTANT: only send the fields defined on StartWorkflowRequest.
     * Do NOT merge other form state into this call — stale keys (e.g. taskInstanceId
     * from a previous action) will be silently discarded by @JsonIgnoreProperties
     * on the backend, but it's cleaner to keep the payload minimal.
     *
     * Required: { workflowId, entityId, entityType }
     * Optional: { priority, dueDate, remarks }
     */
    start:   (data)             => api.post('/v1/workflow-instances', data),
    get:     (id)               => api.get(`/v1/workflow-instances/${id}`),
    list:    (params)           => api.get('/v1/workflow-instances', { params }),
    active:  (entityType, entityId) =>
               api.get('/v1/workflow-instances/active', { params: { entityType, entityId } }),
    cancel:  (id, remarks)      => api.patch(`/v1/workflow-instances/${id}/cancel`, null, { params: { remarks } }),
    hold:    (id, remarks)      => api.patch(`/v1/workflow-instances/${id}/hold`,   null, { params: { remarks } }),
    resume:  (id)               => api.patch(`/v1/workflow-instances/${id}/resume`),
    /**
     * GET /v1/workflow-instances/{id}/progress
     * Per-step tracking: assigned users (by name), tasks, SLA, duration per step.
     */
    progress: (id)               => api.get(`/v1/workflow-instances/${id}/progress`),
  },

  // ─── Task actions ─────────────────────────────────────────────────────────
  tasks: {
    /**
     * Perform an action on a task.
     *
     * FIXED: Added null-guard before building the URL.
     * data.taskInstanceId must be a truthy number. If it is missing or undefined,
     * a local Error is thrown before the fetch — avoiding the server 400 caused
     * by the URL /tasks/undefined/action (which Spring cannot cast to Long).
     *
     * The primary guard is in useTaskAction (useWorkflow.js). This is a secondary
     * defence at the API layer.
     *
     * @param {object} data - { taskInstanceId, actionType, remarks?, targetUserId?, targetStepId? }
     */
    action: (data) => {
      if (!data?.taskInstanceId) {
        return Promise.reject(new Error(
          'taskInstanceId is required. Open this task from your inbox.'
        ))
      }
      return api.post(`/v1/workflow-instances/tasks/${data.taskInstanceId}/action`, data)
    },

    /**
     * Expire a stale task — dismiss it from the inbox.
     * Called when a task belongs to a CANCELLED/COMPLETED/REJECTED workflow instance
     * and can no longer be acted on. Marks the task EXPIRED so it stops appearing
     * in the user's inbox.
     *
     * PATCH /v1/workflow-instances/tasks/:taskId/expire
     */
    expire: (taskId) => api.patch(`/v1/workflow-instances/tasks/${taskId}/expire`),

    /**
     * GET /v1/workflow-instances/tasks/user/:id — returns flat TaskInstanceResponse.
     * NOTE: This is NOT used by the TaskInbox or useMyTasks hook anymore.
     *   Use GET /v1/workflows/my-tasks (via useMyTasks) for enriched task data
     *   with stepName, entityType, entityId, priority, and workflowName.
     *   This method is retained for any direct usage in step-detail views where
     *   the caller already has step context and only needs flat task data.
     */
    pending:      (userId)                  => api.get(`/v1/workflow-instances/tasks/user/${userId}`),
    all:          (userId)                  => api.get(`/v1/workflow-instances/tasks/user/${userId}/all`),
    forStep:      (stepInstanceId)          => api.get(`/v1/workflow-instances/tasks/step/${stepInstanceId}`),
    assign:       (stepInstanceId, userId)  =>
                    api.post('/v1/workflow-instances/tasks/assign', null, { params: { stepInstanceId, userId } }),

    /**
     * GET /v1/workflow-instances/tasks/access-context
     * Resolves what the current user can do on a workflow page.
     * Returns AccessContext: { mode, canView, canEdit, canAct, reason, stepStatus, workflowStatus }
     * Called by every workflow page via useAccessContext hook.
     */
    accessContext: (stepInstanceId, taskId) =>
      api.get('/v1/workflow-instances/tasks/access-context', {
        params: { stepInstanceId, ...(taskId ? { taskId } : {}) }
      }),
  },

  // ─── History ──────────────────────────────────────────────────────────────
  history: {
    forInstance: (instanceId)          => api.get(`/v1/workflow-instances/${instanceId}/history`),
    forStep:     (instanceId, stepId)  => api.get(`/v1/workflow-instances/${instanceId}/history/step/${stepId}`),
    forUser:     (userId)              => api.get(`/v1/workflow-instances/history/user/${userId}`),
  },
}