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


function FormCanvas({ screen, selectedElement, onSelectElement, actions }) {
  const qc = useQueryClient()

  // ── Load the UiForm row for this exact screen key ─────────────────────────
  // getForm sends ?formKey=issue_create_form&take=1
  // Backend returns ApiResponse<PaginatedResponse<...>> wrapped by axios as:
  //   res.data = { items: [...], pagination: {...} }  ← our standard shape
  const { data: formRes, isLoading: formLoading } = useQuery({
    queryKey: ['sd-form', screen.key],
    queryFn: () => sdApi.getForm(screen.key),
    staleTime: 0,  // always fresh — critical so we get the right form
  })

  // Extract form: handle all axios/ApiResponse wrapping shapes
  const formId = useMemo(() => {
    if (!formRes) return null
    // Shape A: axios returns res.data = PaginatedResponse = { items: [...] }
    const items = formRes?.items || formRes?.data?.items || []
    const first = Array.isArray(items) ? items[0] : null
    return first?.id ?? null
  }, [formRes])

  // Auto-create UiForm row if it doesn't exist for this key
  // Use a ref to prevent the retry loop — mutate only once per mount per key
  const createAttempted = useRef(false)
  const createFormMut = useMutation({
    // Fallback create — fires only if auto-draft in handleCreate failed or user
    // navigated directly to a FORM screen that has no DB record yet.
    mutationFn: () => sdApi.createForm({ formKey: screen.key, title: screen.key, submitUrl: '', httpMethod: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-form', screen.key] }); qc.invalidateQueries({ queryKey: ['sd-all-forms'] }) },
    onError: (e) => {
      // Log but don't retry — admin sees the amber message in Form info card
      console.warn('[Screen Designer] Could not auto-create UiForm:', e?.response?.data?.message || e.message)
    },
    retry: false,  // no automatic retries on failure
  })
  useEffect(() => {
    // Skip if auto-draft already created the form (formId is set) or still loading
    if (!formLoading && !formId && !createAttempted.current) {
      createAttempted.current = true
      createFormMut.mutate()
    }
  }, [formLoading, formId]) // eslint-disable-line

  // ── Load fields for this formId ────────────────────────────────────────────
  // Backend returns ApiResponse<List<...>> = { data: [...] }
  const { data: fieldsRes, refetch: refetchFields } = useQuery({
    queryKey: ['sd-form-fields', formId],
    queryFn: () => sdApi.listFields(formId),
    enabled: !!formId,
    staleTime: 0,
  })
  const fields = useMemo(() => {
    if (!fieldsRes) return []
    // ApiResponse<List> → axios res.data = [...] directly
    const raw = Array.isArray(fieldsRes) ? fieldsRes
               : Array.isArray(fieldsRes?.data) ? fieldsRes.data
               : []
    return raw
  }, [fieldsRes])

  // ── Drag-to-reorder state ──────────────────────────────────────────────────
  const [dragIndex, setDragIndex]         = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [manualOrder, setManualOrder]     = useState(null) // null = use server order

  // orderedFields: use manual order after a drag, otherwise server order
  const orderedFields = useMemo(() => {
    if (manualOrder) return manualOrder
    return [...fields].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }, [fields, manualOrder])

  // Reset manual order when fields reload from server
  useEffect(() => { setManualOrder(null) }, [formId])


  const reorderMut = useMutation({
    mutationFn: ({ id, sortOrder }) => sdApi.updateField(id, { sortOrder }),
    onError: () => toast.error('Failed to save field order'),
  })

  const handleDragStart = (e, index) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (index !== dragOverIndex) setDragOverIndex(index)
  }

  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null); setDragOverIndex(null); return
    }
    const next = [...orderedFields]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(dropIndex, 0, moved)
    // Assign new sortOrder values (10, 20, 30... to leave gaps for future inserts)
    const updated = next.map((f, i) => ({ ...f, sortOrder: (i + 1) * 10 }))
    setManualOrder(updated)
    setDragIndex(null); setDragOverIndex(null)
    // Persist each field's new sortOrder
    updated.forEach(f => reorderMut.mutate({ id: f.id, sortOrder: f.sortOrder }))
  }

  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null) }

  // ── Field type → preview renderer ─────────────────────────────────────────
  const fieldPreview = (f) => {
    switch (f.fieldType) {
      case 'TEXTAREA': return (
        <div className="h-14 bg-background border border-border rounded text-xs text-text-muted flex items-start px-3 py-2">
          {f.placeholder || `Enter ${f.label?.toLowerCase()}…`}
        </div>
      )
      case 'SELECT': case 'MULTI_SELECT': return (
        <div className="h-8 bg-background border border-border rounded text-xs text-text-muted flex items-center px-3 gap-1">
          <span className="flex-1">{f.placeholder || 'Select…'}</span>
          <ChevronDown size={11} className="text-text-muted" />
        </div>
      )
      case 'TOGGLE': return (
        <div className="flex items-center gap-2">
          <div className="w-9 h-5 rounded-full bg-brand-500 flex items-center px-0.5">
            <div className="w-4 h-4 rounded-full bg-surface-raised translate-x-4" />
          </div>
          <span className="text-xs text-text-muted">{f.label}</span>
        </div>
      )
      case 'DATE': return (
        <div className="h-8 bg-background border border-border rounded text-xs text-text-muted flex items-center px-3 gap-2">
          <Calendar size={12} /> {f.placeholder || 'Pick a date'}
        </div>
      )
      case 'SECTION_HEADER': return (
        <div className="py-1 border-b border-border">
          <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{f.label}</span>
        </div>
      )
      case 'DIVIDER': return <div className="h-px bg-border" />
      case 'MULTILINE_LIST': return (
        <div className="border border-border rounded p-2 space-y-1">
          <div className="h-6 bg-background border border-border/50 rounded text-[10px] text-text-muted flex items-center px-2">Item 1</div>
          <button className="text-[10px] text-brand-ink">+ Add item</button>
        </div>
      )
      default: return (
        <div className="h-8 bg-background border border-border rounded text-xs text-text-muted flex items-center px-3">
          {f.placeholder || `Enter ${f.label?.toLowerCase() || 'value'}…`}
        </div>
      )
    }
  }

  if (formLoading) return <div className="p-6 text-xs text-text-muted text-center">Loading form…</div>

  return (
    <div className="space-y-3">
      <CanvasCard label="Form fields" hint={`${fields.length} field${fields.length !== 1 ? 's' : ''} · click to configure`}>
        <div className="p-4 space-y-2">
          {fields.length === 0 && (
            <div className="py-6 text-center text-xs text-text-muted border border-dashed border-border rounded-card">
              No fields yet — click &quot;+ Add field&quot; below
            </div>
          )}

          {/* Render fields in a 12-col grid respecting gridCols — drag grip to reorder */}
          <div className="grid grid-cols-12 gap-2">
            {orderedFields.map((f, index) => (
              <div key={f.id}
                draggable
                onDragStart={e => handleDragStart(e, index)}
                onDragOver={e => handleDragOver(e, index)}
                onDrop={e => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelectElement({ type: 'form_field', id: f.id, data: { ...f }, screenKey: screen.key, formId })}
                style={{ gridColumn: `span ${f.gridCols || 12}` }}
                className={cn(
                  'flex flex-col gap-1 p-2 rounded-card border transition-all cursor-pointer group',
                  dragIndex === index && 'opacity-40',
                  dragOverIndex === index && dragIndex !== index && 'border-brand-500 bg-brand-500/5 scale-[1.01]',
                  selectedElement?.id === f.id
                    ? 'border-brand-500 bg-brand-500/5'
                    : f.fieldType === 'SECTION_HEADER' || f.fieldType === 'DIVIDER'
                      ? 'border-transparent hover:border-border col-span-12'
                      : 'border-transparent hover:border-border'
                )}>
                {f.fieldType !== 'SECTION_HEADER' && f.fieldType !== 'DIVIDER' && f.fieldType !== 'TOGGLE' && (
                  <label className="text-xs font-medium text-text-primary flex items-center gap-1">
                    <GripVertical size={11} className="text-text-muted opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0 -ml-1" />
                    {f.label}
                    {f.isRequired && <span className="text-status-fail-fg">*</span>}
                    <span className="ml-auto text-[9px] font-mono text-text-muted">{f.fieldType}</span>
                  </label>
                )}
                {fieldPreview(f)}
              </div>
            ))}
          </div>

          <button
            onClick={() => onSelectElement({ type: 'new_form_field', screenKey: screen.key, formId, label: 'New field', onSaved: () => { qc.invalidateQueries({ queryKey: ['sd-form-fields', formId] }) } })}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 mt-2 border-2 border-dashed border-brand-500/30 hover:border-brand-500/60 rounded-card text-xs text-brand-ink hover:text-brand-ink font-medium transition-colors bg-brand-500/3 hover:bg-brand-500/6">
            <Plus size={13} /> Add field
          </button>
        </div>
      </CanvasCard>

      {/* Form action buttons — always rendered at the bottom of every form */}
      <CanvasCard label="Form buttons" hint="Click Submit to configure endpoint · Cancel is built-in · add extra buttons via Inspector">
        <div className="flex items-center gap-3 p-4">
          {/* FIX: Submit is a built-in button wired to the form's submitUrl — clicking it opens
              the form-level submit config inspector (not new_action which is for extra buttons) */}
          <button
            onClick={() => onSelectElement({ type: 'form_submit_config', screenKey: screen.key, formId })}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-ctl text-xs font-medium bg-brand-500 text-brand-900 hover:bg-brand-600 transition-colors',
              selectedElement?.type === 'form_submit_config' ? 'ring-2 ring-brand-500/60' : ''
            )}>
            Submit
          </button>
          <button
            onClick={() => onSelectElement({ type: 'form_cancel_config', screenKey: screen.key })}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-ctl text-xs font-medium border border-border text-text-secondary hover:border-border-strong transition-colors',
              selectedElement?.type === 'form_cancel_config' ? 'ring-2 ring-brand-500/40' : ''
            )}>
            Cancel
          </button>
          {actions.map(action => (
            <button key={action.id}
              onClick={e => { e.stopPropagation(); onSelectElement({ type: 'action', id: action.id, data: action, screenKey: screen.key }) }}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-ctl text-xs font-medium border transition-all hover:scale-105',
                selectedElement?.id === action.id ? 'ring-2 ring-brand-500/60' : '',
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
            className="px-3 py-2 rounded-ctl text-xs text-text-muted border border-dashed border-border hover:border-brand-500/40 hover:text-brand-ink transition-colors">
            + Add button
          </button>
        </div>
      </CanvasCard>

      {/* Form metadata */}
      <CanvasCard label="Form info">
        <div className="px-4 py-3 space-y-1 text-[10px] text-text-muted">
          <div className="flex items-center gap-2">
            <span className="font-mono text-brand-ink">{screen.key}</span>
            <span>→</span>
            <span>GET /v1/ui-config/form/{screen.key}</span>
          </div>
          <p>Referenced as <code className="font-mono">createFormKey</code> in ModuleBlueprint. DynamicForm renders this at runtime.</p>
          {formId && (
            <p className="text-brand-ink font-mono">formId: {formId} · {fields.length} field{fields.length !== 1 ? 's' : ''}</p>
          )}
          {!formId && !formLoading && (
            <p className="text-status-warn-fg">No UiForm row found — click any field type in Inspector to auto-create</p>
          )}
        </div>
      </CanvasCard>
    </div>
  )
}


export { FormCanvas }