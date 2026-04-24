import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Mail, Eye, Send, Save, X, CheckCircle2, ArrowRight, RefreshCw } from 'lucide-react'
import { useEmailTemplateByName } from '../../../hooks/useEmailTemplates'
import { useMutation, useQuery } from '@tanstack/react-query'
import { tenantsApi } from '../../../api/tenants.api'
import { authApi } from '../../../api/auth.api'
import toast from 'react-hot-toast'
import { cn } from '../../../lib/cn'
import { formatDate } from '../../../utils/format'
import { Button } from '../../../components/ui/Button'

function VarChip({ label, onInsert }) {
  return (
    <div className="flex items-center justify-between p-2 bg-surface-overlay rounded-lg border border-border">
      <span className="text-xs font-mono text-brand-400">{`{{${label}}}`}</span>
      <button
        onClick={() => onInsert(label)}
        className="text-[10px] text-text-muted hover:text-text-primary px-1.5 py-0.5 rounded hover:bg-surface-raised transition-colors"
      >
        Insert
      </button>
    </div>
  )
}

function mergeVars(template, vars) {
  let result = template
  Object.entries(vars).forEach(([k, v]) => {
    result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v || '')
  })
  return result
}

function buildVars(owner, recipientEmail, tenantName, tempPassword) {
  const firstName = owner?.firstName || 'Owner'
  const email     = owner?.email || recipientEmail || ''
  const loginUrl  = `${window.location.origin}/auth/login`
  return {
    firstName,
    email,
    admin_email:       email,
    admin_name:        owner?.fullName || [owner?.firstName, owner?.lastName].filter(Boolean).join(' ') || firstName,
    tempPassword:      tempPassword || '(generate a new password above)',
    temp_password:     tempPassword || '(generate a new password above)',
    loginUrl,
    login_url:         loginUrl,
    resetUrl:          loginUrl,
    supportUrl:        'https://support.kashigrc.com',
    support_url:       'https://support.kashigrc.com',
    organization_name: tenantName || '',
  }
}

