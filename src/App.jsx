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
import FormsAdminPage           from './pages/admin/ui-config/FormsAdminPage'
import FeatureFlagsAdminPage    from './pages/admin/ui-config/FeatureFlagsAdminPage'
import BrandingAdminPage        from './pages/admin/ui-config/BrandingAdminPage'

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
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/dashboard"      element={<DashboardPage />} />
        <Route path="/settings"       element={<SettingsPage />} />
        <Route path="/workflow/inbox"        element={<WorkflowInboxPage />} />
        <Route path="/workflow/tasks"        element={<AllTasksPage />} />
        <Route path="/workflow/tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="/action-items"           element={<ActionItemsPage />} />
        <Route path="/notifications"          element={<NotificationsPage />} />
        <Route path="/assessments"           element={<AssessmentListPage />} />
        <Route path="/assessments/:id"       element={<AssessmentDetailPage />} />

        {/* ── Org side — Vendors / TPRM ────────────────────────────── */}
        <Route path="/tprm/vendors"          element={<VendorListPage />} />
        <Route path="/tprm/vendors/onboard"  element={<VendorOnboardPage />} />
        <Route path="/tprm/vendors/:id"      element={<VendorDetailPage />} />

        {/* ── Org side — Assessments ───────────────────────────────── */}
        <Route path="/assessments/vendor"     element={<VendorAssessmentsPage />} />
        <Route path="/assessments/templates"  element={<OrgTemplatesPage />} />
        <Route path="/reports" element={<ReportsPage />} />

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

        {/* ── Platform Admin ───────────────────────────────────────── */}
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
        <Route path="/admin/ui/forms"       element={<FormsAdminPage />} />
        <Route path="/admin/ui/flags"       element={<FeatureFlagsAdminPage />} />
        <Route path="/admin/ui/branding"    element={<BrandingAdminPage />} />
        <Route path="/tenants"     element={<TenantListPage />} />
        <Route path="/tenants/:id" element={<TenantDetailPage />} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
    </>
  )
}