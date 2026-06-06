/**
 * AuditLibraryPage — /admin/audit/library
 *
 * Full audit library management.
 *
 * TABS:
 *   Controls  — reusable audit controls (create/edit/delete, bulk select, guard tag)
 *   Sections  — section tree (create/edit/move/delete children)
 *               ↳ NEW: inline "Controls" panel per section — add/remove control mappings
 *               ↳ NEW: "Add to Template" action per root section
 *   Templates — templates with build/publish/edit/delete
 *               ↳ Builder: add/remove root sections, add/remove controls per section
 *               ↳ NEW: ControlRow has dual-edit — library fields + mapping fields (weight/mandatory)
 *               ↳ NEW: InteractiveChildSection — add/edit/delete child sections at any depth
 *               ↳ NEW: AddChildSectionModal — create child sections from within the builder
 *               ↳ CSV import
 *
 * BUGS FIXED:
 *   - ControlRow was calling c.id (undefined) instead of c.controlId
 *   - EditControlModal used control?.control?.id ?? control?.id (both undefined)
 *   - addControl sent params as JSON body; backend expects @RequestParam (query string)
 *   - addControl used 'isMandatory'; backend param is 'mandatory'
 *   - CONTROL_CSV_TEMPLATE had 3 leading commas (CONTROL,,,name) which placed the
 *     control name into the description column; name saved as "". Fixed to 2 commas.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, RefreshCw, Upload, Download, Shield,
  Layers, LayoutTemplate, Pencil, Trash2, ChevronDown,
  ChevronRight, Globe, Lock, CheckCircle2, XCircle,
  AlertCircle, Loader2, ArrowLeft, Send, BookOpen, Weight,
  Link2,
} from 'lucide-react'
import { auditApi }    from '../../../api/audit.api'
import { PageLayout }  from '../../../components/layout/PageLayout'
import { DataTable }   from '../../../components/ui/DataTable'
import { Button }      from '../../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Badge }       from '../../../components/ui/Badge'
import { EmptyState }  from '../../../components/ui/EmptyState'
import { Input }       from '../../../components/ui/Input'
import { cn }          from '../../../lib/cn'
import { useSelector } from 'react-redux'
import { useScreenConfig } from '../../../hooks/useUIConfig'
import { selectAuth }  from '../../../store/slices/authSlice'
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

const STATUS_COLOR = { DRAFT: 'amber', PUBLISHED: 'green' }

const TABS = [
  { key: 'templates', label: 'Templates', icon: LayoutTemplate },
  { key: 'sections',  label: 'Sections',  icon: Layers },
  { key: 'controls',  label: 'Controls',  icon: Shield },
  { key: 'tests',     label: 'Tests',     icon: CheckCircle2 },
  { key: 'policies',  label: 'Policies',  icon: BookOpen },
]

// FIX: CONTROL rows previously had 3 leading commas (CONTROL,,,name) which shifted
// the control name into the description column (col[2]=name was blank, col[3]=desc
// received the name). MySQL accepted "" for the NOT NULL name column silently, so
// controls were created with an empty name — only the control code appeared in the UI.
//
// Root cause: CONTROL rows don't use the "level" or "section_code" columns, but
// the extra comma pushed every value one position to the right.
//
// Fix: 2 leading commas (CONTROL,,name,...,,control_code,...) — level blank at col[1],
// name at col[2] ✓, description at col[3] ✓, section_code blank at col[4] ✓.
const CONTROL_CSV_TEMPLATE =
`type,level,name,description,section_code,control_code,framework_ref,test_type,control_tag,weight,is_mandatory
TEMPLATE,,"ISO 27001 Internal Audit",,,,ISO 27001,INTERNAL,,
SECTION,0,"A — Organisational controls",,A,,ISO 27001,,,,
SECTION,1,"A.5 — Policies for information security",,A.5,,ISO 27001,,,,
SECTION,2,"A.5.1 — Policies for information security",,A.5.1,,ISO 27001,,,,
CONTROL,,"Information security policy","Review and approval process",,A.5.1.1,ISO 27001,DOCUMENT_REVIEW,INFOSEC_POLICY,1.0,true
CONTROL,,"Review of policies","Evidence of periodic review",,A.5.1.2,ISO 27001,DOCUMENT_REVIEW,INFOSEC_POLICY,1.0,true
SECTION,1,"A.6 — Organisation of information security",,A.6,,ISO 27001,,,,
SECTION,0,"B — People controls",,B,,ISO 27001,,,,`

function downloadCsvTemplate() {
  const blob = new Blob([CONTROL_CSV_TEMPLATE], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'audit_library_import.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ─── API Query Hooks ───────────────────────────────────────────────────────────

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

const useTests = (params) => useQuery({
  queryKey: ['audit-library-tests', params],
  queryFn:  () => auditApi.library.tests.list(params),
  keepPreviousData: true,
})

const usePolicies = (params) => useQuery({
  queryKey: ['audit-library-policies', params],
  queryFn:  () => auditApi.library.policies.list(params),
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

/** Loads ALL root sections for the section picker in the builder */
const useAllRootSections = () => useQuery({
  queryKey: ['audit-library-sections-all'],
  queryFn:  () => auditApi.library.sections.listRoots({ skip: 0, take: 500 }),
})

/** Loads ALL controls for the control picker in the builder / section controls panel */
const useAllControls = () => useQuery({
  queryKey: ['audit-library-controls-all'],
  queryFn:  () => auditApi.library.controls.list({ skip: 0, take: 500 }),
})

/**
 * NEW: Controls mapped to a specific section (standalone, not via template builder).
 * Shape: [{ mappingId, controlId, sectionId, orderNo, weight, mandatory,
 *           name, description, controlCode, testType, controlTag, frameworkRef }]
 */
const useSectionControls = (sectionId) => useQuery({
  queryKey: ['audit-section-controls', sectionId],
  queryFn:  () => auditApi.library.sections.listControls(sectionId),
  enabled:  !!sectionId,
})

/** NEW: All templates — used by SectionToTemplateModal to pick a destination */
const useAllTemplatesForMapper = () => useQuery({
  queryKey: ['audit-library-templates-all'],
  queryFn:  () => auditApi.library.templates.list({ skip: 0, take: 500 }),
})

// ── Mutation Hooks ────────────────────────────────────────────────────────────

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
    qc.invalidateQueries({ queryKey: ['audit-library-templates-all'] })
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

// Builder-specific mutations (map/unmap sections and controls to a template)
function useAddSection(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, orderNo }) => auditApi.library.templates.addSection(templateId, sectionId, orderNo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-library-template-full', templateId] }),
    onError:   () => toast.error('Failed to add section'),
  })
}

function useRemoveSection(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sectionId) => auditApi.library.templates.removeSection(templateId, sectionId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-library-template-full', templateId] }); toast.success('Section removed') },
    onError:   () => toast.error('Failed to remove section'),
  })
}

function useAddControl(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, controlId, data }) =>
      auditApi.library.sections.addControl(sectionId, controlId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audit-library-template-full', templateId] }),
    onError:   () => toast.error('Failed to add control'),
  })
}

function useRemoveControl(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, controlId }) =>
      auditApi.library.sections.removeControl(sectionId, controlId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-library-template-full', templateId] }); toast.success('Control removed') },
    onError:   () => toast.error('Failed to remove control'),
  })
}

/**
 * NEW: Update the mapping-level fields (weight, mandatory) of an existing
 * control→section mapping from within the template builder.
 * Uses addControl which is idempotent — updates if mapping already exists.
 */
function useUpdateControlMapping(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, controlId, weight, isMandatory }) =>
      auditApi.library.sections.addControl(sectionId, controlId, { weight, isMandatory }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-library-template-full', templateId] })
      toast.success('Mapping updated')
    },
    onError: () => toast.error('Failed to update mapping'),
  })
}

function useUpdateSectionInBuilder(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => auditApi.library.sections.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-library-template-full', templateId] })
      qc.invalidateQueries({ queryKey: ['audit-library-sections'] })
      toast.success('Section updated')
    },
    onError: () => toast.error('Failed to update section'),
  })
}

function useUpdateControlInBuilder(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => auditApi.library.controls.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-library-template-full', templateId] })
      qc.invalidateQueries({ queryKey: ['audit-library-controls'] })
      qc.invalidateQueries({ queryKey: ['audit-section-controls'] })
      toast.success('Control updated')
    },
    onError: () => toast.error('Failed to update control'),
  })
}

function usePublishTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => auditApi.library.templates.publish(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-library-templates'] })
      qc.invalidateQueries({ queryKey: ['audit-library-template-full'] })
      toast.success('Template published')
    },
    onError: (err) => toast.error(err?.message || 'Failed to publish'),
  })
}

function useUnpublishTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => auditApi.library.templates.unpublish(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-library-templates'] })
      qc.invalidateQueries({ queryKey: ['audit-library-template-full'] })
      toast.success('Template unpublished — now DRAFT')
    },
    onError: (err) => toast.error(err?.message || 'Failed to unpublish'),
  })
}

/**
 * NEW: Create a child section from inside the template builder.
 * The new section automatically appears in the tree on the next full template fetch
 * because getFullTemplate uses a path-based subtree query that picks up new children.
 */
function useCreateChildSection(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => auditApi.library.sections.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-library-template-full', templateId] })
      qc.invalidateQueries({ queryKey: ['audit-library-sections'] })
      qc.invalidateQueries({ queryKey: ['audit-section-children'] })
      toast.success('Child section added')
    },
    onError: () => toast.error('Failed to create section'),
  })
}

/**
 * NEW: Delete a section (and its entire subtree) from the library.
 * This is a destructive operation — it removes the section from ALL templates,
 * not just the one currently open in the builder.
 */
function useDeleteSectionFromLibrary(templateId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => auditApi.library.sections.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-library-template-full', templateId] })
      qc.invalidateQueries({ queryKey: ['audit-library-sections'] })
      qc.invalidateQueries({ queryKey: ['audit-section-children'] })
      toast.success('Section deleted from library')
    },
    onError: () => toast.error('Failed to delete section'),
  })
}

// ─── Guard tag badge ───────────────────────────────────────────────────────────

const GuardTagBadge = ({ tag }) => tag
  ? <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] bg-brand-500/10 text-brand-400 border border-brand-500/20">{tag}</span>
  : <span className="text-[10px] text-text-muted italic">—</span>

// ─── Inline row action buttons ─────────────────────────────────────────────────

