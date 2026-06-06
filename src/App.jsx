import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ScrollToTop } from './components/ScrollToTop'
import { useSelector } from 'react-redux'
import { selectIsAuthenticated, selectRoleSides, validateSession } from './store/slices/authSlice'
import { useTheme } from './hooks/useTheme'
import { ROLE_SIDES } from './config/constants'

// Layout
import { AppShell } from './components/layout/AppShell'
import { ThemeProvider } from './providers/ThemeProvider'

// Auth
import LoginPage               from './pages/auth/LoginPage'
import ForcePasswordChangePage from './pages/auth/ForcePasswordChangePage'
import PasswordChangedPage     from './pages/auth/PasswordChangedPage'

// Core
import DashboardPage     from './pages/dashboard/DashboardPage'
import SettingsPage      from './pages/settings/SettingsPage'
import WorkflowInboxPage from './pages/workflow/WorkflowInboxPage'
import AllTasksPage      from './pages/workflow/AllTasksPage'
import TaskDetailPage      from './pages/workflow/TaskDetailPage'
import ActionItemsPage      from './pages/action-items/ActionItemsPage'
import NotificationsPage    from './pages/notifications/NotificationsPage'
import AssessmentListPage   from './pages/assessments/AssessmentListPage'
import AssessmentDetailPage from './pages/assessments/AssessmentDetailPage'
import UserManagementPage    from './pages/users/UserManagementPage'
import RolesPermissionsPage from './pages/roles/RolesPermissionsPage'
import ReportsPage from './pages/reports/ReportsPage'
import AssessmentReportPage from './pages/reports/AssessmentReportPage'
// ── ADDED: AuditReportPage was missing — referenced by VIEW_REPORT __navRoute
import AuditReportPage from './pages/reports/AuditReportPage'

// ── ORGANISATION side ─────────────────────────────────────────────────────────
import VendorListPage        from './pages/tprm/VendorListPage'
import VendorDetailPage      from './pages/tprm/VendorDetailPage'
import VendorOnboardPage     from './pages/tprm/VendorOnboardPage'
import OrgTemplatesPage      from './pages/assessments/OrgTemplatesPage'
import VendorAssessmentsPage from './pages/assessments/VendorAssessmentsPage'
import AssessmentReviewPage  from './pages/assessments/AssessmentReviewPage'
// ↓ NEW: Review Assistant page — mirrors VendorAssessmentFillPage contributor mode
import ReviewAssistantPage   from './pages/assessments/ReviewAssistantPage'

// ── VENDOR side ───────────────────────────────────────────────────────────────
import VendorAssessmentFillPage            from './pages/vendor/VendorAssessmentFillPage'
import VendorAssessmentAssignPage          from './pages/vendor/VendorAssessmentAssignPage'
import VendorAssessmentResponderReviewPage from './pages/vendor/VendorAssessmentResponderReviewPage'
import VendorAssessmentAcknowledgePage    from './pages/vendor/VendorAssessmentAcknowledgePage'

// ── PLATFORM ADMIN ────────────────────────────────────────────────────────────
import UserListPage            from './pages/users/UserListPage'
import EmailTemplateManagerPage from './pages/admin/email-templates/EmailTemplateManagerPage'
import TenantListPage           from './pages/admin/tenants/TenantListPage'
import CreateTenantPage         from './pages/admin/tenants/CreateTenantPage'
import TenantSuccessPage        from './pages/admin/tenants/TenantSuccessPage'
import TenantDetailPage         from './pages/admin/tenants/TenantDetailPage'
import SendWelcomeEmailPage     from './pages/admin/tenants/SendWelcomeEmailPage'
import QuestionLibraryPage      from './pages/admin/assessment/QuestionLibraryPage'
import AssessmentTemplatesPage  from './pages/admin/assessment/AssessmentTemplatesPage'
import RiskMappingPage          from './pages/admin/assessment/RiskMappingPage'
import WorkflowPage             from './pages/admin/workflows/WorkflowPage'
import NavigationAdminPage      from './pages/admin/ui-config/NavigationAdminPage'
import BlueprintsAdminPage      from './pages/admin/kashiguard/BlueprintsAdminPage'
import GuardRulesAdminPage      from './pages/admin/kashiguard/GuardRulesAdminPage'
import ComponentsAdminPage      from './pages/admin/ui-config/ComponentsAdminPage'
import UiActionsAdminPage       from './pages/admin/ui-config/UiActionsAdminPage'
import FormsAdminPage           from './pages/admin/ui-config/FormsAdminPage'
import FeatureFlagsAdminPage    from './pages/admin/ui-config/FeatureFlagsAdminPage'
import BrandingAdminPage        from './pages/admin/ui-config/BrandingAdminPage'

