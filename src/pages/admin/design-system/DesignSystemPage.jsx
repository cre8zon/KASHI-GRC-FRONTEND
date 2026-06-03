/**
 * DesignSystemPage — /admin/design-system
 *
 * In-app component playground. No Storybook, no separate dev server.
 * Lives inside the platform itself so Platform Admin can see exactly
 * how components render in the real app theme (dark/light, brand colors).
 *
 * Sections:
 *   Typography      — text scales, weights, mono, muted
 *   Colors          — full color palette from CSS vars
 *   Buttons         — all variants × sizes × states
 *   Badges          — all color tags + dynamic badge
 *   Inputs          — text, textarea, select, error, disabled, with icon
 *   New primitives  — all components from ui-primitives.jsx
 *   Form fields     — every UiFormField.FieldType rendered
 *   Modals          — modal sizes, confirm dialog
 *   Data display    — table, progress, timeline
 *   Feedback        — callout variants, toast trigger, empty state
 *   Layout          — page layout, card, dividers
 *
 * ADD TO App.jsx:
 *   import DesignSystemPage from './pages/admin/design-system/DesignSystemPage'
 *   <Route path="/admin/design-system" element={<DesignSystemPage />} />
 *
 * ADD TO ui_navigation:
 *   INSERT INTO ui_navigation (nav_key, label, icon, route, parent_key, sort_order, module, allowed_sides, is_active)
 *   VALUES ('admin_design_system', 'Design system', 'Palette', '/admin/design-system', 'admin_settings', 99, 'ADMIN', 'SYSTEM', true);
 */

import { useState } from 'react'
import {
  Plus, Pencil, Trash2, Search, Bell, Shield, Star,
  ChevronDown, ArrowRight, Check, AlertTriangle, Info,
  CheckCircle2, XCircle, Zap, User, Settings, Layers,
  RefreshCw, Download, Upload, Eye, Lock, Unlock,
  GitBranch, FileText, Clock, Flag, Hash,
} from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Button, SplitButton } from '../../../components/ui/Button'
import { Badge, DynamicBadge } from '../../../components/ui/Badge'
import { Input, Textarea } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import {
  Tooltip, Callout, Progress, Breadcrumb, Stepper,
  TagInput, MultiSelect, AsyncSelect, DateRangePicker,
  FileDropZone, PhoneInput, CurrencyInput, RatingInput,
  SliderInput, JsonEditor,
} from '../../../components/ui/ui-primitives'
import { cn } from '../../../lib/cn'

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ id, title, children }) {
  return (
    <section id={id} className="mb-12">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <div className="flex-1 h-px bg-border" />
        <a href={`#${id}`} className="text-[10px] font-mono text-text-muted hover:text-brand-400 transition-colors">#{id}</a>
      </div>
      {children}
    </section>
  )
}

function Subsection({ label, children, className }) {
  return (
    <div className={cn('mb-6', className)}>
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-3">{label}</p>
      {children}
    </div>
  )
}

// Canvas with label — shows a component on a themed background
function Canvas({ label, children, dark = false, className }) {
  return (
    <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
      {label && (
        <div className="px-3 py-1.5 border-b border-border bg-surface-overlay">
          <span className="text-[10px] font-mono text-text-muted">{label}</span>
        </div>
      )}
      <div className={cn('p-5 flex flex-wrap items-start gap-3', dark && 'bg-gray-950')}>
        {children}
      </div>
    </div>
  )
}

