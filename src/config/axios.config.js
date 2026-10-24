import axios from 'axios'
import { store } from '../store'
import { queryClient } from './queryClient'
import { SESSION_CODES, isAuthEndpoint, canRefresh, refreshSession, endSession, isRefreshRefused } from '../lib/session'
import { isJwtExpired } from '../lib/jwt'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
  timeout: 180000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const { auth } = store.getState()
  if (auth.token) config.headers['Authorization'] = `Bearer ${auth.token}`
  if (auth.tenantId) config.headers['X-Tenant-ID'] = auth.tenantId
  return config
}, (error) => Promise.reject(error))

// ─── Global mutation → cache invalidation map ─────────────────────────────────
//
// When any POST/PUT/PATCH/DELETE succeeds, automatically invalidate the React
// Query cache keys that are affected by that URL — no per-page wiring needed.
//
// Rules are matched by URL prefix (longest match wins).
// Each rule lists the query keys to invalidate.
// This covers every existing page and every new page built in the future.
//
// Result: changes made via any admin UI are reflected instantly everywhere
// without the user having to refresh the browser.
//
const MUTATION_INVALIDATION_RULES = [
  // UI Config admin — nav, components, forms, layouts, actions, flags, widgets
  { prefix: '/v1/admin/ui/navigation',    keys: ['admin-nav', 'admin-nav-all', 'navigation', 'bootstrap'] },
  { prefix: '/v1/admin/ui/components',    keys: ['admin-components', 'screen-config'] },
  { prefix: '/v1/admin/ui/options',       keys: ['admin-options', 'screen-config'] },
  { prefix: '/v1/admin/ui/layouts',       keys: ['admin-layouts', 'screen-config'] },
  { prefix: '/v1/admin/ui/forms',         keys: ['admin-forms', 'screen-config'] },
  { prefix: '/v1/admin/ui/form-fields',   keys: ['admin-form-fields', 'screen-config'] },
  { prefix: '/v1/admin/ui/actions',       keys: ['admin-actions', 'admin-actions-all', 'screen-config'] },
  { prefix: '/v1/admin/ui/widgets',       keys: ['admin-widgets', 'screen-config'] },
  { prefix: '/v1/admin/ui/flags',         keys: ['admin-flags', 'screen-config'] },
  { prefix: '/v1/admin/ui/branding',      keys: ['bootstrap', 'branding'] },

  // RBAC admin — permissions, grants, roles
  { prefix: '/v1/admin/rbac/permissions', keys: ['rbac-permissions-all', 'perm-roles'] },
  { prefix: '/v1/admin/rbac/roles',       keys: ['rbac-roles', 'rbac-roles-all', 'roles-all'] },
  { prefix: '/v1/admin/rbac/grants',      keys: ['perm-roles', 'rbac-grants'] },
  { prefix: '/v1/admin/rbac',             keys: ['perm-roles', 'rbac-permissions-all'] },

  // Module blueprints
  { prefix: '/v1/admin/module-blueprints', keys: ['module-blueprint'] },

  // Workflow
  { prefix: '/v1/workflow-instances',     keys: ['module-workflow', 'view-context', 'module-detail', 'workflow-instances'] },
  { prefix: '/v1/workflows',              keys: ['admin-workflows', 'module-workflow'] },

  // Audit library
  { prefix: '/v1/audit/library',          keys: ['module-list', 'module-detail', 'screen-config'] },
  { prefix: '/v1/audit/engagements',      keys: ['module-list', 'module-detail', 'view-context'] },
  { prefix: '/v1/audit/findings',         keys: ['module-list', 'module-detail'] },

  // Issues
  { prefix: '/v1/issues',                 keys: ['module-list', 'module-detail', 'view-context'] },

  // Vendors / assessments
  { prefix: '/v1/vendors',                keys: ['module-list', 'module-detail'] },
  { prefix: '/v1/assessments',            keys: ['module-list', 'module-detail'] },

  // Users & tenants
  { prefix: '/v1/users',                  keys: ['users', 'admin-users'] },
  { prefix: '/v1/tenants',               keys: ['tenants', 'roles', 'rbac-roles'] },

  // Navigation (consumer endpoint — bootstrap covers this but belt-and-suspenders)
  { prefix: '/v1/ui-config/bootstrap',   keys: ['bootstrap', 'navigation'] },
]

