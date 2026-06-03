/**
 * useAccessContext.js
 *
 * Re-exports useViewContext from useWorkflow.js for use by new module pages
 * that import from this dedicated file.
 *
 * ── WHY TWO HOOKS ─────────────────────────────────────────────────────────────
 *
 * useAccessContext (in useWorkflow.js):
 *   Calls GET /v1/workflow-instances/tasks/access-context — the original endpoint.
 *   Signature: useAccessContext(stepInstanceId, taskId)
 *   Used by: VendorAssessmentFillPage, VendorAssessmentAssignPage,
 *            VendorAssessmentResponderReviewPage (all existing TPRM pages).
 *   Returns: mode, canView, canEdit, canAct, reason, stepStatus, workflowStatus.
 *   DO NOT CHANGE — TPRM pages depend on this exact signature and endpoint.
 *
 * useViewContext (in useWorkflow.js, re-exported here):
 *   Calls GET /v1/ui-config/view-context — the new ViewContextController endpoint.
 *   Signature: useViewContext(entityType, entityId?, stepInstanceId?)
 *   Used by: UniversalModulePage, RecordDetailTemplate, new GRC module pages.
 *   Returns: all of the above PLUS permissions[], sodViolations[], visibleTabs[],
 *            hiddenTabs[], editableFields[], readOnlyFields[], hiddenFields[],
 *            availableActions[], stepLabel.
 *
 * Import from this file when building new module pages:
 *   import { useViewContext } from '../hooks/useAccessContext'
 *
 * Import from useWorkflow.js directly for existing TPRM pages (no change needed).
 */
export { useViewContext } from './useWorkflow'