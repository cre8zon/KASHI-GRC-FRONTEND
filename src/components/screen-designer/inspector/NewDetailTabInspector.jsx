import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Layers, List, Eye, EyeOff, Plus, Search, Settings, Code2, Copy, ChevronRight, ChevronDown, GitBranch, Shield, Users, Zap, X, Save, RefreshCw, Lock, Unlock, MousePointerClick, Table2, Layout, PanelLeft, FileEdit, Square, ArrowRight, CheckCircle2, AlertTriangle, GripVertical, Pencil, Trash2, Link2, ExternalLink, Info, Hash, Columns2, SlidersHorizontal, Flag, Tag, Activity, PanelRight, Calendar, User, FileText } from 'lucide-react'
import { cn } from '../../../lib/cn'
import api from '../../../config/axios.config'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { sdApi } from '../sdApi'
import { Button } from '../../ui/Button'
import { InspectorSection, Row, IField, IInp, ISel } from '../shared/InspectorHelpers'
import { SIDES, HTTP_METHODS, ACTION_VARIANTS, LAYOUT_MODES,
         SCREEN_TYPES, FIELD_TYPES, FIELD_TYPE_GROUPS, CAPABILITY_TABS } from '../constants'
import { moduleBlueprintsApi as moduleApi } from '../../../api/moduleBlueprints.api'

const COMMON_TAB_ICONS = [
  'Hash','Layers','CheckSquare','Shield','AlertTriangle','FileText','Zap',
  'Activity','BookOpen','GitBranch','ClipboardList','Flag','Users','Eye',
  'BarChart2','Settings','Link','Upload','MessageSquare','Calendar','Target',
]

function IconPicker({ value, onChange }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {COMMON_TAB_ICONS.map(name => (
          <button key={name} type="button"
            onClick={() => onChange(value === name ? '' : name)}
            className={cn(
              'px-2 py-0.5 rounded text-[10px] font-mono border transition-colors',
              value === name
                ? 'bg-brand-500/20 border-brand-500/40 text-brand-400'
                : 'bg-surface-overlay border-border text-text-muted hover:text-text-secondary'
            )}>
            {name}
          </button>
        ))}
      </div>
      <input
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder="Or type any Lucide icon name…"
        className="w-full h-7 px-2 text-[11px] font-mono bg-surface-raised border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500/50"
      />
      {value && !COMMON_TAB_ICONS.includes(value) && (
        <p className="text-[9px] text-amber-400">
          Custom icon "{value}" — make sure it's a valid Lucide icon name or it'll fall back to #
        </p>
      )}
    </div>
  )
}


