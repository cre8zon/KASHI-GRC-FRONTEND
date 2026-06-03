/**
 * auditTestsApi.js — API client for Audit Tests and Policies.
 *
 * NEW FILE — does not modify audit.api.js.
 * Import alongside auditApi in components that need tests/policies.
 *
 * All routes follow the same pattern as auditApi:
 *   - Library (admin): /v1/audit/library/tests, /v1/audit/library/policies
 *   - Runtime (engagement): /v1/audit/engagements/{eid}/tests, /v1/audit/engagements/{eid}/policies
 *   - Mappings: /v1/audit/library/controls/{cid}/tests|policies
 */
import api from '../config/axios.config'

export const auditTestsApi = {

  // ── Library — Tests ───────────────────────────────────────────────────────

  library: {
    tests: {
      list:   (params) =>
        api.get('/v1/audit/library/tests', { params }),

      get:    (id) =>
        api.get(`/v1/audit/library/tests/${id}`),

      create: (data) =>
        api.post('/v1/audit/library/tests', data),

      update: (id, data) =>
        api.put(`/v1/audit/library/tests/${id}`, data),

      delete: (id) =>
        api.delete(`/v1/audit/library/tests/${id}`),
    },

    // ── Control ↔ Test mappings ──────────────────────────────────────────

    controlTests: {
      /** List all tests mapped to a library control */
      listForControl: (controlId) =>
        api.get(`/v1/audit/library/controls/${controlId}/tests`),

      /** Link a test to a library control */
      link: (controlId, testId, { required = true, orderNo = 0, note } = {}) =>
        api.post(`/v1/audit/library/controls/${controlId}/tests/${testId}`, null, {
          params: { required, orderNo, note },
        }),

      /** Unlink a test from a library control */
      unlink: (controlId, testId) =>
        api.delete(`/v1/audit/library/controls/${controlId}/tests/${testId}`),
    },

    // ── Policies ─────────────────────────────────────────────────────────

    policies: {
      list:       (params) =>
        api.get('/v1/audit/library/policies', { params }),

      get:        (id) =>
        api.get(`/v1/audit/library/policies/${id}`),

      create:     (data) =>
        api.post('/v1/audit/library/policies', data),

      update:     (id, data) =>
        api.put(`/v1/audit/library/policies/${id}`, data),

      approve:    (id) =>
        api.post(`/v1/audit/library/policies/${id}/approve`),

      deprecate:  (id) =>
        api.post(`/v1/audit/library/policies/${id}/deprecate`),

      delete:     (id) =>
        api.delete(`/v1/audit/library/policies/${id}`),
    },

    // ── Control ↔ Policy mappings ─────────────────────────────────────────

    controlPolicies: {
      /** List all policies mapped to a library control */
      listForControl: (controlId) =>
        api.get(`/v1/audit/library/controls/${controlId}/policies`),

      /** Link a policy to a library control */
      link: (controlId, policyId, { mappingType = 'DIRECT', note } = {}) =>
        api.post(`/v1/audit/library/controls/${controlId}/policies/${policyId}`, null, {
          params: { mappingType, note },
        }),

      /** Unlink a policy from a library control */
      unlink: (controlId, policyId) =>
        api.delete(`/v1/audit/library/controls/${controlId}/policies/${policyId}`),
    },

    // ── CSV import (extended) ─────────────────────────────────────────────

    /**
     * Import tests, policies, and mappings from CSV.
     * Same endpoint as the main audit template CSV import — extended row types.
     * Backend AuditCsvImportExtension handles TEST, POLICY, CONTROL_TEST_MAPPING, POLICY_CONTROL_MAPPING rows.
     */
    importCsv: (file) => {
      const form = new FormData()
      form.append('file', file)
      return api.post('/v1/audit/library/tests-policies/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000,
      })
    },

    downloadCsvExample: () =>
      api.get('/v1/audit/library/tests-policies/csv-example', {
        responseType: 'blob',
      }),
  },

  // ── Engagement runtime — Tests ─────────────────────────────────────────────

  engagements: {
    tests: {
      /** List all test instances for an engagement */
      list: (engagementId) =>
        api.get(`/v1/audit/engagements/${engagementId}/tests`),

      /** Get one test instance */
      get: (engagementId, testInstanceId) =>
        api.get(`/v1/audit/engagements/${engagementId}/tests/${testInstanceId}`),

      /**
       * Record test result — automatically derives linked control results.
       * @param {string} data.testResult  PASS | FAIL | EXCEPTION
       * @param {string} [data.testerNotes]
       * @param {string} [data.failureDetail]
       */
      recordResult: (engagementId, testInstanceId, data) =>
        api.put(`/v1/audit/engagements/${engagementId}/tests/${testInstanceId}/result`, data),

      /** List test instances for a specific control instance */
      listForControl: (engagementId, controlInstanceId) =>
        api.get(`/v1/audit/engagements/${engagementId}/controls/${controlInstanceId}/tests`),
    },

    // ── Engagement runtime — Policies ──────────────────────────────────────

    policies: {
      /** List all policy instances for an engagement */
      list: (engagementId) =>
        api.get(`/v1/audit/engagements/${engagementId}/policies`),

      /** Get one policy instance (includes content body) */
      get: (engagementId, policyInstanceId) =>
        api.get(`/v1/audit/engagements/${engagementId}/policies/${policyInstanceId}`),

      /**
       * Auditor records review result for a policy instance.
       * @param {string} data.reviewResult  ADEQUATE | ADEQUATE_WITH_GAPS | INADEQUATE | NOT_APPLICABLE
       * @param {string} [data.auditorNotes]
       */
      review: (engagementId, policyInstanceId, data) =>
        api.put(`/v1/audit/engagements/${engagementId}/policies/${policyInstanceId}/review`, data),

      /** List policy instances covering a specific control instance */
      listForControl: (engagementId, controlInstanceId) =>
        api.get(`/v1/audit/engagements/${engagementId}/controls/${controlInstanceId}/policies`),
    },
  },
}