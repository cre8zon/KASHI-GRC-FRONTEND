import api from '../config/axios.config'

/**
 * ai.api.js — the AI module's REST surface.
 *
 * POST /v1/ai/policies/suggest-metadata — intent -> policy metadata (create path)
 * POST /v1/ai/policies/draft            — full draft (multi-step pipeline, seconds)
 * POST /v1/ai/policies/rewrite          — rewrite a selection (blocking)
 * POST /v1/ai/policies/rewrite/stream   — rewrite a selection (SSE, see useAiStream)
 * POST /v1/ai/policies/suggest-mappings — which controls this policy satisfies
 * POST /v1/ai/policies/gap-analysis     — what a framework expects and is missing
 * POST /v1/ai/policies/explain          — plain-English gloss on a clause
 *
 * POST /v1/ai/feedback                  — ONE suggestion verdict
 * POST /v1/ai/feedback/batch            — many verdicts (mapping panel)
 * GET  /v1/ai/feedback/acceptance       — the acceptance dashboard
 *
 * GET/PUT /v1/ai/org-profile            — the grounding facts
 * GET  /v1/ai/org-profile/completeness  — progress bar for onboarding
 *
 * ── EVERY SUGGESTION SURFACE MUST CALL feedback ──────────────────────────────
 * Accept, reject, edit AND dismiss. A suggestion shown and silently abandoned is
 * a data point that can only be collected at the instant it happens — it cannot
 * be reconstructed later, and it is the asset the whole module is accumulating.
 */
export const aiApi = {

  // ── Policy generation ──────────────────────────────────────────────────────

  /**
   * CREATE path, step 1. One sentence of intent -> title, description,
   * frameworks, control mappings, review cadence. Fast, cheap, single call.
   * Creates nothing — every field must be editable before the policy is made.
   */
  suggestMetadata: (payload) => api.post('/v1/ai/policies/suggest-metadata', payload),

  /**
   * Full draft. Slow by design — a pipeline of several model calls with a
   * critique pass. Show progressive status text, not a bare spinner.
   *
   * Returns ApiResponse with status 'WARNING' when references were dropped or
   * context was thin; render the warnings rather than presenting the draft as
   * clean.
   */
  draft: (payload) => api.post('/v1/ai/policies/draft', payload),

  rewrite: (payload) => api.post('/v1/ai/policies/rewrite', payload),

  suggestMappings: (payload) => api.post('/v1/ai/policies/suggest-mappings', payload),

  gapAnalysis: (payload) => api.post('/v1/ai/policies/gap-analysis', payload),

  explain: (payload) => api.post('/v1/ai/policies/explain', payload),

  // ── Feedback: the flywheel ─────────────────────────────────────────────────

  /**
   * @param {object} p
   * @param {number} p.interactionId   from the generation response
   * @param {string} p.suggestionType  'CONTROL_MAPPING' | 'SECTION' | 'DRAFT' | 'REWRITE'
   * @param {string} p.suggestionKey   identifies the item: control code, heading
   * @param {string} p.decision        ACCEPTED | ACCEPTED_WITH_EDIT | REJECTED | IGNORED | FLAGGED_WRONG
   * @param {string} [p.originalValue] what the model produced
   * @param {string} [p.finalValue]    what the human kept — drives edit-distance
   * @param {string} [p.reasonCode]    WRONG_CONTROL | TOO_GENERIC | HALLUCINATED
   * @param {number} [p.timeToDecideSeconds] an instant reject reads differently
   */
  feedback: (p) => api.post('/v1/ai/feedback', p),

  feedbackBatch: (items) => api.post('/v1/ai/feedback/batch', items),

  acceptance: (days = 30) => api.get('/v1/ai/feedback/acceptance', { params: { days } }),

  promptVersions: (templateKey) =>
    api.get('/v1/ai/feedback/prompt-versions', { params: { templateKey } }),

  allowExample: (id) => api.post(`/v1/ai/feedback/${id}/allow-example`),

  // ── Org profile: the quality lever ─────────────────────────────────────────

  getOrgProfile:  ()        => api.get('/v1/ai/org-profile'),
  saveOrgProfile: (profile) => api.put('/v1/ai/org-profile', profile),
  completeness:   ()        => api.get('/v1/ai/org-profile/completeness'),

  // ── Admin ──────────────────────────────────────────────────────────────────

  health:         () => api.get('/v1/ai/admin/health'),
  corpus:         () => api.get('/v1/ai/admin/corpus'),
  ingestPolicies: () => api.post('/v1/ai/admin/corpus/ingest-policies'),
  reindex:        () => api.post('/v1/ai/admin/corpus/reindex'),
  usage:          () => api.get('/v1/ai/admin/usage'),
  usageByTask:    (days = 30) => api.get('/v1/ai/admin/usage/by-task', { params: { days } }),

  /** Every model call behind one action — the "how was this generated" panel. */
  trace:      (correlationId) => api.get(`/v1/ai/admin/trace/${correlationId}`),

  listPrompts:   ()      => api.get('/v1/ai/admin/prompts'),
  promptHistory: (key)   => api.get(`/v1/ai/admin/prompts/${key}/history`),
  publishPrompt: (tpl, scope = 'global', changeNote) =>
    api.post('/v1/ai/admin/prompts', tpl, { params: { scope, changeNote } }),

  runEvals: () => api.post('/v1/ai/admin/eval/run'),
}

export default aiApi