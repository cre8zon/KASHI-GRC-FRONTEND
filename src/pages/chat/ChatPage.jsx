import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquare, Hash, Lock, Search, Plus, Users, Bell, BellOff, Settings, LogOut, Pencil, Trash2, X,
  UserPlus, Send, Globe, Archive,
} from 'lucide-react'
import { chatApi, one, list, errMsg } from '../../api/chat.api'
import { useChatSocket } from '../../hooks/useChatSocket'
import { PeopleMultiSelect } from '../../components/collab/PeopleMultiSelect'
import { PageLayout } from '../../components/layout/PageLayout'
import { Button } from '../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

/**
 * Chat — direct messages, groups and channels for the organisation's own
 * staff (invited auditors never see it; they collaborate in workspaces).
 *
 * Left: my conversations by kind, unread counts, search, + to start one or
 * browse public channels. Right: the conversation — messages by day, edit
 * and delete your own, @mentions (the person is notified), mute, add people,
 * channel settings. Updates arrive live (useChatSocket); the page also polls,
 * so it keeps working if the socket is down.
 */
const KEY_LIST = ['chat-conversations']
const keyMsgs = (id) => ['chat-messages', String(id)]
const BADGE = ['nav-badge', '/v1/chat/unread']

export default function ChatPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [starting, setStarting] = useState(null)    // 'DIRECT' | 'GROUP' | 'CHANNEL' | 'BROWSE'
  const [menu, setMenu] = useState(false)

  const { data: meRaw, isLoading: meLoading } = useQuery({ queryKey: ['chat-me'], queryFn: () => chatApi.me(), staleTime: 5 * 60e3 })
  const me = one(meRaw) || {}
  const { data: raw, isLoading } = useQuery({
    queryKey: KEY_LIST, queryFn: () => chatApi.conversations(), enabled: !!me.canUse, refetchInterval: 30_000,
  })
  const convs = list(raw)

  useChatSocket((ev) => {
    if (ev?.type !== 'chat') return
    qc.invalidateQueries({ queryKey: KEY_LIST })
    qc.invalidateQueries({ queryKey: BADGE })
    if (ev.conversationId) {
      qc.invalidateQueries({ queryKey: keyMsgs(ev.conversationId) })
      qc.invalidateQueries({ queryKey: ['chat-conversation', String(ev.conversationId)] })
    }
  })

  const shown = convs.filter(c => !q.trim() || String(c.name).toLowerCase().includes(q.trim().toLowerCase()))
  const groups = [
    ['CHANNEL', 'Channels', shown.filter(c => c.kind === 'CHANNEL' && !c.archived)],
    ['GROUP', 'Groups', shown.filter(c => c.kind === 'GROUP' && !c.archived)],
    ['DIRECT', 'Direct messages', shown.filter(c => c.kind === 'DIRECT')],
    ['ARCHIVED', 'Archived', shown.filter(c => c.archived && c.kind !== 'DIRECT')],
  ]
  const open = (cid) => navigate(`/chat/${cid}`)

  if (!meLoading && !me.canUse) {
    return (
      <PageLayout title="Chat">
        <p className="px-6 text-sm text-text-muted">Chat is for the organisation's own staff, and needs the chat:use permission.</p>
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Chat" subtitle="Direct messages, groups and channels — your organisation only">
      <div className="px-6 pb-6 h-full min-h-0">
        <div className="h-full min-h-[480px] flex rounded-card border border-border bg-surface-raised overflow-hidden">
          {/* ── Conversations ── */}
          <aside className="w-72 shrink-0 border-r border-border flex flex-col min-h-0">
            <div className="p-2 flex items-center gap-1.5 border-b border-border-subtle relative">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a conversation"
                  className="w-full h-8 pl-7 pr-2 rounded-ctl border border-border bg-surface-raised text-xs text-text-primary" />
              </div>
              <Button size="icon-sm" icon={Plus} aria-label="New" onClick={() => setMenu(m => !m)} />
              {menu && (
                <>
                  <div className="fixed inset-0 z-[30]" onClick={() => setMenu(false)} />
                  <div className="absolute right-2 top-full mt-1 z-[31] w-52 rounded-ctl border border-border bg-surface-raised shadow-overlay py-1">
                    {[['DIRECT', MessageSquare, 'New message'], ['GROUP', Users, 'New group'], ['CHANNEL', Hash, 'New channel'], ['BROWSE', Globe, 'Browse channels']]
                      .map(([k, Icon, label]) => (
                        <button key={k} type="button" onClick={() => { setMenu(false); setStarting(k) }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-surface-overlay">
                          <Icon size={12} /> {label}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {isLoading ? <p className="px-3 py-4 text-xs text-text-muted">Loading…</p>
                : convs.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm text-text-primary">No conversations yet</p>
                    <p className="text-xs text-text-muted mt-1">Message a colleague, start a group, or join a channel.</p>
                    <Button size="sm" className="mt-3" icon={MessageSquare} onClick={() => setStarting('DIRECT')}>New message</Button>
                  </div>
                ) : groups.map(([k, label, items]) => items.length > 0 && (
                  <div key={k} className="mb-2">
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
                    {items.map(c => (
                      <button key={c.id} type="button" onClick={() => open(c.id)}
                        className={cn('w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-surface-overlay/60',
                          String(c.id) === String(id) && 'bg-brand-500/10')}>
                        <ConvIcon c={c} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className={cn('text-sm truncate', c.unread > 0 ? 'font-semibold text-text-primary' : 'text-text-primary')}>{c.name}</span>
                            {c.muted && <BellOff size={10} className="text-text-muted shrink-0" />}
                          </div>
                          {c.lastMessage && (
                            <p className="text-[11px] text-text-muted truncate">{c.lastMessage.senderName}: {c.lastMessage.text}</p>
                          )}
                        </div>
                        {c.unread > 0 && (
                          <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-brand-900 text-[10px] font-semibold flex items-center justify-center">
                            {c.unread > 99 ? '99+' : c.unread}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
            </div>
          </aside>

          {/* ── Conversation ── */}
          <section className="flex-1 min-w-0 flex flex-col min-h-0">
            {id ? <Conversation key={id} id={id} me={me} onGone={() => navigate('/chat')} />
              : (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                  <MessageSquare size={28} className="text-text-muted" />
                  <p className="text-sm text-text-primary mt-2">Pick a conversation</p>
                  <p className="text-xs text-text-muted mt-1">or start one with +</p>
                </div>
              )}
          </section>
        </div>
      </div>

      <StartModal kind={starting} onClose={() => setStarting(null)} meId={me.userId}
        onDone={(c) => { qc.invalidateQueries({ queryKey: KEY_LIST }); setStarting(null); if (c?.id) open(c.id) }} />
    </PageLayout>
  )
}

function ConvIcon({ c }) {
  const cls = 'mt-0.5 shrink-0 text-text-muted'
  if (c.kind === 'CHANNEL') return c.visibility === 'PRIVATE' ? <Lock size={13} className={cls} /> : <Hash size={13} className={cls} />
  if (c.kind === 'GROUP') return <Users size={13} className={cls} />
  return <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-surface-overlay text-[8px] font-semibold text-text-secondary flex items-center justify-center">{initials(c.name)}</span>
}

// ── One conversation ─────────────────────────────────────────────────────────

function Conversation({ id, me, onGone }) {
  const qc = useQueryClient()
  const [older, setOlder] = useState([])           // pages loaded with "earlier messages"
  const [hasOlder, setHasOlder] = useState(null)
  const [editing, setEditing] = useState(null)     // message
  const [adding, setAdding] = useState(false)
  const [settings, setSettings] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [firstUnread, setFirstUnread] = useState(undefined)
  const bottom = useRef(null)
  const scroller = useRef(null)

  const { data: convRaw, isError } = useQuery({ queryKey: ['chat-conversation', String(id)], queryFn: () => chatApi.conversation(id), retry: false })
  const conv = one(convRaw)
  const { data: msgRaw, isLoading } = useQuery({ queryKey: keyMsgs(id), queryFn: () => chatApi.messages(id), refetchInterval: 15_000 })
  const page = one(msgRaw) || {}
  const latest = Array.isArray(page.messages) ? page.messages : []
  const messages = useMemo(() => {
    const seen = new Set(latest.map(m => m.id))
    return [...older.filter(m => !seen.has(m.id)), ...latest]
  }, [older, latest])

  useEffect(() => { if (isError) { toast.error('That conversation is not available'); onGone() } }, [isError, onGone])

  // Where "New" goes: the first message after what I had read when I opened it.
  useEffect(() => {
    if (firstUnread !== undefined || !msgRaw) return
    const lr = page.lastReadMessageId
    const m = latest.find(x => !x.mine && (lr == null || x.id > lr))
    setFirstUnread(m ? m.id : null)
  }, [msgRaw, firstUnread, page.lastReadMessageId, latest])

  // Mark read and keep the view at the bottom when new messages arrive.
  const lastId = latest.length ? latest[latest.length - 1].id : null
  useEffect(() => {
    if (!lastId || !conv?.member) return
    const el = scroller.current
    const nearBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (nearBottom) bottom.current?.scrollIntoView({ block: 'end' })
    if (document.visibilityState === 'visible') {
      chatApi.read(id, lastId).then(() => {
        qc.invalidateQueries({ queryKey: KEY_LIST })
        qc.invalidateQueries({ queryKey: BADGE })
      }).catch(() => {})
    }
  }, [lastId, conv?.member, id, qc])

  const loadEarlier = async () => {
    const first = messages[0]?.id
    if (!first) return
    const el = scroller.current, h = el?.scrollHeight
    const r = one(await chatApi.messages(id, first))
    setOlder(o => [...(r.messages || []), ...o])
    setHasOlder(!!r.hasMore)
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - h })
  }
  const more = hasOlder ?? page.hasMore

  const refresh = () => {
    qc.invalidateQueries({ queryKey: keyMsgs(id) })
    qc.invalidateQueries({ queryKey: ['chat-conversation', String(id)] })
    qc.invalidateQueries({ queryKey: KEY_LIST })
  }
  const update = useMutation({
    mutationFn: (body) => chatApi.update(id, body),
    onSuccess: refresh,
    onError: (e) => toast.error(errMsg(e, 'Could not change the conversation')),
  })
  const join = useMutation({
    mutationFn: () => chatApi.join(id),
    onSuccess: () => { toast.success('Joined'); refresh() },
    onError: (e) => toast.error(errMsg(e, 'Could not join')),
  })
  const leave = useMutation({
    mutationFn: () => chatApi.removeMember(id, me.userId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY_LIST }); onGone() },
    onError: (e) => toast.error(errMsg(e, 'Could not leave')),
  })
  const del = useMutation({
    mutationFn: (mid) => chatApi.remove(mid),
    onSuccess: refresh,
    onError: (e) => toast.error(errMsg(e, 'Could not delete the message')),
  })

  if (!conv) return <div className="flex-1 flex items-center justify-center text-xs text-text-muted">Loading…</div>
  const owner = conv.kind === 'CHANNEL' && conv.myRole === 'OWNER'

  return (
    <>
      <header className="px-4 py-2.5 border-b border-border flex items-center gap-3">
        <ConvIcon c={conv} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary truncate">{conv.name}{conv.archived && <span className="ml-2 text-[11px] font-normal text-text-muted">archived</span>}</p>
          <p className="text-[11px] text-text-muted truncate">
            {conv.description ? `${conv.description} · ` : ''}{conv.memberCount} {conv.memberCount === 1 ? 'person' : 'people'}
          </p>
        </div>
        {conv.member && (
          <div className="flex items-center gap-1">
            <HeaderBtn label={conv.muted ? 'Unmute' : 'Mute'} onClick={() => update.mutate({ muted: !conv.muted })}>
              {conv.muted ? <BellOff size={14} /> : <Bell size={14} />}
            </HeaderBtn>
            {conv.canManage && !conv.archived && <HeaderBtn label="Add people" onClick={() => setAdding(true)}><UserPlus size={14} /></HeaderBtn>}
            {conv.canManage && <HeaderBtn label="Settings" onClick={() => setSettings(true)}><Settings size={14} /></HeaderBtn>}
            {conv.kind !== 'DIRECT' && <HeaderBtn label="Leave" onClick={() => setLeaving(true)}><LogOut size={14} /></HeaderBtn>}
          </div>
        )}
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-3">
        {more && (
          <div className="text-center mb-3">
            <Button variant="ghost" size="xs" onClick={loadEarlier}>Earlier messages</Button>
          </div>
        )}
        {isLoading ? <p className="text-xs text-text-muted">Loading…</p>
          : messages.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-10">
              {conv.kind === 'CHANNEL' ? `This is the start of #${conv.name}.` : 'No messages yet — say hello.'}
            </p>
          ) : messages.map((m, i) => {
            const prev = messages[i - 1]
            const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)
            const grouped = prev && !newDay && prev.senderId === m.senderId
              && new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60e3 && m.id !== firstUnread
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="flex items-center gap-2 my-3">
                    <span className="flex-1 border-t border-border-subtle" />
                    <span className="text-[10px] text-text-muted">{dayLabel(m.createdAt)}</span>
                    <span className="flex-1 border-t border-border-subtle" />
                  </div>
                )}
                {m.id === firstUnread && (
                  <div className="flex items-center gap-2 my-2">
                    <span className="flex-1 border-t border-status-fail-fg/50" />
                    <span className="text-[10px] font-medium text-status-fail-fg">New</span>
                  </div>
                )}
                <MessageRow m={m} grouped={grouped} members={conv.members || []} meId={me.userId}
                  canDelete={(m.mine || owner) && !m.deleted && conv.member}
                  onEdit={() => setEditing(m)} onDelete={() => del.mutate(m.id)} />
              </div>
            )
          })}
        <div ref={bottom} />
      </div>

      {conv.member ? (
        conv.archived
          ? <p className="px-4 py-3 border-t border-border text-xs text-text-muted">This conversation is archived — read only.</p>
          : <Composer id={id} members={(conv.members || []).filter(p => p.userId !== me.userId)}
              onSent={(msg) => {
                qc.setQueryData(keyMsgs(id), (old) => {
                  const p = one(old) || {}
                  const ms = Array.isArray(p.messages) ? p.messages : []
                  return ms.some(x => x.id === msg.id) ? old : { ...p, messages: [...ms, msg] }
                })
                requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: 'end' }))
                qc.invalidateQueries({ queryKey: KEY_LIST })
              }} />
      ) : (
        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
          <span className="text-xs text-text-muted">You are previewing #{conv.name}.</span>
          <Button size="sm" onClick={() => join.mutate()} loading={join.isPending}>Join channel</Button>
        </div>
      )}

      <EditMessageModal message={editing} onClose={() => setEditing(null)} onDone={refresh} />
      <PeopleModal open={adding} onClose={() => setAdding(false)} title="Add people" exclude={(conv.members || []).map(p => p.userId)}
        confirmLabel="Add" onConfirm={(ids) => chatApi.addMembers(id, ids).then(() => { toast.success('Added'); refresh(); setAdding(false) })
          .catch(e => toast.error(errMsg(e, 'Could not add')))} />
      <SettingsModal open={settings} conv={conv} onClose={() => setSettings(false)}
        onSave={(body) => update.mutate(body, { onSuccess: () => setSettings(false) })} saving={update.isPending}
        onRemove={(uid) => chatApi.removeMember(id, uid).then(refresh).catch(e => toast.error(errMsg(e, 'Could not remove')))} meId={me.userId} />
      <ConfirmDialog open={leaving} onClose={() => setLeaving(false)} onCancel={() => setLeaving(false)}
        onConfirm={() => leave.mutate()} loading={leave.isPending} title={`Leave ${conv.kind === 'CHANNEL' ? '#' + conv.name : 'this group'}?`}
        message={conv.kind === 'CHANNEL' && conv.visibility === 'PUBLIC' ? 'You can join again from Browse channels.' : 'Someone in it will have to add you back.'}
        confirmLabel="Leave" />
    </>
  )
}

function HeaderBtn({ label, onClick, children }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay">{children}</button>
  )
}

