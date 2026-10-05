/**
 * TrainingContentTab — course content, with upload.
 *
 * ── WHY THIS REPLACED A GENERIC TAB ───────────────────────────────────────
 * Content was originally `linked-items` through LinkedEntitiesTab (read-only)
 * plus an "Add content" form whose s3Key field was a text box. Nothing in the
 * browser could produce an S3 key, so no video could be uploaded at all.
 *
 * Three things make this genuinely un-form-able:
 *   - a file picker with upload progress
 *   - reading duration off the video element, because asking a human for it
 *     guarantees wrong numbers and every completion check divides by it
 *   - showing what is already there while adding to it
 *
 * ── IT DOES NOT IMPLEMENT UPLOADING ───────────────────────────────────────
 * useDocumentUpload already does the whole three-step flow — requestUpload,
 * PUT to S3 with progress, confirmUpload — and is proven by evidence uploads.
 * This passes documentType TRAINING_VIDEO, which is what widens the MIME
 * allow-list and the 500MB ceiling in StorageService, and posts the returned
 * document id to /items.
 */
import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Film, FileText, ExternalLink, Type, Plus, X,
  RefreshCw, CheckCircle2, AlertTriangle, UploadCloud,
} from 'lucide-react'
import api from '../../config/axios.config'
import { useDocumentUpload } from '../../hooks/useDocuments'
import toast from 'react-hot-toast'

const TYPE_ICON = { VIDEO: Film, DOCUMENT: FileText, LINK: ExternalLink, TEXT: Type }

