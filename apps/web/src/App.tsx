import type { ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { ProjectSwitcher } from '@/components/ProjectSwitcher'
import { AdminMenu } from '@/components/AdminMenu'
import { UserMenu } from '@/components/UserMenu'
import { HealthBadge } from '@/components/HealthBadge'
import { useActiveProjectId } from '@/lib/useActiveProject'
import { useProjectSummaries } from '@/lib/useProjectSummaries'
import { ProjectSwitcherProvider } from '@/lib/useProjectSwitcher'
import { DataRevisionProvider } from '@/lib/DataRevision'
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

function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const activeProjectId = useActiveProjectId()
  const projects = useProjectSummaries()
  const { user, logout } = useAuth()
  // The switcher exists to jump between projects while inside one — it only
  // makes sense on a route that is actually about a specific project
  // (checked by route shape, not by whether resolution succeeded: a run
  // whose project lookup failed is still a project-scoped page and should
  // show "Select project", not hide the switcher outright).
  const isProjectScopedPage = /^\/(projects|runs)\//.test(location.pathname)
  // The landing page shows the project's own name as its heading right
  // below the header (ProjectPage.tsx) — the header chip would be a third
  // repeat there, so it's suppressed on this one route; the chip's switch
  // affordance moves to a chevron fused onto that heading instead.
  const isProjectLandingPage = /^\/projects\/[^/]+\/?$/.test(location.pathname)
  // Tenant-Admin-only instance settings (People/Roles) aren't project-scoped
  // either, but "Select project" is actively wrong there — there's nothing
  // to select. /settings/tokens is deliberately excluded: it's personal
  // (every user's own API tokens), not an admin concern.
  const isAdminSettingsPage = /^\/settings\/(people|roles)(\/|$)/.test(location.pathname)

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <ProjectSwitcherProvider projects={projects} onSelectProject={(id) => navigate(`/projects/${id}`)}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-baseline gap-1.5 sm:gap-2">
              {/* Matches assets/brand/testpulse-icon.svg (icon tile, EKG
                  stroke) and testpulse-logo-horizontal.svg (Test/Pulse color
                  split) — the header brand mark previously matched neither. */}
              {/* -ml-5: a partial hanging indent — pulling the icon fully
                  flush with the page content below it clipped it against the
                  header's own padding, so this closes most (not all) of the
                  gap between the icon's edge and the wordmark text's edge.
                  Left ~4px of breathing room from the true viewport edge
                  rather than going fully flush (0px), which read as too
                  tight at full page width. */}
              {/* text-[24px]: Recursive Variable renders more compact per
                  font-size unit than Geist, so at this size the wordmark's
                  rendered box height already lands close to the project
                  name's own bumped size below (ProjectSwitcher.tsx) — the
                  lead comes from color/weight, not from the wordmark
                  dwarfing the project name. */}
              <Link to="/" className="-ml-5 flex shrink-0 items-center gap-1.5 text-[24px] leading-none">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 200 200"
                  className="size-[26px] shrink-0 rounded-[5px]"
                >
                  <rect x="0" y="0" width="200" height="200" rx="44" ry="44" fill="url(#tp-wordmark-gradient)" />
                  <defs>
                    <linearGradient id="tp-wordmark-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#14B8A6" />
                      <stop offset="100%" stopColor="#0D6E6A" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M35,112 L62,112 L78,74 L94,140 L112,112 L122,112 L138,130 L172,64"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={14}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>
                  <span className="text-foreground tp-wordmark-test">Test</span>
                  <span className="text-primary tp-wordmark-pulse">Pulse</span>
                </span>
              </Link>
              {(isProjectScopedPage || isAdminSettingsPage) && !isProjectLandingPage && (
                <>
                  {/* text-[20px] + relative -top-1.5: sized up to match the
                      now-larger wordmark/project name either side of it.
                      Verified against getBoundingClientRect() center, not
                      just a visual glance — a smaller crop had made an
                      earlier (wrong-direction) offset look aligned when it
                      measured 10px off. */}
                  <span
                    aria-hidden="true"
                    className="relative -top-1.5 font-mono text-[20px] text-muted-foreground"
                  >
                    ›
                  </span>
                  {isAdminSettingsPage ? (
                    <span className="relative -top-1 truncate text-[20px] leading-none font-bold text-muted-foreground">
                      Administration
                    </span>
                  ) : (
                    <ProjectSwitcher
                      projects={projects}
                      activeProjectId={activeProjectId}
                      onSelectProject={(id) => navigate(`/projects/${id}`)}
                    />
                  )}
                </>
              )}
            </div>
            {user && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {user.isTenantAdmin && <AdminMenu />}
                <UserMenu user={user} onLogout={() => void handleLogout()} />
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 px-6 py-8">{children}</main>
        <footer className="flex justify-center border-t px-4 py-3 sm:px-6">
          <HealthBadge />
        </footer>
      </div>
    </ProjectSwitcherProvider>
  )
}

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

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataRevisionProvider>
          <SessionExpiredModal />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><ProjectsPage /></RequireAuth>} />
            <Route
              path="/projects/:projectKey"
              element={
                <RequireAuth>
                  <ProjectPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:projectKey/suites"
              element={
                <RequireAuth>
                  <SuitesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:projectKey/suites/:suiteKey"
              element={
                <RequireAuth>
                  <SuiteDetailPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:projectKey/runs"
              element={
                <RequireAuth>
                  <RunsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:projectKey/runs/new"
              element={
                <RequireAuth>
                  <NewRunPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:projectKey/library"
              element={
                <RequireAuth>
                  <FolderExplorerPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:projectKey/library/:folderId"
              element={
                <RequireAuth>
                  <FolderExplorerPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:projectKey/cases/:caseKey"
              element={
                <RequireAuth>
                  <CaseDetailPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:projectKey/members"
              element={
                <RequireAuth>
                  <ProjectMembersPage />
                </RequireAuth>
              }
            />
            <Route
              path="/runs/:runKey"
              element={
                <RequireAuth>
                  <RunPage />
                </RequireAuth>
              }
            />
            <Route
              path="/runs/:runKey/items/:caseKey"
              element={
                <RequireAuth>
                  <RunItemDetailPage />
                </RequireAuth>
              }
            />
            <Route
              path="/settings/people"
              element={
                <RequireAuth>
                  <PeoplePage />
                </RequireAuth>
              }
            />
            <Route
              path="/settings/roles"
              element={
                <RequireAuth>
                  <RolesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/settings/tokens"
              element={
                <RequireAuth>
                  <TokensPage />
                </RequireAuth>
              }
            />
            <Route
              path="/settings/profile"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />
            <Route
              path="*"
              element={
                <RequireAuth>
                  <p className="text-sm text-muted-foreground">Page not found.</p>
                </RequireAuth>
              }
            />
          </Routes>
        </DataRevisionProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
