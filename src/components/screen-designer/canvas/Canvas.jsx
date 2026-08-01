import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, Info } from 'lucide-react'
import { cn } from '../../../lib/cn'
import toast from 'react-hot-toast'
import { sdApi } from '../sdApi'
import { SCREEN_TYPES } from '../constants'
import { SectionCanvas }  from './SectionCanvas'
import { ItemCardCanvas } from './ItemCardCanvas'
import { ListCanvas }     from './ListCanvas'
import { DetailCanvas }   from './DetailCanvas'
import { FormCanvas }     from './FormCanvas'
import { PageCanvas }     from './PageCanvas'

function Canvas({ screen, screenType, selectedElement, onSelectElement, roleProfile }) {
  const { data: actionsData } = useQuery({ queryKey: ['sd-actions', screen.key], queryFn: () => sdApi.listActions(screen.key), staleTime: 30_000 })
  const { data: layoutData }  = useQuery({ queryKey: ['sd-layout', screen.key],  queryFn: () => sdApi.getLayout(screen.key),  staleTime: 30_000 })
  const actions = actionsData?.data?.items || actionsData?.items || (Array.isArray(actionsData?.data) ? actionsData.data : null) || []
  const layoutItems = layoutData?.data?.items || layoutData?.items || (Array.isArray(layoutData?.data) ? layoutData.data : null) || []
  const layout = Array.isArray(layoutItems) ? layoutItems[0] : layoutItems

  const canvasProps = { screen, screenType, selectedElement, onSelectElement, actions, layout }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Canvas header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-ctl border text-[10px] font-medium', screenType?.color)}>
            {screenType && <screenType.icon size={11} />}
            {screenType?.label}
          </div>
          <code className="text-xs font-mono text-text-secondary">{screen.key}</code>
          <button onClick={() => { navigator.clipboard.writeText(screen.key); toast.success('Copied') }}
            className="p-1 text-text-muted hover:text-text-primary transition-colors">
            <Copy size={11} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-text-muted">{screenType?.fieldName}</span>
          <a href={`/v1/ui-config/screen/${screen.key}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-brand-ink transition-colors">
            <ExternalLink size={11} /> Preview JSON
          </a>
        </div>
      </div>

      {/* Canvas info bar */}
      <div className="px-4 py-1.5 bg-brand-500/5 border-b border-brand-500/15 text-[10px] text-brand-600 flex items-center gap-2 shrink-0 font-medium">
        <Info size={10} />
        Click any element below to configure it in the Inspector →
        <span className="ml-auto font-mono">{screenType?.hint}</span>
      </div>

      {/* Canvas content — light mockup surface */}
      <div className="flex-1 overflow-auto p-8" style={{ background: "var(--color-background-tertiary)" }}>
        <div className="max-w-2xl mx-auto">
          {screen.type === 'SECTION'   && <SectionCanvas   {...canvasProps} />}
          {screen.type === 'ITEM_CARD' && <ItemCardCanvas  {...canvasProps} />}
          {screen.type === 'LIST'      && <ListCanvas      {...canvasProps} />}
          {screen.type === 'DETAIL'    && <DetailCanvas    {...canvasProps} />}
          {screen.type === 'FORM'      && <FormCanvas      {...canvasProps} />}
          {screen.type === 'PAGE'      && <PageCanvas      {...canvasProps} />}
        </div>
      </div>
    </div>
  )
}


export { Canvas }
