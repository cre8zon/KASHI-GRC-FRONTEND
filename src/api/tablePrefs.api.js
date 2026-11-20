import api from '../config/axios.config'

/**
 * The signed-in user's own table layouts (column widths, hidden columns,
 * order) — /v1/me scope, so every call is about the caller only.
 */
export const tablePrefsApi = {
  get:   (tableKey)        => api.get(`/v1/me/table-preferences/${encodeURIComponent(tableKey)}`),
  save:  (tableKey, prefs) => api.put(`/v1/me/table-preferences/${encodeURIComponent(tableKey)}`, prefs),
  reset: (tableKey)        => api.delete(`/v1/me/table-preferences/${encodeURIComponent(tableKey)}`),
}
