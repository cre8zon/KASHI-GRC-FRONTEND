/**
 * StepUiOverrideModal — structured editor for WorkflowStep.stepUiOverrideJson.
 *
 * Instead of typing raw JSON or comma-separated keys, Platform Admin gets:
 *   - Tab visibility: checkboxes for every real tab (from MODULE_TABS + capabilities)
 *   - Field visibility: checkboxes by section from ModuleBlueprint.fieldsSchemaJson
 *   - Field editability: same field list, toggle editable vs read-only
 *   - Available actions: checkboxes from the WORKFLOW_ACTIONS enum
 *
 * Fetches the ModuleBlueprint for the workflow's entityType to populate
 * real field and tab keys — not hardcoded lists.
 *
 * On save: serializes to JSON and calls onChange(jsonString).
 * WorkflowBlueprintDesigner stays clean — this complexity lives here.
 *
 * USAGE in WorkflowBlueprintDesigner StepEditorPanel:
 *
 *   const [overrideModalOpen, setOverrideModalOpen] = useState(false)
 *
 *   // Replace the raw JSON textarea with:
 *   <Button size="xs" variant="secondary" icon={Shield}
 *     onClick={() => setOverrideModalOpen(true)}>
 *     Configure UI override
 *     {step.stepUiOverrideJson && <span className="ml-1 text-brand-400">●</span>}
 *   </Button>
 *
 *   <StepUiOverrideModal
 *     open={overrideModalOpen}
 *     onClose={() => setOverrideModalOpen(false)}
 *     value={step.stepUiOverrideJson}
 *     onChange={(json) => { onChange?.({ ...step, stepUiOverrideJson: json }); setOverrideModalOpen(false) }}
 *     entityType={blueprintEntityType}   // e.g. "RISK" — from the parent workflow blueprint
 *   />
 */

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Shield, Eye, EyeOff, Lock, Unlock, Zap, X,
  CheckCircle2, ChevronDown, ChevronRight, Info, Layers,
} from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Callout } from '../../components/ui/ui-primitives'
import { cn } from '../../lib/cn'
import api from '../../config/axios.config'

// ─── Constants ────────────────────────────────────────────────────────────────

// Standard tabs available on any module detail page
// Filtered by blueprint capabilities — but shown here so admin can restrict
const MODULE_TABS = [
  { key: 'overview',  label: 'Overview',     always: true },
  { key: 'workflow',  label: 'Workflow',      cap: 'supportsWorkflow' },
  { key: 'actions',   label: 'Action items',  cap: 'supportsActionItems' },
  { key: 'evidence',  label: 'Evidence',      cap: 'supportsDocuments' },
  { key: 'comments',  label: 'Comments',      cap: 'supportsComments' },
  { key: 'history',   label: 'History',       always: true },
]

// All possible workflow task actions
const WORKFLOW_ACTIONS = [
  { key: 'APPROVE',   label: 'Approve',   color: 'text-green-400' },
  { key: 'REJECT',    label: 'Reject',    color: 'text-red-400' },
  { key: 'SEND_BACK', label: 'Send back', color: 'text-amber-400' },
  { key: 'DELEGATE',  label: 'Delegate',  color: 'text-purple-400' },
  { key: 'ESCALATE',  label: 'Escalate',  color: 'text-orange-400' },
  { key: 'REASSIGN',  label: 'Reassign',  color: 'text-blue-400' },
  { key: 'COMMENT',   label: 'Comment',   color: 'text-text-muted' },
  { key: 'WITHDRAW',  label: 'Withdraw',  color: 'text-red-400' },
]

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useModuleBlueprint = (entityType) => useQuery({
  queryKey: ['module-blueprint-type', entityType],
  queryFn: () => api.get(`/v1/admin/module-blueprints/by-type/${entityType}`),
  enabled: !!entityType,
  staleTime: 5 * 60 * 1000,
})

// ─── Parse / serialize helpers ────────────────────────────────────────────────

function parseOverride(json) {
  if (!json) return { visibleTabs: null, hiddenTabs: [], editableFields: null, readOnlyFields: [], hiddenFields: [], availableActions: null }
  try { return { visibleTabs: null, hiddenTabs: [], editableFields: null, readOnlyFields: [], hiddenFields: [], availableActions: null, ...JSON.parse(json) } }
  catch { return { visibleTabs: null, hiddenTabs: [], editableFields: null, readOnlyFields: [], hiddenFields: [], availableActions: null } }
}

