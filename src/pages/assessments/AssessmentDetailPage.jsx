/**
 * AssessmentDetailPage — /assessments/:id
 *
 * Complete role-aware view of an assessment for ALL roles in the system.
 *
 * ═══ FULL ROLE MATRIX ═══════════════════════════════════════════════════════
 *
 * VENDOR SIDE:
 *   VENDOR_VRM         — Primary contact. Structure view: all sections + assignment status.
 *                        Can see who answered what (read-only). Sees action items summary.
 *                        Can submit the whole assessment once CISO approves.
 *
 *   VENDOR_CISO        — Owns the assessment. Full structure + delegated sections
 *                        visible. Can see answered questions (read-only). Sees all
 *                        action items incl. remediation obligations. Can submit assessment.
 *
 *   VENDOR_RESPONDER   — Owns assigned sections. Can see ALL answered sections
 *                        across all responders (read-only). Non-answered sections hidden.
 *                        Their own sections show full Q&A + evidence + comments.
 *                        Sees action items (remediations) on their questions.
 *
 *   VENDOR_CONTRIBUTOR — Sees only their delegated question(s) + activity on that question.
 *                        Answers + evidence + comments. Sees revision/sendback status.
 *
 * ORG SIDE:
 *   ORG_OWNER/ORG_ADMIN — Full view. All sections + answers + scores. Assigns CISO.
 *                          Sees all findings/gaps. Workflow timeline. Audit history.
 *
 *   ORG_CISO           — Full review owner. All sections + evaluations + scores.
 *                        Assigns sections to Reviewers. Sees consolidated findings.
 *                        Approves and generates report.
 *
 *   REVIEWER           — Sees own assigned sections + answers + evaluations.
 *                        Reviewer comment visible. Remediations visible.
 *                        Can assign questions to Review Assistants.
 *
 *   REVIEW_ASSISTANT   — Sees only their delegated question(s) for review.
 *                        Per-question evaluation visible. Clarification status visible.
 *
 * SYSTEM:
 *   PLATFORM_ADMIN     — Full view of everything, read-only.
 *
 * ═══ WORKFLOW TIMELINE ══════════════════════════════════════════════════════
 *   Uses the existing WorkflowTimeline component from
 *   src/components/workflow/WorkflowTimeline.jsx — consistent UI with
 *   VendorDetailPage and WorkflowPage.
 *   Accepts `progress` prop = raw API response array from
 *   GET /v1/workflow-instances/{id}/progress.
 *
 * ═══ FINDINGS & GAPS MONITORING ════════════════════════════════════════════
 *   Per-question RemediationActionBanner imported from AssessmentReviewPage pattern.
 *   Assessment-level action items in Findings & Gaps tab with full lifecycle:
 *     OPEN → IN_PROGRESS → PENDING_REVIEW → PENDING_VALIDATION → RESOLVED
 *   All roles see findings. Resolve action gated by canResolve flag from backend.
 */

import { useState, useMemo }   from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery }             from '@tanstack/react-query'
import {
  ChevronDown, ChevronRight, ExternalLink, Loader2,
  Paperclip, MessageSquare, AlertTriangle, User, Star,
  FileText, Download, Shield, Activity, ClipboardList,
  CalendarClock, CheckCheck, Circle, Info, Users, Eye,
  CheckCircle2, Clock, CornerDownLeft, Flag, UserCheck,
  Building2, Lock,
} from 'lucide-react'
import { assessmentsApi }       from '../../api/assessments.api'
import { workflowsApi }         from '../../api/workflows.api'
import api                        from '../../config/axios.config'
import { Button }               from '../../components/ui/Button'
import { Badge }                from '../../components/ui/Badge'
import { cn }                   from '../../lib/cn'
import { formatDate, formatDateTime, initials } from '../../utils/format'
import { useSelector }          from 'react-redux'
import { selectRoles, selectAuth } from '../../store/slices/authSlice'
import { PageLayout }           from '../../components/layout/PageLayout'
import { useComments }          from '../../hooks/useComments'
import { useNavigation }        from '../../hooks/useUIConfig'
import { useEntityActionItems, useUpdateActionItemStatus } from '../../hooks/useActionItems'
import { CommentFeed }          from '../../components/comments/CommentFeed'
import { WorkflowTimeline }     from '../../components/workflow/WorkflowTimeline'
import { QuestionDrawer }       from '../../components/item-panel'
import { useScrollToQuestion } from '../../hooks/useScrollToQuestion'

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG = {
  ASSIGNED:     { label: 'Assigned',      color: 'blue'   },
  IN_PROGRESS:  { label: 'In Progress',   color: 'amber'  },
  SUBMITTED:    { label: 'Submitted',     color: 'purple' },
  UNDER_REVIEW: { label: 'Under Review',  color: 'indigo' },
  COMPLETED:    { label: 'Completed',     color: 'green'  },
  REJECTED:     { label: 'Rejected',      color: 'red'    },
  CANCELLED:    { label: 'Cancelled',     color: 'gray'   },
}

const RISK_CFG = {
  CRITICAL: { color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    bar: 'bg-red-500',    pct: '100%', label: 'Critical' },
  HIGH:     { color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  bar: 'bg-amber-500',  pct: '75%',  label: 'High'     },
  MEDIUM:   { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', bar: 'bg-yellow-500', pct: '50%',  label: 'Medium'   },
  LOW:      { color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  bar: 'bg-green-500',  pct: '25%',  label: 'Low'      },
}

const ACTION_ITEM_STATUS_COLOR = {
  OPEN:               'bg-red-500/8    border-red-500/25    text-red-400',
  IN_PROGRESS:        'bg-amber-500/8  border-amber-500/25  text-amber-400',
  PENDING_REVIEW:     'bg-blue-500/8   border-blue-500/25   text-blue-400',
  PENDING_VALIDATION: 'bg-blue-500/8   border-blue-500/25   text-blue-400',
  RESOLVED:           'bg-green-500/8  border-green-500/25  text-green-400',
  DISMISSED:          'bg-surface-overlay border-border      text-text-muted',
  RISK_ACCEPTED:      'bg-amber-500/6  border-amber-500/20  text-amber-300',
}

const ACTION_ITEM_STATUS_LABEL = {
  OPEN:               'Open — awaiting action',
  IN_PROGRESS:        'In progress',
  PENDING_REVIEW:     'Submitted — awaiting review',
  PENDING_VALIDATION: 'Awaiting validation',
  RESOLVED:           'Resolved',
  DISMISSED:          'Dismissed',
  RISK_ACCEPTED:      'Risk accepted',
}

// ─── Tabs definition ──────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',  label: 'Overview',          icon: Activity      },
  { key: 'sections',  label: 'Sections & Answers', icon: ClipboardList },
  { key: 'timeline',  label: 'Workflow Timeline',  icon: CalendarClock },
  { key: 'history',   label: 'Audit History',      icon: FileText      },
  { key: 'activity',  label: 'Activity',           icon: MessageSquare },
  { key: 'findings',  label: 'Findings & Gaps',    icon: AlertTriangle },
]

