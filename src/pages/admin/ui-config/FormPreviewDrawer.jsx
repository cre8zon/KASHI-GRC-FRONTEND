/**
 * FormPreviewDrawer — live preview of a DB-configured form.
 *
 * Wires into FormsAdminPage to show Platform Admin exactly what a form
 * will look like when rendered, before any developer wires it to a page.
 *
 * HOW TO INTEGRATE into FormsAdminPage.jsx:
 *
 *   1. Import this component:
 *      import { FormPreviewDrawer } from './FormPreviewDrawer'
 *
 *   2. Add preview state alongside existing state:
 *      const [previewTarget, setPreviewTarget] = useState(null)
 *
 *   3. Add a Preview button in the columns definition next to the Fields button:
 *      <Button size="xs" variant="ghost" icon={Eye}
 *        onClick={() => setPreviewTarget(r)}>Preview</Button>
 *
 *   4. Add the drawer at the bottom of the return (alongside existing modals):
 *      <FormPreviewDrawer
 *        form={previewTarget}
 *        onClose={() => setPreviewTarget(null)}
 *      />
 *
 * The drawer shows:
 *   - Live rendered DynamicForm (exactly as users see it)
 *   - Device preview toggle (desktop / tablet / mobile width)
 *   - Form metadata (formKey, submitUrl, method, field count)
 *   - Field list with types and validation rules
 *   - JSON source of the form config
 */

import { useState } from 'react'
import { X, Eye, Monitor, Tablet, Smartphone, Code2, List, Layers } from 'lucide-react'
import { DynamicForm } from '../../../components/forms/DynamicForm'
import { Badge } from '../../../components/ui/Badge'
import { cn } from '../../../lib/cn'

const DEVICE_WIDTHS = {
  desktop: 'w-full',
  tablet:  'w-[768px] mx-auto',
  mobile:  'w-[390px] mx-auto',
}

const DEVICE_ICONS = {
  desktop: Monitor,
  tablet:  Tablet,
  mobile:  Smartphone,
}

const FIELD_TYPE_COLOR = {
  TEXT:           'blue',
  EMAIL:          'blue',
  NUMBER:         'blue',
  DECIMAL:        'blue',
  TEXTAREA:       'blue',
  SELECT:         'purple',
  MULTI_SELECT:   'purple',
  RADIO:          'purple',
  CHECKBOX:       'purple',
  TOGGLE:         'green',
  DATE:           'amber',
  DATE_RANGE:     'amber',
  FILE:           'teal',
  FILE_MULTI:     'teal',
  RICH_TEXT:      'blue',
  SECTION_HEADER: 'gray',
  DIVIDER:        'gray',
  PHONE:          'blue',
  URL:            'blue',
  CURRENCY:       'green',
  RATING:         'amber',
  SLIDER:         'amber',
  JSON_EDITOR:    'purple',
  LOOKUP:         'purple',
  TAG:            'teal',
  COLOR:          'pink',
}

export function FormPreviewDrawer({ form, onClose }) {
  const [device, setDevice]   = useState('desktop')
  const [view, setView]       = useState('preview')  // 'preview' | 'fields' | 'json'

  if (!form) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-on-dark-inv/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-3xl bg-surface-raised border-l border-border flex flex-col shadow-elevated animate-slide-left">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Eye size={14} className="text-brand-ink" />
              <h2 className="text-sm font-semibold text-text-primary">Form preview</h2>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-[11px] font-mono text-brand-ink">{form.formKey}</code>
              <Badge value={form.httpMethod} label={form.httpMethod} colorTag="blue" />
              {form.title && <span className="text-xs text-text-muted">{form.title}</span>}
            </div>
          </div>
          <button onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-ctl text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border shrink-0">
          {/* View toggle */}
          <div className="flex items-center rounded-ctl border border-border overflow-hidden">
            {[
              { key: 'preview', label: 'Preview', icon: Eye },
              { key: 'fields',  label: 'Fields',  icon: List },
              { key: 'json',    label: 'JSON',     icon: Code2 },
            ].map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors',
                  view === v.key
                    ? 'bg-brand-500/15 text-brand-ink'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay'
                )}>
                <v.icon size={11} /> {v.label}
              </button>
            ))}
          </div>

          {/* Device toggle (only in preview mode) */}
          {view === 'preview' && (
            <div className="flex items-center rounded-ctl border border-border overflow-hidden ml-2">
              {Object.entries(DEVICE_ICONS).map(([key, Icon]) => (
                <button key={key} onClick={() => setDevice(key)}
                  className={cn(
                    'px-2.5 py-1.5 transition-colors',
                    device === key
                      ? 'bg-brand-500/15 text-brand-ink'
                      : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay'
                  )}>
                  <Icon size={13} />
                </button>
              ))}
            </div>
          )}

          {/* Submit URL */}
          {form.submitUrl && (
            <code className="ml-auto text-[10px] font-mono text-text-muted truncate max-w-48">
              {form.httpMethod} {form.submitUrl}
            </code>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* PREVIEW VIEW */}
          {view === 'preview' && (
            <div className="p-6">
              {/* Device frame */}
              <div className={cn(
                'transition-all duration-300',
                DEVICE_WIDTHS[device]
              )}>
                {/* Form title */}
                {form.title && (
                  <div className="mb-4 pb-3 border-b border-border">
                    <h3 className="text-base font-semibold text-text-primary">{form.title}</h3>
                    {form.description && (
                      <p className="text-xs text-text-muted mt-0.5">{form.description}</p>
                    )}
                  </div>
                )}

                {/* Live rendered form */}
                <DynamicForm
                  formKey={form.formKey}
                  onSubmit={(data) => {
                    console.log('[Preview] Form submit:', data)
                  }}
                  submitLabel={form.submitLabel || 'Submit'}
                />

                {/* Preview watermark */}
                <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-card bg-status-warn-bg border border-status-warn-bd">
                  <Eye size={12} className="text-status-warn-fg shrink-0" />
                  <p className="text-[10px] text-status-warn-fg">
                    Preview mode — form submission is intercepted and logged to console. No data is saved.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* FIELDS VIEW */}
          {view === 'fields' && (
            <FieldsView formId={form.id} />
          )}

          {/* JSON VIEW */}
          {view === 'json' && (
            <JsonView form={form} />
          )}
        </div>
      </div>
    </>
  )
}

