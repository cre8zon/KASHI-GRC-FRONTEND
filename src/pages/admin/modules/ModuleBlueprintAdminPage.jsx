import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, Search, ChevronRight, ChevronDown,
  Layers, Settings, Eye, EyeOff, GripVertical, Code2,
  CheckCircle2, XCircle, Zap, FileText, MessageSquare,
  Upload, GitBranch, Navigation, Globe, Lock, RefreshCw,
  ArrowRight, Info, AlertTriangle, Sparkles,
} from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { cn } from '../../../lib/cn'
import toast from 'react-hot-toast'
import { moduleBlueprintsApi } from '../../../api/moduleBlueprints.api'
import { uiAdminApi } from '../../../api/uiConfig.api'


// ─── Hooks ───────────────────────────────────────────────────────────────────

const useBlueprints = (params) => useQuery({
  queryKey: ['module-blueprints', params],
  // Don't send `search=` (empty string) — some backends filter on blank strings.
  // keepPreviousData is removed: deprecated in React Query v5 (use placeholderData if needed).
  queryFn: () => moduleBlueprintsApi.list(
    params?.search ? params : { ...params, search: undefined }
  ),
})
const useBlueprintDetail = (id) => useQuery({
  queryKey: ['module-blueprint', id],
  queryFn: () => moduleBlueprintsApi.get(id),
  enabled: !!id,
})

// ─── Hooks (continued) ─────────────────────────────────────────────────────
const useScreenActions = (screenKey) => useQuery({
  queryKey: ['admin-screen-actions', screenKey],
  queryFn: () => uiAdminApi.actions.list({ screen: screenKey, take: 100 }),
  enabled: !!screenKey,
  staleTime: 60_000,
})

// ─── Constants ───────────────────────────────────────────────────────────────

const ICON_OPTIONS = [
  'ShieldAlert','ClipboardCheck','AlertTriangle','FileText','Scale','BookOpen',
  'Building2','Users','Briefcase','Target','TrendingUp','Activity',
  'CheckSquare','Eye','Flag','Layers','Database','Globe',
]
const COLOR_OPTIONS = ['red','amber','blue','green','purple','teal','orange','pink']
const SIDES = ['ORGANIZATION','SYSTEM','VENDOR','AUDITOR','AUDITEE']
const FIELD_TYPES = [
  'TEXT','EMAIL','NUMBER','DECIMAL','SELECT','MULTI_SELECT',
  'TOGGLE','TEXTAREA','DATE','DATE_RANGE','FILE','SECTION_HEADER','DIVIDER',
]

