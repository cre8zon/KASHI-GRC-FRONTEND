/**
 * CommentFeed — reusable real-time comment thread.
 */

import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSelector }                  from 'react-redux'
import { selectRoles, selectAuth }      from '../../store/slices/authSlice'
import { cn }                           from '../../lib/cn'
import { formatDateTime }               from '../../utils/format'
import {
  Lock, Shield, AlertTriangle, CheckCircle2, Send, Loader2,
  MessageSquare, ChevronDown,
} from 'lucide-react'
import { MentionInput }                 from '../ui/MentionInput'
import { commentsApi }                  from '../../api/comments.api'
import toast                            from 'react-hot-toast'

const TYPE_CONFIG = {
  COMMENT:          { label: null,                 bg: 'bg-surface-raised border border-border', icon: null,          iconColor: '' },
  REVISION_REQUEST: { label: 'Revision requested', bg: 'bg-status-warn-bg border-l-2 border-status-warn-bd', icon: AlertTriangle, iconColor: 'text-status-warn-fg' },
  RESOLVED:         { label: 'Resolved',           bg: 'bg-status-pass-bg border-l-2 border-status-pass-bd',  icon: CheckCircle2,  iconColor: 'text-status-pass-fg'  },
  REMEDIATION:      { label: 'Remediation',        bg: 'bg-status-fail-bg border-l-2 border-status-fail-bd',     icon: AlertTriangle, iconColor: 'text-status-fail-fg'    },
  SYSTEM:           { label: null,                 bg: '',                                              icon: null,          iconColor: '' },
}

const VISIBILITY_CONFIG = {
  INTERNAL:        { icon: Lock,   color: 'text-status-tag-fg', label: 'Org internal'    },
  VENDOR_INTERNAL: { icon: Lock,   color: 'text-brand-ink',   label: 'Vendor internal' },
  CISO_ONLY:       { icon: Shield, color: 'text-status-tag-fg', label: 'CISO only'       },
}

/**
 * RevisionReplyThread — collapsible inline clarification thread on a
 * REVISION_REQUEST comment. Uses the same VENDOR_INTERNAL channel so
 * the org reviewer never sees these internal back-and-forths.
 */
