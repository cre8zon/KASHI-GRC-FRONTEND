/**
 * roleAccessJson — shared helper for resolving per-role, per-tab/action visibility.
 *
 * Shape stored on ui_layouts.role_access_json (and ui_layouts.list variant):
 *
 *   {
 *     "ORGANIZATION": true,                     // whole-side allow (legacy, still supported)
 *     "AUDITEE": false,                          // whole-side block (legacy, still supported)
 *     "33": { "tabs": { "controls": false } },   // role id 33: block one tab, rest default-allowed
 *     "35": { "actions": { "RAISE_FINDING": false } }
 *   }
 *
 * Resolution rules (all data-driven — no hardcoded role/side names here):
 *   1. If there's no entry for the user's side AND no entry for any of the user's role ids
 *      → default ALLOW (screens with nothing configured behave exactly as before today).
 *   2. A boolean entry (legacy whole-screen toggle) short-circuits: false = hide everything
 *      under that key, true = allow everything (unless a more specific role entry overrides it).
 *   3. An object entry's `tabs`/`actions` map is consulted by key. Missing key inside an
 *      existing map still defaults to allowed — you only need to list what you want blocked.
 *   4. Role-level entries take precedence over side-level entries when both exist, since
 *      role is the more specific scope.
 */

export function parseRoleAccessJson(raw) {
  if (!raw) return {}
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * @param {object} roleAccess  parsed roleAccessJson
 * @param {string} side        current user's side, e.g. 'AUDITOR'
 * @param {number[]} roleIds   current user's role ids
 * @param {'tabs'|'actions'} scope
 * @param {string} itemKey     tab key or actionKey to check
 * @returns {boolean} whether the item should be visible
 */
export function isItemAllowed(roleAccess, side, roleIds, scope, itemKey) {
  if (!roleAccess || Object.keys(roleAccess).length === 0) return true

  // Role-level entries are most specific — check all of the user's roles.
  // If ANY assigned role explicitly allows it, that wins (most-permissive-role model,
  // matching how permission grants already work elsewhere in the platform).
  let sawRoleEntry = false
  for (const rid of roleIds || []) {
    const entry = roleAccess[String(rid)]
    if (entry === undefined) continue
    sawRoleEntry = true
    if (typeof entry === 'boolean') {
      if (entry) return true
      continue // this role blocks the whole screen — keep checking other roles
    }
    const map = entry?.[scope]
    if (map && Object.prototype.hasOwnProperty.call(map, itemKey)) {
      if (map[itemKey]) return true
      continue
    }
    // Role entry exists but doesn't mention this item/scope → falls through to allowed
    return true
  }
  if (sawRoleEntry) return false // every matching role entry explicitly blocked it

  // Side-level entry (legacy / coarse) — only consulted if no role-level entry matched.
  const sideEntry = side ? roleAccess[side] : undefined
  if (sideEntry === undefined) return true // nothing configured for this side → default allow
  if (typeof sideEntry === 'boolean') return sideEntry
  const sideMap = sideEntry?.[scope]
  if (sideMap && Object.prototype.hasOwnProperty.call(sideMap, itemKey)) {
    return !!sideMap[itemKey]
  }
  return true
}

export function isTabAllowed(roleAccess, side, roleIds, tabKey) {
  return isItemAllowed(roleAccess, side, roleIds, 'tabs', tabKey)
}

export function isActionAllowed(roleAccess, side, roleIds, actionKey) {
  return isItemAllowed(roleAccess, side, roleIds, 'actions', actionKey)
}