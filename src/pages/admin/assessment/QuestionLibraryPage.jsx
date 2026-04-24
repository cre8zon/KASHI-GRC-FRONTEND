import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, RefreshCw, Upload, Download, BookOpen,
  CheckCircle2, XCircle, AlertCircle, ChevronDown,
  Loader2, Tag, Pencil, Trash2, Layers, FileText
} from 'lucide-react'
import { assessmentsApi } from '../../../api/assessments.api'
import { PageLayout } from '../../../components/layout/PageLayout'
import { DataTable } from '../../../components/ui/DataTable'
import { Button } from '../../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Badge } from '../../../components/ui/Badge'
import { cn } from '../../../lib/cn'
import toast from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────
const RESPONSE_TYPES = [
  { value: 'SINGLE_CHOICE', label: 'Single Choice' },
  { value: 'MULTI_CHOICE',  label: 'Multi Choice' },
  { value: 'TEXT',          label: 'Text Answer' },
  { value: 'FILE_UPLOAD',   label: 'File Upload' },
]
const TYPE_COLOR = {
  SINGLE_CHOICE: 'blue', MULTI_CHOICE: 'purple',
  TEXT: 'cyan', FILE_UPLOAD: 'amber',
}
const TABS = [
  { key: 'questions', label: 'Questions', icon: BookOpen },
  { key: 'options',   label: 'Options',   icon: Tag },
  { key: 'sections',  label: 'Sections',  icon: Layers },
]

const QUESTION_CSV_TEMPLATE =
`questionText,responseType,questionTag,optionValue1,score1,optionValue2,score2,optionValue3,score3,optionValue4,score4
"Do you have a documented information security policy?",SINGLE_CHOICE,INFOSEC_POLICY,"Yes — fully documented",10,"Yes — partially documented",6,"No — in progress",3,"No",0
"Which security frameworks do you follow?",MULTI_CHOICE,CERTIFICATION,"ISO 27001",10,"SOC 2",10,"NIST CSF",8,"None",0
"Describe your incident response process.",TEXT,IRP,,,,,,,,,
"Please upload your latest security audit report.",FILE_UPLOAD,CERTIFICATION,,,,,,,,,`

