import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquare, Hash, Lock, Search, Plus, Users, BellOff, Pencil, Trash2, X,
  Send, Globe, Archive, Paperclip, Smile, SmilePlus, Reply, Pin, PinOff, Video, Loader2,
  Bold, Italic, Strikethrough, Code, List, FileText, Image as ImageIcon, Info,
  ChevronDown, Copy, Forward, CheckSquare, Check,
} from 'lucide-react'
import { useDraft } from '../../hooks/useDraft'
import { chatApi, one, list, errMsg } from '../../api/chat.api'
import { collabApi, unwrapOne } from '../../api/collab.api'
import { useChatSocket } from '../../hooks/useChatSocket'
import { useDocumentUpload } from '../../hooks/useDocuments'
import { EmojiPicker, QUICK_REACTIONS } from '../../components/chat/EmojiPicker'
import { MessageText, Attachments, LinkCard, linkCards, stripCardLinks, fmtSize, asThumb } from '../../components/chat/ChatMessageParts'
import { DocumentPreviewDrawer } from '../../components/ui/DocumentPreviewDrawer'
import { startCall } from '../../components/collab/call/callStore'
import { useCallOptions } from '../../components/collab/Meetings'
import { ChatDetailsPanel, PresenceDot } from '../../components/chat/ChatDetailsPanel'
import { MessageReceipt, receiptFor } from '../../components/chat/MessageReceipt'
import { ReactionDetails } from '../../components/chat/ReactionDetails'
import { usePresence, presenceLabel } from '../../hooks/useChatPresence'
import { PeopleMultiSelect } from '../../components/collab/PeopleMultiSelect'
import { PageLayout } from '../../components/layout/PageLayout'
import { Button } from '../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../components/ui/Modal'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'
import { MAX_FILES, isPhoto, refusal, fmtBytes } from '../../components/chat/chatFiles'
import { GlassSelect } from '../../components/ui/GlassSelect'

/**
 * Chat — direct messages, groups and channels for the organisation's own
 * staff (invited auditors never see it; they collaborate in workspaces).
 *
 * Left: my conversations by kind, unread counts, search, + to start one or
 * browse public channels. Right: the conversation — messages by day, edit
 * and delete your own, @mentions (the person is notified), mute, add people,
 * channel settings. Replies, reactions, files and images, pins, search,
 * typing and "Seen", light formatting, cards for KashiGuard links, and a call
 * button. Updates arrive live (useChatSocket); the page also polls,
 * so it keeps working if the socket is down.
 */
