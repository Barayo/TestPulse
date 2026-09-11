import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router'
import { Layout } from '@/components/Layout'
import { DataRevisionProvider } from '@/lib/DataRevision'
import { ThemeProvider } from '@/lib/ThemeProvider'
import { AuthProvider, useAuth } from '@/lib/useAuth'
import { SessionExpiredModal } from '@/components/SessionExpiredModal'
import ProjectsPage from '@/pages/ProjectsPage'
import ProjectPage from '@/pages/ProjectPage'
import SuitesPage from '@/pages/SuitesPage'
import SuiteDetailPage from '@/pages/SuiteDetailPage'
import RunsPage from '@/pages/RunsPage'
import NewRunPage from '@/pages/NewRunPage'
import FolderExplorerPage from '@/pages/FolderExplorerPage'
import CaseDetailPage from '@/pages/CaseDetailPage'
import CreateCasePage from '@/pages/CreateCasePage'
import RunPage from '@/pages/RunPage'
import RunItemDetailPage from '@/pages/RunItemDetailPage'
import RunComparePage from '@/pages/RunComparePage'
import RunComparePickerPage from '@/pages/RunComparePickerPage'
import ProjectReportsPage from '@/pages/ProjectReportsPage'
import ReleasesPage from '@/pages/ReleasesPage'
import ReleaseDetailPage from '@/pages/ReleaseDetailPage'
import TestPlanDetailPage from '@/pages/TestPlanDetailPage'
import RequirementsPage from '@/pages/RequirementsPage'
import RequirementDetailPage from '@/pages/RequirementDetailPage'
import LoginPage from '@/pages/LoginPage'
import SetupPage from '@/pages/SetupPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import RequiredPasswordChangePage from '@/pages/RequiredPasswordChangePage'
import PeoplePage from '@/pages/PeoplePage'
import RolesPage from '@/pages/RolesPage'
import TokensPage from '@/pages/TokensPage'
import ProfilePage from '@/pages/ProfilePage'
import ProjectMembersPage from '@/pages/ProjectMembersPage'
import ProjectSettingsPage from '@/pages/ProjectSettingsPage'
import InstanceSettingsPage from '@/pages/InstanceSettingsPage'

// RequireAuth gates every non-login route on a resolved session (design
// D6/D7): while the session check is in flight it renders nothing (avoids a
// flash of protected content), then redirects to /login — preserving the
// originally requested path so LoginPage can return the user there (e.g.
// a session timeout mid-task shouldn't lose their place).
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, setupRequired } = useAuth()
  const location = useLocation()

  if (loading) return null
  // Checked ahead of the session check below (add-first-run-setup): a
  // fresh instance's very first visitor has no session yet either, and
  // must land on /setup, not bounce to /login for an account that can't
  // exist yet.
  if (setupRequired) return <Navigate to="/setup" replace />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  // A mandatory gate, not a redirect to a route of its own — rendered in
  // place of whatever was requested, for every RequireAuth-protected route
  // (add-change-own-password). AllowAnonymous checks the same flag below —
  // the root path (`/`) is itself an anonymous route, so gating only here
  // would miss a flagged admin who lands there right after login.
  if (user.mustChangePassword) return <RequiredPasswordChangePage />
  return <Layout>{children}</Layout>
}

// AllowAnonymous wraps a project-content route in the same Layout chrome
// as RequireAuth, but with no redirect: the page itself resolves whether
// it can render for the current session (authenticated call, or the
// public-API call for a publicly accessible project) and falls back to
// its own "not found" state otherwise (unify-authenticated-and-public-views
// design.md D3). Only used by routes in PROJECT_CONTENT_ROUTES once that
// specific page's dual-mode migration has landed — until then, entries in
// that list still render through RequireAuth like everything else.
function AllowAnonymous({ children }: { children: ReactNode }) {
  const { user, loading, setupRequired } = useAuth()
  if (loading) return null
  // Same first-run redirect as RequireAuth, for the same reason — `/` is
  // itself an anonymous route (PROJECT_CONTENT_ROUTES), so a fresh
  // instance's very first visitor hits this wrapper directly, with no
  // session to have resolved yet either (add-first-run-setup).
  if (setupRequired) return <Navigate to="/setup" replace />
  // Same mandatory gate as RequireAuth, for the same reason — an
  // authenticated, flagged user must see it regardless of whether the
  // specific route they landed on would also work anonymously
  // (add-change-own-password). An anonymous visitor (user === null) is
  // unaffected — the page's own dual-mode logic still applies to them.
  if (user?.mustChangePassword) return <RequiredPasswordChangePage />
  return <Layout>{children}</Layout>
}

// Old /public/{key} links (documented, potentially already shared)
// redirect to the unified page rather than 404ing (design.md D7). Pure,
// existence-blind path rewrite — never checks whether the project exists
// or is public; the destination page (unwrapped per D3) owns that
// decision entirely, the same way it already does for a direct
// /projects/{key} visit.
function RedirectToProject() {
  const { projectKey } = useParams<{ projectKey: string }>()
  return <Navigate to={`/projects/${projectKey}`} replace />
}

