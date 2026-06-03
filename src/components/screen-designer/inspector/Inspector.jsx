import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, X } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { ScreenLevelInspector } from './ScreenLevelInspector'
import { ActionInspector } from './ActionInspector'
import { ColumnInspector } from './ColumnInspector'
import { TabInspector } from './TabInspector'
import { NewDetailTabInspector } from './NewDetailTabInspector'
import { SectionHeaderInspector } from './SectionHeaderInspector'
import { ItemFieldsInspector } from './ItemFieldsInspector'
import { ItemListInspector } from './ItemListInspector'
import { FormFieldInspector } from './FormFieldInspector'
import { FormSubmitInspector } from './FormSubmitInspector'
import { LayoutModeInspector } from './LayoutModeInspector'
import { HeaderZoneInspector } from './HeaderZoneInspector'
import { TabContentInspector } from './TabContentInspector'
import { GenericElementInspector } from './GenericElementInspector'

function Inspector({ screen, screenType, selectedElement, onSelectElement, onSelectScreen }) {
  const qc = useQueryClient()

  if (!screen) {
    return (
      <div className="w-64 shrink-0 border-l border-border bg-surface flex flex-col items-center justify-center p-6 text-center">
        <Settings size={20} className="text-text-muted mb-3" />
        <p className="text-xs font-medium text-text-secondary">Inspector</p>
        <p className="text-[10px] text-text-muted mt-1">Select a screen to start configuring</p>
      </div>
    )
  }

  return (
    <div className="w-72 shrink-0 border-l border-border bg-surface flex flex-col overflow-hidden">
      {/* Inspector header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-1">
          {selectedElement
            ? <span className="text-xs font-semibold text-text-primary">{selectedElement.label || selectedElement.type?.replace(/_/g, ' ')}</span>
            : <span className="text-xs font-semibold text-text-primary">Screen config</span>
          }
          {selectedElement && (
            <button onClick={() => onSelectElement(null)}
              className="ml-auto p-0.5 text-text-muted hover:text-text-primary transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
        {selectedElement && (
          <p className="text-[9px] text-text-muted">{screen.key}</p>
        )}
      </div>

      {/*
        FIX: Stale useState — when the user clicks from element A to element B of the same type
        (e.g. action → action, column → column), React reuses the mounted sub-inspector and
        useState keeps the previous element's values. Adding a unique key here forces React to
        unmount and remount the entire panel content whenever the selected element changes,
        guaranteeing fresh state and resetting the scroll position automatically.
      */}
      <div
        key={selectedElement
          ? `${selectedElement.type}-${selectedElement.id ?? selectedElement.tab ?? selectedElement.data?.key ?? selectedElement.screenKey ?? 'x'}`
          : `none-${screen.key}`}
        className="flex-1 overflow-y-auto"
      >
        {/* No element selected: screen-level config */}
        {!selectedElement && (
          <ScreenLevelInspector screen={screen} screenType={screenType} onSelectScreen={onSelectScreen} />
        )}

        {/* Action selected/new */}
        {(selectedElement?.type === 'action' || selectedElement?.type === 'new_action') && (
          <ActionInspector
            initial={selectedElement?.data}
            screenKey={screen.key}
            onSave={() => { qc.invalidateQueries({ queryKey: ['sd-actions', screen.key] }); onSelectElement(null) }}
          />
        )}

        {/* Column selected/new */}
        {(selectedElement?.type === 'column' || selectedElement?.type === 'new_column') && (
          <ColumnInspector
            initial={selectedElement?.data}
            screenKey={screen.key}
            onSave={() => { qc.invalidateQueries({ queryKey: ['sd-layout', screen.key] }); onSelectElement(null) }}
          />
        )}

        {/* Tab visibility — now receives tabKey and layout for rename/delete */}
        {selectedElement?.type === 'tab' && (
          <TabInspector
            tab={selectedElement.tab}
            tabKey={selectedElement.tabKey}
            screenKey={screen.key}
            layout={selectedElement.layout}
          />
        )}

        {/* New detail tab — add a custom tab to this DETAIL screen's tabsJson */}
        {selectedElement?.type === 'new_detail_tab' && (
          <NewDetailTabInspector
            screenKey={screen.key}
            layout={selectedElement?.layout}
            onSave={() => { qc.invalidateQueries({ queryKey: ['sd-layout', screen.key] }); onSelectElement(null) }}
          />
        )}

        {/* Header zone — configure fields above the tabs (title, status, metadata) */}
        {selectedElement?.type === 'header_zone' && (
          <HeaderZoneInspector
            screenKey={screen.key}
            onSelectElement={onSelectElement}
          />
        )}

        {/* Tab content — configure fields inside a configurable tab (Overview, custom tabs) */}
        {selectedElement?.type === 'detail_tab_content' && (
          <TabContentInspector
            tab={selectedElement.tab}
            tabKey={selectedElement.tabKey}
            screenKey={screen.key}
            onSelectElement={onSelectElement}
          />
        )}

        {/* Section header config */}
        {selectedElement?.type === 'section_header' && (
          <SectionHeaderInspector screenKey={screen.key} />
        )}

        {/* Item fields */}
        {selectedElement?.type === 'item_fields' && (
          <ItemFieldsInspector screenKey={screen.key} />
        )}

        {/* Item list — shows link to itemScreenKey */}
        {selectedElement?.type === 'item_list' && (
          <ItemListInspector screenKey={screen.key} onNavigate={(k) => onSelectScreen({ key: k, type: 'ITEM_CARD' })} />
        )}

        {/* Form field — edit existing or create new */}
        {(selectedElement?.type === 'form_field' || selectedElement?.type === 'new_form_field') && (
          <FormFieldInspector
            initial={selectedElement?.type === 'form_field' ? selectedElement?.data : null}
            formId={selectedElement?.formId}
            screenKey={screen.key}
            onSave={() => {
              const fid = selectedElement?.formId
              qc.invalidateQueries({ queryKey: ['sd-form-fields', fid] })
              qc.invalidateQueries({ queryKey: ['sd-form', screen.key] })
              onSelectElement(null)
            }}
          />
        )}

        {/* FIX: Form submit config — configure the built-in Submit button's endpoint */}
        {selectedElement?.type === 'form_submit_config' && (
          <FormSubmitInspector
            screenKey={screen.key}
            onSave={() => {
              qc.invalidateQueries({ queryKey: ['sd-form', screen.key] })
              onSelectElement(null)
            }}
          />
        )}

        {/* FIX: Form cancel config — Cancel is purely client-side (close modal / navigate back) */}
        {selectedElement?.type === 'form_cancel_config' && (
          <div className="p-4 space-y-3">
            <InspectorSection title="Cancel button">
              <p className="text-[10px] text-text-muted">
                The Cancel button is built-in. It closes the modal or navigates the user back —
                no API call is made. No configuration is required.
              </p>
            </InspectorSection>
          </div>
        )}

        {/* Layout mode inspector — clicking the mode badge in DetailCanvas */}
        {selectedElement?.type === 'screen_layout_mode' && (
          <LayoutModeInspector screenKey={selectedElement.screenKey || screen.key} />
        )}

        {/* Generic selected elements with visibility rules */}
        {['side_panel', 'side_tab', 'item_header', 'page_main', 'page_sidebar'].includes(selectedElement?.type) && (
          <GenericElementInspector element={selectedElement} screenKey={screen.key} />
        )}
      </div>
    </div>
  )
}


export { Inspector }
