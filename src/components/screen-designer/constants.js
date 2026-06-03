/**
 * Screen Designer — all constants, types and lookup tables.
 * Pure data — no JSX, no hooks.
 */
import { Layout, Table2, FileEdit, PanelLeft, PanelRight, Square, Hash,
  Zap, GitBranch, Activity, Flag, FileText, Columns2 } from 'lucide-react'

const SCREEN_TYPES = {
  SECTION: {
    key: 'SECTION', label: 'Section', icon: Hash,
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
    desc: 'Compound task section container',
    fieldName: 'sectionScreenKey',
    hint: 'Used in WorkflowStepSection.sectionScreenKey',
    canvasType: 'section',
  },
  ITEM_CARD: {
    key: 'ITEM_CARD', label: 'Item card', icon: Square,
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
    desc: 'Individual item within a section (question, control, finding)',
    fieldName: 'itemScreenKey',
    hint: 'Used in WorkflowStepSection.itemScreenKey',
    canvasType: 'item_card',
  },
  LIST: {
    key: 'LIST', label: 'List / table', icon: Table2,
    color: 'text-green-400 bg-green-500/10 border-green-500/25',
    desc: 'Module list page — columns, filters, bulk actions',
    fieldName: 'listScreenKey',
    hint: 'Used in ModuleBlueprint.listScreenKey',
    canvasType: 'list',
  },
  DETAIL: {
    key: 'DETAIL', label: 'Detail page', icon: Layout,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
    desc: 'Module detail page — tabs, fields, actions',
    fieldName: 'detailScreenKey',
    hint: 'Used in ModuleBlueprint.detailScreenKey',
    canvasType: 'detail',
  },
  FORM: {
    key: 'FORM', label: 'Form / modal', icon: FileEdit,
    color: 'text-teal-400 bg-teal-500/10 border-teal-500/25',
    desc: 'Create/edit form fields and layout',
    fieldName: 'createFormKey / editFormKey',
    hint: 'Used in ModuleBlueprint.createFormKey',
    canvasType: 'form',
  },
  PAGE: {
    key: 'PAGE', label: 'Page', icon: PanelLeft,
    color: 'text-orange-400 bg-orange-500/10 border-orange-500/25',
    desc: 'Full page for a workflow step nav key',
    fieldName: 'navKey',
    hint: 'Used in WorkflowStep.navKey',
    canvasType: 'page',
  },
}

function inferType(key) {
  if (!key) return 'SECTION'
  if (key.includes('_item') || key.includes('_card') || key.includes('_question')) return 'ITEM_CARD'
  if (key.includes('_list') || key.includes('_table')) return 'LIST'
  if (key.includes('_detail') || key.includes('_view')) return 'DETAIL'
  if (key.includes('_form') || key.includes('_create') || key.includes('_edit')) return 'FORM'
  if (key.includes('_page') || key.includes('_fill') || key.includes('_review') || key.includes('_assign')) return 'PAGE'
  return 'SECTION'
}

const SIDES = ['ORGANIZATION', 'VENDOR', 'AUDITOR', 'AUDITEE', 'SYSTEM']

const HTTP_METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE']

const ACTION_VARIANTS = ['primary', 'secondary', 'danger', 'warning', 'ghost']

