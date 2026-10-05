/**
 * VendorTeamTab.jsx
 *
 * The vendor's own users — who on their side can be assigned sections,
 * questions and remediations.
 *
 * Replaces VendorDetailPage's TeamTab (lines 1285-1343). Read-only, as that
 * one is: user creation and role changes belong to user management, which
 * enforces the invite flow, the welcome email and the tenant membership rules.
 * Duplicating a create form here would be a second path to the same rows with
 * none of that.
 *
 * ── WHY THE ROLE MATTERS MORE THAN IT LOOKS ───────────────────────────────
 * A vendor with no VENDOR_CISO cannot have sections assigned — step 5 of the
 * TPRM flow resolves its actor from that role, and an empty actor set stops
 * the workflow with a task nobody can see. Same for VENDOR_RESPONDER at step
 * 6. So this tab calls out a missing role rather than just listing what is
 * there; "no CISO" is the difference between a workflow that runs and one that
 * silently parks.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, Mail, AlertTriangle, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usersApi } from '../../api/users.api'
import { cn } from '../../lib/cn'
import { unwrapList } from './vendorShared'

const STATUS_TONE = {
  ACTIVE:    'text-status-pass-fg bg-status-pass-bg',
  SUSPENDED: 'text-status-fail-fg bg-status-fail-bg',
  INVITED:   'text-status-warn-fg bg-status-warn-bg',
  PENDING:   'text-status-warn-fg bg-status-warn-bg',
}

// The two the TPRM Tier-1 workflow resolves actors from. Not a display list —
// a missing one of these is a stalled workflow.
const REQUIRED_ROLES = [
  { name: 'VENDOR_CISO',      why: 'assigns questionnaire sections to responders (step 5)' },
  { name: 'VENDOR_RESPONDER', why: 'answers the questionnaire (step 6)' },
]

function roleNames(u) {
  return (u.roles || [])
    .map(r => r.roleName || r.name)
    .filter(Boolean)
}

export default function VendorTeamTab({ entity }) {
  const vendorId = entity?.id ?? entity?.vendorId

  const { data: raw, isLoading } = useQuery({
    queryKey: ['vendor-team', vendorId],
    queryFn:  () => usersApi.list({ side: 'VENDOR', vendorId, skip: 0, take: 50 }),
    enabled:  !!vendorId,
    staleTime: 60 * 1000,
  })

  // The endpoint paginates, so the array is under items. unwrapList handles the
  // bare and enveloped shapes; this handles the paginated one.
  const users = useMemo(() => {
    const d = raw?.data ?? raw
    if (Array.isArray(d?.items)) return d.items
    return unwrapList(raw)
  }, [raw])

  const heldRoles = useMemo(() => {
    const s = new Set()
    users.forEach(u => roleNames(u).forEach(n => s.add(n)))
    return s
  }, [users])

  const missing = REQUIRED_ROLES.filter(r => !heldRoles.has(r.name))

  if (isLoading) {
    return (
      <div className="px-4 py-8 text-center text-[11px] text-text-muted">
        Loading team…
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-overlay/40">
        <span className="text-[10px] text-text-muted">
          {users.length} vendor user{users.length === 1 ? '' : 's'}
        </span>
        <Link
          to={`/vendor/users?vendorId=${vendorId}`}
          className="flex items-center gap-1 text-[10px] text-brand-ink hover:underline"
        >
          Manage team <ExternalLink size={9} />
        </Link>
      </div>

      {/* Named before the list, because it explains an empty or stuck workflow
          and the list alone does not. */}
      {missing.length > 0 && users.length > 0 && (
        <div className="px-4 py-2.5 border-b border-status-warn-bd bg-status-warn-bg/40">
          <div className="flex items-start gap-2">
            <AlertTriangle size={12} className="text-status-warn-fg shrink-0 mt-0.5" />
            <div className="text-[10px] text-status-warn-fg">
              <p className="font-medium">
                No user holds {missing.map(m => m.name).join(' or ')}.
              </p>
              <ul className="mt-0.5 space-y-0.5 opacity-90">
                {missing.map(m => (
                  <li key={m.name}>
                    <span className="font-mono">{m.name}</span> — {m.why}
                  </li>
                ))}
              </ul>
              <p className="mt-1 opacity-80">
                The workflow will reach that step and park with no eligible
                actor. Assign the role from Manage team before starting a cycle.
              </p>
            </div>
          </div>
        </div>
      )}

      {!users.length ? (
        <div className="px-4 py-8 text-center">
          <Users size={16} className="mx-auto text-text-muted" />
          <p className="mt-2 text-[11px] text-text-muted">
            No vendor users yet.
          </p>
          <p className="mt-1 text-[10px] text-text-muted opacity-70">
            The primary contact given at onboarding becomes the first
            VENDOR_VRM once they accept their invitation.
          </p>
          <Link
            to={`/vendor/users?vendorId=${vendorId}`}
            className="mt-2 inline-flex items-center gap-1 text-[10px] text-brand-ink hover:underline"
          >
            Invite vendor users <ExternalLink size={9} />
          </Link>
        </div>
      ) : (
        <div>
          {users.map(u => {
            const id     = u.userId ?? u.id
            const names  = roleNames(u)
            const status = u.status || 'ACTIVE'
            return (
              <div
                key={id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-surface-overlay/50 transition-colors"
              >
                {/* Initials rather than an avatar service: this list is small,
                    and a broken image is worse than two letters. */}
                <span className="w-7 h-7 rounded-full bg-brand-500/10 text-brand-ink text-[10px] font-medium flex items-center justify-center shrink-0">
                  {(u.fullName || u.email || '?').slice(0, 2).toUpperCase()}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-text-primary truncate">
                      {u.fullName || u.email}
                    </span>
                    <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0',
                      STATUS_TONE[status] || 'text-text-muted bg-surface-overlay')}>
                      {status}
                    </span>
                  </div>
                  {u.email && u.fullName && (
                    <span className="flex items-center gap-1 text-[9px] text-text-muted mt-0.5">
                      <Mail size={8} /> {u.email}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* All of them, not the first two. A user's roles are what
                      decide which workflow steps can reach them, so truncating
                      the list hides the answer to "why did this not assign". */}
                  {names.length === 0 ? (
                    <span className="text-[9px] text-text-muted italic">No role</span>
                  ) : names.map(n => (
                    <span
                      key={n}
                      className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0',
                        REQUIRED_ROLES.some(r => r.name === n)
                          ? 'bg-brand-500/10 text-brand-ink'
                          : 'bg-surface-overlay text-text-muted')}
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}