import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '../api/notifications.api'
import { QUERY_KEYS } from '../config/constants'

export const useNotifications = (params) => useQuery({
  queryKey: [...QUERY_KEYS.NOTIFICATIONS, params],
  queryFn:  () => notificationsApi.list(params),
  refetchInterval: 90 * 1000,
})

export const useMarkRead = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS }),
  })
}
