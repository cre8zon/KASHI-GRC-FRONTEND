import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, RefreshCw, Search, ChevronRight, ChevronDown,
  LayoutTemplate, BookOpen, CheckCircle2, XCircle,
  Send, AlertCircle, Loader2, ArrowLeft, Weight,
  Upload, Download, Pencil, Trash2
} from 'lucide-react'
import { assessmentsApi } from '../../../api/assessments.api'
import { PageLayout } from '../../../components/layout/PageLayout'
import { DataTable } from '../../../components/ui/DataTable'
import { Button } from '../../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Badge } from '../../../components/ui/Badge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { cn } from '../../../lib/cn'
import { formatDate } from '../../../utils/format'
import toast from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_COLOR = { DRAFT: 'amber', PUBLISHED: 'green' }
const TYPE_COLOR   = { SINGLE_CHOICE: 'blue', MULTI_CHOICE: 'purple', TEXT: 'cyan', FILE_UPLOAD: 'amber' }
const TYPE_LABEL   = { SINGLE_CHOICE: 'Single', MULTI_CHOICE: 'Multi', TEXT: 'Text', FILE_UPLOAD: 'File' }

const CSV_FORMAT_EXAMPLE = `type,name_or_text,response_type,weight,is_mandatory,option_value,score,question_tag
TEMPLATE,Assessment Type - I,,,,,
SECTION,Information Security Governance,,,,,
QUESTION,Do you have a SOC 2 Type II report?,SINGLE_CHOICE,15,true,,,CERTIFICATION
OPTION,,,,,Yes — Fully implemented,10,
OPTION,,,,,Partially implemented,5,
OPTION,,,,,No — Not started,0,
QUESTION,Describe your incident response process.,TEXT,5,false,,,IRP
SECTION,Access Control,,,,,
QUESTION,Is MFA enforced for all users?,SINGLE_CHOICE,10,true,,,MFA
OPTION,,,,,Yes — all users,10,
OPTION,,,,,Yes — some users,5,
OPTION,,,,,No,0,`

