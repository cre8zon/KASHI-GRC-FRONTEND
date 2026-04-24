/**
 * actionItems.api.js — KashiTrack REST calls.
 *
 * Endpoints:
 *   GET  /v1/action-items/my          — my open action items
 *   GET  /v1/action-items/my/count    — badge count
 *   GET  /v1/action-items?entityType=X&entityId=Y — entity overview
 *   POST /v1/action-items             — create manually
 *   PATCH /v1/action-items/:id/status — update status
 */
import api from '../config/axios.config'

export const actionItemsApi = {
  /** My open action items — for Action Items page */
  my: () => api.get('/v1/action-items/my'),

  /** Badge count only — cheap endpoint for sidebar */
  myCount: () => api.get('/v1/action-items/my/count'),

  /** All action items for a specific entity (oversight view) */
  forEntity: (entityType, entityId) =>
    api.get('/v1/action-items', { params: { entityType, entityId } }),

  /** Manually create an action item */
  create: (data) => api.post('/v1/action-items', data),

  /** Update status: IN_PROGRESS, RESOLVED, DISMISSED, OPEN */
  updateStatus: (id, status, resolutionNote) =>
    api.patch(`/v1/action-items/${id}/status`, { status, resolutionNote }),
}
