import { useMutation } from '@tanstack/react-query'
import { useDispatch, useSelector } from 'react-redux'
import { authApi } from '../api/auth.api'
import { loginSuccess, tenantSwitched, selectAuth } from '../store/slices/authSlice'
import { queryClient } from '../config/queryClient'
import { store } from '../store'
import { claimTabs } from '../store/slices/tabsSlice'
import { endSession, setPostLoginTarget } from '../lib/session'
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
      // A deliberate switch puts this organisation's tabs aside and brings
      // back the new one's (or a clean Dashboard) — done before the auth
      // change, so the store does not carry the current page's tab across.
      if (!silent) {
        const userId = store.getState().auth.userId
        const tenantId = payload.user?.tenantId
        if (userId != null && tenantId != null) dispatch(claimTabs({ userId, tenantId }))
      }
      dispatch(tenantSwitched(payload))
      if (silent) return   // caller is already on the right route
      toast.success(`Switched to ${payload.user?.tenantName || 'organization'}`)
      const { tabs, activeTabId } = store.getState().tabs
      const back = tabs.find(t => t.id === activeTabId)?.route
      navigate(back && back.startsWith('/') ? back : '/dashboard', { replace: true })
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
 * Normalises a raw-axios failure into the same shape the app's interceptor
 * produces ({ code, message, status, fieldErrors, details }), so pages can use
 * parseApiError() on it.
 */
function normaliseAuthError(err) {
  const body = err?.response?.data
  const apiError = body?.error
  const status = err?.response?.status ?? null
  if (apiError) return { ...apiError, status }
  if (!err?.response) {
    return { code: 'NETWORK_ERROR', status: null,
             message: "Can't reach the server. Check your connection and try again." }
  }
  return { code: 'HTTP_' + status, status, message: 'Sign-in failed. Please try again.' }
}

/**
 * useLoginWithRedirect — handles all login outcomes:
 *   SUCCESS                 → back to where the user was (or /dashboard)
 *   PASSWORD_RESET_REQUIRED → /auth/set-password with the one-time token
 *   ERROR                   → returned to the page as a normalised error
 *                             (shown inline next to the form, not as a toast)
 *
 * The old version also console.log'ed the full login response — access and
 * refresh tokens included — on every sign-in. Removed.
 */
export const useLoginWithRedirect = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async ({ email, password, rememberMe }) => {
      // Bypass the app instance: we need the top-level `status` field
      // (SUCCESS vs PASSWORD_RESET_REQUIRED), which its interceptor unwraps.
      const { default: axios } = await import('axios')
      const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
      try {
        const response = await axios.post(`${baseURL}/v1/auth/login`,
          { email: email.trim(), password, rememberMe: !!rememberMe }, { timeout: 30_000 })
        return response.data  // { status, data }
      } catch (err) {
        throw normaliseAuthError(err)
      }
    },
    onSuccess: (response, variables) => {
      if (response.status === 'PASSWORD_RESET_REQUIRED') {
        navigate('/auth/set-password', {
          state: {
            userId:    response.data?.userId,
            tempToken: response.data?.tempToken,
            email:     variables?.email?.trim(),
            rememberMe: !!variables?.rememberMe,
          },
          replace: true,
        })
        return
      }
      if (response.status === 'SUCCESS') {
        queryClient.clear()   // never render a previous user's cached data
        const target = variables?.redirectTo
        // RedirectIfAuthed (wrapping the login route) reacts to the store flip
        // too; the post-login target makes it agree with this navigate().
        setPostLoginTarget(target)
        navigate(target && target.startsWith('/') && !target.startsWith('/auth') ? target : '/dashboard',
                 { replace: true })
        dispatch(loginSuccess({ ...response.data, rememberMe: !!variables?.rememberMe }))
      }
    },
    // Shown inline by LoginPage; overrides the global "toast every mutation
    // error" default so the message doesn't appear twice.
    onError: () => {},
  })
}

export const useLogout = () => {
  return useMutation({
    // endSession revokes the refresh token on the server, clears the store and
    // the query cache, tells other open tabs to sign out too, and leaves a
    // "you've signed out" note for the login page.
    mutationFn: async () => { endSession('signed_out') },
  })
}