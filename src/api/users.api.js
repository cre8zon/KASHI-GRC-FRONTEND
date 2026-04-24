import api from '../config/axios.config'

export const usersApi = {
  list:     (params)     => api.get('/v1/users', { params }),
  getById:  (id)         => api.get(`/v1/users/${id}`),
  create:   (data)       => api.post('/v1/users', data),
  update:   (id, data)   => api.put(`/v1/users/${id}`, data),
  remove:   (id)         => api.delete(`/v1/users/${id}`),
  suspend:  (id)         => api.patch(`/v1/users/${id}/suspend`),
  activate: (id)         => api.patch(`/v1/users/${id}/activate`),
  changePassword: (data) => api.post('/v1/users/password', data),

  /** Invite — creates user AND sends welcome email with temp password */
  invite: (data) => api.post('/v1/users', { ...data, sendWelcomeEmail: true }),

  roles: {
    assign: (tenantId, userId, data) =>
      api.post(`/v1/roles/users/${tenantId}/${userId}/assign`, data),
    remove: (tenantId, userId, roleId) =>
      api.delete(`/v1/roles/users/${tenantId}/${userId}/remove/${roleId}`),
  },
}

export const rolesApi = {
  /** List roles for a tenant filtered by side (ORGANIZATION, VENDOR, etc.) */
  list: (tenantId, side) =>
    api.get(`/v1/tenants/${tenantId}/roles/hierarchy`, { params: { side } }),

  create: (tenantId, data) =>
    api.post(`/v1/tenants/${tenantId}/roles`, data),

  update: (tenantId, roleId, data) =>
    api.put(`/v1/tenants/${tenantId}/roles/${roleId}`, data),

  delete: (tenantId, roleId) =>
    api.delete(`/v1/tenants/${tenantId}/roles/${roleId}`),

  assignToUser: (tenantId, userId, roleIds) =>
    api.post(`/v1/roles/users/${tenantId}/${userId}/assign`, { roleIds }),

  removeFromUser: (tenantId, userId, roleId) =>
    api.delete(`/v1/roles/users/${tenantId}/${userId}/remove/${roleId}`),
}
