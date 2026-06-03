import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Layers, List, Eye, EyeOff, Plus, Search, Settings, Code2, Copy, ChevronRight, ChevronDown, GitBranch, Shield, Users, Zap, X, Save, RefreshCw, Lock, Unlock, MousePointerClick, Table2, Layout, PanelLeft, FileEdit, Square, ArrowRight, CheckCircle2, AlertTriangle, GripVertical, Pencil, Trash2, Link2, ExternalLink, Info, Hash, Columns2, SlidersHorizontal, Flag, Tag, Activity, PanelRight, Calendar, User, FileText } from 'lucide-react'
import { cn } from '../../../lib/cn'
import api from '../../../config/axios.config'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { sdApi } from '../sdApi'
import { Button } from '../../ui/Button'
import { InspectorSection, Row, IField, IInp, ISel } from '../shared/InspectorHelpers'
import { SIDES, HTTP_METHODS, ACTION_VARIANTS, LAYOUT_MODES,
         SCREEN_TYPES, FIELD_TYPES, FIELD_TYPE_GROUPS, CAPABILITY_TABS } from '../constants'

import { RoleVisibilityEditor } from './RoleVisibilityEditor'
import { LayoutModeInspector } from './LayoutModeInspector'

function ScreenLevelInspector({ screen, screenType, onSelectScreen }) {
  return (
    <div className="p-4 space-y-5">
      {/* Type + key */}
      <InspectorSection title="Identity">
        <Row label="Screen key">
          <code className="text-[10px] font-mono text-brand-400">{screen.key}</code>
        </Row>
        <Row label="Type">
          {screenType && (
            <span className={cn('text-[10px] px-2 py-0.5 rounded border font-medium', screenType.color)}>
              {screenType.label}
            </span>
          )}
        </Row>
        <Row label="Referenced as">
          <code className="text-[9px] font-mono text-text-muted">{screenType?.fieldName}</code>
        </Row>
      </InspectorSection>

      {/* Role visibility */}
      <RoleVisibilityEditor screenKey={screen.key} />

      {/* Layout mode — DETAIL screens only */}
      {screen.type === 'DETAIL' && (
        <LayoutModeInspector screenKey={screen.key} />
      )}

      {/* Cross-links */}
      {screen.type === 'SECTION' && (
        <InspectorSection title="Linked screens">
          <p className="text-[10px] text-text-muted mb-2">Items in this section render with:</p>
          <button
            onClick={() => onSelectScreen({ key: screen.key.replace('_section', '_item').replace('section_', 'item_'), type: 'ITEM_CARD' })}
            className="w-full flex items-center gap-2 p-2 rounded border border-brand-500/20 bg-brand-500/5 text-[10px] text-brand-400 hover:bg-brand-500/10 transition-colors">
            <ArrowRight size={11} />
            <span>itemScreenKey →</span>
            <code className="font-mono ml-auto">{screen.key.replace('_section', '_item').replace('section_', 'item_')}</code>
          </button>
        </InspectorSection>
      )}

      {/* Live endpoint */}
      <InspectorSection title="Endpoint">
        <div className="flex items-center gap-2 p-2 rounded bg-surface-overlay border border-border">
          <code className="text-[9px] font-mono text-text-muted flex-1 truncate">GET /v1/ui-config/screen/{screen.key}</code>
          <a href={`/v1/ui-config/screen/${screen.key}`} target="_blank" rel="noreferrer">
            <ExternalLink size={11} className="text-text-muted hover:text-brand-400 transition-colors" />
          </a>
        </div>
      </InspectorSection>
    </div>
  )
}


export { ScreenLevelInspector }
