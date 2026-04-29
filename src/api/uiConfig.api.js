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
}

// ─── Admin CRUD (/v1/admin/ui/*) — Platform Admin only ───────────────────────
export const uiAdminApi = {

  navigation: {
    list:   (params)     => api.get('/v1/admin/ui/navigation', { params }),
    create: (data)       => api.post('/v1/admin/ui/navigation', data),
    update: (id, data)   => api.put(`/v1/admin/ui/navigation/${id}`, data),
    delete: (id)         => api.delete(`/v1/admin/ui/navigation/${id}`),
  },

  components: {
    list:   (params)     => api.get('/v1/admin/ui/components', { params }),
    create: (data)       => api.post('/v1/admin/ui/components', data),
    update: (id, data)   => api.put(`/v1/admin/ui/components/${id}`, data),
    delete: (id)         => api.delete(`/v1/admin/ui/components/${id}`),
  },

  options: {
    list:   (componentId) => api.get(`/v1/admin/ui/options/${componentId}`),
    create: (data)        => api.post('/v1/admin/ui/options', data),
    update: (id, data)    => api.put(`/v1/admin/ui/options/${id}`, data),
    delete: (id)          => api.delete(`/v1/admin/ui/options/${id}`),
  },

  layouts: {
    create: (data)       => api.post('/v1/admin/ui/layouts', data),
    update: (id, data)   => api.put(`/v1/admin/ui/layouts/${id}`, data),
    delete: (id)         => api.delete(`/v1/admin/ui/layouts/${id}`),
  },

  forms: {
    list:   (params)     => api.get('/v1/admin/ui/forms', { params }),
    create: (data)       => api.post('/v1/admin/ui/forms', data),
    update: (id, data)   => api.put(`/v1/admin/ui/forms/${id}`, data),
    delete: (id)         => api.delete(`/v1/admin/ui/forms/${id}`),
  },

  formFields: {
    list:   (formId)     => api.get(`/v1/admin/ui/form-fields/${formId}`),
    create: (data)       => api.post('/v1/admin/ui/form-fields', data),
    update: (id, data)   => api.put(`/v1/admin/ui/form-fields/${id}`, data),
    delete: (id)         => api.delete(`/v1/admin/ui/form-fields/${id}`),
  },

  actions: {
    create: (data)       => api.post('/v1/admin/ui/actions', data),
    update: (id, data)   => api.put(`/v1/admin/ui/actions/${id}`, data),
    delete: (id)         => api.delete(`/v1/admin/ui/actions/${id}`),
  },

  widgets: {
    create: (data)       => api.post('/v1/admin/ui/widgets', data),
    update: (id, data)   => api.put(`/v1/admin/ui/widgets/${id}`, data),
    delete: (id)         => api.delete(`/v1/admin/ui/widgets/${id}`),
  },

  flags: {
    list:   (params)     => api.get('/v1/admin/ui/flags', { params }),
    create: (data)       => api.post('/v1/admin/ui/flags', data),
    update: (id, data)   => api.put(`/v1/admin/ui/flags/${id}`, data),
    delete: (id)         => api.delete(`/v1/admin/ui/flags/${id}`),
  },

  branding: {
    create: (data)       => api.post('/v1/admin/ui/branding', data),
    update: (data)       => api.put('/v1/admin/ui/branding', data),
  },
}