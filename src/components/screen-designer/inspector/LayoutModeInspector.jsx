import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Layout, PanelRight, Columns2 } from 'lucide-react'
import { cn } from '../../../lib/cn'
import toast from 'react-hot-toast'
import { sdApi } from '../sdApi'
import { InspectorSection } from '../shared/InspectorHelpers'
import { LAYOUT_MODES } from '../constants'

function LayoutModeInspector({ screenKey }) {
  const qc = useQueryClient()
  const [layoutId, setLayoutId]   = useState(null)
  const [storedLayout, setStoredLayout] = useState(null)
  const [mode, setMode]           = useState('FULL_PAGE')
  const [scope, setScope]         = useState('GLOBAL')
  const [targetTenantId, setTargetTenantId] = useState(null)
  const [saving, setSaving]       = useState(false)

  // Fetch tenant list for TENANT scope selector
  const { data: tenantsRes } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn:  () => api.get('/v1/admin/tenants?size=50'),
    staleTime: 5 * 60_000,
  })
  const tenants = tenantsRes?.data?.data?.content || tenantsRes?.data?.content || []

  const { data: layoutData } = useQuery({
    queryKey: ['sd-layout', screenKey],
    queryFn:  () => sdApi.getLayout(screenKey),
    staleTime: 30_000,
  })

  useEffect(() => {
    const items = layoutData?.data?.items || layoutData?.items ||
      (Array.isArray(layoutData?.data) ? layoutData.data : null) || []
    const layout = Array.isArray(items) ? items[0] : items
    if (layout?.id) {
      setLayoutId(layout.id)
      setStoredLayout(layout)
      setMode(layout.layoutMode || 'FULL_PAGE')
      // Infer scope from stored tenantId
      if (layout.tenantId == null)  setScope('GLOBAL')
      else if (layout.tenantId === 1) setScope('PLATFORM')
      else { setScope('TENANT'); setTargetTenantId(layout.tenantId) }
    }
  }, [layoutData])

  const save = async (newMode) => {
    setSaving(true)
    try {
      // FIX: preserve ALL existing layout fields — previously columnsJson: '[]' wiped every column
      await sdApi.saveLayout(layoutId, {
        layoutKey:      screenKey,
        screen:         screenKey,
        columnsJson:    storedLayout?.columnsJson    ?? '[]',
        filtersJson:    storedLayout?.filtersJson    ?? '[]',
        tabsJson:       storedLayout?.tabsJson       ?? null,
        layoutMode:     newMode,
        roleAccessJson: storedLayout?.roleAccessJson ?? '{}',
        scope:          scope,
        targetTenantId: scope === 'TENANT' ? targetTenantId : null,
      })
      qc.invalidateQueries({ queryKey: ['sd-layout', screenKey] })
      qc.invalidateQueries({ queryKey: ['sd-all-layouts'] })
      toast.success(`Layout mode → ${newMode}`)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleSelect = (val) => {
    setMode(val)
    save(val)
  }

  return (
    <InspectorSection title="Layout mode">
      <p className="text-[9px] text-text-muted mb-3 leading-relaxed">
        Controls how this screen opens when a user clicks a list row.
        Saved to <code className="font-mono">ui_layouts.layout_mode</code>.
      </p>
      <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-card border border-brand-500/15 bg-brand-500/5 mb-3">
        <span className="text-brand-ink text-[11px] shrink-0">💡</span>
        <p className="text-[9px] text-text-muted leading-relaxed">
          Capability tabs (Workflow, Evidence, Comments) only appear if enabled in
          Blueprint Settings → Capabilities. Configure tabs shown using the
          <strong> Tabs</strong> inspector on this screen.
        </p>
      </div>
      <div className="space-y-2">
        {LAYOUT_MODES.map(({ value, label, Icon, color, dimColor, desc }) => {
          const active = mode === value
          return (
            <button
              key={value}
              onClick={() => handleSelect(value)}
              disabled={saving}
              className={cn(
                'w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-card border transition-all',
                active ? color : dimColor,
                saving ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90 cursor-pointer',
              )}>
              <Icon size={14} className={cn('mt-0.5 shrink-0', active ? '' : 'text-text-muted')} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('text-[11px] font-semibold', active ? '' : 'text-text-muted')}>
                    {label}
                  </span>
                  {active && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-on-dark/10 border border-current">
                      active
                    </span>
                  )}
                </div>
                <p className={cn('text-[9px] mt-0.5 leading-relaxed', active ? 'opacity-80' : 'text-text-muted')}>
                  {desc}
                </p>
              </div>
            </button>
          )
        })}
      </div>
      {/* Scope selector — controls which tenants see this layout */}
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-[9px] font-semibold text-text-muted uppercase tracking-wide mb-2">Visibility scope</p>
        <div className="space-y-1.5">
          {[
            { value: 'GLOBAL',   label: 'Global',          desc: 'All tenants inherit this layout' },
            { value: 'PLATFORM', label: 'Platform only',   desc: 'Only visible in admin panel' },
            { value: 'TENANT',   label: 'Specific tenant', desc: 'Override for one tenant only' },
          ].map(s => (
            <button key={s.value} onClick={() => { setScope(s.value); if (s.value !== 'TENANT') setTargetTenantId(null) }}
              className={`w-full text-left flex items-start gap-2 px-3 py-2 rounded-card border text-[10px] transition-all ${
                scope === s.value
                  ? 'border-brand-500/40 bg-brand-500/10 text-brand-ink'
                  : 'border-border text-text-muted hover:border-border-strong'
              }`}>
              <span className={`mt-0.5 w-3 h-3 rounded-full border shrink-0 flex items-center justify-center ${
                scope === s.value ? 'border-brand-400 bg-brand-400' : 'border-text-muted'
              }`}>
                {scope === s.value && <span className="w-1.5 h-1.5 rounded-full bg-surface-raised" />}
              </span>
              <div>
                <span className="font-medium">{s.label}</span>
                <span className="text-[9px] block text-text-muted opacity-70">{s.desc}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Tenant picker — shown when scope = TENANT */}
        {scope === 'TENANT' && (
          <div className="mt-2">
            <select
              value={targetTenantId || ''}
              onChange={e => setTargetTenantId(Number(e.target.value) || null)}
              className="w-full text-[10px] px-2 py-1.5 rounded border border-border bg-surface-overlay text-text-primary">
              <option value="">— Select tenant —</option>
              {tenants.filter(t => t.id !== 1).map(t => (
                <option key={t.id} value={t.id}>{t.name} (#{t.id})</option>
              ))}
            </select>
          </div>
        )}

        {scope === 'GLOBAL' && (
          <p className="text-[9px] text-status-warn-fg mt-1.5">
            ⚙ Changes will apply to all tenants on next page load
          </p>
        )}
      </div>

      {saving && (
        <p className="text-[9px] text-text-muted mt-2 text-center animate-pulse">Saving…</p>
      )}
    </InspectorSection>
  )
}


export { LayoutModeInspector }