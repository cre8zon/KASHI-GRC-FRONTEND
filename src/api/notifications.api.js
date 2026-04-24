import api from '../config/axios.config'
export const notificationsApi = {
  list:    (params) => api.get('/v1/notifications', { params }),
  markRead: (id)   => api.put(`/v1/notifications/${id}/read`),
}
