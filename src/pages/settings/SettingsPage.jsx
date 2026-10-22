import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSelector, useDispatch } from 'react-redux'
import { useMutation } from '@tanstack/react-query'
import { selectBranding, applyBrandingLive, applyBranding } from '../../store/slices/uiConfigSlice'
import { BRAND_PRESETS, DEFAULT_BRAND_HEX, isChosenHex } from '../../config/brandPresets'
import { selectAuth }    from '../../store/slices/authSlice'
import { PageLayout }    from '../../components/layout/PageLayout'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { Input }         from '../../components/ui/Input'
import { Button }        from '../../components/ui/Button'
import { useTheme }      from '../../hooks/useTheme'
import { initials }      from '../../utils/format'
import { cn }            from '../../lib/cn'
import {
  User, Building2, Shield, Palette, Key, Eye, EyeOff,
  Moon, Sun, Monitor, Bell
} from 'lucide-react'
import { authApi }       from '../../api/auth.api'
import { usersApi }      from '../../api/users.api'
import toast             from 'react-hot-toast'
import IntegrationsPage  from './IntegrationsPage'
import { NotificationsTab } from './NotificationPreferencesPage'
import { PasswordField, PasswordStrength, PasswordChecklist, FormAlert } from '../../components/auth/AuthFields'
import { newPasswordSchema, parseApiError } from '../../lib/passwordPolicy'

const TABS = [
  { id: 'profile',      label: 'Profile',      icon: User    },
  { id: 'display',      label: 'Display',      icon: Palette },
  { id: 'security',     label: 'Security',      icon: Shield  },
  { id: 'notifications',label: 'Notifications',  icon: Bell    },
  { id: 'integrations', label: 'Integrations',   icon: Key     },
]

// The 12 pastel presets, single-sourced from brandPresets.js. These are DATA
// (hex values saved to ui_sidebar_color in the DB), never styling — a CSS var
// here would be written to the database and fail hexToRgb() on the next load.
// Accent = the neighbouring hue, mirroring how the washes pair.
const PRESET_PALETTES = BRAND_PRESETS.map((p, i, arr) => ({
  label:   p.name,
  primary: p.hex,
  accent:  arr[(i + 1) % arr.length].hex,
}))

/** Fallback when no personal/org colour is set — Kashi Purple. */
const DEFAULT_HEX = DEFAULT_BRAND_HEX

