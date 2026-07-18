/**
 * notificationEvents.js — catalog of every eventKey the backend fires.
 *
 * Used by:
 *   - NotificationEmailRulesPage (admin): eventKey dropdown
 *   - NotificationPreferencesPage (user): the preference matrix rows
 *
 * Source of truth is the backend call sites (NotificationService.send*).
 * When a new eventKey is added in code, add it here so admins can map it
 * and users can mute it. Unknown keys still work end-to-end (raw fallback
 * email + "ALL" preference row applies) — this list is for UX, not gating.
 *
 * TODO(enterprise): replace with GET /v1/admin/notification-events served
 * from a backend registry so frontend never drifts from code.
 */

export const EVENT_GROUPS = [
  {
    label: 'Work assignments',
    colorTag: 'blue',
    events: [
      { key: 'TASK_ASSIGNED',                  label: 'Task assigned' },
      { key: 'TASK_ASSIGNMENT',                label: 'Task assigned (workflow)' },
      { key: 'SUB_TASK_ASSIGNMENT',            label: 'Sub-task assigned' },
      { key: 'SECTION_ASSIGNED',               label: 'Section assigned' },
      { key: 'QUESTION_ASSIGNED',              label: 'Question assigned' },
      { key: 'QUESTION_ASSIGNED_FOR_REVIEW',   label: 'Response awaiting your review' },
      { key: 'ASSESSMENT_ASSIGNED',            label: 'Assessment assigned' },
      { key: 'ISSUE_ASSIGNED',                 label: 'Issue assigned' },
    ],
  },
  {
    label: 'Comments & mentions',
    colorTag: 'violet',
    events: [
      { key: 'NEW_COMMENT',            label: 'New comment on my items' },
      { key: 'MENTIONED_IN_COMMENT',   label: 'I am mentioned in a comment' },
    ],
  },
  {
    label: 'Evidence & remediation',
    colorTag: 'amber',
    events: [
      { key: 'AUDIT_EVIDENCE_REQUESTED',        label: 'Evidence requested' },
      { key: 'AUDIT_EVIDENCE_SENT_BACK',        label: 'Evidence sent back' },
      { key: 'REMEDIATION_REQUESTED',           label: 'Remediation requested' },
      { key: 'REVIEW_CLARIFICATION_REQUESTED',  label: 'Clarification requested' },
      { key: 'ASSESSMENT_SENT_BACK',            label: 'Assessment sent back' },
    ],
  },
  {
    label: 'SLA & escalations',
    colorTag: 'red',
    events: [
      { key: 'STEP_SLA_BREACHED', label: 'Workflow step SLA breached' },
      { key: 'ISSUE_SLA_BREACH',  label: 'Issue SLA breached' },
      { key: 'ISSUE_ESCALATION',  label: 'Issue escalated to me' },
      { key: 'ISSUE_OVERDUE',     label: 'Issue overdue' },
    ],
  },
  {
    label: 'Audit engagements',
    colorTag: 'blue',
    events: [
      { key: 'AUDIT_ENGAGEMENT_ASSIGNED',      label: 'Engagement assigned' },
      { key: 'AUDIT_SECTION_ASSIGNED',         label: 'Audit section assigned' },
      { key: 'AUDIT_SECTION_AUDITEE_ASSIGNED', label: 'Auditee section assigned' },
    ],
  },
  {
    label: 'Lifecycle & FYI',
    colorTag: 'slate',
    events: [
      { key: 'WORKFLOW_STARTED',        label: 'Workflow started' },
      { key: 'WORKFLOW_COMPLETED',      label: 'Workflow completed' },
      { key: 'STEP_ACTIVATED_OBSERVER', label: 'Step active (observer FYI)' },
      { key: 'DOCUMENT_UPLOADED',       label: 'Document attached to my items' },
      { key: 'ANSWER_ACCEPTED',         label: 'My answer accepted' },
      { key: 'ANSWER_OVERRIDDEN',       label: 'My answer overridden' },
      { key: 'ACTION_ITEM_RESOLVED',    label: 'Action item resolved' },
      { key: 'ACTION_ITEM_DISMISSED',   label: 'Action item dismissed' },
      { key: 'ISSUE_CLOSED',            label: 'Issue closed' },
      { key: 'ASSESSMENT_SUBMITTED',    label: 'Assessment submitted' },
      { key: 'VENDOR_ONBOARDED',        label: 'Vendor onboarded' },
      { key: 'ISSUE_AUTOMATED_INGEST',  label: 'Issue auto-created' },
      { key: 'EVIDENCE_AUTO_LINKED',    label: 'Evidence auto-linked' },
    ],
  },
]

export const ALL_EVENTS = EVENT_GROUPS.flatMap(g => g.events)

export const AUDIENCES = [
  { value: 'RECIPIENT', label: 'Recipient (affected users)' },
  { value: 'ACTOR',     label: 'Actor (who performed the action)' },
]

/** Sentinel understood by the backend as "my default for every event". */
export const ALL_EVENTS_KEY = 'ALL'
