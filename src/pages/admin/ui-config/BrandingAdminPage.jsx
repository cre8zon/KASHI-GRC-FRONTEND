import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDispatch } from 'react-redux'
import { Palette, Save, Eye, EyeOff, RotateCcw, Globe, Mail, Type } from 'lucide-react'
import { uiAdminApi, uiConfigApi } from '../../../api/uiConfig.api'
import { QUERY_KEYS } from '../../../config/constants'
import { applyBrandingLive } from '../../../store/slices/uiConfigSlice'
import { PageLayout }        from '../../../components/layout/PageLayout'
import { Card, CardHeader, CardBody } from '../../../components/ui/Card'
import { Button }            from '../../../components/ui/Button'
import { Input }             from '../../../components/ui/Input'
import { cn }                from '../../../lib/cn'
import toast                 from 'react-hot-toast'

const SIDEBAR_THEMES = [
  { id: 'dark',  label: 'Dark',  preview: 'bg-gray-900' },
  { id: 'light', label: 'Light', preview: 'bg-gray-100' },
  { id: 'brand', label: 'Brand', preview: 'bg-brand-500' },
]

const PRESET_PALETTES = [
  { label: 'Sky',     primary: '#0ea5e9', accent: '#8b5cf6' },
  { label: 'Violet',  primary: '#7c3aed', accent: '#ec4899' },
  { label: 'Rose',    primary: '#e11d48', accent: '#f97316' },
  { label: 'Emerald', primary: '#059669', accent: '#0ea5e9' },
  { label: 'Amber',   primary: '#d97706', accent: '#dc2626' },
  { label: 'Slate',   primary: '#475569', accent: '#0ea5e9' },
]

