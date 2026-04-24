import { useQuery } from '@tanstack/react-query'
import { useDispatch } from 'react-redux'
import { uiConfigApi } from '../api/uiConfig.api'
import { setBootstrap } from '../store/slices/uiConfigSlice'
import { QUERY_KEYS } from '../config/constants'

export const useBootstrap = () => {
  const dispatch = useDispatch()
  return useQuery({
    queryKey: QUERY_KEYS.BOOTSTRAP,
    queryFn: async () => {
      const data = await uiConfigApi.bootstrap()
      dispatch(setBootstrap(data))
      return data
    },
    staleTime: 30 * 60 * 1000,  // 30 min — branding/nav rarely changes
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
