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
  Link2, FolderKanban, ExternalLink,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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
import { DynamicSelect } from '../../../components/ui/Select'
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
  { key: 'projects',  label: 'Projects',  icon: FolderKanban },
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

/** NEW: Tests currently linked to a library control */
const useControlTests = (controlId) => useQuery({
  queryKey: ['audit-library-control-tests', controlId],
  queryFn:  () => auditApi.library.controls.listTests(controlId),
  enabled:  !!controlId,
})

/** NEW: Policies currently linked to a library control */
const useControlPolicies = (controlId) => useQuery({
  queryKey: ['audit-library-control-policies', controlId],
  queryFn:  () => auditApi.library.controls.listPolicies(controlId),
  enabled:  !!controlId,
})

/** NEW: All tests — for the link-test picker inside ControlPickerModal */
const useAllTests = () => useQuery({
  queryKey: ['audit-library-tests-all'],
  queryFn:  () => auditApi.library.tests.list({ skip: 0, take: 500 }),
})

/** NEW: All policies — for the link-policy picker inside ControlPickerModal */
const useAllPolicies = () => useQuery({
  queryKey: ['audit-library-policies-all'],
  queryFn:  () => auditApi.library.policies.list({ skip: 0, take: 500 }),
})

/** Get active options for a componentKey from screenConfig.
 *  Global components (screen=null) are included in every screen's config.
 */
const useUiComponentOptions = (componentKey) => {
  const { data: config } = useScreenConfig('audit_library')
  const options = config?.components?.[componentKey]?.options ?? []
  return { data: options.filter(o => o.isActive !== false) }
}

// ── Mutation Hooks ────────────────────────────────────────────────────────────

function makeControlMutations() {
  const qc = useQueryClient()
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['audit-library-controls'] })
    qc.invalidateQueries({ queryKey: ['audit-library-controls-all'] })
  }
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
    qc.invalidateQueries({ queryKey: ['audit-library-sections-all'] })
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
      qc.invalidateQueries({ queryKey: ['audit-library-sections-all'] })
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
  ? <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] bg-brand-500/10 text-brand-ink border border-brand-500/20">{tag}</span>
  : <span className="text-[10px] text-text-muted italic">—</span>

// ─── Inline row action buttons ─────────────────────────────────────────────────

// `editable` comes from the API (false for global library rows a tenant may not
// modify). The server refuses these writes regardless — this only stops the UI
// offering a button whose sole outcome is a 403.
const RowActions = ({ onEdit, onDelete, editable = true }) => (
  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
    {editable ? (
      <>
        <button onClick={onEdit} title="Edit"
          className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
          <Pencil size={12} />
        </button>
        <button onClick={onDelete} title="Delete"
          className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors">
          <Trash2 size={12} />
        </button>
      </>
    ) : (
      <span title="Maintained by the platform — read-only for your organisation"
        className="h-6 w-6 flex items-center justify-center text-text-muted">
        <Lock size={11} />
      </span>
    )}
  </div>
)

/** Global vs org origin, shown next to library rows so read-only is legible. */
const OriginBadge = ({ origin }) => origin === 'GLOBAL'
  ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-surface-overlay text-text-muted border border-border">Global</span>
  : <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-brand-500/10 text-brand-ink border border-brand-500/20">Org</span>

// ─── Control form ─────────────────────────────────────────────────────────────

