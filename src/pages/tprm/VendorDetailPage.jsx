import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import {
  ArrowLeft, Shield, Clock, AlertCircle, CheckCircle2,
  Mail, RefreshCw, FileText, ChevronDown, ChevronRight,
  UserPlus, BarChart2, XCircle, Users, Activity,
  Building2, Globe, Layers, GitBranch, Package,
  ExternalLink, AlertTriangle, TrendingUp, Check,
} from 'lucide-react'
import { useVendor }                         from '../../hooks/useVendors'
import { useScreenConfig, useScreenActions } from '../../hooks/useUIConfig'
import { useWorkflowProgress }               from '../../hooks/useWorkflow'
import { useWorkflowInstanceSocket }         from '../../hooks/useWorkflowSocket'
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
import { actionItemsApi }                    from '../../api/actionItems.api'
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

const ACTION_ITEM_STATUS_COLOR = {
  OPEN:        'red',
  IN_PROGRESS: 'amber',
  RESOLVED:    'green',
  DISMISSED:   'gray',
}

const TABS = [
  { id: 'overview',    label: 'Overview',    icon: Building2  },
  { id: 'workflow',    label: 'Workflow',    icon: GitBranch  },
  { id: 'assessments', label: 'Assessments', icon: FileText   },
  { id: 'team',        label: 'Team',        icon: Users      },
  { id: 'contracts',   label: 'Contracts',   icon: Package    },
  { id: 'actions',     label: 'Action Items',icon: AlertTriangle },
]

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

const useRiskMappings = () => useQuery({
  queryKey: ['risk-mappings'],
  queryFn:  () => assessmentsApi.riskMappings.list(),
  staleTime: 10 * 60 * 1000,
})

const useVendorUsers = (vendorId) => useQuery({
  queryKey: ['vendor-users', vendorId],
  queryFn:  () => usersApi.list({ side: 'VENDOR', vendorId, skip: 0, take: 50 }),
  enabled:  !!vendorId,
  staleTime: 2 * 60 * 1000,
})

const useVendorContracts = (vendorId) => useQuery({
  queryKey: ['vendor-contracts', vendorId],
  queryFn:  () => vendorsApi.contracts.list(vendorId),
  enabled:  !!vendorId,
  staleTime: 2 * 60 * 1000,
})

const useVendorActionItems = (vendorId) => useQuery({
  queryKey: ['vendor-action-items', vendorId],
  queryFn:  () => actionItemsApi.forEntity('VENDOR', vendorId),
  enabled:  !!vendorId,
  staleTime: 2 * 60 * 1000,
})

function useCancelAssessment(vendorId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (assessmentId) =>
      assessmentsApi.vendor.cancel(assessmentId, 'Cancelled via vendor detail page — stale assessment'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-assessments', vendorId] })
      qc.invalidateQueries({ queryKey: ['vendors', vendorId] })
      toast.success('Assessment cancelled')
    },
    onError: (e) => toast.error(e?.message || 'Failed to cancel assessment'),
  })
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SetupStep({ done, label }) {
  return (
    <span className={cn(
      'flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-medium',
      done
        ? 'bg-green-500/10 border-green-500/20 text-green-400'
        : 'bg-surface-overlay border-border text-text-muted'
    )}>
      {done ? <CheckCircle2 size={9} /> : <AlertCircle size={9} />}
      {label}
    </span>
  )
}

function StatCard({ icon: Icon, label, value, sub, accent = 'brand' }) {
  const accentClasses = {
    brand:  'text-brand-400 bg-brand-500/10',
    red:    'text-red-400 bg-red-500/10',
    green:  'text-green-400 bg-green-500/10',
    amber:  'text-amber-400 bg-amber-500/10',
  }
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4 flex items-center gap-3">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', accentClasses[accent])}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-text-primary tabular-nums leading-tight">{value ?? '—'}</p>
        {sub && <p className="text-[10px] text-text-muted">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Create VRM User Modal ────────────────────────────────────────────────────
function CreateVrmModal({ open, onClose, vendor, onCreated }) {
  const { tenantId } = useSelector(selectAuth)
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: vendor?.primaryContactEmail || '', jobTitle: '',
  })
  const [errors, setErrors] = useState({})
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
        firstName: form.firstName, lastName: form.lastName,
        email: form.email, jobTitle: form.jobTitle || undefined,
        tenantId, vendorId: vendor.vendorId,
        defaultRoleName: 'VENDOR_VRM', sendWelcomeEmail: true,
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
      subtitle="Creates a VENDOR_VRM account and sends a welcome email"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={creating} onClick={handleCreate}>Create & Send Invite</Button>
        </div>
      }>
      <div className="flex flex-col gap-4">
        <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg flex items-start gap-2">
          <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-text-muted">
            This person will be assigned the{' '}
            <span className="text-amber-400 font-medium">VENDOR_VRM</span> role and linked to{' '}
            <span className="text-text-secondary font-medium">{vendor?.name}</span>.
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

