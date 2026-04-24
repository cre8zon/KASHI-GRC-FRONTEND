import axios from 'axios'
import { store } from '../store'
import { logout } from '../store/slices/authSlice'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const { auth } = store.getState()
  if (auth.token) config.headers['Authorization'] = `Bearer ${auth.token}`
  if (auth.tenantId) config.headers['X-Tenant-ID'] = auth.tenantId
  return config
}, (error) => Promise.reject(error))

api.interceptors.response.use(
  (response) => response.data?.data ?? response.data,
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
