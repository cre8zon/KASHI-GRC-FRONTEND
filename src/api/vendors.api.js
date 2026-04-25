import api from '../config/axios.config'

export const vendorsApi = {
  list:      (params)   => api.get('/v1/vendors', { params }),
  getById:   (id)       => api.get(`/v1/vendors/${id}`),
  update:    (id, data) => api.put(`/v1/vendors/${id}`, data),
  riskScore: (id)       => api.post(`/v1/vendors/${id}/calculate-risk`),

  /**
   * Onboard a new vendor.
   * Payload includes primaryContact (becomes VENDOR_VRM, gets welcome email).
   * Backend: creates Vendor, calculates risk, starts workflow instance, sends invite.
   */
  onboard: (data) => api.post('/v1/vendors/onboard', data),
  activate: (id) => api.patch(`/v1/vendors/${id}/activate`),
  restartWorkflow: (vendorId, workflowId) =>
  // Workflow start involves DB writes, role resolution, auto-step execution,
  // and assessment snapshotting — can take 10-30s on a remote DB (Aiven).
  // Use a 90s timeout so a successful-but-slow call isn't mistaken for a failure.
  api.post(`/v1/vendors/${vendorId}/restart-workflow`, null, {
    params: { workflowId },
    timeout: 90000,
  }),
  assessments: (vendorId) => api.get(`/v1/vendors/${vendorId}/assessments`),

  contracts: {
    list:   (vendorId)       => api.get(`/v1/vendors/${vendorId}/contracts`),
    create: (vendorId, data) => api.post(`/v1/vendors/${vendorId}/contracts`, data),
    update: (vendorId, contractId, data) => api.put(`/v1/vendors/${vendorId}/contracts/${contractId}`, data),
  },

  documents: {
    list: (vendorId)       => api.get(`/v1/vendors/${vendorId}/documents`),
    link: (vendorId, data) => api.post(`/v1/vendors/${vendorId}/documents`, data),
  },

  tiers: {
    list:   (params)      => api.get('/v1/vendor-tiers', { params }),
    create: (data)        => api.post('/v1/vendor-tiers', data),
    update: (id, data)    => api.put(`/v1/vendor-tiers/${id}`, data),
  },

  // Eligible users for next workflow step (org resolves vendor-side users)
  nextStepEligibleUsers: (instanceId) =>
    api.get(`/v1/workflows/instances/${instanceId}/next-step-eligible-users`),
}