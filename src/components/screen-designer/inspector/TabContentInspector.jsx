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

function TabContentInspector({ tab, tabKey, screenKey, onSelectElement }) {
  const qc = useQueryClient()
  const formKey = `${screenKey}_tab_${tabKey}`

  // Load (or auto-create) the UiForm for this tab
  const { data: formRes, isLoading } = useQuery({
    queryKey: ['sd-form', formKey],
    queryFn:  () => sdApi.getForm(formKey),
    staleTime: 0,
  })
  const formId = useMemo(() => {
    const items = formRes?.items || formRes?.data?.items || []
    return Array.isArray(items) ? items[0]?.id ?? null : null
  }, [formRes])

  const createAttempted = useRef(false)
  const createMut = useMutation({
    mutationFn: () => sdApi.createForm({ formKey, title: `${tab} tab fields`, submitUrl: '', httpMethod: 'PUT' }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['sd-form', formKey] }),
    retry: false,
  })
  useEffect(() => {
    if (!isLoading && !formId && !createAttempted.current) {
      createAttempted.current = true
      createMut.mutate()
    }
  }, [isLoading, formId])

  const { data: fieldsRes } = useQuery({
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
      <InspectorSection title={`${tab} tab — content fields`}>
        <p className="text-[10px] text-text-muted leading-relaxed mb-3">
          Fields rendered inside the <strong className="font-medium text-text-secondary">{tab}</strong> tab.
          Each field is role/step aware — configure visibility per role in the field inspector.
          Stored under form key{' '}
          <code className="font-mono text-brand-400 text-[9px]">{formKey}</code>.
        </p>

        {fields.length === 0 ? (
          <div className="text-[11px] text-text-muted py-4 text-center border border-dashed border-border rounded-card">
            No fields yet — click "+ Add field" below
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
          className="w-full flex items-center justify-center gap-1.5 py-2 mt-1 border-2 border-dashed border-brand-500/25 hover:border-brand-500/50 rounded-card text-xs text-brand-400 font-medium transition-colors bg-brand-500/3">
          <Plus size={12} /> Add field to {tab} tab
        </button>
      </InspectorSection>

      {/* Role visibility — who can see this tab's content */}
      <RoleVisibilityEditor screenKey={`${screenKey}_tab_${tabKey}`} />
    </div>
  )
}


export { TabContentInspector }
