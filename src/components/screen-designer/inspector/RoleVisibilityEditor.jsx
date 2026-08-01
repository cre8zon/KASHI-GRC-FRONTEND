import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, ChevronDown, ChevronRight, LayoutPanelTop, MousePointerClick } from 'lucide-react'
import { cn } from '../../../lib/cn'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { sdApi } from '../sdApi'
import { InspectorSection } from '../shared/InspectorHelpers'
import { SIDES } from '../constants'

/**
 * RoleVisibilityEditor — configures who can see a screen, and (per role) which
 * tabs and action buttons within that screen are visible to them.
 *
 * Persists to ui_layouts.role_access_json with this shape:
 *   {
 *     "ORGANIZATION": true,                                  // legacy whole-side toggle
 *     "33": { "tabs": { "controls": false },                 // role id 33 (LEAD_AUDITOR):
 *              "actions": { "RAISE_FINDING": false } }        //   block controls tab + 1 action
 *   }
 * Anything not listed defaults to allowed — this only needs to record exceptions.
 * Consumed at runtime by UniversalModulePage via src/lib/roleAccessJson.js.
 */
function RoleVisibilityEditor({ screenKey }) {
  const qc = useQueryClient()
  const [access, setAccess] = useState(SIDES.reduce((a, s) => ({ ...a, [s]: true }), {}))
  const [roleAccess, setRoleAccess] = useState({})  // { roleId: bool | {tabs,actions} }
  const [layoutId, setLayoutId] = useState(null)
  const [storedLayout, setStoredLayout] = useState(null)
  const [tab, setTab] = useState('sides')  // 'sides' | 'roles'
  const [expandedRoleId, setExpandedRoleId] = useState(null)

  const { tenantId } = useSelector(state => state.auth || {})

  const { data: layoutData } = useQuery({
    queryKey: ['sd-layout', screenKey],
    queryFn: () => sdApi.getLayout(screenKey),
    staleTime: 30_000,
  })

  const { data: rolesData } = useQuery({
    queryKey: ['sd-roles', tenantId],
    queryFn: () => sdApi.listRoles(tenantId),
    enabled: !!tenantId,
    staleTime: 120_000,
  })
  const allRoles = useMemo(() => {
    // Backend returns { tenant_id, hierarchy: { ORGANIZATION: [...], AUDITOR: [...] } }
    const payload = rolesData?.data?.data || rolesData?.data || rolesData
    const hierarchy = payload?.hierarchy || {}
    const flattened = []
    Object.entries(hierarchy).forEach(([side, rolesForSide]) => {
      (Array.isArray(rolesForSide) ? rolesForSide : []).forEach(r => {
        flattened.push({
          id:    r.role_id ?? r.id,
          name:  r.name,
          side:  side,
          level: r.level && r.level !== 'null' ? r.level : null,
        })
      })
    })
    return flattened
  }, [rolesData])

  // Tabs configured for this screen (from the SAME layout row's tabsJson)
  const screenTabs = useMemo(() => {
    try {
      const parsed = JSON.parse(storedLayout?.tabsJson || 'null')
      if (!Array.isArray(parsed)) return []
      return parsed.map(t => typeof t === 'string'
        ? { key: t.toLowerCase().replace(/\s+/g, '_'), label: t }
        : { key: t.key, label: t.label || t.key })
    } catch { return [] }
  }, [storedLayout?.tabsJson])

  // Action buttons configured for this screen
  const { data: actionsData } = useQuery({
    queryKey: ['sd-actions', screenKey],
    queryFn: () => sdApi.listActions(screenKey),
    staleTime: 60_000,
    enabled: !!screenKey,
  })
  const screenActions = useMemo(() => {
    const raw = actionsData?.data?.data || actionsData?.data || actionsData
    const list = Array.isArray(raw) ? raw : (raw?.items || [])
    const seen = new Set()
    return list.filter(a => {
      if (!a.actionKey || seen.has(a.actionKey)) return false
      seen.add(a.actionKey)
      return true
    })
  }, [actionsData])

  useEffect(() => {
    const items = layoutData?.data?.items || layoutData?.items ||
      (Array.isArray(layoutData?.data) ? layoutData.data : null) || []
    const layout = Array.isArray(items) ? items[0] : items
    if (layout?.id) {
      setLayoutId(layout.id)
      setStoredLayout(layout)
      try {
        const parsed = JSON.parse(layout.roleAccessJson || '{}')
        const sideKeys = {}
        const roleKeys = {}
        Object.entries(parsed).forEach(([k, v]) => {
          if (SIDES.includes(k)) sideKeys[k] = v
          else roleKeys[k] = v
        })
        setAccess(prev => ({ ...prev, ...sideKeys }))
        setRoleAccess(roleKeys)
      } catch {}
    }
  }, [layoutData])

  const saveMut = useMutation({
    mutationFn: () => {
      const combined = { ...access, ...roleAccess }
      return sdApi.saveLayout(layoutId, {
        layoutKey:      screenKey,
        screen:         screenKey,
        columnsJson:    storedLayout?.columnsJson    ?? '[]',
        filtersJson:    storedLayout?.filtersJson    ?? '[]',
        tabsJson:       storedLayout?.tabsJson       ?? null,
        layoutMode:     storedLayout?.layoutMode     ?? 'FULL_PAGE',
        roleAccessJson: JSON.stringify(combined),
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sd-layout', screenKey] }); toast.success('Visibility saved') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed'),
  })

  const sideColor = { ORGANIZATION: 'blue', VENDOR: 'teal', AUDITOR: 'purple', AUDITEE: 'amber', SYSTEM: 'gray' }

  // ── Helpers for reading/writing the per-role { tabs, actions } sub-object ──
  const getRoleEntry = (roleId) => {
    const v = roleAccess[String(roleId)]
    if (v === undefined) return { tabs: {}, actions: {} }
    if (typeof v === 'boolean') return { tabs: {}, actions: {}, wholeScreen: v }
    return { tabs: v.tabs || {}, actions: v.actions || {} }
  }
  const toggleRoleItem = (roleId, scope, itemKey) => {
    setRoleAccess(prev => {
      const key = String(roleId)
      const existing = prev[key]
      const base = (existing && typeof existing === 'object') ? existing : {}
      const scopeMap = { ...(base[scope] || {}) }
      const current = scopeMap[itemKey] !== false // default true
      scopeMap[itemKey] = !current
      return { ...prev, [key]: { ...base, [scope]: scopeMap } }
    })
  }

  return (
    <InspectorSection title="Visibility">
      <div className="flex gap-1 p-0.5 bg-surface-overlay rounded-ctl border border-border mb-3">
        {[['sides', 'Sides'], ['roles', 'Roles']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('flex-1 text-[10px] py-1 rounded transition-colors font-medium',
              tab === k ? 'bg-background text-text-primary border border-border' : 'text-text-muted hover:text-text-secondary')}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'sides' && (
        <div className="space-y-1">
          <p className="text-[9px] text-text-muted mb-2">Which party can access this screen. Coarse-grained — applies to all roles within that side.</p>
          {SIDES.map(s => {
            const allowed = access[s] !== false
            const color = sideColor[s] || 'gray'
            return (
              <div key={s}
                onClick={() => setAccess(prev => ({ ...prev, [s]: !allowed }))}
                className={cn(
                  'flex items-center justify-between px-2.5 py-2 rounded-card border cursor-pointer transition-all text-[10px]',
                  allowed ? 'border-status-pass-bd bg-status-pass-bg' : 'border-border opacity-40 hover:opacity-60'
                )}>
                <div className="flex items-center gap-2">
                  <div className={cn('w-1.5 h-1.5 rounded-full', allowed ? 'bg-status-pass-fg' : 'bg-border')} />
                  <span className={allowed ? 'text-text-primary font-medium' : 'text-text-muted'}>{s}</span>
                  {!allowed && <span className="text-[9px] text-text-muted italic">hidden</span>}
                </div>
                <span className={cn('text-[9px] font-medium', allowed ? 'text-status-pass-fg' : 'text-text-muted')}>
                  {allowed ? 'Allowed' : 'Blocked'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'roles' && (
        <div className="space-y-3">
          <p className="text-[9px] text-text-muted mb-1">
            Fine-grained — restrict specific roles within an allowed side. Click a role to also configure which tabs / action buttons it can see.
          </p>
          {allRoles.length === 0 ? (
            <p className="text-[10px] text-text-muted text-center py-3">No roles found for this tenant</p>
          ) : (
            SIDES.map(side => {
              const sideRoles = allRoles.filter(r => r.side === side)
              if (sideRoles.length === 0) return null
              const sideAllowed = access[side] !== false
              return (
                <div key={side}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] font-semibold text-text-secondary uppercase tracking-wider">{side}</span>
                    {!sideAllowed && (
                      <span className="text-[8px] text-status-warn-fg border border-status-warn-bd bg-status-warn-bg rounded px-1 py-0.5">
                        side blocked — roles ignored
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {sideRoles.map(role => {
                      const rKey = String(role.id)
                      const allowed = rKey in roleAccess
                        ? (typeof roleAccess[rKey] === 'boolean' ? roleAccess[rKey] : true)
                        : true
                      const entry = getRoleEntry(role.id)
                      const tabOverrides    = Object.values(entry.tabs || {}).filter(v => v === false).length
                      const actionOverrides = Object.values(entry.actions || {}).filter(v => v === false).length
                      const hasOverrides = tabOverrides + actionOverrides > 0
                      const isExpanded = expandedRoleId === role.id

                      return (
                        <div key={role.id} className={cn('rounded border', !sideAllowed ? 'opacity-30' : '', isExpanded ? 'border-brand-500/30' : 'border-border')}>
                          <div
                            className={cn(
                              'flex items-center justify-between px-2 py-1.5 text-[10px] transition-all',
                              !sideAllowed ? 'cursor-not-allowed' : allowed ? 'bg-status-pass-bg cursor-pointer hover:bg-status-pass-bg' : 'opacity-50 cursor-pointer hover:opacity-70'
                            )}>
                            <div className="flex items-center gap-1.5 flex-1 min-w-0"
                                 onClick={() => sideAllowed && setExpandedRoleId(isExpanded ? null : role.id)}>
                              {sideAllowed && (isExpanded ? <ChevronDown size={10} className="text-text-muted shrink-0"/> : <ChevronRight size={10} className="text-text-muted shrink-0"/>)}
                              <User size={10} className={allowed && sideAllowed ? 'text-status-pass-fg' : 'text-text-muted'} />
                              <span className={cn('truncate', allowed && sideAllowed ? 'text-text-primary' : 'text-text-muted')}>{role.name}</span>
                              {role.level && <span className="text-[8px] text-text-muted border border-border rounded px-1 shrink-0">{role.level}</span>}
                              {hasOverrides && (
                                <span className="text-[8px] text-brand-ink border border-brand-500/30 bg-brand-500/10 rounded px-1 shrink-0">
                                  {tabOverrides + actionOverrides} override{tabOverrides + actionOverrides !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <span
                              onClick={(e) => { e.stopPropagation(); sideAllowed && setRoleAccess(prev => ({ ...prev, [rKey]: !allowed })) }}
                              className={cn('text-[9px] font-medium shrink-0 px-1.5 py-0.5 rounded', allowed && sideAllowed ? 'text-status-pass-fg hover:bg-status-pass-bg' : 'text-text-muted hover:bg-surface-overlay')}>
                              {allowed ? 'Allowed' : 'Blocked'}
                            </span>
                          </div>

                          {/* Expanded: per-tab and per-action overrides for this role */}
                          {isExpanded && sideAllowed && (
                            <div className="px-2 pb-2 pt-1 border-t border-border/50 space-y-2">
                              {screenTabs.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-1 mb-1">
                                    <LayoutPanelTop size={9} className="text-text-muted"/>
                                    <span className="text-[8px] font-semibold text-text-muted uppercase tracking-wide">Tabs</span>
                                  </div>
                                  <div className="space-y-0.5">
                                    {screenTabs.map(t => {
                                      const tabAllowed = entry.tabs?.[t.key] !== false
                                      return (
                                        <div key={t.key}
                                          onClick={() => toggleRoleItem(role.id, 'tabs', t.key)}
                                          className={cn('flex items-center justify-between px-1.5 py-1 rounded text-[9px] cursor-pointer',
                                            tabAllowed ? 'hover:bg-status-pass-bg text-text-secondary' : 'bg-status-fail-bg text-status-fail-fg hover:bg-status-fail-bg')}>
                                          <span>{t.label}</span>
                                          <span className={tabAllowed ? 'text-status-pass-fg' : 'text-status-fail-fg'}>{tabAllowed ? 'Visible' : 'Hidden'}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                              {screenActions.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-1 mb-1">
                                    <MousePointerClick size={9} className="text-text-muted"/>
                                    <span className="text-[8px] font-semibold text-text-muted uppercase tracking-wide">Action buttons</span>
                                  </div>
                                  <div className="space-y-0.5">
                                    {screenActions.map(a => {
                                      const actionAllowed = entry.actions?.[a.actionKey] !== false
                                      return (
                                        <div key={a.actionKey}
                                          onClick={() => toggleRoleItem(role.id, 'actions', a.actionKey)}
                                          className={cn('flex items-center justify-between px-1.5 py-1 rounded text-[9px] cursor-pointer',
                                            actionAllowed ? 'hover:bg-status-pass-bg text-text-secondary' : 'bg-status-fail-bg text-status-fail-fg hover:bg-status-fail-bg')}>
                                          <span>{a.label || a.actionKey}</span>
                                          <span className={actionAllowed ? 'text-status-pass-fg' : 'text-status-fail-fg'}>{actionAllowed ? 'Visible' : 'Hidden'}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                              {screenTabs.length === 0 && screenActions.length === 0 && (
                                <p className="text-[9px] text-text-muted italic py-1">No tabs or actions configured for this screen yet.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      <button onClick={() => saveMut.mutate()}
        className="mt-3 w-full text-[10px] font-medium text-brand-ink hover:text-brand-ink border border-brand-500/25 hover:border-brand-500/50 bg-brand-500/5 hover:bg-brand-500/8 rounded-ctl py-1.5 transition-colors">
        {saveMut.isPending ? 'Saving…' : 'Save visibility'}
      </button>
    </InspectorSection>
  )
}

export { RoleVisibilityEditor }