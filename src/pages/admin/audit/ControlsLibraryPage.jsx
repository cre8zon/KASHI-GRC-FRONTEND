/**
 * ControlsLibraryPage — /admin/controls/library
 *
 * Standalone entry point for the Controls tab of the audit library.
 * Renders AuditLibraryPage locked to the "controls" tab.
 *
 * No logic lives here — all state, mutations, and UI are in AuditLibraryPage.
 * To add controls-specific behaviour in future, promote the ControlsTab
 * content out of AuditLibraryPage into its own component and import it here.
 */
import AuditLibraryPage from './AuditLibraryPage'

export default function ControlsLibraryPage() {
  return <AuditLibraryPage defaultTab="controls" />
}
