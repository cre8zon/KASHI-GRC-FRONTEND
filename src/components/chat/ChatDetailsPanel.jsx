import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  X, Hash, Lock, Users, Bell, BellOff, Settings, LogOut, UserPlus, Video, MessageSquare, Mail,
  FileText, Download, Eye, CornerDownRight, Link2, Image as ImageIcon, Info, Search,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { chatApi, one, list, errMsg } from '../../api/chat.api'
import { useDocumentDownload } from '../../hooks/useDocuments'
import { usePresence, presenceLabel } from '../../hooks/useChatPresence'
import { ImageThumb, LinkCard, appLink, extractLinks, fmtSize } from './ChatMessageParts'
import { cn } from '../../lib/cn'

/**
 * Details of a conversation — the side panel behind the header's title.
 *
 *   About   direct: the person (online / last seen, email, call, mute)
 *           group / channel: name, description, who made it, mute, settings, leave
 *   People  everyone in it, with who is online; message someone, add, remove
 *   Media   images shared here          ┐ newest first, from the messages —
 *   Files   other files shared here     │ "Go to message" jumps to where it
 *   Links   web and KashiGuard links    ┘ was shared
 */
const TABS = [
  ['about', 'About', Info],
  ['people', 'People', Users],
  ['media', 'Media', ImageIcon],
  ['files', 'Files', FileText],
  ['links', 'Links', Link2],
]

export function ChatDetailsPanel({ conv, onClose, onJump, onPreview, onMute, onSettings, onLeave, onAddPeople, onRemove, canCall, onCall }) {
  const direct = conv.kind === 'DIRECT'
  const [tab, setTab] = useState('about')
  const tabs = direct ? TABS.filter(([k]) => k !== 'people') : TABS
  const title = direct ? 'Details' : conv.kind === 'CHANNEL' ? 'Channel details' : 'Group details'

  return (
    <aside className="w-80 shrink-0 border-l border-border flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-2">
        <p className="text-xs font-semibold text-text-primary flex-1">{title}</p>
        <button type="button" onClick={onClose} title="Close" className="p-1 text-text-muted hover:text-text-primary"><X size={13} /></button>
      </div>
      <div className="flex border-b border-border-subtle px-1">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn('flex-1 py-2 text-[11px] font-medium border-b-2 -mb-px',
              tab === k ? 'border-brand-500 text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary')}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'about' && (
          <About conv={conv} onMute={onMute} onSettings={onSettings} onLeave={onLeave}
            onAddPeople={onAddPeople} canCall={canCall} onCall={onCall} onPeople={() => setTab('people')} />
        )}
        {tab === 'people' && <People conv={conv} onAddPeople={onAddPeople} onRemove={onRemove} />}
        {tab === 'media' && <Shared id={conv.id} type="media" onJump={onJump} onPreview={onPreview} />}
        {tab === 'files' && <Shared id={conv.id} type="files" onJump={onJump} onPreview={onPreview} />}
        {tab === 'links' && <Shared id={conv.id} type="links" onJump={onJump} onPreview={onPreview} />}
      </div>
    </aside>
  )
}

// ── About ────────────────────────────────────────────────────────────────────

