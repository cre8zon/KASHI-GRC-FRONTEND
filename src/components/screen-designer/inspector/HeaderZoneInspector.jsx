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
import { useLayoutTabs } from './useLayoutTabs'

// Tabs built in code that can show a summary tile in the header zone, and the
// ones shown when the screen has not chosen. Mirrors DetailChrome.tileTabsFor.
const TILE_TAB_OPTIONS = [
  { key: 'workflow',        label: 'Workflow',        hint: 'current step · who holds it',  byDefault: true },
  { key: 'evidence',        label: 'Evidence',        hint: 'files · accepted / pending',    byDefault: true },
  { key: 'linked-findings', label: 'Linked findings', hint: 'issues only',                   byDefault: true },
  { key: 'comments',        label: 'Comments',        hint: 'count · last comment',          byDefault: false },
]

function SummaryTilesSection({ screenKey }) {
  const { tabs, patchTab, saving, layout } = useLayoutTabs(screenKey)
  // Same rule as the runtime: a tab's own "headerKpi" decides; a tab that has
  // not chosen keeps its default.
  const isOn = (opt) => {
    const t = tabs.find(x => x.key === opt.key)
    return t && typeof t.headerKpi === 'boolean' ? t.headerKpi : opt.byDefault
  }
  return (
    <InspectorSection title="Summary tiles">
      <p className="text-[10px] text-text-muted leading-relaxed mb-2">
        A row of tiles under the header fields, one per tab built in code. Clicking a
        tile opens its tab. Shown only when the record has that tab. Stored as
        <code className="font-mono"> "headerKpi"</code> on the tab's entry in tabs_json.
      </p>
      {!layout?.id && <p className="text-[10px] text-status-warn-fg mb-2">Save this screen's layout first.</p>}
      <div className="space-y-1">
        {TILE_TAB_OPTIONS.map(opt => {
          // Linked findings is a Screen Designer tab, not a capability one: adding
          // an entry for it would CREATE the tab, so it is only offered where the
          // screen already lists it.
          const unavailable = opt.key === 'linked-findings' && !tabs.some(t => t.key === opt.key)
          const on = !unavailable && isOn(opt)
          return (
            <label key={opt.key} title={unavailable ? 'This screen has no Linked findings tab' : undefined}
              className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-card border border-border bg-background cursor-pointer',
                unavailable && 'opacity-50 cursor-not-allowed')}>
              <input type="checkbox" checked={on} disabled={saving || !layout?.id || unavailable}
                onChange={() => patchTab(opt.key, { headerKpi: !on }, opt.label)} />
              <span className="text-xs text-text-primary font-medium flex-1">{opt.label}</span>
              <span className="text-[9px] text-text-muted">{opt.hint}</span>
            </label>
          )
        })}
      </div>
    </InspectorSection>
  )
}

/**
 * Header zone fields. With formKey/title it edits a TAB's own header instead
 * ({screen}_tab_{key}_header) — same field list, no summary tiles.
 */
