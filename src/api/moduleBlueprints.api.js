/**
 * moduleBlueprints.api.js — Zero-code GRC module blueprint management.
 *
 * Each blueprint defines a complete GRC module — fields, status flow,
 * workflow eligibility, and UI config — without code deployment.
 *
 * GET    /v1/admin/module-blueprints              — list all blueprints
 * GET    /v1/admin/module-blueprints/:id          — single blueprint
 * GET    /v1/admin/module-blueprints/by-type/:et  — lookup by entityType (used by UniversalModulePage)
 * POST   /v1/admin/module-blueprints              — create
 * PUT    /v1/admin/module-blueprints/:id          — update
 * DELETE /v1/admin/module-blueprints/:id          — delete
 * PUT    /v1/admin/module-blueprints/:id/activate   — publish
 * PUT    /v1/admin/module-blueprints/:id/deactivate — unpublish
 */
import api from '../config/axios.config'

export const moduleBlueprintsApi = {
  list:       (params)     => api.get('/v1/admin/module-blueprints', { params }),
  get:        (id)         => api.get(`/v1/admin/module-blueprints/${id}`),
  byType:     (entityType) => api.get(`/v1/admin/module-blueprints/by-type/${entityType}`),
  create:     (data)       => api.post('/v1/admin/module-blueprints', data),
  update:     (id, data)   => api.put(`/v1/admin/module-blueprints/${id}`, data),
  delete:     (id)         => api.delete(`/v1/admin/module-blueprints/${id}`),
  activate:   (id)         => api.put(`/v1/admin/module-blueprints/${id}/activate`),
  deactivate: (id)         => api.put(`/v1/admin/module-blueprints/${id}/deactivate`),
}