import api from '../config/axios.config'
export const authApi = {
  login:               (email, password) => api.post('/v1/auth/login', { email, password }),
  logout:              (userId)          => api.post('/v1/auth/logout', null, { params: { userId } }),
  requestReset:        (email)           => api.post('/v1/auth/request-password-reset', { email }),
  resetPassword:       (token, newPassword) => api.post('/v1/auth/reset-password', { token, newPassword }),
  changePassword:      (data)            => api.post('/v1/auth/password', data),
  refreshToken:        (refreshToken)    => api.post('/v1/auth/refresh', { refreshToken }),
  resendInvitation:  (data)            => api.post('/v1/auth/resend-invitation', data),
}
