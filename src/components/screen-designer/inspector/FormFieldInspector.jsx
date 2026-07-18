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

function FormFieldInspector({ initial, formId, screenKey, onSave }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    fieldKey:             initial?.fieldKey     || '',
    fieldType:            initial?.fieldType    || 'TEXT',
    label:                initial?.label        || '',
    placeholder:          initial?.placeholder  || '',
    helperText:           initial?.helperText   || '',
    isRequired:           initial?.isRequired   || false,
    gridCols:             initial?.gridCols     || 12,
    sortOrder:            initial?.sortOrder    || 0,
    optionsComponentKey:  initial?.optionsComponentKey || '',
    validationRulesJson:  initial?.validationRulesJson || null,
    dependsOnJson:        initial?.dependsOnJson || null,
    rowsCount:            initial?.rowsCount    || '',
    minValue:             initial?.minValue     || '',
    maxValue:             initial?.maxValue     || '',
    lookupEntityType:     initial?.lookupEntityType || '',
    tagSuggestions:       initial?.tagSuggestions || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const saveMut = useMutation({
    mutationFn: () => {
      if (!formId) {
        return Promise.reject(new Error('Form not ready yet — wait a moment and try again'))
      }
      const payload = {
        ...form,
        formId,
        gridCols:  Number(form.gridCols)  || 12,
        sortOrder: Number(form.sortOrder) || 0,
        rowsCount: form.rowsCount ? Number(form.rowsCount) : null,
        minValue:  form.minValue  ? Number(form.minValue)  : null,
        maxValue:  form.maxValue  ? Number(form.maxValue)  : null,
        // FIX: MySQL JSON columns reject empty string "" — send null when blank
        validationRulesJson: form.validationRulesJson?.trim() || null,
        dependsOnJson:       form.dependsOnJson?.trim()       || null,
      }
      return initial?.id
        ? sdApi.updateField(initial.id, payload)
        : sdApi.createField(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sd-form-fields', formId] })
      qc.invalidateQueries({ queryKey: ['sd-form', undefined] })
      toast.success(initial?.id ? 'Field updated' : 'Field added')
      onSave()
    },
    onError:   (e) => toast.error(e?.response?.data?.message || 'Failed to save field'),
  })

  const deleteMut = useMutation({
    mutationFn: () => sdApi.deleteField(initial.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-form-fields', formId] }); toast.success('Field deleted'); onSave() },
    onError:   (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  const needsOptions     = ['SELECT','MULTI_SELECT','RADIO','CHECKBOX'].includes(form.fieldType)
  const needsLookup      = form.fieldType === 'LOOKUP'
  const needsRows        = ['TEXTAREA','RICH_TEXT','JSON_EDITOR'].includes(form.fieldType)
  const needsRange       = ['SLIDER','RATING'].includes(form.fieldType)
  const needsTags        = form.fieldType === 'TAG'
  const isLayoutOnly     = ['SECTION_HEADER','DIVIDER'].includes(form.fieldType)

  return (
    <div className="p-4 space-y-4">

      {/* Field type — grouped */}
      <InspectorSection title="Field type">
        {!initial && !form.fieldType && (
          <p className="text-[10px] text-brand-400 font-medium mb-2">← Pick a type to start</p>
        )}
        <div className="space-y-2">
          {FIELD_TYPE_GROUPS.map(group => (
            <div key={group}>
              <p className="text-[8px] font-semibold text-text-muted uppercase tracking-wider mb-1">{group}</p>
              <div className="flex flex-wrap gap-1">
                {FIELD_TYPES.filter(t => t.group === group).map(t => (
                  <button key={t.value}
                    onClick={() => set('fieldType', t.value)}
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[9px] border transition-colors',
                      form.fieldType === t.value
                        ? 'bg-brand-500/15 border-brand-500/40 text-brand-400 font-medium'
                        : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary'
                    )}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </InspectorSection>

      {/* Core identity */}
      <InspectorSection title="Identity">
        <IField label="Field key (API param name)">
          <IInp value={form.fieldKey} onChange={v => set('fieldKey', v.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="issueType or issue_type" mono />
          <p className="text-[9px] text-text-muted mt-0.5">Maps to the JSON body key sent to the API</p>
        </IField>
        {!isLayoutOnly && (
          <IField label="Label">
            <IInp value={form.label} onChange={v => set('label', v)} placeholder="Issue type" />
          </IField>
        )}
        {isLayoutOnly && (
          <IField label="Section title">
            <IInp value={form.label} onChange={v => set('label', v)} placeholder="Root cause analysis" />
          </IField>
        )}
        {!isLayoutOnly && (
          <IField label="Placeholder">
            <IInp value={form.placeholder} onChange={v => set('placeholder', v)} placeholder="Select issue type…" />
          </IField>
        )}
        {!isLayoutOnly && (
          <IField label="Helper text">
            <IInp value={form.helperText} onChange={v => set('helperText', v)} placeholder="Brief instructions shown below the field" />
          </IField>
        )}
      </InspectorSection>

      {/* Layout */}
      <InspectorSection title="Layout">
        <IField label="Grid width (of 12 columns)">
          <div className="flex gap-1 flex-wrap">
            {[3,4,6,8,12].map(n => (
              <button key={n}
                onClick={() => set('gridCols', n)}
                className={cn('px-2 py-0.5 rounded text-[9px] border transition-colors',
                  form.gridCols === n
                    ? 'bg-brand-500/15 border-brand-500/40 text-brand-400 font-medium'
                    : 'border-border text-text-muted hover:border-border-strong')}>
                {n === 3 ? '¼' : n === 4 ? '⅓' : n === 6 ? '½' : n === 8 ? '⅔' : 'Full'} ({n})
              </button>
            ))}
          </div>
        </IField>
        <IField label="Sort order">
          <IInp value={String(form.sortOrder)} onChange={v => set('sortOrder', v)} placeholder="0" />
        </IField>
      </InspectorSection>

      {/* Validation (skip for layout fields) */}
      {!isLayoutOnly && (
        <InspectorSection title="Validation">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-text-secondary">Required</span>
            <button
              onClick={() => set('isRequired', !form.isRequired)}
              className={cn('relative w-8 h-4 rounded-full border transition-colors',
                form.isRequired ? 'bg-brand-500 border-brand-500' : 'border-border bg-surface-overlay')}>
              <span className={cn('absolute top-0.5 left-0 w-3 h-3 rounded-full bg-surface-raised transition-transform',
                form.isRequired ? 'translate-x-4' : 'translate-x-0.5')} />
            </button>
          </div>
          <IField label="Validation rules (JSON)">
            <textarea value={form.validationRulesJson} onChange={e => set('validationRulesJson', e.target.value)}
              rows={2} placeholder='{"minLength":3,"maxLength":255}'
              className="w-full px-2 py-1.5 text-[9px] font-mono bg-surface-overlay border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
          </IField>
          <IField label="Conditional (dependsOnJson)">
            <textarea value={form.dependsOnJson} onChange={e => set('dependsOnJson', e.target.value)}
              rows={2} placeholder='{"field":"issue_type","operator":"eq","value":"INTERNAL"}'
              className="w-full px-2 py-1.5 text-[9px] font-mono bg-surface-overlay border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
            <p className="text-[9px] text-text-muted mt-0.5">Field only shows when condition is true</p>
          </IField>
        </InspectorSection>
      )}

      {/* Options — SELECT / MULTI_SELECT / RADIO / CHECKBOX */}
      {needsOptions && (
        <InspectorSection title="Options source">
          <IField label="Options component key">
            <IInp value={form.optionsComponentKey} onChange={v => set('optionsComponentKey', v)} placeholder="issue_severity_options" mono />
            <p className="text-[9px] text-text-muted mt-0.5">Create this key in Screen Designer → Components, then link here</p>
          </IField>
        </InspectorSection>
      )}

      {/* Lookup */}
      {needsLookup && (
        <InspectorSection title="Lookup config">
          <IField label="Entity type">
            <IInp value={form.lookupEntityType} onChange={v => set('lookupEntityType', v)} placeholder="USER, VENDOR, RISK" />
          </IField>
        </InspectorSection>
      )}

      {/* Textarea rows */}
      {needsRows && (
        <InspectorSection title="Display">
          <IField label="Rows">
            <IInp value={String(form.rowsCount || '')} onChange={v => set('rowsCount', v)} placeholder="3" />
          </IField>
        </InspectorSection>
      )}

      {/* Slider / rating range */}
      {needsRange && (
        <InspectorSection title="Range">
          <IField label="Min value">
            <IInp value={String(form.minValue || '')} onChange={v => set('minValue', v)} placeholder="0" />
          </IField>
          <IField label="Max value">
            <IInp value={String(form.maxValue || '')} onChange={v => set('maxValue', v)} placeholder="10" />
          </IField>
        </InspectorSection>
      )}

      {/* Tag suggestions */}
      {needsTags && (
        <InspectorSection title="Autocomplete">
          <IField label="Tag suggestions (comma-separated)">
            <IInp value={form.tagSuggestions} onChange={v => set('tagSuggestions', v)} placeholder="SOX,GDPR,ISO27001" />
          </IField>
        </InspectorSection>
      )}

      {/* FIX: Per-field visibility — which roles can see this field.
          Uses a derived screenKey so each field gets its own layout record. */}
      {form.fieldKey && (
        <RoleVisibilityEditor screenKey={`${screenKey}_field_${form.fieldKey}`} />
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {initial?.id && (
          <button onClick={() => { if (confirm('Delete this field?')) deleteMut.mutate() }}
            className="flex items-center gap-1 text-[10px] text-status-fail-fg hover:text-status-fail-fg border border-status-fail-bd hover:border-status-fail-bd rounded px-2 py-1 transition-colors">
            <Trash2 size={10} /> Delete
          </button>
        )}
        <button onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="flex-1 text-[10px] font-medium text-brand-900 bg-brand-500 hover:bg-brand-600 rounded py-1.5 transition-colors disabled:opacity-50">
          {saveMut.isPending ? 'Saving…' : initial?.id ? 'Update field' : 'Add field'}
        </button>
      </div>
    </div>
  )
}


export { FormFieldInspector }
