import api from '../config/axios.config'

/**
 * Website enquiries inbox — platform side, under /v1/admin/enquiries
 * (SIDE_SYSTEM only). Converting to a tenant goes through
 * tenantsApi.provision({ ..., enquiryId }), not through this file.
 */
const E = '/v1/admin/enquiries'

export const enquiriesApi = {
  list:       (params)        => api.get(E, { params }),
  get:        (id)            => api.get(`${E}/${id}`),
  update:     (id, data)      => api.patch(`${E}/${id}`, data),
  addNote:    (id, body)      => api.post(`${E}/${id}/notes`, { body }),
  linkTenant: (id, tenantId)  => api.post(`${E}/${id}/link-tenant`, { tenantId }),
  stats:      (days = 90)     => api.get(`${E}/stats`, { params: { days } }),
  config:     ()              => api.get(`${E}/config`),
}
