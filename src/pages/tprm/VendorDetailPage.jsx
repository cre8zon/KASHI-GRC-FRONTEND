import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import {
  ArrowLeft, Shield, Clock, AlertCircle, CheckCircle2,
  Mail, RefreshCw, FileText, ChevronDown, ChevronRight,
  UserPlus, BarChart2, XCircle,
} from 'lucide-react'
import { useVendor }                         from '../../hooks/useVendors'
import { useScreenConfig, useScreenActions } from '../../hooks/useUIConfig'
import { useWorkflowProgress }               from '../../hooks/useWorkflow'
import { useWorkflowInstanceSocket, useArtifactSocket } from '../../hooks/useWorkflowSocket'
import { Card, CardHeader, CardBody }        from '../../components/ui/Card'
import { Badge, DynamicBadge }               from '../../components/ui/Badge'
import { DynamicActionBar }                  from '../../components/ui/Button'
import { WorkflowTimeline }                  from '../../components/workflow/WorkflowTimeline'
import { Button }                            from '../../components/ui/Button'
import { cn }                                from '../../lib/cn'
import { PageSkeleton }                      from '../../components/ui/EmptyState'
import { Modal, ConfirmDialog }              from '../../components/ui/Modal'
import { Input }                             from '../../components/ui/Input'
import { formatDate, formatRiskScore }       from '../../utils/format'
import { vendorsApi }                        from '../../api/vendors.api'
import { assessmentsApi }                    from '../../api/assessments.api'
import { authApi }                           from '../../api/auth.api'
import { usersApi }                          from '../../api/users.api'
import { workflowsApi }                      from '../../api/workflows.api'
import api                                   from '../../config/axios.config'
import { useSelector }                       from 'react-redux'
import { selectAuth }                        from '../../store/slices/authSlice'
import toast                                 from 'react-hot-toast'
import { useComments }                       from '../../hooks/useComments'
import { CommentFeed }                       from '../../components/comments/CommentFeed'

// ─── Constants ────────────────────────────────────────────────────────────────
const ASSESSMENT_STATUS_COLOR = {
  ASSIGNED:    'amber',
  IN_PROGRESS: 'blue',
  SUBMITTED:   'purple',
  REVIEWED:    'cyan',
  COMPLETED:   'green',
  REJECTED:    'red',
  CANCELLED:   'gray',
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
const useActiveWorkflows = () => useQuery({
  queryKey: ['active-workflows'],
  queryFn:  () => workflowsApi.blueprints.list({ skip: 0, take: 100 }),
  staleTime: 5 * 60 * 1000,
})

const useVendorAssessments = (vendorId) => useQuery({
  queryKey: ['vendor-assessments', vendorId],
  queryFn:  () => vendorsApi.assessments(vendorId),
  enabled:  !!vendorId,
  staleTime: 2 * 60 * 1000,
})

// Fetch risk→template mappings to show which tier applies to this vendor's score
const useRiskMappings = () => useQuery({
  queryKey: ['risk-mappings'],
  queryFn:  () => assessmentsApi.riskMappings.list(),
  staleTime: 10 * 60 * 1000,
})

// Cancel a stale VendorAssessment and close its cycle
function useCancelAssessment(vendorId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assessmentId) =>
      assessmentsApi.vendor.cancel(
        assessmentId,
        'Cancelled via vendor detail page — stale assessment'
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-assessments', vendorId] })
      qc.invalidateQueries({ queryKey: ['vendors', vendorId] })
      toast.success('Stale assessment cancelled and cycle closed')
    },
    onError: (e) => toast.error(e?.message || 'Failed to cancel assessment'),
  })
}

