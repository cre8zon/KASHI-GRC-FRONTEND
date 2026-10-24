import { useEffect, lazy, Suspense, useSyncExternalStore } from 'react'
import { useDispatch } from 'react-redux'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectIsAuthenticated, selectRoleSides, validateSession } from './store/slices/authSlice'
import { useTheme } from './hooks/useTheme'
import useFeatureGuard from './hooks/useFeatureGuard'
import { ROLE_SIDES } from './config/constants'

// Layout — NOT lazy: needed immediately on every page
import { AppShell } from './components/layout/AppShell'
import { ThemeProvider } from './providers/ThemeProvider'
import { CallDock } from './components/collab/call/CallDock'
import { SessionManager } from './components/layout/SessionManager'
import { PageSkeleton } from './components/ui/EmptyState'
import { peekPostLoginTarget, subscribeJoin, isJoinPending } from './lib/session'

// Each tab is its own sign-in: several people (or one person in several
// organisations) can work side by side in one browser. A new tab does NOT take
// over another tab's session by itself any more — that made every new tab the
// same user, and signing out there to switch user signed the first tab out too.
// The sign-in page offers "Continue as …" instead (lib/session listPeerSessions).

// ── Page preloading ───────────────────────────────────────────────────────────
// Pages stay code-split (a fast first load), but once the app is up and idle
// their code is fetched in the background, one at a time, so opening a page
// or switching tabs later has nothing to wait for. Cached by the browser
// after that.
const pageLoaders = []
function lazyPage(load) {
  pageLoaders.push(load)
  return lazy(load)
}
let preloadStarted = false
function preloadPages() {
  if (preloadStarted) return
  preloadStarted = true
  // Not on a metered or very slow connection — the pages still load on demand.
  const net = typeof navigator !== 'undefined' ? navigator.connection : null
  if (net && (net.saveData || /(^|-)2g$/.test(net.effectiveType || ''))) return
  const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 300))
  const queue = [...pageLoaders]
  const next = () => {
    const load = queue.shift()
    if (!load) return
    load().catch(() => {}).finally(() => idle(next))
  }
  setTimeout(() => idle(next), 1500)   // after the first page has had the network to itself
}

// ── Lazy page imports — each page only loads when its route is first visited ──
// This eliminates the 280+ JS requests on cold load by splitting into chunks.

// Auth — small, loads fast, frequently needed
const LoginPage               = lazyPage(() => import('./pages/auth/LoginPage'))
const ForcePasswordChangePage = lazyPage(() => import('./pages/auth/ForcePasswordChangePage'))
const ForgotPasswordPage      = lazyPage(() => import('./pages/auth/ForgotPasswordPage'))
const ResetPasswordPage       = lazyPage(() => import('./pages/auth/ResetPasswordPage'))
const PasswordChangedPage     = lazyPage(() => import('./pages/auth/PasswordChangedPage'))

// Core — high-traffic pages, loaded early
const DashboardPage     = lazyPage(() => import('./pages/dashboard/DashboardPage'))
const TrustCenterPage   = lazyPage(() => import('./pages/trust/TrustCenterPage'))
const SettingsPage      = lazyPage(() => import('./pages/settings/SettingsPage'))
const WorkflowInboxPage = lazyPage(() => import('./pages/workflow/WorkflowInboxPage'))
const AllTasksPage      = lazyPage(() => import('./pages/workflow/AllTasksPage'))
const TaskDetailPage    = lazyPage(() => import('./pages/workflow/TaskDetailPage'))
const ActionItemsPage   = lazyPage(() => import('./pages/action-items/ActionItemsPage'))
const NotificationsPage = lazyPage(() => import('./pages/notifications/NotificationsPage'))

// Universal Module Page — the main audit/GRC module renderer
const UniversalModulePage = lazyPage(() => import('./pages/module/UniversalModulePage'))

