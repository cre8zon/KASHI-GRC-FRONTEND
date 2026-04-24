import api from '../config/axios.config'

export const emailTemplatesApi = {
  list:      (params) => api.get('/v1/admin/email-templates', { params }),
  getById:   (id)     => api.get(`/v1/admin/email-templates/${id}`),
  getByName: (name)   => api.get(`/v1/admin/email-templates/by-name/${name}`),
  create:    (data)   => api.post('/v1/admin/email-templates', data),
  update:    (id, data) => api.put(`/v1/admin/email-templates/${id}`, data),
  toggle:    (id)     => api.patch(`/v1/admin/email-templates/${id}/toggle`),
  delete:    (id)     => api.delete(`/v1/admin/email-templates/${id}`),
  preview:   (id, variables) => api.post(`/v1/admin/email-templates/${id}/preview`, variables),
  variables: (id)     => api.get(`/v1/admin/email-templates/${id}/variables`),
}
