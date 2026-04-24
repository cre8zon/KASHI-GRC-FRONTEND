import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, RefreshCw, Pencil, Trash2, ChevronRight, X,
  ToggleLeft, ToggleRight, GripVertical,
} from 'lucide-react'
import { uiAdminApi }  from '../../../api/uiConfig.api'
import { PageLayout }  from '../../../components/layout/PageLayout'
import { DataTable }   from '../../../components/ui/DataTable'
import { Button }      from '../../../components/ui/Button'
import { Badge }       from '../../../components/ui/Badge'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Input }       from '../../../components/ui/Input'
import { cn }          from '../../../lib/cn'
import toast           from 'react-hot-toast'

const FIELD_TYPES = [
  'TEXT','EMAIL','PASSWORD','NUMBER','DECIMAL',
  'SELECT','MULTI_SELECT','RADIO','CHECKBOX','TOGGLE',
  'DATE','DATETIME','TEXTAREA','RICH_TEXT',
  'FILE_UPLOAD','SECTION_HEADER','DIVIDER',
]
const HTTP_METHODS = ['POST','PUT','PATCH']

// ─── Hooks ────────────────────────────────────────────────────────────────────
const useForms = (params) => useQuery({
  queryKey: ['admin-forms', params],
  queryFn:  () => uiAdminApi.forms.list(params),
  keepPreviousData: true,
})

const useFormFields = (formId) => useQuery({
  queryKey: ['admin-form-fields', formId],
  queryFn:  () => uiAdminApi.formFields.list(formId),
  enabled:  !!formId,
})

function useFormMutation(fn, msg) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-forms'] }); toast.success(msg) },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })
}

function useFieldMutation(fn, formId, msg) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-form-fields', formId] }); toast.success(msg) },
    onError: (e) => toast.error(e?.message || 'Failed'),
  })
}

