import axios from 'axios'
import { store } from '../store'
import { logout } from '../store/slices/authSlice'
import { queryClient } from './queryClient'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
  timeout: 60000,
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
  (error) => {
    if (error.response?.status === 401) {
      store.dispatch(logout())
      window.location.href = '/auth/login'
    }
    const apiError = error.response?.data?.error
    return Promise.reject(apiError || { code: 'NETWORK_ERROR', message: error.message })
  }
)

export default api