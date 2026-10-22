import api from '../config/axios.config'
export const authApi = {
  login:               (email, password) => api.post('/v1/auth/login', { email, password }),
  /** Revokes the refresh token server-side. lib/session.endSession() calls this for every sign-out. */
  logout:              (refreshToken)    => api.post('/v1/auth/logout', { refreshToken }),
  requestReset:        (email)           => api.post('/v1/auth/request-password-reset', { email }),
  resetPassword:       (token, newPassword) => api.post('/v1/auth/reset-password', { token, newPassword }),
  refreshToken:        (refreshToken)    => api.post('/v1/auth/refresh', { refreshToken }),
  resendInvitation:  (data)            => api.post('/v1/auth/resend-invitation', data),
  /** Re-issues the session scoped to another tenant this identity belongs to. */
  switchTenant:      (tenantId)        => api.post('/v1/auth/switch-tenant', { tenantId }),
}