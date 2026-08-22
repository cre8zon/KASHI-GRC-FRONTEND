import { useMutation } from '@tanstack/react-query'
import { useDispatch, useSelector } from 'react-redux'
import { authApi } from '../api/auth.api'
import { loginSuccess, logout, tenantSwitched, selectAuth } from '../store/slices/authSlice'
import { queryClient } from '../config/queryClient'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

export const useAuth = () => useSelector(selectAuth)

/**
 * useSwitchTenant — moves the session into another tenant this identity belongs to.
 *
 * ISOLATION NOTE
 *   Nothing here relaxes tenant scoping. The server re-issues a token naming
 *   exactly one tenant, re-checks the membership is active and unexpired, and
 *   resolves roles for that membership alone. Every query afterwards runs
 *   through the same tenant filter as before — it just filters to a different
 *   tenant.
 *
 *   queryClient.clear() is load-bearing, not tidiness: React Query caches are
 *   keyed by query name, not by tenant, so without it the first render after a
 *   switch would serve the previous tenant's rows straight from cache. That is
 *   a visible cross-tenant leak with no server involvement at all.
 */
/**
 * @param opts.silent  suppress the toast and the /dashboard redirect. Used by
 *                     TenantSync, which switches on the user's behalf while they
 *                     are already standing on the page they asked for — bouncing
 *                     them to the dashboard would undo the navigation that
 *                     triggered the switch in the first place.
 */
export const useSwitchTenant = (opts = {}) => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { silent = false } = opts

  return useMutation({
    mutationFn: (tenantId) => authApi.switchTenant(tenantId),
    onSuccess: (data) => {
      const payload = data?.data || data
      if (!payload?.session?.token) {
        toast.error('Switch failed — no session returned')
        return
      }
      // Drop the outgoing tenant's cache BEFORE the new state lands, so nothing
      // can render against a mismatched token.
      queryClient.clear()
      dispatch(tenantSwitched(payload))
      if (silent) return   // caller is already on the right route
      toast.success(`Switched to ${payload.user?.tenantName || 'organization'}`)
      navigate('/dashboard', { replace: true })
    },
    onError: (err) => {
      const msg = err?.response?.data?.error?.message || err?.message || 'Could not switch organization'
      toast.error(msg)
    },
  })
}

export const useLogin = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: ({ email, password }) => authApi.login(email, password),
    onSuccess: (data, variables, context) => {
      // Backend may return status: 'PASSWORD_RESET_REQUIRED' on first login
      // The Axios interceptor unwraps data.data so we get the raw ApiResponse here
      // Actually our interceptor returns response.data.data — so data is the inner payload
      // Check if the raw response had PASSWORD_RESET_REQUIRED status
    },
    onError: (err) => toast.error(err?.message || 'Login failed'),
  })
}

/**
 * useLoginWithRedirect — handles all login outcomes:
 *   SUCCESS              → navigate to /dashboard
 *   PASSWORD_RESET_REQUIRED → navigate to /auth/reset-password with userId
 *   ERROR                → toast error
 */
export const useLoginWithRedirect = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async ({ email, password }) => {
      // Bypass the Axios response interceptor's unwrapping for this call
      // so we can read the top-level status field
      const { default: axios } = await import('axios')
      const baseURL = import.meta.env.VITE_API_BASE_URL || ''
      const response = await axios.post(`${baseURL}/v1/auth/login`, { email, password })
      return response.data  // returns full { status, data }
    },
    onSuccess: (response, variables) => {
      console.log('LOGIN RESPONSE:', JSON.stringify(response, null, 2))
      if (response.status === 'PASSWORD_RESET_REQUIRED') {
        // First login — force password change.
        // Pass email in state so ForcePasswordChangePage can auto-login after reset.
        navigate('/auth/set-password', {
          state: {
            userId:    response.data?.userId,
            tempToken: response.data?.tempToken,
            email:     variables?.email,
          },
          replace: true,
        })
        return
      }
      if (response.status === 'SUCCESS') {
        dispatch(loginSuccess(response.data))
        toast.success('Welcome back!')
        navigate('/dashboard', { replace: true })
      }
    },
    onError: (err) => {
      const msg = err?.response?.data?.error?.message || err?.message || 'Login failed'
      toast.error(msg)
    },
  })
}

export const useLogout = () => {
  const dispatch = useDispatch()
  const { userId } = useSelector(selectAuth)
  return useMutation({
    mutationFn: () => authApi.logout(userId),
    onSettled: () => {
      dispatch(logout())
      queryClient.clear()
    },
  })
}