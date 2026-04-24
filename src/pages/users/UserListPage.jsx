import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Plus, Search, RefreshCw, Send, ChevronDown, ChevronUp } from 'lucide-react'
import { usersApi }    from '../../api/users.api'
import { authApi }     from '../../api/auth.api'
import { PageLayout }  from '../../components/layout/PageLayout'
import { DataTable }   from '../../components/ui/DataTable'
import { Button }      from '../../components/ui/Button'
import { Badge }       from '../../components/ui/Badge'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { DynamicForm } from '../../components/forms/DynamicForm'
import { useScreenConfig } from '../../hooks/useUIConfig'
import { useCreateUser }   from '../../hooks/useUsers'
import { initials }    from '../../utils/format'
import toast           from 'react-hot-toast'

// ─── Roles Cell ───────────────────────────────────────────────────────────────

function RolesCell({ roles = [] }) {
  const [expanded, setExpanded] = useState(false)
  if (!roles.length) return <span className="text-[10px] text-text-muted italic">No roles</span>

  const visible = expanded ? roles : roles.slice(0, 2)
  const extra   = roles.length - 2

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map(r => (
        <span key={r.id || r.roleId}
          className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-mono">
          {r.roleName || r.name}
        </span>
      ))}
      {!expanded && extra > 0 && (
        <button onClick={e => { e.stopPropagation(); setExpanded(true) }}
          className="text-[10px] text-text-muted hover:text-text-primary flex items-center gap-0.5">
          +{extra} <ChevronDown size={9} />
        </button>
      )}
      {expanded && extra > 0 && (
        <button onClick={e => { e.stopPropagation(); setExpanded(false) }}
          className="text-[10px] text-text-muted hover:text-text-primary flex items-center gap-0.5">
          less <ChevronUp size={9} />
        </button>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseColumns(json) {
  try { return json ? JSON.parse(json) : null } catch { return null }
}

const DEFAULT_COLUMNS = [
  { key: 'fullName',  label: 'Name',    sortable: true,  width: 180 },
  { key: 'email',     label: 'Email',   sortable: true,  width: 220, type: 'mono' },
  { key: 'status',    label: 'Status',  sortable: true,  width: 100, type: 'badge', componentKey: 'user_status' },
  { key: 'tenantId',  label: 'Tenant',  sortable: false, width: 80,  type: 'mono' },
  { key: 'createdAt', label: 'Created', sortable: true,  width: 130, type: 'date' },
]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UserListPage() {
  const navigate = useNavigate()
  const [page,         setPage]         = useState(1)
  const [search,       setSearch]       = useState('')
  const [sortBy,       setSortBy]       = useState('createdAt')
  const [sortDir,      setSortDir]      = useState('desc')
  const [showCreate,   setShowCreate]   = useState(false)
  const [resendTarget, setResendTarget] = useState(null)

  const { data: screenConfig }       = useScreenConfig('user_list')
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['users-all', { page, search, sortBy, sortDir }],
    queryFn:  () => usersApi.list({
      skip:   (page - 1) * 20,
      take:   20,
      search: search || undefined,
      sortBy: `${sortBy}=${sortDir}`,
      // no side filter — platform-wide all users
    }),
    keepPreviousData: true,
  })

  const { mutate: createUser, isPending: creating } = useCreateUser()

  const { mutate: resend, isPending: resending } = useMutation({
    mutationFn: (target) => authApi.resendInvitation({
      userId:    target.userId || target.id,
      email:     target.email,
      sendEmail: true,
    }),
    onSuccess: (_, target) => {
      setResendTarget(null)
      toast.success(`Invitation resent to ${target.email}`)
    },
    onError: (err) => toast.error(
      err?.response?.data?.error?.message || 'Failed to resend invitation'
    ),
  })

  const handleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
  }

  const users = (data?.items || []).map(u => ({ ...u, id: u.userId || u.id }))

  // Use DB-driven columns if available, else defaults — then inject avatar + roles + actions
  const baseColumns = parseColumns(screenConfig?.layout?.columnsJson) || DEFAULT_COLUMNS

  const columns = [
    {
      key: '__avatar', label: '', width: 36, type: 'custom',
      render: (row) => (
        <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-brand-400">
            {initials(row.fullName || row.email)}
          </span>
        </div>
      ),
    },
    ...baseColumns,
    {
      key: 'roles', label: 'Roles', width: 260, type: 'custom',
      render: (row) => <RolesCell roles={row.roles || []} />,
    },
    {
      key: '__actions', label: 'Actions', width: 100, type: 'custom',
      render: (row) => (
        <div className="flex items-center" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setResendTarget({
              userId: row.userId || row.id,
              email:  row.email,
              name:   row.fullName
                || `${row.firstName || ''} ${row.lastName || ''}`.trim()
                || row.email,
            })}
            title="Resend invitation email"
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-brand-400 hover:text-brand-300 hover:bg-brand-500/10 rounded-md transition-colors"
          >
            <Send size={11} /> Resend
          </button>
        </div>
      ),
    },
  ]

  return (
    <PageLayout
      title="All Users"
      subtitle={data?.pagination ? `${data.pagination.totalItems} users across all tenants` : undefined}
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search users…"
              className="h-8 pl-8 pr-3 w-52 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={refetch} />
          <Button size="sm" icon={Plus} onClick={() => setShowCreate(true)}>Add User</Button>
        </div>
      }
    >
      <DataTable
        columns={columns}
        data={users}
        config={screenConfig}
        pagination={data?.pagination}
        onPageChange={setPage}
        onSort={handleSort}
        sortBy={sortBy}
        sortDir={sortDir}
        loading={isLoading}
        onRowClick={row => navigate(`/users/${row.userId || row.id}`)}
        emptyMessage="No users found."
      />

      {/* Create user modal — same DynamicForm as before */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create User" size="md">
        <DynamicForm
          formKey="user_create"
          loading={creating}
          submitLabel="Create User"
          onSubmit={(data) => createUser(data, { onSuccess: () => setShowCreate(false) })}
        />
      </Modal>

      {/* Resend invitation confirm */}
      <ConfirmDialog
        open={!!resendTarget}
        onClose={() => setResendTarget(null)}
        onConfirm={() => resend(resendTarget)}
        loading={resending}
        title="Resend Invitation"
        confirmLabel="Resend"
        variant="primary"
        message={
          resendTarget
            ? `This will generate a new temporary password for ${resendTarget.name} and send a fresh welcome email to ${resendTarget.email}. Their current password will be invalidated immediately.`
            : ''
        }
      />
    </PageLayout>
  )
}