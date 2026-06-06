/**
 * UniversalModulePage — renders ANY GRC module without module-specific code.
 *
 * Route: /module/:entityType        → list view
 * Route: /module/:entityType/:id    → detail view
 *
 * BACKWARD COMPATIBILITY:
 * Existing routes (VendorListPage, etc.) are completely untouched.
 * This page only handles /module/* routes.
 * Migration: once a ModuleBlueprint is seeded for VENDOR, you can
 * optionally point /tprm/vendors at /module/VENDOR — but it's not required.
 *
 * HOW IT WORKS:
 * 1. Reads ModuleBlueprint by entityType from /v1/admin/module-blueprints/by-type/:entityType
 * 2. Fetches ViewContext for the current user + entity
 * 3. Fetches screen config for list/detail from /v1/ui-config/screen/:screenKey
 * 4. Renders DataTable (list) or tabbed detail panel (detail) driven entirely by config
 */
import { LibraryMappingTab }         from '../../components/audit/LibraryMappingTab'
import { TemplateSectionsTab }    from '../../components/audit/TemplateSectionsTab'
import { EngagementSectionsTab }         from '../../components/audit/EngagementSectionsTab'
import { EngagementControlsTab }         from '../../components/audit/EngagementControlsTab'
import { ControlInstanceTestsTab }       from '../../components/audit/ControlInstanceTestsTab'
import { ControlInstancePoliciesTab }    from '../../components/audit/ControlInstancePoliciesTab'
import { ControlInstanceEvidenceTab }    from '../../components/audit/ControlInstanceEvidenceTab'
import { TestInstanceMappedControlsTab } from '../../components/audit/TestInstanceMappedControlsTab'
import { PolicyInstanceMappedControlsTab } from '../../components/audit/PolicyInstanceMappedControlsTab'
import { PolicyContentTab }              from '../../components/audit/PolicyContentTab'
import { PolicyVersionsTab }             from '../../components/audit/PolicyVersionsTab'
import { TestPolicyCsvImportModal }  from '../../components/audit/TestPolicyCsvImportModal'
import { WorkflowTimeline }       from '../../components/workflow/WorkflowTimeline'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, ArrowLeft, RefreshCw, Search, GitBranch, CheckCircle2,
  Upload, MessageSquare, FileText, Activity, AlertTriangle, Eye,
  ChevronRight, Pencil, Trash2, ExternalLink, Info, Lock, X, CheckSquare,
  Hash, ServerCrash,
} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Button } from '../../components/ui/Button'
import { Badge, DynamicBadge } from '../../components/ui/Badge'
import { COLOR_MAP } from '../../config/constants'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { DataTable } from '../../components/ui/DataTable'
import { DynamicForm } from '../../components/forms/DynamicForm'
import { CommentFeed } from '../../components/comments/CommentFeed'
import { ItemActionItems } from '../../components/item-panel/ItemActionItems'
import EvidenceUploader from '../../components/ui/EvidenceUploader'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'
import api from '../../config/axios.config'
import { uiConfigApi } from '../../api/uiConfig.api'
import { commentsApi } from '../../api/comments.api'
// ── v2 additions ─────────────────────────────────────────────────────────────
import EntityTreeView          from '../../components/module/EntityTreeView'
import { useModuleSocket,
         useModuleListSocket } from '../../hooks/useModuleSocket'

// ─── API ──────────────────────────────────────────────────────────────────────