function MessageRow({ m, grouped, members, meId, canDelete, onEdit, onDelete }) {
  const time = new Date(m.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return (
    <div className={cn('group relative flex gap-2.5 rounded px-1 -mx-1 hover:bg-surface-overlay/40', grouped ? 'mt-0.5' : 'mt-3')}>
      <div className="w-8 shrink-0">
        {!grouped && (
          <span className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-900 text-[11px] font-semibold flex items-center justify-center">{initials(m.senderName)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="text-xs">
            <span className="font-semibold text-text-primary">{m.senderName}</span>
            <span className="ml-2 text-[10px] text-text-muted">{time}</span>
          </p>
        )}
        {m.deleted
          ? <p className="text-sm italic text-text-muted">Message deleted</p>
          : <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
              {renderBody(m.body, m.mentions, members, meId)}
              {m.editedAt && <span className="ml-1 text-[10px] text-text-muted">(edited)</span>}
            </p>}
      </div>
      {!m.deleted && (m.mine || canDelete) && (
        <div className="absolute right-1 -top-2 hidden group-hover:flex items-center rounded-ctl border border-border bg-surface-raised shadow-elevated">
          {m.mine && <button type="button" onClick={onEdit} title="Edit" className="p-1 text-text-muted hover:text-text-primary"><Pencil size={12} /></button>}
          {canDelete && <button type="button" onClick={onDelete} title="Delete" className="p-1 text-text-muted hover:text-status-fail-fg"><Trash2 size={12} /></button>}
        </div>
      )}
    </div>
  )
}

/** Highlight "@Name" for people the message mentioned; you in a stronger colour. */
function renderBody(body, mentions = [], members, meId) {
  const names = members.filter(p => mentions.includes(p.userId)).map(p => ({ id: p.userId, token: '@' + p.name }))
  if (!names.length) return body
  const parts = []
  let rest = body
  let k = 0
  while (rest.length) {
    let hit = null
    for (const n of names) {
      const i = rest.indexOf(n.token)
      if (i >= 0 && (hit === null || i < hit.i)) hit = { i, n }
    }
    if (!hit) { parts.push(rest); break }
    if (hit.i > 0) parts.push(rest.slice(0, hit.i))
    parts.push(<span key={k++} className={cn('rounded px-0.5 font-medium', hit.n.id === meId ? 'bg-status-warn-bg text-status-warn-fg' : 'bg-brand-500/15 text-brand-900')}>{hit.n.token}</span>)
    rest = rest.slice(hit.i + hit.n.token.length)
  }
  return parts
}

/** Enter sends, Shift+Enter is a new line, @ picks someone in the conversation. */
function Composer({ id, members, onSent }) {
  const [text, setText] = useState('')
  const [mentions, setMentions] = useState([])     // { userId, name }
  const [picker, setPicker] = useState(null)       // { start, query }
  const [pick, setPick] = useState(0)
  const ta = useRef(null)
  const send = useMutation({
    mutationFn: () => {
      const ids = mentions.filter(m => text.includes('@' + m.name)).map(m => m.userId)
      return chatApi.send(id, text, ids)
    },
    onSuccess: (r) => { setText(''); setMentions([]); onSent(one(r)); ta.current?.focus() },
    onError: (e) => toast.error(errMsg(e, 'Could not send')),
  })
  const options = picker ? members.filter(p => p.name.toLowerCase().includes(picker.query.toLowerCase())).slice(0, 6) : []

  const onChange = (e) => {
    const v = e.target.value
    setText(v)
    const caret = e.target.selectionStart
    const before = v.slice(0, caret)
    const at = before.lastIndexOf('@')
    if (at >= 0 && (at === 0 || /\s/.test(before[at - 1])) && !/\n/.test(before.slice(at)) && before.length - at <= 30) {
      setPicker({ start: at, query: before.slice(at + 1) }); setPick(0)
    } else setPicker(null)
    const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }
  const choose = (p) => {
    const caret = ta.current.selectionStart
    const next = text.slice(0, picker.start) + '@' + p.name + ' ' + text.slice(caret)
    setText(next)
    setMentions(ms => ms.some(m => m.userId === p.userId) ? ms : [...ms, p])
    setPicker(null)
    requestAnimationFrame(() => { const pos = picker.start + p.name.length + 2; ta.current.focus(); ta.current.setSelectionRange(pos, pos) })
  }

  return (
    <div className="relative px-4 py-3 border-t border-border">
      {picker && options.length > 0 && (
        <div className="absolute left-4 bottom-full mb-1 w-64 rounded-ctl border border-border bg-surface-raised shadow-overlay py-1 z-10">
          {options.map((p, i) => (
            <button key={p.userId} type="button" onMouseDown={(e) => { e.preventDefault(); choose(p) }}
              className={cn('w-full text-left px-3 py-1.5 text-xs flex items-center gap-2', i === pick ? 'bg-surface-overlay' : 'hover:bg-surface-overlay')}>
              <span className="w-5 h-5 rounded-full bg-brand-500/20 text-[9px] font-semibold flex items-center justify-center">{initials(p.name)}</span>
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea ref={ta} value={text} onChange={onChange} rows={1} placeholder="Write a message — @ to mention someone"
          onKeyDown={(e) => {
            if (picker && options.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setPick(i => (i + 1) % options.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setPick(i => (i - 1 + options.length) % options.length); return }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(options[pick]); return }
              if (e.key === 'Escape') { setPicker(null); return }
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim() && !send.isPending) send.mutate() }
          }}
          className="flex-1 resize-none max-h-40 rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary" />
        <Button size="sm" icon={Send} onClick={() => send.mutate()} disabled={!text.trim()} loading={send.isPending} aria-label="Send" />
      </div>
    </div>
  )
}

function EditMessageModal({ message, onClose, onDone }) {
  const [text, setText] = useState('')
  const [was, setWas] = useState(null)
  if ((message?.id ?? null) !== was) { setWas(message?.id ?? null); setText(message?.body || '') }
  const save = useMutation({
    mutationFn: () => chatApi.edit(message.id, text),
    onSuccess: () => { onDone(); onClose() },
    onError: (e) => toast.error(errMsg(e, 'Could not edit')),
  })
  return (
    <Modal open={!!message} onClose={onClose} size="md" title="Edit message"
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!text.trim()}>Save</Button>
      </div>}>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={5} autoFocus
        className="w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary" />
    </Modal>
  )
}

/** Pick staff (excluding some). */
function PeopleModal({ open, onClose, title, subtitle, exclude = [], single, confirmLabel, onConfirm, children, canConfirm = true, minPick = 1 }) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState([])
  const [was, setWas] = useState(false)
  if (open !== was) { setWas(open); if (open) { setQ(''); setPicked([]) } }
  const { data, isLoading } = useQuery({ queryKey: ['chat-people'], queryFn: () => chatApi.people(), enabled: open, staleTime: 60e3 })
  const people = list(data).filter(p => !exclude.includes(p.userId))
  const shown = q.trim() ? people.filter(p => `${p.name} ${p.email}`.toLowerCase().includes(q.trim().toLowerCase())) : people
  const toggle = (uid) => single ? onConfirm([uid]) : setPicked(p => p.includes(uid) ? p.filter(x => x !== uid) : [...p, uid])
  return (
    <Modal open={open} onClose={onClose} size="md" title={title} subtitle={subtitle}
      footer={single ? undefined : (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onConfirm(picked)} disabled={!canConfirm || picked.length < minPick}>{confirmLabel}</Button>
        </div>
      )}>
      <div className="space-y-3">
        {children}
        {!single ? (
          <div>
            <span className="text-xs font-medium text-text-secondary">People</span>
            <div className="mt-1">
              <PeopleMultiSelect people={people} loading={isLoading} value={picked} onChange={setPicked}
                placeholder="Search people to add…" emptyText="Nobody else to add." />
            </div>
          </div>
        ) : (<>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people" autoFocus={single}
          className="w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary" />
        <div className="max-h-72 overflow-y-auto rounded-ctl border border-border">
          {shown.length === 0 ? <p className="p-3 text-xs text-text-muted">Nobody found.</p> : shown.map(p => (
            <label key={p.userId} className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle last:border-0 hover:bg-surface-overlay cursor-pointer"
              onClick={single ? () => toggle(p.userId) : undefined}>
              {!single && <input type="checkbox" checked={picked.includes(p.userId)} onChange={() => toggle(p.userId)} />}
              <span className="w-6 h-6 rounded-full bg-brand-500/20 text-[10px] font-semibold flex items-center justify-center">{initials(p.name)}</span>
              <span className="text-sm text-text-primary flex-1 truncate">{p.name}</span>
              <span className="text-[11px] text-text-muted truncate">{p.email}</span>
            </label>
          ))}
        </div>
        </>)}
      </div>
    </Modal>
  )
}

