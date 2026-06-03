import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, ArrowRight, Square } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { SCREEN_TYPES, SCREEN_TEMPLATES } from '../constants'

function TemplateGallery({ onSelect, onBlank }) {
  const groups = [...new Set(Object.values(SCREEN_TEMPLATES).map(t => t.group))]

  return (
    <div className="flex-1 overflow-auto p-6" style={{ background: "var(--color-background-tertiary)" }}>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <p className="text-base font-semibold text-text-primary mb-1">Choose a template to start</p>
          <p className="text-xs text-text-muted">
            Each template pre-populates the screen keys and default actions for a GRC module.
            All configuration is editable after selection — templates are just a starting point.
          </p>
        </div>

        {/* Screen type legend */}
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.values(SCREEN_TYPES).map(t => {
            const Icon = t.icon
            return (
              <div key={t.key} className={cn('flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-medium', t.color)}>
                <Icon size={10} />
                <span>{t.label}</span>
                <code className="opacity-60 text-[9px]">{t.fieldName.split('/')[0]}</code>
              </div>
            )
          })}
        </div>

        {/* Templates grouped by module */}
        {groups.map(group => (
          <div key={group} className="mb-6">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-2">
              {group}
              <span className="h-px flex-1 bg-border/50" />
            </p>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {Object.entries(SCREEN_TEMPLATES)
                .filter(([, t]) => t.group === group)
                .map(([key, tmpl]) => {
                  const st = SCREEN_TYPES[tmpl.screenType]
                  const Icon = st?.icon || Square
                  return (
                    <button key={key}
                      onClick={() => onSelect(tmpl)}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-brand-500/50 bg-background hover:bg-brand-500/5 text-left transition-all group shadow-sm">
                      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border', st?.color)}>
                        <Icon size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-text-primary">{tmpl.label}</span>
                          <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-medium', st?.color)}>
                            {st?.label}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-muted leading-relaxed mb-2">{tmpl.desc}</p>
                        {/* Key pills */}
                        <div className="flex flex-wrap gap-1">
                          {tmpl.itemKey && (
                            <code className="text-[9px] bg-teal-500/10 border border-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded">
                              item: {tmpl.itemKey}
                            </code>
                          )}
                          {tmpl.sectionKey && (
                            <code className="text-[9px] bg-purple-500/10 border border-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
                              section: {tmpl.sectionKey}
                            </code>
                          )}
                          {tmpl.formKey && (
                            <code className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
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

        {/* Blank screen option */}
        <div className="mt-2 pt-4 border-t border-border/50">
          <button onClick={onBlank}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border hover:border-brand-500/40 hover:text-brand-400 text-text-muted text-[11px] transition-colors">
            <Plus size={13} /> Start with a blank screen
          </button>
        </div>
      </div>
    </div>
  )
}


export { TemplateGallery }
