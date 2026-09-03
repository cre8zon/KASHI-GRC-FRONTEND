import { useEffect, lazy, Suspense } from 'react'
import { useDispatch } from 'react-redux'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ScrollToTop } from './components/ScrollToTop'
import { useSelector } from 'react-redux'
import { selectIsAuthenticated, selectRoleSides, validateSession } from './store/slices/authSlice'
import { useTheme } from './hooks/useTheme'
import useFeatureGuard from './hooks/useFeatureGuard'
import { ROLE_SIDES } from './config/constants'

// Layout — NOT lazy: needed immediately on every page
import { AppShell } from './components/layout/AppShell'
import { ThemeProvider } from './providers/ThemeProvider'

// ── Lazy page imports — each page only loads when its route is first visited ──
// This eliminates the 280+ JS requests on cold load by splitting into chunks.

// Auth — small, loads fast, frequently needed
const LoginPage               = lazy(() => import('./pages/auth/LoginPage'))
const ForcePasswordChangePage = lazy(() => import('./pages/auth/ForcePasswordChangePage'))
const ForgotPasswordPage      = lazy(() => import('./pages/auth/ForgotPasswordPage'))
const ResetPasswordPage       = lazy(() => import('./pages/auth/ResetPasswordPage'))
const PasswordChangedPage     = lazy(() => import('./pages/auth/PasswordChangedPage'))

// Core — high-traffic pages, loaded early
const DashboardPage     = lazy(() => import('./pages/dashboard/DashboardPage'))
const SettingsPage      = lazy(() => import('./pages/settings/SettingsPage'))
const WorkflowInboxPage = lazy(() => import('./pages/workflow/WorkflowInboxPage'))
const AllTasksPage      = lazy(() => import('./pages/workflow/AllTasksPage'))
const TaskDetailPage    = lazy(() => import('./pages/workflow/TaskDetailPage'))
const ActionItemsPage   = lazy(() => import('./pages/action-items/ActionItemsPage'))
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'))

// Universal Module Page — the main audit/GRC module renderer
const UniversalModulePage = lazy(() => import('./pages/module/UniversalModulePage'))

// Users & Roles
const UserManagementPage  = lazy(() => import('./pages/users/UserManagementPage'))
const UsersHubPage        = lazy(() => import('./pages/users/UsersHubPage'))
const RolesPermissionsPage = lazy(() => import('./pages/roles/RolesPermissionsPage'))
const UserListPage         = lazy(() => import('./pages/users/UserListPage'))

// Reports
const ReportsPage            = lazy(() => import('./pages/reports/ReportsPage'))
const AssessmentReportPage   = lazy(() => import('./pages/reports/AssessmentReportPage'))
const AuditReportPage        = lazy(() => import('./pages/reports/AuditReportPage'))
const AuditProgrammeReportPage = lazy(() => import('./pages/reports/AuditProgrammeReportPage'))

// TPRM / Vendor — org side
const VendorListPage        = lazy(() => import('./pages/tprm/VendorListPage'))
const VendorDetailPage      = lazy(() => import('./pages/tprm/VendorDetailPage'))
const VendorOnboardPage     = lazy(() => import('./pages/tprm/VendorOnboardPage'))
const OrgTemplatesPage      = lazy(() => import('./pages/assessments/OrgTemplatesPage'))
const VendorAssessmentsPage = lazy(() => import('./pages/assessments/VendorAssessmentsPage'))
const AssessmentListPage    = lazy(() => import('./pages/assessments/AssessmentListPage'))
const AssessmentDetailPage  = lazy(() => import('./pages/assessments/AssessmentDetailPage'))
const AssessmentReviewPage  = lazy(() => import('./pages/assessments/AssessmentReviewPage'))
const ReviewAssistantPage   = lazy(() => import('./pages/assessments/ReviewAssistantPage'))

// Vendor side pages
const VendorAssessmentFillPage            = lazy(() => import('./pages/vendor/VendorAssessmentFillPage'))
const VendorAssessmentAssignPage          = lazy(() => import('./pages/vendor/VendorAssessmentAssignPage'))
const VendorAssessmentResponderReviewPage = lazy(() => import('./pages/vendor/VendorAssessmentResponderReviewPage'))
const VendorAssessmentAcknowledgePage     = lazy(() => import('./pages/vendor/VendorAssessmentAcknowledgePage'))

// Audit
const AuditProjectListPage      = lazy(() => import('./pages/audit/AuditProjectListPage'))
const AuditProjectDashboardPage = lazy(() => import('./pages/dashboard/AuditProjectDashboardPage'))
const AuditEngagementListPage   = lazy(() => import('./pages/audit/AuditEngagementListPage'))
const AuditEngagementDetailPage = lazy(() => import('./pages/audit/AuditEngagementDetailPage'))
const OrgAuditLibraryPage       = lazy(() => import('./pages/audit/AuditLibraryPage'))
const KashiLinkPage             = lazy(() => import('./pages/audit/KashiLinkPage'))
const PolicyEditorPage          = lazy(() => import('./pages/policies/PolicyEditorPage'))

// Auditor portal
const AuditorPortalPage = lazy(() => import('./pages/auditor/AuditorPortalPage'))

// Workflow admin
const WorkflowPage             = lazy(() => import('./pages/admin/workflows/WorkflowPage'))
const WorkflowBlueprintDesigner = lazy(() => import('./pages/admin/workflows/WorkflowBlueprintDesigner'))

