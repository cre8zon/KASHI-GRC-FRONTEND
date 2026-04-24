import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tenantsApi } from '../api/tenants.api'
import { usersApi } from '../api/users.api'
import toast from 'react-hot-toast'

export const useTenantList = (params) => useQuery({
  queryKey: ['tenants', params],
  queryFn:  () => tenantsApi.list(params),
})

export const useTenant = (id) => useQuery({
  queryKey: ['tenants', id],
  queryFn:  () => tenantsApi.getById(id),
  enabled:  !!id,
})

export const useCreateTenant = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tenantsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  })
}

export const useUpdateTenant = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => tenantsApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['tenants', id] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
      toast.success('Tenant updated')
    },
  })
}

export const useCreateOrgAdmin = () => useMutation({
  mutationFn: (data) => usersApi.create(data),
})