import api from '../config/axios.config'

/**
 * Assessment API client.
 *
 * ARCHITECTURE:
 *   Library entities (options, questions, sections) are pure reusable items — no FK duplication.
 *   Template relationships are managed via JOIN TABLE mappings:
 *     template ↔ section  → templates.sections.map / unmap
 *     section  ↔ question → sections.questions.map / update / unmap
 *     question ↔ option   → library.questions.linkOptions
 *
 *   CSV import is SERVER-SIDE (OpenCSV) — frontend uploads a File, backend parses.
 *   No CSV parsing in JavaScript.
 */
export const assessmentsApi = {

  // ─── Templates ────────────────────────────────────────────────────────────
  templates: {
    list:      (params)       => api.get('/v1/assessment-templates', { params }),

    /**
     * Fetch the full template structure (sections → questions → options).
     * Accepts an AbortSignal so React Query can cancel the in-flight request
     * when the component unmounts or the query key changes — preventing the
     * "canceled then immediately re-requested" double-fetch seen in DevTools.
     * The backend /full endpoint now uses 4 bulk IN queries instead of N+N+N
     * individual findById calls, so this should return in ~150–200ms.
     *
     * @param {number|string} id       — template ID
     * @param {AbortSignal}   [signal] — optional cancellation signal from React Query
     */
    full:      (id, signal)   => api.get(`/v1/assessment-templates/${id}/full`,
                                          signal ? { signal } : undefined),

    create:    (data)         => api.post('/v1/assessment-templates', data),
    update:    (id, data)     => api.put(`/v1/assessment-templates/${id}`, data),
    delete:    (id)           => api.delete(`/v1/assessment-templates/${id}`),
    publish:   (id)           => api.put(`/v1/assessment-templates/${id}/publish`),
    unpublish: (id)           => api.put(`/v1/assessment-templates/${id}/unpublish`),

    /**
     * Upload a CSV file for server-side parsing and import.
     * The server uses OpenCSV — NO parsing happens in the browser.
     * @param {File} file  — the CSV file from an <input type="file">
     * @returns {CsvImportResult} structured log + created templateId
     */
    importCsv: (file) => {
      const form = new FormData()
      form.append('file', file)
      return api.post('/v1/assessment-templates/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // Import can take 2–4 minutes for large templates (300+ questions).
        // Override the default 60s timeout so the browser doesn't cut the
        // connection before the backend finishes. The backend processes each
        // question synchronously — this is the simplest fix without async jobs.
        timeout: 300000,
      })
    },

    // Section mappings within a template
    sections: {
      /** Map an existing library section into a template at a given order position */
      map:    (templateId, sectionId, orderNo) =>
                api.post(`/v1/assessment-templates/${templateId}/sections/${sectionId}`, null,
                  { params: { orderNo } }),
      /** Remove a section from a template (section stays in library) */
      unmap:  (templateId, sectionId) =>
                api.delete(`/v1/assessment-templates/${templateId}/sections/${sectionId}`),
    },
  },

  // ─── Section → Question mappings ──────────────────────────────────────────
  sections: {
    /**
     * Map a library question into a section.
     * data: { weight, isMandatory, orderNo }
     */
    mapQuestion:    (sectionId, questionId, data) =>
                      api.post(`/v1/assessment-sections/${sectionId}/questions/${questionId}`, data),
    /** Update weight/mandatory/order for an existing mapping */
    updateQuestion: (sectionId, questionId, data) =>
                      api.put(`/v1/assessment-sections/${sectionId}/questions/${questionId}`, data),
    /** Remove a question from a section (question stays in library) */
    unmapQuestion:  (sectionId, questionId) =>
                      api.delete(`/v1/assessment-sections/${sectionId}/questions/${questionId}`),
  },

  // ─── Library: Options ─────────────────────────────────────────────────────
  library: {
    options: {
      list:   (params) => api.get('/v1/assessment-library/options', { params }),
      create: (data)   => api.post('/v1/assessment-library/options', data),
      update: (id, data) => api.put(`/v1/assessment-library/options/${id}`, data),
      delete: (id)     => api.delete(`/v1/assessment-library/options/${id}`),
      bulkDelete: (ids) => api.delete('/v1/assessment-library/options/bulk', { data: ids }),
    },

    // ─── Library: Questions ─────────────────────────────────────────────────
    questions: {
      list:   (params)       => api.get('/v1/assessment-library/questions', { params }),
      create: (data)         => api.post('/v1/assessment-library/questions', data),
      update: (id, data)     => api.put(`/v1/assessment-library/questions/${id}`, data),
      delete: (id)           => api.delete(`/v1/assessment-library/questions/${id}`),
      bulkDelete:  (ids)        => api.delete('/v1/assessment-library/questions/bulk', { data: ids }),
      getOptions:  (id)         => api.get(`/v1/assessment-library/questions/${id}/options`),
      importCsv:   (file)       => {
        const form = new FormData()
        form.append('file', file)
        return api.post('/v1/assessment-library/questions/import', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
        })
      },
    },

    // ─── Library: Sections ──────────────────────────────────────────────────
    sections: {
      list:   (params)     => api.get('/v1/assessment-library/sections', { params }),
      create: (data)       => api.post('/v1/assessment-library/sections', data),
      update: (id, data)   => api.put(`/v1/assessment-library/sections/${id}`, data),
      delete: (id)         => api.delete(`/v1/assessment-library/sections/${id}`),
      bulkDelete: (ids)    => api.delete('/v1/assessment-library/sections/bulk', { data: ids }),
    },
  },

  // ─── Risk mappings ────────────────────────────────────────────────────────
  // Each tier (LOW/MEDIUM/HIGH/CRITICAL) can have up to 3 templates mapped.
  // The backend saves one row per (tierLabel, templateId) pair so candidates[]
  // returned by QUEUE_ASSESSMENT_CANDIDATES can surface all options to the admin.
  riskMappings: {
    list: ()     => api.get('/v1/config/risk-template-mappings'),
    save: (data) => api.post('/v1/config/risk-template-mappings', data),
  },

  // ─── Template selection (workflow step: QUEUE_ASSESSMENT_CANDIDATES) ──────
  // When the workflow step finds >1 candidate templates for the vendor's risk
  // tier it pauses and writes a vendor_template_selection row with
  // selectedTemplateId=null. These endpoints let org admin/owner query that
  // pending state and confirm a choice so the workflow can proceed.
  templateSelection: {
    /** GET /v1/workflows/instances/:instanceId/template-selection
     *  Returns { riskTierLabel, candidates: [{templateId, name, version}],
     *            alreadySelected: bool, selectedTemplateId? }
     *  Throws 404 when there is no pending selection for this instance.
     */
    get:    (workflowInstanceId) =>
              api.get(`/v1/workflows/instances/${workflowInstanceId}/template-selection`),

    /** POST /v1/workflows/instances/:instanceId/template-selection
     *  Body: { templateId }
     *  Confirms the admin's chosen template, resumes the paused step.
     */
    select: (workflowInstanceId, templateId) =>
              api.post(`/v1/workflows/instances/${workflowInstanceId}/template-selection`,
                       { templateId }),
  },

  // ─── Vendor assessments ───────────────────────────────────────────────────
  vendor: {
    list:    (params)           => api.get('/v1/assessments', { params }),
    get:     (id)               => api.get(`/v1/assessments/${id}`),
    review:  (id)               => api.get(`/v1/assessments/${id}/review`),
    submit:  (id, data)         => api.post(`/v1/assessments/${id}/submit`, data),
    respond: (id, data)         => api.post(`/v1/assessments/${id}/responses`, data),
    comment: (responseId, data) => api.post(`/v1/assessments/responses/${responseId}/comments`, data),

    /**
     * Cancel a stale assessment and close its parent cycle.
     * Called as part of the Cancel & Restart flow in WorkflowPage.
     * Marks VendorAssessment.status = CANCELLED and VendorAssessmentCycle.status = CLOSED.
     * The AssessmentTemplateInstance snapshot is preserved for audit.
     *
     * PATCH /v1/assessments/:id/cancel
     */
    cancel: (id, remarks) =>
      api.patch(`/v1/assessments/${id}/cancel`, null,
        remarks ? { params: { remarks } } : undefined),

    // ── Step 4: CISO assigns section to Responder ──────────────
    assignSection: (assessmentId, sectionInstanceId, userId) =>
      api.put(`/v1/assessments/${assessmentId}/sections/${sectionInstanceId}/assign`, { userId }),

    // ── Step 4: Responder assigns/unassigns question to Contributor ──────
    assignQuestion: (assessmentId, questionInstanceId, userId) =>
      api.put(`/v1/assessments/${assessmentId}/questions/${questionInstanceId}/assign`, { userId }),
    unassignQuestion: (assessmentId, questionInstanceId) =>
      api.delete(`/v1/assessments/${assessmentId}/questions/${questionInstanceId}/assign`),
    assignQuestionsBatch: (assessmentId, questionInstanceIds, userId) =>
      api.put(`/v1/assessments/${assessmentId}/questions/assign-batch`,
              { userId, questionInstanceIds }),

    // ── Step 5: Responder fetches only their assigned sections ──
    mySections:  (assessmentId) =>
      api.get(`/v1/assessments/${assessmentId}/my-sections`),

    // ── Step 6: Contributor fetches only their assigned questions
    myQuestions: (assessmentId) =>
      api.get(`/v1/assessments/${assessmentId}/my-questions`),

    // ── Section completion events ────────────────────────────────────────────
    // Each fires a TaskSectionEvent on the backend, which marks the section
    // complete and auto-approves the task when all required sections are done.
    confirmAssignment:         (id, taskId) =>
      api.post(`/v1/assessments/${id}/confirm-assignment`, null, { params: { taskId } }),
    // Section submit/reopen (new section-instance-level endpoints)
    submitSection:  (assessmentId, sectionInstanceId, taskId) =>
      api.post(`/v1/assessments/${assessmentId}/sections/${sectionInstanceId}/submit`,
               null, { params: taskId ? { taskId } : {} }),
    reopenSection:  (assessmentId, sectionInstanceId) =>
      api.post(`/v1/assessments/${assessmentId}/sections/${sectionInstanceId}/reopen`),
    sectionsStatus: (assessmentId) =>
      api.get(`/v1/assessments/${assessmentId}/sections/status`),
    contributorSubmitSection: (assessmentId, sectionInstanceId, taskId) =>
      api.post(`/v1/assessments/${assessmentId}/sections/${sectionInstanceId}/contributor-submit`,
               null, { params: taskId ? { taskId } : {} }),
    contributorSectionStatus: (assessmentId, taskId) =>
      api.get(`/v1/assessments/${assessmentId}/contributor-section-status`,
              { params: { taskId } }),
    // Kept for backward compat — no longer used for step 4
    markSectionComplete: (id, taskId) =>
      api.post(`/v1/assessments/${id}/mark-section-complete`, null, { params: { taskId } }),
    publishSection:            (id, taskId) =>
      api.post(`/v1/assessments/${id}/publish-section`, null, { params: { taskId } }),
    cisoSubmit:                (id, taskId) =>
      api.post(`/v1/assessments/${id}/ciso-submit`, null, { params: { taskId } }),
    cisoReview:                (id, taskId) =>
      api.post(`/v1/assessments/${id}/ciso-review`, null, { params: { taskId } }),
    confirmReviewerAssignment: (id, taskId) =>
      api.post(`/v1/assessments/${id}/confirm-reviewer-assignment`, null, { params: { taskId } }),
    // Step 7: Org CISO confirms delegation → fires performAction(APPROVE) on task
    assignOrgCiso: (id, taskId) =>
      api.post(`/v1/assessments/${id}/assign-org-ciso`, null, { params: { taskId } }),
    // Step 9 (org-side): Reviewer assigns a question to a review assistant.
    // Uses a SEPARATE endpoint from the vendor-side assign — writes reviewerAssignedUserId,
    // never touches assignedUserId (vendor contributor field).
    reviewerAssignQuestion: (assessmentId, questionInstanceId, userId) =>
      api.put(`/v1/assessments/${assessmentId}/questions/${questionInstanceId}/reviewer-assign`,
              { userId }),
    reviewerUnassignQuestion: (assessmentId, questionInstanceId) =>
      api.delete(`/v1/assessments/${assessmentId}/questions/${questionInstanceId}/reviewer-assign`),
    // Step 9: Save PASS/PARTIAL/FAIL verdict — persists across page refresh.
    // Named saveReviewerEval to match AssessmentReviewPage.jsx call sites.
    // taskId (optional): when provided, the backend checks if all questions are now evaluated
    // and auto-fires the ANSWERS_SCORED section event to complete the compound task gate.
    saveReviewerEval: (assessmentId, questionInstanceId, verdict, taskId) =>
      api.put(`/v1/assessments/${assessmentId}/questions/${questionInstanceId}/reviewer-eval`,
              { verdict }, { params: taskId ? { taskId } : {} }),
    completeReviewerEvaluation:(id, taskId) =>
      api.post(`/v1/assessments/${id}/complete-reviewer-evaluation`, null, { params: { taskId } }),
    consolidateScores:         (id, taskId) =>
      api.post(`/v1/assessments/${id}/consolidate-scores`, null, { params: { taskId } }),

    /**
     * Re-derives normalised scoreEarned for all responses using the
     * (optionScore/maxOptionScore)×weight formula, then consolidates.
     * Use for assessments answered before the normalised scoring was deployed.
     * Also fires SCORES_CONSOLIDATED to advance the workflow gate if taskId provided.
     */
    recalculateScores:         (id, taskId) =>
      api.post(`/v1/assessments/${id}/recalculate-scores`, null, { params: taskId ? { taskId } : {} }),
    documentFindings:          (id, taskId, findings) =>
      api.post(`/v1/assessments/${id}/document-findings`, { findings }, { params: { taskId } }),
    cisoApprove:               (id, taskId) =>
      api.post(`/v1/assessments/${id}/ciso-approve`, null, { params: { taskId } }),
    assignRiskRating:          (id, taskId, riskRating) =>
      api.post(`/v1/assessments/${id}/risk-rating`, null, { params: { taskId, riskRating } }),
  },

  // ── VENDOR SIDE — RESPONDER → CONTRIBUTOR COMMAND ACTIONS ──────────────────
  // Only accept and override here. Revision request goes through commentsApi.add()
  // with commentType: 'REVISION_REQUEST' — CommentService handles the ActionItem.

  /** Responder accepts contributor's submitted answer. */
  acceptContributorAnswer: (assessmentId, questionInstanceId) =>
    api.put(`/v1/assessments/${assessmentId}/questions/${questionInstanceId}/accept-contributor`),

  /**
   * Responder overrides contributor's answer with their own text/option.
   * Original is preserved in Activity trail as a SYSTEM comment.
   * body: { responseText?, selectedOptionInstanceId?, overrideReason? }
   */
  overrideContributorAnswer: (assessmentId, questionInstanceId, body) =>
    api.post(`/v1/assessments/${assessmentId}/questions/${questionInstanceId}/override-answer`, body),

  /**
   * Admin: clear reviewer_submitted_at on all sections for a given reviewer
   * so they can re-submit after a task reset.
   * Pair with workflowsApi.instances.resetTask() for full task reopen.
   * assignedUserId optional — omit to clear ALL reviewer submissions.
   */
  resetReviewerSections: (assessmentId, assignedUserId) =>
    api.post(`/v1/assessments/${assessmentId}/reset-reviewer-sections`,
      null, { params: assignedUserId ? { assignedUserId } : {} }),

    /** Admin: directly overwrite consolidated findings (for data recovery / editing) */
  updateFindings: (assessmentId, findings) =>
    api.put(`/v1/assessments/${assessmentId}/findings`, { findings }),
}