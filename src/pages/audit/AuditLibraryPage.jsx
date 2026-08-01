/**
 * AuditLibraryPage — /admin/audit/library
 *
 * Full audit library management. Direct equivalent of QuestionLibraryPage.
 *
 * TABS:
 *   Controls  — reusable audit controls (≡ Questions in TPRM)
 *               searchable, filterable by test type and framework, bulk delete,
 *               create/edit modal, CSV import, guard tag display
 *
 *   Sections  — reusable section tree nodes (≡ Sections in TPRM, but tree-aware)
 *               shows depth/parentage, move-to-parent, create child inline
 *               tree view toggle: flat list ↔ nested tree
 *
 *   Templates — audit templates with publish/unpublish, section mapping,
 *               full structure preview, CSV import
 *               (≡ AssessmentTemplatesPage combined here for cohesion)
 *
 * IMPORTANT DIFFERENCES FROM QUESTION LIBRARY:
 *   - Controls have controlCode, testType, controlTag (not questionTag)
 *   - Sections have parentId / path / depth (recursive tree, not flat list)
 *   - Templates map ROOT sections only (not every section node)
 *   - CSV import supports TEMPLATE/SECTION(level)/CONTROL rows (not TEMPLATE/SECTION/QUESTION/OPTION)
 */
import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, RefreshCw, Upload, Download, Shield,
  Layers, LayoutTemplate, Pencil, Trash2, ChevronDown,
  ChevronRight, Tag, FolderTree, BookOpen, Globe, Lock,
  ArrowRight, Move,
} from 'lucide-react'
import { auditApi }    from '../../api/audit.api'
import { PageLayout }  from '../../components/layout/PageLayout'
import { DataTable }   from '../../components/ui/DataTable'
import { Button }      from '../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { Badge }       from '../../components/ui/Badge'
import { EmptyState }  from '../../components/ui/EmptyState'
import { cn }          from '../../lib/cn'
import { useSelector } from 'react-redux'
import { selectAuth }  from '../../store/slices/authSlice'
import toast           from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_TYPES = [
  { value: 'DOCUMENT_REVIEW', label: 'Document review' },
  { value: 'INTERVIEW',       label: 'Interview' },
  { value: 'OBSERVATION',     label: 'Observation' },
  { value: 'TECHNICAL_TEST',  label: 'Technical test' },
  { value: 'WALKTHROUGH',     label: 'Walkthrough' },
]

const TEST_TYPE_COLOR = {
  DOCUMENT_REVIEW: 'blue',
  INTERVIEW:       'purple',
  OBSERVATION:     'teal',
  TECHNICAL_TEST:  'amber',
  WALKTHROUGH:     'gray',
}

const AUDIT_TYPES = [
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'EXTERNAL', label: 'External' },
]

const TABS = [
  { key: 'controls',  label: 'Controls',  icon: Shield },
  { key: 'sections',  label: 'Sections',  icon: Layers },
  { key: 'templates', label: 'Templates', icon: LayoutTemplate },
]

// CSV download template — helps users understand the format before importing
const CONTROL_CSV_TEMPLATE =
`type,level,name,description,section_code,control_code,framework_ref,test_type,control_tag,weight,is_mandatory
TEMPLATE,,"ISO 27001 Internal Audit",,,,ISO 27001,INTERNAL,,
SECTION,0,"A — Organisational controls",,A,,ISO 27001,,,,
SECTION,1,"A.5 — Policies for information security",,A.5,,ISO 27001,,,,
SECTION,2,"A.5.1 — Policies for information security",,A.5.1,,ISO 27001,,,,
CONTROL,,,"Information security policy","Review and approval process",A.5.1.1,ISO 27001,DOCUMENT_REVIEW,INFOSEC_POLICY,1.0,true
CONTROL,,,"Review of policies","Evidence of periodic review",A.5.1.2,ISO 27001,DOCUMENT_REVIEW,INFOSEC_POLICY,1.0,true
SECTION,1,"A.6 — Organisation of information security",,A.6,,ISO 27001,,,,
SECTION,0,"B — People controls",,B,,ISO 27001,,,,`