// ─── Queries ──────────────────────────────────────────────────────────────────

function useAssessment(id) {
  return useQuery({
    queryKey: ['assessment-detail-full', id],
    queryFn:  () => assessmentsApi.vendor.get(id),
    enabled:  !!id,
  })
}

function useWorkflowProgress(instanceId) {
  return useQuery({
    queryKey:  ['wf-progress', instanceId],
    queryFn:   () => workflowsApi.instances.progress(instanceId),
    enabled:   !!instanceId,
    staleTime: 30_000,
  })
}

function useWorkflowHistory(instanceId) {
  return useQuery({
    queryKey: ['wf-history', instanceId],
    queryFn:  () => workflowsApi.history.forInstance(instanceId),
    enabled:  !!instanceId,
  })
}

// Finds the user's active PENDING task for this specific assessment.
// Uses the same resolveTaskRoute logic as TaskInbox — navKey → navItems DB lookup → URL.
// Returns { url, label } or null if no active task.
function useMyActiveTask(assessmentId, vendorId) {
  const { data: navItems = [] } = useNavigation()
  return useQuery({
    queryKey: ['my-active-task', assessmentId, navItems.length],
    queryFn:  async () => {
      const tasks = await api.get('/v1/workflows/my-tasks', { params: { status: 'PENDING' } })
      const items = Array.isArray(tasks) ? tasks : []
      const task  = items.find(t =>
        (String(t.artifactId) === String(assessmentId) ||
         String(t.entityId)   === String(vendorId)) &&
        t.entityType === 'VENDOR'
      )
      if (!task) return null

      // Build URL exactly the same way TaskInbox does:
      // navKey → look up route template from navItems DB → replace :id → append taskId params
      const qp = `?taskId=${task.id}&stepInstanceId=${task.stepInstanceId}`
      if (task.navKey) {
        const nav = navItems.find(n => n.navKey === task.navKey)
        if (nav?.route) {
          return {
            url:   nav.route.replace(':id', assessmentId) + qp,
            label: nav.label || 'Go to your task',
          }
        }
      }

      // navKey missing or not in navItems — blueprint misconfiguration, fallback to inbox
      return { url: '/workflow/inbox', label: 'Open in Inbox' }
    },
    enabled: !!assessmentId && navItems.length > 0,
    staleTime: 30_000,
  })
}

// ─── Role resolution ──────────────────────────────────────────────────────────
//
// Returns a viewMode string used throughout the page to decide what to render.
//
// Modes:
//   'org_full'        — ORG_OWNER / ORG_ADMIN / PLATFORM_ADMIN: everything
//   'org_ciso'        — ORG_CISO: full review view with evaluations
//   'reviewer'        — REVIEWER: assigned sections + evaluations + actions
//   'review_assistant'— REVIEW_ASSISTANT: their delegated question(s) only
//   'vendor_ciso'     — VENDOR_CISO: full structure + answered Q&A read-only
//   'vendor_vrm'      — VENDOR_VRM: structure + assignment status
//   'responder'       — VENDOR_RESPONDER: their sections + all answered (read-only)
//   'contributor'     — VENDOR_CONTRIBUTOR: their delegated question(s) only

function resolveViewMode(roles) {
  if (!roles?.length) return 'responder'
  const has = (name) => roles.some(r => (r.name || r.roleName) === name)
  const side = roles[0]?.side

  if (side === 'SYSTEM') return 'org_full'
  if (side === 'ORGANIZATION') {
    if (has('ORG_OWNER') || has('ORG_ADMIN')) return 'org_full'
    if (has('ORG_CISO'))         return 'org_ciso'
    if (has('REVIEW_ASSISTANT')) return 'review_assistant'
    if (has('REVIEWER'))         return 'reviewer'
    return 'org_full' // fallback for org side
  }
  if (side === 'VENDOR') {
    if (has('VENDOR_CISO'))        return 'vendor_ciso'
    if (has('VENDOR_VRM'))         return 'vendor_vrm'
    if (has('VENDOR_CONTRIBUTOR')) return 'contributor'
    if (has('VENDOR_RESPONDER'))   return 'responder'
    return 'responder'
  }
  return 'responder'
}

const ROLE_BANNER = {
  org_full:         { icon: Building2, color: 'bg-purple-500/5 border-purple-500/20 text-purple-300',  label: 'Org Admin view — full access: all sections, answers, scores, and workflow' },
  org_ciso:         { icon: Shield,    color: 'bg-purple-500/5 border-purple-500/20 text-purple-300',  label: 'Org CISO view — full review access with evaluations and scoring' },
  reviewer:         { icon: Eye,       color: 'bg-blue-500/5 border-blue-500/20 text-blue-300',        label: 'Reviewer view — your assigned sections with full evaluations' },
  review_assistant: { icon: Users,     color: 'bg-indigo-500/5 border-indigo-500/20 text-indigo-300', label: 'Review Assistant view — your delegated questions for review' },
  vendor_ciso:      { icon: Lock,      color: 'bg-brand-500/5 border-brand-500/20 text-brand-300',    label: 'Vendor CISO view — full structure and answered responses (read-only)' },
  vendor_vrm:       { icon: UserCheck, color: 'bg-cyan-500/5 border-cyan-500/20 text-cyan-300',       label: 'VRM view — section structure and assignment status' },
  responder:        { icon: User,      color: 'bg-brand-500/5 border-brand-500/20 text-brand-300',    label: 'Responder view — your sections + all answered questions (read-only)' },
  contributor:      { icon: User,      color: 'bg-brand-500/5 border-brand-500/20 text-brand-300',    label: 'Contributor view — your assigned question(s) and activity' },
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Card({ className, children }) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface', className)}>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-2">
      {children}
    </p>
  )
}

function Avatar({ name, size = 'sm' }) {
  const sz = size === 'xs' ? 'w-4 h-4 text-[8px]' : 'w-6 h-6 text-[10px]'
  return (
    <div className={cn('rounded-full bg-brand-500/15 flex items-center justify-center font-bold text-brand-400 shrink-0', sz)}>
      {initials(name)}
    </div>
  )
}

function MetaCell({ label, value }) {
  if (!value) return null
  return (
    <div className="p-3 rounded-lg border border-border bg-surface-raised">
      <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-0.5">{label}</p>
      <p className="text-xs text-text-primary truncate">{value}</p>
    </div>
  )
}

