/**
 * Tenant Detail → Features. Moved unchanged from the old TenantDetailPage's
 * TenantFeaturesCard; only the wrapper changed.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody } from '../ui/Card'
import { tenantsApi } from '../../api/tenants.api'

// ─── Feature Entitlements ─────────────────────────────────────────────────────
// Model B: a tenant HAS a feature iff an explicit enabled row exists. The
// catalogue (global rows) defines what's licensable; toggling here writes the
// tenant-scoped row. This is the one place to see and manage what a tenant owns.

export default function TenantFeaturesTab({ tenantId }) {
  const qc = useQueryClient()

  const { data: features, isLoading } = useQuery({
    queryKey: ['tenant-features', tenantId],
    queryFn:  () => tenantsApi.getFeatures(tenantId),
    enabled:  !!tenantId,
  })

  const { mutate: toggle, isPending } = useMutation({
    mutationFn: ({ flagKey, enabled }) => tenantsApi.setFeature(tenantId, flagKey, enabled),
    onMutate: async ({ flagKey, enabled }) => {
      await qc.cancelQueries({ queryKey: ['tenant-features', tenantId] })
      const prev = qc.getQueryData(['tenant-features', tenantId])
      qc.setQueryData(['tenant-features', tenantId], (old) =>
        (old || []).map(f => f.flagKey === flagKey ? { ...f, enabled } : f))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(['tenant-features', tenantId], ctx?.prev)
      toast.error('Could not update feature')
    },
    onSuccess: ({ flagKey, enabled }) =>
      toast.success(`${flagKey} ${enabled ? 'enabled' : 'disabled'} for this tenant`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['tenant-features', tenantId] }),
  })

  const list = Array.isArray(features) ? features : []
  const activeCount = list.filter(f => f.enabled).length

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles size={15} className="text-brand-ink" />
            Features & Entitlements
            <span className="text-xs font-normal text-text-muted">
              {activeCount} of {list.length} active
            </span>
          </span>
        }
      />
      <CardBody>
        {isLoading ? (
          <p className="text-sm text-text-muted py-4">Loading features…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-text-muted py-4">
            No features in the catalogue. Define them on the Feature Flags page first.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {list.map(f => {
              // Only LICENSED features are per-tenant togglable. GLOBAL features
              // are on/off for everyone (managed on the Feature Flags page) and
              // shown here read-only for visibility.
              const togglable = f.togglable !== false && f.mode === 'LICENSED'
              return (
              <button
                key={f.flagKey}
                type="button"
                disabled={isPending || !togglable}
                onClick={() => togglable && toggle({ flagKey: f.flagKey, enabled: !f.enabled })}
                title={togglable
                  ? undefined
                  : 'Global feature — on/off for all tenants. Change on the Feature Flags page, or switch it to Licensed to manage per tenant.'}
                className={
                  'flex items-center justify-between gap-3 px-3 py-2.5 rounded-ctl border text-left transition-colors ' +
                  (!togglable ? 'opacity-70 cursor-default ' : '') +
                  (f.enabled
                    ? 'border-status-pass-bd bg-status-pass-bg/40'
                    : 'border-border ' + (togglable ? 'hover:bg-surface-overlay/60' : ''))
                }
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-mono text-text-primary truncate">{f.flagKey}</span>
                    <span className={
                      'text-[9px] font-medium px-1 py-0.5 rounded shrink-0 ' +
                      (f.mode === 'LICENSED'
                        ? 'bg-brand-500/12 text-brand-ink'
                        : 'bg-surface-overlay text-text-muted')
                    }>
                      {f.mode === 'LICENSED' ? 'LICENSED' : 'GLOBAL'}
                    </span>
                  </span>
                  {f.description && (
                    <span className="block text-[11px] text-text-muted truncate">{f.description}</span>
                  )}
                </span>
                {f.enabled
                  ? <ToggleRight size={22} className={(togglable ? 'text-status-pass-fg' : 'text-text-muted') + ' shrink-0'} />
                  : <ToggleLeft  size={22} className="text-text-muted shrink-0" />}
              </button>
            )})}
          </div>
        )}
      </CardBody>
    </Card>
  )
}