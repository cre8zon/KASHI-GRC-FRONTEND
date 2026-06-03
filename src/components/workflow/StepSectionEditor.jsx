import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical, Info } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * Gap 4: Section editor panel rendered inside each StepFormCard.
 *
 * Lets a platform admin define compound-task sections on a blueprint step.
 * Each section declares one piece of work the actor must complete before the
 * task can be approved. The engine reads these at step activation and snapshots
 * them into task_section_completions — after which they're fully isolated from
 * blueprint changes.
 *
 * Usage inside StepFormCard:
 *   <StepSectionEditor
 *     sections={step.sections || []}
 *     onChange={(sections) => onChange({ ...step, sections })}
 *     stepSide={step.side}
 *   />
 *
 * ── NEW FIELDS (Gap P2 fix) ───────────────────────────────────────────────────
 * When tracksItems = true, three new inputs appear in the Advanced panel:
 *   sectionScreenKey — screen config key for section container (assignment panel, submit button)
 *   itemScreenKey    — screen config key for each item card (DynamicForm fields + ItemPanel)
 *   itemRefType      — what each itemRefId points to: CONTROL, FINDING, QUESTION_RESPONSE, etc.
 *   sectionUiJson    — inline JSON override merged on top of sectionScreenKey config
 *   itemUiJson       — inline JSON override merged on top of itemScreenKey config
 *
 * These are snapshotted into task_section_completions.snap_* at task creation and
 * returned in TaskSectionProgressResponse for CompoundSectionRenderer to consume.
 * Setting them is optional — sections without screenKeys fall back to CompoundTaskProgress.
 */

const COMPLETION_EVENT_SUGGESTIONS = [
  'ASSESSMENT_SUBMITTED',
  'DOCUMENT_UPLOADED',
  'EVALUATION_SAVED',
  'POLICY_SIGNED_OFF',
  'CONTROL_EVALUATED',
  'REVIEW_COMPLETED',
  'EVIDENCE_UPLOADED',
  'REPORT_GENERATED',
  'ACKNOWLEDGEMENT_SUBMITTED',
  'FINDINGS_CONFIRMED',
]

const ITEM_REF_TYPE_SUGGESTIONS = [
  'CONTROL',
  'RISK_CONTROL',
  'FINDING',
  'AUDIT_EVIDENCE',
  'QUESTION_RESPONSE',
  'POLICY_CLAUSE',
  'EXCEPTION',
  'INCIDENT',
]

const EMPTY_SECTION = {
  sectionKey:         '',
  sectionOrder:       1,
  label:              '',
  description:        '',
  required:           true,
  completionEvent:    '',
  requiresAssignment: false,
  tracksItems:        true,
  // UI config fields (optional — only used when tracksItems = true)
  sectionScreenKey:   '',
  itemScreenKey:      '',
  itemRefType:        '',
  sectionUiJson:      '',
  itemUiJson:         '',
}

