import api from '../config/axios.config'

/** Internal chat — staff only; every rule is enforced server-side (ChatService). */
export const chatApi = {
  me:            ()               => api.get('/v1/chat/me'),
  unread:        ()               => api.get('/v1/chat/unread'),
  people:        ()               => api.get('/v1/chat/people'),
  conversations: ()               => api.get('/v1/chat/conversations'),
  browse:        ()               => api.get('/v1/chat/conversations/browse'),
  create:        (body)           => api.post('/v1/chat/conversations', body),
  conversation:  (id)             => api.get(`/v1/chat/conversations/${id}`),
  update:        (id, body)       => api.patch(`/v1/chat/conversations/${id}`, body),
  join:          (id)             => api.post(`/v1/chat/conversations/${id}/join`),
  addMembers:    (id, userIds)    => api.post(`/v1/chat/conversations/${id}/members`, { userIds }),
  removeMember:  (id, userId)     => api.delete(`/v1/chat/conversations/${id}/members/${userId}`),
  messages:      (id, before)     => api.get(`/v1/chat/conversations/${id}/messages`, { params: before ? { before, limit: 50 } : { limit: 50 } }),
  send:          (id, body, mentions) => api.post(`/v1/chat/conversations/${id}/messages`, { body, mentions }),
  read:          (id, messageId)  => api.post(`/v1/chat/conversations/${id}/read`, messageId ? { messageId } : {}),
  edit:          (mid, body)      => api.patch(`/v1/chat/messages/${mid}`, { body }),
  remove:        (mid)            => api.delete(`/v1/chat/messages/${mid}`),
}
export const one = (r) => r?.data?.data ?? r?.data ?? r
export const list = (r) => { const d = one(r); return Array.isArray(d) ? d : [] }
export const errMsg = (e, fallback) => e?.response?.data?.message || fallback
