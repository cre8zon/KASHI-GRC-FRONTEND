import { store } from '../store'

/**
 * The one reserved tenant that SYSTEM-side (platform admin) users belong
 * to — "Kashi System Tenant". Mirrors Constants.SYSTEM_TENANT_ID on the
 * backend, which enforces the same rule server-side. side=SYSTEM is only
 * ever valid for this tenant; no other tenant may be associated with it.
 */
export const SYSTEM_TENANT_ID = 1

export const hasPermission = (permCode) => {
  const { permissions } = store.getState().auth
  return permissions.includes(permCode)
}

export const hasRoleSide = (side) => {
  const { roles } = store.getState().auth
  return roles.some(r => r.side === side)
}

export const hasAnyRoleSide = (...sides) => {
  const { roles } = store.getState().auth
  const userSides = new Set(roles.map(r => r.side))
  return sides.some(s => userSides.has(s))
}

export const isSystemUser = () => hasRoleSide('SYSTEM')
export const isOrgUser    = () => hasRoleSide('ORGANIZATION')
export const isVendorUser = () => hasRoleSide('VENDOR')
