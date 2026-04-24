/**
 * AssessmentDetailPage — /assessments/:id
 *
 * Role-aware detail view for a vendor assessment.
 * The same URL renders differently based on the user's side and role:
 *
 *   VENDOR_VRM / VENDOR_CISO  → Overview + workflow timeline + section assignment status
 *   VENDOR_RESPONDER          → Their sections + answers
 *   ORGANIZATION              → Full review view + scoring + risk rating
 *   SYSTEM                    → Everything
 *
 * Driven entirely by AccessContext.mode and the user's role side — no hardcoded checks.
 */

import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, CheckCircle2, Clock, AlertTriangle, XCircle,
  ChevronDown, ChevronRight, Shield, FileText, Users,
  BarChart2, MessageSquare, Star, ExternalLink, Loader2,
} from 'lucide-react'
import { assessmentsApi } from '../../api/assessments.api'
import { workflowsApi } from '../../api/workflows.api'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { cn } from '../../lib/cn'
import { formatDate, formatDateTime } from '../../utils/format'
import { useSelector } from 'react-redux'
import { selectRoles } from '../../store/slices/authSlice'
import { PageLayout }  from '../../components/layout/PageLayout'
import { useComments }             from '../../hooks/useComments'
import { useEntityActionItems, useUpdateActionItemStatus } from '../../hooks/useActionItems'
import { CommentFeed } from '../../components/comments/CommentFeed'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  ASSIGNED:     { label: 'Assigned',      color: 'blue',   icon: Clock },
  IN_PROGRESS:  { label: 'In Progress',   color: 'amber',  icon: Clock },
  SUBMITTED:    { label: 'Submitted',     color: 'purple', icon: CheckCircle2 },
  UNDER_REVIEW: { label: 'Under Review',  color: 'indigo', icon: Shield },
  COMPLETED:    { label: 'Completed',     color: 'green',  icon: CheckCircle2 },
  REJECTED:     { label: 'Rejected',      color: 'red',    icon: XCircle },
  CANCELLED:    { label: 'Cancelled',     color: 'gray',   icon: XCircle },
}

const STEP_STATUS_CONFIG = {
  APPROVED:           { color: 'text-green-400',  bg: 'bg-green-500/10',  dot: 'bg-green-400' },
  IN_PROGRESS:        { color: 'text-amber-400',  bg: 'bg-amber-500/10',  dot: 'bg-amber-400', pulse: true },
  AWAITING_ASSIGNMENT:{ color: 'text-blue-400',   bg: 'bg-blue-500/10',   dot: 'bg-blue-400' },
  PENDING:            { color: 'text-text-muted', bg: 'bg-surface-overlay', dot: 'bg-surface-overlay border border-border' },
  REJECTED:           { color: 'text-red-400',    bg: 'bg-red-500/10',    dot: 'bg-red-400' },
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useAssessment = (id) => useQuery({
  queryKey: ['assessment-detail-full', id],
  queryFn:  () => assessmentsApi.vendor.get(id),
  enabled:  !!id,
})

const useInstanceStatus = (instanceId) => useQuery({
  queryKey: ['instance-status', instanceId],
  queryFn:  () => workflowsApi.instances.progress(instanceId),
  enabled:  !!instanceId,
  staleTime: 30 * 1000,
})

const useInstanceHistory = (instanceId) => useQuery({
  queryKey: ['instance-history', instanceId],
  queryFn:  () => workflowsApi.history.forInstance(instanceId),
  enabled:  !!instanceId,
})

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'default' }) {
  return (
    <div className="p-4 rounded-xl border border-border bg-surface flex flex-col gap-1">
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">{label}</p>
      <p className={cn('text-2xl font-bold',
        color === 'green' ? 'text-green-400' :
        color === 'amber' ? 'text-amber-400' :
        color === 'red'   ? 'text-red-400'   : 'text-text-primary'
      )}>{value}</p>
      {sub && <p className="text-xs text-text-muted">{sub}</p>}
    </div>
  )
}

