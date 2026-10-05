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
import { ControlFieldworkTab }          from '../../components/audit/ControlFieldworkTab'
import { TestInstanceEvidenceTab }       from '../../components/audit/TestInstanceEvidenceTab'
import { FindingEvidenceTab }            from '../../components/audit/FindingEvidenceTab'
import { IssueEvidenceTab }              from '../../components/audit/IssueEvidenceTab'
import { TestInstanceMappedControlsTab } from '../../components/audit/TestInstanceMappedControlsTab'
import { PolicyInstanceMappedControlsTab } from '../../components/audit/PolicyInstanceMappedControlsTab'
import { PolicyContentTab }              from '../../components/audit/PolicyContentTab'
import { PolicyDocumentTab }             from '../../components/audit/PolicyDocumentTab'
import { PolicyVersionsTab }             from '../../components/audit/PolicyVersionsTab'
import { EngagementFindingsTab }         from '../../components/audit/EngagementFindingsTab'
import { EngagementIntegrationTab }      from '../../components/audit/EngagementIntegrationTab'
import { EngagementTimelineTab }         from '../../components/collab/EngagementTimelineTab'
import { ProjectFindingsTab }            from '../../components/audit/ProjectFindingsTab'
import ProjectEngagementsTab             from '../../components/audit/ProjectEngagementsTab'
import { RiskControlsTab }               from '../../components/risk/RiskControlsTab'
import { RiskIssuesTab }                 from '../../components/risk/RiskIssuesTab'
import AssessmentSectionsTab from '../../components/vendor/AssessmentSectionsTab'
import AssessmentFillTab     from '../../components/vendor/AssessmentFillTab'
import AssessmentReviewTab   from '../../components/vendor/AssessmentReviewTab'
import AssessmentFindingsTab from '../../components/vendor/AssessmentFindingsTab'
import AssessmentReportsTab  from '../../components/vendor/AssessmentReportsTab'
import RestartWorkflowWizard from '../../components/vendor/RestartWorkflowWizard'
import VendorAssessmentsTab  from '../../components/vendor/VendorAssessmentsTab'
import VendorTeamTab         from '../../components/vendor/VendorTeamTab'
import VendorContractsTab    from '../../components/vendor/VendorContractsTab'
import { TestPolicyCsvImportModal }  from '../../components/audit/TestPolicyCsvImportModal'
import { AuditInstanceActionItemsTab } from '../../components/audit/AuditInstanceActionItemsTab'
import AiPolicyCreateModal          from '../../components/ai/AiPolicyCreateModal'
import { WorkflowTimeline }       from '../../components/workflow/WorkflowTimeline'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useUrlState, useUrlNumber, useUrlWriter } from '../../hooks/useUrlState'
import { EntityDrawerLevelContext, readDrawerLevels, closeDrawerLevel } from '../../hooks/useEntityDrawer'
import { useSwitchTenant } from '../../hooks/useAuth'
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
  Calendar, Clock, TrendingUp, Target, Award, Briefcase, Copy,
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

/**
 * Components a row action may open instead of a form or a navigation.
 *
 * __formKey covers "collect these fields and POST them once". Some actions are
 * not that shape: restarting a vendor's workflow is TWO requests, because the
 * template choices in the second do not exist until the first has run and the
 * engine has scored the vendor. A DynamicForm cannot express that, and the
 * earlier attempt to make it one form left the workflow parked on a paused
 * step with nothing on screen saying so.
 *
 * So `{"__component": "RestartWorkflowWizard"}` on a ui_actions row opens the
 * component instead. Keyed by name rather than imported dynamically, so an
 * unknown or misspelled key fails visibly at the click instead of breaking the
 * bundle.
 */