function HeaderZoneInspector({ screenKey, onSelectElement, formKey: formKeyProp, title, showTiles = true }) {
  const qc = useQueryClient()

  // Load (or create) the UiForm for the header zone
  const formKey = formKeyProp || `${screenKey}_header`
  const { data: formRes, isLoading } = useQuery({
    queryKey: ['sd-form', formKey],
    queryFn:  () => sdApi.getForm(formKey),
    staleTime: 0,
  })
  const formId = useMemo(() => {
    const items = formRes?.items || formRes?.data?.items || []
    return Array.isArray(items) ? items[0]?.id ?? null : null
  }, [formRes])

  // Auto-create the UiForm if it doesn't exist yet
  const createAttempted = useRef(false)
  const createMut = useMutation({
    mutationFn: () => sdApi.createForm({ formKey, title: `${screenKey} header fields`, submitUrl: '', httpMethod: 'PUT' }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['sd-form', formKey] }) },
    retry: false,
  })
  useEffect(() => {
    if (!isLoading && !formId && !createAttempted.current) {
      createAttempted.current = true
      createMut.mutate()
    }
  }, [isLoading, formId])

  // Load fields
  const { data: fieldsRes, refetch } = useQuery({
    queryKey: ['sd-form-fields', formId],
    queryFn:  () => sdApi.listFields(formId),
    enabled:  !!formId,
    staleTime: 0,
  })
  const fields = useMemo(() => {
    if (!fieldsRes) return []
    return Array.isArray(fieldsRes) ? fieldsRes : Array.isArray(fieldsRes?.data) ? fieldsRes.data : []
  }, [fieldsRes])

  if (isLoading) return <div className="p-4 text-xs text-text-muted">Loading…</div>

  return (
    <div className="p-4 space-y-4">
      <InspectorSection title={title || 'Header zone fields'}>
        <p className="text-[10px] text-text-muted leading-relaxed mb-3">
          {formKeyProp
            ? 'Fields shown above the tabs while this tab is open, instead of the Overview header zone.'
            : 'Fields that appear above the tabs on Overview and every tab without its own header.'}
          {' '}A reference field shows as a code chip, dropdowns as coloured badges,
          people and dates as tiles.
          Stored as <code className="font-mono">UiFormField</code> rows under key{' '}
          <code className="font-mono text-brand-ink">{formKey}</code>.
        </p>

        {/* Field list */}
        {fields.length === 0 ? (
          <div className="text-[11px] text-text-muted py-4 text-center border border-dashed border-border rounded-card">
            No header fields yet — click "+ Add field" below
          </div>
        ) : (
          <div className="space-y-1">
            {fields.map(f => (
              <button key={f.id}
                onClick={() => onSelectElement({ type: 'form_field', id: f.id, data: f, screenKey: formKey, formId })}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-card border border-border hover:border-brand-500/30 bg-background text-left transition-all">
                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border bg-status-info-bg border-status-info-bd text-status-info-fg shrink-0">{f.fieldType}</span>
                <span className="text-xs text-text-primary font-medium flex-1">{f.label}</span>
                <span className="text-[9px] font-mono text-text-muted">{f.fieldKey}</span>
                {f.isRequired && <span className="text-[9px] text-status-fail-fg">req</span>}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => onSelectElement({ type: 'new_form_field', screenKey: formKey, formId,
            onSaved: () => qc.invalidateQueries({ queryKey: ['sd-form-fields', formId] }) })}
          className="w-full flex items-center justify-center gap-1.5 py-2 mt-1 border-2 border-dashed border-brand-500/25 hover:border-brand-500/50 rounded-card text-xs text-brand-ink hover:text-brand-ink font-medium transition-colors bg-brand-500/3">
          <Plus size={12} /> Add header field
        </button>
      </InspectorSection>

      {showTiles && !formKeyProp && <SummaryTilesSection screenKey={screenKey} />}

      <InspectorSection title="Common header fields">
        <p className="text-[9px] text-text-muted mb-2">Click to add a pre-configured field:</p>
        <div className="flex flex-wrap gap-1">
          {[
            { key: 'title',      label: 'Title',       type: 'TEXT'   },
            { key: 'status',     label: 'Status',      type: 'SELECT' },
            { key: 'ownerId',    label: 'Owner',       type: 'LOOKUP' },
            { key: 'dueDate',    label: 'Due date',    type: 'DATE'   },
            { key: 'priority',   label: 'Priority',    type: 'SELECT' },
            { key: 'ref',        label: 'Reference #', type: 'TEXT'   },
          ].map(preset => (
            <button key={preset.key}
              disabled={!formId}
              onClick={async () => {
                if (!formId) return
                try {
                  await sdApi.createField({
                    formId, fieldKey: preset.key, fieldType: preset.type,
                    label: preset.label, sortOrder: fields.length, gridCols: 6,
                  })
                  qc.invalidateQueries({ queryKey: ['sd-form-fields', formId] })
                  toast.success(`Added "${preset.label}" field`)
                } catch (e) { toast.error(e?.response?.data?.message || 'Failed') }
              }}
              className="px-2 py-0.5 rounded text-[9px] border border-border bg-surface-overlay text-text-muted hover:border-brand-500/40 hover:text-brand-ink transition-colors disabled:opacity-40">
              + {preset.label}
            </button>
          ))}
        </div>
      </InspectorSection>
    </div>
  )
}


export { HeaderZoneInspector }
