/**
 * Turn a URL someone pasted into one that can actually be framed.
 *
 * A YouTube watch URL sends X-Frame-Options: SAMEORIGIN, so an iframe pointed
 * at it renders a blank box with no error anywhere — which is exactly what you
 * get by copying the address bar, and exactly what everyone does.
 *
 * Applied in BOTH the editor and the renderer, deliberately. In the editor so
 * what gets stored is right from now on; in the renderer so the posts that
 * already hold a watch URL start working without a migration.
 */
export function toEmbedUrl(raw) {
  if (!raw) return ''
  const url = String(raw).trim()

  const youtube =
    url.match(/[?&]v=([\w-]{6,})/) ||                       // watch?v=ID
    url.match(/youtu\.be\/([\w-]{6,})/) ||                  // youtu.be/ID
    url.match(/youtube\.com\/(?:embed|shorts|live)\/([\w-]{6,})/)
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`

  const loom = url.match(/loom\.com\/(?:share|embed)\/([\w-]{8,})/)
  if (loom) return `https://www.loom.com/embed/${loom[1]}`

  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d{6,})/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`

  return url
}

/** Did we recognise it? Used to warn in the editor rather than fail silently. */
export function isEmbeddable(raw) {
  return !!raw && toEmbedUrl(raw) !== String(raw).trim()
    || /(?:youtube\.com\/embed|loom\.com\/embed|player\.vimeo\.com)/.test(raw || '')
}