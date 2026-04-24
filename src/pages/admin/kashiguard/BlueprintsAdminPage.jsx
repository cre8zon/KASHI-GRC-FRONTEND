/**
 * BlueprintsAdminPage — /admin/kashiguard/blueprints
 *
 * Manage action item blueprint library.
 * Global blueprints (tenantId=null) shown as read-only for tenant admins.
 * Platform admins can create/edit/delete global ones.
 */
import { useState }                         from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Globe, Lock,
         Shield, Search, ToggleLeft, ToggleRight } from 'lucide-react'
import { PageLayout }    from '../../../components/layout/PageLayout'
import { Button }        from '../../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Input }         from '../../../components/ui/Input'
import { Badge }         from '../../../components/ui/Badge'
import { cn }            from '../../../lib/cn'
import { blueprintsApi } from '../../../api/guardRules.api'
import { useSelector }   from 'react-redux'
import { selectAuth }    from '../../../store/slices/authSlice'
import toast             from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_TYPES   = ['AUDIT_FINDING','CONTROL_GAP','RISK_ESCALATION','COMMENT','ISSUE','SYSTEM']
const PRIORITIES     = ['LOW','MEDIUM','HIGH','CRITICAL']
const PRIORITY_COLOR = { CRITICAL:'red', HIGH:'amber', MEDIUM:'blue', LOW:'gray' }

const CATEGORIES = [
  'INFORMATION_SECURITY','DATA_PRIVACY','ACCESS_CONTROL','INCIDENT_MANAGEMENT',
  'BUSINESS_CONTINUITY','VENDOR_GOVERNANCE','COMPLIANCE','PHYSICAL_SECURITY',
  'CHANGE_MANAGEMENT','ANSWER_QUALITY','AUDIT_CONTROL','CONTROL_FRAMEWORK',
  'RISK_MANAGEMENT','ISSUE_MANAGEMENT',
]

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useBlueprints() {
  return useQuery({
    queryKey: ['admin-blueprints'],
    queryFn:  blueprintsApi.list,
    select:   (d) => Array.isArray(d) ? d : (d?.data || []),
  })
}

function useSaveBlueprint(editId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => editId ? blueprintsApi.update(editId, data) : blueprintsApi.create(data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['admin-blueprints'] }) },
    onError:    (e) => toast.error(e?.message || 'Failed to save blueprint'),
  })
}

function useDeleteBlueprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: blueprintsApi.delete,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['admin-blueprints'] }); toast.success('Blueprint deleted') },
    onError:    (e) => toast.error(e?.message || 'Failed to delete'),
  })
}

// ── Blueprint Form Modal ──────────────────────────────────────────────────────

