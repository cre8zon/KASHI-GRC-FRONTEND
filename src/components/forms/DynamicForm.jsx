import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMemo } from 'react'
import { useFormConfig } from '../../hooks/useUIConfig'
import { Input, Textarea } from '../ui/Input'
import { DynamicSelect, Select } from '../ui/Select'
import { useScreenConfig } from '../../hooks/useUIConfig'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { Skeleton } from '../ui/EmptyState'

/**
 * DynamicForm — renders any form from DB form field definitions.
 * Builds Zod schema at runtime from validationRulesJson.
 * Supports: text, email, number, select, multiselect, textarea, toggle, date, file.
 * Conditional fields via dependsOnJson.
 */
export function DynamicForm({ formKey, onSubmit, defaultValues = {}, extraConfig, submitLabel = 'Submit', loading }) {
  const { data: formConfig, isLoading: loadingForm } = useFormConfig(formKey)
  const { data: screenConfig } = useScreenConfig(formKey)
  const config = extraConfig || screenConfig

  // Build Zod schema dynamically from DB validation rules
  const schema = useMemo(() => {
    if (!formConfig?.fields) return z.object({})
    const shape = {}
    for (const field of formConfig.fields) {
      if (!field.isRequired && !field.validationRulesJson) {
        shape[field.fieldKey] = z.any().optional()
        continue
      }
      let validator = buildZodField(field)
      shape[field.fieldKey] = validator
    }
    return z.object(shape)
  }, [formConfig])

  const { register, control, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  })
  const watchedValues = watch()

  if (loadingForm) return <div className="flex flex-col gap-3">{[1,2,3].map(i => <Skeleton key={i} className="h-8" />)}</div>
  if (!formConfig) return <p className="text-sm text-text-muted">Form not found: {formKey}</p>

  const fields = formConfig.fields || []
  const stepCount = formConfig.stepsJson ? JSON.parse(formConfig.stepsJson).length : 1

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="grid grid-cols-12 gap-3">
        {fields.map(field => {
          // Check conditional visibility
          if (!isFieldVisible(field, watchedValues)) return null
          return (
            <div key={field.fieldKey} className={`col-span-${field.gridCols || 12}`}>
              <FormField
                field={field}
                register={register}
                control={control}
                error={errors[field.fieldKey]?.message}
                config={config}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-end pt-2">
        <Button type="submit" loading={loading}>{submitLabel}</Button>
      </div>
    </form>
  )
}

function FormField({ field, register, control, error, config }) {
  const { fieldKey: key, fieldType: type, label, placeholder, helperText, isRequired } = field

  switch (type) {
    case 'TEXT': case 'EMAIL': case 'NUMBER': case 'DECIMAL':
      return <Input label={label} placeholder={placeholder} error={error} helperText={helperText}
        type={type === 'NUMBER' || type === 'DECIMAL' ? 'number' : type === 'EMAIL' ? 'email' : 'text'}
        {...register(key)} />

    case 'TEXTAREA':
      return <div className="flex flex-col gap-1">
        {label && <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</label>}
        <textarea
          placeholder={placeholder} rows={3}
          className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
          {...register(key)}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

    case 'SELECT':
      return (
        <Controller name={key} control={control} render={({ field: f }) =>
          field.optionsComponentKey
            ? <DynamicSelect {...f} componentKey={field.optionsComponentKey} config={config} label={label} error={error} placeholder={placeholder} />
            : <Select {...f} label={label} error={error} placeholder={placeholder} options={[]} />
        } />
      )

    case 'TOGGLE':
      return (
        <Controller name={key} control={control} render={({ field: f }) =>
          <div className="flex items-center gap-3 py-1">
            <button
              type="button"
              role="switch"
              aria-checked={!!f.value}
              onClick={() => f.onChange(!f.value)}
              className={cn(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2',
                f.value ? 'bg-brand-500' : 'bg-surface-overlay border border-border'
              )}
            >
              <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform', f.value ? 'translate-x-4.5' : 'translate-x-0.5')} />
            </button>
            <span className="text-sm text-text-primary">{label}</span>
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        } />
      )

    case 'DATE':
      return <Input type="date" label={label} error={error} {...register(key)} />

    case 'SECTION_HEADER':
      return <div className="col-span-12 pt-2 pb-1 border-b border-border"><p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p></div>

    case 'DIVIDER':
      return <div className="col-span-12 border-t border-border my-1" />

    default:
      return <Input label={label} placeholder={placeholder} error={error} {...register(key)} />
  }
}

function isFieldVisible(field, values) {
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

function buildZodField(field) {
  let rules = {}
  try { rules = field.validationRulesJson ? JSON.parse(field.validationRulesJson) : {} } catch {}

  const type = field.fieldType
  let v

  if (type === 'NUMBER' || type === 'DECIMAL') {
    v = z.coerce.number()
    if (rules.min != null) v = v.min(rules.min, `Min ${rules.min}`)
    if (rules.max != null) v = v.max(rules.max, `Max ${rules.max}`)
  } else if (type === 'EMAIL') {
    v = z.string().email('Invalid email')
  } else if (type === 'TOGGLE') {
    v = z.boolean()
  } else {
    v = z.string()
    if (rules.minLength) v = v.min(rules.minLength, `Min ${rules.minLength} characters`)
    if (rules.maxLength) v = v.max(rules.maxLength, `Max ${rules.maxLength} characters`)
    if (rules.pattern)   v = v.regex(new RegExp(rules.pattern), rules.patternMessage || 'Invalid format')
  }

  if (!field.isRequired) v = v.optional().or(z.literal(''))
  else v = v.min ? v.min(1, `${field.label} is required`) : v

  return v
}