function SectionProgress({ section, idx, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const answered = section.questions?.filter(q => !!q.currentResponse).length ?? 0
  const total    = section.questions?.length ?? 0
  const pct = total > 0 ? Math.round(answered * 100 / total) : 0

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface-overlay/40 transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0 text-xs font-bold text-brand-400">
          {idx + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{section.sectionName}</p>
          <p className="text-xs text-text-muted">{answered}/{total} answered</p>
        </div>
        <div className="flex items-center gap-3 mr-2">
          <div className="w-20 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-green-500' : 'bg-brand-500')}
              style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-mono text-text-muted w-8 text-right">{pct}%</span>
        </div>
        {open ? <ChevronDown size={14} className="text-text-muted shrink-0" /> : <ChevronRight size={14} className="text-text-muted shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border">
          {(section.questions || []).map((q, qi) => (
            <div key={q.questionInstanceId ?? qi} className="px-5 py-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {q.currentResponse
                    ? <CheckCircle2 size={14} className="text-green-400" />
                    : <div className="w-3.5 h-3.5 rounded-full border-2 border-border mt-0.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary leading-relaxed">{q.questionText}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {q.mandatory && <span className="text-[10px] text-red-400 font-medium">Required</span>}
                    {q.weight != null && <span className="text-[10px] text-text-muted">{q.weight}pts</span>}
                  </div>
                  {q.currentResponse?.responseText && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-surface-overlay border border-border">
                      <p className="text-xs text-text-secondary">{q.currentResponse.responseText}</p>
                    </div>
                  )}
                  {q.currentResponse?.reviewerComment && (
                    <div className="mt-1 px-3 py-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
                      <p className="text-[10px] text-purple-400 font-medium mb-0.5">Reviewer comment</p>
                      <p className="text-xs text-text-secondary">{q.currentResponse.reviewerComment}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WorkflowTimeline({ steps, currentStepOrder, totalSteps }) {
  return (
    <div className="space-y-1">
      {steps.map((step, i) => {
        const cfg = STEP_STATUS_CONFIG[step.status] || STEP_STATUS_CONFIG.PENDING
        const isCurrent = step.status === 'IN_PROGRESS' || step.status === 'AWAITING_ASSIGNMENT'
        return (
          <div key={step.stepInstanceId ?? i} className="flex items-start gap-3 py-2">
            {/* connector */}
            <div className="flex flex-col items-center shrink-0 mt-1">
              <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', cfg.dot,
                cfg.pulse && 'ring-2 ring-amber-400/30 ring-offset-1 ring-offset-surface-primary')} />
              {i < steps.length - 1 && (
                <div className="w-px flex-1 bg-border mt-1 mb-0 min-h-[16px]" />
              )}
            </div>
            <div className={cn('flex-1 min-w-0 px-3 py-2 rounded-lg -mt-1', isCurrent ? cfg.bg : 'bg-transparent')}>
              <div className="flex items-center gap-2">
                <p className={cn('text-xs font-medium', isCurrent ? cfg.color : 'text-text-secondary')}>
                  {step.stepOrder}. {step.stepName || step.name}
                </p>
                {isCurrent && (
                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', cfg.bg, cfg.color)}>
                    {step.status === 'IN_PROGRESS' ? 'Active' : 'Waiting'}
                  </span>
                )}
              </div>
              {step.startedAt && (
                <p className="text-[10px] text-text-muted mt-0.5">{formatDate(step.startedAt)}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HistoryEntry({ entry }) {
  const action = entry.action || entry.eventType
  const color = action?.includes('APPROVED') || action?.includes('COMPLETED') ? 'text-green-400' :
                action?.includes('REJECTED') || action?.includes('CANCELLED') ? 'text-red-400' :
                'text-brand-400'
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', color.replace('text-', 'bg-'))} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs text-text-primary font-medium">{entry.stepName || 'Workflow'}</p>
          <span className={cn('text-[10px] font-mono', color)}>{action}</span>
        </div>
        {entry.performedByName && (
          <p className="text-[10px] text-text-muted">by {entry.performedByName}</p>
        )}
        {entry.remarks && (
          <p className="text-[10px] text-text-muted italic mt-0.5">"{entry.remarks}"</p>
        )}
      </div>
      <p className="text-[10px] text-text-muted shrink-0 font-mono">
        {entry.createdAt ? formatDateTime(entry.createdAt) : ''}
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',  label: 'Overview' },
  { key: 'sections',  label: 'Sections & Answers' },
  { key: 'timeline',  label: 'Workflow Timeline' },
  { key: 'history',   label: 'Audit History' },
  { key: 'activity',     label: 'Activity' },
  { key: 'action-items', label: 'Action Items' },
]

function AssessmentActionItems({ assessmentId }) {
  const { data: items = [], isLoading } = useEntityActionItems('ASSESSMENT', assessmentId, { enabled: !!assessmentId })
  const { mutate: updateStatus } = useUpdateActionItemStatus()

  const PRIORITY_DOT = { CRITICAL: 'bg-red-400', HIGH: 'bg-amber-400', MEDIUM: 'bg-blue-400', LOW: 'bg-surface-overlay border border-border' }
  const STATUS_COLOR = { OPEN: 'text-amber-400', IN_PROGRESS: 'text-blue-400', RESOLVED: 'text-green-400', DISMISSED: 'text-text-muted' }

  if (isLoading) return <div className="h-16 animate-pulse bg-surface-overlay rounded-lg" />
  if (!items.length) return <p className="text-xs text-text-muted text-center py-8">No action items for this assessment.</p>

  const open     = items.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length
  const resolved = items.filter(i => i.status === 'RESOLVED').length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span className="text-amber-400 font-medium">{open} open</span>
        <span>·</span>
        <span className="text-green-400">{resolved} resolved</span>
      </div>
      {items.map(item => (
        <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface-raised">
          <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', PRIORITY_DOT[item.priority] || PRIORITY_DOT.MEDIUM)} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary">{item.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={cn('text-[10px] font-medium', STATUS_COLOR[item.status])}>{item.status}</span>
              {item.assignedToName && <span className="text-[10px] text-text-muted">→ {item.assignedToName}</span>}
            </div>
          </div>
          {(item.status === 'OPEN' || item.status === 'IN_PROGRESS') && item.canResolve && (
            <button onClick={() => updateStatus({ id: item.id, status: 'RESOLVED' })}
              className="text-[10px] text-green-400/70 hover:text-green-400 flex-shrink-0 transition-colors">
              Resolve
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function AssessmentCommentFeed({ assessmentId }) {
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
      emptyMessage="No activity yet."
    />
  )
}

export default function AssessmentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [expandedSections, setExpandedSections] = useState({})
  const roles = useSelector(selectRoles)

  const isOrgSide = roles?.some(r => r.side === 'ORGANIZATION')
  const hasRole   = (name) => roles?.some(r => (r.name || r.roleName) === name)
  const isVRM     = hasRole('VENDOR_VRM')
  const isCISO    = hasRole('VENDOR_CISO')

  const { data: assessment, isLoading: assessmentLoading } = useAssessment(id)
  const workflowInstanceId = assessment?.workflowInstanceId

  // Only fetch workflow data once we have the instance ID
  const { data: progress, isLoading: progressLoading } = useInstanceStatus(workflowInstanceId)
  const { data: historyData } = useInstanceHistory(workflowInstanceId)

  if (assessmentLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={24} className="animate-spin text-text-muted" />
    </div>
  )

  if (!assessment) return (
    <div className="p-8 text-center text-text-muted text-sm">
      Assessment not found or you do not have access.
    </div>
  )

  const statusMeta = STATUS_CONFIG[assessment.status] || { label: assessment.status, color: 'gray' }
  const sections   = assessment.sections || []
  const prog       = assessment.progress || {}
  const pct        = prog.percentComplete ?? 0
  const steps      = progress?.stepHistory || progress?.steps || []
  const history    = historyData || []

  const currentStepName = progress?.currentStep?.name || '—'
  const totalSteps      = progress?.totalSteps || steps.length || 0

  return (
    <PageLayout
      title={assessment.templateName || 'Assessment'}
      subtitle={`${assessment.vendorName}${assessment.cycleNo ? ` · Cycle ${assessment.cycleNo}` : ''}`}
      actions={
        <div className="flex items-center gap-2">
          <Badge value={assessment.status} label={statusMeta.label} colorTag={statusMeta.color} />
          {(isVRM || isCISO) && assessment.workflowInstanceId && (
            <Button size="sm" variant="secondary" icon={ExternalLink}
              onClick={() => navigate(`/workflow/inbox`)}>
              Open Task
            </Button>
          )}
          {isOrgSide && (
            <Button size="sm" variant="primary"
              onClick={() => navigate(`/assessments/${id}/review`)}>
              Review Assessment
            </Button>
          )}
        </div>
      }
    >
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 border-b border-border bg-surface">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
              tab === t.key
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-5xl mx-auto">

        {/* ── Overview Tab ───────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Progress" value={`${pct}%`}
                sub={`${prog.answered ?? 0} of ${prog.totalQuestions ?? 0} answered`}
                color={pct === 100 ? 'green' : 'default'} />
              <StatCard label="Mandatory" value={prog.mandatoryQuestions ?? '—'}
                sub="required questions" />
              <StatCard label="Current Step" value={progress ? currentStepName : '…'}
                sub={totalSteps ? `of ${totalSteps} steps` : undefined} />
              <StatCard label="Risk Score"
                value={assessment.riskScore != null ? assessment.riskScore.toFixed(1) : '—'}
                color={assessment.riskScore > 70 ? 'red' : assessment.riskScore > 40 ? 'amber' : 'green'}
                sub={assessment.riskLevel || undefined} />
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-text-muted">Completion</p>
                <p className="text-xs font-mono text-text-muted">{pct}%</p>
              </div>
              <div className="h-2 rounded-full bg-surface-overlay overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-green-500' : 'bg-brand-500')}
                  style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Assessment metadata */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Vendor',     value: assessment.vendorName },
                { label: 'Template',   value: assessment.templateName },
                { label: 'Status',     value: statusMeta.label },
                { label: 'Started',    value: assessment.createdAt ? formatDate(assessment.createdAt) : '—' },
                { label: 'Submitted',  value: assessment.submittedAt ? formatDate(assessment.submittedAt) : '—' },
                { label: 'Completed',  value: assessment.completedAt ? formatDate(assessment.completedAt) : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="p-3 rounded-lg border border-border bg-surface-raised">
                  <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-0.5">{label}</p>
                  <p className="text-sm text-text-primary truncate">{value || '—'}</p>
                </div>
              ))}
            </div>

            {/* Mini timeline on overview */}
            {steps.length > 0 && (
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Workflow Progress</p>
                <WorkflowTimeline steps={steps} totalSteps={totalSteps} />
              </div>
            )}
          </div>
        )}

        {/* ── Sections Tab ───────────────────────────────────── */}
        {tab === 'sections' && (
          <div className="space-y-3">
            {sections.length === 0 ? (
              <div className="text-center py-12 text-text-muted text-sm">
                No sections available for this assessment.
              </div>
            ) : sections.map((section, i) => (
              <SectionProgress key={section.sectionInstanceId ?? i} section={section} idx={i} />
            ))}
          </div>
        )}

        {/* ── Timeline Tab ───────────────────────────────────── */}
        {tab === 'timeline' && (
          <div className="space-y-4">
            {progressLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={20} className="animate-spin text-text-muted" />
              </div>
            ) : steps.length === 0 ? (
              <div className="text-center py-12 text-text-muted text-sm">
                No workflow timeline available.
              </div>
            ) : (
              <div className="bg-surface border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-text-primary">
                    Step {steps.filter(s => s.status === 'APPROVED').length} of {totalSteps || steps.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full transition-all"
                        style={{ width: `${progress?.progressPercent ?? 0}%` }} />
                    </div>
                    <span className="text-xs font-mono text-text-muted">{progress?.progressPercent ?? 0}%</span>
                  </div>
                </div>
                <WorkflowTimeline steps={steps} totalSteps={totalSteps} />
              </div>
            )}
          </div>
        )}

        {/* ── History Tab ─────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            {history.length === 0 ? (
              <div className="text-center py-12 text-text-muted text-sm">
                No audit history available.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {history.map((entry, i) => (
                  <HistoryEntry key={entry.id ?? i} entry={entry} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Action Items Tab ─────────────────────────────────────── */}
        {tab === 'action-items' && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <AssessmentActionItems assessmentId={id} />
          </div>
        )}
      </div>
    </PageLayout>
  )
}