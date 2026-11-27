/**
 * A stable server key for a table that was not given one: the page path (ids
 * replaced by ":id", so every record's page shares one layout) plus a short
 * hash of what the table is made of (its column keys or header labels), so
 * two tables on one page keep separate layouts.
 *
 * Fits the server's rule: letters, digits and _ . : - only, at most 120.
 */
function hash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export function autoTableKey(signature) {
  const path = (typeof window !== 'undefined' ? window.location.pathname : '/')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')   // uuids
    .replace(/\/\d+(?=\/|$)/g, '/:id')                // numeric ids
    .replace(/^\/+|\/+$/g, '')
    .replace(/\//g, '.')
    .replace(/[^A-Za-z0-9_.:-]/g, '_')
    .slice(0, 80) || 'root'
  return `auto.${path}.${hash(String(signature || ''))}`.slice(0, 120)
}