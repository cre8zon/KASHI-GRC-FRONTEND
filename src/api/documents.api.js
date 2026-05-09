/**
 * documentsApi — unified document management API client.
 *
 * NOTE ON RESPONSE UNWRAPPING:
 *   The axios instance (config/axios.config.js) has a response interceptor that
 *   automatically extracts `response.data?.data ?? response.data` from every call.
 *   This means `await api.get(...)` already returns the inner payload — NOT the
 *   full AxiosResponse. Do NOT add `.then(r => r.data?.data ?? r.data)` here;
 *   that would try to access `.data` on the already-extracted object/array, which
 *   is always `undefined`, causing every call to silently return `undefined`.
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

  // Returns: { presignedUrl, documentId, s3Key, expiresAt, mimeType, requiredHeaders }
  requestUpload: (opts) =>
    api.post('/v1/documents/request-upload', opts),

  uploadToS3: (presignedUrl, file, requiredHeaders, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', presignedUrl, true)

      if (requiredHeaders) {
        Object.entries(requiredHeaders).forEach(([k, v]) => {
          const normalizedValue = k.toLowerCase() === 'content-type'
            ? v.split(';')[0].trim()
            : v
          console.log(`[S3 Upload] Setting header: ${k} = ${normalizedValue}`)
          xhr.setRequestHeader(k, normalizedValue)
        })
      }

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ ok: true, etag: xhr.getResponseHeader('ETag') })
        } else {
          console.error(`[S3 Upload] Failed — status=${xhr.status}`, xhr.responseText)
          reject(new Error(`S3 upload failed: ${xhr.status} ${xhr.statusText}`))
        }
      }
      xhr.onerror = () => reject(new Error('S3 upload network error'))
      xhr.send(file)
    }),

  // Returns: { documentId, status, contentLength, s3Etag }
  confirmUpload: (documentId, opts = {}) =>
    api.post(`/v1/documents/${documentId}/confirm`, opts),

  // ── Image upload (server-side WebP conversion) ────────────────────────

  // Returns: { documentId, mimeType, originalMime, contentLength, status }
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
    })
  },

  // ── Versioning ────────────────────────────────────────────────────────

  // Returns: { newDocumentId, documentId, version, supersedesId, presignedUrl, expiresAt, requiredHeaders }
  requestNewVersion: (documentId, opts) =>
    api.post(`/v1/documents/${documentId}/new-version`, opts),

  // ── Linking (polymorphic — works for any entity) ──────────────────────

  // Returns: { linkId, documentId, entityType, entityId, linkType }
  linkToEntity: (documentId, body) =>
    api.post(`/v1/documents/${documentId}/link`, body),

  reuseDocument: (documentId, entityType, entityId, notes) =>
    documentsApi.linkToEntity(documentId, { entityType, entityId, linkType: 'REFERENCE', notes }),

  // Returns: { linkId, removed }
  removeLink: (linkId) =>
    api.delete(`/v1/documents/links/${linkId}`),

  // ── Queries ───────────────────────────────────────────────────────────

  // Returns: Array<{ linkId, documentId, title, fileName, mimeType, documentType, linkType, version, contentLength, status, createdAt, notes }>
  listByEntity: (entityType, entityId, linkType) =>
    api.get('/v1/documents/by-entity', { params: { entityType, entityId, linkType } }),

  listQuestionEvidence:   (qiId)         => documentsApi.listByEntity('QUESTION_RESPONSE', qiId, 'ATTACHMENT'),
  listAssessmentReports:  (assessmentId)  => documentsApi.listByEntity('ASSESSMENT', assessmentId, 'REPORT'),
  listVendorDocuments:    (vendorId)      => documentsApi.listByEntity('VENDOR', vendorId),

  // Returns: { documentId, title, fileName, mimeType, ... }
  getMetadata: (documentId) =>
    api.get(`/v1/documents/${documentId}`),

  // Returns: { documentId, downloadUrl, fileName, mimeType, ttlMinutes }
  getDownloadUrl: (documentId) =>
    api.get(`/v1/documents/${documentId}/download-url`),

  // Returns: { documentId, downloadUrl, fileName, mimeType, ttlMinutes }
  getPreviewUrl: (documentId) =>
    api.get(`/v1/documents/${documentId}/preview-url`),
}