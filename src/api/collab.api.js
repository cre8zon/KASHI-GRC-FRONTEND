import api from '../config/axios.config'

/**
 * Collaboration workspaces — the shared space between an organisation and its
 * audit firm (or internal audit and the business). Phase 1: workspaces,
 * members, programmes. Every rule is enforced server-side
 * (CollabAccessService); the UI only shows what the server allows.
 */
export const collabApi = {
  list:          ()              => api.get('/v1/collab/workspaces'),
  options:       ()              => api.get('/v1/collab/workspaces/options'),
  create:        (body)          => api.post('/v1/collab/workspaces', body),
  overview:      (id)            => api.get(`/v1/collab/workspaces/${id}`),
  update:        (id, body)      => api.patch(`/v1/collab/workspaces/${id}`, body),

  eligibleMembers: (id)          => api.get(`/v1/collab/workspaces/${id}/eligible-members`),
  addMember:     (id, body)      => api.post(`/v1/collab/workspaces/${id}/members`, body),
  changeRole:    (id, mid, role) => api.patch(`/v1/collab/workspaces/${id}/members/${mid}`, { role }),
  removeMember:  (id, mid)       => api.delete(`/v1/collab/workspaces/${id}/members/${mid}`),

  createProgramme: (id, body)          => api.post(`/v1/collab/workspaces/${id}/programmes`, body),
  updateProgramme: (id, pid, body)     => api.patch(`/v1/collab/workspaces/${id}/programmes/${pid}`, body),
  deleteProgramme: (id, pid)           => api.delete(`/v1/collab/workspaces/${id}/programmes/${pid}`),
  addProgrammeMember:    (id, pid, userId) => api.post(`/v1/collab/workspaces/${id}/programmes/${pid}/members`, { userId }),
  removeProgrammeMember: (id, pid, userId) => api.delete(`/v1/collab/workspaces/${id}/programmes/${pid}/members/${userId}`),

  // ── Plan (phase 2) ────────────────────────────────────────────────────────
  plan:        (id, programmeId)     => api.get(`/v1/collab/workspaces/${id}/plan`, { params: programmeId ? { programmeId } : {} }),
  createItem:  (id, body)            => api.post(`/v1/collab/workspaces/${id}/plan/items`, body),
  updateItem:  (id, itemId, body)    => api.patch(`/v1/collab/workspaces/${id}/plan/items/${itemId}`, body),
  deleteItem:  (id, itemId, reason)  => api.delete(`/v1/collab/workspaces/${id}/plan/items/${itemId}`, { params: reason ? { reason } : {} }),
  itemHistory: (id, itemId)          => api.get(`/v1/collab/workspaces/${id}/plan/items/${itemId}/history`),
  linkableEngagements: (id)          => api.get(`/v1/collab/workspaces/${id}/plan/linkable-engagements`),
  savePlanColumns: (id, columns)     => api.put(`/v1/collab/workspaces/${id}/plan/columns`, { columns }),
  reorderPlan: (id, ids)             => api.post(`/v1/collab/workspaces/${id}/plan/reorder`, { ids }),
  exportPlan:  (id, programmeId)     => api.get(`/v1/collab/workspaces/${id}/plan/export`,
                                          { params: programmeId ? { programmeId } : {}, responseType: 'blob' }),
  importPreview: (id, programmeId, file) => {
    const fd = new FormData(); fd.append('file', file); if (programmeId) fd.append('programmeId', programmeId)
    return api.post(`/v1/collab/workspaces/${id}/plan/import/preview`, fd)
  },
  importCommit: (id, programmeId, file) => {
    const fd = new FormData(); fd.append('file', file); if (programmeId) fd.append('programmeId', programmeId)
    return api.post(`/v1/collab/workspaces/${id}/plan/import`, fd)
  },
  engagementTimeline: (engagementId) => api.get(`/v1/collab/engagements/${engagementId}/timeline`),
  myWeek:      ()                    => api.get('/v1/collab/my-week'),

  // ── Meetings (phase 3) ────────────────────────────────────────────────────
  workspaceMeetings: (id)            => api.get(`/v1/collab/workspaces/${id}/meetings`),
  myMeetings:  (from, to)            => api.get('/v1/collab/meetings', { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } }),
  meetingOptions: ()                 => api.get('/v1/collab/meetings/options'),
  eligibleAttendees: (workspaceId, programmeId) => api.get('/v1/collab/meetings/eligible-attendees',
                                          { params: { ...(workspaceId ? { workspaceId } : {}), ...(programmeId ? { programmeId } : {}) } }),
  meeting:     (mid)                 => api.get(`/v1/collab/meetings/${mid}`),
  createMeeting: (body)              => api.post('/v1/collab/meetings', body),
  updateMeeting: (mid, body)         => api.patch(`/v1/collab/meetings/${mid}`, body),
  addFollowUp: (mid, body)           => api.post(`/v1/collab/meetings/${mid}/follow-ups`, body),
  myWeekExtras: ()                   => api.get('/v1/collab/my-week/extras'),

  // ── In-app calls (phase 4) ────────────────────────────────────────────────
  callOptions: ()                    => api.get('/v1/collab/calls/options'),
  callNow:     (body)                => api.post('/v1/collab/calls', body),
  joinMeeting: (mid)                 => api.post(`/v1/collab/meetings/${mid}/join`),
  rooms:       ()                    => api.get('/v1/collab/rooms'),
  createRoom:  (body)                => api.post('/v1/collab/rooms', body),
  updateRoom:  (rid, body)           => api.patch(`/v1/collab/rooms/${rid}`, body),
  joinRoom:    (rid)                 => api.post(`/v1/collab/rooms/${rid}/join`),
  room:        (rid)                 => api.get(`/v1/collab/rooms/${rid}`),
  scheduleInRoom: (rid, body)        => api.post(`/v1/collab/rooms/${rid}/meetings`, body),
  cancelSeries: (mid)                => api.post(`/v1/collab/meetings/${mid}/cancel-series`),

  // ── Requests (phase 3) ────────────────────────────────────────────────────
  requests:    (id)                  => api.get(`/v1/collab/workspaces/${id}/requests`),
  raiseRequest: (id, body)           => api.post(`/v1/collab/workspaces/${id}/requests`, body),
  raiseRequests: (id, rows)          => api.post(`/v1/collab/workspaces/${id}/requests/bulk`, { rows }),
  updateRequest: (id, rid, body)     => api.patch(`/v1/collab/workspaces/${id}/requests/${rid}`, body),
  answerRequest: (id, rid, note)     => api.post(`/v1/collab/workspaces/${id}/requests/${rid}/answer`, { note }),
  decideRequest: (id, rid, decision, note) => api.post(`/v1/collab/workspaces/${id}/requests/${rid}/decision`, { decision, note }),
}

export const unwrapList = (r) => {
  const d = r?.data?.data ?? r?.data ?? r
  return Array.isArray(d) ? d : []
}
export const unwrapOne = (r) => r?.data?.data ?? r?.data ?? r
export const errMsg = (e, fallback) => e?.response?.data?.message || fallback
