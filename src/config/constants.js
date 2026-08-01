export const ROLE_SIDES = {
  SYSTEM: 'SYSTEM', ORGANIZATION: 'ORGANIZATION',
  VENDOR: 'VENDOR', AUDITEE: 'AUDITEE', AUDITOR: 'AUDITOR',
}
export const COLOR_MAP = {
  red:    'bg-status-fail-bg text-status-fail-fg',
  amber:  'bg-status-warn-bg text-status-warn-fg',
  yellow: 'bg-status-warn-bg text-status-warn-fg',
  green:  'bg-status-pass-bg text-status-pass-fg',
  blue:   'bg-status-info-bg text-status-info-fg',
  indigo: 'bg-status-tag-bg text-status-tag-fg',
  purple: 'bg-status-tag-bg text-status-tag-fg',
  cyan:   'bg-status-info-bg text-status-info-fg',
  gray:   'bg-status-pending-bg text-status-pending-fg',
}
export const QUERY_KEYS = {
  BOOTSTRAP:     ['bootstrap'],
  NAVIGATION:    ['navigation'],
  SCREEN:        (key) => ['screen-config', key],
  FORM:          (key) => ['form-config', key],
  ACTIONS:       (screen, status) => ['actions', screen, status],
  DASHBOARD:     ['dashboard-widgets'],
  BRANDING:      ['branding'],
  USERS:         ['users'],
  VENDORS:       ['vendors'],
  WORKFLOWS:     ['workflows'],
  MY_TASKS:      ['my-tasks'],
  ASSESSMENTS:   ['assessments'],
  NOTIFICATIONS: ['notifications'],
}
