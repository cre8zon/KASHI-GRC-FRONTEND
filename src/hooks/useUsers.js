import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '../api/users.api'
import { QUERY_KEYS } from '../config/constants'
import toast from 'react-hot-toast'

export const useUserList   = (filters) => useQuery({
  queryKey: [...QUERY_KEYS.USERS, filters],
  queryFn:  () => usersApi.list(filters),
})
export const useUser       = (id) => useQuery({
  queryKey: [...QUERY_KEYS.USERS, id],
  queryFn:  () => usersApi.getById(id),
  enabled: !!id,
})
export const useCreateUser = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: QUERY_KEYS.USERS }); toast.success('User created') },
  })
}
export const useUpdateUser = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => usersApi.update(id, data),
    onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: [...QUERY_KEYS.USERS, id] }); toast.success('User updated') },
  })
}
export const useSuspendUser = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: usersApi.suspend,
    onSuccess: () => { qc.invalidateQueries({ queryKey: QUERY_KEYS.USERS }); toast.success('User suspended') },
  })
}