// A KashiGuard record shared in chat opens in the same drawer as everywhere
// else; the host lives with the module pages and loads only when needed.
const UrlEntityDrawerHost = lazy(() => import('../module/UniversalModulePage').then(m => ({ default: m.UrlEntityDrawerHost })))

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
  const [searchParams] = useSearchParams()

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
      qc.invalidateQueries({ queryKey: ['chat-pins', String(ev.conversationId)] })
      qc.invalidateQueries({ queryKey: ['chat-members', String(ev.conversationId)] })
      qc.invalidateQueries({ queryKey: ['chat-shared', String(ev.conversationId)] })
    }
  })

  // ── OPEN ON SOMETHING, NOT ON NOTHING ──────────────────────────────────────
  //
  // /chat with no id used to render "Pick a conversation" — a second click for
  // something the page can decide, every single time, including when you got
  // here from a notification about a message.
  //
  // The pick: the oldest-unread-first instinct is wrong here. What you want is
  // the conversation that is live right now, and if any are unread, the most
  // recent of THOSE. conversations() is already sorted by sortAt (last message,
  // falling back to created) descending — server-side, in ChatService — so
  // "first in the list" IS "most recently active", and no client sort is needed
  // or wanted: re-sorting here would be a second opinion that drifts.
  //
  // Archived rows are excluded: archiving a channel is saying "not this one".
  // DIRECT is never archived, so the unread branch still sees direct messages.
  //
  // replace: true — a blank /chat must not sit in history. Without it, Back out
  // of a conversation lands on /chat, which redirects straight back in, and the
  // back button stops working on this page.
  //
  // Search params are carried over because /chat is also a drawer host
  // (?drawerType=/?drawerStack=), and dropping them would close the drawer the
  // person just opened.
  const dead = useRef(new Set())
  useEffect(() => {
    if (id || isLoading || !me.canUse) return
    const pickable = convs.filter(c => !c.archived && !dead.current.has(String(c.id)))
    if (pickable.length === 0) return
    const target = pickable.find(c => c.unread > 0) || pickable[0]
    navigate({ pathname: `/chat/${target.id}`, search: searchParams.toString() ? `?${searchParams}` : '' },
      { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isLoading, me.canUse, convs.length])

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
        <div className="h-full min-h-[480px] flex rounded-card border border-border glass-card overflow-hidden">
          {/* ── Conversations ── */}
          <aside className="w-72 shrink-0 border-r border-border flex flex-col min-h-0">
            <div className="p-2 flex items-center gap-1.5 border-b border-border-subtle relative">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a conversation"
                  className="w-full h-8 pl-7 pr-2 rounded-ctl border border-border glass-field text-xs text-text-primary" />
              </div>
              <Button size="icon-sm" icon={Plus} aria-label="New" onClick={() => setMenu(m => !m)} />
              {menu && (
                <>
                  <div className="fixed inset-0 z-[30]" onClick={() => setMenu(false)} />
                  <div className="absolute right-2 top-full mt-1 z-[31] w-52 rounded-ctl border border-border glass-overlay shadow-overlay py-1">
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
                          <span className="count-badge shrink-0">
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
            {/* onGone marks the id dead before leaving, so the auto-pick above
                cannot choose it again. Without that, a conversation deleted or
                revoked under you gives /chat → pick it → gone → /chat, forever.
                Marking it also means the pick advances to the next conversation,
                which is the right place to land after one disappears. */}
            {id ? <Conversation key={id} id={id} me={me}
                    onGone={() => { dead.current.add(String(id)); navigate('/chat', { replace: true }) }} />
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
      {(searchParams.get('drawerType') || searchParams.get('drawerStack')) && (
        <Suspense fallback={null}><UrlEntityDrawerHost /></Suspense>
      )}
    </PageLayout>
  )
}

function ConvIcon({ c }) {
  const presence = usePresence()
  const cls = 'mt-0.5 shrink-0 text-text-muted'
  if (c.kind === 'CHANNEL') return c.visibility === 'PRIVATE' ? <Lock size={13} className={cls} /> : <Hash size={13} className={cls} />
  if (c.kind === 'GROUP') return <Users size={13} className={cls} />
  return (
    <span className="relative mt-0.5 shrink-0 w-4 h-4 rounded-full bg-surface-overlay text-[8px] font-semibold text-text-secondary flex items-center justify-center">
      {initials(c.name)}
      {presence.isOnline(c.otherUserId) && <PresenceDot className="w-2 h-2 ring-1" />}
    </span>
  )
}

// ── One conversation ─────────────────────────────────────────────────────────

const CALL_MAX_PEOPLE = 50

function Conversation({ id, me, onGone }) {
  const qc = useQueryClient()
  const [older, setOlder] = useState([])           // pages loaded with "earlier messages"
  const [hasOlder, setHasOlder] = useState(null)
  const [editing, setEditing] = useState(null)     // message
  const [forwarding, setForwarding] = useState(null) // [message, …] being forwarded
  // Selecting messages to forward together: null, or the picked ids. Esc or
  // Cancel leaves it; it also ends with the conversation (keyed by id).
  const [selected, setSelected] = useState(null)
  const selecting = selected !== null
  const toggleSelected = (m) => setSelected(sel => {
    const cur = sel || []
    if (cur.includes(m.id)) return cur.filter(x => x !== m.id)
    if (cur.length >= FORWARD_MAX_MESSAGES) { toast.error(`You can forward up to ${FORWARD_MAX_MESSAGES} messages at a time`, { id: 'fwd-max' }); return cur }
    return [...cur, m.id]
  })
  useEffect(() => {
    if (!selecting) return undefined
    const key = (e) => { if (e.key === 'Escape') setSelected(null) }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [selecting])
  const [adding, setAdding] = useState(false)
  const [settings, setSettings] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [firstUnread, setFirstUnread] = useState(undefined)
  const [replyingTo, setReplyingTo] = useState(null)   // message
  const [panel, setPanel] = useState(null)             // 'pins' | 'search'
  const [highlight, setHighlight] = useState(null)     // message id
  const [previewDoc, setPreviewDoc] = useState(null)
  const [typing, setTyping] = useState({})             // userId -> until (ms)
  const [dragging, setDragging] = useState(0)
  const [pending, setPending] = useState([])           // my messages on their way to the server
  const bottom = useRef(null)
  const scroller = useRef(null)
  const content = useRef(null)
  // Stay pinned to the newest message unless the reader has scrolled up.
  // Starts pinned, so opening a conversation lands at the bottom.
  const stick = useRef(true)
  const toBottom = () => {
    stick.current = true
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight     // only this panel — never the page around it
  }
  // Content grows after render (images, link cards, earlier pages, "Seen"):
  // keep the bottom in view while pinned.
  useEffect(() => {
    const el = scroller.current, inner = content.current
    if (!el || !inner || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => { if (stick.current) el.scrollTop = el.scrollHeight })
    ro.observe(inner)
    return () => ro.disconnect()
  })
  const composer = useRef(null)                        // { addFiles, focus }
  const calls = useCallOptions()
  const presence = usePresence()

  const { data: convRaw, isError } = useQuery({ queryKey: ['chat-conversation', String(id)], queryFn: () => chatApi.conversation(id), retry: false })
  const conv = one(convRaw)
  const { data: msgRaw, isLoading } = useQuery({ queryKey: keyMsgs(id), queryFn: () => chatApi.messages(id), refetchInterval: 15_000 })
  const page = one(msgRaw) || {}
  const latest = useMemo(() => (Array.isArray(page.messages) ? page.messages : []), [page.messages])
  const messages = useMemo(() => {
    const seen = new Set(latest.map(m => m.id))
    return [...older.filter(m => !seen.has(m.id)), ...latest]
  }, [older, latest])

  useEffect(() => { if (isError) { toast.error('That conversation is not available'); onGone() } }, [isError, onGone])

  // "Typing…" and "Seen by" arrive as their own lightweight pushes.
  useChatSocket((ev) => {
    if (String(ev?.conversationId) !== String(id)) return
    if (ev.type === 'typing' && ev.userId !== me.userId) setTyping(t => ({ ...t, [ev.userId]: Date.now() + 5000 }))
    // 'delivered' alongside 'read': both move a watermark on conv.members,
    // which is what the per-message ticks are computed from, so both have to
    // refresh the conversation. Neither touches the message cache — a receipt
    // moving is not new content.
    else if (ev.type === 'read' || ev.type === 'delivered') qc.invalidateQueries({ queryKey: ['chat-conversation', String(id)] })
  })
  useEffect(() => {
    if (!Object.keys(typing).length) return undefined
    const t = setInterval(() => setTyping(cur => {
      const now = Date.now()
      const next = Object.fromEntries(Object.entries(cur).filter(([, until]) => until > now))
      return Object.keys(next).length === Object.keys(cur).length ? cur : next
    }), 1000)
    return () => clearInterval(t)
  }, [typing])

  // Where "New" goes: the first message after what I had read when I opened it.
  useEffect(() => {
    if (firstUnread !== undefined || !msgRaw) return
    const lr = page.lastReadMessageId
    const m = latest.find(x => !x.mine && (lr == null || x.id > lr))
    setFirstUnread(m ? m.id : null)
  }, [msgRaw, firstUnread, page.lastReadMessageId, latest])

  // Mark read and keep the view at the bottom when new messages arrive.
  const lastMsg = latest.length ? latest[latest.length - 1] : null
  const lastId = lastMsg?.id ?? null
  useEffect(() => {
    if (!lastId) return
    if (stick.current) requestAnimationFrame(toBottom)
    if (!conv?.member) return

    const markRead = () => {
      chatApi.read(id, lastId).then(() => {
        qc.invalidateQueries({ queryKey: KEY_LIST })
        qc.invalidateQueries({ queryKey: BADGE })
      }).catch(() => {})
    }

    if (document.visibilityState === 'visible') { markRead(); return undefined }

    // ── WHY THE LISTENER ──────────────────────────────────────────────────
    //
    // The visibility check was right — a message that arrives on a background
    // tab has not been read — but there was nothing watching for the tab coming
    // back. So a message that landed while you were elsewhere stayed unread
    // until the NEXT message changed lastId, or the 15-second poll did. The
    // badge kept its count and, now that it matters, the sender kept seeing one
    // grey tick on something that was sitting open in front of the reader.
    //
    // Registered only in the hidden branch, and removed as soon as it fires, so
    // a visible tab adds no listener at all.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      document.removeEventListener('visibilitychange', onVisible)
      markRead()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [lastId, conv?.member, id, qc])
  // Someone's message arrived — they have stopped typing.
  const lastSender = lastMsg?.senderId
  useEffect(() => {
    if (lastSender == null) return
    setTyping(t => (t[lastSender] ? Object.fromEntries(Object.entries(t).filter(([k]) => String(k) !== String(lastSender))) : t))
  }, [lastId, lastSender])

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

  /** Scroll to a message and flash it — loading earlier pages until it is there. */
  const jumpTo = async (mid) => {
    if (!mid) return
    let have = messages
    let hasMore = more
    let first = have[0]?.id
    let fetched = []
    for (let pages = 0; !have.some(x => x.id === mid) && hasMore && first && pages < 20; pages++) {
      let r
      try { r = one(await chatApi.messages(id, first)) } catch { break }
      const ms = r.messages || []
      if (!ms.length) { hasMore = false; break }
      fetched = [...ms, ...fetched]
      have = [...ms, ...have]
      first = ms[0].id
      hasMore = !!r.hasMore
    }
    if (fetched.length) { setOlder(o => [...fetched, ...o]); setHasOlder(hasMore) }
    if (!have.some(x => x.id === mid)) { toast('That message is too far back to show here'); return }
    stick.current = false          // a jump is a deliberate look back — don't pull to the bottom
    setHighlight(mid)
    // Twice: the first frame renders the loaded page, the second can scroll to it.
    requestAnimationFrame(() => requestAnimationFrame(() =>
      document.getElementById(`chat-msg-${mid}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })))
    setTimeout(() => setHighlight(h => (h === mid ? null : h)), 2500)
  }

  const refresh = () => {
    qc.invalidateQueries({ queryKey: keyMsgs(id) })
    qc.invalidateQueries({ queryKey: ['chat-conversation', String(id)] })
    qc.invalidateQueries({ queryKey: ['chat-pins', String(id)] })
    qc.invalidateQueries({ queryKey: KEY_LIST })
  }
  /** Put a changed message (reaction, pin) in place, wherever it is loaded. */
  const replaceMessage = (msg) => {
    if (!msg?.id) return
    qc.setQueryData(keyMsgs(id), (old) => {
      const p = one(old)
      if (!p || !Array.isArray(p.messages)) return old
      const next = { ...p, messages: p.messages.map(x => (x.id === msg.id ? msg : x)) }
      return old?.data && old.data === p ? { ...old, data: next } : next
    })
    setOlder(o => (o.some(x => x.id === msg.id) ? o.map(x => (x.id === msg.id ? msg : x)) : o))
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
  const react = useMutation({
    mutationFn: ({ mid, emoji }) => chatApi.react(mid, emoji),
    onSuccess: (r) => replaceMessage(one(r)),
    onError: (e) => toast.error(errMsg(e, 'Could not react')),
  })
  const pin = useMutation({
    mutationFn: ({ mid, pinned }) => chatApi.pin(mid, pinned),
    onSuccess: (r, v) => {
      replaceMessage(one(r))
      qc.invalidateQueries({ queryKey: ['chat-pins', String(id)] })
      toast.success(v.pinned ? 'Pinned' : 'Unpinned')
    },
    onError: (e) => toast.error(errMsg(e, 'Could not pin')),
  })

  const appendMine = (msg) => {
    qc.setQueryData(keyMsgs(id), (old) => {
      const p = one(old) || {}
      const ms = Array.isArray(p.messages) ? p.messages : []
      return ms.some(x => x.id === msg.id) ? old : { ...p, messages: [...ms, msg] }
    })
    requestAnimationFrame(toBottom)
    qc.invalidateQueries({ queryKey: KEY_LIST })
  }

  const members = conv?.members || []
  const others = members.filter(p => p.userId !== me.userId)
  const call = useMutation({
    mutationFn: () => collabApi.callNow({
      workspaceId: null, programmeId: null,
      title: conv.kind === 'DIRECT' ? null : `Call · ${conv.name}`,
      attendeeUserIds: others.map(p => p.userId),
    }),
    onSuccess: (r) => {
      const x = unwrapOne(r)
      startCall(x)
      // Leave a "Join" card in the conversation for whoever comes in later.
      if (x?.meetingId) {
        // ?join=1 so the link JOINS the call rather than just opening the
        // meeting page — the same thing the notification's actionUrl does.
        // Without it, whoever clicks the message in chat lands on a page and
        // has to hunt for the Join button.
        chatApi.send(id, `🎥 Started a video call — ${window.location.origin}/collaboration/meetings/${x.meetingId}?join=1`, [])
          .then(m => appendMine(one(m))).catch(() => {})
      }
    },
    onError: (e) => toast.error(errMsg(e, 'Could not start the call')),
  })

  if (!conv) return <div className="flex-1 flex items-center justify-center text-xs text-text-muted">Loading…</div>
  const owner = conv.kind === 'CHANNEL' && conv.myRole === 'OWNER'
  const canWrite = conv.member && !conv.archived
  const canCall = canWrite && calls.enabled && calls.canStart && others.length > 0 && others.length <= CALL_MAX_PEOPLE
  const onlineHere = presence.onlineCount(others.map(p => p.userId))

  // Messages still being sent show straight away, at the end, as "Sending…".
  const shown = pending.length ? [...messages, ...pending] : messages

  // ── RECEIPTS ────────────────────────────────────────────────────────────
  //
  // Every message of mine carries its own state now, not just the last one.
  //
  // Before this there was a single "Seen"/"Seen by A, B" under the tail, so you
  // could tell whether your most recent line had been read and nothing else:
  // scroll up and a read message, a delivered one and one still in flight all
  // looked identical. See components/chat/MessageReceipt.
  //
  // The tick's STATE is computed here from conv.members — no request, so a page
  // of 200 messages costs nothing. The TIMES live behind the info panel, which
  // asks the server for that one message when somebody opens it: a watermark
  // cannot say when message 137 was crossed, but the advance log behind
  // /messages/{id}/receipts can.
  const typingNames = Object.keys(typing).map(uid => members.find(p => String(p.userId) === String(uid))?.name).filter(Boolean)

  const dropOk = (e) => canWrite && Array.from(e.dataTransfer?.types || []).includes('Files')

  return (
    <>
      <header className="px-4 py-2.5 border-b border-border flex items-center gap-3">
        {/* The title opens the details panel (people, media, files, links). */}
        <button type="button" onClick={() => setPanel(p => (p === 'details' ? null : 'details'))} title="Details"
          className="min-w-0 flex-1 flex items-center gap-3 text-left rounded-ctl -mx-1 px-1 py-0.5 hover:bg-surface-overlay/60">
          <ConvIcon c={conv} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary truncate">{conv.name}{conv.archived && <span className="ml-2 text-[11px] font-normal text-text-muted">archived</span>}</p>
            {conv.kind === 'DIRECT' ? (
              <p className={cn('text-[11px] truncate', presence.isOnline(conv.otherUserId) ? 'text-status-pass-fg' : 'text-text-muted')}>
                {presenceLabel(presence.isOnline(conv.otherUserId), presence.lastSeen(conv.otherUserId))}
              </p>
            ) : (
              <p className="text-[11px] text-text-muted truncate">
                {conv.description ? `${conv.description} · ` : ''}{conv.memberCount} {conv.memberCount === 1 ? 'person' : 'people'}
                {onlineHere > 0 ? ` · ${onlineHere} online` : ''}
              </p>
            )}
          </div>
        </button>
        <div className="flex items-center gap-1">
          {canCall && (
            <HeaderBtn label={call.isPending ? 'Starting the video call…' : 'Start a video call'} onClick={() => !call.isPending && call.mutate()}>
              {call.isPending ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />}
            </HeaderBtn>
          )}
          <HeaderBtn label="Search in this conversation" active={panel === 'search'} onClick={() => setPanel(p => (p === 'search' ? null : 'search'))}><Search size={14} /></HeaderBtn>
          <HeaderBtn label="Pinned messages" active={panel === 'pins'} onClick={() => setPanel(p => (p === 'pins' ? null : 'pins'))}><Pin size={14} /></HeaderBtn>
          {conv.member && conv.muted && (
            <HeaderBtn label="Muted — unmute" onClick={() => update.mutate({ muted: false })}><BellOff size={14} /></HeaderBtn>
          )}
          {/* Mute, add people, settings and leave live in the details panel. */}
          <HeaderBtn label="Details" active={panel === 'details'} onClick={() => setPanel(p => (p === 'details' ? null : 'details'))}><Info size={14} /></HeaderBtn>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <div className="relative flex-1 min-w-0 flex flex-col"
          onDragEnter={(e) => { if (dropOk(e)) { e.preventDefault(); setDragging(n => n + 1) } }}
          onDragOver={(e) => { if (dropOk(e)) e.preventDefault() }}
          onDragLeave={(e) => { if (dropOk(e)) setDragging(n => Math.max(0, n - 1)) }}
          onDrop={(e) => {
            if (!dropOk(e)) return
            e.preventDefault(); setDragging(0)
            composer.current?.addFiles(Array.from(e.dataTransfer.files || []))
          }}>
          {dragging > 0 && (
            <div className="absolute inset-2 z-20 rounded-card border-2 border-dashed border-brand-500 bg-surface-raised/90 flex flex-col items-center justify-center pointer-events-none">
              <Paperclip size={22} className="text-brand-ink" />
              <p className="text-sm font-medium text-text-primary mt-1">Drop files to attach</p>
              <p className="text-xs text-text-muted">Up to {MAX_FILES} per message · photos up to 10 MB, other files up to 100 MB</p>
            </div>
          )}

          <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-3"
            onScroll={(e) => {
              const el = e.currentTarget
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            }}>
           <div ref={content}>
            {more && (
              <div className="text-center mb-3">
                <Button variant="ghost" size="xs" onClick={loadEarlier}>Earlier messages</Button>
              </div>
            )}
            {isLoading ? <p className="text-xs text-text-muted">Loading…</p>
              : shown.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-10">
                  {conv.kind === 'CHANNEL' ? `This is the start of #${conv.name}.` : 'No messages yet — say hello.'}
                </p>
              ) : shown.map((m, i) => {
                const prev = shown[i - 1]
                const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)
                const next = shown[i + 1]
                // One block per sender per burst: same person, same day, under 5
                // minutes apart (and not split by the "New" line). The name and
                // avatar show once per block; a longer gap starts a new block.
                // A reply or a pinned message always starts its own block.
                const sameBurst = (a, b) => !!a && !!b && a.senderId === b.senderId
                  && dayKey(a.createdAt) === dayKey(b.createdAt)
                  && Math.abs(new Date(b.createdAt) - new Date(a.createdAt)) < 5 * 60e3
                  && !b.replyTo && !b.pinnedAt
                const grouped = sameBurst(prev, m) && m.id !== firstUnread
                const lastOfBlock = !(sameBurst(m, next) && next.id !== firstUnread)
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
                    <MessageRow m={m} grouped={grouped} lastOfBlock={lastOfBlock} showName={conv.kind !== 'DIRECT'}
                      members={members} meId={me.userId} highlight={highlight === m.id} online={!m.mine && presence.isOnline(m.senderId)}
                      canAct={conv.member && !conv.archived && !m.pending}
                      canDelete={(m.mine || owner) && !m.deleted && conv.member}
                      receipt={m.mine && !m.deleted && !m.pending ? receiptFor(m.id, others) : null}
                      direct={conv.kind === 'DIRECT'}
                      onEdit={() => setEditing(m)} onDelete={() => del.mutate(m.id)}
                      onReply={() => { setReplyingTo(m); composer.current?.focus() }}
                      onReact={(emoji) => react.mutate({ mid: m.id, emoji })}
                      onPin={() => pin.mutate({ mid: m.id, pinned: !m.pinnedAt })}
                      onForward={() => setForwarding([m])}
                      onSelect={() => setSelected([m.id])}
                      selecting={selecting} selected={!!selected?.includes(m.id)}
                      onToggleSelect={() => toggleSelected(m)}
                      onJump={jumpTo} onPreview={setPreviewDoc} />
                  </div>
                )
              })}
            <div ref={bottom} />
           </div>
          </div>

          <p className="px-4 h-4 text-[11px] italic text-text-muted truncate" aria-live="polite">
            {typingNames.length === 0 ? '' : typingNames.length === 1 ? `${typingNames[0]} is typing…`
              : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing…` : 'Several people are typing…'}
          </p>

          {selecting ? (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <button type="button" onClick={() => setSelected(null)} aria-label="Cancel selection" title="Cancel (Esc)"
                  className="h-8 w-8 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-overlay">
                  <X size={16} />
                </button>
                <span className="text-sm text-text-primary">
                  {selected.length === 0 ? 'Select messages' : `${selected.length} selected`}
                </span>
                <span className="text-xs text-text-muted hidden sm:inline">· up to {FORWARD_MAX_MESSAGES}</span>
              </div>
              <Button size="sm" disabled={!selected.length}
                onClick={() => setForwarding(shown.filter(m => selected.includes(m.id)))}>
                <Forward size={14} /> Forward
              </Button>
            </div>
          ) : conv.member ? (
            conv.archived
              ? <p className="px-4 py-3 border-t border-border text-xs text-text-muted">This conversation is archived — read only.</p>
              : <Composer id={id} members={others} apiRef={composer} meId={me.userId}
                  replyingTo={replyingTo} onCancelReply={() => setReplyingTo(null)}
                  onSending={(temp) => {
                    setReplyingTo(null)
                    setPending(p => [...p, temp])
                    requestAnimationFrame(toBottom)
                  }}
                  onSent={(msg, tempId) => { appendMine(msg); setPending(p => p.filter(x => x.id !== tempId)) }}
                  onFailed={(tempId) => setPending(p => p.filter(x => x.id !== tempId))} />
          ) : (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
              <span className="text-xs text-text-muted">You are previewing #{conv.name}.</span>
              <Button size="sm" onClick={() => join.mutate()} loading={join.isPending}>Join channel</Button>
            </div>
          )}
        </div>

        {panel === 'details' && (
          <ChatDetailsPanel conv={conv} onClose={() => setPanel(null)} onJump={jumpTo} onPreview={setPreviewDoc}
            onMute={() => update.mutate({ muted: !conv.muted })} onSettings={() => setSettings(true)} onLeave={() => setLeaving(true)}
            onAddPeople={() => setAdding(true)}
            onRemove={(uid) => chatApi.removeMember(id, uid).then(refresh).catch(e => toast.error(errMsg(e, 'Could not remove')))}
            canCall={canCall} onCall={() => !call.isPending && call.mutate()} />
        )}
        {panel === 'pins' && <PinsPanel id={id} onClose={() => setPanel(null)} onJump={jumpTo} />}
        {panel === 'search' && <SearchPanel id={id} onClose={() => setPanel(null)} onJump={jumpTo} />}
      </div>

      <DocumentPreviewDrawer document={previewDoc} open={!!previewDoc} onClose={() => setPreviewDoc(null)} />
      <EditMessageModal message={editing} onClose={() => setEditing(null)} onDone={refresh} />
      <ForwardModal messages={forwarding} fromId={id} onClose={() => setForwarding(null)}
        onDone={() => { setForwarding(null); setSelected(null); refresh() }} />
      <PeopleModal open={adding} onClose={() => setAdding(false)} title="Add people" exclude={members.map(p => p.userId)}
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

function HeaderBtn({ label, onClick, children, active }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className={cn('p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay',
        active && 'bg-surface-overlay text-text-primary')}>{children}</button>
  )
}

/** Side panel shell for pins and search. */
function SidePanel({ title, onClose, children }) {
  return (
    <aside className="w-72 shrink-0 border-l border-border flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-2">
        <p className="text-xs font-semibold text-text-primary flex-1">{title}</p>
        <button type="button" onClick={onClose} title="Close" className="p-1 text-text-muted hover:text-text-primary"><X size={13} /></button>
      </div>
      {children}
    </aside>
  )
}

function ResultRow({ m, onClick, query }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left px-3 py-2 border-b border-border-subtle hover:bg-surface-overlay">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-text-secondary truncate flex-1">{m.senderName}</span>
        <span className="text-[10px] text-text-muted shrink-0">
          {new Date(m.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <p className="text-xs text-text-primary line-clamp-3 break-words mt-0.5">{highlightText(snippet(m), query)}</p>
    </button>
  )
}

function PinsPanel({ id, onClose, onJump }) {
  const { data, isLoading } = useQuery({ queryKey: ['chat-pins', String(id)], queryFn: () => chatApi.pins(id) })
  const pins = list(data)
  return (
    <SidePanel title="Pinned messages" onClose={onClose}>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <p className="p-3 text-xs text-text-muted">Loading…</p>
          : pins.length === 0 ? (
            <p className="p-4 text-xs text-text-muted text-center">Nothing pinned yet. Hover a message and choose the pin to keep it here.</p>
          ) : pins.map(m => (
            <div key={m.id}>
              <ResultRow m={m} onClick={() => onJump(m.id)} />
              {m.pinnedByName && <p className="px-3 -mt-1.5 pb-1.5 text-[10px] text-text-muted">Pinned by {m.pinnedByName}</p>}
            </div>
          ))}
      </div>
    </SidePanel>
  )
}

function SearchPanel({ id, onClose, onJump }) {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t) }, [q])
  const { data, isFetching } = useQuery({
    queryKey: ['chat-search', String(id), term], queryFn: () => chatApi.search(id, term), enabled: term.length >= 2, staleTime: 30e3,
  })
  const hits = term.length >= 2 ? list(data) : []
  return (
    <SidePanel title="Search this conversation" onClose={onClose}>
      <div className="p-2 border-b border-border-subtle">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Words in a message" autoFocus
            className="w-full h-8 pl-7 pr-2 rounded-ctl border border-border glass-field text-xs text-text-primary" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {term.length < 2 ? <p className="p-3 text-xs text-text-muted">Type at least 2 characters.</p>
          : isFetching && !hits.length ? <p className="p-3 text-xs text-text-muted">Searching…</p>
          : hits.length === 0 ? <p className="p-3 text-xs text-text-muted">No messages match.</p>
          : (
            <>
              {hits.map(m => <ResultRow key={m.id} m={m} query={term} onClick={() => onJump(m.id)} />)}
              {hits.length >= 30 && <p className="p-3 text-[11px] text-text-muted">Showing the 30 newest matches — add words to narrow it.</p>}
            </>
          )}
      </div>
    </SidePanel>
  )
}

/** Close a popover on a click outside it or Escape. */
function useDismiss(ref, open, close) {
  useEffect(() => {
    if (!open) return undefined
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) close() }
    const key = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * One message as a chat bubble. Your own: right-aligned, brand bubble, no
 * avatar or name. Everyone else: left-aligned, neutral bubble, avatar and (in
 * groups and channels) name on the first message of a block. Every bubble
 * carries its time, so messages minutes apart are told apart; consecutive
 * messages of one block sit tight together.
 *
 * Actions stay out of the way until asked for, like WhatsApp / Telegram:
 *   • a smiley beside the bubble (on hover) opens the reaction tray — quick
 *     emoji, + for all of them;
 *   • a chevron inside the bubble's corner (on hover) opens the menu —
 *     Reply, Copy, Pin, and on your own messages Edit and Delete.
 * Both also show on keyboard focus, and stay while their popover is open.
 * Under the bubble: link cards, reaction chips, "Seen".
 */
function MessageRow({ m, grouped, lastOfBlock, showName, members, meId, canAct, canDelete, highlight, online,
  receipt, direct,
  onEdit, onDelete, onReply, onReact, onPin, onForward, onSelect, onJump, onPreview,
  selecting, selected, onToggleSelect }) {
  const [tray, setTray] = useState(null)        // null | { up, all }   — the reaction tray
  const [showReactions, setShowReactions] = useState(false)
  const trayRef = useRef(null)
  const time = new Date(m.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const mine = !!m.mine
  const cards = m.deleted ? [] : linkCards(m.body)
  const text = cards.length ? stripCardLinks(m.body) : m.body
  const reactions = m.reactions || []
  // While picking messages to forward, the row is a checkbox: no menu, no
  // reaction tray. Deleted and still-sending messages cannot be picked.
  const selectable = selecting && !m.deleted && !m.pending
  const actionable = !m.deleted && !m.pending && canAct && !selecting
  // One message, one bubble. New sends already go out as one message per
  // file (pictures together as an album — see Composer), so each file has its
  // own bubble and its own reply / react / forward / delete. Messages sent
  // before that may carry several files: they stay in ONE bubble, because
  // every action on them applies to the whole message — drawing them as
  // separate bubbles suggested otherwise.
  const atts = m.deleted ? [] : (m.attachments || [])
  const pics = atts.filter(asThumb)

  // Open upward when the message is near the bottom of the window, so the
  // popover is never cut off by the end of the message list.
  const opensUp = (el, need) => !!el && window.innerHeight - el.getBoundingClientRect().bottom < need
  useDismiss(trayRef, !!tray && !tray.all, () => setTray(null))

  const reactButton = actionable && (
    <div ref={trayRef} className="relative self-center shrink-0">
      <button type="button" aria-label="React" title="React" aria-expanded={!!tray}
        onClick={(e) => setTray(t => (t ? null : { up: opensUp(e.currentTarget, 90), all: false }))}
        className={cn('h-7 w-7 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-opacity',
          tray ? 'opacity-100 bg-surface-overlay' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}>
        <SmilePlus size={16} />
      </button>
      {tray && !tray.all && (
        <div className={cn('absolute z-30 flex items-center gap-0.5 rounded-full border border-border glass-overlay shadow-overlay px-1.5 py-1',
          tray.up ? 'bottom-full mb-1' : 'top-full mt-1', mine ? 'right-0' : 'left-0')}>
          {QUICK_REACTIONS.map(e => (
            <button key={e} type="button" onClick={() => { onReact(e); setTray(null) }} title={`React ${e}`}
              className="w-8 h-8 text-lg leading-none rounded-full hover:bg-surface-overlay hover:scale-110 transition-transform">{e}</button>
          ))}
          <button type="button" onClick={() => setTray(t => ({ ...t, all: true }))} title="More reactions" aria-label="More reactions"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-overlay">
            <Plus size={16} />
          </button>
        </div>
      )}
      {tray?.all && (
        <EmojiPicker className={cn('absolute', tray.up ? 'bottom-full mb-1' : 'top-full mt-1', mine ? 'right-0' : 'left-0')}
          onPick={(e) => { onReact(e); setTray(null) }} onClose={() => setTray(null)} />
      )}
    </div>
  )

  const menuActions = { m, mine, canDelete, onReply, onPin, onEdit, onDelete, onForward, onSelect }
  // The chevron always sits in the bubble's top-right corner. Over text or a
  // picture it floats, with a halo fading what is under it. A file card has
  // its preview/download buttons on the right, right where the chevron would
  // land — so a bubble that opens with a file keeps a narrow strip free on
  // its right for the chevron (always, so nothing shifts on hover).
  const textFirst = !!text || (!!m.replyTo && !m.deleted)
  const fileLead = !textFirst && !pics.length && atts.length > 0

  return (
    <div id={`chat-msg-${m.id}`}
      onClickCapture={selectable ? (e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect() } : undefined}
      role={selectable ? 'checkbox' : undefined} aria-checked={selectable ? selected : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={selectable ? (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggleSelect() } } : undefined}
      className={cn('group relative flex gap-2 rounded-card transition-colors duration-700', mine ? 'justify-end' : 'justify-start',
        grouped ? 'mt-0.5' : 'mt-3', lastOfBlock ? 'mb-1' : '', highlight && 'bg-status-warn-bg',
        selecting && 'pl-8', selectable && 'cursor-pointer hover:bg-surface-overlay/40', selected && 'bg-brand-500/10')}>
      {selecting && (
        <span aria-hidden className={cn('absolute left-1.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 flex items-center justify-center',
          !selectable ? 'border-border-subtle opacity-40'
            : selected ? 'bg-brand-500 border-brand-500 text-brand-on' : 'border-border')}>
          {selected && <Check size={12} strokeWidth={3} />}
        </span>
      )}
      {!mine && (
        <div className="w-8 shrink-0">
          {!grouped && (
            <span className="relative w-8 h-8 rounded-full bg-brand-500/20 text-brand-ink text-[11px] font-semibold flex items-center justify-center"
              title={m.senderName}>
              {initials(m.senderName)}
              {online && <PresenceDot />}
            </span>
          )}
        </div>
      )}
      <div className="min-w-0 max-w-[75%]">
        <div className={cn('min-w-0 flex flex-col', mine ? 'items-end' : 'items-start')}>
          {!mine && !grouped && showName && (
            <span className="text-[11px] font-semibold text-text-secondary mb-0.5 px-1">{m.senderName}</span>
          )}
          {m.forwarded && !m.deleted && (
            <span className="text-[10px] italic text-text-muted mb-0.5 px-1 inline-flex items-center gap-1">
              <Forward size={10} /> Forwarded
            </span>
          )}
          {m.pinnedAt && !m.deleted && (
            <span className="text-[10px] text-text-muted mb-0.5 px-1 inline-flex items-center gap-1">
              <Pin size={9} /> Pinned{m.pinnedByName ? ` by ${m.pinnedByName}` : ''}
            </span>
          )}
          <div className={cn('flex items-center gap-1 min-w-0 max-w-full', mine && 'flex-row-reverse')}>
          <div className={cn('group/bubble relative rounded-card px-3 py-1.5 min-w-0 max-w-full', m.pending && 'opacity-70',
            fileLead && actionable && 'pr-8',
            m.deleted ? 'bg-surface-overlay/60 border border-dashed border-border'
              : mine ? 'bg-brand-500 text-brand-on'
              : 'bg-surface-overlay border border-border-subtle text-text-primary')}>
            {/* Behind the chevron: a soft halo in the bubble's own colour, so the
                text under it fades out (as in WhatsApp) rather than being cut.
                Clipped to the bubble's shape; a halo, not a gradient (DESIGN.md
                rule 3). Separate from the menu so the menu is never clipped. */}
            {actionable && !fileLead && (
              <span aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden rounded-card',
                'hidden group-hover/bubble:block group-focus-within/bubble:block')}>
                <span className={cn('absolute top-1 right-1 h-6 w-6 rounded-full',
                  mine ? 'bg-brand-500 shadow-[0_0_10px_10px_rgb(var(--color-brand-500))]'
                    : 'bg-surface-overlay shadow-[0_0_10px_10px_rgb(var(--color-surface-overlay))]')} />
              </span>
            )}
            {actionable && <MessageMenu {...menuActions} />}
            {m.replyTo && !m.deleted && (
              <button type="button" onClick={() => onJump(m.replyTo.id)} title="Go to the message"
                className={cn('block w-full text-left mb-1 rounded-ctl border-l-2 px-2 py-1',
                  mine ? 'bg-surface-raised/70 border-brand-on/50' : 'bg-surface-raised border-brand-500')}>
                <span className="block text-[11px] font-semibold text-text-secondary truncate">{m.replyTo.senderName}</span>
                <span className={cn('block text-xs truncate', m.replyTo.deleted ? 'italic text-text-muted' : 'text-text-secondary')}>{m.replyTo.preview}</span>
              </button>
            )}
            {m.deleted
              ? <p className="text-sm italic text-text-muted">Message deleted</p>
              : (
                <div className="space-y-1.5">
                  {text && <MessageText body={text} ctx={{ members, mentions: m.mentions || [], meId, onBrand: mine }} />}
                  <Attachments files={atts} onPreview={onPreview} onBrand={mine} />
                </div>
              )}
            <p className={cn('text-[10px] leading-none mt-1 text-right select-none',
              mine && !m.deleted ? 'text-brand-on/80' : 'text-text-muted')}>
              {/* The clock and "Sending…" moved into MessageReceipt, which owns
                  every delivery state including that one — two places showing it
                  meant the pending row said it twice. */}
              {m.editedAt && !m.deleted && <span className="mr-1">edited</span>}{time}
            </p>
          </div>
          {reactButton}
          </div>
          {cards.map(c => <LinkCard key={`${c.kind}:${c.type || ''}:${c.id}`} link={c} />)}
          {reactions.length > 0 && !m.deleted && (
            <div className={cn('relative flex flex-wrap items-center gap-1 mt-1', mine ? 'justify-end' : 'justify-start')}>
              {reactions.map(r => (
                <button key={r.emoji} type="button" disabled={!canAct} onClick={() => onReact(r.emoji)}
                  title={(r.names || []).join(', ')}
                  className={cn('inline-flex items-center gap-1 h-6 px-1.5 rounded-badge border text-xs',
                    r.mine ? 'border-brand-500 bg-brand-500/15 text-brand-ink' : 'border-border bg-surface-raised text-text-secondary hover:bg-surface-overlay')}>
                  <span className="text-sm leading-none">{r.emoji}</span>{r.count}
                </button>
              ))}

              {/* The opener for "who reacted". Its own control rather than the
                  chips', because clicking a chip toggles your reaction and that
                  is the action people reach for constantly — stealing it for a
                  panel would have them un-reacting by accident every time they
                  wanted to read a name.

                  The native title tooltip stays on the chips: it is still the
                  fastest way to see two names, and this is for the case it
                  handles badly — fifteen people, several emoji, or a touch
                  screen where a tooltip never appears at all. */}
              <button type="button" onClick={() => setShowReactions(v => !v)}
                aria-label="Who reacted"
                aria-expanded={showReactions}
                className="inline-flex items-center justify-center h-6 w-6 rounded-badge text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
                <Users size={11} />
              </button>

              {showReactions && (
                <ReactionDetails
                  reactions={reactions}
                  canAct={canAct}
                  onToggle={onReact}
                  // Received messages sit on the left, so the panel has to open
                  // rightwards or it runs off the pane and clips to a sliver.
                  align={mine ? 'right' : 'left'}
                  onClose={() => setShowReactions(false)} />
              )}
            </div>
          )}
          {mine && !m.deleted && (
            <MessageReceipt receipt={receipt} messageId={m.id} pending={!!m.pending} direct={direct} />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Enter sends, Shift+Enter is a new line, @ picks someone in the conversation.
 * Sending is instant: the box clears and the message shows as "Sending…" at
 * once (onSending); the server's copy replaces it (onSent). Messages go out
 * one after another, so a quick burst keeps its order. If one fails, it is
 * taken away and its text (and files) come back into an empty box.
 * Files: the paperclip, drag-and-drop onto the conversation, or paste an
 * image. Each file uploads as soon as it is added (linked to this
 * conversation, so only its members can open it); Send posts the text with them.
 */
function Composer({ id, members, meId, onSending, onSent, onFailed, replyingTo, onCancelReply, apiRef }) {
  // Kept per conversation and per browser, so switching to Workspaces and back
  // — which unmounts this whole page — returns you to what you were typing.
  // Keyed on `id`: the draft follows the conversation, not the box.
  const [text, setText, clearDraft] = useDraft(id ? `chat-draft:${id}` : null)
  const [mentions, setMentions] = useState([])     // { userId, name }
  const [picker, setPicker] = useState(null)       // { start, query }
  const [pick, setPick] = useState(0)
  const [emoji, setEmoji] = useState(false)
  const [files, setFiles] = useState([])           // { key, name, size, type, status: 'uploading'|'done'|'error', documentId }
  const ta = useRef(null)
  const fileInput = useRef(null)
  const lastTyping = useRef(0)
  const queue = useRef(Promise.resolve())
  const { upload } = useDocumentUpload()

  const addFiles = (list) => {
    const room = MAX_FILES - files.length
    if (!list?.length) return
    if (room <= 0) { toast.error(`Up to ${MAX_FILES} files per message`); return }
    if (list.length > room) toast.error(`Only ${room} more file${room === 1 ? '' : 's'} can go on this message`)
    list.slice(0, room).forEach(file => {
      // Refused up front with the reason (type or size) — before, an
      // oversize photo died mid-upload with nothing on screen.
      const why = refusal(file)
      if (why) { toast.error(why, { duration: 7000 }); return }
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      // Photos up to 10 MB go compressed; anything else, and bigger photos,
      // go as they are (full quality, GIFs keep their animation).
      const asDocument = !isPhoto(file)
      setFiles(fs => [...fs, { key, name: file.name || 'pasted-image.png', size: file.size, type: file.type, status: 'uploading', progress: 0 }])
      const send = (asDoc) => upload(file, {
        entityType: 'CHAT_CONVERSATION', entityId: id, linkType: 'ATTACHMENT', documentType: 'CHAT_FILE', silent: true,
        asDocument: asDoc,
        onProgress: (p) => setFiles(fs => fs.map(f => (f.key === key ? { ...f, progress: p } : f))),
      })
      // A photo posts through the app server, and a proxy in front of it
      // (nginx: 1 MB by default) can refuse it before Spring sees it — as a
      // 413, or, with no CORS headers on the proxy's error page, as a bare
      // network error. Then send it the other way: straight to S3, full
      // quality, which no proxy limit touches.
      const viaServerRefused = (e) => !asDocument && (e?.status === 413 || e?.status == null)
      send(asDocument)
        .catch((e) => {
          if (!viaServerRefused(e)) throw e
          setFiles(fs => fs.map(f => (f.key === key ? { ...f, progress: 0 } : f)))
          return send(true)
        })
        .then(({ documentId }) => setFiles(fs => fs.map(f => (f.key === key ? { ...f, status: 'done', documentId } : f))))
        .catch((e) => {
          setFiles(fs => fs.map(f => (f.key === key ? { ...f, status: 'error' } : f)))
          toast.error(errMsg(e, `Could not upload ${file.name || 'the file'}`))
        })
    })
    ta.current?.focus()
  }
  if (apiRef) apiRef.current = { addFiles, focus: () => ta.current?.focus() }

  const ready = files.filter(f => f.status === 'done')
  const uploading = files.some(f => f.status === 'uploading')
  const canSend = (!!text.trim() || ready.length > 0) && !uploading

  const submit = () => {
    if (!canSend) return
    const body = text
    const tagged = mentions
    const atts = ready
    const reply = replyingTo
    // @all = everyone else in the conversation, sent as their ids — the
    // server notifies mentions exactly as for single @Names (and, in a
    // channel, a mention is what notifies at all).
    const all = tagged.some(m => m.isAll) && /(^|\s)@all\b/.test(body)
    const ids = all ? members.map(p => p.userId)
      : tagged.filter(m => !m.isAll && body.includes('@' + m.name)).map(m => m.userId)
    // Like WhatsApp: pictures sent together are ONE message (an album);
    // every other file is a message of its own, so each can be replied to,
    // reacted to and pinned by itself. The text is the caption of the first
    // part — the album if there is one, otherwise the first file — and the
    // reply and mentions go with it.
    const asFile = (f) => ({ documentId: f.documentId, fileName: f.name, mimeType: f.type, size: f.size })
    const pictures = atts.filter(f => asThumb(asFile(f)))
    const others = atts.filter(f => !asThumb(asFile(f)))
    const parts = [
      ...(pictures.length ? [pictures] : []),
      ...others.map(f => [f]),
    ]
    if (parts.length === 0) parts.push([])                 // text only

    // clearDraft, not setText(''): the text has stopped being a draft, so the
    // stored copy has to go too or it would come back on the next visit.
    clearDraft(); setMentions([]); setFiles([]); setPicker(null); setEmoji(false)
    if (ta.current) { ta.current.style.height = 'auto'; ta.current.focus() }

    parts.forEach((partFiles, i) => {
      const first = i === 0
      const partBody = first ? body : ''
      const partIds = first ? ids : []
      const partReply = first ? reply : null
      const tempId = `tmp-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`
      onSending({
        id: tempId, pending: true, mine: true, senderId: meId, body: partBody, mentions: partIds, reactions: [],
        createdAt: new Date().toISOString(),
        attachments: partFiles.map(asFile),
        replyTo: partReply ? { id: partReply.id, senderName: partReply.senderName, preview: snippet(partReply) } : null,
      })
      queue.current = queue.current.then(() => chatApi.send(id, partBody, partIds, {
        replyToId: partReply?.id ?? null,
        attachmentIds: partFiles.map(f => f.documentId),
      }).then(
        (r) => onSent(one(r), tempId),
        (e) => {
          onFailed(tempId)
          toast.error(errMsg(e, 'Could not send — it is back in the box'), { id: `send-failed-${tempId}` })
          // Whatever did not go out comes back; never over new text.
          if (first) {
            setText(t => (t ? t : body))
            setMentions(ms => (ms.length ? ms : tagged))
          }
          setFiles(fs => [...fs, ...partFiles.filter(f => !fs.some(x => x.key === f.key))])
        },
      ))
    })
  }

  const ALL = { userId: '__all__', name: 'all', isAll: true }
  const options = picker ? [
    ...(members.length > 1 && 'all'.startsWith(picker.query.toLowerCase()) ? [ALL] : []),
    ...members.filter(p => p.name.toLowerCase().includes(picker.query.toLowerCase())).slice(0, 6),
  ] : []

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
    // "typing…" for the others — at most every 3 seconds.
    const now = Date.now()
    if (v.trim() && now - lastTyping.current > 3000) { lastTyping.current = now; chatApi.typing(id).catch(() => {}) }
  }
  const choose = (p) => {
    const caret = ta.current.selectionStart
    const next = text.slice(0, picker.start) + '@' + p.name + ' ' + text.slice(caret)
    setText(next)
    setMentions(ms => ms.some(m => m.userId === p.userId) ? ms : [...ms, p])
    setPicker(null)
    requestAnimationFrame(() => { const pos = picker.start + p.name.length + 2; ta.current.focus(); ta.current.setSelectionRange(pos, pos) })
  }
  /** Wrap the selection (or put the markers at the caret) — bold, italic, code. */
  const wrap = (left, right = left) => {
    const el = ta.current
    if (!el) return
    const s = el.selectionStart, e = el.selectionEnd
    const sel = text.slice(s, e)
    setText(text.slice(0, s) + left + sel + right + text.slice(e))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + left.length, s + left.length + sel.length) })
  }
  const insert = (str) => {
    const el = ta.current
    const s = el ? el.selectionStart : text.length, e = el ? el.selectionEnd : text.length
    setText(text.slice(0, s) + str + text.slice(e))
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(s + str.length, s + str.length) } })
  }

  const tool = 'p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay'
  return (
    <div className="relative px-4 pt-1 pb-3 border-t border-border">
      {picker && options.length > 0 && (
        <div className="absolute left-4 bottom-full mb-1 w-64 rounded-ctl border border-border glass-overlay shadow-overlay py-1 z-10">
          {options.map((p, i) => (
            <button key={p.userId} type="button" onMouseDown={(e) => { e.preventDefault(); choose(p) }}
              className={cn('w-full text-left px-3 py-1.5 text-xs flex items-center gap-2', i === pick ? 'bg-surface-overlay' : 'hover:bg-surface-overlay')}>
              {p.isAll ? (
                <>
                  <span className="w-5 h-5 rounded-full bg-status-warn-bg text-status-warn-fg text-[9px] font-semibold flex items-center justify-center">@</span>
                  <span className="font-medium">all</span>
                  <span className="text-text-muted">· everyone here ({members.length})</span>
                </>
              ) : (
                <>
                  <span className="w-5 h-5 rounded-full bg-brand-500/20 text-[9px] font-semibold flex items-center justify-center">{initials(p.name)}</span>
                  {p.name}
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {replyingTo && (
        <div className="mt-2 flex items-center gap-2 rounded-ctl border-l-2 border-brand-500 bg-surface-overlay px-2 py-1">
          <Reply size={12} className="text-text-muted shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-text-secondary truncate">Replying to {replyingTo.mine ? 'yourself' : replyingTo.senderName}</p>
            <p className="text-xs text-text-muted truncate">{snippet(replyingTo)}</p>
          </div>
          <button type="button" onClick={onCancelReply} title="Cancel reply" className="p-1 text-text-muted hover:text-text-primary"><X size={12} /></button>
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {files.map(f => (
            <span key={f.key} className={cn('inline-flex items-center gap-1.5 max-w-[220px] rounded-ctl border px-2 py-1 text-xs',
              f.status === 'error' ? 'border-status-fail-fg/40 bg-status-fail-bg text-status-fail-fg' : 'border-border bg-surface-raised text-text-primary')}>
              {f.status === 'uploading' ? <Loader2 size={12} className="animate-spin shrink-0" />
                : /^image\//.test(f.type || '') ? <ImageIcon size={12} className="shrink-0 text-text-muted" />
                : <FileText size={12} className="shrink-0 text-text-muted" />}
              <span className="truncate" title={f.name}>{f.name}</span>
              <span className="text-[10px] text-text-muted shrink-0 tabular-nums">
                {f.status === 'error' ? 'failed' : f.status === 'uploading' && f.size > 2 * 1048576 ? `${f.progress || 0}%` : fmtBytes(f.size)}
              </span>
              <button type="button" title="Remove" onClick={() => setFiles(fs => fs.filter(x => x.key !== f.key))}
                className="text-text-muted hover:text-text-primary"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-0.5 mt-1">
        <input ref={fileInput} type="file" multiple className="hidden"
          onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = '' }} />
        <button type="button" className={tool} title="Attach files" onClick={() => fileInput.current?.click()}><Paperclip size={14} /></button>
        <span className="w-px h-4 bg-border mx-1" />
        <button type="button" className={tool} title="Bold (Ctrl+B)" onClick={() => wrap('**')}><Bold size={14} /></button>
        <button type="button" className={tool} title="Italic (Ctrl+I)" onClick={() => wrap('_')}><Italic size={14} /></button>
        <button type="button" className={tool} title="Strikethrough" onClick={() => wrap('~~')}><Strikethrough size={14} /></button>
        <button type="button" className={tool} title="Code" onClick={() => wrap('`')}><Code size={14} /></button>
        <button type="button" className={tool} title="Bulleted list" onClick={() => insert((text && !text.endsWith('\n') ? '\n' : '') + '- ')}><List size={14} /></button>
      </div>
      <div className="flex items-end gap-2">
        <textarea ref={ta} value={text} onChange={onChange} rows={1}
          placeholder="Write a message — @ to mention, **bold**, _italic_, `code`"
          onPaste={(e) => {
            const pasted = Array.from(e.clipboardData?.files || [])
            if (pasted.length) { e.preventDefault(); addFiles(pasted) }
          }}
          onKeyDown={(e) => {
            if (picker && options.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setPick(i => (i + 1) % options.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setPick(i => (i - 1 + options.length) % options.length); return }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(options[pick]); return }
              if (e.key === 'Escape') { setPicker(null); return }
            }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
              const k = e.key.toLowerCase()
              if (k === 'b') { e.preventDefault(); wrap('**'); return }
              if (k === 'i') { e.preventDefault(); wrap('_'); return }
            }
            if (e.key === 'Escape' && replyingTo) { onCancelReply(); return }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
          }}
          className="flex-1 resize-none max-h-40 rounded-ctl border border-border glass-field px-3 py-2 text-sm text-text-primary" />
        {/* Emoji sits by Send; its picker opens directly above the button. */}
        <div className="relative shrink-0">
          <button type="button" title="Emoji" aria-label="Emoji"
            className={cn('h-9 w-9 flex items-center justify-center rounded-ctl text-text-muted hover:text-text-primary hover:bg-surface-overlay',
              emoji && 'bg-surface-overlay text-text-primary')}
            onMouseDown={(e) => e.stopPropagation()} onClick={() => setEmoji(v => !v)}><Smile size={16} /></button>
          {emoji && (
            <EmojiPicker className="absolute right-0 bottom-full mb-2"
              onPick={(e) => insert(e)} onClose={() => setEmoji(false)} />
          )}
        </div>
        <Button size="sm" icon={Send} onClick={submit} disabled={!canSend} aria-label="Send" />
      </div>
    </div>
  )
}

/** The time for a popover to open upward: near the bottom of the window. */
const opensUpward = (el, need) => !!el && window.innerHeight - el.getBoundingClientRect().bottom < need

/**
 * A message's ⌄ menu — Reply, Forward, Copy, Pin, and Edit/Delete where
 * allowed. In the bubble's top-right corner; hidden until the bubble is
 * hovered or focused, and stays while open.
 */
function MessageMenu({ m, mine, canDelete, onReply, onPin, onEdit, onDelete, onForward, onSelect }) {
  const [menu, setMenu] = useState(null)        // null | { up }
  const ref = useRef(null)
  useDismiss(ref, !!menu, () => setMenu(null))
  const item = 'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left text-text-primary hover:bg-surface-overlay'
  const run = (fn) => () => { setMenu(null); fn() }
  const copyText = async () => {
    try { await navigator.clipboard.writeText(m.body || ''); toast.success('Copied') }
    catch { toast.error('Could not copy') }
  }
  const shown = menu ? 'visible' : 'invisible group-hover/bubble:visible group-focus-within/bubble:visible focus-within:visible'
  return (
    <div ref={ref} className={cn('absolute top-0 right-0 z-20', shown)}>
      <button type="button" aria-label="Message options" title="More" aria-expanded={!!menu}
        onClick={(e) => setMenu(v => (v ? null : { up: opensUpward(e.currentTarget, 260) }))}
        className={cn('relative m-1 h-6 w-6 rounded-full flex items-center justify-center',
          mine ? 'text-brand-on hover:bg-brand-on/15' : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised')}>
        <ChevronDown size={15} />
      </button>
      {menu && (
        <div role="menu"
          className={cn('absolute z-30 w-44 py-1 rounded-card border border-border bg-surface-raised shadow-overlay',
            menu.up ? 'bottom-full mb-1' : 'top-full mt-1', mine ? 'right-0' : 'left-0')}>
          <button type="button" role="menuitem" className={item} onClick={run(onReply)}><Reply size={14} className="text-text-muted" /> Reply</button>
          <button type="button" role="menuitem" className={item} onClick={run(onForward)}><Forward size={14} className="text-text-muted" /> Forward</button>
          <button type="button" role="menuitem" className={item} onClick={run(onSelect)}><CheckSquare size={14} className="text-text-muted" /> Select</button>
          {!!m.body && <button type="button" role="menuitem" className={item} onClick={run(copyText)}><Copy size={14} className="text-text-muted" /> Copy text</button>}
          <button type="button" role="menuitem" className={item} onClick={run(onPin)}>
            {m.pinnedAt ? <PinOff size={14} className="text-text-muted" /> : <Pin size={14} className="text-text-muted" />} {m.pinnedAt ? 'Unpin' : 'Pin'}
          </button>
          {mine && <button type="button" role="menuitem" className={item} onClick={run(onEdit)}><Pencil size={14} className="text-text-muted" /> Edit</button>}
          {canDelete && (
            <>
              <div className="my-1 border-t border-border-subtle" />
              <button type="button" role="menuitem" className={cn(item, 'text-status-fail-fg')} onClick={run(onDelete)}>
                <Trash2 size={14} /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Forward one or more messages (picked with Select) to up to 5 of your chats.
 * The copies carry the text and the files, say "Forwarded", and arrive in the
 * order the messages were sent; mentions and reply links stay behind.
 */
const FORWARD_MAX = 5
const FORWARD_MAX_MESSAGES = 30
function ForwardModal({ messages, fromId, onClose, onDone }) {
  const qc = useQueryClient()
  const open = !!messages?.length
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState([])
  const [was, setWas] = useState(false)
  if (open !== was) { setWas(open); if (open) { setQ(''); setPicked([]) } }
  const { data, isLoading } = useQuery({ queryKey: KEY_LIST, queryFn: () => chatApi.conversations(), enabled: open })
  const convs = list(data).filter(c => c.member !== false && !c.archived)
  const shown = q.trim() ? convs.filter(c => (c.name || '').toLowerCase().includes(q.trim().toLowerCase())) : convs
  const full = picked.length >= FORWARD_MAX
  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : (p.length >= FORWARD_MAX ? p : [...p, id]))
  const many = (messages?.length || 0) > 1
  const send = useMutation({
    mutationFn: () => many
      ? chatApi.forwardMany(messages.map(m => m.id), picked)
      : chatApi.forward(messages[0].id, picked),
    onSuccess: () => {
      const what = many ? `${messages.length} messages` : 'Message'
      toast.success(picked.length === 1 ? `${what} forwarded` : `${what} forwarded to ${picked.length} chats`)
      qc.invalidateQueries({ queryKey: KEY_LIST })
      onDone()
    },
    onError: (e) => toast.error(errMsg(e, 'Could not forward')),
  })
  // A short preview of what is going: the message, or how many and of what.
  const first = messages?.[0]
  const files = (messages || []).reduce((n, m) => n + (m.attachments?.length || 0), 0)
  return (
    <Modal open={open} onClose={onClose} size="md" title={many ? `Forward ${messages.length} messages` : 'Forward message'}
      subtitle={`Choose up to ${FORWARD_MAX} chats.`}
      footer={<div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-muted">{picked.length ? `${picked.length} selected` : ''}</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => send.mutate()} loading={send.isPending} disabled={!picked.length}>
            <Forward size={14} /> Forward
          </Button>
        </div>
      </div>}>
      <div className="space-y-3">
        {open && (
          <div className="rounded-ctl border border-border-subtle bg-surface-overlay px-3 py-2 text-xs text-text-secondary">
            {many ? (
              <span>{messages.length} messages{files > 0 ? ` · ${files === 1 ? '1 file' : `${files} files`}` : ''} — they arrive in the order they were sent.</span>
            ) : (<>
              {first.body && <span className="line-clamp-2">{first.body}</span>}
              {files > 0 && (
                <span className="flex items-center gap-1 text-text-muted mt-0.5 min-w-0">
                  <Paperclip size={11} className="shrink-0" />
                  <span className="truncate">{first.attachments[0].fileName}{files > 1 ? ` and ${files - 1} more` : ''}</span>
                </span>
              )}
            </>)}
          </div>
        )}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search chats" autoFocus
          className="w-full h-9 rounded-ctl border border-border glass-field px-3 text-sm text-text-primary" />
        <div className="max-h-72 overflow-y-auto rounded-ctl border border-border">
          {isLoading ? <p className="p-3 text-xs text-text-muted">Loading…</p>
            : shown.length === 0 ? <p className="p-3 text-xs text-text-muted">No chats found.</p>
            : shown.map(c => {
              const on = picked.includes(c.id)
              return (
                <label key={c.id} className={cn('flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle last:border-0',
                  !on && full ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-overlay cursor-pointer')}>
                  <input type="checkbox" checked={on} disabled={!on && full} onChange={() => toggle(c.id)} />
                  <ConvIcon c={c} />
                  <span className="text-sm text-text-primary flex-1 truncate">{c.name}</span>
                  {String(c.id) === String(fromId) && <span className="text-[11px] text-text-muted">This chat</span>}
                </label>
              )
            })}
        </div>
      </div>
    </Modal>
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
        <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!text.trim() && !message?.attachments?.length}>Save</Button>
      </div>}>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={5} autoFocus
        className="w-full rounded-ctl border border-border glass-field px-3 py-2 text-sm text-text-primary" />
    </Modal>
  )
}

/** Pick staff (excluding some). */
function PeopleModal({ open, onClose, title, subtitle, exclude = [], single, confirmLabel, onConfirm, children, canConfirm = true, minPick = 1 }) {
  const presence = usePresence()
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
          className="w-full h-9 rounded-ctl border border-border glass-field px-3 text-sm text-text-primary" />
        <div className="max-h-72 overflow-y-auto rounded-ctl border border-border">
          {shown.length === 0 ? <p className="p-3 text-xs text-text-muted">Nobody found.</p> : shown.map(p => (
            <label key={p.userId} className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle last:border-0 hover:bg-surface-overlay cursor-pointer"
              onClick={single ? () => toggle(p.userId) : undefined}>
              {!single && <input type="checkbox" checked={picked.includes(p.userId)} onChange={() => toggle(p.userId)} />}
              <span className="relative w-6 h-6 rounded-full bg-brand-500/20 text-[10px] font-semibold flex items-center justify-center">
                {initials(p.name)}
                {presence.isOnline(p.userId) && <PresenceDot />}
              </span>
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
            <GlassSelect value={visibility} onChange={e => setVisibility(e.target.value)} className={input}>
              <option value="PUBLIC">Public — anyone in the organisation can join</option>
              <option value="PRIVATE">Private — invitation only</option>
            </GlassSelect>
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
/** "A, B and 3 others" */
function namesList(names) {
  if (names.length <= 3) return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} other${names.length - 3 === 1 ? '' : 's'}`
}
/** One line for a message: its text, or its files. */
function snippet(m) {
  if (m.deleted) return 'Message deleted'
  const t = String(m.body || '').replace(/\s+/g, ' ').trim()
  if (t) return t
  const n = m.attachments?.length || 0
  return n === 1 ? `📎 ${m.attachments[0].fileName}` : n > 1 ? `📎 ${n} files` : ''
}
/** The search words marked in a result. */
function highlightText(text, q) {
  if (!q) return text
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text
  const from = Math.max(0, i - 40)
  return (
    <>
      {from > 0 && '…'}{text.slice(from, i)}
      <mark className="bg-status-warn-bg text-status-warn-fg rounded px-0.5">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}
function dayLabel(s) {
  const d = new Date(s), t = new Date()
  const y = new Date(t); y.setDate(t.getDate() - 1)
  if (d.toDateString() === t.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}