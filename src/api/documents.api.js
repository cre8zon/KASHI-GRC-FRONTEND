/**
 * documentsApi — unified document management API client.
 *
 * UPLOAD FLOW (presigned URL — industry standard):
 *   PDFs, DOCX, XLSX, CSV, ZIP:
 *     1. requestUpload()  → server returns presignedUrl + documentId
 *     2. uploadToS3()     → client PUTs directly to S3 (no server bandwidth used)
 *     3. confirmUpload()  → server verifies, marks ACTIVE, creates link
 *
 *   Images (JPEG, PNG, GIF, TIFF, HEIC):
 *     uploadImage()       → server converts to WebP, uploads, confirms (1 call)
 */

import api from '../config/axios.config'

const IMAGE_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
  'image/tiff', 'image/heic', 'image/heif',
])

export const isImageFile = (mimeType) =>
  IMAGE_MIMES.has((mimeType || '').toLowerCase())

export const documentsApi = {

  // ── 3-step presigned upload (PDFs, DOCX, XLSX, etc.) ─────────────────

  requestUpload: (opts) =>
    api.post('/v1/documents/request-upload', opts)
       .then(r => r.data?.data ?? r.data),

  uploadToS3: (presignedUrl, file, requiredHeaders, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', presignedUrl, true)
      if (requiredHeaders) {
        Object.entries(requiredHeaders).forEach(([k, v]) => xhr.setRequestHeader(k, v))
      }
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300
        ? resolve({ ok: true, etag: xhr.getResponseHeader('ETag') })
        : reject(new Error(`S3 upload failed: ${xhr.status} ${xhr.statusText}`))
      xhr.onerror = () => reject(new Error('S3 upload network error'))
      xhr.send(file)
    }),

  confirmUpload: (documentId, opts = {}) =>
    api.post(`/v1/documents/${documentId}/confirm`, opts)
       .then(r => r.data?.data ?? r.data),

  // ── Image upload (server-side WebP conversion) ────────────────────────

  uploadImage: (file, opts = {}) => {
    const fd = new FormData()
    fd.append('file', file)
    if (opts.entityType) fd.append('entityType', opts.entityType)
    if (opts.entityId)   fd.append('entityId',   String(opts.entityId))
    if (opts.linkType)   fd.append('linkType',   opts.linkType)
    if (opts.title)      fd.append('title',      opts.title)
    return api.post('/v1/documents/upload-image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: opts.onProgress
        ? (e) => opts.onProgress(Math.round((e.loaded / e.total) * 100))
        : undefined,
    }).then(r => r.data?.data ?? r.data)
  },

  // ── Versioning ────────────────────────────────────────────────────────

  requestNewVersion: (documentId, opts) =>
    api.post(`/v1/documents/${documentId}/new-version`, opts)
       .then(r => r.data?.data ?? r.data),

  // ── Linking (polymorphic — works for any entity) ──────────────────────

  linkToEntity: (documentId, body) =>
    api.post(`/v1/documents/${documentId}/link`, body)
       .then(r => r.data?.data ?? r.data),

  reuseDocument: (documentId, entityType, entityId, notes) =>
    documentsApi.linkToEntity(documentId, { entityType, entityId, linkType: 'REFERENCE', notes }),

  removeLink: (linkId) =>
    api.delete(`/v1/documents/links/${linkId}`)
       .then(r => r.data?.data ?? r.data),

  // ── Queries ───────────────────────────────────────────────────────────

  listByEntity: (entityType, entityId, linkType) =>
    api.get('/v1/documents/by-entity', { params: { entityType, entityId, linkType } })
       .then(r => r.data?.data ?? r.data),

  listQuestionEvidence:   (qiId)         => documentsApi.listByEntity('QUESTION_RESPONSE', qiId, 'ATTACHMENT'),
  listAssessmentReports:  (assessmentId)  => documentsApi.listByEntity('ASSESSMENT', assessmentId, 'REPORT'),
  listVendorDocuments:    (vendorId)      => documentsApi.listByEntity('VENDOR', vendorId),

  getMetadata: (documentId) =>
    api.get(`/v1/documents/${documentId}`).then(r => r.data?.data ?? r.data),

  getDownloadUrl: (documentId) =>
    api.get(`/v1/documents/${documentId}/download-url`).then(r => r.data?.data ?? r.data),

  getPreviewUrl: (documentId) =>
    api.get(`/v1/documents/${documentId}/preview-url`).then(r => r.data?.data ?? r.data),
}