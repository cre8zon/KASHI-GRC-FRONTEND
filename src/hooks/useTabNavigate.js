/**
 * useTabNavigate.js — drop-in replacement for react-router's useNavigate.
 * 
 * Inside a MemoryRouter (tab context): works exactly like useNavigate — 
 * navigates within that tab's router.
 *
 * From sidebar/TopNav (BrowserRouter context): dispatches openTab or
 * navigateActiveTab to Redux instead.
 *
 * Usage: replace useNavigate() with useTabNavigate() in any component
 * that needs to be tab-aware. Existing pages don't need to change —
 * they use useNavigate() inside MemoryRouter which already works correctly.
 *
 * Place at: src/hooks/useTabNavigate.js
 */
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { openTab, navigateActiveTab } from '../store/slices/tabsSlice'

export function useTabNavigate() {
  const navigate = useNavigate()
  const dispatch = useDispatch()

  return function tabNavigate(to, options = {}) {
    if (options.newTab) {
      // Explicit new tab request
      dispatch(openTab({ route: to, title: options.title || to, icon: options.icon }))
    } else {
      // Normal navigation — goes through react-router (works inside MemoryRouter)
      navigate(to, options)
    }
  }
}
