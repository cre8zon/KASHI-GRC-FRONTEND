import api from '../../config/axios.config'

const sdApi = {
  listScreens: ()       => api.get('/v1/admin/ui/screens'),          // virtual endpoint — derives from 3 tables
  listComponents:(k)    => api.get('/v1/admin/ui/components', { params: { screen: k, take: 200 } }),
  createComponent:(d)   => api.post('/v1/admin/ui/components', d),
  updateComponent:(i,d) => api.put(`/v1/admin/ui/components/${i}`, d),
  deleteComponent:(i)   => api.delete(`/v1/admin/ui/components/${i}`),
  listOptions:   (cid)  => api.get(`/v1/admin/ui/options/${cid}`),
  addOption:     (d)    => api.post('/v1/admin/ui/options', d),
  deleteOption:  (i)    => api.delete(`/v1/admin/ui/options/${i}`),
  listActions:   (k)    => api.get('/v1/admin/ui/actions', { params: { screen: k, take: 200 } }),
  createAction:  (d)    => api.post('/v1/admin/ui/actions', d),
  updateAction:  (i,d)  => api.put(`/v1/admin/ui/actions/${i}`, d),
  deleteAction:  (i)    => api.delete(`/v1/admin/ui/actions/${i}`),
  getLayout:     (k)    => api.get('/v1/admin/ui/layouts', { params: { screen: k, take: 1 } }),
  saveLayout:    (id,d) => id ? api.put(`/v1/admin/ui/layouts/${id}`, d) : api.post('/v1/admin/ui/layouts', d),
  resolveScreen: (k)    => api.get(`/v1/ui-config/screen/${k}`),
  listWorkflows: ()     => api.get('/v1/workflows', { params: { take: 100 } }),
  // ── Forms (for FORM screen type) ───────────────────────────────────────────
  getForm:       (k)    => api.get('/v1/admin/ui/forms', { params: { formKey: k, take: 1 } }),
  createForm:    (d)    => api.post('/v1/admin/ui/forms', d),
  updateForm:    (i,d)  => api.put(`/v1/admin/ui/forms/${i}`, d),
  listFields:    (fid)  => api.get(`/v1/admin/ui/form-fields/${fid}`),
  createField:   (d)    => api.post('/v1/admin/ui/form-fields', d),
  updateField:   (i,d)  => api.put(`/v1/admin/ui/form-fields/${i}`, d),
  deleteField:   (i)    => api.delete(`/v1/admin/ui/form-fields/${i}`),
  // ── Roles (for role visibility) ─────────────────────────────────────────────
  listRoles:     (tid)  => api.get(`/v1/tenants/${tid}/roles/hierarchy`),
}


export { sdApi }
