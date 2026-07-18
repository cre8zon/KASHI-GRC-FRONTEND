/**
 * ScreenDesignerPage — 3-panel IDE for designing all screen types.
 * Route: /admin/screen-designer
 *
 * SCREEN TYPES (first-class concepts, not generic keys):
 *
 *   SECTION    sectionScreenKey → compound task section container
 *              Configures: header, progress bar, submit action, assignment panel
 *              Links to: itemScreenKey (its items), API submit endpoint
 *
 *   ITEM_CARD  itemScreenKey → individual item within a section (question, control, finding)
 *              Configures: card layout, action buttons, side panel tabs
 *              Referenced by: sectionScreenKey
 *
 *   LIST       listScreenKey → module list page table
 *              Configures: columns, filters, bulk actions, row click behavior
 *              Referenced by: ModuleBlueprint.listScreenKey
 *
 *   DETAIL     detailScreenKey → module detail page
 *              Configures: tabs, field visibility, action buttons, step overrides
 *              Referenced by: ModuleBlueprint.detailScreenKey
 *
 *   FORM       createFormKey / editFormKey → create/edit modals and forms
 *              Configures: field order, visibility, validation, layout
 *              Referenced by: ModuleBlueprint.createFormKey
 *
 *   PAGE       navKey → full page for a workflow step
 *              Configures: layout template, primary section, secondary panels
 *              Referenced by: WorkflowStep.navKey
 *
 * DESIGN PRINCIPLES:
 *   - Click any element on the canvas to configure it in the Inspector
 *   - The canvas renders a type-aware preview (not a generic form)
 *   - Visibility rules (role / workflow step / entity status) live on every element
 *   - Action buttons link to real API endpoints with permission guards
 *   - Screen keys cross-link (Section canvas shows click-through to its itemScreenKey)
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Layers, List, Eye, EyeOff, Plus, Search, Settings, Code2, Copy,
  ChevronRight, ChevronDown, GitBranch, Shield, Users, Zap, X, Save,
  RefreshCw, Lock, Unlock, MousePointerClick, Table2, Layout,
  PanelLeft, FileEdit, Square, ArrowRight, CheckCircle2, AlertTriangle,
  GripVertical, Pencil, Trash2, Link2, ExternalLink, Info, Hash,
  Columns2, SlidersHorizontal, Flag, Tag, Activity, PanelRight,
  // FIX: Calendar and User were used in FormCanvas (DATE field preview) and
  // RoleVisibilityEditor but were missing from the import list.
  Calendar, User,
  FileText,  // for Policies capability tab in DetailCanvas
} from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button }     from '../../../components/ui/Button'
import { Badge }      from '../../../components/ui/Badge'
import { Modal }      from '../../../components/ui/Modal'
import { cn }         from '../../../lib/cn'
import api            from '../../../config/axios.config'
import { useSelector } from 'react-redux'
import toast          from 'react-hot-toast'

// ─── Screen type definitions ──────────────────────────────────────────────────

export const SCREEN_TYPES = {
  SECTION: {
    key: 'SECTION', label: 'Section', icon: Hash,
    color: 'text-status-tag-fg bg-status-tag-bg border-status-tag-bd',
    desc: 'Compound task section container',
    fieldName: 'sectionScreenKey',
    hint: 'Used in WorkflowStepSection.sectionScreenKey',
    canvasType: 'section',
  },
  ITEM_CARD: {
    key: 'ITEM_CARD', label: 'Item card', icon: Square,
    color: 'text-status-info-fg bg-status-info-bg border-status-info-bd',
    desc: 'Individual item within a section (question, control, finding)',
    fieldName: 'itemScreenKey',
    hint: 'Used in WorkflowStepSection.itemScreenKey',
    canvasType: 'item_card',
  },
  LIST: {
    key: 'LIST', label: 'List / table', icon: Table2,
    color: 'text-status-pass-fg bg-status-pass-bg border-status-pass-bd',
    desc: 'Module list page — columns, filters, bulk actions',
    fieldName: 'listScreenKey',
    hint: 'Used in ModuleBlueprint.listScreenKey',
    canvasType: 'list',
  },
  DETAIL: {
    key: 'DETAIL', label: 'Detail page', icon: Layout,
    color: 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd',
    desc: 'Module detail page — tabs, fields, actions',
    fieldName: 'detailScreenKey',
    hint: 'Used in ModuleBlueprint.detailScreenKey',
    canvasType: 'detail',
  },
  FORM: {
    key: 'FORM', label: 'Form / modal', icon: FileEdit,
    color: 'text-brand-400 bg-brand-500/10 border-brand-500/25',
    desc: 'Create/edit form fields and layout',
    fieldName: 'createFormKey / editFormKey',
    hint: 'Used in ModuleBlueprint.createFormKey',
    canvasType: 'form',
  },
  PAGE: {
    key: 'PAGE', label: 'Page', icon: PanelLeft,
    color: 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd',
    desc: 'Full page for a workflow step nav key',
    fieldName: 'navKey',
    hint: 'Used in WorkflowStep.navKey',
    canvasType: 'page',
  },
}

const SIDES = ['ORGANIZATION', 'VENDOR', 'AUDITOR', 'AUDITEE', 'SYSTEM']
const HTTP_METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE']
const ACTION_VARIANTS = ['primary', 'secondary', 'danger', 'warning', 'ghost']

// ─── GRC module templates ─────────────────────────────────────────────────────
// Each template pre-populates the screen config for a common GRC use case.
// Admin picks a template → keys + default actions/components are seeded.

export const SCREEN_TEMPLATES = {
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

// ─── Role profiles for the role simulator ────────────────────────────────────
// Shows exactly what each persona sees on the canvas — tabs, fields, actions.

export const ROLE_PROFILES = {
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



// ─── Mock data for canvas previews ────────────────────────────────────────────

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

// ─── API layer ────────────────────────────────────────────────────────────────

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

// ─── State management for screen registry (client-side) ──────────────────────

function useScreenRegistry() {
  // Derive all screens from the three tables
  const { data: allC } = useQuery({ queryKey: ['sd-all-components'], queryFn: () => api.get('/v1/admin/ui/components', { params: { take: 500 } }), staleTime: 60_000 })
  const { data: allL } = useQuery({ queryKey: ['sd-all-layouts'],    queryFn: () => api.get('/v1/admin/ui/layouts',    { params: { take: 500 } }), staleTime: 60_000 })
  const { data: allA } = useQuery({ queryKey: ['sd-all-actions'],    queryFn: () => api.get('/v1/admin/ui/actions',    { params: { take: 500 } }), staleTime: 60_000 })
  // FIX: include forms so FORM screens appear in sidebar even before they have actions/layouts
  const { data: allF } = useQuery({ queryKey: ['sd-all-forms'],      queryFn: () => api.get('/v1/admin/ui/forms',      { params: { take: 500 } }), staleTime: 30_000 })

  const extract = (d) => d?.data?.items || d?.items || (Array.isArray(d?.data) ? d.data : null) || []

  // Each screen has a key, a type, and a name
  // We store type in layout.screen meta — if not, we infer from naming conventions
  const screens = useMemo(() => {
    const map = new Map()
    extract(allC).forEach(c => c.screen && !map.has(c.screen) && map.set(c.screen, { key: c.screen, type: inferType(c.screen), label: c.screen }))
    extract(allL).forEach(l => {
      const k = l.screen || l.layoutKey
      if (k && !map.has(k)) map.set(k, { key: k, type: l.screenType || inferType(k), label: l.title || k })
    })
    extract(allA).forEach(a => a.screenKey && !map.has(a.screenKey) && map.set(a.screenKey, { key: a.screenKey, type: inferType(a.screenKey), label: a.screenKey }))
    // FIX: formKey is the screen key for FORM screens — include so they show in sidebar
    extract(allF).forEach(f => f.formKey && !map.has(f.formKey) && map.set(f.formKey, { key: f.formKey, type: inferType(f.formKey), label: f.title || f.formKey }))
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
  }, [allC, allL, allA, allF])

  return screens
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

// ─── Main Page ─────────────────────────────────────────────────────────────────
// Full-height custom layout — does NOT use PageLayout so that the topbar,
// key-differentiator bar, tab bar, and role simulator are always visible and
// precisely positioned regardless of whether PageLayout supports an actions prop.

export default function ScreenDesignerPage() {
  const [selectedScreen,   setSelectedScreen]   = useState(null)
  const [selectedElement,  setSelectedElement]  = useState(null)
  const [typeFilter,       setTypeFilter]       = useState(null)
  const [search,           setSearch]           = useState('')
  const [createOpen,       setCreateOpen]       = useState(false)
  const [selectedRole,     setSelectedRole]     = useState('vendor_responder')
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false)
  const [activeTab,        setActiveTab]        = useState('preview')
  const [navOpen,          setNavOpen]          = useState(true)    // left navigator
  const [inspOpen,         setInspOpen]         = useState(true)    // right inspector

  const screens = useScreenRegistry()
  const qc = useQueryClient()

  // selectScreen must be defined before handleCreate (used in its dependency array)
  const selectScreen = useCallback((screen) => {
    setSelectedScreen(screen)
    setSelectedElement(null)
    setActiveTab('preview')
  }, [])

  // Auto-draft: immediately persist a DB record for every new screen so it
  // appears in the sidebar registry and survives a page refresh.
  // FORM  → creates a ui_forms row  (formKey = screen.key)
  // Other → creates an empty ui_layouts row (layoutKey = screen.key) as the anchor
  const handleCreate = useCallback(async (screen) => {
    try {
      if (screen.type === 'FORM') {
        await sdApi.createForm({
          formKey:    screen.key,
          title:      screen.key,
          submitUrl:  '',
          httpMethod: 'POST',
        })
        qc.invalidateQueries({ queryKey: ['sd-all-forms'] })
      } else {
        await api.post('/v1/admin/ui/layouts', {
          layoutKey:      screen.key,
          screen:         screen.key,
          title:          screen.label || screen.key,
          columnsJson:    '[]',
          filtersJson:    '[]',
          roleAccessJson: '{}',
          selectable:     false,
          reorderable:    false,
        })
        qc.invalidateQueries({ queryKey: ['sd-all-layouts'] })
      }
    } catch (e) {
      // Screen may already exist in DB — that is fine, just select it
      console.warn('[Screen Designer] Auto-draft:', e?.response?.data?.message || e.message)
    }
    setCreateOpen(false)
    selectScreen(screen)
  }, [qc, selectScreen])

  const filteredScreens = screens.filter(s =>
    (!typeFilter || s.type === typeFilter) &&
    (!search || s.key.toLowerCase().includes(search.toLowerCase()))
  )

  const screenType = selectedScreen
    ? (SCREEN_TYPES[selectedScreen.type] || SCREEN_TYPES.SECTION)
    : null

  const roleProfile = ROLE_PROFILES[selectedRole]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ══ TOPBAR ══════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 px-4 border-b border-border bg-surface shrink-0" style={{ height: 48 }}>
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-brand-400" />
          <span className="text-sm font-semibold text-text-primary">Screen designer</span>
        </div>

        {/* Key differentiator pills — always visible once a screen is selected */}
        {selectedScreen && (
          <KeyDifferentiatorBar screen={selectedScreen} inline />
        )}

        <div className="flex-1" />

        {/* Panel toggles */}
        <div className="flex items-center gap-1 mr-2">
          <button
            onClick={() => setNavOpen(o => !o)}
            title={navOpen ? 'Hide navigator' : 'Show navigator'}
            className={cn('flex items-center gap-1 h-7 px-2.5 text-[11px] rounded border transition-colors',
              navOpen
                ? 'bg-brand-500/10 border-brand-500/25 text-brand-400'
                : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary')}>
            <PanelLeft size={13} />
          </button>
          <button
            onClick={() => setInspOpen(o => !o)}
            title={inspOpen ? 'Hide inspector' : 'Show inspector'}
            className={cn('flex items-center gap-1 h-7 px-2.5 text-[11px] rounded border transition-colors',
              inspOpen
                ? 'bg-brand-500/10 border-brand-500/25 text-brand-400'
                : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary')}>
            <PanelRight size={13} />
          </button>
        </div>
        <div className="w-px h-5 bg-border mx-1" />

        {/* Role simulator */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-text-muted">Preview as</span>
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
            className="h-7 px-2 text-[11px] bg-surface-overlay border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <optgroup label="Vendor side">
              <option value="vendor_responder">Vendor responder (FILL)</option>
              <option value="vendor_contributor">Vendor contributor (FILL)</option>
              <option value="vendor_vrm">VRM — coordinator (ACKNOWLEDGE)</option>
              <option value="vendor_ciso">Vendor CISO (ASSIGN)</option>
            </optgroup>
            <optgroup label="Org side">
              <option value="org_reviewer">Org reviewer (REVIEW)</option>
              <option value="org_ciso_sod">Org CISO — SoD active (EVALUATE)</option>
            </optgroup>
            <optgroup label="External">
              <option value="auditor">Auditor (REVIEW)</option>
              <option value="auditee">Auditee (FILL)</option>
            </optgroup>
          </select>
          {roleProfile?.sod && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-status-fail-bg border border-status-fail-bd text-status-fail-fg font-medium">
              SoD active
            </span>
          )}
        </div>

        <div className="w-px h-5 bg-border" />

        <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>New screen</Button>
        <button onClick={() => setTemplatePanelOpen(true)}
          className="flex items-center gap-1.5 h-7 px-3 text-[11px] font-medium text-brand-400 bg-brand-500/8 hover:bg-brand-500/15 border border-brand-500/25 hover:border-brand-500/50 rounded transition-colors">
          <Layers size={12} /> Templates
        </button>
      </div>

      {/* ══ BODY: left nav + canvas + inspector ═════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ╔══ LEFT: Navigator (collapsible) ══════════════════════════════╗ */}
        {navOpen && (
          <Navigator
            screens={filteredScreens}
            selectedKey={selectedScreen?.key}
            search={search}
            setSearch={setSearch}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            onSelect={selectScreen}
            onNew={() => setCreateOpen(true)}
            onOpenTemplates={() => setTemplatePanelOpen(true)}
          />
        )}

        {/* ╔══ CENTRE: canvas ════════════════════════════════════════════╗ */}
        <div className="flex-1 overflow-hidden flex flex-col bg-surface">
          {!selectedScreen ? (

            /* ── Landing / template gallery ── */
            <TemplateGallery
              onSelect={(tmpl) => selectScreen({ key: tmpl.itemKey || tmpl.sectionKey, type: tmpl.screenType, label: tmpl.label })}
              onBlank={() => setCreateOpen(true)}
            />

          ) : (
            <>
              {/* Canvas tab bar */}
              <div className="flex items-center border-b border-border/40 bg-surface shrink-0 px-2">
                {[
                  { key: 'preview',  label: 'Preview',  icon: Eye },
                  { key: 'elements', label: 'Elements', icon: Layers },
                  { key: 'json',     label: 'JSON output', icon: Code2 },
                ].map(({ key, label, icon: Icon }) => (
                  <button key={key}
                    onClick={() => setActiveTab(key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 -mb-px transition-colors',
                      activeTab === key
                        ? 'border-brand-400 text-brand-400'
                        : 'border-transparent text-text-muted hover:text-text-secondary'
                    )}>
                    <Icon size={11} />{label}
                  </button>
                ))}
                {/* role note */}
                <div className="ml-auto flex items-center gap-2 pr-3 text-[10px] text-text-muted">
                  {roleProfile?.sod && <span className="text-status-fail-fg font-medium">⚠ SoD active</span>}
                  Previewing as <span className="text-brand-400 font-medium">{roleProfile?.label}</span>
                  <span className="opacity-40">·</span>
                  <span>{roleProfile?.stepAction}</span>
                </div>
              </div>

              {/* Tab panels */}
              {activeTab === 'preview' && (
                <Canvas
                  screen={selectedScreen}
                  screenType={screenType}
                  selectedElement={selectedElement}
                  onSelectElement={setSelectedElement}
                  roleProfile={roleProfile}
                />
              )}
              {activeTab === 'elements' && (
                <ElementsTab
                  screen={selectedScreen}
                  screenType={screenType}
                  selectedElement={selectedElement}
                  onSelectElement={setSelectedElement}
                  roleProfile={roleProfile}
                />
              )}
              {activeTab === 'json' && (
                <JsonPreviewTab screen={selectedScreen} />
              )}
            </>
          )}
        </div>

        {/* ╔══ RIGHT: Inspector (collapsible) ════════════════════════════╗ */}
        {inspOpen && (
          <Inspector
            screen={selectedScreen}
            screenType={screenType}
            selectedElement={selectedElement}
            onSelectElement={setSelectedElement}
            onSelectScreen={selectScreen}
          />
        )}
      </div>

      {createOpen && (
        <CreateScreenModal
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
        />
      )}

      {templatePanelOpen && (
        <TemplatePicker
          onClose={() => setTemplatePanelOpen(false)}
          onApply={(tmpl) => {
            setTemplatePanelOpen(false)
            selectScreen({ key: tmpl.itemKey || tmpl.sectionKey, type: tmpl.screenType, label: tmpl.label })
          }}
        />
      )}
    </div>
  )
}

// ─── Navigator ────────────────────────────────────────────────────────────────

function Navigator({ screens, selectedKey, search, setSearch, typeFilter, setTypeFilter, onSelect, onNew, onOpenTemplates }) {
  return (
    <div className="w-56 shrink-0 border-r border-border flex flex-col overflow-hidden bg-surface">
      {/* Type filter pills */}
      <div className="p-2 border-b border-border">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setTypeFilter(null)}
            className={cn('px-2 py-0.5 rounded text-[9px] font-medium border transition-colors',
              !typeFilter ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-border text-text-muted hover:border-border-strong')}>
            All
          </button>
          {Object.values(SCREEN_TYPES).map(t => (
            <button key={t.key}
              onClick={() => setTypeFilter(f => f === t.key ? null : t.key)}
              className={cn('px-2 py-0.5 rounded text-[9px] font-medium border transition-colors', t.color,
                typeFilter === t.key ? 'opacity-100' : 'opacity-50 hover:opacity-75')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-2 border-b border-border">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search keys…"
            className="w-full pl-6 pr-2 h-6 text-[10px] bg-surface-overlay border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>

      {/* Screen list grouped by type */}
      <div className="flex-1 overflow-y-auto">
        {Object.values(SCREEN_TYPES).map(type => {
          const typeScreens = screens.filter(s => s.type === type.key)
          if (typeFilter && typeFilter !== type.key) return null
          if (typeScreens.length === 0 && typeFilter !== type.key) return null
          const Icon = type.icon
          return (
            <div key={type.key}>
              <div className="flex items-center gap-1.5 px-3 py-1.5 sticky top-0 bg-surface border-b border-border/50">
                <Icon size={10} className={type.color.split(' ')[0]} />
                <span className="text-[9px] font-semibold text-text-muted uppercase tracking-wide">{type.label}</span>
                <span className="ml-auto text-[9px] text-text-muted">{typeScreens.length}</span>
              </div>
              {typeScreens.map(screen => (
                <button key={screen.key}
                  onClick={() => onSelect(screen)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-left border-l-2 transition-colors text-[10px]',
                    selectedKey === screen.key
                      ? 'bg-brand-500/8 border-l-brand-500 text-brand-400'
                      : 'border-l-transparent hover:bg-surface-overlay text-text-secondary hover:text-text-primary'
                  )}>
                  <code className="font-mono truncate">{screen.key}</code>
                </button>
              ))}
              {typeScreens.length === 0 && (
                <button onClick={onNew}
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] text-text-muted hover:text-brand-400 transition-colors">
                  <Plus size={10} /> Add first {type.label.toLowerCase()}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="p-2 border-t border-border space-y-1">
        <button onClick={onOpenTemplates}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-brand-400 hover:text-brand-300 bg-brand-500/8 hover:bg-brand-500/12 border border-brand-500/20 hover:border-brand-500/40 rounded transition-colors font-medium">
          <Layers size={10} /> Templates
        </button>
        <button onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-text-muted hover:text-brand-400 border border-dashed border-border hover:border-brand-500/40 rounded transition-colors">
          <Plus size={10} /> Blank screen
        </button>
      </div>
    </div>
  )
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

function Canvas({ screen, screenType, selectedElement, onSelectElement, roleProfile }) {
  const { data: actionsData } = useQuery({ queryKey: ['sd-actions', screen.key], queryFn: () => sdApi.listActions(screen.key), staleTime: 30_000 })
  const { data: layoutData }  = useQuery({ queryKey: ['sd-layout', screen.key],  queryFn: () => sdApi.getLayout(screen.key),  staleTime: 30_000 })
  const actions = actionsData?.data?.items || actionsData?.items || (Array.isArray(actionsData?.data) ? actionsData.data : null) || []
  const layoutItems = layoutData?.data?.items || layoutData?.items || (Array.isArray(layoutData?.data) ? layoutData.data : null) || []
  const layout = Array.isArray(layoutItems) ? layoutItems[0] : layoutItems

  const canvasProps = { screen, screenType, selectedElement, onSelectElement, actions, layout }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Canvas header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-ctl border text-[10px] font-medium', screenType?.color)}>
            {screenType && <screenType.icon size={11} />}
            {screenType?.label}
          </div>
          <code className="text-xs font-mono text-text-secondary">{screen.key}</code>
          <button onClick={() => { navigator.clipboard.writeText(screen.key); toast.success('Copied') }}
            className="p-1 text-text-muted hover:text-text-primary transition-colors">
            <Copy size={11} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-text-muted">{screenType?.fieldName}</span>
          <a href={`/v1/ui-config/screen/${screen.key}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-brand-400 transition-colors">
            <ExternalLink size={11} /> Preview JSON
          </a>
        </div>
      </div>

      {/* Canvas info bar */}
      <div className="px-4 py-1.5 bg-brand-500/5 border-b border-brand-500/15 text-[10px] text-brand-600 flex items-center gap-2 shrink-0 font-medium">
        <Info size={10} />
        Click any element below to configure it in the Inspector →
        <span className="ml-auto font-mono">{screenType?.hint}</span>
      </div>

      {/* Canvas content — light mockup surface */}
      <div className="flex-1 overflow-auto p-8" style={{ background: "var(--color-background-tertiary)" }}>
        <div className="max-w-2xl mx-auto">
          {screen.type === 'SECTION'   && <SectionCanvas   {...canvasProps} />}
          {screen.type === 'ITEM_CARD' && <ItemCardCanvas  {...canvasProps} />}
          {screen.type === 'LIST'      && <ListCanvas      {...canvasProps} />}
          {screen.type === 'DETAIL'    && <DetailCanvas    {...canvasProps} />}
          {screen.type === 'FORM'      && <FormCanvas      {...canvasProps} />}
          {screen.type === 'PAGE'      && <PageCanvas      {...canvasProps} />}
        </div>
      </div>
    </div>
  )
}

// ─── Canvas implementations ───────────────────────────────────────────────────

function CanvasCard({ children, className, selected, onClick, label, hint }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-card border transition-all',
        onClick ? 'cursor-pointer' : '',
        selected
          ? 'border-brand-500 ring-2 ring-brand-500/20 bg-brand-500/3'
          : onClick ? 'border-border hover:border-brand-500/50 bg-background' : 'border-border bg-background',
        className
      )}
    >
      {(label || hint) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-secondary rounded-t-lg">
          {label && <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{label}</span>}
          {hint  && <span className="text-[10px] text-text-muted font-mono italic">{hint}</span>}
        </div>
      )}
      {children}
    </div>
  )
}

function SectionCanvas({ screen, selectedElement, onSelectElement, actions, layout }) {
  const { data: compData } = useQuery({ queryKey: ['sd-comp', screen.key], queryFn: () => sdApi.listComponents(screen.key), staleTime: 30_000 })
  const components = compData?.data?.items || compData?.items || (Array.isArray(compData?.data) ? compData.data : null) || []

  const submitAction = actions.find(a => ['SUBMIT_SECTION', 'COMPLETE', 'SUBMIT'].includes(a.actionKey))
  const otherActions = actions.filter(a => !['SUBMIT_SECTION', 'COMPLETE', 'SUBMIT'].includes(a.actionKey))

  return (
    <div className="space-y-3">
      {/* Section header — click to configure */}
      <CanvasCard selected={selectedElement?.type === 'section_header'}
        onClick={() => onSelectElement({ type: 'section_header', label: 'Section header', screenKey: screen.key })}
        label="Section header" hint="click to configure">
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChevronRight size={14} className="text-text-muted" />
              <span className="text-sm font-semibold text-text-primary">Questions</span>
              <span className="text-xs text-text-muted">(label from blueprint)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-text-secondary font-medium">0 / 3 items</div>
              <div className="w-16 h-1.5 bg-surface-overlay rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: '0%' }} />
              </div>
            </div>
          </div>
        </div>
      </CanvasCard>

      {/* Item list — click to navigate to itemScreenKey */}
      <CanvasCard label="Item list" hint="itemScreenKey renders each row"
        selected={selectedElement?.type === 'item_list'}
        onClick={() => onSelectElement({ type: 'item_list', label: 'Item list', screenKey: screen.key })}>
        <div className="p-3 space-y-1.5">
          {MOCK_ITEMS.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-card bg-surface border border-border hover:border-brand-500/30 transition-colors">
              <div className={cn('w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                item.status === 'COMPLETED' ? 'bg-status-pass-bg border border-status-pass-bd' : 'border border-border')}>
                {item.status === 'COMPLETED' && <CheckCircle2 size={10} className="text-status-pass-fg" />}
              </div>
              <span className="text-xs text-text-primary flex-1 font-medium">{item.itemLabel}</span>
              {item.hasOpenActionItem && <AlertTriangle size={10} className="text-status-warn-fg" />}
              {item.assignedToUserName && <span className="text-[9px] text-text-muted">{item.assignedToUserName}</span>}
            </div>
          ))}
          <div className="flex items-center gap-1.5 px-3 py-1 text-[9px] text-brand-400 hover:text-brand-300 cursor-pointer">
            <ArrowRight size={10} /> Configure item card in itemScreenKey →
          </div>
        </div>
      </CanvasCard>

      {/* Actions — click to configure each */}
      <CanvasCard label="Actions" hint="click a button to configure it">
        <div className="flex items-center gap-2 p-3 flex-wrap">
          {actions.length === 0 && (
            <div className="flex items-center gap-1.5 text-xs text-text-muted w-full py-3 justify-center border border-dashed border-border rounded-ctl">
              <Plus size={12} /> Add action buttons in Inspector →
            </div>
          )}
          {actions.map(action => (
            <button key={action.id}
              onClick={e => { e.stopPropagation(); onSelectElement({ type: 'action', id: action.id, data: action, screenKey: screen.key }) }}
              className={cn(
                'px-4 py-1.5 rounded-ctl text-xs font-medium border transition-all',
                selectedElement?.type === 'action' && selectedElement?.id === action.id
                  ? 'ring-2 ring-brand-500/60 scale-105'
                  : 'hover:scale-105',
                {
                  primary:   'bg-brand-500/10 border-brand-500/40 text-brand-400',
                  secondary: 'bg-surface-overlay border-border text-text-secondary',
                  danger:    'bg-status-fail-bg border-status-fail-bd text-status-fail-fg',
                  warning:   'bg-status-warn-bg border-status-warn-bd text-status-warn-fg',
                  ghost:     'bg-transparent border-border/40 text-text-muted',
                }[action.variant] || 'bg-surface-overlay border-border text-text-secondary'
              )}>
              {action.label}
            </button>
          ))}
          <button
            onClick={e => { e.stopPropagation(); onSelectElement({ type: 'new_action', screenKey: screen.key }) }}
            className="px-3 py-1.5 rounded-ctl text-xs text-text-muted border border-dashed border-border hover:border-brand-500/40 hover:text-brand-400 transition-colors">
            + Add action
          </button>
        </div>
      </CanvasCard>
    </div>
  )
}

function ItemCardCanvas({ screen, selectedElement, onSelectElement, actions }) {
  return (
    <div className="space-y-3">
      {/* Mock item card */}
      <CanvasCard label="Item card preview" hint="this is what one item looks like">
        <div className="p-4 space-y-3">
          {/* Item header */}
          <CanvasCard selected={selectedElement?.type === 'item_header'}
            onClick={() => onSelectElement({ type: 'item_header', screenKey: screen.key })}>
            <div className="flex items-start gap-3 p-3">
              <div className="w-5 h-5 rounded-full border border-border flex items-center justify-center shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">Do you have an ISMS policy in place?</p>
                <p className="text-xs text-text-muted mt-0.5">Section: Security Controls</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-warn-bg text-status-warn-fg border border-status-warn-bd font-medium">Pending</span>
            </div>
          </CanvasCard>

          {/* Fields / response area */}
          <CanvasCard label="Response area" hint="click to configure fields"
            selected={selectedElement?.type === 'item_fields'}
            onClick={() => onSelectElement({ type: 'item_fields', screenKey: screen.key })}>
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-secondary font-medium w-24 shrink-0">Response</label>
                <select className="flex-1 h-8 px-2 text-xs bg-surface-raised border border-border rounded text-text-primary text-sm focus:ring-1 focus:ring-brand-500 focus:outline-none">
                  <option>Select response…</option>
                  <option>Yes</option><option>No</option><option>Partial</option><option>N/A</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-secondary font-medium w-24 shrink-0">Evidence</label>
                <div className="flex-1 h-8 px-2 border border-dashed border-border rounded flex items-center text-xs text-text-muted bg-surface hover:border-brand-500/40 transition-colors cursor-pointer gap-1.5">
                  <Plus size={12} /> Upload file…
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-secondary font-medium w-24 shrink-0">Notes</label>
                <textarea className="flex-1 px-2 py-1.5 text-xs bg-surface-raised border border-border rounded text-text-primary text-sm resize-none focus:ring-1 focus:ring-brand-500 focus:outline-none" rows={2} placeholder="Add notes…" />
              </div>
            </div>
          </CanvasCard>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {actions.length === 0 && <p className="text-xs text-text-muted italic">No actions configured — add them in Inspector</p>}
            {actions.map(action => (
              <button key={action.id}
                onClick={e => { e.stopPropagation(); onSelectElement({ type: 'action', id: action.id, data: action, screenKey: screen.key }) }}
                className={cn(
                  'px-3 py-1.5 rounded text-xs font-medium border transition-all hover:scale-105',
                  selectedElement?.id === action.id ? 'ring-2 ring-brand-500/60' : '',
                  { primary: 'bg-brand-500/10 border-brand-500/40 text-brand-400', secondary: 'bg-surface-overlay border-border text-text-secondary', danger: 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg' }[action.variant] || 'bg-surface-overlay border-border text-text-secondary'
                )}>
                {action.label}
              </button>
            ))}
            <button onClick={() => onSelectElement({ type: 'new_action', screenKey: screen.key })}
              className="px-2.5 py-1 rounded text-[10px] text-text-muted border border-dashed border-border hover:border-brand-500/40 hover:text-brand-400 transition-colors">
              + Action
            </button>
          </div>
        </div>
      </CanvasCard>

      {/* Side panel tabs */}
      <CanvasCard label="Side panel tabs" hint="click a tab to configure visibility"
        selected={selectedElement?.type === 'side_panel'}
        onClick={() => onSelectElement({ type: 'side_panel', screenKey: screen.key })}>
        <div className="flex items-center gap-0 border-b border-border/40 px-3 pt-2">
          {['Comments', 'Evidence', 'History', 'Action items'].map((tab, i) => (
            <button key={tab}
              onClick={e => { e.stopPropagation(); onSelectElement({ type: 'side_tab', tab, screenKey: screen.key }) }}
              className={cn('px-3 py-1.5 text-[10px] border-b-2 transition-colors -mb-px',
                i === 0 ? 'border-brand-500 text-brand-400' : 'border-transparent text-text-muted hover:text-text-secondary',
                selectedElement?.type === 'side_tab' && selectedElement?.tab === tab ? 'ring-1 ring-brand-500/40 bg-brand-500/5 rounded-t' : '')}>
              {tab}
            </button>
          ))}
        </div>
        <div className="p-3 text-[10px] text-text-muted h-16 flex items-center justify-center">
          Tab content renders at runtime
        </div>
      </CanvasCard>
    </div>
  )
}

function ListCanvas({ screen, selectedElement, onSelectElement, layout, actions }) {
  let columns = []
  try { columns = JSON.parse(layout?.columnsJson || '[]') } catch {}
  if (columns.length === 0) columns = ['title', 'status', 'priority', 'owner', 'dueDate'].map(k => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), type: 'text' }))

  return (
    <div className="space-y-3">
      {/* Table */}
      <CanvasCard label="Table" hint="click a column header to configure it">
        <div className="overflow-x-auto">
          <table className="min-w-full text-[10px]">
            <thead>
              <tr className="border-b border-border bg-surface">
                {columns.map(col => (
                  <th key={col.key}
                    onClick={() => onSelectElement({ type: 'column', data: col, screenKey: screen.key })}
                    className={cn('text-left px-3 py-2.5 text-xs font-semibold text-text-secondary cursor-pointer hover:text-text-primary hover:bg-brand-500/5 transition-colors',
                      selectedElement?.type === 'column' && selectedElement?.data?.key === col.key ? 'bg-brand-500/10 text-brand-400' : '')}>
                    <div className="flex items-center gap-1">
                      {/* Primary columns render bolder in the header too */}
                      <span className={cn(col.isPrimary && 'font-bold text-text-primary', col.monoFont && 'font-mono')}>
                        {col.label || col.key}
                      </span>
                      {/* Type indicators */}
                      {(col.type === 'badge' || col.type === 'select') && <Tag size={9} className="text-text-muted" />}
                      {col.monoFont  && <span className="text-[7px] text-text-muted border border-border/60 rounded px-0.5 leading-tight">mono</span>}
                      {col.isPrimary && <span className="text-[7px] text-text-muted border border-border/60 rounded px-0.5 leading-tight">1°</span>}
                      {col.sortable  && <SlidersHorizontal size={9} className="text-text-muted" />}
                      {col.hidden    && <EyeOff size={9} className="text-text-muted" />}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 cursor-pointer text-text-muted hover:text-brand-400"
                  onClick={() => onSelectElement({ type: 'new_column', screenKey: screen.key })}>
                  <Plus size={11} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {MOCK_RECORDS.slice(0, 3).map(r => (
                <tr key={r.id} className="hover:bg-brand-500/3 transition-colors">
                  {columns.map(col => (
                    <td key={col.key} className={cn(
                      'px-3 py-2.5 text-xs truncate max-w-28',
                      // isPrimary → bold; monoFont → font-mono; both can coexist
                      col.isPrimary ? 'font-semibold text-text-primary' : 'text-text-primary',
                      col.monoFont && 'font-mono text-text-secondary',
                    )}>
                      {col.type === 'badge'
                        ? <span className="px-1.5 py-0.5 rounded bg-status-info-bg text-status-info-fg text-[9px]">{r[col.key] || '—'}</span>
                        : col.type === 'select'
                          ? <span className="px-1.5 py-0.5 rounded bg-status-tag-bg text-status-tag-fg text-[9px]">{r[col.key] || '—'}</span>
                          : (r[col.key] ? String(r[col.key]) : '—')
                      }
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CanvasCard>

      {/* Toolbar actions — renders real configured actions, not a hardcoded button */}
      <CanvasCard label="Toolbar actions" hint="click a button to configure it · click + to add">
        <div className="flex items-center gap-2 p-3 flex-wrap">
          <div className="flex-1 h-8 bg-background border border-border rounded-ctl flex items-center px-2.5 gap-2 min-w-32">
            <Search size={12} className="text-text-muted" />
            <span className="text-xs text-text-muted">Search…</span>
          </div>
          {actions.map(action => (
            <button key={action.id}
              onClick={e => { e.stopPropagation(); onSelectElement({ type: 'action', id: action.id, data: action, screenKey: screen.key }) }}
              className={cn(
                'flex items-center gap-1.5 h-7 px-3 rounded-ctl text-[10px] font-medium border transition-all hover:scale-105',
                selectedElement?.id === action.id ? 'ring-2 ring-brand-500/60' : '',
                {
                  primary:   'bg-brand-500 text-brand-900 border-brand-600',
                  secondary: 'bg-surface-overlay border-border text-text-secondary',
                  danger:    'bg-status-fail-bg border-status-fail-bd text-status-fail-fg',
                  warning:   'bg-status-warn-bg border-status-warn-bd text-status-warn-fg',
                  ghost:     'bg-transparent border-border/40 text-text-muted',
                }[action.variant] || 'bg-brand-500 text-brand-900 border-brand-600'
              )}>
              <Plus size={11} /> {action.label}
            </button>
          ))}
          <button
            onClick={() => onSelectElement({ type: 'new_action', screenKey: screen.key })}
            className="flex items-center gap-1.5 h-7 px-3 border border-dashed border-border text-text-muted hover:border-brand-500/40 hover:text-brand-400 rounded-ctl text-[10px] transition-colors">
            <Plus size={11} /> Add button
          </button>
        </div>
      </CanvasCard>
    </div>
  )
}

// ─── Capability tab metadata ───────────────────────────────────────────────────
const CAPABILITY_TABS = {
  workflow: { label: 'Workflow', icon: GitBranch,
    desc: 'Workflow timeline — current step, participants, SLA, history.',
    color: 'text-status-tag-fg bg-status-tag-bg border-status-tag-bd' },
  evidence: { label: 'Evidence', icon: FileEdit,
    desc: 'Evidence uploader — auditee uploads files, auditor reviews via EvidenceUploader.',
    color: 'text-status-info-fg bg-status-info-bg border-status-info-bd' },
  comments: { label: 'Comments', icon: Activity,
    desc: 'Comment thread — all sides communicate via CommentFeed.',
    color: 'text-brand-400 bg-brand-500/10 border-brand-500/20' },
  history: { label: 'History', icon: Flag,
    desc: 'Audit trail — all status changes and actions with timestamps.',
    color: 'text-text-muted bg-surface-inset border-border' },
  tests: { label: 'Tests', icon: Zap,
    desc: 'Linked test instances — result recording for auditors. AuditTestsTab component.',
    color: 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd' },
  policies: { label: 'Policies', icon: FileText,
    desc: 'Linked policy instances — adequacy review per control. AuditPoliciesTab component.',
    color: 'text-status-pass-fg bg-status-pass-bg border-status-pass-bd' },
}

function isCapabilityTab(tabKey) {
  return tabKey && CAPABILITY_TABS.hasOwnProperty(tabKey.toLowerCase())
}

function DetailCanvas({ screen, selectedElement, onSelectElement, actions, layout }) {
  const DEFAULT_DETAIL_TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'workflow', label: 'Workflow' },
    { key: 'evidence', label: 'Evidence' },
    { key: 'comments', label: 'Comments' },
    { key: 'history',  label: 'History'  },
  ]

  const tabDefs = useMemo(() => {
    try {
      const parsed = JSON.parse(layout?.tabsJson || 'null')
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(t =>
          typeof t === 'string'
            ? { key: t.toLowerCase().replace(/\s+/g, '_'), label: t }
            : { key: t.key || t.label?.toLowerCase().replace(/\s+/g, '_') || 'tab', label: t.label || t.key || 'Tab' }
        )
      }
    } catch {}
    return DEFAULT_DETAIL_TABS
  }, [layout?.tabsJson])

  const [activeTab, setActiveTab] = useState(tabDefs[0]?.label || 'Overview')
  const layoutMode = layout?.layoutMode || 'FULL_PAGE'

  const activeTabDef = tabDefs.find(t => t.label === activeTab) ?? tabDefs[0]
  const activeIsCap  = isCapabilityTab(activeTabDef?.key)
  const capInfo      = activeTabDef ? CAPABILITY_TABS[activeTabDef.key?.toLowerCase()] : null

  // ── Load actual header zone fields ─────────────────────────────────────────
  const headerFormKey = `${screen.key}_header`
  const { data: headerFormRes } = useQuery({
    queryKey: ['sd-form', headerFormKey],
    queryFn:  () => sdApi.getForm(headerFormKey),
    staleTime: 0,
  })
  const headerFormId = useMemo(() => {
    const items = headerFormRes?.items || headerFormRes?.data?.items || []
    return Array.isArray(items) ? (items[0]?.id ?? null) : null
  }, [headerFormRes])
  const { data: headerFieldsRes } = useQuery({
    queryKey: ['sd-form-fields', headerFormId],
    queryFn:  () => sdApi.listFields(headerFormId),
    enabled:  !!headerFormId,
    staleTime: 0,
  })
  const headerFields = useMemo(() => {
    if (!headerFieldsRes) return []
    return Array.isArray(headerFieldsRes) ? headerFieldsRes
         : Array.isArray(headerFieldsRes?.data) ? headerFieldsRes.data : []
  }, [headerFieldsRes])

  // ── Load actual tab content fields for the active configurable tab ─────────
  const activeTabFormKey = (!activeIsCap && activeTabDef?.key)
    ? `${screen.key}_tab_${activeTabDef.key}` : null
  const { data: tabFormRes } = useQuery({
    queryKey: ['sd-form', activeTabFormKey],
    queryFn:  () => sdApi.getForm(activeTabFormKey),
    enabled:  !!activeTabFormKey,
    staleTime: 0,
  })
  const tabFormId = useMemo(() => {
    const items = tabFormRes?.items || tabFormRes?.data?.items || []
    return Array.isArray(items) ? (items[0]?.id ?? null) : null
  }, [tabFormRes])
  const { data: tabFieldsRes } = useQuery({
    queryKey: ['sd-form-fields', tabFormId],
    queryFn:  () => sdApi.listFields(tabFormId),
    enabled:  !!tabFormId,
    staleTime: 0,
  })
  const tabFields = useMemo(() => {
    if (!tabFieldsRes) return []
    return Array.isArray(tabFieldsRes) ? tabFieldsRes
         : Array.isArray(tabFieldsRes?.data) ? tabFieldsRes.data : []
  }, [tabFieldsRes])

  const lmc = {
    FULL_PAGE:  { ring: 'border-status-info-bd   bg-status-info-bg',   chromeBg: 'bg-status-info-bg',   chromeBorder: 'border-status-info-bd',   chromeText: 'text-status-info-fg',   label: 'Full page — navigates to a dedicated route' },
    DRAWER:     { ring: 'border-status-tag-bd bg-status-tag-bg', chromeBg: 'bg-status-tag-bg', chromeBorder: 'border-status-tag-bd', chromeText: 'text-status-tag-fg', label: 'Drawer — ~480px · slides from right' },
    SIDE_PANEL: { ring: 'border-brand-500/20   bg-brand-500/3',   chromeBg: 'bg-brand-500/8',   chromeBorder: 'border-brand-500/15',   chromeText: 'text-brand-400',   label: 'Side panel — permanent · 33vw' },
  }[layoutMode] || { ring: 'border-status-info-bd bg-status-info-bg', chromeBg: 'bg-status-info-bg', chromeBorder: 'border-status-info-bd', chromeText: 'text-status-info-fg', label: '' }

  // ── Shared inner content ────────────────────────────────────────────────────
  const innerContent = (
    <div className="space-y-3 p-3">

      {/* ── Zone 1: Header zone — shows REAL configured fields ── */}
      <CanvasCard
        label="Header zone"
        hint="click to configure header fields"
        selected={selectedElement?.type === 'header_zone'}
        onClick={() => onSelectElement({ type: 'header_zone', screenKey: screen.key })}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Entity Title</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] text-text-secondary">Entity #42 · Created today</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-info-bg text-status-info-fg border border-status-info-bd">IN REVIEW</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {actions.slice(0, 2).map(a => (
                <button key={a.id}
                  onClick={e => { e.stopPropagation(); onSelectElement({ type: 'action', id: a.id, data: a, screenKey: screen.key }) }}
                  className={cn('px-2 py-1 rounded-ctl text-[10px] font-medium border hover:scale-105 transition-all',
                    { primary: 'bg-brand-500/10 border-brand-500/40 text-brand-400', secondary: 'bg-surface-overlay border-border text-text-secondary', danger: 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg' }[a.variant] || 'bg-surface-overlay border-border text-text-secondary')}>
                  {a.label}
                </button>
              ))}
              <button onClick={() => onSelectElement({ type: 'new_action', screenKey: screen.key })}
                className="px-2 py-1 rounded-ctl text-[10px] text-text-muted border border-dashed border-border hover:border-brand-500/40 hover:text-brand-400 transition-colors">
                + Action
              </button>
            </div>
          </div>

          {/* Show REAL header fields if configured, else show placeholder */}
          {headerFields.length > 0 ? (
            <div className="grid grid-cols-12 gap-2 text-[10px]">
              {headerFields.map(f => (
                <div key={f.id}
                  style={{ gridColumn: `span ${Math.max(3, Math.min(f.gridCols || 6, 12))}` }}
                  className="p-1.5 rounded border border-brand-500/20 bg-brand-500/5">
                  <div className="text-brand-400 mb-0.5 font-medium">{f.label}</div>
                  <div className={cn('h-2.5 rounded w-3/4',
                    f.fieldType === 'SELECT' ? 'bg-status-info-bg'
                    : f.fieldType === 'DATE'   ? 'bg-status-info-bg'
                    : 'bg-border/60')} />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              {['Owner', 'Due date', 'Priority'].map(f => (
                <div key={f} className="p-1.5 rounded border border-border bg-surface-overlay opacity-40">
                  <div className="text-text-muted mb-0.5">{f}</div>
                  <div className="h-2.5 bg-border/60 rounded w-3/4" />
                </div>
              ))}
            </div>
          )}
          {headerFields.length === 0 && (
            <p className="text-[9px] text-text-muted mt-2 italic">
              No header fields yet — click this zone → Inspector to add
            </p>
          )}
        </div>
      </CanvasCard>

      {/* ── Zone 2: Tab bar ── */}
      <CanvasCard label="Tabs" hint="click a tab to configure · + Tab to add custom tab">
        <div className="flex items-center gap-0 px-4 border-b border-border flex-wrap">
          {tabDefs.map(tabDef => {
            const isCap = isCapabilityTab(tabDef.key)
            return (
              <button key={tabDef.key}
                onClick={() => {
                  setActiveTab(tabDef.label)
                  onSelectElement({ type: 'tab', tab: tabDef.label, tabKey: tabDef.key, screenKey: screen.key, layout })
                }}
                className={cn('flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                  activeTab === tabDef.label ? 'border-brand-500 text-brand-400' : 'border-transparent text-text-muted',
                  selectedElement?.type === 'tab' && selectedElement?.tab === tabDef.label ? 'bg-brand-500/5 rounded-t' : '')}>
                {tabDef.label}
                {isCap
                  ? <span className="text-[8px] px-1 py-0.5 rounded bg-status-pass-bg text-status-pass-fg">cap</span>
                  : <span className="text-[8px] px-1 py-0.5 rounded bg-status-warn-bg text-status-warn-fg">fields</span>
                }
              </button>
            )
          })}
          <button
            onClick={() => onSelectElement({ type: 'new_detail_tab', screenKey: screen.key, layout })}
            className="ml-1 flex items-center gap-1 px-2.5 py-1.5 -mb-px text-[10px] text-text-muted hover:text-brand-400 border border-dashed border-border/60 hover:border-brand-500/50 rounded-t transition-colors">
            <Plus size={10} /> Tab
          </button>
        </div>

        {/* ── Zone 3: Tab content — capability vs configurable ── */}
        {activeIsCap && capInfo ? (
          <div className="p-4 flex items-start gap-3">
            <div className={cn('w-9 h-9 rounded-card flex items-center justify-center border shrink-0', capInfo.color)}>
              <capInfo.icon size={16} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-text-primary mb-1">{capInfo.label} — capability tab</p>
              <p className="text-[10px] text-text-muted leading-relaxed">{capInfo.desc}</p>
              <p className="text-[9px] text-brand-400 mt-2">
                No field configuration needed — fixed React component. Configure visibility per role in the Inspector.
              </p>
            </div>
          </div>
        ) : tabFields.length > 0 ? (
          // CONFIGURABLE tab — show REAL configured fields
          <div
            className={cn(
              'p-4 cursor-pointer',
              selectedElement?.type === 'detail_tab_content' && selectedElement?.tabKey === activeTabDef?.key
                ? 'bg-brand-500/3' : ''
            )}
            onClick={() => onSelectElement({
              type: 'detail_tab_content', tab: activeTabDef?.label,
              tabKey: activeTabDef?.key, screenKey: screen.key,
              formKey: activeTabFormKey,
            })}>
            <div className="grid grid-cols-12 gap-2 text-[10px]">
              {tabFields.map(f => (
                f.fieldType === 'SECTION_HEADER' ? (
                  <div key={f.id} className="col-span-12 pt-2 pb-1 border-b border-border">
                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{f.label}</span>
                  </div>
                ) : f.fieldType === 'DIVIDER' ? (
                  <div key={f.id} className="col-span-12 h-px bg-border" />
                ) : (
                  <div key={f.id}
                    style={{ gridColumn: `span ${f.gridCols || 12}` }}
                    className="flex flex-col gap-1 p-1.5 rounded border border-brand-500/20 bg-brand-500/5">
                    <div className="text-brand-400 font-medium">{f.label}</div>
                    <div className={cn('h-5 rounded border',
                      f.fieldType === 'SELECT'  ? 'bg-status-info-bg border-status-info-bd'
                      : f.fieldType === 'DATE'    ? 'bg-status-info-bg border-status-info-bd'
                      : f.fieldType === 'TEXTAREA'? 'bg-surface-overlay border-border h-10'
                      : 'bg-background border-border')} />
                  </div>
                )
              ))}
            </div>
            <p className="text-[9px] text-brand-400 mt-3">
              {tabFields.length} field{tabFields.length !== 1 ? 's' : ''} configured · click to edit in Inspector
            </p>
          </div>
        ) : (
          // CONFIGURABLE tab — empty, show prompt
          <div
            className={cn(
              'p-4 min-h-20 border-2 border-dashed border-border/40 rounded-card m-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-brand-500/30 transition-colors',
              selectedElement?.type === 'detail_tab_content' && selectedElement?.tabKey === activeTabDef?.key
                ? 'border-brand-500/40 bg-brand-500/3' : ''
            )}
            onClick={() => onSelectElement({
              type: 'detail_tab_content', tab: activeTabDef?.label,
              tabKey: activeTabDef?.key, screenKey: screen.key,
              formKey: activeTabFormKey,
            })}>
            <Plus size={14} className="text-text-muted" />
            <p className="text-xs text-text-muted text-center">{activeTabDef?.label} tab fields</p>
            <p className="text-[10px] text-text-muted text-center opacity-60">
              Click to configure fields for this tab in the Inspector →
            </p>
          </div>
        )}
      </CanvasCard>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Layout mode badge */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Layout mode:</span>
        <button
          onClick={() => onSelectElement({ type: 'screen_layout_mode', screenKey: screen.key })}
          className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold transition-all hover:opacity-80',
            { FULL_PAGE:  'border-status-info-bd   bg-status-info-bg   text-status-info-fg',
              DRAWER:     'border-status-tag-bd bg-status-tag-bg text-status-tag-fg',
              SIDE_PANEL: 'border-brand-500/40   bg-brand-500/8   text-brand-400', }[layoutMode]
          )}>
          {layoutMode === 'FULL_PAGE'  && <Layout     size={10} />}
          {layoutMode === 'DRAWER'     && <PanelRight size={10} />}
          {layoutMode === 'SIDE_PANEL' && <Columns2   size={10} />}
          {{ FULL_PAGE: 'Full page', DRAWER: 'Drawer', SIDE_PANEL: 'Side panel' }[layoutMode]}
        </button>
        <button
          onClick={() => onSelectElement({ type: 'screen_layout_mode', screenKey: screen.key })}
          className="ml-auto text-[9px] text-brand-400 border border-brand-500/25 rounded px-2 py-0.5 hover:bg-brand-500/5 transition-colors">
          Change mode →
        </button>
      </div>

      {/* FULL_PAGE */}
      {layoutMode === 'FULL_PAGE' && (
        <div className={cn('relative border-2 border-dashed rounded-card overflow-hidden', lmc.ring)}>
          <div className={cn('px-3 py-1.5 border-b text-[9px] font-medium', lmc.chromeBg, lmc.chromeBorder, lmc.chromeText)}>
            {lmc.label}
          </div>
          {innerContent}
        </div>
      )}

      {/* DRAWER */}
      {layoutMode === 'DRAWER' && (
        <div className={cn('relative border-2 border-dashed rounded-card overflow-hidden', lmc.ring)}>
          <div className="flex min-h-40">
            <div className="flex-1 p-4 opacity-25 pointer-events-none">
              <div className="text-[9px] text-text-muted mb-2">List (behind drawer)</div>
              {[1,2,3,4,5].map(i => (
                <div key={i} className="flex items-center gap-3 mb-2 p-2 rounded border border-border bg-surface-overlay">
                  <div className="w-3 h-3 rounded-full bg-border" />
                  <div className="flex-1 h-2 bg-border/60 rounded" />
                </div>
              ))}
            </div>
            <div className="w-[52%] border-l-2 border-status-tag-bd bg-background flex flex-col shrink-0">
              <div className={cn('px-3 py-1.5 border-b flex items-center gap-2 shrink-0', lmc.chromeBg, lmc.chromeBorder)}>
                <PanelRight size={10} className={lmc.chromeText} />
                <span className={cn('text-[9px] font-medium', lmc.chromeText)}>{lmc.label}</span>
                <X size={10} className="text-text-muted ml-auto" />
              </div>
              {innerContent}
            </div>
          </div>
        </div>
      )}

      {/* SIDE_PANEL */}
      {layoutMode === 'SIDE_PANEL' && (
        <div className={cn('relative border-2 border-dashed rounded-card overflow-hidden', lmc.ring)}>
          <div className="flex min-h-40">
            <div className="flex-1 p-4 opacity-40 pointer-events-none">
              <div className="text-[9px] text-text-muted mb-2">List (beside panel)</div>
              {[1,2,3,4,5].map(i => (
                <div key={i}
                  className={cn('flex items-center gap-3 mb-1.5 p-2 rounded border bg-surface-overlay',
                    i === 2 ? 'border-brand-500/40 bg-brand-500/5' : 'border-border')}>
                  <div className="w-3 h-3 rounded-full bg-border" />
                  <div className="flex-1 h-2 bg-border/60 rounded" />
                </div>
              ))}
            </div>
            <div className="w-[48%] border-l-2 border-brand-500/30 bg-background flex flex-col shrink-0">
              <div className={cn('px-3 py-1.5 border-b flex items-center gap-2 shrink-0', lmc.chromeBg, lmc.chromeBorder)}>
                <Columns2 size={10} className={lmc.chromeText} />
                <span className={cn('text-[9px] font-medium', lmc.chromeText)}>{lmc.label}</span>
              </div>
              {innerContent}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FormCanvas({ screen, selectedElement, onSelectElement, actions }) {
  const qc = useQueryClient()

  // ── Load the UiForm row for this exact screen key ─────────────────────────
  // getForm sends ?formKey=issue_create_form&take=1
  // Backend returns ApiResponse<PaginatedResponse<...>> wrapped by axios as:
  //   res.data = { items: [...], pagination: {...} }  ← our standard shape
  const { data: formRes, isLoading: formLoading } = useQuery({
    queryKey: ['sd-form', screen.key],
    queryFn: () => sdApi.getForm(screen.key),
    staleTime: 0,  // always fresh — critical so we get the right form
  })

  // Extract form: handle all axios/ApiResponse wrapping shapes
  const formId = useMemo(() => {
    if (!formRes) return null
    // Shape A: axios returns res.data = PaginatedResponse = { items: [...] }
    const items = formRes?.items || formRes?.data?.items || []
    const first = Array.isArray(items) ? items[0] : null
    return first?.id ?? null
  }, [formRes])

  // Auto-create UiForm row if it doesn't exist for this key
  // Use a ref to prevent the retry loop — mutate only once per mount per key
  const createAttempted = useRef(false)
  const createFormMut = useMutation({
    // Fallback create — fires only if auto-draft in handleCreate failed or user
    // navigated directly to a FORM screen that has no DB record yet.
    mutationFn: () => sdApi.createForm({ formKey: screen.key, title: screen.key, submitUrl: '', httpMethod: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-form', screen.key] }); qc.invalidateQueries({ queryKey: ['sd-all-forms'] }) },
    onError: (e) => {
      // Log but don't retry — admin sees the amber message in Form info card
      console.warn('[Screen Designer] Could not auto-create UiForm:', e?.response?.data?.message || e.message)
    },
    retry: false,  // no automatic retries on failure
  })
  useEffect(() => {
    // Skip if auto-draft already created the form (formId is set) or still loading
    if (!formLoading && !formId && !createAttempted.current) {
      createAttempted.current = true
      createFormMut.mutate()
    }
  }, [formLoading, formId]) // eslint-disable-line

  // ── Load fields for this formId ────────────────────────────────────────────
  // Backend returns ApiResponse<List<...>> = { data: [...] }
  const { data: fieldsRes, refetch: refetchFields } = useQuery({
    queryKey: ['sd-form-fields', formId],
    queryFn: () => sdApi.listFields(formId),
    enabled: !!formId,
    staleTime: 0,
  })
  const fields = useMemo(() => {
    if (!fieldsRes) return []
    // ApiResponse<List> → axios res.data = [...] directly
    const raw = Array.isArray(fieldsRes) ? fieldsRes
               : Array.isArray(fieldsRes?.data) ? fieldsRes.data
               : []
    return raw
  }, [fieldsRes])

  // ── Field type → preview renderer ─────────────────────────────────────────
  const fieldPreview = (f) => {
    switch (f.fieldType) {
      case 'TEXTAREA': return (
        <div className="h-14 bg-background border border-border rounded text-xs text-text-muted flex items-start px-3 py-2">
          {f.placeholder || `Enter ${f.label?.toLowerCase()}…`}
        </div>
      )
      case 'SELECT': case 'MULTI_SELECT': return (
        <div className="h-8 bg-background border border-border rounded text-xs text-text-muted flex items-center px-3 gap-1">
          <span className="flex-1">{f.placeholder || 'Select…'}</span>
          <ChevronDown size={11} className="text-text-muted" />
        </div>
      )
      case 'TOGGLE': return (
        <div className="flex items-center gap-2">
          <div className="w-9 h-5 rounded-full bg-brand-500 flex items-center px-0.5">
            <div className="w-4 h-4 rounded-full bg-surface-raised translate-x-4" />
          </div>
          <span className="text-xs text-text-muted">{f.label}</span>
        </div>
      )
      case 'DATE': return (
        <div className="h-8 bg-background border border-border rounded text-xs text-text-muted flex items-center px-3 gap-2">
          <Calendar size={12} /> {f.placeholder || 'Pick a date'}
        </div>
      )
      case 'SECTION_HEADER': return (
        <div className="py-1 border-b border-border">
          <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{f.label}</span>
        </div>
      )
      case 'DIVIDER': return <div className="h-px bg-border" />
      case 'MULTILINE_LIST': return (
        <div className="border border-border rounded p-2 space-y-1">
          <div className="h-6 bg-background border border-border/50 rounded text-[10px] text-text-muted flex items-center px-2">Item 1</div>
          <button className="text-[10px] text-brand-400">+ Add item</button>
        </div>
      )
      default: return (
        <div className="h-8 bg-background border border-border rounded text-xs text-text-muted flex items-center px-3">
          {f.placeholder || `Enter ${f.label?.toLowerCase() || 'value'}…`}
        </div>
      )
    }
  }

  if (formLoading) return <div className="p-6 text-xs text-text-muted text-center">Loading form…</div>

  return (
    <div className="space-y-3">
      <CanvasCard label="Form fields" hint={`${fields.length} field${fields.length !== 1 ? 's' : ''} · click to configure`}>
        <div className="p-4 space-y-2">
          {fields.length === 0 && (
            <div className="py-6 text-center text-xs text-text-muted border border-dashed border-border rounded-card">
              No fields yet — click &quot;+ Add field&quot; below
            </div>
          )}

          {/* Render fields in a 12-col grid respecting gridCols */}
          <div className="grid grid-cols-12 gap-2">
            {fields.map(f => (
              <div key={f.id}
                onClick={() => onSelectElement({ type: 'form_field', id: f.id, data: { ...f }, screenKey: screen.key, formId })}
                style={{ gridColumn: `span ${f.gridCols || 12}` }}
                className={cn(
                  'flex flex-col gap-1 p-2 rounded-card border transition-all cursor-pointer',
                  selectedElement?.id === f.id
                    ? 'border-brand-500 bg-brand-500/5'
                    : f.fieldType === 'SECTION_HEADER' || f.fieldType === 'DIVIDER'
                      ? 'border-transparent hover:border-border col-span-12'
                      : 'border-transparent hover:border-border'
                )}>
                {f.fieldType !== 'SECTION_HEADER' && f.fieldType !== 'DIVIDER' && f.fieldType !== 'TOGGLE' && (
                  <label className="text-xs font-medium text-text-primary flex items-center gap-1">
                    {f.label}
                    {f.isRequired && <span className="text-status-fail-fg">*</span>}
                    <span className="ml-auto text-[9px] font-mono text-text-muted">{f.fieldType}</span>
                  </label>
                )}
                {fieldPreview(f)}
              </div>
            ))}
          </div>

          <button
            onClick={() => onSelectElement({ type: 'new_form_field', screenKey: screen.key, formId, label: 'New field', onSaved: () => { qc.invalidateQueries({ queryKey: ['sd-form-fields', formId] }) } })}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 mt-2 border-2 border-dashed border-brand-500/30 hover:border-brand-500/60 rounded-card text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors bg-brand-500/3 hover:bg-brand-500/6">
            <Plus size={13} /> Add field
          </button>
        </div>
      </CanvasCard>

      {/* Form action buttons — always rendered at the bottom of every form */}
      <CanvasCard label="Form buttons" hint="Click Submit to configure endpoint · Cancel is built-in · add extra buttons via Inspector">
        <div className="flex items-center gap-3 p-4">
          {/* FIX: Submit is a built-in button wired to the form's submitUrl — clicking it opens
              the form-level submit config inspector (not new_action which is for extra buttons) */}
          <button
            onClick={() => onSelectElement({ type: 'form_submit_config', screenKey: screen.key, formId })}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-ctl text-xs font-medium bg-brand-500 text-brand-900 hover:bg-brand-600 transition-colors',
              selectedElement?.type === 'form_submit_config' ? 'ring-2 ring-brand-500/60' : ''
            )}>
            Submit
          </button>
          <button
            onClick={() => onSelectElement({ type: 'form_cancel_config', screenKey: screen.key })}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-ctl text-xs font-medium border border-border text-text-secondary hover:border-border-strong transition-colors',
              selectedElement?.type === 'form_cancel_config' ? 'ring-2 ring-brand-500/40' : ''
            )}>
            Cancel
          </button>
          {actions.map(action => (
            <button key={action.id}
              onClick={e => { e.stopPropagation(); onSelectElement({ type: 'action', id: action.id, data: action, screenKey: screen.key }) }}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-ctl text-xs font-medium border transition-all hover:scale-105',
                selectedElement?.id === action.id ? 'ring-2 ring-brand-500/60' : '',
                {
                  primary:   'bg-brand-500/10 border-brand-500/40 text-brand-400',
                  secondary: 'bg-surface-overlay border-border text-text-secondary',
                  danger:    'bg-status-fail-bg border-status-fail-bd text-status-fail-fg',
                  warning:   'bg-status-warn-bg border-status-warn-bd text-status-warn-fg',
                  ghost:     'bg-transparent border-border/40 text-text-muted',
                }[action.variant] || 'bg-surface-overlay border-border text-text-secondary'
              )}>
              {action.label}
            </button>
          ))}
          <button
            onClick={e => { e.stopPropagation(); onSelectElement({ type: 'new_action', screenKey: screen.key }) }}
            className="px-3 py-2 rounded-ctl text-xs text-text-muted border border-dashed border-border hover:border-brand-500/40 hover:text-brand-400 transition-colors">
            + Add button
          </button>
        </div>
      </CanvasCard>

      {/* Form metadata */}
      <CanvasCard label="Form info">
        <div className="px-4 py-3 space-y-1 text-[10px] text-text-muted">
          <div className="flex items-center gap-2">
            <span className="font-mono text-brand-400">{screen.key}</span>
            <span>→</span>
            <span>GET /v1/ui-config/form/{screen.key}</span>
          </div>
          <p>Referenced as <code className="font-mono">createFormKey</code> in ModuleBlueprint. DynamicForm renders this at runtime.</p>
          {formId && (
            <p className="text-brand-400 font-mono">formId: {formId} · {fields.length} field{fields.length !== 1 ? 's' : ''}</p>
          )}
          {!formId && !formLoading && (
            <p className="text-status-warn-fg">No UiForm row found — click any field type in Inspector to auto-create</p>
          )}
        </div>
      </CanvasCard>
    </div>
  )
}

function PageCanvas({ screen, selectedElement, onSelectElement, actions }) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] text-text-muted px-1 pb-1">
        Full workflow step page. Configure which sections and panels appear.
      </div>
      <CanvasCard label="Page layout" hint="configure the primary content area">
        <div className="flex gap-3 p-3 min-h-40">
          <div className="flex-1 border border-dashed border-border rounded-card p-3 flex items-center justify-center text-[10px] text-text-muted cursor-pointer hover:border-brand-500/40 hover:text-brand-400 transition-colors"
            onClick={() => onSelectElement({ type: 'page_main', screenKey: screen.key })}>
            Primary content area
          </div>
          <div className="w-44 border border-dashed border-border rounded-card p-3 flex items-center justify-center text-[10px] text-text-muted cursor-pointer hover:border-brand-500/40 hover:text-brand-400 transition-colors"
            onClick={() => onSelectElement({ type: 'page_sidebar', screenKey: screen.key })}>
            Sidebar
          </div>
        </div>
      </CanvasCard>
    </div>
  )
}

// ─── Inspector ────────────────────────────────────────────────────────────────

function Inspector({ screen, screenType, selectedElement, onSelectElement, onSelectScreen }) {
  const qc = useQueryClient()

  if (!screen) {
    return (
      <div className="w-64 shrink-0 border-l border-border bg-surface flex flex-col items-center justify-center p-6 text-center">
        <Settings size={20} className="text-text-muted mb-3" />
        <p className="text-xs font-medium text-text-secondary">Inspector</p>
        <p className="text-[10px] text-text-muted mt-1">Select a screen to start configuring</p>
      </div>
    )
  }

  return (
    <div className="w-72 shrink-0 border-l border-border bg-surface flex flex-col overflow-hidden">
      {/* Inspector header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-1">
          {selectedElement
            ? <span className="text-xs font-semibold text-text-primary">{selectedElement.label || selectedElement.type?.replace(/_/g, ' ')}</span>
            : <span className="text-xs font-semibold text-text-primary">Screen config</span>
          }
          {selectedElement && (
            <button onClick={() => onSelectElement(null)}
              className="ml-auto p-0.5 text-text-muted hover:text-text-primary transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
        {selectedElement && (
          <p className="text-[9px] text-text-muted">{screen.key}</p>
        )}
      </div>

      {/*
        FIX: Stale useState — when the user clicks from element A to element B of the same type
        (e.g. action → action, column → column), React reuses the mounted sub-inspector and
        useState keeps the previous element's values. Adding a unique key here forces React to
        unmount and remount the entire panel content whenever the selected element changes,
        guaranteeing fresh state and resetting the scroll position automatically.
      */}
      <div
        key={selectedElement
          ? `${selectedElement.type}-${selectedElement.id ?? selectedElement.tab ?? selectedElement.data?.key ?? selectedElement.screenKey ?? 'x'}`
          : `none-${screen.key}`}
        className="flex-1 overflow-y-auto"
      >
        {/* No element selected: screen-level config */}
        {!selectedElement && (
          <ScreenLevelInspector screen={screen} screenType={screenType} onSelectScreen={onSelectScreen} />
        )}

        {/* Action selected/new */}
        {(selectedElement?.type === 'action' || selectedElement?.type === 'new_action') && (
          <ActionInspector
            initial={selectedElement?.data}
            screenKey={screen.key}
            onSave={() => { qc.invalidateQueries({ queryKey: ['sd-actions', screen.key] }); onSelectElement(null) }}
          />
        )}

        {/* Column selected/new */}
        {(selectedElement?.type === 'column' || selectedElement?.type === 'new_column') && (
          <ColumnInspector
            initial={selectedElement?.data}
            screenKey={screen.key}
            onSave={() => { qc.invalidateQueries({ queryKey: ['sd-layout', screen.key] }); onSelectElement(null) }}
          />
        )}

        {/* Tab visibility — now receives tabKey and layout for rename/delete */}
        {selectedElement?.type === 'tab' && (
          <TabInspector
            tab={selectedElement.tab}
            tabKey={selectedElement.tabKey}
            screenKey={screen.key}
            layout={selectedElement.layout}
          />
        )}

        {/* New detail tab — add a custom tab to this DETAIL screen's tabsJson */}
        {selectedElement?.type === 'new_detail_tab' && (
          <NewDetailTabInspector
            screenKey={screen.key}
            layout={selectedElement?.layout}
            onSave={() => { qc.invalidateQueries({ queryKey: ['sd-layout', screen.key] }); onSelectElement(null) }}
          />
        )}

        {/* Header zone — configure fields above the tabs (title, status, metadata) */}
        {selectedElement?.type === 'header_zone' && (
          <HeaderZoneInspector
            screenKey={screen.key}
            onSelectElement={onSelectElement}
          />
        )}

        {/* Tab content — configure fields inside a configurable tab (Overview, custom tabs) */}
        {selectedElement?.type === 'detail_tab_content' && (
          <TabContentInspector
            tab={selectedElement.tab}
            tabKey={selectedElement.tabKey}
            screenKey={screen.key}
            onSelectElement={onSelectElement}
          />
        )}

        {/* Section header config */}
        {selectedElement?.type === 'section_header' && (
          <SectionHeaderInspector screenKey={screen.key} />
        )}

        {/* Item fields */}
        {selectedElement?.type === 'item_fields' && (
          <ItemFieldsInspector screenKey={screen.key} />
        )}

        {/* Item list — shows link to itemScreenKey */}
        {selectedElement?.type === 'item_list' && (
          <ItemListInspector screenKey={screen.key} onNavigate={(k) => onSelectScreen({ key: k, type: 'ITEM_CARD' })} />
        )}

        {/* Form field — edit existing or create new */}
        {(selectedElement?.type === 'form_field' || selectedElement?.type === 'new_form_field') && (
          <FormFieldInspector
            initial={selectedElement?.type === 'form_field' ? selectedElement?.data : null}
            formId={selectedElement?.formId}
            screenKey={screen.key}
            onSave={() => {
              const fid = selectedElement?.formId
              qc.invalidateQueries({ queryKey: ['sd-form-fields', fid] })
              qc.invalidateQueries({ queryKey: ['sd-form', screen.key] })
              onSelectElement(null)
            }}
          />
        )}

        {/* FIX: Form submit config — configure the built-in Submit button's endpoint */}
        {selectedElement?.type === 'form_submit_config' && (
          <FormSubmitInspector
            screenKey={screen.key}
            onSave={() => {
              qc.invalidateQueries({ queryKey: ['sd-form', screen.key] })
              onSelectElement(null)
            }}
          />
        )}

        {/* FIX: Form cancel config — Cancel is purely client-side (close modal / navigate back) */}
        {selectedElement?.type === 'form_cancel_config' && (
          <div className="p-4 space-y-3">
            <InspectorSection title="Cancel button">
              <p className="text-[10px] text-text-muted">
                The Cancel button is built-in. It closes the modal or navigates the user back —
                no API call is made. No configuration is required.
              </p>
            </InspectorSection>
          </div>
        )}

        {/* Layout mode inspector — clicking the mode badge in DetailCanvas */}
        {selectedElement?.type === 'screen_layout_mode' && (
          <LayoutModeInspector screenKey={selectedElement.screenKey || screen.key} />
        )}

        {/* Generic selected elements with visibility rules */}
        {['side_panel', 'side_tab', 'item_header', 'page_main', 'page_sidebar'].includes(selectedElement?.type) && (
          <GenericElementInspector element={selectedElement} screenKey={screen.key} />
        )}
      </div>
    </div>
  )
}

// ─── Inspector panels ─────────────────────────────────────────────────────────

function ScreenLevelInspector({ screen, screenType, onSelectScreen }) {
  return (
    <div className="p-4 space-y-5">
      {/* Type + key */}
      <InspectorSection title="Identity">
        <Row label="Screen key">
          <code className="text-[10px] font-mono text-brand-400">{screen.key}</code>
        </Row>
        <Row label="Type">
          {screenType && (
            <span className={cn('text-[10px] px-2 py-0.5 rounded border font-medium', screenType.color)}>
              {screenType.label}
            </span>
          )}
        </Row>
        <Row label="Referenced as">
          <code className="text-[9px] font-mono text-text-muted">{screenType?.fieldName}</code>
        </Row>
      </InspectorSection>

      {/* Role visibility */}
      <RoleVisibilityEditor screenKey={screen.key} />

      {/* Layout mode — DETAIL screens only */}
      {screen.type === 'DETAIL' && (
        <LayoutModeInspector screenKey={screen.key} />
      )}

      {/* Cross-links */}
      {screen.type === 'SECTION' && (
        <InspectorSection title="Linked screens">
          <p className="text-[10px] text-text-muted mb-2">Items in this section render with:</p>
          <button
            onClick={() => onSelectScreen({ key: screen.key.replace('_section', '_item').replace('section_', 'item_'), type: 'ITEM_CARD' })}
            className="w-full flex items-center gap-2 p-2 rounded border border-brand-500/20 bg-brand-500/5 text-[10px] text-brand-400 hover:bg-brand-500/10 transition-colors">
            <ArrowRight size={11} />
            <span>itemScreenKey →</span>
            <code className="font-mono ml-auto">{screen.key.replace('_section', '_item').replace('section_', 'item_')}</code>
          </button>
        </InspectorSection>
      )}

      {/* Live endpoint */}
      <InspectorSection title="Endpoint">
        <div className="flex items-center gap-2 p-2 rounded bg-surface-overlay border border-border">
          <code className="text-[9px] font-mono text-text-muted flex-1 truncate">GET /v1/ui-config/screen/{screen.key}</code>
          <a href={`/v1/ui-config/screen/${screen.key}`} target="_blank" rel="noreferrer">
            <ExternalLink size={11} className="text-text-muted hover:text-brand-400 transition-colors" />
          </a>
        </div>
      </InspectorSection>
    </div>
  )
}

function ActionInspector({ initial, screenKey, onSave }) {
  const qc = useQueryClient()

  // Extract __formKey from payloadTemplateJson if it was set as a form-opening action
  const initialFormKey = useMemo(() => {
    try { return JSON.parse(initial?.payloadTemplateJson || '{}').__formKey || '' } catch { return '' }
  }, [initial?.payloadTemplateJson])

  const [form, setForm] = useState({
    actionKey: '', label: '', icon: '', variant: 'primary',
    httpMethod: 'POST', apiEndpoint: '', payloadTemplateJson: '',
    requiredPermission: '', allowedSides: '',
    allowedStatusesJson: '', requiresConfirmation: false,
    confirmationMessage: '', requiresRemarks: false,
    sortOrder: 0, isActive: true,
    ...initial,
    // Remove __formKey from payloadTemplateJson to show raw template in the textarea
    payloadTemplateJson: (() => {
      try {
        const p = JSON.parse(initial?.payloadTemplateJson || '{}')
        const { __formKey, __navRoute, ...rest } = p
        return Object.keys(rest).length > 0 ? JSON.stringify(rest) : ''
      } catch { return initial?.payloadTemplateJson || '' }
    })(),
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const [formKey, setFormKey] = useState(initialFormKey)

  const saveMut = useMutation({
    mutationFn: () => {
      // Build final payloadTemplateJson — if formKey is set, embed __formKey;
      // otherwise use the raw payloadTemplateJson textarea. Both can coexist.
      let finalPayload = form.payloadTemplateJson?.trim() || ''
      if (formKey?.trim()) {
        try {
          const existing = finalPayload ? JSON.parse(finalPayload) : {}
          finalPayload = JSON.stringify({ __formKey: formKey.trim(), ...existing })
        } catch {
          finalPayload = JSON.stringify({ __formKey: formKey.trim() })
        }
      }
      const body = { ...form, payloadTemplateJson: finalPayload || null, screenKey }
      return initial?.id
        ? api.put(`/v1/admin/ui/actions/${initial.id}`, body)
        : api.post('/v1/admin/ui/actions', body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-actions', screenKey] }); toast.success('Action saved'); onSave() },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/v1/admin/ui/actions/${initial.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-actions', screenKey] }); toast.success('Deleted'); onSave() },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  return (
    <div className="p-4 space-y-4">
      <InspectorSection title="Button">
        <IField label="Action key">
          <IInp value={form.actionKey} onChange={v => set('actionKey', v.toUpperCase().replace(/\s/g,'_'))} placeholder="SUBMIT_ANSWER" mono />
        </IField>
        <IField label="Label">
          <IInp value={form.label} onChange={v => set('label', v)} placeholder="Submit answer" />
        </IField>
        <IField label="Variant">
          <ISel value={form.variant} onChange={v => set('variant', v)} options={ACTION_VARIANTS.map(v => ({ value: v, label: v }))} />
        </IField>
        <IField label="Sort order">
          <IInp value={String(form.sortOrder)} onChange={v => set('sortOrder', parseInt(v)||0)} />
        </IField>
      </InspectorSection>

      {/* Action type — determines what happens when the button is clicked.
          Three types, driven by payloadTemplateJson convention so no backend changes needed:
            Opens form  → sets {"__formKey":"issue_create_form"} — opens DynamicForm modal
            Direct API  → standard POST/PUT/PATCH to apiEndpoint
          NavRoute is set via payloadTemplateJson directly: {"__navRoute":"/module/issue"} */}
      <InspectorSection title="Action type">
        <IField label="Opens form (form key)">
          <IInp value={formKey} onChange={setFormKey}
            placeholder="issue_create_form · issue_rca_form · issue_remediation_form" mono />
          <p className="text-[9px] text-text-muted mt-0.5">
            Set to open a DynamicForm modal instead of a direct API call.
            The form's <code className="font-mono">submitUrl</code> is overridden by the URL below.
          </p>
        </IField>
        {formKey && (
          <div className="px-2 py-1.5 rounded bg-brand-500/5 border border-brand-500/20 text-[9px] text-brand-400 font-mono">
            {"{"}&quot;__formKey&quot;:&quot;{formKey}&quot;{"}"} → stored in payloadTemplateJson
          </div>
        )}
      </InspectorSection>

      <InspectorSection title="API endpoint">
        <IField label="Method">
          <ISel value={form.httpMethod} onChange={v => set('httpMethod', v)} options={HTTP_METHODS.map(m => ({ value: m, label: m }))} />
        </IField>
        <IField label="URL">
          <IInp value={form.apiEndpoint} onChange={v => set('apiEndpoint', v)} placeholder="/v1/compound-tasks/{taskId}/..." mono />
          <p className="text-[9px] text-text-muted mt-0.5">Use {'{id}'}, {'{taskId}'}, {'{sectionKey}'}</p>
        </IField>
        <IField label="Extra payload (JSON)">
          <textarea value={form.payloadTemplateJson} onChange={e => set('payloadTemplateJson', e.target.value)}
            rows={2} placeholder='{"transition":"TRIAGE"}'
            className="w-full px-2 py-1.5 text-[10px] font-mono bg-surface-overlay border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
          <p className="text-[9px] text-text-muted mt-0.5">Merged with form data on submit. Do not set __formKey here — use the field above.</p>
        </IField>
      </InspectorSection>

      <InspectorSection title="Visibility rules">
        <IField label="Permission">
          <IInp value={form.requiredPermission} onChange={v => set('requiredPermission', v)} placeholder="risk.approve" mono />
          <p className="text-[9px] text-text-muted mt-0.5">Blank = no permission check</p>
        </IField>
        <IField label="Allowed sides">
          <div className="flex flex-wrap gap-1">
            {SIDES.map(s => {
              const sides = (form.allowedSides||'').split(',').filter(Boolean)
              const active = sides.includes(s)
              return (
                <button key={s} onClick={() => set('allowedSides', (active ? sides.filter(x=>x!==s) : [...sides,s]).join(','))}
                  className={cn('px-1.5 py-0.5 rounded text-[8px] border transition-colors',
                    active ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-border text-text-muted hover:border-border-strong')}>
                  {s}
                </button>
              )
            })}
          </div>
        </IField>
        <IField label="Status guard (JSON array)">
          <IInp value={form.allowedStatusesJson} onChange={v => set('allowedStatusesJson', v)} placeholder='["PENDING","IN_PROGRESS"]' mono />
          <p className="text-[9px] text-text-muted mt-0.5">Blank = always visible</p>
        </IField>
        <div className="space-y-1.5 pt-1">
          {[
            { k: 'requiresRemarks', l: 'Requires remarks' },
            { k: 'requiresConfirmation', l: 'Confirmation dialog' },
            { k: 'isActive', l: 'Active' },
          ].map(({k,l}) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} className="h-3 w-3 accent-brand-500" />
              <span className="text-[10px] text-text-secondary">{l}</span>
            </label>
          ))}
        </div>
        {form.requiresConfirmation && (
          <IField label="Confirmation message">
            <IInp value={form.confirmationMessage} onChange={v => set('confirmationMessage', v)} placeholder="Are you sure?" />
          </IField>
        )}
      </InspectorSection>

      {/* Workflow step visibility */}
      <WorkflowStepVisibility screenKey={screenKey} actionKey={form.actionKey} />

      {/* Save / delete */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        {initial?.id && (
          <button onClick={() => deleteMut.mutate()} className="p-1.5 text-text-muted hover:text-status-fail-fg transition-colors">
            <Trash2 size={14} />
          </button>
        )}
        <Button size="sm" icon={Save} loading={saveMut.isPending} onClick={() => saveMut.mutate()} className="flex-1">
          Save action
        </Button>
      </div>
    </div>
  )
}


// ─── HeaderZoneInspector ─────────────────────────────────────────────────────
// Shown when the "Header zone" card is clicked in DetailCanvas.
// The header zone has its own UiForm record (formKey = {screenKey}_header).
// Fields added here appear above the tabs on the detail page — title field,
// status badge, owner, due date, etc.
// Reuses the exact same FormFieldInspector flow as the FORM screen type.

function HeaderZoneInspector({ screenKey, onSelectElement }) {
  const qc = useQueryClient()

  // Load (or create) the UiForm for the header zone
  const formKey = `${screenKey}_header`
  const { data: formRes, isLoading } = useQuery({
    queryKey: ['sd-form', formKey],
    queryFn:  () => sdApi.getForm(formKey),
    staleTime: 0,
  })
  const formId = useMemo(() => {
    const items = formRes?.items || formRes?.data?.items || []
    return Array.isArray(items) ? items[0]?.id ?? null : null
  }, [formRes])

  // Auto-create the UiForm if it doesn't exist yet
  const createAttempted = useRef(false)
  const createMut = useMutation({
    mutationFn: () => sdApi.createForm({ formKey, title: `${screenKey} header fields`, submitUrl: '', httpMethod: 'PUT' }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['sd-form', formKey] }) },
    retry: false,
  })
  useEffect(() => {
    if (!isLoading && !formId && !createAttempted.current) {
      createAttempted.current = true
      createMut.mutate()
    }
  }, [isLoading, formId])

  // Load fields
  const { data: fieldsRes, refetch } = useQuery({
    queryKey: ['sd-form-fields', formId],
    queryFn:  () => sdApi.listFields(formId),
    enabled:  !!formId,
    staleTime: 0,
  })
  const fields = useMemo(() => {
    if (!fieldsRes) return []
    return Array.isArray(fieldsRes) ? fieldsRes : Array.isArray(fieldsRes?.data) ? fieldsRes.data : []
  }, [fieldsRes])

  if (isLoading) return <div className="p-4 text-xs text-text-muted">Loading…</div>

  return (
    <div className="p-4 space-y-4">
      <InspectorSection title="Header zone fields">
        <p className="text-[10px] text-text-muted leading-relaxed mb-3">
          Fields that appear above the tabs — always visible to all roles.
          Typical: title, status badge, owner, created date, ID number.
          Stored as <code className="font-mono">UiFormField</code> rows under key{' '}
          <code className="font-mono text-brand-400">{formKey}</code>.
        </p>

        {/* Field list */}
        {fields.length === 0 ? (
          <div className="text-[11px] text-text-muted py-4 text-center border border-dashed border-border rounded-card">
            No header fields yet — click "+ Add field" below
          </div>
        ) : (
          <div className="space-y-1">
            {fields.map(f => (
              <button key={f.id}
                onClick={() => onSelectElement({ type: 'form_field', id: f.id, data: f, screenKey: formKey, formId })}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-card border border-border hover:border-brand-500/30 bg-background text-left transition-all">
                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border bg-status-info-bg border-status-info-bd text-status-info-fg shrink-0">{f.fieldType}</span>
                <span className="text-xs text-text-primary font-medium flex-1">{f.label}</span>
                <span className="text-[9px] font-mono text-text-muted">{f.fieldKey}</span>
                {f.isRequired && <span className="text-[9px] text-status-fail-fg">req</span>}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => onSelectElement({ type: 'new_form_field', screenKey: formKey, formId,
            onSaved: () => qc.invalidateQueries({ queryKey: ['sd-form-fields', formId] }) })}
          className="w-full flex items-center justify-center gap-1.5 py-2 mt-1 border-2 border-dashed border-brand-500/25 hover:border-brand-500/50 rounded-card text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors bg-brand-500/3">
          <Plus size={12} /> Add header field
        </button>
      </InspectorSection>

      <InspectorSection title="Common header fields">
        <p className="text-[9px] text-text-muted mb-2">Click to add a pre-configured field:</p>
        <div className="flex flex-wrap gap-1">
          {[
            { key: 'title',      label: 'Title',       type: 'TEXT'   },
            { key: 'status',     label: 'Status',      type: 'SELECT' },
            { key: 'ownerId',    label: 'Owner',       type: 'LOOKUP' },
            { key: 'dueDate',    label: 'Due date',    type: 'DATE'   },
            { key: 'priority',   label: 'Priority',    type: 'SELECT' },
            { key: 'ref',        label: 'Reference #', type: 'TEXT'   },
          ].map(preset => (
            <button key={preset.key}
              disabled={!formId}
              onClick={async () => {
                if (!formId) return
                try {
                  await sdApi.createField({
                    formId, fieldKey: preset.key, fieldType: preset.type,
                    label: preset.label, sortOrder: fields.length, gridCols: 6,
                  })
                  qc.invalidateQueries({ queryKey: ['sd-form-fields', formId] })
                  toast.success(`Added "${preset.label}" field`)
                } catch (e) { toast.error(e?.response?.data?.message || 'Failed') }
              }}
              className="px-2 py-0.5 rounded text-[9px] border border-border bg-surface-overlay text-text-muted hover:border-brand-500/40 hover:text-brand-400 transition-colors disabled:opacity-40">
              + {preset.label}
            </button>
          ))}
        </div>
      </InspectorSection>
    </div>
  )
}

// ─── TabContentInspector ──────────────────────────────────────────────────────
// Shown when a configurable tab's content area is clicked in DetailCanvas.
// Capability tabs (Evidence, Comments, Tests, Policies, Workflow, History) never
// reach this inspector — they show a read-only info card instead.
// For Overview and custom tabs: manages UiFormField rows keyed by
//   {screenKey}_tab_{tabKey}  (e.g. audit_engagement_detail_tab_overview)

function TabContentInspector({ tab, tabKey, screenKey, onSelectElement }) {
  const qc = useQueryClient()
  const formKey = `${screenKey}_tab_${tabKey}`

  // Load (or auto-create) the UiForm for this tab
  const { data: formRes, isLoading } = useQuery({
    queryKey: ['sd-form', formKey],
    queryFn:  () => sdApi.getForm(formKey),
    staleTime: 0,
  })
  const formId = useMemo(() => {
    const items = formRes?.items || formRes?.data?.items || []
    return Array.isArray(items) ? items[0]?.id ?? null : null
  }, [formRes])

  const createAttempted = useRef(false)
  const createMut = useMutation({
    mutationFn: () => sdApi.createForm({ formKey, title: `${tab} tab fields`, submitUrl: '', httpMethod: 'PUT' }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['sd-form', formKey] }),
    retry: false,
  })
  useEffect(() => {
    if (!isLoading && !formId && !createAttempted.current) {
      createAttempted.current = true
      createMut.mutate()
    }
  }, [isLoading, formId])

  const { data: fieldsRes } = useQuery({
    queryKey: ['sd-form-fields', formId],
    queryFn:  () => sdApi.listFields(formId),
    enabled:  !!formId,
    staleTime: 0,
  })
  const fields = useMemo(() => {
    if (!fieldsRes) return []
    return Array.isArray(fieldsRes) ? fieldsRes : Array.isArray(fieldsRes?.data) ? fieldsRes.data : []
  }, [fieldsRes])

  if (isLoading) return <div className="p-4 text-xs text-text-muted">Loading…</div>

  return (
    <div className="p-4 space-y-4">
      <InspectorSection title={`${tab} tab — content fields`}>
        <p className="text-[10px] text-text-muted leading-relaxed mb-3">
          Fields rendered inside the <strong className="font-medium text-text-secondary">{tab}</strong> tab.
          Each field is role/step aware — configure visibility per role in the field inspector.
          Stored under form key{' '}
          <code className="font-mono text-brand-400 text-[9px]">{formKey}</code>.
        </p>

        {fields.length === 0 ? (
          <div className="text-[11px] text-text-muted py-4 text-center border border-dashed border-border rounded-card">
            No fields yet — click "+ Add field" below
          </div>
        ) : (
          <div className="space-y-1">
            {fields.map(f => (
              <button key={f.id}
                onClick={() => onSelectElement({ type: 'form_field', id: f.id, data: f, screenKey: formKey, formId })}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-card border border-border hover:border-brand-500/30 bg-background text-left transition-all">
                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border bg-status-info-bg border-status-info-bd text-status-info-fg shrink-0">{f.fieldType}</span>
                <span className="text-xs text-text-primary font-medium flex-1">{f.label}</span>
                <span className="text-[9px] font-mono text-text-muted">{f.fieldKey}</span>
                {f.isRequired && <span className="text-[9px] text-status-fail-fg">req</span>}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => onSelectElement({ type: 'new_form_field', screenKey: formKey, formId,
            onSaved: () => qc.invalidateQueries({ queryKey: ['sd-form-fields', formId] }) })}
          className="w-full flex items-center justify-center gap-1.5 py-2 mt-1 border-2 border-dashed border-brand-500/25 hover:border-brand-500/50 rounded-card text-xs text-brand-400 font-medium transition-colors bg-brand-500/3">
          <Plus size={12} /> Add field to {tab} tab
        </button>
      </InspectorSection>

      {/* Role visibility — who can see this tab's content */}
      <RoleVisibilityEditor screenKey={`${screenKey}_tab_${tabKey}`} />
    </div>
  )
}


// ─── FormFieldInspector ───────────────────────────────────────────────────────
// Shown in Inspector when a form field is selected or "+ Add field" clicked.
// Saves to POST/PUT /v1/admin/ui/form-fields — powers DynamicForm at runtime.

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

function FormFieldInspector({ initial, formId, screenKey, onSave }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    fieldKey:             initial?.fieldKey     || '',
    fieldType:            initial?.fieldType    || 'TEXT',
    label:                initial?.label        || '',
    placeholder:          initial?.placeholder  || '',
    helperText:           initial?.helperText   || '',
    isRequired:           initial?.isRequired   || false,
    gridCols:             initial?.gridCols     || 12,
    sortOrder:            initial?.sortOrder    || 0,
    optionsComponentKey:  initial?.optionsComponentKey || '',
    validationRulesJson:  initial?.validationRulesJson || null,
    dependsOnJson:        initial?.dependsOnJson || null,
    rowsCount:            initial?.rowsCount    || '',
    minValue:             initial?.minValue     || '',
    maxValue:             initial?.maxValue     || '',
    lookupEntityType:     initial?.lookupEntityType || '',
    tagSuggestions:       initial?.tagSuggestions || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const saveMut = useMutation({
    mutationFn: () => {
      if (!formId) {
        return Promise.reject(new Error('Form not ready yet — wait a moment and try again'))
      }
      const payload = {
        ...form,
        formId,
        gridCols:  Number(form.gridCols)  || 12,
        sortOrder: Number(form.sortOrder) || 0,
        rowsCount: form.rowsCount ? Number(form.rowsCount) : null,
        minValue:  form.minValue  ? Number(form.minValue)  : null,
        maxValue:  form.maxValue  ? Number(form.maxValue)  : null,
        // FIX: MySQL JSON columns reject empty string "" — send null when blank
        validationRulesJson: form.validationRulesJson?.trim() || null,
        dependsOnJson:       form.dependsOnJson?.trim()       || null,
      }
      return initial?.id
        ? sdApi.updateField(initial.id, payload)
        : sdApi.createField(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sd-form-fields', formId] })
      qc.invalidateQueries({ queryKey: ['sd-form', undefined] })
      toast.success(initial?.id ? 'Field updated' : 'Field added')
      onSave()
    },
    onError:   (e) => toast.error(e?.response?.data?.message || 'Failed to save field'),
  })

  const deleteMut = useMutation({
    mutationFn: () => sdApi.deleteField(initial.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-form-fields', formId] }); toast.success('Field deleted'); onSave() },
    onError:   (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  const needsOptions     = ['SELECT','MULTI_SELECT','RADIO','CHECKBOX'].includes(form.fieldType)
  const needsLookup      = form.fieldType === 'LOOKUP'
  const needsRows        = ['TEXTAREA','RICH_TEXT','JSON_EDITOR'].includes(form.fieldType)
  const needsRange       = ['SLIDER','RATING'].includes(form.fieldType)
  const needsTags        = form.fieldType === 'TAG'
  const isLayoutOnly     = ['SECTION_HEADER','DIVIDER'].includes(form.fieldType)

  return (
    <div className="p-4 space-y-4">

      {/* Field type — grouped */}
      <InspectorSection title="Field type">
        {!initial && !form.fieldType && (
          <p className="text-[10px] text-brand-400 font-medium mb-2">← Pick a type to start</p>
        )}
        <div className="space-y-2">
          {FIELD_TYPE_GROUPS.map(group => (
            <div key={group}>
              <p className="text-[8px] font-semibold text-text-muted uppercase tracking-wider mb-1">{group}</p>
              <div className="flex flex-wrap gap-1">
                {FIELD_TYPES.filter(t => t.group === group).map(t => (
                  <button key={t.value}
                    onClick={() => set('fieldType', t.value)}
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[9px] border transition-colors',
                      form.fieldType === t.value
                        ? 'bg-brand-500/15 border-brand-500/40 text-brand-400 font-medium'
                        : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary'
                    )}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </InspectorSection>

      {/* Core identity */}
      <InspectorSection title="Identity">
        <IField label="Field key (API param name)">
          <IInp value={form.fieldKey} onChange={v => set('fieldKey', v.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="issueType or issue_type" mono />
          <p className="text-[9px] text-text-muted mt-0.5">Maps to the JSON body key sent to the API</p>
        </IField>
        {!isLayoutOnly && (
          <IField label="Label">
            <IInp value={form.label} onChange={v => set('label', v)} placeholder="Issue type" />
          </IField>
        )}
        {isLayoutOnly && (
          <IField label="Section title">
            <IInp value={form.label} onChange={v => set('label', v)} placeholder="Root cause analysis" />
          </IField>
        )}
        {!isLayoutOnly && (
          <IField label="Placeholder">
            <IInp value={form.placeholder} onChange={v => set('placeholder', v)} placeholder="Select issue type…" />
          </IField>
        )}
        {!isLayoutOnly && (
          <IField label="Helper text">
            <IInp value={form.helperText} onChange={v => set('helperText', v)} placeholder="Brief instructions shown below the field" />
          </IField>
        )}
      </InspectorSection>

      {/* Layout */}
      <InspectorSection title="Layout">
        <IField label="Grid width (of 12 columns)">
          <div className="flex gap-1 flex-wrap">
            {[3,4,6,8,12].map(n => (
              <button key={n}
                onClick={() => set('gridCols', n)}
                className={cn('px-2 py-0.5 rounded text-[9px] border transition-colors',
                  form.gridCols === n
                    ? 'bg-brand-500/15 border-brand-500/40 text-brand-400 font-medium'
                    : 'border-border text-text-muted hover:border-border-strong')}>
                {n === 3 ? '¼' : n === 4 ? '⅓' : n === 6 ? '½' : n === 8 ? '⅔' : 'Full'} ({n})
              </button>
            ))}
          </div>
        </IField>
        <IField label="Sort order">
          <IInp value={String(form.sortOrder)} onChange={v => set('sortOrder', v)} placeholder="0" />
        </IField>
      </InspectorSection>

      {/* Validation (skip for layout fields) */}
      {!isLayoutOnly && (
        <InspectorSection title="Validation">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-text-secondary">Required</span>
            <button
              onClick={() => set('isRequired', !form.isRequired)}
              className={cn('relative w-8 h-4 rounded-full border transition-colors',
                form.isRequired ? 'bg-brand-500 border-brand-500' : 'border-border bg-surface-overlay')}>
              <span className={cn('absolute top-0.5 left-0 w-3 h-3 rounded-full bg-surface-raised transition-transform',
                form.isRequired ? 'translate-x-4' : 'translate-x-0.5')} />
            </button>
          </div>
          <IField label="Validation rules (JSON)">
            <textarea value={form.validationRulesJson} onChange={e => set('validationRulesJson', e.target.value)}
              rows={2} placeholder='{"minLength":3,"maxLength":255}'
              className="w-full px-2 py-1.5 text-[9px] font-mono bg-surface-overlay border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
          </IField>
          <IField label="Conditional (dependsOnJson)">
            <textarea value={form.dependsOnJson} onChange={e => set('dependsOnJson', e.target.value)}
              rows={2} placeholder='{"field":"issue_type","operator":"eq","value":"INTERNAL"}'
              className="w-full px-2 py-1.5 text-[9px] font-mono bg-surface-overlay border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
            <p className="text-[9px] text-text-muted mt-0.5">Field only shows when condition is true</p>
          </IField>
        </InspectorSection>
      )}

      {/* Options — SELECT / MULTI_SELECT / RADIO / CHECKBOX */}
      {needsOptions && (
        <InspectorSection title="Options source">
          <IField label="Options component key">
            <IInp value={form.optionsComponentKey} onChange={v => set('optionsComponentKey', v)} placeholder="issue_severity_options" mono />
            <p className="text-[9px] text-text-muted mt-0.5">Create this key in Screen Designer → Components, then link here</p>
          </IField>
        </InspectorSection>
      )}

      {/* Lookup */}
      {needsLookup && (
        <InspectorSection title="Lookup config">
          <IField label="Entity type">
            <IInp value={form.lookupEntityType} onChange={v => set('lookupEntityType', v)} placeholder="USER, VENDOR, RISK" />
          </IField>
        </InspectorSection>
      )}

      {/* Textarea rows */}
      {needsRows && (
        <InspectorSection title="Display">
          <IField label="Rows">
            <IInp value={String(form.rowsCount || '')} onChange={v => set('rowsCount', v)} placeholder="3" />
          </IField>
        </InspectorSection>
      )}

      {/* Slider / rating range */}
      {needsRange && (
        <InspectorSection title="Range">
          <IField label="Min value">
            <IInp value={String(form.minValue || '')} onChange={v => set('minValue', v)} placeholder="0" />
          </IField>
          <IField label="Max value">
            <IInp value={String(form.maxValue || '')} onChange={v => set('maxValue', v)} placeholder="10" />
          </IField>
        </InspectorSection>
      )}

      {/* Tag suggestions */}
      {needsTags && (
        <InspectorSection title="Autocomplete">
          <IField label="Tag suggestions (comma-separated)">
            <IInp value={form.tagSuggestions} onChange={v => set('tagSuggestions', v)} placeholder="SOX,GDPR,ISO27001" />
          </IField>
        </InspectorSection>
      )}

      {/* FIX: Per-field visibility — which roles can see this field.
          Uses a derived screenKey so each field gets its own layout record. */}
      {form.fieldKey && (
        <RoleVisibilityEditor screenKey={`${screenKey}_field_${form.fieldKey}`} />
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {initial?.id && (
          <button onClick={() => { if (confirm('Delete this field?')) deleteMut.mutate() }}
            className="flex items-center gap-1 text-[10px] text-status-fail-fg hover:text-status-fail-fg border border-status-fail-bd hover:border-status-fail-bd rounded px-2 py-1 transition-colors">
            <Trash2 size={10} /> Delete
          </button>
        )}
        <button onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="flex-1 text-[10px] font-medium text-brand-900 bg-brand-500 hover:bg-brand-600 rounded py-1.5 transition-colors disabled:opacity-50">
          {saveMut.isPending ? 'Saving…' : initial?.id ? 'Update field' : 'Add field'}
        </button>
      </div>
    </div>
  )
}

// ─── FormSubmitInspector ──────────────────────────────────────────────────────
// Shown when the built-in Submit button is clicked on a FORM canvas.
// Edits the UiForm row's submitUrl and httpMethod — these are what DynamicForm
// uses to POST the field values at runtime.

function FormSubmitInspector({ screenKey, onSave }) {
  const qc = useQueryClient()

  // Load the UiForm row for this screen key
  const { data: formRes, isLoading } = useQuery({
    queryKey: ['sd-form', screenKey],
    queryFn: () => sdApi.getForm(screenKey),
    staleTime: 0,
  })
  const formRow = useMemo(() => {
    const items = formRes?.items || formRes?.data?.items || []
    return Array.isArray(items) ? (items[0] ?? null) : null
  }, [formRes])

  const [submitUrl,  setSubmitUrl]  = useState('')
  const [httpMethod, setHttpMethod] = useState('POST')
  const [title,      setTitle]      = useState('')
  const [description,setDescription]= useState('')

  // Populate once the form row loads
  useEffect(() => {
    if (formRow) {
      setSubmitUrl(formRow.submitUrl   || '')
      setHttpMethod(formRow.httpMethod || 'POST')
      setTitle(formRow.title           || '')
      setDescription(formRow.description || '')
    }
  }, [formRow])

  const saveMut = useMutation({
    mutationFn: () => {
      if (!formRow?.id) return Promise.reject(new Error('Form not found'))
      return sdApi.updateForm(formRow.id, {
        formKey: screenKey,
        title,
        description,
        submitUrl,
        httpMethod,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sd-form', screenKey] })
      toast.success('Submit config saved')
      onSave()
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  if (isLoading) return <div className="p-4 text-xs text-text-muted">Loading…</div>

  return (
    <div className="p-4 space-y-4">
      <InspectorSection title="Submit button config">
        <p className="text-[10px] text-text-muted mb-2">
          The built-in Submit button POSTs all field values to this endpoint.
          Leave blank to fall back to <code className="font-mono">ModuleBlueprint.apiBasePath</code>.
        </p>
        <IField label="HTTP method">
          <ISel value={httpMethod} onChange={setHttpMethod}
            options={HTTP_METHODS.map(m => ({ value: m, label: m }))} />
        </IField>
        <IField label="Submit URL">
          <IInp value={submitUrl} onChange={setSubmitUrl} placeholder="/v1/risks" mono />
          <p className="text-[9px] text-text-muted mt-0.5">Supports path params: {'{tenantId}'}, {'{id}'}</p>
        </IField>
      </InspectorSection>

      <InspectorSection title="Form metadata">
        <IField label="Title">
          <IInp value={title} onChange={setTitle} placeholder={screenKey} />
        </IField>
        <IField label="Description">
          <IInp value={description} onChange={setDescription} placeholder="Optional description shown above the form" />
        </IField>
      </InspectorSection>

      {formRow?.id && (
        <div className="px-2 py-1 rounded bg-surface-overlay border border-border text-[9px] text-text-muted font-mono">
          formId: {formRow.id} · GET /v1/ui-config/form/{screenKey}
        </div>
      )}

      <Button size="sm" icon={Save} loading={saveMut.isPending} onClick={() => saveMut.mutate()} className="w-full">
        Save submit config
      </Button>
    </div>
  )
}

function RoleVisibilityEditor({ screenKey }) {
  const qc = useQueryClient()
  const [access, setAccess] = useState(SIDES.reduce((a, s) => ({ ...a, [s]: true }), {}))
  const [roleAccess, setRoleAccess] = useState({})  // { roleId: bool }
  const [layoutId, setLayoutId] = useState(null)
  const [storedLayout, setStoredLayout] = useState(null)  // FIX: preserve full layout for safe saves
  const [tab, setTab] = useState('sides')  // 'sides' | 'roles'

  // Read auth to get tenantId for roles fetch
  const { tenantId } = useSelector(state => state.auth || {})

  const { data: layoutData } = useQuery({
    queryKey: ['sd-layout', screenKey],
    queryFn: () => sdApi.getLayout(screenKey),
    staleTime: 30_000,
  })

  // Load roles grouped by side
  const { data: rolesData } = useQuery({
    queryKey: ['sd-roles', tenantId],
    queryFn: () => sdApi.listRoles(tenantId),
    enabled: !!tenantId,
    staleTime: 120_000,
  })
  const allRoles = useMemo(() => {
    const raw = rolesData?.data || rolesData || []
    return Array.isArray(raw) ? raw : []
  }, [rolesData])

  useEffect(() => {
    const items = layoutData?.data?.items || layoutData?.items ||
      (Array.isArray(layoutData?.data) ? layoutData.data : null) || []
    const layout = Array.isArray(items) ? items[0] : items
    if (layout?.id) {
      setLayoutId(layout.id)
      setStoredLayout(layout)  // FIX: remember full layout so save can preserve columnsJson etc.
      try {
        const parsed = JSON.parse(layout.roleAccessJson || '{}')
        // Separate side keys (ORGANIZATION, VENDOR etc.) from role keys (numeric IDs)
        const sideKeys = {}
        const roleKeys = {}
        Object.entries(parsed).forEach(([k, v]) => {
          if (SIDES.includes(k)) sideKeys[k] = v
          else roleKeys[k] = v
        })
        setAccess(prev => ({ ...prev, ...sideKeys }))
        setRoleAccess(roleKeys)
      } catch {}
    }
  }, [layoutData])

  const saveMut = useMutation({
    mutationFn: () => {
      const combined = { ...access, ...roleAccess }
      // FIX: preserve ALL existing layout fields — previously columnsJson: '[]' wiped every column
      return sdApi.saveLayout(layoutId, {
        layoutKey:      screenKey,
        screen:         screenKey,
        columnsJson:    storedLayout?.columnsJson    ?? '[]',
        filtersJson:    storedLayout?.filtersJson    ?? '[]',
        tabsJson:       storedLayout?.tabsJson       ?? null,
        layoutMode:     storedLayout?.layoutMode     ?? 'FULL_PAGE',
        roleAccessJson: JSON.stringify(combined),
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-layout', screenKey] }); toast.success('Visibility saved') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  const sideColor = { ORGANIZATION: 'blue', VENDOR: 'teal', AUDITOR: 'purple', AUDITEE: 'amber', SYSTEM: 'gray' }

  return (
    <InspectorSection title="Visibility">
      {/* Tab switcher */}
      <div className="flex gap-1 p-0.5 bg-surface-overlay rounded-ctl border border-border mb-3">
        {[['sides', 'Sides'], ['roles', 'Roles']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('flex-1 text-[10px] py-1 rounded transition-colors font-medium',
              tab === k ? 'bg-background text-text-primary border border-border' : 'text-text-muted hover:text-text-secondary')}>
            {l}
          </button>
        ))}
      </div>

      {/* Sides tab */}
      {tab === 'sides' && (
        <div className="space-y-1">
          <p className="text-[9px] text-text-muted mb-2">Which party can access this screen. Coarse-grained — applies to all roles within that side.</p>
          {SIDES.map(s => {
            const allowed = access[s] !== false
            const color = sideColor[s] || 'gray'
            return (
              <div key={s}
                onClick={() => setAccess(prev => ({ ...prev, [s]: !allowed }))}
                className={cn(
                  'flex items-center justify-between px-2.5 py-2 rounded-card border cursor-pointer transition-all text-[10px]',
                  allowed
                    ? 'border-status-pass-bd bg-status-pass-bg'
                    : 'border-border opacity-40 hover:opacity-60'
                )}>
                <div className="flex items-center gap-2">
                  <div className={cn('w-1.5 h-1.5 rounded-full', allowed ? 'bg-status-pass-bg' : 'bg-border')} />
                  <span className={allowed ? 'text-text-primary font-medium' : 'text-text-muted'}>{s}</span>
                  {!allowed && <span className="text-[9px] text-text-muted italic">hidden</span>}
                </div>
                <span className={cn('text-[9px] font-medium', allowed ? 'text-status-pass-fg' : 'text-text-muted')}>
                  {allowed ? 'Allowed' : 'Blocked'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Roles tab */}
      {tab === 'roles' && (
        <div className="space-y-3">
          <p className="text-[9px] text-text-muted mb-1">Fine-grained — restrict specific roles within an allowed side. A side must be allowed above for its roles to matter.</p>
          {allRoles.length === 0 ? (
            <p className="text-[10px] text-text-muted text-center py-3">No roles found for this tenant</p>
          ) : (
            SIDES.map(side => {
              const sideRoles = allRoles.filter(r => r.side === side)
              if (sideRoles.length === 0) return null
              const sideAllowed = access[side] !== false
              return (
                <div key={side}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] font-semibold text-text-secondary uppercase tracking-wider">{side}</span>
                    {!sideAllowed && (
                      <span className="text-[8px] text-status-warn-fg border border-status-warn-bd bg-status-warn-bg rounded px-1 py-0.5">
                        side blocked — roles ignored
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {sideRoles.map(role => {
                      const rKey = String(role.id)
                      // If no explicit role entry, default to side's setting
                      const allowed = rKey in roleAccess ? roleAccess[rKey] !== false : true
                      return (
                        <div key={role.id}
                          onClick={() => !(!sideAllowed) && setRoleAccess(prev => ({ ...prev, [rKey]: !allowed }))}
                          className={cn(
                            'flex items-center justify-between px-2 py-1.5 rounded border text-[10px] transition-all',
                            !sideAllowed
                              ? 'border-border opacity-30 cursor-not-allowed'
                              : allowed
                                ? 'border-status-pass-bd bg-status-pass-bg cursor-pointer hover:bg-status-pass-bg'
                                : 'border-border opacity-50 cursor-pointer hover:opacity-70'
                          )}>
                          <div className="flex items-center gap-2">
                            <User size={10} className={allowed && sideAllowed ? 'text-status-pass-fg' : 'text-text-muted'} />
                            <span className={allowed && sideAllowed ? 'text-text-primary' : 'text-text-muted'}>
                              {role.name}
                            </span>
                            {role.level && (
                              <span className="text-[8px] text-text-muted border border-border rounded px-1">{role.level}</span>
                            )}
                          </div>
                          <span className={cn('text-[9px]', allowed && sideAllowed ? 'text-status-pass-fg' : 'text-text-muted')}>
                            {allowed ? 'Allowed' : 'Blocked'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      <button onClick={() => saveMut.mutate()}
        className="mt-3 w-full text-[10px] font-medium text-brand-400 hover:text-brand-300 border border-brand-500/25 hover:border-brand-500/50 bg-brand-500/5 hover:bg-brand-500/8 rounded-ctl py-1.5 transition-colors">
        {saveMut.isPending ? 'Saving…' : 'Save visibility'}
      </button>
    </InspectorSection>
  )
}

function WorkflowStepVisibility({ screenKey, actionKey }) {
  const { data } = useQuery({ queryKey: ['sd-workflows'], queryFn: sdApi.listWorkflows, staleTime: 120_000 })
  const workflows = data?.data?.items || data?.items || (Array.isArray(data?.data) ? data.data : null) || []

  // Find steps that reference this screenKey in navKey, sectionScreenKey, or itemScreenKey
  const relevantSteps = useMemo(() => {
    const steps = []
    workflows.forEach(wf => {
      (wf.steps || []).forEach(step => {
        if (step.navKey === screenKey ||
            (step.sections || []).some(s => s.sectionScreenKey === screenKey || s.itemScreenKey === screenKey)) {
          steps.push({ wfName: wf.name, stepName: step.name, stepOrder: step.stepOrder, side: step.side })
        }
      })
    })
    return steps
  }, [workflows, screenKey])

  if (relevantSteps.length === 0) return null

  return (
    <InspectorSection title="Used in workflow steps">
      <div className="space-y-1">
        {relevantSteps.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-[9px] px-2 py-1.5 rounded bg-surface-overlay border border-border">
            <GitBranch size={10} className="text-text-muted shrink-0" />
            <span className="text-text-muted truncate">{s.wfName}</span>
            <span className="text-text-secondary shrink-0">Step {s.stepOrder}: {s.stepName}</span>
          </div>
        ))}
      </div>
    </InspectorSection>
  )
}

function ItemListInspector({ screenKey, onNavigate }) {
  const linkedItemKey = screenKey.replace('_section', '_item').replace('section_', 'item_')
  return (
    <div className="p-4 space-y-4">
      <InspectorSection title="Item list">
        <p className="text-[10px] text-text-muted">Items in this section are rendered using the itemScreenKey below. Click to configure the item card.</p>
        <button onClick={() => onNavigate(linkedItemKey)}
          className="w-full flex items-center gap-2 p-2.5 rounded-card border border-brand-500/25 bg-brand-500/5 text-[10px] text-brand-400 hover:bg-brand-500/10 transition-colors mt-2">
          <ArrowRight size={12} />
          <div className="flex-1 text-left">
            <div className="font-medium">Item card screen</div>
            <code className="text-[9px] font-mono opacity-70">{linkedItemKey}</code>
          </div>
          <ExternalLink size={11} />
        </button>
      </InspectorSection>
      <RoleVisibilityEditor screenKey={screenKey} />
    </div>
  )
}

function ColumnInspector({ initial, screenKey, onSave }) {
  const [col, setCol] = useState({
    key: '', label: '', type: 'text', sortable: false, hidden: false, componentKey: '',
    // FIX: monoFont and isPrimary are TEXT-type display options, persisted in columnsJson.
    // monoFont → font-mono rendering (for codes, IDs, refs, keys)
    // isPrimary → font-semibold (the main identifier field in the row)
    monoFont: false,
    isPrimary: false,
    ...initial,
  })
  const qc = useQueryClient()

  const saveMut = useMutation({
    mutationFn: async () => {
      // Load current layout, update/add column, save back
      const res = await sdApi.getLayout(screenKey)
      const items = res?.data?.items || res?.items || (Array.isArray(res?.data) ? res.data : null) || []
      const layout = Array.isArray(items) ? items[0] : items
      let cols = []
      try { cols = JSON.parse(layout?.columnsJson || '[]') } catch {}
      const idx = cols.findIndex(c => c.key === (initial?.key || col.key))
      if (idx >= 0) cols[idx] = col
      else cols.push(col)
      // FIX: preserve ALL existing layout fields — previously wiped roleAccessJson, tabsJson, layoutMode
      return sdApi.saveLayout(layout?.id, {
        layoutKey:      screenKey,
        screen:         screenKey,
        columnsJson:    JSON.stringify(cols),
        filtersJson:    layout?.filtersJson    ?? '[]',
        tabsJson:       layout?.tabsJson       ?? null,
        layoutMode:     layout?.layoutMode     ?? 'FULL_PAGE',
        roleAccessJson: layout?.roleAccessJson ?? '{}',
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-layout', screenKey] }); toast.success('Column saved'); onSave() },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  return (
    <div className="p-4 space-y-4">
      <InspectorSection title="Column">
        <IField label="Field key"><IInp value={col.key} onChange={v => setCol(c => ({...c, key: v}))} placeholder="risk_rating" mono /></IField>
        <IField label="Label"><IInp value={col.label} onChange={v => setCol(c => ({...c, label: v}))} placeholder="Risk Rating" /></IField>

        {/* Column type — FIX: added SELECT / dropdown as a first-class type */}
        <IField label="Type">
          <ISel value={col.type} onChange={v => setCol(c => ({...c, type: v}))} options={[
            { value: 'text',   label: 'Text' },
            { value: 'badge',  label: 'Badge / status' },
            { value: 'select', label: 'Select / dropdown' },   // ← NEW
            { value: 'date',   label: 'Date' },
            { value: 'number', label: 'Number' },
            { value: 'user',   label: 'User / avatar' },
            { value: 'action', label: 'Action link' },
          ]} />
        </IField>

        {/* FIX: TEXT-type display sub-options — mono font and primary column */}
        {col.type === 'text' && (
          <IField label="Text display options">
            <div className="flex flex-col gap-2 pt-0.5">
              {[
                { k: 'monoFont',  l: 'Mono font',      desc: 'font-mono — for codes, IDs, refs, keys' },
                { k: 'isPrimary', l: 'Primary column',  desc: 'Bold weight — the main identifier field in the row' },
              ].map(({ k, l, desc }) => (
                <label key={k} className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={col[k] || false}
                    onChange={e => setCol(c => ({ ...c, [k]: e.target.checked }))}
                    className="h-3 w-3 mt-0.5 accent-brand-500 shrink-0" />
                  <div>
                    <span className="text-[10px] text-text-secondary">{l}</span>
                    <p className="text-[9px] text-text-muted">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </IField>
        )}

        {/* FIX: BADGE and SELECT types share a component key field for option/color mapping */}
        {(col.type === 'badge' || col.type === 'select') && (
          <IField label={col.type === 'select' ? 'Component key (options source)' : 'Component key (color mapping)'}>
            <IInp
              value={col.componentKey || ''}
              onChange={v => setCol(c => ({ ...c, componentKey: v }))}
              placeholder={col.type === 'select' ? 'audit_result_options' : 'risk_status'}
              mono accent
            />
            <p className="text-[9px] text-text-muted mt-0.5">
              {col.type === 'select'
                ? 'Links to a UiComponent with SELECT/DROPDOWN type to supply option labels and values'
                : 'Links to a UiComponent for badge color-class mapping per status value'}
            </p>
          </IField>
        )}

        <div className="flex items-center gap-4">
          {[{k:'sortable',l:'Sortable'},{k:'hidden',l:'Hidden by default'}].map(({k,l}) => (
            <label key={k} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={col[k]} onChange={e => setCol(c => ({...c, [k]: e.target.checked}))} className="h-3 w-3 accent-brand-500" />
              <span className="text-[10px] text-text-secondary">{l}</span>
            </label>
          ))}
        </div>
      </InspectorSection>
      <Button size="sm" icon={Save} loading={saveMut.isPending} onClick={() => saveMut.mutate()} className="w-full">Save column</Button>
    </div>
  )
}

// ─── TabInspector ─────────────────────────────────────────────────────────────
// Shown when a tab is clicked in DetailCanvas or ElementsTab.
// Extends the original role-visibility editor with:
//   • Tab label rename  — updates layout.tabsJson
//   • Tab deletion      — removes entry from layout.tabsJson (custom tabs only)
// Built-in tabs (Overview, Workflow, Evidence, Comments, History) cannot be deleted
// because they are platform capabilities baked into the frontend renderer.

function TabInspector({ tab, tabKey, screenKey, layout }) {
  const qc = useQueryClient()

  // ── Tab label editing ──────────────────────────────────────────────────────
  const [labelEdit, setLabelEdit] = useState(tab || '')

  // ── Derive current tab list from layout.tabsJson (or hardcoded defaults) ──
  const BUILTIN_TAB_LABELS = ['Overview', 'Workflow', 'Evidence', 'Comments', 'History']
  const DEFAULT_TAB_LIST   = BUILTIN_TAB_LABELS.map(t => ({
    key: t.toLowerCase().replace(/\s+/g, '_'), label: t,
  }))

  const currentTabs = useMemo(() => {
    try {
      const parsed = JSON.parse(layout?.tabsJson || 'null')
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(t =>
          typeof t === 'string'
            ? { key: t.toLowerCase().replace(/\s+/g, '_'), label: t }
            : t
        )
      }
    } catch {}
    return DEFAULT_TAB_LIST
  }, [layout?.tabsJson])

  // ── Persist updated tabsJson ───────────────────────────────────────────────
  const saveTabsMut = useMutation({
    mutationFn: (newTabs) => {
      if (!layout?.id) return Promise.reject(new Error('Layout not loaded — re-select this tab after the layout is saved'))
      return sdApi.saveLayout(layout.id, {
        layoutKey:      screenKey,
        screen:         screenKey,
        columnsJson:    layout?.columnsJson    || '[]',
        tabsJson:       JSON.stringify(newTabs),
        layoutMode:     layout?.layoutMode     || 'FULL_PAGE',
        roleAccessJson: layout?.roleAccessJson || '{}',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sd-layout', screenKey] })
      toast.success('Tab updated')
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to save tab'),
  })

  const handleRename = () => {
    if (!labelEdit.trim() || labelEdit === tab) return
    const newTabs = currentTabs.map(t =>
      (t.key === tabKey || t.label === tab)
        ? { ...t, label: labelEdit.trim() }   // preserve key; only change display label
        : t
    )
    saveTabsMut.mutate(newTabs)
  }

  const handleDelete = () => {
    const newTabs = currentTabs.filter(t => t.key !== tabKey && t.label !== tab)
    saveTabsMut.mutate(newTabs)
  }

  const isBuiltIn = BUILTIN_TAB_LABELS.includes(tab)

  return (
    <div className="p-4 space-y-4">
      {/* Tab identity + label rename */}
      <InspectorSection title={`Tab: ${tab}`}>
        <p className="text-[10px] text-text-muted mb-3">Configure this tab's display label and role-level visibility.</p>

        <IField label="Tab label">
          <div className="flex items-center gap-1.5">
            <IInp value={labelEdit} onChange={setLabelEdit} placeholder={tab} />
            <button
              onClick={handleRename}
              disabled={!labelEdit.trim() || labelEdit === tab || saveTabsMut.isPending}
              className="shrink-0 h-7 px-2 text-[10px] font-medium text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded hover:bg-brand-500/20 transition-colors disabled:opacity-40">
              Rename
            </button>
          </div>
        </IField>

        <IField label="Tab key">
          <code className="text-[10px] font-mono text-text-muted">{tabKey || tab?.toLowerCase().replace(/\s+/g, '_')}</code>
        </IField>

        {isBuiltIn && (
          <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-status-info-bg border border-status-info-bd text-[9px] text-status-info-fg leading-relaxed">
            <Info size={10} className="mt-0.5 shrink-0" />
            <span>Built-in capability tab — always available when this screen type uses it. You can rename it or hide it per-role, but it cannot be deleted.</span>
          </div>
        )}
      </InspectorSection>

      {/* Role / side visibility per-tab */}
      <RoleVisibilityEditor screenKey={`${screenKey}_tab_${tabKey || tab?.toLowerCase().replace(/\s+/g, '_')}`} />

      {/* Workflow step visibility */}
      <WorkflowStepVisibility screenKey={screenKey} />

      {/* Delete custom tab (built-in tabs cannot be deleted) */}
      {!isBuiltIn && (
        <div className="pt-2 border-t border-border">
          <button
            onClick={() => { if (window.confirm(`Delete the "${tab}" tab? This cannot be undone.`)) handleDelete() }}
            disabled={saveTabsMut.isPending}
            className="flex items-center gap-1.5 text-[10px] text-status-fail-fg hover:text-status-fail-fg border border-status-fail-bd hover:border-status-fail-bd rounded px-2.5 py-1.5 transition-colors disabled:opacity-50">
            <Trash2 size={11} /> Delete tab
          </button>
          <p className="text-[9px] text-text-muted mt-1.5 leading-relaxed">
            Removes this tab from the screen config. Any tab-level visibility rules stored under the tab key remain in the DB but become unused.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── NewDetailTabInspector ────────────────────────────────────────────────────
// Shown when "+ Tab" is clicked in DetailCanvas or ElementsTab DETAIL section.
// Adds a new tab definition to layout.tabsJson so it appears on the canvas
// and can be configured with role-level visibility rules.

function NewDetailTabInspector({ screenKey, layout, onSave }) {
  const qc = useQueryClient()
  const [label, setLabel] = useState('')

  // Derive current tab list from layout.tabsJson so we can append to it
  const currentTabs = useMemo(() => {
    try {
      const parsed = JSON.parse(layout?.tabsJson || 'null')
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(t =>
          typeof t === 'string'
            ? { key: t.toLowerCase().replace(/\s+/g, '_'), label: t }
            : t
        )
      }
    } catch {}
    // Fall back to defaults so the new tab is appended after them
    return ['Overview', 'Workflow', 'Evidence', 'Comments', 'History'].map(t => ({
      key: t.toLowerCase().replace(/\s+/g, '_'), label: t,
    }))
  }, [layout?.tabsJson])

  const saveMut = useMutation({
    mutationFn: () => {
      if (!label.trim()) return Promise.reject(new Error('Tab label is required'))
      if (!layout?.id)   return Promise.reject(new Error('Layout record not found — save a column first so the layout row exists'))
      const newKey = label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
      // Prevent duplicate keys or labels
      const isDupe = currentTabs.some(t => t.key === newKey || t.label.toLowerCase() === label.trim().toLowerCase())
      if (isDupe) return Promise.reject(new Error(`A tab named "${label.trim()}" already exists`))
      const newTab  = { key: newKey, label: label.trim() }
      const newTabs = [...currentTabs, newTab]
      return sdApi.saveLayout(layout.id, {
        layoutKey:      screenKey,
        screen:         screenKey,
        columnsJson:    layout?.columnsJson    || '[]',
        tabsJson:       JSON.stringify(newTabs),
        layoutMode:     layout?.layoutMode     || 'FULL_PAGE',
        roleAccessJson: layout?.roleAccessJson || '{}',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sd-layout', screenKey] })
      toast.success('Tab added')
      onSave()
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || 'Failed'),
  })

  const derivedKey = label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')

  return (
    <div className="p-4 space-y-4">
      <InspectorSection title="Add new tab">
        <p className="text-[10px] text-text-muted mb-3">
          Adds a custom tab to this DETAIL screen. The tab appears immediately on the canvas and
          can be configured with role-level visibility rules after adding.
        </p>

        <IField label="Tab label *">
          <IInp value={label} onChange={setLabel} placeholder="e.g. Tests · Policies · Risk score · Remediations" />
        </IField>

        {label.trim() && (
          <IField label="Derived key (auto)">
            <code className="text-[10px] font-mono text-text-muted">{derivedKey}</code>
          </IField>
        )}

        <p className="text-[9px] text-text-muted leading-relaxed">
          Stored in <code className="font-mono">tabsJson</code> on the layout record.
          Tab content rendering is wired up separately in the frontend component that
          reads from this screen config.
        </p>
      </InspectorSection>

      <Button
        size="sm" icon={Plus}
        loading={saveMut.isPending}
        onClick={() => saveMut.mutate()}
        className="w-full"
        disabled={!label.trim() || !layout?.id}>
        Add tab
      </Button>

      {!layout?.id && (
        <p className="text-[9px] text-status-warn-fg text-center leading-relaxed">
          No layout record yet — add a column first (Preview → click + in the table header) so the layout row is created,
          then come back to add tabs.
        </p>
      )}
    </div>
  )
}

function SectionHeaderInspector({ screenKey }) {
  return (
    <div className="p-4 space-y-4">
      <InspectorSection title="Section header">
        <p className="text-[10px] text-text-muted mb-2">The section label and description come from the blueprint. Configure display options here.</p>
        <IField label="Show progress bar">
          <div className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="h-3 w-3 accent-brand-500" />
            <span className="text-[10px] text-text-secondary">Show items completed / total</span>
          </div>
        </IField>
      </InspectorSection>
      <RoleVisibilityEditor screenKey={screenKey} />
    </div>
  )
}

function ItemFieldsInspector({ screenKey }) {
  return (
    <div className="p-4 space-y-4">
      <InspectorSection title="Response area">
        <p className="text-[10px] text-text-muted">Fields shown inside each item card. Linked to ui_components for dropdown options.</p>
      </InspectorSection>
      <ComponentQuickAdd screenKey={screenKey} />
      <RoleVisibilityEditor screenKey={screenKey} />
    </div>
  )
}

// ─── Layout Mode Inspector ────────────────────────────────────────────────────
// Shown in Inspector when screen.type === 'DETAIL' (always) or when the user
// clicks the layout mode badge in DetailCanvas.
// Reads & writes layoutMode on the ui_layouts row for this screenKey.

const LAYOUT_MODES = [
  {
    value: 'FULL_PAGE',
    label: 'Full page',
    Icon: Layout,
    color: 'border-status-info-bd   bg-status-info-bg   text-status-info-fg',
    dimColor: 'border-border bg-surface-overlay text-text-muted',
    desc: 'Navigates to a new route. Best for complex entities with many tabs (risks, assessments, audits).',
  },
  {
    value: 'DRAWER',
    label: 'Drawer',
    Icon: PanelRight,
    color: 'border-status-tag-bd bg-status-tag-bg text-status-tag-fg',
    dimColor: 'border-border bg-surface-overlay text-text-muted',
    desc: 'Slides in from the right (~480 px). Best for quick edits without losing list context (audit controls, action items).',
  },
  {
    value: 'SIDE_PANEL',
    label: 'Side panel',
    Icon: Columns2,
    color: 'border-brand-500/40   bg-brand-500/8   text-brand-400',
    dimColor: 'border-border bg-surface-overlay text-text-muted',
    desc: 'Persistent panel alongside list (33 vw). Best for step-through workflows (questionnaire review, finding triage).',
  },
]

function LayoutModeInspector({ screenKey }) {
  const qc = useQueryClient()
  const [layoutId, setLayoutId]   = useState(null)
  const [storedLayout, setStoredLayout] = useState(null)  // FIX: preserve full layout
  const [mode, setMode]           = useState('FULL_PAGE')
  const [saving, setSaving]       = useState(false)

  const { data: layoutData } = useQuery({
    queryKey: ['sd-layout', screenKey],
    queryFn:  () => sdApi.getLayout(screenKey),
    staleTime: 30_000,
  })

  useEffect(() => {
    const items = layoutData?.data?.items || layoutData?.items ||
      (Array.isArray(layoutData?.data) ? layoutData.data : null) || []
    const layout = Array.isArray(items) ? items[0] : items
    if (layout?.id) {
      setLayoutId(layout.id)
      setStoredLayout(layout)  // FIX: store full layout for safe saves
      setMode(layout.layoutMode || 'FULL_PAGE')
    }
  }, [layoutData])

  const save = async (newMode) => {
    setSaving(true)
    try {
      // FIX: preserve ALL existing layout fields — previously columnsJson: '[]' wiped every column
      await sdApi.saveLayout(layoutId, {
        layoutKey:      screenKey,
        screen:         screenKey,
        columnsJson:    storedLayout?.columnsJson    ?? '[]',
        filtersJson:    storedLayout?.filtersJson    ?? '[]',
        tabsJson:       storedLayout?.tabsJson       ?? null,
        layoutMode:     newMode,
        roleAccessJson: storedLayout?.roleAccessJson ?? '{}',
      })
      qc.invalidateQueries({ queryKey: ['sd-layout', screenKey] })
      qc.invalidateQueries({ queryKey: ['sd-all-layouts'] })
      toast.success(`Layout mode → ${newMode}`)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleSelect = (val) => {
    setMode(val)
    save(val)
  }

  return (
    <InspectorSection title="Layout mode">
      <p className="text-[9px] text-text-muted mb-3 leading-relaxed">
        Controls how this DETAIL screen opens at runtime. Saved to the layout record and read by{' '}
        <code className="font-mono">RecordDetailTemplate</code> via{' '}
        <code className="font-mono">viewContext.layoutMode</code>.
      </p>
      <div className="space-y-2">
        {LAYOUT_MODES.map(({ value, label, Icon, color, dimColor, desc }) => {
          const active = mode === value
          return (
            <button
              key={value}
              onClick={() => handleSelect(value)}
              disabled={saving}
              className={cn(
                'w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-card border transition-all',
                active ? color : dimColor,
                saving ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90 cursor-pointer',
              )}>
              <Icon size={14} className={cn('mt-0.5 shrink-0', active ? '' : 'text-text-muted')} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('text-[11px] font-semibold', active ? '' : 'text-text-muted')}>
                    {label}
                  </span>
                  {active && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-on-dark/10 border border-current">
                      active
                    </span>
                  )}
                </div>
                <p className={cn('text-[9px] mt-0.5 leading-relaxed', active ? 'opacity-80' : 'text-text-muted')}>
                  {desc}
                </p>
              </div>
            </button>
          )
        })}
      </div>
      {saving && (
        <p className="text-[9px] text-text-muted mt-2 text-center animate-pulse">Saving…</p>
      )}
    </InspectorSection>
  )
}

function GenericElementInspector({ element, screenKey }) {
  return (
    <div className="p-4 space-y-4">
      <InspectorSection title={element.label || element.type}>
        <p className="text-[10px] text-text-muted">Configure visibility rules for this element.</p>
      </InspectorSection>
      <RoleVisibilityEditor screenKey={screenKey} />
      <WorkflowStepVisibility screenKey={screenKey} />
    </div>
  )
}

function ComponentQuickAdd({ screenKey }) {
  const qc = useQueryClient()
  const [key, setKey] = useState('')
  const [type, setType] = useState('DROPDOWN')

  const createMut = useMutation({
    mutationFn: () => api.post('/v1/admin/ui/components', { componentKey: key, componentType: type, screen: screenKey, label: key }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-comp', screenKey] }); toast.success('Component added'); setKey('') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  return (
    <InspectorSection title="Quick add component">
      <div className="flex gap-1.5">
        <input value={key} onChange={e => setKey(e.target.value.toLowerCase().replace(/\s+/g,'_'))}
          placeholder="component_key"
          className="flex-1 h-7 px-2 text-[10px] font-mono bg-surface-overlay border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        <select value={type} onChange={e => setType(e.target.value)}
          className="h-7 px-1.5 text-[10px] bg-surface-overlay border border-border rounded text-text-primary focus:outline-none">
          {['DROPDOWN','BADGE','RADIO','MULTI_SELECT'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => { if (!key) return; createMut.mutate() }}
          className="h-7 px-2 bg-brand-500/20 text-brand-400 rounded border border-brand-500/30 text-[10px] hover:bg-brand-500/30 transition-colors">
          Add
        </button>
      </div>
    </InspectorSection>
  )
}

// ─── Create screen modal ──────────────────────────────────────────────────────

function CreateScreenModal({ onClose, onCreate }) {
  const [key,  setKey]  = useState('')
  const [type, setType] = useState('SECTION')

  const handle = () => {
    if (!key.trim()) return toast.error('Key required')
    const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    onCreate({ key: cleanKey, type, label: cleanKey })
  }

  return (
    <Modal open onClose={onClose} title="New screen"
      subtitle="Choose the screen type — this determines what you can configure"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handle}>Create</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Screen key <span className="text-status-fail-fg">*</span></label>
          <input value={key} onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
            placeholder="e.g. vendor_question_item"
            autoFocus
            className="w-full h-8 px-3 text-xs font-mono bg-surface-overlay border border-border rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary block mb-2">Screen type</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(SCREEN_TYPES).map(t => (
              <button key={t.key} onClick={() => setType(t.key)}
                className={cn('flex items-start gap-2.5 p-3 rounded-card border text-left transition-all',
                  type === t.key ? 'border-brand-500 bg-brand-500/8' : 'border-border hover:border-border-strong')}>
                <div className={cn('w-7 h-7 rounded-card flex items-center justify-center shrink-0 border', t.color)}>
                  <t.icon size={13} />
                </div>
                <div>
                  <div className="text-xs font-medium text-text-primary">{t.label}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">{t.desc}</div>
                  <code className="text-[8px] font-mono text-text-muted/60 mt-1 block">{t.fieldName}</code>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Template gallery (landing state) ────────────────────────────────────────
// Shown when no screen is selected. Makes templates the primary entry point
// instead of a blank empty state.

function TemplateGallery({ onSelect, onBlank }) {
  const groups = [...new Set(Object.values(SCREEN_TEMPLATES).map(t => t.group))]

  return (
    <div className="flex-1 overflow-auto p-6" style={{ background: "var(--color-background-tertiary)" }}>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <p className="text-base font-semibold text-text-primary mb-1">Choose a template to start</p>
          <p className="text-xs text-text-muted">
            Each template pre-populates the screen keys and default actions for a GRC module.
            All configuration is editable after selection — templates are just a starting point.
          </p>
        </div>

        {/* Screen type legend */}
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.values(SCREEN_TYPES).map(t => {
            const Icon = t.icon
            return (
              <div key={t.key} className={cn('flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-medium', t.color)}>
                <Icon size={10} />
                <span>{t.label}</span>
                <code className="opacity-60 text-[9px]">{t.fieldName.split('/')[0]}</code>
              </div>
            )
          })}
        </div>

        {/* Templates grouped by module */}
        {groups.map(group => (
          <div key={group} className="mb-6">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-2">
              {group}
              <span className="h-px flex-1 bg-border/50" />
            </p>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {Object.entries(SCREEN_TEMPLATES)
                .filter(([, t]) => t.group === group)
                .map(([key, tmpl]) => {
                  const st = SCREEN_TYPES[tmpl.screenType]
                  const Icon = st?.icon || Square
                  return (
                    <button key={key}
                      onClick={() => onSelect(tmpl)}
                      className="flex items-start gap-3 p-3 rounded-card border border-border hover:border-brand-500/50 bg-background hover:bg-brand-500/5 text-left transition-all group shadow-sm">
                      <div className={cn('w-9 h-9 rounded-card flex items-center justify-center shrink-0 border', st?.color)}>
                        <Icon size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-text-primary">{tmpl.label}</span>
                          <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-medium', st?.color)}>
                            {st?.label}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-muted leading-relaxed mb-2">{tmpl.desc}</p>
                        {/* Key pills */}
                        <div className="flex flex-wrap gap-1">
                          {tmpl.itemKey && (
                            <code className="text-[9px] bg-brand-500/10 border border-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded">
                              item: {tmpl.itemKey}
                            </code>
                          )}
                          {tmpl.sectionKey && (
                            <code className="text-[9px] bg-status-tag-bg border border-status-tag-bd text-status-tag-fg px-1.5 py-0.5 rounded">
                              section: {tmpl.sectionKey}
                            </code>
                          )}
                          {tmpl.formKey && (
                            <code className="text-[9px] bg-status-warn-bg border border-status-warn-bd text-status-warn-fg px-1.5 py-0.5 rounded">
                              form: {tmpl.formKey}
                            </code>
                          )}
                        </div>
                      </div>
                      <ArrowRight size={13} className="text-text-muted group-hover:text-brand-400 transition-colors shrink-0 mt-1" />
                    </button>
                  )
                })}
            </div>
          </div>
        ))}

        {/* Blank screen option */}
        <div className="mt-2 pt-4 border-t border-border/50">
          <button onClick={onBlank}
            className="flex items-center gap-2 px-4 py-2.5 rounded-card border border-dashed border-border hover:border-brand-500/40 hover:text-brand-400 text-text-muted text-[11px] transition-colors">
            <Plus size={13} /> Start with a blank screen
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Empty canvas (kept for backwards compat, not shown in main flow) ─────────

function EmptyCanvas({ onNew }) {
  return <TemplateGallery onSelect={() => {}} onBlank={onNew} />
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function InspectorSection({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}
function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[10px]">
      <span className="text-text-muted shrink-0">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  )
}
function IField({ label, children }) {
  return (
    <div>
      <label className="text-[9px] text-text-muted uppercase tracking-wide block mb-0.5">{label}</label>
      {children}
    </div>
  )
}
function IInp({ value, onChange, placeholder, mono, accent }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={cn('w-full h-7 px-2 bg-surface-overlay border border-border rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-brand-500', mono && 'font-mono', accent ? 'text-brand-400' : 'text-text-primary')} />
  )
}
function ISel({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full h-7 px-2 bg-surface-overlay border border-border rounded text-[10px] text-text-primary focus:outline-none">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}


// ─── NEW: Key differentiator bar ─────────────────────────────────────────────
// Shows itemKey / sectionKey / formKey clearly labeled — always visible when
// a screen is selected, so the admin always knows which key goes where.

function KeyDifferentiatorBar({ screen, inline = false }) {
  const template = Object.values(SCREEN_TEMPLATES).find(
    t => t.itemKey === screen.key || t.sectionKey === screen.key
  )
  const itemKey    = template?.itemKey    || (screen.type === 'ITEM_CARD' ? screen.key : '')
  const sectionKey = template?.sectionKey || (screen.type === 'SECTION'   ? screen.key : '')
  const formKey    = template?.formKey    || ''

  const copy = (val) => { if (!val) return; navigator.clipboard.writeText(val); toast.success('Copied') }

  return (
    <div className={inline
      ? "flex items-center gap-0 text-[10px]"
      : "flex items-center gap-0 px-4 py-1.5 border-b border-border/30 bg-surface-secondary shrink-0 text-[10px] flex-wrap gap-y-1"}>
      {[
        { label: 'itemScreenKey',    value: itemKey,    color: 'text-brand-400 bg-brand-500/10 border-brand-500/20' },
        { label: 'sectionScreenKey', value: sectionKey, color: 'text-status-tag-fg bg-status-tag-bg border-status-tag-bd' },
        { label: 'formKey',          value: formKey,    color: 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd' },
      ].map(({ label, value, color }) => (
        <div key={label} className="flex items-center gap-1.5 mr-4">
          <span className="text-text-muted">{label}</span>
          {value ? (
            <button
              onClick={() => copy(value)}
              className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono transition-opacity hover:opacity-80', color)}>
              {value}
              <Copy size={9} />
            </button>
          ) : (
            <span className="text-text-muted/40 font-mono">—</span>
          )}
        </div>
      ))}
      <div className="ml-auto text-text-muted">
        Referenced in: <span className="text-text-secondary font-mono">WorkflowStepSection.{
          screen.type === 'ITEM_CARD' ? 'itemScreenKey' :
          screen.type === 'SECTION'   ? 'sectionScreenKey' :
          screen.type === 'FORM'      ? 'createFormKey / editFormKey' :
          screen.type === 'LIST'      ? 'listScreenKey' :
          screen.type === 'DETAIL'    ? 'detailScreenKey' : 'navKey'
        }</span>
      </div>
    </div>
  )
}

// RoleSimulator is now inlined in ScreenDesignerPage topbar

// ─── NEW: Elements tab ────────────────────────────────────────────────────────
// Lists every configurable element on the screen with its current role access.
// Clicking an element opens it in the Inspector.

// ─── Form-specific elements tab ──────────────────────────────────────────────
// Shows all form fields as a configurable list. Clicking any field opens it
// in the Inspector exactly like clicking it on the canvas.
// Also shows the form's action buttons (Submit / Cancel) at the bottom.

const FIELD_TYPE_COLOR = {
  TEXT: 'text-status-info-fg bg-status-info-bg border-status-info-bd',
  EMAIL: 'text-status-info-fg bg-status-info-bg border-status-info-bd',
  NUMBER: 'text-status-info-fg bg-status-info-bg border-status-info-bd',
  DECIMAL: 'text-status-info-fg bg-status-info-bg border-status-info-bd',
  PHONE: 'text-status-info-fg bg-status-info-bg border-status-info-bd',
  URL: 'text-status-info-fg bg-status-info-bg border-status-info-bd',
  TEXTAREA: 'text-status-tag-fg bg-status-tag-bg border-status-tag-bd',
  RICH_TEXT: 'text-status-tag-fg bg-status-tag-bg border-status-tag-bd',
  DATE: 'text-status-info-fg bg-status-info-bg border-status-info-bd',
  DATE_RANGE: 'text-status-info-fg bg-status-info-bg border-status-info-bd',
  SELECT: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
  MULTI_SELECT: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
  RADIO: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
  CHECKBOX: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
  TOGGLE: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
  RATING: 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd',
  SLIDER: 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd',
  LOOKUP: 'text-status-tag-fg bg-status-tag-bg border-status-tag-bd',
  MULTILINE_LIST: 'text-status-tag-fg bg-status-tag-bg border-status-tag-bd',
  TAG: 'text-status-tag-fg bg-status-tag-bg border-status-tag-bd',
  FILE: 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd',
  FILE_MULTI: 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd',
  CURRENCY: 'text-status-pass-fg bg-status-pass-bg border-status-pass-bd',
  COLOR: 'text-status-fail-fg bg-status-fail-bg border-status-fail-bd',
  JSON_EDITOR: 'text-text-muted bg-surface-inset border-border',
  SECTION_HEADER: 'text-text-muted bg-surface-overlay border-border',
  DIVIDER: 'text-text-muted bg-surface-overlay border-border',
}

const GRID_LABEL = { 3: '¼', 4: '⅓', 6: '½', 8: '⅔', 12: 'full' }

function FormElementsTab({ screen, fields, formId, selectedElement, onSelectElement, actions }) {
  const qc = useQueryClient()

  return (
    <div className="flex-1 overflow-auto p-4" style={{ background: 'var(--color-background-tertiary)' }}>
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Fields list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
              Form fields ({fields.length})
            </p>
            <button
              onClick={() => onSelectElement({ type: 'new_form_field', screenKey: screen.key, formId,
                onSaved: () => qc.invalidateQueries({ queryKey: ['sd-form-fields', formId] }) })}
              className="flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 border border-brand-500/25 hover:border-brand-500/50 rounded px-2 py-0.5 transition-colors">
              <Plus size={10} /> Add field
            </button>
          </div>

          {fields.length === 0 ? (
            <div className="text-[11px] text-text-muted px-3 py-6 border border-dashed border-border/40 rounded-card text-center">
              No fields yet — click &quot;Add field&quot; above or use Preview tab → &quot;+ Add field&quot;
            </div>
          ) : (
            <div className="space-y-1">
              {fields.map((f, idx) => {
                const isLayout = f.fieldType === 'SECTION_HEADER' || f.fieldType === 'DIVIDER'
                const typeColor = FIELD_TYPE_COLOR[f.fieldType] || 'text-text-muted bg-surface-overlay border-border'
                const isSelected = selectedElement?.id === f.id

                return (
                  <button key={f.id}
                    onClick={() => onSelectElement({ type: 'form_field', id: f.id, data: { ...f }, screenKey: screen.key, formId })}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-card border text-left transition-all',
                      isSelected
                        ? 'border-brand-500 bg-brand-500/8'
                        : 'border-border hover:border-brand-500/30 bg-background'
                    )}>

                    {/* Sort order handle indicator */}
                    <span className="text-[9px] text-text-muted w-4 text-right shrink-0 font-mono">{f.sortOrder ?? idx}</span>

                    {/* Field type badge */}
                    <span className={cn('text-[8px] font-mono px-1.5 py-0.5 rounded border shrink-0', typeColor)}>
                      {f.fieldType}
                    </span>

                    {/* Label + key */}
                    <div className="flex-1 min-w-0">
                      {isLayout ? (
                        f.fieldType === 'DIVIDER'
                          ? <span className="text-[10px] text-text-muted italic">— divider —</span>
                          : <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{f.label}</span>
                      ) : (
                        <>
                          <span className="text-xs text-text-primary font-medium">{f.label}</span>
                          <span className="text-[9px] font-mono text-text-muted ml-2">{f.fieldKey}</span>
                        </>
                      )}
                    </div>

                    {/* Grid width */}
                    {!isLayout && (
                      <span className="text-[9px] text-text-muted shrink-0">
                        {GRID_LABEL[f.gridCols] || f.gridCols || 'full'}
                      </span>
                    )}

                    {/* Required */}
                    {f.isRequired && (
                      <span className="text-[9px] text-status-fail-fg shrink-0 font-medium">req</span>
                    )}

                    {/* Has conditional */}
                    {f.dependsOnJson && (
                      <span title="Has conditional display rule"
                        className="text-[9px] text-status-warn-fg shrink-0">if</span>
                    )}

                    {/* Options linked */}
                    {f.optionsComponentKey && (
                      <span title={`Options: ${f.optionsComponentKey}`}
                        className="text-[9px] text-brand-400 shrink-0 font-mono truncate max-w-20">{f.optionsComponentKey}</span>
                    )}

                    {/* FIX: Visibility indicator — click field to open inspector where RoleVisibilityEditor lives */}
                    <span title="Click to configure role visibility for this field"
                      className="text-[9px] px-1 py-0.5 rounded border border-border text-text-muted hover:border-brand-500/30 hover:text-brand-400 transition-colors shrink-0">
                      <Eye size={9} />
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Form action buttons — Submit + Cancel are standard, configurable via actions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
              Form buttons ({actions.length + 2} total)
            </p>
            <button
              onClick={() => onSelectElement({ type: 'new_action', screenKey: screen.key })}
              className="flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 border border-brand-500/25 hover:border-brand-500/50 rounded px-2 py-0.5 transition-colors">
              <Plus size={10} /> Add button
            </button>
          </div>

          <div className="space-y-1">
            {/* Submit — built-in, click to configure submit URL / HTTP method */}
            <button
              onClick={() => onSelectElement({ type: 'form_submit_config', screenKey: screen.key })}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-card border text-left transition-all',
                screen?.selectedElement?.type === 'form_submit_config'
                  ? 'border-brand-500 bg-brand-500/8'
                  : 'border-status-pass-bd bg-status-pass-bg hover:border-brand-500/30'
              )}>
              <CheckCircle2 size={13} className="text-status-pass-fg shrink-0" />
              <div className="flex-1">
                <span className="text-xs text-text-primary font-medium">Submit</span>
                <span className="text-[9px] font-mono text-text-muted ml-2">POST → form.submitUrl · click to configure</span>
              </div>
              <span className="text-[9px] text-status-pass-fg font-medium">built-in</span>
            </button>

            {/* Cancel — always present, closes the modal/form */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-card border border-border bg-background">
              <X size={13} className="text-text-muted shrink-0" />
              <div className="flex-1">
                <span className="text-xs text-text-primary font-medium">Cancel</span>
                <span className="text-[9px] font-mono text-text-muted ml-2">closes modal / navigates back</span>
              </div>
              <span className="text-[9px] text-text-muted font-medium">built-in</span>
            </div>

            {/* Configured actions (e.g. Save as Draft) */}
            {actions.map(action => (
              <button key={action.id}
                onClick={() => onSelectElement({ type: 'action', id: action.id, data: action, screenKey: screen.key })}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-card border text-left transition-all',
                  selectedElement?.id === action.id
                    ? 'border-brand-500 bg-brand-500/8'
                    : 'border-border hover:border-brand-500/30 bg-background'
                )}>
                <Zap size={13} className="text-text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-text-primary font-medium">{action.label}</span>
                  <span className="text-[9px] font-mono text-text-muted ml-2">{action.httpMethod} {action.apiEndpoint}</span>
                </div>
                <span className={cn('text-[9px] px-1.5 py-0.5 rounded border',
                  { primary: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
                    danger: 'text-status-fail-fg bg-status-fail-bg border-status-fail-bd',
                    secondary: 'text-text-secondary bg-surface-overlay border-border',
                  }[action.variant] || 'text-text-muted bg-surface-overlay border-border')}>
                  {action.variant}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Form metadata summary */}
        <div className="p-3 rounded-card bg-surface border border-border text-[10px] text-text-muted space-y-1">
          <p><span className="text-text-secondary font-medium">Form key:</span> <code className="font-mono text-brand-400">{screen.key}</code></p>
          <p><span className="text-text-secondary font-medium">Endpoint:</span> <code className="font-mono">GET /v1/ui-config/form/{screen.key}</code></p>
          <p className="text-text-muted">DynamicForm renders this at runtime. Submit posts to the form's configured endpoint.</p>
        </div>
      </div>
    </div>
  )
}

function ElementsTab({ screen, screenType, selectedElement, onSelectElement, roleProfile }) {
  const { data: actionsData } = useQuery({
    queryKey: ['sd-actions', screen.key],
    queryFn: () => sdApi.listActions(screen.key),
    staleTime: 30_000,
  })
  const actions = actionsData?.data?.items || actionsData?.items ||
    (Array.isArray(actionsData?.data) ? actionsData.data : null) || []

  // ── Also fetch components and layout so non-FORM screens render real data ──
  const { data: compData } = useQuery({
    queryKey: ['sd-comp', screen.key],
    queryFn: () => sdApi.listComponents(screen.key),
    staleTime: 30_000,
  })
  const components = compData?.data?.items || compData?.items ||
    (Array.isArray(compData?.data) ? compData.data : null) || []

  const { data: layoutData } = useQuery({
    queryKey: ['sd-layout', screen.key],
    queryFn: () => sdApi.getLayout(screen.key),
    staleTime: 30_000,
    enabled: screen.type === 'LIST' || screen.type === 'DETAIL',
  })
  const layoutItems = layoutData?.data?.items || layoutData?.items ||
    (Array.isArray(layoutData?.data) ? layoutData.data : null) || []
  const layout = Array.isArray(layoutItems) ? layoutItems[0] : layoutItems
  let columns = []
  try { columns = JSON.parse(layout?.columnsJson || '[]') } catch {}

  // ── FORM screens: show fields list instead of generic structural elements ──
  const { data: formRes } = useQuery({
    queryKey: ['sd-form', screen.key],
    queryFn: () => sdApi.getForm(screen.key),
    enabled: screen.type === 'FORM',
    staleTime: 0,
  })
  const formId = useMemo(() => {
    if (!formRes) return null
    const items = formRes?.items || formRes?.data?.items || []
    return Array.isArray(items) ? items[0]?.id ?? null : null
  }, [formRes])

  const { data: fieldsRes } = useQuery({
    queryKey: ['sd-form-fields', formId],
    queryFn: () => sdApi.listFields(formId),
    enabled: screen.type === 'FORM' && !!formId,
    staleTime: 0,
  })
  const formFields = useMemo(() => {
    if (!fieldsRes) return []
    return Array.isArray(fieldsRes) ? fieldsRes
         : Array.isArray(fieldsRes?.data) ? fieldsRes.data : []
  }, [fieldsRes])

  // For FORM screens, render a field list instead
  if (screen.type === 'FORM') {
    return <FormElementsTab
      screen={screen}
      fields={formFields}
      formId={formId}
      selectedElement={selectedElement}
      onSelectElement={onSelectElement}
      actions={actions}
    />
  }

  // ── Structural elements differ by screen type ──────────────────────────────
  // For LIST: columns are the primary elements (real data from layout.columnsJson)
  // For SECTION / ITEM_CARD: components are the primary elements (real data from UiComponents)
  // For DETAIL / PAGE: structural tabs/areas + actions

  return (
    <div className="flex-1 overflow-auto p-4" style={{ background: "var(--color-background-tertiary)" }}>
      <div className="max-w-2xl mx-auto space-y-4">

        {/* ── LIST screen: columns from real layout data ── */}
        {screen.type === 'LIST' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
                Table columns ({columns.length})
              </p>
              <button
                onClick={() => onSelectElement({ type: 'new_column', screenKey: screen.key })}
                className="flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 border border-brand-500/25 hover:border-brand-500/50 rounded px-2 py-0.5 transition-colors">
                <Plus size={10} /> Add column
              </button>
            </div>
            {columns.length === 0 ? (
              <div className="text-[11px] text-text-muted px-3 py-6 border border-dashed border-border/40 rounded-card text-center">
                No columns configured — click &quot;Add column&quot; above or Preview → click any column header
              </div>
            ) : (
              <div className="space-y-1">
                {columns.map((col, idx) => (
                  <button key={col.key || idx}
                    onClick={() => onSelectElement({ type: 'column', data: col, screenKey: screen.key })}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-card border text-left transition-all',
                      selectedElement?.data?.key === col.key
                        ? 'border-brand-500 bg-brand-500/8'
                        : 'border-border hover:border-brand-500/30 bg-background'
                    )}>
                    <Columns2 size={13} className="text-text-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-text-primary font-medium">{col.label || col.key}</span>
                      <span className="text-[9px] font-mono text-text-muted ml-2">{col.key}</span>
                    </div>
                    {col.type && col.type !== 'text' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded border bg-status-info-bg border-status-info-bd text-status-info-fg">{col.type}</span>
                    )}
                    {col.sortable && <SlidersHorizontal size={10} className="text-text-muted" />}
                    {col.hidden && <EyeOff size={10} className="text-status-warn-fg" title="Hidden by default" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SECTION / ITEM_CARD: components from real UiComponents data ── */}
        {(screen.type === 'SECTION' || screen.type === 'ITEM_CARD') && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
                Components ({components.length})
              </p>
            </div>
            {components.length === 0 ? (
              <div className="text-[11px] text-text-muted px-3 py-6 border border-dashed border-border/40 rounded-card text-center">
                No components configured — click a response area in Preview → Inspector → &quot;Quick add component&quot;
              </div>
            ) : (
              <div className="space-y-1">
                {components.map(comp => {
                  const visibleToRole = true // components don't have allowedSides — always shown
                  return (
                    <button key={comp.id}
                      onClick={() => onSelectElement({ type: 'component', id: comp.id, data: comp, screenKey: screen.key })}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-card border text-left transition-all',
                        selectedElement?.id === comp.id
                          ? 'border-brand-500 bg-brand-500/8'
                          : 'border-border hover:border-brand-500/30 bg-background'
                      )}>
                      <Hash size={13} className="text-text-muted shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-text-primary font-medium">{comp.label || comp.componentKey}</span>
                        <span className="text-[9px] font-mono text-text-muted ml-2">{comp.componentKey}</span>
                      </div>
                      <span className="text-[8px] px-1.5 py-0.5 rounded border bg-brand-500/10 border-brand-500/20 text-brand-400 font-mono">{comp.componentType}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── DETAIL / PAGE: structural tabs or areas (type-aware) ── */}
        {(screen.type === 'DETAIL' || screen.type === 'PAGE') && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Page structure</p>
              {screen.type === 'DETAIL' && (
                <button
                  onClick={() => onSelectElement({ type: 'new_detail_tab', screenKey: screen.key, layout })}
                  className="flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 border border-brand-500/25 hover:border-brand-500/50 rounded px-2 py-0.5 transition-colors">
                  <Plus size={10} /> Add tab
                </button>
              )}
            </div>
            <div className="space-y-1">

              {/* ── Header zone — always first for DETAIL screens ── */}
              {screen.type === 'DETAIL' && (
                <button
                  onClick={() => onSelectElement({ type: 'header_zone', screenKey: screen.key })}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-card border text-left transition-all',
                    selectedElement?.type === 'header_zone'
                      ? 'border-brand-500 bg-brand-500/8'
                      : 'border-border hover:border-brand-500/30 bg-background'
                  )}>
                  <Layout size={13} className="text-text-muted shrink-0" />
                  <span className="text-xs text-text-primary flex-1">Header zone</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border bg-status-warn-bg border-status-warn-bd text-status-warn-fg">
                    configure fields
                  </span>
                </button>
              )}

              {/* ── Tabs — read from layout.tabsJson + PAGE areas ── */}
              {(screen.type === 'DETAIL'
                ? (() => {
                    const TAB_ICONS = {
                      overview: Layout, evidence: FileEdit, comments: Activity,
                      workflow: GitBranch, history: Flag,
                    }
                    let tabDefs = []
                    try {
                      const parsed = JSON.parse(layout?.tabsJson || 'null')
                      if (Array.isArray(parsed) && parsed.length > 0) {
                        tabDefs = parsed.map(t => {
                          const rawLabel = typeof t === 'string' ? t : t.label
                          const rawKey   = typeof t === 'string'
                            ? t.toLowerCase().replace(/\s+/g, '_')
                            : (t.key || t.label?.toLowerCase().replace(/\s+/g, '_'))
                          return {
                            key: `tab_${rawKey}`, tabKey: rawKey,
                            label: `${rawLabel} tab`, rawLabel,
                            icon: TAB_ICONS[rawKey] || Hash,
                            isCap: isCapabilityTab(rawKey),
                          }
                        })
                      }
                    } catch {}
                    if (tabDefs.length === 0) {
                      tabDefs = [
                        { key: 'tab_overview', tabKey: 'overview', label: 'Overview tab',  rawLabel: 'Overview', icon: Layout,    isCap: false },
                        { key: 'tab_evidence', tabKey: 'evidence', label: 'Evidence tab',  rawLabel: 'Evidence', icon: FileEdit,  isCap: true  },
                        { key: 'tab_comments', tabKey: 'comments', label: 'Comments tab',  rawLabel: 'Comments', icon: Activity,  isCap: true  },
                        { key: 'tab_workflow', tabKey: 'workflow', label: 'Workflow tab',  rawLabel: 'Workflow', icon: GitBranch, isCap: true  },
                        { key: 'tab_history',  tabKey: 'history',  label: 'History tab',   rawLabel: 'History',  icon: Flag,      isCap: true  },
                      ]
                    }
                    return tabDefs
                  })()
                : [
                    { key: 'page_main',    label: 'Primary content area', rawLabel: 'Primary content area', icon: PanelLeft,  isCap: false, tabKey: null },
                    { key: 'page_sidebar', label: 'Sidebar panel',        rawLabel: 'Sidebar panel',        icon: PanelRight, isCap: false, tabKey: null },
                  ]
              ).map(el => (
                <button key={el.key}
                  onClick={() => onSelectElement({
                    type:      el.tabKey ? el.key : el.key,
                    label:     el.label,
                    tab:       el.rawLabel || el.label,
                    tabKey:    el.tabKey,
                    screenKey: screen.key,
                    layout,
                  })}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-card border text-left transition-all',
                    selectedElement?.type === el.key
                      ? 'border-brand-500 bg-brand-500/8'
                      : 'border-border hover:border-brand-500/30 bg-background'
                  )}>
                  <el.icon size={13} className="text-text-muted shrink-0" />
                  <span className="text-xs text-text-primary flex-1">{el.label}</span>
                  {/* Badge: capability (hardcoded component) vs configurable (has fields) */}
                  {el.isCap
                    ? <span className="text-[9px] px-1.5 py-0.5 rounded border bg-status-pass-bg border-status-pass-bd text-status-pass-fg">component</span>
                    : el.tabKey
                      ? <span className="text-[9px] px-1.5 py-0.5 rounded border bg-status-warn-bg border-status-warn-bd text-status-warn-fg">configure fields</span>
                      : <span className="text-[9px] px-1.5 py-0.5 rounded border bg-status-pass-bg border-status-pass-bd text-status-pass-fg">click to configure</span>
                  }
                </button>
              ))}
            </div>
          </div>
        )}
        {/* ── Action buttons — all screen types ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
              Action buttons ({actions.length})
            </p>
            <button
              onClick={() => onSelectElement({ type: 'new_action', screenKey: screen.key })}
              className="flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 border border-brand-500/25 hover:border-brand-500/50 rounded px-2 py-0.5 transition-colors">
              <Plus size={10} /> Add button
            </button>
          </div>
          {actions.length === 0 ? (
            <div className="text-[11px] text-text-muted px-3 py-4 border border-dashed border-border/40 rounded-card text-center">
              No actions configured — add them in Preview → click &quot;+ Add action&quot;
            </div>
          ) : (
            <div className="space-y-1">
              {actions.map(action => {
                const visibleToRole = !action.allowedSides ||
                  action.allowedSides.split(',').some(s => s.trim() === roleProfile?.side)
                const sodBlocked = roleProfile?.sod && ['APPROVE_ANSWER', 'APPROVE'].includes(action.actionKey)
                return (
                  <button key={action.id}
                    onClick={() => onSelectElement({ type: 'action', id: action.id, data: action, screenKey: screen.key })}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-card border text-left transition-all',
                      selectedElement?.id === action.id
                        ? 'border-brand-500 bg-brand-500/8'
                        : 'border-border hover:border-brand-500/30 bg-background'
                    )}>
                    <Zap size={13} className="text-text-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary">{action.label}</p>
                      <p className="text-[9px] font-mono text-text-muted truncate">{action.httpMethod} {action.apiEndpoint}</p>
                    </div>
                    {sodBlocked && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded border bg-status-fail-bg border-status-fail-bd text-status-fail-fg">SoD blocked</span>
                    )}
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded border',
                      visibleToRole
                        ? 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg'
                        : 'bg-surface-overlay border-border text-text-muted')}>
                      {visibleToRole ? 'visible' : 'hidden'}
                    </span>
                    <span className="text-[9px] text-text-muted font-mono">{action.allowedSides || 'all'}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ─── NEW: JSON preview tab ────────────────────────────────────────────────────
// Shows the live resolved JSON from GET /v1/ui-config/screen/:key.
// This is exactly what CompoundSectionRenderer receives at runtime.

function JsonPreviewTab({ screen }) {
  const isForm = screen.type === 'FORM'

  // FORM screens: fetch from /v1/ui-config/form/:key — returns field definitions
  // Other screens: fetch from /v1/ui-config/screen/:key — returns screen config
  const formEndpoint = `/v1/ui-config/form/${screen.key}`
  const screenEndpoint = `/v1/ui-config/screen/${screen.key}`
  const endpoint = isForm ? formEndpoint : screenEndpoint

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sd-resolved-json', screen.key],
    queryFn: () => isForm
      ? api.get(formEndpoint)
      : sdApi.resolveScreen(screen.key),
    staleTime: 0,
    enabled: !!screen.key,
  })

  const json = data?.data || data

  const template = Object.values(SCREEN_TEMPLATES).find(
    t => t.itemKey === screen.key || t.sectionKey === screen.key
  )

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Context-aware instructions */}
        {isForm ? (
          <div className="p-3 rounded-card bg-brand-500/5 border border-brand-500/20 text-[11px] text-text-secondary space-y-1">
            <p className="font-medium text-text-primary">How to link this form to a module blueprint</p>
            <p>1. Open <span className="font-mono text-brand-400">/admin/modules</span> → select your module blueprint → click Edit</p>
            <p>2. Set <span className="font-mono text-brand-400">createFormKey = {screen.key}</span></p>
            <p>3. The blueprint will show a &quot;New [entity]&quot; button that opens this form at runtime.</p>
            <p className="text-text-muted">DynamicForm fetches this endpoint at render time. Add fields in Preview or Elements tab.</p>
          </div>
        ) : (
          <div className="p-3 rounded-card bg-brand-500/5 border border-brand-500/20 text-[11px] text-text-secondary space-y-1">
            <p className="font-medium text-text-primary">How to link this key to a blueprint section</p>
            <p>1. Open <span className="font-mono text-brand-400">/admin/workflows</span> → select your workflow → click a step</p>
            <p>2. In the section editor, set <span className="font-mono text-brand-400">itemScreenKey = {template?.itemKey || screen.key}</span></p>
            {template?.sectionKey && (
              <p>3. Set <span className="font-mono text-brand-400">sectionScreenKey = {template.sectionKey}</span></p>
            )}
            <p className="text-text-muted">The engine snapshots these keys at task activation — running instances are never affected by changes here.</p>
          </div>
        )}

        {/* Live JSON */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
            GET {endpoint.toUpperCase()}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary transition-colors">
              <RefreshCw size={11} /> Refresh
            </button>
            {json && (
              <button
                onClick={() => { navigator.clipboard.writeText(JSON.stringify(json, null, 2)); toast.success('JSON copied') }}
                className="flex items-center gap-1 text-[10px] text-text-muted hover:text-brand-400 transition-colors">
                <Copy size={11} /> Copy
              </button>
            )}
            <a href={endpoint} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-brand-400 transition-colors">
              <ExternalLink size={11} /> Open
            </a>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-text-muted text-sm">Loading…</div>
        ) : (
          <pre className="text-xs font-mono text-text-primary bg-surface border border-border rounded-card p-4 overflow-auto leading-relaxed">
            {JSON.stringify(json, null, 2)}
          </pre>
        )}

        {/* Seed SQL hint */}
        <div className="p-3 rounded-card bg-surface border border-border text-xs text-text-secondary">
          <p className="font-medium text-text-secondary mb-1">
            {isForm ? 'Generate seed SQL for this form' : 'Generate seed SQL for this screen config'}
          </p>
          <p>Run in your MySQL / Postgres instance to pre-populate these {isForm ? 'form fields' : 'screen keys'} for new tenants:</p>
          <code className="block mt-2 font-mono text-[10px] text-brand-400">
            {isForm
              ? `INSERT INTO ui_form_fields (form_id, field_key, field_type, label, …) VALUES …`
              : `INSERT INTO ui_actions (screen_key, action_key, label, …) VALUES …`}
          </code>
        </div>
      </div>
    </div>
  )
}

// ─── NEW: Template picker ─────────────────────────────────────────────────────
// Slide-over panel showing all module templates grouped by GRC domain.
// Admin picks one → keys are pre-populated, actions seeded.

function TemplatePicker({ onClose, onApply }) {
  const groups = [...new Set(Object.values(SCREEN_TEMPLATES).map(t => t.group))]

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* backdrop */}
      <div className="flex-1 bg-on-dark-inv/50" onClick={onClose} />

      {/* panel */}
      <div className="w-96 bg-surface border-l border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-text-primary">Template library</p>
            <p className="text-[11px] text-text-muted">Pick a template to start — keys + default actions are seeded</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {groups.map(group => (
            <div key={group}>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">{group}</p>
              <div className="space-y-2">
                {Object.entries(SCREEN_TEMPLATES)
                  .filter(([, t]) => t.group === group)
                  .map(([key, tmpl]) => {
                    const st = SCREEN_TYPES[tmpl.screenType]
                    return (
                      <button key={key}
                        onClick={() => onApply(tmpl)}
                        className="w-full flex items-start gap-3 p-3 rounded-card border border-border hover:border-brand-500/40 bg-background hover:bg-brand-500/5 text-left transition-all group shadow-sm">
                        <div className={cn('w-8 h-8 rounded-card flex items-center justify-center shrink-0 border', st?.color)}>
                          {st && <st.icon size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-text-primary">{tmpl.label}</p>
                          <p className="text-[10px] text-text-muted mt-0.5">{tmpl.desc}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {tmpl.itemKey && (
                              <code className="text-[9px] font-mono bg-brand-500/10 border border-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded">
                                item: {tmpl.itemKey}
                              </code>
                            )}
                            {tmpl.sectionKey && (
                              <code className="text-[9px] font-mono bg-status-tag-bg border border-status-tag-bd text-status-tag-fg px-1.5 py-0.5 rounded">
                                section: {tmpl.sectionKey}
                              </code>
                            )}
                            {tmpl.formKey && (
                              <code className="text-[9px] font-mono bg-status-warn-bg border border-status-warn-bd text-status-warn-fg px-1.5 py-0.5 rounded">
                                form: {tmpl.formKey}
                              </code>
                            )}
                          </div>
                        </div>
                        <ArrowRight size={13} className="text-text-muted group-hover:text-brand-400 transition-colors shrink-0 mt-1" />
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}