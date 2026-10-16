import api from '../config/axios.config'

export const tenantsApi = {
  list:     (params)   => api.get('/v1/tenants', { params }),
  getById:  (id)       => api.get(`/v1/tenants/${id}`),
  create:   (data)     => api.post('/v1/tenants', data),
  update:   (id, data) => api.put(`/v1/tenants/${id}`, data),
  suspend:  (id)       => api.put(`/v1/tenants/${id}`, { status: 'SUSPENDED' }),
  activate: (id)       => api.put(`/v1/tenants/${id}`, { status: 'ACTIVE' }),
  sendWelcomeEmail: (id, data) => api.post(`/v1/tenants/${id}/send-welcome-email`, data),
  getOwner:         (id)       => api.get(`/v1/tenants/${id}/owner`),
  getFeatures:      (id)              => api.get(`/v1/tenants/${id}/features`),
  setFeature:       (id, flagKey, enabled) =>
                       api.put(`/v1/tenants/${id}/features/${flagKey}`, { enabled }),
  getUsage:         (id)              => api.get(`/v1/tenants/${id}/usage`),
  getUsers:         (id)              => api.get(`/v1/tenants/${id}/users`),
  // Create Tenant wizard: one atomic call, plus per-step checks
  provision:        (data)            => api.post('/v1/tenants/provision', data),
  availability:     (params)          => api.get('/v1/tenants/availability', { params }),
}