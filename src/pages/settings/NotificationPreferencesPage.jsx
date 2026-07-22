import { useMemo } from 'react'
import { BellRing, Mail, RotateCcw, Info } from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card, CardBody } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/EmptyState'
import { Badge } from '../../components/ui/Badge'
import { cn } from '../../lib/cn'
import { EVENT_GROUPS, ALL_EVENTS_KEY } from '../../config/notificationEvents'
import {
  useMyNotificationPreferences,
  useUpsertNotificationPreference,
  useResetNotificationPreference,
} from '../../hooks/useNotificationPreferences'

/**
 * NotificationPreferencesPage — the user's email opt-out matrix.
 * Route MUST stay /settings/notifications: emails link here via
 * the {{preferencesUrl}} footer variable.
 *
 * Model mirrors the backend exactly: no row = enabled; a specific
 * eventKey row wins over the 'ALL' row; resolution is fail-open.
 * The in-app bell is always on (system of record) — only email is
 * configurable for now.
 */

function Toggle({ checked, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-brand-500' : 'bg-surface-overlay border border-border',
        disabled && 'opacity-50 cursor-not-allowed',
      )}>
      <span className={cn(
        'inline-block h-3.5 w-3.5 rounded-full bg-surface-raised shadow transform transition-transform',
        checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
      )} />
    </button>
  )
}

/**
 * NotificationsTab — the preferences UI without page chrome, so it can render
 * inside Settings as a tab. The standalone page below wraps this in PageLayout
 * for the /settings/notifications route that emails link to.
 */
export function NotificationsTab() {
  const { data, isLoading } = useMyNotificationPreferences()
  const { mutate: upsert }  = useUpsertNotificationPreference()
  const { mutate: reset }   = useResetNotificationPreference()

  const rows = Array.isArray(data) ? data : []
  const byKey = useMemo(() => Object.fromEntries(rows.map(r => [r.eventKey, r])), [rows])

  const allRow          = byKey[ALL_EVENTS_KEY]
  const globalEnabled   = allRow ? allRow.emailEnabled : true

  /** Effective state per event: own row wins, else global, else enabled. */
  const effective = (key) => {
    const own = byKey[key]
    if (own) return own.emailEnabled
    return globalEnabled
  }

  const setEvent  = (key, emailEnabled) => upsert({ eventKey: key, emailEnabled, inAppEnabled: true })
  const setGlobal = (emailEnabled)      => upsert({ eventKey: ALL_EVENTS_KEY, emailEnabled, inAppEnabled: true })

  return (
      <div className="space-y-4 max-w-3xl">
        {isLoading && <Skeleton rows={8} />}

        {!isLoading && (
          <>
            {/* Global master switch */}
            <Card>
              <CardBody className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-card bg-brand-500/10"><Mail size={16} className="text-brand-500" /></div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">Email notifications</p>
                    <p className="text-xs text-text-muted">
                      Your default for every event. Per-event choices below override it.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {allRow && (
                    <Button variant="ghost" size="sm" title="Reset to default"
                            onClick={() => reset(ALL_EVENTS_KEY)}>
                      <RotateCcw size={12} />
                    </Button>
                  )}
                  <Toggle checked={globalEnabled} onChange={setGlobal} />
                </div>
              </CardBody>
            </Card>

            {/* Per-event groups */}
            {EVENT_GROUPS.map(group => (
              <Card key={group.label}>
                <CardBody className="p-0">
                  <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
                    <Badge value={group.label} colorTag={group.colorTag} />
                  </div>
                  <div>
                    {group.events.map(ev => {
                      const own = byKey[ev.key]
                      return (
                        <div key={ev.key}
                             className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 hover:bg-surface-overlay/40">
                          <div>
                            <p className="text-sm text-text-primary">{ev.label}</p>
                            <p className="text-[11px] font-mono text-text-muted">{ev.key}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {own && (
                              <>
                                <span className="text-[10px] uppercase tracking-wide text-text-muted">custom</span>
                                <Button variant="ghost" size="sm" title="Follow my default"
                                        onClick={() => reset(ev.key)}>
                                  <RotateCcw size={12} />
                                </Button>
                              </>
                            )}
                            <Toggle checked={effective(ev.key)} onChange={(v) => setEvent(ev.key, v)} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardBody>
              </Card>
            ))}

            <div className="flex items-start gap-2 text-xs text-text-muted px-1">
              <Info size={13} className="mt-0.5 shrink-0" />
              <p>
                Critical platform emails (password reset, account invitations) are always
                delivered. Some events may also be muted platform-wide by your administrator.
              </p>
            </div>

            <div className="flex items-start gap-2 text-xs text-text-muted px-1">
              <BellRing size={13} className="mt-0.5 shrink-0" />
              <p>In-app notifications can't be turned off yet — the bell is your reliable record of everything that happened.</p>
            </div>
          </>
        )}
      </div>
  )
}

/**
 * Standalone page — the /settings/notifications route that email footers link
 * to via {{preferencesUrl}}. Keep this route; just wraps NotificationsTab.
 */
export default function NotificationPreferencesPage() {
  return (
    <PageLayout
      title="Notification Preferences"
      subtitle="Choose which events email you. In-app notifications always appear in your bell.">
      <div className="flex-1 overflow-auto p-6">
        <NotificationsTab />
      </div>
    </PageLayout>
  )
}