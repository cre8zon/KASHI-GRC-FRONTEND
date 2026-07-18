/**
 * EvidenceUploader — drop-in evidence file management for any GRC entity.
 *
 * Works identically in every module — just pass entityType + entityId:
 *
 *   <EvidenceUploader entityType="QUESTION_RESPONSE" entityId={qiId} />
 *   <EvidenceUploader entityType="VENDOR"            entityId={vendorId} />
 *   <EvidenceUploader entityType="REMEDIATION_ITEM"  entityId={itemId} />
 *   <EvidenceUploader entityType="CONTROL"           entityId={controlId} />
 *
 * Features:
 *   - Drag-and-drop + click-to-browse
 *   - Progress bar during S3 upload
 *   - Automatic image → WebP routing (server-side conversion)
 *   - File type validation (client-side + server enforces too)
 *   - Remove link (doesn't delete S3 object — keeps audit trail)
 *   - Open/download via presigned GET URL
 *   - Reuse existing document (reference link, no re-upload)
 *   - Version badge on each file
 */

import { useRef, useState }       from 'react'
import { Upload, Trash2, Download, Link, Loader2, X, CheckCircle2, Eye } from 'lucide-react'
import { cn }              from '../../lib/cn'
import { formatDate }      from '../../utils/format'
import { formatBytes }     from '../../utils/format'
import {
  useEntityDocuments,
  useDocumentUpload,
  useRemoveDocumentLink,
  useDocumentDownload,
} from '../../hooks/useDocuments'
import { DocumentPreviewDrawer } from './DocumentPreviewDrawer'
import toast from 'react-hot-toast'

// ─── MIME validation (mirrors server allowlist) ───────────────────────────────
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/tiff', 'image/heic', 'image/heif', 'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/csv', 'text/plain',
  'application/zip', 'application/x-zip-compressed',
])