// Users & Roles
const UserManagementPage  = lazyPage(() => import('./pages/users/UserManagementPage'))
const UsersHubPage        = lazyPage(() => import('./pages/users/UsersHubPage'))
const RolesPermissionsPage = lazyPage(() => import('./pages/roles/RolesPermissionsPage'))
const UserListPage         = lazyPage(() => import('./pages/users/UserListPage'))

// Reports
const ReportsPage            = lazyPage(() => import('./pages/reports/ReportsPage'))
const AssessmentReportPage   = lazyPage(() => import('./pages/reports/AssessmentReportPage'))
const AuditReportPage        = lazyPage(() => import('./pages/reports/AuditReportPage'))
const AuditProgrammeReportPage = lazyPage(() => import('./pages/reports/AuditProgrammeReportPage'))

// TPRM / Vendor — org side
const VendorListPage        = lazyPage(() => import('./pages/tprm/VendorListPage'))
const VendorDetailPage      = lazyPage(() => import('./pages/tprm/VendorDetailPage'))
const VendorOnboardPage     = lazyPage(() => import('./pages/tprm/VendorOnboardPage'))
const OrgTemplatesPage      = lazyPage(() => import('./pages/assessments/OrgTemplatesPage'))
const VendorAssessmentsPage = lazyPage(() => import('./pages/assessments/VendorAssessmentsPage'))
const AssessmentListPage    = lazyPage(() => import('./pages/assessments/AssessmentListPage'))
const AssessmentDetailPage  = lazyPage(() => import('./pages/assessments/AssessmentDetailPage'))
const AssessmentReviewPage  = lazyPage(() => import('./pages/assessments/AssessmentReviewPage'))
const ReviewAssistantPage   = lazyPage(() => import('./pages/assessments/ReviewAssistantPage'))

// Vendor side pages
const VendorAssessmentFillPage            = lazyPage(() => import('./pages/vendor/VendorAssessmentFillPage'))
const VendorAssessmentAssignPage          = lazyPage(() => import('./pages/vendor/VendorAssessmentAssignPage'))
const VendorAssessmentResponderReviewPage = lazyPage(() => import('./pages/vendor/VendorAssessmentResponderReviewPage'))
const VendorAssessmentAcknowledgePage     = lazyPage(() => import('./pages/vendor/VendorAssessmentAcknowledgePage'))

// Audit
const AuditProjectListPage      = lazyPage(() => import('./pages/audit/AuditProjectListPage'))
const AuditProjectDashboardPage = lazyPage(() => import('./pages/dashboard/AuditProjectDashboardPage'))
const AuditEngagementListPage   = lazyPage(() => import('./pages/audit/AuditEngagementListPage'))
const AuditEngagementDetailPage = lazyPage(() => import('./pages/audit/AuditEngagementDetailPage'))
const OrgAuditLibraryPage       = lazyPage(() => import('./pages/audit/AuditLibraryPage'))
const KashiLinkPage             = lazyPage(() => import('./pages/audit/KashiLinkPage'))
const PolicyEditorPage          = lazyPage(() => import('./pages/policies/PolicyEditorPage'))

// Auditor portal
const AuditorPortalPage = lazyPage(() => import('./pages/auditor/AuditorPortalPage'))

// Workflow admin
const WorkflowPage             = lazyPage(() => import('./pages/admin/workflows/WorkflowPage'))
const WorkflowBlueprintDesigner = lazyPage(() => import('./pages/admin/workflows/WorkflowBlueprintDesigner'))

