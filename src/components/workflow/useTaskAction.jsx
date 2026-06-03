/**
 * useTaskAction.jsx
 *
 * Exports UI components for post-action states on workflow task pages.
 *
 * NOTE: The `useTaskAction` hook itself lives in hooks/useWorkflow.js and is
 * imported from there by TaskInbox.jsx and TaskDetailPage.jsx. This file exports
 * only the visual components consumed by RecordDetailTemplate.jsx and other
 * new module pages that need to render an inline result screen after a workflow
 * action completes.
 *
 * Exports:
 *   PostActionState   — full-screen inline result (SUCCESS / REJECTED / SENT_BACK)
 *   TaskActionModal   — modal with remarks input for REJECT / SEND_BACK / ESCALATE
 */

import { CheckCircle2, XCircle, CornerUpLeft, AlertTriangle, ArrowRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'

// ─────────────────────────────────────────────────────────────────────────────
// PostActionState
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replaces the task form inline after a workflow action completes.
 * Shown instead of navigating away, so the user can see the outcome in context.
 *
 * Props:
 *   type        'SUCCESS' | 'REJECTED' | 'SENT_BACK' | 'ESCALATED' | 'WITHDRAWN'
 *   title       Short headline. Defaults based on type if omitted.
 *   message     Supporting text. Optional.
 *   actionLabel Label for the primary CTA button. Default: 'Go to inbox'
 *   onAction    Called when the CTA is clicked. Navigate to inbox, close drawer, etc.
 *   onDismiss   Called for a secondary "Stay here" / dismiss link. Optional.
 */
export function PostActionState({
  type = 'SUCCESS',
  title,
  message,
  actionLabel,
  onAction,
  onDismiss,
}) {
  const config = CONFIGS[type] ?? CONFIGS.SUCCESS

  const resolvedTitle  = title  ?? config.title
  const resolvedLabel  = actionLabel ?? config.actionLabel
  const resolvedMsg    = message ?? config.message

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-5">
      {/* Icon */}
      <div className={cn(
        'w-16 h-16 rounded-full flex items-center justify-center',
        config.iconBg,
      )}>
        <config.Icon size={32} className={config.iconColor} />
      </div>

      {/* Text */}
      <div className="space-y-2 max-w-sm">
        <h3 className="text-base font-semibold text-text-primary">{resolvedTitle}</h3>
        {resolvedMsg && (
          <p className="text-sm text-text-secondary leading-relaxed">{resolvedMsg}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap justify-center">
        {onAction && (
          <Button onClick={onAction} className="gap-2">
            {resolvedLabel}
            <ArrowRight size={14} />
          </Button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            Stay on this page
          </button>
        )}
      </div>
    </div>
  )
}

const CONFIGS = {
  SUCCESS: {
    Icon:        CheckCircle2,
    iconBg:      'bg-green-500/10',
    iconColor:   'text-green-500',
    title:       'Action submitted',
    message:     'The workflow has been updated. You can close this page or return to your inbox.',
    actionLabel: 'Go to inbox',
  },
  REJECTED: {
    Icon:        XCircle,
    iconBg:      'bg-red-500/10',
    iconColor:   'text-red-400',
    title:       'Step rejected',
    message:     'The step has been rejected and the requester has been notified.',
    actionLabel: 'Go to inbox',
  },
  SENT_BACK: {
    Icon:        CornerUpLeft,
    iconBg:      'bg-amber-500/10',
    iconColor:   'text-amber-400',
    title:       'Sent back for revision',
    message:     'The task has been returned for corrections. The assignee will be notified.',
    actionLabel: 'Go to inbox',
  },
  ESCALATED: {
    Icon:        AlertTriangle,
    iconBg:      'bg-orange-500/10',
    iconColor:   'text-orange-400',
    title:       'Task escalated',
    message:     'The task has been escalated. The escalation chain has been notified.',
    actionLabel: 'Go to inbox',
  },
  WITHDRAWN: {
    Icon:        XCircle,
    iconBg:      'bg-surface-overlay',
    iconColor:   'text-text-muted',
    title:       'Task withdrawn',
    message:     'The task has been withdrawn from the workflow.',
    actionLabel: 'Go to inbox',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// TaskActionModal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Modal for actions that require a remarks field: REJECT, SEND_BACK, ESCALATE, WITHDRAW.
 *
 * WorkflowPage.jsx has its own inline TaskActionModal for the admin view.
 * This one is for consumer-facing task pages (RecordDetailTemplate, UniversalModulePage).
 *
 * Props:
 *   action      'REJECT' | 'SEND_BACK' | 'ESCALATE' | 'WITHDRAW'
 *   isPending   boolean — shows spinner on confirm button
 *   onConfirm   (remarks: string) => void
 *   onClose     () => void
 */
export function TaskActionModal({ action, isPending, onConfirm, onClose }) {
  const cfg = ACTION_CONFIGS[action] ?? ACTION_CONFIGS.REJECT

  const handleSubmit = (e) => {
    e.preventDefault()
    const remarks = e.target.remarks.value.trim()
    onConfirm(remarks)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface rounded-xl border border-border shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-full flex items-center justify-center', cfg.iconBg)}>
            <cfg.Icon size={18} className={cfg.iconColor} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{cfg.title}</h3>
            <p className="text-xs text-text-muted">{cfg.subtitle}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              {cfg.remarksLabel}
              {cfg.required && <span className="text-red-400 ml-1">*</span>}
            </label>
            <textarea
              name="remarks"
              rows={4}
              required={cfg.required}
              placeholder={cfg.placeholder}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <Button type="submit" variant={cfg.variant} disabled={isPending}>
              {isPending ? 'Submitting…' : cfg.confirmLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

const ACTION_CONFIGS = {
  REJECT: {
    Icon:         XCircle,
    iconBg:       'bg-red-500/10',
    iconColor:    'text-red-400',
    title:        'Reject this step',
    subtitle:     'The assignee will be notified with your reason.',
    remarksLabel: 'Reason for rejection',
    placeholder:  'Explain why this step is being rejected…',
    confirmLabel: 'Reject',
    variant:      'danger',
    required:     true,
  },
  SEND_BACK: {
    Icon:         CornerUpLeft,
    iconBg:       'bg-amber-500/10',
    iconColor:    'text-amber-400',
    title:        'Send back for revision',
    subtitle:     'The assignee will need to correct and resubmit.',
    remarksLabel: 'What needs to be corrected?',
    placeholder:  'Describe the changes needed…',
    confirmLabel: 'Send back',
    variant:      'warning',
    required:     true,
  },
  ESCALATE: {
    Icon:         AlertTriangle,
    iconBg:       'bg-orange-500/10',
    iconColor:    'text-orange-400',
    title:        'Escalate task',
    subtitle:     'This task will be escalated to the next level.',
    remarksLabel: 'Escalation reason',
    placeholder:  'Why is this being escalated?',
    confirmLabel: 'Escalate',
    variant:      'default',
    required:     false,
  },
  WITHDRAW: {
    Icon:         XCircle,
    iconBg:       'bg-surface-overlay',
    iconColor:    'text-text-muted',
    title:        'Withdraw task',
    subtitle:     'This task will be removed from the workflow.',
    remarksLabel: 'Reason for withdrawal',
    placeholder:  'Reason for withdrawing this task…',
    confirmLabel: 'Withdraw',
    variant:      'default',
    required:     false,
  },
}