type RouteEntry = {
  path: string
  element: ReactNode
  // True once this specific page's dual-mode migration has landed
  // (unify-authenticated-and-public-views tasks.md §3-11) — flips its
  // wrapper below from `RequireAuth` to `AllowAnonymous`, one entry at a
  // time. False entries render through `RequireAuth` exactly like
  // `ACCOUNT_ONLY_ROUTES`, unchanged, until their own task lands.
  anonymous?: boolean
}

// Routes whose page CAN render without a session, for a project that is
// publicly accessible — the categorization design.md D9 requires to be a
// structural fact of the code, not prose.
const PROJECT_CONTENT_ROUTES: RouteEntry[] = [
  { path: '/', element: <ProjectsPage />, anonymous: true },
  { path: '/projects/:projectKey', element: <ProjectPage />, anonymous: true },
  { path: '/projects/:projectKey/suites', element: <SuitesPage />, anonymous: true },
  { path: '/projects/:projectKey/suites/:suiteKey', element: <SuiteDetailPage />, anonymous: true },
  { path: '/projects/:projectKey/runs', element: <RunsPage />, anonymous: true },
  { path: '/projects/:projectKey/library', element: <FolderExplorerPage />, anonymous: true },
  // add-folder-slug-urls: a slash-separated path of slugified ancestor
  // folder names (e.g. /library/authentication/two-factor), resolved
  // client-side against the already-loaded folder tree — not a folder ID.
  { path: '/projects/:projectKey/library/*', element: <FolderExplorerPage />, anonymous: true },
  { path: '/projects/:projectKey/cases/:caseKey', element: <CaseDetailPage />, anonymous: true },
  { path: '/runs/:runKey', element: <RunPage />, anonymous: true },
  { path: '/runs/:runKey/items/:caseKey', element: <RunItemDetailPage />, anonymous: true },
  { path: '/runs/compare/:runKeyA/:runKeyB', element: <RunComparePage />, anonymous: true },
  { path: '/projects/:projectKey/runs/compare', element: <RunComparePickerPage />, anonymous: true },
  { path: '/projects/:projectKey/reports', element: <ProjectReportsPage />, anonymous: true },
]

// Every other authenticated route — no public equivalent exists or should
// exist for any of these (membership, settings, every admin page, the
// create-run form). Always rendered through `RequireAuth`.
const ACCOUNT_ONLY_ROUTES: RouteEntry[] = [
  { path: '/projects/:projectKey/runs/new', element: <NewRunPage /> },
  { path: '/projects/:projectKey/cases/new', element: <CreateCasePage /> },
  { path: '/projects/:projectKey/releases', element: <ReleasesPage /> },
  { path: '/projects/:projectKey/releases/:releaseKey', element: <ReleaseDetailPage /> },
  { path: '/projects/:projectKey/releases/:releaseKey/plans/:planKey', element: <TestPlanDetailPage /> },
  { path: '/projects/:projectKey/requirements', element: <RequirementsPage /> },
  { path: '/projects/:projectKey/requirements/:requirementKey', element: <RequirementDetailPage /> },
  { path: '/projects/:projectKey/members', element: <ProjectMembersPage /> },
  { path: '/projects/:projectKey/settings', element: <ProjectSettingsPage /> },
  { path: '/settings/people', element: <PeoplePage /> },
  { path: '/settings/roles', element: <RolesPage /> },
  { path: '/settings/tokens', element: <TokensPage /> },
  { path: '/settings/instance', element: <InstanceSettingsPage /> },
  { path: '/settings/profile', element: <ProfilePage /> },
  { path: '*', element: <p className="text-sm text-muted-foreground">Page not found.</p> },
]

export { PROJECT_CONTENT_ROUTES, ACCOUNT_ONLY_ROUTES, AllowAnonymous }

// Reads colorTheme/customPalette from AuthProvider's context and passes
// them into ThemeProvider as props (add-color-theme-customization) —
// ThemeProvider itself stays prop-driven, not a useAuth() consumer, so it
// remains usable/testable standalone (ThemeProvider.test.tsx) even though
// AuthProvider is now its ancestor here.
function ThemedApp() {
  const { colorTheme, customPalette } = useAuth()
  return (
    <ThemeProvider colorTheme={colorTheme} customPalette={customPalette}>
      <DataRevisionProvider>
        <SessionExpiredModal />
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/public" element={<Navigate to="/" replace />} />
          <Route path="/public/:projectKey" element={<RedirectToProject />} />
          {/* The only two sources of a route below `/login`/`/public*` — see
              design.md D9. A route added directly here instead of to one of
              the two arrays above would bypass the manifest test in
              App.test.tsx; don't do that. */}
          {PROJECT_CONTENT_ROUTES.map(({ path, element, anonymous }) =>
            anonymous ? (
              <Route key={path} path={path} element={<AllowAnonymous>{element}</AllowAnonymous>} />
            ) : (
              <Route key={path} path={path} element={<RequireAuth>{element}</RequireAuth>} />
            ),
          )}
          {ACCOUNT_ONLY_ROUTES.map(({ path, element }) => (
            <Route key={path} path={path} element={<RequireAuth>{element}</RequireAuth>} />
          ))}
        </Routes>
      </DataRevisionProvider>
    </ThemeProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemedApp />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