// Platform Admin — only loaded by SYSTEM role users
const EmailTemplateManagerPage   = lazyPage(() => import('./pages/admin/email-templates/EmailTemplateManagerPage'))
const ExternalAuditorsPage       = lazyPage(() => import('./pages/auditor/ExternalAuditorsPage'))
const FirmClientsPage            = lazyPage(() => import('./pages/auditor/FirmClientsPage'))
// Collaboration — workspaces shared with an audit firm (phase 1)
const CollabWorkspacesPage       = lazyPage(() => import('./pages/collaboration/WorkspacesPage'))
const CollabWorkspaceDetailPage  = lazyPage(() => import('./pages/collaboration/WorkspaceDetailPage'))
const CollabMyWeekPage           = lazyPage(() => import('./pages/collaboration/MyWeekPage'))
const CollabMeetingsPage         = lazyPage(() => import('./pages/collaboration/MeetingsPage'))
const CollabMeetingPage          = lazyPage(() => import('./pages/collaboration/MeetingPage'))
const CollabRoomPage             = lazyPage(() => import('./pages/collaboration/RoomPage'))
const CollabCallPage             = lazyPage(() => import('./pages/collaboration/CallPage'))
const JoinCallPage               = lazyPage(() => import('./pages/collaboration/JoinCallPage'))
// Internal chat — the organisation's own staff
const ChatPage                   = lazyPage(() => import('./pages/chat/ChatPage'))
const TenantListPage             = lazyPage(() => import('./pages/admin/tenants/TenantListPage'))
const TenantDetailPage           = lazyPage(() => import('./pages/admin/tenants/TenantDetailPage'))
const SendWelcomeEmailPage       = lazyPage(() => import('./pages/admin/tenants/SendWelcomeEmailPage'))
const BillingOverviewPage        = lazyPage(() => import('./pages/admin/billing/BillingOverviewPage'))
const SubscriptionsPage          = lazyPage(() => import('./pages/admin/billing/SubscriptionsPage'))
const PricingPlansPage           = lazyPage(() => import('./pages/admin/billing/PricingPlansPage'))
const InvoicesPage               = lazyPage(() => import('./pages/admin/billing/InvoicesPage'))
const FirmVerificationsPage      = lazyPage(() => import('./pages/admin/firm-verification/FirmVerificationsPage'))
const EnquiriesPage              = lazyPage(() => import('./pages/admin/enquiries/EnquiriesPage'))
const VerifyAuditFirmPage        = lazyPage(() => import('./pages/auth/VerifyAuditFirmPage'))
const QuestionLibraryPage        = lazyPage(() => import('./pages/admin/assessment/QuestionLibraryPage'))
const AssessmentTemplatesPage    = lazyPage(() => import('./pages/admin/assessment/AssessmentTemplatesPage'))
const RiskMappingPage            = lazyPage(() => import('./pages/admin/assessment/RiskMappingPage'))
const NavigationAdminPage        = lazyPage(() => import('./pages/admin/ui-config/NavigationAdminPage'))
const BlueprintsAdminPage        = lazyPage(() => import('./pages/admin/kashiguard/BlueprintsAdminPage'))
const GuardRulesAdminPage        = lazyPage(() => import('./pages/admin/kashiguard/GuardRulesAdminPage'))
const ComponentsAdminPage        = lazyPage(() => import('./pages/admin/ui-config/ComponentsAdminPage'))
const UiActionsAdminPage         = lazyPage(() => import('./pages/admin/ui-config/UiActionsAdminPage'))
const FormsAdminPage             = lazyPage(() => import('./pages/admin/ui-config/FormsAdminPage'))
const FeatureFlagsAdminPage      = lazyPage(() => import('./pages/admin/ui-config/FeatureFlagsAdminPage'))
const BrandingAdminPage          = lazyPage(() => import('./pages/admin/ui-config/BrandingAdminPage'))
const RbacAdminPage              = lazyPage(() => import('./pages/admin/rbac/RbacAdminPage'))
const ModuleBlueprintAdminPage   = lazyPage(() => import('./pages/admin/modules/ModuleBlueprintAdminPage'))
const NotificationTemplateAdminPage = lazyPage(() => import('./pages/admin/notifications/NotificationTemplateAdminPage'))
const NotificationEmailRulesPage = lazyPage(() => import('./pages/admin/notifications/NotificationEmailRulesPage'))
const NotificationPreferencesPage = lazyPage(() => import('./pages/settings/NotificationPreferencesPage'))
const DesignSystemPage           = lazyPage(() => import('./pages/admin/design-system/DesignSystemPage'))
const ScreenDesignerPage         = lazyPage(() => import('./pages/admin/screen-designer/ScreenDesignerPage'))
const DashboardAdminPage         = lazyPage(() => import('./pages/admin/dashboard/DashboardAdminPage'))
const ControlsLibraryPage        = lazyPage(() => import('./pages/admin/audit/ControlsLibraryPage'))
const AuditTemplatesPage         = lazyPage(() => import('./pages/admin/audit/AuditTemplatesPage'))
const ControlFrameworksPage      = lazyPage(() => import('./pages/admin/audit/ControlFrameworksPage'))
const AdminAuditLibraryPage      = lazyPage(() => import('./pages/admin/audit/AuditLibraryPage'))

