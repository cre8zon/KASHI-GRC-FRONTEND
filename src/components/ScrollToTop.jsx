/**
 * ScrollToTop — global router-level component.
 *
 * Scrolls #main-scroll to the top on every route change and KEEPS it at the
 * top while async content (React Query) loads and expands the page height.
 *
 * Strategy:
 *   1. On pathname change — immediately set scrollTop = 0.
 *   2. Start a MutationObserver on #main-scroll that re-pins scrollTop = 0
 *      whenever the DOM changes (i.e. when query data arrives and renders).
 *   3. Stop observing after 1.5s OR as soon as the user scrolls (whichever
 *      comes first) — so normal scrolling isn't blocked.
 */

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    const el = document.getElementById('main-scroll')
    if (!el) return

    // Immediate reset
    el.scrollTop = 0

    let userScrolled = false

    const onUserScroll = () => { userScrolled = true }
    el.addEventListener('scroll', onUserScroll, { once: true })

    // Re-pin to top whenever new content renders, until user scrolls or 1.5s passes
    const observer = new MutationObserver(() => {
      if (!userScrolled) el.scrollTop = 0
    })

    observer.observe(el, { childList: true, subtree: true })

    const timer = setTimeout(() => {
      observer.disconnect()
      el.removeEventListener('scroll', onUserScroll)
    }, 1500)

    return () => {
      clearTimeout(timer)
      observer.disconnect()
      el.removeEventListener('scroll', onUserScroll)
    }
  }, [pathname])

  return null
}