function downloadCsvTemplate() {
  const blob = new Blob([CSV_FORMAT_EXAMPLE], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url
  a.download = 'assessment_template_import.csv'; a.click()
  URL.revokeObjectURL(url)
}

const TEMPLATE_COLUMNS = [
  { key: 'templateId', label: 'ID',      sortable: true,  width: 60,  type: 'mono' },
  { key: 'name',       label: 'Name',    sortable: true,  width: 260 },
  { key: 'version',    label: 'Ver',     sortable: false, width: 50,  type: 'mono' },
  { key: 'status',     label: 'Status',  sortable: true,  width: 110, type: 'custom' },
  { key: 'createdAt',  label: 'Created', sortable: true,  width: 120, type: 'date' },
  { key: '__actions',  label: '',        width: 140,       type: 'custom' },
]

// ─── Hooks ────────────────────────────────────────────────────────────────────
const useTemplates = (params) => useQuery({
  queryKey: ['assessment-templates', params],
  queryFn:  () => assessmentsApi.templates.list(params),
  keepPreviousData: true,
})
const useFullTemplate = (id) => useQuery({
  queryKey: ['assessment-template-full', id],
  queryFn:  () => assessmentsApi.templates.full(id),
  enabled:  !!id,
})
const useLibraryQuestions = () => useQuery({
  queryKey: ['library-questions-all'],
  queryFn:  () => assessmentsApi.library.questions.list({ skip: 0, take: 500 }),
})
const useLibrarySections = () => useQuery({
  queryKey: ['library-sections-all'],
  queryFn:  () => assessmentsApi.library.sections.list({ skip: 0, take: 500 }),
})

function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: assessmentsApi.templates.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-templates'] }),
    onError:   () => toast.error('Failed to create template'),
  })
}
function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => assessmentsApi.templates.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assessment-templates'] }); toast.success('Template updated') },
    onError:   () => toast.error('Failed to update template'),
  })
}
function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => assessmentsApi.templates.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assessment-templates'] }); toast.success('Template deleted') },
    onError:   (err) => toast.error(err?.message || 'Failed to delete template'),
  })
}
function usePublishTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => assessmentsApi.templates.publish(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessment-templates'] })
      qc.invalidateQueries({ queryKey: ['assessment-template-full'] })
      toast.success('Template published')
    },
    onError: (err) => toast.error(err?.message || 'Failed to publish'),
  })
}
function useUnpublishTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => assessmentsApi.templates.unpublish(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessment-templates'] })
      qc.invalidateQueries({ queryKey: ['assessment-template-full'] })
      toast.success('Template unpublished — now DRAFT')
    },
    onError: (err) => toast.error(err?.message || 'Failed to unpublish'),
  })
}
function useMapSection(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, orderNo }) => assessmentsApi.templates.sections.map(templateId, sectionId, orderNo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-template-full', templateId] }),
    onError:   () => toast.error('Failed to add section'),
  })
}
function useUnmapSection(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sectionId) => assessmentsApi.templates.sections.unmap(templateId, sectionId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assessment-template-full', templateId] }); toast.success('Section removed') },
    onError:   () => toast.error('Failed to remove section'),
  })
}
function useMapQuestion(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, questionId, data }) => assessmentsApi.sections.mapQuestion(sectionId, questionId, data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['assessment-template-full', templateId] }),
    onError:    () => toast.error('Failed to add question'),
  })
}
function useUpdateQuestionMapping(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, questionId, data }) => assessmentsApi.sections.updateQuestion(sectionId, questionId, data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['assessment-template-full', templateId] }); toast.success('Question updated') },
    onError:    () => toast.error('Failed to update question'),
  })
}
function useUnmapQuestion(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, questionId }) => assessmentsApi.sections.unmapQuestion(sectionId, questionId),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['assessment-template-full', templateId] }); toast.success('Question removed') },
    onError:    () => toast.error('Failed to remove question'),
  })
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AssessmentTemplatesPage() {
  const [page, setPage]                     = useState(1)
  const [search, setSearch]                 = useState('')
  const [activeTemplate, setActiveTemplate] = useState(null)
  const [showCreate, setShowCreate]         = useState(false)
  const [showImport, setShowImport]         = useState(false)
  const [editTarget, setEditTarget]         = useState(null)
  const [deleteTarget, setDeleteTarget]     = useState(null)

  const { data, isLoading, refetch } = useTemplates({
    skip: (page - 1) * 20, take: 20,
    ...(search ? { search: `name=${search}` } : {}),
  })
  const { mutate: deleteTemplate, isPending: deleting } = useDeleteTemplate()
  const { mutate: unpublish, isPending: unpublishing }  = useUnpublishTemplate()

  const columns = TEMPLATE_COLUMNS.map(col => {
    if (col.key === 'status') return { ...col, render: (row) =>
      <Badge value={row.status} label={row.status} colorTag={STATUS_COLOR[row.status] || 'gray'} />
    }
    if (col.key === '__actions') return { ...col, render: (row) => (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <Button variant="ghost" size="xs" icon={ChevronRight}
          onClick={() => setActiveTemplate(row.templateId)}>Build</Button>
        {/* Edit — DRAFT always, PUBLISHED only for Platform Admin (handled by backend) */}
        <button onClick={() => setEditTarget(row)} title="Rename"
          className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
          <Pencil size={12} />
        </button>
        {/* Unpublish — only visible for PUBLISHED */}
        {row.status === 'PUBLISHED' && (
          <button onClick={() => unpublish(row.templateId)} title="Unpublish (revert to DRAFT)"
            disabled={unpublishing}
            className="h-6 w-6 flex items-center justify-center rounded text-amber-400 hover:bg-amber-500/10 transition-colors">
            <ArrowLeft size={12} />
          </button>
        )}
        <button onClick={() => setDeleteTarget(row)} title="Delete"
          className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <Trash2 size={12} />
        </button>
      </div>
    )}
    return col
  })

  if (activeTemplate) {
    return <TemplateBuilder templateId={activeTemplate} onBack={() => setActiveTemplate(null)} />
  }

  return (
    <PageLayout
      title="Assessment Templates"
      subtitle={data?.pagination ? `${data.pagination.totalItems} templates` : undefined}
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search templates…"
              className="h-8 pl-8 pr-3 w-52 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button variant="secondary" size="sm" icon={Upload} onClick={() => setShowImport(true)}>Import CSV</Button>
          <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>New Template</Button>
        </div>
      }
    >
      <DataTable columns={columns} data={data?.items || []} pagination={data?.pagination}
        onPageChange={setPage} loading={isLoading}
        onRowClick={(row) => setActiveTemplate(row.templateId)}
        emptyMessage="No templates yet." />

      <CreateTemplateModal open={showCreate} onClose={() => setShowCreate(false)}
        onCreated={(id) => { setShowCreate(false); setActiveTemplate(id) }} />

      {/* SERVER-SIDE CSV IMPORT — no parsing in browser */}
      <CsvImportModal open={showImport} onClose={() => setShowImport(false)}
        onImported={(id) => { setShowImport(false); setActiveTemplate(id) }} />

      <RenameTemplateModal template={editTarget} onClose={() => setEditTarget(null)} />

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTemplate(deleteTarget?.templateId, { onSuccess: () => setDeleteTarget(null) })}
        loading={deleting} title="Delete Template" variant="danger" confirmLabel="Delete"
        message={`Delete "${deleteTarget?.name}"? All section mappings will be removed. Library sections, questions, and options are NOT deleted.`}
      />
    </PageLayout>
  )
}