const SCREEN_TEMPLATES = {
  // ── TPRM ──
  tprm_fill_section: {
    label: 'TPRM fill section', module: 'TPRM', group: 'TPRM flow',
    screenType: 'SECTION', sectionKey: 'tprm_fill_section', itemKey: 'vendor_question_item', formKey: '',
    desc: 'Section container for vendor responders to fill questionnaire',
    actions: [
      { actionKey: 'SUBMIT_SECTION', label: 'Submit section', variant: 'primary', httpMethod: 'POST',
        apiEndpoint: '/v1/compound-tasks/{taskId}/sections/{sectionKey}/complete',
        allowedSides: 'VENDOR', allowedStatusesJson: '["OPEN","IN_PROGRESS"]' },
    ],
  },
  vendor_question_item: {
    label: 'TPRM question card', module: 'TPRM', group: 'TPRM flow',
    screenType: 'ITEM_CARD', sectionKey: 'tprm_fill_section', itemKey: 'vendor_question_item', formKey: '',
    desc: 'Individual question card — responder fills, delegate, reviewer approves/flags',
    actions: [
      { actionKey: 'SUBMIT_ANSWER', label: 'Submit answer', variant: 'primary', httpMethod: 'POST',
        apiEndpoint: '/v1/compound-tasks/{taskId}/sections/{sectionKey}/items/{itemId}/complete',
        allowedSides: 'VENDOR', allowedStatusesJson: '["OPEN","IN_PROGRESS"]' },
      { actionKey: 'DELEGATE_ITEM', label: 'Delegate', variant: 'ghost', httpMethod: 'POST',
        apiEndpoint: '/v1/action-items', allowedSides: 'VENDOR', allowedStatusesJson: '["OPEN","IN_PROGRESS"]' },
      { actionKey: 'APPROVE_ANSWER', label: 'Approve answer', variant: 'primary', httpMethod: 'POST',
        apiEndpoint: '/v1/compound-tasks/{taskId}/sections/{sectionKey}/items/{itemId}/complete',
        allowedSides: 'ORGANIZATION', allowedStatusesJson: '["SUBMITTED","IN_REVIEW"]' },
      { actionKey: 'FLAG_FINDING', label: 'Flag finding', variant: 'danger', httpMethod: 'POST',
        apiEndpoint: '/v1/guard/blueprints/{blueprintId}/findings',
        allowedSides: 'ORGANIZATION', allowedStatusesJson: '["SUBMITTED","IN_REVIEW"]' },
      { actionKey: 'REQUEST_INFO', label: 'Request more info', variant: 'ghost', httpMethod: 'POST',
        apiEndpoint: '/v1/action-items', allowedSides: 'ORGANIZATION', allowedStatusesJson: '["SUBMITTED"]' },
    ],
  },
  tprm_assign_section: {
    label: 'TPRM assign section', module: 'TPRM', group: 'TPRM flow',
    screenType: 'SECTION', sectionKey: 'tprm_assign_section', itemKey: 'vendor_assign_item', formKey: '',
    desc: 'Section for VRM/CISO to assign responders',
    actions: [
      { actionKey: 'ASSIGN_RESPONDER', label: 'Assign to responder', variant: 'primary', httpMethod: 'POST',
        apiEndpoint: '/v1/compound-tasks/{taskId}/sections/{sectionKey}/assign',
        allowedSides: 'VENDOR', allowedStatusesJson: '["OPEN"]' },
    ],
  },
  // ── Risk ──
  risk_register_item: {
    label: 'Risk item card', module: 'RISK', group: 'Risk mgmt',
    screenType: 'ITEM_CARD', sectionKey: 'risk_review_section', itemKey: 'risk_register_item', formKey: 'risk_create_form',
    desc: 'Individual risk item — owner fills, reviewer approves or escalates',
    actions: [
      { actionKey: 'ACCEPT_RISK', label: 'Accept risk', variant: 'primary', httpMethod: 'POST',
        apiEndpoint: '/v1/compound-tasks/{taskId}/sections/{sectionKey}/items/{itemId}/complete',
        allowedSides: 'ORGANIZATION', allowedStatusesJson: '["OPEN","IN_REVIEW"]' },
      { actionKey: 'ESCALATE_RISK', label: 'Escalate', variant: 'danger', httpMethod: 'POST',
        apiEndpoint: '/v1/action-items', allowedSides: 'ORGANIZATION', allowedStatusesJson: '["OPEN"]' },
      { actionKey: 'REQUEST_MITIGATION', label: 'Request mitigation', variant: 'ghost', httpMethod: 'POST',
        apiEndpoint: '/v1/action-items', allowedSides: 'ORGANIZATION', allowedStatusesJson: '["OPEN"]' },
    ],
  },
  risk_list_screen: {
    label: 'Risk register list', module: 'RISK', group: 'Risk mgmt',
    screenType: 'LIST', sectionKey: '', itemKey: '', formKey: 'risk_create_form',
    desc: 'Risk register table — all risks, filterable by status/owner/rating',
    actions: [
      { actionKey: 'CREATE_RISK', label: 'New risk', variant: 'primary', httpMethod: 'POST',
        apiEndpoint: '/v1/risks', allowedSides: 'ORGANIZATION', allowedStatusesJson: '' },
    ],
  },
  // ── Audit ──
  audit_finding_item: {
    label: 'Audit finding card', module: 'AUDIT', group: 'Audit mgmt',
    screenType: 'ITEM_CARD', sectionKey: 'audit_findings_section', itemKey: 'audit_finding_item', formKey: 'finding_create_form',
    desc: 'Individual audit finding — auditor raises, auditee remediates',
    actions: [
      { actionKey: 'RAISE_FINDING', label: 'Raise finding', variant: 'danger', httpMethod: 'POST',
        apiEndpoint: '/v1/guard/blueprints/{blueprintId}/findings',
        allowedSides: 'AUDITOR', allowedStatusesJson: '["OPEN"]' },
      { actionKey: 'ACCEPT_FINDING', label: 'Accept & remediate', variant: 'primary', httpMethod: 'POST',
        apiEndpoint: '/v1/compound-tasks/{taskId}/sections/{sectionKey}/items/{itemId}/complete',
        allowedSides: 'AUDITEE', allowedStatusesJson: '["RAISED","OPEN"]' },
      { actionKey: 'DISPUTE_FINDING', label: 'Dispute', variant: 'ghost', httpMethod: 'POST',
        apiEndpoint: '/v1/action-items', allowedSides: 'AUDITEE', allowedStatusesJson: '["RAISED"]' },
    ],
  },
  iso_control_item: {
    label: 'ISO control card', module: 'AUDIT', group: 'Audit mgmt',
    screenType: 'ITEM_CARD', sectionKey: 'iso_controls_section', itemKey: 'iso_control_item', formKey: '',
    desc: 'ISO 27001 / SOC 2 control evidence card',
    actions: [
      { actionKey: 'SUBMIT_EVIDENCE', label: 'Submit evidence', variant: 'primary', httpMethod: 'POST',
        apiEndpoint: '/v1/compound-tasks/{taskId}/sections/{sectionKey}/items/{itemId}/complete',
        allowedSides: 'ORGANIZATION', allowedStatusesJson: '["OPEN","IN_PROGRESS"]' },
      { actionKey: 'MARK_NOT_APPLICABLE', label: 'Mark N/A', variant: 'ghost', httpMethod: 'POST',
        apiEndpoint: '/v1/compound-tasks/{taskId}/sections/{sectionKey}/items/{itemId}/complete',
        allowedSides: 'ORGANIZATION', allowedStatusesJson: '["OPEN"]' },
    ],
  },
  // ── Issue ──
  issue_item_card: {
    label: 'Issue item card', module: 'ISSUE', group: 'Issue mgmt',
    screenType: 'ITEM_CARD', sectionKey: 'issue_remediation_section', itemKey: 'issue_item_card', formKey: 'issue_create_form',
    desc: 'Issue remediation card — owner remediates, reviewer validates',
    actions: [
      { actionKey: 'MARK_REMEDIATED', label: 'Mark remediated', variant: 'primary', httpMethod: 'POST',
        apiEndpoint: '/v1/compound-tasks/{taskId}/sections/{sectionKey}/items/{itemId}/complete',
        allowedSides: 'ORGANIZATION', allowedStatusesJson: '["OPEN","IN_PROGRESS"]' },
      { actionKey: 'REOPEN_ISSUE', label: 'Reopen', variant: 'danger', httpMethod: 'POST',
        apiEndpoint: '/v1/action-items', allowedSides: 'ORGANIZATION', allowedStatusesJson: '["REMEDIATED"]' },
    ],
  },
  // ── Asset ──
  asset_item_card: {
    label: 'Asset item card', module: 'ASSET', group: 'Asset mgmt',
    screenType: 'ITEM_CARD', sectionKey: 'asset_review_section', itemKey: 'asset_item_card', formKey: 'asset_create_form',
    desc: 'Asset review card — owner attests, reviewer validates',
    actions: [
      { actionKey: 'ATTEST_ASSET', label: 'Attest ownership', variant: 'primary', httpMethod: 'POST',
        apiEndpoint: '/v1/compound-tasks/{taskId}/sections/{sectionKey}/items/{itemId}/complete',
        allowedSides: 'ORGANIZATION', allowedStatusesJson: '["OPEN"]' },
      { actionKey: 'FLAG_ASSET', label: 'Flag for review', variant: 'danger', httpMethod: 'POST',
        apiEndpoint: '/v1/action-items', allowedSides: 'ORGANIZATION', allowedStatusesJson: '["OPEN","ATTESTED"]' },
    ],
  },
}

