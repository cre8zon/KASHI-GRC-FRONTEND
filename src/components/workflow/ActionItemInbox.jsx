/**
 * ActionItemInbox — the action-item half of the combined inbox.
 *
 * ── WHY THIS IS A SECOND LIST AND NOT A MERGED ONE ────────────────────────
 *
 * A workflow task and an action item now resolve through the same function
 * (lib/inboxRoute) — that was the part worth unifying, because it was the part
 * that had drifted into four copies and forced every routing change to be made
 * four times.
 *
 * What is NOT worth merging is the rendering. TaskInbox carries inline Approve /
 * Reject / Send back buttons wired to the workflow action endpoint, with SoD
 * checks and remarks prompts behind them. An action item has none of that: it
 * is opened, worked and closed on its own screen. Merging the two lists would
 * mean one card component branching on kind for its buttons, its status
 * vocabulary and its empty state — a component that is two components wearing
 * one name.
 *
 * So: one page, one resolver, one sort order, two sections that each render
 * what they actually are. The person sees one inbox; the code does not pretend
 * two different things are the same thing.
 *
 * ── WHAT THIS UNLOCKS ─────────────────────────────────────────────────────
 * Anything that can raise an action item now has an inbox entry with a real
 * destination, without a workflow step behind it. That is the route for
 * item-level work that has no task today — an individual control, a single
 * test, one policy line — which is why the nav_key column matters more than
 * this list does.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOpenInTab } from '../../hooks/useOpenInTab'
import { useSelector } from 'react-redux'
import { ClipboardCheck } from 'lucide-react'
import api from '../../config/axios.config'
import { uiConfigApi } from '../../api/uiConfig.api'
import { selectAuth } from '../../store/slices/authSlice'
import { normaliseActionItem, sortInbox } from '../../lib/inboxRoute'
import { InboxRow } from './InboxRow'

const unwrap = (d) => {
  const body = d?.data ?? d
  const list = body?.data ?? body
  return Array.isArray(list) ? list : (Array.isArray(list?.content) ? list.content : [])
}


/**
 * @param filterFn  optional predicate on the RAW item, so the page's filter
 *                  bar can narrow this list the same way it narrows tasks.
 */
export function ActionItemInbox({ filterFn }) {
  // useOpenInTab, not useNavigate - see the note in useOpenInTab: an inbox
  // row is a link out, so it should focus the tab that already holds the
  // entity rather than open a second view of it.
  const openInTab  = useOpenInTab()
  const { userId } = useSelector(selectAuth)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inbox-action-items'],
    queryFn:  () => api.get('/v1/action-items/my'),
    select:   unwrap,
    staleTime: 60 * 1000,
  })

  const { data: navItems = [] } = useQuery({
    queryKey: ['ui-navigation'],
    queryFn:  () => uiConfigApi.navigation(),
    select:   unwrap,
    staleTime: 5 * 60 * 1000,
  })

  const entries = useMemo(() => {
    const raw = filterFn ? items.filter(filterFn) : items
    return sortInbox(raw.map(i => normaliseActionItem(i, navItems, userId)))
  }, [items, navItems, userId, filterFn])

  if (isLoading) {
    return <div className="px-4 py-6 text-center text-xs text-text-muted">Loading action items…</div>
  }

  if (!entries.length) {
    return (
      <div className="px-4 py-8 text-center">
        <ClipboardCheck size={18} className="mx-auto text-text-muted" />
        <p className="text-xs text-text-muted mt-2">No open action items</p>
      </div>
    )
  }

  // Renders through InboxRow, the same component the All tab uses. The two
  // tabs showing the same item with different amounts of information is how
  // people learn to distrust one of them.
  return (
    <div>
      {entries.map(e => (
        <InboxRow key={e.key} entry={e} onOpen={(x) => openInTab(x.route)} />
      ))}
    </div>
  )
}

export default ActionItemInbox