// ─── Field row (inside the Fields panel) ─────────────────────────────────────
function FieldRow({ field, formId, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    label: field.label, placeholder: field.placeholder,
    helperText: field.helperText, isRequired: field.isRequired,
    sortOrder: field.sortOrder, gridCols: field.gridCols,
    optionsComponentKey: field.optionsComponentKey,
  })
  const { mutate: update, isPending } = useFieldMutation(
    ({ id, data }) => uiAdminApi.formFields.update(id, data),
    formId, 'Field updated')

  const GRID_OPTIONS = [3, 4, 6, 8, 12]
  const typeColor = {
    TEXT:'cyan', EMAIL:'blue', SELECT:'purple', MULTI_SELECT:'purple',
    RADIO:'indigo', CHECKBOX:'amber', TOGGLE:'amber', NUMBER:'green',
    TEXTAREA:'cyan', FILE_UPLOAD:'orange', SECTION_HEADER:'gray', DIVIDER:'gray',
  }

  if (!editing) return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-overlay/50 group rounded transition-colors">
      <GripVertical size={12} className="text-text-muted/40 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-text-muted">{field.fieldKey}</span>
          <Badge value={field.fieldType} label={field.fieldType.replace('_',' ')}
            colorTag={typeColor[field.fieldType] || 'gray'} />
          {field.isRequired && <span className="text-[10px] text-red-400 font-medium">required</span>}
        </div>
        <p className="text-xs text-text-primary mt-0.5">{field.label}</p>
      </div>
      <span className="text-[10px] text-text-muted font-mono">
        {field.gridCols}col · #{field.sortOrder}
      </span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)}
          className="h-5 w-5 flex items-center justify-center rounded text-text-muted hover:text-brand-400 transition-colors">
          <Pencil size={10} />
        </button>
        <button onClick={() => onDelete(field.id)}
          className="h-5 w-5 flex items-center justify-center rounded text-text-muted hover:text-red-400 transition-colors">
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="px-3 py-3 bg-surface-overlay rounded-lg border border-border/60 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Input label="Label" value={form.label}
          onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
        <Input label="Placeholder" value={form.placeholder}
          onChange={e => setForm(f => ({ ...f, placeholder: e.target.value }))} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Input label="Helper Text" value={form.helperText}
          onChange={e => setForm(f => ({ ...f, helperText: e.target.value }))} />
        <Input label="Sort Order" type="number" value={form.sortOrder}
          onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">
            Grid Cols
          </label>
          <div className="flex gap-1">
            {GRID_OPTIONS.map(n => (
              <button key={n} onClick={() => setForm(f => ({ ...f, gridCols: n }))} type="button"
                className={cn('flex-1 h-7 rounded text-[10px] font-mono border transition-colors',
                  form.gridCols === n
                    ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                    : 'border-border text-text-muted hover:bg-surface-raised')}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
      {['SELECT','MULTI_SELECT','RADIO'].includes(field.fieldType) && (
        <Input label="Options Component Key" value={form.optionsComponentKey}
          onChange={e => setForm(f => ({ ...f, optionsComponentKey: e.target.value }))}
          placeholder="vendor_status" helperText="ComponentKey from Components table" />
      )}
      <div className="flex items-center justify-between">
        <button onClick={() => setForm(f => ({ ...f, isRequired: !f.isRequired }))} type="button"
          className={cn('flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded border transition-colors',
            form.isRequired ? 'bg-red-500/10 border-red-500/30 text-red-400'
                            : 'border-border text-text-muted hover:bg-surface-overlay')}>
          {form.isRequired ? <ToggleRight size={13}/> : <ToggleLeft size={13}/>}
          {form.isRequired ? 'Required' : 'Optional'}
        </button>
        <div className="flex gap-2">
          <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          <Button size="xs" loading={isPending}
            onClick={() => update({ id: field.id, data: form }, { onSuccess: () => setEditing(false) })}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Fields Panel ─────────────────────────────────────────────────────────────
function FieldsPanel({ form }) {
  const { data: fields, isLoading } = useFormFields(form.id)
  const qc = useQueryClient()
  const [newField, setNewField] = useState({
    fieldKey: '', fieldType: 'TEXT', label: '', isRequired: false,
    sortOrder: 0, gridCols: 12, isVisible: true,
  })

  const { mutate: createField, isPending: creating } = useMutation({
    mutationFn: () => uiAdminApi.formFields.create({ ...newField, formId: form.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-form-fields', form.id] })
      setNewField({ fieldKey: '', fieldType: 'TEXT', label: '', isRequired: false, sortOrder: 0, gridCols: 12, isVisible: true })
      toast.success('Field added')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed'),
  })

  const { mutate: deleteField } = useMutation({
    mutationFn: (id) => uiAdminApi.formFields.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-form-fields', form.id] }),
    onError: (e) => toast.error(e?.message || 'Failed'),
  })

  const fieldsList = Array.isArray(fields) ? fields : (fields?.data || [])

  return (
    <div className="flex flex-col gap-4">
      {/* Form summary */}
      <div className="p-3 bg-surface-overlay rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono text-brand-400">{form.formKey}</p>
          <Badge value={form.httpMethod} label={form.httpMethod} colorTag="blue" />
        </div>
        <p className="text-xs text-text-muted mt-0.5">→ {form.submitUrl}</p>
      </div>

      {/* Existing fields */}
      <div>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
          Fields ({fieldsList.length})
        </p>
        {isLoading && <p className="text-xs text-text-muted px-3 py-2">Loading…</p>}
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {fieldsList.map(f => (
            <FieldRow key={f.id} field={f} formId={form.id} onDelete={deleteField} />
          ))}
          {!isLoading && fieldsList.length === 0 && (
            <p className="text-xs text-text-muted italic px-3 py-2">No fields yet.</p>
          )}
        </div>
      </div>

      {/* Add field */}
      <div className="border-t border-border pt-3">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Add Field</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Input label="Field Key *" value={newField.fieldKey}
            onChange={e => setNewField(f => ({ ...f, fieldKey: e.target.value.toLowerCase().replace(/\s+/g,'_') }))}
            placeholder="vendor_name" />
          <Input label="Label *" value={newField.label}
            onChange={e => setNewField(f => ({ ...f, label: e.target.value }))}
            placeholder="Vendor Name" />
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div>
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Type *</label>
            <select value={newField.fieldType}
              onChange={e => setNewField(f => ({ ...f, fieldType: e.target.value }))}
              className="w-full h-8 rounded-md border border-border bg-surface-raised px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <Input label="Sort Order" type="number" value={newField.sortOrder}
            onChange={e => setNewField(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
          <Input label="Grid Cols" type="number" min="1" max="12" value={newField.gridCols}
            onChange={e => setNewField(f => ({ ...f, gridCols: parseInt(e.target.value) || 12 }))} />
        </div>
        <Button size="sm" icon={Plus} loading={creating}
          disabled={!newField.fieldKey.trim() || !newField.label.trim()}
          onClick={() => createField()}>
          Add Field
        </Button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FormsAdminPage() {
  const [page, setPage]           = useState(1)
  const [editTarget, setEditTarget]     = useState(null)  // form or true for create
  const [fieldsTarget, setFieldsTarget] = useState(null)  // form to manage fields
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading, refetch } = useForms({ skip: (page-1)*50, take: 50 })

  const { mutate: create, isPending: creating } = useFormMutation(
    uiAdminApi.forms.create, 'Form created')
  const { mutate: update, isPending: updating } = useFormMutation(
    ({ id, data }) => uiAdminApi.forms.update(id, data), 'Form updated')
  const { mutate: remove, isPending: deleting } = useFormMutation(
    (id) => uiAdminApi.forms.delete(id), 'Form deleted')

  const forms = data?.items || []

  const columns = [
    { key: 'id',          label: 'ID',         width: 55,  type: 'mono' },
    { key: 'formKey',     label: 'Form Key',   width: 200,
      render: (r) => <span className="text-xs font-mono text-text-secondary">{r.formKey}</span> },
    { key: 'title',       label: 'Title',      width: 180 },
    { key: 'httpMethod',  label: 'Method',     width: 80,
      render: (r) => <Badge value={r.httpMethod} label={r.httpMethod} colorTag="blue" /> },
    { key: 'submitUrl',   label: 'Submit URL', width: 220,
      render: (r) => <span className="text-xs font-mono text-text-muted truncate">{r.submitUrl}</span> },
    { key: '__actions',   label: '',           width: 130, type: 'custom',
      render: (r) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <Button size="xs" variant="ghost" icon={ChevronRight}
            onClick={() => setFieldsTarget(r)}>Fields</Button>
          <button onClick={() => setEditTarget(r)}
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
            <Pencil size={12} />
          </button>
          <button onClick={() => setDeleteTarget(r)}
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      )
    },
  ]

  const handleSubmit = (formData) => {
    if (editTarget === true) {
      create(formData, { onSuccess: () => setEditTarget(null) })
    } else {
      update({ id: editTarget.id, data: formData }, { onSuccess: () => setEditTarget(null) })
    }
  }

  return (
    <PageLayout
      title="Forms"
      subtitle="Dynamic form definitions — fields, types, and validation"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button size="sm" icon={Plus} onClick={() => setEditTarget(true)}>New Form</Button>
        </div>
      }
    >
      <DataTable columns={columns} data={forms}
        pagination={data?.pagination} onPageChange={setPage}
        loading={isLoading} emptyMessage="No forms defined yet."
        onRowClick={row => setFieldsTarget(row)} />

      {/* Create/Edit form modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)}
        title={editTarget === true ? 'New Form' : `Edit — ${editTarget?.formKey}`}
        size="md">
        {editTarget && (
          <FormFormModal
            item={editTarget === true ? null : editTarget}
            onSubmit={handleSubmit}
            isPending={creating || updating}
            onClose={() => setEditTarget(null)}
          />
        )}
      </Modal>

      {/* Fields panel */}
      <Modal open={!!fieldsTarget} onClose={() => setFieldsTarget(null)}
        title={`Fields — ${fieldsTarget?.formKey}`}
        subtitle={fieldsTarget?.title}
        size="lg">
        {fieldsTarget && <FieldsPanel form={fieldsTarget} />}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove(deleteTarget?.id, { onSuccess: () => setDeleteTarget(null) })}
        loading={deleting} title="Delete Form" variant="danger" confirmLabel="Delete"
        message={`Delete "${deleteTarget?.formKey}"? All its fields will also be deleted.`} />
    </PageLayout>
  )
}

function FormFormModal({ item, onSubmit, isPending, onClose }) {
  const [form, setForm] = useState({
    formKey:     item?.formKey     || '',
    title:       item?.title       || '',
    description: item?.description || '',
    submitUrl:   item?.submitUrl   || '',
    httpMethod:  item?.httpMethod  || 'POST',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Form Key *" value={form.formKey}
          onChange={e => set('formKey', e.target.value.toLowerCase().replace(/\s+/g,'_'))}
          placeholder="vendor_create"
          disabled={!!item}
          helperText="snake_case — cannot change after creation" />
        <Input label="Title" value={form.title}
          onChange={e => set('title', e.target.value)} placeholder="Create Vendor" />
      </div>
      <Input label="Description" value={form.description}
        onChange={e => set('description', e.target.value)}
        placeholder="Optional description shown above the form" />
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Input label="Submit URL *" value={form.submitUrl}
            onChange={e => set('submitUrl', e.target.value)}
            placeholder="/v1/vendors/onboard" />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">
            HTTP Method
          </label>
          <select value={form.httpMethod} onChange={e => set('httpMethod', e.target.value)}
            className="w-full h-8 rounded-md border border-border bg-surface-raised px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending}
          onClick={() => {
            if (!form.formKey.trim())   { toast.error('Form key required');  return }
            if (!form.submitUrl.trim()) { toast.error('Submit URL required'); return }
            onSubmit(form)
          }}>
          {item ? 'Save Changes' : 'Create Form'}
        </Button>
      </div>
    </div>
  )
}