function ControlForm({ initial, onSubmit, loading }) {
  const [form, setForm] = useState({
    name: '', description: '', controlCode: '', frameworkRef: '',
    testType: 'DOCUMENT_REVIEW', controlTag: '', evidenceGuidance: '',
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
        </div>
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
          placeholder="What this control tests and what evidence is expected"
          className="w-full px-3 py-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Evidence guidance
          <span className="ml-1 text-text-muted font-normal">(what the auditor should ask for)</span>
        </label>
        <textarea value={form.evidenceGuidance} onChange={e => set('evidenceGuidance', e.target.value)} rows={3}
          placeholder={'e.g. Screenshot of MFA enforcement policy\nUser access review sign-off for the period\nExport of privileged accounts'}
          className="w-full px-3 py-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
        <p className="text-[10px] text-text-muted mt-1">
          One item per line. Snapshotted into every control instance when an engagement is created,
          so later edits do not change engagements already under way.
        </p>
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
          <Loader2 size={16} className="text-brand-ink animate-spin" />
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
                    <span className="text-[10px] text-status-fail-fg font-medium">Required</span>
                  )}
                  {ctrl.controlTag && <GuardTagBadge tag={ctrl.controlTag} />}
                </div>
              </div>
              <button
                onClick={() => setRemoveTarget(ctrl)}
                title="Remove from section"
                className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors opacity-0 group-hover:opacity-100">
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
              ? <span className="text-brand-ink">"{selected.name.slice(0, 50)}{selected.name.length > 50 ? '…' : ''}" selected</span>
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
                className="h-7 pl-8 pr-3 w-full rounded-ctl border border-border bg-surface-raised text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="h-7 appearance-none pl-2 pr-6 rounded-ctl border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">All types</option>
              {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto rounded-card border border-border divide-y divide-border">
            {isLoading && <div className="flex items-center justify-center py-12"><Loader2 size={18} className="text-brand-ink animate-spin" /></div>}
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
                {selected?.id === c.id && <CheckCircle2 size={14} className="text-brand-ink shrink-0 mt-0.5" />}
              </button>
            ))}
          </div>
        </div>

        {/* Right: config panel */}
        <div className="w-52 shrink-0">
          <div className="p-3 rounded-card bg-surface-overlay border border-border">
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
                    className="h-7 w-full rounded-ctl border border-border bg-surface-raised px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <button type="button" onClick={() => setMandatory(m => !m)}
                    className={cn('relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0',
                      mandatory ? 'bg-brand-500' : 'bg-surface-raised border border-border')}>
                    <span className={cn('inline-block h-3 w-3 transform rounded-full bg-surface-raised transition-transform',
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
          <div className="flex items-start gap-2 p-3 bg-status-warn-bg border border-status-warn-bd rounded-card">
            <AlertCircle size={13} className="text-status-warn-fg mt-0.5 shrink-0" />
            <p className="text-xs text-status-warn-fg leading-relaxed">
              Only <span className="font-semibold text-status-warn-fg">root sections</span> (depth 0, no parent)
              can be mapped to templates. This section has a parent and cannot be used as a template root.
            </p>
          </div>
        )}

        <div className="p-3 rounded-card border border-border bg-surface-overlay">
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
                className="h-8 pl-8 pr-3 w-full rounded-ctl border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-card border border-border divide-y divide-border">
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={18} className="text-brand-ink animate-spin" />
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
                  {selected?.id === t.id && <CheckCircle2 size={14} className="text-brand-ink shrink-0" />}
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
                  ? 'text-brand-ink bg-brand-500/10'
                  : 'text-text-muted hover:text-brand-ink hover:bg-brand-500/10'
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
                  ? 'text-text-muted hover:text-brand-ink hover:bg-brand-500/10'
                  : 'text-text-muted/30 cursor-not-allowed'
              )}>
              <Link2 size={12} />
            </button>
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
          <div className="rounded-card border border-border overflow-hidden">
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
                { label: 'TEMPLATE', color: 'text-status-tag-fg', note: 'first row — template name + framework' },
                { label: 'SECTION',  color: 'text-status-info-fg',   note: 'level= drives tree depth (0=root, 1=child…)' },
                { label: 'CONTROL',  color: 'text-status-info-fg',   note: 'attaches to deepest current section' },
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
            className={cn('border-2 border-dashed rounded-card p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors',
              selectedFile ? 'border-status-pass-bd bg-status-pass-bg' :
              dragOver ? 'border-brand-500 bg-brand-500/5' :
              'border-border hover:border-border-subtle hover:bg-surface-overlay')}>
            <div className="w-12 h-12 rounded-card bg-surface-overlay flex items-center justify-center">
              {selectedFile ? <CheckCircle2 size={22} className="text-status-pass-fg" /> : <Upload size={22} className="text-text-muted" />}
            </div>
            <div className="text-center">
              {selectedFile ? (
                <><p className="text-sm font-medium text-status-pass-fg">{selectedFile.name}</p><p className="text-xs text-text-muted mt-1">{(selectedFile.size / 1024).toFixed(1)} KB · Click to choose a different file</p></>
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
          <div className="w-16 h-16 rounded-modal bg-brand-500/10 flex items-center justify-center">
            <Loader2 size={28} className="text-brand-ink animate-spin" />
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
            <div className={cn('w-12 h-12 rounded-card flex items-center justify-center shrink-0',
              result.fatalError ? 'bg-status-fail-bg' : errCount > 0 ? 'bg-status-warn-bg' : 'bg-status-pass-bg')}>
              {result.fatalError || errCount > 0
                ? <AlertCircle size={22} className={result.fatalError ? 'text-status-fail-fg' : 'text-status-warn-fg'} />
                : <CheckCircle2 size={22} className="text-status-pass-fg" />}
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
                { label: 'Succeeded', value: result.successCount, color: 'text-status-pass-fg' },
                { label: 'Failed',    value: result.failureCount, color: result.failureCount ? 'text-status-fail-fg' : 'text-text-muted' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-3 bg-surface-overlay rounded-card border border-border text-center">
                  <p className={cn('text-xl font-bold font-mono', color)}>{value ?? 0}</p>
                  <p className="text-xs text-text-muted mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}
          {result.log?.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-card border border-border bg-surface-overlay p-3 flex flex-col gap-0.5 font-mono text-xs">
              {result.log.map((entry, i) => (
                <div key={i} className={cn('flex items-start gap-2',
                  entry.status === 'SUCCESS' && 'text-text-secondary',
                  entry.status === 'ERROR'   && 'text-status-fail-fg',
                  entry.status === 'WARNING' && 'text-status-warn-fg',
                  entry.status === 'INFO'    && 'text-brand-ink')}>
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
  const qc = useQueryClient()
  const { mutate: addSection, isPending } = useAddSection(templateId)
  const { data: libData, isLoading }      = useAllRootSections()
  const [mode, setMode]         = useState('pick')
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null)
  const [newName, setNewName]   = useState('')
  const [newCode, setNewCode]   = useState('')
  const [newFw,   setNewFw]     = useState('')

  const { mutate: createSection, isPending: creating } = useMutation({
    mutationFn: (data) => auditApi.library.sections.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['audit-library-sections'] })
      qc.invalidateQueries({ queryKey: ['audit-library-sections-all'] })
      const created = res?.id ? res : res?.data
      if (created?.id) {
        addSection({ sectionId: created.id, orderNo: nextOrder }, { onSuccess: handleClose })
      } else {
        toast.success('Section created — select it from the list')
        setMode('pick')
        setNewName(''); setNewCode(''); setNewFw('')
      }
    },
    onError: () => toast.error('Failed to create section'),
  })

  const handleClose = () => {
    setMode('pick'); setSearch(''); setSelected(null)
    setNewName(''); setNewCode(''); setNewFw('')
    onClose()
  }

  const allSections = libData?.items ?? libData ?? []
  const filtered = allSections.filter(s =>
    !existingSectionIds.includes(s.id) &&
    (!search || s.name.toLowerCase().includes(search.toLowerCase()))
  )

  const handleAdd = () => {
    if (!selected) return
    addSection({ sectionId: selected.id, orderNo: nextOrder }, { onSuccess: handleClose })
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Root Section"
      subtitle="Select a library section or create a new one to map to this template" size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          {mode === 'pick'
            ? <Button size="sm" loading={isPending} disabled={!selected} onClick={handleAdd}>Add to Template</Button>
            : <Button size="sm" loading={creating || isPending} disabled={!newName.trim()} onClick={() => createSection({ name: newName.trim(), sectionCode: newCode.trim() || null, frameworkRef: newFw.trim() || null, parentId: null })}>Create & Add</Button>
          }
        </div>
      }>

      {/* Mode tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 p-1 rounded-card bg-surface-overlay border border-border w-fit">
          {[{ key: 'pick', label: 'Pick from library' }, { key: 'create', label: 'Create new' }].map(t => (
            <button key={t.key} onClick={() => setMode(t.key)}
              className={cn('px-3 py-1.5 text-xs rounded-ctl font-medium transition-colors flex items-center gap-1',
                mode === t.key ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary')}>
              {t.key === 'create' && <Plus size={11} />}{t.label}
            </button>
          ))}
        </div>
        {mode === 'create' && (
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span className="flex items-center justify-center h-4 w-4 rounded-full bg-brand-500 text-brand-900 text-[9px] font-bold">1</span>
            <span className="text-text-secondary font-medium">Fill details</span>
            <span>→</span>
            <span className="flex items-center justify-center h-4 w-4 rounded-full bg-surface-overlay border border-border text-[9px] font-bold">2</span>
            <span>Link tests &amp; policies</span>
          </div>
        )}
      </div>

      {mode === 'pick' && (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sections…"
              className="h-8 pl-8 pr-3 w-full rounded-ctl border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-card border border-border divide-y divide-border">
            {isLoading && <div className="flex items-center justify-center py-10"><Loader2 size={18} className="text-brand-ink animate-spin" /></div>}
            {!isLoading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10">
                <BookOpen size={20} className="text-text-muted mb-2" />
                <p className="text-xs text-text-muted mb-3">{allSections.length === 0 ? 'No root sections in library.' : 'No matching sections.'}</p>
                <Button size="xs" variant="secondary" icon={Plus} onClick={() => setMode('create')}>Create new section</Button>
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
                {selected?.id === s.id && <CheckCircle2 size={14} className="text-brand-ink shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'create' && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Section name *</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. A — Organisational Controls"
              className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Section code</label>
              <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="e.g. A, CC6"
                className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
              <input value={newFw} onChange={e => setNewFw(e.target.value)} placeholder="e.g. ISO 27001"
                className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-brand-500/5 border border-brand-500/20 rounded-card">
            <AlertCircle size={12} className="text-brand-ink mt-0.5 shrink-0" />
            <p className="text-[11px] text-brand-ink/80 leading-relaxed">Creates a new root section in the library and maps it to this template immediately.</p>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Control Picker Modal (builder) ───────────────────────────────────────────

function ControlPickerModal({ open, sectionId, sectionName, templateId, existingControlIds, nextOrder, onClose }) {
  const qc = useQueryClient()
  const { mutate: addControl, isPending } = useAddControl(templateId)
  const { data: libData, isLoading }      = useAllControls()
  const [mode, setMode]             = useState('pick')
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selected, setSelected]     = useState(null)
  const [weight, setWeight]         = useState('')
  const [mandatory, setMandatory]   = useState(false)
  const [rightTab, setRightTab]     = useState('config')

  // Create-new state
  const [newName, setNewName]   = useState('')
  const [newCode, setNewCode]   = useState('')
  const [newFw,   setNewFw]     = useState('')
  const [newType, setNewType]   = useState('DOCUMENT_REVIEW')
  const [newTag,  setNewTag]    = useState('')
  const [newDesc, setNewDesc]   = useState('')
  const [newGuide, setNewGuide] = useState('')

  // Step-2: control just created — stay open for test/policy mapping
  const [createdControl, setCreatedControl] = useState(null) // { id, name, controlCode }

  // Test/Policy picker state (for right panel tabs)
  const [testSearch, setTestSearch] = useState('')
  const [polSearch,  setPolSearch]  = useState('')
  const [showTestPicker, setShowTestPicker]   = useState(false)
  const [showPolPicker,  setShowPolPicker]    = useState(false)

  // The "active" control for test/policy queries — createdControl in step-2, selected in pick mode
  const activeControlId = createdControl?.id ?? selected?.id ?? null

  const { data: linkedTestsRaw, isLoading: loadingLinkedTests }     = useControlTests(activeControlId)
  const { data: linkedPolsRaw,  isLoading: loadingLinkedPolicies }  = useControlPolicies(activeControlId)
  const { data: allTestsRaw,    isLoading: loadingAllTests }        = useAllTests()
  const { data: allPolsRaw,     isLoading: loadingAllPolicies }     = useAllPolicies()

  const linkedTests    = Array.isArray(linkedTestsRaw) ? linkedTestsRaw : (linkedTestsRaw?.items ?? linkedTestsRaw?.data ?? [])
  const linkedPolicies = Array.isArray(linkedPolsRaw)  ? linkedPolsRaw  : (linkedPolsRaw?.items  ?? linkedPolsRaw?.data  ?? [])
  const allTests       = Array.isArray(allTestsRaw)    ? allTestsRaw    : (allTestsRaw?.items    ?? allTestsRaw?.data    ?? [])
  const allPolicies    = Array.isArray(allPolsRaw)     ? allPolsRaw     : (allPolsRaw?.items     ?? allPolsRaw?.data     ?? [])

  const linkedTestIds = linkedTests.map(t => t.id ?? t.testId)
  const linkedPolIds  = linkedPolicies.map(p => p.id ?? p.policyId)

  const { mutate: linkTest,     isPending: linkingTest }     = useMutation({ mutationFn: (testId)   => auditApi.library.controls.linkTest(activeControlId, testId),   onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-library-control-tests',    activeControlId] }); toast.success('Test linked')   }, onError: () => toast.error('Failed') })
  const { mutate: unlinkTest,   isPending: unlinkingTest }   = useMutation({ mutationFn: (testId)   => auditApi.library.controls.unlinkTest(activeControlId, testId), onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-library-control-tests',    activeControlId] }); toast.success('Test unlinked') }, onError: () => toast.error('Failed') })
  const { mutate: linkPolicy,   isPending: linkingPolicy }   = useMutation({ mutationFn: (policyId) => auditApi.library.controls.linkPolicy(activeControlId, policyId),   onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-library-control-policies', activeControlId] }); toast.success('Policy linked')   }, onError: () => toast.error('Failed') })
  const { mutate: unlinkPolicy, isPending: unlinkingPolicy } = useMutation({ mutationFn: (policyId) => auditApi.library.controls.unlinkPolicy(activeControlId, policyId), onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-library-control-policies', activeControlId] }); toast.success('Policy unlinked') }, onError: () => toast.error('Failed') })

  const availableTests    = allTests.filter(t => !linkedTestIds.includes(t.id ?? t.testId) && (!testSearch || t.name.toLowerCase().includes(testSearch.toLowerCase())))
  const availablePolicies = allPolicies.filter(p => !linkedPolIds.includes(p.id ?? p.policyId) && (!polSearch || p.title.toLowerCase().includes(polSearch.toLowerCase())))

  // Create-new test state (step 2 test panel)
  const [showCreateTestStep2, setShowCreateTestStep2] = useState(false)
  const [nt2Name, setNt2Name] = useState('')
  const [nt2Ref,  setNt2Ref]  = useState('')
  const [nt2Freq, setNt2Freq] = useState('')
  const [nt2Auto, setNt2Auto] = useState('MANUAL')
  const { data: freqOptions = [] } = useUiComponentOptions('audit_test_frequency')

  const { mutate: createAndLinkTestStep2, isPending: creatingTestStep2 } = useMutation({
    mutationFn: async (data) => {
      const res     = await auditApi.library.tests.create(data)
      const created = res?.id ? res : res?.data
      if (created?.id) await auditApi.library.controls.linkTest(activeControlId, created.id)
      return created
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-library-control-tests', activeControlId] })
      qc.invalidateQueries({ queryKey: ['audit-library-tests-all'] })
      toast.success('Test created and linked')
      setShowCreateTestStep2(false)
      setNt2Name(''); setNt2Ref(''); setNt2Freq(''); setNt2Auto('MANUAL')
    },
    onError: () => toast.error('Failed to create test'),
  })

  const { mutate: createControl, isPending: creating } = useMutation({
    mutationFn: (data) => auditApi.library.controls.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['audit-library-controls'] })
      qc.invalidateQueries({ queryKey: ['audit-library-controls-all'] })
      const created = res?.id ? res : res?.data
      if (created?.id) {
        addControl(
          { sectionId, controlId: created.id, data: { orderNo: nextOrder, weight: parseFloat(weight) || 1.0, isMandatory: mandatory } },
          {
            onSuccess: () => {
              // Stay open — transition to step 2 for test/policy mapping
              setCreatedControl({ id: created.id, name: created.name ?? newName, controlCode: (created.controlCode ?? newCode) || null })
              toast.success('Control created and mapped — now link tests & policies')
            },
          }
        )
      } else {
        toast.success('Control created — select it from the list')
        setMode('pick')
        setNewName(''); setNewCode(''); setNewFw(''); setNewType('DOCUMENT_REVIEW'); setNewTag(''); setNewDesc(''); setNewGuide('')
      }
    },
    onError: () => toast.error('Failed to create control'),
  })

  const handleClose = () => {
    setMode('pick'); setSearch(''); setTypeFilter(''); setSelected(null)
    setWeight(''); setMandatory(false); setRightTab('config')
    setNewName(''); setNewCode(''); setNewFw(''); setNewType('DOCUMENT_REVIEW'); setNewTag(''); setNewDesc(''); setNewGuide('')
    setTestSearch(''); setPolSearch(''); setShowTestPicker(false); setShowPolPicker(false)
    setShowCreateTestStep2(false); setNt2Name(''); setNt2Ref(''); setNt2Freq(''); setNt2Auto('MANUAL')
    setCreatedControl(null)
    onClose()
  }

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
      { onSuccess: handleClose }
    )
  }

  // ── Shared Test/Policy link panels (used in both pick right-panel and step-2) ──
  const testLinkPanelJsx = (
    <div className="flex flex-col gap-2">
      <div className="rounded-card border border-border divide-y divide-border">
        {loadingLinkedTests && <div className="flex justify-center py-3"><Loader2 size={13} className="text-brand-ink animate-spin" /></div>}
        {!loadingLinkedTests && linkedTests.length === 0 && <p className="text-[11px] text-text-muted px-3 py-3">No tests linked yet.</p>}
        {!loadingLinkedTests && linkedTests.map(t => {
          const id = t.id ?? t.testId
          return (
            <div key={id} className="flex items-center gap-2 px-2 py-1.5 group">
              <div className="flex-1 min-w-0">
                {t.testRef && <span className="font-mono text-[9px] text-brand-ink mr-1">{t.testRef}</span>}
                <span className="text-[11px] text-text-primary line-clamp-1">{t.testName ?? t.name}</span>
              </div>
              <button onClick={() => unlinkTest(id)} disabled={unlinkingTest}
                className="h-4 w-4 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg opacity-0 group-hover:opacity-100 transition-all">
                <Trash2 size={9} />
              </button>
            </div>
          )
        })}
      </div>
      {/* Link existing */}
      <button onClick={() => { setShowTestPicker(v => !v); setShowCreateTestStep2(false) }}
        className="flex items-center gap-1 text-[11px] text-brand-ink hover:text-brand-ink">
        <Plus size={10} /> {showTestPicker ? 'Hide' : 'Link existing test'}
      </button>
      {showTestPicker && (
        <div className="flex flex-col gap-1">
          <div className="relative">
            <Search size={9} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={testSearch} onChange={e => setTestSearch(e.target.value)} placeholder="Search tests…"
              className="h-6 pl-5 pr-2 w-full rounded border border-border bg-surface-raised text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div className="max-h-32 overflow-y-auto rounded-card border border-border divide-y divide-border">
            {loadingAllTests && <div className="flex justify-center py-3"><Loader2 size={12} className="text-brand-ink animate-spin" /></div>}
            {!loadingAllTests && availableTests.length === 0 && <p className="text-[11px] text-text-muted px-2 py-2">No available tests.</p>}
            {!loadingAllTests && availableTests.map(t => {
              const id = t.id ?? t.testId
              return (
                <button key={id} onClick={() => linkTest(id)} disabled={linkingTest}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 hover:bg-surface-overlay transition-colors">
                  <div className="flex-1 min-w-0">
                    {t.testRef && <span className="font-mono text-[9px] text-brand-ink mr-1">{t.testRef}</span>}
                    <span className="text-[11px] text-text-primary line-clamp-1">{t.testName ?? t.name}</span>
                  </div>
                  <Plus size={9} className="text-text-muted shrink-0" />
                </button>
              )
            })}
          </div>
        </div>
      )}
      {/* Create new test */}
      <button onClick={() => { setShowCreateTestStep2(v => !v); setShowTestPicker(false) }}
        className="flex items-center gap-1 text-[11px] text-brand-ink hover:text-brand-ink">
        <Plus size={10} /> {showCreateTestStep2 ? 'Hide' : 'Create new test'}
      </button>
      {showCreateTestStep2 && (
        <div className="flex flex-col gap-2 p-2 rounded-card border border-border bg-surface-overlay">
          <input value={nt2Name} onChange={e => setNt2Name(e.target.value)} placeholder="Test name *"
            className="h-6 px-2 w-full rounded border border-border bg-surface-raised text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          <div className="grid grid-cols-2 gap-1.5">
            <input value={nt2Ref} onChange={e => setNt2Ref(e.target.value)} placeholder="Ref (e.g. T-01)"
              className="h-6 px-2 rounded border border-border bg-surface-raised text-[11px] font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          <select value={nt2Freq} onChange={e => setNt2Freq(e.target.value)}
            className="h-6 px-2 rounded border border-border bg-surface-raised text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="">Frequency</option>
            {freqOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          </div>
          <select value={nt2Auto} onChange={e => setNt2Auto(e.target.value)}
            className="h-6 px-2 rounded border border-border bg-surface-raised text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="MANUAL">Manual</option>
            <option value="AUTOMATED">Automated</option>
          </select>
          <button onClick={() => createAndLinkTestStep2({ name: nt2Name.trim(), testRef: nt2Ref.trim() || null, frequency: nt2Freq || null, automationType: nt2Auto })}
            disabled={!nt2Name.trim() || creatingTestStep2}
            className="h-6 px-3 rounded text-[11px] font-medium bg-brand-500 text-brand-900 disabled:opacity-50 hover:bg-brand-600 transition-colors flex items-center justify-center gap-1">
            {creatingTestStep2 ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
            Create &amp; Link
          </button>
        </div>
      )}
    </div>
  )

  const policyLinkPanelJsx = (
    <div className="flex flex-col gap-2">
      <div className="rounded-card border border-border divide-y divide-border">
        {loadingLinkedPolicies && <div className="flex justify-center py-3"><Loader2 size={13} className="text-brand-ink animate-spin" /></div>}
        {!loadingLinkedPolicies && linkedPolicies.length === 0 && <p className="text-[11px] text-text-muted px-3 py-3">No policies linked yet.</p>}
        {!loadingLinkedPolicies && linkedPolicies.map(p => {
          const id = p.id ?? p.policyId
          return (
            <div key={id} className="flex items-center gap-2 px-2 py-1.5 group">
              <div className="flex-1 min-w-0">
                {p.policyRef && <span className="font-mono text-[9px] text-brand-ink mr-1">{p.policyRef}</span>}
                <span className="text-[11px] text-text-primary line-clamp-1">{p.title}</span>
              </div>
              <button onClick={() => unlinkPolicy(id)} disabled={unlinkingPolicy}
                className="h-4 w-4 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg opacity-0 group-hover:opacity-100 transition-all">
                <Trash2 size={9} />
              </button>
            </div>
          )
        })}
      </div>
      <button onClick={() => setShowPolPicker(v => !v)}
        className="flex items-center gap-1 text-[11px] text-brand-ink hover:text-brand-ink">
        <Plus size={10} /> {showPolPicker ? 'Hide' : 'Link a policy'}
      </button>
      {showPolPicker && (
        <div className="flex flex-col gap-1">
          <div className="relative">
            <Search size={9} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={polSearch} onChange={e => setPolSearch(e.target.value)} placeholder="Search policies…"
              className="h-6 pl-5 pr-2 w-full rounded border border-border bg-surface-raised text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div className="max-h-32 overflow-y-auto rounded-card border border-border divide-y divide-border">
            {loadingAllPolicies && <div className="flex justify-center py-3"><Loader2 size={12} className="text-brand-ink animate-spin" /></div>}
            {!loadingAllPolicies && availablePolicies.length === 0 && <p className="text-[11px] text-text-muted px-2 py-2">No available policies.</p>}
            {!loadingAllPolicies && availablePolicies.map(p => {
              const id = p.id ?? p.policyId
              return (
                <button key={id} onClick={() => linkPolicy(id)} disabled={linkingPolicy}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 hover:bg-surface-overlay transition-colors">
                  <div className="flex-1 min-w-0">
                    {p.policyRef && <span className="font-mono text-[9px] text-brand-ink mr-1">{p.policyRef}</span>}
                    <span className="text-[11px] text-text-primary line-clamp-1">{p.title}</span>
                  </div>
                  <Plus size={9} className="text-text-muted shrink-0" />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  // ── Right panel: Config / Tests / Policies tabs (pick mode) ──
  const rightPanelJsx = (
    <div className="w-56 shrink-0 flex flex-col gap-2">
      <div className="flex gap-0.5 p-0.5 rounded-ctl bg-surface-overlay border border-border">
        {[{ key: 'config', label: 'Config' }, { key: 'tests', label: 'Tests' }, { key: 'policies', label: 'Policies' }].map(t => (
          <button key={t.key} onClick={() => setRightTab(t.key)}
            className={cn('flex-1 py-1 text-[10px] rounded font-medium transition-colors',
              rightTab === t.key ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary')}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 p-3 rounded-card bg-surface-overlay border border-border overflow-y-auto" style={{ maxHeight: '360px' }}>

        {/* ── Config tab ── */}
        {rightTab === 'config' && (
          <>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Config in this section</p>
            {!selected ? (
              <p className="text-xs text-text-muted">Select a control on the left.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="p-2 rounded bg-surface-raised border border-border">
                  <p className="text-[11px] text-text-muted mb-1">Selected</p>
                  <p className="text-xs text-text-primary line-clamp-3">{selected.name}</p>
                  {selected.controlCode && <p className="text-[10px] font-mono text-text-muted mt-1">{selected.controlCode}</p>}
                </div>
                <div>
                  <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wide block mb-1">Weight</label>
                  <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="1.0"
                    className="h-7 w-full rounded-ctl border border-border bg-surface-raised px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <button type="button" onClick={() => setMandatory(m => !m)}
                    className={cn('relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0',
                      mandatory ? 'bg-brand-500' : 'bg-surface-raised border border-border')}>
                    <span className={cn('inline-block h-3 w-3 transform rounded-full bg-surface-raised transition-transform',
                      mandatory ? 'translate-x-3.5' : 'translate-x-0.5')} />
                  </button>
                  <span className="text-xs text-text-primary">Mandatory</span>
                </label>
                <p className="text-[10px] text-text-muted">Position {nextOrder} in section.</p>
              </div>
            )}
          </>
        )}

        {/* ── Tests tab ── */}
        {rightTab === 'tests' && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
              Linked tests {selected && <span className="font-normal text-text-muted">({linkedTests.length})</span>}
            </p>
            {!selected ? <p className="text-xs text-text-muted">Select a control first.</p> : testLinkPanelJsx}
          </div>
        )}

        {/* ── Policies tab ── */}
        {rightTab === 'policies' && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
              Linked policies {selected && <span className="font-normal text-text-muted">({linkedPolicies.length})</span>}
            </p>
            {!selected ? <p className="text-xs text-text-muted">Select a control first.</p> : policyLinkPanelJsx}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <Modal open={open} onClose={handleClose} title="Add Control from Library"
      subtitle={sectionName ? `Map a control into section: ${sectionName}` : 'Map a control into this section'}
      size="xl"
      footer={
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            {createdControl
              ? <span className="text-status-pass-fg">✓ "{createdControl.name}" created and mapped</span>
              : mode === 'pick'
                ? selected
                  ? <span className="text-brand-ink">"{selected.name.slice(0, 50)}{selected.name.length > 50 ? '…' : ''}" selected</span>
                  : 'No control selected'
                : <span className="text-brand-ink">New control will be created and mapped</span>}
          </p>
          <div className="flex gap-2">
            {createdControl
              ? <Button size="sm" onClick={handleClose}>Done</Button>
              : <>
                  <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
                  {mode === 'pick'
                    ? <Button size="sm" loading={isPending} onClick={handleAdd} disabled={!selected}>Add to Section</Button>
                    : <Button size="sm" loading={creating || isPending} onClick={() => createControl({ name: newName.trim(), controlCode: newCode.trim() || null, frameworkRef: newFw.trim() || null, testType: newType, controlTag: newTag.trim().toUpperCase() || null, description: newDesc.trim() || null, evidenceGuidance: newGuide.trim() || null })} disabled={!newName.trim()}>Create & Add</Button>
                  }
                </>
            }
          </div>
        </div>
      }>

      {/* ── Step 2: control created — map tests & policies ── */}
      {createdControl ? (
        <div className="flex flex-col gap-4">
          {/* Step 2 header */}
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center gap-2 text-[11px] text-text-muted">
              <span className="flex items-center justify-center h-4 w-4 rounded-full bg-surface-overlay border border-border text-[9px] font-bold line-through opacity-50">1</span>
              <span className="line-through opacity-50">Fill details</span>
              <span>→</span>
              <span className="flex items-center justify-center h-4 w-4 rounded-full bg-brand-500 text-brand-900 text-[9px] font-bold">2</span>
              <span className="text-text-secondary font-medium">Link tests &amp; policies</span>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-card bg-status-pass-bg border border-status-pass-bd">
            <CheckCircle2 size={16} className="text-status-pass-fg shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {createdControl.name}
                {createdControl.controlCode && <span className="font-mono text-[11px] text-text-muted ml-2">{createdControl.controlCode}</span>}
              </p>
              <p className="text-xs text-text-muted mt-0.5">Created and mapped to this section. Optionally link tests and policies below, then click Done.</p>
            </div>
          </div>

          {/* Two-column: Tests | Policies */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                Tests <span className="font-normal normal-case text-text-muted">({linkedTests.length} linked)</span>
              </p>
              {testLinkPanelJsx}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                Policies <span className="font-normal normal-case text-text-muted">({linkedPolicies.length} linked)</span>
              </p>
              {policyLinkPanelJsx}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Mode tabs */}
          <div className="flex gap-1 mb-4 p-1 rounded-card bg-surface-overlay border border-border w-fit">
            {[{ key: 'pick', label: 'Pick from library' }, { key: 'create', label: 'Create new' }].map(t => (
              <button key={t.key} onClick={() => setMode(t.key)}
                className={cn('px-3 py-1.5 text-xs rounded-ctl font-medium transition-colors flex items-center gap-1',
                  mode === t.key ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary')}>
                {t.key === 'create' && <Plus size={11} />}{t.label}
              </button>
            ))}
          </div>

          {mode === 'pick' && (
            <div className="flex gap-4 h-[400px]">
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search controls…"
                      className="h-7 pl-8 pr-3 w-full rounded-ctl border border-border bg-surface-raised text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </div>
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                    className="h-7 appearance-none pl-2 pr-6 rounded-ctl border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                    <option value="">All types</option>
                    {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="flex-1 overflow-y-auto rounded-card border border-border divide-y divide-border">
                  {isLoading && <div className="flex items-center justify-center py-12"><Loader2 size={18} className="text-brand-ink animate-spin" /></div>}
                  {!isLoading && filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10">
                      <Shield size={20} className="text-text-muted mb-2" />
                      <p className="text-xs text-text-muted mb-3">{allControls.length === 0 ? 'No controls in library.' : 'No matching controls.'}</p>
                      <Button size="xs" variant="secondary" icon={Plus} onClick={() => setMode('create')}>Create new control</Button>
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
                      {selected?.id === c.id && <CheckCircle2 size={14} className="text-brand-ink shrink-0 mt-0.5" />}
                    </button>
                  ))}
                </div>
              </div>
              {rightPanelJsx}
            </div>
          )}

          {mode === 'create' && (
            <div className="flex gap-4">
              <div className="flex-1 flex flex-col gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Control name *</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. User access management"
                    className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Control code</label>
                    <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="e.g. CC6.1, A.9.1.1"
                      className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
                    <input value={newFw} onChange={e => setNewFw(e.target.value)} placeholder="e.g. SOC 2, ISO 27001"
                      className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Test type</label>
                    <select value={newType} onChange={e => setNewType(e.target.value)}
                      className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                      {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Guard tag</label>
                    <input value={newTag} onChange={e => setNewTag(e.target.value.toUpperCase())} placeholder="e.g. MFA, ENCRYPTION"
                      className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Description</label>
                  <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2}
                    className="w-full px-3 py-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">
                    Evidence guidance
                    <span className="ml-1 text-text-muted font-normal">(one item per line)</span>
                  </label>
                  <textarea value={newGuide} onChange={e => setNewGuide(e.target.value)} rows={2}
                    placeholder="What the auditor should ask for to test this control"
                    className="w-full px-3 py-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
                <div className="flex items-start gap-2 p-3 bg-brand-500/5 border border-brand-500/20 rounded-card">
                  <AlertCircle size={12} className="text-brand-ink mt-0.5 shrink-0" />
                  <p className="text-[11px] text-brand-ink/80 leading-relaxed">Control will be added to the library and immediately mapped into this section. You can link tests and policies on the next step.</p>
                </div>
              </div>
              <div className="w-56 shrink-0">
                <div className="p-3 rounded-card bg-surface-overlay border border-border">
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Mapping config</p>
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-text-secondary uppercase tracking-wide block mb-1">Weight</label>
                      <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="1.0"
                        className="h-7 w-full rounded-ctl border border-border bg-surface-raised px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <button type="button" onClick={() => setMandatory(m => !m)}
                        className={cn('relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0',
                          mandatory ? 'bg-brand-500' : 'bg-surface-raised border border-border')}>
                        <span className={cn('inline-block h-3 w-3 transform rounded-full bg-surface-raised transition-transform',
                          mandatory ? 'translate-x-3.5' : 'translate-x-0.5')} />
                      </button>
                      <span className="text-xs text-text-primary">Mandatory</span>
                    </label>
                    <p className="text-[10px] text-text-muted">Position {nextOrder} in section.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
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
        <div className="flex items-start gap-2 p-3 bg-status-warn-bg border border-status-warn-bd rounded-card">
          <AlertCircle size={13} className="text-status-warn-fg mt-0.5 shrink-0" />
          <p className="text-xs text-status-warn-fg leading-relaxed">
            This edits the{' '}
            <span className="font-semibold text-status-warn-fg">shared library section</span> — changes
            will appear in every template that uses it.
          </p>
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Section name *</label>
          <input value={name} onChange={e => { setName(e.target.value); setError('') }}
            placeholder={displayName || 'Section name'}
            className={cn('w-full h-9 px-3 rounded-ctl border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500',
              error ? 'border-status-fail-bd' : 'border-border')} />
          {error && <p className="text-xs text-status-fail-fg mt-1">{error}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Section code</label>
            <input value={sectionCode} onChange={e => setCode(e.target.value)} placeholder="e.g. A.9"
              className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
            <input value={frameworkRef} onChange={e => setFw(e.target.value)} placeholder="e.g. ISO 27001"
              className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
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
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Section code</label>
            <input
              value={form.sectionCode}
              onChange={e => set('sectionCode', e.target.value)}
              placeholder="e.g. A.5.1"
              className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Framework ref</label>
            <input
              value={form.frameworkRef}
              onChange={e => set('frameworkRef', e.target.value)}
              placeholder="e.g. ISO 27001"
              className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
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
  const qc = useQueryClient()
  const [showEdit, setShowEdit]     = useState(false)
  const [showRemove, setShowRemove] = useState(false)
  const [editTab, setEditTab]       = useState('details') // 'details' | 'tests' | 'policies'

  // ── Library-level fields (shared — edits affect every template using this control) ──
  const [libName, setLibName]         = useState('')
  const [libCode, setLibCode]         = useState('')
  const [libFw, setLibFw]             = useState('')
  const [libTestType, setLibTestType] = useState('DOCUMENT_REVIEW')
  const [libTag, setLibTag]           = useState('')
  const [libDesc, setLibDesc]         = useState('')
  const [libGuide, setLibGuide]       = useState('')
  const [libErrors, setLibErrors]     = useState({})

  // ── Mapping-level fields (specific to this section’s mapping) ──
  const [mapWeight, setMapWeight]       = useState('')
  const [mapMandatory, setMapMandatory] = useState(false)

  // ── Test/Policy link state (in edit modal) ──
  const [testSearch,     setTestSearch]     = useState('')
  const [polSearch,      setPolSearch]      = useState('')
  const [showTestPicker, setShowTestPicker] = useState(false)
  const [showPolPicker,  setShowPolPicker]  = useState(false)
  const [showCreateTest,  setShowCreateTest]  = useState(false)
  const [editingTestId,   setEditingTestId]   = useState(null)
  const [etName, setEtName] = useState('')
  const [etRef,  setEtRef]  = useState('')
  const [etFreq, setEtFreq] = useState('')
  const [etAuto, setEtAuto] = useState('MANUAL')
  const [ntName, setNtName] = useState('')
  const [ntRef,  setNtRef]  = useState('')
  const [ntFreq, setNtFreq] = useState('')
  const [ntAuto, setNtAuto] = useState('MANUAL')
  const { data: freqOptions = [] } = useUiComponentOptions('audit_test_frequency')

  const { data: linkedTestsRaw,    isLoading: loadingLT } = useControlTests(showEdit ? control.controlId : null)
  const { data: linkedPoliciesRaw, isLoading: loadingLP } = useControlPolicies(showEdit ? control.controlId : null)
  const { data: allTestsRaw,       isLoading: loadingAT } = useAllTests()
  const { data: allPolsRaw,        isLoading: loadingAP } = useAllPolicies()

  const linkedTests    = Array.isArray(linkedTestsRaw)    ? linkedTestsRaw    : (linkedTestsRaw?.data    ?? [])
  const linkedPolicies = Array.isArray(linkedPoliciesRaw) ? linkedPoliciesRaw : (linkedPoliciesRaw?.data ?? [])
  const allTests       = Array.isArray(allTestsRaw)       ? allTestsRaw       : (allTestsRaw?.items      ?? allTestsRaw?.data    ?? [])
  const allPolicies    = Array.isArray(allPolsRaw)        ? allPolsRaw        : (allPolsRaw?.items       ?? allPolsRaw?.data     ?? [])

  const linkedTestIds = linkedTests.map(t => t.id ?? t.testId)
  const linkedPolIds  = linkedPolicies.map(p => p.id ?? p.policyId)

  const availableTests    = allTests.filter(t => !linkedTestIds.includes(t.id ?? t.testId) && (!testSearch || t.name.toLowerCase().includes(testSearch.toLowerCase())))
  const availablePolicies = allPolicies.filter(p => !linkedPolIds.includes(p.id ?? p.policyId) && (!polSearch || p.title.toLowerCase().includes(polSearch.toLowerCase())))

  const invLT = () => qc.invalidateQueries({ queryKey: ['audit-library-control-tests',    control.controlId] })
  const invLP = () => qc.invalidateQueries({ queryKey: ['audit-library-control-policies', control.controlId] })

  const { mutate: linkTest,     isPending: linkingTest }     = useMutation({ mutationFn: (id) => auditApi.library.controls.linkTest(control.controlId, id),     onSuccess: () => { invLT(); toast.success('Test linked')     }, onError: () => toast.error('Failed') })
  const { mutate: unlinkTest,   isPending: unlinkingTest }   = useMutation({ mutationFn: (id) => auditApi.library.controls.unlinkTest(control.controlId, id),   onSuccess: () => { invLT(); toast.success('Test unlinked')   }, onError: () => toast.error('Failed') })
  const { mutate: linkPolicy,   isPending: linkingPolicy }   = useMutation({ mutationFn: (id) => auditApi.library.controls.linkPolicy(control.controlId, id),   onSuccess: () => { invLP(); toast.success('Policy linked')   }, onError: () => toast.error('Failed') })
  const { mutate: unlinkPolicy, isPending: unlinkingPolicy } = useMutation({ mutationFn: (id) => auditApi.library.controls.unlinkPolicy(control.controlId, id), onSuccess: () => { invLP(); toast.success('Policy unlinked') }, onError: () => toast.error('Failed') })

  const { mutate: createAndLinkTest, isPending: creatingTest } = useMutation({
    mutationFn: async (data) => {
      const res     = await auditApi.library.tests.create(data)
      const created = res?.id ? res : res?.data
      if (created?.id) await auditApi.library.controls.linkTest(control.controlId, created.id)
      return created
    },
    onSuccess: () => {
      invLT()
      qc.invalidateQueries({ queryKey: ['audit-library-tests-all'] })
      toast.success('Test created and linked')
      setShowCreateTest(false)
      setNtName(''); setNtRef(''); setNtFreq(''); setNtAuto('MANUAL')
    },
    onError: () => toast.error('Failed to create test'),
  })

  const { mutate: updateTest, isPending: updatingTest } = useMutation({
    mutationFn: ({ id, data }) => auditApi.library.tests.update(id, data),
    onSuccess: () => {
      invLT()
      qc.invalidateQueries({ queryKey: ['audit-library-tests-all'] })
      toast.success('Test updated')
      setEditingTestId(null)
    },
    onError: () => toast.error('Failed to update test'),
  })

  const startEditTest = (t) => {
    const id = t.id ?? t.testId
    setEditingTestId(id)
    setEtName(t.testName ?? t.name ?? '')
    setEtRef(t.testRef ?? '')
    setEtFreq(t.frequency ?? '')
    setEtAuto(t.automationType ?? 'MANUAL')
    setShowTestPicker(false); setShowCreateTest(false)
  }

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
    setLibGuide(control.evidenceGuidance ?? '')
    setMapWeight(String(control.weight ?? '1.0'))
    setMapMandatory(control.mandatory ?? false)
    setLibErrors({})
    setEditTab('details')
    setShowTestPicker(false); setShowPolPicker(false); setShowCreateTest(false)
    setTestSearch(''); setPolSearch('')
    setEditingTestId(null)
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
        // Sent as '' rather than null when cleared: the server treats blank as
        // "remove the guidance", and null as "no change".
        evidenceGuidance: libGuide.trim(),
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
            {control.mandatory && <span className="text-xs text-status-fail-fg font-medium">Required</span>}
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
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg">
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* ── Edit modal: Details / Tests / Policies tabs ── */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Control" size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowEdit(false)}>Close</Button>
            {editTab === 'details' && (
              <Button size="sm" loading={updatingControl || updatingMapping} onClick={handleSave}>Save Changes</Button>
            )}
          </div>
        }>

        {/* Tab strip */}
        <div className="flex gap-1 p-1 rounded-card bg-surface-overlay border border-border w-fit mb-5">
          {[
            { key: 'details',  label: 'Details & Mapping' },
            { key: 'tests',    label: `Tests${linkedTests.length ? ` (${linkedTests.length})` : ''}` },
            { key: 'policies', label: `Policies${linkedPolicies.length ? ` (${linkedPolicies.length})` : ''}` },
          ].map(t => (
            <button key={t.key} onClick={() => setEditTab(t.key)}
              className={cn('px-3 py-1.5 text-xs rounded-ctl font-medium transition-colors',
                editTab === t.key ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Details & Mapping tab ── */}
        {editTab === 'details' && (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-2 p-3 bg-status-warn-bg border border-status-warn-bd rounded-card">
              <AlertCircle size={13} className="text-status-warn-fg mt-0.5 shrink-0" />
              <p className="text-xs text-status-warn-fg leading-relaxed">
                Changes to name, code, test type, and guard tag update the{' '}
                <span className="font-semibold text-status-warn-fg">shared library control</span> — reflected in
                every template that uses it. Weight and mandatory status are specific to this section.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Library Control</p>
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Control name *</label>
                <input value={libName} onChange={e => { setLibName(e.target.value); setLibErrors({}) }}
                  className={cn('w-full h-9 px-3 rounded-ctl border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500',
                    libErrors.libName ? 'border-status-fail-bd' : 'border-border')} />
                {libErrors.libName && <p className="text-xs text-status-fail-fg mt-1">{libErrors.libName}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Control code</label>
                  <input value={libCode} onChange={e => setLibCode(e.target.value)} placeholder="e.g. A.9.1.1"
                    className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Framework ref</label>
                  <input value={libFw} onChange={e => setLibFw(e.target.value)} placeholder="e.g. ISO 27001"
                    className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Test type</label>
                  <select value={libTestType} onChange={e => setLibTestType(e.target.value)}
                    className="h-9 w-full appearance-none pl-3 pr-8 rounded-ctl border border-border text-sm text-text-primary bg-surface-raised focus:outline-none focus:ring-1 focus:ring-brand-500">
                    {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Guard tag</label>
                  <input value={libTag} onChange={e => setLibTag(e.target.value.toUpperCase())} placeholder="e.g. MFA, ENCRYPTION"
                    className="h-9 w-full rounded-ctl border border-border bg-surface-raised px-3 text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Description</label>
                <textarea rows={2} value={libDesc} onChange={e => setLibDesc(e.target.value)}
                  className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">
                  Evidence guidance
                  <span className="ml-1 normal-case tracking-normal text-text-muted font-normal">
                    — one item per line, snapshotted at engagement creation
                  </span>
                </label>
                <textarea rows={3} value={libGuide} onChange={e => setLibGuide(e.target.value)}
                  placeholder={'e.g. Screenshot of MFA enforcement policy\nUser access review sign-off for the period'}
                  className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
            </div>

            <div className="border-t border-border" />

            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                Mapping in this section
                <span className="text-text-muted font-normal normal-case ml-1">— affects this template only</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">Weight</label>
                  <input type="number" value={mapWeight} onChange={e => setMapWeight(e.target.value)} placeholder="1.0"
                    className="h-9 w-full rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
                <label className="flex items-center gap-3 cursor-pointer pt-5">
                  <button type="button" onClick={() => setMapMandatory(m => !m)}
                    className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
                      mapMandatory ? 'bg-brand-500' : 'bg-surface-raised border border-border')}>
                    <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-surface-raised transition-transform',
                      mapMandatory ? 'translate-x-4' : 'translate-x-0.5')} />
                  </button>
                  <span className="text-sm text-text-primary">Mandatory</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ── Tests tab ── */}
        {editTab === 'tests' && (
          <div className="flex flex-col gap-3">
            {/* Linked tests list */}
            {loadingLT ? (
              <div className="flex justify-center py-6"><Loader2 size={18} className="text-brand-ink animate-spin" /></div>
            ) : (
              <div className="rounded-card border border-border divide-y divide-border">
                {linkedTests.length === 0 && (
                  <p className="text-sm text-text-muted px-4 py-4">No tests linked to this control yet.</p>
                )}
                {linkedTests.map(t => {
                  const id = t.id ?? t.testId
                  const isEditing = editingTestId === id
                  return (
                    <div key={id}>
                      {!isEditing ? (
                        <div className="flex items-center gap-3 px-4 py-2.5 group hover:bg-surface-overlay transition-colors">
                          <div className="flex-1 min-w-0">
                            {t.testRef && <span className="font-mono text-[10px] text-brand-ink mr-1.5">{t.testRef}</span>}
                            <span className="text-sm text-text-primary">{t.testName ?? t.name}</span>
                            {t.frequency && <span className="text-[10px] text-text-muted ml-2">{t.frequency}</span>}
                            {t.automationType && t.automationType !== 'MANUAL' && (
                              <span className="text-[10px] text-brand-ink ml-1.5">{t.automationType}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => startEditTest(t)} title="Edit"
                              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay">
                              <Pencil size={11} />
                            </button>
                            <button onClick={() => unlinkTest(id)} disabled={unlinkingTest} title="Unlink"
                              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="px-4 py-3 bg-surface-overlay flex flex-col gap-2">
                          <input value={etName} onChange={e => setEtName(e.target.value)}
                            placeholder="Test name *"
                            className="w-full h-8 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                          <div className="grid grid-cols-3 gap-2">
                            <input value={etRef} onChange={e => setEtRef(e.target.value)} placeholder="Ref"
                              className="h-7 px-2 rounded-ctl border border-border bg-surface-raised text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                            <select value={etFreq} onChange={e => setEtFreq(e.target.value)}
                              className="h-7 px-2 rounded-ctl border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                              <option value="">Frequency</option>
                              {freqOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <select value={etAuto} onChange={e => setEtAuto(e.target.value)}
                              className="h-7 px-2 rounded-ctl border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                              <option value="MANUAL">Manual</option>
                              <option value="AUTOMATED">Automated</option>
                            </select>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingTestId(null)}
                              className="px-2 py-1 text-xs text-text-muted hover:text-text-primary rounded border border-border hover:bg-surface-overlay transition-colors">
                              Cancel
                            </button>
                            <button
                              onClick={() => updateTest({ id, data: { name: etName.trim(), testRef: etRef.trim() || null, frequency: etFreq || null, automationType: etAuto } })}
                              disabled={!etName.trim() || updatingTest}
                              className="px-3 py-1 text-xs font-medium bg-brand-500 text-brand-900 rounded disabled:opacity-50 hover:bg-brand-600 transition-colors flex items-center gap-1">
                              {updatingTest ? <Loader2 size={10} className="animate-spin" /> : null}
                              Save
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Link existing test */}
            <div className="border-t border-border pt-3 flex flex-col gap-2">
              <button onClick={() => { setShowTestPicker(v => !v); setShowCreateTest(false) }}
                className="flex items-center gap-1.5 text-xs text-brand-ink hover:text-brand-ink font-medium">
                <Plus size={12} /> {showTestPicker ? 'Hide picker' : 'Link existing test'}
              </button>
              {showTestPicker && (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input value={testSearch} onChange={e => setTestSearch(e.target.value)} placeholder="Search library tests…"
                      className="h-7 pl-7 pr-3 w-full rounded-ctl border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-card border border-border divide-y divide-border">
                    {loadingAT && <div className="flex justify-center py-4"><Loader2 size={14} className="text-brand-ink animate-spin" /></div>}
                    {!loadingAT && availableTests.length === 0 && <p className="text-xs text-text-muted px-3 py-3">No available tests.</p>}
                    {!loadingAT && availableTests.map(t => {
                      const id = t.id ?? t.testId
                      return (
                        <button key={id} onClick={() => linkTest(id)} disabled={linkingTest}
                          className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-surface-overlay transition-colors">
                          <div className="flex-1 min-w-0">
                            {t.testRef && <span className="font-mono text-[10px] text-brand-ink mr-1.5">{t.testRef}</span>}
                            <span className="text-xs text-text-primary line-clamp-1">{t.testName ?? t.name}</span>
                          </div>
                          <Plus size={10} className="text-text-muted shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Create new test */}
            <div className="border-t border-border pt-3 flex flex-col gap-2">
              <button onClick={() => { setShowCreateTest(v => !v); setShowTestPicker(false) }}
                className="flex items-center gap-1.5 text-xs text-brand-ink hover:text-brand-ink font-medium">
                <Plus size={12} /> {showCreateTest ? 'Hide' : 'Create new test and link'}
              </button>
              {showCreateTest && (
                <div className="flex flex-col gap-3 p-3 rounded-card border border-border bg-surface-overlay">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Test name *</label>
                    <input value={ntName} onChange={e => setNtName(e.target.value)} placeholder="e.g. Review access logs"
                      className="w-full h-8 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Test ref</label>
                      <input value={ntRef} onChange={e => setNtRef(e.target.value)} placeholder="e.g. T-01"
                        className="w-full h-8 px-2 rounded-ctl border border-border bg-surface-raised text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Frequency</label>
                      <select value={ntFreq} onChange={e => setNtFreq(e.target.value)}
                        className="w-full h-8 px-2 rounded-ctl border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                        <option value="">Frequency</option>
                        {freqOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Automation</label>
                      <select value={ntAuto} onChange={e => setNtAuto(e.target.value)}
                        className="w-full h-8 px-2 rounded-ctl border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                        <option value="MANUAL">Manual</option>
                        <option value="AUTOMATED">Automated</option>
                      </select>
                    </div>
                  </div>
                  <Button size="xs" loading={creatingTest} disabled={!ntName.trim()}
                    onClick={() => createAndLinkTest({ name: ntName.trim(), testRef: ntRef.trim() || null, frequency: ntFreq || null, automationType: ntAuto })}>
                    Create & Link Test
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Policies tab ── */}
        {editTab === 'policies' && (
          <div className="flex flex-col gap-3">
            {loadingLP ? (
              <div className="flex justify-center py-6"><Loader2 size={18} className="text-brand-ink animate-spin" /></div>
            ) : (
              <div className="rounded-card border border-border divide-y divide-border">
                {linkedPolicies.length === 0 && (
                  <p className="text-sm text-text-muted px-4 py-4">No policies linked to this control yet.</p>
                )}
                {linkedPolicies.map(p => {
                  const id = p.id ?? p.policyId
                  return (
                    <div key={id} className="flex items-center gap-3 px-4 py-2.5 group hover:bg-surface-overlay transition-colors">
                      <div className="flex-1 min-w-0">
                        {p.policyRef && <span className="font-mono text-[10px] text-brand-ink mr-1.5">{p.policyRef}</span>}
                        <span className="text-sm text-text-primary">{p.title}</span>
                        {p.status && <span className="text-[10px] text-text-muted ml-2">{p.status}</span>}
                      </div>
                      <button onClick={() => unlinkPolicy(id)} disabled={unlinkingPolicy} title="Unlink"
                        className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="border-t border-border pt-3 flex flex-col gap-2">
              <button onClick={() => setShowPolPicker(v => !v)}
                className="flex items-center gap-1.5 text-xs text-brand-ink hover:text-brand-ink font-medium">
                <Plus size={12} /> {showPolPicker ? 'Hide picker' : 'Link a policy'}
              </button>
              {showPolPicker && (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input value={polSearch} onChange={e => setPolSearch(e.target.value)} placeholder="Search library policies…"
                      className="h-7 pl-7 pr-3 w-full rounded-ctl border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-card border border-border divide-y divide-border">
                    {loadingAP && <div className="flex justify-center py-4"><Loader2 size={14} className="text-brand-ink animate-spin" /></div>}
                    {!loadingAP && availablePolicies.length === 0 && <p className="text-xs text-text-muted px-3 py-3">No available policies.</p>}
                    {!loadingAP && availablePolicies.map(p => {
                      const id = p.id ?? p.policyId
                      return (
                        <button key={id} onClick={() => linkPolicy(id)} disabled={linkingPolicy}
                          className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-surface-overlay transition-colors">
                          <div className="flex-1 min-w-0">
                            {p.policyRef && <span className="font-mono text-[10px] text-brand-ink mr-1.5">{p.policyRef}</span>}
                            <span className="text-xs text-text-primary line-clamp-1">{p.title}</span>
                          </div>
                          <Plus size={10} className="text-text-muted shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
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
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-ink hover:bg-brand-500/10 transition-colors"
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
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-ink hover:bg-brand-500/10 transition-colors"
            >
              <Shield size={11} />
            </button>
            <button
              onClick={() => setShowDelete(true)}
              title="Delete section from library"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors"
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
    <div className="rounded-card border border-border bg-surface-raised overflow-hidden">
      <div className="flex items-center">
        <button onClick={onToggle}
          className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-surface-overlay transition-colors text-left">
          <div className="w-6 h-6 rounded-ctl bg-brand-500/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-brand-ink">{index + 1}</span>
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
              className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-brand-ink hover:bg-brand-500/10 transition-colors">
              <Plus size={13} />
            </button>
            <button onClick={onRemove} title="Remove from template"
              className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors">
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
      <Loader2 size={24} className="text-brand-ink animate-spin" />
    </div>
  )

  const existingRootSectionIds = rootSections.map(n => n.section.id)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="h-7 w-7 flex items-center justify-center rounded-ctl text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
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
              <div className="flex items-center gap-1.5 text-xs text-status-pass-fg">
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
                className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border rounded-card text-sm text-text-muted hover:text-text-secondary hover:border-border-subtle transition-colors">
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
    templateName: template?.templateName ?? template?.name ?? '',
    description:  template?.description  ?? '',
    frameworkRef: template?.frameworkRef ?? '',
    auditType:    template?.auditType    ?? 'INTERNAL',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs text-text-secondary mb-1">Template name *</label>
        <input value={form.templateName} onChange={e => set('templateName', e.target.value)}
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
          <input value={form.frameworkRef} onChange={e => set('frameworkRef', e.target.value)} placeholder="ISO 27001, SOC 2…"
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
          className="w-full px-3 py-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <Button variant="primary" loading={isPending} disabled={!form.templateName.trim()}
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
          <input value={form.frameworkRef} onChange={e => set('frameworkRef', e.target.value)} placeholder="ISO 27001, SOC 2…"
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
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
    templateName: template?.templateName ?? template?.name ?? '', description: template?.description ?? '',
    frameworkRef: template?.frameworkRef ?? '', auditType: template?.auditType ?? 'INTERNAL',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!template) return
    setForm({ templateName: template.templateName ?? template.name ?? '', description: template.description ?? '', frameworkRef: template.frameworkRef ?? '', auditType: template.auditType ?? 'INTERNAL' })
  }, [template?.id])

  if (!template) return null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs text-text-secondary mb-1">Template name *</label>
        <input value={form.templateName} onChange={e => set('templateName', e.target.value)}
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
          <input value={form.frameworkRef} onChange={e => set('frameworkRef', e.target.value)} placeholder="ISO 27001, SOC 2…"
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
          className="w-full px-3 py-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <Button variant="primary" loading={isPending} disabled={!form.templateName.trim()}
        onClick={() => update({ id: template.id, data: form })}>
        Save changes
      </Button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────


// ─── Audit Project Builder ────────────────────────────────────────────────────
function AuditProjectBuilder({ projectId, onBack }) {
  const qc = useQueryClient()
  const [editMode,    setEditMode]    = useState(false)
  const [editForm,    setEditForm]    = useState(null)
  const [showPicker,  setShowPicker]  = useState(false)
  const [previewId,   setPreviewId]   = useState(null)
  const [removeTarget,setRemoveTarget]= useState(null)
  const [showTenants, setShowTenants] = useState(false)

  const { data: project, isLoading: projLoading } = useQuery({
    queryKey: ['audit-project-builder', projectId],
    queryFn:  () => auditApi.projects.get(projectId),
    select:   d => d?.data?.data ?? d?.data ?? d,
  })

  const { data: plannedRaw, isLoading: plannedLoading, refetch } = useQuery({
    queryKey: ['audit-project-builder-templates', projectId],
    queryFn:  () => auditApi.projects.templates.list(projectId),
    enabled:  !!projectId,
  })
  const planned = Array.isArray(plannedRaw) ? plannedRaw : plannedRaw?.items ?? plannedRaw?.data ?? []

  const { data: libraryRaw } = useQuery({
    queryKey: ['audit-library-templates-published'],
    queryFn:  () => auditApi.library.templates.list({ status: 'PUBLISHED', take: 100 }),
  })
  const library = libraryRaw?.items ?? libraryRaw?.data?.items ?? []
  const plannedIds = new Set(planned.map(p => p.templateId))

  const { data: accessRaw, refetch: refetchAccess } = useQuery({
    queryKey: ['audit-project-tenant-access', projectId],
    queryFn:  () => auditApi.projects.tenantAccess.list(projectId),
    enabled:  !!projectId,
  })
  const accessList = Array.isArray(accessRaw) ? accessRaw
    : accessRaw?.items ?? accessRaw?.data?.items ?? accessRaw?.data ?? []

  const { data: tenantsRaw } = useQuery({
    queryKey: ['all-tenants-picker'],
    queryFn:  () => import('../../../api/tenants.api').then(m => m.tenantsApi.list({ take: 100 })),
    enabled:  !!projectId,
    select:   d => d?.data?.items ?? d?.items ?? d?.data ?? [],
  })
  const allTenants = Array.isArray(tenantsRaw) ? tenantsRaw : []
  const grantedIds = new Set(accessList.map(a => a.tenantId))

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['audit-project-builder-templates', projectId] })
    qc.invalidateQueries({ queryKey: ['admin-audit-library-projects'] })
    qc.invalidateQueries({ queryKey: ['audit-project-builder', projectId] })
  }
  const invAccess = () => qc.invalidateQueries({ queryKey: ['audit-project-tenant-access', projectId] })

  const addMut = useMutation({
    mutationFn: (templateId) => auditApi.projects.templates.add(projectId, templateId),
    onSuccess: () => { inv(); setShowPicker(false); toast.success('Template added') },
    onError: e => toast.error(e?.response?.data?.message ?? 'Failed to add'),
  })
  const removeMut = useMutation({
    mutationFn: (templateId) => auditApi.projects.templates.remove(projectId, templateId),
    onSuccess: () => { inv(); setRemoveTarget(null); toast.success('Template removed') },
    onError: e => toast.error(e?.response?.data?.message ?? 'Failed to remove'),
  })
  const updateMut = useMutation({
    mutationFn: (data) => auditApi.projects.update(projectId, data),
    onSuccess: () => { inv(); toast.success('Project updated'); setEditMode(false) },
    onError: e => toast.error(e?.response?.data?.message ?? 'Failed to update'),
  })
  const publishMut = useMutation({
    mutationFn: () => auditApi.projects.publish(projectId),
    onSuccess: () => { inv(); toast.success('Project published') },
    onError: e => toast.error(e?.response?.data?.message ?? 'Failed to publish'),
  })
  const unpublishMut = useMutation({
    mutationFn: () => auditApi.projects.unpublish(projectId),
    onSuccess: () => { inv(); toast.success('Project moved to draft') },
    onError: e => toast.error(e?.response?.data?.message ?? 'Failed to unpublish'),
  })
  const visibilityMut = useMutation({
    mutationFn: (visibility) => auditApi.projects.setVisibility(projectId, visibility),
    onSuccess: () => { inv(); toast.success('Visibility updated') },
    onError: e => toast.error(e?.response?.data?.message ?? 'Failed to update visibility'),
  })
  const grantMut = useMutation({
    mutationFn: (tenantId) => auditApi.projects.tenantAccess.grant(projectId, tenantId),
    onSuccess: () => { invAccess(); toast.success('Access granted') },
    onError: e => toast.error(e?.response?.data?.message ?? 'Failed to grant'),
  })
  const revokeMut = useMutation({
    mutationFn: (tenantId) => auditApi.projects.tenantAccess.revoke(projectId, tenantId),
    onSuccess: () => { invAccess(); toast.success('Access revoked') },
    onError: e => toast.error(e?.response?.data?.message ?? 'Failed to revoke'),
  })

  const isPublished = project?.publishStatus === 'PUBLISHED'
  const visibility  = project?.visibility ?? 'GLOBAL'

  const VISIBILITY_OPTIONS = [
    { key: 'GLOBAL',   label: 'Global',   desc: 'All organisations',   color: 'text-status-pass-fg border-status-pass-bd bg-status-pass-bg' },
    { key: 'SPECIFIC', label: 'Specific', desc: 'Named tenants only',  color: 'text-brand-ink border-brand-500/30 bg-brand-500/10' },
    { key: 'PLATFORM', label: 'Platform', desc: 'Platform admin only', color: 'text-status-warn-fg border-status-warn-bd bg-status-warn-bg' },
  ]

  if (projLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="text-brand-ink animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft size={14} /> Projects
          </button>
          <span className="text-text-muted">/</span>
          <div className="min-w-0">
            {editMode ? (
              <input value={editForm?.name ?? ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                className="text-base font-semibold bg-transparent border-b border-brand-500 outline-none text-text-primary min-w-[200px]"
                autoFocus />
            ) : (
              <span className="text-base font-semibold text-text-primary">{project?.name}</span>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-mono text-text-muted">{project?.projectRef}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isPublished ? 'bg-status-pass-bg text-status-pass-fg' : 'bg-surface-overlay text-text-muted'}`}>
                {isPublished ? 'PUBLISHED' : 'DRAFT'}
              </span>
              {(() => { const v = VISIBILITY_OPTIONS.find(o => o.key === visibility); return v ? <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${v.color}`}>{v.label}</span> : null })()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editMode ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditMode(false)}>Cancel</Button>
              <Button size="sm" variant="primary" loading={updateMut.isPending} onClick={() => updateMut.mutate(editForm)}>Save</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" icon={Pencil}
                onClick={() => { setEditForm({ name: project?.name, description: project?.description }); setEditMode(true) }}>
                Edit
              </Button>
              {isPublished
                ? <Button size="sm" variant="ghost" loading={unpublishMut.isPending} onClick={() => unpublishMut.mutate()}>Move to Draft</Button>
                : <Button size="sm" variant="primary" loading={publishMut.isPending} onClick={() => publishMut.mutate()}>Publish</Button>
              }
            </>
          )}
        </div>
      </div>

      {editMode && (
        <div className="px-6 py-3 border-b border-border bg-surface-raised">
          <textarea value={editForm?.description ?? ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
            rows={2} placeholder="Description (optional)"
            className="w-full rounded-ctl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
        </div>
      )}
      {!editMode && project?.description && (
        <div className="px-6 py-3 border-b border-border">
          <p className="text-sm text-text-secondary">{project.description}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Visibility */}
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Visibility</h3>
            {visibility === 'SPECIFIC' && (
              <button onClick={() => setShowTenants(t => !t)} className="text-xs text-brand-ink hover:text-brand-ink transition-colors">
                {showTenants ? 'Hide tenants' : `Manage tenants (${accessList.length})`}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {VISIBILITY_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => visibilityMut.mutate(opt.key)} disabled={visibilityMut.isPending}
                className={`flex-1 py-2 px-3 rounded-ctl border text-xs font-medium transition-colors text-left ${visibility === opt.key ? opt.color : 'border-border text-text-muted hover:text-text-secondary'}`}>
                <div className="font-semibold">{opt.label}</div>
                <div className="text-[10px] opacity-70 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
          {visibility === 'SPECIFIC' && showTenants && (
            <div className="mt-4">
              <div className="flex flex-col gap-1.5 mb-3">
                {accessList.length === 0 && <p className="text-xs text-text-muted">No tenants have access yet.</p>}
                {accessList.map(a => {
                  const t = allTenants.find(t => (t.id ?? t.tenantId) === a.tenantId)
                  const label = t?.name ?? t?.tenantName ?? `Tenant #${a.tenantId}`
                  return (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-ctl bg-surface-overlay text-xs">
                      <span className="text-text-primary">{label}</span>
                      <button onClick={() => revokeMut.mutate(a.tenantId)} disabled={revokeMut.isPending} className="text-status-fail-fg hover:text-status-fail-fg transition-colors ml-2">Revoke</button>
                    </div>
                  )
                })}
              </div>
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto border border-border rounded-ctl p-2">
                {allTenants.filter(t => !grantedIds.has(t.id ?? t.tenantId)).map(t => (
                  <button key={t.id ?? t.tenantId} onClick={() => grantMut.mutate(t.id ?? t.tenantId)} disabled={grantMut.isPending}
                    className="w-full text-left px-3 py-1.5 rounded text-xs hover:bg-surface-overlay transition-colors flex items-center justify-between">
                    <span>{t.name ?? t.tenantName ?? `Tenant #${t.id ?? t.tenantId}`}</span>
                    <Plus size={11} className="text-text-muted" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Planned templates */}
        <div className="px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium text-text-primary">Planned templates</h3>
              <p className="text-xs text-text-muted mt-0.5">Templates included in this programme</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => refetch()} className="p-1.5 text-text-muted hover:text-text-secondary rounded transition-colors"><RefreshCw size={14} /></button>
              <Button size="sm" icon={Plus} onClick={() => setShowPicker(true)}>Add template</Button>
            </div>
          </div>

          {plannedLoading ? (
            <div className="flex flex-col gap-2">{[1,2].map(i => <div key={i} className="h-16 rounded-card bg-surface-overlay animate-pulse" />)}</div>
          ) : !planned.length ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-text-muted border-2 border-dashed border-border rounded-card">
              <LayoutTemplate size={28} className="opacity-30" />
              <p className="text-sm">No templates planned yet</p>
              <Button size="sm" icon={Plus} variant="secondary" onClick={() => setShowPicker(true)} className="mt-2">Add template</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {planned.map(pt => (
                <div key={pt.id} className="rounded-card border border-border p-4 flex items-start gap-3">
                  <LayoutTemplate size={15} className="text-text-muted mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{pt.templateName}</span>
                      {pt.templateFramework && <span className="text-[10px] font-mono text-text-muted">{pt.templateFramework}</span>}
                      {pt.templateAuditType && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${pt.templateAuditType === 'INTERNAL' ? 'bg-status-info-bg text-status-info-fg' : 'bg-status-tag-bg text-status-tag-fg'}`}>
                          {pt.templateAuditType}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setPreviewId(pt.templateId)} className="h-7 px-2 text-[10px] rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">Preview</button>
                    <button onClick={() => setRemoveTarget(pt)} className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={showPicker} onClose={() => setShowPicker(false)} title="Add template to plan">
        <div className="flex flex-col gap-2 p-4 max-h-96 overflow-y-auto">
          {library.filter(t => !plannedIds.has(t.id)).map(t => (
            <button key={t.id} onClick={() => addMut.mutate(t.id)} disabled={addMut.isPending}
              className="w-full text-left rounded-card border border-border px-4 py-3 hover:bg-surface-overlay transition-colors flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="text-[10px] font-mono text-text-muted">{t.frameworkRef}</span>
                </div>
                <p className="text-xs text-text-muted mt-0.5">{t.auditType} · v{t.version}</p>
              </div>
              <Plus size={14} className="text-text-muted shrink-0" />
            </button>
          ))}
          {library.filter(t => !plannedIds.has(t.id)).length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">All published templates already planned</p>
          )}
        </div>
      </Modal>

      <ConfirmDialog open={!!removeTarget} onClose={() => setRemoveTarget(null)}
        title="Remove template" message={`Remove "${removeTarget?.templateName}" from this project's plan?`}
        confirmLabel="Remove" confirmVariant="danger" loading={removeMut.isPending}
        onConfirm={() => removeMut.mutate(removeTarget.templateId)} />

      {previewId && (
        <Modal open={!!previewId} onClose={() => setPreviewId(null)} title="Template preview">
          <div className="p-4 text-sm text-text-secondary">Template id={previewId}</div>
        </Modal>
      )}
    </div>
  )
}


// ─── Projects Library Tab ─────────────────────────────────────────────────────
function AuditProjectsLibraryTab({ onOpen }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', plannedStart: '', plannedEnd: '' })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-audit-library-projects'],
    queryFn: () => auditApi.projects.list({ take: 100 }),
    select: d => d?.data?.items ?? d?.items ?? d?.data ?? [],
  })

  const createMut = useMutation({
    mutationFn: () => auditApi.projects.create({
      name: form.name,
      description: form.description,
      plannedStart: form.plannedStart || undefined,
      plannedEnd:   form.plannedEnd   || undefined,
    }),
    onSuccess: () => {
      toast.success('Project created')
      qc.invalidateQueries({ queryKey: ['admin-audit-library-projects'] })
      setShowCreate(false)
      setForm({ name: '', description: '', plannedStart: '', plannedEnd: '' })
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? 'Failed to create project'),
  })

  const projects = data ?? []

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          Global programme templates — organisations select one to instantiate a running audit programme
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-1.5 text-text-muted hover:text-text-secondary rounded transition-colors">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-500 hover:bg-brand-600 text-brand-900 rounded-ctl transition-colors">
            <Plus size={13} /> New project
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1,2,3].map(i => <div key={i} className="h-16 rounded-card bg-surface-overlay animate-pulse" />)}
        </div>
      ) : !projects.length ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-text-muted">
          <FolderKanban size={32} className="opacity-30" />
          <p className="text-sm">No library projects yet</p>
          <p className="text-xs text-text-muted">Create a project to group audit templates into a reusable programme</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map(p => (
            <button key={p.id} onClick={() => onOpen(p.id)}
              className="w-full text-left rounded-card border border-border bg-surface-raised hover:bg-surface-overlay transition-colors px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <FolderKanban size={16} className="text-brand-ink mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-primary">{p.name}</span>
                    <span className="text-xs font-mono text-text-muted">{p.projectRef}</span>
                    {/* Publish status */}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${p.publishStatus === 'PUBLISHED' ? 'bg-status-pass-bg text-status-pass-fg' : 'bg-surface-overlay text-text-muted'}`}>
                      {p.publishStatus ?? 'DRAFT'}
                    </span>
                    {/* Visibility */}
                    {p.visibility === 'GLOBAL'    && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-status-info-bg text-status-info-fg"><Globe size={9} />Global</span>}
                    {p.visibility === 'PLATFORM'  && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-status-warn-bg text-status-warn-fg">Platform only</span>}
                    {p.visibility === 'SPECIFIC'  && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-ink">Selected tenants</span>}
                    {/* Fallback for projects without new fields (legacy) */}
                    {!p.visibility && (p.global
                      ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-status-info-bg text-status-info-fg"><Globe size={9} />Global</span>
                      : <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted"><Lock size={9} />Org</span>
                    )}
                  </div>
                  {p.description && <p className="text-xs text-text-muted mt-0.5 truncate max-w-xl">{p.description}</p>}
                  {p.plannedStart && <p className="text-[10px] text-text-muted mt-0.5">{p.plannedStart} — {p.plannedEnd}</p>}
                </div>
              </div>
              <ExternalLink size={13} className="text-text-muted shrink-0" />
            </button>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Library Project">
        <div className="flex flex-col gap-4 p-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full rounded-ctl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="e.g. SOC 2 + ISO 27001 Annual Programme 2027" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className="w-full rounded-ctl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Planned Start</label>
              <input type="date" value={form.plannedStart} onChange={e => setForm(f => ({ ...f, plannedStart: e.target.value }))}
                className="w-full rounded-ctl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Planned End</label>
              <input type="date" value={form.plannedEnd} onChange={e => setForm(f => ({ ...f, plannedEnd: e.target.value }))}
                className="w-full rounded-ctl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-ctl border border-border transition-colors">
              Cancel
            </button>
            <button onClick={() => createMut.mutate()}
              disabled={!form.name || createMut.isPending}
              className="px-3 py-1.5 text-xs font-medium bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-brand-900 rounded-ctl transition-colors">
              {createMut.isPending ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function AuditLibraryPage({ defaultTab = 'projects' }) {
  const auth = useSelector(selectAuth)
  const { data: auditLibConfig } = useScreenConfig('audit_library')

  const [activeTemplate, setActiveTemplate] = useState(null)
  const [activeProject,  setActiveProject]  = useState(null)

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
      render: (row) => <RowActions editable={row.editable !== false}
                  onEdit={() => setEditControl(row)} onDelete={() => setDeleteControl(row)} />,
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
                className="h-6 px-2 text-[10px] rounded text-brand-ink hover:bg-brand-500/10 transition-colors">Publish</button>
            : <button onClick={() => TM.unpublish.mutate(row.id)} title="Unpublish"
                className="h-6 px-2 text-[10px] rounded text-status-warn-fg hover:bg-status-warn-bg transition-colors">Unpublish</button>
          }
          <button onClick={() => setDeleteTemplate(row)} title="Delete"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors">
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

  if (activeProject) {
    return <AuditProjectBuilder projectId={activeProject} onBack={() => setActiveProject(null)} />
  }

  const BulkBar = ({ count, label, loading, onDelete, onClear }) =>
    count === 0 ? null : (
      <div className="flex items-center gap-3 px-6 py-2.5 bg-brand-500/5 border-b border-brand-500/20">
        <span className="text-xs font-medium text-brand-ink">{count} {label} selected</span>
        <Button variant="ghost" size="xs" icon={Trash2}
          className="text-status-fail-fg hover:bg-status-fail-bg" loading={loading} onClick={onDelete}>
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
          {tab !== 'projects' && (
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
              className="h-8 pl-8 pr-3 w-52 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          )}

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

          {tab !== 'projects' && (
          <Button variant="ghost" size="sm" icon={RefreshCw}
            onClick={
                  tab === 'controls'  ? cRefetch :
                  tab === 'sections'  ? sRefetch :
                  tab === 'templates' ? tRefetch :
                  tab === 'tests'     ? testRefetch :
                                        polRefetch
                } />
          )}

          {tab === 'templates' && (
            <>
              <Button variant="secondary" size="sm" icon={Upload} onClick={() => setShowImport(true)}>Import CSV</Button>
              <Button variant="ghost" size="sm" icon={Download} onClick={downloadCsvTemplate}>Example</Button>
            </>
          )}

          {tab !== 'projects' && (
          <Button size="sm" icon={Plus}
            onClick={() => tab === 'controls' ? setShowCreateC(true) : tab === 'sections' ? setShowCreateS(true) : setShowCreateT(true)}>
            {tab === 'controls' ? 'Add control' : tab === 'sections' ? 'Add section' :
             tab === 'templates' ? 'New template' : tab === 'tests' ? 'Add test' : 'Add policy'}
          </Button>
          )}
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

        {/* Projects tab */}
        {tab === 'projects' && <AuditProjectsLibraryTab onOpen={(id) => setActiveProject(id)} />}

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
              <div className="rounded-card border border-border bg-surface-overlay p-3 text-[10px] font-mono text-text-muted">
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
                    row.automationType === 'AUTOMATED' ? 'bg-status-pass-bg text-status-pass-fg' : 'bg-status-warn-bg text-status-warn-fg')}>
                    {row.automationType ?? 'MANUAL'}
                  </span>
                ),
              },
              { key: 'frequency',   label: 'Frequency',  sortable: true,  width: 110 },
              { key: 'controlTag',  label: 'Tag',        sortable: false, width: 120, type: 'custom',
                render: (row) => <GuardTagBadge tag={row.controlTag} />,
              },
              { key: 'frameworkRef',label: 'Framework',  sortable: false, width: 90 },
              { key: 'origin',      label: 'Source',     sortable: false, width: 70, type: 'custom',
                render: (row) => <OriginBadge origin={row.origin} />,
              },
              { key: '__actions',   label: '',           width: 72, type: 'custom',
                render: (row) => <RowActions editable={row.editable !== false}
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
              { key: 'origin',      label: 'Source',       sortable: false, width: 70, type: 'custom',
                render: (row) => <OriginBadge origin={row.origin} />,
              },
              { key: '__actions',   label: '',             width: 72, type: 'custom',
                render: (row) => <RowActions editable={row.editable !== false}
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