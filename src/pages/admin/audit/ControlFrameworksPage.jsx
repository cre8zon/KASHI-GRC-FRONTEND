/**
 * ControlFrameworksPage — /admin/controls/frameworks
 *
 * Manage the catalogue of compliance frameworks (ISO 27001, SOC 2, NIST CSF, etc.)
 * that controls and sections reference via their frameworkRef field.
 *
 * This is NOT a tab inside AuditLibraryPage — frameworks are a distinct entity
 * (a lookup/reference table), not a sub-set of controls or templates.
 *
 * FEATURES:
 *   - List all frameworks with code, name, version, status (ACTIVE / DEPRECATED)
 *   - Create / edit / archive frameworks
 *   - Shows control count per framework (how many controls reference it)
 *   - Search by name or code
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, RefreshCw, Pencil, Trash2, Globe, Archive } from 'lucide-react'
import { auditApi }    from '../../../api/audit.api'
import { PageLayout }  from '../../../components/layout/PageLayout'
import { DataTable }   from '../../../components/ui/DataTable'
import { Button }      from '../../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Badge }       from '../../../components/ui/Badge'
import toast           from 'react-hot-toast'

// ─── API hooks ────────────────────────────────────────────────────────────────

const useFrameworks = (params) => useQuery({
  queryKey: ['audit-control-frameworks', params],
  queryFn:  () => auditApi.library.frameworks?.list(params) ?? Promise.resolve([]),
  keepPreviousData: true,
})

// ─── Mutations ────────────────────────────────────────────────────────────────

function useFrameworkMutations() {
  const qc  = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ['audit-control-frameworks'] })
    return {
      create:  useMutation({ mutationFn: auditApi.library.frameworks?.create  ?? (() => Promise.reject('Not implemented')), onSuccess: () => { inv(); toast.success('Framework added')   }, onError: () => toast.error('Not implemented yet') }),
      update:  useMutation({ mutationFn: auditApi.library.frameworks?.update  ?? (() => Promise.reject('Not implemented')), onSuccess: () => { inv(); toast.success('Framework updated') }, onError: () => toast.error('Not implemented yet') }),
      del:     useMutation({ mutationFn: auditApi.library.frameworks?.delete  ?? (() => Promise.reject('Not implemented')), onError: () => toast.error('Not implemented yet') }),
      archive: useMutation({ mutationFn: auditApi.library.frameworks?.archive ?? (() => Promise.reject('Not implemented')), onError: () => toast.error('Not implemented yet') }),
    }
}

// ─── Framework form ───────────────────────────────────────────────────────────

function FrameworkForm({ initial, onSubmit, loading }) {
  const [form, setForm] = useState({
    name: '', code: '', version: '', description: '', websiteUrl: '',
    ...(initial ?? {}),
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Framework name *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="e.g. ISO 27001"
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Short code *</label>
          <input value={form.code} onChange={e => set('code', e.target.value.toUpperCase())}
            placeholder="e.g. ISO27001, SOC2, NIST-CSF"
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
          <p className="text-[10px] text-text-muted mt-1">
            Must match the frameworkRef used in controls and sections.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">Version</label>
          <input value={form.version} onChange={e => set('version', e.target.value)}
            placeholder="e.g. 2022, Rev 5, 2.0"
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Website / reference URL</label>
          <input value={form.websiteUrl} onChange={e => set('websiteUrl', e.target.value)}
            placeholder="https://…"
            className="w-full h-9 px-3 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1">Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
          placeholder="Briefly describe what this framework covers and who it applies to"
          className="w-full px-3 py-2 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <Button variant="primary" onClick={() => onSubmit(form)} loading={loading}
        disabled={!form.name.trim() || !form.code.trim()}>
        {initial ? 'Update framework' : 'Add framework'}
      </Button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ControlFrameworksPage() {
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(1)
  const [showCreate, setShowCreate]   = useState(false)
  const [editItem, setEditItem]       = useState(null)
  const [deleteItem, setDeleteItem]   = useState(null)

  const FM = useFrameworkMutations()

  const params = {
    skip: (page - 1) * 50,
    take: 50,
    ...(search ? { search: `name=${search}` } : {}),
  }

  const { data, isLoading, refetch } = useFrameworks(params)
  const items = (data?.items ?? data ?? []).map(r => ({ ...r, id: r.id }))

  const columns = [
    { key: 'id',           label: 'ID',         sortable: true,  width: 60,  type: 'mono' },
    { key: 'code',         label: 'Code',        sortable: true,  width: 130, type: 'mono' },
    { key: 'name',         label: 'Framework',   sortable: true,  width: 220 },
    { key: 'version',      label: 'Version',     sortable: false, width: 80,  type: 'mono' },
    { key: 'controlCount', label: 'Controls',    sortable: true,  width: 80,  type: 'custom',
      render: (row) => (
        <span className="text-xs font-mono text-text-secondary">{row.controlCount ?? 0}</span>
      ),
    },
    { key: 'status',       label: 'Status',      sortable: true,  width: 100, type: 'custom',
      render: (row) => (
        <Badge colorTag={row.status === 'ACTIVE' ? 'teal' : 'gray'} size="sm">
          {row.status}
        </Badge>
      ),
    },
    { key: 'websiteUrl',   label: 'Reference',   sortable: false, width: 80,  type: 'custom',
      render: (row) => row.websiteUrl
        ? <a href={row.websiteUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-brand-400 hover:underline" onClick={e => e.stopPropagation()}>
            Link
          </a>
        : <span className="text-xs text-text-muted">—</span>,
    },
    { key: '__actions',    label: '',             width: 88,       type: 'custom',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => setEditItem(row)} title="Edit"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            <Pencil size={12} />
          </button>
          {row.status === 'ACTIVE' && (
            <button onClick={() => FM.archive.mutate(row.id)} title="Archive"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-warn-fg hover:bg-status-warn-bg transition-colors">
              <Archive size={12} />
            </button>
          )}
          <button onClick={() => setDeleteItem(row)} title="Delete"
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-status-fail-fg hover:bg-status-fail-bg transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <PageLayout
      title="Control frameworks"
      subtitle="Manage compliance frameworks referenced by controls and sections"
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search frameworks…"
              className="h-8 pl-8 pr-3 w-52 rounded-ctl border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>
            Add framework
          </Button>
        </div>
      }
    >
      <DataTable
        columns={columns}
        data={items}
        pagination={data?.pagination}
        onPageChange={setPage}
        loading={isLoading}
        emptyMessage="No frameworks yet. Add ISO 27001, SOC 2, NIST CSF, or any standard your controls reference."
      />

      {/* Create / edit modal */}
      <Modal open={showCreate || !!editItem}
        onClose={() => { setShowCreate(false); setEditItem(null) }}
        title={editItem ? 'Edit framework' : 'Add framework'}>
        <FrameworkForm
          initial={editItem}
          loading={FM.create.isPending || FM.update.isPending}
          onSubmit={(form) => {
            if (editItem) {
              FM.update.mutate({ id: editItem.id, data: form }, {
                onSuccess: () => setEditItem(null),
              })
            } else {
              FM.create.mutate(form, {
                onSuccess: () => setShowCreate(false),
              })
            }
          }}
        />
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteItem}
        title="Delete framework"
        description={`Delete "${deleteItem?.name}"? This will fail if any controls or sections still reference "${deleteItem?.code}". Archive it instead to preserve existing references.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={FM.del.isPending}
        onConfirm={() => FM.del.mutate(deleteItem.id, { onSuccess: () => setDeleteItem(null) })}
        onCancel={() => setDeleteItem(null)}
      />
    </PageLayout>
  )
}