// ─── Nav sidebar ─────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'typography',  label: 'Typography' },
  { id: 'colors',      label: 'Colors' },
  { id: 'buttons',     label: 'Buttons' },
  { id: 'badges',      label: 'Badges' },
  { id: 'inputs',      label: 'Inputs' },
  { id: 'select',      label: 'Selects' },
  { id: 'primitives',  label: 'New primitives' },
  { id: 'formfields',  label: 'Form field types' },
  { id: 'modals',      label: 'Modals' },
  { id: 'feedback',    label: 'Feedback' },
  { id: 'data',        label: 'Data display' },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
  const [modalSize, setModalSize]   = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [tagValue, setTagValue]     = useState(['SOX', 'ISO27001'])
  const [multiValue, setMultiValue] = useState(['risk', 'audit'])
  const [asyncValue, setAsyncValue] = useState(null)
  const [dateRange, setDateRange]   = useState({})
  const [rating, setRating]         = useState(3)
  const [slider, setSlider]         = useState(40)
  const [jsonValue, setJsonValue]   = useState('{\n  "key": "value"\n}')
  const [stepperStep, setStepperStep] = useState(1)

  return (
    <PageLayout
      title="Design system"
      subtitle="Component reference — every UI primitive in every state"
    >
      <div className="flex h-full overflow-hidden">

        {/* Sticky sidebar nav */}
        <nav className="w-44 shrink-0 border-r border-border overflow-y-auto py-4">
          {SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`}
              className="flex items-center px-4 py-1.5 text-xs text-text-muted hover:text-brand-400 hover:bg-brand-500/5 transition-colors rounded-md mx-2">
              {s.label}
            </a>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6 max-w-5xl">

          {/* ── TYPOGRAPHY ─────────────────────────────────────────── */}
          <Section id="typography" title="Typography">
            <Canvas label="Text scales">
              <div className="w-full space-y-2">
                {[
                  ['text-2xl font-bold text-text-primary', '2xl · bold — Page headings'],
                  ['text-xl font-semibold text-text-primary', 'xl · semibold — Section headings'],
                  ['text-base font-semibold text-text-primary', 'base · semibold — Card titles'],
                  ['text-sm text-text-primary', 'sm — Body text, table cells'],
                  ['text-xs text-text-secondary', 'xs — Secondary body, labels'],
                  ['text-[11px] text-text-muted', '11px — Captions, hints'],
                  ['text-[10px] font-semibold uppercase tracking-widest text-text-muted', '10px · uppercase — Section labels'],
                  ['text-xs font-mono text-brand-400', 'xs · mono — Code, keys, IDs'],
                ].map(([cls, label]) => (
                  <div key={label} className={cls}>{label}</div>
                ))}
              </div>
            </Canvas>
          </Section>

          {/* ── COLORS ───────────────────────────────────────────────── */}
          <Section id="colors" title="Colors">
            <Canvas label="Semantic palette">
              <div className="grid grid-cols-4 gap-3 w-full">
                {[
                  { name: 'brand-500', cls: 'bg-brand-500' },
                  { name: 'green-500', cls: 'bg-green-500' },
                  { name: 'amber-500', cls: 'bg-amber-500' },
                  { name: 'red-500',   cls: 'bg-red-500' },
                  { name: 'blue-500',  cls: 'bg-blue-500' },
                  { name: 'purple-500',cls: 'bg-purple-500' },
                  { name: 'teal-500',  cls: 'bg-teal-500' },
                  { name: 'surface-raised', cls: 'bg-surface-raised border border-border' },
                  { name: 'surface-overlay', cls: 'bg-surface-overlay border border-border' },
                  { name: 'border',    cls: 'bg-border' },
                  { name: 'text-primary',   cls: 'bg-text-primary' },
                  { name: 'text-muted',     cls: 'bg-text-muted' },
                ].map(c => (
                  <div key={c.name}>
                    <div className={cn('h-10 w-full rounded-lg mb-1', c.cls)} />
                    <p className="text-[10px] font-mono text-text-muted">{c.name}</p>
                  </div>
                ))}
              </div>
            </Canvas>
          </Section>

          {/* ── BUTTONS ──────────────────────────────────────────────── */}
          <Section id="buttons" title="Buttons">
            <Subsection label="Variants × sizes">
              <Canvas label="All variants — md size">
                {['primary','secondary','danger','ghost','warning','link','success'].map(v => (
                  <Button key={v} variant={v} size="md">{v}</Button>
                ))}
              </Canvas>
            </Subsection>

            <Subsection label="Size scale">
              <Canvas label="primary variant — all sizes">
                <Button size="xs">xs</Button>
                <Button size="sm">sm</Button>
                <Button size="md">md</Button>
                <Button size="lg">lg</Button>
              </Canvas>
            </Subsection>

            <Subsection label="With icons">
              <Canvas label="Icon left">
                <Button size="sm" icon={Plus}>Create</Button>
                <Button size="sm" variant="secondary" icon={Pencil}>Edit</Button>
                <Button size="sm" variant="danger" icon={Trash2}>Delete</Button>
                <Button size="sm" variant="ghost" icon={RefreshCw}>Refresh</Button>
                <Button size="sm" variant="secondary" icon={Download}>Export</Button>
              </Canvas>
            </Subsection>

            <Subsection label="Icon-only (new)">
              <Canvas label="Icon-only sizes">
                <Button size="icon-xs" variant="ghost" icon={Plus} />
                <Button size="icon-sm" variant="secondary" icon={Pencil} />
                <Button size="icon-md" variant="secondary" icon={Settings} />
                <Button size="icon-lg" variant="danger" icon={Trash2} />
              </Canvas>
            </Subsection>

            <Subsection label="States">
              <Canvas label="Disabled + Loading + Loading with text">
                <Button size="sm" disabled>Disabled</Button>
                <Button size="sm" loading>Loading</Button>
                <Button size="sm" loading loadingText="Saving…">Save</Button>
                <Button size="sm" variant="secondary" loading loadingText="Deleting…" variant="danger">Delete</Button>
              </Canvas>
            </Subsection>

            <Subsection label="Split button (new)">
              <Canvas label="Primary action + dropdown">
                <SplitButton
                  label="Publish"
                  onClick={() => {}}
                  actions={[
                    { label: 'Publish & notify', onClick: () => {} },
                    { label: 'Save as draft',    onClick: () => {} },
                    { label: 'Schedule…',        onClick: () => {} },
                  ]}
                />
                <SplitButton
                  label="Save"
                  variant="secondary"
                  onClick={() => {}}
                  actions={[
                    { label: 'Save & continue', onClick: () => {} },
                    { label: 'Save & close',    onClick: () => {} },
                  ]}
                />
              </Canvas>
            </Subsection>
          </Section>

          {/* ── BADGES ───────────────────────────────────────────────── */}
          <Section id="badges" title="Badges">
            <Canvas label="All color tags">
              {['red','amber','green','blue','purple','teal','cyan','gray'].map(c => (
                <Badge key={c} value={c.toUpperCase()} label={c} colorTag={c} />
              ))}
            </Canvas>
            <Canvas label="Status examples">
              <Badge value="ACTIVE"      label="Active"      colorTag="green" />
              <Badge value="DRAFT"       label="Draft"       colorTag="amber" />
              <Badge value="IN_REVIEW"   label="In review"   colorTag="blue" />
              <Badge value="REJECTED"    label="Rejected"    colorTag="red" />
              <Badge value="COMPLETED"   label="Completed"   colorTag="gray" />
              <Badge value="CRITICAL"    label="Critical"    colorTag="red" />
              <Badge value="HIGH"        label="High"        colorTag="amber" />
              <Badge value="MEDIUM"      label="Medium"      colorTag="blue" />
              <Badge value="LOW"         label="Low"         colorTag="gray" />
            </Canvas>
          </Section>

          {/* ── INPUTS ───────────────────────────────────────────────── */}
          <Section id="inputs" title="Inputs">
            <div className="grid grid-cols-2 gap-6">
              <Canvas label="Input states">
                <div className="w-full space-y-3">
                  <Input label="Default" placeholder="Enter value…" />
                  <Input label="With value" defaultValue="Some value" />
                  <Input label="Error state" defaultValue="bad@" error="Invalid email format" />
                  <Input label="Helper text" placeholder="e.g. RISK_001" helperText="Use UPPER_SNAKE_CASE" />
                  <Input label="Disabled" defaultValue="Read only" disabled />
                </div>
              </Canvas>
              <Canvas label="Textarea states">
                <div className="w-full space-y-3">
                  <Textarea label="Default" placeholder="Enter description…" />
                  <Textarea label="Error" defaultValue="too short" error="Minimum 20 characters" />
                  <Textarea label="Disabled" defaultValue="Read only content" disabled />
                </div>
              </Canvas>
            </div>
          </Section>

          {/* ── SELECTS ──────────────────────────────────────────────── */}
          <Section id="select" title="Selects">
            <div className="grid grid-cols-2 gap-6">
              <Canvas label="Native select">
                <div className="w-full space-y-3">
                  <Select label="Default" placeholder="Select…"
                    options={[{ value: 'a', label: 'Option A' }, { value: 'b', label: 'Option B' }, { value: 'c', label: 'Option C' }]} />
                  <Select label="Error" placeholder="Select…" error="Required"
                    options={[{ value: 'a', label: 'Option A' }]} />
                </div>
              </Canvas>
              <Canvas label="Multi-select (new)">
                <div className="w-full">
                  <MultiSelect
                    label="Multi-select"
                    value={multiValue}
                    onChange={setMultiValue}
                    options={[
                      { value: 'risk',    label: 'Risk' },
                      { value: 'audit',   label: 'Audit' },
                      { value: 'issue',   label: 'Issue' },
                      { value: 'policy',  label: 'Policy' },
                      { value: 'control', label: 'Control' },
                    ]}
                  />
                  <p className="text-[10px] text-text-muted mt-2">Selected: {multiValue.join(', ') || 'none'}</p>
                </div>
              </Canvas>
            </div>
            <div className="mt-4">
              <Canvas label="Async select / Lookup (new)">
                <div className="w-full max-w-sm">
                  <AsyncSelect
                    label="Search users (async)"
                    value={asyncValue}
                    onChange={setAsyncValue}
                    placeholder="Type to search…"
                    minChars={1}
                    loadOptions={async (q) => {
                      await new Promise(r => setTimeout(r, 300))
                      return [
                        { value: '1', label: 'Alice Chen', sublabel: 'alice@company.com' },
                        { value: '2', label: 'Bob Singh', sublabel: 'bob@company.com' },
                        { value: '3', label: 'Carol Kim', sublabel: 'carol@company.com' },
                      ].filter(u => u.label.toLowerCase().includes(q.toLowerCase()))
                    }}
                    displayValue={(v) => v?.label}
                  />
                </div>
              </Canvas>
            </div>
          </Section>

          {/* ── NEW PRIMITIVES ────────────────────────────────────────── */}
          <Section id="primitives" title="New primitives">

            <Subsection label="Tooltip">
              <Canvas label="Positions">
                <Tooltip content="Top tooltip">
                  <Button size="sm" variant="secondary">Hover (top)</Button>
                </Tooltip>
                <Tooltip content="Bottom tooltip" side="bottom">
                  <Button size="sm" variant="secondary">Hover (bottom)</Button>
                </Tooltip>
                <Tooltip content="Left tooltip" side="left">
                  <Button size="sm" variant="secondary">Hover (left)</Button>
                </Tooltip>
                <Tooltip content="Right tooltip" side="right">
                  <Button size="sm" variant="secondary">Hover (right)</Button>
                </Tooltip>
              </Canvas>
            </Subsection>

            <Subsection label="Callout (inline alerts)">
              <div className="space-y-2">
                <Callout variant="info" title="Information">This is an informational message with context about what the user should know.</Callout>
                <Callout variant="warning" title="Warning">Something needs your attention before proceeding.</Callout>
                <Callout variant="error" title="Error">Something went wrong. Please review and try again.</Callout>
                <Callout variant="success" title="Success">The operation completed successfully.</Callout>
                <Callout variant="info" onClose={() => {}}>Dismissible callout — click X to close.</Callout>
              </div>
            </Subsection>

            <Subsection label="Progress">
              <Canvas label="Linear progress">
                <div className="w-full space-y-3">
                  <Progress value={25} max={100} showLabel color="red" />
                  <Progress value={50} max={100} showLabel color="amber" />
                  <Progress value={75} max={100} showLabel color="brand" />
                  <Progress value={100} max={100} showLabel color="green" />
                  <Progress value={60} max={100} label="12/20 steps" color="blue" />
                </div>
              </Canvas>
              <Canvas label="Circular progress">
                <Progress variant="circular" value={25} max={100} size={48} strokeWidth={5} label="25%" color="red" />
                <Progress variant="circular" value={50} max={100} size={48} strokeWidth={5} label="50%" color="amber" />
                <Progress variant="circular" value={75} max={100} size={48} strokeWidth={5} label="75%" color="brand" />
                <Progress variant="circular" value={100} max={100} size={48} strokeWidth={5} label="✓" color="green" />
                <Progress variant="circular" value={33} max={100} size={64} strokeWidth={6} label="33%" color="blue" />
              </Canvas>
            </Subsection>

            <Subsection label="Breadcrumb">
              <Canvas label="Navigation path">
                <Breadcrumb items={[
                  { label: 'Admin', href: '/admin' },
                  { label: 'Workflows', href: '/admin/workflows' },
                  { label: 'Risk Management v2' },
                ]} />
              </Canvas>
            </Subsection>

            <Subsection label="Stepper">
              <Canvas label="Multi-step form progress">
                <div className="w-full space-y-3">
                  <Stepper
                    steps={['Identity', 'Config keys', 'Field schema', 'Status flow', 'Capabilities']}
                    current={stepperStep}
                    onChange={setStepperStep}
                  />
                  <div className="flex gap-2">
                    <Button size="xs" variant="secondary" onClick={() => setStepperStep(Math.max(0, stepperStep - 1))}>← Prev</Button>
                    <Button size="xs" onClick={() => setStepperStep(Math.min(4, stepperStep + 1))}>Next →</Button>
                  </div>
                </div>
              </Canvas>
            </Subsection>

            <Subsection label="Tag input">
              <Canvas label="Chip / tag input with autocomplete">
                <div className="w-full max-w-md">
                  <TagInput
                    label="Frameworks"
                    value={tagValue}
                    onChange={setTagValue}
                    placeholder="Add framework…"
                    suggestions={['SOX','PCI-DSS','ISO27001','HIPAA','SOC2','GDPR','NIST','CCPA']}
                  />
                  <p className="text-[10px] text-text-muted mt-2">Value: {tagValue.join(', ')}</p>
                </div>
              </Canvas>
            </Subsection>

            <Subsection label="Date range picker">
              <Canvas label="From / To date range">
                <div className="w-full max-w-sm">
                  <DateRangePicker
                    label="Audit period"
                    value={dateRange}
                    onChange={setDateRange}
                  />
                  <p className="text-[10px] text-text-muted mt-2">
                    From: {dateRange.from || '—'} · To: {dateRange.to || '—'}
                  </p>
                </div>
              </Canvas>
            </Subsection>

            <Subsection label="File drop zone">
              <Canvas label="Generic drag-and-drop upload">
                <div className="w-full max-w-md">
                  <FileDropZone
                    label="Upload evidence"
                    accept=".pdf,.xlsx,.csv"
                    multiple
                    maxSizeMb={10}
                    hint="PDF, Excel, CSV — max 10MB each"
                    onFiles={(files) => console.log(files)}
                  />
                </div>
              </Canvas>
            </Subsection>
          </Section>

          {/* ── FORM FIELD TYPES ─────────────────────────────────────── */}
          <Section id="formfields" title="Form field types">
            <p className="text-xs text-text-muted mb-4">
              Every <code className="font-mono text-brand-400 bg-brand-500/10 px-1 rounded">UiFormField.FieldType</code> rendered.
              These are what DynamicForm renders for each field type from the DB.
            </p>
            <div className="grid grid-cols-2 gap-6">
              <Canvas label="PHONE">
                <div className="w-full"><PhoneInput label="Phone" placeholder="+91 98765 43210" /></div>
              </Canvas>
              <Canvas label="CURRENCY">
                <div className="w-full"><CurrencyInput label="Budget" currency="USD" placeholder="0.00" /></div>
              </Canvas>
              <Canvas label="RATING">
                <div className="w-full">
                  <p className="text-xs font-medium text-text-secondary mb-1">Risk score</p>
                  <RatingInput value={rating} onChange={setRating} max={5} />
                  <p className="text-[10px] text-text-muted mt-1">Value: {rating}</p>
                </div>
              </Canvas>
              <Canvas label="SLIDER">
                <div className="w-full">
                  <SliderInput label="Likelihood" value={slider} onChange={setSlider} min={0} max={100} step={5} showValue />
                </div>
              </Canvas>
              <Canvas label="JSON_EDITOR" className="col-span-2">
                <div className="w-full">
                  <JsonEditor label="Step UI override" value={jsonValue} onChange={setJsonValue} rows={6}
                    placeholder='{"visibleTabs": ["overview", "evidence"]}' />
                </div>
              </Canvas>
              <Canvas label="TAG">
                <div className="w-full">
                  <TagInput label="Tags" value={['compliance', 'financial']} onChange={() => {}}
                    suggestions={['compliance','financial','operational','strategic','cyber']} />
                </div>
              </Canvas>
              <Canvas label="URL">
                <div className="w-full">
                  <Input label="Website" type="url" placeholder="https://vendor.com" />
                </div>
              </Canvas>
            </div>
          </Section>

          {/* ── MODALS ───────────────────────────────────────────────── */}
          <Section id="modals" title="Modals">
            <Canvas label="Sizes — click to preview">
              {['sm','md','lg','xl'].map(size => (
                <Button key={size} size="sm" variant="secondary" onClick={() => setModalSize(size)}>
                  Modal {size}
                </Button>
              ))}
              <Button size="sm" variant="danger" onClick={() => setConfirmOpen(true)}>
                Confirm dialog
              </Button>
            </Canvas>

            <Modal open={!!modalSize} onClose={() => setModalSize(null)}
              title={`Modal — ${modalSize} size`}
              subtitle="This is the subtitle shown below the title"
              size={modalSize}
              footer={
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setModalSize(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => setModalSize(null)}>Confirm</Button>
                </div>
              }
            >
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">
                  Modal content area. This is a <code className="font-mono text-brand-400 text-xs">{modalSize}</code> sized modal.
                  The max heights for each size:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {['sm: max-w-md','md: max-w-xl','lg: max-w-2xl','xl: max-w-4xl'].map(s => (
                    <div key={s} className="px-3 py-2 rounded-lg bg-surface-overlay border border-border text-xs font-mono text-text-muted">{s}</div>
                  ))}
                </div>
                <Callout variant="info">Modals scroll internally when content overflows. The footer stays pinned.</Callout>
              </div>
            </Modal>

            <ConfirmDialog
              open={confirmOpen}
              onClose={() => setConfirmOpen(false)}
              onConfirm={() => setConfirmOpen(false)}
              title="Delete blueprint"
              message='Delete "Risk Management v2"? This cannot be undone. Active workflow instances are unaffected.'
              variant="danger"
              confirmLabel="Delete"
            />
          </Section>

          {/* ── FEEDBACK ─────────────────────────────────────────────── */}
          <Section id="feedback" title="Feedback states">
            <Subsection label="Callout variants (contextual inline)">
              <div className="space-y-2">
                <Callout variant="info"><strong>Info:</strong> Used for neutral guidance and tips.</Callout>
                <Callout variant="warning"><strong>Warning:</strong> Used before destructive or irreversible actions.</Callout>
                <Callout variant="error"><strong>Error:</strong> Used for validation failures and system errors.</Callout>
                <Callout variant="success"><strong>Success:</strong> Used after successful operations.</Callout>
              </div>
            </Subsection>
            <Subsection label="Usage rules">
              <div className="grid grid-cols-2 gap-4 text-xs text-text-secondary">
                <div className="p-3 rounded-lg border border-green-500/20 bg-green-500/5 space-y-1">
                  <p className="font-semibold text-green-400">Use Callout when</p>
                  <p>• Contextual info specific to the current form or page</p>
                  <p>• Persistent warning (not dismissible)</p>
                  <p>• SoD violation banners</p>
                  <p>• Admin tips in blueprint designer</p>
                </div>
                <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/5 space-y-1">
                  <p className="font-semibold text-blue-400">Use Toast when</p>
                  <p>• One-time confirmation of an action</p>
                  <p>• Save success / delete success</p>
                  <p>• Non-blocking background notifications</p>
                  <p>• Any transient message (disappears)</p>
                </div>
              </div>
            </Subsection>
          </Section>

          {/* ── DATA DISPLAY ─────────────────────────────────────────── */}
          <Section id="data" title="Data display">
            <Subsection label="Progress in data contexts">
              <Canvas label="Workflow step progress">
                <div className="w-full space-y-2">
                  {[
                    { label: 'Vendor Assessment Fill', pct: 100, color: 'green', status: 'APPROVED' },
                    { label: 'Risk Review',            pct: 60,  color: 'brand', status: 'IN_PROGRESS' },
                    { label: 'Executive Approval',     pct: 0,   color: 'gray',  status: 'PENDING' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3 text-xs">
                      <span className="text-text-secondary w-48 shrink-0">{item.label}</span>
                      <Progress value={item.pct} max={100} color={item.color} className="flex-1" />
                      <Badge value={item.status} label={item.status} colorTag={
                        item.status === 'APPROVED' ? 'green' : item.status === 'IN_PROGRESS' ? 'blue' : 'gray'
                      } />
                    </div>
                  ))}
                </div>
              </Canvas>
            </Subsection>
          </Section>

        </div>
      </div>
    </PageLayout>
  )
}
