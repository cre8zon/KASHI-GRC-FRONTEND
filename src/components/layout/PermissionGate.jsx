import { usePermission } from '../../hooks/usePermission'
import { useSelector } from 'react-redux'
import { selectFlag } from '../../store/slices/uiConfigSlice'

/** Renders children only if user has the required permission code */
export function PermissionGate({ permission, children, fallback = null }) {
  const { hasPermission } = usePermission()
  return hasPermission(permission) ? children : fallback
}

/** Renders children only if user has one of the given role sides */
export function RoleSideGate({ sides = [], children, fallback = null }) {
  const { hasAnyRoleSide } = usePermission()
  return hasAnyRoleSide(...sides) ? children : fallback
}

/** Renders children only if the feature flag is enabled */
export function FeatureGate({ flagKey, children, fallback = null }) {
  const enabled = useSelector(selectFlag(flagKey))
  return enabled ? children : fallback
}
