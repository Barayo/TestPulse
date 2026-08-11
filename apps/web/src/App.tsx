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
import RunPage from '@/pages/RunPage'
import RunItemDetailPage from '@/pages/RunItemDetailPage'
import LoginPage from '@/pages/LoginPage'
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
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
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
  const { loading } = useAuth()
  if (loading) return null
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
  { path: '/projects/:projectKey/library/:folderId', element: <FolderExplorerPage />, anonymous: true },
  { path: '/projects/:projectKey/cases/:caseKey', element: <CaseDetailPage />, anonymous: true },
  { path: '/runs/:runKey', element: <RunPage />, anonymous: true },
  { path: '/runs/:runKey/items/:caseKey', element: <RunItemDetailPage />, anonymous: true },
]

// Every other authenticated route — no public equivalent exists or should
// exist for any of these (membership, settings, every admin page, the
// create-run form). Always rendered through `RequireAuth`.
const ACCOUNT_ONLY_ROUTES: RouteEntry[] = [
  { path: '/projects/:projectKey/runs/new', element: <NewRunPage /> },
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

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <DataRevisionProvider>
            <SessionExpiredModal />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
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
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