const RowActions = ({ onEdit, onDelete }) => (
  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
    <button onClick={onEdit} title="Edit"
      className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
      <Pencil size={12} />
    </button>
    <button onClick={onDelete} title="Delete"
      className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
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
          className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Control code</label>
          <input value={form.controlCode} onChange={e => set('controlCode', e.target.value)}
            placeholder="e.g. A.9.1.1, CC6.1, AC-1"
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
          <input value={form.frameworkRef} onChange={e => set('frameworkRef', e.target.value)}
            placeholder="e.g. ISO 27001, SOC 2"
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Test type</label>
          <select value={form.testType} onChange={e => set('testType', e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
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
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
          placeholder="What this control tests and what evidence is expected"
          className="w-full px-3 py-2 rounded-md border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
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
          className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Section code</label>
          <input value={form.sectionCode} onChange={e => set('sectionCode', e.target.value)}
            placeholder="e.g. A.9, CC6, PR.AC"
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
          <input value={form.frameworkRef} onChange={e => set('frameworkRef', e.target.value)}
            placeholder="e.g. ISO 27001"
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Parent section
          <span className="ml-1 text-text-muted font-normal">(leave blank for top-level)</span>
        </label>
        <select value={form.parentId ?? ''} onChange={e => set('parentId', e.target.value || null)}
          className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
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
          className="w-full px-3 py-2 rounded-md border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <Button variant="primary" onClick={() => onSubmit(form)} loading={loading} disabled={!form.name.trim()}>
        {initial ? 'Update section' : 'Add section'}
      </Button>
    </div>
  )
}

// ─── NEW: Section Controls Panel ──────────────────────────────────────────────
/**
 * Inline expandable panel shown inside SectionTreeRow.
 * Lists controls mapped to a section and allows adding/removing them.
 * This is the standalone section↔controls mapper (not inside the template builder).
 */
function SectionControlsPanel({ sectionId, sectionName }) {
  const qc = useQueryClient()
  const { data: rawData, isLoading } = useSectionControls(sectionId)
  const [showPicker, setShowPicker]   = useState(false)
  const [removeTarget, setRemoveTarget] = useState(null)

  const controls = Array.isArray(rawData) ? rawData : rawData?.items ?? rawData?.data ?? []

  const { mutate: removeControl, isPending: removing } = useMutation({
    mutationFn: (controlId) => auditApi.library.sections.removeControl(sectionId, controlId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-section-controls', sectionId] })
      // Also invalidate template full views in case this section appears in any template
      qc.invalidateQueries({ queryKey: ['audit-library-template-full'] })
      toast.success('Control removed from section')
    },
    onError: () => toast.error('Failed to remove control'),
  })

  return (
    <div className="border-t border-border bg-surface-overlay/50">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
          Controls in this section
        </span>
        <Button size="xs" variant="secondary" icon={Plus} onClick={() => setShowPicker(true)}>
          Add Control
        </Button>
      </div>

      {/* Controls list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="text-brand-400 animate-spin" />
        </div>
      ) : controls.length === 0 ? (
        <div className="px-4 py-4 text-center">
          <p className="text-xs text-text-muted">No controls mapped to this section.</p>
          <Button size="xs" variant="ghost" icon={Plus} className="mt-2" onClick={() => setShowPicker(true)}>
            Add your first control
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {controls.map((ctrl, i) => (
            <div key={ctrl.mappingId ?? ctrl.controlId ?? i}
              className="flex items-center gap-3 px-4 py-2.5 group hover:bg-surface-overlay transition-colors">
              <span className="text-[10px] font-mono text-text-muted w-4 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  {ctrl.controlCode && (
                    <span className="font-mono text-[10px] text-text-muted">{ctrl.controlCode}</span>
                  )}
                  <span className="text-xs text-text-primary">{ctrl.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge colorTag={TEST_TYPE_COLOR[ctrl.testType] ?? 'gray'} size="sm">
                    {TEST_TYPES.find(t => t.value === ctrl.testType)?.label ?? ctrl.testType}
                  </Badge>
                  {ctrl.weight != null && (
                    <span className="flex items-center gap-1 text-[10px] text-text-muted">
                      <Weight size={9} /> {ctrl.weight}
                    </span>
                  )}
                  {ctrl.mandatory && (
                    <span className="text-[10px] text-red-400 font-medium">Required</span>
                  )}
                  {ctrl.controlTag && <GuardTagBadge tag={ctrl.controlTag} />}
                </div>
              </div>
              <button
                onClick={() => setRemoveTarget(ctrl)}
                title="Remove from section"
                className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Standalone control picker modal */}
      <StandaloneControlPickerModal
        open={showPicker}
        sectionId={sectionId}
        sectionName={sectionName}
        existingControlIds={(controls).map(c => c.controlId)}
        nextOrder={controls.length + 1}
        onClose={() => setShowPicker(false)}
      />

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove Control from Section"
        description={`Remove "${removeTarget?.name}" from "${sectionName}"? The library control is not deleted.`}
        confirmLabel="Remove" variant="destructive"
        loading={removing}
        onConfirm={() => removeControl(removeTarget.controlId, { onSuccess: () => setRemoveTarget(null) })}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  )
}

// ─── NEW: Standalone Control Picker Modal ─────────────────────────────────────
/**
 * Picks a library control and adds it to a section (no template context).
 * Used from SectionControlsPanel in the Sections tab.
 */
function StandaloneControlPickerModal({ open, sectionId, sectionName, existingControlIds, nextOrder, onClose }) {
  const qc = useQueryClient()
  const { data: libData, isLoading } = useAllControls()
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selected, setSelected]     = useState(null)
  const [weight, setWeight]         = useState('1.0')
  const [mandatory, setMandatory]   = useState(false)

  const { mutate: addControl, isPending } = useMutation({
    mutationFn: ({ controlId, weight, isMandatory, orderNo }) =>
      auditApi.library.sections.addControl(sectionId, controlId, { weight, isMandatory, orderNo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-section-controls', sectionId] })
      qc.invalidateQueries({ queryKey: ['audit-library-template-full'] })
      toast.success('Control added to section')
      setSelected(null); setSearch(''); setTypeFilter(''); setWeight('1.0'); setMandatory(false)
      onClose()
    },
    onError: () => toast.error('Failed to add control'),
  })

  const allControls = libData?.items ?? libData ?? []
  const filtered = allControls.filter(c => {
    if (existingControlIds.includes(c.id)) return false
    if (typeFilter && c.testType !== typeFilter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleAdd = () => {
    if (!selected) return
    addControl({ controlId: selected.id, weight: parseFloat(weight) || 1.0, isMandatory: mandatory, orderNo: nextOrder })
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Control to Section"
      subtitle={sectionName ? `Map a library control into: ${sectionName}` : 'Select a control to map'}
      size="xl"
      footer={
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            {selected
              ? <span className="text-brand-400">"{selected.name.slice(0, 50)}{selected.name.length > 50 ? '…' : ''}" selected</span>
              : 'No control selected'}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={isPending} onClick={handleAdd} disabled={!selected}>Add to Section</Button>
          </div>
        </div>
      }>
      <div className="flex gap-4 h-[400px]">
        {/* Left: searchable list */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search controls…"
                className="h-7 pl-8 pr-3 w-full rounded-md border border-border bg-surface-raised text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="h-7 appearance-none pl-2 pr-6 rounded-md border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">All types</option>
              {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {isLoading && <div className="flex items-center justify-center py-12"><Loader2 size={18} className="text-brand-400 animate-spin" /></div>}
            {!isLoading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10">
                <Shield size={20} className="text-text-muted mb-2" />
                <p className="text-xs text-text-muted">{allControls.length === 0 ? 'No controls in library.' : 'No matching controls.'}</p>
              </div>
            )}
            {!isLoading && filtered.map(c => (
              <button key={c.id} onClick={() => setSelected(c)}
                className={cn('w-full text-left px-3 py-2.5 hover:bg-surface-overlay transition-colors flex items-start gap-3',
                  selected?.id === c.id && 'bg-brand-500/5 border-l-2 border-brand-500')}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {c.controlCode && <span className="font-mono text-[10px] text-text-muted">{c.controlCode}</span>}
                    <p className="text-xs text-text-primary leading-relaxed line-clamp-2">{c.name}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge colorTag={TEST_TYPE_COLOR[c.testType] ?? 'gray'} size="sm">
                      {TEST_TYPES.find(t => t.value === c.testType)?.label ?? c.testType}
                    </Badge>
                    {c.frameworkRef && <span className="text-[10px] text-text-muted">{c.frameworkRef}</span>}
                    {c.controlTag && <GuardTagBadge tag={c.controlTag} />}
                  </div>
                </div>
                {selected?.id === c.id && <CheckCircle2 size={14} className="text-brand-400 shrink-0 mt-0.5" />}
              </button>
            ))}
          </div>
        </div>

        {/* Right: config panel */}
        <div className="w-52 shrink-0">
          <div className="p-3 rounded-lg bg-surface-overlay border border-border">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Mapping config</p>
            {!selected ? (
              <p className="text-xs text-text-muted">Select a control on the left.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="p-2 rounded bg-surface-raised border border-border">
                  <p className="text-[11px] text-text-muted mb-1">Selected</p>
                  <p className="text-xs text-text-primary line-clamp-3">{selected.name}</p>
                  {selected.controlCode && (
                    <p className="text-[10px] font-mono text-text-muted mt-1">{selected.controlCode}</p>
                  )}
                </div>
                <div>
                  <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wide block mb-1">Weight</label>
                  <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="1.0"
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

// ─── NEW: Section → Template Mapper Modal ─────────────────────────────────────
/**
 * From the Sections tab, maps a root section into a chosen template.
 * Only available for depth=0 sections (backend enforces parentId=null for root sections).
 */
function SectionToTemplateModal({ section, onClose }) {
  const qc = useQueryClient()
  const { data: tplData, isLoading } = useAllTemplatesForMapper()
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState(null)

  const allTemplates = tplData?.items ?? tplData ?? []
  const filtered = allTemplates.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  )

  const { mutate: addSection, isPending } = useMutation({
    mutationFn: ({ templateId, sectionId }) => auditApi.library.templates.addSection(templateId, sectionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-library-template-full'] })
      toast.success(`Section added to "${selected?.name}"`)
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Failed to add section to template'),
  })

  if (!section) return null

  const isRoot = section.depth === 0 || section.parentId == null

  return (
    <Modal open={!!section} onClose={onClose} title="Add Section to Template"
      subtitle={`Map "${section.name}" into a template as a root section`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" icon={Link2} loading={isPending}
            disabled={!selected || !isRoot}
            onClick={() => addSection({ templateId: selected.id, sectionId: section.id })}>
            Add to Template
          </Button>
        </div>
      }>
      <div className="flex flex-col gap-3">
        {!isRoot && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
            <AlertCircle size={13} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-400/80 leading-relaxed">
              Only <span className="font-semibold text-amber-400">root sections</span> (depth 0, no parent)
              can be mapped to templates. This section has a parent and cannot be used as a template root.
            </p>
          </div>
        )}

        <div className="p-3 rounded-lg border border-border bg-surface-overlay">
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">Section being mapped</p>
          <div className="flex items-center gap-2">
            {section.sectionCode && (
              <span className="font-mono text-[10px] text-text-muted">{section.sectionCode}</span>
            )}
            <span className="text-sm text-text-primary">{section.name}</span>
            {section.frameworkRef && (
              <span className="text-[10px] text-text-muted ml-auto">{section.frameworkRef}</span>
            )}
          </div>
        </div>

        {isRoot && (
          <>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
                className="h-8 pl-8 pr-3 w-full rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={18} className="text-brand-400 animate-spin" />
                </div>
              )}
              {!isLoading && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8">
                  <LayoutTemplate size={20} className="text-text-muted mb-2" />
                  <p className="text-xs text-text-muted">No templates found.</p>
                </div>
              )}
              {!isLoading && filtered.map(t => (
                <button key={t.id} onClick={() => setSelected(t)}
                  className={cn('w-full text-left px-4 py-3 hover:bg-surface-overlay transition-colors flex items-center gap-3',
                    selected?.id === t.id && 'bg-brand-500/5 border-l-2 border-brand-500')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-primary">{t.name}</span>
                      <Badge colorTag={STATUS_COLOR[t.status] ?? 'gray'} size="sm">{t.status}</Badge>
                    </div>
                    {t.frameworkRef && (
                      <p className="text-[10px] text-text-muted mt-0.5">{t.frameworkRef}</p>
                    )}
                  </div>
                  {selected?.id === t.id && <CheckCircle2 size={14} className="text-brand-400 shrink-0" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ─── Section tree node ────────────────────────────────────────────────────────

function SectionTreeRow({ section, depth, onEdit, onDelete, onAddChild }) {
  const [open, setOpen]             = useState(depth < 1)
  const [showControls, setShowControls] = useState(false)    // NEW: inline controls panel
  const [showAddToTemplate, setShowAddToTemplate] = useState(false) // NEW: section→template mapper
  const { data: children } = useSectionChildren(open ? section.id : null)

  const isRoot = depth === 0 || section.depth === 0

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
            {/* NEW: Toggle controls panel */}
            <button
              onClick={() => setShowControls(v => !v)}
              title={showControls ? 'Hide controls' : 'Manage controls'}
              className={cn(
                'h-6 w-6 flex items-center justify-center rounded transition-colors',
                showControls
                  ? 'text-brand-400 bg-brand-500/10'
                  : 'text-text-muted hover:text-brand-400 hover:bg-brand-500/10'
              )}>
              <Shield size={12} />
            </button>
            {/* NEW: Add to template — root sections only */}
            <button
              onClick={() => setShowAddToTemplate(true)}
              title={isRoot ? 'Add to template' : 'Only root sections can be mapped to templates'}
              disabled={!isRoot}
              className={cn(
                'h-6 w-6 flex items-center justify-center rounded transition-colors',
                isRoot
                  ? 'text-text-muted hover:text-brand-400 hover:bg-brand-500/10'
                  : 'text-text-muted/30 cursor-not-allowed'
              )}>
              <Link2 size={12} />
            </button>
            <button onClick={() => onAddChild(section)} title="Add child section"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
              <Plus size={12} />
            </button>
            <button onClick={() => onEdit(section)} title="Edit"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
              <Pencil size={12} />
            </button>
            <button onClick={() => onDelete(section)} title="Delete"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>

      {/* NEW: Inline controls panel row */}
      {showControls && (
        <tr className="border-b border-border">
          <td colSpan={3} style={{ paddingLeft: `${16 + depth * 20}px` }}>
            <SectionControlsPanel sectionId={section.id} sectionName={section.name} />
          </td>
        </tr>
      )}

      {/* Child rows */}
      {open && children?.map(child => (
        <SectionTreeRow key={child.id} section={child} depth={depth + 1}
          onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} />
      ))}

      {/* NEW: Section → Template mapper modal */}
      <SectionToTemplateModal
        section={showAddToTemplate ? section : null}
        onClose={() => setShowAddToTemplate(false)}
      />
    </>
  )
}

// ─── CSV Import Modal (3-stage) ───────────────────────────────────────────────
function CsvImportModal({ open, onClose, onImported }) {
  const qc      = useQueryClient()
  const fileRef = useRef(null)

  const [stage, setStage]           = useState('upload')
  const [result, setResult]         = useState(null)
  const [dragOver, setDragOver]     = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

  const reset = () => { setStage('upload'); setResult(null); setSelectedFile(null); setDragOver(false) }
  const handleClose = () => { if (stage === 'importing') return; reset(); onClose() }

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
      const res = await auditApi.library.templates.importCsv(selectedFile)
      if (!res || typeof res.summary !== 'string') {
        throw new Error(`Unexpected response shape: ${JSON.stringify(res)?.slice(0, 200)}`)
      }
      setResult(res)
      qc.invalidateQueries({ queryKey: ['audit-library-templates'] })
      qc.invalidateQueries({ queryKey: ['audit-library-sections'] })
      qc.invalidateQueries({ queryKey: ['audit-library-controls'] })
      setStage('done')
    } catch (err) {
      setResult({ fatalError: true, summary: err?.summary ?? err?.message ?? 'Import failed', log: [], successCount: 0, failureCount: 0, totalRows: 0 })
      setStage('done')
    }
  }

  const errCount = result?.failureCount ?? 0

  return (
    <Modal open={open} onClose={stage === 'importing' ? undefined : handleClose}
      title="Import Audit Template from CSV" subtitle="CSV is parsed server-side — no browser processing" size="lg">

      {stage === 'upload' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-surface-overlay border-b border-border">
              <span className="text-xs font-semibold text-text-secondary">CSV row format</span>
              <Button variant="secondary" size="xs" icon={Download} onClick={downloadCsvTemplate}>Download Example</Button>
            </div>
            <pre className="px-4 py-3 text-[10px] font-mono text-text-muted overflow-x-auto leading-relaxed whitespace-pre">
{`type,   level, name,              section_code, control_code, test_type,       control_tag
TEMPLATE        "ISO 27001 Audit"
SECTION  0      "A — Controls"     A
SECTION  1      "A.5 — Policies"   A.5
SECTION  2      "A.5.1 — IS"       A.5.1
CONTROL         "Policy doc…"                    A.5.1.1       DOCUMENT_REVIEW  INFOSEC_POLICY
SECTION  1      "A.6 — Org…"       A.6           ← back to level 1`}
            </pre>
            <div className="px-4 py-2 bg-surface-overlay border-t border-border flex gap-6 flex-wrap">
              {[
                { label: 'TEMPLATE', color: 'text-purple-400', note: 'first row — template name + framework' },
                { label: 'SECTION',  color: 'text-blue-400',   note: 'level= drives tree depth (0=root, 1=child…)' },
                { label: 'CONTROL',  color: 'text-cyan-400',   note: 'attaches to deepest current section' },
              ].map(({ label, color, note }) => (
                <span key={label} className="text-[10px] text-text-muted">
                  <span className={cn('font-mono font-bold', color)}>{label}</span> — {note}
                </span>
              ))}
            </div>
          </div>

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
              {selectedFile ? <CheckCircle2 size={22} className="text-green-400" /> : <Upload size={22} className="text-text-muted" />}
            </div>
            <div className="text-center">
              {selectedFile ? (
                <><p className="text-sm font-medium text-green-400">{selectedFile.name}</p><p className="text-xs text-text-muted mt-1">{(selectedFile.size / 1024).toFixed(1)} KB · Click to choose a different file</p></>
              ) : (
                <><p className="text-sm font-medium text-text-primary">Drop your CSV here, or click to browse</p><p className="text-xs text-text-muted mt-1">.csv files only — parsed server-side</p></>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { handleFile(e.target.files[0]); e.target.value = '' }} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
            <Button size="sm" icon={Upload} disabled={!selectedFile} onClick={runImport}>Upload & Import</Button>
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
            <p className="text-xs text-text-muted mt-1">Building template tree: sections at each depth level, controls mapped to their sections.</p>
          </div>
          <p className="text-xs text-text-muted">Please don't close this window</p>
        </div>
      )}

      {stage === 'done' && result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
              result.fatalError ? 'bg-red-500/10' : errCount > 0 ? 'bg-amber-500/10' : 'bg-green-500/10')}>
              {result.fatalError || errCount > 0
                ? <AlertCircle size={22} className={result.fatalError ? 'text-red-400' : 'text-amber-400'} />
                : <CheckCircle2 size={22} className="text-green-400" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {result.fatalError ? 'Import failed' : errCount > 0 ? `Import completed with ${errCount} issue${errCount !== 1 ? 's' : ''}` : 'Import successful'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{result.summary}</p>
            </div>
          </div>
          {!result.fatalError && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total rows', value: result.totalRows,   color: 'text-text-secondary' },
                { label: 'Succeeded', value: result.successCount, color: 'text-green-400' },
                { label: 'Failed',    value: result.failureCount, color: result.failureCount ? 'text-red-400' : 'text-text-muted' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-3 bg-surface-overlay rounded-lg border border-border text-center">
                  <p className={cn('text-xl font-bold font-mono', color)}>{value ?? 0}</p>
                  <p className="text-xs text-text-muted mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}
          {result.log?.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-overlay p-3 flex flex-col gap-0.5 font-mono text-xs">
              {result.log.map((entry, i) => (
                <div key={i} className={cn('flex items-start gap-2',
                  entry.status === 'SUCCESS' && 'text-text-secondary',
                  entry.status === 'ERROR'   && 'text-red-400',
                  entry.status === 'WARNING' && 'text-amber-400',
                  entry.status === 'INFO'    && 'text-brand-400')}>
                  {entry.status === 'SUCCESS' && <CheckCircle2 size={11} className="mt-0.5 shrink-0" />}
                  {entry.status === 'ERROR'   && <XCircle      size={11} className="mt-0.5 shrink-0" />}
                  {entry.status === 'WARNING' && <AlertCircle  size={11} className="mt-0.5 shrink-0" />}
                  {entry.status === 'INFO'    && <span className="shrink-0 mt-0.5">›</span>}
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={reset}>Import Another</Button>
            {result.createdEntityId && !result.fatalError ? (
              <Button size="sm" icon={ChevronRight} onClick={() => onImported(result.createdEntityId)}>Open in Builder</Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={handleClose}>Close</Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Section Picker Modal (builder) ───────────────────────────────────────────

function SectionPickerModal({ open, templateId, existingSectionIds, nextOrder, onClose }) {
  const { mutate: addSection, isPending } = useAddSection(templateId)
  const { data: libData, isLoading }      = useAllRootSections()
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState(null)

  const allSections = libData?.items ?? libData ?? []
  const filtered = allSections.filter(s =>
    !existingSectionIds.includes(s.id) &&
    (!search || s.name.toLowerCase().includes(search.toLowerCase()))
  )

  const handleAdd = () => {
    if (!selected) return
    addSection(
      { sectionId: selected.id, orderNo: nextOrder },
      { onSuccess: () => { onClose(); setSelected(null); setSearch('') } }
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Root Section"
      subtitle="Select a library section to map to this template" size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isPending} disabled={!selected} onClick={handleAdd}>Add to Template</Button>
        </div>
      }>
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
              <p className="text-xs text-text-muted">{allSections.length === 0 ? 'No root sections in library.' : 'No matching sections.'}</p>
            </div>
          )}
          {!isLoading && filtered.map(s => (
            <button key={s.id} onClick={() => setSelected(s)}
              className={cn('w-full text-left px-4 py-3 hover:bg-surface-overlay transition-colors flex items-center gap-3',
                selected?.id === s.id && 'bg-brand-500/5 border-l-2 border-brand-500')}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {s.sectionCode && <span className="font-mono text-[10px] text-text-muted">{s.sectionCode}</span>}
                  <p className="text-sm text-text-primary">{s.name}</p>
                </div>
                {s.frameworkRef && <p className="text-[10px] text-text-muted mt-0.5">{s.frameworkRef}</p>}
              </div>
              {selected?.id === s.id && <CheckCircle2 size={14} className="text-brand-400 shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

// ─── Control Picker Modal (builder) ───────────────────────────────────────────

function ControlPickerModal({ open, sectionId, sectionName, templateId, existingControlIds, nextOrder, onClose }) {
  const { mutate: addControl, isPending } = useAddControl(templateId)
  const { data: libData, isLoading }      = useAllControls()
  const [search, setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [weight, setWeight]     = useState('')
  const [mandatory, setMandatory] = useState(false)

  const allControls = libData?.items ?? libData ?? []
  const filtered = allControls.filter(c => {
    if (existingControlIds.includes(c.id)) return false
    if (typeFilter && c.testType !== typeFilter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleAdd = () => {
    if (!selected) return
    addControl(
      { sectionId, controlId: selected.id, data: { orderNo: nextOrder, weight: parseFloat(weight) || 1.0, isMandatory: mandatory } },
      { onSuccess: () => { onClose(); setSelected(null); setWeight(''); setMandatory(false); setSearch(''); setTypeFilter('') } }
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Control from Library"
      subtitle={sectionName ? `Map a control into section: ${sectionName}` : 'Map a control into this section'}
      size="xl"
      footer={
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            {selected
              ? <span className="text-brand-400">"{selected.name.slice(0, 50)}{selected.name.length > 50 ? '…' : ''}" selected</span>
              : 'No control selected'}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={isPending} onClick={handleAdd} disabled={!selected}>Add to Section</Button>
          </div>
        </div>
      }>
      <div className="flex gap-4 h-[400px]">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search controls…"
                className="h-7 pl-8 pr-3 w-full rounded-md border border-border bg-surface-raised text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="h-7 appearance-none pl-2 pr-6 rounded-md border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">All types</option>
              {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {isLoading && <div className="flex items-center justify-center py-12"><Loader2 size={18} className="text-brand-400 animate-spin" /></div>}
            {!isLoading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10">
                <Shield size={20} className="text-text-muted mb-2" />
                <p className="text-xs text-text-muted">{allControls.length === 0 ? 'No controls in library.' : 'No matching controls.'}</p>
              </div>
            )}
            {!isLoading && filtered.map(c => (
              <button key={c.id} onClick={() => setSelected(c)}
                className={cn('w-full text-left px-3 py-2.5 hover:bg-surface-overlay transition-colors flex items-start gap-3',
                  selected?.id === c.id && 'bg-brand-500/5 border-l-2 border-brand-500')}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {c.controlCode && <span className="font-mono text-[10px] text-text-muted">{c.controlCode}</span>}
                    <p className="text-xs text-text-primary leading-relaxed line-clamp-2">{c.name}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge colorTag={TEST_TYPE_COLOR[c.testType] ?? 'gray'} size="sm">
                      {TEST_TYPES.find(t => t.value === c.testType)?.label ?? c.testType}
                    </Badge>
                    {c.frameworkRef && <span className="text-[10px] text-text-muted">{c.frameworkRef}</span>}
                    {c.controlTag && <GuardTagBadge tag={c.controlTag} />}
                  </div>
                </div>
                {selected?.id === c.id && <CheckCircle2 size={14} className="text-brand-400 shrink-0 mt-0.5" />}
              </button>
            ))}
          </div>
        </div>
        <div className="w-52 shrink-0">
          <div className="p-3 rounded-lg bg-surface-overlay border border-border">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Config in this section</p>
            {!selected ? (
              <p className="text-xs text-text-muted">Select a control on the left.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="p-2 rounded bg-surface-raised border border-border">
                  <p className="text-[11px] text-text-muted mb-1">Selected</p>
                  <p className="text-xs text-text-primary line-clamp-3">{selected.name}</p>
                  {selected.controlCode && (
                    <p className="text-[10px] font-mono text-text-muted mt-1">{selected.controlCode}</p>
                  )}
                </div>
                <div>
                  <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wide block mb-1">Weight</label>
                  <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="1.0"
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

// ─── Edit Section Modal (builder) ─────────────────────────────────────────────

function EditSectionModal({ section, templateId, onClose }) {
  const { mutate: update, isPending } = useUpdateSectionInBuilder(templateId)
  const [name, setName]         = useState('')
  const [sectionCode, setCode]  = useState('')
  const [frameworkRef, setFw]   = useState('')
  const [error, setError]       = useState('')

  useEffect(() => {
    if (!section) return
    setName(section.section?.name ?? section.name ?? '')
    setCode(section.section?.sectionCode ?? section.sectionCode ?? '')
    setFw(section.section?.frameworkRef ?? section.frameworkRef ?? '')
    setError('')
  }, [section?.section?.id ?? section?.id])

  const handleSubmit = () => {
    if (!name.trim()) { setError('Required'); return }
    const id = section?.section?.id ?? section?.id
    update(
      { id, data: { name: name.trim(), sectionCode: sectionCode.trim() || null, frameworkRef: frameworkRef.trim() || null } },
      { onSuccess: onClose }
    )
  }

  if (!section) return null
  const displayName = section?.section?.name ?? section?.name ?? ''

  return (
    <Modal open={!!section} onClose={onClose} title="Edit Section" size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isPending} onClick={handleSubmit}>Save</Button>
        </div>
      }>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <AlertCircle size={13} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-400/80 leading-relaxed">
            This edits the{' '}
            <span className="font-semibold text-amber-400">shared library section</span> — changes
            will appear in every template that uses it.
          </p>
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Section name *</label>
          <input value={name} onChange={e => { setName(e.target.value); setError('') }}
            placeholder={displayName || 'Section name'}
            className={cn('w-full h-9 px-3 rounded-md border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500',
              error ? 'border-red-500/50' : 'border-border')} />
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Section code</label>
            <input value={sectionCode} onChange={e => setCode(e.target.value)} placeholder="e.g. A.9"
              className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
            <input value={frameworkRef} onChange={e => setFw(e.target.value)} placeholder="e.g. ISO 27001"
              className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── NEW: Add Child Section Modal (builder) ────────────────────────────────────
/**
 * Creates a new child section under a given parent from within the template builder.
 * The new section automatically appears in the tree on the next full template fetch
 * because getFullTemplate uses a path-based subtree query that picks up new children.
 */
function AddChildSectionModal({ open, parentSection, templateId, onClose }) {
  const [form, setForm] = useState({ name: '', sectionCode: '', frameworkRef: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { mutate: create, isPending } = useCreateChildSection(templateId)

  const handleSubmit = () => {
    if (!form.name.trim()) return
    create(
      {
        name:        form.name.trim(),
        sectionCode: form.sectionCode.trim() || null,
        frameworkRef: form.frameworkRef.trim() || null,
        parentId:    parentSection?.id ?? null,
      },
      {
        onSuccess: () => {
          setForm({ name: '', sectionCode: '', frameworkRef: '' })
          onClose()
        },
      }
    )
  }

  if (!parentSection) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Child Section"
      subtitle={`Under: ${parentSection.sectionCode ? `${parentSection.sectionCode} — ` : ''}${parentSection.name}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isPending} disabled={!form.name.trim()} onClick={handleSubmit}>
            Add Section
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Section name *</label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. A.5.1 — IS Policies"
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Section code</label>
            <input
              value={form.sectionCode}
              onChange={e => set('sectionCode', e.target.value)}
              placeholder="e.g. A.5.1"
              className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
            <input
              value={form.frameworkRef}
              onChange={e => set('frameworkRef', e.target.value)}
              placeholder="e.g. ISO 27001"
              className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>
        <p className="text-[11px] text-text-muted">
          The new section will appear under &quot;{parentSection.name}&quot; in all templates that include it.
        </p>
      </div>
    </Modal>
  )
}

// ─── Control Row (inside SectionBlock in builder) ─────────────────────────────
/**
 * UPDATED: dual-edit modal matching AssessmentTemplatesPage's QuestionRow pattern.
 *   - Library section:  name, code, framework, test type, guard tag, description
 *                       → updates the shared library control (affects all templates)
 *   - Mapping section:  weight, mandatory
 *                       → updates only this section's mapping (template-specific)
 *
 * BUGS FIXED:
 *   - Was using c.id (undefined). Now uses control.controlId correctly.
 *   - Was using control.mandatory as 'isMandatory'. Now reads control.mandatory directly.
 */
function ControlRow({ control, index, sectionId, templateId, isPublished }) {
  const [showEdit, setShowEdit]     = useState(false)
  const [showRemove, setShowRemove] = useState(false)

  // ── Library-level fields (shared — edits affect every template using this control) ──
  const [libName, setLibName]         = useState('')
  const [libCode, setLibCode]         = useState('')
  const [libFw, setLibFw]             = useState('')
  const [libTestType, setLibTestType] = useState('DOCUMENT_REVIEW')
  const [libTag, setLibTag]           = useState('')
  const [libDesc, setLibDesc]         = useState('')
  const [libErrors, setLibErrors]     = useState({})

  // ── Mapping-level fields (specific to this section's mapping) ──
  const [mapWeight, setMapWeight]       = useState('')
  const [mapMandatory, setMapMandatory] = useState(false)

  const { mutate: updateControl, isPending: updatingControl } = useUpdateControlInBuilder(templateId)
  const { mutate: updateMapping, isPending: updatingMapping } = useUpdateControlMapping(templateId)
  const { mutate: removeControl, isPending: removing }        = useRemoveControl(templateId)

  // Seed all fields when edit modal opens
  useEffect(() => {
    if (!showEdit) return
    setLibName(control.name        ?? '')
    setLibCode(control.controlCode ?? '')
    setLibFw(control.frameworkRef  ?? '')
    setLibTestType(control.testType ?? 'DOCUMENT_REVIEW')
    setLibTag(control.controlTag   ?? '')
    setLibDesc(control.description ?? '')
    setMapWeight(String(control.weight ?? '1.0'))
    setMapMandatory(control.mandatory ?? false)
    setLibErrors({})
  }, [showEdit])

  const handleSave = () => {
    const e = {}
    if (!libName.trim()) e.libName = 'Required'
    setLibErrors(e)
    if (Object.keys(e).length) return

    // Library update (shared — affects all templates using this control)
    updateControl({
      id: control.controlId,
      data: {
        name:        libName.trim(),
        controlCode: libCode.trim() || null,
        frameworkRef: libFw.trim() || null,
        testType:    libTestType,
        controlTag:  libTag.trim().toUpperCase() || null,
        description: libDesc.trim() || null,
      },
    })

    // Mapping update (specific to this section — does NOT affect other templates)
    updateMapping({
      sectionId,
      controlId:  control.controlId,
      weight:     parseFloat(mapWeight) || 1.0,
      isMandatory: mapMandatory,
    }, { onSuccess: () => setShowEdit(false) })
  }

  return (
    <div className="px-4 py-3 hover:bg-surface-overlay/50 group">
      <div className="flex items-start gap-3">
        <span className="text-xs font-mono text-text-muted mt-0.5 w-5 shrink-0">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {control.controlCode && (
              <span className="font-mono text-[10px] text-text-muted">{control.controlCode}</span>
            )}
            <p className="text-sm text-text-primary leading-relaxed">{control.name}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge colorTag={TEST_TYPE_COLOR[control.testType] ?? 'gray'} size="sm">
              {TEST_TYPES.find(t => t.value === control.testType)?.label ?? control.testType}
            </Badge>
            {control.weight != null && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <Weight size={10} /> {control.weight}
              </span>
            )}
            {control.mandatory && <span className="text-xs text-red-400 font-medium">Required</span>}
            {control.controlTag && <GuardTagBadge tag={control.controlTag} />}
          </div>
          {control.description && (
            <p className="text-xs text-text-muted mt-1 line-clamp-2">{control.description}</p>
          )}
        </div>
        {!isPublished && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setShowEdit(true)}
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

      {/* ── Dual-edit modal: library fields + mapping config ── */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Control" size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button size="sm" loading={updatingControl || updatingMapping} onClick={handleSave}>Save Changes</Button>
          </div>
        }>
        <div className="flex flex-col gap-5">

          {/* Shared-library warning */}
          <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
            <AlertCircle size={13} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-400/80 leading-relaxed">
              Changes to name, code, test type, and guard tag update the{' '}
              <span className="font-semibold text-amber-400">shared library control</span> — reflected in
              every template that uses it. Weight and mandatory status are specific to this section.
            </p>
          </div>

          {/* ── Library fields ── */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Library Control</p>

            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Control name *</label>
              <input value={libName} onChange={e => { setLibName(e.target.value); setLibErrors({}) }}
                className={cn('w-full h-9 px-3 rounded-md border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500',
                  libErrors.libName ? 'border-red-500/50' : 'border-border')} />
              {libErrors.libName && <p className="text-xs text-red-400 mt-1">{libErrors.libName}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Control code</label>
                <input value={libCode} onChange={e => setLibCode(e.target.value)} placeholder="e.g. A.9.1.1"
                  className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Framework ref</label>
                <input value={libFw} onChange={e => setLibFw(e.target.value)} placeholder="e.g. ISO 27001"
                  className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Test type</label>
                <select value={libTestType} onChange={e => setLibTestType(e.target.value)}
                  className="h-9 w-full appearance-none pl-3 pr-8 rounded-md border border-border text-sm text-text-primary bg-surface-raised focus:outline-none focus:ring-1 focus:ring-brand-500">
                  {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Guard tag</label>
                <input value={libTag} onChange={e => setLibTag(e.target.value.toUpperCase())} placeholder="e.g. MFA, ENCRYPTION"
                  className="h-9 w-full rounded-md border border-border bg-surface-raised px-3 text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Description</label>
              <textarea rows={2} value={libDesc} onChange={e => setLibDesc(e.target.value)}
                className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>

          <div className="border-t border-border" />

          {/* ── Mapping fields (section-specific) ── */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Mapping in this section
              <span className="text-text-muted font-normal normal-case ml-1">— affects this template only</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Weight</label>
                <input type="number" value={mapWeight} onChange={e => setMapWeight(e.target.value)} placeholder="1.0"
                  className="h-9 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
              <label className="flex items-center gap-3 cursor-pointer pt-5">
                <button type="button" onClick={() => setMapMandatory(m => !m)}
                  className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
                    mapMandatory ? 'bg-brand-500' : 'bg-surface-raised border border-border')}>
                  <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                    mapMandatory ? 'translate-x-4' : 'translate-x-0.5')} />
                </button>
                <span className="text-sm text-text-primary">Mandatory</span>
              </label>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={showRemove} onClose={() => setShowRemove(false)}
        onConfirm={() => removeControl(
          { sectionId, controlId: control.controlId },
          { onSuccess: () => setShowRemove(false) }
        )}
        loading={removing} title="Remove Control" variant="destructive" confirmLabel="Remove"
        description={`Remove "${control.name}" from this section? The library control is not deleted.`}
      />
    </div>
  )
}

// ─── NEW: Interactive child section (n-depth, replaces read-only ChildSectionSummary) ────
/**
 * Fully editable section node at any depth inside the template builder.
 * Replaces the old read-only ChildSectionSummary with the same pattern as SectionBlock:
 *
 *   ✏  Edit            → EditSectionModal (updates shared library section)
 *   ➕ Add child       → AddChildSectionModal (creates new child in library)
 *   🛡+ Add control    → ControlPickerModal (maps a library control to this section)
 *   🗑 Delete          → ConfirmDialog with library-wide warning
 *
 * Controls at this depth use the full dual-edit ControlRow (library + mapping fields).
 * Children are rendered recursively as further InteractiveChildSection nodes.
 *
 * NOTE: "Delete" removes the section and its entire subtree from the LIBRARY — it is
 * NOT a template-scoped operation. The confirm dialog makes this explicit.
 */
function InteractiveChildSection({ node, depth, templateId, isPublished }) {
  const [open, setOpen]                       = useState(false)
  const [showEdit, setShowEdit]               = useState(false)
  const [showAddChild, setShowAddChild]       = useState(false)
  const [addingControlTo, setAddingControlTo] = useState(null)
  const [showDelete, setShowDelete]           = useState(false)

  const { mutate: deleteSection, isPending: deleting } = useDeleteSectionFromLibrary(templateId)

  const section  = node.section
  const controls = node.controls ?? []
  const children = node.children ?? []
  const subtotal = countSubtreeControls(node)

  return (
    <div className={cn('rounded border border-border overflow-hidden', depth > 1 && 'ml-4')}>

      {/* ── Header ── */}
      <div className="flex items-center group">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center gap-2 px-3 py-2 hover:bg-surface-overlay transition-colors text-left"
        >
          {open
            ? <ChevronDown  size={11} className="text-text-muted shrink-0" />
            : <ChevronRight size={11} className="text-text-muted shrink-0" />}
          {section.sectionCode && (
            <span className="font-mono text-[10px] text-text-muted">{section.sectionCode}</span>
          )}
          <span className="text-xs text-text-primary flex-1 font-medium">{section.name}</span>
          <span className={cn('text-[10px] shrink-0', subtotal === 0 ? 'text-text-muted/50' : 'text-text-muted')}>
            {subtotal} ctrl{subtotal !== 1 ? 's' : ''}
            {children.length > 0 && ` · ${children.length} sub`}
          </span>
        </button>

        {!isPublished && (
          <div className="flex items-center gap-0.5 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setShowEdit(true)}
              title="Edit section"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={() => setShowAddChild(true)}
              title="Add child section"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
            >
              <Plus size={11} />
            </button>
            <button
              onClick={() => setAddingControlTo({
                sectionId:   section.id,
                sectionName: section.name,
                existingIds: controls.map(c => c.controlId),
                nextOrder:   controls.length + 1,
              })}
              title="Add control"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
            >
              <Shield size={11} />
            </button>
            <button
              onClick={() => setShowDelete(true)}
              title="Delete section from library"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* ── Expanded body ── */}
      {open && (
        <div className="border-t border-border">

          {/* Direct controls on this section */}
          {controls.length > 0 && (
            <div className="divide-y divide-border">
              {controls.map((ctrl, i) => (
                <ControlRow
                  key={ctrl.controlId ?? i}
                  control={ctrl}
                  index={i}
                  sectionId={section.id}
                  templateId={templateId}
                  isPublished={isPublished}
                />
              ))}
            </div>
          )}

          {!isPublished && (
            <div className="px-3 py-2 border-t border-border">
              <Button
                size="xs"
                variant="ghost"
                icon={Plus}
                onClick={() => setAddingControlTo({
                  sectionId:   section.id,
                  sectionName: section.name,
                  existingIds: controls.map(c => c.controlId),
                  nextOrder:   controls.length + 1,
                })}
              >
                Add Control
              </Button>
            </div>
          )}

          {/* Recursive child sections — each also interactive */}
          {children.length > 0 && (
            <div className="p-2 border-t border-border flex flex-col gap-1.5">
              {children.map(child => (
                <InteractiveChildSection
                  key={child.section.id}
                  node={child}
                  depth={depth + 1}
                  templateId={templateId}
                  isPublished={isPublished}
                />
              ))}
            </div>
          )}

          {!isPublished && (
            <div className="px-3 py-2 border-t border-border">
              <Button size="xs" variant="ghost" icon={Plus} onClick={() => setShowAddChild(true)}>
                Add child section
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      <EditSectionModal
        section={showEdit ? node : null}
        templateId={templateId}
        onClose={() => setShowEdit(false)}
      />

      <AddChildSectionModal
        open={showAddChild}
        parentSection={section}
        templateId={templateId}
        onClose={() => setShowAddChild(false)}
      />

      <ControlPickerModal
        open={!!addingControlTo}
        sectionId={addingControlTo?.sectionId}
        sectionName={addingControlTo?.sectionName}
        templateId={templateId}
        existingControlIds={addingControlTo?.existingIds ?? []}
        nextOrder={addingControlTo?.nextOrder ?? 1}
        onClose={() => setAddingControlTo(null)}
      />

      <ConfirmDialog
        open={showDelete}
        title="Delete Section from Library"
        description={`Delete "${section.name}" and its entire subtree from the library? This removes it from ALL templates — not just this one.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={() => deleteSection(section.id, { onSuccess: () => setShowDelete(false) })}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  )
}

// ─── Section Block (inside AuditTemplateBuilder) ──────────────────────────────

function countSubtreeControls(node) {
  return (node.controls?.length ?? 0) +
    (node.children ?? []).reduce((sum, child) => sum + countSubtreeControls(child), 0)
}

function SectionBlock({ node, index, templateId, isPublished, expanded, onToggle, onAddControl, onEdit, onRemove }) {
  // NEW: state for the Add Child Section modal on root sections
  const [showAddChild, setShowAddChild] = useState(false)

  const section       = node.section
  const controls      = node.controls ?? []
  const directCount   = controls.length
  const childCount    = (node.children ?? []).length
  const subtotalCount = countSubtreeControls(node)

  return (
    <div className="rounded-lg border border-border bg-surface-raised overflow-hidden">
      <div className="flex items-center">
        <button onClick={onToggle}
          className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-surface-overlay transition-colors text-left">
          <div className="w-6 h-6 rounded-md bg-brand-500/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-brand-400">{index + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {section.sectionCode && <span className="font-mono text-[10px] text-text-muted">{section.sectionCode}</span>}
              <p className="text-sm font-semibold text-text-primary">{section.name}</p>
              {section.frameworkRef && <span className="text-[10px] text-text-muted">{section.frameworkRef}</span>}
            </div>
            <p className="text-xs text-text-muted">
              {subtotalCount} control{subtotalCount !== 1 ? 's' : ''}
              {childCount > 0 && directCount > 0 && <span className="text-text-muted/60"> ({directCount} direct)</span>}
              {childCount > 0 && <> · {childCount} subsection{childCount !== 1 ? 's' : ''}</>}
            </p>
          </div>
          {expanded ? <ChevronDown size={14} className="text-text-muted shrink-0" /> : <ChevronRight size={14} className="text-text-muted shrink-0" />}
        </button>
        {!isPublished && (
          <div className="flex items-center gap-1 mr-2">
            <button onClick={onEdit} title="Edit section"
              className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
              <Pencil size={13} />
            </button>
            {/* NEW: Add child section directly from root section header */}
            <button onClick={() => setShowAddChild(true)} title="Add child section"
              className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
              <Plus size={13} />
            </button>
            <button onClick={onRemove} title="Remove from template"
              className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border">
          {directCount === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-text-muted mb-2">No controls mapped to this section</p>
              {!isPublished && <Button size="xs" variant="secondary" icon={Plus} onClick={onAddControl}>Add Control</Button>}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {controls.map((ctrl, idx) => (
                <ControlRow
                  key={ctrl.controlId ?? idx}
                  control={ctrl}
                  index={idx}
                  sectionId={section.id}
                  templateId={templateId}
                  isPublished={isPublished}
                />
              ))}
              {!isPublished && (
                <div className="px-4 py-2.5">
                  <Button size="xs" variant="ghost" icon={Plus} onClick={onAddControl}>Add Control</Button>
                </div>
              )}
            </div>
          )}

          {/* Child sections — NOW fully interactive via InteractiveChildSection */}
          {(node.children ?? []).length > 0 && (
            <div className="border-t border-border px-4 py-3">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Child sections (nested)</p>
              <div className="flex flex-col gap-2">
                {node.children.map((child) => (
                  <InteractiveChildSection
                    key={child.section.id}
                    node={child}
                    depth={1}
                    templateId={templateId}
                    isPublished={isPublished}
                  />
                ))}
              </div>
            </div>
          )}

          {/* NEW: Add child section from within expanded root body */}
          {!isPublished && (
            <div className="border-t border-border px-4 py-2">
              <Button size="xs" variant="ghost" icon={Plus} onClick={() => setShowAddChild(true)}>
                Add child section
              </Button>
            </div>
          )}
        </div>
      )}

      {!expanded && !isPublished && (
        <div className="border-t border-border px-4 py-2 flex items-center gap-3">
          <Button size="xs" variant="ghost" icon={Plus} onClick={e => { e.stopPropagation(); onAddControl() }}>Add Control</Button>
          {/* NEW: Add child section from collapsed footer too */}
          <Button size="xs" variant="ghost" icon={Plus} onClick={e => { e.stopPropagation(); setShowAddChild(true) }}>Add child section</Button>
        </div>
      )}

      {/* NEW: Add Child Section modal for this root section */}
      <AddChildSectionModal
        open={showAddChild}
        parentSection={section}
        templateId={templateId}
        onClose={() => setShowAddChild(false)}
      />
    </div>
  )
}

// ─── Audit Template Builder ───────────────────────────────────────────────────

function AuditTemplateBuilder({ templateId, onBack }) {
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [showAddSection, setShowAddSection]         = useState(false)
  const [expandedSections, setExpandedSections]     = useState({})
  const [addingControlTo, setAddingControlTo]       = useState(null)
  const [removingSection, setRemovingSection]       = useState(null)
  const [editingSection, setEditingSection]         = useState(null)
  const [editTemplate, setEditTemplate]             = useState(false)

  const { data: raw, isLoading } = useFullTemplate(templateId)
  const data         = raw
  const template     = data?.template
  const rootSections = data?.rootSections ?? []

  const { mutate: publish,   isPending: publishing }      = usePublishTemplate()
  const { mutate: unpublish, isPending: unpublishing }    = useUnpublishTemplate()
  const { mutate: removeSection, isPending: removingSec } = useRemoveSection(templateId)
  const TM = makeTemplateMutations()

  const isPublished = template?.status === 'PUBLISHED'
  const totalControls = rootSections.reduce((s, node) => {
    function countControls(n) {
      return (n.controls?.length ?? 0) + (n.children ?? []).reduce((a, c) => a + countControls(c), 0)
    }
    return s + countControls(node)
  }, 0)

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="text-brand-400 animate-spin" />
    </div>
  )

  const existingRootSectionIds = rootSections.map(n => n.section.id)

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
              <Badge value={template?.status} label={template?.status} colorTag={STATUS_COLOR[template?.status] || 'gray'} />
              <span className="text-xs font-mono text-text-muted">v{template?.version}</span>
              {template?.auditType && (
                <Badge colorTag={template.auditType === 'INTERNAL' ? 'blue' : 'purple'} size="sm">{template.auditType}</Badge>
              )}
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              {rootSections.length} root section{rootSections.length !== 1 ? 's' : ''} · {totalControls} total controls
              {template?.frameworkRef && <> · {template.frameworkRef}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditTemplate(true)}>Edit</Button>
          {!isPublished && (
            <>
              <Button variant="secondary" size="sm" icon={Plus} onClick={() => setShowAddSection(true)}>Add Section</Button>
              <Button size="sm" icon={Send}
                disabled={rootSections.length === 0 || totalControls === 0}
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
              <Button variant="secondary" size="sm" icon={ArrowLeft} loading={unpublishing} onClick={() => unpublish(templateId)}>
                Unpublish
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {rootSections.length === 0 ? (
          <EmptyState icon={LayoutTemplate} title="No root sections mapped yet"
            description="Add root sections from the library to start building this template. Each root section carries its subtree of children and controls."
            action={!isPublished && <Button size="sm" icon={Plus} onClick={() => setShowAddSection(true)}>Add Section</Button>}
          />
        ) : (
          <div className="flex flex-col gap-3 max-w-3xl">
            {rootSections.map((node, idx) => (
              <SectionBlock
                key={node.section.id}
                node={node}
                index={idx}
                templateId={templateId}
                isPublished={isPublished}
                expanded={!!expandedSections[node.section.id]}
                onToggle={() => setExpandedSections(p => ({ ...p, [node.section.id]: !p[node.section.id] }))}
                onAddControl={() => setAddingControlTo({
                  sectionId:   node.section.id,
                  sectionName: node.section.name,
                  existingIds: (node.controls ?? []).map(c => c.controlId),
                  nextOrder:   (node.controls ?? []).length + 1,
                })}
                onEdit={() => setEditingSection(node)}
                onRemove={() => setRemovingSection(node)}
              />
            ))}
            {!isPublished && (
              <button onClick={() => setShowAddSection(true)}
                className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border rounded-lg text-sm text-text-muted hover:text-text-secondary hover:border-border-subtle transition-colors">
                <Plus size={14} /> Add Root Section from Library
              </button>
            )}
          </div>
        )}
      </div>

      <SectionPickerModal
        open={showAddSection}
        templateId={templateId}
        existingSectionIds={existingRootSectionIds}
        nextOrder={rootSections.length + 1}
        onClose={() => setShowAddSection(false)}
      />

      <ControlPickerModal
        open={!!addingControlTo}
        sectionId={addingControlTo?.sectionId}
        sectionName={addingControlTo?.sectionName}
        templateId={templateId}
        existingControlIds={addingControlTo?.existingIds ?? []}
        nextOrder={addingControlTo?.nextOrder ?? 1}
        onClose={() => setAddingControlTo(null)}
      />

      <ConfirmDialog
        open={!!removingSection}
        title="Remove Section"
        description={`Remove section "${removingSection?.section?.name}" from this template? The section and its children remain in the library.`}
        confirmLabel="Remove" variant="destructive"
        loading={removingSec}
        onConfirm={() => removeSection(removingSection?.section?.id, { onSuccess: () => setRemovingSection(null) })}
        onCancel={() => setRemovingSection(null)}
      />

      <EditSectionModal section={editingSection} templateId={templateId} onClose={() => setEditingSection(null)} />

      <Modal open={editTemplate} onClose={() => setEditTemplate(false)} title="Edit Template">
        <TemplateMetaForm template={template} templateId={templateId} onClose={() => setEditTemplate(false)} />
      </Modal>

      <ConfirmDialog
        open={showPublishConfirm}
        title="Publish Template"
        description={`Publish "${template?.name}" with ${rootSections.length} root sections and ${totalControls} total controls? Once published, engagements can be created from it.`}
        confirmLabel="Publish" variant="primary"
        loading={publishing}
        onConfirm={() => publish(templateId, { onSuccess: () => setShowPublishConfirm(false) })}
        onCancel={() => setShowPublishConfirm(false)}
      />
    </div>
  )
}

// ─── TemplateMetaForm ─────────────────────────────────────────────────────────

function TemplateMetaForm({ template, templateId, onClose }) {
  const qc = useQueryClient()
  const { mutate: update, isPending } = useMutation({
    mutationFn: ({ id, data }) => auditApi.library.templates.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-library-templates'] })
      qc.invalidateQueries({ queryKey: ['audit-library-template-full', templateId] })
      toast.success('Template updated')
      onClose()
    },
    onError: () => toast.error('Failed to update template'),
  })
  const [form, setForm] = useState({
    name:         template?.name         ?? '',
    description:  template?.description  ?? '',
    frameworkRef: template?.frameworkRef ?? '',
    auditType:    template?.auditType    ?? 'INTERNAL',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs text-text-secondary mb-1">Template name *</label>
        <input value={form.name} onChange={e => set('name', e.target.value)}
          className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Audit type</label>
          <select value={form.auditType} onChange={e => set('auditType', e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            {AUDIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
          <input value={form.frameworkRef} onChange={e => set('frameworkRef', e.target.value)} placeholder="ISO 27001, SOC 2…"
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
          className="w-full px-3 py-2 rounded-md border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <Button variant="primary" loading={isPending} disabled={!form.name.trim()}
        onClick={() => update({ id: templateId, data: form })}>
        Save changes
      </Button>
    </div>
  )
}

// ─── CreateTemplateForm ───────────────────────────────────────────────────────

function CreateTemplateForm({ onClose, onCreated }) {
  const qc = useQueryClient()
  const { mutate: create, isPending } = useMutation({
    mutationFn: auditApi.library.templates.create,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['audit-library-templates'] })
      toast.success('Template created as DRAFT')
      const newId = res?.id ?? res?.data?.id
      onCreated(newId)
    },
    onError: () => toast.error('Failed to create template'),
  })
  const [form, setForm] = useState({ templateName: '', description: '', frameworkRef: '', auditType: 'INTERNAL' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs text-text-secondary mb-1">Template name *</label>
        <input value={form.templateName} onChange={e => set('templateName', e.target.value)} placeholder="e.g. ISO 27001 Full Audit"
          className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Audit type</label>
          <select value={form.auditType} onChange={e => set('auditType', e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            {AUDIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
          <input value={form.frameworkRef} onChange={e => set('frameworkRef', e.target.value)} placeholder="ISO 27001, SOC 2…"
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
      <Button variant="primary" loading={isPending} disabled={!form.templateName.trim()} onClick={() => create(form)}>
        Create & Open Builder
      </Button>
    </div>
  )
}

// ─── EditTemplateRowForm ──────────────────────────────────────────────────────

function EditTemplateRowForm({ template, onClose }) {
  const qc = useQueryClient()
  const { mutate: update, isPending } = useMutation({
    mutationFn: ({ id, data }) => auditApi.library.templates.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-library-templates'] })
      toast.success('Template updated')
      onClose()
    },
    onError: () => toast.error('Failed to update template'),
  })
  const [form, setForm] = useState({
    name: template?.name ?? '', description: template?.description ?? '',
    frameworkRef: template?.frameworkRef ?? '', auditType: template?.auditType ?? 'INTERNAL',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!template) return
    setForm({ name: template.name ?? '', description: template.description ?? '', frameworkRef: template.frameworkRef ?? '', auditType: template.auditType ?? 'INTERNAL' })
  }, [template?.id])

  if (!template) return null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs text-text-secondary mb-1">Template name *</label>
        <input value={form.name} onChange={e => set('name', e.target.value)}
          className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Audit type</label>
          <select value={form.auditType} onChange={e => set('auditType', e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            {AUDIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
          <input value={form.frameworkRef} onChange={e => set('frameworkRef', e.target.value)} placeholder="ISO 27001, SOC 2…"
            className="w-full h-9 px-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
          className="w-full px-3 py-2 rounded-md border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <Button variant="primary" loading={isPending} disabled={!form.name.trim()}
        onClick={() => update({ id: template.id, data: form })}>
        Save changes
      </Button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AuditLibraryPage({ defaultTab = 'templates' }) {
  const auth = useSelector(selectAuth)
  const { data: auditLibConfig } = useScreenConfig('audit_library')

  const [activeTemplate, setActiveTemplate] = useState(null)

  const [tab, setTab]               = useState(defaultTab)
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage]             = useState(1)
  const [secPage, setSecPage]       = useState(1)
  const [tplPage, setTplPage]       = useState(1)

  const [showCreateC, setShowCreateC]         = useState(false)
  const [showCreateS, setShowCreateS]         = useState(false)
  const [showCreateT, setShowCreateT]         = useState(false)
  const [showImport, setShowImport]           = useState(false)
  const [editControl, setEditControl]         = useState(null)
  const [editSection, setEditSection]         = useState(null)
  const [addChildTo, setAddChildTo]           = useState(null)
  const [deleteControl, setDeleteControl]     = useState(null)
  const [deleteSection, setDeleteSection]     = useState(null)
  const [deleteTemplate, setDeleteTemplate]   = useState(null)
  const [editTemplateRow, setEditTemplateRow] = useState(null)

  const [selectedCIds, setSelectedCIds]   = useState([])
  const [selectedTIds, setSelectedTIds]   = useState([])
  const [selectedSIds, setSelectedSIds]   = useState([])
  const [selectedTestIds, setSelectedTestIds] = useState([])
  const [selectedPolIds, setSelectedPolIds]   = useState([])

  const CM = makeControlMutations()
  const SM = makeSectionMutations()
  const TM = makeTemplateMutations()

  const qc = useQueryClient()

  const bulkDeleteControls = useMutation({
    mutationFn: (ids) => auditApi.library.controls.bulkDelete(ids),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-library-controls'] }); setSelectedCIds([]); toast.success('Controls deleted') },
    onError: () => toast.error('Failed to delete controls'),
  })
  const bulkDeleteSections = useMutation({
    mutationFn: (ids) => auditApi.library.sections.bulkDelete(ids),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-library-sections'] }); setSelectedSIds([]); toast.success('Sections deleted') },
    onError: () => toast.error('Failed to delete sections'),
  })
  const bulkDeleteTemplates = useMutation({
    mutationFn: (ids) => auditApi.library.templates.bulkDelete(ids),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-library-templates'] }); setSelectedTIds([]); toast.success('Templates deleted') },
    onError: () => toast.error('Failed to delete templates'),
  })
  const bulkDeleteTests = useMutation({
    mutationFn: (ids) => auditApi.library.tests.bulkDelete(ids),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-library-tests'] }); setSelectedTestIds([]); toast.success('Tests deleted') },
    onError: () => toast.error('Failed to delete tests'),
  })
  const bulkDeletePolicies = useMutation({
    mutationFn: (ids) => auditApi.library.policies.bulkDelete(ids),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-library-policies'] }); setSelectedPolIds([]); toast.success('Policies deleted') },
    onError: () => toast.error('Failed to delete policies'),
  })

  const cParams = {
    skip: (page - 1) * 50, take: 50,
    ...(search     ? { search: `name=${search}` }           : {}),
    ...(typeFilter ? { filterby: `testtype=${typeFilter}` } : {}),
  }
  const sParams = { skip: (secPage - 1) * 50, take: 50, ...(search ? { search: `name=${search}` } : {}) }
  const tParams = { skip: (tplPage - 1) * 50, take: 50, ...(search ? { search: `name=${search}` } : {}) }

  const { data: cData, isLoading: cLoading, refetch: cRefetch } = useControls(cParams)
  const { data: sData, isLoading: sLoading, refetch: sRefetch } = useSections(sParams)
  const { data: tData, isLoading: tLoading, refetch: tRefetch } = useTemplates(tParams)

  const cItems = (cData?.items ?? cData ?? []).map(r => ({ ...r, id: r.id }))
  const tItems = (tData?.items ?? tData ?? []).map(r => ({ ...r, id: r.id }))
  const sRoots = sData?.items ?? sData ?? []

  const testParams = { skip: 0, take: 200, ...(search ? { search } : {}) }
  const polParams  = { skip: 0, take: 200, ...(search ? { search } : {}) }
  const { data: testData, isLoading: testLoading, refetch: testRefetch } = useTests(testParams)
  const { data: polData,  isLoading: polLoading,  refetch: polRefetch  } = usePolicies(polParams)
  const testItems = (testData?.items ?? testData?.data?.items ?? (Array.isArray(testData) ? testData : []))
  const polItems  = (polData?.items  ?? polData?.data?.items  ?? (Array.isArray(polData)  ? polData  : []))

  const handleTabChange = (t) => {
    setTab(t); setSearch(''); setTypeFilter('')
    setSelectedCIds([]); setSelectedTIds([]); setSelectedSIds([])
    setSelectedTestIds([]); setSelectedPolIds([])
    setPage(1); setSecPage(1); setTplPage(1)
  }

  const controlColumns = [
    { key: 'id',           label: 'ID',        sortable: true,  width: 60,  type: 'mono' },
    { key: 'controlCode',  label: 'Code',       sortable: true,  width: 100, type: 'mono' },
    { key: 'name',         label: 'Control',    sortable: true,  width: 280, type: 'truncate', truncateLen: 70 },
    { key: 'testType', label: 'Test type', sortable: true, width: 130, type: 'badge', componentKey: 'audit_test_type' },
    { key: 'controlTag',   label: 'Guard tag',  sortable: true,  width: 140, type: 'custom',
      render: (row) => <GuardTagBadge tag={row.controlTag} />,
    },
    { key: 'frameworkRef', label: 'Framework',  sortable: false, width: 100, type: 'truncate', truncateLen: 20 },
    { key: 'tenantId',     label: 'Scope',      sortable: false, width: 70,  type: 'custom',
      render: (row) => row.tenantId === null
        ? <span className="flex items-center gap-1 text-[10px] text-text-muted"><Globe size={10} />Global</span>
        : <span className="flex items-center gap-1 text-[10px] text-text-muted"><Lock size={10} />Private</span>,
    },
    { key: '__actions',    label: '',            width: 72,       type: 'custom',
      render: (row) => <RowActions onEdit={() => setEditControl(row)} onDelete={() => setDeleteControl(row)} />,
    },
  ]

  const templateColumns = [
    { key: 'id',           label: 'ID',        sortable: true,  width: 60,  type: 'mono' },
    { key: 'name',         label: 'Template',  sortable: true,  width: 240 },
    { key: 'frameworkRef', label: 'Framework', sortable: false, width: 120 },
    { key: 'auditType', label: 'Type', sortable: true, width: 90, type: 'badge', componentKey: 'audit_template_type' },
    { key: 'status',       label: 'Status',    sortable: true,  width: 90,  type: 'custom',
      render: (row) => (
        <Badge value={row.status} label={row.status} colorTag={STATUS_COLOR[row.status] || 'gray'} />
      ),
    },
    { key: 'version',      label: 'Ver',       sortable: false, width: 50,  type: 'mono' },
    { key: '__actions',    label: '',           width: 230,      type: 'custom',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="xs" icon={ChevronRight} onClick={() => setActiveTemplate(row.id)}>Build</Button>
          <button onClick={() => setEditTemplateRow(row)} title="Edit template"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            <Pencil size={12} />
          </button>
          {row.status === 'DRAFT'
            ? <button onClick={() => TM.publish.mutate(row.id)} title="Publish"
                className="h-6 px-2 text-[10px] rounded text-brand-400 hover:bg-brand-500/10 transition-colors">Publish</button>
            : <button onClick={() => TM.unpublish.mutate(row.id)} title="Unpublish"
                className="h-6 px-2 text-[10px] rounded text-amber-400 hover:bg-amber-500/10 transition-colors">Unpublish</button>
          }
          <button onClick={() => setDeleteTemplate(row)} title="Delete"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      ),
    },
  ]

  // Builder state swap — all hooks have already run unconditionally above
  if (activeTemplate) {
    return <AuditTemplateBuilder templateId={activeTemplate} onBack={() => setActiveTemplate(null)} />
  }

  const BulkBar = ({ count, label, loading, onDelete, onClear }) =>
    count === 0 ? null : (
      <div className="flex items-center gap-3 px-6 py-2.5 bg-brand-500/5 border-b border-brand-500/20">
        <span className="text-xs font-medium text-brand-400">{count} {label} selected</span>
        <Button variant="ghost" size="xs" icon={Trash2}
          className="text-red-400 hover:bg-red-500/10" loading={loading} onClick={onDelete}>
          Delete selected
        </Button>
        <button onClick={onClear} className="text-xs text-text-muted hover:text-text-secondary ml-auto">Clear</button>
      </div>
    )

  return (
    <PageLayout
      title="Audit library"
      subtitle="Manage reusable controls, section trees, and templates"
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); setSecPage(1); setTplPage(1) }}
              placeholder={
                  tab === 'controls'  ? 'Search controls…'  :
                  tab === 'sections'  ? 'Search sections…'  :
                  tab === 'templates' ? 'Search templates…' :
                  tab === 'tests'     ? 'Search tests…'     :
                                        'Search policies…'
                }
              className="h-8 pl-8 pr-3 w-52 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {tab === 'controls' && (
            <div className="relative">
              <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
                className="h-8 appearance-none pl-3 pr-7 rounded-md border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">All types</option>
                {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          )}

          <Button variant="ghost" size="sm" icon={RefreshCw}
            onClick={
                  tab === 'controls'  ? cRefetch :
                  tab === 'sections'  ? sRefetch :
                  tab === 'templates' ? tRefetch :
                  tab === 'tests'     ? testRefetch :
                                        polRefetch
                } />

          {tab === 'templates' && (
            <>
              <Button variant="secondary" size="sm" icon={Upload} onClick={() => setShowImport(true)}>Import CSV</Button>
              <Button variant="ghost" size="sm" icon={Download} onClick={downloadCsvTemplate}>Example</Button>
            </>
          )}

          <Button size="sm" icon={Plus}
            onClick={() => tab === 'controls' ? setShowCreateC(true) : tab === 'sections' ? setShowCreateS(true) : setShowCreateT(true)}>
            {tab === 'controls' ? 'Add control' : tab === 'sections' ? 'Add section' :
             tab === 'templates' ? 'New template' : tab === 'tests' ? 'Add test' : 'Add policy'}
          </Button>
        </div>
      }
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => {
          const count =
            key === 'controls'  ? cData?.pagination?.totalItems :
            key === 'sections'  ? sData?.pagination?.totalItems :
            key === 'templates' ? tData?.pagination?.totalItems :
            key === 'tests'     ? (testData?.pagination?.totalItems ?? testItems.length ?? null) :
            key === 'policies'  ? (polData?.pagination?.totalItems  ?? polItems.length  ?? null) :
            null
          return (
            <button key={key} onClick={() => handleTabChange(key)}
              className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === key ? 'border-brand-500 text-brand-400' : 'border-transparent text-text-muted hover:text-text-secondary')}>
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

      {tab === 'controls' && (
        <BulkBar count={selectedCIds.length} label="control(s)"
          loading={bulkDeleteControls.isPending}
          onDelete={() => bulkDeleteControls.mutate(selectedCIds)}
          onClear={() => setSelectedCIds([])} />
      )}
      {tab === 'templates' && (
        <BulkBar count={selectedTIds.length} label="template(s)"
          loading={bulkDeleteTemplates.isPending}
          onDelete={() => bulkDeleteTemplates.mutate(selectedTIds)}
          onClear={() => setSelectedTIds([])} />
      )}
      {tab === 'sections' && (
        <BulkBar count={selectedSIds.length} label="section(s)"
          loading={bulkDeleteSections.isPending}
          onDelete={() => bulkDeleteSections.mutate(selectedSIds)}
          onClear={() => setSelectedSIds([])} />
      )}
      {tab === 'tests' && (
        <BulkBar count={selectedTestIds.length} label="test(s)"
          loading={bulkDeleteTests.isPending}
          onDelete={() => bulkDeleteTests.mutate(selectedTestIds)}
          onClear={() => setSelectedPolIds([])} />
      )}
      {tab === 'policies' && (
        <BulkBar count={selectedPolIds.length} label="polic(ies)"
          loading={bulkDeletePolicies.isPending}
          onDelete={() => bulkDeletePolicies.mutate(selectedPolIds)}
          onClear={() => setSelectedPolIds([])} />
      )}

      <div className="flex-1 overflow-hidden">
        {/* Controls tab */}
        {tab === 'controls' && (
          <DataTable
            columns={controlColumns} data={cItems} config={auditLibConfig} pagination={cData?.pagination}
            onPageChange={setPage} loading={cLoading}
            emptyMessage="No controls in library yet. Add one or import a CSV."
            selectable selectedIds={selectedCIds} onSelectionChange={setSelectedCIds}
          />
        )}

        {/* Sections tab — tree view with bulk select checkboxes */}
        {tab === 'sections' && (
          sLoading ? (
            <div className="px-6 py-4 flex flex-col gap-2">
              {[1, 2, 3].map(i => <div key={i} className="h-8 rounded bg-surface-overlay animate-pulse" />)}
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
                    <th className="py-2 px-3 w-8">
                      <input type="checkbox" className="rounded border-border"
                        checked={selectedSIds.length > 0 && sRoots.every(s => selectedSIds.includes(s.id))}
                        onChange={e => setSelectedSIds(e.target.checked ? sRoots.map(s => s.id) : [])} />
                    </th>
                    <th className="py-2 px-4 text-xs font-medium text-text-muted text-left">Section</th>
                    <th className="py-2 px-4 text-xs font-medium text-text-muted text-left w-20">Depth</th>
                    <th className="py-2 px-4 w-40"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sRoots.map(section => (
                    <SectionTreeRow key={section.id} section={section} depth={0}
                      onEdit={s => setEditSection(s)}
                      onDelete={s => setDeleteSection(s)}
                      onAddChild={s => { setAddChildTo(s); setShowCreateS(true) }}
                      selectedIds={selectedSIds}
                      onSelect={(id, checked) => setSelectedSIds(prev =>
                        checked ? [...prev, id] : prev.filter(x => x !== id))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Templates tab */}
        {tab === 'templates' && (
          <>
            <DataTable
              columns={templateColumns} data={tItems} config={auditLibConfig} pagination={tData?.pagination}
              onPageChange={setTplPage} loading={tLoading}
              emptyMessage="No templates yet. Import a CSV or create one, then click Build to add sections and controls."
              selectable selectedIds={selectedTIds} onSelectionChange={setSelectedTIds}
              onRowClick={(row) => setActiveTemplate(row.id)}
            />
            <div className="px-6 py-4 border-t border-border">
              <div className="rounded-lg border border-border bg-surface-overlay p-3 text-[10px] font-mono text-text-muted">
                <p className="font-sans text-xs text-text-secondary mb-1.5">
                  CSV row types: TEMPLATE · SECTION (level=0..N) · CONTROL — or click Build on any row to add sections &amp; controls manually
                </p>
                <p>type,level,name,section_code,control_code,test_type,control_tag,weight,is_mandatory</p>
                <p>TEMPLATE,,"ISO 27001",,,,,,</p>
                <p>SECTION,0,"A — Org Controls",A,,,,,</p>
                <p>SECTION,1,"A.5 — Policies",A.5,,,,,</p>
                {/* FIX: 2 leading commas — name at col[2], section_code blank at col[4] */}
                <p>CONTROL,,"User access mgmt","Description",,A.9.1.1,DOCUMENT_REVIEW,ACCESS_MGMT,1.0,true</p>
              </div>
            </div>
          </>
        )}
        {/* Tests tab */}
        {tab === 'tests' && (
          <DataTable
            columns={[
              { key: 'id',             label: 'ID',         sortable: true,  width: 60,  type: 'mono' },
              { key: 'testRef',        label: 'Ref',        sortable: true,  width: 110, type: 'mono' },
              { key: 'name',           label: 'Test',       sortable: true,  width: 300 },
              { key: 'automationType', label: 'Automation', sortable: true,  width: 110, type: 'custom',
                render: (row) => (
                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded',
                    row.automationType === 'AUTOMATED' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400')}>
                    {row.automationType ?? 'MANUAL'}
                  </span>
                ),
              },
              { key: 'frequency',   label: 'Frequency',  sortable: true,  width: 110 },
              { key: 'controlTag',  label: 'Tag',        sortable: false, width: 120, type: 'custom',
                render: (row) => <GuardTagBadge tag={row.controlTag} />,
              },
              { key: 'frameworkRef',label: 'Framework',  sortable: false, width: 90 },
              { key: '__actions',   label: '',           width: 72, type: 'custom',
                render: (row) => <RowActions
                  onEdit={() => toast('Edit test — coming soon')}
                  onDelete={() => auditApi.library.tests.delete(row.id)
                    .then(() => { testRefetch(); toast.success('Test deleted') })
                    .catch(() => toast.error('Delete failed'))} />,
              },
            ]}
            data={testItems} loading={testLoading}
            emptyMessage="No tests in library. Import a CSV to add tests."
            selectable selectedIds={selectedTestIds} onSelectionChange={setSelectedTestIds}
          />
        )}

        {/* Policies tab */}
        {tab === 'policies' && (
          <DataTable
            columns={[
              { key: 'id',          label: 'ID',           sortable: true,  width: 60,  type: 'mono' },
              { key: 'policyRef',   label: 'Ref',          sortable: true,  width: 120, type: 'mono' },
              { key: 'title',       label: 'Policy',       sortable: true,  width: 280 },
              { key: 'status', label: 'Status', sortable: true, width: 100, type: 'badge', componentKey: 'audit_policy_status' },
              { key: 'ownerTeam',         label: 'Owner',      sortable: false, width: 130 },
              { key: 'frameworkRefs',      label: 'Framework',  sortable: false, width: 90 },
              { key: 'reviewFrequencyMonths', label: 'Review (mo)', sortable: false, width: 80, type: 'mono' },
              { key: '__actions',   label: '',             width: 72, type: 'custom',
                render: (row) => <RowActions
                  onEdit={() => toast('Edit policy — coming soon')}
                  onDelete={() => auditApi.library.policies.delete(row.id)
                    .then(() => { polRefetch(); toast.success('Policy deleted') })
                    .catch(() => toast.error('Delete failed'))} />,
              },
            ]}
            data={polItems} loading={polLoading} config={auditLibConfig}
            emptyMessage="No policies in library. Import a CSV to add policies."
            selectable selectedIds={selectedPolIds} onSelectionChange={setSelectedPolIds}
          />
        )}

      </div>

      {/* ── Modals ── */}

      <CsvImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={(tplId) => { setShowImport(false); setActiveTemplate(tplId); setTab('templates') }}
      />

      <Modal open={showCreateC || !!editControl}
        onClose={() => { setShowCreateC(false); setEditControl(null) }}
        title={editControl ? 'Edit control' : 'Add control'}>
        <ControlForm
          initial={editControl}
          loading={CM.create.isPending || CM.update.isPending}
          onSubmit={(form) => {
            if (editControl) {
              CM.update.mutate({ id: editControl.id, data: form }, { onSuccess: () => setEditControl(null) })
            } else {
              CM.create.mutate(form, { onSuccess: () => { setShowCreateC(false); toast.success('Control added') } })
            }
          }}
        />
      </Modal>

      <Modal open={showCreateS || !!editSection}
        onClose={() => { setShowCreateS(false); setEditSection(null); setAddChildTo(null) }}
        title={editSection ? 'Edit section' : addChildTo ? `Add child section under "${addChildTo.name}"` : 'Add section'}>
        <SectionForm
          initial={editSection ?? (addChildTo ? { parentId: addChildTo.id } : null)}
          allRootSections={sRoots}
          loading={SM.create.isPending || SM.update.isPending}
          onSubmit={(form) => {
            if (editSection) {
              SM.update.mutate({ id: editSection.id, data: form }, { onSuccess: () => setEditSection(null) })
            } else {
              SM.create.mutate(form, { onSuccess: () => { setShowCreateS(false); setAddChildTo(null); toast.success('Section added') } })
            }
          }}
        />
      </Modal>

      <Modal open={showCreateT} onClose={() => setShowCreateT(false)} title="New template">
        <CreateTemplateForm onClose={() => setShowCreateT(false)}
          onCreated={(newId) => { setShowCreateT(false); if (newId) setActiveTemplate(newId) }} />
      </Modal>

      <Modal open={!!editTemplateRow} onClose={() => setEditTemplateRow(null)} title="Edit template">
        <EditTemplateRowForm template={editTemplateRow} onClose={() => setEditTemplateRow(null)} />
      </Modal>

      <ConfirmDialog
        open={!!deleteControl}
        title="Delete control"
        description={`Delete "${deleteControl?.name}"? It will be removed from all sections it's mapped to.`}
        confirmLabel="Delete" variant="destructive" loading={CM.del.isPending}
        onConfirm={() => CM.del.mutate(deleteControl.id, { onSuccess: () => setDeleteControl(null) })}
        onCancel={() => setDeleteControl(null)}
      />

      <ConfirmDialog
        open={!!deleteSection}
        title="Delete section"
        description={`Delete "${deleteSection?.name}" and all its children? Controls in this section will be unmapped but not deleted.`}
        confirmLabel="Delete" variant="destructive" loading={SM.del.isPending}
        onConfirm={() => SM.del.mutate(deleteSection.id, { onSuccess: () => setDeleteSection(null) })}
        onCancel={() => setDeleteSection(null)}
      />

      <ConfirmDialog
        open={!!deleteTemplate}
        title="Delete template"
        description={`Delete "${deleteTemplate?.name}"? Existing engagements that used this template are not affected.`}
        confirmLabel="Delete" variant="destructive" loading={TM.del.isPending}
        onConfirm={() => TM.del.mutate(deleteTemplate.id, { onSuccess: () => setDeleteTemplate(null) })}
        onCancel={() => setDeleteTemplate(null)}
      />
    </PageLayout>
  )
}