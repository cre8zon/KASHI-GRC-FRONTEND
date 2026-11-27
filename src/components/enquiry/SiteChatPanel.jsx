/**
 * The website chat an enquiry came from (Enquiry.channel === 'CHAT'):
 * the AI's summary for the team, the whole conversation, and a reply box.
 *
 * A reply is shown in the visitor's chat (the next time their browser has
 * the chat open) and emailed to them, and it is written to the timeline as a
 * reply — the first one starts the response clock, like a note.
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bot, Send, Sparkles, UserRound, ExternalLink, Headset } from 'lucide-react'
import { Button } from '../ui/Button'
import { SectionTitle, TextArea, errMsg, fmtDate } from '../billing/billingShared'
import { siteAssistantApi } from '../../api/siteAssistant.api'
import { cn } from '../../lib/cn'

const time = (v) => v ? `${fmtDate(v)} ${new Date(v).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''

export function SiteChatPanel({ enquiryId, visitorName, canManage, onReplied }) {
  const qc = useQueryClient()
  const [reply, setReply] = useState('')
  const listRef = useRef(null)

  const { data: chat, isLoading, isError } = useQuery({
    queryKey: ['site-chat', enquiryId],
    queryFn: () => siteAssistantApi.chat(enquiryId),
    enabled: !!enquiryId,
    refetchInterval: 30_000,       // the visitor may keep writing
  })

  const send = useMutation({
    mutationFn: () => siteAssistantApi.reply(enquiryId, reply.trim()),
    onSuccess: (fresh) => {
      qc.setQueryData(['site-chat', enquiryId], fresh)
      setReply('')
      toast.success('Reply sent — in their chat and by email')
      onReplied?.()
    },
    onError: (err) => toast.error(errMsg(err)),
  })

  const messages = chat?.messages || []
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  if (isLoading) return <p className="text-sm text-text-muted">Loading the conversation…</p>
  if (isError || !chat) return null

  const first = (visitorName || '').trim().split(/\s+/)[0] || 'the visitor'

  return (
    <div className="space-y-3">
      {chat.summary && (
        <div className="rounded-card border border-brand-500/25 bg-brand-500/5 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-ink mb-1.5">
            <Sparkles size={12} /> AI summary{chat.topic ? ` · ${chat.topic}` : ''}
          </p>
          <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{chat.summary}</p>
        </div>
      )}

      <div>
        <SectionTitle actions={
          <span className="text-[11px] text-text-muted normal-case tracking-normal">
            Started {time(chat.startedAt)}{chat.firstPage ? ` on ${chat.firstPage}` : ''}
          </span>
        }>Website chat</SectionTitle>
        <div ref={listRef} className="max-h-[420px] overflow-y-auto rounded-card border border-border glass-card p-3 space-y-3">
          {messages.map(m => <ChatLine key={m.id} m={m} />)}
        </div>
      </div>

      {canManage && (
        <div className="rounded-card border border-border glass-card p-3 space-y-2">
          <TextArea rows={3} value={reply} onChange={ev => setReply(ev.target.value)}
            placeholder={`Reply to ${first}. They'll see it in their chat and get it by email.`} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-text-muted">
              Sent by email to the address they gave, and shown in the chat if they come back to the website.
            </p>
            <Button size="sm" icon={Send} disabled={!reply.trim()} loading={send.isPending} onClick={() => send.mutate()}>
              Send reply
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ChatLine({ m }) {
  const visitor = m.role === 'VISITOR'
  const staff = m.role === 'STAFF'
  const Icon = visitor ? UserRound : staff ? Headset : Bot
  return (
    <div className={cn('flex gap-2.5', visitor && 'flex-row-reverse')}>
      <span className={cn('mt-0.5 h-6 w-6 shrink-0 rounded-full flex items-center justify-center',
        visitor ? 'bg-surface-overlay text-text-secondary' : staff ? 'bg-status-pass-bg text-status-pass-fg' : 'bg-brand-500/10 text-brand-ink')}>
        <Icon size={12} />
      </span>
      <div className={cn('min-w-0 max-w-[85%]', visitor && 'text-right')}>
        <p className="text-[10px] text-text-muted mb-0.5">
          {visitor ? 'Visitor' : staff ? (m.authorName || 'KashiGuard team') : 'Assistant'} · {time(m.at)}
          {m.role === 'ASSISTANT' && m.handoverSuggested && <span className="ml-1.5 text-status-warn-fg">suggested a person</span>}
        </p>
        <div className={cn('inline-block text-left rounded-card px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed',
          visitor ? 'bg-brand-500/10 text-text-primary' : staff ? 'bg-status-pass-bg/60 text-text-primary' : 'bg-surface-overlay/70 text-text-primary')}>
          {m.body}
        </div>
        {m.citations?.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.citations.map(c => (
              <a key={c.label} href={c.url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-badge bg-status-tag-bg text-status-tag-fg hover:text-brand-ink">
                {c.label} · {c.title} <ExternalLink size={9} />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default SiteChatPanel
