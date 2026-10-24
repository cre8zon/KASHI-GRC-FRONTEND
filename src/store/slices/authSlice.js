import { createSlice, createSelector } from '@reduxjs/toolkit'
import { isJwtExpired, jwtExpiryMs } from '../../lib/jwt'

const initialState = {
  token: null, refreshToken: null, expiresAt: null,
  userId: null, email: null, fullName: null,
  tenantId: null, tenantName: null, status: null,
  vendorId: null, vendorName: null,
  roles: [], permissions: [],
  // Tenants this identity may act in. One entry for almost everyone; an external
  // auditor has their firm plus each client they are staffed on.
  memberships: [],
  requiresPasswordReset: false,
  isAuthenticated: false,
  // "Keep me signed in" — persists the session across browser restarts and
  // exempts it from the idle timeout (the refresh-token lifetime still caps it).
  rememberMe: false,
}

/**
 * Expiry for the store, from the token's own `exp` claim. The server's
 * session.expiresAt is zone-less server time and can be hours off in the
 * browser; it is only used when the token cannot be decoded.
 */
function expiryIso(session) {
  const ms = jwtExpiryMs(session?.token)
  if (ms) return new Date(ms).toISOString()
  if (typeof session?.expiresInMs === 'number') return new Date(Date.now() + session.expiresInMs).toISOString()
  return session?.expiresAt ?? null
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginSuccess(state, { payload }) {
      const { user, session } = payload
      state.token                = session.token
      state.refreshToken         = session.refreshToken
      state.expiresAt            = expiryIso(session)
      state.rememberMe           = !!payload.rememberMe
      state.userId               = user.userId
      state.email                = user.email
      state.fullName             = user.fullName
      state.tenantId             = user.tenantId
      state.tenantName           = user.tenantName || null
      state.status               = user.status
      state.vendorId             = user.vendorId || null
      state.vendorName           = user.vendorName || null
      state.roles                = user.roles || []
      state.permissions          = user.permissions || []
      state.memberships          = user.memberships || []
      state.requiresPasswordReset = user.requiresPasswordReset || false
      state.isAuthenticated      = true
    },
    logout() { return initialState },

    /**
     * Replaces the session after switching tenant.
     *
     * The new token is scoped to exactly ONE tenant, same as the old one —
     * switching re-points access, it does not widen it. Roles and permissions
     * are overwritten wholesale rather than merged: an auditor is
     * ORGANIZATION-side at their own firm and AUDITOR-side at a client, so
     * carrying stale permissions across would render UI they have no right to.
     */
    tenantSwitched(state, { payload }) {
      const { user, session } = payload
      state.token        = session.token
      state.refreshToken = session.refreshToken
      state.expiresAt    = expiryIso(session)
      state.tenantId     = user.tenantId
      state.tenantName   = user.tenantName || null
      state.roles        = user.roles || []
      state.permissions  = user.permissions || []
      state.memberships  = user.memberships || state.memberships
      state.vendorId     = user.vendorId || null
      state.vendorName   = user.vendorName || null
    },
    updateToken(state, { payload }) {
      state.token     = payload.token
      state.expiresAt = payload.expiresAt
    },
    /**
     * A refresh succeeded. Same tenant, same person — only the credentials and
     * whatever the server now says about roles/permissions change, so a role
     * granted or revoked since sign-in takes effect without a re-login.
     */
    /**
     * Take over the session another tab of this browser holds (lib/session):
     * its renewed tokens, or — for a tab opened without one — the whole
     * signed-in state. Same browser, same origin; nothing leaves the device.
     */
    sessionAdopted(state, { payload }) {
      if (!payload?.isAuthenticated || !payload?.token || !payload?.refreshToken) return
      return { ...state, ...payload }
    },
    sessionRefreshed(state, { payload }) {
      const { user, session } = payload || {}
      if (!session?.token) return
      state.token        = session.token
      state.refreshToken = session.refreshToken || state.refreshToken
      state.expiresAt    = expiryIso(session)
      if (user) {
        state.roles       = user.roles       || state.roles
        state.permissions = user.permissions || state.permissions
        state.memberships = user.memberships || state.memberships
        if (user.tenantName) state.tenantName = user.tenantName
      }
    },
    /**
     * Boot-time check. An expired ACCESS token is not the end of the session
     * while the refresh token is still good — SessionManager renews it on
     * mount. Only when both are spent is the stored session dropped, so a
     * reload after lunch no longer bounces a user who is still signed in.
     */
    validateSession(state) {
      if (!state.isAuthenticated || !state.token) return
      const exp = jwtExpiryMs(state.token)
        ?? (state.expiresAt ? new Date(state.expiresAt).getTime() : null)
      if (!exp || Date.now() < exp) return   // still valid (or unknown — let the server decide)
      if (state.refreshToken && !isJwtExpired(state.refreshToken)) return
      return initialState
    },
    // Called after bootstrap to update names without requiring re-login
    updateContext(state, { payload }) {
      if (payload.tenantName) state.tenantName = payload.tenantName
      if (payload.vendorName) state.vendorName = payload.vendorName
    },
  },
})

export const { loginSuccess, logout, tenantSwitched, sessionRefreshed, sessionAdopted, updateToken, validateSession, updateContext } = authSlice.actions
export default authSlice.reducer

export const selectAuth            = (s) => s.auth
export const selectIsAuthenticated = (s) => s.auth.isAuthenticated
export const selectUser            = createSelector(
  (s) => s.auth.userId,
  (s) => s.auth.email,
  (s) => s.auth.fullName,
  (userId, email, fullName) => ({ userId, email, fullName })
)
export const selectTenantId        = (s) => s.auth.tenantId
export const selectRoles           = (s) => s.auth.roles
export const selectVendorId        = (s) => s.auth.vendorId
export const selectPermissions     = (s) => s.auth.permissions
export const selectRoleSides = createSelector(
  (s) => s.auth.roles,
  (roles) => [...new Set(roles.map(r => r.side).filter(Boolean))]
)