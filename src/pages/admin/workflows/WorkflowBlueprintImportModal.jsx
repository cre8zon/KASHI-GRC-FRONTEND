/**
 * WorkflowBlueprintImportModal.jsx
 *
 * Bulk import modal for the Workflow Blueprint Designer.
 * Imports all steps + roles + compound sections for an existing blueprint
 * via the extended WorkflowBlueprintImportService.
 *
 * Endpoint: POST /v1/workflows/{id}/import-steps
 *   → WorkflowBlueprintImportService.importSteps()
 *
 * Template download: GET /v1/workflows/import-template
 *   → Returns the SOC 2 engagement lifecycle CSV as a ready-to-edit example.
 *
 * USAGE in WorkflowBlueprintDesigner:
 *   import { WorkflowBlueprintImportModal } from './WorkflowBlueprintImportModal'
 *
 *   // State
 *   const [importOpen, setImportOpen] = useState(false)
 *
 *   // In the header Actions block, alongside the Edit button (DRAFT only):
 *   {isDraft && (
 *     <Button variant="secondary" size="sm" icon={Upload}
 *       onClick={() => setImportOpen(true)}>
 *       Import steps
 *     </Button>
 *   )}
 *
 *   // Modal instance (place after ConfirmDialog):
 *   <WorkflowBlueprintImportModal
 *     open={importOpen}
 *     onClose={() => setImportOpen(false)}
 *     blueprintId={bp.id}
 *     blueprintName={bp.name}
 *     onImported={() => {
 *       setImportOpen(false)
 *       qc.invalidateQueries({ queryKey: ['wf-blueprint', bp.id] })
 *     }}
 *   />
 *
 * CSV FORMAT (all columns optional except order + name):
 *   type, order, name, description, side, stepAction, approvalType,
 *   minApprovalsRequired, slaHours, isOptional, isParallel,
 *   autoApproveAssignerOnFill, automatedAction, assignerResolution,
 *   allowOverride, navKey, assignerNavKey, stepUiOverrideJson,
 *   actorRoles, assignerRoles, observerRoles, sections,
 *   section_ui_json, item_ui_json
 *
 * Roles: semicolon-separated role names (resolved to IDs server-side).
 * Sections: § -separated, each pipe-delimited:
 *   sectionKey|label|completionEvent|required|requiresAssignment|tracksItems|sectionScreenKey|itemScreenKey|itemRefType
 *
 * IMPORT BEHAVIOUR:
 *   - Existing steps at the same stepOrder are updated in place (upsert).
 *   - Steps in the DB but NOT in the CSV are deleted (orphan cleanup).
 *   - Role associations are rebuilt if role columns are present.
 *   - Sections are rebuilt if the sections column is present.
 *   - Re-importing the same file is fully idempotent.
 *
 * UX: same 3-stage flow as AuditCsvImportModal (upload → importing → done).
 */

import { useState, useRef, useCallback } from 'react'
import { useQueryClient }                 from '@tanstack/react-query'
import {
  Upload, Download, CheckCircle2, XCircle,
  AlertCircle, Loader2, ChevronRight, ChevronDown,
} from 'lucide-react'
import { workflowsApi } from '../../../api/workflows.api'
import { Modal }         from '../../../components/ui/Modal'
import { Button }        from '../../../components/ui/Button'
import { cn }            from '../../../lib/cn'

// ─── CSV column reference ─────────────────────────────────────────────────────

