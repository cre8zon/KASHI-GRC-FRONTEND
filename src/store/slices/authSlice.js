import { createSlice, createSelector } from '@reduxjs/toolkit'

const initialState = {
  token: null, refreshToken: null, expiresAt: null,
  userId: null, email: null, fullName: null,
  tenantId: null, tenantName: null, status: null,
  vendorId: null, vendorName: null,
  roles: [], permissions: [],
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
      state.requiresPasswordReset = user.requiresPasswordReset || false
      state.isAuthenticated      = true
    },
    logout() { return initialState },
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

export const { loginSuccess, logout, updateToken, validateSession, updateContext } = authSlice.actions
export default authSlice.reducer

export const selectAuth            = (s) => s.auth
export const selectIsAuthenticated = (s) => s.auth.isAuthenticated
export const selectUser            = (s) => ({ userId: s.auth.userId, email: s.auth.email, fullName: s.auth.fullName })
export const selectTenantId        = (s) => s.auth.tenantId
export const selectRoles           = (s) => s.auth.roles
export const selectVendorId        = (s) => s.auth.vendorId
export const selectPermissions     = (s) => s.auth.permissions
export const selectRoleSides = createSelector(
  (s) => s.auth.roles,
  (roles) => [...new Set(roles.map(r => r.side).filter(Boolean))]
)