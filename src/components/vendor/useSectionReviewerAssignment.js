/**
 * Step 10: the review lead gives each SECTION to a reviewer.
 *
 * One rule, used by both the Review tab and the Sections tab, so the two can
 * never disagree about who may assign, on which step, or from which list.
 *
 *   WHO     standing on this assessment (a live task, or an override) and the
 *           assessment.question.assign_reviewer permission
 *   WHEN    while the viewer's task has step 10's own sections open —
 *           ASSIGN_REVIEWERS or CONFIRM_REVIEWER_ASSIGNMENT — and never while
 *           step 9's ASSIGN_REVIEW_LEAD is open. The section keys come from the
 *           workflow (workflow_step_sections), the same gate ui_actions uses
 *           for the header button, so no step number is written here.
 *   FROM    the task's own assignable list, which is the rule the server checks
 *           a pick against (ReviewController → assertAssignable), so the list
 *           cannot offer someone the server then refuses.
 *
 * Questions are a different assignment — a reviewer handing a question to a
 * review assistant on the evaluate step — and are not handled here.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { assessmentsApi } from '../../api/assessments.api'
import { reviewApi } from '../../api/review.api'
import { useStanding, P, invalidateAssessment } from './vendorShared'

/** The people the task's step allows to be assigned. */
export function useTaskAssignableUsers(taskId, enabled = true) {
  return useQuery({
    queryKey: ['task-assignable-users', String(taskId)],
    queryFn: () => assessmentsApi.vendor.assignableUsersForTask(parseInt(taskId, 10))
      .then(r => (Array.isArray(r) ? r : (r?.data?.data || r?.data || r || []))),
    enabled: !!taskId && enabled,
    staleTime: 60 * 1000,
  })
}

const isOpen = (vc, key) => (vc?.openSectionKeys || [])
  .some(k => String(k).trim().toUpperCase() === key)

export function useSectionReviewerAssignment({ vc, assessmentId, taskId, enabled = true }) {
  const qc = useQueryClient()
  const standing = useStanding(vc)

  const reviewLeadGateOpen = isOpen(vc, 'ASSIGN_REVIEW_LEAD')
  const canAssign = enabled
    && standing.hasStanding
    && standing.has(P.ASSIGN_REVIEWER)
    && (isOpen(vc, 'ASSIGN_REVIEWERS') || isOpen(vc, 'CONFIRM_REVIEWER_ASSIGNMENT'))
    && !reviewLeadGateOpen

  const { data: reviewers = [], isLoading: loading } = useTaskAssignableUsers(taskId, canAssign)

  const refresh = () => {
    invalidateAssessment(qc, assessmentId)
    qc.invalidateQueries({ queryKey: ['assessment-review-summary', assessmentId] })
  }

  const [assigningId, setAssigningId] = useState(null)
  const one = useMutation({
    mutationFn: ({ sectionInstanceId, userId }) =>
      reviewApi.reviewerAssignSection(assessmentId, sectionInstanceId, userId),
    onSuccess: () => { toast.success('Reviewer assigned to the section'); refresh() },
    onError:   (e) => toast.error(e?.message || 'Could not assign the section'),
    onSettled: () => setAssigningId(null),
  })

  const batch = useMutation({
    mutationFn: ({ userId, sectionInstanceIds }) =>
      reviewApi.reviewerAssignSectionsBatch(assessmentId, sectionInstanceIds, userId),
    onSuccess: (_d, v) => {
      const n = v.sectionInstanceIds.length
      toast.success(`${n} section${n === 1 ? '' : 's'} assigned`)
      refresh()
    },
    onError: (e) => toast.error(e?.message || 'Could not assign the selected sections'),
  })

  return {
    canAssign,
    reviewLeadGateOpen,
    reviewers,
    loading,
    assigningId,
    assign: (sectionInstanceId, userId) => {
      setAssigningId(sectionInstanceId)
      one.mutate({ sectionInstanceId, userId })
    },
    /** onDone runs after a successful batch — the caller clears its selection. */
    assignBatch: (sectionInstanceIds, userId, onDone) =>
      batch.mutate({ userId, sectionInstanceIds }, { onSuccess: () => onDone?.() }),
    batchSaving: batch.isPending,
  }
}