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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            <Link to="/" className="tp-heading shrink-0 text-xl">
              TestPulse
            </Link>
            {!isProjectsListPage && (
              <ProjectSwitcher
                projects={projects}
                activeProjectId={activeProjectId}
                onSelectProject={(id) => navigate(`/projects/${id}`)}
              />
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
      <main className="px-6 py-8">{children}</main>
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
