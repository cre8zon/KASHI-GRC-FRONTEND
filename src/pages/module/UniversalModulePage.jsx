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
import { TestInstanceEvidenceTab }       from '../../components/audit/TestInstanceEvidenceTab'
import { FindingEvidenceTab }            from '../../components/audit/FindingEvidenceTab'
import { IssueEvidenceTab }              from '../../components/audit/IssueEvidenceTab'
import { TestInstanceMappedControlsTab } from '../../components/audit/TestInstanceMappedControlsTab'
import { PolicyInstanceMappedControlsTab } from '../../components/audit/PolicyInstanceMappedControlsTab'
import { PolicyContentTab }              from '../../components/audit/PolicyContentTab'
import { PolicyVersionsTab }             from '../../components/audit/PolicyVersionsTab'
import { EngagementFindingsTab }         from '../../components/audit/EngagementFindingsTab'
import { EngagementIntegrationTab }      from '../../components/audit/EngagementIntegrationTab'
import { ProjectFindingsTab }            from '../../components/audit/ProjectFindingsTab'
import ProjectEngagementsTab             from '../../components/audit/ProjectEngagementsTab'
import { TestPolicyCsvImportModal }  from '../../components/audit/TestPolicyCsvImportModal'
import { WorkflowTimeline }       from '../../components/workflow/WorkflowTimeline'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as LucideIcons from 'lucide-react'
// Destructure commonly used icons for direct JSX use
const {
  Plus, ArrowLeft, RefreshCw, Search, GitBranch, CheckCircle2,
  Upload, MessageSquare, FileText, Activity, AlertTriangle, Eye,
  ChevronRight, Pencil, Trash2, ExternalLink, Info, Lock, X, CheckSquare,
  Hash, ServerCrash, BarChart2, Play, PlayCircle, XCircle, CheckCircle,
  Shield, ShieldCheck, Tag, UserPlus, Send, Archive, RotateCcw, PauseCircle,
  ShieldOff, Layers, Globe, FolderKanban, CornerDownLeft, Clipboard,
  Settings, Users, Bell, Star, Zap, Flag, BookOpen, List, LayoutGrid,
  Calendar, Clock, TrendingUp, Target, Award, Briefcase,
} = LucideIcons
import { PageLayout } from '../../components/layout/PageLayout'
import { Button } from '../../components/ui/Button'

// Resolves a string icon name from the DB (e.g. "BarChart2") to a Lucide component.
// Falls back to null when the name is unknown — callers fall back to Hash or nothing.
// Dynamic icon resolver — looks up any Lucide icon by name.
// No static map needed; LucideIcons contains every icon from the package.
const resolveIcon = (name) => {
  if (!name) return null
  return LucideIcons[name] || LucideIcons[name + 'Icon'] || null
}
import { Badge, DynamicBadge } from '../../components/ui/Badge'
import { COLOR_MAP } from '../../config/constants'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { DataTable } from '../../components/ui/DataTable'
import { DynamicForm } from '../../components/forms/DynamicForm'
import { CommentFeed } from '../../components/comments/CommentFeed'
import { useComments } from '../../hooks/useComments'
import { ItemActionItems } from '../../components/item-panel/ItemActionItems'
import EvidenceUploader from '../../components/ui/EvidenceUploader'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'
import api from '../../config/axios.config'
import { uiConfigApi } from '../../api/uiConfig.api'
import { commentsApi } from '../../api/comments.api'
import { useSelector, useDispatch } from 'react-redux'
import { selectActiveTabId, saveSubTab, selectActiveSubTab } from '../../store/slices/tabsSlice'
import { selectAuth, selectRoleSides } from '../../store/slices/authSlice'
import { parseRoleAccessJson, isTabAllowed, isActionAllowed } from '../../components/screen-designer/roleAccessJson'
// ── v2 additions ─────────────────────────────────────────────────────────────
import EntityTreeView          from '../../components/module/EntityTreeView'
import { useModuleSocket,
         useModuleListSocket } from '../../hooks/useModuleSocket'
import { useUserTaskSocket } from '../../hooks/useWorkflowSocket'

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
  // After task completion — check if same user has next task on same entity
  nextTask: (entityType, entityId) =>
    api.get('/v1/workflow-instances/tasks/my-next', { params: { entityType, entityId } })
       .then(r => r?.data?.data || null),
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

const useBlueprint = (entityType) => useQuery({
  queryKey: ['module-blueprint-type', entityType],
  queryFn: () => moduleApi.blueprint(entityType),
  enabled: !!entityType,
  staleTime: 10 * 60 * 1000,   // 10 min — only changes via Screen Designer
  gcTime:   30 * 60 * 1000,    // 30 min in cache — survives navigation away and back
  refetchOnWindowFocus: false,
})

const useViewContext = (entityType, entityId, stepInstanceId, taskId) => useQuery({
  queryKey: ['view-context', entityType, entityId, stepInstanceId, taskId],
  queryFn: () => moduleApi.viewContext(entityType, entityId, stepInstanceId, taskId),
  enabled: !!entityType,
  staleTime: 30 * 1000,
  refetchOnWindowFocus: false,
})

const useScreenConfig = (screenKey) => useQuery({
  queryKey: ['screen-config', screenKey],
  queryFn: () => moduleApi.screenConfig(screenKey),
  enabled: !!screenKey,
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
})

// Framework-ref display helpers ------------------------------------------------
// Turn a stored frameworkRef into a readable label. Handles both the compact
// form ('ISO27001') and spaced form ('ISO 27001'), plus common frameworks.
function formatFrameworkRef(ref) {
  if (!ref) return ''
  const known = {
    ISO27001: 'ISO 27001', 'ISO27001:2022': 'ISO 27001',
    SOC2: 'SOC 2', RBI: 'RBI', DPDPA: 'DPDPA', PCIDSS: 'PCI DSS',
  }
  const compact = ref.replace(/\s+/g, '')
  if (known[compact]) return known[compact]
  // Fallback: insert a space between letters and digits (ISO27001 -> ISO 27001)
  return ref.replace(/([A-Za-z])(\d)/g, '$1 $2')
}

// Strip a leading framework word from a base title so we don't double it up,
// e.g. baseTitle 'SOC 2 Engagements' -> 'Engagements' before prefixing the
// actual framework. Keeps the entity noun (Engagements/Findings/etc.).
function stripFrameworkPrefix(title) {
  if (!title) return title
  return title.replace(/^(SOC ?2|ISO ?27001(?::2022)?|RBI|DPDPA|PCI ?DSS)\s+/i, '')
}

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

  // Guard: audit_engagement is a SHARED module only ever reached with a
  // frameworkRef (via a framework nav row) or scoped under a project. The bare
  // /module/audit_engagement list (no frameworkRef, no parent) is not a real
  // destination — nothing links to it, and it would show an unscoped, mislabeled
  // mix of frameworks. Redirect it away so it can't be opened by hand.
  const _guardParams = useSearchParams()[0]
  const _guardNavigate = useNavigate()
  const _isBareEngagementList =
    entityType === 'AUDIT_ENGAGEMENT' &&
    !id &&
    !params.parentEntityType &&
    !_guardParams.get('frameworkRef')
  useEffect(() => {
    if (_isBareEngagementList) _guardNavigate('/dashboard', { replace: true })
  }, [_isBareEngagementList]) // eslint-disable-line
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

  // While the redirect effect runs, render nothing (prevents a flash of the
  // unscoped engagement list before navigation completes).
  if (_isBareEngagementList) return null

  return id
    ? <ModuleDetailView bp={resolvedBp} id={id} />
    : <ModuleListView   bp={resolvedBp} />
}

// ─── List View ────────────────────────────────────────────────────────────────

