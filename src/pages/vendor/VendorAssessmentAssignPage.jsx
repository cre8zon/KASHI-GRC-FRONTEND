/**
 * VendorAssessmentAssignPage — Steps 3/4/5: VRM → CISO → Responders → Contributors assignment chain.
 *
 * STEP-GATED ACCESS GUARD (NEW):
 *   Added a task ownership check at page mount, identical to VendorAssessmentFillPage.
 *   If the user navigates directly to this URL without a valid taskId in their
 *   active inbox, they are immediately redirected to /workflow/inbox.
 *
 *   This is the companion guard to the backend assertUserHasActiveTask() check
 *   in AssessmentController.getAssessment(). Both layers must agree.
 *
 * All other logic (VRMAssignView, CISOAssignView, ResponderAssignView, step routing)
 * is unchanged from the original implementation.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Users, ChevronRight, CheckCircle2,
  Loader2, UserPlus, X, Search, ArrowRight,
} from 'lucide-react'
import { assessmentsApi } from '../../api/assessments.api'
import { workflowsApi }   from '../../api/workflows.api'
import { usersApi }       from '../../api/users.api'
import { Button }         from '../../components/ui/Button'
import { Badge }          from '../../components/ui/Badge'
import { Input }          from '../../components/ui/Input'
import { Modal }          from '../../components/ui/Modal'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { cn }             from '../../lib/cn'
import { initials }       from '../../utils/format'
import { useSelector }    from 'react-redux'
import { selectAuth }     from '../../store/slices/authSlice'
import { useAccessContext, useMyTasks } from '../../hooks/useWorkflow'
import toast              from 'react-hot-toast'

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useAssessment = (id, enabled) => useQuery({
  queryKey: ['assessment-assign', id],
  queryFn:  () => assessmentsApi.vendor.get(id),
  enabled:  !!id && enabled,
})

const useVendorUsers = (search) => useQuery({
  queryKey: ['vendor-users-search', search],
  queryFn:  () => usersApi.list({ take: 20, search: search || undefined, side: 'VENDOR' }),
  enabled:  search?.length >= 2,
  staleTime: 30 * 1000,
})

function useAssignTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stepInstanceId, userId }) =>
      workflowsApi.tasks.assign(stepInstanceId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-instance'] })
      toast.success('Task assigned')
    },
    onError: (e) => toast.error(e?.message || 'Assignment failed'),
  })
}

function usePerformAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => workflowsApi.tasks.action(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      toast.success('Delegated successfully — workflow advanced')
    },
    onError: (e) => toast.error(e?.message || 'Failed'),
  })
}

// ─── User Search Picker ───────────────────────────────────────────────────────

function UserPicker({ label, value, onChange, filterRole }) {
  const [search, setSearch] = useState('')
  const [open, setOpen]     = useState(false)
  const { data: usersData } = useVendorUsers(search)
  const users = usersData?.items || []

  const select = (user) => {
    onChange(user)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</label>
      {value ? (
        <div className="flex items-center gap-2 p-2 rounded-md border border-brand-500/30 bg-brand-500/5">
          <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-brand-400">{initials(value.fullName || value.email)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">{value.fullName || '—'}</p>
            <p className="text-[10px] text-text-muted truncate">{value.email}</p>
          </div>
          <button onClick={() => onChange(null)}
            className="text-text-muted hover:text-red-400 transition-colors">
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="Search by name or email…"
            className="h-8 w-full pl-8 pr-3 rounded-md border border-border bg-surface-raised text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {open && users.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-md border border-border bg-surface shadow-lg overflow-hidden">
              {users.map(u => (
                <button key={u.id} onClick={() => select(u)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-overlay text-left transition-colors">
                  <div className="w-6 h-6 rounded-full bg-surface-overlay flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-text-muted">{initials(u.fullName || u.email)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">{u.fullName || '—'}</p>
                    <p className="text-[10px] text-text-muted truncate">{u.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Step views (logic unchanged) ─────────────────────────────────────────────

function VRMAssignView({ taskId, stepInstanceId, onDone }) {
  const [selectedUser, setSelectedUser] = useState(null)
  const [delegated, setDelegated]       = useState(null)  // who was delegated to
  const [editing, setEditing]           = useState(false)
  const { mutate: performAction, isPending } = usePerformAction()

  const handleDelegate = () => {
    if (!selectedUser) { toast.error('Select a user to delegate to'); return }
    performAction({
      taskInstanceId: parseInt(taskId),
      actionType: 'DELEGATE',
      targetUserId: selectedUser.id || selectedUser.userId,
      remarks: `Delegated to ${selectedUser.fullName || selectedUser.email}`,
    }, {
      onSuccess: () => {
        setDelegated(selectedUser)
        setEditing(false)
        onDone?.()
      }
    })
  }

  // Completed state — show who was assigned with option to reassign
  if (delegated && !editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
          <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-muted">Delegated to</p>
            <p className="text-sm font-medium text-text-primary">{delegated.fullName || delegated.email}</p>
          </div>
          <button onClick={() => setEditing(true)}
            className="text-xs text-text-muted hover:text-brand-400 px-2 py-1 rounded border border-border hover:border-brand-500/30 transition-colors">
            Change
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Select a CISO or Assessment Manager to handle this vendor assessment.
      </p>
      <UserPicker label="Assign to" value={selectedUser} onChange={setSelectedUser} />
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={handleDelegate} loading={isPending} disabled={!selectedUser}>
          Delegate
        </Button>
        {editing && (
          <Button variant="ghost" onClick={() => { setEditing(false); setSelectedUser(null) }}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

function CISOAssignView({ assessment, taskId, stepInstanceId, onDone }) {
  const [assignments, setAssignments]   = useState({})
  const [committed,   setCommitted]     = useState({})  // sections that have been successfully assigned
  const [editingSection, setEditingSection] = useState(null)
  const { mutate: assignSection, isPending } = useMutation({
    mutationFn: ({ sectionInstanceId, userId }) =>
      assessmentsApi.vendor.assignSection(assessment.assessmentId, sectionInstanceId, userId),
    onSuccess: () => toast.success('Section assigned'),
  })
  const { mutate: performAction, isPending: acting } = usePerformAction()

  const sections = assessment?.sections || []

  const handleAssign = (sectionInstanceId) => {
    const user = assignments[sectionInstanceId]
    if (!user) { toast.error('Select a user for this section first'); return }
    assignSection({ sectionInstanceId, userId: user.id || user.userId }, {
      onSuccess: () => {
        setCommitted(c => ({ ...c, [sectionInstanceId]: user }))
        setEditingSection(null)
      }
    })
  }

  const { mutate: confirmSectionAssignment, isPending: confirming } = useMutation({
    mutationFn: () => assessmentsApi.vendor.confirmAssignment(assessment.assessmentId, parseInt(taskId)),
    onSuccess: () => {
      // Compound task engine auto-approves the task asynchronously after both
      // SECTIONS_ASSIGNED and ASSIGNMENT_CONFIRMED events are processed.
      // No explicit APPROVE needed here — it would race with autoApproveTask.
      toast.success('Assignments confirmed — workflow advancing to responders')
      onDone?.()
    },
    onError: (e) => {
      toast.error(e?.message || 'Failed to confirm assignments')
    },
  })

  const handleDelegate = () => {
    const unassigned = sections.filter(s => !assignments[s.sectionInstanceId])
    if (unassigned.length > 0) {
      toast.error(`${unassigned.length} section(s) still unassigned`)
      return
    }
    confirmSectionAssignment()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Assign each section to a Responder who will coordinate answers.
      </p>
      {sections.map(section => {
        const sid = section.sectionInstanceId
        const assigned = committed[sid]
        const editing  = editingSection === sid
        return (
          <div key={sid} className="p-3 rounded-lg border border-border bg-surface-overlay/30">
            <p className="text-sm font-medium text-text-primary mb-2">{section.sectionName}</p>
            {assigned && !editing ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5 rounded bg-green-500/5 border border-green-500/20">
                  <CheckCircle2 size={12} className="text-green-400 flex-shrink-0" />
                  <span className="text-xs text-text-primary truncate">{assigned.fullName || assigned.email}</span>
                </div>
                <button onClick={() => { setEditingSection(sid); setAssignments(a => ({ ...a, [sid]: assigned })) }}
                  className="text-xs text-text-muted hover:text-brand-400 px-2 py-1 rounded border border-border hover:border-brand-500/30 flex-shrink-0 transition-colors">
                  Change
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <UserPicker
                    label=""
                    value={assignments[sid] || null}
                    onChange={user => setAssignments(a => ({ ...a, [sid]: user }))}
                  />
                </div>
                <Button size="sm" variant="secondary"
                  onClick={() => handleAssign(sid)}
                  loading={isPending}
                  disabled={!assignments[sid]}>
                  Assign
                </Button>
                {editing && (
                  <Button size="sm" variant="ghost" onClick={() => setEditingSection(null)}>
                    Cancel
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {(() => {
        const allCommitted = sections.length > 0 && sections.every(s => committed[s.sectionInstanceId])
        return (
          <Button variant="primary" onClick={handleDelegate} loading={acting}
            disabled={!allCommitted}
            title={!allCommitted ? 'Assign all sections before confirming' : ''}>
            {allCommitted ? 'Confirm all assignments' : `${Object.keys(committed).length}/${sections.length} sections assigned`}
          </Button>
        )
      })()}
    </div>
  )
}

function ResponderAssignView({ assessment, taskId, stepInstanceId, onDone }) {
  const [assignments, setAssignments] = useState({})
  const { userId } = useSelector(selectAuth)
  const { mutate: assignQuestion, isPending } = useMutation({
    mutationFn: ({ questionInstanceId, userId }) =>
      assessmentsApi.vendor.assignQuestion(assessment.assessmentId, questionInstanceId, userId),
    onSuccess: () => toast.success('Question assigned'),
  })
  const { mutate: performAction, isPending: acting } = usePerformAction()

  // Load only sections assigned to this responder
  const { data: mySectionsData } = useQuery({
    queryKey: ['my-sections', assessment?.assessmentId, userId],
    queryFn:  () => assessmentsApi.vendor.mySections(assessment.assessmentId),
    enabled:  !!assessment?.assessmentId,
  })
  const mySections = mySectionsData?.data || []

  const handleDelegate = () => {
    performAction({
      taskInstanceId: parseInt(taskId),
      actionType: 'APPROVE',
      remarks: 'Questions assigned to contributors',
    }, { onSuccess: onDone })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Assign each question in your sections to a Contributor.
      </p>
      {mySections.map(section => (
        <div key={section.sectionInstanceId}>
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
            {section.sectionName}
          </p>
          {(section.questions || []).map(q => (
            <div key={q.questionInstanceId}
              className="mb-2 p-3 rounded-lg border border-border bg-surface-overlay/30">
              <p className="text-xs text-text-primary mb-2">{q.questionText}</p>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <UserPicker
                    label=""
                    value={assignments[q.questionInstanceId] || null}
                    onChange={user => setAssignments(a => ({ ...a, [q.questionInstanceId]: user }))}
                  />
                </div>
                <Button size="sm" variant="secondary"
                  onClick={() => {
                    const user = assignments[q.questionInstanceId]
                    if (!user) { toast.error('Select a contributor'); return }
                    assignQuestion({ questionInstanceId: q.questionInstanceId, userId: user.id || user.userId })
                  }}
                  loading={isPending}
                  disabled={!assignments[q.questionInstanceId]}>
                  Assign
                </Button>
              </div>
            </div>
          ))}
        </div>
      ))}
      <Button variant="primary" onClick={handleDelegate} loading={acting}>
        Done assigning
      </Button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────


// ─── Data-driven assign view dispatcher ──────────────────────────────────────
//
// Maps stepAction + stepOrder to the correct assignment sub-view.
// No hardcoded step numbers — works for any workflow that routes to /assign.
//
// The sub-view rendered depends on the actor's role in the assignment chain:
//   ACKNOWLEDGE  → VRM confirms receipt (step 2 in TPRM)
//   ASSIGN early → VRM delegates to CISO (stepOrder 3 in TPRM)
//   ASSIGN mid   → CISO assigns to Responders (stepOrder 4)
//   ASSIGN late  → Responder assigns to Contributors (stepOrder 5+)
//   REVIEW       → fallback to approve (shouldn't reach this page for REVIEW)
//
// To add a new assignment flow: add a new condition here matching the
// stepAction/stepOrder pattern from your workflow blueprint.

/**
 * AssignViewDispatcher — picks which assignment UI to render based on the
 * actorRoleName stored on the task by the backend at task creation time.
 *
 * The backend sets actorRoleName = the DB role name that qualified this user
 * for the task (e.g. "VENDOR_VRM", "VENDOR_CISO", "VENDOR_RESPONDER").
 * The frontend never hardcodes role names — it only checks the role's "side"
 * within the assignment chain using the sideLabel the backend provides.
 *
 * Mapping is driven by which view makes sense for who is acting:
 *   - First actor in the chain (VRM-like)  → picks a single person → VRMAssignView
 *   - Second actor (CISO-like)             → assigns sections     → CISOAssignView
 *   - Third actor (Responder-like)         → assigns questions    → ResponderAssignView
 *
 * The chain position is determined by comparing actorRoleName against the
 * step's actorRoles order — but since we don't have that here, we use the
 * task's stepName prefix as a stable signal. Better: the backend passes
 * actorRoleName which the page maps via a config object defined ONCE here.
 *
 * To add a new workflow type: add an entry to ASSIGN_VIEW_MAP below.
 * No changes needed anywhere else.
 */

