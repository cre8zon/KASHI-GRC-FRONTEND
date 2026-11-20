import { useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { tablePrefsApi } from '../api/tablePrefs.api'

/**
 * One user's saved layout for one table, kept on the server per user (and
 * per organisation), so it follows them to any device.
 *
 *   prefs  — { widths: { key: px }, hidden: [key], order: [key] } or null (default)
 *   update — merge a change in; the table repaints at once, and the save goes
 *            to the server half a second after the last change, so dragging a
 *            column edge sends one request, not one per pixel
 *   reset  — back to the table's default (deletes the saved layout)
 *
 * With no key, prefs stay null and update/reset do nothing.
 */
export function useTablePrefs(tableKey) {
  const qc = useQueryClient()
  const queryKey = ['table-prefs', tableKey]
  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const r = await tablePrefsApi.get(tableKey)
      return r?.prefs ?? r?.data?.prefs ?? null
    },
    enabled: !!tableKey,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  })

  const timer = useRef(null)
  const pending = useRef(null)   // { key, prefs } not yet sent

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const p = pending.current
    pending.current = null
    if (p) tablePrefsApi.save(p.key, p.prefs)
      .catch(() => toast.error('Could not save your column layout'))
  }, [])

  const update = useCallback((patch) => {
    if (!tableKey) return
    const next = { ...(qc.getQueryData(['table-prefs', tableKey]) || {}), ...patch }
    qc.setQueryData(['table-prefs', tableKey], next)
    pending.current = { key: tableKey, prefs: next }
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 500)
  }, [tableKey, qc, flush])

  const reset = useCallback(() => {
    if (!tableKey) return
    clearTimeout(timer.current)
    pending.current = null
    qc.setQueryData(['table-prefs', tableKey], null)
    tablePrefsApi.reset(tableKey).catch(() => toast.error('Could not reset the column layout'))
  }, [tableKey, qc])

  // Leaving the page (or switching table) inside the half-second still saves.
  useEffect(() => flush, [tableKey, flush])

  return { prefs: tableKey ? (data || null) : null, update, reset }
}
