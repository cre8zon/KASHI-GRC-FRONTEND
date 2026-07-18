/**
 * AuditCsvImportModal.jsx
 *
 * Unified bulk import modal for the complete audit library:
 *   TEMPLATE, SECTION, CONTROL, TEST, POLICY,
 *   CONTROL_TEST_MAPPING, POLICY_CONTROL_MAPPING
 *
 * All 7 row types go in one CSV and are handled by one endpoint:
 *   POST /v1/audit/library/templates/import
 *   → AuditCsvImportService (extended version)
 *
 * IMPORT ORDER within the CSV matters (foreign keys must exist before mappings):
 *   1. TEMPLATE row
 *   2. SECTION rows  (level= drives tree depth)
 *   3. CONTROL rows  (attach to deepest current section)
 *   4. TEST rows
 *   5. CONTROL_TEST_MAPPING rows
 *   6. POLICY rows
 *   7. POLICY_CONTROL_MAPPING rows
 *
 * The soc2_library_import.csv file from this session follows this order exactly.
 *
 * UX: 3-stage flow — upload → importing → done (same as AssessmentTemplatesPage)
 */

import { useState, useRef, useCallback } from 'react'
import { useQueryClient }                  from '@tanstack/react-query'
import {
  Upload, Download, CheckCircle2, XCircle,
  AlertCircle, Loader2, ChevronRight, ChevronDown,
} from 'lucide-react'
import { auditApi } from '../../../api/audit.api'
import { Modal }    from '../../../components/ui/Modal'
import { Button }   from '../../../components/ui/Button'
import { cn }       from '../../../lib/cn'

// ─── Example CSV — minimal working example covering all 7 row types ───────────

// Column order (index): type(0), level(1), name(2), description(3), framework_ref(4),
// audit_type(5), section_code(6), control_code(7), test_type(8), control_tag(9),
// weight(10), is_mandatory(11), order_no(12), test_ref(13), automation_type(14),
// frequency(15), test_procedure(16), evidence_guidance(17), automation_key(18),
// policy_ref(19), content_type(20), review_frequency_months(21), owner_team(22),
// framework_refs(23), control_tags(24), is_required(25), mapping_note(26)
const EXAMPLE_CSV =
`type,level,name,description,framework_ref,audit_type,section_code,control_code,test_type,control_tag,weight,is_mandatory,order_no,test_ref,automation_type,frequency,test_procedure,evidence_guidance,automation_key,policy_ref,content_type,review_frequency_months,owner_team,framework_refs,control_tags,is_required,mapping_note
TEMPLATE,,SOC 2 Type II,SOC 2 Type II Trust Services Criteria,SOC2,EXTERNAL,,,,,,,,,,,,,,,,,,,,
SECTION,0,Common Criteria,Security-related controls,SOC2,,CC,,,,,,,,,,,,,,,,,,,
SECTION,1,Logical and Physical Access Controls,,SOC2,,CC6,,,,,,,,,,,,,,,,,,,
SECTION,2,CC6.1 — Logical Access Security,,SOC2,,CC6.1,,,,,,,,,,,,,,,,,,,
CONTROL,,Logical access requires MFA for all users,,SOC2,,CC6.1,CC6.1-C1,TECHNICAL_TEST,MFA,1.0,true,,,,,,,,,,,,,,
CONTROL,,Privileged access reviewed quarterly,,SOC2,,CC6.1,CC6.1-C2,DOCUMENT_REVIEW,ACCESS_REVIEW,1.0,true,,,,,,,,,,,,,,
TEST,,MFA enforced on all production system logins,Verify MFA is enabled for all users accessing production,SOC2,,,,,,,,SOC2-T001,AUTOMATED,CONTINUOUS,Verify MFA enforcement via IdP admin panel,Upload IdP MFA enforcement screenshot,kashiguard.mfa_enforced,,,,,MFA,
TEST,,Quarterly access review completed and documented,Verify quarterly access reviews are performed,SOC2,,,,,,,,SOC2-T002,MANUAL,QUARTERLY,Pull user access report. Compare against active employees.,Upload signed access review spreadsheet,,,,,,ACCESS_REVIEW,
CONTROL_TEST_MAPPING,,,,,,,CC6.1-C1,,,,,SOC2-T001,,,,,,,,,,,,true,MFA test for CC6.1-C1
CONTROL_TEST_MAPPING,,,,,,,CC6.1-C2,,,,,SOC2-T002,,,,,,,,,,,,true,Access review for CC6.1-C2
POLICY,,Access Control Policy,Governs user access provisioning and review,,,,,,,,,,,,,,,,POL-SOC2-001,RICH_TEXT,12,IT Security,SOC2,ACCESS_REVIEW MFA,,
POLICY_CONTROL_MAPPING,,,,,,,CC6.1-C1,,,,,,,,,,,,,POL-SOC2-001,,,,,
POLICY_CONTROL_MAPPING,,,,,,,CC6.1-C2,,,,,,,,,,,,,POL-SOC2-001,,,,,
`

