/**
 * useAssessmentPageSetup — shared setup for assessment task pages.
 *
 * Auto-fires the backend "mark section complete" call once the page loads
 * and the user has an active task — ticking the "I've opened this page"
 * checkpoint without requiring a manual user action.
 *
 * Scroll-to-top is handled globally by <ScrollToTop /> in App.jsx,
 * so this hook only needs to worry about the section-marking logic.
 *
 * Used by:
 *   - VendorAssessmentResponderReviewPage  → fires ANSWERS_REVIEWED
 *   - (any future page that has an on-open checkpoint)
 *
 * @param {object} options
 * @param {string|null} options.assessmentId — the assessment ID
 * @param {string|null} options.taskId       — the active task ID
 * @param {boolean}     options.hasData      — true once page data is loaded
 * @param {function}    options.onMarked     — optional callback after mark
 *
 * Usage:
 *   useAssessmentPageSetup({ assessmentId: id, taskId, hasData: sections.length > 0 })
 */

import { useEffect, useRef } from 'react'
import { useQueryClient }    from '@tanstack/react-query'
import { assessmentsApi }    from '../api/assessments.api'

export function useAssessmentPageSetup({
  assessmentId,
  taskId,
  hasData  = false,
  onMarked = null,
} = {}) {
  const qc        = useQueryClient()
  const markedRef = useRef(false)  // ref — no re-render needed

  useEffect(() => {
    if (!taskId || !assessmentId || !hasData || markedRef.current) return

    markedRef.current = true

    assessmentsApi.vendor
      .markSectionComplete(assessmentId, parseInt(taskId))
      .then(() => {
        qc.refetchQueries({ queryKey: ['compound-progress'] })
        if (onMarked) onMarked()
      })
      .catch(() => {
        markedRef.current = false  // allow retry
      })
  }, [taskId, assessmentId, hasData]) // eslint-disable-line react-hooks/exhaustive-deps

  return { marked: markedRef.current }
}