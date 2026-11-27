import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUp, Loader2, RotateCcw, FileText, Database, AlertTriangle, ShieldAlert, Siren,
  Building2, ShieldOff, Boxes, BookOpen, MessageSquare, FilePlus2, ArrowRight, Lock,
  Slash, MoreHorizontal, CornerDownLeft,
} from 'lucide-react'
import { agentApi } from '../../api/agent.api'
import { selectAuth } from '../../store/slices/authSlice'
import { cn } from '../../lib/cn'
import { AiOrb } from './AiOrb'
import AiPolicyCreateModal from './AiPolicyCreateModal'

/**
 * The KashiGuard AI conversation. Used full-page (/ai) and in the side panel.
 *
 * Every answer is grounded: the backend hands the model labelled records [R1]
 * and documents [S1], and the model must end each claim with its label. Here
 * the labels become links to the record, so a reader can check any sentence
 * in one click.
 *
 * It never changes data itself. When it proposes something (start a policy
 * draft), it shows a card; the card opens the normal screen for that task,
 * pre-filled, and the person completes it there.
 *
 * The conversation is kept for the browser session (sessionStorage), shared
 * by the page and the panel. Storage can be unavailable; it then lives in
 * memory only.
 */

const STAGES = [
  'Checking what you can access',
  'Reading your records',
  'Searching your documents',
  'Writing the answer',
]

const storeKey = (who) => `kashiguard-ai:${who || 'me'}`
const load = (key) => {
  try { return JSON.parse(sessionStorage.getItem(key) || '[]') } catch { return [] }
}
const save = (key, msgs) => {
  try { sessionStorage.setItem(key, JSON.stringify(msgs.slice(-30))) } catch { /* storage unavailable */ }
}

/** Pick an icon for a suggested question by what it asks about. */
function topicIcon(text) {
  const t = String(text).toLowerCase()
  if (t.includes('issue') || t.includes('finding')) return AlertTriangle
  if (t.includes('risk'))      return ShieldAlert
  if (t.includes('incident'))  return Siren
  if (t.includes('vendor'))    return Building2
  if (t.includes('exception')) return ShieldOff
  if (t.includes('asset'))     return Boxes
  if (t.includes('iso') || t.includes('soc') || t.includes('framework')) return BookOpen
  if (t.includes('polic'))     return FileText
  return MessageSquare
}

// ── Suggested questions for the page you're on ───────────────────────────────
// On a record: questions about that record (the backend reads it first).
// On a register's list: questions about that register (it is searched first).
// Anywhere else, or a register this user cannot read: the general set from the
// backend. Keys match AgentSource keys; access comes from ctx.sources.

const ROUTE_KEYS = {
  risk: 'RISK', risks: 'RISK', issue: 'ISSUE', issues: 'ISSUE',
  incident: 'INCIDENT', incidents: 'INCIDENT', asset: 'ASSET', assets: 'ASSET',
  exception: 'EXCEPTION', exception_record: 'EXCEPTION', exceptions: 'EXCEPTION',
  audit_policy: 'POLICY', vendor: 'VENDOR', vendors: 'VENDOR',
}

const RECORD_SUGGESTIONS = {
  RISK: ['Summarise this risk and how it is being treated.', 'Who owns this risk, and when is it next reviewed?',
         'Which policies or controls relate to this risk?', 'How does this risk compare with our other top risks?'],
  ISSUE: ['Summarise this issue and where it stands.', 'Who owns this issue, and is it overdue?',
          'Which policy or control does this issue relate to?', 'What should remediation cover, based on our policies?'],
  INCIDENT: ['Summarise this incident so far.', 'Is a regulatory reporting deadline running for this incident?',
             'Which of our policies covers this type of incident?', 'Have we had similar incidents before?'],
  ASSET: ['Summarise this asset and how critical it is.', 'Which risks, issues or incidents mention this asset?',
          'Who owns this asset?', 'Which policies apply to an asset like this?'],
  EXCEPTION: ['What does this exception allow, and when does it expire?', 'Which policy is this an exception to?',
              'What compensating controls are in place?', 'Are there other exceptions like this one?'],
  POLICY: ['Summarise this policy in five bullet points.', 'Who owns this policy, and when is it due for review?',
           'What does this policy require for access reviews?', 'What might an ISO 27001 auditor ask about this policy?'],
  VENDOR: ["Summarise this vendor's risk profile.", 'What data does this vendor have access to?',
           'Are there open issues or exceptions for this vendor?', 'What do our policies require of a vendor like this?'],
}