const ROLE_PROFILES = {
  vendor_responder: {
    label: 'Vendor responder', side: 'VENDOR', stepAction: 'FILL',
    canEdit: true, sod: false,
    visibleTabs: ['overview', 'evidence', 'comments'],
    visibleActions: ['SUBMIT_ANSWER', 'DELEGATE_ITEM'],
    editableFields: ['status', 'evidence', 'notes'],
    note: 'Fills assigned sections. Can delegate individual questions to contributors.',
  },
  vendor_contributor: {
    label: 'Vendor contributor', side: 'VENDOR', stepAction: 'FILL',
    canEdit: true, sod: false,
    visibleTabs: ['overview', 'evidence'],
    visibleActions: ['SUBMIT_ANSWER'],
    editableFields: ['status', 'evidence'],
    note: 'Assigned individual questions only. Cannot see other sections.',
  },
  vendor_vrm: {
    label: 'VRM (coordinator)', side: 'VENDOR', stepAction: 'ACKNOWLEDGE',
    canEdit: false, sod: false,
    visibleTabs: ['overview', 'workflow'],
    visibleActions: [],
    editableFields: [],
    note: 'Acknowledges assessment. No questionnaire access. Sees workflow timeline.',
  },
  vendor_ciso: {
    label: 'Vendor CISO', side: 'VENDOR', stepAction: 'ASSIGN',
    canEdit: false, sod: false,
    visibleTabs: ['overview'],
    visibleActions: ['ASSIGN_RESPONDER'],
    editableFields: [],
    note: 'Assigns sections to responders. No question access.',
  },
  org_reviewer: {
    label: 'Org reviewer', side: 'ORGANIZATION', stepAction: 'REVIEW',
    canEdit: true, sod: false,
    visibleTabs: ['overview', 'evidence', 'comments', 'workflow'],
    visibleActions: ['APPROVE_ANSWER', 'FLAG_FINDING', 'REQUEST_INFO'],
    editableFields: ['evaluation', 'risk_level', 'notes'],
    note: 'Reviews submitted answers. Can approve, flag, or request clarification.',
  },
  org_ciso_sod: {
    label: 'Org CISO (SoD active)', side: 'ORGANIZATION', stepAction: 'EVALUATE',
    canEdit: true, sod: true,
    visibleTabs: ['overview', 'evidence', 'comments', 'workflow'],
    visibleActions: ['FLAG_FINDING'],
    editableFields: ['evaluation', 'risk_level'],
    note: 'SoD rule blocks APPROVE_ANSWER — was involved at an earlier step.',
  },
  auditor: {
    label: 'Auditor', side: 'AUDITOR', stepAction: 'REVIEW',
    canEdit: true, sod: false,
    visibleTabs: ['overview', 'evidence', 'comments'],
    visibleActions: ['RAISE_FINDING', 'APPROVE_ANSWER'],
    editableFields: ['evaluation', 'notes'],
    note: 'External auditor — can raise findings and approve evidence.',
  },
  auditee: {
    label: 'Auditee', side: 'AUDITEE', stepAction: 'FILL',
    canEdit: true, sod: false,
    visibleTabs: ['overview', 'evidence', 'comments'],
    visibleActions: ['SUBMIT_ANSWER', 'DISPUTE_FINDING'],
    editableFields: ['status', 'evidence', 'notes'],
    note: 'Responds to audit requests. Can dispute raised findings.',
  },
}

