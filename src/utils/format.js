export const formatDate = (iso, opts = {}) => {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', ...opts,
  }).format(new Date(iso))
}

export const formatDateTime = (iso) => {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export const formatRiskScore = (score) => {
  if (score == null) return '—'
  return Number(score).toFixed(1)
}

export const getRiskLevel = (score) => {
  const v = Number(score)
  if (v >= 85) return { label: 'Critical', color: 'red' }
  if (v >= 60) return { label: 'High',     color: 'amber' }
  if (v >= 25) return { label: 'Medium',   color: 'yellow' }
  return               { label: 'Low',     color: 'green' }
}

export const truncate = (str, len = 40) =>
  str && str.length > len ? str.slice(0, len) + '…' : str ?? '—'

export const initials = (name) =>
  name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'

/**
 * formatBytes — human-readable file size.
 * Used by EvidenceUploader.jsx.
 * Examples: 1024 → "1.0 KB", 1536000 → "1.5 MB"
 */
export const formatBytes = (bytes, decimals = 1) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
}
