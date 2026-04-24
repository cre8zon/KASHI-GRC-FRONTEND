import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { compoundTaskApi } from '../api/compoundTask.api'
import { useWorkflowSocket } from './useWorkflowSocket'
import toast from 'react-hot-toast'
 
/**
 * Core hook — drop into any work page that participates in compound tasks.
 *
 * const taskInstanceId = Number(new URLSearchParams(location.search).get('taskId'))
 * const { sections, isAllDone, autoSave } = useCompoundTask(taskInstanceId)
 */
export function useCompoundTask(taskInstanceId) {
  const qc  = useQueryClient()
  const key = ['compound-progress', taskInstanceId]
 
  const { data: sections = [], isLoading } = useQuery({
    queryKey: key,
    queryFn:  () => compoundTaskApi.progress(taskInstanceId),
    enabled:  !!taskInstanceId,
    staleTime: 15_000,
  })
 
  // Live refresh from WebSocket SECTION_PROGRESS events
  const { lastMessage } = useWorkflowSocket()
  useEffect(() => {
    if (!lastMessage) return
    try {
      const msg = JSON.parse(lastMessage.data || '{}')
      if ((msg.type === 'SECTION_PROGRESS' || msg.type === 'SECTION_ITEM_COMPLETED')
          && msg.taskInstanceId === taskInstanceId) {
        qc.invalidateQueries({ queryKey: key })
      }
    } catch (_) {}
  }, [lastMessage, taskInstanceId])
 
  const isAllDone = sections.length > 0
    && sections.filter(s => s.required).every(s => s.completed)
 
  // Draft auto-save with 30s debounce
  const { mutate: saveDraftMutation } = useMutation({
    mutationFn: (data) => compoundTaskApi.saveDraft(taskInstanceId, data),
    onError: () => {} // silent — draft failures don't interrupt user
  })
  const timer = useRef(null)
  const autoSave = (data) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (taskInstanceId) saveDraftMutation(data)
    }, 30_000)
  }
 
  return { sections, isLoading, isAllDone, autoSave, saveDraftNow: saveDraftMutation }
}
 
export function useDraft(taskInstanceId) {
  return useQuery({
    queryKey: ['compound-draft', taskInstanceId],
    queryFn:  () => compoundTaskApi.getDraft(taskInstanceId),
    enabled:  !!taskInstanceId,
    staleTime: Infinity,
  })
}
 
export function useSectionAssign(taskInstanceId, sectionKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assigneeUserIds, notes }) =>
      compoundTaskApi.assignSection(taskInstanceId, sectionKey, assigneeUserIds, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compound-progress', taskInstanceId] })
      toast.success('Work assigned')
    },
    onError: (e) => toast.error(e?.message || 'Assignment failed'),
  })
}
 
export function useCompleteItem(taskInstanceId, sectionKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, outcome, notes, artifactType, artifactId }) =>
      compoundTaskApi.completeItem(taskInstanceId, sectionKey, itemId,
        { outcome, notes, artifactType, artifactId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compound-progress', taskInstanceId] }),
    onError: (e) => toast.error(e?.message || 'Failed to save'),
  })
}