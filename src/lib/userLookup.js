/**
 * userLookup — resolve user ids to display names, BATCHED.
 *
 * WHY: every list column and detail field that shows a person resolved its id
 * with its own GET /v1/users/{id} — a full user load (roles, attributes) per
 * cell, and no de-duplication of requests already in flight, so ten rows with
 * the same lead auditor fired ten identical requests. One page was measured at
 * 29 of them, each ~1 s against a remote database.
 *
 * Now: every id asked for in the same tick is collected and fetched in ONE call
 * to GET /v1/users/lookup?ids=…, each id is fetched at most once per page
 * session, and concurrent askers share the same promise.
 *
 * If the backend predates /lookup (404/405), it falls back to the old per-id
 * call once and remembers that, so a frontend deployed ahead of the backend
 * still works.
 */
import api from '../config/axios.config'

const cache   = new Map()   // id → Promise<user|null>
let   pending = new Map()   // id → { resolve }
let   timer   = null
let   batchUnsupported = false
const MAX_BATCH = 200

const unwrap = (r) => (r?.data?.data ?? r?.data ?? r)

/** Display label for a user object (same rule the old lookups used). */
export function userLabel(u, fallback = '') {
  if (!u) return fallback
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  return name || (u.fullName && u.fullName.trim() !== 'null null' ? u.fullName.trim() : '') || u.email || fallback
}

async function fetchOne(id) {
  try { return unwrap(await api.get(`/v1/users/${id}`)) || null } catch { return null }
}

async function flush() {
  timer = null
  const batch = pending
  pending = new Map()
  const ids = [...batch.keys()]

  for (let i = 0; i < ids.length; i += MAX_BATCH) {
    const chunk = ids.slice(i, i + MAX_BATCH)
    let byId = null
    if (!batchUnsupported) {
      try {
        const rows = unwrap(await api.get('/v1/users/lookup', { params: { ids: chunk.join(',') } }))
        byId = new Map((Array.isArray(rows) ? rows : []).map(u => [String(u.id), u]))
      } catch (e) {
        const status = e?.response?.status ?? e?.status
        if (status === 404 || status === 405) batchUnsupported = true
      }
    }
    if (byId) {
      chunk.forEach(id => batch.get(id).resolve(byId.get(id) ?? null))
    } else {
      // Old backend (or the batch failed): one call per id, still de-duplicated.
      await Promise.all(chunk.map(async id => batch.get(id).resolve(await fetchOne(id))))
    }
  }
}

/** Promise of the user (minimal fields) or null when not visible / not found. */
export function getUser(id) {
  if (id === null || id === undefined || id === '') return Promise.resolve(null)
  const key = String(id)
  if (!/^\d+$/.test(key)) return Promise.resolve(null)
  if (cache.has(key)) return cache.get(key)
  const p = new Promise(resolve => { pending.set(key, { resolve }) })
  cache.set(key, p)
  if (!timer) timer = setTimeout(flush, 10)
  return p
}

/** Promise of the display label ('' when not visible / not found). */
export function getUserLabel(id) {
  return getUser(id).then(u => userLabel(u, ''))
}

/** Forget one user (or all) — e.g. after renaming someone. */
export function invalidateUserLookup(id) {
  if (id === undefined) cache.clear()
  else cache.delete(String(id))
}