const COLUMNS = [
  {
    col:   'type',
    color: 'text-text-muted',
    note:  'Row type. STEP (default) or SECTION_OVERRIDE. Omit column to default all rows to STEP.',
  },
  {
    col:   'order',
    color: 'text-status-tag-fg',
    note:  'Step position (1-based). Used to match existing steps for update. Required.',
  },
  {
    col:   'name',
    color: 'text-status-tag-fg',
    note:  'Step display name shown in timeline and task inbox. Required.',
  },
  {
    col:   'description',
    color: 'text-status-info-fg',
    note:  'Optional step description shown in workflow timeline detail.',
  },
  {
    col:   'side',
    color: 'text-status-info-fg',
    note:  'ORGANIZATION · AUDITOR · AUDITEE · VENDOR · SYSTEM. Defaults to ORGANIZATION.',
  },
  {
    col:   'stepAction',
    color: 'text-status-info-fg',
    note:  'FILL · ASSIGN · EVALUATE · REVIEW · APPROVE · ACKNOWLEDGE · GENERATE · CUSTOM',
  },
  {
    col:   'approvalType',
    color: 'text-status-info-fg',
    note:  'ANY_ONE · ALL · MIN_COUNT. Defaults to ANY_ONE.',
  },
  {
    col:   'slaHours',
    color: 'text-brand-ink',
    note:  'SLA in hours (48 = 2 days, 720 = 30 days). Leave blank for no SLA.',
  },
  {
    col:   'isOptional',
    color: 'text-brand-ink',
    note:  'true/false. When true, step advances automatically if no items qualify.',
  },
  {
    col:   'autoApproveAssignerOnFill',
    color: 'text-brand-ink',
    note:  'true/false. Auto-approves assigner task on FILL steps so inbox stays clean.',
  },
  {
    col:   'assignerResolution',
    color: 'text-status-pass-fg',
    note:  'POOL · PREVIOUS_ACTOR · INITIATOR · PUSH_TO_ROLES. Defaults to POOL.',
  },
  {
    col:   'navKey',
    color: 'text-status-pass-fg',
    note:  'Navigation key for actor task (e.g. soc2_engagements, task_inbox).',
  },
  {
    col:   'stepUiOverrideJson',
    color: 'text-status-warn-fg',
    note:  'JSON: {"visibleTabs":["overview"],"editableFields":["name"],"availableActions":["APPROVE"]}',
  },
  {
    col:   'actorRoles',
    color: 'text-status-fail-fg',
    note:  'Semicolon-separated role names resolved to IDs. e.g. GRC_MANAGER;LEAD_AUDITOR',
  },
  {
    col:   'assignerRoles',
    color: 'text-status-fail-fg',
    note:  'Semicolon-separated assigner role names. Only needed for PUSH_TO_ROLES resolution.',
  },
  {
    col:   'observerRoles',
    color: 'text-status-fail-fg',
    note:  'Semicolon-separated observer role names. Observers can view but not act.',
  },
  {
    col:   'sections',
    color: 'text-status-warn-fg',
    note:  '§-separated section definitions (pipe-delimited per section). See note below.',
  },
]

const SECTION_FORMAT_NOTE =
  'sectionKey|label|completionEvent|required|requiresAssignment|tracksItems|sectionScreenKey|itemScreenKey|itemRefType'

const SECTION_ITEM_REF_TYPES = [
  'AUDIT_SECTION_INSTANCE  — section-level assignment tracking (Steps 2 & 3)',
  'AUDIT_CONTROL_INSTANCE  — control-level evidence/evaluation tracking (Steps 4 & 5)',
  'AUDIT_FINDING           — finding remediation tracking (Step 6)',
]

// ─── Unwrap CsvImportResult from axios response shapes ────────────────────────

function unwrapResult(res) {
  if (res == null) return null
  if (typeof res.summary === 'string')                             return res
  if (res.data && typeof res.data.summary === 'string')            return res.data
  if (res.data?.data && typeof res.data.data.summary === 'string') return res.data.data
  return null
}

// ─── Download template from server ────────────────────────────────────────────

