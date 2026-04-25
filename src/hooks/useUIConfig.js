import { useQuery } from '@tanstack/react-query'
import { useDispatch } from 'react-redux'
import { uiConfigApi } from '../api/uiConfig.api'
import { setBootstrap } from '../store/slices/uiConfigSlice'
import { updateContext } from '../store/slices/authSlice'
import { QUERY_KEYS } from '../config/constants'

export const useBootstrap = () => {
  const dispatch = useDispatch()
  return useQuery({
    queryKey: QUERY_KEYS.BOOTSTRAP,
    queryFn: async () => {
      const data = await uiConfigApi.bootstrap()
      dispatch(setBootstrap(data))
      if (data.tenantName || data.vendorName) {
        dispatch(updateContext({
          tenantName: data.tenantName || null,
          vendorName: data.vendorName || null,
        }))
      }

      // Directly fetch user preferences from DB on every app load
      // This is separate from bootstrap so it works even if UiConfigServiceImpl
      // doesn't return userPreferences yet
      try {
        const { usersApi } = await import('../api/users.api')
        const prefs = await usersApi.preferences.get()
        //
        if (prefs) {
          const appTheme     = prefs['ui_app_theme']
          const sidebarTheme = prefs['ui_sidebar_theme']
          const sidebarColor = prefs['ui_sidebar_color']
          if (appTheme) {
            localStorage.setItem('kashi_theme', appTheme)
            document.documentElement.setAttribute('data-theme', appTheme)
          }
          if (sidebarTheme) {
            localStorage.setItem('kashi_sidebar_theme', sidebarTheme)
          }
          if (sidebarColor) {
            localStorage.setItem('kashi_sidebar_color', sidebarColor)
            // Apply user's personal brand color to entire app
            const { applyBranding } = await import('../store/slices/uiConfigSlice')
            applyBranding({ ...data.branding, primaryColor: sidebarColor })
          }
          if (sidebarTheme) {
            window.dispatchEvent(new CustomEvent('kashi-sidebar-changed'))
          }
        }
      } catch (e) {
        //
      }

      return data
    },
    staleTime: 60 * 1000,
    gcTime:    60 * 60 * 1000,
  })
}

export const useNavigation = () => useQuery({
  queryKey: QUERY_KEYS.NAVIGATION,
  queryFn:  uiConfigApi.navigation,
  staleTime: 10 * 60 * 1000,
  //staleTime: 0, // force fresh fetch — revert after confirming fix
})

export const useScreenConfig = (screenKey) => useQuery({
  queryKey: QUERY_KEYS.SCREEN(screenKey),
  queryFn:  () => uiConfigApi.screenConfig(screenKey),
  staleTime: 10 * 60 * 1000,
  enabled:  !!screenKey,
})

export const useFormConfig = (formKey) => useQuery({
  queryKey: QUERY_KEYS.FORM(formKey),
  queryFn:  () => uiConfigApi.form(formKey),
  staleTime: 10 * 60 * 1000,
  enabled:  !!formKey,
})

export const useScreenActions = (screenKey, entityStatus) => useQuery({
  queryKey: QUERY_KEYS.ACTIONS(screenKey, entityStatus),
  queryFn:  () => uiConfigApi.actions(screenKey, entityStatus),
  staleTime: 5 * 60 * 1000,
  enabled:  !!screenKey,
})

export const useDashboardWidgets = () => useQuery({
  queryKey: QUERY_KEYS.DASHBOARD,
  queryFn:  uiConfigApi.dashboard,
  staleTime: 5 * 60 * 1000,
})