// ─── Fields view — table of field definitions ─────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { uiAdminApi } from '../../../api/uiConfig.api'

function FieldsView({ formId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-form-fields', formId],
    queryFn: () => uiAdminApi.formFields.list(formId),
    enabled: !!formId,
  })

  const fields = data?.items || data?.data || data || []

  if (isLoading) return <div className="p-6 text-xs text-text-muted">Loading fields…</div>

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Layers size={13} className="text-brand-ink" />
        <span className="text-xs font-semibold text-text-primary">{fields.length} fields</span>
      </div>
      <div className="border border-border rounded-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-surface-overlay">
              <th className="text-left px-3 py-2 font-medium text-text-muted">#</th>
              <th className="text-left px-3 py-2 font-medium text-text-muted">Key</th>
              <th className="text-left px-3 py-2 font-medium text-text-muted">Label</th>
              <th className="text-left px-3 py-2 font-medium text-text-muted">Type</th>
              <th className="text-left px-3 py-2 font-medium text-text-muted">Grid</th>
              <th className="text-left px-3 py-2 font-medium text-text-muted">Required</th>
              <th className="text-left px-3 py-2 font-medium text-text-muted">Options key</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fields.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-text-muted">No fields defined</td></tr>
            )}
            {fields.map((f, i) => {
              const isSeparator = f.fieldType === 'SECTION_HEADER' || f.fieldType === 'DIVIDER'
              return (
                <tr key={f.id} className={cn(
                  'hover:bg-surface-overlay/40 transition-colors',
                  isSeparator && 'opacity-60'
                )}>
                  <td className="px-3 py-2 text-text-muted">{f.sortOrder ?? i + 1}</td>
                  <td className="px-3 py-2 font-mono text-brand-ink">{f.fieldKey}</td>
                  <td className="px-3 py-2 text-text-primary">{f.label}</td>
                  <td className="px-3 py-2">
                    <Badge
                      value={f.fieldType}
                      label={f.fieldType}
                      colorTag={FIELD_TYPE_COLOR[f.fieldType] || 'gray'}
                    />
                  </td>
                  <td className="px-3 py-2 text-text-muted">{f.gridCols || 12}/12</td>
                  <td className="px-3 py-2">
                    {f.isRequired
                      ? <span className="text-status-fail-fg">Required</span>
                      : <span className="text-text-muted">Optional</span>
                    }
                  </td>
                  <td className="px-3 py-2 font-mono text-text-muted text-[10px]">
                    {f.optionsComponentKey || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Validation rules summary */}
      {fields.some(f => f.validationRulesJson) && (
        <div className="mt-4">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Validation rules</p>
          <div className="space-y-1">
            {fields.filter(f => f.validationRulesJson).map(f => {
              let rules = {}
              try { rules = JSON.parse(f.validationRulesJson) } catch {}
              return (
                <div key={f.id} className="flex items-start gap-3 text-[11px]">
                  <code className="font-mono text-brand-ink shrink-0 w-36">{f.fieldKey}</code>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(rules).map(([k, v]) => (
                      <span key={k} className="px-1.5 py-0.5 rounded bg-surface-overlay border border-border text-text-muted">
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── JSON view — raw form config ──────────────────────────────────────────────

function JsonView({ form }) {
  const { data } = useQuery({
    queryKey: ['admin-form-fields', form.id],
    queryFn: () => uiAdminApi.formFields.list(form.id),
    enabled: !!form.id,
  })

  const fields = data?.items || data?.data || data || []

  const output = {
    formKey:     form.formKey,
    title:       form.title,
    httpMethod:  form.httpMethod,
    submitUrl:   form.submitUrl,
    submitLabel: form.submitLabel,
    fields: fields.map(f => ({
      fieldKey:   f.fieldKey,
      fieldType:  f.fieldType,
      label:      f.label,
      placeholder:f.placeholder,
      isRequired: f.isRequired,
      gridCols:   f.gridCols,
      sortOrder:  f.sortOrder,
      optionsComponentKey: f.optionsComponentKey,
      validationRules: f.validationRulesJson ? JSON.parse(f.validationRulesJson) : undefined,
      dependsOn: f.dependsOnJson ? JSON.parse(f.dependsOnJson) : undefined,
    }))
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Form config as JSON</p>
        <button
          onClick={() => navigator.clipboard.writeText(JSON.stringify(output, null, 2))}
          className="text-[10px] text-text-muted hover:text-brand-ink transition-colors"
        >
          Copy
        </button>
      </div>
      <pre className="text-[11px] font-mono text-text-secondary bg-surface-overlay border border-border rounded-card p-4 overflow-x-auto leading-relaxed whitespace-pre-wrap">
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  )
}
