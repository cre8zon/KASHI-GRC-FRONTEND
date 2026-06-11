import api from '../config/axios.config'

/**
 * Integration API client — /v1/integrations
 *
 * Three-layer pattern:
 *   IntegrationCheckConfig (global library, tenant_id=NULL)
 *     → TenantIntegrationCheck (tenant-owned instance, snapshotted on connect)
 *       → EngagementIntegrationSnapshot (engagement-scoped, snapshotted at creation)
 *
 * catalog()  — global library, read-only for tenants
 * connected() — tenant's IntegrationConfig rows (auth + connected status)
 * connect()   — saves auth + snapshots TenantIntegrationCheck rows from global library
 * checks.*   — CRUD on TenantIntegrationCheck rows
 * snapshots.* — EngagementIntegrationSnapshot rows per engagement
 */
export const integrationApi = {

  // ── Catalog (global library) ────────────────────────────────────────────────
  catalog: () =>
    api.get('/v1/integrations/catalog'),

  // ── Tenant connected integrations ───────────────────────────────────────────
  connected: () =>
    api.get('/v1/integrations/connected'),

  connect: (integrationKey, body) =>
    api.post(`/v1/integrations/${integrationKey}/connect`, body),

  disconnect: (integrationKey) =>
    api.delete(`/v1/integrations/${integrationKey}`),

  // ── Tenant check instances (TenantIntegrationCheck) ────────────────────────
  checks: {
    /** List all TenantIntegrationCheck instances for this integration */
    list: (integrationKey) =>
      api.get(`/v1/integrations/${integrationKey}/checks`),

    /** Override checkConfigJson, passCriteriaJson, runFrequency, displayName */
    customise: (integrationKey, checkKey, body) =>
      api.put(`/v1/integrations/${integrationKey}/checks/${checkKey}`, body),

    /** Manually trigger a check run now */
    run: (integrationKey, checkKey) =>
      api.post(`/v1/integrations/${integrationKey}/checks/${checkKey}/run`),
  },

  // ── Run history (IntegrationRun) ────────────────────────────────────────────
  runs: {
    list: (params) =>
      api.get('/v1/integrations/runs', { params }),

    get: (id) =>
      api.get(`/v1/integrations/runs/${id}`),
  },

  // ── Engagement integration snapshots ────────────────────────────────────────
  snapshots: {
    /** GET /v1/audit/engagements/{engagementId}/integration-snapshots */
    listForEngagement: (engagementId) =>
      api.get(`/v1/audit/engagements/${engagementId}/integration-snapshots`),
  },
}