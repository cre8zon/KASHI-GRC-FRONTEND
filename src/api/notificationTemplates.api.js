/**
 * notificationTemplates.api.js — In-app notification template management.
 *
 * Templates are matched by eventKey when NotificationService.send() fires.
 * Placeholders like {{stepName}} are resolved at send time.
 *
 * GET    /v1/admin/notification-templates         — list (paginated, searchable)
 * GET    /v1/admin/notification-templates/:id     — single template
 * POST   /v1/admin/notification-templates         — create
 * PUT    /v1/admin/notification-templates/:id     — update
 * DELETE /v1/admin/notification-templates/:id     — delete
 * POST   /v1/admin/notification-templates/preview — dry-run placeholder resolution
 */
import api from '../config/axios.config'

export const notificationTemplatesApi = {
  list:    (params)    => api.get('/v1/admin/notification-templates', { params }),
  get:     (id)        => api.get(`/v1/admin/notification-templates/${id}`),
  create:  (data)      => api.post('/v1/admin/notification-templates', data),
  update:  (id, data)  => api.put(`/v1/admin/notification-templates/${id}`, data),
  delete:  (id)        => api.delete(`/v1/admin/notification-templates/${id}`),
  /** Dry-run: resolve placeholders without sending. Returns { title, body, actionUrl } */
  preview: (data)      => api.post('/v1/admin/notification-templates/preview', data),
}