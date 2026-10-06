import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText, Download, Eye, Video, ExternalLink, Loader2, Image as ImageIcon } from 'lucide-react'
import api from '../../config/axios.config'
import { collabApi, unwrapOne } from '../../api/collab.api'
import { useDocumentDownload } from '../../hooks/useDocuments'
import { useOpenEntityDrawer } from '../../hooks/useEntityDrawer'
import { joinMeetingCall } from '../collab/call/callStore'
import { callOpen, MEETING_STATUS } from '../collab/Meetings'
import { Badge } from '../ui/Badge'
import { cn } from '../../lib/cn'

/**
 * The parts of a chat message: the formatted text, the files and the cards for
 * KashiGuard links.
 *
 * Formatting is a small, safe subset — it builds React elements, never HTML:
 *   **bold**  *italic* or _italic_  ~~strike~~  `code`  ```code block```
 *   lines starting "- " or "1. " become lists; http(s) links are clickable.
 * @mentions are highlighted (you in a stronger colour).
 */

// ── Links ────────────────────────────────────────────────────────────────────

// http(s) URLs, or an app path typed on its own (/module/…, /collaboration/meetings/…).
// The last character may not be punctuation, so "see https://x.com/a." links "…/a".
const LINK_RE = /\bhttps?:\/\/[^\s<>"]*[^\s<>".,;:!?'")\]]|(?<![\w/])\/(?:module|collaboration\/meetings)\/[^\s<>"]*[^\s<>".,;:!?'")\]]/

/**
 * What a link points at inside this app, or null for an outside link.
 *   { kind: 'record', type, id, parentId? }   a module record (opens its drawer)
 *   { kind: 'meeting', id }                    a meeting / call
 *   { kind: 'page', path }                     any other page of the app
 */
export function appLink(href) {
  let u
  try { u = new URL(href, window.location.origin) } catch { return null }
  if (u.origin !== window.location.origin) return null
  const dt = u.searchParams.get('drawerType'), di = u.searchParams.get('drawerId')
  if (dt && /^\d+$/.test(di || '')) return { kind: 'record', type: dt.toUpperCase(), id: di }
  let m = u.pathname.match(/^\/collaboration\/meetings\/(\d+)\/?$/)
  if (m) return { kind: 'meeting', id: m[1] }
  m = u.pathname.match(/^\/module\/([a-z0-9_]+)\/(\d+)\/([a-z0-9_]+)\/(\d+)\/?$/i)
  if (m) return { kind: 'record', type: m[3].toUpperCase(), id: m[4], parentId: m[2] }
  m = u.pathname.match(/^\/module\/([a-z0-9_]+)\/(\d+)\/?$/i)
  if (m) return { kind: 'record', type: m[1].toUpperCase(), id: m[2] }
  return { kind: 'page', path: u.pathname + u.search + u.hash }
}

/**
 * The text without the KashiGuard links at its END that get a card — the card
 * says it better than the raw URL ("Started a video call — http://…/meetings/44"
 * shows as "Started a video call" + the call card). Links mid-sentence stay.
 */
export function stripCardLinks(body) {
  if (!body) return body
  const tail = new RegExp('(?:' + LINK_RE.source + ')\\s*$')
  let out = body
  for (let i = 0; i < 3; i++) {
    const m = out.match(tail)
    if (!m) break
    const a = appLink(m[0].trim())
    if (!a || a.kind === 'page') break
    out = out.slice(0, m.index).replace(/[\s—–:-]+$/, '')
  }
  return out
}

/** Every link in a text, in order, de-duplicated (the details panel's Links). */
export function extractLinks(body) {
  const out = []
  if (!body) return out
  const re = new RegExp(LINK_RE.source, 'g')
  let m
  while ((m = re.exec(body))) if (!out.includes(m[0])) out.push(m[0])
  return out
}

/** The app links in a message, de-duplicated, for the cards under the text (at most 3). */
export function linkCards(body) {
  const out = [], seen = new Set()
  if (!body) return out
  const re = new RegExp(LINK_RE.source, 'g')
  let m
  while ((m = re.exec(body)) && out.length < 3) {
    const a = appLink(m[0])
    if (!a || a.kind === 'page') continue
    const k = `${a.kind}:${a.type || ''}:${a.id}`
    if (!seen.has(k)) { seen.add(k); out.push(a) }
  }
  return out
}

// ── Formatted text ───────────────────────────────────────────────────────────

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The message text as React elements.
 * ctx = { members, mentions, meId, onBrand }
 */
export function MessageText({ body, ctx }) {
  const navigate = useNavigate()
  if (!body) return null
  const full = { members: [], mentions: [], ...ctx, navigate, mentionRe: mentionRegex(body, ctx) }
  const blocks = toBlocks(body)
  return (
    <div className="text-sm break-words [overflow-wrap:anywhere] space-y-1">
      {blocks.map((b, i) => {
        if (b.kind === 'code') {
          return (
            <pre key={i} className={cn('rounded-ctl px-2 py-1.5 text-xs font-mono whitespace-pre-wrap overflow-x-auto',
              ctx.onBrand ? 'bg-surface-raised/70 text-text-primary' : 'bg-surface-raised border border-border-subtle text-text-primary')}>{b.text}</pre>
          )
        }
        if (b.kind === 'ul' || b.kind === 'ol') {
          const Tag = b.kind
          return (
            <Tag key={i} className={cn('pl-5 space-y-0.5', b.kind === 'ul' ? 'list-disc' : 'list-decimal')}>
              {b.items.map((t, j) => <li key={j}>{inline(t, full, `${i}.${j}`)}</li>)}
            </Tag>
          )
        }
        return <p key={i} className="whitespace-pre-wrap">{inline(b.text, full, String(i))}</p>
      })}
    </div>
  )
}

/** Paragraphs, lists and ``` code blocks. */
function toBlocks(body) {
  const out = []
  const parts = body.split(/```/)
  // An unclosed fence stays as text: glue it back onto the text before it.
  if (parts.length % 2 === 0) parts.splice(-2, 2, parts[parts.length - 2] + '```' + parts[parts.length - 1])
  parts.forEach((text, idx) => {
    if (idx % 2 === 1) {                                     // inside a fence
      out.push({ kind: 'code', text: text.replace(/^[a-z0-9_+-]*\n/i, '').replace(/\n$/, '') })
      return
    }
    let para = []
    let list = null
    const flushPara = () => {
      // Blank lines at a paragraph's edges are spacing the block layout already gives.
      while (para.length && !para[0].trim()) para.shift()
      while (para.length && !para[para.length - 1].trim()) para.pop()
      if (para.length) out.push({ kind: 'p', text: para.join('\n') })
      para = []
    }
    const flushList = () => { if (list) { out.push(list); list = null } }
    text.split('\n').forEach(line => {
      const ul = line.match(/^\s*[-*•]\s+(.*)$/)
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
      if (ul || ol) {
        const kind = ul ? 'ul' : 'ol'
        flushPara()
        if (!list || list.kind !== kind) { flushList(); list = { kind, items: [] } }
        list.items.push((ul || ol)[1])
      } else {
        flushList()
        para.push(line)
      }
    })
    flushList()
    flushPara()
  })
  return out
}

function mentionRegex(body, { members = [], mentions = [] } = {}) {
  if (!mentions.length) return null
  const tokens = members.filter(p => mentions.includes(p.userId) && p.name).map(p => p.name)
  if (/(^|\s)@all\b/.test(body)) tokens.push('all')
  if (!tokens.length) return null
  tokens.sort((a, b) => b.length - a.length)           // "Anita Rao" before "Anita"
  return new RegExp('@(' + tokens.map(escapeRe).join('|') + ')(?![\\w])')
}

// Earliest match wins; code and links are not formatted inside.
const RULES = [
  ['code',   /`([^`\n]+)`/],
  ['link',   LINK_RE],
  ['mention', null],
  ['bold',   /\*\*(?!\s)([^\n]+?)(?<!\s)\*\*/],
  ['strike', /~~(?!\s)([^\n]+?)(?<!\s)~~/],
  ['italic', /(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/],
  ['italic', /(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/],
]

function inline(text, ctx, key) {
  const out = []
  let rest = text
  let k = 0
  while (rest) {
    let best = null
    for (const [kind, re0] of RULES) {
      const re = kind === 'mention' ? ctx.mentionRe : re0
      if (!re) continue
      const m = rest.match(re)
      if (m && (best === null || m.index < best.m.index)) best = { kind, m }
    }
    if (!best) { out.push(rest); break }
    const { kind, m } = best
    if (m.index > 0) out.push(rest.slice(0, m.index))
    const id = `${key}-${k++}`
    out.push(renderToken(kind, m, ctx, id))
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

function renderToken(kind, m, ctx, id) {
  switch (kind) {
    case 'code':
      return <code key={id} className={cn('rounded px-1 py-px font-mono text-[0.85em]',
        ctx.onBrand ? 'bg-surface-raised/70 text-text-primary' : 'bg-surface-raised border border-border-subtle text-text-primary')}>{m[1]}</code>
    case 'bold':   return <strong key={id} className="font-semibold">{inline(m[1], ctx, id)}</strong>
    case 'italic': return <em key={id}>{inline(m[1], ctx, id)}</em>
    case 'strike': return <s key={id}>{inline(m[1], ctx, id)}</s>
    case 'mention': {
      const name = m[1]
      const isAll = name === 'all'
      const p = isAll ? null : (ctx.members || []).find(x => x.name === name && ctx.mentions.includes(x.userId))
      const you = isAll ? ctx.mentions.includes(ctx.meId) : p?.userId === ctx.meId
      // On your own (brand) bubble a brand tint would vanish — use a light chip.
      return <span key={id} className={cn('rounded px-0.5 font-medium',
        you ? 'bg-status-warn-bg text-status-warn-fg'
          : ctx.onBrand ? 'bg-surface-raised/70 text-brand-900' : 'bg-brand-500/15 text-brand-900')}>@{name}</span>
    }
    case 'link': {
      const href = m[0]
      const a = appLink(href)
      const cls = cn('underline underline-offset-2 break-all', ctx.onBrand ? 'text-brand-900' : 'text-brand-900 hover:opacity-80')
      if (a) {
        const to = new URL(href, window.location.origin)
        return <a key={id} href={to.pathname + to.search + to.hash} className={cls}
          onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); ctx.navigate(to.pathname + to.search + to.hash) }}>{href}</a>
      }
      return <a key={id} href={href} target="_blank" rel="noopener noreferrer nofollow" className={cls}>{href}</a>
    }
    default: return m[0]
  }
}

// ── Link cards ───────────────────────────────────────────────────────────────

export function LinkCard({ link }) {
  return link.kind === 'meeting' ? <MeetingCard id={link.id} /> : <RecordCard link={link} />
}

const cardCls = 'mt-1.5 w-72 max-w-full rounded-ctl border border-border bg-surface-raised px-3 py-2 text-left'
const pickTitle = (e) => e?.title || e?.name || e?.testNameSnapshot || e?.titleSnapshot || e?.controlNameSnapshot
  || e?.controlCode || e?.testCode || e?.policyName || e?.reference || null
const human = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())

/** A KashiGuard record: its kind, title and status; click opens its drawer here. */
function RecordCard({ link }) {
  const openDrawer = useOpenEntityDrawer()
  const { data: bpRaw } = useQuery({
    queryKey: ['chat-link-bp', link.type],
    queryFn: () => api.get(`/v1/admin/module-blueprints/by-type/${link.type}`),
    staleTime: 10 * 60e3, retry: false,
  })
  const bp = bpRaw?.data?.entityType ? bpRaw.data : bpRaw?.entityType ? bpRaw : null
  const base = resolveBase(bp, link.parentId)
  const { data: recRaw, isError, isLoading } = useQuery({
    queryKey: ['chat-link-rec', link.type, link.id, base],
    queryFn: () => api.get(`${base}/${link.id}`),
    enabled: !!base, staleTime: 60e3, retry: false,
  })
  const rec = recRaw?.data && typeof recRaw.data === 'object' && !Array.isArray(recRaw.data) ? recRaw.data : recRaw
  const kind = bp?.displayName || human(link.type)
  const title = pickTitle(rec)
  return (
    <button type="button" onClick={() => openDrawer(link.type, link.id)} className={cn(cardCls, 'hover:bg-surface-overlay block')}>
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
        <FileText size={11} /> <span className="truncate">{kind} · #{link.id}</span>
      </div>
      <p className="text-sm font-medium text-text-primary truncate mt-0.5">
        {isError ? 'Not available to you' : (title || (base && isLoading ? 'Loading…' : `${kind} ${link.id}`))}
      </p>
      {rec?.status && !isError && <Badge className="mt-1" label={human(rec.status)} colorTag="gray" />}
    </button>
  )
}

function resolveBase(bp, parentId) {
  if (!bp?.apiBasePath) return null
  let base = bp.apiBasePath
  if (parentId && bp.parentContextJson) {
    try {
      const ctx = typeof bp.parentContextJson === 'string' ? JSON.parse(bp.parentContextJson) : bp.parentContextJson
      if (ctx?.apiBasePath) base = ctx.apiBasePath.replace(`{${ctx.parentIdParam || 'parentId'}}`, parentId)
    } catch { /* keep the plain base */ }
  }
  return base.includes('{') ? null : base
}

/** A meeting or call: title, when, and Join while it is on. */
function MeetingCard({ id }) {
  const navigate = useNavigate()
  const { data, isError } = useQuery({
    queryKey: ['collab-meeting', String(id)], queryFn: () => collabApi.meeting(id), staleTime: 30e3, retry: false,
  })
  const m = unwrapOne(data)
  // A call: no "Scheduled" — it is either on (Join) or over.
  const isCall = m?.kind === 'CALL'
  const live = !!m && callOpen(m)
  const st = !m ? null
    : isCall ? (m.status === 'CANCELLED' ? MEETING_STATUS.CANCELLED : live ? null : { label: 'Ended', color: 'gray' })
    : MEETING_STATUS[m.status]
  return (
    <div className={cardCls}>
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
        <Video size={11} /> {m?.kind === 'CALL' ? 'Call' : 'Meeting'}
        {m?.startsAt && <span>· {new Date(m.startsAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
      <p className="text-sm font-medium text-text-primary truncate mt-0.5">{isError ? 'Not available to you' : m?.title || 'Loading…'}</p>
      <div className="flex items-center gap-2 mt-1.5">
        {st && <Badge label={st.label} colorTag={st.color} />}
        <span className="flex-1" />
        {live && (
          <button type="button" onClick={() => joinMeetingCall(m.id)}
            className="inline-flex items-center gap-1 rounded-ctl bg-brand-500 text-brand-900 px-2 py-0.5 text-xs font-medium hover:opacity-90">
            <Video size={12} /> Join
          </button>
        )}
        {!isError && (
          <button type="button" onClick={() => navigate(`/collaboration/meetings/${id}`)}
            className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
            <ExternalLink size={11} /> Open
          </button>
        )}
      </div>
    </div>
  )
}

// ── Files ────────────────────────────────────────────────────────────────────

export const fmtSize = (n) => n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`
const isImg = (mime) => /^image\//.test(mime || '')

/** Images as thumbnails, everything else as a file card. */
export function Attachments({ files, onPreview, onBrand }) {
  const { openDocument } = useDocumentDownload()
  if (!files?.length) return null
  const images = files.filter(f => isImg(f.mimeType))
  const others = files.filter(f => !isImg(f.mimeType))
  return (
    <div className="space-y-1.5">
      {images.length > 0 && (
        <div className={cn('grid gap-1', images.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {images.map(f => <ImageThumb key={f.documentId} file={f} single={images.length === 1} onClick={() => onPreview(f)} />)}
        </div>
      )}
      {others.map(f => (
        <div key={f.documentId} className={cn('flex items-center gap-2 rounded-ctl px-2 py-1.5 w-64 max-w-full',
          onBrand ? 'bg-surface-raised/80' : 'bg-surface-raised border border-border-subtle')}>
          <FileText size={18} className="text-text-muted shrink-0" />
          <button type="button" onClick={() => onPreview(f)} className="min-w-0 flex-1 text-left">
            <p className="text-xs font-medium text-text-primary truncate" title={f.fileName}>{f.fileName}</p>
            <p className="text-[10px] text-text-muted">{fmtSize(f.size)}</p>
          </button>
          <button type="button" title="Preview" onClick={() => onPreview(f)} className="p-1 text-text-muted hover:text-text-primary"><Eye size={13} /></button>
          <button type="button" title="Download" onClick={() => openDocument(f.documentId, f.fileName)} className="p-1 text-text-muted hover:text-text-primary"><Download size={13} /></button>
        </div>
      ))}
    </div>
  )
}

/**
 * Image bytes come through the app server (auth + tenant), never a public URL.
 * tile = a square that fills its grid cell (the details panel's Media).
 */
export function ImageThumb({ file, single, tile, onClick }) {
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let url = null, alive = true
    api.get(`/v1/documents/${file.documentId}/stream`, { responseType: 'arraybuffer' })
      .then(buf => {
        if (!alive) return
        url = URL.createObjectURL(new Blob([buf?.data instanceof ArrayBuffer ? buf.data : buf], { type: file.mimeType || 'image/webp' }))
        setSrc(url)
      })
      .catch(() => alive && setFailed(true))
    return () => { alive = false; if (url) URL.revokeObjectURL(url) }
  }, [file.documentId, file.mimeType])
  return (
    <button type="button" onClick={onClick} title={file.fileName}
      className={cn('block overflow-hidden rounded-ctl border border-border-subtle bg-surface-raised',
        tile ? 'w-full aspect-square' : single ? 'max-w-[280px]' : 'w-32 h-32')}>
      {src ? <img src={src} alt={file.fileName} className={cn(single && !tile ? 'max-h-64 w-auto' : 'w-full h-full object-cover')} />
        : (
          <span className={cn('flex items-center justify-center text-text-muted', tile ? 'w-full h-full' : 'w-32 h-24')}>
            {failed ? <ImageIcon size={18} /> : <Loader2 size={16} className="animate-spin" />}
          </span>
        )}
    </button>
  )
}