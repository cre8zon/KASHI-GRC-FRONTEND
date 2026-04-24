import { store } from '../store'

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
