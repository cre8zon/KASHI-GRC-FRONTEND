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


function FormSubmitInspector({ screenKey, onSave }) {
  const qc = useQueryClient()

  // Load the UiForm row for this screen key
  const { data: formRes, isLoading } = useQuery({
    queryKey: ['sd-form', screenKey],
    queryFn: () => sdApi.getForm(screenKey),
    staleTime: 0,
  })
  const formRow = useMemo(() => {
    const items = formRes?.items || formRes?.data?.items || []
    return Array.isArray(items) ? (items[0] ?? null) : null
  }, [formRes])

  const [submitUrl,  setSubmitUrl]  = useState('')
  const [httpMethod, setHttpMethod] = useState('POST')
  const [title,      setTitle]      = useState('')
  const [description,setDescription]= useState('')

  // Populate once the form row loads
  useEffect(() => {
    if (formRow) {
      setSubmitUrl(formRow.submitUrl   || '')
      setHttpMethod(formRow.httpMethod || 'POST')
      setTitle(formRow.title           || '')
      setDescription(formRow.description || '')
    }
  }, [formRow])

  const saveMut = useMutation({
    mutationFn: () => {
      if (!formRow?.id) return Promise.reject(new Error('Form not found'))
      return sdApi.updateForm(formRow.id, {
        formKey: screenKey,
        title,
        description,
        submitUrl,
        httpMethod,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sd-form', screenKey] })
      toast.success('Submit config saved')
      onSave()
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  if (isLoading) return <div className="p-4 text-xs text-text-muted">Loading…</div>

  return (
    <div className="p-4 space-y-4">
      <InspectorSection title="Submit button config">
        <p className="text-[10px] text-text-muted mb-2">
          The built-in Submit button POSTs all field values to this endpoint.
          Leave blank to fall back to <code className="font-mono">ModuleBlueprint.apiBasePath</code>.
        </p>
        <IField label="HTTP method">
          <ISel value={httpMethod} onChange={setHttpMethod}
            options={HTTP_METHODS.map(m => ({ value: m, label: m }))} />
        </IField>
        <IField label="Submit URL">
          <IInp value={submitUrl} onChange={setSubmitUrl} placeholder="/v1/risks" mono />
          <p className="text-[9px] text-text-muted mt-0.5">Supports path params: {'{tenantId}'}, {'{id}'}</p>
        </IField>
      </InspectorSection>

      <InspectorSection title="Form metadata">
        <IField label="Title">
          <IInp value={title} onChange={setTitle} placeholder={screenKey} />
        </IField>
        <IField label="Description">
          <IInp value={description} onChange={setDescription} placeholder="Optional description shown above the form" />
        </IField>
      </InspectorSection>

      {formRow?.id && (
        <div className="px-2 py-1 rounded bg-surface-overlay border border-border text-[9px] text-text-muted font-mono">
          formId: {formRow.id} · GET /v1/ui-config/form/{screenKey}
        </div>
      )}

      <Button size="sm" icon={Save} loading={saveMut.isPending} onClick={() => saveMut.mutate()} className="w-full">
        Save submit config
      </Button>
    </div>
  )
}


export { FormSubmitInspector }
