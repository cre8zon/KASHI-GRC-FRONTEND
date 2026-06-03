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


function ColumnInspector({ initial, screenKey, onSave }) {
  const [col, setCol] = useState({
    key: '', label: '', type: 'text', sortable: false, hidden: false, componentKey: '',
    // FIX: monoFont and isPrimary are TEXT-type display options, persisted in columnsJson.
    // monoFont → font-mono rendering (for codes, IDs, refs, keys)
    // isPrimary → font-semibold (the main identifier field in the row)
    monoFont: false,
    isPrimary: false,
    ...initial,
  })
  const qc = useQueryClient()

  const saveMut = useMutation({
    mutationFn: async () => {
      // Load current layout, update/add column, save back
      const res = await sdApi.getLayout(screenKey)
      const items = res?.data?.items || res?.items || (Array.isArray(res?.data) ? res.data : null) || []
      const layout = Array.isArray(items) ? items[0] : items
      let cols = []
      try { cols = JSON.parse(layout?.columnsJson || '[]') } catch {}
      const idx = cols.findIndex(c => c.key === (initial?.key || col.key))
      if (idx >= 0) cols[idx] = col
      else cols.push(col)
      // FIX: preserve ALL existing layout fields — previously wiped roleAccessJson, tabsJson, layoutMode
      return sdApi.saveLayout(layout?.id, {
        layoutKey:      screenKey,
        screen:         screenKey,
        columnsJson:    JSON.stringify(cols),
        filtersJson:    layout?.filtersJson    ?? '[]',
        tabsJson:       layout?.tabsJson       ?? null,
        layoutMode:     layout?.layoutMode     ?? 'FULL_PAGE',
        roleAccessJson: layout?.roleAccessJson ?? '{}',
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-layout', screenKey] }); toast.success('Column saved'); onSave() },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  return (
    <div className="p-4 space-y-4">
      <InspectorSection title="Column">
        <IField label="Field key"><IInp value={col.key} onChange={v => setCol(c => ({...c, key: v}))} placeholder="risk_rating" mono /></IField>
        <IField label="Label"><IInp value={col.label} onChange={v => setCol(c => ({...c, label: v}))} placeholder="Risk Rating" /></IField>

        {/* Column type — FIX: added SELECT / dropdown as a first-class type */}
        <IField label="Type">
          <ISel value={col.type} onChange={v => setCol(c => ({...c, type: v}))} options={[
            { value: 'text',   label: 'Text' },
            { value: 'badge',  label: 'Badge / status' },
            { value: 'select', label: 'Select / dropdown' },   // ← NEW
            { value: 'date',   label: 'Date' },
            { value: 'number', label: 'Number' },
            { value: 'user',   label: 'User / avatar' },
            { value: 'action', label: 'Action link' },
          ]} />
        </IField>

        {/* FIX: TEXT-type display sub-options — mono font and primary column */}
        {col.type === 'text' && (
          <IField label="Text display options">
            <div className="flex flex-col gap-2 pt-0.5">
              {[
                { k: 'monoFont',  l: 'Mono font',      desc: 'font-mono — for codes, IDs, refs, keys' },
                { k: 'isPrimary', l: 'Primary column',  desc: 'Bold weight — the main identifier field in the row' },
              ].map(({ k, l, desc }) => (
                <label key={k} className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={col[k] || false}
                    onChange={e => setCol(c => ({ ...c, [k]: e.target.checked }))}
                    className="h-3 w-3 mt-0.5 accent-brand-500 shrink-0" />
                  <div>
                    <span className="text-[10px] text-text-secondary">{l}</span>
                    <p className="text-[9px] text-text-muted">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </IField>
        )}

        {/* FIX: BADGE and SELECT types share a component key field for option/color mapping */}
        {(col.type === 'badge' || col.type === 'select') && (
          <IField label={col.type === 'select' ? 'Component key (options source)' : 'Component key (color mapping)'}>
            <IInp
              value={col.componentKey || ''}
              onChange={v => setCol(c => ({ ...c, componentKey: v }))}
              placeholder={col.type === 'select' ? 'audit_result_options' : 'risk_status'}
              mono accent
            />
            <p className="text-[9px] text-text-muted mt-0.5">
              {col.type === 'select'
                ? 'Links to a UiComponent with SELECT/DROPDOWN type to supply option labels and values'
                : 'Links to a UiComponent for badge color-class mapping per status value'}
            </p>
          </IField>
        )}

        <div className="flex items-center gap-4">
          {[{k:'sortable',l:'Sortable'},{k:'hidden',l:'Hidden by default'}].map(({k,l}) => (
            <label key={k} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={col[k]} onChange={e => setCol(c => ({...c, [k]: e.target.checked}))} className="h-3 w-3 accent-brand-500" />
              <span className="text-[10px] text-text-secondary">{l}</span>
            </label>
          ))}
        </div>
      </InspectorSection>
      <Button size="sm" icon={Save} loading={saveMut.isPending} onClick={() => saveMut.mutate()} className="w-full">Save column</Button>
    </div>
  )
}


export { ColumnInspector }