// ── NEW IMPORTS ───────────────────────────────────────────────────────────────
import UniversalModulePage           from './pages/module/UniversalModulePage'
import RbacAdminPage                 from './pages/admin/rbac/RbacAdminPage'
import ModuleBlueprintAdminPage      from './pages/admin/modules/ModuleBlueprintAdminPage'
import NotificationTemplateAdminPage from './pages/admin/notifications/NotificationTemplateAdminPage'
import WorkflowBlueprintDesigner     from './pages/admin/workflows/WorkflowBlueprintDesigner'
import DesignSystemPage              from './pages/admin/design-system/DesignSystemPage'
import ScreenDesignerPage            from './pages/admin/screen-designer/ScreenDesignerPage'

import ControlsLibraryPage    from './pages/admin/audit/ControlsLibraryPage'
import AuditTemplatesPage     from './pages/admin/audit/AuditTemplatesPage'
import ControlFrameworksPage  from './pages/admin/audit/ControlFrameworksPage'
// ── RENAMED: avoid clash with pages/audit/AuditLibraryPage imported below
import AdminAuditLibraryPage  from './pages/admin/audit/AuditLibraryPage'
import AuditProjectListPage      from './pages/audit/AuditProjectListPage'
import AuditEngagementListPage   from './pages/audit/AuditEngagementListPage'
import AuditEngagementDetailPage from './pages/audit/AuditEngagementDetailPage'
// ── ADDED: org read-only audit library (distinct from admin version above)
import OrgAuditLibraryPage    from './pages/audit/AuditLibraryPage'
// ── ADDED: PolicyEditorPage existed but had no route or import
import PolicyEditorPage       from './pages/policies/PolicyEditorPage'

import DashboardAdminPage  from './pages/admin/dashboard/DashboardAdminPage'
import AuditorPortalPage   from './pages/auditor/AuditorPortalPage'

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