function About({ conv, onMute, onSettings, onLeave, onAddPeople, canCall, onCall, onPeople }) {
  const presence = usePresence()
  const direct = conv.kind === 'DIRECT'
  const { data } = useQuery({ queryKey: ['chat-members', String(conv.id)], queryFn: () => chatApi.members(conv.id), enabled: direct, staleTime: 60e3 })
  const btn = 'w-full flex items-center gap-2 px-3 py-2 rounded-ctl text-xs text-text-primary hover:bg-surface-overlay'

  if (direct) {
    const other = list(data).find(p => !p.you) || (conv.members || []).find(p => p.userId === conv.otherUserId) || {}
    const online = presence.isOnline(conv.otherUserId)
    return (
      <div className="p-4 space-y-4">
        <div className="flex flex-col items-center text-center">
          <Avatar name={other.name || conv.name} size="lg" online={online} />
          <p className="text-sm font-semibold text-text-primary mt-2">{other.name || conv.name}</p>
          <p className={cn('text-[11px] mt-0.5', online ? 'text-status-pass-fg' : 'text-text-muted')}>
            {presenceLabel(online, presence.lastSeen(conv.otherUserId))}
          </p>
          {other.email && (
            <a href={`mailto:${other.email}`} className="mt-1 inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary">
              <Mail size={11} /> {other.email}
            </a>
          )}
        </div>
        {conv.member && (
          <div className="space-y-0.5">
            {canCall && <button type="button" className={btn} onClick={onCall}><Video size={13} /> Start a video call</button>}
            <button type="button" className={btn} onClick={onMute}>{conv.muted ? <Bell size={13} /> : <BellOff size={13} />} {conv.muted ? 'Unmute' : 'Mute notifications'}</button>
          </div>
        )}
      </div>
    )
  }

  const ids = (conv.members || []).map(p => p.userId)
  const online = presence.onlineCount(ids)
  const Icon = conv.kind === 'CHANNEL' ? (conv.visibility === 'PRIVATE' ? Lock : Hash) : Users
  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col items-center text-center">
        <span className="w-14 h-14 rounded-full bg-brand-500/15 text-brand-900 flex items-center justify-center"><Icon size={22} /></span>
        <p className="text-sm font-semibold text-text-primary mt-2 break-words">{conv.kind === 'CHANNEL' ? '#' : ''}{conv.name}</p>
        <p className="text-[11px] text-text-muted mt-0.5">
          {conv.kind === 'CHANNEL' ? (conv.visibility === 'PRIVATE' ? 'Private channel' : 'Public channel') : 'Group'}
          {conv.archived ? ' · archived' : ''}
        </p>
      </div>
      {conv.description && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1">About</p>
          <p className="text-xs text-text-primary whitespace-pre-wrap break-words">{conv.description}</p>
        </div>
      )}
      <dl className="text-xs space-y-1.5">
        <div className="flex justify-between gap-2">
          <dt className="text-text-muted">People</dt>
          <dd><button type="button" onClick={onPeople} className="text-text-primary hover:underline">
            {conv.memberCount}{online > 0 ? ` · ${online} online` : ''}
          </button></dd>
        </div>
        {conv.createdByName && (
          <div className="flex justify-between gap-2"><dt className="text-text-muted">Created by</dt><dd className="text-text-primary truncate">{conv.createdByName}</dd></div>
        )}
        {conv.createdAt && (
          <div className="flex justify-between gap-2"><dt className="text-text-muted">Created</dt>
            <dd className="text-text-primary">{new Date(conv.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</dd></div>
        )}
        {conv.member && conv.myRole === 'OWNER' && conv.kind === 'CHANNEL' && (
          <div className="flex justify-between gap-2"><dt className="text-text-muted">Your role</dt><dd className="text-text-primary">Owner</dd></div>
        )}
      </dl>
      {conv.member && (
        <div className="space-y-0.5 border-t border-border-subtle pt-3">
          {canCall && <button type="button" className={btn} onClick={onCall}><Video size={13} /> Start a video call</button>}
          <button type="button" className={btn} onClick={onMute}>{conv.muted ? <Bell size={13} /> : <BellOff size={13} />} {conv.muted ? 'Unmute' : 'Mute notifications'}</button>
          {conv.canManage && !conv.archived && <button type="button" className={btn} onClick={onAddPeople}><UserPlus size={13} /> Add people</button>}
          {conv.canManage && <button type="button" className={btn} onClick={onSettings}><Settings size={13} /> {conv.kind === 'CHANNEL' ? 'Channel settings' : 'Group settings'}</button>}
          <button type="button" className={cn(btn, 'text-status-fail-fg')} onClick={onLeave}><LogOut size={13} /> Leave {conv.kind === 'CHANNEL' ? 'channel' : 'group'}</button>
        </div>
      )}
    </div>
  )
}

// ── People ───────────────────────────────────────────────────────────────────

