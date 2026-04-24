/**
 * useDocuments.js — React Query hooks for the unified document system.
 *
 * Works identically across every module — just pass entityType + entityId.
 *
 * UPLOAD FLOW HANDLED HERE:
 *   Non-image files → 3-step presigned flow (requestUpload → PUT to S3 → confirm)
 *   Image files     → 1-step server-side flow (WebP conversion + upload in one call)
 *
 * USAGE EXAMPLES:
 *
 *   // Upload evidence for a question response
 *   const { upload, progress, isUploading } = useDocumentUpload()
 *   await upload(file, { entityType: 'QUESTION_RESPONSE', entityId: qiId })
 *
 *   // List evidence for a question
 *   const { data: docs } = useEntityDocuments('QUESTION_RESPONSE', qiId, 'ATTACHMENT')
 *
 *   // List report versions for an assessment
 *   const { data: reports } = useEntityDocuments('ASSESSMENT', assessmentId, 'REPORT')
 *
 *   // Same hook, different module — audit reports
 *   const { data: reports } = useEntityDocuments('AUDIT', auditId, 'REPORT')
 *
 *   // Open a file in new tab
 *   const { openDocument } = useDocumentDownload()
 *   openDocument(documentId)
 *
 *   // Reuse an existing document on a new entity (no re-upload)
 *   const { reuse } = useReuseDocument()
 *   reuse(documentId, 'REMEDIATION_ITEM', remediationItemId)
 */

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { documentsApi, isImageFile } from '../api/documents.api'
import toast from 'react-hot-toast'

// ─── Query key factory ────────────────────────────────────────────────────────

export const docKeys = {
  byEntity:  (entityType, entityId, linkType) =>
    ['docs', entityType, String(entityId), linkType ?? 'ALL'],
  metadata:  (documentId) => ['doc', String(documentId)],
}

// ═══════════════════════════════════════════════════════════════════════════
// READ HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List all active documents linked to an entity.
 * linkType is optional — omit to get all (ATTACHMENT + REPORT + REFERENCE).
 */
export function useEntityDocuments(entityType, entityId, linkType, opts = {}) {
  return useQuery({
    queryKey: docKeys.byEntity(entityType, entityId, linkType),
    queryFn:  () => documentsApi.listByEntity(entityType, entityId, linkType),
    enabled:  !!entityType && !!entityId && opts.enabled !== false,
    staleTime: 30_000,
    select: (d) => Array.isArray(d) ? d : (d?.data ?? []),
    ...opts,
  })
}

// Convenience shortcuts — same hook, pre-configured
export const useQuestionEvidence  = (qiId, opts)        =>
  useEntityDocuments('QUESTION_RESPONSE', qiId, 'ATTACHMENT', { enabled: !!qiId, ...opts })

export const useAssessmentReports = (assessmentId, opts) =>
  useEntityDocuments('ASSESSMENT', assessmentId, 'REPORT', { enabled: !!assessmentId, ...opts })

export const useVendorDocuments   = (vendorId, opts)     =>
  useEntityDocuments('VENDOR', vendorId, undefined, { enabled: !!vendorId, ...opts })

export const useAuditDocuments    = (auditId, opts)      =>
  useEntityDocuments('AUDIT', auditId, undefined, { enabled: !!auditId, ...opts })

export function useDocumentMetadata(documentId) {
  return useQuery({
    queryKey: docKeys.metadata(documentId),
    queryFn:  () => documentsApi.getMetadata(documentId),
    enabled:  !!documentId,
    staleTime: 60_000,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD HOOK — handles the full 3-step presigned flow transparently
// ═══════════════════════════════════════════════════════════════════════════

/**
 * useDocumentUpload — upload any file with progress tracking.
 *
 * Automatically routes:
 *   Images  → POST /upload-image (server converts to WebP)
 *   Others  → requestUpload → PUT to S3 → confirm
 *
 * @returns {{ upload, progress, isUploading, error, reset }}
 */
export function useDocumentUpload() {
  const qc = useQueryClient()
  const [progress,    setProgress]    = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [error,       setError]       = useState(null)

  const reset = useCallback(() => {
    setProgress(0)
    setIsUploading(false)
    setError(null)
  }, [])

  const upload = useCallback(async (file, opts = {}) => {
    const {
      documentType = 'EVIDENCE',
      entityType,
      entityId,
      linkType  = 'ATTACHMENT',
      title,
      notes,
      silent    = false,
      onSuccess,
      onError,
    } = opts

    if (!file) throw new Error('No file provided')

    setIsUploading(true)
    setProgress(0)
    setError(null)

    try {
      let documentId

      // ── IMAGE: server converts to WebP in one call ─────────────────────
      if (isImageFile(file.type)) {
        const result = await documentsApi.uploadImage(file, {
          entityType, entityId, linkType, title,
          onProgress: setProgress,
        })
        documentId = result.documentId
        if (!silent) toast.success(`Uploaded as WebP (${result.contentLength != null
          ? Math.round(result.contentLength / 1024) + 'KB'
          : 'converted'})`)

      // ── NON-IMAGE: 3-step presigned flow ──────────────────────────────
      } else {
        // Step 1 — get presigned PUT URL (fast — no data transferred)
        setProgress(5)
        const { presignedUrl, documentId: id, requiredHeaders } =
          await documentsApi.requestUpload({
            fileName:      file.name,
            mimeType:      file.type || 'application/octet-stream',
            fileSizeBytes: file.size,
            documentType,
            entityType,
            entityId,
            linkType,
            title,
          })
        documentId = id

        // Step 2 — PUT directly to S3 (this is where bandwidth goes)
        setProgress(10)
        await documentsApi.uploadToS3(
          presignedUrl, file, requiredHeaders,
          (pct) => setProgress(10 + Math.round(pct * 0.80)) // maps to 10–90%
        )

        // Step 3 — confirm with server (fast — just a HeadObject check)
        setProgress(92)
        await documentsApi.confirmUpload(documentId, {
          entityType, entityId, linkType, notes,
        })

        if (!silent) toast.success(`${file.name} uploaded`)
      }

      setProgress(100)

      // Invalidate entity document lists so they refresh automatically
      if (entityType && entityId) {
        qc.invalidateQueries({ queryKey: docKeys.byEntity(entityType, entityId, linkType) })
        qc.invalidateQueries({ queryKey: docKeys.byEntity(entityType, entityId, undefined) })
      }

      onSuccess?.({ documentId, file })
      return { documentId }

    } catch (err) {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? 'Upload failed'
      setError(msg)
      if (!silent) toast.error(msg)
      onError?.(err)
      throw err

    } finally {
      setIsUploading(false)
    }
  }, [qc])

  return { upload, progress, isUploading, error, reset }
}

// ═══════════════════════════════════════════════════════════════════════════
// LINK / UNLINK HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Remove a document link (does not delete the file or S3 object).
 */
export function useRemoveDocumentLink(entityType, entityId, linkType) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (linkId) => documentsApi.removeLink(linkId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: docKeys.byEntity(entityType, entityId, linkType) })
      qc.invalidateQueries({ queryKey: docKeys.byEntity(entityType, entityId, undefined) })
      toast.success('Document removed')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message ?? 'Failed to remove'),
  })
}

