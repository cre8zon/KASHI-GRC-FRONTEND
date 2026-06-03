import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GitBranch } from 'lucide-react'
import { sdApi } from '../sdApi'
import { InspectorSection } from '../shared/InspectorHelpers'

function WorkflowStepVisibility({ screenKey, actionKey }) {
  const { data } = useQuery({ queryKey: ['sd-workflows'], queryFn: sdApi.listWorkflows, staleTime: 120_000 })
  const workflows = data?.data?.items || data?.items || (Array.isArray(data?.data) ? data.data : null) || []

  // Find steps that reference this screenKey in navKey, sectionScreenKey, or itemScreenKey
  const relevantSteps = useMemo(() => {
    const steps = []
    workflows.forEach(wf => {
      (wf.steps || []).forEach(step => {
        if (step.navKey === screenKey ||
            (step.sections || []).some(s => s.sectionScreenKey === screenKey || s.itemScreenKey === screenKey)) {
          steps.push({ wfName: wf.name, stepName: step.name, stepOrder: step.stepOrder, side: step.side })
        }
      })
    })
    return steps
  }, [workflows, screenKey])

  if (relevantSteps.length === 0) return null

  return (
    <InspectorSection title="Used in workflow steps">
      <div className="space-y-1">
        {relevantSteps.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-[9px] px-2 py-1.5 rounded bg-surface-overlay border border-border">
            <GitBranch size={10} className="text-text-muted shrink-0" />
            <span className="text-text-muted truncate">{s.wfName}</span>
            <span className="text-text-secondary shrink-0">Step {s.stepOrder}: {s.stepName}</span>
          </div>
        ))}
      </div>
    </InspectorSection>
  )
}


export { WorkflowStepVisibility }
