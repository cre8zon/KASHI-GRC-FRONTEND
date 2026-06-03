import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User } from 'lucide-react'
import { cn } from '../../../lib/cn'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { sdApi } from '../sdApi'
import { InspectorSection } from '../shared/InspectorHelpers'
import { SIDES } from '../constants'

function RoleVisibilityEditor({ screenKey }) {
  const qc = useQueryClient()
  const [access, setAccess] = useState(SIDES.reduce((a, s) => ({ ...a, [s]: true }), {}))
  const [roleAccess, setRoleAccess] = useState({})  // { roleId: bool }
  const [layoutId, setLayoutId] = useState(null)
  const [storedLayout, setStoredLayout] = useState(null)  // FIX: preserve full layout for safe saves
  const [tab, setTab] = useState('sides')  // 'sides' | 'roles'

  // Read auth to get tenantId for roles fetch
  const { tenantId } = useSelector(state => state.auth || {})

  const { data: layoutData } = useQuery({
    queryKey: ['sd-layout', screenKey],
    queryFn: () => sdApi.getLayout(screenKey),
    staleTime: 30_000,
  })

  // Load roles grouped by side
  const { data: rolesData } = useQuery({
    queryKey: ['sd-roles', tenantId],
    queryFn: () => sdApi.listRoles(tenantId),
    enabled: !!tenantId,
    staleTime: 120_000,
  })
  const allRoles = useMemo(() => {
    const raw = rolesData?.data || rolesData || []
    return Array.isArray(raw) ? raw : []
  }, [rolesData])

  useEffect(() => {
    const items = layoutData?.data?.items || layoutData?.items ||
      (Array.isArray(layoutData?.data) ? layoutData.data : null) || []
    const layout = Array.isArray(items) ? items[0] : items
    if (layout?.id) {
      setLayoutId(layout.id)
      setStoredLayout(layout)  // FIX: remember full layout so save can preserve columnsJson etc.
      try {
        const parsed = JSON.parse(layout.roleAccessJson || '{}')
        // Separate side keys (ORGANIZATION, VENDOR etc.) from role keys (numeric IDs)
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
      // FIX: preserve ALL existing layout fields — previously columnsJson: '[]' wiped every column
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

  return (
    <InspectorSection title="Visibility">
      {/* Tab switcher */}
      <div className="flex gap-1 p-0.5 bg-surface-overlay rounded-md border border-border mb-3">
        {[['sides', 'Sides'], ['roles', 'Roles']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('flex-1 text-[10px] py-1 rounded transition-colors font-medium',
              tab === k ? 'bg-background text-text-primary border border-border' : 'text-text-muted hover:text-text-secondary')}>
            {l}
          </button>
        ))}
      </div>

      {/* Sides tab */}
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
                  'flex items-center justify-between px-2.5 py-2 rounded-lg border cursor-pointer transition-all text-[10px]',
                  allowed
                    ? 'border-green-500/25 bg-green-500/5'
                    : 'border-border opacity-40 hover:opacity-60'
                )}>
                <div className="flex items-center gap-2">
                  <div className={cn('w-1.5 h-1.5 rounded-full', allowed ? 'bg-green-400' : 'bg-border')} />
                  <span className={allowed ? 'text-text-primary font-medium' : 'text-text-muted'}>{s}</span>
                  {!allowed && <span className="text-[9px] text-text-muted italic">hidden</span>}
                </div>
                <span className={cn('text-[9px] font-medium', allowed ? 'text-green-400' : 'text-text-muted')}>
                  {allowed ? 'Allowed' : 'Blocked'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Roles tab */}
      {tab === 'roles' && (
        <div className="space-y-3">
          <p className="text-[9px] text-text-muted mb-1">Fine-grained — restrict specific roles within an allowed side. A side must be allowed above for its roles to matter.</p>
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
                      <span className="text-[8px] text-amber-400 border border-amber-500/30 bg-amber-500/10 rounded px-1 py-0.5">
                        side blocked — roles ignored
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {sideRoles.map(role => {
                      const rKey = String(role.id)
                      // If no explicit role entry, default to side's setting
                      const allowed = rKey in roleAccess ? roleAccess[rKey] !== false : true
                      return (
                        <div key={role.id}
                          onClick={() => !(!sideAllowed) && setRoleAccess(prev => ({ ...prev, [rKey]: !allowed }))}
                          className={cn(
                            'flex items-center justify-between px-2 py-1.5 rounded border text-[10px] transition-all',
                            !sideAllowed
                              ? 'border-border opacity-30 cursor-not-allowed'
                              : allowed
                                ? 'border-green-500/20 bg-green-500/5 cursor-pointer hover:bg-green-500/8'
                                : 'border-border opacity-50 cursor-pointer hover:opacity-70'
                          )}>
                          <div className="flex items-center gap-2">
                            <User size={10} className={allowed && sideAllowed ? 'text-green-400' : 'text-text-muted'} />
                            <span className={allowed && sideAllowed ? 'text-text-primary' : 'text-text-muted'}>
                              {role.name}
                            </span>
                            {role.level && (
                              <span className="text-[8px] text-text-muted border border-border rounded px-1">{role.level}</span>
                            )}
                          </div>
                          <span className={cn('text-[9px]', allowed && sideAllowed ? 'text-green-400' : 'text-text-muted')}>
                            {allowed ? 'Allowed' : 'Blocked'}
                          </span>
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
        className="mt-3 w-full text-[10px] font-medium text-brand-400 hover:text-brand-300 border border-brand-500/25 hover:border-brand-500/50 bg-brand-500/5 hover:bg-brand-500/8 rounded-md py-1.5 transition-colors">
        {saveMut.isPending ? 'Saving…' : 'Save visibility'}
      </button>
    </InspectorSection>
  )
}


export { RoleVisibilityEditor }
