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
                  { primary: 'bg-brand-500/10 border-brand-500/40 text-brand-ink', secondary: 'bg-surface-overlay border-border text-text-secondary', danger: 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg' }[action.variant] || 'bg-surface-overlay border-border text-text-secondary'
                )}>
                {action.label}
              </button>
            ))}
            <button onClick={() => onSelectElement({ type: 'new_action', screenKey: screen.key })}
              className="px-2.5 py-1 rounded text-[10px] text-text-muted border border-dashed border-border hover:border-brand-500/40 hover:text-brand-ink transition-colors">
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
                i === 0 ? 'border-brand-500 text-brand-ink' : 'border-transparent text-text-muted hover:text-text-secondary',
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


export { ItemCardCanvas }
