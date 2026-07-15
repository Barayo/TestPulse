import type { ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ProjectSwitcher } from '@/components/ProjectSwitcher'
import { HealthBadge } from '@/components/HealthBadge'
import { useActiveProjectId } from '@/lib/useActiveProject'
import { useIsMobile } from '@/lib/useIsMobile'
import { useProjectSummaries } from '@/lib/useProjectSummaries'
import { DataRevisionProvider } from '@/lib/DataRevision'
import { AuthProvider, useAuth } from '@/lib/useAuth'
import ProjectsPage from '@/pages/ProjectsPage'
import ProjectPage from '@/pages/ProjectPage'
import SuitesPage from '@/pages/SuitesPage'
import RunsPage from '@/pages/RunsPage'
import FolderExplorerPage from '@/pages/FolderExplorerPage'
import RunPage from '@/pages/RunPage'
import LoginPage from '@/pages/LoginPage'
import UsersPage from '@/pages/UsersPage'
import TokensPage from '@/pages/TokensPage'

function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const activeProjectId = useActiveProjectId()
  const projects = useProjectSummaries()
  const { user, logout } = useAuth()
  const isMobile = useIsMobile()
  // The switcher exists to jump between projects while inside one; on the
  // project list itself it would just duplicate the page's own purpose.
  const isProjectsListPage = location.pathname === '/'

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-baseline gap-1.5 sm:gap-2">
            {/* Matches assets/brand/testpulse-icon.svg (icon tile, EKG
                stroke) and testpulse-logo-horizontal.svg (Test/Pulse color
                split) — the header brand mark previously matched neither. */}
            {/* -ml-6: a partial hanging indent — pulling the icon fully
                flush with the page content below it clipped it against the
                header's own padding, so this closes most (not all) of the
                gap between the icon's edge and the wordmark text's edge. */}
            {/* text-[32px]: Recursive Variable renders far more compact per
                font-size unit than Geist — at 24px the wordmark's rendered
                box height (29px) barely beat the 14px bold project name's
                (28px), so the "size bump" never actually produced visual
                dominance. 32px/34px was checked against real rendered box
                heights, not just the CSS number, before landing here. */}
            <Link to="/" className="-ml-6 flex shrink-0 items-center gap-1.5 text-[32px]">
              <svg
                aria-hidden="true"
                viewBox="0 0 200 200"
                className="size-[34px] shrink-0 rounded-[5px]"
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
            {!isProjectsListPage && (
              <>
                <span aria-hidden="true" className="font-mono text-sm text-muted-foreground">
                  ›
                </span>
                <ProjectSwitcher
                  projects={projects}
                  activeProjectId={activeProjectId}
                  onSelectProject={(id) => navigate(`/projects/${id}`)}
                />
              </>
            )}
          </div>
          {user && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {!isMobile && <span>{user.email}</span>}
              <Button variant="ghost" size="sm" onClick={() => void handleLogout()}>
                Log out
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
      <footer className="flex justify-center border-t px-4 py-3 sm:px-6">
        <HealthBadge />
      </footer>
    </div>
  )
}

// RequireAuth gates every non-login route on a resolved session (design
// D6/D7): while the session check is in flight it renders nothing (avoids a
// flash of protected content), then redirects to /login — preserving the
// originally requested path so LoginPage can return the user there.
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
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><ProjectsPage /></RequireAuth>} />
            <Route
              path="/projects/:projectId"
              element={
                <RequireAuth>
                  <ProjectPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:projectId/suites"
              element={
                <RequireAuth>
                  <SuitesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:projectId/runs"
              element={
                <RequireAuth>
                  <RunsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:projectId/library"
              element={
                <RequireAuth>
                  <FolderExplorerPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:projectId/library/:folderId"
              element={
                <RequireAuth>
                  <FolderExplorerPage />
                </RequireAuth>
              }
            />
            <Route
              path="/runs/:runId"
              element={
                <RequireAuth>
                  <RunPage />
                </RequireAuth>
              }
            />
            <Route
              path="/settings/users"
              element={
                <RequireAuth>
                  <UsersPage />
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
