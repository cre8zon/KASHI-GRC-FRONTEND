import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../config/axios.config'
import { inferType } from './constants'

function useScreenRegistry() {
  // Derive all screens from the three tables
  const { data: allC } = useQuery({ queryKey: ['sd-all-components'], queryFn: () => api.get('/v1/admin/ui/components', { params: { take: 500 } }), staleTime: 60_000 })
  const { data: allL } = useQuery({ queryKey: ['sd-all-layouts'],    queryFn: () => api.get('/v1/admin/ui/layouts',    { params: { take: 500 } }), staleTime: 60_000 })
  const { data: allA } = useQuery({ queryKey: ['sd-all-actions'],    queryFn: () => api.get('/v1/admin/ui/actions',    { params: { take: 500 } }), staleTime: 60_000 })
  // FIX: include forms so FORM screens appear in sidebar even before they have actions/layouts
  const { data: allF } = useQuery({ queryKey: ['sd-all-forms'],      queryFn: () => api.get('/v1/admin/ui/forms',      { params: { take: 500 } }), staleTime: 30_000 })

  const extract = (d) => d?.data?.items || d?.items || (Array.isArray(d?.data) ? d.data : null) || []

  // Each screen has a key, a type, and a name
  // We store type in layout.screen meta — if not, we infer from naming conventions
  // Keys produced by RoleVisibilityEditor for field/tab/header visibility config.
  // These are internal layout records — not real screens — and must be hidden from the sidebar.
  // Pattern: {screenKey}_field_{fieldKey}  |  {screenKey}_tab_{tabKey}  |  {screenKey}_header
  const isDerivedKey = (k) =>
    k.includes('_field_') || k.includes('_tab_') || k.endsWith('_header')

  const screens = useMemo(() => {
    const map = new Map()
    extract(allC).forEach(c => c.screen && !map.has(c.screen) && map.set(c.screen, { key: c.screen, type: inferType(c.screen), label: c.screen }))
    extract(allL).forEach(l => {
      const k = l.screen || l.layoutKey
      if (k && !map.has(k) && !isDerivedKey(k)) map.set(k, { key: k, type: l.screenType || inferType(k), label: l.title || k })
    })
    extract(allA).forEach(a => a.screenKey && !map.has(a.screenKey) && map.set(a.screenKey, { key: a.screenKey, type: inferType(a.screenKey), label: a.screenKey }))
    // FIX: formKey is the screen key for FORM screens — include so they show in sidebar
    extract(allF).forEach(f => f.formKey && !map.has(f.formKey) && !isDerivedKey(f.formKey) && map.set(f.formKey, { key: f.formKey, type: inferType(f.formKey), label: f.title || f.formKey }))
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
  }, [allC, allL, allA, allF])

  return screens
}


export { useScreenRegistry }