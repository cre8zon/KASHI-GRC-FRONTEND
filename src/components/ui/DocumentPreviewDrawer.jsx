/**
 * DocumentPreviewDrawer — right-panel in-app document viewer.
 *
 * Renders via app-server URL (/v1/documents/{id}/preview-content) — no S3 URLs
 * are ever sent to the browser.
 *
 * Supported types:
 *   PDF          → PDF.js via <iframe src="https://cdnjs.cloudflare.com/...pdfjs-dist/.../viewer.html?file=...">
 *                  We pass our own /stream URL to the viewer.
 *   Images       → <img> with pinch-zoom via CSS transform
 *   DOCX/XLSX/CSV/TXT → server converts to HTML, shown in sandboxed <iframe>
 *   Other        → download-only fallback
 *
 * Usage:
 *   <DocumentPreviewDrawer
 *     document={{ documentId, fileName, mimeType }}
 *     open={true}
 *     onClose={() => setPreviewDoc(null)}
 *   />
 */

import { useState, useEffect, useRef } from 'react'
import { createPortal }                from 'react-dom'
import {
  X, Download, ZoomIn, ZoomOut, RotateCw,
  FileText, AlertCircle, Loader2, Maximize2, Minimize2,
} from 'lucide-react'
import { cn }   from '../../lib/cn'
import api       from '../../config/axios.config'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

// MIME types that can be previewed inline
const PREVIEWABLE = [
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'image/tiff', 'image/heic', 'image/heif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv', 'text/plain',
]

const isPdf      = (mime) => mime === 'application/pdf'
const isImage    = (mime) => mime?.startsWith('image/')
const isPreviewable = (mime) => mime && PREVIEWABLE.some(m => mime.toLowerCase().includes(m.split('/')[1]))

/**
 * Fetch raw bytes through the app server using the configured axios instance.
 * axios already has Authorization + X-Tenant-ID set via its request interceptor.
 * Returns a Blob that can be turned into an object URL for <iframe>/<img>.
 */
async function fetchFileBlob(documentId, mimeType = 'application/octet-stream') {
  const response = await api.get(`/v1/documents/${documentId}/stream`, {
    responseType: 'arraybuffer',
  })
  // response after interceptor is the ArrayBuffer directly
  return new Blob([response], { type: mimeType })
}

async function fetchHtml(documentId) {
  // Use arraybuffer + manual decode so the interceptor doesn't try to parse it
  const response = await api.get(`/v1/documents/${documentId}/preview-content`, {
    responseType: 'arraybuffer',
    headers: { Accept: 'text/html, */*' },
  })
  return new TextDecoder('utf-8').decode(response)
}

// ── PDF Viewer ────────────────────────────────────────────────────────────────
// Uses PDF.js viewer from CDN, pointing at our stream endpoint.
// PDF.js handles page navigation, zoom, and text selection.
const PDFJS_VIEWER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf_viewer.min.js'
const PDFJS_CDN    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174'

function PdfViewer({ documentId }) {
  const iframeRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    let objectUrl = null
    let cancelled = false

    fetchFileBlob(documentId, 'application/pdf')
      .then(blob => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        if (iframeRef.current) iframeRef.current.src = objectUrl
        setLoading(false)
      })
      .catch(e => {
        if (!cancelled) { setError(e?.message || 'Failed to load PDF'); setLoading(false) }
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [documentId])

  return (
    <div className="relative flex-1 min-h-0">
      {loading && <LoadingSpinner label="Loading PDF…" />}
      {error && <PreviewError message={error} />}
      <iframe
        ref={iframeRef}
        className={cn('w-full h-full border-0 bg-[var(--surface)]', (loading || error) && 'hidden')}
        onLoad={() => setLoading(false)}
        onError={() => { setError('Failed to render PDF'); setLoading(false) }}
        title="PDF preview"
      />
    </div>
  )
}

// ── Image Viewer ──────────────────────────────────────────────────────────────
function ImageViewer({ documentId, fileName, mimeType }) {
  const [scale,    setScale]    = useState(1)
  const [rotation, setRotation] = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [src,      setSrc]      = useState(null)

  useEffect(() => {
    let objectUrl = null
    let cancelled = false

    fetchFileBlob(documentId, mimeType || 'image/jpeg')
      .then(blob => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
        setLoading(false)
      })
      .catch(e => {
        if (!cancelled) { setError(e?.message || 'Failed to load image'); setLoading(false) }
      })

    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [documentId])

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {/* Zoom controls */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-surface-overlay/50 flex-shrink-0">
        <button onClick={() => setScale(s => Math.max(0.25, s - 0.25))}
          className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-text-primary transition-colors">
          <ZoomOut size={14} />
        </button>
        <span className="text-xs text-text-muted w-12 text-center">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(4, s + 0.25))}
          className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-text-primary transition-colors">
          <ZoomIn size={14} />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <button onClick={() => setRotation(r => (r + 90) % 360)}
          className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-text-primary transition-colors">
          <RotateCw size={14} />
        </button>
        <button onClick={() => { setScale(1); setRotation(0) }}
          className="text-[10px] text-text-muted hover:text-text-secondary ml-2 transition-colors">
          Reset
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center glass-overlay p-4">
        {loading && <LoadingSpinner label="Loading image…" />}
        {error && <PreviewError message={error} />}
        {src && !error && (
          <img src={src} alt={fileName}
            style={{ transform: `scale(${scale}) rotate(${rotation}deg)`, transformOrigin: 'center',
                     transition: 'transform 0.2s ease', maxWidth: scale <= 1 ? '100%' : 'none' }}
            className="block" onLoad={() => setLoading(false)} />
        )}
      </div>
    </div>
  )
}

