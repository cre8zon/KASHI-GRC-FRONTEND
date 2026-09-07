import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, Check, AlertCircle, Trash2, FileText, Pencil, XCircle } from 'lucide-react'
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
export function MediaPicker({ open, onClose, onSelect, currentId = null }) {
  const [file, setFile] = useState(null)
  const [altText, setAltText] = useState('')

  /**
   * Images and attachments are the same picker with two different rules.
   *
   * The accept filter used to be image/* unconditionally, so the file dialog
   * would not even show a PDF — the download block could not attach a document
   * through the only UI that exists for attaching one.
   *
   * Alt text is required for an image and pointless for a PDF: the download
   * block already carries a title and a description, and asking for a third
   * description of the same file yields "document" every time.
   */
  const isImage = !file || (file.type || '').startsWith('image/')
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
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.zip"
            className="hidden"
            onChange={(e) => {
              // Only set when something was actually chosen. Some browsers fire
              // change with an empty list when the OS dialog is dismissed, and
              // `|| null` turned that into "clear the file I already had" —
              // which, now that Replace reopens the same dialog, would discard
              // a good selection because you changed your mind about changing
              // your mind.
              const chosen = e.target.files?.[0]
              if (chosen) setFile(chosen)
              e.target.value = ''   // so re-picking the same file still fires
            }}
          />

          {!file ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-ctl border border-dashed border-border py-6 text-sm text-text-secondary transition-colors hover:border-brand-500 hover:text-brand-900"
            >
              <Upload size={15} /> Choose an image or document
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              {/*
                The chosen file, with a way to change it.
                
                Picking the wrong file left one exit: Cancel, which also threw
                away the alt text you had already typed. On a name like
                Gemini_Generated_Image_ndkhbnndkhbnndkh.png you often cannot
                tell it is wrong until you have read it — which is exactly when
                the alt text is half written.

                Choosing again keeps the alt text and the caption, because the
                replacement is nearly always the image you meant to describe.
              */}
              <div className="flex items-center gap-2">
                <FileText size={13} className="shrink-0 text-text-secondary" />
                <p className="min-w-0 flex-1 truncate text-[13px] text-text-primary" title={file.name}>
                  {file.name}
                </p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex shrink-0 items-center gap-1 rounded-ctl border border-border px-2 py-1 text-[11.5px] text-text-secondary transition-colors hover:border-brand-500 hover:text-brand-900"
                >
                  <Upload size={11} /> Replace file
                </button>
              </div>

              {isImage ? (
                <>
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
                </>
              ) : (
                <p className="flex items-start gap-1.5 text-[11px] text-text-faint">
                  <AlertCircle size={11} className="mt-0.5 shrink-0" />
                  Stored as-is. Give it a title and a description on the download
                  block itself — that is what a reader sees.
                </p>
              )}

              <Input
                label="Caption (optional)"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Shown under the image"
              />

              <div className="flex gap-2">
                <Button size="sm" variant="primary" loading={upload.isPending}
                        disabled={isImage && !altText.trim()}
                        onClick={() => upload.mutate()}>
                  Upload
                </Button>
                <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        {/* Detach without choosing a replacement. Every route into this modal
            could previously only END in a selection, so opening it to clear a
            slot was a trap — Cancel left the old one, and there was nothing
            else to press. */}
        {currentId && (
          <button
            type="button"
            onClick={() => { onSelect(null); onClose() }}
            className="flex items-center gap-1.5 self-start text-[12px] text-text-secondary transition-colors hover:text-status-fail-fg"
          >
            <XCircle size={12} />
            Remove the current file from this slot
          </button>
        )}

        {/* ── library ───────────────────────────────────────────────────── */}
        <div className="grid max-h-96 grid-cols-4 gap-3 overflow-y-auto">
          {(library.data || []).map((m) => (
            <MediaTile
              key={m.id}
              asset={m}
              selected={m.id === currentId}
              onSelect={() => { onSelect(m); onClose() }}
              onDeleted={() => library.refetch()}
              onUpdated={() => library.refetch()}
            />
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

/**
 * One asset in the library, with a way to get rid of it.
 *
 * The delete is a two-step press rather than a window.confirm: a confirm
 * dialog in a modal is a dialog on top of a dialog, and the browser one cannot
 * say what will actually happen. Pressing once turns the button into "Sure?",
 * and it reverts on mouse-out — which is enough friction for something the
 * server will refuse anyway if the file is in use.
 */
function MediaTile({ asset, selected, onSelect, onDeleted, onUpdated }) {
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ altText: asset.altText || '', caption: asset.caption || '' })

  /**
   * Editing alt text after the fact.
   *
   * updateMedia has existed in the API layer since the module shipped and was
   * never called from anywhere, so a typo in alt text was permanent: the only
   * repair was uploading the same file again under a second row.
   *
   * It is edited HERE rather than in the block, because alt text belongs to
   * the asset. The same image used on three posts should not need correcting
   * three times, and the block-level field would let it drift.
   */
  const save = useMutation({
    mutationFn: () => contentApi.updateMedia(asset.id, draft),
    onSuccess: () => { toast.success('Saved'); setEditing(false); onUpdated() },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Could not save'),
  })
  const remove = useMutation({
    mutationFn: () => contentApi.deleteMedia(asset.id),
    onSuccess: () => { toast.success('Deleted'); onDeleted() },
    onError: (e) => {
      // MEDIA_IN_USE names how many posts still reference it. That message is
      // the useful part, so it is shown rather than a generic failure.
      toast.error(e?.response?.data?.error?.message || 'Could not delete')
      setConfirming(false)
    },
  })

  const isImage = (asset.mimeType || '').startsWith('image/')

  if (editing) {
    return (
      <div className="col-span-2 flex flex-col gap-2 rounded-card border border-brand-800 p-2">
        <Input label="Alt text" value={draft.altText} autoFocus
               onChange={(e) => setDraft({ ...draft, altText: e.target.value })} />
        <Input label="Caption" value={draft.caption}
               onChange={(e) => setDraft({ ...draft, caption: e.target.value })} />
        <div className="flex gap-2">
          <Button size="sm" variant="primary" loading={save.isPending}
                  disabled={!draft.altText.trim()} onClick={() => save.mutate()}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'group relative overflow-hidden rounded-card border',
      // The one already attached is marked. Opening the picker to replace
      // something showed a grid with nothing indicating your current choice.
      selected ? 'border-brand-800 ring-1 ring-brand-800' : 'border-border'
    )}>
      <button
        type="button"
        onClick={onSelect}
        title={asset.altText}
        className="block w-full"
      >
        {isImage ? (
          <img src={asset.url} alt={asset.altText} className="h-24 w-full object-cover" />
        ) : (
          <span className="flex h-24 w-full flex-col items-center justify-center gap-1 bg-surface-inset px-2 text-center">
            <FileText size={16} className="text-text-secondary" />
            <span className="line-clamp-2 text-[10px] text-text-secondary">{asset.altText}</span>
          </span>
        )}
      </button>

      {selected && (
        <span className="absolute left-1 top-1 rounded-badge bg-brand-500 px-1.5 py-0.5 text-[10px] font-medium text-brand-900">
          In use here
        </span>
      )}

      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="Edit alt text"
        title="Edit alt text and caption"
        className="absolute right-8 top-1 flex h-6 w-6 items-center justify-center rounded-badge bg-surface-overlay text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 hover:text-brand-900"
      >
        <Pencil size={11} />
      </button>

      <button
        type="button"
        onClick={() => (confirming ? remove.mutate() : setConfirming(true))}
        onMouseLeave={() => setConfirming(false)}
        disabled={remove.isPending}
        aria-label={confirming ? 'Confirm delete' : 'Delete'}
        className={cn(
          'absolute right-1 top-1 flex h-6 items-center gap-1 rounded-badge px-1.5 text-[10px] transition-opacity',
          confirming
            ? 'bg-status-fail-fg text-surface opacity-100'
            : 'bg-surface-overlay text-text-secondary opacity-0 group-hover:opacity-100 hover:text-status-fail-fg'
        )}
      >
        <Trash2 size={11} />
        {confirming && 'Sure?'}
      </button>
    </div>
  )
}