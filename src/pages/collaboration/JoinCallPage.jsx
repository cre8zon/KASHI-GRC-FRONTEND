import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import axios from 'axios'
import { Video, Loader2, PhoneOff, DoorOpen, ShieldCheck, Clock, Ban } from 'lucide-react'
import api from '../../config/axios.config'
import { collabApi, unwrapOne, errMsg } from '../../api/collab.api'
import { selectIsAuthenticated, selectAuth } from '../../store/slices/authSlice'
import { startCall } from '../../components/collab/call/callStore'

const CallRoom = lazy(() => import('../../components/collab/call/CallRoom'))

/**
 * /join/:code — where a call link lands. Public: it renders outside the app
 * shell and works without an account.
 *
 *   Signed in, may be in the call  → straight into the call tab.
 *   Anyone else                    → name (and optional email) → "Asking to
 *                                    join…" → someone in the call admits them
 *                                    → the call, full screen, as a guest.
 *
 * The guest's request (id + secret) is kept in sessionStorage for THIS
 * browser tab, so a refresh while waiting keeps their place, and a refresh in
 * the call puts them straight back in — no asking again while the admission
 * lasts. The secret only ever travels in POST bodies.
 */
const GUEST_KEY = 'kashi_guest_call'
const readGuest = (code) => {
  try { const g = JSON.parse(sessionStorage.getItem(GUEST_KEY)); return g?.code === code ? g : null } catch { return null }
}
const saveGuest = (g) => { try { g ? sessionStorage.setItem(GUEST_KEY, JSON.stringify(g)) : sessionStorage.removeItem(GUEST_KEY) } catch { /* no resume — fine */ } }

// No auth header and no 401 → "session expired" handling: a guest has no
// session, and a signed-in user's token has nothing to do with this request.
const publicApi = axios.create({ baseURL: api.defaults.baseURL, timeout: 15000 })
const one = (r) => r?.data?.data ?? r?.data ?? r

const MESSAGES = {
  DENIED:  { icon: Ban,   title: 'You were not let in', body: 'Someone in the call turned down the request. Contact the person who sent you the link.' },
  EXPIRED: { icon: Clock, title: 'Nobody let you in',   body: 'The request timed out, or the link was changed. Open the link again to ask once more.' },
  REMOVED: { icon: Ban,   title: 'You were removed from the call', body: 'Someone in the call removed you.' },
  ENDED:   { icon: Clock, title: 'This link no longer works', body: 'It may have expired or been replaced. Ask the person who sent it for a new one.' },
  NO_GUESTS: { icon: ShieldCheck, title: 'This call is not taking guests', body: 'Ask the person who sent the link to let guests join, or to invite you.' },
  OFF:     { icon: Video, title: 'Calls are not available', body: 'In-app calls are not set up on this server.' },
}

