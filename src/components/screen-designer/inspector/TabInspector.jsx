import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
          <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-blue-500/5 border border-blue-500/20 text-[9px] text-blue-400 leading-relaxed">
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
            className="flex items-center gap-1.5 text-[10px] text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded px-2.5 py-1.5 transition-colors disabled:opacity-50">
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