export function StepSectionEditor({ sections = [], onChange, stepSide }) {
  const [expanded, setExpanded] = useState(sections.length > 0)

  // SYSTEM steps are automated — they cannot have human-facing sections
  if (stepSide === 'SYSTEM') {
    return (
      <p className="text-[10px] text-text-muted italic mt-2 pl-1">
        SYSTEM steps run automated actions — compound sections are not applicable.
      </p>
    )
  }

  const addSection = () => {
    const next = [...sections, {
      ...EMPTY_SECTION,
      sectionOrder: sections.length + 1,
    }]
    onChange(next)
    setExpanded(true)
  }

  const removeSection = (i) => {
    onChange(
      sections
        .filter((_, idx) => idx !== i)
        .map((s, idx) => ({ ...s, sectionOrder: idx + 1 }))
    )
  }

  const updateSection = (i, field, value) =>
    onChange(sections.map((s, idx) => idx === i ? { ...s, [field]: value } : s))

  const requiredCount  = sections.filter(s => s.required).length
  const validCount     = sections.filter(s => s.sectionKey && s.completionEvent && s.label).length

  return (
    <div className="mt-3 rounded-md border border-border overflow-hidden">
      {/* ── Header ── */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 bg-surface-overlay hover:bg-surface-overlay/70 transition-colors text-left gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-text-secondary shrink-0">
            Compound task sections
          </span>
          {sections.length > 0 ? (
            <span className="text-[10px] font-mono bg-brand-500/10 text-brand-400 px-1.5 py-0.5 rounded shrink-0">
              {validCount}/{sections.length} valid · {requiredCount} required
            </span>
          ) : (
            <span className="text-[10px] text-text-muted italic">
              none — actor approves directly from inbox
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); addSection() }}
            className="flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 px-1.5 py-0.5 rounded hover:bg-brand-500/10 transition-colors"
          >
            <Plus size={10} />
            Add section
          </button>
          {expanded
            ? <ChevronUp size={12} className="text-text-muted" />
            : <ChevronDown size={12} className="text-text-muted" />}
        </div>
      </button>

      {/* ── Section list ── */}
      {expanded && (
        <>
          {sections.length === 0 ? (
            <div className="px-4 py-5 text-center bg-surface">
              <p className="text-xs text-text-muted">
                No sections configured — the actor will approve this task directly.
              </p>
              <p className="text-[10px] text-text-muted mt-1">
                Add sections to require specific work (answers, uploads, evaluations) before approval.
              </p>
              <button
                type="button"
                onClick={addSection}
                className="mt-2 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                + Add first section
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sections.map((sec, i) => (
                <SectionRow
                  key={i}
                  section={sec}
                  index={i}
                  onUpdate={(field, val) => updateSection(i, field, val)}
                  onRemove={() => removeSection(i)}
                />
              ))}
            </div>
          )}

          {/* Hint bar */}
          {sections.length > 0 && (
            <div className="px-3 py-2 bg-surface-overlay/50 flex items-start gap-1.5">
              <Info size={10} className="text-text-muted mt-0.5 shrink-0" />
              <p className="text-[10px] text-text-muted leading-relaxed">
                Each section's <span className="font-mono">completionEvent</span> must match the string
                your module publishes in <span className="font-mono">TaskSectionEvent.sectionDone()</span>.
                Required sections gate approval — optional ones appear in progress but don't block.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SectionRow({ section, index, onUpdate, onRemove }) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const isValid = section.sectionKey && section.completionEvent && section.label

  return (
    <div className={cn(
      'p-3 bg-surface',
      !isValid && 'border-l-2 border-amber-500/50'
    )}>
      <div className="flex items-start gap-2">
        {/* Drag grip (visual only — parent handles drag) */}
        <GripVertical size={12} className="text-text-muted mt-1.5 shrink-0 cursor-grab" />

        <div className="flex-1 grid grid-cols-2 gap-2">
          {/* Label */}
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">
              Label *
            </label>
            <input
              value={section.label}
              onChange={e => onUpdate('label', e.target.value)}
              placeholder="e.g. Answer questions"
              className="h-7 w-full rounded border border-border bg-surface-raised px-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Completion event */}
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">
              Completion event *
            </label>
            <input
              value={section.completionEvent}
              onChange={e => onUpdate('completionEvent', e.target.value.toUpperCase().replace(/[\s-]+/g, '_'))}
              placeholder="ASSESSMENT_SUBMITTED"
              list={`ce-suggestions-${index}`}
              className="h-7 w-full rounded border border-border bg-surface-raised px-2 text-xs font-mono text-brand-400 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <datalist id={`ce-suggestions-${index}`}>
              {COMPLETION_EVENT_SUGGESTIONS.map(ev => <option key={ev} value={ev} />)}
            </datalist>
          </div>

          {/* Section key */}
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">
              Section key *
            </label>
            <input
              value={section.sectionKey}
              onChange={e => onUpdate('sectionKey', e.target.value.toUpperCase().replace(/[\s-]+/g, '_'))}
              placeholder="ANSWER"
              className="h-7 w-full rounded border border-border bg-surface-raised px-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Required toggle */}
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={section.required}
                onChange={e => onUpdate('required', e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-brand-500"
              />
              <span className="text-xs text-text-secondary">Required (gates approval)</span>
            </label>
          </div>
        </div>

        {/* Remove button */}
        <button
          type="button"
          onClick={onRemove}
          className="mt-1 p-1 text-text-muted hover:text-red-400 transition-colors rounded shrink-0"
          title="Remove section"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(s => !s)}
        className="mt-1.5 ml-5 text-[10px] text-text-muted hover:text-text-secondary transition-colors"
      >
        {showAdvanced ? '▾ Hide advanced' : '▸ Advanced'}
      </button>

      {showAdvanced && (
        <div className="mt-2 ml-5 grid grid-cols-2 gap-2">
          {/* Description */}
          <div className="col-span-2">
            <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">
              Description
            </label>
            <input
              value={section.description || ''}
              onChange={e => onUpdate('description', e.target.value)}
              placeholder="Shown in the section panel header"
              className="h-7 w-full rounded border border-border bg-surface-raised px-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Case 2: requires assignment */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={section.requiresAssignment}
              onChange={e => onUpdate('requiresAssignment', e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-brand-500"
            />
            <span className="text-xs text-text-secondary">Assigns work to others</span>
          </label>

          {/* Case 3: tracks items */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={section.tracksItems}
              onChange={e => onUpdate('tracksItems', e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-brand-500"
            />
            <span className="text-xs text-text-secondary">Tracks individual items</span>
          </label>

          {/* ── UI config fields — screen keys always visible (TPRM always tracks items) ── */}
          <>
              {/* Divider */}
              <div className="col-span-2 mt-1 pt-1 border-t border-border/50">
                <p className="text-[10px] text-text-muted flex items-center gap-1.5">
                  <Info size={9} />
                  Screen config — drives CompoundSectionRenderer UI for this section's items.
                  Leave blank to use the legacy CompoundTaskProgress fallback (existing TPRM).
                </p>
              </div>

              {/* sectionScreenKey */}
              <div>
                <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">
                  Section screen key
                </label>
                <input
                  value={section.sectionScreenKey || ''}
                  onChange={e => onUpdate('sectionScreenKey', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  placeholder="e.g. risk_control_section"
                  className="h-7 w-full rounded border border-border bg-surface-raised px-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <p className="text-[9px] text-text-muted mt-0.5">
                  GET /v1/ui-config/screen/:key → section container config
                </p>
              </div>

              {/* itemScreenKey */}
              <div>
                <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">
                  Item screen key
                </label>
                <input
                  value={section.itemScreenKey || ''}
                  onChange={e => onUpdate('itemScreenKey', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  placeholder="e.g. risk_control_item"
                  className="h-7 w-full rounded border border-border bg-surface-raised px-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <p className="text-[9px] text-text-muted mt-0.5">
                  GET /v1/ui-config/screen/:key → item card config
                </p>
              </div>

              {/* itemRefType */}
              <div className="col-span-2">
                <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">
                  Item ref type
                </label>
                <input
                  value={section.itemRefType || ''}
                  onChange={e => onUpdate('itemRefType', e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                  placeholder="CONTROL"
                  list={`irt-suggestions-${index}`}
                  className="h-7 w-full rounded border border-border bg-surface-raised px-2 text-xs font-mono text-brand-400 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <datalist id={`irt-suggestions-${index}`}>
                  {ITEM_REF_TYPE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
                </datalist>
                <p className="text-[9px] text-text-muted mt-0.5">
                  What itemRefId points to — used for action item creation and nav context.
                </p>
              </div>

              {/* JSON overrides — only shown when tracksItems is explicitly enabled */}
              {section.tracksItems && (<>
              <div className="col-span-2">
                <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">
                  Section UI override JSON
                  <span className="ml-1 text-text-muted/60 normal-case">(optional — extends sectionScreenKey)</span>
                </label>
                <textarea
                  value={section.sectionUiJson || ''}
                  onChange={e => onUpdate('sectionUiJson', e.target.value)}
                  placeholder={'{\n  "hiddenTabs": ["comments"],\n  "availableActions": ["COMPLETE"]\n}'}
                  rows={3}
                  className="w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted/50 resize-none focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* itemUiJson */}
              <div className="col-span-2">
                <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">
                  Item UI override JSON
                  <span className="ml-1 text-text-muted/60 normal-case">(optional — extends itemScreenKey)</span>
                </label>
                <textarea
                  value={section.itemUiJson || ''}
                  onChange={e => onUpdate('itemUiJson', e.target.value)}
                  placeholder={'{\n  "readOnlyFields": ["risk_rating"],\n  "hiddenFields": ["internal_notes"]\n}'}
                  rows={3}
                  className="w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted/50 resize-none focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              </>)}
          </>
        </div>
      )}
    </div>
  )
}