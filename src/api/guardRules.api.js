import api from '../config/axios.config'

export const guardRulesApi = {
  list:     ()         => api.get('/v1/guard/rules'),
  forTag:   (tag)      => api.get(`/v1/guard/rules/tag/${encodeURIComponent(tag)}`),
  create:   (data)     => api.post('/v1/guard/rules', data),
  update:   (id, data) => api.put(`/v1/guard/rules/${id}`, data),
  toggle:   (id)       => api.patch(`/v1/guard/rules/${id}/toggle`),
  delete:   (id)       => api.delete(`/v1/guard/rules/${id}`),
}

export const blueprintsApi = {
  list:   ()         => api.get('/v1/action-item-blueprints'),
  create: (data)     => api.post('/v1/action-item-blueprints', data),
  update: (id, data) => api.put(`/v1/action-item-blueprints/${id}`, data),
  delete: (id)       => api.delete(`/v1/action-item-blueprints/${id}`),
}