export default function JoinCallPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const authed = useSelector(selectIsAuthenticated)
  const auth = useSelector(selectAuth)
  const [phase, setPhase] = useState('checking')     // checking | form | waiting | call | left | <MESSAGES key> | error
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [grant, setGrant] = useState(null)            // { url, token, title, name }
  const leaving = useRef(false)

  const poll = useCallback(async () => {
    const g = readGuest(code)
    if (!g) return null
    try {
      const r = one(await publicApi.post(`/v1/collab/public/call-links/requests/${g.requestId}/status`, { secret: g.secret }))
      if (r.status === 'ADMITTED' && r.token) {
        setGrant({ url: r.url, token: r.token, title: r.title, name: r.name, key: Date.now() })
        setPhase('call')
      } else if (r.status === 'WAITING') {
        setPhase(p => (p === 'call' ? p : 'waiting'))
      } else {
        saveGuest(null)
        setPhase(r.status in MESSAGES ? r.status : 'EXPIRED')
      }
      return r.status
    } catch (e) {
      if (e?.response?.status === 404) { saveGuest(null); setPhase('EXPIRED') }
      return null
    }
  }, [code])

  // First load: resume a guest request, or go straight in when signed in.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (readGuest(code)) { setPhase('waiting'); poll(); return }
      if (authed) {
        try {
          const r = unwrapOne(await collabApi.openCallLink(code))
          if (cancelled) return
          if (r?.mode === 'DIRECT') {
            startCall(r)
            navigate('/call', { replace: true })
            return
          }
        } catch (e) {
          if (cancelled) return
          if (e?.response?.status === 404) { setPhase('ENDED'); return }
          if (e?.response?.status === 503) { setPhase('OFF'); return }
          // Anything else: fall through to the guest page.
        }
      }
      try {
        const i = one(await publicApi.get(`/v1/collab/public/call-links/${encodeURIComponent(code)}`))
        if (cancelled) return
        setInfo(i)
        if (!i.callsEnabled) setPhase('OFF')
        else if (!i.active) setPhase('ENDED')
        else if (!i.guestsAllowed) setPhase('NO_GUESTS')
        else {
          setForm(f => ({ ...f, name: authed ? (auth.fullName || '') : f.name, email: authed ? (auth.email || '') : f.email }))
          setPhase('form')
        }
      } catch (e) {
        if (cancelled) return
        if (e?.response?.status === 404) setPhase('ENDED')
        else { setError(errMsg(e, 'Could not open this link. Check your connection and try again.')); setPhase('error') }
      }
    })()
    return () => { cancelled = true }
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  // While waiting: ask every 3 seconds.
  useEffect(() => {
    if (phase !== 'waiting') return undefined
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [phase, poll])

  const knock = async (e) => {
    e.preventDefault()
    if (form.name.trim().length < 2) { setError('Enter your name so the people in the call know who you are'); return }
    setBusy(true); setError('')
    try {
      const r = one(await publicApi.post(`/v1/collab/public/call-links/${encodeURIComponent(code)}/knock`, {
        name: form.name.trim(), email: form.email.trim() || null, website: form.website,
      }))
      saveGuest({ code, requestId: r.requestId, secret: r.secret, name: form.name.trim() })
      setPhase('waiting')
    } catch (err) {
      const s = err?.response?.status
      if (s === 404) setPhase('ENDED')
      else if (s === 403) setPhase('NO_GUESTS')
      else setError(errMsg(err, 'Could not send your request. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  const cancelWaiting = async () => {
    const g = readGuest(code)
    if (g) { try { await publicApi.post(`/v1/collab/public/call-links/requests/${g.requestId}/leave`, { secret: g.secret }) } catch { /* gone anyway */ } }
    saveGuest(null)
    setPhase('form')
  }

  const onDisconnected = async () => {
    if (leaving.current) { leaving.current = false; setPhase('left'); return }
    // Not by us: removed, or the connection dropped. The server says which.
    const s = await poll()
    if (s === 'ADMITTED') setPhase('left')
  }

  // ── in the call ──
  if (phase === 'call' && grant) {
    return (
      <div className="fixed inset-0 flex flex-col bg-on-dark-inv text-on-dark">
        <div className="flex items-center gap-2 px-4 h-11 shrink-0">
          <span className="w-2 h-2 rounded-full bg-status-fail-fg animate-pulse" aria-hidden />
          <p className="text-sm font-semibold truncate flex-1">{grant.title || 'Call'}</p>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-on-dark/15">Guest · {grant.name}</span>
          <button type="button" onClick={() => { leaving.current = true; setGrant(g => ({ ...g, token: null })); setPhase('left') }}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-ctl bg-status-fail-fg text-text-inverse text-xs font-semibold hover:opacity-90">
            <PhoneOff size={13} /> Leave
          </button>
        </div>
        <div className="flex-1 min-h-0 relative [transform:translateZ(0)]">
          <Suspense fallback={<div className="h-full flex items-center justify-center text-xs gap-2"><Loader2 size={14} className="animate-spin" /> Connecting…</div>}>
            <CallRoom key={grant.key} url={grant.url} token={grant.token} onLeave={onDisconnected} onShareState={() => {}} />
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-card rounded-card shadow-overlay px-6 py-7">
        <div className="flex items-center gap-2 text-brand-ink">
          <Video size={18} />
          <p className="text-xs font-semibold uppercase tracking-wide">KashiGRC call</p>
        </div>

        {phase === 'checking' && (
          <p className="mt-6 text-sm text-text-secondary flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Opening the link…</p>
        )}

        {phase === 'form' && (
          <form onSubmit={knock} className="mt-4 space-y-4" noValidate>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">{info?.title || 'Join the call'}</h1>
              {info?.host && <p className="text-xs text-text-muted mt-0.5">Hosted by {info.host}</p>}
            </div>
            <p className="text-sm text-text-secondary">
              You are joining as a guest. Someone in the call will see your name and let you in.
            </p>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Your name</span>
              <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} maxLength={60} autoFocus
                autoComplete="name" required
                className="glass-field mt-1 w-full h-10 px-3 rounded-ctl text-sm text-text-primary" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Email <span className="text-text-muted font-normal">(optional — helps them recognise you)</span></span>
              <input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} maxLength={200}
                autoComplete="email"
                className="glass-field mt-1 w-full h-10 px-3 rounded-ctl text-sm text-text-primary" />
            </label>
            {/* Honeypot — hidden from people, filled in by bots. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website}
              onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))}
              className="absolute -left-[9999px] h-px w-px opacity-0" />
            {error && <p className="text-xs text-status-fail-fg">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full h-10 rounded-ctl bg-brand-500 text-brand-on text-sm font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <DoorOpen size={15} />} Ask to join
            </button>
            <p className="text-[11px] text-text-muted flex items-start gap-1.5">
              <ShieldCheck size={12} className="shrink-0 mt-0.5" />
              Your camera and microphone stay off until you turn them on. Your name{form.email ? ' and email are' : ' is'} shown to the people in this call and kept with its record.
            </p>
          </form>
        )}

        {phase === 'waiting' && (
          <div className="mt-6 text-center">
            <Loader2 size={26} className="mx-auto text-brand-ink animate-spin" />
            <p className="mt-4 text-base font-semibold text-text-primary">Asking to join…</p>
            <p className="text-sm text-text-secondary mt-1">You will join as soon as someone in the call lets you in.</p>
            <button type="button" onClick={cancelWaiting} className="mt-5 text-xs text-text-secondary hover:text-text-primary underline underline-offset-2">
              Cancel
            </button>
          </div>
        )}

        {phase === 'left' && (
          <div className="mt-6 text-center">
            <p className="text-base font-semibold text-text-primary">You left the call</p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={async () => { setPhase('checking'); const s = await poll(); if (!s) setPhase('EXPIRED') }}
                className="h-9 px-4 rounded-ctl bg-brand-500 text-brand-on text-sm font-medium hover:opacity-90">Rejoin</button>
            </div>
          </div>
        )}

        {MESSAGES[phase] && <Message {...MESSAGES[phase]} onRetry={phase === 'EXPIRED' ? () => window.location.reload() : null} />}

        {phase === 'error' && (
          <div className="mt-6">
            <p className="text-sm text-status-fail-fg">{error}</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-3 text-xs underline underline-offset-2 text-text-secondary">Try again</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Message({ icon: Icon, title, body, onRetry }) {
  return (
    <div className="mt-6 text-center">
      <Icon size={24} className="mx-auto text-text-muted" />
      <p className="mt-3 text-base font-semibold text-text-primary">{title}</p>
      <p className="text-sm text-text-secondary mt-1">{body}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-4 h-9 px-4 rounded-ctl border border-border text-sm hover:bg-surface-overlay">
          Ask again
        </button>
      )}
    </div>
  )
}