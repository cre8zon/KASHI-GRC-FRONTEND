import api from '../config/axios.config'

export const rolesApi = {
  /** List roles for a tenant filtered by side — returns { tenant_id, hierarchy: { SIDE: [{ role_id, name, level, ... }] } } */
  list: (tenantId, side) =>
    api.get(`/v1/tenants/${tenantId}/roles/hierarchy`, { params: { side } }),

  create: (tenantId, data) =>
    api.post(`/v1/tenants/${tenantId}/roles`, data),

  update: (tenantId, roleId, data) =>
    api.put(`/v1/tenants/${tenantId}/roles/${roleId}`, data),

  delete: (tenantId, roleId) =>
    api.delete(`/v1/tenants/${tenantId}/roles/${roleId}`),

  updatePermissions: (roleId, data) =>
    api.put(`/v1/roles/${roleId}/permissions`, data),

  assignToUser: (tenantId, userId, roleIds) =>
    api.post(`/v1/roles/users/${tenantId}/${userId}/assign`, { roleIds }),

  removeFromUser: (tenantId, userId, roleId) =>
    api.delete(`/v1/roles/users/${tenantId}/${userId}/remove/${roleId}`),
}