import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Palette, Save, RefreshCw, Eye } from 'lucide-react'
import { uiAdminApi, uiConfigApi } from '../../../api/uiConfig.api'
import { PageLayout }  from '../../../components/layout/PageLayout'
import { Card, CardHeader, CardBody } from '../../../components/ui/Card'
import { Button }      from '../../../components/ui/Button'
import { Input }       from '../../../components/ui/Input'
import { cn }          from '../../../lib/cn'
import toast           from 'react-hot-toast'

const SIDEBAR_THEMES = ['dark', 'light', 'brand']

export default function BrandingAdminPage() {
  const qc = useQueryClient()
  const { data: existing, isLoading } = useQuery({
    queryKey: ['admin-branding'],
    queryFn:  uiConfigApi.branding,
  })

  const [form, setForm] = useState({
    companyName:   '', logoUrl: '', faviconUrl: '',
    primaryColor:  '#1e40af', accentColor: '#7c3aed',
    sidebarTheme:  'dark',
    supportEmail:  '', supportUrl: '', footerText: '',
  })
  const [isExisting, setIsExisting] = useState(false)

  // Populate form when data loads
  useEffect(() => {
    if (existing) {
      setForm({
        companyName:  existing.companyName  || '',
        logoUrl:      existing.logoUrl      || '',
        faviconUrl:   existing.faviconUrl   || '',
        primaryColor: existing.primaryColor || '#1e40af',
        accentColor:  existing.accentColor  || '#7c3aed',
        sidebarTheme: existing.sidebarTheme || 'dark',
        supportEmail: existing.supportEmail || '',
        supportUrl:   existing.supportUrl   || '',
        footerText:   existing.footerText   || '',
      })
      setIsExisting(true)
    }
  }, [existing])

  const { mutate: save, isPending } = useMutation({
    mutationFn: (data) => isExisting ? uiAdminApi.branding.update(data) : uiAdminApi.branding.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-branding'] })
      qc.invalidateQueries({ queryKey: ['bootstrap'] })
      toast.success('Branding saved — reload to see changes')
    },
    onError: (e) => toast.error(e?.message || 'Failed to save'),
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  if (isLoading) return (
    <PageLayout title="Branding">
      <div className="p-6 flex flex-col gap-4">
        {[1,2,3].map(i => <div key={i} className="h-32 rounded-lg bg-surface-overlay animate-pulse" />)}
      </div>
    </PageLayout>
  )

  return (
    <PageLayout
      title="Branding"
      subtitle="Company identity, colors, and theme"
      actions={
        <Button size="sm" icon={Save} loading={isPending} onClick={() => save(form)}>
          Save Branding
        </Button>
      }
    >
      <div className="p-6 max-w-2xl flex flex-col gap-4">

        {/* Identity */}
        <Card>
          <CardHeader title="Company Identity" />
          <CardBody className="flex flex-col gap-4">
            <Input label="Company Name" value={form.companyName}
              onChange={e => set('companyName', e.target.value)}
              placeholder="Kashi GRC" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Logo URL" value={form.logoUrl}
                onChange={e => set('logoUrl', e.target.value)}
                placeholder="https://cdn.example.com/logo.png" />
              <Input label="Favicon URL" value={form.faviconUrl}
                onChange={e => set('faviconUrl', e.target.value)}
                placeholder="https://cdn.example.com/favicon.ico" />
            </div>
            {form.logoUrl && (
              <div className="flex items-center gap-3 p-3 bg-surface-overlay rounded-lg border border-border">
                <img src={form.logoUrl} alt="Logo preview"
                  className="h-8 object-contain"
                  onError={e => { e.target.style.display = 'none' }} />
                <span className="text-xs text-text-muted">Logo preview</span>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Colors */}
        <Card>
          <CardHeader title="Colors & Theme" />
          <CardBody className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-2">
                  Primary Color
                </label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.primaryColor}
                    onChange={e => set('primaryColor', e.target.value)}
                    className="h-8 w-12 rounded cursor-pointer border border-border bg-transparent" />
                  <input value={form.primaryColor}
                    onChange={e => set('primaryColor', e.target.value)}
                    className="h-8 flex-1 rounded-md border border-border bg-surface-raised px-3 text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-2">
                  Accent Color
                </label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.accentColor}
                    onChange={e => set('accentColor', e.target.value)}
                    className="h-8 w-12 rounded cursor-pointer border border-border bg-transparent" />
                  <input value={form.accentColor}
                    onChange={e => set('accentColor', e.target.value)}
                    className="h-8 flex-1 rounded-md border border-border bg-surface-raised px-3 text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
              </div>
            </div>

            {/* Sidebar theme */}
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-2">
                Sidebar Theme
              </label>
              <div className="flex gap-2">
                {SIDEBAR_THEMES.map(theme => (
                  <button key={theme} onClick={() => set('sidebarTheme', theme)} type="button"
                    className={cn('flex-1 py-2 rounded-md border text-xs font-medium capitalize transition-colors',
                      form.sidebarTheme === theme
                        ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                        : 'border-border text-text-muted hover:text-text-primary hover:bg-surface-overlay')}>
                    {theme}
                  </button>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Support */}
        <Card>
          <CardHeader title="Support & Footer" />
          <CardBody className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Support Email" type="email" value={form.supportEmail}
                onChange={e => set('supportEmail', e.target.value)}
                placeholder="support@example.com" />
              <Input label="Support URL" value={form.supportUrl}
                onChange={e => set('supportUrl', e.target.value)}
                placeholder="https://support.example.com" />
            </div>
            <Input label="Footer Text" value={form.footerText}
              onChange={e => set('footerText', e.target.value)}
              placeholder="© 2025 Kashi GRC. All rights reserved." />
          </CardBody>
        </Card>

        {/* Preview */}
        <div className="p-4 rounded-lg border border-border bg-surface-overlay">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Preview</p>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: form.primaryColor }}>
              {(form.companyName || 'K')[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">{form.companyName || 'Company Name'}</p>
              <p className="text-xs" style={{ color: form.primaryColor }}>
                {form.primaryColor} · {form.sidebarTheme} sidebar
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: form.primaryColor }} />
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: form.accentColor }} />
            </div>
          </div>
        </div>

        <Button size="md" icon={Save} loading={isPending} onClick={() => save(form)}
          className="self-end">
          Save Branding
        </Button>
      </div>
    </PageLayout>
  )
}