function formatDuration(s) {
  if (!s && s !== 0) return null
  return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`
}

/**
 * Reads duration from the file locally, before uploading.
 *
 * Resolves null rather than rejecting on a codec the browser cannot decode —
 * the server refuses to publish a video with no duration, so a null here
 * surfaces as a clear refusal at publish time instead of a crash at upload.
 */
function readVideoDuration(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : null)
    }
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    v.src = url
  })
}

export function TrainingContentTab({ entity, canEdit = true }) {
  const qc = useQueryClient()
  const courseId = entity?.id
  const isDraft = entity?.status === 'DRAFT'
  const editable = canEdit && isDraft && entity?.editable !== false

  const fileRef = useRef(null)
  const [adding, setAdding] = useState(false)
  const [itemType, setItemType] = useState('VIDEO')
  const [title, setTitle] = useState('')
  const [externalUrl, setExternalUrl] = useState('')
  const [body, setBody] = useState('')
  // A STAGING LIST, not a single file. Picking nine videos one at a time meant
  // nine rounds of choose-name-submit; the duration read is already per-file, so
  // batching is a loop plus a list.
  const [staged, setStaged] = useState([])       // [{ documentId, durationSeconds, fileName, title }]
  const [uploadingName, setUploadingName] = useState(null)

  const { upload, progress, isUploading } = useDocumentUpload()

  const { data: res, isLoading } = useQuery({
    queryKey: ['training-course-items', courseId],
    queryFn: () => api.get(`/v1/training/courses/${courseId}/linked-items`),
    enabled: !!courseId,
  })
  const items = res || []

  const reset = () => {
    setAdding(false); setItemType('VIDEO'); setTitle('')
    setExternalUrl(''); setBody(''); setStaged([]); setUploadingName(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const addMutation = useMutation({
    mutationFn: (payload) => api.post(`/v1/training/courses/${courseId}/items`, payload),
    onSuccess: () => {
      toast.success('Content added')
      reset()
      qc.invalidateQueries({ queryKey: ['training-course-items', courseId] })
      qc.invalidateQueries({ queryKey: ['module-detail'] })
    },
    onError: (e) => toast.error(e?.message || 'Could not add the content'),
  })

  /**
   * Uploads every selected file, sequentially.
   *
   * Sequential rather than parallel on purpose: nine concurrent multi-megabyte
   * PUTs to S3 on an office connection is slower in aggregate than one at a
   * time, and a failure halfway through a parallel batch leaves an unclear
   * partial state. Each file that succeeds is staged; each that fails is
   * reported by name and skipped, so one bad file does not lose the other eight.
   */
  const handleFiles = useCallback(async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const added = []
    for (const file of files) {
      setUploadingName(file.name)

      // Read duration BEFORE uploading, so an undecodable file costs a second
      // rather than a full transfer.
      let durationSeconds = null
      if (itemType === 'VIDEO') {
        durationSeconds = await readVideoDuration(file)
        if (!durationSeconds) {
          toast.error(`Could not read the length of ${file.name} — skipped.`)
          continue
        }
      }

      try {
        const result = await upload(file, {
          documentType: itemType === 'VIDEO' ? 'TRAINING_VIDEO' : 'TRAINING_MATERIAL',
          entityType: 'TRAINING_COURSE',
          entityId: courseId,
          title: file.name,
          silent: true,
        })
        added.push({
          documentId: result?.documentId ?? result?.id,
          durationSeconds,
          fileName: file.name,
          mimeType: file.type,
          fileSizeBytes: file.size,
          title: file.name.replace(/\.[^.]+$/, ''),
        })
      } catch (err) {
        toast.error(`${file.name}: ${err?.message || 'upload failed'}`)
      }
    }

    setUploadingName(null)
    if (added.length) {
      setStaged(prev => [...prev, ...added])
      toast.success(`${added.length} file${added.length === 1 ? '' : 's'} uploaded`)
    }
    if (fileRef.current) fileRef.current.value = ''
  }, [itemType, courseId, upload])

  /**
   * Adds every staged file as its own content item, in the order picked.
   *
   * sortOrder is assigned here rather than left to the server so that selecting
   * nine videos keeps the order they were chosen in, which for a numbered series
   * is the whole point.
   */
  const addStaged = useCallback(async () => {
    const base = items.length * 10
    let ok = 0
    for (let i = 0; i < staged.length; i++) {
      const f = staged[i]
      try {
        await api.post(`/v1/training/courses/${courseId}/items`, {
          itemType,
          title: (f.title || f.fileName).trim(),
          documentId: f.documentId,
          durationSeconds: f.durationSeconds,
          mimeType: f.mimeType,
          fileSizeBytes: f.fileSizeBytes,
          sortOrder: base + (i + 1) * 10,
          isRequired: true,
        })
        ok++
      } catch (err) {
        toast.error(`${f.title || f.fileName}: ${err?.message || 'could not be added'}`)
      }
    }
    if (ok) {
      toast.success(`${ok} item${ok === 1 ? '' : 's'} added`)
      reset()
      qc.invalidateQueries({ queryKey: ['training-course-items', courseId] })
      qc.invalidateQueries({ queryKey: ['module-detail'] })
    }
  }, [staged, itemType, courseId, items.length, qc])

  const isFileType = itemType === 'VIDEO' || itemType === 'DOCUMENT'
  const canSubmit = isFileType
    ? staged.length > 0
    : (title.trim() && (itemType === 'LINK' ? !!externalUrl.trim() : !!body.trim()))

  if (isLoading) return (
    <div className="py-8 flex items-center justify-center">
      <RefreshCw size={16} className="animate-spin text-text-muted" />
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {!isDraft && (
        <p className="flex items-start gap-1.5 text-[11px] text-text-muted">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Content is locked once a course is published. Changing it under people who have
          already passed would silently invalidate their records — archive it and publish a
          new version instead.
        </p>
      )}

      {editable && (
        <div className="flex justify-end">
          <button onClick={() => (adding ? reset() : setAdding(true))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-ctl border border-border text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors">
            {adding ? <X size={12} /> : <Plus size={12} />}
            {adding ? 'Cancel' : 'Add content'}
          </button>
        </div>
      )}

      {adding && editable && (
        <div className="rounded-card border border-border bg-surface-secondary p-3 flex flex-col gap-2.5">
          <div className="flex gap-1.5">
            {['VIDEO', 'DOCUMENT', 'LINK', 'TEXT'].map(t => (
              <button key={t}
                onClick={() => { setItemType(t); setPending(null) }}
                className={`px-2.5 py-1 rounded-ctl text-[11px] border transition-colors ${
                  itemType === t
                    ? 'border-brand-500/40 bg-brand-500/10 text-text-primary'
                    : 'border-border text-text-muted hover:text-text-primary'}`}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {!isFileType && (
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Title"
              className="px-2 py-1.5 text-xs rounded-ctl border border-border bg-surface-primary text-text-primary placeholder:text-text-muted outline-none focus:border-border-strong" />
          )}

          {isFileType && (
            <>
              <label className="flex flex-col items-center justify-center h-20 rounded-ctl border-2 border-dashed border-border bg-surface-raised cursor-pointer hover:border-brand-500/40 transition-colors">
                {uploadingName ? (
                  <>
                    <RefreshCw size={14} className="animate-spin text-text-muted" />
                    <span className="text-[11px] text-text-muted mt-1">
                      Uploading {uploadingName}… {progress}%
                    </span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={14} className="text-text-muted" />
                    <span className="text-[11px] text-text-muted mt-1">
                      Choose {itemType === 'VIDEO' ? 'videos' : 'documents'} — you can select several
                    </span>
                    <span className="text-[10px] text-text-muted opacity-70">
                      {itemType === 'VIDEO' ? 'MP4, WebM or MOV, up to 500MB each' : 'PDF, DOCX, XLSX, up to 50MB each'}
                    </span>
                  </>
                )}
                <input ref={fileRef} type="file" multiple className="sr-only"
                  accept={itemType === 'VIDEO' ? 'video/mp4,video/webm,video/quicktime' : undefined}
                  onChange={handleFiles} disabled={!!uploadingName} />
              </label>

              {staged.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-text-muted">
                    {staged.length} ready — titles default from the filename, edit any before adding.
                    They are added in this order.
                  </span>
                  {staged.map((f, idx) => (
                    <div key={f.documentId ?? idx} className="flex items-center gap-2">
                      <span className="text-[11px] text-text-muted w-4">{idx + 1}</span>
                      <CheckCircle2 size={12} className="text-status-pass-fg shrink-0" />
                      <input
                        value={f.title}
                        onChange={e => setStaged(prev => prev.map((x, i) =>
                          i === idx ? { ...x, title: e.target.value } : x))}
                        className="flex-1 px-2 py-1 text-xs rounded-ctl border border-border bg-surface-primary text-text-primary outline-none focus:border-border-strong" />
                      {f.durationSeconds && (
                        <span className="text-[10px] text-text-muted w-16 text-right">
                          {formatDuration(f.durationSeconds)}
                        </span>
                      )}
                      <button title="Remove"
                        onClick={() => setStaged(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1 rounded text-text-muted hover:text-status-fail-fg">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {itemType === 'LINK' && (
            <input value={externalUrl} onChange={e => setExternalUrl(e.target.value)}
              placeholder="https://…"
              className="px-2 py-1.5 text-xs rounded-ctl border border-border bg-surface-primary text-text-primary placeholder:text-text-muted outline-none focus:border-border-strong" />
          )}

          {itemType === 'TEXT' && (
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
              placeholder="Text the learner reads"
              className="px-2 py-1.5 text-xs rounded-ctl border border-border bg-surface-primary text-text-primary placeholder:text-text-muted outline-none focus:border-border-strong resize-y" />
          )}

          <button
            disabled={!canSubmit || addMutation.isPending || !!uploadingName}
            onClick={() => {
              if (isFileType) return addStaged()
              addMutation.mutate({
                itemType,
                title: title.trim(),
                documentId: null,
                durationSeconds: null,
                externalUrl: externalUrl.trim() || null,
                body: body.trim() || null,
                isRequired: true,
              })
            }}
            className="self-start px-3 py-1.5 text-xs font-medium rounded-ctl bg-brand-500 text-white disabled:opacity-60">
            {isFileType
              ? `Add ${staged.length || ''} to course`.replace('  ', ' ')
              : (addMutation.isPending ? 'Adding…' : 'Add to course')}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-12 text-center">
          <Film size={18} className="mx-auto text-text-muted opacity-50" />
          <p className="text-sm text-text-muted mt-2">No content yet.</p>
          <p className="text-xs text-text-muted mt-1 opacity-60">
            A course needs at least one item before it can be published.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((i, idx) => {
            const Icon = TYPE_ICON[i.itemType] || Film
            return (
              <div key={i.id}
                className="flex items-center gap-3 p-3 rounded-card border border-border bg-surface-secondary">
                <span className="text-[11px] text-text-muted w-4">{idx + 1}</span>
                <Icon size={14} className="text-text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-text-primary truncate">{i.title}</span>
                    {i.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted">
                        {i.badge}
                      </span>
                    )}
                    {i.status === 'INCOMPLETE' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-fail-bg text-status-fail-fg">
                        Incomplete
                      </span>
                    )}
                  </div>
                  {i.linkNote && <p className="text-[11px] text-text-muted mt-0.5">{i.linkNote}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default TrainingContentTab