// ── HTML/Office Viewer ────────────────────────────────────────────────────────
// DOCX / XLSX / CSV / TXT — server converts to HTML, we display in sandboxed iframe
function HtmlOfficeViewer({ documentId }) {
  const iframeRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    let blobUrl = null
    let cancelled = false

    fetchHtml(documentId)
      .then(html => {
        if (cancelled) return
        const blob = new Blob([html], { type: 'text/html' })
        blobUrl = URL.createObjectURL(blob)
        if (iframeRef.current) iframeRef.current.src = blobUrl
        setLoading(false)
      })
      .catch(e => {
        if (!cancelled) {
          setError(e?.response?.status === 415 ? 'UNSUPPORTED' : (e?.message || 'Failed to load'))
          setLoading(false)
        }
      })

    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [documentId])

  return (
    <div className="relative flex-1 min-h-0">
      {loading && <LoadingSpinner label="Converting document…" />}
      {error === 'UNSUPPORTED' && (
        <PreviewError message="This file type cannot be previewed inline." icon={FileText} showDownload />
      )}
      {error && error !== 'UNSUPPORTED' && <PreviewError message={error} />}
      <iframe
        ref={iframeRef}
        className={cn('w-full h-full border-0', (loading || error) && 'hidden')}
        title="Document preview"
        sandbox="allow-scripts"
      />
    </div>
  )
}

// ── Shared loading spinner ────────────────────────────────────────────────────
function LoadingSpinner({ label }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={28} className="animate-spin text-brand-ink" />
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    </div>
  )
}

// ── Error / Unsupported fallback ──────────────────────────────────────────────
function PreviewError({ message, icon: Icon = AlertCircle, showDownload }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center max-w-xs">
        <div className="w-12 h-12 rounded-full bg-surface-overlay border border-border flex items-center justify-center">
          <Icon size={20} className="text-text-muted" />
        </div>
        <p className="text-sm text-text-secondary">{message}</p>
        {showDownload && (
          <p className="text-xs text-text-muted">Use the download button above to open this file.</p>
        )}
      </div>
    </div>
  )
}

function DownloadButton({ documentId, fileName, className, children }) {
  const [loading, setLoading] = useState(false)
  const handleDownload = async () => {
    try {
      setLoading(true)
      const blob = await fetchFileBlob(documentId)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = fileName || 'document'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { console.error('Download failed', e) }
    finally { setLoading(false) }
  }
  return (
    <button onClick={handleDownload} disabled={loading} className={className} title="Download file">
      {loading ? <Loader2 size={15} className="animate-spin" /> : children}
    </button>
  )
}
export function DocumentPreviewDrawer({ document: doc, open, onClose }) {
  const [expanded, setExpanded] = useState(false)

  // Reset state when document changes
  useEffect(() => { setExpanded(false) }, [doc?.documentId])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open || !doc) return null

  const mime      = (doc.mimeType || '').toLowerCase()
  const canExpand = true

  const renderViewer = () => {
    if (isPdf(mime))   return <PdfViewer   documentId={doc.documentId} fileName={doc.fileName} />
    if (isImage(mime)) return <ImageViewer documentId={doc.documentId} fileName={doc.fileName} mimeType={mime} />
    if (isPreviewable(mime)) return <HtmlOfficeViewer documentId={doc.documentId} />
    // Unsupported
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center max-w-xs">
          <div className="w-14 h-14 rounded-modal bg-surface-overlay border border-border flex items-center justify-center">
            <FileText size={24} className="text-text-muted" />
          </div>
          <p className="text-sm font-medium text-text-primary">Preview unavailable</p>
          <p className="text-xs text-text-muted">
            {doc.fileName} cannot be previewed. Download the file to open it.
          </p>
          <DownloadButton documentId={doc.documentId} fileName={doc.fileName}
            className="flex items-center gap-2 text-xs text-brand-ink hover:text-brand-ink transition-colors mt-1">
            <Download size={13} />
            Download file
          </DownloadButton>
        </div>
      </div>
    )
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-on-dark-inv/40 z-[199] transition-opacity"
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div className={cn(
        'fixed top-0 right-0 h-full z-[200] flex flex-col bg-surface-raised border-l border-border shadow-2xl transition-all duration-300',
        expanded ? 'w-[calc(100vw-200px)]' : 'w-[660px]'
      )}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{doc.fileName || 'Document'}</p>
            {doc.mimeType && (
              <p className="text-[10px] text-text-muted uppercase tracking-wide">
                {doc.mimeType.split('/')[1]?.toUpperCase() || doc.mimeType}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Download */}
            <DownloadButton documentId={doc.documentId} fileName={doc.fileName}
              className="p-1.5 rounded-card hover:bg-surface-overlay text-text-muted hover:text-text-primary transition-colors">
              <Download size={15} />
            </DownloadButton>
            {/* Expand/collapse */}
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-1.5 rounded-card hover:bg-surface-overlay text-text-muted hover:text-text-primary transition-colors"
              title={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-card hover:bg-surface-overlay text-text-muted hover:text-text-primary transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Viewer area */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {renderViewer()}
        </div>
      </div>
    </>,
    document.body
  )
}