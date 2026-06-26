/**
 * ProjectEngagementsTab.jsx — "Engagements" tab inside the AUDIT_PROJECT detail
 *
 * Two modes driven by vc.stepAction:
 *
 * ASSIGN mode (Step 2 — Assign Lead Auditors):
 *   - Shows inline lead auditor picker per engagement row
 *   - PATCH /v1/audit/engagements/{id} with { leadAuditorId }
 *   - When ALL engagements have a leadAuditorId set → POST section complete
 *     so the ENGAGEMENTS_LEAD_ASSIGNED section auto-approves the task
 *
 * VIEW mode (all other steps):
 *   - Read-only list, click row → /module/audit_engagement/:id
 */

import { useState, useMemo }   from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate }         from 'react-router-dom'
import {
  ClipboardList, AlertTriangle, Calendar,
  ChevronRight, UserCheck, CheckCircle2, Users,
} from 'lucide-react'
import { auditApi }   from '../../api/audit.api'
import api            from '../../config/axios.config'
import { Badge }      from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { formatDate } from '../../utils/format'
import toast          from 'react-hot-toast'

const STATUS_COLOR = {
  PLANNING:            'gray',
  FIELDWORK:           'blue',
  EVIDENCE_REVIEW:     'indigo',
  DRAFT_REPORT:        'purple',
  MANAGEMENT_RESPONSE: 'amber',
  FINAL_REPORT:        'teal',
  CLOSED:              'green',
  CANCELLED:           'red',
}

// ── API helpers ───────────────────────────────────────────────────────────────
const fetchEligibleUsers = (stepInstanceId) =>
  api.get(`/v1/workflow-instances/steps/${stepInstanceId}/eligible-users`)
    .then(r => {
      const d = r?.data?.data || r?.data || r
      return Array.isArray(d) ? d : []
    })

const patchEngagement = (id, fields) =>
  api.patch(`/v1/audit/engagements/${id}`, fields)

// Mark a specific engagement item complete within the ENGAGEMENTS_LEAD_ASSIGNED section
const completeEngagementItem = (taskId, sectionKey, engagementId) =>
  api.post(`/v1/compound-tasks/${taskId}/sections/${sectionKey}/items/by-ref/${engagementId}/complete`)

// ── User label ────────────────────────────────────────────────────────────────
function UserLabel({ userId, users }) {
  if (!userId) return <span className="text-text-muted italic">Unassigned</span>
  const u = users?.find(u => (u.userId || u.id) === userId)
  if (!u) return <span className="text-text-muted">#{userId}</span>
  return <span>{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}</span>
}

