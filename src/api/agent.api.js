import api from '../config/axios.config'

// The axios interceptor already unwraps { data } — this tolerates both shapes.
const unwrap = (r) => r?.data?.data ?? r?.data ?? r

/** KashiGuard AI — read-only questions over the organisation's own records. */
export const agentApi = {
  /** { sources: [{ key, label, route }], suggestions: [string] } */
  context: () => api.get('/v1/ai/agent/context').then(unwrap),
  /**
   * body: { question, history: [{ role, content }], contextRoute }
   * → { answer, citations: [{ label, kind, type, ref, title, url }], followUps, consulted, interactionId }
   */
  ask: (body) => api.post('/v1/ai/agent/ask', body).then(unwrap),
}

export default agentApi
