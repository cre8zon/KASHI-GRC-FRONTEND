import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { moduleBlueprintsApi as moduleApi } from '../../../api/moduleBlueprints.api'
import { Layers, List, Eye, EyeOff, Plus, Search, Settings, Code2, Copy, ChevronRight, ChevronDown, GitBranch, Shield, Users, Zap, X, Save, RefreshCw, Lock, Unlock, MousePointerClick, Table2, Layout, PanelLeft, FileEdit, Square, ArrowRight, CheckCircle2, AlertTriangle, GripVertical, Pencil, Trash2, Link2, ExternalLink, Info, Hash, Columns2, SlidersHorizontal, Flag, Tag, Activity, PanelRight, Calendar, User, FileText } from 'lucide-react'
import { cn } from '../../../lib/cn'
import api from '../../../config/axios.config'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { sdApi } from '../sdApi'
import { Button } from '../../ui/Button'
import { InspectorSection, Row, IField, IInp, ISel } from '../shared/InspectorHelpers'
import { SIDES, HTTP_METHODS, ACTION_VARIANTS, LAYOUT_MODES,
         SCREEN_TYPES, FIELD_TYPES, FIELD_TYPE_GROUPS, CAPABILITY_TABS } from '../constants'

import { RoleVisibilityEditor } from './RoleVisibilityEditor'
import { WorkflowStepVisibility } from './WorkflowStepVisibility'

// Common icons shown as quick-pick chips. User can also type any Lucide name freely.
const COMMON_TAB_ICONS = [
  'Hash','Layers','CheckSquare','Shield','AlertTriangle','FileText','Zap',
  'Activity','BookOpen','GitBranch','ClipboardList','Flag','Users','Eye',
  'BarChart2','Settings','Link','Upload','MessageSquare','Calendar','Target',
]

function IconPicker({ value, onChange }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {COMMON_TAB_ICONS.map(name => (
          <button key={name} type="button"
            onClick={() => onChange(value === name ? '' : name)}
            className={cn(
              'px-2 py-0.5 rounded text-[10px] font-mono border transition-colors',
              value === name
                ? 'bg-brand-500/20 border-brand-500/40 text-brand-400'
                : 'bg-surface-overlay border-border text-text-muted hover:text-text-secondary hover:border-border/80'
            )}>
            {name}
          </button>
        ))}
      </div>
      <input
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder="Or type any Lucide icon name…"
        className="w-full h-7 px-2 text-[11px] font-mono bg-surface-raised border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500/50"
      />
      {value && !COMMON_TAB_ICONS.includes(value) && (
        <p className="text-[9px] text-status-warn-fg">
          Custom icon "{value}" — make sure it's a valid Lucide icon name or it'll fall back to #
        </p>
      )}
    </div>
  )
}

// Maps tab key → blueprint capability field
const CAPABILITY_TAB_TO_BP = {
  workflow:   { field: 'supportsWorkflow',    label: 'Workflow' },
  evidence:   { field: 'supportsDocuments',   label: 'Evidence' },
  comments:   { field: 'supportsComments',    label: 'Comments' },
  actions:    { field: 'supportsActionItems', label: 'Action Items' },
  'action-items': { field: 'supportsActionItems', label: 'Action Items' },
}

function TabInspector({ tab, tabKey, screenKey, layout }) {
  const qc = useQueryClient()

  // ── Tab label editing ──────────────────────────────────────────────────────
  const [labelEdit, setLabelEdit] = useState(tab || '')
  const [iconEdit,  setIconEdit]  = useState(() => {
    try {
      const parsed = JSON.parse(layout?.tabsJson || 'null')
      if (Array.isArray(parsed)) {
        const found = parsed.find(t => (t.key === tabKey || t.label === tab))
        return found?.icon || ''
      }
    } catch {}
    return ''
  })

  // ── Blueprint fetch for capability hint ───────────────────────────────────
  const entityType = screenKey?.replace(/_detail$|_list$/, '').toUpperCase()
  const { data: bpRes } = useQuery({
    queryKey: ['blueprint-for-tab-inspector', entityType],
    queryFn:  () => moduleApi.blueprint(entityType),
    enabled:  !!entityType,
    staleTime: 60_000,
  })
  const bp = bpRes?.data || bpRes
  const resolvedTabKey = tabKey || tab?.toLowerCase().replace(/\s+/g, '_')
  const capInfo = CAPABILITY_TAB_TO_BP[resolvedTabKey]
  const isCapabilityTab = !!capInfo
  const isCapDisabled   = isCapabilityTab && bp && !bp[capInfo.field]

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
    if (!labelEdit.trim() || (labelEdit === tab && iconEdit === (currentTabs.find(t => t.key === tabKey || t.label === tab)?.icon || ''))) return
    const newTabs = currentTabs.map(t =>
      (t.key === tabKey || t.label === tab)
        ? { ...t, label: labelEdit.trim(), ...(iconEdit ? { icon: iconEdit } : {}) }
        : t
    )
    saveTabsMut.mutate(newTabs)
  }

  const handleSaveIcon = () => {
    const newTabs = currentTabs.map(t =>
      (t.key === tabKey || t.label === tab)
        ? { ...t, icon: iconEdit || undefined }
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

        <IField label="Tab icon">
          <IconPicker value={iconEdit} onChange={setIconEdit} />
          <button
            onClick={handleSaveIcon}
            disabled={saveTabsMut.isPending}
            className="mt-1.5 h-7 px-3 text-[10px] font-medium text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded hover:bg-brand-500/20 transition-colors disabled:opacity-40">
            Save icon
          </button>
        </IField>

        {isBuiltIn && (
          <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-status-info-bg border border-status-info-bd text-[9px] text-status-info-fg leading-relaxed">
            <Info size={10} className="mt-0.5 shrink-0" />
            <span>Built-in capability tab — always available when this screen type uses it. You can rename it or hide it per-role, but it cannot be deleted.</span>
          </div>
        )}

        {/* Capability disabled warning — shown when bp has this cap turned off */}
        {isCapDisabled && (
          <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-card border border-status-warn-bd bg-status-warn-bg mt-2">
            <span className="text-status-warn-fg text-[11px] shrink-0 mt-0.5">⚙</span>
            <div className="text-[10px] text-status-warn-fg leading-relaxed">
              <strong>{capInfo.label}</strong> capability is <strong>disabled</strong> in Blueprint Settings.
              This tab won't appear at runtime until{' '}
              <code className="font-mono text-[9px]">{capInfo.field}</code> is enabled in{' '}
              <strong>Module Blueprints → {entityType} → Capabilities</strong>.
            </div>
          </div>
        )}

        {/* Capability enabled confirmation */}
        {isCapabilityTab && bp && !isCapDisabled && (
          <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-card border border-status-pass-bd bg-status-pass-bg mt-2">
            <span className="text-status-pass-fg text-[10px] shrink-0 mt-0.5">✓</span>
            <span className="text-[9px] text-status-pass-fg">
              {capInfo.label} capability is enabled — this tab will appear at runtime.
            </span>
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


export { TabInspector }