const LIST_SUGGESTIONS = {
  RISK: ['Summarise our top risks by residual score and their treatment.', 'Which risks are overdue for review?',
         'Which risks have no treatment decided yet?', 'How many risks do we have in each category?'],
  ISSUE: ['Which high or critical issues are still open, and who owns them?', 'Which issues are overdue?',
          'How many open issues do we have by severity?', 'Which issues came out of audits?'],
  INCIDENT: ['What incidents have we had, and what was the root cause?', 'Which incidents are still open?',
             'Which incidents had a regulatory reporting deadline?', 'How many incidents of each type have we had?'],
  ASSET: ['List our critical production assets and their owners.', 'Which assets hold confidential data?',
          'How many assets do we have by type?', 'Which assets have no owner?'],
  EXCEPTION: ['Which policy exceptions expire soon?', 'Which exceptions are still waiting for approval?',
              'How many active exceptions do we have?', 'Which exceptions have no compensating controls?'],
  POLICY: ['Which policies are still in draft or due for review?', 'Do we have a policy covering remote working?',
           'Which policies does the CISO own?', 'Draft an access control policy for ISO 27001 and SOC 2'],
  VENDOR: ['Which vendors are critical, and what is their risk rating?', 'Which vendors have access to customer data?',
           'Which of our vendors are based abroad?', 'Which vendors are due for reassessment?'],
}

function contextSuggestions(route, sources) {
  if (!route) return null
  const m = route.match(/^\/module\/([a-z_]+)(?:\/(\d+))?\/?$/) || route.match(/^\/tprm\/(vendors)(?:\/(\d+))?\/?$/)
  const key = m && ROUTE_KEYS[m[1]]
  if (!key || !sources.some(s => s.key === key)) return null
  return (m[2] ? RECORD_SUGGESTIONS : LIST_SUGGESTIONS)[key] || null
}

// ── Actions (things the agent can DO) ───────────────────────────────────────
// The list comes from the server (GET /v1/ai/agent/context → actions), already
// limited to what this user could complete. Each surface shows a slice:
//   AI page      — up to 3 chips, most relevant first, then "More actions"
//   side panel   — up to 2 chips
//   "/" menu     — all of them, filtered as you type
// so a growing list never crowds the page.
const ACTION_ICONS = { FilePlus2 }
const actionIcon = (a) => ACTION_ICONS[a?.icon] || FilePlus2
const BLANK = /\[[^\]\n]+\]/g

/** Actions relevant to the page on screen first, then the rest in order. */
function rankActions(actions, route) {
  if (!route) return actions
  const hit = (a) => (a.routes || []).some(r => route.startsWith(r))
  return [...actions.filter(hit), ...actions.filter(a => !hit(a))]
}

/** Select the next [blank] in the box at or after `from` (wrapping round). */
function selectBlank(el, from = 0) {
  if (!el) return false
  const v = el.value
  BLANK.lastIndex = from
  let m = BLANK.exec(v)
  if (!m && from > 0) { BLANK.lastIndex = 0; m = BLANK.exec(v) }
  if (!m) return false
  el.focus()
  el.setSelectionRange(m.index, m.index + m[0].length)
  return true
}

/** Blanks left unfilled are dropped before sending, with the little word that
 *  introduced them: "Draft a [policy name] policy for [framework]" → "Draft a policy". */
function dropBlanks(text) {
  return text
    .replace(/\s*\b(for|with|on|about|to|under|by)\s+\[[^\]\n]*\]/gi, '')
    .replace(/\[[^\]\n]*\]\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function greeting(fullName) {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  const first = String(fullName || '').trim().split(/\s+/)[0]
  return first ? `${part}, ${first}` : part
}