function StartModal({ kind, onClose, onDone, meId }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState('PUBLIC')
  const [was, setWas] = useState(null)
  if (kind !== was) { setWas(kind); setName(''); setDescription(''); setVisibility('PUBLIC') }
  const create = (body) => chatApi.create(body).then(r => onDone(one(r))).catch(e => toast.error(errMsg(e, 'Could not start the conversation')))
  const { data: browseRaw } = useQuery({ queryKey: ['chat-browse'], queryFn: () => chatApi.browse(), enabled: kind === 'BROWSE' })
  const input = 'w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary'

  if (kind === 'DIRECT') {
    return <PeopleModal open title="New message" subtitle="Pick a colleague" single onClose={onClose}
      onConfirm={([uid]) => create({ kind: 'DIRECT', userId: uid })} />
  }
  if (kind === 'GROUP') {
    return (
      <PeopleModal open title="New group" subtitle="A conversation with a few people (up to 50)" onClose={onClose} confirmLabel="Start group"
        onConfirm={(ids) => create({ kind: 'GROUP', memberUserIds: ids, name: name.trim() || null })} exclude={meId ? [meId] : []}>
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Group name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Optional — otherwise it shows the members' names" className={cn(input, 'mt-1')} />
        </label>
      </PeopleModal>
    )
  }
  if (kind === 'CHANNEL') {
    return (
      <PeopleModal open title="New channel" subtitle="A named place for a team or topic. You can add people now or later."
        onClose={onClose} confirmLabel="Create channel" canConfirm={!!name.trim()} minPick={0} exclude={meId ? [meId] : []}
        onConfirm={(ids) => create({ kind: 'CHANNEL', name, description, visibility, memberUserIds: ids })}>
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Channel name</span>
          <div className="relative mt-1">
            <Hash size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. audit-team" maxLength={80} autoFocus
              className={cn(input, 'pl-7')} />
          </div>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">What it is for</span>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" className={cn(input, 'mt-1')} />
        </label>
        <div>
          <span className="text-xs font-medium text-text-secondary">Who can find it</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {[['PUBLIC', 'Public', 'Anyone in your organisation can find and join it'], ['PRIVATE', 'Private', 'Only people you add can see it']].map(([k, l, d]) => (
              <button key={k} type="button" onClick={() => setVisibility(k)}
                className={cn('text-left rounded-ctl border px-3 py-2', visibility === k ? 'border-brand-500 bg-brand-500/10' : 'border-border hover:bg-surface-overlay')}>
                <span className="text-sm font-medium text-text-primary">{l}</span>
                <span className="block text-[11px] text-text-muted">{d}</span>
              </button>
            ))}
          </div>
        </div>
      </PeopleModal>
    )
  }
  if (kind === 'BROWSE') {
    const chans = list(browseRaw)
    return (
      <Modal open onClose={onClose} size="md" title="Browse channels" subtitle="Public channels you are not in yet">
        <div className="max-h-96 overflow-y-auto rounded-ctl border border-border">
          {chans.length === 0 ? <p className="p-4 text-xs text-text-muted text-center">No other public channels. Create one with +.</p>
            : chans.map(c => (
              <div key={c.id} className="px-3 py-2 border-b border-border-subtle last:border-0 flex items-center gap-2">
                <Hash size={13} className="text-text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary truncate">{c.name}</p>
                  <p className="text-[11px] text-text-muted truncate">{c.description ? `${c.description} · ` : ''}{c.memberCount} members</p>
                </div>
                <Button variant="ghost" size="xs" onClick={() => onDone({ id: c.id })}>View</Button>
                <Button size="xs" onClick={() => chatApi.join(c.id).then(() => onDone({ id: c.id })).catch(e => toast.error(errMsg(e, 'Could not join')))}>Join</Button>
              </div>
            ))}
        </div>
      </Modal>
    )
  }
  return null
}

