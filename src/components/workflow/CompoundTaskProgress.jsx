import { CheckCircle, Circle, Clock, Users, List } from 'lucide-react'
import { cn } from '../../lib/cn'
 
/**
 * Drop into any work page to show compound task section progress.
 *
 * <CompoundTaskProgress sections={sections} />
 */
export function CompoundTaskProgress({ sections = [], compact = false }) {
  if (!sections.length) return null
 
  const required  = sections.filter(s => s.required)
  const completed = required.filter(s => s.completed)
  const pct = required.length > 0
    ? Math.round((completed.length / required.length) * 100) : 0
 
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">Task progress</p>
        <span className="text-xs text-text-muted font-mono">
          {completed.length}/{required.length} required
        </span>
      </div>
 
      <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
        <div className="h-full rounded-full bg-brand-500 transition-all duration-500"
             style={{ width: `${pct}%` }} />
      </div>
 
      <div className="space-y-2">
        {sections.map(s => <SectionRow key={s.sectionKey} section={s} compact={compact} />)}
      </div>
    </div>
  )
}
 
function SectionRow({ section, compact }) {
  const icon = section.completed
    ? <CheckCircle size={14} className="text-green-500 shrink-0 mt-0.5" />
    : <Circle size={14} className={cn('shrink-0 mt-0.5',
        section.required ? 'text-text-muted' : 'text-text-muted/40')} />
 
  return (
    <div className={cn('flex items-start gap-2.5', section.completed && 'opacity-60')}>
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn('text-xs font-medium',
            section.completed ? 'text-text-muted line-through' : 'text-text-primary')}>
            {section.label}
          </p>
          {!section.required && (
            <span className="text-[10px] text-text-muted bg-surface-overlay px-1.5 py-0.5 rounded">
              optional
            </span>
          )}
        </div>
 
        {/* Case 3: item progress mini-bar */}
        {section.tracksItems && section.itemsTotal > 0 && !compact && (
          <div className="mt-1 flex items-center gap-2">
            <List size={10} className="text-text-muted" />
            <div className="flex-1 h-1 rounded-full bg-surface-overlay overflow-hidden">
              <div className="h-full rounded-full bg-brand-400 transition-all duration-300"
                   style={{ width: `${Math.round((section.itemsCompleted / section.itemsTotal) * 100)}%` }} />
            </div>
            <span className="text-[10px] text-text-muted font-mono">
              {section.itemsCompleted}/{section.itemsTotal}
            </span>
          </div>
        )}
 
        {/* Case 2: assignee progress */}
        {section.requiresAssignment && section.assigneesTotal > 0 && !compact && (
          <div className="mt-1 flex items-center gap-1.5">
            <Users size={10} className="text-text-muted" />
            <span className="text-[10px] text-text-muted">
              {section.assigneesCompleted}/{section.assigneesTotal} assignees done
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
 
/** Compact badge for page headers */
export function CompoundTaskBadge({ sections = [] }) {
  const required  = sections.filter(s => s.required)
  const completed = required.filter(s => s.completed)
  const allDone   = required.length > 0 && completed.length === required.length
  if (!required.length) return null
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
      allDone ? 'bg-green-500/10 text-green-600' : 'bg-surface-overlay text-text-muted'
    )}>
      {allDone
        ? <><CheckCircle size={10} /> All sections done</>
        : <><Clock size={10} /> {completed.length}/{required.length} sections</>}
    </span>
  )
}
 