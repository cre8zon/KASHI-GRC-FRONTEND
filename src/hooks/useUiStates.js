import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { uiStatesApi } from '../api/uiStates.api'
import toast from 'react-hot-toast'

export const useScreenStates = (screenKey) => useQuery({
  queryKey: ['ui-states', screenKey],
  queryFn:  () => uiStatesApi.forScreen(screenKey),
  enabled:  !!screenKey,
  staleTime: 10 * 60 * 1000,
})

export const useCreateUiState = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: uiStatesApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ui-states'] }); toast.success('State created') },
  })
}

export const useUpdateUiState = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => uiStatesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ui-states'] }); toast.success('State updated') },
  })
}

export const useDeleteUiState = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: uiStatesApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ui-states'] }); toast.success('State deleted') },
  })
}