function People({ conv, onAddPeople, onRemove }) {
  const navigate = useNavigate()
  const presence = usePresence()
  const [q, setQ] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['chat-members', String(conv.id)], queryFn: () => chatApi.members(conv.id), staleTime: 30e3 })
  const people = list(data)
  const term = q.trim().toLowerCase()
  const shown = (term ? people.filter(p => `${p.name} ${p.email || ''}`.toLowerCase().includes(term)) : people)
    // Online first, then the server's order (owners, then by name).
    .map((p, i) => ({ p, i, on: presence.isOnline(p.userId) }))
    .sort((a, b) => (b.on - a.on) || (a.i - b.i))
  const canRemove = conv.canManage && conv.kind === 'CHANNEL' && !conv.archived

  const message = (uid) => chatApi.create({ kind: 'DIRECT', userId: uid })
    .then(r => { const c = one(r); if (c?.id) navigate(`/chat/${c.id}`) })
    .catch(e => toast.error(errMsg(e, 'Could not start the conversation')))

  return (
    <div className="py-2">
      <div className="px-3 pb-2 flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${people.length || ''} people`}
            className="w-full h-7 pl-6 pr-2 rounded-ctl border border-border bg-surface-raised text-xs text-text-primary" />
        </div>
        {conv.canManage && !conv.archived && (
          <button type="button" onClick={onAddPeople} title="Add people"
            className="p-1.5 rounded-ctl border border-border text-text-muted hover:text-text-primary hover:bg-surface-overlay"><UserPlus size={13} /></button>
        )}
      </div>
      {isLoading ? <p className="px-3 py-2 text-xs text-text-muted">Loading…</p>
        : shown.length === 0 ? <p className="px-3 py-2 text-xs text-text-muted">Nobody found.</p>
        : shown.map(({ p, on }) => (
          <div key={p.userId} className="group px-3 py-1.5 flex items-center gap-2 hover:bg-surface-overlay/60">
            <Avatar name={p.name} online={on} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-text-primary truncate">
                {p.name}{p.you ? ' (you)' : ''}
                {p.role === 'OWNER' && conv.kind === 'CHANNEL' && <span className="ml-1.5 px-1.5 py-px rounded-badge bg-surface-overlay text-[9px] text-text-secondary">Owner</span>}
              </p>
              <p className={cn('text-[10px] truncate', on ? 'text-status-pass-fg' : 'text-text-muted')}>
                {p.you ? (p.email || '') : presenceLabel(on, presence.lastSeen(p.userId))}
              </p>
            </div>
            {!p.you && (
              <button type="button" onClick={() => message(p.userId)} title={`Message ${p.name}`}
                className="p-1 text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100"><MessageSquare size={13} /></button>
            )}
            {canRemove && !p.you && (
              <button type="button" onClick={() => onRemove(p.userId)} title="Remove from channel"
                className="p-1 text-text-muted hover:text-status-fail-fg opacity-0 group-hover:opacity-100"><X size={13} /></button>
            )}
          </div>
        ))}
    </div>
  )
}

// ── Media / Files / Links ────────────────────────────────────────────────────