// ─── CSV Import Modal (server-side) ───────────────────────────────────────────
/**
 * The frontend does NOT parse the CSV.
 * It simply uploads the File to POST /v1/assessment-templates/import
 * and displays the structured log returned by the backend (OpenCSV).
 */
function CsvImportModal({ open, onClose, onImported }) {
  const qc      = useQueryClient()
  const fileRef = useRef(null)
  const [stage, setStage]     = useState('upload')   // upload | importing | done
  const [result, setResult]   = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

  const reset = () => { setStage('upload'); setResult(null); setSelectedFile(null) }
  const handleClose = () => { reset(); onClose() }

  const handleFile = (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please select a .csv file')
      return
    }
    setSelectedFile(file)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }, [])

  const runImport = async () => {
    if (!selectedFile) return
    setStage('importing')
    try {
      const res = await assessmentsApi.templates.importCsv(selectedFile)
      // axios interceptor unwraps: res = CsvImportResult
      setResult(res)
      qc.invalidateQueries({ queryKey: ['assessment-templates'] })
      qc.invalidateQueries({ queryKey: ['library-questions-all'] })
      qc.invalidateQueries({ queryKey: ['library-sections-all'] })
      setStage('done')
    } catch (err) {
      setResult({
        fatalError: true,
        summary: err?.message || 'Import failed — server error',
        log: [],
        successCount: 0,
        failureCount: 0,
      })
      setStage('done')
    }
  }

  const errCount = result?.failureCount || 0
  const okCount  = result?.successCount || 0

  return (
    <Modal open={open} onClose={stage === 'importing' ? undefined : handleClose}
      title="Import Template from CSV"
      subtitle="CSV is parsed server-side — no browser processing"
      size="lg">

      {/* ── Upload ── */}
      {stage === 'upload' && (
        <div className="flex flex-col gap-4">
          {/* Format reference */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-surface-overlay border-b border-border">
              <span className="text-xs font-semibold text-text-secondary">CSV column format</span>
              <Button variant="secondary" size="xs" icon={Download} onClick={downloadCsvTemplate}>Download Example</Button>
            </div>
            <pre className="px-4 py-3 text-[10px] font-mono text-text-muted overflow-x-auto leading-relaxed">
{`type,name_or_text,response_type,weight,is_mandatory,option_value,score,question_tag
TEMPLATE, My Template Name
SECTION,  Section Name
QUESTION, Question text here, SINGLE_CHOICE, 10, true, , , CERTIFICATION
OPTION,   (empty),            (empty),       (empty), (empty), Option text, 10,`}
            </pre>
            <div className="px-4 py-2 bg-surface-overlay border-t border-border flex gap-6 flex-wrap">
              {[
                { label: 'TEMPLATE', color: 'text-purple-400', note: 'first row, sets name' },
                { label: 'SECTION',  color: 'text-blue-400',   note: 'groups questions' },
                { label: 'QUESTION', color: 'text-cyan-400',   note: 'col 7 = question_tag (optional)' },
                { label: 'OPTION',   color: 'text-green-400',  note: 'option_value col 5 + score col 6' },
              ].map(({ label, color, note }) => (
                <span key={label} className="text-[10px] text-text-muted">
                  <span className={cn('font-mono font-bold', color)}>{label}</span> — {note}
                </span>
              ))}
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={cn('border-2 border-dashed rounded-lg p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors',
              selectedFile ? 'border-green-500/40 bg-green-500/5' :
              dragOver ? 'border-brand-500 bg-brand-500/5' :
              'border-border hover:border-border-subtle hover:bg-surface-overlay')}>
            <div className="w-12 h-12 rounded-xl bg-surface-overlay flex items-center justify-center">
              {selectedFile
                ? <CheckCircle2 size={22} className="text-green-400" />
                : <Upload size={22} className="text-text-muted" />}
            </div>
            <div className="text-center">
              {selectedFile ? (
                <>
                  <p className="text-sm font-medium text-green-400">{selectedFile.name}</p>
                  <p className="text-xs text-text-muted mt-1">Click to choose a different file</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-text-primary">Drop your CSV here, or click to browse</p>
                  <p className="text-xs text-text-muted mt-1">.csv files only — parsed server-side</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => handleFile(e.target.files[0])} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
            <Button size="sm" icon={Upload} disabled={!selectedFile} onClick={runImport}>
              Upload & Import
            </Button>
          </div>
        </div>
      )}

      {/* ── Importing ── */}
      {stage === 'importing' && (
        <div className="flex flex-col items-center gap-6 py-8">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center">
            <Loader2 size={28} className="text-brand-400 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-text-primary">Importing on server…</p>
            <p className="text-xs text-text-muted mt-1">
              OpenCSV is parsing your file, creating library entities, and building mappings.
            </p>
          </div>
          <p className="text-xs text-text-muted">Please don't close this window</p>
        </div>
      )}

      {/* ── Done ── */}
      {stage === 'done' && result && (
        <div className="flex flex-col gap-4">
          {/* Summary header */}
          <div className="flex items-center gap-3">
            <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
              result.fatalError ? 'bg-red-500/10' :
              errCount > 0 ? 'bg-amber-500/10' : 'bg-green-500/10')}>
              {result.fatalError || errCount > 0
                ? <AlertCircle size={22} className={result.fatalError ? 'text-red-400' : 'text-amber-400'} />
                : <CheckCircle2 size={22} className="text-green-400" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {result.fatalError ? 'Import failed'
                  : errCount > 0 ? `Import completed with ${errCount} issue${errCount !== 1 ? 's' : ''}`
                  : 'Import successful'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{result.summary}</p>
            </div>
          </div>

          {/* Stats */}
          {!result.fatalError && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total rows', value: result.totalRows,    color: 'text-text-secondary' },
                { label: 'Succeeded', value: result.successCount,  color: 'text-green-400' },
                { label: 'Failed',    value: result.failureCount,  color: result.failureCount ? 'text-red-400' : 'text-text-muted' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-3 bg-surface-overlay rounded-lg border border-border text-center">
                  <p className={cn('text-xl font-bold font-mono', color)}>{value}</p>
                  <p className="text-xs text-text-muted mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Log */}
          {result.log?.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-overlay p-3 flex flex-col gap-0.5 font-mono text-xs">
              {result.log.map((entry, i) => (
                <div key={i} className={cn('flex items-start gap-2',
                  entry.status === 'SUCCESS' && 'text-text-secondary',
                  entry.status === 'ERROR'   && 'text-red-400',
                  entry.status === 'WARNING' && 'text-amber-400',
                  entry.status === 'INFO'    && 'text-brand-400')}>
                  {entry.status === 'SUCCESS' && <CheckCircle2 size={11} className="mt-0.5 shrink-0" />}
                  {entry.status === 'ERROR'   && <XCircle size={11} className="mt-0.5 shrink-0" />}
                  {entry.status === 'WARNING' && <AlertCircle size={11} className="mt-0.5 shrink-0" />}
                  {entry.status === 'INFO'    && <span className="shrink-0 mt-0.5">›</span>}
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={reset}>Import Another</Button>
            {result.createdEntityId && !result.fatalError && (
              <Button size="sm" icon={ChevronRight}
                onClick={() => onImported(result.createdEntityId)}>
                Open in Builder
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Create Template Modal ────────────────────────────────────────────────────
function CreateTemplateModal({ open, onClose, onCreated }) {
  const { mutate: create, isPending } = useCreateTemplate()
  const [form, setForm]   = useState({ name: '', version: '1' })
  const [errors, setErrors] = useState({})

  const handleSubmit = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Required'
    setErrors(e)
    if (Object.keys(e).length) return
    create(
      { name: form.name, version: parseInt(form.version) || 1 },
      { onSuccess: (res) => { onCreated(res?.templateId); setForm({ name: '', version: '1' }) } }
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="New Assessment Template" size="sm"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={handleSubmit}>Create & Build</Button>
      </div>}>
      <div className="flex flex-col gap-4">
        <Input label="Template Name" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. High Risk Vendor Security Assessment" error={errors.name} />
        <Input label="Version" type="number" value={form.version}
          onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="1" />
        <p className="text-xs text-text-muted">Created as <span className="text-amber-400 font-medium">DRAFT</span>.</p>
      </div>
    </Modal>
  )
}

// ─── Rename Template Modal ────────────────────────────────────────────────────
function RenameTemplateModal({ template, onClose }) {
  const { mutate: update, isPending } = useUpdateTemplate()
  const [name, setName]       = useState('')
  const [version, setVersion] = useState('')
  const prevId = useRef(null)

  if (template && template.templateId !== prevId.current) {
    prevId.current = template.templateId
    setName(template.name || '')
    setVersion(String(template.version || 1))
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    update({ id: template.templateId, data: { name, version: parseInt(version) || 1 } },
      { onSuccess: onClose })
  }

  return (
    <Modal open={!!template} onClose={onClose} title="Rename Template" size="sm"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={handleSubmit}>Save</Button>
      </div>}>
      <div className="flex flex-col gap-3">
        <Input label="Template Name" value={name} onChange={e => setName(e.target.value)} />
        <Input label="Version" type="number" value={version} onChange={e => setVersion(e.target.value)} />
      </div>
    </Modal>
  )
}

// ─── Template Builder ─────────────────────────────────────────────────────────
function TemplateBuilder({ templateId, onBack }) {
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [showAddSection, setShowAddSection]         = useState(false)
  const [expandedSections, setExpandedSections]     = useState({})
  const [addingQuestionTo, setAddingQuestionTo]     = useState(null)
  const [removingSection, setRemovingSection]       = useState(null)

  const { data: template, isLoading } = useFullTemplate(templateId)
  const { mutate: publish, isPending: publishing }   = usePublishTemplate()
  const { mutate: unpublish, isPending: unpublishing } = useUnpublishTemplate()
  const { mutate: unmapSection, isPending: removingSec } = useUnmapSection(templateId)

  const isPublished    = template?.status === 'PUBLISHED'
  const totalQuestions = template?.sections?.reduce((s, sec) => s + (sec.questions?.length || 0), 0) || 0

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="text-brand-400 animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            <ArrowLeft size={15} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-text-primary">{template?.name}</h1>
              <Badge value={template?.status} label={template?.status}
                colorTag={STATUS_COLOR[template?.status] || 'gray'} />
              <span className="text-xs font-mono text-text-muted">v{template?.version}</span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              {template?.sections?.length || 0} sections · {totalQuestions} questions
              {template?.publishedAt && <> · Published {formatDate(template.publishedAt)}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isPublished && (
            <>
              <Button variant="secondary" size="sm" icon={Plus} onClick={() => setShowAddSection(true)}>
                Add Section
              </Button>
              <Button size="sm" icon={Send}
                disabled={!template?.sections?.length || totalQuestions === 0}
                onClick={() => setShowPublishConfirm(true)}>
                Publish
              </Button>
            </>
          )}
          {isPublished && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <CheckCircle2 size={14} /> Published
              </div>
              <Button variant="secondary" size="sm" icon={ArrowLeft}
                loading={unpublishing} onClick={() => unpublish(templateId)}>
                Unpublish
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {(!template?.sections || template.sections.length === 0) ? (
          <EmptyState icon={LayoutTemplate} title="No sections mapped yet"
            description="Add sections from the library to build your template."
            action={!isPublished && <Button size="sm" icon={Plus} onClick={() => setShowAddSection(true)}>Add Section</Button>}
          />
        ) : (
          <div className="flex flex-col gap-3 max-w-3xl">
            {template.sections.map((section, sIdx) => (
              <SectionBlock
                key={section.sectionId}
                section={section}
                index={sIdx}
                templateId={templateId}
                isPublished={isPublished}
                expanded={!!expandedSections[section.sectionId]}
                onToggle={() => setExpandedSections(p => ({ ...p, [section.sectionId]: !p[section.sectionId] }))}
                onAddQuestion={() => setAddingQuestionTo(section.sectionId)}
                onRemove={() => setRemovingSection(section)}
              />
            ))}
            {!isPublished && (
              <button onClick={() => setShowAddSection(true)}
                className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border rounded-lg text-sm text-text-muted hover:text-text-secondary hover:border-border-subtle transition-colors">
                <Plus size={14} /> Add Section from Library
              </button>
            )}
          </div>
        )}
      </div>

      <SectionPickerModal open={showAddSection} templateId={templateId}
        existingSectionIds={template?.sections?.map(s => s.sectionId) || []}
        nextOrder={(template?.sections?.length || 0) + 1}
        onClose={() => setShowAddSection(false)} />

      <QuestionPickerModal open={!!addingQuestionTo} sectionId={addingQuestionTo}
        templateId={templateId}
        existingQuestionIds={template?.sections?.find(s => s.sectionId === addingQuestionTo)?.questions?.map(q => q.questionId) || []}
        nextOrder={(template?.sections?.find(s => s.sectionId === addingQuestionTo)?.questions?.length || 0) + 1}
        onClose={() => setAddingQuestionTo(null)} />

      <ConfirmDialog open={!!removingSection} onClose={() => setRemovingSection(null)}
        onConfirm={() => unmapSection(removingSection?.sectionId, { onSuccess: () => setRemovingSection(null) })}
        loading={removingSec} title="Remove Section" variant="danger" confirmLabel="Remove"
        message={`Remove section "${removingSection?.name}" from this template? The section and its questions remain in the library.`}
      />

      <ConfirmDialog open={showPublishConfirm} onClose={() => setShowPublishConfirm(false)}
        onConfirm={() => publish(templateId, { onSuccess: () => setShowPublishConfirm(false) })}
        loading={publishing} title="Publish Template" confirmLabel="Publish" variant="primary"
        message={`Publish "${template?.name}" with ${template?.sections?.length} sections and ${totalQuestions} questions?`}
      />
    </div>
  )
}

// ─── Section Block ────────────────────────────────────────────────────────────
function SectionBlock({ section, index, templateId, isPublished, expanded, onToggle, onAddQuestion, onRemove }) {
  const questionCount = section.questions?.length || 0
  const totalWeight   = section.questions?.reduce((s, q) => s + (q.weight || 0), 0) || 0

  return (
    <div className="rounded-lg border border-border bg-surface-raised overflow-hidden">
      <div className="flex items-center">
        <button onClick={onToggle}
          className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-surface-overlay transition-colors text-left">
          <div className="w-6 h-6 rounded-md bg-brand-500/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-brand-400">{index + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">{section.name}</p>
            <p className="text-xs text-text-muted">
              {questionCount} question{questionCount !== 1 ? 's' : ''}
              {totalWeight > 0 && <> · {totalWeight.toFixed(0)} total weight</>}
            </p>
          </div>
          {expanded
            ? <ChevronDown size={14} className="text-text-muted shrink-0" />
            : <ChevronRight size={14} className="text-text-muted shrink-0" />}
        </button>
        {!isPublished && (
          <button onClick={onRemove} title="Remove from template"
            className="mr-3 h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border">
          {questionCount === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-text-muted mb-2">No questions mapped to this section</p>
              {!isPublished && <Button size="xs" variant="secondary" icon={Plus} onClick={onAddQuestion}>Add Question</Button>}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {section.questions.map((q, qIdx) => (
                <QuestionRow key={q.questionId} question={q} index={qIdx}
                  sectionId={section.sectionId} templateId={templateId} isPublished={isPublished} />
              ))}
              {!isPublished && (
                <div className="px-4 py-2.5">
                  <Button size="xs" variant="ghost" icon={Plus} onClick={onAddQuestion}>Add Question</Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!expanded && !isPublished && (
        <div className="border-t border-border px-4 py-2">
          <Button size="xs" variant="ghost" icon={Plus}
            onClick={e => { e.stopPropagation(); onAddQuestion() }}>Add Question</Button>
        </div>
      )}
    </div>
  )
}

// ─── Question Row ─────────────────────────────────────────────────────────────
function QuestionRow({ question, index, sectionId, templateId, isPublished }) {
  const [showOptions, setShowOptions] = useState(false)
  const [showEdit, setShowEdit]       = useState(false)
  const [showRemove, setShowRemove]   = useState(false)
  const [editWeight, setEditWeight]   = useState(String(question.weight ?? ''))
  const [editMandatory, setEditMandatory] = useState(question.isMandatory)
  const optionCount = question.options?.length || 0

  const { mutate: updateMapping, isPending: updating } = useUpdateQuestionMapping(templateId)
  const { mutate: unmapQuestion, isPending: removing }  = useUnmapQuestion(templateId)

  const saveEdit = () => {
    updateMapping({
      sectionId, questionId: question.questionId,
      data: {
        weight:      editWeight !== '' ? parseFloat(editWeight) : null,
        isMandatory: editMandatory,
      }
    }, { onSuccess: () => setShowEdit(false) })
  }

  return (
    <div className="px-4 py-3 hover:bg-surface-overlay/50 group">
      <div className="flex items-start gap-3">
        <span className="text-xs font-mono text-text-muted mt-0.5 w-5 shrink-0">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary leading-relaxed">{question.questionText}</p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <Badge value={question.responseType} label={TYPE_LABEL[question.responseType] || question.responseType}
              colorTag={TYPE_COLOR[question.responseType] || 'gray'} />
            {question.weight != null && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <Weight size={10} /> {question.weight}
              </span>
            )}
            {question.isMandatory && <span className="text-xs text-red-400 font-medium">Required</span>}
            {question.questionTag && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] bg-brand-500/8 text-brand-400 border border-brand-500/20">
                {question.questionTag}
              </span>
            )}
            {optionCount > 0 && (
              <button onClick={() => setShowOptions(o => !o)} className="text-xs text-brand-400 hover:text-brand-300">
                {showOptions ? 'Hide' : 'Show'} {optionCount} options
              </button>
            )}
          </div>
          {showOptions && optionCount > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {question.options.map(opt => (
                <div key={opt.optionId} className="flex items-center justify-between py-1 px-2 rounded bg-surface-overlay text-xs">
                  <span className="text-text-secondary">{opt.optionValue}</span>
                  <span className="font-mono text-text-muted">score: {opt.score ?? 0}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {!isPublished && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => { setEditWeight(String(question.weight ?? '')); setEditMandatory(question.isMandatory); setShowEdit(true) }}
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay">
              <Pencil size={12} />
            </button>
            <button onClick={() => setShowRemove(true)}
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10">
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Question Mapping" size="sm"
        footer={<div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowEdit(false)}>Cancel</Button>
          <Button size="sm" loading={updating} onClick={saveEdit}>Save</Button>
        </div>}>
        <div className="flex flex-col gap-4">
          <div className="p-3 bg-surface-overlay rounded-lg border border-border">
            <p className="text-xs text-text-muted mb-1">Question (from library — read only)</p>
            <p className="text-sm text-text-primary">{question.questionText}</p>
          </div>
          <Input label="Weight" type="number" value={editWeight}
            onChange={e => setEditWeight(e.target.value)} placeholder="e.g. 10" />
          <label className="flex items-center gap-3 cursor-pointer">
            <button type="button" onClick={() => setEditMandatory(m => !m)}
              className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
                editMandatory ? 'bg-brand-500' : 'bg-surface-raised border border-border')}>
              <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                editMandatory ? 'translate-x-4' : 'translate-x-0.5')} />
            </button>
            <span className="text-sm text-text-primary">Mandatory</span>
          </label>
        </div>
      </Modal>

      <ConfirmDialog open={showRemove} onClose={() => setShowRemove(false)}
        onConfirm={() => unmapQuestion({ sectionId, questionId: question.questionId },
          { onSuccess: () => setShowRemove(false) })}
        loading={removing} title="Remove Question" variant="danger" confirmLabel="Remove"
        message={`Remove "${question.questionText.slice(0, 60)}…" from this section? The library question is not deleted.`}
      />
    </div>
  )
}

// ─── Section Picker Modal ─────────────────────────────────────────────────────
function SectionPickerModal({ open, templateId, existingSectionIds, nextOrder, onClose }) {
  const { mutate: mapSection, isPending } = useMapSection(templateId)
  const { data: libData, isLoading }      = useLibrarySections()
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState(null)

  const allSections = libData?.items || []
  const filtered = allSections.filter(s =>
    !existingSectionIds.includes(s.sectionId) &&
    (!search || s.name.toLowerCase().includes(search.toLowerCase()))
  )

  const handleAdd = () => {
    if (!selected) return
    mapSection({ sectionId: selected.sectionId, orderNo: nextOrder },
      { onSuccess: () => { onClose(); setSelected(null); setSearch('') } })
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Section from Library"
      subtitle="Select an existing library section to add to this template" size="md"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} disabled={!selected} onClick={handleAdd}>
          Add to Template
        </Button>
      </div>}>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sections…"
            className="h-8 pl-8 pr-3 w-full rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
          {isLoading && <div className="flex items-center justify-center py-10"><Loader2 size={18} className="text-brand-400 animate-spin" /></div>}
          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10">
              <BookOpen size={20} className="text-text-muted mb-2" />
              <p className="text-xs text-text-muted">{allSections.length === 0 ? 'No sections in library.' : 'No matching sections.'}</p>
            </div>
          )}
          {!isLoading && filtered.map(s => (
            <button key={s.sectionId} onClick={() => setSelected(s)}
              className={cn('w-full text-left px-4 py-3 hover:bg-surface-overlay transition-colors flex items-center gap-3',
                selected?.sectionId === s.sectionId && 'bg-brand-500/5 border-l-2 border-brand-500')}>
              <div className="flex-1">
                <p className="text-sm text-text-primary">{s.name}</p>
              </div>
              {selected?.sectionId === s.sectionId && <CheckCircle2 size={14} className="text-brand-400 shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

// ─── Question Picker Modal ────────────────────────────────────────────────────
function QuestionPickerModal({ open, sectionId, templateId, existingQuestionIds, nextOrder, onClose }) {
  const { mutate: mapQuestion, isPending } = useMapQuestion(templateId)
  const { data: libData, isLoading }       = useLibraryQuestions()
  const [search, setSearch]       = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selected, setSelected]   = useState(null)
  const [weight, setWeight]       = useState('')
  const [mandatory, setMandatory] = useState(false)

  const allQuestions = libData?.items || []
  const filtered = allQuestions.filter(q => {
    if (existingQuestionIds.includes(q.questionId)) return false
    if (typeFilter && q.responseType !== typeFilter) return false
    if (search && !q.questionText.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleAdd = () => {
    if (!selected) return
    mapQuestion(
      { sectionId, questionId: selected.questionId, data: { weight: parseFloat(weight) || null, isMandatory: mandatory, orderNo: nextOrder } },
      { onSuccess: () => { onClose(); setSelected(null); setWeight(''); setMandatory(false); setSearch(''); setTypeFilter('') } }
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Question from Library"
      subtitle="Map a library question into this section" size="xl"
      footer={<div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {selected ? <span className="text-brand-400">"{selected.questionText.slice(0,50)}…" selected</span> : 'No question selected'}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isPending} onClick={handleAdd} disabled={!selected}>Add to Section</Button>
        </div>
      </div>}>
      <div className="flex gap-4 h-[400px]">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search questions…"
                className="h-7 pl-8 pr-3 w-full rounded-md border border-border bg-surface-raised text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="h-7 appearance-none pl-2 pr-6 rounded-md border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">All types</option>
              {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {isLoading && <div className="flex items-center justify-center py-12"><Loader2 size={18} className="text-brand-400 animate-spin" /></div>}
            {!isLoading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10">
                <BookOpen size={20} className="text-text-muted mb-2" />
                <p className="text-xs text-text-muted">{allQuestions.length === 0 ? 'No questions in library.' : 'No matching questions.'}</p>
              </div>
            )}
            {!isLoading && filtered.map(q => (
              <button key={q.questionId} onClick={() => setSelected(q)}
                className={cn('w-full text-left px-3 py-2.5 hover:bg-surface-overlay transition-colors flex items-start gap-3',
                  selected?.questionId === q.questionId && 'bg-brand-500/5 border-l-2 border-brand-500')}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary leading-relaxed line-clamp-2">{q.questionText}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge value={q.responseType} label={TYPE_LABEL[q.responseType]} colorTag={TYPE_COLOR[q.responseType] || 'gray'} />
                    {q.optionsLinked > 0 && <span className="text-[10px] text-text-muted">{q.optionsLinked} options</span>}
                    {q.questionTag && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] bg-brand-500/8 text-brand-400 border border-brand-500/20">
                        {q.questionTag}
                      </span>
                    )}
                  </div>
                </div>
                {selected?.questionId === q.questionId && <CheckCircle2 size={14} className="text-brand-400 shrink-0 mt-0.5" />}
              </button>
            ))}
          </div>
        </div>
        <div className="w-52 shrink-0">
          <div className="p-3 rounded-lg bg-surface-overlay border border-border">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Config in this section</p>
            {!selected ? (
              <p className="text-xs text-text-muted">Select a question on the left.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="p-2 rounded bg-surface-raised border border-border">
                  <p className="text-[11px] text-text-muted mb-1">Selected</p>
                  <p className="text-xs text-text-primary line-clamp-3">{selected.questionText}</p>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wide block mb-1">Weight</label>
                  <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="e.g. 10"
                    className="h-7 w-full rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <button type="button" onClick={() => setMandatory(m => !m)}
                    className={cn('relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0',
                      mandatory ? 'bg-brand-500' : 'bg-surface-raised border border-border')}>
                    <span className={cn('inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                      mandatory ? 'translate-x-3.5' : 'translate-x-0.5')} />
                  </button>
                  <span className="text-xs text-text-primary">Mandatory</span>
                </label>
                <p className="text-[10px] text-text-muted">Position {nextOrder} in section.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}