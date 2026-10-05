import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMemo, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useFormConfig } from '../../hooks/useUIConfig'
import { DynamicSelect, Select } from '../ui/Select'
import { useScreenConfig } from '../../hooks/useUIConfig'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { Skeleton } from '../ui/EmptyState'
import { AlertTriangle, Check, Search, X } from 'lucide-react'
import api from '../../config/axios.config'
import { BRAND_PRESETS } from '../../config/brandPresets'

// <input type="color"> only accepts a literal hex — a CSS var breaks the control.
const COLOR_FIELD_DEFAULT = BRAND_PRESETS[0].hex

// Lookup entity types that should be filtered by the current framework when a
// frameworkRef context is present. AUDIT_TEMPLATE is the main one (the engagement
// create form's template picker); add others (e.g. AUDIT_CONTROL) as needed.
const FRAMEWORK_SCOPED_LOOKUPS = new Set(['AUDIT_TEMPLATE'])

/**
 * submitLabel accepts a STRING or a (values) => string.
 *
 * A consequential choice hidden in a toggle is easy to miss — the button
 * should say what it is about to do. "Adopt and approve 38 policies" is a
 * different act from "Adopt as drafts", and the user is about to click one
 * of them.
 */
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

  // ── DOTTED FIELD KEYS ─────────────────────────────────────────────────────
  //
  // A field_key may contain dots — vendor_onboard_form has four of them:
  // primaryContact.firstName, .lastName, .email, .jobTitle, because
  // VendorOnboardRequest.primaryContact is a NESTED object and the payload has
  // to be nested to deserialise.
  //
  // react-hook-form honours that: register('primaryContact.firstName') writes
  // into { primaryContact: { firstName: … } }. Good — that is exactly the
  // payload the backend wants.
  //
  // The zod schema did not. It keyed the shape on the literal string
  // 'primaryContact.firstName', so the resolver validated the NESTED values
  // against a FLAT schema and every one of those fields came back
  //
  //     Invalid input: expected string, received undefined
  //
  // On a single-page form that meant submit silently refused. On the wizard it
  // meant the Next button on step 3 did nothing at all — trigger() returned
  // false and there was nothing to show for it, because the error landed at
  // errors.primaryContact.firstName while the renderer looked in
  // errors['primaryContact.firstName']. A dead button and no message.
  //
  // So: build the shape NESTED when a key contains dots, and look errors up by
  // path. A key with no dots behaves exactly as before.
  const schema = useMemo(() => {
    if (!formConfig?.fields) return z.object({})
    const root = {}
    for (const field of formConfig.fields) {
      const leaf = (!field.isRequired && !field.validationRulesJson)
        ? z.any().optional()
        : buildZodField(field)
      const parts = String(field.fieldKey).split('.')
      if (parts.length === 1) { root[parts[0]] = leaf; continue }
      // Walk/create the intermediate shapes, then place the leaf.
      let cursor = root
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i]
        // A plain object here, converted to z.object() on the way out, so two
        // sibling keys under the same parent share one shape rather than the
        // second overwriting the first.
        if (!cursor[p] || typeof cursor[p] !== 'object' || cursor[p]._zod || cursor[p]._def) {
          cursor[p] = {}
        }
        cursor = cursor[p]
      }
      cursor[parts[parts.length - 1]] = leaf
    }
    // A nested parent must be optional, or a form where every child is
    // optional still fails on the missing parent object.
    const toZod = (node) => {
      const shape = {}
      for (const [k, v] of Object.entries(node)) {
        shape[k] = (v && typeof v === 'object' && !v._zod && !v._def && !v.safeParse)
          ? toZod(v).optional()
          : v
      }
      return z.object(shape)
    }
    return toZod(root)
  }, [formConfig])


  // Seed form state from each field's default_value.
  //
  // useForm was given ONLY the defaultValues prop, so a default_value set in
  // ui_form_fields never reached form state — it was used for hidden inputs and
  // read-only display and nowhere else.
  //
  // That is invisible on a text input and actively misleading on a SELECT: the
  // dropdown renders its first option, so the screen reads "Internal auditor"
  // while the value is undefined. Anything depending on that field
  // (depends_on_json) then evaluates against undefined and stays hidden until
  // the user changes the dropdown and changes it back.
  //
  // The passed prop still wins — editing an existing record must not be
  // overwritten by a field default.
  const seededDefaults = useMemo(() => {
    const fromFields = {}
    for (const f of formConfig?.fields || []) {
      if (f.defaultValue !== undefined && f.defaultValue !== null && f.defaultValue !== '') {
        fromFields[f.fieldKey] = f.defaultValue
      }
    }
    return { ...fromFields, ...defaultValues }
  }, [formConfig, defaultValues])

  const { register, control, handleSubmit, setError, watch, trigger, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: seededDefaults,
    mode: 'onTouched',
  })
  const watchedValues = watch()

  /**
   * errors.a.b.c for a field_key of "a.b.c"; errors.x for "x".
   * react-hook-form nests errors the same way it nests values, so a dotted key
   * cannot be looked up with errors[key] — that returns undefined and the field
   * renders as valid while the form refuses to advance.
   */
  const errorFor = (fieldKey) =>
    String(fieldKey).split('.').reduce((acc, p) => (acc == null ? acc : acc[p]), errors)
  const [serverError, setServerError] = useState(null)

  const handleFormSubmit = async (data) => {
    setServerError(null)
    try {
      // TAG fields hold an array in form state, but several backing columns
      // are comma-separated strings — AuditPolicy.controlTags and
      // frameworkRefs are VARCHAR(500), and the DTO getters return String.
      // Posting ["A","B"] at those either fails deserialisation or stores the
      // literal brackets. Joining here rather than in each caller so every
      // form using TAG behaves the same.
      //
      // MULTI_SELECT is deliberately NOT joined: its consumers expect arrays.
      const tagKeys = new Set((fields || [])
        .filter(f => f.fieldType === 'TAG')
        .map(f => f.fieldKey))
      const payload = Object.fromEntries(Object.entries(data).map(([k, v]) =>
        [k, tagKeys.has(k) && Array.isArray(v) ? v.join(',') : v]))

      await onSubmit(payload)
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

  // ── Wizard steps ──────────────────────────────────────────────────────────
  //
  // ui_form_fields.step_number has existed since the schema was written,
  // defaults to 1, and flows all the way out to the client
  // (UiConfigServiceImpl → UiFormFieldResponse.stepNumber). Nothing has ever
  // read it, so every DB-driven form is a single flat page while the hardcoded
  // pages it replaces — vendor onboarding above all — are wizards.
  //
  // The rule here is deliberately conservative: a form whose fields all share
  // one step (which is every form seeded to date, since the column defaults to
  // 1) renders EXACTLY as before — same markup, same single submit button, no
  // stepper. The wizard only appears when a form actually declares more than
  // one step. That way this cannot change any existing screen.
  //
  // Validation is per step rather than all-at-once: `trigger` is run over the
  // current step's field keys before advancing, so a user is told about a
  // missing field on the step they are looking at rather than on submit.
  const [stepIdx, setStepIdx] = useState(0)
  useEffect(() => { setStepIdx(0) }, [formKey])

  if (loadingForm) return <div className="flex flex-col gap-3">{[1,2,3].map(i => <Skeleton key={i} className="h-8" />)}</div>
  if (!formConfig) return <p className="text-sm text-text-muted">Form not found: {formKey}</p>

  const fields = formConfig.fields || []

  const stepNumbers = [...new Set(fields.map(f => f.stepNumber ?? 1))].sort((a, b) => a - b)
  const isWizard    = stepNumbers.length > 1
  const currentStep = stepNumbers[Math.min(stepIdx, stepNumbers.length - 1)]
  const isLastStep  = !isWizard || stepIdx >= stepNumbers.length - 1

  // Step titles come from the SECTION_HEADER field on each step, when there is
  // one. It is the label the designer already wrote for that group of fields,
  // so the stepper never needs a second source of truth.
  const stepTitles = stepNumbers.map(n => {
    const header = fields.find(f => (f.stepNumber ?? 1) === n && f.fieldType === 'SECTION_HEADER')
    return header?.label || `Step ${n}`
  })

  // A field on another step still has to be REGISTERED, or react-hook-form
  // drops its value from the payload the moment the user moves on. So fields
  // outside the current step render as hidden inputs rather than being
  // returned as null — the same trick the is_visible=0 branch below uses.
  const onCurrentStep = (f) => !isWizard || (f.stepNumber ?? 1) === currentStep

  const goNext = async () => {
    const keys = fields
      .filter(f => onCurrentStep(f)
                && f.fieldType !== 'SECTION_HEADER'
                && f.fieldType !== 'DIVIDER'
                && f.fieldType !== 'REVIEW_SUMMARY')
      .map(f => f.fieldKey)
    const ok = keys.length === 0 ? true : await trigger(keys)
    if (ok) setStepIdx(i => Math.min(i + 1, stepNumbers.length - 1))
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col gap-4">
      {serverError && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-card bg-status-fail-bg border border-status-fail-bd text-xs text-status-fail-fg">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}
      {isWizard && (
        <div className="flex items-center gap-0 pb-1">
          {stepTitles.map((title, i) => {
            const done   = i < stepIdx
            const active = i === stepIdx
            return (
              <div key={stepNumbers[i]} className="flex items-center flex-1 last:flex-none min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 border',
                    done   && 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg',
                    active && 'bg-brand-500 border-brand-500 text-white',
                    !done && !active && 'bg-surface-raised border-border text-text-muted'
                  )}>
                    {done ? <Check size={12} /> : i + 1}
                  </span>
                  <span className={cn(
                    'text-[11px] font-medium truncate',
                    active ? 'text-text-primary' : 'text-text-muted'
                  )}>{title}</span>
                </div>
                {i < stepTitles.length - 1 && (
                  <div className={cn('h-px flex-1 mx-2', done ? 'bg-status-pass-bd' : 'bg-border')} />
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="grid grid-cols-12 gap-3">
        {fields.map(field => {
          // Wizard: a field belonging to another step is registered as a hidden
          // input rather than dropped, so its value survives the step change and
          // reaches the payload on submit.
          if (!onCurrentStep(field)) {
            if (field.fieldType === 'SECTION_HEADER'
             || field.fieldType === 'DIVIDER'
             || field.fieldType === 'REVIEW_SUMMARY') return null
            return (
              <input key={`off-${field.id ?? field.fieldKey}`} type="hidden"
                     {...register(field.fieldKey)} />
            )
          }
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
                // key on the row id, not fieldKey.
                //
                // Two rows can legitimately share a fieldKey when only one is ever
                // visible — the internal and external lead auditor, selected by
                // depends_on_json. With fieldKey as the key React saw "same
                // element" and REUSED the instance, so EntityLookupField kept the
                // results it had fetched as the internal field and showed staff in
                // the external picker.
                key={field.id ?? field.fieldKey}
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
            <div key={field.id ?? field.fieldKey} className={`col-span-${field.gridCols || 12}`}>
              <FormField
                field={field}
                register={register}
                control={control}
                error={errorFor(field.fieldKey)?.message}
                config={config}
                isEditable={isEditable}
                contextParams={contextParams}
                formValues={watchedValues}
                allFields={fields}
              />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between pt-2">
        {isWizard && stepIdx > 0 ? (
          <Button type="button" variant="secondary"
                  onClick={() => setStepIdx(i => Math.max(0, i - 1))}>
            Back
          </Button>
        ) : <span />}
        <div className="flex items-center gap-3">
          {isWizard && (
            <span className="text-[11px] text-text-muted">
              Step {stepIdx + 1} of {stepNumbers.length}
            </span>
          )}
          {/*
            The submit button only exists on the last step. A wizard that keeps
            a live submit alongside "Next" lets someone post a half-filled form
            from step 1 — which is exactly the failure the per-step validation
            is there to prevent.
          */}
          {isLastStep ? (
            <Button type="submit" loading={loading || isSubmitting} loadingText="Saving…" disabled={loading || isSubmitting}>{typeof submitLabel === 'function' ? submitLabel(watchedValues) : submitLabel}</Button>
          ) : (
            <Button type="button" onClick={goNext}>Next</Button>
          )}
        </div>
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

/**
 * Substitutes {{fieldKey}} tokens in a lookup path from the form's current
 * values, so one lookup can be filtered by another field's answer.
 *
 *   /v1/users?side=AUDITOR&roleId=33&membershipType={{auditorSource}}
 *
 * An unanswered token drops its whole query pair rather than sending the literal
 * "{{auditorSource}}" — so before the user picks internal or external, the
 * lookup simply returns both, which is the sensible default.
 */
function resolveLookupPath(path, values) {
  if (!path || !path.includes('{{')) return path
  const [base, qs] = path.split('?')
  if (!qs) return path
  const kept = qs.split('&').filter(Boolean).map(pair => {
    const [k, v] = pair.split('=')
    const token = /^\{\{(.+)\}\}$/.exec(v || '')
    if (!token) return pair
    const resolved = values?.[token[1]]
    return (resolved === undefined || resolved === null || resolved === '')
      ? null
      : `${k}=${encodeURIComponent(resolved)}`
  }).filter(Boolean)
  return kept.length ? `${base}?${kept.join('&')}` : base
}

function FormField({ field, register, control, error, config, isEditable = true, contextParams = null, formValues = null, allFields = null }) {
  const { fieldKey: key, fieldType: type, label, placeholder, helperText, isRequired } = field

  // Gap 1: when read-only, render a plain text display instead of any interactive input.
  // Structural types (SECTION_HEADER, DIVIDER) are never interactive, skip them here.
  if (!isEditable && type !== 'SECTION_HEADER' && type !== 'DIVIDER' && type !== 'REVIEW_SUMMARY') {
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
              lookupApiPath={resolveLookupPath(field.lookupApiPath, formValues)}
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

    // Several of one entity. Added because there was no way to pick more than
    // one person, control or framework anywhere in this platform: MULTI_SELECT
    // renders from config.components[optionsComponentKey] and ignores
    // lookup_api_path entirely, so a MULTI_SELECT pointed at /v1/personnel
    // showed "No options — add a UiComponent first".
    //
    // Value is an ARRAY of ids and is NOT joined, matching MULTI_SELECT's
    // existing contract — its consumers expect arrays.
    case 'MULTI_LOOKUP':
      return (
        <FieldWrapper label={label} isRequired={isRequired} helperText={helperText} error={error} type={type}>
          <Controller name={key} control={control} render={({ field: f }) =>
            <MultiEntityLookupField
              value={f.value}
              onChange={f.onChange}
              onBlur={f.onBlur}
              placeholder={placeholder}
              lookupEntityType={field.lookupEntityType}
              lookupApiPath={resolveLookupPath(field.lookupApiPath, formValues)}
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
      // Renders helperText beneath the label when present.
      //
      // Only `label` was output, so any explanatory text on a section header
      // was silently dropped — and putting the explanation IN the label gets
      // it styled as a small uppercase heading, which reads as shouting for
      // anything longer than a few words.
      //
      // Existing headers are unaffected: without helperText the markup is
      // exactly what it was.
      return (
        <div className="col-span-12 pt-2 pb-1 border-b border-border">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
          {helperText && (
            <p className="mt-1 text-xs font-normal normal-case tracking-normal text-text-secondary">
              {helperText}
            </p>
          )}
        </div>
      )

    case 'DIVIDER':
      return <div className="col-span-12 border-t border-border my-1" />

    case 'REVIEW_SUMMARY':
      // A read-back of everything answered on the earlier steps.
      //
      // This exists because the hardcoded VendorOnboardPage is a FOUR step
      // wizard and the fourth step is a review — not a form. Without a way to
      // express that, a DB-driven wizard either drops the review step (and is
      // no longer same-to-same) or seeds an empty step that shows a heading
      // over nothing.
      //
      // It is a structural field: never registered, never validated, carries no
      // value of its own. It reads the live form state and the field list, so
      // it needs no configuration beyond existing — put one on the last step
      // and it summarises every step before it.
      //
      // Values are shown as the user entered them. A SELECT shows its stored
      // value rather than its option label, because the labels live in
      // ui_options and are fetched per component — resolving them here would
      // mean a second lookup path with its own failure mode, and the stored
      // value is what is about to be sent. LOOKUP fields are skipped entirely
      // for the same reason: an id is worse than nothing to read back.
      return (
        <div className="col-span-12">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider pb-1 border-b border-border">
            {label || 'Review'}
          </p>
          {helperText && (
            <p className="mt-1.5 text-xs text-text-secondary">{helperText}</p>
          )}
          <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {(allFields || [])
              .filter(f =>
                f.fieldKey !== key
                && f.fieldType !== 'SECTION_HEADER'
                && f.fieldType !== 'DIVIDER'
                && f.fieldType !== 'REVIEW_SUMMARY'
                && f.fieldType !== 'LOOKUP'
                && f.isVisible !== false && f.isVisible !== 0
                && (f.stepNumber ?? 1) < (field.stepNumber ?? 1))
              .map(f => {
                const raw = formValues?.[f.fieldKey]
                const shown = Array.isArray(raw) ? raw.join(', ')
                  : (raw === true ? 'Yes' : raw === false ? 'No' : raw)
                return (
                  <div key={f.id ?? f.fieldKey} className="flex items-baseline gap-2 min-w-0">
                    <dt className="text-[10px] text-text-muted uppercase tracking-wide shrink-0">
                      {f.label}
                    </dt>
                    <dd className="text-xs text-text-primary truncate flex-1 text-right">
                      {shown === undefined || shown === null || shown === ''
                        ? <span className="text-text-muted/60 italic">not set</span>
                        : String(shown)}
                    </dd>
                  </div>
                )
              })}
          </dl>
        </div>
      )

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
    // A dependency may be a SINGLE condition or an ARRAY of them, all of which
    // must hold. One condition cannot express "external auditor AND a firm has
    // been chosen", and showing the auditor picker before the firm is chosen
    // means offering every invited auditor from every firm — the thing the firm
    // picker exists to prevent.
    const conditions = Array.isArray(dep) ? dep : [dep]
    return conditions.every(c => {
      const actual = values[c.field]
      if (c.operator === 'eq')  return actual === c.value
      if (c.operator === 'neq') return actual !== c.value
      if (c.operator === 'in')  return Array.isArray(c.value) && c.value.includes(actual)
      // notEmpty: for "this depends on something being chosen, whatever it is".
      if (c.operator === 'notEmpty')
        return actual !== undefined && actual !== null && actual !== ''
      // Unknown operator → visible. Failing OPEN is deliberate: a typo should
      // show a field that might not belong, not hide one that does, because a
      // missing field looks like a broken form and is far harder to diagnose.
      return true
    })
  } catch { return true }
}

// ─── MultiEntityLookupField ──────────────────────────────────────────────────
//
// Several of one entity, for the MULTI_LOOKUP field type.
//
// Wraps EntityLookupField rather than reimplementing search, debouncing, id
// resolution and the LOOKUP_CONFIG lookup: the single-select field already does
// all of that and is proven. This adds the chip list and the array plumbing.
//
// The value is an ARRAY of ids and is deliberately NOT joined into a string,
// matching MULTI_SELECT's existing contract — DynamicForm's own comment says
// its consumers expect arrays. A TAG field is the one that joins.
function MultiEntityLookupField({ value, onChange, onBlur, placeholder,
                                  lookupEntityType, lookupApiPath, error, contextParams }) {
  const cfg = LOOKUP_CONFIG[lookupEntityType?.toUpperCase?.()] || LOOKUP_CONFIG.USER
  const selected = Array.isArray(value) ? value : (value == null ? [] : [value])
  const selectedSet = useMemo(() => new Set(selected), [selected.join(',')])

  // Labels for chips, resolved once per id and cached. Without this the chips
  // would read as bare numbers, which is unusable for picking forty people.
  const [labels, setLabels] = useState({})
  const basePath = (lookupApiPath || cfg.path).split('?')[0]

  useEffect(() => {
    const missing = selected.filter(id => labels[id] === undefined)
    if (!missing.length) return
    let cancelled = false
    // api.get already returns the unwrapped payload — the response interceptor
    // does `response.data?.data ?? response.data`. Reaching for r.data.data on
    // top of that yielded undefined, labelFn threw, the catch swallowed it, and
    // every chip rendered as a bare id: "33" instead of a person's name.
    Promise.all(missing.map(id =>
      api.get(`${basePath}/${id}`)
        .then(r => [id, cfg.labelFn(r) || String(id)])
        .catch(() => [id, String(id)])
    )).then(pairs => {
      if (cancelled) return
      setLabels(prev => ({ ...prev, ...Object.fromEntries(pairs) }))
    })
    return () => { cancelled = true }
  }, [selected.join(','), basePath])

  const add = (id) => {
    if (id == null || selected.includes(id)) return
    onChange([...selected, id])
  }
  const remove = (id) => onChange(selected.filter(x => x !== id))

  return (
    <div className="flex flex-col gap-1.5">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(id => (
            <span key={id}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-ctl bg-brand-500/10 border border-brand-500/30 text-xs text-text-primary">
              {labels[id] ?? 'Loading…'}
              <button type="button" onClick={() => remove(id)}
                className="text-text-muted hover:text-text-primary transition-colors">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* No key, and no remount.
          
          The first version forced a fresh instance after every pick to clear
          the query — which closed the panel each time and produced exactly the
          open-pick-reopen loop this field exists to avoid. It now runs in multi
          mode: the panel stays open, each row carries a tick, and toggling is
          one click. */}
      <EntityLookupField
        value={null}
        onChange={() => {}}
        onBlur={onBlur}
        placeholder={placeholder || (selected.length ? 'Add another…' : undefined)}
        lookupEntityType={lookupEntityType}
        lookupApiPath={lookupApiPath}
        contextParams={contextParams}
        error={error}
        multi
        selectedIds={selectedSet}
        onToggle={(item) => {
          const id = cfg.idFn ? cfg.idFn(item) : (item.id ?? item.userId)
          if (id == null) return
          // Cache the label as it is ticked, so the chip never has to fetch it
          // back — the resolver below is only for ids that arrive prefilled.
          setLabels(prev => ({ ...prev, [id]: cfg.labelFn(item) || String(id) }))
          selected.includes(id) ? remove(id) : add(id)
        }}
      />

      <span className="text-[11px] text-text-muted">
        {selected.length > 0 && <>{selected.length} selected · </>}
        {/* The dropdown shows the first ten before you type — loadInitial uses
            take: 10. With forty-five people that looks like the whole list and
            is not, so say so rather than letting someone conclude a colleague
            is missing. */}
        Type to search — the list opens with the first few only
      </span>
    </div>
  )
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
  // subFn shows the AUDIT FIRM when the user is an invited guest, falling back
  // to the email for your own staff. Without it an external auditor lookup is a
  // list of names and addresses with nothing saying who they work for — and a
  // client can have several firms invited at once.
  USER:           { path: '/v1/users',                    search: (q) => `firstname=${q};lastname=${q}`, labelFn: (r) => [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email, subFn: (r) => r.firmName ? `${r.firmName} · ${r.email}` : r.email, idFn: (r) => r.userId ?? r.id },
  // AUDIT_FIRM: firms with at least one active invited auditor in this tenant.
  AUDIT_FIRM:     { path: '/v1/users/audit-firms',        search: (q) => `name=${q}`, labelFn: (r) => r.name, subFn: (r) => r.auditorCount ? `${r.auditorCount} auditor${r.auditorCount === 1 ? '' : 's'}` : '', idFn: (r) => r.id },
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

  // PERSONNEL and ASSET were resolving through the `|| LOOKUP_CONFIG.USER`
  // fallback below. PERSONNEL happened to work — the personnel list emits
  // firstName/lastName so USER's labelFn matched, and it emits no userId so
  // `r.userId ?? r.id` fell through to the personnel id. Correct by luck. ASSET
  // did not: USER's labelFn reads firstName/lastName, which an asset has none
  // of, so every option rendered with an empty label.
  PERSONNEL:      { path: '/v1/personnel?currentOnly=true', search: (q) => `firstname=${q};lastname=${q}`, labelFn: (r) => r.fullName || [r.firstName, r.lastName].filter(Boolean).join(' '), subFn: (r) => [r.jobTitle, r.department].filter(Boolean).join(' · '), idFn: (r) => r.id },
  ASSET:          { path: '/v1/assets',                     search: (q) => `name=${q}`, labelFn: (r) => r.name, subFn: (r) => [r.assetRef, r.assetType].filter(Boolean).join(' · '), idFn: (r) => r.id },
  // AUDIT_CONTROL: GET /v1/audit/library/controls — supports search=name=X
  AUDIT_CONTROL:  { path: '/v1/audit/library/controls',   search: (q) => `name=${q}`, labelFn: (r) => r.name, subFn: (r) => r.controlTag || '' },
  // AUDIT_SECTION: GET /v1/audit/library/sections/roots — top-level sections only
  AUDIT_SECTION:  { path: '/v1/audit/library/sections/roots', search: (q) => `name=${q}`, labelFn: (r) => r.name, subFn: (r) => '' },
  // AUDIT_ENGAGEMENT: GET /v1/audit/engagements — supports search=name=X
  AUDIT_ENGAGEMENT: { path: '/v1/audit/engagements',      search: (q) => `name=${q}`, labelFn: (r) => r.name, subFn: (r) => r.status || '' },
  // AUDIT_POLICY: GET /v1/audit/library/policies — supports search=title=X
  AUDIT_POLICY:   { path: '/v1/audit/library/policies',   search: (q) => `title=${q}`, labelFn: (r) => r.title || r.name, subFn: (r) => r.policyRef || '' },
}

function EntityLookupField({ value, onChange, onBlur, placeholder, lookupEntityType, lookupApiPath, error, contextParams,
  // ── MULTI MODE ──────────────────────────────────────────────────────────
  // When set, the panel STAYS OPEN and each row shows a tick, so choosing five
  // people is five clicks rather than five rounds of open-pick-reopen. The
  // first attempt wrapped this component and remounted it after every pick to
  // clear the query, which is exactly the back-and-forth it was meant to avoid.
  multi = false,
  selectedIds = null,      // Set of ids already chosen, for the ticks
  onToggle = null,         // (item) => void, replaces select() in multi mode
}) {
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
  // The results panel is portalled to <body>; see the comment on <LookupPanel>.
  // panelRef lets the outside-click handler treat the portalled panel as
  // "inside" the field, which it no longer is in the DOM.
  const panelRef = useRef(null)
  const [anchor, setAnchor] = useState(null)

  // Measure the input so the portalled panel can sit under it. Re-measured on
  // scroll and resize because a portalled element does not move with its
  // anchor — `capture: true` so an ancestor's scroll is caught too, which is
  // exactly the modal-body case this whole change exists for.
  useEffect(() => {
    if (!open) { setAnchor(null); return }
    const measure = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const below = window.innerHeight - r.bottom
      const above = r.top
      // 264 = max-h-64 (256px) + the 8px offset. Flip up only when there is
      // genuinely more room above, so the common case stays "opens downward".
      const flip = below < 264 && above > below
      setAnchor({
        left:  r.left,
        width: r.width,
        top:   flip ? null : r.bottom + 4,
        bottom: flip ? (window.innerHeight - r.top + 4) : null,
        maxHeight: Math.max(120, Math.min(256, (flip ? above : below) - 12)),
      })
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open, results.length])

  // Resolve display label for an already-selected value.
  // Uses basePath so the ID fetch URL is clean: /v1/workflows/16 (not /v1/workflows?entityType=AUDIT_PROJECT/16).
  useEffect(() => {
    if (!value || display) return
    api.get(`${basePath}/${value}`)
      .then(r => {
        // PRE-EXISTING BUG, same root cause as the chip labels above.
        //
        // api's response interceptor already returns
        // `response.data?.data ?? response.data`, so `r` IS the payload.
        // Reaching for r.data.data on top of it gave undefined, getLabel
        // returned nothing, and the field fell back to String(value) — every
        // LOOKUP editing a record with a value already set displayed a bare id
        // instead of the name. Every module's owner, manager and vendor field.
        setDisplay(getLabel(r) || String(value))
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
    const h = (e) => {
      // panelRef is checked as well as ref: the results panel is portalled to
      // <body>, so ref.current.contains() no longer covers it and a click on a
      // result would otherwise close the panel before the option was chosen.
      const inField = ref.current && ref.current.contains(e.target)
      const inPanel = panelRef.current && panelRef.current.contains(e.target)
      if (!inField && !inPanel) { setOpen(false); onBlur?.() }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onBlur])

  const select = (item) => {
    if (multi) {
      // Keep the panel open and the results intact — the whole point of the
      // mode. The query is left alone too, so ticking three people out of one
      // search does not mean typing it three times.
      onToggle?.(item)
      return
    }
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
        // Chrome reads a bare text input sitting near a name or email label as
        // an address field and renders its own autofill panel ON TOP of the
        // results list, which is what made the Assign picker look empty.
        // autoComplete="off" alone is ignored by Chrome for anything it
        // recognises, so the field also carries a unique name it cannot match.
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            onFocus={() => { if (query.length >= 2) setOpen(true); else loadInitial() }}
            onBlur={() => { if (!open) onBlur?.() }}
            placeholder={placeholder || defaultPlaceholder}
            autoComplete="off" data-lpignore="true" name={`lookup-${cfg.path}`}
            className={cn('w-full h-9 rounded-ctl border bg-surface-raised pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1', error ? 'border-status-fail-bd focus:ring-status-fail-bd' : 'border-border focus:ring-brand-500')}
          />
        </div>
      )}
      {/*
        The results panel is rendered into <body> through a portal, positioned
        from the input's measured rect.

        Before this, it was `absolute top-full` inside the field. That works on
        a full page and fails inside a modal: Modal's body is
        `flex-1 overflow-y-auto`, which is a clipping context, so a 256px panel
        hanging off a form only two fields tall was cut at the modal's bottom
        edge — the workflow picker in "Restart workflow" showed one and a half
        rows and no way to reach the rest. Widening the modal does not help; the
        panel is clipped vertically, not horizontally.

        A portal removes the field from that clipping context entirely, so this
        fixes every lookup in every modal at once, not just the one that was
        reported. The trade-off is that the panel no longer moves with its
        anchor, which is what the scroll/resize listener above is for.
      */}
      {open && results.length > 0 && anchor && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            left: anchor.left,
            width: anchor.width,
            ...(anchor.top != null ? { top: anchor.top } : { bottom: anchor.bottom }),
            maxHeight: anchor.maxHeight,
          }}
          className="z-[70] bg-surface border border-border rounded-ctl shadow-lg overflow-y-auto">
          {results.map(item => {
            const chosen = multi && selectedIds?.has(getId(item))
            return (
              <button key={item.id} type="button" onMouseDown={(e) => { e.preventDefault(); select(item) }}
                className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                  chosen ? 'bg-brand-500/10 hover:bg-brand-500/15' : 'hover:bg-surface-overlay')}>
                {multi && (
                  <span className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                    chosen ? 'bg-brand-500 border-brand-500' : 'border-border')}>
                    {chosen && <Check size={11} className="text-white" />}
                  </span>
                )}
                <div className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-ink text-[9px] font-semibold flex items-center justify-center shrink-0">
                  {getLabel(item).split(' ').map(p => p[0]).filter(Boolean).join('').toUpperCase().slice(0,2) || '?'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">{getLabel(item)}</p>
                  {getSub(item) && <p className="text-[10px] text-text-muted truncate">{getSub(item)}</p>}
                </div>
              </button>
            )
          })}
        </div>,
        document.body
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