function downloadExample() {
  const blob = new Blob([EXAMPLE_CSV], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = 'audit_library_import_example.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Unwrap CsvImportResult from all axios shapes ─────────────────────────────

function unwrapResult(res) {
  if (res == null) return null
  if (typeof res.summary === 'string')                        return res        // Shape A
  if (res.data && typeof res.data.summary === 'string')       return res.data   // Shape B
  if (res.data?.data && typeof res.data.data.summary === 'string') return res.data.data // Shape C
  return null
}

// ─── Row type reference table ─────────────────────────────────────────────────

const ROW_TYPES = [
  {
    type:  'TEMPLATE',
    color: 'text-status-tag-fg',
    note:  'First row — sets template name, framework_ref, audit_type. Resets section stack.',
    cols:  'name · description · framework_ref · audit_type',
  },
  {
    type:  'SECTION',
    color: 'text-status-info-fg',
    note:  'level= drives tree depth (0=root category, 1=sub-group, 2=criterion). section_code for SOC 2 e.g. CC6.1',
    cols:  'level · name · section_code · framework_ref · description',
  },
  {
    type:  'CONTROL',
    color: 'text-status-info-fg',
    note:  'Attached to the deepest current section. control_code must be unique per tenant.',
    cols:  'name · control_code · test_type · control_tag · weight · is_mandatory',
  },
  {
    type:  'TEST',
    color: 'text-status-pass-fg',
    note:  'Audit test in the library. test_ref auto-generated if blank.',
    cols:  'name · test_ref · automation_type · frequency · control_tag · test_procedure · evidence_guidance',
  },
  {
    type:  'CONTROL_TEST_MAPPING',
    color: 'text-status-warn-fg',
    note:  'Links a control to a test. Both must exist in the CSV before this row.',
    cols:  'control_code · test_ref · is_required · mapping_note',
  },
  {
    type:  'POLICY',
    color: 'text-status-fail-fg',
    note:  'Policy in the library (status=DRAFT). policy_ref auto-generated if blank.',
    cols:  'name (=title) · policy_ref · content_type · review_frequency_months · owner_team · control_tags · framework_refs',
  },
  {
    type:  'POLICY_CONTROL_MAPPING',
    color: 'text-status-warn-fg',
    note:  'Links a policy to a control. Both must exist before this row.',
    cols:  'policy_ref · control_code · mapping_note',
  },
]

// ─── Main component ───────────────────────────────────────────────────────────

export function AuditCsvImportModal({ open, onClose, onImported }) {
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
    if (!selectedFile) return
    setStage('importing')

    try {
      const res  = await auditApi.library.templates.importLibraryCsv(selectedFile)
      const data = unwrapResult(res)

      if (!data) throw new Error(
        `Unexpected response shape from server. Raw: ${JSON.stringify(res)?.slice(0, 200)}`
      )

      setResult(data)
      setStage('done')

      // Invalidate all audit library caches
      qc.invalidateQueries({ queryKey: ['audit-library-templates'] })
      qc.invalidateQueries({ queryKey: ['audit-library-sections'] })
      qc.invalidateQueries({ queryKey: ['audit-library-controls'] })
      qc.invalidateQueries({ queryKey: ['module-list', '/v1/audit/library/tests'] })
      qc.invalidateQueries({ queryKey: ['module-list', '/v1/audit/library/policies'] })
      qc.invalidateQueries({ queryKey: ['module-list'] })

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
      title="Import Audit Library from CSV"
      subtitle="Template · Sections · Controls · Tests · Policies · Mappings — all in one file"
      size="xl"
    >

      {/* ── Stage 1: Upload ─────────────────────────────────────────────────── */}
      {stage === 'upload' && (
        <div className="flex flex-col gap-4">

          {/* Row type reference — collapsible */}
          <div className="rounded-card border border-border overflow-hidden">
            <button
              onClick={() => setRefOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5
                         bg-surface-overlay text-left hover:bg-surface-secondary transition-colors"
            >
              <span className="text-xs font-semibold text-text-secondary">
                CSV row types reference
              </span>
              <div className="flex items-center gap-2">
                <button
                  onMouseDown={(e) => { e.stopPropagation(); downloadExample() }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px]
                             text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
                >
                  <Download size={11} /> Example CSV
                </button>
                {refOpen
                  ? <ChevronDown size={13} className="text-text-muted" />
                  : <ChevronRight size={13} className="text-text-muted" />}
              </div>
            </button>

            {refOpen && (
              <div className="divide-y divide-border/50">
                {ROW_TYPES.map(({ type, color, note, cols }) => (
                  <div key={type} className="px-4 py-2.5 flex items-start gap-3">
                    <span className={cn(
                      'font-mono text-[10px] font-bold shrink-0 mt-0.5 px-1.5 py-0.5 rounded',
                      'bg-surface-overlay border border-border/60', color
                    )}>
                      {type}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-text-secondary leading-relaxed">{note}</p>
                      <p className="text-[10px] text-text-muted font-mono mt-0.5 truncate">{cols}</p>
                    </div>
                  </div>
                ))}

                {/* Import order hint */}
                <div className="px-4 py-2.5 bg-brand-500/3">
                  <p className="text-[10px] text-brand-400 font-medium">
                    Import order: TEMPLATE → SECTION → CONTROL → TEST →
                    CONTROL_TEST_MAPPING → POLICY → POLICY_CONTROL_MAPPING
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Mappings must come after the rows they reference.
                    Re-importing the same file is safe — all upserts are idempotent.
                  </p>
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
                    .csv files only — all 7 row types supported
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
            <Loader2 size={28} className="text-brand-400 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-text-primary">Importing on server…</p>
            <p className="text-xs text-text-muted mt-1">
              Building template tree — sections, controls, tests, policies, mappings.
            </p>
            <p className="text-xs text-text-muted mt-1">
              A full SOC 2 library (~150 rows) takes around 10–20 seconds.
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
                ? <AlertCircle size={22} className={result.fatalError
                    ? 'text-status-fail-fg' : 'text-status-warn-fg'} />
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

          {/* Stats grid */}
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
                  entry.status === 'INFO'    && 'text-brand-400',
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
            {result.createdEntityId && !result.fatalError ? (
              <Button size="sm" icon={ChevronRight}
                onClick={() => onImported?.(result.createdEntityId)}>
                Open Template
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