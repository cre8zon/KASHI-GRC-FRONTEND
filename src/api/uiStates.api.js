import api from '../config/axios.config'

export const uiStatesApi = {
  forScreen: (screenKey) => api.get(`/v1/ui-config/states/${screenKey}`),
  list:      (params)    => api.get('/v1/admin/ui/states', { params }),
  create:    (data)      => api.post('/v1/admin/ui/states', data),
  update:    (id, data)  => api.put(`/v1/admin/ui/states/${id}`, data),
  delete:    (id)        => api.delete(`/v1/admin/ui/states/${id}`),
}
