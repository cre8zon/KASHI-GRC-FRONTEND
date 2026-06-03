/**
 * AuditEngagementDetailPage — /audit/engagements/:id
 *
 * Full engagement view. Role-aware tabs.
 *
 * TABS:
 *   Overview   — stats, workflow timeline, engagement metadata
 *   Sections   — recursive section tree with collapse/expand, assignment, submission
 *   Controls   — flat list of all controls with test result inline editing
 *   Evidence   — evidence documents linked to this engagement
 *   Findings   — issues raised from this engagement (issueType=EXTERNAL, sourceEntityType=AUDIT_ENGAGEMENT)
 *   Comments   — discussion thread
 *
 * SECTION TREE:
 *   buildTree(sections) converts the flat list (with parentInstanceId) into a nested tree.
 *   Sections at any depth are collapsible. Assignment cascades to children when toggled.
 *
 * CONTROL LIST:
 *   Filterable by section (sectionInstanceId), test result, auditor.
 *   Each control row has an inline test result selector (EFFECTIVE / PARTIALLY_EFFECTIVE /
 *   INEFFECTIVE / NOT_APPLICABLE) saved on blur.
 */
import { useState, useMemo, useCallback }         from 'react'
import { useParams, useNavigate }                  from 'react-router-dom'
import { useQuery, useMutation, useQueryClient }   from '@tanstack/react-query'
import {
  ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertCircle,
  Minus, Shield, FileText, MessageSquare, AlertTriangle, Activity,
  User, Calendar, ClipboardList, BarChart3, Flag,
} from 'lucide-react'
import { auditApi }          from '../../api/audit.api'
import { workflowsApi }      from '../../api/workflows.api'
import { PageLayout }        from '../../components/layout/PageLayout'
import { Button }            from '../../components/ui/Button'
import { Badge }             from '../../components/ui/Badge'
import { WorkflowTimeline }  from '../../components/workflow/WorkflowTimeline'
import { CommentFeed }       from '../../components/comments/CommentFeed'
import { cn }                from '../../lib/cn'
import { formatDate, formatDateTime } from '../../utils/format'
import toast                 from 'react-hot-toast'

// ─── Config ───────────────────────────────────────────────────────────────────

const RESULT_CFG = {
  EFFECTIVE:           { label: 'Effective',           color: 'green',  icon: CheckCircle2 },
  PARTIALLY_EFFECTIVE: { label: 'Partially effective', color: 'amber',  icon: AlertCircle  },
  INEFFECTIVE:         { label: 'Ineffective',         color: 'red',    icon: XCircle      },
  NOT_APPLICABLE:      { label: 'N/A',                 color: 'gray',   icon: Minus        },
  NOT_TESTED:          { label: 'Not tested',          color: 'gray',   icon: Minus        },
}

const STATUS_COLOR = {
  PLANNING:'gray', FIELDWORK:'blue', EVIDENCE_REVIEW:'indigo',
  DRAFT_REPORT:'purple', MANAGEMENT_RESPONSE:'amber',
  FINAL_REPORT:'teal', CLOSED:'green', CANCELLED:'red',
}

const TABS = ['Overview', 'Sections', 'Controls', 'Evidence', 'Findings', 'Comments']

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useEngagement = (id) => useQuery({
  queryKey: ['audit-engagement', id],
  queryFn:  () => auditApi.engagements.get(id),
  enabled: !!id,
})

const useSections = (id) => useQuery({
  queryKey: ['audit-sections', id],
  queryFn:  () => auditApi.engagements.sections.list(id),
  enabled: !!id,
  select: d => d?.sections ?? d ?? [],
})

const useControls = (id) => useQuery({
  queryKey: ['audit-controls', id],
  queryFn:  () => auditApi.engagements.controls.list(id),
  enabled: !!id,
  select: d => d?.controls ?? d ?? [],
})

const useStats = (id) => useQuery({
  queryKey: ['audit-stats', id],
  queryFn:  () => auditApi.engagements.stats(id),
  enabled: !!id,
})

const useWorkflow = (workflowInstanceId) => useQuery({
  queryKey: ['workflow-progress', workflowInstanceId],
  queryFn:  () => workflowsApi.instances.progress(workflowInstanceId),
  enabled:  !!workflowInstanceId,
})

// ─── Tree builder ─────────────────────────────────────────────────────────────

function buildTree(sections) {
  if (!sections?.length) return []
  const byId = new Map(sections.map(s => [s.id, { ...s, children: [] }]))
  const roots = []
  for (const s of byId.values()) {
    if (!s.parentInstanceId) roots.push(s)
    else byId.get(s.parentInstanceId)?.children.push(s)
  }
  // Sort siblings by orderNo
  const sort = (nodes) => {
    nodes.sort((a, b) => a.orderNo - b.orderNo)
    nodes.forEach(n => sort(n.children))
    return nodes
  }
  return sort(roots)
}

