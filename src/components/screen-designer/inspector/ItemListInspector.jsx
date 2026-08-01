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

function ItemListInspector({ screenKey, onNavigate }) {
  const linkedItemKey = screenKey.replace('_section', '_item').replace('section_', 'item_')
  return (
    <div className="p-4 space-y-4">
      <InspectorSection title="Item list">
        <p className="text-[10px] text-text-muted">Items in this section are rendered using the itemScreenKey below. Click to configure the item card.</p>
        <button onClick={() => onNavigate(linkedItemKey)}
          className="w-full flex items-center gap-2 p-2.5 rounded-card border border-brand-500/25 bg-brand-500/5 text-[10px] text-brand-ink hover:bg-brand-500/10 transition-colors mt-2">
          <ArrowRight size={12} />
          <div className="flex-1 text-left">
            <div className="font-medium">Item card screen</div>
            <code className="text-[9px] font-mono opacity-70">{linkedItemKey}</code>
          </div>
          <ExternalLink size={11} />
        </button>
      </InspectorSection>
      <RoleVisibilityEditor screenKey={screenKey} />
    </div>
  )
}


export { ItemListInspector }
