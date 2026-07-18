/**
 * ScreenDesignerPage — 3-panel IDE for designing all screen types.
 * Route: /admin/screen-designer
 *
 * This file is the thin orchestrator only — all sub-components live in:
 *   src/components/screen-designer/
 */
import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Layers, Plus, PanelLeft, PanelRight, Eye, Code2 } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { Button } from '../../../components/ui/Button'
import api from '../../../config/axios.config'
import toast from 'react-hot-toast'

// ── Screen Designer components ────────────────────────────────────────────────
import { useScreenRegistry }     from '../../../components/screen-designer/hooks'
import { SCREEN_TYPES, ROLE_PROFILES } from '../../../components/screen-designer/constants'
import { sdApi }                 from '../../../components/screen-designer/sdApi'
import { Navigator }             from '../../../components/screen-designer/Navigator'
import { Canvas }                from '../../../components/screen-designer/canvas/Canvas'
import { Inspector }             from '../../../components/screen-designer/inspector/Inspector'
import { ElementsTab }           from '../../../components/screen-designer/ElementsTab'
import { JsonPreviewTab }        from '../../../components/screen-designer/JsonPreviewTab'
import { KeyDifferentiatorBar }  from '../../../components/screen-designer/KeyDifferentiatorBar'
import { CreateScreenModal }     from '../../../components/screen-designer/modals/CreateScreenModal'
import { TemplateGallery }       from '../../../components/screen-designer/modals/TemplateGallery'
import { TemplatePicker }        from '../../../components/screen-designer/modals/TemplatePicker'

