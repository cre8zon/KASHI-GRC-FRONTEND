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
  const [storedLayout, setStoredLayout] = useState(null)  // FIX: preserve full layout
  const [mode, setMode]           = useState('FULL_PAGE')
  const [saving, setSaving]       = useState(false)

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
      setStoredLayout(layout)  // FIX: store full layout for safe saves
      setMode(layout.layoutMode || 'FULL_PAGE')
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
        Controls how this DETAIL screen opens at runtime. Saved to the layout record and read by{' '}
        <code className="font-mono">RecordDetailTemplate</code> via{' '}
        <code className="font-mono">viewContext.layoutMode</code>.
      </p>
      <div className="space-y-2">
        {LAYOUT_MODES.map(({ value, label, Icon, color, dimColor, desc }) => {
          const active = mode === value
          return (
            <button
              key={value}
              onClick={() => handleSelect(value)}
              disabled={saving}
              className={cn(
                'w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all',
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
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 border border-current">
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
      {saving && (
        <p className="text-[9px] text-text-muted mt-2 text-center animate-pulse">Saving…</p>
      )}
    </InspectorSection>
  )
}


export { LayoutModeInspector }
