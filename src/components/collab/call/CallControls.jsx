import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Copy, Check, Link2, Send, UserPlus, UserMinus, RefreshCw, Search, X, Users, Loader2 } from 'lucide-react'
import { collabApi, unwrapOne, errMsg } from '../../../api/collab.api'
import { chatApi, list as chatList } from '../../../api/chat.api'
import { cn } from '../../../lib/cn'

/**
 * Call links and the lobby, for the people in a call.
 *
 *   useCallLobby(meetingId)   guests waiting / in the call (polled every 4 s)
 *   <LobbyWatcher>            a toast with Admit / Deny when someone knocks —
 *                             wherever you are in the app, card hidden or not
 *   <LobbyBadge>              "2 waiting" on the corner card
 *   <CallSharePanel>          the link (copy, send in a chat), guests on/off,
 *                             new link, and who is waiting or in as a guest
 */
const LOBBY_KEY = (id) => ['collab-call-lobby', String(id)]

export function useCallLobby(meetingId) {
  const { data } = useQuery({
    queryKey: LOBBY_KEY(meetingId),
    queryFn: () => collabApi.callLobby(meetingId),
    enabled: !!meetingId,
    refetchInterval: 4000,
    refetchIntervalInBackground: true,     // knocks arrive while you present from another window
    retry: false,
  })
  const d = unwrapOne(data) || {}
  return {
    canAdmit: !!d.canAdmit,
    waiting: Array.isArray(d.waiting) ? d.waiting : [],
    guests: Array.isArray(d.guests) ? d.guests : [],
  }
}

function useDecide(meetingId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }) => collabApi.decideGuest(id, action, meetingId),
    onSuccess: (_r, { action, name }) => {
      toast.success(action === 'admit' ? `${name} is joining` : action === 'deny' ? `${name} was turned away` : `${name} was removed`)
      qc.invalidateQueries({ queryKey: LOBBY_KEY(meetingId) })
    },
    onError: (e) => toast.error(errMsg(e, 'That did not work')),
  })
}

/** Pops a toast for each new knock; clears it once someone answers. */
export function LobbyWatcher({ meetingId }) {
  const { canAdmit, waiting } = useCallLobby(meetingId)
  const decide = useDecide(meetingId)
  const shown = useRef(new Set())
  useEffect(() => {
    if (!canAdmit) return
    const now = new Set(waiting.map(g => g.id))
    for (const g of waiting) {
      if (shown.current.has(g.id)) continue
      shown.current.add(g.id)
      toast((t) => (
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{g.name} wants to join</p>
            <p className="text-[11px] text-text-muted truncate">{g.email || 'Guest — not signed in'}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => { toast.dismiss(t.id); decide.mutate({ id: g.id, action: 'deny', name: g.name }) }}
              className="px-2 h-7 rounded-ctl text-xs text-text-secondary hover:bg-surface-overlay">Deny</button>
            <button type="button" onClick={() => { toast.dismiss(t.id); decide.mutate({ id: g.id, action: 'admit', name: g.name }) }}
              className="px-2.5 h-7 rounded-ctl text-xs font-medium bg-brand-500 text-brand-on hover:opacity-90">Admit</button>
          </div>
        </div>
      ), { id: `call-guest-${g.id}`, duration: Infinity, icon: '🚪' })
    }
    // Someone else answered, or the guest gave up: take the toast down.
    for (const id of shown.current) {
      if (!now.has(id)) { toast.dismiss(`call-guest-${id}`); shown.current.delete(id) }
    }
  }, [waiting, canAdmit]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { for (const id of shown.current) toast.dismiss(`call-guest-${id}`) }, [])
  return null
}

export function LobbyBadge({ meetingId, onClick }) {
  const { canAdmit, waiting } = useCallLobby(meetingId)
  if (!canAdmit || waiting.length === 0) return null
  return (
    <button type="button" onClick={onClick} title="People waiting to join"
      className="count-badge-alert mr-1">{waiting.length} waiting</button>
  )
}

/**
 * The share / people panel. The link is fetched (and created on first ask)
 * when the panel opens.
 */
