/**
 * AssessmentChatTab.jsx
 *
 * The discussion threads on an assessment question.
 *
 * ── THIS USES THE PLATFORM'S COMMENT MODULE, NOT A NEW ONE ────────────────
 * The "three chat tabs — vendor-only, org-only, common" requirement is already
 * built, and with four levels rather than three. EntityComment.Visibility:
 *
 *   ALL              both sides
 *   INTERNAL         org side only, never visible to the vendor
 *   CISO_ONLY        vendor CISO/VRM + org side, not responders or contributors
 *   VENDOR_INTERNAL  vendor side only, never visible to org reviewers
 *
 * EntityType.QUESTION_RESPONSE is already one of its anchors, filtering is
 * server-side in CommentService, and commentsApi already wraps all of it.
 *
 * CISO_ONLY is the level worth noticing: it is the org↔vendor-CISO channel a
 * three-thread design has nowhere to put, and REMEDIATION comments are posted
 * into it. Rendering only three tabs would hide a real conversation.
 */

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Lock, Users, Shield, Send, AlertTriangle } from 'lucide-react'
import { commentsApi } from '../../api/comments.api'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'
import { unwrapList, userInitials, useStanding } from './vendorShared'

/**
 * The threads, in the order they are shown.
 *
 * `sides` is which side may WRITE here — used only to hide a compose box the
 * server would refuse anyway. It is not a security boundary; CommentController
 * decides, and this list existing does not make it authoritative.
 */
const THREADS = [
  { key: 'ALL',             label: 'Shared',      icon: Users,
    sides: ['ORGANIZATION', 'VENDOR'],
    blurb: 'Visible to both organisations.' },
  { key: 'INTERNAL',        label: 'Org only',    icon: Lock,
    sides: ['ORGANIZATION'],
    blurb: 'Your organisation only. The vendor never sees this.' },
  { key: 'VENDOR_INTERNAL', label: 'Vendor only', icon: Lock,
    sides: ['VENDOR'],
    blurb: 'Vendor side only. Org reviewers never see this.' },
  { key: 'CISO_ONLY',       label: 'CISO channel', icon: Shield,
    sides: ['ORGANIZATION', 'VENDOR'],
    blurb: 'Org side and the vendor CISO/VRM. Not responders or contributors.' },
]

function relativeTime(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1)    return 'just now'
  if (mins < 60)   return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24)    return `${hrs}h ago`
  return new Date(iso).toLocaleDateString()
}

function CommentBubble({ c }) {
  const remediation = c.commentType === 'REMEDIATION'
  const revision    = c.commentType === 'REVISION_REQUEST'
  return (
    <div className="flex gap-2 py-2">
      <div className="h-6 w-6 rounded-full bg-surface-overlay border border-border flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5">
        {userInitials({ fullName: c.createdByName })}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-text-primary truncate">
            {c.createdByName || `User #${c.createdBy}`}
          </span>
          <span className="text-[9px] text-text-muted">{relativeTime(c.createdAt)}</span>
          {remediation && (
            <span className="text-[8px] font-medium px-1.5 py-0.5 rounded bg-status-fail-bg text-status-fail-fg">
              Remediation
            </span>
          )}
          {revision && (
            <span className="text-[8px] font-medium px-1.5 py-0.5 rounded bg-status-warn-bg text-status-warn-fg">
              Revision requested
            </span>
          )}
        </div>
        <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap mt-0.5">
          {c.commentText}
        </p>
      </div>
    </div>
  )
}