// ── Shared tab bar ────────────────────────────────────────────────────────────
function Tabs({ active, onChange }) {
  return (
    <div className="flex items-center gap-1 px-6 border-b border-border">
      {TABS.map(t => {
        const Icon = t.icon
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
              active === t.id
                ? 'border-brand-500 text-brand-ink'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}>
            <Icon size={14} />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Profile tab ───────────────────────────────────────────────────────────────
function ProfileTab({ auth, branding, userColor }) {
  const { fullName, email, tenantId, tenantName, roles, vendorId } = auth
  const primaryRole = roles?.[0]
  const roleName    = primaryRole?.roleName?.replace(/_/g, ' ') || '—'
  const roleSide    = primaryRole?.side || '—'
  const isVendor    = vendorId != null || roleSide === 'VENDOR'

  return (
    <div className="grid grid-cols-3 gap-5">
      <div className="col-span-2 flex flex-col gap-5">
        <Card>
          <CardHeader title="Account" icon={User} />
          <CardBody className="flex flex-col gap-4">
            <div className="flex items-center gap-4 pb-4 border-b border-border">
              <div className="w-16 h-16 rounded-card bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-2xl font-bold text-brand-ink shrink-0">
                {initials(fullName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-text-primary">{fullName}</p>
                <p className="text-sm text-text-muted">{email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={cn(
                    'text-[10px] px-2 py-0.5 rounded-full font-semibold border',
                    isVendor
                      ? 'bg-status-warn-bg text-status-warn-fg border-status-warn-bd'
                      : 'bg-brand-500/10 text-brand-ink border-brand-500/20'
                  )}>
                    {roleSide}
                  </span>
                  <span className="text-xs text-text-secondary font-medium">{roleName}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Full Name"     defaultValue={fullName} disabled />
              <Input label="Email Address" defaultValue={email} type="email" disabled />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Workspace" icon={Building2} />
          <CardBody>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-card border border-border bg-surface-overlay p-4">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">Organisation</p>
                <p className="text-base font-bold text-text-primary">{tenantName || `Tenant #${tenantId}`}</p>
                <p className="text-xs text-text-muted mt-0.5">Your workspace</p>
              </div>
              <div className="rounded-card border border-brand-500/20 bg-brand-500/5 p-4">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2">Platform</p>
                <p className="text-base font-bold text-brand-ink">{branding?.companyName || 'KashiGuard'}</p>
                <p className="text-xs text-text-muted mt-0.5">Powered by KashiGuard</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Branding summary */}
      <div>
        <Card>
          <CardHeader title="Workspace Branding" />
          <CardBody className="flex flex-col gap-4">
            <div className="flex gap-3">
              {/* Currently applied color (user's saved or org default) */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-card border-2 border-brand-500 shadow-sm"
                  style={{ background: userColor || branding?.primaryColor || DEFAULT_HEX }} />
                <span className="text-[9px] text-brand-ink font-medium">Applied</span>
              </div>
              {/* Org workspace color */}
              {userColor && userColor !== branding?.primaryColor && (
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-card border border-border shadow-sm opacity-60"
                    style={{ background: isChosenHex(branding?.primaryColor) ? branding.primaryColor : DEFAULT_HEX }} />
                  <span className="text-[9px] text-text-muted">Workspace</span>
                </div>
              )}
              {/* Accent */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-card border border-border shadow-sm"
                  style={{ background: branding?.accentColor || DEFAULT_HEX }} />
                <span className="text-[9px] text-text-muted">Accent</span>
              </div>
            </div>
            {/* Live color scale — reflects currently applied color */}
            <div className="flex gap-0.5 h-4 rounded-ctl overflow-hidden">
              {[50,100,200,300,400,500,600,700,800,900].map(s => (
                <div key={s} className="flex-1" style={{ backgroundColor: `rgb(var(--color-brand-${s}))` }} />
              ))}
            </div>
            <p className="text-[10px] text-text-muted leading-relaxed">
              {userColor && userColor !== branding?.primaryColor
                ? 'Showing your personal color. Workspace color shown faded.'
                : 'Colors set by your workspace administrator.'}
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

// ── Display tab ───────────────────────────────────────────────────────────────
// ── ColorPicker — same as BrandingAdminPage ───────────────────────────────────
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
          <div className="w-9 h-9 rounded-card border border-border shadow-sm cursor-pointer"
            style={{ backgroundColor: value }} />
        </div>
        <input value={value} onChange={e => onChange(e.target.value)}
          className="h-9 flex-1 rounded-card border border-border glass-card px-3 text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
    </div>
  )
}

function DisplayTab({ branding }) {
  const dispatch = useDispatch()
  const { theme, setTheme } = useTheme()

  const [selApp,     setSelApp]     = useState(
    () => { try { return localStorage.getItem('kashi_theme') || 'light' } catch { return 'light' } }
  )
  const [selSidebar, setSelSidebar] = useState(
    () => { try { return localStorage.getItem('kashi_sidebar_theme') || branding?.sidebarTheme || 'dark' } catch { return 'dark' } }
  )
  // User's personal primary color — saved independently of org branding
  const [selColor, setSelColor] = useState(
    () => {
      // The legacy #1e40af backend fallback is not a choice — show the default.
      try { const c = localStorage.getItem('kashi_sidebar_color'); if (isChosenHex(c)) return c } catch {}
      return isChosenHex(branding?.primaryColor) ? branding.primaryColor : DEFAULT_HEX
    }
  )
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const prefs = {
        ui_app_theme:     selApp,
        ui_sidebar_theme: selSidebar,
        ui_sidebar_color: selColor,
      }

      await usersApi.preferences.save(prefs)

      // Apply to localStorage
      try { localStorage.setItem('kashi_theme', selApp) } catch {}
      try { localStorage.setItem('kashi_sidebar_theme', selSidebar) } catch {}
      try { localStorage.setItem('kashi_sidebar_color', selColor) } catch {}

      // Apply app theme
      setTheme(selApp)

      // Apply user's personal color to the ENTIRE app — same as org branding
      // This is the user's personal brand color preference
      applyBranding({ ...branding, primaryColor: selColor }, { force: true })

      // Update Redux so sidebar and all brand-color components re-render
      dispatch(applyBrandingLive({ primaryColor: selColor }))

      window.dispatchEvent(new CustomEvent('kashi-sidebar-changed'))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      alert('Failed to save preferences. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleAppTheme = (t) => setSelApp(t)
  const handleSidebar  = (t) => {
    setSelSidebar(t)
    // Live preview: apply the sidebar theme on click, not only on Save.
    try { localStorage.setItem('kashi_sidebar_theme', t) } catch {}
    window.dispatchEvent(new CustomEvent('kashi-sidebar-changed'))
  }
  const handleColor    = (c) => {
    setSelColor(c)
    // Live preview — update brand CSS vars immediately so bg-brand-* classes react
    dispatch(applyBrandingLive({ primaryColor: c }))
  }

  const APP_THEMES = [
    { id: 'dark',   label: 'Dark',   icon: Moon,    desc: 'Easy on the eyes' },
    { id: 'light',  label: 'Light',  icon: Sun,     desc: 'Classic bright look' },
    { id: 'system', label: 'System', icon: Monitor, desc: 'Follows your OS' },
  ]
  const SIDEBAR_THEMES = [
    { id: 'dark',  label: 'Dark',  preview: 'bg-surface',  desc: 'Classic dark sidebar' },
    { id: 'light', label: 'Light', preview: 'bg-surface-overlay',  desc: 'Clean white sidebar'  },
    { id: 'brand', label: 'Brand', preview: 'bg-brand-600', desc: 'Match your brand color' },
  ]

  return (
    <div className="grid grid-cols-3 gap-5">
      {/* Controls */}
      <div className="col-span-2 flex flex-col gap-5">

        {/* App theme — 3 cards */}
        <Card>
          <CardHeader title="App Theme"
            subtitle="Changes the background, text, and card colors across the whole app" />
          <CardBody>
            <div className="grid grid-cols-3 gap-3">
              {APP_THEMES.map(({ id, label, icon: Icon, desc }) => (
                <button key={id} onClick={() => handleAppTheme(id)}
                  className={cn(
                    'flex flex-col items-start gap-2 p-3 rounded-card border-2 text-left transition-all',
                    selApp === id
                      ? 'border-brand-500 bg-brand-500/5'
                      : 'border-border hover:border-brand-500/30 bg-surface-raised'
                  )}>
                  <div className={cn(
                    'w-8 h-8 rounded-card flex items-center justify-center',
                    selApp === id ? 'bg-brand-500/20' : 'bg-surface-overlay'
                  )}>
                    <Icon size={16} className={selApp === id ? 'text-brand-ink' : 'text-text-muted'} />
                  </div>
                  <div>
                    <p className={cn('text-sm font-semibold', selApp === id ? 'text-brand-ink' : 'text-text-primary')}>
                      {label}
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Sidebar theme — 3 cards */}
        <Card>
          <CardHeader title="Sidebar Theme"
            subtitle="Your personal sidebar style — overrides the workspace default" />
          <CardBody>
            <div className="grid grid-cols-3 gap-3">
              {SIDEBAR_THEMES.map(({ id, label, preview, desc }) => (
                <button key={id} onClick={() => handleSidebar(id)}
                  className={cn(
                    'flex flex-col items-start gap-2 p-3 rounded-card border-2 text-left transition-all',
                    selSidebar === id
                      ? 'border-brand-500 bg-brand-500/5'
                      : 'border-border hover:border-brand-500/30 bg-surface-raised'
                  )}>
                  <div className={cn('w-8 h-8 rounded-card shrink-0', preview)} />
                  <div>
                    <p className={cn('text-sm font-semibold', selSidebar === id ? 'text-brand-ink' : 'text-text-primary')}>
                      {label}
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Your Brand Color — same UI as BrandingAdminPage */}
        <Card>
          <CardHeader title="Your Brand Color"
            subtitle="Your personal color — applies to buttons, links, badges across the entire app" />
          <CardBody className="flex flex-col gap-4">
            {/* Presets */}
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Presets</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_PALETTES.map(p => (
                  <button key={p.label}
                    onClick={() => handleColor(p.primary)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-card border border-border hover:border-brand-500/40 transition-colors text-xs text-text-secondary hover:text-text-primary"
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.primary }} />
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.accent }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Color picker */}
            <div className="grid grid-cols-2 gap-4">
              <ColorPicker label="Primary Color" value={selColor} onChange={handleColor} />
            </div>
            <p className="text-[10px] text-text-muted">
              This overrides the workspace color for you only. Everyone else sees the workspace admin's color.
            </p>
          </CardBody>
        </Card>

        {/* Save button */}
        <div className="flex items-center justify-between p-4 rounded-card border border-brand-500/20 bg-brand-500/5">
          <div>
            <p className="text-sm font-semibold text-text-primary">Save Preferences</p>
            <p className="text-xs text-text-muted mt-0.5">Persists across refresh, logout, and all your sessions</p>
          </div>
          <button onClick={handleSave} disabled={saving}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-card text-sm font-semibold transition-all disabled:opacity-60',
              saved
                ? 'bg-status-pass-bg text-status-pass-fg border border-status-pass-bd'
                : 'bg-brand-500 text-brand-on hover:bg-brand-600'
            )}>
            {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Preferences'}
          </button>
        </div>
      </div>

      {/* Live preview — reacts instantly to both theme + sidebar selections */}
      <div className="sticky top-4">
        <Card>
          <CardHeader title="Live Preview" subtitle="Updates instantly" />
          <CardBody className="flex flex-col gap-4">

            {/* Mini app */}
            <div className="rounded-card overflow-hidden border border-border">
              <div className="flex h-40">
                {/* Sidebar */}
                <div className={cn(
                  'w-12 flex flex-col items-center py-3 gap-2 shrink-0',
                  selSidebar === 'light' ? 'bg-surface-raised border-r border-border-subtle'
                  : selSidebar === 'brand' ? ''
                  : 'bg-surface'
                )} style={selSidebar === 'brand' ? { backgroundColor: selColor } : undefined}>
                  <div className="w-6 h-6 rounded-ctl mb-1" style={{ backgroundColor: selColor }} />
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className={cn(
                      'w-5 h-1.5 rounded-full',
                      i === 1
                        ? (selSidebar === 'brand' ? 'bg-surface-raised' : 'bg-brand-fill')
                        : (selSidebar === 'light' ? 'bg-surface-inset' : 'bg-on-dark/20')
                    )} />
                  ))}
                </div>
                {/* Content */}
                <div className={cn(
                  'flex-1 flex flex-col',
                  selApp === 'light' ? 'bg-surface-overlay' : 'bg-surface-raised'
                )}>
                  {/* Topbar */}
                  <div className={cn(
                    'h-8 flex items-center justify-between px-2 border-b shrink-0',
                    selApp === 'light' ? 'border-border-subtle bg-surface-raised' : 'border-border bg-surface'
                  )}>
                    <div className={cn('h-1.5 rounded w-16', selApp === 'light' ? 'bg-surface-inset' : 'bg-border')} />
                    <div className="w-5 h-5 rounded-full" style={{ backgroundColor: selColor }} />
                  </div>
                  {/* Cards */}
                  <div className="flex-1 p-2 grid grid-cols-2 gap-1.5">
                    {[1,2,3,4].map(i => (
                      <div key={i} className={cn(
                        'rounded-card border p-1.5',
                        selApp === 'light' ? 'bg-surface-raised border-border-subtle' : 'bg-surface border-border'
                      )}>
                        <div className={cn('h-1.5 rounded-full mb-1.5',
                          i === 1
                            ? (selApp === 'light' ? 'bg-surface-inset w-2/3' : 'bg-brand-fill w-2/3')
                            : (selApp === 'light' ? 'bg-surface-inset w-full' : 'bg-border w-full')
                        )} />
                        <div className={cn('h-1 rounded-full', selApp === 'light' ? 'bg-surface-overlay' : 'bg-border/50')} />
                      </div>
                    ))}
                  </div>
                  {/* Action button */}
                  <div className="p-2">
                    {/* Live-painted by the theme engine, so the label uses the
                        contrast-solved on-brand ink rather than assuming white. */}
                    <div className="h-5 rounded-ctl flex items-center justify-center bg-brand-500">
                      <span className="text-[8px] text-brand-on font-semibold">Primary Action</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Color scale */}
            <div>
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Brand Scale</p>
              <div className="flex gap-0.5 h-4 rounded-ctl overflow-hidden">
                {[50,100,200,300,400,500,600,700,800,900].map(s => (
                  <div key={s} className="flex-1" style={{ backgroundColor: `rgb(var(--color-brand-${s}))` }} />
                ))}
              </div>
            </div>

            {/* Color dots */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-card border border-border"
                  style={{ background: selColor }} />
                <span className="text-[9px] text-text-muted">Your Color</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-card border border-border"
                  style={{ background: isChosenHex(branding?.primaryColor) ? branding.primaryColor : DEFAULT_HEX }} />
                <span className="text-[9px] text-text-muted">Workspace</span>
              </div>
            </div>

            <p className="text-[10px] text-text-muted">
              Your color overrides workspace color for you only.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

// ── Security tab ──────────────────────────────────────────────────────────────
const securitySchema = z.object({
  current: z.string().min(1, 'Enter your current password'),
  next:    newPasswordSchema,
  confirm: z.string().min(1, 'Re-enter the new password'),
})
  .refine(d => d.next === d.confirm, { message: "Passwords don't match", path: ['confirm'] })
  .refine(d => !d.current || d.next !== d.current, { message: 'Choose a password different from your current one', path: ['next'] })

/**
 * Change own password. Same policy, components and error handling as the
 * reset screens: the requirement checklist is live, and the server's verdict
 * ("Current password is incorrect", reuse, policy) lands on the right field
 * instead of a generic toast. The old form allowed 8 characters while the
 * server required 12, so most attempts failed with "Request validation failed".
 */
function SecurityTab() {
  const { register, handleSubmit, watch, reset, setError, formState: { errors } } = useForm({
    resolver: zodResolver(securitySchema),
    defaultValues: { current: '', next: '', confirm: '' },
    mode: 'onTouched',
  })
  const next = watch('next') || ''

  const { mutate, isPending, error, reset: resetMutation } = useMutation({
    mutationFn: (d) => usersApi.changePassword({ currentPassword: d.current, newPassword: d.next }),
    onSuccess: () => {
      toast.success('Password updated')
      reset()
    },
    // Handled inline below — suppress the global mutation toast.
    onError: (err) => {
      const map = { currentPassword: 'current', newPassword: 'next' }
      const { fields } = parseApiError(err)
      Object.entries(fields).forEach(([k, msg]) => {
        if (map[k]) setError(map[k], { type: 'server', message: msg })
      })
    },
    meta: { silent: true },
  })

  const apiErr = useMemo(() => {
    if (!error) return null
    const { form } = parseApiError(error, "We couldn't update your password. Please try again.")
    return form
  }, [error])

  return (
    <div className="max-w-lg flex flex-col gap-5">
      <Card>
        <CardHeader title="Change password" icon={Key}
          subtitle="You'll stay signed in on this device after changing it." />
        <CardBody>
          {apiErr && <FormAlert tone="fail">{apiErr}</FormAlert>}
          <form onSubmit={handleSubmit(d => { resetMutation(); mutate(d) })} noValidate className="flex flex-col gap-4">
            <PasswordField label="Current password" autoComplete="current-password"
              error={errors.current?.message} {...register('current')} />
            <div>
              <PasswordField label="New password" autoComplete="new-password"
                placeholder="At least 12 characters"
                error={errors.next?.message} {...register('next')} />
              <PasswordStrength value={next} />
              <PasswordChecklist value={next} />
            </div>
            <PasswordField label="Confirm new password" autoComplete="new-password"
              error={errors.confirm?.message} {...register('confirm')} />
            <div className="flex justify-end pt-1">
              <Button type="submit" size="md" loading={isPending}>Update password</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [tab,  setTab]  = useState('profile')
  const branding        = useSelector(selectBranding)
  const auth            = useSelector(selectAuth)

  return (
    <PageLayout title="Settings" subtitle="Account preferences and display settings">
      <Tabs active={tab} onChange={setTab} />
      <div className="p-6">
        {tab === 'profile'  && <ProfileTab  auth={auth} branding={branding} userColor={(() => { try { return localStorage.getItem('kashi_sidebar_color') } catch { return null } })()} />}
        {tab === 'display'  && <DisplayTab  branding={branding} />}
        {tab === 'security'      && <SecurityTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'integrations'  && <IntegrationsPage />}
      </div>
    </PageLayout>
  )
}