// ─── Setup Banner ─────────────────────────────────────────────────────────────
function VendorSetupBanner({ vendor, onRefresh }) {
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
      await authApi.resendInvitation({ userId: vendor.vrmUserId, email: vendor.primaryContactEmail, sendEmail: true })
      toast.success(`Invitation resent to ${vendor.primaryContactEmail}`)
    } catch (e) { toast.error(e?.message || 'Failed to resend invitation') }
    finally { setResending(false) }
  }

  const handleRestartWorkflow = async () => {
    if (!selectedWfId) { toast.error('Select a workflow first'); return }
    setRestarting(true)
    try {
      await vendorsApi.restartWorkflow(vendor.vendorId, parseInt(selectedWfId))
      toast.success('Workflow started')
    } catch (e) {
      const code = e?.response?.data?.error?.code || e?.response?.data?.code
      if (code === 'ASSESSMENT_ALREADY_INSTANTIATED') {
        // The previous call timed out on the frontend but succeeded on the backend.
        // The workflow IS running — just refetch silently and let the banner hide itself.
        toast.success('Workflow is already running — refreshing…')
      } else {
        toast.error(e?.response?.data?.error?.message || e?.message || 'Failed to start workflow')
        return
      }
    } finally {
      // Always refetch regardless of success/already-running so the UI catches up
      await qc.invalidateQueries({ queryKey: ['vendors'] })
      await qc.refetchQueries({ queryKey: ['vendors', String(vendor.vendorId)] })
      await qc.invalidateQueries({ queryKey: ['vendor-assessments', String(vendor.vendorId)] })
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
          {expanded ? <ChevronDown size={13} className="text-amber-400/60" /> : <ChevronRight size={13} className="text-amber-400/60" />}
        </button>

        {expanded && (
          <div className="px-4 pb-4 flex flex-col border-t border-amber-500/20">
            <div className="flex items-start justify-between py-3 gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <UserPlus size={12} className="text-brand-400 shrink-0" />
                  {hasVrm ? 'VRM User Created' : 'Create VRM User'}
                  {hasVrm && <span className="text-[10px] text-green-400 font-normal">✓ User #{vendor.vrmUserId}</span>}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {hasVrm
                    ? `VRM account exists for ${vendor.primaryContactEmail}.`
                    : `Create a VENDOR_VRM account for ${vendor.primaryContactEmail || 'the primary contact'}.`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasVrm && <Button size="sm" variant="ghost" icon={Mail} loading={resending} onClick={handleResendVRM}>Resend Email</Button>}
                {!hasVrm && <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setShowCreateVrm(true)}>Create VRM User</Button>}
              </div>
            </div>
            <div className="flex items-start justify-between py-3 gap-4 border-t border-amber-500/10">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <RefreshCw size={12} className="text-brand-400 shrink-0" />
                  {hasWorkflow ? 'Workflow Running' : 'Start Workflow'}
                  {hasWorkflow && <span className="text-[10px] text-green-400 font-normal">✓ Instance #{vendor.activeWorkflowInstanceId}</span>}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {hasWorkflow
                    ? 'TPRM workflow is active.'
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
      <CreateVrmModal open={showCreateVrm} onClose={() => setShowCreateVrm(false)} vendor={vendor} onCreated={invalidate} />
    </>
  )
}

// ─── TAB: Overview ────────────────────────────────────────────────────────────
function OverviewTab({ vendor, screenConfig, assessments, actionItems }) {
  const active  = assessments.filter(a => a.status !== 'CANCELLED' && a.status !== 'COMPLETED').length
  const openAIs = (Array.isArray(actionItems) ? actionItems : actionItems?.data || [])
    .filter(ai => ai.status === 'OPEN' || ai.status === 'IN_PROGRESS').length

  return (
    <div className="space-y-6">
      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Shield}       label="Risk Score"          value={formatRiskScore(vendor.currentRiskScore)} sub={vendor.riskClassification} accent="brand" />
        <StatCard icon={FileText}     label="Active Assessments"  value={active}   sub="in progress" accent="amber" />
        <StatCard icon={AlertTriangle} label="Open Action Items"  value={openAIs}  sub="require attention" accent={openAIs > 0 ? 'red' : 'green'} />
        <StatCard icon={TrendingUp}   label="Cycle"               value={vendor.currentCycleNo ?? 1} sub="current assessment cycle" accent="brand" />
      </div>

      {/* Details grid */}
      <Card>
        <CardHeader title="Vendor Details" icon={Building2} />
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
            {[
              { label: 'Legal Name',       value: vendor.legalName },
              { label: 'Registration No.', value: vendor.registrationNumber },
              { label: 'Industry',         value: vendor.industry },
              { label: 'Country',          value: vendor.country },
              { label: 'Criticality',      value: vendor.criticality },
              { label: 'Data Access',      value: vendor.dataAccessLevel },
              { label: 'Contact Email',    value: vendor.primaryContactEmail },
              { label: 'Website',          value: vendor.website, isLink: true },
              { label: 'Onboarded',        value: formatDate(vendor.createdAt) },
            ].map(({ label, value, isLink }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-0.5">{label}</p>
                {isLink && value
                  ? <a href={value} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-brand-400 hover:underline flex items-center gap-1 truncate">
                      {value} <ExternalLink size={10} className="shrink-0" />
                    </a>
                  : <p className="text-sm text-text-primary truncate">{value || '—'}</p>
                }
              </div>
            ))}
          </div>
          {vendor.servicesProvided && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Services Provided</p>
              <p className="text-sm text-text-secondary">{vendor.servicesProvided}</p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

// ─── Task status helpers ──────────────────────────────────────────────────────
const TASK_STATUS_STYLE = {
  PENDING:    { label: 'Pending',    cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  APPROVED:   { label: 'Approved',   cls: 'bg-green-500/10 text-green-400 border-green-500/20' },
  REJECTED:   { label: 'Rejected',   cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  DELEGATED:  { label: 'Delegated',  cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  REASSIGNED: { label: 'Reassigned', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  EXPIRED:    { label: 'Expired',    cls: 'bg-surface-overlay text-text-muted border-border' },
  IN_PROGRESS:{ label: 'In Progress',cls: 'bg-brand-500/10 text-brand-400 border-brand-500/20' },
}

// ─── Assessment Phase definitions ────────────────────────────────────────────
// Maps workflow step order ranges → a named phase with description.
// Derived from the 14-step blueprint (steps 1-8 vendor, 9-14 org).
// Phase is "current" when the active workflow step falls within its range.
const ASSESSMENT_PHASES = [
  {
    id: 'setup',
    label: 'Setup',
    description: 'Assessment template instantiated, VRM acknowledged',
    stepRange: [1, 2],
    assessmentStatuses: ['ASSIGNED'],
  },
  {
    id: 'assignment',
    label: 'Assignment',
    description: 'VRM delegates to Vendor CISO, sections assigned to responders',
    stepRange: [3, 5],
    assessmentStatuses: ['IN_PROGRESS'],
  },
  {
    id: 'filling',
    label: 'Evidence Collection',
    description: 'Contributors uploading evidence and filling questions',
    stepRange: [6, 6],
    assessmentStatuses: ['IN_PROGRESS'],
  },
  {
    id: 'vendor_review',
    label: 'Vendor Review',
    description: 'Responders reviewing answers, CISO submitting assessment',
    stepRange: [7, 8],
    assessmentStatuses: ['IN_PROGRESS', 'SUBMITTED'],
  },
  {
    id: 'org_review',
    label: 'Org Review',
    description: 'Org CISO delegates, reviewers assess responses',
    stepRange: [9, 13],
    assessmentStatuses: ['SUBMITTED', 'UNDER_REVIEW'],
  },
  {
    id: 'final_approval',
    label: 'Final Approval',
    description: 'Org CISO final sign-off and risk rating',
    stepRange: [14, 14],
    assessmentStatuses: ['UNDER_REVIEW'],
  },
  {
    id: 'report',
    label: 'Report Generated',
    description: 'Assessment report generated, cycle completed',
    stepRange: [15, 99],
    assessmentStatuses: ['COMPLETED'],
  },
]

// Determine which phase is active/done based on assessment status + current step order
function resolvePhase(assessmentStatus, currentStepOrder) {
  if (assessmentStatus === 'COMPLETED') return { activePhaseId: 'report', doneAll: true }
  if (assessmentStatus === 'CANCELLED') return { activePhaseId: null, cancelled: true }
  if (!currentStepOrder) return { activePhaseId: 'setup' }

  for (let i = ASSESSMENT_PHASES.length - 1; i >= 0; i--) {
    const p = ASSESSMENT_PHASES[i]
    if (currentStepOrder >= p.stepRange[0] && currentStepOrder <= p.stepRange[1]) {
      return { activePhaseId: p.id }
    }
  }
  return { activePhaseId: ASSESSMENT_PHASES[0].id }
}

// ─── Phase tracker bar ────────────────────────────────────────────────────────
function AssessmentPhaseTracker({ assessmentStatus, currentStepOrder }) {
  const { activePhaseId, doneAll, cancelled } = resolvePhase(assessmentStatus, currentStepOrder)

  if (cancelled) return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-overlay border border-border">
      <XCircle size={13} className="text-text-muted shrink-0" />
      <span className="text-xs text-text-muted">Assessment cancelled</span>
    </div>
  )

  let hitActive = false

  return (
    <div className="w-full">
      {/* Step pills — horizontal scroll on small viewports */}
      <div className="flex items-center gap-0 overflow-x-auto pb-1">
        {ASSESSMENT_PHASES.map((phase, idx) => {
          const isActive = phase.id === activePhaseId
          const isDone   = !isActive && !hitActive
          if (isActive) hitActive = true

          const isFuture = hitActive && !isActive && !isDone
          const isLast   = idx === ASSESSMENT_PHASES.length - 1

          return (
            <div key={phase.id} className="flex items-center shrink-0">
              {/* Phase node */}
              <div className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-center min-w-[90px] transition-colors',
                isActive ? 'bg-brand-500/10 border-brand-500/40'
                  : isDone  ? 'bg-green-500/5 border-green-500/20'
                  : 'bg-surface-raised border-border opacity-50'
              )}>
                {/* Status dot */}
                <div className={cn(
                  'w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                  isActive ? 'bg-brand-500'
                    : isDone  ? 'bg-green-500'
                    : 'bg-border'
                )}>
                  {isDone && <Check size={9} className="text-white" />}
                  {isActive && <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                </div>
                <span className={cn(
                  'text-[9px] font-semibold uppercase tracking-wide leading-tight',
                  isActive ? 'text-brand-400'
                    : isDone  ? 'text-green-400'
                    : 'text-text-muted'
                )}>
                  {phase.label}
                </span>
              </div>
              {/* Connector */}
              {!isLast && (
                <div className={cn(
                  'h-px w-4 shrink-0',
                  isDone ? 'bg-green-500/40' : 'bg-border'
                )} />
              )}
            </div>
          )
        })}
      </div>
      {/* Current phase description */}
      {activePhaseId && (
        <p className="text-[11px] text-text-muted mt-2 pl-1">
          {doneAll ? '✓ Assessment complete' : ASSESSMENT_PHASES.find(p => p.id === activePhaseId)?.description}
        </p>
      )}
    </div>
  )
}

// ─── Section accordion inside assessment detail ───────────────────────────────
function AssessmentSectionAccordion({ sections = [] }) {
  const [openId, setOpenId] = useState(null)

  if (!sections.length) return (
    <p className="text-xs text-text-muted text-center py-4">No sections yet.</p>
  )

  return (
    <div className="space-y-1.5">
      {sections.map(s => {
        const isOpen    = openId === s.sectionInstanceId
        const answered  = s.questions?.filter(q => q.response != null || q.hasResponse).length ?? 0
        const total     = s.questions?.length ?? 0
        const pct       = total > 0 ? Math.round((answered / total) * 100) : 0
        const submitted = !!s.submittedAt

        return (
          <div key={s.sectionInstanceId}
            className={cn(
              'rounded-lg border transition-colors overflow-hidden',
              isOpen ? 'border-brand-500/30' : 'border-border'
            )}>
            {/* Section header — always visible */}
            <button
              onClick={() => setOpenId(isOpen ? null : s.sectionInstanceId)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-overlay transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-text-primary truncate">{s.sectionName}</span>
                  {submitted
                    ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-semibold">Submitted</span>
                    : total > 0
                      ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">In progress</span>
                      : <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted border border-border">Unstarted</span>
                  }
                </div>
                {s.assignedUserName && (
                  <p className="text-[10px] text-text-muted mt-0.5">→ {s.assignedUserName}</p>
                )}
              </div>
              {/* Mini progress */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono text-text-muted">{answered}/{total}</span>
                <div className="w-16 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                  <div className={cn(
                    'h-full rounded-full transition-all',
                    submitted ? 'bg-green-500' : 'bg-brand-500'
                  )} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] font-mono text-brand-400">{pct}%</span>
                {isOpen ? <ChevronDown size={11} className="text-text-muted" /> : <ChevronRight size={11} className="text-text-muted" />}
              </div>
            </button>

            {/* Expanded: question list */}
            {isOpen && total > 0 && (
              <div className="border-t border-border divide-y divide-border/50">
                {s.questions.map((q, qi) => {
                  const hasResp = q.response != null || q.hasResponse
                  const verdict = q.reviewVerdict // PASS / PARTIAL / FAIL
                  const verdictStyle = verdict === 'PASS'    ? 'text-green-400'
                                     : verdict === 'PARTIAL' ? 'text-amber-400'
                                     : verdict === 'FAIL'    ? 'text-red-400'
                                     : null
                  return (
                    <div key={q.questionInstanceId}
                      className="flex items-start gap-3 px-4 py-2.5 text-xs">
                      <span className="text-[10px] font-mono text-text-muted shrink-0 w-5 mt-0.5">
                        {qi + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'leading-snug',
                          hasResp ? 'text-text-primary' : 'text-text-muted'
                        )}>
                          {q.questionText}
                        </p>
                        {q.responseType && (
                          <span className="text-[9px] text-text-muted font-mono uppercase">{q.responseType}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {q.isMandatory && (
                          <span className="text-[9px] text-red-400/70">*</span>
                        )}
                        {verdictStyle && (
                          <span className={cn('text-[9px] font-semibold', verdictStyle)}>{verdict}</span>
                        )}
                        <div className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          hasResp ? 'bg-green-500' : 'bg-border'
                        )} title={hasResp ? 'Answered' : 'Unanswered'} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {isOpen && total === 0 && (
              <div className="border-t border-border px-4 py-3">
                <p className="text-xs text-text-muted">No questions in this section.</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Full assessment detail card (expandable) ─────────────────────────────────
function AssessmentDetailCard({ assessment, riskMappings, onCancel, workflowProgress }) {
  const [expanded, setExpanded] = useState(false)

  // Fetch full assessment detail (with sections + questions) only when expanded
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['assessment-detail', assessment.assessmentId],
    queryFn:  () => assessmentsApi.vendor.get(assessment.assessmentId),
    enabled:  expanded,
    staleTime: 60 * 1000,
  })

  const pct     = assessment.progress?.percentComplete ?? 0
  const isStale = ['ASSIGNED', 'IN_PROGRESS'].includes(assessment.status)
  const mapping = riskMappings.find(m => String(m.templateId) === String(assessment.templateId))

  // Resolve current step order from workflow progress for the phase tracker
  const summary = Array.isArray(workflowProgress) ? workflowProgress[0] : workflowProgress
  const currentStepOrder = summary?.steps
    ?.find(s => s.isCurrentStep)?.stepOrder ?? null

  const sections = detail?.sections ?? []

  return (
    <div className={cn(
      'rounded-lg border transition-colors overflow-hidden',
      expanded ? 'border-brand-500/30' : 'border-border'
    )}>
      {/* Card header */}
      {/* Card header — click content area to expand, separate cancel button */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(e => !e)}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">
              {assessment.templateName || `Assessment #${assessment.assessmentId}`}
            </span>
            <Badge value={assessment.status} label={assessment.status}
              colorTag={ASSESSMENT_STATUS_COLOR[assessment.status] || 'gray'} />
            {mapping?.tierLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                {mapping.tierLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap text-[10px] text-text-muted">
            <span className="font-mono">ID #{assessment.assessmentId}</span>
            {assessment.submittedAt && <span>Submitted {formatDate(assessment.submittedAt)}</span>}
          </div>
          {/* Progress bar */}
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
              <div className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] font-mono text-brand-400 shrink-0">{pct}%</span>
            <span className="text-[10px] text-text-muted shrink-0">
              {assessment.progress?.answered ?? 0}/{assessment.progress?.totalQuestions ?? 0} answered
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isStale && (
            <button onClick={() => onCancel(assessment)}
              title="Cancel stale assessment"
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <XCircle size={14} />
            </button>
          )}
          <button onClick={() => setExpanded(e => !e)}
            className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-secondary transition-colors">
            {expanded
              ? <ChevronDown size={14} />
              : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-5 bg-surface-raised/30">

          {/* Phase tracker */}
          <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
              Assessment Phase
            </p>
            <AssessmentPhaseTracker
              assessmentStatus={assessment.status}
              currentStepOrder={currentStepOrder}
            />
          </div>

          {/* Progress stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Questions',    value: assessment.progress?.totalQuestions ?? 0 },
              { label: 'Answered',           value: assessment.progress?.answered ?? 0 },
              { label: 'Mandatory',          value: assessment.progress?.mandatoryQuestions ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-center">
                <p className="text-[10px] text-text-muted">{label}</p>
                <p className="text-lg font-bold text-text-primary tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {/* Sections */}
          <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
              Sections & Questions
            </p>
            {detailLoading
              ? <div className="space-y-1.5">
                  {[1,2,3].map(i => <div key={i} className="h-10 rounded-lg bg-surface-overlay animate-pulse" />)}
                </div>
              : <AssessmentSectionAccordion sections={sections} />
            }
          </div>

        </div>
      )}
    </div>
  )
}

// ─── TAB: Assessments ─────────────────────────────────────────────────────────
function AssessmentsTab({ vendorId, vendorRiskScore, workflowProgress }) {
  const { data: allAssessments = [], isLoading } = useVendorAssessments(vendorId)
  const { data: riskMappings   = [] }            = useRiskMappings()
  const { mutate: cancelAssessment, isPending: cancelling } = useCancelAssessment(vendorId)
  const [cancelTarget, setCancelTarget] = useState(null)

  const matchingMapping = vendorRiskScore != null
    ? riskMappings.find(m =>
        vendorRiskScore >= parseFloat(m.minScore) &&
        vendorRiskScore <= parseFloat(m.maxScore))
    : null

  const assessments = allAssessments.filter(a => a.status !== 'CANCELLED')

  if (isLoading) return (
    <div className="space-y-3">
      {[1, 2].map(i => <div key={i} className="h-20 rounded-lg bg-surface-overlay animate-pulse" />)}
    </div>
  )

  return (
    <>
      {/* Risk tier banner */}
      {matchingMapping && (
        <div className="mb-4 px-3 py-2.5 rounded-lg border border-border bg-surface-raised flex items-center gap-3">
          <Shield size={13} className="text-brand-400 shrink-0" />
          <p className="text-xs text-text-muted">
            Risk score{' '}
            <span className="font-mono text-text-primary">{vendorRiskScore}</span>
            {' → '}
            <span className="text-amber-400 font-medium">{matchingMapping.tierLabel}</span>
            {' '}tier ({matchingMapping.minScore}–{matchingMapping.maxScore})
          </p>
        </div>
      )}

      {!assessments.length ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
          <FileText size={24} className="text-text-muted" />
          <p className="text-sm text-text-muted">No assessments instantiated yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map(a => (
            <AssessmentDetailCard
              key={a.assessmentId}
              assessment={a}
              riskMappings={riskMappings}
              workflowProgress={workflowProgress}
              onCancel={setCancelTarget}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        loading={cancelling}
        title="Cancel stale assessment"
        variant="danger"
        confirmLabel="Cancel assessment"
        message={cancelTarget
          ? `Cancel assessment #${cancelTarget.assessmentId}? This marks it CANCELLED and closes its cycle. Cannot be undone.`
          : ''}
        onConfirm={() =>
          cancelAssessment(cancelTarget.assessmentId, {
            onSuccess: () => setCancelTarget(null),
          })
        }
      />
    </>
  )
}

// ─── Sections status panel (used in WorkflowTab) ──────────────────────────────
function SectionsStatusPanel({ assessmentId }) {
  const qc = useQueryClient()
  const { data: sectionsData, isLoading } = useQuery({
    queryKey: ['sections-status', assessmentId],
    queryFn:  () => assessmentsApi.vendor.sectionsStatus(assessmentId),
    enabled:  !!assessmentId,
  })
  const { mutate: reopen, isPending: reopening } = useMutation({
    mutationFn: (sectionInstanceId) => assessmentsApi.vendor.reopenSection(assessmentId, sectionInstanceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sections-status', assessmentId] })
      toast.success('Section reopened')
    },
    onError: (e) => toast.error(e?.message || 'Failed to reopen section'),
  })

  const sections = Array.isArray(sectionsData) ? sectionsData : (sectionsData?.data || [])
  if (isLoading) return <div className="h-32 animate-pulse bg-surface-overlay rounded" />
  if (!sections.length) return <p className="text-xs text-text-muted text-center py-4">No sections assigned yet.</p>

  return (
    <div className="space-y-2">
      {sections.map(s => (
        <div key={s.sectionInstanceId}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-surface-raised">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">{s.sectionName}</p>
            <p className="text-[10px] text-text-muted mt-0.5">
              {s.assignedUserName ? `→ ${s.assignedUserName}` : 'Unassigned'}
            </p>
          </div>
          {s.submittedAt ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                Submitted
              </span>
              <button onClick={() => reopen(s.sectionInstanceId)} disabled={reopening}
                className="text-[10px] text-text-muted hover:text-brand-400 px-1.5 py-0.5 rounded border border-border hover:border-brand-500/30 transition-colors">
                Reopen
              </button>
            </div>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              {s.assignedUserId ? 'In progress' : 'Unassigned'}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── TAB: Workflow ────────────────────────────────────────────────────────────
function WorkflowTab({ vendor, activeAssessmentId, progressData }) {
  const [subTab, setSubTab] = useState('timeline')
  const { data: fetched, isLoading } = useWorkflowProgress(progressData ? null : vendor?.activeWorkflowInstanceId)
  const progress = progressData ?? fetched
  const { comments, isLoading: commentsLoading, addComment, adding } = useComments(
    'ASSESSMENT', activeAssessmentId, { enabled: !!activeAssessmentId }
  )

  const SUB_TABS = [
    { id: 'timeline', label: 'Timeline' },
    { id: 'tasks',    label: 'Tasks'    },
    { id: 'sections', label: 'Sections' },
    { id: 'activity', label: 'Activity' },
  ]

  if (!vendor.activeWorkflowInstanceId) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <GitBranch size={28} className="text-text-muted" />
      <p className="text-sm text-text-muted">No active workflow.</p>
      <p className="text-xs text-text-muted">Use the setup banner to start one.</p>
    </div>
  )

  const summary = Array.isArray(progress) ? progress[0] : progress
  const steps   = summary?.steps ?? []

  // Flatten all tasks from all visited steps, newest first
  const allTasks = steps
    .filter(s => s.visited)
    .flatMap(s => {
      const latestIter = s.iterations?.[s.iterations.length - 1]
      return (latestIter?.tasks ?? []).map(t => ({
        ...t,
        stepName:  s.stepName,
        stepOrder: s.stepOrder,
        side:      s.side,
      }))
    })
    .sort((a, b) => {
      // Active/pending first, then by stepOrder desc
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1
      if (b.status === 'PENDING' && a.status !== 'PENDING') return  1
      return (b.stepOrder ?? 0) - (a.stepOrder ?? 0)
    })

  return (
    <Card>
      <CardHeader title="Workflow" icon={GitBranch}
        subtitle={`Instance #${vendor.activeWorkflowInstanceId} · ${summary?.instanceStatus ?? ''}`} />
      <CardBody>
        {/* Sub-tab bar */}
        <div className="flex gap-1 mb-4 border-b border-border">
          {SUB_TABS.map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className={cn(
                'text-xs px-3 py-2 border-b-2 -mb-px transition-colors',
                subTab === t.id
                  ? 'border-brand-500 text-brand-400 font-medium'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Timeline — original component, untouched */}
        {subTab === 'timeline' && (
          isLoading
            ? <div className="h-40 animate-pulse bg-surface-overlay rounded" />
            : <WorkflowTimeline progress={progress} />
        )}

        {/* Tasks — flat list of all tasks across visited steps */}
        {subTab === 'tasks' && (
          isLoading
            ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 animate-pulse bg-surface-overlay rounded-lg" />)}</div>
            : allTasks.length === 0
              ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                  <CheckCircle2 size={22} className="text-text-muted" />
                  <p className="text-xs text-text-muted">No tasks generated yet.</p>
                </div>
              )
              : (
                <div className="space-y-2">
                  {allTasks.map(task => {
                    const style = TASK_STATUS_STYLE[task.status] || TASK_STATUS_STYLE.PENDING
                    const isCoordinator = task.taskRole === 'ASSIGNER'
                    return (
                      <div key={task.taskId}
                        className={cn(
                          'flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors',
                          style.cls,
                          isCoordinator && 'opacity-60'
                        )}>
                        {/* Avatar */}
                        <div className={cn(
                          'w-7 h-7 rounded-full border flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5',
                          isCoordinator
                            ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                            : 'bg-surface-overlay border-border text-text-secondary'
                        )}>
                          {(task.assignedUserName || '?').slice(0, 2).toUpperCase()}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-text-primary">
                              {task.assignedUserName}
                            </span>
                            {task.delegatedToName && (
                              <span className="text-[10px] text-text-muted">
                                → {task.delegatedToName}
                              </span>
                            )}
                            {isCoordinator && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
                                coordinator
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-text-muted mt-0.5">
                            <span className="font-mono">{task.stepOrder}.</span>{' '}
                            {task.stepName}
                            {task.side && (
                              <span className={cn(
                                'ml-1.5 text-[9px] font-medium',
                                task.side === 'VENDOR' ? 'text-purple-400' : 'text-blue-400'
                              )}>
                                · {task.side === 'ORGANIZATION' ? 'Org' : 'Vendor'}
                              </span>
                            )}
                          </p>
                          {task.actedAt && (
                            <p className="text-[10px] text-text-muted mt-0.5">
                              {style.label} {formatDate(task.actedAt)}
                            </p>
                          )}
                          {task.remarks && (
                            <p className="text-[10px] text-text-muted mt-0.5 italic truncate">
                              "{task.remarks}"
                            </p>
                          )}
                        </div>

                        {/* Status badge */}
                        <span className={cn(
                          'text-[9px] font-semibold px-1.5 py-0.5 rounded border shrink-0',
                          style.cls
                        )}>
                          {style.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
        )}

        {subTab === 'sections' && (
          activeAssessmentId
            ? <SectionsStatusPanel assessmentId={activeAssessmentId} />
            : <p className="text-xs text-text-muted text-center py-6">Assessment not started yet.</p>
        )}

        {subTab === 'activity' && (
          activeAssessmentId
            ? <CommentFeed comments={comments} isLoading={commentsLoading}
                addComment={addComment} adding={adding}
                canEdit showVisibility
                emptyMessage="No activity yet. Leave a note for collaborators." />
            : <p className="text-xs text-text-muted text-center py-6">Activity available once assessment starts.</p>
        )}
      </CardBody>
    </Card>
  )
}

// ─── TAB: Team ────────────────────────────────────────────────────────────────
function TeamTab({ vendorId, vendor }) {
  const { data, isLoading } = useVendorUsers(vendorId)
  const users = data?.items || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">{users.length} team member{users.length !== 1 ? 's' : ''}</p>
        <Link
          to={`/vendor/users?vendorId=${vendorId}`}
          className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors">
          Manage Team <ExternalLink size={11} />
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-14 rounded-lg bg-surface-overlay animate-pulse" />)}
        </div>
      ) : !users.length ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Users size={24} className="text-text-muted" />
          <p className="text-sm text-text-muted">No vendor team members yet.</p>
          <Link to={`/vendor/users?vendorId=${vendorId}`}
            className="text-xs text-brand-400 hover:underline mt-1">
            Invite vendor users →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.userId || u.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-surface-raised">
              <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-brand-400">
                  {(u.fullName || u.email || '?').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary truncate">{u.fullName || '—'}</p>
                <p className="text-[10px] text-text-muted truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(u.roles || []).slice(0, 2).map(r => (
                  <span key={r.id || r.roleId}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-mono">
                    {r.roleName || r.name}
                  </span>
                ))}
                <Badge value={u.status} label={u.status}
                  colorTag={u.status === 'ACTIVE' ? 'green' : u.status === 'SUSPENDED' ? 'red' : 'amber'} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── TAB: Contracts ───────────────────────────────────────────────────────────
function ContractsTab({ vendorId }) {
  const { data, isLoading } = useVendorContracts(vendorId)
  const contracts = Array.isArray(data) ? data : (data?.data || data?.items || [])

  const statusColor = { ACTIVE: 'green', EXPIRED: 'red', PENDING: 'amber', TERMINATED: 'gray' }

  if (isLoading) return (
    <div className="space-y-2">
      {[1,2].map(i => <div key={i} className="h-16 rounded-lg bg-surface-overlay animate-pulse" />)}
    </div>
  )

  if (!contracts.length) return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
      <Package size={24} className="text-text-muted" />
      <p className="text-sm text-text-muted">No contracts on file.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {contracts.map(c => (
        <div key={c.contractId}
          className="rounded-lg border border-border bg-surface-raised p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">
                {c.contractType || 'Contract'}{' '}
                {c.contractNumber && <span className="font-mono text-text-muted text-xs">#{c.contractNumber}</span>}
              </p>
              <div className="flex items-center gap-3 mt-1 flex-wrap text-[10px] text-text-muted">
                {c.startDate  && <span>Start: {formatDate(c.startDate)}</span>}
                {c.endDate    && <span>End: {formatDate(c.endDate)}</span>}
                {c.renewalDate && <span className="text-amber-400">Renewal: {formatDate(c.renewalDate)}</span>}
                {c.contractValue && <span className="text-text-secondary font-medium">{c.contractValue}</span>}
              </div>
            </div>
            <Badge value={c.status} label={c.status}
              colorTag={statusColor[c.status] || 'gray'} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── TAB: Action Items ────────────────────────────────────────────────────────
function ActionItemsTab({ vendorId }) {
  const { data, isLoading } = useVendorActionItems(vendorId)
  const items = Array.isArray(data) ? data : (data?.data || data?.items || [])

  if (isLoading) return (
    <div className="space-y-2">
      {[1,2,3].map(i => <div key={i} className="h-14 rounded-lg bg-surface-overlay animate-pulse" />)}
    </div>
  )

  if (!items.length) return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
      <CheckCircle2 size={24} className="text-green-400" />
      <p className="text-sm text-text-muted">No action items — all clear.</p>
    </div>
  )

  const priorityColor = { CRITICAL: 'red', HIGH: 'red', MEDIUM: 'amber', LOW: 'blue' }

  return (
    <div className="space-y-2">
      {items.map(ai => (
        <div key={ai.id}
          className="rounded-lg border border-border bg-surface-raised px-4 py-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-text-primary truncate">{ai.title}</p>
            {ai.description && <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{ai.description}</p>}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {ai.dueAt && (
                <span className="text-[10px] text-text-muted flex items-center gap-1">
                  <Clock size={9} /> Due {formatDate(ai.dueAt)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {ai.priority && (
              <Badge value={ai.priority} label={ai.priority}
                colorTag={priorityColor[ai.priority] || 'gray'} />
            )}
            <Badge value={ai.status} label={ai.status}
              colorTag={ACTION_ITEM_STATUS_COLOR[ai.status] || 'gray'} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VendorDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const { data: vendor, isLoading, refetch } = useVendor(id)
  const [activeTab, setActiveTab] = useState('overview')

  useWorkflowInstanceSocket(vendor?.activeWorkflowInstanceId, { showToasts: true })

  const { data: screenConfig }          = useScreenConfig('vendor_detail')
  const { data: actions = [] }          = useScreenActions('vendor_detail', vendor?.status)
  const { data: assessments = [] }      = useVendorAssessments(id)
  const { data: actionItemsData }       = useVendorActionItems(id)
  // Fetched here so both WorkflowTab and AssessmentsTab (phase tracker) share one request
  const { data: workflowProgressData }  = useWorkflowProgress(vendor?.activeWorkflowInstanceId)

  const activeAssessment   = assessments.find(a => a.status !== 'CANCELLED' && a.status !== 'COMPLETED')
  const activeAssessmentId = activeAssessment?.assessmentId ?? null

  const [confirmAction, setConfirmAction] = useState(null)
  const [actioning,  setActioning]        = useState(false)

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['vendors', id] })
    qc.invalidateQueries({ queryKey: ['vendors'] })
    qc.invalidateQueries({ queryKey: ['vendor-assessments', id] })
    refetch()
  }

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
      .then(() => { setConfirmAction(null); toast.success(`${action.label} completed`); invalidateAll() })
      .catch(e => toast.error(e?.message || `${action.label} failed`))
      .finally(() => setActioning(false))
  }

  if (isLoading) return <PageSkeleton />
  if (!vendor)   return <div className="p-6 text-text-muted">Vendor not found</div>

  const workflowActive  = vendor.activeWorkflowInstanceId &&
    ['IN_PROGRESS', 'ON_HOLD', 'PENDING'].includes(vendor.workflowInstanceStatus)
  const setupIncomplete = !vendor.vrmUserId || !workflowActive

  const openActionItems = (Array.isArray(actionItemsData)
    ? actionItemsData
    : actionItemsData?.data || actionItemsData?.items || [])
    .filter(ai => ai.status === 'OPEN' || ai.status === 'IN_PROGRESS').length

  return (
    <div className="flex flex-col h-full animate-fade-in">

      {/* ── Page header ───────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-0 space-y-4 border-b border-border">

        {/* Breadcrumb + actions */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" icon={ArrowLeft}
              onClick={() => navigate('/tprm/vendors')}>
              Back
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-text-primary">{vendor.name}</h1>
                <DynamicBadge value={vendor.status} componentKey="vendor_status" config={screenConfig} />
                {vendor.criticality && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay border border-border text-text-muted font-mono uppercase">
                    {vendor.criticality}
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                {[vendor.legalName, vendor.industry, vendor.country].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <DynamicActionBar actions={actions} onAction={handleAction} entityId={id} />
        </div>

        {/* Setup banner (inline, above tabs) */}
        {setupIncomplete && (
          <VendorSetupBanner vendor={vendor} onRefresh={refetch} />
        )}

        {/* Tab bar */}
        <nav className="flex gap-0 -mb-px">
          {TABS.map(tab => {
            // Badge count on certain tabs
            const badge =
              tab.id === 'actions' && openActionItems > 0 ? openActionItems : null

            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors relative',
                  activeTab === tab.id
                    ? 'border-brand-500 text-brand-400'
                    : 'border-transparent text-text-muted hover:text-text-secondary hover:border-border'
                )}>
                <tab.icon size={12} />
                {tab.label}
                {badge != null && (
                  <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/20 leading-none">
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ── Tab content ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {activeTab === 'overview' && (
          <OverviewTab
            vendor={vendor}
            screenConfig={screenConfig}
            assessments={assessments}
            actionItems={actionItemsData}
          />
        )}

        {activeTab === 'workflow' && (
          <WorkflowTab
            vendor={vendor}
            activeAssessmentId={activeAssessmentId}
            progressData={workflowProgressData}
          />
        )}

        {activeTab === 'assessments' && (
          <AssessmentsTab
            vendorId={id}
            vendorRiskScore={vendor.currentRiskScore}
            workflowProgress={workflowProgressData}
          />
        )}

        {activeTab === 'team' && (
          <TeamTab vendorId={id} vendor={vendor} />
        )}

        {activeTab === 'contracts' && (
          <ContractsTab vendorId={id} />
        )}

        {activeTab === 'actions' && (
          <ActionItemsTab vendorId={id} />
        )}
      </div>

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