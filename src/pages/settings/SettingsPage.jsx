import { useSelector } from 'react-redux'
import { selectBranding } from '../../store/slices/uiConfigSlice'
import { selectAuth } from '../../store/slices/authSlice'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { initials } from '../../utils/format'

export default function SettingsPage() {
  const branding = useSelector(selectBranding)
  const { fullName, email, tenantId } = useSelector(selectAuth)

  return (
    <PageLayout title="Settings" subtitle="Account and platform preferences">
      <div className="p-6 grid grid-cols-12 gap-4">
        {/* Profile */}
        <div className="col-span-5">
          <Card>
            <CardHeader title="Profile" subtitle="Your account details" />
            <CardBody className="space-y-4">
              <div className="flex items-center gap-4 pb-4 border-b border-border">
                <div className="w-14 h-14 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-xl font-bold text-brand-300">
                  {initials(fullName)}
                </div>
                <div>
                  <p className="font-semibold text-text-primary">{fullName}</p>
                  <p className="text-xs text-text-muted">{email}</p>
                  <p className="text-[10px] font-mono text-text-muted mt-0.5">Tenant #{tenantId}</p>
                </div>
              </div>
              <Input label="Full Name" defaultValue={fullName} disabled />
              <Input label="Email" defaultValue={email} type="email" disabled />
            </CardBody>
          </Card>
        </div>

        {/* Branding preview */}
        <div className="col-span-4">
          <Card>
            <CardHeader title="Tenant Branding" subtitle="Applied from database — zero code deploy" />
            <CardBody className="space-y-3">
              {[
                { label: 'Company', value: branding?.companyName || 'KashiGRC' },
                { label: 'Primary Color', value: branding?.primaryColor || '#0ea5e9' },
                { label: 'Accent Color', value: branding?.accentColor || '#8b5cf6' },
                { label: 'Sidebar Theme', value: branding?.sidebarTheme || 'dark' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">{label}</span>
                  <span className="font-mono text-xs text-text-primary">{value}</span>
                </div>
              ))}
              {branding?.primaryColor && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-5 h-5 rounded-full border border-border" style={{ background: branding.primaryColor }} />
                  <div className="w-5 h-5 rounded-full border border-border" style={{ background: branding.accentColor }} />
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </PageLayout>
  )
}
