import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMemo, useState, useRef, useEffect } from 'react'
import { useFormConfig } from '../../hooks/useUIConfig'
import { DynamicSelect, Select } from '../ui/Select'
import { useScreenConfig } from '../../hooks/useUIConfig'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { Skeleton } from '../ui/EmptyState'
import { AlertTriangle, Search, X } from 'lucide-react'
import api from '../../config/axios.config'
import { BRAND_PRESETS } from '../../config/brandPresets'

// <input type="color"> only accepts a literal hex — a CSS var breaks the control.
const COLOR_FIELD_DEFAULT = BRAND_PRESETS[0].hex

// Lookup entity types that should be filtered by the current framework when a
// frameworkRef context is present. AUDIT_TEMPLATE is the main one (the engagement
// create form's template picker); add others (e.g. AUDIT_CONTROL) as needed.
const FRAMEWORK_SCOPED_LOOKUPS = new Set(['AUDIT_TEMPLATE'])

export function DynamicForm({ formKey, onSubmit, defaultValues = {}, extraConfig, submitLabel = 'Submit', loading,
  hiddenFields = [],      // from vc.hiddenFields  — fields to hide entirely
  readOnlyFields = [],    // from vc.readOnlyFields — fields rendered as read-only text
  editableFields = null,  // from vc.editableFields — when set, ONLY these are editable (null = all editable)
  contextParams = null,   // runtime params (e.g. { frameworkref }) injected into framework-scoped lookups
}) {
  const { data: formConfig, isLoading: loadingForm } = useFormConfig(formKey)
  // formConfig.components is populated by the backend getForm endpoint,
  // which calls findByScreenForTenant(formKey) — returning components where
  // screen = formKey (e.g. issue_create_form) plus global components (screen IS NULL).
  const formComponents = formConfig?.components ?? formConfig?.data?.components
  const config = extraConfig || (formComponents ? { components: formComponents } : null)

  const schema = useMemo(() => {
    if (!formConfig?.fields) return z.object({})
    const shape = {}
    for (const field of formConfig.fields) {
      if (!field.isRequired && !field.validationRulesJson) {
        shape[field.fieldKey] = z.any().optional()
        continue
      }
      shape[field.fieldKey] = buildZodField(field)
    }
    return z.object(shape)
  }, [formConfig])

  const { register, control, handleSubmit, setError, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onTouched',
  })
  const watchedValues = watch()
  const [serverError, setServerError] = useState(null)

  const handleFormSubmit = async (data) => {
    setServerError(null)
    try {
      await onSubmit(data)
    } catch (err) {
      const fieldErrors = err?.fieldErrors
      if (fieldErrors && Object.keys(fieldErrors).length > 0) {
        Object.entries(fieldErrors).forEach(([field, message]) => {
          setError(field, { type: 'server', message: String(message) })
        })
        setServerError('Please fix the highlighted fields and try again.')
      } else {
        setServerError(err?.message || 'Submission failed. Please try again.')
      }
    }
  }

  if (loadingForm) return <div className="flex flex-col gap-3">{[1,2,3].map(i => <Skeleton key={i} className="h-8" />)}</div>
  if (!formConfig) return <p className="text-sm text-text-muted">Form not found: {formKey}</p>

  const fields = formConfig.fields || []

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col gap-4">
      {serverError && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-card bg-status-fail-bg border border-status-fail-bd text-xs text-status-fail-fg">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}
      <div className="grid grid-cols-12 gap-3">
        {fields.map(field => {
          // is_visible=0 — render as hidden input so value is still in the payload
          // but the user never sees it (e.g. workflowId defaulting to 15)
          if (field.isVisible === false || field.isVisible === 0) {
            // For hidden fields with dependsOnJson: only render (and register) the one
            // whose condition matches — prevents duplicate field keys with different defaults
            if (field.dependsOnJson && !isFieldVisible({ ...field, isVisible: 1 }, watchedValues)) {
              return null
            }
            return (
              <input
                key={field.fieldKey}
                type="hidden"
                {...register(field.fieldKey)}
                defaultValue={field.defaultValue ?? ''}
              />
            )
          }
          if (!isFieldVisible(field, watchedValues)) return null
          // Gap 1: respect vc.hiddenFields — skip fields the backend says to hide
          if (hiddenFields.includes(field.fieldKey)) return null
          // Gap 1: a field is editable when editableFields is null (all editable),
          // or when it is explicitly listed. readOnlyFields further overrides to read-only.
          const isEditable = (editableFields === null || editableFields.includes(field.fieldKey))
            && !readOnlyFields.includes(field.fieldKey)
          return (
            <div key={field.fieldKey} className={`col-span-${field.gridCols || 12}`}>
              <FormField
                field={field}
                register={register}
                control={control}
                error={errors[field.fieldKey]?.message}
                config={config}
                isEditable={isEditable}
                contextParams={contextParams}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={loading || isSubmitting} loadingText="Saving…" disabled={loading || isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  )
}

// ─── FieldWrapper ─────────────────────────────────────────────────────────────
// Single source of truth for label + required star + helper text + error message.
// Every field type renders through this so nothing is ever doubled or missing.
// TOGGLE and structural types (SECTION_HEADER, DIVIDER) suppress the top label
// because they own their own inline presentation.
function FieldWrapper({ label, isRequired, helperText, error, type, children }) {
  const showLabel = label && type !== 'SECTION_HEADER' && type !== 'DIVIDER' && type !== 'TOGGLE'
  return (
    <div className="flex flex-col gap-1">
      {showLabel && (
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide flex items-center gap-1">
          {label}
          {isRequired && <span className="text-status-fail-fg text-[10px]" title="Required">*</span>}
        </label>
      )}
      {children}
      {helperText && !error && <p className="text-[11px] text-text-muted">{helperText}</p>}
      {error && <p className="text-xs text-status-fail-fg">{error}</p>}
    </div>
  )
}

function FormField({ field, register, control, error, config, isEditable = true, contextParams = null }) {
  const { fieldKey: key, fieldType: type, label, placeholder, helperText, isRequired } = field

  // Gap 1: when read-only, render a plain text display instead of any interactive input.
  // Structural types (SECTION_HEADER, DIVIDER) are never interactive, skip them here.
  if (!isEditable && type !== 'SECTION_HEADER' && type !== 'DIVIDER') {
    return (
      <FieldWrapper label={label} isRequired={false} helperText={helperText} error={null} type={type}>
        <p className="text-sm text-text-primary px-3 py-1.5 rounded-ctl bg-surface-overlay/50 min-h-[36px] flex items-center">
          {field.defaultValue ?? <span className="text-text-muted/50 italic text-xs">—</span>}
        </p>
      </FieldWrapper>
    )
  }

  switch (type) {
    case 'TEXT': case 'EMAIL': case 'NUMBER': case 'DECIMAL':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <input
            placeholder={placeholder}
            type={type === 'NUMBER' || type === 'DECIMAL' ? 'number' : type === 'EMAIL' ? 'email' : 'text'}
            className="w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            {...register(key)}
          />
        </FieldWrapper>
      )

    case 'TEXTAREA':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <textarea
            placeholder={placeholder} rows={field.rowsCount || 3}
            className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            {...register(key)}
          />
        </FieldWrapper>
      )

    case 'SELECT':
      // FieldWrapper renders the label once above the select.
      // label={null} tells DynamicSelect/Select NOT to render their own internal
      // label — Select.jsx checks `label !== null` before rendering its <label> tag.
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <Controller name={key} control={control} render={({ field: f }) =>
            field.optionsComponentKey
              ? <DynamicSelect {...f} label={null} componentKey={field.optionsComponentKey} config={config} placeholder={placeholder} />
              : <Select       {...f} label={null} placeholder={placeholder} options={[]} />
          } />
        </FieldWrapper>
      )

    case 'TOGGLE':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <Controller name={key} control={control} render={({ field: f }) => {
            // Coerce DB integer (0/1) to boolean for consistent handling
            const boolVal = f.value === true || f.value === 1 || f.value === 'true' || f.value === '1'
            return (
            <div className="flex items-center gap-3 py-1">
              <button
                type="button" role="switch" aria-checked={boolVal}
                onClick={() => f.onChange(!boolVal)}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none',
                  boolVal ? 'bg-brand-500' : 'bg-surface-overlay border border-border'
                )}>
                <span className={cn(
                  'inline-block h-3.5 w-3.5 transform rounded-full bg-surface-raised transition-transform',
                  boolVal ? 'translate-x-4' : 'translate-x-0.5'
                )} />
              </button>
              <span className="text-sm text-text-primary">{label}</span>
            </div>
          )}} />
        </FieldWrapper>
      )

    case 'LOOKUP':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <Controller name={key} control={control} render={({ field: f }) =>
            <EntityLookupField
              value={f.value}
              onChange={f.onChange}
              onBlur={f.onBlur}
              placeholder={placeholder}
              lookupEntityType={field.lookupEntityType}
              lookupApiPath={field.lookupApiPath}
              // Framework-scoped lookups (e.g. AUDIT_TEMPLATE) get the runtime
              // frameworkRef so they list only this framework's options. Other
              // lookups (USER, WORKFLOW) are unaffected.
              contextParams={FRAMEWORK_SCOPED_LOOKUPS.has(field.lookupEntityType?.toUpperCase?.())
                ? contextParams : null}
              error={!!error}
            />
          } />
        </FieldWrapper>
      )

    case 'DATE':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <input type="date"
            className="w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
            {...register(key)} />
        </FieldWrapper>
      )

    case 'SECTION_HEADER':
      return (
        <div className="col-span-12 pt-2 pb-1 border-b border-border">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
        </div>
      )

    case 'DIVIDER':
      return <div className="col-span-12 border-t border-border my-1" />

    case 'PHONE':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <input type="tel" placeholder={placeholder || '+91 00000 00000'}
            className="w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            {...register(key)} />
        </FieldWrapper>
      )

    case 'URL':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <input type="url" placeholder={placeholder || 'https://'}
            className="w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            {...register(key)} />
        </FieldWrapper>
      )

    case 'DATE_RANGE':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <div className="flex items-center gap-2">
            <input type="date"
              className="flex-1 h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
              {...register(key + '_start')} />
            <span className="text-text-muted text-xs shrink-0">to</span>
            <input type="date"
              className="flex-1 h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
              {...register(key + '_end')} />
          </div>
        </FieldWrapper>
      )

    case 'MULTI_SELECT':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <Controller name={key} control={control} render={({ field: f }) => {
            const opts = config?.components?.[field.optionsComponentKey]?.options?.filter(o => o.isActive !== false) || []
            const selected = Array.isArray(f.value) ? f.value : (f.value ? [f.value] : [])
            const toggle = (val) => {
              const next = selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]
              f.onChange(next)
            }
            return (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-ctl border border-border bg-surface-raised min-h-[36px]">
                {opts.map(opt => (
                  <button key={opt.value} type="button" onClick={() => toggle(opt.value)}
                    className={cn('px-2 py-0.5 rounded text-[11px] font-medium border transition-colors',
                      selected.includes(opt.value)
                        ? 'bg-brand-500/20 border-brand-500/40 text-brand-ink'
                        : 'bg-surface-overlay border-border text-text-muted hover:text-text-secondary')}>
                    {opt.label}
                  </button>
                ))}
                {opts.length === 0 && <span className="text-xs text-text-muted italic">No options — add a UiComponent first</span>}
              </div>
            )
          }} />
        </FieldWrapper>
      )

    case 'RADIO':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <Controller name={key} control={control} render={({ field: f }) => {
            const opts = config?.components?.[field.optionsComponentKey]?.options?.filter(o => o.isActive !== false) || []
            return (
              <div className="flex flex-col gap-1.5">
                {opts.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={opt.value} checked={f.value === opt.value}
                      onChange={() => f.onChange(opt.value)}
                      className="accent-brand-500" />
                    <span className="text-sm text-text-primary">{opt.label}</span>
                  </label>
                ))}
              </div>
            )
          }} />
        </FieldWrapper>
      )

    case 'CHECKBOX':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <Controller name={key} control={control} render={({ field: f }) => {
            const opts = config?.components?.[field.optionsComponentKey]?.options?.filter(o => o.isActive !== false) || []
            if (opts.length === 0) {
              // Single boolean checkbox
              return (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!f.value} onChange={e => f.onChange(e.target.checked)}
                    className="rounded accent-brand-500" />
                  <span className="text-sm text-text-primary">{label}</span>
                </label>
              )
            }
            const selected = Array.isArray(f.value) ? f.value : []
            const toggle = (val) => {
              const next = selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]
              f.onChange(next)
            }
            return (
              <div className="flex flex-col gap-1.5">
                {opts.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selected.includes(opt.value)}
                      onChange={() => toggle(opt.value)} className="rounded accent-brand-500" />
                    <span className="text-sm text-text-primary">{opt.label}</span>
                  </label>
                ))}
              </div>
            )
          }} />
        </FieldWrapper>
      )

    case 'RATING':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <Controller name={key} control={control} render={({ field: f }) => {
            const max = field.maxValue || 5
            return (
              <div className="flex items-center gap-1">
                {Array.from({ length: max }, (_, i) => i + 1).map(star => (
                  <button key={star} type="button" onClick={() => f.onChange(star)}
                    className={cn('text-lg transition-colors', star <= (f.value || 0) ? 'text-status-warn-fg' : 'text-text-muted hover:text-status-warn-fg')}>
                    ★
                  </button>
                ))}
                {f.value > 0 && (
                  <button type="button" onClick={() => f.onChange(0)}
                    className="text-[10px] text-text-muted hover:text-text-secondary ml-1 transition-colors">
                    Clear
                  </button>
                )}
              </div>
            )
          }} />
        </FieldWrapper>
      )

    case 'SLIDER':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <Controller name={key} control={control} render={({ field: f }) => (
            <div className="flex items-center gap-3">
              <input type="range"
                min={field.minValue ?? 0} max={field.maxValue ?? 100} step={field.stepValue ?? 1}
                value={f.value ?? field.minValue ?? 0}
                onChange={e => f.onChange(Number(e.target.value))}
                className="flex-1 accent-brand-500" />
              <span className="text-xs font-mono text-text-secondary w-10 text-right tabular-nums">
                {f.value ?? field.minValue ?? 0}
              </span>
            </div>
          )} />
        </FieldWrapper>
      )

    case 'CURRENCY':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <div className="flex items-center gap-0">
            <span className="flex items-center justify-center h-9 px-3 rounded-l-md border border-r-0 border-border bg-surface-overlay text-xs text-text-muted font-mono shrink-0">
              {field.currencyCode || 'USD'}
            </span>
            <input type="number" step="0.01" placeholder={placeholder || '0.00'}
              className="flex-1 h-9 rounded-r-md border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
              {...register(key)} />
          </div>
        </FieldWrapper>
      )

    case 'COLOR':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <Controller name={key} control={control} render={({ field: f }) => (
            <div className="flex items-center gap-2">
              <input type="color" value={f.value || COLOR_FIELD_DEFAULT}
                onChange={e => f.onChange(e.target.value)}
                className="h-9 w-12 rounded-ctl border border-border bg-surface-raised cursor-pointer p-0.5" />
              <span className="text-xs font-mono text-text-secondary">{f.value || COLOR_FIELD_DEFAULT}</span>
            </div>
          )} />
        </FieldWrapper>
      )

    case 'TAG':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <Controller name={key} control={control} render={({ field: f }) => {
            const tags = Array.isArray(f.value) ? f.value : (f.value ? String(f.value).split(',').map(t => t.trim()).filter(Boolean) : [])
            const suggestions = field.tagSuggestions ? field.tagSuggestions.split(',').map(s => s.trim()).filter(Boolean) : []
            const [input, setInput] = useState('')
            const addTag = (tag) => {
              const t = tag.trim()
              if (t && !tags.includes(t)) f.onChange([...tags, t])
              setInput('')
            }
            return (
              <div className="rounded-ctl border border-border bg-surface-raised px-2 py-1.5 flex flex-wrap gap-1 min-h-[36px]">
                {tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand-500/15 text-brand-ink text-[11px] font-medium">
                    {tag}
                    <button type="button" onClick={() => f.onChange(tags.filter(t => t !== tag))}
                      className="hover:text-status-fail-fg transition-colors">×</button>
                  </span>
                ))}
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input) } }}
                  placeholder={tags.length === 0 ? (placeholder || 'Type and press Enter…') : ''}
                  list={key + '_suggestions'}
                  className="flex-1 min-w-[80px] bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none" />
                {suggestions.length > 0 && (
                  <datalist id={key + '_suggestions'}>
                    {suggestions.map(s => <option key={s} value={s} />)}
                  </datalist>
                )}
              </div>
            )
          }} />
        </FieldWrapper>
      )

    case 'MULTILINE_LIST':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <Controller name={key} control={control} render={({ field: f }) => {
            // Parse JSON string from DB e.g. '["a","b"]' into array
            const rawVal = f.value
            const items = Array.isArray(rawVal) ? rawVal
              : (typeof rawVal === 'string' && rawVal.trim().startsWith('['))
                ? (() => { try { return JSON.parse(rawVal) } catch { return [] } })()
              : []
            const [input, setInput] = useState('')
            return (
              <div className="space-y-1.5">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={item} onChange={e => { const next = [...items]; next[i] = e.target.value; f.onChange(next) }}
                      className="flex-1 h-8 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                    <button type="button" onClick={() => f.onChange(items.filter((_, j) => j !== i))}
                      className="text-text-muted hover:text-status-fail-fg transition-colors text-xs px-1">✕</button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder || 'Add item…'}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (input.trim()) { f.onChange([...items, input.trim()]); setInput('') } } }}
                    className="flex-1 h-8 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  <button type="button" onClick={() => { if (input.trim()) { f.onChange([...items, input.trim()]); setInput('') } }}
                    className="text-xs px-2.5 py-1 rounded bg-surface-overlay border border-border text-text-secondary hover:text-text-primary transition-colors">Add</button>
                </div>
              </div>
            )
          }} />
        </FieldWrapper>
      )

    case 'FILE': case 'FILE_MULTI':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <label className="flex flex-col items-center justify-center h-20 rounded-ctl border-2 border-dashed border-border bg-surface-raised cursor-pointer hover:border-brand-500/40 hover:bg-brand-500/3 transition-colors">
            <span className="text-xs text-text-muted">Click to upload{type === 'FILE_MULTI' ? ' (multiple)' : ''}</span>
            <span className="text-[10px] text-text-muted mt-0.5">{placeholder || 'PDF, PNG, JPG, DOCX…'}</span>
            <input type="file" multiple={type === 'FILE_MULTI'} className="sr-only" {...register(key)} />
          </label>
        </FieldWrapper>
      )

    case 'JSON_EDITOR':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <textarea
            placeholder={placeholder || '{\n  \n}'}
            rows={field.rowsCount || 8}
            spellCheck={false}
            className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-y"
            {...register(key)} />
        </FieldWrapper>
      )

    case 'RICH_TEXT':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <textarea
            placeholder={placeholder}
            rows={field.rowsCount || 6}
            className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-y"
            {...register(key)} />
          <p className="text-[10px] text-text-muted">Rich text editor — TipTap integration pending</p>
        </FieldWrapper>
      )

    default:
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <input placeholder={placeholder}
            className="w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            {...register(key)} />
        </FieldWrapper>
      )
  }
}

