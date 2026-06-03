/**
 * TemplateSectionsTab.jsx
 * API response structure:
 * {
 *   template: {...},
 *   rootSections: [
 *     {
 *       section: { id, name, sectionCode, ... },
 *       controls: [{ control: {...}, ... }],
 *       children: [ { section, controls, children }, ... ]
 *     }
 *   ]
 * }
 */

import { useState, useMemo } from 'react'
import { useQuery }          from '@tanstack/react-query'
import { ChevronRight, ChevronDown, CheckSquare, Layers, X } from 'lucide-react'
import api                   from '../../config/axios.config'

const fetchFull = (id) => api.get(`/v1/audit/library/templates/${id}/full`)

function SectionNode({ node, showControls, depth = 0, onSelectControl }) {
  const [open, setOpen] = useState(depth < 2)
  const sec      = node.section || {}
  const controls = node.controls || []
  const children = node.children || []

  return (
    <div style={{ marginLeft: depth * 12 }}>
      <div
        className="flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer hover:bg-surface-overlay/40 select-none"
        onClick={() => setOpen(o => !o)}
      >
        {children.length > 0
          ? open ? <ChevronDown size={11} className="text-text-muted shrink-0" />
                 : <ChevronRight size={11} className="text-text-muted shrink-0" />
          : <span className="w-[11px]" />}
        <Layers size={10} className="text-text-muted shrink-0" />
        {sec.sectionCode && (
          <span className="font-mono text-[10px] text-brand-400 shrink-0">{sec.sectionCode}</span>
        )}
        <span className="text-xs text-text-primary truncate">{sec.name}</span>
        {controls.length > 0 && (
          <span className="ml-auto text-[9px] text-text-muted shrink-0 pl-2">{controls.length}c</span>
        )}
      </div>

      {open && showControls && controls.map((item, i) => {
        const c = item.control || item
        return (
          <div key={c.id || i}
            style={{ marginLeft: (depth + 1) * 12 }}
            className="flex items-start gap-1.5 py-0.5 px-2">
            <CheckSquare size={9} className="text-text-muted shrink-0 mt-0.5" />
            {c.controlCode && (
              <span className="font-mono text-[9px] text-text-muted shrink-0">{c.controlCode}</span>
            )}
            <span className="text-[11px] text-text-secondary leading-snug truncate">{c.name}</span>
          </div>
        )
      })}

      {open && children.map((child, i) => (
        <SectionNode key={child.section?.id || i} node={child}
          showControls={showControls} depth={depth + 1} onSelectControl={onSelectControl} />
      ))}
    </div>
  )
}

function flatControls(nodes) {
  const out = []
  const walk = (list) => {
    for (const node of list || []) {
      for (const item of node.controls || []) {
        const c = item.control || item
        out.push({ ...c, _sec: node.section?.sectionCode, _secName: node.section?.name })
      }
      walk(node.children)
    }
  }
  walk(nodes)
  return out
}

function ControlDetailPanel({ ctrl, onClose }) {
  if (!ctrl) return null
  return (
    <div className="absolute inset-0 bg-surface z-20 flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
        <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-surface-overlay">
          <ChevronRight size={13} className="rotate-180" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {ctrl.controlCode && <span className="font-mono text-[10px] text-brand-400">{ctrl.controlCode}</span>}
            {ctrl.controlTag  && <span className="text-[9px] px-1 rounded bg-surface-overlay text-text-muted">{ctrl.controlTag}</span>}
          </div>
          <p className="text-sm font-medium text-text-primary truncate">{ctrl.name}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {ctrl.description && <div><p className="text-[9px] text-text-muted uppercase tracking-wide mb-1">Description</p><p className="text-xs text-text-primary leading-relaxed">{ctrl.description}</p></div>}
        {ctrl.testType    && <div><p className="text-[9px] text-text-muted uppercase tracking-wide mb-1">Test type</p><p className="text-xs text-text-primary">{ctrl.testType}</p></div>}
        {ctrl.frameworkRef && <div><p className="text-[9px] text-text-muted uppercase tracking-wide mb-1">Framework</p><p className="text-xs text-text-primary">{ctrl.frameworkRef}</p></div>}
        {ctrl.controlTag   && <div><p className="text-[9px] text-text-muted uppercase tracking-wide mb-1">Control tag</p><p className="text-xs text-text-primary">{ctrl.controlTag}</p></div>}
      </div>
    </div>
  )
}

export function TemplateSectionsTab({ templateId, view = 'sections' }) {
  const [selectedControl, setSelectedControl] = useState(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ['tpl-full', templateId],
    queryFn:  () => fetchFull(templateId),
    staleTime: 60_000,
    enabled:   !!templateId,
  })

  const rootSections = useMemo(() => {
    const d = data?.data?.data || data?.data || data
    return d?.rootSections || []
  }, [data])

  const controls = useMemo(() => flatControls(rootSections), [rootSections])

  if (isLoading) return <div className="px-4 py-6 text-xs text-text-muted text-center">Loading…</div>
  if (error)     return <div className="px-4 py-6 text-xs text-red-400 text-center">Error loading template</div>
  if (!rootSections.length) return (
    <div className="px-4 py-6 text-xs text-text-muted text-center">No sections in this template.</div>
  )

  if (view === 'controls') return (
    <div className="overflow-y-auto relative">
      {selectedControl && (
        <ControlDetailPanel ctrl={selectedControl} onClose={() => setSelectedControl(null)} />
      )}
      <div className="px-3 py-1.5 text-[10px] text-text-muted border-b border-border/40">
        {controls.length} controls
      </div>
      {controls.map((c, i) => (
        <div key={c.id || i} className="flex items-start gap-2 px-3 py-1.5 hover:bg-surface-overlay/30 cursor-pointer"
          onClick={() => setSelectedControl(c)}>
          <CheckSquare size={10} className="text-text-muted shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {c.controlCode && <span className="font-mono text-[9px] text-brand-400">{c.controlCode}</span>}
              {c.controlTag  && <span className="text-[9px] px-1 rounded bg-surface-overlay text-text-muted">{c.controlTag}</span>}
            </div>
            <span className="text-[11px] text-text-secondary leading-tight block">{c.name}</span>
            <span className="text-[9px] text-text-muted">{c._sec} · {c._secName}</span>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="overflow-y-auto">
      <div className="px-3 py-1.5 text-[10px] text-text-muted border-b border-border/40">
        {rootSections.length} top-level sections · {controls.length} controls
      </div>
      {selectedControl && (
        <ControlDetailPanel ctrl={selectedControl} onClose={() => setSelectedControl(null)} />
      )}
      {rootSections.map((node, i) => (
        <SectionNode key={node.section?.id || i} node={node} showControls depth={0}
          onSelectControl={setSelectedControl} />
      ))}
    </div>
  )
}