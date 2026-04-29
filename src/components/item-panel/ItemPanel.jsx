/**
 * ItemPanel — reusable per-entity interaction panel.
 *
 * Composes the three interaction layers that industry-standard GRC tools
 * (OneTrust, ServiceNow IRM, Archer) attach to every entity type:
 *
 *   Discussion    — informal chat thread (COMMENT type via centralized EntityComment)
 *   Action items  — open remediations / clarifications / revision requests
 *   Activity      — SYSTEM-type audit events (accept, override, status changes)
 *
 * SCALABILITY: works for any entityType the centralized comment module supports.
 * Currently: QUESTION_RESPONSE. Future: CONTROL, RISK, POLICY, ISSUE.
 *
 * Usage (question card):
 *   <ItemPanel
 *     entityType="QUESTION_RESPONSE"
 *     entityId={questionInstanceId}
 *     assessmentId={assessmentId}
 *     mode="responder"           // "responder" | "contributor" | "reviewer" | "readonly"
 *   />
 *
 * The panel renders below the entity-specific content (QuestionInput, etc.)
 * without touching those components at all.
 */

import { useState }        from 'react'
import { useQueryClient }  from '@tanstack/react-query'
import {
  MessageSquare, Flag, Activity,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import { cn }              from '../../lib/cn'
import { useQuestionComments } from '../../hooks/useComments'
import { useEntityActionItems } from '../../hooks/useActionItems'
import { CommentFeed }     from '../comments/CommentFeed'
import { ItemActionItems } from './ItemActionItems'

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS = [
  { id: 'discussion',   label: 'Discussion',   Icon: MessageSquare },
  { id: 'actionitems',  label: 'Action items', Icon: Flag          },
  { id: 'activity',     label: 'Activity',     Icon: Activity      },
]

/**
 * Main ItemPanel component.
 *
 * @param {string}  entityType    - 'QUESTION_RESPONSE' | future entity types
 * @param {number}  entityId      - primary anchor (questionInstanceId for questions)
 * @param {number}  assessmentId  - needed for inline validate/acceptRisk calls
 * @param {string}  mode          - 'responder'|'contributor'|'reviewer'|'readonly'
 * @param {boolean} defaultOpen   - whether the panel starts expanded (default false)
 */
export function ItemPanel({
  entityType = 'QUESTION_RESPONSE',
  entityId,
  assessmentId,
  mode = 'readonly',
  defaultOpen = false,
}) {
  const [expanded, setExpanded] = useState(defaultOpen)
  const [activeTab, setActiveTab] = useState('discussion')

  // Derive permissions from mode
  const canComment    = mode !== 'readonly'
  const showActItems  = mode === 'reviewer' || mode === 'responder'

  // Load action item counts for badge
  const { data: actionItems = [] } = useEntityActionItems(entityType, entityId, {
    enabled: !!entityId,
  })
  // Exclude assignment-tracking items from the badge — they are not "work items"
  // in the traditional sense and are not displayed in the Actions tab.
  const ASSIGNMENT_TYPES = ['CONTRIBUTOR_ASSIGNMENT', 'REVIEWER_ASSIGNMENT']
  const openCount = actionItems.filter(
    i => ['OPEN','IN_PROGRESS','PENDING_REVIEW','PENDING_VALIDATION'].includes(i.status)
        && !ASSIGNMENT_TYPES.includes(i.remediationType)
  ).length

  if (!entityId) return null

  return (
    <div className="mt-3 border-t border-border/50 pt-2">
      {/* Collapsed trigger */}
      <button
        onClick={() => setExpanded(o => !o)}
        className="flex items-center gap-2 w-full text-left group"
      >
        <div className="flex items-center gap-3 flex-1">
          {TABS.map(({ id, label, Icon }) => {
            const badge = id === 'actionitems' && openCount > 0 ? openCount : null
            return (
              <span key={id}
                className="flex items-center gap-1 text-[11px] text-text-muted group-hover:text-text-secondary transition-colors">
                <Icon size={11} />
                {label}
                {badge && (
                  <span className="text-[9px] font-bold px-1 rounded-full bg-amber-500/20 text-amber-400">
                    {badge}
                  </span>
                )}
              </span>
            )
          })}
        </div>
        {expanded
          ? <ChevronDown  size={11} className="text-text-muted shrink-0" />
          : <ChevronRight size={11} className="text-text-muted shrink-0" />}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-2.5">
          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-border/60 mb-3">
            {TABS.map(({ id, label, Icon }) => {
              const badge = id === 'actionitems' && openCount > 0 ? openCount : null
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border-b-2 -mb-px transition-colors',
                    activeTab === id
                      ? 'border-brand-500 text-brand-400'
                      : 'border-transparent text-text-muted hover:text-text-secondary'
                  )}>
                  <Icon size={11} />
                  {label}
                  {badge && (
                    <span className="text-[9px] font-bold px-1 rounded-full bg-amber-500/20 text-amber-400">
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          {activeTab === 'discussion' && (
            <DiscussionTab
              entityType={entityType}
              entityId={entityId}
              canComment={canComment}
            />
          )}
          {activeTab === 'actionitems' && (
            <ItemActionItems
              entityType={entityType}
              entityId={entityId}
              assessmentId={assessmentId}
              mode={mode}
            />
          )}
          {activeTab === 'activity' && (
            <ActivityTab
              entityType={entityType}
              entityId={entityId}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Discussion tab ─────────────────────────────────────────────────────────────

function DiscussionTab({ entityType, entityId, canComment }) {
  const qc = useQueryClient()

  // useQuestionComments uses questionInstanceId as the anchor — correct for QUESTION_RESPONSE
  const { comments, isLoading, addComment, adding } = useQuestionComments(
    entityType === 'QUESTION_RESPONSE' ? entityId : null,
    { enabled: !!entityId }
  )

  // Filter to show only COMMENT and REVISION_REQUEST (not SYSTEM events — those are in Activity)
  const visibleComments = comments.filter(c =>
    !c.commentType || c.commentType === 'COMMENT' ||
    c.commentType === 'REVISION_REQUEST' || c.commentType === 'RESOLVED'
  )

  const handleAddComment = (data) => {
    addComment({
      ...data,
      questionInstanceId: entityId,
    })
  }

  const handleResolveRevision = (parentCommentId) => {
    addComment({
      commentText: 'Marked as resolved.',
      commentType: 'RESOLVED',
      visibility:  'ALL',
      parentCommentId,
      questionInstanceId: entityId,
    })
  }

  return (
    <CommentFeed
      comments={visibleComments}
      isLoading={isLoading}
      addComment={handleAddComment}
      adding={adding}
      canEdit={canComment}
      onResolve={handleResolveRevision}
      showVisibility={false}
      showType={true}
      emptyMessage="No discussion yet. Add a comment to start the thread."
    />
  )
}

// ── Activity tab ───────────────────────────────────────────────────────────────
// Shows SYSTEM-type EntityComment entries — auto-logged by accept/override/status changes.

function ActivityTab({ entityType, entityId }) {
  const { comments, isLoading } = useQuestionComments(
    entityType === 'QUESTION_RESPONSE' ? entityId : null,
    { enabled: !!entityId }
  )

  const systemEvents = comments.filter(c => c.commentType === 'SYSTEM')

  if (isLoading) return <div className="h-3 w-24 bg-surface-overlay rounded animate-pulse my-2" />

  if (!systemEvents.length) return (
    <p className="text-[11px] text-text-muted italic py-2">No activity recorded yet.</p>
  )

  return (
    <div className="space-y-1.5">
      {systemEvents.map((ev, i) => (
        <div key={ev.id || i}
          className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
          <div className="h-px flex-1 bg-border/40 max-w-4" />
          <span className="text-[10px] text-text-muted/70 italic flex-1">
            {ev.commentText}
          </span>
          {ev.createdAt && (
            <span className="text-[10px] text-text-muted/50 shrink-0 font-mono">
              {new Date(ev.createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
