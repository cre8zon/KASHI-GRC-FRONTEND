/**
 * notificationEmailRules.api.js — event → email template routing rules.
 *
 * Rules control what NotificationEmailConsumer does per eventKey:
 *   no rules            → raw fallback email to recipients (default on)
 *   rows with template  → one email per template per addressee
 *   audience            → RECIPIENT (affected users) or ACTOR (who acted)
 *   suppressEmail=true  → mutes ALL email for the eventKey (fallback too)
 *   tenantId set        → tenant override; replaces global rules for that key
 *
 * GET    /v1/admin/notification-email-rules?eventKey= — list
 * POST   /v1/admin/notification-email-rules           — create
 * PUT    /v1/admin/notification-email-rules/:id       — update
 * DELETE /v1/admin/notification-email-rules/:id       — delete (hard; pure config)
 */
import api from '../config/axios.config'

export const notificationEmailRulesApi = {
  list:   (params)    => api.get('/v1/admin/notification-email-rules', { params }),
  create: (data)      => api.post('/v1/admin/notification-email-rules', data),
  update: (id, data)  => api.put(`/v1/admin/notification-email-rules/${id}`, data),
  delete: (id)        => api.delete(`/v1/admin/notification-email-rules/${id}`),
}
