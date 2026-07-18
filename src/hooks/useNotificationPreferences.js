import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationPreferencesApi } from '../api/notificationPreferences.api'
import toast from 'react-hot-toast'

const KEY = ['my-notification-preferences']

export const useMyNotificationPreferences = () => useQuery({
  queryKey: KEY,
  queryFn:  () => notificationPreferencesApi.list(),
})

/**
 * Optimistic upsert — the toggle flips instantly; on failure it rolls back.
 * Preference toggles are the classic case for optimism: high frequency,
 * low stakes, and the backend is fail-open anyway.
 */
export const useUpsertNotificationPreference = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationPreferencesApi.upsert,
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: KEY })
      const prev = qc.getQueryData(KEY)
      qc.setQueryData(KEY, (old) => {
        const rows = Array.isArray(old) ? [...old] : []
        const i = rows.findIndex(r => r.eventKey === next.eventKey)
        if (i >= 0) rows[i] = { ...rows[i], ...next }
        else rows.push({ ...next })
        return rows
      })
      return { prev }
    },
    onError: (e, _next, ctx) => {
      qc.setQueryData(KEY, ctx?.prev)
      toast.error(e?.message || 'Could not save preference')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useResetNotificationPreference = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationPreferencesApi.reset,
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Reset to default') },
    onError:   (e) => toast.error(e?.message || 'Could not reset'),
  })
}
