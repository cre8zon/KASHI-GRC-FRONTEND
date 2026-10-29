import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { sdApi } from '../sdApi'

/**
 * A detail screen's tabs_json, read and patched entry by entry.
 *
 * Used by the inspectors that store per-tab display flags:
 *   "header": true      a Screen Designer tab has its own header form
 *   "headerKpi": bool   a tab built in code shows a summary tile in the
 *                       header zone
 *
 * patchTab(key, patch) merges into the entry with that key, or appends a new
 * {key, label, ...patch} entry when the screen lists no such tab — capability
 * tabs (Workflow, Evidence…) are often absent from tabs_json, and the runtime
 * ignores capability entries for tab ORDER, so appending one only carries its
 * flags. Every other layout column is saved back as it was read.
 */
export function useLayoutTabs(screenKey) {
  const qc = useQueryClient()
  const { data: layoutData, isLoading } = useQuery({
    queryKey: ['sd-layout', screenKey],
    queryFn: () => sdApi.getLayout(screenKey),
    enabled: !!screenKey,
    staleTime: 30_000,
  })
  const layout = useMemo(() => {
    const items = layoutData?.data?.items || layoutData?.items
      || (Array.isArray(layoutData?.data) ? layoutData.data : null) || []
    return Array.isArray(items) ? items[0] : items
  }, [layoutData])

  const tabs = useMemo(() => {
    try {
      const parsed = JSON.parse(layout?.tabsJson || 'null')
      if (Array.isArray(parsed)) {
        return parsed.map(t => typeof t === 'string'
          ? { key: t.toLowerCase().replace(/\s+/g, '_'), label: t } : t)
      }
    } catch { /* malformed — treated as no tabs */ }
    return []
  }, [layout?.tabsJson])

  const saveMut = useMutation({
    mutationFn: (newTabs) => {
      if (!layout?.id) return Promise.reject(new Error('Layout not loaded yet — save the screen layout first'))
      return sdApi.saveLayout(layout.id, {
        layoutKey:      layout.layoutKey || screenKey,
        screen:         layout.screen || screenKey,
        title:          layout.title,
        columnsJson:    layout.columnsJson    ?? '[]',
        filtersJson:    layout.filtersJson    ?? '[]',
        tabsJson:       JSON.stringify(newTabs),
        layoutMode:     layout.layoutMode     || 'FULL_PAGE',
        roleAccessJson: layout.roleAccessJson ?? '{}',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sd-layout', screenKey] })
      qc.invalidateQueries({ queryKey: ['screen-config', screenKey] })
      toast.success('Saved')
    },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || 'Failed to save'),
  })

  const patchTab = (key, patch, label) => {
    const exists = tabs.some(t => t.key === key)
    const next = exists
      ? tabs.map(t => (t.key === key ? { ...t, ...patch } : t))
      : [...tabs, { key, label: label || key, ...patch }]
    saveMut.mutate(next)
  }

  return { layout, tabs, isLoading, patchTab, saving: saveMut.isPending }
}
