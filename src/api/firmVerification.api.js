import api from '../config/axios.config'

/**
 * Audit-firm verification — a platform activity.
 *
 *   firmVerificationAdminApi   platform users (/v1/admin/firm-verifications, SIDE_SYSTEM);
 *                              decisions also need platform.firm_verification.review
 *   firmConfirmationPublicApi  the firm's one-time email link — anonymous, the token
 *                              in the body is the credential
 */
export const firmConfirmationPublicApi = {
  preview: (token) => api.post('/v1/firm-verification/public/preview', { token }),
  confirm: (token) => api.post('/v1/firm-verification/public/confirm', { token }),
}

const A = '/v1/admin/firm-verifications'

export const firmVerificationAdminApi = {
  list:         (status)          => api.get(A, { params: status ? { status } : {} }),
  get:          (id)              => api.get(`${A}/${id}`),
  forTenant:    (tenantId)        => api.get(`${A}/tenants/${tenantId}`),
  openOnBehalf: (tenantId)        => api.post(`${A}/tenants/${tenantId}/open`),
  save:         (id, data)        => api.put(`${A}/${id}`, data),
  sendConfirmation: (id)          => api.post(`${A}/${id}/send-confirmation`),
  submit:       (id)              => api.post(`${A}/${id}/submit`),
  withdraw:     (id, reason)      => api.post(`${A}/${id}/withdraw`, { reason }),
  downloadUrl:  (id, documentId)  => api.get(`${A}/${id}/documents/${documentId}/download-url`),
  startReview:  (id)              => api.post(`${A}/${id}/start-review`),
  requestInfo:  (id, message)     => api.post(`${A}/${id}/request-info`, { message }),
  approve:      (id, data)        => api.post(`${A}/${id}/approve`, data),
  reject:       (id, note)        => api.post(`${A}/${id}/reject`, { note }),
  revoke:       (id, reason)      => api.post(`${A}/${id}/revoke`, { reason }),
}
