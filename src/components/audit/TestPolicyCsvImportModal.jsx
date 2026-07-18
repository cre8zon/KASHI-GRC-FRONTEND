/**
 * TestPolicyCsvImportModal.jsx
 *
 * Bulk CSV import for Audit Tests and Policies — same 3-stage UX as
 * AuditCsvImportModal (upload → importing → done).
 *
 * Endpoint: POST /v1/audit/library/tests-policies/import
 *
 * CSV FORMAT:
 *   type         — TEST or POLICY (required — distinguishes which table to insert into)
 *
 *   For TEST rows:
 *     name           — test name (required)
 *     ref            — test ref (optional; auto-generated as AT-NNN if blank)
 *     automation_type — MANUAL | AUTOMATED | HYBRID (default: MANUAL)
 *     frequency      — CONTINUOUS | DAILY | WEEKLY | MONTHLY | QUARTERLY |
 *                      SEMI_ANNUAL | ANNUAL (default: ANNUAL)
 *     control_tag    — e.g. ACCESS_MGMT,MFA (optional)
 *     framework_ref  — e.g. ISO 27001 A.9.2 (optional)
 *     test_procedure — (optional)
 *     evidence_guidance — (optional)
 *     description    — (optional)
 *
 *   For POLICY rows:
 *     title          — policy title (required)
 *     ref            — policy ref (optional; auto-generated as POL-NNN if blank)
 *     content_type   — RICH_TEXT | PDF_UPLOAD | EXTERNAL_URL (default: RICH_TEXT)
 *     control_tag    — (optional)
 *     framework_refs — (optional)
 *     description    — (optional)
 *
 * USAGE:
 *   In UniversalModulePage, when the action has payloadTemplateJson: {"__openImport": true}
 *   the page renders this modal. Wire it to AUDIT_TEST and AUDIT_POLICY blueprints.
 *
 *   Or standalone:
 *     <TestPolicyCsvImportModal open={show} onClose={() => setShow(false)} onImported={() => qc.invalidateQueries()} />
 */

import { useState, useRef, useCallback } from 'react'
import { useQueryClient }                 from '@tanstack/react-query'
import {
  Upload, Download, CheckCircle2, XCircle,
  AlertCircle, Loader2, ChevronRight,
} from 'lucide-react'
import { cn }    from '../../lib/cn'
import api       from '../../config/axios.config'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

// ─── Unwrap the CsvImportResult from all possible axios/interceptor shapes ────
function unwrapResult(res) {
  if (res == null) return null
  // Shape A: interceptor already unwrapped → res IS CsvImportResult
  if (typeof res.totalRows === 'number') return res
  // Shape B: res.data = CsvImportResult
  if (res.data && typeof res.data.totalRows === 'number') return res.data
  // Shape C: res.data.data = CsvImportResult (double-wrap)
  if (res.data?.data && typeof res.data.data.totalRows === 'number') return res.data.data
  return null
}

// ─── Example CSV content ──────────────────────────────────────────────────────
const EXAMPLE_CSV = `type,name,ref,automation_type,frequency,control_tag,framework_ref,test_procedure,evidence_guidance,description
TEST,Quarterly Access Review,AT-001,MANUAL,QUARTERLY,ACCESS_MGMT,ISO 27001 A.9.2,"1. Obtain list of users. 2. Verify access is required.","Upload signed access review matrix","Verifies user access is reviewed quarterly"
TEST,MFA Enforcement on Admin Accounts,AT-002,AUTOMATED,CONTINUOUS,MFA,ISO 27001 A.9.4,"Query IAM for admin accounts with MFA disabled","Export from IAM showing MFA status","Automated check via KashiGuard IAM connector"
POLICY,Access Control Policy,POL-001,RICH_TEXT,ACCESS_MGMT,"ISO 27001,SOC 2","","Defines access control requirements for all systems"
POLICY,Information Security Policy,POL-002,RICH_TEXT,INFORMATION_SECURITY,"ISO 27001 A.5","","Top-level information security policy"
`

