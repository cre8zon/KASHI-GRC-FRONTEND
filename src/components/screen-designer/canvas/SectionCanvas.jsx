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
          <div className="flex items-center gap-1.5 px-3 py-1 text-[9px] text-brand-ink hover:text-brand-ink cursor-pointer">
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
                  primary:   'bg-brand-500/10 border-brand-500/40 text-brand-ink',
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
            className="px-3 py-1.5 rounded-ctl text-xs text-text-muted border border-dashed border-border hover:border-brand-500/40 hover:text-brand-ink transition-colors">
            + Add action
          </button>
        </div>
      </CanvasCard>
    </div>
  )
}


export { SectionCanvas }
