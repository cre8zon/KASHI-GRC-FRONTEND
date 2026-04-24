import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { vendorsApi } from '../api/vendors.api'
import { QUERY_KEYS } from '../config/constants'
import toast from 'react-hot-toast'

export const useVendorList   = (filters) => useQuery({
  queryKey: [...QUERY_KEYS.VENDORS, filters],
  queryFn:  () => vendorsApi.list(filters),
})
export const useVendor       = (id) => useQuery({
  queryKey: [...QUERY_KEYS.VENDORS, id],
  queryFn:  () => vendorsApi.getById(id),
  enabled: !!id,
})
export const useOnboardVendor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: vendorsApi.onboard,
    onSuccess: () => { qc.invalidateQueries({ queryKey: QUERY_KEYS.VENDORS }); toast.success('Vendor onboarded') },
  })
}