const ROW_ACTION_COMPONENTS = {
  RestartWorkflowWizard,
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
import { useNavigation } from '../../hooks/useUIConfig'
import { commentsApi } from '../../api/comments.api'
import { useSelector, useDispatch } from 'react-redux'
import { selectActiveTabId, saveSubTab, selectActiveSubTab } from '../../store/slices/tabsSlice'
import { selectAuth, selectRoleSides } from '../../store/slices/authSlice'
import { previousEntry } from '../../components/layout/navTrail'
import { parseRoleAccessJson, isTabAllowed, isActionAllowed } from '../../components/screen-designer/roleAccessJson'
// ── v2 additions ─────────────────────────────────────────────────────────────
import EntityTreeView          from '../../components/module/EntityTreeView'
import LinkedEntitiesTab      from '../../components/module/LinkedEntitiesTab'
import { DynamicState }       from '../../components/ui/DynamicState'
import { useScreenStates }    from '../../hooks/useUiStates'
import TrainingPlayerTab      from '../../components/training/TrainingPlayerTab'
import TrainingContentTab     from '../../components/training/TrainingContentTab'
import { useModuleSocket,
         useModuleListSocket } from '../../hooks/useModuleSocket'
import { useUserTaskSocket } from '../../hooks/useWorkflowSocket'
import { getUserLabel } from '../../lib/userLookup'

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
  if (bpError)   return <ServerErrorState error={bpError} />
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

  // entityType is passed explicitly because ModuleDetailView's view-context call
  // reads `bp.entityType || entityType` and the second operand was never in
  // scope there — an undeclared identifier, which only throws when it is
  // actually evaluated, so `||` short-circuiting on a truthy bp.entityType hid
  // it. The first blueprint served without that field would have turned a
  // missing value into ReferenceError on the whole detail page.
  //
  // Passed down rather than re-derived from useParams() inside the child: the
  // uppercase normalisation above is the one that matters and a second copy of
  // it would be free to drift.
  //
  // UrlEntityDrawerHost renders the drawer stack (?drawerType=&drawerId= and
  // ?drawerStack=) over either view — see its definition. It renders nothing when those are absent, so
  // every existing page is unchanged until something opens one.
  return (
    <>
      {id
        ? <ModuleDetailView bp={resolvedBp} id={id} entityType={entityType} />
        : <ModuleListView   bp={resolvedBp} />}
      <UrlEntityDrawerHost />
    </>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────

function ModuleListView({ bp }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
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
  // Search / page / sort live in the URL so a refresh, Back, or an app-tab
  // switch lands on the same view rather than page 1 of an unsorted, unfiltered
  // list. Defaults are stripped from the URL, so the plain list URL stays clean.
  //
  // `search` keeps a local mirror: the input must repaint on every keystroke,
  // but writing a history entry (even a replaced one) per character makes
  // typing stutter and floods RouteSync. The mirror renders, a debounce
  // publishes to the URL, and the query reads the URL.
  const [urlSearch, setUrlSearch] = useUrlState('q', '')
  const [search, setSearch] = useState(urlSearch)
  const [page, setPage] = useUrlNumber('page', 0)
  const [createOpen, setCreateOpen] = useState(false)
  // Set when Add-under-this-one is used on a tree node, so the create form
  // opens with the parent already chosen.
  const [createParent, setCreateParent] = useState(null)

  // Which form field holds the parent, per module. Read from the blueprint's
  // fields_schema_json treeConfig so a third tree module needs no code change.
  const treeParentField = useMemo(() => {
    try {
      const cfg = JSON.parse(bp.fieldsSchemaJson || '{}')?.treeConfig
      if (cfg?.parentField) return cfg.parentField
    } catch {}
    return bp.entityType === 'ASSET' ? 'parentAssetId' : 'managerPersonnelId'
  }, [bp.fieldsSchemaJson, bp.entityType])
  const [importOpen,  setImportOpen]  = useState(false)
  const [aiDraftOpen, setAiDraftOpen] = useState(false)
  // Origin filter — GLOBAL | ORG | '' (both). In the URL with the other list
  // state so it survives refresh and Back, and only rendered when the list
  // actually reports an origin, so no other module grows a stray filter.
  // Default to a tenant's OWN policies.
  //
  // With the platform library adopted, "All" is 38 platform rows plus 38 copies
  // of the same documents — the tenant's actual policy register is buried in a
  // list that is twice the size and mostly not theirs. Platform admins default
  // to All, because the global library IS their register.
  //
  // Only applied where the module reports an origin, so no other list changes.
  // selectRoleSides, not currentSide — that identifier belongs to the DETAIL
  // component and is not in scope here.
  const listRoleSides = useSelector(selectRoleSides) || []
  const isPlatformSide = listRoleSides.includes('SYSTEM')
  // Default to the tenant's OWN policies.
  //
  // Once the platform library is adopted, "All" is ~38 platform rows plus ~38
  // near-identical copies, and the register the tenant actually maintains is
  // buried in a list twice the size that is mostly not theirs.
  //
  // This DID create a dead end, but the cause was the origin toggle being
  // rendered from `items` — it vanished when the list was empty, which is the
  // one moment it is needed. That is fixed separately; the toggle now renders
  // from the module. What remains is explaining the empty list rather than
  // showing a bare "0 records" — see emptyMessage below.
  //
  // Platform admins default to All: the global library IS their register.
  const defaultOrigin = (isPlatformSide || bp?.entityType !== 'AUDIT_POLICY') ? '' : 'ORG'
  const [origin, setOrigin] = useUrlState('origin', defaultOrigin)
  // Batched writer — anything that changes a filter AND resets paging must use
  // this. Two separate setSearchParams calls in one handler both read the
  // pre-update location, so the second silently discards the first.
  const writeUrl = useUrlWriter()
  const [sortBy,       setSortBy]       = useUrlState('sortBy', '')
  const [sortDir,      setSortDir]      = useUrlState('sortDir', 'desc')
  const [selectedIds,  setSelectedIds]  = useState([])

  // Publish the typed value to the URL once typing settles.
  useEffect(() => {
    if (search === urlSearch) return
    const t = setTimeout(() => {
      // Search and page reset in one write. A changed filter invalidates the
      // page index — searching while on page 4 would otherwise ask for rows
      // 60-80 of a result set that now has 3 — but done as two writes the page
      // reset simply discarded the search.
      writeUrl({ q: search, page: null })
    }, 350)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line

  // Adopt the URL value when it changes underneath us — Back/Forward, or an
  // app-tab switch restoring a different saved route.
  useEffect(() => {
    setSearch(prev => (prev === urlSearch ? prev : urlSearch))
  }, [urlSearch])

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

  // Toolbar actions exclude anything row-scoped.
  //
  // An endpoint containing {id} needs a record to act on, so it cannot be a
  // toolbar button — pressing it fires the literal string "{id}" at the API and
  // the user gets "An unexpected error occurred" for a button that could never
  // have worked. Those actions are rendered per row instead (see the __adopt
  // column below), from this same list.

  // A bare "0 records" is the wrong answer for a tenant who simply has not
  // adopted anything yet — nothing is missing, they have not started. Say which
  // of the two situations it is, and name the way out.
  const emptyFallback = (bp.entityType === 'AUDIT_POLICY' && origin === 'ORG' && !search)
    ? "You have not created or adopted any policies yet. Switch to Platform to browse the "
      + "library, or use Adopt all platform policies to copy it into your organisation."
    : `No ${entityPlural.toLowerCase()} found`

  // ui_states rows for list screens were being seeded and never read: this
  // computed the message itself and DataTable rendered a bare string.
  // DynamicState has existed all along — DB-driven, with fallbacks — but only
  // TenantListPage used it. Routing the message through it makes every module's
  // empty state configurable from ui_states with no per-module code, the same
  // way the linked-* tab key works.
  //
  // Same react-query key as DynamicState uses internally, so this is a cache
  // read rather than a second request. It exists only to learn ctaAction:
  // DynamicState resolves that from the DB but does not hand it to onCta, and
  // its own handler navigates only for a value starting with "/". An action key
  // like CREATE_ASSET would otherwise render a button that does nothing.
  const { data: listStates } = useScreenStates(bp.listScreenKey)
  const emptyCtaKey = listStates?.EMPTY?.ctaAction

  // The AUDIT_POLICY sentence above is KEPT as the fallback, not retired. It is
  // live behaviour today, and deleting it on the assumption that someone will
  // seed an equivalent ui_states row would break the policy list the moment
  // this shipped. A DB row now wins over it; absent one, nothing changes.
  //
  // emptyMessage is a NODE, not a string. Both consumers already render it as
  // one — DataTable does {emptyMessage} inside a <td>, EntityTreeView does
  // {emptyMessage || fallback} — so neither call site needs touching.
  const emptyMessage = (
    <DynamicState
      screenKey={bp.listScreenKey}
      stateType="EMPTY"
      fallbackTitle={emptyFallback}
      fallbackIcon={bp.icon || 'Inbox'}
      onCta={() => {
        const target = emptyCtaKey
          ? listScreenActions.find(a => a.actionKey === emptyCtaKey)
          : null
        if (target) return handleListAction(target)
        // No matching action — fall back to the create drawer, which is what an
        // empty list's CTA almost always means. Silently doing nothing would be
        // worse than doing the obvious thing.
        if (canCreate) setCreateOpen(true)
      }}
    />
  )

  // ── ONE DEFINITION OF "ROW-SCOPED" ────────────────────────────────────────
  //
  // There were two, and they disagreed. The toolbar filter tested only
  // `apiEndpoint.includes('{id}')`; the row column also accepts an action
  // whose {id} lives in payload __navRoute.
  //
  // So a navigate-style row action — no endpoint, {id} in the route — passed
  // the toolbar's test and rendered in the LIST HEADER as well as on each row.
  // In the header there is no row, so {id} never substitutes and the button
  // does nothing at all. That is the dead "Edit" on the vendor list.
  //
  // Shared here so the two can never drift again. An action is row-scoped if
  // it needs a record id from somewhere, whichever field carries it.
  const isRowScopedAction = useCallback((a) => {
    if ((a.apiEndpoint || '').includes('{id}')) return true
    try {
      const meta = JSON.parse(a.payloadTemplateJson || '{}')
      // A __component action always operates on one row — the component takes
      // the row as its subject. It carries no {id} anywhere, because the
      // component owns its own requests, so without this clause it would look
      // unscoped and render in the TOOLBAR, where there is no row to act on.
      // Exactly the leak that produced the dead header "Edit".
      if (meta.__component) return true
      return typeof meta.__navRoute === 'string' && meta.__navRoute.includes('{id}')
    } catch { return false }
  }, [])

  const toolbarActions = useMemo(
    () => listScreenActions.filter(a => {
      // Row-scoped: needs an entity, rendered per row instead.
      if (isRowScopedAction(a)) return false

      // Bulk-scoped: needs a SELECTION, rendered in the selection bar instead.
      //
      // Missing this was the NO_IDS error. A bulk action has no {id}, so it
      // slipped past the row-scoped filter and rendered in the toolbar as well —
      // two identically-labelled "Delete selected" buttons, one of which went
      // through handleListAction and fired the request with no body at all.
      try {
        if (JSON.parse(a.payloadTemplateJson || '{}')['__bulk'] === true) return false
      } catch { /* unparseable payload — treat as a normal toolbar action */ }

      return true
    }),
    [listScreenActions, isRowScopedAction])

  const { data: screenRes } = useScreenConfig(bp.listScreenKey)
  const screenConfig = screenRes?.data || screenRes

  // frameworkRef scopes a SHARED module (audit_engagement/finding) to one
  // framework, so an ISO-only tenant reaching the page via the ISO nav row sees
  // only ISO rows — never SOC2/RBI. Comes from the nav route's ?frameworkRef=.
  const frameworkRef = searchParams.get('frameworkRef') || undefined
  // urlSearch, not `search`: the query follows the debounced value so typing
  // does not fire a request per character.
  const params = { search: urlSearch || undefined, skip: page * 20, take: 20,
    frameworkRef,
    origin: origin || undefined,
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
  // Which record's side panel is open, in the URL for the same reason the tab is:
  // refreshing with a drawer open used to close it and lose the row the user was
  // reading. Pushed rather than replaced — opening a record IS a new place, so
  // Back should close the drawer and return to the bare list, which is what
  // Escape and the close button do anyway.
  const [drawerIdRaw, setDrawerIdRaw] = useUrlState('drawer', '', { replace: false })
  // Numeric where possible: this used to be row.id straight off the entity, and
  // a URL round-trip turns it into a string. Anything downstream doing a ===
  // comparison against a numeric id would silently stop matching.
  const drawerId = drawerIdRaw ? (Number.isFinite(Number(drawerIdRaw)) ? Number(drawerIdRaw) : drawerIdRaw) : null
  const setDrawerId = setDrawerIdRaw
  // Closing clears the drawer's sub-tab as well. Two separate hook writes would
  // work but produce two history operations, and leaving drawerTab behind means
  // the next record opens on the tab the previous one was left on.
  const closeDrawer = useCallback(() => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      p.delete('drawer')
      p.delete('drawerTab')
      return p
    }, { replace: false })
  }, [setSearchParams])
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
  // ── Per-row adopt action ───────────────────────────────────────────────────
  // Any configured action whose key marks it as an adopt (CUSTOMISE / ADOPT /
  // COPY_TO) and whose endpoint is row-scoped (contains {id}) also gets a
  // per-row button, not just a button on the detail page. Finding a platform
  // policy you want and having to open it first to take a copy is a pointless
  // round trip when the list already tells you which rows are adoptable.
  //
  // Driven by the same ui_actions row as the detail button, so the label,
  // endpoint, method and confirmation text stay in one place. Nothing is
  // hardcoded to policies — configure an adopt action on another list and it
  // gets the same column.
  const rowAdoptAction = useMemo(
    () => listScreenActions.find(a =>
      /^(CUSTOMISE|CUSTOMIZE|ADOPT|COPY_TO)/i.test(a.actionKey || '')
      && (a.apiEndpoint || '').includes('{id}')),
    [listScreenActions])

  // Guards against a double click creating two copies — the endpoint is not
  // idempotent, and a second call would leave the org with two identical
  // policies differing only by id.
  const [adoptingId, setAdoptingId] = useState(null)

  // Row pending deletion. Confirmation is not optional here: the server refuses
  // an approved policy and one already used by an engagement, but everything
  // else deletes immediately and irreversibly, mappings included.
  const [deleteRow, setDeleteRow] = useState(null)
  const [deleting, setDeleting]   = useState(false)
  const [deprecateRow, setDeprecateRow] = useState(null)

  const deprecateOne = useCallback(async (row) => {
    try {
      await api.post(`${bp.apiBasePath}/${row.id}/deprecate`)
      qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      toast.success('Policy deprecated')
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Deprecate failed')
    } finally {
      setDeprecateRow(null)
    }
  }, [bp.apiBasePath, qc])

  // Single source of truth for "can this row be deleted", used by BOTH the row
  // button and the bulk checkbox. Two copies of this rule would drift, and the
  // drift would show up as a checkbox you can tick for something the server
  // then refuses — the exact confusion the checkbox is meant to prevent.
  //
  // Mirrors deletePolicy: platform admins may delete anything they own; a tenant
  // only DRAFT or DEPRECATED. The server still enforces it independently, and
  // additionally refuses a policy an engagement already uses — which the client
  // cannot know from the list row.
  const canDeleteRow = useCallback((row) => row?.editable !== false
    && (isPlatformSide || ['DRAFT', 'DEPRECATED'].includes(row?.status)),
    [isPlatformSide])

  const deleteOne = useCallback(async (row) => {
    if (deleting) return          // double-click guard — delete is not idempotent
    setDeleting(true)
    try {
      await api.delete(`${bp.apiBasePath}/${row.id}`)
      qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      toast.success('Deleted')
    } catch (e) {
      // The server's refusals are specific and worth showing verbatim — "3
      // engagements already include this policy" tells the user what to do next,
      // where "Delete failed" does not.
      toast.error(e?.response?.data?.message || e?.message || 'Delete failed')
    } finally {
      setDeleting(false)
      setDeleteRow(null)
    }
  }, [bp.apiBasePath, qc, deleting])

  const runRowAction = useCallback(async (action, row) => {
    if (adoptingId) return
    setAdoptingId(row.id)
    try {
      const res = await api({ method: action.httpMethod || 'POST',
                             url: action.apiEndpoint.replace('{id}', row.id) })
      qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })

      // Land them ON the copy. "Successful" told the user nothing about what
      // happened or what to do next — the new record is a DRAFT that still
      // needs review and approval before an engagement will pick it up, and
      // it sits under the same title in an alphabetical list, so telling them
      // to go find it is a worse answer than taking them there.
      const newId = res?.id ?? res?.data?.id
      if (newId) {
        toast.success('Your copy is ready — edit it, then send for review')
        navigate(`/module/${bp.entityType.toLowerCase()}/${newId}`)
      } else {
        toast.success('Copied to your organisation as a draft')
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || action.label + ' failed')
    } finally {
      setAdoptingId(null)
    }
  }, [bp.apiBasePath, bp.entityType, qc, adoptingId, navigate])

  // ── GENERIC PER-ROW ACTIONS ───────────────────────────────────────────────
  //
  // Until now the only action a LIST row could carry was the adopt one, found
  // by a hardcoded key regex and taken with .find() — so exactly one, and only
  // if it was called CUSTOMISE / ADOPT / COPY_TO. Everything else configured on
  // a list screen rendered on the header and nowhere else, which is why a
  // vendor row could not offer Restart workflow or Suspend without a code
  // change.
  //
  // Any list action that is row-scoped now gets a per-row button: row-scoped
  // meaning its endpoint contains {id}, or its payload carries a __navRoute
  // that does. The adopt action is excluded because it already has its own
  // button with its own copy-and-navigate behaviour.
  //
  // Nothing changes for an existing module: no list screen has such a row
  // seeded today, so this is an empty array everywhere until sql/75 adds them.
  const rowMenuActions = useMemo(() =>
    listScreenActions.filter(a =>
      a.isActive !== false
      && isRowScopedAction(a)
      && !/^(CUSTOMISE|CUSTOMIZE|ADOPT|COPY_TO)/i.test(a.actionKey || '')),
    [listScreenActions, isRowScopedAction])

  const [rowActing, setRowActing] = useState(null)
  const [rowComponent, setRowComponent] = useState(null)

  const runRowMenuAction = useCallback(async (action, row) => {
    let meta = {}
    try { meta = JSON.parse(action.payloadTemplateJson || '{}') } catch {}

    const sub = (str) => String(str || '')
      .replace(/\{id\}/g, row.id)
      .replace(/\{entityId\}/g, row.id)

    if (action.requiresConfirmation && action.confirmationMessage
        && !window.confirm(sub(action.confirmationMessage))) return

    // A component action owns its own flow — several steps, several requests.
    if (meta.__component) {
      const Comp = ROW_ACTION_COMPONENTS[meta.__component]
      if (!Comp) { toast.error(`Unknown action component: ${meta.__component}`); return }
      setRowComponent({ name: meta.__component, row })
      return
    }

    // Navigation next: a __navRoute action has no endpoint to call.
    if (meta.__navRoute) { navigate(sub(meta.__navRoute)); return }

    // A form action on a row opens the same modal the header uses, with the
    // row id carried in so the form submits against the right record.
    if (meta.__formKey) { setListFormAction({ ...action, __rowId: row.id, __rowData: row }); return }

    if (!action.apiEndpoint) {
      toast.error(`${action.label} has no endpoint configured`)
      return
    }

    const body = Object.fromEntries(
      Object.entries(meta)
        .filter(([k]) => !k.startsWith('__'))
        .map(([k, v]) => [k, typeof v === 'string' ? sub(v) : v]))

    setRowActing(`${row.id}:${action.actionKey}`)
    try {
      await api({ method: action.httpMethod || 'POST', url: sub(action.apiEndpoint), data: body })
      qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      toast.success(`${action.label} done`)
    } catch (e) {
      toast.error(e?.response?.data?.error?.message
               || e?.response?.data?.message || `${action.label} failed`)
    } finally {
      setRowActing(null)
    }
  }, [bp.apiBasePath, qc, navigate])

  const columns = useMemo(() => {
    let base = null
    if (screenConfig?.layout?.columnsJson) {
      try {
        const cols = JSON.parse(screenConfig.layout.columnsJson)
        if (Array.isArray(cols) && cols.length > 0) base = cols
      } catch {}
    }
    if (base) {
      // The column appears when the module has ANY per-row action — not only
      // when an adopt action is configured.
      //
      // Gating on rowAdoptAction alone meant the platform side lost the whole
      // column: CUSTOMISE_POLICY is ORGANIZATION-only, so a platform admin had
      // no adopt action, and Edit and Delete disappeared with it. `editable` is
      // the honest signal that a module has per-row actions at all.
      const rowsReportEditable = items.some(r => r?.editable !== undefined)
      if (!rowAdoptAction && !rowsReportEditable && rowMenuActions.length === 0) return base
      // Appended here rather than stored in columns_json because `render` is a
      // function and cannot survive a trip through JSON config.
      return [...base, {
        // type MUST be 'custom' — DataTable.renderCell only consults col.render
        // under that case; anything else falls through to the default cell and
        // prints an em dash, which is exactly what a column of empty rows was.
        key: '__adopt', label: 'Actions', type: 'custom',
        // Wider when configured actions share the column, or four buttons wrap
        // onto three lines and the row height doubles.
        // 28px per icon button plus the built-in Edit/Delete pair.
        width: rowMenuActions.length > 0 ? 120 + rowMenuActions.length * 28 : 130,
        sortable: false,
        // Platform rows offer Customise; the tenant's own rows offer Edit. An
        // empty cell on half the table read as "nothing you can do here", which
        // is the opposite of true for the records they actually own.
        render: (row) => {
          // Delete sits beside the primary action rather than replacing it, so a
          // row can offer Edit AND Delete. Mirrors the server rules exactly
          // (deletePolicy): platform admins may delete any policy they own;
          // a tenant only DRAFT or DEPRECATED, because deleting an approved one
          // destroys their own approval and version history.
          const canDelete = canDeleteRow(row)

          const deleteBtn = canDelete ? (
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteRow(row) }}
              title="Delete"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-ctl text-[11px] font-medium
                         border border-border text-text-muted hover:text-status-fail-fg
                         hover:border-status-fail-bd transition-colors">
              <Trash2 size={11} />
            </button>
          ) : null

          // ── ONE EDIT PER ROW ──────────────────────────────────────
          //
          // The built-in Edit below navigates to the detail page. It exists
          // because, until row actions could be configured, there was no other
          // way to reach a record.
          //
          // Now there is: a module that seeds its own EDIT row action gets
          // that one instead, and the built-in stands down. Without this the
          // vendor list showed two pencils doing different things, which is
          // the state you were looking at.
          //
          // Matched on the action KEY rather than the label, because a label
          // is translated and a key is not.
          const hasConfiguredEdit = rowMenuActions.some(
            a => /EDIT/i.test(a.actionKey || ''))

          // Platform admins have no adopt action, so there is no primary button
          // on a global row — only Delete. Guarded rather than assumed.
          const primary = (row.editable === false && rowAdoptAction) ? (
          <button
            onClick={(e) => { e.stopPropagation(); runRowAction(rowAdoptAction, row) }}
            disabled={adoptingId === row.id}
            title={rowAdoptAction.confirmationMessage || rowAdoptAction.label}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-ctl text-[11px] font-medium
                       border border-brand-500/30 text-brand-ink bg-brand-500/10
                       hover:bg-brand-500/20 disabled:opacity-50 disabled:cursor-wait transition-colors">
            <Copy size={11} />
            {adoptingId === row.id ? 'Copying…' : rowAdoptAction.label}
          </button>
          ) : row.editable === false ? null : row.status === 'APPROVED' ? (
            // An approved policy is in force. Edit is the wrong verb for it —
            // silently rewriting a document an engagement may have snapshotted
            // and an auditor may have cited. Deprecate withdraws it and keeps
            // the history; New version supersedes it. Both live on the detail
            // screen, so this row offers the one that is a decision.
            <button
              onClick={(e) => { e.stopPropagation(); setDeprecateRow(row) }}
              title="Withdraw this policy from force"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-ctl text-[11px] font-medium
                         border border-status-warn-bd text-status-warn-fg
                         hover:bg-status-warn-bg transition-colors">
              <Archive size={11} />
              Deprecate
            </button>
          ) : hasConfiguredEdit ? null : (
            <button
              onClick={(e) => { e.stopPropagation()
                navigate(`/module/${bp.entityType.toLowerCase()}/${row.id}`) }}
              title="Open to edit"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-ctl text-[11px] font-medium
                         border border-border text-text-secondary hover:bg-surface-overlay transition-colors">
              <Pencil size={11} />
              Edit
            </button>
          )

          // Configured actions, filtered per row by allowed_statuses_json so a
          // Suspend button does not appear on an already-suspended vendor.
          const configured = rowMenuActions.filter(a => {
            if (!a.allowedStatusesJson) return true
            try {
              const allowed = JSON.parse(a.allowedStatusesJson)
              return !Array.isArray(allowed) || allowed.length === 0
                  || (row.status && allowed.includes(row.status))
            } catch { return true }
          })

          return (
            <div className="flex items-center gap-1.5 flex-wrap">
              {primary}
              {/* ── ICON ONLY, LABEL IN THE TOOLTIP ─────────────────────
                  Five labelled buttons do not fit a table cell, so they wrapped
                  onto five lines and tripled the row height. The label is not
                  lost — it is the title, and every icon here is a conventional
                  one (pause, exit, pencil, branch). A configured action with NO
                  icon still falls back to its text, because an unlabelled blank
                  square is worse than a wide cell. */}
              {configured.map(a => {
                const RowIcon = resolveIcon(a.icon)
                const busyKey = `${row.id}:${a.actionKey}`
                return (
                  <button
                    key={a.id ?? a.actionKey}
                    onClick={(e) => { e.stopPropagation(); runRowMenuAction(a, row) }}
                    disabled={rowActing === busyKey}
                    title={a.label}
                    aria-label={a.label}
                    className={cn(
                      'inline-flex items-center justify-center rounded-ctl',
                      'transition-colors disabled:opacity-50 disabled:cursor-wait',
                      RowIcon ? 'h-6 w-6' : 'h-6 px-2 text-[11px] font-medium',
                      a.variant === 'danger'
                        ? 'border border-status-fail-bd text-status-fail-fg hover:bg-status-fail-bg'
                        : 'border border-border text-text-muted hover:bg-surface-overlay hover:text-text-primary')}>
                    {RowIcon ? <RowIcon size={12} /> : a.label}
                  </button>
                )
              })}
              {deleteBtn}
            </div>
          )
        },
      }]
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
  // `items` IS a dependency: it decides whether the Actions column exists at
  // all. Without it the memo ran once against an empty list, dropped the
  // column, and never recomputed when the rows arrived — which is why the
  // platform side had no Actions column even after the gating was fixed.
  }, [screenConfig, bp.fieldsSchemaJson, rowAdoptAction, runRowAction, adoptingId,
      rowMenuActions, runRowMenuAction, rowActing,
      items, canDeleteRow, deprecateRow])

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
  // Declared HERE, above handleListAction — its first use. Anchored to
  // bulkRunning it landed 40 lines below the callback that closes over it,
  // and const is not hoisted: "Cannot access before initialization" on mount.
  const [listActingId, setListActingId] = useState(null)

  const handleListAction = useCallback(async (action) => {
    let meta = {}
    try { meta = JSON.parse(action.payloadTemplateJson || '{}') } catch {}

    if (meta.__formKey) { setListFormAction(action); return }
    if (meta.__navRoute) { navigate(meta.__navRoute); return }
    if (meta.__openImport) { setImportOpen(true); return }
    // {"__aiDraft": true} — same shape as __openImport: a payload flag flips a
    // boolean and a sibling modal renders. Keeps the AI flow inside the module
    // screen rather than breaking to a full page, which is how every other
    // create path here already behaves.
    if (meta.__aiDraft) { setAiDraftOpen(true); return }
    if (!action.apiEndpoint) return

    // Toolbar actions had NO pending state at all — unlike the detail-screen
    // ones, which track actingId. A seeded toolbar action fired, the list
    // refetched, and nothing on screen moved in between.
    if (listActingId) return          // guard: these are not all idempotent
    setListActingId(action.id)
    try {
      await api({ method: action.httpMethod || 'POST', url: action.apiEndpoint })
      // Awaited, so the button holds its state until the list is actually current.
      await qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      toast.success(action.label + ' successful')
    } catch (e) {
      toast.error(e?.response?.data?.message || action.label + ' failed')
    } finally {
      setListActingId(null)
    }
  }, [bp.apiBasePath, navigate, qc, listActingId])

  const handleSort = (key) => {
    // One write, not three. sortBy, sortDir and page each went through their own
    // setSearchParams call, and every one of them recomputed from the same
    // pre-update location — so only the last survived. Sorting a new column set
    // the direction and lost the column.
    const nextDir = sortBy === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc'
    writeUrl({ sortBy: key, sortDir: nextDir, page: null })
  }

  // Bulk action executor — reads payloadTemplateJson.__bulk = true to identify bulk actions
  // Which bulk action is in flight. Not a plain boolean: several bulk actions can
  // share the toolbar, and only the one that was clicked should show a spinner.
  const [bulkRunning, setBulkRunning] = useState(null)

  const handleBulkAction = useCallback(async (action) => {
    if (selectedIds.length === 0) { toast('Select at least one record'); return }
    // Guard, not just a disabled attribute. A bulk delete is destructive and not
    // idempotent — a double click before the first response lands would fire the
    // same ids twice, and the second call reports "0 deleted" for rows that are
    // already gone, which reads like a failure.
    if (bulkRunning) return

    let meta = {}
    try { meta = JSON.parse(action.payloadTemplateJson || '{}') } catch {}

    setBulkRunning(action.id)
    const count = selectedIds.length
    try {
      const res = await api({ method: action.httpMethod || 'POST',
        url: action.apiEndpoint, data: { ids: selectedIds, ...Object.fromEntries(Object.entries(meta).filter(([k]) => !k.startsWith('__'))) } })

      qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      setSelectedIds([])

      // Report what the SERVER did, not what was asked. bulkDeletePolicies skips
      // anything the caller does not own or that an engagement uses, so
      // "applied to 36 records" could be true of none of them.
      const deleted = res?.deleted ?? res?.data?.deleted
      const skipped = res?.skipped ?? res?.data?.skipped
      if (typeof deleted === 'number') {
        toast.success(skipped
          ? `${deleted} deleted, ${skipped} skipped`
          : `${deleted} deleted`)
      } else {
        toast.success(`${action.label} applied to ${count} records`)
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || action.label + ' failed')
    } finally {
      setBulkRunning(null)
    }
  }, [bp.apiBasePath, qc, selectedIds, bulkRunning])

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
          {/* Origin segmented filter. Rendered only when the current page of
              results actually reports an origin, so it appears on the library
              modules and nowhere else — no blueprint flag to maintain. Platform
              and Custom copies interleave alphabetically (POL-03 twice, once
              each), which is unreadable at 40+ rows. */}
          {/* Rendered from the MODULE, not from the rows. Deriving it from
              items meant the control vanished exactly when the list was
              empty — the one moment a user needs it. */}
          {/* Generalised: any module that seeds a row-adopt action gets the
              toggle, so no module needs naming here again. rowAdoptAction is
              derived from ui_actions, which is config, and it is module-level
              rather than row-level so it survives an empty list.
              AUDIT_POLICY stays as an explicit clause: CUSTOMISE_POLICY is
              ORGANIZATION-only, so a platform admin has no rowAdoptAction and
              would otherwise lose the toggle on the policy list. */}
          {(bp.entityType === 'AUDIT_POLICY' || Boolean(rowAdoptAction)) && (
            <div className="inline-flex items-center rounded-ctl border border-border overflow-hidden">
              {[{ v: '',       l: 'All'      },
                { v: 'GLOBAL', l: 'Platform' },
                { v: 'ORG',    l: 'Custom'   }].map(opt => (
                <button key={opt.v || 'all'}
                  onClick={() => writeUrl({ origin: opt.v, page: null })}
                  className={cn(
                    'px-2.5 h-8 text-[11px] font-medium transition-colors',
                    origin === opt.v
                      ? 'bg-brand-500/15 text-brand-ink'
                      : 'text-text-secondary hover:bg-surface-overlay')}>
                  {opt.l}
                </button>
              ))}
            </div>
          )}
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
          {toolbarActions.length > 0
            ? toolbarActions.map(action => {
              const ListIcon = resolveIcon(action.icon) || (action.actionKey?.includes('CREATE') || action.actionKey?.includes('NEW') ? Plus : undefined)
              // Several labels are stored with a leading "+" from before the icon
              // existed, so the button rendered "+ + New policy". Stripped at render
              // rather than in the data: the icon is the code's decision, so the
              // code should own not duplicating it.
              // Renamed from listLabel — that identifier is already used further
              // down for the breadcrumb, and shadowing it here would be a trap.
              const actionLabel = String(action.label || '').replace(/^\s*\+\s*/, '')
              return (
              <Button key={action.id} size="sm"
                variant={action.variant === 'secondary' ? 'secondary' : 'primary'}
                icon={ListIcon}
                // Same treatment the detail-screen actions already had: the
                // clicked button shows progress, its siblings disable so a
                // second action cannot start mid-flight.
                loading={listActingId === action.id}
                loadingText={actionLabel + '…'}
                disabled={listActingId != null && listActingId !== action.id}
                onClick={() => handleListAction(action)}>
                {actionLabel}
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
              emptyMessage={emptyMessage}
              /* The tree renders the SAME columns as the table, so a module
                 does not describe itself twice. `columns` is already built
                 above from screenConfig.layout.columnsJson. */
              columns={columns}
              /* The header already has a search box. The tree previously drew
                 its own underneath, which duplicated the control and looked
                 bolted on. It filters against this one instead. */
              search={urlSearch}
              canEdit={vc?.canEdit !== false}
              onAddChild={(parent) => {
                // Pre-seeds the parent so creating from a node actually nests.
                // Before, creating from a tree always produced a root and the
                // parent had to be set afterwards from a lookup.
                setCreateParent(parent)
                setCreateOpen(true)
              }}
              onEdit={handleRowClick}
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
                        <Button key={a.id} size="sm" variant="secondary"
                          // Button already disables itself while loading and
                          // renders loadingText, so no need to reimplement either.
                          loading={bulkRunning === a.id}
                          loadingText={a.label.replace(/^Delete/, 'Deleting')}
                          // The extra disabled covers the OTHER buttons: they all
                          // act on the same selection, so a second action firing
                          // mid-flight would apply to ids the first may already
                          // have consumed.
                          disabled={!!bulkRunning && bulkRunning !== a.id}
                          onClick={() => handleBulkAction(a)}>
                          {a.label}
                        </Button>
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
                emptyMessage={emptyMessage}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                pagination={listRes?.pagination || listRes?.data?.pagination}
                onPageChange={(p) => setPage(p - 1)}
                selectable={!!screenConfig?.layout?.selectable && listScreenActions.some(a => { try { return JSON.parse(a.payloadTemplateJson || '{}')['__bulk'] === true } catch { return false } })}
                // Only meaningful where rows carry an `editable` flag — i.e. the
                // library modules. Elsewhere it returns true for everything and
                // selection behaves exactly as before.
                isRowSelectable={bp.entityType === 'AUDIT_POLICY' ? canDeleteRow : undefined}
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
          onClose={closeDrawer}
          onOpenFull={() => {
            // navigate() only — do NOT call closeDrawer() here.
            //
            // closeDrawer is a router navigation now that the drawer lives in the
            // URL (?drawer=). Firing it straight after navigate() issues a SECOND
            // navigation, computed from the still-current list location, which
            // lands back on the list and cancels the one we just asked for — the
            // drawer's "open full page" did nothing at all.
            //
            // Leaving the list URL discards ?drawer= and ?drawerTab= anyway, so
            // there is nothing to clean up.
            navigate(`/module/${bp.entityType.toLowerCase()}/${drawerId}`)
          }}
        />
      )}

      {deprecateRow && (
        <ConfirmDialog
          open
          title={`Deprecate ${deprecateRow.title || 'this policy'}?`}
          message={'This withdraws the policy from force. Engagements that already '
                 + 'snapshotted it keep their copy, and the approval history is '
                 + 'preserved — but it will not be included in new engagements. '
                 + 'To revise it instead, use New version.'}
          confirmLabel="Deprecate"
          variant="danger"
          onConfirm={() => deprecateOne(deprecateRow)}
          onClose={() => setDeprecateRow(null)}
        />
      )}

      {deleteRow && (
        <ConfirmDialog
          open
          title={`Delete ${deleteRow.title || deleteRow.name || 'this record'}?`}
          message={'This permanently deletes the record and its control mappings. '
                 + 'It cannot be undone.'}
          confirmLabel="Delete"
          variant="danger"
          // ConfirmDialog passes this to its confirm Button, which disables
          // itself while loading — so the dialog cannot be double-submitted.
          loading={deleting}
          onConfirm={() => deleteOne(deleteRow)}
          onClose={() => setDeleteRow(null)}
        />
      )}

      {/* TestPolicyCsvImportModal — sibling, not nested inside bp.createFormKey */}
      {importOpen && (
        <TestPolicyCsvImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          // Policies get their own importer, which refuses TEST rows rather than
          // applying them. Every other module keeps the modal's default target.
          endpoint={bp.entityType === 'AUDIT_POLICY'
            ? '/v1/audit/library/policies/import' : undefined}
          title={bp.entityType === 'AUDIT_POLICY' ? 'Import policies from CSV' : undefined}
          onImported={() => {
            setImportOpen(false)
            // The list is cached server-side and query-cached client-side; an
            // import changes it, so both need invalidating or the user sees the
            // old rows and assumes the import failed.
            qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
          }}
        />
      )}

      {/* AI draft modal — sibling of the list, same as the CSV importer above.
          Creates one AuditPolicy in DRAFT and navigates to the editor; the
          adoption workflow still starts when the drafter submits for review. */}
      {aiDraftOpen && (
        <AiPolicyCreateModal
          open={aiDraftOpen}
          onClose={() => setAiDraftOpen(false)}
          onCreated={() => {
            // The new policy will not appear until the cached list is dropped.
            qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
          }}
        />
      )}

      {/* Create modal — fallback when no screen actions are configured */}
      {bp.createFormKey && (
        <Modal open={createOpen} onClose={() => { setCreateOpen(false); setCreateParent(null) }}
          title={createParent
            ? `New ${entitySingular} under ${createParent.fullName || createParent.name || ''}`.trim()
            : `New ${entitySingular}`}
          size="lg"
        >
          <DynamicForm
            formKey={bp.createFormKey}
            // Pre-seeds the parent when Add-under-this-one was used on a tree
            // node. The field name differs per module — managerPersonnelId for
            // Personnel, parentAssetId for Assets — so it is taken from the
            // blueprint's tree config rather than hardcoded. Without this,
            // creating from a tree always produced a root and the parent had to
            // be set afterwards from a lookup, which is the single biggest
            // reason the hierarchy drifted out of date.
            defaultValues={createParent ? { [treeParentField]: createParent.id } : {}}
            // frameworkRef flows into framework-scoped lookups (e.g. the template
            // picker fetches only this framework's templates) and is stamped on submit.
            contextParams={frameworkRef ? { frameworkref: frameworkRef } : undefined}
            // FIX: mutateAsync (not mutate) so a rejected promise propagates to
            // DynamicForm's handleFormSubmit catch block, which then calls setError()
            // per field and shows inline validation messages instead of a silent failure.
            onSubmit={async (data) => {
              await createMut.mutateAsync(data)
              setCreateOpen(false)  // close only after success
              setCreateParent(null)
            }}
            loading={createMut.isPending}
            submitLabel={`Create ${entitySingular}`}
          />
        </Modal>
      )}

      {/* Row action components — see ROW_ACTION_COMPONENTS. Rendered at the
          page level rather than inside the cell so the modal is not unmounted
          by a table re-render mid-flow, which on a two-request wizard would
          abandon it between the two. */}
      {rowComponent && (() => {
        const Comp = ROW_ACTION_COMPONENTS[rowComponent.name]
        if (!Comp) return null
        return (
          <Comp
            vendorId={rowComponent.row?.id}
            vendorName={rowComponent.row?.name}
            entityId={rowComponent.row?.id}
            row={rowComponent.row}
            onClose={() => setRowComponent(null)}
            onDone={() => {
              qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
            }}
          />
        )
      })()}

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
              // ── AN EDIT FORM MUST OPEN WITH THE RECORD IN IT ──────────────
              //
              // This modal was written for CREATE actions, so it passed no
              // defaultValues and every field opened blank. Used as an EDIT
              // action that is actively dangerous, not merely unhelpful:
              // updateVendor treats a blank string as "not supplied" and leaves
              // the column alone, but the person is looking at an empty form
              // with no way to tell what the current values are, and a required
              // field they cannot see reads as a form that will not submit.
              //
              // __rowId is set only when the modal was opened from a ROW, and
              // the row object is the record — the list already fetched it, so
              // seeding from it costs nothing and needs no second request.
              defaultValues={listFormAction.__rowData || undefined}
              contextParams={frameworkRef ? { frameworkref: frameworkRef } : undefined}
              onSubmit={async (data) => {
                // __rowId is set when this modal was opened from a ROW action
                // rather than the header. Substituting it here means one
                // ui_actions row and one form serve both places — the vendor
                // Restart workflow action is identical whether it is pressed on
                // the list row or on the detail header.
                const rawEndpoint = listFormAction.apiEndpoint || bp.apiBasePath
                const endpoint = listFormAction.__rowId != null
                  ? String(rawEndpoint)
                      .replace(/\{id\}/g, listFormAction.__rowId)
                      .replace(/\{entityId\}/g, listFormAction.__rowId)
                  : rawEndpoint
                const payload = frameworkRef ? { frameworkRef, ...data } : data
                const res = await api({ method: listFormAction.httpMethod || 'POST', url: endpoint, data: payload })
                qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
                // "Policy created" is wrong for an adopt-all run — nothing was
                // created here, a background job was queued. The server's own
                // message says what happened; fall back to the generic one.
                toast.success(res?.message || res?.data?.message
                  || `${entitySingular} created`)
                setListFormAction(null)  // close only after success
              }}
              // The button states the consequence rather than repeating the
              // action name. Approving 38 documents and drafting 38 documents
              // are different acts, and the toggle that decides which is easy to
              // skim past.
              // "Edit details" on the button of an edit form describes the
              // screen, not what pressing it does. On a row edit the verb is
              // Save.
              submitLabel={listFormAction.__rowId != null ? 'Save changes' : (values) =>
                listFormAction.actionKey === 'CUSTOMISE_ALL_POLICIES'
                  ? (values?.approve ? 'Adopt and approve all' : 'Adopt as drafts')
                  : listFormAction.label}
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
// Audit engagement instances get their own Action items panel: delegation,
// revoke and the send-back reopen, gated on the entity's server-computed flags.
// ItemActionItems is the vendor-assessment remediation panel (validate / accept
// risk on QUESTION_RESPONSE) and is deliberately not bent to serve them.
const AUDIT_INSTANCE_ACTION_ITEM_TYPES = new Set([
  'AUDIT_CONTROL_INSTANCE', 'AUDIT_TEST_INSTANCE', 'AUDIT_POLICY_INSTANCE',
])

function CapabilityTabBody({ tab, bp, id, entity, vc, focusActionItemId }) {
  if (tab === 'workflow' && bp.supportsWorkflow)
    return <WorkflowTab entityType={bp.entityType} entityId={id} vc={vc} bp={bp} entity={entity} />

  if (tab === 'actions' && bp.supportsActionItems) {
    if (AUDIT_INSTANCE_ACTION_ITEM_TYPES.has(bp.entityType))
      return <AuditInstanceActionItemsTab entityType={bp.entityType} entityId={Number(id)}
               entity={entity} vc={vc} focusActionItemId={focusActionItemId} />
    return <ItemActionItems entityType={bp.entityType} entityId={Number(id)} />
  }

  if (tab === 'evidence' && bp.supportsDocuments) {
    if (bp.entityType === 'AUDIT_CONTROL_INSTANCE')
      return <ControlInstanceEvidenceTab controlInstanceId={entity?.id ?? Number(id)} entity={entity} vc={vc} />
    if (bp.entityType === 'AUDIT_TEST_INSTANCE')
      return <TestInstanceEvidenceTab testInstanceId={entity?.id ?? Number(id)} entity={entity} vc={vc} />
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

// ─── Shared header-action filter ─────────────────────────────────────────────
// ONE filter for the full detail page AND the drawer.
//
// The drawer used to carry its own copy, and it had drifted: it checked status,
// permission, roleAccess and ownership, but none of requiresAssignment,
// requiresSectionGate, the workflow-transition gate (vc.canAct / canOverride),
// allowedStepActions or completesSectionKey. So a requires_assignment button on
// an audit control was correctly hidden on this page and SHOWN in the drawer.
// Two copies of a security filter is how that happened; there is one now.
//
// taskId is the task context the caller is acting under — the URL's on the
// detail page, the resolved vc.taskId in the drawer.
function filterScreenActions({ actions, entity, vc = {}, bp = {}, taskId, roleAccess, currentSide, currentRoleIds }) {
  if (!Array.isArray(actions)) return []
  const seen = new Set()
  return actions.filter(action => {
    if (action.isActive === false) return false
    // Deduplicate by actionKey — same action may appear multiple times if
    // inserted multiple times in DB (e.g. ISSUE_REOPEN inserted per-role)
    if (seen.has(action.actionKey)) return false
    seen.add(action.actionKey)

    // ── Gate 0: platform-owned records are read-only here ────────────────
    // `editable` comes from the API and is false for global library rows a
    // tenant may not modify. Without this, a client opening a global policy
    // was offered Deprecate and New version, both of which the server refuses
    // with POLICY_ACCESS_DENIED — an action that exists only to fail.
    //
    // Runs before every other gate because it is a property of the record,
    // not of the user's role, status or assignment: no permission makes a
    // global policy writable by a tenant.
    //
    // Only mutating actions are hidden. Read-only ones (export, print, view)
    // stay, and entities that do not report `editable` are unaffected.
    //
    // CUSTOMISE/ADOPT is the deliberate exception: it does write, but it writes
    // a NEW record into the caller's own tenant rather than touching the global
    // one, and it is the only route out of a read-only record. Hiding it would
    // leave a client staring at a policy they want with no way to take it.
    const isAdopt = /^(CUSTOMISE|CUSTOMIZE|ADOPT|COPY_TO)/i.test(action.actionKey || '')

    // Writes a new record ELSEWHERE, and is valid on owned and unowned records
    // alike — which is what separates it from isAdopt.
    //
    // COURSE_REQUIRE and COURSE_UNREQUIRE belong here for the same reason as
    // ASSIGN: they write tenant_course_requirements, a row scoped to the
    // CALLER'S tenant, and never touch the course. Marking a platform course
    // required is the single most important thing a tenant does with the
    // library, and it was hidden by the same gate for the same reason.
    //
    // isAdopt is a MIRROR: line below hides those actions on records the
    // caller DOES own, because there is nothing to adopt from yourself.
    // Assign is not like that. A tenant must be able to assign a PLATFORM
    // course they cannot edit, AND their own course, and a SYSTEM user must be
    // able to assign the library course they just wrote. Folding it into
    // isAdopt would have fixed the first case and broken the other two.
    const writesElsewhere = /^(ASSIGN|COURSE_ASSIGN|COURSE_REQUIRE|COURSE_UNREQUIRE)/i.test(action.actionKey || '')

    // An adopt action is the MIRROR of every other gate here: it belongs only
    // on records the caller does NOT own. On their own record there is nothing
    // to adopt — the server refuses with POLICY_ALREADY_OWNED — so it showed a
    // button beside Edit content that could only ever error.
    //
    // Checked separately rather than folded into the condition below, because
    // that one only runs when editable === false; an owned record never
    // reached it, which is exactly how this slipped through.
    if (isAdopt && entity?.editable !== false) return false

    if (entity?.editable === false && action.actionType !== 'READ' && !isAdopt && !writesElsewhere
        && !/^(EXPORT|PRINT|VIEW|DOWNLOAD)/i.test(action.actionKey || '')) {
      return false
    }
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
      // __requiresField: show only when the field IS set — the mirror of
      // __showIfFieldNull, and what an action whose ENDPOINT contains that
      // field needs. Cancel workflow is the case: with no instance the token
      // resolved to empty and the request went to
      // /v1/workflow-instances//cancel.
      // A boolean flag the server sends as false is NOT set: "Ask to resubmit"
      // (canReopenEvidence) showed on every control, to everyone, because
      // false passed the null/empty check.
      if (meta.__requiresField) {
        const v = entity?.[meta.__requiresField]
        if (v == null || v === '' || v === false) return false
      }
    } catch {}
    // requiredPermission gate
    if (action.requiredPermission && vc.permissions?.length > 0) {
      // Override is exempt on workflow transitions, and only there.
      //
      // COMPLETE_STEP requires workflow:task:act — "act on your task". Someone
      // overriding has NO task by definition, so requiring it contradicts the
      // thing they are doing: the backend says canOverride=true and this gate
      // hides the button anyway. Granting task:act to the lead instead would
      // hand them every task-acting action across every module, which is a far
      // wider change than intended.
      //
      // Deliberately narrow: only for the four workflow transition keys, only
      // when the backend has already confirmed override authority for this
      // step (permission held AND same side, checked server-side too).
      const isTransition = ['APPROVE', 'REJECT', 'SEND_BACK', 'COMPLETE_STEP']
            .includes(action.actionKey)
      const overrideExempt = isTransition && vc.canOverride === true
      if (!overrideExempt && !vc.permissions.includes(action.requiredPermission)) return false
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
      // canOverride is a SEPARATE authority: the user holds
      // workflow:step:override and the step is on their side, but has no task
      // here. It gates transition buttons only — never canEdit below, which
      // stays tied to canAct so override authority does not put every tab form
      // into edit mode.
      const effectiveCanAct = vc.canAct === true || vc.canOverride === true

      // Only gate on a task once a workflow ACTUALLY EXISTS.
      //
      // The first transition is the one that STARTS the workflow —
      // SEND_FOR_REVIEW on a policy, and the equivalent on every other module.
      // Requiring an active task to reach it is circular: there is no task
      // because there is no workflow, and there is no workflow because the
      // action that creates it is hidden. A saved draft had Edit content and
      // Delete and no way forward.
      //
      // Once workflowInstanceId is set the gate applies as before, so approvals
      // mid-flow still require the task or an override. The server re-checks
      // regardless; this only decides whether the button is offered.
      const workflowStarted = entity?.workflowInstanceId != null
      if (transitionKeys.has(action.actionKey) && !effectiveCanAct && workflowStarted) return false
      // When a step uses compound-task section gates (hasSections=true), completion
      // happens automatically when all section items are done — hide the manual button
      // to prevent premature APPROVE calls that would fail the gate check.
      // This is fully generic — works for any module, not just AUDIT_PROJECT.
      // ...unless the user can override. A section-gated step completes
      // itself when every item is done, so the manual button is noise for
      // normal users — but override exists precisely for the gated step that
      // will NEVER complete, because some controls have no evidence and never
      // will. Hiding it from overriders too leaves them no route at all.
      // ── A SECTION-GATED STEP COMPLETES ITSELF ──────────────────────
      //
      // APPROVE joins COMPLETE_STEP here. On a step with compound-task
      // sections, the gate is what advances it: performAction calls
      // validateReadyForApproval and throws TASK_SECTIONS_INCOMPLETE while
      // any required section is outstanding, and the last section to
      // complete auto-approves the task.
      //
      // So on TPRM step 5 and step 10 — both of which have two required
      // sections — an Approve button can only do one of two things: fail
      // with a gate error while work is outstanding, or fire after the gate
      // has already advanced the step. Neither is useful, and the first
      // reads as a broken button.
      //
      // The control that DOES advance those steps is "Confirm assignments",
      // which fires the section events. See sql/82.
      //
      // Override still gets both: a gated step that will never complete —
      // a section nobody can finish — is precisely what override exists for,
      // and hiding it from overriders leaves no route at all.
      if (['COMPLETE_STEP', 'APPROVE'].includes(action.actionKey)
            && vc.hasSections === true
            && vc.canOverride !== true) return false

      // ── AND THE MIRROR OF IT ───────────────────────────────────────
      //
      // An action that FIRES a section-completion event only means anything
      // on a step that HAS section gates. "Confirm assignments" was showing
      // on every step where the user held a task — including "Responders Fill
      // Questionnaires", where there is no gate to close and the step
      // completes itself on submit. The button could only fail there, and it
      // made the whole control look decorative: assign a question, nothing
      // needs confirming, assign another, still nothing.
      //
      // Data, not a name list: ui_actions.requires_section_gate. The two
      // confirm actions carry it; nothing else does, so nothing else moves.
      if (action.requiresSectionGate && vc.hasSections !== true) return false

      // ── AND WHICH STEP IT BELONGS TO ───────────────────────────────
      //
      // requires_section_gate above asks "does this step have sections?".
      // That is not the same question as "is this the step this action is
      // for", and on the vendor assessment both the assign step and the fill
      // step have sections — so "Confirm assignments" went on showing on
      // "Responders Fill Questionnaires", where there is no gate to close
      // and the responder's completion gesture is submitting their sections.
      //
      // allowed_step_actions is the question that was meant. Comma-separated
      // with OR semantics, the same shape as allowed_sides and
      // required_permission, so a screen designer learns one convention.
      //
      // Null or blank is "any step", which is what every row that predates
      // the column means — so this filter is additive and nothing else moves.
      //
      // Deliberately NOT applied when there is no step in play: a header
      // action opened from the record itself rather than from a task has no
      // step action to match, and hiding it there would make the record page
      // poorer than the inbox for no reason.
      if (action.allowedStepActions && String(action.allowedStepActions).trim() && vc.stepAction) {
        const allowed = String(action.allowedStepActions)
          .split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
        if (allowed.length && !allowed.includes(String(vc.stepAction).toUpperCase())) return false
      }

      // ── AND WHICH GATE IT CLOSES ───────────────────────────────────
      //
      // The most precise of the three scopes. requires_section_gate asks
      // "does this step have an open gate", allowed_step_actions asks "is
      // this the kind of step", and neither separates workflow 12's THREE
      // REVIEW steps from each other — a button scoped to REVIEW appears on
      // all of them, and for an action like "Assign risk rating" that is not
      // cosmetic, because its endpoint would set a rating from the wrong
      // step.
      //
      // completes_section_key names the gate itself, and openSectionKeys is
      // the list of gates this task still owes. So the button appears only
      // where it can do something and vanishes the moment it has, with no
      // step ids or workflow numbers written into the page.
      //
      // Hidden when openSectionKeys is absent AND the action declares a key:
      // no task, no step, no gate to close — a gate-firing action opened from
      // the record itself has nothing to fire. That is the opposite of the
      // allowed_step_actions rule above, deliberately: a header action with
      // no step is still a useful header action, while a gate-firing one
      // without a gate can only fail.
      if (action.completesSectionKey && String(action.completesSectionKey).trim()) {
        const open = Array.isArray(vc.openSectionKeys) ? vc.openSectionKeys : []
        const wanted = String(action.completesSectionKey).trim().toUpperCase()
        if (!open.some(k => String(k).trim().toUpperCase() === wanted)) return false
      }

      // Assignment-scoped actions: flagged in ui_actions.requires_assignment = true.
      // When set, the action is only visible if the entity reports the current user
      // is assigned (entity.isAssignedToCurrentUser returned by the GET endpoint).
      // No task context needed — the entity-level assignment IS the scope gate.
      //
      // ── PER-SIDE ANSWER WHEN THE ENTITY GIVES ONE ─────────────────────
      // isAssignedToCurrentUser is one boolean for the whole record, so on an
      // audit control a user holding both evidence and result permissions saw
      // BOTH buttons when only one side was theirs. An entity may now send
      // assignmentByPermission: { '<permission code>': true|false }, computed
      // by the same server guard that refuses the write. When the action's
      // requiredPermission is a key there, that answer decides — and it applies
      // with or without a task, because the server refuses a step actor too.
      // Entities that do not send the map behave exactly as before.
      const byPerm = entity?.assignmentByPermission
      const permScoped = !!(action.requiresAssignment && byPerm && action.requiredPermission
        && Object.prototype.hasOwnProperty.call(byPerm, action.requiredPermission))
      if (permScoped) {
        if (byPerm[action.requiredPermission] === false) return false
      } else if (action.requiresAssignment && !taskId) {
        if (entity?.isAssignedToCurrentUser === false) return false
      }
    } catch { /* statusFlowJson parse error — skip transition gate */ }
    // Screen Designer's per-role action visibility (roleAccessJson.actions)
    if (!isActionAllowed(roleAccess, currentSide, currentRoleIds, action.actionKey)) return false
    return true
  })
}

// embedded: rendered INSIDE a drawer (EntityDrawer) rather than as the page.
// The drawer used to be a second, hand-maintained implementation of this
// screen, and every gate, tab and action that was added here had to be ported
// there by hand — which is how they drifted (requires_assignment, section
// gates, task context, custom-tab props). Now the drawer renders THIS
// component, so whatever the full page shows, the drawer shows, through the
// same hooks. Embedded mode changes only what must not leak into the HOST
// page: the tab lives in ?drawerTab= instead of ?tab=, task context is kept in
// component state instead of the host's URL, nothing navigates the host away
// on its own, and the page chrome (breadcrumb, back button) is replaced by the
// drawer's own header.
function ModuleDetailView({ bp, id, entityType, embedded = false, onClose, drawerLevel = 0 }) {
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
  const [searchParams, setUrlSearchParams] = useSearchParams()
  // Task context (?taskId / ?stepInstanceId) is per RECORD. On the full page it
  // lives in the URL, exactly as before. In a drawer the URL belongs to the
  // host page — writing a control's task into an engagement page's URL would
  // hand the engagement the control's task — so the same reads and writes go to
  // local state instead. Every call site below is unchanged; only the target
  // of setSearchParams moves.
  const [embeddedParams, setEmbeddedParams] = useState(() => new URLSearchParams())
  const embeddedParamsRef = useRef(embeddedParams)
  embeddedParamsRef.current = embeddedParams
  const setSearchParams = useCallback((updater) => {
    if (!embedded) return setUrlSearchParams(updater)
    setEmbeddedParams(prev => (typeof updater === 'function'
      ? updater(new URLSearchParams(prev))
      : new URLSearchParams(updater)))
  }, [embedded, setUrlSearchParams])
  const taskParams     = embedded ? embeddedParams : searchParams
  const stepInstanceId = taskParams.get('stepInstanceId') || undefined
  const taskId         = taskParams.get('taskId') || undefined
  // An inbox row for an action item lands here with ?actionItemId= (and the
  // entityType/entityId lib/inboxRoute.js appends). Generic: any module whose
  // blueprint supports action items opens on that tab with the item focused,
  // unless the route already names a tab (a nav row may send the assignee to
  // the tab where the work is done).
  //
  // In a drawer stacked ABOVE the first one, the inbox params still describe
  // the first drawer's record, not this one.
  const actionItemId   = (embedded && drawerLevel > 0)
    ? undefined
    : (searchParams.get('actionItemId') || undefined)

  // Tab state lives in the URL, with the Redux app-tab store kept in sync.
  //
  // It used to live in Redux alone. That restored the tab when switching app
  // tabs, but Redux is memory: a browser refresh dropped every detail screen
  // back to Overview, and Back could not restore what the previous history
  // entry had been looking at. The URL survives both, and RouteSync already
  // stores `pathname + search` on the app tab, so writing here keeps the
  // app-tab behaviour working for free rather than replacing it.
  //
  // Redux is still written so that anything reading selectActiveSubTab
  // continues to see the current tab, and so an app tab restored from a route
  // that predates this change still has a sub-tab to fall back on.
  const dispatch       = useDispatch()
  const activeAppTabId = useSelector(selectActiveTabId)
  const savedSubTab    = useSelector(selectActiveSubTab)
  // Priority: explicit ?tab= (deep link, e.g. a comment notification) → the
  // app tab's remembered sub-tab → overview.
  // In a drawer the tab is ?drawerTab= — the host page keeps its own ?tab=,
  // and the list view's drawer has always used drawerTab too. Drawers stacked
  // above the first use ?drawerTab1=, ?drawerTab2=, … so each keeps its own.
  const [urlTab, setUrlTab] = useUrlState(
    embedded ? (drawerLevel > 0 ? `drawerTab${drawerLevel}` : 'drawerTab') : 'tab', '')
  const tab = urlTab
    || (actionItemId && bp?.supportsActionItems ? 'actions' : '')
    || (embedded ? '' : savedSubTab) || 'overview'
  const setTab = (key) => {
    // replace, not push: one history entry per record, so Back leaves the
    // record instead of walking backwards through every tab the user clicked.
    setUrlTab(key)
    // The app-tab store remembers the PAGE's sub-tab; a drawer must not
    // overwrite it.
    if (!embedded) dispatch(saveSubTab({ tabId: activeAppTabId, subTab: key }))
  }

  // ── Seamless task transition via WebSocket ─────────────────────────────────
  // When the backend assigns a new task to this user on this same entity
  // (because the previous step completed and advanced), the TASK_ASSIGNED
  // WebSocket event fires. We update the URL params in place — no inbox trip,
  // no polling, no page reload. Works for ALL modules generically:
  // Issues, Audit Projects, TPRM, anything on UniversalModulePage.

  // The sidebar's own query — shared cache, not a second request. Reusing the
  // real hook rather than a local copy, because its key includes userId and a
  // hand-rolled ['navigation'] key would silently miss that cache.
  const { data: navItems = [] } = useNavigation()

  const handleTaskAssigned = useCallback(({ taskId: newTaskId, stepInstanceId: newStepInstanceId, stepName, navKey, artifactId }) => {
    // Cross-page transition: navKey differs from current page blueprint navKey
    // e.g. user is on audit_project_detail, new task is on audit_engagement_detail
    //
    // ── WHY THIS LOOKS UP ui_navigation INSTEAD OF STRIPPING '_detail' ───────
    // This used to build the route as `/module/${navKey.replace('_detail','')}`.
    // Of the twelve distinct snap_nav_key values actually present in
    // step_instances, only four survive that: the rest produce routes that match
    // nothing.
    //   audit_project_list  → /module/audit_project_list/{id}   (a LIST key)
    //   issue_list          → /module/issue_list/{id}
    //   org_assessment_review → /module/org_assessment_review/{id}
    //   soc2_engagement_detail → /module/soc2_engagement/{id}   (no such entity)
    //   vendor_assessment_fill → /module/vendor_assessment_fill/{id}
    //                            (really /vendor/assessments/{id}/fill)
    // The vendor steps are the worst case: they are dedicated pages, not module
    // routes, so no amount of string surgery reaches them.
    //
    // ui_navigation.route is the authoritative mapping and already holds the
    // full path with :id. TaskInbox.resolveTaskRoute has always used it; this
    // handler was the odd one out.
    if (navKey && bp?.navKey && navKey !== bp.navKey && artifactId) {
      const qp  = `?taskId=${newTaskId}&stepInstanceId=${newStepInstanceId}`
      const nav = (navItems || []).find(n => n.navKey === navKey)

      if (nav?.route) {
        navigate(nav.route.replace(':id', artifactId) + qp)
        toast.success(`Next step: ${stepName || 'Step'}`, { icon: '→', duration: 3000 })
        return
      }

      // Two keys in step_instances have no ui_navigation row at all
      // (soc2_engagement_detail, vendor_assessment_select_template). Rather than
      // navigate somewhere wrong, tell the user the step moved and leave them
      // where they are — the task is in their inbox either way.
      console.warn('[TASK-ASSIGNED] No ui_navigation route for navKey:', navKey)
      toast.success(`Next step: ${stepName || 'Step'} — open it from My Tasks`,
        { icon: '→', duration: 5000 })
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
  }, [setSearchParams, taskId, navigate, bp?.navKey, navItems])


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
    const currentParams = embedded
      ? embeddedParamsRef.current
      : new URLSearchParams(window.location.search)
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
  }, [taskId, setSearchParams, embedded])

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

  const { data: entityRes, isLoading, isError, error: detailError } = useEntityDetail(bp.apiBasePath, id)
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

  // List page breadcrumb — navigate to the entity's own list.
  //
  // The route segment is :entityType (see App.jsx), and every other navigate()
  // in this file builds it from bp.entityType.toLowerCase(). This one used
  // bp.navKey instead, which is a NAVIGATION identifier and is often plural —
  // ui_navigation.nav_key for policies is 'audit_policies', so Back went to
  // /module/audit_policies, which matches no entity type and renders nothing.
  //
  // entityType is the authoritative segment; navKey is only a label/menu key.
  // listNavKey is still honoured first for the deliberate case where a module's
  // list lives under a different entity, but it now falls back to entityType
  // rather than to a nav key.
  //
  // Suppress when entity has a parent (scoped entity — list would be misleading).
  const listNavKey = !breadcrumbParentId
    ? (bp.listNavKey || bp.entityType?.toLowerCase() || null)
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

  // The host page already listens. A second listener here would navigate the
  // host away when a task arrives for the record inside the drawer.
  useUserTaskSocket(embedded ? null : currentUserId, {
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
    if (embedded) return   // the page's remembered sub-tab is not the drawer's
    dispatch(saveSubTab({ tabId: activeAppTabId, subTab: null }))
  }, [id]) // eslint-disable-line

  // Auto-select tab based on workflow step action when coming from a task.
  // Only fires once when vc.stepAction first resolves — doesn't override
  // user's manual tab clicks (useEffect dep is stepAction string, not vc object).
  useEffect(() => {
    if (!stepInstanceId || !vc.stepAction) return
    // A drawer opened on a named tab (an inbox route, a row's "open evidence")
    // stays on it.
    if (embedded && urlTab) return
    // Opened from an action item: that item is what the user came for. The
    // self-correct effect above can inject a task's stepInstanceId afterwards,
    // and without this the step's tab would replace the one the inbox chose.
    if (actionItemId) return

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
    //
    // ── VENDOR_ASSESSMENT NEEDS THE SIDE, NOT JUST THE ACTION ────────────
    // The TPRM workflow alternates sides and reuses the same step actions on
    // both. ASSIGN is the vendor CISO handing sections to responders at step 5
    // AND the org CISO handing questions to reviewers at step 10; REVIEW is a
    // vendor responder publishing answers AND an org reviewer consolidating.
    // Landing all four on one tab would put half of them on a screen with
    // nothing for them to do.
    //
    // vc carries stepAction but not the step's side — WorkflowAccessService
    // computes activeStepSide and does not return it. The logged-in user's own
    // side answers the same question here, because the only people who get a
    // task on a VENDOR step are vendor-side and the reverse holds too.
    const isVendor = currentSide === 'VENDOR'
    const entityTabOverrides = {
      AUDIT_PROJECT: {
        ASSIGN:      'engagements',  // Lead auditor assignment in Engagements tab
        FILL:        'engagements',  // Findings remediation etc. in Engagements tab
        REVIEW:      'engagements',
        APPROVE:     'engagements',
        ACKNOWLEDGE: 'engagements',
      },
      VENDOR_ASSESSMENT: {
        // Step 5 vendor CISO → Sections (the responder picker and Confirm).
        // Step 10 org CISO → Review (the reviewer picker lives per question).
        ASSIGN:   isVendor ? 'sections' : 'review',
        // Step 6 responders and contributors answer on the Questionnaire.
        // The one org-side FILL is step 2, template selection, which is a
        // header action and belongs on Overview.
        FILL:     isVendor ? 'fill'     : 'overview',
        // Steps 7 and 8 — "responders review and publish" and "CISO final
        // review". Sections rather than Questionnaire for both: it is the
        // screen with per-section progress and the Submit control, which is
        // what reviewing-then-publishing actually needs, and the questionnaire
        // is one click away. Org-side REVIEW is step 12, consolidating
        // findings, which is the Review tab.
        REVIEW:   isVendor ? 'sections' : 'review',
        // Steps 11 and 13, both org-side.
        EVALUATE: 'review',
        // Steps 4 and 15 are acknowledgements with no per-question work —
        // the action is in the header and Overview is the right context.
        ACKNOWLEDGE: 'overview',
        APPROVE:     'overview',
      },
    }

    const overrides = entityTabOverrides[bp?.entityType] || {}
    const target = overrides[vc.stepAction] ?? tabMap[vc.stepAction]
    if (target) setTab(target)
  }, [vc.stepAction, stepInstanceId, bp?.entityType, currentSide])

  // When opened from a task with no resolved stepAction yet, set a sensible
  // default tab so the page isn't blank while vc loads
  useEffect(() => {
    if (!stepInstanceId) return
    if (actionItemId) return   // see the effect above
    if (embedded && urlTab) return
    const entityDefaultTabs = {
      AUDIT_PROJECT:    'engagements',
      AUDIT_ENGAGEMENT: 'sections',
      // Sections is the safe landing for either side: it is the only tab that
      // renders something useful on every step of the workflow. The effect
      // above corrects it the moment vc.stepAction resolves.
      VENDOR_ASSESSMENT: 'sections',
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
  // The filter itself is filterScreenActions — shared with EntityDrawer, so the
  // drawer and this page can no longer drift apart on a security gate.
  const screenActions = useMemo(() => filterScreenActions({
    actions: screenConfig?.actions, entity, vc, bp, taskId,
    roleAccess, currentSide, currentRoleIds,
  }), [screenConfig?.actions, entity, vc, bp, taskId, roleAccess, currentSide, currentRoleIds])

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
      // Every workflow-enabled module carries workflowInstanceId, so this belongs
      // in the shared list rather than being special-cased for policies. Without
      // it the literal '{workflowInstanceId}' reached the server and came back as
      // "Failed to convert value of type String to required type Long".
      .replace('{workflowInstanceId}', entity?.workflowInstanceId ?? '')

    // An unresolved token means the action is misconfigured for this entity —
    // usually a field the module does not have. Better to say so than to send a
    // URL with braces in it and let the server reject it with a type error that
    // names neither the action nor the field.
    // Catch BOTH failure shapes: a token left unreplaced, and a token replaced
    // with nothing. The second is worse — it produces a valid-looking URL with an
    // empty path segment that the server answers with a confusing error rather
    // than a 404.
    if (url.includes('{') || url.includes('//', url.indexOf('://') + 3)) {
      toast.error(`${action.label}: this record has no value for one of the fields the action needs`)
      return
    }
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
      // WAS: vc.canAct && !vc.taskId. Arriving from the inbox always carries a
      // taskId, so the override path was unreachable for exactly the people who
      // hold the permission. canOverride answers it directly.
      //
      // !vc.taskId is kept deliberately: someone who holds BOTH a task and
      // override authority should complete the task normally, not silently
      // override their own step.
      const isOverridePath = isWorkflowTransition && !vc.taskId
            && vc.canOverride === true && vc.stepInstanceId
      if (isOverridePath) {
        await api.post(`/v1/workflow-instances/steps/${vc.stepInstanceId}/override`, {
          action: action.actionKey === 'COMPLETE_STEP' ? 'APPROVE' : action.actionKey,
          remarks: remarks || undefined,
        })
      } else {
        await api({ method: action.httpMethod || 'POST', url, data: payload })
      }
      // Awaited: without it the action button stops spinning the moment the
      // POST resolves, while the refetch that updates the screen is still in
      // flight — the same lag the Publish button had.
      await Promise.all([
        qcDetail.invalidateQueries({ queryKey: ['module-detail', bp.apiBasePath, id] }),
        qcDetail.invalidateQueries({ queryKey: ['view-context', bp.entityType, id] }),
        qcDetail.invalidateQueries({ queryKey: ['module-workflow', bp.entityType, id] }),
        qcDetail.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
      ])
      // Invalidate audit instance sub-tabs so they reflect result changes immediately
      if (bp.entityType === 'AUDIT_TEST_INSTANCE') {
        // Awaited: without it the action button stops spinning the moment the
        // POST resolves, while the refetch that updates the screen is still in
        // flight — the same lag the Publish button had.
        await Promise.all([
          qcDetail.invalidateQueries({ queryKey: ['test-inst-controls', Number(id)] }),
          qcDetail.invalidateQueries({ queryKey: ['ctrl-inst-tests'] })
        ])
      }
      if (bp.entityType === 'AUDIT_POLICY_INSTANCE') {
        // Awaited: without it the action button stops spinning the moment the
        // POST resolves, while the refetch that updates the screen is still in
        // flight — the same lag the Publish button had.
        await Promise.all([
          qcDetail.invalidateQueries({ queryKey: ['policy-inst-controls', Number(id)] }),
          qcDetail.invalidateQueries({ queryKey: ['ctrl-inst-policies'] })
        ])
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
        if (embedded) {
          // Same effect without leaving the host page: refetch instead of remount.
          await Promise.all([
            qcDetail.refetchQueries({ queryKey: ['module-detail', bp.apiBasePath, id] }),
            qcDetail.refetchQueries({ queryKey: ['view-context', bp.entityType, id] }),
          ])
          qcDetail.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
        } else {
        const base = bp.listScreenKey?.replace('_list','') || bp.entityType.toLowerCase().replace('_','')
        navigate(`/module/${base}/${id}`)
        }
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
      if (embedded) {
        qc.invalidateQueries({ queryKey: ['module-list', bp.apiBasePath] })
        onClose?.()
      } else {
      navigate(`/module/${bp.entityType.toLowerCase()}`)
      }
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
    // ── Platform-owned records: no collaboration surface ────────────────────
    // A global library record is read-only to this tenant, so the tabs that
    // exist to DO something with it are noise at best and misleading at worst:
    // Workflow shows a lifecycle they cannot advance, Evidence and Comments
    // invite contributions to a record they do not own, Versions and History
    // narrate a document maintained by someone else.
    //
    // Overview, Document and the mapping tabs stay — those are how a tenant
    // decides whether to adopt it. Once they customise, their own copy is
    // editable and gets the full set.
    //
    // editable is undefined on entities that do not report it (most modules),
    // so this only ever fires where the API says the record is not theirs.
    const PLATFORM_HIDDEN = ['workflow', 'evidence', 'comments', 'history', 'versions']
    const platformOwned = entity?.editable === false
    const afterOwnership = platformOwned
      ? merged.filter(t => !PLATFORM_HIDDEN.includes(t.key))
      : merged

    // Apply Screen Designer's per-role tab visibility (roleAccessJson.tabs).
    // Falls through to "allowed" for any tab/role combination that hasn't
    // been explicitly configured — existing screens are unaffected.
    return afterOwnership.filter(t => isTabAllowed(roleAccess, currentSide, currentRoleIds, t.key))
  }, [bp, vc, sdCustomTabs, sdLayout?.tabsJson, roleAccess, currentSide, currentRoleIds, entity?.editable])

  // Build field sections from blueprint schema
  let schema = { sections: [] }
  try { schema = JSON.parse(bp.fieldsSchemaJson || '{}') } catch {}

  if (isLoading || screenLoading || (overviewFormKey && overviewLoading)) return <LoadingState />
  if (isError)   return <ServerErrorState error={detailError} />
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
    const parentPath = (breadcrumbParentId && breadcrumbParentNavKey)
      ? `/module/${breadcrumbParentNavKey}/${breadcrumbParentId}`
      : null

    // If Back would land on exactly the page we are about to push, POP instead.
    // Pushing built a FRESH entry: no ?tab= in the URL (so the parent opened on
    // its default tab) and a new location.key with no saved scroll offset (so
    // the list opened at the top). A POP reuses the original entry and gets both
    // back. The push is still the fallback, because history may hold nothing -
    // opened from a notification, a bookmark or a new tab.
    const prev = previousEntry()
    if (prev && (!parentPath || prev.pathname === parentPath)) {
      navigate(-1)
      return
    }

    if (parentPath) {
      navigate(`${parentPath}${buildTaskParams()}`)
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

  const detailTitle = (
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
  )
  const detailActions = (
        <div className="flex items-center gap-2 flex-wrap">
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
              // Explicit text rather than a bare spinner beside the unchanged
              // label — "Approve" with a spinner reads as an unresponsive
              // button; "Approving…" reads as work in progress.
              loadingText={String(action.label || '').replace(/^\s*\+\s*/, '') + '…'}
              disabled={actingId != null && actingId !== action.id}
              icon={ActionIcon || undefined}
              onClick={() => handleActionClick(action)}
            >
              {(() => {
                // Same button, honest label. When this click will take the
                // override path — the user has authority here but no task — say
                // "Override step" rather than "Complete step": they are forcing
                // it past work that is not done, and the record will name them.
                const willOverride = ['APPROVE','REJECT','SEND_BACK','COMPLETE_STEP']
                      .includes(action.actionKey)
                      && !vc.taskId && vc.canOverride === true && vc.stepInstanceId
                if (willOverride) return 'Override step'
                try { const m = JSON.parse(action.payloadTemplateJson||'{}'); return m.__label || action.label }
                catch { return action.label }
              })()}
            </Button>
            )
          })}
          {/* Edit button hidden — overview fields are now inline-editable on click (Wrike-style) */}
          {canDelete && (
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => setDeleteTarget(entity)} />
          )}
        </div>
  )
  const detailBody = (
    <>
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
      {/* sticky: the tab strip stays put while the tab body scrolls.
          On a 116-control engagement the tabs scrolled away immediately and
          switching tabs meant scrolling back to the top first.
          glass-chrome, not bg-surface: it is the app's chrome/toolbar glass
          (blur + saturate over --glass-bg) and already degrades to solid via
          the @supports fallback where backdrop-filter is unavailable. A flat
          bg-surface read as a hard band against everything around it. */}
      <div className="sticky top-0 z-10 glass-chrome flex items-center gap-1 px-6 border-b border-border overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
          <CapabilityTabBody tab={tab} bp={bp} id={id} entity={entity} vc={vc}
            focusActionItemId={actionItemId} />
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
            // Side and role decide what a vendor-assessment tab shows. Option
            // scores and reviewer verdicts are org-side, and QuestionDrawer
            // chooses between its "Vendor notes" and "Org notes" channels — and
            // whether evidence is uploadable — from userSide. Undefined reads as
            // org, so a vendor was getting the org channel and a read-only
            // uploader. Both are already in scope here (lines 1527, 1605).
            userSide={currentSide}
            userRole={auth?.roles?.[0]?.name || auth?.roles?.[0]?.roleName}
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
        // {taskId} and {stepInstanceId} too, not just {id}.
        //
        // The non-form action path at executeAction has interpolated all four
        // since it was written; this one substituted two and shipped the other
        // two to the server as the literal text "{taskId}". Nothing noticed
        // because no seeded form action had ever needed a task — and every
        // section-gate action does, since taskId is how the server knows which
        // task's gate to close.
        const submitUrl = (detailFormAction.apiEndpoint || '')
          .replace('{id}', id)
          .replace('{entityId}', id)
          .replace('{taskId}', taskId || '')
          .replace('{stepInstanceId}', stepInstanceId || '')
        return (
          <Modal open onClose={() => setDetailFormAction(null)}
            title={detailFormAction.label}
            /*
              __modalSize lets a seeded action choose its own width, which
              matters for a form whose only field is a lookup: the results panel
              needs room, and a two-field form in a max-w-2xl box reads as an
              empty dialog with a dropdown stuck to the bottom of it.

              Accepted values are Modal's own: sm | md | lg | xl | full.
              Anything else, or nothing at all, keeps the previous default of
              'lg' — so every action seeded before this change renders
              identically.
            */
            size={['sm','md','lg','xl','full'].includes(meta.__modalSize) ? meta.__modalSize : 'lg'}
          >
            <DynamicForm
              formKey={formKey}
              defaultValues={{ entityId: id, entityType: bp.entityType }}
              onSubmit={async (data) => {
                try {
                  setActingId(detailFormAction.id)
                  await api({ method: detailFormAction.httpMethod || 'POST', url: submitUrl, data })
                  // Awaited: without it the action button stops spinning the moment the
                  // POST resolves, while the refetch that updates the screen is still in
                  // flight — the same lag the Publish button had.
                  await Promise.all([
                    qcDetail.invalidateQueries({ queryKey: ['module-detail', bp.apiBasePath, id] }),
                    qcDetail.invalidateQueries({ queryKey: ['view-context', bp.entityType, id] })
                  ])
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
    </>
  )

  // ── Drawer shell: same actions, same body, compact header ─────────────────
  // No breadcrumb or back button — those navigate the HOST page. The drawer's
  // own frame (EntityDrawer) carries Close and Open full page.
  if (embedded) return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-5 pt-3 pb-3 border-b border-border shrink-0 flex flex-col gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {breadcrumbParentLabel && (
            <>
              <span className="text-[11px] text-text-muted truncate max-w-[200px]" title={breadcrumbParentLabel}>
                {breadcrumbParentLabel}
              </span>
              <span className="text-text-muted/40 shrink-0">/</span>
            </>
          )}
          <span className="text-sm font-semibold text-text-primary truncate">{entityLabel}</span>
          {entity?.status && <EntityStatusBadge status={entity.status} />}
        </div>
        {detailActions}
      </div>
      {/* The scroll container — the tab strip inside detailBody is sticky
          against this, exactly as it is against the page on the full view. */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        {detailBody}
      </div>
    </div>
  )

  return (
    <PageLayout title={detailTitle} actions={detailActions}>
      {detailBody}
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

function CustomTabContent({ tabKey, detailScreenKey, entity, entityType, apiBasePath, vc, userSide, userRole, stepInstanceId, taskId, onTaskComplete }) {
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
    'fieldwork',
    // 'fill' and 'review' render from components/vendor, so their form key does
    // not exist. This Set gates `enabled` on the form query below, and that hook
    // runs BEFORE the dispatch returns because hooks sit at the top of the
    // component — so without them both tabs fire
    // uiConfigApi.form('vendor_assessment_detail_tab_fill') and take a 404 every
    // time they open. Invisible on screen, noisy in the log.
    'fill', 'review', 'my-review', 'my_review',
    // VENDOR detail tabs — same reason: they render from components/vendor, so
    // their form key does not exist and the query would 404 on every open.
    'assessments', 'team', 'contracts',
    // Report VERSIONS, rendered by AssessmentReportsTab. Same reason again:
    // there is no vendor_assessment_detail_tab_reports form to fetch.
    'reports',
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
 
  // ── VENDOR — the three bespoke detail tabs ──────────────────────────────
  // Overview stays generic (it renders from the vendor_detail_tab_overview
  // form), and Workflow, Action items, Evidence, Comments and History are
  // capability tabs from the blueprint's supports_* flags. These three are the
  // ones with no generic equivalent.
  if (entityType === 'VENDOR') {
    if (tabKey === 'assessments') return <VendorAssessmentsTab entity={entity} vc={vc} />
    if (tabKey === 'team')        return <VendorTeamTab        entity={entity} vc={vc} />
    if (tabKey === 'contracts')   return <VendorContractsTab   entity={entity} vc={vc} />
  }

  // VENDOR_ASSESSMENT — the v2 assessment tabs
  //
  // Three additions to what was here:
  //
  //   entity    — the Sections tab reads entity.sections. GET /v1/assessments/{id}
  //               already returns the whole tree (buildSectionInstances), so with
  //               it the tab makes no request of its own; without it, it falls
  //               back to fetching the same data, one extra round trip.
  //   userSide  — see the note at the CustomTabContent call site.
  //   findings  — the fourth tab.
  if (entityType === 'VENDOR_ASSESSMENT') {
    const props = {
      assessmentId: entity?.id,
      entity,
      vc, userSide, userRole,
      stepInstanceId, taskId, onTaskComplete,
    }
    if (tabKey === 'sections') return <AssessmentSectionsTab {...props} />
    if (tabKey === 'fill')     return <AssessmentFillTab     {...props} />
    if (tabKey === 'review')   return <AssessmentReviewTab   {...props} />
    // Same component, scoped to the viewer's own reviewer-assigned questions.
    // The org side had one evaluation surface — the whole assessment — so a
    // review assistant with three questions out of forty had to hunt for them.
    // The vendor side has had the equivalent all along: Sections is everything,
    // Questionnaire is what is yours. This is that pair, completed.
    if (tabKey === 'my-review' || tabKey === 'my_review')
      return <AssessmentReviewTab {...props} scope="mine" />
    if (tabKey === 'findings') return <AssessmentFindingsTab {...props} />
    if (tabKey === 'reports')  return <AssessmentReportsTab  {...props} />
  }

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
  // AUDIT_ENGAGEMENT — this engagement's part of the Collaboration plan
  // (items linked to it in a workspace plan, and everything under them).
  if (tabKey === 'timeline' && entityType === 'AUDIT_ENGAGEMENT') {
    return <EngagementTimelineTab engagementId={entity?.id} />
  }

  // AUDIT_CONTROL_INSTANCE — combined auditor work surface (tests + policies).
  // Additive: the Tests and Policies tabs below stay exactly as they were.
  if (tabKey === 'fieldwork' && entityType === 'AUDIT_CONTROL_INSTANCE') {
    return <ControlFieldworkTab controlInstanceId={entity?.id} entity={entity} vc={vc} />
  }

  // AUDIT_CONTROL_INSTANCE — tests and policies tabs use instance-level endpoints
  if (tabKey === 'tests' && entityType === 'AUDIT_CONTROL_INSTANCE') {
    return <ControlInstanceTestsTab controlInstanceId={entity?.id} vc={vc} />
  }
  if (tabKey === 'policies' && entityType === 'AUDIT_CONTROL_INSTANCE') {
    return <ControlInstancePoliciesTab controlInstanceId={entity?.id} vc={vc} />
  }
  if (tabKey === 'evidence' && entityType === 'AUDIT_CONTROL_INSTANCE') {
    return <ControlInstanceEvidenceTab controlInstanceId={entity?.id} entity={entity} vc={vc} />
  }

  // AUDIT_TEST_INSTANCE — mapped controls (Vanta-style: all controls this test covers)
  if (tabKey === 'mapped-controls' && entityType === 'AUDIT_TEST_INSTANCE') {
    return <TestInstanceMappedControlsTab testInstanceId={entity?.id} testResult={entity?.testResult} vc={vc} />
  }

  // AUDIT_POLICY (library) — the document itself, rendered rather than shown as
  // raw markup in an Overview field. Accepts either tab key so it works whether
  // tabs_json calls it 'content' or reuses 'policy-content'.
  if ((tabKey === 'content' || tabKey === 'policy-content') && entityType === 'AUDIT_POLICY') {
    return <PolicyDocumentTab entity={entity} />
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
        // Ownership, not vc.canEdit.
        //
        // vc.canEdit is computed as effectivePermissions.contains(entityPrefix +
        // ".edit") — i.e. "audit.policy.edit", DOT style. Every permission this
        // platform actually seeds is colon style ("audit:policy:read"), so
        // vc.canEdit is false for every non-system user on a library screen and
        // the Add/Remove buttons never appeared, even on a policy the tenant
        // owns outright. That is the two-naming-conventions problem, not a
        // deliberate restriction.
        //
        // entity.editable is the honest gate here: it is exactly what the server
        // enforces (requireOwnedPolicy on unlink, tenant stamping on link), so
        // the UI now offers precisely the actions that will succeed. A platform
        // policy stays read-only; the tenant's own copy is editable.
        canEdit={entity?.editable !== false}
        origin={entity?.origin}
        // previousVersionId is set by customisePolicy and points at the platform
        // row this copy supersedes — used only to word the note accurately.
        supersedes={entity?.previousVersionId != null}
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
        // NOT entity.editable here — that is the CONTROL's ownership, and controls
        // are platform-owned, so gating on it would block the one thing a tenant
        // is meant to do from this screen: attach their own policy to a global
        // control. linkControlPolicy stamps the mapping with their tenant and
        // never touches the control, so the write is legitimately theirs.
        //
        // Removal is gated per row instead (policyUnlinkable), because unlinking
        // a PLATFORM policy is what the server refuses.
        canEdit
      />
    )
  }

  // TRAINING — course content, with upload. This was linked-items through the
  // generic tab plus a form whose s3Key field was a text box, and nothing in
  // the browser could produce an S3 key. Uploading needs a file picker,
  // progress, and the duration read off the video element, so it is a
  // component rather than a form.
  if (tabKey === 'items' && entityType === 'TRAINING_COURSE') {
    return <TrainingContentTab entity={entity} canEdit={vc?.canEdit !== false} />
  }

  // TRAINING — the player is the one tab in that module that cannot be a form:
  // a video with progress heartbeats, a graded quiz and an attestation. Its
  // sibling tabs (linked-items, linked-questions, linked-assignments) all go
  // through the generic branch below, so this is the module's only exception.
  if (tabKey === 'player' && entityType === 'TRAINING_ASSIGNMENT') {
    return <TrainingPlayerTab entity={entity} />
  }

  // GENERIC — any tab key of the form `linked-<suffix>` renders the related
  // records from {apiBasePath}/{id}/<tabKey>. One branch serves every module:
  // adding a "Linked assets" tab becomes a seed row plus a backend endpoint,
  // with no frontend change at all.
  //
  // apiBasePath, not bp — CustomTabContent is passed apiBasePath and
  // entityType, never the blueprint itself. linked-findings is excluded so the
  // older ISSUE branch below keeps its behaviour unchanged.
  if (typeof tabKey === 'string' && tabKey.startsWith('linked-') && tabKey !== 'linked-findings') {
    return <LinkedEntitiesTab apiBasePath={apiBasePath} entity={entity} tabKey={tabKey} />
  }

  // ISSUE — linked findings tab (audit findings linked to this issue)
  if ((tabKey === 'linked-findings' || tabKey === 'linked_findings') && entityType === 'ISSUE') {
    return <IssueFindingsTab issueId={entity?.id} />
  }

    // RISK — controls that treat this risk, with observed effectiveness.
  // 'controls' is in CUSTOM_RENDERED_TABS, so the generic form fetch is
  // already suppressed for this key; without this branch the tab renders
  // "No fields configured for this tab".
  if (tabKey === 'controls' && entityType === 'RISK') {
    return <RiskControlsTab riskId={entity?.id} entity={entity} canEdit={vc?.canEdit !== false} />
  }

  // RISK — issues raised against this risk. 'issues' is NOT in
  // CUSTOM_RENDERED_TABS, so without this branch the generic path fetches
  // risk_detail_tab_issues, 404s, and falls through to the same dead panel.
  if (tabKey === 'issues' && entityType === 'RISK') {
    return <RiskIssuesTab riskId={entity?.id} />
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
    let cancelled = false
    // Users: batched with every other user field/cell on the page into one
    // GET /v1/users/lookup call (lib/userLookup) instead of a full user load each.
    if (basePath === '/v1/users') {
      getUserLabel(valueStr).then(l => { if (!cancelled) setLabel(l || null) })
      return () => { cancelled = true }
    }
    const resolvedPath = `${basePath}/${valueStr}`
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
/**
 * @param error  the failed query's error, so the message can tell the truth.
 *
 * This used to say "the server is not responding" for every failure. The most
 * common real cause was a 403 — an external auditor opening a task belonging to
 * a client they were not currently switched into. Telling them the server is
 * down on a task the platform put in their own inbox sends them to reload,
 * which cannot help, instead of to the one control that can.
 */
function ServerErrorState({ error }) {
  const navigate     = useNavigate()
  // The axios interceptor rejects with the API error body, not the axios error,
  // so error.response does not exist here — reading it was why every 403 still
  // rendered as "the server is not responding". status is now carried through
  // by the interceptor; code is the fallback when it is not (older callers,
  // or an error surfaced from somewhere that never touched HTTP).
  const status       = error?.status
  const code         = error?.code
  const serverMsg    = error?.message
  const memberships  = useSelector(st => st.auth.memberships) || []
  const activeTenant = useSelector(st => st.auth.tenantId)
  const switchTenant = useSwitchTenant({ silent: true })

  const forbidden = status === 403
    || /ACCESS_DENIED|NOT_ACCESSIBLE|ADMIN_ONLY|MEMBERSHIP_INACTIVE|FORBIDDEN/.test(code || '')

  // The server names the owning tenant when the caller already holds a usable
  // membership there. That is the authoritative answer — it beats searching the
  // task inbox (which misses tasks held by someone else and opened under
  // override authority) and it beats asking a firm with ten clients to guess.
  const ownerTenantId = error?.details?.tenantId ?? null
  const canAutoSwitch = forbidden
    && ownerTenantId != null
    && Number(ownerTenantId) !== Number(activeTenant)

  const autoFired = useRef(false)
  useEffect(() => {
    if (!canAutoSwitch || autoFired.current) return
    autoFired.current = true            // one token reissue, not one per render
    switchTenant.mutate(Number(ownerTenantId))
  }, [canAutoSwitch, ownerTenantId]) // eslint-disable-line

  if (canAutoSwitch) {
    const name = memberships.find(m => Number(m.tenantId) === Number(ownerTenantId))?.tenantName
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <div className="w-8 h-8 rounded-full border-2 border-border border-t-brand-500 animate-spin" />
        <p className="text-sm text-text-secondary">Opening in {name || 'the right organisation'}…</p>
        <p className="text-xs text-text-muted max-w-xs">
          This record belongs to another organisation you work with, so your workspace is switching to it.
        </p>
      </div>
    )
  }
  // Only offer a switch when there is somewhere to switch TO. A guest denied by
  // engagement scope is already in the right tenant, and offering to switch
  // would send them round a loop that ends in the same 403.
  const otherOrgs = memberships.filter(m => Number(m.tenantId) !== Number(activeTenant))
  const scopeDenied = code === 'ENGAGEMENT_NOT_ACCESSIBLE' || code === 'ISSUE_NOT_ACCESSIBLE'
  const offerSwitch = forbidden && !scopeDenied && otherOrgs.length > 0

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
      <div className="w-12 h-12 rounded-card bg-status-fail-bg border border-status-fail-bd flex items-center justify-center">
        {forbidden
          ? <Lock size={20} className="text-status-fail-fg" strokeWidth={1.5} />
          : <ServerCrash size={20} className="text-status-fail-fg" strokeWidth={1.5} />}
      </div>
      <div>
        <p className="text-sm font-medium text-text-secondary">
          {forbidden ? 'You do not have access to this record' : 'Could not load this page'}
        </p>
        <p className="text-xs text-text-muted mt-1 max-w-sm">
          {forbidden
            ? (serverMsg || 'Your current organisation does not have access to this record.')
            : 'The server is not responding. It may be restarting — please try again in a moment.'}
        </p>
        {offerSwitch && (
          <p className="text-xs text-text-muted mt-2 max-w-sm">
            {/* Reaching this means the tenant could not be determined automatically —
                no ?t= on the route and no matching task in the inbox (an old link, or
                a record opened outside a task). Picking from a list is the fallback,
                not the normal path. */}
            We could not work out which organisation this belongs to. Pick one, or
            open it from My Tasks instead.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {offerSwitch
          ? otherOrgs.slice(0, 3).map(m => (
              <Button key={m.tenantId} size="sm" variant="secondary"
                disabled={switchTenant.isPending}
                onClick={() => switchTenant.mutate(Number(m.tenantId))}>
                Open in {m.tenantName || `organisation ${m.tenantId}`}
              </Button>
            ))
          : !forbidden && (
              <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
                Reload page
              </Button>
            )}
        <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    </div>
  )
}

// ─── EntityDrawer ─────────────────────────────────────────────────────────────
// The drawer is the detail page, embedded.
//
// It used to be an independent implementation of the same screen (own entity
// query, own view-context query without task context, own action filter, own
// tab set, custom tabs with taskId/stepInstanceId hard-wired to undefined), and
// every fix made to the detail page had to be remembered here too. It was not,
// which is how a requires_assignment button came to be hidden on the page and
// shown in the drawer.
//
// So this is now only a frame — overlay, slide-in panel, Close, Open full page,
// Escape — around ModuleDetailView in embedded mode. Same hooks, same cache
// keys, same tabs, same header actions, same guards: what a user can see and do
// on the full page is what they can see and do here.
//
// Wider than the old 520px property grid (the full screen's tabs need room),
// but narrow enough that the list it was opened from stays visible beside it —
// 1040px covered most of the engagement's Controls tab, which is the point of
// opening a drawer instead of the page. Full page is one click away.
const ENTITY_DRAWER_MAX_WIDTH = 'min(800px, 92vw)'

// ── Stacking and motion ──────────────────────────────────────────────────────
// A drawer opened from inside another drawer stacks ON TOP of it (see
// hooks/useEntityDrawer.js). Each level above the first is a little narrower,
// so the edge of the drawer underneath stays visible on the left — the user
// can see that closing this one returns them there — and sits one step higher.
// z-index stays below 70: DynamicForm's portalled dropdowns use z-[70].
//
// Motion is a transform transition driven from state, not a CSS keyframe
// class: it slides in when the drawer MOUNTS and slides out before an
// explicit close (button, overlay, Escape). Switching the record inside a
// level, or a drawer opening above, never re-runs it — the panel underneath
// stays put instead of blinking out and back.
const DRAWER_ANIM_MS = 220
const drawerMaxWidth = (level) => level > 0
  ? `min(${800 - 48 * level}px, ${92 - 4 * level}vw)`
  : ENTITY_DRAWER_MAX_WIDTH
const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

// Escape closes the TOPMOST open drawer only. Every drawer registers itself in
// mount order (lower drawers — and the list view's own drawer — mount first).
const openDrawerTokens = []

function EntityDrawer({ entityId, bp, onClose, onOpenFull, level = 0, entityType, bpError = false }) {
  const [shown,   setShown]   = useState(false)
  const [leaving, setLeaving] = useState(false)
  const leaveTimer = useRef(null)

  // Slide in on mount: render off-screen first, then transition in.
  useEffect(() => {
    let inner = 0
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setShown(true)) })
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
  }, [])
  useEffect(() => () => clearTimeout(leaveTimer.current), [])

  // Slide out, then close (the close removes this drawer from the URL).
  const requestClose = useCallback(() => {
    if (leaveTimer.current) return
    if (prefersReducedMotion()) { onClose(); return }
    setLeaving(true)
    leaveTimer.current = setTimeout(() => { onClose() }, DRAWER_ANIM_MS)
  }, [onClose])

  // Escape to close — topmost drawer only
  useEffect(() => {
    const token = {}
    openDrawerTokens.push(token)
    const h = (e) => {
      if (e.key === 'Escape' && openDrawerTokens[openDrawerTokens.length - 1] === token) requestClose()
    }
    window.addEventListener('keydown', h)
    return () => {
      window.removeEventListener('keydown', h)
      const i = openDrawerTokens.indexOf(token)
      if (i >= 0) openDrawerTokens.splice(i, 1)
    }
  }, [requestClose])

  const visible = shown && !leaving
  const motion  = `${DRAWER_ANIM_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
  const label   = bp?.displayName
    || String(entityType || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <>
      <div className={cn('fixed inset-0 bg-on-dark-inv/20', level === 0 && 'backdrop-blur-[1px]')}
        style={{ zIndex: level === 0 ? 40 : 49 + 2 * level, opacity: visible ? 1 : 0, transition: `opacity ${motion}` }}
        onClick={requestClose} aria-hidden="true" />

      <div className="fixed right-0 top-0 h-full w-full bg-surface border-l border-border
                      flex flex-col shadow-2xl"
        style={{
          maxWidth:   drawerMaxWidth(level),
          zIndex:     50 + 2 * level,
          transform:  visible ? 'translateX(0)' : 'translateX(100%)',
          transition: `transform ${motion}`,
          willChange: 'transform',
        }}>

        {/* Frame bar — always present, so the drawer can be closed while the
            record is still loading or failed to load. */}
        <div className="flex items-center justify-between gap-3 px-5 py-2 border-b border-border shrink-0 bg-surface-secondary/40">
          <span className="text-[10px] font-mono text-text-muted truncate">
            {label} #{entityId}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {bp && (
              <button onClick={onOpenFull}
                className="flex items-center gap-1.5 text-[11px] text-brand-ink hover:text-brand-ink
                           border border-brand-500/25 hover:border-brand-500/50 rounded-ctl
                           px-2.5 py-1.5 transition-colors font-medium">
                <ExternalLink size={11} /> Full page
              </button>
            )}
            <button onClick={requestClose} aria-label="Close"
              className="p-1.5 rounded-ctl text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {bp ? (
            /* key: switching the drawer from one record to another must not
               carry the previous record's local task context across. */
            <ModuleDetailView key={`${bp.entityType}:${entityId}`}
              bp={bp} id={entityId != null ? String(entityId) : entityId}
              entityType={bp.entityType} embedded onClose={requestClose} drawerLevel={level} />
          ) : (
            // The record type's blueprint is still loading (first open of that
            // type) — show the frame with a spinner rather than nothing.
            <div className="h-full flex items-center justify-center gap-2 text-xs text-text-muted">
              {bpError
                ? 'This record could not be opened.'
                : <><RefreshCw size={16} className="animate-spin" /> Loading…</>}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── URL-driven drawers for ANY entity type ───────────────────────────────────
// A tab on one record can open another record's drawer without leaving the page
// — an engagement's Controls tab opens a control; a control's Tests tab opens a
// test — through hooks/useEntityDrawer.js. Drawers opened from inside a drawer
// STACK: the test opens over the control, and closing the test leaves the
// control's drawer where it was. Being in the URL, the stack is deep-linkable:
// an inbox row for a delegated control lands on the engagement's Controls tab
// with that control's drawer open on the right tab, and Back closes the top
// drawer.
//
// The URL shape, the ?entityId= fallback for inbox routes and the close rules
// live in hooks/useEntityDrawer.js, next to the hook that writes them.
//
// Each level is keyed by its POSITION, not its record: a drawer that opens
// above leaves the ones underneath mounted (no blank, no re-animation), and a
// level whose record changes (Back from one record to another) swaps its
// content in place.
function UrlEntityDrawerHost() {
  const [searchParams, setSearchParams] = useSearchParams()
  const levels = readDrawerLevels(searchParams)

  const closeLevel = useCallback((level) => {
    setSearchParams(prev => closeDrawerLevel(prev, level), { replace: false })
  }, [setSearchParams])

  if (levels.length === 0) return null

  return levels.map(lv => (
    <UrlEntityDrawerLevel key={lv.level} {...lv} onCloseLevel={closeLevel} />
  ))
}

function UrlEntityDrawerLevel({ type, id, level, tabKey, onCloseLevel }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Every level loads its own type's blueprint. A level that is already open
  // keeps rendering from its cached one while a new level above loads — the
  // old single drawer returned null here, which is what blanked the screen.
  const { data: bpRes, isError } = useBlueprint(type)
  const res = bpRes?.data || bpRes
  const drawerBp = res?.entityType ? res : null

  const onClose = useCallback(() => onCloseLevel(level), [onCloseLevel, level])

  return (
    <EntityDrawerLevelContext.Provider value={level}>
      <EntityDrawer
        entityId={id}
        bp={drawerBp}
        entityType={type}
        bpError={isError}
        level={level}
        onClose={onClose}
        onOpenFull={() => {
          if (!drawerBp) return
          const tab = searchParams.get(tabKey)
          const qp = new URLSearchParams()
          if (tab) qp.set('tab', tab)
          // The inbox focus params belong to the first drawer only.
          const actionItemId = level === 0 ? searchParams.get('actionItemId') : null
          if (actionItemId) qp.set('actionItemId', actionItemId)
          const q = qp.toString()
          navigate(`/module/${drawerBp.entityType.toLowerCase()}/${id}${q ? `?${q}` : ''}`)
        }}
      />
    </EntityDrawerLevelContext.Provider>
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