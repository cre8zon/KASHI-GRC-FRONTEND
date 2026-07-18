import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationEmailRulesApi } from '../api/notificationEmailRules.api'
import toast from 'react-hot-toast'

export const useNotificationEmailRules = (params) => useQuery({
  queryKey: ['notification-email-rules', params],
  queryFn:  () => notificationEmailRulesApi.list(params),
})

export const useCreateNotificationEmailRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationEmailRulesApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notification-email-rules'] }); toast.success('Rule created') },
    onError:   (e) => toast.error(e?.message || 'Could not create rule'),
  })
}

export const useUpdateNotificationEmailRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => notificationEmailRulesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notification-email-rules'] }); toast.success('Rule updated') },
    onError:   (e) => toast.error(e?.message || 'Could not update rule'),
  })
}

export const useDeleteNotificationEmailRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationEmailRulesApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notification-email-rules'] }); toast.success('Rule deleted') },
    onError:   (e) => toast.error(e?.message || 'Could not delete rule'),
  })
}
