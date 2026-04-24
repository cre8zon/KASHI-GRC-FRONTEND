import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Trash2, ToggleLeft, ToggleRight, Zap } from 'lucide-react'
import { uiAdminApi } from '../../../api/uiConfig.api'
import { PageLayout }  from '../../../components/layout/PageLayout'
import { Button }      from '../../../components/ui/Button'
import { Badge }       from '../../../components/ui/Badge'
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
  const [deleteTarget, setDeleteTarget] = useState(null)
  const qc = useQueryClient()

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
            {[1,2,3].map(i => <div key={i} className="h-14 rounded-lg bg-surface-overlay animate-pulse" />)}
          </div>
        )}

        {!isLoading && flags.length === 0 && (
          <div className="py-12 text-center">
            <Zap size={24} className="text-text-muted mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-text-muted">No feature flags yet.</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {flags.map(flag => (
            <div key={flag.id}
              className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border bg-surface-raised hover:bg-surface-overlay transition-colors">
              {/* Toggle */}
              <button
                onClick={() => update({ id: flag.id, data: { isEnabled: !flag.isEnabled } })}
                className={cn('flex items-center gap-1.5 shrink-0 transition-colors',
                  flag.isEnabled ? 'text-green-400' : 'text-text-muted')}>
                {flag.isEnabled
                  ? <ToggleRight size={22} strokeWidth={1.5} />
                  : <ToggleLeft  size={22} strokeWidth={1.5} />}
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-medium text-text-primary">{flag.flagKey}</span>
                  <Badge
                    value={flag.isEnabled ? 'ON' : 'OFF'}
                    label={flag.isEnabled ? 'Enabled' : 'Disabled'}
                    colorTag={flag.isEnabled ? 'green' : 'gray'} />
                </div>
                {flag.description && (
                  <p className="text-xs text-text-muted mt-0.5 truncate">{flag.description}</p>
                )}
              </div>

              {/* Delete */}
              <button onClick={() => setDeleteTarget(flag)}
                className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}
        title="New Feature Flag" size="sm"
        footer={null}>
        <FlagForm onSubmit={create} isPending={creating} onClose={() => setShowCreate(false)} />
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove(deleteTarget?.id, { onSuccess: () => setDeleteTarget(null) })}
        loading={deleting} title="Delete Flag" variant="danger" confirmLabel="Delete"
        message={`Delete flag "${deleteTarget?.flagKey}"? This immediately removes it for all users.`} />
    </PageLayout>
  )
}

function FlagForm({ onSubmit, isPending, onClose }) {
  const [form, setForm] = useState({ flagKey: '', description: '', isEnabled: true, allowedSidesJson: '' })
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
          className="h-8 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
        {/* Quick side shortcuts */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SIDES.map(s => (
            <button key={s} type="button"
              onClick={() => set('allowedSidesJson', `["${s}"]`)}
              className="px-2 py-0.5 rounded border border-border text-[10px] text-text-muted hover:text-brand-400 hover:border-brand-500/40 transition-colors">
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
        <button onClick={() => set('isEnabled', !form.isEnabled)} type="button"
          className={cn('flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors',
            form.isEnabled ? 'bg-green-500/10 border-green-500/30 text-green-400'
                           : 'bg-surface-overlay border-border text-text-muted')}>
          {form.isEnabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          {form.isEnabled ? 'Start enabled' : 'Start disabled'}
        </button>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" loading={isPending}
          onClick={() => { if (!form.flagKey.trim()) { toast.error('Key required'); return } onSubmit(form) }}>
          Create Flag
        </Button>
      </div>
    </div>
  )
}
