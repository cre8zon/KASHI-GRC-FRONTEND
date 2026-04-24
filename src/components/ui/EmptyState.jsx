import { cn } from '../../lib/cn'

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-surface-overlay flex items-center justify-center mb-4">
          <Icon size={22} className="text-text-muted" strokeWidth={1.5} />
        </div>
      )}
      <p className="text-sm font-medium text-text-primary mb-1">{title}</p>
      {description && <p className="text-xs text-text-muted max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse bg-surface-overlay rounded', className)} />
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="flex gap-3">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 flex-1 rounded-lg" />)}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
