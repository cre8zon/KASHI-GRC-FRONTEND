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


function NewDetailTabInspector({ screenKey, layout, onSave }) {
  const qc = useQueryClient()
  const [label, setLabel] = useState('')

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
      const newTab  = { key: newKey, label: label.trim() }
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

        <IField label="Tab label *">
          <IInp value={label} onChange={setLabel} placeholder="e.g. Tests · Policies · Risk score · Remediations" />
        </IField>

        {label.trim() && (
          <IField label="Derived key (auto)">
            <code className="text-[10px] font-mono text-text-muted">{derivedKey}</code>
          </IField>
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