function serializeOverride(state) {
  const out = {}
  if (state.visibleTabs?.length)    out.visibleTabs    = state.visibleTabs
  if (state.hiddenTabs?.length)     out.hiddenTabs     = state.hiddenTabs
  if (state.editableFields?.length) out.editableFields = state.editableFields
  if (state.readOnlyFields?.length) out.readOnlyFields = state.readOnlyFields
  if (state.hiddenFields?.length)   out.hiddenFields   = state.hiddenFields
  if (state.availableActions?.length) out.availableActions = state.availableActions
  return Object.keys(out).length > 0 ? JSON.stringify(out) : null
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StepUiOverrideModal({ open, onClose, value, onChange, entityType }) {
  const { data: bpRes } = useModuleBlueprint(entityType)
  const bp = bpRes?.data || bpRes

  const [state, setState] = useState(parseOverride(value))
  const [section, setSection] = useState('tabs')   // 'tabs' | 'fields' | 'actions'

  useEffect(() => {
    if (open) setState(parseOverride(value))
  }, [open, value])

  // Parse field sections from module blueprint
  const fieldSections = useMemo(() => {
    if (!bp?.fieldsSchemaJson) return []
    try { return JSON.parse(bp.fieldsSchemaJson).sections || [] }
    catch { return [] }
  }, [bp])

  const allFields = useMemo(() =>
    fieldSections.flatMap(s => (s.fields || []).filter(f => f.type !== 'SECTION_HEADER' && f.type !== 'DIVIDER'))
  , [fieldSections])

  // Derived: what mode is each field in?
  // 'editable' | 'readonly' | 'hidden' | 'default'
  const fieldMode = (key) => {
    if (state.hiddenFields?.includes(key))   return 'hidden'
    if (state.readOnlyFields?.includes(key)) return 'readonly'
    if (state.editableFields?.length && !state.editableFields.includes(key)) return 'readonly'
    return 'default'
  }

  const setFieldMode = (key, mode) => {
    setState(s => {
      const hidden   = (s.hiddenFields || []).filter(k => k !== key)
      const readonly = (s.readOnlyFields || []).filter(k => k !== key)
      const editable = (s.editableFields || []).filter(k => k !== key)
      if (mode === 'hidden')   return { ...s, hiddenFields: [...hidden, key],   readOnlyFields: readonly, editableFields: editable }
      if (mode === 'readonly') return { ...s, readOnlyFields: [...readonly, key], hiddenFields: hidden, editableFields: editable }
      if (mode === 'editable') return { ...s, editableFields: [...editable, key], hiddenFields: hidden, readOnlyFields: readonly }
      return { ...s, hiddenFields: hidden, readOnlyFields: readonly, editableFields: editable }
    })
  }

  // Tab visibility
  const tabVisible = (key) => {
    if (state.hiddenTabs?.includes(key)) return false
    if (state.visibleTabs?.length) return state.visibleTabs.includes(key)
    return true
  }

  const toggleTab = (key) => {
    setState(s => {
      const hidden = s.hiddenTabs || []
      if (hidden.includes(key)) {
        return { ...s, hiddenTabs: hidden.filter(k => k !== key) }
      }
      // If visibleTabs mode is active, toggle there instead
      if (s.visibleTabs) {
        const vis = s.visibleTabs.includes(key)
          ? s.visibleTabs.filter(k => k !== key)
          : [...s.visibleTabs, key]
        return { ...s, visibleTabs: vis }
      }
      return { ...s, hiddenTabs: [...hidden, key] }
    })
  }

  // Tab restriction mode
  const useVisibleTabsMode = !!state.visibleTabs
  const toggleVisibleTabsMode = () => {
    setState(s => s.visibleTabs
      ? { ...s, visibleTabs: null, hiddenTabs: [] }
      : { ...s, visibleTabs: MODULE_TABS.map(t => t.key), hiddenTabs: [] }
    )
  }

  // Action availability
  const actionAvailable = (key) => !state.availableActions || state.availableActions.includes(key)
  const toggleAction = (key) => {
    setState(s => {
      const current = s.availableActions || WORKFLOW_ACTIONS.map(a => a.key)
      const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key]
      return { ...s, availableActions: next.length === WORKFLOW_ACTIONS.length ? null : next }
    })
  }

  const hasOverride = !!(
    state.visibleTabs?.length || state.hiddenTabs?.length ||
    state.editableFields?.length || state.readOnlyFields?.length ||
    state.hiddenFields?.length || state.availableActions?.length
  )

  const handleSave = () => {
    onChange(serializeOverride(state))
  }

  const handleClear = () => {
    setState({ visibleTabs: null, hiddenTabs: [], editableFields: null, readOnlyFields: [], hiddenFields: [], availableActions: null })
  }

  const SECTIONS = [
    { key: 'tabs',    label: 'Tab visibility',   icon: Layers },
    { key: 'fields',  label: 'Field access',     icon: Eye },
    { key: 'actions', label: 'Action buttons',   icon: Zap },
    { key: 'preview', label: 'JSON preview',     icon: Shield },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Step UI override"
      subtitle={entityType
        ? `Controls what actors on this step can see and do — linked to ${entityType} module`
        : 'Controls what actors on this step can see and do'
      }
      footer={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {hasOverride && (
              <button onClick={handleClear} className="text-xs text-text-muted hover:text-red-400 transition-colors">
                Clear all restrictions
              </button>
            )}
            {!hasOverride && (
              <span className="text-xs text-text-muted">No restrictions — all defaults apply</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" icon={Shield} onClick={handleSave}>
              Apply override
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex gap-5 min-h-80">

        {/* Section nav */}
        <div className="w-36 shrink-0 space-y-0.5">
          {SECTIONS.map(s => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-left transition-colors',
                section === s.key
                  ? 'bg-brand-500/15 text-brand-400 font-medium'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay'
              )}>
              <s.icon size={12} />
              {s.label}
            </button>
          ))}
          {!entityType && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="text-[10px] text-amber-300">Set entityType on the blueprint to see real fields</p>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* ── TABS ──────────────────────────────────────────────── */}
          {section === 'tabs' && (
            <div className="space-y-4">
              <Callout variant="info">
                <strong>Default:</strong> all tabs visible (based on module capabilities).
                Restrict here to hide tabs or whitelist only specific tabs for this step.
              </Callout>

              {/* Mode toggle */}
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-overlay">
                <div className="flex-1">
                  <p className="text-xs font-medium text-text-primary">Whitelist mode</p>
                  <p className="text-[10px] text-text-muted">Only show selected tabs — everything else hidden</p>
                </div>
                <button onClick={toggleVisibleTabsMode}
                  className={cn('w-9 h-5 rounded-full transition-colors relative shrink-0',
                    useVisibleTabsMode ? 'bg-brand-500' : 'bg-surface-raised border border-border')}>
                  <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                    useVisibleTabsMode ? 'translate-x-4' : 'translate-x-0.5')} />
                </button>
              </div>

              {/* Tab list */}
              <div className="space-y-1.5">
                {MODULE_TABS.map(tab => {
                  const visible = tabVisible(tab.key)
                  return (
                    <button key={tab.key} onClick={() => toggleTab(tab.key)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
                        visible
                          ? 'border-green-500/25 bg-green-500/5'
                          : 'border-border bg-surface-overlay opacity-60'
                      )}>
                      <div className={cn('w-5 h-5 rounded flex items-center justify-center shrink-0',
                        visible ? 'bg-green-500/20' : 'bg-surface-raised border border-border')}>
                        {visible ? <Eye size={11} className="text-green-400" /> : <EyeOff size={11} className="text-text-muted" />}
                      </div>
                      <span className="text-xs font-medium text-text-primary flex-1">{tab.label}</span>
                      <span className="text-[10px] font-mono text-text-muted">{tab.key}</span>
                      {tab.always && <span className="text-[10px] text-text-muted italic">always present</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── FIELDS ────────────────────────────────────────────── */}
          {section === 'fields' && (
            <div className="space-y-4">
              <Callout variant="info">
                Field modes: <strong>Default</strong> = follows canEdit from role.
                <strong> Read-only</strong> = never editable on this step.
                <strong> Hidden</strong> = not shown at all.
              </Callout>

              {fieldSections.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Layers size={24} className="text-text-muted" />
                  <p className="text-xs text-text-muted">
                    {entityType
                      ? `No field schema found for ${entityType}. Add fields in the Module Blueprint admin.`
                      : 'Set entityType on the blueprint to see module fields here.'
                    }
                  </p>
                </div>
              )}

              {fieldSections.map((sec, si) => (
                <div key={si}>
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
                    {sec.label}
                  </p>
                  <div className="space-y-1">
                    {(sec.fields || [])
                      .filter(f => f.type !== 'SECTION_HEADER' && f.type !== 'DIVIDER')
                      .map(f => {
                        const mode = fieldMode(f.key)
                        return (
                          <div key={f.key} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border hover:bg-surface-overlay/50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-text-primary">{f.label}</span>
                              <span className="text-[10px] font-mono text-text-muted ml-2">{f.key}</span>
                            </div>
                            {/* Mode selector */}
                            <div className="flex items-center rounded-md border border-border overflow-hidden shrink-0">
                              {[
                                { m: 'default',  label: 'Default', color: 'text-text-muted' },
                                { m: 'editable', label: 'Editable', color: 'text-green-400' },
                                { m: 'readonly', label: 'Read-only', color: 'text-amber-400' },
                                { m: 'hidden',   label: 'Hidden', color: 'text-red-400' },
                              ].map(opt => (
                                <button key={opt.m} onClick={() => setFieldMode(f.key, opt.m)}
                                  className={cn(
                                    'px-2 py-1 text-[10px] transition-colors',
                                    mode === opt.m
                                      ? `bg-surface-raised ${opt.color} font-medium`
                                      : 'text-text-muted hover:bg-surface-overlay'
                                  )}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })
                    }
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── ACTIONS ───────────────────────────────────────────── */}
          {section === 'actions' && (
            <div className="space-y-4">
              <Callout variant="info">
                Restrict which action buttons appear on this step.
                Default: all actions available (based on task role).
                Uncheck to hide an action.
              </Callout>
              <div className="space-y-1.5">
                {WORKFLOW_ACTIONS.map(action => {
                  const available = actionAvailable(action.key)
                  return (
                    <button key={action.key} onClick={() => toggleAction(action.key)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
                        available ? 'border-green-500/25 bg-green-500/5' : 'border-border opacity-50'
                      )}>
                      <div className={cn('w-5 h-5 rounded flex items-center justify-center shrink-0',
                        available ? 'bg-green-500/20' : 'bg-surface-raised border border-border')}>
                        {available && <CheckCircle2 size={11} className="text-green-400" />}
                      </div>
                      <span className={cn('text-xs font-medium flex-1', action.color)}>{action.label}</span>
                      <span className="text-[10px] font-mono text-text-muted">{action.key}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── PREVIEW ───────────────────────────────────────────── */}
          {section === 'preview' && (
            <div className="space-y-3">
              <Callout variant={hasOverride ? 'warning' : 'success'}>
                {hasOverride
                  ? 'Restrictions are active. This JSON will be stored in stepUiOverrideJson and snapshotted into StepInstance at runtime.'
                  : 'No restrictions configured. All defaults apply — nothing will be stored.'
                }
              </Callout>
              <pre className="text-[11px] font-mono text-text-secondary bg-surface-overlay border border-border rounded-lg p-4 overflow-x-auto leading-relaxed">
                {serializeOverride(state) || '// No restrictions — null will be stored'}
              </pre>
              {hasOverride && (
                <div className="space-y-1.5 text-xs">
                  {state.visibleTabs?.length > 0 && (
                    <div className="flex gap-2"><span className="text-text-muted w-28">Visible tabs only</span><span className="text-brand-400 font-mono">{state.visibleTabs.join(', ')}</span></div>
                  )}
                  {state.hiddenTabs?.length > 0 && (
                    <div className="flex gap-2"><span className="text-text-muted w-28">Hidden tabs</span><span className="text-red-400 font-mono">{state.hiddenTabs.join(', ')}</span></div>
                  )}
                  {state.editableFields?.length > 0 && (
                    <div className="flex gap-2"><span className="text-text-muted w-28">Editable only</span><span className="text-green-400 font-mono">{state.editableFields.join(', ')}</span></div>
                  )}
                  {state.readOnlyFields?.length > 0 && (
                    <div className="flex gap-2"><span className="text-text-muted w-28">Read-only</span><span className="text-amber-400 font-mono">{state.readOnlyFields.join(', ')}</span></div>
                  )}
                  {state.hiddenFields?.length > 0 && (
                    <div className="flex gap-2"><span className="text-text-muted w-28">Hidden fields</span><span className="text-red-400 font-mono">{state.hiddenFields.join(', ')}</span></div>
                  )}
                  {state.availableActions?.length > 0 && (
                    <div className="flex gap-2"><span className="text-text-muted w-28">Actions only</span><span className="text-blue-400 font-mono">{state.availableActions.join(', ')}</span></div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