function BlueprintModal({ blueprint, onClose }) {
  const isEdit = !!blueprint?.id
  const { mutate: save, isPending } = useSaveBlueprint(blueprint?.id)
  const [form, setForm] = useState({
    sourceType:          blueprint?.sourceType          || 'AUDIT_FINDING',
    category:            blueprint?.category            || '',
    titleTemplate:       blueprint?.titleTemplate       || '',
    descriptionTemplate: blueprint?.descriptionTemplate || '',
    resolutionRole:      blueprint?.resolutionRole      || 'ORG_REVIEWER',
    defaultPriority:     blueprint?.defaultPriority     || 'MEDIUM',
    standardRef:         blueprint?.standardRef         || '',
    blueprintCode:       blueprint?.blueprintCode       || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.titleTemplate.trim()) { toast.error('Title is required'); return }
    if (!form.blueprintCode.trim()) { toast.error('Blueprint code is required'); return }
    save(form, { onSuccess: () => { toast.success(isEdit ? 'Blueprint updated' : 'Blueprint created'); onClose() } })
  }

  return (
    <Modal open onClose={onClose}
      title={isEdit ? 'Edit Blueprint' : 'New Blueprint'}
      subtitle="Action item finding template"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isPending} onClick={handleSave}>
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </div>
      }>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">Source Type</label>
            <select value={form.sourceType} onChange={e => set('sourceType', e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              {SOURCE_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Select category…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>

        <Input label="Blueprint Code *" value={form.blueprintCode}
          onChange={e => set('blueprintCode', e.target.value.toUpperCase().replace(/\s/g,'_'))}
          placeholder="e.g. VA_MFA" disabled={isEdit}
          hint={isEdit ? "Code cannot be changed after creation" : "Unique identifier used by guard rules"} />

        <Input label="Title Template *" value={form.titleTemplate}
          onChange={e => set('titleTemplate', e.target.value)}
          placeholder="e.g. Multi-factor authentication (MFA) not enforced" />

        <div>
          <label className="text-xs text-text-muted mb-1 block">Description Template</label>
          <textarea value={form.descriptionTemplate}
            onChange={e => set('descriptionTemplate', e.target.value)}
            rows={3} placeholder="Detailed guidance for the remediation assignee…"
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Resolution Role" value={form.resolutionRole}
            onChange={e => set('resolutionRole', e.target.value)}
            placeholder="e.g. ORG_REVIEWER, LEAD_AUDITOR" />
          <div>
            <label className="text-xs text-text-muted mb-1 block">Default Priority</label>
            <select value={form.defaultPriority} onChange={e => set('defaultPriority', e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <Input label="Standard Reference" value={form.standardRef}
          onChange={e => set('standardRef', e.target.value)}
          placeholder="e.g. ISO27001-A.9.4.2, SOC2-CC6.1, GDPR-Art28" />
      </div>
    </Modal>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BlueprintsAdminPage() {
  const { data: blueprints = [], isLoading } = useBlueprints()
  const { mutate: deleteBlueprint }          = useDeleteBlueprint()
  const { tenantId }                         = useSelector(selectAuth)
  const isPlatformAdmin                      = !tenantId

  const [search,      setSearch]      = useState('')
  const [catFilter,   setCatFilter]   = useState('ALL')
  const [srcFilter,   setSrcFilter]   = useState('ALL')
  const [showCreate,  setShowCreate]  = useState(false)
  const [editTarget,  setEditTarget]  = useState(null)
  const [deleteTarget,setDeleteTarget]= useState(null)

  const categories = ['ALL', ...new Set(blueprints.map(b => b.category).filter(Boolean))]
  const sources    = ['ALL', ...SOURCE_TYPES]

  const filtered = blueprints.filter(b => {
    const matchSearch = !search || b.titleTemplate?.toLowerCase().includes(search.toLowerCase())
      || b.blueprintCode?.toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter === 'ALL' || b.category === catFilter
    const matchSrc = srcFilter === 'ALL' || b.sourceType === srcFilter
    return matchSearch && matchCat && matchSrc
  })

  const globalCount = blueprints.filter(b => !b.tenantId).length
  const tenantCount = blueprints.filter(b =>  b.tenantId).length

  return (
    <PageLayout title="Action Item Blueprints"
      subtitle={`${globalCount} global · ${tenantCount} custom`}
      actions={
        <Button variant="primary" size="sm" icon={Plus}
          onClick={() => setShowCreate(true)}>
          New Blueprint
        </Button>
      }>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 px-6 pt-4">
        {[
          { label: 'Total',   value: blueprints.length,  color: 'text-text-primary' },
          { label: 'Global',  value: globalCount,        color: 'text-blue-400' },
          { label: 'Custom',  value: tenantCount,        color: 'text-purple-400' },
          { label: 'High+',   value: blueprints.filter(b => ['HIGH','CRITICAL'].includes(b.defaultPriority)).length, color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-lg border border-border bg-surface-raised text-center">
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-[10px] text-text-muted uppercase tracking-wide mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 pt-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search blueprints…"
            className="w-full h-8 pl-8 pr-3 rounded-md border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface-raised px-2 text-xs text-text-secondary focus:outline-none">
          {categories.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All Categories' : c.replace(/_/g,' ')}</option>)}
        </select>
        <select value={srcFilter} onChange={e => setSrcFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface-raised px-2 text-xs text-text-secondary focus:outline-none">
          {sources.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All Sources' : s.replace(/_/g,' ')}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="px-6 py-4">
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-raised">
                {['Code','Title','Category','Source','Priority','Role','Scope',''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={8} className="py-16 text-center"><div className="flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/></div></td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={8} className="py-16 text-center text-text-muted text-xs">No blueprints found</td></tr>
              )}
              {filtered.map(bp => {
                const isGlobal   = !bp.tenantId
                const canEdit    = isPlatformAdmin || !isGlobal
                const pc         = PRIORITY_COLOR[bp.defaultPriority] || 'gray'
                return (
                  <tr key={bp.id} className="hover:bg-surface-overlay/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded">
                        {bp.blueprintCode}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-xs font-medium text-text-primary truncate">{bp.titleTemplate}</p>
                      {bp.standardRef && <p className="text-[10px] text-text-muted">{bp.standardRef}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] text-text-secondary">
                        {bp.category?.replace(/_/g,' ') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] text-text-secondary">
                        {bp.sourceType?.replace(/_/g,' ') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge value={bp.defaultPriority} label={bp.defaultPriority} colorTag={pc} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono text-text-secondary">{bp.resolutionRole || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {isGlobal
                        ? <span className="flex items-center gap-1 text-[10px] text-blue-400"><Globe size={10}/>Global</span>
                        : <span className="flex items-center gap-1 text-[10px] text-purple-400"><Lock size={10}/>Custom</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {canEdit && (
                          <>
                            <button onClick={() => setEditTarget(bp)}
                              className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-brand-400 transition-colors">
                              <Pencil size={12} />
                            </button>
                            {!isGlobal && (
                              <button onClick={() => setDeleteTarget(bp)}
                                className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-red-400 transition-colors">
                                <Trash2 size={12} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showCreate  && <BlueprintModal onClose={() => setShowCreate(false)} />}
      {editTarget  && <BlueprintModal blueprint={editTarget} onClose={() => setEditTarget(null)} />}
      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        variant="danger" title="Delete Blueprint" confirmLabel="Delete"
        message={`Delete blueprint "${deleteTarget?.blueprintCode}"? Any guard rules using this code will stop firing.`}
        onConfirm={() => deleteBlueprint(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
      />
    </PageLayout>
  )
}