export default function ScreenDesignerPage() {
  const [selectedScreen,   setSelectedScreen]   = useState(null)
  const [selectedElement,  setSelectedElement]  = useState(null)
  const [typeFilter,       setTypeFilter]       = useState(null)
  const [search,           setSearch]           = useState('')
  const [createOpen,       setCreateOpen]       = useState(false)
  const [selectedRole,     setSelectedRole]     = useState('vendor_responder')
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false)
  const [activeTab,        setActiveTab]        = useState('preview')
  const [navOpen,          setNavOpen]          = useState(true)    // left navigator
  const [inspOpen,         setInspOpen]         = useState(true)    // right inspector

  const screens = useScreenRegistry()
  const qc = useQueryClient()

  // selectScreen must be defined before handleCreate (used in its dependency array)
  const selectScreen = useCallback((screen) => {
    setSelectedScreen(screen)
    setSelectedElement(null)
    setActiveTab('preview')
  }, [])

  // Auto-draft: immediately persist a DB record for every new screen so it
  // appears in the sidebar registry and survives a page refresh.
  // FORM  → creates a ui_forms row  (formKey = screen.key)
  // Other → creates an empty ui_layouts row (layoutKey = screen.key) as the anchor
  const handleCreate = useCallback(async (screen) => {
    try {
      if (screen.type === 'FORM') {
        await sdApi.createForm({
          formKey:    screen.key,
          title:      screen.key,
          submitUrl:  '',
          httpMethod: 'POST',
        })
        qc.invalidateQueries({ queryKey: ['sd-all-forms'] })
      } else {
        await api.post('/v1/admin/ui/layouts', {
          layoutKey:      screen.key,
          screen:         screen.key,
          title:          screen.label || screen.key,
          columnsJson:    '[]',
          filtersJson:    '[]',
          roleAccessJson: '{}',
          selectable:     false,
          reorderable:    false,
        })
        qc.invalidateQueries({ queryKey: ['sd-all-layouts'] })
      }
    } catch (e) {
      // Screen may already exist in DB — that is fine, just select it
      console.warn('[Screen Designer] Auto-draft:', e?.response?.data?.message || e.message)
    }
    setCreateOpen(false)
    selectScreen(screen)
  }, [qc, selectScreen])

  const filteredScreens = screens.filter(s =>
    (!typeFilter || s.type === typeFilter) &&
    (!search || s.key.toLowerCase().includes(search.toLowerCase()))
  )

  const screenType = selectedScreen
    ? (SCREEN_TYPES[selectedScreen.type] || SCREEN_TYPES.SECTION)
    : null

  const roleProfile = ROLE_PROFILES[selectedRole]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ══ TOPBAR ══════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 px-4 border-b border-border bg-surface shrink-0" style={{ height: 48 }}>
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-brand-ink" />
          <span className="text-sm font-semibold text-text-primary">Screen designer</span>
        </div>

        {/* Key differentiator pills — always visible once a screen is selected */}
        {selectedScreen && (
          <KeyDifferentiatorBar screen={selectedScreen} inline />
        )}

        <div className="flex-1" />

        {/* Panel toggles */}
        <div className="flex items-center gap-1 mr-2">
          <button
            onClick={() => setNavOpen(o => !o)}
            title={navOpen ? 'Hide navigator' : 'Show navigator'}
            className={cn('flex items-center gap-1 h-7 px-2.5 text-[11px] rounded border transition-colors',
              navOpen
                ? 'bg-brand-500/10 border-brand-500/25 text-brand-ink'
                : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary')}>
            <PanelLeft size={13} />
          </button>
          <button
            onClick={() => setInspOpen(o => !o)}
            title={inspOpen ? 'Hide inspector' : 'Show inspector'}
            className={cn('flex items-center gap-1 h-7 px-2.5 text-[11px] rounded border transition-colors',
              inspOpen
                ? 'bg-brand-500/10 border-brand-500/25 text-brand-ink'
                : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary')}>
            <PanelRight size={13} />
          </button>
        </div>
        <div className="w-px h-5 bg-border mx-1" />

        {/* Role simulator */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-text-muted">Preview as</span>
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
            className="h-7 px-2 text-[11px] bg-surface-overlay border border-border rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <optgroup label="Vendor side">
              <option value="vendor_responder">Vendor responder (FILL)</option>
              <option value="vendor_contributor">Vendor contributor (FILL)</option>
              <option value="vendor_vrm">VRM — coordinator (ACKNOWLEDGE)</option>
              <option value="vendor_ciso">Vendor CISO (ASSIGN)</option>
            </optgroup>
            <optgroup label="Org side">
              <option value="org_reviewer">Org reviewer (REVIEW)</option>
              <option value="org_ciso_sod">Org CISO — SoD active (EVALUATE)</option>
            </optgroup>
            <optgroup label="External">
              <option value="auditor">Auditor (REVIEW)</option>
              <option value="auditee">Auditee (FILL)</option>
            </optgroup>
          </select>
          {roleProfile?.sod && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-status-fail-bg border border-status-fail-bd text-status-fail-fg font-medium">
              SoD active
            </span>
          )}
        </div>

        <div className="w-px h-5 bg-border" />

        <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>New screen</Button>
        <button onClick={() => setTemplatePanelOpen(true)}
          className="flex items-center gap-1.5 h-7 px-3 text-[11px] font-medium text-brand-ink bg-brand-500/8 hover:bg-brand-500/15 border border-brand-500/25 hover:border-brand-500/50 rounded transition-colors">
          <Layers size={12} /> Templates
        </button>
      </div>

      {/* ══ BODY: left nav + canvas + inspector ═════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ╔══ LEFT: Navigator (collapsible) ══════════════════════════════╗ */}
        {navOpen && (
          <Navigator
            screens={filteredScreens}
            selectedKey={selectedScreen?.key}
            search={search}
            setSearch={setSearch}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            onSelect={selectScreen}
            onNew={() => setCreateOpen(true)}
            onOpenTemplates={() => setTemplatePanelOpen(true)}
          />
        )}

        {/* ╔══ CENTRE: canvas ════════════════════════════════════════════╗ */}
        <div className="flex-1 overflow-hidden flex flex-col bg-surface">
          {!selectedScreen ? (

            /* ── Landing / template gallery ── */
            <TemplateGallery
              onSelect={(tmpl) => selectScreen({ key: tmpl.itemKey || tmpl.sectionKey, type: tmpl.screenType, label: tmpl.label })}
              onBlank={() => setCreateOpen(true)}
            />

          ) : (
            <>
              {/* Canvas tab bar */}
              <div className="flex items-center border-b border-border/40 bg-surface shrink-0 px-2">
                {[
                  { key: 'preview',  label: 'Preview',  icon: Eye },
                  { key: 'elements', label: 'Elements', icon: Layers },
                  { key: 'json',     label: 'JSON output', icon: Code2 },
                ].map(({ key, label, icon: Icon }) => (
                  <button key={key}
                    onClick={() => setActiveTab(key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 -mb-px transition-colors',
                      activeTab === key
                        ? 'border-brand-400 text-brand-ink'
                        : 'border-transparent text-text-muted hover:text-text-secondary'
                    )}>
                    <Icon size={11} />{label}
                  </button>
                ))}
                {/* role note */}
                <div className="ml-auto flex items-center gap-2 pr-3 text-[10px] text-text-muted">
                  {roleProfile?.sod && <span className="text-status-fail-fg font-medium">⚠ SoD active</span>}
                  Previewing as <span className="text-brand-ink font-medium">{roleProfile?.label}</span>
                  <span className="opacity-40">·</span>
                  <span>{roleProfile?.stepAction}</span>
                </div>
              </div>

              {/* Tab panels */}
              {activeTab === 'preview' && (
                <Canvas
                  screen={selectedScreen}
                  screenType={screenType}
                  selectedElement={selectedElement}
                  onSelectElement={setSelectedElement}
                  roleProfile={roleProfile}
                />
              )}
              {activeTab === 'elements' && (
                <ElementsTab
                  screen={selectedScreen}
                  screenType={screenType}
                  selectedElement={selectedElement}
                  onSelectElement={setSelectedElement}
                  roleProfile={roleProfile}
                />
              )}
              {activeTab === 'json' && (
                <JsonPreviewTab screen={selectedScreen} />
              )}
            </>
          )}
        </div>

        {/* ╔══ RIGHT: Inspector (collapsible) ════════════════════════════╗ */}
        {inspOpen && (
          <Inspector
            screen={selectedScreen}
            screenType={screenType}
            selectedElement={selectedElement}
            onSelectElement={setSelectedElement}
            onSelectScreen={selectScreen}
          />
        )}
      </div>

      {createOpen && (
        <CreateScreenModal
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
        />
      )}

      {templatePanelOpen && (
        <TemplatePicker
          onClose={() => setTemplatePanelOpen(false)}
          onApply={(tmpl) => {
            setTemplatePanelOpen(false)
            selectScreen({ key: tmpl.itemKey || tmpl.sectionKey, type: tmpl.screenType, label: tmpl.label })
          }}
        />
      )}
    </div>
  )
}

