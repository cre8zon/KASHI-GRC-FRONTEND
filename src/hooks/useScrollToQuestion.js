import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Scrolls to a question card when ?questionInstanceId=X is in the URL.
 * Cards must have data-qi={questionInstanceId} on their root element.
 * deps: array of values that signal "data has loaded" (e.g. questions.length)
 */
export function useScrollToQuestion(deps = []) {
  const [urlParams] = useSearchParams()
  const qId = urlParams.get('questionInstanceId')

  useEffect(() => {
    if (!qId) return
    const tryScroll = (attempts = 0) => {
      const el = document.querySelector(`[data-qi="${qId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else if (attempts < 20) {
        setTimeout(() => tryScroll(attempts + 1), 150)
      }
    }
    setTimeout(() => tryScroll(), 100)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qId, ...deps])
}