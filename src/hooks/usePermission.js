import { useSelector } from 'react-redux'
import { selectPermissions, selectRoles, selectRoleSides } from '../store/slices/authSlice'

export const usePermission = () => {
  const permissions = useSelector(selectPermissions)
  const roles       = useSelector(selectRoles)
  const sides       = useSelector(selectRoleSides)

  return {
    hasPermission:  (code)   => permissions.includes(code),
    hasRole:        (name)   => roles.some(r => r.roleName === name),
    hasRoleSide:    (side)   => sides.includes(side),
    hasAnyRoleSide: (...ss)  => ss.some(s => sides.includes(s)),
    isSystem:       ()       => sides.includes('SYSTEM'),
    isOrg:          ()       => sides.includes('ORGANIZATION'),
    isVendor:       ()       => sides.includes('VENDOR'),
    userSides:      sides,
    permissions,
  }
}
