import api from '../config/axios.config'

// ─── Read-only (frontend consumer) ───────────────────────────────────────────

export const uiConfigApi = {
  bootstrap:    ()                        => api.get('/v1/ui-config/bootstrap'),
  navigation:   ()                        => api.get('/v1/ui-config/navigation'),
  screenConfig: (screenKey)               => api.get(`/v1/ui-config/screen/${screenKey}`),
  form:         (formKey)                 => api.get(`/v1/ui-config/form/${formKey}`),
  actions:      (screenKey, entityStatus) => api.get(`/v1/ui-config/actions/${screenKey}`, { params: { entityStatus } }),
  dashboard:    ()                        => api.get('/v1/ui-config/dashboard'),
  branding:     ()                        => api.get('/v1/ui-config/branding'),
  viewContext:  (entityType, entityId, stepInstanceId) =>
    api.get('/v1/ui-config/view-context', {
      params: { entityType, entityId: entityId || undefined, stepInstanceId: stepInstanceId || undefined }
    }),
}

// ─── Admin CRUD (/v1/admin/ui/*) ─────────────────────────────────────────────

export const uiAdminApi = {
  navigation: {
    list:   (params)    => api.get('/v1/admin/ui/navigation', { params }),
    create: (data)      => api.post('/v1/admin/ui/navigation', data),
    update: (id, data)  => api.put(`/v1/admin/ui/navigation/${id}`, data),
    delete: (id)        => api.delete(`/v1/admin/ui/navigation/${id}`),
  },
  components: {
    list:   (params)    => api.get('/v1/admin/ui/components', { params }),
    create: (data)      => api.post('/v1/admin/ui/components', data),
    update: (id, data)  => api.put(`/v1/admin/ui/components/${id}`, data),
    delete: (id)        => api.delete(`/v1/admin/ui/components/${id}`),
  },
  options: {
    list:   (componentId) => api.get(`/v1/admin/ui/options/${componentId}`),
    create: (data)        => api.post('/v1/admin/ui/options', data),
    update: (id, data)    => api.put(`/v1/admin/ui/options/${id}`, data),
    delete: (id)          => api.delete(`/v1/admin/ui/options/${id}`),
  },
  layouts: {
    create: (data)      => api.post('/v1/admin/ui/layouts', data),
    update: (id, data)  => api.put(`/v1/admin/ui/layouts/${id}`, data),
    delete: (id)        => api.delete(`/v1/admin/ui/layouts/${id}`),
  },
  forms: {
    list:   (params)    => api.get('/v1/admin/ui/forms', { params }),
    create: (data)      => api.post('/v1/admin/ui/forms', data),
    update: (id, data)  => api.put(`/v1/admin/ui/forms/${id}`, data),
    delete: (id)        => api.delete(`/v1/admin/ui/forms/${id}`),
  },
  formFields: {
    list:   (formId)    => api.get(`/v1/admin/ui/form-fields/${formId}`),
    create: (data)      => api.post('/v1/admin/ui/form-fields', data),
    update: (id, data)  => api.put(`/v1/admin/ui/form-fields/${id}`, data),
    delete: (id)        => api.delete(`/v1/admin/ui/form-fields/${id}`),
  },
  actions: {
    list:   (params)    => api.get('/v1/admin/ui/actions', { params }),
    create: (data)      => api.post('/v1/admin/ui/actions', data),
    update: (id, data)  => api.put(`/v1/admin/ui/actions/${id}`, data),
    delete: (id)        => api.delete(`/v1/admin/ui/actions/${id}`),
  },
  widgets: {
    list:   (params)    => api.get('/v1/admin/ui/widgets', { params }),
    create: (data)      => api.post('/v1/admin/ui/widgets', data),
    update: (id, data)  => api.put(`/v1/admin/ui/widgets/${id}`, data),
    delete: (id)        => api.delete(`/v1/admin/ui/widgets/${id}`),
  },
  flags: {
    list:   (params)    => api.get('/v1/admin/ui/flags', { params }),
    create: (data)      => api.post('/v1/admin/ui/flags', data),
    update: (id, data)  => api.put(`/v1/admin/ui/flags/${id}`, data),
    delete: (id)        => api.delete(`/v1/admin/ui/flags/${id}`),
  },
  branding: {
    create: (data)      => api.post('/v1/admin/ui/branding', data),
    update: (data)      => api.put('/v1/admin/ui/branding', data),
  },
}

// ─── Module blueprints (/v1/admin/module-blueprints) ─────────────────────────

export const moduleBlueprintApi = {
  list:       (params)     => api.get('/v1/admin/module-blueprints', { params }),
  get:        (id)         => api.get(`/v1/admin/module-blueprints/${id}`),
  byType:     (entityType) => api.get(`/v1/admin/module-blueprints/by-type/${entityType}`),
  create:     (data)       => api.post('/v1/admin/module-blueprints', data),
  update:     (id, data)   => api.put(`/v1/admin/module-blueprints/${id}`, data),
  delete:     (id)         => api.delete(`/v1/admin/module-blueprints/${id}`),
  activate:   (id)         => api.put(`/v1/admin/module-blueprints/${id}/activate`),
  deactivate: (id)         => api.put(`/v1/admin/module-blueprints/${id}/deactivate`),
}

// ─── RBAC admin (/v1/admin/rbac/*) ───────────────────────────────────────────

export const rbacApi = {
  permissions: {
    list:   (params)       => api.get('/v1/admin/rbac/permissions', { params }),
    create: (data)         => api.post('/v1/admin/rbac/permissions', data),
    update: (id, data)     => api.put(`/v1/admin/rbac/permissions/${id}`, data),
    delete: (id)           => api.delete(`/v1/admin/rbac/permissions/${id}`),
  },
  grants: {
    listForRole: (roleId)       => api.get(`/v1/admin/rbac/roles/${roleId}/grants`),
    upsert:      (roleId, data) => api.post(`/v1/admin/rbac/roles/${roleId}/grants`, data),
    delete:      (id)           => api.delete(`/v1/admin/rbac/grants/${id}`),
  },
  overrides: {
    list:   (params) => api.get('/v1/admin/rbac/user-overrides', { params }),
    create: (data)   => api.post('/v1/admin/rbac/user-overrides', data),
    revoke: (id)     => api.patch(`/v1/admin/rbac/user-overrides/${id}/revoke`),
  },
  sod: {
    list:   (params)     => api.get('/v1/admin/rbac/sod-rules', { params }),
    create: (data)       => api.post('/v1/admin/rbac/sod-rules', data),
    update: (id, data)   => api.put(`/v1/admin/rbac/sod-rules/${id}`, data),
    delete: (id)         => api.delete(`/v1/admin/rbac/sod-rules/${id}`),
  },
}

// ─── Notification templates (/v1/admin/notification-templates) ────────────────

export const notificationTemplateApi = {
  list:    (params) => api.get('/v1/admin/notification-templates', { params }),
  get:     (id)     => api.get(`/v1/admin/notification-templates/${id}`),
  create:  (data)   => api.post('/v1/admin/notification-templates', data),
  update:  (id, d)  => api.put(`/v1/admin/notification-templates/${id}`, d),
  delete:  (id)     => api.delete(`/v1/admin/notification-templates/${id}`),
  preview: (data)   => api.post('/v1/admin/notification-templates/preview', data),
}