/**
 * TabBar.jsx — Chrome-style tab bar that sits between TopNav and main content.
 * Place at: src/components/layout/TabBar.jsx
 *
 * Features:
 *  - Click to activate, × to close
 *  - Middle-click to close
 *  - Right-click context menu (Close, Close Others, Close to Right)
 *  - Ctrl+W closes active tab
 *  - Ctrl+Tab / Ctrl+Shift+Tab cycles tabs
 *  - Overflow scrolls horizontally (no tab wrapping)
 *  - New tab button (+)
 *  - Favicon/icon per tab
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { X, Plus, LayoutDashboard } from 'lucide-react'
import * as Icons from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  selectTabs, selectActiveTabId,
  activateTab, closeTab, openTab, newTab,
  closeOtherTabs, closeTabsToRight,
} from '../../store/slices/tabsSlice'

function TabIcon({ name, size = 12 }) {
  const Icon = (name && Icons[name]) || LayoutDashboard
  return <Icon size={size} strokeWidth={1.75} />
}

// Context menu
function ContextMenu({ x, y, tab, onClose }) {
  const dispatch = useDispatch()
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const items = [
    { label: 'Close tab',           action: () => dispatch(closeTab(tab.id)),          disabled: tab.isPinned },
    { label: 'Close other tabs',    action: () => dispatch(closeOtherTabs(tab.id)) },
    { label: 'Close tabs to right', action: () => dispatch(closeTabsToRight(tab.id)) },
  ]

  return (
    <div ref={ref}
      className="fixed z-[200] min-w-[180px] rounded-card border border-border bg-surface-raised shadow-elevated py-1 text-sm"
      style={{ left: x, top: y }}>
      {items.map((item, i) => (
        <button key={i}
          disabled={item.disabled}
          onClick={() => { item.action(); onClose() }}
          className={cn(
            'w-full text-left px-3 py-1.5 text-xs transition-colors',
            item.disabled
              ? 'text-text-muted cursor-not-allowed'
              : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
          )}>
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function TabBar() {
  const dispatch    = useDispatch()
  const tabs        = useSelector(selectTabs)
  const activeTabId = useSelector(selectActiveTabId)
  const scrollRef   = useRef(null)
  const [ctxMenu, setCtxMenu] = useState(null)  // { x, y, tab }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Ctrl+W — close active tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        dispatch(closeTab(activeTabId))
      }
      // Ctrl+Tab — next tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        const idx  = tabs.findIndex(t => t.id === activeTabId)
        const next = tabs[(idx + 1) % tabs.length]
        dispatch(activateTab(next.id))
      }
      // Ctrl+Shift+Tab — previous tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        const idx  = tabs.findIndex(t => t.id === activeTabId)
        const prev = tabs[(idx - 1 + tabs.length) % tabs.length]
        dispatch(activateTab(prev.id))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tabs, activeTabId, dispatch])

  // Scroll active tab into view when it changes
  useEffect(() => {
    const el = scrollRef.current?.querySelector(`[data-tab-id="${activeTabId}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [activeTabId])

  const handleContextMenu = useCallback((e, tab) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, tab })
  }, [])

  return (
    <>
      <div className="flex items-stretch h-9 shrink-0 select-none px-2 gap-1 mt-1">
        {/* Scrollable tab list */}
        <div ref={scrollRef}
          className="flex items-stretch flex-1 min-w-0 overflow-x-auto overflow-y-hidden"
          style={{ scrollbarWidth: 'none' }}>
          {tabs.map(tab => {
            const isActive = tab.id === activeTabId
            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                onMouseDown={(e) => {
                  if (e.button === 1) { e.preventDefault(); dispatch(closeTab(tab.id)) }
                  else if (e.button === 0) dispatch(activateTab(tab.id))
                }}
                onContextMenu={(e) => handleContextMenu(e, tab)}
                className={cn(
                  'group relative flex items-center gap-1.5 px-3 h-full min-w-0 max-w-[180px] shrink-0',
                  'cursor-pointer transition-all duration-150 text-xs font-medium',
                  'rounded-t-card',
                  isActive
                    // Active tab is frosted glass to match the content card
                    // below it — a solid tab on a translucent card looked
                    // disconnected. Now they read as one continuous surface.
                    ? 'glass-card text-text-primary shadow-elevated'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-raised/40'
                )}
              >
                {/* Tab icon */}
                <span className={cn('shrink-0', isActive ? 'text-brand-ink' : 'text-text-muted')}>
                  <TabIcon name={tab.icon} size={12} />
                </span>

                {/* Tab title */}
                <span className="flex-1 truncate min-w-0">{tab.title}</span>

                {/* Close button — hidden for pinned, shown on hover/active */}
                {!tab.isPinned && (
                  <button
                    onMouseDown={(e) => { e.stopPropagation(); dispatch(closeTab(tab.id)) }}
                    className={cn(
                      'shrink-0 w-4 h-4 flex items-center justify-center rounded',
                      'transition-colors hover:bg-surface-overlay',
                      isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100'
                    )}>
                    <X size={10} />
                  </button>
                )}
              </div>
            )
          })}
          {/* New tab button — inline after last tab */}
          <button
            onClick={() => dispatch(newTab({ route: '/dashboard', title: 'Dashboard', icon: 'LayoutDashboard' }))}
            className="shrink-0 w-8 h-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors border-r border-border/50"
            title="New tab">
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} tab={ctxMenu.tab}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  )
}