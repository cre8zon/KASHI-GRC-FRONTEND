/**
 * GuardRulesAdminPage — /admin/kashiguard/rules
 *
 * KashiGuard rule management.
 * Shows all rules with question text + blueprint title enriched from the API.
 * Grouped by question for easy scanning.
 * Toggle, edit, delete without touching the DB.
 */
import { useState }           from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
         Search, Shield, AlertTriangle, Zap } from 'lucide-react'
import { PageLayout }         from '../../../components/layout/PageLayout'
import { Button }             from '../../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Input }              from '../../../components/ui/Input'
import { Badge }              from '../../../components/ui/Badge'
import { cn }                 from '../../../lib/cn'
import { guardRulesApi, blueprintsApi } from '../../../api/guardRules.api'
import toast                  from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────

const CONDITION_TYPES = [
  { value: 'OPTION_SELECTED',     label: 'Option selected',       needsValue: true,  hint: 'Exact option text or option ID' },
  { value: 'OPTION_NOT_SELECTED', label: 'Option NOT selected',   needsValue: true,  hint: 'Exact option text or option ID' },
  { value: 'TEXT_CONTAINS',       label: 'Text contains keyword', needsValue: true,  hint: 'Keyword to search for (case-insensitive)' },
  { value: 'TEXT_EMPTY',          label: 'Text field is blank',   needsValue: false, hint: 'Fires when no text entered' },
  { value: 'SCORE_BELOW',         label: 'Score below threshold', needsValue: true,  hint: 'Numeric threshold e.g. 3' },
  { value: 'SCORE_ABOVE',         label: 'Score above threshold', needsValue: true,  hint: 'Numeric threshold e.g. 4' },
  { value: 'FILE_NOT_UPLOADED',   label: 'No file uploaded',      needsValue: false, hint: 'Fires when no file attached' },
  { value: 'ANY_ANSWER',          label: 'Any answer (always)',   needsValue: false, hint: 'Fires regardless of answer' },
  { value: 'ANSWER_MISSING',       label: 'Question not answered', needsValue: false, hint: 'Fires when question was completely skipped (no response at all)' },
  { value: 'SCORE_NOT_SET',        label: 'Score not set',         needsValue: false, hint: 'Fires when a scored question has no numeric score' },
]

// ── Suggested question tags ────────────────────────────────────────────────────
// These are the known tags — admins can type any value; this is just a datalist.
const SUGGESTED_TAGS = [
  'MFA','ENCRYPTION','PEN_TEST','DATA_RETENTION','DPA','IRP','BCP','DRP',
  'CERTIFICATION','VULN_MGMT','SEC_TRAINING','CISO','BREACH_NOTIFY',
  'SUBPROCESSOR','INFOSEC_POLICY','GDPR_CONSENT','ACCESS_CONTROL',
  'THIRD_PARTY_RISK','CLOUD_SECURITY','PHYSICAL_SECURITY',
]

const PRIORITY_COLOR = { CRITICAL:'red', HIGH:'amber', MEDIUM:'blue', LOW:'gray' }
const CONDITION_COLOR = {
  OPTION_SELECTED:'blue', OPTION_NOT_SELECTED:'purple', TEXT_CONTAINS:'cyan',
  TEXT_EMPTY:'amber', SCORE_BELOW:'red', SCORE_ABOVE:'green',
  FILE_NOT_UPLOADED:'amber', ANY_ANSWER:'gray',
  ANSWER_MISSING:'purple', SCORE_NOT_SET:'cyan',
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

const useRules      = () => useQuery({ queryKey:['admin-guard-rules'], queryFn: guardRulesApi.list, select: d => Array.isArray(d) ? d : (d?.data||[]) })
const useBlueprints = () => useQuery({ queryKey:['admin-blueprints'],  queryFn: blueprintsApi.list, select: d => Array.isArray(d) ? d : (d?.data||[]) })

function useSaveRule(editId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => editId ? guardRulesApi.update(editId, data) : guardRulesApi.create(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey:['admin-guard-rules'] }),
    onError:    (e) => toast.error(e?.message || 'Failed to save rule'),
  })
}
function useToggleRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: guardRulesApi.toggle,
    onSuccess:  () => qc.invalidateQueries({ queryKey:['admin-guard-rules'] }),
    onError:    (e) => toast.error(e?.message || 'Failed to toggle'),
  })
}
function useDeleteRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: guardRulesApi.delete,
    onSuccess:  () => { qc.invalidateQueries({ queryKey:['admin-guard-rules'] }); toast.success('Rule deleted') },
    onError:    (e) => toast.error(e?.message || 'Failed to delete'),
  })
}

// ── Rule Form Modal ───────────────────────────────────────────────────────────

