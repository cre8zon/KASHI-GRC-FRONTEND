/**
 * NotificationsPage — /notifications
 *
 * Dedicated page for all notifications with deep-link navigation.
 * Each notification row navigates to the relevant action item, task, or assessment.
 */
import { useState }                          from 'react'
import { useNavigate }                       from 'react-router-dom'
import { useMutation, useQueryClient }       from '@tanstack/react-query'
import { Bell, CheckCheck, Flag, ListTodo,
         Shield, ChevronRight, Clock }        from 'lucide-react'
import { PageLayout }                        from '../../components/layout/PageLayout'
import { Button }                            from '../../components/ui/Button'
import { cn }                               from '../../lib/cn'
import { formatDateTime }                    from '../../utils/format'
import { useNotifications, useMarkRead }     from '../../hooks/useNotifications'
import { notificationsApi }                 from '../../api/notifications.api'
import toast                                from 'react-hot-toast'

// ── Type config — icon + label + color per notification type ──────────────────
const TYPE_CONFIG = {
  ACTION_ITEM_CREATED:        { icon: Flag,     color: 'text-amber-400',  label: 'New action item' },
  ACTION_ITEM_PENDING_REVIEW: { icon: Clock,    color: 'text-blue-400',   label: 'Ready for review' },
  ACTION_ITEM_RESOLVED:       { icon: CheckCheck,color: 'text-green-400', label: 'Resolved' },
  ACTION_ITEM_DISMISSED:      { icon: Flag,     color: 'text-text-muted', label: 'Dismissed' },
  ACTION_ITEM_REWORK:         { icon: Flag,     color: 'text-red-400',    label: 'Rework needed' },
  ACTION_ITEM_REOPENED:       { icon: Flag,     color: 'text-amber-400',  label: 'Re-opened' },
  ANSWER_UPDATED:             { icon: CheckCheck,color: 'text-blue-400',  label: 'Answer updated' },
  ASSIGNMENT:                 { icon: ListTodo, color: 'text-brand-400',  label: 'Assigned' },
  SUBMISSION:                 { icon: CheckCheck,color: 'text-green-400', label: 'Submitted' },
  REVIEW:                     { icon: Shield,   color: 'text-purple-400', label: 'Review' },
  ESCALATION:                 { icon: Flag,     color: 'text-red-400',    label: 'Escalation' },
}

const DEFAULT_TYPE = { icon: Bell, color: 'text-text-muted', label: 'Notification' }

// ── Build navigation URL from notification entity ─────────────────────────────
function buildNavUrl(notification) {
  const { entityType, entityId, type } = notification

  // Type-based routing (more reliable than entityType for action item events)
  if (type?.startsWith('ACTION_ITEM') || type === 'ANSWER_UPDATED') {
    return '/action-items'
  }
  if (type === 'ASSIGNMENT' || type === 'SUBMISSION' || type === 'REVIEW') {
    return '/workflow/inbox'
  }

  // Entity-based routing fallback
  if (!entityType || !entityId) return null
  switch (entityType) {
    case 'ACTION_ITEM':       return '/action-items'
    case 'QUESTION_RESPONSE': return '/action-items'
    case 'ASSESSMENT':        return `/assessments/${entityId}`
    case 'TASK':              return '/workflow/inbox'
    case 'VENDOR':            return `/tprm/vendors/${entityId}`
    default:                  return null
  }
}

// ── Filters ───────────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'ALL',          label: 'All' },
  { key: 'UNREAD',       label: 'Unread' },
  { key: 'ACTION_ITEMS', label: 'Action Items' },
  { key: 'TASKS',        label: 'Tasks' },
]

// ── Notification Row ──────────────────────────────────────────────────────────
function NotificationRow({ notification, onMarkRead }) {
  const navigate  = useNavigate()
  const tc        = TYPE_CONFIG[notification.type] || DEFAULT_TYPE
  const Icon      = tc.icon
  const isUnread  = !notification.readAt
  const navUrl    = buildNavUrl(notification)

  const handleClick = () => {
    if (isUnread) onMarkRead(notification.notificationId)
    if (navUrl) navigate(navUrl)
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex items-start gap-3 px-6 py-4 border-b border-border/50 transition-colors',
        navUrl ? 'cursor-pointer hover:bg-surface-overlay/50' : '',
        isUnread ? 'bg-brand-500/3' : ''
      )}
    >
      {/* Unread dot */}
      <div className="flex-shrink-0 mt-1">
        {isUnread
          ? <div className="w-2 h-2 rounded-full bg-brand-400" />
          : <div className="w-2 h-2 rounded-full bg-transparent" />
        }
      </div>

      {/* Icon */}
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
        'bg-surface-overlay'
      )}>
        <Icon size={14} className={tc.color} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded',
            'bg-surface-overlay text-text-muted')}>
            {tc.label}
          </span>
        </div>
        <p className={cn(
          'text-sm leading-snug',
          isUnread ? 'text-text-primary font-medium' : 'text-text-secondary'
        )}>
          {notification.message}
        </p>
        <p className="text-[10px] text-text-muted mt-1 font-mono">
          {formatDateTime(notification.sentAt)}
        </p>
      </div>

      {/* Arrow — only if navigable */}
      {navUrl && (
        <ChevronRight size={14} className="text-text-muted flex-shrink-0 mt-2" />
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const qc                         = useQueryClient()
  const [filter, setFilter]        = useState('ALL')
  const { data: notifData, isLoading } = useNotifications({})
  const { mutate: markRead }       = useMarkRead()

  const notifications = notifData?.items || []
  const unreadCount   = notifications.filter(n => !n.readAt).length

  const filtered = notifications.filter(n => {
    if (filter === 'UNREAD')       return !n.readAt
    if (filter === 'ACTION_ITEMS') return n.type?.startsWith('ACTION_ITEM') || n.entityType === 'QUESTION_RESPONSE'
    if (filter === 'TASKS')        return n.entityType === 'TASK' || n.type === 'ASSIGNMENT'
    return true
  })

  const markAllRead = () => {
    notifications.filter(n => !n.readAt).forEach(n => markRead(n.notificationId))
    toast.success('All marked as read')
  }

  return (
    <PageLayout
      title="Notifications"
      subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
      actions={
        unreadCount > 0 && (
          <Button variant="ghost" size="sm" icon={CheckCheck} onClick={markAllRead}>
            Mark all read
          </Button>
        )
      }
    >
      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-6 pt-4 border-b border-border">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              filter === f.key
                ? 'border-brand-400 text-brand-400'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}>
            {f.label}
            {f.key === 'UNREAD' && unreadCount > 0 && (
              <span className="ml-1.5 text-[10px] bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="divide-y divide-border/0">
        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Bell size={32} className="text-text-muted" />
            <p className="text-sm text-text-muted">
              {filter === 'UNREAD' ? 'All caught up!' : 'No notifications'}
            </p>
          </div>
        )}
        {filtered.map(n => (
          <NotificationRow
            key={n.notificationId}
            notification={n}
            onMarkRead={markRead}
          />
        ))}
      </div>
    </PageLayout>
  )
}