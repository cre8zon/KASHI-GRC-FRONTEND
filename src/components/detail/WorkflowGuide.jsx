/**
 * WorkflowGuide — "what is my part in this workflow, and what do I do now",
 * for every side (organisation, vendor, auditor, auditee).
 *
 *   useWorkflowDefinition  the workflow's steps from the catalogue API
 *   stepGuidance           the current step's "what to do" and the next step
 *   WorkflowGuideDrawer    every step in order; the viewer's own steps marked
 *                          "You", the current one highlighted, finished ones
 *                          ticked; each with its guidance and video chapter
 *
 * Nothing here is per module: it reads the workflow and the viewer's sides.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { X, Play, CheckCircle2, Users, Clock, Bot, GitBranch, AlertTriangle, ChevronDown, UserPlus } from 'lucide-react'
import { usePermission } from '../../hooks/usePermission'
import { cn } from '../../lib/cn'
import api from '../../config/axios.config'

const SIDE_COLOR = {
  ORGANIZATION: '#7c5cd6', VENDOR: '#2f6fd6', AUDITOR: '#d9822b', AUDITEE: '#3f9a8a', SYSTEM: '#9aa1ad',
}
const SIDE_LABEL = {
  ORGANIZATION: 'Organisation', VENDOR: 'Vendor', AUDITOR: 'Auditor', AUDITEE: 'Auditee', SYSTEM: 'System',
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** The workflow's steps (and roles) — the catalogue's one-workflow call. */
export const useWorkflowDefinition = (workflowId) => useQuery({
  queryKey: ['workflow-catalogue-one', workflowId],
  queryFn: () => api.get(`/v1/workflow-catalogue/${workflowId}`),
  enabled: !!workflowId,
  staleTime: 5 * 60_000,
  retry: false,
  select: (d) => d?.data || d,
})

/** Is this step one the viewer works on? Platform users see every step as theirs to read, none as "You". */
export const isViewerStep = (step, viewerSides = []) =>
  !!step?.side && viewerSides.includes(String(step.side).toUpperCase())

// ─── Step rules in plain words ───────────────────────────────────────────────
// What a person needs to know to work a step: who gets the task, who decides
// who gets it, and when the step counts as done. The words mirror the engine's
// ActorResolution / AssignerResolution / ApprovalType / StepAction enums.

const ACTION_WORDS = {
  ASSIGN: 'Assign', FILL: 'Fill in', REVIEW: 'Review', APPROVE: 'Decide',
  ACKNOWLEDGE: 'Acknowledge', EVALUATE: 'Evaluate', GENERATE: 'Generate', CUSTOM: 'Do the step',
}

/**
 * { what, who, assigned, done, extras[] } — short sentences for one step.
 * roles are names; side labels come from SIDE_LABEL.
 */
export function explainStep(s) {
  if (!s) return null
  const roles = (s.roles || []).map(r => r.name)
  const roleText = roles.length ? roles.join(', ') : 'the step\'s role'
  const automated = s.automated && !roles.length
  const who = automated ? 'Nobody — the system runs this step'
    : {
        ENTITY_CREATOR:    'The person who raised the record',
        ENTITY_OWNER:      'The record\'s owner',
        ASSIGNMENT_SCOPED: `Only the people given work in an earlier step${roles.length ? ` (${roleText})` : ''}`,
        ROLE_BASED:        `Everyone with ${roleText}`,
      }[s.actorResolution || 'ROLE_BASED']
  const assigned = automated || ['ENTITY_CREATOR', 'ENTITY_OWNER'].includes(s.actorResolution) ? null
    : {
        POOL:           'Shared queue — the first person to pick it up takes it',
        PUSH_TO_ROLES:  'A coordinator assigns who does it',
        PREVIOUS_ACTOR: 'Whoever finished the previous step picks who does it',
        INITIATOR:      'The person who started the workflow picks who does it',
      }[s.assignerResolution] || null
  const done = automated ? (s.autoCompletes ? 'Completes when the record is created' : 'Completes by itself')
    : {
        ANY_ONE:   'Done when any one of them completes it',
        ALL:       'Done when every one of them completes it',
        MAJORITY:  'Done when most of them approve',
        THRESHOLD: `Done when ${s.minApprovals || 'enough'} of them approve`,
      }[s.approvalType || 'ANY_ONE']
  const extras = []
  if (s.parallel) extras.push('Runs alongside the previous step')
  if (s.optional) extras.push('Can be skipped')
  if (s.slaHours) extras.push(`Expected within ${s.slaHours >= 24 ? `${Math.round(s.slaHours / 24)} day${Math.round(s.slaHours / 24) === 1 ? '' : 's'}` : `${s.slaHours} hours`}`)
  return { what: automated ? 'Automatic' : (ACTION_WORDS[s.stepAction] || null), who, assigned, done, extras }
}

