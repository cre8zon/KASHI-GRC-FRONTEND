// ─── StepForm — roles from DB dropdown, users from role, side selector ────────
// This replaces the StepForm component in WorkflowPage.jsx

import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { rolesApi } from '../../../api/roles.api'
import { usersApi } from '../../../api/users.api'
import { workflowsApi } from '../../../api/workflows.api'
import { uiAdminApi } from '../../../api/uiConfig.api'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../../store/slices/authSlice'
import { Plus, Trash2, X, ChevronDown, Zap, AlertCircle, GripVertical } from 'lucide-react'
import { StepSectionEditor } from '../../../components/workflow/StepSectionEditor'
import { cn } from '../../../lib/cn'
import { Button } from '../../../components/ui/Button'

// ─── Nav Key Picker — loads all nav items from DB, admin picks by key + label ─

const useNavKeys = () => useQuery({
  queryKey: ['nav-items-all'],
  queryFn:  () => uiAdminApi.navigation.list({ skip: 0, take: 500 }),
  staleTime: 5 * 60 * 1000,
  select: (data) => {
    // Flatten paginated or array response → [{navKey, label, route}]
    const items = Array.isArray(data) ? data : (data?.items || data?.data || [])
    return items
      .filter(n => n.navKey && n.route)
      .sort((a, b) => a.navKey.localeCompare(b.navKey))
  },
})

