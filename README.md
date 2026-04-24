# KashiGRC Frontend

Enterprise GRC + TPRM platform frontend — React 18 + Vite + Redux Toolkit + TanStack React Query.

## Quick Start

```bash
npm install
npm run dev
```

App runs at http://localhost:3000 and proxies `/v1/*` to Spring Boot on port 8080.

## Architecture

```
src/
  api/              One file per Spring controller — auth, users, vendors, workflows, assessments, notifications, documents, uiConfig
  store/slices/     authSlice (JWT, roles, permissions), uiConfigSlice (branding, feature flags)
  hooks/            React Query hooks — useUIConfig, useAuth, useUsers, useVendors, useWorkflow, useNotifications
  components/
    ui/             Badge, Button, DataTable, Input, Select, Card, Modal, EmptyState — all dynamic
    layout/         AppShell, Sidebar, TopNav, PageLayout, PermissionGate, RoleSideGate, FeatureGate
    workflow/       WorkflowTimeline, TaskInbox
    forms/          DynamicForm — builds Zod schema at runtime from DB field definitions
    charts/         DashboardWidget — KPI, bar, line, area, pie, donut, progress widgets
  pages/            auth/, dashboard/, tprm/, users/, workflow/, settings/
  config/           axios.config.js, queryClient.js, constants.js
  utils/            format.js, permissions.js
  lib/              cn.js (clsx helper)
```

## DB-driven principles

| UI Element          | DB table         | How it works                                      |
|---------------------|------------------|---------------------------------------------------|
| Sidebar nav items   | ui_navigation    | useNavigation() — filtered by role side + perm    |
| Dropdown options    | ui_options       | useScreenConfig(key).components[key].options      |
| Badge colors        | ui_options       | DynamicBadge reads colorTag from options          |
| Table columns       | ui_layouts       | DataTable reads columnsJson from screenConfig     |
| Form fields         | ui_form_fields   | DynamicForm builds Zod schema from validationRulesJson |
| Action buttons      | ui_actions       | DynamicActionBar — filtered by role + status      |
| Dashboard widgets   | dashboard_widgets| DashboardGrid — filtered by role side             |
| Feature flags       | feature_flags    | FeatureGate — reads from Redux uiConfigSlice      |
| Branding/colors     | tenant_branding  | CSS variables injected at bootstrap               |

## Bootstrap flow

1. User logs in → `POST /v1/auth/login`
2. Redux stores: token, tenantId, roles, permissions
3. `GET /v1/ui-config/bootstrap` — navigation tree, branding, widgets, flags
4. CSS variables updated from branding (primary color, logo, company name)
5. Every API call auto-attaches `Authorization` + `X-Tenant-ID` via Axios interceptor
6. Navigation filtered server-side by user's role side + permissions

## Adding a new screen

1. Create `src/pages/mymodule/MyPage.jsx`
2. Add a route in `src/App.jsx`
3. Insert a row in `ui_navigation` table — it appears in sidebar instantly
4. Insert a row in `ui_layouts` with `layout_key = 'my_screen'` — DataTable reads columns
5. Insert rows in `ui_components` + `ui_options` for any dropdowns on the screen
6. No other code changes needed
