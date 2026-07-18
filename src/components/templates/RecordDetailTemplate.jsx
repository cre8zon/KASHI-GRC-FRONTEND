/**
 * RecordDetailTemplate — universal shell for any GRC entity detail page.
 *
 * Enforces consistent layout across Risk, Audit, Issue, Policy, Control, etc.
 * Every module detail page wraps this instead of rebuilding the shell.
 *
 * Structure:
 *   Header    — title, status badge, owner, due date, action buttons
 *   Tab bar   — driven by props + viewContext.visibleTabs
 *   Left panel — main content (80%)
 *   Right panel — metadata sidebar (20%): owner, dates, linked entities, priority
 *
 * USAGE:
 *   <RecordDetailTemplate
 *     title="Vendor data breach risk"
 *     entityType="RISK"
 *     entityId={42}
 *     status="IN_REVIEW"
 *     statusColorTag="blue"
 *     owner={{ name: 'Alice Chen', email: 'alice@co.com' }}
 *     dueDate="2025-09-30"
 *     priority="HIGH"
 *     tabs={[
 *       { key: 'overview', label: 'Overview', icon: Eye, content: <RiskOverviewTab /> },
 *       { key: 'controls', label: 'Controls', icon: Shield, content: <ControlsTab /> },
 *     ]}
 *     actions={<Button size="sm">Start treatment</Button>}
 *     metadata={[
 *       { label: 'Risk owner', value: 'Alice Chen' },
 *       { label: 'Category', value: 'Operational' },
 *     ]}
 *     viewContext={viewContext}
 *     onBack={() => navigate(-1)}
 *   />
 *
 * The standard tabs (Workflow, Evidence, Comments, History, Action items)
 * are injected automatically based on `supports*` props.
 * Custom tabs go before or after standard tabs via `tabPosition: 'before' | 'after'`.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, GitBranch, Upload, MessageSquare,
  Activity, CheckCircle2, Eye, MoreVertical,
  User, Calendar, Flag, Link2, AlertTriangle,
  Clock, ChevronRight,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Progress } from '../ui/ui-primitives'
import { WorkflowTimeline } from '../workflow/WorkflowTimeline'
import EvidenceUploader from '../ui/EvidenceUploader'
import { CommentFeed } from '../comments/CommentFeed'
import { ItemActionItems } from '../item-panel/ItemActionItems'
import { PostActionState } from '../workflow/useTaskAction'
import { cn } from '../../lib/cn'
import { formatDate } from '../../utils/format'

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  CRITICAL: { color: 'text-status-fail-fg',    bg: 'bg-status-fail-bg border-status-fail-bd',    dot: 'bg-status-fail-bg' },
  HIGH:     { color: 'text-status-warn-fg',  bg: 'bg-status-warn-bg border-status-warn-bd', dot: 'bg-status-warn-bg' },
  MEDIUM:   { color: 'text-status-info-fg',   bg: 'bg-status-info-bg border-status-info-bd',   dot: 'bg-status-info-bg' },
  LOW:      { color: 'text-text-muted', bg: 'bg-surface-overlay border-border',    dot: 'bg-text-muted' },
}

// ─── Standard tab definitions ─────────────────────────────────────────────────

const STANDARD_TABS = [
  { key: 'workflow', label: 'Workflow',     icon: GitBranch,    prop: 'supportsWorkflow' },
  { key: 'actions',  label: 'Action items', icon: CheckCircle2, prop: 'supportsActionItems' },
  { key: 'evidence', label: 'Evidence',     icon: Upload,       prop: 'supportsDocuments' },
  { key: 'comments', label: 'Comments',     icon: MessageSquare,prop: 'supportsComments' },
  { key: 'history',  label: 'History',      icon: Activity,     prop: 'showHistory',    always: true },
]

// ─── Main component ───────────────────────────────────────────────────────────

export function RecordDetailTemplate({
  // Identity
  title,
  subtitle,
  entityType,
  entityId,

  // Status
  status,
  statusColorTag = 'gray',
  statusLabel,

  // People & dates
  owner,           // { name, email, avatarUrl }
  assignedTo,      // { name, email }
  dueDate,
  createdAt,
  updatedAt,
  priority,        // CRITICAL | HIGH | MEDIUM | LOW

  // Tabs — custom content tabs
  tabs = [],       // [{ key, label, icon, content, position: 'before'|'after' }]

  // Standard tab feature flags
  supportsWorkflow     = true,
  supportsActionItems  = true,
  supportsDocuments    = true,
  supportsComments     = true,
  showHistory          = true,

  // Workflow
  workflowInstanceId,
  workflowProgress,
  postActionState,
  onClearPostAction,

  // Metadata sidebar
  metadata = [],   // [{ label, value, icon, mono, link }]
  linkedEntities = [], // [{ label, id, entityType, route }]

  // Actions toolbar
  actions,

  // Access control
  viewContext,

  // Navigation
  onBack,
  backLabel,

  // SoD
  sodViolations = [],

  className,
}) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(tabs[0]?.key || 'workflow')

  // If post-action state is set, show that instead of content
  if (postActionState) {
    return (
      <PostActionState
        state={postActionState}
        onContinue={onClearPostAction}
        entityType={entityType}
        entityId={entityId}
      />
    )
  }

  // Build complete tab list
  const customBefore = tabs.filter(t => t.position !== 'after')
  const customAfter  = tabs.filter(t => t.position === 'after')

  const standardTabList = STANDARD_TABS.filter(t => {
    if (!t.always && t.prop && !eval(`supports${t.prop?.replace('supports','')}` || t.prop)) return false
    if (viewContext?.hiddenTabs?.includes(t.key)) return false
    if (viewContext?.visibleTabs?.length && !viewContext.visibleTabs.includes(t.key)) return false
    return true
  })

  const allTabs = [...customBefore, ...standardTabList, ...customAfter]
  const firstValidTab = allTabs[0]?.key
  const currentTab = allTabs.find(t => t.key === activeTab) ? activeTab : firstValidTab

  const handleBack = () => { if (onBack) onBack(); else navigate(-1) }

  const hasHardSod = sodViolations.some(v => v.conflictType === 'HARD')
  const pri = priority ? PRIORITY_CONFIG[priority] : null

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <button onClick={handleBack}
            className="h-7 w-7 flex items-center justify-center rounded-ctl text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors mt-0.5 shrink-0">
            <ArrowLeft size={15} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-semibold text-text-primary truncate">{title}</h1>
              {status && (
                <Badge value={status} label={statusLabel || status} colorTag={statusColorTag} />
              )}
              {priority && pri && (
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-semibold flex items-center gap-1', pri.bg, pri.color)}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', pri.dot)} />
                  {priority}
                </span>
              )}
              {hasHardSod && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-fail-bg border border-status-fail-bd text-status-fail-fg flex items-center gap-1">
                  <AlertTriangle size={10} /> SoD conflict
                </span>
              )}
            </div>
            {subtitle && <p className="text-xs text-text-muted mt-0.5 truncate">{subtitle}</p>}
            {owner && (
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-text-muted">
                <User size={11} />
                <span>{owner.name || owner.email}</span>
                {dueDate && (
                  <>
                    <span className="text-text-muted/40">·</span>
                    <Calendar size={11} />
                    <span className={cn(new Date(dueDate) < new Date() ? 'text-status-fail-fg' : '')}>
                      Due {formatDate(dueDate)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {actions}
          </div>
        )}
      </div>

      {/* SoD banner */}
      {sodViolations.length > 0 && (
        <div className={cn(
          'flex items-center gap-2 mx-6 mt-3 px-3 py-2 rounded-card text-xs border',
          hasHardSod
            ? 'bg-status-fail-bg border-status-fail-bd text-status-fail-fg'
            : 'bg-status-warn-bg border-status-warn-bd text-status-warn-fg'
        )}>
          <AlertTriangle size={13} className="shrink-0" />
          <span className="font-medium">{hasHardSod ? 'SoD violation — some actions blocked:' : 'SoD warning:'}</span>
          {' '}{sodViolations.map(v => v.ruleName).join(', ')}
        </div>
      )}

      {/* ── Tab bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-6 border-b border-border shrink-0">
        {allTabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
              currentTab === tab.key
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}>
            {tab.icon && <tab.icon size={12} />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Body: main + sidebar ─────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Custom tab content */}
          {customBefore.map(tab => currentTab === tab.key && (
            <div key={tab.key}>{tab.content}</div>
          ))}
          {customAfter.map(tab => currentTab === tab.key && (
            <div key={tab.key}>{tab.content}</div>
          ))}

          {/* Standard tab: Workflow */}
          {currentTab === 'workflow' && supportsWorkflow && (
            <WorkflowTab
              entityType={entityType}
              entityId={entityId}
              workflowInstanceId={workflowInstanceId}
              workflowProgress={workflowProgress}
              viewContext={viewContext}
            />
          )}

          {/* Standard tab: Action items */}
          {currentTab === 'actions' && supportsActionItems && (
            <ItemActionItems entityType={entityType} entityId={entityId} />
          )}

          {/* Standard tab: Evidence */}
          {currentTab === 'evidence' && supportsDocuments && (
            <EvidenceUploader entityType={entityType} entityId={entityId} />
          )}

          {/* Standard tab: Comments */}
          {currentTab === 'comments' && supportsComments && (
            <CommentFeed entityType={entityType} entityId={Number(entityId)} />
          )}

          {/* Standard tab: History */}
          {currentTab === 'history' && <HistoryTab entityType={entityType} entityId={entityId} />}
        </div>

        {/* Metadata sidebar */}
        <div className="w-64 shrink-0 border-l border-border overflow-y-auto p-4 space-y-4">

          {/* Workflow mini-progress */}
          {workflowProgress && supportsWorkflow && (
            <MetaSection title="Workflow progress">
              <Progress
                value={workflowProgress.stepsCompleted || 0}
                max={workflowProgress.totalSteps || 1}
                color="brand"
                showLabel
                label={`${workflowProgress.stepsCompleted}/${workflowProgress.totalSteps} steps`}
              />
              {workflowProgress.currentStepName && (
                <p className="text-[11px] text-text-muted mt-1">
                  Current: {workflowProgress.currentStepName}
                </p>
              )}
            </MetaSection>
          )}

          {/* Key metadata */}
          {(owner || dueDate || priority || metadata.length > 0) && (
            <MetaSection title="Details">
              {owner && (
                <MetaRow icon={User} label="Owner">
                  <span className="text-text-primary">{owner.name || owner.email}</span>
                </MetaRow>
              )}
              {assignedTo && (
                <MetaRow icon={User} label="Assigned to">
                  <span className="text-text-primary">{assignedTo.name || assignedTo.email}</span>
                </MetaRow>
              )}
              {priority && pri && (
                <MetaRow icon={Flag} label="Priority">
                  <span className={cn('font-medium text-xs', pri.color)}>{priority}</span>
                </MetaRow>
              )}
              {dueDate && (
                <MetaRow icon={Calendar} label="Due date">
                  <span className={cn('text-xs', new Date(dueDate) < new Date() ? 'text-status-fail-fg' : 'text-text-primary')}>
                    {formatDate(dueDate)}
                  </span>
                </MetaRow>
              )}
              {createdAt && (
                <MetaRow icon={Clock} label="Created">
                  <span className="text-xs text-text-muted">{formatDate(createdAt)}</span>
                </MetaRow>
              )}
              {metadata.map((m, i) => (
                <MetaRow key={i} icon={m.icon} label={m.label}>
                  {m.link
                    ? <a href={m.link} className="text-xs text-brand-400 hover:underline">{m.value}</a>
                    : <span className={cn('text-xs', m.mono ? 'font-mono text-brand-400' : 'text-text-primary')}>{m.value || '—'}</span>
                  }
                </MetaRow>
              ))}
            </MetaSection>
          )}

          {/* Linked entities */}
          {linkedEntities.length > 0 && (
            <MetaSection title="Linked to">
              {linkedEntities.map((le, i) => (
                <a key={i} href={le.route || `/module/${le.entityType?.toLowerCase()}/${le.id}`}
                  className="flex items-center gap-2 py-1 text-xs text-text-muted hover:text-brand-400 transition-colors group">
                  <Link2 size={11} className="shrink-0" />
                  <span className="truncate flex-1">{le.label}</span>
                  <ChevronRight size={11} className="shrink-0 opacity-0 group-hover:opacity-100" />
                </a>
              ))}
            </MetaSection>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetaSection({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function MetaRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon size={11} className="text-text-muted shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-text-muted">{label}</p>
        {children}
      </div>
    </div>
  )
}

function WorkflowTab({ entityType, entityId, workflowInstanceId, workflowProgress, viewContext }) {
  if (!workflowInstanceId) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 border border-dashed border-border rounded-card text-center">
        <GitBranch size={24} className="text-text-muted" />
        <div>
          <p className="text-sm font-medium text-text-secondary">No active workflow</p>
          <p className="text-xs text-text-muted mt-0.5">Start a workflow to begin the process</p>
        </div>
        {viewContext?.canAct !== false && (
          <Button size="sm" icon={GitBranch}>Start workflow</Button>
        )}
      </div>
    )
  }
  return (
    <WorkflowTimeline
      workflowInstanceId={workflowInstanceId}
      progress={workflowProgress}
    />
  )
}

function HistoryTab({ entityType, entityId }) {
  // Generic history — modules can override with a custom tab if needed
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">Audit trail for {entityType} #{entityId}</p>
      <div className="border border-border rounded-card p-4 text-xs text-text-muted text-center">
        History entries will appear here as changes are recorded.
      </div>
    </div>
  )
}