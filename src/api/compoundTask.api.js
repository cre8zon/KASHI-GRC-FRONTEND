/**
 * compoundTask.api.js — Compound task REST calls.
 *
 * All calls are under /v1/compound-tasks.
 *
 * Used internally by useWorkflow.js hooks. Import the hooks, not this file directly.
 *
 * ENDPOINTS:
 *   GET    /v1/compound-tasks/:taskInstanceId/progress           — section checklist
 *   POST   /v1/compound-tasks/:taskInstanceId/draft              — save draft
 *   GET    /v1/compound-tasks/:taskInstanceId/draft              — load draft
 *   POST   /v1/compound-tasks/:taskInstanceId/sections/:key/assign         — Case 2: assign section
 *   POST   /v1/compound-tasks/sub-tasks/:subTaskInstanceId/complete        — Case 2: complete sub-task
 *   POST   /v1/compound-tasks/:taskInstanceId/sections/:key/items          — Case 3: register items
 *   POST   /v1/compound-tasks/:taskInstanceId/sections/:key/items/assign   — Case 3: assign items
 *   POST   /v1/compound-tasks/:taskInstanceId/sections/:key/items/:id/complete — Case 3: complete item
 *   POST   /v1/compound-tasks/:taskInstanceId/sections/:key/complete        — explicit section submit [NEW]
 */
import api from '../config/axios.config'

export const compoundTaskApi = {

  // ── Progress ──────────────────────────────────────────────────────────────
  /**
   * GET /v1/compound-tasks/:taskInstanceId/progress
   * Returns TaskSectionProgressResponse[] with full UI config:
   *   sectionKey, label, required, completed,
   *   tracksItems, itemsTotal, itemsCompleted,
   *   requiresAssignment, assigneesTotal, assigneesCompleted,
   *   sectionScreenKey, itemScreenKey, itemRefType, sectionUiJson, itemUiJson,
   *   items[] (SectionItemResponse when tracksItems=true)
   */
  progress: (taskInstanceId) =>
    api.get(`/v1/compound-tasks/${taskInstanceId}/progress`),

  // ── Draft ─────────────────────────────────────────────────────────────────
  saveDraft: (taskInstanceId, draftData) =>
    api.post(`/v1/compound-tasks/${taskInstanceId}/draft`,
      JSON.stringify(draftData), { headers: { 'Content-Type': 'application/json' } }),

  getDraft: (taskInstanceId) =>
    api.get(`/v1/compound-tasks/${taskInstanceId}/draft`),

  // ── Case 2: Section-level assignment ──────────────────────────────────────
  /**
   * POST /v1/compound-tasks/:taskInstanceId/sections/:sectionKey/assign
   * Assigns section work to users — creates sub-tasks, fires TaskSectionAssignedEvent.
   */
  assignSection: (taskInstanceId, sectionKey, assigneeUserIds, notes) =>
    api.post(`/v1/compound-tasks/${taskInstanceId}/sections/${sectionKey}/assign`,
      { assigneeUserIds, notes }),

  /**
   * POST /v1/compound-tasks/sub-tasks/:subTaskInstanceId/complete
   * Sub-task assignee marks their work done.
   * When all sub-tasks for a section complete, backend auto-fires completionEvent.
   */
  completeSubTask: (subTaskInstanceId) =>
    api.post(`/v1/compound-tasks/sub-tasks/${subTaskInstanceId}/complete`),

  // ── Case 3: Item-level tracking ────────────────────────────────────────────
  /**
   * POST /v1/compound-tasks/:taskInstanceId/sections/:sectionKey/items
   * Register items to track within a section.
   * Body: [{ itemRefType: 'CONTROL', itemRefId: 42, label: 'CC6.1' }]
   * Idempotent — skips already-registered items.
   */
  registerItems: (taskInstanceId, sectionKey, items) =>
    api.post(`/v1/compound-tasks/${taskInstanceId}/sections/${sectionKey}/items`, items),

  /**
   * POST /v1/compound-tasks/:taskInstanceId/sections/:sectionKey/items/assign
   * Assign specific items to a user within a section.
   * Body: { itemIds: [88, 89], assignedToUserId: 123 }
   */
  assignItems: (taskInstanceId, sectionKey, itemIds, assignedToUserId) =>
    api.post(`/v1/compound-tasks/${taskInstanceId}/sections/${sectionKey}/items/assign`,
      { itemIds, assignedToUserId }),

  /**
   * POST /v1/compound-tasks/:taskInstanceId/sections/:sectionKey/items/:itemId/complete
   * Mark one item done.
   * When all items complete, backend auto-fires section completionEvent.
   */
  completeItem: (taskInstanceId, sectionKey, itemId, payload) =>
    api.post(`/v1/compound-tasks/${taskInstanceId}/sections/${sectionKey}/items/${itemId}/complete`,
      payload),

  // ── NEW: Explicit section submit ───────────────────────────────────────────
  /**
   * POST /v1/compound-tasks/:taskInstanceId/sections/:sectionKey/complete
   * Explicitly submit a section as done — alternative to event-driven auto-complete.
   * Used by the "Submit section" button in CompoundSectionRenderer.
   *
   * Backend marks the section complete, then checks if all required sections
   * are done → may auto-approve the task.
   */
  completeSection: (taskInstanceId, sectionKey) =>
    api.post(`/v1/compound-tasks/${taskInstanceId}/sections/${sectionKey}/complete`),
}