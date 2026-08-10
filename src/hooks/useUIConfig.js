import { useQuery } from '@tanstack/react-query'
import { useDispatch, useSelector } from 'react-redux'
import { selectUser } from '../store/slices/authSlice'
import { uiConfigApi } from '../api/uiConfig.api'
import { setBootstrap } from '../store/slices/uiConfigSlice'
import { updateContext } from '../store/slices/authSlice'
import { QUERY_KEYS } from '../config/constants'

export const useBootstrap = () => {
  const dispatch = useDispatch()
  const { userId } = useSelector(selectUser) || {}
  return useQuery({
    queryKey: [...QUERY_KEYS.BOOTSTRAP, userId || 'anon'],
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
        // One-time v3 theme reset. The index.html migration cleared this
        // browser, but the DB still holds pre-v3 prefs and bootstrap would
        // restore them. Push the new defaults up once, then behave normally
        // forever after. Delete this block once every user has loaded once.
        const resetPending = (() => {
          try { return localStorage.getItem('kashi_theme_reset_pending') === '1' } catch { return false }
        })()
        if (resetPending) {
          try {
            const { BRAND_PRESETS } = await import('../config/brandPresets')
            await usersApi.preferences.save({
              ui_app_theme:     'light',
              ui_sidebar_theme: 'light',
              ui_sidebar_color: BRAND_PRESETS[0].hex, // pastel Sage — single source of truth
            })
          } catch (err) {
            //
          }
          try {
            localStorage.setItem('kashi_theme', 'light')
            localStorage.setItem('kashi_sidebar_theme', 'light')
            localStorage.removeItem('kashi_theme_reset_pending')
          } catch (err) {
            //
          }
          document.documentElement.setAttribute('data-theme', 'light')
          window.dispatchEvent(new CustomEvent('kashi-sidebar-changed'))
          return data
        }
        if (prefs) {
          const appTheme     = prefs['ui_app_theme']
          const sidebarTheme = prefs['ui_sidebar_theme']
          const sidebarColor = prefs['ui_sidebar_color']
          if (appTheme) {
            localStorage.setItem('kashi_theme', appTheme)
            document.documentElement.setAttribute('data-theme', appTheme)
            // Notify ThemeProvider so its React state (and the ThemeSwitcher UI)
            // reflects the server value on a fresh device, not just the DOM.
            window.dispatchEvent(new CustomEvent('kashi-theme-synced',
              { detail: { appTheme, sidebarTheme } }))
          } else {
            // New user — no saved preference. Apply the platform default (light).
            // Only set if nothing already in localStorage (don't override a user
            // who cleared their DB prefs but still has a localStorage value).
            if (!localStorage.getItem('kashi_theme')) {
              localStorage.setItem('kashi_theme', 'light')
              document.documentElement.setAttribute('data-theme', 'light')
            }
          }
          if (sidebarTheme) {
            localStorage.setItem('kashi_sidebar_theme', sidebarTheme)
          } else {
            // New user — default sidebar to brand.
            if (!localStorage.getItem('kashi_sidebar_theme')) {
              localStorage.setItem('kashi_sidebar_theme', 'brand')
            }
          }
          // Precedence: an explicitly chosen pastel preset always beats the
          // server-side brand colour. Without this the API response repaints
          // --color-brand-* a few hundred ms after boot and stomps the preset.
          // On BOOT the DB is the source of truth: if the user saved a sidebar
          // colour it IS their choice, so apply it. The old guard skipped it
          // whenever kashi_brand_preset existed (always true after picking a
          // preset once), so every refresh ignored the saved colour.
          if (sidebarColor) {
            localStorage.setItem('kashi_sidebar_color', sidebarColor)
            const { applyBranding } = await import('../store/slices/uiConfigSlice')
            applyBranding({ ...data.branding, primaryColor: sidebarColor }, { force: true })
          }
          if (sidebarTheme || !localStorage.getItem('kashi_sidebar_theme')) {
            window.dispatchEvent(new CustomEvent('kashi-sidebar-changed'))
          }
        }
      } catch (e) {
        // Server unreachable: fall back to the cached colour so a down/slow
        // backend doesn't drop the user back to the sage default.
        try {
          const cachedColor = localStorage.getItem('kashi_sidebar_color')
          if (cachedColor) {
            const { applyBranding } = await import('../store/slices/uiConfigSlice')
            applyBranding({ primaryColor: cachedColor }, { force: true })
            window.dispatchEvent(new CustomEvent('kashi-sidebar-changed'))
          }
        } catch (_) { /* */ }
      }

      return data
    },
    staleTime: 60 * 1000,
    gcTime:    60 * 60 * 1000,
  })
}

export const useNavigation = () => {
  const { userId } = useSelector(selectUser) || {}
  return useQuery({
    queryKey: [...QUERY_KEYS.NAVIGATION, userId || 'anon'],
    queryFn:  uiConfigApi.navigation,
    staleTime: 0,
    retry: 1,
    enabled: !!userId,
  })
}

export const useScreenConfig = (screenKey) => useQuery({
  queryKey: QUERY_KEYS.SCREEN(screenKey),
  queryFn:  () => uiConfigApi.screenConfig(screenKey),
  staleTime: 10 * 60 * 1000,
  enabled:  !!screenKey,
})

export const useFormConfig = (formKey) => useQuery({
  queryKey: QUERY_KEYS.FORM(formKey),
  queryFn:  () => uiConfigApi.form(formKey),
  staleTime: 5 * 60 * 1000,  // 5 min — form definitions change only on admin deploy, not per request
  gcTime:    10 * 60 * 1000, // keep in memory 10 min after last use
  enabled:  !!formKey,
})

export const useScreenActions = (screenKey, entityStatus) => useQuery({
  queryKey: QUERY_KEYS.ACTIONS(screenKey, entityStatus),
  queryFn:  () => uiConfigApi.actions(screenKey, entityStatus),
  staleTime: 5 * 60 * 1000,
  enabled:  !!screenKey,
})

export const useDashboardWidgets = () => {
  const { userId } = useSelector(selectUser) || {}
  return useQuery({
    queryKey: [...QUERY_KEYS.DASHBOARD, userId || 'anon'],
    queryFn:  uiConfigApi.dashboard,
    staleTime: 5 * 60 * 1000,
    enabled: !!userId,  // don't fetch until user is known
  })
}