// Platform Admin — only loaded by SYSTEM role users
const EmailTemplateManagerPage   = lazy(() => import('./pages/admin/email-templates/EmailTemplateManagerPage'))
const ExternalAuditorsPage       = lazy(() => import('./pages/auditor/ExternalAuditorsPage'))
const FirmClientsPage            = lazy(() => import('./pages/auditor/FirmClientsPage'))
const TenantListPage             = lazy(() => import('./pages/admin/tenants/TenantListPage'))
const CreateTenantPage           = lazy(() => import('./pages/admin/tenants/CreateTenantPage'))
const TenantSuccessPage          = lazy(() => import('./pages/admin/tenants/TenantSuccessPage'))
const TenantDetailPage           = lazy(() => import('./pages/admin/tenants/TenantDetailPage'))
const SendWelcomeEmailPage       = lazy(() => import('./pages/admin/tenants/SendWelcomeEmailPage'))
const QuestionLibraryPage        = lazy(() => import('./pages/admin/assessment/QuestionLibraryPage'))
const AssessmentTemplatesPage    = lazy(() => import('./pages/admin/assessment/AssessmentTemplatesPage'))
const RiskMappingPage            = lazy(() => import('./pages/admin/assessment/RiskMappingPage'))
const NavigationAdminPage        = lazy(() => import('./pages/admin/ui-config/NavigationAdminPage'))
const BlueprintsAdminPage        = lazy(() => import('./pages/admin/kashiguard/BlueprintsAdminPage'))
const GuardRulesAdminPage        = lazy(() => import('./pages/admin/kashiguard/GuardRulesAdminPage'))
const ComponentsAdminPage        = lazy(() => import('./pages/admin/ui-config/ComponentsAdminPage'))
const UiActionsAdminPage         = lazy(() => import('./pages/admin/ui-config/UiActionsAdminPage'))
const FormsAdminPage             = lazy(() => import('./pages/admin/ui-config/FormsAdminPage'))
const FeatureFlagsAdminPage      = lazy(() => import('./pages/admin/ui-config/FeatureFlagsAdminPage'))
const BrandingAdminPage          = lazy(() => import('./pages/admin/ui-config/BrandingAdminPage'))
const RbacAdminPage              = lazy(() => import('./pages/admin/rbac/RbacAdminPage'))
const ModuleBlueprintAdminPage   = lazy(() => import('./pages/admin/modules/ModuleBlueprintAdminPage'))
const NotificationTemplateAdminPage = lazy(() => import('./pages/admin/notifications/NotificationTemplateAdminPage'))
const NotificationEmailRulesPage = lazy(() => import('./pages/admin/notifications/NotificationEmailRulesPage'))
const NotificationPreferencesPage = lazy(() => import('./pages/settings/NotificationPreferencesPage'))
const DesignSystemPage           = lazy(() => import('./pages/admin/design-system/DesignSystemPage'))
const ScreenDesignerPage         = lazy(() => import('./pages/admin/screen-designer/ScreenDesignerPage'))
const DashboardAdminPage         = lazy(() => import('./pages/admin/dashboard/DashboardAdminPage'))
const ControlsLibraryPage        = lazy(() => import('./pages/admin/audit/ControlsLibraryPage'))
const AuditTemplatesPage         = lazy(() => import('./pages/admin/audit/AuditTemplatesPage'))
const ControlFrameworksPage      = lazy(() => import('./pages/admin/audit/ControlFrameworksPage'))
const AdminAuditLibraryPage      = lazy(() => import('./pages/admin/audit/AuditLibraryPage'))

// Content platform — its own route subtree rather than a page per screen.
// Everything under /admin/content is served by ContentRoutes, so adding a
// screen there does not touch this file. See pages/admin/content/ContentRoutes.
const ContentRoutes              = lazy(() => import('./pages/admin/content/ContentRoutes'))

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
  if (!isAuthenticated) return <Navigate to="/auth/login" state={{ from: location }} replace />
  return children
}

function RedirectIfAuthed({ children }) {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
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
  return (
    <ThemeProvider>
      <AppShell />
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
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/auth/login"            element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
          <Route path="/auth/forgot-password"  element={<RedirectIfAuthed><ForgotPasswordPage /></RedirectIfAuthed>} />
          <Route path="/auth/reset-password"   element={<ResetPasswordPage />} />
          <Route path="/auth/set-password"     element={<ForcePasswordChangePage />} />
          <Route path="/auth/password-changed" element={<PasswordChangedPage />} />
          <Route path="/"                      element={<Navigate to="/dashboard" replace />} />

          {/* Outside AppShell */}
          <Route path="/tenants/new"               element={<RequireSystem><RequireAuth><CreateTenantPage /></RequireAuth></RequireSystem>} />
          <Route path="/tenants/success"           element={<RequireSystem><RequireAuth><TenantSuccessPage /></RequireAuth></RequireSystem>} />
          <Route path="/tenants/:id/welcome-email" element={<RequireSystem><RequireAuth><SendWelcomeEmailPage /></RequireAuth></RequireSystem>} />

          {/* Protected AppShell */}
          <Route element={<RequireAuth><AppShellWithTheme /></RequireAuth>}>
            <Route path="/dashboard"      element={<DashboardPage />} />
            <Route path="/settings"       element={<SettingsPage />} />
            {/* Client side: admit audit firms. Firm side: staff clients. Both
                behave according to the tenant the token names. */}
            <Route path="/external-auditors" element={<ExternalAuditorsPage />} />
            <Route path="/firm/clients"      element={<FirmClientsPage />} />
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
            <Route path="/tenants/:id" element={<RequireSystem><TenantDetailPage /></RequireSystem>} />
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