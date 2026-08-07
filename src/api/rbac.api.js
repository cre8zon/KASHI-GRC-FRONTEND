/**
 * rbac.api.js — KashiGuard RBAC management API calls.
 *
 * Permissions:    GET/POST/PUT/DELETE /v1/admin/rbac/permissions
 *                 GET                 /v1/admin/rbac/permissions/:permCode/roles  ← NEW
 * Role grants:    GET/POST/DELETE     /v1/admin/rbac/roles/:roleId/grants
 * User overrides: GET/POST/PATCH      /v1/admin/rbac/user-overrides
 * SoD rules:      GET/POST/PUT/DELETE /v1/admin/rbac/sod-rules
 * Summary:        GET                 /v1/admin/rbac/summary
 * Roles:          GET                 /v1/tenants/:id/roles/hierarchy
 */
import api from '../config/axios.config'

export const rbacApi = {
  permissions: {
    list:   (params) => api.get('/v1/admin/rbac/permissions', { params }),
    create: (data)   => api.post('/v1/admin/rbac/permissions', data),
    update: (id, data) => api.put(`/v1/admin/rbac/permissions/${id}`, data),
    delete: (id)     => api.delete(`/v1/admin/rbac/permissions/${id}`),

    /**
     * GET /v1/admin/rbac/permissions/{permCode}/roles
     * Returns all roles that currently hold this permission code.
     * Used by NavigationAdminPage PermissionRolesModal — "who can see this nav item?"
     * Response: [{ grantId, roleId, roleName, roleSide, roleLevel, granted }]
     */
    listRoles: (permCode) => api.get(`/v1/admin/rbac/permissions/${encodeURIComponent(permCode)}/roles`),
  },
  grants: {
    list:   (roleId) => api.get(`/v1/admin/rbac/roles/${roleId}/grants`),
    upsert: (roleId, data) => api.post(`/v1/admin/rbac/roles/${roleId}/grants`, data),
    delete: (id)     => api.delete(`/v1/admin/rbac/grants/${id}`),
  },
  overrides: {
    list:   (params) => api.get('/v1/admin/rbac/user-overrides', { params }),
    create: (data)   => api.post('/v1/admin/rbac/user-overrides', data),
    update: (id, data) => api.put(`/v1/admin/rbac/user-overrides/${id}`, data),
    revoke: (id)     => api.patch(`/v1/admin/rbac/user-overrides/${id}/revoke`),
  },
  sod: {
    list:   ()       => api.get('/v1/admin/rbac/sod-rules'),
    create: (data)   => api.post('/v1/admin/rbac/sod-rules', data),
    update: (id, data) => api.put(`/v1/admin/rbac/sod-rules/${id}`, data),
    delete: (id)     => api.delete(`/v1/admin/rbac/sod-rules/${id}`),
  },
  summary: {
    get: () => api.get('/v1/admin/rbac/summary'),
  },
  roles: {
    /**
     * includeSuspended=true is for RBAC admin only — it surfaces parked
     * roles so they can be edited/reactivated. Every assignment picker
     * leaves it false so suspended roles stay out of the catalogue.
     */
    list: (tenantId, includeSuspended = false) => {
      const tid = tenantId || 1
      return api.get(`/v1/tenants/${tid}/roles/hierarchy`, {
        params: includeSuspended ? { includeSuspended: true } : undefined,
      })
        .then(data => {
          const hier = data?.hierarchy || data?.data?.hierarchy || {}
          return Object.entries(hier).flatMap(([side, roles]) =>
            (roles || []).map(r => ({
              id:        r.role_id ?? r.id,
              name:      r.name   ?? r.roleName,
              side,
              level:     r.level,
              status:    r.status ?? 'ACTIVE',
              tenantId:  r.tenant_id ?? null,
              isGlobal:  r.is_global ?? (r.tenant_id == null),
              isSystem:  r.is_system ?? false,
              userCount: r.user_count ?? 0,
              permissionsCount: r.permissions_count ?? 0,
              description: r.description ?? '',
            }))
          )
        })
    },
    create:    (tenantId, data) => api.post(`/v1/tenants/${tenantId || 1}/roles`, data),
    delete:    (tenantId, roleId) => api.delete(`/v1/tenants/${tenantId || 1}/roles/${roleId}`),
    setStatus: (roleId, status) => api.patch(`/v1/roles/${roleId}/status`, { status }),
  },
}