function RevisionReplyThread({ comment, questionInstanceId }) {
  const qc = useQueryClient()
  const [open,  setOpen]  = useState(false)
  const [draft, setDraft] = useState('')
  const [mentionedIds, setMentionedIds] = useState([])
  const endRef = useRef(null)

  const queryKey = ['revision-replies', comment.id]
  const { data: allComments = [] } = useQuery({
    queryKey,
    queryFn: () => commentsApi.list('QUESTION_RESPONSE', questionInstanceId),
    enabled: open && !!questionInstanceId,
    select: (d) => {
      const arr = Array.isArray(d) ? d : (d?.data || [])
      const revisionTime = comment.createdAt ? new Date(comment.createdAt) : null
      // Only COMMENT-type replies created AFTER this revision request, in same channel
      return arr.filter(c =>
        c.commentType === 'COMMENT' &&
        c.visibility === (comment.visibility || 'VENDOR_INTERNAL') &&
        (!revisionTime || new Date(c.createdAt) > revisionTime)
      )
    },
    staleTime: 0,
  })

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allComments.length, open])

  const { mutate: post, isPending } = useMutation({
    mutationFn: () => commentsApi.add({
      entityType: 'QUESTION_RESPONSE',
      entityId: questionInstanceId,
      questionInstanceId,
      commentText: draft.trim(),
      commentType: 'COMMENT',
      visibility: comment.visibility || 'VENDOR_INTERNAL',
      mentionedUserIds: mentionedIds,
    }),
    onSuccess: () => {
      setDraft(''); setMentionedIds([])
      qc.invalidateQueries({ queryKey })
      qc.invalidateQueries({ queryKey: ['q-comments', questionInstanceId] })
    },
    onError: (e) => toast.error(e?.message || 'Failed to send'),
  })

  return (
    <div className="mt-1 border-t border-on-dark/5 pl-7">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[10px] text-text-muted/60 hover:text-text-secondary transition-colors py-1">
        <MessageSquare size={9} />
        <span>{allComments.length > 0 ? `${allComments.length} repl${allComments.length > 1 ? 'ies' : 'y'}` : 'Reply for clarification'}</span>
        <ChevronDown size={8} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-2 pb-2">
          {allComments.length === 0 && (
            <p className="text-[10px] text-text-muted/40 italic">No replies yet.</p>
          )}
          {allComments.map(c => (
            <div key={c.id} className="flex gap-1.5">
              <div className="w-4 h-4 rounded-full bg-surface-overlay border border-border shrink-0 flex items-center justify-center text-[8px] font-bold text-text-muted mt-0.5">
                {(c.createdByName || '?')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] font-medium text-text-secondary">{c.createdByName}</span>
                  <span className="text-[9px] text-text-muted/40">{c.createdAt ? formatDateTime(c.createdAt) : ''}</span>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">{c.commentText}</p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
          <MentionInput
            value={draft}
            onChange={(t, ids) => { setDraft(t); setMentionedIds(ids) }}
            onSubmit={() => { if (draft.trim()) post() }}
            placeholder="Reply… (@ to mention, Ctrl+Enter to send)"
            rows={2}
          />
          <div className="flex justify-end">
            <button type="button" disabled={!draft.trim() || isPending}
              onClick={() => post()}
              className="text-[10px] font-medium px-2 py-1 rounded bg-brand-500/20 text-brand-ink hover:bg-brand-500/30 transition-colors disabled:opacity-40">
              {isPending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CommentBubble({ comment, onResolve, currentUserId, questionInstanceId }) {
  const tc   = TYPE_CONFIG[comment.commentType] || TYPE_CONFIG.COMMENT
  const vc   = VISIBILITY_CONFIG[comment.visibility]
  const Icon = tc.icon

  // Only the person who requested the revision can mark it resolved
  const isRequester = !!currentUserId && (
    comment.createdBy === currentUserId ||
    comment.createdBy === Number(currentUserId)
  )

  if (comment.commentType === 'SYSTEM') {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] text-text-muted px-2 shrink-0">{comment.commentText}</span>
        <div className="h-px flex-1 bg-border" />
      </div>
    )
  }

  return (
    <div className={cn('rounded-card px-3 py-2.5 space-y-1.5', tc.bg)}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-[9px] font-bold text-brand-ink">
            {(comment.createdByName || '?')[0].toUpperCase()}
          </span>
        </div>
        <span className="text-xs font-medium text-text-primary">
          {comment.createdByName || `User #${comment.createdBy}`}
        </span>
        {tc.label && Icon && (
          <span className={cn('flex items-center gap-1 text-[10px] font-medium', tc.iconColor)}>
            <Icon size={10} />{tc.label}
          </span>
        )}
        {vc && (
          <span className={cn('flex items-center gap-1 text-[10px]', vc.color)}>
            <vc.icon size={10} />{vc.label}
          </span>
        )}
        <span className="text-[10px] text-text-muted ml-auto shrink-0">
          {comment.createdAt ? formatDateTime(comment.createdAt) : ''}
        </span>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed pl-7">{comment.commentText}</p>

      {/* Mark resolved — only the requester who created this revision request can resolve it */}
      {comment.commentType === 'REVISION_REQUEST' && isRequester && (
        <div className="pl-7">
          <button type="button" onClick={() => onResolve(comment.id)}
            className="text-[10px] text-status-pass-fg hover:text-status-pass-fg flex items-center gap-1 transition-colors">
            <CheckCircle2 size={10} />Mark resolved
          </button>
        </div>
      )}

      {/* Inline reply thread for further clarification on revision requests */}
      {comment.commentType === 'REVISION_REQUEST' && questionInstanceId && (
        <RevisionReplyThread comment={comment} questionInstanceId={questionInstanceId} />
      )}
    </div>
  )
}

function CommentInput({ onSubmit, adding, showVisibility, showType }) {
  const [text,         setText]         = useState('')
  const [mentionedIds, setMentionedIds] = useState([])
  const [visibility,   setVisibility]   = useState('ALL')
  const [type,         setType]         = useState('COMMENT')
  const roles  = useSelector(selectRoles)
  const isOrg  = roles?.some(r => r.side === 'ORGANIZATION')
  const isCiso = roles?.some(r => ['VENDOR_CISO','VENDOR_VRM'].includes(r.name || r.roleName))

  const submit = () => {
    if (!text.trim()) return
    onSubmit({ commentText: text.trim(), visibility, commentType: type, mentionedUserIds: mentionedIds })
    setText('')
    setMentionedIds([])
    setVisibility('ALL')
    setType('COMMENT')
  }

  return (
    <div className="space-y-2 pt-1 border-t border-border">
      {(showType || (showVisibility && (isOrg || isCiso))) && (
        <div className="flex items-center gap-2 flex-wrap">
          {showType && (
            <select value={type} onChange={e => setType(e.target.value)}
              className="text-[10px] bg-surface-raised border border-border rounded px-2 py-1 text-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="COMMENT">Comment</option>
              <option value="REVISION_REQUEST">Request revision</option>
              <option value="RESOLVED">Mark resolved</option>
              {isOrg && <option value="REMEDIATION">Remediation</option>}
            </select>
          )}
          {showVisibility && (isOrg || isCiso) && (
            <select value={visibility} onChange={e => setVisibility(e.target.value)}
              className="text-[10px] bg-surface-raised border border-border rounded px-2 py-1 text-text-secondary focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="ALL">Visible to all</option>
              {isOrg && <option value="INTERNAL">Org internal (org only)</option>}
              {!isOrg && <option value="VENDOR_INTERNAL">Vendor internal (vendor only)</option>}
              {(isOrg || isCiso) && <option value="CISO_ONLY">CISO only</option>}
            </select>
          )}
        </div>
      )}
      <div className="flex items-end gap-2">
        <MentionInput
          value={text}
          onChange={(t, ids) => { setText(t); setMentionedIds(ids) }}
          onSubmit={submit}
          placeholder="Add a comment… (@ to mention, Ctrl+Enter to send)"
          rows={2}
          className="flex-1"
        />
        <button onClick={submit} disabled={!text.trim() || adding}
          className="w-8 h-8 flex items-center justify-center rounded-card bg-brand-500 hover:bg-brand-600 disabled:opacity-40 transition-colors flex-shrink-0 mb-px">
          {adding
            ? <Loader2 size={14} className="animate-spin text-on-dark" />
            : <Send size={14} className="text-on-dark" />}
        </button>
      </div>
    </div>
  )
}

export function CommentFeed({
  comments = [], isLoading, addComment, adding,
  canEdit = true, showVisibility = false, showType = false,
  emptyMessage = 'No comments yet. Be the first.',
  questionInstanceId,
}) {
  const bottomRef = useRef(null)
  const { userId } = useSelector(selectAuth)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  const handleResolve = (parentCommentId) => {
    addComment({ commentType: 'RESOLVED', commentText: 'Marked as resolved.', visibility: 'ALL', parentCommentId })
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-8">
      <Loader2 size={16} className="animate-spin text-text-muted" />
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
        {comments.length === 0
          ? <p className="text-xs text-text-muted text-center py-6">{emptyMessage}</p>
          : comments.map(c => (
              <CommentBubble key={c.id} comment={c}
                currentUserId={userId}
                questionInstanceId={questionInstanceId}
                onResolve={handleResolve} />
            ))}
        <div ref={bottomRef} />
      </div>
      {canEdit && (
        <CommentInput onSubmit={addComment} adding={adding}
          showVisibility={showVisibility} showType={showType} />
      )}
    </div>
  )
}