const MUTATION_METHODS = new Set(['post', 'put', 'patch', 'delete'])

function invalidateForUrl(url) {
  if (!url) return
  // Find all matching rules (not just the first) — a URL can match multiple prefixes
  const matched = MUTATION_INVALIDATION_RULES.filter(rule =>
    url.includes(rule.prefix)
  )
  if (matched.length === 0) return
  const keysToInvalidate = [...new Set(matched.flatMap(r => r.keys))]
  keysToInvalidate.forEach(key => {
    queryClient.invalidateQueries({ queryKey: [key], exact: false })
  })
}

api.interceptors.response.use(
  (response) => {
    // On any successful mutation, invalidate related cache keys globally
    const method = response.config?.method?.toLowerCase()
    if (MUTATION_METHODS.has(method)) {
      const url = response.config?.url || ''
      invalidateForUrl(url)
    }
    return response.data?.data ?? response.data
  },
  async (error) => {
    const httpStatus = error.response?.status
    const code       = error.response?.data?.error?.code
    const cfg        = error.config || {}
    const url        = cfg.url || ''

    // ── Session handling ────────────────────────────────────────────────
    // A 401 whose code says "session over" (or no code at all) → renew once
    // and replay the request; if renewal is impossible, end the session and
    // send the user to sign in. Other 401s (e.g. a mistyped current password)
    // are ordinary errors and fall through to the caller.
    //
    // The 403 branch covers a backend that predates the 401 entry point: it
    // answered an expired token with an empty 403. We only treat it as expiry
    // when our own token says it has expired, so a genuine permission 403 is
    // never mistaken for a sign-out.
    const sessionOver =
      store.getState().auth.isAuthenticated && !isAuthEndpoint(url) && (
        (httpStatus === 401 && (!code || SESSION_CODES.has(code))) ||
        (httpStatus === 403 && !code && isJwtExpired(store.getState().auth.token))
      )

    if (sessionOver) {
      if (!cfg._kashiRetried && canRefresh()) {
        try {
          await refreshSession()
          cfg._kashiRetried = true
          // The request interceptor re-reads the (now refreshed) token.
          return api(cfg)
        } catch (refreshErr) {
          // Signed out only if the server refused the renewal. If it could
          // not be reached, this request fails like any other while the
          // server is down, and the session is renewed once it is back.
          if (isRefreshRefused(refreshErr)) endSession('expired')
        }
      } else {
        endSession(code === 'AUTH_TOKEN_INVALID' ? 'invalid' : 'expired')
      }
    }

    const apiError = error.response?.data?.error
    // Carry the HTTP status through. This used to reject with the API error body
    // alone, so every consumer saw { code, message } and nothing could tell a 403
    // from a 500 from a dropped connection — error.response does not survive this
    // interceptor. Anything that wants to react to the status (offer a tenant
    // switch on a 403, retry on a 502) needs it here.
    const status = error.response?.status ?? null
    // No answer at all, or nginx saying the app behind it is gone: ask
    // useServerStatus to check now. Its health check otherwise runs only at
    // start-up and on browser offline/online, so a server that died mid-session
    // went unnoticed and every page just showed "No data".
    if (!error.response || status === 502 || status === 503 || status === 504) {
      try { window.dispatchEvent(new Event('kashi:api-unreachable')) } catch { /* not in a browser */ }
    }
    // apiError already carries `details` when the server attached any (see
    // BusinessException), so spreading it forwards them untouched.
    const rejected = apiError
      ? { ...apiError, status }
      : { code: 'NETWORK_ERROR', message: error.message, status }

    // ── Back-compat shim: keep an axios-shaped `response` ─────────────────
    // 128 call sites across 39 files read e?.response?.data?.message to build
    // their error toasts. None of them has ever worked: this interceptor
    // rejects the API error body, so `response` was always undefined and every
    // one of them silently fell through to its generic fallback — which is why
    // a refusal the server explained clearly surfaced as "Deprecate failed".
    //
    // Re-attaching the shape fixes all of them at once instead of editing 39
    // files. Only set when there genuinely was an HTTP response, so code that
    // tests `if (err.response)` to distinguish a server error from a dropped
    // connection keeps working.
    if (error.response) {
      rejected.response = { status, data: { error: apiError, message: rejected.message } }
    }
    return Promise.reject(rejected)
  }
)

export default api