const MOCK_ITEMS = [
  { id: 1, itemLabel: 'Do you have an ISMS policy?',  status: 'PENDING',   assignedToUserName: null,     hasOpenActionItem: false },
  { id: 2, itemLabel: 'SOC2 Type II compliance status', status: 'COMPLETED', assignedToUserName: 'Alice Chen', hasOpenActionItem: false },
  { id: 3, itemLabel: 'Incident response plan documented?', status: 'PENDING', assignedToUserName: 'Bob Smith', hasOpenActionItem: true },
]

const MOCK_RECORDS = [
  { id: 1, title: 'Payment Gateway Risk',  status: 'IN_REVIEW', priority: 'HIGH',   owner: 'Alice Chen',  dueDate: '2025-09-30' },
  { id: 2, title: 'Vendor Access Control', status: 'OPEN',      priority: 'CRITICAL',owner: 'Bob Smith',   dueDate: '2025-08-15' },
  { id: 3, title: 'Data Retention Policy', status: 'APPROVED',  priority: 'MEDIUM',  owner: 'Carol White', dueDate: '2025-10-01' },
  { id: 4, title: 'API Security Audit',    status: 'DRAFT',     priority: 'LOW',     owner: 'David Lee',   dueDate: '2025-11-30' },
]

const CAPABILITY_TABS = {
  workflow: { label: 'Workflow', icon: GitBranch,
    desc: 'Workflow timeline — current step, participants, SLA, history.',
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  evidence: { label: 'Evidence', icon: FileEdit,
    desc: 'Evidence uploader — auditee uploads files, auditor reviews via EvidenceUploader.',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  comments: { label: 'Comments', icon: Activity,
    desc: 'Comment thread — all sides communicate via CommentFeed.',
    color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
  history: { label: 'History', icon: Flag,
    desc: 'Audit trail — all status changes and actions with timestamps.',
    color: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
  tests: { label: 'Tests', icon: Zap,
    desc: 'Linked test instances — result recording for auditors. AuditTestsTab component.',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  policies: { label: 'Policies', icon: FileText,
    desc: 'Linked policy instances — adequacy review per control. AuditPoliciesTab component.',
    color: 'text-green-400 bg-green-500/10 border-green-500/20' },
}

function isCapabilityTab(tabKey) {
  return tabKey && CAPABILITY_TABS.hasOwnProperty(tabKey.toLowerCase())
}

const LAYOUT_MODES = [
  {
    value: 'FULL_PAGE',
    label: 'Full page',
    Icon: Layout,
    color: 'border-blue-500/40   bg-blue-500/8   text-blue-400',
    dimColor: 'border-border bg-surface-overlay text-text-muted',
    desc: 'Navigates to a new route. Best for complex entities with many tabs (risks, assessments, audits).',
  },
  {
    value: 'DRAWER',
    label: 'Drawer',
    Icon: PanelRight,
    color: 'border-purple-500/40 bg-purple-500/8 text-purple-400',
    dimColor: 'border-border bg-surface-overlay text-text-muted',
    desc: 'Slides in from the right (~480 px). Best for quick edits without losing list context (audit controls, action items).',
  },
  {
    value: 'SIDE_PANEL',
    label: 'Side panel',
    Icon: Columns2,
    color: 'border-teal-500/40   bg-teal-500/8   text-teal-400',
    dimColor: 'border-border bg-surface-overlay text-text-muted',
    desc: 'Persistent panel alongside list (33 vw). Best for step-through workflows (questionnaire review, finding triage).',
  },
]

const FIELD_TYPES = [
  { value: 'TEXT',           label: 'Text',           group: 'Input' },
  { value: 'EMAIL',          label: 'Email',          group: 'Input' },
  { value: 'NUMBER',         label: 'Number',         group: 'Input' },
  { value: 'DECIMAL',        label: 'Decimal',        group: 'Input' },
  { value: 'PHONE',          label: 'Phone',          group: 'Input' },
  { value: 'URL',            label: 'URL',            group: 'Input' },
  { value: 'TEXTAREA',       label: 'Textarea',       group: 'Input' },
  { value: 'RICH_TEXT',      label: 'Rich text',      group: 'Input' },
  { value: 'DATE',           label: 'Date',           group: 'Date' },
  { value: 'DATE_RANGE',     label: 'Date range',     group: 'Date' },
  { value: 'SELECT',         label: 'Select',         group: 'Choice' },
  { value: 'MULTI_SELECT',   label: 'Multi-select',   group: 'Choice' },
  { value: 'RADIO',          label: 'Radio',          group: 'Choice' },
  { value: 'CHECKBOX',       label: 'Checkbox',       group: 'Choice' },
  { value: 'TOGGLE',         label: 'Toggle',         group: 'Choice' },
  { value: 'RATING',         label: 'Rating',         group: 'Choice' },
  { value: 'SLIDER',         label: 'Slider',         group: 'Choice' },
  { value: 'LOOKUP',         label: 'Lookup',         group: 'Relation' },
  { value: 'MULTILINE_LIST', label: 'List (add/remove)',group:'Relation'},
  { value: 'TAG',            label: 'Tag input',      group: 'Relation' },
  { value: 'FILE',           label: 'File upload',    group: 'File' },
  { value: 'FILE_MULTI',     label: 'Multi-file',     group: 'File' },
  { value: 'CURRENCY',       label: 'Currency',       group: 'Special' },
  { value: 'COLOR',          label: 'Color picker',   group: 'Special' },
  { value: 'JSON_EDITOR',    label: 'JSON editor',    group: 'Special' },
  { value: 'SECTION_HEADER', label: 'Section header', group: 'Layout' },
  { value: 'DIVIDER',        label: 'Divider',        group: 'Layout' },
]

const FIELD_TYPE_GROUPS = [...new Set(FIELD_TYPES.map(f => f.group))]

const FIELD_TYPE_COLOR = {
  TEXT: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  EMAIL: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  NUMBER: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  DECIMAL: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  PHONE: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  URL: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  TEXTAREA: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  RICH_TEXT: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  DATE: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  DATE_RANGE: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  SELECT: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  MULTI_SELECT: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  RADIO: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  CHECKBOX: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  TOGGLE: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  RATING: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  SLIDER: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  LOOKUP: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  MULTILINE_LIST: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  TAG: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  FILE: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  FILE_MULTI: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  CURRENCY: 'text-green-400 bg-green-500/10 border-green-500/20',
  COLOR: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
  JSON_EDITOR: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  SECTION_HEADER: 'text-text-muted bg-surface-overlay border-border',
  DIVIDER: 'text-text-muted bg-surface-overlay border-border',
}

const GRID_LABEL = { 3: '¼', 4: '⅓', 6: '½', 8: '⅔', 12: 'full' }


export { SCREEN_TYPES, SIDES, HTTP_METHODS, ACTION_VARIANTS, SCREEN_TEMPLATES,
  ROLE_PROFILES, MOCK_ITEMS, MOCK_RECORDS, CAPABILITY_TABS, isCapabilityTab,
  LAYOUT_MODES, FIELD_TYPES, FIELD_TYPE_GROUPS, FIELD_TYPE_COLOR, GRID_LABEL, inferType }