function isFieldVisible(field, values) {
  // Respect is_visible=0 from the DB — field hidden entirely from UI
  // but still included in form payload via hidden input (see render logic below)
  if (field.isVisible === false || field.isVisible === 0) return false
  if (!field.dependsOnJson) return true
  try {
    const dep = typeof field.dependsOnJson === 'string'
      ? JSON.parse(field.dependsOnJson) : field.dependsOnJson
    const actual = values[dep.field]
    if (dep.operator === 'eq')  return actual === dep.value
    if (dep.operator === 'neq') return actual !== dep.value
    if (dep.operator === 'in')  return Array.isArray(dep.value) && dep.value.includes(actual)
    return true
  } catch { return true }
}

// ─── EntityLookupField ────────────────────────────────────────────────────────
// Generic search-as-you-type lookup for any entity type stored in our DB.
// Routes to the correct endpoint based on lookupEntityType (set in Screen Designer).
//
// Supported lookupEntityType values and their endpoints:
//   USER            → GET /v1/users?search=firstname={q};lastname={q}
//   ROLE            → GET /v1/admin/rbac/roles?search={q}  (returns id + name)
//   AUDIT_TEMPLATE  → GET /v1/audit/library/templates?search={q}
//   AUDIT_PROJECT   → GET /v1/audit/projects?search={q}
//   WORKFLOW        → GET /v1/workflows?search={q}
//   VENDOR          → GET /v1/vendors?search={q}
//   AUDIT_CONTROL   → GET /v1/audit/library/controls?search={q}
//   (any other)     → GET /{lookupApiPath}?search={q}  (explicit override)
//
// labelKey / valueKey are derived per entity type but can be overridden.
// Always stores the entity ID as the form value (not the label string).