// Maps actorRoleName → which sub-view to render and what title to show.
// This is the ONLY place role names appear in the frontend.
// Driven entirely by the actorRoleName field the backend puts on each task.
const ASSIGN_VIEW_MAP = {
  // TPRM vendor-side roles
  VENDOR_VRM:        { view: 'VRM',       title: 'Assign Vendor CISO' },
  VENDOR_CISO:       { view: 'CISO',      title: 'Assign Sections to Responders' },
  VENDOR_RESPONDER:  { view: 'RESPONDER', title: 'Assign Questions to Contributors' },
  // Audit auditee-side roles
  AUDIT_OWNER:       { view: 'VRM',       title: 'Assign Auditee Lead' },
  AUDITEE_LEAD:      { view: 'CISO',      title: 'Assign Clubbed Controls' },
  PRIMARY_AUDITEE:   { view: 'RESPONDER', title: 'Assign Controls to Control Owners' },
  // Org-side reviewer roles
  ORG_CISO:          { view: 'CISO',      title: 'Assign Reviewers' },
  REVIEWER:          { view: 'RESPONDER', title: 'Assign Questions to Review Assistants' },
  // Auditor roles
  ORG_ADMIN:         { view: 'VRM',       title: 'Assign to Org CISO' },
  AUDITOR_I:         { view: 'CISO',      title: 'Assign Controls to Auditor II' },
}

