import { useMemo, useState } from 'react'
import { Mail, Plus, Edit3, Trash2, VolumeX, RefreshCw, Users, UserCheck } from 'lucide-react'
import { PageLayout } from '../../../components/layout/PageLayout'
import { Card, CardBody } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Modal, ConfirmDialog } from '../../../components/ui/Modal'
import { Skeleton } from '../../../components/ui/EmptyState'
import { Badge } from '../../../components/ui/Badge'
import { cn } from '../../../lib/cn'
import { ALL_EVENTS, AUDIENCES } from '../../../config/notificationEvents'
import { useEmailTemplates } from '../../../hooks/useEmailTemplates'
import {
  useNotificationEmailRules,
  useCreateNotificationEmailRule,
  useUpdateNotificationEmailRule,
  useDeleteNotificationEmailRule,
} from '../../../hooks/useNotificationEmailRules'

/**
 * NotificationEmailRulesPage — maps notification eventKeys to email
 * templates and audiences; the runtime routing matrix of the Kafka
 * email pipeline. No rule = raw fallback email; suppress = mute event.
 */

const inputCls = 'w-full px-2.5 py-1.5 rounded-ctl bg-surface-overlay border border-border text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500/50'

function RuleEditor({ rule, onClose }) {
  const isEdit = !!rule?.id
  const [form, setForm] = useState({
    eventKey:      rule?.eventKey     || '',
    templateName:  rule?.templateName || '',
    audience:      rule?.audience     || 'RECIPIENT',
    suppressEmail: rule?.suppressEmail || false,
    tenantId:      rule?.tenantId ?? '',
    isActive:      rule?.isActive ?? true,
  })
  const { data: tplData } = useEmailTemplates({})
  const templates = tplData?.items || (Array.isArray(tplData) ? tplData : [])
  const { mutate: create, isPending: creating } = useCreateNotificationEmailRule()
  const { mutate: update, isPending: updating } = useUpdateNotificationEmailRule()
  const saving = creating || updating

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e?.target ? e.target.value : e }))
  const valid = form.eventKey && (form.suppressEmail || form.templateName)

  const submit = () => {
    const payload = {
      eventKey:      form.eventKey.trim(),
      templateName:  form.suppressEmail ? null : (form.templateName || null),
      audience:      form.audience,
      suppressEmail: form.suppressEmail,
      tenantId:      form.tenantId === '' ? null : Number(form.tenantId),
      isActive:      form.isActive,
    }
    if (isEdit) update({ id: rule.id, ...payload }, { onSuccess: onClose })
    else        create(payload, { onSuccess: onClose })
  }

  return (
    <Modal open onClose={onClose} size="md"
      title={isEdit ? 'Edit email rule' : 'New email rule'}
      subtitle="One event can carry multiple rules — one email per template per addressee"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!valid} loading={saving}>
            {isEdit ? 'Save changes' : 'Create rule'}
          </Button>
        </div>
      }>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Event</label>
          <input list="event-key-catalog" value={form.eventKey} onChange={set('eventKey')}
                 placeholder="TASK_ASSIGNED — pick or type a custom key" className={cn(inputCls, 'font-mono')} />
          <datalist id="event-key-catalog">
            {ALL_EVENTS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </datalist>
        </div>

        <div className="flex items-center justify-between rounded-ctl border border-border bg-surface-overlay px-3 py-2">
          <div>
            <p className="text-sm text-text-primary flex items-center gap-1.5">
              <VolumeX size={14} className="text-status-fail-fg" /> Suppress all email for this event
            </p>
            <p className="text-[11px] text-text-muted">Mutes templates and the raw fallback. In-app notifications are unaffected.</p>
          </div>
          <input type="checkbox" checked={form.suppressEmail}
                 onChange={e => setForm(f => ({ ...f, suppressEmail: e.target.checked }))}
                 className="h-4 w-4 accent-status-fail-fg" />
        </div>

        {!form.suppressEmail && (
          <>
            <div>
              <label className="block text-xs text-text-muted mb-1">Email template</label>
              <select value={form.templateName} onChange={set('templateName')} className={inputCls}>
                <option value="">— select template —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.name} disabled={t.isActive === false}>
                    {t.name}{t.isActive === false ? ' (inactive)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-text-muted mt-1">
                Placeholders must use guaranteed variables — otherwise recipients see literal {'{{braces}}'}.
              </p>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Audience</label>
              <select value={form.audience} onChange={set('audience')} className={inputCls}>
                {AUDIENCES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </>
        )}

        <div>
          <label className="block text-xs text-text-muted mb-1">Tenant override (optional)</label>
          <input type="number" value={form.tenantId} onChange={set('tenantId')}
                 placeholder="Leave empty for a global rule" className={inputCls} />
          <p className="text-[11px] text-text-muted mt-1">
            If a tenant has any rules for an event, global rules for that event are ignored for that tenant.
          </p>
        </div>

        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={form.isActive}
                   onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                   className="h-4 w-4 accent-brand-500" />
            Rule is active
          </label>
        )}
      </div>
    </Modal>
  )
}