const EMPTY_BLUEPRINT = {
  entityType: '', displayName: '', displayNamePlural: '', icon: 'Layers',
  colorTag: 'blue', apiBasePath: '', listScreenKey: '', detailScreenKey: '',
  createFormKey: '', editFormKey: '', workflowEligibility: '',
  allowedSides: 'ORGANIZATION,SYSTEM',
  supportsActionItems: true, supportsDocuments: true,
  supportsComments: true, supportsWorkflow: true,
  showInNav: true, sortOrder: 0, navKey: '',
  fieldsSchemaJson: JSON.stringify({ sections: [] }, null, 2),
  statusFlowJson: JSON.stringify({ statuses: [], transitions: [] }, null, 2),
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ModuleBlueprintAdminPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [detailTab, setDetailTab] = useState('overview')

  const { data, isLoading } = useBlueprints({ search })
  // Handles both shapes: axios-unwrapped ApiResponse { data: { items } }
  // and double-wrapped { data: { data: { items } } } if interceptor is absent.
  const blueprints = data?.data?.items
    || data?.data?.data?.items
    || data?.items
    || (Array.isArray(data?.data?.data) ? data.data.data : null)
    || (Array.isArray(data?.data) ? data.data : null)
    || (Array.isArray(data) ? data : null)
    || []
  const { data: detail, isLoading: loadingDetail } = useBlueprintDetail(selected?.id)

  const createMut = useMutation({
    mutationFn: moduleBlueprintsApi.create,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['module-blueprints'] })
      toast.success('Module blueprint created')
      setModalOpen(false)
      setSelected(res.data || res)
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => moduleBlueprintsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['module-blueprints'] })
      qc.invalidateQueries({ queryKey: ['module-blueprint', selected?.id] })
      toast.success('Updated')
      setModalOpen(false)
      setEditing(null)
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => moduleBlueprintsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['module-blueprints'] })
      toast.success('Deleted')
      setDeleteTarget(null)
      if (selected?.id === deleteTarget?.id) setSelected(null)
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
  const activateMut = useMutation({
    mutationFn: (id) => moduleBlueprintsApi.activate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['module-blueprints'] }); qc.invalidateQueries({ queryKey: ['module-blueprint', selected?.id] }); toast.success('Activated') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })
  const deactivateMut = useMutation({
    mutationFn: (id) => moduleBlueprintsApi.deactivate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['module-blueprints'] }); qc.invalidateQueries({ queryKey: ['module-blueprint', selected?.id] }); toast.success('Deactivated') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  const bp = detail?.data || detail

  return (
    <PageLayout
      title="Module blueprints"
      subtitle="Define zero-code GRC modules — each blueprint creates a fully functional module without code deployment"
      actions={
        <Button icon={Plus} size="sm" onClick={() => { setEditing(null); setModalOpen(true) }}>
          New module
        </Button>
      }
    >
      <div className="flex h-full overflow-hidden">
        {/* Left: Blueprint list */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search modules…"
                className="w-full pl-8 pr-3 h-7 text-xs bg-surface-overlay border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading
              ? <div className="p-4 text-xs text-text-muted">Loading…</div>
              : blueprints.length === 0
                ? (
                  <div className="p-6 flex flex-col items-center gap-3 text-center">
                    <Layers size={28} className="text-text-muted" />
                    <div>
                      <p className="text-xs font-medium text-text-secondary">No modules yet</p>
                      <p className="text-[11px] text-text-muted mt-0.5">Create your first module blueprint</p>
                    </div>
                    <Button size="sm" icon={Plus} onClick={() => { setEditing(null); setModalOpen(true) }}>Create module</Button>
                  </div>
                )
                : blueprints.map(bp => (
                  <button key={bp.id}
                    onClick={() => { setSelected(bp); setDetailTab('overview') }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/50',
                      selected?.id === bp.id
                        ? 'bg-brand-500/8 border-l-2 border-l-brand-500'
                        : 'hover:bg-surface-overlay border-l-2 border-l-transparent'
                    )}
                  >
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold',
                      `bg-${bp.colorTag || 'blue'}-500/15 text-${bp.colorTag || 'blue'}-400`)}>
                      {(bp.displayName || bp.entityType || '?')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-text-primary truncate">{bp.displayName}</div>
                      <div className="text-[10px] text-text-muted font-mono">{bp.entityType}</div>
                    </div>
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', bp.isActive ? 'bg-green-400' : 'bg-surface-overlay border border-border')} />
                  </button>
                ))
            }
          </div>
        </div>

        {/* Right: Detail panel */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!selected
            ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-surface-overlay border border-dashed border-border flex items-center justify-center">
                  <Sparkles size={24} className="text-text-muted" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-secondary">Select a module blueprint</p>
                  <p className="text-xs text-text-muted mt-1 max-w-xs">
                    Each blueprint defines a complete GRC module — fields, status flow, workflow eligibility, and UI config — without any code deployment.
                  </p>
                </div>
              </div>
            )
            : loadingDetail
              ? <div className="p-6 text-xs text-text-muted">Loading…</div>
              : <BlueprintDetail
                  bp={bp}
                  tab={detailTab}
                  setTab={setDetailTab}
                  onEdit={() => { setEditing(bp); setModalOpen(true) }}
                  onDelete={() => setDeleteTarget(bp)}
                  onActivate={() => activateMut.mutate(bp.id)}
                  onDeactivate={() => deactivateMut.mutate(bp.id)}
                  activating={activateMut.isPending}
                  deactivating={deactivateMut.isPending}
                />
          }
        </div>
      </div>

      {/* Create / Edit modal */}
      <BlueprintFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        initial={editing}
        onSave={(d) => editing ? updateMut.mutate({ id: editing.id, data: d }) : createMut.mutate(d)}
        loading={createMut.isPending || updateMut.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        loading={deleteMut.isPending}
        title="Delete module blueprint"
        message={`Delete "${deleteTarget?.displayName}"? Existing records of this entity type are unaffected, but the Universal Module Page will no longer render them.`}
      />
    </PageLayout>
  )
}

// ─── Blueprint Detail ─────────────────────────────────────────────────────────

