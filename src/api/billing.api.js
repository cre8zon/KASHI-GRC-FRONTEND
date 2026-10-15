import api from '../config/axios.config'

/**
 * Billing — platform side. Everything lives under /v1/admin/billing, which the
 * backend locks to SIDE_SYSTEM at the filter layer.
 *
 * Money is ALWAYS minor units (paise / cents) plus an ISO currency. Convert at
 * the edge with lib/money.js — never send rupees as a decimal.
 */
const B = '/v1/admin/billing'

export const billingApi = {
  // Catalogue
  config:        ()           => api.get(`${B}/config`),
  plans:         ()           => api.get(`${B}/plans`),
  createPlan:    (data)       => api.post(`${B}/plans`, data),
  updatePlan:    (id, data)   => api.put(`${B}/plans/${id}`, data),
  setPlanFeature:(id, featureKey, included) => api.put(`${B}/plans/${id}/features/${encodeURIComponent(featureKey)}`, { included }),

  // Feature catalogue — buyer-facing labels for the public comparison table
  features:      ()           => api.get(`${B}/features`),
  createFeature: (data)       => api.post(`${B}/features`, data),
  updateFeature: (id, data)   => api.put(`${B}/features/${id}`, data),
  deleteFeature: (id)         => api.delete(`${B}/features/${id}`),

  // Exactly what www.kashiguard.com/pricing receives (public, no auth needed)
  publicPricing: (currency)   => api.get('/v1/billing/public/plans', { params: { currency } }),

  // Subscriptions
  subscriptions:        (params)          => api.get(`${B}/subscriptions`, { params }),
  subscription:         (id)              => api.get(`${B}/subscriptions/${id}`),
  tenantSubscriptions:  (tenantId)        => api.get(`${B}/tenants/${tenantId}/subscriptions`),
  createSubscription:   (tenantId, data)  => api.post(`${B}/tenants/${tenantId}/subscriptions`, data),
  renew:                (id, data)        => api.post(`${B}/subscriptions/${id}/renew`, data || {}),
  changePlan:           (id, data)        => api.post(`${B}/subscriptions/${id}/change-plan`, data),
  cancel:               (id, data)        => api.post(`${B}/subscriptions/${id}/cancel`, data),
  patchSubscription:    (id, data)        => api.patch(`${B}/subscriptions/${id}`, data),
  applyEntitlements:    (id, mode)        => api.post(`${B}/subscriptions/${id}/apply-entitlements`, { mode }),
  runSweep:             ()                => api.post(`${B}/maintenance/sweep`),

  // Invoices
  invoices:             (params)          => api.get(`${B}/invoices`, { params }),
  invoice:              (id)              => api.get(`${B}/invoices/${id}`),
  invoicePdf:           (id)              => api.get(`${B}/invoices/${id}/pdf`, { responseType: 'blob' }),
  draftFromSubscription:(subId, data)     => api.post(`${B}/subscriptions/${subId}/invoices`, data || {}),
  draftManual:          (tenantId, data)  => api.post(`${B}/tenants/${tenantId}/invoices`, data),
  updateInvoice:        (id, data)        => api.put(`${B}/invoices/${id}`, data),
  deleteInvoice:        (id)              => api.delete(`${B}/invoices/${id}`),
  issueInvoice:         (id, data)        => api.post(`${B}/invoices/${id}/issue`, data || {}),
  markPaid:             (id, data)        => api.post(`${B}/invoices/${id}/mark-paid`, data || {}),
  voidInvoice:          (id, reason)      => api.post(`${B}/invoices/${id}/void`, { reason }),

  // Metrics
  overview:             ()                => api.get(`${B}/metrics/overview`),
  snapshotMonths:       ()                => api.get(`${B}/snapshots`),
  snapshotRows:         (month)           => api.get(`${B}/snapshots`, { params: { month } }),
  runSnapshot:          (month)           => api.post(`${B}/snapshots/run`, { month }),

  // Acquisition spend
  costs:                ()                => api.get(`${B}/acquisition-costs`),
  addCost:              (data)            => api.post(`${B}/acquisition-costs`, data),
  updateCost:           (id, data)        => api.put(`${B}/acquisition-costs/${id}`, data),
  deleteCost:           (id)              => api.delete(`${B}/acquisition-costs/${id}`),
}
