import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Layers, List, Eye, EyeOff, Plus, Search, Settings, Code2, Copy, ChevronRight, ChevronDown, GitBranch, Shield, Users, Zap, X, Save, RefreshCw, Lock, Unlock, MousePointerClick, Table2, Layout, PanelLeft, FileEdit, Square, ArrowRight, CheckCircle2, AlertTriangle, GripVertical, Pencil, Trash2, Link2, ExternalLink, Info, Hash, Columns2, SlidersHorizontal, Flag, Tag, Activity, PanelRight, Calendar, User, FileText } from 'lucide-react'
import { cn } from '../../lib/cn'
import { sdApi } from './sdApi'
import { SCREEN_TYPES, FIELD_TYPE_COLOR, GRID_LABEL, CAPABILITY_TABS, isCapabilityTab } from './constants'
import { CanvasCard } from './shared/CanvasCard'
import { InspectorSection } from './shared/InspectorHelpers'

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
            <div className="text-[11px] text-text-muted px-3 py-6 border border-dashed border-border/40 rounded-lg text-center">
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
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all',
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
                      <span className="text-[9px] text-red-400 shrink-0 font-medium">req</span>
                    )}

                    {/* Has conditional */}
                    {f.dependsOnJson && (
                      <span title="Has conditional display rule"
                        className="text-[9px] text-amber-400 shrink-0">if</span>
                    )}

                    {/* Options linked */}
                    {f.optionsComponentKey && (
                      <span title={`Options: ${f.optionsComponentKey}`}
                        className="text-[9px] text-teal-400 shrink-0 font-mono truncate max-w-20">{f.optionsComponentKey}</span>
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
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all',
                screen?.selectedElement?.type === 'form_submit_config'
                  ? 'border-brand-500 bg-brand-500/8'
                  : 'border-green-500/20 bg-green-500/5 hover:border-brand-500/30'
              )}>
              <CheckCircle2 size={13} className="text-green-400 shrink-0" />
              <div className="flex-1">
                <span className="text-xs text-text-primary font-medium">Submit</span>
                <span className="text-[9px] font-mono text-text-muted ml-2">POST → form.submitUrl · click to configure</span>
              </div>
              <span className="text-[9px] text-green-400 font-medium">built-in</span>
            </button>

            {/* Cancel — always present, closes the modal/form */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-background">
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
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all',
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
                    danger: 'text-red-400 bg-red-500/10 border-red-500/20',
                    secondary: 'text-text-secondary bg-surface-overlay border-border',
                  }[action.variant] || 'text-text-muted bg-surface-overlay border-border')}>
                  {action.variant}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Form metadata summary */}
        <div className="p-3 rounded-lg bg-surface border border-border text-[10px] text-text-muted space-y-1">
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
              <div className="text-[11px] text-text-muted px-3 py-6 border border-dashed border-border/40 rounded-lg text-center">
                No columns configured — click &quot;Add column&quot; above or Preview → click any column header
              </div>
            ) : (
              <div className="space-y-1">
                {columns.map((col, idx) => (
                  <button key={col.key || idx}
                    onClick={() => onSelectElement({ type: 'column', data: col, screenKey: screen.key })}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all',
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
                      <span className="text-[9px] px-1.5 py-0.5 rounded border bg-blue-500/10 border-blue-500/20 text-blue-400">{col.type}</span>
                    )}
                    {col.sortable && <SlidersHorizontal size={10} className="text-text-muted" />}
                    {col.hidden && <EyeOff size={10} className="text-amber-400" title="Hidden by default" />}
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
              <div className="text-[11px] text-text-muted px-3 py-6 border border-dashed border-border/40 rounded-lg text-center">
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
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all',
                        selectedElement?.id === comp.id
                          ? 'border-brand-500 bg-brand-500/8'
                          : 'border-border hover:border-brand-500/30 bg-background'
                      )}>
                      <Hash size={13} className="text-text-muted shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-text-primary font-medium">{comp.label || comp.componentKey}</span>
                        <span className="text-[9px] font-mono text-text-muted ml-2">{comp.componentKey}</span>
                      </div>
                      <span className="text-[8px] px-1.5 py-0.5 rounded border bg-teal-500/10 border-teal-500/20 text-teal-400 font-mono">{comp.componentType}</span>
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
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all',
                    selectedElement?.type === 'header_zone'
                      ? 'border-brand-500 bg-brand-500/8'
                      : 'border-border hover:border-brand-500/30 bg-background'
                  )}>
                  <Layout size={13} className="text-text-muted shrink-0" />
                  <span className="text-xs text-text-primary flex-1">Header zone</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/25 text-amber-400">
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
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all',
                    selectedElement?.type === el.key
                      ? 'border-brand-500 bg-brand-500/8'
                      : 'border-border hover:border-brand-500/30 bg-background'
                  )}>
                  <el.icon size={13} className="text-text-muted shrink-0" />
                  <span className="text-xs text-text-primary flex-1">{el.label}</span>
                  {/* Badge: capability (hardcoded component) vs configurable (has fields) */}
                  {el.isCap
                    ? <span className="text-[9px] px-1.5 py-0.5 rounded border bg-green-500/10 border-green-500/25 text-green-400">component</span>
                    : el.tabKey
                      ? <span className="text-[9px] px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/25 text-amber-400">configure fields</span>
                      : <span className="text-[9px] px-1.5 py-0.5 rounded border bg-green-500/10 border-green-500/25 text-green-400">click to configure</span>
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
          {/* Visibility badge reflects the currently selected preview role (top-right dropdown).
              "hidden" means the action's allowedSides doesn't include the preview role's side —
              NOT a bug. Switch role to ORGANIZATION or AUDITOR to see those actions as "visible". */}
          {actions.length > 0 && roleProfile && (
            <p className="text-[9px] text-text-muted mb-2 px-1">
              Previewing as <span className="text-brand-400 font-medium">{roleProfile.label}</span>
              {' '}({roleProfile.side}) — change role in top bar to see different visibility.
            </p>
          )}
          {actions.length === 0 ? (
            <div className="text-[11px] text-text-muted px-3 py-4 border border-dashed border-border/40 rounded-lg text-center">
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
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all',
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
                      <span className="text-[9px] px-1.5 py-0.5 rounded border bg-red-500/10 border-red-500/25 text-red-400">SoD blocked</span>
                    )}
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded border',
                      visibleToRole
                        ? 'bg-green-500/10 border-green-500/25 text-green-400'
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


export { ElementsTab, FormElementsTab }