function downloadCsvTemplate() {
  const blob = new Blob([CONTROL_CSV_TEMPLATE], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'audit_library_import.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ─── API hooks ─────────────────────────────────────────────────────────────────

const useControls = (params) => useQuery({
  queryKey: ['audit-library-controls', params],
  queryFn:  () => auditApi.library.controls.list(params),
  keepPreviousData: true,
})

const useSections = (params) => useQuery({
  queryKey: ['audit-library-sections', params],
  queryFn:  () => auditApi.library.sections.listRoots(params),
  keepPreviousData: true,
})

const useTemplates = (params) => useQuery({
  queryKey: ['audit-library-templates', params],
  queryFn:  () => auditApi.library.templates.list(params),
  keepPreviousData: true,
})

const useFullTemplate = (id) => useQuery({
  queryKey: ['audit-library-template-full', id],
  queryFn:  ({ signal }) => auditApi.library.templates.full(id, signal),
  enabled:  !!id,
})

const useSectionChildren = (parentId) => useQuery({
  queryKey: ['audit-section-children', parentId],
  queryFn:  () => auditApi.library.sections.listChildren(parentId),
  enabled:  !!parentId,
})

// ── Mutations ────────────────────────────────────────────────────────────────

function makeControlMutations() {
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ['audit-library-controls'] })
  return {
    create: useMutation({ mutationFn: auditApi.library.controls.create, onSuccess: inv, onError: () => toast.error('Failed') }),
    update: useMutation({ mutationFn: ({ id, data }) => auditApi.library.controls.update(id, data), onSuccess: () => { inv(); toast.success('Control updated') }, onError: () => toast.error('Failed') }),
    del:    useMutation({ mutationFn: (id) => auditApi.library.controls.delete(id), onSuccess: () => { inv(); toast.success('Control deleted') }, onError: () => toast.error('Failed') }),
  }
}

function makeSectionMutations() {
  const qc = useQueryClient()
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['audit-library-sections'] })
    qc.invalidateQueries({ queryKey: ['audit-section-children'] })
  }
  return {
    create: useMutation({ mutationFn: auditApi.library.sections.create, onSuccess: inv, onError: () => toast.error('Failed') }),
    update: useMutation({ mutationFn: ({ id, data }) => auditApi.library.sections.update(id, data), onSuccess: () => { inv(); toast.success('Section updated') }, onError: () => toast.error('Failed') }),
    del:    useMutation({ mutationFn: (id) => auditApi.library.sections.delete(id), onSuccess: () => { inv(); toast.success('Section deleted') }, onError: () => toast.error('Failed') }),
    move:   useMutation({ mutationFn: ({ id, newParentId }) => auditApi.library.sections.move(id, newParentId), onSuccess: () => { inv(); toast.success('Section moved') }, onError: () => toast.error('Move failed') }),
  }
}

function makeTemplateMutations() {
  const qc = useQueryClient()
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['audit-library-templates'] })
    qc.invalidateQueries({ queryKey: ['audit-library-template-full'] })
  }
  return {
    create:    useMutation({ mutationFn: auditApi.library.templates.create, onSuccess: inv }),
    update:    useMutation({ mutationFn: ({ id, data }) => auditApi.library.templates.update(id, data), onSuccess: () => { inv(); toast.success('Template updated') } }),
    del:       useMutation({ mutationFn: (id) => auditApi.library.templates.delete(id), onSuccess: () => { inv(); toast.success('Deleted') }, onError: e => toast.error(e?.message || 'Failed') }),
    publish:   useMutation({ mutationFn: (id) => auditApi.library.templates.publish(id), onSuccess: () => { inv(); toast.success('Published') } }),
    unpublish: useMutation({ mutationFn: (id) => auditApi.library.templates.unpublish(id), onSuccess: () => { inv(); toast.success('Unpublished — now DRAFT') } }),
    importCsv: useMutation({ mutationFn: (file) => auditApi.library.templates.importCsv(file), onSuccess: inv }),
  }
}

// ─── Guard tag badge (same visual as question library) ────────────────────────

const GuardTagBadge = ({ tag }) => tag
  ? <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] bg-brand-500/10 text-brand-ink border border-brand-500/20">{tag}</span>
  : <span className="text-[10px] text-text-muted italic">—</span>

// ─── Inline row action buttons ─────────────────────────────────────────────────

const RowActions = ({ onEdit, onDelete }) => (
  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
    <button onClick={onEdit} title="Edit"
      className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
      <Pencil size={12} />
    </button>
    <button onClick={onDelete} title="Delete"
      className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors">
      <Trash2 size={12} />
    </button>
  </div>
)