const MIME_LABELS = {
  'application/pdf':                  { label: 'PDF',   color: 'text-status-fail-fg'    },
  'image/jpeg':                       { label: 'JPG',   color: 'text-status-warn-fg'  },
  'image/png':                        { label: 'PNG',   color: 'text-status-info-fg'   },
  'image/gif':                        { label: 'GIF',   color: 'text-status-tag-fg' },
  'image/tiff':                       { label: 'TIFF',  color: 'text-status-tag-fg' },
  'image/heic':                       { label: 'HEIC',  color: 'text-status-tag-fg' },
  'image/webp':                       { label: 'WebP',  color: 'text-brand-400'   },
  'text/csv':                         { label: 'CSV',   color: 'text-status-pass-fg'  },
  'application/vnd.ms-excel':         { label: 'XLS',   color: 'text-status-pass-fg'  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                                      { label: 'XLSX',  color: 'text-status-pass-fg'  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                                      { label: 'DOCX',  color: 'text-status-info-fg'   },
  'application/zip':                  { label: 'ZIP',   color: 'text-text-muted' },
}

const getMimeInfo = (mimeType) =>
  MIME_LABELS[mimeType] ?? { label: (mimeType?.split('/')[1] ?? 'FILE').toUpperCase(), color: 'text-text-muted' }

// ─── DocumentRow — one file in the list ──────────────────────────────────────

function DocumentRow({ doc, entityType, entityId, linkType, canRemove, compact, onPreview }) {
  const { openDocument, loading: downloading } = useDocumentDownload()
  const { mutate: removeLink, isPending: removing } = useRemoveDocumentLink(entityType, entityId, linkType)
  const mimeInfo = getMimeInfo(doc.mimeType)

  const isReport = doc.documentType === 'GENERATED_REPORT'
  const reportData = doc.reportData ?? {}

  return (
    <div className={cn(
      'flex items-start gap-2.5 px-3 py-2.5 rounded-card border border-border',
      'bg-surface-overlay/40 transition-colors group',
      doc.documentId && onPreview
        ? 'cursor-pointer hover:bg-brand-500/5 hover:border-brand-500/30'
        : 'hover:bg-surface-overlay/70',
      compact && 'py-2'
    )}
      onClick={() => doc.documentId && onPreview && onPreview(doc)}
    >
      {/* File type badge */}
      <div className={cn(
        'shrink-0 mt-0.5 text-[9px] font-mono font-medium px-1.5 py-0.5 rounded',
        'bg-surface border border-border', mimeInfo.color
      )}>
        {mimeInfo.label}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-text-primary font-medium truncate max-w-[240px]">
            {doc.title || doc.fileName}
          </span>
          {doc.version > 1 && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
              v{doc.version}
            </span>
          )}
          {doc.linkType === 'REFERENCE' && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-status-tag-bg text-status-tag-fg border border-status-tag-bd flex items-center gap-0.5">
              <Link size={7} /> reused
            </span>
          )}
          {isReport && reportData.compliancePct != null && (
            <span className={cn(
              'text-[9px] px-1.5 py-0.5 rounded font-medium border',
              reportData.compliancePct >= 80 ? 'bg-status-pass-bg text-status-pass-fg border-status-pass-bd' :
              reportData.compliancePct >= 60 ? 'bg-status-warn-bg text-status-warn-fg border-status-warn-bd' :
                                              'bg-status-fail-bg   text-status-fail-fg   border-status-fail-bd'
            )}>
              {reportData.compliancePct?.toFixed(1)}%
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] text-text-muted">
          {doc.contentLength > 0 && <span>{formatBytes(doc.contentLength)}</span>}
          {doc.createdAt && <span>{formatDate(doc.createdAt)}</span>}
          {doc.generatedByName && <span>by {doc.generatedByName}</span>}
          {isReport && reportData.triggerEvent && (
            <span className="capitalize">{reportData.triggerEvent.toLowerCase().replace(/_/g, ' ')}</span>
          )}
          {isReport && reportData.openRemediationCount > 0 && (
            <span className="text-status-warn-fg">{reportData.openRemediationCount} open item(s)</span>
          )}
          {doc.notes && <span className="italic opacity-70">{doc.notes}</span>}
        </div>
      </div>

      {/* Actions — always visible, stop propagation so they don't trigger row click */}
      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        {/* Preview hint — subtle eye icon always visible */}
        {doc.documentId && onPreview && (
          <span className="p-1 text-text-muted/40 group-hover:text-brand-400 transition-colors" title="Click row to preview">
            <Eye size={12} />
          </span>
        )}
        {doc.downloadUrl || doc.documentId ? (
          <button
            onClick={(e) => { e.stopPropagation(); openDocument(doc.documentId, doc.fileName) }}
            disabled={downloading}
            title="Download"
            className="p-1 rounded hover:bg-surface-overlay text-text-muted hover:text-text-primary transition-colors"
          >
            {downloading ? <Loader2 size={12} className="animate-spin"/> : <Download size={12}/>}
          </button>
        ) : null}

        {canRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm(`Remove "${doc.title || doc.fileName}" from this item? The file is kept in the document store.`))
                removeLink(doc.linkId)
            }}
            disabled={removing}
            title="Remove link"
            className="p-1 rounded hover:bg-status-fail-bg text-text-muted hover:text-status-fail-fg transition-colors"
          >
            {removing ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12}/>}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── DropZone ─────────────────────────────────────────────────────────────────

function DropZone({ onFiles, disabled }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)

  const handleFiles = (files) => {
    const valid = Array.from(files).filter(f => {
      if (!ALLOWED_TYPES.has(f.type)) {
        toast.error(`${f.name}: file type not allowed`)
        return false
      }
      if (f.size > 50 * 1024 * 1024) {
        toast.error(`${f.name}: exceeds 50MB limit`)
        return false
      }
      return true
    })
    if (valid.length) onFiles(valid)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        'flex flex-col items-center gap-1.5 px-4 py-4 rounded-card border-2 border-dashed',
        'text-center cursor-pointer transition-colors select-none',
        dragging
          ? 'border-brand-500 bg-brand-500/5 text-brand-400'
          : 'border-border hover:border-brand-500/40 hover:bg-surface-overlay/50 text-text-muted',
        disabled && 'opacity-50 pointer-events-none'
      )}
    >
      <Upload size={16} className="shrink-0"/>
      <div>
        <p className="text-xs font-medium">Drop files here or click to browse</p>
        <p className="text-[10px] mt-0.5 opacity-70">
          PDF, images, XLSX, DOCX, CSV, ZIP — max 50MB each
        </p>
        <p className="text-[10px] opacity-60 mt-0.5">
          Images are converted to WebP automatically
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.gif,.tiff,.heic,.webp,.xlsx,.xls,.docx,.doc,.csv,.txt,.zip"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}

// ─── UploadProgressBar ────────────────────────────────────────────────────────

