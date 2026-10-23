/**
 * What can be sent in chat — WhatsApp's rules, mirrored from the server
 * (StorageService: CHAT_FILE). Checked here first so a file that cannot go
 * is refused at once, with the reason, instead of failing mid-upload.
 *
 *   Photos   JPEG, PNG, WebP, HEIC/HEIF, TIFF, BMP up to 10 MB — sent
 *            compressed (WebP), like a WhatsApp photo. 10 MB is the API's
 *            upload limit (and nginx's client_max_body_size must allow it):
 *            photos go through the server to be converted.
 *   Files    everything else, and photos over 10 MB, up to 100 MB — sent as
 *            they are: PDF, Word/Excel/PowerPoint, OpenDocument, text, CSV,
 *            archives (ZIP, RAR, 7z…), audio, video, GIFs (animation kept),
 *            SVG (shown as a picture; its scripts never run — <img> only)…
 *            100 MB, not WhatsApp's 2 GB: chat is for working files, and a
 *            2 GB upload is a storage bill and a 30-minute wait. Raise it
 *            here AND in StorageService.MAX_CHAT_FILE_SIZE_BYTES.
 *   Never    programs, scripts and web pages (.exe, .bat, .ps1, .jar, .apk,
 *            .html…).
 * The same in direct messages, groups and channels.
 */
export const MAX_FILES = 30
export const PHOTO_MAX = 10 * 1024 * 1024
export const FILE_MAX = 100 * 1024 * 1024

const PHOTO_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/tiff', 'image/bmp'])
const PHOTO_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tif', 'tiff', 'bmp'])

const BLOCKED_EXT = new Set([
  'exe', 'msi', 'msp', 'msix', 'appx', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl',
  'vbs', 'vbe', 'js', 'jse', 'mjs', 'wsf', 'wsh', 'hta', 'ps1', 'psm1', 'psd1',
  'sh', 'bash', 'zsh', 'csh', 'ksh', 'command', 'jar', 'jnlp', 'apk', 'aab', 'ipa',
  'app', 'dmg', 'pkg', 'deb', 'rpm', 'run', 'bin', 'elf', 'dll', 'sys', 'drv',
  'lnk', 'reg', 'inf', 'scf', 'url', 'html', 'htm', 'xhtml', 'shtml', 'mht', 'mhtml',
])

export const extOf = (name) => {
  const m = /\.([^.]+)$/.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}

export const fmtBytes = (n) => n == null ? '' : n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1).replace(/\.0$/, '')} GB`
  : n >= 1048576 ? `${(n / 1048576).toFixed(1).replace(/\.0$/, '')} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`

/** A photo (sent compressed): a photo type, and small enough. GIFs are files. */
export function isPhoto(file) {
  const type = (file.type || '').toLowerCase()
  const looksPhoto = PHOTO_TYPES.has(type) || (!type && PHOTO_EXT.has(extOf(file.name)))
  return looksPhoto && file.size <= PHOTO_MAX
}

/** Why this file cannot be sent, or null when it can. */
export function refusal(file) {
  const ext = extOf(file.name)
  if (BLOCKED_EXT.has(ext)) return `${file.name}: programs, scripts and web pages (.${ext}) can't be sent in chat. Zip it, or share it another way.`
  if (file.size === 0) return `${file.name} is empty.`
  if (file.size > FILE_MAX) return `${file.name} is ${fmtBytes(file.size)} — files can be up to ${fmtBytes(FILE_MAX)}.`
  return null
}