function AssignViewDispatcher({ actorRoleName, assessment, taskId, stepInstanceId, onDone }) {
  const config = ASSIGN_VIEW_MAP[actorRoleName] || { view: 'VRM', title: 'Assign' }

  switch (config.view) {
    case 'CISO':
      return (
        <CISOAssignView assessment={assessment} taskId={taskId}
          stepInstanceId={stepInstanceId} onDone={onDone} />
      )
    case 'RESPONDER':
      return (
        <ResponderAssignView assessment={assessment} taskId={taskId}
          stepInstanceId={stepInstanceId} onDone={onDone} />
      )
    case 'VRM':
    default:
      return <VRMAssignView taskId={taskId} stepInstanceId={stepInstanceId} onDone={onDone} />
  }
}

export default function VendorAssessmentAssignPage() {
  const { id }         = useParams()
  const navigate       = useNavigate()
  const [urlParams]    = useSearchParams()
  const { userId }     = useSelector(selectAuth)

  // ── Source of truth: live task from inbox ─────────────────────────────────
  // URL params (taskId, stepInstanceId) can be stale if the workflow was
  // cancelled and restarted — the old stepInstanceId belongs to a terminated
  // run and accessContext will return COMPLETED/DENIED for it.
  //
  // Strategy: always look up the PENDING task for this artifact (assessmentId)
  // from the live myTasks list. If found, use those IDs. If not, fall back to
  // URL params so observer / completed views still work.
  const { data: myTasksData, isLoading: tasksLoading } = useMyTasks({})
  const myTasks = Array.isArray(myTasksData) ? myTasksData : (myTasksData?.items ?? [])

  // Find the active (PENDING) task for this artifact.
  // A user can have BOTH an ASSIGNER task (coordinator) and an ACTOR task (does the work)
  // for the same artifact at the same time. Always prefer the ACTOR task — it is the one
  // that drives the assignment UI and whose approval advances the step.
  // Fall back to ASSIGNER task only if no ACTOR task exists (pure coordinator role).
  const actorTask    = myTasks.find(t =>
    (t.status === 'PENDING' || t.status === 'IN_PROGRESS') &&
    String(t.artifactId) === String(id) &&
    t.taskRole === 'ACTOR'
  ) || null
  const assignerTask = myTasks.find(t =>
    (t.status === 'PENDING' || t.status === 'IN_PROGRESS') &&
    String(t.artifactId) === String(id) &&
    t.taskRole === 'ASSIGNER'
  ) || null
  const activeTask = actorTask || assignerTask

  // Resolved IDs — prefer live task, fall back to URL params
  const taskId         = activeTask ? String(activeTask.id)              : urlParams.get('taskId')
  const stepInstanceId = activeTask ? String(activeTask.stepInstanceId)  : urlParams.get('stepInstanceId')
  const actorRoleName  = activeTask?.actorRoleName || null
  // If this is an ASSIGNER task on a REVIEW step, redirect to review page.
  // This happens when assignerNavKey=vendor_assessment_assign for step 5.
  const stepAction = activeTask?.resolvedStepAction || null

  // ── Access context ────────────────────────────────────────────────────────
  const { data: access, isLoading: accessLoading } =
    useAccessContext(stepInstanceId, taskId ? Number(taskId) : undefined)

  // Assessment data
  const { data: assessmentData, isLoading: assessmentLoading } = useAssessment(id, true)
  const assessment = assessmentData

  const onDone = () => navigate('/workflow/inbox')

  const isLoading = tasksLoading || accessLoading || assessmentLoading

  // ALL hooks must be called before any early returns — Rules of Hooks.
  // useEffect is a hook, so it must come before the isLoading/access early returns.
  useEffect(() => {
    if (!isLoading && access && !access.canView) {
      navigate('/workflow/inbox', { replace: true })
    }
  }, [isLoading, access, navigate])

  // Redirect ASSIGNER tasks on REVIEW steps to the responder review page.
  // Step 5 has assignerNavKey=vendor_assessment_assign in the CSV but the
  // coordinator should see the review page, not the assign page.
  useEffect(() => {
    if (!tasksLoading && activeTask && stepAction === 'REVIEW') {
      navigate(
        `/vendor/assessments/${id}/responder-review?taskId=${taskId}&stepInstanceId=${stepInstanceId}`,
        { replace: true }
      )
    }
  }, [tasksLoading, activeTask, stepAction, id, taskId, stepInstanceId, navigate])

  // Early returns AFTER all hooks ──────────────────────────────────────────
  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={24} className="animate-spin text-text-muted" />
    </div>
  )

  if (access && !access.canView) return null

  if (!assessment) return (
    <div className="p-6 text-center text-text-muted text-sm">
      Assessment not found or you do not have access.
    </div>
  )

  return (
    <div className="min-h-screen bg-background-tertiary">
      {/* Header */}
      <div className="bg-surface border-b border-border px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)}
          className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-text-primary truncate">
            {assessment.templateName || 'Assessment'}
          </h1>
          <p className="text-xs text-text-muted">
            {assessment.vendorName}
            {taskId && <> · Task #{taskId}</>}
          </p>
        </div>
        {/* Access mode badge */}
        {access.mode === 'OBSERVER' && (
          <span className="text-[10px] font-medium px-2 py-1 rounded bg-purple-500/10 text-purple-400">
            Observer
          </span>
        )}
        {access.mode === 'COMPLETED' && (
          <span className="text-[10px] font-medium px-2 py-1 rounded bg-green-500/10 text-green-400">
            Completed
          </span>
        )}
      </div>

      {/* Observer / completed banner */}
      {(access.mode === 'OBSERVER' || access.mode === 'COMPLETED') && access.reason && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="px-4 py-2.5 rounded-lg border border-border bg-surface-overlay text-xs text-text-muted">
            {access.reason}
          </div>
        </div>
      )}

      {/* Assignment form */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Card>
          <CardHeader title={(ASSIGN_VIEW_MAP[actorRoleName] || { title: 'Assignment' }).title} />
          <CardBody>
            {access.mode === 'EDIT' ? (
              <AssignViewDispatcher
                actorRoleName={actorRoleName}
                assessment={assessment}
                taskId={taskId}
                stepInstanceId={stepInstanceId}
                onDone={onDone}
              />
            ) : (
              // OBSERVER or COMPLETED — read-only summary
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">
                  {access.mode === 'COMPLETED'
                    ? 'This step has been completed. The assignments made are shown below.'
                    : 'You have read-only access to this step.'}
                </p>
                <div className="px-3 py-2 rounded-md border border-border bg-surface-raised text-xs text-text-muted">
                  Step status: <span className="text-text-primary font-medium">{access.stepStatus}</span>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}