function ScoreGauge({ pct, size = 84 }) {
  const r    = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const off  = circ - (pct / 100) * circ
  const col  = pct === 100 ? '#22c55e' : pct >= 70 ? '#f59e0b' : pct >= 40 ? '#3b82f6' : '#8b5cf6'
  return (
    <svg width={size} height={size} className="-rotate-90" style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={6} className="text-surface-overlay" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.7s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        fill="currentColor" className="text-text-primary"
        style={{ fontSize: size*0.2, transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px`, fontWeight:600 }}>
        {pct}%
      </text>
    </svg>
  )
}

function StatCard({ label, value, sub, color = 'default', icon: Icon }) {
  const num = color==='green'?'text-green-400':color==='amber'?'text-amber-400':color==='red'?'text-red-400':'text-brand-400'
  return (
    <Card className="p-4 flex flex-col gap-1.5 min-h-[88px]">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">{label}</p>
        {Icon && <Icon size={13} className="text-text-muted/60" />}
      </div>
      <p className={cn('text-lg font-semibold leading-none', num)}>
        {value ?? <span className="text-text-muted/40 text-sm font-normal italic">Pending</span>}
      </p>
      {sub && <p className="text-[10px] text-text-muted mt-auto leading-tight">{sub}</p>}
    </Card>
  )
}

// ─── Per-question action items banner ─────────────────────────────────────────
// Mirrors RemediationActionBanner from AssessmentReviewPage but read-only variant
// for AssessmentDetailPage (resolve/validate actions only for canResolve roles).

function QuestionActionItems({ questionInstanceId }) {
  const { data: items = [] } = useEntityActionItems('QUESTION_RESPONSE', questionInstanceId)
  const { mutate: updateStatus } = useUpdateActionItemStatus()

  const remediations   = items.filter(i => i.remediationType === 'REMEDIATION_REQUEST')
  const clarifications = items.filter(i => i.remediationType === 'CLARIFICATION')

  if (!remediations.length && !clarifications.length) return null

  const isOpen = (s) => ['OPEN','IN_PROGRESS','PENDING_REVIEW','PENDING_VALIDATION'].includes(s)

  return (
    <div className="space-y-1.5 mt-2">
      {remediations.map(item => {
        const colorCls = ACTION_ITEM_STATUS_COLOR[item.status] || ACTION_ITEM_STATUS_COLOR.OPEN
        const vendorActed = ['PENDING_REVIEW','PENDING_VALIDATION'].includes(item.status)
        return (
          <div key={item.id} className={cn('rounded-lg border text-[11px]', colorCls)}>
            <div className="flex items-start gap-2 px-3 py-2">
              {vendorActed ? <CheckCircle2 size={12} className="shrink-0 mt-0.5"/> : <Clock size={12} className="shrink-0 mt-0.5"/>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold">Vendor remediation</span>
                  {item.severity && (
                    <span className={cn('px-1 py-0.5 rounded text-[9px] font-bold uppercase',
                      item.severity==='CRITICAL'?'bg-red-500/20 text-red-300':
                      item.severity==='HIGH'?'bg-orange-500/20 text-orange-300':
                      item.severity==='MEDIUM'?'bg-amber-500/20 text-amber-300':'bg-blue-500/20 text-blue-300'
                    )}>{item.severity}</span>
                  )}
                  <span className="opacity-60">— {ACTION_ITEM_STATUS_LABEL[item.status] || item.status}</span>
                </div>
                {item.description && <p className="text-[10px] opacity-80 mt-0.5">{item.description}</p>}
                {item.dueAt && <p className={cn('text-[10px] mt-0.5', item.isOverdue?'text-red-400':'opacity-50')}>
                  <Clock size={9} className="inline mr-0.5"/>Due {formatDate(item.dueAt)}{item.isOverdue && ' — overdue'}
                </p>}
              </div>
            </div>
            {/* Parties */}
            <div className="px-3 py-1.5 border-t border-white/5 flex flex-wrap gap-x-4 text-[10px] opacity-70">
              {item.createdByName   && <span>Raised by: <strong>{item.createdByName}</strong></span>}
              {item.assignedToName  && <span>Assigned to: <strong>{item.assignedToName}</strong></span>}
              {item.createdAt       && <span>{formatDate(item.createdAt)}</span>}
            </div>
            {/* Resolution */}
            {item.status === 'RESOLVED' && (
              <div className="px-3 py-1.5 border-t border-white/5 text-[10px] text-green-300">
                ✓ {item.resolutionNote || 'Validated'}
                {item.resolvedByName && <span className="ml-1 opacity-70">by {item.resolvedByName}</span>}
              </div>
            )}
            {/* Actions */}
            {isOpen(item.status) && item.canResolve && (
              <div className="px-3 py-1.5 border-t border-white/5 flex gap-3">
                {vendorActed && (
                  <button onClick={() => updateStatus({ id: item.id, status:'RESOLVED', resolutionNote:'Remediation validated' })}
                    className="text-[10px] text-green-400 hover:text-green-300 flex items-center gap-1 font-medium">
                    <CheckCircle2 size={10}/> Validate
                  </button>
                )}
                <button onClick={() => updateStatus({ id: item.id, status:'IN_PROGRESS', resolutionNote:'Sent back for rework' })}
                  className="text-[10px] text-orange-400/80 hover:text-orange-400 flex items-center gap-1">
                  <CornerDownLeft size={10}/> Send back
                </button>
              </div>
            )}
          </div>
        )
      })}

      {clarifications.map(item => (
        <div key={item.id} className={cn('rounded-lg border text-[11px]',
          item.status==='RESOLVED' ? ACTION_ITEM_STATUS_COLOR.RESOLVED : 'bg-purple-500/8 border-purple-500/20 text-purple-400')}>
          <div className="flex items-start gap-2 px-3 py-2">
            {item.status==='RESOLVED' ? <CheckCircle2 size={12} className="shrink-0 mt-0.5"/> : <Clock size={12} className="shrink-0 mt-0.5"/>}
            <div className="flex-1">
              <span className="font-semibold">Clarification</span>
              <span className="opacity-60 ml-1">— {ACTION_ITEM_STATUS_LABEL[item.status] || item.status}</span>
              {item.description && <p className="text-[10px] opacity-80 mt-0.5">{item.description}</p>}
            </div>
          </div>
          {item.status==='RESOLVED' && item.resolutionNote && (
            <div className="px-3 py-1.5 border-t border-white/5 text-[10px] text-green-300">✓ {item.resolutionNote}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Per-question live comments (inline send) ─────────────────────────────────

function QuestionComments({ questionInstanceId }) {
  const { comments, isLoading, addComment, adding } = useComments(
    'QUESTION_INSTANCE', questionInstanceId, { enabled: !!questionInstanceId }
  )
  const [text, setText] = useState('')
  if (isLoading) return <div className="h-4 w-20 bg-surface-overlay rounded animate-pulse" />
  return (
    <div className="space-y-2">
      {comments?.length > 0 && (
        <div className="space-y-1.5">
          {comments.map((c, i) => (
            <div key={i} className="flex gap-2">
              <Avatar name={c.commenterName||'?'} size="xs" />
              <div>
                <p className="text-[10px] text-text-muted">{c.commenterName} · {formatDate(c.createdAt)}</p>
                <p className="text-xs text-text-secondary mt-0.5">{c.commentText}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={text} onChange={e=>setText(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey&&text.trim()){ addComment({text:text.trim()}); setText('') }}}
          placeholder="Add comment…"
          className="flex-1 bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted/50 outline-none focus:border-brand-500/60" />
        <button onClick={()=>{ if(text.trim()){ addComment({text:text.trim()}); setText('') }}}
          disabled={!text.trim()||adding}
          className="text-[10px] px-2.5 py-1.5 rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors disabled:opacity-40 font-medium">
          {adding?'…':'Send'}
        </button>
      </div>
    </div>
  )
}

// ─── Question row ─────────────────────────────────────────────────────────────
//
// showScores      — show option scores, earned score (ORG side)
// showReviewer    — show reviewer evaluation + comment (ORG side)
// showActionItems — show remediation/clarification banners (all)
// showComments    — show per-question comments + inline send (non-structure views)
// showEvidence    — show evidence file links (all except structure)
// isReadOnly      — no inline send; shows answers but no discussion input

function QuestionRow({ q, showScores, showReviewer, showActionItems, showComments, showEvidence, isReadOnly, onOpenDrawer }) {
  const [open, setOpen] = useState(false)
  const resp        = q.currentResponse
  const hasResp     = !!resp
  // Build selected IDs from all three possible sources (in priority order):
  // 1. selectedOptionInstanceIds  — array populated by fill/review endpoints
  // 2. responseText               — JSON array "[id1,id2]" stored by multi-choice toggle
  // 3. selectedOptionInstanceId   — single id fallback for single-choice
  // The buildSectionInstances backend method only sets responseText for multi-choice,
  // so without parsing it here all but the last-saved option appear unselected.
  const selectedIds = (() => {
    if (resp?.selectedOptionInstanceIds?.length) {
      return resp.selectedOptionInstanceIds.map(Number)
    }
    if (resp?.responseText?.startsWith('[')) {
      try { return JSON.parse(resp.responseText).map(Number) } catch {}
    }
    if (resp?.selectedOptionInstanceId != null) {
      return [Number(resp.selectedOptionInstanceId)]
    }
    return []
  })()

  const typeLabel = q.responseType?.replace(/_/g,' ') || ''

  return (
    <div data-qi={q.questionInstanceId} className="border-b border-border last:border-0">
      <button onClick={()=>setOpen(o=>!o)}
        className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-surface-overlay/30 transition-colors text-left">
        <div className="mt-1 shrink-0">
          {hasResp ? <CheckCircle2 size={13} className="text-green-400"/> : <Circle size={13} className="text-border"/>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary leading-snug">{q.questionText}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {typeLabel && (
              <span className="text-[9px] bg-surface-overlay border border-border px-1.5 py-0.5 rounded text-text-muted uppercase tracking-wide">
                {typeLabel}
              </span>
            )}
            {q.mandatory && <span className="text-[9px] text-red-400 font-semibold">Required</span>}
            {q.weight>0 && <span className="text-[9px] text-text-muted">{q.weight} pts</span>}
            {showScores && resp?.scoreEarned!=null && (
              <span className="text-[9px] text-green-400 font-semibold bg-green-500/8 px-1.5 py-0.5 rounded">
                {resp.scoreEarned}/{q.weight} pts
              </span>
            )}
            {showReviewer && resp?.reviewerStatus && resp.reviewerStatus!=='PENDING' && (
              <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded',
                resp.reviewerStatus==='PASS'?'bg-green-500/10 text-green-400':
                resp.reviewerStatus==='PARTIAL'?'bg-amber-500/10 text-amber-400':
                'bg-red-500/10 text-red-400')}>
                {resp.reviewerStatus}
              </span>
            )}
            {showActionItems && q.questionInstanceId && (() => {
              // inline badge — counts only, actual banners shown on expand
              return null
            })()}
            {resp?.documents?.length>0 && (
              <span className="text-[9px] text-brand-400 flex items-center gap-0.5">
                <Paperclip size={9}/>{resp.documents.length}
              </span>
            )}
          </div>
        </div>
        {q.assignedUserName && (
          <div className="shrink-0 flex items-center gap-1 text-[10px] text-text-muted">
            <Avatar name={q.assignedUserName} size="xs"/>
          </div>
        )}
        {/* Drawer trigger — opens full collaboration panel */}
        {onOpenDrawer && q.questionInstanceId && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenDrawer(q) }}
            title="Open collaboration drawer"
            className="shrink-0 p-1 rounded hover:bg-surface-overlay text-text-muted/50 hover:text-brand-400 transition-colors ml-1">
            <MessageSquare size={12} />
          </button>
        )}
        {open ? <ChevronDown size={12} className="text-text-muted shrink-0 mt-1"/>
              : <ChevronRight size={12} className="text-text-muted shrink-0 mt-1"/>}
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-3 bg-surface-overlay/10">

          {/* Options */}
          {q.options?.length>0 && (
            <div className="space-y-1.5">
              <SectionLabel>Options</SectionLabel>
              {q.options.map(opt => {
                const isSel = selectedIds.includes(Number(opt.optionInstanceId))
                return (
                  <div key={opt.optionInstanceId}
                    className={cn('flex items-center justify-between px-3 py-2 rounded-lg border text-xs',
                      isSel?'border-brand-500/40 bg-brand-500/8 text-text-primary':'border-border text-text-muted bg-surface')}>
                    <div className="flex items-center gap-2">
                      <div className={cn('w-2 h-2 rounded-full shrink-0', isSel?'bg-brand-400':'bg-surface-overlay border border-border')}/>
                      {opt.optionValue}
                      {isSel && <span className="text-[9px] font-semibold text-brand-400 bg-brand-500/10 px-1 rounded">Selected</span>}
                    </div>
                    {showScores && opt.score!=null && (
                      <span className={cn('text-[10px] font-mono font-semibold', isSel?'text-green-400':'text-text-muted/60')}>
                        {opt.score} pts
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Text response — skip for choice questions: options above already show selected state.
               Also skip when responseText is a raw JSON array "[...]" (multi-choice stored IDs). */}
          {resp?.responseText
            && q.responseType !== 'MULTI_CHOICE'
            && q.responseType !== 'SINGLE_CHOICE'
            && !resp.responseText.startsWith('[') && (
            <div>
              <SectionLabel>Response</SectionLabel>
              <div className="px-3 py-2.5 rounded-lg bg-surface border border-border">
                <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">{resp.responseText}</p>
              </div>
            </div>
          )}

          {/* Answered by */}
          {resp?.answeredByName && (
            <div className="flex items-center gap-2">
              <Avatar name={resp.answeredByName} size="xs"/>
              <p className="text-[10px] text-text-muted">
                Answered by <span className="text-text-secondary">{resp.answeredByName}</span>
                {resp.submittedAt && <> · {formatDate(resp.submittedAt)}</>}
              </p>
            </div>
          )}

          {/* Reviewer evaluation comment */}
          {showReviewer && resp?.reviewerComment && (
            <div className="px-3 py-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20">
              <SectionLabel>Reviewer Comment</SectionLabel>
              <p className="text-xs text-text-secondary">{resp.reviewerComment}</p>
            </div>
          )}

          {/* Inline response comments (from resp.comments) */}
          {resp?.comments?.length>0 && (
            <div>
              <SectionLabel>Thread ({resp.comments.length})</SectionLabel>
              <div className="space-y-2">
                {resp.comments.map((c,ci)=>(
                  <div key={ci} className="flex gap-2">
                    <Avatar name={c.commenterName||'?'} size="xs"/>
                    <div>
                      <p className="text-[10px] text-text-muted">{c.commenterName} · {formatDate(c.createdAt)}</p>
                      <p className="text-xs text-text-secondary mt-0.5">{c.commentText}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live per-question discussion */}
          {showComments && q.questionInstanceId && (
            <div>
              <SectionLabel>Discussion</SectionLabel>
              <QuestionComments questionInstanceId={q.questionInstanceId}/>
            </div>
          )}

          {/* Evidence / documents */}
          {showEvidence && resp?.documents?.length>0 && (
            <div>
              <SectionLabel>Evidence ({resp.documents.length})</SectionLabel>
              <div className="space-y-1.5">
                {resp.documents.map((doc,di)=>(
                  <a key={di} href={doc.url||doc.fileUrl||'#'} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface hover:border-brand-500/40 hover:bg-brand-500/5 transition-colors text-xs text-brand-400">
                    <Paperclip size={11} className="shrink-0"/>
                    <span className="flex-1 truncate">{doc.fileName||doc.name||'Document'}</span>
                    <ExternalLink size={10} className="shrink-0 text-text-muted"/>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Action items — remediations + clarifications */}
          {showActionItems && q.questionInstanceId && (
            <QuestionActionItems questionInstanceId={q.questionInstanceId}/>
          )}

          {!hasResp && <p className="text-xs text-text-muted italic">No response submitted yet.</p>}
        </div>
      )}
    </div>
  )
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ section, idx, viewMode, assessmentId, userId, onOpenDrawer }) {
  const [open, setOpen] = useState(false)
  const answered = section.questions?.filter(q=>!!q.currentResponse).length ?? 0
  const total    = section.questions?.length ?? 0
  const pct      = total>0 ? Math.round(answered*100/total) : 0

  // Per-viewMode rendering rules
  const isStructure = viewMode === 'vendor_vrm'
  const showScores  = viewMode === 'org_full' || viewMode === 'org_ciso'
  const showReviewer= viewMode === 'org_full' || viewMode === 'org_ciso' || viewMode === 'reviewer'
  const showActions = viewMode !== 'vendor_vrm'
  const showComments= viewMode !== 'vendor_vrm' && viewMode !== 'contributor'
  const showEvidence= viewMode !== 'vendor_vrm'

  // For RESPONDER: show non-answered only if it's their own section
  // For VENDOR_CISO/VRM: show all answered, hide unanswered
  const showOnlyAnswered = viewMode === 'vendor_ciso' || viewMode === 'vendor_vrm'
  const visibleQuestions = showOnlyAnswered
    ? (section.questions||[]).filter(q => !!q.currentResponse)
    : (section.questions||[])

  // Reviewer assignment indicator
  const reviewerAssigned = section.reviewerAssignedUserName

  return (
    <Card className="overflow-hidden">
      <button onClick={()=>setOpen(o=>!o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface-overlay/40 transition-colors text-left bg-surface">
        <div className="w-7 h-7 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0 text-xs font-bold text-brand-400">
          {idx+1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">{section.sectionName}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-[10px] text-text-muted">{answered}/{total} answered</p>
            {section.assignedUserName && (
              <span className="text-[10px] text-text-muted flex items-center gap-1">
                · <User size={9}/>{section.assignedUserName}
              </span>
            )}
            {reviewerAssigned && (
              <span className="text-[10px] text-purple-400 flex items-center gap-1">
                · <Eye size={9}/>{reviewerAssigned}
              </span>
            )}
            {section.submittedAt && (
              <span className="text-[10px] text-green-400">· Submitted {formatDate(section.submittedAt)}</span>
            )}
            {section.reviewerSubmittedAt && (
              <span className="text-[10px] text-purple-400">· Reviewed {formatDate(section.reviewerSubmittedAt)}</span>
            )}
            {isStructure && (
              <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium',
                pct===100?'bg-green-500/10 text-green-400':pct>0?'bg-amber-500/10 text-amber-400':'bg-surface-overlay text-text-muted')}>
                {pct===100?'Complete':pct>0?'In Progress':'Not Started'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-20 h-1.5 rounded-full bg-surface-overlay overflow-hidden hidden sm:block">
            <div className={cn('h-full rounded-full transition-all', pct===100?'bg-green-500':'bg-brand-500')}
              style={{width:`${pct}%`}}/>
          </div>
          <span className="text-[10px] font-mono text-text-muted w-7 text-right">{pct}%</span>
          {open?<ChevronDown size={13} className="text-text-muted"/>:<ChevronRight size={13} className="text-text-muted"/>}
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-surface-raised/20">
          {isStructure ? (
            /* Structure-only view — just question list with assignment */
            <div className="divide-y divide-border">
              {(section.questions||[]).map((q,qi)=>(
                <div key={q.questionInstanceId??qi} className="px-5 py-3 flex items-center gap-3">
                  <div className="shrink-0">
                    {q.currentResponse?<CheckCircle2 size={12} className="text-green-400"/>:<Circle size={12} className="text-border"/>}
                  </div>
                  <p className="flex-1 text-xs text-text-secondary">{q.questionText}</p>
                  <div className="flex items-center gap-2 shrink-0 text-[9px] text-text-muted">
                    {q.assignedUserName && <span className="flex items-center gap-1"><User size={9}/>{q.assignedUserName}</span>}
                    {q.mandatory && <span className="text-red-400">Req.</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : visibleQuestions.length === 0 ? (
            <p className="px-5 py-6 text-xs text-text-muted italic text-center">No answered questions to display.</p>
          ) : (
            <div className="divide-y divide-border">
              {visibleQuestions.map((q,qi)=>(
                <QuestionRow
                  key={q.questionInstanceId??qi}
                  q={q}
                  showScores={showScores}
                  showReviewer={showReviewer}
                  showActionItems={showActions}
                  showComments={showComments}
                  showEvidence={showEvidence}
                  onOpenDrawer={onOpenDrawer}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ─── History entry ────────────────────────────────────────────────────────────

function HistoryEntry({ entry }) {
  const action = entry.action || entry.eventType || ''
  const color =
    action.includes('APPROVED')||action.includes('COMPLETED') ? 'text-green-400':
    action.includes('PENDING') ||action.includes('PROGRESS')  ? 'text-amber-400':
    action.includes('REJECTED')||action.includes('CANCELLED') ? 'text-red-400'  : 'text-brand-400'
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className={cn('w-1.5 h-1.5 rounded-full mt-2 shrink-0', color.replace('text-','bg-'))}/>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-text-primary font-medium">{entry.stepName||'Workflow Event'}</p>
          <span className={cn('text-[10px] font-mono', color)}>{action}</span>
        </div>
        {entry.performedByName && <p className="text-[10px] text-text-muted mt-0.5">by {entry.performedByName}</p>}
        {entry.remarks && <p className="text-[10px] text-text-muted/70 italic mt-0.5">"{entry.remarks}"</p>}
      </div>
      <p className="text-[10px] text-text-muted shrink-0 font-mono">{formatDateTime(entry.createdAt)}</p>
    </div>
  )
}

// ─── Findings & Gaps tab ──────────────────────────────────────────────────────
// Full lifecycle: OPEN → IN_PROGRESS → PENDING_REVIEW → PENDING_VALIDATION → RESOLVED
// All roles see; resolve/validate gated by canResolve.

function FindingsTab({ assessmentId }) {
  const { data: items = [], isLoading } = useEntityActionItems('ASSESSMENT', assessmentId, { enabled: !!assessmentId })
  const { mutate: updateStatus } = useUpdateActionItemStatus()

  const PRIORITY_DOT   = { CRITICAL:'bg-red-400', HIGH:'bg-amber-400', MEDIUM:'bg-blue-400', LOW:'bg-border' }
  const PRIORITY_BADGE = {
    CRITICAL: 'bg-red-500/10 text-red-400',
    HIGH:     'bg-amber-500/10 text-amber-400',
    MEDIUM:   'bg-blue-500/10 text-blue-400',
    LOW:      'bg-surface-overlay text-text-muted',
  }

  if (isLoading) return (
    <div className="space-y-3">{[1,2,3].map(i=>(
      <div key={i} className="h-20 rounded-xl bg-surface-overlay animate-pulse"/>
    ))}</div>
  )

  if (!items.length) return (
    <Card className="text-center py-14">
      <CheckCheck size={30} className="text-green-400 mx-auto mb-3"/>
      <p className="text-sm font-medium text-text-primary">No findings or gaps</p>
      <p className="text-xs text-text-muted mt-1">This assessment has no tracked findings.</p>
    </Card>
  )

  const countByStatus = (statuses) => items.filter(i=>statuses.includes(i.status)).length
  const open     = countByStatus(['OPEN','IN_PROGRESS'])
  const pending  = countByStatus(['PENDING_REVIEW','PENDING_VALIDATION'])
  const resolved = countByStatus(['RESOLVED'])

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex items-center gap-5 px-4 py-3 rounded-xl border border-border bg-surface text-xs">
        <span><span className="font-semibold text-text-primary">{items.length}</span> <span className="text-text-muted">total</span></span>
        <span><span className="font-semibold text-red-400">{open}</span> <span className="text-text-muted">open</span></span>
        <span><span className="font-semibold text-blue-400">{pending}</span> <span className="text-text-muted">pending review</span></span>
        <span><span className="font-semibold text-green-400">{resolved}</span> <span className="text-text-muted">resolved</span></span>
      </div>

      {items.map(item => {
        const statusCls = ACTION_ITEM_STATUS_COLOR[item.status] || ACTION_ITEM_STATUS_COLOR.OPEN
        const canAct    = item.canResolve && ['OPEN','IN_PROGRESS','PENDING_REVIEW','PENDING_VALIDATION'].includes(item.status)
        return (
          <Card key={item.id} className="overflow-hidden bg-surface-raised">
            <div className={cn('px-4 py-3 border-l-4', {
              'border-red-500':    ['OPEN','IN_PROGRESS'].includes(item.status),
              'border-blue-500':   ['PENDING_REVIEW','PENDING_VALIDATION'].includes(item.status),
              'border-green-500':  item.status === 'RESOLVED',
              'border-border':     item.status === 'DISMISSED' || item.status === 'RISK_ACCEPTED',
            })}>
              <div className="flex items-start gap-3">
                <div className={cn('w-2 h-2 rounded-full mt-2 shrink-0', PRIORITY_DOT[item.priority]||PRIORITY_DOT.MEDIUM)}/>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className="text-sm font-medium text-text-primary flex-1">{item.title}</p>
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0', PRIORITY_BADGE[item.priority]||PRIORITY_BADGE.MEDIUM)}>
                      {item.priority}
                    </span>
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0', statusCls)}>
                      {ACTION_ITEM_STATUS_LABEL[item.status]||item.status}
                    </span>
                  </div>
                  {item.description && <p className="text-xs text-text-muted mt-1 leading-relaxed">{item.description}</p>}
                  <div className="flex items-center gap-3 mt-2 flex-wrap text-[10px] text-text-muted">
                    {item.createdByName   && <span>Raised by {item.createdByName}</span>}
                    {item.assignedToName  && <span className="flex items-center gap-1"><User size={9}/>{item.assignedToName}</span>}
                    {item.dueDate         && <span className={cn('flex items-center gap-1',item.isOverdue?'text-red-400':'')}>
                      <CalendarClock size={9}/>Due {formatDate(item.dueDate)}{item.isOverdue&&' — overdue'}
                    </span>}
                    {item.resolutionNote  && <span className="text-green-400">✓ {item.resolutionNote}</span>}
                  </div>
                </div>
                {canAct && (
                  <div className="flex gap-2 shrink-0">
                    {['PENDING_REVIEW','PENDING_VALIDATION'].includes(item.status) && (
                      <button onClick={()=>updateStatus({id:item.id,status:'RESOLVED',resolutionNote:'Validated'})}
                        className="text-[10px] text-green-400/80 hover:text-green-400 px-2.5 py-1.5 rounded-lg border border-green-400/20 hover:border-green-400/50 transition-colors font-medium">
                        Validate
                      </button>
                    )}
                    {['OPEN','IN_PROGRESS'].includes(item.status) && (
                      <button onClick={()=>updateStatus({id:item.id,status:'RESOLVED'})}
                        className="text-[10px] text-green-400/80 hover:text-green-400 px-2.5 py-1.5 rounded-lg border border-green-400/20 hover:border-green-400/50 transition-colors font-medium">
                        Resolve
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ─── Activity / comment feed ──────────────────────────────────────────────────

function ActivityTab({ assessmentId }) {
  const { comments, isLoading, addComment, adding } = useComments(
    'ASSESSMENT', assessmentId, { enabled: !!assessmentId }
  )
  return (
    <Card className="p-5">
      <CommentFeed comments={comments} isLoading={isLoading} addComment={addComment}
        adding={adding} canEdit showVisibility
        emptyMessage="No activity yet. Add a comment to start the discussion." />
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AssessmentDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  useScrollToQuestion([tab])
  const [drawerQuestion, setDrawerQuestion] = useState(null) // question obj for drawer

  const roles      = useSelector(selectRoles)
  const { userId } = useSelector(selectAuth)

  const viewMode   = resolveViewMode(roles)
  const isOrgSide  = ['org_full','org_ciso','reviewer','review_assistant'].includes(viewMode)

  // Derive user side and role for drawer
  const userSide = isOrgSide ? 'ORGANIZATION' : 'VENDOR'
  const userRole = roles?.find(r => r.name || r.roleName)?.name
              ?? roles?.find(r => r.name || r.roleName)?.roleName
              ?? ''
  const drawerMode = (() => {
    if (viewMode === 'reviewer' || viewMode === 'org_ciso' || viewMode === 'org_full') return 'reviewer'
    if (viewMode === 'review_assistant') return 'readonly'
    if (viewMode === 'responder' || viewMode === 'vendor_ciso' || viewMode === 'vendor_vrm') return 'responder'
    if (viewMode === 'contributor')      return 'contributor'
    return 'readonly'
  })()

  // Data
  const { data: assessment, isLoading: assessmentLoading } = useAssessment(id)
  const workflowInstanceId = assessment?.workflowInstanceId

  // Progress: raw array — passed directly to WorkflowTimeline component
  const { data: progressRaw, isLoading: progressLoading } = useWorkflowProgress(workflowInstanceId)
  // Summary extracted for stats
  const progressSummary = useMemo(()=>{
    if (!progressRaw) return null
    return Array.isArray(progressRaw) ? progressRaw[0] : progressRaw
  }, [progressRaw])

  const { data: historyData } = useWorkflowHistory(workflowInstanceId)
  const { data: activeTask  } = useMyActiveTask(id, assessment?.vendorId)

  // Derived
  const statusMeta     = STATUS_CFG[assessment?.status] || { label: assessment?.status, color:'gray' }
  const prog           = assessment?.progress || {}
  const pct            = prog.percentComplete ?? 0
  const steps          = progressSummary?.steps || []
  const totalSteps     = progressSummary?.totalSteps || 0
  const stepsCompleted = progressSummary?.stepsCompleted || 0
  const currentStep    = steps.find(s=>s.isCurrentStep)?.stepName
  const history        = historyData || []
  const riskCfg        = RISK_CFG[assessment?.riskRating]
  const scorePct       = (assessment?.totalEarnedScore!=null && assessment?.totalPossibleScore)
    ? Math.round(assessment.totalEarnedScore/assessment.totalPossibleScore*100) : null

  // Section filtering per role
  const sections = useMemo(()=>{
    const all = assessment?.sections || []
    if (viewMode === 'contributor') {
      // Show only sections containing their delegated question
      return all.filter(s => s.questions?.some(q => q.assignedUserId===userId || q.reviewerAssignedUserId===userId))
    }
    if (viewMode === 'review_assistant') {
      return all.filter(s => s.questions?.some(q => q.reviewerAssignedUserId===userId))
    }
    if (viewMode === 'responder') {
      // Responder sees their sections + all answered (read-only) from others
      // but ONLY answered from others, not unanswered
      return all // filtering is per-question in SectionCard
    }
    return all
  }, [assessment?.sections, viewMode, userId])

  const bannerCfg = ROLE_BANNER[viewMode]

  if (assessmentLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={22} className="animate-spin text-text-muted"/>
    </div>
  )

  if (!assessment) return (
    <div className="p-12 text-center">
      <Shield size={32} className="text-text-muted mx-auto mb-3"/>
      <p className="text-sm text-text-muted">Assessment not found or you do not have access.</p>
    </div>
  )

  return (
    <>
    <PageLayout
      title={assessment.templateName || 'Assessment'}
      subtitle={[
        assessment.vendorName,
        assessment.cycleNo ? `Cycle ${assessment.cycleNo}` : null,
      ].filter(Boolean).join(' · ')}
      actions={
        <div className="flex items-center gap-2">
          <Badge value={assessment.status} label={statusMeta.label} colorTag={statusMeta.color}/>
          {/* Shown only when the user has an active PENDING task for this assessment.
              Label and URL are role-aware — routes to the correct workflow page.
              No active task = no button (read-only observer view). */}
          {activeTask && (
            <Button size="sm" variant="primary" icon={ExternalLink}
              onClick={()=>navigate(activeTask.url)}>
              {activeTask.label}
            </Button>
          )}

        </div>
      }
    >
      {/* Tab bar */}
      <div className="flex items-center px-6 border-b border-border bg-surface overflow-x-auto shrink-0">
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-3 text-[11px] font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
              tab===t.key
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}>
            <t.icon size={12}/>{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6 max-w-5xl mx-auto space-y-5">

        {/* ════ OVERVIEW ════ */}
        {tab==='overview' && (
          <>
            {/* Top: gauge + KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4">
              <Card className="p-5 flex items-center gap-5 md:min-w-[200px]">
                <ScoreGauge pct={pct} size={84}/>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-1">Completion</p>
                  <p className="text-lg font-semibold text-text-primary">{pct}%</p>
                  <p className="text-[10px] text-text-muted mt-0.5">{prog.answered??0} of {prog.totalQuestions??0} answered</p>
                  <div className="w-full h-1 rounded-full bg-surface-overlay mt-3 overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-700',pct===100?'bg-green-500':'bg-brand-500')}
                      style={{width:`${pct}%`}}/>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Score Earned" icon={Star}
                  value={assessment.totalEarnedScore!=null
                    ? `${assessment.totalEarnedScore.toFixed(0)} / ${assessment.totalPossibleScore?.toFixed(0)??'?'}`
                    : null}
                  sub={scorePct!=null?`${scorePct}% of total`:'Not scored yet'}
                  color={scorePct!=null&&scorePct>=70?'green':scorePct!=null&&scorePct>=40?'amber':'default'}/>

                {/* Risk rating — special card */}
                <div className={cn('rounded-xl border p-4 flex flex-col gap-1.5 min-h-[88px]',
                  riskCfg?`${riskCfg.bg} ${riskCfg.border}`:'bg-surface border-border')}>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Risk Rating</p>
                    <Shield size={13} className="text-text-muted/60"/>
                  </div>
                  {riskCfg ? (
                    <>
                      <p className={cn('text-lg font-semibold leading-none',riskCfg.color)}>{riskCfg.label}</p>
                      <div className="flex items-center gap-1.5 mt-auto">
                        <div className="flex-1 h-1 rounded-full bg-black/10 overflow-hidden">
                          <div className={cn('h-full rounded-full',riskCfg.bar)} style={{width:riskCfg.pct}}/>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-text-muted/50 italic font-normal mt-1">Pending review</p>
                  )}
                </div>

                <StatCard label="Workflow Step" icon={Activity}
                  value={currentStep||null}
                  sub={totalSteps?`${stepsCompleted} of ${totalSteps} steps done`:undefined}/>
              </div>
            </div>

            {/* Metadata — only populated cells */}
            {(() => {
              const cells = [
                { label:'Vendor',    value:assessment.vendorName },
                { label:'Template',  value:assessment.templateName },
                { label:'Cycle',     value:assessment.cycleNo?`Cycle ${assessment.cycleNo}`:null },
                { label:'Started',   value:assessment.createdAt  ?formatDate(assessment.createdAt)  :null },
                { label:'Submitted', value:assessment.submittedAt?formatDate(assessment.submittedAt):null },
                { label:'Completed', value:assessment.completedAt?formatDate(assessment.completedAt):null },
              ].filter(c=>c.value)
              return cells.length ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {cells.map(c=><MetaCell key={c.label} label={c.label} value={c.value}/>)}
                </div>
              ) : null
            })()}

            {/* Reviewer findings */}
            {assessment.reviewFindings && (
              <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5">
                <SectionLabel>Reviewer Findings</SectionLabel>
                <p className="text-sm text-text-secondary leading-relaxed">{assessment.reviewFindings}</p>
              </div>
            )}

            {/* Report download */}
            {assessment.reportUrl && (
              <Card className="flex items-center justify-between p-4 bg-green-500/5 border-green-500/20">
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-green-400 shrink-0"/>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Assessment Report Ready</p>
                    <p className="text-[10px] text-text-muted mt-0.5">Final report generated</p>
                  </div>
                </div>
                <a href={assessment.reportUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 text-green-400 text-xs font-semibold hover:bg-green-500/20 transition-colors">
                  <Download size={12}/> Download
                </a>
              </Card>
            )}

            {/* Mini workflow timeline — uses the real WorkflowTimeline component */}
            {(progressLoading || steps.length>0) && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <SectionLabel>Workflow Progress</SectionLabel>
                  {totalSteps>0 && (
                    <span className="text-[10px] text-text-muted font-mono">{stepsCompleted}/{totalSteps} steps</span>
                  )}
                </div>
                <Card className="p-4">
                  {progressLoading
                    ? <div className="flex items-center gap-2 py-2">
                        <Loader2 size={14} className="animate-spin text-text-muted"/>
                        <span className="text-xs text-text-muted">Loading workflow…</span>
                      </div>
                    : <WorkflowTimeline progress={progressRaw}/>
                  }
                </Card>
              </div>
            )}
          </>
        )}

        {/* ════ SECTIONS & ANSWERS ════ */}
        {tab==='sections' && (
          <div className="space-y-3">
            {/* Role context banner */}
            {bannerCfg && (
              <div className={cn('flex items-center gap-2 px-4 py-2.5 rounded-lg border text-xs', bannerCfg.color)}>
                <bannerCfg.icon size={12} className="shrink-0"/>{bannerCfg.label}
              </div>
            )}

            {sections.length===0 ? (
              <Card className="text-center py-12">
                <Info size={24} className="text-text-muted mx-auto mb-2"/>
                <p className="text-sm text-text-muted">
                  {viewMode==='contributor'||viewMode==='review_assistant'
                    ? 'No questions assigned to you yet.'
                    : 'No sections available.'}
                </p>
              </Card>
            ) : sections.map((section,i)=>(
              <SectionCard key={section.sectionInstanceId??i}
                section={section} idx={i}
                viewMode={viewMode} assessmentId={id} userId={userId}
                onOpenDrawer={setDrawerQuestion}/>
            ))}
          </div>
        )}

        {/* ════ WORKFLOW TIMELINE ════ */}
        {tab==='timeline' && (
          progressLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={20} className="animate-spin text-text-muted"/>
            </div>
          ) : (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {progressSummary?.workflowName || 'Workflow Timeline'}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {stepsCompleted} of {totalSteps} steps completed
                  </p>
                </div>
              </div>
              {steps.length===0 ? (
                <div className="text-center py-10">
                  <CalendarClock size={24} className="text-text-muted mx-auto mb-2"/>
                  <p className="text-xs text-text-muted">
                    {workflowInstanceId ? 'No steps found.' : 'No workflow linked to this assessment.'}
                  </p>
                </div>
              ) : (
                /* Uses the existing WorkflowTimeline component — same as VendorDetailPage */
                <WorkflowTimeline progress={progressRaw}/>
              )}
            </Card>
          )
        )}

        {/* ════ AUDIT HISTORY ════ */}
        {tab==='history' && (
          <Card className="overflow-hidden">
            {history.length===0 ? (
              <div className="text-center py-12">
                <FileText size={24} className="text-text-muted mx-auto mb-2"/>
                <p className="text-xs text-text-muted">No audit history available.</p>
              </div>
            ) : (
              <div className="divide-y divide-border p-4">
                {history.map((entry,i)=><HistoryEntry key={entry.id??i} entry={entry}/>)}
              </div>
            )}
          </Card>
        )}

        {/* ════ ACTIVITY ════ */}
        {tab==='activity' && <ActivityTab assessmentId={id}/>}

        {/* ════ FINDINGS & GAPS ════ */}
        {tab==='findings' && <FindingsTab assessmentId={id}/>}

      </div>
    </PageLayout>

    {/* Per-question collaboration drawer */}
    <QuestionDrawer
      question={drawerQuestion}
      assessmentId={id}
      userSide={userSide}
      userRole={userRole}
      mode={drawerMode}
      onClose={() => setDrawerQuestion(null)}
    />
  </>
  )
}