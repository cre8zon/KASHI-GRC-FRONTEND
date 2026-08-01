/**
 * notificationPreferences.api.js — the logged-in user's own opt-outs.
 *
 * userId is always derived from the JWT on the backend; these endpoints can
 * only ever touch the caller's own rows. Absence of a row = default enabled.
 * eventKey 'ALL' is the user's global default; a specific eventKey row wins
 * over 'ALL'. Resolution is fail-open on the backend.
 *
 * GET    /v1/me/notification-preferences            — my saved rows
 * PUT    /v1/me/notification-preferences            — upsert { eventKey, emailEnabled, inAppEnabled }
 * DELETE /v1/me/notification-preferences/:eventKey  — reset one key to default
 */
import api from '../config/axios.config'

export const notificationPreferencesApi = {
  list:   ()          => api.get('/v1/me/notification-preferences'),
  upsert: (data)      => api.put('/v1/me/notification-preferences', data),
  reset:  (eventKey)  => api.delete(`/v1/me/notification-preferences/${eventKey}`),
}