async function downloadTemplate() {
  try {
    // Fetch the SOC 2 example CSV from the backend template endpoint
    const res = await fetch('/v1/workflows/import-template', {
      headers: { Accept: 'text/csv' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const blob = new Blob([text], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'workflow_step_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // Fallback: open the URL directly in a new tab
    window.open('/v1/workflows/import-template', '_blank')
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WorkflowBlueprintImportModal({
  open,
  onClose,
  blueprintId,
  blueprintName,
  onImported,
}) {
  const qc      = useQueryClient()
  const fileRef = useRef(null)

  const [stage,        setStage]        = useState('upload')
  const [result,       setResult]       = useState(null)
  const [dragOver,     setDragOver]     = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [refOpen,      setRefOpen]      = useState(false)

  const reset = () => {
    setStage('upload')
    setResult(null)
    setSelectedFile(null)
    setDragOver(false)
  }

  const handleClose = () => {
    if (stage === 'importing') return
    reset()
    onClose()
  }

  const handleFile = (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Please select a .csv file')
      return
    }
    setSelectedFile(file)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }, []) // eslint-disable-line

  const runImport = async () => {
    if (!selectedFile || !blueprintId) return
    setStage('importing')

    try {
      const res  = await workflowsApi.blueprints.importSteps(blueprintId, selectedFile)
      const data = unwrapResult(res)

      if (!data) throw new Error(
        `Unexpected response shape. Raw: ${JSON.stringify(res)?.slice(0, 200)}`
      )

      setResult(data)
      setStage('done')

      // Invalidate the blueprint detail so the steps tab refreshes
      qc.invalidateQueries({ queryKey: ['wf-blueprint', blueprintId] })
      qc.invalidateQueries({ queryKey: ['wf-blueprints'] })

    } catch (err) {
      const serverBody   = err?.response?.data
      const serverResult = unwrapResult(serverBody)

      setResult(serverResult ?? {
        fatalError:   true,
        summary:      serverBody?.summary ?? serverBody?.message ?? err?.message ?? 'Import failed',
        log:          [],
        successCount: 0,
        failureCount: 0,
        totalRows:    0,
      })
      setStage('done')
    }
  }

  const errCount = result?.failureCount ?? 0

  return (
    <Modal
      open={open}
      onClose={stage === 'importing' ? undefined : handleClose}
      title="Import Steps from CSV"
      subtitle={blueprintName ? `Into: ${blueprintName}` : 'Bulk-create or update all steps, roles, and sections'}
      size="xl"
    >

      {/* ── Stage 1: Upload ─────────────────────────────────────────────────── */}
      {stage === 'upload' && (
        <div className="flex flex-col gap-4">

          {/* Warning — destructive behaviour */}
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-card
                          bg-status-warn-bg border border-status-warn-bd text-xs text-status-warn-fg">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>
              Steps at order numbers <strong>not present in the CSV</strong> will be deleted.
              Re-importing the same file is safe — all upserts are idempotent.
            </span>
          </div>

          {/* Column reference — collapsible */}
          <div className="rounded-card border border-border overflow-hidden">
            <button
              onClick={() => setRefOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5
                         bg-surface-overlay text-left hover:bg-surface-secondary transition-colors"
            >
              <span className="text-xs font-semibold text-text-secondary">
                CSV column reference
              </span>
              <div className="flex items-center gap-2">
                <button
                  onMouseDown={(e) => { e.stopPropagation(); downloadTemplate() }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px]
                             text-text-muted hover:text-brand-ink hover:bg-brand-500/10 transition-colors"
                >
                  <Download size={11} /> SOC 2 template
                </button>
                {refOpen
                  ? <ChevronDown  size={13} className="text-text-muted" />
                  : <ChevronRight size={13} className="text-text-muted" />}
              </div>
            </button>

            {refOpen && (
              <div className="divide-y divide-border/50">
                {COLUMNS.map(({ col, color, note }) => (
                  <div key={col} className="px-4 py-2 flex items-start gap-3">
                    <span className={cn(
                      'font-mono text-[10px] font-bold shrink-0 mt-0.5 px-1.5 py-0.5 rounded',
                      'bg-surface-overlay border border-border/60', color
                    )}>
                      {col}
                    </span>
                    <p className="text-[11px] text-text-secondary leading-relaxed">{note}</p>
                  </div>
                ))}

                {/* Sections format note */}
                <div className="px-4 py-3 bg-surface-overlay/40 flex flex-col gap-1.5">
                  <p className="text-[10px] font-semibold text-text-secondary">
                    sections column — pipe format per section (§ separates multiple):
                  </p>
                  <code className="text-[10px] text-brand-ink font-mono break-all leading-relaxed">
                    {SECTION_FORMAT_NOTE}
                  </code>
                  <div className="flex flex-col gap-0.5 mt-1">
                    <p className="text-[10px] font-semibold text-text-muted">itemRefType values:</p>
                    {SECTION_ITEM_REF_TYPES.map(t => (
                      <p key={t} className="text-[10px] text-text-muted font-mono">{t}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Drag-and-drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-card p-8 flex flex-col items-center gap-3',
              'cursor-pointer transition-colors',
              selectedFile
                ? 'border-status-pass-bd bg-status-pass-bg'
                : dragOver
                  ? 'border-brand-500 bg-brand-500/5'
                  : 'border-border hover:border-border-subtle hover:bg-surface-overlay',
            )}
          >
            <div className="w-12 h-12 rounded-card bg-surface-overlay flex items-center justify-center">
              {selectedFile
                ? <CheckCircle2 size={22} className="text-status-pass-fg" />
                : <Upload size={22} className="text-text-muted" />}
            </div>
            <div className="text-center">
              {selectedFile ? (
                <>
                  <p className="text-sm font-medium text-status-pass-fg">{selectedFile.name}</p>
                  <p className="text-xs text-text-muted mt-1">
                    {(selectedFile.size / 1024).toFixed(1)} KB · Click to choose a different file
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-text-primary">
                    Drop your CSV here, or click to browse
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    .csv only — STEP and SECTION_OVERRIDE rows supported
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => { handleFile(e.target.files[0]); e.target.value = '' }}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
            <Button size="sm" icon={Upload} disabled={!selectedFile} onClick={runImport}>
              Upload & Import
            </Button>
          </div>
        </div>
      )}

      {/* ── Stage 2: Importing ───────────────────────────────────────────────── */}
      {stage === 'importing' && (
        <div className="flex flex-col items-center gap-6 py-10">
          <div className="w-16 h-16 rounded-modal bg-brand-500/10 flex items-center justify-center">
            <Loader2 size={28} className="text-brand-ink animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-text-primary">Importing on server…</p>
            <p className="text-xs text-text-muted mt-1">
              Creating steps, resolving role names, persisting section configs.
            </p>
            <p className="text-xs text-text-muted mt-1">
              A 9-step SOC 2 blueprint with sections takes 2–5 seconds.
            </p>
          </div>
          <p className="text-xs text-text-muted">Please don't close this window</p>
        </div>
      )}

      {/* ── Stage 3: Done ────────────────────────────────────────────────────── */}
      {stage === 'done' && result && (
        <div className="flex flex-col gap-4">

          {/* Summary header */}
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-12 h-12 rounded-card flex items-center justify-center shrink-0',
              result.fatalError ? 'bg-status-fail-bg'
              : errCount > 0   ? 'bg-status-warn-bg'
              :                   'bg-status-pass-bg',
            )}>
              {result.fatalError || errCount > 0
                ? <AlertCircle size={22} className={result.fatalError ? 'text-status-fail-fg' : 'text-status-warn-fg'} />
                : <CheckCircle2 size={22} className="text-status-pass-fg" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {result.fatalError
                  ? 'Import failed'
                  : errCount > 0
                    ? `Import completed with ${errCount} issue${errCount !== 1 ? 's' : ''}`
                    : 'Import successful'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{result.summary}</p>
            </div>
          </div>

          {/* Stats */}
          {!result.fatalError && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total rows', value: result.totalRows,   color: 'text-text-secondary' },
                { label: 'Succeeded', value: result.successCount, color: 'text-status-pass-fg' },
                { label: 'Failed',    value: result.failureCount,
                  color: result.failureCount ? 'text-status-fail-fg' : 'text-text-muted' },
              ].map(({ label, value, color }) => (
                <div key={label}
                  className="p-3 bg-surface-overlay rounded-card border border-border text-center">
                  <p className={cn('text-xl font-bold font-mono', color)}>{value ?? 0}</p>
                  <p className="text-xs text-text-muted mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Import log */}
          {result.log?.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-card border border-border
                            bg-surface-overlay p-3 flex flex-col gap-0.5 font-mono text-xs">
              {result.log.map((entry, i) => (
                <div key={i} className={cn(
                  'flex items-start gap-2',
                  entry.status === 'SUCCESS' && 'text-text-secondary',
                  entry.status === 'ERROR'   && 'text-status-fail-fg',
                  entry.status === 'WARNING' && 'text-status-warn-fg',
                  entry.status === 'INFO'    && 'text-brand-ink',
                )}>
                  {entry.status === 'SUCCESS' && <CheckCircle2 size={11} className="mt-0.5 shrink-0" />}
                  {entry.status === 'ERROR'   && <XCircle      size={11} className="mt-0.5 shrink-0" />}
                  {entry.status === 'WARNING' && <AlertCircle  size={11} className="mt-0.5 shrink-0" />}
                  {entry.status === 'INFO'    && <span className="shrink-0 mt-0.5">›</span>}
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={reset}>Import Another</Button>
            {!result.fatalError ? (
              <Button size="sm" icon={ChevronRight} onClick={() => onImported?.()}>
                View steps
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={handleClose}>Close</Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}