export default function BrandingAdminPage() {
  const qc       = useQueryClient()
  const dispatch = useDispatch()

  const { data: existing, isLoading } = useQuery({
    queryKey: ['admin-branding'],
    queryFn:  uiConfigApi.branding,
  })

  const [form, setForm] = useState({
    companyName:  '', logoUrl: '', faviconUrl: '',
    primaryColor: '#0ea5e9', accentColor: '#7c3aed',
    sidebarTheme: 'dark',
    supportEmail: '', supportUrl: '', footerText: '',
  })
  const [isExisting,  setIsExisting]  = useState(false)
  const [livePreview, setLivePreview] = useState(true)
  const [original,    setOriginal]    = useState(null)

  useEffect(() => {
    if (existing) {
      const data = {
        companyName:  existing.companyName  || '',
        logoUrl:      existing.logoUrl      || '',
        faviconUrl:   existing.faviconUrl   || '',
        primaryColor: existing.primaryColor || '#0ea5e9',
        accentColor:  existing.accentColor  || '#7c3aed',
        sidebarTheme: existing.sidebarTheme || 'dark',
        supportEmail: existing.supportEmail || '',
        supportUrl:   existing.supportUrl   || '',
        footerText:   existing.footerText   || '',
      }
      setForm(data)
      setOriginal(data)
      setIsExisting(true)
    }
  }, [existing])

  const set = useCallback((k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v }
      // Live preview: apply colors to app immediately as user picks
      if (livePreview && (k === 'primaryColor' || k === 'accentColor')) {
        dispatch(applyBrandingLive({ [k]: v }))
      }
      return next
    })
  }, [livePreview, dispatch])

  const handlePreviewToggle = () => {
    if (livePreview) {
      // Turning off — restore original branding
      if (original) dispatch(applyBrandingLive(original))
    } else {
      // Turning on — apply current form state
      dispatch(applyBrandingLive(form))
    }
    setLivePreview(p => !p)
  }

  const handleReset = () => {
    if (original) {
      setForm(original)
      if (livePreview) dispatch(applyBrandingLive(original))
    }
  }

  const { mutate: save, isPending } = useMutation({
    mutationFn: (data) => isExisting ? uiAdminApi.branding.update(data) : uiAdminApi.branding.create(data),
    onSuccess: () => {
      // Invalidate bootstrap so next navigation/reload gets fresh branding from server
      qc.invalidateQueries({ queryKey: QUERY_KEYS.BOOTSTRAP })
      qc.invalidateQueries({ queryKey: ['admin-branding'] })
      // Apply immediately to the live app — no reload needed
      dispatch(applyBrandingLive(form))
      setOriginal(form)
      toast.success('Branding saved and applied live')
    },
    onError: (e) => toast.error(e?.message || 'Failed to save'),
  })

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
      subtitle="Company identity, colors, and theme — changes apply live"
      actions={
        <div className="flex items-center gap-2">
          {original && (
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={handleReset}>
              Reset
            </Button>
          )}
          <Button
            variant="ghost" size="sm"
            icon={livePreview ? Eye : EyeOff}
            onClick={handlePreviewToggle}
          >
            {livePreview ? 'Live preview on' : 'Live preview off'}
          </Button>
          <Button size="sm" icon={Save} loading={isPending} onClick={() => save(form)}>
            Save Branding
          </Button>
        </div>
      }
    >
      <div className="p-6 grid grid-cols-3 gap-6 max-w-6xl">

        {/* ── Left column: all settings ─────────────────────────── */}
        <div className="col-span-2 flex flex-col gap-4">

          {/* Identity */}
          <Card>
            <CardHeader title="Company Identity" icon={Type} />
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
            <CardHeader title="Colors & Theme" icon={Palette} />
            <CardBody className="flex flex-col gap-5">

              {/* Preset palettes */}
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
                  Presets
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_PALETTES.map(p => (
                    <button key={p.label}
                      onClick={() => { set('primaryColor', p.primary); set('accentColor', p.accent) }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border hover:border-brand-500/40 transition-colors text-xs text-text-secondary hover:text-text-primary"
                    >
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.primary }} />
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.accent }} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color pickers */}
              <div className="grid grid-cols-2 gap-4">
                <ColorPicker
                  label="Primary Color"
                  value={form.primaryColor}
                  onChange={v => set('primaryColor', v)}
                />
                <ColorPicker
                  label="Accent Color"
                  value={form.accentColor}
                  onChange={v => set('accentColor', v)}
                />
              </div>

              {/* Sidebar theme */}
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
                  Sidebar Theme
                </p>
                <div className="flex gap-2">
                  {SIDEBAR_THEMES.map(t => (
                    <button key={t.id} onClick={() => set('sidebarTheme', t.id)}
                      className={cn(
                        'flex-1 flex items-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-colors',
                        form.sidebarTheme === t.id
                          ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                          : 'border-border text-text-muted hover:text-text-primary hover:bg-surface-overlay'
                      )}>
                      <span className={cn('w-3 h-3 rounded-sm shrink-0', t.preview)} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Support */}
          <Card>
            <CardHeader title="Support & Footer" icon={Globe} />
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
        </div>

        {/* ── Right column: live preview ─────────────────────────── */}
        <div className="flex flex-col gap-4">
          <Card className="sticky top-4">
            <CardHeader title="Preview" subtitle="Updates as you change colors" />
            <CardBody className="flex flex-col gap-4">

              {/* Mini app preview */}
              <div className="rounded-lg overflow-hidden border border-border">
                {/* Sidebar strip */}
                <div className="flex h-36">
                  <div className={cn(
                    'w-10 flex flex-col items-center py-3 gap-2',
                    form.sidebarTheme === 'light' ? 'bg-gray-100' :
                    form.sidebarTheme === 'brand' ? 'bg-brand-500' : 'bg-gray-900'
                  )}>
                    {/* Logo dot */}
                    <div className="w-5 h-5 rounded-md mb-1"
                      style={{ backgroundColor: form.primaryColor }} />
                    {[1,2,3,4].map(i => (
                      <div key={i} className={cn(
                        'w-5 h-1 rounded-full',
                        i === 1 ? 'opacity-100' : 'opacity-30',
                        form.sidebarTheme === 'light' ? 'bg-gray-700' :
                        form.sidebarTheme === 'brand' ? 'bg-white' : 'bg-gray-400'
                      )} />
                    ))}
                  </div>
                  {/* Main area */}
                  <div className="flex-1 bg-surface-raised p-2 flex flex-col gap-1.5">
                    {/* Topbar */}
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-text-primary">
                        {form.companyName || 'Company Name'}
                      </span>
                      <div className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: form.primaryColor }} />
                    </div>
                    {/* Cards */}
                    <div className="grid grid-cols-2 gap-1 flex-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className="rounded bg-surface border border-border p-1">
                          <div
                            className={cn('h-1 rounded-full w-2/3 mb-1', i !== 1 && 'bg-border')}
                            style={{ backgroundColor: i === 1 ? form.primaryColor : undefined }}
                          />
                          <div className="h-0.5 rounded-full bg-border w-full" />
                        </div>
                      ))}
                    </div>
                    {/* Button */}
                    <div className="h-4 rounded flex items-center justify-center"
                      style={{ backgroundColor: form.primaryColor }}>
                      <span className="text-[8px] text-white font-medium">Action</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Color swatches */}
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
                  Color Scale
                </p>
                <div className="flex gap-1 h-6 rounded-lg overflow-hidden">
                  {[50,100,200,300,400,500,600,700,800,900].map(shade => (
                    <div key={shade} className={`flex-1 bg-brand-${shade}`}
                      title={`brand-${shade}`} />
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-text-muted">50</span>
                  <span className="text-[9px] text-text-muted">900</span>
                </div>
              </div>

              {/* Accent swatch */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg shrink-0"
                  style={{ backgroundColor: form.accentColor }} />
                <div>
                  <p className="text-xs font-medium text-text-primary">Accent</p>
                  <p className="text-[10px] font-mono text-text-muted">{form.accentColor}</p>
                </div>
              </div>

              {/* Sample UI elements */}
              <div className="flex flex-col gap-2">
                <div className="h-7 rounded-md flex items-center justify-center text-xs text-white font-medium"
                  style={{ backgroundColor: form.primaryColor }}>
                  Primary Button
                </div>
                <div className="h-7 rounded-md border flex items-center justify-center text-xs font-medium"
                  style={{ borderColor: form.primaryColor, color: form.primaryColor }}>
                  Secondary Button
                </div>
                <div className="h-7 rounded-md flex items-center px-3 text-xs"
                  style={{ backgroundColor: `${form.primaryColor}15`, color: form.primaryColor }}>
                  Badge / Tag
                </div>
              </div>

              <Button size="sm" icon={Save} loading={isPending} onClick={() => save(form)}
                className="w-full">
                Save & Apply
              </Button>
            </CardBody>
          </Card>
        </div>

      </div>
    </PageLayout>
  )
}

function ColorPicker({ label, value, onChange }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
          <div className="w-9 h-9 rounded-lg border border-border shadow-sm cursor-pointer"
            style={{ backgroundColor: value }} />
        </div>
        <input value={value} onChange={e => onChange(e.target.value)}
          className="h-9 flex-1 rounded-lg border border-border bg-surface-raised px-3 text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
    </div>
  )
}