function SettingsModal({ open, conv, onClose, onSave, saving, onRemove, meId }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState('PUBLIC')
  const [was, setWas] = useState(false)
  if (open !== was) { setWas(open); if (open) { setName(conv.kind === 'GROUP' && !conv.name ? '' : conv.name || ''); setDescription(conv.description || ''); setVisibility(conv.visibility || 'PUBLIC') } }
  const input = 'w-full h-9 rounded-ctl border border-border bg-surface-raised px-3 text-sm text-text-primary'
  const channel = conv.kind === 'CHANNEL'
  return (
    <Modal open={open} onClose={onClose} size="md" title={channel ? `#${conv.name} settings` : 'Group settings'}
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="ghost" size="sm" icon={Archive} onClick={() => onSave({ archived: !conv.archived })}>{conv.archived ? 'Unarchive' : 'Archive'}</Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={saving} onClick={() => onSave(channel ? { name, description, visibility } : { name: name || null })}>Save</Button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder={channel ? 'Channel name' : 'Group name (optional)'} className={input} />
        {channel && (
          <>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" className={input} />
            <select value={visibility} onChange={e => setVisibility(e.target.value)} className={input}>
              <option value="PUBLIC">Public — anyone in the organisation can join</option>
              <option value="PRIVATE">Private — invitation only</option>
            </select>
          </>
        )}
        <div>
          <p className="text-xs font-medium text-text-secondary mb-1">People ({conv.memberCount})</p>
          <div className="max-h-56 overflow-y-auto rounded-ctl border border-border">
            {(conv.members || []).map(p => (
              <div key={p.userId} className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle last:border-0">
                <span className="text-sm text-text-primary flex-1 truncate">{p.name}{p.userId === meId ? ' (you)' : ''}</span>
                {p.role === 'OWNER' && <span className="text-[10px] text-text-muted">Owner</span>}
                {channel && p.userId !== meId && (
                  <button type="button" onClick={() => onRemove(p.userId)} title="Remove" className="p-1 text-text-muted hover:text-status-fail-fg"><X size={12} /></button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

function initials(name) {
  const parts = String(name || '?').replace(/\(you\)/, '').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}
const dayKey = (s) => new Date(s).toDateString()
function dayLabel(s) {
  const d = new Date(s), t = new Date()
  const y = new Date(t); y.setDate(t.getDate() - 1)
  if (d.toDateString() === t.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}