function NewDetailTabInspector({ screenKey, layout, onSave }) {
  const qc = useQueryClient()
  const [label, setLabel] = useState('')
  const [icon,  setIcon]  = useState('')

  // Derive entityType from screenKey (e.g. 'issue_detail' → 'ISSUE')
  // to fetch blueprint and check which capability tabs are enabled
  const entityType = screenKey?.replace(/_detail$|_list$/, '').toUpperCase()
  const { data: bpRes } = useQuery({
    queryKey: ['blueprint-for-sd', entityType],
    queryFn:  () => moduleApi.blueprint(entityType),
    enabled:  !!entityType,
    staleTime: 60_000,
  })
  const bp = bpRes?.data || bpRes

  // Capability tabs that are disabled on this blueprint
  const disabledCapTabs = {
    workflow: !bp?.supportsWorkflow,
    evidence: !bp?.supportsDocuments,
    comments: !bp?.supportsComments,
    actions:  !bp?.supportsActionItems,
  }

  // Derive current tab list from layout.tabsJson so we can append to it
  const currentTabs = useMemo(() => {
    try {
      const parsed = JSON.parse(layout?.tabsJson || 'null')
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(t =>
          typeof t === 'string'
            ? { key: t.toLowerCase().replace(/\s+/g, '_'), label: t }
            : t
        )
      }
    } catch {}
    // Fall back to defaults so the new tab is appended after them
    return ['Overview', 'Workflow', 'Evidence', 'Comments', 'History'].map(t => ({
      key: t.toLowerCase().replace(/\s+/g, '_'), label: t,
    }))
  }, [layout?.tabsJson])

  const saveMut = useMutation({
    mutationFn: () => {
      if (!label.trim()) return Promise.reject(new Error('Tab label is required'))
      if (!layout?.id)   return Promise.reject(new Error('Layout record not found — save a column first so the layout row exists'))
      const newKey = label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
      // Prevent duplicate keys or labels
      const isDupe = currentTabs.some(t => t.key === newKey || t.label.toLowerCase() === label.trim().toLowerCase())
      if (isDupe) return Promise.reject(new Error(`A tab named "${label.trim()}" already exists`))
      const newTab  = { key: newKey, label: label.trim(), ...(icon.trim() ? { icon: icon.trim() } : {}) }
      const newTabs = [...currentTabs, newTab]
      return sdApi.saveLayout(layout.id, {
        layoutKey:      screenKey,
        screen:         screenKey,
        columnsJson:    layout?.columnsJson    || '[]',
        tabsJson:       JSON.stringify(newTabs),
        layoutMode:     layout?.layoutMode     || 'FULL_PAGE',
        roleAccessJson: layout?.roleAccessJson || '{}',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sd-layout', screenKey] })
      toast.success('Tab added')
      onSave()
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || 'Failed'),
  })

  const derivedKey = label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')

  return (
    <div className="p-4 space-y-4">
      <InspectorSection title="Add new tab">
        <p className="text-[10px] text-text-muted mb-3">
          Adds a custom tab to this DETAIL screen. The tab appears immediately on the canvas and
          can be configured with role-level visibility rules after adding.
        </p>

        {/* Capability tab warnings — show when blueprint has caps disabled */}
        {bp && Object.values(disabledCapTabs).some(Boolean) && (
          <div className="space-y-1 mb-3">
            <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <span className="text-amber-400 text-[11px] mt-0.5 shrink-0">⚙</span>
              <div className="text-[10px] text-amber-300/80 leading-relaxed">
                Some capability tabs are <strong>disabled in Blueprint Settings</strong> and
                won't appear at runtime even if added here:
                <ul className="mt-1 space-y-0.5">
                  {disabledCapTabs.workflow && (
                    <li>• <strong>Workflow</strong> — enable <code className="font-mono">supportsWorkflow</code> in Blueprint Settings</li>
                  )}
                  {disabledCapTabs.evidence && (
                    <li>• <strong>Evidence</strong> — enable <code className="font-mono">supportsDocuments</code></li>
                  )}
                  {disabledCapTabs.comments && (
                    <li>• <strong>Comments</strong> — enable <code className="font-mono">supportsComments</code></li>
                  )}
                  {disabledCapTabs.actions && (
                    <li>• <strong>Action Items</strong> — enable <code className="font-mono">supportsActionItems</code></li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        <IField label="Tab label *">
          <IInp value={label} onChange={setLabel} placeholder="e.g. Tests · Policies · Risk score · Remediations" />
        </IField>

        <IField label="Tab icon">
          <IconPicker value={icon} onChange={setIcon} />
        </IField>

        {label.trim() && (
          <IField label="Derived key (auto)">
            <code className="text-[10px] font-mono text-text-muted">{derivedKey}</code>
          </IField>
        )}
        {/* Warn if user is trying to add a known capability tab that's disabled */}
        {derivedKey && disabledCapTabs[derivedKey] !== undefined && disabledCapTabs[derivedKey] && (
          <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-[10px] text-amber-300/80">
            <span className="text-amber-400 shrink-0">⚙</span>
            <span>
              <strong>{label.trim()}</strong> is a capability tab. It won't appear at runtime
              until <code className="font-mono">{
                derivedKey === 'workflow' ? 'supportsWorkflow' :
                derivedKey === 'evidence' ? 'supportsDocuments' :
                derivedKey === 'comments' ? 'supportsComments' : 'supportsActionItems'
              }</code> is enabled in Blueprint Settings → Capabilities.
            </span>
          </div>
        )}

        <p className="text-[9px] text-text-muted leading-relaxed">
          Stored in <code className="font-mono">tabsJson</code> on the layout record.
          Tab content rendering is wired up separately in the frontend component that
          reads from this screen config.
        </p>
      </InspectorSection>

      <Button
        size="sm" icon={Plus}
        loading={saveMut.isPending}
        onClick={() => saveMut.mutate()}
        className="w-full"
        disabled={!label.trim() || !layout?.id}>
        Add tab
      </Button>

      {!layout?.id && (
        <p className="text-[9px] text-amber-400 text-center leading-relaxed">
          No layout record yet — add a column first (Preview → click + in the table header) so the layout row is created,
          then come back to add tabs.
        </p>
      )}
    </div>
  )
}


export { NewDetailTabInspector }