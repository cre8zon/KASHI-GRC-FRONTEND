import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Layers } from 'lucide-react'
import { SCREEN_TYPES } from './constants'

function Navigator({ screens, selectedKey, search, setSearch, typeFilter, setTypeFilter, onSelect, onNew, onOpenTemplates }) {
  return (
    <div className="w-56 shrink-0 border-r border-border flex flex-col overflow-hidden bg-surface">
      {/* Type filter pills */}
      <div className="p-2 border-b border-border">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setTypeFilter(null)}
            className={cn('px-2 py-0.5 rounded text-[9px] font-medium border transition-colors',
              !typeFilter ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-border text-text-muted hover:border-border-strong')}>
            All
          </button>
          {Object.values(SCREEN_TYPES).map(t => (
            <button key={t.key}
              onClick={() => setTypeFilter(f => f === t.key ? null : t.key)}
              className={cn('px-2 py-0.5 rounded text-[9px] font-medium border transition-colors', t.color,
                typeFilter === t.key ? 'opacity-100' : 'opacity-50 hover:opacity-75')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-2 border-b border-border">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search keys…"
            className="w-full pl-6 pr-2 h-6 text-[10px] bg-surface-overlay border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>

      {/* Screen list grouped by type */}
      <div className="flex-1 overflow-y-auto">
        {Object.values(SCREEN_TYPES).map(type => {
          const typeScreens = screens.filter(s => s.type === type.key)
          if (typeFilter && typeFilter !== type.key) return null
          if (typeScreens.length === 0 && typeFilter !== type.key) return null
          const Icon = type.icon
          return (
            <div key={type.key}>
              <div className="flex items-center gap-1.5 px-3 py-1.5 sticky top-0 bg-surface border-b border-border/50">
                <Icon size={10} className={type.color.split(' ')[0]} />
                <span className="text-[9px] font-semibold text-text-muted uppercase tracking-wide">{type.label}</span>
                <span className="ml-auto text-[9px] text-text-muted">{typeScreens.length}</span>
              </div>
              {typeScreens.map(screen => (
                <button key={screen.key}
                  onClick={() => onSelect(screen)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-left border-l-2 transition-colors text-[10px]',
                    selectedKey === screen.key
                      ? 'bg-brand-500/8 border-l-brand-500 text-brand-400'
                      : 'border-l-transparent hover:bg-surface-overlay text-text-secondary hover:text-text-primary'
                  )}>
                  <code className="font-mono truncate">{screen.key}</code>
                </button>
              ))}
              {typeScreens.length === 0 && (
                <button onClick={onNew}
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] text-text-muted hover:text-brand-400 transition-colors">
                  <Plus size={10} /> Add first {type.label.toLowerCase()}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="p-2 border-t border-border space-y-1">
        <button onClick={onOpenTemplates}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-brand-400 hover:text-brand-300 bg-brand-500/8 hover:bg-brand-500/12 border border-brand-500/20 hover:border-brand-500/40 rounded transition-colors font-medium">
          <Layers size={10} /> Templates
        </button>
        <button onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-text-muted hover:text-brand-400 border border-dashed border-border hover:border-brand-500/40 rounded transition-colors">
          <Plus size={10} /> Blank screen
        </button>
      </div>
    </div>
  )
}


export { Navigator }