const DETAIL_TABS = [
  { key: 'overview',  label: 'Overview',    icon: Eye },
  { key: 'fields',    label: 'Fields',      icon: Layers },
  { key: 'status',    label: 'Status flow', icon: GitBranch },
  { key: 'config',    label: 'Config keys', icon: Settings },
  { key: 'caps',      label: 'Capabilities', icon: Zap },
]

function BlueprintDetail({ bp, tab, setTab, onEdit, onDelete, onActivate, onDeactivate, activating, deactivating }) {
  if (!bp) return null

  let fieldsSchema = { sections: [] }
  let statusFlow = { statuses: [], transitions: [] }
  try { fieldsSchema = JSON.parse(bp.fieldsSchemaJson || '{}') } catch {}
  try { statusFlow = JSON.parse(bp.statusFlowJson || '{}') } catch {}

  // Fetch ui_actions for the detail screen to validate actionKey sync
  const { data: screenActionsRaw } = useScreenActions(bp.detailScreenKey)
  const screenActionKeys = new Set(
    (Array.isArray(screenActionsRaw) ? screenActionsRaw : (screenActionsRaw?.items || screenActionsRaw?.data || []))
      .map(a => a.actionKey).filter(Boolean)
  )

  // Validate each transition: warn if actionKey missing or not found in ui_actions.
  const transitionIssues = (statusFlow.transitions || []).map((t, i) => {
    const warnings = []
    if (!t.actionKey) warnings.push('missing actionKey — vc.canAct gate will not fire')
    else if (screenActionsRaw !== undefined && screenActionKeys.size > 0 && !screenActionKeys.has(t.actionKey))
      warnings.push(`actionKey "${t.actionKey}" not found in ui_actions for screen "${bp.detailScreenKey}"`)
    return { index: i, transition: t, warnings }
  }).filter(r => r.warnings.length > 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold',
            `bg-${bp.colorTag || 'blue'}-500/15 text-${bp.colorTag || 'blue'}-400`)}>
            {(bp.displayName || bp.entityType || '?')[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-text-primary">{bp.displayName}</h2>
              <Badge variant={bp.isActive ? 'green' : 'gray'} size="xs">
                {bp.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-xs text-text-muted font-mono">{bp.entityType} · {bp.apiBasePath}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {bp.isActive
            ? <Button variant="secondary" size="sm" onClick={onDeactivate} loading={deactivating}>Deactivate</Button>
            : <Button variant="secondary" size="sm" onClick={onActivate} loading={activating}>Activate</Button>
          }
          <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>Edit</Button>
          <Button variant="danger" size="sm" icon={Trash2} onClick={onDelete} />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 border-b border-border shrink-0">
        {DETAIL_TABS.map(t => (
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
          <div className="space-y-4 max-w-2xl">
            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Sections', value: fieldsSchema.sections?.length || 0, icon: Layers },
                { label: 'Statuses', value: statusFlow.statuses?.length || 0, icon: GitBranch },
                { label: 'Transitions', value: statusFlow.transitions?.length || 0, icon: ArrowRight },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-overlay">
                  <s.icon size={16} className="text-brand-400" />
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{s.value}</div>
                    <div className="text-xs text-text-muted">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Capabilities */}
            <div>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Capabilities</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'supportsWorkflow', label: 'Workflow', icon: GitBranch },
                  { key: 'supportsActionItems', label: 'Action items', icon: CheckCircle2 },
                  { key: 'supportsDocuments', label: 'Documents', icon: Upload },
                  { key: 'supportsComments', label: 'Comments', icon: MessageSquare },
                  { key: 'showInNav', label: 'Navigation', icon: Navigation },
                ].map(c => (
                  <div key={c.key} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-xs',
                    bp[c.key] ? 'border-green-500/25 bg-green-500/5 text-green-400' : 'border-border text-text-muted')}>
                    {bp[c.key] ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    <c.icon size={12} /> {c.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Sides */}
            <div>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Accessible by</h3>
              <div className="flex flex-wrap gap-1.5">
                {(bp.allowedSides || '').split(',').filter(Boolean).map(s => (
                  <Badge key={s} variant="blue" size="xs">{s}</Badge>
                ))}
              </div>
            </div>

            {/* Workflow eligibility */}
            {bp.workflowEligibility && (
              <div>
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Workflow eligibility</h3>
                <div className="flex flex-wrap gap-1.5">
                  {bp.workflowEligibility.split(',').filter(Boolean).map(e => (
                    <span key={e} className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-xs border border-purple-500/20">{e}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Universal Module Page route */}
            <div className="p-3 rounded-lg bg-brand-500/5 border border-brand-500/20">
              <p className="text-xs font-medium text-brand-400 mb-1">Universal Module Page routes</p>
              <p className="text-xs font-mono text-text-secondary">/module/{bp.entityType?.toLowerCase()} — list</p>
              <p className="text-xs font-mono text-text-secondary">/module/{bp.entityType?.toLowerCase()}/:id — detail</p>
            </div>
          </div>
        )}

        {tab === 'fields' && (
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
              <Info size={12} />
              Field schema is stored as JSON. Use the JSON editor below. Visual field builder coming soon.
            </div>
            {fieldsSchema.sections?.map((section, si) => (
              <div key={si} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-overlay border-b border-border">
                  <Layers size={12} className="text-brand-400" />
                  <span className="text-xs font-semibold text-text-primary">{section.label || section.key}</span>
                  <Badge variant="gray" size="xs">{section.fields?.length || 0} fields</Badge>
                </div>
                <div className="divide-y divide-border">
                  {(section.fields || []).map((f, fi) => (
                    <div key={fi} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                      <code className="font-mono text-brand-400 w-36 shrink-0">{f.key}</code>
                      <span className="text-text-secondary w-24 shrink-0">{f.type}</span>
                      <span className="text-text-muted flex-1">{f.label}</span>
                      {f.required && <span className="text-red-400 text-[10px]">required</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <p className="text-xs font-medium text-text-muted mb-1.5">Raw schema JSON</p>
              <pre className="text-[11px] font-mono text-text-secondary bg-surface-overlay border border-border rounded-lg p-3 overflow-x-auto">
                {bp.fieldsSchemaJson || '{}'}
              </pre>
            </div>
          </div>
        )}

        {tab === 'status' && (
          <div className="space-y-4 max-w-2xl">
            <div>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Statuses</h3>
              <div className="flex flex-wrap gap-2">
                {(statusFlow.statuses || []).map(s => (
                  <span key={s} className="px-2.5 py-1 rounded-full text-xs border border-border text-text-secondary bg-surface-overlay">{s}</span>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Transitions</h3>
              {/* Validation warnings banner */}
              {transitionIssues.length > 0 && (
                <div className="mb-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                    <AlertTriangle size={12} />
                    {transitionIssues.length} transition {transitionIssues.length === 1 ? 'issue' : 'issues'} detected
                  </div>
                  {transitionIssues.map(({ transition: t, warnings }, i) => (
                    <div key={i} className="text-[11px] text-amber-300/80 pl-4">
                      <span className="font-medium">{t.from} → {t.to} ({t.label}):</span>
                      {warnings.map((w, wi) => (
                        <span key={wi} className="block pl-2 text-amber-400/70">⚠ {w}</span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-1.5">
                {(statusFlow.transitions || []).map((t, i) => {
                  const hasIssue = transitionIssues.some(r => r.index === i)
                  return (
                    <div key={i} className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg border text-xs',
                      hasIssue ? 'border-amber-500/30 bg-amber-500/5' : 'border-border'
                    )}>
                      <span className="text-text-secondary font-medium w-28 truncate">{t.from}</span>
                      <ArrowRight size={12} className="text-text-muted shrink-0" />
                      <span className="text-text-secondary font-medium w-28 truncate">{t.to}</span>
                      <span className="text-brand-400 ml-2">{t.label}</span>
                      {t.actionKey
                        ? <code className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded',
                            screenActionsRaw === undefined
                              ? 'text-text-muted bg-surface-overlay'
                              : screenActionKeys.has(t.actionKey)
                                ? 'text-green-400 bg-green-500/10'
                                : 'text-amber-400 bg-amber-500/10')}>
                            {t.actionKey}
                          </code>
                        : <span className="text-[10px] text-text-muted/50 italic ml-1">no actionKey</span>
                      }
                      {t.permission && <code className="ml-auto text-[10px] font-mono text-text-muted">{t.permission}</code>}
                    </div>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted mb-1.5">Raw status flow JSON</p>
              <pre className="text-[11px] font-mono text-text-secondary bg-surface-overlay border border-border rounded-lg p-3 overflow-x-auto">
                {bp.statusFlowJson || '{}'}
              </pre>
            </div>
          </div>
        )}

        {tab === 'config' && (
          <div className="space-y-3 max-w-lg">
            {[
              { label: 'Nav key', value: bp.navKey, hint: 'ui_navigation.nav_key — sidebar active-item highlight' },
              { label: 'List screen key', value: bp.listScreenKey, hint: 'GET /v1/ui-config/screen/:key' },
              { label: 'Detail screen key', value: bp.detailScreenKey, hint: 'GET /v1/ui-config/screen/:key' },
              { label: 'Create form key', value: bp.createFormKey, hint: 'GET /v1/ui-config/form/:key' },
              { label: 'Edit form key', value: bp.editFormKey || bp.createFormKey + ' (fallback)', hint: 'Falls back to create form key if not set' },
              { label: 'API base path', value: bp.apiBasePath, hint: 'e.g. /v1/risks' },
            ].map(r => (
              <div key={r.label} className="flex items-start gap-3 px-4 py-3 rounded-lg border border-border">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-text-muted">{r.label}</div>
                  <div className="text-xs font-mono text-text-primary mt-0.5">{r.value || <span className="text-text-muted italic">not set</span>}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">{r.hint}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'caps' && (
          <div className="space-y-2 max-w-md">
            {/* Hint banner — shown when any capability is disabled */}
            {[
              'supportsWorkflow','supportsActionItems','supportsDocuments',
              'supportsComments','showInNav'
            ].some(k => !bp[k]) && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 mb-3">
                <span className="text-amber-400 mt-0.5 shrink-0">⚙</span>
                <div className="text-[11px] text-amber-300/80">
                  Some capabilities are disabled. The corresponding tabs will not appear on
                  detail pages for this module. Click <strong>Edit blueprint</strong> to enable them.
                </div>
              </div>
            )}
            {[
              { key: 'supportsWorkflow',    label: 'Workflow',      desc: 'Workflow instances can be started on this entity — shows the Workflow tab on detail pages', icon: GitBranch },
              { key: 'supportsActionItems', label: 'Action items',  desc: 'Action items can be linked to records of this type — shows the Action Items tab', icon: CheckCircle2 },
              { key: 'supportsDocuments',   label: 'Documents',     desc: 'Evidence documents can be uploaded to records — shows the Evidence tab', icon: Upload },
              { key: 'supportsComments',    label: 'Comments',      desc: 'Discussion threads appear on detail pages — shows the Comments tab', icon: MessageSquare },
              { key: 'showInNav',           label: 'Navigation',    desc: 'Module appears in the sidebar navigation', icon: Navigation },
            ].map(c => (
              <div key={c.key} className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors',
                bp[c.key] ? 'border-green-500/25 bg-green-500/5' : 'border-border'
              )}>
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                  bp[c.key] ? 'bg-green-500/15' : 'bg-surface-overlay')}>
                  <c.icon size={13} className={bp[c.key] ? 'text-green-400' : 'text-text-muted'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-text-primary">{c.label}</div>
                  <div className="text-[11px] text-text-muted">{c.desc}</div>
                  {!bp[c.key] && (
                    <div className="text-[10px] text-amber-400/70 mt-0.5">
                      ⚙ Tab hidden on detail pages — enable to show
                    </div>
                  )}
                </div>
                <div className={cn('text-xs font-medium', bp[c.key] ? 'text-green-400' : 'text-text-muted')}>
                  {bp[c.key] ? 'Enabled' : 'Disabled'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Blueprint Form Modal ─────────────────────────────────────────────────────

function BlueprintFormModal({ open, onClose, initial, onSave, loading }) {
  const [form, setForm] = useState(initial || EMPTY_BLUEPRINT)
  const [formTab, setFormTab] = useState('basic')

  // Sync when editing changes
  useEffect(() => { setForm(initial || EMPTY_BLUEPRINT); setFormTab('basic') }, [initial, open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggle = (k) => setForm(f => ({ ...f, [k]: !f[k] }))

  return (
    <Modal open={open} onClose={onClose} size="xl"
      title={initial ? `Edit: ${initial.displayName}` : 'New module blueprint'}
      subtitle="Define a complete GRC module — no code deployment required"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} icon={Sparkles} onClick={() => onSave(form)}>
            {initial ? 'Save changes' : 'Create module'}
          </Button>
        </div>
      }
    >
      {/* Form tabs */}
      <div className="flex items-center gap-1 -mx-5 px-5 pb-3 border-b border-border mb-4">
        {[
          { key: 'basic', label: 'Identity' },
          { key: 'config', label: 'Config keys' },
          { key: 'schema', label: 'Fields schema' },
          { key: 'status', label: 'Status flow' },
          { key: 'caps', label: 'Capabilities' },
        ].map(t => (
          <button key={t.key} onClick={() => setFormTab(t.key)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              formTab === t.key ? 'bg-brand-500/15 text-brand-400' : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {formTab === 'basic' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Entity type <span className="text-red-400">*</span></label>
              <input value={form.entityType} onChange={e => set('entityType', e.target.value.toUpperCase().replace(/\s/g, '_'))}
                placeholder="RISK"
                disabled={!!initial}
                className="w-full h-8 px-3 text-xs font-mono bg-surface-overlay border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50" />
              <p className="text-[10px] text-text-muted mt-0.5">UPPER_SNAKE_CASE, immutable after creation</p>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Display name <span className="text-red-400">*</span></label>
              <input value={form.displayName} onChange={e => set('displayName', e.target.value)}
                placeholder="Risk Management"
                className="w-full h-8 px-3 text-xs bg-surface-overlay border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Plural name</label>
              <input value={form.displayNamePlural} onChange={e => set('displayNamePlural', e.target.value)}
                placeholder="Risks"
                className="w-full h-8 px-3 text-xs bg-surface-overlay border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">API base path <span className="text-red-400">*</span></label>
              <input value={form.apiBasePath} onChange={e => set('apiBasePath', e.target.value)}
                placeholder="/v1/risks"
                className="w-full h-8 px-3 text-xs font-mono bg-surface-overlay border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Icon</label>
              <select value={form.icon} onChange={e => set('icon', e.target.value)}
                className="w-full h-8 px-2 text-xs bg-surface-overlay border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                {ICON_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Color</label>
              <div className="flex gap-1.5 flex-wrap pt-1">
                {COLOR_OPTIONS.map(c => (
                  <button key={c} onClick={() => set('colorTag', c)}
                    className={cn('w-5 h-5 rounded-full border-2 transition-all',
                      `bg-${c}-500`,
                      form.colorTag === c ? 'border-text-primary scale-110' : 'border-transparent opacity-60 hover:opacity-100')} />
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Accessible by (sides)</label>
            <div className="flex flex-wrap gap-2">
              {SIDES.map(s => {
                const sides = (form.allowedSides || '').split(',').filter(Boolean)
                const active = sides.includes(s)
                return (
                  <button key={s} onClick={() => {
                    const next = active ? sides.filter(x => x !== s) : [...sides, s]
                    set('allowedSides', next.join(','))
                  }}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs border transition-colors',
                      active ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-border text-text-muted hover:border-border-strong'
                    )}>
                    {s}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Workflow eligibility (comma-sep entity types)</label>
            <input value={form.workflowEligibility} onChange={e => set('workflowEligibility', e.target.value)}
              placeholder="RISK,RISK_ACCEPTANCE"
              className="w-full h-8 px-3 text-xs font-mono bg-surface-overlay border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Sort order</label>
            <input type="number" value={form.sortOrder} onChange={e => set('sortOrder', parseInt(e.target.value) || 0)}
              className="w-24 h-8 px-3 text-xs bg-surface-overlay border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>
      )}

      {formTab === 'config' && (
        <div className="space-y-3">
          <div className="text-xs text-blue-300 bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-2 flex gap-2">
            <Info size={12} className="mt-0.5 shrink-0" />
            These keys must match entries in the ui_forms and ui_navigation tables. The Universal Module Page will fetch them at runtime.
          </div>
          {[
            { key: 'navKey', label: 'Nav key', placeholder: 'audit_tests', hint: 'Must match nav_key in ui_navigation — sidebar highlights this item while the module is open. Leave blank for child/scoped modules.' },
            { key: 'listScreenKey', label: 'List screen key', placeholder: 'risk_list', hint: 'Screen config for /module/RISK' },
            { key: 'detailScreenKey', label: 'Detail screen key', placeholder: 'risk_detail', hint: 'Screen config for /module/RISK/:id' },
            { key: 'createFormKey', label: 'Create form key', placeholder: 'risk_create', hint: 'Form shown in "New Risk" modal' },
            { key: 'editFormKey', label: 'Edit form key (optional)', placeholder: 'risk_edit', hint: 'Falls back to createFormKey if blank' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium text-text-secondary block mb-1">{f.label}</label>
              <input value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full h-8 px-3 text-xs font-mono bg-surface-overlay border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
              <p className="text-[10px] text-text-muted mt-0.5">{f.hint}</p>
            </div>
          ))}
        </div>
      )}

      {formTab === 'schema' && (
        <div className="space-y-2">
          <div className="text-xs text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 flex gap-2">
            <Info size={12} className="mt-0.5 shrink-0" />
            JSON Schema defining entity fields. Sections group fields. Visual builder coming in next sprint.
          </div>
          <textarea
            value={form.fieldsSchemaJson}
            onChange={e => set('fieldsSchemaJson', e.target.value)}
            rows={16}
            spellCheck={false}
            className="w-full px-3 py-2.5 text-xs font-mono bg-surface-overlay border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            placeholder={JSON.stringify({ sections: [{ key: 'overview', label: 'Overview', fields: [{ key: 'title', label: 'Title', type: 'TEXT', required: true, gridCols: 12 }] }] }, null, 2)}
          />
        </div>
      )}

      {formTab === 'status' && (
        <div className="space-y-2">
          <div className="text-xs text-blue-300 bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-2 flex gap-2">
            <Info size={12} className="mt-0.5 shrink-0" />
            Define statuses and valid transitions. Each transition should have an <code className="text-[10px] font-mono bg-surface-overlay px-1 rounded">actionKey</code> matching a <code className="text-[10px] font-mono bg-surface-overlay px-1 rounded">ui_actions.action_key</code> for that screen — this gates the button so only users with an active workflow task can trigger it.
          </div>
          <textarea
            value={form.statusFlowJson}
            onChange={e => set('statusFlowJson', e.target.value)}
            rows={16}
            spellCheck={false}
            className="w-full px-3 py-2.5 text-xs font-mono bg-surface-overlay border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            placeholder={JSON.stringify({
              statuses: ['OPEN','IN_PROGRESS','RESOLVED','CLOSED'],
              transitions: [
                { from: 'OPEN', to: 'IN_PROGRESS', label: 'Start', actionKey: 'MY_MODULE_START', permission: 'module.edit' },
                { from: 'IN_PROGRESS', to: 'RESOLVED', label: 'Resolve', actionKey: 'MY_MODULE_RESOLVE', permission: 'module.resolve' },
                { from: 'RESOLVED', to: 'CLOSED', label: 'Close', actionKey: 'MY_MODULE_CLOSE' }
              ]
            }, null, 2)}
          />
        </div>
      )}

      {formTab === 'caps' && (
        <div className="space-y-2">
          {[
            { key: 'supportsWorkflow', label: 'Workflow instances', desc: 'Allow starting workflow instances on records', icon: GitBranch },
            { key: 'supportsActionItems', label: 'Action items', desc: 'Show Action Items tab on detail page', icon: CheckCircle2 },
            { key: 'supportsDocuments', label: 'Documents & evidence', desc: 'Show Evidence tab with file upload', icon: Upload },
            { key: 'supportsComments', label: 'Comments', desc: 'Show Comment Feed on detail page', icon: MessageSquare },
            { key: 'showInNav', label: 'Show in navigation', desc: 'Module appears in sidebar (requires nav entry)', icon: Navigation },
          ].map(c => (
            <button key={c.key} onClick={() => toggle(c.key)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors',
                form[c.key] ? 'border-green-500/30 bg-green-500/5' : 'border-border hover:border-border-strong'
              )}>
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                form[c.key] ? 'bg-green-500/15' : 'bg-surface-overlay')}>
                <c.icon size={14} className={form[c.key] ? 'text-green-400' : 'text-text-muted'} />
              </div>
              <div className="flex-1">
                <div className="text-xs font-medium text-text-primary">{c.label}</div>
                <div className="text-[11px] text-text-muted">{c.desc}</div>
              </div>
              <div className={cn(
                'w-8 h-5 rounded-full transition-colors relative shrink-0',
                form[c.key] ? 'bg-green-500' : 'bg-surface-overlay border border-border'
              )}>
                <span className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  form[c.key] ? 'translate-x-3.5' : 'translate-x-0.5'
                )} />
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}