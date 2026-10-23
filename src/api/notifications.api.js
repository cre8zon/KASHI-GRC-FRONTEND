import api from '../config/axios.config'
export const notificationsApi = {
  list:    (params) => api.get('/v1/notifications', { params }),
  markRead: (id)   => api.put(`/v1/notifications/${id}/read`),
  // All unread, not one page — the one number the bell, page and sidebar show.
  unreadCount: ()  => api.get('/v1/notifications/unread-count'),
  // Every unread one (the page used to mark only what it had loaded).
  readAll:  ()     => api.put('/v1/notifications/read-all'),
  // "I am looking at this page": notifications about it are read.
  readVisited: (path, query) => api.post('/v1/notifications/read-visited', { path, query }),
}