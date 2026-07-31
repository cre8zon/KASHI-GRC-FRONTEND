import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Trash2, ToggleLeft, ToggleRight, Zap, Pencil, Users, Globe, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { uiAdminApi } from '../../../api/uiConfig.api'
import { PageLayout }  from '../../../components/layout/PageLayout'
import { Button }      from '../../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Input }       from '../../../components/ui/Input'
import { cn }          from '../../../lib/cn'
import { formatDate }  from '../../../utils/format'
import toast           from 'react-hot-toast'

const SIDES = ['SYSTEM','ORGANIZATION','VENDOR','AUDITOR','AUDITEE']

const useFlags = (params) => useQuery({
  queryKey: ['admin-flags', params],
  queryFn:  () => uiAdminApi.flags.list(params),
  keepPreviousData: true,
})

export default function FeatureFlagsAdminPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data, isLoading, refetch } = useFlags({ skip: 0, take: 100 })

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: uiAdminApi.flags.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-flags'] }); toast.success('Flag created'); setShowCreate(false) },
    onError: (e) => toast.error(e?.message || 'Failed'),
  })
  const { mutate: update } = useMutation({
    mutationFn: ({ id, data }) => uiAdminApi.flags.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-flags'] }),
    onError: (e) => toast.error(e?.message || 'Failed'),
  })
  const { mutate: remove, isPending: deleting } = useMutation({
    mutationFn: (id) => uiAdminApi.flags.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-flags'] }); toast.success('Flag deleted') },
    onError: (e) => toast.error(e?.message || 'Failed'),
  })
  const { mutate: setMode } = useMutation({
    mutationFn: ({ flagKey, body }) => uiAdminApi.flags.setMode(flagKey, body),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['admin-flags'] })
      toast.success(v.body.mode === 'LICENSED'
        ? 'Switched to Licensed — manage per tenant in Tenant Details'
        : 'Switched to Global — on/off for all tenants')
    },
    onError: (e) => toast.error(e?.message || 'Failed'),
  })

  const flags = data?.items || []

  return (
    <PageLayout
      title="Feature Flags"
      subtitle="Toggle features on/off without redeployment"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>New Flag</Button>
        </div>
      }
    >
      <div className="p-6">
        {isLoading && (
          <div className="flex flex-col gap-2">
            {[1,2,3].map(i => <div key={i} className="h-14 rounded-card bg-surface-overlay animate-pulse" />)}
          </div>
        )}

        {!isLoading && flags.length === 0 && (
          <div className="py-12 text-center">
            <Zap size={24} className="text-text-muted mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-text-muted">No feature flags yet.</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {flags.map(flag => {
            const licensed = flag.mode === 'LICENSED'
            return (
            <div key={flag.id}
              className="flex items-center gap-4 px-4 py-3 rounded-card border border-border bg-surface-raised hover:bg-surface-overlay transition-colors">

              {/* Info: name + description (the identity of the flag) */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-mono font-medium text-text-primary">{flag.flagKey}</span>
                {flag.description && (
                  <p className="text-xs text-text-muted mt-0.5 truncate">{flag.description}</p>
                )}
              </div>

              {/* Mode segmented control — the primary decision: how is this
                  feature governed? Global (on/off for all) or Licensed (per tenant). */}
              <div className="flex rounded-ctl border border-border overflow-hidden shrink-0 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => { if (licensed) setMode({ flagKey: flag.flagKey, body: { mode: 'GLOBAL', enabled: false } }) }}
                  title="Global — the same on/off state applies to every tenant."
                  className={cn('flex items-center gap-1 px-2.5 py-1 transition-colors',
                    !licensed ? 'bg-brand-500/15 text-brand-ink' : 'text-text-muted hover:bg-surface-overlay')}>
                  <Globe size={11} /> Global
                </button>
                <button
                  type="button"
                  onClick={() => { if (!licensed) setMode({ flagKey: flag.flagKey, body: { mode: 'LICENSED' } }) }}
                  title="Licensed — entitlement is granted per tenant on the Tenant Details page."
                  className={cn('flex items-center gap-1 px-2.5 py-1 border-l border-border transition-colors',
                    licensed ? 'bg-brand-500/15 text-brand-ink' : 'text-text-muted hover:bg-surface-overlay')}>
                  <Users size={11} /> Licensed
                </button>
              </div>

              {/* Mode-dependent control:
                  GLOBAL   → the on/off toggle IS the entitlement (on/off for all).
                  LICENSED → on/off is meaningless here; point to per-tenant management. */}
              <div className="w-52 flex justify-end shrink-0">
                {!licensed ? (
                  <button
                    onClick={() => update({ id: flag.id, data: { isEnabled: !flag.isEnabled } })}
                    className={cn('flex items-center gap-1.5 transition-colors',
                      flag.isEnabled ? 'text-status-pass-fg' : 'text-text-muted')}
                    title={flag.isEnabled ? 'On for all tenants — click to turn off' : 'Off for all tenants — click to turn on'}>
                    {flag.isEnabled
                      ? <ToggleRight size={22} strokeWidth={1.5} />
                      : <ToggleLeft  size={22} strokeWidth={1.5} />}
                    <span className="text-xs">{flag.isEnabled ? 'On for all' : 'Off for all'}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/tenants')}
                    className="flex items-center gap-1 text-xs text-brand-ink hover:underline"
                    title="Entitlement is managed per tenant. Open Tenant Details to grant or revoke.">
                    <Users size={13} /> Managed per tenant <ArrowRight size={12} />
                  </button>
                )}
              </div>

              {/* Edit */}
              <button onClick={() => setEditTarget(flag)}
                className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-brand-ink hover:bg-brand-500/10 transition-colors shrink-0"
                title="Edit flag">
                <Pencil size={12} />
              </button>

              {/* Delete */}
              <button onClick={() => setDeleteTarget(flag)}
                className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors shrink-0">
                <Trash2 size={12} />
              </button>
            </div>
          )})}
        </div>
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}
        title="New Feature Flag" size="sm"
        footer={null}>
        <FlagForm onSubmit={create} isPending={creating} onClose={() => setShowCreate(false)} />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)}
        title={`Edit Flag — ${editTarget?.flagKey}`} size="sm"
        footer={null}>
        {editTarget && (
          <EditFlagForm
            flag={editTarget}
            onSubmit={(d) => update({ id: editTarget.id, data: d }, { onSuccess: () => setEditTarget(null) })}
            isPending={false}
            onClose={() => setEditTarget(null)} />
        )}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove(deleteTarget?.id, { onSuccess: () => setDeleteTarget(null) })}
        loading={deleting} title="Delete Flag" variant="danger" confirmLabel="Delete"
        message={`Delete flag "${deleteTarget?.flagKey}"? This immediately removes it for all users.`} />
    </PageLayout>
  )
}

