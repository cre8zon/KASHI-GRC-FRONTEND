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


function ListCanvas({ screen, selectedElement, onSelectElement, layout, actions }) {
  let columns = []
  try { columns = JSON.parse(layout?.columnsJson || '[]') } catch {}
  if (columns.length === 0) columns = ['title', 'status', 'priority', 'owner', 'dueDate'].map(k => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), type: 'text' }))

  return (
    <div className="space-y-3">
      {/* Table */}
      <CanvasCard label="Table" hint="click a column header to configure it">
        {/* Preview banner — makes clear these are not real records */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-status-warn-bg">
          <span className="text-[9px] text-status-warn-fg font-medium">⚠ Preview data</span>
          <span className="text-[9px] text-text-muted">— column values below are mock examples, not real records. Configure columns using the column headers.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-[10px]">
            <thead>
              <tr className="border-b border-border bg-surface">
                {columns.map(col => (
                  <th key={col.key}
                    onClick={() => onSelectElement({ type: 'column', data: col, screenKey: screen.key })}
                    className={cn('text-left px-3 py-2.5 text-xs font-semibold text-text-secondary cursor-pointer hover:text-text-primary hover:bg-brand-500/5 transition-colors',
                      selectedElement?.type === 'column' && selectedElement?.data?.key === col.key ? 'bg-brand-500/10 text-brand-ink' : '')}>
                    <div className="flex items-center gap-1">
                      {/* Primary columns render bolder in the header too */}
                      <span className={cn(col.isPrimary && 'font-bold text-text-primary', col.monoFont && 'font-mono')}>
                        {col.label || col.key}
                      </span>
                      {/* Type indicators */}
                      {(col.type === 'badge' || col.type === 'select') && <Tag size={9} className="text-text-muted" />}
                      {col.monoFont  && <span className="text-[7px] text-text-muted border border-border/60 rounded px-0.5 leading-tight">mono</span>}
                      {col.isPrimary && <span className="text-[7px] text-text-muted border border-border/60 rounded px-0.5 leading-tight">1°</span>}
                      {col.sortable  && <SlidersHorizontal size={9} className="text-text-muted" />}
                      {col.hidden    && <EyeOff size={9} className="text-text-muted" />}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 cursor-pointer text-text-muted hover:text-brand-ink"
                  onClick={() => onSelectElement({ type: 'new_column', screenKey: screen.key })}>
                  <Plus size={11} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {MOCK_RECORDS.slice(0, 3).map(r => (
                <tr key={r.id} className="hover:bg-brand-500/3 transition-colors">
                  {columns.map(col => (
                    <td key={col.key} className={cn(
                      'px-3 py-2.5 text-xs truncate max-w-28',
                      // isPrimary → bold; monoFont → font-mono; both can coexist
                      col.isPrimary ? 'font-semibold text-text-primary' : 'text-text-primary',
                      col.monoFont && 'font-mono text-text-secondary',
                    )}>
                      {(() => {
                        // Show mock value — use record field if key matches, else generate placeholder
                        const mockVal = r[col.key] ?? `sample_${col.key}_${r.id}`
                        if (col.type === 'badge' || col.type === 'select') {
                          const color = col.type === 'badge' ? 'blue' : 'purple'
                          return <span className={`px-1.5 py-0.5 rounded bg-${color}-500/10 text-${color}-400 text-[9px]`}>{r[col.key] || 'VALUE'}</span>
                        }
                        return <span className="text-text-muted/70">{r[col.key] ? String(r[col.key]) : <span className="italic opacity-50">{col.key}</span>}</span>
                      })()}
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CanvasCard>

      {/* Toolbar actions — renders real configured actions, not a hardcoded button */}
      <CanvasCard label="Toolbar actions" hint="click a button to configure it · click + to add">
        <div className="flex items-center gap-2 p-3 flex-wrap">
          <div className="flex-1 h-8 bg-background border border-border rounded-ctl flex items-center px-2.5 gap-2 min-w-32">
            <Search size={12} className="text-text-muted" />
            <span className="text-xs text-text-muted">Search…</span>
          </div>
          {actions.map(action => (
            <button key={action.id}
              onClick={e => { e.stopPropagation(); onSelectElement({ type: 'action', id: action.id, data: action, screenKey: screen.key }) }}
              className={cn(
                'flex items-center gap-1.5 h-7 px-3 rounded-ctl text-[10px] font-medium border transition-all hover:scale-105',
                selectedElement?.id === action.id ? 'ring-2 ring-brand-500/60' : '',
                {
                  primary:   'bg-brand-500 text-brand-900 border-brand-600',
                  secondary: 'bg-surface-overlay border-border text-text-secondary',
                  danger:    'bg-status-fail-bg border-status-fail-bd text-status-fail-fg',
                  warning:   'bg-status-warn-bg border-status-warn-bd text-status-warn-fg',
                  ghost:     'bg-transparent border-border/40 text-text-muted',
                }[action.variant] || 'bg-brand-500 text-brand-900 border-brand-600'
              )}>
              <Plus size={11} /> {action.label}
            </button>
          ))}
          <button
            onClick={() => onSelectElement({ type: 'new_action', screenKey: screen.key })}
            className="flex items-center gap-1.5 h-7 px-3 border border-dashed border-border text-text-muted hover:border-brand-500/40 hover:text-brand-ink rounded-ctl text-[10px] transition-colors">
            <Plus size={11} /> Add button
          </button>
        </div>
      </CanvasCard>
    </div>
  )
}


export { ListCanvas }