// ─── Control form ─────────────────────────────────────────────────────────────

function ControlForm({ initial, onSubmit, loading }) {
  const [form, setForm] = useState({
    name: '', description: '', controlCode: '', frameworkRef: '',
    testType: 'DOCUMENT_REVIEW', controlTag: '',
    ...(initial ?? {}),
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs text-text-secondary mb-1">Control name *</label>
        <input value={form.name} onChange={e => set('name', e.target.value)}
          placeholder="e.g. User access management"
          className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Control code</label>
          <input value={form.controlCode} onChange={e => set('controlCode', e.target.value)}
            placeholder="e.g. A.9.1.1, CC6.1, AC-1"
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
          <input value={form.frameworkRef} onChange={e => set('frameworkRef', e.target.value)}
            placeholder="e.g. ISO 27001, SOC 2"
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Test type</label>
          <select value={form.testType} onChange={e => set('testType', e.target.value)}
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">
            Guard tag
            <span className="ml-1 text-text-muted font-normal">(KashiGuard rule matching)</span>
          </label>
          <input value={form.controlTag} onChange={e => set('controlTag', e.target.value.toUpperCase())}
            placeholder="e.g. ENCRYPTION_AT_REST, MFA"
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          <p className="text-[10px] text-text-muted mt-1">
            Snapshotted at engagement creation. One rule covers all controls with this tag.
          </p>
        </div>
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
          placeholder="What this control tests and what evidence is expected"
          className="w-full px-3 py-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <Button variant="primary" onClick={() => onSubmit(form)} loading={loading} disabled={!form.name.trim()}>
        {initial ? 'Update control' : 'Add control'}
      </Button>
    </div>
  )
}

// ─── Section form ─────────────────────────────────────────────────────────────

function SectionForm({ initial, allRootSections, onSubmit, loading }) {
  const [form, setForm] = useState({
    name: '', description: '', sectionCode: '', frameworkRef: '', parentId: null,
    ...(initial ?? {}),
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs text-text-secondary mb-1">Section name *</label>
        <input value={form.name} onChange={e => set('name', e.target.value)}
          placeholder="e.g. A.9 — Access Control"
          className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Section code</label>
          <input value={form.sectionCode} onChange={e => set('sectionCode', e.target.value)}
            placeholder="e.g. A.9, CC6, PR.AC"
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
          <input value={form.frameworkRef} onChange={e => set('frameworkRef', e.target.value)}
            placeholder="e.g. ISO 27001"
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Parent section
          <span className="ml-1 text-text-muted font-normal">(leave blank for top-level)</span>
        </label>
        <select value={form.parentId ?? ''} onChange={e => set('parentId', e.target.value || null)}
          className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
          <option value="">— Top-level section —</option>
          {(allRootSections ?? []).map(s => (
            <option key={s.id} value={s.id}>
              {s.sectionCode ? `${s.sectionCode} — ${s.name}` : s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
          className="w-full px-3 py-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <Button variant="primary" onClick={() => onSubmit(form)} loading={loading} disabled={!form.name.trim()}>
        {initial ? 'Update section' : 'Add section'}
      </Button>
    </div>
  )
}

// ─── Section tree node (for the tree view in Sections tab) ────────────────────

function SectionTreeRow({ section, depth, onEdit, onDelete, onAddChild }) {
  const [open, setOpen] = useState(depth < 1)
  const { data: children } = useSectionChildren(open ? section.id : null)

  return (
    <>
      <tr className="border-b border-border hover:bg-surface-overlay transition-colors">
        <td className="py-2 pr-3" style={{ paddingLeft: `${16 + depth * 20}px` }}>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setOpen(o => !o)} className="text-text-muted hover:text-text-primary">
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            <div>
              <div className="flex items-center gap-1.5">
                {section.sectionCode && (
                  <span className="font-mono text-[10px] text-text-muted">{section.sectionCode}</span>
                )}
                <span className={cn('text-sm', depth === 0 && 'font-medium')}>{section.name}</span>
                {section.tenantId === null && (
                  <Globe size={11} className="text-text-muted" title="Global section" />
                )}
              </div>
              {section.frameworkRef && (
                <span className="text-[10px] text-text-muted">{section.frameworkRef}</span>
              )}
            </div>
          </div>
        </td>
        <td className="py-2 text-xs text-text-muted font-mono">depth {section.depth}</td>
        <td className="py-2">
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <button onClick={() => onAddChild(section)} title="Add child section"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-ink hover:bg-brand-500/10 transition-colors">
              <Plus size={12} />
            </button>
            <button onClick={() => onEdit(section)} title="Edit"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
              <Pencil size={12} />
            </button>
            <button onClick={() => onDelete(section)} title="Delete"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>
      {open && children?.map(child => (
        <SectionTreeRow key={child.id} section={child} depth={depth + 1}
          onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} />
      ))}
    </>
  )
}

// ─── CSV import result display ─────────────────────────────────────────────────

function CsvResultModal({ result, onClose }) {
  if (!result) return null
  const errors  = result.rows?.filter(r => r.status === 'ERROR')   ?? []
  const skipped = result.rows?.filter(r => r.status === 'SKIPPED') ?? []
  const ok      = result.rows?.filter(r => r.status === 'OK')      ?? []
  return (
    <Modal open={!!result} onClose={onClose} title="Import result">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">{result.summary}</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-card border border-border p-3 text-center">
            <div className="text-xl font-medium text-status-pass-fg">{ok.length}</div>
            <div className="text-xs text-text-muted">Imported</div>
          </div>
          <div className="rounded-card border border-border p-3 text-center">
            <div className="text-xl font-medium text-status-warn-fg">{skipped.length}</div>
            <div className="text-xs text-text-muted">Skipped</div>
          </div>
          <div className="rounded-card border border-border p-3 text-center">
            <div className="text-xl font-medium text-status-fail-fg">{errors.length}</div>
            <div className="text-xs text-text-muted">Errors</div>
          </div>
        </div>
        {[...errors, ...skipped].length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-card border border-border bg-surface-overlay text-xs font-mono">
            {[...errors, ...skipped].map((row, i) => (
              <div key={i} className={cn('px-3 py-1 border-b border-border last:border-0 flex gap-2 flex-wrap',
                row.status === 'ERROR' ? 'text-status-fail-fg' : 'text-status-warn-fg')}>
                <span className="shrink-0">Row {row.rowNum}</span>
                <span className="shrink-0">[{row.type}]</span>
                <span className="shrink-0">{row.name}</span>
                {row.message && <span className="text-text-muted">— {row.message}</span>}
              </div>
            ))}
          </div>
        )}
        <Button variant="primary" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

// ─── Template full-structure preview modal ────────────────────────────────────

function TemplatePreviewModal({ templateId, onClose }) {
  const { data, isLoading } = useFullTemplate(templateId)

  function TreeNode({ node, depth = 0 }) {
    const [open, setOpen] = useState(depth < 2)
    const hasChildren = node.children?.length > 0
    const hasControls = node.controls?.length > 0
    return (
      <div>
        <div className="flex items-start gap-1.5 py-1 hover:bg-surface-overlay rounded px-2 cursor-pointer"
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => setOpen(o => !o)}>
          <span className="shrink-0 text-text-muted mt-0.5">
            {(hasChildren || hasControls) ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3 block" />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {node.section.sectionCode && <span className="font-mono text-[10px] text-text-muted">{node.section.sectionCode}</span>}
              <span className={cn('text-sm', depth === 0 && 'font-medium')}>{node.section.name}</span>
            </div>
          </div>
        </div>
        {open && (
          <>
            {hasControls && node.controls.map(ctrl => (
              <div key={ctrl.id} className="flex items-start gap-2 py-0.5"
                style={{ paddingLeft: `${22 + depth * 14}px` }}>
                <Shield size={11} className="text-text-muted mt-0.5 shrink-0" />
                <div>
                  <div className="flex items-center gap-1.5">
                    {ctrl.controlCode && <span className="font-mono text-[10px] text-text-muted">{ctrl.controlCode}</span>}
                    <span className="text-xs text-text-secondary">{ctrl.name}</span>
                    {ctrl.controlTag && <GuardTagBadge tag={ctrl.controlTag} />}
                  </div>
                </div>
              </div>
            ))}
            {hasChildren && node.children.map(child => (
              <TreeNode key={child.section.id} node={child} depth={depth + 1} />
            ))}
          </>
        )}
      </div>
    )
  }

  return (
    <Modal open={!!templateId} onClose={onClose} title="Template structure" wide>
      {isLoading ? (
        <div className="flex flex-col gap-2 py-4">
          {[1,2,3].map(i => <div key={i} className="h-8 rounded bg-surface-overlay animate-pulse" />)}
        </div>
      ) : !data?.rootSections?.length ? (
        <p className="text-sm text-text-muted py-4">No sections mapped to this template yet.</p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
          <div className="text-xs text-text-muted mb-2">
            {data.template?.name} · {data.rootSections.length} root sections
          </div>
          {data.rootSections.map(node => <TreeNode key={node.section.id} node={node} />)}
        </div>
      )}
    </Modal>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AuditLibraryPage() {
  const auth    = useSelector(selectAuth)
  const fileRef = useRef(null)

  const [tab, setTab]     = useState('controls')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage]   = useState(1)
  const [secPage, setSecPage] = useState(1)
  const [tplPage, setTplPage] = useState(1)

  // Modals
  const [showCreateC, setShowCreateC] = useState(false)
  const [showCreateS, setShowCreateS] = useState(false)
  const [showCreateT, setShowCreateT] = useState(false)
  const [editControl, setEditControl]   = useState(null)
  const [editSection, setEditSection]   = useState(null)
  const [previewId, setPreview]         = useState(null)
  const [addChildTo, setAddChildTo]     = useState(null)
  const [deleteControl, setDeleteControl] = useState(null)
  const [deleteSection, setDeleteSection] = useState(null)
  const [deleteTemplate, setDeleteTemplate] = useState(null)
  const [importResult, setImportResult] = useState(null)

  // Selections (for bulk delete — controls and templates, not sections due to tree)
  const [selectedCIds, setSelectedCIds] = useState([])
  const [selectedTIds, setSelectedTIds] = useState([])

  // Mutations
  const CM = makeControlMutations()
  const SM = makeSectionMutations()
  const TM = makeTemplateMutations()

  // Data params
  const cParams = { skip: (page - 1) * 50, take: 50,
    ...(search     ? { search: `name=${search}` }      : {}),
    ...(typeFilter ? { filterby: `testtype=${typeFilter}` } : {}),
  }
  const sParams = { skip: (secPage - 1) * 50, take: 50,
    ...(search ? { search: `name=${search}` } : {}),
  }
  const tParams = { skip: (tplPage - 1) * 50, take: 50,
    ...(search ? { search: `name=${search}` } : {}),
  }

  const { data: cData, isLoading: cLoading, refetch: cRefetch } = useControls(cParams)
  const { data: sData, isLoading: sLoading, refetch: sRefetch } = useSections(sParams)
  const { data: tData, isLoading: tLoading, refetch: tRefetch } = useTemplates(tParams)

  const cItems = (cData?.items ?? cData ?? []).map(r => ({ ...r, id: r.id }))
  const tItems = (tData?.items ?? tData ?? []).map(r => ({ ...r, id: r.id }))
  const sRoots = sData?.items ?? sData ?? []

  const handleTabChange = (t) => {
    setTab(t); setSearch(''); setTypeFilter('')
    setSelectedCIds([]); setSelectedTIds([])
    setPage(1); setSecPage(1); setTplPage(1)
  }

  // CSV import
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    if (!file.name.endsWith('.csv')) { toast.error('Only .csv files are supported'); return }
    toast.loading('Importing…', { id: 'csv-import' })
    TM.importCsv.mutate(file, {
      onSuccess: (res) => {
        toast.dismiss('csv-import')
        const result = res?.data ?? res
        if (result?.fatalError) toast.error(result.summary)
        else { toast.success('Import complete'); setImportResult(result) }
      },
      onError: () => toast.dismiss('csv-import'),
    })
  }

  // ── Column definitions ─────────────────────────────────────────────────────

  const controlColumns = [
    { key: 'id',          label: 'ID',         sortable: true,  width: 60,  type: 'mono' },
    { key: 'controlCode', label: 'Code',        sortable: true,  width: 100, type: 'mono' },
    { key: 'name',        label: 'Control',     sortable: true,  width: 280, type: 'truncate', truncateLen: 70 },
    { key: 'testType',    label: 'Test type',   sortable: true,  width: 130, type: 'custom',
      render: (row) => (
        <Badge colorTag={TEST_TYPE_COLOR[row.testType] ?? 'gray'} size="sm">
          {TEST_TYPES.find(t => t.value === row.testType)?.label ?? row.testType}
        </Badge>
      ),
    },
    { key: 'controlTag',  label: 'Guard tag',   sortable: true,  width: 140, type: 'custom',
      render: (row) => <GuardTagBadge tag={row.controlTag} />,
    },
    { key: 'frameworkRef', label: 'Framework',  sortable: false, width: 100, type: 'truncate', truncateLen: 20 },
    { key: 'tenantId',    label: 'Scope',       sortable: false, width: 70,  type: 'custom',
      render: (row) => row.tenantId === null
        ? <span className="flex items-center gap-1 text-[10px] text-text-muted"><Globe size={10} />Global</span>
        : <span className="flex items-center gap-1 text-[10px] text-text-muted"><Lock size={10} />Private</span>,
    },
    { key: '__actions',   label: '',             width: 72,       type: 'custom',
      render: (row) => (
        <RowActions
          onEdit={() => setEditControl(row)}
          onDelete={() => setDeleteControl(row)}
        />
      ),
    },
  ]

  const templateColumns = [
    { key: 'id',           label: 'ID',        sortable: true,  width: 60,  type: 'mono' },
    { key: 'name',         label: 'Template',  sortable: true,  width: 240 },
    { key: 'frameworkRef', label: 'Framework', sortable: false, width: 120 },
    { key: 'auditType',    label: 'Type',      sortable: true,  width: 90,  type: 'custom',
      render: (row) => <Badge colorTag={row.auditType === 'INTERNAL' ? 'blue' : 'purple'} size="sm">{row.auditType}</Badge>,
    },
    { key: 'status',       label: 'Status',    sortable: true,  width: 90,  type: 'badge' },
    { key: 'version',      label: 'Ver',       sortable: false, width: 50,  type: 'mono' },
    { key: '__actions',    label: '',           width: 160,      type: 'custom',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => setPreview(row.id)} title="Preview structure"
            className="h-6 px-2 text-[10px] rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            Preview
          </button>
          {row.status === 'DRAFT'
            ? <button onClick={() => TM.publish.mutate(row.id)} title="Publish"
                className="h-6 px-2 text-[10px] rounded text-brand-ink hover:bg-brand-500/10 transition-colors">
                Publish
              </button>
            : <button onClick={() => TM.unpublish.mutate(row.id)} title="Unpublish"
                className="h-6 px-2 text-[10px] rounded text-status-warn-fg hover:bg-status-warn-bg transition-colors">
                Unpublish
              </button>
          }
          <button onClick={() => setDeleteTemplate(row)} title="Delete"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      ),
    },
  ]

  // ── Bulk bar (same as QuestionLibraryPage) ─────────────────────────────────

  const BulkBar = ({ count, totalCount, label, loading, onDelete, onClear }) =>
    count === 0 ? null : (
      <div className="flex items-center gap-3 px-6 py-2.5 bg-brand-500/5 border-b border-brand-500/20">
        <span className="text-xs font-medium text-brand-ink">{count} {label} selected</span>
        <Button variant="ghost" size="xs" icon={Trash2}
          className="text-status-fail-fg hover:bg-status-fail-bg" loading={loading} onClick={onDelete}>
          Delete selected
        </Button>
        <button onClick={onClear} className="text-xs text-text-muted hover:text-text-secondary ml-auto">
          Clear
        </button>
      </div>
    )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageLayout
      title="Audit library"
      subtitle="Manage reusable controls, section trees, and templates"
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); setSecPage(1); setTplPage(1) }}
              placeholder={tab === 'controls' ? 'Search controls…' : tab === 'sections' ? 'Search sections…' : 'Search templates…'}
              className="h-8 pl-8 pr-3 w-52 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>

          {tab === 'controls' && (
            <div className="relative">
              <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
                className="h-8 appearance-none pl-3 pr-7 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">All types</option>
                {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          )}

          <Button variant="ghost" size="sm" icon={RefreshCw}
            onClick={tab === 'controls' ? cRefetch : tab === 'sections' ? sRefetch : tRefetch} />

          {tab === 'templates' && (
            <>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
              <Button variant="secondary" size="sm" icon={Upload} loading={TM.importCsv.isPending}
                onClick={() => fileRef.current?.click()}>
                Import CSV
              </Button>
              <Button variant="ghost" size="sm" icon={Download} onClick={downloadCsvTemplate}>
                Template
              </Button>
            </>
          )}

          <Button size="sm" icon={Plus}
            onClick={() => tab === 'controls' ? setShowCreateC(true) : tab === 'sections' ? setShowCreateS(true) : setShowCreateT(true)}>
            {tab === 'controls' ? 'Add control' : tab === 'sections' ? 'Add section' : 'New template'}
          </Button>
        </div>
      }
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => {
          const count = key === 'controls' ? cData?.pagination?.totalItems
                      : key === 'sections' ? sData?.pagination?.totalItems
                      : tData?.pagination?.totalItems
          return (
            <button key={key} onClick={() => handleTabChange(key)}
              className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === key ? 'border-brand-500 text-brand-ink' : 'border-transparent text-text-muted hover:text-text-secondary')}>
              <Icon size={14} />
              {label}
              {count != null && (
                <span className={cn('ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono',
                  tab === key ? 'bg-brand-500/15 text-brand-ink' : 'bg-surface-overlay text-text-muted')}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Bulk bars */}
      {tab === 'controls' && (
        <BulkBar count={selectedCIds.length} totalCount={cData?.pagination?.totalItems ?? 0}
          label="control(s)" loading={false}
          onDelete={() => toast('Bulk delete controls coming soon')}
          onClear={() => setSelectedCIds([])} />
      )}
      {tab === 'templates' && (
        <BulkBar count={selectedTIds.length} totalCount={tData?.pagination?.totalItems ?? 0}
          label="template(s)" loading={false}
          onDelete={() => toast('Bulk delete templates coming soon')}
          onClear={() => setSelectedTIds([])} />
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">

        {/* Controls tab — DataTable */}
        {tab === 'controls' && (
          <DataTable
            columns={controlColumns}
            data={cItems}
            pagination={cData?.pagination}
            onPageChange={setPage}
            loading={cLoading}
            emptyMessage="No controls in library yet. Add one or import a CSV."
            selectable
            selectedIds={selectedCIds}
            onSelectionChange={setSelectedCIds}
          />
        )}

        {/* Sections tab — tree view */}
        {tab === 'sections' && (
          sLoading ? (
            <div className="px-6 py-4 flex flex-col gap-2">
              {[1,2,3].map(i => <div key={i} className="h-8 rounded bg-surface-overlay animate-pulse" />)}
            </div>
          ) : !sRoots.length ? (
            <EmptyState icon={Layers} title="No sections yet"
              description="Add root sections first, then nest sub-sections under them."
              action={<Button variant="primary" icon={Plus} onClick={() => setShowCreateS(true)}>Add section</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 px-4 text-xs font-medium text-text-muted text-left">Section</th>
                    <th className="py-2 px-4 text-xs font-medium text-text-muted text-left w-20">Depth</th>
                    <th className="py-2 px-4 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {sRoots.map(section => (
                    <SectionTreeRow key={section.id} section={section} depth={0}
                      onEdit={(s) => setEditSection(s)}
                      onDelete={(s) => setDeleteSection(s)}
                      onAddChild={(s) => { setAddChildTo(s); setShowCreateS(true) }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Templates tab — DataTable */}
        {tab === 'templates' && (
          <>
            <DataTable
              columns={templateColumns}
              data={tItems}
              pagination={tData?.pagination}
              onPageChange={setTplPage}
              loading={tLoading}
              emptyMessage="No templates yet. Import a CSV or create one manually."
              selectable
              selectedIds={selectedTIds}
              onSelectionChange={setSelectedTIds}
            />
            {/* CSV format hint */}
            <div className="px-6 py-4 border-t border-border">
              <div className="rounded-card border border-border bg-surface-overlay p-3 text-[10px] font-mono text-text-muted">
                <p className="font-sans text-xs text-text-secondary mb-1.5">CSV row types: TEMPLATE · SECTION (with level=0..N) · CONTROL</p>
                <p>type,level,name,section_code,control_code,test_type,control_tag,weight,is_mandatory</p>
                <p>TEMPLATE,,"ISO 27001",,,,,,</p>
                <p>SECTION,0,"A — Org Controls",A,,,,,</p>
                <p>SECTION,1,"A.5 — Policies",A.5,,,,,</p>
                <p>CONTROL,,,"User access mgmt",A.9.1.1,DOCUMENT_REVIEW,ACCESS_MGMT,1.0,true</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {/* Create / edit control */}
      <Modal open={showCreateC || !!editControl}
        onClose={() => { setShowCreateC(false); setEditControl(null) }}
        title={editControl ? 'Edit control' : 'Add control'}>
        <ControlForm
          initial={editControl}
          loading={CM.create.isPending || CM.update.isPending}
          onSubmit={(form) => {
            if (editControl) {
              CM.update.mutate({ id: editControl.id, data: form }, {
                onSuccess: () => { setEditControl(null); toast.success('Control updated') },
              })
            } else {
              CM.create.mutate(form, {
                onSuccess: () => { setShowCreateC(false); toast.success('Control added') },
              })
            }
          }}
        />
      </Modal>

      {/* Create / edit section */}
      <Modal open={showCreateS || !!editSection}
        onClose={() => { setShowCreateS(false); setEditSection(null); setAddChildTo(null) }}
        title={editSection ? 'Edit section' : addChildTo ? `Add child section under "${addChildTo.name}"` : 'Add section'}>
        <SectionForm
          initial={editSection ?? (addChildTo ? { parentId: addChildTo.id } : null)}
          allRootSections={sRoots}
          loading={SM.create.isPending || SM.update.isPending}
          onSubmit={(form) => {
            if (editSection) {
              SM.update.mutate({ id: editSection.id, data: form }, {
                onSuccess: () => { setEditSection(null); toast.success('Section updated') },
              })
            } else {
              SM.create.mutate(form, {
                onSuccess: () => { setShowCreateS(false); setAddChildTo(null); toast.success('Section added') },
              })
            }
          }}
        />
      </Modal>

      {/* Create template */}
      <Modal open={showCreateT} onClose={() => setShowCreateT(false)} title="New template">
        <div className="flex flex-col gap-4">
          {(() => {
            const [form, setForm] = useState({ name: '', description: '', frameworkRef: '', auditType: 'INTERNAL' })
            const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
            return (
              <>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Template name *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="e.g. ISO 27001 Full Audit"
                    className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Audit type</label>
                    <select value={form.auditType} onChange={e => set('auditType', e.target.value)}
                      className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                      {AUDIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
                    <input value={form.frameworkRef} onChange={e => set('frameworkRef', e.target.value)}
                      placeholder="ISO 27001, SOC 2…"
                      className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </div>
                </div>
                <Button variant="primary" loading={TM.create.isPending} disabled={!form.name.trim()}
                  onClick={() => TM.create.mutate(form, { onSuccess: () => { setShowCreateT(false); toast.success('Template created as DRAFT') } })}>
                  Create template
                </Button>
              </>
            )
          })()}
        </div>
      </Modal>

      {/* Delete confirmations */}
      <ConfirmDialog open={!!deleteControl} title="Delete control"
        description={`Delete "${deleteControl?.name}"? It will be removed from all sections it's mapped to.`}
        confirmLabel="Delete" variant="destructive"
        loading={CM.del.isPending}
        onConfirm={() => CM.del.mutate(deleteControl.id, { onSuccess: () => setDeleteControl(null) })}
        onCancel={() => setDeleteControl(null)} />

      <ConfirmDialog open={!!deleteSection} title="Delete section"
        description={`Delete "${deleteSection?.name}" and all its children? Controls in this section will be unmapped but not deleted.`}
        confirmLabel="Delete" variant="destructive"
        loading={SM.del.isPending}
        onConfirm={() => SM.del.mutate(deleteSection.id, { onSuccess: () => setDeleteSection(null) })}
        onCancel={() => setDeleteSection(null)} />

      <ConfirmDialog open={!!deleteTemplate} title="Delete template"
        description={`Delete "${deleteTemplate?.name}"? Existing engagements that used this template are not affected.`}
        confirmLabel="Delete" variant="destructive"
        loading={TM.del.isPending}
        onConfirm={() => TM.del.mutate(deleteTemplate.id, { onSuccess: () => setDeleteTemplate(null) })}
        onCancel={() => setDeleteTemplate(null)} />

      {/* CSV import result */}
      <CsvResultModal result={importResult} onClose={() => setImportResult(null)} />

      {/* Template tree preview */}
      <TemplatePreviewModal templateId={previewId} onClose={() => setPreview(null)} />

    </PageLayout>
  )
}
