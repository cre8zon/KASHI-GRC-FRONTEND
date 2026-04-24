/**
 * VendorAssessmentAcknowledgePage — Step 2: VRM acknowledges assessment.
 *
 * navKey: vendor_vrm_acknowledge
 * route:  /vendor/assessments/:id/acknowledge
 *
 * The VRM's job on this step is to:
 *   1. Review the assessment summary (vendor, template, which cycle)
 *   2. See the workflow timeline — where the assessment currently sits
 *   3. See who is watching (ORG_ADMIN, ORG_CISO as observers)
 *   4. Click "Acknowledge & proceed" → fires APPROVE on their task
 *      → step advances → VENDOR_CISO gets the next task (step 3)
 *
 * No questionnaire, no assignment, no form. Pure acknowledgement.
 * If compound sections are configured on this step, CompoundTaskProgress
 * shows them and the Acknowledge button is disabled until all are done.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Loader2, Users, FileText, Clock } from 'lucide-react'
import { assessmentsApi }  from '../../api/assessments.api'
import { workflowsApi }    from '../../api/workflows.api'
import { Button }          from '../../components/ui/Button'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { CompoundTaskProgress, CompoundTaskBadge } from '../../components/workflow/CompoundTaskProgress'
import { useMyTasks, useCompoundTaskProgress } from '../../hooks/useWorkflow'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectAuth } from '../../store/slices/authSlice'
import { formatDate } from '../../utils/format'
import { cn } from '../../lib/cn'
import toast from 'react-hot-toast'

const useAssessment = (id) => useQuery({
  queryKey: ['assessment-acknowledge', id],
  queryFn:  () => assessmentsApi.vendor.get(id),
  enabled:  !!id,
})

export default function VendorAssessmentAcknowledgePage() {
  const { id }         = useParams()
  const navigate       = useNavigate()
  const [urlParams]    = useSearchParams()
  const { userId }     = useSelector(selectAuth)
  const qc             = useQueryClient()

  // ── Task resolution ──────────────────────────────────────────────────────
  const { data: myTasksData, isLoading: tasksLoading } = useMyTasks({})
  const myTasks  = Array.isArray(myTasksData) ? myTasksData : (myTasksData?.items ?? [])
  const activeTask = myTasks.find(t =>
    t.status === 'PENDING' && String(t.artifactId) === String(id) && t.taskRole === 'ACTOR'
  ) || myTasks.find(t =>
    t.status === 'PENDING' && String(t.artifactId) === String(id) && t.taskRole === 'ASSIGNER'
  ) || null

  const taskId         = activeTask?.id    ? String(activeTask.id)            : urlParams.get('taskId')
  const stepInstanceId = activeTask?.stepInstanceId
    ? String(activeTask.stepInstanceId) : urlParams.get('stepInstanceId')

  // ── Guard: redirect if no active task ───────────────────────────────────
  useEffect(() => {
    if (!tasksLoading && myTasks.length > 0 && !activeTask) {
      toast.error('Open this from your task inbox')
      navigate('/workflow/inbox', { replace: true })
    }
  }, [tasksLoading, myTasks.length, activeTask])

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: assessmentData, isLoading } = useAssessment(id)
  const assessment = assessmentData

  const { data: sections = [] } = useCompoundTaskProgress(taskId ? Number(taskId) : null)
  const requiredSections  = sections.filter(s => s.required)
  const completedRequired = requiredSections.filter(s => s.completed)
  const allSectionsDone   = requiredSections.length === 0 || completedRequired.length === requiredSections.length

  // ── Acknowledge action ───────────────────────────────────────────────────
  const [remarks, setRemarks] = useState('')
  const { mutate: acknowledge, isPending: acknowledging } = useMutation({
    mutationFn: () => workflowsApi.tasks.action({
      taskInstanceId: parseInt(taskId),
      actionType: 'APPROVE',
      remarks: remarks || 'Assessment acknowledged — proceeding to CISO assignment',
    }),
    onSuccess: () => {
      toast.success('Acknowledged — assessment forwarded to CISO')
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
      navigate('/workflow/inbox')
    },
    onError: (e) => toast.error(e?.response?.data?.error?.message || 'Action failed'),
  })

  if (isLoading || tasksLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={24} className="animate-spin text-text-muted" />
    </div>
  )

  if (!assessment) return (
    <div className="p-6 text-center text-text-muted text-sm">Assessment not found.</div>
  )

  return (
    <div className="min-h-screen bg-background-tertiary">
      {/* Header */}
      <div className="bg-surface border-b border-border px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-text-primary truncate">
              Acknowledge assessment
            </h1>
            {sections.length > 0 && <CompoundTaskBadge sections={sections} />}
          </div>
          <p className="text-xs text-text-muted">
            {assessment.vendorName}
            {taskId && <> · Task #{taskId}</>}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Compound task progress (if sections configured) */}
        {sections.length > 0 && (
          <CompoundTaskProgress sections={sections} />
        )}

        {/* Assessment summary */}
        <Card>
          <CardHeader title="Assessment summary" />
          <CardBody>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wide mb-0.5">Vendor</p>
                <p className="font-medium text-text-primary">{assessment.vendorName}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wide mb-0.5">Template</p>
                <p className="font-medium text-text-primary">{assessment.templateName || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wide mb-0.5">Status</p>
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                  <Clock size={10} /> {assessment.status}
                </span>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wide mb-0.5">Questions</p>
                <p className="font-medium text-text-primary">
                  {assessment.progress?.totalQuestions ?? '—'} total
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              By acknowledging, you confirm you have reviewed the assessment brief and are handing
              coordination to the Vendor CISO for questionnaire assignment.
            </p>
          </CardBody>
        </Card>

        {/* What happens next */}
        <Card>
          <CardBody>
            <div className="flex items-start gap-3">
              <Users size={16} className="text-brand-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-text-primary">What happens after acknowledgement</p>
                <p className="text-xs text-text-muted mt-1">
                  The Vendor CISO will be notified and assigned the next task — distributing
                  questionnaire sections to responders. You will receive observer notifications
                  as each stage completes.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Optional remarks + acknowledge button */}
        {activeTask?.taskRole === 'ACTOR' && (
          <div className="space-y-2">
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              rows={2}
              placeholder="Optional remarks…"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
            <Button
              variant="primary"
              icon={CheckCircle2}
              onClick={acknowledge}
              loading={acknowledging}
              disabled={!allSectionsDone}
              className="w-full"
            >
              {allSectionsDone
                ? 'Acknowledge & proceed to CISO assignment'
                : `Complete ${requiredSections.length - completedRequired.length} section(s) to proceed`}
            </Button>
          </div>
        )}
        {activeTask?.taskRole === 'ASSIGNER' && (
          <div className="p-3 rounded-md bg-surface-overlay border border-border text-xs text-text-muted">
            You are coordinating this step. The VRM (actor) must acknowledge to advance the workflow.
          </div>
        )}
        {!activeTask && (
          <div className="p-3 rounded-md bg-surface-overlay border border-border text-xs text-text-muted">
            You are observing this assessment step.
          </div>
        )}
      </div>
    </div>
  )
}