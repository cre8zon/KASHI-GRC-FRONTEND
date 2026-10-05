/**
 * useOpenEntityDrawer — open any record in a drawer over the current page.
 *
 * Drawers STACK. Opening a record from the page opens the first drawer;
 * opening a record from INSIDE a drawer (a control's Tests tab → a test) opens
 * a second drawer on top of it, and closing that one leaves the control's
 * drawer exactly where it was.
 *
 * ── URL SHAPE ────────────────────────────────────────────────────────────────
 *
 *   level 0   ?drawerType=AUDIT_CONTROL&drawerId=12&drawerTab=tests
 *   level 1+  &drawerStack=AUDIT_TEST:40,AUDIT_POLICY:7&drawerTab1=evidence&drawerTab2=…
 *
 * Level 0 keeps the params it always had, so every existing link and inbox
 * route (lib/inboxRoute.js, ui_navigation rows) still opens the same drawer.
 * Each level above has its own tab param — one shared ?drawerTab= would make
 * every drawer in the stack switch tabs together.
 *
 * Being URL state:
 *   • Back closes the top drawer (each open is pushed, not replaced)
 *   • a link or an inbox route can open a drawer directly
 *   • refresh restores the whole stack
 *
 * Which level a call opens is decided by EntityDrawerLevelContext, provided by
 * UniversalModulePage's URL drawers: no level (the page itself, or the list
 * view's own ?drawer= drawer) replaces the stack with a new first drawer; level
 * N opens level N+1 and drops anything that was above N.
 *
 * Opening a record that is already open BELOW in the stack (a test's "Mapped
 * controls" → the control whose drawer it was opened from) goes back to that
 * drawer instead of stacking a second copy of it.
 *
 * Inbox focus params (actionItemId, entityType, entityId, openWork) are cleared
 * when a new first drawer is opened — they described the record the user
 * arrived for, not the one they are opening now. They are KEPT when stacking:
 * they still describe the first drawer, which the user returns to.
 */
import { createContext, useCallback, useContext } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Level of the URL drawer a component renders in; null outside URL drawers. */
export const EntityDrawerLevelContext = createContext(null)

/** Most drawers open at once. Opening past it replaces the top one. */
export const MAX_DRAWER_LEVELS = 5

const STACK_KEY = 'drawerStack'
const INBOX_KEYS = ['actionItemId', 'entityType', 'entityId', 'openWork']

/** URL param holding the active tab of the drawer at {@code level}. */
export function drawerTabKey(level) {
  return level > 0 ? `drawerTab${level}` : 'drawerTab'
}

function parseStack(params) {
  const raw = params.get(STACK_KEY)
  if (!raw) return []
  return raw.split(',').map(part => {
    const i = part.indexOf(':')
    if (i <= 0) return null
    const type = part.slice(0, i).toUpperCase()
    let id = part.slice(i + 1)
    try { id = decodeURIComponent(id) } catch { /* keep as is */ }
    return type && id ? { type, id } : null
  }).filter(Boolean)
}

function writeStack(p, stack) {
  if (stack.length) p.set(STACK_KEY, stack.map(e => `${e.type}:${encodeURIComponent(e.id)}`).join(','))
  else p.delete(STACK_KEY)
}

/** Removes the tab params of every level from {@code fromLevel} upwards. */
function clearTabsFrom(p, fromLevel) {
  ;[...p.keys()].forEach(k => {
    if (k === 'drawerTab' && fromLevel <= 0) { p.delete(k); return }
    const m = /^drawerTab(\d+)$/.exec(k)
    if (m && Number(m[1]) >= fromLevel) p.delete(k)
  })
}

/**
 * Every open URL drawer, bottom first: [{ type, id, level, tabKey }].
 *
 * Level 0's id falls back to ?entityId= when ?entityType= equals ?drawerType=.
 * That is what lib/inboxRoute.js appends to every action-item route, so a
 * ui_navigation row only has to name the drawer TYPE and the tab — the id comes
 * from the item. The equality check is what keeps this from firing on
 * QUESTION_RESPONSE and every other route that appends entityType/entityId for
 * its own purposes.
 */
export function readDrawerLevels(params) {
  const type = (params.get('drawerType') || '').toUpperCase() || null
  const id = params.get('drawerId')
    || (type && (params.get('entityType') || '').toUpperCase() === type ? params.get('entityId') : null)
  if (!type || !id) return []
  return [{ type, id: String(id) }, ...parseStack(params)]
    .slice(0, MAX_DRAWER_LEVELS)
    .map((e, level) => ({ ...e, level, tabKey: drawerTabKey(level) }))
}

/** Params with the drawer at {@code level} — and everything above it — closed. */
export function closeDrawerLevel(prev, level) {
  const p = new URLSearchParams(prev)
  if (level <= 0) {
    const type = (p.get('drawerType') || '').toUpperCase()
    ;['drawerType', 'drawerId', STACK_KEY].forEach(k => p.delete(k))
    clearTabsFrom(p, 0)
    // The inbox focus params belong to the record that was in the drawer.
    if (type && (p.get('entityType') || '').toUpperCase() === type) {
      INBOX_KEYS.forEach(k => p.delete(k))
    }
    return p
  }
  writeStack(p, parseStack(p).slice(0, level - 1))
  clearTabsFrom(p, level)
  return p
}

export function useOpenEntityDrawer() {
  const [, setSearchParams] = useSearchParams()
  const fromLevel = useContext(EntityDrawerLevelContext)

  return useCallback((entityType, id, { tab } = {}) => {
    if (!entityType || id == null) return
    const type = String(entityType).toUpperCase()
    const key = String(id)

    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      const open = fromLevel == null ? [] : readDrawerLevels(p)

      // Opened from the page (or from a drawer that is no longer in the URL):
      // a fresh first drawer, replacing any stack.
      if (fromLevel == null || open.length === 0) {
        INBOX_KEYS.forEach(k => p.delete(k))
        p.delete(STACK_KEY)
        clearTabsFrom(p, 0)
        p.set('drawerType', type)
        p.set('drawerId', key)
        if (tab) p.set('drawerTab', tab)
        return p
      }

      const below = open.slice(0, Math.min(fromLevel, open.length - 1) + 1)

      // Already open below — go back to it rather than stacking a copy.
      const existing = below.find(e => e.type === type && e.id === key)
      if (existing) {
        writeStack(p, below.slice(1, existing.level + 1))
        clearTabsFrom(p, existing.level + 1)
        if (tab) p.set(existing.tabKey, tab)
        return p
      }

      // Stack it above the drawer it was opened from (replacing the top one
      // when the stack is full).
      const base = below.length >= MAX_DRAWER_LEVELS ? below.slice(0, MAX_DRAWER_LEVELS - 1) : below
      const level = base.length
      writeStack(p, [...base.slice(1), { type, id: key }])
      clearTabsFrom(p, level)
      if (tab) p.set(drawerTabKey(level), tab)
      return p
    }, { replace: false })
  }, [setSearchParams, fromLevel])
}

export default useOpenEntityDrawer