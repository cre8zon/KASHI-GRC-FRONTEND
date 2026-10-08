import api from '../config/axios.config'

/** Internal chat — staff only; every rule is enforced server-side (ChatService). */
export const chatApi = {
  me:            ()               => api.get('/v1/chat/me'),
  unread:        ()               => api.get('/v1/chat/unread'),
  people:        ()               => api.get('/v1/chat/people'),
  presence:      ()               => api.get('/v1/chat/presence'),
  conversations: ()               => api.get('/v1/chat/conversations'),
  browse:        ()               => api.get('/v1/chat/conversations/browse'),
  create:        (body)           => api.post('/v1/chat/conversations', body),
  conversation:  (id)             => api.get(`/v1/chat/conversations/${id}`),
  update:        (id, body)       => api.patch(`/v1/chat/conversations/${id}`, body),
  join:          (id)             => api.post(`/v1/chat/conversations/${id}/join`),
  addMembers:    (id, userIds)    => api.post(`/v1/chat/conversations/${id}/members`, { userIds }),
  removeMember:  (id, userId)     => api.delete(`/v1/chat/conversations/${id}/members/${userId}`),
  messages:      (id, before)     => api.get(`/v1/chat/conversations/${id}/messages`, { params: before ? { before, limit: 50 } : { limit: 50 } }),
  send:          (id, body, mentions, extra) => api.post(`/v1/chat/conversations/${id}/messages`, { body, mentions, ...(extra || {}) }),
  read:          (id, messageId)  => api.post(`/v1/chat/conversations/${id}/read`, messageId ? { messageId } : {}),
  // Separate from read on purpose: this is "my client has it", reported by the
  // app-wide socket listener the moment a push lands, whether or not the person
  // is looking at chat. See useChatPresence.
  delivered:     (id, messageId)  => api.post(`/v1/chat/conversations/${id}/delivered`, messageId ? { messageId } : {}),
  edit:          (mid, body)      => api.patch(`/v1/chat/messages/${mid}`, { body }),
  remove:        (mid)            => api.delete(`/v1/chat/messages/${mid}`),
  react:         (mid, emoji)     => api.post(`/v1/chat/messages/${mid}/reactions`, { emoji }),
  pin:           (mid, pinned)    => api.post(`/v1/chat/messages/${mid}/pin`, { pinned }),
  pins:          (id)             => api.get(`/v1/chat/conversations/${id}/pins`),
  members:       (id)             => api.get(`/v1/chat/conversations/${id}/members`),
  // Per message, fetched only when the info panel opens. The ticks come from
  // the conversation's watermarks and need no request; this is the one call
  // that can say WHEN each person crossed this particular message.
  receipts:      (mid)            => api.get(`/v1/chat/messages/${mid}/receipts`),
  shared:        (id, type, before) => api.get(`/v1/chat/conversations/${id}/shared`, { params: before ? { type, before } : { type } }),
  search:        (id, q)          => api.get(`/v1/chat/conversations/${id}/search`, { params: { q } }),
  typing:        (id)             => api.post(`/v1/chat/conversations/${id}/typing`),
}
export const one = (r) => r?.data?.data ?? r?.data ?? r
export const list = (r) => { const d = one(r); return Array.isArray(d) ? d : [] }
export const errMsg = (e, fallback) => e?.response?.data?.message || fallback