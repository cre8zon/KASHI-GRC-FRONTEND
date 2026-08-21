/**
 * TenantSync — makes the auditor's organisation follow their work.
 *
 * ── THE PROBLEM ─────────────────────────────────────────────────────────────
 * An external auditor's task inbox is cross-tenant: TaskInstance has no tenant
 * column and /v1/workflows/my-tasks queries by assigned user, so a lead auditor
 * at a firm sees tasks from every client in one list. Opening one navigates to
 * /module/audit_engagement/99, but the session is still pointed at the firm, so
 * every request on that page carries the firm's tenant and the engagement comes
 * back forbidden.
 *
 * The user is then told the server is down, on a task the platform itself put
 * in their inbox. The information needed to get this right — which tenant owns
 * the task — was known at the moment the link was rendered and simply was not
 * carried.
 *
 * ── THE FIX ─────────────────────────────────────────────────────────────────
 * Task links carry ?t=<tenantId>. This component reads it and, when it differs
 * from the active session, performs the switch before the page's queries run.
 * The user lands where they clicked, in the right context, having pressed
 * nothing extra.
 *
 * ── WHY IT IS SAFE TO ACT ON A URL PARAMETER ────────────────────────────────
 * It is not a privilege grant. The switch endpoint reissues a token only for a
 * membership the caller actually holds, and every request is re-checked
 * server-side against user_tenant_memberships. A ?t= naming a tenant the user
 * has no membership in fails there, exactly as a manual switch to it would.
 * The check below against auth.memberships is therefore a courtesy — it avoids
 * a pointless round trip and a confusing toast, not a security boundary.
 *
 * ── WHY IT RENDERS A BLOCKER WHILE SWITCHING ────────────────────────────────
 * The switch clears the React Query cache and replaces the token. Letting the
 * page render mid-flight means child queries fire against the outgoing tenant,
 * fail, and populate error states that survive the switch — the user would see
 * the same "could not load" they were meant to be spared, then a page that
 * silently works on retry.
 */
import { useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useSwitchTenant } from '../../hooks/useAuth'
import { useMyTasks } from '../../hooks/useWorkflow'

export function TenantSync({ children }) {
  const [searchParams] = useSearchParams()
  const activeTenantId = useSelector(s => s.auth.tenantId)
  const memberships    = useSelector(s => s.auth.memberships) || []
  const switchTenant   = useSwitchTenant({ silent: true })

  // ── Where the target tenant comes from ──────────────────────────────────
  // 1. ?t= on the route, written by TaskInbox / TaskDetailPage when they know
  //    the task belongs elsewhere.
  // 2. Failing that, ?taskId= — resolved against the cross-tenant inbox.
  //
  // (2) exists because (1) only covers links built after this shipped. A
  // bookmarked URL, a restored app tab, a link pasted into chat, or a
  // notification deep-link all arrive with a taskId and no ?t=, and the user
  // should not have to know which of their ten clients the task belongs to —
  // the platform already knows, because it put the task in their inbox.
  //
  // scope ALL is the same query the inbox uses, so this is usually a warm cache
  // read rather than a request. It is enabled only when there is a taskId and no
  // ?t=, so ordinary navigation never triggers it.
  const requested   = searchParams.get('t')
  const taskIdParam = searchParams.get('taskId')
  const needsLookup = !requested && !!taskIdParam

  const { data: allTasks } = useMyTasks({ scope: 'ALL', enabled: needsLookup })

  const resolvedFromTask = useMemo(() => {
    if (!needsLookup) return null
    const list = Array.isArray(allTasks) ? allTasks : (allTasks?.data ?? allTasks?.items ?? [])
    const hit  = list.find(t => String(t.taskInstanceId ?? t.id) === String(taskIdParam))
    return hit?.tenantId ?? null
  }, [needsLookup, allTasks, taskIdParam])

  const target = requested ? Number(requested)
               : (resolvedFromTask != null ? Number(resolvedFromTask) : null)
  const needsSwitch =
    target != null &&
    Number.isFinite(target) &&
    activeTenantId != null &&
    target !== Number(activeTenantId)

  // A ref, not state: two renders can observe needsSwitch before the mutation
  // resolves, and firing switch-tenant twice reissues two tokens and clears the
  // cache under the first one's in-flight queries.
  const firedFor = useRef(null)

  useEffect(() => {
    if (!needsSwitch) return
    if (firedFor.current === target) return

    const allowed = memberships.some(m => Number(m.tenantId) === target)
    if (!allowed) return   // server would refuse; let the page 403 and explain

    firedFor.current = target
    switchTenant.mutate(target)
  }, [needsSwitch, target, memberships]) // eslint-disable-line

  if (needsSwitch) {
    const name = memberships.find(m => Number(m.tenantId) === target)?.tenantName
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <div className="w-8 h-8 rounded-full border-2 border-border border-t-brand-500 animate-spin" />
        <p className="text-sm text-text-secondary">
          Opening in {name || 'the client organisation'}…
        </p>
        <p className="text-xs text-text-muted max-w-xs">
          This task belongs to another organisation, so your workspace is switching to it.
        </p>
      </div>
    )
  }

  return children
}