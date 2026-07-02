/**
 * usePersistedTab — persists the active sub-tab key in the Redux app tab store.
 *
 * When the user switches between app tabs (the Chrome-style tab bar), the page
 * component unmounts and remounts, losing all local useState. This hook stores
 * the selected sub-tab in the Redux tab entry so it survives remounts.
 *
 * Usage (any page, including hardcoded vendor pages):
 *
 *   const [tab, setTab] = usePersistedTab('overview')
 *
 *   // Then use tab/setTab exactly like useState
 *   <button onClick={() => setTab('sections')}>Sections</button>
 *   {tab === 'sections' && <SectionsPanel />}
 */
import { useDispatch, useSelector } from 'react-redux'
import { useEffect } from 'react'
import { selectActiveTabId, selectActiveSubTab, saveSubTab } from '../store/slices/tabsSlice'

export function usePersistedTab(defaultTab = 'overview') {
  const dispatch       = useDispatch()
  const activeAppTabId = useSelector(selectActiveTabId)
  const savedSubTab    = useSelector(selectActiveSubTab)

  const tab = savedSubTab || defaultTab

  const setTab = (key) => {
    dispatch(saveSubTab({ tabId: activeAppTabId, subTab: key }))
  }

  // When the app tab itself changes (user switches to a different app tab
  // that happens to use the same defaultTab), we don't reset — the Redux
  // store already has the correct subTab for that app tab entry.

  return [tab, setTab]
}

/**
 * usePersistedTabReset — call this when the entity being viewed changes
 * (e.g. navigating from engagement 70 to engagement 71) to reset sub-tab
 * back to the default so the new entity doesn't inherit the previous tab.
 *
 * Usage:
 *   usePersistedTabReset(id)  // id = entity ID from useParams
 */
export function usePersistedTabReset(entityId) {
  const dispatch       = useDispatch()
  const activeAppTabId = useSelector(selectActiveTabId)

  useEffect(() => {
    dispatch(saveSubTab({ tabId: activeAppTabId, subTab: null }))
  }, [entityId]) // eslint-disable-line
}