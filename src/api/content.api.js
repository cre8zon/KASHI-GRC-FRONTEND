import api from '../config/axios.config'

/**
 * content.api.js — the content platform's admin surface.
 *
 * Everything lives under /v1/content/admin, which SecurityConfig gates to
 * SIDE_SYSTEM. The public read API (/v1/content/public) is not called from
 * here at all — that one is consumed by the website repo's build, not by this
 * app.
 *
 * ── ON AUTOSAVE ──────────────────────────────────────────────────────────────
 * updatePost is called roughly every two seconds while someone types. That is
 * safe because the server gates everything expensive behind a block-hash
 * comparison: an identical save writes no revision, does not move the public
 * "last updated" stamp, and does not reindex the link graph.
 *
 * Send only the fields that changed. Null on the request means "leave alone",
 * so a panel that was never opened cannot blank the fields inside it.
 *
 * ── ON AI ────────────────────────────────────────────────────────────────────
 * Every AI response is a PROPOSAL. Nothing it returns has been written to the
 * post. The editor renders it with Accept and Reject, and accepting is an
 * ordinary updatePost call with the proposal folded into the blocks.
 *
 * Every proposal carries interactionId, and the editor MUST post a verdict to
 * aiApi.feedback for accept, reject, edit AND dismiss. A suggestion shown and
 * silently abandoned is the most informative signal this feature produces and
 * it can only be captured at the instant it happens.
 */
