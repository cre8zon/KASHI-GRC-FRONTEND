/**
 * ServerStatusBanner.jsx
 *
 * Persistent top-of-app banner that appears when the backend is unreachable.
 * Inspired by: Linear (minimal bar), Vercel (clear status + retry),
 *              Notion (auto-dismiss on reconnect with success flash).
 *
 * Behaviour:
 *   - Slides down smoothly when server goes down
 *   - Shows status type (offline vs server_down vs degraded) with distinct copy
 *   - Countdown to next auto-retry
 *   - Manual "Retry now" button
 *   - Auto-dismisses with a 2s green "Reconnected" flash when back online
 *   - Does NOT block the page — content stays visible underneath
 *
 * Place at: src/components/ui/ServerStatusBanner.jsx
 */
import { useState, useEffect } from 'react'
import { Wifi, WifiOff, ServerCrash, AlertTriangle, RefreshCw, CheckCircle2, X } from 'lucide-react'
import { cn } from '../../lib/cn'

const CONFIG = {
  offline: {
    icon:    WifiOff,
    color:   'bg-slate-800 border-slate-700',
    dot:     'bg-slate-400',
    title:   'No internet connection',
    detail:  'Check your network and we\'ll reconnect automatically.',
  },
  server_down: {
    icon:    ServerCrash,
    color:   'bg-red-950/90 border-red-900/60',
    dot:     'bg-red-400',
    title:   'Server unreachable',
    detail:  'The backend is not responding. It may be restarting or deploying.',
  },
  degraded: {
    icon:    AlertTriangle,
    color:   'bg-amber-950/90 border-amber-900/60',
    dot:     'bg-amber-400',
    title:   'Slow connection',
    detail:  'Responses are taking longer than usual. Some actions may be delayed.',
  },
  online: null,
}

export function ServerStatusBanner({ status, retryNow, nextRetryIn, retryCount }) {
  const [visible,       setVisible]       = useState(false)
  const [showSuccess,   setShowSuccess]   = useState(false)
  const [dismissed,     setDismissed]     = useState(false)
  const [retrying,      setRetrying]      = useState(false)
  const [prevStatus,    setPrevStatus]    = useState(status)

  // Detect transition back to online
  useEffect(() => {
    if (prevStatus !== 'online' && status === 'online') {
      setShowSuccess(true)
      setDismissed(false)
      const t = setTimeout(() => {
        setShowSuccess(false)
        setVisible(false)
      }, 2_500)
      return () => clearTimeout(t)
    }
    if (status !== 'online') {
      setVisible(true)
      setDismissed(false)
      setShowSuccess(false)
    }
    setPrevStatus(status)
  }, [status])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = async () => {
    setRetrying(true)
    await retryNow()
    setRetrying(false)
  }

  // Nothing to show
  if ((!visible && !showSuccess) || dismissed) return null

  // ── Reconnected success flash ─────────────────────────────────────────────
  if (showSuccess) {
    return (
      <div className={cn(
        'w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium',
        'bg-green-950/90 border-b border-green-900/50 text-green-300',
        'animate-in slide-in-from-top-2 duration-300'
      )}>
        <CheckCircle2 size={14} className="text-green-400 shrink-0" />
        Reconnected — syncing your data
        <span className="ml-1 text-green-500 text-xs animate-pulse">●</span>
      </div>
    )
  }

  const cfg = CONFIG[status]
  if (!cfg) return null
  const Icon = cfg.icon

  return (
    <div className={cn(
      'w-full flex items-center gap-3 px-4 py-2.5 border-b text-sm backdrop-blur-sm',
      'animate-in slide-in-from-top-2 duration-300',
      cfg.color
    )}>
      {/* Pulsing dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', cfg.dot)} />
        <span className={cn('relative inline-flex rounded-full h-2 w-2', cfg.dot)} />
      </span>

      <Icon size={14} className="text-white/60 shrink-0" />

      {/* Message */}
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-white/90">{cfg.title}</span>
        <span className="text-white/50 text-xs hidden sm:inline">{cfg.detail}</span>
      </div>

      {/* Retry info + button */}
      <div className="flex items-center gap-3 shrink-0">
        {nextRetryIn > 0 && !retrying && (
          <span className="text-xs text-white/40 hidden sm:inline">
            Retrying in {nextRetryIn}s
          </span>
        )}
        {retryCount > 3 && (
          <span className="text-[10px] text-white/30 hidden md:inline">
            Attempt {retryCount}
          </span>
        )}
        <button
          onClick={handleRetry}
          disabled={retrying}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all',
            'bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/10',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <RefreshCw size={11} className={cn(retrying && 'animate-spin')} />
          {retrying ? 'Checking…' : 'Retry now'}
        </button>

        {/* Dismiss — only for degraded, not for down/offline */}
        {status === 'degraded' && (
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * QueryErrorBoundary — wraps individual page data sections.
 * Shows a compact inline error state when a query fails,
 * instead of the misleading "No items found" empty state.
 *
 * Usage:
 *   const { data, error, isError, isLoading, refetch } = useQuery(...)
 *   if (isError) return <QueryError error={error} onRetry={refetch} />
 */
export function QueryError({ error, onRetry, compact = false }) {
  const isNetwork = !error?.code || error?.code === 'NETWORK_ERROR' || error?.code === 'ERR_NETWORK'
  const isTimeout = error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')

  const title = isNetwork || isTimeout
    ? 'Could not load data'
    : error?.message || 'Something went wrong'

  const detail = isNetwork
    ? 'The server is not responding. Check your connection and try again.'
    : isTimeout
    ? 'The request timed out. The server may be under load.'
    : 'An unexpected error occurred loading this section.'

  if (compact) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 text-xs text-red-400">
        <ServerCrash size={13} className="shrink-0" />
        <span>{title}</span>
        {onRetry && (
          <button onClick={onRetry}
            className="ml-auto text-xs text-text-muted hover:text-text-primary underline underline-offset-2">
            Retry
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <ServerCrash size={20} className="text-red-400" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-xs text-text-muted mt-1 max-w-xs">{detail}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors mt-1">
          <RefreshCw size={11} />
          Try again
        </button>
      )}
    </div>
  )
}