/** The glossary the catalogue shows once, above a workflow's steps. */
export const STEP_GLOSSARY = [
  { term: 'Side', text: 'Whose people work the step — your organisation, the vendor, the auditor, or the system on its own.' },
  { term: 'Who gets the task', text: 'Everyone with the role; only the people given work earlier; the person who raised the record; or the record\'s owner.' },
  { term: 'Assigned by', text: 'Some steps are handed out first — from a shared queue, by a coordinator, by whoever finished the step before, or by whoever started the workflow.' },
  { term: 'Done when', text: 'Any one person completing it, everyone completing it, a majority, or a set number of approvals.' },
  { term: 'Action', text: 'What the step asks for: assign, fill in, review, decide, acknowledge, evaluate or generate.' },
  { term: 'SLA', text: 'How long the step is expected to take before it shows as overdue.' },
]

/** Current step's guidance and the step after it. */
export function stepGuidance(definition, currentStepId) {
  const steps = [...(definition?.steps || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const i = steps.findIndex(s => String(s.id) === String(currentStepId))
  if (i < 0) return { current: null, next: null }
  return { current: steps[i], next: steps[i + 1] || null }
}

/** Who gets the task, how it is handed out, when it is done — as a small list. */
export function StepRules({ step, className, compact = false }) {
  const e = explainStep(step)
  if (!e) return null
  const rows = [
    ['Who gets it', e.who],
    e.assigned ? ['Assigned by', e.assigned] : null,
    ['Done when', e.done ? e.done.replace(/^Done when /, '') : null],
  ].filter(r => r && r[1])
  return (
    <dl className={cn('grid gap-x-2 gap-y-0.5 text-[11.5px] leading-snug', className)}
      style={{ gridTemplateColumns: compact ? '1fr' : 'auto 1fr' }}>
      {rows.map(([k, v]) => compact ? (
        // Narrow cards: label and value on one line, wrapping under the label.
        <div key={k}>
          <dt className="inline text-text-muted">{k}: </dt>
          <dd className="inline text-text-primary m-0">{v}</dd>
        </div>
      ) : (
        <div key={k} className="contents">
          <dt className="text-text-muted whitespace-nowrap">{k}</dt>
          <dd className="text-text-primary m-0">{v}</dd>
        </div>
      ))}
      {e.extras.length > 0 && (
        <dd className="text-text-muted m-0" style={{ gridColumn: '1 / -1' }}>{e.extras.join(' · ')}</dd>
      )}
    </dl>
  )
}

export function WorkflowGuideDrawer({ open, onClose, definition, currentStepId, viewerSides = [], entityType, workflowDone = false }) {
  useEffect(() => {
    if (!open) return
    const esc = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open, onClose])
  if (!open) return null

  const steps = [...(definition?.steps || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const curIdx = steps.findIndex(s => String(s.id) === String(currentStepId))
  const mine = steps.filter(s => isViewerStep(s, viewerSides))
  const catalogue = `/workflow-catalogue/${String(entityType || definition?.entityType || '').toLowerCase()}?workflow=${definition?.id}`

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-label="Workflow guide">
      <button type="button" aria-label="Close guide" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative w-full max-w-[460px] h-full bg-surface-raised border-l border-border shadow-2xl flex flex-col">
        <header className="px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-start gap-2">
            <GitBranch size={16} className="text-brand-ink mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-brand-ink">Workflow guide</p>
              <h2 className="text-[15px] font-semibold text-text-primary">{definition?.name || 'Workflow'}</h2>
              {mine.length > 0 && (
                <p className="text-xs text-text-muted mt-0.5">
                  Your part: step{mine.length === 1 ? '' : 's'} {mine.map(s => s.order).join(', ')}
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label="Close"
              className="w-7 h-7 rounded-ctl flex items-center justify-center text-text-muted hover:bg-surface-overlay">
              <X size={15} />
            </button>
          </div>
          {definition?.hasDemo && (
            <Link to={catalogue} onClick={onClose}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-ink px-2.5 py-1 rounded-full bg-brand-500/8 hover:bg-brand-500/15">
              <Play size={10} fill="currentColor" /> Watch the whole walkthrough
            </Link>
          )}
        </header>

        <ol className="flex-1 overflow-y-auto px-5 py-3 flex flex-col">
          {steps.map((s, i) => {
            const you = isViewerStep(s, viewerSides)
            const current = i === curIdx && !workflowDone
            const done = workflowDone || (curIdx >= 0 && i < curIdx)
            const color = SIDE_COLOR[s.side] || SIDE_COLOR.ORGANIZATION
            return (
              <li key={s.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={cn('w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 text-white',
                    current && 'ring-4 ring-brand-500/20')}
                    style={{ background: done ? '#3f9a63' : color, opacity: !you && !current && !done ? 0.55 : 1 }}>
                    {done ? <CheckCircle2 size={13} /> : s.order}
                  </span>
                  {i < steps.length - 1 && <span className="w-px flex-1 bg-border my-1" />}
                </div>
                <div className={cn('flex-1 min-w-0 pb-4', !you && !current && 'opacity-75')}>
                  <div className={cn('rounded-ctl px-3 py-2 border',
                    current ? 'border-brand-500/50 bg-brand-500/5' : you ? 'border-border bg-surface-raised' : 'border-transparent')}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <strong className="text-[13px] text-text-primary">{s.name}</strong>
                      {you && <span className="text-[10px] font-bold px-1.5 rounded-badge bg-brand-500 text-brand-on">You</span>}
                      {current && <span className="text-[10px] font-semibold px-1.5 rounded-badge bg-status-warn-bg text-status-warn-fg">Now</span>}
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                      {SIDE_LABEL[s.side] || s.side}
                      {s.automated && !s.roles?.length
                        ? <><span>·</span><Bot size={11} /> {s.autoCompletes ? 'completes on creation' : 'runs by itself'}</>
                        : s.roles?.length ? <><span>·</span><Users size={11} /> {s.roles.map(r => r.name).join(', ')}</> : null}
                      {s.slaHours ? <><span>·</span><Clock size={11} /> {s.slaHours >= 24 ? `${Math.round(s.slaHours / 24)}d` : `${s.slaHours}h`}</> : null}
                    </p>
                    {(you || current) && <StepRules step={s} className="mt-1.5" />}
                    {s.guideText && (
                      <p className={cn('text-[12.5px] leading-relaxed mt-1.5 whitespace-pre-wrap',
                        you || current ? 'text-text-primary' : 'text-text-secondary')}>{s.guideText}</p>
                    )}
                    {Number.isFinite(s.demoStartSeconds) && (
                      <Link to={`${catalogue}&at=${s.demoStartSeconds}`} onClick={onClose}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-ink hover:underline">
                        <Play size={9} fill="currentColor" /> Watch this step · {mmss(s.demoStartSeconds)}
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
          {steps.length === 0 && <li className="text-sm text-text-muted">No steps to show.</li>}
        </ol>
      </aside>
    </div>,
    document.body
  )
}

// ─── Role coverage warning ───────────────────────────────────────────────────

const FALLBACK_TEXT = {
  VENDOR_VRM: 'the vendor\'s VRM',
  INITIATOR: 'whoever started this workflow',
  NOBODY: 'nobody — the step will wait unassigned',
}

/**
 * "Nobody has the role for an upcoming step" — shown on a record while its
 * workflow still has steps whose actor roles no active user holds. The
 * backend answers with the engine's own lookups (side, vendor and audit-firm
 * scoping, suspended users skipped) and the engine's fallback, so this says
 * exactly where the task will land. Refetched on focus: once someone is given
 * the role, the warning disappears by itself.
 *
 * Organisation and platform users see every gap; vendor, auditor and auditee
 * users see the gaps on their own side's steps. The link to Users shows only
 * to people who may open it (USER_VIEW), never by role name.
 */
export function RoleCoverageWarning({ instanceId, className }) {
  const { hasPermission, userSides = [] } = usePermission()
  const [open, setOpen] = useState(false)
  const { data } = useQuery({
    queryKey: ['workflow-role-coverage', instanceId],
    queryFn: () => api.get(`/v1/workflow-instances/${instanceId}/role-coverage`),
    enabled: !!instanceId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
  const all = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : [])
  const seesAll = userSides.includes('ORGANIZATION') || userSides.includes('SYSTEM')
  const gaps = seesAll ? all : all.filter(g => userSides.includes(String(g.side || '').toUpperCase()))
  if (!gaps.length) return null

  const vendorOnly = !seesAll && userSides.includes('VENDOR')
  const usersRoute = vendorOnly ? '/vendor/users' : '/users'
  const now = gaps.find(g => g.current)
  const names = [...new Set(gaps.map(g => g.fallbackUserName).filter(Boolean))]
  const lead = now
    ? `The current step needs a role nobody has${gaps.length > 1 ? `, and ${gaps.length - 1} more step${gaps.length === 2 ? '' : 's'} ahead do too` : ''}.`
    : `${gaps.length} upcoming step${gaps.length === 1 ? ' needs a role' : 's need roles'} nobody has.`
  return (
    <section role="status"
      className={cn('rounded-card border border-status-warn-fg/30 bg-status-warn-bg/60 px-3 py-2 text-[12.5px] text-text-primary', className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <AlertTriangle size={14} className="text-status-warn-fg shrink-0" />
        <span className="font-semibold">{lead}</span>
        <span className="text-text-secondary">
          Until someone is given the role, those tasks go to {names.length === 1 ? <strong className="text-text-primary">{names[0]}</strong> : 'a fallback person'}.
        </span>
        <span className="ml-auto flex items-center gap-2">
          {hasPermission('USER_VIEW') && (
            <Link to={usersRoute}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-ctl text-xs font-semibold bg-surface-raised border border-border hover:bg-surface-overlay">
              <UserPlus size={12} /> Add users or roles
            </Link>
          )}
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs font-semibold text-status-warn-fg hover:underline">
            {open ? 'Hide' : 'Which steps'} <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
          </button>
        </span>
      </div>
      {open && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-status-warn-fg/20 pt-2">
          {gaps.map(g => (
            <li key={g.stepId} className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[10.5px] font-bold px-1.5 rounded-badge bg-surface-raised border border-border shrink-0">{g.stepOrder}</span>
              <span className="font-semibold">{g.stepName}</span>
              {g.current && <span className="text-[10px] font-bold px-1.5 rounded-badge bg-status-warn-fg text-white">Now</span>}
              <span className="text-text-secondary">
                needs {(g.roles || []).join(' or ') || 'a role'} → goes to {g.fallbackUserName
                  ? <><strong className="text-text-primary">{g.fallbackUserName}</strong> ({FALLBACK_TEXT[g.fallbackKind] || 'fallback'})</>
                  : FALLBACK_TEXT[g.fallbackKind] || 'a fallback person'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}