export function CallSharePanel({ meetingId, title, onClose }) {
  const qc = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [picking, setPicking] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const { canAdmit, waiting, guests } = useCallLobby(meetingId)
  const decide = useDecide(meetingId)

  const { data: linkRaw, isLoading, isError, error } = useQuery({
    queryKey: ['collab-call-link', String(meetingId)],
    queryFn: () => collabApi.callLink(meetingId),
    enabled: !!meetingId,
    staleTime: 60_000,
    retry: false,
  })
  const link = unwrapOne(linkRaw) || {}
  const url = link.path ? `${window.location.origin}${link.path}` : ''

  const update = useMutation({
    mutationFn: (body) => collabApi.updateCallLink(meetingId, body),
    onSuccess: (r, body) => {
      qc.setQueryData(['collab-call-link', String(meetingId)], r)
      qc.invalidateQueries({ queryKey: LOBBY_KEY(meetingId) })
      setConfirmNew(false)
      toast.success(body.regenerate ? 'New link ready — the old one no longer works'
        : body.allowGuests ? 'Guests can ask to join' : 'Guests can no longer ask to join')
    },
    onError: (e) => toast.error(errMsg(e, 'Could not change the link')),
  })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy — select the link and copy it')
    }
  }

  return (
    <div className="w-[360px] max-w-[calc(100vw-24px)] glass-overlay rounded-card shadow-overlay text-text-primary">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <p className="text-sm font-semibold flex items-center gap-1.5"><Link2 size={14} className="text-brand-ink" /> Invite people</p>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-surface-overlay text-text-muted"><X size={14} /></button>
      </div>

      <div className="px-4 pb-3 space-y-2">
        {isLoading ? (
          <p className="text-xs text-text-muted flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Getting the link…</p>
        ) : isError ? (
          <p className="text-xs text-status-fail-fg">{errMsg(error, 'Could not get a link for this call')}</p>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Call link"
                className="glass-field flex-1 min-w-0 h-8 px-2.5 rounded-ctl text-xs font-mono text-text-primary" />
              <button type="button" onClick={copy}
                className="h-8 px-2.5 rounded-ctl bg-brand-500 text-brand-on text-xs font-medium inline-flex items-center gap-1 hover:opacity-90">
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-text-muted leading-snug">
              Colleagues who can see this call join straight away.
              {link.allowGuests
                ? ' Anyone else — including people without an account — asks to join, and someone in the call lets them in.'
                : ' Guests are turned off: only people who can already see this call can use the link.'}
              {link.target === 'ROOM' && ' This is the room’s link — it stays the same for every call in the room.'}
            </p>
            <button type="button" onClick={() => setPicking(p => !p)}
              className="w-full h-8 rounded-ctl border border-border text-xs font-medium inline-flex items-center justify-center gap-1.5 hover:bg-surface-overlay">
              <Send size={13} /> Send in a chat
            </button>
            {picking && <ChatPicker title={title} url={url} onSent={() => setPicking(false)} />}

            {link.canManage && (
              <div className="pt-2 border-t border-border-subtle space-y-2">
                <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                  <span>
                    <span className="font-medium">Let guests ask to join</span>
                    <span className="block text-[11px] text-text-muted">People without an account, or from another organisation</span>
                  </span>
                  <input type="checkbox" checked={!!link.allowGuests} disabled={update.isPending}
                    onChange={(e) => update.mutate({ allowGuests: e.target.checked })}
                    className="h-4 w-4 accent-brand-500" />
                </label>
                {confirmNew ? (
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-text-secondary">The current link will stop working.</span>
                    <span className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => setConfirmNew(false)} className="px-2 h-7 rounded-ctl hover:bg-surface-overlay">Cancel</button>
                      <button type="button" onClick={() => update.mutate({ regenerate: true })}
                        className="px-2 h-7 rounded-ctl bg-status-fail-fg text-text-inverse font-medium">New link</button>
                    </span>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmNew(true)}
                    className="text-[11px] text-text-secondary hover:text-text-primary inline-flex items-center gap-1">
                    <RefreshCw size={11} /> Replace the link (the old one stops working)
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {canAdmit && (waiting.length > 0 || guests.length > 0) && (
        <div className="border-t border-border-subtle px-4 py-3 space-y-3 max-h-64 overflow-y-auto">
          {waiting.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1.5">Waiting to join</p>
              {waiting.map(g => (
                <div key={g.id} className="flex items-center justify-between gap-2 py-1">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{g.name}</p>
                    <p className="text-[11px] text-text-muted truncate">{g.email || 'Not signed in'}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => decide.mutate({ id: g.id, action: 'deny', name: g.name })}
                      className="px-2 h-7 rounded-ctl text-xs text-text-secondary hover:bg-surface-overlay">Deny</button>
                    <button type="button" onClick={() => decide.mutate({ id: g.id, action: 'admit', name: g.name })}
                      className="px-2.5 h-7 rounded-ctl text-xs font-medium bg-brand-500 text-brand-on inline-flex items-center gap-1 hover:opacity-90">
                      <UserPlus size={12} /> Admit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {guests.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1.5">Guests let in</p>
              {guests.map(g => (
                <div key={g.id} className="flex items-center justify-between gap-2 py-1">
                  <p className="text-xs truncate">{g.name} <span className="text-text-muted">(guest)</span></p>
                  <button type="button" onClick={() => decide.mutate({ id: g.id, action: 'remove', name: g.name })}
                    title="Put them out of the call — they cannot come back with this request"
                    className="px-2 h-7 rounded-ctl text-xs text-status-fail-fg hover:bg-status-fail-bg inline-flex items-center gap-1">
                    <UserMinus size={12} /> Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Pick a conversation and post the link there. */
function ChatPicker({ title, url, onSent }) {
  const [q, setQ] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['call-share-chats'], queryFn: () => chatApi.conversations(), staleTime: 30_000 })
  const convs = useMemo(() => chatList(data).filter(c => !c.archived), [data])
  const shown = convs.filter(c => !q.trim() || String(c.name || '').toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30)
  const send = useMutation({
    mutationFn: (c) => chatApi.send(c.id, `Join the call "${title || 'Call'}": ${url}`, []),
    onSuccess: (_r, c) => { toast.success(`Link sent to ${c.name}`); onSent() },
    onError: (e) => toast.error(errMsg(e, 'Could not send the link')),
  })
  return (
    <div className="rounded-ctl border border-border overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 h-8 border-b border-border-subtle">
        <Search size={12} className="text-text-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a chat"
          className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none placeholder:text-text-faint" />
      </div>
      <div className="max-h-44 overflow-y-auto py-1">
        {isLoading && <p className="px-3 py-2 text-[11px] text-text-muted">Loading chats…</p>}
        {!isLoading && shown.length === 0 && <p className="px-3 py-2 text-[11px] text-text-muted">No chats found</p>}
        {shown.map(c => (
          <button key={c.id} type="button" disabled={send.isPending} onClick={() => send.mutate(c)}
            className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-surface-overlay flex items-center gap-2 disabled:opacity-60')}>
            <Users size={12} className="text-text-muted shrink-0" />
            <span className="truncate flex-1">{c.name}</span>
            {send.isPending && send.variables?.id === c.id && <Loader2 size={12} className="animate-spin" />}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * "Invite link" for a meeting that has not started yet (the meeting page):
 * the same panel as Invite inside the call — copy, send in a chat, guests
 * on/off, new link — so the link can go out with the invitation, days ahead.
 */
export function InviteLinkButton({ meetingId, title, className }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={box} className={cn('relative', className)}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        title="A link to this meeting's call, for colleagues and guests"
        className="glass-button inline-flex items-center gap-1.5 h-7 px-3 rounded-ctl text-xs font-medium text-text-primary hover:shadow-hover">
        <Link2 size={13} /> Invite link
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50">
          <CallSharePanel meetingId={meetingId} title={title} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

/**
 * One click: fetch (or create) the meeting's link and put it on the clipboard.
 * If the browser refuses the copy, the link is shown so it can be copied by hand.
 */
export async function copyInviteLink(meetingId) {
  let url = ''
  try {
    const l = unwrapOne(await collabApi.callLink(meetingId))
    url = `${window.location.origin}${l.path}`
    await navigator.clipboard.writeText(url)
    toast.success('Guest link copied — paste it into your email or chat', { id: `invite-${meetingId}` })
  } catch (e) {
    if (url) toast(`Copy this link: ${url}`, { id: `invite-${meetingId}`, duration: 15000, icon: '🔗' })
    else toast.error(errMsg(e, 'Could not get a link for this meeting'))
  }
}