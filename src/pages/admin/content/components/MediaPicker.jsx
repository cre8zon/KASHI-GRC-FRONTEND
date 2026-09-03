import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, Check, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { contentApi } from '../../../../api/content.api'
import { Modal } from '../../../../components/ui/Modal'
import { Input } from '../../../../components/ui/Input'
import { Button } from '../../../../components/ui/Button'
import { cn } from '../../../../lib/cn'

/**
 * The image library, as a picker.
 *
 * ── ALT TEXT IS ASKED FOR AT UPLOAD ──────────────────────────────────────────
 * The server rejects an upload without it, and this is where that friction is
 * meant to land. The person uploading knows what the image shows; asking them
 * costs five seconds. Deferring it to publish means asking someone else, three
 * weeks later, about an image they did not choose — which is how every content
 * site ends up with `alt="image1"`.
 */
export function MediaPicker({ open, onClose, onSelect }) {
  const [file, setFile] = useState(null)
  const [altText, setAltText] = useState('')
  const [caption, setCaption] = useState('')
  const inputRef = useRef(null)
  const client = useQueryClient()

  const library = useQuery({
    queryKey: ['content-media'],
    queryFn: () => contentApi.media({ size: 60 }).then((page) => page?.items ?? []),
    enabled: open,
  })

  const upload = useMutation({
    mutationFn: () => contentApi.uploadMedia(file, altText, caption),
    onSuccess: (res) => {
      client.invalidateQueries({ queryKey: ['content-media'] })
      onSelect(res)
      reset()
      onClose()
    },
    onError: (err) => toast.error(err?.response?.data?.error?.message || 'Upload failed'),
  })

  const reset = () => { setFile(null); setAltText(''); setCaption('') }

  return (
    <Modal open={open} onClose={onClose} title="Images" size="lg">
      <div className="flex flex-col gap-5">
        {/* ── upload ────────────────────────────────────────────────────── */}
        <div className="rounded-card border border-border-subtle bg-surface-inset p-4">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          {!file ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-ctl border border-dashed border-border py-6 text-sm text-text-secondary transition-colors hover:border-brand-500 hover:text-brand-900"
            >
              <Upload size={15} /> Choose an image
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-text-primary">{file.name}</p>

              <Input
                label="Alt text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="Describe what the image shows, for a reader who cannot see it"
                autoFocus
              />
              <p className="flex items-start gap-1.5 text-[11px] text-text-faint">
                <AlertCircle size={11} className="mt-0.5 shrink-0" />
                Required. Not a caption — a caption adds context, alt text replaces the image.
              </p>

              <Input
                label="Caption (optional)"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Shown under the image"
              />

              <div className="flex gap-2">
                <Button size="sm" variant="primary" loading={upload.isPending}
                        disabled={!altText.trim()}
                        onClick={() => upload.mutate()}>
                  Upload
                </Button>
                <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        {/* ── library ───────────────────────────────────────────────────── */}
        <div className="grid max-h-96 grid-cols-4 gap-3 overflow-y-auto">
          {(library.data || []).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onSelect(m); onClose() }}
              className="group relative overflow-hidden rounded-card border border-border transition-shadow hover:shadow-hover"
              title={m.altText}
            >
              <img src={m.url} alt={m.altText} className="h-24 w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-surface-overlay opacity-0 transition-opacity group-hover:opacity-95">
                <Check size={16} className="text-brand-900" />
              </span>
            </button>
          ))}
          {library.isSuccess && library.data.length === 0 && (
            <p className="col-span-4 py-8 text-center text-sm text-text-faint">
              Nothing in the library yet.
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}