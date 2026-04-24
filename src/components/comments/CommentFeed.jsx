/**
 * CommentFeed — reusable real-time comment thread.
 */

import { useState, useRef, useEffect } from 'react'
import { useSelector }                  from 'react-redux'
import { selectRoles }                  from '../../store/slices/authSlice'
import { cn }                           from '../../lib/cn'
import { formatDateTime }               from '../../utils/format'
import {
  Lock, Shield, AlertTriangle, CheckCircle2, Send, Loader2,
} from 'lucide-react'

const TYPE_CONFIG = {
  COMMENT:          { label: null,                 bg: 'bg-surface-raised border border-border', icon: null,          iconColor: '' },
  REVISION_REQUEST: { label: 'Revision requested', bg: 'bg-amber-500/8 border-l-2 border-amber-500/40', icon: AlertTriangle, iconColor: 'text-amber-400' },
  RESOLVED:         { label: 'Resolved',           bg: 'bg-green-500/8 border-l-2 border-green-500/40',  icon: CheckCircle2,  iconColor: 'text-green-400'  },
  REMEDIATION:      { label: 'Remediation',        bg: 'bg-red-500/8 border-l-2 border-red-500/30',     icon: AlertTriangle, iconColor: 'text-red-400'    },
  SYSTEM:           { label: null,                 bg: '',                                              icon: null,          iconColor: '' },
}

const VISIBILITY_CONFIG = {
  INTERNAL:  { icon: Lock,   color: 'text-purple-400', label: 'Internal' },
  CISO_ONLY: { icon: Shield, color: 'text-indigo-400', label: 'CISO only' },
}

function CommentBubble({ comment, onResolve, canResolve }) {
  const tc   = TYPE_CONFIG[comment.commentType] || TYPE_CONFIG.COMMENT
  const vc   = VISIBILITY_CONFIG[comment.visibility]
  const Icon = tc.icon

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
    <div className={cn('rounded-lg px-3 py-2.5 space-y-1.5', tc.bg)}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-[9px] font-bold text-brand-400">
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
      {comment.commentType === 'REVISION_REQUEST' && canResolve && (
        <div className="pl-7">
          <button onClick={() => onResolve(comment.id)}
            className="text-[10px] text-green-400/70 hover:text-green-400 flex items-center gap-1 transition-colors">
            <CheckCircle2 size={10} />Mark resolved
          </button>
        </div>
      )}
    </div>
  )
}

function CommentInput({ onSubmit, adding, showVisibility, showType }) {
  const [text,       setText]       = useState('')
  const [visibility, setVisibility] = useState('ALL')
  const [type,       setType]       = useState('COMMENT')
  const roles  = useSelector(selectRoles)
  const isOrg  = roles?.some(r => r.side === 'ORGANIZATION')
  const isCiso = roles?.some(r => ['VENDOR_CISO','VENDOR_VRM'].includes(r.name || r.roleName))

  const submit = () => {
    if (!text.trim()) return
    onSubmit({ commentText: text.trim(), visibility, commentType: type })
    setText('')
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
              {isOrg && <option value="INTERNAL">Internal (org only)</option>}
              {(isOrg || isCiso) && <option value="CISO_ONLY">CISO only</option>}
            </select>
          )}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit() }}
          rows={2}
          placeholder="Add a comment… (Ctrl+Enter to send)"
          className="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
        />
        <button onClick={submit} disabled={!text.trim() || adding}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 transition-colors flex-shrink-0">
          {adding
            ? <Loader2 size={14} className="animate-spin text-white" />
            : <Send size={14} className="text-white" />}
        </button>
      </div>
    </div>
  )
}

export function CommentFeed({
  comments = [], isLoading, addComment, adding,
  canEdit = true, showVisibility = false, showType = false,
  emptyMessage = 'No comments yet. Be the first.',
}) {
  const bottomRef = useRef(null)
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
                canResolve={canEdit} onResolve={handleResolve} />
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