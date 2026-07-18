import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Copy, ExternalLink } from 'lucide-react'
import { cn } from '../../lib/cn'
import api from '../../config/axios.config'
import toast from 'react-hot-toast'
import { SCREEN_TEMPLATES } from './constants'

function JsonPreviewTab({ screen }) {
  const isForm = screen.type === 'FORM'

  // FORM screens: fetch from /v1/ui-config/form/:key — returns field definitions
  // Other screens: fetch from /v1/ui-config/screen/:key — returns screen config
  const formEndpoint = `/v1/ui-config/form/${screen.key}`
  const screenEndpoint = `/v1/ui-config/screen/${screen.key}`
  const endpoint = isForm ? formEndpoint : screenEndpoint

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sd-resolved-json', screen.key],
    queryFn: () => isForm
      ? api.get(formEndpoint)
      : api.get(`/v1/ui-config/screen/${screen.key}`),
    staleTime: 0,
    enabled: !!screen.key,
  })

  const json = data?.data || data

  const template = Object.values(SCREEN_TEMPLATES).find(
    t => t.itemKey === screen.key || t.sectionKey === screen.key
  )

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Context-aware instructions */}
        {isForm ? (
          <div className="p-3 rounded-card bg-brand-500/5 border border-brand-500/20 text-[11px] text-text-secondary space-y-1">
            <p className="font-medium text-text-primary">How to link this form to a module blueprint</p>
            <p>1. Open <span className="font-mono text-brand-400">/admin/modules</span> → select your module blueprint → click Edit</p>
            <p>2. Set <span className="font-mono text-brand-400">createFormKey = {screen.key}</span></p>
            <p>3. The blueprint will show a &quot;New [entity]&quot; button that opens this form at runtime.</p>
            <p className="text-text-muted">DynamicForm fetches this endpoint at render time. Add fields in Preview or Elements tab.</p>
          </div>
        ) : (
          <div className="p-3 rounded-card bg-brand-500/5 border border-brand-500/20 text-[11px] text-text-secondary space-y-1">
            <p className="font-medium text-text-primary">How to link this key to a blueprint section</p>
            <p>1. Open <span className="font-mono text-brand-400">/admin/workflows</span> → select your workflow → click a step</p>
            <p>2. In the section editor, set <span className="font-mono text-brand-400">itemScreenKey = {template?.itemKey || screen.key}</span></p>
            {template?.sectionKey && (
              <p>3. Set <span className="font-mono text-brand-400">sectionScreenKey = {template.sectionKey}</span></p>
            )}
            <p className="text-text-muted">The engine snapshots these keys at task activation — running instances are never affected by changes here.</p>
          </div>
        )}

        {/* Live JSON */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
            GET {endpoint.toUpperCase()}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary transition-colors">
              <RefreshCw size={11} /> Refresh
            </button>
            {json && (
              <button
                onClick={() => { navigator.clipboard.writeText(JSON.stringify(json, null, 2)); toast.success('JSON copied') }}
                className="flex items-center gap-1 text-[10px] text-text-muted hover:text-brand-400 transition-colors">
                <Copy size={11} /> Copy
              </button>
            )}
            <a href={endpoint} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-brand-400 transition-colors">
              <ExternalLink size={11} /> Open
            </a>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-text-muted text-sm">Loading…</div>
        ) : (
          <pre className="text-xs font-mono text-text-primary bg-surface border border-border rounded-card p-4 overflow-auto leading-relaxed">
            {JSON.stringify(json, null, 2)}
          </pre>
        )}

        {/* Seed SQL hint */}
        <div className="p-3 rounded-card bg-surface border border-border text-xs text-text-secondary">
          <p className="font-medium text-text-secondary mb-1">
            {isForm ? 'Generate seed SQL for this form' : 'Generate seed SQL for this screen config'}
          </p>
          <p>Run in your MySQL / Postgres instance to pre-populate these {isForm ? 'form fields' : 'screen keys'} for new tenants:</p>
          <code className="block mt-2 font-mono text-[10px] text-brand-400">
            {isForm
              ? `INSERT INTO ui_form_fields (form_id, field_key, field_type, label, …) VALUES …`
              : `INSERT INTO ui_actions (screen_key, action_key, label, …) VALUES …`}
          </code>
        </div>
      </div>
    </div>
  )
}


export { JsonPreviewTab }