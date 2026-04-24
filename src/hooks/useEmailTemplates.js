import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { emailTemplatesApi } from '../api/emailTemplates.api'
import toast from 'react-hot-toast'

export const useEmailTemplates = (params) => useQuery({
  queryKey: ['email-templates', params],
  queryFn:  () => emailTemplatesApi.list(params),
})

export const useEmailTemplate = (id) => useQuery({
  queryKey: ['email-templates', id],
  queryFn:  () => emailTemplatesApi.getById(id),
  enabled:  !!id,
})

export const useEmailTemplateByName = (name) => useQuery({
  queryKey: ['email-templates', 'name', name],
  queryFn:  () => emailTemplatesApi.getByName(name),
  enabled:  !!name,
})

export const useCreateEmailTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: emailTemplatesApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-templates'] }); toast.success('Template created') },
  })
}

export const useUpdateEmailTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => emailTemplatesApi.update(id, data),
    onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: ['email-templates', id] }); toast.success('Template saved') },
  })
}

export const useDeleteEmailTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: emailTemplatesApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-templates'] }); toast.success('Template deleted') },
  })
}

export const usePreviewTemplate = () => useMutation({
  mutationFn: ({ id, variables }) => emailTemplatesApi.preview(id, variables),
})

export const useUiStates = (screenKey) => useQuery({
  queryKey: ['ui-states', screenKey],
  queryFn:  () => uiStatesApi ? uiStatesApi.forScreen(screenKey) : null,
  enabled:  !!screenKey,
  staleTime: 10 * 60 * 1000,
})