function FlagForm({ onSubmit, isPending, onClose }) {
  const [form, setForm] = useState({ flagKey: '', description: '', isEnabled: true, allowedSidesJson: '', scope: 'GLOBAL', targetTenantId: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-4">
      <Input label="Flag Key *" value={form.flagKey}
        onChange={e => set('flagKey', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
        placeholder="new_dashboard_ui"
        helperText="snake_case — cannot change after creation" />
      <Input label="Description" value={form.description}
        onChange={e => set('description', e.target.value)}
        placeholder="Enables the new dashboard redesign" />
      <div>
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">
          Allowed Sides (JSON)
        </label>
        <input value={form.allowedSidesJson}
          onChange={e => set('allowedSidesJson', e.target.value)}
          placeholder='["ORGANIZATION","VENDOR"] — blank = all sides'
          className="h-8 w-full rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
        {/* Quick side shortcuts */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SIDES.map(s => (
            <button key={s} type="button"
              onClick={() => set('allowedSidesJson', `["${s}"]`)}
              className="px-2 py-0.5 rounded border border-border text-[10px] text-text-muted hover:text-brand-ink hover:border-brand-500/40 transition-colors">
              {s}
            </button>
          ))}
          <button type="button" onClick={() => set('allowedSidesJson', '')}
            className="px-2 py-0.5 rounded border border-border text-[10px] text-text-muted hover:text-text-primary transition-colors">
            All
          </button>
        </div>
      </div>
      {/* Scope — same GLOBAL / PLATFORM / TENANT model as the project library.
          TENANT scope is how you license a feature to one organization. */}
      <div>
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">
          Scope
        </label>
        <div className="flex gap-1.5">
          {['GLOBAL','PLATFORM','TENANT'].map(s => (
            <button key={s} type="button" onClick={() => set('scope', s)}
              className={cn('px-3 py-1 rounded-ctl border text-xs font-medium transition-colors',
                form.scope === s ? 'bg-brand-500/15 border-brand-500/40 text-brand-ink'
                                 : 'border-border text-text-muted hover:text-text-primary')}>
              {s === 'GLOBAL' ? 'All tenants' : s === 'PLATFORM' ? 'Platform only' : 'Specific tenant'}
            </button>
          ))}
        </div>
        {form.scope === 'TENANT' && (
          <Input label="Target Tenant ID" type="number" value={form.targetTenantId}
            onChange={e => set('targetTenantId', e.target.value)}
            placeholder="e.g. 4" className="mt-2"
            helperText="The organization this feature is licensed to" />
        )}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => set('isEnabled', !form.isEnabled)} type="button"
          className={cn('flex items-center gap-2 px-3 py-1.5 rounded-ctl border text-xs font-medium transition-colors',
            form.isEnabled ? 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg'
                           : 'bg-surface-overlay border-border text-text-muted')}>
          {form.isEnabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          {form.isEnabled ? 'Start enabled' : 'Start disabled'}
        </button>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending}
          onClick={() => {
            if (!form.flagKey.trim()) { toast.error('Key required'); return }
            if (form.scope === 'TENANT' && !form.targetTenantId) { toast.error('Target tenant required'); return }
            onSubmit({ ...form, targetTenantId: form.targetTenantId ? parseInt(form.targetTenantId) : undefined })
          }}>
          Create Flag
        </Button>
      </div>
    </div>
  )
}

function EditFlagForm({ flag, onSubmit, isPending, onClose }) {
  const [form, setForm] = useState({
    description:     flag.description     || '',
    allowedSidesJson: flag.allowedSidesJson || '',
    isEnabled:       flag.isEnabled,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-4">
      {/* Read-only key display */}
      <div className="p-2 rounded-ctl bg-surface-overlay border border-border">
        <p className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Flag Key (immutable)</p>
        <p className="text-sm font-mono text-brand-ink">{flag.flagKey}</p>
      </div>

      <Input label="Description" value={form.description}
        onChange={e => set('description', e.target.value)}
        placeholder="Enables the new dashboard redesign" />

      <div>
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-1">
          Allowed Sides (JSON)
        </label>
        <input value={form.allowedSidesJson}
          onChange={e => set('allowedSidesJson', e.target.value)}
          placeholder='["ORGANIZATION","VENDOR"] — blank = all sides'
          className="h-8 w-full rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SIDES.map(s => (
            <button key={s} type="button"
              onClick={() => set('allowedSidesJson', `["${s}"]`)}
              className="px-2 py-0.5 rounded border border-border text-[10px] text-text-muted hover:text-brand-ink hover:border-brand-500/40 transition-colors">
              {s}
            </button>
          ))}
          <button type="button" onClick={() => set('allowedSidesJson', '')}
            className="px-2 py-0.5 rounded border border-border text-[10px] text-text-muted hover:text-text-primary transition-colors">
            All
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => set('isEnabled', !form.isEnabled)}
          className={cn('flex items-center gap-2 px-3 py-1.5 rounded-ctl border text-xs font-medium transition-colors',
            form.isEnabled
              ? 'bg-status-pass-bg border-status-pass-bd text-status-pass-fg'
              : 'bg-surface-overlay border-border text-text-muted')}>
          {form.isEnabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          {form.isEnabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending} onClick={() => onSubmit(form)}>
          Save Changes
        </Button>
      </div>
    </div>
  )
}