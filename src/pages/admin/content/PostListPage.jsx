import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, Eye, ThumbsUp, Link2Off, Clock, FileText,
} from 'lucide-react'
import { contentApi } from '../../../api/content.api'
import { usePosts, useContentTaxonomy } from '../../../hooks/useContent'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { EmptyState, Skeleton } from '../../../components/ui/EmptyState'
import { cn } from '../../../lib/cn'

/**
 * The post list.
 *
 * ── THE COLUMNS ARE AN ARGUMENT ──────────────────────────────────────────────
 * Views, helpful ratio, inbound links and staleness sit beside the title, not
 * behind an analytics tab. Those four are what tell you which article to work
 * on next, and a metric you have to navigate to is a metric nobody looks at.
 *
 * Inbound links is the one people have not seen before: a published post with
 * zero is an orphan — it exists, it is in the sitemap, and nothing on the site
 * points at it.
 */
const STATUS_TAG = {
  DRAFT: 'gray', IN_REVIEW: 'amber', SCHEDULED: 'blue',
  PUBLISHED: 'green', ARCHIVED: 'gray',
}

export default function PostListPage() {
  const navigate = useNavigate()
  const client = useQueryClient()
  const taxonomy = useContentTaxonomy()

  const [filters, setFilters] = useState({ q: '', status: '', type: '', categoryId: '' })
  const params = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
    [filters]
  )
  const { data, isLoading } = usePosts(params)

  const create = useMutation({
    mutationFn: () => contentApi.createPost({ title: 'Untitled', contentType: 'BLOG' }),
    onSuccess: (res) => {
      client.invalidateQueries({ queryKey: ['content-posts'] })
      navigate(`/admin/content/posts/${res.id}`)
    },
  })

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Content</h1>
          <p className="text-[13px] text-text-secondary">
            Everything published at www.digiosec.com
          </p>
        </div>
        <div className="flex-1" />
        <Button variant="primary" icon={Plus} loading={create.isPending}
                onClick={() => create.mutate()}>
          New post
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
          <Input value={filters.q} onChange={(e) => set('q', e.target.value)}
                 placeholder="Search titles and slugs" className="pl-8" />
        </div>
        <Select value={filters.status} onChange={(e) => set('status', e.target.value)}
                placeholder="Any status" className="w-40"
                options={['DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']
                  .map((v) => ({ value: v, label: v.replace('_', ' ').toLowerCase() }))} />
        <Select value={filters.type} onChange={(e) => set('type', e.target.value)}
                placeholder="Any type" className="w-44"
                options={['BLOG', 'COMPARISON', 'GLOSSARY', 'CASE_STUDY', 'CHANGELOG', 'PILLAR']
                  .map((v) => ({ value: v, label: v.replace('_', ' ').toLowerCase() }))} />
        <Select value={filters.categoryId} onChange={(e) => set('categoryId', e.target.value)}
                placeholder="Any category" className="w-48"
                options={(taxonomy.categories.data || []).map((c) => ({ value: c.id, label: c.name }))} />
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-elevated">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-inset text-left">
              <Th className="w-[40%]">Title</Th>
              <Th>Status</Th>
              <Th>Author</Th>
              <Th>Published</Th>
              <Th className="text-right">Views</Th>
              <Th className="text-right">Helpful</Th>
              <Th className="text-right">Links in</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && [...Array(6)].map((_, i) => (
              <tr key={i} className="border-b border-border-subtle">
                <td colSpan={7} className="p-3"><Skeleton className="h-5 w-full" /></td>
              </tr>
            ))}

            {(data?.items || []).map((p) => (
              <tr
                key={p.id}
                onClick={() => navigate(`/admin/content/posts/${p.id}`)}
                className="cursor-pointer border-b border-border-subtle transition-colors last:border-0 hover:bg-surface-overlay"
              >
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] text-text-primary">{p.title}</span>
                    {p.stale && (
                      <span className="flex shrink-0 items-center gap-1 rounded-badge bg-status-warn-bg px-2 py-0.5 text-[10.5px] text-status-warn-fg">
                        <Clock size={9} /> re-verify
                      </span>
                    )}
                    {p.robotsDirective !== 'INDEX_FOLLOW' && (
                      <span className="shrink-0 rounded-badge bg-status-pending-bg px-2 py-0.5 text-[10.5px] text-status-pending-fg">
                        noindex
                      </span>
                    )}
                  </div>
                  <span className="reg-code font-mono text-[11px] text-text-faint">/blog/{p.slug}</span>
                </Td>
                <Td><Badge value={p.status} colorTag={STATUS_TAG[p.status]} /></Td>
                <Td className="text-[12.5px] text-text-secondary">{p.authorName || '—'}</Td>
                <Td className="text-[12.5px] text-text-secondary">
                  {p.publishedAt
                    ? new Date(p.publishedAt).toLocaleDateString('en-GB',
                        { day: 'numeric', month: 'short', year: '2-digit' })
                    : '—'}
                </Td>
                <Td className="reg-code text-right font-mono text-[12px] tabular-nums text-text-secondary">
                  {p.viewCount ?? 0}
                </Td>
                <Td className="reg-code text-right font-mono text-[12px] tabular-nums text-text-secondary">
                  {helpfulRatio(p)}
                </Td>
                <Td className="text-right">
                  <span className={cn(
                    'reg-code font-mono text-[12px] tabular-nums',
                    p.status === 'PUBLISHED' && p.inboundLinkCount === 0
                      ? 'text-status-fail-fg' : 'text-text-secondary'
                  )}>
                    {p.inboundLinkCount ?? 0}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>

        {!isLoading && (data?.items || []).length === 0 && (
          <EmptyState
            icon={FileText}
            title="Nothing here yet"
            description="Write the first one."
            action={<Button variant="primary" icon={Plus} onClick={() => create.mutate()}>New post</Button>}
          />
        )}
      </div>
    </div>
  )
}

const Th = ({ children, className }) => (
  <th className={cn('px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-text-faint', className)}>
    {children}
  </th>
)
const Td = ({ children, className }) => (
  <td className={cn('px-3 py-2.5 align-middle', className)}>{children}</td>
)

/** Ratio, not a raw count — twelve yeses means nothing without the noes. */
function helpfulRatio(p) {
  const total = (p.helpfulYes || 0) + (p.helpfulNo || 0)
  if (!total) return '—'
  return `${Math.round(((p.helpfulYes || 0) / total) * 100)}%`
}