export default function NotificationEmailRulesPage() {
  const { data, isLoading, refetch } = useNotificationEmailRules()
  const { mutate: deleteRule, isPending: deleting } = useDeleteNotificationEmailRule()
  const [editing, setEditing]   = useState(null)   // null | {} (new) | rule
  const [toDelete, setToDelete] = useState(null)

  const rules = Array.isArray(data) ? data : []
  const grouped = useMemo(() => {
    const m = new Map()
    for (const r of rules) {
      if (!m.has(r.eventKey)) m.set(r.eventKey, [])
      m.get(r.eventKey).push(r)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rules])

  return (
    <PageLayout
      title="Notification Email Rules"
      subtitle="Route events to email templates by audience — no rule means a raw fallback email; suppress mutes an event"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw size={13} /></Button>
          <Button size="sm" onClick={() => setEditing({})}><Plus size={13} /> New rule</Button>
        </div>
      }>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {isLoading && <Skeleton rows={6} />}

        {!isLoading && grouped.length === 0 && (
          <Card><CardBody>
            <div className="text-center py-10">
              <Mail size={28} className="mx-auto text-text-muted mb-3" />
              <p className="text-sm text-text-primary mb-1">No rules configured</p>
              <p className="text-xs text-text-muted mb-4">
                Every event currently sends the raw fallback email to all recipients.
                Add rules to use curated templates, target audiences, or mute events.
              </p>
              <Button size="sm" onClick={() => setEditing({})}><Plus size={13} /> Create first rule</Button>
            </div>
          </CardBody></Card>
        )}

        {grouped.map(([eventKey, eventRules]) => (
          <Card key={eventKey}>
            <CardBody className="p-0">
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <span className="text-sm font-mono text-text-primary">{eventKey}</span>
                <span className="text-[11px] text-text-muted">{eventRules.length} rule{eventRules.length > 1 ? 's' : ''}</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {eventRules.map(rule => (
                    <tr key={rule.id} className="border-b border-border last:border-0 hover:bg-surface-overlay/50">
                      <td className="px-4 py-2.5 w-[40%]">
                        {rule.suppressEmail
                          ? <span className="inline-flex items-center gap-1.5 text-status-fail-fg text-xs"><VolumeX size={13} /> Email suppressed</span>
                          : <span className="font-mono text-xs text-text-primary">{rule.templateName || '—'}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {!rule.suppressEmail && (
                          <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                            {rule.audience === 'ACTOR' ? <UserCheck size={13} /> : <Users size={13} />}
                            {rule.audience === 'ACTOR' ? 'Actor' : 'Recipients'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge value={rule.tenantId ? `tenant ${rule.tenantId}` : 'global'}
                               colorTag={rule.tenantId ? 'violet' : 'slate'} />
                      </td>
                      <td className="px-4 py-2.5">
                        {rule.isActive === false && <Badge value="inactive" colorTag="gray" />}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(rule)}><Edit3 size={13} /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setToDelete(rule)}><Trash2 size={13} className="text-status-fail-fg" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        ))}
      </div>

      {editing !== null && <RuleEditor rule={editing.id ? editing : null} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => deleteRule(toDelete.id, { onSuccess: () => setToDelete(null) })}
        title="Delete rule?"
        message={toDelete ? `${toDelete.eventKey} → ${toDelete.suppressEmail ? 'suppression' : toDelete.templateName}. Without rules, this event falls back to the raw email.` : ''}
        confirmLabel="Delete"
        loading={deleting}
      />
    </PageLayout>
  )
}
