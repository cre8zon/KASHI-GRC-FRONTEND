import { useLayoutEffect, useState } from 'react'

/**
 * Caps an element's height to the space left below it inside the page's scroll
 * container, so a long list or table scrolls INSIDE itself and its sticky
 * header stays in view, instead of the whole page scrolling the header away.
 *
 * Same measurement DataTable uses, shared here for lists and sheets that are
 * not DataTables (the workspace plan sheet, programmes, members).
 *
 *   const ref = useRef(null)
 *   const maxHeight = useFitToViewport(ref, { min: 240, deps: [rows.length] })
 *   <div ref={ref} className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
 *
 * min       — never shrink below this (small windows still get a usable list)
 * reserve   — px to leave free beneath it (a footer note, card padding)
 * deps      — re-measure when these change (row counts, tab switches)
 * disabled  — return null (no cap), e.g. on narrow screens where the page
 *             should scroll naturally
 */
function findScrollParent(node) {
  let p = node?.parentElement
  while (p && p !== document.body) {
    const oy = getComputedStyle(p).overflowY
    if (oy === 'auto' || oy === 'scroll') return p
    p = p.parentElement
  }
  return null
}

export function useFitToViewport(ref, { min = 240, reserve = 0, deps = [], disabled = false } = {}) {
  const [maxHeight, setMaxHeight] = useState(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || disabled) { setMaxHeight(null); return }
    const sp = findScrollParent(el)
    const measure = () => {
      const elTop = el.getBoundingClientRect().top
      let available
      if (sp) {
        const spRect = sp.getBoundingClientRect()
        // Measured as if the page were scrolled to the top, so scrolling the
        // page does not make the list grow and shrink under the cursor.
        const topInSp = elTop - spRect.top + sp.scrollTop
        const padBottom = parseFloat(getComputedStyle(sp).paddingBottom) || 0
        available = sp.clientHeight - topInSp - reserve - padBottom - 24
      } else {
        available = window.innerHeight - elTop - reserve - 24
      }
      setMaxHeight(Math.max(min, Math.floor(available)))
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro) { if (sp) ro.observe(sp); if (sp?.firstElementChild) ro.observe(sp.firstElementChild) }
    window.addEventListener('resize', measure)
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure) }
  }, [disabled, min, reserve, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps

  return disabled ? null : maxHeight
}

export default useFitToViewport