// ─── Section tree node ────────────────────────────────────────────────────────

function SectionNode({ node, engagementId, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2) // collapse deep nodes by default
  const qc              = useQueryClient()

  const submitMutation = useMutation({
    mutationFn: ({ id }) => auditApi.engagements.sections.submit(engagementId, id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['audit-sections', engagementId] }),
    onError:    e  => toast.error(e?.message || 'Submit failed'),
  })
  const reopenMutation = useMutation({
    mutationFn: ({ id }) => auditApi.engagements.sections.reopen(engagementId, id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['audit-sections', engagementId] }),
    onError:    e  => toast.error(e?.message || 'Reopen failed'),
  })

  const isLocked  = !!node.submittedAt
  const hasChildren = node.children.length > 0
  const indent      = depth * 20

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-2 px-3 rounded-md transition-colors',
          'hover:bg-surface-overlay cursor-pointer',
          isLocked && 'opacity-70',
        )}
        style={{ paddingLeft: `${12 + indent}px` }}
      >
        {/* Expand/collapse chevron */}
        <button
          onClick={() => setOpen(o => !o)}
          className="shrink-0 text-text-muted hover:text-text-primary"
        >
          {hasChildren
            ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            : <span className="w-3.5 block" />
          }
        </button>

        {/* Section info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {node.sectionCodeSnapshot && (
              <span className="text-xs font-mono text-text-muted">{node.sectionCodeSnapshot}</span>
            )}
            <span className={cn('text-sm', depth === 0 ? 'font-medium' : '')}>{node.sectionNameSnapshot}</span>
            {isLocked && <Badge color="green" size="sm">Submitted</Badge>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isLocked ? (
            <Button variant="ghost" size="xs" onClick={e => { e.stopPropagation(); reopenMutation.mutate({ id: node.id }) }}
              loading={reopenMutation.isPending}>
              Reopen
            </Button>
          ) : (
            <Button variant="ghost" size="xs" onClick={e => { e.stopPropagation(); submitMutation.mutate({ id: node.id }) }}
              loading={submitMutation.isPending}>
              Submit
            </Button>
          )}
        </div>
      </div>

      {/* Children */}
      {open && hasChildren && (
        <div>
          {node.children.map(child => (
            <SectionNode key={child.id} node={child} engagementId={engagementId} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Control row ──────────────────────────────────────────────────────────────

function ControlRow({ control, engagementId }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)

  const handleResultChange = useCallback(async (result) => {
    setSaving(true)
    try {
      await auditApi.engagements.controls.recordTestResult(engagementId, control.id, {
        testResult: result,
      })
      qc.invalidateQueries({ queryKey: ['audit-controls', engagementId] })
      qc.invalidateQueries({ queryKey: ['audit-stats', engagementId] })
    } catch (e) {
      toast.error('Failed to save result')
    } finally {
      setSaving(false)
    }
  }, [engagementId, control.id, qc])

  const cfg = RESULT_CFG[control.testResult] ?? RESULT_CFG.NOT_TESTED
  const Icon = cfg.icon

  return (
    <div className="flex items-start gap-3 py-3 px-4 border-b border-border last:border-0 hover:bg-surface-overlay transition-colors">
      <Icon size={16} className={cn('mt-0.5 shrink-0', {
        'text-green-400':  control.testResult === 'EFFECTIVE',
        'text-amber-400':  control.testResult === 'PARTIALLY_EFFECTIVE',
        'text-red-400':    control.testResult === 'INEFFECTIVE',
        'text-text-muted': !control.testResult || control.testResult === 'NOT_TESTED' || control.testResult === 'NOT_APPLICABLE',
      })} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {control.controlCodeSnapshot && (
                <span className="text-xs font-mono text-text-muted">{control.controlCodeSnapshot}</span>
              )}
              <span className="text-sm text-text-primary">{control.controlNameSnapshot}</span>
              {control.isMandatory && <Badge color="red" size="xs">Required</Badge>}
              {control.findingLinked && (
                <Badge color="amber" size="xs" icon={Flag}>Finding</Badge>
              )}
            </div>
            {control.sectionBreadcrumbSnapshot && (
              <p className="text-xs text-text-muted mt-0.5">{control.sectionBreadcrumbSnapshot}</p>
            )}
          </div>

          {/* Result selector */}
          <select
            value={control.testResult ?? 'NOT_TESTED'}
            onChange={e => handleResultChange(e.target.value)}
            disabled={saving}
            className="h-7 px-2 rounded border border-border bg-surface-raised text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500 shrink-0"
          >
            {Object.entries(RESULT_CFG).map(([v, c]) => (
              <option key={v} value={v}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ engagement, stats, workflowProgress }) {
  const breakdown = stats?.resultBreakdown ?? {}
  const total     = engagement?.totalControls ?? 0
  const StatCard  = ({ label, value, color }) => (
    <div className="rounded-lg border border-border bg-surface-raised p-3">
      <div className={cn('text-2xl font-medium tabular-nums', color ?? 'text-text-primary')}>{value ?? 0}</div>
      <div className="text-xs text-text-muted mt-0.5">{label}</div>
    </div>
  )
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total controls" value={total} />
        <StatCard label="Tested" value={engagement?.testedControls} color="text-blue-400" />
        <StatCard label="Effective" value={breakdown.EFFECTIVE} color="text-green-400" />
        <StatCard label="Findings" value={engagement?.openFindingCount} color="text-red-400" />
      </div>
      {total > 0 && (
        <div>
          <div className="flex justify-between text-xs text-text-muted mb-1">
            <span>Overall progress</span>
            <span>{stats?.progressPct ?? 0}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface-overlay">
            <div className="h-2 rounded-full bg-brand-500 transition-all"
              style={{ width: `${stats?.progressPct ?? 0}%` }} />
          </div>
        </div>
      )}
      {workflowProgress && (
        <WorkflowTimeline progress={workflowProgress} />
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AuditEngagementDetailPage() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const [tab, setTab] = useState('Overview')

  const { data: engData, isLoading } = useEngagement(id)
  const { data: sections }           = useSections(id)
  const { data: controls }           = useControls(id)
  const { data: stats }              = useStats(id)
  const engagement = engData?.engagement ?? engData

  const { data: workflowProgress } = useWorkflow(engagement?.workflowInstanceId)

  const tree = useMemo(() => buildTree(sections ?? []), [sections])

  if (isLoading) {
    return (
      <PageLayout title="Loading…">
        <div className="px-6 py-8 flex flex-col gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-surface-overlay animate-pulse" />)}
        </div>
      </PageLayout>
    )
  }

  if (!engagement) return null

  return (
    <PageLayout
      title={engagement.name}
      subtitle={`${engagement.engagementRef} · ${engagement.frameworkRef ?? ''}`}
      actions={
        <div className="flex items-center gap-2">
          <Badge color={STATUS_COLOR[engagement.status] ?? 'gray'}>
            {engagement.status?.replace(/_/g, ' ')}
          </Badge>
        </div>
      }
    >
      {/* Tabs */}
      <div className="px-6 border-b border-border flex gap-0.5 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2.5 text-sm whitespace-nowrap transition-colors border-b-2',
              tab === t
                ? 'border-brand-500 text-text-primary font-medium'
                : 'border-transparent text-text-muted hover:text-text-primary',
            )}>
            {t}
          </button>
        ))}
      </div>

      <div className="px-6 py-5">

        {tab === 'Overview' && (
          <OverviewTab engagement={engagement} stats={stats} workflowProgress={workflowProgress} />
        )}

        {tab === 'Sections' && (
          <div className="rounded-lg border border-border bg-surface-raised divide-y divide-border overflow-hidden">
            {tree.length === 0 ? (
              <p className="p-4 text-sm text-text-muted">No sections. Did you select a template?</p>
            ) : (
              tree.map(root => (
                <SectionNode key={root.id} node={root} engagementId={id} depth={0} />
              ))
            )}
          </div>
        )}

        {tab === 'Controls' && (
          <div className="rounded-lg border border-border bg-surface-raised overflow-hidden">
            {!controls?.length ? (
              <p className="p-4 text-sm text-text-muted">No controls. Create an engagement with a template.</p>
            ) : (
              controls.map(ctrl => (
                <ControlRow key={ctrl.id} control={ctrl} engagementId={id} />
              ))
            )}
          </div>
        )}

        {tab === 'Evidence' && (
          <p className="text-sm text-text-muted">
            Evidence documents attached to this engagement appear here.
            Upload via the document uploader on each control, or from the global evidence library.
          </p>
        )}

        {tab === 'Findings' && (
          <p className="text-sm text-text-muted">
            Issues raised from this engagement (issueType=EXTERNAL, sourceEntityType=AUDIT_ENGAGEMENT) appear here.
            Click a control's "Raise finding" action to link an issue.
          </p>
        )}

        {tab === 'Comments' && (
          <CommentFeed entityType="AUDIT_ENGAGEMENT" entityId={id} />
        )}

      </div>
    </PageLayout>
  )
}
