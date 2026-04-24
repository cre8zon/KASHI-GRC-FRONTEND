import { useState, useRef, useEffect } from 'react'
import { Bell, ChevronDown, LogOut, User, Settings, Menu } from 'lucide-react'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import { useLogout } from '../../hooks/useAuth'
import { useNotifications, useMarkRead } from '../../hooks/useNotifications'
import { useNavigate } from 'react-router-dom'
import { initials, formatDateTime } from '../../utils/format'
import { cn } from '../../lib/cn'

export function TopNav({ onMenuToggle }) {
  const { fullName, email } = useSelector(selectAuth)
  const { mutate: doLogout } = useLogout()
  const navigate = useNavigate()
  const [showUser, setShowUser]  = useState(false)
  const { data: notifData } = useNotifications({ read: false })
  const { mutate: markRead } = useMarkRead()
  const notifications = notifData?.items || []
  const unread = notifications.filter(n => !n.readAt).length

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-surface shrink-0">
      <div className="flex items-center gap-3">
        <button onClick={onMenuToggle} className="text-text-muted hover:text-text-primary transition-colors">
          <Menu size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Notifications — navigate to dedicated page */}
        <button
          onClick={() => navigate('/notifications')}
          className="relative h-8 w-8 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
        >
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 h-4 w-4 bg-brand-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {/* User */}
        <div className="relative">
          <button
            onClick={() => setShowUser(o => !o)}
            className="flex items-center gap-2 h-8 px-2 rounded-md hover:bg-surface-overlay transition-colors"
          >
            <div className="h-6 w-6 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-[10px] font-bold text-brand-300">
              {initials(fullName)}
            </div>
            <span className="text-xs text-text-secondary hidden sm:block">{fullName}</span>
            <ChevronDown size={12} className="text-text-muted" />
          </button>
          {showUser && (
            <div className="absolute right-0 top-10 w-52 bg-surface-raised border border-border rounded-lg shadow-elevated z-50 py-1 animate-slide-up">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs font-medium text-text-primary truncate">{fullName}</p>
                <p className="text-xs text-text-muted truncate">{email}</p>
              </div>
              {[
                { icon: User,     label: 'Profile',  action: () => navigate('/settings/profile') },
                { icon: Settings, label: 'Settings', action: () => navigate('/settings') },
                { icon: LogOut,   label: 'Log out',  action: doLogout, danger: true },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={() => { item.action(); setShowUser(false) }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-surface-overlay',
                    item.danger ? 'text-red-400 hover:text-red-300' : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  <item.icon size={14} />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function NotifDropdown({ notifications, onClose, onMarkRead }) {
  const ref = useRef()
  useEffect(() => {
    const fn = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [onClose])

  return (
    <div ref={ref} className="absolute right-0 top-10 w-80 bg-surface-raised border border-border rounded-lg shadow-elevated z-50 animate-slide-up">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-text-primary">Notifications</span>
        {notifications.length > 0 && (
          <button onClick={() => notifications.forEach(n => !n.readAt && onMarkRead(n.notificationId))}
            className="text-xs text-brand-400 hover:text-brand-300">Mark all read</button>
        )}
      </div>
      <div className="max-h-72 overflow-y-auto">
        {notifications.length === 0
          ? <p className="py-8 text-center text-xs text-text-muted">All caught up!</p>
          : notifications.slice(0, 10).map(n => (
            <div key={n.notificationId}
              className={cn('px-3 py-2.5 border-b border-border/50 cursor-pointer hover:bg-surface-overlay transition-colors', !n.readAt && 'bg-brand-500/5')}
              onClick={() => onMarkRead(n.notificationId)}
            >
              <p className={cn('text-xs', !n.readAt ? 'text-text-primary font-medium' : 'text-text-secondary')}>{n.message}</p>
              <p className="text-[10px] text-text-muted mt-0.5 font-mono">{formatDateTime(n.sentAt)}</p>
            </div>
          ))
        }
      </div>
    </div>
  )
}