// ─── Main component ───────────────────────────────────────────────────────────

export function TestPolicyCsvImportModal({ open, onClose, onImported }) {
  const qc      = useQueryClient()
  const fileRef = useRef(null)

  const [stage, setStage]               = useState('upload')   // 'upload' | 'importing' | 'done'
  const [result, setResult]             = useState(null)
  const [dragOver, setDragOver]         = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

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
  }, [])

  const runImport = async () => {
    if (!selectedFile) return
    setStage('importing')

    try {
      const form = new FormData()
      form.append('file', selectedFile)
      const res  = await api.post('/v1/audit/library/templates/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 5 * 60_000,
      })
      const data = unwrapResult(res)

      if (!data) {
        throw new Error(`Unexpected response: ${JSON.stringify(res)?.slice(0, 200)}`)
      }

      setResult(data)
      setStage('done')

      if ((data.importedRows ?? data.successCount ?? 0) > 0) {
        qc.invalidateQueries({ queryKey: ['module-list'] })
        qc.invalidateQueries({ queryKey: ['module-list', '/v1/audit/library/tests'] })
        qc.invalidateQueries({ queryKey: ['module-list', '/v1/audit/library/policies'] })
      }
    } catch (err) {
      const fatalResult = {
        totalRows: 0, importedRows: 0, skippedRows: 0, errorRows: 1,
        log: [{ rowNumber: 0, status: 'ERROR',
                message: err?.response?.data?.error?.message || err.message || 'Upload failed' }],
        fatalError: true,
      }
      setResult(fatalResult)
      setStage('done')
    }
  }

  const downloadExample = () => {
    const blob = new Blob([EXAMPLE_CSV], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = 'audit_tests_policies_example.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import Tests & Policies"
      subtitle="Bulk import audit tests and policies from a CSV file"
      size="lg"
    >
      {/* ── Stage: upload ── */}
      {stage === 'upload' && (
        <div className="space-y-4">
          {/* Format reference */}
          <div className="p-3 rounded-card bg-surface-overlay border border-border text-xs text-text-secondary space-y-1.5">
            <p className="font-semibold text-text-primary">CSV format</p>
            <p>First column <code className="font-mono bg-brand-500/10 text-brand-400 px-1 rounded">type</code> must be <code className="font-mono">TEST</code> or <code className="font-mono">POLICY</code> — this tells the importer which table to write to.</p>
            <p>TEST rows use: <code className="font-mono">name, ref, automation_type, frequency, control_tag, framework_ref, test_procedure, evidence_guidance</code></p>
            <p>POLICY rows use: <code className="font-mono">title, ref, content_type, control_tag, framework_refs</code></p>
            <p className="text-text-muted">Ref is optional — auto-generated as AT-NNN / POL-NNN if blank. Re-importing the same file is safe (upserts).</p>
          </div>

          {/* Download example */}
          <button
            onClick={downloadExample}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-card border border-border hover:border-brand-500/40 hover:text-brand-400 text-text-muted text-sm transition-colors"
          >
            <Download size={15} />
            Download example CSV (2 tests + 2 policies)
          </button>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center gap-3 py-10 rounded-card border-2 border-dashed cursor-pointer transition-colors',
              dragOver
                ? 'border-brand-500 bg-brand-500/5'
                : selectedFile
                  ? 'border-status-pass-bd bg-status-pass-bg'
                  : 'border-border hover:border-brand-500/40 hover:bg-brand-500/3'
            )}
          >
            <Upload size={24} className={selectedFile ? 'text-status-pass-fg' : 'text-text-muted'} />
            {selectedFile ? (
              <div className="text-center">
                <p className="text-sm font-medium text-text-primary">{selectedFile.name}</p>
                <p className="text-xs text-text-muted mt-0.5">{(selectedFile.size / 1024).toFixed(1)} KB — click to change</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-medium text-text-primary">Drop CSV here or click to browse</p>
                <p className="text-xs text-text-muted mt-0.5">Supports .csv files only</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => handleFile(e.target.files[0])} />
          </div>

          {/* Import button */}
          <Button
            className="w-full"
            disabled={!selectedFile}
            icon={ChevronRight}
            onClick={runImport}
          >
            Import now
          </Button>
        </div>
      )}

      {/* ── Stage: importing ── */}
      {stage === 'importing' && (
        <div className="py-12 flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-brand-400" />
          <div className="text-center">
            <p className="text-sm font-medium text-text-primary">Importing {selectedFile?.name}…</p>
            <p className="text-xs text-text-muted mt-1">Please don't close this window</p>
          </div>
        </div>
      )}

      {/* ── Stage: done ── */}
      {stage === 'done' && result && (
        <div className="space-y-4">
          {/* Summary header */}
          <div className={cn(
            'flex items-center gap-3 p-4 rounded-card border',
            result.fatalError
              ? 'bg-status-fail-bg border-status-fail-bd'
              : result.errorRows > 0
                ? 'bg-status-warn-bg border-status-warn-bd'
                : 'bg-status-pass-bg border-status-pass-bd'
          )}>
            {result.fatalError
              ? <XCircle size={20} className="text-status-fail-fg shrink-0" />
              : result.errorRows > 0
                ? <AlertCircle size={20} className="text-status-warn-fg shrink-0" />
                : <CheckCircle2 size={20} className="text-status-pass-fg shrink-0" />
            }
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {result.fatalError
                  ? 'Import failed'
                  : result.importedRows > 0
                    ? `${result.importedRows} row${result.importedRows !== 1 ? 's' : ''} imported successfully`
                    : 'No rows imported'}
              </p>
              {!result.fatalError && (
                <p className="text-xs text-text-muted mt-0.5">
                  {result.totalRows} total · {result.importedRows} imported · {result.skippedRows} skipped · {result.errorRows} errors
                </p>
              )}
            </div>
          </div>

          {/* Stats grid */}
          {!result.fatalError && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Imported', value: result.importedRows, color: 'text-status-pass-fg bg-status-pass-bg border-status-pass-bd' },
                { label: 'Skipped',  value: result.skippedRows,  color: 'text-text-muted bg-surface-overlay border-border' },
                { label: 'Errors',   value: result.errorRows,    color: result.errorRows > 0 ? 'text-status-fail-fg bg-status-fail-bg border-status-fail-bd' : 'text-text-muted bg-surface-overlay border-border' },
              ].map(s => (
                <div key={s.label} className={cn('flex flex-col items-center py-3 rounded-card border text-center', s.color)}>
                  <span className="text-2xl font-bold">{s.value}</span>
                  <span className="text-[10px] uppercase tracking-wide mt-0.5 opacity-70">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Import log */}
          {result.log?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Import log</p>
              <div className="max-h-48 overflow-y-auto rounded-card border border-border divide-y divide-border/50">
                {result.log.map((entry, i) => (
                  <div key={i} className={cn(
                    'flex items-start gap-2 px-3 py-2 text-xs',
                    entry.status === 'ERROR'   && 'bg-status-fail-bg',
                    entry.status === 'SKIPPED' && 'bg-status-warn-bg',
                  )}>
                    <span className={cn(
                      'font-mono shrink-0 mt-0.5 text-[10px] px-1 py-0.5 rounded border',
                      entry.status === 'ERROR'   ? 'text-status-fail-fg bg-status-fail-bg border-status-fail-bd' :
                      entry.status === 'SKIPPED' ? 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd' :
                                                   'text-status-pass-fg bg-status-pass-bg border-status-pass-bd'
                    )}>{entry.status}</span>
                    {entry.rowNumber > 0 && (
                      <span className="text-text-muted shrink-0">Row {entry.rowNumber}:</span>
                    )}
                    <span className="text-text-secondary">{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => { reset() }}>
              Import another file
            </Button>
            <Button size="sm" className="flex-1" onClick={() => {
              if (onImported) onImported()
              handleClose()
            }}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}