function NavKeyPicker({ value, onChange }) {
  const { data: navItems = [], isLoading } = useNavKeys()
  const [search, setSearch] = useState('')
  const [open, setOpen]     = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = navItems.find(n => n.navKey === value)

  const filtered = navItems.filter(n =>
    !search ||
    n.navKey.toLowerCase().includes(search.toLowerCase()) ||
    (n.label || '').toLowerCase().includes(search.toLowerCase()) ||
    (n.route || '').toLowerCase().includes(search.toLowerCase())
  )

  const clear = (e) => { e.stopPropagation(); onChange(null); setSearch('') }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="h-8 w-full flex items-center justify-between gap-2 rounded-md border border-border bg-surface-raised px-3 text-sm text-left focus:outline-none focus:ring-1 focus:ring-brand-500 hover:border-border/80 transition-colors"
      >
        {selected ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-mono text-xs text-brand-400 truncate">{selected.navKey}</span>
            <span className="text-text-muted text-xs truncate">— {selected.route}</span>
          </div>
        ) : (
          <span className="text-text-muted text-sm">
            {isLoading ? 'Loading…' : 'Select page…'}
          </span>
        )}
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <span onClick={clear}
              className="text-text-muted hover:text-red-400 transition-colors text-xs px-1">✕</span>
          )}
          <ChevronDown size={12} className="text-text-muted" />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border bg-surface-raised shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-border bg-surface-raised">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by key, label or route…"
              className="h-7 w-full rounded border border-border bg-surface px-2.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {/* Options */}
          <div className="max-h-48 overflow-y-auto bg-surface-raised">
            {/* Clear / none option */}
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); setSearch('') }}
              className="w-full flex items-center px-3 py-2 text-xs text-text-muted hover:bg-surface-overlay transition-colors italic"
            >
              None — use inline inbox actions
            </button>
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-text-muted">No nav items match</p>
            )}
            {filtered.map(n => (
              <button
                key={n.navKey}
                type="button"
                onClick={() => { onChange(n.navKey); setOpen(false); setSearch('') }}
                className={cn(
                  'w-full flex flex-col items-start px-3 py-2 text-left hover:bg-surface-overlay transition-colors',
                  n.navKey === value && 'bg-brand-500/10'
                )}
              >
                <span className="font-mono text-xs text-brand-400">{n.navKey}</span>
                <span className="text-[10px] text-text-muted mt-0.5">{n.route}</span>
                {n.label && (
                  <span className="text-[10px] text-text-muted">{n.label}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Side options a step can target — who acts on this step
const STEP_SIDES = [
  { value: 'ORGANIZATION', label: 'Organisation' },
  { value: 'VENDOR',       label: 'Vendor' },
  { value: 'AUDITOR',      label: 'Auditor' },
  { value: 'AUDITEE',      label: 'Auditee' },
  { value: 'SYSTEM',       label: 'System (automated)' },
]

const APPROVAL_TYPES = [
  { value: 'ANY_ONE',   label: 'Any One' },
  { value: 'ALL',       label: 'All Must Approve' },
  { value: 'MAJORITY',  label: 'Majority' },
  { value: 'THRESHOLD', label: 'Threshold (N)' },
]

// ── Fetch registered automated action keys from the backend registry ──────────
function useAutomatedActions() {
  return useQuery({
    queryKey: ['automated-actions'],
    queryFn:  () => workflowsApi.blueprints.automatedActions(),
    staleTime: 10 * 60 * 1000,
  })
}

// ── Roles dropdown for one step ───────────────────────────────────────────────
function RoleSelector({ side, selectedRoleIds, onChange }) {
  const { tenantId } = useSelector(selectAuth)

  const { data: rolesData, isLoading } = useQuery({
    queryKey: ['roles-for-step', tenantId, side],
    queryFn:  () => rolesApi.list(tenantId, side),
    enabled:  !!side,
    staleTime: 5 * 60 * 1000,
  })

  const raw = rolesData?.data || rolesData
  const roles = (() => {
    if (!raw) return []
    if (raw.hierarchy) return Object.values(raw.hierarchy).flat()
    if (Array.isArray(raw)) return raw.flatMap(r => r.children ? [r, ...r.children] : [r])
    return []
  })()

  const toggleRole = (roleId) => {
    if (selectedRoleIds.includes(roleId)) {
      onChange(selectedRoleIds.filter(id => id !== roleId))
    } else {
      onChange([...selectedRoleIds, roleId])
    }
  }

  if (!side) return (
    <p className="text-[10px] text-text-muted italic">Select a side first to see roles</p>
  )

  return (
    <div className="flex flex-col gap-1.5">
      {isLoading && <p className="text-[10px] text-text-muted">Loading roles…</p>}
      {!isLoading && roles.length === 0 && (
        <p className="text-[10px] text-text-muted italic">No roles found for {side}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {roles.map(role => {
          const selected = selectedRoleIds.includes(role.role_id)
          return (
            <button key={role.role_id} type="button" onClick={() => toggleRole(role.role_id)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors',
                selected
                  ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                  : 'bg-surface-raised border-border text-text-muted hover:text-text-primary hover:border-brand-500/30'
              )}>
              {selected && <X size={9} />}
              {role.name || role.roleName}
            </button>
          )
        })}
      </div>
      {selectedRoleIds.length > 0 && (
        <p className="text-[10px] text-text-muted">
          {selectedRoleIds.length} role{selectedRoleIds.length > 1 ? 's' : ''} selected
          — users with these roles will receive tasks when this step activates
        </p>
      )}
    </div>
  )
}

// ── Users picker — search and add specific users ──────────────────────────────
function UserSelector({ side, selectedUsers, onChange }) {
  const [search, setSearch] = useState('')

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users-for-step', side, search],
    queryFn:  () => usersApi.list({
      take: 20,
      search: search || undefined,
      ...(side ? { side } : {}),
    }),
    enabled: search.length >= 2 || !!side,
    staleTime: 30 * 1000,
  })

  const users = usersData?.items || usersData?.data || []

  const addUser = (user) => {
    if (!selectedUsers.find(u => u.id === user.id)) {
      onChange([...selectedUsers, { id: user.id, fullName: user.fullName, email: user.email }])
    }
    setSearch('')
  }

  const removeUser = (userId) => onChange(selectedUsers.filter(u => u.id !== userId))

  return (
    <div className="flex flex-col gap-2">
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedUsers.map(u => (
            <span key={u.id}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/30 text-[11px] text-purple-400">
              {u.fullName || u.email}
              <button onClick={() => removeUser(u.id)}
                className="hover:text-red-400 transition-colors ml-0.5">
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email (min 2 chars)…"
          className="w-full h-7 rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />

        {search.length >= 2 && (
          <div className="absolute top-8 left-0 right-0 z-50 rounded-md border border-border bg-surface-raised shadow-lg max-h-40 overflow-y-auto">
            {isLoading && <p className="px-3 py-2 text-xs text-text-muted">Searching…</p>}
            {!isLoading && users.length === 0 && (
              <p className="px-3 py-2 text-xs text-text-muted">No users found</p>
            )}
            {users.map(u => (
              <button key={u.id} onClick={() => addUser(u)} type="button"
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-overlay text-left transition-colors">
                <div className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-brand-400">
                    {(u.fullName || u.email || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary truncate">{u.fullName || '—'}</p>
                  <p className="text-[10px] text-text-muted truncate">{u.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedUsers.length > 0 && (
        <p className="text-[10px] text-text-muted">
          {selectedUsers.length} user{selectedUsers.length > 1 ? 's' : ''} directly assigned
          — these users always receive a task, regardless of their roles
        </p>
      )}
    </div>
  )
}

// ── Automated Action selector — only shown for SYSTEM steps ──────────────────
//
// Shows a dropdown of all registered AutomatedActionHandler keys fetched from
// GET /v1/workflows/automated-actions. Also allows typing a custom key for
// actions not yet implemented — the system will log a warning at runtime
// until a handler is registered with that key.
//
// Platform Admin workflow:
//   1. Pick an existing key from the dropdown, OR
//   2. Type a new custom key (e.g. "SEND_COMPLIANCE_REPORT")
//   3. The developer implements AutomatedActionHandler with that key
//   4. On next deploy the key is live — no blueprint changes needed

function AutomatedActionSelector({ value, onChange }) {
  const { data: registeredKeys = [] } = useAutomatedActions()
  const [useCustom, setUseCustom] = useState(
    // Start in custom mode if value doesn't match a known key
    value && !registeredKeys.includes(value)
  )

  // Switch to custom mode if the current value isn't in the registered list
  useEffect(() => {
    if (value && registeredKeys.length > 0 && !registeredKeys.includes(value)) {
      setUseCustom(true)
    }
  }, [registeredKeys, value])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* Toggle between dropdown and freetext */}
        <div className="flex rounded-md border border-border overflow-hidden text-[10px]">
          <button type="button"
            onClick={() => { setUseCustom(false); if (useCustom) onChange('') }}
            className={cn('px-2 py-1 transition-colors',
              !useCustom ? 'bg-brand-500/15 text-brand-400' : 'text-text-muted hover:text-text-primary')}>
            Pick existing
          </button>
          <button type="button"
            onClick={() => { setUseCustom(true); if (!useCustom) onChange('') }}
            className={cn('px-2 py-1 transition-colors',
              useCustom ? 'bg-brand-500/15 text-brand-400' : 'text-text-muted hover:text-text-primary')}>
            Define new
          </button>
        </div>

        {/* Clear button */}
        {value && (
          <button type="button" onClick={() => onChange('')}
            className="text-[10px] text-text-muted hover:text-red-400 transition-colors">
            <X size={10} />
          </button>
        )}
      </div>

      {!useCustom ? (
        // Dropdown of registered keys
        <select value={value || ''} onChange={e => onChange(e.target.value)}
          className="h-7 w-full rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
          <option value="">No automated action (step stays IN_PROGRESS)</option>
          {registeredKeys.map(key => (
            <option key={key} value={key}>{key}</option>
          ))}
        </select>
      ) : (
        // Freetext for custom / future action key
        <div className="flex flex-col gap-1">
          <input
            value={value || ''}
            onChange={e => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
            placeholder="e.g. SEND_COMPLIANCE_REPORT"
            className="h-7 w-full rounded-md border border-amber-500/40 bg-surface-raised px-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-amber-500/60 font-mono"
          />
          <div className="flex items-start gap-1.5">
            <AlertCircle size={10} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[10px] text-amber-400/80">
              Custom key — implement{' '}
              <code className="text-amber-400">AutomatedActionHandler</code> with{' '}
              <code className="text-amber-400">actionKey() == "{value || 'YOUR_KEY'}"</code>{' '}
              and annotate with <code className="text-amber-400">@Component</code>.
              The step will stay IN_PROGRESS until a handler is registered.
            </p>
          </div>
        </div>
      )}

      {/* Show what the selected action does */}
      {value && !useCustom && (
        <p className="text-[10px] text-green-400">
          ✓ Handler registered — this step will fire automatically when the workflow starts.
        </p>
      )}
    </div>
  )
}


// ── Assigner Resolution Selector ─────────────────────────────────────────────
//
// Shown for non-SYSTEM steps that have actor roles.
// Determines how the step gets assigned when it becomes active.
//
// POOL           → shared queue, first role-holder claims
// PUSH_TO_ROLES  → push to specific assigner roles (+ role picker appears)
// PREVIOUS_ACTOR → whoever approved the previous step assigns this one
// INITIATOR      → workflow creator assigns

const RESOLUTION_OPTIONS = [
  {
    value: 'POOL',
    label: 'Pool (shared queue)',
    desc: 'All actor-role holders see this step in a shared queue and self-select. Most scalable.',
  },
  {
    value: 'PUSH_TO_ROLES',
    label: 'Push to assigner roles',
    desc: 'Tasks pushed to specific assigner roles immediately. They delegate to the actor.',
  },
  {
    value: 'PREVIOUS_ACTOR',
    label: 'Previous actor',
    desc: 'Whoever approved the previous step gets this assignment task. Natural delegation chain.',
  },
  {
    value: 'INITIATOR',
    label: 'Workflow initiator',
    desc: 'The person who started the workflow drives all assignments.',
  },
]

function AssignerResolutionSelector({ resolution, assignerRoleIds, onResolutionChange, onAssignerRolesChange }) {
  const { tenantId } = useSelector(selectAuth)

  // Load ALL roles (any side) for assigner role picker
  const { data: allRolesData } = useQuery({
    queryKey: ['all-roles-flat', tenantId],
    queryFn:  () => rolesApi.list(tenantId, null),
    staleTime: 5 * 60 * 1000,
  })

  const allRoles = (() => {
    const raw = allRolesData?.data || allRolesData
    if (!raw) return []
    if (raw.hierarchy) return Object.values(raw.hierarchy).flat()
    if (Array.isArray(raw)) return raw.flatMap(r => r.children ? [r, ...r.children] : [r])
    return []
  })()

  const toggleAssignerRole = (roleId) => {
    const ids = assignerRoleIds || []
    if (ids.includes(roleId)) {
      onAssignerRolesChange(ids.filter(id => id !== roleId))
    } else {
      onAssignerRolesChange([...ids, roleId])
    }
  }

  const selected = RESOLUTION_OPTIONS.find(o => o.value === resolution)

  return (
    <div className="flex flex-col gap-3">
      {/* Resolution picker */}
      <div className="grid grid-cols-2 gap-2">
        {RESOLUTION_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onResolutionChange(opt.value)}
            className={cn(
              'flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border text-left transition-colors',
              resolution === opt.value
                ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                : 'border-border bg-surface-raised text-text-muted hover:border-brand-500/30 hover:text-text-primary'
            )}
          >
            <span className="text-xs font-semibold">{opt.label}</span>
            <span className="text-[10px] leading-tight opacity-80">{opt.desc}</span>
          </button>
        ))}
      </div>

      {/* Assigner role picker — only for PUSH_TO_ROLES */}
      {resolution === 'PUSH_TO_ROLES' && (
        <div>
          <label className="text-[10px] font-medium text-text-secondary uppercase tracking-wide block mb-1.5">
            Assigner Roles
            <span className="ml-1 text-text-muted normal-case font-normal">
              — who gets the task to delegate (any side)
            </span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {allRoles.map(role => {
              const isSelected = (assignerRoleIds || []).includes(role.role_id)
              return (
                <button
                  key={role.role_id}
                  type="button"
                  onClick={() => toggleAssignerRole(role.role_id)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors',
                    isSelected
                      ? 'bg-purple-500/15 border-purple-500/40 text-purple-400'
                      : 'bg-surface-raised border-border text-text-muted hover:text-text-primary hover:border-purple-500/30'
                  )}
                >
                  {isSelected && <X size={9} />}
                  <span>{role.name || role.roleName}</span>
                  {role.side && (
                    <span className="text-[9px] opacity-60 ml-0.5">({role.side})</span>
                  )}
                </button>
              )
            })}
          </div>
          {(assignerRoleIds || []).length === 0 && (
            <p className="text-[10px] text-amber-400 mt-1">
              Select at least one assigner role, or switch to a different resolution.
            </p>
          )}
        </div>
      )}

      {/* Description of selected */}
      {selected && (
        <p className="text-[10px] text-text-muted">
          <span className="text-text-secondary font-medium">{selected.label}: </span>
          {selected.desc}
        </p>
      )}
    </div>
  )
}


// ── Step Action Selector ──────────────────────────────────────────────────────
//
// Declares what kind of work the ACTOR does on this step.
// This drives frontend routing — the inbox reads stepAction + stepSide + entityType
// to build the URL. No step-name matching, no hardcoded routes.

const STEP_ACTION_OPTIONS = [
  {
    value: 'ASSIGN',
    icon:  '👤',
    label: 'Assign',
    desc:  'Actor assigns/delegates this step to someone else. e.g. VRM picks which CISO handles the vendor.',
  },
  {
    value: 'ACKNOWLEDGE',
    icon:  '✅',
    label: 'Acknowledge',
    desc:  'Actor acknowledges receipt or awareness. e.g. VRM confirms assessment received.',
  },
  {
    value: 'FILL',
    icon:  '✏️',
    label: 'Fill',
    desc:  'Actor fills in content — questionnaire answers, evidence, forms.',
  },
  {
    value: 'REVIEW',
    icon:  '🔍',
    label: 'Review',
    desc:  'Actor reviews submitted content and approves/rejects/comments.',
  },
  {
    value: 'APPROVE',
    icon:  '🏛️',
    label: 'Approve',
    desc:  'Actor makes a final decision only — no content editing.',
  },
  {
    value: 'EVALUATE',
    icon:  '📊',
    label: 'Evaluate',
    desc:  'Actor evaluates evidence against criteria. Audit-style scoring.',
  },
  {
    value: 'GENERATE',
    icon:  '📄',
    label: 'Generate',
    desc:  'Actor triggers generation of an output — report, certificate, etc.',
  },
]

function StepActionSelector({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {STEP_ACTION_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex items-start gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors',
            value === opt.value
              ? 'border-brand-500/50 bg-brand-500/10'
              : 'border-border bg-surface-raised hover:border-brand-500/30 hover:bg-surface-overlay'
          )}
        >
          <span className="text-base leading-none mt-0.5 shrink-0">{opt.icon}</span>
          <div className="min-w-0">
            <p className={cn('text-xs font-semibold leading-tight',
              value === opt.value ? 'text-brand-400' : 'text-text-primary')}>
              {opt.label}
            </p>
            <p className="text-[10px] text-text-muted leading-tight mt-0.5 line-clamp-2">
              {opt.desc}
            </p>
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Observer Roles Selector ───────────────────────────────────────────────────
//
// Observer roles get READ-ONLY access to the step artifact without a task.
// Any side — an ORG role can observe a VENDOR step and vice versa.
// Use for compliance officers, audit managers, executives needing visibility.

function ObserverRolesSelector({ observerRoleIds, onChange }) {
  const { tenantId } = useSelector(selectAuth)

  const { data: allRolesData } = useQuery({
    queryKey: ['all-roles-flat', tenantId],
    queryFn:  () => rolesApi.list(tenantId, null),
    staleTime: 5 * 60 * 1000,
  })

  const allRoles = (() => {
    const raw = allRolesData?.data || allRolesData
    if (!raw) return []
    if (raw.hierarchy) return Object.values(raw.hierarchy).flat()
    if (Array.isArray(raw)) return raw.flatMap(r => r.children ? [r, ...r.children] : [r])
    return []
  })()

  const toggle = (roleId) => {
    const ids = observerRoleIds || []
    onChange(ids.includes(roleId) ? ids.filter(id => id !== roleId) : [...ids, roleId])
  }

  if (!allRoles.length) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {allRoles.map(role => {
        const isSelected = (observerRoleIds || []).includes(role.role_id)
        return (
          <button
            key={role.role_id}
            type="button"
            onClick={() => toggle(role.role_id)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors',
              isSelected
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-surface-raised border-border text-text-muted hover:text-text-primary hover:border-emerald-500/30'
            )}
          >
            {isSelected && <X size={9} />}
            <span>{role.name || role.roleName}</span>
            {role.side && (
              <span className="text-[9px] opacity-60 ml-0.5">({role.side})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── StepCard inside the form ──────────────────────────────────────────────────
function StepFormCard({ step, index, total, errors, onChange, onRemove, dragHandleProps }) {
  const [expanded, setExpanded] = useState(true)
  const isSystem = step.side === 'SYSTEM'

  const set = (key, val) => onChange({ ...step, [key]: val })

  return (
    <div className={cn('rounded-lg border overflow-hidden',
      isSystem ? 'border-brand-500/30 bg-brand-500/3' : 'border-border bg-surface-overlay')}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50">
        {/* Drag handle — grab here to reorder */}
        <div
          {...dragHandleProps}
          className="flex items-center justify-center w-4 h-6 text-text-muted hover:text-text-secondary cursor-grab active:cursor-grabbing shrink-0 touch-none"
          title="Drag to reorder"
        >
          <GripVertical size={13} />
        </div>
        <div className={cn('w-5 h-5 rounded-full flex items-center justify-center shrink-0',
          isSystem ? 'bg-brand-500/30' : 'bg-brand-500/20')}>
          {isSystem
            ? <Zap size={9} className="text-brand-400" />
            : <span className="text-[10px] font-bold text-brand-400">{index + 1}</span>
          }
        </div>
        <input value={step.name} onChange={e => set('name', e.target.value)}
          placeholder="Step name e.g. Legal Review"
          className={cn('flex-1 rounded-md border bg-surface-raised px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500',
            errors[`step_${index}`] ? 'border-red-500/50' : 'border-border')} />
        <button type="button" onClick={() => setExpanded(e => !e)}
          className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary transition-colors">
          <ChevronDown size={13} className={cn('transition-transform', expanded ? '' : '-rotate-90')} />
        </button>
        {total > 1 && (
          <button type="button" onClick={onRemove}
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="p-3 flex flex-col gap-4">
          {/* Row 1: Side + Approval Type + Threshold + SLA */}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-text-muted block mb-1">
                Assigned Side
                <span className="text-text-muted ml-1 font-normal">(who acts)</span>
              </label>
              <select value={step.side || ''}
                onChange={e => set('side', e.target.value)}
                className="w-full h-7 rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">Any side</option>
                {STEP_SIDES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-muted block mb-1">Approval Type</label>
              <select value={step.approvalType}
                onChange={e => set('approvalType', e.target.value)}
                disabled={isSystem}
                className="w-full h-7 rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-brand-500">
                {APPROVAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-muted block mb-1">Min Approvals</label>
              <input type="number" min="1" value={step.minApprovalsRequired}
                onChange={e => set('minApprovalsRequired', e.target.value)}
                disabled={step.approvalType !== 'THRESHOLD' || isSystem}
                placeholder="1"
                className="w-full h-7 rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="text-[10px] text-text-muted block mb-1">SLA Hours</label>
              <input type="number" min="1" value={step.slaHours}
                onChange={e => set('slaHours', e.target.value)}
                placeholder="optional"
                className="w-full h-7 rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>

          {/* SYSTEM step: show automated action picker, hide roles/users */}
          {isSystem ? (
            <div>
              <label className="text-[10px] font-medium text-text-secondary uppercase tracking-wide block mb-2">
                <span className="flex items-center gap-1.5">
                  <Zap size={10} className="text-brand-400" />
                  Automated Action
                  <span className="ml-1 text-text-muted normal-case font-normal">
                    — fires automatically when this step starts, then auto-approves and advances
                  </span>
                </span>
              </label>
              <AutomatedActionSelector
                value={step.automatedAction || ''}
                onChange={val => set('automatedAction', val || null)}
              />
            </div>
          ) : (
            <>
              {/* Row 2: Actor Roles */}
              <div>
                <label className="text-[10px] font-medium text-text-secondary uppercase tracking-wide block mb-2">
                  Actor Roles
                  <span className="ml-1 text-text-muted normal-case font-normal">
                    — who does the work on this step
                  </span>
                </label>
                <RoleSelector
                  side={step.side}
                  selectedRoleIds={step.roleIds || []}
                  onChange={(ids) => set('roleIds', ids)}
                />
              </div>

              {/* Row 2b: Step Action — what the actor does */}
              {(step.roleIds || []).length > 0 && (
                <div>
                  <label className="text-[10px] font-medium text-text-secondary uppercase tracking-wide block mb-2">
                    Action Type
                    <span className="ml-1 text-text-muted normal-case font-normal">
                      — what the actor does on this step (drives frontend routing)
                    </span>
                  </label>
                  <StepActionSelector
                    value={step.stepAction || ''}
                    onChange={(val) => set('stepAction', val)}
                  />
                </div>
              )}

              {/* Nav Keys — which pages render this step's tasks */}
              {step.side && step.side !== 'SYSTEM' && (
                <>
                  <div>
                    <label className="text-[10px] font-medium text-text-secondary uppercase tracking-wide block mb-1.5">
                      Actor Nav Key
                      <span className="ml-1 text-text-muted normal-case font-normal">
                        — page that renders this step's task for actors (FILL / REVIEW / GENERATE…)
                      </span>
                    </label>
                    <NavKeyPicker
                      value={step.navKey || null}
                      onChange={(val) => set('navKey', val)}
                    />
                    <p className="text-[10px] text-text-muted mt-1">
                      Leave blank for steps that use inline inbox approve/reject actions only.
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] font-medium text-text-secondary uppercase tracking-wide block mb-1.5">
                      Assigner Nav Key
                      <span className="ml-1 text-text-muted normal-case font-normal">
                        — page that renders this step's task for coordinators / assigners
                      </span>
                    </label>
                    <NavKeyPicker
                      value={step.assignerNavKey || null}
                      onChange={(val) => set('assignerNavKey', val)}
                    />
                    <p className="text-[10px] text-text-muted mt-1">
                      Leave blank if coordinators should only use inline inbox actions.
                    </p>
                  </div>
                </>
              )}

              {/* Row 2c: Assigner Resolution — how the step gets assigned */}
              {(step.roleIds || []).length > 0 && (
                <div>
                  <label className="text-[10px] font-medium text-text-secondary uppercase tracking-wide block mb-2">
                    Assignment Strategy
                    <span className="ml-1 text-text-muted normal-case font-normal">
                      — who gets a task to drive assignment when this step starts
                    </span>
                  </label>
                  <AssignerResolutionSelector
                    resolution={step.assignerResolution || 'POOL'}
                    assignerRoleIds={step.assignerRoleIds || []}
                    onResolutionChange={(val) => set('assignerResolution', val)}
                    onAssignerRolesChange={(ids) => set('assignerRoleIds', ids)}
                  />
                </div>
              )}

              {/* Row 2d: Observer Roles — read-only visibility, no task */}
              <div>
                <label className="text-[10px] font-medium text-text-secondary uppercase tracking-wide block mb-2">
                  Observer Roles
                  <span className="ml-1 text-text-muted normal-case font-normal">
                    — read-only access to this step's artifact, no task assigned (any side)
                  </span>
                </label>
                <ObserverRolesSelector
                  observerRoleIds={step.observerRoleIds || []}
                  onChange={(ids) => set('observerRoleIds', ids)}
                />
                {(step.observerRoleIds || []).length === 0 && (
                  <p className="text-[10px] text-text-muted mt-1 italic">
                    No observers — optional. Add roles like compliance officers or audit managers.
                  </p>
                )}
              </div>

              {/* Row 3: Direct users */}
              <div>
                <label className="text-[10px] font-medium text-text-secondary uppercase tracking-wide block mb-2">
                  Direct Users
                  <span className="ml-1 text-text-muted normal-case font-normal">
                    — optional: pin specific users who always get a task on this step
                  </span>
                </label>
                <UserSelector
                  side={step.side}
                  selectedUsers={step.users || []}
                  onChange={(users) => {
                    set('users', users)
                    set('userIds', users.map(u => u.id))
                  }}
                />
              </div>

              {/* Gap 4: compound task section editor */}
              <div>
                <label className="text-[10px] font-medium text-text-secondary uppercase tracking-wide block mb-1">
                  Compound task sections
                  <span className="ml-1 text-text-muted normal-case font-normal">
                    — define sections the actor must complete before approving
                  </span>
                </label>
                <StepSectionEditor
                  sections={step.sections || []}
                  onChange={(sections) => set('sections', sections)}
                  stepSide={step.side}
                />
              </div>

              {/* Manual assignment note */}
              {step.side && (
                <div className="px-3 py-2 bg-surface-raised rounded-md border border-border/50">
                  <p className="text-[10px] text-text-muted leading-relaxed">
                    <span className="text-text-secondary font-medium">Runtime assignment: </span>
                    When this step starts, tasks are created for the direct users above immediately.
                    For role-based assignments, the {step.side.toLowerCase()} org resolves which of their
                    users hold the selected roles and calls <code className="text-brand-400">/tasks/assign</code> to register them.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}


// ── CSV Bulk Step Importer ────────────────────────────────────────────────────
//
// Uploads the CSV to POST /v1/workflows/{id}/import-steps on the backend.
// The server (CsvImportService) does ALL parsing, role resolution, and DB writes.
// Auto-detects two formats:
//   DB_EXPORT  — columns from workflow_steps table dump (id, workflow_id, step_order...)
//   TEMPLATE   — human-authored (order, name, side, stepAction, actorRoles, assignerRoles...)
//
// Returns CsvImportResult with per-row log — same UI as AssessmentTemplatesPage.
// After success, invalidates the blueprint query so the step editor reloads fresh.

function downloadTemplate() {
  const headers = [
    'order','name','side','stepAction','approvalType','slaHours',
    'automatedAction','assignerResolution','actorRoles','assignerRoles','observerRoles','navKey','assignerNavKey',
  ]
  const rows = [
    ['1','Execute Assessment',            'SYSTEM',  '',           'ANY_ONE','',   'EXECUTE_ASSESSMENT','POOL',          '',                '',                ''],
    ['2','VRM Acknowledges Assessment',   'VENDOR',  'ACKNOWLEDGE','ANY_ONE','48', '',                 'PUSH_TO_ROLES', 'VENDOR_VRM',       'ORG_VRM_MANAGER', ''],
    ['3','VRM Delegates to Vendor CISO',  'VENDOR',  'ASSIGN',    'ANY_ONE','24', '',                 'PREVIOUS_ACTOR','VENDOR_VRM',       '',                ''],
    ['4','Vendor CISO Assigns Groups',    'VENDOR',  'ASSIGN',    'ANY_ONE','48', '',                 'PREVIOUS_ACTOR','VENDOR_CISO',      '',                ''],
    ['5','Responders Assign Questions',   'VENDOR',  'ASSIGN',    'ANY_ONE','24', '',                 'PREVIOUS_ACTOR','VENDOR_RESPONDER',  '',                ''],
    ['6','Contributors Upload Evidence',  'VENDOR',  'FILL',      'ANY_ONE','72', '',                 'PREVIOUS_ACTOR','VENDOR_CONTRIBUTOR','',                'ORG_COMPLIANCE_OFFICER'],
    ['7','Responders Review Answers',     'VENDOR',  'REVIEW',    'ANY_ONE','48', '',                 'PREVIOUS_ACTOR','VENDOR_RESPONDER',  '',                ''],
    ['8','CISO Submits Assessment',       'VENDOR',  'REVIEW',    'ANY_ONE','24', '',                 'PUSH_TO_ROLES', 'VENDOR_CISO',       '',                ''],
    ['9','Org Admin Delegates Review',    'ORGANIZATION','ASSIGN', 'ANY_ONE','48','',                 'INITIATOR',     'ORG_CISO',          '',                ''],
    ['10','Org CISO Assigns Reviewers',   'ORGANIZATION','ASSIGN', 'ANY_ONE','48','',                 'PREVIOUS_ACTOR','ORG_REVIEWER',      '',                ''],
    ['11','Reviewers Delegate Questions', 'ORGANIZATION','ASSIGN', 'ANY_ONE','24','',                 'PREVIOUS_ACTOR','ORG_REVIEW_ASSISTANT','',              ''],
    ['12','Review Assistants Review',     'ORGANIZATION','REVIEW', 'ANY_ONE','72','',                 'PREVIOUS_ACTOR','ORG_REVIEW_ASSISTANT','',              ''],
    ['13','Reviewers Consolidate',        'ORGANIZATION','REVIEW', 'ANY_ONE','48','',                 'PREVIOUS_ACTOR','ORG_REVIEWER',      '',                ''],
    ['14','Org CISO Final Approval',      'ORGANIZATION','APPROVE','ANY_ONE','24','',                 'PUSH_TO_ROLES', 'ORG_CISO',          '',                ''],
  ]
  const csv  = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'workflow_steps_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

function CsvImportModal({ workflowId, tenantId, onClose, onSuccess }) {
  const qc              = useQueryClient()
  const [stage, setStage]       = useState('upload')   // upload | importing | done
  const [result, setResult]     = useState(null)
  const [selectedFile, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef                 = useRef(null)

  const errCount = result?.log?.filter(e => e.status === 'ERROR').length ?? 0

  const reset = () => { setStage('upload'); setResult(null); setFile(null) }

  const handleFile = (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Please select a .csv file')
      return
    }
    setFile(file)
  }

  const runImport = async () => {
    if (!selectedFile || !workflowId) return
    setStage('importing')
    try {
      // Pass selectedFile directly — importSteps wraps it in FormData internally
      const res = await workflowsApi.blueprints.importSteps(workflowId, selectedFile, tenantId)
      setResult(res)
      // Invalidate so the step editor reloads fresh when the user closes this modal
      qc.invalidateQueries({ queryKey: ['workflow-blueprint', workflowId] })
      qc.invalidateQueries({ queryKey: ['workflow-blueprints'] })
      setStage('done')
      // Do NOT call onSuccess here — user must see the result log first.
      // onSuccess (closes modal) is called from the "Done" button below.
    } catch (err) {
      setResult({
        fatalError: true,
        summary: err?.message || 'Import failed — server error',
        log: [], successCount: 0, failureCount: 0,
      })
      setStage('done')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Bulk Import Steps from CSV</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Server parses the file — DB export or template format both supported.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-text-muted hover:text-text-primary hover:border-brand-500/40 transition-colors">
              ↓ Download Template
            </button>
            <button onClick={onClose}
              className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-overlay">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── Upload stage ─────────────────────────────────────────────── */}
          {stage === 'upload' && (
            <div className="flex flex-col gap-4">
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
                  dragOver
                    ? 'border-brand-500/60 bg-brand-500/5'
                    : selectedFile
                      ? 'border-green-500/40 bg-green-500/3'
                      : 'border-border hover:border-brand-500/40 hover:bg-brand-500/3'
                )}
              >
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={e => handleFile(e.target.files[0])} />
                {selectedFile ? (
                  <>
                    <p className="text-sm font-semibold text-green-400">✓ {selectedFile.name}</p>
                    <p className="text-xs text-text-muted mt-1">
                      {(selectedFile.size / 1024).toFixed(1)} KB · Click to change
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-text-secondary">
                      Drop your CSV here or click to browse
                    </p>
                    <p className="text-xs text-text-muted mt-2">
                      DB export (workflow_steps dump) or template format — auto-detected from header row.
                      Role names resolved automatically by the server.
                    </p>
                  </>
                )}
              </div>

              {/* Format hints */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-border bg-surface-raised">
                  <p className="font-semibold text-text-secondary mb-1">DB Export format</p>
                  <p className="text-text-muted font-mono text-[10px] leading-relaxed">
                    id, workflow_id, step_order, name, side,<br/>
                    step_action, assigner_resolution, sla_hours,<br/>
                    automated_action, allow_override...
                  </p>
                  <p className="text-text-muted mt-1.5">
                    Add actorRoles/assignerRoles/observerRoles columns to include roles.
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-surface-raised">
                  <p className="font-semibold text-text-secondary mb-1">Template format</p>
                  <p className="text-text-muted font-mono text-[10px] leading-relaxed">
                    order, name, side, stepAction,<br/>
                    approvalType, slaHours, automatedAction,<br/>
                    assignerResolution, actorRoles, assignerRoles,<br/>
                    observerRoles, navKey
                    approvalType, slaHours, automatedAction,<br/>
                    assignerResolution, actorRoles, assignerRoles, observerRoles
                  </p>
                  <p className="text-text-muted mt-1.5">
                    Role names semicolon-separated e.g. <code>VENDOR_VRM;VENDOR_CISO</code>
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={onClose}
                  className="px-3 py-1.5 rounded-md border border-border text-xs text-text-muted hover:text-text-primary transition-colors">
                  Cancel
                </button>
                <button onClick={runImport} disabled={!selectedFile}
                  className="px-4 py-1.5 rounded-md bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Upload & Import
                </button>
              </div>
            </div>
          )}

          {/* ── Importing stage ──────────────────────────────────────────── */}
          {stage === 'importing' && (
            <div className="flex flex-col items-center gap-6 py-12">
              <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center">
                <svg className="w-7 h-7 text-brand-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-text-primary">Importing on server…</p>
                <p className="text-xs text-text-muted mt-1">
                  Parsing CSV, resolving role names, upserting steps and role assignments.
                </p>
              </div>
              <p className="text-xs text-text-muted">Please don't close this window</p>
            </div>
          )}

          {/* ── Done stage ───────────────────────────────────────────────── */}
          {stage === 'done' && result && (
            <div className="flex flex-col gap-4">
              {/* Summary */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                  result.fatalError ? 'bg-red-500/10' :
                  errCount > 0     ? 'bg-amber-500/10' : 'bg-green-500/10'
                )}>
                  {result.fatalError || errCount > 0
                    ? <AlertCircle size={22} className={result.fatalError ? 'text-red-400' : 'text-amber-400'} />
                    : <span className="text-green-400 text-xl">✓</span>
                  }
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {result.fatalError
                      ? 'Import failed'
                      : errCount > 0
                        ? `Completed with ${errCount} issue${errCount !== 1 ? 's' : ''}`
                        : 'Import successful'}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">{result.summary}</p>
                </div>
              </div>

              {/* Stats */}
              {!result.fatalError && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Total rows',  value: result.totalRows,    color: 'text-text-secondary' },
                    { label: 'Succeeded',   value: result.successCount, color: 'text-green-400' },
                    { label: 'Failed',      value: result.failureCount, color: result.failureCount ? 'text-red-400' : 'text-text-muted' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="p-3 bg-surface-overlay rounded-lg border border-border text-center">
                      <p className={cn('text-xl font-bold font-mono', color)}>{value}</p>
                      <p className="text-xs text-text-muted mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Log */}
              {result.log?.length > 0 && (
                <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-surface-overlay p-3 flex flex-col gap-0.5 font-mono text-xs">
                  {result.log.map((entry, i) => (
                    <div key={i} className={cn(
                      'flex items-start gap-2',
                      entry.status === 'SUCCESS' && 'text-text-secondary',
                      entry.status === 'ERROR'   && 'text-red-400',
                      entry.status === 'WARNING' && 'text-amber-400',
                      entry.status === 'INFO'    && 'text-brand-400',
                    )}>
                      <span className="shrink-0 mt-0.5">
                        {entry.status === 'SUCCESS' ? '✓'
                          : entry.status === 'ERROR'   ? '✗'
                          : entry.status === 'WARNING' ? '⚠'
                          : '›'}
                      </span>
                      <span>{entry.message}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={reset}
                  className="px-3 py-1.5 rounded-md border border-border text-xs text-text-muted hover:text-text-primary transition-colors">
                  Import Another
                </button>
                <button
                  onClick={() => result.fatalError ? onClose() : (onSuccess ? onSuccess() : onClose())}
                  className="px-4 py-1.5 rounded-md bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors">
                  {result.fatalError ? 'Close' : 'Done'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main StepForm — with native HTML5 drag-to-reorder ────────────────────────
//
// No external DnD library needed — uses the browser's native draggable API.
// The grip handle (⠿) on each card is the drag trigger. Dragging a card
// over another swaps their positions in real time. stepOrder is recomputed
// from array index after every reorder so it always stays sequential.
//
// Implementation notes:
//   - dragIndex ref tracks which card is being dragged
//   - dragOverIndex ref tracks which card is currently hovered
//   - onDragEnd swaps the two items and renumbers stepOrder
//   - opacity: 0.4 on the dragged card gives visual feedback
//   - "drag-over" highlight on the target card shows the drop zone

export function StepForm({ steps, setSteps, errors, workflowId }) {
  const dragIndex     = useRef(null)
  const dragOverIndex = useRef(null)
  const [showCsvImport, setShowCsvImport] = useState(false)

  // All roles for CSV import role-name resolution
  const { tenantId } = useSelector(selectAuth)
  const { data: allRolesRaw } = useQuery({
    queryKey: ['all-roles-flat', tenantId],
    queryFn:  () => rolesApi.list(tenantId, null),
    staleTime: 5 * 60 * 1000,
  })
  const allRoles = (() => {
    const raw = allRolesRaw?.data || allRolesRaw
    if (!raw) return []
    if (raw.hierarchy) return Object.values(raw.hierarchy).flat()
    if (Array.isArray(raw)) return raw.flatMap(r => r.children ? [r, ...r.children] : [r])
    return []
  })()

  const addStep = () => setSteps(s => [...s, {
    name: '', stepOrder: s.length + 1,
    side: 'ORGANIZATION',
    approvalType: 'ANY_ONE',
    minApprovalsRequired: 1,
    slaHours: '',
    roleIds: [],
    users: [],
    userIds: [],
    automatedAction: null,
    assignerResolution: 'POOL',
    assignerRoleIds: [],
    allowOverride: true,
    stepAction: null,
    navKey: null,
    assignerNavKey: null,
    observerRoleIds: [],
    sections: [],
  }])

  const removeStep = (i) => setSteps(s =>
    s.filter((_, idx) => idx !== i).map((st, idx) => ({ ...st, stepOrder: idx + 1 })))

  const updateStep = (i, updated) =>
    setSteps(s => s.map((st, idx) => idx === i ? updated : st))

  const handleDragStart = (i) => {
    dragIndex.current = i
  }

  const handleDragEnter = (i) => {
    dragOverIndex.current = i
  }

  const handleDragEnd = () => {
    const from = dragIndex.current
    const to   = dragOverIndex.current
    if (from === null || to === null || from === to) {
      dragIndex.current     = null
      dragOverIndex.current = null
      return
    }
    setSteps(s => {
      const reordered = [...s]
      const [moved]   = reordered.splice(from, 1)
      reordered.splice(to, 0, moved)
      // Renumber stepOrder sequentially after reorder
      return reordered.map((st, idx) => ({ ...st, stepOrder: idx + 1 }))
    })
    dragIndex.current     = null
    dragOverIndex.current = null
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          Steps {errors.steps && <span className="text-red-400 ml-1 normal-case font-normal">{errors.steps}</span>}
        </label>
        <div className="flex items-center gap-2">
          <Button size="xs" variant="secondary" icon={Plus} onClick={addStep}>Add Step</Button>
          {workflowId
            ? (
              <Button size="xs" variant="ghost" onClick={() => setShowCsvImport(true)}>
                ⬆ Import CSV
              </Button>
            ) : (
              <span className="text-[10px] text-text-muted italic">
                Save blueprint first to enable CSV import
              </span>
            )
          }
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <div
            key={step.stepOrder}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragEnter={() => handleDragEnter(i)}
            onDragEnd={handleDragEnd}
            onDragOver={e => e.preventDefault()}
            className="transition-opacity"
            style={{ opacity: dragIndex.current === i ? 0.4 : 1 }}
          >
            <StepFormCard
              step={step}
              index={i}
              total={steps.length}
              errors={errors}
              onChange={(updated) => updateStep(i, updated)}
              onRemove={() => removeStep(i)}
              dragHandleProps={{
                onMouseDown: e => e.stopPropagation(),
              }}
            />
          </div>
        ))}
      </div>
      {steps.length > 1 && (
        <p className="text-[10px] text-text-muted mt-2 flex items-center gap-1">
          <GripVertical size={10} />
          Drag the grip handle to reorder steps — step numbers update automatically.
        </p>
      )}
      {showCsvImport && (
        <CsvImportModal
          workflowId={workflowId}
          tenantId={tenantId}
          onClose={() => setShowCsvImport(false)}
          onSuccess={() => setShowCsvImport(false)}
        />
      )}
    </div>
  )
}

// ── Helpers for converting between form state and API payload ─────────────────
export function stepsToFormState(apiSteps = []) {
  return apiSteps.map(s => ({
    id:                   s.id || null,   // preserve for upsert on update
    name:                 s.name || '',
    stepOrder:            s.stepOrder,
    side:                 s.side || 'ORGANIZATION',
    approvalType:         s.approvalType || 'ANY_ONE',
    minApprovalsRequired: s.minApprovalsRequired ?? 1,
    slaHours:             s.slaHours ?? '',
    roleIds:              s.roleIds || [],
    users:                (s.userIds || []).map(id => ({ id })),
    userIds:              s.userIds || [],
    automatedAction:      s.automatedAction || null,
    assignerResolution:   s.assignerResolution || 'POOL',
    assignerRoleIds:      s.assignerRoleIds || [],
    allowOverride:        s.allowOverride !== undefined ? s.allowOverride : true,
    stepAction:           s.stepAction || null,
    navKey:               s.navKey || null,
    assignerNavKey:       s.assignerNavKey || null,
    observerRoleIds:      s.observerRoleIds || [],
    sections: (s.sections || []).map(sec => ({
      id:                 sec.id || null,
      sectionKey:         sec.sectionKey || '',
      sectionOrder:       sec.sectionOrder || 1,
      label:              sec.label || '',
      description:        sec.description || '',
      required:           sec.required !== false,
      completionEvent:    sec.completionEvent || '',
      requiresAssignment: sec.requiresAssignment || false,
      tracksItems:        sec.tracksItems || false,
    })),
  }))
}

export function stepsToPayload(steps) {
  return steps.map(s => ({
    id:                   s.id || undefined,  // send id so backend can upsert
    name:                 s.name,
    stepOrder:            s.stepOrder,
    side:                 s.side || undefined,
    approvalType:         s.approvalType,
    minApprovalsRequired: parseInt(s.minApprovalsRequired) || 1,
    isParallel:           false,
    isOptional:           false,
    slaHours:             s.slaHours ? parseInt(s.slaHours) : undefined,
    roleIds:              s.roleIds || [],
    userIds:              s.userIds || [],
    automatedAction:      s.automatedAction || undefined,
    assignerResolution:   s.assignerResolution || 'POOL',
    assignerRoleIds:      s.assignerRoleIds || [],
    allowOverride:        s.allowOverride !== undefined ? s.allowOverride : true,
    stepAction:           s.stepAction || undefined,
    navKey:               s.navKey || undefined,
    assignerNavKey:       s.assignerNavKey || undefined,
    observerRoleIds:      s.observerRoleIds || [],
    // Gap 4: include sections — only send rows with all three required fields
    sections: (s.sections || [])
      .filter(sec => sec.sectionKey && sec.completionEvent && sec.label)
      .map((sec, idx) => ({
        id:                 sec.id || undefined,
        sectionKey:         sec.sectionKey,
        sectionOrder:       sec.sectionOrder || idx + 1,
        label:              sec.label,
        description:        sec.description || undefined,
        required:           sec.required !== false,
        completionEvent:    sec.completionEvent,
        requiresAssignment: sec.requiresAssignment || false,
        tracksItems:        sec.tracksItems || false,
      })),
  }))
}