function RuleModal({ rule, onClose }) {
  const isEdit = !!rule?.id
  const { data: blueprints  = [] } = useBlueprints()
  const { mutate: save, isPending } = useSaveRule(rule?.id)

  const [form, setForm] = useState({
    questionTag:      rule?.questionTag      || '',
    conditionType:    rule?.conditionType    || 'OPTION_SELECTED',
    conditionValue:   rule?.conditionValue   || '',
    blueprintCode:    rule?.blueprintCode    || '',
    assignedRole:     rule?.assignedRole     || '',
    priorityOverride: rule?.priorityOverride || '',
    ruleDescription:  rule?.ruleDescription  || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const ctConfig   = CONDITION_TYPES.find(c => c.value === form.conditionType)
  const selectedBp = blueprints.find(b => b.blueprintCode === form.blueprintCode)

  const handleSave = () => {
    if (!form.questionTag.trim()) { toast.error('Question tag is required'); return }
    if (!form.blueprintCode)      { toast.error('Blueprint is required'); return }
    const payload = {
      ...form,
      questionTag:      form.questionTag.trim().toUpperCase(),
      conditionValue:   ctConfig?.needsValue ? form.conditionValue : null,
      assignedRole:     form.assignedRole || null,
      priorityOverride: form.priorityOverride || null,
    }
    save(payload, { onSuccess: () => { toast.success(isEdit ? 'Rule updated' : 'Rule created'); onClose() } })
  }

  return (
    <Modal open onClose={onClose}
      title={isEdit ? 'Edit Guard Rule' : 'New Guard Rule'}
      subtitle="KashiGuard trigger condition"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={isPending} icon={Zap} onClick={handleSave}>
            {isEdit ? 'Update Rule' : 'Create Rule'}
          </Button>
        </div>
      }>
      <div className="space-y-4">

        {/* Question Tag */}
        <div>
          <label className="text-xs text-text-muted mb-1 block">Question Tag *</label>
          <input
            list="tag-suggestions"
            value={form.questionTag}
            onChange={e => set('questionTag', e.target.value.toUpperCase())}
            placeholder="e.g. MFA, ENCRYPTION, IRP…"
            className="w-full h-9 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
          />
          <datalist id="tag-suggestions">
            {SUGGESTED_TAGS.map(t => <option key={t} value={t} />)}
          </datalist>
          <p className="text-[10px] text-text-muted mt-1">
            This rule fires for every question whose <code>questionTagSnapshot</code> matches this value,
            across all templates and modules. One rule covers all questions with this tag.
          </p>
        </div>

        {/* Condition */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">Condition Type *</label>
            <select value={form.conditionType} onChange={e => set('conditionType', e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              {CONDITION_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {ctConfig && <p className="text-[10px] text-text-muted mt-1">{ctConfig.hint}</p>}
          </div>
          <div>
            {ctConfig?.needsValue ? (
              <Input label="Condition Value *" value={form.conditionValue}
                onChange={e => set('conditionValue', e.target.value)}
                placeholder={ctConfig.hint} />
            ) : (
              <div className="p-3 mt-5 rounded-lg bg-surface-overlay border border-border">
                <p className="text-[11px] text-text-muted">{ctConfig?.hint || 'No value needed'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Blueprint picker */}
        <div>
          <label className="text-xs text-text-muted mb-1 block">Blueprint (finding to raise) *</label>
          <select value={form.blueprintCode} onChange={e => set('blueprintCode', e.target.value)}
            className="w-full h-9 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
            <option value="">Select a blueprint…</option>
            {blueprints.map(b => (
              <option key={b.blueprintCode} value={b.blueprintCode}>
                [{b.blueprintCode}] {b.titleTemplate}
              </option>
            ))}
          </select>
          {selectedBp && (
            <div className="mt-2 p-2.5 rounded-lg bg-surface-overlay border border-border">
              <div className="flex items-center gap-2">
                <Badge value={selectedBp.defaultPriority} label={selectedBp.defaultPriority}
                  colorTag={PRIORITY_COLOR[selectedBp.defaultPriority]||'gray'} />
                <span className="text-[10px] text-text-muted">{selectedBp.resolutionRole}</span>
                {selectedBp.standardRef && <span className="text-[10px] text-text-muted">{selectedBp.standardRef}</span>}
              </div>
              <p className="text-xs text-text-secondary mt-1 line-clamp-2">{selectedBp.descriptionTemplate}</p>
            </div>
          )}
        </div>

        {/* Overrides */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Assigned Role Override" value={form.assignedRole}
            onChange={e => set('assignedRole', e.target.value)}
            placeholder="Leave blank to use blueprint default" />
          <div>
            <label className="text-xs text-text-muted mb-1 block">Priority Override</label>
            <select value={form.priorityOverride} onChange={e => set('priorityOverride', e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Use blueprint default</option>
              {['LOW','MEDIUM','HIGH','CRITICAL'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <Input label="Rule Description" value={form.ruleDescription}
          onChange={e => set('ruleDescription', e.target.value)}
          placeholder="e.g. Fires VA_MFA finding when vendor selects No to MFA question" />
      </div>
    </Modal>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
// ── Page ──────────────────────────────────────────────────────────────────────

export default function GuardRulesAdminPage() {
  const { data: rules      = [], isLoading } = useRules()
  const { mutate: toggleRule }               = useToggleRule()
  const { mutate: deleteRule }               = useDeleteRule()

  const [search,       setSearch]       = useState('')
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [showCreate,   setShowCreate]   = useState(false)
  const [editTarget,   setEditTarget]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const filtered = rules.filter(r => {
    const matchSearch = !search
      || r.questionTag?.toLowerCase().includes(search.toLowerCase())
      || r.blueprintCode?.toLowerCase().includes(search.toLowerCase())
      || r.blueprintTitle?.toLowerCase().includes(search.toLowerCase())
    const matchActive = activeFilter === 'ALL'
      || (activeFilter === 'ACTIVE'   &&  r.isActive)
      || (activeFilter === 'INACTIVE' && !r.isActive)
    return matchSearch && matchActive
  })

  const activeCount   = rules.filter(r =>  r.isActive).length
  const inactiveCount = rules.filter(r => !r.isActive).length

  return (
    <PageLayout title="KashiGuard Rules"
      subtitle={`${activeCount} active · ${inactiveCount} inactive`}
      actions={
        <Button variant="primary" size="sm" icon={Plus}
          onClick={() => setShowCreate(true)}>
          New Rule
        </Button>
      }>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 px-6 pt-4">
        {[
          { label: 'Total Rules',  value: rules.length,  color: 'text-text-primary' },
          { label: 'Active',       value: activeCount,   color: 'text-green-400' },
          { label: 'Inactive',     value: inactiveCount, color: 'text-text-muted' },
          { label: 'Unique Tags',  value: new Set(rules.map(r=>r.questionTag)).size, color: 'text-brand-400' },
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
            placeholder="Search by question or blueprint…"
            className="w-full h-8 pl-8 pr-3 rounded-md border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div className="flex items-center gap-1 bg-surface-raised border border-border rounded-lg p-1">
          {['ALL','ACTIVE','INACTIVE'].map(f => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={cn('text-xs px-3 py-1 rounded-md transition-colors',
                activeFilter === f ? 'bg-brand-500/10 text-brand-400 font-medium' : 'text-text-muted hover:text-text-secondary')}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Rules table */}
      <div className="px-6 py-4">
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-raised">
                {['Tag','Covers','Condition','Blueprint','Priority','Scope','Active',''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={7} className="py-16 text-center"><div className="flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/></div></td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} className="py-16 text-center text-text-muted text-xs">No rules found</td></tr>
              )}
              {filtered.map(rule => {
                const ct = CONDITION_TYPES.find(c => c.value === rule.conditionType)
                const condColor = CONDITION_COLOR[rule.conditionType] || 'gray'
                const priority = rule.priorityOverride || 'blueprint default'
                const pc = PRIORITY_COLOR[rule.priorityOverride] || 'gray'

                return (
                  <tr key={rule.id} className={cn('hover:bg-surface-overlay/40 transition-colors', !rule.isActive && 'opacity-50')}>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs bg-brand-500/10 text-brand-400">
                        {rule.questionTag}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {rule.questionCount != null
                        ? <span className="text-xs text-text-secondary">{rule.questionCount} question{rule.questionCount !== 1 ? 's' : ''}</span>
                        : <span className="text-[10px] text-text-muted italic">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <Badge value={rule.conditionType} label={ct?.label || rule.conditionType} colorTag={condColor} />
                        {rule.conditionValue && (
                          <p className="text-[10px] font-mono text-text-muted">= "{rule.conditionValue}"</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-[11px] text-brand-400">{rule.blueprintCode}</p>
                      <p className="text-[10px] text-text-muted truncate max-w-[160px]">{rule.blueprintTitle}</p>
                    </td>
                    <td className="px-4 py-3">
                      {rule.priorityOverride
                        ? <Badge value={rule.priorityOverride} label={rule.priorityOverride} colorTag={pc} />
                        : <span className="text-[10px] text-text-muted italic">blueprint</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {rule.isGlobal
                        ? <span className="text-[10px] text-blue-400">Global</span>
                        : <span className="text-[10px] text-purple-400">Tenant</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleRule(rule.id)}
                        className="transition-colors">
                        {rule.isActive
                          ? <ToggleRight size={20} className="text-green-400" />
                          : <ToggleLeft  size={20} className="text-text-muted" />
                        }
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setEditTarget(rule)}
                          className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-brand-400 transition-colors">
                          <Pencil size={12} />
                        </button>
                        {!rule.isGlobal && (
                          <button onClick={() => setDeleteTarget(rule)}
                            className="p-1.5 rounded hover:bg-surface-overlay text-text-muted hover:text-red-400 transition-colors">
                            <Trash2 size={12} />
                          </button>
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
      {showCreate  && <RuleModal onClose={() => setShowCreate(false)} />}
      {editTarget  && <RuleModal rule={editTarget} onClose={() => setEditTarget(null)} />}
      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        variant="danger" title="Delete Rule" confirmLabel="Delete"
        message={`Delete rule for "${deleteTarget?.questionText?.substring(0,60)}…"? This will stop KashiGuard from firing the ${deleteTarget?.blueprintCode} finding for this question.`}
        onConfirm={() => deleteRule(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
      />
    </PageLayout>
  )
}