function downloadQuestionTemplate() {
  const blob = new Blob([QUESTION_CSV_TEMPLATE], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'library_questions_import.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
const useQuestions = (params) => useQuery({
  queryKey: ['library-questions', params],
  queryFn:  () => assessmentsApi.library.questions.list(params),
  keepPreviousData: true,
})
const useOptions = (params) => useQuery({
  queryKey: ['library-options', params],
  queryFn:  () => assessmentsApi.library.options.list(params),
  keepPreviousData: true,
})
const useSections = (params) => useQuery({
  queryKey: ['library-sections', params],
  queryFn:  () => assessmentsApi.library.sections.list(params),
  keepPreviousData: true,
})
const useQuestionLinkedOptions = (questionId) => useQuery({
  queryKey: ['question-linked-options', questionId],
  queryFn:  () => assessmentsApi.library.questions.getOptions(questionId),
  enabled:  !!questionId,
})
const useAllOptions = () => useQuery({
  queryKey: ['library-options-all'],
  queryFn:  () => assessmentsApi.library.options.list({ skip: 0, take: 500 }),
})

function useCreateQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => assessmentsApi.library.questions.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-questions'] }),
    onError:   () => toast.error('Failed to create question'),
  })
}
function useUpdateQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => assessmentsApi.library.questions.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['library-questions'] }); toast.success('Question updated') },
    onError:   () => toast.error('Failed to update question'),
  })
}
function useDeleteQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => assessmentsApi.library.questions.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['library-questions'] }); toast.success('Question deleted') },
    onError:   () => toast.error('Failed to delete question'),
  })
}
function useBulkDeleteQuestions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids) => assessmentsApi.library.questions.bulkDelete(ids),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['library-questions'] })
      toast.success(`Deleted ${res?.deleted ?? '?'} questions`)
    },
    onError: () => toast.error('Bulk delete failed'),
  })
}
function useCreateOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => assessmentsApi.library.options.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-options'] }),
    onError:   () => toast.error('Failed to create option'),
  })
}
function useUpdateOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => assessmentsApi.library.options.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['library-options'] }); toast.success('Option updated') },
    onError:   () => toast.error('Failed to update option'),
  })
}
function useDeleteOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => assessmentsApi.library.options.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['library-options'] }); toast.success('Option deleted') },
    onError:   () => toast.error('Failed to delete option'),
  })
}
function useBulkDeleteOptions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids) => assessmentsApi.library.options.bulkDelete(ids),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['library-options'] })
      toast.success(`Deleted ${res?.deleted ?? '?'} options`)
    },
    onError: () => toast.error('Bulk delete failed'),
  })
}
function useCreateSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => assessmentsApi.library.sections.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library-sections'] }),
    onError:   () => toast.error('Failed to create section'),
  })
}
function useUpdateSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => assessmentsApi.library.sections.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['library-sections'] }); toast.success('Section updated') },
    onError:   () => toast.error('Failed to update section'),
  })
}
function useDeleteSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => assessmentsApi.library.sections.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['library-sections'] }); toast.success('Section deleted') },
    onError:   () => toast.error('Failed to delete section'),
  })
}
function useBulkDeleteSections() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids) => assessmentsApi.library.sections.bulkDelete(ids),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['library-sections'] })
      toast.success(`Deleted ${res?.deleted ?? '?'} sections`)
    },
    onError: () => toast.error('Bulk delete failed'),
  })
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function QuestionLibraryPage() {
  const [tab, setTab]               = useState('questions')
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage]             = useState(1)
  const [optPage, setOptPage]       = useState(1)
  const [secPage, setSecPage]       = useState(1)

  // Single-item modals
  const [showCreateQ, setShowCreateQ] = useState(false)
  const [showCreateO, setShowCreateO] = useState(false)
  const [showCreateS, setShowCreateS] = useState(false)
  const [showImportQ, setShowImportQ] = useState(false)
  const [editQuestion, setEditQuestion]     = useState(null)
  const [editOption, setEditOption]         = useState(null)
  const [editSection, setEditSection]       = useState(null)
  const [deleteQuestion, setDeleteQuestion] = useState(null)
  const [deleteOption, setDeleteOption]     = useState(null)
  const [deleteSection, setDeleteSection]   = useState(null)

  // ── Selection state — plain arrays of the domain IDs ──────────────────────
  // DataTable.selectable uses row.id internally.
  // We map data → { ...item, id: item.questionId } before passing to DataTable,
  // so onSelectionChange gives us back those same IDs directly.
  const [selectedQIds, setSelectedQIds] = useState([])
  const [selectedOIds, setSelectedOIds] = useState([])
  const [selectedSIds, setSelectedSIds] = useState([])
  const [showBulkDeleteQ, setShowBulkDeleteQ] = useState(false)
  const [showBulkDeleteO, setShowBulkDeleteO] = useState(false)
  const [showBulkDeleteS, setShowBulkDeleteS] = useState(false)

  const { mutate: deleteQ, isPending: deletingQ }         = useDeleteQuestion()
  const { mutate: deleteO, isPending: deletingO }         = useDeleteOption()
  const { mutate: deleteS, isPending: deletingS }         = useDeleteSection()
  const { mutate: bulkDeleteQ, isPending: bulkDeletingQ } = useBulkDeleteQuestions()
  const { mutate: bulkDeleteO, isPending: bulkDeletingO } = useBulkDeleteOptions()
  const { mutate: bulkDeleteS, isPending: bulkDeletingS } = useBulkDeleteSections()

  const qParams = {
    skip: (page - 1) * 20, take: 20,
    ...(search     ? { search: `questiontext=${search}` } : {}),
    ...(typeFilter ? { filterby: `responsetype=${typeFilter}` } : {}),
  }
  const oParams = {
    skip: (optPage - 1) * 20, take: 20,
    ...(search ? { search: `optionvalue=${search}` } : {}),
  }
  const sParams = {
    skip: (secPage - 1) * 20, take: 20,
    ...(search ? { search: `name=${search}` } : {}),
  }

  const { data: qData, isLoading: qLoading, refetch: qRefetch } = useQuestions(qParams)
  const { data: oData, isLoading: oLoading, refetch: oRefetch } = useOptions(oParams)
  const { data: sData, isLoading: sLoading, refetch: sRefetch } = useSections(sParams)

  const handleTabChange = (t) => {
    setTab(t); setSearch(''); setTypeFilter('')
    setSelectedQIds([]); setSelectedOIds([]); setSelectedSIds([])
    setPage(1); setOptPage(1); setSecPage(1)
  }

  // ── Data mapped with id field so DataTable.selectable works ──────────────
  // DataTable checks row.id for selection. Our entities have questionId/optionId/sectionId.
  // Mapping adds id = domain key so select-all and per-row checkboxes both work correctly.
  const qItems = (qData?.items || []).map(r => ({ ...r, id: r.questionId }))
  const oItems = (oData?.items || []).map(r => ({ ...r, id: r.optionId }))
  const sItems = (sData?.items || []).map(r => ({ ...r, id: r.sectionId }))

  // ── Columns — no __check column needed; DataTable renders its own ──────────
  const qColumns = [
    { key: 'questionId',    label: 'ID',      sortable: true,  width: 60,  type: 'mono' },
    { key: 'questionText',  label: 'Question', sortable: true,  width: 340, type: 'truncate', truncateLen: 80 },
    { key: 'responseType',  label: 'Type',     sortable: true,  width: 120, type: 'custom',
      render: (row) => (
        <Badge value={row.responseType}
          label={RESPONSE_TYPES.find(t => t.value === row.responseType)?.label || row.responseType}
          colorTag={TYPE_COLOR[row.responseType] || 'gray'} />
      ),
    },
    { key: 'questionTag',   label: 'Guard Tag', sortable: true, width: 110, type: 'custom',
      render: (row) => row.questionTag
        ? <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] bg-brand-500/10 text-brand-400">{row.questionTag}</span>
        : <span className="text-[10px] text-text-muted italic">—</span>,
    },
    { key: 'optionsLinked', label: 'Options',  sortable: false, width: 70,  type: 'number' },
    { key: '__actions',     label: '',          width: 72,       type: 'custom',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => setEditQuestion(row)} title="Edit"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            <Pencil size={12} />
          </button>
          <button onClick={() => setDeleteQuestion(row)} title="Delete"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      ),
    },
  ]

  const oColumns = [
    { key: 'optionId',    label: 'ID',     sortable: true, width: 60,  type: 'mono' },
    { key: 'optionValue', label: 'Option', sortable: true, width: 380 },
    { key: 'score', label: 'Score', sortable: true, width: 90, type: 'custom',
      render: (row) => {
        if (row.score == null) return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20">
            not set
          </span>
        )
        const color = row.score >= 8 ? 'text-green-400 bg-green-500/10 border-green-500/20'
                    : row.score >= 5 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    : row.score >= 1 ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                    :                  'text-red-400 bg-red-500/10 border-red-500/20'
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono border ${color}`}>
            {row.score} pts
          </span>
        )
      }
    },
    { key: '__actions',   label: '',        width: 72,      type: 'custom',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => setEditOption(row)} title="Edit"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            <Pencil size={12} />
          </button>
          <button onClick={() => setDeleteOption(row)} title="Delete"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      ),
    },
  ]

  const sColumns = [
    { key: 'sectionId', label: 'ID',   sortable: true, width: 60,  type: 'mono' },
    { key: 'name',      label: 'Name', sortable: true, width: 440 },
    { key: '__actions', label: '',      width: 72,      type: 'custom',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => setEditSection(row)} title="Edit"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            <Pencil size={12} />
          </button>
          <button onClick={() => setDeleteSection(row)} title="Delete"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      ),
    },
  ]

  // ── Bulk action bar ────────────────────────────────────────────────────────
  const BulkBar = ({ count, label, loading, onDelete, onClear }) => count === 0 ? null : (
    <div className="flex items-center gap-3 px-6 py-2.5 bg-brand-500/5 border-b border-brand-500/20">
      <span className="text-xs font-medium text-brand-400">{count} {label} selected</span>
      <Button variant="ghost" size="xs" icon={Trash2}
        className="text-red-400 hover:bg-red-500/10"
        loading={loading} onClick={onDelete}>
        Delete selected
      </Button>
      <button onClick={onClear}
        className="text-xs text-text-muted hover:text-text-secondary ml-auto">
        Clear selection
      </button>
    </div>
  )

  return (
    <PageLayout
      title="Question Library"
      subtitle="Manage reusable options, questions, and sections"
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); setOptPage(1); setSecPage(1) }}
              placeholder={tab === 'questions' ? 'Search questions…' : tab === 'options' ? 'Search options…' : 'Search sections…'}
              className="h-8 pl-8 pr-3 w-52 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>

          {tab === 'questions' && (
            <div className="relative">
              <select value={typeFilter}
                onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
                className="h-8 appearance-none pl-3 pr-8 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">All types</option>
                {RESPONSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          )}

          <Button variant="ghost" size="sm" icon={RefreshCw}
            onClick={tab === 'questions' ? qRefetch : tab === 'options' ? oRefetch : sRefetch} />

          {tab === 'questions' && (
            <Button variant="secondary" size="sm" icon={Upload} onClick={() => setShowImportQ(true)}>
              Import CSV
            </Button>
          )}

          <Button size="sm" icon={Plus}
            onClick={() => tab === 'questions' ? setShowCreateQ(true) : tab === 'options' ? setShowCreateO(true) : setShowCreateS(true)}>
            {tab === 'questions' ? 'Add Question' : tab === 'options' ? 'Add Option' : 'Add Section'}
          </Button>
        </div>
      }
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => {
          const count = key === 'questions' ? qData?.pagination?.totalItems
                      : key === 'options'   ? oData?.pagination?.totalItems
                      : sData?.pagination?.totalItems
          return (
            <button key={key} onClick={() => handleTabChange(key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === key ? 'border-brand-500 text-brand-400' : 'border-transparent text-text-muted hover:text-text-secondary'
              )}>
              <Icon size={14} />
              {label}
              {count != null && (
                <span className={cn('ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono',
                  tab === key ? 'bg-brand-500/15 text-brand-400' : 'bg-surface-overlay text-text-muted')}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Bulk action bars — appear when rows are selected */}
      {tab === 'questions' && (
        <BulkBar count={selectedQIds.length} label="question(s)"
          loading={bulkDeletingQ}
          onDelete={() => setShowBulkDeleteQ(true)}
          onClear={() => setSelectedQIds([])} />
      )}
      {tab === 'options' && (
        <BulkBar count={selectedOIds.length} label="option(s)"
          loading={bulkDeletingO}
          onDelete={() => setShowBulkDeleteO(true)}
          onClear={() => setSelectedOIds([])} />
      )}
      {tab === 'sections' && (
        <BulkBar count={selectedSIds.length} label="section(s)"
          loading={bulkDeletingS}
          onDelete={() => setShowBulkDeleteS(true)}
          onClear={() => setSelectedSIds([])} />
      )}

      {/* Tables — selectable=true activates DataTable's built-in header + row checkboxes */}
      <div className="flex-1 overflow-hidden">
        {tab === 'questions' && (
          <DataTable
            columns={qColumns}
            data={qItems}
            pagination={qData?.pagination}
            onPageChange={setPage}
            loading={qLoading}
            emptyMessage="No questions in library yet."
            selectable
            selectedIds={selectedQIds}
            onSelectionChange={setSelectedQIds}
          />
        )}
        {tab === 'options' && (
          <DataTable
            columns={oColumns}
            data={oItems}
            pagination={oData?.pagination}
            onPageChange={setOptPage}
            loading={oLoading}
            emptyMessage="No options yet."
            selectable
            selectedIds={selectedOIds}
            onSelectionChange={setSelectedOIds}
          />
        )}
        {tab === 'sections' && (
          <DataTable
            columns={sColumns}
            data={sItems}
            pagination={sData?.pagination}
            onPageChange={setSecPage}
            loading={sLoading}
            emptyMessage="No sections yet."
            selectable
            selectedIds={selectedSIds}
            onSelectionChange={setSelectedSIds}
          />
        )}
      </div>

      {/* ── Single-item modals ── */}
      <CreateQuestionModal open={showCreateQ} onClose={() => setShowCreateQ(false)} />
      <CreateOptionModal   open={showCreateO} onClose={() => setShowCreateO(false)} />
      <CreateSectionModal  open={showCreateS} onClose={() => setShowCreateS(false)} />
      <LibraryCsvImportModal open={showImportQ} onClose={() => setShowImportQ(false)} />

      <EditQuestionModal question={editQuestion} onClose={() => setEditQuestion(null)} />
      <EditOptionModal   option={editOption}     onClose={() => setEditOption(null)} />
      <EditSectionModal  section={editSection}   onClose={() => setEditSection(null)} />

      {/* Single delete */}
      <ConfirmDialog open={!!deleteQuestion} onClose={() => setDeleteQuestion(null)}
        onConfirm={() => deleteQ(deleteQuestion?.questionId, { onSuccess: () => setDeleteQuestion(null) })}
        loading={deletingQ} title="Delete Question" variant="danger" confirmLabel="Delete"
        message={`Delete "${deleteQuestion?.questionText?.slice(0, 70)}"? All option and section mappings will be removed.`}
      />
      <ConfirmDialog open={!!deleteOption} onClose={() => setDeleteOption(null)}
        onConfirm={() => deleteO(deleteOption?.optionId, { onSuccess: () => setDeleteOption(null) })}
        loading={deletingO} title="Delete Option" variant="danger" confirmLabel="Delete"
        message={`Delete option "${deleteOption?.optionValue}"? All question mappings will be removed.`}
      />
      <ConfirmDialog open={!!deleteSection} onClose={() => setDeleteSection(null)}
        onConfirm={() => deleteS(deleteSection?.sectionId, { onSuccess: () => setDeleteSection(null) })}
        loading={deletingS} title="Delete Section" variant="danger" confirmLabel="Delete"
        message={`Delete section "${deleteSection?.name}"? All template and question mappings will be removed.`}
      />

      {/* Bulk delete */}
      <ConfirmDialog open={showBulkDeleteQ} onClose={() => setShowBulkDeleteQ(false)}
        onConfirm={() => bulkDeleteQ(selectedQIds, { onSuccess: () => { setShowBulkDeleteQ(false); setSelectedQIds([]) } })}
        loading={bulkDeletingQ}
        title={`Delete ${selectedQIds.length} Questions`}
        variant="danger" confirmLabel="Delete All"
        message={`Permanently delete ${selectedQIds.length} selected question(s)? All option and section mappings will be removed. This cannot be undone.`}
      />
      <ConfirmDialog open={showBulkDeleteO} onClose={() => setShowBulkDeleteO(false)}
        onConfirm={() => bulkDeleteO(selectedOIds, { onSuccess: () => { setShowBulkDeleteO(false); setSelectedOIds([]) } })}
        loading={bulkDeletingO}
        title={`Delete ${selectedOIds.length} Options`}
        variant="danger" confirmLabel="Delete All"
        message={`Permanently delete ${selectedOIds.length} selected option(s)? All question mappings will be removed. This cannot be undone.`}
      />
      <ConfirmDialog open={showBulkDeleteS} onClose={() => setShowBulkDeleteS(false)}
        onConfirm={() => bulkDeleteS(selectedSIds, { onSuccess: () => { setShowBulkDeleteS(false); setSelectedSIds([]) } })}
        loading={bulkDeletingS}
        title={`Delete ${selectedSIds.length} Sections`}
        variant="danger" confirmLabel="Delete All"
        message={`Permanently delete ${selectedSIds.length} selected section(s)? All template and question mappings will be removed. This cannot be undone.`}
      />
    </PageLayout>
  )
}

// ─── Create Question Modal ────────────────────────────────────────────────────
function CreateQuestionModal({ open, onClose }) {
  const { mutate: create, isPending } = useCreateQuestion()
  const { data: oData }               = useAllOptions()
  const [form, setForm]               = useState({ questionText: '', responseType: '', questionTag: '' })
  const [selectedOpts, setSelectedOpts] = useState([])
  const [errors, setErrors]           = useState({})
  const allOptions   = oData?.items || []
  const needsOptions = ['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(form.responseType)

  const validate = () => {
    const e = {}
    if (!form.questionText.trim()) e.questionText = 'Required'
    if (!form.responseType)        e.responseType  = 'Required'
    if (needsOptions && selectedOpts.length === 0) e.options = 'Select at least one option'
    setErrors(e); return Object.keys(e).length === 0
  }
  const handleSubmit = () => {
    if (!validate()) return
    create(
      { questionText: form.questionText, responseType: form.responseType, questionTag: form.questionTag.trim().toUpperCase() || null, optionIds: selectedOpts },
      { onSuccess: () => { onClose(); setForm({ questionText: '', responseType: '' }); setSelectedOpts([]) } }
    )
  }
  return (
    <Modal open={open} onClose={onClose} title="Add Library Question" size="lg"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={handleSubmit}>Save Question</Button>
      </div>}>
      <QuestionForm form={form} setForm={setForm} errors={errors}
        allOptions={allOptions} selectedOpts={selectedOpts}
        setSelectedOpts={setSelectedOpts} needsOptions={needsOptions} />
    </Modal>
  )
}

// ─── Edit Question Modal ──────────────────────────────────────────────────────
function EditQuestionModal({ question, onClose }) {
  const { mutate: update, isPending } = useUpdateQuestion()
  const { data: oData }               = useAllOptions()
  const { data: linkedOpts }          = useQuestionLinkedOptions(question?.questionId)
  const [form, setForm]               = useState({ questionText: '', responseType: '', questionTag: '' })
  const [selectedOpts, setSelectedOpts] = useState([])
  const [errors, setErrors]           = useState({})
  const prevId = useRef(null)

  const allOptions   = oData?.items || []
  const needsOptions = ['SINGLE_CHOICE', 'MULTI_CHOICE'].includes(form.responseType)

  if (question && question.questionId !== prevId.current) {
    prevId.current = question.questionId
    setForm({ questionText: question.questionText, responseType: question.responseType, questionTag: question.questionTag || '' })
    setSelectedOpts([])
    setErrors({})
  }
  // Populate selected options once the linked-options query returns
  if (linkedOpts && question && prevId.current === question.questionId
      && selectedOpts.length === 0 && linkedOpts.length > 0) {
    setSelectedOpts(linkedOpts.map(o => o.optionId))
  }

  const validate = () => {
    const e = {}
    if (!form.questionText.trim()) e.questionText = 'Required'
    if (!form.responseType)        e.responseType  = 'Required'
    if (needsOptions && selectedOpts.length === 0) e.options = 'Select at least one option'
    setErrors(e); return Object.keys(e).length === 0
  }
  const handleSubmit = () => {
    if (!validate()) return
    update(
      { id: question.questionId, data: { questionText: form.questionText, responseType: form.responseType, questionTag: form.questionTag.trim().toUpperCase() || null, optionIds: selectedOpts } },
      { onSuccess: () => { onClose(); setSelectedOpts([]) } }
    )
  }

  if (!question) return null
  return (
    <Modal open={!!question} onClose={onClose} title="Edit Question" size="lg"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={handleSubmit}>Save Changes</Button>
      </div>}>
      <QuestionForm form={form} setForm={setForm} errors={errors}
        allOptions={allOptions} selectedOpts={selectedOpts}
        setSelectedOpts={setSelectedOpts} needsOptions={needsOptions} />
    </Modal>
  )
}

// ─── Shared Question Form ─────────────────────────────────────────────────────
function QuestionForm({ form, setForm, errors, allOptions, selectedOpts, setSelectedOpts, needsOptions }) {
  const toggleOpt = (id) =>
    setSelectedOpts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Question Text</label>
        <textarea rows={3} value={form.questionText}
          onChange={e => setForm(f => ({ ...f, questionText: e.target.value }))}
          placeholder="Enter the question to ask vendors…"
          className={cn(
            'w-full rounded-md border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-500',
            errors.questionText ? 'border-red-500/50' : 'border-border'
          )} />
        {errors.questionText && <p className="text-xs text-red-400 mt-1">{errors.questionText}</p>}
      </div>
      <div>
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">
          Guard Tag <span className="text-text-muted font-normal normal-case">(KashiGuard category — optional)</span>
        </label>
        <input
          list="q-tag-suggestions"
          value={form.questionTag || ''}
          onChange={e => setForm(f => ({ ...f, questionTag: e.target.value.toUpperCase() }))}
          placeholder="e.g. MFA, ENCRYPTION, IRP…"
          className="w-full h-9 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
        />
        <datalist id="q-tag-suggestions">
          {['MFA','ENCRYPTION','PEN_TEST','DATA_RETENTION','DPA','IRP','BCP','DRP',
            'CERTIFICATION','VULN_MGMT','SEC_TRAINING','CISO','BREACH_NOTIFY',
            'SUBPROCESSOR','INFOSEC_POLICY'].map(t => <option key={t} value={t} />)}
        </datalist>
        <p className="text-[10px] text-text-muted mt-1">
          Tag links this question to KashiGuard rules. Leave blank to exclude from guard evaluation.
          Changing the tag on an existing question does not affect running assessment instances.
        </p>
      </div>
      <Select label="Response Type" value={form.responseType}
        onChange={e => setForm(f => ({ ...f, responseType: e.target.value }))}
        options={RESPONSE_TYPES} placeholder="Select response type…" error={errors.responseType} />
      {needsOptions && (
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-2">
            Link Options <span className="text-text-muted font-normal">(select from library — stored as join table)</span>
          </label>
          {errors.options && <p className="text-xs text-red-400 mb-2">{errors.options}</p>}
          {allOptions.length === 0
            ? <p className="text-xs text-text-muted p-3 bg-surface-overlay rounded-md">No options in library yet. Create options first in the Options tab.</p>
            : (
              <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {allOptions.map(opt => (
                  <label key={opt.optionId} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-overlay cursor-pointer">
                    <input type="checkbox" checked={selectedOpts.includes(opt.optionId)}
                      onChange={() => toggleOpt(opt.optionId)}
                      className="rounded border-border accent-brand-500" />
                    <span className="flex-1 text-sm text-text-primary">{opt.optionValue}</span>
                    {opt.score != null
                      ? <span className="text-xs font-mono text-text-muted">{opt.score} pts</span>
                      : <span className="text-[10px] font-mono text-red-400/70">no score</span>
                    }
                  </label>
                ))}
              </div>
            )
          }
        </div>
      )}
    </div>
  )
}

// ─── Create / Edit Option Modals ──────────────────────────────────────────────
function CreateOptionModal({ open, onClose }) {
  const { mutate: create, isPending } = useCreateOption()
  const [form, setForm]   = useState({ optionValue: '', score: '' })
  const [errors, setErrors] = useState({})

  const handleSubmit = () => {
    const e = {}
    if (!form.optionValue.trim()) e.optionValue = 'Required'
    setErrors(e); if (Object.keys(e).length) return
    create(
      { optionValue: form.optionValue, score: form.score !== '' ? parseFloat(form.score) : null },
      { onSuccess: () => { onClose(); setForm({ optionValue: '', score: '' }) } }
    )
  }
  return (
    <Modal open={open} onClose={onClose} title="Add Response Option" size="sm"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={handleSubmit}>Save Option</Button>
      </div>}>
      <OptionForm form={form} setForm={setForm} errors={errors} />
    </Modal>
  )
}

function EditOptionModal({ option, onClose }) {
  const { mutate: update, isPending } = useUpdateOption()
  const [form, setForm]   = useState({ optionValue: '', score: '' })
  const [errors, setErrors] = useState({})
  const prevId = useRef(null)

  if (option && option.optionId !== prevId.current) {
    prevId.current = option.optionId
    setForm({ optionValue: option.optionValue, score: String(option.score ?? '') })
    setErrors({})
  }
  const handleSubmit = () => {
    const e = {}
    if (!form.optionValue.trim()) e.optionValue = 'Required'
    setErrors(e); if (Object.keys(e).length) return
    update(
      { id: option.optionId, data: { optionValue: form.optionValue, score: form.score !== '' ? parseFloat(form.score) : null } },
      { onSuccess: onClose }
    )
  }
  if (!option) return null
  return (
    <Modal open={!!option} onClose={onClose} title="Edit Option" size="sm"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={handleSubmit}>Save Changes</Button>
      </div>}>
      <OptionForm form={form} setForm={setForm} errors={errors} />
    </Modal>
  )
}

function OptionForm({ form, setForm, errors }) {
  return (
    <div className="flex flex-col gap-4">
      <Input label="Option Value" value={form.optionValue}
        onChange={e => setForm(f => ({ ...f, optionValue: e.target.value }))}
        placeholder="e.g. Yes — fully compliant" error={errors.optionValue} />
      <Input label="Score" type="number" value={form.score}
        onChange={e => setForm(f => ({ ...f, score: e.target.value }))}
        placeholder="e.g. 10, 6, 3, 0 — leave blank to leave unscored" />
      <p className="text-[10px] text-text-muted -mt-2">
        Typical scale: 10 = fully compliant · 6 = partial · 3 = ad-hoc · 0 = none.
        Blank = unscored (guard system will flag this option as SCORE_NOT_SET).
      </p>
    </div>
  )
}

// ─── Create / Edit Section Modals ─────────────────────────────────────────────
function CreateSectionModal({ open, onClose }) {
  const { mutate: create, isPending } = useCreateSection()
  const [name, setName]   = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    if (!name.trim()) { setError('Required'); return }
    create({ name }, { onSuccess: () => { onClose(); setName('') } })
  }
  return (
    <Modal open={open} onClose={onClose} title="Add Library Section" size="sm"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={handleSubmit}>Save Section</Button>
      </div>}>
      <div className="flex flex-col gap-3">
        <Input label="Section Name" value={name}
          onChange={e => { setName(e.target.value); setError('') }}
          placeholder="e.g. Information Security Governance" error={error} />
        <p className="text-xs text-text-muted">
          Sections are reusable library items. Map them into templates via the Template Builder.
        </p>
      </div>
    </Modal>
  )
}

function EditSectionModal({ section, onClose }) {
  const { mutate: update, isPending } = useUpdateSection()
  const [name, setName]   = useState('')
  const [error, setError] = useState('')
  const prevId = useRef(null)

  if (section && section.sectionId !== prevId.current) {
    prevId.current = section.sectionId
    setName(section.name || '')
    setError('')
  }
  const handleSubmit = () => {
    if (!name.trim()) { setError('Required'); return }
    update({ id: section.sectionId, data: { name } }, { onSuccess: onClose })
  }
  if (!section) return null
  return (
    <Modal open={!!section} onClose={onClose} title="Edit Section" size="sm"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={handleSubmit}>Save Changes</Button>
      </div>}>
      <Input label="Section Name" value={name}
        onChange={e => { setName(e.target.value); setError('') }}
        placeholder="e.g. Information Security Governance" error={error} />
    </Modal>
  )
}

// ─── Library CSV Import Modal (server-side) ───────────────────────────────────
function LibraryCsvImportModal({ open, onClose }) {
  const qc      = useQueryClient()
  const fileRef = useRef(null)
  const [stage, setStage]           = useState('upload')
  const [result, setResult]         = useState(null)
  const [dragOver, setDragOver]     = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

  const reset       = () => { setStage('upload'); setResult(null); setSelectedFile(null) }
  const handleClose = () => { reset(); onClose() }

  const handleFile = (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) { toast.error('Please select a .csv file'); return }
    setSelectedFile(file)
  }
  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0])
  }, [])

  const runImport = async () => {
    if (!selectedFile) return
    setStage('importing')
    try {
      const res = await assessmentsApi.library.questions.importCsv(selectedFile)
      setResult(res)
      qc.invalidateQueries({ queryKey: ['library-questions'] })
      qc.invalidateQueries({ queryKey: ['library-options'] })
      setStage('done')
    } catch (err) {
      setResult({ fatalError: true, summary: err?.message || 'Import failed', log: [], successCount: 0, failureCount: 0 })
      setStage('done')
    }
  }

  return (
    <Modal open={open} onClose={stage === 'importing' ? undefined : handleClose}
      title="Import Questions from CSV"
      subtitle="Flat format — parsed server-side via OpenCSV"
      size="lg">

      {stage === 'upload' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-surface-overlay border-b border-border">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-text-muted" />
                <span className="text-xs font-semibold text-text-secondary">
                  Flat CSV format (questions + options per row)
                </span>
              </div>
              <Button variant="secondary" size="xs" icon={Download} onClick={downloadQuestionTemplate}>
                Example
              </Button>
            </div>
            <pre className="px-4 py-3 text-[10px] font-mono text-text-muted overflow-x-auto">
{`questionText, responseType, optionValue1, score1, optionValue2, score2, ...
"Do you have SOC 2?", SINGLE_CHOICE, "Yes — certified", 10, "No", 0
"Describe your DR plan.", TEXT`}
            </pre>
            <p className="px-4 py-2 bg-surface-overlay border-t border-border text-[10px] text-text-muted">
              Up to 8 option pairs per row. TEXT and FILE_UPLOAD need no options. Parsed server-side.
            </p>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors',
              selectedFile ? 'border-green-500/40 bg-green-500/5'
                : dragOver ? 'border-brand-500 bg-brand-500/5'
                : 'border-border hover:border-border-subtle hover:bg-surface-overlay'
            )}>
            <div className="w-12 h-12 rounded-xl bg-surface-overlay flex items-center justify-center">
              {selectedFile
                ? <CheckCircle2 size={22} className="text-green-400" />
                : <Upload size={22} className="text-text-muted" />}
            </div>
            <div className="text-center">
              {selectedFile
                ? <><p className="text-sm font-medium text-green-400">{selectedFile.name}</p>
                    <p className="text-xs text-text-muted mt-1">Click to choose a different file</p></>
                : <><p className="text-sm font-medium text-text-primary">Drop CSV here, or click to browse</p>
                    <p className="text-xs text-text-muted mt-1">.csv only</p></>}
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

      {stage === 'importing' && (
        <div className="flex flex-col items-center gap-6 py-8">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center">
            <Loader2 size={28} className="text-brand-400 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-text-primary">Importing on server…</p>
            <p className="text-xs text-text-muted mt-1">
              OpenCSV is parsing your file and creating library entities.
            </p>
          </div>
          <p className="text-xs text-text-muted">Please don't close this window</p>
        </div>
      )}

      {stage === 'done' && result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
              result.fatalError || result.failureCount > 0 ? 'bg-amber-500/10' : 'bg-green-500/10'
            )}>
              {result.fatalError || result.failureCount > 0
                ? <AlertCircle size={22} className="text-amber-400" />
                : <CheckCircle2 size={22} className="text-green-400" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {result.fatalError ? 'Import failed'
                  : result.failureCount > 0 ? `Completed with ${result.failureCount} issues`
                  : 'Import successful'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{result.summary}</p>
            </div>
          </div>

          {!result.fatalError && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total rows', value: result.totalRows,    color: 'text-text-secondary' },
                { label: 'Succeeded',  value: result.successCount, color: 'text-green-400' },
                { label: 'Failed',     value: result.failureCount, color: result.failureCount ? 'text-red-400' : 'text-text-muted' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-3 bg-surface-overlay rounded-lg border border-border text-center">
                  <p className={cn('text-xl font-bold font-mono', color)}>{value}</p>
                  <p className="text-xs text-text-muted mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}

          {result.log?.length > 0 && (
            <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-surface-overlay p-3 flex flex-col gap-0.5 font-mono text-xs">
              {result.log.map((entry, i) => (
                <div key={i} className={cn(
                  'flex items-start gap-2',
                  entry.status === 'SUCCESS' && 'text-text-secondary',
                  entry.status === 'ERROR'   && 'text-red-400',
                  entry.status === 'WARNING' && 'text-amber-400',
                  entry.status === 'INFO'    && 'text-brand-400'
                )}>
                  {entry.status === 'SUCCESS' && <CheckCircle2 size={11} className="mt-0.5 shrink-0" />}
                  {entry.status === 'ERROR'   && <XCircle size={11} className="mt-0.5 shrink-0" />}
                  {(entry.status === 'WARNING' || entry.status === 'INFO') && <span className="shrink-0 mt-0.5">›</span>}
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={reset}>Import More</Button>
            <Button size="sm" onClick={handleClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}