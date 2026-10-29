/**
 * Page tabs — the tabs a page has, from ui_navigation.tab_parent_key.
 *
 * A row with tab_parent_key = 'module_vendor' is a tab on the Vendors page
 * (the row whose navKey is module_vendor), not a sidebar entry. The page's own
 * row is the first tab, under its own label; its tab rows follow in sort
 * order. Each page has its own set, so Vendors and Vendor Assessments in the
 * same sidebar section keep separate tabs. Rows without the column set are
 * untouched — a page with no tab rows shows no tab strip.
 *
 *   pageTabsFor(items, location) → null, or
 *     { parent, tabs: [{navKey, label, icon, route}], activeKey, listLevel }
 *   listLevel: the URL IS one of the tab pages (a list or dashboard), not a
 *   record beneath one — the strip shows only then.
 */
import { resolveNav } from './navRoute'

function flatten(items, out = []) {
  for (const i of items || []) {
    out.push(i)
    if (i.children?.length) flatten(i.children, out)
  }
  return out
}

const pathOf = (route) => String(route || '').split('?')[0].replace(/\/+$/, '') || '/'
const active = (r) => r && r.isActive !== false && r.isActive !== 0

/** The rows shown as tabs of `parentKey`, in sort order. */
export function tabRowsOf(rows, parentKey) {
  return rows
    .filter(r => r.tabParentKey === parentKey && active(r) && r.route)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

export function pageTabsFor(items = [], location) {
  const nav = resolveNav(items, location)
  if (!nav?.navKey) return null
  const rows = flatten(items)
  const parent = rows.find(r => r.navKey === nav.navKey)
  if (!parent?.route) return null
  const tabRows = tabRowsOf(rows, parent.navKey)
  if (!tabRows.length) return null

  const tabs = [parent, ...tabRows].map(r => ({ navKey: r.navKey, label: r.label, icon: r.icon || null, route: r.route }))
  const activeKey = tabs.some(t => t.navKey === nav.matchedKey) ? nav.matchedKey : null
  const activeRow = tabs.find(t => t.navKey === activeKey)
  return {
    parent: tabs[0],
    tabs,
    activeKey,
    listLevel: !!activeRow && pathOf(activeRow.route) === pathOf(location?.pathname),
  }
}
