/**
 * AuditTemplatesPage — /admin/audit/templates
 *
 * Standalone entry point for the Templates tab of the audit library.
 * Renders AuditLibraryPage locked to the "templates" tab.
 *
 * No logic lives here — all state, mutations, and UI are in AuditLibraryPage.
 * To add template-specific behaviour in future, promote the TemplatesTab
 * content out of AuditLibraryPage into its own component and import it here.
 */
import AuditLibraryPage from './AuditLibraryPage'

export default function AuditTemplatesPage() {
  return <AuditLibraryPage defaultTab="templates" />
}
