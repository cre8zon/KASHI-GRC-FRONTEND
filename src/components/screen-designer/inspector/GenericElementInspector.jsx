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
import { WorkflowStepVisibility } from './WorkflowStepVisibility'

function GenericElementInspector({ element, screenKey }) {
  return (
    <div className="p-4 space-y-4">
      <InspectorSection title={element.label || element.type}>
        <p className="text-[10px] text-text-muted">Configure visibility rules for this element.</p>
      </InspectorSection>
      <RoleVisibilityEditor screenKey={screenKey} />
      <WorkflowStepVisibility screenKey={screenKey} />
    </div>
  )
}


export { GenericElementInspector }