const moduleApi = {
  blueprint:    (entityType) => api.get(`/v1/admin/module-blueprints/by-type/${entityType}`),
  viewContext:  (entityType, entityId, stepInstanceId, taskId) =>
    api.get('/v1/ui-config/view-context', { params: { entityType, entityId: entityId || undefined, stepInstanceId: stepInstanceId || undefined, taskId: taskId || undefined } }),
  screenConfig: (screenKey) => api.get(`/v1/ui-config/screen/${screenKey}`),
  list:  (basePath, params) => api.get(basePath, { params }),
  get:   (basePath, id) => api.get(`${basePath}/${id}`),
  create:(basePath, data) => api.post(basePath, data),
  update:(basePath, id, data) => api.put(`${basePath}/${id}`, data),
  patch: (basePath, id, data) => api.patch(`${basePath}/${id}`, data),
  delete:(basePath, id) => api.delete(`${basePath}/${id}`),
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

const useBlueprint = (entityType) => useQuery({
  queryKey: ['module-blueprint-type', entityType],
  queryFn: () => moduleApi.blueprint(entityType),
  enabled: !!entityType,
  staleTime: 0,  // always fresh — tabs_json changes via Screen Designer
})

const useViewContext = (entityType, entityId, stepInstanceId, taskId) => useQuery({
  queryKey: ['view-context', entityType, entityId, stepInstanceId, taskId],
  queryFn: () => moduleApi.viewContext(entityType, entityId, stepInstanceId, taskId),
  enabled: !!entityType,
  staleTime: 30 * 1000,
})

const useScreenConfig = (screenKey) => useQuery({
  queryKey: ['screen-config', screenKey],
  queryFn: () => moduleApi.screenConfig(screenKey),
  enabled: !!screenKey,
  staleTime: 5 * 60 * 1000,
})

const useEntityList = (basePath, params) => useQuery({
  queryKey: ['module-list', basePath, params],
  queryFn: () => moduleApi.list(basePath, params),
  enabled: !!basePath,
  keepPreviousData: true,
})

const useEntityDetail = (basePath, id) => useQuery({
  queryKey: ['module-detail', basePath, id],
  queryFn: () => moduleApi.get(basePath, id),
  enabled: !!basePath && !!id,
})

// ─── Main Router ──────────────────────────────────────────────────────────────

export default function UniversalModulePage() {
  // ── v2: support both flat and parent-scoped routes ────────────────────────
  // Flat:          /module/:entityType[/:id]
  // Parent-scoped: /module/:parentEntityType/:parentId/:entityType[/:id]
  // The router in App.jsx maps both patterns to this component via different
  // param names — we detect which by checking if parentEntityType is present.
  const params = useParams()

  // Normalise: in parent-scoped routes, react-router exposes
  //   parentEntityType, parentId, entityType, id
  // In flat routes:
  //   entityType, id
  const rawEntityType = params.entityType || params.rawEntityType
  const entityType    = rawEntityType?.toUpperCase()
  const id            = params.id
  const parentId      = params.parentId || null

  const { data: bpRes, isLoading: bpLoading, isError: bpError } = useBlueprint(entityType)
  const bp = bpRes?.data || bpRes

  if (bpLoading) return <LoadingState />
  if (bpError)   return <ServerErrorState />
  if (!bp) return <NotFoundState entityType={entityType} />

  // ── Resolve API base path — substitute parentId if blueprint defines parentContextJson ──
  // This is the core of the parent-scoped module support.
  // e.g. parentContextJson.apiBasePath = "/v1/audit/engagements/{engagementId}/controls"
  //      parentId = 42  →  resolvedApiPath = "/v1/audit/engagements/42/controls"
  let resolvedBp = bp
  if (parentId && bp.parentContextJson) {
    try {
      const ctx = JSON.parse(bp.parentContextJson)
      const resolvedPath = ctx.apiBasePath
        ? ctx.apiBasePath.replace(`{${ctx.parentIdParam || 'parentId'}}`, parentId)
        : bp.apiBasePath
      resolvedBp = { ...bp, apiBasePath: resolvedPath, _parentId: parentId, _parentCtx: ctx }
    } catch (e) {
      console.warn('[UniversalModulePage] Failed to parse parentContextJson:', e)
    }
  }

  return id
    ? <ModuleDetailView bp={resolvedBp} id={id} />
    : <ModuleListView   bp={resolvedBp} />
}

// ─── List View ────────────────────────────────────────────────────────────────

function ModuleListView({ bp }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen,  setImportOpen]  = useState(false)
  const [sortBy,       setSortBy]       = useState(null)
  const [sortDir,      setSortDir]      = useState('asc')
  const [selectedIds,  setSelectedIds]  = useState([])

  const { data: vcRes, isLoading: vcLoading } = useViewContext(bp.entityType, null)
  const vc = vcRes?.data || vcRes || {}

  // FIX: also fetch screen designer actions for this list screen so the toolbar
  // shows the correct buttons (e.g. "New Issue" wired to issue_create_form).
  const { data: listActionsRes } = useQuery({
    queryKey: ['module-list-actions', bp.listScreenKey],
    queryFn: () => uiConfigApi.actions(bp.listScreenKey),
    enabled: !!bp.listScreenKey,
    staleTime: 5 * 60 * 1000,
  })
  const listScreenActions = useMemo(() => {
    const raw = listActionsRes?.items || listActionsRes?.data?.items ||
      (Array.isArray(listActionsRes?.data) ? listActionsRes.data : null) ||
      (Array.isArray(listActionsRes) ? listActionsRes : null) || []
    return raw.filter(a => a.isActive !== false)
  }, [listActionsRes])

  const { data: screenRes } = useScreenConfig(bp.listScreenKey)
  const screenConfig = screenRes?.data || screenRes

  const params = { search: search || undefined, skip: page * 20, take: 20,
    sortBy: sortBy || undefined, sortDir: sortBy ? sortDir : undefined }
  const { data: listRes, isLoading } = useEntityList(bp.apiBasePath, params)
  // Handle all API response shapes:
  // { items: [...], pagination: {...} }  — our standard PaginatedResponse (axios strips outer data wrapper)
  // { data: { items: [...] } }           — double-wrapped (shouldn't happen but guard for it)
  // { content: [...] }                   — Spring Page
  // [...]                                — raw array
  const items = Array.isArray(listRes)
    ? listRes
    : Array.isArray(listRes?.items)
      ? listRes.items
      : Array.isArray(listRes?.data?.items)
        ? listRes.data.items
        : Array.isArray(listRes?.data)
          ? listRes.data
          : Array.isArray(listRes?.content)
            ? listRes.content
            : []
  const total = listRes?.pagination?.totalItems
    ?? listRes?.data?.pagination?.totalItems
    ?? listRes?.totalElements
    ?? items.length

  const createMut = useMutation({
    mutationFn: (data) => moduleApi.create(bp.apiBasePath, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      toast.success(`${bp.displayName} created successfully`)
      // AUDIT_POLICY with RICH_TEXT: go straight to the editor after creation.
      // No point landing back on the list — the user needs to write the content.
      if (bp.entityType === 'AUDIT_POLICY') {
        const created = res?.data?.data || res?.data || res
        const newId = created?.id
        if (newId) navigate(`/audit/policies/${newId}/edit`)
      }
    },
    onError: (e) => {
      setCreateOpen(true) // re-open on error so user can fix
      toast.error(e?.response?.data?.message || 'Failed to create')
    },
  })

  // Drawer — row click opens a slide-over with full entity data + interactive fields + actions.
  // The drawer uses detailScreenKey config (same as full page) — configure once, applies to both.
  const [drawerId, setDrawerId] = useState(null)
  // Fetch screen config for list view — needed for layoutMode
  const { data: listScreenRes } = useScreenConfig(bp.detailScreenKey)
  // layoutMode from DB: 'DRAWER' (default) or 'FULL_PAGE'
  // Drives whether clicking a list row opens a side drawer or navigates to full detail page
  const layoutMode = listScreenRes?.layout?.layoutMode || 'DRAWER'

  // All rows open the drawer so users can see metadata (Overview, Linked Controls, Versions).
  // For AUDIT_POLICY RICH_TEXT the drawer shows an "Edit Content" button that navigates to the editor.
  const handleRowClick = (row) => {
    if (layoutMode === 'FULL_PAGE') {
      // Navigate directly to full detail page — no drawer
      const base = bp.listScreenKey?.replace('_list', '') || bp.entityType.toLowerCase().replace('_', '')
      navigate(`/module/${base}/${row.id}`)
    } else {
      setDrawerId(row.id)
    }
  }

  // Build columns from screen config or blueprint field schema.
  // FIX: ScreenConfigResponse wraps columns inside layout.columnsJson (a JSON string stored in UiLayout).
  // The previous check `screenConfig?.columns` always returns undefined — the correct path is
  // screenConfig.layout.columnsJson which must be parsed from JSON.
  const columns = useMemo(() => {
    if (screenConfig?.layout?.columnsJson) {
      try {
        const cols = JSON.parse(screenConfig.layout.columnsJson)
        if (Array.isArray(cols) && cols.length > 0) return cols
      } catch {}
    }
    // Fallback: build from first section's fields in blueprint schema
    let schema = { sections: [] }
    try { schema = JSON.parse(bp.fieldsSchemaJson || '{}') } catch {}
    const firstSection = schema.sections?.[0]
    if (!firstSection) return [{ key: 'id', label: 'ID' }]
    return firstSection.fields
      ?.filter(f => f.showInList !== false && f.type !== 'SECTION_HEADER' && f.type !== 'DIVIDER')
      ?.slice(0, 6)
      ?.map(f => ({ key: f.key, label: f.label })) || [{ key: 'id', label: 'ID' }]
  }, [screenConfig, bp.fieldsSchemaJson])

  // FIX: canCreate flashed because `vc.permissions?.includes() !== false` is `true`
  // while vc is still loading (permissions === undefined → undefined !== false → true).
  // Now we wait until vcLoading is false before evaluating permissions.
  const canCreate = !vcLoading && bp.createFormKey && (
    vc.permissions === undefined ||
    vc.permissions.includes(`${bp.entityType.toLowerCase()}.create`)
  )

  // State for form-modal triggered by a screen designer action
  const [listFormAction, setListFormAction] = useState(null)

  // Generic action executor — handles three action types driven by payloadTemplateJson:
  //   { "__formKey": "issue_create_form" }  → open DynamicForm modal with that form
  //   { "__navRoute": "/module/issue/new" }  → navigate to route
  //   anything else / absent              → direct API call (POST/PUT/PATCH/DELETE)
  // This means screen designer's "New Issue" action can set __formKey = issue_create_form
  // and the button will open the correct form without any hardcoded wiring.
  const handleListAction = useCallback(async (action) => {
    let meta = {}
    try { meta = JSON.parse(action.payloadTemplateJson || '{}') } catch {}

    if (meta.__formKey) { setListFormAction(action); return }
    if (meta.__navRoute) { navigate(meta.__navRoute); return }
    if (meta.__openImport) { setImportOpen(true); return }
    if (!action.apiEndpoint) return
    try {
      await api({ method: action.httpMethod || 'POST', url: action.apiEndpoint })
      qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      toast.success(action.label + ' successful')
    } catch (e) { toast.error(e?.response?.data?.message || action.label + ' failed') }
  }, [bp.apiBasePath, navigate, qc])

  const handleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
  }

  // Bulk action executor — reads payloadTemplateJson.__bulk = true to identify bulk actions
  const handleBulkAction = useCallback(async (action) => {
    if (selectedIds.length === 0) { toast('Select at least one record'); return }
    let meta = {}
    try { meta = JSON.parse(action.payloadTemplateJson || '{}') } catch {}
    try {
      await api({ method: action.httpMethod || 'POST',
        url: action.apiEndpoint, data: { ids: selectedIds, ...Object.fromEntries(Object.entries(meta).filter(([k]) => !k.startsWith('__'))) } })
      qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      setSelectedIds([])
      toast.success(action.label + ' applied to ' + selectedIds.length + ' records')
    } catch (e) { toast.error(e?.response?.data?.message || action.label + ' failed') }
  }, [bp.apiBasePath, qc, selectedIds])

  // ── v2: live list updates via WebSocket ─────────────────────────────────────
  useModuleListSocket(bp)

  // ── v2: parent breadcrumb when this is a child-scoped module ─────────────
  const parentCtx   = bp._parentCtx || null
  const parentLabel = parentCtx
    ? `${parentCtx.parentEntityType?.replace(/_/g,' ')} #${bp._parentId}`
    : null

  return (
    <PageLayout
      title={bp.displayNamePlural || bp.displayName}
      subtitle={parentLabel
        ? `${parentLabel} · ${total} record${total !== 1 ? 's' : ''}`
        : `${total} record${total !== 1 ? 's' : ''}`}
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${bp.displayNamePlural?.toLowerCase() || ''}…`}
              className="w-52 pl-8 pr-3 h-8 text-xs bg-surface-overlay border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          {/* FIX: Render screen designer actions for this list screen.
              This is the single source of truth for toolbar buttons — no more
              hardcoded "New entity" button. Each action's payloadTemplateJson
              controls what happens: __formKey → form modal, __navRoute → navigate,
              direct endpoint → API call. Fallback: show create button if no
              screen actions are configured yet. */}
          {listScreenActions.length > 0
            ? listScreenActions.map(action => (
              <Button key={action.id} size="sm"
                variant={action.variant === 'secondary' ? 'secondary' : 'primary'}
                icon={action.actionKey?.includes('CREATE') || action.actionKey?.includes('NEW') ? Plus : undefined}
                onClick={() => handleListAction(action)}>
                {action.label}
              </Button>
            ))
            : canCreate && (
              <Button icon={Plus} size="sm" onClick={() => setCreateOpen(true)}>
                New {bp.displayName}
              </Button>
            )
          }
        </div>
      }
    >
      {/* SoD / access violations banner */}
      {vc.sodViolations?.length > 0 && <SodBanner violations={vc.sodViolations} />}

      <div className="p-6">
        {/* ── v2: tree view for modules with supportsTree=true ── */}
        {bp.supportsTree
          ? (
            <EntityTreeView
              items={items}
              bp={bp}
              screenConfig={screenConfig}
              loading={isLoading}
              onRowClick={handleRowClick}
              emptyMessage={`No ${bp.displayNamePlural?.toLowerCase() || 'records'} found`}
            />
          ) : (
            <>
              {/* Bulk action bar — shown when rows are selected */}
              {selectedIds.length > 0 && (() => {
                const bulkActions = listScreenActions.filter(a => {
                  try { return JSON.parse(a.payloadTemplateJson || '{}')['__bulk'] === true } catch { return false }
                })
                if (!bulkActions.length) return null
                return (
                  <div className="flex items-center gap-3 px-4 py-2 mb-3 rounded-lg bg-brand-500/8 border border-brand-500/20 text-xs">
                    <span className="text-brand-400 font-medium">{selectedIds.length} selected</span>
                    <div className="flex items-center gap-2">
                      {bulkActions.map(a => (
                        <Button key={a.id} size="sm" variant="secondary" onClick={() => handleBulkAction(a)}>{a.label}</Button>
                      ))}
                    </div>
                    <button onClick={() => setSelectedIds([])} className="ml-auto text-text-muted hover:text-text-primary transition-colors">✕ Clear</button>
                  </div>
                )
              })()}
              <DataTable
                columns={columns}
                config={screenConfig}
                data={items}
                loading={isLoading || !screenConfig}
                onRowClick={handleRowClick}
                emptyMessage={`No ${bp.displayNamePlural?.toLowerCase() || 'records'} found`}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                selectable={!!screenConfig?.layout?.selectable}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
              />
            </>
          )
        }
      </div>

      {/* Interactive entity drawer — uses detailScreenKey config, same as full page */}
      {drawerId && (
        <EntityDrawer
          entityId={drawerId}
          bp={bp}
          onClose={() => setDrawerId(null)}
          onOpenFull={() => {
            navigate(`/module/${bp.entityType.toLowerCase()}/${drawerId}`)
            setDrawerId(null)
          }}
        />
      )}

      {/* TestPolicyCsvImportModal — sibling, not nested inside bp.createFormKey */}
      {importOpen && (
        <TestPolicyCsvImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={() => { setImportOpen(false) }}
        />
      )}

      {/* Create modal — fallback when no screen actions are configured */}
      {bp.createFormKey && (
        <Modal open={createOpen} onClose={() => setCreateOpen(false)}
          title={`New ${bp.displayName}`}
          size="lg"
        >
          <DynamicForm
            formKey={bp.createFormKey}
            // FIX: mutateAsync (not mutate) so a rejected promise propagates to
            // DynamicForm's handleFormSubmit catch block, which then calls setError()
            // per field and shows inline validation messages instead of a silent failure.
            onSubmit={(data) => {
              setCreateOpen(false)  // close immediately — prevents double-submit
              createMut.mutate(data)
            }}
            loading={createMut.isPending}
            submitLabel={`Create ${bp.displayName}`}
          />
        </Modal>
      )}

      {/* FIX: Modal for screen designer actions that set __formKey.
          The form submits to the action's apiEndpoint if set, otherwise
          to the form's own configured submitUrl. */}
      {listFormAction && (() => {
        let meta = {}
        try { meta = JSON.parse(listFormAction.payloadTemplateJson || '{}') } catch {}
        const formKey = meta.__formKey
        return (
          <Modal open onClose={() => setListFormAction(null)}
            title={listFormAction.label}
            size="lg"
          >
            <DynamicForm
              formKey={formKey}
              onSubmit={async (data) => {
                try {
                  const endpoint = listFormAction.apiEndpoint || bp.apiBasePath
                  await api({ method: listFormAction.httpMethod || 'POST', url: endpoint, data })
                  qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
                  toast.success(`${bp.displayName} created`)
                  setListFormAction(null)
                } catch (e) { toast.error(e?.response?.data?.message || 'Failed') }
              }}
              submitLabel={listFormAction.label}
            />
          </Modal>
        )
      })()}
    </PageLayout>
  )
}

// ─── Detail View ──────────────────────────────────────────────────────────────

const BASE_TABS = [
  // always:true — these show on every entity unconditionally (GRC audit requirements)
  { key: 'overview', label: 'Overview',      icon: Eye,          always: true },

  // Capability tabs — only shown when blueprint explicitly enables them
  // (bp.supportsXxx = true) OR when sdTabKeys from tabsJson includes the key.
  // Default is hidden — admin must enable from Blueprint Settings → Capabilities.
  { key: 'workflow', label: 'Workflow',      icon: GitBranch,    cap: 'supportsWorkflow' },
  { key: 'actions',  label: 'Action items',  icon: CheckCircle2, cap: 'supportsActionItems' },
  { key: 'evidence', label: 'Evidence',      icon: Upload,       cap: 'supportsDocuments' },
  { key: 'comments', label: 'Comments',      icon: MessageSquare,cap: 'supportsComments' },

  // always:true — audit trail required for every GRC entity
  { key: 'history',  label: 'History',       icon: Activity,     always: true },
]

// Capability tab keys — these are always rendered by a fixed component, not SD fields
const CAPABILITY_TAB_KEYS = new Set(['overview','workflow','actions','evidence','comments','history'])

function ModuleDetailView({ bp, id }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  // Smart default tab — driven by snap_step_action from ViewContext.
  // Resolves after vc loads, so we use useEffect to update after first render.
  // ASSIGN step → sections tab (Lead Auditor assigning sections)
  // REVIEW/EVALUATE → controls tab (Auditor reviewing test results)
  // FILL/APPROVE/ACKNOWLEDGE → overview (default)
  const [tab, setTab] = useState('overview')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // ── Inline field editing state (Wrike-style, same as EntityDrawer) ──────────
  const [editingKey, setEditingKey] = useState(null)
  const [editValue,  setEditValue]  = useState('')
  const [saving,     setSaving]     = useState(false)

  const startEdit = (field) => {
    setEditingKey(field.fieldKey || field.key)
    setEditValue(entity?.[field.fieldKey || field.key] ?? '')
  }
  const cancelEdit = () => { setEditingKey(null); setEditValue('') }
  const saveField  = async (fieldKey) => {
    setSaving(true)
    try {
      await moduleApi.patch(bp.apiBasePath, id, { [fieldKey]: editValue || null })
      qc.invalidateQueries({ queryKey: ['module-detail', bp.apiBasePath, id] })
      toast.success('Saved')
      setEditingKey(null)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed')
    } finally { setSaving(false) }
  }

  // ── Workflow task context — injected by TaskInbox when opened from a task ──
  // URL: /module/issue/1?stepInstanceId=42&taskId=7
  // stepInstanceId → passed to useViewContext so the backend resolves field-level
  // access for this specific workflow step (FILL/REVIEW/APPROVE etc.)
  // taskId → shown in the task context banner so the user knows which task they're on
  const [searchParams] = useSearchParams()
  const stepInstanceId = searchParams.get('stepInstanceId') || undefined
  const taskId         = searchParams.get('taskId') || undefined

  const { data: entityRes, isLoading, isError } = useEntityDetail(bp.apiBasePath, id)
  const entity = entityRes?.data || entityRes

  // Gap 3: pass stepInstanceId so backend resolves step-action-aware editableFields
  const { data: vcRes } = useViewContext(bp.entityType, id, stepInstanceId, taskId)
  const vc = vcRes?.data || vcRes || {}

  // Auto-select tab based on workflow step action when coming from a task.
  // Only fires once when vc.stepAction first resolves — doesn't override
  // user's manual tab clicks (useEffect dep is stepAction string, not vc object).
  useEffect(() => {
    if (!stepInstanceId || !vc.stepAction) return
    const tabMap = {
      ASSIGN:      'sections',
      REVIEW:      'controls',
      EVALUATE:    'controls',
      FILL:        'overview',
      APPROVE:     'overview',
      ACKNOWLEDGE: 'overview',
    }
    const target = tabMap[vc.stepAction]
    if (target) setTab(target)
  }, [vc.stepAction, stepInstanceId])

  const { data: screenRes } = useScreenConfig(bp.detailScreenKey)

  // ── Screen Designer tabsJson — custom tabs defined in SD detail screen ──────
  const sdLayout = screenRes?.layout
  const sdCustomTabs = useMemo(() => {
    try {
      const parsed = JSON.parse(sdLayout?.tabsJson || 'null')
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(t => {
          const key = typeof t === 'string' ? t.toLowerCase().replace(/\s+/g,'_') : t.key
          return key && !CAPABILITY_TAB_KEYS.has(key)
        }).map(t => typeof t === 'string'
          ? { key: t.toLowerCase().replace(/\s+/g,'_'), label: t }
          : { key: t.key, label: t.label || t.key })
      }
    } catch {}
    return []
  }, [sdLayout?.tabsJson])

  // ── Header zone fields from SD ────────────────────────────────────────────
  const headerFormKey = bp.detailScreenKey ? `${bp.detailScreenKey}_header` : null
  const { data: headerFormRes } = useQuery({
    queryKey: ['module-header-form', headerFormKey],
    queryFn: () => uiConfigApi.form(headerFormKey),
    enabled: !!headerFormKey,
    staleTime: 5 * 60_000,
  })
  const headerFields = useMemo(() => headerFormRes?.fields || [], [headerFormRes])
  const screenConfig = screenRes?.data || screenRes

  // FIX: Use screen designer actions (with labels, variants, status guards, endpoints)
  // filtered to only those valid for the current entity status and user's side.
  const screenActions = useMemo(() => {
    if (!Array.isArray(screenConfig?.actions)) return []
    const seen = new Set()
    return screenConfig.actions.filter(action => {
      if (action.isActive === false) return false
      // Deduplicate by actionKey — same action may appear multiple times if
      // inserted multiple times in DB (e.g. ISSUE_REOPEN inserted per-role)
      if (seen.has(action.actionKey)) return false
      seen.add(action.actionKey)
      if (action.allowedStatusesJson) {
        try {
          const allowed = JSON.parse(action.allowedStatusesJson)
          if (entity?.status && !allowed.includes(entity.status)) return false
        } catch {}
      }
      // Gap 4: hide action if requiredPermission is set and user lacks it in vc.permissions
      if (action.requiredPermission && vc.permissions?.length > 0) {
        if (!vc.permissions.includes(action.requiredPermission)) return false
      }
      return true
    })
  }, [screenConfig?.actions, entity?.status, vc.permissions])

  // Execute a screen action — resolves path params, handles confirmation + remarks.
  // Three action types via payloadTemplateJson convention:
  //   { "__formKey": "issue_rca_form" }   → open DynamicForm modal (e.g. RCA, remediation)
  //   { "__navRoute": "/workflow/tasks" }  → client-side navigation
  //   anything else                       → direct API call (transition, close, reopen…)
  const [actingId,   setActingId]   = useState(null)
  const [confirmAction, setConfirmAction] = useState(null) // { action, remarks }
  const [detailFormAction, setDetailFormAction] = useState(null) // action that opens form modal
  const qcDetail = useQueryClient()

  const executeAction = async (action, remarks = '') => {
    let meta = {}
    try { meta = JSON.parse(action.payloadTemplateJson || '{}') } catch {}

    // Form-opening actions
    if (meta.__formKey) { setDetailFormAction(action); return }
    // Navigation actions
    if (meta.__navRoute) {
      navigate(meta.__navRoute.replace('{id}', id).replace('{entityId}', id).replace('{taskId}', taskId || '').replace('{stepInstanceId}', stepInstanceId || ''))
      return
    }

    const url = (action.apiEndpoint || '')
      .replace('{id}', id)
      .replace('{entityId}', id)
      .replace('{taskId}', taskId || '')
      .replace('{stepInstanceId}', stepInstanceId || '')
    try {
      setActingId(action.id)
      // Strip internal __ meta keys from the payload before sending
      const payload = Object.fromEntries(
        Object.entries(meta).filter(([k]) => !k.startsWith('__'))
      )
      if (remarks) payload.remarks = remarks
      // Interpolate {taskId} and {id} in payload string values too
      for (const k of Object.keys(payload)) {
        if (typeof payload[k] === 'string') {
          payload[k] = payload[k]
            .replace('{id}', id)
            .replace('{taskId}', taskId || '')
            .replace('{stepInstanceId}', stepInstanceId || '')
        }
      }
      await api({ method: action.httpMethod || 'POST', url, data: payload })
      qcDetail.invalidateQueries({ queryKey: ['module-detail', bp.apiBasePath, id] })
      qcDetail.invalidateQueries({ queryKey: ['view-context', bp.entityType, id] })
      qcDetail.invalidateQueries({ queryKey: ['module-workflow', bp.entityType, id] })
      qcDetail.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      toast.success(action.label + ' successful')
      // Navigate to clean page URL for any status-changing action so the entire
      // component remounts with fresh data — prevents stale status showing in
      // action buttons and header (e.g. Reopen showing on OPEN issue)
      const STATUS_CHANGING_ACTIONS = [
        'ACTIVATE','COMPLETE','CANCEL',
        'ISSUE_TRIAGE','ISSUE_START_REMEDIATION','ISSUE_SUBMIT_REVIEW',
        'ISSUE_VALIDATE','ISSUE_CLOSE','ISSUE_ACCEPT_RISK','ISSUE_REOPEN'
      ]
      if (STATUS_CHANGING_ACTIONS.includes(action.actionKey)) {
        const base = bp.listScreenKey?.replace('_list','') || bp.entityType.toLowerCase().replace('_','')
        navigate(`/module/${base}/${id}`)
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || action.label + ' failed')
    } finally {
      setActingId(null)
    }
  }

  const handleActionClick = (action) => {
    let meta = {}
    try { meta = JSON.parse(action.payloadTemplateJson || '{}') } catch {}
    if (meta.__formKey) { setDetailFormAction(action); return }
    if (action.requiresConfirmation || action.requiresRemarks) {
      setConfirmAction({ action, remarks: '' })
    } else {
      executeAction(action)
    }
  }

  // Overview fields — three-level priority:
  //  1. {detailScreenKey}_tab_overview  (Screen Designer tab content config — preferred)
  //  2. editFormKey / createFormKey      (legacy: create form doubles as field display source)
  //  3. blueprint fieldsSchemaJson       (raw fallback, no Screen Designer config at all)
  // This means configuring fields in Screen Designer → Detail screen → Overview tab
  // immediately drives the live module page with no code changes.
  const overviewFormKey = bp.detailScreenKey ? `${bp.detailScreenKey}_tab_overview` : null
  const legacyFormKey   = bp.editFormKey || bp.createFormKey
  const { data: overviewFormRes } = useQuery({
    queryKey: ['module-overview-form', overviewFormKey],
    queryFn:  () => uiConfigApi.form(overviewFormKey),
    enabled:  !!overviewFormKey,
    staleTime: 5 * 60 * 1000,
  })
  const detailFormKey = legacyFormKey
  const { data: detailFormRes } = useQuery({
    queryKey: ['module-detail-form', detailFormKey],
    queryFn:  () => uiConfigApi.form(detailFormKey),
    enabled:  !!detailFormKey,
    staleTime: 5 * 60 * 1000,
  })
  // Pick whichever source has fields — Screen Designer tab config wins over create form
  const activeDetailFormRes = (overviewFormRes?.fields?.length > 0) ? overviewFormRes : detailFormRes
  // Group form fields by SECTION_HEADER fields so Overview renders in sections
  const detailFieldSections = useMemo(() => {
    const raw = activeDetailFormRes?.fields || []
    if (!raw.length) return []
    const sections = []
    let cur = { label: 'Overview', fields: [] }
    raw.forEach(f => {
      if (f.fieldType === 'SECTION_HEADER') {
        if (cur.fields.length > 0) sections.push(cur)
        cur = { label: f.label || 'Details', fields: [] }
      } else if (f.fieldType !== 'DIVIDER') {
        cur.fields.push(f)
      }
    })
    if (cur.fields.length > 0) sections.push(cur)
    return sections
  }, [activeDetailFormRes])

  // ── v2: live detail updates via WebSocket ───────────────────────────────────
  // Reads bp.wsTopicPattern — zero config per module, just set the pattern in Module Blueprints UI.
  // If wsTopicPattern is null/empty, this is a no-op (backwards compatible).
  useModuleSocket(bp, id)

  const updateMut = useMutation({
    mutationFn: (data) => moduleApi.update(bp.apiBasePath, id, data),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['module-detail', bp.apiBasePath, id] })
      toast.success('Updated')
      setEditOpen(false)

      // ── autoCompleteActorOnSubmit ──────────────────────────────────────────
      // If this page was opened from a workflow task link (?taskId=N&stepInstanceId=M)
      // and the step has autoCompleteActorOnSubmit=true, auto-approve the task
      // so the user doesn't need to go back to inbox and click approve separately.
      // The backend handles step advancement and next-step task creation.
      if (taskId && vc?.autoCompleteActorOnSubmit) {
        try {
          await api.post('/v1/workflow-instances/tasks/action', {
            taskInstanceId: Number(taskId),
            actionType: 'APPROVE',
            remarks: 'Auto-completed on form submit',
          })
          qc.invalidateQueries({ queryKey: ['workflow-task', taskId] })
          toast.success('Task completed — workflow advancing')
        } catch (err) {
          // Non-blocking — form save succeeded, just couldn't auto-complete task
          console.warn('[autoCompleteActorOnSubmit] Failed to auto-approve task:', err)
          toast('Form saved. Go to inbox to complete the workflow task.', { icon: 'ℹ️' })
        }
      }
      // ── end autoCompleteActorOnSubmit ──────────────────────────────────────
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
  const deleteMut = useMutation({
    mutationFn: () => moduleApi.delete(bp.apiBasePath, id),
    onSuccess: () => {
      toast.success('Deleted')
      navigate(`/module/${bp.entityType.toLowerCase()}`)
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  // Resolve visible tabs: base caps + custom SD tabs (from tabsJson)
  const visibleTabs = useMemo(() => {
    // Parse SD tabsJson to get the explicitly configured tab list
    let sdTabKeys = null
    try {
      const parsed = JSON.parse(sdLayout?.tabsJson || 'null')
      if (Array.isArray(parsed) && parsed.length > 0) {
        sdTabKeys = parsed.map(t =>
          typeof t === 'string' ? t.toLowerCase().replace(/\s+/g, '_') : t.key
        )
      }
    } catch {}

    const base = BASE_TABS.filter(t => {
      // Always-tabs (Overview, History) always show
      if (t.always) return true
      // Capability tab — show if blueprint has it enabled, regardless of tabsJson
      // tabsJson controls ordering and custom tabs, not capability tab visibility
      if (t.cap) {
        if (!bp[t.cap]) return false           // cap disabled in blueprint → hide
        if (vc.hiddenTabs?.includes(t.key)) return false
        return true                             // cap enabled → always show
      }
      // Non-capability base tab — respect tabsJson and viewContext
      if (sdTabKeys && !sdTabKeys.includes(t.key)) return false
      if (vc.hiddenTabs?.includes(t.key)) return false
      if (vc.visibleTabs?.length > 0 && !vc.visibleTabs.includes(t.key)) return false
      return true
    })
    // Inject SD custom tabs (non-capability) in order they appear in tabsJson
    // Insert after Overview but before capability tabs
    const overviewIdx = base.findIndex(t => t.key === 'overview')
    const customTabs = sdCustomTabs.map(t => ({
      key: t.key, label: t.label, icon: Hash, isCustom: true,
    }))
    return [
      ...base.slice(0, overviewIdx + 1),
      ...customTabs,
      ...base.slice(overviewIdx + 1),
    ]
  }, [bp, vc, sdCustomTabs, sdLayout?.tabsJson])

  // Build field sections from blueprint schema
  let schema = { sections: [] }
  try { schema = JSON.parse(bp.fieldsSchemaJson || '{}') } catch {}

  if (isLoading) return <LoadingState />
  if (isError)   return <ServerErrorState />
  if (!entity) return <NotFoundState entityType={bp.displayName} />

  // canEdit: vc.canEdit (backend permission check) — system:write holders get canEdit=true
  // from WorkflowAccessService.resolveForModule after the _system_admin bypass.
  const canEdit = vc.canEdit !== false
  const canDelete = vc.canDelete && vc.permissions?.includes(`${bp.entityType.toLowerCase()}.delete`)
  const editFormKey = bp.editFormKey || bp.createFormKey

  return (
    <PageLayout
      title={
        <div className="flex items-center gap-2">
          {/* v2: if this is a child module, back goes to the parent-scoped list */}
          <button onClick={() => {
            if (bp._parentCtx && bp._parentId) {
              navigate(`/module/${bp._parentCtx.parentEntityType.toLowerCase()}/${bp._parentId}/${bp.entityType.toLowerCase()}`)
            } else {
              navigate(`/module/${bp.entityType.toLowerCase()}`)
            }
          }}
            className="text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft size={15} />
          </button>
          <span>{entity?.title || entity?.name || entity?.testNameSnapshot || entity?.titleSnapshot || entity?.controlNameSnapshot || `${bp.displayName} #${id}`}</span>
          {entity?.status && <EntityStatusBadge status={entity.status} />}
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          {vc.sodViolations?.filter(v => v.conflictType === 'HARD').length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-2 py-1">
              <AlertTriangle size={12} /> SoD conflict
            </div>
          )}
          {/* FIX: Render screen designer actions with correct variants and status guards */}
          {screenActions.map(action => (
            <Button
              key={action.id}
              size="sm"
              variant={action.variant || 'secondary'}
              loading={actingId != null && actingId === action.id}
              disabled={actingId != null && actingId !== action.id}
              onClick={() => handleActionClick(action)}
            >
              {action.label}
            </Button>
          ))}
          {/* Edit button hidden — overview fields are now inline-editable on click (Wrike-style) */}
          {canDelete && (
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => setDeleteTarget(entity)} />
          )}
        </div>
      }
    >
      {/* Task context banner — shown when opened from a workflow task (stepInstanceId in URL).
          Reminds the user which task they're working on and which step action is expected.
          The back-to-inbox button clears the task context. */}
      {taskId && (
        <div className="mx-6 mt-4 flex items-center gap-3 px-3 py-2.5 rounded-lg
                        bg-brand-500/8 border border-brand-500/20 text-xs">
          <CheckSquare size={13} className="text-brand-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-brand-400 font-medium">Task #{taskId}</span>
            {vc.stepLabel && (
              <span className="text-text-muted ml-1.5">· {vc.stepLabel}</span>
            )}
            {vc.canEdit === false && (
              <span className="ml-2 text-text-muted italic">read-only at this step</span>
            )}
          </div>
          <button
            onClick={() => navigate('/workflow/inbox')}
            className="text-[11px] text-text-muted hover:text-text-primary transition-colors shrink-0 flex items-center gap-1">
            <ArrowLeft size={10} /> Back to inbox
          </button>
        </div>
      )}

      {/* SoD banner */}
      {vc.sodViolations?.length > 0 && <SodBanner violations={vc.sodViolations} />}

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 border-b border-border">
        {visibleTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 -mb-px',
              tab === t.key
                ? 'border-brand-500 text-brand-400 bg-brand-500/5'
                : 'border-transparent text-text-muted hover:text-text-secondary hover:bg-surface-overlay'
            )}>
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && (
          <div className="max-w-3xl space-y-6">
            {/* ── Header zone fields from Screen Designer ─────────────────────── */}
            {headerFields.length > 0 && (
              <div className="grid grid-cols-12 gap-4 pb-4 border-b border-border">
                {headerFields.map((field, fi) => {
                  const value = entity?.[field.fieldKey]
                  return (
                    <div key={fi} className={`col-span-${field.gridCols || 6}`}>
                      <FieldDisplay
                        label={field.label} value={value} type={field.fieldType}
                        editable={canEdit && !vc.readOnlyFields?.includes(field.fieldKey)}
                        field={field}
                      />
                    </div>
                  )
                })}
              </div>
            )}
            {/* FIX: Render fields from Screen Designer form config (editFormKey / createFormKey).
                This is the single source of truth — the same fields configured in Screen Designer
                are what appear here. Blueprint's fieldsSchemaJson is the raw data model; the
                form config is the UI presentation layer (labels, order, gridCols, sections).
                Consistency: Screen Designer issue_create_form fields ↔ /module/issue/:id Overview */}
            {detailFieldSections.length > 0
              ? detailFieldSections.map((section, si) => (
                <div key={si}>
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
                    {section.label}
                  </h3>
                  <div className="grid grid-cols-12 gap-3">
                    {section.fields.map((field, fi) => {
                      if (vc.hiddenFields?.includes(field.fieldKey)) return null
                      return (
                        <div key={fi} className={`col-span-${field.gridCols || 6}`}>
                          <DrawerProperty
                            field={field}
                            entity={entity}
                            screenConfig={screenConfig}
                            editingKey={editingKey}
                            editValue={editValue}
                            saving={saving}
                            onStartEdit={startEdit}
                            onChangeValue={setEditValue}
                            onSave={saveField}
                            onCancel={cancelEdit}
                            vc={vc}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
              : /* Fallback: blueprint schema sections when no form configured yet */
              schema.sections?.map((section, si) => (
                <div key={si}>
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
                    {section.label}
                  </h3>
                  <div className="grid grid-cols-12 gap-3">
                    {(section.fields || []).map((field, fi) => {
                      if (field.type === 'SECTION_HEADER' || field.type === 'DIVIDER') return null
                      if (vc.hiddenFields?.includes(field.key)) return null
                      // Normalise blueprint schema field to DrawerProperty shape
                      const normField = { ...field, fieldKey: field.key, fieldType: field.type }
                      return (
                        <div key={fi} className={`col-span-${field.gridCols || 6}`}>
                          <DrawerProperty
                            field={normField}
                            entity={entity}
                            screenConfig={screenConfig}
                            editingKey={editingKey}
                            editValue={editValue}
                            saving={saving}
                            onStartEdit={startEdit}
                            onChangeValue={setEditValue}
                            onSave={saveField}
                            onCancel={cancelEdit}
                            vc={vc}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            }

            {/* Last fallback: raw key-value when neither source has data */}
            {detailFieldSections.length === 0 && schema.sections?.length === 0 && entity && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-surface-overlay border-b border-border">
                  <span className="text-xs font-medium text-text-muted">Entity data</span>
                </div>
                {Object.entries(entity).filter(([k]) => !['id','createdAt','updatedAt'].includes(k)).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3 px-4 py-2 border-b border-border/50 last:border-0 text-xs">
                    <span className="font-mono text-text-muted w-40 shrink-0">{k}</span>
                    <span className="text-text-primary truncate">{String(v ?? '—')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'workflow' && bp.supportsWorkflow && (
          <WorkflowTab entityType={bp.entityType} entityId={id} vc={vc} bp={bp} entity={entity} />
        )}

        {tab === 'actions' && bp.supportsActionItems && (
          <ItemActionItems entityType={bp.entityType} entityId={Number(id)} />
        )}

        {tab === 'evidence' && bp.supportsDocuments && (
          <EvidenceTab entityId={id} entityType={bp.entityType} vc={vc} />
        )}

        {tab === 'comments' && bp.supportsComments && (
          <CommentFeed entityType={bp.entityType} entityId={Number(id)} />
        )}

        {tab === 'history' && (
          <HistoryTab entityType={bp.entityType} entityId={id} apiBasePath={bp.apiBasePath} />
        )}

        {/* ── Custom tabs from Screen Designer tabsJson ──────────────────── */}
        {sdCustomTabs.some(t => t.key === tab) && (
          <CustomTabContent
            tabKey={tab}
            detailScreenKey={bp.detailScreenKey}
            entity={entity}
            entityType={bp.entityType}
            vc={vc}
          />
        )}
      </div>

      {/* Edit modal */}
      {editFormKey && (
        <Modal open={editOpen} onClose={() => setEditOpen(false)}
          title={`Edit ${bp.displayName}`} size="lg">
          <DynamicForm
            formKey={editFormKey}
            defaultValues={entity}
            onSubmit={(data) => updateMut.mutate(data)}
            loading={updateMut.isPending}
            submitLabel="Save changes"
          />
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate()}
        loading={deleteMut.isPending}
        title={`Delete ${bp.displayName}`}
        message={`This action cannot be undone. All related workflow instances, action items, and evidence will be affected.`}
      />

      {/* FIX: Confirmation dialog for screen designer actions that require confirmation / remarks */}
      {confirmAction && (
        <Modal
          open
          onClose={() => setConfirmAction(null)}
          title={confirmAction.action.label}
          subtitle={confirmAction.action.confirmationMessage || 'Please confirm this action.'}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button
                size="sm"
                variant={confirmAction.action.variant || 'primary'}
                loading={actingId === confirmAction.action.id}
                onClick={() => { executeAction(confirmAction.action, confirmAction.remarks); setConfirmAction(null) }}
              >
                {confirmAction.action.label}
              </Button>
            </div>
          }
        >
          {confirmAction.action.requiresRemarks && (
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Remarks <span className="text-red-400">*</span>
              </label>
              <textarea
                value={confirmAction.remarks}
                onChange={e => setConfirmAction(prev => ({ ...prev, remarks: e.target.value }))}
                rows={3}
                placeholder="Explain the reason for this action…"
                className="w-full px-3 py-2 text-xs bg-surface-overlay border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              />
            </div>
          )}
        </Modal>
      )}

      {/* FIX: Form modal for screen designer actions with __formKey.
          Used for: RCA form, remediation form, any action that collects data
          before making an API call. The form submits to the action's apiEndpoint. */}
      {detailFormAction && (() => {
        let meta = {}
        try { meta = JSON.parse(detailFormAction.payloadTemplateJson || '{}') } catch {}
        const formKey = meta.__formKey
        const submitUrl = (detailFormAction.apiEndpoint || '')
          .replace('{id}', id).replace('{entityId}', id)
        return (
          <Modal open onClose={() => setDetailFormAction(null)}
            title={detailFormAction.label}
            size="lg"
          >
            <DynamicForm
              formKey={formKey}
              defaultValues={{ entityId: id, entityType: bp.entityType }}
              onSubmit={async (data) => {
                try {
                  setActingId(detailFormAction.id)
                  await api({ method: detailFormAction.httpMethod || 'POST', url: submitUrl, data })
                  qcDetail.invalidateQueries({ queryKey: ['module-detail', bp.apiBasePath, id] })
                  qcDetail.invalidateQueries({ queryKey: ['view-context', bp.entityType, id] })
                  toast.success(detailFormAction.label + ' saved')
                  setDetailFormAction(null)
                } catch (e) {
                  toast.error(e?.response?.data?.message || 'Failed')
                } finally { setActingId(null) }
              }}
              loading={actingId === detailFormAction.id}
              submitLabel={detailFormAction.label}
            />
          </Modal>
        )
      })()}
    </PageLayout>
  )
}

// ─── Sub-tabs ─────────────────────────────────────────────────────────────────

function WorkflowTab({ entityType, entityId, vc, bp, entity }) {
  // Step 1: get workflow instance
  // Prefer entity.workflowInstanceId (works for both IN_PROGRESS and COMPLETED).
  // /active only returns IN_PROGRESS — CLOSED/COMPLETED issues would show empty.
  const entityWorkflowId = entity?.workflowInstanceId
  const { data: instanceRes, isLoading: instanceLoading } = useQuery({
    queryKey: ['module-workflow', entityType, entityId],
    queryFn: async () => {
      if (entityWorkflowId) {
        return api.get(`/v1/workflow-instances/${entityWorkflowId}`)
      }
      return api.get('/v1/workflow-instances/active', { params: { entityType, entityId } })
    },
    enabled: !!entityId,
    staleTime: 0,  // always fresh — reopen creates new instance
  })
  const instance = instanceRes?.data || instanceRes

  // Step 2: fetch full step-by-step progress once we have the instance id
  const { data: progressRes, isLoading: progressLoading } = useQuery({
    queryKey: ['wf-progress', instance?.id],
    queryFn: () => api.get(`/v1/workflow-instances/${instance.id}/progress`),
    enabled: !!instance?.id,
    staleTime: 0,
  })
  const progress = progressRes?.data || progressRes
  const wfLoading = instanceLoading || (!!instance?.id && progressLoading)

  // Loading skeleton
  if (wfLoading) {
    return (
      <div className="max-w-2xl space-y-3 py-2">
        {[1,2,3,4].map(i => (
          <div key={i} className="flex items-start gap-3 p-3 border border-border rounded-lg">
            <div className="w-8 h-8 rounded-full bg-surface-overlay animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-40 bg-surface-overlay rounded animate-pulse" />
              <div className="h-2 w-24 bg-surface-overlay rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!instance) {
    return (
      <div className="max-w-2xl">
        <div className="flex flex-col items-center gap-3 py-12 border border-dashed border-border rounded-lg text-center">
          <GitBranch size={24} className="text-text-muted" />
          <div>
            <p className="text-sm font-medium text-text-secondary">No active workflow</p>
            <p className="text-xs text-text-muted mt-0.5">Start a workflow to begin the review process</p>
          </div>
          {vc.canAct !== false && (
            <Button size="sm" icon={GitBranch}>Start workflow</Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-4">
      <WorkflowTimeline
        progress={progress}
        workflowInstanceId={instance.id}
        isAdmin={vc.canEdit !== false}
      />
    </div>
  )
}

function EvidenceTab({ entityId, entityType, vc }) {
  return (
    <div className="max-w-2xl">
      {vc.canEdit
        ? <div className="flex flex-col items-center gap-3 py-12 border-2 border-dashed border-border rounded-xl text-center cursor-pointer hover:border-brand-500/40 hover:bg-brand-500/3 transition-colors">
            <Upload size={24} className="text-text-muted" />
            <div>
              <p className="text-sm font-medium text-text-secondary">Upload evidence</p>
              <p className="text-xs text-text-muted mt-0.5">Drag & drop or click to attach files</p>
            </div>
          </div>
        : <div className="flex items-center gap-2 text-xs text-text-muted py-6 justify-center">
            <Lock size={13} /> Evidence upload not available at this workflow step
          </div>
      }
    </div>
  )
}

// ─── CustomTabContent ─────────────────────────────────────────────────────────
// Renders fields for a custom tab (non-capability) defined in Screen Designer.
// Special tab keys get dedicated components:
//   "controls"  → LibraryMappingTab (shows controls linked to this test/policy)
//   "tests"     → LibraryMappingTab (shows tests linked to this control)
//   "policies"  → LibraryMappingTab (shows policies linked to this control)
// All other keys → renders fields from {detailScreenKey}_tab_{tabKey} form key.

function CustomTabContent({ tabKey, detailScreenKey, entity, entityType, vc }) {
  // ── Library mapping tabs — rendered by dedicated component ───────────────
  // AUDIT_ENGAGEMENT — sections tree with controls nested + both clickable
  if (tabKey === 'sections' && entityType === 'AUDIT_ENGAGEMENT') {
    return <EngagementSectionsTab engagementId={entity?.id} vc={vc} />
  }
  // AUDIT_ENGAGEMENT — flat control list with clickable detail
  if (tabKey === 'controls' && entityType === 'AUDIT_ENGAGEMENT') {
    return <EngagementControlsTab engagementId={entity?.id} vc={vc} />
  }

  // AUDIT_CONTROL_INSTANCE — tests and policies tabs use instance-level endpoints
  if (tabKey === 'tests' && entityType === 'AUDIT_CONTROL_INSTANCE') {
    return <ControlInstanceTestsTab controlInstanceId={entity?.id} vc={vc} />
  }
  if (tabKey === 'policies' && entityType === 'AUDIT_CONTROL_INSTANCE') {
    return <ControlInstancePoliciesTab controlInstanceId={entity?.id} vc={vc} />
  }
  if (tabKey === 'evidence' && entityType === 'AUDIT_CONTROL_INSTANCE') {
    return <ControlInstanceEvidenceTab controlInstanceId={entity?.id} vc={vc} />
  }

  // AUDIT_TEST_INSTANCE — mapped controls (Vanta-style: all controls this test covers)
  if (tabKey === 'mapped-controls' && entityType === 'AUDIT_TEST_INSTANCE') {
    return <TestInstanceMappedControlsTab testInstanceId={entity?.id} testResult={entity?.testResult} vc={vc} />
  }

  // AUDIT_POLICY_INSTANCE — policy content + mapped controls
  if (tabKey === 'policy-content' && entityType === 'AUDIT_POLICY_INSTANCE') {
    return <PolicyContentTab entity={entity} />
  }
  if (tabKey === 'mapped-controls' && entityType === 'AUDIT_POLICY_INSTANCE') {
    return <PolicyInstanceMappedControlsTab policyInstanceId={entity?.id} vc={vc} />
  }

  // AUDIT_TEMPLATE — sections tree with controls inline
  if (tabKey === 'sections' && entityType === 'AUDIT_TEMPLATE') {
    return <TemplateSectionsTab templateId={entity?.id} view="sections" />
  }
  if (tabKey === 'controls' && entityType === 'AUDIT_TEMPLATE') {
    return <TemplateSectionsTab templateId={entity?.id} view="controls" />
  }

  if (tabKey === 'controls' && (entityType === 'AUDIT_TEST' || entityType === 'AUDIT_POLICY')) {
    return (
      <LibraryMappingTab
        entityType={entityType === 'AUDIT_TEST' ? 'TEST' : 'POLICY'}
        entityId={entity?.id}
        canEdit={vc?.canEdit !== false}
      />
    )
  }

  if (tabKey === 'versions' && entityType === 'AUDIT_POLICY') {
    return <PolicyVersionsTab entity={entity} />
  }
  if (tabKey === 'tests' && entityType === 'AUDIT_CONTROL') {
    return (
      <LibraryMappingTab
        entityType="CONTROL"
        linkedType="TEST"
        entityId={entity?.id}
        canEdit={vc?.canEdit !== false}
      />
    )
  }
  if (tabKey === 'policies' && entityType === 'AUDIT_CONTROL') {
    return (
      <LibraryMappingTab
        entityType="CONTROL"
        linkedType="POLICY"
        entityId={entity?.id}
        canEdit={vc?.canEdit !== false}
      />
    )
  }

  // ISSUE — linked findings tab (audit findings linked to this issue)
  if ((tabKey === 'linked-findings' || tabKey === 'linked_findings') && entityType === 'ISSUE') {
    return <IssueFindingsTab issueId={entity?.id} />
  }

  // eslint-disable-next-line no-unused-vars
  void entityType  // used above only; generic path below is form-key-driven
  const formKey = `${detailScreenKey}_tab_${tabKey}`
  const { data: formRes, isLoading } = useQuery({
    queryKey: ['module-tab-form', formKey],
    queryFn: () => uiConfigApi.form(formKey),
    enabled: !!formKey,
    staleTime: 5 * 60_000,
  })
  const fields = formRes?.fields || []

  if (isLoading) return (
    <div className="py-8 flex items-center justify-center">
      <RefreshCw size={16} className="animate-spin text-text-muted" />
    </div>
  )

  if (fields.length === 0) return (
    <div className="py-12 text-center">
      <p className="text-sm text-text-muted">No fields configured for this tab.</p>
      <p className="text-xs text-text-muted mt-1 opacity-60">
        Add fields in Screen Designer → {detailScreenKey} → {tabKey} tab
      </p>
    </div>
  )

  return (
    <div className="grid grid-cols-12 gap-4">
      {fields.map((field, fi) => {
        if (field.fieldType === 'SECTION_HEADER') return (
          <div key={fi} className="col-span-12 pt-2">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide border-b border-border pb-1">
              {field.label}
            </h3>
          </div>
        )
        if (field.fieldType === 'DIVIDER') return (
          <div key={fi} className="col-span-12 h-px bg-border" />
        )
        // dependsOnJson: hide field when condition on another field is not met
        if (field.dependsOnJson) {
          try {
            const dep = typeof field.dependsOnJson === 'string' ? JSON.parse(field.dependsOnJson) : field.dependsOnJson
            const actual = entity?.[dep.field]
            const show = dep.operator === 'eq'  ? actual === dep.value
                       : dep.operator === 'neq' ? actual !== dep.value
                       : dep.operator === 'in'  ? (Array.isArray(dep.value) && dep.value.includes(actual))
                       : true
            if (!show) return null
          } catch {}
        }
        const value = entity?.[field.fieldKey]
        return (
          <div key={fi} className={`col-span-${field.gridCols || 6}`}>
            <FieldDisplay
              label={field.label}
              value={value}
              type={field.fieldType}
              editable={vc?.canEdit && !vc?.readOnlyFields?.includes(field.fieldKey)}
              field={field}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── IssueFindingsTab — shows audit findings linked to this issue ──────────────
// Calls GET /v1/issues/{id}/linked-findings
// Auditors raise findings during SOC2/TPRM audits → linked here for traceability
function IssueFindingsTab({ issueId }) {
  const { data: res, isLoading } = useQuery({
    queryKey: ['issue-linked-findings', issueId],
    queryFn: () => api.get(`/v1/issues/${issueId}/linked-findings`),
    enabled: !!issueId,
  })
  const findings = res?.data || res || []

  if (isLoading) return (
    <div className="py-8 flex items-center justify-center">
      <RefreshCw size={16} className="animate-spin text-text-muted" />
    </div>
  )

  if (findings.length === 0) return (
    <div className="py-12 text-center">
      <p className="text-sm text-text-muted">No linked findings yet.</p>
      <p className="text-xs text-text-muted mt-1 opacity-60">
        Use the Link Finding button to associate audit findings with this issue.
      </p>
    </div>
  )

  return (
    <div className="space-y-2">
      {findings.map((f, i) => (
        <div key={f.id || i}
          className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface-secondary hover:border-border-strong transition-colors">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-text-primary truncate">
                {f.findingRef || f.ref || `#${f.id}`}
              </span>
              {f.severity && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">
                  {f.severity}
                </span>
              )}
              {f.status && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400">
                  {f.status}
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted mt-0.5 truncate">{f.title || f.description || '—'}</p>
            {f.auditName && <p className="text-[10px] text-text-muted mt-0.5">Audit: {f.auditName}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

function HistoryTab({ entityType, entityId, apiBasePath }) {
  const { data: res, isLoading: historyLoading } = useQuery({
    queryKey: ['module-history', apiBasePath, entityId],
    queryFn: () => api.get(`${apiBasePath}/${entityId}/history`),
    enabled: !!entityId,
    staleTime: 0,
  })
  const history = res?.data || res || []

  if (historyLoading) {
    return (
      <div className="max-w-2xl space-y-3 py-2">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
            <div className="w-2 h-2 rounded-full bg-surface-overlay animate-pulse mt-1.5 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 rounded animate-pulse bg-surface-overlay" style={{ width: `${55 + (i * 13) % 40}%` }} />
              <div className="h-2 w-32 rounded animate-pulse bg-surface-overlay" />
              <div className="h-2 w-48 rounded animate-pulse bg-surface-overlay" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Friendly labels for workflow event types
  const EVENT_LABELS = {
    STEP_STARTED:               'Step started',
    STEP_ADVANCED:              'Advanced to next step',
    STEP_AUTO_COMPLETED_ON_SUBMIT: 'Auto-completed on submit',
    TASK_AUTO_COMPLETED_ON_SUBMIT: 'Task auto-completed on submit',
    WORKFLOW_COMPLETED:         'Workflow completed',
    APPROVE:                    'Approved',
    REJECT:                     'Rejected',
    SEND_BACK:                  'Sent back',
    REASSIGN:                   'Reassigned',
    ASSIGNER_TASK_APPROVED:     'Coordinator approved',
  }

  return (
    <div className="max-w-2xl space-y-2 py-2">
      {history.length === 0
        ? <p className="text-xs text-text-muted">No history recorded yet</p>
        : history.map((h, i) => {
          // WorkflowHistoryResponse fields: eventType, stepName, stepOrder,
          // fromStatus, toStatus, performedBy, performedAt, remarks
          const label = EVENT_LABELS[h.eventType] || h.eventType || h.action || h.description || '—'
          const step  = h.stepName ? `${h.stepOrder ? h.stepOrder + '. ' : ''}${h.stepName}` : null
          // performedByName is resolved server-side in WorkflowEngineService.toHistoryResponse()
          const actor = h.performedByName || (h.performedBy ? `User #${h.performedBy}` : null)
          const when  = h.performedAt || h.createdAt
          const transition = h.fromStatus && h.toStatus ? `${h.fromStatus} → ${h.toStatus}` : null
          return (
            <div key={i} className="flex items-start gap-3 text-xs border-b border-border pb-2 last:border-0">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-text-primary">{label}</span>
                  {step && <span className="text-brand-400 text-[10px] bg-brand-500/10 px-1.5 py-0.5 rounded">{step}</span>}
                  {transition && <span className="text-text-muted text-[10px]">{transition}</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {actor && <span className="text-text-muted">by {actor}</span>}
                  {when  && <span className="text-text-muted">{new Date(when).toLocaleString()}</span>}
                </div>
                {h.remarks && <p className="text-text-muted italic mt-0.5 truncate">"{h.remarks}"</p>}
              </div>
            </div>
          )
        })
      }
    </div>
  )
}

// ─── Utility Components ───────────────────────────────────────────────────────

// ─── LOOKUP_CONFIG ────────────────────────────────────────────────────────────
// Shared by EntityDisplay (display-side) and EntityLookupField (input-side in DynamicForm).
// When a field value is a raw ID (e.g. leadAuditorId = 42), EntityDisplay resolves the
// human-readable label via a GET request to the correct endpoint.
const DISPLAY_LOOKUP_CONFIG = {
  USER:             { path: '/v1/users',                     labelFn: r => [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email },
  ROLE:             { path: '/v1/admin/roles',               labelFn: r => r.name },
  AUDIT_TEMPLATE:   { path: '/v1/audit/library/templates',   labelFn: r => r.name },
  AUDIT_PROJECT:    { path: '/v1/audit/projects',            labelFn: r => r.name },
  WORKFLOW:         { path: '/v1/workflows',                  labelFn: r => r.name },
  VENDOR:           { path: '/v1/vendors',                    labelFn: r => r.name },
  AUDIT_CONTROL:    { path: '/v1/audit/library/controls',    labelFn: r => r.name },
  AUDIT_ENGAGEMENT: { path: '/v1/audit/engagements',         labelFn: r => r.name },
  AUDIT_POLICY:     { path: '/v1/audit/library/policies',    labelFn: r => r.title || r.name },
}

// EntityDisplay — resolves a raw ID to its label for LOOKUP fields on detail screens.
// Only fires a network request when: value looks like a numeric ID AND lookupEntityType is set.
// On success, shows the resolved label. On error / no config, falls back to String(value).
function EntityDisplay({ value, lookupEntityType, lookupApiPath }) {
  const [label, setLabel] = useState(null)
  const valueStr = value === null || value === undefined ? '' : String(value)

  useEffect(() => {
    if (!valueStr || !valueStr.match(/^\d+$/)) return   // not a numeric ID — no fetch needed
    const cfg = DISPLAY_LOOKUP_CONFIG[lookupEntityType?.toUpperCase?.()]
    const path = lookupApiPath || cfg?.path
    if (!path) return   // no config for this entity type — show raw value
    let cancelled = false
    api.get(`${path}/${valueStr}`)
      .then(r => {
        if (cancelled) return
        const item = r.data?.data || r.data
        const resolved = cfg ? cfg.labelFn(item) : (item.name || item.label || item.title || valueStr)
        setLabel(resolved || valueStr)
      })
      .catch(() => { if (!cancelled) setLabel(valueStr) })
    return () => { cancelled = true }
  }, [valueStr, lookupEntityType, lookupApiPath]) // eslint-disable-line

  if (!valueStr) return <span className="text-text-muted/40 text-xs italic">—</span>
  return <span className="text-sm text-text-primary">{label || valueStr}</span>
}

function FieldDisplay({ label, value, type, editable, field = {} }) {
  // ── Render the value correctly based on type ──────────────────────────────
  const renderDisplayValue = () => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-text-muted/40 text-xs italic">—</span>
    }

    switch (type) {
      case 'DATE': {
        try {
          return <span className="text-sm font-medium text-text-primary">
            {new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        } catch { return <span className="text-sm text-text-primary">{String(value)}</span> }
      }

      case 'DATE_RANGE': {
        const start = value?.start || value?.from
        const end   = value?.end   || value?.to
        const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
        return <span className="text-sm text-text-primary">{fmt(start)} → {fmt(end)}</span>
      }

      case 'TOGGLE': {
        const on = value === true || value === 'true' || value === 1
        return (
          <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded',
            on ? 'bg-green-500/10 text-green-400' : 'bg-surface-overlay text-text-muted border border-border')}>
            {on ? '✓ Yes' : '✗ No'}
          </span>
        )
      }

      case 'RATING': {
        const max = field.maxValue || 5
        const val = Number(value) || 0
        return <span className="text-base tracking-tight">{Array.from({length:max},(_,i)=>(
          <span key={i} className={i < val ? 'text-amber-400' : 'text-text-muted'}>★</span>
        ))}</span>
      }

      case 'CURRENCY': {
        const num = Number(value)
        const code = field.currencyCode || 'USD'
        try {
          return <span className="text-sm font-medium font-mono text-text-primary">
            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: code }).format(num)}
          </span>
        } catch { return <span className="text-sm text-text-primary">{code} {value}</span> }
      }

      case 'COLOR':
        return (
          <div className="flex items-center gap-2">
            <span className="inline-block w-5 h-5 rounded border border-border shrink-0" style={{ background: String(value) }} />
            <span className="text-xs font-mono text-text-secondary">{String(value)}</span>
          </div>
        )

      case 'URL':
        return (
          <a href={String(value)} target="_blank" rel="noopener noreferrer"
            className="text-sm text-brand-400 hover:underline truncate block max-w-full">
            {String(value)}
          </a>
        )

      case 'TAG': case 'MULTI_SELECT': {
        const items = Array.isArray(value) ? value
          : String(value).split(',').map(t => t.trim()).filter(Boolean)
        return (
          <div className="flex flex-wrap gap-1">
            {items.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 text-brand-400 text-[11px] font-medium">
                {tag}
              </span>
            ))}
          </div>
        )
      }

      case 'MULTILINE_LIST': {
        const items = Array.isArray(value) ? value : []
        return (
          <ul className="list-disc list-inside space-y-0.5">
            {items.map((item, i) => (
              <li key={i} className="text-sm text-text-primary">{item}</li>
            ))}
          </ul>
        )
      }

      case 'RICH_TEXT':
        return (
          <div className="text-sm text-text-primary leading-relaxed policy-content max-h-48 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: String(value) }} />
        )

      case 'TEXTAREA':
        return (
          <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
            {String(value)}
          </div>
        )

      case 'JSON_EDITOR':
        return (
          <pre className="text-[11px] font-mono text-text-secondary bg-surface-overlay rounded p-2 overflow-x-auto max-h-40">
            {(() => { try { return JSON.stringify(JSON.parse(String(value)), null, 2) } catch { return String(value) } })()}
          </pre>
        )

      case 'NUMBER': case 'DECIMAL': case 'SLIDER':
        return <span className="text-sm font-mono tabular-nums text-text-primary">{String(value)}</span>

      case 'FILE': case 'FILE_MULTI': {
        const files = Array.isArray(value) ? value : [value].filter(Boolean)
        return (
          <div className="flex flex-col gap-1">
            {files.map((f, i) => (
              <a key={i} href={typeof f === 'string' ? f : f.url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-brand-400 hover:underline">
                {typeof f === 'string' ? f.split('/').pop() : (f.name || f.url || 'File')}
              </a>
            ))}
          </div>
        )
      }

      case 'LOOKUP':
        // EntityDisplay fetches the human label for the stored ID
        return <EntityDisplay value={value} lookupEntityType={field.lookupEntityType} lookupApiPath={field.lookupApiPath} />

      default:
        return <span className="text-sm text-text-primary">{String(value)}</span>
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">{label}</label>
      <div className={cn(
        'text-sm text-text-primary rounded px-2 py-1 min-h-[28px]',
        editable ? 'bg-surface-overlay border border-border/50 hover:border-border cursor-default' : ''
      )}>
        {renderDisplayValue()}
      </div>
    </div>
  )
}

function EntityStatusBadge({ status }) {
  const colorMap = {
    DRAFT: 'amber', OPEN: 'blue', IN_REVIEW: 'purple',
    APPROVED: 'green', CLOSED: 'gray', REJECTED: 'red',
  }
  return <Badge variant={colorMap[status] || 'gray'} size="xs">{status}</Badge>
}

function SodBanner({ violations }) {
  const hasHard = violations.some(v => v.conflictType === 'HARD')
  return (
    <div className={cn(
      'flex items-start gap-2 mx-6 mt-4 px-3 py-2.5 rounded-lg text-xs border',
      hasHard
        ? 'bg-red-500/5 border-red-500/25 text-red-300'
        : 'bg-amber-500/5 border-amber-500/25 text-amber-300'
    )}>
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <div>
        <span className="font-medium">{hasHard ? 'SoD violation — actions blocked:' : 'SoD warning:'}</span>
        {' '}{violations.map(v => v.ruleName).join(', ')}
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col gap-2">
          <div className="h-6 w-48 bg-surface-overlay rounded animate-pulse" />
          <div className="h-3 w-24 bg-surface-overlay rounded animate-pulse" />
        </div>
        <div className="h-8 w-28 bg-surface-overlay rounded animate-pulse" />
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-surface-secondary">
          {[120, 220, 100, 140, 90].map((w, i) => (
            <div key={i} className="h-3 bg-surface-overlay rounded animate-pulse" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3 border-b border-border/50 last:border-0">
            <div className="h-3 bg-surface-overlay rounded animate-pulse" style={{ width: 120 + (r % 3) * 20 }} />
            <div className="h-3 bg-surface-overlay rounded animate-pulse flex-1" style={{ maxWidth: 240 }} />
            <div className="h-5 w-20 bg-surface-overlay rounded-full animate-pulse" />
            <div className="h-3 bg-surface-overlay rounded animate-pulse" style={{ width: 80 + (r % 2) * 30 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function NotFoundState({ entityType }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
      <Info size={28} className="text-text-muted" />
      <div>
        <p className="text-sm font-medium text-text-secondary">Module not found</p>
        <p className="text-xs text-text-muted mt-1">No module blueprint found for "{entityType}"</p>
      </div>
      <Button size="sm" variant="secondary" onClick={() => navigate(-1)}>Go back</Button>
    </div>
  )
}

// After the existing NotFoundState function (line ~1615), add:
function ServerErrorState() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <ServerCrash size={20} className="text-red-400" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium text-text-secondary">Could not load this page</p>
        <p className="text-xs text-text-muted mt-1 max-w-xs">
          The server is not responding. It may be restarting — please try again in a moment.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
          Reload page
        </Button>
        <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    </div>
  )
}

// ─── EntityDrawer ─────────────────────────────────────────────────────────────
// Fully interactive slide-over — Wrike-style property grid + full tab set.
// Driven by detailScreenKey (Screen Designer config). Configure once → works
// in both this drawer and the full detail page.
//
// Tabs match module capabilities:
//   Overview   — inline-editable property grid (Wrike style)
//   Comments   — threaded comment feed + quick-add
//   Evidence   — file upload / link management (EvidenceUploader)
//   Actions    — linked action items (ItemActionItems)
//   Workflow   — status timeline (nudge to full page — needs workflowInstanceId)
//   History    — audit log (full page only)

function EntityDrawer({ entityId, bp, onClose, onOpenFull }) {
  const qc = useQueryClient()
  const navigate = useNavigate()

  // ── 1. Full entity data ───────────────────────────────────────────────────
  const { data: entityRes, isLoading: loadingEntity } = useQuery({
    queryKey: ['drawer-entity', bp.apiBasePath, entityId],
    queryFn:  () => moduleApi.get(bp.apiBasePath, entityId),
    staleTime: 0, enabled: !!entityId,
  })
  const entity = entityRes?.data?.data || entityRes?.data || entityRes

  // ── 2. Detail screen config (same as full page) ───────────────────────────
  const { data: screenRes, isLoading: screenLoading } = useQuery({
    queryKey: ['screen-config', bp.detailScreenKey],
    queryFn:  () => moduleApi.screenConfig(bp.detailScreenKey),
    staleTime: 5 * 60_000, enabled: !!bp.detailScreenKey,
  })
  const screenConfig = screenRes?.data?.data || screenRes?.data || screenRes
  const isLoading = loadingEntity || screenLoading

  // ── 2b. View context — field-level access + permission-gated actions ──────
  // Gap 2: needed so DrawerProperty can block click-to-edit on read-only fields.
  // Gap 4: needed so screenActions can filter by requiredPermission vs vc.permissions.
  const { data: vcRes } = useQuery({
    queryKey: ['view-context', bp.entityType, entityId],
    queryFn:  () => moduleApi.viewContext(bp.entityType, entityId),
    staleTime: 30 * 1000, enabled: !!entityId,
  })
  const vc = vcRes?.data || vcRes || {}

  // ── 3. Actions filtered by entity status and vc.permissions ───────────────
  const screenActions = useMemo(() => {
    if (!Array.isArray(screenConfig?.actions)) return []
    const seen = new Set()
    return screenConfig.actions.filter(action => {
      if (action.isActive === false) return false
      // Deduplicate by actionKey — prevents duplicate buttons if same action
      // inserted multiple times in DB
      if (seen.has(action.actionKey)) return false
      seen.add(action.actionKey)
      if (action.allowedStatusesJson) {
        try {
          const allowed = JSON.parse(action.allowedStatusesJson)
          if (entity?.status && !allowed.includes(entity.status)) return false
        } catch {}
      }
      // Gap 4: hide action if requiredPermission is set and user lacks it
      if (action.requiredPermission && vc.permissions?.length > 0) {
        if (!vc.permissions.includes(action.requiredPermission)) return false
      }
      return true
    })
  }, [screenConfig?.actions, entity?.status, vc.permissions])

  // ── 4. Form fields for Overview ─────────────────────────────────────────────
  // Same three-level priority as full-page detail (see above):
  //   {detailScreenKey}_tab_overview → createFormKey → fieldsSchemaJson
  const drawerOverviewKey  = bp.detailScreenKey ? `${bp.detailScreenKey}_tab_overview` : null
  const drawerLegacyKey    = bp.editFormKey || bp.createFormKey
  const { data: drawerOverviewRes } = useQuery({
    queryKey: ['drawer-overview-form', drawerOverviewKey],
    queryFn:  () => uiConfigApi.form(drawerOverviewKey),
    staleTime: 5 * 60_000, enabled: !!drawerOverviewKey,
  })
  const detailFormKey = drawerLegacyKey
  const { data: formRes } = useQuery({
    queryKey: ['drawer-form', detailFormKey],
    queryFn:  () => uiConfigApi.form(detailFormKey),
    staleTime: 5 * 60_000, enabled: !!detailFormKey,
  })
  const activeFormRes = (drawerOverviewRes?.fields?.length > 0) ? drawerOverviewRes : formRes
  const fieldSections = useMemo(() => {
    const raw = activeFormRes?.fields || []
    if (!raw.length) return []
    const sections = []
    let cur = { label: null, fields: [] }
    raw.forEach(f => {
      if (f.fieldType === 'SECTION_HEADER') {
        if (cur.fields.length) sections.push(cur)
        cur = { label: f.label, fields: [] }
      } else if (f.fieldType !== 'DIVIDER') {
        cur.fields.push(f)
      }
    })
    if (cur.fields.length) sections.push(cur)
    return sections
  }, [activeFormRes])

  // ── 4b. Header zone fields (from {detailScreenKey}_header form) ─────────
  const drawerHeaderFormKey = bp.detailScreenKey ? `${bp.detailScreenKey}_header` : null
  const { data: drawerHeaderFormRes } = useQuery({
    queryKey: ['drawer-header-form', drawerHeaderFormKey],
    queryFn:  () => uiConfigApi.form(drawerHeaderFormKey),
    staleTime: 5 * 60_000, enabled: !!drawerHeaderFormKey,
  })
  const headerFields = useMemo(() => drawerHeaderFormRes?.fields || [], [drawerHeaderFormRes])

  // ── 5. Comments ───────────────────────────────────────────────────────────
  const hasComments  = bp.capabilities?.includes?.('COMMENTS')  ?? true
  const hasEvidence  = bp.capabilities?.includes?.('DOCUMENTS') ?? true
  const hasActions   = bp.capabilities?.includes?.('ACTION_ITEMS') ?? true
  const hasWorkflow  = bp.capabilities?.includes?.('WORKFLOW')   ?? false

  const { data: commentsRes, refetch: refetchComments } = useQuery({
    queryKey: ['drawer-comments', bp.entityType, entityId],
    queryFn:  () => commentsApi.list(bp.entityType, entityId),
    staleTime: 30_000, enabled: hasComments && !!entityId,
  })
  const comments = useMemo(() => {
    const raw = commentsRes?.data?.data || commentsRes?.data || commentsRes
    return Array.isArray(raw) ? raw : []
  }, [commentsRes])

  const addCommentMut = useMutation({
    mutationFn: (text) => commentsApi.add({
      entityType: bp.entityType, entityId, commentText: text, visibility: 'ALL',
    }),
    onSuccess: () => { refetchComments(); toast.success('Comment added') },
    onError:   () => toast.error('Failed to add comment'),
  })

  // ── 6. Inline field editing (Wrike pattern: click value → edit inline) ────
  const [editingKey, setEditingKey] = useState(null)
  const [editValue,  setEditValue]  = useState('')
  const [saving,     setSaving]     = useState(false)

  const startEdit = (field) => {
    setEditingKey(field.fieldKey)
    setEditValue(entity?.[field.fieldKey] ?? '')
  }
  const cancelEdit = () => { setEditingKey(null); setEditValue('') }

  const saveField = async (fieldKey) => {
    setSaving(true)
    try {
      await moduleApi.patch(bp.apiBasePath, entityId, { [fieldKey]: editValue || null })
      qc.invalidateQueries({ queryKey: ['drawer-entity', bp.apiBasePath, entityId] })
      qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      toast.success('Saved')
      setEditingKey(null)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed')
    } finally { setSaving(false) }
  }

  // ── 7. Actions ────────────────────────────────────────────────────────────
  const [actingId,      setActingId]      = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [formAction,    setFormAction]    = useState(null)

  const executeAction = async (action, remarks = '') => {
    let meta = {}
    try { meta = JSON.parse(action.payloadTemplateJson || '{}') } catch {}
    if (meta.__formKey) { setFormAction(action); return }
    if (meta.__navRoute) { navigate(meta.__navRoute.replace('{id}', entityId)); return }
    const url = (action.apiEndpoint || '').replace('{id}', entityId).replace('{entityId}', entityId)
    try {
      setActingId(action.id)
      const payload = Object.fromEntries(Object.entries(meta).filter(([k]) => !k.startsWith('__')))
      if (remarks) payload.remarks = remarks
      const res = await api({ method: action.httpMethod || 'POST', url, data: payload })
      qc.invalidateQueries({ queryKey: ['drawer-entity', bp.apiBasePath, entityId] })
      qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      qc.invalidateQueries({ queryKey: ['view-context', bp.entityType, entityId] })
      qc.invalidateQueries({ queryKey: ['module-workflow', bp.entityType, entityId] })
      toast.success(action.label + ' successful')
      // For status-changing actions in drawer: re-fetch entity immediately
      // so action buttons re-filter with new status (no stale cache)
      const DRAWER_STATUS_ACTIONS = [
        'ISSUE_TRIAGE','ISSUE_START_REMEDIATION','ISSUE_SUBMIT_REVIEW',
        'ISSUE_VALIDATE','ISSUE_CLOSE','ISSUE_ACCEPT_RISK','ISSUE_REOPEN'
      ]
      if (DRAWER_STATUS_ACTIONS.includes(action.actionKey)) {
        // Force immediate refetch — don't wait for background revalidation
        await qc.refetchQueries({ queryKey: ['drawer-entity', bp.apiBasePath, entityId] })
        await qc.refetchQueries({ queryKey: ['view-context', bp.entityType, entityId] })
      }
      // __redirectToCreated: navigate to a route substituting the newly created entity's id.
      // Used for "New version" — the API returns { id, version } of the new draft.
      if (meta.__redirectToCreated) {
        const created = res?.data?.data || res?.data || res
        const newId = created?.id
        if (newId) navigate(meta.__redirectToCreated.replace('{id}', newId))
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || action.label + ' failed')
    } finally { setActingId(null) }
  }

  const handleAction = (action) => {
    let meta = {}
    try { meta = JSON.parse(action.payloadTemplateJson || '{}') } catch {}
    if (meta.__formKey) { setFormAction(action); return }
    if (action.requiresConfirmation || action.requiresRemarks) setConfirmAction({ action, remarks: '' })
    else executeAction(action)
  }

  // ── 8. Tabs — read from Screen Designer tabs_json, fall back to defaults ───
  const drawerSdTabs = useMemo(() => {
    try {
      const layout = screenConfig?.layout
      if (!layout?.tabsJson) return []
      const parsed = JSON.parse(layout.tabsJson)
      return Array.isArray(parsed) ? parsed.map(t =>
        typeof t === 'string' ? { key: t.toLowerCase().replace(/\s+/g,'_'), label: t }
        : { key: t.key, label: t.label || t.key }
      ) : []
    } catch { return [] }
  }, [screenConfig])

  const CAPABILITY_TAB_KEYS = new Set(['overview','comments','evidence','actions','workflow'])
  const drawerCustomTabs = drawerSdTabs.filter(t => !CAPABILITY_TAB_KEYS.has(t.key))

  const TABS = [
    { id: 'overview',  label: 'Overview' },
    // Custom SD tabs injected after overview (tests, policies, controls, sections, etc.)
    ...drawerCustomTabs.map(t => ({ id: t.key, label: t.label })),
    { id: 'comments',  label: 'Comments', hidden: !hasComments,
      badge: comments.length || null },
    { id: 'evidence',  label: 'Evidence',  hidden: !hasEvidence },
    { id: 'actions',   label: 'Action items', hidden: !hasActions },
    { id: 'workflow',  label: 'Workflow',  hidden: !hasWorkflow },
  ].filter(t => !t.hidden)

  const [activeTab, setActiveTab] = useState('overview')
  const [commentText, setCommentText] = useState('')

  // Escape to close
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose} aria-hidden="true" />

      <div className="fixed right-0 top-0 z-50 h-full w-[520px] bg-surface border-l border-border
                      flex flex-col shadow-2xl animate-slide-in-right">

        {/* ── Header ── */}
        <div className="px-5 pt-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[10px] font-mono text-text-muted">
                  {bp.displayName} #{entity?.id || entityId}
                </span>
                {entity?.status && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide
                                   bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    {entity.status.replace(/_/g,' ')}
                  </span>
                )}
                {entity?.severity && (
                  <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold border',
                    entity.severity === 'CRITICAL' ? 'bg-red-500/10 border-red-500/25 text-red-400' :
                    entity.severity === 'HIGH'     ? 'bg-orange-500/10 border-orange-500/25 text-orange-400' :
                    entity.severity === 'MEDIUM'   ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' :
                    'bg-green-500/10 border-green-500/25 text-green-400')}>
                    {entity.severity}
                  </span>
                )}
              </div>
              {loadingEntity
                ? <div className="h-5 w-64 bg-surface-overlay rounded animate-pulse" />
                : <h2 className="text-sm font-semibold text-text-primary leading-snug">
                    {entity?.title || entity?.name || `${bp.displayName} ${entityId}`}
                  </h2>
              }
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={onOpenFull}
                className="flex items-center gap-1.5 text-[11px] text-brand-400 hover:text-brand-300
                           border border-brand-500/25 hover:border-brand-500/50 rounded-md
                           px-2.5 py-1.5 transition-colors font-medium">
                <ExternalLink size={11} /> Full page
              </button>
              <button onClick={onClose}
                className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Action buttons — below title, above tabs */}
          {isLoading ? (
            /* Skeleton action buttons while entity/screen loads */
            <div className="flex items-center gap-2 flex-wrap mt-3">
              {[64, 80, 72].map((w, i) => (
                <div key={i} className="h-7 rounded-md animate-pulse bg-surface-overlay"
                  style={{ width: w }} />
              ))}
            </div>
          ) : screenActions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-3">
              {screenActions.map(action => (
                <Button key={action.id} size="sm"
                  variant={action.variant || 'secondary'}
                  loading={actingId === action.id}
                  onClick={() => handleAction(action)}>
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* ── Tab bar ── */}
        <div className="flex items-center border-b border-border shrink-0 px-5 overflow-x-auto">
          {isLoading ? (
            // Skeleton tabs while loading
            <div className="flex items-center gap-1 py-2">
              {[80, 60, 70, 55].map((w, i) => (
                <div key={i} className="h-6 rounded animate-pulse bg-surface-overlay"
                  style={{ width: w }} />
              ))}
            </div>
          ) : TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap',
                'border-b-2 -mb-px transition-colors shrink-0',
                activeTab === tab.id
                  ? 'border-brand-400 text-brand-400'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              )}>
              {tab.label}
              {tab.badge > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-overlay text-text-muted tabular-nums">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
          {/* History always links to full page */}
          <button onClick={onOpenFull}
            className="flex items-center gap-1 px-3 py-2.5 text-xs text-text-muted hover:text-text-secondary
                       border-b-2 border-transparent -mb-px transition-colors shrink-0 whitespace-nowrap">
            History <ExternalLink size={9} className="ml-0.5" />
          </button>
        </div>

        {/* ── Scrollable tab content ── */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* Loading skeleton */}
          {isLoading && (
            <div className="px-5 py-4 flex flex-col gap-3">
              <div className="h-4 w-3/4 rounded animate-pulse bg-surface-overlay" />
              <div className="h-3 w-full rounded animate-pulse bg-surface-overlay" />
              <div className="h-3 w-5/6 rounded animate-pulse bg-surface-overlay" />
              <div className="h-3 w-2/3 rounded animate-pulse bg-surface-overlay" />
              <div className="h-20 w-full rounded animate-pulse bg-surface-overlay mt-2" />
              <div className="h-3 w-4/5 rounded animate-pulse bg-surface-overlay" />
            </div>
          )}

          {/* ── OVERVIEW — Wrike-style: key props strip + description + activity ── */}
          {!isLoading && activeTab === 'overview' && (
            <div className="divide-y divide-border/40">

              {/* Key properties bar — Status, Assignee, Date in prominent tiles */}
              {!loadingEntity && (
                <>
                {/* ── SD header zone fields ── */}
                {headerFields.length > 0 && (
                  <div className="px-5 pt-4 grid grid-cols-12 gap-3">
                    {headerFields.map((field, fi) => {
                      const value = entity?.[field.fieldKey]
                      return (
                        <div key={fi} className={`col-span-${field.gridCols || 6}`}>
                          <FieldDisplay
                            label={field.label} value={value} type={field.fieldType}
                            editable={vc?.canEdit && !vc?.readOnlyFields?.includes(field.fieldKey)}
                            field={field}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="px-5 py-4 grid grid-cols-3 gap-3">
                  {/* Always show these key fields prominently if they exist on the entity */}
                  {[
                    { key: 'status',    label: 'Status' },
                    { key: 'ownerId',   label: 'Owner',   nameKey: 'ownerName' },
                    { key: 'dueAt',     label: 'Due date', isDate: true },
                  ].map(({ key, label, nameKey, isDate }) => {
                    const val = entity?.[nameKey || key]
                    const statusColor = key === 'status' && val
                      ? (SEMANTIC_COLORS[String(val).toUpperCase()] || 'gray')
                      : null
                    const cls = statusColor ? COLOR_MAP[statusColor] : null
                    return (
                      <div key={key}
                        className="flex flex-col gap-1 p-2.5 rounded-lg border border-border bg-surface-secondary hover:border-border-strong transition-colors cursor-pointer"
                        onClick={() => {
                          const field = fieldSections.flatMap(s=>s.fields).find(f=>f.fieldKey===key)
                          if (field) startEdit(field)
                        }}>
                        <span className="text-[9px] font-semibold text-text-muted uppercase tracking-wider">{label}</span>
                        {val
                          ? statusColor
                            ? <span className={cn('inline-flex items-center self-start px-2 py-0.5 rounded text-[11px] font-semibold font-mono', cls)}>
                                {String(val).replace(/_/g,' ')}
                              </span>
                            : isDate
                            ? <span className="text-xs font-medium text-text-primary">
                                {new Date(val).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                              </span>
                            : <span className="text-xs font-medium text-text-primary truncate">{String(val)}</span>
                          : <span className="text-[11px] text-text-muted/50 italic">Empty</span>
                        }
                      </div>
                    )
                  })}
                </div>
                </>
              )}

              {/* Other properties — 2-col grid */}
              {loadingEntity ? (
                <div className="px-5 py-4 grid grid-cols-2 gap-3">
                  {[1,2,3,4,5,6].map(i => (
                    <div key={i} className="space-y-1">
                      <div className="h-2.5 w-16 bg-surface-overlay rounded animate-pulse" />
                      <div className="h-7 bg-surface-overlay rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : fieldSections.length > 0 ? (
                <>
                  {fieldSections.map((section, si) => {
                    const TOP_BAR_KEYS = ['status','ownerId','dueAt']
                    const fields = section.fields.filter(f => !TOP_BAR_KEYS.includes(f.fieldKey))
                    if (!fields.length) return null
                    return (
                      <div key={si} className="px-5 py-4">
                        {section.label && (
                          <p className="text-[9px] font-semibold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                            {section.label} <span className="flex-1 h-px bg-border/60" />
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-x-5 gap-y-0">
                          {fields.map(field => {
                            const isWide = ['TEXTAREA','RICH_TEXT'].includes(field.fieldType) || field.gridCols >= 12
                            return (
                              <div key={field.fieldKey} className={isWide ? 'col-span-2' : ''}>
                                <DrawerProperty
                                  field={field}
                                  entity={entity}
                                  screenConfig={screenConfig}
                                  editingKey={editingKey}
                                  editValue={editValue}
                                  saving={saving}
                                  onStartEdit={startEdit}
                                  onChangeValue={setEditValue}
                                  onSave={saveField}
                                  onCancel={cancelEdit}
                                  vc={vc}
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </>
              ) : (
                <div className="px-5 py-4 grid grid-cols-2 gap-x-5 gap-y-0">
                  {entity && Object.entries(entity)
                    .filter(([k]) => !['id','createdAt','updatedAt','tenantId','createdBy','rcaJson','linkedControlIds','linkedRiskIds','status','ownerId','dueAt'].includes(k))
                    .map(([k, v]) => (
                      <div key={k} className="py-1.5">
                        <p className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                          {k.replace(/([A-Z])/g,' $1').trim()}
                        </p>
                        <p className="text-xs text-text-primary font-medium">{String(v ?? '—')}</p>
                      </div>
                    ))}
                </div>
              )}

              {/* Activity feed — inline in overview like Wrike */}
              {hasComments && (
                <div className="px-5 py-4">
                  <p className="text-[9px] font-semibold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                    Activity <span className="flex-1 h-px bg-border/60" />
                  </p>
                  <CommentFeed
                    comments={comments}
                    isLoading={false}
                    addComment={(data) => addCommentMut.mutate(data.commentText || data)}
                    adding={addCommentMut.isPending}
                    canEdit
                    emptyMessage="No activity yet."
                  />
                  {/* Quick comment input inline */}
                  <div className="flex items-end gap-2 mt-3">
                    <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (commentText.trim()) { addCommentMut.mutate(commentText.trim()); setCommentText('') }
                        }
                      }}
                      placeholder="Add a comment… (Enter to send)"
                      rows={2}
                      className="flex-1 px-3 py-2 text-xs bg-surface-secondary border border-border rounded-lg
                                 text-text-primary placeholder:text-text-muted focus:outline-none
                                 focus:ring-1 focus:ring-brand-500 resize-none" />
                    <Button size="sm" loading={addCommentMut.isPending}
                      disabled={!commentText.trim()}
                      onClick={() => { if (commentText.trim()) { addCommentMut.mutate(commentText.trim()); setCommentText('') } }}>
                      Send
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── COMMENTS ── */}
          {!isLoading && activeTab === 'comments' && (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <CommentFeed
                  comments={comments}
                  isLoading={false}
                  addComment={(data) => addCommentMut.mutate(data.commentText || data)}
                  adding={addCommentMut.isPending}
                  canEdit
                  emptyMessage="No comments yet — add one below."
                />
              </div>
            </div>
          )}

          {/* ── EVIDENCE ── */}
          {!isLoading && activeTab === 'evidence' && (
            <div className="px-5 py-4">
              <EvidenceUploader
                entityType={bp.entityType}
                entityId={entityId}
              />
            </div>
          )}

          {/* ── ACTION ITEMS ── */}
          {!isLoading && activeTab === 'actions' && (
            <div className="px-5 py-4">
              <ItemActionItems
                entityType={bp.entityType}
                entityId={entityId}
              />
            </div>
          )}

          {/* ── CUSTOM SD TABS (tests, policies, controls, sections etc.) ── */}
          {!isLoading && drawerCustomTabs.some(t => t.key === activeTab) && (
            <div className="px-5 py-4">
              <CustomTabContent
                tabKey={activeTab}
                detailScreenKey={bp.detailScreenKey}
                entity={entity}
                entityType={bp.entityType}
                vc={vc}
              />
            </div>
          )}

          {/* ── WORKFLOW — nudge to full page ── */}
          {!isLoading && activeTab === 'workflow' && (
            <div className="px-5 py-8 flex flex-col items-center gap-3 text-center">
              <div className="w-10 h-10 rounded-full bg-surface-overlay flex items-center justify-center">
                <GitBranch size={18} className="text-text-muted" />
              </div>
              <p className="text-sm font-medium text-text-secondary">Workflow timeline</p>
              <p className="text-xs text-text-muted max-w-xs">
                The full workflow history, step assignments, and re-evaluation options are
                available on the full page view.
              </p>
              <Button size="sm" icon={ExternalLink} onClick={onOpenFull}>
                Open full page
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Confirmation dialog ── */}
      {confirmAction && (
        <Modal open onClose={() => setConfirmAction(null)}
          title={confirmAction.action.label}
          subtitle={confirmAction.action.confirmationMessage || 'Confirm this action.'}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button size="sm" variant={confirmAction.action.variant || 'primary'}
                loading={actingId === confirmAction.action.id}
                onClick={() => { executeAction(confirmAction.action, confirmAction.remarks); setConfirmAction(null) }}>
                {confirmAction.action.label}
              </Button>
            </div>
          }>
          {confirmAction.action.requiresRemarks && (
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">
                Remarks <span className="text-red-400">*</span>
              </label>
              <textarea value={confirmAction.remarks}
                onChange={e => setConfirmAction(p => ({ ...p, remarks: e.target.value }))}
                rows={3} placeholder="Reason for this action…"
                className="w-full px-3 py-2 text-xs bg-surface-overlay border border-border rounded-lg
                           text-text-primary placeholder:text-text-muted focus:outline-none
                           focus:ring-1 focus:ring-brand-500 resize-none" />
            </div>
          )}
        </Modal>
      )}

      {/* ── Form-opening action modal (RCA, remediation, etc.) ── */}
      {formAction && (() => {
        let meta = {}
        try { meta = JSON.parse(formAction.payloadTemplateJson || '{}') } catch {}
        const submitUrl = (formAction.apiEndpoint || '').replace('{id}', entityId)
        return (
          <Modal open onClose={() => setFormAction(null)} title={formAction.label} size="lg">
            <DynamicForm
              formKey={meta.__formKey}
              defaultValues={{ entityId, entityType: bp.entityType }}
              onSubmit={async (data) => {
                try {
                  setActingId(formAction.id)
                  await api({ method: formAction.httpMethod || 'POST', url: submitUrl, data })
                  qc.invalidateQueries({ queryKey: ['drawer-entity', bp.apiBasePath, entityId] })
                  toast.success(formAction.label + ' saved')
                  setFormAction(null)
                } catch (e) {
                  toast.error(e?.response?.data?.message || 'Failed')
                } finally { setActingId(null) }
              }}
              loading={actingId === formAction.id}
              submitLabel={formAction.label}
            />
          </Modal>
        )
      })()}
    </>
  )
}

// ─── DrawerProperty ───────────────────────────────────────────────────────────
// Wrike-style property: small label above, value below, full row clickable.
// SELECT fields with optionsComponentKey render as DynamicBadge (colored).
// Fallback: semantic color map for common GRC values (status, severity, etc.)

// Semantic color fallback — covers common GRC values that may not have
// a configured optionsComponentKey yet.
const SEMANTIC_COLORS = {
  // Severity
  CRITICAL: 'red', HIGH: 'amber', MEDIUM: 'yellow', LOW: 'green',
  // Status
  OPEN: 'blue', IN_PROGRESS: 'indigo', PENDING_REVIEW: 'purple',
  TRIAGED: 'cyan', RESOLVED: 'green', CLOSED: 'gray',
  ACCEPTED_RISK: 'amber', PENDING_VALIDATION: 'yellow',
  // Issue type
  INTERNAL: 'blue', EXTERNAL: 'purple', AUTOMATED: 'cyan', REGULATORY: 'indigo',
  // Generic
  ACTIVE: 'green', INACTIVE: 'gray', DRAFT: 'gray', APPROVED: 'green',
  REJECTED: 'red', CANCELLED: 'gray', COMPLETED: 'green',
  true: 'green', false: 'gray',
}

function DrawerProperty({ field, entity, screenConfig, editingKey, editValue, saving,
  onStartEdit, onChangeValue, onSave, onCancel,
  vc = {},  // Gap 2: view context — used to gate click-to-edit per field
}) {
  const isEditing = editingKey === field.fieldKey
  const rawValue  = entity?.[field.fieldKey]
  const isEmpty   = rawValue === null || rawValue === undefined || rawValue === ''

  // Gap 2: a field is editable when vc.canEdit is not explicitly false AND the field is
  // not in readOnlyFields AND (editableFields is null/empty OR the field is listed there).
  const isFieldEditable = vc.canEdit !== false
    && !vc.readOnlyFields?.includes(field.fieldKey)
    && (
      !vc.editableFields || vc.editableFields.length === 0
      || vc.editableFields.includes(field.fieldKey)
    )

  // Determine if this field should render as a badge (not editable inline via text)
  const isBadgeField = ['SELECT', 'MULTI_SELECT', 'RADIO'].includes(field.fieldType) ||
    !!field.optionsComponentKey

  const renderValue = () => {
    if (isEmpty) return <span className="text-text-muted/40 text-[11px] italic">Empty</span>

    if (isBadgeField) {
      // Try DynamicBadge first — only works when screenConfig has options configured
      const hasOptions = screenConfig?.components?.[field.optionsComponentKey]?.options?.length > 0
      if (hasOptions && field.optionsComponentKey) {
        return <DynamicBadge value={String(rawValue)} componentKey={field.optionsComponentKey} config={screenConfig} className="text-[11px]" />
      }
      // Semantic fallback — always colorful even without Screen Designer component config
      const colorTag = SEMANTIC_COLORS[String(rawValue).toUpperCase()] || 'gray'
      const cls = COLOR_MAP[colorTag] || COLOR_MAP.gray
      return (
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold font-mono whitespace-nowrap', cls)}>
          {String(rawValue).replace(/_/g,' ')}
        </span>
      )
    }

    // Date
    if (field.fieldType === 'DATE') {
      return (
        <span className="text-xs text-text-primary font-medium">
          {new Date(rawValue).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
        </span>
      )
    }

    // Toggle / boolean
    if (field.fieldType === 'TOGGLE') {
      const colorTag = rawValue ? 'red' : 'green'  // SLA breached = bad = red; false = OK = green
      const cls = COLOR_MAP[colorTag]
      return (
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold', cls)}>
          {rawValue ? 'Breached' : 'On track'}
        </span>
      )
    }

    // Plain text / textarea — truncate long values
    const str = String(rawValue)
    return (
      <span className="text-xs text-text-primary font-medium leading-relaxed line-clamp-3">
        {str}
      </span>
    )
  }

  return (
    <div className="py-1.5">
      {/* Label — always visible, tiny + muted, Wrike style */}
      <p className="text-[9px] font-semibold text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
        {field.label}
        {field.isRequired && <span className="text-red-400">*</span>}
      </p>

      {/* Value — click to edit only when field is editable per vc (badge fields open a select, others open a text input) */}
      {isEditing ? (
        <div className="space-y-1.5">
          {field.fieldType === 'TEXTAREA' || field.fieldType === 'RICH_TEXT'
            ? <textarea value={editValue} onChange={e => onChangeValue(e.target.value)}
                rows={3} autoFocus
                className="w-full px-2.5 py-1.5 text-xs bg-background border border-brand-500/50
                           rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
            : field.fieldType === 'TOGGLE'
            ? <button type="button" onClick={() => onChangeValue(v => !v)}
                className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  editValue ? 'bg-brand-500' : 'bg-surface-overlay border border-border')}>
                <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                  editValue ? 'translate-x-4' : 'translate-x-0.5')} />
              </button>
            : <input autoFocus
                type={['NUMBER','DECIMAL'].includes(field.fieldType) ? 'number' : field.fieldType === 'DATE' ? 'date' : 'text'}
                value={editValue} onChange={e => onChangeValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onSave(field.fieldKey); if (e.key === 'Escape') onCancel() }}
                className="w-full h-7 px-2.5 text-xs bg-background border border-brand-500/50
                           rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          }
          <div className="flex items-center gap-1.5">
            <button onClick={() => onSave(field.fieldKey)} disabled={saving}
              className="text-[10px] px-2.5 py-1 rounded bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors font-medium">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={onCancel}
              className="text-[10px] px-2 py-1 rounded border border-border text-text-muted hover:text-text-primary transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : isFieldEditable ? (
        <button onClick={() => onStartEdit(field)}
          className={cn(
            'w-full text-left px-2 py-1 rounded-md transition-all group min-h-[28px]',
            'border border-transparent hover:border-border/60 hover:bg-surface-overlay',
          )}>
          <span className="flex items-center justify-between gap-2">
            <span>{renderValue()}</span>
            <Pencil size={9} className="text-text-muted opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />
          </span>
        </button>
      ) : (
        /* Gap 2: read-only — no hover, no pencil, no click */
        <div className="w-full text-left px-2 py-1 rounded-md min-h-[28px]">
          {renderValue()}
        </div>
      )}
    </div>
  )
}