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

function ActionInspector({ initial, screenKey, onSave }) {
  const qc = useQueryClient()

  // Extract __formKey from payloadTemplateJson if it was set as a form-opening action
  const initialFormKey = useMemo(() => {
    try { return JSON.parse(initial?.payloadTemplateJson || '{}').__formKey || '' } catch { return '' }
  }, [initial?.payloadTemplateJson])

  const [form, setForm] = useState({
    actionKey: '', label: '', icon: '', variant: 'primary',
    httpMethod: 'POST', apiEndpoint: '', payloadTemplateJson: '',
    requiredPermission: '', allowedSides: '',
    allowedStatusesJson: '', requiresConfirmation: false,
    confirmationMessage: '', requiresRemarks: false,
    sortOrder: 0, isActive: true,
    ...initial,
    // Remove __formKey from payloadTemplateJson to show raw template in the textarea
    payloadTemplateJson: (() => {
      try {
        const p = JSON.parse(initial?.payloadTemplateJson || '{}')
        const { __formKey, __navRoute, ...rest } = p
        return Object.keys(rest).length > 0 ? JSON.stringify(rest) : ''
      } catch { return initial?.payloadTemplateJson || '' }
    })(),
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const [formKey, setFormKey] = useState(initialFormKey)

  const saveMut = useMutation({
    mutationFn: () => {
      // Build final payloadTemplateJson — if formKey is set, embed __formKey;
      // otherwise use the raw payloadTemplateJson textarea. Both can coexist.
      let finalPayload = form.payloadTemplateJson?.trim() || ''
      if (formKey?.trim()) {
        try {
          const existing = finalPayload ? JSON.parse(finalPayload) : {}
          finalPayload = JSON.stringify({ __formKey: formKey.trim(), ...existing })
        } catch {
          finalPayload = JSON.stringify({ __formKey: formKey.trim() })
        }
      }
      const body = { ...form, payloadTemplateJson: finalPayload || null, screenKey }
      return initial?.id
        ? api.put(`/v1/admin/ui/actions/${initial.id}`, body)
        : api.post('/v1/admin/ui/actions', body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-actions', screenKey] }); toast.success('Action saved'); onSave() },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/v1/admin/ui/actions/${initial.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-actions', screenKey] }); toast.success('Deleted'); onSave() },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  return (
    <div className="p-4 space-y-4">
      <InspectorSection title="Button">
        <IField label="Action key">
          <IInp value={form.actionKey} onChange={v => set('actionKey', v.toUpperCase().replace(/\s/g,'_'))} placeholder="SUBMIT_ANSWER" mono />
        </IField>
        <IField label="Label">
          <IInp value={form.label} onChange={v => set('label', v)} placeholder="Submit answer" />
        </IField>
        <IField label="Variant">
          <ISel value={form.variant} onChange={v => set('variant', v)} options={ACTION_VARIANTS.map(v => ({ value: v, label: v }))} />
        </IField>
        <IField label="Sort order">
          <IInp value={String(form.sortOrder)} onChange={v => set('sortOrder', parseInt(v)||0)} />
        </IField>
      </InspectorSection>

      {/* Action type — determines what happens when the button is clicked.
          Three types, driven by payloadTemplateJson convention so no backend changes needed:
            Opens form  → sets {"__formKey":"issue_create_form"} — opens DynamicForm modal
            Direct API  → standard POST/PUT/PATCH to apiEndpoint
          NavRoute is set via payloadTemplateJson directly: {"__navRoute":"/module/issue"} */}
      <InspectorSection title="Action type">
        <IField label="Opens form (form key)">
          <IInp value={formKey} onChange={setFormKey}
            placeholder="issue_create_form · issue_rca_form · issue_remediation_form" mono />
          <p className="text-[9px] text-text-muted mt-0.5">
            Set to open a DynamicForm modal instead of a direct API call.
            The form's <code className="font-mono">submitUrl</code> is overridden by the URL below.
          </p>
        </IField>
        {formKey && (
          <div className="px-2 py-1.5 rounded bg-teal-500/5 border border-teal-500/20 text-[9px] text-teal-400 font-mono">
            {"{"}&quot;__formKey&quot;:&quot;{formKey}&quot;{"}"} → stored in payloadTemplateJson
          </div>
        )}
      </InspectorSection>

      <InspectorSection title="API endpoint">
        <IField label="Method">
          <ISel value={form.httpMethod} onChange={v => set('httpMethod', v)} options={HTTP_METHODS.map(m => ({ value: m, label: m }))} />
        </IField>
        <IField label="URL">
          <IInp value={form.apiEndpoint} onChange={v => set('apiEndpoint', v)} placeholder="/v1/compound-tasks/{taskId}/..." mono />
          <p className="text-[9px] text-text-muted mt-0.5">Use {'{id}'}, {'{taskId}'}, {'{sectionKey}'}</p>
        </IField>
        <IField label="Extra payload (JSON)">
          <textarea value={form.payloadTemplateJson} onChange={e => set('payloadTemplateJson', e.target.value)}
            rows={2} placeholder='{"transition":"TRIAGE"}'
            className="w-full px-2 py-1.5 text-[10px] font-mono bg-surface-overlay border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
          <p className="text-[9px] text-text-muted mt-0.5">Merged with form data on submit. Do not set __formKey here — use the field above.</p>
        </IField>
      </InspectorSection>

      <InspectorSection title="Visibility rules">
        <IField label="Permission">
          <IInp value={form.requiredPermission} onChange={v => set('requiredPermission', v)} placeholder="risk.approve" mono />
          <p className="text-[9px] text-text-muted mt-0.5">Blank = no permission check</p>
        </IField>
        <IField label="Allowed sides">
          <div className="flex flex-wrap gap-1">
            {SIDES.map(s => {
              const sides = (form.allowedSides||'').split(',').filter(Boolean)
              const active = sides.includes(s)
              return (
                <button key={s} onClick={() => set('allowedSides', (active ? sides.filter(x=>x!==s) : [...sides,s]).join(','))}
                  className={cn('px-1.5 py-0.5 rounded text-[8px] border transition-colors',
                    active ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-border text-text-muted hover:border-border-strong')}>
                  {s}
                </button>
              )
            })}
          </div>
        </IField>
        <IField label="Status guard (JSON array)">
          <IInp value={form.allowedStatusesJson} onChange={v => set('allowedStatusesJson', v)} placeholder='["PENDING","IN_PROGRESS"]' mono />
          <p className="text-[9px] text-text-muted mt-0.5">Blank = always visible</p>
        </IField>
        <div className="space-y-1.5 pt-1">
          {[
            { k: 'requiresRemarks', l: 'Requires remarks' },
            { k: 'requiresConfirmation', l: 'Confirmation dialog' },
            { k: 'isActive', l: 'Active' },
          ].map(({k,l}) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} className="h-3 w-3 accent-brand-500" />
              <span className="text-[10px] text-text-secondary">{l}</span>
            </label>
          ))}
        </div>
        {form.requiresConfirmation && (
          <IField label="Confirmation message">
            <IInp value={form.confirmationMessage} onChange={v => set('confirmationMessage', v)} placeholder="Are you sure?" />
          </IField>
        )}
      </InspectorSection>

      {/* Workflow step visibility */}
      <WorkflowStepVisibility screenKey={screenKey} actionKey={form.actionKey} />

      {/* Save / delete */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        {initial?.id && (
          <button onClick={() => deleteMut.mutate()} className="p-1.5 text-text-muted hover:text-red-400 transition-colors">
            <Trash2 size={14} />
          </button>
        )}
        <Button size="sm" icon={Save} loading={saveMut.isPending} onClick={() => saveMut.mutate()} className="flex-1">
          Save action
        </Button>
      </div>
    </div>
  )
}


export { ActionInspector }