export function AgentChat({ contextRoute = null, compact = false, contextLabel = null, onBusyChange }) {
  const { userId, email, fullName } = useSelector(selectAuth)
  const key = storeKey(userId || email)
  const [messages, setMessages] = useState(() => load(key))
  const [input, setInput]       = useState('')
  const [busy, setBusy]         = useState(false)
  const [stage, setStage]       = useState(0)
  const [draft, setDraft]       = useState(null)     // { intent, frameworks } for the policy modal
  const listRef  = useRef(null)
  const inputRef = useRef(null)

  const { data: ctx } = useQuery({
    queryKey: ['agent-context'],
    queryFn:  () => agentApi.context(),
    staleTime: 5 * 60 * 1000,
  })
  const sources     = ctx?.sources || []
  const suggestions = useMemo(
    () => contextSuggestions(contextRoute, sources) || ctx?.suggestions || [],
    [contextRoute, sources, ctx?.suggestions])
  const actions = useMemo(() => rankActions(ctx?.actions || [], contextRoute), [ctx?.actions, contextRoute])

  // Put an action's template in the box with its first blank selected, so
  // the user types straight over it (Tab goes to the next blank).
  const pickAction = (a) => {
    setInput(a.template || a.label)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      if (!selectBlank(el, 0)) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) }
    })
  }
  // "More actions": open the "/" menu, which lists every action.
  const openActionMenu = () => {
    setInput('/')
    requestAnimationFrame(() => { const el = inputRef.current; el?.focus(); el?.setSelectionRange(1, 1) })
  }

  useEffect(() => { save(key, messages) }, [key, messages])
  // Another surface (page vs panel) may have added turns.
  useEffect(() => {
    const onFocus = () => setMessages(load(key))
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [key])
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])
  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])
  useEffect(() => {
    if (!busy) return
    setStage(0)
    const t = setInterval(() => setStage(s => Math.min(s + 1, STAGES.length - 1)), 1800)
    return () => clearInterval(t)
  }, [busy])

  const ask = async (text) => {
    const question = dropBlanks((text ?? input).trim())
    if (!question || busy || question.startsWith('/')) return
    const history = messages.filter(m => !m.error).slice(-6).map(m => ({ role: m.role, content: m.content }))
    const next = [...messages, { role: 'user', content: question, at: Date.now() }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await agentApi.ask({ question, history, contextRoute })
      setMessages([...next, {
        role: 'assistant',
        content: res?.answer || 'No answer came back.',
        citations: res?.citations || [],
        followUps: res?.followUps || [],
        consulted: res?.consulted || [],
        actions:   res?.actions || [],
        at: Date.now(),
      }])
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error?.message
        || 'KashiGuard AI could not answer just now. Try again in a moment.'
      setMessages([...next, { role: 'assistant', content: msg, error: true, at: Date.now() }])
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const reset = () => { setMessages([]); save(key, []) }
  const empty = messages.length === 0 && !busy

  const composer = (
    <Composer inputRef={inputRef} value={input} onChange={setInput} onSend={() => ask()} busy={busy}
      big={empty && !compact} glitter calm={compact}
      actions={actions} onPickAction={pickAction}
      placeholder={(contextLabel ? `Ask about ${contextLabel}, or anything in your registers…` : 'Ask about your policies, risks, issues, vendors…')
        + (actions.length ? '  ·  type / for actions' : '')} />
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={listRef} className={cn('flex-1 min-h-0 overflow-y-auto', compact ? 'px-4 py-4' : empty ? 'px-2 py-2' : 'px-2 py-6')}>
        {empty ? (
          // Full page: centred in the available height, so the empty state
          // fits without a scrollbar and grows evenly on tall screens.
          <div className={cn(!compact && 'min-h-full flex flex-col justify-center')}>
            <Hero compact={compact} greetingText={greeting(fullName)} contextLabel={contextLabel}
                  suggestions={suggestions} sources={sources} onPick={ask} composer={compact ? null : composer}
                  actions={actions} onPickAction={pickAction} onMoreActions={openActionMenu} />
          </div>
        ) : (
          <div className={cn('flex flex-col gap-6', !compact && 'max-w-3xl mx-auto')}>
            {messages.map((m, i) => (
              m.role === 'user'
                ? <UserBubble key={i} text={m.content} />
                : <AnswerBlock key={i} msg={m} onAsk={ask} isLast={i === messages.length - 1} busy={busy}
                               onDraft={setDraft} />
            ))}
            {busy && <Thinking stage={STAGES[stage]} />}
          </div>
        )}
      </div>

      {(!empty || compact) && (
        <div className={cn('shrink-0', compact ? 'px-3 pb-3 pt-2' : 'pt-3 pb-1')}>
          <div className={cn(!compact && 'max-w-3xl mx-auto')}>
            {composer}
            <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
              <p className="flex items-center gap-1 text-[10px] text-text-muted">
                <Lock size={10} /> Reads only what you can open. Check the sources before relying on an answer.
              </p>
              {messages.length > 0 && (
                <button type="button" onClick={reset} disabled={busy}
                  className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary">
                  <RotateCcw size={10} /> New chat
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Portalled: the side panel is a glass layer (backdrop-filter), which
          would trap a fixed-position modal inside its 420px. */}
      {draft && createPortal(
        <AiPolicyCreateModal open={!!draft} onClose={() => setDraft(null)}
          initialIntent={draft.intent} initialFrameworks={draft.frameworks} />,
        document.body,
      )}
    </div>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Composer({ inputRef, value, onChange, onSend, busy, big, glitter, calm, placeholder, actions = [], onPickAction }) {
  // "/" menu: open while the box holds only "/" plus a filter word.
  const slash = /^\/(\S*)$/.exec(value)
  const query = slash ? slash[1].toLowerCase() : ''
  const matches = slash
    ? actions.filter(a => !query || [a.slash, a.label, a.description].some(t => String(t || '').toLowerCase().includes(query)))
    : []
  const menuOpen = !!slash && actions.length > 0
  const [hi, setHi] = useState(0)
  useEffect(() => { setHi(0) }, [query, menuOpen])

  const choose = (a) => { if (a) onPickAction?.(a) }
  const onKeyDown = (e) => {
    if (menuOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, Math.max(matches.length - 1, 0))); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); return }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); choose(matches[hi]); return }
      if (e.key === 'Escape')    { e.preventDefault(); onChange(''); return }
    }
    // Tab jumps to the next [blank] of an action template.
    if (e.key === 'Tab' && !e.shiftKey && /\[[^\]\n]+\]/.test(value)) {
      if (selectBlank(e.currentTarget, e.currentTarget.selectionEnd)) { e.preventDefault(); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
  }

  return (
    <div className="relative">
    {menuOpen && (
      <div role="listbox" aria-label="Actions"
        className="absolute bottom-full left-0 right-0 mb-2 z-30 rounded-card border border-border glass-overlay shadow-elevated p-1.5 animate-fade-in">
        <div className="flex items-center justify-between px-2 pt-0.5 pb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Actions</span>
          <span className="text-[10px] text-text-muted">↑↓ to move · Enter to choose · Esc to close</span>
        </div>
        {matches.length === 0 ? (
          <p className="px-2 py-2 text-xs text-text-muted">No action matches “{query}”.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto scroll-quiet flex flex-col gap-0.5">
            {matches.map((a, i) => {
              const Icon = actionIcon(a)
              return (
                <button key={a.key} type="button" role="option" aria-selected={i === hi}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => { e.preventDefault(); choose(a) }}
                  className={cn('w-full flex items-center gap-2.5 px-2 py-1.5 rounded-ctl text-left transition-colors',
                    i === hi ? 'bg-brand-500/10' : 'hover:bg-surface-overlay')}>
                  <span className="h-7 w-7 shrink-0 rounded-ctl ai-grad-soft text-brand-ink flex items-center justify-center"><Icon size={14} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-text-primary">{a.label}</span>
                      <span className="text-[10px] font-mono text-text-muted">/{a.slash}</span>
                    </span>
                    <span className="block text-[11px] text-text-secondary truncate">{a.description}</span>
                  </span>
                  {i === hi && <CornerDownLeft size={12} className="shrink-0 text-text-muted" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )}
    <div className={cn(
      'glass-card ai-ring flex items-end gap-2 rounded-modal shadow-elevated transition-shadow focus-within:shadow-hover',
      glitter ? 'ai-glitter' : 'ai-ring-soft',
      // In the side panel it sits beside someone's work, so the glitter runs
      // slower and softer until they type in it or an answer is coming.
      glitter && calm && !busy && 'ai-glitter-calm',
      !glitter && busy && 'ai-ring-spin',
      big ? 'p-3' : 'p-2')}>
      <textarea
        ref={inputRef}
        rows={big ? 2 : 1}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        aria-autocomplete="list" aria-expanded={menuOpen}
        placeholder={placeholder}
        className={cn('flex-1 resize-none bg-transparent px-2 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none',
          big ? 'text-base' : 'text-sm')}
        disabled={busy}
        maxLength={2000}
      />
      <button type="button" onClick={onSend} disabled={busy || !value.trim() || value.startsWith('/')} aria-label="Ask"
        className="h-9 w-9 shrink-0 rounded-full ai-grad ai-shadow text-brand-on flex items-center justify-center disabled:opacity-40 hover:brightness-110 transition">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={17} />}
      </button>
    </div>
    </div>
  )
}

function Hero({ compact, greetingText, contextLabel, suggestions, sources, onPick, composer, actions = [], onPickAction, onMoreActions }) {
  // A few actions only — the rest live in the "/" menu ("More actions").
  const shownActions = actions.slice(0, compact ? 2 : 3)
  const moreCount = actions.length - shownActions.length
  return (
    <div className={cn('flex flex-col animate-fade-in w-full', compact ? 'gap-4' : 'gap-4 max-w-3xl mx-auto')}>
      <div className={cn('flex flex-col', compact ? 'items-start gap-2' : 'items-center text-center gap-3')}>
        <span className="relative inline-flex">
          <span className="absolute -inset-6 rounded-full ai-aura" aria-hidden="true" />
          <AiOrb size={compact ? 44 : 56} state={compact ? 'greet' : 'hero'} className="relative" />
        </span>
        <div>
          <h2 className={cn('font-semibold ai-text', compact ? 'text-base' : 'text-3xl tracking-tight')}>{greetingText}</h2>
          <p className={cn('text-text-secondary', compact ? 'text-xs mt-0.5' : 'text-sm mt-1')}>
            {contextLabel
              ? `I can see ${contextLabel}. Ask me about it, or anything else in KashiGuard.`
              : 'Ask me about your compliance programme. Every answer links to the records it came from.'}
          </p>
        </div>
      </div>

      {composer}

      {!compact && sources.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 -mt-1">
          <span className="text-[11px] text-text-muted">I can read</span>
          {sources.map(s => (
            <Link key={s.key} to={s.route}
              className="text-[11px] px-2 py-0.5 rounded-badge bg-status-tag-bg text-status-tag-fg hover:text-brand-ink">
              {s.label}
            </Link>
          ))}
          <span className="text-[11px] px-2 py-0.5 rounded-badge bg-status-tag-bg text-status-tag-fg">Policy & framework text</span>
        </div>
      )}

      {shownActions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={cn('text-[10px] font-semibold uppercase tracking-wide text-text-muted', !compact && 'text-center')}>
            Things I can do
          </p>
          <div className={cn('flex flex-wrap gap-2', !compact && 'justify-center')}>
            {shownActions.map(a => {
              const Icon = actionIcon(a)
              return (
                <button key={a.key} type="button" onClick={() => onPickAction?.(a)} title={a.description}
                  className="group relative inline-flex items-center gap-2 h-8 pl-1.5 pr-3 rounded-full glass-card ai-ring ai-ring-soft ai-ring-hover-spin shadow-elevated hover:shadow-hover transition-all">
                  <span className="h-5 w-5 rounded-full ai-grad text-brand-on flex items-center justify-center"><Icon size={11} /></span>
                  <span className="text-xs font-medium text-text-primary">{a.label}</span>
                  <span className="text-[10px] font-mono text-text-muted group-hover:text-brand-ink">/{a.slash}</span>
                </button>
              )
            })}
            {/* Always offered: it opens the "/" menu, which lists everything
                (and teaches the shortcut). Names the count when some are hidden. */}
            <button type="button" onClick={onMoreActions}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-dashed border-border text-xs text-text-secondary hover:text-brand-ink hover:border-brand-500/40 transition-colors">
              {moreCount > 0 ? <MoreHorizontal size={13} /> : <Slash size={12} />}
              {moreCount > 0 ? `${moreCount} more` : 'All actions'}
            </button>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={cn('text-[10px] font-semibold uppercase tracking-wide text-text-muted', !compact && 'text-center')}>
            Try asking
          </p>
          <div className={cn('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
            {suggestions.slice(0, compact ? 4 : 6).map((s, i) => {
              const Icon = topicIcon(s)
              return (
                <button key={s} type="button" onClick={() => onPick(s)}
                  style={{ animationDelay: `${i * 60}ms` }}
                  // On shorter screens the full page shows four, so the empty
                  // state never needs a scrollbar.
                  className={cn('group glass-card animate-slide-up text-left flex items-center gap-2.5 rounded-card px-3 py-2 shadow-elevated hover:shadow-hover hover:ring-1 hover:ring-brand-500/40 transition-all',
                    // Only genuinely short screens drop to two questions (the
                    // "Things I can do" row takes a line). 800px was too
                    // cautious: a 1080p screen at 125% zoom is ~730px tall
                    // and still has room for all four.
                    !compact && i >= 4 && '[@media(max-height:960px)]:hidden',
                    !compact && i >= 2 && '[@media(max-height:680px)]:hidden')}>
                  <span className="h-7 w-7 shrink-0 rounded-ctl ai-grad-soft text-brand-ink flex items-center justify-center">
                    <Icon size={14} />
                  </span>
                  <span className="flex-1 text-xs text-text-secondary group-hover:text-text-primary leading-snug line-clamp-2">{s}</span>
                  <ArrowRight size={13} className="shrink-0 text-text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function UserBubble({ text }) {
  return (
    <div className="flex justify-end animate-fade-in">
      <div className="max-w-[85%] rounded-modal rounded-br-ctl ai-grad ai-shadow text-brand-on px-4 py-2.5 text-sm whitespace-pre-wrap">
        {text}
      </div>
    </div>
  )
}

function Thinking({ stage }) {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <AiOrb size={30} state="thinking" />
      <div className="flex-1 pt-1">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="font-semibold ai-text ai-text-shimmer">Thinking</span>
          <span className="flex items-center gap-0.5">
            {[0, 1, 2].map(i => (
              <span key={i} className="h-1 w-1 rounded-full bg-brand-fill motion-safe:animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </span>
          <span className="text-text-muted">{stage}…</span>
        </div>
        <div className="mt-2.5 flex flex-col gap-1.5">
          <span className="h-2.5 w-11/12 rounded-badge ai-grad-soft motion-safe:animate-pulse" />
          <span className="h-2.5 w-4/5 rounded-badge ai-grad-soft motion-safe:animate-pulse" />
          <span className="h-2.5 w-3/5 rounded-badge ai-grad-soft motion-safe:animate-pulse" />
        </div>
      </div>
    </div>
  )
}

function AnswerBlock({ msg, onAsk, isLast, busy, onDraft }) {
  const byLabel = useMemo(() => {
    const m = {}
    ;(msg.citations || []).forEach(c => { m[c.label] = c })
    return m
  }, [msg.citations])

  if (msg.error) {
    return (
      <div className="flex items-start gap-2 rounded-card bg-status-warn-bg px-3 py-2 text-xs text-status-warn-fg animate-fade-in">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {msg.content}
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 animate-slide-up">
      <AiOrb size={30} />
      <div className="min-w-0 flex-1 flex flex-col gap-3">
        <div className="text-sm text-text-primary leading-relaxed">
          <Markdown text={msg.content} byLabel={byLabel} />
        </div>

        {(msg.actions || []).map((a, i) => <ActionCard key={i} action={a} onDraft={onDraft} />)}

        {(msg.citations || []).length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Sources{(msg.consulted || []).length > 0 ? ` · looked in ${msg.consulted.join(', ')}` : ''}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {msg.citations.map(c => <SourceChip key={c.label} c={c} />)}
            </div>
          </div>
        )}

        {isLast && !busy && (msg.followUps || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {msg.followUps.map(f => (
              <button key={f} type="button" onClick={() => onAsk(f)}
                className="text-[11px] px-2.5 py-1 rounded-badge ai-grad-soft text-brand-ink hover:brightness-95 transition">
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** A proposed next step. Opens the real screen; nothing is created from here. */
function ActionCard({ action, onDraft }) {
  if (action?.type !== 'CREATE_POLICY') return null
  return (
    <div className="relative glass-inset ai-ring rounded-card p-3 flex items-start gap-3">
      <span className="h-9 w-9 shrink-0 rounded-ctl ai-grad ai-shadow text-brand-on flex items-center justify-center">
        <FilePlus2 size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">{action.title || 'New policy'}</p>
        <p className="text-xs text-text-secondary mt-0.5">
          Draft it with AI from your organisation profile. You review the details and controls before anything is created.
        </p>
        {(action.frameworks || []).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {action.frameworks.map(f => (
              <span key={f} className="text-[10px] px-1.5 py-0.5 rounded-badge bg-status-tag-bg text-status-tag-fg">{f}</span>
            ))}
          </div>
        )}
      </div>
      <button type="button" onClick={() => onDraft({ intent: action.intent, frameworks: action.frameworks || [] })}
        className="shrink-0 self-center flex items-center gap-1.5 rounded-ctl ai-grad ai-shadow px-3 py-1.5 text-xs font-medium text-brand-on hover:brightness-110 transition">
        Start draft <ArrowRight size={12} />
      </button>
    </div>
  )
}

function SourceChip({ c }) {
  const Icon = c.kind === 'RECORD' ? Database : FileText
  const text = `${c.type}${c.ref ? ` ${c.ref}` : ''}${c.title ? ` — ${c.title}` : ''}`
  const body = (
    <>
      <span className="font-mono text-[10px] text-brand-ink">{c.label}</span>
      <Icon size={11} className="shrink-0 text-text-muted" />
      <span className="truncate max-w-[220px]">{text}</span>
    </>
  )
  const cls = 'glass-card inline-flex items-center gap-1 rounded-ctl px-2 py-1 text-[11px] text-text-secondary'
  return c.url
    ? <Link to={c.url} className={cn(cls, 'hover:ring-1 hover:ring-brand-500/40 hover:text-brand-ink')} title={c.title}>{body}</Link>
    : <span className={cls} title={c.title}>{body}</span>
}

// ─── Minimal markdown: paragraphs, bullet and numbered lists, **bold**, `code`,
//     and [R1]/[S1] citation labels as links. No HTML is ever injected. ──────

function Markdown({ text, byLabel }) {
  const blocks = []
  let list = null
  const flush = () => { if (list) { blocks.push(list); list = null } }
  String(text || '').split('\n').forEach(raw => {
    const line = raw.trimEnd()
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const num    = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    if (bullet) {
      if (!list || list.type !== 'ul') { flush(); list = { type: 'ul', items: [] } }
      list.items.push(bullet[1])
    } else if (num) {
      if (!list || list.type !== 'ol') { flush(); list = { type: 'ol', items: [] } }
      list.items.push(num[2])
    } else if (!line.trim()) {
      flush()
    } else {
      flush()
      const h = line.match(/^#{1,4}\s+(.*)$/)
      blocks.push(h ? { type: 'h', text: h[1] } : { type: 'p', text: line })
    }
  })
  flush()

  return (
    <div className="flex flex-col gap-2">
      {blocks.map((b, i) => {
        if (b.type === 'ul') return <ul key={i} className="list-disc pl-5 flex flex-col gap-1 marker:text-brand-ink">{b.items.map((t, j) => <li key={j}><Inline text={t} byLabel={byLabel} /></li>)}</ul>
        if (b.type === 'ol') return <ol key={i} className="list-decimal pl-5 flex flex-col gap-1 marker:text-brand-ink">{b.items.map((t, j) => <li key={j}><Inline text={t} byLabel={byLabel} /></li>)}</ol>
        if (b.type === 'h')  return <p key={i} className="font-semibold"><Inline text={b.text} byLabel={byLabel} /></p>
        return <p key={i}><Inline text={b.text} byLabel={byLabel} /></p>
      })}
    </div>
  )
}

function Inline({ text, byLabel }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\[[RS]\d+\])/g)
  return parts.map((p, i) => {
    if (!p) return null
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="font-mono text-[12px] px-1 rounded-ctl bg-surface-overlay">{p.slice(1, -1)}</code>
    const lab = p.match(/^\[([RS]\d+)\]$/)
    if (lab) {
      const c = byLabel[lab[1]]
      const cls = 'mx-0.5 inline-flex items-center rounded-badge bg-brand-500/15 px-1.5 font-mono text-[10px] text-brand-ink align-middle'
      if (!c) return null      // a label the backend did not supply is dropped, not shown
      return c.url
        ? <Link key={i} to={c.url} className={cn(cls, 'hover:bg-brand-500/25')} title={`${c.type}${c.ref ? ' ' + c.ref : ''} — ${c.title || ''}`}>{lab[1]}</Link>
        : <span key={i} className={cls} title={c.title}>{lab[1]}</span>
    }
    return <Fragment key={i}>{p}</Fragment>
  })
}

export default AgentChat