const LOOKUP_CONFIG = {
  // USER: already works — existing UserLookupField format preserved
  USER:           { path: '/v1/users',                    search: (q) => `firstname=${q};lastname=${q}`, labelFn: (r) => [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email, subFn: (r) => r.email, idFn: (r) => r.userId ?? r.id },
  // ROLE: correct endpoint is /v1/admin/roles (not /v1/admin/rbac/roles which has no list)
  ROLE:           { path: '/v1/admin/roles',              search: (q) => `name=${q}`, labelFn: (r) => r.name, subFn: (r) => r.side || r.roleSide || '' },
  // AUDIT_TEMPLATE: GET /v1/audit/library/templates — supports search=name=X via DbRepository
  AUDIT_TEMPLATE: { path: '/v1/audit/library/templates',  search: (q) => `name=${q}`, labelFn: (r) => r.name, subFn: (r) => r.frameworkRef || '' },
  // AUDIT_PROJECT: GET /v1/audit/projects — supports search=name=X
  AUDIT_PROJECT:  { path: '/v1/audit/projects',           search: (q) => `name=${q}`, labelFn: (r) => r.name, subFn: (r) => r.projectRef || '' },
  // WORKFLOW: GET /v1/workflows — supports search via DbRepository + entityType filter
  WORKFLOW:       { path: '/v1/workflows',                 search: (q) => `name=${q}`, labelFn: (r) => r.name, subFn: (r) => r.entityType || '' },
  // VENDOR: GET /v1/vendors — supports search=name=X
  VENDOR:         { path: '/v1/vendors',                   search: (q) => `name=${q}`, labelFn: (r) => r.name, subFn: (r) => r.domain || '' },
  // AUDIT_CONTROL: GET /v1/audit/library/controls — supports search=name=X
  AUDIT_CONTROL:  { path: '/v1/audit/library/controls',   search: (q) => `name=${q}`, labelFn: (r) => r.name, subFn: (r) => r.controlTag || '' },
  // AUDIT_SECTION: GET /v1/audit/library/sections/roots — top-level sections only
  AUDIT_SECTION:  { path: '/v1/audit/library/sections/roots', search: (q) => `name=${q}`, labelFn: (r) => r.name, subFn: (r) => '' },
  // AUDIT_ENGAGEMENT: GET /v1/audit/engagements — supports search=name=X
  AUDIT_ENGAGEMENT: { path: '/v1/audit/engagements',      search: (q) => `name=${q}`, labelFn: (r) => r.name, subFn: (r) => r.status || '' },
  // AUDIT_POLICY: GET /v1/audit/library/policies — supports search=title=X
  AUDIT_POLICY:   { path: '/v1/audit/library/policies',   search: (q) => `title=${q}`, labelFn: (r) => r.title || r.name, subFn: (r) => r.policyRef || '' },
}

function EntityLookupField({ value, onChange, onBlur, placeholder, lookupEntityType, lookupApiPath, error, contextParams }) {
  // Resolve config — explicit path overrides entity type config
  const cfg = LOOKUP_CONFIG[lookupEntityType?.toUpperCase?.()] || LOOKUP_CONFIG.USER

  // Split lookupApiPath into base path + pre-set query params.
  // e.g. '/v1/workflows?entityType=AUDIT_PROJECT' → basePath='/v1/workflows', extraParams={entityType:'AUDIT_PROJECT'}
  // This is needed so ID-resolution fetches use `${basePath}/${id}` (not `${fullPath}/${id}`
  // which would produce a malformed URL like '/v1/workflows?entityType=AUDIT_PROJECT/16').
  const [basePath, extraParams] = (() => {
    const raw = lookupApiPath || cfg.path
    const qIdx = raw.indexOf('?')
    if (qIdx === -1) return [raw, {}]
    const base = raw.slice(0, qIdx)
    const params = Object.fromEntries(new URLSearchParams(raw.slice(qIdx + 1)))
    return [base, params]
  })()
  // Merge runtime context (e.g. { frameworkref: 'ISO27001' }) so the option
  // list is filtered to the current framework. Placed after path params so it
  // can't be accidentally overridden by a stale baked-in value.
  const mergedParams = { ...extraParams, ...(contextParams || {}) }

  const searchFmt = cfg.search
  const getLabel  = cfg.labelFn
  const getSub    = cfg.subFn
  const getId     = cfg.idFn || ((r) => r.id)
  const defaultPlaceholder = lookupEntityType
    ? `Search ${lookupEntityType.replace(/_/g,' ').toLowerCase()}…`
    : 'Search…'

  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [open,    setOpen]    = useState(false)
  const [display, setDisplay] = useState('')
  const debounce = useRef(null)
  const ref = useRef(null)

  // Resolve display label for an already-selected value.
  // Uses basePath so the ID fetch URL is clean: /v1/workflows/16 (not /v1/workflows?entityType=AUDIT_PROJECT/16).
  useEffect(() => {
    if (!value || display) return
    api.get(`${basePath}/${value}`)
      .then(r => {
        const item = r.data?.data || r.data
        setDisplay(getLabel(item) || String(value))
      })
      .catch(() => setDisplay(String(value)))
  }, [value]) // eslint-disable-line

  // Load initial results (shown on focus before typing).
  // Merges extraParams so e.g. entityType=AUDIT_PROJECT is always applied.
  const loadInitial = async () => {
    if (results.length > 0) { setOpen(true); return }
    try {
      const res = await api.get(basePath, { params: { ...mergedParams, take: 10 } })
      const items = Array.isArray(res?.items) ? res.items
        : Array.isArray(res?.data?.items) ? res.data.items
        : Array.isArray(res?.data) ? res.data
        : Array.isArray(res) ? res : []
      setResults(items)
      setOpen(items.length > 0)
    } catch { setResults([]) }
  }

  // Search as user types — merges extraParams with search term.
  useEffect(() => {
    if (!query.trim() || query.length < 2) { setOpen(results.length > 0); return }
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      try {
        const res = await api.get(basePath, {
          params: { ...mergedParams, search: searchFmt(query), take: 8 },
        })
        // axios interceptor unwraps ApiResponse.data, so res IS the payload directly
        // PaginatedResponse shape: { items: [...], pagination: {...} }
        const items = Array.isArray(res?.items) ? res.items
          : Array.isArray(res?.data?.items) ? res.data.items
          : Array.isArray(res?.data) ? res.data
          : Array.isArray(res) ? res
          : []
        setResults(items)
        setOpen(true)
      } catch { setResults([]) }
    }, 250)
  }, [query]) // eslint-disable-line

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); onBlur?.() } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onBlur])

  const select = (item) => {
    onChange(getId(item))
    setDisplay(getLabel(item))
    setQuery(''); setResults([]); setOpen(false)
  }
  const clear = () => { onChange(null); setDisplay(''); setQuery(''); onBlur?.() }
  const initials = display ? display.split(' ').map(p => p[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) : '?'

  return (
    <div className="relative" ref={ref}>
      {value && display ? (
        <div className={cn('flex items-center gap-2 h-9 px-3 rounded-ctl border bg-surface-raised text-sm text-text-primary', error ? 'border-status-fail-bd' : 'border-border')}>
          <div className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-ink text-[9px] font-semibold flex items-center justify-center shrink-0">
            {initials}
          </div>
          <span className="flex-1 truncate">{display}</span>
          <button type="button" onClick={clear} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={13} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            onFocus={() => { if (query.length >= 2) setOpen(true); else loadInitial() }}
            onBlur={() => { if (!open) onBlur?.() }}
            placeholder={placeholder || defaultPlaceholder}
            className={cn('w-full h-9 rounded-ctl border bg-surface-raised pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1', error ? 'border-status-fail-bd focus:ring-status-fail-bd' : 'border-border focus:ring-brand-500')}
          />
        </div>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-surface border border-border rounded-ctl shadow-lg max-h-64 overflow-y-auto">
          {results.map(item => (
            <button key={item.id} type="button" onMouseDown={() => select(item)}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-overlay text-left transition-colors">
              <div className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-ink text-[9px] font-semibold flex items-center justify-center shrink-0">
                {getLabel(item).split(' ').map(p => p[0]).filter(Boolean).join('').toUpperCase().slice(0,2) || '?'}
              </div>
              <div>
                <p className="text-xs font-medium text-text-primary">{getLabel(item)}</p>
                {getSub(item) && <p className="text-[10px] text-text-muted">{getSub(item)}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function buildZodField(field) {
  let rules = {}
  try { rules = field.validationRulesJson ? JSON.parse(field.validationRulesJson) : {} } catch {}

  const type = field.fieldType
  const label = field.label || field.fieldKey
  let v

  if (type === 'NUMBER' || type === 'DECIMAL') {
    v = z.coerce.number({ invalid_type_error: `${label} must be a number` })
    if (rules.min != null) v = v.min(rules.min, `${label} must be at least ${rules.min}`)
    if (rules.max != null) v = v.max(rules.max, `${label} must be at most ${rules.max}`)
    if (!field.isRequired) v = v.optional().or(z.literal(''))
    return v
  }
  if (type === 'EMAIL') {
    v = z.string().email(`${label}: invalid email address`)
    if (!field.isRequired) v = v.optional().or(z.literal(''))
    return v
  }
  if (type === 'TOGGLE') return z.boolean().optional()

  if (type === 'LOOKUP') {
    if (!field.isRequired) return z.any().optional()
    return z.any().refine(v => v !== null && v !== undefined && v !== '', { message: `${label} is required` })
  }

  if (['SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX'].includes(type)) {
    if (!field.isRequired) return z.any().optional()
    return z.union([
      z.string().min(1, `${label} is required`),
      z.array(z.string()).min(1, `${label} is required`),
    ], { errorMap: () => ({ message: `${label} is required` }) })
  }

  v = z.string()
  if (rules.minLength) v = v.min(rules.minLength, `${label} must be at least ${rules.minLength} characters`)
  if (rules.maxLength) v = v.max(rules.maxLength, `${label} must be at most ${rules.maxLength} characters`)
  if (rules.pattern)   v = v.regex(new RegExp(rules.pattern), rules.patternMessage || `${label}: invalid format`)

  if (!field.isRequired) v = v.optional().or(z.literal(''))
  else v = v.min(1, `${label} is required`)

  return v
}