// ─── App ──────────────────────────────────────────────────────────────────────
// Wraps AppShell with ThemeProvider so all useTheme() consumers share one state.
// primaryColor from Redux ensures brand-theme sidebar uses the correct color.
function AppShellWithTheme() {
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
      <Routes>
      {/* Public */}
      <Route path="/auth/login"            element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
      <Route path="/auth/reset-password"   element={<ForcePasswordChangePage />} />
      <Route path="/auth/password-changed" element={<PasswordChangedPage />} />
      <Route path="/"                      element={<Navigate to="/dashboard" replace />} />

      {/* Outside AppShell */}
      <Route path="/tenants/new"               element={<RequireAuth><CreateTenantPage /></RequireAuth>} />
      <Route path="/tenants/success"           element={<RequireAuth><TenantSuccessPage /></RequireAuth>} />
      <Route path="/tenants/:id/welcome-email" element={<RequireAuth><SendWelcomeEmailPage /></RequireAuth>} />

      {/* Protected AppShell */}
      <Route element={<RequireAuth><AppShellWithTheme /></RequireAuth>}>
        <Route path="/dashboard"      element={<DashboardPage />} />
        <Route path="/settings"       element={<SettingsPage />} />
        <Route path="/workflow/inbox"        element={<WorkflowInboxPage />} />
        <Route path="/workflow/tasks"        element={<AllTasksPage />} />
        <Route path="/workflow/tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="/action-items"           element={<ActionItemsPage />} />
        <Route path="/notifications"          element={<NotificationsPage />} />
        <Route path="/assessments"           element={<VendorAssessmentsPage />} />
        <Route path="/assessments/:id"       element={<AssessmentDetailPage />} />

        {/* ── Org side — Vendors / TPRM ────────────────────────────── */}
        <Route path="/tprm/vendors"          element={<VendorListPage />} />
        <Route path="/tprm/vendors/onboard"  element={<VendorOnboardPage />} />
        <Route path="/tprm/vendors/:id"      element={<VendorDetailPage />} />

        {/* ── Org side — Assessments ───────────────────────────────── */}
        <Route path="/assessments/vendor"     element={<VendorAssessmentsPage />} />
        <Route path="/assessments/templates"  element={<OrgTemplatesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/assessments/:id" element={<AssessmentReportPage />} />

        {/*
          Review pages — two distinct routes for two distinct roles:

          /assessments/:id/review
            navKey: org_assessment_review
            Who: ORG_CISO (assigns/approve), ORG_REVIEWER (evaluates sections),
                 CONSOLIDATOR (step 12), ORG_CISO_APPROVER (final), ORG_ADMIN (sign-off)
            Panel dispatch: resolveOrgPanel() by actorRoleName + stepAction

          /assessments/:id/assistant-review       ← NEW
            navKey: org_assistant_review
            Who: ORG_REVIEW_ASSISTANT (evaluates assigned questions only)
            Mirrors vendor /fill?role=contributor — dedicated focused page
        */}
        <Route path="/assessments/:id/review"           element={<AssessmentReviewPage />} />
        <Route path="/assessments/:id/assistant-review" element={<ReviewAssistantPage />} />

        {/* ── Org side — Users & Roles ─────────────────────────────── */}
        <Route path="/users" element={
          isPlatformAdmin
            ? <UserManagementPage side="SYSTEM" />
            : <UserManagementPage side="ORGANIZATION" />
        } />
        <Route path="/roles" element={
          isPlatformAdmin
            ? <RolesPermissionsPage side="SYSTEM" />
            : <RolesPermissionsPage side="ORGANIZATION" />
        } />
        <Route path="/vendor/users"  element={<UserManagementPage side="VENDOR" />} />

        {/* ── Org side — Workflow overview ─────────────────────────── */}
        <Route path="/workflow"
          element={<WorkflowPage isPlatformAdmin={false} defaultTab="instances" />} />

        {/* ── Vendor side ──────────────────────────────────────────── */}
        {/* /vendor/assessments uses the unified AssessmentListPage.
            Backend scopes results by callerVendorId for vendor users. */}
        <Route path="/vendor/assessments"
          element={<VendorAssessmentsPage />} />
        <Route path="/vendor/assessments/:id/fill"
          element={<VendorAssessmentFillPage />} />
        <Route path="/vendor/assessments/:id/assign"
          element={<VendorAssessmentAssignPage />} />
        <Route path="/vendor/assessments/:id/acknowledge"
          element={<VendorAssessmentAcknowledgePage />} />
        <Route path="/vendor/assessments/:id/responder-review"
          element={<VendorAssessmentResponderReviewPage />} />

        {/* ── External Auditor side ──────────────────────────────────────────── */}
        <Route path="/auditor/portal"  element={<AuditorPortalPage />} />


        {/* ── Platform Admin — existing ─────────────────────────────── */}
        <Route path="/users-list"                     element={<UserListPage />} />
        <Route path="/admin/email-templates"          element={<EmailTemplateManagerPage />} />
        <Route path="/admin/assessment/questions"     element={<QuestionLibraryPage />} />
        <Route path="/admin/assessment/templates"     element={<AssessmentTemplatesPage />} />
        <Route path="/admin/assessment/risk-mappings" element={<RiskMappingPage />} />
        <Route path="/admin/workflows"
          element={<WorkflowPage isPlatformAdmin={isPlatformAdmin} defaultTab="blueprints" />} />
        <Route path="/admin/workflow-instances"
          element={<WorkflowPage isPlatformAdmin={isPlatformAdmin} defaultTab="instances" />} />
        <Route path="/admin/kashiguard/blueprints" element={<BlueprintsAdminPage />} />
        <Route path="/admin/kashiguard/rules"      element={<GuardRulesAdminPage />} />
        <Route path="/admin/ui/navigation"  element={<NavigationAdminPage />} />
        <Route path="/admin/ui/components"  element={<ComponentsAdminPage />} />
        <Route path="/admin/ui/actions"     element={<UiActionsAdminPage />} />
        <Route path="/admin/ui/forms"       element={<FormsAdminPage />} />
        <Route path="/admin/ui/flags"       element={<FeatureFlagsAdminPage />} />
        <Route path="/admin/ui/branding"    element={<BrandingAdminPage />} />
        <Route path="/tenants"     element={<TenantListPage />} />
        <Route path="/tenants/:id" element={<TenantDetailPage />} />

        {/* ── NEW ROUTES ───────────────────────────────────────────── */}

        {/* Universal Module Page — renders any GRC module from blueprint config.
            Existing hardcoded routes (/tprm/vendors etc.) are completely untouched.
            This is a new parallel path — only /module/:entityType routes use it. */}
        {/* Module index — redirects to /admin/modules since no entityType is known */}
        <Route path="/module" element={<Navigate to="/admin/modules" replace />} />
        {/* ── Flat module routes ─────────────────────────────────────────────── */}
        <Route path="/module/:entityType"     element={<UniversalModulePage />} />
        <Route path="/module/:entityType/:id" element={<UniversalModulePage />} />

        {/* ── v2: Parent-scoped child module routes ──────────────────────────── */}
        {/* Used when blueprint has parentContextJson set.
            Examples:
              /module/audit_engagement/42/audit_control_instance   (controls for engagement 42)
              /module/audit_engagement/42/audit_control_instance/17 (control 17 detail)
              /module/audit_project/1/audit_engagement              (engagements for project 1)
              /module/risk/5/action_item                            (action items for risk 5) */}
        <Route path="/module/:parentEntityType/:parentId/:entityType"     element={<UniversalModulePage />} />
        <Route path="/module/:parentEntityType/:parentId/:entityType/:id" element={<UniversalModulePage />} />

        {/* Platform Admin — RBAC & permissions */}
        <Route path="/admin/rbac"             element={<RbacAdminPage />} />

        {/* Platform Admin — Module blueprints */}
        <Route path="/admin/modules"          element={<ModuleBlueprintAdminPage />} />

        {/* Platform Admin — Notification templates */}
        <Route path="/admin/notifications"    element={<NotificationTemplateAdminPage />} />

        {/* Platform Admin — Full-page workflow blueprint designer.
            Replaces the modal-based editor. WorkflowPage.jsx is untouched —
            it still handles the Instances tab at /admin/workflows. */}
        <Route path="/admin/workflows/blueprints" element={<WorkflowBlueprintDesigner />} />

        {/* Platform Admin — Design system / component playground */}
        <Route path="/admin/design-system"    element={<DesignSystemPage />} />

        <Route path="/admin/screen-designer" element={<ScreenDesignerPage />} />
        <Route path="/admin/dashboard" element={<DashboardAdminPage />} />

        {/* ── Platform Admin — Audit & Controls Config ─────────── */}
        <Route path="/admin/audit/library"          element={<AdminAuditLibraryPage />} />
        <Route path="/admin/controls/library"       element={<ControlsLibraryPage />} />
        <Route path="/admin/audit/templates"        element={<AuditTemplatesPage />} />
        <Route path="/admin/controls/frameworks"    element={<ControlFrameworksPage />} />
        <Route path="/audit/projects"             element={<AuditProjectListPage />} />
        <Route path="/audit/projects/:projectId"  element={<AuditEngagementListPage />} />
        <Route path="/audit/engagements/:id"      element={<AuditEngagementDetailPage />} />
        {/* ── ADDED: routes that were missing ──────────────────────────────── */}
        <Route path="/audit/engagements"            element={<AuditEngagementListPage />} />
        <Route path="/audit/engagements/:id/report" element={<AuditReportPage />} />
        <Route path="/audit/library"                element={<OrgAuditLibraryPage />} />
        <Route path="/audit/policies/:id/edit"      element={<PolicyEditorPage />} />
        <Route path="/audit/policies/:id"           element={<PolicyEditorPage />} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
    </>
  )
}