// Content platform — its own route subtree rather than a page per screen.
// Everything under /admin/content is served by ContentRoutes, so adding a
// screen there does not touch this file. See pages/admin/content/ContentRoutes.
const ContentRoutes              = lazyPage(() => import('./pages/admin/content/ContentRoutes'))

// ─── Loading fallback ─────────────────────────────────────────────────────────
// Shown while a lazy chunk is being fetched — only happens on first visit to a route.
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
    </div>
  )
}

// ─── Guards ───────────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const location        = useLocation()
  // A tab just opened may be picking up the session of a tab already open
  // (lib/session joinOpenSession) — a moment, not a trip to the sign-in page.
  const joining = useSyncExternalStore(subscribeJoin, isJoinPending)
  if (!isAuthenticated && joining) return <div className="p-6"><PageSkeleton /></div>
  if (!isAuthenticated) return <Navigate to="/auth/login" state={{ from: location }} replace />
  return children
}

function RedirectIfAuthed({ children }) {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  // After a re-login, return to the page the session ended on (see lib/session).
  if (isAuthenticated) return <Navigate to={peekPostLoginTarget() || '/dashboard'} replace />
  return children
}

function usePlatformAdmin() {
  const sides = useSelector(selectRoleSides)
  return sides.includes(ROLE_SIDES.SYSTEM)
}

// Platform-admin route guard. The backend hard-blocks /v1/admin/** and
// /v1/tenants/** to SIDE_SYSTEM, so this is UX only: non-System users are sent
// to their dashboard instead of loading a page whose APIs would 403. Never
// rely on this for security — the server boundary is the real gate.
function RequireSystem({ children }) {
  const sides = useSelector(selectRoleSides)
  if (!sides.includes(ROLE_SIDES.SYSTEM)) return <Navigate to="/dashboard" replace />
  return children
}

// ─── App ──────────────────────────────────────────────────────────────────────
function AppShellWithTheme() {
  // Entitlement: redirect on FEATURE_NOT_LICENSED 403 from any gated endpoint.
  useFeatureGuard()
  // Signed in and the shell is up: warm the other pages' code in the background.
  useEffect(() => { preloadPages() }, [])
  return (
    <ThemeProvider>
      <AppShell />
      {/* In-app call (Collaboration): fills the Call tab; a small card in other tabs */}
      <CallDock />
      {/* Token renewal, idle sign-out warning, cross-tab sign-out */}
      <SessionManager />
    </ThemeProvider>
  )
}