export const contentApi = {

  // ── posts ──────────────────────────────────────────────────────────────────

  listPosts: (params) => api.get('/v1/content/admin/posts', { params }),

  getPost: (id) => api.get(`/v1/content/admin/posts/${id}`),

  createPost: (payload) => api.post('/v1/content/admin/posts', payload),

  /** Autosave. Partial payloads only — see the note above. */
  updatePost: (id, payload) => api.put(`/v1/content/admin/posts/${id}`, payload),

  /**
   * Soft delete. A published post leaves a 301 behind, to redirectTo or /blog.
   * Its URL has inbound links; a hard delete turns every one of them into a 404
   * with no way back.
   */
  archivePost: (id, redirectTo) =>
    api.delete(`/v1/content/admin/posts/${id}`, { params: { redirectTo } }),

  /**
   * Dry run of publish validation. Poll this while writing so the panel can
   * show what is still missing, instead of the author finding out by clicking
   * publish and being refused.
   *
   * Returns [] when the post is ready. Otherwise [{ field, message }] — ALL of
   * them, not the first.
   */
  publishCheck: (id) => api.get(`/v1/content/admin/posts/${id}/publish-check`),

  publish: (id) => api.post(`/v1/content/admin/posts/${id}/publish`),

  unpublish: (id) => api.post(`/v1/content/admin/posts/${id}/unpublish`),

  /** body: { scheduledFor: ISO-8601 }. Validated now, not at run time. */
  schedule: (id, scheduledFor) =>
    api.post(`/v1/content/admin/posts/${id}/schedule`, { scheduledFor }),

  revisions: (id) => api.get(`/v1/content/admin/posts/${id}/revisions`),

  /** Snapshots the current state first, so a revert is itself undoable. */
  revert: (id, revisionId) =>
    api.post(`/v1/content/admin/posts/${id}/revert/${revisionId}`),

  /**
   * Live check as the slug is typed. Debounce it.
   *
   * `warning` is set when the slug is free but is the source of an active
   * redirect — publishing it would create a URL that redirects away from
   * itself. Show it; it is not the same thing as unavailable.
   */
  slugAvailable: (slug, excludeId) =>
    api.get('/v1/content/admin/posts/slug-available', { params: { slug, excludeId } }),

  /**
   * Advisory on-page checks. `blocking: true` marks the ones that also appear
   * in publishCheck. Never gate the publish button on this list — an editor who
   * learns the checklist sometimes stops them stops reading it.
   */
  seoChecklist: (id) => api.get(`/v1/content/admin/posts/${id}/seo-checklist`),

  // ── taxonomy ───────────────────────────────────────────────────────────────

  categories:     ()          => api.get('/v1/content/admin/categories'),
  createCategory: (payload)   => api.post('/v1/content/admin/categories', payload),
  updateCategory: (id, p)     => api.put(`/v1/content/admin/categories/${id}`, p),

  tags:      ()        => api.get('/v1/content/admin/tags'),
  createTag: (payload) => api.post('/v1/content/admin/tags', payload),

  authors:      ()      => api.get('/v1/content/admin/authors'),
  createAuthor: (p)     => api.post('/v1/content/admin/authors', p),
  updateAuthor: (id, p) => api.put(`/v1/content/admin/authors/${id}`, p),

  // ── media ──────────────────────────────────────────────────────────────────

  media: (params) => api.get('/v1/content/admin/media', { params }),

  /**
   * altText is a required part of the multipart body, not an optional field.
   * The server rejects the upload without it.
   *
   * The friction is deliberate and deliberately placed: the person uploading
   * knows what the image shows, and asking them now costs five seconds. Asking
   * at publish means asking someone else, three weeks later, about an image
   * they did not choose.
   */
  uploadMedia: (file, altText, caption) => {
    const form = new FormData()
    form.append('file', file)
    form.append('altText', altText)
    if (caption) form.append('caption', caption)
    return api.post('/v1/content/admin/media/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  updateMedia: (id, payload) => api.put(`/v1/content/admin/media/${id}`, payload),

  // ── redirects ──────────────────────────────────────────────────────────────

  redirects:      ()  => api.get('/v1/content/admin/redirects'),
  createRedirect: (p) => api.post('/v1/content/admin/redirects', p),

  // ── reports ────────────────────────────────────────────────────────────────

  /** Published, indexable, and nothing on the site links to it. */
  orphans:     () => api.get('/v1/content/admin/reports/orphans'),

  /** Past its review interval. Comparison pages sort first — they rot fastest. */
  stale:       () => api.get('/v1/content/admin/reports/stale'),

  brokenLinks: () => api.get('/v1/content/admin/reports/broken-links'),

  // ── AI ─────────────────────────────────────────────────────────────────────

  /**
   * One endpoint for all eight tasks.
   *
   * taskType: CONTENT_OUTLINE | CONTENT_DRAFT_SECTION | CONTENT_REWRITE
   *         | CONTENT_META | CONTENT_TLDR | CONTENT_FAQ
   *         | CONTENT_INTERNAL_LINKS | CONTENT_SOCIAL
   *
   * Returns ApiResponse with status 'WARNING' when references were dropped.
   * Render the caveat rather than presenting the output as clean.
   *
   * CONTENT_INTERNAL_LINKS is the one with teeth: the server passes the
   * published slug list as an enumerated candidate set and rejects the whole
   * response if the model returns anything outside it. A hallucinated internal
   * link is a 404 on a live page under a named byline.
   */
  ai: (taskType, payload) =>
    api.post(`/v1/content/admin/ai/${taskType}`, payload),

  /**
   * Whether AI is usable at all. Reuses the AI module's own health endpoint
   * rather than adding a second source of truth: `providers` is empty when
   * app.ai.enabled is false or no provider key is configured, which is exactly
   * the state in which the editor's AI tab should not be offered.
   */
  aiHealth: () => api.get('/v1/ai/admin/health'),
}

/**
 * Block factories. The editor should build blocks through these rather than
 * literals, so a type only has to be got right once.
 *
 * The full set is: paragraph heading list quote image code tldr callout table
 * faq steps cta download embed comparison. The renderer skips an unknown type
 * with a warning rather than throwing, which is what lets the backend ship a
 * new type before the front end knows about it.
 */
export const blocks = {
  paragraph:  (html = '<p></p>')      => ({ type: 'paragraph', html }),
  heading:    (text = '', level = 2)  => ({ type: 'heading', level, text, anchor: '' }),
  list:       (items = [''], ordered = false) => ({ type: 'list', ordered, items }),
  quote:      ()  => ({ type: 'quote', text: '', attribution: '' }),
  image:      (mediaId) => ({ type: 'image', mediaId, caption: '', fullWidth: false }),
  code:       ()  => ({ type: 'code', language: 'sql', code: '' }),
  tldr:       ()  => ({ type: 'tldr', items: ['', '', ''] }),
  callout:    (variant = 'note') => ({ type: 'callout', variant, title: '', html: '' }),
  table:      ()  => ({ type: 'table', headers: ['', ''], rows: [['', '']], stickyHeader: true }),
  faq:        ()  => ({ type: 'faq', items: [{ q: '', a: '' }] }),
  steps:      ()  => ({ type: 'steps', items: [{ heading: '', html: '' }] }),
  cta:        (variant = 'inline') => ({ type: 'cta', variant, heading: '', body: '', buttonText: '', buttonHref: '' }),
  download:   (mediaId) => ({ type: 'download', mediaId, title: '', description: '', gated: false }),
  embed:      (provider = 'youtube') => ({ type: 'embed', provider, url: '' }),
  comparison: () => ({ type: 'comparison', comparisonDataIds: [], attributes: [] }),
}