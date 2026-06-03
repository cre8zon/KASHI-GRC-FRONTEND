import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Layers, List, Eye, EyeOff, Plus, Search, Settings, Code2, Copy, ChevronRight, ChevronDown, GitBranch, Shield, Users, Zap, X, Save, RefreshCw, Lock, Unlock, MousePointerClick, Table2, Layout, PanelLeft, FileEdit, Square, ArrowRight, CheckCircle2, AlertTriangle, GripVertical, Pencil, Trash2, Link2, ExternalLink, Info, Hash, Columns2, SlidersHorizontal, Flag, Tag, Activity, PanelRight, Calendar, User, FileText } from 'lucide-react'
import { cn } from '../../../lib/cn'
import api from '../../../config/axios.config'
import toast from 'react-hot-toast'
import { sdApi } from '../sdApi'
import { CanvasCard } from '../shared/CanvasCard'
import { InspectorSection, IField, IInp, ISel, Row } from '../shared/InspectorHelpers'
import { MOCK_ITEMS, MOCK_RECORDS, CAPABILITY_TABS, isCapabilityTab,
         LAYOUT_MODES, FIELD_TYPES, FIELD_TYPE_GROUPS, SIDES } from '../constants'


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
    FULL_PAGE:  { ring: 'border-blue-500/20   bg-blue-500/3',   chromeBg: 'bg-blue-500/8',   chromeBorder: 'border-blue-500/15',   chromeText: 'text-blue-400',   label: 'Full page — navigates to a dedicated route' },
    DRAWER:     { ring: 'border-purple-500/20 bg-purple-500/3', chromeBg: 'bg-purple-500/8', chromeBorder: 'border-purple-500/15', chromeText: 'text-purple-400', label: 'Drawer — ~480px · slides from right' },
    SIDE_PANEL: { ring: 'border-teal-500/20   bg-teal-500/3',   chromeBg: 'bg-teal-500/8',   chromeBorder: 'border-teal-500/15',   chromeText: 'text-teal-400',   label: 'Side panel — permanent · 33vw' },
  }[layoutMode] || { ring: 'border-blue-500/20 bg-blue-500/3', chromeBg: 'bg-blue-500/8', chromeBorder: 'border-blue-500/15', chromeText: 'text-blue-400', label: '' }

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
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">IN REVIEW</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {actions.slice(0, 2).map(a => (
                <button key={a.id}
                  onClick={e => { e.stopPropagation(); onSelectElement({ type: 'action', id: a.id, data: a, screenKey: screen.key }) }}
                  className={cn('px-2 py-1 rounded-md text-[10px] font-medium border hover:scale-105 transition-all',
                    { primary: 'bg-brand-500/10 border-brand-500/40 text-brand-400', secondary: 'bg-surface-overlay border-border text-text-secondary', danger: 'bg-red-500/10 border-red-500/40 text-red-400' }[a.variant] || 'bg-surface-overlay border-border text-text-secondary')}>
                  {a.label}
                </button>
              ))}
              <button onClick={e => { e.stopPropagation(); onSelectElement({ type: 'new_action', screenKey: screen.key }) }}
                className="px-2 py-1 rounded-md text-[10px] text-text-muted border border-dashed border-border hover:border-brand-500/40 hover:text-brand-400 transition-colors">
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
                    f.fieldType === 'SELECT' ? 'bg-blue-500/20'
                    : f.fieldType === 'DATE'   ? 'bg-cyan-500/20'
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
                  ? <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/10 text-green-400">cap</span>
                  : <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400">fields</span>
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
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center border shrink-0', capInfo.color)}>
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
                      f.fieldType === 'SELECT'  ? 'bg-blue-500/10 border-blue-500/20'
                      : f.fieldType === 'DATE'    ? 'bg-cyan-500/10 border-cyan-500/20'
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
              'p-4 min-h-20 border-2 border-dashed border-border/40 rounded-lg m-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-brand-500/30 transition-colors',
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
            { FULL_PAGE:  'border-blue-500/40   bg-blue-500/8   text-blue-400',
              DRAWER:     'border-purple-500/40 bg-purple-500/8 text-purple-400',
              SIDE_PANEL: 'border-teal-500/40   bg-teal-500/8   text-teal-400', }[layoutMode]
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
        <div className={cn('relative border-2 border-dashed rounded-xl overflow-hidden', lmc.ring)}>
          <div className={cn('px-3 py-1.5 border-b text-[9px] font-medium', lmc.chromeBg, lmc.chromeBorder, lmc.chromeText)}>
            {lmc.label}
          </div>
          {innerContent}
        </div>
      )}

      {/* DRAWER */}
      {layoutMode === 'DRAWER' && (
        <div className={cn('relative border-2 border-dashed rounded-xl overflow-hidden', lmc.ring)}>
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
            <div className="w-[52%] border-l-2 border-purple-500/30 bg-background flex flex-col shrink-0">
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
        <div className={cn('relative border-2 border-dashed rounded-xl overflow-hidden', lmc.ring)}>
          <div className="flex min-h-40">
            <div className="flex-1 p-4 opacity-40 pointer-events-none">
              <div className="text-[9px] text-text-muted mb-2">List (beside panel)</div>
              {[1,2,3,4,5].map(i => (
                <div key={i}
                  className={cn('flex items-center gap-3 mb-1.5 p-2 rounded border bg-surface-overlay',
                    i === 2 ? 'border-teal-500/40 bg-teal-500/5' : 'border-border')}>
                  <div className="w-3 h-3 rounded-full bg-border" />
                  <div className="flex-1 h-2 bg-border/60 rounded" />
                </div>
              ))}
            </div>
            <div className="w-[48%] border-l-2 border-teal-500/30 bg-background flex flex-col shrink-0">
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


export { DetailCanvas }