export default function AssessmentChatTab({
  questionInstanceId, responseId, vc = {}, assessmentId,
}) {
  const qc = useQueryClient()
  const [active, setActive] = useState('ALL')
  const [draft, setDraft]   = useState('')
  const standing = useStanding(vc)

  const { data: raw, isLoading, isError, error } = useQuery({
    queryKey: ['question-comments', questionInstanceId],
    queryFn:  () => commentsApi.listQuestion(questionInstanceId),
    enabled:  !!questionInstanceId,
    staleTime: 10 * 1000,
  })

  // One fetch, grouped client-side. The server has already removed everything
  // this user may not see, so grouping what came back cannot leak: a thread
  // with nothing in it for this caller renders empty rather than hidden,
  // which is the same thing they would get from a per-thread request.
  const byThread = useMemo(() => {
    const all = unwrapList(raw)
    const map = Object.fromEntries(THREADS.map(t => [t.key, []]))
    for (const c of all) {
      const v = c.visibility || 'ALL'
      if (map[v]) map[v].push(c)
    }
    return map
  }, [raw])

  const post = useMutation({
    mutationFn: (text) => commentsApi.add({
      entityType:        'QUESTION_RESPONSE',
      entityId:          questionInstanceId,
      questionInstanceId,
      responseId:        responseId || undefined,
      commentText:       text,
      visibility:        active,
    }),
    onSuccess: () => {
      setDraft('')
      qc.invalidateQueries({ queryKey: ['question-comments', questionInstanceId] })
    },
    onError: (e) => toast.error(e?.message || 'Could not post the comment'),
  })

  if (!questionInstanceId) {
    return (
      <div className="px-4 py-6 text-center text-[11px] text-text-muted">
        Select a question to see its discussion.
      </div>
    )
  }

  const thread  = THREADS.find(t => t.key === active) || THREADS[0]
  const items   = byThread[active] || []
  const canPost = standing.hasStanding

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 px-3 pt-2 border-b border-border">
        {THREADS.map(t => {
          const Icon  = t.icon
          const count = (byThread[t.key] || []).length
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium rounded-t-ctl border-b-2 transition-colors',
                active === t.key
                  ? 'border-brand-500 text-brand-ink'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              )}
            >
              <Icon size={10} />
              {t.label}
              {/* The count is what the server returned for this caller. It
                  cannot report hidden comments, because it never saw them —
                  a badge computed any other way would disclose that they exist. */}
              {count > 0 && (
                <span className="text-[9px] px-1 rounded bg-surface-overlay">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      <p className="px-4 py-1.5 text-[9px] text-text-muted border-b border-border bg-surface-overlay/30">
        {thread.blurb}
      </p>

      <div className="px-4 max-h-80 overflow-y-auto divide-y divide-border/50">
        {isLoading ? (
          <p className="py-6 text-center text-[11px] text-text-muted">Loading…</p>
        ) : isError ? (
          <div className="py-6 text-center">
            <AlertTriangle size={14} className="mx-auto text-status-fail-fg" />
            <p className="mt-1 text-[11px] text-status-fail-fg">
              {error?.message || 'Could not load the discussion.'}
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center">
            <MessageSquare size={14} className="mx-auto text-text-muted" />
            <p className="mt-1 text-[11px] text-text-muted">Nothing here yet.</p>
          </div>
        ) : items.map(c => <CommentBubble key={c.id} c={c} />)}
      </div>

      {canPost && (
        <div className="px-4 py-2 border-t border-border">
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={`Write to ${thread.label.toLowerCase()}…`}
              className="flex-1 bg-surface-overlay border border-border rounded-ctl px-2 py-1.5 text-[11px] text-text-primary placeholder:text-text-muted outline-none focus:border-border-strong resize-none"
            />
            <button
              onClick={() => draft.trim() && post.mutate(draft.trim())}
              disabled={!draft.trim() || post.isPending}
              className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-ctl border border-border bg-surface-overlay text-text-secondary hover:border-border-strong transition-colors disabled:opacity-40"
            >
              <Send size={10} /> Post
            </button>
          </div>
          {/* Says where it is going, every time. The whole point of a private
              thread is that the author is certain which one they are in, and
              the tab strip alone is easy to lose track of mid-sentence. */}
          <p className="mt-1 text-[9px] text-text-muted">
            Posting to <span className="font-medium">{thread.label}</span> — {thread.blurb}
          </p>
        </div>
      )}
    </div>
  )
}
