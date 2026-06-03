/**
 * actionItems.api.js — KashiTrack REST calls.
 *
 * GET    /v1/action-items/my               — my open items
 * GET    /v1/action-items/my/count         — badge count
 * GET    /v1/action-items?entityType=&entityId= — entity oversight
 * GET    /v1/action-items/:id              — single item [NEW]
 * POST   /v1/action-items                 — create
 * PUT    /v1/action-items/:id             — update [NEW]
 * PATCH  /v1/action-items/:id/status      — status only
 * DELETE /v1/action-items/:id             — soft dismiss [NEW]
 *
 * NEW fields on create/update:
 *   parentEntityType, parentEntityId — parent record context
 *   itemScreenKey                    — screen config for assignee work UI
 *   itemUiJson                       — inline UI override for work screen
 */
import api from '../config/axios.config'

export const actionItemsApi = {

  my:      (params) => api.get('/v1/action-items/my', { params }),
  myCount: ()       => api.get('/v1/action-items/my/count'),

  forEntity: (entityType, entityId, params) =>
    api.get('/v1/action-items', { params: { entityType, entityId, ...params } }),

  getById: (id) => api.get(`/v1/action-items/${id}`),

  /**
   * Create — module-agnostic.
   *
   * TPRM (existing):
   *   { sourceType:'COMMENT', entityType:'QUESTION_RESPONSE', vendorId, navContext:{...} }
   *
   * New module — compound task item delegation:
   *   { sourceType:'WORKFLOW_STEP', sourceId:taskInstanceId,
   *     entityType:'CONTROL', entityId:controlId,
   *     parentEntityType:'RISK', parentEntityId:riskId,
   *     itemScreenKey: section.itemScreenKey,
   *     itemUiJson: section.itemUiJson,
   *     navContext: JSON.stringify({ route:`/workflow/tasks/${taskId}`,
   *       sectionKey, itemId, itemRefType, itemRefId }) }
   *
   * Record-level (from detail page):
   *   { sourceType:'SYSTEM', entityType:'RISK', entityId:riskId,
   *     navContext: JSON.stringify({ route:'/module/risk/42' }) }
   */
  create: (data) => api.post('/v1/action-items', data),

  /** Update title/description/dueAt/priority/assignee. Creator or ORG_ADMIN only. */
  update: (id, data) => api.put(`/v1/action-items/${id}`, data),

  /** Status transition. OPEN→IN_PROGRESS, *→RESOLVED, *→DISMISSED, RESOLVED→OPEN */
  updateStatus: (id, status, resolutionNote) =>
    api.patch(`/v1/action-items/${id}/status`, { status, resolutionNote }),

  /** Soft dismiss → status=DISMISSED. Creator or ORG_ADMIN only. */
  delete: (id) => api.delete(`/v1/action-items/${id}`),
}