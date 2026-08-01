import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Layers, List, Eye, EyeOff, Plus, Search, Settings, Code2, Copy, ChevronRight, ChevronDown, GitBranch, Shield, Users, Zap, X, Save, RefreshCw, Lock, Unlock, MousePointerClick, Table2, Layout, PanelLeft, FileEdit, Square, ArrowRight, CheckCircle2, AlertTriangle, GripVertical, Pencil, Trash2, Link2, ExternalLink, Info, Hash, Columns2, SlidersHorizontal, Flag, Tag, Activity, PanelRight, Calendar, User, FileText } from 'lucide-react'
import { cn } from '../../../lib/cn'
import api from '../../../config/axios.config'
import toast from 'react-hot-toast'
import { sdApi } from '../sdApi'
import { CanvasCard } from '../shared/CanvasCard'
import { InspectorSection, IField, IInp, ISel, Row } from '../shared/InspectorHelpers'
import { MOCK_ITEMS, MOCK_RECORDS, CAPABILITY_TABS, isCapabilityTab,
         LAYOUT_MODES, FIELD_TYPES, FIELD_TYPE_GROUPS, SIDES } from '../constants'


function PageCanvas({ screen, selectedElement, onSelectElement, actions }) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] text-text-muted px-1 pb-1">
        Full workflow step page. Configure which sections and panels appear.
      </div>
      <CanvasCard label="Page layout" hint="configure the primary content area">
        <div className="flex gap-3 p-3 min-h-40">
          <div className="flex-1 border border-dashed border-border rounded-card p-3 flex items-center justify-center text-[10px] text-text-muted cursor-pointer hover:border-brand-500/40 hover:text-brand-ink transition-colors"
            onClick={() => onSelectElement({ type: 'page_main', screenKey: screen.key })}>
            Primary content area
          </div>
          <div className="w-44 border border-dashed border-border rounded-card p-3 flex items-center justify-center text-[10px] text-text-muted cursor-pointer hover:border-brand-500/40 hover:text-brand-ink transition-colors"
            onClick={() => onSelectElement({ type: 'page_sidebar', screenKey: screen.key })}>
            Sidebar
          </div>
        </div>
      </CanvasCard>
    </div>
  )
}


export { PageCanvas }