function ModuleListView({ bp }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  // Framework-aware label so the search placeholder and empty state read
  // 'ISO 27001 engagements' (not the blueprint's fixed 'soc 2 engagements')
  // when reached via a framework nav row.
  const _frameworkRef = searchParams.get('frameworkRef') || undefined
  const _basePlural = bp.displayNamePlural || bp.displayName || 'records'
  const _baseSingular = bp.displayName || 'record'
  const entityPlural = _frameworkRef
    ? `${formatFrameworkRef(_frameworkRef)} ${stripFrameworkPrefix(_basePlural)}`
    : _basePlural
  const entitySingular = _frameworkRef
    ? `${formatFrameworkRef(_frameworkRef)} ${stripFrameworkPrefix(_baseSingular)}`
    : _baseSingular
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen,  setImportOpen]  = useState(false)
  const [sortBy,       setSortBy]       = useState(null)
  const [sortDir,      setSortDir]      = useState('desc')
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

  // frameworkRef scopes a SHARED module (audit_engagement/finding) to one
  // framework, so an ISO-only tenant reaching the page via the ISO nav row sees
  // only ISO rows — never SOC2/RBI. Comes from the nav route's ?frameworkRef=.
  const frameworkRef = searchParams.get('frameworkRef') || undefined
  const params = { search: search || undefined, skip: page * 20, take: 20,
    frameworkRef,
    sortBy: sortBy || undefined, sortDirection: sortBy ? sortDir : undefined }
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
    // Stamp the URL's frameworkRef onto the new entity so an engagement created
    // from the ISO nav belongs to ISO (not left null / defaulted to SOC2).
    mutationFn: (data) => moduleApi.create(bp.apiBasePath,
      frameworkRef ? { frameworkRef, ...data } : data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      toast.success(`${entitySingular} created successfully`)
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

  // Framework-aware page title. On a shared module reached via a framework nav
  // row (?frameworkRef=ISO27001), show the framework's name instead of the
  // blueprint's fixed displayName (which is 'SOC 2 Engagement').
  const frameworkLabel = frameworkRef ? formatFrameworkRef(frameworkRef) : null
  const baseTitle = bp.displayNamePlural || bp.displayName
  const pageTitle = frameworkLabel
    ? `${frameworkLabel} ${stripFrameworkPrefix(baseTitle)}`
    : baseTitle

  return (
    <PageLayout
      title={pageTitle}
      subtitle={parentLabel
        ? `${parentLabel} · ${total} record${total !== 1 ? 's' : ''}`
        : `${total} record${total !== 1 ? 's' : ''}`}
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${entityPlural.toLowerCase()}…`}
              className="w-52 pl-8 pr-3 h-8 text-xs bg-surface-overlay border border-border rounded-ctl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          {/* FIX: Render screen designer actions for this list screen.
              This is the single source of truth for toolbar buttons — no more
              hardcoded "New entity" button. Each action's payloadTemplateJson
              controls what happens: __formKey → form modal, __navRoute → navigate,
              direct endpoint → API call. Fallback: show create button if no
              screen actions are configured yet. */}
          {listScreenActions.length > 0
            ? listScreenActions.map(action => {
              const ListIcon = resolveIcon(action.icon) || (action.actionKey?.includes('CREATE') || action.actionKey?.includes('NEW') ? Plus : undefined)
              return (
              <Button key={action.id} size="sm"
                variant={action.variant === 'secondary' ? 'secondary' : 'primary'}
                icon={ListIcon}
                onClick={() => handleListAction(action)}>
                {action.label}
              </Button>
              )
            })
            : canCreate && (
              <Button icon={Plus} size="sm" onClick={() => setCreateOpen(true)}>
                New {entitySingular}
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
              emptyMessage={`No ${entityPlural.toLowerCase()} found`}
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
                  <div className="flex items-center gap-3 px-4 py-2 mb-3 rounded-card bg-brand-500/8 border border-brand-500/20 text-xs">
                    <span className="text-brand-ink font-medium">{selectedIds.length} selected</span>
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
                emptyMessage={`No ${entityPlural.toLowerCase()} found`}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                pagination={listRes?.pagination || listRes?.data?.pagination}
                onPageChange={(p) => setPage(p - 1)}
                selectable={!!screenConfig?.layout?.selectable && listScreenActions.some(a => { try { return JSON.parse(a.payloadTemplateJson || '{}')['__bulk'] === true } catch { return false } })}
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
          title={`New ${entitySingular}`}
          size="lg"
        >
          <DynamicForm
            formKey={bp.createFormKey}
            // frameworkRef flows into framework-scoped lookups (e.g. the template
            // picker fetches only this framework's templates) and is stamped on submit.
            contextParams={frameworkRef ? { frameworkref: frameworkRef } : undefined}
            // FIX: mutateAsync (not mutate) so a rejected promise propagates to
            // DynamicForm's handleFormSubmit catch block, which then calls setError()
            // per field and shows inline validation messages instead of a silent failure.
            onSubmit={async (data) => {
              await createMut.mutateAsync(data)
              setCreateOpen(false)  // close only after success
            }}
            loading={createMut.isPending}
            submitLabel={`Create ${entitySingular}`}
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
              // Same framework wiring as the fallback create modal: filter framework-
              // scoped lookups (template picker) AND stamp frameworkRef on submit.
              // This is the screen-action create path (New engagement button), which
              // was previously missing both — so engagements saved with framework_ref
              // NULL and the template dropdown showed every framework.
              contextParams={frameworkRef ? { frameworkref: frameworkRef } : undefined}
              onSubmit={async (data) => {
                const endpoint = listFormAction.apiEndpoint || bp.apiBasePath
                const payload = frameworkRef ? { frameworkRef, ...data } : data
                await api({ method: listFormAction.httpMethod || 'POST', url: endpoint, data: payload })
                qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
                toast.success(`${entitySingular} created`)
                setListFormAction(null)  // close only after success
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

  // History is now a toggleable capability (Blueprint Settings → Capabilities),
  // gated by supportsHistory — same pattern as Workflow/Comments. Overview stays
  // always-on. Existing blueprints default supportsHistory=true, so History keeps
  // showing unless an admin turns it off.
  { key: 'history',  label: 'History',       icon: Activity,     cap: 'supportsHistory' },
]

// Capability tab keys — these are always rendered by a fixed component, not SD fields
const CAPABILITY_TAB_KEYS = new Set(['overview','workflow','actions','evidence','comments','history'])

// Shared capability-tab body — used by BOTH the full detail page and the drawer,
// so they render identical, working tabs (evidence buckets, comments feed,
// workflow timeline, history). entity may be null in the drawer before load;
// id is the entity id in either mode.
function CapabilityTabBody({ tab, bp, id, entity, vc }) {
  if (tab === 'workflow' && bp.supportsWorkflow)
    return <WorkflowTab entityType={bp.entityType} entityId={id} vc={vc} bp={bp} entity={entity} />

  if (tab === 'actions' && bp.supportsActionItems)
    return <ItemActionItems entityType={bp.entityType} entityId={Number(id)} />

  if (tab === 'evidence' && bp.supportsDocuments) {
    if (bp.entityType === 'AUDIT_CONTROL_INSTANCE')
      return <ControlInstanceEvidenceTab controlInstanceId={entity?.id ?? Number(id)} vc={vc} />
    if (bp.entityType === 'AUDIT_TEST_INSTANCE')
      return <TestInstanceEvidenceTab testInstanceId={entity?.id ?? Number(id)} vc={vc} />
    if (bp.entityType === 'AUDIT_FINDING')
      return <FindingEvidenceTab entityId={Number(id)} vc={vc} />
    if (bp.entityType === 'ISSUE')
      return <IssueEvidenceTab entityId={Number(id)} vc={vc} />
    return <EvidenceTab entityId={id} entityType={bp.entityType} vc={vc} />
  }

  if (tab === 'comments' && bp.supportsComments)
    return <ModuleCommentsTab entityType={bp.entityType} entityId={Number(id)} />

  if (tab === 'history' && bp.supportsHistory)
    return <HistoryTab entityType={bp.entityType} entityId={id} apiBasePath={bp.apiBasePath} />

  return null
}

function ModuleDetailView({ bp, id }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  // Smart default tab — driven by snap_step_action from ViewContext.
  // Resolves after vc loads, so we use useEffect to update after first render.
  // ASSIGN step → sections tab (Lead Auditor assigning sections)
  // REVIEW/EVALUATE → controls tab (Auditor reviewing test results)
  // FILL/APPROVE/ACKNOWLEDGE → overview (default)
  // Tab state is URL-driven — declared after searchParams below.
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

  // ── Workflow task context ──────────────────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams()
  const stepInstanceId = searchParams.get('stepInstanceId') || undefined
  const taskId         = searchParams.get('taskId') || undefined

  // Tab state persisted in Redux app tab store so switching app tabs restores it.
  // Falls back to URL param then 'overview'.
  const dispatch       = useDispatch()
  const activeAppTabId = useSelector(selectActiveTabId)
  const savedSubTab    = useSelector(selectActiveSubTab)
  // An explicit ?tab= in the URL (e.g. a comment-notification deep-link to
  // ?tab=comments) takes priority over the Redux-saved sub-tab, so deep-links
  // always land on the intended tab. Falls back to saved tab, then overview.
  const urlTab = searchParams.get('tab')
  const tab = urlTab || savedSubTab || 'overview'
  const setTab = (key) => {
    dispatch(saveSubTab({ tabId: activeAppTabId, subTab: key }))
  }

  // ── Seamless task transition via WebSocket ─────────────────────────────────
  // When the backend assigns a new task to this user on this same entity
  // (because the previous step completed and advanced), the TASK_ASSIGNED
  // WebSocket event fires. We update the URL params in place — no inbox trip,
  // no polling, no page reload. Works for ALL modules generically:
  // Issues, Audit Projects, TPRM, anything on UniversalModulePage.

  const handleTaskAssigned = useCallback(({ taskId: newTaskId, stepInstanceId: newStepInstanceId, stepName, navKey, artifactId }) => {
    // Cross-page transition: navKey differs from current page blueprint navKey
    // e.g. user is on audit_project_detail, new task is on audit_engagement_detail
    if (navKey && bp?.navKey && navKey !== bp.navKey && artifactId) {
      const route = navKey.replace('_detail', '')
      navigate(`/module/${route}/${artifactId}?taskId=${newTaskId}&stepInstanceId=${newStepInstanceId}`)
      toast.success(`Next step: ${stepName || 'Step'}`, { icon: '→', duration: 3000 })
      return
    }
    // Same-page transition — just update URL params
    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      p.set('taskId',         String(newTaskId))
      p.set('stepInstanceId', String(newStepInstanceId))
      return p
    })
    const isTransition = !!taskId  // already had a task — this is step advancement
    if (isTransition) {
      toast.success(`Next step: ${stepName || 'Step'}`, { icon: '→', duration: 3000 })
    } else {
      toast.success(`You've been assigned: ${stepName || 'New task'}`, { icon: '📋', duration: 5000 })
    }
  }, [setSearchParams, taskId, navigate, bp?.navKey])


  // ── transitionToNextTask ─────────────────────────────────────────────────
  // The WebSocket TASK_ASSIGNED event (handleTaskAssigned above) is the primary
  // mechanism for transitioning to the next task. This function is called from
  // action buttons as a fallback — it waits briefly to let the WS event fire
  // first, then only clears task context if no new task arrived via WS.
  // Do NOT call any API here — the 404 on my-next was clearing taskId before
  // the WS event could fire, breaking the seamless transition.
  const transitionToNextTask = useCallback(async (entityType, entityId) => {
    // Give the WebSocket 2 seconds to fire TASK_ASSIGNED before doing anything.
    // If it fires, handleTaskAssigned updates the URL — we do nothing here.
    // If it doesn't fire (last step, workflow done), we clear task context.
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Check if a new taskId arrived via WS during the wait
    const currentParams = new URLSearchParams(window.location.search)
    const currentTaskId = currentParams.get('taskId')

    if (currentTaskId && currentTaskId !== String(taskId)) {
      // WS already updated the taskId — nothing to do
      return true
    }

    // No new task arrived — clear task context (last step or workflow complete)
    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      p.delete('taskId')
      p.delete('stepInstanceId')
      return p
    })
    return false
  }, [taskId, setSearchParams])

  // ── Parallel fetch optimisation ───────────────────────────────────────────
  // Blueprint, entity, and view-context are independent — start all three
  // immediately so they fetch in parallel instead of blueprint → entity → vc waterfall.

  // ── Generic parallel prefetch ─────────────────────────────────────────────
  // Once the blueprint resolves (fast from cache after first visit), immediately
  // prefetch the entity and view-context in parallel. The entity fetch uses
  // bp.apiBasePath which comes from the blueprint — zero hardcoding, works for
  // every module universally. On first cold load there's still a waterfall;
  // on all subsequent navigations blueprint is cached and all three fire together.
  const qcPrefetch = useQueryClient()
  useEffect(() => {
    if (!bp.apiBasePath || !id) return
    // Prefetch entity if not already in cache
    qcPrefetch.prefetchQuery({
      queryKey: ['module-detail', bp.apiBasePath, id],
      queryFn:  () => moduleApi.get(bp.apiBasePath, id),
      staleTime: 30 * 1000,
    })
  }, [bp.apiBasePath, id]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: entityRes, isLoading, isError } = useEntityDetail(bp.apiBasePath, id)
  const entity = entityRes?.data || entityRes

  // Gap 3: pass stepInstanceId so backend resolves step-action-aware editableFields
  const { data: vcRes } = useViewContext(bp.entityType || entityType, id, stepInstanceId, taskId)
  const vc = vcRes?.data || vcRes || {}

  // ── Self-correct stale URL params ────────────────────────────────────────
  // When a step transitions (e.g. Step 7 → Step 8), the WebSocket fires
  // TASK_ASSIGNED to update the URL. If the user missed the WS event (page
  // was closed, reconnect lag), the URL carries the old stepInstanceId.
  // Detect by comparing URL params with what the backend says is active.
  useEffect(() => {
    const backendStepId = vc.stepInstanceId ? String(vc.stepInstanceId) : null
    const backendTaskId = vc.taskId         ? String(vc.taskId)         : null
    const urlStepId     = stepInstanceId    ? String(stepInstanceId)    : null
    const urlTaskId     = taskId            ? String(taskId)            : null

    if (!backendStepId) return // vc not loaded or no active task

    // Case 1: URL has wrong stepInstanceId (stale after WS-driven step advance)
    if (urlStepId && backendStepId !== urlStepId) {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev)
        p.set('stepInstanceId', backendStepId)
        if (backendTaskId) p.set('taskId', backendTaskId)
        else p.delete('taskId')
        return p
      })
      return
    }

    // Case 2: URL has no task context at all but user has an active task
    // (e.g. opened page from sidebar instead of task inbox)
    // Only inject if vc explicitly has a taskId (user is assigned to this step)
    if (!urlStepId && !urlTaskId && backendTaskId && backendStepId) {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev)
        p.set('taskId',         backendTaskId)
        p.set('stepInstanceId', backendStepId)
        return p
      })
    }
  }, [vc.stepInstanceId, vc.taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Role-based tab/action visibility — Screen Designer's roleAccessJson ────
  // Data-driven: consults whatever was configured per-role/per-side in Screen
  // Designer. No tab/action key is ever hardcoded here — if nothing is
  // configured for a screen, everything stays visible exactly as before.
  const auth         = useSelector(selectAuth)
  const currentUserId = auth?.userId

  // ── Generic parent breadcrumb resolution ────────────────────────────────────
  // Resolves from blueprint parentContextJson + entity fields.
  // Works for ANY module hierarchy: Control → Engagement, Test → Engagement,
  // Policy → Engagement, Engagement → Project, etc.
  const parentCtxJson = (() => {
    try { return bp.parentContextJson ? JSON.parse(bp.parentContextJson) : null }
    catch { return null }
  })()

  // The parent entity ID: blueprint tells us which field on the entity holds it
  // e.g. parentContextJson.parentIdField = "engagementId" → entity.engagementId
  const parentIdField  = parentCtxJson?.parentIdField  || null
  const parentNavKey   = parentCtxJson?.parentNavKey   || null
  const parentEntityType = parentCtxJson?.parentEntityType || null

  // Generic parent ID from entity using the configured field name
  const genericParentId = parentIdField ? (entity?.[parentIdField] ?? null) : null

  // Special case: AUDIT_ENGAGEMENT → AUDIT_PROJECT (uses projectInstanceId)
  const parentProjectInstanceId = bp.entityType === 'AUDIT_ENGAGEMENT'
    ? (entity?.projectInstanceId ?? entity?.projectSnapshot?.id ?? null)
    : null

  // The breadcrumb parent: prefer generic (blueprint-driven), fall back to project special case
  const breadcrumbParentId     = genericParentId ?? parentProjectInstanceId
  const breadcrumbParentNavKey = parentNavKey ?? (parentProjectInstanceId ? 'audit_project' : null)

  // Parent label: use entity's snapshot of parent name if available,
  // otherwise fall back to "EntityType #id"
  const parentNameField = parentCtxJson?.parentNameField || null  // e.g. "engagementName"
  const parentProjectLabel = entity?.projectSnapshot?.name
    || entity?.projectSnapshot?.projectName
    || (parentProjectInstanceId ? `Project #${parentProjectInstanceId}` : null)
  const genericParentLabel = parentNameField ? (entity?.[parentNameField] ?? null) : null
  const breadcrumbParentLabel = genericParentLabel
    ?? parentProjectLabel
    ?? (breadcrumbParentId && parentEntityType
        ? `${parentEntityType.replace(/_/g, ' ')} #${breadcrumbParentId}`
        : null)

  // List page breadcrumb — navigate to the entity's list using its navKey.
  // bp.navKey matches ui_navigation.nav_key which has the correct route.
  // We navigate to /module/{navKey} which resolves to the list view.
  // Suppress when entity has a parent (scoped entity — list would be misleading).
  const listNavKey = !breadcrumbParentId
    ? (bp.listNavKey || bp.navKey || null)
    : null
  // The record carries its own frameworkRef — use it so the breadcrumb reads
  // 'ISO 27001 Engagements' and the back link returns to the FRAMEWORK-scoped
  // list (not the generic SOC 2 one showing all frameworks).
  const detailFrameworkRef = entity?.frameworkRef || null
  const _detailBasePlural = bp.displayNamePlural || bp.displayName
  const listLabel = listNavKey
    ? (detailFrameworkRef
        ? `${formatFrameworkRef(detailFrameworkRef)} ${stripFrameworkPrefix(_detailBasePlural)}`
        : _detailBasePlural)
    : null

  useUserTaskSocket(currentUserId, {
    watchEntityType:      bp?.entityType,
    watchEntityId:        id,
    watchParentProjectId: parentProjectInstanceId, // for engagement pages — catch project-level tasks
    onTaskAssigned:       handleTaskAssigned,
  })
  const userSides     = useSelector(selectRoleSides)
  const currentSide    = userSides?.[0] || null
  const currentRoleIds = (auth?.roles || []).map(r => r.id ?? r.roleId).filter(Boolean)

  // Reset to overview whenever the entity ID changes (navigating between records).
  // Clear saved sub-tab in Redux so the new entity starts on its default tab.
  useEffect(() => {
    dispatch(saveSubTab({ tabId: activeAppTabId, subTab: null }))
  }, [id]) // eslint-disable-line

  // Auto-select tab based on workflow step action when coming from a task.
  // Only fires once when vc.stepAction first resolves — doesn't override
  // user's manual tab clicks (useEffect dep is stepAction string, not vc object).
  useEffect(() => {
    if (!stepInstanceId || !vc.stepAction) return

    // Default tab map — works for most entity types
    const tabMap = {
      ASSIGN:      'sections',
      REVIEW:      'controls',
      EVALUATE:    'controls',
      FILL:        'overview',
      APPROVE:     'overview',
      ACKNOWLEDGE: 'overview',
    }

    // Entity-type-specific overrides — where the module's tab keys differ
    const entityTabOverrides = {
      AUDIT_PROJECT: {
        ASSIGN:      'engagements',  // Lead auditor assignment in Engagements tab
        FILL:        'engagements',  // Findings remediation etc. in Engagements tab
        REVIEW:      'engagements',
        APPROVE:     'engagements',
        ACKNOWLEDGE: 'engagements',
      },
    }

    const overrides = entityTabOverrides[bp?.entityType] || {}
    const target = overrides[vc.stepAction] ?? tabMap[vc.stepAction]
    if (target) setTab(target)
  }, [vc.stepAction, stepInstanceId, bp?.entityType])

  // When opened from a task with no resolved stepAction yet, set a sensible
  // default tab so the page isn't blank while vc loads
  useEffect(() => {
    if (!stepInstanceId) return
    const entityDefaultTabs = {
      AUDIT_PROJECT:    'engagements',
      AUDIT_ENGAGEMENT: 'sections',
    }
    const defaultForEntity = entityDefaultTabs[bp?.entityType]
    if (defaultForEntity) setTab(defaultForEntity)
  }, [stepInstanceId, bp?.entityType])

  const { data: screenRes, isLoading: screenLoading } = useScreenConfig(bp.detailScreenKey)

  // ── Screen Designer tabsJson — custom tabs defined in SD detail screen ──────
  const sdLayout = screenRes?.layout
  const roleAccess = useMemo(() => parseRoleAccessJson(sdLayout?.roleAccessJson), [sdLayout?.roleAccessJson])
  const sdCustomTabs = useMemo(() => {
    try {
      const parsed = JSON.parse(sdLayout?.tabsJson || 'null')
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(t => {
          const key = typeof t === 'string' ? t.toLowerCase().replace(/\s+/g,'_') : t.key
          return key && !CAPABILITY_TAB_KEYS.has(key)
        }).map(t => typeof t === 'string'
          ? { key: t.toLowerCase().replace(/\s+/g,'_'), label: t }
          : { key: t.key, label: t.label || t.key, icon: t.icon || null })
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
      // __hideIfField: hide action when entity field is truthy (set in payloadTemplateJson)
      // e.g. { "__hideIfField": "ownerId" } hides action when entity.ownerId is set
      // __showIfFieldNull: show action only when entity field is null/empty
      try {
        const meta = JSON.parse(action.payloadTemplateJson || '{}')
        if (meta.__hideIfField && entity?.[meta.__hideIfField]) return false
        if (meta.__showIfFieldNull && entity?.[meta.__showIfFieldNull] != null
            && entity?.[meta.__showIfFieldNull] !== '') return false
      } catch {}
      // requiredPermission gate
      if (action.requiredPermission && vc.permissions?.length > 0) {
        if (!vc.permissions.includes(action.requiredPermission)) return false
      }
      // Workflow-advancing actions: derived from blueprint statusFlowJson transitions.
      // Each transition has an actionKey — if the current action matches one,
      // hide it when the user has no active task (vc.canAct === false).
      // This is zero-code: adding a transition in Module Blueprints automatically
      // gates the button by task ownership. No hardcoding needed.
      try {
        const sf = JSON.parse(bp.statusFlowJson || '{}')
        const transitionKeys = new Set(
          (sf.transitions || []).map(t => t.actionKey).filter(Boolean)
        )
        // COMPLETE_STEP is a universal workflow action used across all modules
        transitionKeys.add('COMPLETE_STEP')
        // Workflow-advancing actions require an active task context.
        // canAct is now set by backend in resolveForModule even without URL taskId:
        //   - Path A: user has a pending task at this step (vc.taskId populated)
        //   - Path B: user has workflow:step:override permission (vc.taskId null, vc.stepInstanceId set)
        // Hide action if backend says canAct=false (wrong role, wrong step, no task, no override)
        const effectiveCanAct = vc.canAct === true
        if (transitionKeys.has(action.actionKey) && !effectiveCanAct) return false
        // When a step uses compound-task section gates (hasSections=true), completion
        // happens automatically when all section items are done — hide the manual button
        // to prevent premature APPROVE calls that would fail the gate check.
        // This is fully generic — works for any module, not just AUDIT_PROJECT.
        if (action.actionKey === 'COMPLETE_STEP' && vc.hasSections === true) return false

        // Assignment-scoped actions: flagged in ui_actions.requires_assignment = true.
        // When set, the action is only visible if the entity reports the current user
        // is assigned (entity.isAssignedToCurrentUser returned by the GET endpoint).
        // No task context needed — the entity-level assignment IS the scope gate.
        if (action.requiresAssignment && !taskId) {
          if (entity?.isAssignedToCurrentUser === false) return false
        }
      } catch { /* statusFlowJson parse error — skip transition gate */ }
      // Screen Designer's per-role action visibility (roleAccessJson.actions)
      if (!isActionAllowed(roleAccess, currentSide, currentRoleIds, action.actionKey)) return false
      return true
    })
  }, [screenConfig?.actions, entity?.status, vc.permissions, vc.canAct, entity, roleAccess, currentSide, currentRoleIds])

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
      .replace('{engagementId}', entity?.engagementId || entity?.engagement_id || id)
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
      // ── Override path: workflow:step:override — no task, use override endpoint ──
      // When backend returns canAct=true but no taskId, the user has override authority.
      // Route APPROVE/REJECT/SEND_BACK to the step override endpoint instead of task action.
      const isWorkflowTransition = ['APPROVE', 'REJECT', 'SEND_BACK', 'COMPLETE_STEP'].includes(action.actionKey)
      const isOverridePath = isWorkflowTransition && vc.canAct && !vc.taskId && vc.stepInstanceId
      if (isOverridePath) {
        await api.post(`/v1/workflow-instances/steps/${vc.stepInstanceId}/override`, {
          action: action.actionKey === 'COMPLETE_STEP' ? 'APPROVE' : action.actionKey,
          remarks: remarks || undefined,
        })
      } else {
        await api({ method: action.httpMethod || 'POST', url, data: payload })
      }
      qcDetail.invalidateQueries({ queryKey: ['module-detail', bp.apiBasePath, id] })
      qcDetail.invalidateQueries({ queryKey: ['view-context', bp.entityType, id] })
      qcDetail.invalidateQueries({ queryKey: ['module-workflow', bp.entityType, id] })
      qcDetail.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      // Invalidate audit instance sub-tabs so they reflect result changes immediately
      if (bp.entityType === 'AUDIT_TEST_INSTANCE') {
        qcDetail.invalidateQueries({ queryKey: ['test-inst-controls', Number(id)] })
        qcDetail.invalidateQueries({ queryKey: ['ctrl-inst-tests'] })
      }
      if (bp.entityType === 'AUDIT_POLICY_INSTANCE') {
        qcDetail.invalidateQueries({ queryKey: ['policy-inst-controls', Number(id)] })
        qcDetail.invalidateQueries({ queryKey: ['ctrl-inst-policies'] })
      }
      toast.success(action.label + ' successful')

      // ── Auto-approve task after domain action ──────────────────────────────
      // For steps with autoCompleteActorOnSubmit=true, approve the workflow task
      // after the domain action succeeds (e.g. ISSUE_TRIAGE approves the Triage task).
      // This is the same logic as updateMut.onSuccess but applies to all executeAction calls.
      if (taskId && vc?.autoCompleteActorOnSubmit) {
        try {
          await api.post('/v1/workflow-instances/tasks/action', {
            taskInstanceId: Number(taskId),
            actionType: 'APPROVE',
            remarks: 'Auto-completed after ' + action.label,
          })
        } catch (err) {
          console.warn('[executeAction] autoCompleteActorOnSubmit failed:', err)
        }
      }

      // ── Seamless task transition ───────────────────────────────────────────
      // After any successful action when opened from a task, check if the same
      // user has a next pending task on this entity. The my-next endpoint is
      // a cheap indexed query — returns null instantly if no next task exists.
      // Works for all modules: Issue domain actions, Audit workflow actions, etc.
      if (taskId) {
        const transitioned = await transitionToNextTask(bp?.entityType, id)
        if (transitioned) return // next task found — URL already updated, skip nav below
      }
      // ── end seamless task transition ──────────────────────────────────────
      // Navigate to clean page URL for any status-changing action so the entire
      // component remounts with fresh data — prevents stale status showing in
      // action buttons and header (e.g. Reopen showing on OPEN issue).
      // Derived from blueprint statusFlowJson transitions — zero hardcoding.
      const _sf1 = (() => { try { return JSON.parse(bp.statusFlowJson || '{}') } catch { return {} } })()
      const STATUS_CHANGING_ACTIONS = new Set([
        'ACTIVATE','COMPLETE','CANCEL',  // universal module actions
        ...(_sf1.transitions || []).map(t => t.actionKey).filter(Boolean)
      ])
      if (STATUS_CHANGING_ACTIONS.has(action.actionKey)) {
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
  const { data: overviewFormRes, isLoading: overviewLoading } = useQuery({
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
          await transitionToNextTask(bp?.entityType, id)
        } catch (err) {
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
      // visibleTabs from step config only restricts tabs when user has an active task.
      // Without a task (read-only browsing), all tabs are always visible.
      // This implements our rule: step config gates ACTIONS, not read-only visibility.
      if (taskId && vc.visibleTabs?.length > 0 && !vc.visibleTabs.includes(t.key)) return false
      return true
    })
    // Inject SD custom tabs (non-capability) in order they appear in tabsJson
    // Insert after Overview but before capability tabs
    const overviewIdx = base.findIndex(t => t.key === 'overview')
    const customTabs = sdCustomTabs.map(t => ({
      key: t.key, label: t.label, icon: resolveIcon(t.icon) || Hash, isCustom: true,
    }))
    const merged = [
      ...base.slice(0, overviewIdx + 1),
      ...customTabs,
      ...base.slice(overviewIdx + 1),
    ]
    // Apply Screen Designer's per-role tab visibility (roleAccessJson.tabs).
    // Falls through to "allowed" for any tab/role combination that hasn't
    // been explicitly configured — existing screens are unaffected.
    return merged.filter(t => isTabAllowed(roleAccess, currentSide, currentRoleIds, t.key))
  }, [bp, vc, sdCustomTabs, sdLayout?.tabsJson, roleAccess, currentSide, currentRoleIds])

  // Build field sections from blueprint schema
  let schema = { sections: [] }
  try { schema = JSON.parse(bp.fieldsSchemaJson || '{}') } catch {}

  if (isLoading || screenLoading || (overviewFormKey && overviewLoading)) return <LoadingState />
  if (isError)   return <ServerErrorState />
  if (!entity) return <NotFoundState entityType={bp.displayName} />

  // canEdit: vc.canEdit (backend permission check) — system:write holders get canEdit=true
  // from WorkflowAccessService.resolveForModule after the _system_admin bypass.
  const canEdit = vc.canEdit !== false
  const canDelete = vc.canDelete && vc.permissions?.includes(`${bp.entityType.toLowerCase()}.delete`)
  const editFormKey = bp.editFormKey || bp.createFormKey

  // Deep-link to parent project for AUDIT_ENGAGEMENT entities. The GET response
  // returns projectInstanceId (or nested projectSnapshot.id) — when present this
  // engagement is project-governed (WF16) and should always be able to navigate
  // back up to the project, not just rely on browser history (navigate(-1) breaks
  // when the page was opened from a notification, bookmark, or new tab).
  // NOTE: parentProjectLabel is declared earlier in the breadcrumb resolution block

  // Task params for navigation — ONLY from URL, never from vc.
  // vc.taskId would inject task context even when user opened the page
  // without a task (e.g. from sidebar), which is incorrect.
  const buildTaskParams = () =>
    (taskId && stepInstanceId)
      ? `?taskId=${taskId}&stepInstanceId=${stepInstanceId}`
      : ''

  // Navigate to parent entity preserving task context
  const navigateToParent = () => {
    if (breadcrumbParentId && breadcrumbParentNavKey) {
      navigate(`/module/${breadcrumbParentNavKey}/${breadcrumbParentId}${buildTaskParams()}`)
    } else {
      navigate(-1)
    }
  }

  // Navigate to this entity's own list page — preserve frameworkRef so the user
  // returns to the framework-scoped list they came from, not the generic one.
  const navigateToList = () => {
    if (!listNavKey) return
    navigate(detailFrameworkRef
      ? `/module/${listNavKey}?frameworkRef=${encodeURIComponent(detailFrameworkRef)}`
      : `/module/${listNavKey}`)
  }

  // Back button: go to parent or list page
  const handleBack = () => navigateToParent()

  const entityLabel = entity?.title || entity?.name || entity?.testNameSnapshot
    || entity?.titleSnapshot || entity?.controlNameSnapshot
    || entity?.controlCode || entity?.testCode || entity?.policyName
    || `${bp.displayName} #${id}`

  return (
    <PageLayout
      title={
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={handleBack}
            className="text-text-muted hover:text-text-primary transition-colors shrink-0">
            <ArrowLeft size={15} />
          </button>

          {/* Generic breadcrumb: List → Parent → Current */}
          {listNavKey && listLabel && (
            <>
              <button
                onClick={navigateToList}
                className="text-xs text-text-muted hover:text-brand-ink transition-colors shrink-0">
                {listLabel}
              </button>
              <span className="text-text-muted/40 shrink-0">/</span>
            </>
          )}
          {breadcrumbParentLabel && breadcrumbParentId && (
            <>
              <button
                onClick={navigateToParent}
                className="text-xs text-text-muted hover:text-brand-ink transition-colors truncate max-w-[140px]"
                title={breadcrumbParentLabel}>
                {breadcrumbParentLabel}
              </button>
              <span className="text-text-muted/40 shrink-0">/</span>
            </>
          )}
          <span className="truncate font-medium">{entityLabel}</span>
          {entity?.status && <EntityStatusBadge status={entity.status} />}
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          {vc.sodViolations?.filter(v => v.conflictType === 'HARD').length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-status-fail-fg bg-status-fail-bg border border-status-fail-bd rounded-ctl px-2 py-1">
              <AlertTriangle size={12} /> SoD conflict
            </div>
          )}
          {/* FIX: Render screen designer actions with correct variants and status guards */}
          {screenActions.map(action => {
            const ActionIcon = resolveIcon(action.icon)
            return (
            <Button
              key={action.id}
              size="sm"
              variant={action.variant || 'secondary'}
              loading={actingId != null && actingId === action.id}
              disabled={actingId != null && actingId !== action.id}
              icon={ActionIcon || undefined}
              onClick={() => handleActionClick(action)}
            >
              {(() => { try { const m = JSON.parse(action.payloadTemplateJson||'{}'); return m.__label || action.label } catch { return action.label } })()}
            </Button>
            )
          })}
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
        <div className="mx-6 mt-4 flex items-center gap-3 px-3 py-2.5 rounded-card
                        bg-brand-500/8 border border-brand-500/20 text-xs">
          <CheckSquare size={13} className="text-brand-ink shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-brand-ink font-medium">Task #{taskId}</span>
            {vc.stepLabel && (
              <span className="text-text-muted ml-1.5">· {vc.stepLabel}</span>
            )}
            {vc.canEdit === false && (
              <span className="ml-2 text-text-muted italic">read-only at this step</span>
            )}
          </div>
          {breadcrumbParentId && breadcrumbParentLabel && (
            <button
              onClick={navigateToParent}
              className="text-[11px] text-text-muted hover:text-text-primary transition-colors shrink-0 flex items-center gap-1">
              <ArrowLeft size={10} /> {breadcrumbParentLabel}
            </button>
          )}
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
      <div className="flex items-center gap-1 px-6 border-b border-border overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {visibleTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              'shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 -mb-px',
              tab === t.key
                ? 'border-brand-500 text-brand-ink bg-brand-500/5'
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
              <div className="border border-border rounded-card overflow-hidden">
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

        {['workflow','actions','evidence','comments','history'].includes(tab) && (
          <CapabilityTabBody tab={tab} bp={bp} id={id} entity={entity} vc={vc} />
        )}

        {/* ── Custom tabs from Screen Designer tabsJson ──────────────────── */}
        {sdCustomTabs.some(t => t.key === tab) && (
          <CustomTabContent
            tabKey={tab}
            detailScreenKey={bp.detailScreenKey}
            entity={entity}
            entityType={bp.entityType}
            apiBasePath={bp.apiBasePath}
            vc={vc}
            stepInstanceId={stepInstanceId}
            taskId={taskId}
            onTaskComplete={() => transitionToNextTask(bp?.entityType, id)}
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
                Remarks <span className="text-status-fail-fg">*</span>
              </label>
              <textarea
                value={confirmAction.remarks}
                onChange={e => setConfirmAction(prev => ({ ...prev, remarks: e.target.value }))}
                rows={3}
                placeholder="Explain the reason for this action…"
                className="w-full px-3 py-2 text-xs bg-surface-overlay border border-border rounded-card text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
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
  // Single query: resolve instance id then fetch progress in one chain.
  // Previously two sequential queries caused a waterfall (step1 → step2 blocked).
  // Now we do both in one queryFn — one round trip, no waterfall.
  const entityWorkflowId = entity?.workflowInstanceId
  // For project-governed engagements: if the engagement has no own workflow instance
  // (AUDIT_ENGAGEMENT entities are governed by the project lifecycle, not their own workflow),
  // fall back to the project instance's workflow so the tab shows the project timeline.
  // NOTE: GET /engagements/{id} returns projectInstanceId nested as projectSnapshot.id
  const projectInstanceId = entity?.projectInstanceId ?? entity?.projectSnapshot?.id
  // For AUDIT_ENGAGEMENT with no own workflow, we must wait for entity to load
  // so projectInstanceId is available before the query fires.
  // Without this gate, the query fires immediately with entityType=AUDIT_ENGAGEMENT
  // and gets NO_ACTIVE_INSTANCE cached, never retrying with the correct AUDIT_PROJECT params.
  const readyToFetch = entityType === 'AUDIT_ENGAGEMENT'
    ? !!entity  // wait for entity so projectInstanceId is resolved
    : !!entityId

  const { data: wfData, isLoading: wfLoading } = useQuery({
    queryKey: ['module-workflow', entityType, entityId, projectInstanceId ?? null],
    enabled: readyToFetch,
    queryFn: async () => {
      // Resolve the instance
      let instanceData
      if (entityWorkflowId) {
        instanceData = await api.get(`/v1/workflow-instances/${entityWorkflowId}`)
      } else if (entityType === 'AUDIT_ENGAGEMENT' && projectInstanceId) {
        // Engagement is governed by the project workflow — fetch project's active workflow
        instanceData = await api.get('/v1/workflow-instances/active', {
          params: { entityType: 'AUDIT_PROJECT', entityId: projectInstanceId }
        })
      } else {
        instanceData = await api.get('/v1/workflow-instances/active', { params: { entityType, entityId } })
      }
      const inst = instanceData?.data || instanceData
      if (!inst?.id) return { instance: inst, progress: [] }
      // Fetch progress immediately — no second render cycle
      const progressData = await api.get(`/v1/workflow-instances/${inst.id}/progress`)
      const prog = progressData?.data || progressData
      return { instance: inst, progress: Array.isArray(prog) ? prog : (prog?.data || []) }
    },
    staleTime: 15 * 1000,
  })
  const instance = wfData?.instance
  const progress = wfData?.progress

  // Loading skeleton
  if (wfLoading) {
    return (
      <div className="max-w-2xl space-y-3 py-2">
        {[1,2,3,4].map(i => (
          <div key={i} className="flex items-start gap-3 p-3 border border-border rounded-card">
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
        <div className="flex flex-col items-center gap-3 py-12 border border-dashed border-border rounded-card text-center">
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
        isAdmin={
          // Admin = can reopen/re-evaluate workflow tasks
          // Requires WORKFLOW_MANAGE permission (org-side admins only)
          // workflow:task:assign alone is not enough — auditors also have it
          (vc.permissions || []).includes('WORKFLOW_MANAGE') ||
          vc.isAdmin === true
        }
      />
    </div>
  )
}

function EvidenceTab({ entityId, entityType, vc }) {
  // Auditees can upload evidence if they have submit-evidence permission
  // even without generic canEdit (they have read-limited access, not full edit)
  const canUpload = vc.canEdit || (vc.permissions || []).includes('audit:control:submit-evidence')
  return (
    <div className="max-w-2xl">
      {canUpload
        ? <div className="flex flex-col items-center gap-3 py-12 border-2 border-dashed border-border rounded-card text-center cursor-pointer hover:border-brand-500/40 hover:bg-brand-500/3 transition-colors">
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

function CustomTabContent({ tabKey, detailScreenKey, entity, entityType, apiBasePath, vc, stepInstanceId, taskId, onTaskComplete }) {
  // ── ALL HOOKS MUST BE AT TOP — Rules of Hooks ────────────────────────────
  const qc = useQueryClient()
  const [saving,   setSaving]   = useState(false)
  const [editMode, setEditMode] = useState(false)
  const prevTabKey    = useRef(tabKey)
  const tabSavedRef   = useRef({})  // tracks which tabs have been saved this session

  // formKey and form data — always fetched regardless of early returns
  const formKey = `${detailScreenKey}_tab_${tabKey}`
  // Tabs that are always rendered by a dedicated component — no form config needed.
  // Fetching their formKey produces a 404 and floods the logs with RESOURCE_NOT_FOUND errors.
  const CUSTOM_RENDERED_TABS = new Set([
    'sections', 'controls', 'findings', 'engagements', 'integrations',
    'tests', 'policies', 'evidence', 'workflow', 'comments', 'history',
  ])
  const { data: formRes, isLoading } = useQuery({
    queryKey: ['module-tab-form', formKey],
    queryFn: () => uiConfigApi.form(formKey),
    enabled: !!formKey && !CUSTOM_RENDERED_TABS.has(tabKey),
    staleTime: 5 * 60_000,
  })
  const fields = formRes?.fields || []

  // editableTabs: when set on the step, only the listed tabs are editable,
  // AND only for the user who has a real task at this step (taskId in URL).
  // If editableTabs is set but hasTask=false (direct URL, no task), block all editing.
  // This matches Issue workflow behaviour — forms only editable via My Tasks route.
  const hasTask     = !!vc?.taskId
  const editableTabsDefined = vc?.editableTabs?.length > 0
  const tabEditable = editableTabsDefined
    ? (hasTask && vc.editableTabs.includes(tabKey))
    : true
  const canEdit = tabEditable && (vc?.stepAction ? (vc?.canAct === true) : (vc?.canEdit === true))
  const canAct  = vc?.canAct === true

  // Compute whether this tab has meaningful content already saved
  const meaningfulFields = fields.filter(f =>
    f.fieldType !== 'SECTION_HEADER' && f.fieldType !== 'DIVIDER' && f.fieldType !== 'TOGGLE')
  const tabHasValues = meaningfulFields.some(f => {
    const v = entity?.[f.fieldKey]
    return v !== null && v !== undefined && v !== ''
      && !(typeof v === 'string' && (v.trim() === '' || v.trim() === '[]'))
  })

  // On tab switch: auto-edit if canAct AND tab has no saved values yet.
  // If tab already has values (previously saved), show read-only first.
  if (prevTabKey.current !== tabKey) {
    prevTabKey.current = tabKey
    setSaving(false)
    // Will be resolved after fields load — start false, let effect below handle it
    setEditMode(false)
  }

  // After fields load, decide initial edit mode for this tab.
  // Wait for vc to be fully loaded (canView defined) before entering edit mode
  // to avoid flickering into edit mode before editableTabs/hasTask is known.
  const vcLoaded = vc?.canView !== undefined
  useEffect(() => {
    if (!vcLoaded) return
    if (!canEdit) { setEditMode(false); return }
    if (fields.length === 0) return
    setEditMode(!tabHasValues)
  }, [tabKey, fields.length, canEdit, vcLoaded]) // eslint-disable-line react-hooks/exhaustive-deps
  // ─────────────────────────────────────────────────────────────────────────

  // ── Library mapping tabs — rendered by dedicated component ───────────────
  // AUDIT_ENGAGEMENT — sections tree with controls nested + both clickable
  if (tabKey === 'sections' && entityType === 'AUDIT_ENGAGEMENT') {
    return <EngagementSectionsTab engagementId={entity?.id} vc={vc} stepInstanceId={stepInstanceId} onTaskComplete={onTaskComplete} />
  }
  // AUDIT_ENGAGEMENT — flat control list with clickable detail
  if (tabKey === 'controls' && entityType === 'AUDIT_ENGAGEMENT') {
    return <EngagementControlsTab engagementId={entity?.id} vc={vc} taskId={taskId} />
  }
  // AUDIT_ENGAGEMENT — findings list with escalate-to-issue action
  if (tabKey === 'findings' && entityType === 'AUDIT_ENGAGEMENT') {
    return <EngagementFindingsTab engagementId={entity?.id} canEscalate />
  }
  // AUDIT_PROJECT — findings list for a project
  if (tabKey === 'findings' && entityType === 'AUDIT_PROJECT') {
    return <ProjectFindingsTab projectId={entity?.id} />
  }
  // AUDIT_PROJECT — engagements list for this project (click → SOC2 engagement detail)
  if (tabKey === 'engagements' && entityType === 'AUDIT_PROJECT') {
    return <ProjectEngagementsTab projectId={entity?.id} vc={vc} stepInstanceId={stepInstanceId} taskId={taskId} onTaskComplete={onTaskComplete} />
  }
  // AUDIT_ENGAGEMENT — automated integration check status (EngagementIntegrationSnapshot rows)
  if (tabKey === 'integrations' && entityType === 'AUDIT_ENGAGEMENT') {
    return <EngagementIntegrationTab engagementId={entity?.id} />
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
    return <PolicyContentTab entity={entity} vc={vc} />
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


  if (canEdit && editMode) {
    return (
      <div className="flex flex-col gap-3">
        <DynamicForm
          formKey={formKey}
          defaultValues={entity || {}}
          extraConfig={null}
          readOnlyFields={vc?.readOnlyFields || []}
          hiddenFields={vc?.hiddenFields || []}
          submitLabel="Save changes"
          loading={saving}
          onSubmit={async (data) => {
            setSaving(true)
            try {
              // Use form's submit_url if defined — allows step-specific endpoints
              // (e.g. /v1/audit/engagements/{id}/report-review instead of base path).
              // Fall back to standard entity update if no submit_url configured.
              const saveUrl = formRes?.submitUrl
                ? formRes.submitUrl.replace('{id}', String(entity.id))
                : `${apiBasePath}/${entity.id}`
              const saveMethod = (formRes?.httpMethod || 'PUT').toLowerCase()
              await api({ method: saveMethod, url: saveUrl, data })
              await qc.refetchQueries({ queryKey: ['module-detail', apiBasePath, String(entity?.id)] })
              toast.success('Saved')
              setEditMode(false)
            } catch (e) {
              toast.error(e?.response?.data?.message || 'Failed to save')
            } finally {
              setSaving(false)
            }
          }}
        />
        <button onClick={() => setEditMode(false)}
          className="self-start text-xs text-text-muted hover:text-text-primary transition-colors">
          ✕ Cancel
        </button>
      </div>
    )
  }

  // Read-only header with Edit button when user has edit rights
  const editButton = canEdit ? (
    <div className="flex justify-end mb-3">
      <button onClick={() => setEditMode(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-ctl border border-border text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit
      </button>
    </div>
  ) : null

  return (
    <div className="flex flex-col">
      {editButton}
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
        // Hide fields with depends_on_json that don't match current entity values
        if (field.dependsOnJson) {
          try {
            const dep = typeof field.dependsOnJson === 'string'
              ? JSON.parse(field.dependsOnJson) : field.dependsOnJson
            const entityVal = entity?.[dep.field]
            const matches = dep.operator === 'eq' ? entityVal === dep.value
              : dep.operator === 'in' ? dep.value.includes(entityVal)
              : dep.operator === 'neq' ? entityVal !== dep.value
              : true
            if (!matches) return null
          } catch (e) { /* invalid depends_on_json — show field */ }
        }
        return (
          <div key={fi} className={`col-span-${field.gridCols || 6}`}>
            <FieldDisplay
              label={field.label}
              value={value}
              type={field.fieldType}
              editable={false}
              field={field}
            />
          </div>
        )
      })}
    </div>
    </div>
  )
}
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
          className="flex items-start gap-3 p-3 rounded-card border border-border bg-surface-secondary hover:border-border-strong transition-colors">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-text-primary truncate">
                {f.findingRef || f.ref || `#${f.id}`}
              </span>
              {f.severity && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-fail-bg text-status-fail-fg font-medium">
                  {f.severity}
                </span>
              )}
              {f.status && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-ink">
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

// Comments tab — wires the generic useComments hook (fetch + WebSocket live
// updates + add mutation) into the presentational CommentFeed. Same data flow
// the Assessment pages use, made generic for any module entity.
function ModuleCommentsTab({ entityType, entityId }) {
  const { comments, isLoading, addComment, adding } = useComments(entityType, entityId)
  return (
    <CommentFeed
      comments={comments}
      isLoading={isLoading}
      addComment={addComment}
      adding={adding}
      canEdit={true}
    />
  )
}

function HistoryTab({ entityType, entityId, apiBasePath }) {
  const { data: res, isLoading: historyLoading } = useQuery({
    queryKey: ['module-history', apiBasePath, entityId],
    queryFn: () => api.get(`${apiBasePath}/${entityId}/history`),
    staleTime: 30 * 1000,
    enabled: !!entityId,
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
                  {step && <span className="text-brand-ink text-[10px] bg-brand-500/10 px-1.5 py-0.5 rounded">{step}</span>}
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
    const rawPath = lookupApiPath || cfg?.path
    if (!rawPath) return   // no config for this entity type — show raw value
    // Strip any query params from the path before appending the ID.
    // e.g. '/v1/workflows?entityType=AUDIT_PROJECT' → '/v1/workflows/16' (not malformed URL).
    const basePath = rawPath.includes('?') ? rawPath.slice(0, rawPath.indexOf('?')) : rawPath
    const resolvedPath = `${basePath}/${valueStr}`
    let cancelled = false
    api.get(resolvedPath)
      .then(r => {
        if (cancelled) return
        const item = r?.data?.data || r?.data || r
        const resolved = cfg ? cfg.labelFn(item) : (item.name || item.label || item.title || valueStr)
        setLabel(resolved || valueStr)
      })
      .catch(() => { if (!cancelled) setLabel(null) })
    return () => { cancelled = true }
  }, [valueStr, lookupEntityType, lookupApiPath]) // eslint-disable-line

  if (!valueStr) return <span className="text-text-muted/40 text-xs italic">—</span>
  if (label === null && valueStr) return <span className="text-text-muted/40 text-xs italic">—</span>
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
        const on = value === true || value === 'true' || value === 1 || value === '1'
        return (
          <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded',
            on ? 'bg-status-pass-bg text-status-pass-fg' : 'bg-surface-overlay text-text-muted border border-border')}>
            {on ? '✓ Yes' : '✗ No'}
          </span>
        )
      }

      case 'RATING': {
        const max = field.maxValue || 5
        const val = Number(value) || 0
        return <span className="text-base tracking-tight">{Array.from({length:max},(_,i)=>(
          <span key={i} className={i < val ? 'text-status-warn-fg' : 'text-text-muted'}>★</span>
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
            className="text-sm text-brand-ink hover:underline truncate block max-w-full">
            {String(value)}
          </a>
        )

      case 'TAG': case 'MULTI_SELECT': case 'MULTILINE_LIST': {
        let items = []
        if (Array.isArray(value)) {
          items = value
        } else {
          const str = String(value).trim()
          if (str.startsWith('[')) {
            try { items = JSON.parse(str) } catch { items = [str] }
          } else {
            items = str.split(',').map(t => t.trim()).filter(Boolean)
          }
        }
        return (
          <div className="flex flex-wrap gap-1">
            {items.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 text-brand-ink text-[11px] font-medium">
                {tag}
              </span>
            ))}
          </div>
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
                className="text-xs text-brand-ink hover:underline">
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
      'flex items-start gap-2 mx-6 mt-4 px-3 py-2.5 rounded-card text-xs border',
      hasHard
        ? 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg'
        : 'bg-status-warn-bg border-status-warn-bd text-status-warn-fg'
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
      <div className="rounded-card border border-border overflow-hidden">
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
      <div className="w-12 h-12 rounded-card bg-status-fail-bg border border-status-fail-bd flex items-center justify-center">
        <ServerCrash size={20} className="text-status-fail-fg" strokeWidth={1.5} />
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
    staleTime: 30 * 1000,
    queryFn:  () => moduleApi.get(bp.apiBasePath, entityId), enabled: !!entityId,
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

  // ── Role-based action visibility — Screen Designer's roleAccessJson ────────
  const sdLayout        = screenRes?.layout
  const roleAccess       = useMemo(() => parseRoleAccessJson(sdLayout?.roleAccessJson), [sdLayout?.roleAccessJson])
  const auth             = useSelector(selectAuth)
  const userSides         = useSelector(selectRoleSides)
  const currentSide        = userSides?.[0] || null
  const currentRoleIds     = (auth?.roles || []).map(r => r.id ?? r.roleId).filter(Boolean)

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
      // Screen Designer's per-role action visibility (roleAccessJson.actions)
      if (!isActionAllowed(roleAccess, currentSide, currentRoleIds, action.actionKey)) return false
      return true
    })
  }, [screenConfig?.actions, entity?.status, vc.permissions, roleAccess, currentSide, currentRoleIds])

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
  // Read the SAME capability booleans the full detail page uses (bp.supportsXxx).
  // The old bp.capabilities?.includes?.(...) array never exists on the blueprint
  // response, so every flag fell through to the `?? true` default and the drawer
  // showed all tabs regardless of the toggles.
  const hasComments  = !!bp.supportsComments
  const hasEvidence  = !!bp.supportsDocuments
  const hasActions   = !!bp.supportsActionItems
  const hasWorkflow  = !!bp.supportsWorkflow
  const hasHistory   = !!bp.supportsHistory

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
      const _sf2 = (() => { try { return JSON.parse(bp.statusFlowJson || '{}') } catch { return {} } })()
      const DRAWER_STATUS_ACTIONS = new Set(
        (_sf2.transitions || []).map(t => t.actionKey).filter(Boolean)
      )
      if (DRAWER_STATUS_ACTIONS.has(action.actionKey)) {
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

  const CAPABILITY_TAB_KEYS = new Set(['overview','comments','evidence','actions','workflow','history'])
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
    { id: 'history',   label: 'History',   hidden: !hasHistory },
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
      <div className="fixed inset-0 z-40 bg-on-dark-inv/20 backdrop-blur-[1px]"
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
                                   bg-status-info-bg border border-status-info-bd text-status-info-fg">
                    {entity.status.replace(/_/g,' ')}
                  </span>
                )}
                {entity?.severity && (
                  <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold border',
                    entity.severity === 'CRITICAL' ? 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg' :
                    entity.severity === 'HIGH'     ? 'bg-status-warn-bg border-status-warn-bd text-status-warn-fg' :
                    entity.severity === 'MEDIUM'   ? 'bg-status-warn-bg border-status-warn-bd text-status-warn-fg' :
                    'bg-status-pass-bg border-status-pass-bd text-status-pass-fg')}>
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
                className="flex items-center gap-1.5 text-[11px] text-brand-ink hover:text-brand-ink
                           border border-brand-500/25 hover:border-brand-500/50 rounded-ctl
                           px-2.5 py-1.5 transition-colors font-medium">
                <ExternalLink size={11} /> Full page
              </button>
              <button onClick={onClose}
                className="p-1.5 rounded-ctl text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Action buttons — below title, above tabs */}
          {isLoading ? (
            /* Skeleton action buttons while entity/screen loads */
            <div className="flex items-center gap-2 flex-wrap mt-3">
              {[64, 80, 72].map((w, i) => (
                <div key={i} className="h-7 rounded-ctl animate-pulse bg-surface-overlay"
                  style={{ width: w }} />
              ))}
            </div>
          ) : screenActions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-3">
              {screenActions.map(action => {
                const DrawerIcon = resolveIcon(action.icon)
                return (
                <Button key={action.id} size="sm"
                  variant={action.variant || 'secondary'}
                  icon={DrawerIcon || undefined}
                  loading={actingId === action.id}
                  onClick={() => handleAction(action)}>
                  {action.label}
                </Button>
              )
            })}
            </div>
          )}
        </div>

        {/* ── Tab bar ── */}
        <div className="flex items-center border-b border-border shrink-0 px-5 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
                  ? 'border-brand-400 text-brand-ink'
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
                        className="flex flex-col gap-1 p-2.5 rounded-card border border-border bg-surface-secondary hover:border-border-strong transition-colors cursor-pointer"
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
                      className="flex-1 px-3 py-2 text-xs bg-surface-secondary border border-border rounded-card
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
          {/* ── CAPABILITY TABS — same components as the full detail page ── */}
          {!isLoading && ['comments','evidence','actions'].includes(activeTab) && (
            <div className="px-5 py-4">
              <CapabilityTabBody tab={activeTab} bp={bp} id={entityId} entity={entity} vc={vc} />
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
                apiBasePath={bp.apiBasePath}
                vc={vc}
                stepInstanceId={undefined}
                taskId={undefined}
              />
            </div>
          )}

          {/* ── WORKFLOW + HISTORY — same components as the full detail page ── */}
          {!isLoading && ['workflow','history'].includes(activeTab) && (
            <div className="px-5 py-4">
              <CapabilityTabBody tab={activeTab} bp={bp} id={entityId} entity={entity} vc={vc} />
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
                Remarks <span className="text-status-fail-fg">*</span>
              </label>
              <textarea value={confirmAction.remarks}
                onChange={e => setConfirmAction(p => ({ ...p, remarks: e.target.value }))}
                rows={3} placeholder="Reason for this action…"
                className="w-full px-3 py-2 text-xs bg-surface-overlay border border-border rounded-card
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

    // Lookup — resolve numeric ID to human label via EntityDisplay
    if (field.fieldType === 'LOOKUP') {
      return <EntityDisplay value={rawValue} lookupEntityType={field.lookupEntityType} lookupApiPath={field.lookupApiPath} />
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
        {field.isRequired && <span className="text-status-fail-fg">*</span>}
      </p>

      {/* Value — click to edit only when field is editable per vc (badge fields open a select, others open a text input) */}
      {isEditing ? (
        <div className="space-y-1.5">
          {field.fieldType === 'TEXTAREA' || field.fieldType === 'RICH_TEXT'
            ? <textarea value={editValue} onChange={e => onChangeValue(e.target.value)}
                rows={3} autoFocus
                className="w-full px-2.5 py-1.5 text-xs bg-background border border-brand-500/50
                           rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
            : field.fieldType === 'TOGGLE'
            ? <button type="button" onClick={() => onChangeValue(v => !v)}
                className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  editValue ? 'bg-brand-500' : 'bg-surface-overlay border border-border')}>
                <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-surface-raised transition-transform',
                  editValue ? 'translate-x-4' : 'translate-x-0.5')} />
              </button>
            : <input autoFocus
                type={['NUMBER','DECIMAL'].includes(field.fieldType) ? 'number' : field.fieldType === 'DATE' ? 'date' : 'text'}
                value={editValue} onChange={e => onChangeValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onSave(field.fieldKey); if (e.key === 'Escape') onCancel() }}
                className="w-full h-7 px-2.5 text-xs bg-background border border-brand-500/50
                           rounded-ctl text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          }
          <div className="flex items-center gap-1.5">
            <button onClick={() => onSave(field.fieldKey)} disabled={saving}
              className="text-[10px] px-2.5 py-1 rounded bg-brand-500 text-brand-900 hover:bg-brand-600 disabled:opacity-50 transition-colors font-medium">
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
            'w-full text-left px-2 py-1 rounded-ctl transition-all group min-h-[28px]',
            'border border-transparent hover:border-border/60 hover:bg-surface-overlay',
          )}>
          <span className="flex items-center justify-between gap-2">
            <span>{renderValue()}</span>
            <Pencil size={9} className="text-text-muted opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />
          </span>
        </button>
      ) : (
        /* Gap 2: read-only — no hover, no pencil, no click */
        <div className="w-full text-left px-2 py-1 rounded-ctl min-h-[28px]">
          {renderValue()}
        </div>
      )}
    </div>
  )
}