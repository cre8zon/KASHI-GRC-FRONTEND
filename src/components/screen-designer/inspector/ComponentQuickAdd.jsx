import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../../lib/cn'
import api from '../../../config/axios.config'
import toast from 'react-hot-toast'
import { InspectorSection } from '../shared/InspectorHelpers'

function ComponentQuickAdd({ screenKey }) {
  const qc = useQueryClient()
  const [key, setKey] = useState('')
  const [type, setType] = useState('DROPDOWN')

  const createMut = useMutation({
    mutationFn: () => api.post('/v1/admin/ui/components', { componentKey: key, componentType: type, screen: screenKey, label: key }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-comp', screenKey] }); toast.success('Component added'); setKey('') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  return (
    <InspectorSection title="Quick add component">
      <div className="flex gap-1.5">
        <input value={key} onChange={e => setKey(e.target.value.toLowerCase().replace(/\s+/g,'_'))}
          placeholder="component_key"
          className="flex-1 h-7 px-2 text-[10px] font-mono bg-surface-overlay border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        <select value={type} onChange={e => setType(e.target.value)}
          className="h-7 px-1.5 text-[10px] bg-surface-overlay border border-border rounded text-text-primary focus:outline-none">
          {['DROPDOWN','BADGE','RADIO','MULTI_SELECT'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => { if (!key) return; createMut.mutate() }}
          className="h-7 px-2 bg-brand-500/20 text-brand-400 rounded border border-brand-500/30 text-[10px] hover:bg-brand-500/30 transition-colors">
          Add
        </button>
      </div>
    </InspectorSection>
  )
}


export { ComponentQuickAdd }
