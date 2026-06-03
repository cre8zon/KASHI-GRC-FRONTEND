import { useState, useMemo, useRef, useEffect } from 'react'
import { X, ArrowRight } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { SCREEN_TYPES, SCREEN_TEMPLATES } from '../constants'

function TemplatePicker({ onClose, onApply }) {
  const groups = [...new Set(Object.values(SCREEN_TEMPLATES).map(t => t.group))]

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* backdrop */}
      <div className="flex-1 bg-black/50" onClick={onClose} />

      {/* panel */}
      <div className="w-96 bg-surface border-l border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-text-primary">Template library</p>
            <p className="text-[11px] text-text-muted">Pick a template to start — keys + default actions are seeded</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {groups.map(group => (
            <div key={group}>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">{group}</p>
              <div className="space-y-2">
                {Object.entries(SCREEN_TEMPLATES)
                  .filter(([, t]) => t.group === group)
                  .map(([key, tmpl]) => {
                    const st = SCREEN_TYPES[tmpl.screenType]
                    return (
                      <button key={key}
                        onClick={() => onApply(tmpl)}
                        className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:border-brand-500/40 bg-background hover:bg-brand-500/5 text-left transition-all group shadow-sm">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border', st?.color)}>
                          {st && <st.icon size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-text-primary">{tmpl.label}</p>
                          <p className="text-[10px] text-text-muted mt-0.5">{tmpl.desc}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {tmpl.itemKey && (
                              <code className="text-[9px] font-mono bg-teal-500/10 border border-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded">
                                item: {tmpl.itemKey}
                              </code>
                            )}
                            {tmpl.sectionKey && (
                              <code className="text-[9px] font-mono bg-purple-500/10 border border-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
                                section: {tmpl.sectionKey}
                              </code>
                            )}
                            {tmpl.formKey && (
                              <code className="text-[9px] font-mono bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                                form: {tmpl.formKey}
                              </code>
                            )}
                          </div>
                        </div>
                        <ArrowRight size={13} className="text-text-muted group-hover:text-brand-400 transition-colors shrink-0 mt-1" />
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export { TemplatePicker }
