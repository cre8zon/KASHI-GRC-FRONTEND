import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Link2Off, Clock, Unlink } from 'lucide-react'
import { contentApi } from '../../../api/content.api'
import { EmptyState, Skeleton } from '../../../components/ui/EmptyState'
import { Card, CardHeader, CardBody } from '../../../components/ui/Card'

/**
 * Three reports content teams normally keep in a spreadsheet and stop
 * maintaining after the second month. All three are one indexed query here,
 * because the link graph is materialised on save.
 */
export default function ContentReportsPage() {
  const orphans = useQuery({ queryKey: ['content-orphans'], queryFn: () => contentApi.orphans() })
  const stale = useQuery({ queryKey: ['content-stale'], queryFn: () => contentApi.stale() })
  const broken = useQuery({ queryKey: ['content-broken'], queryFn: () => contentApi.brokenLinks() })

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Content health</h1>
        <p className="text-[13px] text-text-secondary">
          What to fix before writing anything new.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Orphan pages"
          subtitle="Published and indexable, but nothing on the site links to them. Search engines read internal links as a vote on what matters — an orphan is us saying this page does not."
        />
        <CardBody>
          {orphans.isLoading && <Skeleton className="h-16 w-full" />}
          {orphans.data?.length === 0 && (
            <p className="py-4 text-center text-sm text-text-secondary">
              Nothing orphaned. Everything published is linked from somewhere.
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {(orphans.data || []).map((p) => (
              <li key={p.id}>
                <Link to={`/admin/content/posts/${p.id}`}
                      className="flex items-center gap-2 rounded-ctl px-2 py-2 hover:bg-surface-overlay">
                  <Link2Off size={13} className="shrink-0 text-status-fail-fg" />
                  <span className="flex-1 truncate text-[13px] text-text-primary">{p.title}</span>
                  <span className="reg-code font-mono text-[11px] text-text-faint">/blog/{p.slug}</span>
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Due for re-verification"
          subtitle="Past their review interval. Comparison pages sort first — competitor pricing and feature claims rot without anyone touching the file."
        />
        <CardBody>
          {stale.isLoading && <Skeleton className="h-16 w-full" />}
          {stale.data?.length === 0 && (
            <p className="py-4 text-center text-sm text-text-secondary">Nothing overdue.</p>
          )}
          <ul className="flex flex-col gap-1">
            {(stale.data || []).map((p) => (
              <li key={p.id}>
                <Link to={`/admin/content/posts/${p.id}`}
                      className="flex items-center gap-2 rounded-ctl px-2 py-2 hover:bg-surface-overlay">
                  <Clock size={13} className="shrink-0 text-status-warn-fg" />
                  <span className="flex-1 truncate text-[13px] text-text-primary">{p.title}</span>
                  <span className="text-[11px] text-text-faint">
                    {p.lastVerifiedAt
                      ? `verified ${new Date(p.lastVerifiedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : 'never verified'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Broken links"
          subtitle="Checked weekly. A compliance article citing a circular that has moved is worse than one with no citation — the citation was the thing establishing that we checked."
        />
        <CardBody>
          {broken.isLoading && <Skeleton className="h-16 w-full" />}
          {broken.data?.length === 0 && (
            <p className="py-4 text-center text-sm text-text-secondary">No broken links.</p>
          )}
          <ul className="flex flex-col gap-1">
            {(broken.data || []).map((l) => (
              <li key={l.id} className="flex items-center gap-2 rounded-ctl px-2 py-2">
                <Unlink size={13} className="shrink-0 text-status-fail-fg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-text-primary">{l.anchorText || l.href}</span>
                  <span className="reg-code block truncate font-mono text-[11px] text-text-faint">{l.href}</span>
                </span>
                <span className="reg-code shrink-0 font-mono text-[11px] text-status-fail-fg">
                  {l.httpStatus || '—'}
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}