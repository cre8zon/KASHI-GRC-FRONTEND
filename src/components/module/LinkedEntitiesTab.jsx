/**
 * LinkedEntitiesTab — one component for every related-records tab.
 *
 * WHY THIS EXISTS INSTEAD OF ANOTHER BESPOKE TAB
 *   RiskControlsTab and RiskIssuesTab each needed their own branch in
 *   CustomTabContent. Two modules in, that pattern was already producing one
 *   component and one branch per relationship, and every future module would
 *   add more of both.
 *
 *   This is driven by the tab KEY instead. Any tabs_json key of the form
 *   `linked-<suffix>` is routed here by a single branch, and the endpoint is
 *   derived: {apiBasePath}/{id}/linked-<suffix>. Adding "Linked assets" to a
 *   module is then a seed row plus a backend endpoint — no frontend change at
 *   all.
 *
 * THE CONTRACT THE ENDPOINT MUST MEET
 *   Return a plain array. Each item may carry:
 *     id             required — the linked record's own id
 *     ref            optional — short reference shown in mono ("RSK-2026-0007")
 *     title          optional — the human label
 *     status         optional — rendered as a badge
 *     badge          optional — a second badge ("Score 12", "Effective")
 *     linkNote       optional — one line under the title
 *     navEntityType  optional — module route segment to open on click
 *                               ("risk" -> /module/risk/{id}). Omit to make
 *                               the row non-navigable rather than to guess.
 *
 *   Anything absent is simply not rendered. A field that does not exist is
 *   never an error here, because the whole point is that the tab does not know
 *   what it is showing.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Link2, RefreshCw, ChevronRight } from 'lucide-react'
import api from '../../config/axios.config'

/** "linked-risks" -> "Linked risks", used only when tabs_json has no label. */
function humanise(tabKey) {
  const s = String(tabKey || '').replace(/[-_]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function LinkedEntitiesTab({ apiBasePath, entity, tabKey, label }) {
  const navigate = useNavigate()
  const entityId = entity?.id

  // {apiBasePath}/{id}/{tabKey} — the tab key IS the path segment, which is
  // what makes this generic. The seed decides both.
  const path = apiBasePath && entityId
    ? `${apiBasePath}/${entityId}/${tabKey}`
    : null

  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['linked-entities', apiBasePath, entityId, tabKey],
    queryFn: () => api.get(path),
    enabled: !!path,
  })

  const items = useMemo(() => (Array.isArray(res) ? res : res?.items || []), [res])
  const heading = label || humanise(tabKey)

  if (isLoading) return (
    <div className="py-8 flex items-center justify-center">
      <RefreshCw size={16} className="animate-spin text-text-muted" />
    </div>
  )

  // An endpoint that does not exist yet is a configuration state, not a crash.
  // Saying so beats an empty panel that looks like "there are none".
  if (isError) return (
    <div className="py-12 text-center">
      <Link2 size={18} className="mx-auto text-text-muted opacity-50" />
      <p className="text-sm text-text-muted mt-2">{heading} could not be loaded.</p>
      <p className="text-xs text-text-muted mt-1 opacity-60">
        This tab expects <span className="font-mono">{path || '—'}</span>.
      </p>
    </div>
  )

  if (items.length === 0) return (
    <div className="py-12 text-center">
      <Link2 size={18} className="mx-auto text-text-muted opacity-50" />
      <p className="text-sm text-text-muted mt-2">Nothing linked yet.</p>
      <p className="text-xs text-text-muted mt-1 opacity-60">
        {heading.toLowerCase()} you link will appear here.
      </p>
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      {items.map(item => {
        const canOpen = !!item.navEntityType && !!item.id
        const Row = canOpen ? 'button' : 'div'
        return (
          <Row
            key={item.linkId || item.id}
            {...(canOpen ? {
              onClick: () => navigate(`/module/${item.navEntityType}/${item.id}`),
            } : {})}
            className={`text-left flex items-center gap-3 p-3 rounded-card border border-border
                        bg-surface-secondary transition-colors
                        ${canOpen ? 'hover:border-border-strong' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {item.ref && (
                  <span className="text-[10px] font-mono text-text-muted">{item.ref}</span>
                )}
                <span className="text-xs font-medium text-text-primary truncate">
                  {item.title || item.name || `#${item.id}`}
                </span>
                {item.status && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-ink">
                    {item.status}
                  </span>
                )}
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted">
                    {item.badge}
                  </span>
                )}
              </div>
              {item.linkNote && (
                <p className="text-xs text-text-muted mt-1">{item.linkNote}</p>
              )}
            </div>
            {canOpen && <ChevronRight size={13} className="text-text-muted shrink-0" />}
          </Row>
        )
      })}
    </div>
  )
}

export default LinkedEntitiesTab
