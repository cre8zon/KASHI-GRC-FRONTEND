import { useEffect, useMemo, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { X, Maximize2 } from 'lucide-react'
import { useNavigation } from '../../hooks/useUIConfig'
import { selectAuth } from '../../store/slices/authSlice'
import { AgentChat } from './AgentChat'
import { AiOrb } from './AiOrb'
import { cn } from '../../lib/cn'

/**
 * KashiGuard AI as a slide-out panel, on every page except /ai itself.
 *
 * On a record page it knows which record is open: the current route is sent
 * with each question, and the backend reads that record (if this user can) as
 * the conversation's subject — "who owns this?", "is this overdue?".
 *
 * Shown only when the user's navigation includes the KashiGuard AI entry, so
 * removing or gating that row in Navigation hides the panel as well. Vendor
 * users never see it.
 */

const NAV_KEY = 'kashiguard_ai'
const OPEN_EVENT = 'kashiguard-ai:open'

/** Shared gate: the user's menu has KashiGuard AI, and they are not a vendor user. */
function useAgentEnabled() {
  const { vendorId } = useSelector(selectAuth)
  const { data: navItems = [] } = useNavigation()
  return useMemo(() => !vendorId && hasNavKey(navItems, NAV_KEY), [navItems, vendorId])
}

/**
 * The page -> how the assistant refers to it.
 *   record page (/module/risk/12)  -> "this risk"   (that record is read first)
 *   list page   (/module/incident) -> "your incidents" (that register is searched)
 * Anything else -> null: the assistant is still available, just without a subject.
 */
const REGISTERS = {
  risk: ['this risk', 'your risks'], risks: ['this risk', 'your risks'],
  issue: ['this issue', 'your issues'], issues: ['this issue', 'your issues'],
  incident: ['this incident', 'your incidents'], incidents: ['this incident', 'your incidents'],
  asset: ['this asset', 'your assets'], assets: ['this asset', 'your assets'],
  exception: ['this exception', 'your exceptions'], exception_record: ['this exception', 'your exceptions'],
  exceptions: ['this exception', 'your exceptions'],
  audit_policy: ['this policy', 'your policies'],
  vendor: ['this vendor', 'your vendors'], vendors: ['this vendor', 'your vendors'],
}
function recordLabel(pathname) {
  const m = pathname.match(/^\/module\/([a-z_]+)(?:\/(\d+))?\/?$/) || pathname.match(/^\/tprm\/(vendors)(?:\/(\d+))?\/?$/)
  if (!m || !REGISTERS[m[1]]) return null
  return REGISTERS[m[1]][m[2] ? 0 : 1]
}

function hasNavKey(items, key) {
  for (const n of items || []) {
    if (n.navKey === key) return true
    if (hasNavKey(n.children, key)) return true
  }
  return false
}

export function AgentPanel() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const enabled = useAgentEnabled()
  const label = recordLabel(pathname)

  // Opened from the top-bar button (AiLauncherButton), which lives in TopNav.
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])
  // Stays open across navigation (e.g. clicking a source link): the
  // "Looking at" label and the record context follow the new page by
  // themselves, since both come from the current route.

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!enabled || !open || pathname === '/ai' || pathname.startsWith('/ai/')) return null

  return (
    <aside role="dialog" aria-label="KashiGuard AI"
      // The panel's own gradient border stays still while you read, and turns
      // only while an answer is being written — motion that means something.
      className={cn('fixed top-2 bottom-2 right-2 z-50 w-[440px] max-w-[calc(100vw-1rem)] glass-overlay ai-ring rounded-modal shadow-overlay flex flex-col animate-slide-up',
        busy && 'ai-ring-spin')}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-subtle shrink-0 ai-grad-soft rounded-t-modal">
        <div className="flex items-center gap-2.5 min-w-0">
          <AiOrb size={34} />
          <div className="min-w-0">
            <p className="text-sm font-semibold ai-text leading-tight">KashiGuard AI</p>
            {label ? (
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-badge bg-status-tag-bg px-2 py-0.5 text-[10px] text-status-tag-fg">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-fill" /> Looking at {label}
              </span>
            ) : (
              <p className="text-[11px] text-text-muted">Answers from your own records</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link to="/ai" onClick={() => setOpen(false)} title="Open full page"
            className="h-7 w-7 flex items-center justify-center rounded-ctl text-text-muted hover:text-text-primary hover:bg-surface-overlay">
            <Maximize2 size={13} />
          </Link>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close"
            className="h-7 w-7 flex items-center justify-center rounded-ctl text-text-muted hover:text-text-primary hover:bg-surface-overlay">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <AgentChat compact contextRoute={pathname} contextLabel={label} onBusyChange={setBusy} />
      </div>
    </aside>
  )
}

/**
 * "Ask AI" in the top bar, beside notifications — where product tools live,
 * never over page content. On a record page it says what it will look at.
 * On /ai itself it is hidden: the page is the assistant.
 */
export function AiLauncherButton() {
  const { pathname } = useLocation()
  const enabled = useAgentEnabled()
  if (!enabled || pathname === '/ai' || pathname.startsWith('/ai/')) return null
  const label = recordLabel(pathname)
  return (
    <button type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      title={label ? `Ask KashiGuard AI about ${label}` : 'Ask KashiGuard AI'}
      aria-label={label ? `Ask KashiGuard AI about ${label}` : 'Ask KashiGuard AI'}
      // ai-launch (ai-effects.css): on hover the button lifts and glows, the
      // gradient border spins, the orb's halo speeds up and the label
      // shimmers. "Ask AI" opens out to "Ask KashiGuard AI", plus what it will
      // look at on this page — "about this policy", "about your incidents".
      className="group relative glass-button ai-ring ai-ring-soft ai-launch h-8 flex items-center gap-1.5 rounded-full pl-1 pr-3 focus-visible:outline-none">
      <AiOrb size={24} state="greet" />
      {/* Two labels in one clipped slot. The slot widens smoothly while the
          short label fades out and the full one fades in — each label is its
          own gradient-text element, so nothing re-flows inside the gradient. */}
      <span className="relative block overflow-hidden whitespace-nowrap text-xs font-semibold leading-8 max-w-[2.55rem] transition-[max-width] duration-300 ease-out group-hover:max-w-[17rem] group-focus-visible:max-w-[17rem]">
        {/* The full label is in flow, so it sets the width the slot opens to;
            the short one sits on top of it while collapsed. */}
        <span className="block ai-text opacity-0 transition-opacity duration-200 delay-100 group-hover:opacity-100 group-focus-visible:opacity-100">
          Ask KashiGuard AI{label ? ` about ${label}` : ''}
        </span>
        <span className="absolute left-0 top-0 ai-text transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0">Ask AI</span>
      </span>
    </button>
  )
}

export default AgentPanel