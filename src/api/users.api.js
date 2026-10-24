import api from '../config/axios.config'

export const usersApi = {
  list:     (params)     => api.get('/v1/users', { params }),
  getById:  (id)         => api.get(`/v1/users/${id}`),
  create:   (data)       => api.post('/v1/users', data),
  update:   (id, data)   => api.put(`/v1/users/${id}`, data),
  remove:   (id)         => api.delete(`/v1/users/${id}`),
  // reason is kept in the account's status history (who, when, why)
  suspend:  (id, reason) => api.patch(`/v1/users/${id}/suspend`, reason ? { reason } : {}),
  activate: (id)         => api.patch(`/v1/users/${id}/activate`),
  /** What suspending this person affects: { is_owner, blocking_responsibilities: { open_tasks, active_delegations } } */
  responsibilities: (id) => api.get(`/v1/users/${id}/responsibilities`),
  statusHistory:    (id) => api.get(`/v1/users/${id}/status-history`),
  /** The caller's organisation's owner: { ownerUserId } */
  owner:    ()           => api.get('/v1/users/owner'),
  /** Transfer ownership to this person — the current owner only. */
  makeOwner: (id, reason) => api.post(`/v1/users/${id}/make-owner`, reason ? { reason } : {}),
  changePassword: (data) => api.put('/v1/users/password', data),  // backend: PUT /v1/users/password

  /** Invite — creates user AND sends welcome email with temp password */
  invite: (data) => api.post('/v1/users', { ...data, sendWelcomeEmail: true }),

  roles: {
    assign: (tenantId, userId, data) =>
      api.post(`/v1/roles/users/${tenantId}/${userId}/assign`, data),
    remove: (tenantId, userId, roleId) =>
      api.delete(`/v1/roles/users/${tenantId}/${userId}/remove/${roleId}`),
  },
  preferences: {
    save: (prefs) => api.patch('/v1/users/me/preferences', prefs),
    get:  ()      => api.get('/v1/users/me/preferences'),
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