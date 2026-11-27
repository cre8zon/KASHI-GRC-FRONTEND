/**
 * Questions the website assistant could not answer from the website — the
 * list of content the site is missing. Grouped by the question's wording so
 * the same gap asked ten times reads as one line with a count.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { HelpCircle, RefreshCw } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Empty, SelectIn, errMsg, fmtDate } from '../billing/billingShared'
import { siteAssistantApi } from '../../api/siteAssistant.api'

const norm = (q) => String(q || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

export function UnansweredQuestionsModal({ open, onClose, onOpenEnquiry, canManage }) {
  const [days, setDays] = useState('30')
  const { data, isLoading } = useQuery({
    queryKey: ['site-chat-unanswered', days],
    queryFn: () => siteAssistantApi.unanswered(Number(days)),
    enabled: open,
  })
  const reindex = useMutation({
    mutationFn: siteAssistantApi.reindexPosts,
    onSuccess: (r) => toast.success(`${r?.queued ?? 0} published posts queued for the assistant`),
    onError: (err) => toast.error(errMsg(err)),
  })

  const groups = useMemo(() => {
    const m = new Map()
    for (const it of data || []) {
      const k = norm(it.question)
      if (!k) continue
      const g = m.get(k) || { question: it.question, count: 0, last: it.at, pages: new Set(), enquiryId: null }
      g.count += 1
      if (it.page) g.pages.add(it.page)
      if (!g.enquiryId && it.enquiryId) g.enquiryId = it.enquiryId
      if (new Date(it.at) > new Date(g.last)) g.last = it.at
      m.set(k, g)
    }
    return [...m.values()].sort((a, b) => b.count - a.count || new Date(b.last) - new Date(a.last))
  }, [data])

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Questions the assistant couldn't answer"
      subtitle="Asked in the website chat, with no page on the site that answered them. Each one is a page or FAQ worth writing.">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-40">
            <SelectIn value={days} onChange={e => setDays(e.target.value)}
              options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
          </div>
          <span className="text-xs text-text-muted">{groups.length} question{groups.length === 1 ? '' : 's'}</span>
          {canManage && (
            <Button className="ml-auto" size="sm" variant="secondary" icon={RefreshCw} loading={reindex.isPending}
              onClick={() => reindex.mutate()} title="Make every published blog, glossary and resource post available to the assistant">
              Re-index published posts
            </Button>
          )}
        </div>

        {isLoading ? <p className="text-sm text-text-muted">Loading…</p> : groups.length === 0 ? (
          <Empty icon={HelpCircle} title="Nothing unanswered">
            Every question in this period was answered from the website's own pages.
          </Empty>
        ) : (
          <ul className="divide-y divide-border-subtle rounded-card border border-border glass-card">
            {groups.map(g => (
              <li key={g.question} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 min-w-[28px] h-6 px-1.5 rounded-badge bg-status-warn-bg text-status-warn-fg text-xs font-semibold flex items-center justify-center">
                  {g.count}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">{g.question}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Last asked {fmtDate(g.last)}{g.pages.size > 0 && ` · on ${[...g.pages].slice(0, 3).join(', ')}`}
                  </p>
                </div>
                {g.enquiryId && (
                  <button type="button" onClick={() => onOpenEnquiry?.(g.enquiryId)}
                    className="shrink-0 text-xs text-brand-ink hover:underline">Open enquiry</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

export default UnansweredQuestionsModal