function Shared({ id, type, onJump, onPreview }) {
  const { openDocument } = useDocumentDownload()
  const q = useInfiniteQuery({
    queryKey: ['chat-shared', String(id), type],
    queryFn: ({ pageParam }) => chatApi.shared(id, type, pageParam),
    initialPageParam: null,
    getNextPageParam: (last) => { const p = one(last); return p?.hasMore ? p.nextBefore : undefined },
    staleTime: 30e3,
  })
  const pages = q.data?.pages || []
  const items = pages.flatMap(p => one(p)?.items || [])
  // A page scans 100 messages; keep going (a little) until there is something to show.
  const { hasNextPage, isFetching, fetchNextPage } = q
  useEffect(() => {
    if (items.length < 12 && hasNextPage && !isFetching && pages.length < 10) fetchNextPage()
  }, [items.length, hasNextPage, isFetching, pages.length, fetchNextPage])

  const empty = { media: 'No images shared here yet.', files: 'No files shared here yet.', links: 'No links shared here yet.' }[type]
  const meta = (it) => `${it.senderName} · ${new Date(it.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
  const jumpBtn = (it) => (
    <button type="button" onClick={() => onJump(it.messageId)} title="Go to message" className="p-1 text-text-muted hover:text-text-primary">
      <CornerDownRight size={13} />
    </button>
  )

  let body
  if (q.isLoading) body = <p className="px-3 py-3 text-xs text-text-muted">Loading…</p>
  else if (q.isError) body = <p className="px-3 py-3 text-xs text-status-fail-fg">Could not load this.</p>
  else if (!items.length && !hasNextPage && !isFetching) body = <p className="px-3 py-6 text-xs text-text-muted text-center">{empty}</p>
  else if (type === 'media') {
    body = (
      <div className="p-2 grid grid-cols-3 gap-1">
        {items.map(it => (
          <div key={`${it.messageId}-${it.documentId}`} className="relative group">
            <ImageThumb file={it} tile onClick={() => onPreview(it)} />
            <button type="button" onClick={() => onJump(it.messageId)} title={`Go to message · ${meta(it)}`}
              className="absolute bottom-1 right-1 p-1 rounded-ctl bg-surface-raised/90 text-text-secondary hover:text-text-primary opacity-0 group-hover:opacity-100">
              <CornerDownRight size={11} />
            </button>
          </div>
        ))}
      </div>
    )
  } else if (type === 'files') {
    body = items.map(it => (
      <div key={`${it.messageId}-${it.documentId}`} className="px-3 py-2 flex items-center gap-2 border-b border-border-subtle hover:bg-surface-overlay/60">
        <FileText size={16} className="text-text-muted shrink-0" />
        <button type="button" onClick={() => onPreview(it)} className="min-w-0 flex-1 text-left">
          <p className="text-xs text-text-primary truncate" title={it.fileName}>{it.fileName}</p>
          <p className="text-[10px] text-text-muted truncate">{fmtSize(it.size)}{it.size != null ? ' · ' : ''}{meta(it)}</p>
        </button>
        <button type="button" onClick={() => onPreview(it)} title="Preview" className="p-1 text-text-muted hover:text-text-primary"><Eye size={13} /></button>
        <button type="button" onClick={() => openDocument(it.documentId, it.fileName)} title="Download" className="p-1 text-text-muted hover:text-text-primary"><Download size={13} /></button>
        {jumpBtn(it)}
      </div>
    ))
  } else {
    // Links: one row per link; KashiGuard records and meetings as their cards.
    const rows = []
    const seen = new Set()
    items.forEach(it => extractLinks(it.body).forEach(href => {
      const a = appLink(href)
      const key = a && a.kind !== 'page' ? `${a.kind}:${a.type || ''}:${a.id}` : href
      if (seen.has(key)) return
      seen.add(key)
      rows.push({ it, href, a, key })
    }))
    body = rows.length === 0 && !hasNextPage
      ? <p className="px-3 py-6 text-xs text-text-muted text-center">{empty}</p>
      : rows.map(({ it, href, a, key }) => (
        <div key={key} className="px-3 py-2 border-b border-border-subtle">
          {a && a.kind !== 'page' ? <LinkCard link={a} /> : <LinkRow href={href} internal={!!a} />}
          <div className="flex items-center gap-1 mt-0.5">
            <p className="text-[10px] text-text-muted flex-1 truncate">{meta(it)}</p>
            {jumpBtn(it)}
          </div>
        </div>
      ))
  }

  return (
    <div>
      {body}
      {hasNextPage && (
        <div className="p-2 text-center">
          <button type="button" onClick={() => fetchNextPage()} disabled={isFetching}
            className="text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-60">
            {isFetching ? 'Loading…' : 'Show older'}
          </button>
        </div>
      )}
    </div>
  )
}

function LinkRow({ href, internal }) {
  const navigate = useNavigate()
  let host = href
  try { host = internal ? 'KashiGuard' : new URL(href).hostname.replace(/^www\./, '') } catch { /* keep the text */ }
  const open = (e) => {
    if (!internal || e.metaKey || e.ctrlKey) return
    e.preventDefault()
    const u = new URL(href, window.location.origin)
    navigate(u.pathname + u.search + u.hash)
  }
  return (
    <a href={href} onClick={open} target={internal ? undefined : '_blank'} rel={internal ? undefined : 'noopener noreferrer nofollow'}
      className="flex items-start gap-2 rounded-ctl border border-border bg-surface-raised px-2 py-1.5 hover:bg-surface-overlay">
      <Link2 size={13} className="text-text-muted shrink-0 mt-0.5" />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-text-primary truncate">{host}</span>
        <span className="block text-[10px] text-text-muted break-all line-clamp-2">{href}</span>
      </span>
    </a>
  )
}

// ── bits ─────────────────────────────────────────────────────────────────────

/** Initials avatar with an online dot. */
export function Avatar({ name, online, size = 'sm' }) {
  const lg = size === 'lg'
  return (
    <span className="relative shrink-0 inline-block">
      <span className={cn('rounded-full bg-brand-500/20 text-brand-900 font-semibold flex items-center justify-center',
        lg ? 'w-14 h-14 text-lg' : 'w-7 h-7 text-[10px]')}>{initials(name)}</span>
      {online && <PresenceDot className={lg ? 'w-3.5 h-3.5 right-0.5 bottom-0.5' : undefined} />}
    </span>
  )
}

/** The green "online" dot, placed on the corner of a relative parent. */
export function PresenceDot({ className }) {
  return <span title="Online" className={cn('absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-status-pass-fg ring-2 ring-surface-raised', className)} />
}

function initials(name) {
  const parts = String(name || '?').replace(/\(you\)/, '').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}