// ─── Setup step pill ──────────────────────────────────────────────────────────
function SetupStep({ done, label }) {
  return (
    <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-medium ${
      done
        ? 'bg-green-500/10 border-green-500/20 text-green-400'
        : 'bg-surface-overlay border-border text-text-muted'
    }`}>
      {done ? <CheckCircle2 size={9} /> : <AlertCircle size={9} />}
      {label}
    </span>
  )
}

// ─── Create VRM User Modal ────────────────────────────────────────────────────
function CreateVrmModal({ open, onClose, vendor, onCreated }) {
  const { tenantId } = useSelector(selectAuth)
  const [form, setForm] = useState({
    firstName: '',
    lastName:  '',
    email:     vendor?.primaryContactEmail || '',
    jobTitle:  '',
  })
  const [errors,   setErrors]   = useState({})
  const [creating, setCreating] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e = {}
    if (!form.firstName.trim()) e.firstName = 'Required'
    if (!form.lastName.trim())  e.lastName  = 'Required'
    if (!form.email.trim())     e.email     = 'Required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email'
    setErrors(e)
    return !Object.keys(e).length
  }

  const handleCreate = async () => {
    if (!validate()) return
    setCreating(true)
    try {
      await usersApi.invite({
        firstName:        form.firstName,
        lastName:         form.lastName,
        email:            form.email,
        jobTitle:         form.jobTitle || undefined,
        tenantId,
        vendorId:         vendor.vendorId,
        defaultRoleName:  'VENDOR_VRM',
        sendWelcomeEmail: true,
      })
      toast.success(`VRM user created — welcome email sent to ${form.email}`)
      onCreated?.()
      onClose()
    } catch (e) {
      toast.error(e?.message || 'Failed to create VRM user')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create VRM User"
      subtitle="Creates a VENDOR_VRM account and sends a welcome email with temporary password"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={creating} onClick={handleCreate}>
            Create & Send Invite
          </Button>
        </div>
      }>
      <div className="flex flex-col gap-4">
        <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg flex items-start gap-2">
          <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-text-muted">
            This person will be assigned the{' '}
            <span className="text-amber-400 font-medium">VENDOR_VRM</span> role and linked
            to <span className="text-text-secondary font-medium">{vendor?.name}</span>.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="First Name *" value={form.firstName}
            onChange={e => set('firstName', e.target.value)} error={errors.firstName} />
          <Input label="Last Name *" value={form.lastName}
            onChange={e => set('lastName', e.target.value)} error={errors.lastName} />
        </div>
        <Input label="Work Email *" type="email" value={form.email}
          onChange={e => set('email', e.target.value)} error={errors.email} />
        <Input label="Job Title" value={form.jobTitle}
          onChange={e => set('jobTitle', e.target.value)}
          placeholder="e.g. Head of Risk & Compliance" />
      </div>
    </Modal>
  )
}

// ─── Vendor Setup Panel ───────────────────────────────────────────────────────
// COMPLETELY UNCHANGED from original source — do not modify.
// setup panel and the assessments card share the same handler/state.
function VendorSetupPanel({ vendor, onRefresh }) {
  const qc                              = useQueryClient()
  const { data: workflowData }          = useActiveWorkflows()
  const [expanded, setExpanded]         = useState(true)
  const [selectedWfId, setSelectedWfId] = useState('')
  const [showCreateVrm, setShowCreateVrm] = useState(false)
  const [resending,  setResending]      = useState(false)
  const [restarting, setRestarting]     = useState(false)

  const activeWorkflows = (workflowData?.items || [])
    .filter(w => (w.isActive ?? w.active) && w.entityType === 'VENDOR')

  const hasVrm      = !!vendor.vrmUserId
  // hasWorkflow is true only when the workflow instance is actively running.
  // A CANCELLED instance still has an id on the cycle — check status explicitly.
  const hasWorkflow = !!vendor.activeWorkflowInstanceId &&
    ['IN_PROGRESS', 'ON_HOLD', 'PENDING'].includes(vendor.workflowInstanceStatus)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['vendors', String(vendor.vendorId)] })
    qc.invalidateQueries({ queryKey: ['vendors'] })
    qc.invalidateQueries({ queryKey: ['vendor-assessments', String(vendor.vendorId)] })
    onRefresh?.()
  }

  const handleResendVRM = async () => {
    setResending(true)
    try {
      await authApi.resendInvitation({
        userId:    vendor.vrmUserId,
        email:     vendor.primaryContactEmail,
        sendEmail: true,
      })
      toast.success(`Invitation resent to ${vendor.primaryContactEmail}`)
    } catch (e) {
      toast.error(e?.message || 'Failed to resend invitation')
    } finally {
      setResending(false)
    }
  }

  const handleRestartWorkflow = async () => {
    if (!selectedWfId) { toast.error('Select a workflow first'); return }
    setRestarting(true)
    try {
      await vendorsApi.restartWorkflow(vendor.vendorId, parseInt(selectedWfId))
      toast.success('Workflow started — assessment will be created automatically')
      // Invalidate all vendor queries and force immediate refetch of parent vendor data.
      // The parent VendorDetailPage holds vendor.workflowInstanceStatus which controls
      // whether this setup panel shows — it must refetch to pick up the new IN_PROGRESS state.
      await qc.invalidateQueries({ queryKey: ['vendors'] })
      await qc.refetchQueries({ queryKey: ['vendors', String(vendor.vendorId)] })
      await qc.invalidateQueries({ queryKey: ['vendor-assessments', String(vendor.vendorId)] })
    } catch (e) {
      toast.error(e?.message || 'Failed to start workflow')
    } finally {
      setRestarting(false)
    }
  }

  if (hasVrm && hasWorkflow) return null

  return (
    <>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
        <button onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-500/5 transition-colors">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
              Vendor Setup Incomplete
            </span>
            <div className="flex items-center gap-1.5 ml-2">
              <SetupStep done={hasVrm}      label="VRM User" />
              <SetupStep done={hasWorkflow} label="Workflow"  />
            </div>
          </div>
          {expanded
            ? <ChevronDown  size={13} className="text-amber-400/60" />
            : <ChevronRight size={13} className="text-amber-400/60" />}
        </button>

        {expanded && (
          <div className="px-4 pb-4 flex flex-col border-t border-amber-500/20">

            {/* Step 1: VRM User */}
            <div className="flex items-start justify-between py-3 gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <UserPlus size={12} className="text-brand-400 shrink-0" />
                  {hasVrm ? 'VRM User Created' : 'Create VRM User'}
                  {hasVrm && (
                    <span className="text-[10px] text-green-400 font-normal">
                      ✓ User #{vendor.vrmUserId}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {hasVrm
                    ? `VRM account exists for ${vendor.primaryContactEmail}.`
                    : `Create a VENDOR_VRM account for ${vendor.primaryContactEmail || 'the primary contact'}.`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasVrm && (
                  <Button size="sm" variant="ghost" icon={Mail}
                    loading={resending} onClick={handleResendVRM}>
                    Resend Email
                  </Button>
                )}
                {!hasVrm && (
                  <Button size="sm" variant="secondary" icon={UserPlus}
                    onClick={() => setShowCreateVrm(true)}>
                    Create VRM User
                  </Button>
                )}
              </div>
            </div>

            {/* Step 2: Workflow */}
            <div className="flex items-start justify-between py-3 gap-4 border-t border-amber-500/10">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <RefreshCw size={12} className="text-brand-400 shrink-0" />
                  {hasWorkflow ? 'Workflow Running' : 'Start Workflow'}
                  {hasWorkflow && (
                    <span className="text-[10px] text-green-400 font-normal">
                      ✓ Instance #{vendor.activeWorkflowInstanceId}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {hasWorkflow
                    ? 'TPRM workflow is active — assessment created automatically.'
                    : 'Start the TPRM workflow. The assessment template will be instantiated automatically.'}
                </p>
                {!hasWorkflow && (
                  <select value={selectedWfId} onChange={e => setSelectedWfId(e.target.value)}
                    className="mt-2 h-7 w-full max-w-xs rounded-md border border-border bg-surface-raised px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500">
                    <option value="">Select workflow…</option>
                    {activeWorkflows.map(w => (
                      <option key={w.id} value={w.id}>{w.name} (v{w.version})</option>
                    ))}
                  </select>
                )}
              </div>
              {!hasWorkflow && (
                <Button size="sm" variant="secondary" icon={RefreshCw}
                  loading={restarting} onClick={handleRestartWorkflow} className="shrink-0">
                  Start
                </Button>
              )}
            </div>


          </div>
        )}
      </div>

      <CreateVrmModal open={showCreateVrm} onClose={() => setShowCreateVrm(false)}
        vendor={vendor} onCreated={invalidate} />
    </>
  )
}

// ─── Assessment Panel ─────────────────────────────────────────────────────────
//
// CHANGED from original:
//   1. Accepts vendorRiskScore prop — resolves which risk mapping tier applies
//      and shows it on each assessment card as a small score-range badge.
//      When no assessment exists yet, shows which template tier will be assigned.
//   2. Filters out CANCELLED assessments (stale from Cancel & Restart).
//   3. Red × button on ASSIGNED/IN_PROGRESS cards to cancel stale assessments
//      directly from this page (calls PATCH /v1/assessments/{id}/cancel).

function AssessmentPanel({ vendorId, vendorRiskScore }) {
  const { data: allAssessments = [], isLoading }            = useVendorAssessments(vendorId)
  const { data: riskMappings   = [] }                       = useRiskMappings()
  const { mutate: cancelAssessment, isPending: cancelling } = useCancelAssessment(vendorId)
  const [cancelTarget, setCancelTarget]                     = useState(null)

  // Which mapping tier matches the vendor's current risk score
  const matchingMapping = vendorRiskScore != null
    ? riskMappings.find(m =>
        vendorRiskScore >= parseFloat(m.minScore) &&
        vendorRiskScore <= parseFloat(m.maxScore)
      )
    : null

  // Exclude CANCELLED — stale assessments from Cancel & Restart
  const assessments = allAssessments.filter(a => a.status !== 'CANCELLED')

  if (isLoading) return (
    <div className="space-y-2">
      {[1, 2].map(i => (
        <div key={i} className="h-16 rounded-lg bg-surface-overlay animate-pulse" />
      ))}
    </div>
  )

  if (!assessments.length) return (
    <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
      <FileText size={20} className="text-text-muted" />
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs text-text-muted">No assessments instantiated yet.</p>
        {matchingMapping && (
          <p className="text-[11px] text-text-muted">
            Risk score{' '}
            <span className="font-mono text-text-primary">{vendorRiskScore}</span>
            {' '}falls in the{' '}
            <span className="text-amber-400 font-medium">
              {matchingMapping.tierLabel || `${matchingMapping.minScore}–${matchingMapping.maxScore}`}
            </span>
            {' '}tier — that template will be assigned on trigger.
          </p>
        )}
      </div>

    </div>
  )

  return (
    <>
      <div className="flex flex-col gap-2">
        {assessments.map(a => {
          const pct     = a.progress?.percentComplete ?? 0
          const isStale = ['ASSIGNED', 'IN_PROGRESS'].includes(a.status)

          // Match this assessment's template to a risk mapping to show the tier
          const mapping = riskMappings.find(
            m => String(m.templateId) === String(a.templateId)
          )

          return (
            <div key={a.assessmentId}
              className="rounded-lg border border-border bg-surface-raised p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">
                    {a.templateName || `Assessment #${a.assessmentId}`}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-[10px] text-text-muted font-mono">
                      ID #{a.assessmentId}
                      {a.submittedAt && ` · Submitted ${formatDate(a.submittedAt)}`}
                    </p>
                    {/* Risk tier chip — shows which score range triggered this template */}
                    {mapping?.tierLabel && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                        {mapping.tierLabel}
                        <span className="ml-1 text-amber-400/60 font-normal">
                          {mapping.minScore}–{mapping.maxScore}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    value={a.status}
                    label={a.status}
                    colorTag={ASSESSMENT_STATUS_COLOR[a.status] || 'gray'}
                  />
                  {/* Cancel stale — only for non-terminal assessments no longer
                      backed by an active workflow instance */}
                  {isStale && (
                    <button
                      onClick={() => setCancelTarget(a)}
                      title="Cancel this stale assessment and close its cycle"
                      className="h-5 w-5 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <XCircle size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-muted">
                    {a.progress?.answered ?? 0} / {a.progress?.totalQuestions ?? 0} questions
                  </span>
                  <span className="text-[10px] font-mono font-medium text-brand-400">{pct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface-overlay overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        loading={cancelling}
        title="Cancel stale assessment"
        variant="danger"
        confirmLabel="Cancel assessment"
        message={
          cancelTarget
            ? `Cancel assessment #${cancelTarget.assessmentId} ` +
              `("${cancelTarget.templateName || 'Assessment'}")? ` +
              `This marks it CANCELLED and closes its cycle so a fresh one can be started. ` +
              `The template snapshot is preserved for audit. This cannot be undone.`
            : ''
        }
        onConfirm={() =>
          cancelAssessment(cancelTarget.assessmentId, {
            onSuccess: () => setCancelTarget(null),
          })
        }
      />
    </>
  )
}

// ─── Sections Status Panel ────────────────────────────────────────────────────
function SectionsStatusPanel({ assessmentId }) {
  const qc = useQueryClient()
  const { data: sectionsData, isLoading } = useQuery({
    queryKey: ['sections-status', assessmentId],
    queryFn:  () => assessmentsApi.vendor.sectionsStatus(assessmentId),
    enabled:  !!assessmentId,
  })
  const { mutate: reopen, isPending: reopening } = useMutation({
    mutationFn: (sectionInstanceId) => assessmentsApi.vendor.reopenSection(assessmentId, sectionInstanceId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sections-status', assessmentId] }); toast.success('Section reopened') },
    onError: (e) => toast.error(e?.message || 'Failed to reopen section'),
  })

  const sections = Array.isArray(sectionsData) ? sectionsData : (sectionsData?.data || [])
  if (isLoading) return <div className="h-32 animate-pulse bg-surface-overlay rounded" />
  if (!sections.length) return <p className="text-xs text-text-muted text-center py-4">No sections assigned yet.</p>

  return (
    <div className="space-y-2">
      {sections.map(s => (
        <div key={s.sectionInstanceId} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-surface-raised">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">{s.sectionName}</p>
            <p className="text-[10px] text-text-muted mt-0.5">{s.assignedUserName ? `→ ${s.assignedUserName}` : 'Unassigned'}</p>
          </div>
          {s.submittedAt ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">Submitted</span>
              <button onClick={() => reopen(s.sectionInstanceId)} disabled={reopening}
                className="text-[10px] text-text-muted hover:text-brand-400 px-1.5 py-0.5 rounded border border-border hover:border-brand-500/30 transition-colors">
                Reopen
              </button>
            </div>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex-shrink-0">
              {s.assignedUserId ? 'In progress' : 'Unassigned'}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Assessment Activity Feed ─────────────────────────────────────────────────
function AssessmentActivityFeed({ assessmentId }) {
  const { comments, isLoading, addComment, adding } = useComments(
    'ASSESSMENT', assessmentId, { enabled: !!assessmentId }
  )
  return (
    <CommentFeed
      comments={comments}
      isLoading={isLoading}
      addComment={addComment}
      adding={adding}
      canEdit={true}
      showVisibility={true}
      emptyMessage="No activity yet. Leave a note for collaborators."
    />
  )
}

// ─── Workflow Instance Panel ──────────────────────────────────────────────────
function WorkflowInstancePanel({ instanceId, assessmentId }) {
  const [tab, setTab] = useState('timeline')
  const { data: progress, isLoading } = useWorkflowProgress(instanceId)

  return (
    <div>
      <div className="flex gap-1 mb-3 border-b border-border">
        {[
          { id: 'timeline',  label: 'Timeline'  },
          { id: 'sections',  label: 'Sections'  },
          { id: 'activity',  label: 'Activity'  },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'text-xs px-3 py-1.5 border-b-2 transition-colors',
              tab === t.id ? 'border-brand-500 text-brand-400 font-medium' : 'border-transparent text-text-muted hover:text-text-secondary'
            )}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'timeline' && (isLoading ? <div className="h-32 animate-pulse bg-surface-overlay rounded" /> : <WorkflowTimeline progress={progress} />)}
      {tab === 'sections' && assessmentId  && <SectionsStatusPanel assessmentId={assessmentId} />}
      {tab === 'sections' && !assessmentId && <p className="text-xs text-text-muted text-center py-4">Assessment not started yet.</p>}
      {tab === 'activity' && assessmentId  && <AssessmentActivityFeed assessmentId={assessmentId} />}
      {tab === 'activity' && !assessmentId && <p className="text-xs text-text-muted text-center py-4">Activity available once assessment starts.</p>}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VendorDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  // ── All hooks must be called before any early return ──────────────
  const { data: vendor, isLoading, refetch } = useVendor(id)

  // Real-time workflow updates — invalidates progress + vendor data automatically
  useWorkflowInstanceSocket(vendor?.activeWorkflowInstanceId, { showToasts: true })
  const { data: screenConfig }     = useScreenConfig('vendor_detail')
  const { data: actions = [] }     = useScreenActions('vendor_detail', vendor?.status)
  const { data: assessments = [] } = useVendorAssessments(id)
  const activeAssessment   = assessments.find(a => a.status !== 'CANCELLED' && a.status !== 'COMPLETED')
  const activeAssessmentId = activeAssessment?.assessmentId ?? null
  const [confirmAction, setConfirmAction]    = useState(null)
  const [actioning,  setActioning]           = useState(false)
  // ── Shared invalidation ──────────────────────────────────────────
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['vendors', id] })
    qc.invalidateQueries({ queryKey: ['vendors'] })
    qc.invalidateQueries({ queryKey: ['vendor-assessments', id] })
    refetch()
  }


  // ── Generic DB-driven action executor ────────────────────────────
  const handleAction = (action) => {
    if (action.requiresConfirmation) setConfirmAction(action)
    else executeAction(action)
  }

  const executeAction = (action) => {
    if (!action.apiEndpoint) return
    const url    = action.apiEndpoint.replace('{id}', id)
    const method = (action.httpMethod || 'POST').toLowerCase()
    let payload  = {}
    try { payload = action.payloadTemplateJson ? JSON.parse(action.payloadTemplateJson) : {} } catch {}
    setActioning(true)
    api[method](url, Object.keys(payload).length ? payload : undefined)
      .then(() => {
        setConfirmAction(null)
        toast.success(`${action.label} completed`)
        invalidateAll()
      })
      .catch(e => toast.error(e?.message || `${action.label} failed`))
      .finally(() => setActioning(false))
  }

  // ── Early returns after all hooks ────────────────────────────────
  if (isLoading) return <PageSkeleton />
  if (!vendor)   return <div className="p-6 text-text-muted">Vendor not found</div>

  // Setup complete once VRM user exists and workflow is actively running.
  // workflowInstanceStatus is checked explicitly so a CANCELLED workflow instance
  // (which still has an id on the cycle record) correctly shows the setup panel.
  const workflowActive = vendor.activeWorkflowInstanceId &&
    ['IN_PROGRESS', 'ON_HOLD', 'PENDING'].includes(vendor.workflowInstanceStatus)

  const setupIncomplete = !vendor.vrmUserId || !workflowActive

  return (
    <div className="p-6 space-y-4 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" icon={ArrowLeft}
            onClick={() => navigate('/tprm/vendors')}>Back</Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-text-primary">{vendor.name}</h1>
              <DynamicBadge value={vendor.status}
                componentKey="vendor_status" config={screenConfig} />
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              {vendor.legalName} · {vendor.industry} · {vendor.country}
            </p>
          </div>
        </div>
        <DynamicActionBar actions={actions} onAction={handleAction} entityId={id} />
      </div>

      {/* Setup panel — shown when any step is incomplete */}
      {setupIncomplete && (
        <VendorSetupPanel
          vendor={vendor}
          onRefresh={refetch}
        />
      )}

      <div className="grid grid-cols-12 gap-4">

        {/* Risk Score */}
        <div className="col-span-3">
          <Card className="gradient-border">
            <CardBody>
              <div className="flex items-center gap-2 mb-3">
                <Shield size={14} className="text-brand-400" />
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  Risk Score
                </span>
              </div>
              <p className="font-mono text-4xl font-bold text-text-primary tabular-nums">
                {formatRiskScore(vendor.currentRiskScore)}
              </p>
              <DynamicBadge value={vendor.riskClassification}
                componentKey="vendor_risk_classification"
                config={screenConfig} className="mt-2" />
            </CardBody>
          </Card>
        </div>

        {/* Vendor Details */}
        <div className="col-span-5">
          <Card>
            <CardHeader title="Vendor Details" />
            <CardBody className="grid grid-cols-2 gap-y-3 gap-x-4">
              {[
                { label: 'Registration',  value: vendor.registrationNumber },
                { label: 'Website',       value: vendor.website },
                { label: 'Contact Email', value: vendor.primaryContactEmail },
                { label: 'Data Access',   value: vendor.dataAccessLevel },
                { label: 'Criticality',   value: vendor.criticality },
                { label: 'Onboarded',     value: formatDate(vendor.createdAt) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                    {label}
                  </p>
                  <p className="text-sm text-text-primary mt-0.5 truncate">{value || '—'}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        {/* Workflow Status */}
        <div className="col-span-4">
          <Card>
            <CardHeader title="Workflow Status" icon={Clock} />
            <CardBody>
              {vendor.activeWorkflowInstanceId
                ? <WorkflowInstancePanel instanceId={vendor.activeWorkflowInstanceId} assessmentId={activeAssessmentId} />
                : (
                  <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                    <AlertCircle size={20} className="text-text-muted" />
                    <p className="text-xs text-text-muted">
                      No active workflow.<br />Use the setup panel above.
                    </p>
                  </div>
                )
              }
            </CardBody>
          </Card>
        </div>

      </div>

      {/* Assessments — full width */}
      <Card>
        <CardHeader
          title="Assessments"
          subtitle={`Cycle ${vendor.currentCycleNo ?? 1} — Risk score ${vendor.currentRiskScore ?? '—'}`}
          actions={<BarChart2 size={14} className="text-text-muted" />}
        />
        <CardBody>
          <AssessmentPanel
            vendorId={id}
            vendorRiskScore={vendor.currentRiskScore}
          />
        </CardBody>
      </Card>

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => executeAction(confirmAction)}
        title={confirmAction?.label}
        message={confirmAction?.confirmationMessage || 'Are you sure?'}
        confirmLabel={confirmAction?.label}
        variant={confirmAction?.variant === 'danger' ? 'danger' : 'primary'}
        loading={actioning}
      />
    </div>
  )
}