export default function App() {
  const isPlatformAdmin = usePlatformAdmin()
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(validateSession())
  }, [dispatch])

  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/auth/login"            element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
          <Route path="/auth/forgot-password"  element={<RedirectIfAuthed><ForgotPasswordPage /></RedirectIfAuthed>} />
          <Route path="/auth/reset-password"   element={<ResetPasswordPage />} />
          <Route path="/auth/set-password"     element={<ForcePasswordChangePage />} />
          <Route path="/auth/password-changed" element={<PasswordChangedPage />} />
          {/* Audit-firm email confirmation — the firm has no account; the token is the credential */}
          <Route path="/verify-audit-firm"     element={<VerifyAuditFirmPage />} />
          {/* A call link. Public: guests join without an account (they wait to
              be admitted); signed-in colleagues go straight into the call tab. */}
          <Route path="/join/:code"            element={<JoinCallPage />} />
          <Route path="/"                      element={<Navigate to="/dashboard" replace />} />

          {/* Outside AppShell */}
          <Route path="/tenants/:id/welcome-email" element={<RequireSystem><RequireAuth><SendWelcomeEmailPage /></RequireAuth></RequireSystem>} />

          {/* Protected AppShell */}
          <Route element={<RequireAuth><AppShellWithTheme /></RequireAuth>}>
            <Route path="/dashboard"      element={<DashboardPage />} />
            {/* Every dashboard — global, per-module and personal — is a row in
                `dashboards` distinguished by scope, so one route serves all
                three. A new dashboard is a database row, not a deploy. */}
            <Route path="/dashboard/:dashboardKey" element={<DashboardPage />} />
            {/* The trust page editor. There is exactly ONE per tenant, so it is
                its own screen rather than a UniversalModulePage list that would
                always contain a single row. The nav entry seeded in 46 points
                here; without this line it went nowhere. */}
            <Route path="/trust-center" element={<TrustCenterPage />} />
            <Route path="/settings"       element={<SettingsPage />} />
            {/* Client side: admit audit firms. Firm side: staff clients. Both
                behave according to the tenant the token names. */}
            <Route path="/external-auditors" element={<ExternalAuditorsPage />} />
            <Route path="/firm/clients"      element={<FirmClientsPage />} />
            <Route path="/collaboration/workspaces"     element={<CollabWorkspacesPage />} />
            <Route path="/collaboration/workspaces/:id" element={<CollabWorkspaceDetailPage />} />
            <Route path="/collaboration/my-week"        element={<CollabMyWeekPage />} />
            <Route path="/collaboration/meetings"       element={<CollabMeetingsPage />} />
            <Route path="/collaboration/meetings/:id"   element={<CollabMeetingPage />} />
            <Route path="/collaboration/rooms/:id"      element={<CollabRoomPage />} />
            {/* The call tab — the in-app call fills it (CallDock moves it here). */}
            <Route path="/call"                         element={<CollabCallPage />} />
            <Route path="/chat"                         element={<ChatPage />} />
            <Route path="/chat/:id"                     element={<ChatPage />} />
            <Route path="/settings/notifications" element={<NotificationPreferencesPage />} />
            <Route path="/workflow/inbox"         element={<WorkflowInboxPage />} />
            <Route path="/workflow/tasks"          element={<AllTasksPage />} />
            <Route path="/workflow/tasks/:taskId"  element={<TaskDetailPage />} />
            <Route path="/action-items"            element={<ActionItemsPage />} />
            <Route path="/notifications"           element={<NotificationsPage />} />
            <Route path="/assessments"             element={<VendorAssessmentsPage />} />
            <Route path="/assessments/:id"         element={<AssessmentDetailPage />} />

            {/* Org side — Vendors / TPRM */}
            <Route path="/tprm/vendors"          element={<VendorListPage />} />
            <Route path="/tprm/vendors/onboard"  element={<VendorOnboardPage />} />
            <Route path="/tprm/vendors/:id"      element={<VendorDetailPage />} />

            {/* Org side — Assessments */}
            <Route path="/assessments/vendor"     element={<VendorAssessmentsPage />} />
            <Route path="/assessments/templates"  element={<OrgTemplatesPage />} />
            <Route path="/reports"                element={<ReportsPage />} />
            <Route path="/reports/assessments/:id" element={<AssessmentReportPage />} />
            <Route path="/assessments/:id/review"           element={<AssessmentReviewPage />} />
            <Route path="/assessments/:id/assistant-review" element={<ReviewAssistantPage />} />

            {/* Users & Roles — one hub, side tabs inside it. Org sees every
                side for its own tenant; Vendor/Auditee/Auditor each see only
                their own side; System picks a tenant, then the same 4 tabs
                scoped to it. Old /vendor/users, /auditee/users, /auditor/users
                kept below as direct links for anywhere still pointing at them. */}
            <Route path="/users" element={<UsersHubPage />} />
            <Route path="/roles" element={
              isPlatformAdmin
                ? <RolesPermissionsPage side="SYSTEM" />
                : <RolesPermissionsPage side="ORGANIZATION" />
            } />
            <Route path="/vendor/users"  element={<UserManagementPage side="VENDOR" />} />
            <Route path="/auditee/users" element={<UserManagementPage side="AUDITEE" />} />
            <Route path="/auditor/users" element={<UserManagementPage side="AUDITOR" />} />

            {/* Org side — Workflow overview */}
            <Route path="/workflow"
              element={<WorkflowPage isPlatformAdmin={false} defaultTab="instances" />} />

            {/* Vendor side */}
            <Route path="/vendor/assessments"                          element={<VendorAssessmentsPage />} />
            <Route path="/vendor/assessments/:id/fill"                 element={<VendorAssessmentFillPage />} />
            <Route path="/vendor/assessments/:id/assign"               element={<VendorAssessmentAssignPage />} />
            <Route path="/vendor/assessments/:id/acknowledge"          element={<VendorAssessmentAcknowledgePage />} />
            <Route path="/vendor/assessments/:id/responder-review"     element={<VendorAssessmentResponderReviewPage />} />

            {/* External Auditor */}
            <Route path="/auditor/portal" element={<AuditorPortalPage />} />

            {/* Platform Admin */}
            <Route path="/users-list"                     element={<UserListPage />} />
            <Route path="/admin/email-templates"          element={<RequireSystem><EmailTemplateManagerPage /></RequireSystem>} />
            <Route path="/admin/assessment/questions"     element={<RequireSystem><QuestionLibraryPage /></RequireSystem>} />
            <Route path="/admin/assessment/templates"     element={<RequireSystem><AssessmentTemplatesPage /></RequireSystem>} />
            <Route path="/admin/assessment/risk-mappings" element={<RequireSystem><RiskMappingPage /></RequireSystem>} />
            <Route path="/admin/workflows"
              element={<RequireSystem><WorkflowPage isPlatformAdmin={isPlatformAdmin} defaultTab="blueprints" /></RequireSystem>} />
            <Route path="/admin/workflow-instances"
              element={<RequireSystem><WorkflowPage isPlatformAdmin={isPlatformAdmin} defaultTab="instances" /></RequireSystem>} />
            <Route path="/admin/workflows/blueprints"  element={<RequireSystem><WorkflowBlueprintDesigner /></RequireSystem>} />
            <Route path="/admin/kashiguard/blueprints" element={<RequireSystem><BlueprintsAdminPage /></RequireSystem>} />
            <Route path="/admin/kashiguard/rules"      element={<RequireSystem><GuardRulesAdminPage /></RequireSystem>} />
            <Route path="/admin/ui/navigation"  element={<RequireSystem><NavigationAdminPage /></RequireSystem>} />
            <Route path="/admin/ui/components"  element={<RequireSystem><ComponentsAdminPage /></RequireSystem>} />
            <Route path="/admin/ui/actions"     element={<RequireSystem><UiActionsAdminPage /></RequireSystem>} />
            <Route path="/admin/ui/forms"       element={<RequireSystem><FormsAdminPage /></RequireSystem>} />
            <Route path="/admin/ui/flags"       element={<RequireSystem><FeatureFlagsAdminPage /></RequireSystem>} />
            <Route path="/admin/ui/branding"    element={<RequireSystem><BrandingAdminPage /></RequireSystem>} />
            <Route path="/tenants"     element={<RequireSystem><TenantListPage /></RequireSystem>} />
            {/* Create tenant is a modal over the list, inside the shell like every other create form. */}
            <Route path="/tenants/new" element={<RequireSystem><TenantListPage /></RequireSystem>} />
            <Route path="/tenants/success" element={<Navigate to="/tenants" replace />} />
            <Route path="/tenants/:id" element={<RequireSystem><TenantDetailPage /></RequireSystem>} />
            <Route path="/billing"               element={<RequireSystem><BillingOverviewPage /></RequireSystem>} />
            <Route path="/billing/subscriptions" element={<RequireSystem><SubscriptionsPage /></RequireSystem>} />
            <Route path="/billing/plans"         element={<RequireSystem><PricingPlansPage /></RequireSystem>} />
            <Route path="/billing/invoices"      element={<RequireSystem><InvoicesPage /></RequireSystem>} />
            <Route path="/admin/firm-verifications" element={<RequireSystem><FirmVerificationsPage /></RequireSystem>} />
            {/* Website enquiries (demo, trial, sales, audit firm, support) — ?open=<id> opens one */}
            <Route path="/admin/enquiries" element={<RequireSystem><EnquiriesPage /></RequireSystem>} />
            <Route path="/admin/rbac"             element={<RequireSystem><RbacAdminPage /></RequireSystem>} />
            <Route path="/admin/modules"          element={<RequireSystem><ModuleBlueprintAdminPage /></RequireSystem>} />
            <Route path="/admin/notifications"    element={<RequireSystem><NotificationTemplateAdminPage /></RequireSystem>} />
            <Route path="/admin/notification-email-rules" element={<RequireSystem><NotificationEmailRulesPage /></RequireSystem>} />
            <Route path="/admin/design-system"    element={<RequireSystem><DesignSystemPage /></RequireSystem>} />
            <Route path="/admin/screen-designer"  element={<RequireSystem><ScreenDesignerPage /></RequireSystem>} />
            <Route path="/admin/dashboard"        element={<RequireSystem><DashboardAdminPage /></RequireSystem>} />
            <Route path="/admin/audit/library"          element={<RequireSystem><AdminAuditLibraryPage /></RequireSystem>} />
            <Route path="/admin/controls/library"       element={<RequireSystem><ControlsLibraryPage /></RequireSystem>} />
            <Route path="/admin/audit/templates"        element={<RequireSystem><AuditTemplatesPage /></RequireSystem>} />
            <Route path="/admin/controls/frameworks"    element={<RequireSystem><ControlFrameworksPage /></RequireSystem>} />

            {/* Content platform (www.digiosec.com). Platform-owned, so it sits
                behind the same System guard as the rest of /admin. The splat is
                deliberate: ContentRoutes owns its own routing. */}
            <Route path="/admin/content/*" element={<RequireSystem><ContentRoutes /></RequireSystem>} />

            {/* Universal Module Page */}
            <Route path="/module"                                              element={<Navigate to="/admin/modules" replace />} />
            <Route path="/module/:entityType"                                  element={<UniversalModulePage />} />
            <Route path="/module/:entityType/:id"                              element={<UniversalModulePage />} />
            <Route path="/module/:parentEntityType/:parentId/:entityType"      element={<UniversalModulePage />} />
            <Route path="/module/:parentEntityType/:parentId/:entityType/:id"  element={<UniversalModulePage />} />

            {/* Audit */}
            <Route path="/audit/projects"                                element={<AuditProjectListPage />} />
            <Route path="/audit/projects/:projectId"                     element={<AuditEngagementListPage />} />
            <Route path="/audit/projects/:projectId/dashboard"          element={<AuditProjectDashboardPage />} />
            <Route path="/audit/programme/:instanceId/dashboard"        element={<AuditProjectDashboardPage />} />
            <Route path="/audit/programme/:instanceId/report"           element={<AuditProgrammeReportPage />} />
            <Route path="/audit/engagements"                            element={<AuditEngagementListPage />} />
            <Route path="/audit/engagements/:id"                        element={<AuditEngagementDetailPage />} />
            <Route path="/audit/engagements/:id/report"                 element={<AuditReportPage />} />
            <Route path="/audit/library"                                element={<OrgAuditLibraryPage />} />
            <Route path="/audit/kashilink"                              element={<KashiLinkPage />} />
            <Route path="/audit/kashilink/:tab"                         element={<KashiLinkPage />} />
            <Route path="/audit/policies/:id/edit"                      element={<PolicyEditorPage />} />
            <Route path="/audit/policies/:id"                           element={<PolicyEditorPage />} />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  )
}