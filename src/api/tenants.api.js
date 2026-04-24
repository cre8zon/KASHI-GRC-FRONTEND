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
}