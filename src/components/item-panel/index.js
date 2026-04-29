/**
 * item-panel — reusable per-entity interaction shell.
 *
 * Public API:
 *   ItemPanel        — the full panel (Discussion + Action Items + Activity tabs)
 *   ItemActionItems  — inline action items only (use directly if you don't want tabs)
 *   ResponderActions — Accept / Request Revision / Override buttons
 *
 * All three components are additive — they render below existing entity content
 * without touching QuestionInput or any other existing component.
 */

export { ItemPanel }        from './ItemPanel'
export { ItemActionItems }  from './ItemActionItems'
export { ResponderActions } from './ResponderActions'
export { QuestionDrawer }   from './QuestionDrawer'