/**
 * Reuse an existing document on a new entity without re-uploading.
 * Creates a REFERENCE link (same file bytes, new association).
 * Use case: vendor's SOC 2 cert linked to multiple controls.
 */
export function useReuseDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ documentId, entityType, entityId, notes }) =>
      documentsApi.reuseDocument(documentId, entityType, entityId, notes),
    onSuccess: (_, { entityType, entityId }) => {
      qc.invalidateQueries({ queryKey: docKeys.byEntity(entityType, entityId, undefined) })
      toast.success('Document linked (no re-upload needed)')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message ?? 'Failed to link'),
  })
}

/**
 * Link any already-uploaded document to any entity (ATTACHMENT or REFERENCE).
 * Use when the user picks an existing document from a picker UI.
 */
export function useLinkDocument(entityType, entityId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ documentId, linkType = 'ATTACHMENT', notes }) =>
      documentsApi.linkToEntity(documentId, { entityType, entityId, linkType, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: docKeys.byEntity(entityType, entityId, undefined) })
      toast.success('Document linked')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message ?? 'Failed to link'),
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// DOWNLOAD / PREVIEW HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * useDocumentDownload — get presigned GET URLs on demand.
 *
 * URLs are never cached — always fresh from the server after auth check.
 * Never store presigned URLs in state long-term (they expire).
 */
export function useDocumentDownload() {
  const [loading, setLoading] = useState(false)

  const getDownloadUrl = useCallback(async (documentId) => {
    setLoading(true)
    try   { return await documentsApi.getDownloadUrl(documentId) }
    finally { setLoading(false) }
  }, [])

  const getPreviewUrl = useCallback(async (documentId) => {
    setLoading(true)
    try   { return await documentsApi.getPreviewUrl(documentId) }
    finally { setLoading(false) }
  }, [])

  /** Open the document in a new browser tab using a fresh presigned URL. */
  const openDocument = useCallback(async (documentId, filename) => {
    try {
      const { downloadUrl } = await documentsApi.getDownloadUrl(documentId)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      if (filename) a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      toast.error('Could not open document — try again')
    }
  }, [])

  return { getDownloadUrl, getPreviewUrl, openDocument, loading }
}

// ═══════════════════════════════════════════════════════════════════════════
// VERSIONING HOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload a new version of an existing document.
 * Old version is marked SUPERSEDED on confirm.
 * Returns the same progress/isUploading interface as useDocumentUpload().
 */
export function useDocumentVersionUpload() {
  const qc = useQueryClient()
  const [progress,    setProgress]    = useState(0)
  const [isUploading, setIsUploading] = useState(false)

  const uploadVersion = useCallback(async (file, { documentId, entityType, entityId } = {}) => {
    setIsUploading(true)
    setProgress(0)
    try {
      // Request new version slot (server creates PENDING doc with supersedesId)
      setProgress(5)
      const { presignedUrl, documentId: newId, requiredHeaders } =
        await documentsApi.requestNewVersion(documentId, {
          fileName:      file.name,
          mimeType:      file.type || 'application/octet-stream',
          fileSizeBytes: file.size,
        })

      // Upload to S3
      setProgress(10)
      await documentsApi.uploadToS3(
        presignedUrl, file, requiredHeaders,
        (pct) => setProgress(10 + Math.round(pct * 0.80))
      )

      // Confirm — server marks old SUPERSEDED, new ACTIVE
      setProgress(92)
      await documentsApi.confirmUpload(newId, { entityType, entityId, linkType: 'ATTACHMENT' })
      setProgress(100)

      if (entityType && entityId) {
        qc.invalidateQueries({ queryKey: docKeys.byEntity(entityType, entityId, undefined) })
      }
      toast.success('New version uploaded')
      return { documentId: newId }
    } catch (err) {
      toast.error(err?.response?.data?.error?.message ?? 'Version upload failed')
      throw err
    } finally {
      setIsUploading(false)
    }
  }, [qc])

  return { uploadVersion, progress, isUploading }
}