export default function SendWelcomeEmailPage() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { tenant, admin: stateAdmin } = location.state || {}

  const { data: templateData } = useEmailTemplateByName('user-invitation')

  const [subject, setSubject]               = useState('')
  const [body, setBody]                     = useState('')
  const [recipientEmail, setRecipientEmail] = useState(stateAdmin?.email || '')
  const [activeTab, setActiveTab]           = useState('compose')
  const [sent, setSent]                     = useState(false)
  const [resetDone, setResetDone]           = useState(false)
  const [resolvedOwner, setResolvedOwner]   = useState(stateAdmin || null)

  // Fetch owner from backend when no owner in state (navigating from tenant detail)
  const { data: fetchedOwner } = useQuery({
    queryKey: ['tenant-owner', tenant?.tenantId],
    queryFn:  () => tenantsApi.getOwner(tenant.tenantId),
    enabled:  !!tenant?.tenantId && !stateAdmin?.email,
  })

  // Resolve owner — prefer stateAdmin (has temporaryPassword), fallback to fetched
  useEffect(() => {
    if (stateAdmin?.email) {
      setResolvedOwner(stateAdmin)
      setRecipientEmail(stateAdmin.email)
    } else if (fetchedOwner?.email) {
      setResolvedOwner(fetchedOwner)
      setRecipientEmail(fetchedOwner.email)
    }
  }, [stateAdmin, fetchedOwner])

  // Populate template when template + owner are ready
  useEffect(() => {
    if (!templateData) return
    const vars = buildVars(
      resolvedOwner,
      recipientEmail,
      tenant?.name,
      resolvedOwner?.temporaryPassword
    )
    setSubject(mergeVars(templateData.subject || '', vars))
    setBody(mergeVars(templateData.content || '', vars))
  }, [templateData, resolvedOwner, tenant])

  // Redirect if no tenant in state
  useEffect(() => { if (!tenant) navigate('/tenants') }, [tenant, navigate])
  if (!tenant) return null

  // True when navigated from tenant detail — no temporaryPassword available
  const needsPasswordReset = !resolvedOwner?.temporaryPassword && !resetDone

  // ── Reset & generate new temp password ──────────────────────────
  const { mutate: resetPassword, isPending: resetting } = useMutation({
    mutationFn: () => authApi.resendInvitation({
      userId:    resolvedOwner?.userId,
      email:     recipientEmail,
      sendEmail: false,
    }),
    onSuccess: (result) => {
      const newPassword = result.temporaryPassword
      const updatedOwner = { ...resolvedOwner, temporaryPassword: newPassword }
      setResolvedOwner(updatedOwner)
      if (templateData) {
        const vars = buildVars(updatedOwner, recipientEmail, tenant?.name, newPassword)
        setSubject(mergeVars(templateData.subject || '', vars))
        setBody(mergeVars(templateData.content || '', vars))
      }
      setResetDone(true)
      toast.success('New temporary password generated — review and send')
    },
    onError: (err) => toast.error(
      err?.response?.data?.error?.message || 'Failed to reset password'
    ),
  })

  // ── Send email ───────────────────────────────────────────────────
  const { mutate: sendEmail, isPending: sending } = useMutation({
    mutationFn: () => {
      if (!recipientEmail?.trim()) {
        return Promise.reject(new Error('Recipient email is required'))
      }
      // Always send variables — backend renders from DB template
      return tenantsApi.sendWelcomeEmail(tenant.tenantId, {
        email:          recipientEmail,
        adminFirstName: resolvedOwner?.firstName,
        loginUrl:       `${window.location.origin}/auth/login`,
        tempPassword:   resolvedOwner?.temporaryPassword || '',
      })
    },
    onSuccess: () => { setSent(true); toast.success('Email sent successfully!') },
    onError:   (err) => toast.error(
      err?.response?.data?.error?.message || err?.message || 'Failed to send email'
    ),
  })

  // ── Sent success screen ──────────────────────────────────────────
  if (sent) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="max-w-xl w-full text-center">
          <div className="inline-flex w-20 h-20 rounded-full bg-green-500/10 border-4 border-green-500/30 items-center justify-center mb-4">
            <CheckCircle2 size={40} className="text-green-400" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Email Sent Successfully!</h1>
          <p className="text-sm text-text-secondary mb-8">
            Welcome email delivered to{' '}
            <span className="text-brand-400 font-medium">{recipientEmail}</span>
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate(`/tenants/${tenant.tenantId}`)}
              className="flex-1 h-10 bg-brand-500 text-white rounded-xl text-sm font-semibold hover:bg-brand-600 transition-colors flex items-center justify-center gap-2"
            >
              View Tenant <ArrowRight size={14} />
            </button>
            <button
              onClick={() => { setSent(false); setResetDone(false) }}
              className="h-10 px-4 border border-border text-text-secondary text-sm rounded-xl hover:bg-surface-overlay transition-colors"
            >
              Send Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Compose screen ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <Mail size={18} className="text-brand-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-text-primary">Send Welcome Email</h1>
            <p className="text-xs text-text-muted">Compose and send onboarding email to organization owner</p>
          </div>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-surface-overlay text-text-muted transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-3 gap-6">
        {/* Left: composer */}
        <div className="col-span-2 space-y-4">

          {/* Amber banner — shown when no temp password available */}
          {needsPasswordReset && (
            <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <div className="text-amber-400 text-base shrink-0 mt-0.5">⚠</div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-400">Temporary password not available</p>
                <p className="text-xs text-text-muted mt-1">
                  This owner was created earlier. Generate a fresh temporary password to include in the email.
                  The previous password will be invalidated immediately.
                </p>
              </div>
              <button
                onClick={() => {
                  if (!resolvedOwner?.userId) {
                    toast.error('Owner not found for this tenant')
                    return
                  }
                  resetPassword()
                }}
                disabled={resetting || !resolvedOwner?.userId}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-60 shrink-0"
              >
                {resetting
                  ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <RefreshCw size={12} />
                }
                Reset & Generate
              </button>
            </div>
          )}

          {/* Green banner after reset */}
          {resetDone && (
            <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
              <CheckCircle2 size={16} className="text-green-400 shrink-0" />
              <p className="text-xs text-green-400 font-medium">
                New temporary password generated and inserted into the email body. Review carefully, then send.
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-surface-overlay rounded-lg p-0.5 w-fit">
            {[{ key: 'compose', label: 'Email Details' }, { key: 'preview', label: 'Preview' }].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  activeTab === tab.key
                    ? 'bg-surface-raised text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'compose' && (
            <div className="bg-surface-raised border border-border rounded-xl p-5 space-y-4">

              {/* Recipient */}
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Recipient</p>
                <div className={cn(
                  'flex items-center gap-3 p-3 bg-surface-overlay border rounded-lg transition-colors',
                  recipientEmail ? 'border-border' : 'border-red-500/40'
                )}>
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400">
                    {(resolvedOwner?.firstName || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">
                      {resolvedOwner?.fullName ||
                        [resolvedOwner?.firstName, resolvedOwner?.lastName].filter(Boolean).join(' ') ||
                        'Organization Owner'}
                    </p>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={e => setRecipientEmail(e.target.value)}
                      placeholder="Enter recipient email…"
                      className={cn(
                        'text-xs bg-transparent border-b focus:outline-none w-full mt-0.5 pb-0.5 transition-colors',
                        recipientEmail
                          ? 'text-text-muted border-transparent focus:border-brand-500'
                          : 'text-red-400 border-red-400 placeholder:text-red-300'
                      )}
                    />
                  </div>
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20 font-medium shrink-0">
                    Owner
                  </span>
                </div>
                {!recipientEmail && (
                  <p className="text-xs text-red-400 mt-1.5">
                    ⚠ No email address — type it above before sending
                  </p>
                )}
              </div>

              {/* Subject */}
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Subject Line</p>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Body — preview only, actual send uses backend template */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Email Body Preview</p>
                  <span className="text-[10px] text-text-muted bg-surface-overlay px-2 py-0.5 rounded-full border border-border">
                    Rendered from DB template on send
                  </span>
                </div>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={12}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500/50 resize-none opacity-80"
                />
                <p className="text-[11px] text-text-muted mt-1">
                  To change the email content, go to{' '}
                  <button
                    onClick={() => navigate('/admin/email-templates')}
                    className="text-brand-400 hover:text-brand-300 underline"
                  >
                    Email Templates
                  </button>
                  {' '}and edit the <code className="font-mono text-xs bg-surface-overlay px-1 rounded">user-invitation</code> template.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Button
                  variant="secondary" size="sm" icon={Eye}
                  onClick={() => setActiveTab('preview')}
                >
                  Preview
                </Button>
                <Button
                  size="sm"
                  icon={Send}
                  loading={sending}
                  disabled={!recipientEmail?.trim() || (needsPasswordReset)}
                  onClick={() => sendEmail()}
                >
                  Send Email Now
                </Button>
              </div>

              {needsPasswordReset && (
                <p className="text-[11px] text-amber-400 text-center">
                  Generate a new temporary password above before sending
                </p>
              )}
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-surface-overlay">
                <p className="text-xs text-text-muted">
                  Subject: <span className="text-text-primary">{subject}</span>
                </p>
              </div>
              <div className="bg-white" style={{ height: 500 }}>
                <iframe
                  srcDoc={`<style>body{margin:0;padding:0}</style>${body}`}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin allow-scripts"
                  title="Email Preview"
                />
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Mini live preview */}
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Live Preview</p>
            <div className="rounded-xl border border-border overflow-hidden bg-white" style={{ height: 200 }}>
              <iframe
                srcDoc={`<style>body{margin:0;padding:12px;font-family:system-ui,sans-serif;font-size:10px}</style>${body}`}
                className="w-full h-full border-0"
                sandbox="allow-same-origin allow-scripts"
                title="Mini Preview"
              />
            </div>
          </div>

          {/* Variable chips */}
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Available Variables</p>
            <div className="space-y-1.5">
              {['admin_name', 'organization_name', 'login_url', 'admin_email', 'temp_password'].map(v => (
                <VarChip key={v} label={v} onInsert={(name) => setBody(b => b + `{{${name}}}`)} />
              ))}
            </div>
          </div>

          {/* Tenant info */}
          <div className="bg-surface-raised border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Tenant Information</p>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Organization', value: tenant?.name },
                { label: 'Tenant ID',   value: `TNT-${String(tenant?.tenantId || 0).padStart(4, '0')}` },
                { label: 'Status',      value: tenant?.status },
                { label: 'Created',     value: formatDate(tenant?.createdAt) },
              ].map(row => (
                <div key={row.label} className="flex justify-between">
                  <span className="text-text-muted">{row.label}</span>
                  <span className="text-text-primary font-medium">{row.value || '—'}</span>
                </div>
              ))}
            </div>
            {/* Owner info in sidebar */}
            {resolvedOwner?.email && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Owner</p>
                <p className="text-xs font-medium text-text-primary">
                  {resolvedOwner.fullName ||
                    [resolvedOwner.firstName, resolvedOwner.lastName].filter(Boolean).join(' ')}
                </p>
                <p className="text-xs text-text-muted font-mono">{resolvedOwner.email}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}