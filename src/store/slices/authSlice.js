import { createSlice, createSelector } from '@reduxjs/toolkit'

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
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginSuccess(state, { payload }) {
      const { user, session } = payload
      state.token                = session.token
      state.refreshToken         = session.refreshToken
      state.expiresAt            = session.expiresAt
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
      state.expiresAt    = session.expiresAt
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
    validateSession(state) {
      if (!state.isAuthenticated || !state.token) return
      if (state.expiresAt && Date.now() > new Date(state.expiresAt).getTime()) {
        return initialState
      }
    },
    // Called after bootstrap to update names without requiring re-login
    updateContext(state, { payload }) {
      if (payload.tenantName) state.tenantName = payload.tenantName
      if (payload.vendorName) state.vendorName = payload.vendorName
    },
  },
})

export const { loginSuccess, logout, tenantSwitched, updateToken, validateSession, updateContext } = authSlice.actions
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