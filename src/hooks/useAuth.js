import { useMutation } from '@tanstack/react-query'
import { useDispatch, useSelector } from 'react-redux'
import { authApi } from '../api/auth.api'
import { loginSuccess, logout, selectAuth } from '../store/slices/authSlice'
import { queryClient } from '../config/queryClient'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

export const useAuth = () => useSelector(selectAuth)

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
    onSuccess: (response) => {
      console.log('LOGIN RESPONSE:', JSON.stringify(response, null, 2))
      if (response.status === 'PASSWORD_RESET_REQUIRED') {
        // First login — force password change
        navigate('/auth/reset-password', {
          state: { userId: response.data?.userId, tempToken: response.data?.tempToken, },
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
