import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { cn } from '../../../../lib/cn'

/**
 * A textarea that is always exactly as tall as its content.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * Every text surface in the editor started as `rows={n}` with a grow-on-input
 * handler. That is fine while you are typing into it and wrong the moment the
 * page reloads: the browser renders n rows, the content is longer than n rows,
 * and you get an inner scrollbar. Reopening a draft showed a two-line title
 * clipped to one line with a scrollbar, and a filled article looked half
 * deleted.
 *
 * Content in an editor should never hide behind an internal scrollbar. The page
 * scrolls; the fields do not.
 *
 * ── WHY useLayoutEffect ──────────────────────────────────────────────────────
 *
 * The measurement has to happen before the browser paints, or the field renders
 * at one row and then jumps. useEffect runs after paint and you see the jump on
 * every reload.
 *
 * ── WHY IT RE-MEASURES ON FONT LOAD ──────────────────────────────────────────
 *
 * scrollHeight is measured in whatever font is available at that instant. The
 * first measurement usually happens before the webfont arrives, so a heading
 * measured in the fallback is short by a line or two once Albert Sans loads.
 * document.fonts.ready fires once and costs nothing.
 */
export const AutoTextarea = forwardRef(function AutoTextarea(
  { value, onChange, className, minRows = 1, ...rest }, forwardedRef,
) {
  const innerRef = useRef(null)
  const setRefs = (node) => {
    innerRef.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }

  const fit = useCallback((el) => {
    const node = el || innerRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }, [])

  // Before paint, so the field never renders short and then jumps.
  useLayoutEffect(() => { fit() }, [value, fit])

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.ready) return
    let live = true
    document.fonts.ready.then(() => { if (live) fit() })
    return () => { live = false }
  }, [fit])

  return (
    <textarea
      ref={setRefs}
      rows={minRows}
      value={value}
      onChange={(e) => { onChange?.(e); fit(e.target) }}
      className={cn('resize-none overflow-hidden', className)}
      {...rest}
    />
  )
})

/** The same behaviour with the label/helper chrome of the shared Textarea. */
export function AutoField({ label, helperText, className, ...rest }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-text-secondary">{label}</label>
      )}
      <AutoTextarea
        className={cn(
          'w-full rounded-ctl border border-border bg-surface px-2.5 py-2 text-[13px] text-text-primary placeholder:text-text-faint focus:border-brand-800/40 focus:outline-none focus:ring-1 focus:ring-brand-800/40',
          className,
        )}
        {...rest}
      />
      {helperText && <p className="text-[11px] text-text-faint">{helperText}</p>}
    </div>
  )
}