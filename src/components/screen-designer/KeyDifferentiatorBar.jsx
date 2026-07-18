import { useState, useMemo, useRef, useEffect } from 'react'
import { Copy } from 'lucide-react'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'
import { SCREEN_TYPES, SCREEN_TEMPLATES, FIELD_TYPE_COLOR, GRID_LABEL } from './constants'

function KeyDifferentiatorBar({ screen, inline = false }) {
  const template = Object.values(SCREEN_TEMPLATES).find(
    t => t.itemKey === screen.key || t.sectionKey === screen.key
  )
  const itemKey    = template?.itemKey    || (screen.type === 'ITEM_CARD' ? screen.key : '')
  const sectionKey = template?.sectionKey || (screen.type === 'SECTION'   ? screen.key : '')
  const formKey    = template?.formKey    || ''

  const copy = (val) => { if (!val) return; navigator.clipboard.writeText(val); toast.success('Copied') }

  return (
    <div className={inline
      ? "flex items-center gap-0 text-[10px]"
      : "flex items-center gap-0 px-4 py-1.5 border-b border-border/30 bg-surface-secondary shrink-0 text-[10px] flex-wrap gap-y-1"}>
      {[
        { label: 'itemScreenKey',    value: itemKey,    color: 'text-brand-400 bg-brand-500/10 border-brand-500/20' },
        { label: 'sectionScreenKey', value: sectionKey, color: 'text-status-tag-fg bg-status-tag-bg border-status-tag-bd' },
        { label: 'formKey',          value: formKey,    color: 'text-status-warn-fg bg-status-warn-bg border-status-warn-bd' },
      ].map(({ label, value, color }) => (
        <div key={label} className="flex items-center gap-1.5 mr-4">
          <span className="text-text-muted">{label}</span>
          {value ? (
            <button
              onClick={() => copy(value)}
              className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono transition-opacity hover:opacity-80', color)}>
              {value}
              <Copy size={9} />
            </button>
          ) : (
            <span className="text-text-muted/40 font-mono">—</span>
          )}
        </div>
      ))}
      <div className="ml-auto text-text-muted">
        Referenced in: <span className="text-text-secondary font-mono">WorkflowStepSection.{
          screen.type === 'ITEM_CARD' ? 'itemScreenKey' :
          screen.type === 'SECTION'   ? 'sectionScreenKey' :
          screen.type === 'FORM'      ? 'createFormKey / editFormKey' :
          screen.type === 'LIST'      ? 'listScreenKey' :
          screen.type === 'DETAIL'    ? 'detailScreenKey' : 'navKey'
        }</span>
      </div>
    </div>
  )
}

// RoleSimulator is now inlined in ScreenDesignerPage topbar

// ─── NEW: Elements tab ────────────────────────────────────────────────────────
// Lists every configurable element on the screen with its current role access.
// Clicking an element opens it in the Inspector.

// ─── Form-specific elements tab ──────────────────────────────────────────────
// Shows all form fields as a configurable list. Clicking any field opens it
// in the Inspector exactly like clicking it on the canvas.

export { KeyDifferentiatorBar }