function UploadProgressBar({ fileName, progress, done, error }) {
  return (
    <div className={cn(
      'px-3 py-2 rounded-card border text-xs',
      error   ? 'border-status-fail-bd bg-status-fail-bg text-status-fail-fg' :
      done    ? 'border-status-pass-bd bg-status-pass-bg text-status-pass-fg' :
                'border-border bg-surface-overlay/40 text-text-secondary'
    )}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="truncate max-w-[200px] font-medium">{fileName}</span>
        <div className="flex items-center gap-1 shrink-0">
          {done  && <CheckCircle2 size={11}/>}
          {error && <X size={11}/>}
          <span>{error ? 'Failed' : done ? 'Done' : `${progress}%`}</span>
        </div>
      </div>
      {!done && !error && (
        <div className="h-1 rounded-full bg-surface-overlay overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {error && <p className="text-[10px] mt-0.5 opacity-80">{error}</p>}
    </div>
  )
}

// ─── Main EvidenceUploader ────────────────────────────────────────────────────

export default function EvidenceUploader({
  entityType,
  entityId,
  linkType     = 'ATTACHMENT',
  documentType = 'EVIDENCE',
  canUpload    = true,
  canRemove    = true,
  compact      = false,
  emptyLabel   = 'No files attached yet',
  className,
  /** Called after each successful upload — use to invalidate parent query caches */
  onUploadSuccess,
}) {
  // staleTime: 0 forces immediate refetch after upload invalidates the cache
  const { data: docs = [], isLoading } = useEntityDocuments(
    entityType, entityId, linkType,
    { enabled: !!entityType && !!entityId, staleTime: 0 }
  )
  const { upload, progress, isUploading } = useDocumentUpload()

  const [uploads,    setUploads]    = useState([]) // [{ id, name, progress, done, error }]
  const [previewDoc, setPreviewDoc] = useState(null) // doc to preview in-app

  const handleFiles = async (files) => {
    for (const file of files) {
      const uid = `${Date.now()}-${file.name}`
      setUploads(prev => [...prev, { id: uid, name: file.name, progress: 0, done: false, error: null }])

      try {
        await upload(file, {
          documentType,
          entityType,
          entityId,
          linkType,
          silent: true,
          onSuccess: () => {
            setUploads(prev => prev.map(u => u.id === uid ? { ...u, progress: 100, done: true } : u))
            onUploadSuccess?.()
            // Clear the progress row after docs list has time to refresh and show the file
            setTimeout(() =>
              setUploads(prev => prev.filter(u => u.id !== uid)), 2500)
          },
          onError: (err) =>
            setUploads(prev => prev.map(u => u.id === uid
              ? { ...u, error: err?.response?.data?.error?.message ?? err?.message ?? 'Failed', done: false }
              : u)),
        })
      } catch { /* error handled by onError above */ }
    }

    // Clear failed uploads after 6 seconds
    setTimeout(() =>
      setUploads(prev => prev.filter(u => !u.error)), 6000)
  }

  return (
    <>
    <div className={cn('space-y-2', className)}>
      {/* Upload zone */}
      {canUpload && !compact && (
        <DropZone onFiles={handleFiles} disabled={isUploading} />
      )}

      {canUpload && compact && (
        <label className={cn(
          'inline-flex items-center gap-1.5 text-xs text-text-muted',
          'hover:text-brand-400 cursor-pointer transition-colors',
          isUploading && 'opacity-50 pointer-events-none'
        )}>
          <Upload size={11}/>
          Attach file
          <input
            type="file" multiple className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.tiff,.heic,.webp,.xlsx,.xls,.docx,.doc,.csv,.txt,.zip"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      )}

      {/* In-progress uploads */}
      {uploads.map(u => (
        <UploadProgressBar
          key={u.id}
          fileName={u.name}
          progress={isUploading ? progress : u.progress}
          done={u.done}
          error={u.error}
        />
      ))}

      {/* Document list */}
      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 size={14} className="animate-spin text-text-muted"/>
        </div>
      ) : docs.length === 0 ? (
        <p className="text-xs text-text-muted italic py-1">{emptyLabel}</p>
      ) : (
        <div className="space-y-1.5">
          {docs.map(doc => (
            <DocumentRow
              key={doc.linkId ?? doc.documentId}
              doc={doc}
              entityType={entityType}
              entityId={entityId}
              linkType={linkType}
              canRemove={canRemove}
              compact={compact}
              onPreview={setPreviewDoc}
            />
          ))}
        </div>
      )}
    </div>

    {/* In-app document viewer — portal to document.body, works everywhere */}
    <DocumentPreviewDrawer
      document={previewDoc}
      open={!!previewDoc}
      onClose={() => setPreviewDoc(null)}
    />
  </>
  )
}