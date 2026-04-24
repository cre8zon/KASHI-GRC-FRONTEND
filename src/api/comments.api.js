/**
 * comments.api.js — REST calls for the unified entity comment system.
 *
 * Endpoints:
 *   POST /v1/comments                          — add a comment to any entity
 *   GET  /v1/comments?entityType=X&entityId=Y  — get comments for an entity
 *   GET  /v1/comments/question/:id             — get comments for a question instance
 */

import api from '../config/axios.config'

export const commentsApi = {
  /**
   * Add a comment to any entity (TASK, ASSESSMENT, QUESTION_RESPONSE).
   * @param {object} data — CommentRequest fields
   */
  add: (data) => api.post('/v1/comments', data),

  /**
   * Get all visible comments for an entity.
   * Visibility filtering (ALL / INTERNAL / CISO_ONLY) is enforced server-side
   * based on the calling user's role.
   */
  list: (entityType, entityId) =>
    api.get('/v1/comments', { params: { entityType, entityId } }),

  /**
   * Get all visible comments for a specific question instance.
   * Uses question_instance_id as the anchor (industry standard — not response_id).
   */
  listQuestion: (questionInstanceId) =>
    api.get(`/v1/comments/question/${questionInstanceId}`),
}