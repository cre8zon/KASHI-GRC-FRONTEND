import { useEffect, useRef } from 'react'

/**
 * useClickOutside — closes a popover/dropdown/menu when the user clicks or taps
 * outside it, or presses Escape.
 *
 *   const ref = useClickOutside(() => setOpen(false), open)
 *   return <div ref={ref}>…</div>
 *
 * @param {() => void} onOutside  called on an outside click/tap or Escape.
 * @param {boolean}    active     only listens while true (usually the open flag),
 *                                so closed menus cost nothing.
 * @returns {React.RefObject} attach to the element that should stay "inside".
 */
export function useClickOutside(onOutside, active = true) {
  const ref = useRef(null)

  useEffect(() => {
    if (!active) return

    const handlePointer = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside()
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') onOutside()
    }

    // mousedown (not click) so the menu closes before a click lands elsewhere;
    // touchstart mirrors it for mobile.
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onOutside, active])

  return ref
}