// ── Auditor picker dropdown ───────────────────────────────────────────────────
function AuditorPicker({ value, users, onChange, saving }) {
  // value is Long from backend, option values are strings in HTML — normalise both to string
  const strValue = value != null ? String(value) : ''
  return (
    <select
      value={strValue}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      disabled={saving}
      onClick={e => e.stopPropagation()}
      className="text-[11px] bg-surface border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-brand-500/50 disabled:opacity-50"
    >
      <option value="">— Assign lead auditor —</option>
      {(users || []).map(u => {
        const uid  = u.userId || u.id
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.fullName || u.email
        return <option key={uid} value={String(uid)}>{name}</option>
      })}
      {/* If assigned user is not in eligibleUsers (e.g. step already advanced), show their id */}
      {value && !(users || []).some(u => String(u.userId || u.id) === strValue) && (
        <option value={strValue}>User #{value}</option>
      )}
    </select>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function DualProgressBar({ submitted, tested, total }) {
  const submittedPct = total > 0 ? Math.round((submitted / total) * 100) : 0
  const testedPct    = total > 0 ? Math.round((tested    / total) * 100) : 0
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-text-muted w-14 shrink-0">Evidence</span>
        <div className="flex-1 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
          <div className="h-full bg-green-500/60 rounded-full transition-all" style={{ width: `${submittedPct}%` }} />
        </div>
        <span className="text-[9px] text-text-muted tabular-nums w-7 text-right">{submittedPct}%</span>
      </div>
      {tested > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-text-muted w-14 shrink-0">Evaluated</span>
          <div className="flex-1 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
            <div className="h-full bg-brand-400 rounded-full transition-all" style={{ width: `${testedPct}%` }} />
          </div>
          <span className="text-[9px] text-text-muted tabular-nums w-7 text-right">{testedPct}%</span>
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function ProjectEngagementsTab({ projectId, vc = {}, stepInstanceId, taskId, onTaskComplete }) {
  const navigate = useNavigate()
  const qc       = useQueryClient()

  // isAssignStep: true only when the active step is an ASSIGN step AND the
  // visibleTabs do NOT include 'sections'. This distinguishes:
  //   Step 2 (Assign Lead Auditors): visibleTabs = [engagements, workflow, comments]
  //   Step 3 (Assign Sections):      visibleTabs = [engagements, sections, workflow, comments]
  //   Step 4 (Assign Evidence):      visibleTabs = [engagements, sections, workflow, comments]
  // Steps 3 & 4 show the sections tab — their assignment UI lives in EngagementSectionsTab,
  // not here. No step names or IDs hardcoded — driven entirely by what the backend sends.
  const visibleTabs = vc.visibleTabs || []
  // isAssignStep: only true when opened FROM a task (taskId present in URL).
  // Direct navigation to /module/audit_project/39 should always be read-only
  // even if the active workflow step is ASSIGN — the user must be acting on
  // a specific task to get the assignment UI.
  const isAssignStep = !!taskId
    && (vc.stepAction || '').toUpperCase() === 'ASSIGN'
    && (visibleTabs.length === 0 || !visibleTabs.includes('sections'))

  // ── Data fetches ──────────────────────────────────────────────────────────
  const { data: engagements = [], isLoading } = useQuery({
    queryKey: ['project-engagements', projectId],
    queryFn:  () => auditApi.engagements.list({ projectInstanceId: projectId, take: 100 }),
    enabled:  !!projectId,
    select:   d => d?.data?.items ?? d?.items ?? d?.data ?? d ?? [],
  })

  const { data: eligibleUsers = [] } = useQuery({
    queryKey: ['step-eligible-users', stepInstanceId],
    queryFn:  () => fetchEligibleUsers(stepInstanceId),
    staleTime: 5 * 60_000,
    enabled:  isAssignStep && !!stepInstanceId,
  })

  // ── Assignment mutation ───────────────────────────────────────────────────
  const [savingId, setSavingId] = useState(null)

  const assignMutation = useMutation({
    mutationFn: ({ engId, userId }) => patchEngagement(engId, { leadAuditorId: userId }),
    onMutate:   ({ engId }) => setSavingId(engId),
    onSettled:  () => setSavingId(null),
    onSuccess:  async (_, { engId }) => {
      qc.invalidateQueries({ queryKey: ['project-engagements', projectId] })

      // Mark this specific engagement's item complete in the compound task section.
      // completeItemByRef looks up the item by engagementId (itemRefId) — no PK needed.
      // When ALL engagement items are complete, the backend auto-approves the task
      // and the workflow advances to the next step automatically.
      if (taskId) {
        try {
          await completeEngagementItem(taskId, 'ENGAGEMENTS_LEAD_ASSIGNED', engId)
          qc.invalidateQueries({ queryKey: ['workflow-progress'] })
          // If all assigned, the backend auto-approves the task.
          // Trigger seamless transition to the next task for this user.
          const latest = await auditApi.engagements
            .list({ projectInstanceId: projectId, take: 100 })
            .then(d => d?.data?.items ?? d?.items ?? d?.data ?? d ?? [])
          const allAssigned = latest.every(e => !!e.leadAuditorId)
          const remaining = latest.filter(e => !e.leadAuditorId).length
          if (allAssigned) {
            toast.success('All lead auditors assigned — step will complete ✓')
            // Small delay for backend to finish auto-approval + step advancement
            setTimeout(() => onTaskComplete?.(), 1200)
          } else {
            toast.success(`Lead auditor assigned (${remaining} engagement${remaining !== 1 ? 's' : ''} remaining)`)
          }
        } catch (err) {
          console.warn('[completeEngagementItem] skipped:', err?.response?.data?.message)
        }
      }
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to assign'),
  })

  // ── Derived stats for assign mode ─────────────────────────────────────────
  const assignedCount = useMemo(
    () => engagements.filter(e => !!e.leadAuditorId).length,
    [engagements]
  )
  const allAssigned = assignedCount === engagements.length && engagements.length > 0

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 py-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-lg bg-surface-overlay animate-pulse" />
        ))}
      </div>
    )
  }

  if (!engagements?.length) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No engagements yet"
        description="Engagements started from this project's planned templates will appear here."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3 py-2">

      {/* ── Progress banner in assign mode ─── */}
      {isAssignStep && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium
          ${allAssigned
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
          {allAssigned
            ? <><CheckCircle2 size={13}/> All {engagements.length} engagements have lead auditors assigned — step will complete</>
            : <><Users size={13}/> {assignedCount}/{engagements.length} engagements assigned — assign a lead auditor to each</>}
        </div>
      )}

      {/* ── Engagement rows ─── */}
      {engagements.map(eng => (
        <div
          key={eng.id}
          className="rounded-lg border border-border bg-surface-raised hover:bg-surface-overlay transition-colors p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <ClipboardList size={18} className="text-text-muted mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-text-primary text-sm">{eng.name}</span>
                  <span className="text-xs text-text-muted font-mono">{eng.engagementRef}</span>
                  <Badge color={STATUS_COLOR[eng.status] ?? 'gray'} size="sm">
                    {eng.status?.replace(/_/g, ' ')}
                  </Badge>
                </div>

                {eng.totalControls > 0 && (
                  <DualProgressBar
                    submitted={eng.submittedControls ?? 0}
                    tested={eng.testedControls ?? 0}
                    total={eng.totalControls}
                  />
                )}

                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {/* Lead auditor — picker in assign mode, label otherwise */}
                  {isAssignStep ? (
                    <div className="flex items-center gap-1.5">
                      <UserCheck size={11} className={eng.leadAuditorId ? 'text-green-400' : 'text-text-muted'} />
                      <AuditorPicker
                        value={eng.leadAuditorId}
                        users={eligibleUsers}
                        saving={savingId === eng.id}
                        onChange={uid => assignMutation.mutate({ engId: eng.id, userId: uid })}
                      />
                    </div>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-text-muted">
                      <UserCheck size={11} className="text-brand-400" />
                      <UserLabel userId={eng.leadAuditorId} users={eligibleUsers} />
                    </span>
                  )}

                  <span className="text-xs text-text-muted">{eng.totalControls ?? 0} controls</span>

                  {eng.openFindingCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-red-400">
                      <AlertTriangle size={11} />{eng.openFindingCount} findings
                    </span>
                  )}
                  {eng.plannedStart && (
                    <span className="flex items-center gap-1 text-xs text-text-muted">
                      <Calendar size={11} />{formatDate(eng.plannedStart)}
                      {eng.plannedEnd && <> – {formatDate(eng.plannedEnd)}</>}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Navigate to engagement detail — always visible, card also clickable in view mode */}
            <button
              onClick={e => {
                e.stopPropagation()
                // Find the current user's active task for this engagement from cache.
                // After AuditProjectEntityResolver fix, engagement-level step tasks
                // have artifactId=engagementId — match against that.
                const cachedTasks = qc.getQueryData(['my-tasks']) || []
                const task = cachedTasks.find(t =>
                  String(t.artifactId) === String(eng.id) &&
                  ['PENDING', 'IN_PROGRESS'].includes(t.status)
                )
                if (task?.id && task?.stepInstanceId) {
                  navigate(`/module/audit_engagement/${eng.id}?taskId=${task.id}&stepInstanceId=${task.stepInstanceId}`)
                } else {
                  navigate(`/module/audit_engagement/${eng.id}`)
                }
              }}
              className="shrink-0 mt-0.5 text-text-muted hover:text-text-primary"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}