import api from '../config/axios.config'

/**
 * Audit Management API client.
 *
 * ARCHITECTURE:
 *   Library: templates → root sections → section tree (unlimited depth) → controls
 *   Runtime: project → engagement (auto-snapshots template tree on create)
 *            → section instances (tree) → control instances (leaf, any depth)
 *
 *   Section tree uses adjacency list + materialized path.
 *   Template tree is ROOT-sections-only in the mapping; children are implicit.
 *
 *   CSV import is SERVER-SIDE — frontend uploads a File, backend parses.
 *   No CSV parsing in JavaScript. Same pattern as assessmentsApi.templates.importCsv().
 */
export const auditApi = {

  // ── Projects ──────────────────────────────────────────────────────────────

  projects: {
    list: (params) =>
      api.get('/v1/audit/projects', { params }),

    get: (id) =>
      api.get(`/v1/audit/projects/${id}`),

    create: (data) =>
      api.post('/v1/audit/projects', data),

    update: (id, data) =>
      api.put(`/v1/audit/projects/${id}`, data),

    updateStatus: (id, status) =>
      api.patch(`/v1/audit/projects/${id}/status`, { status }),

    publish:   (id) => api.post(`/v1/audit/projects/${id}/publish`),
    unpublish: (id) => api.post(`/v1/audit/projects/${id}/unpublish`),

    setVisibility: (id, visibility) =>
      api.patch(`/v1/audit/projects/${id}/visibility`, { visibility }),

    tenantAccess: {
      list:   (projectId)           => api.get(`/v1/audit/projects/${projectId}/tenant-access`),
      grant:  (projectId, tenantId) => api.post(`/v1/audit/projects/${projectId}/tenant-access/${tenantId}`),
      revoke: (projectId, tenantId) => api.delete(`/v1/audit/projects/${projectId}/tenant-access/${tenantId}`),
    },

    // ── Project-Template Planning ──────────────────────────────────────────
    // FIX: templates was previously at auditApi.templates (root level) but
    // AuditProjectTemplatesPanel calls auditApi.projects.templates.* — moved here.

    templates: {
      /** List templates planned for a project (library references, not instances) */
      list: (projectId) =>
        api.get(`/v1/audit/projects/${projectId}/templates`),

      /** Add a PUBLISHED template to the project plan */
      add: (projectId, templateId, { note } = {}) =>
        api.post(`/v1/audit/projects/${projectId}/templates/${templateId}`,
          null, { params: { note } }),

      /** Remove a template from the project plan (only if not yet started) */
      remove: (projectId, templateId) =>
        api.delete(`/v1/audit/projects/${projectId}/templates/${templateId}`),

      /**
       * Start an engagement from a planned template.
       * Backend calls snapshotTemplate() → 100% isolated instances.
       * Returns AuditEngagementResponse.
       */
      start: (projectId, templateId, engagementRequest) =>
        api.post(`/v1/audit/projects/${projectId}/templates/${templateId}/start`,
          engagementRequest),
    },
  },

  // ── Engagements ───────────────────────────────────────────────────────────

  engagements: {
    list: (params) =>
      api.get('/v1/audit/engagements', { params }),

    get: (id) =>
      api.get(`/v1/audit/engagements/${id}`),

    create: (data) =>
      api.post('/v1/audit/engagements', data),

    update: (id, data) =>
      api.put(`/v1/audit/engagements/${id}`, data),

    updateStatus: (id, status) =>
      api.patch(`/v1/audit/engagements/${id}/status`, { status }),

    stats: (id) =>
      api.get(`/v1/audit/engagements/${id}/stats`),

    // ── Lifecycle transitions (named endpoints — more intent than PATCH /status) ──

    /**
     * POST /v1/audit/engagements/{id}/activate
     * Transitions PLANNING → FIELDWORK, sets actualStart timestamp.
     * Called from Step 1 action button in the workflow.
     */
    activate: (id) =>
      api.post(`/v1/audit/engagements/${id}/activate`),

    /**
     * POST /v1/audit/engagements/{id}/start-evidence-review
     * Transitions FIELDWORK → EVIDENCE_REVIEW.
     */
    startEvidenceReview: (id) =>
      api.post(`/v1/audit/engagements/${id}/start-evidence-review`),

    /**
     * POST /v1/audit/engagements/{id}/start-draft-report
     * Transitions EVIDENCE_REVIEW → DRAFT_REPORT, sets submittedAt.
     */
    startDraftReport: (id) =>
      api.post(`/v1/audit/engagements/${id}/start-draft-report`),

    /**
     * POST /v1/audit/engagements/{id}/complete
     * Transitions DRAFT_REPORT/FINAL_REPORT → CLOSED, sets completedAt.
     */
    complete: (id) =>
      api.post(`/v1/audit/engagements/${id}/complete`),

    /**
     * POST /v1/audit/engagements/{id}/cancel
     * Transitions any status → CANCELLED.
     */
    cancel: (id) =>
      api.post(`/v1/audit/engagements/${id}/cancel`),

    /**
     * GET /v1/audit/engagements/{id}/findings
     * List all AuditFindings for an engagement.
     * Used by AuditReportPage and the Findings tab in AuditEngagementDetailPage.
     */
    findings: (id, params) =>
      api.get(`/v1/audit/engagements/${id}/findings`, { params }),


    // ── Sections ────────────────────────────────────────────────────────────

    sections: {
      list: (engagementId) =>
        api.get(`/v1/audit/engagements/${engagementId}/sections`),

      assign: (engagementId, sectionInstanceId, auditorId, cascadeToChildren = true) =>
        api.put(`/v1/audit/engagements/${engagementId}/sections/${sectionInstanceId}/assign`, {
          auditorId, cascadeToChildren,
        }),

      assignAuditee: (engagementId, sectionInstanceId, auditeeUserId) =>
        api.put(`/v1/audit/engagements/${engagementId}/sections/${sectionInstanceId}/assign-auditee`, {
          auditeeUserId,
        }),

      submit: (engagementId, sectionInstanceId, cascadeToChildren = false) =>
        api.post(`/v1/audit/engagements/${engagementId}/sections/${sectionInstanceId}/submit`, {
          cascadeToChildren,
        }),

      reopen: (engagementId, sectionInstanceId) =>
        api.post(`/v1/audit/engagements/${engagementId}/sections/${sectionInstanceId}/reopen`),
    },

    // ── Controls ────────────────────────────────────────────────────────────

    controls: {
      list: (engagementId, params) =>
        api.get(`/v1/audit/engagements/${engagementId}/controls`, { params }),

      get: (engagementId, controlInstanceId) =>
        api.get(`/v1/audit/engagements/${engagementId}/controls/${controlInstanceId}`),

      recordTestResult: (engagementId, controlInstanceId, data) =>
        api.put(`/v1/audit/engagements/${engagementId}/controls/${controlInstanceId}/test-result`, data),

      assignAuditee: (engagementId, controlInstanceId, auditeeUserId) =>
        api.put(`/v1/audit/engagements/${engagementId}/controls/${controlInstanceId}/assign-auditee`, {
          auditeeUserId,
        }),

      /**
       * PUT /v1/audit/engagements/{id}/controls/{cid}/assign-auditor
       * Assign an auditor to a specific control instance.
       * Used when lead auditor assigns at control level (override of section assignment).
       */
      assignAuditor: (engagementId, controlInstanceId, auditorId) =>
        api.put(`/v1/audit/engagements/${engagementId}/controls/${controlInstanceId}/assign-auditor`, {
          auditorId,
        }),

      /**
       * POST /v1/audit/engagements/{id}/controls/{cid}/submit-evidence
       * Auditee marks evidence as submitted for this control.
       * Fires EVIDENCE_UPLOADED section event → advances compound gate in Step 4.
       */
      submitEvidence: (engagementId, controlInstanceId) =>
        api.post(`/v1/audit/engagements/${engagementId}/controls/${controlInstanceId}/submit-evidence`),

    },
  },

  // ── Library ───────────────────────────────────────────────────────────────

  library: {

    // ── Library — Templates ───────────────────────────────────────────────

    templates: {
      list: (params) =>
        api.get('/v1/audit/library/templates', { params }),

      get: (id) =>
        api.get(`/v1/audit/library/templates/${id}`),

      /**
       * Full template tree with all sections (nested) and controls at each level.
       * Returns: { template, rootSections: SectionNode[] }
       * where SectionNode = { section, children: SectionNode[], controls: MappingWithControl[] }
       * Control shape: { mappingId, controlId, sectionId, orderNo, weight, mandatory,
       *                  name, description, controlCode, testType, controlTag, frameworkRef }
       */
      full: (id, signal) =>
        api.get(`/v1/audit/library/templates/${id}/full`, signal ? { signal } : undefined),

      create: (data) =>
        api.post('/v1/audit/library/templates', data),

      update: (id, data) =>
        api.put(`/v1/audit/library/templates/${id}`, data),

      publish: (id) =>
        api.post(`/v1/audit/library/templates/${id}/publish`),

      unpublish: (id) =>
        api.post(`/v1/audit/library/templates/${id}/unpublish`),

      delete: (id) =>
        api.delete(`/v1/audit/library/templates/${id}`),

      bulkDelete: (ids) =>
        api.delete('/v1/audit/library/templates', { params: { ids: ids.join(',') } }),

      /**
       * Map a ROOT section into a template.
       * Backend validates section.parentId == null — root sections only.
       */
      addSection: (templateId, sectionId, orderNo = 0) =>
        api.post(`/v1/audit/library/templates/${templateId}/sections/${sectionId}`,
          null, { params: { orderNo } }),

      removeSection: (templateId, sectionId) =>
        api.delete(`/v1/audit/library/templates/${templateId}/sections/${sectionId}`),

      /**
       * Upload a CSV file for server-side parsing and bulk import.
       * CSV format: TEMPLATE / SECTION (with level column) / CONTROL rows.
       * Server parses — NO CSV parsing in browser.
       * Supports large templates (300+ controls) — 5 minute timeout.
       */
      importCsv: (file) => {
        const form = new FormData()
        form.append('file', file)
        return api.post('/v1/audit/library/templates/import', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
        })
      },

      /**
       * Unified library import — all 7 row types in one CSV:
       * TEMPLATE, SECTION, CONTROL, TEST, POLICY,
       * CONTROL_TEST_MAPPING, POLICY_CONTROL_MAPPING
       * Same endpoint as importCsv — the extended service handles all types.
       */
      importLibraryCsv: (file) => {
        const form = new FormData()
        form.append('file', file)
        return api.post('/v1/audit/library/templates/import', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 600000,   // 10 min — full SOC 2 library is ~150 rows
        })
      },
    },

    // ── Library — Sections ─────────────────────────────────────────────────

    sections: {
      listRoots: (params) =>
        api.get('/v1/audit/library/sections/roots', { params }),

      listChildren: (parentId) =>
        api.get(`/v1/audit/library/sections/${parentId}/children`),

      getSubtree: (sectionId) =>
        api.get(`/v1/audit/library/sections/${sectionId}/subtree`),

      /**
       * List controls mapped to a section (standalone — not via template).
       * Returns: Array of { mappingId, controlId, sectionId, orderNo, weight, mandatory,
       *                     name, description, controlCode, testType, controlTag, frameworkRef }
       */
      listControls: (sectionId) =>
        api.get(`/v1/audit/library/sections/${sectionId}/controls`),

      create: (data) =>
        api.post('/v1/audit/library/sections', data),

      update: (id, data) =>
        api.put(`/v1/audit/library/sections/${id}`, data),

      move: (id, newParentId) =>
        api.patch(`/v1/audit/library/sections/${id}/move`, { newParentId }),

      delete: (id) =>
        api.delete(`/v1/audit/library/sections/${id}`),

      bulkDelete: (ids) =>
        api.delete('/v1/audit/library/sections', { params: { ids: ids.join(',') } }),

      /**
       * Add (or update) a control mapping onto a section.
       * Backend is idempotent — if mapping already exists it updates weight/mandatory.
       *
       * FIX 1: backend uses @RequestParam, NOT @RequestBody — must send as query params.
       * FIX 2: backend param name is 'mandatory' (not 'isMandatory').
       */
      addControl: (sectionId, controlId, { orderNo = 0, weight = 1.0, isMandatory = false } = {}) =>
        api.post(`/v1/audit/library/sections/${sectionId}/controls/${controlId}`, null, {
          params: { orderNo, weight, mandatory: isMandatory },
        }),

      removeControl: (sectionId, controlId) =>
        api.delete(`/v1/audit/library/sections/${sectionId}/controls/${controlId}`),
    },

    // ── Library — Controls ─────────────────────────────────────────────────

    controls: {
      list: (params) =>
        api.get('/v1/audit/library/controls', { params }),

      get: (id) =>
        api.get(`/v1/audit/library/controls/${id}`),

      create: (data) =>
        api.post('/v1/audit/library/controls', data),

      update: (id, data) =>
        api.put(`/v1/audit/library/controls/${id}`, data),

      delete: (id) =>
        api.delete(`/v1/audit/library/controls/${id}`),

      bulkDelete: (ids) =>
        api.delete('/v1/audit/library/controls', { params: { ids: ids.join(',') } }),

      /** List tests mapped to a library control */
      listTests: (controlId) =>
        api.get(`/v1/audit/library/controls/${controlId}/tests`),

      /** List policies mapped to a library control */
      listPolicies: (controlId) =>
        api.get(`/v1/audit/library/controls/${controlId}/policies`),

      /** Link a test to a library control */
      linkTest: (controlId, testId) =>
        api.post(`/v1/audit/library/controls/${controlId}/tests/${testId}`),

      /** Unlink a test from a library control */
      unlinkTest: (controlId, testId) =>
        api.delete(`/v1/audit/library/controls/${controlId}/tests/${testId}`),

      /** Link a policy to a library control */
      linkPolicy: (controlId, policyId) =>
        api.post(`/v1/audit/library/controls/${controlId}/policies/${policyId}`),

      /** Unlink a policy from a library control */
      unlinkPolicy: (controlId, policyId) =>
        api.delete(`/v1/audit/library/controls/${controlId}/policies/${policyId}`),
    },

    // ── Library — Tests ────────────────────────────────────────────────────

    tests: {
      list: (params) =>
        api.get('/v1/audit/library/tests', { params }),

      get: (id) =>
        api.get(`/v1/audit/library/tests/${id}`),

      create: (data) =>
        api.post('/v1/audit/library/tests', data),

      update: (id, data) =>
        api.put(`/v1/audit/library/tests/${id}`, data),

      delete: (id) =>
        api.delete(`/v1/audit/library/tests/${id}`),

      bulkDelete: (ids) =>
        api.delete('/v1/audit/library/tests', { params: { ids: ids.join(',') } }),

      /** List controls this test is linked to */
      listControls: (testId) =>
        api.get(`/v1/audit/library/tests/${testId}/controls`),

      /**
       * Bulk CSV import for tests AND policies.
       * CSV type column distinguishes them: type=TEST or type=POLICY.
       * Endpoint: POST /v1/audit/library/tests-policies/import
       */
      importCsv: (file) => {
        const form = new FormData()
        form.append('file', file)
        return api.post('/v1/audit/library/tests-policies/import', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 5 * 60_000,
        })
      },
    },

    // ── Library — Policies ─────────────────────────────────────────────────

    policies: {
      list: (params) =>
        api.get('/v1/audit/library/policies', { params }),

      get: (id) =>
        api.get(`/v1/audit/library/policies/${id}`),

      create: (data) =>
        api.post('/v1/audit/library/policies', data),

      update: (id, data) =>
        api.put(`/v1/audit/library/policies/${id}`, data),

      delete: (id) =>
        api.delete(`/v1/audit/library/policies/${id}`),

      bulkDelete: (ids) =>
        api.delete('/v1/audit/library/policies', { params: { ids: ids.join(',') } }),

      approve: (id) =>
        api.post(`/v1/audit/library/policies/${id}/approve`),

      deprecate: (id) =>
        api.post(`/v1/audit/library/policies/${id}/deprecate`),

      /** List controls this policy is linked to */
      listControls: (policyId) =>
        api.get(`/v1/audit/library/policies/${policyId}/controls`),
    },
  },

  // ── Findings ──────────────────────────────────────────────────────────────

  findings: {
    /** List all findings for an engagement — used by EngagementFindingsTab */
    listByEngagement: (engagementId) =>
      api.get(`/v1/audit/engagements/${engagementId}/findings`),

    /** Escalate a finding to Issue Management — creates a linked Issue */
    escalateToIssue: (findingId) =>
      api.post(`/v1/audit/findings/${findingId}/escalate-to-issue`),
  },

  // ── Engagement integration snapshots ──────────────────────────────────────

  integrationSnapshots: {
    /** List EngagementIntegrationSnapshot rows for an engagement
     *  Used by EngagementIntegrationTab to show automated check status */
    listForEngagement: (engagementId) =>
      api.get(`/v1/audit/engagements/${engagementId}/integration-snapshots`),
  },
}