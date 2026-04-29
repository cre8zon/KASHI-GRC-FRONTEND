import { useDashboardWidgets } from '../../hooks/useUIConfig'
import { DashboardGrid } from '../../components/charts/DashboardWidget'
import { TaskInbox } from '../../components/workflow/TaskInbox'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import { useMyTasks } from '../../hooks/useWorkflow'
import { cn } from '../../lib/cn'
import { ListTodo, Flag, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useMyActionItems } from '../../hooks/useActionItems'

/**
 * DashboardPage — main landing page with widget grid and task inbox.
 *
 * FIXED: tasks?.items?.length → pendingCount derived from plain array.
 *
 * WHY: useMyTasks now returns a plain TaskInstanceResponse[] (not a paginated
 *   object with an items field). tasks?.items?.length was always undefined,
 *   so pendingCount was always 0 and the greeting never showed the task count.
 *
 * All other logic (greeting, widget grid, TaskInbox) is unchanged.
 */
export default function DashboardPage() {
  const { data: widgets = [], isLoading: widgetsLoading } = useDashboardWidgets()
  const { fullName } = useSelector(selectAuth)
  const { data: tasksData } = useMyTasks({ status: 'PENDING' })

  const pendingTasks = Array.isArray(tasksData) ? tasksData : (tasksData?.items ?? [])
  const pendingCount = pendingTasks.length

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">
          Good {getGreeting()}, <span className="text-brand-400">{fullName?.split(' ')[0]}</span>
        </h1>
        <p className="text-sm text-text-muted mt-0.5">
          {pendingCount > 0
            ? `You have ${pendingCount} pending task${pendingCount > 1 ? 's' : ''} awaiting action.`
            : 'Here\'s your platform overview.'}
        </p>
      </div>

      {/* Widget grid — show skeleton while loading, empty state if no widgets */}
      {widgetsLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-28 rounded-xl border border-border bg-surface-raised animate-pulse" />
          ))}
        </div>
      ) : widgets.length > 0 ? (
        <DashboardGrid widgets={widgets} />
      ) : null}

      {/* Task inbox */}
      <Card>
        <CardHeader
          title="Task Inbox"
          subtitle="Pending approvals and actions assigned to you"
          actions={
            pendingCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-mono text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full">
                <ListTodo size={11} /> {pendingCount}
              </span>
            )
          }
        />
        <TaskInbox />
      </Card>

      {/* Action Items */}
      <Card>
        <CardHeader
          title="My Action Items"
          subtitle="Open obligations requiring your attention"
          actions={<Flag size={14} className="text-amber-400" />}
        />
        <CardBody className="p-0">
          <ActionItemsWidget />
        </CardBody>
      </Card>
    </div>
  )
}

function ActionItemsWidget() {
  const navigate = useNavigate()
  const { items, isLoading } = useMyActionItems()
  const open = items.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS')
    .sort((a, b) => {
      const p = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
      return (p[a.priority] ?? 2) - (p[b.priority] ?? 2)
    })
    .slice(0, 5)

  const PRIORITY_DOT = {
    CRITICAL: 'bg-red-400', HIGH: 'bg-amber-400',
    MEDIUM: 'bg-blue-400', LOW: 'bg-surface-overlay border border-border'
  }

  if (isLoading) return (
    <div className="p-4 space-y-2">
      {[1,2,3].map(i => <div key={i} className="h-10 animate-pulse bg-surface-overlay rounded-lg" />)}
    </div>
  )

  if (!open.length) return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <Flag size={20} className="text-green-400" />
      <p className="text-xs text-text-muted">No open action items</p>
    </div>
  )

  return (
    <div className="divide-y divide-border">
      {open.map(item => (
        <div key={item.id}
          className="flex items-center gap-3 px-4 py-3 hover:bg-surface-overlay/50 transition-colors cursor-pointer"
          onClick={() => navigate('/action-items')}>
          <div className={cn('w-2 h-2 rounded-full flex-shrink-0', PRIORITY_DOT[item.priority] || PRIORITY_DOT.MEDIUM)} />
          <p className="flex-1 text-xs text-text-primary truncate">{item.title}</p>
          <ChevronRight size={12} className="text-text-muted flex-shrink-0" />
        </div>
      ))}
      {items.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length > 5 && (
        <div className="px-4 py-2.5">
          <button onClick={() => navigate('/action-items')}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
            View all {items.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length} items →
          </button>
        </div>
      )}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}